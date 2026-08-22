import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetSummary, budgetTips, categoryOf, allCategories, CATEGORIES,
  spendingPace, comparePreviousPeriod, spentThrough,
} from '../js/budget.js';

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

test('budgetSummary - avans bütçeye geri eklenir (harcamada zaten görünür)', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [{ id: 'x1', date: '2026-08-05', amount: 1000, category: 'fatura' }], // avansla ödenen fatura
    adjustments: [{ id: 'a1', periodKey: '2026-08', kind: 'advance', amount: 1000 }],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  // netTotal = 30000 - 1000 = 29000; bütçe avansı geri ekler → 30000
  assert.equal(s.expectedTotal, 30000);
  assert.equal(s.advances, 1000);
  assert.equal(s.remaining, 29000); // 30000 - 1000 harcama (fatura bir kez sayılır)
});

test('budgetSummary - kesinti geri eklenmez (hiç gelmeyen para)', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [],
    adjustments: [{ id: 'd1', periodKey: '2026-08', kind: 'deduction', amount: 500 }],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.expectedTotal, 29500); // 30000 - 500
});

test('budgetSummary - para girişi tahmini bütçeye dahil olur', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [],
    adjustments: [{ id: 'i1', periodKey: '2026-08', kind: 'income', amount: 2000 }],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.expectedTotal, 32000);
});

test('budgetTips - harcama yokken yönlendirme + genel tavsiye döner', () => {
  const state = { settings: baseSettings, entries: [], expenses: [], adjustments: [] };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  const tips = budgetTips(s, '2026-08-21');
  assert.equal(tips.length, 2);
  assert.ok(tips[0].includes('öneriler sana özelleşir'));
});

test('budgetTips - hız bütçeyi aşınca uyarı ve günlük limit verir', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [{ id: 'x1', date: '2026-08-01', amount: 25000, category: 'market' }],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  const tips = budgetTips(s, '2026-08-21');
  assert.ok(tips[0].includes('aşarsın') || tips[0].includes('aşıldı'));
});

test('budgetTips - sakin hızda birikim önerisi verir', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [{ id: 'x1', date: '2026-08-01', amount: 5000, category: 'market' }],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  const tips = budgetTips(s, '2026-08-21');
  assert.ok(tips.some((t) => t.includes('elinde kalır')));
});

test('categoryOf - bilinmeyen anahtar Diğer kategorisine düşer', () => {
  assert.equal(categoryOf('bilinmeyen').key, 'diger');
  assert.equal(categoryOf('market').label, 'Market');
  assert.ok(CATEGORIES.some((c) => c.key === 'kredi' && c.label === 'Kredi'));
});

test('allCategories - hazır Kredi kategorisi listede, özel kategoriler Diğer öncesinde birleşir', () => {
  const settings = {
    customCategories: [
      { key: 'c_araba', label: 'Araba', color: '#3d7bd9' },
      { key: 'c_cocuk', label: 'Çocuk', color: '#c94f4f' },
    ],
  };
  const all = allCategories(settings);
  assert.equal(all.length, CATEGORIES.length + 2); // 9 hazır + 2 özel
  assert.equal(all[all.length - 1].key, 'diger'); // Diğer her zaman sonda
  assert.ok(all.some((c) => c.key === 'c_araba' && c.label === 'Araba'));
  assert.ok(all.some((c) => c.key === 'kredi'));
  // ayarlar boşsa/eksikse sadece hazır liste döner
  assert.equal(allCategories({}).length, CATEGORIES.length);
  assert.equal(allCategories(undefined).length, CATEGORIES.length);
});

test('budgetSummary - özel kategori harcaması kırımda kendi adıyla görünür', () => {
  const state = {
    settings: {
      ...baseSettings,
      customCategories: [{ key: 'c_araba', label: 'Araba', color: '#3d7bd9' }],
    },
    entries: [],
    expenses: [
      { id: 'x1', date: '2026-08-05', amount: 700, category: 'c_araba' },
      { id: 'x2', date: '2026-08-10', amount: 300, category: 'market' },
      { id: 'x3', date: '2026-08-15', amount: 100, category: 'silinmis_kategori' }, // yok → Diğer
    ],
    adjustments: [],
  };
  const s = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(s.spent, 1100);
  const araba = s.byCategory.find((c) => c.key === 'c_araba');
  assert.equal(araba.label, 'Araba');
  assert.equal(araba.amount, 700);
  const diger = s.byCategory.find((c) => c.key === 'diger');
  assert.equal(diger.amount, 100);
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

test('budgetSummary - sürekli gider sonraki aylarda otomatik sanal harcama üretir', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [{ id: 'x1', date: '2026-08-05', amount: 5000, category: 'kira' }], // ilk giriş anı
    recurring: [{ id: 'r1', label: 'Kira', amount: 5000, category: 'kira', day: 5, since: '2026-08' }],
    adjustments: [],
  };
  // Girildiği ay: sanal üretilmez (gerçek harcama zaten var, çifte sayım olmasın)
  const aug = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(aug.virtualCount, 0);
  assert.equal(aug.spent, 5000);
  // Sonraki ay: otomatik gelir
  const sep = budgetSummary(state, '2026-09', '2026-09-10');
  assert.equal(sep.virtualCount, 1);
  assert.equal(sep.expenseCount, 0); // gerçek harcama yok
  assert.equal(sep.spent, 5000);
  assert.equal(sep.remaining, 25000); // 30000 - 5000
  const virtual = sep.expenses.find((e) => e.virtual);
  assert.equal(virtual.date, '2026-09-05');
  assert.equal(virtual.category, 'kira');
});

