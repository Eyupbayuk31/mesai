import { periodLabel, shiftPeriod, currentPeriodKey } from '../period.js';
import { mountPeriodNav } from './periodNav.js';
import { payslipRows, payslipStats, payslipLineTotals, openBalance } from '../payslip.js';
import { debtReport } from '../loans.js';
import { periodSummary, yearSummary, entryAmount } from '../payroll.js';
import { formatMoney, formatHours, formatMonthYear, locative } from '../format.js';
import { showToast } from './toast.js';
import { openSheet, closeSheet } from './sheet.js';
import { downloadFile, csvForEntries } from './exportUtils.js';
import { buildHtmlReport } from './htmlReport.js';
import { profileName } from '../profile.js';
import { budgetSummary, yearFinance } from '../budget.js';
import { portfolioSummary } from '../investments.js';
import { yearsWithData, compareYears, realChange, categoryTrend, overtimeShareByYear } from '../analysis.js';

const MONTH_SHORT = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];

export function renderReport(container, state, ctx) {
  const periodKey = ctx.reportPeriodKey || currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const settings = state.settings;
  const isFuture = periodKey > currentPeriodKey();
  const year = Number(periodKey.slice(0, 4));
  const ySummary = yearSummary(state, year);
  const finance = yearFinance(state, year);
  const periodBudget = budgetSummary(state, periodKey);
  const yearPeriods = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const debts = debtReport(state, yearPeriods);

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
        <div class="stat-strip__label">Harcama</div>
        <div class="stat-strip__value">${formatMoney(periodBudget.spent, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider stat-strip__divider--wide"></div>
      <div class="stat-strip__item stat-strip__item--desktop">
        <div class="stat-strip__label">Aydan kalan</div>
        <div class="stat-strip__value">${formatMoney(periodBudget.remaining, { decimals: false })}</div>
      </div>
    </div>

    <div class="panes">
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

    ${yearTotalsCardHTML(finance, state, debts)}
    ${debtSectionHTML(debts, year)}
    </div>
    </div>

    ${yearTableHTML(finance, ySummary)}

    ${payslipSectionHTML(state, year, ctx)}

    ${analysisHTML(state, year)}

    <div class="section-title">Dışa aktar</div>
    <div class="card export-card">
      <p class="field__hint" style="margin:0 0 12px;">
        HTML rapor mesai, harcama ve yatırımı tek dosyada toplar — telefonda da açılır, yazdırılabilir.
      </p>
      <div class="export-card__actions">
        <button class="btn btn--primary btn--sm" id="exportHtml" type="button">HTML rapor indir</button>
        <button class="btn btn--secondary btn--sm" id="exportCsv" type="button">CSV indir</button>
        <button class="btn btn--secondary btn--sm" id="exportJson" type="button">JSON indir</button>
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

  container.querySelector('#payslipPageLink')?.addEventListener('click', () => ctx.navigate({ tab: 'income', page: 'payslip' }));
  container.querySelector('[data-payslip-period]')?.closest('table')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-payslip-period]');
    if (row) { ctx.setReportPeriod(row.dataset.payslipPeriod); ctx.navigate({ tab: 'income', page: null }); }
  });

  container.querySelector('.year-table')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-year-month]');
    if (row) ctx.setReportPeriod(row.dataset.yearMonth);
  });


  container.querySelectorAll('[data-remove-adj]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.store.removeAdjustment(btn.dataset.removeAdj);
      showToast('Kalem silindi');
    });
  });


  container.querySelector('#exportHtml').addEventListener('click', () => {
    openReportScopeSheet({
      periodKey,
      year,
      onPick(scope) {
        // Rapor gerekli her şeyi state'ten kendisi türetir.
        const html = buildHtmlReport({
          profileName: profileName(ctx.profileId),
          periodKey, summary, settings, scope, state,
          yearSummary: scope === 'year' ? ySummary : null,
        });
        const name = scope === 'year' ? `mesai-raporu-${year}`
          : scope === 'range' ? `mesai-raporu-son6ay-${periodKey}`
            : `mesai-raporu-${periodKey}`;
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
          <button class="menu-row" type="button" data-scope="range">
            <span class="menu-row__label">Son 6 ay</span>
            <span class="menu-row__value">${periodLabel(shiftPeriod(periodKey, -5))} – ${periodLabel(periodKey)}</span>
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



// --- Bordro geçmişi -------------------------------------------------------
// Tek döneme bakmak bir kalemin HER AY eksik yattığını göstermez; kalıp ancak
// dönemler yan yana görülünce çıkar.
const HISTORY_MONTHS = 12;


// --- Bordro karşılaştırma -------------------------------------------------
// Şirketin ödediğiyle hesabın tutup tutmadığı. Mesai takip etmenin asıl
// karşılığı burada görünür.




function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Yıllık finans ---------------------------------------------------------
//
// İki parça: sağ sütunda özet kartı, altında TAM GENİŞLİKTE tablo. Beş sütunlu
// tabloyu dar sütuna sıkıştırmak rakamları okunmaz yapıyordu.

function yearTotalsCardHTML(finance, state, debts) {
  if (finance.income <= 0 && finance.spent <= 0 && finance.invested <= 0) return '';
  const portfolio = portfolioSummary(state);
  const up = portfolio.totalProfit >= 0;
  return `
    <div class="section-title">${finance.year} finans özeti</div>
    <div class="card">
      <div class="rows rows--receipt">
        <div class="row"><span class="row__label">Toplam gelir</span><span class="row__value is-positive">${formatMoney(finance.income, { decimals: false })}</span></div>
        <div class="row"><span class="row__label">Toplam harcama</span><span class="row__value is-negative">− ${formatMoney(finance.spent, { decimals: false })}</span></div>
        <div class="row row--total"><span class="row__label">Gelir − harcama</span><span class="row__value">${formatMoney(finance.remaining, { decimals: false })}</span></div>
        ${finance.invested > 0 ? `<div class="row"><span class="row__label">Yatırıma ayrılan</span><span class="row__value">${formatMoney(finance.invested, { decimals: false })}</span></div>` : ''}
        ${debts?.totalPaid > 0 ? `<div class="row"><span class="row__label">Borca ödenen</span><span class="row__value">${formatMoney(debts.totalPaid, { decimals: false })}</span></div>` : ''}
        ${portfolio.totalCost > 0 ? `
        <div class="row"><span class="row__label">Portföy kâr/zarar</span><span class="row__value ${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(portfolio.totalProfit), { decimals: false })} (%${Math.abs(portfolio.profitPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })})</span></div>` : ''}
      </div>
    </div>
  `;
}

// Borç durumu: kalan borç azalıyor mu, bu yıl borca ne kadar gitti?
// Taksitler harcama toplamına zaten giriyordu ama borcun KENDİSİ hiçbir
// raporda görünmüyordu — taksitsiz borcun ise hiç izi yoktu.
function debtSectionHTML(debts, year) {
  if (!debts || !debts.hasDebt) return '';

  const withData = debts.months.filter((m) => m.remaining > 0 || m.paid > 0);
  const max = Math.max(...debts.months.map((m) => m.remaining), 0);

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Borç durumu</span>
      <span class="section-header__meta">${year}</span>
    </div>
    <div class="card">
      <div class="stat-strip stat-strip--kpi" style="margin:0 0 14px;">
        <div class="stat-strip__item stat-strip__item--lead">
          <div class="stat-strip__label">Kalan borç</div>
          <div class="stat-strip__value ${debts.remaining > 0 ? 'is-negative' : 'is-positive'}">${formatMoney(debts.remaining, { decimals: false })}</div>
        </div>
        <div class="stat-strip__divider"></div>
        <div class="stat-strip__item">
          <div class="stat-strip__label">Bu yıl ödenen</div>
          <div class="stat-strip__value">${formatMoney(debts.totalPaid, { decimals: false })}</div>
        </div>
      </div>

      <div class="rows rows--receipt">
        ${debts.byKind.map((row) => `
          <div class="row">
            <span class="row__label"><span class="dot" style="background:${row.color};"></span>${row.label}</span>
            <span class="row__leader"></span>
            <span class="row__value">${formatMoney(row.remaining, { decimals: false })}<span class="payslip-line__diff">${row.paid > 0 ? `−${formatMoney(row.paid, { decimals: false })}` : ''}</span></span>
          </div>`).join('')}
      </div>
      <p class="field__hint" style="margin:10px 0 0;">
        Soldaki tutar kalan borç, yanındaki ${year} içinde o borca ödenen para.
      </p>

      ${max <= 0 || withData.length < 2 ? '' : `
      <div class="bar-chart bar-chart--mini" style="margin-top:16px;">
        ${debts.months.map((m) => {
    const pct = max > 0 ? Math.max(3, Math.round((m.remaining / max) * 100)) : 3;
    return `
          <div class="bar-chart__col" title="${formatMonthYear(m.periodKey)} · kalan ${formatMoney(m.remaining, { decimals: false })}">
            <div class="bar-chart__track">
              <div class="bar-chart__bar ${m.remaining > 0 ? 'has-value' : ''}" style="height:${pct}%"></div>
            </div>
            <div class="bar-chart__label">${formatMonthYear(m.periodKey).slice(0, 3)}</div>
          </div>`;
  }).join('')}
      </div>
      <p class="field__hint" style="margin:8px 0 0;">Ay ay kalan borç — çubuklar kısalıyorsa borç eriyor.</p>`}
    </div>
  `;
}

function yearTableHTML(finance, ySummary) {
  const rows = finance.months.filter((m) => m.income > 0 || m.spent > 0 || m.invested > 0);
  if (rows.length === 0) return '';
  const hoursOf = (periodKey) => ySummary.months.find((m) => m.periodKey === periodKey)?.hours || 0;

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">${finance.year} ay ay döküm</span>
      <span class="section-header__note">${rows.length} ay · satıra dokun, o döneme git</span>
    </div>
    <div class="card">
      <div class="year-table__scroll">
        <table class="year-table">
          <thead>
            <tr><th>Ay</th><th>Mesai</th><th>Gelir</th><th>Harcama</th><th>Yatırım</th><th>Kalan</th></tr>
          </thead>
          <tbody>
            ${rows.map((m) => `
              <tr data-year-month="${m.periodKey}">
                <td>${formatMonthYear(m.periodKey).replace(` ${finance.year}`, '')}</td>
                <td>${formatHours(hoursOf(m.periodKey))}</td>
                <td>${formatMoney(m.income, { decimals: false })}</td>
                <td>${formatMoney(m.spent, { decimals: false })}</td>
                <td>${m.invested > 0 ? formatMoney(m.invested, { decimals: false }) : '—'}</td>
                <td>${formatMoney(m.remaining, { decimals: false })}</td>
              </tr>
            `).join('')}
            <tr class="is-total">
              <td>Toplam</td>
              <td>${formatHours(ySummary.totalHours)}</td>
              <td>${formatMoney(finance.income, { decimals: false })}</td>
              <td>${formatMoney(finance.spent, { decimals: false })}</td>
              <td>${formatMoney(finance.invested, { decimals: false })}</td>
              <td>${formatMoney(finance.remaining, { decimals: false })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${finance.byCategory.length === 0 ? '' : `
      <div class="section-title" style="font-size:12px;margin-top:18px;">Yıl boyunca harcama kırılımı</div>
      <div class="lifetime lifetime--grid">
        ${finance.byCategory.map((c) => `
          <div class="lifetime__row">
            <span class="lifetime__dot" style="background:${c.color}"></span>
            <span><span class="lifetime__label">${c.label}</span>
              <span class="lifetime__avg">%${((c.amount / finance.spent) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} · ayda ${formatMoney(c.amount / 12, { decimals: false })}</span>
            </span>
            <span class="lifetime__total">${formatMoney(c.amount, { decimals: false })}</span>
          </div>
        `).join('')}
      </div>`}
    </div>
  `;
}

// --- Derin analiz ---------------------------------------------------------
//
// "Zam aldım ama eridim mi?", "hangi kategori kaçıyor?", "mesai gelirimin
// ne kadarı?" — tek yıla bakarak cevaplanamayan sorular.

function analysisHTML(state, year) {
  const years = yearsWithData(state);
  const trend = categoryTrend(state, `${year}-12`, 12);
  const prev = years.find((y) => y < year);
  const comparison = prev ? compareYears(state, prev, year) : null;
  const real = prev ? realChange(state, prev, year) : null;
  const shares = overtimeShareByYear(state, years.slice(0, 3));

  if (!comparison && trend.length === 0) return '';

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Analiz</span>
      <span class="section-header__note">${prev ? `${prev} — ${year} karşılaştırması` : 'karşılaştırma için önceki yıl verisi gerekiyor'}</span>
    </div>
    <div class="panes">
      <div class="pane">
        ${comparison ? `
        <div class="card">
          ${realHTML(real, prev, year)}
          <div class="year-table__scroll" style="margin-top:12px;">
            <table class="year-table">
              <thead><tr><th></th><th>${prev}</th><th>${year}</th><th>Değişim</th></tr></thead>
              <tbody>
                ${comparison.rows.map((r) => `
                  <tr>
                    <td>${r.label}</td>
                    <td>${r.money ? formatMoney(r.from, { decimals: false }) : formatHours(r.from)}</td>
                    <td>${r.money ? formatMoney(r.to, { decimals: false }) : formatHours(r.to)}</td>
                    <td>${changeCell(r)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
        ${shareHTML(shares)}
      </div>
      <div class="pane">
        ${trendHTML(trend)}
      </div>
    </div>
  `;
}

function changeCell(row) {
  if (row.pct === null) return '<span style="color:var(--text-tertiary);">—</span>';
  const up = row.pct >= 0;
  // Harcamada artış kötü, gelirde iyi: rengi anlamına göre seç.
  const good = row.lowerIsBetter ? !up : up;
  return `<span class="${good ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}%${Math.abs(row.pct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>`;
}

function realHTML(real, prev, year) {
  if (!real) return `<div class="section-title" style="margin-top:0;">${year} · ${prev} karşılaştırması</div>`;
  if (!real.reliable) {
    return `
      <div class="section-title" style="margin-top:0;">Zam mı, erime mi?</div>
      <p class="analysis-verdict" style="color:var(--text-tertiary);">
        ${prev} yılında yalnız <b>${real.baseMonths} ay</b> veri var — yüzdeler yanıltır, yorum yapmıyorum.
        Aşağıdaki tablodaki tutarlar yine de doğru.
      </p>
    `;
  }
  const good = real.better;
  const pts = Math.abs(real.gapPoints).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return `
    <div class="section-title" style="margin-top:0;">Zam mı, erime mi?</div>
    <p class="analysis-verdict ${good ? 'is-positive' : 'is-negative'}">
      Gelirin <b>%${real.incomePct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</b>,
      harcaman <b>%${real.spentPct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</b> değişti —
      ${good ? `${pts} puan öndesin.` : `${pts} puan geridesin.`}
    </p>
  `;
}

function shareHTML(shares) {
  const rows = shares.filter((s) => s.income > 0);
  if (rows.length === 0) return '';
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Gelirinin ne kadarı mesai?</div>
      <div class="rows">
        ${rows.map((s) => `
          <div class="row">
            <span class="row__label">${s.year} <span style="color:var(--text-tertiary);">${formatHours(s.hours)}</span></span>
            <span class="row__value">%${s.share.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span style="color:var(--text-tertiary);font-weight:600;">${formatMoney(s.overtimePay, { decimals: false })}</span></span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

const DIRECTION_LABEL = { artıyor: '▲ artıyor', azalıyor: '▼ azalıyor', sabit: '● sabit', yeni: '· yeni' };

function trendHTML(rows) {
  if (rows.length === 0) return '';
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Kategori trendi <span style="font-weight:500;color:var(--text-tertiary);">son 12 ay</span></div>
      <div class="trend-list">
        ${rows.slice(0, 8).map((r) => `
          <div class="trend-row">
            <span class="trend-row__dot" style="background:${r.color}"></span>
            <span class="trend-row__label">${r.label}</span>
            ${sparklineSVG(r.months, r.color)}
            <span class="trend-row__total">${formatMoney(r.total, { decimals: false })}</span>
            <span class="trend-row__dir trend-row__dir--${r.direction}">${DIRECTION_LABEL[r.direction] || ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Küçük çizgi grafik — kütüphane yok, tek path.
function sparklineSVG(months, color) {
  const w = 72;
  const h = 22;
  const max = Math.max(...months, 1);
  const step = months.length > 1 ? w / (months.length - 1) : w;
  const points = months.map((m, i) => `${(i * step).toFixed(1)},${(h - (m / max) * (h - 2) - 1).toFixed(1)}`);
  return `
    <svg class="trend-row__spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `;
}

// --- Bordro karşılaştırma (yıl) -------------------------------------------
//
// Tek döneme bakmak bir kalemin HER AY eksik yattığını göstermez; kalıp ancak
// aylar yan yana görülünce çıkar.

function payslipSectionHTML(state, year) {
  const periodKeys = [];
  for (let m = 1; m <= 12; m += 1) periodKeys.push(`${year}-${String(m).padStart(2, '0')}`);
  const summaries = periodKeys.map((k) => periodSummary(state, k));
  const rows = payslipRows(state, summaries);
  if (rows.length === 0) return '';

  const stats = payslipStats(state, summaries);
  const totals = payslipLineTotals(state, summaries);
  const balance = openBalance(rows);
  const diffCls = stats.totalDiff < -1 ? 'is-negative' : stats.totalDiff > 1 ? 'is-positive' : '';
  const lineOf = (row, key) => row.lines.find((l) => l.key === key);
  const withHours = rows.some((r) => r.hours);

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Bordro karşılaştırma · ${year}</span>
      <button class="section-header__link" id="payslipPageLink" type="button">Yıllık giriş ›</button>
    </div>
    <div class="card">
      <p class="field__hint" style="margin:-2px 0 12px;">
        Kontrol edilen <b>${stats.checked} ay</b> · ${stats.match} tuttu${stats.short > 0 ? ` · <b style="color:var(--negative);">${stats.short} eksik</b>` : ''}${stats.over > 0 ? ` · ${stats.over} fazla` : ''}
        ${Math.abs(stats.totalDiff) > 1 ? ` · toplam <b class="${diffCls}">${stats.totalDiff > 0 ? '+' : '−'}${formatMoney(Math.abs(stats.totalDiff), { decimals: false })}</b>` : ''}
      </p>

      <div class="year-table__scroll">
        <table class="year-table">
          <thead>
            <tr><th>Ay</th><th>Beklenen</th><th>Net maaş</th><th>Yol</th><th>Toplam</th>${withHours ? '<th>Saat farkı</th>' : ''}<th>Fark</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
    const maas = lineOf(r, 'amount');
    const yol = lineOf(r, 'transport');
    return `
              <tr data-payslip-period="${r.periodKey}">
                <td>${formatMonthYear(r.periodKey).replace(` ${year}`, '')}</td>
                <td>${formatMoney(r.expected, { decimals: false })}</td>
                <td>${maas ? formatMoney(maas.paid, { decimals: false }) : '—'}</td>
                <td>${yol ? formatMoney(yol.paid, { decimals: false }) : '—'}</td>
                <td>${formatMoney(r.paid, { decimals: false })}</td>
                ${withHours ? `<td>${hoursDiffCell(r)}</td>` : ''}
                <td>${Math.abs(r.diff) <= 1
      ? '<span class="is-positive">tuttu ✓</span>'
      : `<span class="${r.diff < 0 ? 'is-negative' : 'is-positive'}">${r.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(r.diff), { decimals: false })}</span>`}
                  ${r.compensatedBy ? `<div class="payslip-sub is-positive">↩ ${locative(formatMonthYear(r.compensatedBy).replace(` ${year}`, ''))} telafi</div>` : ''}</td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>

      ${balanceSummaryHTML(balance)}

      <div class="section-title" style="font-size:12px;margin-top:18px;">Kalem bazında yıl toplamı</div>
      <div class="rows rows--receipt">
        ${totals.map((t) => `
          <div class="row">
            <span class="row__label">${t.label} <span style="color:var(--text-tertiary);">${t.months} ay · beklenen ${formatMoney(t.expected, { decimals: false })}</span></span>
            <span class="row__leader"></span>
            <span class="row__value">
              ${formatMoney(t.paid, { decimals: false })}
              <span class="payslip-line__diff ${Math.abs(t.diff) <= 1 ? '' : t.diff < 0 ? 'is-negative' : 'is-positive'}">
                ${Math.abs(t.diff) <= 1 ? '✓' : `${t.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(t.diff), { decimals: false })}`}
              </span>
            </span>
          </div>`).join('')}
      </div>
    </div>
  `;
}

// Saat farkı hücresi: bordroda saat yazmayan ay için "—".
function hoursDiffCell(row) {
  if (!row.hours) return '<span style="color:var(--text-tertiary);">—</span>';
  const h = row.hours;
  if (h.status === 'match') return '<span class="is-positive">tuttu ✓</span>';
  return `<span class="${h.diff < 0 ? 'is-negative' : 'is-positive'}">${h.diff > 0 ? '+' : '−'}${formatHours(Math.abs(h.diff))}</span>`;
}

// Yılın alacak özeti: telafi edilen ve kabul edilen düşülmüş açık tutar.
function balanceSummaryHTML(balance) {
  if (balance.open <= 1 && balance.compensated <= 1 && balance.accepted <= 1) return '';
  const extras = [];
  if (balance.compensated > 1) extras.push(`${formatMoney(balance.compensated, { decimals: false })} telafi edildi`);
  if (balance.accepted > 1) extras.push(`${formatMoney(balance.accepted, { decimals: false })} kabul edildi`);
  return `
    <div class="rows rows--receipt" style="margin-top:14px;">
      <div class="row row--total">
        <span class="row__label">Açık alacağın</span>
        <span class="row__leader"></span>
        <span class="row__value ${balance.open > 1 ? 'is-negative' : 'is-positive'}">${formatMoney(balance.open, { decimals: false })}</span>
      </div>
      ${extras.length ? `<div class="row"><span class="row__label" style="font-size:12.5px;color:var(--text-tertiary);">${extras.join(' · ')}</span></div>` : ''}
    </div>`;
}
