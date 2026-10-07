import { test } from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const fresh = () => { globalThis.window = { localStorage: memoryStorage() }; };

const {
  parseMarket, symbolForAsset, refreshMarket, getCachedMarket, getMarketLog, isFresh, needsRefresh,
  MARKET_FRESH_MS, MARKET_MIN_INTERVAL_MS,
} = await import('../js/marketPrices.js');
const { assetPosition, portfolioSummary, marketPriceFor, priceObservations, portfolioHistory } = await import('../js/investments.js');

// Kaynağın gerçek biçimi (v4): sayısal Buying/Selling, ONS sıfır gelir.
const SAMPLE = {
  Update_Date: '2026-10-07 11:50:01',
  USD: { Buying: 49.19, Selling: 49.2, Type: 'Currency' },
  EUR: { Buying: 55.11, Selling: 55.12 },
  GRA: { Buying: 6526.09, Selling: 6527.04, Type: 'Gold' },
  CEYREKALTIN: { Buying: 10537.87, Selling: 10778.65 },
  ONS: { Buying: 0, Selling: 0 },
};
const okFetch = (body = SAMPLE) => async () => ({ ok: true, json: async () => body });

test('parseMarket - alış/satış alınır, sıfır ve eksik fiyatlar atılır', () => {
  const q = parseMarket(SAMPLE);
  assert.deepEqual(q.GRA, { buy: 6526.09, sell: 6527.04, change: null });
  assert.equal(q.USD.buy, 49.19);
  assert.equal('ONS' in q, false);
  assert.equal('GBP' in q, false, 'kaynakta olmayan sembol yok');
  assert.deepEqual(parseMarket(null), {});
  assert.deepEqual(parseMarket({ GRA: { Buying: 'abc' } }), {});
});

test('symbolForAsset - etiketten kaynak kodu, türe aykırı eşleşme yok', () => {
  assert.equal(symbolForAsset({ label: 'Gram altın', kind: 'altin' }), 'GRA');
  assert.equal(symbolForAsset({ label: 'Çeyrek altın' }), 'CEYREKALTIN');
  assert.equal(symbolForAsset({ label: 'Yarım altın' }), 'YARIMALTIN');
  assert.equal(symbolForAsset({ label: 'Dolar', kind: 'doviz' }), 'USD');
  assert.equal(symbolForAsset({ label: 'Euro' }), 'EUR');
  assert.equal(symbolForAsset({ label: 'Dolar fonu', kind: 'fon' }), null, 'fon döviz değildir');
  assert.equal(symbolForAsset({ label: 'THYAO', kind: 'hisse' }), null);
  assert.equal(symbolForAsset({ label: 'Bitcoin' }), null);
  assert.equal(symbolForAsset({}), null);
});

test('refreshMarket - başarılı çekim önbelleğe ve günlüğe yazılır', async () => {
  fresh();
  const now = Date.parse('2026-10-07T09:00:00.000Z');
  const res = await refreshMarket({ fetchImpl: okFetch(), nowMs: now });
  assert.equal(res.ok, true);
  assert.equal(getCachedMarket().quotes.GRA.buy, 6526.09);
  assert.equal(getCachedMarket().fetchedAt, new Date(now).toISOString());
  assert.deepEqual(getMarketLog().GRA, [{ d: '2026-10-07', p: 6526.09 }]);
});

test('refreshMarket - hata olursa eski önbellek bozulmaz ve ok=false döner', async () => {
  fresh();
  await refreshMarket({ fetchImpl: okFetch(), nowMs: Date.parse('2026-10-07T09:00:00.000Z') });
  const before = JSON.stringify(getCachedMarket());

  for (const bad of [
    async () => { throw new Error('network'); },
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ Update_Date: 'x' }) }),
    async () => ({ ok: true, json: async () => { throw new Error('json'); } }),
  ]) {
    const res = await refreshMarket({ fetchImpl: bad, nowMs: Date.parse('2026-10-07T10:00:00.000Z') });
    assert.equal(res.ok, false);
    assert.equal(JSON.stringify(res.market), before, 'eldeki önbellek döner');
    assert.equal(JSON.stringify(getCachedMarket()), before, 'önbellek yazılmadı');
  }
});

test('refreshMarket - fetch hiç yoksa çökmez', async () => {
  fresh();
  const res = await refreshMarket({ fetchImpl: null });
  assert.equal(res.ok, false);
  assert.equal(res.market, null);
});

