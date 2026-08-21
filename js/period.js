// Dönem = takvim ayı. Ödeme: dönem bittikten `payMonthOffset` ay sonra, `payDay` günü.

import { toISODate, formatMonthYear } from './format.js';

export function periodKeyForDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function periodKeyFromISODate(isoDateStr) {
  return isoDateStr.slice(0, 7);
}

export function currentPeriodKey() {
  return periodKeyForDate(new Date());
}

export function periodRange(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // ayın son günü
  return { start, end, startISO: toISODate(start), endISO: toISODate(end) };
}

export function shiftPeriod(periodKey, delta) {
  const [y, m] = periodKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return periodKeyForDate(d);
}

// Ayın `day`'i o ayda yoksa (örn. 31 çekmeyen ay) ayın son gününe kırpılır.
function clampDayInMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

export function payDateForPeriod(periodKey, settings) {
  const [y, m] = periodKey.split('-').map(Number);
  const payMonthIndex = m - 1 + (settings.payMonthOffset ?? 1);
  const day = clampDayInMonth(y, payMonthIndex, settings.payDay ?? 10);
  return new Date(y, payMonthIndex, day);
}

export function daysUntilPay(periodKey, settings, today = new Date()) {
  const payDate = payDateForPeriod(periodKey, settings);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = payDate.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function periodLabel(periodKey) {
  return formatMonthYear(periodKey);
}

export function isDateInPeriod(isoDateStr, periodKey) {
  return periodKeyFromISODate(isoDateStr) === periodKey;
}
