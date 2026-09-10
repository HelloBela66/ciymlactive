import { createLogger } from '@/lib/logger';

const log = createLogger('remote/coverStorage');

/**
 * Завантаження власних фото обкладинок у Supabase Storage bucket `book-covers` (Milestone 10,
 * `supabase/schema.sql`).
 *
 * З POLYTSIA V1.5 Фаза 1.2 (`docs/SECURITY.md`, знахідка 🟡 "необмежена кількість анонімних
 * завантажень") цей клієнт БІЛЬШЕ НЕ пише в Storage напряму anon-ключем — увесь upload іде
 * через `supabase/functions/cover-upload/` (Edge Function, README.md поруч): сервер сам
 * перевіряє реальний тип файлу за байтами, обмежує розмір, генерує шлях об'єкта (не клієнт) і
 * застосовує rate limit. Той самий `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`,
 * що й решта Supabase-клієнтів — лише ціль тепер `/functions/v1/cover-upload`, не
 * `/storage/v1/object/...` напряму.
 */
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isCoverStorageConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

const UPLOAD_TIMEOUT_MS = 15_000; // трохи більше за серверний таймаут проксі до Storage (10с)

/**
 * Завантажує локальний файл (`file://` з `expo-image-picker`/камери) через `cover-upload`
 * Edge Function і повертає публічний URL — або `null` без конфігурації Supabase чи за будь-
 * якої мережевої/HTTP помилки, ніколи не кидає (той самий degradation-safe принцип, що й
 * `SharedCatalogClient`: локальна обкладинка вже збережена й видима в застосунку ДО виклику
 * цієї функції — фонова синхронізація ніяк не повинна вплинути на те, що бачить користувач).
 *
 * На відміну від старої версії, БІЛЬШЕ НЕ приймає `path` — шлях об'єкта в bucket тепер генерує
 * ЛИШЕ сервер (`cover-upload/index.ts`, `crypto.randomUUID()`), навмисно жодного клієнтського
 * рядка (раніше — `editionId`/timestamp) у шляху сховища.
 *
 * `fetch(localUri).then(r => r.blob())` — стандартний спосіб React Native прочитати локальний
 * файл як `Blob` для завантаження без додаткової залежності (fetch-поліфіл RN підтримує
 * `file://`-схему для читання).
 */
export async function uploadCoverImage(localUri: string): Promise<string | null> {
  if (!isCoverStorageConfigured()) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const fileResponse = await fetch(localUri);
    const blob = await fileResponse.blob();

    const uploadResponse = await fetch(`${SUPABASE_URL}/functions/v1/cover-upload`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'image/jpeg',
      },
      body: blob,
      signal: controller.signal,
    });

    if (!uploadResponse.ok) {
      const bodyText = await uploadResponse.text().catch(() => '');
      log.warn('Завантаження обкладинки: не-OK відповідь', {
        status: uploadResponse.status,
        body: bodyText.slice(0, 300),
      });
      return null;
    }

    const json = (await uploadResponse.json()) as { url?: unknown };
    return typeof json.url === 'string' ? json.url : null;
  } catch (error) {
    log.warn('Завантаження обкладинки: помилка запиту', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