test('isFresh / needsRefresh - eşikler', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');
  const at = (msAgo) => ({ fetchedAt: new Date(now - msAgo).toISOString(), quotes: {} });
  assert.equal(isFresh(at(MARKET_FRESH_MS - 1000), now), true);
  assert.equal(isFresh(at(MARKET_FRESH_MS + 1000), now), false);
  assert.equal(isFresh(null, now), false);
  assert.equal(needsRefresh(at(MARKET_MIN_INTERVAL_MS - 1000), now), false, '10 dk dolmadan tekrar çekilmez');
  assert.equal(needsRefresh(at(MARKET_MIN_INTERVAL_MS + 1000), now), true);
  assert.equal(needsRefresh(null, now), true);
});

// --- Hesaba etkisi -----------------------------------------------------------

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const market = { fetchedAt: '2026-10-07T11:00:00.000Z', quotes: { GRA: { buy: 6500, sell: 6510 } } };
const lots = [{ id: 'l1', assetId: 'a1', date: '2026-08-01', quantity: 2, unitCost: 6000 }];
const manual = { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 6200, priceUpdatedAt: '2026-09-01T10:00:00.000Z' };

test('piyasa fiyatı - kaynağı seçilmiş varlıkta alış fiyatı kullanılır, tahmini işaretlenir', () => {
  const p = assetPosition({ ...manual, priceSource: 'GRA' }, lots, NOW, market);
  assert.equal(p.price, 6500);
  assert.equal(p.value, 13000);
  assert.equal(p.profit, 1000);
  assert.equal(p.estimated, true);
  assert.equal(p.stale, false, 'piyasa fiyatı bugünkü; elle girilen eski tarih bayat saymaz');
});

test('piyasa fiyatı - kaynak seçilmemişse elle girilen fiyata dokunmaz (arkadaşın mevcut verisi)', () => {
  const p = assetPosition(manual, lots, NOW, market);
  assert.equal(p.price, 6200, 'priceSource yok → piyasa yok sayılır');
  assert.equal(p.estimated, false);
  // Piyasa hiç verilmediğinde de eskisiyle aynı:
  assert.equal(assetPosition(manual, lots, NOW).price, 6200);
});

test('piyasa fiyatı - önbellek bayatsa ya da sembol yoksa elle girilene düşer', () => {
  const old = { ...market, fetchedAt: '2026-10-01T11:00:00.000Z' }; // 6 gün
  assert.equal(assetPosition({ ...manual, priceSource: 'GRA' }, lots, NOW, old).price, 6200);
  assert.equal(assetPosition({ ...manual, priceSource: 'EUR' }, lots, NOW, market).price, 6200);
  assert.equal(marketPriceFor({ priceSource: 'GRA' }, null, NOW), null);
});

test('piyasa fiyatı - fiyatı hiç girilmemiş varlık da piyasadan değer alır', () => {
  const p = assetPosition({ id: 'a1', label: 'Gram altın', kind: 'altin', priceSource: 'GRA' }, lots, NOW, market);
  assert.equal(p.hasPrice, true);
  assert.equal(p.value, 13000);
});

test('portfolioSummary - tahmini varlık sayısı, toplamlar piyasa fiyatıyla', () => {
  const state = {
    assets: [{ ...manual, priceSource: 'GRA' }, { id: 'a2', label: 'Dolar', kind: 'doviz', unit: 'dolar', currentPrice: 40, priceUpdatedAt: '2026-10-06T10:00:00.000Z' }],
    investments: [...lots, { id: 'l2', assetId: 'a2', date: '2026-08-02', quantity: 100, unitCost: 38 }],
  };
  const s = portfolioSummary(state, NOW, market);
  assert.equal(s.estimatedCount, 1);
  assert.equal(s.totalValue, 13000 + 4000);
  // Piyasa verilmezse eski davranış:
  assert.equal(portfolioSummary(state, NOW).totalValue, 12400 + 4000);
});

test('geçmiş - piyasa günlüğü gözlem olur; son nokta piyasa fiyatlı özetle aynı', () => {
  const asset = { ...manual, priceSource: 'GRA' };
  const marketLog = { GRA: [{ d: '2026-09-15', p: 6350 }] };
  const obs = priceObservations(asset, lots, marketLog);
  assert.ok(obs.some((o) => o.date === '2026-09-15' && o.price === 6350));

  const state = { assets: [asset], investments: lots };
  const { points } = portfolioHistory(state, 'all', NOW, { market, marketLog });
  assert.equal(points[points.length - 1].value, 13000);
  const sep = points.find((pt) => pt.date >= '2026-09-15' && pt.date < '2026-09-30');
  assert.equal(sep.value, 2 * 6350, 'günlük gözlemi o günden itibaren kullanılır');
});

