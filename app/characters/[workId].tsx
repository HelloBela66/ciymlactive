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
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useCreateLoreEntity, useLoreEntities } from '@/features/lore/useLoreEntities';
import { LORE_ENTITY_REACTION_META, isLoreEntityReactionId } from '@/design/loreEntityReaction';
import type { LoreEntity } from '@/types/loreEntity';

/** Один рядок списку персонажів — ім'я, коротка примітка (одним рядком), і, якщо є, іконка
 * поточної реакції. Той самий "маленький презентаційний блок без спільного стану" підхід, що
 * й `RecallEntryLine`/`RecapEntryLine`. */
function CharacterListRow({ entity, workId }: { entity: LoreEntity; workId: string }) {
  const theme = useTheme();
  const reactionMeta =
    entity.reaction && isLoreEntityReactionId(entity.reaction) ? LORE_ENTITY_REACTION_META[entity.reaction] : null;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/characters/[workId]/[entityId]', params: { workId, entityId: entity.id } } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={entity.name}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
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
 * «Персонажі» — список + швидке додавання (POLYTSIA V1.6, Фаза 9 ТЗ). Точка входу —
 * `CharactersSection` на Book Details (`app/work/[workId].tsx`) і Memory (`app/memory/[workId].tsx`).
 * Схема (`lore_entity`) підтримує чотири типи від самого початку (`docs/PERSONAL_LORE.md`
 * §Архітектура), але цей екран навмисно показує лише персонажів (`type: 'character'`) —
 * місця/терміни/організації додаються в Фазі 10, без нової міграції.
 *
 * Жодного NLP/автовизначення дійових осіб (ТЗ: "Не роби NLP entity extraction") — лише те, що
 * користувач сам вписав.
 *
 * `lore_entity.work_id`, не `user_book_id` (`015_lore_entity.ts`) — той самий рівень, що й
 * жанри/теги: екран доступний і для книг, які ще не додані в бібліотеку (`data.userBook` може
 * бути `null`), тому тут немає окремого guard'а на його відсутність.
 */
export default function CharactersScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const { data: entities, isLoading: isEntitiesLoading } = useLoreEntities(workId);
  const createEntity = useCreateLoreEntity();

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [pageText, setPageText] = useState('');

  const pageCount = data?.primaryEdition?.pageCount ?? null;
  const characters = (entities ?? []).filter((entity) => entity.type === 'character');

  const handleAdd = () => {
    if (!workId || name.trim().length === 0) return;
    const parsedPage = pageText.trim().length > 0 ? Number(pageText) : null;
    const firstSeenPage = parsedPage != null && Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : null;

    createEntity.mutate(
      { workId, type: 'character', name, description: note.trim().length > 0 ? note : null, firstSeenPage, pageCount },
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
          title: 'Персонажі',
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
              <AppText variant="heading">Додати персонажа</AppText>
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
              ) : characters.length === 0 ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Персонажів цієї книги ще не додано.
                </AppText>
              ) : (
                characters.map((entity) => <CharacterListRow key={entity.id} entity={entity} workId={data.work.id} />)
              )}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
