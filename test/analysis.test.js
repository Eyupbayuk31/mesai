import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pctChange, yearsWithData, compareYears, realChange, categoryTrend, overtimeShareByYear, monthsWithData } from '../js/analysis.js';

const settings = {
  monthlySalary: 40000, hoursDivisor: 225, multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weekendDays: [0], mealAllowance: 0, transportAllowance: 0, payDay: 10, payMonthOffset: 1,
  weeklySchedule: {}, customCategories: [],
};

const state = {
  settings: {
    ...settings,
    salaryHistory: [
      { id: 's1', fromPeriod: '2025-01', amount: 30000 },
      { id: 's2', fromPeriod: '2026-01', amount: 40000 },
    ],
  },
  entries: [
    { id: 'e1', date: '2025-03-10', hours: 4, type: 'normal' },
    { id: 'e2', date: '2026-03-10', hours: 8, type: 'normal' },
  ],
  expenses: [
    { id: 'x1', date: '2025-03-05', amount: 1000, category: 'market' },
    { id: 'x2', date: '2025-09-05', amount: 1000, category: 'yemek' },
    { id: 'x3', date: '2026-03-05', amount: 3000, category: 'market' },
    { id: 'x4', date: '2026-08-05', amount: 500, category: 'yemek' },
  ],
  investments: [{ id: 'i1', assetId: 'a1', date: '2026-05-01', quantity: 1, unitCost: 7000 }],
  assets: [{ id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram' }],
  recurring: [], loans: [], adjustments: [], payslips: [],
};

// Gelir artık ELE GEÇEN paradan geliyor. Dikkat: bir yılın geliri o yılın
// AYLARINDA ele geçen paradır — offset 1 ile 2026'nın geliri
// 2025-12 … 2026-11 bordrolarıdır.
const bordrolu = (from, to, amount) => {
  const out = [];
  let k = from;
  while (k <= to) {
    out.push({ id: `p_${k}`, periodKey: k, amount });
    const [y, m] = k.split('-').map(Number);
    k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return out;
};

// 2025 geliri 12×30000, 2026 geliri 12×40000 olacak şekilde.
// Bordro KENDİ ayına yazılır (10 Eylül'de girilen Ağustos bordrosu Ağustos'un
// kazancıdır), o yüzden dönemler yılın kendi ayları.
const doluState = () => ({
  ...state,
  payslips: [...bordrolu('2025-01', '2025-12', 30000), ...bordrolu('2026-01', '2026-12', 40000)],
});

test('pctChange - taban sıfırsa yüzde uydurulmaz', () => {
  assert.equal(pctChange(0, 500), null);
  assert.equal(pctChange(100, 150), 50);
  assert.equal(pctChange(100, 50), -50);
});

test('yearsWithData - veri olan yıllar yeniden eskiye', () => {
  assert.deepEqual(yearsWithData(state), [2026, 2025]);
});

test('yearsWithData - veri yoksa boş dizi', () => {
  assert.deepEqual(yearsWithData({ entries: [], expenses: [], investments: [] }), []);
});

test('compareYears - satırlar, farklar ve yüzdeler', () => {
  const res = compareYears(state, 2025, 2026, '2026-08-24');
  assert.equal(res.from, 2025);
  assert.equal(res.to, 2026);

  const harcama = res.rows.find((r) => r.key === 'spent');
  assert.equal(harcama.from, 2000);
  assert.equal(harcama.to, 3500);
  assert.equal(harcama.diff, 1500);
  assert.equal(harcama.pct, 75);

  const saat = res.rows.find((r) => r.key === 'hours');
  assert.equal(saat.from, 4);
  assert.equal(saat.to, 8);
  assert.equal(saat.pct, 100);

  const yatirim = res.rows.find((r) => r.key === 'invested');
  assert.equal(yatirim.to, 7000);
  assert.equal(yatirim.pct, null, '2025 yatırımı yok, yüzde anlamsız');
});

test('compareYears - gelir satırı ELE GEÇEN paradır', () => {
  const res = compareYears(doluState(), 2025, 2026, '2026-08-24');
  const gelir = res.rows.find((r) => r.key === 'income');
  // 2025 tamamlanmış: 12 ay. 2026 için bugün 24 Ağustos → Ocak-Ağustos = 8 ay;
  // gelecek aylar toplama girmez, yoksa "henüz almadığın maaş" sayılırdı.
  assert.equal(gelir.from, 12 * 30000);
  assert.equal(gelir.to, 8 * 40000);
  assert.equal(res.fromIncomeMonths, 12);
  assert.equal(res.toIncomeMonths, 8);
  assert.equal(res.incomeComparable, true, 'ikisi de 6 aydan fazla');
});

test('compareYears - bordro yoksa gelir 0 ve yüzde basılmaz', () => {
  const res = compareYears(state, 2025, 2026, '2026-08-24');
  const gelir = res.rows.find((r) => r.key === 'income');
  assert.equal(gelir.from, 0, 'maaş ayarından gelir uydurulmaz');
  assert.equal(gelir.to, 0);
  assert.equal(gelir.pct, null);
  assert.equal(res.incomeComparable, false);
  // Harcama satırı bordrodan bağımsız, yüzdesi durmalı.
  assert.equal(res.rows.find((r) => r.key === 'spent').pct, 75);
});

test('realChange - gelir mi harcama mı hızlı arttı', () => {
  const res = realChange(doluState(), 2025, 2026, '2026-08-24');
  assert.ok(res.spentPct > res.incomePct, 'harcama daha hızlı arttı');
  assert.equal(res.better, false);
  assert.equal(Math.round(res.gapPoints), Math.round(res.incomePct - res.spentPct));
});

test('realChange - taban yılda bordro yoksa yorum yok', () => {
  // Harcama iki yılda da var ama gelir yalnız 2026'da: taban gelir 0 →
  // pctChange null → uydurma oran üretilmez.
  const s2 = { ...state, payslips: bordrolu('2026-01', '2026-12', 40000) };
  assert.equal(realChange(s2, 2025, 2026, '2026-08-24'), null);
});

test('realChange - taban yıl boşsa yorum yok', () => {
  const tek = { ...state, expenses: state.expenses.filter((e) => e.date.startsWith('2026')), entries: [] };
  assert.equal(realChange(tek, 2025, 2026, '2026-08-24'), null);
});

test('categoryTrend - aylık dizi, toplam ve yön', () => {
  const rows = categoryTrend(state, '2026-08', 12);
  const market = rows.find((r) => r.key === 'market');
  assert.equal(market.total, 3000, 'son 12 ayda yalnız 2026-03 marketi');
  assert.equal(market.months.length, 12);
  assert.equal(market.months.reduce((t, m) => t + m, 0), market.total);
  assert.ok(rows[0].total >= rows[rows.length - 1].total, 'büyükten küçüğe sıralı');
});

test('categoryTrend - sürekli gider ve kredi taksiti de sayılır, tek kez', () => {
  const withRecurring = {
    ...state,
    recurring: [{ id: 'r1', label: 'Kira', amount: 10000, category: 'kira', day: 5, since: '2026-01', active: true }],
  };
  const kira = categoryTrend(withRecurring, '2026-08', 12).find((r) => r.key === 'kira');
  // Pencere 2025-09…2026-08. Sürekli gider tanım ayından SONRA üretir:
  // şubat-ağustos = 7 ay.
  assert.equal(kira.total, 7 * 10000);
  assert.ok(kira.months.every((m) => m === 0 || m === 10000), 'her ay tek taksit');
});

test('overtimeShareByYear - oran HESAPLANAN kazanca göre, bordroya göre değil', () => {
  const rows = overtimeShareByYear(state, [2026, 2025], '2026-08-24');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].basis, 'earned');
  assert.ok(rows[0].share > 0 && rows[0].share < 100);
  assert.equal(rows[0].hours, 8);
  assert.equal(rows[1].hours, 4);
  // Pay mesai kayıtlarından, payda hesaplanan kazançtan geliyor: bordro
  // girmek bu oranı DEĞİŞTİRMEMELİ. (Payda ele geçen para olsaydı, birkaç
  // bordrolu yılda "%210 mesai" gibi saçma oran çıkardı.)
  const bordroluRows = overtimeShareByYear(doluState(), [2026, 2025], '2026-08-24');
  assert.equal(bordroluRows[0].share, rows[0].share);
  assert.equal(bordroluRows[1].share, rows[1].share);
});

test('overtimeShareByYear - kazancı olmayan yılda sıfıra bölme yok', () => {
  const bos = { ...state, settings: { ...settings, monthlySalary: 0, salaryHistory: [] } };
  const [row] = overtimeShareByYear(bos, [2024], '2026-08-24');
  assert.equal(row.share, 0);
});

test('monthsWithData - yılda kaç ay veri var', () => {
  assert.equal(monthsWithData(state, 2025), 2, 'mart ve eylül');
  assert.equal(monthsWithData(state, 2026), 2, 'mart ve ağustos');
  assert.equal(monthsWithData(state, 2024), 0);
});

test('monthsWithData - bordro girilen ay da veri sayılır', () => {
  const s2 = { ...state, payslips: bordrolu('2025-01', '2025-12', 30000) };
  assert.equal(monthsWithData(s2, 2025), 12, '12 bordro → dolu yıl');
});

test('monthsWithData - sürekli gider varsa yıl dolu sayılır', () => {
  const s = { ...state, recurring: [{ id: 'r1', since: '2025-01', amount: 100, category: 'kira', day: 5, active: true }] };
  assert.equal(monthsWithData(s, 2025), 12);
});

test('realChange - yarım veriyle kıyas güvenilir sayılmaz', () => {
  const s2 = { ...doluState(), payslips: [...bordrolu('2025-01', '2025-02', 30000), ...bordrolu('2026-01', '2026-12', 40000)] };
  const res = realChange(s2, 2025, 2026, '2026-08-24');
  assert.equal(res.reliable, false, '2025 yalnız 2 bordro ayı');
  assert.equal(res.basePayslipMonths, 2);
  assert.ok(Number.isFinite(res.incomePct), 'hesap yine de yapılır');
});

test('realChange - sürekli gider tek başına yılı kıyaslanabilir YAPMAZ', () => {
  // monthsWithData sürekli gider görünce sert 12 döndürüyor ama bordroya
  // bakmıyor; gelir artık bordrodan geldiği için bu yetmez.
  const s2 = {
    ...doluState(),
    payslips: [...bordrolu('2025-01', '2025-02', 30000), ...bordrolu('2025-12', '2026-11', 40000)],
    recurring: [{ id: 'r1', since: '2024-01', amount: 5000, category: 'kira', day: 5, active: true }],
  };
  const res = realChange(s2, 2025, 2026, '2026-08-24');
  assert.equal(res.baseMonths, 12, 'monthsWithData dolu diyor');
  assert.equal(res.reliable, false, 'ama 2 bordro ayı var');
});

test('realChange - iki yıl da bordro doluysa kıyas güvenilir', () => {
  const res = realChange(doluState(), 2025, 2026, '2026-08-24');
  assert.equal(res.basePayslipMonths, 12);
  assert.equal(res.targetPayslipMonths, 8, 'içinde bulunulan yılda yalnız geçmiş aylar');
  assert.equal(res.reliable, true, 'ikisi de MIN_COMPARE_MONTHS üstünde');
});
