import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { getDatabase } from '@/data/db';
import { EditionRepository } from '@/data/repositories/EditionRepository';
import { isValidIsbn } from '@/lib/isbn';
import {
  GoogleBooksProvider,
  ISBNdbProvider,
  SharedCatalogProvider,
  isLikelyUkrainianBook,
} from '@/data/providers';
import type { BookMetadataProvider, RawProviderBook } from '@/data/providers';
import { useImportDraftStore } from '@/stores/importDraftStore';

type ScanStatus = 'scanning' | 'looking_up' | 'not_found' | 'invalid';

/**
 * Провайдери в порядку спроби (Milestone 10 fix6 — Open Library прибрано з пошуку зовсім,
 * `docs/STATUS_V1.md`): Google Books (без квоти на запит) → ISBNdb (лише якщо `isEnabled`,
 * тобто є платний ключ користувача — навмисно останньою, платний запит лише коли безкоштовне
 * джерело не впоралось).
 */
function activeProviders(): BookMetadataProvider[] {
  return [GoogleBooksProvider, ...(ISBNdbProvider.isEnabled ? [ISBNdbProvider] : [])];
}

/**
 * Точний `lookupByISBN`, а якщо він пустий — резервний текстовий пошук самим ISBN як
 * запитом. Реальна знахідка з тестування: той самий провайдер інколи НЕ знаходить видання
 * через власний спеціалізований `isbn:`-лукап (індекс за точним ISBN у нього неповний), хоча
 * те саме видання спокійно знаходиться звичайним текстовим пошуком за назвою — і навпаки.
 * Беремо з результатів пошуку лише той, чий власний isbn10/isbn13 справді збігається зі
 * сканованим — щоб не підхопити випадковий збіг за ключовими словами замість потрібної книги.
 *
 * Українська мовна політика (`src/data/providers/ukrainianFilter.ts`) навмисно застосована
 * ТІЛЬКИ до резервного текстового пошуку, не до точного `lookupByISBN`: точний лукап
 * повертає саме те видання, чий штрихкод користувач щойно відсканував з паперової книги в
 * руках — відкидати цей результат за мовною міткою немає сенсу (якщо мітка бреше, як у
 * реальному прикладі з ISBNdb, користувач все одно виправить її на екрані підтвердження
 * імпорту). А от у резервному текстовому пошуку кілька видань можуть претендувати на
 * збіг ISBN-як-тексту — тут фільтр захищає від випадкового підхоплення нерелевантного
 * іншомовного видання.
 */
async function findByIsbnWithFallback(provider: BookMetadataProvider, isbn: string): Promise<RawProviderBook | null> {
  const exact = await provider.lookupByISBN(isbn);
  if (exact) return exact;
  const results = await provider.searchBooks(isbn);
  const isbnMatches = results.filter((book) => book.isbn10 === isbn || book.isbn13 === isbn);
  return isbnMatches.find(isLikelyUkrainianBook) ?? isbnMatches[0] ?? null;
}

/**
 * Сканування ISBN камерою (п.21 ТЗ, docs/BOOK_PROVIDERS.md — "ISBN-flow"): 1) локальна база
 * (книга вже могла бути додана раніше) → 2) спільний каталог за точним ISBN (Milestone 8.2,
 * `SharedCatalogProvider` — якщо цей ISBN уже підтверджував будь-хто інший, результат
 * приходить із власного Supabase, дешевше й швидше за будь-якого зовнішнього провайдера, і
 * не витрачає жоден ліміт) → 3) якщо там немає, по черзі кожен провайдер з
 * `activeProviders()` (точний лукап + текстовий пошук-фолбек, `findByIsbnWithFallback`) →
 * 4) якщо ніде не знайдено, ручне додавання з попередньо заповненим ISBN
 * (`app/work/new.tsx?isbn=...`) або кнопка швидкого пошуку в Google. Кроки 2-3 НІКОЛИ не
 * зберігають знахідку одразу — ведуть на `/import/review`, де користувач підтверджує чи
 * виправляє дані (docs/BOOK_PROVIDERS.md, "перегляд перед збереженням — без винятків").
 */
