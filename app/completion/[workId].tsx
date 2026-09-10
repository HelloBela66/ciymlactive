import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { StarRating } from '@/components/ui/StarRating';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useRating, useSetRating } from '@/features/book-details/useRating';
import { useReadingHistory } from '@/features/reading-session/useReadingHistory';
import { useJournalCount, useJournalEntries, useJournalFavorites } from '@/features/journal/useJournal';
import { useBookMemory, useRemoveBookMemory, useSetBookMemory } from '@/features/memory/useBookMemory';
import { formatDuration } from '@/lib/sessionTiming';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { computeBookStats } from '@/lib/bookStats';
import { REACTION_META, isReactionId } from '@/design/reactions';
import type { JournalEntry } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

/** "12 серпня — 7 вересня" — без року, крім рідкісного випадку, коли читання розтягнулось
 * через межу року (тоді рік дописується до обох дат, інакше діапазон читався б як помилка). */
function formatDateRange(range: { startIso: string; endIso: string }): string {
  const start = parseISO(range.startIso);
  const end = parseISO(range.endIso);
  const sameYear = start.getFullYear() === end.getFullYear();
  const pattern = sameYear ? 'd MMMM' : 'd MMMM yyyy';
  return `${format(start, pattern, { locale: uk })} — ${format(end, pattern, { locale: uk })}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1, gap: theme.spacing.xs }}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </Card>
  );
}

/** Один рядок вибраного запису в готовому (не-редагованому) вигляді спогаду — винесено з
 * `BookMemorySection`, бо тепер малюється у двох групах ("Цитати"/"Думки", доповнення) замість
 * одного плаского списку. Показує іконку реакції поруч із міткою типу, коли вона є (Milestone
 * 11, доповнення — "настрій" запису), щоб дві пов'язані фічі — реакції й спогад — візуально
 * трималися разом. */
function MemoryEntryLine({
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
 * «Спогад про книгу» (Milestone 11, Фаза 7) — компонування прямо на підсумку читання
 * (узгоджено з користувачем: не окрема кнопка на Book Details і не дія просто з картки
 * запису щоденника, а саме тут, серед іншої статистики щойно прочитаної книги). Свідомо
 * ЛЕГКА версія: текст-рефлексія + вибір записів щоденника з уже наявного `useJournalFavorites`
 * (п.16 ТЗ, "обране спершу" — хук існував ще з Фази 2 саме для цього). "Що показати" — тут;
 * "яким шаблоном показати" (Фаза 8) — на окремому екрані `app/memory/[workId].tsx`, куди
 * веде кнопка "Переглянути картку" нижче, щойно спогад збережено.
 *
 * Композер — той самий "розгорнути форму" патерн, що й `JournalSection` на Book Details
 * (`app/work/[workId].tsx`), для узгодженості: перегляд згорнутий за замовчуванням, редагування
 * — окремий явний режим, а не завжди відкрита форма.
 */
function BookMemorySection({ userBookId, workId }: { userBookId: string; workId: string }) {
  const theme = useTheme();
  const { data: memory } = useBookMemory(userBookId);
  const { data: favorites } = useJournalFavorites(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const setMemory = useSetBookMemory();
  const removeMemory = useRemoveBookMemory();

  const [isEditing, setIsEditing] = useState(false);
  const [reflection, setReflection] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Обране, якщо воно є (п.16 ТЗ) — і лише коли обраних немає взагалі, пропонуємо вибирати з
  // усіх записів книги: інакше щойно прочитана книга без жодної позначки "обране" лишала б
  // спогад узагалі без записів на вибір, хоча щоденник у неї міг бути повний.
  const pickerEntries = favorites && favorites.length > 0 ? favorites : (allEntries ?? []);
  const usingAllAsFallback = !(favorites && favorites.length > 0) && (allEntries?.length ?? 0) > 0;

  const selectedEntries = useMemo(() => {
    if (!memory || !allEntries) return [];
    const ids = new Set(memory.entryRefs.map((ref) => ref.id));
    return allEntries.filter((entry) => ids.has(entry.id));
  }, [memory, allEntries]);

  // "Цитати"/"Думки" окремими підрозділами (доповнення) — той самий поділ, що й `kind` уже
  // визначає в решті щоденника, лише тут ще й візуально групує вибрані записи спогаду.
  const selectedQuotes = useMemo(() => selectedEntries.filter((e) => e.kind === 'quote'), [selectedEntries]);
  const selectedNotes = useMemo(() => selectedEntries.filter((e) => e.kind === 'note'), [selectedEntries]);

  const hasMemory = !!memory && (!!memory.reflection?.trim() || selectedEntries.length > 0);

  const startEditing = () => {
    setReflection(memory?.reflection ?? '');
    setSelectedIds(new Set((memory?.entryRefs ?? []).map((ref) => ref.id)));
    setIsEditing(true);
  };

  const toggleEntry = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = () => {
    const byId = new Map((allEntries ?? []).map((entry) => [entry.id, entry]));
    const entryRefs = Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter((entry): entry is JournalEntry => !!entry)
      .map((entry) => ({ id: entry.id, kind: entry.kind }));

    // Шаблон картки (Фаза 8) редагується окремо, на екрані самої картки
    // (`app/memory/[workId].tsx`) — тут лише зберігаємо той, що вже був обраний, або дефолтний
    // 'classic' для щойно створеного спогаду.
    setMemory.mutate(
      { userBookId, reflection: reflection.trim() || null, entryRefs, templateId: memory?.templateId ?? 'classic' },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const handleRemove = () => {
    if (!memory) return;
    removeMemory.mutate({ id: memory.id, userBookId }, { onSuccess: () => setIsEditing(false) });
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
        <AppText variant="heading">Спогад про книгу</AppText>
      </View>

      {isEditing ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <LabeledInput
            label="Кілька слів про цю книгу (необов'язково)"
            value={reflection}
            onChangeText={setReflection}
            multiline
            style={{ minHeight: 72, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
          />

          <AppText variant="caption" color="secondary">
            {usingAllAsFallback
              ? 'Обраних записів ще немає — обери зі всього щоденника книги. Познач цитати чи нотатки "обраними", щоб наступного разу вони показувались першими.'
              : 'Обрані записи щоденника цієї книги — познач ті, що хочеш лишити в спогаді.'}
          </AppText>

          {pickerEntries.length === 0 ? (
            <AppText variant="caption" color="tertiary">
              У щоденнику цієї книги ще немає жодного запису — спершу додай нотатку чи цитату на
              екрані книги.
            </AppText>
          ) : (
            <View style={{ gap: theme.spacing.xs }}>
              {pickerEntries.map((entry) => {
                const selected = selectedIds.has(entry.id);
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => toggleEntry(entry.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${resolveEntryTypeLabel(entry, categoriesById)}: ${entry.text}`}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: theme.spacing.sm,
                        padding: theme.spacing.sm,
                        borderRadius: theme.radius.md,
                        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.bg,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.accent : theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: theme.radius.pill,
                          borderWidth: 2,
                          borderColor: selected ? theme.colors.accent : theme.colors.textTertiary,
                          backgroundColor: selected ? theme.colors.accent : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 2,
                        }}
                      >
                        {selected ? <Ionicons name="checkmark" size={13} color={theme.colors.onAccent} /> : null}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="micro" color="accent">
                          {resolveEntryTypeLabel(entry, categoriesById)}
                          {entry.page != null ? ` · с. ${entry.page}` : ''}
                        </AppText>
                        <AppText
                          variant="caption"
                          numberOfLines={2}
                          style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}
                        >
                          {entry.text}
                        </AppText>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                label={setMemory.isPending ? 'Зберігаю…' : 'Зберегти спогад'}
                onPress={handleSave}
                disabled={setMemory.isPending}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Скасувати" variant="secondary" onPress={() => setIsEditing(false)} />
            </View>
          </View>

          {memory ? (
            <Pressable onPress={handleRemove} accessibilityRole="button" accessibilityLabel="Видалити спогад">
              <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                Видалити спогад
              </AppText>
            </Pressable>
          ) : null}
        </Card>
      ) : hasMemory ? (
        <Card style={{ gap: theme.spacing.sm }}>
          {memory?.reflection ? (
            <AppText variant="body" style={{ fontStyle: 'italic' }}>
              «{memory.reflection}»
            </AppText>
          ) : null}
          {selectedQuotes.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                Цитати
              </AppText>
              {selectedQuotes.map((entry) => (
                <MemoryEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
              ))}
            </View>
          ) : null}
          {selectedNotes.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                Думки
              </AppText>
              {selectedNotes.map((entry) => (
                <MemoryEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
              ))}
            </View>
          ) : null}
          <Button
            label="Переглянути картку"
            variant="secondary"
            onPress={() =>
              // `/memory/[workId]` — новий маршрут (Фаза 8), локальний кеш типізованих
              // маршрутів Expo Router (`.expo/types/router.d.ts`) генерується Metro лише при
              // `expo start` і ненадійно встигає за щойно доданими файлами при `tsc` —
              // той самий фікс, що й для `/journal`/`/completion/[workId]` раніше
              // (Milestone 9 fix2, Фаза 4/6).
              router.push({ pathname: '/memory/[workId]', params: { workId } } as unknown as Href)
            }
          />
          <Pressable onPress={startEditing} accessibilityRole="button" accessibilityLabel="Редагувати спогад">
            <AppText variant="caption" color="accent" style={{ textAlign: 'center' }}>
              Редагувати спогад
            </AppText>
          </Pressable>
        </Card>
      ) : (
        <Card style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
          <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            Додай кілька слів і улюблені цитати чи нотатки про цю книгу — з цього згодом
            вийде гарна картка-спогад.
          </AppText>
          <Button label="Створити спогад" variant="secondary" onPress={startEditing} />
        </Card>
      )}
    </View>
  );
}

