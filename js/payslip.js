// Bordro karşılaştırma: şirketin ödediği ile uygulamanın hesabı tutuyor mu?
//
// Mesai takip etmenin asıl sebebi bu. Kullanıcı bordroda gördüğü kalemleri
// girer (en azından cebine geçen net maaşı ve yol parasını), uygulama her
// kalemi kendi hesabıyla karşılaştırır. Girilmeyen kalem için satır
// üretilmez — olmayan veriye "eksik" denmez.

import { hourlyRate } from './payroll.js';

// Kuruş farkları ve yuvarlama gürültüsü "eksik ödeme" sayılmasın.
const TOLERANCE = 1;

/**
 * Bordro kalemleri. `amount` (net maaş) özeldir: beklentisi sabit bir hesap
 * değil, KALAN'dır — toplam beklenen ödemeden, ayrıca girilen kalemlerin
 * beklentileri düşülür. Böylece yalnız maaş+yol giren de, hepsini giren de
 * doğru fark görür.
 */
export const PAYSLIP_LINES = [
  { key: 'amount', label: 'Net maaş', remainder: true },
  { key: 'transport', label: 'Yol parası', expectedOf: (s) => s.transportPay },
  { key: 'meal', label: 'Yemek parası', expectedOf: (s) => s.mealPay },
  { key: 'overtime', label: 'Mesai ücreti', expectedOf: (s) => s.overtimePay },
  // Kesinti ödemeyi azaltır: girilirse toplamdan düşülür.
  { key: 'deduction', label: 'Kesinti', expectedOf: (s) => s.deductions, negative: true },
];

const EXTRA_LINES = PAYSLIP_LINES.filter((l) => !l.remainder);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Kalem girilmiş mi? 0 da geçerli bir cevaptır ("hiç yatmamış"). */
function entered(slip, key) {
  const v = slip?.[key];
  return v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
}

/** Eski çağrılar sayı geçiyordu: comparePayslip(summary, 49722) */
function normalizeSlip(slip) {
  if (typeof slip === 'number') return { amount: slip };
  return slip || {};
}

/**
 * @param {object} summary periodSummary() çıktısı
 * @param {object|number} slip bordro kaydı (veya eski kullanım: yatan tutar)
 */
/**
 * Bordroda yazan çalışılan gün, uygulamanınkinden farklıysa yemek/yol
 * beklentisi ona göre düzeltilir. İzin işaretlenmemişse uygulama fazla gün
 * sayar ve boş yere "eksik" der; bordrodaki gün bunu kesin olarak bilir.
 */
export function adjustForDays(summary, days, settings) {
  if (!Number.isFinite(days) || days < 0 || !summary) return summary;
  const appDays = num(summary.allowanceDays);
  if (appDays === days) return summary;

  const meal = num(settings?.mealAllowance ?? summary.mealAllowance);
  const transport = num(settings?.transportAllowance ?? summary.transportAllowance);
  const mealPay = days * meal;
  const transportPay = days * transport;
  const delta = (mealPay - num(summary.mealPay)) + (transportPay - num(summary.transportPay));

  return {
    ...summary,
    allowanceDays: days,
    mealPay,
    transportPay,
    earnedTotal: num(summary.earnedTotal) + delta,
    payoutTotal: num(summary.payoutTotal) + delta,
    netTotal: num(summary.netTotal) + delta,
    daysAdjusted: true,
    appAllowanceDays: appDays,
  };
}

/**
 * Bordroda yazan mesai saati ile uygulamanın saydığı saat tutuyor mu?
 * Uygulamanın varlık sebebi bu: para farkının SEBEBİ çoğu zaman saattir.
 */
export function hoursCheck(summary, slip, settings) {
  const record = normalizeSlip(slip);
  if (!entered(record, 'hours')) return null;

  const appHours = num(summary?.totalHours);
  const slipHours = num(record.hours);
  const diff = slipHours - appHours;
  const rate = hourlyRate(settings, summary?.periodKey);
  const multiplier = settings?.multipliers?.normal ?? 1.5;

  return {
    appHours,
    slipHours,
    diff,
    money: diff * rate * multiplier,
    status: Math.abs(diff) < 0.01 ? 'match' : diff < 0 ? 'short' : 'over',
  };
}

