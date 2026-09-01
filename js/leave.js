// Yıllık izin hakkı (İş Kanunu md. 53 ve 56).
//
// Gelinmeyen günler sayfası izin günlerini zaten işaretliyordu ama "kaç günüm
// kaldı?" sorusuna cevap veremiyordu. Eksik olan tek girdi işe giriş tarihi:
// ondan kıdem, kıdemden hak çıkıyor.
//
// İki kural hesabın belkemiği:
//   md. 53 — hak 1 yılı doldurunca doğar; 1-5 yıl 14, 5-15 yıl 20, 15+ 26 gün.
//            18 yaşından küçük / 50 yaşından büyük işçiye en az 20 gün.
//   md. 56 — izin İŞ GÜNÜ sayılır: izne denk gelen hafta tatili ve resmi
//            tatil izinden DÜŞMEZ. Bu yüzden kullanılan gün sayılırken
//            haftalık program ve tatil takvimi süzgeci uygulanır.

import { parseISODate, toISODate } from './format.js';
import { isOffDay } from './holidays.js';

/** Kıdeme göre yıllık izin hakkı (gün). */
export function entitlementFor(years, { minimum20 = false } = {}) {
  const y = Number(years) || 0;
  if (y < 1) return 0;
  let days;
  if (y < 5) days = 14;
  else if (y < 15) days = 20;
  else days = 26;
  // md. 53: 18 yaşından küçük ve 50 yaşından büyük işçiye en az 20 gün.
  return minimum20 ? Math.max(days, 20) : days;
}

// Yıldönümü: 29 Şubat'ta işe girildiyse artık olmayan yılda 28 Şubat sayılır.
function anniversary(hireDate, yearsLater) {
  const d = parseISODate(hireDate);
  const year = d.getFullYear() + yearsLater;
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d.getDate(), lastDay));
}

/** Kıdem: tam yıl, ay ve bir sonraki yıldönümü. */
export function seniority(hireDate, asOfISO) {
  if (!hireDate) return null;
  const start = parseISODate(hireDate);
  const asOf = parseISODate(asOfISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(asOf.getTime())) return null;

  let years = asOf.getFullYear() - start.getFullYear();
  if (anniversary(hireDate, years) > asOf) years -= 1;
  years = Math.max(0, years);

  const last = anniversary(hireDate, years);
  let months = (asOf.getFullYear() - last.getFullYear()) * 12 + (asOf.getMonth() - last.getMonth());
  if (asOf.getDate() < last.getDate()) months -= 1;
  months = Math.max(0, months);

  const next = anniversary(hireDate, years + 1);
  return {
    years,
    months,
    nextAnniversary: toISODate(next),
    daysToNext: Math.max(0, Math.round((next - asOf) / 86400000)),
  };
}

/**
 * İzin yılları: işe giriş yıldönümünden başlar, takvim yılından değil —
 * bordro/İK de böyle hesaplıyor. Hak, o yılın SONUNDA doldurulan kıdeme
 * göredir (1. yılın sonunda 14 gün doğar).
 */
export function leaveYears(hireDate, asOfISO, { minimum20 = false } = {}) {
  const s = seniority(hireDate, asOfISO);
  if (!s) return [];
  const out = [];
  for (let i = 1; i <= s.years; i += 1) {
    const entitled = entitlementFor(i, { minimum20 });
    if (entitled <= 0) continue;
    out.push({
      index: i,
      // Hak i. yılın sonunda doğar, i+1. yıl boyunca kullanılır.
      start: toISODate(anniversary(hireDate, i)),
      end: toISODate(new Date(anniversary(hireDate, i + 1).getTime() - 86400000)),
      entitled,
    });
  }
  return out;
}

/**
 * Bir günün izin hakkından düşüp düşmediği: yalnız çalışılacak günler sayılır
 * (md. 56 — hafta tatili ve resmi tatil izinden düşmez).
 */
export function countsAgainstLeave(dateISO, settings) {
  const dow = parseISODate(dateISO).getDay();
  if (!settings?.weeklySchedule?.[dow]?.works) return false;
  return !isOffDay(dateISO, settings);
}

/** Yıllık izin defteri: hak, kullanılan, kalan. */
export function leaveLedger(state, settings, asOfISO) {
  const hireDate = settings?.hireDate || '';
  const minimum20 = !!settings?.leaveMinimum20;

  if (!hireDate) {
    return {
      hasHireDate: false, seniority: null, years: [],
      totalEntitled: 0, totalUsed: 0, remaining: 0, over: 0,
      notEarnedYet: false, firstRightDate: null, daysToFirstRight: 0,
    };
  }

  const s = seniority(hireDate, asOfISO);
  const years = leaveYears(hireDate, asOfISO, { minimum20 });

  // Yalnız 'izin' türü yıllık izinden düşer; ücretsiz izin, rapor ve
  // devamsızlık ayrı kalemlerdir.
  const used = (state?.absences || [])
    .filter((a) => a && a.kind === 'izin' && typeof a.date === 'string')
    .filter((a) => a.date >= hireDate)
    .filter((a) => countsAgainstLeave(a.date, settings))
    .map((a) => a.date)
    .sort();

  const rows = years.map((y) => ({
    ...y,
    used: used.filter((d) => d >= y.start && d <= y.end).length,
  }));

  // Hak doğmadan önce kullanılan günler (avans izin) da toplamdan düşülür;
  // yoksa "kalan" olduğundan fazla görünürdü.
  const totalEntitled = rows.reduce((sum, y) => sum + y.entitled, 0);
  const totalUsed = used.length;
  const diff = totalEntitled - totalUsed;

  const firstRight = anniversary(hireDate, 1);
  const notEarnedYet = s.years < 1;

  return {
    hasHireDate: true,
    seniority: s,
    years: rows,
    totalEntitled,
    totalUsed,
    remaining: Math.max(0, diff),
    over: Math.max(0, -diff),
    notEarnedYet,
    firstRightDate: toISODate(firstRight),
    daysToFirstRight: Math.max(0, Math.round((firstRight - parseISODate(asOfISO)) / 86400000)),
  };
}
