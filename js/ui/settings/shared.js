// Ayarlar alt sayfalarının paylaştığı küçük yardımcılar.

import { parseLocaleNumber } from '../../format.js';

export function commitNumberOnChange(input, onCommit) {
  input.addEventListener('change', () => {
    const value = parseLocaleNumber(input.value);
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
