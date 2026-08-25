import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePayslip, explainPayslipDiff, payslipFor, payslipStats, payslipRows } from '../js/payslip.js';
import { salaryForPeriod, hourlyRate, entryAmount, periodSummary, addSalaryChange } from '../js/payroll.js';

const settings = {
  monthlySalary: 45000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weekendDays: [0],
  mealAllowance: 0,
  transportAllowance: 0,
};

// --- Maaş geçmişi -------------------------------------------------------

test('salaryForPeriod - geçmiş yoksa tek maaş tüm dönemlerde (eski davranış)', () => {
  assert.equal(salaryForPeriod(settings, '2026-01'), 45000);
  assert.equal(salaryForPeriod(settings, '2026-08'), 45000);
});

test('salaryForPeriod - her dönem kendi maaşıyla hesaplanır', () => {
  const s = {
    ...settings,
    monthlySalary: 45000,
    salaryHistory: [
      { id: 'a', fromPeriod: '2026-01', amount: 30000 },
      { id: 'b', fromPeriod: '2026-07', amount: 45000 },
    ],
  };
  assert.equal(salaryForPeriod(s, '2026-06'), 30000, 'zam öncesi eski maaş');
  assert.equal(salaryForPeriod(s, '2026-07'), 45000, 'zam ayı yeni maaş');
  assert.equal(salaryForPeriod(s, '2026-12'), 45000, 'sonraki aylar yeni maaş');
});

test('salaryForPeriod - en eski kayıttan da önceki dönemde en eski maaş kullanılır', () => {
  const s = { ...settings, salaryHistory: [{ id: 'b', fromPeriod: '2026-07', amount: 45000 }] };
  assert.equal(salaryForPeriod(s, '2025-11'), 45000);
});

test('salaryForPeriod - sıralama bozuk girilse de doğru sonuç', () => {
  const s = {
    ...settings,
    salaryHistory: [
      { id: 'c', fromPeriod: '2026-09', amount: 52000 },
      { id: 'a', fromPeriod: '2026-01', amount: 30000 },
      { id: 'b', fromPeriod: '2026-07', amount: 45000 },
    ],
  };
  assert.equal(salaryForPeriod(s, '2026-08'), 45000);
  assert.equal(salaryForPeriod(s, '2026-09'), 52000);
});

test('entryAmount - kaydın kendi tarihindeki maaş kullanılır (zam geçmişi bozmaz)', () => {
  const s = {
    ...settings,
    salaryHistory: [
      { id: 'a', fromPeriod: '2026-01', amount: 22500 },  // saat 100
      { id: 'b', fromPeriod: '2026-07', amount: 45000 },  // saat 200
    ],
  };
  const haziran = { id: 'e1', date: '2026-06-10', hours: 2, type: 'normal' };
  const temmuz = { id: 'e2', date: '2026-07-10', hours: 2, type: 'normal' };
  assert.equal(entryAmount(haziran, s), 2 * 100 * 1.5);
  assert.equal(entryAmount(temmuz, s), 2 * 200 * 1.5);
});

test('hourlyRate - dönem verilmezse güncel maaş, verilirse o dönemin maaşı', () => {
  const s = { ...settings, salaryHistory: [{ id: 'a', fromPeriod: '2026-01', amount: 22500 }] };
  assert.equal(hourlyRate(s), 200, 'dönemsiz çağrı güncel maaşı kullanır');
  assert.equal(hourlyRate(s, '2026-03'), 100);
});

test('periodSummary - geçmiş dönem zamdan etkilenmez', () => {
  const state = {
    settings: {
      ...settings,
      salaryHistory: [
        { id: 'a', fromPeriod: '2026-01', amount: 30000 },
        { id: 'b', fromPeriod: '2026-07', amount: 45000 },
      ],
    },
    entries: [{ id: 'e1', date: '2026-06-10', hours: 2, type: 'normal' }],
    adjustments: [], expenses: [], recurring: [],
  };
  const haziran = periodSummary(state, '2026-06');
  assert.equal(haziran.baseSalary, 30000);
});


