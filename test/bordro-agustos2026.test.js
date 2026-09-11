// Ağustos 2026 bordrosu — canlı regresyon.
//
// Bu ay elimizdeki tek "doğru cevap anahtarı": işyerinin kendi puantajı ve
// ücret hesabı. Mesai kuralları (mola penceresi, en az mesai eşiği) ve eksik
// saat kesintisi buradan çıkarıldı, o yüzden kanıtları da burada duruyor.
// Biri kuralı değiştirirse 21 günün hangisinin bozulduğunu tek tek söyler.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftOvertime, hourlyRate } from '../js/payroll.js';
import { adjustForShortfall } from '../js/payslip.js';
import { DEFAULT_SETTINGS, Store } from '../js/store.js';

// jsdom yok; store.test.js'teki mock'un aynısı.
function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// Pzt-Cmt çalışılıyor; hafta içi 08:30-18:00, Cumartesi yarım gün.
const settings = {
  ...DEFAULT_SETTINGS,
  monthlySalary: 35000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weeklySchedule: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [
    d,
    d === 0 ? { works: false, start: '08:30', end: '18:00' }
      : d === 6 ? { works: true, start: '08:30', end: '13:00' }
        : { works: true, start: '08:30', end: '18:00' },
  ])),
};

// [gün, giriş, çıkış, bordronun yazdığı Mes1]
const HAFTA_ICI = [
  [3, '08:53', '18:32', 0.53],
  [4, '08:45', '18:12', 0.00],
  [5, '08:48', '18:18', 0.30],
  [6, '08:47', '18:11', 0.00],
  [7, '08:45', '18:10', 0.00],
  [10, '08:28', '18:12', 0.00],
  [11, '08:37', '21:00', 2.50],
  [12, '08:49', '21:00', 2.50],
  [13, '08:30', '18:57', 0.95],
  [17, '08:28', '20:19', 2.00],
  [18, '08:49', '19:06', 1.10],
  [19, '08:38', '19:08', 1.13],
  [20, '08:30', '19:03', 1.05],
  [21, '08:38', '18:30', 0.50],
  [24, '08:44', '20:47', 2.28],
  [25, '08:44', '18:54', 0.90],
  [26, '08:46', '18:46', 0.77],
  [27, '08:51', '18:21', 0.35],
  [28, '08:51', '18:33', 0.55],
  [31, '08:36', '18:08', 0.00],
];

test('Ağustos 2026 - 20 günün mesaisi bordroyla birebir tutuyor', () => {
  for (const [gun, giris, cikis, bordro] of HAFTA_ICI) {
    const date = new Date(2026, 7, gun);
    const { overtimeHours } = shiftOvertime(date, giris, cikis, settings);
    assert.ok(
      Math.abs(overtimeHours - bordro) < 0.011,
      `${gun} Ağustos ${giris}-${cikis}: hesap ${overtimeHours.toFixed(2)}, bordro ${bordro.toFixed(2)}`,
    );
  }
});

test('Ağustos 2026 - 20:00-20:30 penceresi tek başına doğru pencere', () => {
  // 20:19 çıkış kanıtın kilit taşı: 2 sa 19 dk çalışmadan yalnız 19 dakika
  // (20:00-20:19 kesişimi) düşülünce tam 2,00 çıkıyor. Pencere 19:30-20:00
  // olsaydı 30 dakikanın tamamı düşer ve 1,82 olurdu.
  const date = new Date(2026, 7, 17);
  const tam = shiftOvertime(date, '08:28', '20:19', settings).overtimeHours;
  assert.ok(Math.abs(tam - 2) < 0.011, `20:00-20:30 ile ${tam}`);

  const erken = { ...settings, breakWindow: { enabled: true, start: '19:30', end: '20:00' } };
  const yanlis = shiftOvertime(date, '08:28', '20:19', erken).overtimeHours;
  assert.ok(Math.abs(yanlis - 2) > 0.1, '19:30-20:00 penceresi bordroyu tutturamaz');
});

test('Akşam 6\'dan 9\'a çalışmak 2,50 saat mesaidir', () => {
  // Kullanıcının bordroyu aldıktan sonra iki kez söylediği kural.
  // 3 saatlik pencereden 20:00-20:30 molası düşer.
  const date = new Date(2026, 7, 11); // Salı
  assert.equal(shiftOvertime(date, '08:30', '21:00', settings).overtimeHours, 2.5);
  assert.equal(shiftOvertime(date, '08:37', '21:00', settings).overtimeHours, 2.5,
    'giriş saati mesaiyi değiştirmez, mesai 18:00\'dan sonrası');
});

test('Ağustos 2026 - 15 dakika eşiği: 18:12 sayılmaz, 18:18 tam sayılır', () => {
  const date = new Date(2026, 7, 4);
  assert.equal(shiftOvertime(date, '08:45', '18:12', settings).overtimeHours, 0);
  assert.equal(shiftOvertime(date, '08:48', '18:18', settings).overtimeHours, 0.3);

  // Eşik kapatılırsa 12 dakika da sayılır — ayar gerçekten bağlı.
  const esiksiz = { ...settings, minOvertimeMinutes: 0 };
  assert.ok(shiftOvertime(date, '08:45', '18:12', esiksiz).overtimeHours > 0);
});

