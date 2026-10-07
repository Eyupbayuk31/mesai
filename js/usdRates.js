// Geçmiş USD/TRY kurları: "dolar bazında getiri" için. Altının liradaki kazancı
// çoğu zaman liranın değer kaybıdır; asıl soru "dolar cinsinden kazandı mı?".
//
// Kaynak: Frankfurter (AİMB/ECB referans kuru, iş günleri), CORS açık, anahtarsız.
// Hafta sonu/tatil için son bilinen iş günü kuru geçerlidir. Yaklaşıktır: banka
// ya da kuyumcu kuru ile ECB referansı arasında kuruş farkı olur.
//
// Gizlilik: istek yalnızca "geçen yılın 20 Aralığı → bugün" aralığını taşır; ilk
// alımının tarihi değil yalnızca YILI sızar. Veri yalnız bu cihazda önbelleklenir,
// senkronlanmaz (geçmiş kurlar değişmez; her cihaz kendisi çeker).

export const USD_RANGE_URL = 'https://api.frankfurter.dev/v1';
const CACHE_KEY = 'mesai.usdRates';
const REFRESH_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;

/** İlk alım tarihinden, hafta sonu/yılbaşı boşluğunu kapatacak başlangıç: önceki yılın 20 Aralığı. */
export function usdFetchFrom(firstDate) {
  const year = Number(String(firstDate).slice(0, 4));
  return Number.isFinite(year) && year > 1999 ? `${year - 1}-12-20` : null;
}

/** {"2026-08-03": {"TRY": 47.5}} → {"2026-08-03": 47.5}; geçersiz/sıfır kurlar atılır. */
export function parseUsdRates(json) {
  const out = {};
  for (const [date, v] of Object.entries(json?.rates || {})) {
    const rate = Number(v?.TRY);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(rate) && rate > 0) out[date] = rate;
  }
  return out;
}

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const c = raw ? JSON.parse(raw) : null;
    return c && typeof c.rates === 'object' && typeof c.from === 'string' ? c : null;
  } catch {
    return null;
  }
}

/** @returns {{rates:Object, from:string, fetchedAt:string}|null} */
export function getCachedUsdRates() {
  return readCache();
}

/** Yeniden çekmeye değer mi: önbellek yok, gereken başlangıçtan genç, ya da 6 saatten eski. */
export function needsUsdFetch(cache, from, nowMs = Date.now()) {
  if (!from) return false;
  if (!cache) return true;
  if (cache.from > from) return true;
  const t = Date.parse(cache.fetchedAt);
  return !Number.isFinite(t) || nowMs - t >= REFRESH_MS;
}

/** `date` gününde (dahil) bilinen son kur; öncesinde veri yoksa null. */
export function usdAt(rates, date) {
  let best = null;
  let bestDate = '';
  for (const d of Object.keys(rates || {})) {
    if (d <= date && d >= bestDate) { bestDate = d; best = rates[d]; }
  }
  return best;
}

/** En yeni bilinen kur ya da null. */
export function latestUsdRate(rates) {
  const dates = Object.keys(rates || {}).sort();
  return dates.length ? rates[dates[dates.length - 1]] : null;
}

export async function refreshUsdRates({ from, fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  const previous = readCache();
  if (!from || typeof fetchImpl !== 'function') return { ok: false, cache: previous };
  const to = new Date(nowMs).toISOString().slice(0, 10);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(`${USD_RANGE_URL}/${from}..${to}?base=USD&symbols=TRY`, { signal: controller?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rates = parseUsdRates(await res.json());
    if (Object.keys(rates).length === 0) throw new Error('kur bulunamadı');
    const cache = { rates, from, fetchedAt: new Date(nowMs).toISOString() };
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
    return { ok: true, cache };
  } catch (err) {
    return { ok: false, cache: previous, error: String(err?.message || err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
