import { test } from 'node:test';
import assert from 'node:assert/strict';

const { monthRowState, visibleMonths } = await import('../js/ui/report/shared.js');

// Ay satırının hangi hâlde çizileceği raporun en kritik kararı; DOM'suz
// test edilebilsin diye saf tutuluyor.
const ay = (over = {}) => ({
  periodKey: '2026-03', hasData: false, hasIncome: false, isFuture: false, ...over,
});

test('monthRowState - gelecek ay "veri yok" değildir', () => {
  assert.equal(monthRowState(ay({ isFuture: true })), 'future');
  // Gelecek ayda veri olamaz ama bayrak öncelikli olmalı.
  assert.equal(monthRowState(ay({ isFuture: true, hasData: true, hasIncome: true })), 'future');
});

test('monthRowState - hiç verisi olmayan geçmiş ay elenir', () => {
  assert.equal(monthRowState(ay()), 'empty');
  assert.equal(monthRowState(null), 'empty');
});

test('monthRowState - harcaması olan bordrosuz ay no-income', () => {
  assert.equal(monthRowState(ay({ hasData: true, hasIncome: false })), 'no-income');
});

test('monthRowState - bordrosu girilmiş ay full', () => {
  assert.equal(monthRowState(ay({ hasData: true, hasIncome: true })), 'full');
});

test('visibleMonths - yalnız veri olan geçmiş aylar', () => {
  const finance = {
    months: [
      ay({ periodKey: '2026-01' }),                                   // boş
      ay({ periodKey: '2026-02', hasData: true }),                    // harcama var, bordro yok
      ay({ periodKey: '2026-03', hasData: true, hasIncome: true }),   // dolu
      ay({ periodKey: '2026-11', isFuture: true }),                   // gelecek
    ],
  };
  assert.deepEqual(visibleMonths(finance).map((m) => m.periodKey), ['2026-02', '2026-03']);
  assert.deepEqual(visibleMonths(null), []);
});
