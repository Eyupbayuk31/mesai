// Bütçe kontrol: günlük harcamalar + tahmini ödemeden kalan hesabı.
// Tüm fonksiyonlar saf; kalem CRUD işlemleri Store'da.

import { periodSummary } from './payroll.js';
import { periodRange, shiftPeriod } from './period.js';
import { parseISODate, formatMoney, todayISO } from './format.js';

// Harcama kategorileri — renkler CSS değişkenlerinden bağımsız sabit hex,
// HTML raporunda da aynı palet kullanılır. Ayarlardan özel kategori eklenebilir;
// özel olanlar ayarlarda (customCategories) tutulur ve buradaki listeye birleşir.
export const CATEGORIES = [
  { key: 'market', label: 'Market', color: '#2f8a5c' },
  { key: 'yemek', label: 'Yemek', color: '#d97d0d' },
  { key: 'ulasim', label: 'Ulaşım', color: '#2f63c4' },
  { key: 'fatura', label: 'Fatura', color: '#0e8a8a' },
  { key: 'kira', label: 'Kira', color: '#8447b5' },
  { key: 'kredi', label: 'Kredi', color: '#8a5a2b' },
  { key: 'giyim', label: 'Giyim', color: '#c2568e' },
  { key: 'eglence', label: 'Eğlence', color: '#b0431f' },
  { key: 'diger', label: 'Diğer', color: '#7d7666' },
];

// Hazır + özel kategoriler (sıralı; "Diğer" her zaman sondadır).
export function allCategories(settings) {
  const custom = Array.isArray(settings?.customCategories) ? settings.customCategories : [];
  return [...CATEGORIES.slice(0, -1), ...custom, CATEGORIES[CATEGORIES.length - 1]];
}

export function categoryOf(key, settings) {
  const all = allCategories(settings);
  return all.find((c) => c.key === key) || all[all.length - 1];
}

// Ayın `day`'i o ayda yoksa (örn. 31 çekmeyen ay) ayın son gününe kırpılır.
function clampDay(periodKey, day) {
  const [y, m] = periodKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Math.min(Math.max(1, day || 1), last);
}

// Dönemin bütçe özeti: harcamalar (gerçek + sürekli gider sanalları), kategori
// kırılımı, tahmini ödemeden kalan ve (dönem içindeysek) günlük pay.
// Sürekli gider tanımı, girildiği dönemden SONRAKİ dönemlerden itibaren sanal
// harcama üretir — girildiği ay zaten gerçek harcaması var, çifte sayım olmasın.
export function budgetSummary(state, periodKey, todayStr = todayISO()) {
  const realExpenses = (state.expenses || []).filter((e) => e.date.slice(0, 7) === periodKey);
  const virtualExpenses = (state.recurring || [])
    .filter((r) => r.active !== false && periodKey > (r.since || '0000-00'))
    .map((r) => ({
      id: `vr_${r.id}`,
      date: `${periodKey}-${String(clampDay(periodKey, r.day)).padStart(2, '0')}`,
      amount: Number(r.amount) || 0,
      category: r.category,
      note: r.label,
      recurringId: r.id,
      virtual: true,
      createdAt: `${periodKey}-01T00:00:00.000Z`,
    }));
  const expenses = [...realExpenses, ...virtualExpenses];
  const pay = periodSummary(state, periodKey);

  const byCategory = new Map();
  let spent = 0;
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    spent += amount;
    byCategory.set(e.category, (byCategory.get(e.category) || 0) + amount);
  }

  const hasSalary = pay.baseSalary > 0;
  // Bütçe avansı geri ekler: avans çekilen para eline erken geçer ve genelde
  // fatura/harcama olarak zaten girilir — bütçede bir daha düşmek çifte sayım
  // olur. Kesinti ise hiç gelmediği için düşülü kalır.
  const expectedTotal = pay.netTotal + pay.advances;
  const remaining = expectedTotal - spent;

  // Günlük pay yalnızca içinde bulunulan dönem için anlamlı; ayın kalan günleri
  // (bugün dahil) kalan tutara bölünür.
  const isCurrent = periodKey === todayStr.slice(0, 7);
  const { endISO } = periodRange(periodKey);
  const daysLeft = isCurrent
    ? Math.round((parseISODate(endISO) - parseISODate(todayStr)) / 86400000) + 1
    : 0;
  const dailyAllowance = isCurrent && hasSalary ? remaining / Math.max(1, daysLeft) : null;

  return {
    periodKey,
    isCurrent,
    expenseCount: realExpenses.length,
    virtualCount: virtualExpenses.length,
    expenses,
    spent,
    byCategory: [...byCategory.entries()]
      .map(([key, amount]) => ({ ...categoryOf(key, state.settings), amount }))
      .sort((a, b) => b.amount - a.amount),
    recurring: (state.recurring || []).filter((r) => r.active !== false && periodKey > (r.since || '0000-00')),
    // Bu ay işaretlenmiş, sanal üretmeye bu dönemden sonra başlayacak tanımlar
    upcomingRecurring: (state.recurring || []).filter((r) => r.active !== false && (r.since || '') === periodKey),
    upcomingTotal: (state.recurring || [])
      .filter((r) => r.active !== false && (r.since || '') === periodKey)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    expectedTotal,
    advances: pay.advances,
    hasSalary,
    remaining,
    daysLeft,
    dailyAllowance,
  };
}

