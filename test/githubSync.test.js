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
  pushBackup, pullBackup, verifyToken, gistScopeProblem, sanitizeToken, findBackupGist, SyncError,
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

const jsonResponse = (status, data, scopesHeader = 'gist') => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
  headers: { get: (name) => (name.toLowerCase() === 'x-oauth-scopes' ? scopesHeader : null) },
});

test('backupFileName - profil başına ayrı dosya', () => {
  assert.equal(backupFileName('eyup'), 'mesai-eyup.json');
  assert.equal(backupFileName('fuat'), 'mesai-fuat.json');
});

test('sanitizeToken - temiz token olduğu gibi kalır', () => {
  const raw = 'ghp_' + 'a1B2c3D4'.repeat(4) + 'ZZZZ';
  const res = sanitizeToken(raw);
  assert.equal(res.token, raw);
  assert.equal(res.removed, 0);
});

test('sanitizeToken - görünmez karakterleri temizler (telefon klavyesi)', () => {
  // U+200B zero-width space: trim() bunu silmez, GitHub token'ı reddeder.
  const res = sanitizeToken('\u200bghp_abc123\u200b');
  assert.equal(res.token, 'ghp_abc123');
  assert.equal(res.removed, 2);
});

test('sanitizeToken - boşluk, satır sonu ve yön işaretlerini atar', () => {
  const res = sanitizeToken('  ghp_abc\n123 \u202a\u00a0');
  assert.equal(res.token, 'ghp_abc123');
  assert.equal(res.removed, 6);
});

test('sanitizeToken - alt çizgi korunur, tırnak/nokta atılır', () => {
  assert.equal(sanitizeToken('"github_pat_11ABC."').token, 'github_pat_11ABC');
});

test('sanitizeToken - boş/undefined girdi çökmez', () => {
  assert.deepEqual(sanitizeToken(''), { token: '', removed: 0 });
  assert.deepEqual(sanitizeToken(undefined), { token: '', removed: 0 });
  assert.deepEqual(sanitizeToken(null), { token: '', removed: 0 });
});

test('config - kaydet/oku/temizle', () => {
  clearSyncConfig();
  assert.deepEqual(getSyncConfig(), { token: '', gistId: '', login: '' });
  setSyncConfig({ token: 'ghp_x', gistId: 'abc', login: 'Eyupbayuk31' });
  assert.deepEqual(getSyncConfig(), { token: 'ghp_x', gistId: 'abc', login: 'Eyupbayuk31' });
  clearSyncConfig();
  assert.deepEqual(getSyncConfig(), { token: '', gistId: '', login: '' });
});

test('verifyToken - kullanıcı adını ve izinleri döner', async () => {
  mockFetch(() => jsonResponse(200, { login: 'Eyupbayuk31' }, 'gist, repo'));
  const res = await verifyToken('ghp_x');
  assert.equal(res.login, 'Eyupbayuk31');
  assert.deepEqual(res.scopes, ['gist', 'repo']);
});

test('verifyToken - izin başlığı yoksa scopes null (fine-grained token)', async () => {
  mockFetch(() => jsonResponse(200, { login: 'x' }, null));
  const res = await verifyToken('github_pat_x');
  assert.equal(res.scopes, null);
});

test('gistScopeProblem - gist izni varsa sorun yok', () => {
  assert.equal(gistScopeProblem(['gist']), null);
  assert.equal(gistScopeProblem(['repo', 'gist', 'user']), null);
});

test('gistScopeProblem - gist izni yoksa mevcut izinleri söyler', () => {
  const msg = gistScopeProblem(['repo', 'user']);
  assert.match(msg, /"gist" izni yok/);
  assert.match(msg, /repo, user/);
});

test('gistScopeProblem - izin listesi boşsa "hiçbiri" der', () => {
  assert.match(gistScopeProblem([]), /hiçbiri/);
});

test('gistScopeProblem - scopes null ise fine-grained uyarısı verir', () => {
  assert.match(gistScopeProblem(null), /fine-grained/);
});

test('hata mesajı GitHubun kendi açıklamasını da içerir', async () => {
  mockFetch(() => jsonResponse(401, { message: 'Bad credentials' }));
  await assert.rejects(
    () => verifyToken('t'),
    (err) => err instanceof SyncError && err.message.includes('Bad credentials') && err.message.includes('401'),
  );
});

