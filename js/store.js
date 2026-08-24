// localStorage kalıcılık katmanı: şema sürümü, migration, güvenli fallback.
// Her kullanıcı profili kendi anahtarında saklanır (mesai.state.<profil>).

import { inferKind, kindByKey, PRESET_ASSETS } from './investments.js';

const LEGACY_STORAGE_KEY = 'mesai.state'; // profil sistemi öncesi tek kullanıcılı sürüm
const SCHEMA_VERSION = 3;

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
  // Maaş değişiklikleri: [{ id, fromPeriod: 'YYYY-MM', amount }]
  // Boşsa davranış eskisi gibi: tek maaş tüm dönemlerde geçerli.
  salaryHistory: [],
  hoursDivisor: 225,
  // Günlük yan ödemeler (yemek kartı / ulaşım) — 0 = kapalı.
  mealAllowance: 0,
  transportAllowance: 0,
  // Aylık mesai hedefi (saat) — bordro kartında ilerleme çubuğu. 0 = kapalı.
  monthlyGoalHours: 0,
  // Bütçede kullanıcının kendi eklediği kategoriler: [{key, label, color}]
  customCategories: [],
  payDay: 10,
  payMonthOffset: 1,
  multipliers: { normal: 1.5, weekend: 2, holiday: 2 },
  weekendDays: [0],
  autoDetectType: true,
  defaultEntryMode: 'shift',
  theme: 'auto',
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
  // Mesai sırasındaki yemek molası — açıksa bu pencereyle kesişen süre
  // mesaiden düşülür. Varsayılan KAPALI: 18:00-21:00 çalışıldıysa mesai
  // 3 saat yazılır. Molası ödenmeyen bir işyeri için Ayarlar'dan açılabilir.
  breakWindow: { enabled: false, start: '18:30', end: '19:00' },
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
    expenses: [],
    // Sürekli giderler: [{id, label, amount, category, day, since, active}]
    // Her dönem için otomatik sanal harcama üretirler (budget.js).
    recurring: [],
    adjustments: [],
    // Krediler/borçlar: her ay taksiti bütçeden düşer, ödendikçe borç azalır.
    // [{id, label, amount, installments, firstPeriod, day, category, active}]
    loans: [],
    // Yatırım varlıkları: [{id, label, unit, color, currentPrice, priceUpdatedAt}]
    // Güncel fiyat ayarlarda değil burada durur — ayarlar toptan LWW ile
    // senkronlanıyor, telefonda güncellenen fiyat PC'nin ayar yazımıyla
    // kaybolmasın diye kayıt bazlı tutuluyor.
    assets: [],
    // Yatırım alımları (lot): [{id, assetId, date, quantity, unitCost, note}]
    // Her alım ayrı kayıt; ortalama maliyet hesaplanır, elle tutulmaz.
    investments: [],
    // Şirketin gerçekten ödediği tutarlar: [{id, periodKey, amount, note}]
    // Hesapla karşılaştırıp eksik ödeme yakalamak için.
    payslips: [],
    // Silinen kayıtların mezar taşları: { entries: { id: silinmeZamanı }, ... }
    // Senkronda "bu kayıt silindi mi yoksa karşı cihazda yeni mi eklendi?"
    // sorusunun tek cevabı bu. Olmazsa silinen kayıt diğer cihazdan geri gelir.
    tombstones: emptyTombstones(),
    // Ayarlar tek parça olarak en son yazan kazanır; zamanı burada.
    settingsUpdatedAt: null,
  };
}

const TOMBSTONE_COLLECTIONS = ['entries', 'expenses', 'recurring', 'adjustments', 'loans', 'payslips', 'assets', 'investments'];

function emptyTombstones() {
  return { entries: {}, expenses: {}, recurring: {}, adjustments: {}, loans: {}, payslips: {}, assets: {}, investments: {} };
}

function normalizeTombstones(raw) {
  const out = emptyTombstones();
  for (const coll of TOMBSTONE_COLLECTIONS) {
    const src = raw?.[coll];
    if (!src || typeof src !== 'object') continue;
    for (const [id, at] of Object.entries(src)) {
      if (typeof at === 'string') out[coll][id] = at;
    }
  }
  return out;
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
    customCategories: Array.isArray(settings?.customCategories) ? settings.customCategories : [],
    salaryHistory: Array.isArray(settings?.salaryHistory) ? settings.salaryHistory : [],
    weeklySchedule: mergeWeeklySchedule(settings?.weeklySchedule),
    breakWindow: { ...DEFAULT_SETTINGS.breakWindow, ...(settings?.breakWindow || {}) },
  };
}

