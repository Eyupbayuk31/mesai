// Krediler ve borçlar.
//
// İki tür borç aynı kayıtta tutulur:
//   1. TAKSİTLİ  (banka kredisi, taksitli kart borcu): her ay bütçeden sabit
//      bir taksit düşer, taksit sayısı bellidir, bitince kendiliğinden durur.
//   2. AÇIK      (bir kişiye borç, kart bakiyesi): aylık taksit yoktur, eline
//      geçtikçe ödenir. `installments` 0/boş olduğunda `amount` TOPLAM borçtur.
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

import { shiftPeriod, periodRange, currentPeriodKey } from './period.js';

/** Borç türleri. `kind` yoksa eski kayıtlar kredidir — göç gerekmez. */
export const DEBT_KINDS = [
  { key: 'kredi', label: 'Kredi', short: 'Kredi', color: '#8a5a2b', category: 'kredi' },
  { key: 'kisi', label: 'Kişiye borç', short: 'Kişi', color: '#2f63c4', category: 'borc' },
  { key: 'kart', label: 'Kredi kartı', short: 'Kart', color: '#8447b5', category: 'borc' },
  { key: 'diger', label: 'Diğer borç', short: 'Diğer', color: '#7d7666', category: 'borc' },
];

const KIND_BY_KEY = new Map(DEBT_KINDS.map((k) => [k.key, k]));

export function loanKind(loan) {
  return KIND_BY_KEY.get(loan?.kind) || DEBT_KINDS[0];
}

/** Taksitsiz (açık) borç mu? O zaman `amount` toplam borçtur. */
export function isOpenDebt(loan) {
  return !((Number(loan?.installments) || 0) > 0);
}

