import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loanTotal, periodDiff, loanDueInPeriod, loanStatus, loansSummary, loanExpensesForPeriod,
  loanKind, isOpenDebt, DEBT_KINDS,
} from '../js/loans.js';
import { budgetSummary } from '../js/budget.js';

// Araba kredisi: ayda 10.000, 36 taksit, ilk taksit Ağustos 2026.
const araba = {
  id: 'l1', label: 'Araba kredisi', amount: 10000, installments: 36,
  firstPeriod: '2026-08', day: 15, category: 'kredi', active: true,
};

const pay = (date, amount, loanId = 'l1') => ({ id: 'x' + date, date, amount, category: 'kredi', loanId });

test('loanTotal / periodDiff', () => {
  assert.equal(loanTotal(araba), 360000);
  assert.equal(periodDiff('2026-08', '2026-11'), 3);
  assert.equal(periodDiff('2026-08', '2027-02'), 6);
  assert.equal(periodDiff('2026-08', '2026-07'), -1);
});

// --- Aylık taksit ---

test('loanDueInPeriod - ilk taksitten itibaren her ay taksit düşer', () => {
  assert.equal(loanDueInPeriod(araba, '2026-08'), 10000);
  assert.equal(loanDueInPeriod(araba, '2026-12'), 10000);
});

test('loanDueInPeriod - ilk taksitten ÖNCE hiç düşmez', () => {
  assert.equal(loanDueInPeriod(araba, '2026-07'), 0);
});

test('loanDueInPeriod - taksitler bitince kendiliğinden durur', () => {
  // 36 taksit: 2026-08 .. 2029-07
  assert.equal(loanDueInPeriod(araba, '2029-07'), 10000, '36. taksit');
  assert.equal(loanDueInPeriod(araba, '2029-08'), 0, '37. ayda artık düşmemeli');
});

test('loanDueInPeriod - kapatılmış kredi düşmez', () => {
  assert.equal(loanDueInPeriod({ ...araba, active: false }, '2026-10'), 0);
});

// --- Kalan borç ---

test('loanStatus - her ay ödendikçe kalan borç azalır', () => {
  const ilkAy = loanStatus(araba, [], '2026-08');
  assert.equal(ilkAy.total, 360000);
  assert.equal(ilkAy.paidInstallments, 1);
  assert.equal(ilkAy.remaining, 350000);

  const besinciAy = loanStatus(araba, [], '2026-12');
  assert.equal(besinciAy.paidInstallments, 5);
  assert.equal(besinciAy.remaining, 310000);
});

test('loanStatus - başlamadan önce borcun tamamı durur', () => {
  const res = loanStatus(araba, [], '2026-07');
  assert.equal(res.remaining, 360000);
  assert.equal(res.paidInstallments, 0);
  assert.equal(res.notStarted, true);
});

test('loanStatus - son taksitte borç biter', () => {
  const res = loanStatus(araba, [], '2029-07');
  assert.equal(res.paidInstallments, 36);
  assert.equal(res.remaining, 0);
  assert.equal(res.finished, true);
  assert.equal(res.endPeriod, null);
});

test('loanStatus - ilerleme ve bitiş dönemi', () => {
  const res = loanStatus(araba, [], '2027-05'); // 10. taksit
  assert.equal(res.paidInstallments, 10);
  assert.equal(res.progress, 100000 / 360000);
  assert.equal(res.monthsLeft, 26);
  assert.equal(res.endPeriod, '2029-07');
});

// --- Ara / erken ödeme ---

test('ara ödeme kalan borcu düşürür ve bitişi öne çeker', () => {
  const payments = [pay('2026-10-05', 50000)];
  const res = loanStatus(araba, payments, '2026-10');
  // 3 taksit (30.000) + 50.000 ara ödeme = 80.000
  assert.equal(res.paid, 80000);
  assert.equal(res.remaining, 280000);
  assert.equal(res.extraPaid, 50000);
  assert.equal(res.monthsLeft, 28, '36 yerine daha erken biter');
});

test('ara ödeme sonrası taksit düşmeye devam eder', () => {
  const payments = [pay('2026-10-05', 50000)];
  assert.equal(loanDueInPeriod(araba, '2026-11', payments), 10000);
});

test('borç erken kapanırsa taksit KESİLİR', () => {
  // Ayın 2. ayında borcun tamamı kapatılıyor
  const payments = [pay('2026-09-05', 350000)];
  assert.equal(loanDueInPeriod(araba, '2026-10', payments), 0, 'kapanan kredi düşmeye devam etmemeli');
  const res = loanStatus(araba, payments, '2026-12');
  assert.equal(res.remaining, 0);
  assert.equal(res.finished, true);
});