test('budgetSummary - sürekli gider günü kısa ayda ayın sonuna kırpılır', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [],
    recurring: [{ id: 'r1', label: 'Kredi', amount: 3000, category: 'kredi', day: 31, since: '2026-08' }],
    adjustments: [],
  };
  const feb = budgetSummary(state, '2027-02', '2027-02-10');
  const virtual = feb.expenses.find((e) => e.virtual);
  assert.equal(virtual.date, '2027-02-28'); // 2027 artık yıl değil
});

test('budgetSummary - pasif tanım sanal üretmez, kategori kırılımına girer', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [],
    recurring: [
      { id: 'r1', label: 'Kredi', amount: 3000, category: 'kredi', day: 10, since: '2026-08' },
      { id: 'r2', label: 'Eski', amount: 999, category: 'fatura', day: 1, since: '2026-08', active: false },
    ],
    adjustments: [],
  };
  const sep = budgetSummary(state, '2026-09', '2026-09-10');
  assert.equal(sep.virtualCount, 1);
  assert.equal(sep.byCategory.find((c) => c.key === 'kredi')?.amount, 3000);
});

test('budgetSummary - bu ay işaretlenen gider "sonraki aylara otomatik" özetinde görünür', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    expenses: [{ id: 'x1', date: '2026-08-05', amount: 5000, category: 'kira', recurringId: 'r1' }],
    recurring: [{ id: 'r1', label: 'Kira', amount: 5000, category: 'kira', day: 5, since: '2026-08' }],
    adjustments: [],
  };
  const aug = budgetSummary(state, '2026-08', '2026-08-21');
  assert.equal(aug.upcomingRecurring.length, 1);
  assert.equal(aug.upcomingTotal, 5000);
  const sep = budgetSummary(state, '2026-09', '2026-09-10');
  assert.equal(sep.upcomingTotal, 0); // eylülde artık "yeni işaretlenen" yok
  assert.equal(sep.virtualCount, 1);  // ama sanal geliyor
});

test('Store - sürekli gider ekle/güncelle/kaldır', async () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  const { Store } = await import('../js/store.js');
  const store = new Store();
  assert.equal(store.getState().recurring.length, 0);

  const def = store.addRecurring({ label: 'İnternet', amount: 450, category: 'fatura', day: 15, since: '2026-08' });
  assert.ok(def.id.startsWith('r_'));
  assert.equal(def.active, true);

  store.updateRecurring(def.id, { amount: 500 });
  assert.equal(store.getState().recurring[0].amount, 500);

  store.removeRecurring(def.id);
  assert.equal(store.getState().recurring.length, 0);
});

// --- Harcama hızı ------------------------------------------------------

const paceState = (expenses, recurring = []) => ({
  settings: { ...baseSettings, monthlySalary: 30000 },
  entries: [], adjustments: [], expenses, recurring,
});

test('spendingPace - değişken harcama ay sonuna ileri sarılır', () => {
  // Ayın 10'unda 1000 TL değişken harcama → günde 100 → 31 günde 3100
  const state = paceState([{ id: 'x1', date: '2026-08-05', amount: 1000, category: 'market' }]);
  const pace = spendingPace(budgetSummary(state, '2026-08', '2026-08-10'), '2026-08-10');
  assert.equal(pace.projected, 3100);
  assert.equal(pace.reliable, true);
});

test('spendingPace - SÜREKLİ giderler ileri sarılmaz, olduğu gibi eklenir', () => {
  // Kira 5000 (sürekli) + 1000 değişken. Kira güne bölünüp 31'le çarpılsaydı
  // tahmin 15.500 TL gibi saçma bir sayı olurdu.
  const state = paceState(
    [{ id: 'x1', date: '2026-08-05', amount: 1000, category: 'market' }],
    [{ id: 'r1', label: 'kira', amount: 5000, category: 'fatura', day: 1, since: '2026-07', active: true }],
  );
  const pace = spendingPace(budgetSummary(state, '2026-08', '2026-08-10'), '2026-08-10');
  assert.equal(pace.projected, 5000 + 3100, `beklenmedik: ${pace.projected}`);
});

