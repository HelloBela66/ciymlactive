// `computeBookStats`'s `days` рахується через `differenceInCalendarDays` — а це, за задумом,
// календарні дні в ЛОКАЛЬНОМУ поясі пристрою (той самий пояс, у якому користувач і читав
// книгу), тож сама функція навмисно timezone-залежна. Тести нижче (час близько до півночі
// UTC, навмисно) потребують детермінованого TZ, інакше пройдуть в одному поясі й впадуть в
// іншому.
//
// РАНІШЕ тут стояло `process.env.TZ = 'UTC';` перед імпортом — здавалось надійним (Jest
// компілює `import` у `require()` в тій самій позиції файлу, не справжній ESM-хойстинг, тож
// порядок мав значення), але реальний прогін `npm test` виявив, що на Windows це НЕ
// спрацьовує: мутація `process.env.TZ` вже в запущеному процесі Node не гарантовано впливає
// на те, який часовий пояс бачать `Date`/`date-fns` (відоме обмеження, найпомітніше саме на
// Windows) — на GitHub Actions (Ubuntu, TZ і так UTC за замовчуванням) це мовчки "працювало"
// випадково, а не тому, що мутація дійсно діяла. Тепер TZ фіксується на рівні npm-скрипта
// (`package.json` → `"test": "cross-env TZ=UTC jest"`) — `cross-env` виставляє `TZ` в
// оточенні ДО того, як стартує сам процес Node/Jest (а не мутує вже запущений), тож
// однаково надійно працює на Windows/macOS/Linux/CI. Єдине джерело істини — не дублюємо тут.
import { computeBookStats } from './bookStats';
import type { ReadingSession } from '@/types/readingSession';

function session(overrides: Partial<ReadingSession> = {}): ReadingSession {
  return {
    id: 's1',
    userBookId: 'ub1',
    startedAt: '2026-09-01T10:00:00.000Z',
    endedAt: '2026-09-01T10:30:00.000Z',
    goalMinutes: null,
    pausedIntervals: [],
    startPage: 0,
    endPage: 30,
    durationSeconds: 1800,
    moodNote: null,
    isEdited: false,
    createdAt: '2026-09-01T10:30:00.000Z',
    updatedAt: '2026-09-01T10:30:00.000Z',
    ...overrides,
  };
}

