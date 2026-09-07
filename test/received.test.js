import { test } from 'node:test';
import assert from 'node:assert/strict';

const { receivedInPeriod, payslipTotal } = await import('../js/received.js');

const settings = { payDay: 10, payMonthOffset: 1, monthlySalary: 35000 };
const state = (over = {}) => ({ settings, payslips: [], adjustments: [], ...over });

test('receivedInPeriod - Eylül\'ün parası Ağustos bordrosudur', () => {
  const s = state({ payslips: [{ id: 'p1', periodKey: '2026-08', amount: 52960, transport: 1430 }] });
  const r = receivedInPeriod(s, '2026-09');
  assert.equal(r.payslipPeriod, '2026-08');
  assert.equal(r.payslip, 54390);
  assert.equal(r.total, 54390);
  assert.equal(r.hasPayslip, true);
});

test('receivedInPeriod - bordro girilmemişse para girmemiş sayılır', () => {
  const r = receivedInPeriod(state(), '2026-09');
  assert.equal(r.total, 0);
  assert.equal(r.hasPayslip, false);
  assert.deepEqual(r.lines, []);
});

test('receivedInPeriod - para girişi ve avans o dönemde ele geçmiş sayılır', () => {
  const s = state({
    payslips: [{ id: 'p1', periodKey: '2026-08', amount: 50000 }],
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
    payslips: [{ id: 'p1', periodKey: '2026-08', amount: 50000, deduction: 2000 }],
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
