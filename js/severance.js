// Kıdem ve ihbar tazminatı — net maaştan brüte, brütten tazminata.
//
// Kullanıcının elinde tek bir sayı var: cebine geçen net maaş. Tazminatın
// tamamı ise BRÜT ücret üzerinden hesaplanıyor. Aradaki köprü bordro
// matematiği: SGK primi, işsizlik sigortası, gelir vergisi, damga vergisi ve
// asgari ücret istisnası. Bu dosya o köprüyü tek yerde kuruyor.
//
// ÖNEMLİ — buradaki sayılar YILLIK DEĞİŞİR:
//   · asgari ücret ve SGK tavanı her yıl,
//   · gelir vergisi dilimleri her yıl (yeniden değerleme oranıyla),
//   · kıdem tazminatı tavanı YILDA İKİ KEZ (Ocak ve Temmuz).
// Bu yüzden parametreler kodda sabit değil, `settings.taxParams` ile
// kullanıcının düzeltebileceği bir tablo. Varsayılanlar 2026 içindir;
// kaynakları DEFAULT_TAX_PARAMS'ın üstünde yazılı. Yanlış/eski bir
// parametre sessizce yanlış tazminat üretmesin diye sayfa hangi yılın
// parametreleriyle hesapladığını ekranda söyler.

/**
 * 2026 bordro parametreleri.
 *
 * Kaynaklar (Eylül 2026 itibarıyla):
 *   · Brüt asgari ücret 33.030,00 ₺ / net 28.075,50 ₺, SGK tavanı 297.270,00 ₺
 *     (9 × brüt asgari ücret) — vergimerkezi.com.tr 2026 SGK parametreleri
 *   · Gelir vergisi tarifesi (ücret): 190.000 / 400.000 / 1.500.000 / 5.300.000
 *     sınırlarıyla %15-20-27-35-40 — 332 seri no.lu GV Genel Tebliği
 *   · Damga vergisi binde 7,59
 *   · Kıdem tazminatı tavanı 73.729,84 ₺ (01.07.2026 – 31.12.2026);
 *     01.01–30.06.2026 dönemi 64.948,77 ₺
 */
