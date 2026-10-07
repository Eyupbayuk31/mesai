import { test } from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
globalThis.window = { localStorage: memoryStorage() };

const { parseUsdRates, usdAt, latestUsdRate, needsUsdFetch, usdFetchFrom, refreshUsdRates, getCachedUsdRates } = await import('../js/usdRates.js');
const { portfolioUsd, portfolioSummary } = await import('../js/investments.js');

test('usdFetchFrom - yalnız yıl sızar: önceki yılın 20 Aralığı', () => {
  assert.equal(usdFetchFrom('2026-06-10'), '2025-12-20');
  assert.equal(usdFetchFrom('2026-01-02'), '2025-12-20');
  assert.equal(usdFetchFrom('x'), null);
  assert.equal(usdFetchFrom(undefined), null);
});

test('parseUsdRates - geçerli kurlar alınır, sıfır/bozuk atılır', () => {
  const r = parseUsdRates({ rates: { '2026-08-03': { TRY: 47.5 }, '2026-08-04': { TRY: 0 }, bozuk: { TRY: 40 }, '2026-08-05': { EUR: 1 } } });
  assert.deepEqual(r, { '2026-08-03': 47.5 });
  assert.deepEqual(parseUsdRates(null), {});
});

test('usdAt - hafta sonu son iş günü kuru, öncesinde veri yoksa null', () => {
  const rates = { '2026-08-07': 47.7, '2026-08-10': 47.7, '2026-08-03': 47.5 };
  assert.equal(usdAt(rates, '2026-08-08'), 47.7, 'cumartesi → cuma');
  assert.equal(usdAt(rates, '2026-08-03'), 47.5);
  assert.equal(usdAt(rates, '2026-08-02'), null);
  assert.equal(latestUsdRate(rates), 47.7);
  assert.equal(latestUsdRate({}), null);
});

test('needsUsdFetch - önbellek yok / daha geç başlıyor / 6 saatten eski', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');
  const fresh = { from: '2025-12-20', fetchedAt: new Date(now - 3600000).toISOString(), rates: {} };
  assert.equal(needsUsdFetch(null, '2025-12-20', now), true);
  assert.equal(needsUsdFetch(fresh, '2025-12-20', now), false);
  assert.equal(needsUsdFetch(fresh, '2024-12-20', now), true, 'daha eski alım eklendi');
  assert.equal(needsUsdFetch({ ...fresh, fetchedAt: new Date(now - 7 * 3600000).toISOString() }, '2025-12-20', now), true);
  assert.equal(needsUsdFetch(null, null, now), false, 'alım yoksa çekilmez');
});

test('refreshUsdRates - başarıda önbellek yazılır, hatada eskisi korunur', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ rates: { '2026-10-06': { TRY: 49.0 } } }) });
  const res = await refreshUsdRates({ from: '2025-12-20', fetchImpl: ok, nowMs: Date.parse('2026-10-07T09:00:00.000Z') });
  assert.equal(res.ok, true);
  assert.equal(getCachedUsdRates().rates['2026-10-06'], 49);
  const before = JSON.stringify(getCachedUsdRates());
  for (const bad of [async () => { throw new Error('x'); }, async () => ({ ok: false, status: 500 }), async () => ({ ok: true, json: async () => ({ rates: {} }) })]) {
    const r = await refreshUsdRates({ from: '2025-12-20', fetchImpl: bad });
    assert.equal(r.ok, false);
    assert.equal(JSON.stringify(getCachedUsdRates()), before);
  }
  assert.equal((await refreshUsdRates({ from: null })).ok, false);
});

// --- Dolar bazında getiri ---------------------------------------------------------

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const rates = { '2026-01-01': 40, '2026-06-01': 45, '2026-10-06': 50 };
const gold = { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 7500, priceUpdatedAt: '2026-10-06T10:00:00.000Z' };
const buy = (id, date, quantity, unitCost) => ({ id, assetId: 'a1', date, quantity, unitCost });

test('portfolioUsd - lirada kâr, dolarda zarar olabilir (liranın değer kaybı)', () => {
  // 1 gram 6.000 TL'ye alındı (kur 40 → 150 $); bugün 7.500 TL (kur 50 → 150 $). TL'de +%25, dolarda 0.
  const st = { assets: [gold], investments: [buy('l1', '2026-01-01', 1, 6000)] };
  const tl = portfolioSummary(st, NOW);
  assert.equal(Math.round(tl.profitPct), 25);
  const usd = portfolioUsd(st, rates, NOW);
  assert.ok(Math.abs(usd.cost - 150) < 1e-9);
  assert.ok(Math.abs(usd.value - 150) < 1e-9);
  assert.ok(Math.abs(usd.profitPct) < 1e-9, 'dolarda getiri yok');
  assert.equal(usd.rateNow, 50);
});

test('portfolioUsd - alımlar kendi günlerinin kuruyla çevrilir, ortalama dolar maliyet çıkar', () => {
  const st = { assets: [gold], investments: [buy('l1', '2026-01-01', 1, 6000), buy('l2', '2026-06-15', 1, 6750)] };
  // 150 $ + 150 $ = 300 $ maliyet; değer 2 × 7.500 / 50 = 300 $.
  const usd = portfolioUsd(st, rates, NOW);
  assert.ok(Math.abs(usd.cost - 300) < 1e-9);
  assert.ok(Math.abs(usd.value - 300) < 1e-9);
});

test('portfolioUsd - satış: gerçekleşen kâr dolar cinsinden', () => {
  const st = { assets: [gold], investments: [buy('l1', '2026-01-01', 2, 6000), { id: 's1', assetId: 'a1', date: '2026-06-01', quantity: 1, unitCost: 9000, side: 'sell' }] };
  // maliyet 150 $/gram; satış 9.000/45 = 200 $/gram → +50 $ gerçekleşen. Kalan 1 gram: 150 $ maliyet, değer 150 $.
  const usd = portfolioUsd(st, rates, NOW);
  assert.ok(Math.abs(usd.realized - 50) < 1e-9);
  assert.ok(Math.abs(usd.cost - 150) < 1e-9);
});

test('portfolioUsd - kuru bilinmeyen güne ait alım varsa hesap yok (yanlış rakam göstermez)', () => {
  const st = { assets: [gold], investments: [buy('l1', '2025-03-01', 1, 3000)] };
  assert.equal(portfolioUsd(st, rates, NOW), null);
  assert.equal(portfolioUsd(st, {}, NOW), null);
  assert.equal(portfolioUsd({ assets: [], investments: [] }, rates, NOW).cost, 0);
});

test('portfolioUsd - piyasa fiyatı (tahmini) kullanılıyorsa onu dolara çevirir', () => {
  const asset = { ...gold, priceSource: 'GRA', currentPrice: 7000 };
  const market = { fetchedAt: '2026-10-07T10:00:00.000Z', quotes: { GRA: { buy: 7500, sell: 7510 } } };
  const st = { assets: [asset], investments: [buy('l1', '2026-01-01', 1, 6000)] };
  const usd = portfolioUsd(st, rates, NOW, market);
  assert.ok(Math.abs(usd.value - 150) < 1e-9, '7.500 / 50 (elle girilen 7.000 değil)');
});
