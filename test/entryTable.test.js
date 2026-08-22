import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortEntries, COLUMNS } from '../js/ui/entryTable.js';

const settings = {
  monthlySalary: 45000,
  hoursDivisor: 225,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
};

const entries = [
  { id: 'a', date: '2026-08-05', hours: 3, type: 'normal' },
  { id: 'b', date: '2026-08-12', hours: 1, type: 'holiday' },  // az saat, yüksek çarpan
  { id: 'c', date: '2026-08-01', hours: 5, type: 'normal' },
];

test('sortEntries - tarihe göre yeniden eskiye', () => {
  const res = sortEntries(entries, 'date', 'desc', settings);
  assert.deepEqual(res.map((e) => e.id), ['b', 'a', 'c']);
});

test('sortEntries - tarihe göre eskiden yeniye', () => {
  const res = sortEntries(entries, 'date', 'asc', settings);
  assert.deepEqual(res.map((e) => e.id), ['c', 'a', 'b']);
});

test('sortEntries - süreye göre', () => {
  assert.deepEqual(sortEntries(entries, 'hours', 'desc', settings).map((e) => e.id), ['c', 'a', 'b']);
  assert.deepEqual(sortEntries(entries, 'hours', 'asc', settings).map((e) => e.id), ['b', 'a', 'c']);
});

test('sortEntries - tutara göre (çarpan hesaba katılır, saat sırasıyla aynı değil)', () => {
  // saat ücreti 200: c = 5×1.5×200 = 1500, a = 3×1.5×200 = 900, b = 1×2×200 = 400
  assert.deepEqual(sortEntries(entries, 'amount', 'desc', settings).map((e) => e.id), ['c', 'a', 'b']);
});

test('sortEntries - girdiyi değiştirmez', () => {
  const before = entries.map((e) => e.id).join(',');
  sortEntries(entries, 'hours', 'asc', settings);
  assert.equal(entries.map((e) => e.id).join(','), before);
});

test('sortEntries - eşit değerlerde kararlı (sayfalar arası zıplama olmaz)', () => {
  const esit = [
    { id: 'z', date: '2026-08-05', hours: 2, type: 'normal' },
    { id: 'a', date: '2026-08-05', hours: 2, type: 'normal' },
    { id: 'm', date: '2026-08-05', hours: 2, type: 'normal' },
  ];
  const bir = sortEntries(esit, 'date', 'desc', settings).map((e) => e.id);
  const iki = sortEntries([...esit].reverse(), 'date', 'desc', settings).map((e) => e.id);
  assert.deepEqual(bir, iki, 'girdi sırası değişse de sonuç aynı olmalı');
  assert.deepEqual(bir, ['a', 'm', 'z']);
});

test('sortEntries - boş liste güvenli', () => {
  assert.deepEqual(sortEntries([], 'date', 'desc', settings), []);
});

test('COLUMNS - sıralanabilir sütunlar tarih, süre ve tutar', () => {
  assert.deepEqual(COLUMNS.filter((c) => c.sortable).map((c) => c.key), ['date', 'hours', 'amount']);
});
