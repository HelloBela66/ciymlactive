/**
 * Надійний, платформо-незалежний спосіб відрізнити "запит скасовано навмисно" (React Query
 * перервав застарілий запит — новий символ під час набору тексту в пошуку, докладніше —
 * `useProviderSearch.ts`) від справжньої мережевої помилки.
 *
 * Реальна знахідка з пристрою (Expo Go, iOS): стандартна веб-перевірка
 * `error.name === 'AbortError'` тут НЕ спрацьовує. Замість очікуваного DOMException з ім'ям
 * `AbortError` нативний fetch кидає `TypeError: fetch failed`, причина —
 * `FetchRequestCanceledException: Fetch request has been canceled (at Expo/NativeResponse.swift:63)`
 * — Expo/React Native fetch-полішим на iOS загортає скасування у власний тип помилки. Через
 * це `sharedCatalogClient.ts`/`curatedCatalogClient.ts`/`GoogleBooksProvider.ts` логували
 * звичайне скасування пошукового запиту (нове натискання клавіші під час дебаунсу) як "помилка
 * запиту" (WARN) — не збій, а сплутане навмисне скасування.
 *
 * `signal.aborted` — єдиний надійний сигнал: веб-стандарт гарантує його синхронно `true`
 * одразу після виклику `controller.abort()`, незалежно від того, як саме конкретна
 * fetch-реалізація це репортує в об'єкті помилки. `error.name === 'AbortError'` лишається
 * другим, страхувальним критерієм — на випадок скасування без переданого `signal`
 * (теоретичний край, коли викликач не прокинув сигнал узагалі).
 *
 * Навмисно НЕ використовується в `isbndbProxyClient.ts`: той файл розрізняє ДВА різних
 * abort'и (зовнішній `signal` від React Query і внутрішній client-side timeout, обидва через
 * один спільний `AbortController`) — там правильна перевірка лише `signal?.aborted` САМА ПО
 * СОБІ, без OR з іменем помилки (інакше внутрішній timeout на платформах, де ім'я AbortError
 * надійне, хибно трактувався б як зовнішнє скасування).
 */
export function isFetchAborted(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}
