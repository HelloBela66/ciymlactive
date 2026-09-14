'use strict';

const { parseCsv, parseCsvWithHeader, buildColumnGetter } = require('./csv');

describe('parseCsv', () => {
  it('проста таблиця без лапок', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('лапки з комою всередині поля (ТЗ §56, "quoted comma")', () => {
    expect(parseCsv('id,title\nbook-1,"Назва, з комою"\n')).toEqual([
      ['id', 'title'],
      ['book-1', 'Назва, з комою'],
    ]);
  });

  it('екранована лапка подвоєнням (ТЗ §56, "escaped quote")', () => {
    expect(parseCsv('id,title\nbook-1,"Він сказав ""привіт"""\n')).toEqual([
      ['id', 'title'],
      ['book-1', 'Він сказав "привіт"'],
    ]);
  });

  it('український апостроф не потребує екранування (звичайний символ, не лапка)', () => {
    expect(parseCsv("id,title\nbook-1,Мар'яна\n")).toEqual([
      ['id', 'title'],
      ['book-1', "Мар'яна"],
    ]);
  });

  it('semicolon-список всередині CSV-клітинки лишається одним полем (розбір ; — відповідальність вищого рівня)', () => {
    expect(parseCsv('id,genres\nbook-1,Фентезі;Романтика\n')).toEqual([
      ['id', 'genres'],
      ['book-1', 'Фентезі;Романтика'],
    ]);
  });

  it('порожнє опціональне поле — просто порожній рядок між комами (ТЗ §5, data/README.md)', () => {
    expect(parseCsv('id,isbn10,title\nbook-1,,Назва\n')).toEqual([
      ['id', 'isbn10', 'title'],
      ['book-1', '', 'Назва'],
    ]);
  });

  it('переніс рядка всередині лапок (багаторядковий опис) лишається ОДНИМ полем', () => {
    expect(parseCsv('id,description\nbook-1,"Перший рядок.\nДругий рядок."\n')).toEqual([
      ['id', 'description'],
      ['book-1', 'Перший рядок.\nДругий рядок.'],
    ]);
  });

  it('BOM на початку файлу знімається (ТЗ §5, UTF-8 BOM)', () => {
    const withBom = '﻿id,title\nbook-1,Назва\n';
    expect(parseCsv(withBom)).toEqual([
      ['id', 'title'],
      ['book-1', 'Назва'],
    ]);
  });

  it('українська кирилиця (UTF-8) проходить без спотворень', () => {
    expect(parseCsv('id,title\nkobzar,Кобзар\n')).toEqual([
      ['id', 'title'],
      ['kobzar', 'Кобзар'],
    ]);
  });

  it('дуже довгий опис (тисячі символів) парситься без обрізання', () => {
    const longText = 'а'.repeat(4800);
    expect(parseCsv(`id,description\nbook-1,"${longText}"\n`)).toEqual([
      ['id', 'description'],
      ['book-1', longText],
    ]);
  });

  it('файл без завершального переносу рядка в кінці — останній рядок усе одно включено', () => {
    expect(parseCsv('id,title\nbook-1,Назва')).toEqual([
      ['id', 'title'],
      ['book-1', 'Назва'],
    ]);
  });

  it('порожній рядок файлу — порожній масив', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseCsvWithHeader', () => {
  it('перший рядок стає header, решта — data rows', () => {
    const result = parseCsvWithHeader('id,title\nbook-1,Назва 1\nbook-2,Назва 2\n');
    expect(result.header).toEqual(['id', 'title']);
    expect(result.rows).toEqual([
      ['book-1', 'Назва 1'],
      ['book-2', 'Назва 2'],
    ]);
  });

  it('порожній файл — null (виклик сам вирішує, чи це помилка)', () => {
    expect(parseCsvWithHeader('')).toBeNull();
  });

  it('лише header без жодного рядка даних — валідний результат з порожнім rows', () => {
    const result = parseCsvWithHeader('id,title\n');
    expect(result.header).toEqual(['id', 'title']);
    expect(result.rows).toEqual([]);
  });
});

describe('buildColumnGetter', () => {
  it('дістає клітинку за назвою колонки незалежно від порядку', () => {
    const get = buildColumnGetter(['title', 'id']);
    expect(get(['Назва', 'book-1'], 'id')).toBe('book-1');
    expect(get(['Назва', 'book-1'], 'title')).toBe('Назва');
  });

  it('відсутня колонка — порожній рядок, не виняток', () => {
    const get = buildColumnGetter(['id']);
    expect(get(['book-1'], 'isbn13')).toBe('');
  });

  it('trim пробілів навколо значення', () => {
    const get = buildColumnGetter(['title']);
    expect(get(['  Назва  '], 'title')).toBe('Назва');
  });
});