describe('computeBookStats', () => {
  it('без сесій — нулі й невідомі сторінки/дні', () => {
    const stats = computeBookStats({
      sessions: undefined,
      pageCount: null,
      currentPage: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats).toEqual({
      totalSeconds: 0,
      sessionCount: 0,
      pagesRead: null,
      days: null,
      pagesPerHour: null,
      dateRange: null,
    });
  });

  it('сумує durationSeconds по всіх сесіях, ігноруючи null', () => {
    const stats = computeBookStats({
      sessions: [
        session({ durationSeconds: 1800 }),
        session({ id: 's2', durationSeconds: null }),
        session({ id: 's3', durationSeconds: 600 }),
      ],
      pageCount: null,
      currentPage: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats.totalSeconds).toBe(2400);
    expect(stats.sessionCount).toBe(3);
  });

  it('pagesRead бере pageCount, коли він є, навіть якщо currentPage інший', () => {
    const stats = computeBookStats({
      sessions: [],
      pageCount: 320,
      currentPage: 150,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats.pagesRead).toBe(320);
  });

  it('pagesRead падає назад на currentPage, коли pageCount невідомий', () => {
    const stats = computeBookStats({
      sessions: [],
      pageCount: null,
      currentPage: 150,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats.pagesRead).toBe(150);
  });

  it('days — null, коли startedAt або finishedAt невідомі (книга прочитана без старту сесії)', () => {
    const withoutStart = computeBookStats({
      sessions: [],
      pageCount: null,
      currentPage: null,
      startedAt: null,
      finishedAt: '2026-09-05T00:00:00.000Z',
    });
    const withoutFinish = computeBookStats({
      sessions: [],
      pageCount: null,
      currentPage: null,
      startedAt: '2026-09-01T00:00:00.000Z',
      finishedAt: null,
    });
    expect(withoutStart.days).toBeNull();
    expect(withoutFinish.days).toBeNull();
  });

  it('days — календарна відстань старт→фініш, включно з обома днями', () => {
    const stats = computeBookStats({
      sessions: [],
      pageCount: null,
      currentPage: null,
      startedAt: '2026-09-01T22:00:00.000Z',
      finishedAt: '2026-09-05T02:00:00.000Z',
    });
    // 1, 2, 3, 4, 5 вересня — 5 календарних днів, попри що минуло лише ~28 годин.
    expect(stats.days).toBe(5);
  });

  it('days — мінімум 1, коли старт і фініш у той самий календарний день', () => {
    const stats = computeBookStats({
      sessions: [],
      pageCount: null,
      currentPage: null,
      startedAt: '2026-09-01T09:00:00.000Z',
      finishedAt: '2026-09-01T21:00:00.000Z',
    });
    expect(stats.days).toBe(1);
  });

  it('days — рахується з діапазону сесій, а не із замороженого startedAt/finishedAt, коли сесії є (аудит M11, п.6.2: повторне прочитання)', () => {
    // Перший цикл читання: 1-5 вересня (те, що зафіксовано в user_book.started_at/finished_at
    // і більше НЕ змінюється при перечитуванні, `UserBookRepository.updateStatus`). Другий цикл
    // (перечитування) стався набагато пізніше, у грудні — його сесія теж передана в `sessions`.
    const stats = computeBookStats({
      sessions: [
        session({ startedAt: '2026-09-01T10:00:00.000Z', endedAt: '2026-09-05T02:00:00.000Z' }),
        session({ id: 's2', startedAt: '2026-12-10T10:00:00.000Z', endedAt: '2026-12-10T11:00:00.000Z' }),
      ],
      pageCount: null,
      currentPage: null,
      startedAt: '2026-09-01T10:00:00.000Z',
      finishedAt: '2026-09-05T02:00:00.000Z', // "заморожена" дата першого завершення
    });
    // Якби рахувалось від startedAt/finishedAt — вийшло б 5 (1-5 вересня), що суперечило б
    // сесії з грудня, яка теж включена в totalSeconds/sessionCount на цьому самому екрані.
    // Правильний результат — календарний діапазон від найранішої сесії до найпізнішої.
    expect(stats.days).toBe(101); // 1 вересня — 10 грудня, включно з обома днями
    expect(stats.sessionCount).toBe(2);
  });

  it('pagesPerHour — сторінки/годину РЕАЛЬНО пройдені за сесії (startPage/endPage), округлено до цілого — не залежить від pageCount', () => {
    const stats = computeBookStats({
      sessions: [session({ durationSeconds: 3600, startPage: 0, endPage: 60 })], // 60 стор. за 1 годину
      pageCount: 320, // довжина книги — навмисно ІНША за кількість пройдених сторінок сесії
      currentPage: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats.pagesPerHour).toBe(60);
  });

  it('pagesPerHour — null, коли жодна сесія не має зафіксованого прогресу сторінок або немає зафіксованого часу читання', () => {
    const withoutPageProgress = computeBookStats({
      // `endPage` дорівнює `startPage` — сесія існує (наприклад, одразу поставлена на паузу й
      // завершена без реального читання), але жодної сторінки фактично не пройдено.
      sessions: [session({ durationSeconds: 3600, startPage: 10, endPage: 10 })],
      pageCount: 320,
      currentPage: null,
      startedAt: null,
      finishedAt: null,
    });
    const withoutTime = computeBookStats({
      sessions: [],
      pageCount: 320,
      currentPage: null,
      startedAt: '2026-09-01T00:00:00.000Z',
      finishedAt: '2026-09-05T00:00:00.000Z',
    });
    expect(withoutPageProgress.pagesPerHour).toBeNull();
    expect(withoutTime.pagesPerHour).toBeNull();
  });

  it('pagesPerHour — НЕ занижується вдвічі на повторному прочитанні (реальна знахідка незалежного аудиту)', () => {
    // Перший цикл: 300 сторінок за 3 години (100 стор/год). Другий цикл (перечитування) —
    // ТОЙ САМИЙ темп, знову 300 сторінок за 3 години. Якби темп рахувався як
    // "довжина книги (полічена один раз) / сумарний час (полічений за обидва цикли)", вийшло
    // б удвічі занижене число (~50 стор/год) — хоча користувач читав з однаковою швидкістю
    // обидва рази.
    const stats = computeBookStats({
      sessions: [
        session({ id: 's1', durationSeconds: 10800, startPage: 0, endPage: 300 }),
        session({ id: 's2', durationSeconds: 10800, startPage: 0, endPage: 300 }),
      ],
      pageCount: 300,
      currentPage: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats.pagesPerHour).toBe(100);
  });

  it('dateRange — той самий діапазон, з якого рахується days (з сесій, коли вони є)', () => {
    const stats = computeBookStats({
      sessions: [
        session({ startedAt: '2026-09-01T10:00:00.000Z', endedAt: '2026-09-05T02:00:00.000Z' }),
        session({ id: 's2', startedAt: '2026-12-10T10:00:00.000Z', endedAt: '2026-12-10T11:00:00.000Z' }),
      ],
      pageCount: null,
      currentPage: null,
      startedAt: '2026-09-01T10:00:00.000Z',
      finishedAt: '2026-09-05T02:00:00.000Z',
    });
    expect(stats.dateRange).toEqual({ startIso: '2026-09-01T10:00:00.000Z', endIso: '2026-12-10T11:00:00.000Z' });
  });

  it('dateRange — null, коли немає ані сесій, ані обох дат', () => {
    const stats = computeBookStats({
      sessions: [],
      pageCount: null,
      currentPage: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(stats.dateRange).toBeNull();
  });
});
