import type { SQLiteDatabase } from 'expo-sqlite';

export const version = 11;

/**
 * Migration 011 — «ПОВЕРНУТИСЯ ПІЗНІШЕ» (POLYTSIA V1.5, Фаза 11 ТЗ).
 *
 * Що робить: додає булевий прапорець `revisit_later` до `note` й `quote` — точнісінько той
 * самий патерн, що й `is_favorite` (Migration 003): `INTEGER NOT NULL DEFAULT 0`, БЕЗ rebuild
 * таблиці (на відміну від `note.type`'s CHECK у 003 — тут немає CHECK, простий `ALTER TABLE
 * ADD COLUMN` для обох таблиць достатній, той самий підхід, що й 009/010).
 *
 * `DEFAULT 0`, а не NULL-без-DEFAULT (як-от `reading_session.reading_experience` у 010) —
 * навмисно: це прапорець "так/ні" з чітким нейтральним станом ("не позначено"), той самий
 * випадок, що й `is_favorite`/`shelf.theme`, а не справді необов'язкове поле без природного
 * дефолту.
 *
 * Індекси (`idx_note_revisit_later`/`idx_quote_revisit_later`) — той самий привід, що й
 * `idx_note_favorite`/`idx_quote_favorite` (Migration 003): `JournalRepository` фільтруватиме
 * за цим прапорцем (`revisitLaterOnly`, той самий шлях, що й `favoriteOnly`) просто в WHERE,
 * і DATABASE.md вимагає SQLite-side фільтрації вже для 10к+ записів.
 */
export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE note ADD COLUMN revisit_later INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE quote ADD COLUMN revisit_later INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX idx_note_revisit_later ON note(revisit_later);
    CREATE INDEX idx_quote_revisit_later ON quote(revisit_later);
  `);
}
