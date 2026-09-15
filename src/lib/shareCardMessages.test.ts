import {
  EMPTY_SHARE_CARD_FEEDBACK,
  SAVE_CARD_FAILED_FEEDBACK,
  SHARE_CARD_FAILED_FEEDBACK,
  describeSaveOutcome,
  describeShareOutcome,
} from './shareCardMessages';

/**
 * POLYTSIA V1.7, Phase 5 — тести текстової частини share-інфраструктури (ТЗ §13/§98).
 *
 * До консолідації ці переходи існували ТРИЧІ, всередині `onSuccess` трьох екранів — тобто
 * покривались лише очима. Винесення їх у чисту функцію (без імпортів Expo) робить їх
 * перевірюваними: головне, що тут доводиться — «дозвіл заблоковано назавжди» дає ІНШИЙ текст і
 * вмикає кнопку налаштувань, а «дозвіл не дали цього разу» — ні.
 */

describe('describeShareOutcome', () => {
  it('успішний показ системного діалогу нічого не дописує', () => {
    expect(describeShareOutcome(true)).toEqual(EMPTY_SHARE_CARD_FEEDBACK);
  });

  it('відсутність системного «Поділитися» — нейтральний статус, не помилка дозволу', () => {
    const feedback = describeShareOutcome(false);
    expect(feedback.statusMessage).toBe('Системне "Поділитися" тут недоступне.');
    expect(feedback.permissionError).toBeNull();
    expect(feedback.permissionBlocked).toBe(false);
  });
});

describe('describeSaveOutcome', () => {
  it('збережено — нейтральний статус без помилки', () => {
    const feedback = describeSaveOutcome({ kind: 'saved' });
    expect(feedback.statusMessage).toBe('Картку збережено в галерею.');
    expect(feedback.permissionError).toBeNull();
    expect(feedback.permissionBlocked).toBe(false);
  });

  it('дозвіл не дали, але спитати можна — коротка помилка, без кнопки налаштувань', () => {
    const feedback = describeSaveOutcome({ kind: 'permission_denied', canAskAgain: true });
    expect(feedback.permissionError).toBe('Немає дозволу зберегти в галерею.');
    expect(feedback.permissionBlocked).toBe(false);
    expect(feedback.statusMessage).toBeNull();
  });

  it('дозвіл заблоковано назавжди — інший текст І кнопка налаштувань', () => {
    const feedback = describeSaveOutcome({ kind: 'permission_denied', canAskAgain: false });
    expect(feedback.permissionBlocked).toBe(true);
    expect(feedback.permissionError).toContain('налаштуваннях пристрою');
    expect(feedback.permissionError).not.toBe(
      describeSaveOutcome({ kind: 'permission_denied', canAskAgain: true }).permissionError,
    );
  });
});

describe('константи станів', () => {
  it('порожній стан не показує нічого', () => {
    expect(EMPTY_SHARE_CARD_FEEDBACK).toEqual({
      statusMessage: null,
      permissionError: null,
      permissionBlocked: false,
    });
  });

  it('обидві помилки — нейтральний статус, а не червона помилка дозволу', () => {
    for (const feedback of [SHARE_CARD_FAILED_FEEDBACK, SAVE_CARD_FAILED_FEEDBACK]) {
      expect(feedback.statusMessage).not.toBeNull();
      expect(feedback.permissionError).toBeNull();
      expect(feedback.permissionBlocked).toBe(false);
    }
  });

  it('повідомлення про невдале поділення й невдале збереження — різні', () => {
    expect(SHARE_CARD_FAILED_FEEDBACK.statusMessage).not.toBe(
      SAVE_CARD_FAILED_FEEDBACK.statusMessage,
    );
  });
});
