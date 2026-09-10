import { useMutation } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { DataIntegrityRepository } from '@/data/repositories/DataIntegrityRepository';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';

const log = createLogger('features/data-doctor');

/**
 * «Перевірка даних» (POLYTSIA V1.5, Фаза 5). Запускається вручну кнопкою на екрані
 * (`app/data-doctor.tsx`), а не автоматично при кожному відкритті Профілю — сканує кілька
 * таблиць цілком (недорого для типових обсягів V1, `docs/DATABASE.md`), але немає причини
 * робити це на кожен рендер чи старт застосунку.
 */
export function useDataIntegrityCheck() {
  const onError = useMutationErrorHandler(log, 'Не вдалося перевірити дані. Спробуй ще раз.');
  return useMutation({
    mutationFn: async () => {
      const db = await getDatabase();
      return DataIntegrityRepository.runCheck(db);
    },
    onError,
  });
}
