import type { BookMetadataProvider } from './BookMetadataProvider';
import { GoogleBooksProvider } from './GoogleBooksProvider';
import { ISBNdbProvider } from './ISBNdbProvider';
import { SharedCatalogProvider } from './SharedCatalogProvider';
import { CuratedCatalogProvider } from './CuratedCatalogProvider';
import { ManualBookProvider } from './ManualBookProvider';

export type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';
export { GoogleBooksProvider } from './GoogleBooksProvider';
export { ISBNdbProvider } from './ISBNdbProvider';
export { SharedCatalogProvider, toRawBook as sharedCatalogRowToRawBook } from './SharedCatalogProvider';
export { CuratedCatalogProvider, recommendCuratedBooks } from './CuratedCatalogProvider';
export { ManualBookProvider } from './ManualBookProvider';
export { isLikelyUkrainianBook, filterUkrainianBooks, hasCyrillicTitle } from './ukrainianFilter';

/**
 * Реєстр усіх провайдерів (docs/BOOK_PROVIDERS.md) — увімкнених і вимкнених разом, щоб
 * майбутній екран "Джерела" міг показати повний список і чому кожен вимкнений увімкнено чи ні.
 * `ISBNdbProvider.isEnabled`/`SharedCatalogProvider.isEnabled` — динамічні (залежать від
 * наявності ключів у `.env`), решта — статичні. `SharedCatalogProvider` навмисно ПЕРШИЙ:
 * порядок цього масиву — порядок пошуку/показу за замовчуванням (docs/BOOK_PROVIDERS.md,
 * Milestone 8.2 — спільний каталог перевіряється до будь-якого зовнішнього платного джерела).
 *
 * Milestone 10 fix6 (`docs/STATUS_V1.md`, прохання власника продукту): Open Library та сім
 * заготовок під українські книгарні (Yakaboo/KSD/BookYe/BookUa/Ranok/NashFormat/BalkaBook)
 * прибрані звідси повністю — Open Library був активним джерелом пошуку, книгарні так і
 * лишались вимкненими заготовками з Milestone 7 (ніде не вмикались, жоден офіційний API не
 * з'явився) — свідоме рішення прибрати мертвий код замість тримати його "про всяк випадок".
 * Джерело `open_library` НЕ прибране з `BookSourceTypeSchema` (`src/types/bookDraft.ts`) —
 * книги, уже збережені раніше з цим джерелом (локально чи в спільному каталозі), мають лишатись
 * валідними записами назавжди, лише новий пошук ним більше не користується.
 *
 * `CuratedCatalogProvider` (Milestone 11, доповнення) — одразу після `SharedCatalogProvider`:
 * теж власний Supabase, теж дешевий і швидкий, без квоти — власна добірка книг заслуговує
 * на той самий пріоритет, що й раніше підтверджені результати спільного каталогу, і
 * однозначно вище будь-якого платного зовнішнього джерела.
 */
export const ALL_PROVIDERS: BookMetadataProvider[] = [
  SharedCatalogProvider,
  CuratedCatalogProvider,
  GoogleBooksProvider,
  ISBNdbProvider,
  ManualBookProvider,
];

export function getEnabledProviders(): BookMetadataProvider[] {
  return ALL_PROVIDERS.filter((provider) => provider.isEnabled);
}
