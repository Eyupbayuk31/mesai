// Yatırım defteri: alımlar (lot) tutulur, ortalama maliyet ve kâr/zarar
// hesaplanır. Fiyat elle girilir — uygulamanın sunucusu yok, borsa/kur
// servisine bağlanmadan her koşulda çalışsın diye.
//
// Bütçeden bağımsızdır: yatırım harcama sayılmaz, ayrı defterdir.

import { isDateInPeriod } from './period.js';

// Alım eklerken önerilen varlıklar. Saklanmaz, yalnızca formu hızlandırır;
// kullanıcı kendi varlığını da yazabilir (ör. bir hisse kodu).
export const PRESET_ASSETS = [
  { label: 'Gram altın', unit: 'gram', color: '#d4a017' },
  { label: 'Çeyrek altın', unit: 'adet', color: '#c98b12' },
  { label: 'Yarım altın', unit: 'adet', color: '#b8770e' },
  { label: 'Tam altın', unit: 'adet', color: '#a3640c' },
  { label: 'Gümüş', unit: 'gram', color: '#8c96a3' },
  { label: 'Dolar', unit: 'adet', color: '#2f8a5c' },
  { label: 'Euro', unit: 'adet', color: '#2f63c4' },
  { label: 'Hisse', unit: 'lot', color: '#8447b5' },
  { label: 'Fon', unit: 'adet', color: '#0e8a8a' },
  { label: 'Bitcoin', unit: 'adet', color: '#d97d0d' },
];

// Yeni varlığa sırayla verilecek renkler (preset'i olmayan için).
const FALLBACK_COLORS = ['#2f8a5c', '#d97d0d', '#2f63c4', '#8447b5', '#0e8a8a', '#c2568e', '#b0431f', '#7d7666'];

export function nextAssetColor(assets) {
  const used = new Set((assets || []).map((a) => a.color));
  return FALLBACK_COLORS.find((c) => !used.has(c)) || FALLBACK_COLORS[(assets?.length || 0) % FALLBACK_COLORS.length];
}

// Fiyat kaç gündür güncellenmedi? Bu eşiği geçince kartta uyarı çıkar.
export const STALE_DAYS = 7;

function lotsOf(state, assetId) {
  return (state?.investments || []).filter((i) => i && i.assetId === assetId);
}

/**
 * Bir varlığın pozisyonu: elindeki miktar, toplam maliyet, ortalama maliyet,
 * güncel değer ve kâr/zarar.
 *
 * Fiyat girilmemişse değer = maliyet kabul edilir; olmayan bir kârı varmış
 * gibi göstermek yerine `hasPrice: false` ile arayüze "fiyat gir" dedirtir.
 */
export function assetPosition(asset, lots, nowMs = Date.now()) {
  let quantity = 0;
  let cost = 0;
  for (const lot of lots || []) {
    const q = Number(lot?.quantity) || 0;
    quantity += q;
    cost += q * (Number(lot?.unitCost) || 0);
  }
  const price = Number(asset?.currentPrice) || 0;
  const hasPrice = price > 0;
  const value = hasPrice ? quantity * price : cost;
  const profit = value - cost;
  return {
    assetId: asset?.id,
    label: asset?.label || '',
    unit: asset?.unit || 'adet',
    color: asset?.color,
    quantity,
    cost,
    avgCost: quantity > 0 ? cost / quantity : 0,
    price,
    hasPrice,
    value,
    profit,
    profitPct: cost > 0 ? (profit / cost) * 100 : 0,
    lotCount: (lots || []).length,
    stale: hasPrice && staleDays(asset?.priceUpdatedAt, nowMs) > STALE_DAYS,
    staleDays: staleDays(asset?.priceUpdatedAt, nowMs),
  };
}

function staleDays(iso, nowMs) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((nowMs - t) / (1000 * 60 * 60 * 24));
}

