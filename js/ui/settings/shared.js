// Ayarlar alt sayfalarının paylaştığı küçük yardımcılar.

import { parseLocaleNumber } from '../../format.js';

/**
 * Sayı alanını odak çıkışında kaydeder.
 *
 * Boş bırakmak "sıfırla" demektir — ama her alan için değil: çarpan alanını
 * boşaltmak 0 çarpan anlamına gelmemeli (mesai bedava olurdu). Bu yüzden
 * boşaltılabilen alanlar emptyValue vererek belirtilir; vermeyende eski değer
 * korunur.
 *
 * Eskiden boş alan sessizce yok sayılıyordu: maaşı silip çıkınca kaydedilmiyor,
 * ekran eski değeri geri yazıyordu.
 */
export function commitNumberOnChange(input, onCommit, { emptyValue = null } = {}) {
  input.addEventListener('change', () => {
    const raw = input.value.trim();
    if (raw === '') {
      if (emptyValue !== null) onCommit(emptyValue);
      return;
    }
    const value = parseLocaleNumber(raw);
    if (Number.isFinite(value) && value >= 0) onCommit(value);
  });
}

export function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const WEEKDAY_LABELS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
// JS getDay(): 0=Pazar..6=Cmt. Ekranda Pazartesi'den başlatmak için eşleme.
export const WEEKDAY_JS_VALUES = [1, 2, 3, 4, 5, 6, 0];
