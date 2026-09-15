import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';
import {
  EMPTY_HOME_RESURFACING_STATE,
  HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS,
  type HomeResurfacingState,
} from '@/lib/memoryResurfacing';

const log = createLogger('lib/resurfacingPresentationStorage');

const STORAGE_KEY = 'polytsya_memory_resurfacing_presentation';

/**
 * POLYTSIA V1.7, Phase 9 — коли Home востаннє показував спогад і які саме (ТЗ модуль E §9, §33).
 *
 * ── ЧОМУ НЕ ТАБЛИЦЯ ──────────────────────────────────────────────────────────────────────────
 * ТЗ §33 прямо забороняє заводити SQLite-таблицю заради `lastShownAt`, і це правильно не лише
 * заради простоти: це НЕ читацька історія. Те, що застосунок показав тобі цитату 12 березня, не є
 * фактом твоєї читацької біографії — на відміну від самої цитати. Тому стан живе там само, де вже
 * живе приглушення контекстних карток Home (`homeContextSuppressionStorage.ts`): `expo-secure-store`,
 * один JSON-блок під одним ключем, з активним прибиранням прострочених записів при кожному записі.
 *
 * ── НАСЛІДКИ, ЯКІ Є СВІДОМИМИ, А НЕ ВИПАДКОВИМИ ──────────────────────────────────────────────
 * Стан не потрапляє в бекап і не переживає перевстановлення (ТЗ §33 — «не включай ephemeral
 * presentation state у backup»). Отже: після відновлення з бекапу спогад, показаний торік, може
 * з'явитися знову. Це прийнятна ціна — гірший бік був би зворотним: тягнути «що тобі показували»
 * у бекап і в майбутню синхронізацію лише заради того, щоб не повторитись раз на кілька років.
 *
 * Прострочені записи (старші за cooldown) прибираються при кожному записі, тож блок лишається
 * малим незалежно від того, скільки спогадів людина побачила за роки користування.
 */
type PresentationMap = Record<string, string>;

interface StoredState {
  lastShownAt?: string | null;
  shownAtByKey?: PresentationMap;
}

/** Записи, старші за cooldown, більше ні на що не впливають — тримати їх нема сенсу. */
function pruneExpired(map: PresentationMap, now: Date): PresentationMap {
  const cutoff = new Date(now.getTime() - HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();
  const pruned: PresentationMap = {};
  for (const [key, shownAt] of Object.entries(map)) {
    if (shownAt > cutoffIso) pruned[key] = shownAt;
  }
  return pruned;
}

async function readState(): Promise<HomeResurfacingState> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return EMPTY_HOME_RESURFACING_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_HOME_RESURFACING_STATE;
    }
    const stored = parsed as StoredState;
    return {
      lastShownAt: typeof stored.lastShownAt === 'string' ? stored.lastShownAt : null,
      shownAtByKey:
        stored.shownAtByKey != null && typeof stored.shownAtByKey === 'object'
          ? stored.shownAtByKey
          : {},
    };
  } catch (error) {
    log.warn('Не вдалося прочитати стан показів Memory Resurfacing', {
      error: error instanceof Error ? error.message : String(error),
    });
    /**
     * Той самий безпечний бік помилки, що й у `homeContextSuppressionStorage.ts`, але наслідок
     * протилежний за знаком і тому вартий окремої згадки: порожній стан означає «нічого ще не
     * показували», тобто спогад може з'явитися РАНІШЕ, ніж мав би. Це м'якша помилка, ніж
     * протилежна («ніколи більше нічого не показувати через тимчасовий збій сховища»).
     */
    return EMPTY_HOME_RESURFACING_STATE;
  }
}

async function writeState(state: HomeResurfacingState): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    log.warn('Не вдалося зберегти стан показів Memory Resurfacing', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const ResurfacingPresentationStorage = {
  /** Вхід для `selectHomeResurfacingCandidate` (`memoryResurfacing.ts`). */
  async getState(now: Date): Promise<HomeResurfacingState> {
    const state = await readState();
    return { lastShownAt: state.lastShownAt, shownAtByKey: pruneExpired(state.shownAtByKey, now) };
  },

  /**
   * Зафіксувати, що спогад займав слот Home. Оновлює ОБИДВА лічильники одразу: загальний
   * `lastShownAt` (ТЗ §8 — рідкість раз на 7 днів) і персональний для цього спогаду (ТЗ §9 —
   * cooldown 90 днів). Викликається і при показі, і при відхиленні: ТЗ §9 каже «після
   * показу/відхилення», і це справедливо — відхилений спогад тим більше не має повертатись завтра.
   */
  async markShown(semanticKey: string, now: Date): Promise<void> {
    const state = await readState();
    const nowIso = now.toISOString();
    await writeState({
      lastShownAt: nowIso,
      shownAtByKey: { ...pruneExpired(state.shownAtByKey, now), [semanticKey]: nowIso },
    });
  },
};
