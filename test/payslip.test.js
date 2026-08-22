import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePayslip, explainPayslipDiff, payslipFor, payslipStats } from '../js/payslip.js';
import { salaryForPeriod, hourlyRate, entryAmount, periodSummary, addSalaryChange } from '../js/payroll.js';

const settings = {
  monthlySalary: 45000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weekendDays: [0],
  mealAllowance: 0,
  transportAllowance: 0,
};

// --- Maaş geçmişi -------------------------------------------------------

test('salaryForPeriod - geçmiş yoksa tek maaş tüm dönemlerde (eski davranış)', () => {
  assert.equal(salaryForPeriod(settings, '2026-01'), 45000);
  assert.equal(salaryForPeriod(settings, '2026-08'), 45000);
});

test('salaryForPeriod - her dönem kendi maaşıyla hesaplanır', () => {
  const s = {
    ...settings,
    monthlySalary: 45000,
    salaryHistory: [
      { id: 'a', fromPeriod: '2026-01', amount: 30000 },
      { id: 'b', fromPeriod: '2026-07', amount: 45000 },
    ],
  };
  assert.equal(salaryForPeriod(s, '2026-06'), 30000, 'zam öncesi eski maaş');
  assert.equal(salaryForPeriod(s, '2026-07'), 45000, 'zam ayı yeni maaş');
  assert.equal(salaryForPeriod(s, '2026-12'), 45000, 'sonraki aylar yeni maaş');
});

test('salaryForPeriod - en eski kayıttan da önceki dönemde en eski maaş kullanılır', () => {
  const s = { ...settings, salaryHistory: [{ id: 'b', fromPeriod: '2026-07', amount: 45000 }] };
  assert.equal(salaryForPeriod(s, '2025-11'), 45000);
});

test('salaryForPeriod - sıralama bozuk girilse de doğru sonuç', () => {
  const s = {
    ...settings,
    salaryHistory: [
      { id: 'c', fromPeriod: '2026-09', amount: 52000 },
      { id: 'a', fromPeriod: '2026-01', amount: 30000 },
      { id: 'b', fromPeriod: '2026-07', amount: 45000 },
    ],
  };
  assert.equal(salaryForPeriod(s, '2026-08'), 45000);
  assert.equal(salaryForPeriod(s, '2026-09'), 52000);
});

test('entryAmount - kaydın kendi tarihindeki maaş kullanılır (zam geçmişi bozmaz)', () => {
  const s = {
    ...settings,
    salaryHistory: [
      { id: 'a', fromPeriod: '2026-01', amount: 22500 },  // saat 100
      { id: 'b', fromPeriod: '2026-07', amount: 45000 },  // saat 200
    ],
  };
  const haziran = { id: 'e1', date: '2026-06-10', hours: 2, type: 'normal' };
  const temmuz = { id: 'e2', date: '2026-07-10', hours: 2, type: 'normal' };
  assert.equal(entryAmount(haziran, s), 2 * 100 * 1.5);
  assert.equal(entryAmount(temmuz, s), 2 * 200 * 1.5);
});

test('hourlyRate - dönem verilmezse güncel maaş, verilirse o dönemin maaşı', () => {
  const s = { ...settings, salaryHistory: [{ id: 'a', fromPeriod: '2026-01', amount: 22500 }] };
  assert.equal(hourlyRate(s), 200, 'dönemsiz çağrı güncel maaşı kullanır');
  assert.equal(hourlyRate(s, '2026-03'), 100);
});

test('periodSummary - geçmiş dönem zamdan etkilenmez', () => {
  const state = {
    settings: {
      ...settings,
      salaryHistory: [
        { id: 'a', fromPeriod: '2026-01', amount: 30000 },
        { id: 'b', fromPeriod: '2026-07', amount: 45000 },
      ],
    },
    entries: [{ id: 'e1', date: '2026-06-10', hours: 2, type: 'normal' }],
    adjustments: [], expenses: [], recurring: [],
  };
  const haziran = periodSummary(state, '2026-06');
  assert.equal(haziran.baseSalary, 30000);
});


test('addSalaryChange - ilk zamda ESKİ maaş da kaydedilir (geçmiş bozulmaz)', () => {
  const s = { ...settings, monthlySalary: 22500, salaryHistory: [] };
  const patch = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');

  assert.equal(patch.salaryHistory.length, 2);
  assert.equal(patch.salaryHistory[0].amount, 22500, 'eski maaş başlangıç kaydı olmalı');
  assert.equal(patch.salaryHistory[0].initial, true);
  assert.equal(patch.monthlySalary, 45000);

  const yeni = { ...s, ...patch };
  assert.equal(salaryForPeriod(yeni, '2026-06'), 22500, 'haziran eski maaşta kalmalı');
  assert.equal(salaryForPeriod(yeni, '2026-07'), 45000);
});

test('addSalaryChange - sonraki zamlarda başlangıç kaydı tekrarlanmaz', () => {
  const s = { ...settings, monthlySalary: 22500, salaryHistory: [] };
  const bir = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');
  const iki = addSalaryChange({ ...s, ...bir }, { fromPeriod: '2027-01', amount: 52000 }, '2027-02');
  assert.equal(iki.salaryHistory.length, 3);
  assert.equal(iki.salaryHistory.filter((h) => h.initial).length, 1);
});

