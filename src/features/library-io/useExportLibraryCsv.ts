import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { ShelfRepository } from '@/data/repositories/ShelfRepository';
import { buildLibraryCsv } from './libraryCsvExport';
import { writeAndShareCsvFile } from '@/lib/csvFile';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';

const log = createLogger('features/library-io/export');

/** Експорт усієї бібліотеки в CSV (Milestone 9) — той самий "записати файл і відкрити
 * системне Поділитися" підхід, що й `useExportBackup` (Milestone 6), інша мета: не повний
 * бекап для відновлення в цьому ж застосунку, а читабельна таблиця для Excel/Google Таблиць
 * чи довільної іншої обробки поза застосунком. */
export function useExportLibraryCsv() {
  const onError = useMutationErrorHandler(log, 'Не вдалося створити CSV-файл. Спробуй ще раз.');
  return useMutation({
    mutationFn: async () => {
      const db = await getDatabase();
      const userBooks = await UserBookRepository.listAll(db);

      const [ratingByUserBookId, genresByWorkId, shelfNamesByUserBookId] = await Promise.all([
        RatingRepository.listByUserBookIds(db, userBooks.map((ub) => ub.id)),
        GenreRepository.listByWorkIds(db, userBooks.map((ub) => ub.work.id)),
        ShelfRepository.listNamesByUserBookIds(db, userBooks.map((ub) => ub.id)),
      ]);

      const csv = buildLibraryCsv(userBooks, ratingByUserBookId, genresByWorkId, shelfNamesByUserBookId);
      const filename = `polytsya-biblioteka-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      return writeAndShareCsvFile(csv, filename);
    },
    onError,
  });
}