// İleride şema değişirse buraya sürüm-sürüm migration adımları eklenir.
function migrate(raw) {
  const state = { ...defaultState(), ...raw };
  state.settings = mergeSettings(raw?.settings);
  // v2: mola düşme varsayılan olarak açıktı; 18:00-21:00 mesaisi 2,5 saat
  // görünüyordu. Beklenen 3 saat olduğu için bir kereliğine kapatılır.
  // Ayarlar'dan tekrar açılırsa (şema artık 2) bir daha dokunulmaz.
  if ((Number(raw?.schemaVersion) || 1) < 2) {
    state.settings.breakWindow = { ...state.settings.breakWindow, enabled: false };
  }
  state.entries = Array.isArray(raw?.entries) ? raw.entries : [];
  state.expenses = Array.isArray(raw?.expenses) ? raw.expenses : [];
  state.recurring = Array.isArray(raw?.recurring) ? raw.recurring : [];
  state.adjustments = Array.isArray(raw?.adjustments) ? raw.adjustments : [];
  state.loans = Array.isArray(raw?.loans) ? raw.loans : [];
  state.payslips = Array.isArray(raw?.payslips) ? raw.payslips : [];
  state.assets = migrateAssets(Array.isArray(raw?.assets) ? raw.assets : [], Number(raw?.schemaVersion) || 1);
  state.investments = Array.isArray(raw?.investments) ? raw.investments : [];
  state.tombstones = normalizeTombstones(raw?.tombstones);
  state.settingsUpdatedAt = typeof raw?.settingsUpdatedAt === 'string' ? raw.settingsUpdatedAt : null;
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}

