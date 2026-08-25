// Yatırım defteri: alımlar (lot) tutulur, ortalama maliyet ve kâr/zarar
// hesaplanır. Fiyat elle girilir — uygulamanın sunucusu yok, borsa/kur
// servisine bağlanmadan her koşulda çalışsın diye.
//
// Bütçeden bağımsızdır: yatırım harcama sayılmaz, ayrı defterdir.

import { isDateInPeriod, shiftPeriod } from './period.js';
import { toISODate } from './format.js';

// Varlık türleri. Tür; birimi, formdaki soruları ve miktarın kaç ondalıkla
// gösterileceğini belirler. Hesap her türde aynı (miktar × birim fiyat);
// değişen yalnızca dil ve gösterim — "500 adet dolar" saçmaydı, "500 dolar".
export const ASSET_KINDS = [
  { key: 'doviz', label: 'Döviz', defaultUnit: 'dolar', decimals: 2, rate: true },
  { key: 'altin', label: 'Altın', defaultUnit: 'gram', decimals: 4, rate: false },
  { key: 'hisse', label: 'Hisse', defaultUnit: 'lot', decimals: 0, rate: false },
  { key: 'kripto', label: 'Kripto', defaultUnit: 'BTC', decimals: 8, rate: true },
  { key: 'fon', label: 'Fon', defaultUnit: 'pay', decimals: 3, rate: false },
  { key: 'diger', label: 'Diğer', defaultUnit: 'adet', decimals: 2, rate: false },
];

const KIND_BY_KEY = new Map(ASSET_KINDS.map((k) => [k.key, k]));
const FALLBACK_KIND = KIND_BY_KEY.get('diger');

// Alım eklerken önerilen varlıklar. Saklanmaz, yalnızca formu hızlandırır;
// kullanıcı kendi varlığını da yazabilir (ör. bir hisse kodu).
export const PRESET_ASSETS = [
  { label: 'Gram altın', kind: 'altin', unit: 'gram', color: '#d4a017' },
  { label: 'Çeyrek altın', kind: 'altin', unit: 'adet', color: '#c98b12' },
  { label: 'Yarım altın', kind: 'altin', unit: 'adet', color: '#b8770e' },
  { label: 'Tam altın', kind: 'altin', unit: 'adet', color: '#a3640c' },
  { label: 'Gümüş', kind: 'altin', unit: 'gram', color: '#8c96a3' },
  { label: 'Dolar', kind: 'doviz', unit: 'dolar', color: '#2f8a5c' },
  { label: 'Euro', kind: 'doviz', unit: 'euro', color: '#2f63c4' },
  { label: 'Sterlin', kind: 'doviz', unit: 'sterlin', color: '#5b6472' },
  { label: 'Hisse', kind: 'hisse', unit: 'lot', color: '#8447b5' },
  { label: 'Fon', kind: 'fon', unit: 'pay', color: '#0e8a8a' },
  { label: 'Bitcoin', kind: 'kripto', unit: 'BTC', color: '#d97d0d' },
];

// Etiket/birimden tür tahmini — eski kayıtlarda `kind` yok.
const LABEL_HINTS = [
  { kind: 'doviz', words: ['dolar', 'usd', '$', 'euro', 'eur', '€', 'sterlin', 'gbp', 'frank', 'chf', 'yen', 'jpy', 'riyal', 'ruble'] },
  { kind: 'kripto', words: ['bitcoin', 'btc', 'ethereum', 'eth', 'kripto', 'coin', 'usdt', 'solana', 'avax'] },
  { kind: 'altin', words: ['altın', 'altin', 'gram', 'gümüş', 'gumus', 'çeyrek', 'ceyrek', 'reşat', 'ata lira', 'ons'] },
  { kind: 'fon', words: ['fon', 'yatırım fonu', 'eurobond', 'tahvil'] },
  { kind: 'hisse', words: ['hisse', 'lot', 'borsa'] },
];

export function inferKind(asset) {
  const label = String(asset?.label || '').toLocaleLowerCase('tr');
  const unit = String(asset?.unit || '').toLocaleLowerCase('tr');
  for (const hint of LABEL_HINTS) {
    if (hint.words.some((w) => label.includes(w) || unit === w)) return hint.kind;
  }
  // Birim tek başına da ipucu: "lot" hisse, "gram" altın demektir.
  if (unit === 'lot') return 'hisse';
  if (unit === 'gram') return 'altin';
  if (unit === 'pay') return 'fon';
  return 'diger';
}

/** Varlığın tür tanımı; kaydında yoksa etiketinden çıkarılır. */
export function kindOf(asset) {
  return KIND_BY_KEY.get(asset?.kind) || KIND_BY_KEY.get(inferKind(asset)) || FALLBACK_KIND;
}

export function kindByKey(key) {
  return KIND_BY_KEY.get(key) || FALLBACK_KIND;
}

/** Varlığın birimi: kaydındaki, yoksa türün varsayılanı. */
export function unitOf(asset) {
  return asset?.unit || kindOf(asset).defaultUnit;
}

/** Miktarı türün hassasiyetiyle yazar: 1.500 dolar, 0,01500000 BTC, 100 lot. */
export function formatQuantity(value, asset) {
  const n = Number(value) || 0;
  const decimals = kindOf(asset).decimals;
  if (Number.isInteger(n)) return n.toLocaleString('tr-TR');
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: Math.max(decimals, 2) });
}

/** "Kaç dolar aldın?" / "Kaç gram aldın?" */
export function quantityLabel(asset) {
  return `Kaç ${unitOf(asset)} aldın?`;
}

