// Bir dönemde ELE GEÇEN para.
//
// Uygulamanın geri kalanı "bu dönem ne kazanılmalı" hesabını yapar: maaş +
// mesai + yemek + yol. O hesap bordroyu denetlemek için gerekli — şirket eksik
// yatırdı mı oradan anlıyoruz. Ama harcama bütçesi için yanıltıcıydı: maaş
// daha yatmadan cepte varmış gibi görünüyordu. Burası tersini yapar, yalnızca
// gerçekten giren parayı toplar.
//
// Hangi para hangi döneme yazılır? BORDRO KENDİ AYININ PARASIDIR. Ağustos
// bordrosu 10 Eylül'de yatar ve o gün girilir, ama Ağustos'un kazancıdır:
// Ağustos'un toplamında sayılır, Eylül'ünkinde değil.
//
// Eylül ekranında HİÇ görünmez. Eskiden görünüyor ve toplama giriyordu;
// Eylül'ün toplamı, Eylül'ün kazancı olmayan bir parayla şişiyordu.

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

// Elle girilen para girişleri ve avanslar: girildikleri dönemde cebe girmiş
// sayılır. ("bonus" artık girilmiyor ama eski kayıtlar duruyor.)
// Kesinti ayrıca düşülmez: bordroya yazdığın tutar zaten kesinti sonrasıdır.
//
// Kullanıcının kendi yazdığı etiketler de taşınır. "Para girişi ₺35.000"
// satırı tek başına hiçbir şey anlatmıyordu: bordrodan mı geldi, elle mi
// girildi, ne parası? Etiket olunca satır kendini açıklıyor.
function elleGirilenler(state, periodKey) {
  let manual = 0;
  let advances = 0;
  const manualItems = [];
  const advanceItems = [];
  for (const adj of state?.adjustments || []) {
    if (adj?.periodKey !== periodKey) continue;
    const amount = num(adj.amount);
    if (adj.kind === 'income' || adj.kind === 'bonus') {
      manual += amount;
      manualItems.push({ id: adj.id, label: adj.label || '', amount });
    } else if (adj.kind === 'advance') {
      advances += amount;
      advanceItems.push({ id: adj.id, label: adj.label || '', amount });
    }
  }
  return { manual, advances, manualItems, advanceItems };
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

  // Dönemin KENDİ bordrosu — toplama giren tek bordro budur.
  const payslip = payslipTotal(payslipFor(state, periodKey));

  // Bu dönemde YATAN bordronun dönemi. Toplamla ilgisi yok; yalnız "maaşın
  // yattığında şu ayın bordrosunu gir" yönlendirmesi için lazım.
  const payslipPeriod = payslipPeriodFor(settings, periodKey);

  const { manual, advances, manualItems, advanceItems } = elleGirilenler(state, periodKey);

  const lines = [];
  if (payslip !== 0) lines.push({ key: 'payslip', label: 'Bordro', amount: payslip, items: [] });
  if (advances !== 0) lines.push({ key: 'advance', label: 'Avans', amount: advances, items: advanceItems });
  if (manual !== 0) lines.push({ key: 'manual', label: 'Para girişi', amount: manual, items: manualItems });

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

/**
 * Bu dönem içinde FİİLEN CEBE GİREN para.
 *
 * `receivedInPeriod` ile karıştırılmamalı — ikisi AYRI SORULARI cevaplıyor ve
 * bir süre tek sayıyla cevaplanmaya çalışıldığı için Eylül'ün bütçesi
 * "−4.000 ₺ açık" çıkıyordu:
 *
 *   receivedInPeriod → "bu ay ne KAZANDIM?"  → ayın KENDİ bordrosu.
 *     Ağustos bordrosu 10 Eylül'de yatsa da Ağustos'un kazancıdır; bordro
 *     denetimi ve gelir raporu bunu ister.
 *
 *   cashInPeriod     → "bu ay ne HARCAYABİLİRİM?" → bu ay YATAN bordro.
 *     Eylül boyunca harcanan para 10 Eylül'de gelen Ağustos bordrosudur;
 *     bütçenin dayanağı budur.
 *
 * Para girişleri ve avanslar her iki hesapta da girildikleri döneme yazılır —
 * onların "ait olduğu ay" diye ayrı bir kavramı yok, girildikleri gün cebe
 * girmişlerdir.
 */
export function cashInPeriod(state, periodKey) {
  const settings = state?.settings || {};
  const payslipPeriod = payslipPeriodFor(settings, periodKey);
  const payslip = payslipTotal(payslipFor(state, payslipPeriod));
  const { manual, advances, manualItems, advanceItems } = elleGirilenler(state, periodKey);

  const lines = [];
  if (payslip !== 0) lines.push({ key: 'payslip', label: 'Bordro', amount: payslip, items: [], periodKey: payslipPeriod });
  if (advances !== 0) lines.push({ key: 'advance', label: 'Avans', amount: advances, items: advanceItems });
  if (manual !== 0) lines.push({ key: 'manual', label: 'Para girişi', amount: manual, items: manualItems });

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