// Genel tasarruf tavsiyeleri — günün tarihine göre döner ("arada" değişir).
const GENERIC_TIPS = [
  'Market alışverişine listesiz çıkma; liste, tezgâh başı dürtü alımlarını keser.',
  'Büyük alımlarda 24 saat kuralını uygula: süre geçince hâlâ istiyorsan al.',
  'Kullanmadığın abonelikleri iptal et; ayda yüzlerce lira çalan sessiz giderlerdir.',
  'Yemek kartı bakiyeni market alışverişinde kullan; cebinden nakit çıkışı azalır.',
  'Haftalık nakit limiti koy; kartın görünmez harcamalarını görünür yapar.',
  'Faturaları bir aydan bir aya aynı gün kontrol et; yanlış okuma ve kaçak ücret yakala.',
];

// Veriye göre öneriler: hız uyarısı / birikim fırsatı / en büyük kategori.
// En fazla 2 madde döner (1 veri temelli + 1 dönen genel tavsiye).
export function budgetTips(s, todayStr = todayISO()) {
  const tips = [];
  const dayOfMonth = Number(todayStr.slice(8, 10));
  const [y, m] = s.periodKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const money = (v) => formatMoney(v, { decimals: false });

  if (s.expenseCount > 0 && s.hasSalary && s.isCurrent) {
    const daysElapsed = Math.max(1, daysInMonth - s.daysLeft + 1);
    const projected = (s.spent / daysElapsed) * daysInMonth;
    if (projected > s.expectedTotal && s.remaining >= 0) {
      tips.push(`Şu anki hızla ayı ${money(projected)} harcamayla kapatırsın — bütçeyi aşarsın. Kalan ${s.daysLeft} günde günde ${money(s.dailyAllowance)} ile sınırla.`);
    } else if (projected > s.expectedTotal && s.remaining < 0) {
      tips.push(`Bütçe ${money(-s.remaining)} aşıldı ve hız düşmüyor. Kalan ${s.daysLeft} günde yeni büyük gideri erteleyip günde ${money(s.dailyAllowance)} hedefine dön.`);
    } else if (s.remaining > 0) {
      tips.push(`Bu hızla ay sonunda ~${money(s.remaining)} elinde kalır; yarısını (${money(s.remaining / 2)}) ay bitmeden bir kenara ayır.`);
    }
  }

  const top = s.byCategory[0];
  if (top && top.amount >= 500 && top.amount / s.spent >= 0.35) {
    const share = Math.round((top.amount / s.spent) * 100);
    tips.push(`Bu ayın giderinin %${share}'i ${top.label}: ${money(top.amount)}. Buradan %10 kısarsan ~${money(top.amount * 0.1)} cebinde kalır.`);
  }

  if (s.expenseCount === 0) tips.push('Harcamalarını girdikçe öneriler sana özelleşir.');
  tips.push(GENERIC_TIPS[dayOfMonth % GENERIC_TIPS.length]);
  return tips.slice(0, 2);
}

// --- Harcama hızı ve kıyas -------------------------------------------------

