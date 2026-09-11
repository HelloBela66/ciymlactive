import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useCreateLoreEntity, useLoreEntities } from '@/features/lore/useLoreEntities';
import { LORE_ENTITY_REACTION_META, isLoreEntityReactionId } from '@/design/loreEntityReaction';
import { LORE_ENTITY_TYPE_META, LORE_ENTITY_TYPE_ORDER } from '@/design/loreEntityType';
import type { LoreEntity, LoreEntityType } from '@/types/loreEntity';

const TYPE_OPTIONS: { value: LoreEntityType; label: string }[] = LORE_ENTITY_TYPE_ORDER.map((type) => ({
  value: type,
  label: LORE_ENTITY_TYPE_META[type].label,
}));

/** Один рядок списку — тип-іконка, ім'я, коротка примітка (одним рядком), і, для персонажів,
 * іконка поточної реакції. Той самий "маленький презентаційний блок без спільного стану"
 * підхід, що й `RecallEntryLine`/`RecapEntryLine`. */
function LoreEntityRow({ entity, workId }: { entity: LoreEntity; workId: string }) {
  const theme = useTheme();
  const typeMeta = LORE_ENTITY_TYPE_META[entity.type];
  const reactionMeta =
    entity.reaction && isLoreEntityReactionId(entity.reaction) ? LORE_ENTITY_REACTION_META[entity.reaction] : null;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/lore/[workId]/[entityId]', params: { workId, entityId: entity.id } } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={`${typeMeta.label}: ${entity.name}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name={typeMeta.icon} size={18} color={theme.colors.textSecondary} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              {entity.name}
            </AppText>
            {entity.isFavorite ? <Ionicons name="heart" size={14} color={theme.colors.accent} /> : null}
          </View>
          {entity.description ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {entity.description}
            </AppText>
          ) : null}
        </View>
        {reactionMeta ? <Ionicons name={reactionMeta.icon} size={18} color={theme.colors.accent} /> : null}
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/**
 * «Світ книги» (POLYTSIA V1.6, Фаза 10 ТЗ: "Architecture characters повинна бути
 * розширювана до personal lore") — той самий екран, що був «Персонажі» у Фазі 9
 * (`app/characters/[workId].tsx`, перенесений сюди за назвою: `docs/PERSONAL_LORE.md`), тепер
 * з вибором типу при додаванні: Персонаж, Місце, Термін, Організація (рівно порядок ТЗ). Схема
 * (`lore_entity`) підтримувала всі чотири типи від самого Migration 015 (Фаза 9) — це чисто
 * UI-розширення, без нової міграції.
 *
 * Жодного NLP/автовизначення (ТЗ Фази 9, чинне і тут: "Не роби NLP entity extraction") — лише
 * те, що користувач сам вписав.
 *
 * `lore_entity.work_id`, не `user_book_id` — екран доступний і для книг, які ще не додані в
 * бібліотеку (`data.userBook` може бути `null`), тому тут немає окремого guard'а на його
 * відсутність.
 */
export default function LoreScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const { data: entities, isLoading: isEntitiesLoading } = useLoreEntities(workId);
  const createEntity = useCreateLoreEntity();

  const [type, setType] = useState<LoreEntityType>('character');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [pageText, setPageText] = useState('');

  const pageCount = data?.primaryEdition?.pageCount ?? null;
  const entries = entities ?? [];

  const handleAdd = () => {
    if (!workId || name.trim().length === 0) return;
    const parsedPage = pageText.trim().length > 0 ? Number(pageText) : null;
    const firstSeenPage = parsedPage != null && Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : null;

    createEntity.mutate(
      { workId, type, name, description: note.trim().length > 0 ? note : null, firstSeenPage, pageCount },
      {
        onSuccess: () => {
          setName('');
          setNote('');
          setPageText('');
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Світ книги',
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
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <AppText variant="title">{data.work.title}</AppText>

            <Card style={{ gap: theme.spacing.sm }}>
              <AppText variant="heading">Додати</AppText>
              <ChipSelect label="Тип" options={TYPE_OPTIONS} value={type} onChange={setType} disabled={createEntity.isPending} />
              <LabeledInput label="Ім'я" placeholder="Наприклад, Пол Атрідес" value={name} onChangeText={setName} />
              <LabeledInput
                label="Коротка примітка"
                placeholder="Необов'язково"
                value={note}
                onChangeText={setNote}
              />
              <LabeledInput
                label="Сторінка першої появи"
                placeholder="Необов'язково"
                value={pageText}
                onChangeText={setPageText}
                keyboardType="number-pad"
              />
              <Button
                label={createEntity.isPending ? 'Додаю…' : 'Додати'}
                onPress={handleAdd}
                disabled={name.trim().length === 0 || createEntity.isPending}
              />
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              {isEntitiesLoading ? (
                <AppText variant="body" color="secondary">
                  Завантаження…
                </AppText>
              ) : entries.length === 0 ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Світ цієї книги ще порожній.
                </AppText>
              ) : (
                entries.map((entity) => <LoreEntityRow key={entity.id} entity={entity} workId={data.work.id} />)
              )}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
