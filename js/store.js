// localStorage kalıcılık katmanı: şema sürümü, migration, güvenli fallback.
// Her kullanıcı profili kendi anahtarında saklanır (mesai.state.<profil>).

const LEGACY_STORAGE_KEY = 'mesai.state'; // profil sistemi öncesi tek kullanıcılı sürüm
const SCHEMA_VERSION = 1;

// Haftalık çalışma programı: JS Date.getDay() sırasına göre (0=Pazar..6=Cumartesi).
// Hafta içi 08:30-18:00, Cumartesi 08:30-12:45, Pazar kapalı — bu varsayılan
// Ayarlar ekranından tamamen değiştirilebilir.
const DEFAULT_WEEKLY_SCHEDULE = {
  0: { works: false, start: '08:30', end: '18:00' },
  1: { works: true, start: '08:30', end: '18:00' },
  2: { works: true, start: '08:30', end: '18:00' },
  3: { works: true, start: '08:30', end: '18:00' },
  4: { works: true, start: '08:30', end: '18:00' },
  5: { works: true, start: '08:30', end: '18:00' },
  6: { works: true, start: '08:30', end: '12:45' },
};

const DEFAULT_SETTINGS = {
  monthlySalary: 0,
  hoursDivisor: 225,
  // Günlük yan ödemeler (yemek kartı / ulaşım) — 0 = kapalı.
  mealAllowance: 0,
  transportAllowance: 0,
  payDay: 10,
  payMonthOffset: 1,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weekendDays: [0],
  autoDetectType: true,
  defaultEntryMode: 'shift',
  theme: 'auto',
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
  // Mesai sırasındaki yemek molası — bu pencereyle kesişen süre mesaiden düşülür.
  breakWindow: { enabled: true, start: '18:30', end: '19:00' },
};

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      ...DEFAULT_SETTINGS,
      multipliers: { ...DEFAULT_SETTINGS.multipliers },
      weeklySchedule: mergeWeeklySchedule(null),
    },
    entries: [],
    adjustments: [],
  };
}

function mergeWeeklySchedule(schedule) {
  const merged = {};
  for (let d = 0; d <= 6; d++) {
    merged[d] = { ...DEFAULT_WEEKLY_SCHEDULE[d], ...(schedule?.[d] || {}) };
  }
  return merged;
}

function mergeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    multipliers: { ...DEFAULT_SETTINGS.multipliers, ...(settings?.multipliers || {}) },
    weekendDays: Array.isArray(settings?.weekendDays) ? settings.weekendDays : DEFAULT_SETTINGS.weekendDays,
    weeklySchedule: mergeWeeklySchedule(settings?.weeklySchedule),
    breakWindow: { ...DEFAULT_SETTINGS.breakWindow, ...(settings?.breakWindow || {}) },
  };
}

// İleride şema değişirse buraya sürüm-sürüm migration adımları eklenir.
function migrate(raw) {
  const state = { ...defaultState(), ...raw };
  state.settings = mergeSettings(raw?.settings);
  state.entries = Array.isArray(raw?.entries) ? raw.entries : [];
  state.adjustments = Array.isArray(raw?.adjustments) ? raw.adjustments : [];
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}

function isStorageAvailable() {
  try {
    const testKey = '__mesai_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export class Store {
  constructor(profileId) {
    this.storageKey = profileId ? `mesai.state.${profileId}` : LEGACY_STORAGE_KEY;
    this.available = isStorageAvailable();
    this.memoryState = null;
    this.listeners = new Set();
    this.state = this._load();
  }

  _load() {
    if (!this.available) return defaultState();
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (raw) return migrate(JSON.parse(raw));

      // Profil sistemi öncesinden kalma tek kullanıcılı veri varsa, ilk açılan
      // profile bir kerelik taşınır (eski anahtar da korunur, silinmez).
      if (this.storageKey !== LEGACY_STORAGE_KEY) {
        const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          const migrated = migrate(JSON.parse(legacyRaw));
          window.localStorage.setItem(this.storageKey, JSON.stringify(migrated));
          return migrated;
        }
      }
      return defaultState();
    } catch {
      return defaultState();
    }
  }

  _persist() {
    if (!this.available) {
      this.memoryState = this.state;
      return;
    }
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      this.available = false;
      this.memoryState = this.state;
    }
  }

  getState() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn(this.state);
  }

  update(mutator) {
    const next = mutator(this.state);
    this.state = next || this.state;
    this._persist();
    this._notify();
  }

  updateSettings(partial) {
    this.update((s) => ({ ...s, settings: mergeSettings({ ...s.settings, ...partial }) }));
  }

  addEntry(entry) {
    const id = entry.id || `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const record = { ...entry, id, createdAt: entry.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, entries: [...s.entries, record] }));
    return record;
  }

  updateEntry(id, partial) {
    this.update((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...partial, updatedAt: new Date().toISOString() } : e)),
    }));
  }

  removeEntry(id) {
    this.update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
  }

  addAdjustment(adj) {
    const id = adj.id || `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = { ...adj, id, createdAt: adj.createdAt || new Date().toISOString() };
    this.update((s) => ({ ...s, adjustments: [...s.adjustments, record] }));
    return record;
  }

  removeAdjustment(id) {
    this.update((s) => ({ ...s, adjustments: s.adjustments.filter((a) => a.id !== id) }));
  }

  replaceAll(newState) {
    this.update(() => migrate(newState));
  }

  reset() {
    this.update(() => defaultState());
  }

  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  // Yedek alındığını damgalar — Ayarlar menüsünde "Son yedek" özeti için.
  markBackedUp() {
    this.update((s) => ({ ...s, lastBackupAt: new Date().toISOString() }));
  }

  validateImport(raw) {
    if (!raw || typeof raw !== 'object') return { valid: false, error: 'Geçersiz dosya formatı' };
    if (!Array.isArray(raw.entries)) return { valid: false, error: 'Kayıt listesi bulunamadı' };
    return {
      valid: true,
      entryCount: raw.entries.length,
      adjustmentCount: Array.isArray(raw.adjustments) ? raw.adjustments.length : 0,
      hasSettings: !!raw.settings,
    };
  }
}

export { LEGACY_STORAGE_KEY, SCHEMA_VERSION, DEFAULT_SETTINGS };