test('addSalaryChange - ilk zamda ESKİ maaş da kaydedilir (geçmiş bozulmaz)', () => {
  const s = { ...settings, monthlySalary: 22500, salaryHistory: [] };
  const patch = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');

  assert.equal(patch.salaryHistory.length, 2);
  assert.equal(patch.salaryHistory[0].amount, 22500, 'eski maaş başlangıç kaydı olmalı');
  assert.equal(patch.salaryHistory[0].initial, true);
  assert.equal(patch.monthlySalary, 45000);

  const yeni = { ...s, ...patch };
  assert.equal(salaryForPeriod(yeni, '2026-06'), 22500, 'haziran eski maaşta kalmalı');
  assert.equal(salaryForPeriod(yeni, '2026-07'), 45000);
});

test('addSalaryChange - sonraki zamlarda başlangıç kaydı tekrarlanmaz', () => {
  const s = { ...settings, monthlySalary: 22500, salaryHistory: [] };
  const bir = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');
  const iki = addSalaryChange({ ...s, ...bir }, { fromPeriod: '2027-01', amount: 52000 }, '2027-02');
  assert.equal(iki.salaryHistory.length, 3);
  assert.equal(iki.salaryHistory.filter((h) => h.initial).length, 1);
});

test('addSalaryChange - aynı ay tekrar girilirse üzerine yazılır', () => {
  const s = { ...settings, monthlySalary: 22500, salaryHistory: [] };
  const bir = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');
  const iki = addSalaryChange({ ...s, ...bir }, { fromPeriod: '2026-07', amount: 46000 }, '2026-08');
  assert.equal(iki.salaryHistory.filter((h) => h.fromPeriod === '2026-07').length, 1);
  assert.equal(salaryForPeriod({ ...s, ...iki }, '2026-07'), 46000);
});

test('addSalaryChange - ileri tarihli zam güncel maaşı hemen değiştirmez', () => {
  const s = { ...settings, monthlySalary: 45000, salaryHistory: [] };
  const patch = addSalaryChange(s, { fromPeriod: '2026-12', amount: 52000 }, '2026-08');
  assert.equal(patch.monthlySalary, 45000, 'aralık gelene kadar güncel maaş aynı');
  assert.equal(salaryForPeriod({ ...s, ...patch }, '2026-12'), 52000);
});

test('addSalaryChange - eski maaş yoksa başlangıç kaydı üretilmez', () => {
  const s = { ...settings, monthlySalary: 0, salaryHistory: [] };
  const patch = addSalaryChange(s, { fromPeriod: '2026-07', amount: 45000 }, '2026-08');
  assert.equal(patch.salaryHistory.length, 1);
});

// --- Bordro karşılaştırma ----------------------------------------------

const summary = (over = {}) => ({
  periodKey: '2026-08',
  netTotal: 50000, overtimePay: 5000, mealPay: 6500, transportPay: 1430,
  bonuses: 0, advances: 0, deductions: 0,
  ...over,
});

test('comparePayslip - tutuyorsa match', () => {
  const res = comparePayslip(summary(), 50000);
  assert.equal(res.status, 'match');
  assert.equal(res.diff, 0);
});

test('comparePayslip - kuruş farkı eksik ödeme sayılmaz', () => {
  assert.equal(comparePayslip(summary(), 49999.5).status, 'match');
  assert.equal(comparePayslip(summary(), 50000.5).status, 'match');
});

test('comparePayslip - eksik ve fazla ödeme ayırt edilir', () => {
  assert.equal(comparePayslip(summary(), 49722).status, 'short');
  assert.equal(comparePayslip(summary(), 49722).diff, -278);
  assert.equal(comparePayslip(summary(), 51000).status, 'over');
});

test('explainPayslipDiff - tutuyorsa açıklama yok', () => {
  const s = summary();
  assert.equal(explainPayslipDiff(s, comparePayslip(s, 50000), settings), null);
});

