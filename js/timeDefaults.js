// Mesai formunun saat varsayılanları. Saf: tarihi/saati dışarıdan alır,
// DOM'a dokunmaz — bu yüzden testlenebilir.

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Şu anki saati "SS:DD" olarak verir. */
export function nowHM(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Çıkış saatinin varsayılanı.
 *
 * Yeni bir kayıt bugüne giriliyorsa ve şu an programdaki paydos saatini
 * geçmişse, çıkış olarak ŞU ANKİ saat gelir — kullanıcı çıkarken uygulamayı
 * açtığında saati elle aramak zorunda kalmasın.
 *
 * Şu an paydostan önceyse varsayılan bozulmaz: yoksa çıkış girişten önce
 * görünür ve mesai eksi/sıfır çıkar.
 *
 * @param {{ isNew:boolean, isToday:boolean, defaultEnd:string, now?:Date }} opts
 */
export function defaultEndTime({ isNew, isToday, defaultEnd, now = new Date() }) {
  if (!isNew || !isToday) return defaultEnd;
  const current = nowHM(now);
  // "SS:DD" biçimi sabit uzunlukta olduğu için dizge karşılaştırması
  // saat karşılaştırmasıyla aynı sonucu verir.
  return current > defaultEnd ? current : defaultEnd;
}
