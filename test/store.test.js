import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage + window mock (jsdom yok, saf JS mock yeterli)
function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const { Store } = await import('../js/store.js');

// Her test kendi izole localStorage'ıyla başlar ki testler birbirini etkilemesin.
function freshStore() {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  return new Store();
}

test('Store - varsayılan durum boş', () => {
  const store = freshStore();
  const s = store.getState();
  assert.equal(s.entries.length, 0);
  assert.equal(s.settings.monthlySalary, 0);
  assert.equal(s.settings.hoursDivisor, 225);
});

test('Store - varsayılan haftalık program: hafta içi 08:30-18:00, cmt kısa, paz kapalı', () => {
  const store = freshStore();
  const schedule = store.getState().settings.weeklySchedule;
  assert.equal(schedule[1].works, true);
  assert.equal(schedule[1].start, '08:30');
  assert.equal(schedule[1].end, '18:00');
  assert.equal(schedule[6].end, '12:45');
  assert.equal(schedule[0].works, false);
});

test('Store - weeklySchedule kısmi güncellemede diğer günler korunur', () => {
  const store = freshStore();
  store.updateSettings({
    weeklySchedule: { ...store.getState().settings.weeklySchedule, 0: { works: true, start: '10:00', end: '14:00' } },
  });
  const schedule = store.getState().settings.weeklySchedule;
  assert.equal(schedule[0].works, true);
  assert.equal(schedule[1].start, '08:30'); // dokunulmayan gün varsayılanda kalır
});

test('Store - addEntry ve kalıcılık', () => {
  const store = freshStore();
  const rec = store.addEntry({ date: '2026-08-14', hours: 3.5, type: 'normal' });
  assert.ok(rec.id);
  assert.equal(store.getState().entries.length, 1);

  // Yeni store örneği aynı localStorage'ı okumalı
  const store2 = new Store();
  assert.equal(store2.getState().entries.length, 1);
  assert.equal(store2.getState().entries[0].hours, 3.5);
});

test('Store - updateEntry ve removeEntry', () => {
  const store = freshStore();
  const rec = store.addEntry({ date: '2026-08-14', hours: 3, type: 'normal' });
  store.updateEntry(rec.id, { hours: 5 });
  assert.equal(store.getState().entries[0].hours, 5);
  store.removeEntry(rec.id);
  assert.equal(store.getState().entries.length, 0);
});

test('Store - updateSettings kısmi günceller, eksik alanlar varsayılana düşer', () => {
  const store = freshStore();
  store.updateSettings({ monthlySalary: 45000 });
  const s = store.getState().settings;
  assert.equal(s.monthlySalary, 45000);
  assert.equal(s.hoursDivisor, 225); // dokunulmadı, varsayılan korunur
});

test('Store - adjustments ekle/sil', () => {
  const store = freshStore();
  const adj = store.addAdjustment({ periodKey: '2026-08', kind: 'advance', amount: 1000 });
  assert.equal(store.getState().adjustments.length, 1);
  store.removeAdjustment(adj.id);
  assert.equal(store.getState().adjustments.length, 0);
});

test('Store - validateImport doğru/bozuk veriyi ayırt eder', () => {
  const store = freshStore();
  assert.equal(store.validateImport(null).valid, false);
  assert.equal(store.validateImport({}).valid, false);
  const result = store.validateImport({ entries: [{ id: '1' }], adjustments: [], settings: {} });
  assert.equal(result.valid, true);
  assert.equal(result.entryCount, 1);
});

test('Store - localStorage yazılamazsa bellek fallback ile çalışmaya devam eder', () => {
  const brokenLS = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  globalThis.window = { localStorage: brokenLS };
  const store = new Store();
  assert.equal(store.available, false);
  // Yazma patlamamalı, durum bellekte güncellenmeli
  store.addEntry({ date: '2026-08-14', hours: 2, type: 'normal' });
  assert.equal(store.getState().entries.length, 1);
  // Testin geri kalanını bozmamak için gerçek mock'a geri dön
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
});

test('Store - profiller birbirinden izole, aynı anahtar altında karışmaz', () => {
  const sharedLS = makeMemoryLocalStorage();
  globalThis.window = { localStorage: sharedLS };
  const eyupStore = new Store('eyup');
  eyupStore.addEntry({ date: '2026-08-14', hours: 3, type: 'normal' });

  const fuatStore = new Store('fuat');
  fuatStore.addEntry({ date: '2026-08-15', hours: 5, type: 'normal' });

  assert.equal(eyupStore.getState().entries.length, 1);
  assert.equal(fuatStore.getState().entries.length, 1);
  assert.equal(eyupStore.getState().entries[0].hours, 3);
  assert.equal(fuatStore.getState().entries[0].hours, 5);

  // Aynı profille açılan yeni bir Store örneği kendi verisini görmeli
  const eyupStoreAgain = new Store('eyup');
  assert.equal(eyupStoreAgain.getState().entries.length, 1);
  assert.equal(eyupStoreAgain.getState().entries[0].hours, 3);
});

test('Store - profil sistemi öncesi eski (tek kullanıcılı) veri ilk profile bir kerelik taşınır', () => {
  const sharedLS = makeMemoryLocalStorage();
  globalThis.window = { localStorage: sharedLS };

  // Eski sürümde profilsiz kaydedilmiş veri
  const legacyStore = new Store();
  legacyStore.addEntry({ date: '2026-08-01', hours: 2, type: 'normal' });
  legacyStore.updateSettings({ monthlySalary: 40000 });

  // Profil sistemine geçince ilk açılan profil bu veriyi devralır
  const eyupStore = new Store('eyup');
  assert.equal(eyupStore.getState().entries.length, 1);
  assert.equal(eyupStore.getState().settings.monthlySalary, 40000);

  // Eski anahtar da bozulmadan durur
  assert.ok(sharedLS.getItem('mesai.state'));
});