test('addSalaryChange - aynı ay tekrar girilirse üzerine yazılır', () => {
  const s = { ...settings, monthlySalary: 22500, salaryHistory: [] };
  const bir = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');
  const iki = addSalaryChange({ ...s, ...bir }, { fromPeriod: '2026-07', amount: 46000 }, '2026-08');
  assert.equal(iki.salaryHistory.filter((h) => h.fromPeriod === '2026-07').length, 1);
  assert.equal(salaryForPeriod({ ...s, ...iki }, '2026-07'), 46000);
});

test('addSalaryChange - ileri tarihli zam güncel maaşı hemen değiştirmez', () => {
  const s = { ...settings, monthlySalary: 45000, salaryHistory: [] };
  const patch = addSalaryChange(s, { fromPeriod: '2026-12', amount: 52000 }, '2026-08');
  assert.equal(patch.monthlySalary, 45000, 'aralık gelene kadar güncel maaş aynı');
  assert.equal(salaryForPeriod({ ...s, ...patch }, '2026-12'), 52000);
});

test('addSalaryChange - eski maaş yoksa başlangıç kaydı üretilmez', () => {
  const s = { ...settings, monthlySalary: 0, salaryHistory: [] };
  const patch = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');
  assert.equal(patch.salaryHistory.length, 1);
});

// --- Bordro karşılaştırma ----------------------------------------------

const summary = (over = {}) => ({
  periodKey: '2026-08',
  netTotal: 50000, overtimePay: 5000, mealPay: 6500, transportPay: 1430,
  bonuses: 0, advances: 0, deductions: 0,
  ...over,
});

test('comparePayslip - tutuyorsa match', () => {
  const res = comparePayslip(summary(), 50000);
  assert.equal(res.status, 'match');
  assert.equal(res.diff, 0);
});

test('comparePayslip - kuruş farkı eksik ödeme sayılmaz', () => {
  assert.equal(comparePayslip(summary(), 49999.5).status, 'match');
  assert.equal(comparePayslip(summary(), 50000.5).status, 'match');
});

test('comparePayslip - eksik ve fazla ödeme ayırt edilir', () => {
  assert.equal(comparePayslip(summary(), 49722).status, 'short');
  assert.equal(comparePayslip(summary(), 49722).diff, -278);
  assert.equal(comparePayslip(summary(), 51000).status, 'over');
});

test('explainPayslipDiff - tutuyorsa açıklama yok', () => {
  const s = summary();
  assert.equal(explainPayslipDiff(s, comparePayslip(s, 50000), settings), null);
});

test('explainPayslipDiff - bir kalemin tamamı eksikse onu söyler', () => {
  const s = summary();
  const yemekYok = explainPayslipDiff(s, comparePayslip(s, 50000 - 6500), settings);
  assert.match(yemekYok, /Yemek parası/);

  const yolYok = explainPayslipDiff(s, comparePayslip(s, 50000 - 1430), settings);
  assert.match(yolYok, /Yol parası/);

  const mesaiYok = explainPayslipDiff(s, comparePayslip(s, 50000 - 5000), settings);
  assert.match(mesaiYok, /Mesai ücreti/);
});

test('explainPayslipDiff - avans iki kez düşülmüş olabilir', () => {
  const s = summary({ advances: 2000 });
  const res = explainPayslipDiff(s, comparePayslip(s, 48000), settings);
  assert.match(res, /Avans/);
});

test('explainPayslipDiff - fark saat cinsinden anlatılır', () => {
  // saat ücreti 200, normal çarpan 1.5 → saati 300. 900 TL = 3 saat
  const s = summary({ mealPay: 0, transportPay: 0, overtimePay: 9000 });
  const res = explainPayslipDiff(s, comparePayslip(s, 50000 - 900), settings);
  assert.match(res, /3 saat mesai eksik/);
});

test('explainPayslipDiff - çeyrek saate oturmayan farkta uydurma açıklama yok', () => {
  const s = summary({ mealPay: 0, transportPay: 0, overtimePay: 9000 });
  assert.equal(explainPayslipDiff(s, comparePayslip(s, 50000 - 137), settings), null);
});

test('payslipFor / payslipStats', () => {
  const state = {
    payslips: [
      { id: 'p1', periodKey: '2026-07', amount: 40000 },
      { id: 'p2', periodKey: '2026-08', amount: 49722 },
    ],
  };
  assert.equal(payslipFor(state, '2026-08').amount, 49722);
  assert.equal(payslipFor(state, '2026-06'), null);

  const stats = payslipStats(state, [
    { periodKey: '2026-07', netTotal: 40000 },
    { periodKey: '2026-08', netTotal: 50000 },
    { periodKey: '2026-09', netTotal: 50000 }, // bordro girilmemiş, sayılmaz
  ]);
  assert.equal(stats.checked, 2);
  assert.equal(stats.match, 1);
  assert.equal(stats.short, 1);
  assert.equal(stats.totalDiff, -278);
});
