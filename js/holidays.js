// Türkiye resmi tatilleri. Sabit tatiller her yıl aynı; dini bayramlar
// (Ramazan/Kurban) hicri takvime bağlı olduğundan yıl yıl elle listelenir.
// Tablo dışındaki yıllarda dini bayram günleri döndürülmez (uydurma yok).

function fixedHolidaysForYear(year) {
  return [
    { date: `${year}-01-01`, name: 'Yılbaşı' },
    { date: `${year}-04-23`, name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
    { date: `${year}-05-01`, name: 'Emek ve Dayanışma Günü' },
    { date: `${year}-05-19`, name: 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı' },
    { date: `${year}-07-15`, name: 'Demokrasi ve Millî Birlik Günü' },
    { date: `${year}-08-30`, name: 'Zafer Bayramı' },
    { date: `${year}-10-29`, name: 'Cumhuriyet Bayramı' },
  ];
}

// Dini bayramlar 2026-2030 (Diyanet takvimine göre tahmini; arife günleri
// yarım gün resmi tatildir, tam gün olarak dahil edildi).
const RELIGIOUS_HOLIDAYS = {
  2026: [
    { date: '2026-03-19', name: 'Ramazan Bayramı Arifesi' },
    { date: '2026-03-20', name: 'Ramazan Bayramı (1. gün)' },
    { date: '2026-03-21', name: 'Ramazan Bayramı (2. gün)' },
    { date: '2026-03-22', name: 'Ramazan Bayramı (3. gün)' },
    { date: '2026-05-26', name: 'Kurban Bayramı Arifesi' },
    { date: '2026-05-27', name: 'Kurban Bayramı (1. gün)' },
    { date: '2026-05-28', name: 'Kurban Bayramı (2. gün)' },
    { date: '2026-05-29', name: 'Kurban Bayramı (3. gün)' },
    { date: '2026-05-30', name: 'Kurban Bayramı (4. gün)' },
  ],
  2027: [
    { date: '2027-03-08', name: 'Ramazan Bayramı Arifesi' },
    { date: '2027-03-09', name: 'Ramazan Bayramı (1. gün)' },
    { date: '2027-03-10', name: 'Ramazan Bayramı (2. gün)' },
    { date: '2027-03-11', name: 'Ramazan Bayramı (3. gün)' },
    { date: '2027-05-15', name: 'Kurban Bayramı Arifesi' },
    { date: '2027-05-16', name: 'Kurban Bayramı (1. gün)' },
    { date: '2027-05-17', name: 'Kurban Bayramı (2. gün)' },
    { date: '2027-05-18', name: 'Kurban Bayramı (3. gün)' },
    { date: '2027-05-19', name: 'Kurban Bayramı (4. gün)' },
  ],
  2028: [
    { date: '2028-02-25', name: 'Ramazan Bayramı Arifesi' },
    { date: '2028-02-26', name: 'Ramazan Bayramı (1. gün)' },
    { date: '2028-02-27', name: 'Ramazan Bayramı (2. gün)' },
    { date: '2028-02-28', name: 'Ramazan Bayramı (3. gün)' },
    { date: '2028-05-03', name: 'Kurban Bayramı Arifesi' },
    { date: '2028-05-04', name: 'Kurban Bayramı (1. gün)' },
    { date: '2028-05-05', name: 'Kurban Bayramı (2. gün)' },
    { date: '2028-05-06', name: 'Kurban Bayramı (3. gün)' },
    { date: '2028-05-07', name: 'Kurban Bayramı (4. gün)' },
  ],
  2029: [
    { date: '2029-02-13', name: 'Ramazan Bayramı Arifesi' },
    { date: '2029-02-14', name: 'Ramazan Bayramı (1. gün)' },
    { date: '2029-02-15', name: 'Ramazan Bayramı (2. gün)' },
    { date: '2029-02-16', name: 'Ramazan Bayramı (3. gün)' },
    { date: '2029-04-23', name: 'Kurban Bayramı Arifesi' },
    { date: '2029-04-24', name: 'Kurban Bayramı (1. gün)' },
    { date: '2029-04-25', name: 'Kurban Bayramı (2. gün)' },
    { date: '2029-04-26', name: 'Kurban Bayramı (3. gün)' },
    { date: '2029-04-27', name: 'Kurban Bayramı (4. gün)' },
  ],
  2030: [
    { date: '2030-02-02', name: 'Ramazan Bayramı Arifesi' },
    { date: '2030-02-03', name: 'Ramazan Bayramı (1. gün)' },
    { date: '2030-02-04', name: 'Ramazan Bayramı (2. gün)' },
    { date: '2030-02-05', name: 'Ramazan Bayramı (3. gün)' },
    { date: '2030-04-12', name: 'Kurban Bayramı Arifesi' },
    { date: '2030-04-13', name: 'Kurban Bayramı (1. gün)' },
    { date: '2030-04-14', name: 'Kurban Bayramı (2. gün)' },
    { date: '2030-04-15', name: 'Kurban Bayramı (3. gün)' },
    { date: '2030-04-16', name: 'Kurban Bayramı (4. gün)' },
  ],
};

const holidayCache = new Map();

function holidaysForYear(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const fixed = fixedHolidaysForYear(year);
  const religious = RELIGIOUS_HOLIDAYS[year] || [];
  const map = new Map();
  for (const h of [...fixed, ...religious]) map.set(h.date, h.name);
  holidayCache.set(year, map);
  return map;
}

export function holidayName(isoDateStr) {
  const year = Number(isoDateStr.slice(0, 4));
  return holidaysForYear(year).get(isoDateStr) || null;
}

export function isHoliday(isoDateStr) {
  return holidayName(isoDateStr) !== null;
}

export function isWeekendDay(date, weekendDays) {
  return (weekendDays || [0]).includes(date.getDay());
}

// Tarihten mesai türü öner. Sadece öneri: kullanıcı ekranda değiştirebilir.
export function suggestType(date, isoDateStr, settings) {
  const holiday = holidayName(isoDateStr);
  if (holiday) return { type: 'holiday', reason: holiday };
  if (isWeekendDay(date, settings.weekendDays)) {
    return { type: 'weekend', reason: 'Hafta tatili' };
  }
  return { type: 'normal', reason: null };
}
