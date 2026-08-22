import { showToast } from '../toast.js';
import { openSheet, closeSheet } from '../sheet.js';
import { downloadFile, csvForEntries } from '../exportUtils.js';
import { entryAmount } from '../../payroll.js';
import { profileName } from '../../profile.js';
import {
  getSyncConfig, setSyncConfig, clearSyncConfig,
  verifyToken, gistScopeProblem, sanitizeToken, describeTokenKind, backupFileName,
  findBackupGist, listBackups, readGistFile, SyncError,
} from '../../githubSync.js';
import { todayStamp } from './shared.js';
import { readStatus, relativeTime } from '../../sync/engine.js';

export const title = 'Yedekleme';

function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function render(container, state, ctx) {
  const sync = getSyncConfig();
  const connected = !!sync.token;
  const status = readStatus();

  container.innerHTML = `
    <div class="card">
      <p class="field__hint" style="margin-top:-4px; margin-bottom:6px;">${connected
        ? 'Veriler bu cihazda tutulur ve GitHub yedeğiyle otomatik senkronlanır. Telefon ve bilgisayar aynı veriyi görür.'
        : 'Veriler yalnızca bu cihazda saklanır. Telefon değişikliğine veya tarayıcı temizliğine karşı GitHub senkronunu aç.'}</p>
    </div>

    <div class="section-title">GitHub yedeği (gizli gist)</div>
    <div class="card" id="syncCard">
      ${connected ? `
        <div class="rows" style="margin-bottom:14px;">
          <div class="row">
            <span class="row__label">Durum</span>
            <span class="row__value ${statusClass(status)}">${escapeHTML(statusLabel(status))}</span>
          </div>
          <div class="row">
            <span class="row__label">GitHub hesabı</span>
            <span class="row__value">${sync.login ? '@' + escapeHTML(sync.login) : 'Bağlı'}</span>
          </div>
          <div class="row">
            <span class="row__label">Yedek dosyası</span>
            <span class="row__value">${backupFileName(ctx.profileId)}</span>
          </div>
        </div>
        ${status.message ? `<p class="field__hint" style="margin:-6px 0 12px;">${escapeHTML(status.message)}</p>` : ''}
        <p class="field__hint" style="margin:-2px 0 12px;">
          Senkron otomatik: uygulamayı her açtığında ve veri girdiğinde bulutla
          karşılıklı birleşir. İki cihazda ayrı ayrı girdiklerin birbirini silmez.
        </p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn--primary btn--sm" id="cloudSyncBtn" type="button">Şimdi senkronla</button>
        </div>
        ${sync.gistId ? '' : `
          <p class="field__hint" style="margin:10px 0 0;">
            Bu cihazda kayıtlı yedek yok. Başka cihazda aldıysan
            <b>Getir</b> hesabındaki <b>${backupFileName(ctx.profileId)}</b> yedeğini bulur.
          </p>
        `}
        <div class="link-row" id="cloudListRow" style="margin-top:12px;"><span>Buluttaki yedekleri gör</span><span class="link-row__chevron">›</span></div>
        <button class="btn btn--ghost btn--sm" id="cloudDisconnectBtn" type="button" style="margin-top:8px;">Bağlantıyı kes</button>
      ` : `
        <p class="field__hint" style="margin:-4px 0 14px;">
          Yedeğin gizli bir GitHub gist'ine yazılır; ${profileName(ctx.profileId)} profili
          <b>${backupFileName(ctx.profileId)}</b> dosyasında tutulur. Her "Kaydet" aynı dosyanın
          üstüne yazar, eski yedek birikmez.
        </p>
        <div class="field">
          <label class="field__label">GitHub token</label>
          <input class="input" type="password" id="syncToken" placeholder="ghp_..." autocomplete="off" spellcheck="false" />
          <div class="field__hint">
            github.com → Settings → Developer settings → Personal access tokens →
            <b>Tokens (classic)</b> → Generate new token. Yetkilerden <b>yalnızca “gist”</b>
            kutusunu işaretle. Bu izin repolarına erişemez.
          </div>
        </div>
        <button class="btn btn--primary btn--sm" id="cloudConnectBtn" type="button">Bağlan</button>
      `}
    </div>

    <div class="card">
      <div class="link-row" id="exportJsonRow"><span>JSON olarak dışa aktar</span><span class="link-row__chevron">›</span></div>
      <div class="link-row" id="importJsonRow"><span>JSON'dan geri yükle</span><span class="link-row__chevron">›</span></div>
      <div class="link-row" id="exportCsvRow"><span>Tüm kayıtları CSV indir</span><span class="link-row__chevron">›</span></div>
      <input type="file" id="importFileInput" accept="application/json" hidden />
    </div>

    <div class="section-title">Tehlikeli bölge</div>
    <div class="card">
      <div class="link-row link-row--danger" id="resetAllRow"><span>Tüm veriyi sil</span><span class="link-row__chevron">›</span></div>
    </div>
  `;

  wireCloudSync(container, state, ctx);

  container.querySelector('#exportJsonRow').addEventListener('click', () => {
    downloadFile(`mesai-yedek-${todayStamp()}.json`, ctx.store.exportJSON(), 'application/json');
    ctx.store.markBackedUp();
    showToast('JSON indirildi');
  });

  container.querySelector('#exportCsvRow').addEventListener('click', () => {
    const csv = csvForEntries(state.entries, state.settings, entryAmount);
    downloadFile(`mesai-tum-kayitlar-${todayStamp()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    showToast('CSV indirildi');
  });

  const fileInput = container.querySelector('#importFileInput');
  container.querySelector('#importJsonRow').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        showToast('Dosya okunamadı: geçersiz JSON');
        fileInput.value = '';
        return;
      }
      const result = ctx.store.validateImport(parsed);
      if (!result.valid) {
        showToast(result.error || 'Geçersiz yedek dosyası');
        fileInput.value = '';
        return;
      }
      confirmImport(ctx, parsed, result, fileInput);
    };
    reader.readAsText(file);
  });

  container.querySelector('#resetAllRow').addEventListener('click', () => {
    openSheet({
      title: 'Tüm veriyi sil',
      footerHTML: `<button class="btn btn--danger" id="confirmResetBtn" type="button">Evet, hepsini sil</button>`,
      build(bodyEl, footerEl) {
        bodyEl.innerHTML = `<p style="font-size:14.5px; color:var(--text-secondary); line-height:1.5;">Tüm mesai kayıtların, ek kalemlerin ve ayarların silinecek. Bu işlem geri alınamaz. Önce yedek almanı öneririz.</p>`;
        footerEl.querySelector('#confirmResetBtn').addEventListener('click', () => {
          ctx.store.reset();
          showToast('Tüm veriler silindi');
          closeSheet();
          ctx.setTab('home');
        });
      },
    });
  });
}

// --- GitHub (gizli gist) yedeği ---

function wireCloudSync(container, state, ctx) {
  const setBusy = (btn, label) => {
    if (!btn) return () => {};
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    return () => { btn.disabled = false; btn.textContent = original; };
  };

  // Hata mesajlarını tek yerden geçir: SyncError'lar kullanıcıya gösterilebilir,
  // beklenmedik hatalar genel mesaja düşer.
  const reportError = (err) => {
    if (err instanceof SyncError) showLongMessage('Bağlantı hatası', err.message);
    else showToast('Beklenmedik bir hata oldu');
  };

  container.querySelector('#cloudConnectBtn')?.addEventListener('click', async () => {
    const input = container.querySelector('#syncToken');
    const { token, removed } = sanitizeToken(input.value);
    if (!token) {
      showToast('Token girmelisin');
      input.focus();
      return;
    }
    const done = setBusy(container.querySelector('#cloudConnectBtn'), 'Bağlanıyor…');
    try {
      const { login, scopes } = await verifyToken(token);
      // Token geçerli olsa bile "gist" izni yoksa Kaydet ilerde patlar;
      // sorunu burada, net biçimde söyleyip bağlanmayı reddediyoruz.
      const problem = gistScopeProblem(scopes);
      if (problem) {
        showLongMessage('Token yetersiz', `${login} olarak doğrulandı, ancak ${problem}`);
        done();
        return;
      }
      setSyncConfig({ token, login });
      // Bağlanır bağlanmaz hesapta yedek var mı diye bakılır: kullanıcı
      // "Getir"e basmadan da diğer cihazdaki yedeğin görüldüğünü anlar.
      let found = null;
      try {
        found = await findBackupGist({ token, profileId: ctx.profileId });
        if (found.gistId) setSyncConfig({ gistId: found.gistId });
      } catch {}
      showToast(found?.gistId
        ? `${login} olarak bağlanıldı — bulutta yedek bulundu`
        : `${login} olarak bağlanıldı`);
      // Motor açılışta token yokken "kapalı" başlamıştı; şimdi devreye girsin.
      ctx.sync?.restart();
      ctx.rerender();
    } catch (err) {
      // Token'ın kendisini asla gösterme; teşhis için uzunluk ve temizlenen
      // karakter sayısı yeterli (telefonda görünmez karakter yakalamak için).
      const kind = describeTokenKind(token);
      const diag = `\n\nTeşhis: ${token.length} karakter, tür: ${kind.kind}`
        + (removed > 0 ? `, yapıştırmadan ${removed} geçersiz karakter temizlendi` : '')
        + `.\n${kind.text}`;
      reportError(err instanceof SyncError ? new SyncError(err.message + diag) : err);
      done();
    }
  });

  container.querySelector('#cloudSyncBtn')?.addEventListener('click', async () => {
    const done = setBusy(container.querySelector('#cloudSyncBtn'), 'Senkronlanıyor…');
    const result = await ctx.syncNow('elle');
    done();
    showToast(result?.state === 'error' ? (result.message || 'Senkron başarısız') : (result?.message || 'Senkronlandı'));
    ctx.rerender();
  });

  container.querySelector('#cloudListRow')?.addEventListener('click', async () => {
    const { token } = getSyncConfig();
    openSheet({
      title: 'Buluttaki yedekler',
      build(bodyEl) {
        bodyEl.innerHTML = `<p class="field__hint" style="margin:0;">Hesap taranıyor…</p>`;
        listBackups({ token })
          .then((rows) => renderBackupList(bodyEl, rows, ctx, token))
          .catch((err) => {
            bodyEl.innerHTML = `<p style="font-size:14px; color:var(--danger); line-height:1.5;">
              ${escapeHTML(err instanceof SyncError ? err.message : 'Liste alınamadı')}</p>`;
          });
      },
    });
  });

  container.querySelector('#cloudDisconnectBtn')?.addEventListener('click', () => {
    openSheet({
      title: 'Bağlantıyı kes',
      footerHTML: `<button class="btn btn--danger" id="confirmDisconnectBtn" type="button">Bağlantıyı kes</button>`,
      build(bodyEl, footerEl) {
        bodyEl.innerHTML = `<p style="font-size:14.5px; color:var(--text-secondary); line-height:1.5;">
          Token bu cihazdan silinecek. Buluttaki yedek <b style="color:var(--text);">silinmez</b>;
          aynı token'la tekrar bağlanıp "Getir" diyebilirsin.
        </p>`;
        footerEl.querySelector('#confirmDisconnectBtn').addEventListener('click', () => {
          clearSyncConfig();
          ctx.sync?.restart();
          showToast('Bağlantı kesildi');
          closeSheet();
          ctx.rerender();
        });
      },
    });
  });
}

// Uzun teşhis metinleri toast'ta kesilir; okunabilir bir sayfada gösterilir.
function showLongMessage(title, message) {
  openSheet({
    title,
    footerHTML: `<button class="btn btn--secondary" id="closeMsgBtn" type="button">Tamam</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `<p style="font-size:14.5px; color:var(--text-secondary); line-height:1.6;">${escapeHTML(message)}</p>`;
      footerEl.querySelector('#closeMsgBtn').addEventListener('click', () => closeSheet());
    },
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function confirmCloudRestore(ctx, parsed, check, updatedAt) {
  const when = formatWhen(updatedAt);
  openSheet({
    title: 'Yedeği getir',
    footerHTML: `<button class="btn btn--primary" id="confirmCloudBtn" type="button">Getir ve değiştir</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p style="font-size:14.5px; color:var(--text-secondary); line-height:1.5;">
          ${when ? `<b style="color:var(--text);">${when}</b> tarihli yedekte ` : 'Yedekte '}
          <b style="color:var(--text);">${check.entryCount} mesai kaydı</b>,
          <b style="color:var(--text);">${check.expenseCount} harcama</b> ve
          <b style="color:var(--text);">${check.adjustmentCount} ek kalem</b> var.
          Getirirsen bu cihazdaki mevcut verinin yerini alacak.
        </p>
      `;
      footerEl.querySelector('#confirmCloudBtn').addEventListener('click', () => {
        ctx.store.replaceAll(parsed);
        showToast('Yedek geri yüklendi');
        closeSheet();
      });
    },
  });
}

function confirmImport(ctx, parsed, result, fileInput) {
  openSheet({
    title: 'Geri yükleme onayı',
    footerHTML: `<button class="btn btn--primary" id="confirmImportBtn" type="button">İçe aktar</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p style="font-size:14.5px; color:var(--text-secondary); line-height:1.5;">
          Bu dosyada <b style="color:var(--text);">${result.entryCount} mesai kaydı</b> ve
          <b style="color:var(--text);">${result.adjustmentCount} ek kalem</b> var.
          İçe aktarırsan cihazdaki mevcut verinin yerini alacak.
        </p>
      `;
      footerEl.querySelector('#confirmImportBtn').addEventListener('click', () => {
        ctx.store.replaceAll(parsed);
        showToast('Veriler içe aktarıldı');
        closeSheet();
        fileInput.value = '';
      });
    },
    onClose() { fileInput.value = ''; },
  });
}

// Hesaptaki her yedeği tek tek gösterir: hangi profil, ne zaman, hangi gist.
// Profil adı bu cihazdakiyle tutmasa bile getirilebilir — asıl amaç "telefonda
// kaydettim, PC'de yok" ikilemini gözle görülür veriye çevirmek.
function renderBackupList(bodyEl, rows, ctx, token) {
  const mine = backupFileName(ctx.profileId);
  if (rows.length === 0) {
    bodyEl.innerHTML = `
      <p style="font-size:14.5px; color:var(--text-secondary); line-height:1.6;">
        Bu GitHub hesabında <b style="color:var(--text);">hiç mesai yedeği yok</b>.
        Kaydeden cihaz büyük ihtimalle <b style="color:var(--text);">başka bir GitHub
        hesabının</b> token'ıyla bağlı. O cihazda Ayarlar → Yedekleme'yi açıp hangi
        hesapla bağlı olduğuna bak; iki cihazda da aynı hesabın token'ı olmalı.
      </p>`;
    return;
  }
  bodyEl.innerHTML = `
    <p class="field__hint" style="margin:0 0 12px;">
      Bu cihaz <b>${escapeHTML(profileName(ctx.profileId))}</b> profilinde
      (<b>${escapeHTML(mine)}</b>). Aşağıdaki yedeklerden istediğini getirebilirsin.
    </p>
    <ul class="list">
      ${rows.map((r, i) => `
        <li class="list__item" style="display:flex; align-items:center; gap:12px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:14.5px;">
              ${escapeHTML(r.file)}${r.file === mine ? ' <span class="is-positive">· bu profil</span>' : ''}
            </div>
            <div class="field__hint" style="margin:2px 0 0;">
              ${escapeHTML(formatWhen(r.updatedAt) || 'tarih yok')}${r.size ? ` · ${Math.round(r.size / 1024)} KB` : ''}
            </div>
          </div>
          <button class="btn btn--secondary btn--sm" data-row="${i}" type="button">Getir</button>
        </li>
      `).join('')}
    </ul>
  `;

  bodyEl.querySelector('.list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-row]');
    if (!btn) return;
    const row = rows[Number(btn.dataset.row)];
    btn.disabled = true;
    btn.textContent = 'Getiriliyor…';
    try {
      const { json, updatedAt } = await readGistFile({ token, gistId: row.gistId, file: row.file });
      const parsed = JSON.parse(json);
      const check = ctx.store.validateImport(parsed);
      if (!check.valid) throw new SyncError(check.error || 'Yedek dosyası geçersiz');
      // Getirilen yedek bu profilinse, sonraki Kaydet'ler aynı gist'e gitsin.
      if (row.file === backupFileName(ctx.profileId)) setSyncConfig({ gistId: row.gistId });
      closeSheet();
      setTimeout(() => confirmCloudRestore(ctx, parsed, check, updatedAt), 220);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Getir';
      showToast(err instanceof SyncError ? err.message : 'Yedek okunamadı');
    }
  });
}

const STATUS_LABELS = {
  syncing: 'Senkronlanıyor…',
  pending: 'Değişiklik bekliyor',
  offline: 'İnternet yok',
  error: 'Hata',
  off: 'Kapalı',
};

function statusLabel(status) {
  if (status.state === 'ok') {
    const when = relativeTime(status.lastSyncAt);
    return when ? `Senkron: ${when}` : 'Senkron edildi';
  }
  return STATUS_LABELS[status.state] || 'Bekliyor';
}

function statusClass(status) {
  if (status.state === 'error' || status.state === 'offline') return 'is-negative';
  if (status.state === 'ok') return 'is-positive';
  return '';
}
