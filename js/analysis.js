// Derin analiz: yıllar arası karşılaştırma, reel değişim, kategori trendi.
//
// Hepsi saf; veriyi mevcut hesaplardan (periodSummary / budgetSummary /
// yearFinance / investedInYear) alır, yeni bir para mantığı yazmaz.

import { yearFinance, budgetSummary, categoryOf } from './budget.js';
import { yearSummary } from './payroll.js';
import { shiftPeriod } from './period.js';
import { investedInYear } from './investments.js';

/** İki sayı arasındaki yüzde değişim. Taban 0 ise yüzde anlamsızdır: null. */
export function pctChange(from, to) {
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  if (a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

// Bir yılda kaç ayda gerçekten veri var? Yarım yıllık veriyle tam yılı
// kıyaslamak "%4.920 arttı" gibi saçma sonuçlar üretiyor.
//
// Bordro da veri sayılır: gelir artık ele geçen paradan hesaplanıyor, 12 ay
// bordro girilmiş bir yıl harcama kaydı seyrek olsa da dolu bir yıldır.
export function monthsWithData(state, year) {
  const months = new Set();
  const inYear = (d) => d?.slice(0, 4) === String(year);
  for (const e of state?.expenses || []) if (inYear(e?.date)) months.add(e.date.slice(5, 7));
  for (const e of state?.entries || []) if (inYear(e?.date)) months.add(e.date.slice(5, 7));
  for (const p of state?.payslips || []) if (inYear(p?.periodKey)) months.add(p.periodKey.slice(5, 7));
  for (const r of state?.recurring || []) {
    // Sürekli gider tanım ayından sonra her ay üretir.
    if (r?.active !== false && r?.since && r.since.slice(0, 4) <= String(year)) return 12;
  }
  return months.size;
}

// Kıyasın anlamlı sayılması için taban yılda en az bu kadar ay veri olmalı.
export const MIN_COMPARE_MONTHS = 6;

/** Veri bulunan yıllar, büyükten küçüğe. */
export function yearsWithData(state) {
  const years = new Set();
  for (const e of state?.entries || []) if (e?.date) years.add(Number(e.date.slice(0, 4)));
  for (const e of state?.expenses || []) if (e?.date) years.add(Number(e.date.slice(0, 4)));
  for (const i of state?.investments || []) if (i?.date) years.add(Number(i.date.slice(0, 4)));
  return [...years].filter(Boolean).sort((a, b) => b - a);
}

/**
 * İki yılı karşılaştırır: gelir, harcama, mesai, yatırım ve yüzde değişimler.
 * @returns {{ from, to, rows: Array }}
 */
export function compareYears(state, fromYear, toYear, todayStr) {
  const a = yearFinance(state, fromYear, todayStr);
  const b = yearFinance(state, toYear, todayStr);
  const ay = yearSummary(state, fromYear);
  const by = yearSummary(state, toYear);

  // Para satırları ELE GEÇEN paradan okunur. İki yılın bordro doluluğu
  // birbirini tutmuyorsa yüzde yalan söyler (2 bordrolu yıl ile 11 bordrolu
  // yıl "+%933" verir), o yüzden oran gizlenir — changeCell null'da gri "—"
  // basıyor, arayüzde ek iş yok.
  const incomeComparable = a.incomeMonths >= MIN_COMPARE_MONTHS && b.incomeMonths >= MIN_COMPARE_MONTHS;

  const rows = [
    { key: 'income', label: 'Eline geçen', from: a.received, to: b.received, money: true, needsIncome: true },
    { key: 'spent', label: 'Harcama', from: a.spent, to: b.spent, money: true, lowerIsBetter: true },
    { key: 'remaining', label: 'Eline geçen − harcama', from: a.remaining, to: b.remaining, money: true, needsIncome: true },
    { key: 'invested', label: 'Yatırım', from: investedInYear(state, fromYear), to: investedInYear(state, toYear), money: true },
    { key: 'hours', label: 'Mesai saati', from: ay.totalHours, to: by.totalHours, money: false },
    { key: 'overtimePay', label: 'Mesai ücreti', from: ay.totalOvertimePay, to: by.totalOvertimePay, money: true },
  ].map((r) => ({
    ...r,
    diff: r.to - r.from,
    pct: r.needsIncome && !incomeComparable ? null : pctChange(r.from, r.to),
  }));

  return {
    from: fromYear,
    to: toYear,
    rows,
    fromIncomeMonths: a.incomeMonths,
    toIncomeMonths: b.incomeMonths,
    incomeComparable,
  };
}

/**
 * Gelir mi harcama mı daha hızlı arttı? "Zam aldım ama eridim" sorusunun cevabı.
 * Reel değişim = gelir artışı − harcama artışı (yüzde puan farkı).
 * Taban yıl boşsa yorum yapılmaz (null) — uydurma oran üretilmez.
 */
export function realChange(state, fromYear, toYear, todayStr) {
  const a = yearFinance(state, fromYear, todayStr);
  const b = yearFinance(state, toYear, todayStr);
  const incomePct = pctChange(a.received, b.received);
  const spentPct = pctChange(a.spent, b.spent);
  if (incomePct === null || spentPct === null) return null;

  // Taban yıl yarım kalmışsa yüzde büyür ve yalan söyler: hesabı veriyoruz
  // ama "güvenilir değil" diye işaretliyoruz, arayüz cümle kurmuyor.
  //
  // monthsWithData tek başına yetmez: harcama/mesai aylarını sayıyor ve
  // sürekli gider varsa sert 12 döndürüyor — bordroya hiç bakmıyor. Gelir
  // artık bordrodan geldiği için bordro ayı sayısı da şart.
  const baseMonths = monthsWithData(state, fromYear);
  return {
    incomePct,
    spentPct,
    gapPoints: incomePct - spentPct,
    better: incomePct >= spentPct,
    baseMonths,
    basePayslipMonths: a.incomeMonths,
    targetPayslipMonths: b.incomeMonths,
    reliable: baseMonths >= MIN_COMPARE_MONTHS
      && a.incomeMonths >= MIN_COMPARE_MONTHS
      && b.incomeMonths >= MIN_COMPARE_MONTHS,
  };
}

/**
 * Her kategorinin son N aylık seyri ve yönü.
 * Yön: son 3 ayın ortalaması, önceki 3 ayın ortalamasına göre.
 * @returns {Array} [{ key, label, color, total, months: number[], trendPct, direction }]
 */
export function categoryTrend(state, periodKey, months = 12) {
  const keys = [];
  for (let i = months - 1; i >= 0; i -= 1) keys.push(shiftPeriod(periodKey, -i));

  const byCat = new Map();
  for (const expense of allExpensesWithVirtual(state, keys)) {
    const row = byCat.get(expense.category) || { key: expense.category, months: new Array(keys.length).fill(0), total: 0 };
    row.months[expense.index] += expense.amount;
    row.total += expense.amount;
    byCat.set(expense.category, row);
  }

  const half = Math.min(3, Math.floor(keys.length / 2));
  return [...byCat.values()]
    .map((row) => {
      const recent = avg(row.months.slice(-half));
      const before = avg(row.months.slice(-half * 2, -half));
      const trendPct = pctChange(before, recent);
      return {
        ...row,
        ...categoryOf(row.key, state.settings),
        periodKeys: keys,
        trendPct,
        direction: trendPct === null ? 'yeni' : trendPct > 8 ? 'artıyor' : trendPct < -8 ? 'azalıyor' : 'sabit',
      };
    })
    .sort((a, b) => b.total - a.total);
}

function avg(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Dönem listesi için gerçek + sanal (sürekli gider, kredi taksiti) harcamalar.
// budgetSummary ikisini zaten birleştiriyor; burada yalnızca aya indeksleniyor.
function allExpensesWithVirtual(state, keys) {
  const out = [];
  keys.forEach((key, index) => {
    for (const e of budgetSummary(state, key).expenses) {
      out.push({ category: e.category, amount: Number(e.amount) || 0, index });
    }
  });
  return out;
}

/** Mesai gelirinin toplam gelire oranı, yıl yıl. */
export function overtimeShareByYear(state, years, todayStr) {
  return years.map((year) => {
    const fin = yearFinance(state, year, todayStr);
    const pay = yearSummary(state, year);
    // Payda HESAPLANAN kazanç kalır, ele geçen para değil. Pay (mesai ücreti)
    // mesai kayıtlarından hesaplanıyor; paydayı bordroya çevirmek 3 bordrolu
    // yılda "%210 mesai" gibi saçma bir oran üretir.
    return {
      year,
      earned: fin.earned,
      overtimePay: pay.totalOvertimePay,
      share: fin.earned > 0 ? (pay.totalOvertimePay / fin.earned) * 100 : 0,
      hours: pay.totalHours,
      basis: 'earned',
    };
  });
}
