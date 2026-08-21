import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, pageWindow, paginationHTML } from '../js/ui/pagination.js';

const items = Array.from({ length: 40 }, (_, i) => i + 1);

test('paginate - ilk sayfa 15 kayıt döner', () => {
  const r = paginate(items, 1, 15);
  assert.equal(r.items.length, 15);
  assert.equal(r.items[0], 1);
  assert.equal(r.page, 1);
  assert.equal(r.totalPages, 3);
  assert.equal(r.total, 40);
  assert.equal(r.from, 1);
  assert.equal(r.to, 15);
});

test('paginate - son sayfa artık kayıtları döner', () => {
  const r = paginate(items, 3, 15);
  assert.equal(r.items.length, 10); // 40 - 30
  assert.equal(r.items[0], 31);
  assert.equal(r.from, 31);
  assert.equal(r.to, 40);
});

test('paginate - aralık dışı sayfa son sayfaya kırpılır', () => {
  const r = paginate(items, 99, 15);
  assert.equal(r.page, 3);
  assert.equal(r.items[0], 31);
});

test('paginate - 0 veya negatif sayfa 1e kırpılır', () => {
  assert.equal(paginate(items, 0, 15).page, 1);
  assert.equal(paginate(items, -5, 15).page, 1);
});

test('paginate - boş liste güvenli', () => {
  const r = paginate([], 1, 15);
  assert.equal(r.items.length, 0);
  assert.equal(r.totalPages, 1);
  assert.equal(r.total, 0);
  assert.equal(r.from, 0);
  assert.equal(r.to, 0);
});

test('paginate - tam bölünen liste fazladan sayfa üretmez', () => {
  const r = paginate(Array.from({ length: 30 }, (_, i) => i), 1, 15);
  assert.equal(r.totalPages, 2);
});

test('pageWindow - az sayfa varsa hepsi listelenir', () => {
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
});

test('pageWindow - çok sayfada başta kısaltma sonda olur', () => {
  const w = pageWindow(1, 10);
  assert.equal(w[0], 1);
  assert.equal(w[w.length - 1], 10);
  assert.ok(w.includes(null), 'kısaltma bekleniyordu');
});

test('pageWindow - ortadaki sayfa her iki yanda kısaltma üretir', () => {
  const w = pageWindow(5, 10);
  assert.equal(w[0], 1);
  assert.equal(w[w.length - 1], 10);
  assert.ok(w.includes(5), 'aktif sayfa görünmeli');
  assert.equal(w.filter((n) => n === null).length, 2);
});

test('pageWindow - aktif sayfa her zaman listede', () => {
  for (let p = 1; p <= 12; p++) {
    assert.ok(pageWindow(p, 12).includes(p), `sayfa ${p} görünmeli`);
  }
});

test('paginationHTML - tek sayfada çubuk gösterilmez', () => {
  assert.equal(paginationHTML({ page: 1, totalPages: 1 }), '');
});

test('paginationHTML - ilk sayfada geri butonu pasif, sonda ileri pasif', () => {
  const first = paginationHTML({ page: 1, totalPages: 3 });
  assert.ok(first.includes('data-page="0" disabled'));
  const last = paginationHTML({ page: 3, totalPages: 3 });
  assert.ok(last.includes('data-page="4" disabled'));
});

test('paginationHTML - aktif sayfa işaretlenir', () => {
  const html = paginationHTML({ page: 2, totalPages: 3 });
  assert.ok(html.includes('is-active" type="button" data-page="2"'));
});
