import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayName, isHoliday, suggestType, holidayListForYear, nextHoliday } from '../js/holidays.js';

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

test('holidayListForYear - 2026 tüm yıl sıralı liste (7 sabit + 9 dini)', () => {
  const list = holidayListForYear(2026);
  assert.equal(list.length, 16);
  assert.equal(list[0].date, '2026-01-01');
  assert.equal(list[0].name, 'Yılbaşı');
  assert.ok(list.some((h) => h.date === '2026-10-29' && h.name === 'Cumhuriyet Bayramı'));
  // sıralı mı
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].date < list[i].date);
});

test('nextHoliday - bugünden sonraki ilk tatil (Zafer Bayramı)', () => {
  const h = nextHoliday('2026-08-21');
  assert.equal(h.date, '2026-08-30');
  assert.equal(h.name, 'Zafer Bayramı');
  assert.equal(h.daysLeft, 9);
});

test('nextHoliday - bugün tatilse bugün sayılmaz, sıradaki gösterilir', () => {
  const h = nextHoliday('2026-08-30');
  assert.equal(h.date, '2026-10-29');
  assert.equal(h.daysLeft, 60);
});

test('nextHoliday - yıl tükendiyse gelecek yılın ilki', () => {
  const h = nextHoliday('2026-12-31');
  assert.equal(h.date, '2027-01-01');
  assert.equal(h.name, 'Yılbaşı');
  assert.equal(h.daysLeft, 1);
});
