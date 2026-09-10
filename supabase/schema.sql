-- Полиця — спільний каталог книг (Milestone 8.2)
--
-- Контекст: локальний SQLite на кожному пристрої не може бути "спільним" між користувачами
-- (docs/LOCAL_FIRST.md) — щоб не витрачати платні запити ISBNdb повторно на ту саму книгу,
-- яку вже шукав/додав інший користувач, потрібне окреме, справді спільне сховище. Це перший
-- реальний випадок використання Supabase-заготовки з `app.config.ts`/`.env.example`
-- (`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`), яка досі була лише плейсхолдером.
--
-- Як застосувати: Supabase Dashboard → SQL Editor → New query → вставити весь цей файл → Run.
-- Ідемпотентно (create ... if not exists / create or replace) — можна перезапускати безпечно.
--
-- Модель доступу: жодного стовпця `user_id`/auth немає (застосунок поки без акаунтів,
-- docs/LOCAL_FIRST.md). Тому таблиці НІКОЛИ не відкриваються напряму анонімному ключу — RLS
-- увімкнено без жодної policy (= deny-all за замовчуванням) І додатково явно відкликані всі
-- table-level права в anon/authenticated. Єдиний дозволений шлях — SECURITY DEFINER функції
-- нижче, кожна вузько робить рівно одну дію. Це свідомий компроміс: без власної системи
-- акаунтів немає способу відрізнити "чесного" клієнта від зловмисника з тим самим (публічним
-- за дизайном) anon-ключем — базові CHECK-обмеження нижче (довжина полів, обов'язковість ISBN)
-- це дешевий перший рубіж, не повний захист від спаму. Якщо це стане реальною проблемою —
-- наступний крок: Supabase Anonymous Auth (безкоштовна, не вимагає форми реєстрації від
-- користувача) замість повністю відкритого anon-ключа.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Спільні метадані книги — одна книга/видання, підтверджене якимось джерелом (Google Books,
-- Open Library, ISBNdb, ручне введення) хоча б одним користувачем.
create table if not exists catalog_book (
  id uuid primary key default gen_random_uuid(),
  isbn13 text,
  isbn10 text,
  title text not null check (char_length(title) between 1 and 500),
  authors text[] not null default '{}',
  publisher text check (publisher is null or char_length(publisher) <= 300),
  publication_year integer check (publication_year is null or publication_year between 0 and 3000),
  page_count integer check (page_count is null or page_count > 0),
  language text not null default 'uk' check (char_length(language) <= 30),
  description text check (description is null or char_length(description) <= 5000),
  cover_url text check (cover_url is null or char_length(cover_url) <= 2000),
  source_type text not null,
  source_name text not null,
  source_external_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint catalog_book_has_isbn check (isbn13 is not null or isbn10 is not null)
);

create unique index if not exists catalog_book_isbn13_key on catalog_book (isbn13) where isbn13 is not null;
create unique index if not exists catalog_book_isbn10_key on catalog_book (isbn10) where isbn10 is not null;
create index if not exists catalog_book_title_trgm_idx on catalog_book using gin (title gin_trgm_ops);

-- Анонімна позначка "цей пристрій додав цю книгу собі в бібліотеку" — окрема таблиця замість
-- лічильника прямо на catalog_book, щоб той самий пристрій не міг накрутити added_count
-- повторним додаванням/видаленням (primary key на парі не дає дублікатів; added_count завжди
-- рахується як count(*) цієї таблиці, а не окремим стовпцем, що можна неузгоджено розсинхронити).
-- `device_id` — випадковий UUID, згенерований і збережений локально на пристрої
-- (src/lib/deviceId.ts, той самий підхід, що theme preference), НЕ прив'язаний до жодних
-- персональних даних.
create table if not exists catalog_book_device (
  book_id uuid not null references catalog_book(id) on delete cascade,
  device_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (book_id, device_id)
);

alter table catalog_book enable row level security;
alter table catalog_book_device enable row level security;
-- Свідомо жодної policy — RLS за замовчуванням забороняє все, чого явно не дозволено.

revoke all on catalog_book from anon, authenticated;
revoke all on catalog_book_device from anon, authenticated;

-- Пошук за назвою/автором: substring (ILIKE, той самий підхід, що WorkRepository.search
-- локально) АБО триграм-схожість (толерантність до одруку) — обидва разом, ширше покриття.
-- added_count вважається "на льоту" (не зберігається окремо) — сортування за ним ПЕРШИМ
-- пріоритетом (пряме прохання користувача: книги, які хтось уже реально додав собі, мають
-- йти першими в списку), потім за релевантністю тексту.
create or replace function catalog_search(p_query text, p_limit int default 20)
returns table (
  id uuid, isbn13 text, isbn10 text, title text, authors text[], publisher text,
  publication_year integer, page_count integer, language text, description text,
  cover_url text, source_type text, source_name text, source_external_id text,
  added_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.isbn13, b.isbn10, b.title, b.authors, b.publisher, b.publication_year,
    b.page_count, b.language, b.description, b.cover_url, b.source_type, b.source_name,
    b.source_external_id,
    (select count(*) from catalog_book_device d where d.book_id = b.id) as added_count
  from catalog_book b
  where length(trim(p_query)) >= 3
    and (b.title ilike '%' || p_query || '%' or b.title % p_query)
  order by added_count desc, similarity(b.title, p_query) desc, b.last_seen_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Точний лукап за ISBN (10 чи 13) — використовується і в текстовому пошуку, і на екрані
-- сканування штрихкоду (перевіряється ДО будь-якого зовнішнього провайдера).
create or replace function catalog_find_by_isbn(p_isbn text)
returns table (
  id uuid, isbn13 text, isbn10 text, title text, authors text[], publisher text,
  publication_year integer, page_count integer, language text, description text,
  cover_url text, source_type text, source_name text, source_external_id text,
  added_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.isbn13, b.isbn10, b.title, b.authors, b.publisher, b.publication_year,
    b.page_count, b.language, b.description, b.cover_url, b.source_type, b.source_name,
    b.source_external_id,
    (select count(*) from catalog_book_device d where d.book_id = b.id) as added_count
  from catalog_book b
  where b.isbn13 = p_isbn or b.isbn10 = p_isbn
  limit 1;
$$;

-- Записує підтверджені метадані книги в спільний каталог (клієнт викликає це ПІСЛЯ того, як
-- користувач сам зберіг книгу через зовнішній провайдер — ніколи заздалегідь/без підтвердження
-- людиною, той самий принцип "перегляд перед збереженням", що й локально). Апсерт за ISBN:
-- якщо книга вже є в каталозі (хтось інший її вже підтвердив раніше) — оновлює лише
-- last_seen_at, не перезаписує чужі дані новими (перший підтверджений запис виграє;
-- розв'язання конфліктів між джерелами — можлива майбутня фіча для кураторів, не зараз).
create or replace function catalog_upsert_book(
  p_isbn13 text, p_isbn10 text, p_title text, p_authors text[], p_publisher text,
  p_publication_year integer, p_page_count integer, p_language text, p_description text,
  p_cover_url text, p_source_type text, p_source_name text, p_source_external_id text
) returns table (id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_isbn13 is null and p_isbn10 is null then
    raise exception 'catalog_upsert_book: потрібен хоча б один ISBN';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'catalog_upsert_book: title обов''язковий';
  end if;

  select b.id into v_id from catalog_book b
    where (p_isbn13 is not null and b.isbn13 = p_isbn13)
       or (p_isbn10 is not null and b.isbn10 = p_isbn10)
    limit 1;

  if v_id is null then
    insert into catalog_book (
      isbn13, isbn10, title, authors, publisher, publication_year, page_count, language,
      description, cover_url, source_type, source_name, source_external_id
    ) values (
      p_isbn13, p_isbn10, p_title, coalesce(p_authors, '{}'), p_publisher, p_publication_year,
      p_page_count, coalesce(nullif(trim(p_language), ''), 'uk'), p_description, p_cover_url,
      p_source_type, p_source_name, p_source_external_id
    )
    returning catalog_book.id into v_id;
  else
    update catalog_book set
      isbn13 = coalesce(catalog_book.isbn13, p_isbn13),
      isbn10 = coalesce(catalog_book.isbn10, p_isbn10),
      last_seen_at = now()
    where catalog_book.id = v_id;
  end if;

  return query select v_id;
end;
$$;

-- Анонімна позначка "додав(-ла) собі" / її скасування — idempotent (повторний виклик з тим
-- самим device_id нічого не ламає й не накручує лічильник). Приймає ISBN, а не сам id книги
-- каталогу: клієнт (мобільний застосунок) на момент "додати до бібліотеки"/"прибрати з
-- бібліотеки" знає лише локальний ISBN видання, ніколи внутрішній uuid каталогу — так
-- простіше й не вимагає окремого лукапу перед кожним викликом. Якщо книги з таким ISBN у
-- каталозі ще немає (наприклад, додана вручну без ISBN-перевірки) — тихий no-op, не помилка.
create or replace function catalog_mark_added(p_isbn13 text, p_isbn10 text, p_device_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select b.id into v_id from catalog_book b
    where (p_isbn13 is not null and b.isbn13 = p_isbn13)
       or (p_isbn10 is not null and b.isbn10 = p_isbn10)
    limit 1;

  if v_id is not null then
    insert into catalog_book_device (book_id, device_id)
    values (v_id, p_device_id)
    on conflict (book_id, device_id) do nothing;
  end if;
end;
$$;

create or replace function catalog_mark_removed(p_isbn13 text, p_isbn10 text, p_device_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select b.id into v_id from catalog_book b
    where (p_isbn13 is not null and b.isbn13 = p_isbn13)
       or (p_isbn10 is not null and b.isbn10 = p_isbn10)
    limit 1;

  if v_id is not null then
    delete from catalog_book_device
    where book_id = v_id and device_id = p_device_id;
  end if;
end;
$$;

-- Заповнює cover_url книги каталогу, ЛИШЕ якщо він ще порожній (Milestone 10, "Додати
-- обкладинку") — ніколи не перезаписує вже наявну обкладинку (від Google Books/Open
-- Library/ISBNdb чи від когось, хто вже додав своє фото раніше): перший вдалий образ
-- виграє, той самий принцип "перший підтверджений запис виграє", що вже застосований до
-- решти полів у catalog_upsert_book вище. Якщо книги з таким ISBN у каталозі ще немає —
-- тихий no-op (клієнт у цьому випадку викликає catalog_upsert_book напряму, з повними
-- метаданими, `src/data/remote/catalogSync.ts`).
create or replace function catalog_set_cover_if_missing(p_isbn13 text, p_isbn10 text, p_cover_url text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_cover_url is null or length(trim(p_cover_url)) = 0 then
    return;
  end if;

  update catalog_book set
    cover_url = p_cover_url,
    last_seen_at = now()
  where ((p_isbn13 is not null and catalog_book.isbn13 = p_isbn13)
      or (p_isbn10 is not null and catalog_book.isbn10 = p_isbn10))
    and catalog_book.cover_url is null;
end;
$$;

grant execute on function catalog_search(text, int) to anon, authenticated;
grant execute on function catalog_find_by_isbn(text) to anon, authenticated;
grant execute on function catalog_upsert_book(
  text, text, text, text[], text, integer, integer, text, text, text, text, text, text
) to anon, authenticated;
grant execute on function catalog_mark_added(text, text, uuid) to anon, authenticated;
grant execute on function catalog_mark_removed(text, text, uuid) to anon, authenticated;
grant execute on function catalog_set_cover_if_missing(text, text, text) to anon, authenticated;

-- Публічний bucket для фото обкладинок, які фотографують самі користувачі (Milestone 10,
-- "Додати обкладинку" — коли жоден провайдер не мав офіційної обкладинки). `public = true`
-- означає лише що ЧИТАННЯ (GET) не потребує RLS-політики — записи (upload) усе одно
-- проходять через RLS `storage.objects` нижче, як і для будь-якого іншого bucket.
-- `file_size_limit`/`allowed_mime_types` — дешевий перший рубіж проти сміттєвих/завеликих
-- завантажень (той самий рівень захисту, що й CHECK-обмеження на `catalog_book` вище, не
-- повний захист від зловживання анонімним ключем — той самий свідомий компроміс, що описаний
-- на початку цього файлу).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS на storage.objects керує Supabase (увімкнено за замовчуванням на весь проєкт, не лише
-- на цей bucket).
--
-- POLYTSIA V1.5, Фаза 1.2 (docs/SECURITY.md, знахідка 🟡, ВИПРАВЛЕНО 2026-09-10): до цього
-- тут була policy, що дозволяла anon/authenticated НАПРЯМУ завантажувати будь-яку кількість
-- файлів у bucket `book-covers` без жодного rate limit — той самий anon-ключ, що й для решти
-- застосунку, неминуче публічний, тож будь-хто міг скриптом заливати 5MB-файли в циклі.
-- Замінено на: жодної policy для anon/authenticated ВЗАГАЛІ (RLS-заборона за замовчуванням,
-- той самий принцип deny-all, що й catalog_book/curated_book/edge_rate_limit вище) — єдиний
-- шлях запису тепер `supabase/functions/cover-upload/` (Edge Function, `service_role`, що й
-- так обходить RLS повністю, окремих policy для неї не треба). Читання (`public: true` на
-- самому bucket, вище) лишається відкритим — небезпечним був саме запис, не читання.
drop policy if exists "book-covers anon upload" on storage.objects;

-- ============================================================================================
-- Тренди (Milestone 11, доповнення): топ-10 книг за кількістю пристроїв, що зберегли їх собі.
-- Жодних нових таблиць — увесь сигнал уже є в catalog_book_device вище, тут лише агрегація.
-- Анонімно за дизайном (лічильник пристроїв, не людей): без акаунтів немає й не може бути
-- "хто саме" в цій вибірці.
create or replace function catalog_top_books(p_limit int default 10)
returns table (
  id uuid, isbn13 text, isbn10 text, title text, authors text[], publisher text,
  publication_year integer, page_count integer, language text, description text,
  cover_url text, source_type text, source_name text, source_external_id text,
  added_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.isbn13, b.isbn10, b.title, b.authors, b.publisher, b.publication_year,
    b.page_count, b.language, b.description, b.cover_url, b.source_type, b.source_name,
    b.source_external_id,
    count(d.device_id) as added_count
  from catalog_book b
  join catalog_book_device d on d.book_id = b.id
  group by b.id
  order by added_count desc, b.last_seen_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function catalog_top_books(int) to anon, authenticated;

-- ============================================================================================
-- Кураторський каталог рекомендацій (Milestone 11, доповнення) — «Що почитати завтра?»
-- (docs/BOOK_PROVIDERS.md) виявився ненадійним на самому лише Google Books: вільнотекстовий
-- пошук без структурованого жанру/настрою і непостійна мовна мітка інколи не давали жодного
-- результату навіть після двох ітерацій фіксів. Це ВЛАСНА добірка книг власника продукту —
-- кожен рядок вручну позначений жанром (той самий словник, що й локальний `GenreRepository`,
-- `SEED_GENRES`) і метою читання (`RecommendationPurpose`), тож збіг для "Що почитати
-- завтра?" точний, а не вгаданий, і книга гарантовано українською (куратор сам це знає, а не
-- вгадує з ненадійної мовної мітки провайдера). Одночасно — та сама "полиця" бере участь і в
-- звичайному пошуку (`CuratedCatalogProvider`, той самий `BookMetadataProvider`, що й для
-- решти джерел), тож користувачі бачать ці книги одразу, без окремого UI.
--
-- Той самий підхід до доступу, що й catalog_book/catalog_book_device вище: RLS увімкнено БЕЗ
-- жодної policy + явний revoke, читання лише через SECURITY DEFINER RPC. АЛЕ на відміну від
-- catalog_book, записи сюди НІКОЛИ не йдуть з клієнтського anon-ключа — жодної "upsert"
-- RPC-функції немає взагалі. Єдиний спосіб додати/змінити рядок — `service_role` ключ
-- (ніколи не потрапляє в застосунок, `.env.example`), яким користується лише локальний
-- скрипт власника продукту (`scripts/sync-curated-books.js`, `data/curated-books.csv`) —
-- service_role і так обходить RLS повністю, окремих RPC для запису не потрібно.
create table if not exists curated_book (
  -- Текстовий id (slug), обраний власником продукту в CSV — не uuid: людський, стабільний
  -- ключ для ідемпотентного upsert зі скрипта (перезапуск скрипта з тим самим рядком CSV не
  -- створює дублікат), і той самий рядок напряму стає book_key у локальному трекінгу показів
  -- (`006_recommendation_shown.ts`) без додаткового мапінгу.
  id text primary key check (char_length(id) between 1 and 100),
  title text not null check (char_length(title) between 1 and 500),
  authors text[] not null default '{}',
  isbn13 text,
  isbn10 text,
  page_count integer check (page_count is null or page_count > 0),
  cover_url text check (cover_url is null or char_length(cover_url) <= 2000),
  description text check (description is null or char_length(description) <= 5000),
  language text not null default 'uk' check (char_length(language) <= 30),
  -- Жанри книги — рядки, що збігаються з `GenreRepository.SEED_GENRES` (nameUk) точно; масив,
  -- не одне значення — та сама книга природно підходить під кілька жанрів (докладніше —
  -- `curated_book_recommend` нижче, яка звіряє через `= any(genres)`).
  genres text[] not null default '{}',
  -- Підмножина `RecommendationPurpose` (`src/lib/tomorrowRecommendation.ts`):
  -- light/cry/laugh/absorbed. М'який пріоритет у `curated_book_recommend`, не жорсткий
  -- фільтр — той самий урок, що й каскад мовної фільтрації для Google Books (fix2):
  -- порожній результат гірший за менш точний, тож книга без збігу мети все одно лишається
  -- кандидатом на рівні жанру.
  purposes text[] not null default '{}',
  -- Дає прибрати книгу з видачі без видалення рядка (наприклад, тимчасово недоступне
  -- видання) — CSV-рядок з is_active=false просто перестає з'являтись, історія лишається.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curated_book_genres_idx on curated_book using gin (genres);
create index if not exists curated_book_purposes_idx on curated_book using gin (purposes);
create index if not exists curated_book_title_trgm_idx on curated_book using gin (title gin_trgm_ops);
create unique index if not exists curated_book_isbn13_key on curated_book (isbn13) where isbn13 is not null;
create unique index if not exists curated_book_isbn10_key on curated_book (isbn10) where isbn10 is not null;

alter table curated_book enable row level security;
revoke all on curated_book from anon, authenticated;

-- Для звичайного пошуку (`app/(tabs)/search.tsx`, `CuratedCatalogProvider`) — той самий
-- ILIKE + триграм підхід, що й `catalog_search`, лише без `added_count` (curated_book не
-- бере участі в лічильнику пристроїв catalog_book_device — це окрема "полиця").
create or replace function curated_book_search(p_query text, p_limit int default 20)
returns table (
  id text, title text, authors text[], isbn13 text, isbn10 text, page_count integer,
  cover_url text, description text, language text, genres text[], purposes text[]
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.authors, b.isbn13, b.isbn10, b.page_count, b.cover_url,
    b.description, b.language, b.genres, b.purposes
  from curated_book b
  where b.is_active
    and length(trim(p_query)) >= 3
    and (b.title ilike '%' || p_query || '%' or b.title % p_query)
  order by similarity(b.title, p_query) desc, b.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- «Що почитати завтра?» — жанр обов'язковий (`b.genres @> array[p_genre]`, еквівалент
-- `p_genre = any(b.genres)` для скалярного значення праворуч, але саме ЦЯ форма — той
-- оператор (`@>`), який `curated_book_genres_idx` (GIN, стандартний array_ops нижче) реально
-- вміє прискорити; `= any()` для планувальника Postgres не є таким оператором, і без цієї
-- зміни індекс на genres мовчки не використовувався б жодним запитом). Мета лише впливає на
-- порядок (книги з `p_purpose = any(purposes)` йдуть першими, решта книг цього жанру —
-- одразу за ними, а не відкидаються) — це вже ORDER BY, не WHERE, тож індекс тут не потрібен.
-- `random()`-компонент у сортуванні — щоб повторний виклик із тим самим жанром+метою природно
-- перемішував порядок кандидатів (клієнт і так додатково виключає вже показане,
-- `RecommendationRepository`, — це лише перший шар різноманітності, ще до того).
create or replace function curated_book_recommend(p_genre text, p_purpose text, p_limit int default 30)
returns table (
  id text, title text, authors text[], isbn13 text, isbn10 text, page_count integer,
  cover_url text, description text, language text, genres text[], purposes text[]
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.authors, b.isbn13, b.isbn10, b.page_count, b.cover_url,
    b.description, b.language, b.genres, b.purposes
  from curated_book b
  where b.is_active and b.genres @> array[p_genre]
  order by (p_purpose = any(b.purposes)) desc, random()
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

create or replace function curated_book_find_by_isbn(p_isbn text)
returns table (
  id text, title text, authors text[], isbn13 text, isbn10 text, page_count integer,
  cover_url text, description text, language text, genres text[], purposes text[]
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.authors, b.isbn13, b.isbn10, b.page_count, b.cover_url,
    b.description, b.language, b.genres, b.purposes
  from curated_book b
  where b.is_active and (b.isbn13 = p_isbn or b.isbn10 = p_isbn)
  limit 1;
$$;

create or replace function curated_book_get(p_id text)
returns table (
  id text, title text, authors text[], isbn13 text, isbn10 text, page_count integer,
  cover_url text, description text, language text, genres text[], purposes text[]
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.authors, b.isbn13, b.isbn10, b.page_count, b.cover_url,
    b.description, b.language, b.genres, b.purposes
  from curated_book b
  where b.is_active and b.id = p_id
  limit 1;
$$;

grant execute on function curated_book_search(text, int) to anon, authenticated;
grant execute on function curated_book_recommend(text, text, int) to anon, authenticated;
grant execute on function curated_book_find_by_isbn(text) to anon, authenticated;
grant execute on function curated_book_get(text) to anon, authenticated;

-- ============================================================================================
-- Rate limit для Edge Functions (POLYTSIA V1.5, Фаза 1.1, `supabase/functions/isbndb-proxy/`) —
-- єдина спільна таблиця/RPC, яку зможе перевикористати БУДЬ-яка майбутня Edge Function
-- застосунку (наприклад, майбутній upload-проксі Фази 1.2), а не окрема таблиця під кожну.
--
-- Модель доступу — суворіша навіть за curated_book: жодного grant для anon/authenticated
-- узагалі, ні на таблицю, ні на RPC. Викликач — виключно сама Edge Function, через
-- `service_role`-ключ (Supabase проставляє його в середовище кожної функції автоматично,
-- `SUPABASE_SERVICE_ROLE_KEY`) — той самий ключ, що обходить RLS повністю для
-- `scripts/sync-curated-books.js`, тут використовується так само вузько: лише для цього
-- одного RPC, ніколи для прямого запису в інші таблиці з коду функції.
--
-- Rate limit — за IP-адресою (найкращий безпечний pre-auth варіант; чому не "справжній"
-- per-user ліміт — докладний коментар на початку `index.ts` проксі-функції й
-- docs/SECURITY.md). ВІДОМЕ ОБМЕЖЕННЯ: рядки цієї таблиці не видаляються автоматично —
-- прийнятно для очікуваного масштабу (один продукт, не мільйони унікальних IP на день), але
-- якщо колись стане проблемою — досить простого періодичного `delete from edge_rate_limit
-- where window_start < now() - interval '7 days'` (вручну або через pg_cron, якщо буде
-- увімкнено в проєкті).
create table if not exists edge_rate_limit (
  bucket_key text primary key check (char_length(bucket_key) between 1 and 200),
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);

alter table edge_rate_limit enable row level security;
revoke all on edge_rate_limit from anon, authenticated;

-- Атомарний "fixed window" лічильник: один UPSERT-оператор — Postgres серіалізує конкурентні
-- виклики з тим самим bucket_key через блокування рядка (друга з двох одночасних транзакцій
-- чекає на першу, тоді рахує вже з оновленим значенням) — без цього конкурентні запити могли
-- б обидва прочитати "старий" count і обидва його інкрементувати, фактично пропускаючи вдвічі
-- більше запитів, ніж дозволяє ліміт. Повертає `true`, якщо запит у межах ліміту (і сам його
-- враховує), `false` — якщо ліміт уже вичерпано для поточного вікна.
create or replace function edge_rate_limit_check(p_bucket_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row edge_rate_limit%rowtype;
begin
  insert into edge_rate_limit (bucket_key, window_start, request_count)
  values (p_bucket_key, now(), 1)
  on conflict (bucket_key) do update set
    request_count = case
      when edge_rate_limit.window_start <= now() - make_interval(secs => p_window_seconds)
        then 1
      else edge_rate_limit.request_count + 1
    end,
    window_start = case
      when edge_rate_limit.window_start <= now() - make_interval(secs => p_window_seconds)
        then now()
      else edge_rate_limit.window_start
    end
  returning * into v_row;

  return v_row.request_count <= greatest(1, p_limit);
end;
$$;

grant execute on function edge_rate_limit_check(text, int, int) to service_role;