export const DEFAULT_TAX_PARAMS = {
  year: 2026,
  minWageGross: 33030,
  sgkEmployeeRate: 0.14,
  unemploymentRate: 0.01,
  sgkCeiling: 297270,
  stampRate: 0.00759,
  severanceCap: 73729.84,
  brackets: [
    { upTo: 190000, rate: 0.15 },
    { upTo: 400000, rate: 0.20 },
    { upTo: 1500000, rate: 0.27 },
    { upTo: 5300000, rate: 0.35 },
    { upTo: Infinity, rate: 0.40 },
  ],
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Kullanıcının düzelttiği parametreleri varsayılanların üstüne bindirir.
 * Eksik alan varsayılandan gelir: kullanıcı yalnız tavanı güncellemek
 * isteyince geri kalanı elle yazmak zorunda kalmasın.
 */
export function taxParamsFor(settings) {
  const custom = settings?.taxParams;
  if (!custom || typeof custom !== 'object') return DEFAULT_TAX_PARAMS;
  const brackets = Array.isArray(custom.brackets) && custom.brackets.length
    ? custom.brackets.map((b) => ({ upTo: b.upTo === null ? Infinity : num(b.upTo), rate: num(b.rate) }))
    : DEFAULT_TAX_PARAMS.brackets;
  return { ...DEFAULT_TAX_PARAMS, ...custom, brackets };
}

/** Kümülatif matrahın 0'dan `base`'e kadar olan kısmının toplam vergisi. */
export function bracketTax(base, brackets = DEFAULT_TAX_PARAMS.brackets) {
  let remaining = Math.max(0, num(base));
  let previous = 0;
  let tax = 0;
  for (const slice of brackets) {
    if (remaining <= 0) break;
    const width = (slice.upTo === Infinity ? Infinity : num(slice.upTo)) - previous;
    const taxed = Math.min(remaining, width);
    tax += taxed * num(slice.rate);
    remaining -= taxed;
    previous = slice.upTo === Infinity ? previous : num(slice.upTo);
  }
  return tax;
}

/**
 * Bir dilim matrahın vergisi. Gelir vergisi kümülatiftir: aynı 10.000 ₺,
 * yılın başında %15, sonunda %27 vergilenir. `cumulativeBase` yıl başından
 * bugüne kadar birikmiş matrah.
 */
export function taxOnSlice(amount, { cumulativeBase = 0, brackets = DEFAULT_TAX_PARAMS.brackets } = {}) {
  const slice = Math.max(0, num(amount));
  return bracketTax(cumulativeBase + slice, brackets) - bracketTax(cumulativeBase, brackets);
}

/** İçinde bulunulan diliminin oranı — "şu an %20 dilimindesin" demek için. */
export function marginalRate(cumulativeBase, brackets = DEFAULT_TAX_PARAMS.brackets) {
  const base = Math.max(0, num(cumulativeBase));
  for (const slice of brackets) {
    if (base < (slice.upTo === Infinity ? Infinity : num(slice.upTo))) return num(slice.rate);
  }
  return num(brackets[brackets.length - 1]?.rate);
}

/**
 * Brüt aylık ücretten net maaş ve tüm kesintiler.
 *
 * Asgari ücret istisnası (GVK md. 23/18): herkesin ücretinin asgari ücrete
 * denk gelen kısmı gelir ve damga vergisinden muaf. Bu yüzden asgari ücretli
 * sıfır vergi öder; üstündekiler de asgari ücretin vergisi kadar indirim alır.
 *
 * `cumulativeBase` verilmezse hesap OCAK ESASLI olur (kümülatif matrah 0).
 * Tazminat hesabında standart yaklaşım budur; yıl içinde üst dilime geçmiş
 * biri için net→brüt çevrimi bir miktar iyimser çıkar.
 */
export function grossToNet(gross, params = DEFAULT_TAX_PARAMS, { cumulativeBase = 0, minWageCumulative = 0 } = {}) {
  const p = params || DEFAULT_TAX_PARAMS;
  const g = Math.max(0, num(gross));
  const sgkRate = num(p.sgkEmployeeRate) + num(p.unemploymentRate);

  // SGK matrahı tabanla tavan arasına sıkışır: tavanın üstü prime girmez.
  const sgkBase = Math.min(Math.max(g, num(p.minWageGross)), num(p.sgkCeiling));
  const sgk = sgkBase * num(p.sgkEmployeeRate);
  const unemployment = sgkBase * num(p.unemploymentRate);

  const taxBase = Math.max(0, g - sgk - unemployment);
  const taxFull = taxOnSlice(taxBase, { cumulativeBase, brackets: p.brackets });

  // İstisna asgari ücretin KENDİ matrahı kadardır; daha azını kazanan
  // yalnız kazandığı kadarının istisnasını alır.
  const minWageTaxBase = num(p.minWageGross) * (1 - sgkRate);
  const exemptBase = Math.min(taxBase, minWageTaxBase);
  const exemption = taxOnSlice(exemptBase, { cumulativeBase: minWageCumulative, brackets: p.brackets });
  const incomeTax = Math.max(0, taxFull - exemption);

  // Damga vergisinde de asgari ücret kadarı istisna.
  const stamp = Math.max(0, g - num(p.minWageGross)) * num(p.stampRate);

  const net = g - sgk - unemployment - incomeTax - stamp;
  return {
    gross: round2(g),
    sgk: round2(sgk),
    unemployment: round2(unemployment),
    taxBase: round2(taxBase),
    incomeTax: round2(incomeTax),
    incomeTaxBeforeExemption: round2(taxFull),
    exemption: round2(exemption),
    stamp: round2(stamp),
    deductions: round2(sgk + unemployment + incomeTax + stamp),
    net: round2(net),
  };
}

/**
 * Net maaştan brüte. Tersi kapalı formülle yazılabilir ama dilim sınırları,
 * SGK tavanı ve iki ayrı istisna yüzünden beş ayrı kırılma noktası var;
 * her birini elle kovalamak sessiz hata üretir. grossToNet brüte göre
 * monoton arttığı için ikili arama hem kısa hem her parametre değişiminde
 * kendiliğinden doğru kalıyor.
 */
export function netToGross(net, params = DEFAULT_TAX_PARAMS, opts = {}) {
  const target = Math.max(0, num(net));
  if (target === 0) return 0;
  let low = target;
  let high = target * 3 + num((params || DEFAULT_TAX_PARAMS).minWageGross) + 1000;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (grossToNet(mid, params, opts).net < target) low = mid;
    else high = mid;
  }
  return round2(high);
}

// --- Kıdem süresi ---------------------------------------------------------

function parseDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ayı klonlarken gün taşmasını kırpar: 31 Ocak + 1 ay = 28 Şubat.
 * leave.js'teki yıldönümü kuralının aynısı — iki yerde iki farklı kıdem
 * tanımı olmasın.
 */
function addMonthsClamped(date, n) {
  const month = date.getMonth() + n;
  const lastDay = new Date(date.getFullYear(), month + 1, 0).getDate();
  return new Date(date.getFullYear(), month, Math.min(date.getDate(), lastDay));
}

