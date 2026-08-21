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
const LOGIN_KEY = 'mesai.sync.login';
const GIST_DESCRIPTION = 'Mesai Takip yedeği (gizli)';

export class SyncError extends Error {}

// Telefonda yapıştırırken klavye/pano görünmez karakter (zero-width space,
// yön işaretleri) veya satır sonu ekleyebiliyor; trim() bunların hepsini
// temizlemiyor ve GitHub token'ı tanımıyor. GitHub token'ları yalnızca
// [A-Za-z0-9_] içerir, gerisini atarız.
export function sanitizeToken(raw) {
  const input = String(raw ?? '');
  const token = input.replace(/[^A-Za-z0-9_]/g, '');
  return { token, removed: input.length - token.length };
}

export function backupFileName(profileId) {
  return `mesai-${profileId}.json`;
}

export function getSyncConfig() {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY) || '',
      gistId: localStorage.getItem(GIST_KEY) || '',
      login: localStorage.getItem(LOGIN_KEY) || '',
    };
  } catch {
    return { token: '', gistId: '', login: '' };
  }
}

export function setSyncConfig({ token, gistId, login }) {
  try {
    if (token !== undefined) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    }
    if (gistId !== undefined) {
      if (gistId) localStorage.setItem(GIST_KEY, gistId);
      else localStorage.removeItem(GIST_KEY);
    }
    if (login !== undefined) {
      if (login) localStorage.setItem(LOGIN_KEY, login);
      else localStorage.removeItem(LOGIN_KEY);
    }
  } catch {}
}

export function clearSyncConfig() {
  setSyncConfig({ token: '', gistId: '', login: '' });
}

// Kendi tahminimiz yerine GitHub'ın söylediğini de gösteririz; yanlış teşhis
// (ör. geçerli bir token'a "süresi dolmuş" demek) böylece ayıklanabilir.
function messageForStatus(status, githubMessage) {
  const detail = githubMessage ? ` GitHub: "${githubMessage}"` : '';
  if (status === 401) return `Token kabul edilmedi (401). Kopyalarken eksik/fazla karakter kalmış olabilir.${detail}`;
  if (status === 403) return `Yetki reddedildi (403). Token'da "gist" izni işaretli mi?${detail}`;
  if (status === 404) return `Bulunamadı (404). Token'da "gist" izni yoksa GitHub gist'leri de 404 döndürür.${detail}`;
  if (status === 422) return `GitHub isteği reddetti (422).${detail}`;
  if (status >= 500) return `GitHub şu an yanıt vermiyor (${status}), biraz sonra dene.`;
  return `GitHub hatası (${status}).${detail}`;
}

// Yanıt gövdesi + işe yarayan başlıklar birlikte döner.
async function ghRaw(path, { token, method = 'GET', body } = {}) {
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

  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok) throw new SyncError(messageForStatus(res.status, data?.message));

  // GitHub bu başlığı CORS'ta açığa çıkarır; classic token'ın izinlerini verir.
  // Fine-grained token'larda başlık hiç gelmez (gist API'sini desteklemezler).
  const rawScopes = res.headers.get('x-oauth-scopes');
  const scopes = rawScopes === null ? null : rawScopes.split(',').map((x) => x.trim()).filter(Boolean);
  return { data, scopes };
}

async function gh(path, opts) {
  const { data } = await ghRaw(path, opts);
  return data;
}

// Token'ı doğrular; kullanıcı adını ve izin listesini döner.
// scopes: dizi (classic token) veya null (başlık yok — muhtemelen fine-grained).
export async function verifyToken(token) {
  const { data, scopes } = await ghRaw('/user', { token });
  return { login: data.login, scopes };
}

// Token gist yedeklemesi için yeterli mi? Değilse nedenini açıklayan metin döner.
export function gistScopeProblem(scopes) {
  if (scopes === null) {
    return 'Bu token gist API\'sini desteklemiyor (büyük ihtimalle "fine-grained" token). '
      + 'Tokens (classic) altından yeni bir token oluşturup "gist" iznini işaretle.';
  }
  if (!scopes.includes('gist')) {
    const list = scopes.length ? scopes.join(', ') : 'hiçbiri';
    return `Token geçerli ama "gist" izni yok (mevcut izinler: ${list}). `
      + 'Yeni bir classic token oluştururken "gist" kutusunu işaretlemelisin.';
  }
  return null;
}

