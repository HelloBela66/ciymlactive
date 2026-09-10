// Спільний pre-Auth rate limiter для всіх Edge Functions «Полиці» (POLYTSIA V1.5, Фаза 1) —
// за IP-адресою клієнта, durable через Postgres (`edge_rate_limit`/`edge_rate_limit_check`,
// `supabase/schema.sql`), а не лічильник у пам'яті процесу (не пережив би холодний старт і не
// працював би однаково для кількох інстансів функції одночасно). Повний коментар про модель
// (чому IP, який залишковий ризик) — `supabase/functions/isbndb-proxy/index.ts` і
// `docs/SECURITY.md`; тут лише сам механізм виклику, спільний для будь-якої функції, що його
// використовує (наразі `isbndb-proxy` і `cover-upload`).

export interface RateLimitWindow {
  limit: number;
  windowSeconds: number;
}

/** Supabase Edge Functions працюють за платформним edge-проксі — `x-forwarded-for` там
 * проставляє сама платформа (не клієнт напряму), перший запис у списку — реальний клієнт. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return 'unknown';
}

/**
 * `true`, якщо запит у межах ліміту (і вже врахований), `false` — ліміт вичерпано. «Fail
 * open» (повертає `true`) за будь-якої проблеми з викликом самого RPC (мережа/БД тимчасово
 * недоступні) — свідомий компроміс: rate limit захищає від зловживання й зайвих витрат, але
 * повна відмова в сервісі ВСІМ користувачам через тимчасову проблему інфраструктури — гірший
 * наслідок для core-функціоналу застосунку, ніж тимчасова відсутність rate limit.
 */
export async function checkRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucketKey: string,
  window: RateLimitWindow,
): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/edge_rate_limit_check`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_bucket_key: bucketKey,
        p_limit: window.limit,
        p_window_seconds: window.windowSeconds,
      }),
    });
    if (!response.ok) return true;
    const allowed = await response.json();
    return allowed === true;
  } catch {
    return true;
  }
}

/** Перевіряє кілька вікон одночасно (наприклад, короткий "burst" + довгий "sustained") —
 * `true` лише якщо ВСІ вікна дозволяють запит. `namePrefix` відрізняє bucket-ключі різних
 * функцій одне від одного в тій самій спільній таблиці `edge_rate_limit` (наприклад
 * `isbndb-proxy:1.2.3.4:burst` проти `cover-upload:1.2.3.4:burst`). */
export async function checkRateLimitWindows(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucketPrefix: string,
  windows: Record<string, RateLimitWindow>,
): Promise<boolean> {
  if (!supabaseUrl || !serviceRoleKey) return true;
  const entries = Object.entries(windows);
  const results = await Promise.all(
    entries.map(([name, window]) =>
      checkRateLimit(supabaseUrl, serviceRoleKey, `${bucketPrefix}:${name}`, window),
    ),
  );
  return results.every(Boolean);
}