test('son taksit borçtan fazlasını çekmez', () => {
  // 30.000'lik borcun 25.000'i ara ödemeyle kapandı; son taksit 5.000 olmalı
  const kucuk = { ...araba, id: 'l2', amount: 10000, installments: 3 };
  const payments = [pay('2026-08-20', 15000, 'l2')];
  assert.equal(loanDueInPeriod(kucuk, '2026-09', payments), 5000);
  assert.equal(loanDueInPeriod(kucuk, '2026-10', payments), 0);
});

// --- Bütçeye yansıma ---

const settings = { monthlySalary: 40000, hoursDivisor: 225, multipliers: { normal: 1.5, weekend: 2, holiday: 2 } };
const stateWith = (loans, expenses = []) => ({
  settings, entries: [], adjustments: [], recurring: [], expenses, loans,
});

test('kredi taksiti bütçeden düşer (sanal harcama)', () => {
  const summary = budgetSummary(stateWith([araba]), '2026-09', '2026-09-20');
  assert.equal(summary.spent, 10000, 'taksit harcamaya girmeli');
  assert.ok(summary.expenses.some((e) => e.loanRef === 'l1' && e.virtual));
});

test('kredi bitince bütçeden düşmez', () => {
  const summary = budgetSummary(stateWith([araba]), '2029-08', '2029-08-20');
  assert.equal(summary.spent, 0);
});

test('ara ödeme hem bütçeye hem borca yazılır (çifte sayım yok)', () => {
  const payments = [pay('2026-09-05', 50000)];
  const summary = budgetSummary(stateWith([araba], payments), '2026-09', '2026-09-20');
  // Bütçe: 10.000 taksit + 50.000 ara ödeme = 60.000 (ikisi de gerçek para çıkışı)
  assert.equal(summary.spent, 60000);
  // Borç: 2 taksit + 50.000 = 70.000 ödendi
  assert.equal(summary.loans.items[0].status.paid, 70000);
});

test('loansSummary - toplam kalan borç ve aylık taksit', () => {
  const ihtiyac = { id: 'l2', label: 'İhtiyaç kredisi', amount: 5000, installments: 12, firstPeriod: '2026-08', day: 5, category: 'kredi', active: true };
  const summary = loansSummary(stateWith([araba, ihtiyac]), '2026-09');
  assert.equal(summary.count, 2);
  assert.equal(summary.monthlyTotal, 15000);
  // Araba: 360.000 - 20.000 = 340.000 · İhtiyaç: 60.000 - 10.000 = 50.000
  assert.equal(summary.totalRemaining, 390000);
  assert.equal(summary.items[0].loan.id, 'l1', 'büyük borç önce listelenir');
});

test('loansSummary - biten kredi toplamı şişirmez', () => {
  const summary = loansSummary(stateWith([araba]), '2029-08');
  assert.equal(summary.totalRemaining, 0);
  assert.equal(summary.openCount, 0);
  assert.equal(summary.count, 1, 'liste yine de gösterilir');
});

test('loanExpensesForPeriod - ayın gününe göre tarihlenir', () => {
  const [e] = loanExpensesForPeriod(stateWith([araba]), '2026-09');
  assert.equal(e.date, '2026-09-15');
  assert.equal(e.amount, 10000);
  assert.equal(e.virtual, true);
});

// --- Açık (taksitsiz) borç: kişiye borç, kart bakiyesi -------------------
// 20.000 ₺ borç; taksit yok, eline geçtikçe ödüyor.
const ahmet = {
  id: 'd1', kind: 'kisi', label: 'Ahmet', amount: 20000, installments: 0,
  firstPeriod: '2026-08', day: 1, category: 'diger', active: true,
};
const ödeme = (date, amount, loanId = 'd1') => ({ id: 'p' + date, date, amount, category: 'diger', loanId });

test('isOpenDebt / loanKind - tür ve taksitsizlik', () => {
  assert.equal(isOpenDebt(ahmet), true);
  assert.equal(isOpenDebt(araba), false);
  assert.equal(isOpenDebt({ amount: 500 }), true, 'taksit alanı yoksa açık borç');
  assert.equal(loanKind(ahmet).key, 'kisi');
  assert.equal(loanKind(araba).key, 'kredi');
  assert.equal(loanKind({}).key, 'kredi', 'tür yoksa kredi sayılır (eski kayıtlar)');
  assert.equal(loanKind({ kind: 'uydurma' }).key, 'kredi');
  assert.equal(DEBT_KINDS.length, 4);
});

