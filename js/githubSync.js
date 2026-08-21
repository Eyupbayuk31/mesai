// Gizli (secret) Gist üzerinden bulut yedeği.
//
// GÜVENLİK: Token asla koda veya repoya girmez — kullanıcı uygulama içinde
// girer, yalnızca kendi cihazının localStorage'ında durur. Gerekli yetki
// GitHub "classic" token'da SADECE `gist` iznidir; bu izin repolara erişemez.
//
// Her profil gist içinde kendi dosyasında tutulur (mesai-eyup.json gibi).
// Kaydet hep aynı dosya adına yazar; GitHub o dosyanın içeriğini değiştirir,
// yani eski yedek birikmez — istenen "eskisini sil" davranışı budur.

const API = 'https://api.github.com';
const TOKEN_KEY = 'mesai.sync.token';
const GIST_KEY = 'mesai.sync.gistId';
const GIST_DESCRIPTION = 'Mesai Takip yedeği (gizli)';

export class SyncError extends Error {}

export function backupFileName(profileId) {
  return `mesai-${profileId}.json`;
}

export function getSyncConfig() {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY) || '',
      gistId: localStorage.getItem(GIST_KEY) || '',
    };
  } catch {
    return { token: '', gistId: '' };
  }
}

export function setSyncConfig({ token, gistId }) {
  try {
    if (token !== undefined) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    }
    if (gistId !== undefined) {
      if (gistId) localStorage.setItem(GIST_KEY, gistId);
      else localStorage.removeItem(GIST_KEY);
    }
  } catch {}
}

export function clearSyncConfig() {
  setSyncConfig({ token: '', gistId: '' });
}

function messageForStatus(status) {
  if (status === 401) return 'Token geçersiz veya süresi dolmuş. Ayarlardan yeni token gir.';
  if (status === 403) return 'Yetki reddedildi. Token\'da "gist" izni işaretli mi?';
  if (status === 404) return 'Yedek bulunamadı — gist silinmiş olabilir. Bağlantıyı kesip yeniden kaydet.';
  if (status === 422) return 'GitHub isteği reddetti (geçersiz içerik).';
  if (status >= 500) return 'GitHub şu an yanıt vermiyor, biraz sonra dene.';
  return `GitHub hatası (${status}).`;
}

async function gh(path, { token, method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError('İnternet bağlantısı yok gibi görünüyor.');
  }
  if (!res.ok) throw new SyncError(messageForStatus(res.status));
  return res.json();
}

// Token'ı doğrular ve hesabın kullanıcı adını döner.
export async function verifyToken(token) {
  const me = await gh('/user', { token });
  return me.login;
}

// Yedeği yükler. gistId yoksa gizli bir gist oluşturur ve id'sini döner.
export async function pushBackup({ token, gistId, profileId, json }) {
  const files = { [backupFileName(profileId)]: { content: json } };
  const gist = gistId
    ? await gh(`/gists/${gistId}`, { token, method: 'PATCH', body: { files } })
    : await gh('/gists', {
      token,
      method: 'POST',
      body: { description: GIST_DESCRIPTION, public: false, files },
    });
  return { gistId: gist.id, updatedAt: gist.updated_at, htmlUrl: gist.html_url };
}

// Yedeği indirir; JSON metnini ve gist'in güncellenme zamanını döner.
export async function pullBackup({ token, gistId, profileId }) {
  const gist = await gh(`/gists/${gistId}`, { token });
  const name = backupFileName(profileId);
  const file = gist.files?.[name];
  if (!file) {
    const others = Object.keys(gist.files || {}).join(', ') || 'yok';
    throw new SyncError(`Bu yedekte "${name}" dosyası yok. Gist'teki dosyalar: ${others}`);
  }
  // 1 MB üstü dosyalar kısaltılmış gelir; ham içeriği ayrıca çekilir.
  let content = file.content;
  if (file.truncated) {
    try {
      const raw = await fetch(file.raw_url);
      if (!raw.ok) throw new Error();
      content = await raw.text();
    } catch {
      throw new SyncError('Yedek çok büyük ve indirilemedi.');
    }
  }
  return { json: content, updatedAt: gist.updated_at };
}