/**
 * İşe giriş ile çıkış arasındaki kıdem: tam yıl, artan ay ve artan gün.
 * Bordro pratiğinde hesap bu üç parçadan kurulur (yıl × 30 gün, kalan ay ve
 * gün orantılı), o yüzden parçalar ayrı ayrı da döndürülüyor.
 *
 * Ay sayısı "bir önceki aydan gün ödünç al" ile değil, aya ay ekleyip
 * taşmayı kırparak bulunuyor: 31 Ocak → 1 Mart'ta ödünç alma yöntemi
 * EKSİ gün üretiyordu (Şubat 28 gün, borç 30 gün).
 */
export function seniorityBetween(hireDate, endDate) {
  const start = parseDate(hireDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return null;

  let totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (addMonthsClamped(start, totalMonths) > end) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);

  const anchor = addMonthsClamped(start, totalMonths);
  const days = Math.max(0, Math.round((end - anchor) / 86400000));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const totalDays = Math.round((end - start) / 86400000);
  return { years, months, days, totalDays, totalYears: years + months / 12 + days / 365 };
}

/** Kıdem süresini "3 yıl 4 ay 12 gün" biçiminde yazar. */
export function seniorityText(s) {
  if (!s) return '';
  const parts = [];
  if (s.years) parts.push(`${s.years} yıl`);
  if (s.months) parts.push(`${s.months} ay`);
  if (s.days) parts.push(`${s.days} gün`);
  return parts.length ? parts.join(' ') : '0 gün';
}

// --- Kıdem tazminatı ------------------------------------------------------

/**
 * Kıdem tazminatı: her tam yıl için 30 günlük GİYDİRİLMİŞ brüt ücret, artan
 * süre için orantılı. Giydirilmiş ücret çıplak maaşa düzenli yan ödemeleri
 * (yemek, yol, ikramiye) ekler.
 *
 * İki kural hesabın belkemiği:
 *   · TAVAN — yıllık ücretli tavanı aşan kısım dikkate alınmaz. Tavan yılda
 *     iki kez değişir; parametre olarak geliyor.
 *   · VERGİ — kıdem tazminatı GELİR VERGİSİNDEN İSTİSNADIR. Yalnız damga
 *     vergisi (binde 7,59) kesilir. En sık yapılan hata buna gelir vergisi
 *     uygulamaktır; burada bilerek uygulanmıyor.
 */
export function kidemTazminati({ seniority, monthlyGross, params = DEFAULT_TAX_PARAMS, eligible = true }) {
  const p = params || DEFAULT_TAX_PARAMS;
  const s = seniority;
  const base = Math.max(0, num(monthlyGross));
  const cap = num(p.severanceCap);
  const capped = cap > 0 ? Math.min(base, cap) : base;
  const cappedBy = capped < base;

  // Hak 1 yılı doldurmadan doğmaz (İş K. md. 14 / 1475 sayılı Kanun md. 14).
  const hasYear = !!s && s.years >= 1;
  if (!eligible || !hasYear) {
    return {
      eligible: false,
      reason: !eligible ? 'ineligible' : 'under-one-year',
      base: round2(base), capped: round2(capped), cappedBy,
      years: s?.years ?? 0, gross: 0, stamp: 0, net: 0,
    };
  }

  const gross = capped * s.years + capped * (s.months / 12) + capped * (s.days / 365);
  const stamp = gross * num(p.stampRate);
  return {
    eligible: true,
    reason: null,
    base: round2(base),
    capped: round2(capped),
    cappedBy,
    years: s.years,
    gross: round2(gross),
    stamp: round2(stamp),
    incomeTax: 0,
    net: round2(gross - stamp),
  };
}

// --- İhbar tazminatı ------------------------------------------------------

/** İş K. md. 17 bildirim süreleri — kıdeme göre hafta. */
export function noticeWeeks(seniority) {
  if (!seniority) return 0;
  const y = seniority.totalYears;
  if (y < 0.5) return 2;
  if (y < 1.5) return 4;
  if (y < 3) return 6;
  return 8;
}

/**
 * İhbar tazminatı: bildirim süresi kadar giydirilmiş brüt ücret.
 * Kıdemin aksine TAVANI YOKTUR ve GELİR VERGİSİNE TABİDİR; damga da kesilir.
 * SGK primi kesilmez (5510 md. 80).
 */
