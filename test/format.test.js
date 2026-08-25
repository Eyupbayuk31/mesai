import test from 'node:test';
import assert from 'node:assert/strict';
import { locative } from '../js/format.js';

test('locative - ay adlarına doğru bulunma eki gelir', () => {
  assert.equal(locative('Ağustos'), "Ağustos'ta");
  assert.equal(locative('Eylül'), "Eylül'de");
  assert.equal(locative('Ekim'), "Ekim'de");
  assert.equal(locative('Kasım'), "Kasım'da");
  assert.equal(locative('Aralık'), "Aralık'ta");
  assert.equal(locative('Mart'), "Mart'ta");
  assert.equal(locative(''), '', 'boş metin olduğu gibi döner');
});
