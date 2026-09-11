/**
 * Глобальний setup для Jest (`setupFilesAfterEnv`, jest.config.js).
 *
 * Причина: `src/lib/logger.ts` пише кожну міграцію БД через `console.info`/`console.debug`
 * (`[db/migrations] Застосовую міграцію { version: N }` × 11 + підсумковий рядок), а
 * `openTestDatabase()` + `migrateDbIfNeeded()` викликає практично КОЖЕН repository/lib-тест,
 * що seed-ить БД (десятки test-suite'ів). Це робить повний вивід `npm test` занадто довгим,
 * щоб скопіювати цілком — тому info/debug тут глушаться глобально для ВСІХ тестів.
 *
 * `console.warn`/`console.error` навмисно НЕ чіпаються: реальна проблема (попередження,
 * падіння) має лишатись видимою у виводі тестів.
 */
console.info = () => {};
console.debug = () => {};
