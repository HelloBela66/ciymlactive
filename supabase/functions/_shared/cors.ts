// Спільні CORS-заголовки для всіх Edge Functions «Полиці» (POLYTSIA V1.5, Фаза 1) — мобільний
// застосунок (React Native `fetch`) сам по собі не робить CORS preflight, але Supabase
// Dashboard/будь-який майбутній веб-клієнт (наприклад, панель власника продукту) — робить,
// тож заголовки тут навмисно на всі функції одразу, а не додаються ad hoc в кожну.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
