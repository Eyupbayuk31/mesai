import { test } from 'node:test';
import assert from 'node:assert/strict';

// localStorage + fetch mock'ları modül yüklenmeden hazırlanır.
function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
globalThis.localStorage = makeMemoryLocalStorage();

const {
  backupFileName, getSyncConfig, setSyncConfig, clearSyncConfig,
  pushBackup, pullBackup, verifyToken, SyncError,
} = await import('../js/githubSync.js');

// Çağrıları kaydeden sahte fetch.
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    return handler(url, opts);
  };
  return calls;
}

const jsonResponse = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

test('backupFileName - profil başına ayrı dosya', () => {
  assert.equal(backupFileName('eyup'), 'mesai-eyup.json');
  assert.equal(backupFileName('fuat'), 'mesai-fuat.json');
});

test('config - kaydet/oku/temizle', () => {
  clearSyncConfig();
  assert.deepEqual(getSyncConfig(), { token: '', gistId: '' });
  setSyncConfig({ token: 'ghp_x', gistId: 'abc' });
  assert.deepEqual(getSyncConfig(), { token: 'ghp_x', gistId: 'abc' });
  clearSyncConfig();
  assert.deepEqual(getSyncConfig(), { token: '', gistId: '' });
});

test('verifyToken - kullanıcı adını döner', async () => {
  mockFetch(() => jsonResponse(200, { login: 'Eyupbayuk31' }));
  assert.equal(await verifyToken('ghp_x'), 'Eyupbayuk31');
});

test('pushBackup - gistId yokken GİZLİ gist oluşturur', async () => {
  const calls = mockFetch(() => jsonResponse(201, { id: 'gist123', updated_at: '2026-08-21T10:00:00Z', html_url: 'u' }));
  const res = await pushBackup({ token: 't', gistId: '', profileId: 'eyup', json: '{"a":1}' });

  assert.equal(calls[0].url, 'https://api.github.com/gists');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.public, false, 'gist gizli olmalı');
  assert.deepEqual(Object.keys(calls[0].body.files), ['mesai-eyup.json']);
  assert.equal(calls[0].body.files['mesai-eyup.json'].content, '{"a":1}');
  assert.equal(res.gistId, 'gist123');
});

test('pushBackup - gistId varken aynı dosyayı PATCH ile değiştirir (eski birikmez)', async () => {
  const calls = mockFetch(() => jsonResponse(200, { id: 'gist123', updated_at: '2026-08-21T11:00:00Z' }));
  await pushBackup({ token: 't', gistId: 'gist123', profileId: 'eyup', json: '{"a":2}' });

  assert.equal(calls[0].url, 'https://api.github.com/gists/gist123');
  assert.equal(calls[0].method, 'PATCH');
  // Tek dosya adı gönderilir; GitHub aynı ada yazınca eski içerik yerini alır.
  assert.deepEqual(Object.keys(calls[0].body.files), ['mesai-eyup.json']);
  assert.equal(calls[0].body.files['mesai-eyup.json'].content, '{"a":2}');
});

test('pushBackup - profiller aynı gist içinde ayrı dosyalara yazar', async () => {
  const calls = mockFetch(() => jsonResponse(200, { id: 'g', updated_at: 'x' }));
  await pushBackup({ token: 't', gistId: 'g', profileId: 'fuat', json: '{}' });
  assert.deepEqual(Object.keys(calls[0].body.files), ['mesai-fuat.json']);
});

test('pullBackup - doğru profilin dosyasını döner', async () => {
  mockFetch(() => jsonResponse(200, {
    updated_at: '2026-08-21T12:00:00Z',
    files: {
      'mesai-eyup.json': { content: '{"who":"eyup"}', truncated: false },
      'mesai-fuat.json': { content: '{"who":"fuat"}', truncated: false },
    },
  }));
  const res = await pullBackup({ token: 't', gistId: 'g', profileId: 'fuat' });
  assert.equal(res.json, '{"who":"fuat"}');
  assert.equal(res.updatedAt, '2026-08-21T12:00:00Z');
});

test('pullBackup - profilin dosyası yoksa anlaşılır hata', async () => {
  mockFetch(() => jsonResponse(200, { files: { 'mesai-eyup.json': { content: '{}' } } }));
  await assert.rejects(
    () => pullBackup({ token: 't', gistId: 'g', profileId: 'fuat' }),
    (err) => err instanceof SyncError && err.message.includes('mesai-fuat.json'),
  );
});

test('pullBackup - kısaltılmış dosyada ham içerik çekilir', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.github.com')) {
      return jsonResponse(200, {
        updated_at: 'x',
        files: { 'mesai-eyup.json': { content: 'KISA', truncated: true, raw_url: 'https://raw/x' } },
      });
    }
    return { ok: true, status: 200, text: async () => 'TAM-ICERIK' };
  };
  const res = await pullBackup({ token: 't', gistId: 'g', profileId: 'eyup' });
  assert.equal(res.json, 'TAM-ICERIK');
});

test('hata durumları anlaşılır Türkçe mesaja çevrilir', async () => {
  const cases = [
    [401, /Token geçersiz/],
    [403, /gist.*izni/i],
    [404, /bulunamadı/],
    [500, /yanıt vermiyor/],
  ];
  for (const [status, pattern] of cases) {
    mockFetch(() => jsonResponse(status, {}));
    await assert.rejects(
      () => verifyToken('t'),
      (err) => err instanceof SyncError && pattern.test(err.message),
      `status ${status} için mesaj beklenendi`,
    );
  }
});

test('ağ hatası SyncError olarak sarılır', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(
    () => verifyToken('t'),
    (err) => err instanceof SyncError && /bağlantısı yok/.test(err.message),
  );
});

test('token Authorization başlığında Bearer ile gider', async () => {
  const calls = mockFetch(() => jsonResponse(200, { login: 'x' }));
  await verifyToken('ghp_secret');
  assert.equal(calls[0].headers.Authorization, 'Bearer ghp_secret');
});