test('explainPayslipDiff - bir kalemin tamamı eksikse onu söyler', () => {
  const s = summary();
  const yemekYok = explainPayslipDiff(s, comparePayslip(s, 50000 - 6500), settings);
  assert.match(yemekYok, /Yemek parası/);

  const yolYok = explainPayslipDiff(s, comparePayslip(s, 50000 - 1430), settings);
  assert.match(yolYok, /Yol parası/);

  const mesaiYok = explainPayslipDiff(s, comparePayslip(s, 50000 - 5000), settings);
  assert.match(mesaiYok, /Mesai ücreti/);
});

test('explainPayslipDiff - avans iki kez düşülmüş olabilir', () => {
  const s = summary({ advances: 2000 });
  const res = explainPayslipDiff(s, comparePayslip(s, 48000), settings);
  assert.match(res, /Avans/);
});

test('explainPayslipDiff - fark saat cinsinden anlatılır', () => {
  // saat ücreti 200, normal çarpan 1.5 → saati 300. 900 TL = 3 saat
  const s = summary({ mealPay: 0, transportPay: 0, overtimePay: 9000 });
  const res = explainPayslipDiff(s, comparePayslip(s, 50000 - 900), settings);
  assert.match(res, /3 saat mesai eksik/);
});

test('explainPayslipDiff - çeyrek saate oturmayan farkta uydurma açıklama yok', () => {
  const s = summary({ mealPay: 0, transportPay: 0, overtimePay: 9000 });
  assert.equal(explainPayslipDiff(s, comparePayslip(s, 50000 - 137), settings), null);
});

test('payslipFor / payslipStats', () => {
  const state = {
    payslips: [
      { id: 'p1', periodKey: '2026-07', amount: 40000 },
      { id: 'p2', periodKey: '2026-08', amount: 49722 },
    ],
  };
  assert.equal(payslipFor(state, '2026-08').amount, 49722);
  assert.equal(payslipFor(state, '2026-06'), null);

  const stats = payslipStats(state, [
    { periodKey: '2026-07', netTotal: 40000 },
    { periodKey: '2026-08', netTotal: 50000 },
    { periodKey: '2026-09', netTotal: 50000 }, // bordro girilmemiş, sayılmaz
  ]);
  assert.equal(stats.checked, 2);
  assert.equal(stats.match, 1);
  assert.equal(stats.short, 1);
  assert.equal(stats.totalDiff, -278);
});

test('payslipRows - yalnız bordro girilmiş dönemler, yeniden eskiye', () => {
  const state = {
    payslips: [
      { id: 'p1', periodKey: '2026-06', amount: 40000 },
      { id: 'p2', periodKey: '2026-08', amount: 49722 },
    ],
  };
  const rows = payslipRows(state, [
    { periodKey: '2026-06', netTotal: 40000 },
    { periodKey: '2026-07', netTotal: 45000 }, // bordro yok
    { periodKey: '2026-08', netTotal: 50000 },
  ]);
  assert.deepEqual(rows.map((r) => r.periodKey), ['2026-08', '2026-06'], 'yeniden eskiye, temmuz yok');
  assert.equal(rows[0].status, 'short');
  assert.equal(rows[0].diff, -278);
  assert.equal(rows[1].status, 'match');
});

test('payslipRows - hiç bordro yoksa boş dizi', () => {
  assert.deepEqual(payslipRows({ payslips: [] }, [{ periodKey: '2026-08', netTotal: 50000 }]), []);
});

test('payslipRows - satırlar comparePayslip ile birebir tutarlı', () => {
  const state = { payslips: [{ id: 'p1', periodKey: '2026-08', amount: 45300 }] };
  const summary = { periodKey: '2026-08', netTotal: 46200 };
  const [row] = payslipRows(state, [summary]);
  assert.deepEqual(
    { expected: row.expected, paid: row.paid, diff: row.diff, status: row.status },
    (({ expected, paid, diff, status }) => ({ expected, paid, diff, status }))(comparePayslip(summary, 45300)),
  );
});

// --- Kalem bazlı bordro -------------------------------------------------

