/**
 * Kilit ekranının alt yazısı.
 *
 * Burada eskiden "PIN yalnız bu cihazda geçerli, unutursan..." diye bir
 * açıklama vardı. Kullanıcının isteği üzerine kaldırıldı: o bilgi zaten
 * Ayarlar → Uygulama kilidi'nde uzun uzun yazıyor, kilit ekranında her gün
 * aynı uyarıyı okumanın kimseye faydası yok. Yerine ne olduğu belli bir
 * şaka duruyor — burada saklananın ne olduğunu zaten herkes biliyor.
 */
export const SACMALIKLAR = [
  'Fenerbahçe’nin neden şampiyon olamadığı burada yazıyor.',
  'Gizli devlet belgeleri · Klasör 3 · Raf B',
  'Fuat’ın çıplak fotoğrafları burada gizli.',
  'Nükleer fırlatma kodları (ve çay ocağı hesabı).',
  'Bermuda Şeytan Üçgeni’nin koordinatları.',
];

/** Rastgele bir satır. Dışa açık ki test edilebilsin. */
export function sacmalikSec(random = Math.random) {
  return SACMALIKLAR[Math.floor(random() * SACMALIKLAR.length)];
}
