// Bir dönemde ELE GEÇEN para.
//
// Uygulamanın geri kalanı "bu dönem ne kazanılmalı" hesabını yapar: maaş +
// mesai + yemek + yol. O hesap bordroyu denetlemek için gerekli — şirket eksik
// yatırdı mı oradan anlıyoruz. Ama harcama bütçesi için yanıltıcıydı: maaş
// daha yatmadan cepte varmış gibi görünüyordu. Burası tersini yapar, yalnızca
// gerçekten giren parayı toplar.
//
// Hangi para hangi döneme yazılır? Maaş, ait olduğu dönemden `payMonthOffset`
// ay sonra yatar: Ağustos bordrosu 10 Eylül'de ele geçer. Yani EYLÜL'de
// harcayabileceğin para AĞUSTOS bordrosudur. Bu yüzden dönemin bütçesi bir
// önceki dönemin bordrosundan gelir.

import { shiftPeriod } from './period.js';
import { payslipFor, PAYSLIP_LINES } from './payslip.js';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Bordroya girilen kalemlerin toplamı: hesaba geçen para.
 * Kesinti kalemi ödemeyi azalttığı için düşülür.
 */
export function payslipTotal(slip) {
  if (!slip) return 0;
  let total = 0;
  for (const line of PAYSLIP_LINES) {
    const value = num(slip[line.key]);
    total += line.negative ? -value : value;
  }
  return total;
}

/**
 * `periodKey` içinde ele geçen para hangi dönemin bordrosundan gelir?
 * Kaydırma 1 ise Eylül'ün parası Ağustos bordrosu, 2 ise Temmuz.
 * Tek tanım burada dursun diye dışa açık — Bordro sayfası da bunu kullanır.
 */
export function payslipPeriodFor(settings, periodKey) {
  return shiftPeriod(periodKey, -((settings?.payMonthOffset) ?? 1));
}

/**
 * Dönemde ele geçen para.
 *
 * @returns {{
 *   periodKey: string, payslipPeriod: string, hasPayslip: boolean,
 *   payslip: number, manual: number, advances: number, total: number,
 *   lines: Array<{key: string, label: string, amount: number}>,
 * }}
 */
export function receivedInPeriod(state, periodKey) {
  const settings = state?.settings || {};
  const payslipPeriod = payslipPeriodFor(settings, periodKey);
  const slip = payslipFor(state, payslipPeriod);
  const payslip = payslipTotal(slip);

  // Elle girilen para girişleri ve avanslar bu dönemde ele geçmiş sayılır.
  // ("bonus" artık girilmiyor ama eski kayıtlar duruyor — para girişi sayılır.)
  // Kesinti ayrıca düşülmez: bordroya yazdığın tutar zaten kesinti sonrasıdır.
  let manual = 0;
  let advances = 0;
  for (const adj of state?.adjustments || []) {
    if (adj?.periodKey !== periodKey) continue;
    const amount = num(adj.amount);
    if (adj.kind === 'income' || adj.kind === 'bonus') manual += amount;
    else if (adj.kind === 'advance') advances += amount;
  }

  const lines = [];
  if (payslip !== 0) lines.push({ key: 'payslip', label: 'Bordro', amount: payslip });
  if (advances !== 0) lines.push({ key: 'advance', label: 'Avans', amount: advances });
  if (manual !== 0) lines.push({ key: 'manual', label: 'Para girişi', amount: manual });

  return {
    periodKey,
    payslipPeriod,
    hasPayslip: payslip !== 0,
    payslip,
    manual,
    advances,
    total: payslip + manual + advances,
    lines,
  };
}
