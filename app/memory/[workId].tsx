import React, { useMemo, useRef, useState } from 'react';
import { View, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { MemoryCardPreview } from '@/components/memory/MemoryCardPreview';
import { JournalTimeline } from '@/components/memory/JournalTimeline';
import { ReadingExperienceTimeline } from '@/components/memory/ReadingExperienceTimeline';
import { useTheme } from '@/design/ThemeProvider';
import { memoryCardTemplateLabels, memoryCardTemplateDescriptions } from '@/design/i18n-labels';
import { REACTION_META, isReactionId } from '@/design/reactions';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useRating } from '@/features/book-details/useRating';
import { useReadingHistory } from '@/features/reading-session/useReadingHistory';
import { useJournalEntries, useJournalRevisitLater } from '@/features/journal/useJournal';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { useGenresForWork } from '@/features/book-details/useGenres';
import { useBookMemory, useSetBookMemory } from '@/features/memory/useBookMemory';
import { useBookCapsule } from '@/features/memory/useBookCapsule';
import { useLoreEntities } from '@/features/lore/useLoreEntities';
import { usePreReadingReflection } from '@/features/memory/usePreReadingReflection';
import { canCreateCapsule } from '@/lib/bookCapsule';
import { pickBeforeCardText } from '@/lib/beforeAfter';
import { computeBookStats } from '@/lib/bookStats';
import { shareMemoryCardImage, saveMemoryCardImageToLibrary } from '@/lib/memoryCardFile';
import { createLogger } from '@/lib/logger';
import type { Href } from 'expo-router';
import type { MemoryCardTemplateId } from '@/types/bookMemory';
import type { JournalEntry } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';
import type { UserBookStatus } from '@/types/userBook';
import type { PreReadingReflection } from '@/types/preReadingReflection';

const log = createLogger('app/memory');

const TEMPLATE_OPTIONS: { value: MemoryCardTemplateId; label: string }[] = (
  Object.keys(memoryCardTemplateLabels) as MemoryCardTemplateId[]
).map((id) => ({ value: id, label: memoryCardTemplateLabels[id] }));

/** Спільні опції захоплення (Milestone 11, Фаза 9) — PNG, максимальна якість. Той самий
 * знімок іде і на "Поділитися", і на "Зберегти в галерею", тож знято в одному місці, а не
 * дубльовано в обох обробниках. Без `result` — типове значення `'tmpfile'` (реальний файл на
 * диску з розширенням `.png` у URI), навмисно НЕ `'base64'`/`'data-uri'`: і `Sharing.shareAsync`,
 * і `MediaLibrary.saveToLibraryAsync` (`memoryCardFile.ts`) чекають саме `file://`-шлях з
 * розширенням, а не рядок даних. */
const CAPTURE_OPTIONS = { format: 'png', quality: 1 } as const;

/** Один рядок запису в розділі "Повернутися до цих думок" — той самий вигляд, що й
 * `MemoryEntryLine` на `app/completion/[workId].tsx` (тип запису + іконка реакції, якщо є,
 * далі сам текст), навмисно продубльовано локально, а не імпортовано з іншого екрана: обидва
 * рядки лишаються маленькими презентаційними компонентами без спільного стану, і зайва
 * крос-екранна залежність тут не виправдана заради кількох рядків розмітки. */
function RevisitLaterEntryLine({
  entry,
  categoriesById,
}: {
  entry: JournalEntry;
  categoriesById: ReadonlyMap<string, NoteCategory>;
}) {
  const theme = useTheme();
  const reactionMeta = entry.reaction && isReactionId(entry.reaction) ? REACTION_META[entry.reaction] : null;

  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {reactionMeta ? <Ionicons name={reactionMeta.icon} size={12} color={theme.colors.accent} /> : null}
        <AppText variant="micro" color="accent">
          {resolveEntryTypeLabel(entry, categoriesById)}
          {entry.page != null ? ` · с. ${entry.page}` : ''}
        </AppText>
      </View>
      <AppText
        variant="caption"
        color="secondary"
        style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}
      >
        {entry.text}
      </AppText>
    </View>
  );
}

/**
 * ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — «На Book Memory screen додай section: „Повернутися до
 * цих думок“». Читає той самий union-шар, що й `JournalTimeline` вище на цьому екрані, але
 * фільтрований лише на `revisitLater`-позначені записи (`useJournalRevisitLater`, той самий
 * "малий список по одній книзі" хук, що й на екрані підсумку читання). Рендерить `null`, коли
 * позначених записів нема — та сама умова видимості, що й нова картка на екрані підсумку.
 */
