// Yatırım defteri: alımlar (lot) tutulur, ortalama maliyet ve kâr/zarar
// hesaplanır. Fiyat elle girilir — uygulamanın sunucusu yok, borsa/kur
// servisine bağlanmadan her koşulda çalışsın diye.
//
// Bütçeden bağımsızdır: yatırım harcama sayılmaz, ayrı defterdir.
//
// Alım ve satım aynı koleksiyonda (investments) durur; satımda `side: 'sell'`
// yazılır, alanı olmayan eski kayıt alımdır. Böylece eski sürümü açık kalmış
// bir cihaz yeni kayıtları silmez ya da düşürmez (kayıt bazlı senkron bütün
// kaydı olduğu gibi taşır) — yalnızca satımı alım gibi gösterebilir.

import { isDateInPeriod, shiftPeriod } from './period.js';
import { toISODate, parseISODate } from './format.js';

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

/** Satım mı? `side` alanı olmayan (eski) kayıt alımdır. */
export function isSell(lot) {
  return lot?.side === 'sell';
}

// Alımlar ve satımlar tarih sırasıyla işlenir: satış, o güne kadar alınmış
// olandan fazlasını satamaz. Aynı güne düşenlerde alım önce gelir (sabah alıp
// akşam satmak mümkün), sonra oluşturulma anı.
function chronological(lots) {
  return [...lots].sort((a, b) => {
    if (a.date !== b.date) return String(a.date) < String(b.date) ? -1 : 1;
    if (isSell(a) !== isSell(b)) return isSell(a) ? 1 : -1;
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return ta - tb;
  });
}

/**
 * Alım/satımları ortalama maliyet yöntemiyle işler. Satış ortalama maliyeti
 * değiştirmez: elden çıkan miktar kadar maliyet düşer, satış fiyatı ile
 * ortalama maliyet farkı GERÇEKLEŞEN kâr olur.
 *
 * Satım yoksa eski toplama aynen yapılır (sıralama bile yok) — yalnızca alımı
 * olan mevcut kayıtların sayıları bu değişiklikten bir kuruş bile etkilenmez.
 */
function replay(lots) {
  const list = (lots || []).filter(Boolean);
  const ordered = list.some(isSell) ? chronological(list) : list;
  let quantity = 0;
  let cost = 0;
  let realized = 0;
  let soldQuantity = 0;
  let proceeds = 0;
  let oversold = false;
  for (const lot of ordered) {
    const q = Number(lot.quantity) || 0;
    const unit = Number(lot.unitCost) || 0;
    if (!isSell(lot)) {
      quantity += q;
      cost += q * unit;
      continue;
    }
    // Eldekinden fazlası satılamaz; fazlası yok sayılır ve işaretlenir.
    const sold = Math.min(q, quantity);
    if (q > quantity + 1e-9) oversold = true;
    if (sold <= 0) continue;
    const avg = quantity > 0 ? cost / quantity : 0;
    realized += sold * (unit - avg);
    proceeds += sold * unit;
    cost -= avg * sold;
    quantity -= sold;
    soldQuantity += sold;
    // Kayan nokta artığı: tamamı satıldıysa kalan sıfırdır.
    if (quantity < 1e-9) { quantity = 0; cost = 0; }
  }
  return { quantity, cost, realized, soldQuantity, proceeds, oversold };
}

// Piyasa fiyatı (js/marketPrices.js) isteğe bağlı bir TAHMİNDİR: varlıkta
// `priceSource` (ör. 'GRA') varsa ve önbellek tazeyse elle girilen fiyatın
// yerine alış fiyatı kullanılır. Varlık kaydına yazılmaz; hesap anında seçilir.
const MARKET_FRESH_MS = 3 * 24 * 60 * 60 * 1000;

/** @returns {{price:number, fetchedAt:string}|null} kullanılacak piyasa fiyatı, yoksa null */
export function marketPriceFor(asset, market, nowMs = Date.now()) {
  const symbol = asset?.priceSource;
  if (!symbol || !market?.quotes) return null;
  const buy = Number(market.quotes[symbol]?.buy);
  const at = Date.parse(market.fetchedAt);
  if (!(buy > 0) || !Number.isFinite(at) || nowMs - at > MARKET_FRESH_MS) return null;
  return { price: buy, fetchedAt: market.fetchedAt };
}

