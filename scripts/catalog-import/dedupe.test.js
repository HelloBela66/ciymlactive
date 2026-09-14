'use strict';

const { detectDuplicates } = require('./dedupe');

/** Хелпер — мінімальний "normalized"-об'єкт з потрібними для dedupe.js полями (id/isbn13/isbn10),
 * решта полів normalizeRecord() тут не важлива — detectDuplicates їх не читає. */
function entry(rowNumber, id, isbn13, isbn10) {
  return { rowNumber, normalized: { id, isbn13: isbn13 ?? null, isbn10: isbn10 ?? null } };
}

describe('detectDuplicates', () => {
  it('без конфліктів — усі рядки йдуть у toImport у вихідному порядку, без попереджень/винятків', () => {
    const entries = [entry(2, 'book-a', '9780306406157', null), entry(3, 'book-b', null, '0-306-40615-2' && '0306406152')];
    const result = detectDuplicates(entries);
    expect(result.toImport.map((e) => e.normalized.id)).toEqual(['book-a', 'book-b']);
    expect(result.excluded).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('той самий id двічі у файлі — DUPLICATE_ID_IN_FILE попередження, останній рядок перемагає (звичайний upsert-порядок)', () => {
    const entries = [entry(2, 'book-a', '9780306406157', null), entry(5, 'book-a', '9789660395008', null)];
    const result = detectDuplicates(entries);
    expect(result.warnings).toEqual([{ rowNumber: 5, id: 'book-a', code: 'DUPLICATE_ID_IN_FILE' }]);
    expect(result.toImport).toHaveLength(1);
    expect(result.toImport[0].rowNumber).toBe(5);
    expect(result.toImport[0].normalized.isbn13).toBe('9789660395008');
    expect(result.excluded).toEqual([]);
  });

  it('різні id, той самий isbn13 — другий рядок виключається з DUPLICATE_ISBN (реальний кейс: kuznietsova-drabyna/kuznietsova-e-book-drabyna, той самий ISBN 9789664480977)', () => {
    const entries = [
      entry(10, 'kuznietsova-drabyna', '9789664480977', null),
      entry(11, 'kuznietsova-e-book-drabyna', '9789664480977', null),
    ];
    const result = detectDuplicates(entries);
    expect(result.toImport.map((e) => e.normalized.id)).toEqual(['kuznietsova-drabyna']);
    expect(result.excluded).toEqual([{ rowNumber: 11, id: 'kuznietsova-e-book-drabyna', code: 'DUPLICATE_ISBN', field: 'isbn13' }]);
  });

  it('різні id, той самий isbn10 — другий рядок виключається з DUPLICATE_ISBN (field: isbn10)', () => {
    const entries = [entry(4, 'book-a', null, '0306406152'), entry(7, 'book-b', null, '0306406152')];
    const result = detectDuplicates(entries);
    expect(result.toImport.map((e) => e.normalized.id)).toEqual(['book-a']);
    expect(result.excluded).toEqual([{ rowNumber: 7, id: 'book-b', code: 'DUPLICATE_ISBN', field: 'isbn10' }]);
  });

  it('порожні isbn13/isbn10 (null) ніколи не конфліктують одне з одним', () => {
    const entries = [entry(1, 'book-a', null, null), entry(2, 'book-b', null, null), entry(3, 'book-c', null, null)];
    const result = detectDuplicates(entries);
    expect(result.toImport).toHaveLength(3);
    expect(result.excluded).toEqual([]);
  });

  it('виключений через DUPLICATE_ISBN рядок не потрапляє у toImport, але решта файлу після нього — так (invalid row не валить увесь імпорт)', () => {
    const entries = [
      entry(1, 'book-a', '9780306406157', null),
      entry(2, 'book-b', '9780306406157', null), // конфлікт із book-a
      entry(3, 'book-c', '9789660395008', null),
    ];
    const result = detectDuplicates(entries);
    expect(result.toImport.map((e) => e.normalized.id)).toEqual(['book-a', 'book-c']);
    expect(result.excluded.map((e) => e.id)).toEqual(['book-b']);
  });
});
