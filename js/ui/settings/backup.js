import { showToast } from '../toast.js';
import { openSheet, closeSheet } from '../sheet.js';
import { downloadFile, csvForEntries } from '../exportUtils.js';
import { entryAmount } from '../../payroll.js';
import { profileName } from '../../profile.js';
import {
  getSyncConfig, setSyncConfig, clearSyncConfig,
  verifyToken, gistScopeProblem, sanitizeToken, pushBackup, pullBackup, backupFileName, SyncError,
} from '../../githubSync.js';
import { todayStamp } from './shared.js';

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

  container.innerHTML = `
    <div class="card">
      <p class="field__hint" style="margin-top:-4px; margin-bottom:6px;">Veriler yalnızca bu cihazda saklanır. Telefon değişikliğine veya tarayıcı temizliğine karşı arada bir yedek al.</p>
    </div>

    <div class="section-title">GitHub yedeği (gizli gist)</div>
    <div class="card" id="syncCard">
      ${connected ? `
        <div class="rows" style="margin-bottom:14px;">
          <div class="row">
            <span class="row__label">Durum</span>
            <span class="row__value is-positive">Bağlı</span>
          </div>
          <div class="row">
            <span class="row__label">Yedek dosyası</span>
            <span class="row__value">${backupFileName(ctx.profileId)}</span>
          </div>
          <div class="row">
            <span class="row__label">Son bulut yedeği</span>
            <span class="row__value">${formatWhen(state.lastCloudBackupAt) || 'Henüz yok'}</span>
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn--primary btn--sm" id="cloudSaveBtn" type="button">Kaydet</button>
          <button class="btn btn--secondary btn--sm" id="cloudLoadBtn" type="button">Getir</button>
        </div>
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
      setSyncConfig({ token });
      showToast(`${login} olarak bağlanıldı`);
      ctx.rerender();
    } catch (err) {
      // Token'ın kendisini asla gösterme; teşhis için uzunluk ve temizlenen
      // karakter sayısı yeterli (telefonda görünmez karakter yakalamak için).
      const diag = `\n\nTeşhis: girilen token ${token.length} karakter`
        + (removed > 0 ? `, yapıştırmadan ${removed} geçersiz karakter temizlendi` : '')
        + '. Classic token normalde 40 karakterdir.';
      reportError(err instanceof SyncError ? new SyncError(err.message + diag) : err);
      done();
    }
  });

  container.querySelector('#cloudSaveBtn')?.addEventListener('click', async () => {
    const { token, gistId } = getSyncConfig();
    const done = setBusy(container.querySelector('#cloudSaveBtn'), 'Kaydediliyor…');
    try {
      const result = await pushBackup({
        token,
        gistId,
        profileId: ctx.profileId,
        json: ctx.store.exportJSON(),
      });
      setSyncConfig({ gistId: result.gistId });
      ctx.store.markCloudBackedUp();
      showToast('Buluta kaydedildi');
      ctx.rerender();
    } catch (err) {
      reportError(err);
      done();
    }
  });

  container.querySelector('#cloudLoadBtn')?.addEventListener('click', async () => {
    const { token, gistId } = getSyncConfig();
    if (!gistId) {
      showToast('Önce bir kez "Kaydet" ile yedek oluştur');
      return;
    }
    const done = setBusy(container.querySelector('#cloudLoadBtn'), 'Getiriliyor…');
    try {
      const { json, updatedAt } = await pullBackup({ token, gistId, profileId: ctx.profileId });
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new SyncError('Yedek dosyası bozuk (geçersiz JSON)');
      }
      const check = ctx.store.validateImport(parsed);
      if (!check.valid) throw new SyncError(check.error || 'Yedek dosyası geçersiz');
      done();
      confirmCloudRestore(ctx, parsed, check, updatedAt);
    } catch (err) {
      reportError(err);
      done();
    }
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
