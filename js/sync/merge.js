// İki cihazın durumunu kayıt bazında birleştirir.
//
// Neden gerekli: eskiden "Kaydet" tüm dosyanın üstüne yazıyordu. İki cihazda
// ayrı ayrı mesai girildiyse, sonra kaydeden diğerinin girdiklerini siliyordu.
// Burada dosya değil KAYIT birleştirilir; her kayıt için en son değişen kazanır.
//
// Kurallar (hepsi saf, yan etkisiz — bu yüzden testlenebilir):
//   1. Kayıt yalnızca bir tarafta varsa aynen alınır.
//   2. İki tarafta da varsa updatedAt'i yeni olan kazanır.
//   3. Silme, kaydın kendisiyle yarışır: mezar taşı kaydın updatedAt'inden
//      yeniyse kayıt silinir; kayıt daha yeniyse silme yok sayılır (bir cihazda
//      silinip diğerinde düzenlendiyse düzenleme kazanır).
//   4. Ayarlar tek parça: settingsUpdatedAt'i yeni olan taraf alınır.

import { TOMBSTONE_COLLECTIONS, emptyTombstones } from '../store.js';

// Mezar taşları sonsuza kadar birikmesin; bu süre sonunda düşerler. Silinen bir
// kaydın bu süre içinde her cihaza ulaşmış olması beklenir.
const TOMBSTONE_TTL_DAYS = 180;

function time(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

// Kaydın "son değişim" anı: updatedAt yoksa createdAt'e düşer.
function recordTime(rec) {
  return Math.max(time(rec?.updatedAt), time(rec?.createdAt));
}

function byId(list) {
  const map = new Map();
  for (const rec of Array.isArray(list) ? list : []) {
    if (rec && rec.id != null) map.set(String(rec.id), rec);
  }
  return map;
}

function mergeCollection(localList, remoteList, localTomb, remoteTomb, now) {
  const local = byId(localList);
  const remote = byId(remoteList);
  const ids = new Set([...local.keys(), ...remote.keys()]);

  const records = [];
  const tombstones = {};

  // Her iki taraftaki mezar taşları birleşir; aynı id için en yenisi geçerli.
  for (const [id, at] of Object.entries({ ...localTomb, ...remoteTomb })) {
    const newest = Math.max(time(localTomb?.[id]), time(remoteTomb?.[id]));
    if (newest === 0) continue;
    if (now - newest > TOMBSTONE_TTL_DAYS * 86400000) continue; // eskimiş, düşür
    tombstones[id] = new Date(newest).toISOString();
    ids.add(id);
  }

  for (const id of ids) {
    const a = local.get(id);
    const b = remote.get(id);
    const winner = !a ? b : !b ? a : (recordTime(b) > recordTime(a) ? b : a);
    if (!winner) continue;

    const deletedAt = time(tombstones[id]);
    // Silme ile düzenleme yarışı: hangisi daha yeniyse o geçerli.
    if (deletedAt && deletedAt >= recordTime(winner)) continue;
    if (deletedAt) delete tombstones[id]; // kayıt geri geldi, taş anlamsız
    records.push(winner);
  }

  // Sıra deterministik olsun: aynı girdi hep aynı çıktıyı versin.
  records.sort((x, y) => (String(x.id) < String(y.id) ? -1 : 1));
  return { records, tombstones };
}

/**
 * @param {object} local  bu cihazdaki durum
 * @param {object} remote buluttaki durum (yoksa null)
 * @returns {{ merged: object, changedLocal: boolean, changedRemote: boolean, stats: object }}
 */
export function mergeStates(local, remote, nowMs = Date.now()) {
  if (!remote) {
    return { merged: local, changedLocal: false, changedRemote: true, stats: emptyStats() };
  }

  const merged = { ...local };
  const tombstones = emptyTombstones();
  const stats = emptyStats();

  for (const coll of TOMBSTONE_COLLECTIONS) {
    const res = mergeCollection(
      local?.[coll], remote?.[coll],
      local?.tombstones?.[coll] || {}, remote?.tombstones?.[coll] || {},
      nowMs,
    );
    merged[coll] = res.records;
    tombstones[coll] = res.tombstones;

    const localCount = Array.isArray(local?.[coll]) ? local[coll].length : 0;
    const remoteCount = Array.isArray(remote?.[coll]) ? remote[coll].length : 0;
    stats.added += Math.max(0, res.records.length - localCount);
    stats.sent += Math.max(0, res.records.length - remoteCount);
  }
  merged.tombstones = tombstones;

  // Ayarlar bölünemez: yarısı bir cihazdan yarısı diğerinden gelirse tutarsız
  // olur (ör. maaş yeni, saat böleni eski). Bu yüzden en son yazan taraf alınır.
  const localSettingsAt = time(local?.settingsUpdatedAt);
  const remoteSettingsAt = time(remote?.settingsUpdatedAt);
  if (remoteSettingsAt > localSettingsAt) {
    merged.settings = remote.settings;
    merged.settingsUpdatedAt = remote.settingsUpdatedAt;
    stats.settingsFrom = 'remote';
  } else {
    merged.settings = local.settings;
    merged.settingsUpdatedAt = local.settingsUpdatedAt || null;
    if (localSettingsAt > remoteSettingsAt) stats.settingsFrom = 'local';
  }

  // Bilgi amaçlı damgalar: her zaman en yenisi.
  merged.lastBackupAt = newest(local?.lastBackupAt, remote?.lastBackupAt);
  merged.lastCloudBackupAt = newest(local?.lastCloudBackupAt, remote?.lastCloudBackupAt);

  return {
    merged,
    changedLocal: !sameData(merged, local),
    changedRemote: !sameData(merged, remote),
    stats,
  };
}

function emptyStats() {
  return { added: 0, sent: 0, settingsFrom: null };
}

function newest(a, b) {
  const t = Math.max(time(a), time(b));
  return t ? new Date(t).toISOString() : (a || b || null);
}

// Karşılaştırma yalnızca senkronlanan alanlar üzerinden yapılır ve anahtar
// sırasından etkilenmez — yoksa her turda "değişti" sanıp boşuna yazardık.
export function syncFingerprint(state) {
  const parts = [];
  for (const coll of TOMBSTONE_COLLECTIONS) {
    const list = [...(Array.isArray(state?.[coll]) ? state[coll] : [])]
      .sort((a, b) => (String(a?.id) < String(b?.id) ? -1 : 1))
      .map((r) => stable(r));
    parts.push(`${coll}:${JSON.stringify(list)}`);
    const tomb = state?.tombstones?.[coll] || {};
    parts.push(`${coll}~:${JSON.stringify(Object.keys(tomb).sort().map((k) => [k, tomb[k]]))}`);
  }
  parts.push(`settings:${JSON.stringify(stable(state?.settings))}`);
  return parts.join('|');
}

function sameData(a, b) {
  return syncFingerprint(a) === syncFingerprint(b);
}

// Nesneyi anahtar sırasından bağımsız, kararlı bir dizgeye çevirir.
function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

export { TOMBSTONE_TTL_DAYS };
