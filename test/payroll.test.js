import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourlyRate, entryAmount, hoursBetween, crossesMidnight, periodSummary, yearSummary, shiftOvertime, rangeOvertime, addMinutesToTime, workdaysForPeriod, scheduledWeeklyHours } from '../js/payroll.js';

const baseSettings = {
  monthlySalary: 30000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
};

test('hourlyRate - maaş / bölen', () => {
  assert.equal(Math.round(hourlyRate(baseSettings) * 100) / 100, 133.33);
});

test('hourlyRate - bölen 0/boş ise varsayılan 225\'e düşer (bölme hatası yok)', () => {
  assert.equal(Math.round(hourlyRate({ monthlySalary: 30000, hoursDivisor: 0 }) * 100) / 100, 133.33);
});

test('hourlyRate - maaş boşsa 0', () => {
  assert.equal(hourlyRate({ monthlySalary: 0, hoursDivisor: 225 }), 0);
});

test('entryAmount - normal mesai x1.5', () => {
  const entry = { hours: 3.5, type: 'normal' };
  const amount = entryAmount(entry, baseSettings);
  assert.equal(Math.round(amount * 100) / 100, 700); // 3.5 * 133.33 * 1.5 ≈ 700
});

test('entryAmount - hafta tatili x2', () => {
  const entry = { hours: 4, type: 'weekend' };
  const amount = entryAmount(entry, baseSettings);
  assert.equal(Math.round(amount * 100) / 100, 1066.67);
});

test('hoursBetween - normal aralık', () => {
  assert.equal(hoursBetween('18:00', '21:30'), 3.5);
});

test('hoursBetween - gece yarısını geçen vardiya', () => {
  assert.equal(hoursBetween('22:00', '02:00'), 4);
});

test('hoursBetween - 15 dakika hassasiyet', () => {
  assert.equal(hoursBetween('09:00', '09:50'), 0.75);
});

test('crossesMidnight - tespit doğru', () => {
  assert.equal(crossesMidnight('22:00', '02:00'), true);
  assert.equal(crossesMidnight('18:00', '21:30'), false);
  assert.equal(crossesMidnight('09:00', '09:00'), true); // eşitse de sarkma kabul (24 saat degil, 0 olamaz varsayimi)
});

test('periodSummary - kullanıcı senaryosu: maaş 30000, 2 kayıt', () => {
  const state = {
    settings: baseSettings,
    entries: [
      { id: '1', date: '2026-08-14', hours: 3.5, type: 'normal' },
      { id: '2', date: '2026-08-17', hours: 4, type: 'weekend' },
      { id: '3', date: '2026-09-01', hours: 2, type: 'normal' }, // farklı dönem
    ],
    adjustments: [],
  };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.entryCount, 2);
  assert.equal(summary.totalHours, 7.5);
  assert.equal(Math.round(summary.overtimePay * 100) / 100, 1766.67);
  assert.equal(summary.baseSalary, 30000);
  assert.equal(Math.round(summary.netTotal * 100) / 100, 31766.67);
});

test('periodSummary - para girişi (beklenmedik gelir) toplam gelir ve nete eklenir', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    adjustments: [
      { id: 'i1', periodKey: '2026-08', kind: 'income', amount: 800, label: 'Eski borç geri ödemesi' },
      { id: 'a1', periodKey: '2026-08', kind: 'advance', amount: 1000 },
    ],
  };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.extraIncome, 800);
  assert.equal(summary.totalIncome, 30800); // maaş + para girişi
  assert.equal(summary.netTotal, 29800);    // ... - avans
});

test('periodSummary - avans/prim/kesinti netTotal\'a yansır', () => {
  const state = {
    settings: baseSettings,
    entries: [],
    adjustments: [
      { id: 'a1', periodKey: '2026-08', kind: 'bonus', amount: 500 },
      { id: 'a2', periodKey: '2026-08', kind: 'advance', amount: 1000 },
      { id: 'a3', periodKey: '2026-08', kind: 'deduction', amount: 200 },
      { id: 'a4', periodKey: '2026-09', kind: 'bonus', amount: 9999 }, // farklı dönem, sayılmaz
    ],
  };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.bonuses, 500);
  assert.equal(summary.advances, 1000);
  assert.equal(summary.deductions, 200);
  assert.equal(summary.totalIncome, 30500); // kesintiler düşülmeden toplam kazanılan
  assert.equal(summary.netTotal, 30000 + 500 - 1000 - 200);
});

