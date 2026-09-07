import test from 'node:test';
import assert from 'node:assert/strict';
import { incomeMix } from '../js/incomeMix.js';

const summary = (over = {}) => ({
  baseSalary: 45000, overtimePay: 4200, mealPay: 3800, transportPay: 2185,
  bonuses: 0, extraIncome: 0, ...over,
});

test('incomeMix - maaş çubukta YOK, maaşın üstüne geleni gösterir', () => {
  const res = incomeMix(summary());
  assert.equal(res.total, 4200 + 3800 + 2185, 'maaş toplama girmez');
  assert.deepEqual(res.parts.map((p) => p.key), ['overtime', 'allowance']);
  const yanOdeme = res.parts.find((p) => p.key === 'allowance');
  assert.equal(yanOdeme.amount, 5985, 'yemek + yol tek kalemde toplanır');
});

test('incomeMix - yüzdeler tam 100 eder', () => {
  for (const s of [summary(), summary({ overtimePay: 1 }), summary({ overtimePay: 3, mealPay: 3, transportPay: 0 })]) {
    const res = incomeMix(s);
    assert.equal(res.parts.reduce((sum, p) => sum + p.pct, 0), 100);
  }
});

test('incomeMix - sıfır kalem listeye girmez', () => {
  const res = incomeMix(summary({ mealPay: 0, transportPay: 0 }));
  assert.deepEqual(res.parts.map((p) => p.key), ['overtime']);
  assert.equal(res.parts[0].pct, 100);
});

test('incomeMix - maaştan başka bir şey yoksa çubuk boş kalır', () => {
  const res = incomeMix(summary({ mealPay: 0, transportPay: 0, overtimePay: 0 }));
  assert.equal(res.total, 0);
  assert.deepEqual(res.parts, []);
});

test('incomeMix - eski bonus kayıtları ek gelirle birleşir', () => {
  const res = incomeMix(summary({ bonuses: 1000, extraIncome: 500 }));
  assert.equal(res.parts.find((p) => p.key === 'extra').amount, 1500);
});

test('incomeMix - hiç gelir yoksa boş döner', () => {
  const bos = incomeMix({ baseSalary: 0, overtimePay: 0, mealPay: 0, transportPay: 0 });
  assert.equal(bos.total, 0);
  assert.deepEqual(bos.parts, []);
  assert.deepEqual(incomeMix(null), { total: 0, parts: [] });
  assert.deepEqual(incomeMix(undefined), { total: 0, parts: [] });
});

test('incomeMix - bozuk sayılar 0 sayılır', () => {
  const res = incomeMix({ baseSalary: '45000', overtimePay: '4200', mealPay: undefined, transportPay: NaN });
  assert.equal(res.total, 4200);
  assert.equal(res.parts.length, 1);
});
