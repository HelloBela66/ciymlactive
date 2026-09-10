import { create } from 'zustand';
import type { RawProviderBook } from '@/data/providers';

interface PendingImport {
  providerId: string;
  book: RawProviderBook;
}

interface ImportDraftState {
  pending: PendingImport | null;
  setPending: (providerId: string, book: RawProviderBook) => void;
  clear: () => void;
}

/**
 * Перший реальний Zustand-стан у проєкті (див. `src/stores/README.md` — саме для цього він і
 * зарезервований: UI-стан, що переживає навігацію в межах сесії, не доменні дані). Тримає
 * обраний користувачем "сирий" результат пошуку від старту (`app/(tabs)/search.tsx` чи
 * `app/isbn-scan.tsx`) до екрана підтвердження (`app/import/review.tsx`) — простіше й
 * надійніше, ніж серіалізувати весь об'єкт (включно з описом книги) у рядкові route params.
 */
export const useImportDraftStore = create<ImportDraftState>()((set) => ({
  pending: null,
  setPending: (providerId, book) => set({ pending: { providerId, book } }),
  clear: () => set({ pending: null }),
}));