import { PAYSLIP_LINES, payslipLineTotals, hasPayslipData } from '../js/payslip.js';

const detay = (over = {}) => ({
  periodKey: '2026-08',
  payoutTotal: 38510, netTotal: 38510,
  overtimePay: 3650, mealPay: 6500, transportPay: 1430,
  bonuses: 0, advances: 0, deductions: 0,
  ...over,
});

test('comparePayslip - maaş + yol girildiğinde maaşın beklentisi KALAN olur', () => {
  const s = detay();
  const res = comparePayslip(s, { amount: 37080, transport: 1430 });
  assert.equal(res.paid, 38510);
  assert.equal(res.diff, 0);
  assert.equal(res.status, 'match');

  const maas = res.lines.find((l) => l.key === 'amount');
  assert.equal(maas.expected, 38510 - 1430, 'toplam eksi yol beklentisi');
  assert.equal(maas.diff, 0);
});

test('comparePayslip - yol eksik yatınca o satır yakalanır', () => {
  const s = detay();
  const res = comparePayslip(s, { amount: 37080, transport: 1250 });
  assert.equal(res.diff, -180);
  const yol = res.lines.find((l) => l.key === 'transport');
  assert.equal(yol.expected, 1430);
  assert.equal(yol.paid, 1250);
  assert.equal(yol.diff, -180);
});

test('comparePayslip - girilmeyen kalem için satır üretilmez', () => {
  const res = comparePayslip(detay(), { amount: 37080 });
  assert.deepEqual(res.lines.map((l) => l.key), ['amount']);
  assert.equal(res.lines[0].expected, 38510, 'başka kalem yoksa beklenti tam toplam');
});

test('comparePayslip - kalem farklarının toplamı genel farka eşit', () => {
  const s = detay({ bonuses: 2000, deductions: 500, payoutTotal: 40010, netTotal: 40010 });
  const res = comparePayslip(s, {
    amount: 28000, transport: 1400, meal: 6400, overtime: 3600, bonus: 1900, deduction: 600,
  });
  const satirToplami = res.lines.reduce((t, l) => t + l.diff, 0);
  assert.ok(Math.abs(satirToplami - res.diff) < 0.001, `${satirToplami} ≠ ${res.diff}`);
});

test('comparePayslip - kesinti ödemeden DÜŞÜLÜR', () => {
  const s = detay({ deductions: 500, payoutTotal: 38010, netTotal: 38010 });
  const res = comparePayslip(s, { amount: 37080, transport: 1430, deduction: 500 });
  assert.equal(res.paid, 37080 + 1430 - 500);
  assert.equal(res.diff, 0);
});

test('comparePayslip - sıfır girilen kalem "hiç yatmamış" demektir', () => {
  const res = comparePayslip(detay(), { amount: 37080, transport: 0 });
  const yol = res.lines.find((l) => l.key === 'transport');
  assert.equal(yol.paid, 0);
  assert.equal(yol.diff, -1430);
  assert.equal(res.status, 'short');
});

test('comparePayslip - eski kullanım (sayı) çalışmaya devam eder', () => {
  const res = comparePayslip(detay(), 38510);
  assert.equal(res.status, 'match');
  assert.equal(res.paid, 38510);
});

test('explainPayslipDiff - kalem girilmişse tahmin değil ölçüm söylenir', () => {
  const s = detay();
  const cmp = comparePayslip(s, { amount: 37080, transport: 1250 });
  const aciklama = explainPayslipDiff(s, cmp, settings);
  assert.match(aciklama, /Yol parası/);
  assert.match(aciklama, /eksik/);
});

test('hasPayslipData - boş kayıt veri sayılmaz', () => {
  assert.equal(hasPayslipData(null), false);
  assert.equal(hasPayslipData({ periodKey: '2026-08' }), false);
  assert.equal(hasPayslipData({ amount: 0 }), true, 'sıfır da bir cevaptır');
  assert.equal(hasPayslipData({ transport: 1430 }), true);
});

