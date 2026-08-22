import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  periodProgress, projectPeriod, overtimeShare,
  weeklyBuckets, periodRecord, busiestWeekday, todayNudge,
} = await import('../js/homeStats.js');

const WEEKLY = {
  0: { works: false, start: '08:30', end: '18:00' },
  1: { works: true, start: '08:30', end: '18:00' },
  2: { works: true, start: '08:30', end: '18:00' },
  3: { works: true, start: '08:30', end: '18:00' },
  4: { works: true, start: '08:30', end: '18:00' },
  5: { works: true, start: '08:30', end: '18:00' },
  6: { works: true, start: '08:30', end: '12:45' },
};

const entry = (date, hours, type = 'normal') => ({ id: date + hours, date, hours, type });

// --- Dönem ilerlemesi ---

test('periodProgress - ayın ilk günü, ortası ve son günü', () => {
  assert.deepEqual(periodProgress('2026-08', '2026-08-01'), { elapsedDays: 1, totalDays: 31, ratio: 1 / 31 });
  assert.equal(periodProgress('2026-08', '2026-08-16').elapsedDays, 16);
  assert.equal(periodProgress('2026-08', '2026-08-31').ratio, 1);
});

test('periodProgress - 30 ve 28 çeken aylar', () => {
  assert.equal(periodProgress('2026-04', '2026-04-15').totalDays, 30);
  assert.equal(periodProgress('2026-02', '2026-02-10').totalDays, 28);
  assert.equal(periodProgress('2028-02', '2028-02-10').totalDays, 29, 'artık yıl');
});

test('periodProgress - geçmiş dönem tam, gelecek dönem sıfır', () => {
  assert.equal(periodProgress('2026-07', '2026-08-16').ratio, 1);
  assert.equal(periodProgress('2026-09', '2026-08-16').ratio, 0);
});

// --- Ay sonu tahmini ---

test('projectPeriod - ay ortasında iki katına yakın tahmin', () => {
  const summary = { totalHours: 20, overtimePay: 4000 };
  const res = projectPeriod(summary, periodProgress('2026-08', '2026-08-16'));
  // 16/31 geçmiş → ~1.94 kat
  assert.ok(res.hours > 38 && res.hours < 39, `beklenmedik: ${res.hours}`);
  assert.ok(res.pay > 7700 && res.pay < 7800);
  assert.equal(res.reliable, true);
});

test('projectPeriod - çeyrek saate ve tam liraya yuvarlanır', () => {
  // 20 / (16/31) = 38.75 sa, 4000 / (16/31) = 7750 TL — sahte ondalık olmamalı
  const res = projectPeriod({ totalHours: 20, overtimePay: 4000 }, periodProgress('2026-08', '2026-08-16'));
  assert.equal(res.hours, 38.75);
  assert.equal(res.pay, 7750);
  assert.equal(Number.isInteger(res.hours * 4), true, 'çeyrek saat katı olmalı');
});

test('projectPeriod - ayın ilk günlerinde güvenilmez işaretlenir', () => {
  const res = projectPeriod({ totalHours: 4, overtimePay: 800 }, periodProgress('2026-08', '2026-08-03'));
  assert.equal(res.reliable, false);
});

test('projectPeriod - 5. günden itibaren güvenilir', () => {
  assert.equal(projectPeriod({ totalHours: 6, overtimePay: 0 }, periodProgress('2026-08', '2026-08-05')).reliable, true);
});

test('projectPeriod - biten veya başlamamış dönemde tahmin yok', () => {
  assert.equal(projectPeriod({ totalHours: 30, overtimePay: 0 }, periodProgress('2026-07', '2026-08-16')), null);
  assert.equal(projectPeriod({ totalHours: 0, overtimePay: 0 }, periodProgress('2026-09', '2026-08-16')), null);
});

// --- Mesai / maaş oranı ---

