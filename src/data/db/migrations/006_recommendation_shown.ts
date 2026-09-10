import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 006 — «Що почитати завтра?» (Milestone 11, доповнення): нова таблиця
 * `book_recommendation_shown`.
 *
 * Пряме прохання власника продукту: кнопка на Головній, що за жанром + доступним часом +
 * метою читання підбирає нову книгу, і "одна й та сама книга не повинна пропонуватись на
 * той самий запит повторно". Ця таблиця — локальна (повністю самодостатня в SQLite, без
 * прив'язки до пристрою в спільному каталозі, `docs/LOCAL_FIRST.md`) історія книг, уже
 * показаних для конкретної пари "жанр + мета читання". Друга половина прохання — "і не
 * іншому користувачу" — свідомо ВІДКЛАДЕНА (`docs/ROADMAP.md`, "Дует читання"): вимагає
 * спільного сервера з прив'язкою до користувачів, якого зараз немає.
 *
 * `book_key` — ISBN-13/ISBN-10 книги (той самий пріоритет, що й дедублікація результатів у
 * `app/(tabs)/search.tsx`), або, коли книга взагалі без ISBN, сам `externalId` кандидата
 * (`recommendationBookKey`, `src/lib/tomorrowRecommendation.ts`) — джерело кандидата тепер
 * не лише Google Books, а й власна кураторська добірка (`CuratedCatalogProvider`, Milestone 11,
 * доповнення); ISBNdb як і раніше НІКОЛИ не використовується для рекомендацій — не множити
 * платні виклики (`docs/SECURITY.md` знахідка 🔴) на фічу, до якої користувач природно
 * тапатиме повторно.
 *
 * БЕЗ CHECK на `purpose` — той самий свідомий вибір, що й `note.reaction`/
 * `book_memory.template_id`: enum лишається лише в TypeScript
 * (`RecommendationPurpose`, `src/lib/tomorrowRecommendation.ts`).
 *
 * `genre_id` — FK на `genre`, ON DELETE CASCADE: видалення жанру (`GenreRepository`) прибирає
 * й історію показів для нього, а не лишає осиротілі рядки.
 */
export const version = 6;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE book_recommendation_shown (
      id TEXT PRIMARY KEY,
      genre_id TEXT NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      book_key TEXT NOT NULL,
      title TEXT NOT NULL,
      shown_at TEXT NOT NULL
    );
    CREATE INDEX idx_recommendation_shown_lookup ON book_recommendation_shown(genre_id, purpose);
  `);
}
