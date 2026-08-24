import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
globalThis.localStorage = makeMemoryLocalStorage();
globalThis.window = { localStorage: globalThis.localStorage };

const { mergeStates, syncFingerprint } = await import('../js/sync/merge.js');

const T = (h) => new Date(Date.UTC(2026, 7, 21, h, 0, 0)).toISOString();
const NOW = Date.UTC(2026, 7, 21, 23, 0, 0);

const entry = (id, hours, updatedAt) => ({ id, date: '2026-08-14', hours, type: 'normal', createdAt: T(1), updatedAt });

function state(over = {}) {
  return {
    settings: { monthlySalary: 35000 },
    settingsUpdatedAt: null,
    entries: [], expenses: [], recurring: [], adjustments: [],
    tombstones: { entries: {}, expenses: {}, recurring: {}, adjustments: {} },
    ...over,
  };
}

test('merge - iki cihazda ayrı ayrı girilen kayıtlar BİRLEŞİR (hiçbiri kaybolmaz)', () => {
  const local = state({ entries: [entry('a', 3, T(9))] });
  const remote = state({ entries: [entry('b', 2, T(10))] });
  const { merged, changedLocal, changedRemote } = mergeStates(local, remote, NOW);
  assert.deepEqual(merged.entries.map((e) => e.id), ['a', 'b']);
  assert.equal(changedLocal, true, 'yerelde b eksikti');
  assert.equal(changedRemote, true, 'bulutta a eksikti');
});

test('merge - aynı kaydın iki sürümünde en son değişen kazanır', () => {
  const local = state({ entries: [entry('a', 3, T(9))] });
  const remote = state({ entries: [entry('a', 5, T(11))] });
  assert.equal(mergeStates(local, remote, NOW).merged.entries[0].hours, 5);
  assert.equal(mergeStates(remote, local, NOW).merged.entries[0].hours, 5, 'yön fark etmemeli');
});

test('merge - silinen kayıt diğer cihazdan geri GELMEZ', () => {
  // Telefon sildi (mezar taşı), PC'de kayıt hâlâ duruyor ve daha eski.
  const phone = state({ tombstones: { entries: { a: T(12) }, expenses: {}, recurring: {}, adjustments: {} } });
  const pc = state({ entries: [entry('a', 3, T(9))] });
  const { merged } = mergeStates(pc, phone, NOW);
  assert.equal(merged.entries.length, 0, 'silinmiş kayıt dirilmemeli');
  assert.ok(merged.tombstones.entries.a, 'mezar taşı korunmalı');
});

test('merge - silmeden SONRA düzenlenen kayıt yaşar', () => {
  const phone = state({ tombstones: { entries: { a: T(9) }, expenses: {}, recurring: {}, adjustments: {} } });
  const pc = state({ entries: [entry('a', 3, T(12))] });
  const { merged } = mergeStates(pc, phone, NOW);
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.tombstones.entries.a, undefined, 'kayıt döndüyse taş kalkmalı');
});

test('merge - updatedAt yoksa createdAt kullanılır (eski yedekler)', () => {
  const local = state({ entries: [{ id: 'a', hours: 1, createdAt: T(8) }] });
  const remote = state({ entries: [{ id: 'a', hours: 9, createdAt: T(15) }] });
  assert.equal(mergeStates(local, remote, NOW).merged.entries[0].hours, 9);
});

test('merge - ayarlar tek parça: en son yazan taraf alınır', () => {
  const local = state({ settings: { monthlySalary: 35000 }, settingsUpdatedAt: T(9) });
  const remote = state({ settings: { monthlySalary: 42000 }, settingsUpdatedAt: T(14) });
  assert.equal(mergeStates(local, remote, NOW).merged.settings.monthlySalary, 42000);
  assert.equal(mergeStates(remote, local, NOW).merged.settings.monthlySalary, 42000);
});

test('merge - bulutta ayar damgası yoksa yerel ayarlar korunur', () => {
  const local = state({ settings: { monthlySalary: 35000 }, settingsUpdatedAt: T(9) });
  const remote = state({ settings: { monthlySalary: 0 } });
  assert.equal(mergeStates(local, remote, NOW).merged.settings.monthlySalary, 35000);
});

test('merge - çok eski mezar taşları düşürülür (sonsuza kadar birikmez)', () => {
  const old = new Date(NOW - 200 * 86400000).toISOString();
  const local = state({ tombstones: { entries: { eski: old }, expenses: {}, recurring: {}, adjustments: {} } });
  const { merged } = mergeStates(local, state(), NOW);
  assert.equal(merged.tombstones.entries.eski, undefined);
});