test('payslipLineTotals - kalem bazında yıl toplamı', () => {
  const state = {
    payslips: [
      { id: 'p1', periodKey: '2026-07', amount: 37080, transport: 1430 },
      { id: 'p2', periodKey: '2026-08', amount: 37080, transport: 1250 },
    ],
  };
  const totals = payslipLineTotals(state, [detay({ periodKey: '2026-07' }), detay({ periodKey: '2026-08' })]);
  const yol = totals.find((t) => t.key === 'transport');
  assert.equal(yol.months, 2);
  assert.equal(yol.expected, 2860);
  assert.equal(yol.paid, 2680);
  assert.equal(yol.diff, -180);
  assert.deepEqual(totals.map((t) => t.key), ['amount', 'transport'], 'kalem sırası sabit');
});

test('PAYSLIP_LINES - net maaş kalan, kesinti negatif', () => {
  assert.equal(PAYSLIP_LINES[0].key, 'amount');
  assert.equal(PAYSLIP_LINES[0].remainder, true);
  assert.equal(PAYSLIP_LINES.find((l) => l.key === 'deduction').negative, true);
});

// --- Gün, saat ve telafi -------------------------------------------------

import { adjustForDays, hoursCheck, matchCompensations, openBalance } from '../js/payslip.js';

const gunlu = (over = {}) => ({
  periodKey: '2026-08',
  payoutTotal: 38510, netTotal: 38510, earnedTotal: 38510,
  overtimePay: 3650, mealPay: 5500, transportPay: 1430,
  mealAllowance: 250, transportAllowance: 65, allowanceDays: 22,
  totalHours: 14, bonuses: 0, advances: 0, deductions: 0,
  ...over,
});

const gunSettings = { ...settings, mealAllowance: 250, transportAllowance: 65 };

test('adjustForDays - bordroda az gün varsa yemek/yol beklentisi düşer', () => {
  const s = gunlu();
  const a = adjustForDays(s, 20, gunSettings);
  assert.equal(a.allowanceDays, 20);
  assert.equal(a.mealPay, 20 * 250);
  assert.equal(a.transportPay, 20 * 65);
  // 2 gün × (250 + 65) = 630 düşer
  assert.equal(a.payoutTotal, 38510 - 630);
  assert.equal(a.appAllowanceDays, 22);
});

test('adjustForDays - gün aynıysa özet aynen döner', () => {
  const s = gunlu();
  assert.equal(adjustForDays(s, 22, gunSettings), s);
  assert.equal(adjustForDays(s, NaN, gunSettings), s);
});

test('comparePayslip - bordrodaki gün beklentiyi düzeltir, boş alarm kalkar', () => {
  const s = gunlu();
  // Şirket 20 gün üzerinden ödemiş; gün girilmezse 630 eksik görünür.
  const gunsuz = comparePayslip(s, { amount: 38510 - 630 }, gunSettings);
  assert.equal(gunsuz.status, 'short');
  assert.equal(gunsuz.diff, -630);

  const gunlu2 = comparePayslip(s, { amount: 38510 - 630, days: 20 }, gunSettings);
  assert.equal(gunlu2.status, 'match', 'gün girilince tutmalı');
  assert.equal(gunlu2.dayCheck.appDays, 22);
  assert.equal(gunlu2.dayCheck.slipDays, 20);
  assert.equal(gunlu2.dayCheck.diff, -2);
});

test('hoursCheck - bordroda az saat yazıyorsa yakalar', () => {
  const s = gunlu();
  const res = hoursCheck(s, { hours: 12.5 }, gunSettings);
  assert.equal(res.appHours, 14);
  assert.equal(res.slipHours, 12.5);
  assert.equal(res.diff, -1.5);
  assert.equal(res.status, 'short');
  // saat ücreti 45000/225 = 200, çarpan 1,5 → saati 300 → 1,5 saat = 450
  assert.equal(res.money, -450);
});

