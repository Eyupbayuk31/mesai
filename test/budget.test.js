import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetSummary, categoryOf, CATEGORIES } from '../js/budget.js';

function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const baseSettings = {
  monthlySalary: 30000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
};

test('budgetSummary - harcamalar toplanır, dönem dışı sayılmaz, kalan hesaplanır', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [
      { id: 'x1', date: '2026-08-02', amount: 1000, category: 'market' },
      { id: 'x2', date: '2026-08-10', amount: 500, category: 'yemek' },
      { id: 'x3', date: '2026-08-15', amount: 250, category: 'ulasim' },
      { id: 'x4', date: '2026-08-20', amount: 250, category: 'diger' },
      { id: 'x5', date: '2026-07-31', amount: 9999, category: 'market' }, // farklı dönem
    ],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.expenseCount, 4);
  assert.equal(s.spent, 2000);
  assert.equal(s.hasSalary, true);
  assert.equal(s.expectedTotal, 30000);
  assert.equal(s.remaining, 28000);
});

test('budgetSummary - kategori kırılımı büyükten küçüğe sıralı', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [
      { id: 'x1', date: '2026-08-02', amount: 250, category: 'ulasim' },
      { id: 'x2', date: '2026-08-10', amount: 1000, category: 'market' },
      { id: 'x3', date: '2026-08-15', amount: 500, category: 'yemek' },
    ],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.byCategory.length, 3);
  assert.equal(s.byCategory[0].key, 'market');
  assert.equal(s.byCategory[0].amount, 1000);
  assert.equal(s.byCategory[1].key, 'yemek');
});

test('budgetSummary - günlük pay: kalan / ayın kalan günü (bugün dahil)', () => {
  const state = { settings: baseSettings, entries: [], expenses: [], adjustments: [] };
  // 21 Ağustos'ta ayın sonu 31 → 11 gün (bugün dahil); kalan 30000
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.daysLeft, 11);
  assert.equal(Math.round(s.dailyAllowance), Math.round(30000 / 11));
});

test('budgetSummary - ayın son günü gün sayısı 1 olur', () => {
  const state = { settings: baseSettings, entries: [], expenses: [], adjustments: [] };
  const s = budgetSummary(state, '2026-08', '2026-08-31');
  assert.equal(s.daysLeft, 1);
});

test('budgetSummary - geçmiş dönem için günlük pay yok', () => {
  const state = { settings: baseSettings, entries: [], expenses: [], adjustments: [] };
  const s = budgetSummary(state, '2026-07', '2026-08-21');
  assert.equal(s.daysLeft, 0);
  assert.equal(s.dailyAllowance, null);
});

test('budgetSummary - maaş girilmemişse kalan yine hesaplanır (harcama kadar eksi)', () => {
  const state = {
    settings: { monthlySalary: 0, hoursDivisor: 225, multipliers: {} },
    entries: [],
    expenses: [{ id: 'x1', date: '2026-08-02', amount: 300, category: 'market' }],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.hasSalary, false);
  assert.equal(s.remaining, -300);
});

test('budgetSummary - mesai ve yan ödemeler tahmini ödemeye dahil (bağlantı)', () => {
  const state = {
    settings: {
      ...baseSettings,
      mealAllowance: 250,
      weeklySchedule: {
        0: { works: false }, 1: { works: true }, 2: { works: true },
        3: { works: true }, 4: { works: true }, 5: { works: true }, 6: { works: false },
      },
    },
    entries: [{ id: 'e1', date: '2026-08-05', hours: 2, type: 'normal' }],
    expenses: [{ id: 'x1', date: '2026-08-06', amount: 1000, category: 'market' }],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  // Ağustos 2026 Pzt-Cum: 21 iş günü x 250 = 5250 yemek; mesai 2 x 133.33 x 1.5 = 400
  assert.equal(Math.round(s.expectedTotal), Math.round(30000 + 400 + 5250));
  assert.equal(Math.round(s.remaining), Math.round(30000 + 400 + 5250 - 1000));
});

test('categoryOf - bilinmeyen anahtar Diğer kategorisine düşer', () => {
  assert.equal(categoryOf('bilinmeyen').key, 'diger');
  assert.equal(categoryOf('market').label, 'Market');
  assert.equal(CATEGORIES.length, 8);
});

test('Store - harcama ekle/güncelle/sil + varsayılan durum boş', async () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  const { Store } = await import('../js/store.js');
  const store = new Store();
  assert.equal(store.getState().expenses.length, 0); // eski yedekler boş expenses ile açılır

  const rec = store.addExpense({ date: '2026-08-21', amount: 150, category: 'yemek', note: 'döner' });
  assert.equal(store.getState().expenses.length, 1);
  assert.ok(rec.id.startsWith('x_'));

  store.updateExpense(rec.id, { amount: 200 });
  assert.equal(store.getState().expenses[0].amount, 200);
  assert.equal(store.getState().expenses[0].note, 'döner');

  store.removeExpense(rec.id);
  assert.equal(store.getState().expenses.length, 0);

  const check = store.validateImport({ entries: [], expenses: [{ id: 'x', date: '2026-08-01', amount: 5, category: 'diger' }] });
  assert.equal(check.expenseCount, 1);
});