export default function IsbnScanScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<ScanStatus>('scanning');
  const [scannedIsbn, setScannedIsbn] = useState<string | null>(null);
  const processingRef = useRef(false);

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    if (processingRef.current) return;
    const isbn = result.data.trim();
    // Задовга/закоротка знахідка навіть на довжину не схожа на ISBN-10/13 — це, найімовірніше,
    // штрихкод іншого типу товару в кадрі, не помилка сканування книги; тихо ігноруємо, як і
    // раніше, чекаючи, поки в кадр потрапить справжній ISBN.
    if (isbn.length < 10 || isbn.length > 17) return;

    // Контрольна цифра ISBN-10/13 (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.3) — до цього
    // єдиною перевіркою була довжина, тож пошкоджений скан (погане освітлення, нечіткий
    // штрихкод) з правильною довжиною, але хибною контрольною цифрою, ішов аж до платного
    // запиту ISBNdb і повертав заплутане "не знайдено" замість зрозумілого "спробуй ще раз".
    if (!isValidIsbn(isbn)) {
      processingRef.current = true;
      setScannedIsbn(isbn);
      setStatus('invalid');
      return;
    }

    processingRef.current = true;
    setScannedIsbn(isbn);
    setStatus('looking_up');

    try {
      const db = await getDatabase();
      const localEdition = await EditionRepository.getByIsbn(db, isbn);
      if (localEdition) {
        router.replace({ pathname: '/work/[workId]', params: { workId: localEdition.workId } });
        return;
      }

      const catalogBook = await SharedCatalogProvider.lookupByISBN(isbn);
      if (catalogBook) {
        useImportDraftStore.getState().setPending(SharedCatalogProvider.id, catalogBook);
        router.replace('/import/review');
        return;
      }

      for (const provider of activeProviders()) {
        const book = await findByIsbnWithFallback(provider, isbn);
        if (book) {
          useImportDraftStore.getState().setPending(provider.id, book);
          router.replace('/import/review');
          return;
        }
      }

      setStatus('not_found');
    } catch {
      // Провайдери самі ловлять мережеві помилки й повертають null (degradation-safe) —
      // сюди потрапляємо лише за неочікуваного винятку (наприклад, локальна БД недоступна).
      setStatus('not_found');
    }
  }, []);

  const handleRetry = () => {
    processingRef.current = false;
    setScannedIsbn(null);
    setStatus('scanning');
  };

  const handleManualFallback = () => {
    router.replace({ pathname: '/work/new', params: scannedIsbn ? { isbn: scannedIsbn } : {} });
  };

  /**
   * Жоден з наших провайдерів не знайшов книгу — але звичайний пошук Google (веб-пошук, а
   * не Google Books) часто одразу показує сторінки книгарень (Rozetka, Yakaboo, Prom) з
   * повною інформацією, бо індексує весь інтернет, а не лише власну базу книг (реальний
   * приклад з тестування). Ми не можемо автоматично витягнути ці дані — жоден з цих сайтів
   * не дає офіційного API, а обхід цього застосунок принципово не робить
   * (docs/BOOK_PROVIDERS.md, "хard rule, без винятків"). Але відкрити той самий пошук у
   * браузері одним тапом і дати користувачу самому скопіювати дані в форму — чесний,
   * дозволений спосіб суттєво пришвидшити ручне додавання для таких випадків.
   */
  const handleSearchOnWeb = () => {
    if (!scannedIsbn) return;
    Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`ISBN ${scannedIsbn}`)}`);
  };

  const screen = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Сканування ISBN',
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
      }}
    />
  );

  if (!permission) {
    return (
      <>
        {screen}
        <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
          <AppText variant="body" color="secondary">
            Перевіряю дозвіл на камеру…
          </AppText>
        </View>
      </>
    );
  }

  if (!permission.granted) {
    // `canAskAgain === false` (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.6) — користувач уже
    // НАЗАВЖДИ відхилив дозвіл (iOS: одна відмова; Android: "не питати знову"). У цьому стані
    // `requestPermission()` більше не показує системний діалог узагалі — тихо повертається з
    // тим самим `granted: false`, тож повторний тап на ту саму кнопку виглядав би так, ніби
    // застосунок просто ігнорує натискання. Єдиний робочий шлях — системні налаштування
    // пристрою (`Linking.openSettings()`), тому кнопка й напис тут інші, лише в цьому стані.
    const canAskAgain = permission.canAskAgain;
    return (
      <>
        {screen}
        <View style={[styles.center, { backgroundColor: theme.colors.bg, padding: theme.spacing.xl }]}>
          <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}>
            {canAskAgain
              ? 'Щоб сканувати штрихкод ISBN, дозволь застосунку доступ до камери. Камера використовується лише для сканування — нічого не записується й не надсилається.'
              : 'Доступ до камери відхилено. Щоб сканувати штрихкод ISBN, увімкни дозвіл на камеру для «Полиці» в налаштуваннях пристрою.'}
          </AppText>
          {canAskAgain ? (
            <Button label="Дозволити доступ до камери" onPress={requestPermission} />
          ) : (
            <Button label="Відкрити налаштування пристрою" onPress={() => Linking.openSettings()} />
          )}
        </View>
      </>
    );
  }

  return (
    <>
      {screen}
      <View style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
        {status === 'scanning' ? (
          <CameraView
            style={styles.flex}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : null}

        {status === 'scanning' ? (
          <View pointerEvents="none" style={styles.overlay}>
            <AppText variant="body" color="onAccent" style={{ textAlign: 'center' }}>
              Наведи камеру на штрихкод ISBN на звороті книги
            </AppText>
          </View>
        ) : null}

        {status === 'looking_up' ? (
          <View style={styles.center}>
            <AppText variant="body" color="secondary">
              Шукаю книгу за ISBN {scannedIsbn}…
            </AppText>
          </View>
        ) : null}

        {status === 'invalid' ? (
          <View style={[styles.center, { padding: theme.spacing.xl, gap: theme.spacing.md }]}>
            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Це не схоже на коректний ISBN — контрольна цифра не збігається. Ймовірно,
              штрихкод зчитався неточно (погане освітлення, кут камери). Спробуй ще раз, або
              введи ISBN вручну.
            </AppText>
            <Button label="Спробувати сканувати ще раз" onPress={handleRetry} />
            <Button label="Додати вручну" variant="secondary" onPress={handleManualFallback} />
          </View>
        ) : null}

        {status === 'not_found' ? (
          <View style={[styles.center, { padding: theme.spacing.xl, gap: theme.spacing.md }]}>
            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Нічого не знайдено ні в твоєму каталозі
              {SharedCatalogProvider.isEnabled ? ', ні в спільній базі застосунку' : ''}, ні в
              Google Books{ISBNdbProvider.isEnabled ? ', ні в ISBNdb' : ''} за ISBN {scannedIsbn}.
              Наші джерела не мають цієї книги, але звичайний пошук в
              інтернеті часто знаходить її на сторінках книгарень — глянь і скопіюй дані вручну.
            </AppText>
            <Button label="Шукати в Google" onPress={handleSearchOnWeb} />
            <Button label="Додати вручну" variant="secondary" onPress={handleManualFallback} />
            <Button label="Спробувати сканувати ще раз" variant="secondary" onPress={handleRetry} />
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 32,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});
