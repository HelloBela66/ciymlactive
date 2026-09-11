import React, { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { StarRating } from '@/components/ui/StarRating';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { NoteCategoryPicker, type NoteCategoryValue } from '@/components/session/NoteCategoryPicker';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useAddToLibrary } from '@/features/library/useAddToLibrary';
import { useToggleFavorite, useUpdateUserBookStatus, useRemoveFromLibrary } from '@/features/library/useUpdateUserBook';
import { useShelfIdsForUserBook, useShelves, useToggleShelfBook } from '@/features/library/useShelves';
import { useMarkOwned, useUnmarkOwned } from '@/features/owned-library/useOwnedBook';
import { useActiveSession } from '@/features/reading-session/useActiveSession';
import { useStartSession } from '@/features/reading-session/useSessionMutations';
import { useReadingHistory } from '@/features/reading-session/useReadingHistory';
import { useRating, useSetRating, useRemoveRating } from '@/features/book-details/useRating';
import {
  usePreReadingReflection,
  useSavePreReadingReflection,
  useRemovePreReadingReflection,
} from '@/features/memory/usePreReadingReflection';
import { canEditPreReadingReflection } from '@/lib/beforeAfter';
import { computeStaleReadingInfo, describeStaleReading } from '@/lib/staleReading';
import { useLoreEntities } from '@/features/lore/useLoreEntities';
import { useAllGenres, useGenresForWork, useToggleWorkGenre, useAddCustomGenre } from '@/features/book-details/useGenres';
import { useTagsForWork, useAddTagToWork, useRemoveTagFromWork } from '@/features/book-details/useTags';
import { useCreateNote, useRemoveNote } from '@/features/notes/useNotes';
import { useCreateQuote, useRemoveQuote } from '@/features/quotes/useQuotes';
import {
  useJournalEntries,
  useJournalCount,
  useToggleJournalFavorite,
  useToggleJournalRevisitLater,
  useSetJournalReaction,
} from '@/features/journal/useJournal';
import { ReactionToggle } from '@/components/journal/ReactionPicker';
import { RevisitLaterToggle } from '@/components/journal/RevisitLaterToggle';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { formatDuration } from '@/lib/sessionTiming';
import { computeRollingPace } from '@/lib/readingPace';
import { predictFinish } from '@/lib/finishPrediction';
import { editionFormatLabels, userBookStatusLabels } from '@/design/i18n-labels';
import type { EditionWithRelations } from '@/types/edition';
import type { UserBook, UserBookStatus } from '@/types/userBook';
import type { OwnedBook } from '@/types/ownedBook';
import type { JournalEntry, JournalEntryKind } from '@/types/journalEntry';
import type { ReadingSession } from '@/types/readingSession';

const JOURNAL_KIND_OPTIONS: { value: JournalEntryKind; label: string }[] = [
  { value: 'note', label: 'Нотатка' },
  { value: 'quote', label: 'Цитата' },
];

const STATUS_OPTIONS = (Object.keys(userBookStatusLabels) as UserBookStatus[]).map((value) => ({
  value,
  label: userBookStatusLabels[value],
}));

/** `''`/пробіли/сміття — усі рівнозначно "сторінку не вказано" (той самий підхід, що й
 * `parseOptionalPage` у `app/session/[sessionId].tsx`/`parseOptionalInt` у `app/work/new.tsx`). */