test('merge - değişiklik yoksa hiçbir yön "değişti" demez (boşuna yazma olmaz)', () => {
  const a = state({ entries: [entry('a', 3, T(9))] });
  const b = state({ entries: [entry('a', 3, T(9))] });
  const res = mergeStates(a, b, NOW);
  assert.equal(res.changedLocal, false);
  assert.equal(res.changedRemote, false);
});

test('merge - anahtar sırası değişikliği "fark" sayılmaz', () => {
  const a = state({ entries: [{ id: 'a', hours: 3, date: '2026-08-14', updatedAt: T(9) }] });
  const b = state({ entries: [{ date: '2026-08-14', updatedAt: T(9), id: 'a', hours: 3 }] });
  assert.equal(syncFingerprint(a), syncFingerprint(b));
});

test('merge - tekrar birleştirmek sonucu değiştirmez (kararlı)', () => {
  const local = state({ entries: [entry('a', 3, T(9))], tombstones: { entries: { z: T(10) }, expenses: {}, recurring: {}, adjustments: {} } });
  const remote = state({ entries: [entry('b', 2, T(11))] });
  const once = mergeStates(local, remote, NOW).merged;
  const twice = mergeStates(once, once, NOW).merged;
  assert.equal(syncFingerprint(once), syncFingerprint(twice));
});

test('merge - bulutta hiç yedek yoksa yerel olduğu gibi gönderilir', () => {
  const local = state({ entries: [entry('a', 3, T(9))] });
  const res = mergeStates(local, null, NOW);
  assert.equal(res.merged, local);
  assert.equal(res.changedRemote, true);
  assert.equal(res.changedLocal, false);
});

test('merge - harcama, sürekli gider ve ek kalemler de birleşir', () => {
  const local = state({
    expenses: [{ id: 'x1', amount: 100, updatedAt: T(9) }],
    recurring: [{ id: 'r1', label: 'kira', updatedAt: T(9) }],
    adjustments: [{ id: 'j1', amount: 50, updatedAt: T(9) }],
  });
  const remote = state({
    expenses: [{ id: 'x2', amount: 200, updatedAt: T(10) }],
    recurring: [{ id: 'r2', label: 'internet', updatedAt: T(10) }],
    adjustments: [{ id: 'j2', amount: 70, updatedAt: T(10) }],
  });
  const { merged } = mergeStates(local, remote, NOW);
  assert.deepEqual(merged.expenses.map((e) => e.id), ['x1', 'x2']);
  assert.deepEqual(merged.recurring.map((r) => r.id), ['r1', 'r2']);
  assert.deepEqual(merged.adjustments.map((a) => a.id), ['j1', 'j2']);
});

// --- Yatırım koleksiyonları --------------------------------------------

test('merge - yatırım alımları ve varlıklar iki cihazda birleşir', () => {
  const local = state({
    assets: [{ id: 'a1', label: 'Gram altın', currentPrice: 7900, updatedAt: T(9) }],
    investments: [{ id: 'i1', assetId: 'a1', date: '2026-08-01', quantity: 1, unitCost: 7100, updatedAt: T(9) }],
  });
  const remote = state({
    assets: [{ id: 'a2', label: 'THYAO', currentPrice: 300, updatedAt: T(10) }],
    investments: [{ id: 'i2', assetId: 'a2', date: '2026-08-05', quantity: 100, unitCost: 280, updatedAt: T(10) }],
  });
  const { merged } = mergeStates(local, remote, NOW);
  assert.deepEqual(merged.assets.map((a) => a.id), ['a1', 'a2']);
  assert.deepEqual(merged.investments.map((i) => i.id), ['i1', 'i2']);
});

test('merge - telefonda güncellenen fiyat PC kaydının üstüne yazar', () => {
  const eski = { id: 'a1', label: 'Gram altın', currentPrice: 7400, updatedAt: T(9) };
  const yeni = { ...eski, currentPrice: 7900, updatedAt: T(11) };
  const { merged } = mergeStates(state({ assets: [eski] }), state({ assets: [yeni] }), NOW);
  assert.equal(merged.assets[0].currentPrice, 7900);
});

test('merge - silinen alım diğer cihazda geri gelmez', () => {
  const lot = { id: 'i1', assetId: 'a1', date: '2026-08-01', quantity: 1, unitCost: 7100, updatedAt: T(9) };
  const local = state({ investments: [], tombstones: { investments: { i1: T(12) } } });
  const remote = state({ investments: [lot] });
  const { merged } = mergeStates(local, remote, NOW);
  assert.deepEqual(merged.investments, []);
});
