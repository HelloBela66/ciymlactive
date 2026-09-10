import { computeProgressPercent } from './progressPercent';
import type { JournalEntry } from '@/types/journalEntry';

/**
 * ТЗ Фази 10 (JOURNAL MEMORY TIMELINE) дослівно вимагає рівно 4 візуальні категорії маркерів:
 * "thought; quote; moment; favorite" — не 1:1 з `NoteType` (там ще `question`/`theory`/
 * `general`) і не взаємовиключні з ним (`isFavorite` — прапорець, що співіснує з будь-яким
 * типом). Рішення (задокументоване тут, а не мовчки застосоване): категорія обирається за
 * пріоритетом — `favorite` (якщо хоч один запис у "кошику" позначено обраним) переважає
 * `quote` (kind === 'quote'), що переважає `moment` (note.type === 'moment'), а решта типів
 * нотатки (`thought`/`question`/`theory`/`general`, не обрані) падають у нейтральний кошик
 * `thought` — жоден запис НЕ губиться зі шкали через те, що його точний тип не входить у
 * список ТЗ, а сам список ТЗ лишається буквально дотриманим для кольору/іконки маркера.
 */
export type TimelineMarkerCategory = 'favorite' | 'quote' | 'moment' | 'thought';

/**
 * Один маркер на шкалі — це "кошик" з одним чи кількома записами, згрупованими за близькістю
 * прогресу (докладніше — `computeJournalTimelineMarkers`). `percent` — позиція кошика на
 * шкалі (кратна `bucketPercent`), не позиція жодного конкретного запису.
 */
export interface TimelineMarker {
  percent: number;
  category: TimelineMarkerCategory;
  entries: JournalEntry[];
}

/** ~50 можливих позицій на всю ширину шкали (100 / 2) — достатньо дрібно, щоб не зливати
 * записи з реально різних частин книги в один маркер, і достатньо грубо, щоб працювати як
 * простий "cluster" для випадку "багато записів поруч" (ТЗ: "При великій кількості entries:
 * cluster; або показуй markers без text" — тут навмисно ОБИДВА: бакетизація як cluster, і
 * маркери на самій шкалі взагалі без тексту, підпис лише у preview після тапу). */
const DEFAULT_BUCKET_PERCENT = 2;

/** Позиція одного запису на шкалі 0-100% (п.10 ТЗ): `progressPercent`, якщо він є (уже
 * порахований і збережений при створенні запису, `computeProgressPercent`, композер), інакше
 * фолбек на `page`/`pageCount` книги. Запис БЕЗ жодного з двох (немає сторінки, і в книги
 * невідомий `pageCount`) не має де стати на шкалі — `null`, і `computeJournalTimelineMarkers`
 * просто пропускає такий запис: він і далі видимий у звичайному списку щоденника (ТЗ: "Timeline
 * є supplementary visualization. Основний journal list залишається."), тиха деградація, а не
 * помилка чи "0%" за замовчуванням, що спотворило б шкалу. */
function entryPercent(entry: JournalEntry, pageCount: number | null): number | null {
  const raw = entry.progressPercent ?? computeProgressPercent(entry.page, pageCount);
  if (raw == null) return null;
  // Захисне обрізання — `progressPercent` у БД не CHECK-обмежений (докладніше `NoteRepository`/
  // `QuoteRepository`), теоретично може містити значення поза [0,100] зі старих/ручних даних.
  return Math.max(0, Math.min(100, raw));
}

function categoryFor(entries: JournalEntry[]): TimelineMarkerCategory {
  if (entries.some((entry) => entry.isFavorite)) return 'favorite';
  if (entries.some((entry) => entry.kind === 'quote')) return 'quote';
  if (entries.some((entry) => entry.type === 'moment')) return 'moment';
  return 'thought';
}

/**
 * Групує записи щоденника книги в маркери шкали (Book Memory screen, `app/memory/[workId].tsx`).
 * Записи без визначеної позиції (`entryPercent` → `null`) пропускаються. Записи в межах одного
 * `bucketPercent`-кроку (за замовчуванням 2%) зливаються в один маркер — простий, детермінований
 * "cluster" без потреби вимірювати реальну ширину екрана в пікселях (сам маркер рендериться
 * через відсоткове `left`, `JournalTimeline.tsx`). Результат відсортований за `percent`.
 */
export function computeJournalTimelineMarkers(
  entries: JournalEntry[],
  pageCount: number | null,
  bucketPercent: number = DEFAULT_BUCKET_PERCENT,
): TimelineMarker[] {
  const buckets = new Map<number, JournalEntry[]>();

  for (const entry of entries) {
    const percent = entryPercent(entry, pageCount);
    if (percent == null) continue;
    const bucketKey = Math.round(percent / bucketPercent) * bucketPercent;
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(entry);
    else buckets.set(bucketKey, [entry]);
  }

  return Array.from(buckets.entries())
    .map(([percent, bucketEntries]) => ({
      percent,
      category: categoryFor(bucketEntries),
      // Стабільний порядок усередині кошика для preview-модалки: за сторінкою (записи без
      // сторінки — в кінець), тай-брейкер `createdAt`, той самий підхід, що й keyset-курсор
      // глобальної стрічки (`JournalEntryCursor`).
      entries: [...bucketEntries].sort(
        (a, b) => (a.page ?? Infinity) - (b.page ?? Infinity) || a.createdAt.localeCompare(b.createdAt),
      ),
    }))
    .sort((a, b) => a.percent - b.percent);
}
