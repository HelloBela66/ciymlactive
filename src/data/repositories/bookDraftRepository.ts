import type { SQLiteDatabase } from 'expo-sqlite';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import { AuthorRepository } from './AuthorRepository';
import { PublisherRepository } from './PublisherRepository';
import { TranslatorRepository } from './TranslatorRepository';
import { SeriesRepository } from './SeriesRepository';
import { BookSourceRepository } from './BookSourceRepository';
import { WorkRepository } from './WorkRepository';
import { EditionRepository } from './EditionRepository';

export interface CreateWorkAndEditionResult {
  workId: string;
  editionId: string;
}

/**
 * Єдина точка персистенції "нормалізованого чернетки книги" у Work+Edition (+ автори,
 * видавництво, перекладачі, серія, book_source-провенанс). І ручне введення (Milestone 1),
 * і зовнішні провайдери (Milestone 7 — GoogleBooksProvider/ISBNdbProvider) виробляють один і
 * той самий NormalizedBookDraft (src/types/bookDraft.ts) і йдуть через цю саму функцію —
 * доменна логіка "як розкласти чернетку по нормалізованих таблицях" написана рівно один раз.
 *
 * Усе — в одній транзакції: якщо щось всередині впаде (наприклад, помилка констрейнта),
 * не повинно лишитись "наполовину доданої" книги без edition або без автора.
 */
export async function createWorkAndEditionFromDraft(
  db: SQLiteDatabase,
  draft: NormalizedBookDraft,
): Promise<CreateWorkAndEditionResult> {
  let result: CreateWorkAndEditionResult | null = null;

  await db.withTransactionAsync(async () => {
    const sourceId = await BookSourceRepository.create(db, draft.source);

    const work = await WorkRepository.create(db, {
      title: draft.title,
      originalTitle: draft.originalTitle ?? null,
      description: draft.description ?? null,
      originalLanguage: draft.originalLanguage ?? null,
      firstPublishedYear: draft.firstPublishedYear ?? null,
    });

    for (const authorName of draft.authors) {
      const author = await AuthorRepository.findOrCreateByName(db, authorName);
      await AuthorRepository.linkToWork(db, work.id, author.id);
    }

    if (draft.seriesName) {
      const series = await SeriesRepository.findOrCreateByName(db, draft.seriesName);
      await SeriesRepository.addEntry(db, {
        seriesId: series.id,
        workId: work.id,
        position: draft.seriesPosition ?? null,
      });
    }

    const publisherId = draft.publisher
      ? (await PublisherRepository.findOrCreateByName(db, draft.publisher)).id
      : null;

    const edition = await EditionRepository.create(db, {
      workId: work.id,
      title: draft.title,
      isbn10: draft.isbn10 ?? null,
      isbn13: draft.isbn13 ?? null,
      language: draft.language,
      publisherId,
      publicationYear: draft.publicationYear ?? null,
      pageCount: draft.pageCount ?? null,
      format: draft.format,
      coverUrl: draft.coverUrl ?? null,
      sourceId,
      sourceUrl: draft.source.sourceUrl ?? null,
    });

    for (const translatorName of draft.translators) {
      const translator = await TranslatorRepository.findOrCreateByName(db, translatorName);
      await TranslatorRepository.linkToEdition(db, edition.id, translator.id);
    }

    result = { workId: work.id, editionId: edition.id };
  });

  if (!result) {
    // withTransactionAsync завжди або виконує колбек до кінця, або кидає — це запобіжник
    // на випадок майбутньої зміни поведінки expo-sqlite, а не очікуваний шлях виконання.
    throw new Error('Транзакція створення книги завершилась без результату');
  }

  return result;
}

export const BookDraftRepository = { createWorkAndEditionFromDraft };