// Hesaptaki tüm gist'leri getirir (sayfa başına 100, en fazla 5 sayfa).
async function allGists(token) {
  const all = [];
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await ghRaw(`/gists?per_page=100&page=${page}`, { token });
    const chunk = Array.isArray(data) ? data : [];
    all.push(...chunk);
    if (chunk.length < 100) break;
  }
  return all;
}

// Hesapta duran BÜTÜN mesai yedeklerini listeler — profil adı tutmasa da
// görünür. "Telefonda kaydettim, PC'de yok" gibi durumlarda tek doğruyu
// gösteren yer burası: hangi hesapta ne var.
export async function listBackups({ token }) {
  const rows = [];
  for (const g of await allGists(token)) {
    for (const [file, meta] of Object.entries(g.files || {})) {
      const m = /^mesai-(.+)\.json$/.exec(file);
      if (!m) continue;
      rows.push({
        gistId: g.id,
        file,
        profileId: m[1],
        size: meta?.size ?? null,
        updatedAt: g.updated_at,
        htmlUrl: g.html_url,
      });
    }
  }
  rows.sort((a, b) => (String(a.updatedAt) < String(b.updatedAt) ? 1 : -1));
  return rows;
}

// Bu hesapta bu profilin yedeği hangi gist'te? gistId yalnızca kaydı yapan
// cihazda saklandığı için, ikinci cihaz yedeği ada göre bulmak zorunda —
// yoksa "önce kaydet" der ya da ikinci bir kopya gist açıp veriyi ikiye böler.
export async function findBackupGist({ token, profileId }) {
  const name = backupFileName(profileId);
  const rows = await listBackups({ token });
  const match = rows.find((r) => r.file === name);
  const otherBackups = [...new Set(rows.map((r) => r.file).filter((f) => f !== name))];
  return { gistId: match?.gistId || null, updatedAt: match?.updatedAt || null, otherBackups };
}

// Yedeği yükler. gistId bu cihazda yoksa önce hesapta aranır (aynı gist'e
// yazmak için), yoksa yeni bir gizli gist oluşturulur.
export async function pushBackup({ token, gistId, profileId, json }) {
  let id = gistId;
  if (!id) id = (await findBackupGist({ token, profileId })).gistId;

  const files = { [backupFileName(profileId)]: { content: json } };
  const gist = id
    ? await gh(`/gists/${id}`, { token, method: 'PATCH', body: { files } })
    : await gh('/gists', {
      token,
      method: 'POST',
      body: { description: GIST_DESCRIPTION, public: false, files },
    });
  return { gistId: gist.id, updatedAt: gist.updated_at, htmlUrl: gist.html_url };
}

// Yedeği indirir; JSON metnini ve gist'in güncellenme zamanını döner.
export async function pullBackup({ token, gistId, profileId }) {
  let id = gistId;
  if (!id) {
    const found = await findBackupGist({ token, profileId });
    if (!found.gistId) {
      const others = found.otherBackups.length
        ? ` Bu hesapta bulunan yedekler: ${found.otherBackups.join(', ')} — profili değiştirip tekrar dene.`
        : ' Yedeği alan cihazda bir kez "Kaydet" demelisin.';
      throw new SyncError(`Bu GitHub hesabında "${backupFileName(profileId)}" yedeği bulunamadı.${others}`);
    }
    id = found.gistId;
  }
  return readGistFile({ token, gistId: id, file: backupFileName(profileId) });
}

// Belirli bir gist'teki belirli dosyayı indirir. Profil adı eşleşmese de
// çalışır: kullanıcı listeden hangi yedeği seçtiyse onu getirebilsin.
export async function readGistFile({ token, gistId, file }) {
  const gist = await gh(`/gists/${gistId}`, { token });
  const entry = gist.files?.[file];
  if (!entry) {
    const others = Object.keys(gist.files || {}).join(', ') || 'yok';
    throw new SyncError(`Bu yedekte "${file}" dosyası yok. Gist'teki dosyalar: ${others}`);
  }
  // 1 MB üstü dosyalar kısaltılmış gelir; ham içeriği ayrıca çekilir.
  let content = entry.content;
  if (entry.truncated) {
    try {
      const raw = await fetch(entry.raw_url);
      if (!raw.ok) throw new Error();
      content = await raw.text();
    } catch {
      throw new SyncError('Yedek çok büyük ve indirilemedi.');
    }
  }
  return { json: content, updatedAt: gist.updated_at, gistId };
}
