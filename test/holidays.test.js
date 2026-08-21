import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayName, isHoliday, suggestType } from '../js/holidays.js';

test('holidayName - sabit tatil', () => {
  assert.equal(holidayName('2026-10-29'), 'Cumhuriyet Bayramı');
  assert.equal(holidayName('2026-01-01'), 'Yılbaşı');
});

test('holidayName - tatil olmayan gün null döner', () => {
  assert.equal(holidayName('2026-08-14'), null);
});

test('isHoliday - dini bayram tablo yılı içinde', () => {
  assert.equal(isHoliday('2026-03-20'), true); // Ramazan Bayramı 1. gün
});

test('isHoliday - tablo dışı yıl (2035) için uydurma tatil döndürmez', () => {
  assert.equal(isHoliday('2035-03-20'), false);
});

test('suggestType - pazar günü hafta tatili önerir', () => {
  const date = new Date(2026, 7, 16); // 16 Ağustos 2026 Pazar
  const result = suggestType(date, '2026-08-16', { weekendDays: [0] });
  assert.equal(result.type, 'weekend');
});

test('suggestType - resmi tatil önceliklidir', () => {
  const date = new Date(2026, 9, 29); // 29 Ekim 2026 Perşembe
  const result = suggestType(date, '2026-10-29', { weekendDays: [0] });
  assert.equal(result.type, 'holiday');
});

test('suggestType - hafta içi normal önerir', () => {
  const date = new Date(2026, 7, 14); // 14 Ağustos 2026 Cuma
  const result = suggestType(date, '2026-08-14', { weekendDays: [0] });
  assert.equal(result.type, 'normal');
});