test('periodSummary - maaş 0 iken hata vermez, 0 döner', () => {
  const state = { settings: { monthlySalary: 0, hoursDivisor: 225, multipliers: {} }, entries: [], adjustments: [] };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.netTotal, 0);
  assert.equal(summary.overtimePay, 0);
});

test('yearSummary - 12 ay toplanır', () => {
  const state = {
    settings: baseSettings,
    entries: [
      { id: '1', date: '2026-01-05', hours: 2, type: 'normal' },
      { id: '2', date: '2026-06-05', hours: 3, type: 'normal' },
    ],
    adjustments: [],
  };
  const ys = yearSummary(state, 2026);
  assert.equal(ys.months.length, 12);
  assert.equal(ys.totalHours, 5);
});

const weeklySettings = {
  weeklySchedule: {
    0: { works: false, start: '08:30', end: '18:00' },
    1: { works: true, start: '08:30', end: '18:00' },
    2: { works: true, start: '08:30', end: '18:00' },
    3: { works: true, start: '08:30', end: '18:00' },
    4: { works: true, start: '08:30', end: '18:00' },
    5: { works: true, start: '08:30', end: '18:00' },
    6: { works: true, start: '08:30', end: '12:45' },
  },
};

// Yalnızca Pzt–Cum çalışan program (0=Pazar, 6=Cumartesi kapalı)
const monFriSchedule = {
  weeklySchedule: {
    0: { works: false }, 1: { works: true }, 2: { works: true },
    3: { works: true }, 4: { works: true }, 5: { works: true },
    6: { works: false },
  },
};

test('workdaysForPeriod - varsayılan program: Pazar hariç tüm günler (Ağustos 2026 = 26)', () => {
  // Ağustos 2026: 5 Pazar var, 30 Ağustos Zafer Bayramı Pazar'a denk gelir
  assert.equal(workdaysForPeriod('2026-08', weeklySettings), 26);
});

test('workdaysForPeriod - resmi tatil iş gününden düşülür', () => {
  // Temmuz 2026 Pzt–Cum: 23 iş günü, 15 Temmuz (Çarşamba) düşülünce 22
  assert.equal(workdaysForPeriod('2026-07', monFriSchedule), 22);
});

test('workdaysForPeriod - program tanımsızsa 0 döner', () => {
  assert.equal(workdaysForPeriod('2026-07', {}), 0);
});

test('scheduledWeeklyHours - hafta içi 9,5 sa x5 + cmt 4,25 sa = 51,75', () => {
  assert.equal(scheduledWeeklyHours(weeklySettings), 51.75);
});

test('scheduledWeeklyHours - program tanımsızsa 0 döner', () => {
  assert.equal(scheduledWeeklyHours({}), 0);
});

test('periodSummary - yemek ve yol parası gün x bedel olarak netTotal\'a eklenir', () => {
  const state = {
    settings: { ...baseSettings, mealAllowance: 250, transportAllowance: 55, ...monFriSchedule },
    entries: [{ id: '1', date: '2026-07-01', hours: 2, type: 'normal' }],
    adjustments: [],
  };
  const summary = periodSummary(state, '2026-07');
  assert.equal(summary.allowanceDays, 22);
  assert.equal(summary.mealPay, 5500);      // 22 x 250
  assert.equal(summary.transportPay, 1210); // 22 x 55
  assert.equal(summary.totalIncome, 30000 + 400 + 5500 + 1210); // maaş + mesai + yemek + yol
  assert.equal(Math.round(summary.netTotal * 100) / 100, 30000 + 400 + 5500 + 1210); // kesinti yok, net = gelir
});

test('periodSummary - bedeller 0/boşsa yan ödeme 0, netTotal değişmez', () => {
  const state = { settings: baseSettings, entries: [], adjustments: [] };
  const summary = periodSummary(state, '2026-08');
  assert.equal(summary.mealPay, 0);
  assert.equal(summary.transportPay, 0);
  assert.equal(summary.netTotal, summary.baseSalary);
});

