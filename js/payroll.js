// Ücret hesap motoru. Tüm fonksiyonlar saf (yan etkisiz).

import { isDateInPeriod } from './period.js';

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

// Girilen "bugün kaçta girdim / kaçta çıktım" saatlerinden, haftalık çalışma
// programına göre mesai (fazla mesai) süresini çıkarır. Programda o gün
// kapalıysa (örn. Pazar) girişten çıkışa kadarki her şey mesai sayılır;
// açıksa yalnızca planlanan bitiş saatinden sonrası mesai sayılır.
export function shiftOvertime(date, shiftStart, shiftEnd, settings) {
  const daySchedule = settings.weeklySchedule?.[date.getDay()];
  const totalHours = hoursBetween(shiftStart, shiftEnd);

  if (!daySchedule || !daySchedule.works) {
    return { scheduled: null, totalHours, overtimeHours: totalHours, windowStart: shiftStart, windowEnd: shiftEnd };
  }

  const overtimeHours = timeToMinutes(shiftEnd) > timeToMinutes(daySchedule.end)
    ? hoursBetween(daySchedule.end, shiftEnd)
    : 0;

  return {
    scheduled: daySchedule,
    totalHours,
    overtimeHours,
    windowStart: daySchedule.end,
    windowEnd: shiftEnd,
  };
}

const EMPTY_TYPE_TOTALS = () => ({
  normal: { hours: 0, amount: 0 },
  weekend: { hours: 0, amount: 0 },
  holiday: { hours: 0, amount: 0 },
});

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
  const netTotal = baseSalary + overtimePay + bonuses - advances - deductions;

  return {
    periodKey,
    totalHours,
    entryCount: entries.length,
    byType,
    overtimePay,
    baseSalary,
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
  for (let m = 1; m <= 12; m++) {
    const periodKey = `${year}-${String(m).padStart(2, '0')}`;
    const summary = periodSummary(state, periodKey);
    months.push({ periodKey, month: m, hours: summary.totalHours, amount: summary.overtimePay });
    totalHours += summary.totalHours;
    totalOvertimePay += summary.overtimePay;
  }
  return { year, months, totalHours, totalOvertimePay };
}
