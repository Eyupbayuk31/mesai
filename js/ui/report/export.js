// Dışa aktarma: kart, kapsam seçimi ve indirme.
//
// Kapsam artık seçili AYA değil YILA dayanıyor — rapor sayfaları yıl
// kapsamına geçti. İçinde bulunulan yıldaysak "bu dönem" bugünün ayı,
// geçmiş bir yıldaysak o yılın aralığı esas alınır.

import { currentPeriodKey, periodLabel, shiftPeriod } from '../../period.js';
import { periodSummary, yearSummary, entryAmount } from '../../payroll.js';
import { profileName } from '../../profile.js';
import { openSheet, closeSheet } from '../sheet.js';
import { showToast } from '../toast.js';
import { downloadFile, csvForEntries } from '../exportUtils.js';
import { buildHtmlReport } from '../htmlReport.js';

export function exportCardHTML() {
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Dışa aktar</span></div>
    <div class="card">
      <p class="field__hint" style="margin:-2px 0 12px;">
        HTML raporu yazdırılabilir ve paylaşılabilir; CSV yılın tüm mesai
        kayıtlarını, JSON ise verinin tamamını verir.
      </p>
      <div class="adj-actions">
        <button class="btn btn--primary btn--sm" id="exportHtml" type="button">HTML rapor indir</button>
        <button class="btn btn--secondary btn--sm" id="exportCsv" type="button">CSV indir</button>
        <button class="btn btn--secondary btn--sm" id="exportJson" type="button">JSON indir</button>
      </div>
    </div>`;
}

export function wireExport(container, state, ctx, year) {
  const settings = state.settings;
  const thisYear = Number(currentPeriodKey().slice(0, 4));
  // İçinde bulunulan yıldaysak bugünün ayı, değilse o yılın aralığı.
  const anchor = year === thisYear ? currentPeriodKey() : `${year}-12`;

  container.querySelector('#exportHtml')?.addEventListener('click', () => {
    openReportScopeSheet({
      periodKey: anchor,
      year,
      onPick(scope) {
        const html = buildHtmlReport({
          profileName: profileName(ctx.profileId),
          periodKey: anchor,
          summary: periodSummary(state, anchor),
          settings,
          scope,
          state,
          yearSummary: scope === 'year' ? yearSummary(state, year) : null,
        });
        const name = scope === 'year' ? `mesai-raporu-${year}`
          : scope === 'range' ? `mesai-raporu-son6ay-${anchor}`
            : `mesai-raporu-${anchor}`;
        downloadFile(`${name}.html`, html, 'text/html;charset=utf-8');
        showToast('HTML rapor indirildi');
      },
    });
  });

  container.querySelector('#exportCsv')?.addEventListener('click', () => {
    // Yılın tamamı: sayfa yıl kapsamındayken tek ayın CSV'si şaşırtıcı olurdu.
    const entries = [];
    for (let m = 1; m <= 12; m += 1) {
      entries.push(...periodSummary(state, `${year}-${String(m).padStart(2, '0')}`).entries);
    }
    const csv = csvForEntries(entries, settings, entryAmount);
    downloadFile(`mesai-${year}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    showToast(`${entries.length} kayıt CSV olarak indirildi`);
  });

  container.querySelector('#exportJson')?.addEventListener('click', () => {
    downloadFile(`mesai-yedek-${year}.json`, ctx.store.exportJSON(), 'application/json');
    showToast('JSON indirildi');
  });
}

/** Alt sayfaların kendi tek düğmelik çıktısı. */
export function subExportHTML(id, label) {
  return `
    <div class="table-foot">
      <button class="btn btn--secondary btn--inline" id="${id}" type="button">${label}</button>
    </div>`;
}

/**
 * Alt sayfaların çıktısı. Kapsam neyse çıktı da o: ay kapsamında tek ayın
 * gelir/gider raporu, yıl kapsamında 12 ayın.
 */
export function wireSubExport(container, state, ctx, view, { id, scope, fileName }) {
  container.querySelector(`#${id}`)?.addEventListener('click', () => {
    const month = view.kind === 'month';
    // Çapa dönem anahtarı; htmlReport yılı bundan türetiyor.
    const anchor = month ? view.periodKey : `${view.year}-12`;
    const html = buildHtmlReport({
      profileName: profileName(ctx.profileId),
      periodKey: anchor,
      summary: periodSummary(state, anchor),
      settings: state.settings,
      scope,
      state,
      yearSummary: yearSummary(state, Number(anchor.slice(0, 4))),
      periodKeys: month ? [view.periodKey] : null,
      scopeLabel: month ? periodLabel(view.periodKey) : String(view.year),
    });
    downloadFile(`${fileName}-${month ? view.periodKey : view.year}.html`, html, 'text/html;charset=utf-8');
    showToast('Rapor indirildi');
  });
}

function openReportScopeSheet({ periodKey, year, onPick }) {
  openSheet({
    title: 'HTML rapor',
    build(bodyEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin-top:-4px; margin-bottom:14px;">Rapor hangi dönemi kapsasın?</p>
        <div class="card card--menu">
          <button class="menu-row" type="button" data-scope="year">
            <span class="menu-row__label">${year} yılı</span>
            <span class="menu-row__value">12 ayın tamamı</span>
            <span class="menu-row__chevron">›</span>
          </button>
          <button class="menu-row" type="button" data-scope="range">
            <span class="menu-row__label">Son 6 ay</span>
            <span class="menu-row__value">${periodLabel(shiftPeriod(periodKey, -5))} – ${periodLabel(periodKey)}</span>
            <span class="menu-row__chevron">›</span>
          </button>
          <button class="menu-row" type="button" data-scope="period">
            <span class="menu-row__label">${periodLabel(periodKey)}</span>
            <span class="menu-row__value">Tek ay</span>
            <span class="menu-row__chevron">›</span>
          </button>
        </div>
      `;
      bodyEl.querySelectorAll('[data-scope]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeSheet();
          onPick(btn.dataset.scope);
        });
      });
    },
  });
}
