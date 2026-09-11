import React, { useMemo, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useJournalEntries } from '@/features/journal/useJournal';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import {
  useLinkedJournalEntryIds,
  useLinkJournalEntry,
  useLoreEntities,
  useRemoveLoreEntity,
  useSetLoreEntityFavorite,
  useUnlinkJournalEntry,
  useUpdateLoreEntity,
} from '@/features/lore/useLoreEntities';
import { LORE_ENTITY_REACTION_META, LORE_ENTITY_REACTION_ORDER, isLoreEntityReactionId } from '@/design/loreEntityReaction';
import { LORE_ENTITY_TYPE_META } from '@/design/loreEntityType';
import type { JournalEntry } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';

/** Ряд чипів реакції — той самий "тап на вже обране знімає вибір" підхід, що й `ReactionChips`
 * (`src/components/journal/ReactionPicker.tsx`), продубльований локально (тут лише 6 значень,
 * один рядок, окремий переюзабельний компонент не виправданий заради одного місця показу). */
function ReactionRow({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  const theme = useTheme();
  const selected = value && isLoreEntityReactionId(value) ? value : null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {LORE_ENTITY_REACTION_ORDER.map((id) => {
        const meta = LORE_ENTITY_REACTION_META[id];
        const isSelected = selected === id;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(isSelected ? null : id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={meta.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              minHeight: theme.minTouchTarget,
              borderRadius: theme.radius.pill,
              backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface,
              borderWidth: 1,
              borderColor: isSelected ? theme.colors.accent : theme.colors.border,
            }}
          >
            <Ionicons name={meta.icon} size={14} color={isSelected ? theme.colors.onAccent : theme.colors.textSecondary} />
            <AppText variant="caption" color={isSelected ? 'onAccent' : 'secondary'}>
              {meta.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Один рядок пікера "пов'язати запис щоденника" — той самий чекбокс-рядок, що й у
 * `app/capsule/[workId]/edit.tsx` (вибір моменту для капсули), лише тут вибір НЕ ексклюзивний
 * (елемент лору може бути пов'язаний з кількома записами). */
function LinkableEntryRow({
  entry,
  linked,
  onToggle,
  categoriesById,
}: {
  entry: JournalEntry;
  linked: boolean;
  onToggle: () => void;
  categoriesById: ReadonlyMap<string, NoteCategory>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: linked }}
      accessibilityLabel={`${resolveEntryTypeLabel(entry, categoriesById)}: ${entry.text}`}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.radius.md,
          backgroundColor: linked ? theme.colors.accentSoft : theme.colors.bg,
          borderWidth: 1,
          borderColor: linked ? theme.colors.accent : theme.colors.border,
        }}
      >
        <Ionicons
          name={linked ? 'checkbox' : 'square-outline'}
          size={18}
          color={linked ? theme.colors.accent : theme.colors.textTertiary}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="micro" color="accent">
            {resolveEntryTypeLabel(entry, categoriesById)}
            {entry.page != null ? ` · с. ${entry.page}` : ''}
          </AppText>
          <AppText variant="caption" numberOfLines={2} style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
            {entry.text}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Lore Entity Detail (POLYTSIA V1.6, Фаза 10 ТЗ) — той самий екран, що був Character Detail у
 * Фазі 9 (`app/characters/[workId]/[entityId].tsx`, перенесений сюди — `docs/PERSONAL_LORE.md`),
 * тепер для будь-якого з чотирьох типів. Єдиного окремого id-запиту немає — елемент лору
 * знаходиться фільтром по вже завантаженому `useLoreEntities(workId)`.
 *
 * "Optional impression" (реакція) — з ТЗ Фази 9 стосується лише персонажів; для інших типів
 * (місце/термін/організація) секція просто не рендериться (ТЗ Фази 9: "Не використовуй жорстку
 * універсальну classification" — реакція не універсальна для всього лору, а специфічна для
 * дійової особи).
 *
 * Жодного NLP/автовизначення зв'язків — лише ручний пікер нижче (ТЗ: "Не роби NLP entity
 * extraction").
 */
export default function LoreEntityDetailScreen() {
  const theme = useTheme();
  const { workId, entityId } = useLocalSearchParams<{ workId: string; entityId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: entities, isLoading: isEntitiesLoading } = useLoreEntities(workId);
  const entity = useMemo(() => (entities ?? []).find((item) => item.id === entityId) ?? null, [entities, entityId]);
  const typeLabel = entity ? LORE_ENTITY_TYPE_META[entity.type].label : 'Елемент лору';

  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const { data: linkedIds } = useLinkedJournalEntryIds(entityId);
  const linkedKeySet = useMemo(
    () => new Set((linkedIds ?? []).map((link) => `${link.kind}:${link.id}`)),
    [linkedIds],
  );

  const updateEntity = useUpdateLoreEntity();
  const removeEntity = useRemoveLoreEntity();
  const setFavorite = useSetLoreEntityFavorite();
  const linkEntry = useLinkJournalEntry();
  const unlinkEntry = useUnlinkJournalEntry();

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  // Той самий "adjust state while rendering, рівно один раз" патерн, що й `initialForm` на
  // `app/capsule/[workId]/edit.tsx` — заповнюється, щойно елемент лору вже відомий.
  if (name === null && entity) {
    setName(entity.name);
    setDescription(entity.description ?? '');
  }

  const pageCount = data?.primaryEdition?.pageCount ?? null;

  const handleSave = () => {
    if (!entity || !workId || name === null) return;
    updateEntity.mutate({
      id: entity.id,
      workId,
      name,
      description,
      firstSeenPage: entity.firstSeenPage,
      pageCount,
      reaction: entity.reaction,
    });
  };

  const handleReactionChange = (reaction: string | null) => {
    if (!entity || !workId) return;
    updateEntity.mutate({
      id: entity.id,
      workId,
      name: entity.name,
      description: entity.description,
      firstSeenPage: entity.firstSeenPage,
      pageCount,
      reaction,
    });
  };

  const handleDelete = () => {
    if (!entity || !workId) return;
    Alert.alert(`Видалити «${entity.name}»?`, 'Запис буде видалено. Записи щоденника залишаться без змін.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => removeEntity.mutate({ id: entity.id, workId }, { onSuccess: () => router.back() }),
      },
    ]);
  };

  const toggleLink = (entry: JournalEntry) => {
    if (!entity) return;
    const key = `${entry.kind}:${entry.id}`;
    if (linkedKeySet.has(key)) {
      unlinkEntry.mutate({ loreEntityId: entity.id, entryKind: entry.kind, entryId: entry.id });
    } else {
      linkEntry.mutate({ loreEntityId: entity.id, entryKind: entry.kind, entryId: entry.id });
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: entity?.name ?? 'Елемент лору',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
          headerRight: entity
            ? () => (
                <Pressable
                  onPress={() => setFavorite.mutate({ id: entity.id, workId, isFavorite: !entity.isFavorite })}
                  accessibilityRole="button"
                  accessibilityLabel={entity.isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
                  hitSlop={8}
                  style={{ paddingHorizontal: theme.spacing.xs }}
                >
                  <Ionicons
                    name={entity.isFavorite ? 'heart' : 'heart-outline'}
                    size={22}
                    color={theme.colors.accent}
                  />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isEntitiesLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !entity ? (
          <AppText variant="body" color="secondary">
            Елемент лору не знайдено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <Card style={{ gap: theme.spacing.md }}>
              <AppText variant="caption" color="tertiary">
                {typeLabel}
              </AppText>
              <LabeledInput label="Ім'я" value={name ?? ''} onChangeText={setName} />
              <LabeledInput
                label="Опис"
                placeholder="Необов'язково"
                value={description ?? ''}
                onChangeText={setDescription}
                multiline
                style={{ minHeight: 72, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
              />
              {entity.firstSeenPage != null ? (
                <AppText variant="caption" color="tertiary">
                  Уперше з&apos;явився на стор. {entity.firstSeenPage}
                  {entity.firstSeenProgress != null ? ` (${Math.round(entity.firstSeenProgress)}% книги)` : ''}
                </AppText>
              ) : null}
              <Button
                label={updateEntity.isPending ? 'Зберігаю…' : 'Зберегти'}
                variant="secondary"
                onPress={handleSave}
                disabled={name == null || name.trim().length === 0 || updateEntity.isPending}
              />
            </Card>

            {entity.type === 'character' ? (
              <View style={{ gap: theme.spacing.xs }}>
                <AppText variant="heading">Ставлення до персонажа</AppText>
                <ReactionRow value={entity.reaction} onChange={handleReactionChange} />
              </View>
            ) : null}

            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="heading">Пов&apos;язані записи щоденника</AppText>
              {(allEntries ?? []).length === 0 ? (
                <AppText variant="caption" color="tertiary">
                  У щоденнику цієї книги ще немає жодного запису.
                </AppText>
              ) : (
                <View style={{ gap: theme.spacing.xs }}>
                  {(allEntries ?? []).map((entry) => (
                    <LinkableEntryRow
                      key={entry.id}
                      entry={entry}
                      linked={linkedKeySet.has(`${entry.kind}:${entry.id}`)}
                      onToggle={() => toggleLink(entry)}
                      categoriesById={categoriesById}
                    />
                  ))}
                </View>
              )}
            </View>

            <Button
              label={removeEntity.isPending ? 'Видаляю…' : 'Видалити'}
              variant="ghost"
              onPress={handleDelete}
              disabled={removeEntity.isPending}
            />
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
