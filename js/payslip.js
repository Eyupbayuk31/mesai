// Bordro karşılaştırma: şirketin ödediği ile uygulamanın hesabı tutuyor mu?
//
// Mesai takip etmenin asıl sebebi bu. Fark varsa körü körüne "eksik" demek
// yerine, farkın hangi kalemden gelebileceğini de söyler — böylece muhasebeye
// somut bir şey sorulabilir.

import { hourlyRate } from './payroll.js';

// Kuruş farkları ve yuvarlama gürültüsü "eksik ödeme" sayılmasın.
const TOLERANCE = 1;

/**
 * @param {object} summary periodSummary() çıktısı
 * @param {number} paid şirketin ödediği tutar
 */
export function comparePayslip(summary, paid) {
  const expected = Number(summary?.netTotal) || 0;
  const amount = Number(paid) || 0;
  const diff = amount - expected;

  let status = 'match';
  if (diff < -TOLERANCE) status = 'short';
  else if (diff > TOLERANCE) status = 'over';

  return { expected, paid: amount, diff, status, tolerance: TOLERANCE };
}

/**
 * Farkı açıklamaya çalışır. Tek bir kalemin tamamı eksikse onu söyler;
 * değilse kaç saatlik mesaiye denk geldiğini verir. Emin olamıyorsa null
 * döner — uydurma açıklama yapmaz.
 */
export function explainPayslipDiff(summary, comparison, settings) {
  if (!comparison || comparison.status === 'match') return null;
  const diff = comparison.diff;
  const missing = -diff; // eksik ödemede pozitif

  // 1) Bir kalemin tamamı hiç ödenmemiş olabilir mi?
  const items = [
    { label: 'Yemek parası', value: summary.mealPay },
    { label: 'Yol parası', value: summary.transportPay },
    { label: 'Mesai ücreti', value: summary.overtimePay },
    { label: 'Prim', value: summary.bonuses },
  ];
  for (const item of items) {
    if (item.value > 0 && Math.abs(missing - item.value) <= TOLERANCE) {
      return `${item.label} hiç yatmamış görünüyor.`;
    }
  }

  // 2) Kesinti/avans iki kez düşülmüş olabilir mi?
  if (summary.advances > 0 && Math.abs(missing - summary.advances) <= TOLERANCE) {
    return 'Avans iki kez düşülmüş olabilir.';
  }
  if (summary.deductions > 0 && Math.abs(missing - summary.deductions) <= TOLERANCE) {
    return 'Kesinti iki kez düşülmüş olabilir.';
  }

  // 3) Fark kaç saatlik mesaiye denk geliyor? (normal mesai çarpanıyla)
  const rate = hourlyRate(settings, summary.periodKey);
  const multiplier = settings?.multipliers?.normal ?? 1.5;
  const perHour = rate * multiplier;
  if (perHour > 0) {
    const hours = Math.abs(diff) / perHour;
    const rounded = Math.round(hours * 4) / 4;
    // Fark, tam bir çeyrek saatin karşılığına kuruş kuruş oturmalı. Yaklaşık
    // tutturmak yanıltır: yarım saat 150 TL iken 137 TL'lik farka "0,5 saat"
    // demek muhasebeye yanlış bir şey sordurur.
    if (rounded >= 0.25 && Math.abs(Math.abs(diff) - rounded * perHour) <= TOLERANCE) {
      const yon = diff < 0 ? 'eksik' : 'fazla';
      return `Yaklaşık ${formatQuarter(rounded)} saat mesai ${yon} ödenmiş olabilir.`;
    }
  }

  return null;
}

function formatQuarter(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

/** Bir dönemin kayıtlı bordrosu. */
export function payslipFor(state, periodKey) {
  return (state?.payslips || []).find((p) => p && p.periodKey === periodKey) || null;
}

/** Kaç dönem tuttu, kaç dönem eksik ödendi? Rapor özeti için. */
export function payslipStats(state, summaries) {
  const stats = { checked: 0, match: 0, short: 0, over: 0, totalDiff: 0 };
  for (const summary of summaries) {
    const slip = payslipFor(state, summary.periodKey);
    if (!slip) continue;
    const cmp = comparePayslip(summary, slip.amount);
    stats.checked += 1;
    stats[cmp.status] += 1;
    stats.totalDiff += cmp.diff;
  }
  return stats;
}

export { TOLERANCE };
