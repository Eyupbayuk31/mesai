import test from 'node:test';
import assert from 'node:assert/strict';
import { profileSummary, greeting, relativeDay, profileLine, STATE_PREFIX, LAST_SEEN_PREFIX } from '../js/profileStats.js';

const reader = (map) => (key) => (key in map ? map[key] : null);

test('profileSummary - kayıt sayısı ve son giriş okunur', () => {
  const res = profileSummary(reader({
    [STATE_PREFIX + 'eyup']: JSON.stringify({ entries: [1, 2, 3] }),
    [LAST_SEEN_PREFIX + 'eyup']: '2026-08-20T10:00:00.000Z',
  }), 'eyup');
  assert.equal(res.entries, 3);
  assert.equal(res.lastSeen, '2026-08-20T10:00:00.000Z');
});

test('profileSummary - kayıt yoksa ve bozuksa çökmez', () => {
  assert.deepEqual(profileSummary(reader({}), 'fuat'), { entries: 0, lastSeen: null });
  assert.deepEqual(profileSummary(reader({ [STATE_PREFIX + 'fuat']: '{bozuk' }), 'fuat'), { entries: 0, lastSeen: null });
  assert.deepEqual(profileSummary(() => { throw new Error('kapalı'); }, 'fuat'), { entries: 0, lastSeen: null });
  assert.equal(profileSummary(reader({ [LAST_SEEN_PREFIX + 'fuat']: 'saçma' }), 'fuat').lastSeen, null);
});

test('greeting - saate göre', () => {
  const at = (h) => greeting(new Date(2026, 7, 21, h, 0, 0));
  assert.equal(at(7), 'Günaydın');
  assert.equal(at(13), 'İyi günler');
  assert.equal(at(19), 'İyi akşamlar');
  assert.equal(at(23), 'İyi geceler');
  assert.equal(at(3), 'İyi geceler');
});

test('relativeDay - bugün, dün, gün ve ay', () => {
  const now = new Date(2026, 7, 21, 12, 0, 0).getTime();
  const iso = (y, m, d, h = 9) => new Date(y, m, d, h).toISOString();
  assert.equal(relativeDay(now, iso(2026, 7, 21)), 'bugün');
  assert.equal(relativeDay(now, iso(2026, 7, 20)), 'dün');
  assert.equal(relativeDay(now, iso(2026, 7, 18)), '3 gün önce');
  assert.equal(relativeDay(now, iso(2026, 5, 21)), '2 ay önce');
  assert.equal(relativeDay(now, iso(2024, 1, 1)), 'uzun zaman önce');
  assert.equal(relativeDay(now, null), null);
  assert.equal(relativeDay(now, 'saçma'), null);
});

test('relativeDay - gece yarısını geçen fark "dün" der', () => {
  const now = new Date(2026, 7, 21, 0, 30).getTime();
  assert.equal(relativeDay(now, new Date(2026, 7, 20, 23, 50).toISOString()), 'dün');
});

test('profileLine - boş profil ve dolu profil', () => {
  const now = new Date(2026, 7, 21, 12).getTime();
  assert.equal(profileLine({ entries: 0, lastSeen: null }, now), 'yeni profil');
  assert.equal(profileLine({ entries: 12, lastSeen: null }, now), '12 kayıt');
  assert.equal(
    profileLine({ entries: 12, lastSeen: new Date(2026, 7, 20, 9).toISOString() }, now),
    '12 kayıt · dün',
  );
});