export function ihbarTazminati({ seniority, monthlyGross, params = DEFAULT_TAX_PARAMS, cumulativeBase = 0, eligible = true }) {
  const p = params || DEFAULT_TAX_PARAMS;
  const weeks = noticeWeeks(seniority);
  const dailyGross = Math.max(0, num(monthlyGross)) / 30;
  if (!eligible || weeks === 0) {
    return { eligible: false, weeks, days: 0, dailyGross: round2(dailyGross), gross: 0, incomeTax: 0, stamp: 0, net: 0 };
  }
  const days = weeks * 7;
  const gross = dailyGross * days;
  const incomeTax = taxOnSlice(gross, { cumulativeBase, brackets: p.brackets });
  const stamp = gross * num(p.stampRate);
  return {
    eligible: true,
    weeks,
    days,
    dailyGross: round2(dailyGross),
    gross: round2(gross),
    incomeTax: round2(incomeTax),
    stamp: round2(stamp),
    net: round2(gross - incomeTax - stamp),
  };
}

// --- Kullanılmayan yıllık izin -------------------------------------------

/**
 * Kullanılmayan yıllık izin ücreti: gün × ÇIPLAK brüt günlük ücret.
 * Giydirilmiş ücret kullanılmaz (Yargıtay yerleşik içtihadı); gelir ve damga
 * vergisi kesilir, SGK primi kesilmez.
 */
export function izinUcreti({ days, monthlyGross, params = DEFAULT_TAX_PARAMS, cumulativeBase = 0 }) {
  const p = params || DEFAULT_TAX_PARAMS;
  const d = Math.max(0, num(days));
  const dailyGross = Math.max(0, num(monthlyGross)) / 30;
  const gross = dailyGross * d;
  if (d === 0 || gross === 0) {
    return { days: d, dailyGross: round2(dailyGross), gross: 0, incomeTax: 0, stamp: 0, net: 0 };
  }
  const incomeTax = taxOnSlice(gross, { cumulativeBase, brackets: p.brackets });
  const stamp = gross * num(p.stampRate);
  return {
    days: d,
    dailyGross: round2(dailyGross),
    gross: round2(gross),
    incomeTax: round2(incomeTax),
    stamp: round2(stamp),
    net: round2(gross - incomeTax - stamp),
  };
}

// --- Bütünü ---------------------------------------------------------------

/**
 * Tek çağrıda tüm tablo. Girdi net maaş ya da brüt maaş olabilir; hangisi
 * verilmişse diğeri türetilir.
 *
 * @param {object} input
 * @param {number} input.netSalary      cebe geçen aylık net (brutSalary yoksa)
 * @param {number} input.grossSalary    biliniyorsa aylık çıplak brüt
 * @param {number} input.fringeMonthly  aylık düzenli yan ödeme (yemek+yol)
 * @param {string} input.hireDate       'YYYY-MM-DD'
 * @param {string} input.endDate        'YYYY-MM-DD'
 * @param {boolean} input.severanceEligible  kıdeme hak kazandıran çıkış mı
 * @param {boolean} input.noticeEligible     ihbar hak ediliyor mu
 * @param {number} input.leaveDays      kullanılmayan yıllık izin günü
 */
export function severanceReport(input = {}, params = DEFAULT_TAX_PARAMS) {
  const p = params || DEFAULT_TAX_PARAMS;
  const cumulativeBase = num(input.cumulativeBase);

  const grossSalary = num(input.grossSalary) > 0
    ? num(input.grossSalary)
    : netToGross(num(input.netSalary), p, { cumulativeBase });
  const payroll = grossToNet(grossSalary, p, { cumulativeBase });

  // Giydirilmiş ücret: kıdem ve ihbarın matrahı. Yan ödemeler brüt ücrete
  // eklenir, tekrar brütleştirilmez — zaten işverene maliyeti bu.
  const fringe = Math.max(0, num(input.fringeMonthly));
  const dressedGross = grossSalary + fringe;

  const seniority = seniorityBetween(input.hireDate, input.endDate);
  const kidem = kidemTazminati({
    seniority, monthlyGross: dressedGross, params: p,
    eligible: input.severanceEligible !== false,
  });
  const ihbar = ihbarTazminati({
    seniority, monthlyGross: dressedGross, params: p, cumulativeBase,
    eligible: input.noticeEligible !== false,
  });
  const izin = izinUcreti({
    days: input.leaveDays, monthlyGross: grossSalary, params: p, cumulativeBase,
  });

  const gross = kidem.gross + ihbar.gross + izin.gross;
  const net = kidem.net + ihbar.net + izin.net;
  return {
    params: p,
    seniority,
    grossSalary: round2(grossSalary),
    netSalary: payroll.net,
    payroll,
    dressedGross: round2(dressedGross),
    fringe: round2(fringe),
    kidem,
    ihbar,
    izin,
    totalGross: round2(gross),
    totalTax: round2(kidem.stamp + ihbar.incomeTax + ihbar.stamp + izin.incomeTax + izin.stamp),
    totalNet: round2(net),
  };
}