/** Tüm portföy: değere göre büyükten küçüğe pozisyonlar + toplamlar. */
export function portfolioSummary(state, nowMs = Date.now()) {
  const positions = (state?.assets || [])
    .map((a) => assetPosition(a, lotsOf(state, a.id), nowMs))
    .filter((p) => p.quantity > 0 || p.lotCount > 0)
    .sort((a, b) => b.value - a.value);

  let totalCost = 0;
  let totalValue = 0;
  let staleCount = 0;
  let missingPrice = 0;
  for (const p of positions) {
    totalCost += p.cost;
    totalValue += p.value;
    if (p.stale) staleCount += 1;
    if (!p.hasPrice) missingPrice += 1;
  }
  const totalProfit = totalValue - totalCost;
  return {
    positions,
    totalCost,
    totalValue,
    totalProfit,
    profitPct: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
    staleCount,
    missingPrice,
    assetCount: positions.length,
  };
}

// Donut için dilimler. SVG'de r=RADIUS'lu tek bir daire üstüne
// stroke-dasharray ile çizilir; her dilim kendi uzunluğu kadar boyanır.
export const DONUT_RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/**
 * @param {Array} positions portfolioSummary().positions
 * @returns {Array} [{ label, color, value, pct, dash, gap, offset }]
 */
export function donutSlices(positions) {
  const total = (positions || []).reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total <= 0) return [];
  const slices = [];
  let used = 0; // o ana kadar kaplanan çevre uzunluğu
  for (const p of positions) {
    const value = Math.max(0, p.value);
    if (value <= 0) continue;
    const dash = (value / total) * CIRCUMFERENCE;
    slices.push({
      label: p.label,
      color: p.color,
      value,
      pct: (value / total) * 100,
      dash,
      gap: CIRCUMFERENCE - dash,
      // Daireler saat 12'den başlasın diye negatif offset kullanılır.
      offset: -used,
    });
    used += dash;
  }
  return slices;
}

/**
 * Yeni bir alım aynı zamanda bir FİYAT GÖZLEMİDİR: bugün gramı 7.900'e
 * aldıysan piyasa fiyatı 7.900'dür. Kullanıcı aynı sayıyı bir de "güncel
 * fiyat" diye girmek zorunda kalmasın diye alımdan otomatik güncellenir.
 *
 * Yalnızca alım, elimizdeki fiyat bilgisinden DAHA YENİYSE güncellenir —
 * geçmişe dönük girilen eski bir alım güncel fiyatı bozmaz.
 *
 * @returns {{currentPrice:number, priceUpdatedAt:string}|null} güncelleme gerekmiyorsa null
 */
export function priceUpdateFromLot(asset, lot) {
  const unitCost = Number(lot?.unitCost) || 0;
  if (unitCost <= 0 || !lot?.date) return null;

  const lotAt = `${lot.date}T12:00:00.000Z`;
  const knownAt = asset?.priceUpdatedAt;
  if (knownAt && Date.parse(knownAt) > Date.parse(lotAt)) return null;

  if (Number(asset?.currentPrice) === unitCost) return null;
  return { currentPrice: unitCost, priceUpdatedAt: lotAt };
}

/** Bir varlığın alım formunda önerilecek birim fiyat: bilinen son fiyat. */
export function suggestedUnitCost(asset) {
  return Number(asset?.currentPrice) > 0 ? Number(asset.currentPrice) : null;
}

/** Bir dönemde (maaş ayı) yatırıma ayrılan para. */
export function investedInPeriod(state, periodKey) {
  return (state?.investments || [])
    .filter((i) => i?.date && isDateInPeriod(i.date, periodKey))
    .reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
}

/** Takvim yılında yatırıma ayrılan para. */
export function investedInYear(state, year) {
  const prefix = String(year);
  return (state?.investments || [])
    .filter((i) => typeof i?.date === 'string' && i.date.slice(0, 4) === prefix)
    .reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
}

/** Bir varlığın alımları, yeniden eskiye. */
export function assetLots(state, assetId) {
  return lotsOf(state, assetId)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function lotTotal(lot) {
  return (Number(lot?.quantity) || 0) * (Number(lot?.unitCost) || 0);
}
