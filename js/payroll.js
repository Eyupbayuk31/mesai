// Ücret hesap motoru. Tüm fonksiyonlar saf (yan etkisiz).

import { isDateInPeriod } from './period.js';
import { isHoliday } from './holidays.js';

export function hourlyRate(settings) {
  const salary = Number(settings.monthlySalary) || 0;
  const divisor = Number(settings.hoursDivisor) || 225;
  if (divisor <= 0) return 0;
  return salary / divisor;
}

export function entryAmount(entry, settings) {
  const rate = hourlyRate(settings);
  const multiplier = settings.multipliers?.[entry.type] ?? 1;
  const hours = Number(entry.hours) || 0;
  return hours * rate * multiplier;
}

// Başlangıç/bitiş saatinden süre hesapla. Gece yarısını geçen vardiyayı
// destekler (örn. 22:00 -> 02:00 = 4 saat). 15 dakikalık hassasiyetle.
export function hoursBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60; // ertesi güne sarkar
  const diffMinutes = endMinutes - startMinutes;
  return Math.round((diffMinutes / 60) * 4) / 4; // 15 dk hassasiyet
}

export function crossesMidnight(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em <= sh * 60 + sm;
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// "18:00" + 45 dakika -> "18:45". Gün sınırını aşarsa 24 saat içinde sarar.
export function addMinutesToTime(time, minutes) {
  const total = ((timeToMinutes(time) + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// [aStart,aEnd) ile [bStart,bEnd) aralıklarının kesişim süresi (saat).
function overlapHours(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(timeToMinutes(aStart), timeToMinutes(bStart));
  const end = Math.min(timeToMinutes(aEnd), timeToMinutes(bEnd));
  return Math.max(0, end - start) / 60;
}

// Bir zaman aralığından, ayarlarda tanımlı mola penceresiyle kesişen kısmı
// düşer (örn. mesai 18:00-21:00 sürerken 18:30-19:00 arası yemek molasıysa
// gerçek mesai 2,5 saat sayılır, 3 saat değil).
function subtractBreak(windowStart, windowEnd, rawHours, settings) {
  const bw = settings.breakWindow;
  if (!bw || !bw.enabled) return { hours: rawHours, breakHours: 0 };
  const overlap = overlapHours(windowStart, windowEnd, bw.start, bw.end);
  const breakHours = Math.min(overlap, rawHours);
  const hours = Math.max(0, Math.round((rawHours - breakHours) * 4) / 4);
  return { hours, breakHours };
}

// Girilen "bugün kaçta girdim / kaçta çıktım" saatlerinden, haftalık çalışma
// programına göre mesai (fazla mesai) süresini çıkarır. Programda o gün
// kapalıysa (örn. Pazar) girişten çıkışa kadarki her şey mesai sayılır;
// açıksa yalnızca planlanan bitiş saatinden sonrası mesai sayılır. Ayarlarda
// tanımlı mola penceresiyle kesişen süre her iki durumda da düşülür.
export function shiftOvertime(date, shiftStart, shiftEnd, settings) {
  const daySchedule = settings.weeklySchedule?.[date.getDay()];
  const totalHours = hoursBetween(shiftStart, shiftEnd);

  if (!daySchedule || !daySchedule.works) {
    const { hours, breakHours } = subtractBreak(shiftStart, shiftEnd, totalHours, settings);
    return { scheduled: null, totalHours, overtimeHours: hours, breakHours, windowStart: shiftStart, windowEnd: shiftEnd };
  }

  const rawOvertimeHours = timeToMinutes(shiftEnd) > timeToMinutes(daySchedule.end)
    ? hoursBetween(daySchedule.end, shiftEnd)
    : 0;
  const { hours, breakHours } = rawOvertimeHours > 0
    ? subtractBreak(daySchedule.end, shiftEnd, rawOvertimeHours, settings)
    : { hours: 0, breakHours: 0 };

  return {
    scheduled: daySchedule,
    totalHours,
    overtimeHours: hours,
    breakHours,
    windowStart: daySchedule.end,
    windowEnd: shiftEnd,
  };
}

const EMPTY_TYPE_TOTALS = () => ({
  normal: { hours: 0, amount: 0 },
  weekend: { hours: 0, amount: 0 },
  holiday: { hours: 0, amount: 0 },
});

// Dönemin günlük yan ödeme (yemek/yol parası) gün sayısı: haftalık programda
// çalışılan günler; resmi tatile denk gelenler düşülür (o gün kart yüklenmez).
export function workdaysForPeriod(periodKey, settings) {
  const [y, m] = periodKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${periodKey}-${String(day).padStart(2, '0')}`;
    const dow = new Date(y, m - 1, day).getDay();
    if (settings.weeklySchedule?.[dow]?.works && !isHoliday(iso)) count++;
  }
  return count;
}

export function periodSummary(state, periodKey) {
  const settings = state.settings;
  const entries = state.entries.filter((e) => isDateInPeriod(e.date, periodKey));
  const adjustments = state.adjustments.filter((a) => a.periodKey === periodKey);

  const byType = EMPTY_TYPE_TOTALS();
  let totalHours = 0;
  let overtimePay = 0;

  for (const entry of entries) {
    const amount = entryAmount(entry, settings);
    const hours = Number(entry.hours) || 0;
    const bucket = byType[entry.type] || byType.normal;
    bucket.hours += hours;
    bucket.amount += amount;
    totalHours += hours;
    overtimePay += amount;
  }

  let bonuses = 0;
  let advances = 0;
  let deductions = 0;
  for (const adj of adjustments) {
    const amount = Number(adj.amount) || 0;
    if (adj.kind === 'bonus') bonuses += amount;
    else if (adj.kind === 'advance') advances += amount;
    else if (adj.kind === 'deduction') deductions += amount;
  }

  const baseSalary = Number(settings.monthlySalary) || 0;
  const mealAllowance = Number(settings.mealAllowance) || 0;
  const transportAllowance = Number(settings.transportAllowance) || 0;
  const allowanceDays = (mealAllowance > 0 || transportAllowance > 0)
    ? workdaysForPeriod(periodKey, settings)
    : 0;
  const mealPay = allowanceDays * mealAllowance;
  const transportPay = allowanceDays * transportAllowance;
  const netTotal = baseSalary + overtimePay + mealPay + transportPay + bonuses - advances - deductions;

  return {
    periodKey,
    totalHours,
    entryCount: entries.length,
    byType,
    overtimePay,
    baseSalary,
    allowanceDays,
    mealAllowance,
    mealPay,
    transportAllowance,
    transportPay,
    bonuses,
    advances,
    deductions,
    netTotal,
    entries,
    adjustments,
  };
}

export function yearSummary(state, year) {
  const months = [];
  let totalHours = 0;
  let totalOvertimePay = 0;
  let totalMealPay = 0;
  let totalTransportPay = 0;
  for (let m = 1; m <= 12; m++) {
    const periodKey = `${year}-${String(m).padStart(2, '0')}`;
    const summary = periodSummary(state, periodKey);
    months.push({
      periodKey,
      month: m,
      hours: summary.totalHours,
      amount: summary.overtimePay,
      meal: summary.mealPay,
      transport: summary.transportPay,
    });
    totalHours += summary.totalHours;
    totalOvertimePay += summary.overtimePay;
    totalMealPay += summary.mealPay;
    totalTransportPay += summary.transportPay;
  }
  return { year, months, totalHours, totalOvertimePay, totalMealPay, totalTransportPay };
}
