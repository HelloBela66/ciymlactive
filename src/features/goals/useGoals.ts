import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingGoalRepository } from '@/data/repositories/ReadingGoalRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { CreateReadingGoalInput, ReadingGoal, ReadingGoalProgress, ReadingGoalStatus } from '@/types/readingGoal';

const log = createLogger('features/goals');

export interface GoalWithProgress {
  goal: ReadingGoal;
  progress: ReadingGoalProgress;
}

/** Усі цілі разом з обчисленим прогресом (Milestone 5). Прогрес рахується в цьому ж
 * запиті, а не окремим хуком на ціль — цілей у одного користувача завжди мало, а так
 * список і прогрес завжди узгоджені між собою (один `useQuery`, один invalidate). */
export function useGoals() {
  return useQuery<GoalWithProgress[]>({
    queryKey: queryKeys.goals.all,
    queryFn: async () => {
      const db = await getDatabase();
      const goals = await ReadingGoalRepository.listAll(db);
      return Promise.all(
        goals.map(async (goal) => ({ goal, progress: await ReadingGoalRepository.getProgress(db, goal) })),
      );
    },
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося створити ціль.');
  return useMutation({
    mutationFn: async (input: CreateReadingGoalInput) => {
      const db = await getDatabase();
      return ReadingGoalRepository.create(db, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
    },
    onError,
  });
}

export function useSetGoalStatus() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити статус цілі.');
  return useMutation({
    mutationFn: async (params: { id: string; status: ReadingGoalStatus }) => {
      const db = await getDatabase();
      await ReadingGoalRepository.updateStatus(db, params.id, params.status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
    },
    onError,
  });
}

export function useRemoveGoal() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити ціль.');
  return useMutation({
    mutationFn: async (id: string) => {
      const db = await getDatabase();
      await ReadingGoalRepository.remove(db, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
    },
    onError,
  });
}
