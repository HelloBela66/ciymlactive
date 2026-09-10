import { resolveLastSuccessfulExportAt } from './backupHealth';

describe('resolveLastSuccessfulExportAt', () => {
  it('повертає null, коли жодного успішного бекапу ще не було', () => {
    expect(resolveLastSuccessfulExportAt(null, null)).toBeNull();
  });

  it('повертає єдине відоме значення, коли відоме лише одне джерело', () => {
    expect(resolveLastSuccessfulExportAt('2026-09-01T10:00:00.000Z', null)).toBe('2026-09-01T10:00:00.000Z');
    expect(resolveLastSuccessfulExportAt(null, '2026-09-01T10:00:00.000Z')).toBe('2026-09-01T10:00:00.000Z');
  });

  it('повертає пізніше з двох значень, коли відомі обидва', () => {
    expect(resolveLastSuccessfulExportAt('2026-09-01T10:00:00.000Z', '2026-09-05T10:00:00.000Z')).toBe(
      '2026-09-05T10:00:00.000Z',
    );
    expect(resolveLastSuccessfulExportAt('2026-09-05T10:00:00.000Z', '2026-09-01T10:00:00.000Z')).toBe(
      '2026-09-05T10:00:00.000Z',
    );
  });
});
