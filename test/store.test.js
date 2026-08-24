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

// --- Mola varsayılanı ---------------------------------------------------

test('Store - mola düşme varsayılan olarak kapalı (18:00-21:00 = 3 saat)', () => {
  const store = freshStore();
  assert.equal(store.getState().settings.breakWindow.enabled, false);
});

test('Store - eski kayıtta açık kalan mola bir kereliğine kapatılır', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state', JSON.stringify({
    schemaVersion: 1,
    settings: { monthlySalary: 45000, breakWindow: { enabled: true, start: '18:30', end: '19:00' } },
    entries: [],
  }));
  const store = new Store();
  assert.equal(store.getState().settings.breakWindow.enabled, false);
  assert.equal(store.getState().settings.monthlySalary, 45000, 'diğer ayarlar korunur');
  assert.equal(store.getState().settings.breakWindow.start, '18:30', 'saatler korunur');
});

test('Store - şema 2 olduktan sonra elle açılan mola kapatılmaz', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state', JSON.stringify({
    schemaVersion: 2,
    settings: { breakWindow: { enabled: true, start: '12:00', end: '12:30' } },
    entries: [],
  }));
  const store = new Store();
  assert.equal(store.getState().settings.breakWindow.enabled, true);
});

// --- Yatırım defteri ----------------------------------------------------

test('Store - varlık ve alım eklenir, ortalama maliyet için lotlar ayrı durur', () => {
  const store = freshStore();
  const asset = store.addAsset({ label: 'Gram altın', unit: 'gram', color: '#d4a017' });
  store.addInvestment({ assetId: asset.id, date: '2026-06-10', quantity: 1, unitCost: 7100 });
  store.addInvestment({ assetId: asset.id, date: '2026-07-12', quantity: 1, unitCost: 7400 });

  const s = store.getState();
  assert.equal(s.assets.length, 1);
  assert.equal(s.investments.length, 2);
  assert.equal(s.investments[0].unitCost, 7100);
});

test('Store - setAssetPrice fiyatı ve güncelleme zamanını yazar', () => {
  const store = freshStore();
  const asset = store.addAsset({ label: 'THYAO', unit: 'lot' });
  store.setAssetPrice(asset.id, 305.5);
  const saved = store.getState().assets[0];
  assert.equal(saved.currentPrice, 305.5);
  assert.ok(saved.priceUpdatedAt, 'fiyat tarihi yazılmalı');
});

test('Store - varlık silinince alımları da silinir (yetim lot kalmaz)', () => {
  const store = freshStore();
  const a = store.addAsset({ label: 'Gram altın' });
  const b = store.addAsset({ label: 'THYAO' });
  const lotA = store.addInvestment({ assetId: a.id, date: '2026-06-10', quantity: 1, unitCost: 7100 });
  store.addInvestment({ assetId: b.id, date: '2026-08-01', quantity: 10, unitCost: 300 });

  store.removeAsset(a.id);
  const s = store.getState();
  assert.deepEqual(s.assets.map((x) => x.label), ['THYAO']);
  assert.equal(s.investments.length, 1, 'yalnız THYAO alımı kalmalı');
  assert.ok(s.tombstones.investments[lotA.id], 'silinen alım için mezar taşı bırakılır');
  assert.ok(s.tombstones.assets[a.id]);
});

test('Store - alım güncellenir ve silinir', () => {
  const store = freshStore();
  const a = store.addAsset({ label: 'Gram altın' });
  const lot = store.addInvestment({ assetId: a.id, date: '2026-06-10', quantity: 1, unitCost: 7100 });
  store.updateInvestment(lot.id, { quantity: 2 });
  assert.equal(store.getState().investments[0].quantity, 2);
  store.removeInvestment(lot.id);
  assert.equal(store.getState().investments.length, 0);
  assert.ok(store.getState().tombstones.investments[lot.id]);
});

// --- v3: varlık türleri -------------------------------------------------

test('Store - eski "Dolar / adet" kaydı döviz türüne taşınır', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state', JSON.stringify({
    schemaVersion: 2,
    settings: {},
    entries: [],
    assets: [
      { id: 'a1', label: 'Dolar', unit: 'adet', currentPrice: 41.5 },
      { id: 'a2', label: 'Gram altın', unit: 'gram', currentPrice: 7900 },
      { id: 'a3', label: 'Çeyrek altın', unit: 'adet' },
      { id: 'a4', label: 'Bitcoin', unit: 'adet' },
    ],
    investments: [{ id: 'l1', assetId: 'a1', date: '2026-05-20', quantity: 500, unitCost: 39 }],
  }));
  const s = new Store().getState();
  const by = (label) => s.assets.find((a) => a.label === label);

  assert.equal(by('Dolar').kind, 'doviz');
  assert.equal(by('Dolar').unit, 'dolar', 'genel "adet" birimi türün birimine çevrilir');
  assert.equal(by('Gram altın').kind, 'altin');
  assert.equal(by('Gram altın').unit, 'gram');
  assert.equal(by('Çeyrek altın').kind, 'altin');
  assert.equal(by('Çeyrek altın').unit, 'adet', 'çeyrek altın gerçekten adettir, bozulmaz');
  assert.equal(by('Bitcoin').kind, 'kripto');
  assert.equal(by('Bitcoin').unit, 'BTC');

  assert.deepEqual(s.investments[0], { id: 'l1', assetId: 'a1', date: '2026-05-20', quantity: 500, unitCost: 39 },
    'alım kayıtlarına dokunulmaz');
});

test('Store - elle yazılmış birim korunur', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state', JSON.stringify({
    schemaVersion: 2, settings: {}, entries: [],
    assets: [{ id: 'a1', label: 'Dolar', unit: 'USD' }],
  }));
  const asset = new Store().getState().assets[0];
  assert.equal(asset.unit, 'USD');
  assert.equal(asset.kind, 'doviz');
});

test('Store - kaydında türü olan varlığa dokunulmaz', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state', JSON.stringify({
    schemaVersion: 2, settings: {}, entries: [],
    assets: [{ id: 'a1', label: 'Dolar', unit: 'adet', kind: 'diger' }],
  }));
  const asset = new Store().getState().assets[0];
  assert.equal(asset.kind, 'diger');
  assert.equal(asset.unit, 'adet');
});

test('Store - yeni varlıkta tür kaydedilir', () => {
  const store = freshStore();
  const a = store.addAsset({ label: 'Euro', kind: 'doviz', unit: 'euro' });
  assert.equal(store.getState().assets[0].kind, 'doviz');
  assert.equal(a.unit, 'euro');
});
