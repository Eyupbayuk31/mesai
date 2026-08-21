// Basit yerel profil seçimi (login değil): cihazda hangi kullanıcının
// kullandığını hatırlar, her profilin verisi store.js'te ayrı anahtarda durur.

const ACTIVE_PROFILE_KEY = 'mesai.activeProfile';

export const PROFILES = [
  { id: 'eyup', name: 'Eyüp' },
  { id: 'fuat', name: 'Fuat' },
];

export function getActiveProfile() {
  try {
    const id = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
    return PROFILES.some((p) => p.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function setActiveProfile(id) {
  try { window.localStorage.setItem(ACTIVE_PROFILE_KEY, id); } catch {}
}

export function clearActiveProfile() {
  try { window.localStorage.removeItem(ACTIVE_PROFILE_KEY); } catch {}
}

export function profileName(id) {
  return PROFILES.find((p) => p.id === id)?.name || id;
}
