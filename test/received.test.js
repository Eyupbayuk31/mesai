import { test } from 'node:test';
import assert from 'node:assert/strict';

const { receivedInPeriod, payslipTotal } = await import('../js/received.js');

const settings = { payDay: 10, payMonthOffset: 1, monthlySalary: 35000 };
const state = (over = {}) => ({ settings, payslips: [], adjustments: [], ...over });

test('receivedInPeriod - bordro KENDİ ayına yazılır, yattığı aya değil', () => {
  const s = state({ payslips: [{ id: 'p1', periodKey: '2026-08', amount: 52960, transport: 1430 }] });

  // Ağustos bordrosu 10 Eylül'de yatar ve o gün girilir; yine de Ağustos'un
  // kazancıdır. Eylül'ün toplamına hiçbir şekilde eklenmez.
  const agustos = receivedInPeriod(s, '2026-08');
  assert.equal(agustos.payslip, 54390);
  assert.equal(agustos.total, 54390);
  assert.equal(agustos.hasPayslip, true);

  const eylul = receivedInPeriod(s, '2026-09');
  assert.equal(eylul.payslip, 0);
  assert.equal(eylul.total, 0);
  assert.equal(eylul.hasPayslip, false);
  assert.deepEqual(eylul.lines, [], 'Eylül ekranında bilgi satırı olarak bile durmaz');
  // Kaydırma yalnız "maaşın yattığında şu ayın bordrosunu gir" için lazım.
  assert.equal(eylul.payslipPeriod, '2026-08');
});

test('receivedInPeriod - bordro girilmemişse para girmemiş sayılır', () => {
  const r = receivedInPeriod(state(), '2026-09');
  assert.equal(r.total, 0);
  assert.equal(r.hasPayslip, false);
  assert.deepEqual(r.lines, []);
});

test('receivedInPeriod - para girişi ve avans o dönemde ele geçmiş sayılır', () => {
  const s = state({
    payslips: [{ id: 'p1', periodKey: '2026-09', amount: 50000 }],
    adjustments: [
      { id: 'a1', periodKey: '2026-09', kind: 'income', amount: 3000 },
      { id: 'a2', periodKey: '2026-09', kind: 'advance', amount: 5000 },
      { id: 'a3', periodKey: '2026-10', kind: 'income', amount: 9999 }, // başka dönem
    ],
  });
  const r = receivedInPeriod(s, '2026-09');
  assert.equal(r.manual, 3000);
  assert.equal(r.advances, 5000);
  assert.equal(r.total, 58000);
  assert.deepEqual(r.lines.map((l) => l.label), ['Bordro', 'Avans', 'Para girişi']);
});

test('receivedInPeriod - eski "bonus" kayıtları para girişi sayılır', () => {
  const s = state({ adjustments: [{ id: 'a1', periodKey: '2026-09', kind: 'bonus', amount: 1200 }] });
  assert.equal(receivedInPeriod(s, '2026-09').total, 1200);
});

test('receivedInPeriod - kesinti bordro toplamından düşülür, ayrıca düşülmez', () => {
  const s = state({
    payslips: [{ id: 'p1', periodKey: '2026-09', amount: 50000, deduction: 2000 }],
    adjustments: [{ id: 'a1', periodKey: '2026-09', kind: 'deduction', amount: 777 }],
  });
  const r = receivedInPeriod(s, '2026-09');
  assert.equal(r.payslip, 48000);
  assert.equal(r.total, 48000, 'kesinti ayarlaması ayrıca düşülmemeli');
});

test('receivedInPeriod - aynı ay ödeme (offset 0) kendi bordrosunu kullanır', () => {
  const s = {
    settings: { payDay: 30, payMonthOffset: 0 },
    payslips: [{ id: 'p1', periodKey: '2026-09', amount: 40000 }],
    adjustments: [],
  };
  const r = receivedInPeriod(s, '2026-09');
  assert.equal(r.payslipPeriod, '2026-09');
  assert.equal(r.total, 40000);
});

test('payslipTotal - tüm kalemler toplanır, kesinti düşülür', () => {
  assert.equal(payslipTotal({ amount: 50000, transport: 1400, meal: 6500, overtime: 1700, deduction: 200 }), 59400);
  assert.equal(payslipTotal(null), 0);
  assert.equal(payslipTotal({}), 0);
});

