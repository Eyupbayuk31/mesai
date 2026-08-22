// Otomatik senkron motoru.
//
// Elle "Kaydet"/"Getir" yerine: uygulama açılınca, veri değişince ve öne
// gelince kendiliğinden buluttaki yedekle karşılıklı birleşir.
//
// Bir tur şu sırayla işler ve bölünemez:
//   1. buluttaki dosyayı çek
//   2. yerelle KAYIT BAZINDA birleştir (js/sync/merge.js)
//   3. yerel eksikse uygula, bulut eksikse geri yaz
// Böylece iki cihazda ayrı ayrı girilen veriler birbirini ezmez.

import { mergeStates } from './merge.js';
import { getSyncConfig, setSyncConfig, pushBackup, pullBackup, SyncError } from '../githubSync.js';

const STATUS_KEY = 'mesai.sync.status';
const DEVICE_KEY = 'mesai.sync.deviceId';

// Yerel değişiklikten sonra bu kadar beklenir; arka arkaya girişlerde tek tur
// yapılır (her tuşta GitHub'a yazmamak için).
const PUSH_DEBOUNCE_MS = 4000;
// Uygulama açıkken bu aralıkla arka planda kontrol edilir.
const POLL_INTERVAL_MS = 5 * 60 * 1000;
// Öne gelindiğinde son senkrondan bu kadar geçtiyse yeniden çekilir.
const FOREGROUND_MIN_AGE_MS = 60 * 1000;

export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'd_gecici';
  }
}

// Durum sayfa yenilense de kalsın diye saklanır: kullanıcı "en son ne zaman
// senkron oldu" sorusunun cevabını her açılışta görebilmeli.
export function readStatus() {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { state: 'idle', lastSyncAt: null, message: '' };
}

function writeStatus(status) {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(status)); } catch {}
}

export class SyncEngine {
  constructor({ store, profileId, onStatus }) {
    this.store = store;
    this.profileId = profileId;
    this.onStatus = onStatus || (() => {});
    this.status = readStatus();
    this.running = null;      // süren tur (Promise)
    this.rerunRequested = false;
    this.debounceTimer = null;
    this.pollTimer = null;
    this.applyingRemote = false; // uzaktan gelen değişikliği yazarken tetikleme
    this.unsubscribers = [];
  }

  isConnected() {
    return !!getSyncConfig().token;
  }

  _setStatus(patch) {
    this.status = { ...this.status, ...patch };
    writeStatus(this.status);
    this.onStatus(this.status);
  }

  start() {
    if (!this.isConnected()) {
      this._setStatus({ state: 'off', message: '' });
      return;
    }

    // Yerel değişiklik → gecikmeli tur.
    this.unsubscribers.push(this.store.subscribe(() => {
      if (this.applyingRemote) return;
      this.schedule();
    }));

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const age = Date.now() - Date.parse(this.status.lastSyncAt || 0);
      if (!this.status.lastSyncAt || age > FOREGROUND_MIN_AGE_MS) this.syncNow('öne gelince');
    };
    document.addEventListener('visibilitychange', onVisible);
    this.unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisible));

    const onOnline = () => this.syncNow('ağ geri geldi');
    window.addEventListener('online', onOnline);
    this.unsubscribers.push(() => window.removeEventListener('online', onOnline));

    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.syncNow('düzenli kontrol');
    }, POLL_INTERVAL_MS);

    this.syncNow('açılış');
  }

  // Token eklendikten/silindikten sonra dinleyicileri baştan kurar.
  restart() {
    this.stop();
    this.start();
  }

  stop() {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    clearTimeout(this.debounceTimer);
    clearInterval(this.pollTimer);
  }

  schedule() {
    clearTimeout(this.debounceTimer);
    this._setStatus({ state: 'pending' });
    this.debounceTimer = setTimeout(() => this.syncNow('değişiklik'), PUSH_DEBOUNCE_MS);
  }

  // Aynı anda tek tur çalışır; sürerken gelen istek turun sonunda tekrarlanır.
  syncNow(reason = 'elle') {
    if (!this.isConnected()) return Promise.resolve(this.status);
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    clearTimeout(this.debounceTimer);
    this.running = this._runOnce(reason).finally(() => {
      this.running = null;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.syncNow('bekleyen değişiklik');
      }
    });
    return this.running;
  }

  async _runOnce(reason) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this._setStatus({ state: 'offline', message: 'İnternet yok — bağlanınca devam eder' });
      return this.status;
    }
    this._setStatus({ state: 'syncing', message: '' });
    const { token, gistId } = getSyncConfig();

    try {
      // 1) Buluttaki durum. Yedek hiç yoksa (ilk cihaz) remote = null.
      let remote = null;
      let remoteGistId = gistId;
      try {
        const pulled = await pullBackup({ token, gistId, profileId: this.profileId });
        remoteGistId = pulled.gistId || gistId;
        remote = JSON.parse(pulled.json);
      } catch (err) {
        // "Yedek yok" beklenen bir durum; gerçek hatalar yukarı gider.
        if (!(err instanceof SyncError) || !/bulunamadı|dosyası yok/i.test(err.message)) throw err;
      }

      // 2) Birleştir.
      const local = this.store.getState();
      const { merged, changedLocal, changedRemote, stats } = mergeStates(local, remote);

      // 3) Yerele uygula (bu yazma yeni bir tur tetiklemesin).
      if (changedLocal) {
        this.applyingRemote = true;
        try { this.store.replaceAll(merged); } finally { this.applyingRemote = false; }
      }

      // 4) Buluta geri yaz.
      if (changedRemote || !remote) {
        const res = await pushBackup({
          token,
          gistId: remoteGistId,
          profileId: this.profileId,
          json: JSON.stringify(changedLocal ? this.store.getState() : merged, null, 2),
        });
        if (res.gistId && res.gistId !== gistId) setSyncConfig({ gistId: res.gistId });
      } else if (remoteGistId && remoteGistId !== gistId) {
        setSyncConfig({ gistId: remoteGistId });
      }

      this._setStatus({
        state: 'ok',
        lastSyncAt: new Date().toISOString(),
        message: describe(changedLocal, changedRemote, stats),
        reason,
      });
    } catch (err) {
      this._setStatus({
        state: 'error',
        message: err instanceof SyncError ? err.message : 'Senkron başarısız',
      });
    }
    return this.status;
  }
}

function describe(changedLocal, changedRemote, stats) {
  if (changedLocal && changedRemote) return `${stats.added} kayıt alındı, ${stats.sent} kayıt gönderildi`;
  if (changedLocal) return `${stats.added} yeni kayıt alındı`;
  if (changedRemote) return 'Değişiklikler buluta gönderildi';
  return 'Her şey güncel';
}

// "2 dakika önce" gibi kısa özet.
export function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return null;
  if (diff < 45000) return 'az önce';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.round(hours / 24);
  return `${days} gün önce`;
}

export { PUSH_DEBOUNCE_MS, POLL_INTERVAL_MS };
