import { periodLabel, shiftPeriod, currentPeriodKey } from '../period.js';
import { mountPeriodNav } from './periodNav.js';
import { periodSummary, yearSummary, entryAmount } from '../payroll.js';
import { formatMoney, formatHours } from '../format.js';
import { entryRowHTML } from './entryRow.js';
import { enableSwipeToDelete } from './swipe.js';
import { showToast } from './toast.js';
import { openSheet, closeSheet } from './sheet.js';
import { downloadFile, csvForEntries } from './exportUtils.js';
import { buildHtmlReport } from './htmlReport.js';
import { profileName } from '../profile.js';

const TYPE_ROWS = [
  { key: 'normal', label: 'Normal' },
  { key: 'weekend', label: 'Hafta tatili' },
  { key: 'holiday', label: 'Resmi tatil' },
];

const MONTH_SHORT = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];

export function renderReport(container, state, ctx) {
  const periodKey = ctx.reportPeriodKey || currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const settings = state.settings;
  const isFuture = periodKey > currentPeriodKey();
  const year = Number(periodKey.slice(0, 4));
  const ySummary = yearSummary(state, year);

  container.innerHTML = `
    <div class="period-card">
      <button class="period-card__nav" id="prevPeriod" type="button" aria-label="Önceki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub">${summary.entryCount} kayıt · ${formatHours(summary.totalHours)}</div>
      </div>
      <button class="period-card__nav" id="nextPeriod" type="button" aria-label="Sonraki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      ${periodKey < currentPeriodKey() ? '<div class="stamp" aria-hidden="true">Tamamlandı</div>' : ''}
    </div>

    <div class="panes">
    <div class="pane">
    <div class="section-title">Dönem özeti</div>
    <div class="card">
      <div class="rows">
        ${TYPE_ROWS.map((t) => `
          <div class="row">
            <span class="row__label"><span class="dot dot--${t.key}"></span>${t.label} <span style="color:var(--text-tertiary);">×${settings.multipliers[t.key]}</span></span>
            <span class="row__value">${formatHours(summary.byType[t.key].hours)} · ${formatMoney(summary.byType[t.key].amount, { decimals: false })}</span>
          </div>
        `).join('')}
        <div class="row row--total"><span class="row__label">Toplam mesai</span><span class="row__value">${formatMoney(summary.overtimePay)}</span></div>
        ${summary.mealPay > 0 ? `
        <div class="row"><span class="row__label">Yemek parası <span style="color:var(--text-tertiary);">${summary.allowanceDays} gün × ${formatMoney(summary.mealAllowance, { decimals: false })}</span></span><span class="row__value">${formatMoney(summary.mealPay, { decimals: false })}</span></div>` : ''}
        ${summary.transportPay > 0 ? `
        <div class="row"><span class="row__label">Yol parası <span style="color:var(--text-tertiary);">${summary.allowanceDays} gün × ${formatMoney(summary.transportAllowance, { decimals: false })}</span></span><span class="row__value">${formatMoney(summary.transportPay, { decimals: false })}</span></div>` : ''}
      </div>
    </div>

    <div class="section-title">Ek kalemler</div>
    <div class="card">
      <div class="chips" style="margin-bottom:${summary.adjustments.length ? '14px' : '0'};">
        <button class="quick-chip" id="addIncome" type="button">+ Para girişi</button>
        <button class="quick-chip" id="addAdvance" type="button">− Avans</button>
        <button class="quick-chip" id="addDeduction" type="button">− Kesinti</button>
      </div>
      ${summary.adjustments.length === 0 ? '' : `
        <div class="rows" id="adjustmentRows">
          ${summary.adjustments.map((a) => `
            <div class="row" data-adj-id="${a.id}">
              <span class="row__label">${escapeHTML(a.label || adjustmentLabel(a.kind))}</span>
              <span class="row__value ${a.kind === 'bonus' || a.kind === 'income' ? 'is-positive' : 'is-negative'}" style="display:flex; align-items:center; gap:10px;">
                ${a.kind === 'bonus' || a.kind === 'income' ? '+' : '−'} ${formatMoney(a.amount, { decimals: false })}
                <button class="link-row__chevron" data-remove-adj="${a.id}" type="button" aria-label="Sil" style="line-height:0;">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </span>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <div class="section-header">
      <span class="section-title" style="margin:0;">Kayıtlar</span>
      ${summary.entryCount > 0
        ? `<button class="section-header__link" id="seeAllEntries" type="button">Kayıtlarda gör (${summary.entryCount}) ›</button>`
        : ''}
    </div>
    ${summary.entries.length === 0 ? emptyState(isFuture) : `<ul class="list" id="entryList">${previewEntries(summary.entries).map((e) => entryRowHTML(e, settings)).join('')}</ul>`}

    </div>

    <div class="pane">
    <div class="section-title">${year} yılı</div>
    <div class="card">
      <div class="bar-chart">
        ${ySummary.months.map((m) => renderBar(m, ySummary)).join('')}
      </div>
      <div class="rows" style="margin-top:6px;">
        <div class="row"><span class="row__label">Yıllık toplam mesai</span><span class="row__value">${formatHours(ySummary.totalHours)}</span></div>
        <div class="row"><span class="row__label">Yıllık mesai ücreti</span><span class="row__value">${formatMoney(ySummary.totalOvertimePay, { decimals: false })}</span></div>
      </div>
    </div>

    <div class="section-title">Dışa aktar</div>
    <div class="card">
      <button class="btn btn--primary btn--sm" id="exportHtml" type="button" style="margin-bottom:10px;">HTML rapor indir</button>
      <div style="display:flex; gap:10px;">
        <button class="btn btn--secondary btn--sm" id="exportCsv" type="button">CSV indir</button>
        <button class="btn btn--secondary btn--sm" id="exportJson" type="button">JSON indir</button>
      </div>
    </div>
    </div>
    </div>
  `;

  mountPeriodNav(ctx, {
    label: periodLabel(periodKey),
    onPrev: () => ctx.setReportPeriod(shiftPeriod(periodKey, -1)),
    onNext: () => ctx.setReportPeriod(shiftPeriod(periodKey, 1)),
  });

  container.querySelector('#prevPeriod').addEventListener('click', () => ctx.setReportPeriod(shiftPeriod(periodKey, -1)));
  container.querySelector('#nextPeriod').addEventListener('click', () => ctx.setReportPeriod(shiftPeriod(periodKey, 1)));

  container.querySelector('#seeAllEntries')?.addEventListener('click', () => {
    ctx.setEntriesView({ periodKey, allTime: false, type: 'all', page: 1, mode: 'list' });
    ctx.setTab('entries');
  });

  container.querySelector('#addIncome').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'income'));
  container.querySelector('#addAdvance').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'advance'));
  container.querySelector('#addDeduction').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'deduction'));

  container.querySelectorAll('[data-remove-adj]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.store.removeAdjustment(btn.dataset.removeAdj);
      showToast('Kalem silindi');
    });
  });

  const listEl = container.querySelector('#entryList');
  if (listEl) {
    enableSwipeToDelete(listEl, {
      onDelete: (id) => {
        const entry = state.entries.find((e) => e.id === id);
        ctx.store.removeEntry(id);
        showToast('Mesai kaydı silindi', { actionLabel: 'Geri al', onAction: () => ctx.store.addEntry(entry) });
      },
      onTap: async (id) => {
        const entry = state.entries.find((e) => e.id === id);
        const { openEntrySheet } = await import('./entry.js');
        openEntrySheet(ctx.store, entry);
      },
    });
  }

  container.querySelector('#exportHtml').addEventListener('click', () => {
    openReportScopeSheet({
      periodKey,
      year,
      onPick(scope) {
        const html = buildHtmlReport({
          profileName: profileName(ctx.profileId),
          periodKey, summary, settings, scope,
          yearSummary: scope === 'year' ? ySummary : null,
        });
        const name = scope === 'year' ? `mesai-raporu-${year}` : `mesai-raporu-${periodKey}`;
        downloadFile(`${name}.html`, html, 'text/html;charset=utf-8');
        showToast('HTML rapor indirildi');
      },
    });
  });
  container.querySelector('#exportCsv').addEventListener('click', () => {
    const csv = csvForEntries(summary.entries, settings, entryAmount);
    downloadFile(`mesai-${periodKey}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    showToast('CSV indirildi');
  });
  container.querySelector('#exportJson').addEventListener('click', () => {
    downloadFile(`mesai-yedek-${periodKey}.json`, ctx.store.exportJSON(), 'application/json');
    showToast('JSON indirildi');
  });
}

function openReportScopeSheet({ periodKey, year, onPick }) {
  openSheet({
    title: 'HTML rapor',
    build(bodyEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin-top:-4px; margin-bottom:14px;">Rapor hangi dönemi kapsasın?</p>
        <div class="card card--menu">
          <button class="menu-row" type="button" data-scope="period">
            <span class="menu-row__label">${periodLabel(periodKey)}</span>
            <span class="menu-row__value">Bu dönem</span>
            <span class="menu-row__chevron">›</span>
          </button>
          <button class="menu-row" type="button" data-scope="year">
            <span class="menu-row__label">${year} yılı</span>
            <span class="menu-row__value">12 ayın tamamı</span>
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

// Rapor para/özet odaklı; tam liste Kayıtlar sekmesinin işi.
const PREVIEW_COUNT = 3;
function previewEntries(entries) {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, PREVIEW_COUNT);
}

function renderBar(monthData, ySummary) {
  const maxHours = Math.max(1, ...ySummary.months.map((m) => m.hours));
  const heightPct = Math.max(3, Math.round((monthData.hours / maxHours) * 100));
  const isCurrent = monthData.periodKey === currentPeriodKey();
  return `
    <div class="bar-chart__col">
      <div class="bar-chart__track">
        <div class="bar-chart__bar ${monthData.hours > 0 ? 'has-value' : ''}" style="height:${heightPct}%; ${isCurrent ? 'outline:2px solid var(--accent); outline-offset:2px;' : ''}" title="${formatHours(monthData.hours)}"></div>
      </div>
      <div class="bar-chart__label">${MONTH_SHORT[monthData.month - 1]}</div>
    </div>
  `;
}

function adjustmentLabel(kind) {
  return kind === 'bonus' ? 'Prim' : kind === 'income' ? 'Para girişi' : kind === 'advance' ? 'Avans' : 'Kesinti';
}

function openAdjustmentSheet(store, periodKey, kind) {
  openSheet({
    title: kind === 'bonus' ? 'Prim ekle' : kind === 'income' ? 'Para girişi ekle' : kind === 'advance' ? 'Avans ekle' : 'Kesinti ekle',
    footerHTML: `<button class="btn btn--primary" id="saveAdjBtn" type="button">Ekle</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input" type="text" inputmode="decimal" id="adjAmount" placeholder="ör. 1500" />
        </div>
        <div class="field">
          <label class="field__label">Etiket <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="adjLabel" placeholder="${adjustmentLabel(kind)}" />
        </div>
      `;
      footerEl.querySelector('#saveAdjBtn').addEventListener('click', () => {
        const amountRaw = bodyEl.querySelector('#adjAmount').value;
        const amount = Number(amountRaw.replace(',', '.'));
        if (!amount || amount <= 0) {
          showToast('Geçerli bir tutar girmelisin');
          return;
        }
        const label = bodyEl.querySelector('#adjLabel').value.trim();
        store.addAdjustment({ periodKey, kind, amount, label: label || adjustmentLabel(kind) });
        showToast(`${adjustmentLabel(kind)} eklendi`);
        closeSheet();
      });
    },
  });
}

function emptyState(isFuture) {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 13v4M12 10v7M16 15v2"/></svg>
      </div>
      <div class="empty__title">${isFuture ? 'Bu dönem henüz gelmedi' : 'Bu dönemde kayıt yok'}</div>
      <div class="empty__sub">${isFuture ? 'Mesai eklemek için döneme geldiğinde tekrar bak' : 'Mesai eklemek için Özet sekmesindeki + butonunu kullan'}</div>
    </div>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