/**
 * Підсумок читання книги (Milestone 11, Фаза 6) — "Book Completion Summary" з ТЗ. Той самий
 * дух, що й річний Wrapped (`app/wrapped/[year].tsx`, `StatTile`-сітка), лише про одну книгу
 * й з єдиним реальним тригером у цьому застосунку: `user_book.status` переходить у `'finished'`
 * ЛИШЕ через ручний перемикач статусу на Book Details (`LibrarySection`) — завершення сесії
 * читання саме по собі статус не міняє (`ReadingSessionRepository.finish`). Тому єдина точка
 * входу — `handleStatusChange` там-таки, одразу після успішного переходу в "Прочитано".
 *
 * Екран навмисно ще й РЕВІЗИТУЄМИЙ (не одноразовий модальний спалах) — та сама книга
 * "Переглянути підсумок читання" з Book Details веде сюди знову, коли статус уже "Прочитано"/
 * "Перечитую": дані (час, сторінки, сесії) не змінюються заднім числом, тож показувати їх
 * повторно — абсолютно нормально, на відміну від одноразового модального діалогу.
 *
 * Дані читаються за `workId` (як і сам Book Details) — та сама причина, що й там: маршрути
 * застосунку йдуть через Work, а не UserBook напряму.
 */
export default function CompletionSummaryScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: sessions } = useReadingHistory(userBookId);
  const { data: journalCount } = useJournalCount(userBookId);
  const { data: rating } = useRating(userBookId);
  const setRating = useSetRating();

  // Арифметика винесена в чисту функцію (`src/lib/bookStats.ts`, Фаза 8) — та сама статистика
  // потрібна й картці-спогаду (`app/memory/[workId].tsx`), щоб цифри на обох екранах про ту
  // саму книгу ніколи не розходились.
  const { totalSeconds, sessionCount, pagesRead, days, pagesPerHour, dateRange } = computeBookStats({
    sessions,
    pageCount: data?.primaryEdition?.pageCount,
    currentPage: data?.userBook?.currentPage,
    startedAt: data?.userBook?.startedAt,
    finishedAt: data?.userBook?.finishedAt,
  });

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
        ) : isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook ? (
          <AppText variant="body" color="secondary">
            Книгу не знайдено в бібліотеці.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.xl }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-circle" size={30} color={theme.colors.accent} />
              </View>
              <AppText variant="display" style={{ textAlign: 'center' }}>
                Прочитано!
              </AppText>

              <View style={{ marginTop: theme.spacing.md }}>
                <CoverThumbnail
                  coverUrl={data.primaryEdition?.coverUrl}
                  title={data.work.title}
                  fallbackColor={data.work.coverFallbackColor}
                  width={104}
                  height={152}
                  borderRadius={theme.radius.md}
                />
              </View>
              <AppText variant="title" style={{ textAlign: 'center' }}>
                {data.work.title}
              </AppText>
              {data.work.authors.length > 0 ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  {data.work.authors.map((a) => a.name).join(', ')}
                </AppText>
              ) : null}
              {dateRange ? (
                <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                  {formatDateRange(dateRange)}
                </AppText>
              ) : null}
            </View>

            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <StatTile
                  label="Час читання"
                  value={totalSeconds > 0 ? formatDuration(totalSeconds * 1000) : '—'}
                />
                <StatTile label="Сторінок прочитано" value={pagesRead != null ? String(pagesRead) : '—'} />
              </View>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <StatTile label="Сесій читання" value={String(sessionCount)} />
                <StatTile
                  label="Тривалість читання"
                  value={days != null ? `${days} ${pluralizeUk(days, DAY_FORMS)}` : '—'}
                />
              </View>
              {pagesPerHour != null ? (
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Ionicons name="speedometer-outline" size={20} color={theme.colors.accent} />
                  <AppText variant="body" color="secondary" style={{ flex: 1 }}>
                    Темп читання — {pagesPerHour} стор/год
                  </AppText>
                </Card>
              ) : null}
            </View>

            {journalCount && journalCount > 0 ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Ionicons name="book-outline" size={20} color={theme.colors.accent} />
                <AppText variant="body" color="secondary" style={{ flex: 1 }}>
                  {journalCount} {pluralizeUk(journalCount, ENTRY_FORMS)} у щоденнику цієї книги
                </AppText>
              </Card>
            ) : null}

            <BookMemorySection userBookId={data.userBook.id} workId={data.work.id} />

            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="heading">{rating ? 'Твоя оцінка' : 'Постав оцінку'}</AppText>
              <StarRating
                value={rating?.value ?? null}
                onChange={(value) =>
                  setRating.mutate({ userBookId: data.userBook!.id, value, review: rating?.review ?? null })
                }
              />
            </View>

            <Button
              label="До деталей книги"
              variant="secondary"
              onPress={() => router.replace({ pathname: '/work/[workId]', params: { workId: data.work.id } })}
            />
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