// Dönemin kaçıncı gününde olduğumuz (geçmiş dönemde ayın tamamı, gelecekte 0).
function elapsedDaysOf(periodKey, todayStr) {
  const { startISO, endISO } = periodRange(periodKey);
  const totalDays = Number(endISO.slice(8, 10));
  if (todayStr < startISO) return { elapsedDays: 0, totalDays };
  if (todayStr > endISO) return { elapsedDays: totalDays, totalDays };
  return { elapsedDays: Number(todayStr.slice(8, 10)), totalDays };
}

/**
 * "Bu hızla ay sonunda ne kadar harcarım, bütçe ne zaman biter?"
 *
 * Önemli ayrım: sürekli giderler (kira, kredi…) ayın tamamı için zaten bilinir,
 * bunları güne bölüp ileri sarmak tahmini şişirir. Bu yüzden yalnızca GERÇEK
 * (değişken) harcamalar ileri sarılır, sabitler olduğu gibi eklenir.
 */
export function spendingPace(summary, todayStr = todayISO()) {
  if (!summary?.isCurrent) return null;
  const { elapsedDays, totalDays } = elapsedDaysOf(summary.periodKey, todayStr);
  if (elapsedDays <= 0 || elapsedDays >= totalDays) return null;

  let fixed = 0;
  let variableToDate = 0;
  for (const e of summary.expenses) {
    const amount = Number(e.amount) || 0;
    if (e.virtual) fixed += amount;
    else if (e.date <= todayStr) variableToDate += amount;
  }

  const dailyVariable = variableToDate / elapsedDays;
  const projected = Math.round(fixed + dailyVariable * totalDays);

  const result = {
    projected,
    dailyVariable,
    reliable: elapsedDays >= 5,
    runsOutOn: null,
    daysShort: 0,
  };

  // Bütçe bilinmiyorsa (maaş girilmemiş) tükenme günü hesaplanamaz.
  if (!summary.hasSalary || summary.expectedTotal <= 0) return result;

  if (projected > summary.expectedTotal && dailyVariable > 0) {
    // Sabitler ay boyunca zaten düşülecek; değişken harcama kalan bütçeyi
    // hangi günde bitirir?
    const budgetForVariable = summary.expectedTotal - fixed;
    const dayCount = budgetForVariable <= 0 ? 0 : budgetForVariable / dailyVariable;
    const day = Math.min(totalDays, Math.max(1, Math.ceil(dayCount)));
    const { startISO } = periodRange(summary.periodKey);
    result.runsOutOn = `${startISO.slice(0, 8)}${String(day).padStart(2, '0')}`;
    result.daysShort = Math.max(0, totalDays - day);
  }
  return result;
}

// Bir dönemde ayın N'ine kadar (o gün dahil) yapılan harcama.
export function spentThrough(state, periodKey, dayOfMonth) {
  const cutoff = `${periodKey}-${String(Math.min(31, Math.max(1, dayOfMonth))).padStart(2, '0')}`;
  return budgetSummary(state, periodKey, cutoff).expenses
    .filter((e) => e.date <= cutoff)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/**
 * Geçen dönemle kıyas. Ayın aynı gününe kadarki harcamalar karşılaştırılır —
 * yoksa ayın başında her zaman "geçen aydan az harcadım" der ve anlamsız olur.
 * Geçen dönemde hiç harcama yoksa kıyas gösterilmez.
 */
export function comparePreviousPeriod(state, periodKey, todayStr = todayISO()) {
  const { elapsedDays, totalDays } = elapsedDaysOf(periodKey, todayStr);
  const day = elapsedDays > 0 ? elapsedDays : totalDays;
  const prevKey = shiftPeriod(periodKey, -1);

  const prevSpent = spentThrough(state, prevKey, day);
  if (prevSpent <= 0) return null;

  const thisSpent = spentThrough(state, periodKey, day);
  return {
    diff: thisSpent - prevSpent,
    thisSpent,
    prevSpent,
    throughDay: day,
    // Ay bitmişse "aynı güne kadar" demek yanıltıcı olur, tüm ay kıyaslanmıştır.
    partial: elapsedDays > 0 && elapsedDays < totalDays,
  };
}