test('pushBackup - gistId yokken GİZLİ gist oluşturur', async () => {
  const calls = mockFetch(() => jsonResponse(201, { id: 'gist123', updated_at: '2026-08-21T10:00:00Z', html_url: 'u' }));
  const res = await pushBackup({ token: 't', gistId: '', profileId: 'eyup', json: '{"a":1}' });

  // İlk çağrı hesapta mevcut yedeği arar (kopya gist açmamak için), sonra oluşturur.
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.url, 'https://api.github.com/gists');
  assert.equal(post.body.public, false, 'gist gizli olmalı');
  assert.deepEqual(Object.keys(post.body.files), ['mesai-eyup.json']);
  assert.equal(post.body.files['mesai-eyup.json'].content, '{"a":1}');
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


// --- Cihazlar arası: gistId yalnızca kaydı yapan cihazda durur ---

const gistListResponse = (gists) => jsonResponse(200, gists);

test('findBackupGist - profilin dosyasını içeren gist bulunur', async () => {
  mockFetch(() => gistListResponse([
    { id: 'other', files: { 'notlar.txt': {} }, updated_at: 'a' },
    { id: 'g_eyup', files: { 'mesai-eyup.json': {} }, updated_at: 'b' },
  ]));
  const res = await findBackupGist({ token: 't', profileId: 'eyup' });
  assert.equal(res.gistId, 'g_eyup');
});

test('findBackupGist - yedek yoksa null, diğer profillerin yedeklerini bildirir', async () => {
  mockFetch(() => gistListResponse([{ id: 'g', files: { 'mesai-eyup.json': {} } }]));
  const res = await findBackupGist({ token: 't', profileId: 'fuat' });
  assert.equal(res.gistId, null);
  assert.deepEqual(res.otherBackups, ['mesai-eyup.json']);
});

test('pullBackup - gistId olmayan cihaz yedeği hesapta bulup indirir', async () => {
  // Telefonda kaydedilmiş, PC bu gist'i hiç görmemiş.
  globalThis.fetch = async (url) => {
    if (String(url).includes('/gists?')) {
      return gistListResponse([{ id: 'g_phone', files: { 'mesai-eyup.json': {} } }]);
    }
    return jsonResponse(200, {
      updated_at: '2026-08-21T20:00:00Z',
      files: { 'mesai-eyup.json': { content: '{"who":"telefon"}' } },
    });
  };
  const res = await pullBackup({ token: 't', gistId: '', profileId: 'eyup' });
  assert.equal(res.json, '{"who":"telefon"}');
  assert.equal(res.gistId, 'g_phone', 'bulunan gist id geri dönmeli (cihaza kaydedilecek)');
});

test('pullBackup - hesapta hiç yedek yoksa "önce Kaydet" der', async () => {
  mockFetch(() => gistListResponse([]));
  await assert.rejects(
    () => pullBackup({ token: 't', gistId: '', profileId: 'eyup' }),
    (err) => err instanceof SyncError
      && err.message.includes('mesai-eyup.json')
      && /Kaydet/.test(err.message),
  );
});

test('pullBackup - yanlış profildeyken mevcut yedeği söyler', async () => {
  mockFetch(() => gistListResponse([{ id: 'g', files: { 'mesai-eyup.json': {} } }]));
  await assert.rejects(
    () => pullBackup({ token: 't', gistId: '', profileId: 'fuat' }),
    (err) => err.message.includes('mesai-eyup.json') && /profili değiştir/i.test(err.message),
  );
});

test('pushBackup - ikinci cihaz kopya gist açmaz, mevcut gist\'i günceller', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET' });
    if (String(url).includes('/gists?')) {
      return gistListResponse([{ id: 'g_phone', files: { 'mesai-eyup.json': {} } }]);
    }
    return jsonResponse(200, { id: 'g_phone', updated_at: 'x' });
  };
  const res = await pushBackup({ token: 't', gistId: '', profileId: 'eyup', json: '{"a":1}' });
  assert.equal(res.gistId, 'g_phone');
  assert.ok(calls.some((c) => c.method === 'PATCH' && c.url.includes('/gists/g_phone')), 'PATCH beklenirdi');
  assert.ok(!calls.some((c) => c.method === 'POST'), 'yeni gist AÇILMAMALI');
});

test('pushBackup - hesapta yedek yoksa yeni gizli gist açılır', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (String(url).includes('/gists?')) return gistListResponse([]);
    return jsonResponse(201, { id: 'g_new', updated_at: 'x' });
  };
  const res = await pushBackup({ token: 't', gistId: '', profileId: 'eyup', json: '{}' });
  assert.equal(res.gistId, 'g_new');
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.body.public, false);
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
    [401, /kabul edilmedi \(401\)/],
    [403, /gist.*izni/i],
    [404, /Bulunamadı \(404\)/],
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