test('hoursCheck - saat girilmemişse null, eşitse match', () => {
  assert.equal(hoursCheck(gunlu(), {}, gunSettings), null);
  assert.equal(hoursCheck(gunlu(), { hours: 14 }, gunSettings).status, 'match');
  assert.equal(hoursCheck(gunlu(), { hours: 16 }, gunSettings).status, 'over');
});

test('matchCompensations - sonraki ayın fazlası eksiği kapatır', () => {
  const rows = matchCompensations([
    { periodKey: '2026-08', diff: 180 },
    { periodKey: '2026-07', diff: -180 },
  ]);
  const temmuz = rows.find((r) => r.periodKey === '2026-07');
  const agustos = rows.find((r) => r.periodKey === '2026-08');
  assert.equal(temmuz.compensatedBy, '2026-08');
  assert.equal(agustos.compensates, '2026-07');
});

test('matchCompensations - önceki ayın fazlası eşleşmez', () => {
  const rows = matchCompensations([
    { periodKey: '2026-08', diff: -180 },
    { periodKey: '2026-07', diff: 180 },
  ]);
  assert.equal(rows.find((r) => r.periodKey === '2026-08').compensatedBy, undefined);
});

test('matchCompensations - bir fazla yalnız bir eksiği kapatır', () => {
  const rows = matchCompensations([
    { periodKey: '2026-06', diff: -180 },
    { periodKey: '2026-07', diff: -180 },
    { periodKey: '2026-08', diff: 180 },
  ]);
  assert.equal(rows.find((r) => r.periodKey === '2026-06').compensatedBy, '2026-08');
  assert.equal(rows.find((r) => r.periodKey === '2026-07').compensatedBy, undefined);
});

test('openBalance - telafi ve kabul edilenler alacaktan düşer', () => {
  const rows = matchCompensations([
    { periodKey: '2026-05', diff: -500, status2: 'acik' },
    { periodKey: '2026-06', diff: -300, status2: 'kabul' },
    { periodKey: '2026-07', diff: -180, status2: 'acik' },
    { periodKey: '2026-08', diff: 180, status2: 'acik' },
  ]);
  const bakiye = openBalance(rows);
  assert.equal(bakiye.compensated, 180, 'temmuz ağustosta kapandı');
  assert.equal(bakiye.accepted, 300);
  assert.equal(bakiye.open, 500, 'yalnız mayıs açık kalır');
});

test('comparePayslip - net maaş girilmemişse yalnız girilen kalemler kıyaslanır', () => {
  const s = detay();
  const res = comparePayslip(s, { transport: 1430 });
  assert.equal(res.partial, true, 'kısmi karşılaştırma');
  assert.equal(res.expected, 1430, 'beklenen yalnız yol parası');
  assert.equal(res.paid, 1430);
  assert.equal(res.status, 'match', 'maaş yazılmadı diye "eksik" denmez');
  assert.equal(res.payoutExpected, 38510, 'ayın tam beklentisi yine de taşınır');

  const eksik = comparePayslip(s, { transport: 1250 });
  assert.equal(eksik.status, 'short');
  assert.equal(eksik.diff, -180);
});

test('comparePayslip - net maaş girilince tam karşılaştırma yapılır', () => {
  const res = comparePayslip(detay(), { amount: 37080, transport: 1430 });
  assert.equal(res.partial, false);
  assert.equal(res.expected, 38510);
});

test('payslipStats - cells dönem sırasıyla durum verir', () => {
  const state = {
    settings,
    payslips: [
      { id: 'p1', periodKey: '2026-02', amount: 45300 },
      { id: 'p2', periodKey: '2026-03', amount: 45000 },
    ],
  };
  const summaries = ['2026-01', '2026-02', '2026-03', '2026-04']
    .map((periodKey) => ({ ...summary(), periodKey, payoutTotal: 45300, netTotal: 45300 }));
  const stats = payslipStats(state, summaries, settings);
  assert.deepEqual(stats.cells, ['empty', 'match', 'short', 'empty']);
  assert.equal(stats.checked, 2);
  assert.equal(stats.cells.length, summaries.length, 'her döneme bir hücre');
});