test('overtimeShare - maaşın yüzdesi', () => {
  assert.equal(overtimeShare({ baseSalary: 35000, overtimePay: 3500 }), 0.1);
});

test('overtimeShare - maaş girilmemişse null (sıfıra bölme yok)', () => {
  assert.equal(overtimeShare({ baseSalary: 0, overtimePay: 3500 }), null);
  assert.equal(overtimeShare({}), null);
});

test('overtimeShare - hiç mesai yoksa sıfır', () => {
  assert.equal(overtimeShare({ baseSalary: 35000, overtimePay: 0 }), 0);
});

// --- Haftalık kovalar ---

test('weeklyBuckets - her zaman istenen sayıda kova, eskiden yeniye', () => {
  const buckets = weeklyBuckets([], 6, '2026-08-21');
  assert.equal(buckets.length, 6);
  assert.ok(buckets[0].mondayISO < buckets[5].mondayISO);
  assert.equal(buckets[5].isCurrent, true, 'son kova bu hafta olmalı');
  assert.equal(buckets.every((b) => b.hours === 0), true, 'boş haftalar 0 ile yer tutar');
});

test('weeklyBuckets - bu haftanın pazartesisi doğru bulunur', () => {
  // 2026-08-21 Cuma → pazartesi 2026-08-17
  const buckets = weeklyBuckets([], 1, '2026-08-21');
  assert.equal(buckets[0].mondayISO, '2026-08-17');
  assert.equal(buckets[0].sundayISO, '2026-08-23');
});

test('weeklyBuckets - pazar günü hâlâ o haftaya sayılır (pazartesi başlangıcı)', () => {
  const buckets = weeklyBuckets([entry('2026-08-23', 3)], 1, '2026-08-23');
  assert.equal(buckets[0].mondayISO, '2026-08-17');
  assert.equal(buckets[0].hours, 3);
});

test('weeklyBuckets - kayıtlar doğru haftaya düşer', () => {
  const entries = [
    entry('2026-08-18', 2),   // bu hafta
    entry('2026-08-11', 3),   // geçen hafta
    entry('2026-08-12', 1.5), // geçen hafta
    entry('2026-06-01', 9),   // 6 haftadan eski, sayılmamalı
  ];
  const buckets = weeklyBuckets(entries, 6, '2026-08-21');
  assert.equal(buckets[5].hours, 2);
  assert.equal(buckets[4].hours, 4.5);
  assert.equal(buckets.reduce((s, b) => s + b.hours, 0), 6.5, 'aralık dışı kayıt toplama girmemeli');
});

test('weeklyBuckets - ay sınırını aşan hafta bölünmez', () => {
  // 2026-08-31 Pazartesi; aynı hafta 1 Eylül'ü de kapsar.
  const buckets = weeklyBuckets([entry('2026-08-31', 2), entry('2026-09-01', 3)], 1, '2026-09-02');
  assert.equal(buckets[0].mondayISO, '2026-08-31');
  assert.equal(buckets[0].hours, 5, 'ay değişse de aynı hafta');
});

// --- Rekor ve en yoğun gün ---

test('periodRecord - dönemin en uzun mesaisi', () => {
  const entries = [
    entry('2026-08-03', 2), entry('2026-08-05', 5.5), entry('2026-08-10', 3),
    entry('2026-08-12', 1), entry('2026-08-14', 4),
  ];
  const rec = periodRecord(entries, '2026-08');
  assert.equal(rec.date, '2026-08-05');
  assert.equal(rec.hours, 5.5);
});

test('periodRecord - eşit saatte daha yeni kayıt kazanır (kararlı)', () => {
  const entries = [
    entry('2026-08-03', 5), entry('2026-08-20', 5), entry('2026-08-10', 3),
    entry('2026-08-12', 1), entry('2026-08-14', 4),
  ];
  assert.equal(periodRecord(entries, '2026-08').date, '2026-08-20');
});

