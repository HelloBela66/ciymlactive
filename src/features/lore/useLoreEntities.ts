import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { LoreEntityRepository } from '@/data/repositories/LoreEntityRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import {
  computeFirstSeenProgress,
  normalizeLoreEntityDescription,
  normalizeLoreEntityName,
  validateLoreEntityName,
} from '@/lib/loreEntity';
import type { JournalEntryKind } from '@/types/journalEntry';
import type { LoreEntity, LoreEntityType } from '@/types/loreEntity';

const log = createLogger('features/lore');

/** Усі персонажі (і, з Фази 10 UI, решта лору) твору — `app/characters/[workId].tsx` та
 * компактні секції на Book Details/Memory. */
export function useLoreEntities(workId: string | undefined) {
  return useQuery<LoreEntity[]>({
    queryKey: queryKeys.loreEntities.byWork(workId ?? ''),
    queryFn: async () => {
      if (!workId) return [];
      const db = await getDatabase();
      return LoreEntityRepository.listByWorkId(db, workId);
    },
    enabled: !!workId,
  });
}

export interface CreateLoreEntityFormInput {
  workId: string;
  type: LoreEntityType;
  name: string;
  description: string | null;
  firstSeenPage: number | null;
  pageCount: number | null;
}

/** Створення (ТЗ Фази 9: швидке додавання — ім'я, коротка примітка, сторінка). Валідація —
 * лише непорожнє ім'я (`validateLoreEntityName`); `firstSeenProgress` рахується тут же з уже
 * відомого `pageCount` книги (`015_lore_entity.ts` п.5), не окремим полем форми. */
export function useCreateLoreEntity() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося додати персонажа.');
  return useMutation<LoreEntity, Error, CreateLoreEntityFormInput>({
    mutationFn: async (input) => {
      const name = normalizeLoreEntityName(input.name);
      if (!validateLoreEntityName(name)) {
        throw new Error("Вкажи ім'я персонажа.");
      }
      const description = normalizeLoreEntityDescription(input.description);
      const firstSeenProgress = computeFirstSeenProgress(input.firstSeenPage, input.pageCount);

      const db = await getDatabase();
      return LoreEntityRepository.create(db, {
        workId: input.workId,
        type: input.type,
        name,
        description,
        firstSeenPage: input.firstSeenPage,
        firstSeenProgress,
      });
    },
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loreEntities.byWork(entity.workId) });
    },
    onError,
  });
}

export interface UpdateLoreEntityFormInput {
  id: string;
  workId: string;
  name: string;
  description: string | null;
  firstSeenPage: number | null;
  pageCount: number | null;
  reaction: string | null;
}

/** Редагування (Character Detail screen: ім'я/опис/реакція; "уперше з'явився" перераховується
 * заново, якщо користувач змінив сторінку). */
export function useUpdateLoreEntity() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити персонажа.');
  return useMutation<void, Error, UpdateLoreEntityFormInput>({
    mutationFn: async (input) => {
      const name = normalizeLoreEntityName(input.name);
      if (!validateLoreEntityName(name)) {
        throw new Error("Вкажи ім'я персонажа.");
      }
      const description = normalizeLoreEntityDescription(input.description);
      const firstSeenProgress = computeFirstSeenProgress(input.firstSeenPage, input.pageCount);

      const db = await getDatabase();
      await LoreEntityRepository.update(db, {
        id: input.id,
        name,
        description,
        firstSeenPage: input.firstSeenPage,
        firstSeenProgress,
        reaction: input.reaction,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loreEntities.byWork(variables.workId) });
    },
    onError,
  });
}

/** Той самий "optimistic невідомий не потрібен, просто invalidate" підхід, що й
 * `useRemoveBookCapsule` — список персонажів невеликий, повторний запит дешевий. */
export function useRemoveLoreEntity() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити персонажа.');
  return useMutation<void, Error, { id: string; workId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await LoreEntityRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loreEntities.byWork(variables.workId) });
    },
    onError,
  });
}

export function useSetLoreEntityFavorite() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити позначку "обране".');
  return useMutation<void, Error, { id: string; workId: string; isFavorite: boolean }>({
    mutationFn: async ({ id, isFavorite }) => {
      const db = await getDatabase();
      await LoreEntityRepository.setFavorite(db, id, isFavorite);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loreEntities.byWork(variables.workId) });
    },
    onError,
  });
}

/** Id записів щоденника (note/quote), уже пов'язаних із цим персонажем — Character Detail
 * screen показує їх списком і використовує для перемикання стану "пов'язано"/"не пов'язано" у
 * власному пікері. */
export function useLinkedJournalEntryIds(loreEntityId: string | undefined) {
  return useQuery<{ id: string; kind: JournalEntryKind }[]>({
    queryKey: queryKeys.loreEntities.linkedEntries(loreEntityId ?? ''),
    queryFn: async () => {
      if (!loreEntityId) return [];
      const db = await getDatabase();
      const links = await LoreEntityRepository.listLinksForEntity(db, loreEntityId);
      return links.map((link) => ({ id: link.entryId, kind: link.entryKind }));
    },
    enabled: !!loreEntityId,
  });
}

export function useLinkJournalEntry() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, "Не вдалося пов'язати запис.");
  return useMutation<void, Error, { loreEntityId: string; entryKind: JournalEntryKind; entryId: string }>({
    mutationFn: async ({ loreEntityId, entryKind, entryId }) => {
      const db = await getDatabase();
      await LoreEntityRepository.linkJournalEntry(db, loreEntityId, entryKind, entryId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loreEntities.linkedEntries(variables.loreEntityId) });
    },
    onError,
  });
}

export function useUnlinkJournalEntry() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, "Не вдалося прибрати зв'язок.");
  return useMutation<void, Error, { loreEntityId: string; entryKind: JournalEntryKind; entryId: string }>({
    mutationFn: async ({ loreEntityId, entryKind, entryId }) => {
      const db = await getDatabase();
      await LoreEntityRepository.unlinkJournalEntry(db, loreEntityId, entryKind, entryId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loreEntities.linkedEntries(variables.loreEntityId) });
    },
    onError,
  });
}