test('receivedInPeriod - elle girilen paranın kendi etiketi taşınır', () => {
  const state = {
    settings: { payMonthOffset: 1 },
    payslips: [],
    adjustments: [
      { id: 'a1', periodKey: '2026-09', kind: 'income', amount: 35000, label: 'Avans elden' },
      { id: 'a2', periodKey: '2026-09', kind: 'income', amount: 500, label: 'Bahşiş' },
      { id: 'a3', periodKey: '2026-09', kind: 'advance', amount: 1000, label: '' },
    ],
  };
  const r = receivedInPeriod(state, '2026-09');
  const manual = r.lines.find((l) => l.key === 'manual');
  // "Para girişi ₺35.500" tek başına ne olduğunu söylemiyordu.
  assert.deepEqual(manual.items.map((i) => i.label), ['Avans elden', 'Bahşiş']);
  assert.equal(manual.amount, 35500);
  const advance = r.lines.find((l) => l.key === 'advance');
  assert.deepEqual(advance.items.map((i) => i.label), [''], 'etiketsiz kayıt da listelenir');
});

test('payslipTotal - bordrodaki avans satırı toplamdan düşülür', async () => {
  const { payslipTotal } = await import('../js/received.js');
  // Bordro satır satır girilince toplam NET KAZANÇ olmalı.
  assert.equal(
    Math.round(payslipTotal({
      amount: 33619.63, transport: 2300, overtime: 5054.15, advance: 35000,
    }) * 100) / 100,
    5973.78,
  );
});

// --- Nakit (bütçenin dayanağı) --------------------------------------------

test('cashInPeriod - bu ay YATAN bordroyu sayar, kendi bordrosunu değil', async () => {
  const { cashInPeriod } = await import('../js/received.js');
  const s = state({ payslips: [{ id: 'p1', periodKey: '2026-08', amount: 5973.78 }] });

  // Ağustos bordrosu 10 Eylül'de yatar: Eylül'ün harcanabilir parası odur.
  const eylul = cashInPeriod(s, '2026-09');
  assert.equal(eylul.total, 5973.78);
  assert.equal(eylul.payslipPeriod, '2026-08');
  assert.equal(eylul.hasPayslip, true);

  // Ağustos'un nakdi Temmuz bordrosudur; yoksa sıfırdır.
  assert.equal(cashInPeriod(s, '2026-08').total, 0);
});

test('cashInPeriod ve receivedInPeriod AYRI sorulara cevap verir', async () => {
  const { cashInPeriod } = await import('../js/received.js');
  const s = state({ payslips: [{ id: 'p1', periodKey: '2026-08', amount: 5973.78 }] });

  // Aynı bordro: kazanç Ağustos'un, nakit Eylül'ün.
  assert.equal(receivedInPeriod(s, '2026-08').total, 5973.78, 'kazanç kendi ayında');
  assert.equal(receivedInPeriod(s, '2026-09').total, 0);
  assert.equal(cashInPeriod(s, '2026-08').total, 0);
  assert.equal(cashInPeriod(s, '2026-09').total, 5973.78, 'nakit yattığı ayda');
});

test('cashInPeriod - para girişi ve avans girildiği döneme yazılır', async () => {
  const { cashInPeriod } = await import('../js/received.js');
  const s = state({
    payslips: [{ id: 'p1', periodKey: '2026-08', amount: 5000 }],
    adjustments: [
      { id: 'a1', periodKey: '2026-09', kind: 'income', amount: 3000, label: 'Yan iş' },
      { id: 'a2', periodKey: '2026-09', kind: 'advance', amount: 1000, label: '' },
      { id: 'a3', periodKey: '2026-08', kind: 'income', amount: 9999 },
    ],
  });
  const r = cashInPeriod(s, '2026-09');
  assert.equal(r.total, 9000, '5000 bordro + 3000 giriş + 1000 avans');
  assert.deepEqual(r.lines.map((l) => l.label), ['Bordro', 'Avans', 'Para girişi']);
  assert.deepEqual(r.lines.find((l) => l.key === 'manual').items.map((i) => i.label), ['Yan iş']);
});

test('cashInPeriod - kaydırma yoksa ayın kendi bordrosu', async () => {
  const { cashInPeriod } = await import('../js/received.js');
  const s = {
    settings: { payDay: 30, payMonthOffset: 0 },
    payslips: [{ id: 'p1', periodKey: '2026-09', amount: 40000 }],
    adjustments: [],
  };
  assert.equal(cashInPeriod(s, '2026-09').total, 40000);
  assert.equal(cashInPeriod(s, '2026-09').payslipPeriod, '2026-09');
});
