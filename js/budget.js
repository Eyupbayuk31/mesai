// Bütçe kontrol: günlük harcamalar + tahmini ödemeden kalan hesabı.
// Tüm fonksiyonlar saf; kalem CRUD işlemleri Store'da.

import { periodSummary } from './payroll.js';
import { periodRange } from './period.js';
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

// Dönemin bütçe özeti: harcamalar, kategori kırılımı, tahmini ödemeden kalan
// ve (dönem içindeysek) günlük harcayabileceğin tutar.
export function budgetSummary(state, periodKey, todayStr = todayISO()) {
  const expenses = (state.expenses || []).filter((e) => e.date.slice(0, 7) === periodKey);
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
    expenseCount: expenses.length,
    expenses,
    spent,
    byCategory: [...byCategory.entries()]
      .map(([key, amount]) => ({ ...categoryOf(key, state.settings), amount }))
      .sort((a, b) => b.amount - a.amount),
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
