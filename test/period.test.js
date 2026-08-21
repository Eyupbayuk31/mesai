import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodKeyForDate, periodRange, shiftPeriod, payDateForPeriod,
  daysUntilPay, periodLabel, isDateInPeriod, periodKeyFromISODate,
} from '../js/period.js';

test('periodKeyForDate - takvim ayını verir', () => {
  assert.equal(periodKeyForDate(new Date(2026, 7, 14)), '2026-08');
  assert.equal(periodKeyForDate(new Date(2026, 0, 1)), '2026-01');
});

test('periodRange - 31 çeken ay tam kapsanır', () => {
  const r = periodRange('2026-08');
  assert.equal(r.startISO, '2026-08-01');
  assert.equal(r.endISO, '2026-08-31');
});

test('periodRange - şubat 2026 (artık olmayan yıl) 28 gün', () => {
  const r = periodRange('2026-02');
  assert.equal(r.endISO, '2026-02-28');
});

test('periodRange - şubat 2028 (artık yıl) 29 gün', () => {
  const r = periodRange('2028-02');
  assert.equal(r.endISO, '2028-02-29');
});

test('shiftPeriod - ileri ve geri, yıl sınırını aşar', () => {
  assert.equal(shiftPeriod('2026-08', 1), '2026-09');
  assert.equal(shiftPeriod('2026-12', 1), '2027-01');
  assert.equal(shiftPeriod('2026-01', -1), '2025-12');
});

test('payDateForPeriod - normal ay, payDay 10, offset 1', () => {
  const settings = { payDay: 10, payMonthOffset: 1 };
  const d = payDateForPeriod('2026-08', settings);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8); // Eylül (0-indexli)
  assert.equal(d.getDate(), 10);
});

test('payDateForPeriod - payDay 31, ödeme ayı 30 çekiyorsa kırpılır', () => {
  const settings = { payDay: 31, payMonthOffset: 1 };
  // Nisan dönemi -> ödeme Mayıs (31 çeker, kırpılmaz)
  const d1 = payDateForPeriod('2026-04', settings);
  assert.equal(d1.getDate(), 31);
  assert.equal(d1.getMonth(), 4);
  // Ocak dönemi -> ödeme Şubat 2026 (28 çeker) -> 28'e kırpılır
  const d2 = payDateForPeriod('2026-01', settings);
  assert.equal(d2.getMonth(), 1);
  assert.equal(d2.getDate(), 28);
});

test('daysUntilPay - bugünden ödeme gününe fark', () => {
  const settings = { payDay: 10, payMonthOffset: 1 };
  const today = new Date(2026, 7, 21); // 21 Ağustos 2026
  const days = daysUntilPay('2026-08', settings, today);
  // Ödeme: 10 Eylül 2026 -> 21 Ağustos'tan 20 gün sonra
  assert.equal(days, 20);
});

test('periodLabel - Türkçe ay adı', () => {
  assert.equal(periodLabel('2026-08'), 'Ağustos 2026');
});

test('isDateInPeriod ve periodKeyFromISODate', () => {
  assert.equal(isDateInPeriod('2026-08-14', '2026-08'), true);
  assert.equal(isDateInPeriod('2026-09-01', '2026-08'), false);
  assert.equal(periodKeyFromISODate('2026-08-14'), '2026-08');
});
