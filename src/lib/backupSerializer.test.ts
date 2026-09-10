import {
  serializeBackup,
  parseBackupJson,
  checkSchemaCompatibility,
  MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION,
  type BackupData,
} from './backupSerializer';

const SAMPLE_DATA: BackupData = {
  author: [{ id: 'a1', name: 'Автор', created_at: '2026-01-01T00:00:00.000Z' }],
  work: [{ id: 'w1', title: 'Назва', deleted_at: null }],
  reading_session: [],
};

describe('serializeBackup / parseBackupJson round-trip', () => {
  it('серіалізує й розпарсює той самий data назад без втрат', () => {
    const json = serializeBackup({
      schemaVersion: 1,
      appVersion: '0.1.0',
      data: SAMPLE_DATA,
      exportedAt: '2026-09-07T12:00:00.000Z',
    });
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.data).toEqual(SAMPLE_DATA);
    expect(result.envelope.schemaVersion).toBe(1);
    expect(result.envelope.app).toBe('polytsya');
    expect(result.envelope.exportedAt).toBe('2026-09-07T12:00:00.000Z');
  });

  it('відхиляє зіпсований JSON', () => {
    const result = parseBackupJson('{not valid json');
    expect(result.ok).toBe(false);
  });

  it('відхиляє валідний JSON іншої форми (не бекап)', () => {
    const result = parseBackupJson(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
  });

  it('відхиляє бекап іншого застосунку', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-07T12:00:00.000Z',
      app: 'some-other-app',
      appVersion: '1.0.0',
      data: {},
    });
    const result = parseBackupJson(json);
    expect(result.ok).toBe(false);
  });
});

describe('checkSchemaCompatibility', () => {
  it('однакові версії — ok', () => {
    expect(checkSchemaCompatibility(1, 1)).toBe('ok');
  });

  it('файл новіший за застосунок — needs_app_update', () => {
    expect(checkSchemaCompatibility(2, 1)).toBe('needs_app_update');
  });

  it('файл старіший за застосунок, але в межах сумісності (адитивна міграція) — ok', () => {
    // Реальний випадок: Migration 002 (додала 'isbndb' до CHECK) підняла поточну версію
    // схеми до 2, але залишила старі бекапи (версія 1) повністю відновлюваними — суто
    // адитивна зміна, не ламає нічого з того, що вже могло бути в старому файлі.
    expect(checkSchemaCompatibility(1, 2)).toBe('ok');
  });

  it('файл старіший за мінімально сумісну версію — needs_data_migration', () => {
    expect(checkSchemaCompatibility(MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION - 1, 2)).toBe('needs_data_migration');
  });
});
