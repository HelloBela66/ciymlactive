import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { queryKeys } from '@/lib/queryKeys';
import { ResurfacingPresentationStorage } from '@/lib/resurfacingPresentationStorage';
import {
  EMPTY_HOME_RESURFACING_STATE,
  type HomeResurfacingState,
  type MemoryResurfacingCandidate,
} from '@/lib/memoryResurfacing';
import { collectMemoryResurfacingCandidates } from './collectMemoryResurfacingCandidates';

/**
 * POLYTSIA V1.7, Phase 9 — MEMORY RESURFACING (ТЗ V1.7 модуль E).
 *
 * ОДИН КЕШ-ЗАПИС НА ОБИДВІ ПОВЕРХНІ (той самий принцип, що вже діє для `readingLife.all` і
 * `readingMilestones.all`): Memory Hub і Home беруть ЗРІЗ із цього результату
 * (`selectHubResurfacingCandidates` / `selectHomeResurfacingCandidate`), а не рахують свої
 * спогади. Інакше «що я бачив на головній» і «що лежить у Пам'яті» могли б колись розійтись.
 *
 * ЖОДНОЇ НОВОЇ ТАБЛИЦІ (ТЗ §20, §33) — кандидати derived, а стан показів живе в SecureStore.
 */

export function useMemoryResurfacingCandidates() {
  return useQuery<MemoryResurfacingCandidate[]>({
    queryKey: queryKeys.memoryResurfacing.all,
    queryFn: async () => {
      const db = await getDatabase();
      // «Зараз» приходить у виклик, а не береться всередині чистих функцій — той самий
      // house-принцип, що й у `readingMilestones`/`season`.
      return collectMemoryResurfacingCandidates(db, new Date());
    },
  });
}

/**
 * Стан показів для Home (ТЗ §8, §9). Окремий запит від кандидатів: читається з SecureStore, не з
 * БД, і не повинен перераховуватись щоразу, коли змінився запис у щоденнику.
 */
export function useHomeResurfacingState() {
  return useQuery<HomeResurfacingState>({
    queryKey: queryKeys.memoryResurfacing.homeState,
    queryFn: () => ResurfacingPresentationStorage.getState(new Date()),
    initialData: EMPTY_HOME_RESURFACING_STATE,
  });
}

/**
 * Зафіксувати, що спогад займав слот Home (ТЗ §8, §9).
 *
 * СВІДОМО НЕ ІНВАЛІДУЄ `memoryResurfacing.homeState`. Якби інвалідував, картка зникла б з-під
 * очей людини в ту саму мить, коли вона її помітила: новий стан одразу заборонив би показ на 7
 * днів, і наступний рендер прибрав би те, що вона читає. Запис лягає в сховище тихо, а зріз стану
 * оновиться природно — при наступному запуску чи рефетчі. Ціна — рівно одна: якщо застосунок
 * лишається відкритим і Home перемальовується, спогад доживає цю сесію. Це саме та поведінка,
 * якої хочеться від спогаду, і вона не порушує §8: наступний показ усе одно буде не раніше ніж
 * через 7 днів.
 */
export function useMarkResurfacingShown(): (semanticKey: string) => void {
  return useCallback((semanticKey: string) => {
    void ResurfacingPresentationStorage.markShown(semanticKey, new Date());
  }, []);
}
