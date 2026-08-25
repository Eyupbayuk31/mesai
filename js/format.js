// tr-TR formatlama yardımcıları

const currencyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatterNoDecimals = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(amount, { decimals = true } = {}) {
  const value = Number.isFinite(amount) ? amount : 0;
  return decimals ? currencyFormatter.format(value) : currencyFormatterNoDecimals.format(value);
}

export function formatHours(hours) {
  const value = Number.isFinite(hours) ? hours : 0;
  // Tam sayıysa ondalık gösterme, değilse tek ondalık basamak
  const rounded = Math.round(value * 100) / 100;
  const isInteger = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  const text = isInteger
    ? String(Math.round(rounded))
    : rounded.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return `${text} sa`;
}

const dayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const dayShortFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const weekdayFormatter = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });
const weekdayShortFormatter = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
const monthYearFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

// dateStr: "YYYY-MM-DD" -> yerel gün başlangıcında Date (UTC kaymasını önler)
export function parseISODate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDayMonth(dateStr) {
  return dayFormatter.format(parseISODate(dateStr));
}

export function formatDayMonthShort(dateStr) {
  return dayShortFormatter.format(parseISODate(dateStr));
}

export function formatWeekday(dateStr) {
  return weekdayFormatter.format(parseISODate(dateStr));
}

export function formatWeekdayShort(dateStr) {
  return weekdayShortFormatter.format(parseISODate(dateStr));
}

export function formatMonthYear(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return monthYearFormatter.format(new Date(y, m - 1, 1));
}

export function formatFullDate(dateStr) {
  return fullDateFormatter.format(parseISODate(dateStr));
}

// Kullanıcı girişini sayıya çevir: "3,5" veya "3.5" ikisi de kabul edilir
export function parseLocaleNumber(input) {
  if (typeof input === 'number') return input;
  if (!input) return NaN;
  const normalized = String(input).trim().replace(',', '.');
  return Number(normalized);
}

export function todayISO() {
  return toISODate(new Date());
}

// Türkçe bulunma hâli eki: "Ağustos" → "Ağustos'ta", "Eylül" → "Eylül'de".
// Ay adlarını elle yazmak yerine ünlü uyumu + ünsüz benzeşmesi uygulanır.
const BACK_VOWELS = 'aıou';
const VOICELESS = 'fstkçşhp';

export function locative(word) {
  const text = String(word || '');
  if (!text) return text;
  const lower = text.toLocaleLowerCase('tr-TR');
  let lastVowel = '';
  for (const ch of lower) {
    if ('aeıioöuü'.includes(ch)) lastVowel = ch;
  }
  const vowel = BACK_VOWELS.includes(lastVowel) ? 'a' : 'e';
  const consonant = VOICELESS.includes(lower.slice(-1)) ? 't' : 'd';
  return `${text}'${consonant}${vowel}`;
}
