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
