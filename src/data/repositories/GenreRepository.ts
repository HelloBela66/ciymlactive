import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { slugify } from '@/lib/slugify';
import type { Genre } from '@/types/genre';

interface GenreRow {
  id: string;
  name_uk: string;
  slug: string;
}

function mapRow(row: GenreRow): Genre {
  return { id: row.id, nameUk: row.name_uk, slug: row.slug };
}

/** Куратований базовий список жанрів (Milestone 9) — `genre.name_uk`/`slug` навмисно
 * `UNIQUE` з самого Milestone 0 (`docs/DATABASE.md`): жанр задуманий як контрольований
 * словник (спільний для всіх книг), а не довільний текст на кшталт автора/видавця — це і
 * робить можливим осмислений фільтр/статистику "топ жанр" (Wrapped) замість розсипу
 * дублікатів на кшталт "Фентезі"/"фентезі "/"Fantasy". Користувач все одно може додати свій
 * жанр (`findOrCreateByName` нижче) — список не жорстко зафіксований, лише має розумний
 * старт. */
const SEED_GENRES: readonly string[] = [
  'Фентезі',
  'Наукова фантастика',
  'Детектив',
  'Трилер',
  'Романтика',
  'Історичний роман',
  'Пригоди',
  'Жахи',
  'Драма',
  'Класична література',
  'Сучасна проза',
  'Поезія',
  'Нон-фікшн',
  'Біографія та мемуари',
  'Історія',
  'Психологія',
  'Саморозвиток',
  'Бізнес',
  'Наука',
  'Філософія',
  'Публіцистика',
  'Дитяча література',
  'Підліткова література',
  'Комікси та графічні романи',
  'Гумор',
];

export const GenreRepository = {
  /** Викликається один раз при старті застосунку (`DatabaseProvider`, після міграцій) —
   * `INSERT OR IGNORE` за `slug` робить це ідемпотентним, тож повторний виклик на кожному
   * запуску нічого не дублює й не перезаписує вже змінені кимось (гіпотетично) рядки. */
  async ensureSeeded(db: SQLiteDatabase): Promise<void> {
    for (const nameUk of SEED_GENRES) {
      await db.runAsync(`INSERT OR IGNORE INTO genre (id, name_uk, slug) VALUES (?, ?, ?)`, [
        generateId(),
        nameUk,
        slugify(nameUk),
      ]);
    }
  },

  async listAll(db: SQLiteDatabase): Promise<Genre[]> {
    const rows = await db.getAllAsync<GenreRow>(`SELECT * FROM genre ORDER BY name_uk ASC`);
    return rows.map(mapRow);
  },

  async findOrCreateByName(db: SQLiteDatabase, nameUk: string): Promise<Genre> {
    const trimmed = nameUk.trim();
    const slug = slugify(trimmed);
    const existing = await db.getFirstAsync<GenreRow>(`SELECT * FROM genre WHERE slug = ?`, [slug]);
    if (existing) return mapRow(existing);

    const id = generateId();
    await db.runAsync(`INSERT INTO genre (id, name_uk, slug) VALUES (?, ?, ?)`, [id, trimmed, slug]);
    return { id, nameUk: trimmed, slug };
  },

  async listByWorkId(db: SQLiteDatabase, workId: string): Promise<Genre[]> {
    const rows = await db.getAllAsync<GenreRow>(
      `SELECT g.* FROM genre g
       JOIN work_genre wg ON wg.genre_id = g.id
       WHERE wg.work_id = ?
       ORDER BY g.name_uk ASC`,
      [workId],
    );
    return rows.map(mapRow);
  },

  /** Пакетний варіант для Wrapped (`useWrappedYear`) — один запит на "топ жанр року" замість
   * одного на кожну завершену книгу року (той самий принцип, що й
   * `AuthorRepository.listByWorkIds`/Milestone 8 продуктивність). */
  async listByWorkIds(db: SQLiteDatabase, workIds: string[]): Promise<Map<string, Genre[]>> {
    const result = new Map<string, Genre[]>();
    if (workIds.length === 0) return result;

    const placeholders = workIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<GenreRow & { work_id: string }>(
      `SELECT g.*, wg.work_id as work_id FROM genre g
       JOIN work_genre wg ON wg.genre_id = g.id
       WHERE wg.work_id IN (${placeholders})
       ORDER BY g.name_uk ASC`,
      workIds,
    );
    for (const row of rows) {
      const list = result.get(row.work_id) ?? [];
      list.push(mapRow(row));
      result.set(row.work_id, list);
    }
    return result;
  },

  /** Перемикання (додати/прибрати) — той самий підхід, що й `useToggleShelfBook`: одна дія,
   * а не окремі add/remove, які UI мусив би сам розрізняти. */
  async toggle(db: SQLiteDatabase, workId: string, genreId: string, isLinked: boolean): Promise<void> {
    if (isLinked) {
      await db.runAsync(`DELETE FROM work_genre WHERE work_id = ? AND genre_id = ?`, [workId, genreId]);
    } else {
      await db.runAsync(`INSERT OR IGNORE INTO work_genre (work_id, genre_id) VALUES (?, ?)`, [workId, genreId]);
    }
  },
};
