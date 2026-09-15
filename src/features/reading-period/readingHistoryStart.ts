import type { SQLiteDatabase } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';

/**
 * POLYTSIA V1.7, Phase 10 — ЄДИНА відповідь на питання «коли почалась моя читацька історія».
 *
 * ── ЧОМУ ЦЕ ОКРЕМИЙ МОДУЛЬ ───────────────────────────────────────────────────────────────────
 * Це вже ДРУГЕ місце, якому потрібен цей момент. Phase 8 рахувала його всередині
 * `useReadingMilestones`, щоб знати, від чого відлічувати річниці читацької історії (ТЗ модуль D
 * §11). Phase 10 потребує того самого моменту, щоб знати, де закінчується гортання сезонів назад.
 *
 * Якби кожен рахував сам, «твоя історія почалась восени 2019» (річниця) і «далі назад нічого
 * немає» (Сезони) могли б із часом розійтись — рівно той клас розбіжності, проти якого написаний
 * увесь V1.7. Тому обчислення одне, і воно тут.
 *
 * ── ЧОМУ САМЕ ЦІ ДВІ ПОДІЇ ───────────────────────────────────────────────────────────────────
 * Найраніша з двох canonical-подій: початок першого проходу (`reading_run.started_at`) і початок
 * першої завершеної сесії. НЕ дата встановлення застосунку — імпортована історія може починатись
 * задовго до «Полиці», і прив'язка до інсталяції обрізала б людині її ж минуле.
 */
export async function fetchReadingHistoryStart(db: SQLiteDatabase): Promise<string | null> {
  const [earliestSession, earliestRun] = await Promise.all([
    ReadingSessionRepository.getEarliestCompletedStartInstant(db),
    ReadingRunRepository.getEarliestStartInstant(db),
  ]);
  const candidates = [earliestSession, earliestRun].filter((value): value is string => value != null);
  if (candidates.length === 0) return null;
  return [...candidates].sort()[0] ?? null;
}

/**
 * Окремий кеш-запис: момент початку історії змінюється надзвичайно рідко (лише коли зʼявляється
 * подія, раніша за всі попередні — тобто фактично лише при імпорті чи в найперші дні), тож
 * прив'язувати його до важчих запитів сезону чи віх немає сенсу.
 */
export function useReadingHistoryStart() {
  return useQuery<string | null>({
    queryKey: queryKeys.readingHistory.start,
    queryFn: async () => {
      const db = await getDatabase();
      return fetchReadingHistoryStart(db);
    },
    initialData: null,
  });
}
