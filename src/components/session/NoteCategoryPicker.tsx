import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { noteTypeLabels } from '@/design/i18n-labels';
import {
  useActiveNoteCategories,
  useCreateNoteCategory,
  useDeleteNoteCategory,
  useRenameNoteCategory,
} from '@/features/notes/useNoteCategories';
import type { NoteType } from '@/types/note';

const BUILTIN_TYPES = Object.keys(noteTypeLabels) as NoteType[];

export interface NoteCategoryValue {
  type: NoteType;
  categoryId: string | null;
}

interface NoteCategoryPickerProps {
  userBookId: string;
  value: NoteCategoryValue;
  onChange: (next: NoteCategoryValue) => void;
}

/**
 * Вибір категорії нотатки (Milestone 11, доповнення — панель читання, пряме прохання
 * власника продукту): п'ять вбудованих категорій (`noteTypeLabels`) + власні категорії
 * користувача під ЦЮ книгу (`useActiveNoteCategories`), з можливістю додати/перейменувати/
 * видалити свою. Спільний компонент — той самий екран вибору категорії потрібен і в композері
 * на екрані активної сесії (`app/session/[sessionId].tsx`), і в композері на Book Details
 * (`app/work/[workId].tsx`, `JournalSection`) — дублювати цю логіку у двох файлах означало б
 * два незалежних місця, де баг чи розбіжність поведінки можуть розійтись непомітно.
 *
 * Вибір категорії — це ОДНЕ значення `{type, categoryId}`, не два незалежних стани: вибір
 * вбудованого чипу ставить `categoryId: null`, вибір власної категорії ставить `type: 'general'`
 * (фолбек-бакет у БД, ігнорується для показу, коли `categoryId` задано — `resolveEntryTypeLabel`).
 *
 * Дизайн "додати"/"керувати" свідомо повторює вже усталений у застосунку патерн (`GenreTagsSection`
 * на Book Details, "+ Свій жанр"/"+ Додати тег") — той самий inline-розгортання-поля прийом, а не
 * новий модал/bottom sheet (у застосунку такого компонента взагалі немає).
 */
export function NoteCategoryPicker({ userBookId, value, onChange }: NoteCategoryPickerProps) {
  const theme = useTheme();
  const { data: categories } = useActiveNoteCategories(userBookId);
  const createCategory = useCreateNoteCategory();
  const renameCategory = useRenameNoteCategory();
  const deleteCategory = useDeleteNoteCategory();

  const [showAddInput, setShowAddInput] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [manageMode, setManageMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const activeCategories = categories ?? [];

  const handleSelectBuiltin = (type: NoteType) => {
    onChange({ type, categoryId: null });
  };

  const handleSelectCustom = (categoryId: string) => {
    onChange({ type: 'general', categoryId });
  };

  const handleCreate = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const created = await createCategory.mutateAsync({ userBookId, label: trimmed });
    setNewLabel('');
    setShowAddInput(false);
    onChange({ type: 'general', categoryId: created.id });
  };

  const startEditing = (id: string, currentLabel: string) => {
    setEditingId(id);
    setEditingLabel(currentLabel);
  };

  const commitEditing = async () => {
    if (!editingId) return;
    const trimmed = editingLabel.trim();
    if (trimmed) {
      await renameCategory.mutateAsync({ id: editingId, userBookId, label: trimmed });
    }
    setEditingId(null);
    setEditingLabel('');
  };

  const handleDelete = (id: string) => {
    deleteCategory.mutate({ id, userBookId });
    // Категорія, яку щойно видалили, більше не може лишатись обраною для нотатки, яку зараз
    // складають — відкочуємось на "Загальне", щоб форма не лишилась у неузгодженому стані.
    if (value.categoryId === id) {
      onChange({ type: 'general', categoryId: null });
    }
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="caption" color="secondary">
        Категорія
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {BUILTIN_TYPES.map((type) => {
          const selected = value.categoryId === null && value.type === type;
          return (
            <Pressable
              key={type}
              onPress={() => handleSelectBuiltin(type)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={noteTypeLabels[type]}
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
                {noteTypeLabels[type]}
              </AppText>
            </Pressable>
          );
        })}

        {activeCategories.map((category) => {
          const selected = value.categoryId === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => handleSelectCustom(category.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={category.label}
              style={{
                paddingHorizontal: theme.spacing.md,
                minHeight: theme.minTouchTarget,
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.accent : theme.colors.accentSoft,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : 'transparent',
              }}
            >
              <AppText variant="caption" color={selected ? 'onAccent' : 'accent'}>
                {category.label}
              </AppText>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => setShowAddInput((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={showAddInput ? 'Скасувати додавання категорії' : 'Своя категорія'}
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
            {showAddInput ? 'Скасувати' : '+ Своя категорія'}
          </AppText>
        </Pressable>
      </View>

      {showAddInput ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <LabeledInput
              label="Назва категорії"
              value={newLabel}
              onChangeText={setNewLabel}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
              placeholder="напр. Сильна напруга"
            />
          </View>
          <Button
            label={createCategory.isPending ? '…' : 'Додати'}
            variant="secondary"
            onPress={handleCreate}
            disabled={createCategory.isPending || !newLabel.trim()}
          />
        </View>
      ) : null}

      {activeCategories.length > 0 ? (
        <Pressable
          onPress={() => setManageMode((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={manageMode ? 'Сховати керування категоріями' : 'Керувати своїми категоріями'}
          style={{ alignSelf: 'flex-start', marginTop: theme.spacing.xs }}
        >
          <AppText variant="micro" color="tertiary">
            {manageMode ? 'Готово' : 'Керувати своїми категоріями'}
          </AppText>
        </Pressable>
      ) : null}

      {manageMode ? (
        <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
          {activeCategories.map((category) => (
            <View
              key={category.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
            >
              {editingId === category.id ? (
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="Назва категорії"
                    value={editingLabel}
                    onChangeText={setEditingLabel}
                    onBlur={commitEditing}
                    onSubmitEditing={commitEditing}
                    returnKeyType="done"
                    autoFocus
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => startEditing(category.id, category.label)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
                  accessibilityRole="button"
                  accessibilityLabel={`Перейменувати категорію ${category.label}`}
                >
                  <Ionicons name="pencil-outline" size={14} color={theme.colors.textTertiary} />
                  <AppText variant="caption">{category.label}</AppText>
                </Pressable>
              )}
              <Pressable
                onPress={() => handleDelete(category.id)}
                accessibilityRole="button"
                accessibilityLabel={`Видалити категорію ${category.label}`}
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
          ))}
        </View>
      ) : null}
    </View>
  );
}