// --- Piyasa sayfası görünüm modeli -----------------------------------------

const { marketRows, convertToTry, MARKET_GROUPS } = await import('../js/marketPrices.js');

const rich = {
  fetchedAt: '2026-10-07T09:00:00.000Z',
  quotes: {
    USD: { buy: 49.19, sell: 49.2, change: 0.06 },
    EUR: { buy: 55.11, sell: 55.12, change: -0.52 },
    GRA: { buy: 6526.09, sell: 6527.04, change: -0.86 },
    CEYREKALTIN: { buy: 10537.87, sell: 10778.65, change: null },
  },
};

test('parseMarket - günlük değişim alınır, yoksa null', () => {
  const q = parseMarket({ GRA: { Buying: 6526, Selling: 6527, Change: -0.86 }, USD: { Buying: 49, Selling: 49.1 }, EUR: { Buying: 55, Selling: 55.1, Change: 0 } });
  assert.equal(q.GRA.change, -0.86);
  assert.equal(q.USD.change, null);
  assert.equal(q.EUR.change, 0, 'sıfır değişim null değildir');
});

test('marketRows - gruplar sırayla, yalnız fiyatı olan kalemler', () => {
  const groups = marketRows(rich);
  assert.deepEqual(groups.map((g) => g.key), MARKET_GROUPS.map((g) => g.key));
  const doviz = groups.find((g) => g.key === 'doviz');
  assert.deepEqual(doviz.items.map((i) => i.symbol), ['USD', 'EUR'], 'GBP kaynakta yok, listelenmez');
  const altin = groups.find((g) => g.key === 'altin');
  assert.deepEqual(altin.items.map((i) => i.symbol), ['GRA', 'CEYREKALTIN']);
  assert.equal(altin.items[0].unit, '1 gram');
  assert.equal(altin.items[1].unit, '1 adet');
});

test('marketRows - boş/eksik önbellekte boş döner', () => {
  assert.deepEqual(marketRows(null), []);
  assert.deepEqual(marketRows({ fetchedAt: 'x', quotes: {} }), []);
});

test('marketRows - cihazda biriken geçmiş seri olarak gelir (son 30)', () => {
  const log = { GRA: Array.from({ length: 45 }, (_, i) => ({ d: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`, p: 6000 + i })) };
  const gra = marketRows(rich, log).flatMap((g) => g.items).find((i) => i.symbol === 'GRA');
  assert.equal(gra.series.length, 30);
  assert.equal(gra.series[29].p, 6044);
});

test('marketRows - elindeki miktar yalnızca kaynağı seçilmiş ve elde olan varlıktan', () => {
  const positions = [
    { holding: true, quantity: 3, unit: 'gram', asset: { priceSource: 'GRA' } },
    { holding: true, quantity: 2, unit: 'gram', asset: { priceSource: 'GRA' } },
    { holding: true, quantity: 100, unit: 'dolar', asset: {} }, // kaynak seçilmemiş
    { holding: false, quantity: 0, unit: 'euro', asset: { priceSource: 'EUR' } },
  ];
  const items = marketRows(rich, {}, positions).flatMap((g) => g.items);
  const gra = items.find((i) => i.symbol === 'GRA');
  assert.equal(gra.held.quantity, 5);
  assert.equal(gra.held.value, 5 * 6526.09);
  assert.equal(items.find((i) => i.symbol === 'USD').held, null);
  assert.equal(items.find((i) => i.symbol === 'EUR').held, null);
});

test('convertToTry - miktar × alış; geçersiz girişte 0', () => {
  assert.equal(convertToTry(rich, 'USD', 100), 4919);
  assert.equal(convertToTry(rich, 'GRA', 2.5), 2.5 * 6526.09);
  assert.equal(convertToTry(rich, 'USD', 0), 0);
  assert.equal(convertToTry(rich, 'USD', 'abc'), 0);
  assert.equal(convertToTry(rich, 'XYZ', 5), 0);
  assert.equal(convertToTry(null, 'USD', 5), 0);
});
