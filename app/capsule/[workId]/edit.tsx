import React, { useMemo, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useJournalEntries, useJournalFavorites } from '@/features/journal/useJournal';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { useBookCapsule, useCreateBookCapsule, useUpdateBookCapsule } from '@/features/memory/useBookCapsule';
import { validateCapsuleContent, canCreateCapsule } from '@/lib/bookCapsule';
import type { CapsuleReopenOption } from '@/types/bookCapsule';
import type { JournalEntry } from '@/types/journalEntry';

const REOPEN_OPTIONS: { value: CapsuleReopenOption; label: string }[] = [
  { value: 'none', label: 'Без нагадування' },
  { value: '3_months', label: 'Через 3 місяці' },
  { value: '6_months', label: 'Через 6 місяців' },
  { value: '1_year', label: 'Через рік' },
];

interface CapsuleFormState {
  lastingThought: string;
  oneSentenceMemory: string;
  favoriteCharacterText: string;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
}

const EMPTY_FORM: CapsuleFormState = {
  lastingThought: '',
  oneSentenceMemory: '',
  favoriteCharacterText: '',
  journalEntryId: null,
  reopenOption: 'none',
};

function formsEqual(a: CapsuleFormState, b: CapsuleFormState): boolean {
  return (
    a.lastingThought === b.lastingThought &&
    a.oneSentenceMemory === b.oneSentenceMemory &&
    a.favoriteCharacterText === b.favoriteCharacterText &&
    a.journalEntryId === b.journalEntryId &&
    a.reopenOption === b.reopenOption
  );
}

/**
 * «Капсула книги» — Create/Edit screen (POLYTSIA V1.6, Фаза 4, п.4-9/14/16-17 ТЗ). Один
 * прокручуваний екран, без багатокрокового візарда (п.4 ТЗ — "мінімум тертя"): усі поля відразу
 * видно, збереження — одна кнопка внизу. Режим (створення/редагування) визначається наявністю
 * вже створеної капсули (`useBookCapsule`), не окремим параметром маршруту — та сама форма для
 * обох випадків (редагування пізніше не повинно виглядати як інший інструмент).
 */
