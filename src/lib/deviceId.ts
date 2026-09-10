import * as SecureStore from 'expo-secure-store';
import { generateId } from '@/lib/uuid';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/deviceId');

const STORAGE_KEY = 'polytsya_device_id';

let cached: string | null = null;
// Дедуплікація одночасних перших викликів (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.8) —
// без цього два виклики `getDeviceId()`, що стартували одночасно ДО того, як `cached`
// встиг заповнитись (реалістично: кілька мутацій "додати до бібліотеки" одна за одною одразу
// після запуску застосунку), обидва бачили б `SecureStore.getItemAsync` як порожній, обидва
// згенерували б РІЗНИЙ `fresh` id і обидва спробували б його зберегти — переможе останній
// запис, але виклик, що програв гонку, уже встиг повернути (і використати в тому мережевому
// запиті) свій, інший, id. Той самий пристрій міг тоді порахуватись як два різні в
// `added_count`. Один спільний проміс на час першого виконання гарантує, що всі одночасні
// виклики чекають на РЕЗУЛЬТАТ того самого читання/генерації, а не запускають власне.
let inFlight: Promise<string> | null = null;

/**
 * Анонімний, випадковий, персистентний ідентифікатор ЦЬОГО пристрою (не прив'язаний до
 * жодних персональних даних, немає акаунтів/auth — docs/LOCAL_FIRST.md) — потрібен лише
 * щоб `catalog_book_device` (Milestone 8.2, `supabase/schema.sql`) міг порахувати
 * "скільки РІЗНИХ пристроїв додали цю книгу собі" без подвійного рахунку від того самого
 * пристрою (додав → прибрав → додав знову). Той самий підхід зберігання, що й
 * `themePreferenceStorage.ts` (`expo-secure-store`, не залежить від готовності SQLite).
 *
 * Кешується в пам'яті процесу (`cached`) після першого читання/генерації — усі наступні
 * виклики за час життя застосунку не чіпають сховище повторно.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      try {
        const existing = await SecureStore.getItemAsync(STORAGE_KEY);
        if (existing) {
          cached = existing;
          return existing;
        }
      } catch (error) {
        log.warn('Не вдалося прочитати device id з SecureStore — згенерую новий на цей запуск', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const fresh = generateId();
      cached = fresh;
      try {
        await SecureStore.setItemAsync(STORAGE_KEY, fresh);
      } catch (error) {
        // Не критично: якщо запис не вдався, просто згенеруємо інший id наступного разу —
        // найгірший наслідок — цей пристрій порахується як "кілька різних" у added_count, не
        // втрата функціональності.
        log.warn('Не вдалося зберегти новий device id', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return fresh;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
