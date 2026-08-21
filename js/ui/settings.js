import { showToast } from './toast.js';
import { downloadFile, csvForEntries } from './exportUtils.js';
import { parseLocaleNumber, formatMoney } from '../format.js';
import { hourlyRate, entryAmount } from '../payroll.js';
import { openSheet, closeSheet } from './sheet.js';

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
// JS getDay(): 0=Pazar..6=Cmt. Ekranda Pazartesi'den başlatmak için eşleme.
const WEEKDAY_JS_VALUES = [1, 2, 3, 4, 5, 6, 0];

export function renderSettings(container, state, ctx) {
  const settings = state.settings;
  const rate = hourlyRate(settings);

  container.innerHTML = `
    <div class="section-title">Maaş</div>
    <div class="card">
      <div class="field">
        <label class="field__label">Aylık net maaş</label>
        <input class="input" type="text" inputmode="decimal" id="salaryInput" value="${settings.monthlySalary || ''}" placeholder="ör. 30000" />
      </div>
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">Saat böleni</label>
        <input class="input" type="text" inputmode="decimal" id="divisorInput" value="${settings.hoursDivisor}" />
        <div class="field__hint">30 gün × günlük 7,5 saat = 225 (varsayılan)</div>
      </div>
      <div class="preview-strip" style="margin-top:14px; margin-bottom:0;">
        <span class="preview-strip__label">Saat ücretin</span>
        <span class="preview-strip__value" id="rateDisplay">${formatMoney(rate)}</span>
      </div>
    </div>

    <div class="section-title">Mesai çarpanları</div>
    <div class="card">
      <div class="input-row">
        <div class="field">
          <label class="field__label">Normal</label>
          <input class="input" type="text" inputmode="decimal" id="multNormal" value="${settings.multipliers.normal}" />
        </div>
        <div class="field">
          <label class="field__label">Hafta tatili</label>
          <input class="input" type="text" inputmode="decimal" id="multWeekend" value="${settings.multipliers.weekend}" />
        </div>
        <div class="field">
          <label class="field__label">Resmi tatil</label>
          <input class="input" type="text" inputmode="decimal" id="multHoliday" value="${settings.multipliers.holiday}" />
        </div>
      </div>
      <div class="switch-row">
        <div>
          <div class="switch-row__label">Otomatik tür tahmini</div>
          <div class="switch-row__hint">Hafta tatili / resmi tatil önerisi</div>
        </div>
        <button class="switch ${settings.autoDetectType ? 'is-on' : ''}" id="autoDetectSwitch" type="button" aria-label="Otomatik tür tahmini"></button>
      </div>
    </div>

    <div class="section-title">Dönem ve ödeme</div>
    <div class="card">
      <div class="input-row">
        <div class="field">
          <label class="field__label">Ödeme günü</label>
          <select class="input" id="payDaySelect">${dayOptions(settings.payDay)}</select>
        </div>
        <div class="field">
          <label class="field__label">Ne zaman öder</label>
          <select class="input" id="payOffsetSelect">
            <option value="0" ${settings.payMonthOffset === 0 ? 'selected' : ''}>Aynı ay</option>
            <option value="1" ${settings.payMonthOffset === 1 ? 'selected' : ''}>Sonraki ay</option>
            <option value="2" ${settings.payMonthOffset === 2 ? 'selected' : ''}>2 ay sonra</option>
          </select>
        </div>
      </div>
      <label class="field__label">Hafta tatili günleri</label>
      <div class="chips" id="weekendDaysChips" style="margin-top:8px;">
        ${WEEKDAY_LABELS.map((label, i) => {
          const jsVal = WEEKDAY_JS_VALUES[i];
          const active = settings.weekendDays.includes(jsVal);
          return `<button class="quick-chip" data-day="${jsVal}" type="button" style="${active ? 'background:var(--accent-soft); color:var(--accent-strong); border-color:transparent;' : ''}">${label}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="section-title">Görünüm</div>
    <div class="card">
      <label class="field__label">Mesai giriş varsayılanı</label>
      <div class="segmented" id="entryModeSegmented" style="margin-bottom:16px;">
        <button class="segmented__item ${settings.defaultEntryMode === 'hours' ? 'is-active' : ''}" data-mode="hours" type="button">Saat</button>
        <button class="segmented__item ${settings.defaultEntryMode === 'range' ? 'is-active' : ''}" data-mode="range" type="button">Aralık</button>
      </div>
      <label class="field__label">Tema</label>
      <div class="segmented" id="themeSegmented">
        <button class="segmented__item ${settings.theme === 'auto' ? 'is-active' : ''}" data-theme="auto" type="button">Otomatik</button>
        <button class="segmented__item ${settings.theme === 'light' ? 'is-active' : ''}" data-theme="light" type="button">Açık</button>
        <button class="segmented__item ${settings.theme === 'dark' ? 'is-active' : ''}" data-theme="dark" type="button">Koyu</button>
      </div>
    </div>

    <div class="section-title">Yedekleme</div>
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

  wireSalary(container, ctx, settings);
  wireMultipliers(container, ctx, settings);
  wirePeriodSettings(container, ctx, settings);
  wireAppearance(container, ctx, settings);
  wireBackup(container, ctx, state);
  wireDangerZone(container, ctx);
}

