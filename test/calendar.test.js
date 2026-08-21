import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthGrid, groupEntriesByDate } from '../js/ui/calendar.js';

test('calendarMonthGrid - her zaman 6x7 = 42 hücre', () => {
  assert.equal(calendarMonthGrid(2026, 8).length, 42);
  assert.equal(calendarMonthGrid(2026, 2).length, 42);
});

test('calendarMonthGrid - hafta Pazartesi ile başlar', () => {
  // 1 Ağustos 2026 Cumartesi -> ızgaranın ilk günü 27 Temmuz Pazartesi
  const cells = calendarMonthGrid(2026, 8);
  assert.equal(cells[0].date.getDay(), 1, 'ilk hücre Pazartesi olmalı');
  assert.equal(cells[0].iso, '2026-07-27');
  assert.equal(cells[0].inMonth, false);
});

test('calendarMonthGrid - ayın günleri doğru işaretlenir', () => {
  const cells = calendarMonthGrid(2026, 8);
  const inMonth = cells.filter((c) => c.inMonth);
  assert.equal(inMonth.length, 31, 'Ağustos 31 gün');
  assert.equal(inMonth[0].iso, '2026-08-01');
  assert.equal(inMonth[inMonth.length - 1].iso, '2026-08-31');
});

test('calendarMonthGrid - şubat 2028 artık yıl 29 gün', () => {
  const inMonth = calendarMonthGrid(2028, 2).filter((c) => c.inMonth);
  assert.equal(inMonth.length, 29);
  assert.equal(inMonth[inMonth.length - 1].iso, '2028-02-29');
});

test('calendarMonthGrid - şubat 2026 artık olmayan yıl 28 gün', () => {
  const inMonth = calendarMonthGrid(2026, 2).filter((c) => c.inMonth);
  assert.equal(inMonth.length, 28);
});

test('calendarMonthGrid - ayın 1i Pazartesiyse baştan taşma olmaz', () => {
  // 1 Haziran 2026 Pazartesi
  const cells = calendarMonthGrid(2026, 6);
  assert.equal(cells[0].iso, '2026-06-01');
  assert.equal(cells[0].inMonth, true);
});

test('calendarMonthGrid - yıl sınırını doğru aşar (Ocak/Aralık)', () => {
  const jan = calendarMonthGrid(2026, 1);
  assert.equal(jan[0].date.getFullYear(), 2025, 'Ocak ızgarası önceki yıla taşar');
  const dec = calendarMonthGrid(2026, 12);
  const last = dec[dec.length - 1];
  assert.equal(last.date.getFullYear(), 2027, 'Aralık ızgarası sonraki yıla taşar');
});

test('calendarMonthGrid - hücreler kesintisiz ardışık günler', () => {
  const cells = calendarMonthGrid(2026, 8);
  for (let i = 1; i < cells.length; i++) {
    const diff = (cells[i].date - cells[i - 1].date) / 86400000;
    assert.equal(Math.round(diff), 1, `hücre ${i} bir gün sonrası olmalı`);
  }
});

test('groupEntriesByDate - aynı güne birden fazla kayıt gruplanır', () => {
  const grouped = groupEntriesByDate([
    { id: '1', date: '2026-08-21', hours: 1 },
    { id: '2', date: '2026-08-21', hours: 2 },
    { id: '3', date: '2026-08-22', hours: 3 },
  ]);
  assert.equal(grouped['2026-08-21'].length, 2);
  assert.equal(grouped['2026-08-22'].length, 1);
  assert.equal(grouped['2026-08-23'], undefined);
});
