# `google-books-proxy` — Supabase Edge Function

**POLYTSIA V1.6.1, Фаза 4** (`docs/SECURITY.md`, знахідка 🟡; `docs/V1_6_FULL_AUDIT_REPORT.md`,
розділ 26/32). Тримає ключ Google Books (коли він є) на сервері — мобільний застосунок більше
ніколи не бачить `GOOGLE_BOOKS_API_KEY` напряму.

Архітектура: `Мобільний застосунок → ця функція → www.googleapis.com/books/v1`.

**Відмінність від `isbndb-proxy` поруч:** Google Books API безкоштовний і публічно доступний
навіть БЕЗ ключа (з нижчою анонімною квотою) — ключ тут лише піднімає квоту, не умова роботи.
Тому ця функція **не вимагає** секрету, щоб працювати — деплой без секрету одразу дає той самий
рівень сервісу, що мав анонімний клієнтський виклик раніше; секрет лише піднімає квоту, коли
власник продукту його додасть.

Код функції — `index.ts` поруч (докладні коментарі про три операції, таймаут, ліміт розміру
відповіді й rate limiting прямо в файлі).

## ⚠️ OWNER ACTION REQUIRED — розгортання

Той самий процес, що й `isbndb-proxy` (README.md поруч) — Supabase CLI й дії в Dashboard, жодна
з них не може бути виконана з цієї сесії.

### 1-2. Supabase CLI, логін, лінк проєкту

Якщо вже зроблено для `isbndb-proxy` — пропусти, той самий проєкт:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <твій-project-ref>
```

### 3. Задеплой функцію

```bash
supabase functions deploy google-books-proxy
```

(Так само, як і `isbndb-proxy` — **не додавай `--no-verify-jwt`**, `verify_jwt = true`
лишається першим, безкоштовним рубежем захисту.)

### 4. (Опційно) постав ключ Google Books — для вищої квоти

```bash
supabase secrets set GOOGLE_BOOKS_API_KEY=<твій_Google_Cloud_API_ключ>
```

Не обов'язково — функція працює й без цього кроку (анонімна квота Google Books), просто з
нижчою квотою, той самий компроміс, що діяв раніше прямо в клієнті. Як отримати ключ (якщо ще
нема): `console.cloud.google.com` → створити проєкт → "APIs & Services" → Library → увімкнути
"Books API" → Credentials → Create Credentials → API key.

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` Supabase проставляє **автоматично** — ставити вручну
не потрібно (той самий нюанс, що й `isbndb-proxy`).

### 5. Застосуй оновлений `supabase/schema.sql` (якщо ще не робив для `isbndb-proxy`)

`edge_rate_limit`/`edge_rate_limit_check` — та сама спільна таблиця/RPC, що вже використовує
`isbndb-proxy`/`cover-upload`. Якщо одну з тих двох функцій уже розгорнуто раніше — цей крок уже
зроблено, нічого повторювати не потрібно (SQL ідемпотентний, але зайвим не буде).

### 6. Увімкни фічу в мобільному застосунку

```
EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED=1
```

**На відміну від `EXPO_PUBLIC_ISBNDB_PROXY_ENABLED`** (де вимкнений прапорець означає "провайдер
повністю вимкнено, бо без нього ISBNdb не працює взагалі"), тут вимкнений прапорець (чи
непроставлений Supabase) означає лише "Google Books провайдер і далі працює як раніше — прямий
анонімний клієнтський виклик, без ключа, з нижчою квотою" — **не** повне вимкнення джерела
(`src/data/providers/GoogleBooksProvider.ts`, докладніше — коментар там-таки). Це свідомий вибір
backward-compatible архітектури (`docs/V1_6_1_FINAL_REPORT.md`, принцип "DO NOT SILENTLY CHANGE
PRODUCT BEHAVIOR"): Google Books — core-джерело пошуку (`docs/V1_6_FULL_AUDIT_REPORT.md`,
розділ 19 — "core loop"), і застосунок не повинен ламати пошук книг для власника продукту, який
ще не встиг задеплоїти цю функцію.

### 7. Перевір

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/google-books-proxy' \
  -H "apikey: <твій anon-ключ>" \
  -H "Authorization: Bearer <твій anon-ключ>" \
  -H "Content-Type: application/json" \
  -d '{"op":"search","query":"Кобзар","langRestrict":"uk"}'
```

Очікується `{"books": [...]}` (можливо порожній масив, якщо запит не дав результатів) — ніколи
текст самого `GOOGLE_BOOKS_API_KEY` в жодній відповіді.

## Після розгортання — прибери стару клієнтську конфігурацію

Якщо в `.env`/`.env.local` власника продукту досі є рядок
`EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=...` з доміграційних часів — його можна прибрати:
`GoogleBooksProvider.ts` більше НЕ читає це значення (докладніше — коментар у файлі), ключ (якщо
власник хоче вищу квоту) тепер ставиться лише через `supabase secrets set` вище.