function commitNumberOnChange(input, onCommit) {
  input.addEventListener('change', () => {
    const value = parseLocaleNumber(input.value);
    if (Number.isFinite(value) && value >= 0) onCommit(value);
  });
}

function wireSalary(container, ctx, settings) {
  const salaryInput = container.querySelector('#salaryInput');
  const divisorInput = container.querySelector('#divisorInput');
  const rateDisplay = container.querySelector('#rateDisplay');

  function livePreview() {
    const salary = parseLocaleNumber(salaryInput.value) || 0;
    const divisor = parseLocaleNumber(divisorInput.value) || 225;
    rateDisplay.textContent = formatMoney(hourlyRate({ monthlySalary: salary, hoursDivisor: divisor }));
  }
  salaryInput.addEventListener('input', livePreview);
  divisorInput.addEventListener('input', livePreview);

  commitNumberOnChange(salaryInput, (v) => ctx.store.updateSettings({ monthlySalary: v }));
  commitNumberOnChange(divisorInput, (v) => ctx.store.updateSettings({ hoursDivisor: v || 225 }));
}

function wireMultipliers(container, ctx, settings) {
  const map = { multNormal: 'normal', multWeekend: 'weekend', multHoliday: 'holiday' };
  for (const [id, key] of Object.entries(map)) {
    const input = container.querySelector(`#${id}`);
    commitNumberOnChange(input, (v) => {
      ctx.store.updateSettings({ multipliers: { ...ctx.store.getState().settings.multipliers, [key]: v } });
    });
  }
  container.querySelector('#autoDetectSwitch').addEventListener('click', () => {
    ctx.store.updateSettings({ autoDetectType: !settings.autoDetectType });
  });
}

function wirePeriodSettings(container, ctx, settings) {
  container.querySelector('#payDaySelect').addEventListener('change', (e) => {
    ctx.store.updateSettings({ payDay: Number(e.target.value) });
  });
  container.querySelector('#payOffsetSelect').addEventListener('change', (e) => {
    ctx.store.updateSettings({ payMonthOffset: Number(e.target.value) });
  });
  container.querySelector('#weekendDaysChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-day]');
    if (!chip) return;
    const day = Number(chip.dataset.day);
    const current = settings.weekendDays;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    ctx.store.updateSettings({ weekendDays: next });
  });
}

function wireAppearance(container, ctx, settings) {
  container.querySelector('#entryModeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    ctx.store.updateSettings({ defaultEntryMode: btn.dataset.mode });
  });
  container.querySelector('#themeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    ctx.store.updateSettings({ theme: btn.dataset.theme });
  });
}

function wireBackup(container, ctx, state) {
  container.querySelector('#exportJsonRow').addEventListener('click', () => {
    downloadFile(`mesai-yedek-${todayStamp()}.json`, ctx.store.exportJSON(), 'application/json');
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

function wireDangerZone(container, ctx) {
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

function dayOptions(selected) {
  let html = '';
  for (let d = 1; d <= 31; d++) {
    html += `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}</option>`;
  }
  return html;
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
