// Rapor sekmesi: ana sayfa + alt sayfa kayıt defteri.
//
// Ana sayfa bilinçli olarak sade: yılın ay ay dökümü ve dışa aktarma.
// Derin analiz iki alt sayfaya taşındı (Gelir raporu · Gider raporu) —
// tek ekranda dokuz bölüm hem okunmuyordu hem her açılışta yeniden
// hesaplanıyordu.

import { currentPeriodKey, periodLabel } from '../../period.js';
import { yearFinance, budgetSummary } from '../../budget.js';
import { formatMoney, formatHours, formatMonthYear } from '../../format.js';
import { openSheet, closeSheet } from '../sheet.js';
import * as incomePage from './income.js';
import * as expensePage from './expense.js';
import {
  monthRowState, visibleMonths, yearCardHTML, wireYearNav, moneyOrDash, receivedTitle, escapeHTML,
} from './shared.js';
import { exportCardHTML, wireExport } from './export.js';

const PAGES = { income: incomePage, expense: expensePage };

export function renderReportRoute(container, state, ctx, page) {
  const target = PAGES[page];
  if (target) target.render(container, state, ctx);
  else renderMain(container, state, ctx);
}

function renderMain(container, state, ctx) {
  const year = ctx.reportYear || Number(currentPeriodKey().slice(0, 4));
  const finance = yearFinance(state, year);
  const rows = visibleMonths(finance);
  const eksik = finance.months.filter((m) => !m.isFuture && m.hasData && !m.hasIncome).length;
  const sub = `${finance.dataMonths} ay veri · ${finance.incomeMonths} ay bordro`;

  container.innerHTML = `
    ${yearCardHTML(year, sub)}

    <div class="card card--menu" style="margin-top:12px;">
      <button class="menu-row" type="button" data-report-page="income">
        <span class="menu-row__label">Gelir raporu</span>
        <span class="menu-row__value">bordro · mesai</span>
        <span class="menu-row__chevron">›</span>
      </button>
      <button class="menu-row" type="button" data-report-page="expense">
        <span class="menu-row__label">Gider raporu</span>
        <span class="menu-row__value">kategori · krediler</span>
        <span class="menu-row__chevron">›</span>
      </button>
    </div>

    <div class="section-header">
      <span class="section-title" style="margin:0;">${year} ay ay döküm</span>
      ${rows.length > 0 ? `<span class="section-header__note">${rows.length} ay · satıra dokun</span>` : ''}
    </div>
    ${rows.length === 0 ? emptyHTML(year) : tableHTML(finance, rows, eksik)}

    ${exportCardHTML()}
  `;

  wireYearNav(container, ctx, year, sub);
  wireExport(container, state, ctx, year);

  container.querySelector('.card--menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-report-page]');
    if (btn) ctx.navigate({ tab: 'report', page: btn.dataset.reportPage });
  });

  container.querySelector('#goPayslipYear')?.addEventListener('click', () => {
    ctx.payslipYear = year;
    ctx.navigate({ tab: 'income', page: 'payslip' });
  });

  container.querySelector('.year-table')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-year-month]');
    if (row) openMonthSheet(ctx, state, row.dataset.yearMonth);
  });
}

// Bordrosu girilmemiş ay listede hiç görünmediği için, hiç bordro yoksa
// tablo tamamen boş kalır. Ne olduğunu söyleyip tek dokunuşla doldurtuyoruz.
function emptyHTML(year) {
  return `
    <div class="card received-empty">
      <div class="received-empty__title">${year} için henüz veri yok</div>
      <p class="received-empty__body">
        Bu yılın hiçbir ayında bordro, harcama veya mesai kaydı yok. Maaşın
        yattığında bordroyu girersen ay ay dökümü burada oluşmaya başlar.
      </p>
      <div class="received-empty__actions">
        <button class="btn btn--secondary btn--inline" id="goPayslipYear" type="button">Bordroyu gir</button>
      </div>
    </div>`;
}

