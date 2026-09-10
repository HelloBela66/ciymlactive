/**
 * `page` → відсоток прогресу книги (0-100, з точністю 0.1%). Той самий null-safe підхід, що
 * й `tbrEstimate.ts`/`finishPrediction.ts` — `pageCount` часто відсутній (видання без даних
 * від провайдера), тож функція просто повертає `null`, а не ділить на нуль/undefined.
 *
 * Використовується композером швидкого запису щоденника (Milestone 11, Фаза 3) — щоб
 * `note.progress_percent`/`quote.progress_percent` заповнювались автоматично зі сторінки,
 * яку користувач і так вводить, без окремого поля "скільки відсотків".
 */
export function computeProgressPercent(
  page: number | null | undefined,
  pageCount: number | null | undefined,
): number | null {
  if (page == null || pageCount == null || pageCount <= 0) return null;
  const clamped = Math.max(0, Math.min(page, pageCount));
  return Math.round((clamped / pageCount) * 1000) / 10;
}
