// Profil seçme ekranının küçük yardımcıları.
//
// Kart üzerinde "kaç kayıt var, en son ne zaman girildi" yazınca ekran bir
// giriş kapısı olmaktan çıkıp kime ait olduğunu söyleyen bir yer oluyor.
// Hepsi saf: localStorage okuyucusu dışarıdan verilir, testlenebilir kalır.

export const STATE_PREFIX = 'mesai.state.';
export const LAST_SEEN_PREFIX = 'mesai.lastSeen.';

/**
 * @param {(key:string)=>?string} readItem localStorage.getItem gibi
 * @returns {{entries:number, lastSeen:?string}}
 */
export function profileSummary(readItem, id) {
  let entries = 0;
  let lastSeen = null;
  try {
    const raw = readItem(STATE_PREFIX + id);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.entries)) entries = parsed.entries.length;
    }
  } catch { /* bozuk kayıt: sayı 0 kalır, ekran yine açılır */ }
  try {
    const seen = readItem(LAST_SEEN_PREFIX + id);
    if (seen && !Number.isNaN(Date.parse(seen))) lastSeen = seen;
  } catch { /* yok sayılır */ }
  return { entries, lastSeen };
}

/** Saate göre selam. */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'Günaydın';
  if (h >= 11 && h < 17) return 'İyi günler';
  if (h >= 17 && h < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

/** "bugün" / "dün" / "3 gün önce" — daha eskisi tarih olarak yazılır. */
export function relativeDay(nowMs, iso) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const startOf = (ms) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOf(nowMs) - startOf(then)) / 86400000);

  if (days <= 0) return 'bugün';
  if (days === 1) return 'dün';
  if (days < 30) return `${days} gün önce`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} ay önce` : 'uzun zaman önce';
}

/** Kartlarda gösterilecek alt satır. */
export function profileLine(summary, nowMs = Date.now()) {
  const parts = [];
  if (summary.entries > 0) parts.push(`${summary.entries} kayıt`);
  const seen = relativeDay(nowMs, summary.lastSeen);
  if (seen) parts.push(seen);
  return parts.length ? parts.join(' · ') : 'yeni profil';
}
