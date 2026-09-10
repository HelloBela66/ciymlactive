import { buildCsv } from '@/lib/csv';
import { userBookStatusLabels, editionFormatLabels } from '@/design/i18n-labels';
import type { UserBookWithDetails } from '@/types/userBook';
import type { Rating } from '@/types/rating';
import type { Genre } from '@/types/genre';

const HEADER = [
  'Назва',
  'Автори',
  'Статус',
  'Оцінка',
  'Жанри',
  'Полиці',
  'Видавництво',
  'Рік видання',
  'Сторінок',
  'Поточна сторінка',
  'ISBN',
  'Мова',
  'Формат',
  'Улюблене',
  'Дата початку',
  'Дата завершення',
  'Дата додавання',
];

/**
 * Будує CSV-таблицю бібліотеки (Milestone 9) — для відкриття в Excel/Google Таблицях, не для
 * відновлення в самому застосунку (це навмисно НЕ той самий формат, що й повний JSON-бекап,
 * `docs/BACKUP_FORMAT.md`: тут — читабельна проекція, без внутрішніх id/зв'язків, які
 * потрібні лише самому застосунку). Чиста функція — легко перевірити без БД/React Native.
 */
export function buildLibraryCsv(
  userBooks: UserBookWithDetails[],
  ratingByUserBookId: Map<string, Rating>,
  genresByWorkId: Map<string, Genre[]>,
  shelfNamesByUserBookId: Map<string, string[]>,
): string {
  const rows = userBooks.map((ub) => {
    const rating = ratingByUserBookId.get(ub.id);
    const genres = genresByWorkId.get(ub.work.id) ?? [];
    const shelves = shelfNamesByUserBookId.get(ub.id) ?? [];

    return [
      ub.work.title,
      ub.work.authors.map((a) => a.name).join(', '),
      userBookStatusLabels[ub.status],
      rating ? String(rating.value) : '',
      genres.map((g) => g.nameUk).join(', '),
      shelves.join(', '),
      ub.edition.publisher?.name ?? '',
      ub.edition.publicationYear != null ? String(ub.edition.publicationYear) : '',
      ub.edition.pageCount != null ? String(ub.edition.pageCount) : '',
      String(ub.currentPage),
      ub.edition.isbn13 ?? ub.edition.isbn10 ?? '',
      ub.edition.language,
      editionFormatLabels[ub.edition.format],
      ub.isFavorite ? 'Так' : 'Ні',
      ub.startedAt ?? '',
      ub.finishedAt ?? '',
      ub.addedAt,
    ];
  });

  return buildCsv(HEADER, rows);
}
