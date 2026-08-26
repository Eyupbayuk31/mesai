import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayName, isHoliday, isHolidayEve, isOffDay, suggestType, holidayListForYear, nextHoliday } from '../js/holidays.js';

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

// --- Bayram arifesi -----------------------------------------------------
test('isHolidayEve - yalnız arife günleri', () => {
  assert.equal(isHolidayEve('2026-05-26'), true, 'Kurban arifesi');
  assert.equal(isHolidayEve('2026-03-19'), true, 'Ramazan arifesi');
  assert.equal(isHolidayEve('2026-05-27'), false, 'bayramın 1. günü arife değil');
  assert.equal(isHolidayEve('2026-05-19'), false, 'sabit tatil arife değil');
  assert.equal(isHolidayEve('2026-08-14'), false, 'tatil bile değil');
});

test('isOffDay - arife ayara göre iş günü olur', () => {
  const kapali = { halfDayEves: false };
  const acik = { halfDayEves: true };

  // Arife: ayar açıkken çalışma günü
  assert.equal(isOffDay('2026-05-26', kapali), true);
  assert.equal(isOffDay('2026-05-26', acik), false);

  // Bayramın kendisi her iki durumda da tatil
  assert.equal(isOffDay('2026-05-27', kapali), true);
  assert.equal(isOffDay('2026-05-27', acik), true);

  // Sabit tatil ayardan etkilenmez
  assert.equal(isOffDay('2026-05-19', acik), true);
  // Normal gün hiçbir durumda tatil değil
  assert.equal(isOffDay('2026-08-14', acik), false);
  assert.equal(isOffDay('2026-08-14', undefined), false, 'ayar verilmese de çalışır');
});

test('holidayListForYear - arife eve bayrağıyla döner', () => {
  const mayis = holidayListForYear(2026).filter((h) => h.date.startsWith('2026-05'));
  assert.equal(mayis.length, 7, '1 + 19 Mayıs + 5 gün Kurban Bayramı');
  assert.equal(mayis.find((h) => h.date === '2026-05-26').eve, true);
  assert.equal(mayis.find((h) => h.date === '2026-05-27').eve, false);
});

test('suggestType - arifede çalışılıyorsa normal önerilir', () => {
  const date = new Date(2026, 4, 26);
  const base = { weekendDays: [0] };
  assert.equal(suggestType(date, '2026-05-26', { ...base, halfDayEves: false }).type, 'holiday');
  assert.equal(suggestType(date, '2026-05-26', { ...base, halfDayEves: true }).type, 'normal');
  // Bayramın kendisi ayardan etkilenmez
  assert.equal(suggestType(new Date(2026, 4, 27), '2026-05-27', { ...base, halfDayEves: true }).type, 'holiday');
});
