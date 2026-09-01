import test from 'node:test';
import assert from 'node:assert/strict';
import { seniority, entitlementFor, leaveYears, countsAgainstLeave, leaveLedger } from '../js/leave.js';

// Pzt-Cmt çalışan bir işyeri (yalnız Pazar tatil) — kullanıcının durumu.
const settings = {
  hireDate: '2021-03-15',
  leaveMinimum20: false,
  halfDayEves: false,
  weeklySchedule: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { works: d !== 0, start: '08:00', end: '18:00' }])),
};
const izin = (date) => ({ id: 'a' + date, date, kind: 'izin' });

test('entitlementFor - kıdem basamakları', () => {
  assert.equal(entitlementFor(0), 0, '1 yıl dolmadan hak yok');
  assert.equal(entitlementFor(0.9), 0);
  assert.equal(entitlementFor(1), 14, 'tam 1 yıl');
  assert.equal(entitlementFor(4), 14);
  assert.equal(entitlementFor(5), 20, '5 yıl dahil üst basamak');
  assert.equal(entitlementFor(14), 20);
  assert.equal(entitlementFor(15), 26);
  assert.equal(entitlementFor(30), 26);
});

test('entitlementFor - 18 yaş altı / 50 yaş üstü en az 20 gün', () => {
  assert.equal(entitlementFor(2, { minimum20: true }), 20, '14 yerine 20');
  assert.equal(entitlementFor(20, { minimum20: true }), 26, '26 aşağı çekilmez');
  assert.equal(entitlementFor(0, { minimum20: true }), 0, 'hak yoksa yine 0');
});

test('seniority - tam yıl ve yıldönümü', () => {
  const s = seniority('2021-03-15', '2026-08-26');
  assert.equal(s.years, 5);
  assert.equal(s.months, 5);
  assert.equal(s.nextAnniversary, '2027-03-15');

  // Yıldönümünün bir gün öncesi henüz o yılı doldurmaz.
  assert.equal(seniority('2021-03-15', '2026-03-14').years, 4);
  assert.equal(seniority('2021-03-15', '2026-03-15').years, 5, 'yıldönümü günü dolar');
  assert.equal(seniority('', '2026-08-26'), null);
});

test('seniority - 29 Şubat işe girişi artık olmayan yılda 28 Şubat sayılır', () => {
  assert.equal(seniority('2024-02-29', '2025-02-28').years, 1, '2025te 28 Şubat yıldönümü');
  assert.equal(seniority('2024-02-29', '2025-02-27').years, 0);
  assert.equal(seniority('2024-02-29', '2028-02-29').years, 4);
});

test('leaveYears - her yıl için hak ve kullanım aralığı', () => {
  const years = leaveYears('2021-03-15', '2026-08-26');
  assert.equal(years.length, 5, '5 hak doğmuş');
  assert.equal(years[0].start, '2022-03-15', 'ilk hak 1. yılın sonunda doğar');
  assert.equal(years[0].end, '2023-03-14');
  assert.equal(years[0].entitled, 14);
  assert.equal(years[4].entitled, 20, '5. yılda üst basamak');
  assert.deepEqual(leaveYears('2026-01-01', '2026-08-26'), [], '1 yıl dolmadıysa hak yok');
});

test('countsAgainstLeave - hafta tatili ve resmi tatil izinden düşmez', () => {
  assert.equal(countsAgainstLeave('2026-05-04', settings), true, 'Pazartesi iş günü');
  assert.equal(countsAgainstLeave('2026-05-03', settings), false, 'Pazar');
  assert.equal(countsAgainstLeave('2026-05-19', settings), false, '19 Mayıs resmi tatil');
  assert.equal(countsAgainstLeave('2026-05-27', settings), false, 'Kurban Bayramı');
});

test('leaveLedger - hak, kullanılan, kalan', () => {
  const state = {
    absences: [
      izin('2026-05-04'), izin('2026-05-05'), izin('2026-05-06'),
      izin('2026-05-03'),   // Pazar — sayılmaz
      izin('2026-05-19'),   // resmi tatil — sayılmaz
    ],
  };
  const led = leaveLedger(state, settings, '2026-08-26');
  assert.equal(led.hasHireDate, true);
  assert.equal(led.totalEntitled, 14 * 4 + 20, '4 yıl 14 + 5. yıl 20');
  assert.equal(led.totalUsed, 3, 'yalnız üç iş günü düşer');
  assert.equal(led.remaining, 76 - 3);
  assert.equal(led.over, 0);
});

test('leaveLedger - yalnız "izin" türü düşer', () => {
  const state = {
    absences: [
      izin('2026-05-04'),
      { id: 'b1', date: '2026-05-05', kind: 'rapor' },
      { id: 'b2', date: '2026-05-06', kind: 'ucretsiz' },
      { id: 'b3', date: '2026-05-07', kind: 'devamsiz' },
    ],
  };
  assert.equal(leaveLedger(state, settings, '2026-08-26').totalUsed, 1);
});

test('leaveLedger - kullanılmayan izin devreder, yıl yıl dökülür', () => {
  const state = { absences: [izin('2023-05-02'), izin('2023-05-03'), izin('2026-05-04')] };
  const led = leaveLedger(state, settings, '2026-08-26');
  const ilkYil = led.years.find((y) => y.start === '2022-03-15');
  assert.equal(ilkYil.used, 0, '2022-23 yılında izin kullanılmamış');
  assert.equal(led.years.find((y) => y.start === '2023-03-15').used, 2);
  assert.equal(led.totalUsed, 3);
  assert.equal(led.remaining, 76 - 3, 'kullanılmayanlar birikir');
});

test('leaveLedger - haktan fazla kullanılırsa kalan 0, fazlası ayrı', () => {
  const az = { ...settings, hireDate: '2024-06-03' }; // 2 yıl → 14 gün
  const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05',
    '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12',
    '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-22'];
  const led = leaveLedger({ absences: dates.map(izin) }, az, '2026-08-26');
  assert.equal(led.totalEntitled, 28, '2 hak yılı × 14');
  assert.equal(led.totalUsed, 16);
  assert.equal(led.remaining, 12);
  assert.equal(led.over, 0);

  const cok = leaveLedger({ absences: dates.map(izin) }, { ...az, hireDate: '2025-06-03' }, '2026-08-26');
  assert.equal(cok.totalEntitled, 14, 'tek hak yılı');
  assert.equal(cok.remaining, 0, 'eksiye düşmez');
  assert.equal(cok.over, 2);
});

test('leaveLedger - işe giriş tarihi yoksa hiçbir hesap yapılmaz', () => {
  const led = leaveLedger({ absences: [izin('2026-05-04')] }, { ...settings, hireDate: '' }, '2026-08-26');
  assert.equal(led.hasHireDate, false);
  assert.equal(led.totalEntitled, 0);
  assert.equal(led.totalUsed, 0);
  assert.deepEqual(led.years, []);
});

test('leaveLedger - 1 yıl dolmadıysa hakkın doğacağı gün yazılır', () => {
  const led = leaveLedger({ absences: [] }, { ...settings, hireDate: '2026-03-12' }, '2026-08-26');
  assert.equal(led.notEarnedYet, true);
  assert.equal(led.totalEntitled, 0);
  assert.equal(led.firstRightDate, '2027-03-12');
  assert.equal(led.daysToFirstRight, 198);
});

test('leaveLedger - işe girişten önceki işaretler sayılmaz', () => {
  const state = { absences: [izin('2020-05-04'), izin('2026-05-04')] };
  assert.equal(leaveLedger(state, settings, '2026-08-26').totalUsed, 1);
});