test('periodRecord - 5 kayıttan azsa gösterilmez', () => {
  const entries = [entry('2026-08-03', 2), entry('2026-08-05', 5)];
  assert.equal(periodRecord(entries, '2026-08'), null);
});

test('periodRecord - başka dönemin kayıtları sayılmaz', () => {
  const entries = [
    entry('2026-07-03', 9), entry('2026-08-05', 2), entry('2026-08-06', 2),
    entry('2026-08-07', 2), entry('2026-08-08', 2), entry('2026-08-09', 2),
  ];
  assert.equal(periodRecord(entries, '2026-08').hours, 2);
});

test('busiestWeekday - en çok kayıt girilen gün', () => {
  // 2026-08-06, 13, 20 Perşembe (4); 2026-08-04 Salı (2)
  const entries = [
    entry('2026-08-06', 2), entry('2026-08-13', 3), entry('2026-08-20', 1),
    entry('2026-08-04', 4), entry('2026-08-11', 2),
  ];
  const res = busiestWeekday(entries);
  assert.equal(res.weekday, 4, 'Perşembe');
  assert.equal(res.count, 3);
  assert.equal(res.hours, 6);
});

test('busiestWeekday - kayıt sayısı eşitse toplam saat belirler', () => {
  const entries = [
    entry('2026-08-04', 1), entry('2026-08-11', 1),   // Salı: 2 kayıt, 2 sa
    entry('2026-08-06', 5), entry('2026-08-13', 5),   // Perşembe: 2 kayıt, 10 sa
    entry('2026-08-07', 1),
  ];
  assert.equal(busiestWeekday(entries).weekday, 4);
});

test('busiestWeekday - 5 kayıttan azsa null', () => {
  assert.equal(busiestWeekday([entry('2026-08-06', 2)]), null);
});

// --- Bugün kayıt hatırlatması ---

const stateWith = (entries = []) => ({ settings: { weeklySchedule: WEEKLY }, entries });
// 2026-08-21 Cuma, 2026-08-23 Pazar
const at = (iso, h, m) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};

test('todayNudge - çalışma günü, paydos geçmiş, kayıt yok → hatırlat', () => {
  const res = todayNudge(stateWith(), at('2026-08-21', 19, 30));
  assert.equal(res.show, true);
  assert.equal(res.date, '2026-08-21');
});

test('todayNudge - mesai bitmeden hatırlatmaz', () => {
  const res = todayNudge(stateWith(), at('2026-08-21', 14, 0));
  assert.equal(res.show, false);
  assert.equal(res.reason, 'mesai-bitmedi');
});

test('todayNudge - pazar günü hiç hatırlatmaz', () => {
  const res = todayNudge(stateWith(), at('2026-08-23', 21, 0));
  assert.equal(res.show, false);
  assert.equal(res.reason, 'calisma-gunu-degil');
});

test('todayNudge - o güne kayıt girilmişse hatırlatmaz', () => {
  const res = todayNudge(stateWith([entry('2026-08-21', 2)]), at('2026-08-21', 19, 30));
  assert.equal(res.show, false);
  assert.equal(res.reason, 'kayit-var');
});

test('todayNudge - resmi tatilde hatırlatmaz', () => {
  // 30 Ağustos Zafer Bayramı (2026'da Pazar; 29 Ekim Cumhuriyet Bayramı Perşembe)
  const res = todayNudge(stateWith(), at('2026-10-29', 20, 0));
  assert.equal(res.show, false);
  assert.equal(res.reason, 'resmi-tatil');
});

test('todayNudge - cumartesi programı erken bittiği için öğleden sonra hatırlatır', () => {
  // 2026-08-22 Cumartesi, program 12:45'te biter
  assert.equal(todayNudge(stateWith(), at('2026-08-22', 13, 0)).show, true);
  assert.equal(todayNudge(stateWith(), at('2026-08-22', 11, 0)).show, false);
});
