// Piyasa fiyatı (altın, döviz): TAHMİNİ güncel fiyat için isteğe bağlı kaynak.
//
// Uygulamanın sunucusu yok; fiyat, CORS'a açık herkese açık bir JSON
// kaynağından tarayıcıdan çekilir (Truncgil — TCMB kuru + serbest piyasa
// altın). Kullanıcının hiçbir verisi gönderilmez: yalnızca bir GET isteği.
//
// Tasarım kuralları (hepsi veriyi korumak için):
//   - Çekilen fiyat VARLIK KAYDINA YAZILMAZ. Yerelde, senkronlanmayan bir
//     önbellekte durur. Böylece her yenileme kayıt değiştirip buluta yazmaz,
//     iki cihaz birbirinin fiyatıyla yarışmaz, kullanıcının elle girdiği
//     fiyat hiç ezilmez.
//   - Kullanılan fiyat ALIŞ fiyatıdır: elindekini bozdursan eline geçecek
//     tutara en yakın tahmin (çeyrek altında alış-satış farkı %2 kadardır).
//   - Önbellek 3 günden eskiyse yok sayılır, elle girilen fiyata dönülür.
//   - Hata sessizdir: internet yok/kaynak kapalıysa uygulama eskisi gibi çalışır.

import { recordPrice } from './investments.js';

export const MARKET_URL = 'https://finans.truncgil.com/v4/today.json';
export const MARKET_FRESH_MS = 3 * 24 * 60 * 60 * 1000;
export const MARKET_MIN_INTERVAL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const CACHE_KEY = 'mesai.market';
const LOG_KEY = 'mesai.marketLog';
const NUDGE_KEY = 'mesai.marketNudgeDismissed';

// Hangi varlık hangi kaynak kodunu kullanır. Sıra önemli: "gram altın",
// genel "altın"dan önce eşleşmeli.
const SYMBOLS = [
  { symbol: 'GRA', label: 'Gram altın', words: ['gram altın', 'gram altin', 'gramaltın', 'has altın'] },
  { symbol: 'CEYREKALTIN', label: 'Çeyrek altın', words: ['çeyrek', 'ceyrek'] },
  { symbol: 'YARIMALTIN', label: 'Yarım altın', words: ['yarım altın', 'yarim altin', 'yarım'] },
  { symbol: 'TAMALTIN', label: 'Tam altın', words: ['tam altın', 'tam altin'] },
  { symbol: 'GUMUS', label: 'Gümüş', words: ['gümüş', 'gumus'] },
  { symbol: 'USD', label: 'Dolar', words: ['dolar', 'usd'] },
  { symbol: 'EUR', label: 'Euro', words: ['euro', 'eur'] },
  { symbol: 'GBP', label: 'Sterlin', words: ['sterlin', 'gbp'] },
];

export function symbolLabel(symbol) {
  return SYMBOLS.find((s) => s.symbol === symbol)?.label || symbol;
}

/** Varlığın kaynakta karşılığı var mı? Etiketten bulunur; yoksa null. */
export function symbolForAsset(asset) {
  const label = String(asset?.label || '').toLocaleLowerCase('tr');
  if (!label) return null;
  // "Dolar" varlığı döviz değilse (ör. "Dolar fonu") karıştırma.
  const kind = asset?.kind;
  for (const s of SYMBOLS) {
    if (!s.words.some((w) => label.includes(w))) continue;
    const isFx = ['USD', 'EUR', 'GBP'].includes(s.symbol);
    if (isFx && kind && kind !== 'doviz') continue;
    if (!isFx && kind && kind !== 'altin') continue;
    return s.symbol;
  }
  return null;
}

/**
 * Kaynağın JSON'unu {SYMBOL: {buy, sell}} biçimine çevirir. Bilinmeyen ya da
 * sıfır/anlamsız fiyatlar (ör. ONS: 0) atılır — sıfır fiyat portföyü sıfırlardı.
 */
export function parseMarket(json) {
  const quotes = {};
  for (const { symbol } of SYMBOLS) {
    const q = json?.[symbol];
    const buy = Number(q?.Buying);
    const sell = Number(q?.Selling);
    if (Number.isFinite(buy) && buy > 0) {
      quotes[symbol] = { buy, sell: Number.isFinite(sell) && sell > 0 ? sell : buy };
    }
  }
  return quotes;
}

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** Önbellekteki piyasa: {fetchedAt, quotes} ya da yoksa null. */
export function getCachedMarket() {
  const cached = readJSON(CACHE_KEY);
  if (!cached || typeof cached.fetchedAt !== 'string' || typeof cached.quotes !== 'object') return null;
  return cached;
}

/** Her sembol için günlük fiyat kaydı (yalnız bu cihazda): {GRA: [{d,p}]} */
export function getMarketLog() {
  const log = readJSON(LOG_KEY);
  return log && typeof log === 'object' ? log : {};
}

/** Önbellek, tahmin için kullanılabilecek kadar taze mi? */
export function isFresh(market, nowMs = Date.now()) {
  const t = Date.parse(market?.fetchedAt);
  return Number.isFinite(t) && nowMs - t <= MARKET_FRESH_MS;
}

/** Yenilemeye değer mi: önbellek yok ya da son çekimden beri yeterince zaman geçti. */
export function needsRefresh(market, nowMs = Date.now()) {
  const t = Date.parse(market?.fetchedAt);
  return !Number.isFinite(t) || nowMs - t >= MARKET_MIN_INTERVAL_MS;
}

/**
 * Fiyatı çeker ve önbelleğe/günlüğe yazar.
 *
 * @returns {Promise<{ok:boolean, market:object|null, error?:string}>} Hata durumunda
 *   `market` eldeki önbellektir (varsa) — çağıran yine de onu gösterebilir.
 */
export async function refreshMarket({ fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  const previous = getCachedMarket();
  if (typeof fetchImpl !== 'function') return { ok: false, market: previous, error: 'fetch yok' };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(MARKET_URL, { signal: controller?.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const quotes = parseMarket(await res.json());
    if (Object.keys(quotes).length === 0) throw new Error('fiyat bulunamadı');

    const market = { fetchedAt: new Date(nowMs).toISOString(), quotes };
    writeJSON(CACHE_KEY, market);

    const log = getMarketLog();
    for (const [symbol, q] of Object.entries(quotes)) {
      log[symbol] = recordPrice(log[symbol], q.buy, market.fetchedAt);
    }
    writeJSON(LOG_KEY, log);
    return { ok: true, market };
  } catch (err) {
    return { ok: false, market: previous, error: err?.name === 'AbortError' ? 'zaman aşımı' : String(err?.message || err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function nudgeDismissed() {
  try { return window.localStorage.getItem(NUDGE_KEY) === '1'; } catch { return false; }
}

export function dismissNudge() {
  try { window.localStorage.setItem(NUDGE_KEY, '1'); } catch {}
}