test('periodSummary - yalnız yol parası girilirse gün sayısı yine hesaplanır', () => {
  const state = {
    settings: { ...baseSettings, transportAllowance: 100, ...monFriSchedule },
    entries: [],
    adjustments: [],
  };
  const summary = periodSummary(state, '2026-07');
  assert.equal(summary.allowanceDays, 22);
  assert.equal(summary.mealPay, 0);
  assert.equal(summary.transportPay, 2200);
});

test('yearSummary - aylık yemek/yol toplamları ve yıllık toplamlar doğru', () => {
  const state = {
    settings: { ...baseSettings, mealAllowance: 100, transportAllowance: 50, ...monFriSchedule },
    entries: [],
    adjustments: [],
  };
  const ys = yearSummary(state, 2026);
  assert.equal(ys.months[6].meal, 2200);      // Temmuz: 22 gün x 100
  assert.equal(ys.months[6].transport, 1100); // Temmuz: 22 gün x 50
  const sumMeals = ys.months.reduce((s, m) => s + m.meal, 0);
  const sumTransport = ys.months.reduce((s, m) => s + m.transport, 0);
  assert.equal(ys.totalMealPay, sumMeals);
  assert.equal(ys.totalTransportPay, sumTransport);
});

test('shiftOvertime - hafta içi normal çıkışta mesai yok', () => {
  const date = new Date(2026, 7, 21); // Cuma
  const result = shiftOvertime(date, '08:30', '18:00', weeklySettings);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.scheduled.end, '18:00');
});

test('shiftOvertime - hafta içi geç çıkışta fark mesai sayılır', () => {
  const date = new Date(2026, 7, 21); // Cuma
  const result = shiftOvertime(date, '08:30', '19:15', weeklySettings);
  assert.equal(result.overtimeHours, 1.25);
  assert.equal(result.windowStart, '18:00');
  assert.equal(result.windowEnd, '19:15');
});

test('shiftOvertime - erken çıkışta negatif mesai olmaz, 0 döner', () => {
  const date = new Date(2026, 7, 21); // Cuma
  const result = shiftOvertime(date, '08:30', '17:00', weeklySettings);
  assert.equal(result.overtimeHours, 0);
});

test('shiftOvertime - cumartesi kısa gün, 12:45 sonrası mesai', () => {
  const date = new Date(2026, 7, 22); // Cumartesi
  const result = shiftOvertime(date, '08:30', '14:00', weeklySettings);
  assert.equal(result.overtimeHours, 1.25);
  assert.equal(result.windowStart, '12:45');
});

test('shiftOvertime - pazar (çalışma günü değil) tüm süre mesai sayılır', () => {
  const date = new Date(2026, 7, 23); // Pazar
  const result = shiftOvertime(date, '10:00', '14:00', weeklySettings);
  assert.equal(result.scheduled, null);
  assert.equal(result.overtimeHours, 4);
  assert.equal(result.windowStart, '10:00');
  assert.equal(result.windowEnd, '14:00');
});

const weeklySettingsWithBreak = {
  ...weeklySettings,
  breakWindow: { enabled: true, start: '18:30', end: '19:00' },
};

test('shiftOvertime - mola penceresiyle tam kesişen mesai düşülür', () => {
  // Cuma 18:00-19:00 arası (1 saat mesai penceresi), mola 18:30-19:00 (30dk) tamamen içinde
  const date = new Date(2026, 7, 21); // Cuma
  const result = shiftOvertime(date, '08:30', '19:00', weeklySettingsWithBreak);
  assert.equal(result.overtimeHours, 0.5); // 1 saat - 0.5 saat mola
  assert.equal(result.breakHours, 0.5);
});

test('shiftOvertime - mola penceresi kısmen kesişiyorsa sadece kesişen kısım düşülür', () => {
  // Cuma 18:00-18:45 arası mesai (0.75 sa), mola 18:30-19:00 ile 15 dk kesişiyor
  const date = new Date(2026, 7, 21);
  const result = shiftOvertime(date, '08:30', '18:45', weeklySettingsWithBreak);
  assert.equal(result.overtimeHours, 0.5); // 0.75 - 0.25
  assert.equal(result.breakHours, 0.25);
});