export function comparePayslip(summary, slip, settings) {
  const record = normalizeSlip(slip);
  const adjusted = entered(record, 'days') ? adjustForDays(summary, num(record.days), settings) : summary;
  const payoutExpected = num(adjusted?.payoutTotal ?? adjusted?.netTotal);

  // Ayrıca girilen kalemler: hem ödenene hem "kalan"ın hesabına girer.
  const lines = [];
  let extrasPaid = 0;
  let extrasExpected = 0;

  for (const line of EXTRA_LINES) {
    if (!entered(record, line.key)) continue;
    const paid = num(record[line.key]);
    const expected = num(line.expectedOf(adjusted));
    const sign = line.negative ? -1 : 1;
    extrasPaid += sign * paid;
    extrasExpected += sign * expected;
    lines.push({
      key: line.key,
      label: line.label,
      expected,
      paid,
      diff: sign * (paid - expected),
      negative: !!line.negative,
    });
  }

  // Net maaş girilmemişse yalnız girilen kalemler kıyaslanır. Aksi halde
  // "yol parasını yazdım" diyen biri bütün maaşı eksik yatmış gibi görürdü.
  const salaryEntered = entered(record, 'amount');
  const salaryExpected = payoutExpected - extrasExpected;
  const salaryPaid = num(record.amount);
  if (salaryEntered) {
    lines.unshift({
      key: 'amount',
      label: 'Net maaş',
      expected: salaryExpected,
      paid: salaryPaid,
      diff: salaryPaid - salaryExpected,
    });
  }

  const expectedTotal = salaryEntered ? payoutExpected : extrasExpected;
  const paid = salaryEntered ? salaryPaid + extrasPaid : extrasPaid;
  const diff = paid - expectedTotal;

  let status = 'match';
  if (diff < -TOLERANCE) status = 'short';
  else if (diff > TOLERANCE) status = 'over';

  const dayCheck = entered(record, 'days')
    ? { appDays: num(summary?.allowanceDays), slipDays: num(record.days), diff: num(record.days) - num(summary?.allowanceDays) }
    : null;

  return {
    expected: expectedTotal, paid, diff, status, lines,
    partial: !salaryEntered,
    payoutExpected,
    dayCheck,
    hours: hoursCheck(summary, record, settings),
    tolerance: TOLERANCE,
  };
}

/**
 * Farkı açıklamaya çalışır. Kalem girilmişse tahmine gerek yok — hangi
 * satırın tuttuğu zaten ölçülüyor; en büyük sapan kalem söylenir. Hiç kalem
 * girilmemişse eski davranış: tek kalemin tamamı eksik mi, kaç saatlik mesai
 * eder? Emin olunamıyorsa null döner, uydurma açıklama yapılmaz.
 */
export function explainPayslipDiff(summary, comparison, settings) {
  if (!comparison || comparison.status === 'match') return null;

  // Ölçülen kalem varsa (net maaş dışında), en çok sapanı söyle.
  const measured = (comparison.lines || []).filter((l) => l.key !== 'amount');
  if (measured.length > 0) {
    const worst = [...measured, ...(comparison.lines || []).filter((l) => l.key === 'amount')]
      .filter((l) => Math.abs(l.diff) > TOLERANCE)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
    if (!worst) return null;
    const yon = worst.diff < 0 ? 'eksik' : 'fazla';
    return `${worst.label}: beklenen ${fmt(worst.expected)}, yatan ${fmt(worst.paid)} — ${fmt(Math.abs(worst.diff))} ${yon}.`;
  }

  const diff = comparison.diff;
  const missing = -diff;

  const items = [
    { label: 'Yemek parası', value: summary.mealPay },
    { label: 'Yol parası', value: summary.transportPay },
    { label: 'Mesai ücreti', value: summary.overtimePay },
  ];
  for (const item of items) {
    if (item.value > 0 && Math.abs(missing - item.value) <= TOLERANCE) {
      return `${item.label} hiç yatmamış görünüyor.`;
    }
  }

  if (summary.advances > 0 && Math.abs(missing - summary.advances) <= TOLERANCE) {
    return 'Avans iki kez düşülmüş olabilir.';
  }
  if (summary.deductions > 0 && Math.abs(missing - summary.deductions) <= TOLERANCE) {
    return 'Kesinti iki kez düşülmüş olabilir.';
  }

  const rate = hourlyRate(settings, summary.periodKey);
  const multiplier = settings?.multipliers?.normal ?? 1.5;
  const perHour = rate * multiplier;
  if (perHour > 0) {
    const hours = Math.abs(diff) / perHour;
    const rounded = Math.round(hours * 4) / 4;
    // Fark, tam bir çeyrek saatin karşılığına kuruş kuruş oturmalı.
    if (rounded >= 0.25 && Math.abs(Math.abs(diff) - rounded * perHour) <= TOLERANCE) {
      const yon = diff < 0 ? 'eksik' : 'fazla';
      return `Yaklaşık ${formatQuarter(rounded)} saat mesai ${yon} ödenmiş olabilir.`;
    }
  }

  return null;
}