test('açık borç - toplam doğrudan tutardır, aylık taksit düşmez', () => {
  assert.equal(loanTotal(ahmet), 20000);
  assert.equal(loanDueInPeriod(ahmet, '2026-08', []), 0);
  assert.equal(loanDueInPeriod(ahmet, '2026-12', []), 0);
});

test('açık borç - kalan = toplam − ödemeler', () => {
  const s0 = loanStatus(ahmet, [], '2026-08');
  assert.equal(s0.total, 20000);
  assert.equal(s0.paid, 0);
  assert.equal(s0.remaining, 20000);
  assert.equal(s0.open, true);
  assert.equal(s0.finished, false);

  const s1 = loanStatus(ahmet, [ödeme('2026-08-20', 5000)], '2026-08');
  assert.equal(s1.paid, 5000);
  assert.equal(s1.remaining, 15000);
  assert.equal(s1.progress, 0.25);

  // Sonraki ayın ödemesi bu ayın durumuna girmez.
  const s2 = loanStatus(ahmet, [ödeme('2026-08-20', 5000), ödeme('2026-09-05', 3000)], '2026-08');
  assert.equal(s2.remaining, 15000);
  assert.equal(loanStatus(ahmet, [ödeme('2026-08-20', 5000), ödeme('2026-09-05', 3000)], '2026-09').remaining, 12000);
});

test('açık borç - fazla ödemede kalan sıfırın altına inmez', () => {
  const s = loanStatus(ahmet, [ödeme('2026-08-20', 25000)], '2026-08');
  assert.equal(s.paid, 20000);
  assert.equal(s.remaining, 0);
  assert.equal(s.finished, true);
  assert.equal(s.endPeriod, null, 'açık borçta bitiş tahmini yapılmaz');
});

test('açık borç bütçeye sanal taksit yazmaz', () => {
  const state = { loans: [ahmet], expenses: [], recurring: [], settings: {} };
  assert.deepEqual(loanExpensesForPeriod(state, '2026-08'), []);
});

test('taksitli kişi borcu kredi ile birebir aynı hesaplanır', () => {
  const taksitli = { ...ahmet, id: 'd2', installments: 4, amount: 5000 };
  const kredi = { ...araba, id: 'l9', installments: 4, amount: 5000, firstPeriod: '2026-08' };
  const a = loanStatus(taksitli, [], '2026-09');
  const b = loanStatus(kredi, [], '2026-09');
  assert.equal(a.total, b.total);
  assert.equal(a.paid, b.paid);
  assert.equal(a.remaining, b.remaining);
  assert.equal(a.paidInstallments, b.paidInstallments);
});

test('loansSummary - tür süzgeci ve byKind kırılımı', () => {
  const state = { loans: [araba, ahmet], expenses: [ödeme('2026-08-20', 5000)], recurring: [], settings: {} };

  const hepsi = loansSummary(state, '2026-08');
  assert.equal(hepsi.count, 2);
  assert.equal(hepsi.totalRemaining, 350000 + 15000);
  assert.equal(hepsi.monthlyTotal, 10000, 'yalnız kredinin taksiti');

  const krediler = loansSummary(state, '2026-08', { kind: 'kredi' });
  assert.equal(krediler.count, 1);
  assert.equal(krediler.totalRemaining, 350000);

  const borclar = loansSummary(state, '2026-08', { kind: ['kisi', 'kart', 'diger'] });
  assert.equal(borclar.count, 1);
  assert.equal(borclar.totalRemaining, 15000);
  assert.equal(borclar.monthlyTotal, 0);

  assert.equal(hepsi.byKind.kredi.remaining, 350000);
  assert.equal(hepsi.byKind.kredi.monthly, 10000);
  assert.equal(hepsi.byKind.kisi.remaining, 15000);
  assert.equal(hepsi.byKind.kart.count, 0);
});

test('loansSummary - eski kayıt (kind yok) kredi süzgecine girer', () => {
  const eski = { id: 'l0', label: 'Eski', amount: 1000, installments: 10, firstPeriod: '2026-08', active: true };
  const state = { loans: [eski], expenses: [], recurring: [], settings: {} };
  assert.equal(loansSummary(state, '2026-08', { kind: 'kredi' }).count, 1);
  assert.equal(loansSummary(state, '2026-08', { kind: 'kisi' }).count, 0);
});