test('shiftOvertime - mesai molayı hiç kapsamıyorsa düşülmez', () => {
  // Cuma 18:00-18:20 arası mesai (20 dk), mola 18:30'da başlıyor, kesişme yok
  const date = new Date(2026, 7, 21);
  const result = shiftOvertime(date, '08:30', '18:20', weeklySettingsWithBreak);
  assert.equal(result.overtimeHours, 0.25); // 20 dk, 15 dk hassasiyete yuvarlanır
  assert.equal(result.breakHours, 0);
});

test('shiftOvertime - mola kapalıyken hiç düşülmez', () => {
  const date = new Date(2026, 7, 21);
  const disabled = { ...weeklySettingsWithBreak, breakWindow: { enabled: false, start: '18:30', end: '19:00' } };
  const result = shiftOvertime(date, '08:30', '19:00', disabled);
  assert.equal(result.overtimeHours, 1);
  assert.equal(result.breakHours, 0);
});

test('shiftOvertime - pazar (gün kapalı) senaryosunda da mola düşülür', () => {
  const date = new Date(2026, 7, 23); // Pazar
  const result = shiftOvertime(date, '17:00', '20:00', weeklySettingsWithBreak);
  assert.equal(result.totalHours, 3);
  assert.equal(result.breakHours, 0.5);
  assert.equal(result.overtimeHours, 2.5);
});

test('addMinutesToTime - normal ekleme', () => {
  assert.equal(addMinutesToTime('18:00', 45), '18:45');
  assert.equal(addMinutesToTime('18:30', 90), '20:00');
});

test('addMinutesToTime - gün sınırını aşarsa sarar', () => {
  assert.equal(addMinutesToTime('23:30', 45), '00:15');
});

// --- Aralık modunda mola ------------------------------------------------

test('rangeOvertime - mola penceresiyle kesişen süre düşülür (18:00-21:00 = 2,5 sa)', () => {
  const result = rangeOvertime('18:00', '21:00', weeklySettingsWithBreak);
  assert.equal(result.totalHours, 3);
  assert.equal(result.breakHours, 0.5);
  assert.equal(result.overtimeHours, 2.5);
});

test('rangeOvertime - molayla kesişmeyen aralıkta süre aynen kalır', () => {
  const result = rangeOvertime('19:00', '22:00', weeklySettingsWithBreak);
  assert.equal(result.overtimeHours, 3);
  assert.equal(result.breakHours, 0);
});

test('rangeOvertime - mola kapalıysa düşülmez', () => {
  const kapali = { ...weeklySettingsWithBreak, breakWindow: { enabled: false, start: '18:30', end: '19:00' } };
  assert.equal(rangeOvertime('18:00', '21:00', kapali).overtimeHours, 3);
});

test('rangeOvertime - kısmi kesişimde yalnız kesişen kısım düşülür', () => {
  const result = rangeOvertime('18:45', '21:00', weeklySettingsWithBreak);
  assert.equal(result.breakHours, 0.25);
  assert.equal(result.overtimeHours, 2);
});

test('rangeOvertime - gece yarısını geçen mesaide ertesi güne düşen mola da düşülür', () => {
  const gece = { ...weeklySettingsWithBreak, breakWindow: { enabled: true, start: '00:30', end: '01:00' } };
  const result = rangeOvertime('22:00', '02:00', gece);
  assert.equal(result.totalHours, 4);
  assert.equal(result.breakHours, 0.5);
  assert.equal(result.overtimeHours, 3.5);
});

test('rangeOvertime - mola aralıktan uzunsa mesai eksiye düşmez', () => {
  const uzun = { ...weeklySettingsWithBreak, breakWindow: { enabled: true, start: '18:00', end: '20:00' } };
  const result = rangeOvertime('18:30', '19:00', uzun);
  assert.equal(result.overtimeHours, 0);
});

test('rangeOvertime - Giriş-Çıkış modu ile aynı süre için aynı sonucu verir', () => {
  // Cuma: normal mesai 18:00'de bitiyor, 21:00'e kadar çalışılmış.
  const cuma = new Date(2026, 7, 21);
  const shift = shiftOvertime(cuma, '09:00', '21:00', weeklySettingsWithBreak);
  const range = rangeOvertime('18:00', '21:00', weeklySettingsWithBreak);
  assert.equal(range.overtimeHours, shift.overtimeHours);
});
