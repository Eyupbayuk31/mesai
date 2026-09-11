import { test } from 'node:test';
import assert from 'node:assert/strict';

// Tarayıcı depolaması taklidi (store.test.js'teki kalıbın aynısı).
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function freshStorage() {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
  return globalThis.localStorage;
}

const lock = await import('../js/lock.js');

test('lockSupported - WebCrypto varsa kilit kurulabilir', () => {
  assert.equal(lock.lockSupported(), true);
});

test('setPin / verifyPin - doğru PIN açar, yanlış açmaz', async () => {
  freshStorage();
  assert.deepEqual(await lock.setPin('eyup', '1234'), { ok: true });
  assert.equal(await lock.verifyPin('eyup', '1234'), true);
  assert.equal(await lock.verifyPin('eyup', '1235'), false);
  assert.equal(await lock.verifyPin('eyup', ''), false);
});

test('PIN düz metin olarak SAKLANMAZ', async () => {
  const store = freshStorage();
  await lock.setPin('eyup', '9182');
  const raw = store.getItem('mesai.lock');
  assert.ok(raw, 'kayıt yazılmış olmalı');
  assert.ok(!raw.includes('9182'), 'düz PIN saklanmamalı');
  const rec = JSON.parse(raw).eyup;
  assert.ok(rec.salt && rec.hash, 'tuz ve özet saklanır');
  assert.ok(rec.iterations >= 100000, 'kaba kuvvet maliyetli olmalı');
});

test('her kurulumda tuz farklı - aynı PIN farklı özet üretir', async () => {
  const a = freshStorage();
  await lock.setPin('eyup', '1234');
  const first = JSON.parse(a.getItem('mesai.lock')).eyup;
  const b = freshStorage();
  await lock.setPin('eyup', '1234');
  const second = JSON.parse(b.getItem('mesai.lock')).eyup;
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash, 'tuz olmadan iki cihazın özeti aynı çıkardı');
});

test('profiller birbirinden bağımsız', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  assert.equal(lock.hasPin('eyup'), true);
  assert.equal(lock.hasPin('fuat'), false);
  assert.equal(await lock.verifyPin('fuat', '1234'), false, 'kilitsiz profil PIN kabul etmez');
  await lock.setPin('fuat', '5678');
  assert.equal(await lock.verifyPin('eyup', '5678'), false, 'PIN’ler karışmaz');
  assert.deepEqual(lock.lockedProfiles().sort(), ['eyup', 'fuat']);
});

test('validatePin - uzunluk sınırları', () => {
  assert.equal(lock.validatePin('123').ok, false);
  assert.equal(lock.validatePin('1234').ok, true);
  assert.equal(lock.validatePin('a'.repeat(32)).ok, true);
  assert.equal(lock.validatePin('a'.repeat(33)).ok, false);
});

test('setPin - kısa PIN kurulmaz, eski kilit bozulmaz', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  const res = await lock.setPin('eyup', '12');
  assert.equal(res.ok, false);
  assert.equal(await lock.verifyPin('eyup', '1234'), true, 'eski PIN çalışmaya devam eder');
});

test('clearPin - yalnız doğru PIN ile kaldırılır', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  assert.equal((await lock.clearPin('eyup', '0000')).ok, false, 'yanlış PIN kilidi açtırmaz');
  assert.equal(lock.hasPin('eyup'), true);
  assert.equal((await lock.clearPin('eyup', '1234')).ok, true);
  assert.equal(lock.hasPin('eyup'), false);
});

test('depolama yoksa setPin BAŞARILI DÖNMEZ', async () => {
  // Kullanıcı kilit kurduğunu sanıp kurmamış olmamalı.
  globalThis.localStorage = undefined;
  const res = await lock.setPin('eyup', '1234');
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

// --- Oturum durumu --------------------------------------------------------

test('isUnlocked - kilitsiz profil hep açık', () => {
  freshStorage();
  assert.equal(lock.isUnlocked('eyup'), true);
});

test('isUnlocked - kilitli profil açılana kadar kapalı', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  assert.equal(lock.isUnlocked('eyup'), false);
  lock.markUnlocked('eyup');
  assert.equal(lock.isUnlocked('eyup'), true);
  lock.lockNow();
  assert.equal(lock.isUnlocked('eyup'), false);
});

test('isUnlocked - bir profilin açılması diğerini açmaz', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  await lock.setPin('fuat', '5678');
  lock.markUnlocked('eyup');
  assert.equal(lock.isUnlocked('eyup'), true);
  assert.equal(lock.isUnlocked('fuat'), false);
});

test('isUnlocked - boşta kalma süresi dolunca yeniden kilitlenir', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  lock.markUnlocked('eyup');
  assert.equal(lock.isUnlocked('eyup', 60000), true, 'yeni açılmış');
  // Damgayı geriye al: 10 dakika önce açılmış gibi.
  globalThis.sessionStorage.setItem('mesai.lock.open', `eyup:${Date.now() - 10 * 60000}`);
  assert.equal(lock.isUnlocked('eyup', 5 * 60000), false, '5 dk sınırı aşıldı');
  assert.equal(lock.isUnlocked('eyup', 30 * 60000), true, '30 dk sınırı aşılmadı');
  assert.equal(lock.isUnlocked('eyup'), true, 'sınır verilmezse süre bakılmaz');
});

test('isUnlocked - bozuk oturum kaydı açık saymaz', async () => {
  freshStorage();
  await lock.setPin('eyup', '1234');
  globalThis.sessionStorage.setItem('mesai.lock.open', 'saçma');
  assert.equal(lock.isUnlocked('eyup'), false);
  globalThis.sessionStorage.setItem('mesai.lock.open', 'eyup:abc');
  assert.equal(lock.isUnlocked('eyup'), false);
});

// --- Kilit ekranının alt yazısı -------------------------------------------

test('sacmalikSec - havuzdan seçer, hep aynı satırı vermez', async () => {
  const { SACMALIKLAR, sacmalikSec } = await import('../js/lockJokes.js');
  assert.ok(SACMALIKLAR.length >= 3, 'havuz en az birkaç satır olmalı');
  assert.equal(new Set(SACMALIKLAR).size, SACMALIKLAR.length, 'tekrar eden satır olmasın');
  assert.ok(SACMALIKLAR.every((l) => typeof l === 'string' && l.trim().length > 0));

  // Sınırlar: 0 ilk satırı, 1'e çok yakın değer son satırı vermeli
  // (Math.floor taşarsa undefined basardı).
  assert.equal(sacmalikSec(() => 0), SACMALIKLAR[0]);
  assert.equal(sacmalikSec(() => 0.9999999), SACMALIKLAR[SACMALIKLAR.length - 1]);

  const gorulen = new Set();
  for (let i = 0; i < 200; i += 1) gorulen.add(sacmalikSec());
  assert.ok(gorulen.size > 1, 'rastgelelik çalışmalı');
});

test('kilit ekranında artık açıklama yok', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync('js/ui/lockScreen.js', 'utf8'));
  // Kullanıcının kaldırılmasını istediği metin geri gelmesin.
  assert.ok(!src.includes('PIN yalnız bu cihazda geçerli'), 'açıklama kaldırılmıştı');
  const jokes = await import('node:fs').then((fs) => fs.readFileSync('js/lockJokes.js', 'utf8'));
  assert.ok(jokes.includes('Fenerbahçe'), 'saçmalık havuzu duruyor');
  // Resim yoksa kırık simge kalmasın diye onerror şart.
  assert.ok(src.includes("addEventListener('error'"), 'eksik resim sessizce kalkmalı');
});