function tableHTML(finance, rows, eksik) {
  return `
    <div class="card">
      <div class="year-table__scroll">
        <table class="year-table">
          <thead>
            <tr><th>Ay</th><th>Mesai</th><th>Eline geçen</th><th>Harcama</th><th>Kalan</th></tr>
          </thead>
          <tbody>
            ${rows.map((m) => {
    const partial = monthRowState(m) === 'no-income';
    return `
              <tr data-year-month="${m.periodKey}" class="${partial ? 'is-partial' : ''}">
                <td>${escapeHTML(formatMonthYear(m.periodKey).replace(` ${m.year}`, ''))}</td>
                <td>${formatHours(m.hours)}</td>
                <td${receivedTitle(m)}>${moneyOrDash(m.received, m.hasIncome)}</td>
                <td>${formatMoney(m.spent, { decimals: false })}</td>
                <td>${moneyOrDash(m.remaining, m.hasIncome)}</td>
              </tr>`;
  }).join('')}
            <tr class="is-total">
              <td>Toplam · ${rows.length} ay</td>
              <td>${formatHours(finance.hours)}</td>
              <td>${formatMoney(finance.received, { decimals: false })}</td>
              <td>${formatMoney(finance.spent, { decimals: false })}</td>
              ${/* Listedeki her ayın bordrosu yoksa toplam "kalan" da yalan
                    olur: 8 aylık harcamadan 2 aylık geliri düşmek olmayan bir
                    açık üretir. Satır bazındaki kuralın aynısı. */''}
              <td>${moneyOrDash(finance.remaining, rows.every((m) => m.hasIncome))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${eksik > 0 ? `<p class="field__hint" style="margin:12px 0 0;">
        ${eksik} ayın bordrosu girilmedi; o ayların geliri hesaplanmadı,
        toplam kalan da bu yüzden basılmıyor.
      </p>` : ''}
    </div>`;
}

// Satır hem geliri hem gideri kapsıyor; tek bir sekme "detay" değil.
// Sheet kullanıcıyı raporda tutar, iki sekmeye de kapı açar.
function openMonthSheet(ctx, state, periodKey) {
  const budget = budgetSummary(state, periodKey);
  const received = budget.received;
  const hasIncome = received.total > 0;

  openSheet({
    title: periodLabel(periodKey),
    footerHTML: `
      <div class="adj-actions">
        <button class="btn btn--secondary btn--sm" id="sheetIncome" type="button">Gelir sayfası</button>
        <button class="btn btn--secondary btn--sm" id="sheetExpense" type="button">Gider sayfası</button>
      </div>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="rows rows--receipt">
          ${hasIncome
    ? received.lines.map((l) => row(l.key === 'payslip' && received.payslipPeriod !== periodKey
      ? `Bordro <span style="color:var(--text-tertiary);">(${escapeHTML(periodLabel(received.payslipPeriod))})</span>`
      : ({ payslip: 'Bordro', advance: 'Avans', manual: 'Para girişi' }[l.key] || l.key),
    formatMoney(l.amount, { decimals: false }))).join('')
    : `<p class="field__hint" style="margin:0 0 10px;">Bu ay bordro girilmemiş — eline geçen para hesaplanamıyor.</p>`}
          ${hasIncome ? row('Eline geçen', formatMoney(received.total, { decimals: false }), 'row--subtotal') : ''}
          ${budget.byCategory.map((c) => row(
    `<span style="color:var(--text-tertiary);"><span class="dot" style="background:${c.color};"></span>${escapeHTML(c.label)}</span>`,
    `− ${formatMoney(c.amount, { decimals: false })}`,
  )).join('')}
          ${row('Harcama', `− ${formatMoney(budget.spent, { decimals: false })}`, 'row--subtotal')}
          ${hasIncome ? row('Kalan', formatMoney(budget.remaining, { decimals: false }), 'row--total') : ''}
        </div>
        ${!hasIncome ? `
        <button class="btn btn--secondary btn--inline" id="sheetPayslip" type="button" style="margin-top:12px;">Bordroyu gir</button>` : ''}
      `;

      footerEl.querySelector('#sheetIncome').addEventListener('click', () => {
        closeSheet();
        ctx.setReportPeriod(periodKey);
        ctx.navigate({ tab: 'income', page: null });
      });
      footerEl.querySelector('#sheetExpense').addEventListener('click', () => {
        closeSheet();
        // Gider sekmesinin kendi imleci var; setReportPeriod ona işlemez.
        ctx.setBudgetPeriod(periodKey);
        ctx.navigate({ tab: 'expense', page: null });
      });
      bodyEl.querySelector('#sheetPayslip')?.addEventListener('click', () => {
        closeSheet();
        ctx.payslipYear = Number(received.payslipPeriod.slice(0, 4));
        ctx.payslipFocus = received.payslipPeriod;
        ctx.navigate({ tab: 'income', page: 'payslip' });
      });
    },
  });
}

function row(label, value, cls = '') {
  return `<div class="row ${cls}"><span class="row__label">${label}</span><span class="row__leader"></span><span class="row__value">${value}</span></div>`;
}
