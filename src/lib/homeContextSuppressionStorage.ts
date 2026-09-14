import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/homeContextSuppressionStorage');

const STORAGE_KEY = 'polytsya_home_context_suppressed_until';

/** ключ картки (`getHomeContextCardSuppressionKey`, `homeContext.ts`) → ISO-мітка часу, до якої
 * вона приглушена (локальна опівніч наступного дня — "не сьогодні", не "назавжди"). */
type SuppressionMap = Record<string, string>;

/**
 * POLYTSIA V1.6.2, #169 (HOME CONTEXT SUPPRESSION) — той самий `expo-secure-store`, що й
 * `onboardingHintStorage.ts`/`backupExportStatusStorage.ts` (докладне обґрунтування вибору
 * SecureStore над `app_settings` — коментар у `backupExportStatusStorage.ts`, той самий привід
 * тут: приглушення картки — стан UI одного пристрою, не дані користувача, що мають лишитись
 * назавжди чи потрапити в бекап).
 *
 * ОДИН JSON-блок під ОДНИМ ключем (а не окремий SecureStore-ключ на кожну приглушену картку, як
 * у `onboardingHintStorage.ts`) — на відміну від трьох фіксованих `OnboardingHintId`, ключі тут
 * динамічні (`stale_reading:<userBookId>`, `capsule_due:<capsuleId>`, ...) і їх список необмежено
 * росте з часом (нові книги/капсули/цілі), тож окремий SecureStore-ключ на кожен назавжди
 * накопичував би записи, які ніколи не видаляються. Один блок з активним прибиранням
 * прострочених записів при кожному записі (`pruneExpired`) лишається малим незалежно від того,
 * скільки різних карток користувач будь-коли приглушував.
 */
function pruneExpired(map: SuppressionMap, now: Date): SuppressionMap {
  const nowIso = now.toISOString();
  const pruned: SuppressionMap = {};
  for (const [key, expiresAt] of Object.entries(map)) {
    if (expiresAt > nowIso) pruned[key] = expiresAt;
  }
  return pruned;
}

async function readMap(): Promise<SuppressionMap> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SuppressionMap;
  } catch (error) {
    log.warn('Не вдалося прочитати мапу приглушених контекстних карток Home', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Той самий безпечний бік помилки, що й `OnboardingHintStorage.hasSeen`: у найгіршому разі
    // раніше приглушена картка з'явиться знову, а не назавжди застрягне прихованою через
    // тимчасовий збій сховища/биті дані.
    return {};
  }
}

async function writeMap(map: SuppressionMap): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    log.warn('Не вдалося зберегти мапу приглушених контекстних карток Home', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const HomeContextSuppressionStorage = {
  /** Ключі, приглушені й ще не прострочені відносно `now` — вхід для
   * `selectVisibleHomeContextCard` (`homeContext.ts`). */
  async getActiveKeys(now: Date): Promise<Set<string>> {
    const map = pruneExpired(await readMap(), now);
    return new Set(Object.keys(map));
  },

  /** Приглушує `key` до найближчої локальної опівночі ПІСЛЯ `now` — "не показуй сьогодні", та
   * сама межа "дня", що й `todayKey`/"today" у `useStatistics.ts` (локальний час пристрою). */
  async suppressUntilTomorrow(key: string, now: Date): Promise<void> {
    const map = pruneExpired(await readMap(), now);
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    map[key] = midnight.toISOString();
    await writeMap(map);
  },
};
