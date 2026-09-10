/**
 * "Як читалося?" — POLYTSIA V1.5, Фаза 9 (SESSION REFLECTION). Легкий, необов'язковий опис
 * reading experience ПІСЛЯ завершення сесії читання — ТЗ прямо застерігає: "Це опис reading
 * experience, НЕ mental-health tracking", тому значення й підписи навмисно про сам процес
 * читання (темп/залученість), а не про емоційний стан читача.
 *
 * НЕ те саме, що вже наявна "Настрій цього сеансу" (`ReactionChips`/`REACTION_META`,
 * `src/design/reactions.ts`, форма завершення сесії) — та реакція про ЗАПИС щоденника (7
 * довільних емоційних міток: смішно/сумно/шок/...), додається ДО збереження сесії й одразу
 * створює нотатку типу `'moment'` у щоденнику. Це поле — про сам СЕАНС читання, рівно 5
 * фіксованих значень із самого ТЗ, ставиться ПІСЛЯ того, як сесія вже безпечно збережена
 * (`app/session/[sessionId].tsx`), і зберігається прямо в `reading_session.reading_experience`
 * (Migration 010), а не як запис щоденника.
 *
 * Значення (ключі) стабільні рядки, не enum-індекси — та сама причина, що й `ReactionId`:
 * колонка лишається plain TEXT без CHECK, список тут можна розширити пізніше без нової міграції.
 */
export type ReadingExperienceId = 'easy' | 'engaging' | 'calm' | 'tense' | 'difficult';

export const READING_EXPERIENCE_LABELS: Record<ReadingExperienceId, string> = {
  easy: 'Легко',
  engaging: 'Захопливо',
  calm: 'Спокійно',
  tense: 'Напружено',
  difficult: 'Важко',
};

/** Порядок показу в рядку вибору — той самий, що й у самому ТЗ. */
export const READING_EXPERIENCE_ORDER: ReadingExperienceId[] = ['easy', 'engaging', 'calm', 'tense', 'difficult'];

/** `reading_experience` — вільний `TEXT` без CHECK у БД (докладніше вище) — те саме
 * захисне правило, що й `isReactionId`: нерозпізнане значення (майбутня версія застосунку
 * додала нове значення, якої ця версія ще не знає, чи просто пошкоджені дані) тихо
 * трактується як "без відповіді", а не крашить екран. */
export function isReadingExperienceId(value: string): value is ReadingExperienceId {
  return (READING_EXPERIENCE_ORDER as string[]).includes(value);
}
