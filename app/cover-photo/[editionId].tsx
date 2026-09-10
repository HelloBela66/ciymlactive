import React, { useState } from 'react';
import { View, Linking } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { getDatabase } from '@/data/db';
import { EditionRepository } from '@/data/repositories/EditionRepository';
import { WorkRepository } from '@/data/repositories/WorkRepository';
import { persistCoverPhoto } from '@/lib/coverPhotoStorage';
import { uploadCoverImage } from '@/data/remote/coverStorageClient';
import { publishCoverToSharedCatalog } from '@/data/remote/catalogSync';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';

const log = createLogger('app/cover-photo');

/**
 * Обкладинка книги рендериться не лише в Бібліотеці/Book Details (`queryKeys.works.all`/
 * `queryKeys.userBooks.all`), а й на Полицях, у денному перегляді Календаря та у Wrapped —
 * кожен зі своїх власних ключів React Query. Спочатку інвалідовувались лише перші два —
 * решта екранів показували б стару плашку-заглушку, доки їхній власний `staleTime` не спливе
 * сам. `['calendar']`/`['wrapped']` без додаткових сегментів — навмисно голі префікси (той
 * самий прийом, що й `queryKeys.genres.all`/`wrapped`-інвалідація в Milestone 9): знімає кеш
 * УСІХ параметризованих під-ключів (`calendar.month(...)`, `calendar.day(...)`,
 * `wrapped.year(...)`) одразу, а не лише того місяця/року, що зараз відкритий.
 */
function invalidateCoverDependentQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.userBooks.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
  queryClient.invalidateQueries({ queryKey: ['calendar'] });
  queryClient.invalidateQueries({ queryKey: ['wrapped'] });
}

/** Мінімум даних про видання й твір, потрібний для збереження фото й (за наявності
 * Supabase) публікації в спільний каталог — окремий легкий запит, а не переносити сюди
 * `useBookDetails` цілком (той тягне серію/полиці/усе інше, тут не потрібне). */
function useCoverPhotoTarget(editionId: string | undefined) {
  return useQuery({
    queryKey: ['coverPhotoTarget', editionId ?? ''],
    queryFn: async () => {
      if (!editionId) return null;
      const db = await getDatabase();
      const edition = await EditionRepository.getByIdWithRelations(db, editionId);
      if (!edition) return null;
      const work = await WorkRepository.getByIdWithAuthors(db, edition.workId);
      if (!work) return null;
      return { edition, work };
    },
    enabled: !!editionId,
  });
}

/**
 * "Додати/Змінити обкладинку" (Milestone 10, з fix4 — доступно ЗАВЖДИ з Book Details, не
 * лише коли обкладинки немає: пряме прохання користувача, дехто захоче замінити навіть уже
 * наявну обкладинку власним фото). Фото — камерою або з галереї (`expo-image-picker`, єдиний
 * плагін цього екрана; сканування ISBN використовує окремий `expo-camera`, тут повноцінна
 * камера-preview не потрібна — досить системного UI пікера). Локальне збереження
 * (`persistCoverPhoto`) відбувається одразу й синхронно — працює повністю офлайн; фонове
 * завантаження в Supabase Storage й публікація в спільний каталог
 * (`coverStorageClient.ts`/`catalogSync.ts`) — best-effort, не блокує UI й не може зіпсувати
 * те, що користувач уже бачить у своїй бібліотеці.
 */
