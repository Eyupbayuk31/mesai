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

// --- Sayılara Türkçe ek ----------------------------------------------------
//
// "%49'u", "ayın 10'u", "%1,7'si", "2027'den"... Ek, sayının SON OKUNAN
// kelimesine göre değişir: 49 "kırk dokuz" biter, 10 "on" biter, 1,7 "yedi"
// biter. Okunuşu bulup ekleri oradan türetiyoruz.
const READINGS = {
  0: 'sıfır', 1: 'bir', 2: 'iki', 3: 'üç', 4: 'dört', 5: 'beş',
  6: 'altı', 7: 'yedi', 8: 'sekiz', 9: 'dokuz',
  10: 'on', 20: 'yirmi', 30: 'otuz', 40: 'kırk', 50: 'elli',
  60: 'altmış', 70: 'yetmiş', 80: 'seksen', 90: 'doksan',
  100: 'yüz', 1000: 'bin', 1e6: 'milyon', 1e9: 'milyar',
};

// Son ünlüye göre dar ünlü: a/ı → ı, e/i → i, o/u → u, ö/ü → ü.
function narrowVowel(v) {
  if ('aı'.includes(v)) return 'ı';
  if ('ei'.includes(v)) return 'i';
  if ('ou'.includes(v)) return 'u';
  return 'ü';
}

function lastVowelOf(word) {
  let found = '';
  for (const ch of word) if ('aeıioöuü'.includes(ch)) found = ch;
  return found;
}

// "1.234,5" / 1234.5 gibi girdilerde son okunan kelime hangisi?
function lastSpokenWord(value) {
  const text = String(value ?? '').replace(/\s/g, '');
  // Ondalık varsa son kelime ondalık kısımdan gelir: "1,7" → yedi.
  const decimal = text.match(/[.,](\d+)$/);
  const digits = (decimal ? decimal[1] : text).replace(/\D/g, '');
  const n = Number(digits);
  if (!digits || !Number.isFinite(n) || n === 0) return READINGS[0];

  const units = n % 10;
  if (units !== 0) return READINGS[units];
  const tens = n % 100;
  if (tens !== 0) return READINGS[tens];
  if (n % 1000 !== 0) return READINGS[100];
  if (n % 1e6 !== 0) return READINGS[1000];
  if (n % 1e9 !== 0) return READINGS[1e6];
  return READINGS[1e9];
}

/** Sayının 3. tekil iyelik eki: 49 → "u", 10 → "u", 7 → "si", 1,7 → "si". */
export function numberSuffix(value) {
  const word = lastSpokenWord(value);
  const vowel = narrowVowel(lastVowelOf(word));
  // Ünlüyle biten okunuşa kaynaştırma s'si girer: "iki" → "ikisi".
  return `${'aeıioöuü'.includes(word.slice(-1)) ? 's' : ''}${vowel}`;
}

/** Sayı + kesme işareti + iyelik eki: 49 → "49'u", 1,7 → "1,7'si". */
export function withSuffix(value) {
  return `${value}'${numberSuffix(value)}`;
}

/** Sayının ayrılma hâli: 2026 → "2026'dan", 2027 → "2027'den", 2025 → "2025'ten". */
export function numberAblative(value) {
  const word = lastSpokenWord(value);
  const vowel = BACK_VOWELS.includes(lastVowelOf(word)) ? 'a' : 'e';
  const consonant = VOICELESS.includes(word.slice(-1)) ? 't' : 'd';
  return `${value}'${consonant}${vowel}n`;
}
