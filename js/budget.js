// Bütçe kontrol: günlük harcamalar + tahmini ödemeden kalan hesabı.
// Tüm fonksiyonlar saf; kalem CRUD işlemleri Store'da.

import { periodSummary } from './payroll.js';
import { periodRange } from './period.js';
import { parseISODate } from './format.js';
import { todayISO } from './format.js';

// Harcama kategorileri — renkler CSS değişkenlerinden bağımsız sabit hex,
// HTML raporunda da aynı palet kullanılır.
export const CATEGORIES = [
  { key: 'market', label: 'Market', color: '#2f8a5c' },
  { key: 'yemek', label: 'Yemek', color: '#d97d0d' },
  { key: 'ulasim', label: 'Ulaşım', color: '#2f63c4' },
  { key: 'fatura', label: 'Fatura', color: '#0e8a8a' },
  { key: 'kira', label: 'Kira', color: '#8447b5' },
  { key: 'giyim', label: 'Giyim', color: '#c2568e' },
  { key: 'eglence', label: 'Eğlence', color: '#b0431f' },
  { key: 'diger', label: 'Diğer', color: '#7d7666' },
];

export function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

// Dönemin bütçe özeti: harcamalar, kategori kırılımı, tahmini ödemeden kalan
// ve (dönem içindeysek) günlük harcayabileceğin tutar.
export function budgetSummary(state, periodKey, todayStr = todayISO()) {
  const expenses = (state.expenses || []).filter((e) => e.date.slice(0, 7) === periodKey);
  const pay = periodSummary(state, periodKey);

  const byCategory = new Map();
  let spent = 0;
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    spent += amount;
    byCategory.set(e.category, (byCategory.get(e.category) || 0) + amount);
  }

  const hasSalary = pay.baseSalary > 0;
  const remaining = pay.netTotal - spent;

  // Günlük pay yalnızca içinde bulunulan dönem için anlamlı; ayın kalan günleri
  // (bugün dahil) kalan tutara bölünür.
  const isCurrent = periodKey === todayStr.slice(0, 7);
  const { endISO } = periodRange(periodKey);
  const daysLeft = isCurrent
    ? Math.round((parseISODate(endISO) - parseISODate(todayStr)) / 86400000) + 1
    : 0;
  const dailyAllowance = isCurrent && hasSalary ? remaining / Math.max(1, daysLeft) : null;

  return {
    periodKey,
    expenseCount: expenses.length,
    expenses,
    spent,
    byCategory: [...byCategory.entries()]
      .map(([key, amount]) => ({ ...categoryOf(key), amount }))
      .sort((a, b) => b.amount - a.amount),
    expectedTotal: pay.netTotal,
    hasSalary,
    remaining,
    daysLeft,
    dailyAllowance,
  };
}
