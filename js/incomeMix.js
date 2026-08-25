// Dönem gelirinin bileşimi: para nereden geliyor?
//
// "Maaşım 45 bin" demek kolay, ama cebe giren rakamın ne kadarı maaş, ne
// kadarı mesai, ne kadarı yemek-yol? Gelir sayfasındaki yığın çubuğu bunu
// tek bakışta gösteriyor. Saf hesap: yüzdeler tam 100 eder, sıfır kalemler
// hiç listeye girmez.

export const MIX_PARTS = [
  { key: 'salary', label: 'Maaş', color: 'var(--mix-salary)', of: (s) => s.baseSalary },
  { key: 'overtime', label: 'Mesai', color: 'var(--mix-overtime)', of: (s) => s.overtimePay },
  { key: 'allowance', label: 'Yemek + yol', color: 'var(--mix-allowance)', of: (s) => num(s.mealPay) + num(s.transportPay) },
  { key: 'extra', label: 'Prim + ek gelir', color: 'var(--mix-extra)', of: (s) => num(s.bonuses) + num(s.extraIncome) },
];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {object} summary periodSummary() çıktısı
 * @returns {{total:number, parts:Array<{key,label,color,amount,pct}>}}
 */
export function incomeMix(summary) {
  const parts = MIX_PARTS
    .map((p) => ({ key: p.key, label: p.label, color: p.color, amount: num(p.of(summary || {})) }))
    .filter((p) => p.amount > 0);

  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  if (total <= 0) return { total: 0, parts: [] };

  // En büyük kalan yöntemi: yuvarlamadan sonra yüzdeler tam 100 etsin,
  // çubukta 1 piksellik boşluk kalmasın.
  const exact = parts.map((p) => (p.amount / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const pcts = [...floors];
  for (const { i } of order) {
    if (left <= 0) break;
    pcts[i] += 1;
    left -= 1;
  }

  return { total, parts: parts.map((p, i) => ({ ...p, pct: pcts[i] })) };
}
