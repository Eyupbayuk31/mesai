// Gelir sayfası: dönemin kazancı nereden geliyor, bordroda tuttu mu?
//
// Eskiden bu kartlar Rapor'un içindeydi; Rapor artık geriye dönük analiz
// sayfası, dönemin kendi hesabı buraya taşındı.

import { periodLabel, shiftPeriod, currentPeriodKey } from '../period.js';
import { periodSummary } from '../payroll.js';
import { comparePayslip, explainPayslipDiff, payslipFor, hasPayslipData } from '../payslip.js';
import { formatMoney, formatHours, parseLocaleNumber } from '../format.js';
import { entryRowHTML } from './entryRow.js';
import { mountPeriodNav } from './periodNav.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

const TYPE_ROWS = [
  { key: 'normal', label: 'Normal' },
  { key: 'weekend', label: 'Hafta tatili' },
  { key: 'holiday', label: 'Resmi tatil' },
];

const PREVIEW_COUNT = 3;

export function renderIncome(container, state, ctx) {
  const periodKey = ctx.reportPeriodKey || currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const settings = state.settings;

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
    </div>

    <div class="stat-strip stat-strip--kpi stat-strip--report">
      <div class="stat-strip__item stat-strip__item--lead">
        <div class="stat-strip__label">Dönem kazancı</div>
        <div class="stat-strip__value">${formatMoney(summary.earnedTotal, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Mesai</div>
        <div class="stat-strip__value">${formatHours(summary.totalHours)}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Ödeme günü</div>
        <div class="stat-strip__value">${formatMoney(summary.payoutTotal, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider stat-strip__divider--wide"></div>
      <div class="stat-strip__item stat-strip__item--desktop">
        <div class="stat-strip__label">Mesai ücreti</div>
        <div class="stat-strip__value">${formatMoney(summary.overtimePay, { decimals: false })}</div>
      </div>
    </div>

    <div class="panes">
    <div class="pane">
      <div class="section-title">Kazanç dökümü</div>
      <div class="card">
        <div class="rows rows--receipt">
          <div class="row"><span class="row__label">Maaş</span><span class="row__value">${formatMoney(summary.baseSalary, { decimals: false })}</span></div>
          ${TYPE_ROWS.map((t) => (summary.byType[t.key].hours > 0 ? `
            <div class="row">
              <span class="row__label"><span class="dot dot--${t.key}"></span>${t.label} <span style="color:var(--text-tertiary);">${formatHours(summary.byType[t.key].hours)} ×${settings.multipliers[t.key]}</span></span>
              <span class="row__value is-positive">+ ${formatMoney(summary.byType[t.key].amount, { decimals: false })}</span>
            </div>` : '')).join('')}
          ${summary.overtimePay > 0 ? `<div class="row"><span class="row__label">Mesai ücreti</span><span class="row__value is-positive">+ ${formatMoney(summary.overtimePay, { decimals: false })}</span></div>` : ''}
          ${summary.mealPay > 0 ? `<div class="row"><span class="row__label">Yemek parası <span style="color:var(--text-tertiary);">${summary.allowanceDays} gün</span></span><span class="row__value is-positive">+ ${formatMoney(summary.mealPay, { decimals: false })}</span></div>` : ''}
          ${summary.transportPay > 0 ? `<div class="row"><span class="row__label">Yol parası <span style="color:var(--text-tertiary);">${summary.allowanceDays} gün</span></span><span class="row__value is-positive">+ ${formatMoney(summary.transportPay, { decimals: false })}</span></div>` : ''}
          ${summary.bonuses > 0 ? `<div class="row"><span class="row__label">Prim</span><span class="row__value is-positive">+ ${formatMoney(summary.bonuses, { decimals: false })}</span></div>` : ''}
          ${summary.extraIncome > 0 ? `<div class="row"><span class="row__label">Para girişi</span><span class="row__value is-positive">+ ${formatMoney(summary.extraIncome, { decimals: false })}</span></div>` : ''}
          ${summary.deductions > 0 ? `<div class="row"><span class="row__label">Kesinti</span><span class="row__value is-negative">− ${formatMoney(summary.deductions, { decimals: false })}</span></div>` : ''}
          <div class="row row--total"><span class="row__label">Dönem kazancın</span><span class="row__value">${formatMoney(summary.earnedTotal)}</span></div>
          ${summary.advances > 0 ? `<div class="row"><span class="row__label">Avans olarak aldın</span><span class="row__value is-negative">− ${formatMoney(summary.advances, { decimals: false })}</span></div>` : ''}
          ${summary.advances > 0 ? `<div class="row row--subtotal"><span class="row__label">Ödeme günü yatacak</span><span class="row__value">${formatMoney(summary.payoutTotal)}</span></div>` : ''}
        </div>
      </div>

      <div class="section-title">Ek kalemler</div>
      <div class="card">
        <div class="chips" style="margin-bottom:${summary.adjustments.length ? '14px' : '0'};">
          <button class="quick-chip" id="addIncome" type="button">+ Para girişi</button>
          <button class="quick-chip" id="addBonus" type="button">+ Prim</button>
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
              </div>`).join('')}
          </div>`}
      </div>
    </div>

    <div class="pane">
      ${payslipCardHTML(state, summary, settings)}

      <div class="section-header">
        <span class="section-title" style="margin:0;">Bu dönemin mesaileri</span>
        ${summary.entryCount > 0
    ? `<button class="section-header__link" id="seeAllEntries" type="button">Tümü (${summary.entryCount}) ›</button>`
    : ''}
      </div>
      ${summary.entries.length === 0
    ? '<div class="card empty"><div class="empty__title">Bu dönemde kayıt yok</div><div class="empty__sub">Sağ alttaki + ile mesai ekleyebilirsin.</div></div>'
    : `<ul class="list">${previewEntries(summary.entries).map((e) => entryRowHTML(e, settings)).join('')}</ul>`}
    </div>
    </div>
  `;

  mountPeriodNav(ctx, {
    label: periodLabel(periodKey),
    sub: `${summary.entryCount} kayıt · ${formatHours(summary.totalHours)}`,
    onPrev: () => ctx.setReportPeriod(shiftPeriod(periodKey, -1)),
    onNext: () => ctx.setReportPeriod(shiftPeriod(periodKey, 1)),
  });

  container.querySelector('#prevPeriod').addEventListener('click', () => ctx.setReportPeriod(shiftPeriod(periodKey, -1)));
  container.querySelector('#nextPeriod').addEventListener('click', () => ctx.setReportPeriod(shiftPeriod(periodKey, 1)));
  container.querySelector('#seeAllEntries')?.addEventListener('click', () => ctx.navigate({ tab: 'income', page: 'entries' }));

  container.querySelector('#addIncome').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'income'));
  container.querySelector('#addBonus').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'bonus'));
  container.querySelector('#addAdvance').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'advance'));
  container.querySelector('#addDeduction').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'deduction'));
  container.querySelector('#adjustmentRows')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-adj]');
    if (btn) ctx.store.removeAdjustment(btn.dataset.removeAdj);
  });

  container.querySelector('#payslipSaveBtn')?.addEventListener('click', () => {
    const amount = parseLocaleNumber(container.querySelector('#payslipAmount').value);
    const transport = parseLocaleNumber(container.querySelector('#payslipTransport').value);
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Cebine geçen net maaşı gir'); return; }
    ctx.store.setPayslip(periodKey, { amount, transport: Number.isFinite(transport) ? transport : undefined });
    showToast('Bordro kaydedildi');
  });
  container.querySelector('#payslipClearBtn')?.addEventListener('click', () => {
    ctx.store.removePayslip(periodKey);
    showToast('Bordro kaydı silindi');
  });
  container.querySelector('#payslipYearBtn')?.addEventListener('click', () => ctx.navigate({ tab: 'income', page: 'payslip' }));
}

// --- Bordro karşılaştırma kartı ------------------------------------------

function payslipCardHTML(state, summary, settings) {
  const slip = payslipFor(state, summary.periodKey);
  const yearLink = '<button class="section-header__link" id="payslipYearBtn" type="button">Yıllık giriş ›</button>';

  if (!slip || !hasPayslipData(slip)) {
    return `
      <div class="section-header">
        <span class="section-title" style="margin:0;">Bordro karşılaştırma</span>${yearLink}
      </div>
      <div class="card">
        <p class="field__hint" style="margin:-2px 0 12px;">
          Ödeme günü hesaba <b>${formatMoney(summary.payoutTotal)}</b> yatmalı. Cebine geçeni yaz, tutuyor mu bakalım.
        </p>
        <div class="input-row">
          <div class="field">
            <label class="field__label">Net maaş (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="payslipAmount" placeholder="0" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field__label">Yol parası (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="payslipTransport" placeholder="${summary.transportPay > 0 ? Math.round(summary.transportPay) : '0'}" autocomplete="off" />
          </div>
        </div>
        <button class="btn btn--primary btn--sm" id="payslipSaveBtn" type="button">Karşılaştır</button>
      </div>
    `;
  }

  const cmp = comparePayslip(summary, slip);
  const explanation = explainPayslipDiff(summary, cmp, settings);
  const durum = {
    match: { cls: 'is-positive', baslik: 'Tutuyor ✓', not: 'Ödenen tutar hesapla aynı.' },
    short: { cls: 'is-negative', baslik: `${formatMoney(Math.abs(cmp.diff))} eksik`, not: 'Ödenen tutar hesabın altında.' },
    over: { cls: 'is-positive', baslik: `${formatMoney(cmp.diff)} fazla`, not: 'Ödenen tutar hesabın üstünde.' },
  }[cmp.status];

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Bordro karşılaştırma</span>${yearLink}
    </div>
    <div class="card payslip payslip--${cmp.status}">
      <div class="payslip__head">
        <span class="payslip__title ${durum.cls}">${durum.baslik}</span>
        <button class="payslip__clear" id="payslipClearBtn" type="button">Sıfırla</button>
      </div>
      <div class="rows rows--receipt">
        ${cmp.lines.map((l) => `
          <div class="row">
            <span class="row__label">${l.label}</span>
            <span class="row__leader"></span>
            <span class="row__value">
              ${formatMoney(l.paid, { decimals: false })}
              <span class="payslip-line__diff ${Math.abs(l.diff) <= 1 ? '' : l.diff < 0 ? 'is-negative' : 'is-positive'}">
                ${Math.abs(l.diff) <= 1 ? '✓' : `${l.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(l.diff), { decimals: false })}`}
              </span>
            </span>
          </div>`).join('')}
        <div class="row"><span class="row__label">Hesaba göre</span><span class="row__leader"></span><span class="row__value">${formatMoney(cmp.expected)}</span></div>
        <div class="row row--total"><span class="row__label">Fark</span><span class="row__leader"></span><span class="row__value ${durum.cls}">${Math.abs(cmp.diff) <= 1 ? '—' : (cmp.diff > 0 ? '+' : '−') + formatMoney(Math.abs(cmp.diff))}</span></div>
      </div>
      <p class="field__hint" style="margin:12px 0 0;">
        ${durum.not}${explanation ? ` <b style="color:var(--text-secondary);">${explanation}</b>` : ''}
      </p>
    </div>
  `;
}

// --- Ek kalem sayfası -----------------------------------------------------

const ADJ_LABEL = { advance: 'Avans', deduction: 'Kesinti', bonus: 'Prim', income: 'Para girişi' };

function adjustmentLabel(kind) {
  return ADJ_LABEL[kind] || kind;
}

function previewEntries(entries) {
  return [...entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, PREVIEW_COUNT);
}

function openAdjustmentSheet(store, periodKey, kind) {
  openSheet({
    title: adjustmentLabel(kind),
    footerHTML: '<button class="btn btn--primary" id="saveAdjBtn" type="button">Ekle</button>',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="adjAmount" placeholder="0" autocomplete="off" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Açıklama <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="adjLabel" placeholder="${adjustmentLabel(kind)}" />
        </div>
      `;
      setTimeout(() => bodyEl.querySelector('#adjAmount').focus(), 120);
      footerEl.querySelector('#saveAdjBtn').addEventListener('click', () => {
        const amount = parseLocaleNumber(bodyEl.querySelector('#adjAmount').value);
        if (!Number.isFinite(amount) || amount <= 0) { showToast('Geçerli bir tutar girmelisin'); return; }
        store.addAdjustment({ periodKey, kind, amount, label: bodyEl.querySelector('#adjLabel').value.trim() });
        showToast(`${adjustmentLabel(kind)} eklendi`);
        closeSheet();
      });
    },
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
