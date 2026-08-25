// Gelinmeyen günler: izin, rapor, devamsızlık.
//
// Maaşa dokunmaz — yıllık izin ücretlidir, rapor SGK'dan ödenir ve uygulama
// zaten "cebe geçen"i bordrodan alır. Etkilediği tek şey YAN ÖDEME günü:
// gelinmeyen güne yemek kartı yüklenmez, yol parası ödenmez. Bugüne kadar
// uygulama bunu bilmediği için yemek/yol beklentisi şişiyor ve boş yere
// "eksik yatmış" diyordu.

import { periodKeyFromISODate } from './period.js';

export const ABSENCE_KINDS = [
  { key: 'izin', label: 'Yıllık izin', short: 'İzin', color: '#2f63c4' },
  { key: 'ucretsiz', label: 'Ücretsiz izin', short: 'Ücrt', color: '#8a5a2b' },
  { key: 'rapor', label: 'Rapor', short: 'Rapor', color: '#c2568e' },
  { key: 'devamsiz', label: 'Devamsızlık', short: 'Yok', color: '#b0431f' },
];

const BY_KEY = new Map(ABSENCE_KINDS.map((k) => [k.key, k]));

export function absenceKind(key) {
  return BY_KEY.get(key) || ABSENCE_KINDS[0];
}

/** Bir günün kaydı (varsa). */
export function absenceOn(state, dateISO) {
  return (state?.absences || []).find((a) => a && a.date === dateISO) || null;
}

/** Dönemdeki gelinmeyen gün tarihleri. */
export function absenceDatesInPeriod(state, periodKey) {
  return (state?.absences || [])
    .filter((a) => a?.date && periodKeyFromISODate(a.date) === periodKey)
    .map((a) => a.date);
}

/** Dönemin kayıtları, tarihe göre sıralı. */
export function absencesInPeriod(state, periodKey) {
  return (state?.absences || [])
    .filter((a) => a?.date && periodKeyFromISODate(a.date) === periodKey)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Yıl bazında tür sayımı: "bu yıl 8 gün yıllık izin, 2 gün rapor". */
export function absenceStats(state, year) {
  const prefix = String(year);
  const counts = Object.fromEntries(ABSENCE_KINDS.map((k) => [k.key, 0]));
  let total = 0;
  for (const a of state?.absences || []) {
    if (typeof a?.date !== 'string' || a.date.slice(0, 4) !== prefix) continue;
    if (counts[a.kind] === undefined) continue;
    counts[a.kind] += 1;
    total += 1;
  }
  return { year, counts, total };
}
