// Krediler / borçlar.
//
// Bir kredi, her ay bütçeden düşen sabit bir taksittir; ödendikçe kalan borç
// azalır. Taksitler bütçeye "sanal harcama" olarak girer (sürekli giderler gibi),
// ama sürekli giderlerden iki farkı vardır:
//   1. Taksit sayısı bellidir — bitince kendiliğinden durur.
//   2. Ara/erken ödeme yapılabilir; borç erken kapanırsa taksit de kesilir.
//
// Ara ödemeler ayrı bir liste değil, `loanId` taşıyan normal harcamalardır.
// Böylece o ayın bütçesinden de düşerler (gerçekte de para çıkmıştır) ve
// senkronda kayıt bazında birleşirler.

import { shiftPeriod, periodRange } from './period.js';

export function loanTotal(loan) {
  return (Number(loan?.amount) || 0) * (Number(loan?.installments) || 0);
}

// İki dönem arasındaki ay farkı: '2026-08' → '2026-11' = 3
export function periodDiff(fromPeriod, toPeriod) {
  const [fy, fm] = String(fromPeriod).split('-').map(Number);
  const [ty, tm] = String(toPeriod).split('-').map(Number);
  if ([fy, fm, ty, tm].some((n) => !Number.isFinite(n))) return 0;
  return (ty - fy) * 12 + (tm - fm);
}

// Bir kredinin ara ödemeleri: loanId ile işaretlenmiş harcamalar.
export function extraPaymentsOf(state, loanId) {
  return (state?.expenses || []).filter((e) => e && e.loanId === loanId);
}

function extraPaidBefore(payments, periodKey) {
  const start = `${periodKey}-01`;
  return payments
    .filter((p) => p.date < start)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

/**
 * Bu dönemde bu krediden ne kadar taksit düşecek?
 * Borç erken kapandıysa veya taksitler bittiyse 0 döner — kredi bitince
 * bütçeden düşmeye devam etmesi yanlış olur.
 */
export function loanDueInPeriod(loan, periodKey, payments = []) {
  if (!loan || loan.active === false) return 0;
  const amount = Number(loan.amount) || 0;
  const installments = Number(loan.installments) || 0;
  if (amount <= 0 || installments <= 0) return 0;

  const index = periodDiff(loan.firstPeriod, periodKey);
  if (index < 0 || index >= installments) return 0;

  const total = amount * installments;
  const paidByInstallments = index * amount;
  const remainingBefore = total - paidByInstallments - extraPaidBefore(payments, periodKey);
  if (remainingBefore <= 0) return 0;

  // Son taksit küsuratlı kalabilir; borçtan fazlası çekilmez.
  return Math.min(amount, remainingBefore);
}

/**
 * Kredinin verilen döneme kadarki durumu.
 * Ödenen = o güne kadar düşen taksitler + ara ödemeler.
 */
export function loanStatus(loan, payments, periodKey) {
  const amount = Number(loan?.amount) || 0;
  const installments = Number(loan?.installments) || 0;
  const total = amount * installments;

  const index = periodDiff(loan?.firstPeriod, periodKey);
  let paidByInstallments = 0;
  let paidInstallments = 0;

  // Taksitleri tek tek toplarız: ara ödeme araya girdiğinde sonraki taksitler
  // kısalabilir veya hiç düşmeyebilir, formülle tek seferde bulunamaz.
  for (let i = 0; i <= index && i < installments; i += 1) {
    const due = loanDueInPeriod(loan, shiftPeriod(loan.firstPeriod, i), payments);
    if (due <= 0) break;
    paidByInstallments += due;
    paidInstallments += 1;
  }

  const { endISO } = periodRange(periodKey);
  const extraPaid = (payments || [])
    .filter((p) => p.date <= endISO)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const paid = Math.min(total, paidByInstallments + extraPaid);
  const remaining = Math.max(0, total - paid);

  // Kalan borç bu hızla kaç ay sürer? Ara ödeme bitişi öne çeker.
  const monthsLeft = amount > 0 ? Math.ceil(remaining / amount) : 0;
  const endPeriod = remaining > 0 ? shiftPeriod(periodKey, monthsLeft) : null;

  return {
    total,
    amount,
    installments,
    paidInstallments,
    paidByInstallments,
    extraPaid,
    paid,
    remaining,
    monthsLeft,
    endPeriod,
    progress: total > 0 ? paid / total : 0,
    finished: remaining <= 0,
    notStarted: index < 0,
  };
}

/** Tüm kredilerin toplu durumu — Bütçe ve Özet özetleri için. */
export function loansSummary(state, periodKey) {
  const loans = (state?.loans || []).filter((l) => l && l.active !== false);
  const items = loans.map((loan) => {
    const payments = extraPaymentsOf(state, loan.id);
    return {
      loan,
      payments,
      status: loanStatus(loan, payments, periodKey),
      dueThisPeriod: loanDueInPeriod(loan, periodKey, payments),
    };
  });

  // Bitmiş krediler listede kalır ama toplamları şişirmez.
  const openItems = items.filter((i) => !i.status.finished);
  return {
    items: items.sort((a, b) => b.status.remaining - a.status.remaining),
    totalRemaining: openItems.reduce((sum, i) => sum + i.status.remaining, 0),
    totalDebt: items.reduce((sum, i) => sum + i.status.total, 0),
    monthlyTotal: items.reduce((sum, i) => sum + i.dueThisPeriod, 0),
    openCount: openItems.length,
    count: items.length,
  };
}

/** Bütçenin sanal harcama üretmesi için: bu dönemin taksitleri. */
export function loanExpensesForPeriod(state, periodKey) {
  const out = [];
  for (const loan of state?.loans || []) {
    const payments = extraPaymentsOf(state, loan.id);
    const due = loanDueInPeriod(loan, periodKey, payments);
    if (due <= 0) continue;
    const day = Math.min(28, Math.max(1, Number(loan.day) || 1));
    out.push({
      id: `ln_${loan.id}`,
      date: `${periodKey}-${String(day).padStart(2, '0')}`,
      amount: due,
      category: loan.category || 'kredi',
      note: loan.label || 'Kredi taksiti',
      loanRef: loan.id,
      virtual: true,
      createdAt: `${periodKey}-01T00:00:00.000Z`,
    });
  }
  return out;
}
