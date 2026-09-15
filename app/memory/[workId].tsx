import React, { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { MemorySection } from '@/components/ui/MemorySection';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { BookHero } from '@/components/ui/BookHero';
import { MemoryCardPreview } from '@/components/memory/MemoryCardPreview';
import { JournalTimeline } from '@/components/memory/JournalTimeline';
import { ReadingExperienceTimeline } from '@/components/memory/ReadingExperienceTimeline';
import { ReadingRunsHistorySection } from '@/components/reading-runs/ReadingRunsHistorySection';
import { SpoilerHiddenNotice } from '@/components/journal/SpoilerHiddenNotice';
import { ShareCardActions } from '@/components/share/ShareCardActions';
import { useTheme } from '@/design/ThemeProvider';
import { memoryCardTemplateLabels, memoryCardTemplateDescriptions } from '@/design/i18n-labels';
import { REACTION_META, isReactionId } from '@/design/reactions';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useRating } from '@/features/book-details/useRating';
import { useReadingHistory } from '@/features/reading-session/useReadingHistory';
import { useReadingRunsDetail } from '@/features/reading-runs/useReadingRunsDetail';
import { useJournalEntries, useJournalRevisitLater } from '@/features/journal/useJournal';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { useGenresForWork } from '@/features/book-details/useGenres';
import { useBookMemory, useSetBookMemory } from '@/features/memory/useBookMemory';
import { useBookCapsule, useCurrentBookCapsule } from '@/features/memory/useBookCapsule';
import { useCapsuleRecallHistory } from '@/features/memory/useCapsuleRecall';
import { useLoreEntities } from '@/features/lore/useLoreEntities';
import { isSpoilerSafeActive, filterSpoilerSafeJournalEntries, filterSpoilerSafeLoreEntities } from '@/lib/spoilerSafe';
import { usePreReadingReflection } from '@/features/memory/usePreReadingReflection';
import { canCreateCapsule } from '@/lib/bookCapsule';
import { pickBeforeCardText } from '@/lib/beforeAfter';
import { computeBookStats } from '@/lib/bookStats';
import { useShareCard } from '@/features/share/useShareCard';
import { createLogger } from '@/lib/logger';
import type { Href } from 'expo-router';
import type { MemoryCardTemplateId } from '@/types/bookMemory';
import type { JournalEntry } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';
import type { UserBook, UserBookStatus } from '@/types/userBook';
import type { PreReadingReflection } from '@/types/preReadingReflection';
import type { BookCapsule } from '@/types/bookCapsule';

const log = createLogger('app/memory');

/**
 * SPOILER-SAFE MODE (ТЗ Фази 3 V1.6.1, аудит V1.6 §42.3) — цей екран (картка-спогад +
 * `JournalTimeline` шкала) раніше не фільтрував ЖОДНОГО зі своїх списків записів, на відміну від
 * `LoreSection` нижче на цьому самому екрані, яка вже коректно фільтрувала «Світ книги». Реальна
 * причина: `MemoryCardScreen` доступний і під час `'rereading'` (той самий інваріант, що й
 * `LoreSection`'s коментар — "доступний не лише для 'прочитано', а й під час 'перечитую'"), тож
 * і `selectedEntries` (записи, обрані для самої картки), і повний `allEntries`, що йде в
 * `JournalTimeline`, могли показати текст запису, зробленого ПІД ЧАС першого читання далі за
 * сюжетом, ніж зайшло поточне повторне читання. `MemoryCardPreview`/`JournalTimeline` тепер
 * отримують уже відфільтровані масиви (`visibleSelectedEntries`/`visibleAllEntries` нижче),
 * замість сирих `selectedEntries`/`allEntries` — той самий `filterSpoilerSafeJournalEntries`, що
 * й скрізь.
 */
const TEMPLATE_OPTIONS: { value: MemoryCardTemplateId; label: string }[] = (
  Object.keys(memoryCardTemplateLabels) as MemoryCardTemplateId[]
).map((id) => ({ value: id, label: memoryCardTemplateLabels[id] }));

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
 *
 * SPOILER-SAFE MODE (ТЗ Фази 3 V1.6.1) — «Повернутися пізніше» позначає запис для власного
 * майбутнього повернення, а не спойлер-безпечність; той самий ризик, що й у `JournalTimeline`
 * вище (екран доступний під час `'rereading'`), тож і тут — той самий
 * `filterSpoilerSafeJournalEntries` над уже завантаженим `entries`.
 */
