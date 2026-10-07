import test from 'node:test';
import assert from 'node:assert/strict';
import { locative, withSuffix, numberSuffix, numberAblative } from '../js/format.js';

test('locative - ay adlarına doğru bulunma eki gelir', () => {
  assert.equal(locative('Ağustos'), "Ağustos'ta");
  assert.equal(locative('Eylül'), "Eylül'de");
  assert.equal(locative('Ekim'), "Ekim'de");
  assert.equal(locative('Kasım'), "Kasım'da");
  assert.equal(locative('Aralık'), "Aralık'ta");
  assert.equal(locative('Mart'), "Mart'ta");
  assert.equal(locative(''), '', 'boş metin olduğu gibi döner');
});

test('withSuffix - sayıya iyelik eki son okunan kelimeye göre gelir', () => {
  // Ünsüzle biten okunuşlar
  assert.equal(withSuffix(9), "9'u", 'dokuzu');
  assert.equal(withSuffix(10), "10'u", 'onu');
  assert.equal(withSuffix(49), "49'u", 'kırk dokuzu');
  assert.equal(withSuffix(40), "40'ı", 'kırkı');
  assert.equal(withSuffix(3), "3'ü", 'üçü');
  assert.equal(withSuffix(4), "4'ü", 'dördü');
  assert.equal(withSuffix(5), "5'i", 'beşi');
  assert.equal(withSuffix(8), "8'i", 'sekizi');
  assert.equal(withSuffix(100), "100'ü", 'yüzü');
  assert.equal(withSuffix(1000), "1000'i", 'bini');
  // Ünlüyle biten okunuşlara kaynaştırma s'si
  assert.equal(withSuffix(2), "2'si", 'ikisi');
  assert.equal(withSuffix(6), "6'sı", 'altısı');
  assert.equal(withSuffix(7), "7'si", 'yedisi');
  assert.equal(withSuffix(20), "20'si", 'yirmisi');
  assert.equal(withSuffix(50), "50'si", 'ellisi');
  // Bileşik sayıda son kelime belirler
  assert.equal(withSuffix(101), "101'i", 'yüz biri');
  assert.equal(withSuffix(120), "120'si", 'yüz yirmisi');
  // Ondalıkta son kelime ondalık kısımdan gelir
  assert.equal(withSuffix('1,7'), "1,7'si", 'bir virgül yedisi');
  assert.equal(withSuffix('2,5'), "2,5'i", 'iki virgül beşi');
  // Yüzde işareti önde olsa da ek sayıya göre
  assert.equal(withSuffix('%49'), "%49'u");
  assert.equal(numberSuffix(0), 'ı', 'sıfırı');
});

test('numberAblative - yıllara ayrılma hâli', () => {
  assert.equal(numberAblative(2026), "2026'dan", 'altıdan');
  assert.equal(numberAblative(2027), "2027'den", 'yediden');
  assert.equal(numberAblative(2025), "2025'ten", 'beşten');
  assert.equal(numberAblative(2024), "2024'ten", 'dörtten');
  assert.equal(numberAblative(2030), "2030'dan", 'otuzdan');
});

// --- parseAmount: yatırım formundaki fiyat/miktar girişi ---------------
// Eskiden "7.100" → 7,1 okunuyordu (fiyat sessizce 1000 kat küçülüyordu).

import { parseAmount } from '../js/format.js';

test('parseAmount - Türkçe yazış: nokta binlik, virgül ondalık', () => {
  assert.equal(parseAmount('7100'), 7100);
  assert.equal(parseAmount('7.100'), 7100, 'binlik noktası');
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('1.500,50'), 1500.5);
  assert.equal(parseAmount('7 100,5'), 7100.5);
  assert.equal(parseAmount('41,5'), 41.5);
  assert.equal(parseAmount('1.250.000'), 1250000);
});

test('parseAmount - noktalı ondalık ve küsurat bozulmaz', () => {
  assert.equal(parseAmount('7.5'), 7.5);
  assert.equal(parseAmount('41.50'), 41.5);
  assert.equal(parseAmount('0.015'), 0.015, 'başı 0 ise ondalık');
  assert.equal(parseAmount('0,015'), 0.015);
  assert.equal(parseAmount('0.5'), 0.5);
});

test('parseAmount - İngilizce yazış ve birim/₺ ekleri', () => {
  assert.equal(parseAmount('1,500.50'), 1500.5);
  assert.equal(parseAmount('1,500,000'), 1500000);
  assert.equal(parseAmount('7100d'), 7100);
  assert.equal(parseAmount('7.100 TL'), 7100);
  assert.equal(parseAmount('₺ 7.100,25'), 7100.25);
});

test('parseAmount - boş veya anlamsız giriş 0', () => {
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount(null), 0);
  assert.equal(parseAmount(undefined), 0);
  assert.equal(parseAmount('abc'), 0);
  assert.equal(parseAmount('-'), 0);
});
