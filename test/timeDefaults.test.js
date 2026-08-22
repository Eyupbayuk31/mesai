import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowHM, defaultEndTime } from '../js/timeDefaults.js';

const at = (h, m) => new Date(2026, 7, 21, h, m);

test('nowHM - iki haneli, 24 saatlik', () => {
  assert.equal(nowHM(at(9, 5)), '09:05');
  assert.equal(nowHM(at(19, 23)), '19:23');
  assert.equal(nowHM(at(0, 0)), '00:00');
  assert.equal(nowHM(at(23, 59)), '23:59');
});

test('defaultEndTime - bugüne yeni kayıtta paydostan sonraysa şu anki saat gelir', () => {
  const res = defaultEndTime({ isNew: true, isToday: true, defaultEnd: '18:00', now: at(19, 23) });
  assert.equal(res, '19:23');
});

test('defaultEndTime - paydostan ÖNCE varsayılan bozulmaz (eksi mesai çıkmasın)', () => {
  const res = defaultEndTime({ isNew: true, isToday: true, defaultEnd: '18:00', now: at(14, 0) });
  assert.equal(res, '18:00');
});

test('defaultEndTime - düzenlemede kayıtlı saate dokunulmaz', () => {
  const res = defaultEndTime({ isNew: false, isToday: true, defaultEnd: '18:00', now: at(21, 0) });
  assert.equal(res, '18:00');
});

test('defaultEndTime - geçmiş/ileri tarihte şu anki saat anlamsız, kullanılmaz', () => {
  const res = defaultEndTime({ isNew: true, isToday: false, defaultEnd: '18:00', now: at(21, 0) });
  assert.equal(res, '18:00');
});

test('defaultEndTime - paydosla aynı dakikada varsayılan kalır', () => {
  assert.equal(defaultEndTime({ isNew: true, isToday: true, defaultEnd: '18:00', now: at(18, 0) }), '18:00');
  assert.equal(defaultEndTime({ isNew: true, isToday: true, defaultEnd: '18:00', now: at(18, 1) }), '18:01');
});

test('defaultEndTime - cumartesi gibi erken biten programda da çalışır', () => {
  assert.equal(defaultEndTime({ isNew: true, isToday: true, defaultEnd: '12:45', now: at(13, 7) }), '13:07');
  assert.equal(defaultEndTime({ isNew: true, isToday: true, defaultEnd: '12:45', now: at(11, 0) }), '12:45');
});