function RevisitLaterSection({ userBookId }: { userBookId: string | undefined }) {
  const theme = useTheme();
  const { data: entries } = useJournalRevisitLater(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);

  if (!entries || entries.length === 0) return null;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="bookmark" size={18} color={theme.colors.accent} />
        <AppText variant="heading">Повернутися до цих думок</AppText>
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        {entries.map((entry) => (
          <RevisitLaterEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
        ))}
      </View>
    </Card>
  );
}

/**
 * «Капсула книги» (POLYTSIA V1.6, Фаза 4, п.2 ТЗ — entry point #2, Book Memory screen).
 * Компактна версія тієї самої секції, що й `BookCapsuleSection` на
 * `app/completion/[workId].tsx` (запрошення створити капсулу / коротке посилання на вже
 * створену) — навмисно продубльована локально, той самий підхід, що й `RevisitLaterEntryLine`
 * вище: маленький презентаційний блок без спільного стану, зайва крос-екранна залежність тут
 * не виправдана.
 *
 * POLYTSIA V1.6, Фаза 5 («Книга через час») — коли капсула вже існує, основна дія тепер
 * «Згадати книгу» (`app/recall/[workId].tsx`, п.2 ТЗ Фази 5: "відкрити вручну у будь-який
 * момент"), а не прямий перегляд: сам recall-флоу вже показує весь вміст капсули на кроці
 * reveal, тож окремий перегляд лишається другорядною дією ("Переглянути деталі" — той самий
 * View screen, що й раніше, для швидкого редагування/видалення без гри в згадування).
 */
function BookCapsuleSection({
  userBookId,
  workId,
  status,
}: {
  userBookId: string;
  workId: string;
  status: UserBookStatus;
}) {
  const theme = useTheme();
  const { data: capsule, isLoading } = useBookCapsule(userBookId);

  if (isLoading) return null;
  if (!capsule && !canCreateCapsule(status)) return null;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="cube-outline" size={18} color={theme.colors.accent} />
        <AppText variant="body" color="secondary" style={{ flex: 1 }}>
          {capsule ? 'У цієї книги вже є капсула.' : "Залиш капсулу з кількома деталями на пам'ять."}
        </AppText>
      </View>
      <Button
        label={capsule ? 'Згадати книгу' : 'Створити капсулу'}
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: capsule ? '/recall/[workId]' : '/capsule/[workId]/edit',
            params: { workId },
          } as unknown as Href)
        }
      />
      {capsule ? (
        <Button
          label="Переглянути деталі"
          variant="ghost"
          onPress={() => router.push({ pathname: '/capsule/[workId]', params: { workId } } as unknown as Href)}
        />
      ) : null}
    </Card>
  );
}

/**
 * «Світ книги» (POLYTSIA V1.6, Фаза 9 ТЗ, entry point #2 — Book Memory screen; перейменовано у
 * Фазі 10). Та сама компактна картка, що й `LoreSection` на `app/work/[workId].tsx`
 * (Book Details), навмисно продубльована локально — той самий підхід, що й
 * `BookCapsuleSection`/`RevisitLaterEntryLine` вище на цьому екрані.
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
 * «До / Після» (POLYTSIA V1.6, Фаза 6 ТЗ) — порівняння `pre_reading_reflection` (заповнено на
 * Book Details, `app/work/[workId].tsx`, ще ДО фінішу) з тим, що вже й так зібрано ПІСЛЯ фінішу
 * на цьому самому екрані — власною рефлексією спогаду (`memory.reflection`, Фаза 7) і фактичною
 * оцінкою (`rating.value`, п.23 ТЗ). Свідомо БЕЗ нового "after"-поля/таблиці — ТЗ прямо каже
 * "Book Memory МОЖЕ показати" порівняння, а не збирати ще один текст; `book_memory`/`rating` —
 * уже єдине джерело правди для "після" тут. Рендериться лише коли `pre_reading_reflection`
 * узагалі існує — без нього порівнювати нічого (запрошення створити його — на Book Details,
 * поки книга "Читаю", `docs/BEFORE_AFTER.md`).
 */