test('Ağustos 2026 - mesai çeyrek saate yuvarlanmaz', () => {
  // Bordro 0,53 ve 0,77 gibi dakika hassasiyetinde yazıyor.
  const date = new Date(2026, 7, 3);
  assert.equal(shiftOvertime(date, '08:53', '18:32', settings).overtimeHours, 0.53);
  assert.notEqual(shiftOvertime(date, '08:53', '18:32', settings).overtimeHours, 0.5);
});

test('Ağustos 2026 - ücret matematiği bordronun alt kutusuyla tutuyor', () => {
  const saatlik = hourlyRate(settings, '2026-08');
  assert.equal(Math.round(saatlik * 100) / 100, 155.56, '35.000 / 225');
  assert.equal(Math.round(saatlik * 1.5 * 100) / 100, 233.33, 'bordroda yazan Mesai1 ücreti');

  const eksikSaat = 8.87;
  const mesaiSaat = 21.66;
  const yol = 2300;
  const avans = 35000;

  const normalUcreti = 35000 - eksikSaat * saatlik;
  const mesaiUcreti = mesaiSaat * saatlik * 1.5;
  // Şirket gün gün yuvarladığı için kuruş farkı olabiliyor; 1 ₺ tolerans.
  assert.ok(Math.abs(normalUcreti - 33619.63) < 1, `Normal ücreti ${normalUcreti.toFixed(2)}`);
  assert.ok(Math.abs(mesaiUcreti - 5054.15) < 1, `Mesai1 ücreti ${mesaiUcreti.toFixed(2)}`);

  const netKazanc = 33619.63 + 5054.15 + yol - avans;
  assert.equal(Math.round(netKazanc * 100) / 100, 5973.78, 'bordrodaki NET KAZANÇ');
});

test('adjustForShortfall - eksik saat maaştan çıplak ücretle düşer', () => {
  const summary = {
    periodKey: '2026-08',
    baseSalary: 35000,
    earnedTotal: 42447,
    payoutTotal: 7447,
    netTotal: 7447,
  };
  const adjusted = adjustForShortfall(summary, 8.87, settings);
  const beklenen = 8.87 * hourlyRate(settings, '2026-08');

  assert.ok(Math.abs(adjusted.shortfallCost - beklenen) < 0.01);
  assert.ok(Math.abs(adjusted.baseSalary - (35000 - beklenen)) < 0.01);
  assert.ok(Math.abs(adjusted.payoutTotal - (7447 - beklenen)) < 0.01);
  // Mesai çarpanı UYGULANMAZ: çalışılmayan saat fazla çalışma değildir.
  assert.ok(adjusted.shortfallCost < 8.87 * hourlyRate(settings, '2026-08') * 1.5);
});

test('adjustForShortfall - sıfır/geçersiz eksik özeti değiştirmez', () => {
  const summary = { periodKey: '2026-08', baseSalary: 35000, earnedTotal: 1, payoutTotal: 1, netTotal: 1 };
  assert.equal(adjustForShortfall(summary, 0, settings), summary);
  assert.equal(adjustForShortfall(summary, -3, settings), summary);
  assert.equal(adjustForShortfall(summary, 'abc', settings), summary);
});

// --- Eski kayıtların yeniden hesaplanması ---------------------------------

test('v4 göçü - kaydedilmiş eski mesai saatleri yeni kuralla düzeltilir', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state.t', JSON.stringify({
    schemaVersion: 3,
    settings: { monthlySalary: 35000, hoursDivisor: 225 },
    entries: [
      // 18:00-21:00 eskiden 3,00 yazılmıştı; işyeri 2,50 ödüyor.
      { id: 'e1', date: '2026-08-11', start: '18:00', end: '21:00', hours: 3, type: 'normal' },
      // 18:00-18:12 eskiden 0,25'e yuvarlanmıştı; işyeri hiç saymıyor.
      { id: 'e2', date: '2026-08-04', start: '18:00', end: '18:12', hours: 0.25, type: 'normal' },
      // Penceresi olmayan "saati elle yazdım" kaydına DOKUNULMAZ.
      { id: 'e3', date: '2026-08-05', hours: 7, type: 'normal' },
    ],
  }));

  const entries = new Store('t').getState().entries;
  assert.equal(entries[0].hours, 2.5, '18:00-21:00 → 2,50');
  assert.equal(entries[1].hours, 0, '12 dakika eşiğin altında');
  assert.equal(entries[2].hours, 7, 'elle girilen saat korunur');
  assert.ok(entries[0].recalculatedAt, 'değişen kayıt damgalanır');
  assert.ok(!entries[2].recalculatedAt, 'dokunulmayan kayıt damgalanmaz');
});

test('v4 göçü - bir kez çalışır, şema 4 kayıtlara dokunmaz', () => {
  globalThis.window = { localStorage: makeMemoryLocalStorage() };
  window.localStorage.setItem('mesai.state.t', JSON.stringify({
    schemaVersion: 4,
    settings: { monthlySalary: 35000 },
    // Kullanıcı bilerek düzeltmiş olabilir; şema güncelse karışılmaz.
    entries: [{ id: 'e1', date: '2026-08-11', start: '18:00', end: '21:00', hours: 3, type: 'normal' }],
  }));
  assert.equal(new Store('t').getState().entries[0].hours, 3);
});
