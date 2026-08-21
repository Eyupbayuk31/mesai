import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourlyRate, entryAmount, hoursBetween, crossesMidnight, periodSummary, yearSummary } from '../js/payroll.js';

const baseSettings = {
  monthlySalary: 30000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
};

test('hourlyRate - maaş / bölen', () => {
  assert.equal(Math.round(hourlyRate(baseSettings) * 100) / 100, 133.33);
});

test('hourlyRate - bölen 0/boş ise varsayılan 225\'e düşer (bölme hatası yok)', () => {
  assert.equal(Math.round(hourlyRate({ monthlySalary: 30000, hoursDivisor: 0 }) * 100) / 100, 133.33);
});

test('hourlyRate - maaş boşsa 0', () => {
  assert.equal(hourlyRate({ monthlySalary: 0, hoursDivisor: 225 }), 0);
});

test('entryAmount - normal mesai x1.5', () => {
  const entry = { hours: 3.5, type: 'normal' };
  const amount = entryAmount(entry, baseSettings);
  assert.equal(Math.round(amount * 100) / 100, 700); // 3.5 * 133.33 * 1.5 ≈ 700
});

test('entryAmount - hafta tatili x2', () => {
  const entry = { hours: 4, type: 'weekend' };
  const amount = entryAmount(entry, baseSettings);
  assert.equal(Math.round(amount * 100) / 100, 1066.67);
});

test('hoursBetween - normal aralık', () => {
  assert.equal(hoursBetween('18:00', '21:30'), 3.5);
});

test('hoursBetween - gece yarısını geçen vardiya', () => {
  assert.equal(hoursBetween('22:00', '02:00'), 4);
});

test('hoursBetween - 15 dakika hassasiyet', () => {
  assert.equal(hoursBetween('09:00', '09:50'), 0.75);
});

test('crossesMidnight - tespit doğru', () => {
  assert.equal(crossesMidnight('22:00', '02:00'), true);
  assert.equal(crossesMidnight('18:00', '21:30'), false);
  assert.equal(crossesMidnight('09:00', '09:00'), true); // eşitse de sarkma kabul (24 saat degil, 0 olamaz varsayimi)
});

test('periodSummary - kullanıcı senaryosu: maaş 30000, 2 kayıt', () => {
  const state = {
    settings: baseSettings,
    entries: [
      { id: '1', date: '2026-08-14', hours: 3.5, type: 'normal' },
      { id: '2', date: '2026-08-17', hours: 4, type: 'weekend' },
      { id: '3', date: '2026-09-01', hours: 2, type: 'normal' }, // farklı dönem
    ],
    adjustments: [],
  };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.entryCount, 2);
  assert.equal(summary.totalHours, 7.5);
  assert.equal(Math.round(summary.overtimePay * 100) / 100, 1766.67);
  assert.equal(summary.baseSalary, 30000);
  assert.equal(Math.round(summary.netTotal * 100) / 100, 31766.67);
});

test('periodSummary - avans/prim/kesinti netTotal\'a yansır', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    adjustments: [
      { id: 'a1', periodKey: '2026-08', kind: 'bonus', amount: 500 },
      { id: 'a2', periodKey: '2026-08', kind: 'advance', amount: 1000 },
      { id: 'a3', periodKey: '2026-08', kind: 'deduction', amount: 200 },
      { id: 'a4', periodKey: '2026-09', kind: 'bonus', amount: 9999 }, // farklı dönem, sayılmaz
    ],
  };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.bonuses, 500);
  assert.equal(summary.advances, 1000);
  assert.equal(summary.deductions, 200);
  assert.equal(summary.netTotal, 30000 + 500 - 1000 - 200);
});

test('periodSummary - maaş 0 iken hata vermez, 0 döner', () => {
  const state = { settings: { monthlySalary: 0, hoursDivisor: 225, multipliers: {} }, entries: [], adjustments: [] };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.netTotal, 0);
  assert.equal(summary.overtimePay, 0);
});

test('yearSummary - 12 ay toplanır', () => {
  const state = {
    settings: baseSettings,
    entries: [
      { id: '1', date: '2026-01-05', hours: 2, type: 'normal' },
      { id: '2', date: '2026-06-05', hours: 3, type: 'normal' },
    ],
    adjustments: [],
  };
  const ys = yearSummary(state, 2026);
  assert.equal(ys.months.length, 12);
  assert.equal(ys.totalHours, 5);
});
