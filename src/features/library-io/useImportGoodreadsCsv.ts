import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '@/data/db';
import { createWorkAndEditionFromDraft } from '@/data/repositories/bookDraftRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { ShelfRepository } from '@/data/repositories/ShelfRepository';
import { parseGoodreadsCsv, type GoodreadsImportRow } from './goodreadsImport';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';

const log = createLogger('features/library-io/goodreadsImport');

export interface ImportGoodreadsResult {
  imported: number;
  skipped: number;
  totalDataRows: number;
  failed: number;
}

/** Персистить один розібраний рядок Goodreads-імпорту — окрема функція, а не тіло циклу
 * всередині `mutationFn`, щоб один рядок, який впав (наприклад, неочікуваний CHECK-констрейнт),
 * не зупиняв увесь імпорт: викликається з `try/catch` на кожній ітерації нижче. */
async function importRow(db: SQLiteDatabase, row: GoodreadsImportRow): Promise<void> {
  const created = await createWorkAndEditionFromDraft(db, row.draft);
  const userBook = await UserBookRepository.addToLibrary(db, created.editionId, row.status);

  await UserBookRepository.applyImportedDates(db, userBook.id, {
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    addedAt: row.addedAt,
  });

  if (row.ratingValue != null) {
    await RatingRepository.upsert(db, { userBookId: userBook.id, value: row.ratingValue });
  }

  for (const shelfName of row.shelfNames) {
    const shelf = await ShelfRepository.findOrCreateByName(db, shelfName);
    await ShelfRepository.addBook(db, shelf.id, userBook.id);
  }
}

/**
 * Імпорт бібліотеки з Goodreads CSV-експорту (Milestone 9, `docs/PRODUCT.md`). Кожен рядок
 * — окрема книга (`Work`+`Edition`) через той самий `createWorkAndEditionFromDraft`, яким
 * іде і ручне додавання, і зовнішні провайдери (Milestone 7) — жодної окремої гілки
 * персистенції для імпортованих книг. Дублікати НЕ виявляються: повторний імпорт того самого
 * файлу створить другі копії книг (як і ручне додавання тієї самої книги двічі) — прийнятне
 * обмеження для разової дії, явно попереджаємо про це в UI (`app/import/goodreads.tsx`).
 *
 * Один рядок, що впав (`try/catch` на кожній ітерації), не зупиняє решту імпорту — інакше
 * файл на кілька сотень книг ризикував би не імпортуватись ЖОДНОЮ книгою через один
 * пошкоджений рядок ближче до кінця.
 */
export function useImportGoodreadsCsv() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося імпортувати файл. Спробуй ще раз.');

  return useMutation<ImportGoodreadsResult, Error, string>({
    mutationFn: async (csvText) => {
      const parsed = parseGoodreadsCsv(csvText);
      const db = await getDatabase();

      let imported = 0;
      let failed = 0;
      for (const row of parsed.rows) {
        try {
          await importRow(db, row);
          imported++;
        } catch (error) {
          failed++;
          log.warn('Не вдалося імпортувати рядок Goodreads-експорту', {
            title: row.draft.title,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { imported, skipped: parsed.skippedCount, totalDataRows: parsed.totalDataRows, failed };
    },
    onSuccess: () => {
      // Імпорт зачіпає книги, полиці, оцінки й дати одразу — простіше й надійніше
      // інвалідувати геть увесь кеш (той самий підхід, що й `useRestoreBackup`), ніж
      // перелічувати кожен зачеплений query key вручну.
      queryClient.invalidateQueries();
    },
    onError,
  });
}
