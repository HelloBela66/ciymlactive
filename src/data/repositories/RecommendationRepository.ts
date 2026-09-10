import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { RecommendationPurpose } from '@/lib/tomorrowRecommendation';

interface ShownKeyRow {
  book_key: string;
}

/**
 * Локальна історія показів для «Що почитати завтра?» (Milestone 11, доповнення,
 * `006_recommendation_shown.ts`) — "та сама книга не пропонується повторно на той самий
 * запит жанр+мета". Читання/запис тут — виключно за `(genre_id, purpose)`: логіка вибору
 * самого кандидата (пошук, ранжування, рандомний пік) лишається чистою в
 * `src/lib/tomorrowRecommendation.ts`, підняте разом у `useTomorrowRecommendation.ts`.
 */
export const RecommendationRepository = {
  async listShownKeys(db: SQLiteDatabase, genreId: string, purpose: RecommendationPurpose): Promise<Set<string>> {
    const rows = await db.getAllAsync<ShownKeyRow>(
      `SELECT book_key FROM book_recommendation_shown WHERE genre_id = ? AND purpose = ?`,
      [genreId, purpose],
    );
    return new Set(rows.map((row) => row.book_key));
  },

  async recordShown(
    db: SQLiteDatabase,
    genreId: string,
    purpose: RecommendationPurpose,
    bookKey: string,
    title: string,
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO book_recommendation_shown (id, genre_id, purpose, book_key, title, shown_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId(), genreId, purpose, bookKey, title, nowIso()],
    );
  },

  /** Очищує історію показів САМЕ для цієї пари жанр+мета — використовується, коли пул
   * кандидатів для конкретного запиту вичерпано (`useTomorrowRecommendation.ts`), щоб
   * рекомендації не впирались у глухий кут "усе вже показано", а почали коло знову. Не чіпає
   * жодну іншу пару жанр+мета. */
  async resetShown(db: SQLiteDatabase, genreId: string, purpose: RecommendationPurpose): Promise<void> {
    await db.runAsync(`DELETE FROM book_recommendation_shown WHERE genre_id = ? AND purpose = ?`, [genreId, purpose]);
  },
};