/**
 * Bir varlığın pozisyonu: elindeki miktar, toplam maliyet, ortalama maliyet,
 * güncel değer ve kâr/zarar (gerçekleşmemiş) ile satışlardan gerçekleşen kâr.
 *
 * Fiyat girilmemişse değer = maliyet kabul edilir; olmayan bir kârı varmış
 * gibi göstermek yerine `hasPrice: false` ile arayüze "fiyat gir" dedirtir.
 */
export function assetPosition(asset, lots, nowMs = Date.now(), market = null) {
  const { quantity, cost, realized, soldQuantity, proceeds, oversold } = replay(lots);
  const live = marketPriceFor(asset, market, nowMs);
  const price = live ? live.price : (Number(asset?.currentPrice) || 0);
  const hasPrice = price > 0;
  const value = hasPrice ? quantity * price : cost;
  const profit = value - cost;
  const all = lots || [];
  // Piyasa fiyatı kullanılıyorsa "bayat" ölçüsü onun çekilme anıdır.
  const priceStamp = live ? live.fetchedAt : asset?.priceUpdatedAt;
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
    realized,
    soldQuantity,
    proceeds,
    oversold,
    sellCount: all.filter(isSell).length,
    buyCount: all.filter((l) => !isSell(l)).length,
    lotCount: all.length,
    hasLots: all.length > 0,
    holding: quantity > 0,
    estimated: !!live,
    stale: hasPrice && quantity > 0 && staleDays(priceStamp, nowMs) > STALE_DAYS,
    staleDays: staleDays(priceStamp, nowMs),
  };
}

/**
 * Satım girilirken: eldeki miktar yeterli mi? Adayı (düzenlemede eski kaydın
 * yerine) listeye koyup tüm geçmişi baştan işler — geçmiş tarihli bir satış,
 * sonraki satışları da geçersiz kılabilir.
 *
 * @returns {{ok:boolean, available:number}} available: aday dışındaki alım/satımlarla elde kalan
 */
export function checkSell(state, assetId, candidate, excludeId = null) {
  const others = lotsOf(state, assetId).filter((l) => l.id !== excludeId);
  const base = replay(others);
  const withCandidate = replay([...others, { ...candidate, assetId, side: 'sell', id: '__aday__', createdAt: new Date().toISOString() }]);
  return { ok: !withCandidate.oversold && !base.oversold, available: base.quantity };
}

function staleDays(iso, nowMs) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((nowMs - t) / (1000 * 60 * 60 * 24));
}

/** Tüm portföy: değere göre büyükten küçüğe pozisyonlar + toplamlar. */
export function portfolioSummary(state, nowMs = Date.now(), market = null) {
  // Alımı olmayan varlık da listede kalır: kullanıcı önce varlığı tanımlayıp
  // sonra alım ekliyor; arada kart kaybolursa "nereye gitti?" sorusu doğar.
  const positions = (state?.assets || [])
    .map((a) => assetPosition(a, lotsOf(state, a.id), nowMs, market))
    .sort((a, b) => b.value - a.value);

  let totalCost = 0;
  let totalValue = 0;
  let totalRealized = 0;
  let staleCount = 0;
  let missingPrice = 0;
  for (const p of positions) {
    totalCost += p.cost;
    totalValue += p.value;
    totalRealized += p.realized;
    if (p.stale) staleCount += 1;
    // Tamamı satılmış varlığın fiyatsızlığı kimseyi ilgilendirmez.
    if (!p.hasPrice && !(p.hasLots && !p.holding)) missingPrice += 1;
  }
  const totalProfit = totalValue - totalCost;
  return {
    positions,
    totalCost,
    totalValue,
    totalProfit,
    totalRealized,
    profitPct: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
    staleCount,
    missingPrice,
    assetCount: positions.filter((p) => p.hasLots && p.holding).length,
    emptyCount: positions.filter((p) => !p.hasLots).length,
    soldOutCount: positions.filter((p) => p.hasLots && !p.holding).length,
    estimatedCount: positions.filter((p) => p.holding && p.estimated).length,
  };
}

