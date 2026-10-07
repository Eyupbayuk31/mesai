import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };

const { buildInvestReport, valueChartSVG } = await import('../js/ui/investReport.js');

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const iso = (n) => new Date(NOW - n * 86400000).toISOString();
const day = (n) => iso(n).slice(0, 10);

const state = {
  settings: {
    investGoal: { amount: 200000, byMonth: '2026-12' },
    investTargets: { altin: 60, doviz: 40 },
    investUsdView: true,
  },
  assets: [
    { id: 'a1', label: 'Gram altın', kind: 'altin', unit: 'gram', currentPrice: 7500, priceUpdatedAt: iso(1) },
    { id: 'a2', label: 'Dolar', kind: 'doviz', unit: 'dolar', currentPrice: 41, priceUpdatedAt: iso(1) },
  ],
  investments: [
    { id: 'i1', assetId: 'a1', date: day(90), quantity: 3, unitCost: 6000, note: 'kuyumcu & "nakit"' },
    { id: 'i2', assetId: 'a1', date: day(30), quantity: 1, unitCost: 7000, side: 'sell' },
    { id: 'i3', assetId: 'a2', date: day(60), quantity: 500, unitCost: 38 },
  ],
};
const usdRates = { [day(100)]: 40, [day(2)]: 50 };

test('yatırım raporu - tam belge, tüm bölümler ve doğru rakamlar', () => {
  const html = buildInvestReport({ profileName: 'Test', state, usdRates, nowMs: NOW });
  assert.ok(html.startsWith('<!doctype html>'));
  for (const part of ['Yatırım raporu', 'Portföy değeri', 'Maliyet', 'Kâr / zarar', 'Satışlardan gerçekleşen',
    'Dolar bazında getiri', 'Değer seyri', 'Hedefler', 'Birikim hedefi', 'Hedefe gelmek için', 'Alım ve satım defteri', 'Toplam alım', 'Toplam satış']) {
    assert.ok(html.includes(part), `"${part}" yok`);
  }
  assert.equal(html.includes('NaN'), false, 'NaN yok');
  assert.equal(html.includes('undefined'), false, 'undefined yok');
});

test('yatırım raporu - kullanıcı metni kaçırılır (not alanında HTML/tırnak)', () => {
  const html = buildInvestReport({ profileName: '<b>X</b>', state, usdRates, nowMs: NOW });
  assert.equal(html.includes('<b>X</b>'), false, 'profil adı kaçırılmadı');
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(html.includes('kuyumcu &amp; &quot;nakit&quot;'), 'not kaçırıldı');
});

test('yatırım raporu - hedef ve dolar yoksa o bölümler hiç basılmaz', () => {
  const plain = { ...state, settings: {} };
  const html = buildInvestReport({ profileName: 'Test', state: plain, nowMs: NOW });
  assert.equal(html.includes('Hedefler'), false);
  assert.equal(html.includes('Dolar bazında'), false);
  assert.ok(html.includes('Alım ve satım defteri'));
});

test('yatırım raporu - dolar kapalıyken ya da kur yokken dolar satırı çıkmaz', () => {
  assert.equal(buildInvestReport({ profileName: 'T', state: { ...state, settings: { investUsdView: false } }, usdRates, nowMs: NOW }).includes('Dolar bazında getiri'), false);
  assert.equal(buildInvestReport({ profileName: 'T', state, usdRates: null, nowMs: NOW }).includes('Dolar bazında getiri'), false);
});

test('yatırım raporu - piyasa fiyatı kullanılıyorsa tahmini notu düşer', () => {
  const market = { fetchedAt: iso(0), quotes: { GRA: { buy: 7600, sell: 7610 } } };
  const st = { ...state, assets: [{ ...state.assets[0], priceSource: 'GRA' }, state.assets[1]] };
  const html = buildInvestReport({ profileName: 'T', state: st, market, nowMs: NOW });
  assert.ok(html.includes('tahminidir'));
});

test('yatırım raporu - boş defter çökmez', () => {
  const html = buildInvestReport({ profileName: 'T', state: { settings: {}, assets: [], investments: [] }, nowMs: NOW });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.equal(html.includes('NaN'), false);
  assert.equal(html.includes('Alım ve satım defteri'), false);
});

test('valueChartSVG - iki noktadan az çizilmez; düz seri çökmez', () => {
  assert.equal(valueChartSVG([]), '');
  assert.equal(valueChartSVG([{ date: '2026-10-01', value: 1, cost: 1 }]), '');
  const svg = valueChartSVG([{ date: '2026-10-01', value: 100, cost: 100 }, { date: '2026-10-07', value: 100, cost: 100 }]);
  assert.ok(svg.includes('<svg'));
  assert.equal(svg.includes('NaN'), false);
});
