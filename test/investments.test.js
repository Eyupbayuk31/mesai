import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assetPosition, portfolioSummary, donutSlices, investedInPeriod, investedInYear,
  assetLots, lotTotal, nextAssetColor, DONUT_RADIUS, STALE_DAYS,
} from '../js/investments.js';

const NOW = Date.parse('2026-08-24T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const altin = { id: 'a1', label: 'Gram altın', unit: 'gram', color: '#d4a017', currentPrice: 7900, priceUpdatedAt: daysAgo(1) };
const lots = [
  { id: 'i1', assetId: 'a1', date: '2026-06-10', quantity: 1, unitCost: 7100 },
  { id: 'i2', assetId: 'a1', date: '2026-07-12', quantity: 1, unitCost: 7400 },
];

test('assetPosition - farklı fiyatlardan alımda ortalama maliyet', () => {
  const p = assetPosition(altin, lots, NOW);
  assert.equal(p.quantity, 2);
  assert.equal(p.cost, 14500);
  assert.equal(p.avgCost, 7250);
  assert.equal(p.value, 15800);       // 2 × 7900
  assert.equal(p.profit, 1300);
  assert.equal(Math.round(p.profitPct * 100) / 100, 8.97);
});

test('assetPosition - küsuratlı miktar (yarım gram) doğru hesaplanır', () => {
  const p = assetPosition(altin, [{ id: 'x', assetId: 'a1', quantity: 0.5, unitCost: 7000 }], NOW);
  assert.equal(p.cost, 3500);
  assert.equal(p.avgCost, 7000);
  assert.equal(p.value, 3950);
});

test('assetPosition - fiyat girilmemişse uydurma kâr yok', () => {
  const p = assetPosition({ id: 'a1', label: 'Hisse' }, lots, NOW);
  assert.equal(p.hasPrice, false);
  assert.equal(p.value, p.cost, 'değer maliyete eşit sayılır');
  assert.equal(p.profit, 0);
  assert.equal(p.profitPct, 0);
});

test('assetPosition - hiç alım yoksa sıfıra bölme yok', () => {
  const p = assetPosition(altin, [], NOW);
  assert.equal(p.quantity, 0);
  assert.equal(p.avgCost, 0);
  assert.equal(p.profitPct, 0);
});

test('assetPosition - fiyat eskiyse stale işaretlenir', () => {
  const taze = assetPosition({ ...altin, priceUpdatedAt: daysAgo(2) }, lots, NOW);
  assert.equal(taze.stale, false);
  const bayat = assetPosition({ ...altin, priceUpdatedAt: daysAgo(STALE_DAYS + 2) }, lots, NOW);
  assert.equal(bayat.stale, true);
  assert.equal(bayat.staleDays, STALE_DAYS + 2);
});

const state = {
  assets: [
    altin,
    { id: 'a2', label: 'THYAO', unit: 'lot', color: '#8447b5', currentPrice: 300, priceUpdatedAt: daysAgo(1) },
    { id: 'a3', label: 'Satılmış', unit: 'adet', color: '#111' }, // hiç alımı yok
  ],
  investments: [
    ...lots,
    { id: 'i3', assetId: 'a2', date: '2026-08-03', quantity: 100, unitCost: 280 },
  ],
};

test('portfolioSummary - toplamlar pozisyon toplamlarına eşit', () => {
  const s = portfolioSummary(state, NOW);
  assert.equal(s.positions.length, 3, 'alımı olmayan varlık da kartını korur');
  assert.equal(s.assetCount, 2, 'ama portföy sayımına girmez');
  assert.equal(s.emptyCount, 1);
  assert.equal(s.totalCost, s.positions.reduce((t, p) => t + p.cost, 0));
  assert.equal(s.totalValue, s.positions.reduce((t, p) => t + p.value, 0));
  assert.equal(s.totalCost, 14500 + 28000);
  assert.equal(s.totalValue, 15800 + 30000);
  assert.equal(s.totalProfit, 3300);
  assert.equal(s.totalValue - s.totalCost, s.totalProfit);
});

test('portfolioSummary - pozisyonlar değere göre büyükten küçüğe', () => {
  const s = portfolioSummary(state, NOW);
  assert.deepEqual(s.positions.map((p) => p.label), ['THYAO', 'Gram altın', 'Satılmış']);
});

test('portfolioSummary - boş portföyde sıfıra bölme yok', () => {
  const s = portfolioSummary({ assets: [], investments: [] }, NOW);
  assert.equal(s.totalValue, 0);
  assert.equal(s.profitPct, 0);
  assert.equal(s.assetCount, 0);
});

test('portfolioSummary - fiyatı girilmemiş varlık sayılır', () => {
  const s = portfolioSummary({
    assets: [{ id: 'a1', label: 'Fon' }],
    investments: [{ id: 'i1', assetId: 'a1', quantity: 10, unitCost: 100 }],
  }, NOW);
  assert.equal(s.missingPrice, 1);
  assert.equal(s.totalValue, 1000);
  assert.equal(s.totalProfit, 0);
});

test('donutSlices - yüzdeler toplamı 100, dilimler çevreyi tam kaplar', () => {
  const slices = donutSlices(portfolioSummary(state, NOW).positions);
  const pctSum = slices.reduce((t, s) => t + s.pct, 0);
  assert.ok(Math.abs(pctSum - 100) < 1e-9, `yüzde toplamı ${pctSum}`);

  const circumference = 2 * Math.PI * DONUT_RADIUS;
  const dashSum = slices.reduce((t, s) => t + s.dash, 0);
  assert.ok(Math.abs(dashSum - circumference) < 1e-9, 'dilimler daireyi tam doldurmalı');
});

test('donutSlices - dilimler boşluksuz sıralanır', () => {
  const slices = donutSlices(portfolioSummary(state, NOW).positions);
  let used = 0;
  for (const slice of slices) {
    assert.ok(Math.abs(slice.offset + used) < 1e-9, 'her dilim bir öncekinin bittiği yerden başlar');
    used += slice.dash;
    assert.ok(Math.abs(slice.dash + slice.gap - 2 * Math.PI * DONUT_RADIUS) < 1e-9);
  }
});

test('donutSlices - değer yoksa boş dizi (bölme hatası değil)', () => {
  assert.deepEqual(donutSlices([]), []);
  assert.deepEqual(donutSlices([{ label: 'x', value: 0 }]), []);
});

test('investedInPeriod / investedInYear', () => {
  assert.equal(investedInPeriod(state, '2026-06'), 7100);
  assert.equal(investedInPeriod(state, '2026-07'), 7400);
  assert.equal(investedInPeriod(state, '2026-08'), 28000);
  assert.equal(investedInPeriod(state, '2026-09'), 0);
  assert.equal(investedInYear(state, 2026), 42500);
  assert.equal(investedInYear(state, 2025), 0);
});

test('assetLots - yalnız o varlığın alımları, yeniden eskiye', () => {
  const rows = assetLots(state, 'a1');
  assert.deepEqual(rows.map((r) => r.id), ['i2', 'i1']);
  assert.equal(lotTotal(rows[0]), 7400);
});

test('nextAssetColor - kullanılmamış renk seçer', () => {
  const first = nextAssetColor([]);
  const second = nextAssetColor([{ color: first }]);
  assert.notEqual(first, second);
});

// --- Alım = fiyat gözlemi ------------------------------------------------

import { priceUpdateFromLot, suggestedUnitCost } from '../js/investments.js';

test('priceUpdateFromLot - yeni alım güncel fiyatı da günceller', () => {
  const asset = { id: 'a1', currentPrice: 7400, priceUpdatedAt: '2026-07-12T12:00:00.000Z' };
  const res = priceUpdateFromLot(asset, { date: '2026-08-24', quantity: 1, unitCost: 7900 });
  assert.equal(res.currentPrice, 7900);
  assert.equal(res.priceUpdatedAt.slice(0, 10), '2026-08-24');
});

test('priceUpdateFromLot - fiyatı hiç girilmemiş varlıkta ilk alım fiyatı belirler', () => {
  const res = priceUpdateFromLot({ id: 'a1' }, { date: '2026-08-24', quantity: 1, unitCost: 7100 });
  assert.equal(res.currentPrice, 7100);
});

test('priceUpdateFromLot - geçmişe dönük alım güncel fiyatı BOZMAZ', () => {
  const asset = { id: 'a1', currentPrice: 7900, priceUpdatedAt: '2026-08-23T12:00:00.000Z' };
  assert.equal(priceUpdateFromLot(asset, { date: '2026-06-10', quantity: 1, unitCost: 7100 }), null);
});

test('priceUpdateFromLot - fiyat zaten aynıysa boşuna yazmaz', () => {
  const asset = { id: 'a1', currentPrice: 7900, priceUpdatedAt: '2026-08-01T12:00:00.000Z' };
  assert.equal(priceUpdateFromLot(asset, { date: '2026-08-24', quantity: 1, unitCost: 7900 }), null);
});

test('priceUpdateFromLot - geçersiz alımda güncelleme yok', () => {
  assert.equal(priceUpdateFromLot({ id: 'a1' }, { date: '2026-08-24', unitCost: 0 }), null);
  assert.equal(priceUpdateFromLot({ id: 'a1' }, { unitCost: 7900 }), null);
});

test('suggestedUnitCost - bilinen fiyat forma önerilir', () => {
  assert.equal(suggestedUnitCost({ currentPrice: 7900 }), 7900);
  assert.equal(suggestedUnitCost({}), null);
});

// --- Aylık yatırım ve son alımlar ---------------------------------------

import { monthlyInvestBuckets, recentLots } from '../js/investments.js';

test('monthlyInvestBuckets - 6 kova, eskiden yeniye, boş ay 0', () => {
  const buckets = monthlyInvestBuckets(state, '2026-08', 6);
  assert.equal(buckets.length, 6);
  assert.deepEqual(buckets.map((b) => b.periodKey), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  assert.equal(buckets[0].amount, 0, 'mart boş');
  assert.equal(buckets[3].amount, 7100, 'haziran');
  assert.equal(buckets[5].amount, 28000, 'ağustos');
  assert.equal(buckets[5].isCurrent, true);
  assert.equal(buckets[0].isCurrent, false);
});

test('monthlyInvestBuckets - toplam yıllık yatırımı aşmaz', () => {
  const toplam = monthlyInvestBuckets(state, '2026-08', 12).reduce((t, b) => t + b.amount, 0);
  assert.ok(toplam <= investedInYear(state, 2026) + investedInYear(state, 2025));
});

test('recentLots - yeniden eskiye, varlık adıyla', () => {
  const rows = recentLots(state, 3);
  assert.deepEqual(rows.map((r) => r.id), ['i3', 'i2', 'i1']);
  assert.equal(rows[0].label, 'THYAO');
  assert.equal(rows[0].total, 28000);
  assert.equal(rows[1].unit, 'gram');
});

test('recentLots - varlığı silinmiş alım listeye girmez', () => {
  const kirli = { ...state, investments: [...state.investments, { id: 'x', assetId: 'yok', date: '2026-08-20', quantity: 1, unitCost: 100 }] };
  assert.equal(recentLots(kirli, 10).some((r) => r.id === 'x'), false);
});

// --- Varlık türleri -----------------------------------------------------

import {
  inferKind, kindOf, unitOf, formatQuantity, quantityLabel, priceLabel, avgLabel,
  portfolioByKind, bestWorstAsset, ASSET_KINDS, quantityPresets,
} from '../js/investments.js';

test('inferKind - etiketten tür çıkarır', () => {
  assert.equal(inferKind({ label: 'Dolar', unit: 'adet' }), 'doviz');
  assert.equal(inferKind({ label: 'Euro' }), 'doviz');
  assert.equal(inferKind({ label: 'Gram altın', unit: 'gram' }), 'altin');
  assert.equal(inferKind({ label: 'Çeyrek altın', unit: 'adet' }), 'altin');
  assert.equal(inferKind({ label: 'Bitcoin' }), 'kripto');
  assert.equal(inferKind({ label: 'THYAO', unit: 'lot' }), 'hisse');
  assert.equal(inferKind({ label: 'Zeytinlik', unit: 'adet' }), 'diger');
});

test('kindOf - kayıtlı tür tahmine tercih edilir', () => {
  assert.equal(kindOf({ label: 'Dolar', kind: 'diger' }).key, 'diger');
  assert.equal(kindOf({ label: 'Dolar' }).key, 'doviz');
});

test('unitOf - birim yoksa türün varsayılanı', () => {
  assert.equal(unitOf({ label: 'Dolar', kind: 'doviz' }), 'dolar');
  assert.equal(unitOf({ label: 'Dolar', kind: 'doviz', unit: 'USD' }), 'USD', 'elle yazılan birim korunur');
});

test('formatQuantity - tam sayı sade, ondalık türün hassasiyetinde', () => {
  assert.equal(formatQuantity(1500, { kind: 'doviz' }), '1.500');
  assert.equal(formatQuantity(100, { kind: 'hisse' }), '100');
  assert.equal(formatQuantity(0.015, { kind: 'kripto' }), '0,015');
  assert.equal(formatQuantity(2.5, { kind: 'altin' }), '2,5');
});

test('quantityLabel / priceLabel - dövizde kur sorusu', () => {
  const dolar = { label: 'Dolar', kind: 'doviz', unit: 'dolar' };
  assert.equal(quantityLabel(dolar), 'Kaç dolar aldın?');
  assert.equal(priceLabel(dolar), '1 dolar kaç ₺?');
  assert.equal(avgLabel(dolar), 'ort. kur');

  const altin = { label: 'Gram altın', kind: 'altin', unit: 'gram' };
  assert.equal(quantityLabel(altin), 'Kaç gram aldın?');
  assert.equal(priceLabel(altin), '1 gram kaç ₺?');
  assert.equal(avgLabel(altin), 'ort. maliyet');
});

test('ASSET_KINDS - her türün varsayılan birimi ve ondalığı var', () => {
  for (const k of ASSET_KINDS) {
    assert.ok(k.key && k.label && k.defaultUnit, `${k.key} eksik`);
    assert.equal(typeof k.decimals, 'number');
  }
});

// --- Türe göre dağılım ve en iyi/en kötü --------------------------------

const kindState = {
  assets: [
    { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 7900, priceUpdatedAt: daysAgo(1) },
    { id: 'a2', label: 'THYAO', kind: 'hisse', unit: 'lot', currentPrice: 300, priceUpdatedAt: daysAgo(1) },
    { id: 'a3', label: 'Dolar', kind: 'doviz', unit: 'dolar', currentPrice: 41.5, priceUpdatedAt: daysAgo(1) },
    { id: 'a4', label: 'Euro', kind: 'doviz', unit: 'euro', currentPrice: 45, priceUpdatedAt: daysAgo(1) },
  ],
  investments: [
    { id: 'l1', assetId: 'a1', date: '2026-06-10', quantity: 2, unitCost: 7000 },   // 14.000 → 15.800
    { id: 'l2', assetId: 'a2', date: '2026-08-03', quantity: 100, unitCost: 280 },  // 28.000 → 30.000
    { id: 'l3', assetId: 'a3', date: '2026-05-20', quantity: 500, unitCost: 39 },   // 19.500 → 20.750
    { id: 'l4', assetId: 'a4', date: '2026-05-20', quantity: 100, unitCost: 44 },   //  4.400 →  4.500
  ],
};

test('portfolioByKind - tür toplamları portföy değerine eşit', () => {
  const summary = portfolioSummary(kindState, NOW);
  const groups = portfolioByKind(summary);
  assert.deepEqual(groups.map((g) => g.kind), ['hisse', 'doviz', 'altin']);
  assert.equal(groups.reduce((t, g) => t + g.value, 0), summary.totalValue);
  assert.equal(groups.reduce((t, g) => t + g.cost, 0), summary.totalCost);
  assert.ok(Math.abs(groups.reduce((t, g) => t + g.pct, 0) - 100) < 1e-9);

  const doviz = groups.find((g) => g.kind === 'doviz');
  assert.equal(doviz.value, 20750 + 4500, 'dolar + euro tek grupta');
  assert.equal(doviz.count, 2);
});

test('portfolioByKind - tek tür varsa tek grup döner', () => {
  const tek = { assets: [kindState.assets[0]], investments: [kindState.investments[0]] };
  assert.equal(portfolioByKind(portfolioSummary(tek, NOW)).length, 1);
});

test('bestWorstAsset - en iyi ve en kötü yüzdeye göre', () => {
  const res = bestWorstAsset(portfolioSummary(kindState, NOW));
  assert.equal(res.best.label, 'Gram altın');   // %12,86
  assert.equal(res.worst.label, 'Euro');        // %2,27
});

test('bestWorstAsset - fiyatsız varlık yarışmaz, tek adayda null', () => {
  const eksik = {
    assets: [
      { id: 'a1', label: 'Gram altın', kind: 'altin', currentPrice: 7900, priceUpdatedAt: daysAgo(1) },
      { id: 'a2', label: 'Fon', kind: 'fon' },
    ],
    investments: [
      { id: 'l1', assetId: 'a1', date: '2026-06-10', quantity: 1, unitCost: 7000 },
      { id: 'l2', assetId: 'a2', date: '2026-06-10', quantity: 10, unitCost: 100 },
    ],
  };
  assert.equal(bestWorstAsset(portfolioSummary(eksik, NOW)), null, 'tek fiyatlı varlık kaldı');
});

// --- Gerçek senaryo: farklı fiyatlardan iki alım -------------------------
// "1 gramı 3.000'e aldım, sonra 5 gram daha aldım tanesi 7.000"

test('senaryo - 1×3000 sonra 5×7000: ortalama maliyet ve kâr doğru', () => {
  const asset = { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 7000, priceUpdatedAt: daysAgo(0) };
  const p = assetPosition(asset, [
    { id: 'l1', assetId: 'a1', date: '2026-01-10', quantity: 1, unitCost: 3000 },
    { id: 'l2', assetId: 'a1', date: '2026-08-20', quantity: 5, unitCost: 7000 },
  ], NOW);

  assert.equal(p.quantity, 6);
  assert.equal(p.cost, 38000, '3.000 + 35.000');
  assert.equal(Math.round(p.avgCost * 100) / 100, 6333.33);
  assert.equal(p.value, 42000, '6 × 7.000');
  assert.equal(p.profit, 4000);
  assert.equal(Math.round(p.profitPct * 100) / 100, 10.53);
  // Çapraz kontrol: miktar × (fiyat − ort. maliyet) da aynı kârı vermeli.
  // Ortalama maliyet devirli ondalık (6.333,33…) olduğu için kuruş altı
  // sapmaya izin veriliyor; uygulamanın kendi toplamı tam (4.000).
  assert.ok(Math.abs(p.profit - p.quantity * (p.price - p.avgCost)) < 0.01);
});

test('senaryo - ikinci alım güncel fiyatı 3.000den 7.000e taşır', () => {
  const asset = { id: 'a1', label: 'Gram altın', kind: 'altin', currentPrice: 3000, priceUpdatedAt: '2026-01-10T12:00:00.000Z' };
  const update = priceUpdateFromLot(asset, { date: '2026-08-20', quantity: 5, unitCost: 7000 });
  assert.equal(update.currentPrice, 7000);

  const p = assetPosition({ ...asset, ...update }, [
    { id: 'l1', assetId: 'a1', date: '2026-01-10', quantity: 1, unitCost: 3000 },
    { id: 'l2', assetId: 'a1', date: '2026-08-20', quantity: 5, unitCost: 7000 },
  ], NOW);
  assert.equal(p.value, 42000);
  assert.equal(p.profit, 4000);
});

test('senaryo - ters sırada girilse de sonuç aynı, eski alım fiyatı bozmaz', () => {
  // Önce 5×7000 girildi, sonra geçmişe dönük 1×3000 eklendi.
  const asset = { id: 'a1', label: 'Gram altın', kind: 'altin', currentPrice: 7000, priceUpdatedAt: '2026-08-20T12:00:00.000Z' };
  assert.equal(priceUpdateFromLot(asset, { date: '2026-01-10', quantity: 1, unitCost: 3000 }), null,
    'eski tarihli alım güncel fiyatı 3.000e çekmemeli');

  const p = assetPosition(asset, [
    { id: 'l2', assetId: 'a1', date: '2026-08-20', quantity: 5, unitCost: 7000 },
    { id: 'l1', assetId: 'a1', date: '2026-01-10', quantity: 1, unitCost: 3000 },
  ], NOW);
  assert.equal(p.cost, 38000);
  assert.equal(p.value, 42000);
  assert.equal(p.profit, 4000);
});

test('senaryo - fiyat maliyetin altına düşerse zarar gösterir', () => {
  const asset = { id: 'a1', label: 'Gram altın', kind: 'altin', currentPrice: 6000, priceUpdatedAt: daysAgo(0) };
  const p = assetPosition(asset, [
    { id: 'l1', assetId: 'a1', date: '2026-01-10', quantity: 1, unitCost: 3000 },
    { id: 'l2', assetId: 'a1', date: '2026-08-20', quantity: 5, unitCost: 7000 },
  ], NOW);
  assert.equal(p.value, 36000);
  assert.equal(p.profit, -2000);
  assert.ok(p.profitPct < 0);
});

test('senaryo - portföy toplamı varlık kârlarının toplamına eşit', () => {
  const s = portfolioSummary({
    assets: [
      { id: 'a1', label: 'Gram altın', kind: 'altin', currentPrice: 7000, priceUpdatedAt: daysAgo(0) },
      { id: 'a2', label: 'Dolar', kind: 'doviz', unit: 'dolar', currentPrice: 41, priceUpdatedAt: daysAgo(0) },
    ],
    investments: [
      { id: 'l1', assetId: 'a1', date: '2026-01-10', quantity: 1, unitCost: 3000 },
      { id: 'l2', assetId: 'a1', date: '2026-08-20', quantity: 5, unitCost: 7000 },
      { id: 'l3', assetId: 'a2', date: '2026-08-01', quantity: 1000, unitCost: 39 },
    ],
  }, NOW);
  assert.equal(s.totalProfit, s.positions.reduce((t, p) => t + p.profit, 0));
  assert.equal(s.totalProfit, 4000 + 2000);
  assert.equal(s.totalValue, 42000 + 41000);
  assert.equal(s.totalCost, 38000 + 39000);
});

test('quantityPresets - tür başına anlamlı miktar kısayolları', () => {
  assert.deepEqual(quantityPresets({ kind: 'doviz' }), [100, 250, 500, 1000]);
  assert.deepEqual(quantityPresets({ kind: 'kripto' }), [0.01, 0.05, 0.1, 0.5]);
  assert.deepEqual(quantityPresets({ kind: 'hisse' }), [10, 50, 100, 500]);
  assert.deepEqual(quantityPresets({ kind: 'altin' }), [1, 2, 5, 10]);
  assert.deepEqual(quantityPresets({ label: 'Dolar' }), [100, 250, 500, 1000], 'tür yoksa etiketten çıkarılır');
});

// --- Aynı güne düşen alımlar (kullanıcı senaryosu) ----------------------
// Varlık öğleden sonra 7.100 fiyatla oluşturuldu, ardından aynı gün
// 10 gram × 7.900 alındı. Fiyat 7.900 olmalı, zarar görünmemeli.

test('priceUpdateFromLot - aynı gün elle girilen fiyatın üstüne yeni alım yazar', () => {
  const bugun = '2026-08-25';
  const nowMs = Date.parse('2026-08-25T14:30:00.000Z');
  const asset = { id: 'a1', label: 'Gram altın', kind: 'altin', currentPrice: 7100, priceUpdatedAt: '2026-08-25T14:30:00.000Z' };

  const update = priceUpdateFromLot(asset, { date: bugun, quantity: 10, unitCost: 7900 }, nowMs);
  assert.ok(update, 'aynı güne düşen alım fiyatı güncellemeli');
  assert.equal(update.currentPrice, 7900);
});

test('senaryo - 1×7.100 sonra 10×7.900 aynı gün: kâr çıkar, zarar değil', () => {
  const bugun = '2026-08-25';
  const nowMs = Date.parse('2026-08-25T15:00:00.000Z');
  let asset = { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 7100, priceUpdatedAt: '2026-08-25T14:30:00.000Z' };
  const lots = [
    { id: 'l1', assetId: 'a1', date: bugun, quantity: 1, unitCost: 7100 },
    { id: 'l2', assetId: 'a1', date: bugun, quantity: 10, unitCost: 7900 },
  ];
  const update = priceUpdateFromLot(asset, lots[1], nowMs);
  asset = { ...asset, ...update };

  const p = assetPosition(asset, lots, nowMs);
  assert.equal(p.quantity, 11);
  assert.equal(p.cost, 86100, '7.100 + 79.000');
  assert.equal(p.price, 7900);
  assert.equal(p.value, 86900, '11 × 7.900');
  assert.equal(p.profit, 800);
  assert.ok(p.profit > 0, 'zarar göstermemeli');
});

test('priceUpdateFromLot - bugüne girilen alımın damgası "şu an"', () => {
  const nowMs = Date.parse('2026-08-25T15:00:00.000Z');
  const update = priceUpdateFromLot({ id: 'a1' }, { date: '2026-08-25', quantity: 1, unitCost: 7900 }, nowMs);
  assert.equal(update.priceUpdatedAt, new Date(nowMs).toISOString());
  // Böylece kart "0 gün önce güncellendi" der, bayat uyarısı çıkmaz.
  const p = assetPosition({ id: 'a1', currentPrice: 7900, priceUpdatedAt: update.priceUpdatedAt }, [], nowMs);
  assert.equal(p.stale, false);
});

test('priceUpdateFromLot - geçmiş tarihli alımın damgası o gün, güncel fiyata dokunmaz', () => {
  const nowMs = Date.parse('2026-08-25T15:00:00.000Z');
  const asset = { id: 'a1', currentPrice: 7900, priceUpdatedAt: '2026-08-25T14:00:00.000Z' };
  assert.equal(priceUpdateFromLot(asset, { date: '2026-06-10', quantity: 1, unitCost: 7100 }, nowMs), null);

  const fiyatsiz = priceUpdateFromLot({ id: 'a2' }, { date: '2026-06-10', quantity: 1, unitCost: 7100 }, nowMs);
  assert.equal(fiyatsiz.priceUpdatedAt, '2026-06-10T12:00:00.000Z');
});

test('recentLots - limit 0 hepsini döner, alım bilgisi tam', () => {
  const rows = recentLots(state, 0);
  assert.equal(rows.length, state.investments.length);
  assert.equal(rows[0].kindLabel, 'Hisse');
  assert.equal(rows[0].total, 28000);
});

test('csvForInvestments - tarih sırasıyla, tutar hesaplanmış, noktalı virgüllü', async () => {
  const { csvForInvestments } = await import('../js/ui/exportUtils.js');
  const csv = csvForInvestments([
    { date: '2026-08-20', label: 'Gram altın', kindLabel: 'Altın', quantity: 5, unit: 'gram', unitCost: 7900, note: '' },
    { date: '2026-06-10', label: 'Gram altın', kindLabel: 'Altın', quantity: 1, unit: 'gram', unitCost: 7100, note: 'kuyumcu; nakit' },
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Tarih;Varlik;Tur;Miktar;Birim;Birim fiyat;Tutar;Not;Islem');
  assert.ok(lines[1].startsWith('2026-06-10'), 'eskiden yeniye sıralanır');
  assert.ok(lines[1].includes('7100,00;7100,00'), 'birim fiyat ve tutar');
  assert.ok(lines[1].includes('"kuyumcu; nakit"'), 'noktalı virgüllü not tırnaklanır');
  assert.ok(lines[2].includes('39500,00'), '5 × 7.900');
});

// --- Satış ve gerçekleşen kâr/zarar --------------------------------------

import { isSell, checkSell, soldInPeriod } from '../js/investments.js';

const gold = { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 7000, priceUpdatedAt: daysAgo(0) };
const buy = (id, date, quantity, unitCost) => ({ id, assetId: 'a1', date, quantity, unitCost });
const sell = (id, date, quantity, unitCost) => ({ id, assetId: 'a1', date, quantity, unitCost, side: 'sell' });

test('satış - ortalama maliyet değişmez, kalan miktar ve gerçekleşen kâr doğru', () => {
  // 2×6.000 + 2×8.000 → ort. 7.000; 1 gram 9.000'e satılır.
  const p = assetPosition(gold, [
    buy('b1', '2026-01-10', 2, 6000),
    buy('b2', '2026-02-10', 2, 8000),
    sell('s1', '2026-03-10', 1, 9000),
  ], NOW);
  assert.equal(p.quantity, 3);
  assert.equal(p.avgCost, 7000, 'satış ortalamayı oynatmaz');
  assert.equal(p.cost, 21000);
  assert.equal(p.realized, 2000, '(9.000 − 7.000) × 1');
  assert.equal(p.proceeds, 9000);
  assert.equal(p.value, 21000, '3 × 7.000');
  assert.equal(p.profit, 0, 'gerçekleşmemiş kâr yalnız elde kalandan');
  assert.equal(p.sellCount, 1);
  assert.equal(p.buyCount, 2);
});

test('satış - zararına satış negatif gerçekleşen kâr', () => {
  const p = assetPosition(gold, [buy('b1', '2026-01-10', 2, 8000), sell('s1', '2026-03-10', 1, 7000)], NOW);
  assert.equal(p.realized, -1000);
});

test('satış - tamamı satılırsa miktar ve maliyet sıfır, kâr yazılı kalır', () => {
  const p = assetPosition(gold, [buy('b1', '2026-01-10', 3, 3000), sell('s1', '2026-03-10', 3, 7000)], NOW);
  assert.equal(p.quantity, 0);
  assert.equal(p.cost, 0);
  assert.equal(p.avgCost, 0);
  assert.equal(p.realized, 12000);
  assert.equal(p.holding, false);
  assert.equal(p.hasLots, true);
  assert.equal(p.stale, false, 'elde olmayan varlık bayat uyarısı vermez');
});

test('satış - küsuratlı satış kayan noktada artık bırakmaz', () => {
  const p = assetPosition(gold, [buy('b1', '2026-01-10', 0.3, 7000), sell('s1', '2026-03-10', 0.1, 7500), sell('s2', '2026-03-11', 0.2, 7500)], NOW);
  assert.equal(p.quantity, 0, '0,3 − 0,1 − 0,2 tam sıfır');
  assert.equal(p.cost, 0);
});

test('satış - eldekinden fazlası satılamaz: fazlası yok sayılır ve işaretlenir', () => {
  const p = assetPosition(gold, [buy('b1', '2026-01-10', 2, 5000), sell('s1', '2026-03-10', 5, 7000)], NOW);
  assert.equal(p.quantity, 0);
  assert.equal(p.oversold, true);
  assert.equal(p.soldQuantity, 2, 'yalnız eldeki 2 gram satılmış sayılır');
  assert.equal(p.realized, 4000);
});

test('satış - sıralama tarihe göre: satış, kendi gününden sonraki alıma güvenemez', () => {
  // Girilme sırası ters: satış listede önce. Ama 10 Mart'ta elde 0 gram var.
  const p = assetPosition(gold, [sell('s1', '2026-03-10', 1, 7000), buy('b1', '2026-04-01', 2, 5000)], NOW);
  assert.equal(p.oversold, true);
  assert.equal(p.quantity, 2);
});

test('satış - aynı gün alım satımdan önce işlenir', () => {
  const p = assetPosition(gold, [sell('s1', '2026-03-10', 1, 7500), buy('b1', '2026-03-10', 1, 7000)], NOW);
  assert.equal(p.oversold, false);
  assert.equal(p.realized, 500);
  assert.equal(p.quantity, 0);
});

test('satış - girilme sırası sonucu değiştirmez', () => {
  const lots = [buy('b1', '2026-01-10', 2, 6000), buy('b2', '2026-02-10', 2, 8000), sell('s1', '2026-03-10', 1, 9000), buy('b3', '2026-04-10', 1, 10000), sell('s2', '2026-05-10', 2, 11000)];
  const a = assetPosition(gold, lots, NOW);
  const b = assetPosition(gold, [...lots].reverse(), NOW);
  assert.equal(a.quantity, b.quantity);
  assert.equal(a.cost, b.cost);
  assert.equal(a.realized, b.realized);
});

test('satış - ALIMI OLAN ESKİ KAYITLARIN sayıları değişmez (side alanı yok)', () => {
  // Arkadaşın mevcut defteri: yalnız alım, side yok. Önce/sonra aynı olmalı.
  const eski = [
    { id: 'i1', assetId: 'a1', date: '2026-06-10', quantity: 1, unitCost: 7100 },
    { id: 'i2', assetId: 'a1', date: '2026-07-12', quantity: 1.5, unitCost: 7400 },
  ];
  const p = assetPosition(gold, eski, NOW);
  assert.equal(p.quantity, 2.5);
  assert.equal(p.cost, 7100 + 1.5 * 7400);
  assert.equal(p.realized, 0);
  assert.equal(p.sellCount, 0);
  assert.equal(p.oversold, false);
  assert.equal(isSell(eski[0]), false);
});

test('portfolioSummary - toplam gerçekleşen kâr, satılmış varlık portföy sayısına girmez', () => {
  const st = {
    assets: [gold, { id: 'a2', label: 'Dolar', kind: 'doviz', unit: 'dolar', currentPrice: 40, priceUpdatedAt: daysAgo(0) }],
    investments: [
      buy('b1', '2026-01-10', 2, 5000), sell('s1', '2026-03-10', 2, 7000),
      { id: 'b2', assetId: 'a2', date: '2026-02-01', quantity: 100, unitCost: 35 },
    ],
  };
  const s = portfolioSummary(st, NOW);
  assert.equal(s.totalRealized, 4000);
  assert.equal(s.assetCount, 1, 'yalnız elde olan');
  assert.equal(s.soldOutCount, 1);
  assert.equal(s.totalValue, 4000, 'yalnız elde kalan dolar');
  assert.equal(portfolioByKind(s).map((g) => g.kind).join(), 'doviz');
  assert.equal(bestWorstAsset(s), null);
});

test('yatırıma ayrılan yalnız alımlardır, satış ayrı toplanır', () => {
  const st = { assets: [gold], investments: [buy('b1', '2026-08-03', 2, 5000), sell('s1', '2026-08-10', 1, 7000)] };
  assert.equal(investedInPeriod(st, '2026-08'), 10000);
  assert.equal(investedInYear(st, 2026), 10000);
  assert.equal(soldInPeriod(st, '2026-08'), 7000);
  assert.equal(soldInPeriod(st, '2026-07'), 0);
});

test('checkSell - yeterli miktar, fazlası, düzenlemede kendi kaydı hesaba katılmaz', () => {
  const st = { assets: [gold], investments: [buy('b1', '2026-01-10', 5, 5000), sell('s1', '2026-02-10', 2, 7000)] };
  assert.deepEqual(checkSell(st, 'a1', { date: '2026-03-01', quantity: 3, unitCost: 7000 }), { ok: true, available: 3 });
  assert.equal(checkSell(st, 'a1', { date: '2026-03-01', quantity: 3.5, unitCost: 7000 }).ok, false);
  // s1'i düzenlerken kendi 2 gramı yeniden satılabilir.
  assert.equal(checkSell(st, 'a1', { date: '2026-02-10', quantity: 5, unitCost: 7000 }, 's1').ok, true);
});

test('checkSell - geçmişe dönük satış sonraki satışı geçersiz kılıyorsa reddedilir', () => {
  const st = { assets: [gold], investments: [buy('b1', '2026-01-10', 5, 5000), sell('s1', '2026-06-10', 4, 7000)] };
  // 1 Mart'ta 3 gram satarsa 10 Haziran'daki 4 gramlık satışa yetmez (kalan 2).
  assert.equal(checkSell(st, 'a1', { date: '2026-03-01', quantity: 3, unitCost: 6500 }).ok, false);
  assert.equal(checkSell(st, 'a1', { date: '2026-03-01', quantity: 1, unitCost: 6500 }).ok, true);
});

test('recentLots - satış kaydı side ile birlikte listelenir', () => {
  const rows = recentLots({ assets: [gold], investments: [buy('b1', '2026-01-10', 2, 5000), sell('s1', '2026-03-10', 1, 7000)] }, 0);
  assert.equal(rows[0].side, 'sell');
  assert.equal(rows[0].total, 7000);
});