/** Türe göre dağılım: altın ne kadar, döviz ne kadar? */
export function portfolioByKind(summary) {
  const groups = new Map();
  for (const p of summary?.positions || []) {
    if (!p.hasLots || !p.holding) continue;
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
    .filter((p) => p.holding && p.hasPrice && p.cost > 0)
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

/**
 * Bir varlığın alım formunda önerilecek birim fiyat. Piyasa fiyatı açıksa ve
 * tazeyse o (alış), değilse bilinen son fiyat. Yoksa null.
 */
export function suggestedUnitCost(asset, market = null, nowMs = Date.now()) {
  const live = marketPriceFor(asset, market, nowMs);
  if (live) return live.price;
  return Number(asset?.currentPrice) > 0 ? Number(asset.currentPrice) : null;
}

// --- Alım formu: miktar / birim fiyat / toplam tutar -----------------------
//
// Üçünden ikisi bilinince üçüncüsü hesaplanır: "5 gram" yazarsan tutar çıkar,
// "5.000 ₺" yazarsan gram çıkar. Hangi alanın hesaplandığı yazılana göre
// seçilir ve kullanıcının yazdığı hiçbir alanın üstüne yazılmaz — yalnızca
// az önce hesaplanmış alanlar yeniden hesaplanır.
//
//   miktar yazıldı  → fiyat varsa tutar, yoksa (tutar varsa) fiyat
//   tutar yazıldı   → fiyat varsa miktar, yoksa (miktar varsa) fiyat
//   fiyat yazıldı   → miktar varsa tutar, yoksa (tutar varsa) miktar
//
// Alan boşaltılırsa o alandan hesaplananlar da boşalır; eski sayı kalıp
// yanlış kaydedilmesin.

/** @returns {{quantity:number, price:number, total:number, derived:string[]}} */
export function emptyTrade(price = 0) {
  return { quantity: 0, price: Number(price) > 0 ? Number(price) : 0, total: 0, derived: [] };
}

/**
 * @param {{quantity:number, price:number, total:number, derived:string[]}} state
 * @param {'quantity'|'price'|'total'} field yazılan alan
 * @param {number} value yazılan değer (boş/geçersiz = 0)
 */
export function applyTradeEdit(state, field, value) {
  const next = { quantity: state.quantity, price: state.price, total: state.total, derived: [...state.derived] };
  // Önceki hesaplamaları at: kullanıcının yazdıkları kalsın, gerisi yeniden hesaplansın.
  next.derived = next.derived.filter((f) => f !== field);
  for (const f of next.derived) next[f] = 0;
  next.derived = [];

  const v = Number(value);
  next[field] = Number.isFinite(v) && v > 0 ? v : 0;
  if (!(next[field] > 0)) return next;

  const { quantity: q, price: p, total: t } = next;
  let target = null;
  if (field === 'quantity') target = p > 0 ? 'total' : (t > 0 ? 'price' : null);
  else if (field === 'total') target = p > 0 ? 'quantity' : (q > 0 ? 'price' : null);
  else target = q > 0 ? 'total' : (t > 0 ? 'quantity' : null);

  if (target === 'total') next.total = q * p;
  else if (target === 'quantity') next.quantity = t / p;
  else if (target === 'price') next.price = t / q;
  if (target) next.derived = [target];
  return next;
}

/** Girdi kutusuna yazılacak sayı: en çok `decimals` ondalık, sondaki sıfırlar atılır, virgüllü. */
export function formatInputNumber(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const fixed = n.toFixed(decimals);
  return (fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed).replace('.', ',');
}

// "Yatırıma ayrılan" yalnızca ALIMLARDIR: satış geliri bu toplamdan düşmez,
// ayrı satırda (soldInPeriod) görünür. Aksi halde bir satış, o ay hiç
// yatırım yapılmamış gibi gösterirdi.
/** Bir dönemde (maaş ayı) yatırıma ayrılan para. */
export function investedInPeriod(state, periodKey) {
  return (state?.investments || [])
    .filter((i) => i?.date && !isSell(i) && isDateInPeriod(i.date, periodKey))
    .reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
}

/** Bir dönemde satışlardan gelen para. */
export function soldInPeriod(state, periodKey) {
  return (state?.investments || [])
    .filter((i) => i?.date && isSell(i) && isDateInPeriod(i.date, periodKey))
    .reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
}

/** Takvim yılında yatırıma ayrılan para. */
export function investedInYear(state, year) {
  const prefix = String(year);
  return (state?.investments || [])
    .filter((i) => typeof i?.date === 'string' && !isSell(i) && i.date.slice(0, 4) === prefix)
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

/**
 * Tüm varlıkların alımları, yeniden eskiye (varlık bilgisiyle birlikte).
 * limit = 0 → hepsi (tam liste ve dışa aktarım için).
 */
export function recentLots(state, limit = 8) {
  const labels = new Map((state?.assets || []).map((a) => [a.id, a]));
  return (state?.investments || [])
    .filter((l) => l && labels.has(l.assetId))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit > 0 ? limit : undefined)
    .map((l) => ({
      ...l,
      label: labels.get(l.assetId).label,
      unit: unitOf(labels.get(l.assetId)),
      color: labels.get(l.assetId).color,
      kindLabel: kindOf(labels.get(l.assetId)).label,
      total: lotTotal(l),
      asset: labels.get(l.assetId),
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

// --- Fiyat geçmişi ---------------------------------------------------------
//
// Varlıkta tek bir güncel fiyat var; geçmiş iki kaynaktan okunur:
//   1. asset.priceLog: elle girilen/güncellenen fiyatların günlük kaydı
//      [{d: 'YYYY-MM-DD', p: fiyat}] — varlık kaydının İÇİNDE durur, böylece
//      eski sürüm bir cihaz kaydı taşırken geçmişi düşürmez.
//   2. Alım/satımların kendisi: 3 Mart'ta gramı 7.100'e aldıysan o gün fiyat
//      7.100'dür. Bu yüzden grafik, bu özellikten ÖNCE girilmiş kayıtlar için
//      de geriye dönük çalışır; hiçbir veri taşıma gerekmez.

const PRICE_LOG_MAX = 400;

function localDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

/**
 * Fiyat günlüğüne bir gözlem ekler: aynı güne düşen eskisinin yerine yazar,
 * sıralı tutar. Günlük sonsuza dek büyümesin diye 1 yıldan eski gözlemler
 * ayda bire iner (o ayın sonuncusu kalır) ve toplam sınırlanır.
 *
 * @returns {Array<{d:string,p:number}>} yeni günlük (verilen dizi değişmez)
 */
export function recordPrice(log, price, atISO) {
  const p = Number(price);
  const d = localDay(atISO);
  if (!(p > 0) || !d) return Array.isArray(log) ? log : [];
  const map = new Map((Array.isArray(log) ? log : []).filter((e) => e && e.d && e.p > 0).map((e) => [e.d, e.p]));
  map.set(d, p);
  let list = [...map].map(([day, price2]) => ({ d: day, p: price2 })).sort((a, b) => (a.d < b.d ? -1 : 1));

  if (list.length > 60) {
    const cutoff = new Date(list[list.length - 1].d);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cut = toISODate(cutoff);
    const lastOfMonth = new Map();
    for (const e of list) if (e.d < cut) lastOfMonth.set(e.d.slice(0, 7), e);
    list = [...lastOfMonth.values(), ...list.filter((e) => e.d >= cut)];
  }
  return list.length > PRICE_LOG_MAX ? list.slice(-PRICE_LOG_MAX) : list;
}

/** İki günlüğü birleştirir (senkron): aynı günde `preferred` kazanır. */
export function unionPriceLogs(preferred, other) {
  const map = new Map();
  for (const e of Array.isArray(other) ? other : []) if (e?.d && e.p > 0) map.set(e.d, e.p);
  for (const e of Array.isArray(preferred) ? preferred : []) if (e?.d && e.p > 0) map.set(e.d, e.p);
  return [...map].map(([d, p]) => ({ d, p })).sort((a, b) => (a.d < b.d ? -1 : 1));
}

/**
 * Bir varlığın bilinen fiyat gözlemleri, eskiden yeniye: günlük + alım/satım
 * fiyatları + güncel fiyat. Aynı güne düşenlerde elle girilen günlük, o da
 * güncel fiyat, alım/satımın önüne geçer.
 *
 * @returns {Array<{date:string, price:number}>}
 */
export function priceObservations(asset, lots, marketLog = null) {
  const map = new Map();
  const ordered = [...(lots || [])].filter((l) => l?.date && Number(l.unitCost) > 0)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)));
  for (const l of ordered) map.set(l.date, Number(l.unitCost));
  // Bu cihazda biriken piyasa kayıtları (yalnız fiyat kaynağı seçilmiş varlıkta).
  const sourceLog = asset?.priceSource && marketLog ? marketLog[asset.priceSource] : null;
  for (const e of Array.isArray(sourceLog) ? sourceLog : []) if (e?.d && e.p > 0) map.set(e.d, e.p);
  for (const e of Array.isArray(asset?.priceLog) ? asset.priceLog : []) if (e?.d && e.p > 0) map.set(e.d, e.p);
  const current = Number(asset?.currentPrice);
  const currentDay = asset?.priceUpdatedAt ? localDay(asset.priceUpdatedAt) : null;
  if (current > 0 && currentDay) map.set(currentDay, current);
  return [...map].map(([date, price]) => ({ date, price })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** `date` gününde (dahil) bilinen son fiyat; hiç gözlem yoksa null. */
export function priceAt(observations, date) {
  let found = null;
  for (const o of observations || []) {
    if (o.date <= date) found = o.price;
    else break;
  }
  return found;
}

/** Fiyatın son `days` günde yüzde değişimi; o güne ait bilgi yoksa null. */
export function priceChangePct(observations, days, nowMs = Date.now()) {
  if (!observations || observations.length < 2) return null;
  const last = observations[observations.length - 1];
  const since = new Date(nowMs);
  since.setDate(since.getDate() - days);
  const before = priceAt(observations, toISODate(since));
  if (!(before > 0)) return null;
  return ((last.price - before) / before) * 100;
}

export const HISTORY_RANGES = [
  { key: '3m', label: '3 ay', days: 91 },
  { key: '6m', label: '6 ay', days: 182 },
  { key: '1y', label: '1 yıl', days: 365 },
  { key: 'all', label: 'Tümü', days: null },
];

const HISTORY_POINTS = 24;

/**
 * Portföy değerinin zaman içindeki seyri: her tarihte o güne kadarki alım/
 * satımlarla elde olan miktar × o günün bilinen fiyatı. Maliyet çizgisi de
 * (yatırılan para) aynı noktalarda hesaplanır; ikisi arasındaki fark kârdır.
 *
 * Son nokta portfolioSummary ile BİREBİR aynıdır (pano ile grafik çelişmesin).
 * Ilk alımdan önceki günler yoktur: grafik ilk alımla başlar.
 *
 * @returns {{points:Array<{date:string,value:number,cost:number}>, from:string|null}}
 */
export function portfolioHistory(state, rangeKey = '6m', nowMs = Date.now(), { market = null, marketLog = null } = {}) {
  const summary = portfolioSummary(state, nowMs, market);
  const dates = (state?.investments || []).map((l) => l?.date).filter(Boolean).sort();
  if (dates.length === 0 || summary.positions.length === 0) return { points: [], from: null };

  const today = toISODate(new Date(nowMs));
  const first = dates[0] < today ? dates[0] : today;
  const range = HISTORY_RANGES.find((r) => r.key === rangeKey) || HISTORY_RANGES[1];
  let start = first;
  if (range.days) {
    const d = new Date(nowMs);
    d.setDate(d.getDate() - range.days);
    const rs = toISODate(d);
    if (rs > first) start = rs;
  }

  // Gün farkları yerel takvimle hesaplanır (DST'de 23/25 saatlik günler olsa da şaşmaz).
  const startDate = parseISODate(start);
  const spanDays = Math.max(1, Math.round((parseISODate(today) - startDate) / 86400000));
  const steps = Math.min(HISTORY_POINTS, spanDays);
  const days = new Set([today]);
  for (let i = 0; i <= steps; i += 1) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.round((spanDays * i) / steps));
    days.add(toISODate(d));
  }

  const prepared = summary.positions.map((p) => {
    const lots = lotsOf(state, p.assetId);
    return { lots, obs: priceObservations(p.asset, lots, marketLog) };
  });

  const points = [...days].sort().filter((d) => d <= today).map((date) => {
    let value = 0;
    let cost = 0;
    for (const { lots, obs } of prepared) {
      const upTo = lots.filter((l) => l.date <= date);
      if (upTo.length === 0) continue;
      const r = replay(upTo);
      if (r.quantity <= 0) continue;
      const price = priceAt(obs, date);
      value += price > 0 ? r.quantity * price : r.cost;
      cost += r.cost;
    }
    return { date, value, cost };
  }).filter((pt) => pt.cost > 0 || pt.value > 0);

  if (points.length > 0) {
    points[points.length - 1] = { date: today, value: summary.totalValue, cost: summary.totalCost };
  }
  return { points, from: points[0]?.date || null };
}