export default function BookCapsuleEditScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: capsule, isLoading: isCapsuleLoading } = useBookCapsule(userBookId);
  const { data: favorites } = useJournalFavorites(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const createCapsule = useCreateBookCapsule();
  const updateCapsule = useUpdateBookCapsule();
  const isSaving = createCapsule.isPending || updateCapsule.isPending;

  const [form, setForm] = useState<CapsuleFormState>(EMPTY_FORM);
  // `null` = форма ще не заповнена початковими даними капсули. Навмисно `useState`, а не
  // `useRef`+`useEffect`: ESLint (`react-hooks/set-state-in-effect`, `react-hooks/refs`)
  // забороняє і виклик `setState` всередині ефекту, і читання `ref.current` під час рендеру —
  // натомість це офіційний React-патерн "adjust state while rendering" (react.dev): заповнюємо
  // форму РІВНО ОДИН РАЗ, коли дані вже відомі (капсула завантажена — існує вона, чи ні),
  // синхронно під час рендеру, без зайвого проміжного рендеру, який дав би ефект.
  const [initialForm, setInitialForm] = useState<CapsuleFormState | null>(null);

  if (initialForm === null && !isCapsuleLoading) {
    const next: CapsuleFormState = capsule
      ? {
          lastingThought: capsule.lastingThought ?? '',
          oneSentenceMemory: capsule.oneSentenceMemory ?? '',
          favoriteCharacterText: capsule.favoriteCharacterText ?? '',
          journalEntryId: capsule.journalEntryId,
          reopenOption: capsule.reopenOption,
        }
      : EMPTY_FORM;
    setForm(next);
    setInitialForm(next);
  }

  const isDirty = initialForm !== null && !formsEqual(form, initialForm);

  // Той самий "обране спершу, з фолбеком на все" патерн, що й `BookMemorySection`
  // (`app/completion/[workId].tsx`) — консистентний вибір джерела для пов'язаного моменту.
  const pickerEntries = favorites && favorites.length > 0 ? favorites : (allEntries ?? []);
  const usingAllAsFallback = !(favorites && favorites.length > 0) && (allEntries?.length ?? 0) > 0;

  const selectedEntry = useMemo(
    () => (allEntries ?? []).find((entry) => entry.id === form.journalEntryId) ?? null,
    [allEntries, form.journalEntryId],
  );

  const canSave = validateCapsuleContent({
    lastingThought: form.lastingThought,
    oneSentenceMemory: form.oneSentenceMemory,
    favoriteCharacterText: form.favoriteCharacterText,
    journalEntryId: form.journalEntryId,
  });

  const toggleEntry = (entry: JournalEntry) => {
    setForm((prev) => ({
      ...prev,
      journalEntryId: prev.journalEntryId === entry.id ? null : entry.id,
    }));
  };

  const confirmDiscard = (onConfirm: () => void) => {
    if (!isDirty) {
      onConfirm();
      return;
    }
    Alert.alert('Вийти без збереження?', 'Уведені зміни в капсулі буде втрачено.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Вийти', style: 'destructive', onPress: onConfirm },
    ]);
  };

  const handleBack = () => confirmDiscard(() => router.back());

  const handleSave = () => {
    if (!userBookId || !data) return;
    const journalEntryKind = selectedEntry?.kind ?? null;
    const workTitle = data.work.title;

    const onSaved = (notificationSkipped: boolean) => {
      if (notificationSkipped) {
        Alert.alert(
          'Капсулу збережено',
          "Нагадування не заплановано — дозволь сповіщення в налаштуваннях пристрою, якщо захочеш отримати нагадування пізніше.",
          [{ text: 'Гаразд', onPress: () => router.back() }],
        );
        return;
      }
      router.back();
    };

    if (capsule) {
      updateCapsule.mutate(
        {
          id: capsule.id,
          userBookId,
          workTitle,
          lastingThought: form.lastingThought,
          oneSentenceMemory: form.oneSentenceMemory,
          favoriteCharacterText: form.favoriteCharacterText,
          journalEntryKind,
          journalEntryId: form.journalEntryId,
          reopenOption: form.reopenOption,
        },
        { onSuccess: (result) => onSaved(result.notificationSkipped) },
      );
    } else {
      createCapsule.mutate(
        {
          userBookId,
          workTitle,
          lastingThought: form.lastingThought,
          oneSentenceMemory: form.oneSentenceMemory,
          favoriteCharacterText: form.favoriteCharacterText,
          journalEntryKind,
          journalEntryId: form.journalEntryId,
          reopenOption: form.reopenOption,
          completedAt: data.userBook?.finishedAt ?? null,
        },
        { onSuccess: (result) => onSaved(result.notificationSkipped) },
      );
    }
  };

  // П.33 ТЗ — капсула лише для прочитаних книг. Реальні точки входу (запрошення на
  // Completion/Memory screens) уже самі показуються лише для `finished`, це — друга лінія
  // захисту напряму на екрані форми (той самий "кожен екран сам перевіряє" підхід, що й
  // `!data.userBook` нижче).
  const blockedByStatus =
    !capsule && !isCapsuleLoading && !!data?.userBook && !canCreateCapsule(data.userBook.status);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: capsule ? 'Редагування капсули' : 'Нова капсула',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Назад"
              hitSlop={8}
              style={{ paddingHorizontal: theme.spacing.xs }}
            >
              <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
            </Pressable>
          ),
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isCapsuleLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook ? (
          <AppText variant="body" color="secondary">
            Книгу не знайдено в бібліотеці.
          </AppText>
        ) : blockedByStatus ? (
          <AppText variant="body" color="secondary">
            Капсулу можна створити лише для прочитаної книги.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <AppText variant="body" color="secondary">
              {capsule
                ? 'Пара слів, які лишаться з тобою після цієї книги.'
                : "Кілька особистих деталей на пам'ять — не рецензія, лише для тебе."}
            </AppText>

            <Card style={{ gap: theme.spacing.md }}>
              <LabeledInput
                label="Що залишиться з тобою після цієї книги?"
                placeholder="Одна стійка думка, з якою ти закрив книгу…"
                value={form.lastingThought}
                onChangeText={(text) => setForm((prev) => ({ ...prev, lastingThought: text }))}
                multiline
                maxLength={2000}
                style={{ minHeight: 96, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
              />

              <LabeledInput
                label="Одним реченням: про що ця книга була для тебе?"
                placeholder="Не переказ сюжету — особисте враження"
                value={form.oneSentenceMemory}
                onChangeText={(text) => setForm((prev) => ({ ...prev, oneSentenceMemory: text }))}
                multiline
                maxLength={500}
                style={{ minHeight: 72, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
              />

              <LabeledInput
                label="Улюблений персонаж або герой"
                placeholder="Необов'язково"
                value={form.favoriteCharacterText}
                onChangeText={(text) => setForm((prev) => ({ ...prev, favoriteCharacterText: text }))}
                maxLength={200}
              />

              <View style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary">
                  Момент щоденника, до якого хочеш повернутися
                </AppText>
                {pickerEntries.length === 0 ? (
                  <AppText variant="caption" color="tertiary">
                    У щоденнику цієї книги ще немає жодного запису.
                  </AppText>
                ) : (
                  <>
                    <AppText variant="caption" color="tertiary">
                      {usingAllAsFallback
                        ? "Обраних записів немає — обери зі всього щоденника книги (необов'язково)."
                        : "Спершу — обрані записи щоденника книги (необов'язково)."}
                    </AppText>
                    <View style={{ gap: theme.spacing.xs }}>
                      {pickerEntries.map((entry) => {
                        const selected = form.journalEntryId === entry.id;
                        return (
                          <Pressable
                            key={entry.id}
                            onPress={() => toggleEntry(entry)}
                            accessibilityRole="radio"
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
                                {selected ? (
                                  <Ionicons name="checkmark" size={13} color={theme.colors.onAccent} />
                                ) : null}
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
                  </>
                )}
              </View>

              <ChipSelect
                label="Коли нагадати про капсулу?"
                options={REOPEN_OPTIONS}
                value={form.reopenOption}
                onChange={(value) => setForm((prev) => ({ ...prev, reopenOption: value }))}
                disabled={isSaving}
              />
            </Card>

            <View style={{ gap: theme.spacing.xs }}>
              <Button
                label={isSaving ? 'Зберігаю…' : 'Зберегти капсулу'}
                onPress={handleSave}
                disabled={!canSave || isSaving}
              />
              {!canSave ? (
                <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                  Додай хоча б одну деталь, щоб зберегти капсулу.
                </AppText>
              ) : null}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
