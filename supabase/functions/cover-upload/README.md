# `cover-upload` — Supabase Edge Function

**POLYTSIA V1.5, Фаза 1.2** (`docs/SECURITY.md`, знахідка 🟡). Закриває необмежене анонімне
завантаження у bucket `book-covers` — усі upload'и обкладинок тепер ідуть через цю функцію,
не напряму anon-ключем.

Архітектура: `Мобільний застосунок → ця функція → Supabase Storage (book-covers)`.

Код — `index.ts` поруч (докладні коментарі про перевірку magic bytes, ліміт розміру,
генерацію шляху об'єкта й rate limiting прямо в файлі). Спільні `cors.ts`/`rateLimit.ts` —
`../_shared/`, ті самі модулі, що й `isbndb-proxy`.

## ⚠️ OWNER ACTION REQUIRED — розгортання

Той самий процес, що й `isbndb-proxy` (`supabase/functions/isbndb-proxy/README.md`) — якщо ти
вже розгорнув ту функцію, кроки 1-2 (CLI, login, link) повторювати не треба.

### 1-2. Supabase CLI, логін, link — якщо ще не зроблено для `isbndb-proxy`

```bash
npm install -g supabase
supabase login
supabase link --project-ref <твій-project-ref>
```

### 3. Задеплой функцію

```bash
supabase functions deploy cover-upload
```

(Знову — лишай `verify_jwt = true` за замовчуванням, **не додавай `--no-verify-jwt`**.)

Секрет тут ставити НЕ треба — функція використовує лише `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY`, які Supabase проставляє автоматично для кожної Edge Function
проєкту.

### 4. Застосуй оновлений `supabase/schema.sql`

Той самий крок, що й для Фази 1.1 — Dashboard → SQL Editor → New query → вставити **весь**
файл → Run. Цей крок для Фази 1.2 важливий по-особливому: він **прибирає** стару policy
`"book-covers anon upload"`, яка й була самою знахідкою 🟡 (необмежений анонімний запис).
Без цього кроку код функції задеплоєний, але діра лишається відкритою — пряме завантаження
anon-ключем усе ще працюватиме паралельно з новою функцією.

### 5. Онови мобільний застосунок

Код застосунку (`src/data/remote/coverStorageClient.ts`, `app/cover-photo/[editionId].tsx`)
уже переписано на виклик цієї функції — окремого прапорця-вмикача, як для ISBNdb, тут не
потрібно (завантаження обкладинок — безкоштовна дія для власника продукту, на відміну від
платного ISBNdb, тож немає причини тримати її вимкненою за замовчуванням). Просто задеплой
білд із цими змінами.

### 6. Перевір

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/cover-upload' \
  -H "apikey: <твій anon-ключ>" \
  -H "Authorization: Bearer <твій anon-ключ>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/шлях/до/тестового-фото.jpg
```

Очікується `{"url": "https://.../storage/v1/object/public/book-covers/<uuid>.jpg", "path":
"<uuid>.jpg"}`. Спробуй також надіслати не-зображення (наприклад, текстовий файл із
`Content-Type: image/jpeg`) — має повернутись `415 unsupported_media_type` (перевірка за
реальними байтами файлу, не лише заголовком).

## Що саме змінилось у безпеці

- **До:** `anon`-ключ мав необмежений `INSERT` у весь bucket `book-covers`
  (`supabase/schema.sql`, стара policy) — будь-хто зі скриптом міг заливати 5MB-файли в циклі.
- **Після:** жодного прямого клієнтського запису в bucket узагалі — лише ця функція, через
  `service_role`, і лише після rate limit + перевірки реального типу файлу за байтами.
- Шлях об'єкта в bucket більше не будується з клієнтського рядка (раніше — `editionId` +
  `Date.now()` з мобільного застосунку) — генерується сервером (`crypto.randomUUID()`),
  унеможливлює як довільний шлях, так і path traversal за конструкцією.