// v3: varlıklara tür (kind) yazıldı. Tür; birimi ve formdaki soruları
// belirliyor — dövizin birimi "adet" olduğu için kartlarda "500 adet" gibi
// saçma bir metin çıkıyordu. Tutarlara ve alım kayıtlarına dokunulmaz.
function migrateAssets(assets, fromVersion) {
  return assets.map((asset) => {
    if (asset?.kind) return asset;
    const kind = inferKind(asset);
    const next = { ...asset, kind };
    // Birim yalnızca eski genel varsayılansa düzeltilir; kullanıcının elle
    // yazdığı birim ("USD", "çeyrek") olduğu gibi korunur.
    if (fromVersion < 3 && (!asset?.unit || asset.unit === 'adet') && kind !== 'diger') {
      const preset = PRESET_ASSETS.find((p) => p.label.toLocaleLowerCase('tr') === String(asset?.label || '').toLocaleLowerCase('tr'));
      const unit = preset?.unit || kindByKey(kind).defaultUnit;
      // Çeyrek/tam altın gerçekten "adet"tir; altında birim değiştirilmez.
      if (kind !== 'altin') next.unit = unit;
    }
    return next;
  });
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

// Kaydı listeden çıkarır ve yerine silinme zamanı bırakır.
function withTombstone(state, collection, id) {
  const at = new Date().toISOString();
  return {
    ...state,
    [collection]: state[collection].filter((r) => r.id !== id),
    tombstones: {
      ...state.tombstones,
      [collection]: { ...(state.tombstones?.[collection] || {}), [id]: at },
    },
  };
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
    this.update((s) => ({
      ...s,
      settings: mergeSettings({ ...s.settings, ...partial }),
      settingsUpdatedAt: new Date().toISOString(),
    }));
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
    this.update((s) => withTombstone(s, 'entries', id));
  }

  addExpense(expense) {
    const id = expense.id || `x_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const record = { ...expense, id, createdAt: expense.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, expenses: [...s.expenses, record] }));
    return record;
  }

  updateExpense(id, partial) {
    this.update((s) => ({
      ...s,
      expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...partial, updatedAt: new Date().toISOString() } : e)),
    }));
  }

  removeExpense(id) {
    this.update((s) => withTombstone(s, 'expenses', id));
  }

  addRecurring(def) {
    const id = def.id || `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const record = { active: true, ...def, id, createdAt: def.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, recurring: [...s.recurring, record] }));
    return record;
  }

  updateRecurring(id, partial) {
    this.update((s) => ({
      ...s,
      recurring: s.recurring.map((r) => (r.id === id ? { ...r, ...partial, updatedAt: new Date().toISOString() } : r)),
    }));
  }

  removeRecurring(id) {
    this.update((s) => withTombstone(s, 'recurring', id));
  }

  addAdjustment(adj) {
    const id = adj.id || `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const record = { ...adj, id, createdAt: adj.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, adjustments: [...s.adjustments, record] }));
    return record;
  }

  removeAdjustment(id) {
    this.update((s) => withTombstone(s, 'adjustments', id));
  }

  addLoan(loan) {
    const id = loan.id || `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const record = { active: true, ...loan, id, createdAt: loan.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, loans: [...s.loans, record] }));
    return record;
  }

  updateLoan(id, partial) {
    this.update((s) => ({
      ...s,
      loans: s.loans.map((l) => (l.id === id ? { ...l, ...partial, updatedAt: new Date().toISOString() } : l)),
    }));
  }

  // Bir döneme yalnızca tek bordro kaydı olur; varsa güncellenir.
  setPayslip(periodKey, partial) {
    const now = new Date().toISOString();
    this.update((s) => {
      const existing = s.payslips.find((p) => p.periodKey === periodKey);
      if (existing) {
        return { ...s, payslips: s.payslips.map((p) => (p.periodKey === periodKey ? { ...p, ...partial, updatedAt: now } : p)) };
      }
      const record = { id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, periodKey, ...partial, createdAt: now, updatedAt: now };
      return { ...s, payslips: [...s.payslips, record] };
    });
  }

  removePayslip(periodKey) {
    const found = this.state.payslips.find((p) => p.periodKey === periodKey);
    if (found) this.update((s) => withTombstone(s, 'payslips', found.id));
  }

  removeLoan(id) {
    // Krediye bağlı ara ödemeler normal harcamadır; silinmez, yalnızca
    // bağları kopar (para gerçekten harcanmıştır, bütçeden düşmeye devam eder).
    this.update((s) => {
      const next = withTombstone(s, 'loans', id);
      return {
        ...next,
        expenses: next.expenses.map((e) => (e.loanId === id ? { ...e, loanId: undefined, updatedAt: new Date().toISOString() } : e)),
      };
    });
  }

  addAsset(asset) {
    const id = asset.id || `as_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const record = { unit: 'adet', ...asset, id, createdAt: asset.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, assets: [...s.assets, record] }));
    return record;
  }

  updateAsset(id, partial) {
    this.update((s) => ({
      ...s,
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...partial, updatedAt: new Date().toISOString() } : a)),
    }));
  }

  // Fiyat güncellemesi ayrı: "en son ne zaman baktım" bilgisi de tazelenir.
  setAssetPrice(id, price) {
    this.updateAsset(id, { currentPrice: Number(price) || 0, priceUpdatedAt: new Date().toISOString() });
  }

  // Varlık silinince alımları da silinir — yetim lot kalmasın.
  removeAsset(id) {
    this.update((s) => {
      let next = withTombstone(s, 'assets', id);
      for (const lot of s.investments.filter((i) => i.assetId === id)) {
        next = withTombstone(next, 'investments', lot.id);
      }
      return next;
    });
  }

  addInvestment(lot) {
    const id = lot.id || `iv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const record = { ...lot, id, createdAt: lot.createdAt || now, updatedAt: now };
    this.update((s) => ({ ...s, investments: [...s.investments, record] }));
    return record;
  }

  updateInvestment(id, partial) {
    this.update((s) => ({
      ...s,
      investments: s.investments.map((i) => (i.id === id ? { ...i, ...partial, updatedAt: new Date().toISOString() } : i)),
    }));
  }

  removeInvestment(id) {
    this.update((s) => withTombstone(s, 'investments', id));
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

  // Buluta (gizli gist) yedeklendiğini damgalar — Yedekleme sayfasında gösterilir.
  markCloudBackedUp() {
    const now = new Date().toISOString();
    this.update((s) => ({ ...s, lastBackupAt: now, lastCloudBackupAt: now }));
  }

  validateImport(raw) {
    if (!raw || typeof raw !== 'object') return { valid: false, error: 'Geçersiz dosya formatı' };
    if (!Array.isArray(raw.entries)) return { valid: false, error: 'Kayıt listesi bulunamadı' };
    return {
      valid: true,
      entryCount: raw.entries.length,
      adjustmentCount: Array.isArray(raw.adjustments) ? raw.adjustments.length : 0,
      expenseCount: Array.isArray(raw.expenses) ? raw.expenses.length : 0,
      hasSettings: !!raw.settings,
    };
  }
}

export { LEGACY_STORAGE_KEY, SCHEMA_VERSION, DEFAULT_SETTINGS, TOMBSTONE_COLLECTIONS, emptyTombstones };