function fmt(value) {
  return `₺${Math.round(num(value)).toLocaleString('tr-TR')}`;
}

function formatQuarter(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

/** Bir dönemin kayıtlı bordrosu. */
export function payslipFor(state, periodKey) {
  return (state?.payslips || []).find((p) => p && p.periodKey === periodKey) || null;
}

/** Bordroda herhangi bir kalem girilmiş mi? */
export function hasPayslipData(slip) {
  if (!slip) return false;
  return PAYSLIP_LINES.some((l) => entered(slip, l.key));
}

/**
 * Bordro girilmiş dönemlerin karşılaştırma satırları, yeniden eskiye.
 * Girilmemiş dönemler listeye hiç girmez — boş ay listeyi kirletmesin.
 */
export function payslipRows(state, summaries, settings) {
  const config = settings || state?.settings;
  const rows = [];
  for (const summary of summaries) {
    const slip = payslipFor(state, summary.periodKey);
    if (!slip || !hasPayslipData(slip)) continue;
    const cmp = comparePayslip(summary, slip, config);
    rows.push({ periodKey: summary.periodKey, slip, status2: slip.status || 'acik', ...cmp });
  }
  return matchCompensations(rows.sort((a, b) => (a.periodKey < b.periodKey ? 1 : -1)));
}

/**
 * Bir ayın eksiği sonraki bir ayda fazla olarak yatmışsa eşleştirir.
 * Bir fazla yalnız bir eksiği kapatır — aynı para iki kez sayılmaz.
 * Satırlar yeniden eskiye sıralı gelir; eşleşme kronolojik yapılır.
 */
export function matchCompensations(rows) {
  const chrono = [...rows].sort((a, b) => (a.periodKey < b.periodKey ? -1 : 1));
  const used = new Set();

  for (const short of chrono) {
    if (short.diff >= -TOLERANCE) continue;
    const missing = -short.diff;
    const match = chrono.find((later) => (
      later.periodKey > short.periodKey
      && !used.has(later.periodKey)
      && later.diff > TOLERANCE
      && Math.abs(later.diff - missing) <= TOLERANCE
    ));
    if (!match) continue;
    used.add(match.periodKey);
    short.compensatedBy = match.periodKey;
    match.compensates = short.periodKey;
  }
  return rows;
}

/**
 * Yılın açık alacağı: telafi edilenler ve "kabul" işaretliler düşülür.
 */
export function openBalance(rows) {
  let open = 0;
  let compensated = 0;
  let accepted = 0;
  for (const row of rows) {
    if (row.diff >= -TOLERANCE) continue;
    const missing = -row.diff;
    if (row.compensatedBy) compensated += missing;
    else if (row.status2 === 'kabul') accepted += missing;
    else open += missing;
  }
  return { open, compensated, accepted };
}

/**
 * Kaç dönem tuttu, kaç dönem eksik ödendi? Rapor özeti için.
 * `cells`, verilen dönemlerle aynı sırada durum listesidir
 * ('match' | 'short' | 'over' | 'empty') — yılın 12 ayını tek şeritte
 * göstermek için.
 */
export function payslipStats(state, summaries, settings) {
  const stats = { checked: 0, match: 0, short: 0, over: 0, totalDiff: 0, cells: [] };
  const rows = payslipRows(state, summaries, settings);
  const byPeriod = new Map(rows.map((r) => [r.periodKey, r]));

  for (const row of rows) {
    stats.checked += 1;
    stats[row.status] += 1;
    stats.totalDiff += row.diff;
  }
  for (const summary of summaries || []) {
    stats.cells.push(byPeriod.get(summary.periodKey)?.status || 'empty');
  }
  return stats;
}

/**
 * Kalem bazında yıl toplamı: hangi kalem sistematik eksik yatıyor?
 * Yalnız girilmiş kalemler sayılır.
 */
export function payslipLineTotals(state, summaries, settings) {
  const totals = new Map();
  for (const row of payslipRows(state, summaries, settings)) {
    for (const line of row.lines) {
      const t = totals.get(line.key) || { key: line.key, label: line.label, expected: 0, paid: 0, months: 0 };
      t.expected += line.expected;
      t.paid += line.paid;
      t.months += 1;
      totals.set(line.key, t);
    }
  }
  const order = PAYSLIP_LINES.map((l) => l.key);
  return [...totals.values()]
    .map((t) => ({ ...t, diff: t.paid - t.expected }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export { TOLERANCE };