export function loanTotal(loan) {
  const amount = Number(loan?.amount) || 0;
  if (isOpenDebt(loan)) return amount;
  return amount * (Number(loan?.installments) || 0);
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
  // Açık borcun aylık taksiti yoktur: bütçeye kendiliğinden yazılmaz, yalnız
  // ödeme yapıldıkça gerçek harcama olarak iner.
  if (isOpenDebt(loan)) return 0;
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
  const total = loanTotal(loan);
  const open = isOpenDebt(loan);

  const index = periodDiff(loan?.firstPeriod, periodKey);
  let paidByInstallments = 0;
  let paidInstallments = 0;
  // Açık borçta taksit döngüsü çalışmaz; ödenen yalnız yapılan ödemelerdir.

  // Taksitleri tek tek toplarız: ara ödeme araya girdiğinde sonraki taksitler
  // kısalabilir veya hiç düşmeyebilir, formülle tek seferde bulunamaz.
  for (let i = 0; !open && i <= index && i < installments; i += 1) {
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
  // Açık borçta aylık bir hız yok — bitiş tahmini de yapılmaz.
  const monthsLeft = !open && amount > 0 ? Math.ceil(remaining / amount) : 0;
  const endPeriod = !open && remaining > 0 ? shiftPeriod(periodKey, monthsLeft) : null;

  return {
    total,
    amount,
    installments,
    open,
    paidInstallments,
    paidByInstallments,
    extraPaid,
    paid,
    remaining,
    monthsLeft,
    endPeriod,
    progress: total > 0 ? paid / total : 0,
    finished: total > 0 && remaining <= 0,
    notStarted: !open && index < 0,
  };
}

/**
 * Borçların toplu durumu — Bütçe ve Özet özetleri için.
 * @param {object} [options]
 * @param {string|string[]} [options.kind] yalnız bu tür(ler)i say
 */
export function loansSummary(state, periodKey, options = {}) {
  const wanted = options.kind === undefined || options.kind === null
    ? null
    : new Set(Array.isArray(options.kind) ? options.kind : [options.kind]);

  const loans = (state?.loans || [])
    .filter((l) => l && l.active !== false)
    .filter((l) => !wanted || wanted.has(loanKind(l).key));
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

  // Tür bazında kırılım: Gider sayfası "krediler" ve "diğer borçlar"ı ayrı
  // satırda gösteriyor, iki kez hesaplamaya gerek kalmasın.
  const byKind = {};
  for (const kind of DEBT_KINDS) {
    byKind[kind.key] = { remaining: 0, monthly: 0, count: 0, openCount: 0 };
  }
  for (const item of items) {
    const bucket = byKind[loanKind(item.loan).key];
    bucket.count += 1;
    bucket.monthly += item.dueThisPeriod;
    if (!item.status.finished) {
      bucket.remaining += item.status.remaining;
      bucket.openCount += 1;
    }
  }

  return {
    items: items.sort((a, b) => b.status.remaining - a.status.remaining),
    totalRemaining: openItems.reduce((sum, i) => sum + i.status.remaining, 0),
    totalDebt: items.reduce((sum, i) => sum + i.status.total, 0),
    monthlyTotal: items.reduce((sum, i) => sum + i.dueThisPeriod, 0),
    openCount: openItems.length,
    count: items.length,
    byKind,
  };
}

/**
 * Rapor için borç özeti: verilen dönemlerin sonunda ne kadar borç kaldı, o
 * dönemlerde borca ne kadar ödendi?
 *
 * Ekran ve HTML rapor aynı çıktıyı kullanır. Yeni hesap yazılmaz; kalan borç
 * `loansSummary`, ödenen ise taksit (`loanDueInPeriod`) + o döneme düşen
 * ödemelerden toplanır.
 *
 * Gelecek dönemler sayılmaz: henüz ödenmemiş taksitleri "ödendi" yazmak
 * borcu olduğundan küçük gösterirdi (yıllık raporda Aralık'a kadar hepsi
 * kapanmış görünüyordu).
 *
 * @param {string[]} periodKeys eskiden yeniye sıralı dönemler
 * @param {string} [nowPeriod] bugünün dönemi — testlerde sabitlenebilir
 */
export function debtReport(state, periodKeys, nowPeriod = currentPeriodKey()) {
  const all = Array.isArray(periodKeys) ? periodKeys : [];
  const keys = all.filter((k) => k <= nowPeriod);
  const loans = (state?.loans || []).filter(Boolean);

  const empty = {
    remaining: 0, totalPaid: 0, hasDebt: false,
    byKind: [], months: keys.map((periodKey) => ({ periodKey, remaining: 0, paid: 0 })),
  };
  if (loans.length === 0 || keys.length === 0) return empty;

  const paidByKind = new Map();
  const months = [];

  for (const periodKey of keys) {
    const { startISO, endISO } = periodRange(periodKey);
    let paid = 0;

    for (const loan of loans) {
      const payments = extraPaymentsOf(state, loan.id);
      // O dönemde borca giden para: taksit + o ay yapılan elden ödemeler.
      const inPeriod = payments
        .filter((p) => p?.date >= startISO && p.date <= endISO)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const due = loanDueInPeriod(loan, periodKey, payments);
      const total = due + inPeriod;
      if (total <= 0) continue;
      paid += total;
      const key = loanKind(loan).key;
      paidByKind.set(key, (paidByKind.get(key) || 0) + total);
    }

    const snapshot = loansSummary(state, periodKey);
    months.push({ periodKey, remaining: snapshot.totalRemaining, paid });
  }

  // Kalan borç son dönemin fotoğrafıdır — toplanmaz, en sondaki alınır.
  const last = loansSummary(state, keys[keys.length - 1]);

  const byKind = DEBT_KINDS.map((kind) => ({
    key: kind.key,
    label: kind.label,
    color: kind.color,
    remaining: last.byKind?.[kind.key]?.remaining || 0,
    paid: paidByKind.get(kind.key) || 0,
  })).filter((row) => row.remaining > 0 || row.paid > 0);

  const totalPaid = months.reduce((sum, m) => sum + m.paid, 0);

  return {
    remaining: last.totalRemaining,
    totalPaid,
    hasDebt: last.totalRemaining > 0 || totalPaid > 0,
    byKind,
    months,
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