/** Döviz/kriptoda kur sorulur, diğerlerinde birim fiyat. */
export function priceLabel(asset) {
  return `1 ${unitOf(asset)} kaç ₺?`;
}

/**
 * Alım formunda gösterilecek miktar kısayolları. Tür başına anlamlı sayılar:
 * dövizde 100'lük, kriptoda küsurat, hissede lot.
 */
export function quantityPresets(asset) {
  switch (kindOf(asset).key) {
    case 'doviz': return [100, 250, 500, 1000];
    case 'kripto': return [0.01, 0.05, 0.1, 0.5];
    case 'hisse': return [10, 50, 100, 500];
    case 'fon': return [10, 50, 100, 250];
    default: return [1, 2, 5, 10];
  }
}

/** Kart ve tablolarda ortalama maliyetin adı. */
export function avgLabel(asset) {
  return kindOf(asset).rate ? 'ort. kur' : 'ort. maliyet';
}

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
    kind: kindOf(asset).key,
    kindLabel: kindOf(asset).label,
    unit: unitOf(asset),
    asset,
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
    hasLots: (lots || []).length > 0,
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
  // Alımı olmayan varlık da listede kalır: kullanıcı önce varlığı tanımlayıp
  // sonra alım ekliyor; arada kart kaybolursa "nereye gitti?" sorusu doğar.
  const positions = (state?.assets || [])
    .map((a) => assetPosition(a, lotsOf(state, a.id), nowMs))
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
    assetCount: positions.filter((p) => p.hasLots).length,
    emptyCount: positions.filter((p) => !p.hasLots).length,
  };
}

/** Türe göre dağılım: altın ne kadar, döviz ne kadar? */
export function portfolioByKind(summary) {
  const groups = new Map();
  for (const p of summary?.positions || []) {
    if (!p.hasLots) continue;
    const g = groups.get(p.kind) || { kind: p.kind, label: p.kindLabel, value: 0, cost: 0, count: 0 };
    g.value += p.value;
    g.cost += p.cost;
    g.count += 1;
    groups.set(p.kind, g);
  }
  const total = [...groups.values()].reduce((sum, g) => sum + g.value, 0);
  return [...groups.values()]
    .map((g) => ({
      ...g,
      profit: g.value - g.cost,
      profitPct: g.cost > 0 ? ((g.value - g.cost) / g.cost) * 100 : 0,
      pct: total > 0 ? (g.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * En çok ve en az kazandıran varlık. Yalnızca fiyatı girilmiş ve maliyeti olan
 * varlıklar yarışır — fiyatsız varlığın kârı 0 görünür, sıralamayı bozardı.
 * İki adaydan az varsa karşılaştırma anlamsız: null döner.
 */
export function bestWorstAsset(summary) {
  const rank = (summary?.positions || [])
    .filter((p) => p.hasLots && p.hasPrice && p.cost > 0)
    .sort((a, b) => b.profitPct - a.profitPct);
  if (rank.length < 2) return null;
  return { best: rank[0], worst: rank[rank.length - 1] };
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
 * Karşılaştırma yalnız GÜNE bakar. Saatle kıyaslanınca şu oluyordu: varlığı
 * öğleden sonra 7.100 fiyatla oluşturuyorsun (damga: o an), sonra aynı güne
 * 7.900'lük alım giriyorsun (damga: o günün 12:00'ı) — alım "daha eski"
 * sayılıp fiyat 7.100'de kalıyordu. Aynı güne düşen alım yeni bilgidir.
 *
 * Yalnızca alımın tarihi bilinen fiyattan ESKİYSE güncelleme yapılmaz;
 * geçmişe dönük girilen kayıt güncel fiyatı bozmaz.
 *
 * @returns {{currentPrice:number, priceUpdatedAt:string}|null} gerekmiyorsa null
 */
export function priceUpdateFromLot(asset, lot, nowMs = Date.now()) {
  const unitCost = Number(lot?.unitCost) || 0;
  if (unitCost <= 0 || !lot?.date) return null;

  const knownDate = typeof asset?.priceUpdatedAt === 'string' ? asset.priceUpdatedAt.slice(0, 10) : null;
  if (knownDate && lot.date < knownDate) return null;
  if (Number(asset?.currentPrice) === unitCost) return null;

  // Bugüne (veya ileri tarihe) girilen alımda damga "şu an"dır; geçmiş
  // tarihli alımda o günün ortası. Böylece "fiyat N gün önce güncellendi"
  // uyarısı da doğru kalır.
  const now = new Date(nowMs);
  const todayStr = toISODate(now);
  const priceUpdatedAt = lot.date >= todayStr ? now.toISOString() : `${lot.date}T12:00:00.000Z`;
  return { currentPrice: unitCost, priceUpdatedAt };
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

/** Son N ayın yatırım tutarı (eskiden yeniye) — "ayda ne biriktiriyorum". */
export function monthlyInvestBuckets(state, periodKey, months = 6) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const key = shiftPeriod(periodKey, -i);
    buckets.push({ periodKey: key, amount: investedInPeriod(state, key), isCurrent: i === 0 });
  }
  return buckets;
}

/** Tüm varlıkların son alımları, yeniden eskiye (varlık adıyla birlikte). */
export function recentLots(state, limit = 8) {
  const labels = new Map((state?.assets || []).map((a) => [a.id, a]));
  return (state?.investments || [])
    .filter((l) => l && labels.has(l.assetId))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((l) => ({
      ...l,
      label: labels.get(l.assetId).label,
      unit: unitOf(labels.get(l.assetId)),
      color: labels.get(l.assetId).color,
      asset: labels.get(l.assetId),
      total: lotTotal(l),
    }));
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
