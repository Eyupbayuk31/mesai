import { showToast } from '../toast.js';
import { openSheet, closeSheet } from '../sheet.js';
import { downloadFile, csvForEntries } from '../exportUtils.js';
import { entryAmount } from '../../payroll.js';
import { todayStamp } from './shared.js';

export const title = 'Yedekleme';

export function render(container, state, ctx) {
  container.innerHTML = `
    <div class="card">
      <p class="field__hint" style="margin-top:-4px; margin-bottom:6px;">Veriler yalnızca bu cihazda saklanır. Telefon değişikliğine veya tarayıcı temizliğine karşı arada bir yedek al.</p>
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
