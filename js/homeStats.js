// Özet ekranının türetilmiş sayıları. Hepsi saf: DOM'a dokunmaz, tarihi
// dışarıdan alır. Böylece hesaplar testlenebilir ve UI yalnız çizimle uğraşır.

import { periodRange, isDateInPeriod } from './period.js';
import { toISODate } from './format.js';
import { isHoliday } from './holidays.js';

// Rekor ve "en yoğun gün" için alt sınır: az kayıtla kalıp çıkarmak yanıltır.
const MIN_ENTRIES = 5;

function hoursOf(entry) {
  return Number(entry?.hours) || 0;
}

function minutesOfTime(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Dönemin ne kadarı geçti? Geçmiş dönemlerde ratio 1, gelecek dönemlerde 0.
export function periodProgress(periodKey, todayISOStr) {
  const { startISO, endISO } = periodRange(periodKey);
  const totalDays = Number(endISO.slice(8, 10));

  if (todayISOStr < startISO) return { elapsedDays: 0, totalDays, ratio: 0 };
  if (todayISOStr > endISO) return { elapsedDays: totalDays, totalDays, ratio: 1 };

  const elapsedDays = Number(todayISOStr.slice(8, 10));
  return { elapsedDays, totalDays, ratio: elapsedDays / totalDays };
}

// "Bu hızla ay sonunda ne olur?" — dönem bittiyse veya hiç başlamadıysa tahmin
// yapılmaz (tahmin edilecek bir şey kalmamıştır).
export function projectPeriod(summary, progress) {
  if (!progress || progress.ratio <= 0 || progress.ratio >= 1) return null;
  // Tahmin zaten kaba bir sayı; uygulamanın geri kalanı gibi çeyrek saate ve
  // tam liraya yuvarlanır — "~32,48 sa" gibi sahte bir kesinlik göstermeyelim.
  return {
    hours: Math.round((summary.totalHours / progress.ratio) * 4) / 4,
    pay: Math.round(summary.overtimePay / progress.ratio),
    // İlk günlerde tek bir mesai bütün ayı yanlış temsil eder.
    reliable: progress.elapsedDays >= 5,
  };
}

// Mesai, maaşın yüzde kaçı kadar ek getirdi? Maaş girilmemişse anlamsız.
export function overtimeShare(summary) {
  const base = Number(summary?.baseSalary) || 0;
  if (base <= 0) return null;
  return (Number(summary.overtimePay) || 0) / base;
}

// Pazartesi başlangıçlı haftanın pazartesisi.
function mondayOf(date) {
  const offset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
}

// Son N haftanın mesai toplamı, eskiden yeniye. Boş haftalar 0 ile yer tutar —
// grafikte delik olmaması ve haftaların hep aynı sırada durması için.
export function weeklyBuckets(entries, weeks = 6, todayISOStr = toISODate(new Date())) {
  const [y, m, d] = todayISOStr.split('-').map(Number);
  const thisMonday = mondayOf(new Date(y, m - 1, d));

  const buckets = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - i * 7);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    buckets.push({
      mondayISO: toISODate(monday),
      sundayISO: toISODate(sunday),
      hours: 0,
      isCurrent: i === 0,
    });
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const date = entry?.date;
    if (!date) continue;
    // Kova sayısı sabit ve küçük; doğrusal arama yeterli ve okunur.
    const bucket = buckets.find((b) => date >= b.mondayISO && date <= b.sundayISO);
    if (bucket) bucket.hours += hoursOf(entry);
  }

  return buckets;
}

// Dönemin en uzun tek mesaisi.
export function periodRecord(entries, periodKey, minEntries = MIN_ENTRIES) {
  const inPeriod = (Array.isArray(entries) ? entries : []).filter((e) => e?.date && isDateInPeriod(e.date, periodKey));
  if (inPeriod.length < minEntries) return null;

  // Eşitlikte daha yeni tarih kazanır; sonuç her çağrıda aynı olsun diye
  // tam sıralı bir karşılaştırma.
  let best = null;
  for (const entry of inPeriod) {
    if (!best) { best = entry; continue; }
    const diff = hoursOf(entry) - hoursOf(best);
    if (diff > 0 || (diff === 0 && entry.date > best.date)) best = entry;
  }
  return { date: best.date, hours: hoursOf(best), type: best.type };
}

// En çok hangi gün mesai yapılıyor? Tüm kayıtlara bakar (kalıp uzun sürede belli olur).
export function busiestWeekday(entries, minEntries = MIN_ENTRIES) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e?.date);
  if (list.length < minEntries) return null;

  const byDay = Array.from({ length: 7 }, () => ({ count: 0, hours: 0 }));
  for (const entry of list) {
    const [y, m, d] = entry.date.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    byDay[weekday].count += 1;
    byDay[weekday].hours += hoursOf(entry);
  }

  let bestDay = -1;
  for (let day = 0; day < 7; day += 1) {
    if (byDay[day].count === 0) continue;
    if (bestDay === -1) { bestDay = day; continue; }
    const a = byDay[day];
    const b = byDay[bestDay];
    // Önce kayıt sayısı, eşitse toplam saat; ikisi de eşitse küçük gün indeksi
    // (döngü sırası gereği zaten korunur) — sonuç kararlı.
    if (a.count > b.count || (a.count === b.count && a.hours > b.hours)) bestDay = day;
  }
  if (bestDay === -1) return null;
  return { weekday: bestDay, count: byDay[bestDay].count, hours: byDay[bestDay].hours };
}

// Bugün çalışma günüyse, paydos saati geçtiyse ve hiç kayıt girilmediyse
// hatırlat. Amaç veri eksik kalmasın; ama pazar/tatilde veya mesai bitmeden
// rahatsız etmemek için koşullar dar tutuldu.
export function todayNudge(state, now = new Date()) {
  const todayStr = toISODate(now);
  const schedule = state?.settings?.weeklySchedule?.[now.getDay()];

  if (!schedule || schedule.works !== true) return { show: false, reason: 'calisma-gunu-degil' };
  if (isHoliday(todayStr)) return { show: false, reason: 'resmi-tatil' };

  const endMinutes = minutesOfTime(schedule.end);
  if (endMinutes === null) return { show: false, reason: 'program-eksik' };
  if (now.getHours() * 60 + now.getMinutes() < endMinutes) return { show: false, reason: 'mesai-bitmedi' };

  const hasEntry = (state.entries || []).some((e) => e?.date === todayStr);
  if (hasEntry) return { show: false, reason: 'kayit-var' };

  return { show: true, reason: 'eksik', date: todayStr };
}

export { MIN_ENTRIES };