test('spendingPace - bugünden sonraki tarihli harcama hıza katılmaz', () => {
  const state = paceState([
    { id: 'x1', date: '2026-08-05', amount: 1000, category: 'market' },
    { id: 'x2', date: '2026-08-28', amount: 9000, category: 'market' },
  ]);
  const pace = spendingPace(budgetSummary(state, '2026-08', '2026-08-10'), '2026-08-10');
  assert.equal(pace.projected, 3100, 'ileri tarihli harcama günlük hızı bozmamalı');
});

test('spendingPace - ayın ilk günlerinde güvenilmez işaretlenir', () => {
  const state = paceState([{ id: 'x1', date: '2026-08-02', amount: 500, category: 'market' }]);
  assert.equal(spendingPace(budgetSummary(state, '2026-08', '2026-08-03'), '2026-08-03').reliable, false);
});

test('spendingPace - bütçe yetiyorsa tükenme günü yok', () => {
  const state = paceState([{ id: 'x1', date: '2026-08-05', amount: 100, category: 'market' }]);
  const pace = spendingPace(budgetSummary(state, '2026-08', '2026-08-10'), '2026-08-10');
  assert.equal(pace.runsOutOn, null);
  assert.equal(pace.daysShort, 0);
});

test('spendingPace - bütçe yetmiyorsa tükenme günü ve açık gün sayısı', () => {
  // 30.000 bütçe, ayın 10'unda 15.000 harcanmış → günde 1500 → 20. günde biter
  const state = paceState([{ id: 'x1', date: '2026-08-03', amount: 15000, category: 'market' }]);
  const summary = budgetSummary(state, '2026-08', '2026-08-10');
  const pace = spendingPace(summary, '2026-08-10');
  assert.ok(pace.projected > summary.expectedTotal, 'bütçe aşılmalı');
  assert.equal(pace.runsOutOn, '2026-08-20');
  assert.equal(pace.daysShort, 11);
});

test('spendingPace - geçmiş veya gelecek dönemde tahmin yok', () => {
  const state = paceState([{ id: 'x1', date: '2026-07-05', amount: 1000, category: 'market' }]);
  assert.equal(spendingPace(budgetSummary(state, '2026-07', '2026-08-10'), '2026-08-10'), null);
});

// --- Geçen aya kıyas ---------------------------------------------------

test('spentThrough - ayın N gününe kadarki harcama', () => {
  const state = paceState([
    { id: 'x1', date: '2026-08-03', amount: 100, category: 'market' },
    { id: 'x2', date: '2026-08-09', amount: 200, category: 'market' },
    { id: 'x3', date: '2026-08-20', amount: 900, category: 'market' },
  ]);
  assert.equal(spentThrough(state, '2026-08', 10), 300);
  assert.equal(spentThrough(state, '2026-08', 31), 1200);
});

test('comparePreviousPeriod - aynı güne kadar kıyaslanır', () => {
  const state = paceState([
    { id: 'p1', date: '2026-07-05', amount: 800, category: 'market' },
    { id: 'p2', date: '2026-07-25', amount: 5000, category: 'market' }, // 10'undan sonra, sayılmamalı
    { id: 'x1', date: '2026-08-04', amount: 1000, category: 'market' },
  ]);
  const cmp = comparePreviousPeriod(state, '2026-08', '2026-08-10');
  assert.equal(cmp.prevSpent, 800, 'geçen ayın yalnızca 10. gününe kadarı');
  assert.equal(cmp.thisSpent, 1000);
  assert.equal(cmp.diff, 200);
  assert.equal(cmp.partial, true);
});

test('comparePreviousPeriod - geçen ay hiç harcama yoksa kıyas yok', () => {
  const state = paceState([{ id: 'x1', date: '2026-08-04', amount: 1000, category: 'market' }]);
  assert.equal(comparePreviousPeriod(state, '2026-08', '2026-08-10'), null);
});

test('comparePreviousPeriod - bitmiş dönemde tüm ay kıyaslanır', () => {
  const state = paceState([
    { id: 'p1', date: '2026-06-20', amount: 400, category: 'market' },
    { id: 'x1', date: '2026-07-25', amount: 900, category: 'market' },
  ]);
  const cmp = comparePreviousPeriod(state, '2026-07', '2026-08-10');
  assert.equal(cmp.partial, false);
  assert.equal(cmp.diff, 500);
});