function RevisitLaterSection({
  userBookId,
  spoilerContext,
}: {
  userBookId: string | undefined;
  spoilerContext: { active: boolean; currentPage: number | null; pageCount: number | null };
}) {
  const theme = useTheme();
  const { data: rawEntries } = useJournalRevisitLater(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const filteredEntries = filterSpoilerSafeJournalEntries(rawEntries ?? [], spoilerContext.active, {
    currentPage: spoilerContext.currentPage,
    pageCount: spoilerContext.pageCount,
  });
  // POLYTSIA V1.6.2, #166 — той самий "N приховано" + опційний reveal, що й `JournalTimeline`
  // вище на цьому екрані; окремий локальний стан (не спільний з timeline-перемикачем) — той
  // самий "маленький презентаційний блок без спільного стану" принцип, що й уже задокументований
  // над цим компонентом вище для `RevisitLaterEntryLine`.
  const [revealed, setRevealed] = useState(false);
  const hiddenCount = (rawEntries?.length ?? 0) - filteredEntries.length;
  const entries = revealed ? rawEntries ?? [] : filteredEntries;

  // Раніше — тихий `null`, коли всі позначені записи приховані (ані секції, ані пояснення).
  // Тепер секція лишається видимою, з поясненням+reveal, доки є ЩОСЬ — видиме чи приховане.
  if (entries.length === 0 && hiddenCount === 0) return null;

  return (
    <MemorySection icon="bookmark" title="Повернутися до цих думок">
      <View style={{ gap: theme.spacing.sm }}>
        {entries.map((entry) => (
          <RevisitLaterEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
        ))}
        <SpoilerHiddenNotice hiddenCount={hiddenCount} revealed={revealed} onToggleReveal={() => setRevealed((v) => !v)} />
      </View>
    </MemorySection>
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
 * Фаза 13 (Book Memory ungating + consolidation, mental model: "Capsule = тип reflection,
 * Recall = дія над Capsule") — ця секція тепер відповідає ЛИШЕ за сам вміст капсули
 * (створити/переглянути); кнопка «Згадати книгу» переїхала в окрему секцію "Пригадування"
 * (`RecallSection` нижче) одразу під цією — та сама дія, тепер під власною назвою, а не
 * підмінює собою основну кнопку капсули. На `app/completion/[workId].tsx` лишається власна,
 * незалежна копія цієї секції зі своєю кнопкою «Згадати книгу» — той екран поза межами цієї
 * фази (окрема точка входу одразу після фінішу книги, не частина хаба Book Memory).
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
  const { data: currentCapsule, isLoading: isCurrentLoading } = useCurrentBookCapsule(userBookId);

  if (isLoading || isCurrentLoading) return null;
  if (!capsule && !canCreateCapsule(status)) return null;

  // REREADING MODEL, Фаза 10 (`docs/READING_RUN.md` §"Фаза 10") — `capsule` (найновіша ЗАГАЛОМ)
  // і `currentCapsule` (капсула САМЕ поточного run) можуть розходитись: після завершення
  // перечитування без ще жодної нової капсули `capsule` і далі показує стару (з попереднього
  // прочитання), а `currentCapsule` — null. `canOfferNewCapsule` ловить саме цей розрив і додає
  // запрошення завести окрему капсулу для щойно завершеного прочитання, НЕ ховаючи стару.
  const canOfferNewCapsule = canCreateCapsule(status) && !currentCapsule;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="cube-outline" size={18} color={theme.colors.accent} />
        <AppText variant="body" color="secondary" style={{ flex: 1 }}>
          {capsule ? 'У цієї книги вже є капсула.' : "Залиш капсулу з кількома деталями на пам'ять."}
        </AppText>
      </View>
      <Button
        label={capsule ? 'Переглянути деталі' : 'Створити капсулу'}
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: capsule ? '/capsule/[workId]' : '/capsule/[workId]/edit',
            params: { workId },
          } as unknown as Href)
        }
      />
      {capsule && canOfferNewCapsule ? (
        <View
          style={{
            gap: theme.spacing.xs,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.sm,
          }}
        >
          <AppText variant="caption" color="secondary">
            Це прочитання ще без власної капсули.
          </AppText>
          <Button
            label="Залишити капсулу для цього прочитання"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/capsule/[workId]/edit',
                params: { workId, newRun: '1' },
              } as unknown as Href)
            }
          />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * «Пригадування» — Фаза 13 (Book Memory ungating + consolidation): "Recall = дія над Capsule",
 * тепер власна секція одразу під капсулою, а не кнопка, схована всередині `BookCapsuleSection`
 * (до цієї фази). Рендерить `null`, коли капсули ще нема — recall концептуально можливий лише
 * НАД уже наявною капсулою (той самий інваріант, що діяв і раніше: кнопка з'являлась лише коли
 * `capsule` існує).
 *
 * Показує історію попередніх спроб (`useCapsuleRecallHistory`, `CapsuleRecallRepository.
 * listByBookCapsuleId` — репозиторій-метод існував із самої Фази 5 як "заготовка для
 * майбутнього UI", `docs/RECALL.md`, і саме тут вперше отримує читача) — найновіша перша,
 * дата спроби + короткий текст "що пам'ятав тоді" (чи "без нотатки", якщо поле лишили
 * порожнім).
 */
function RecallSection({ workId, capsule }: { workId: string; capsule: BookCapsule | null | undefined }) {
  const theme = useTheme();
  const { data: history } = useCapsuleRecallHistory(capsule?.id);

  if (!capsule) return null;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="hourglass-outline" size={18} color={theme.colors.accent} />
        <AppText variant="body" color="secondary" style={{ flex: 1 }}>
          {history && history.length > 0
            ? `Ти згадував(ла) цю книгу ${history.length} раз(и).`
            : 'Повернись до капсули через якийсь час і згадай книгу знову.'}
        </AppText>
      </View>
      <Button
        label="Згадати книгу"
        variant="secondary"
        onPress={() => router.push({ pathname: '/recall/[workId]', params: { workId } } as unknown as Href)}
      />
      {history && history.length > 0 ? (
        <View
          style={{
            gap: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.sm,
          }}
        >
          {history.map((attempt) => (
            <View key={attempt.id} style={{ gap: 2 }}>
              <AppText variant="micro" color="tertiary">
                {new Date(attempt.recalledAt).toLocaleDateString('uk-UA')}
              </AppText>
              <AppText variant="caption" color="secondary" style={{ fontStyle: 'italic' }}>
                {attempt.currentMemoryText ? `«${attempt.currentMemoryText}»` : 'Без нотатки.'}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * «Світ книги» (POLYTSIA V1.6, Фаза 9 ТЗ, entry point #2 — Book Memory screen; перейменовано у
 * Фазі 10). Та сама компактна картка, що й `LoreSection` на `app/work/[workId].tsx`
 * (Book Details), навмисно продубльована локально — той самий підхід, що й
 * `BookCapsuleSection`/`RevisitLaterEntryLine` вище на цьому екрані.
 *
 * SPOILER-SAFE MODE (Фаза 11) — той самий фільтр, що й на Book Details (`app/work/[workId].tsx`
 * #LoreSection): актуально й тут, бо цей екран доступний не лише для "прочитано", а й під час
 * "перечитую" (`LibrarySection`'s "Переглянути підсумок читання"), коли спойлери щодо ще не
 * дочитаного повторного прочитання так само небажані.
 */
function LoreSection({
  workId,
  userBook,
  pageCount,
}: {
  workId: string;
  userBook: UserBook;
  pageCount: number | null;
}) {
  const theme = useTheme();
  const { data: entities, isLoading } = useLoreEntities(workId);
  if (isLoading) return null;

  const active = isSpoilerSafeActive(userBook.status, userBook.spoilerSafeEnabled);
  const visibleEntities = filterSpoilerSafeLoreEntities(entities ?? [], active, {
    currentPage: userBook.currentPage,
    pageCount,
  });
  const count = visibleEntities.length;

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
    <MemorySection icon="swap-horizontal-outline" title="До / Після" gap={theme.spacing.md}>
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
    </MemorySection>
  );
}

/**
 * Book Memory — «хаб пам'яті» про книгу (Milestone 11, Фаза 7-9; REREADING MODEL Фази 8, 12;
 * Фаза 13 — ungating + consolidation, `docs/READING_RUN.md` §"Фаза 13"). ДО Фази 13 весь екран
 * (усі секції нижче, не лише картка-спогад) був заблокований одним вузьким, необов'язковим
 * записом `book_memory` — читач, який регулярно позначав «Як читалося?», писав у щоденник,
 * лишив капсулу чи нотатку "До", але жодного разу не заповнив саме "Спогад про книгу" на
 * екрані підсумку, НІКОЛИ не бачив жодної зі своїх реальних даних тут (аудит V1.6.1, §10.4-10.5,
 * §"Пара 3"). Фаза 13 замінює той gate на `hasAnyMemoryData` нижче — екран доступний, щойно
 * ХОЧ ОДНЕ джерело пам'яті про книгу існує, і кожна секція показує/ховає себе НЕЗАЛЕЖНО від
 * решти, а не всі одразу за одним записом.
 *
 * Mental model consolidation (та сама аудиторська "Пара 3"): Book Memory — це ХАБ, Капсула —
 * ОДИН із типів рефлексії всередині нього (`BookCapsuleSection`), Пригадування — ДІЯ НАД
 * капсулою (`RecallSection`, більше не схована кнопка всередині капсули).
 */
export default function MemoryCardScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: memory, isLoading: isMemoryLoading } = useBookMemory(userBookId);
  const { data: allEntries, isLoading: isEntriesLoading } = useJournalEntries(userBookId);
  const { data: sessions, isLoading: isSessionsLoading } = useReadingHistory(userBookId);
  const { data: rating } = useRating(userBookId);
  const { data: preReadingReflection, isLoading: isBeforeAfterLoading } = usePreReadingReflection(userBookId);
  // Фаза 13 — той самий `useBookCapsule`, що й `BookCapsuleSection`/`RecallSection` нижче
  // (React Query дедуплікує однаковий ключ, нуль зайвих запитів до БД) — тут потрібен ЩЕ РАЗ,
  // на рівні екрана, для `hasAnyMemoryData` і щоб передати `capsule` у `RecallSection` як
  // проп (recall прив'язаний до КОНКРЕТНОЇ капсули, не резолвить її сам).
  const { data: capsule, isLoading: isCapsuleLoading } = useBookCapsule(userBookId);
  // Той самий "спільний хук, спільний кеш" принцип, що й на Book Details (Фаза 12) —
  // `ReadingRunsHistorySection` (тепер спільний компонент, `src/components/reading-runs/`)
  // рендерить результат напряму, без власного запиту.
  const { data: readingRuns, isLoading: isReadingRunsLoading } = useReadingRunsDetail(userBookId);
  const { data: loreEntities, isLoading: isLoreLoading } = useLoreEntities(workId);
  // Лише для "вайбу" водяного знаку картки (`MemoryCardPreview`) — порожній масив за
  // замовчуванням (доки завантажується/якщо жанрів нема) коректний сам по собі: тоді вайб
  // просто детермінований за `workId`, а не за жанром (`pickCardMood`).
  const { data: genres } = useGenresForWork(workId);
  const setMemory = useSetBookMemory();

  // Фаза 13 — замінює старий `!memory` gate (docs у коментарі над компонентом вище). Свідомо
  // НЕ включає `rating`/`genres` — вони не входять до 9 секцій цільової IA (рейтинг живе на
  // Book Details, тут лише як допоміжне поле всередині картки-спогаду/До-Після). Порожня Lore
  // секція нижче (`LoreSection`) рендериться ЗАВЖДИ, коли є `userBook` (легке запрошення
  // завести персонажів, той самий підхід, що діяв і до Фази 13) — тому саме наявність СТВОРЕНИХ
  // `loreEntities`, а не сам факт існування секції, бере участь тут.
  const isMemoryDataLoading =
    isMemoryLoading ||
    isEntriesLoading ||
    isBeforeAfterLoading ||
    isCapsuleLoading ||
    isReadingRunsLoading ||
    isLoreLoading ||
    isSessionsLoading;
  const hasAnyMemoryData =
    !!memory ||
    !!preReadingReflection ||
    !!capsule ||
    (allEntries?.length ?? 0) > 0 ||
    (loreEntities?.length ?? 0) > 0 ||
    (readingRuns?.length ?? 0) > 0 ||
    (sessions?.length ?? 0) > 0;

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

  // POLYTSIA V1.7, Phase 5 (SHARE INFRASTRUCTURE CONSOLIDATION, ТЗ §13/§98) — захоплення картки,
  // системне «Поділитися», збереження в галерею й уся обробка дозволів тепер в одному місці
  // (`useShareCard`), спільному з Сезонами, Відбитком і Recap. До цього тут жила власна копія
  // тих самих ~60 рядків.
  const shareController = useShareCard({ cardRef, dialogTitle: 'Спогад про книгу', log });

  const selectedEntries = useMemo(() => {
    if (!memory || !allEntries) return [];
    const ids = new Set(memory.entryRefs.map((ref) => ref.id));
    return allEntries.filter((entry) => ids.has(entry.id));
  }, [memory, allEntries]);

  // SPOILER-SAFE MODE — див. коментар над `TEMPLATE_OPTIONS`. Навмисно похідні від СИРИХ
  // `selectedEntries`/`allEntries` (а не навпаки) — `handleTemplateChange` нижче зберігає
  // `memory.entryRefs` напряму з уже завантаженого `memory`, не з цих відфільтрованих масивів,
  // тож приховування тут — лише про те, що видно на екрані, і жодним чином не може тихо
  // змінити, які записи насправді закріплені за карткою в БД.
  const spoilerSafeActive = data?.userBook
    ? isSpoilerSafeActive(data.userBook.status, data.userBook.spoilerSafeEnabled)
    : false;
  const currentPage = data?.userBook?.currentPage ?? null;
  const pageCount = data?.primaryEdition?.pageCount ?? null;
  const visibleSelectedEntries = useMemo(
    () => filterSpoilerSafeJournalEntries(selectedEntries, spoilerSafeActive, { currentPage, pageCount }),
    [selectedEntries, spoilerSafeActive, currentPage, pageCount],
  );
  const filteredAllEntries = useMemo(
    () => filterSpoilerSafeJournalEntries(allEntries ?? [], spoilerSafeActive, { currentPage, pageCount }),
    [allEntries, spoilerSafeActive, currentPage, pageCount],
  );
  // POLYTSIA V1.6.2, #166 — ручний reveal ЛИШЕ для шкали щоденника (`JournalTimeline`), не для
  // `visibleSelectedEntries`: ті йдуть у `MemoryCardPreview`, яку `captureRef` перетворює на
  // зображення для "Поділитися"/збереження в галерею — reveal, що впливає на вміст того
  // зображення, міг би лишити спойлер у файлі, який користувач потім комусь надішле чи збереже
  // назавжди, задовго після того, як сам перемикач тут забувся. Картка-спогад лишається
  // спойлер-безпечною завжди, незалежно від цього перемикача.
  const [timelineRevealed, setTimelineRevealed] = useState(false);
  const hiddenTimelineCount = (allEntries?.length ?? 0) - filteredAllEntries.length;
  const visibleAllEntries = timelineRevealed ? allEntries ?? [] : filteredAllEntries;

  const stats = computeBookStats({
    sessions,
    pageCount: data?.primaryEdition?.pageCount,
    currentPage: data?.userBook?.currentPage,
    startedAt: data?.userBook?.startedAt,
    finishedAt: data?.userBook?.finishedAt,
  });

  // Фаза 13 — раніше вимагала `!memory` (шаблон можна було міняти лише для вже наявного
  // спогаду); тепер, коли секція "Підсумковий спогад" видна й БЕЗ жодного попереднього запису
  // (ungating, коментар над компонентом), вибір шаблону сам створює порожній спогад цього run
  // (`upsertCurrent` — та сама мутація, що вже вміла і insert, і update).
  const handleTemplateChange = (templateId: MemoryCardTemplateId) => {
    if (!userBookId) return;
    setTemplateOverride(templateId);
    setMemory.mutate(
      {
        userBookId,
        reflection: memory?.reflection ?? null,
        entryRefs: memory?.entryRefs ?? [],
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
          title: "Пам'ять про книгу",
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isMemoryDataLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook ? (
          <AppText variant="body" color="secondary">
            Ця книга ще не в твоїй бібліотеці.
          </AppText>
        ) : !hasAnyMemoryData ? (
          // Фаза 13 — новий, змістовний порожній стан замість старого "Спершу створи спогад..."
          // без жодного виходу (аудит §10.5: "єдиний обхідний шлях... про що ніщо на самому
          // екрані не підказує"). Тепер — Hero (щоб було зрозуміло, про яку книгу мова) + одне
          // речення, що саме сюди потрапить, + кнопка назад до книги, де все це й починається
          // (сесія читання, нотатка "До", капсула...).
          <View style={{ gap: theme.spacing.lg }}>
            <BookHero
              title={data.work.title}
              authors={authorNames}
              coverUrl={data.primaryEdition?.coverUrl}
              coverFallbackColor={data.work.coverFallbackColor}
            />
            <Card style={{ gap: theme.spacing.sm }}>
              <AppText variant="body" color="secondary">
                Тут з&apos;явиться все, що ти збереш про цю книгу: спогад, порівняння
                &quot;До/Після&quot;, капсула, світ персонажів, історія прочитань — щойно
                з&apos;явиться хоч щось одне.
              </AppText>
              <Button
                label="До книги"
                variant="secondary"
                onPress={() => router.push({ pathname: '/work/[workId]', params: { workId } } as unknown as Href)}
              />
            </Card>
          </View>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <BookHero
              title={data.work.title}
              authors={authorNames}
              coverUrl={data.primaryEdition?.coverUrl}
              coverFallbackColor={data.work.coverFallbackColor}
            />

            {/* Фаза 13 — "Історія прочитань", той самий спільний компонент, що й Book Details
             * (Фаза 12). Показується лише коли книга має хоч один `reading_run` — легасі-книги
             * без жодного (Фаза 7 `addToLibrary`, ніколи не читана) просто не мають секції. */}
            {readingRuns && readingRuns.length > 0 ? (
              <CollapsibleSection title="Історія прочитань">
                <ReadingRunsHistorySection workId={data.work.id} details={readingRuns} />
              </CollapsibleSection>
            ) : null}

            {/* «Підсумковий спогад» — картка-спогад (Milestone 11, Фаза 8-9): шаблон, живий
             * preview, "Поділитися"/"Зберегти в галерею". Фаза 13 — доступна ТЕПЕР і без
             * жодного попереднього запису `book_memory` (`reflection`/`entryRefs` фолбечать на
             * `null`/`[]` через `memory?.` нижче й у `handleTemplateChange` вище) — вибір
             * шаблону сам створює перший, порожній спогад цього прочитання. */}
            <AppText variant="heading">Підсумковий спогад</AppText>

            <View ref={cardRef} collapsable={false}>
              <MemoryCardPreview
                template={displayedTemplate}
                work={{
                  title: data.work.title,
                  authorNames,
                  coverUrl: data.primaryEdition?.coverUrl,
                  coverFallbackColor: data.work.coverFallbackColor,
                }}
                reflection={memory?.reflection ?? null}
                entries={visibleSelectedEntries}
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

            <ShareCardActions controller={shareController} />

            {preReadingReflection ? (
              <BeforeAfterSection
                reflection={preReadingReflection}
                afterText={memory?.reflection ?? null}
                actualRating={rating?.value ?? null}
              />
            ) : null}

            <BookCapsuleSection
              userBookId={data.userBook.id}
              workId={data.work.id}
              status={data.userBook.status}
            />

            <RecallSection workId={data.work.id} capsule={capsule} />

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
              entries={visibleAllEntries}
              pageCount={data.primaryEdition?.pageCount ?? null}
              userBookId={userBookId}
            />
            <SpoilerHiddenNotice
              hiddenCount={hiddenTimelineCount}
              revealed={timelineRevealed}
              onToggleReveal={() => setTimelineRevealed((v) => !v)}
            />

            <RevisitLaterSection
              userBookId={userBookId}
              spoilerContext={{ active: spoilerSafeActive, currentPage, pageCount }}
            />

            <LoreSection
              workId={data.work.id}
              userBook={data.userBook}
              pageCount={data.primaryEdition?.pageCount ?? null}
            />
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
