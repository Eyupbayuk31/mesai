import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TAX_PARAMS, taxParamsFor, bracketTax, taxOnSlice, marginalRate,
  grossToNet, netToGross, seniorityBetween, seniorityText,
  kidemTazminati, noticeWeeks, ihbarTazminati, izinUcreti, severanceReport,
} from '../js/severance.js';

const P = DEFAULT_TAX_PARAMS;
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} — ${actual} ≉ ${expected} (±${tol})`);

// --- Dilim matematiği -----------------------------------------------------

test('bracketTax - dilimler ayrı ayrı vergilenir, tamamı en yüksek orandan değil', () => {
  assert.equal(bracketTax(0, P.brackets), 0);
  assert.equal(bracketTax(100000, P.brackets), 15000, 'ilk dilim düz %15');
  assert.equal(bracketTax(190000, P.brackets), 28500, 'ilk dilim sınırı');
  // 332 seri no.lu tebliğ örneği: 600.000 ücret geliri
  // 190.000×0,15 + 210.000×0,20 + 200.000×0,27 = 124.500
  assert.equal(bracketTax(600000, P.brackets), 124500, 'tebliğ örneği');
});

test('taxOnSlice - aynı tutar kümülatife göre farklı vergilenir', () => {
  assert.equal(taxOnSlice(10000, { cumulativeBase: 0, brackets: P.brackets }), 1500);
  assert.equal(taxOnSlice(10000, { cumulativeBase: 200000, brackets: P.brackets }), 2000);
  assert.equal(taxOnSlice(10000, { cumulativeBase: 500000, brackets: P.brackets }), 2700);
  // Dilim sınırını ortadan kesen dilim: 185.000 → 195.000
  assert.equal(taxOnSlice(10000, { cumulativeBase: 185000, brackets: P.brackets }), 5000 * 0.15 + 5000 * 0.20);
});

test('marginalRate - içinde bulunulan dilim', () => {
  assert.equal(marginalRate(0, P.brackets), 0.15);
  assert.equal(marginalRate(189999, P.brackets), 0.15);
  assert.equal(marginalRate(190000, P.brackets), 0.20, 'sınır bir üst dilime aittir');
  assert.equal(marginalRate(9000000, P.brackets), 0.40);
});

// --- Brüt → net -----------------------------------------------------------

test('grossToNet - asgari ücret yayımlanan net ile birebir tutuyor', () => {
  const r = grossToNet(P.minWageGross, P);
  assert.equal(r.sgk, 4624.20, 'SGK %14');
  assert.equal(r.unemployment, 330.30, 'işsizlik %1');
  assert.equal(r.incomeTax, 0, 'asgari ücret gelir vergisinden istisna');
  assert.equal(r.stamp, 0, 'asgari ücret damga vergisinden istisna');
  assert.equal(r.net, 28075.50, '2026 net asgari ücret');
});

test('grossToNet - istisna asgari ücretin üstündekine de indirim olarak geçer', () => {
  const r = grossToNet(60000, P);
  const exempt = grossToNet(P.minWageGross, P);
  assert.ok(r.exemption > 0, 'istisna uygulanmalı');
  near(r.incomeTax, r.incomeTaxBeforeExemption - r.exemption, 0.01, "istisna düşülmüş vergi");
  // Damga yalnız asgari ücreti aşan kısımdan
  assert.equal(r.stamp, Math.round((60000 - P.minWageGross) * P.stampRate * 100) / 100);
  assert.equal(exempt.stamp, 0);
});

test('grossToNet - SGK tavanı aşılınca prim sabitlenir', () => {
  const atCap = grossToNet(P.sgkCeiling, P);
  const overCap = grossToNet(P.sgkCeiling + 50000, P);
  assert.equal(overCap.sgk, atCap.sgk, 'tavanın üstü prime girmez');
  assert.equal(overCap.unemployment, atCap.unemployment);
});

test('grossToNet - net brüte göre monoton artar (netToGross ikili araması buna dayanıyor)', () => {
  let previous = -1;
  for (let g = 10000; g <= 400000; g += 5000) {
    const net = grossToNet(g, P).net;
    assert.ok(net > previous, `monotonluk ${g} ₺ brütte bozuldu`);
    previous = net;
  }
});

// --- Net → brüt -----------------------------------------------------------

test('netToGross - asgari ücretin netinden brütü çıkar', () => {
  assert.equal(netToGross(28075.50, P), 33030);
});

test('netToGross - grossToNet ile tam tersine çevrilebilir', () => {
  for (const net of [20000, 35000, 50000, 75000, 120000, 260000]) {
    const gross = netToGross(net, P);
    near(grossToNet(gross, P).net, net, 0.02, `net ${net}`);
  }
});

test('netToGross - kümülatif matrah yükseldikçe aynı net daha yüksek brüt ister', () => {
  const ocak = netToGross(50000, P, { cumulativeBase: 0 });
  const aralik = netToGross(50000, P, { cumulativeBase: 600000 });
  assert.ok(aralik > ocak, 'üst dilimdeyken aynı neti almak daha pahalı');
});

test('netToGross - 0 net 0 brüt', () => {
  assert.equal(netToGross(0, P), 0);
});

// --- Kıdem süresi ---------------------------------------------------------

test('seniorityBetween - yıl/ay/gün ayrıştırması', () => {
  const s = seniorityBetween('2019-03-15', '2026-09-30');
  assert.equal(s.years, 7);
  assert.equal(s.months, 6);
  assert.equal(s.days, 15);
  assert.equal(seniorityText(s), '7 yıl 6 ay 15 gün');
});

test('seniorityBetween - gün ödünç alırken bir önceki ayın uzunluğu kullanılır', () => {
  // 31 Ocak → 1 Mart: Şubat 28 gün, dolayısıyla 1 ay 1 gün DEĞİL.
  const s = seniorityBetween('2026-01-31', '2026-03-01');
  assert.equal(s.years, 0);
  assert.equal(s.months, 1);
  assert.equal(s.days, 1);
});

test('seniorityBetween - geçersiz / ters tarihler null', () => {
  assert.equal(seniorityBetween('', '2026-09-30'), null);
  assert.equal(seniorityBetween('2026-09-30', '2020-01-01'), null, 'çıkış girişten önce olamaz');
  assert.equal(seniorityBetween('abc', '2026-09-30'), null);
});

// --- Kıdem tazminatı ------------------------------------------------------

test('kidemTazminati - 1 yıl dolmadan hak doğmaz', () => {
  const s = seniorityBetween('2026-01-01', '2026-09-30');
  const r = kidemTazminati({ seniority: s, monthlyGross: 60000, params: P });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'under-one-year');
  assert.equal(r.net, 0);
});

test('kidemTazminati - tam 5 yıl = 5 aylık brüt, yalnız damga kesilir', () => {
  const s = seniorityBetween('2021-09-30', '2026-09-30');
  assert.equal(s.years, 5);
  const r = kidemTazminati({ seniority: s, monthlyGross: 60000, params: P });
  assert.equal(r.gross, 300000, '5 × 60.000');
  assert.equal(r.incomeTax, 0, 'kıdem gelir vergisinden istisnadır');
  assert.equal(r.stamp, 2277, '300.000 × binde 7,59');
  assert.equal(r.net, 297723);
});

test('kidemTazminati - tavanı aşan ücret tavandan hesaplanır', () => {
  const s = seniorityBetween('2024-09-30', '2026-09-30');
  const r = kidemTazminati({ seniority: s, monthlyGross: 120000, params: P });
  assert.equal(r.cappedBy, true);
  assert.equal(r.capped, P.severanceCap);
  near(r.gross, P.severanceCap * 2, 0.01, 'tavan × 2 yıl');
});

test('kidemTazminati - artan ay ve gün orantılı eklenir', () => {
  const s = seniorityBetween('2023-01-01', '2026-07-01');
  const r = kidemTazminati({ seniority: s, monthlyGross: 30000, params: P });
  near(r.gross, 30000 * (s.years + s.months / 12 + s.days / 365), 0.01);
  assert.ok(r.gross > 30000 * s.years, 'artan süre kaybolmuyor');
});

test('kidemTazminati - istifa gibi hak doğurmayan çıkışta sıfır', () => {
  const s = seniorityBetween('2015-01-01', '2026-09-30');
  const r = kidemTazminati({ seniority: s, monthlyGross: 60000, params: P, eligible: false });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'ineligible');
  assert.equal(r.net, 0);
});

// --- İhbar tazminatı ------------------------------------------------------

test('noticeWeeks - İş K. md. 17 basamakları', () => {
  const at = (y) => noticeWeeks({ totalYears: y });
  assert.equal(at(0.2), 2, '6 aydan az → 2 hafta');
  assert.equal(at(0.5), 4, '6 ay dahil → 4 hafta');
  assert.equal(at(1.4), 4);
  assert.equal(at(1.5), 6, '1,5 yıl dahil → 6 hafta');
  assert.equal(at(2.9), 6);
  assert.equal(at(3), 8, '3 yıl ve üstü → 8 hafta');
  assert.equal(at(20), 8);
  assert.equal(noticeWeeks(null), 0);
});

test('ihbarTazminati - kıdemin aksine gelir vergisine tabidir ve tavanı yoktur', () => {
  const s = seniorityBetween('2015-01-01', '2026-09-30');
  const r = ihbarTazminati({ seniority: s, monthlyGross: 120000, params: P });
  assert.equal(r.weeks, 8);
  assert.equal(r.days, 56);
  near(r.gross, 120000 / 30 * 56, 0.01, 'tavan uygulanmaz');
  assert.ok(r.incomeTax > 0, 'ihbar gelir vergisinden istisna DEĞİL');
  near(r.stamp, r.gross * P.stampRate, 0.01);
  near(r.net, r.gross - r.incomeTax - r.stamp, 0.01);
});

test('ihbarTazminati - işveren ihbarlı çıkardıysa hak doğmaz', () => {
  const s = seniorityBetween('2015-01-01', '2026-09-30');
  const r = ihbarTazminati({ seniority: s, monthlyGross: 60000, params: P, eligible: false });
  assert.equal(r.eligible, false);
  assert.equal(r.net, 0);
});

// --- Yıllık izin ----------------------------------------------------------

test('izinUcreti - çıplak brüt üzerinden, vergi kesilerek', () => {
  const r = izinUcreti({ days: 20, monthlyGross: 60000, params: P });
  near(r.gross, 60000 / 30 * 20, 0.01);
  assert.ok(r.incomeTax > 0);
  near(r.net, r.gross - r.incomeTax - r.stamp, 0.01);
});

test('izinUcreti - 0 gün her şeyi sıfırlar', () => {
  const r = izinUcreti({ days: 0, monthlyGross: 60000, params: P });
  assert.equal(r.gross, 0);
  assert.equal(r.net, 0);
});

// --- Bütün ----------------------------------------------------------------

test('severanceReport - net maaştan tüm tablo', () => {
  const r = severanceReport({
    netSalary: 50000,
    fringeMonthly: 6000,
    hireDate: '2019-03-15',
    endDate: '2026-09-30',
    leaveDays: 12,
  }, P);

  near(r.netSalary, 50000, 0.02, 'girilen net geri üretiliyor');
  assert.ok(r.grossSalary > 50000, 'brüt netten büyük');
  assert.equal(r.dressedGross, Math.round((r.grossSalary + 6000) * 100) / 100);
  assert.equal(r.kidem.eligible, true);
  assert.equal(r.ihbar.weeks, 8);
  near(r.totalGross, r.kidem.gross + r.ihbar.gross + r.izin.gross, 0.02);
  near(r.totalNet, r.kidem.net + r.ihbar.net + r.izin.net, 0.02);
  assert.ok(r.totalNet < r.totalGross, 'kesintiler uygulanmış');
});

test('severanceReport - brüt verilirse net→brüt çevrimi atlanır', () => {
  const r = severanceReport({
    grossSalary: 63697.49, hireDate: '2020-01-01', endDate: '2026-09-30',
  }, P);
  assert.equal(r.grossSalary, 63697.49);
  near(r.netSalary, 50000, 0.02);
});

test('severanceReport - giydirilmiş ücret kıdeme girer, izne girmez', () => {
  const ortak = { netSalary: 40000, hireDate: '2020-01-01', endDate: '2026-09-30', leaveDays: 10 };
  const yansiz = severanceReport({ ...ortak, fringeMonthly: 0 }, P);
  const yanli = severanceReport({ ...ortak, fringeMonthly: 8000 }, P);
  assert.ok(yanli.kidem.gross > yansiz.kidem.gross, 'yan ödeme kıdemi büyütür');
  assert.ok(yanli.ihbar.gross > yansiz.ihbar.gross, 'yan ödeme ihbarı büyütür');
  assert.equal(yanli.izin.gross, yansiz.izin.gross, 'izin çıplak ücretten hesaplanır');
});

// --- Parametre düzenleme --------------------------------------------------

test('taxParamsFor - ayar yoksa varsayılan', () => {
  assert.equal(taxParamsFor(null), DEFAULT_TAX_PARAMS);
  assert.equal(taxParamsFor({}), DEFAULT_TAX_PARAMS);
});

test('taxParamsFor - tek alan güncellenince gerisi varsayılandan gelir', () => {
  const p = taxParamsFor({ taxParams: { severanceCap: 80000 } });
  assert.equal(p.severanceCap, 80000);
  assert.equal(p.minWageGross, DEFAULT_TAX_PARAMS.minWageGross, 'dokunulmayan alan korunur');
  assert.deepEqual(p.brackets, DEFAULT_TAX_PARAMS.brackets);
});

test('taxParamsFor - dilimler değişince hesap gerçekten değişir', () => {
  const p = taxParamsFor({ taxParams: { brackets: [{ upTo: null, rate: 0.10 }] } });
  assert.equal(p.brackets[0].upTo, Infinity, 'null = üst sınırsız son dilim');
  assert.equal(bracketTax(1000000, p.brackets), 100000);
});

test('taxParamsFor - yeni yılın tavanı girilince kıdem ona göre hesaplanır', () => {
  const s = seniorityBetween('2024-09-30', '2026-09-30');
  const eski = kidemTazminati({ seniority: s, monthlyGross: 200000, params: P });
  const yeni = kidemTazminati({ seniority: s, monthlyGross: 200000, params: taxParamsFor({ taxParams: { severanceCap: 90000 } }) });
  assert.ok(yeni.gross > eski.gross, 'tavan güncellenince tazminat büyür');
  near(yeni.gross, 90000 * 2, 0.01);
});
