import React, { useRef, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { SeasonCardPreview, type SeasonCardFormat } from '@/components/seasons/SeasonCardPreview';
import { useTheme } from '@/design/ThemeProvider';
import { SEASON_META } from '@/design/season';
import { READING_EXPERIENCE_LABELS } from '@/design/readingExperience';
import { journalEntryTypeLabels } from '@/design/i18n-labels';
import { useReadingSeason } from '@/features/seasons/useReadingSeason';
import {
  parseSeasonKey,
  currentSeasonKey,
  adjacentSeasonKey,
  formatSeasonLabel,
  formatSeasonHeroTitle,
} from '@/lib/season';
import type { SeasonKey } from '@/lib/season';
import { shareSeasonCardImage, saveSeasonCardImageToLibrary } from '@/lib/seasonCardFile';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { createLogger } from '@/lib/logger';
import type { JournalFeedEntry } from '@/types/journalEntry';

const log = createLogger('app/seasons');

/** Спільні опції захоплення — той самий PNG/максимальна якість, що й `CAPTURE_OPTIONS` у
 * `app/memory/[workId].tsx`; той самий знімок іде і на "Поділитися", і на "Зберегти в
 * галерею" (докладніше — коментар там-таки), тож лишається тут в одному місці. */
const CAPTURE_OPTIONS = { format: 'png', quality: 1 } as const;

const FORMAT_OPTIONS: { value: SeasonCardFormat; label: string }[] = [
  { value: '4:5', label: 'Стрічка (4:5)' },
  { value: '9:16', label: 'Історія (9:16)' },
];

const QUOTE_TOGGLE_OPTIONS: { value: 'off' | 'on'; label: string }[] = [
  { value: 'off', label: 'Без цитати' },
  { value: 'on', label: 'Додати цитату' },
];

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const RETURN_FORMS = ['повернення', 'повернення', 'повернень'] as const;
const DNF_FORMS = ['книгу', 'книги', 'книг'] as const;

/** «Книги, думки й моменти, що залишилися з тобою цього літа» (ТЗ §37) — по одному варіанту
 * роду/відмінка на сезон (родовий відмінок іменника пори року: зими/весни/літа/осені), той
 * самий "малий локальний словник форм" підхід, що й `_FORMS`-константи по всьому застосунку —
 * лише тут форми одного слова замість числівника. */
const SEASON_HERO_SUBCOPY: Record<SeasonKey['seasonId'], string> = {
  winter: 'Книги, думки й моменти, що залишилися з тобою цієї зими.',
  spring: 'Книги, думки й моменти, що залишилися з тобою цієї весни.',
  summer: 'Книги, думки й моменти, що залишилися з тобою цього літа.',
  autumn: 'Книги, думки й моменти, що залишилися з тобою цієї осені.',
};

/** "Як читалося це літо"/"цю зиму"/... (ТЗ §50) — знахідний відмінок іменника пори року,
 * той самий "малий локальний словник форм" підхід, що й `SEASON_HERO_SUBCOPY` вище. */
const READING_EXPERIENCE_TIME_PHRASE: Record<SeasonKey['seasonId'], string> = {
  winter: 'цю зиму',
  spring: 'цю весну',
  summer: 'це літо',
  autumn: 'цю осінь',
};

/** Мітка типу/категорії запису — той самий локальний хелпер, що й `feedEntryLabel` у
 * `app/journal/index.tsx` (стрічка змішує записи багатьох книг, `categoryLabel` уже
 * резолвлений прямо в SQL — навмисно НЕ спільний імпорт, `docs/SPOILER_SAFE.md` вже пояснював
 * той самий вибір для інших пар "схожих, але окремих фіч" файлів). */
function entryTypeLabel(entry: JournalFeedEntry): string {
  if (entry.categoryId && entry.categoryLabel) return entry.categoryLabel;
  return journalEntryTypeLabels[entry.type];
}

/** Один рядок "Що залишилося з тобою" — компактний, без reveal/reaction-механіки (Season лише
 * ПОКАЗУЄ вже збережене, не редагує й не фільтрує спойлери сама: `JournalRepository.listFeedPage`
 * і так уже повертає спойлер-безпечний перелік, ТЗ §33/аудит підтвердив, докладніше — коментар
 * над `useReadingSeason`). */
function SavedThoughtRow({ entry }: { entry: JournalFeedEntry }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <CoverThumbnail
        coverUrl={entry.coverUrl}
        title={entry.workTitle}
        fallbackColor={entry.coverFallbackColor}
        width={28}
        height={40}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="micro" color="accent">
          {entryTypeLabel(entry)} · {entry.workTitle}
        </AppText>
        <AppText
          variant="caption"
          color="secondary"
          numberOfLines={3}
          style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}
        >
          {entry.text}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Читацький сезон (POLYTSIA V1.6.2, #167 — READING SEASONS PRODUCT REDEFINITION,
 * `docs/READING_SEASONS.md`) — ПРОДУКТОВА РОЛЬ ЗМІНЕНА (ТЗ §35/68): не ще один
 * Statistics/Wrapped-подібний дашборд чисел, а емоційний спогад про сезон читання — "Яким було
 * твоє читання цієї пори року?" (ТЗ §36), не лише "Скільки ти прочитав?".
 *
 * Структура екрана (зверху вниз): hero (назва сезону "твого читання" + підпис), картка-спогад
 * (`SeasonCardPreview` — hero-обкладинки + 4 компактні метрики, ТЗ §37-44), перемикач
 * формату+ПРИВАТНИЙ opt-in "Додати цитату" (ТЗ §57-61), кнопки Поділитися/Зберегти, потім
 * ЕКРАННІ (ніколи не захоплені в зображення) секції особистої пам'яті: "Що залишилося з тобою"
 * (§46-48), спогад про книгу (§49), "Як читалося" (§50), повернення/перечитування (§51), серія
 * (§52), DNF (§53), і насамкінець повний перелік книг сезону (§38, з лічильником "Усі книги
 * сезону · N").
 *
 * ПРИВАТНІСТЬ (ТЗ §59-61, найкритичніша вимога цієї редефініції — аудит #167 знайшов реальний
 * баг у попередній версії: та сама картка одночасно й показувалась на екрані, й захоплювалась у
 * зображення, тож будь-яка обрана цитата автоматично потрапляла в кожен shared/saved файл без
 * жодного explicit вибору). Це виправлено АРХІТЕКТУРНО, не умовою в одному місці:
 * `SeasonCardPreview` (сама картка, той самий `View`, що і на екрані, і під `cardRef`) взагалі
 * не має доступу до приватного тексту, доки той explicitly не переданий через `personalHighlight`
 * — а це стається лише коли користувач сам вмикає "Додати цитату" нижче (`includeQuoteInCard`,
 * типово вимкнено). Розділ "Що залишилося з тобою" — окремий, ЗАВЖДИ поза `cardRef`, ніколи не
 * потрапляє в зображення, а на самому екрані лишається вільно видимим (ТЗ §61: "Normal Season
 * screen може показувати private local entries").
 */
export default function ReadingSeasonScreen() {
  const theme = useTheme();
  const { seasonKey: seasonKeyParam } = useLocalSearchParams<{ seasonKey: string }>();
  const [key, setKey] = useState<SeasonKey>(
    () => parseSeasonKey(seasonKeyParam) ?? currentSeasonKey(new Date()),
  );
  const { data, isLoading } = useReadingSeason(key.seasonId, key.year);
  const meta = SEASON_META[key.seasonId];
  const seasonLabel = formatSeasonLabel(key.seasonId, key.year);

  const [cardFormat, setCardFormat] = useState<SeasonCardFormat>('4:5');
  // ПРИВАТНІСТЬ — типово вимкнено (ТЗ §60/61: "Ніколи автоматично не включай private journal
  // text у share export" / "Default export: covers + safe derived metrics"). Скидається щоразу
  // заново при вході на екран — той самий "не персистується" підхід, що й `spoilerRevealed` у
  // `app/recall/[workId].tsx`/`app/memory/[workId].tsx` (POLYTSIA V1.6.2, #166).
  const [includeQuoteInCard, setIncludeQuoteInCard] = useState<'off' | 'on'>('off');
  // Реф на саму картку для захоплення в зображення — той самий `collapsable={false}`
  // застережник для Android, що й `cardRef` у `app/memory/[workId].tsx` (без нього нативна
  // оптимізація дерева view може "сплющити"/прибрати цей вузол).
  const cardRef = useRef<View>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const shareCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return shareSeasonCardImage(uri);
    },
    onSuccess: (shared) => {
      setStatusMessage(shared ? null : 'Системне "Поділитися" тут недоступне.');
    },
    onError: (error) => {
      log.error('Не вдалося поділитися карткою сезону', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося поділитися карткою. Спробуй ще раз.');
    },
  });

  const saveCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return saveSeasonCardImageToLibrary(uri);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'saved') {
        setStatusMessage('Картку збережено в галерею.');
        return;
      }
      setPermissionError(
        outcome.canAskAgain
          ? 'Немає дозволу зберегти в галерею.'
          : 'Доступ до збереження фото відхилено назавжди — увімкни дозвіл для «Полиці» в налаштуваннях пристрою.',
      );
      setPermissionBlocked(!outcome.canAskAgain);
    },
    onError: (error) => {
      log.error('Не вдалося зберегти картку сезону в галерею', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося зберегти картку. Спробуй ще раз.');
    },
  });

  const handleShare = () => {
    if (shareCard.isPending || saveCard.isPending) return;
    setStatusMessage(null);
    setPermissionError(null);
    setPermissionBlocked(false);
    shareCard.mutate();
  };

  const handleSave = () => {
    if (shareCard.isPending || saveCard.isPending) return;
    setStatusMessage(null);
    setPermissionError(null);
    setPermissionBlocked(false);
    saveCard.mutate();
  };

  const goToAdjacent = (direction: 'prev' | 'next') => {
    setKey((current) => adjacentSeasonKey(current, direction));
  };

  const isEmpty = !data || (data.uniqueBooksCount === 0 && data.totalMinutes === 0);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: seasonLabel,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.lg,
          }}
        >
          <Pressable
            onPress={() => goToAdjacent('prev')}
            accessibilityRole="button"
            accessibilityLabel="Попередній сезон"
            hitSlop={8}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name={meta.icon} size={20} color={theme.colors.accent} />
            <AppText variant="title">{seasonLabel}</AppText>
          </View>
          <Pressable
            onPress={() => goToAdjacent('next')}
            accessibilityRole="button"
            accessibilityLabel="Наступний сезон"
            hitSlop={8}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : isEmpty ? (
          <EmptyState
            title={`Немає даних за сезон «${seasonLabel}»`}
            description="Читай книги протягом сезону, щоб побачити тут підсумок."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            {/* SEASON HERO (ТЗ §36/37) — емоційна рамка, окремо від короткого навігаційного
                заголовка вище: "Х твого читання" + підпис "яким було читання", не "скільки". */}
            <View style={{ gap: 4 }}>
              <AppText variant="title">{formatSeasonHeroTitle(key.seasonId)}</AppText>
              <AppText variant="body" color="secondary">
                {SEASON_HERO_SUBCOPY[key.seasonId]}
              </AppText>
            </View>

            <View ref={cardRef} collapsable={false}>
              <SeasonCardPreview
                format={cardFormat}
                data={data}
                personalHighlight={includeQuoteInCard === 'on' ? data.favoriteQuote : null}
              />
            </View>

            <Card style={{ gap: theme.spacing.sm }}>
              <ChipSelect label="Формат картки" options={FORMAT_OPTIONS} value={cardFormat} onChange={setCardFormat} />
              {data.favoriteQuote ? (
                <ChipSelect
                  label="Цитата на картці"
                  options={QUOTE_TOGGLE_OPTIONS}
                  value={includeQuoteInCard}
                  onChange={setIncludeQuoteInCard}
                />
              ) : null}
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label={shareCard.isPending ? 'Готую зображення…' : 'Поділитися'}
                onPress={handleShare}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              <Button
                label={saveCard.isPending ? 'Зберігаю…' : 'Зберегти картку'}
                variant="secondary"
                onPress={handleSave}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              {statusMessage ? (
                <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                  {statusMessage}
                </AppText>
              ) : null}
              {permissionError ? (
                <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                  {permissionError}
                </AppText>
              ) : null}
              {permissionBlocked ? (
                <Button
                  label="Відкрити налаштування пристрою"
                  variant="secondary"
                  onPress={() => Linking.openSettings()}
                />
              ) : null}
            </View>

            {/* ТЗ §46/47 — "Що залишилося з тобою": ЕКРАННА секція, ніколи не захоплюється в
                зображення (поза `cardRef` вище) — той самий поділ "нормальний екран/export", що
                й ПРИВАТНІСТЬ-коментар над компонентом пояснює. */}
            {data.savedThoughts.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Що залишилося з тобою</AppText>
                <View style={{ gap: theme.spacing.md }}>
                  {data.savedThoughts.map((entry) => (
                    <SavedThoughtRow key={entry.id} entry={entry} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* ТЗ §49 — короткий preview reflection ОДНІЄЇ книги сезону, що має Book Memory.
                `data.bookMemoryPreview!` — той самий "перевірено умовою вище, TS цього не бачить
                у closure" non-null assertion, що й `data.seriesContext!` на `app/work/[workId].tsx`. */}
            {data.bookMemoryPreview ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/memory/[workId]',
                    params: { workId: data.bookMemoryPreview!.userBook.work.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Спогад про книгу «${data.bookMemoryPreview.userBook.work.title}»`}
              >
                <Card style={{ gap: theme.spacing.xs }}>
                  <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                    Спогад про книгу «{data.bookMemoryPreview.userBook.work.title}»
                  </AppText>
                  <AppText variant="body" numberOfLines={4} style={{ fontStyle: 'italic' }}>
                    {data.bookMemoryPreview.reflection}
                  </AppText>
                </Card>
              </Pressable>
            ) : null}

            {/* ТЗ §50 — "Як читалося" (опційно, лише за достатньої вибірки — див.
                `computeDominantReadingExperience`). */}
            {data.dominantReadingExperience ? (
              <AppText variant="body" color="secondary">
                Як читалося {READING_EXPERIENCE_TIME_PHRASE[key.seasonId]}:{' '}
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  {READING_EXPERIENCE_LABELS[data.dominantReadingExperience]}
                </AppText>
              </AppText>
            ) : null}

            {/* ТЗ §51 — "Повернення цього сезону" (перечитані книги). */}
            {data.rereadBooks.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Повернення цього сезону</AppText>
                <AppText variant="body" color="secondary">
                  Цього сезону ти повернувся до {pluralizeUk(data.rereadBooks.length, RETURN_FORMS)} знайомих історій.
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {data.rereadBooks.map((ub) => (
                    <Pressable
                      key={ub.id}
                      onPress={() => router.push({ pathname: '/reread-comparison/[workId]', params: { workId: ub.work.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={`Перечитано: ${ub.work.title}`}
                    >
                      <CoverThumbnail
                        coverUrl={ub.edition.coverUrl}
                        title={ub.work.title}
                        fallbackColor={ub.work.coverFallbackColor}
                        width={48}
                        height={70}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* ТЗ §52 — серія, якщо ≥2 книги сезону належать одній. */}
            {data.seasonSeries ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/series/[seriesId]', params: { seriesId: data.seasonSeries!.series.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={`Серія «${data.seasonSeries.series.name}»`}
              >
                <Card>
                  <AppText variant="body" color="secondary">
                    Цього сезону ти продовжив серію «{data.seasonSeries.series.name}» (
                    {pluralizeUk(data.seasonSeries.books.length, BOOK_FORMS)}).
                  </AppText>
                </Card>
              </Pressable>
            ) : null}

            {/* ТЗ §53 — DNF: нейтральна, не засуджувальна форма, НЕ рахується в "прочитано". */}
            {data.dnfCount > 0 ? (
              <AppText variant="caption" color="tertiary">
                {data.dnfCount} {pluralizeUk(data.dnfCount, DNF_FORMS)} ти вирішив не продовжувати.
              </AppText>
            ) : null}

            {/* ТЗ §38 — повний перелік книг сезону, з лічильником у заголовку ("Усі книги
                сезону · N"), окремо від компактного hero-стеку в картці вище. */}
            {data.books.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Усі книги сезону · {data.uniqueBooksCount}</AppText>
                {data.books.map((ub) => (
                  <Pressable
                    key={ub.id}
                    onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: ub.work.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={ub.work.title}
                  >
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                      <CoverThumbnail
                        coverUrl={ub.edition.coverUrl}
                        title={ub.work.title}
                        fallbackColor={ub.work.coverFallbackColor}
                        width={32}
                        height={46}
                      />
                      <View style={{ flex: 1 }}>
                        <AppText variant="body">{ub.work.title}</AppText>
                        {ub.work.authors.length > 0 ? (
                          <AppText variant="caption" color="secondary">
                            {ub.work.authors.map((a) => a.name).join(', ')}
                          </AppText>
                        ) : null}
                      </View>
                      {data.rereadBooks.some((reread) => reread.id === ub.id) ? (
                        <AppText variant="micro" color="accent">
                          Перечитано
                        </AppText>
                      ) : null}
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
