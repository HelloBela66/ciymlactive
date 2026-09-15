/**
 * POLYTSIA FOUNDATION FINAL POLISH — Search Provider Error Transparency.
 *
 * До цієї фази кожен мережевий клієнт пошукового провайдера (`googleBooksProxyClient.ts`,
 * `isbndbProxyClient.ts`, і прямий fallback-шлях у `GoogleBooksProvider.ts`) на БУДЬ-ЯКУ
 * помилку — 429, 5xx, network failure, timeout, malformed response — тихо повертав порожній
 * масив, той самий результат, що й для "провайдер відповів: нічого не знайдено". UI не міг
 * відрізнити "цієї книги немає" від "зовнішнє джерело зараз не відповідає" (аудит
 * `POST_V1_6_2_FINAL_AUDIT_REPORT.md`, розділ 21).
 *
 * Цей файл — єдине спільне місце класифікації такої помилки, щоб `googleBooksProxyClient.ts`,
 * `isbndbProxyClient.ts` і прямий fallback Google Books використовували ОДНУ й ту саму
 * термінологію (`BookMetadataProvider.searchBooks` спирається саме на неї).
 *
 * НЕ зачіпає own/shared catalog (`SharedCatalogProvider`/`CuratedCatalogProvider`) — ці два
 * джерела навмисно лишаються поза цією класифікацією (власна, швидка, довірена
 * Supabase-інфраструктура, а не платне/безкоштовне зовнішнє API; `curated`/`shared catalog`
 * ingestion і власна error-обробка їхніх клієнтів — поза межами цього polish pass).
 */

/** Мінімальний, НЕ технічний набір — саме стільки, скільки реально можна показати користувачу
 * (§16 ТЗ FOUNDATION FINAL POLISH): жодного stack trace чи сирого HTTP-статусу в UI. */
export type ProviderSearchErrorKind =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'server'
  | 'invalid_response'
  | 'unknown';

export interface ProviderSearchError {
  kind: ProviderSearchErrorKind;
}

/**
 * Дискримінована відповідь провайдера — головний інваріант цього фіксу: "success + 0 книг"
 * (`{ status: 'success', items: [] }`) і "провайдер не відповів" (`{ status: 'error', error }`)
 * — це ДВА РІЗНІ стани, ніколи не змішуються в один "порожній масив".
 */
export type ProviderSearchOutcome<T> =
  | { status: 'success'; items: T[] }
  | { status: 'error'; error: ProviderSearchError };

/** HTTP-статус → категорія (§16 ТЗ): 429 → rate_limited, 5xx → server, решта не-OK → unknown
 * (2xx завжди обробляється окремо, до виклику цієї функції — сюди доходять лише не-OK статуси). */
export function classifyHttpStatus(status: number): ProviderSearchErrorKind {
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status <= 599) return 'server';
  return 'unknown';
}

/** Не технічний, книжковий тон (§19 ТЗ: "UI має залишатися спокійним і книжковим") — без
 * HTTP-кодів чи стек-трейсів. `providerName` — `BookMetadataProvider.displayName`. */
export function describeProviderSearchError(kind: ProviderSearchErrorKind, providerName: string): string {
  switch (kind) {
    case 'rate_limited':
      return `${providerName}: забагато запитів зараз. Спробуй за хвилину.`;
    case 'timeout':
      return `${providerName} не відповів вчасно.`;
    case 'network':
      return `Немає з'єднання з ${providerName}.`;
    case 'server':
    case 'invalid_response':
    case 'unknown':
    default:
      return `${providerName} зараз недоступний.`;
  }
}