export default function CoverPhotoScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { editionId } = useLocalSearchParams<{ editionId: string }>();
  const target = useCoverPhotoTarget(editionId);
  const hasExistingCover = !!target.data?.edition.coverUrl;

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  // `true`, коли дозвіл відхилено НАЗАВЖДИ (`canAskAgain: false`) — Milestone 10 fix6,
  // `docs/STATUS_V1.md` п. 3.6. До цього тут був лише текст-підказка "дозволь у
  // налаштуваннях" без самої кнопки/посилання туди — людині доводилось самій згадувати, як
  // саме дістатись потрібного екрана в системних налаштуваннях. `false`/скинуто перед кожною
  // новою спробою — якщо людина вже відкривала налаштування й повернулась, наступний тап
  // повторно перевіряє реальний стан дозволу, а не лишає стару кнопку "Відкрити налаштування".
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (sourceUri: string) => {
      const persistedUri = await persistCoverPhoto(sourceUri, editionId);
      const db = await getDatabase();
      await EditionRepository.setCoverUrl(db, editionId, persistedUri);
      return persistedUri;
    },
    onSuccess: (persistedUri) => {
      invalidateCoverDependentQueries(queryClient);

      const loaded = target.data;
      if (loaded) {
        // Фонове, fire-and-forget: локальна обкладинка вже збережена й видима користувачу
        // (invalidateQueries вище) НЕЗАЛЕЖНО від того, чи є Supabase, чи вдасться мережевий
        // запит — той самий принцип, що й решта спільного каталогу (docs/SHARED_CATALOG.md).
        void (async () => {
          try {
            // POLYTSIA V1.5 Фаза 1.2 (docs/SECURITY.md): шлях об'єкта в bucket більше НЕ
            // будується тут — `cover-upload` Edge Function генерує його сама на сервері
            // (`crypto.randomUUID()`), навмисно без жодного клієнтського рядка.
            const remoteUrl = await uploadCoverImage(persistedUri);
            if (!remoteUrl) return;

            const db = await getDatabase();
            await EditionRepository.setCoverUrl(db, editionId, remoteUrl);
            invalidateCoverDependentQueries(queryClient);

            await publishCoverToSharedCatalog({
              isbn13: loaded.edition.isbn13,
              isbn10: loaded.edition.isbn10,
              coverUrl: remoteUrl,
              title: loaded.work.title,
              authors: loaded.work.authors.map((a) => a.name),
              publisher: loaded.edition.publisher?.name ?? null,
              publicationYear: loaded.edition.publicationYear,
              pageCount: loaded.edition.pageCount,
              language: loaded.edition.language,
              description: loaded.work.description,
            });
          } catch (error) {
            log.warn('Не вдалося синхронізувати обкладинку зі спільним каталогом', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      }

      router.back();
    },
    onError: (error) => {
      log.error('Не вдалося зберегти обкладинку', { error: error instanceof Error ? error.message : String(error) });
    },
  });

  const handleTakePhoto = async () => {
    setPermissionError(null);
    setPermissionBlocked(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionError(
        permission.canAskAgain
          ? 'Немає дозволу на камеру.'
          : 'Доступ до камери відхилено назавжди — увімкни дозвіл для «Полиці» в налаштуваннях пристрою.',
      );
      setPermissionBlocked(!permission.canAskAgain);
      return;
    }
    // `allowsEditing` навмисно ВИМКНЕНО (Milestone 10 fix5) — рамка вбудованого системного
    // кроп-інструменту iOS ("Move and Scale") ФІКСОВАНОГО розміру й не розтягується
    // користувачем узагалі (можна лише масштабувати/пересувати ФОТО під нею) — це обмеження
    // самої iOS, не параметра `aspect` (той лише міняв ПРОПОРЦІЇ тієї ж фіксованої рамки, тому
    // прибирання лише `aspect` у fix4 не допомогло). Тепер фото береться як є, без обрізання
    // на цьому кроці — `contentFit="cover"` у самому застосунку однаково акуратно вписує
    // будь-яке зображення під потрібний розмір під час показу, тож користувачу більше не
    // потрібно нічого підганяти вручну.
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    const asset = !result.canceled ? result.assets?.[0] : null;
    if (asset) setLocalUri(asset.uri);
  };

  const handlePickFromGallery = async () => {
    setPermissionError(null);
    setPermissionBlocked(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionError(
        permission.canAskAgain
          ? 'Немає дозволу на фотографії.'
          : 'Доступ до фотографій відхилено назавжди — увімкни дозвіл для «Полиці» в налаштуваннях пристрою.',
      );
      setPermissionBlocked(!permission.canAskAgain);
      return;
    }
    // Без `allowsEditing` — той самий фікс, що й для камери вище.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const asset = !result.canceled ? result.assets?.[0] : null;
    if (asset) setLocalUri(asset.uri);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: hasExistingCover ? 'Змінити обкладинку' : 'Додати обкладинку',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {!editionId || (!target.isLoading && !target.data) ? (
          <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginTop: theme.spacing.xxl }}>
            Книгу не знайдено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            {localUri ? (
              <Card style={{ gap: theme.spacing.md, alignItems: 'center' }}>
                <Image
                  source={{ uri: localUri }}
                  style={{ width: 180, height: 264, borderRadius: theme.radius.md, backgroundColor: theme.colors.border }}
                  contentFit="cover"
                />
                <Button
                  label={saveMutation.isPending ? 'Зберігаю…' : 'Використати цю обкладинку'}
                  onPress={() => saveMutation.mutate(localUri)}
                  disabled={saveMutation.isPending}
                  style={{ width: '100%' }}
                />
                <Button
                  label="Спробувати ще раз"
                  variant="secondary"
                  onPress={() => setLocalUri(null)}
                  disabled={saveMutation.isPending}
                  style={{ width: '100%' }}
                />
                {saveMutation.isError ? (
                  <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                    Не вдалося зберегти обкладинку. Спробуй ще раз.
                  </AppText>
                ) : null}
              </Card>
            ) : (
              <Card style={{ gap: theme.spacing.sm }}>
                {hasExistingCover && target.data ? (
                  <View style={{ alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
                    <AppText variant="caption" color="secondary">
                      Поточна обкладинка
                    </AppText>
                    <CoverThumbnail
                      coverUrl={target.data.edition.coverUrl}
                      title={target.data.work.title}
                      fallbackColor={target.data.work.coverFallbackColor}
                      width={96}
                      height={141}
                      borderRadius={theme.radius.md}
                    />
                  </View>
                ) : null}
                <AppText variant="heading">
                  {hasExistingCover ? 'Заміни обкладинку своїм фото' : 'Сфотографуй обкладинку'}
                </AppText>
                <AppText variant="body" color="secondary">
                  {target.data ? `«${target.data.work.title}»` : 'Ця книга'}
                  {hasExistingCover
                    ? ' — заміни показану вище обкладинку власним фото, якщо хочеш.'
                    : ' — обкладинку не знайдено серед доступних джерел.'}{' '}
                  Наведи камеру на обкладинку книги в руках, або обери вже готове фото з
                  галереї. Знімок одразу з&apos;явиться в тебе в бібліотеці
                  {hasExistingCover ? ', замінивши поточну' : ''}, а якщо налаштовано спільний
                  каталог книг — допоможе й іншим людям швидше впізнати цю книгу в пошуку.
                </AppText>
                <Button label="Зробити фото" onPress={handleTakePhoto} />
                <Button label="Обрати з галереї" variant="secondary" onPress={handlePickFromGallery} />
                {permissionError ? (
                  <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                    {permissionError}
                  </AppText>
                ) : null}
                {permissionBlocked ? (
                  <Button label="Відкрити налаштування пристрою" variant="secondary" onPress={() => Linking.openSettings()} />
                ) : null}
              </Card>
            )}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