function parseOptionalPage(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function EditionCard({ edition }: { edition: EditionWithRelations }) {
  const theme = useTheme();
  const rows: [string, string][] = [];

  if (edition.publisher) rows.push(['Видавництво', edition.publisher.name]);
  if (edition.publicationYear) rows.push(['Рік видання', String(edition.publicationYear)]);
  if (edition.isbn13) rows.push(['ISBN', edition.isbn13]);
  else if (edition.isbn10) rows.push(['ISBN', edition.isbn10]);
  if (edition.translators.length > 0) {
    rows.push(['Переклад', edition.translators.map((t) => t.name).join(', ')]);
  }
  rows.push(['Мова', edition.language]);
  if (edition.pageCount) rows.push(['Сторінок', String(edition.pageCount)]);
  rows.push(['Формат', editionFormatLabels[edition.format]]);

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <AppText variant="caption" color="tertiary">
            {label}
          </AppText>
          <AppText variant="body" style={{ flexShrink: 1, textAlign: 'right' }}>
            {value}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

/**
 * Жанри й теги (Milestone 9) — на рівні Work (каталог), а не UserBook: доступні й для книг,
 * які ще не додано до бібліотеки (`docs/DATABASE.md`: "Work *---* Genre", "Work/Edition
 * *---* Tag"), на відміну від полиць/оцінки/нотаток нижче, які прив'язані саме до
 * "моєї бібліотеки". Жанр — куратований список (чипи-перемикачі + "додати свій"), тег —
 * вільний користувацький ярлик (додається/прибирається текстом, без кольорових плашок —
 * навмисно нейтральна палітра застосунку, `docs/ARCHITECTURE.md` розділ 6).
 */
function GenreTagsSection({ workId }: { workId: string }) {
  const theme = useTheme();
  const { data: allGenres } = useAllGenres();
  const { data: workGenres } = useGenresForWork(workId);
  const toggleGenre = useToggleWorkGenre();
  const addCustomGenre = useAddCustomGenre();
  const { data: tags } = useTagsForWork(workId);
  const addTag = useAddTagToWork();
  const removeTag = useRemoveTagFromWork();

  const [showGenreInput, setShowGenreInput] = useState(false);
  const [genreInput, setGenreInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const linkedGenreIds = new Set((workGenres ?? []).map((g) => g.id));

  const handleAddCustomGenre = async () => {
    const trimmed = genreInput.trim();
    if (!trimmed) return;
    await addCustomGenre.mutateAsync({ workId, name: trimmed });
    setGenreInput('');
    setShowGenreInput(false);
  };

  const handleAddTag = async () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    await addTag.mutateAsync({ workId, name: trimmed });
    setTagInput('');
    setShowTagInput(false);
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <AppText variant="heading">Жанри</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {(allGenres ?? []).map((genre) => {
            const selected = linkedGenreIds.has(genre.id);
            return (
              <Pressable
                key={genre.id}
                onPress={() => toggleGenre.mutate({ workId, genreId: genre.id, isLinked: selected })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={genre.nameUk}
                style={{
                  paddingHorizontal: theme.spacing.md,
                  minHeight: theme.minTouchTarget,
                  justifyContent: 'center',
                  borderRadius: theme.radius.pill,
                  backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                }}
              >
                <AppText variant="caption" color={selected ? 'onAccent' : 'secondary'}>
                  {genre.nameUk}
                </AppText>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setShowGenreInput((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={showGenreInput ? 'Скасувати додавання жанру' : 'Додати свій жанр'}
            style={{
              paddingHorizontal: theme.spacing.md,
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderStyle: 'dashed',
            }}
          >
            <AppText variant="caption" color="accent">
              {showGenreInput ? 'Скасувати' : '+ Свій жанр'}
            </AppText>
          </Pressable>
        </View>
        {showGenreInput ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label="Назва жанру"
                value={genreInput}
                onChangeText={setGenreInput}
                onSubmitEditing={handleAddCustomGenre}
                returnKeyType="done"
              />
            </View>
            <Button
              label={addCustomGenre.isPending ? '…' : 'Додати'}
              variant="secondary"
              onPress={handleAddCustomGenre}
              disabled={addCustomGenre.isPending}
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <AppText variant="heading">Теги</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {(tags ?? []).map((tag) => (
            <Pressable
              key={tag.id}
              onPress={() => removeTag.mutate({ workId, tagId: tag.id })}
              accessibilityRole="button"
              accessibilityLabel={`Прибрати тег ${tag.name}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.md,
                minHeight: theme.minTouchTarget,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <AppText variant="caption" color="secondary">
                {tag.name}
              </AppText>
              <Ionicons name="close" size={14} color={theme.colors.textTertiary} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => setShowTagInput((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={showTagInput ? 'Скасувати додавання тегу' : 'Додати тег'}
            style={{
              paddingHorizontal: theme.spacing.md,
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderStyle: 'dashed',
            }}
          >
            <AppText variant="caption" color="accent">
              {showTagInput ? 'Скасувати' : '+ Додати тег'}
            </AppText>
          </Pressable>
        </View>
        {showTagInput ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label="Назва тегу"
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={handleAddTag}
                returnKeyType="done"
              />
            </View>
            <Button
              label={addTag.isPending ? '…' : 'Додати'}
              variant="secondary"
              onPress={handleAddTag}
              disabled={addTag.isPending}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Блок "моя бібліотека" на Book Details: статус читання (той самий тап і додає книгу
 * вперше, і змінює статус уже доданої — окремої кнопки "Додати" немає навмисно, щоб не
 * дублювати дію), улюблене, полиці, фізична наявність, старт/продовження сесії читання
 * (Milestone 3), прибрати з бібліотеки (Milestone 8.4). Прогрес (поточна сторінка)
 * редагується не тут напряму, а через завершення сесії читання ("На якій сторінці
 * зупинився?") — це і є те осмисленіше UX-місце.
 */
function LibrarySection({
  workId,
  editionId,
  userBook,
  ownedBook,
}: {
  workId: string;
  editionId: string;
  userBook: UserBook | null;
  ownedBook: OwnedBook | null;
}) {
  const theme = useTheme();
  const addToLibrary = useAddToLibrary();
  const updateStatus = useUpdateUserBookStatus();
  const toggleFavorite = useToggleFavorite();
  const markOwned = useMarkOwned();
  const unmarkOwned = useUnmarkOwned();
  const removeFromLibrary = useRemoveFromLibrary();

  const { data: shelves } = useShelves();
  const { data: shelfIds } = useShelfIdsForUserBook(userBook?.id);
  const toggleShelfBook = useToggleShelfBook();
  // Той самий запит (за ключем), що й усередині ReadingControls нижче — React Query
  // дедуплікує, тож це не другий запит до БД, лише спосіб прочитати стан тут для гарду
  // "не можна прибрати книгу з активною сесією читання" (інакше сесія лишається сиротою —
  // прив'язаною до user_book, якого користувач більше не бачить).
  const { data: activeSession } = useActiveSession();
  const hasActiveSession = !!userBook && activeSession?.userBookId === userBook.id;

  // Захист від подвійного тапу (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.1) — перевірка
  // "чи вже є запис" (`userBook`) і саме створення/оновлення виконуються не атомарно, тож
  // швидкий повторний тап до завершення першого запиту раніше міг встигнути піти тим самим
  // шляхом (обидва рази "немає userBook" → обидва рази `addToLibrary`) і створити ДВА записи
  // `user_book`/`owned_book` для одного видання. Блокування UI на час `isPending` — той самий
  // прийом, що вже був у ReadingControls/Button нижче для старту сесії й створення полиці.
  const isStatusPending = updateStatus.isPending || addToLibrary.isPending;
  const isOwnedPending = markOwned.isPending || unmarkOwned.isPending;

  const handleStatusChange = (status: UserBookStatus) => {
    if (isStatusPending) return;
    if (userBook) {
      // Підсумок читання (Фаза 6) відкривається САМЕ тут — це єдине місце застосунку, де
      // статус реально переходить у "Прочитано" (завершення сесії читання статус не чіпає,
      // `ReadingSessionRepository.finish`). `wasFinished` рахуємо ДО мутації — інакше
      // повторний тап на вже вибраний чіп "Прочитано" знову й знову відкривав би підсумок.
      const wasFinished = userBook.status === 'finished';
      updateStatus.mutate(
        { id: userBook.id, status },
        {
          onSuccess: () => {
            if (status === 'finished' && !wasFinished) {
              // `as unknown as Href` — маршрут `app/completion/[workId].tsx` реальний і
              // валідний (Фаза 6), але щойно доданий: локальний кеш typed routes
              // (`.expo/types/router.d.ts`, не в git) не завжди встигає його побачити до
              // `tsc` (той самий клас питання, що й Milestone 9 fix2 / Фаза 4 fix1).
              router.push({ pathname: '/completion/[workId]', params: { workId } } as unknown as Href);
            }
          },
        },
      );
    } else {
      addToLibrary.mutate({ editionId, status });
    }
  };

  const handleToggleOwned = () => {
    if (isOwnedPending) return;
    if (ownedBook) {
      unmarkOwned.mutate({ id: ownedBook.id });
    } else {
      markOwned.mutate({ editionId });
    }
  };

  const handleRemoveFromLibrary = () => {
    if (!userBook) return;
    Alert.alert(
      'Прибрати книгу з бібліотеки?',
      'Книга залишиться в каталозі — її можна знайти й додати знову. Але нотатки, цитати, оцінка та історія читання цієї книги більше не будуть доступні.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Прибрати',
          style: 'destructive',
          onPress: () => removeFromLibrary.mutate({ id: userBook.id }),
        },
      ],
    );
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {userBook ? <ReadingControls userBook={userBook} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <ChipSelect
            label="Статус читання"
            options={STATUS_OPTIONS}
            value={userBook?.status ?? 'want_to_read'}
            onChange={handleStatusChange}
            disabled={isStatusPending}
          />
        </View>
        {userBook ? (
          <Pressable
            onPress={() => toggleFavorite.mutate({ id: userBook.id, isFavorite: !userBook.isFavorite })}
            accessibilityRole="button"
            accessibilityLabel={userBook.isFavorite ? 'Прибрати з улюблених' : 'Додати в улюблені'}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={userBook.isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={userBook.isFavorite ? theme.colors.danger : theme.colors.textTertiary}
            />
          </Pressable>
        ) : null}
      </View>

      {userBook && (userBook.status === 'finished' || userBook.status === 'rereading') ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/completion/[workId]', params: { workId } } as unknown as Href)
          }
          accessibilityRole="button"
          accessibilityLabel="Переглянути підсумок читання"
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Ionicons name="ribbon-outline" size={20} color={theme.colors.accent} />
            <AppText variant="body" color="accent" style={{ flex: 1 }}>
              Переглянути підсумок читання
            </AppText>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </Card>
        </Pressable>
      ) : null}

      <Pressable
        onPress={handleToggleOwned}
        disabled={isOwnedPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: isOwnedPending }}
        accessibilityLabel={ownedBook ? 'Прибрати позначку "є у мене"' : 'Позначити, що книга є у мене'}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, opacity: isOwnedPending ? 0.6 : 1 }}>
          <Ionicons
            name={ownedBook ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={ownedBook ? theme.colors.accent : theme.colors.textTertiary}
          />
          <AppText variant="body" color={ownedBook ? 'primary' : 'secondary'}>
            {ownedBook ? 'Ця книга є в мене фізично' : 'Позначити, що книга є в мене'}
          </AppText>
        </Card>
      </Pressable>

      {userBook ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="caption" color="secondary">
              Полиці
            </AppText>
            <Pressable onPress={() => router.push('/shelf/new')} accessibilityRole="button" accessibilityLabel="Нова полиця">
              <AppText variant="caption" color="accent">
                + Нова
              </AppText>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {(shelves ?? []).map((shelf) => {
              const isOnShelf = (shelfIds ?? []).includes(shelf.id);
              return (
                <Pressable
                  key={shelf.id}
                  onPress={() =>
                    toggleShelfBook.mutate({ shelfId: shelf.id, userBookId: userBook.id, isOnShelf })
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isOnShelf }}
                  accessibilityLabel={shelf.name}
                  style={{
                    paddingHorizontal: theme.spacing.md,
                    minHeight: theme.minTouchTarget,
                    justifyContent: 'center',
                    borderRadius: theme.radius.pill,
                    backgroundColor: isOnShelf ? theme.colors.accent : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: isOnShelf ? theme.colors.accent : theme.colors.border,
                  }}
                >
                  <AppText variant="caption" color={isOnShelf ? 'onAccent' : 'secondary'}>
                    {shelf.name}
                  </AppText>
                </Pressable>
              );
            })}
            {(shelves ?? []).length === 0 ? (
              <AppText variant="caption" color="tertiary">
                Ще немає жодної полиці.
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {userBook ? (
        hasActiveSession ? (
          <AppText variant="caption" color="tertiary">
            Спершу заверши або скасуй сесію читання, щоб прибрати книгу з бібліотеки.
          </AppText>
        ) : (
          <Button
            label={removeFromLibrary.isPending ? 'Прибираю…' : 'Прибрати з бібліотеки'}
            variant="ghost"
            onPress={handleRemoveFromLibrary}
            disabled={removeFromLibrary.isPending}
          />
        )
      ) : null}
    </View>
  );
}

/**
 * «Давно не читав» (POLYTSIA V1.6, Фаза 8 ТЗ) — ненав'язлива підказка повернутися до книги
 * зі статусом "Читаю"/"Перечитую", яку давно не відкривали. `sessions` — той самий піднятий до
 * `BookDetailsScreen` список, що й `FinishPredictionSection`/`ReadingHistorySection` нижче, не
 * окремий запит; `sessions[0]` — найновіша завершена сесія (`ReadingSessionRepository.
 * listByUserBookId` сортує найновішими зверху). Нейтральний тон, без "streak"/окличних знаків
 * (ТЗ: "Не використовуй guilt language") — уся формула тексту й сам поріг "давно" винесені в
 * `src/lib/staleReading.ts`.
 */
function StaleReadingSection({
  status,
  sessions,
  workId,
}: {
  status: UserBookStatus;
  sessions: ReadingSession[] | undefined;
  workId: string;
}) {
  const theme = useTheme();

  if (status !== 'reading' && status !== 'rereading') return null;
  if (!sessions || sessions.length === 0) return null;

  const info = computeStaleReadingInfo(sessions[0] ?? null, new Date());
  if (!info) return null;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <Ionicons name="time-outline" size={18} color={theme.colors.accent} style={{ marginTop: 2 }} />
        <AppText variant="body" color="secondary" style={{ flex: 1 }}>
          {describeStaleReading(info)}
        </AppText>
      </View>
      <Button
        label="Згадати, де я зупинився"
        variant="secondary"
        onPress={() => router.push({ pathname: '/recap/[workId]', params: { workId } } as unknown as Href)}
      />
    </Card>
  );
}

/**
 * «Світ книги» (POLYTSIA V1.6, Фаза 9 ТЗ: "На Book Details/Memory: «Персонажі»", перейменовано
 * у Фазі 10: "Назва section: «Світ книги»") — компактна картка: кількість уже доданих елементів
 * лору (персонажів/місць/термінів/організацій; 0, якщо ще нема жодного) і кнопка на повний
 * список (`app/lore/[workId].tsx`). Той самий "компактна картка + посилання на власний екран"
 * підхід, що й `BookCapsuleSection` (`app/memory/[workId].tsx`) — навмисно продубльована
 * локально на обох екранах (той самий house-патерн, що й `RevisitLaterEntryLine`/
 * `StaleReadingSection`).
 *
 * Доступна незалежно від статусу книги (на відміну від `StaleReadingSection`/
 * `PreReadingReflectionSection`) — елементи лору можна занотовувати в будь-який момент, той
 * самий рівень, що й жанри/теги твору.
 */
function LoreSection({ workId }: { workId: string }) {
  const theme = useTheme();
  const { data: entities, isLoading } = useLoreEntities(workId);
  if (isLoading) return null;

  const count = (entities ?? []).length;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="people-outline" size={18} color={theme.colors.accent} />
        <AppText variant="body" color="secondary" style={{ flex: 1 }}>
          {count > 0 ? `У світі книги: ${count}.` : 'Світ цієї книги ще порожній.'}
        </AppText>
      </View>
      <Button
        label="Відкрити світ книги"
        variant="secondary"
        onPress={() => router.push({ pathname: '/lore/[workId]', params: { workId } } as unknown as Href)}
      />
    </Card>
  );
}

/**
 * «До читання» (POLYTSIA V1.6, Фаза 6 ТЗ: "Для книги, яку користувач тільки починає,
 * запропонуй optional pre-reading note. НЕ блокуй start reading."). Інлайн "розгорнути форму"
 * патерн, той самий, що й `BookMemorySection` (`app/completion/[workId].tsx`) — не окремий
 * маршрут (на відміну від Капсули, тут лише три легких поля, окремий екран був би зайвим).
 * Статус уже реально змінюється тапом на чіп у `LibrarySection` вище незалежно від цієї форми
 * (`handleStatusChange`) — форма лише запрошує, ніколи не блокує.
 *
 * Видима лише поки книга РЕАЛЬНО "Читаю" (`canEditPreReadingReflection`) — після завершення
 * форма ховається: писати "до" заднім числом, уже знаючи фінал, підважило б сам сенс
 * порівняння До/Після на Book Memory (`docs/BEFORE_AFTER.md` §Відомі обмеження). Уже збережена
 * нотатка лишається видимою (лише для читання) — форма редагування ж доступна тільки поки
 * умова вище виконується.
 */
function PreReadingReflectionSection({ userBookId, status }: { userBookId: string; status: UserBookStatus }) {
  const theme = useTheme();
  const { data: reflection, isLoading } = usePreReadingReflection(userBookId);
  const save = useSavePreReadingReflection();
  const remove = useRemovePreReadingReflection();

  const [isEditing, setIsEditing] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [expectationText, setExpectationText] = useState('');
  const [expectedRating, setExpectedRating] = useState<number | null>(null);

  const canEdit = canEditPreReadingReflection(status);

  if (isLoading) return null;
  if (!reflection && !canEdit) return null;

  const startEditing = () => {
    setReasonText(reflection?.reasonText ?? '');
    setExpectationText(reflection?.expectationText ?? '');
    setExpectedRating(reflection?.expectedRating ?? null);
    setIsEditing(true);
  };

  const handleSave = () => {
    save.mutate(
      {
        userBookId,
        reasonText: reasonText.trim() || null,
        expectationText: expectationText.trim() || null,
        expectedRating,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const handleRemove = () => {
    if (!reflection) return;
    remove.mutate({ id: reflection.id, userBookId }, { onSuccess: () => setIsEditing(false) });
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="hourglass-outline" size={18} color={theme.colors.accent} />
        <AppText variant="heading">До читання</AppText>
      </View>

      {isEditing ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <LabeledInput
            label="Чому хочеш прочитати цю книгу? (необов'язково)"
            value={reasonText}
            onChangeText={setReasonText}
            multiline
            style={{ minHeight: 56, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
          />
          <LabeledInput
            label="Чого очікуєш? Який настрій хочеш зловити? (необов'язково)"
            value={expectationText}
            onChangeText={setExpectationText}
            multiline
            style={{ minHeight: 56, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
          />
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="caption" color="secondary">
              Очікувана оцінка (необов&apos;язково)
            </AppText>
            <StarRating value={expectedRating} onChange={setExpectedRating} />
            {expectedRating != null ? (
              <Pressable
                onPress={() => setExpectedRating(null)}
                accessibilityRole="button"
                accessibilityLabel="Прибрати очікувану оцінку"
              >
                <AppText variant="caption" color="secondary">
                  Прибрати оцінку
                </AppText>
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label={save.isPending ? 'Зберігаю…' : 'Зберегти'} onPress={handleSave} disabled={save.isPending} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Скасувати" variant="secondary" onPress={() => setIsEditing(false)} />
            </View>
          </View>
          {reflection ? (
            <Pressable onPress={handleRemove} accessibilityRole="button" accessibilityLabel='Видалити нотатку "До читання"'>
              <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                Видалити нотатку
              </AppText>
            </Pressable>
          ) : null}
        </Card>
      ) : reflection ? (
        <Card style={{ gap: theme.spacing.sm }}>
          {reflection.reasonText ? (
            <AppText variant="body" color="secondary" style={{ fontStyle: 'italic' }}>
              «{reflection.reasonText}»
            </AppText>
          ) : null}
          {reflection.expectationText ? (
            <AppText variant="body" style={{ fontStyle: 'italic' }}>
              «{reflection.expectationText}»
            </AppText>
          ) : null}
          {reflection.expectedRating != null ? (
            <AppText variant="caption" color="secondary">
              Очікувана оцінка: {reflection.expectedRating}
            </AppText>
          ) : null}
          {canEdit ? (
            <Pressable onPress={startEditing} accessibilityRole="button" accessibilityLabel='Редагувати нотатку "До читання"'>
              <AppText variant="caption" color="accent" style={{ textAlign: 'center' }}>
                Редагувати
              </AppText>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <Card style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
          <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            Запиши, чому обрав цю книгу й чого від неї чекаєш — потім зможеш порівняти з тим,
            як усе вийшло насправді.
          </AppText>
          <Button label="Додати нотатку" variant="secondary" onPress={startEditing} />
        </Card>
      )}
    </View>
  );
}

/**
 * Кнопка старту/продовження читання (Milestone 3). Активна сесія в застосунку щонайбільше
 * одна — якщо вона належить іншій книзі, тут просто повідомляємо про це замість того, щоб
 * дозволити почати другу паралельну сесію (докладніше — ReadingSessionRepository).
 */
function ReadingControls({ userBook }: { userBook: UserBook }) {
  const { data: activeSession } = useActiveSession();
  const startSession = useStartSession();

  if (activeSession && activeSession.userBookId === userBook.id) {
    return (
      <Button
        label="Продовжити читання"
        onPress={() => router.push({ pathname: '/session/[sessionId]', params: { sessionId: activeSession.id } })}
      />
    );
  }

  if (activeSession) {
    return (
      <Card>
        <AppText variant="body" color="secondary">
          Спершу заверши поточну сесію читання іншої книги.
        </AppText>
      </Card>
    );
  }

  return (
    <Button
      label={startSession.isPending ? 'Починаю…' : 'Почати читання'}
      onPress={() =>
        startSession.mutate(
          { userBookId: userBook.id, startPage: userBook.currentPage },
          {
            onSuccess: (session) => {
              router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
            },
          },
        )
      }
      disabled={startSession.isPending}
    />
  );
}

/** Оцінка (п.23 ТЗ): зірки з кроком 0.5 + опційний відгук. Одна оцінка на книгу (upsert),
 * з можливістю прибрати її повністю (Milestone 8.4) — `StarRating` сам не дає знизитись
 * нижче 0.5, тож зняти оцінку можна лише окремою дією. */
function RatingSection({ userBookId }: { userBookId: string }) {
  const theme = useTheme();
  const { data: rating } = useRating(userBookId);
  const setRating = useSetRating();
  const removeRating = useRemoveRating();
  const [review, setReview] = useState('');
  const [reviewDirty, setReviewDirty] = useState(false);

  const displayedReview = reviewDirty ? review : rating?.review ?? '';

  const handleRemoveRating = () => {
    if (!rating) return;
    Alert.alert('Прибрати оцінку?', 'Зірки й відгук до цієї книги буде видалено.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Прибрати',
        style: 'destructive',
        onPress: () => {
          removeRating.mutate(
            { id: rating.id, userBookId },
            { onSuccess: () => setReviewDirty(false) },
          );
        },
      },
    ]);
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="heading">Оцінка</AppText>
        {rating ? (
          <Pressable
            onPress={handleRemoveRating}
            accessibilityRole="button"
            accessibilityLabel="Прибрати оцінку"
            hitSlop={8}
          >
            <AppText variant="caption" color="secondary">
              Прибрати
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <StarRating
        value={rating?.value ?? null}
        onChange={(value) => setRating.mutate({ userBookId, value, review: rating?.review ?? null })}
      />
      {rating ? (
        <View style={{ gap: theme.spacing.sm }}>
          <LabeledInput
            label="Відгук (необов'язково)"
            value={displayedReview}
            onChangeText={(text) => {
              setReview(text);
              setReviewDirty(true);
            }}
            multiline
            style={{ minHeight: 72, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
          />
          {reviewDirty ? (
            <Button
              label={setRating.isPending ? 'Зберігаю…' : 'Зберегти відгук'}
              variant="secondary"
              onPress={() => {
                setRating.mutate(
                  { userBookId, value: rating.value, review: review.trim() || null },
                  { onSuccess: () => setReviewDirty(false) },
                );
              }}
              disabled={setRating.isPending}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Щоденник книги (Milestone 11, Фаза 5) — об'єднаний розділ нотаток+цитат, що замінив дві
 * окремі секції ("Нотатки"/"Цитати", кожна зі своїм списком і формою). Читає той самий
 * union-шар (`JournalRepository` через `useJournalEntries`/`useJournalCount`), що вже живить
 * список записів сесії читання (Фаза 3) і глобальну стрічку "Мій щоденник" (Фаза 4) — тут
 * третє й останнє місце читання тих самих даних, локально для однієї книги, щоб не йти на
 * глобальний екран заради запису чи перегляду записів саме цієї книги.
 *
 * Композер згорнутий за замовчуванням (на відміну від завжди-розгорнутого в активній сесії
 * читання) — той самий патерн "+ Додати", що й у Жанрах/Тегах вище на цьому ж екрані: це вже
 * довгий екран, і композер тут не головна дія, а одна з багатьох.
 */
function JournalSection({ userBookId, editionId }: { userBookId: string; editionId: string }) {
  const theme = useTheme();
  const { data: entries } = useJournalEntries(userBookId);
  const { data: count } = useJournalCount(userBookId);
  const createNote = useCreateNote();
  const createQuote = useCreateQuote();
  const removeNote = useRemoveNote();
  const removeQuote = useRemoveQuote();
  const toggleFavorite = useToggleJournalFavorite();
  const toggleRevisitLater = useToggleJournalRevisitLater();
  const setReaction = useSetJournalReaction();

  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);

  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<JournalEntryKind>('note');
  const [category, setCategory] = useState<NoteCategoryValue>({ type: 'general', categoryId: null });
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [page, setPage] = useState('');

  const isSaving = createNote.isPending || createQuote.isPending;

  const handleAdd = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const parsedPage = parseOptionalPage(page);

    if (kind === 'note') {
      await createNote.mutateAsync({
        userBookId,
        type: category.type,
        categoryId: category.categoryId,
        text: trimmedText,
        page: parsedPage,
      });
    } else {
      await createQuote.mutateAsync({
        userBookId,
        editionId,
        text: trimmedText,
        comment: comment.trim() || undefined,
        page: parsedPage,
      });
    }

    setText('');
    setComment('');
    setPage('');
    setCategory({ type: 'general', categoryId: null });
    setShowForm(false);
  };

  const handleRemove = (entry: JournalEntry) => {
    if (entry.kind === 'note') {
      removeNote.mutate({ id: entry.id, userBookId, sessionId: entry.sessionId });
    } else {
      removeQuote.mutate({ id: entry.id, userBookId, sessionId: entry.sessionId });
    }
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <AppText variant="heading">Щоденник</AppText>
          {count && count > 0 ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.accentSoft,
              }}
            >
              <AppText variant="micro" color="accent">
                {count}
              </AppText>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowForm((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Скасувати додавання запису' : 'Додати запис до щоденника'}
        >
          <AppText variant="caption" color="accent">
            {showForm ? 'Скасувати' : '+ Додати'}
          </AppText>
        </Pressable>
      </View>

      {showForm ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <ChipSelect label="Що записуємо" options={JOURNAL_KIND_OPTIONS} value={kind} onChange={setKind} />
          {kind === 'note' ? (
            <NoteCategoryPicker userBookId={userBookId} value={category} onChange={setCategory} />
          ) : null}
          <LabeledInput
            label={kind === 'note' ? 'Текст' : 'Текст цитати'}
            value={text}
            onChangeText={setText}
            multiline
            style={{ minHeight: 72, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
          />
          {kind === 'quote' ? (
            <LabeledInput label="Коментар (необов'язково)" value={comment} onChangeText={setComment} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md }}>
            <View style={{ width: 100 }}>
              <LabeledInput
                label="Сторінка (необов'язково)"
                value={page}
                onChangeText={setPage}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={isSaving ? 'Зберігаю…' : 'Зберегти запис'}
                onPress={handleAdd}
                disabled={!text.trim() || isSaving}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {(entries ?? []).map((entry) => (
        <Card key={entry.id} style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="caption" color="accent">
              {resolveEntryTypeLabel(entry, categoriesById)}
              {entry.page != null ? ` · с. ${entry.page}` : ''}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <ReactionToggle
                value={entry.reaction}
                onChange={(reaction) =>
                  setReaction.mutate({ id: entry.id, kind: entry.kind, userBookId, reaction, sessionId: entry.sessionId })
                }
              />
              <RevisitLaterToggle
                value={entry.revisitLater}
                onChange={(revisitLater) =>
                  toggleRevisitLater.mutate({
                    id: entry.id,
                    kind: entry.kind,
                    userBookId,
                    revisitLater,
                    sessionId: entry.sessionId,
                  })
                }
              />
              <Pressable
                onPress={() =>
                  toggleFavorite.mutate({
                    id: entry.id,
                    kind: entry.kind,
                    userBookId,
                    isFavorite: !entry.isFavorite,
                    sessionId: entry.sessionId,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={entry.isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
                hitSlop={8}
                style={{
                  width: theme.minTouchTarget,
                  height: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={entry.isFavorite ? 'heart' : 'heart-outline'}
                  size={16}
                  color={entry.isFavorite ? theme.colors.danger : theme.colors.textTertiary}
                />
              </Pressable>
              <Pressable
                onPress={() => handleRemove(entry)}
                accessibilityRole="button"
                accessibilityLabel="Видалити запис"
                hitSlop={8}
                style={{
                  width: theme.minTouchTarget,
                  height: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.textTertiary} />
              </Pressable>
            </View>
          </View>
          <AppText variant="body" style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
            {entry.text}
          </AppText>
          {entry.comment ? (
            <AppText variant="caption" color="secondary">
              {entry.comment}
            </AppText>
          ) : null}
        </Card>
      ))}

      {(!entries || entries.length === 0) && !showForm ? (
        <AppText variant="caption" color="tertiary">
          Ще немає жодного запису — думки, питання чи улюблені цитати про цю книгу з&apos;являться
          тут.
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * Прогноз дати завершення (розділ 30 ТЗ, Milestone 6) — лише для книг зі статусом
 * "читаю"/"перечитую", і лише коли даних досить: відомий обсяг видання (`pageCount`) і хоч
 * трохи темпу з недавніх сесій (`predictFinish` навмисно повертає `null` замість вигаданої
 * дати, коли книгу щойно почали чи давно не читали — див. `src/lib/finishPrediction.ts`).
 *
 * POLYTSIA V1.6, Фаза 2: `sessions` тепер проп, а не власний виклик `useReadingHistory` —
 * піднято до `BookDetailsScreen`, який тепер викликає хук РІВНО один раз і ділить результат із
 * `ReadingHistorySection` нижче (той самий ключ кешу, той самий запит до БД, що й раніше через
 * React Query дедуплікацію — тут просто прибрано зайвий другий виклик хука заради єдиного
 * джерела `sessions` для обох секцій).
 */
function FinishPredictionSection({
  currentPage,
  totalPages,
  status,
  sessions,
}: {
  currentPage: number;
  totalPages: number | null;
  status: UserBookStatus;
  sessions: ReadingSession[] | undefined;
}) {
  const theme = useTheme();

  if (status !== 'reading' && status !== 'rereading') return null;
  if (!sessions) return null;

  const pace = computeRollingPace(sessions);
  const prediction = predictFinish({ currentPage, totalPages, pace, referenceDate: new Date() });

  if (prediction.estimatedFinishDate == null || prediction.remainingPages == null) return null;

  return (
    <Card style={{ gap: theme.spacing.xs, backgroundColor: theme.colors.accentSoft }}>
      <AppText variant="caption" color="accent">
        Орієнтовна дата завершення
      </AppText>
      <AppText variant="heading">
        {new Date(prediction.estimatedFinishDate).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
      </AppText>
      <AppText variant="caption" color="secondary">
        Залишилось {prediction.remainingPages} стор. · за твоїм останнім темпом читання
      </AppText>
    </Card>
  );
}

/**
 * POLYTSIA V1.6, Фаза 2: `sessions` тепер проп (піднято з батька — див. коментар над
 * `FinishPredictionSection`), а заголовок "Історія читання" прибрано звідси — його тепер дає
 * обгортка `CollapsibleSection` у `BookDetailsScreen`, яка й вирішує, чи показувати розділ
 * узагалі (той самий `sessions.length > 0` гард, лише піднятий на рівень вище).
 */
function ReadingHistorySection({ sessions }: { sessions: ReadingSession[] }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      {sessions.map((session) => (
        <Card key={session.id} style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color="tertiary">
              {new Date(session.startedAt).toLocaleDateString('uk-UA')}
            </AppText>
            <AppText variant="caption" color="secondary">
              {session.durationSeconds != null ? formatDuration(session.durationSeconds * 1000) : '—'}
            </AppText>
          </View>
          <AppText variant="body">
            Сторінки {session.startPage}
            {session.endPage != null ? ` → ${session.endPage}` : ''}
          </AppText>
          {session.moodNote ? (
            <AppText variant="caption" color="secondary">
              {session.moodNote}
            </AppText>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

export default function BookDetailsScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  // POLYTSIA V1.6, Фаза 2: піднято сюди з `FinishPredictionSection`/`ReadingHistorySection` —
  // один виклик хука замість двох окремих (React Query й так дедуплікував би однаковий ключ,
  // але навіщо взагалі викликати двічі). Безпечно викликати без умови (Rules of Hooks) —
  // `useReadingHistory` сам вимикається через `enabled: !!userBookId`, коли `data` ще не
  // завантажено або `userBook` відсутній.
  const { data: sessions } = useReadingHistory(data?.userBook?.id);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data ? (
          <AppText variant="body" color="secondary">
            Книгу не знайдено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.xl }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <CoverThumbnail
                coverUrl={data.primaryEdition?.coverUrl}
                title={data.work.title}
                fallbackColor={data.work.coverFallbackColor}
                width={128}
                height={188}
                borderRadius={theme.radius.md}
              />
              {data.primaryEdition ? (
                // Кнопка доступна ЗАВЖДИ (Milestone 10 fix4), не лише коли обкладинки немає —
                // прямий запит користувача: іноді офіційна обкладинка є, але людина хоче
                // замінити її власним фото (наприклад, гарний кадр своєї книги на фоні) —
                // тому напис теж змінюється залежно від того, чи обкладинка вже є.
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/cover-photo/[editionId]',
                      params: { editionId: data.primaryEdition!.id },
                    } as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={data.primaryEdition.coverUrl ? 'Змінити обкладинку' : 'Додати обкладинку'}
                >
                  <AppText variant="caption" color="accent" style={{ textAlign: 'center' }}>
                    {data.primaryEdition.coverUrl ? 'Змінити обкладинку' : 'Додати свою обкладинку'}
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
              <AppText variant="title" style={{ textAlign: 'center' }}>
                {data.work.title}
              </AppText>
              {data.work.authors.length > 0 ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  {data.work.authors.map((a) => a.name).join(', ')}
                </AppText>
              ) : null}
              {data.seriesContext ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/series/[seriesId]',
                      params: { seriesId: data.seriesContext!.series.id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Серія ${data.seriesContext.series.name}`}
                >
                  <AppText variant="caption" color="accent" style={{ textAlign: 'center' }}>
                    {data.seriesContext.series.name}
                    {data.seriesContext.position != null ? ` · книга ${data.seriesContext.position}` : ''}
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            {data.work.description ? (
              <AppText variant="body" color="secondary">
                {data.work.description}
              </AppText>
            ) : null}

            <CollapsibleSection title="Жанри та теги">
              <GenreTagsSection workId={data.work.id} />
            </CollapsibleSection>

            {data.primaryEdition ? (
              <LibrarySection
                workId={data.work.id}
                editionId={data.primaryEdition.id}
                userBook={data.userBook}
                ownedBook={data.ownedBook}
              />
            ) : null}

            {data.userBook ? (
              <StaleReadingSection status={data.userBook.status} sessions={sessions} workId={data.work.id} />
            ) : null}

            <LoreSection workId={data.work.id} />

            {data.userBook ? (
              <PreReadingReflectionSection userBookId={data.userBook.id} status={data.userBook.status} />
            ) : null}

            {data.userBook && data.primaryEdition ? (
              <FinishPredictionSection
                currentPage={data.userBook.currentPage}
                totalPages={data.primaryEdition.pageCount}
                status={data.userBook.status}
                sessions={sessions}
              />
            ) : null}

            {data.userBook ? <RatingSection userBookId={data.userBook.id} /> : null}

            {data.userBook && data.primaryEdition ? (
              <JournalSection userBookId={data.userBook.id} editionId={data.primaryEdition.id} />
            ) : null}

            {data.userBook && sessions && sessions.length > 0 ? (
              <CollapsibleSection title="Історія читання">
                <ReadingHistorySection sessions={sessions} />
              </CollapsibleSection>
            ) : null}

            {data.editions.length > 0 ? (
              <CollapsibleSection title={`Видання (${data.editions.length})`}>
                <View style={{ gap: theme.spacing.md }}>
                  {data.editions.map((edition) => (
                    <EditionCard key={edition.id} edition={edition} />
                  ))}
                </View>
              </CollapsibleSection>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