function BeforeAfterSection({
  reflection,
  afterText,
  actualRating,
}: {
  reflection: PreReadingReflection;
  afterText: string | null;
  actualRating: number | null;
}) {
  const theme = useTheme();

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.accent} />
        <AppText variant="heading">До / Після</AppText>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
          До читання
        </AppText>
        {reflection.reasonText ? (
          <AppText variant="body" style={{ fontStyle: 'italic' }}>
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
            Очікував(ла): {reflection.expectedRating}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
          Після читання
        </AppText>
        {afterText ? (
          <AppText variant="body" style={{ fontStyle: 'italic' }}>
            «{afterText}»
          </AppText>
        ) : (
          <AppText variant="caption" color="tertiary">
            Ще нічого не написано — додай кілька слів у спогад вище.
          </AppText>
        )}
        {actualRating != null ? (
          <AppText variant="caption" color="secondary">
            Насправді: {actualRating}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Картка-спогад (Milestone 11, Фаза 8-9) — вибір шаблону, живий preview `MemoryCardPreview`,
 * і тепер (Фаза 9) — "Поділитися"/"Зберегти в галерею" повноцінним зображенням. Дані для
 * картки вже зібрані Фазою 7 (`book_memory.reflection`/`entry_refs`) — тут лише "яким
 * шаблоном показати" й "куди віддати результат", тому доступний лише коли спогад уже існує
 * (єдина точка входу — "Переглянути картку" на `app/completion/[workId].tsx`, видима тільки
 * коли є що показати).
 */
export default function MemoryCardScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: memory, isLoading: isMemoryLoading } = useBookMemory(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: sessions } = useReadingHistory(userBookId);
  const { data: rating } = useRating(userBookId);
  const { data: preReadingReflection } = usePreReadingReflection(userBookId);
  // Лише для "вайбу" водяного знаку картки (`MemoryCardPreview`) — порожній масив за
  // замовчуванням (доки завантажується/якщо жанрів нема) коректний сам по собі: тоді вайб
  // просто детермінований за `workId`, а не за жанром (`pickCardMood`).
  const { data: genres } = useGenresForWork(workId);
  const setMemory = useSetBookMemory();

  // Той самий "dirty override" патерн, що й `RatingSection.displayedReview`
  // (`app/work/[workId].tsx`) — щойно обраний шаблон видно одразу, без миготіння між
  // локальним вибором і ще не повернутим результатом мутації.
  const [templateOverride, setTemplateOverride] = useState<MemoryCardTemplateId | null>(null);
  const displayedTemplate = templateOverride ?? memory?.templateId ?? 'classic';

  // Реф на саму картку для захоплення в зображення (Фаза 9). `collapsable={false}` на самому
  // `View` нижче — обов'язково для Android: без нього нативна оптимізація дерева view може
  // "сплющити"/прибрати цей вузол, і `captureRef` або впаде, або захопить не те (відоме й
  // задокументоване обмеження `react-native-view-shot`).
  const cardRef = useRef<View>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  // Інлайн `useMutation` прямо в екрані (не в `features/memory/`) — той самий вибір, що й
  // `saveMutation` у `app/cover-photo/[editionId].tsx`: це взаємодія з пристроєм (захоплення
  // View, системний "Поділитися", фотогалерея), а не SQLite-мутація даних, тож їй тут і місце.
  const shareCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return shareMemoryCardImage(uri);
    },
    onSuccess: (shared) => {
      setStatusMessage(shared ? null : 'Системне "Поділитися" тут недоступне.');
    },
    onError: (error) => {
      log.error('Не вдалося поділитися карткою', { error: error instanceof Error ? error.message : String(error) });
      setStatusMessage('Не вдалося поділитися карткою. Спробуй ще раз.');
    },
  });

  const saveCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return saveMemoryCardImageToLibrary(uri);
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
      log.error('Не вдалося зберегти картку в галерею', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося зберегти картку. Спробуй ще раз.');
    },
  });

  // Явна синхронна перевірка "вже виконується" (аудит M11, п.6.3) — той самий захист, що й
  // `handleStatusChange` в `app/work/[workId].tsx` (`if (isStatusPending) return;`), а не лише
  // покладання на `Button.disabled`: `disabled` стає `true` тільки ПІСЛЯ повторного рендеру з
  // новим `isPending`, тож швидкий подвійний тап теоретично встигає натиснути двічі до того,
  // як кнопка візуально стане неактивною — тут же другий виклик відсікається одразу, без
  // очікування на рендер.
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

  const selectedEntries = useMemo(() => {
    if (!memory || !allEntries) return [];
    const ids = new Set(memory.entryRefs.map((ref) => ref.id));
    return allEntries.filter((entry) => ids.has(entry.id));
  }, [memory, allEntries]);

  const stats = computeBookStats({
    sessions,
    pageCount: data?.primaryEdition?.pageCount,
    currentPage: data?.userBook?.currentPage,
    startedAt: data?.userBook?.startedAt,
    finishedAt: data?.userBook?.finishedAt,
  });

  const handleTemplateChange = (templateId: MemoryCardTemplateId) => {
    if (!userBookId || !memory) return;
    setTemplateOverride(templateId);
    setMemory.mutate(
      {
        userBookId,
        reflection: memory.reflection,
        entryRefs: memory.entryRefs,
        templateId,
      },
      {
        // Відкат оптимістичного вибору при помилці (аудит M11, п.6.4) — без цього екран і
        // далі показував (і дозволяв експортувати) шаблон, що НЕ зберігся в БД, аж до
        // перемонтування компонента; глобальний `onError` у `useSetBookMemory` лише показує
        // toast, `displayedTemplate` тут не чіпає.
        onError: () => setTemplateOverride(null),
      },
    );
  };

  const authorNames = data?.work.authors.map((a) => a.name).join(', ') ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Картка-спогад',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isMemoryLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook || !memory ? (
          <AppText variant="body" color="secondary">
            Спершу створи спогад про цю книгу на екрані підсумку читання.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View ref={cardRef} collapsable={false}>
              <MemoryCardPreview
                template={displayedTemplate}
                work={{
                  title: data.work.title,
                  authorNames,
                  coverUrl: data.primaryEdition?.coverUrl,
                  coverFallbackColor: data.work.coverFallbackColor,
                }}
                reflection={memory.reflection}
                entries={selectedEntries}
                rating={rating?.value ?? null}
                stats={stats}
                genres={genres ?? []}
                workId={workId}
                beforeText={pickBeforeCardText(preReadingReflection ?? null)}
              />
            </View>

            <Card style={{ gap: theme.spacing.sm }}>
              <ChipSelect
                label="Шаблон картки"
                options={TEMPLATE_OPTIONS}
                value={displayedTemplate}
                onChange={handleTemplateChange}
                disabled={setMemory.isPending}
              />
              <AppText variant="caption" color="tertiary">
                {memoryCardTemplateDescriptions[displayedTemplate]}
              </AppText>
            </Card>

            {/* POLYTSIA V1.6, Фаза 7 («ЯК ЧИТАЛАСЯ КНИГА») — шкала за станами "Як читалося?"
             * (`reading_experience`, наявне поле сесії) кожної завершеної сесії, окремо від
             * шкали записів щоденника нижче: тут кожна позначка — це ОДНА сесія читання, там —
             * ОДИН (чи кілька) запис щоденника; обидві шкали використовують ту саму позицію
             * 0-100% книги, тож навмисно стоять поруч. Рендерить `null` сама, коли сесій замало
             * (`ReadingExperienceTimeline.tsx`), тому умовного враппера тут не потрібно. */}
            <ReadingExperienceTimeline sessions={sessions} pageCount={data.primaryEdition?.pageCount ?? null} />

            {/* Фаза 10 (JOURNAL MEMORY TIMELINE) — шкала записів щоденника 0-100% книги,
             * окремо від вибору шаблону картки й вище кнопок поділитись/зберегти: це
             * самостійна допоміжна візуалізація ("Timeline є supplementary visualization"),
             * не частина самої картки-спогаду (`selectedEntries`/`memory.entryRefs` — лише
             * записи, ОБРАНІ для картки; шкала ж показує ВСІ записи щоденника книги,
             * `allEntries`). Рендерить `null` сама, коли позиціонувати нічого — тому
             * умовного `{allEntries?.length ? ... : null}` тут не потрібно. */}
            <JournalTimeline
              entries={allEntries ?? []}
              pageCount={data.primaryEdition?.pageCount ?? null}
              userBookId={userBookId}
            />

            {preReadingReflection ? (
              <BeforeAfterSection
                reflection={preReadingReflection}
                afterText={memory.reflection}
                actualRating={rating?.value ?? null}
              />
            ) : null}

            <RevisitLaterSection userBookId={userBookId} />

            <LoreSection workId={data.work.id} />

            <BookCapsuleSection
              userBookId={data.userBook.id}
              workId={data.work.id}
              status={data.userBook.status}
            />

            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label={shareCard.isPending ? 'Готую зображення…' : 'Поділитися'}
                onPress={handleShare}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              <Button
                label={saveCard.isPending ? 'Зберігаю…' : 'Зберегти в галерею'}
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
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
