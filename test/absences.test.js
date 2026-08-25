import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABSENCE_KINDS, absenceKind, absenceOn, absenceDatesInPeriod, absencesInPeriod, absenceStats } from '../js/absences.js';
import { workdaysForPeriod, periodSummary } from '../js/payroll.js';

const settings = {
  monthlySalary: 45000, hoursDivisor: 225, multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weekendDays: [0], mealAllowance: 250, transportAllowance: 65, payDay: 10, payMonthOffset: 1,
  weeklySchedule: {
    0: { works: false, start: '08:30', end: '18:00' },
    1: { works: true, start: '08:30', end: '18:00' },
    2: { works: true, start: '08:30', end: '18:00' },
    3: { works: true, start: '08:30', end: '18:00' },
    4: { works: true, start: '08:30', end: '18:00' },
    5: { works: true, start: '08:30', end: '18:00' },
    6: { works: true, start: '08:30', end: '12:45' },
  },
};

const state = (absences = []) => ({
  settings, absences,
  entries: [], expenses: [], recurring: [], adjustments: [], loans: [], payslips: [], assets: [], investments: [],
});

test('ABSENCE_KINDS - dört tür, hepsinde etiket ve renk', () => {
  assert.equal(ABSENCE_KINDS.length, 4);
  for (const k of ABSENCE_KINDS) assert.ok(k.key && k.label && k.color);
  assert.equal(absenceKind('rapor').label, 'Rapor');
  assert.equal(absenceKind('yok').key, 'izin', 'bilinmeyen tür ilk türe düşer');
});

test('workdaysForPeriod - izin günü iş gününden düşer', () => {
  const temiz = workdaysForPeriod('2026-09', settings);
  const izinli = workdaysForPeriod('2026-09', settings, ['2026-09-01', '2026-09-02']);
  assert.equal(izinli, temiz - 2);
});

test('workdaysForPeriod - izin yokken sonuç bugünküyle AYNI (regresyon)', () => {
  assert.equal(workdaysForPeriod('2026-09', settings, []), workdaysForPeriod('2026-09', settings));
  assert.equal(workdaysForPeriod('2026-09', settings, undefined), workdaysForPeriod('2026-09', settings));
});

test('workdaysForPeriod - hafta sonuna/tatile denk gelen izin iki kez düşmez', () => {
  const temiz = workdaysForPeriod('2026-08', settings);
  // 2026-08-30 Zafer Bayramı, 2026-08-23 Pazar
  const izinli = workdaysForPeriod('2026-08', settings, ['2026-08-30', '2026-08-23']);
  assert.equal(izinli, temiz, 'zaten iş günü değiller');
});

test('periodSummary - izinli ayda yemek/yol azalır, maaş ve mesai değişmez', () => {
  const temiz = periodSummary(state(), '2026-09');
  const izinli = periodSummary(state([
    { id: 'a1', date: '2026-09-01', kind: 'izin' },
    { id: 'a2', date: '2026-09-02', kind: 'rapor' },
  ]), '2026-09');

  assert.equal(izinli.allowanceDays, temiz.allowanceDays - 2);
  assert.equal(izinli.mealPay, temiz.mealPay - 2 * 250);
  assert.equal(izinli.transportPay, temiz.transportPay - 2 * 65);
  assert.equal(izinli.baseSalary, temiz.baseSalary, 'maaşa dokunulmaz');
  assert.equal(izinli.overtimePay, temiz.overtimePay);
  assert.equal(izinli.payoutTotal, temiz.payoutTotal - 2 * 315);
});

test('absenceDatesInPeriod / absencesInPeriod - dönem süzgeci ve sıra', () => {
  const s = state([
    { id: 'a1', date: '2026-09-15', kind: 'izin' },
    { id: 'a2', date: '2026-09-02', kind: 'rapor' },
    { id: 'a3', date: '2026-10-05', kind: 'izin' },
  ]);
  assert.deepEqual(absenceDatesInPeriod(s, '2026-09').sort(), ['2026-09-02', '2026-09-15']);
  assert.deepEqual(absencesInPeriod(s, '2026-09').map((a) => a.date), ['2026-09-02', '2026-09-15']);
  assert.equal(absenceDatesInPeriod(s, '2026-11').length, 0);
});

test('absenceOn - günün kaydı', () => {
  const s = state([{ id: 'a1', date: '2026-09-15', kind: 'rapor' }]);
  assert.equal(absenceOn(s, '2026-09-15').kind, 'rapor');
  assert.equal(absenceOn(s, '2026-09-16'), null);
});

test('absenceStats - yıl bazında tür sayımı', () => {
  const s = state([
    { id: 'a1', date: '2026-03-02', kind: 'izin' },
    { id: 'a2', date: '2026-07-14', kind: 'izin' },
    { id: 'a3', date: '2026-08-03', kind: 'rapor' },
    { id: 'a4', date: '2025-08-03', kind: 'izin' },
  ]);
  const stats = absenceStats(s, 2026);
  assert.equal(stats.counts.izin, 2);
  assert.equal(stats.counts.rapor, 1);
  assert.equal(stats.counts.devamsiz, 0);
  assert.equal(stats.total, 3);
});
