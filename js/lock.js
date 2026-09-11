// Cihaz kilidi (PIN).
//
// NE YAPAR: uygulama açılırken bir kapı koyar. Derdi "PC'de açık kaldı,
// şirkette biri merak edip bakmasın".
//
// NE YAPMAZ — bunu gizlemek yanlış olur: veriyi ŞİFRELEMEZ. Kayıtlar
// localStorage'da düz duruyor; tarayıcının geliştirici araçlarını açan biri
// PIN'i hiç görmeden hepsini okur. Aynı şekilde senkron token'ına sahip olan
// gist'ten okur. Gerçek gizlilik isteniyorsa yapılacak şey bu değil, verinin
// PIN'den türetilen anahtarla şifrelenmesidir (o zaman PIN unutulunca veri de
// gider). Burada bilinçli olarak "kilit ekranı" yapılıyor.
//
// PIN'in KENDİSİ ASLA SAKLANMAZ: rastgele bir tuzla PBKDF2'den geçirilip
// yalnızca özeti tutulur. Kilit cihaza aittir, senkrona girmez — token gibi.
// Böylece hem "son yazan kazanır" ayar senkronu PIN'i oradan oraya taşımaz,
// hem de ulaşamadığın bir cihazda kendini kilitleme riski olmaz.

const LOCK_KEY = 'mesai.lock';

// Tarayıcıda ~0,1 sn süren bir maliyet. 4 haneli bir PIN'i kırılmaz yapmaz
// (10.000 ihtimal), ama "localStorage'ı açıp özeti gördüm, hemen buldum"
// durumunu da ortadan kaldırır.
const ITERATIONS = 150000;
const HASH = 'SHA-256';
const KEY_BITS = 256;

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 32;

function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) return null;
  return c.subtle;
}

/** Kilit özelliği bu tarayıcıda çalışır mı? (WebCrypto güvenli bağlam ister) */
export function lockSupported() {
  return !!subtle();
}

function readAll() {
  try {
    const raw = globalThis.localStorage?.getItem(LOCK_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Depolama yoksa SESSİZCE başarılı dönmemeli: kullanıcı kilit kurduğunu
// sanıp kurmamış olurdu. `?.` kullanmak tam da bunu yapıyordu.
function writeAll(map) {
  const store = globalThis.localStorage;
  if (!store) return false;
  try {
    if (Object.keys(map).length === 0) store.removeItem(LOCK_KEY);
    else store.setItem(LOCK_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function derive(pin, salt, iterations = ITERATIONS) {
  const s = subtle();
  if (!s) throw new Error('WebCrypto yok');
  const key = await s.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await s.deriveBits({ name: 'PBKDF2', salt, iterations, hash: HASH }, key, KEY_BITS);
  return new Uint8Array(bits);
}

/** Bu profilde kilit kurulu mu? */
export function hasPin(profileId) {
  const rec = readAll()[profileId];
  return !!(rec && rec.salt && rec.hash);
}

/** Kilit kurulu profillerin listesi — profil seçim ekranı kilit rozeti basar. */
export function lockedProfiles() {
  return Object.keys(readAll());
}

export function validatePin(pin) {
  const value = String(pin ?? '');
  if (value.length < MIN_PIN_LENGTH) return { ok: false, error: `En az ${MIN_PIN_LENGTH} karakter olmalı.` };
  if (value.length > MAX_PIN_LENGTH) return { ok: false, error: `En fazla ${MAX_PIN_LENGTH} karakter olabilir.` };
  return { ok: true };
}

/** PIN kurar/değiştirir. Düz PIN saklanmaz; tuz + özet saklanır. */
export async function setPin(profileId, pin) {
  const check = validatePin(pin);
  if (!check.ok) return check;
  if (!subtle()) return { ok: false, error: 'Bu tarayıcıda kilit kurulamıyor.' };

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  const map = readAll();
  map[profileId] = {
    salt: toBase64(salt),
    hash: toBase64(hash),
    iterations: ITERATIONS,
    createdAt: new Date().toISOString(),
  };
  return writeAll(map) ? { ok: true } : { ok: false, error: 'Kilit kaydedilemedi.' };
}

/**
 * PIN doğru mu? Sabit zamanlı karşılaştırma: yanlış PIN'in NERESİNİN yanlış
 * olduğu sürelerden anlaşılmasın.
 */
export async function verifyPin(profileId, pin) {
  const rec = readAll()[profileId];
  if (!rec || !rec.salt || !rec.hash) return false;
  if (!subtle()) return false;
  try {
    const salt = fromBase64(rec.salt);
    const expected = fromBase64(rec.hash);
    const actual = await derive(String(pin ?? ''), salt, Number(rec.iterations) || ITERATIONS);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** Kilidi kaldırır. Yalnız PIN'i bilen çağırsın diye doğrulama şart. */
export async function clearPin(profileId, pin) {
  if (!(await verifyPin(profileId, pin))) return { ok: false, error: 'PIN yanlış.' };
  const map = readAll();
  delete map[profileId];
  return writeAll(map) ? { ok: true } : { ok: false, error: 'Kilit kaldırılamadı.' };
}

// --- Oturum durumu --------------------------------------------------------
//
// "Şu an açık mı?" bilgisi sessionStorage'da: sekme kapanınca kendiliğinden
// düşer, yeni açılışta PIN yeniden sorulur.

const UNLOCK_KEY = 'mesai.lock.open';

export function markUnlocked(profileId) {
  try { globalThis.sessionStorage?.setItem(UNLOCK_KEY, `${profileId}:${Date.now()}`); } catch {}
}

export function lockNow() {
  try { globalThis.sessionStorage?.removeItem(UNLOCK_KEY); } catch {}
}

/**
 * Bu profil şu an açık sayılır mı?
 *
 * @param {number} maxIdleMs bu kadar süredir dokunulmadıysa yeniden sorulur.
 *   Asıl koruma bu: PC'de açık unutulan sekme bir süre sonra kendini kilitler.
 */
export function isUnlocked(profileId, maxIdleMs = 0) {
  if (!hasPin(profileId)) return true;
  let raw = null;
  try { raw = globalThis.sessionStorage?.getItem(UNLOCK_KEY); } catch { return false; }
  if (!raw) return false;
  const at = raw.lastIndexOf(':');
  if (at < 0 || raw.slice(0, at) !== profileId) return false;
  const stamp = Number(raw.slice(at + 1));
  if (!Number.isFinite(stamp)) return false;
  if (maxIdleMs > 0 && Date.now() - stamp > maxIdleMs) return false;
  return true;
}

/** Kullanıcı hareket ettikçe sayaç tazelenir. */
export function touchUnlocked(profileId) {
  if (isUnlocked(profileId)) markUnlocked(profileId);
}
