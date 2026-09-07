// Gider raporu: para nereye gitti, ne kadarı sabit, borç eriyor mu.

import { currentPeriodKey, periodLabel } from '../../period.js';
import { yearFinance, budgetSummary, lifetimeByCategory, monthlySpendBuckets } from '../../budget.js';
import { debtReport } from '../../loans.js';
import { yearsWithData, compareYears, realChange, categoryTrend } from '../../analysis.js';
import { formatMoney, formatMonthYear } from '../../format.js';
import { yearCardHTML, wireYearNav, changeCell, escapeHTML, visibleMonths } from './shared.js';
import { subExportHTML, wireSubExport } from './export.js';

const DIRECTION_LABEL = { artıyor: '▲ artıyor', azalıyor: '▼ azalıyor', sabit: '● sabit', yeni: '· yeni' };

export function render(container, state, ctx) {
  const year = ctx.reportYear || Number(currentPeriodKey().slice(0, 4));
  const finance = yearFinance(state, year);
  const yearPeriods = finance.months.map((m) => m.periodKey);
  const debts = debtReport(state, yearPeriods);

  // Sabit / değişken yılın tamamı için toplanır.
  let fixedTotal = 0;
  let variableTotal = 0;
  for (const key of yearPeriods) {
    const b = budgetSummary(state, key);
    fixedTotal += b.fixedTotal;
    variableTotal += b.variableTotal;
  }

  const spendMonths = visibleMonths(finance).filter((m) => m.spent > 0);
  const sub = `${formatMoney(finance.spent, { decimals: false })} harcama · ${spendMonths.length} ay`;

  container.innerHTML = `
    ${yearCardHTML(year, sub)}

    <div class="stat-strip stat-strip--kpi">
      <div class="stat-strip__item stat-strip__item--wide">
        <div class="stat-strip__label">${year} harcaman</div>
        <div class="stat-strip__value">${formatMoney(finance.spent, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Borca ödenen</div>
        <div class="stat-strip__value">${formatMoney(debts.totalPaid, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider stat-strip__divider--wide"></div>
      <div class="stat-strip__item stat-strip__item--desktop">
        <div class="stat-strip__label">Yatırıma ayrılan</div>
        <div class="stat-strip__value">${formatMoney(finance.invested, { decimals: false })}</div>
      </div>
    </div>

    <div class="panes">
      <div class="pane">
        ${categorySectionHTML(finance, fixedTotal, variableTotal, spendMonths.length)}
        ${monthlySectionHTML(state, year, spendMonths)}
      </div>
      <div class="pane">
        ${debtSectionHTML(debts, year)}
        ${lifetimeSectionHTML(state)}
        ${analysisHTML(state, year)}
      </div>
    </div>

    ${subExportHTML('exportExpenseReport', 'Gider raporunu HTML indir')}
  `;

  wireYearNav(container, ctx, year, sub);
  wireSubExport(container, state, ctx, year, { id: 'exportExpenseReport', scope: 'expense', fileName: 'gider-raporu' });
}

// --- Kategori dökümü ------------------------------------------------------
function categorySectionHTML(finance, fixedTotal, variableTotal, monthCount) {
  if (finance.spent <= 0) {
    return `
      <div class="section-header"><span class="section-title" style="margin:0;">Kategori dökümü</span></div>
      <div class="card empty">
        <div class="empty__title">Bu yıl harcama kaydı yok</div>
        <div class="empty__sub">Gider sekmesinden harcama ekledikçe döküm burada oluşur.</div>
      </div>`;
  }
  const fixedPct = (fixedTotal / finance.spent) * 100;
  // Aylık ortalama VERİ OLAN aya bölünür; 12'ye bölmek yılın başındaki
  // boş ayları da sayıp ortalamayı yapay olarak düşürüyordu.
  const divisor = Math.max(1, monthCount);
  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Kategori dökümü</span>
      <span class="section-header__note">${monthCount} ayda</span>
    </div>
    <div class="card">
      ${fixedTotal > 0 ? `
      <div class="fixvar">
        <div class="fixvar__bar" role="img" aria-label="Sabit ve değişken gider oranı">
          <span class="fixvar__seg fixvar__seg--fixed" style="width:${fixedPct.toFixed(2)}%"></span>
        </div>
        <div class="fixvar__legend">
          <span><span class="fixvar__dot fixvar__dot--fixed"></span>Sabit ${formatMoney(fixedTotal, { decimals: false })} <small>%${Math.round(fixedPct)}</small></span>
          <span><span class="fixvar__dot"></span>Değişken ${formatMoney(variableTotal, { decimals: false })} <small>%${Math.round(100 - fixedPct)}</small></span>
        </div>
      </div>` : ''}
      <div class="lifetime" style="margin-top:12px;">
        ${finance.byCategory.map((c) => `
          <div class="lifetime__row">
            <span class="lifetime__dot" style="background:${c.color}"></span>
            <span>
              <span class="lifetime__label">${escapeHTML(c.label)}</span>
              <span class="lifetime__avg">%${((c.amount / finance.spent) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} · ayda ${formatMoney(c.amount / divisor, { decimals: false })}</span>
            </span>
            <span class="lifetime__total">${formatMoney(c.amount, { decimals: false })}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- Ay ay harcama --------------------------------------------------------
function monthlySectionHTML(state, year, spendMonths) {
  if (spendMonths.length === 0) return '';
  const buckets = monthlySpendBuckets(state, `${year}-12`, 12);
  const max = Math.max(...buckets.map((b) => b.spent), 1);
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Ay ay harcama</span></div>
    <div class="card">
      <div class="bar-chart">
        ${buckets.map((b) => `
          <div class="bar-chart__col" title="${escapeHTML(formatMonthYear(b.periodKey))} · ${formatMoney(b.spent, { decimals: false })}">
            <div class="bar-chart__track">
              <div class="bar-chart__bar ${b.spent > 0 ? 'has-value' : ''}" style="height:${Math.max(3, Math.round((b.spent / max) * 100))}%"></div>
            </div>
            <div class="bar-chart__label">${escapeHTML(formatMonthYear(b.periodKey).slice(0, 3))}</div>
          </div>`).join('')}
      </div>
      <p class="field__hint" style="margin:10px 0 0;">
        En yüksek ay ${formatMoney(max, { decimals: false })} · yıl ortalaması
        ${formatMoney(buckets.reduce((t, b) => t + b.spent, 0) / Math.max(1, spendMonths.length), { decimals: false })}
      </p>
    </div>`;
}

// --- Borçlar --------------------------------------------------------------
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
            <span class="row__label"><span class="dot" style="background:${row.color};"></span>${escapeHTML(row.label)}</span>
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
          <div class="bar-chart__col" title="${escapeHTML(formatMonthYear(m.periodKey))} · kalan ${formatMoney(m.remaining, { decimals: false })}">
            <div class="bar-chart__track">
              <div class="bar-chart__bar ${m.remaining > 0 ? 'has-value' : ''}" style="height:${pct}%"></div>
            </div>
            <div class="bar-chart__label">${escapeHTML(formatMonthYear(m.periodKey).slice(0, 3))}</div>
          </div>`;
  }).join('')}
      </div>
      <p class="field__hint" style="margin:8px 0 0;">Ay ay kalan borç — çubuklar kısalıyorsa borç eriyor.</p>`}
    </div>`;
}

// --- Bugüne kadar ---------------------------------------------------------
// İlk veri ayından bugüne ayda bir budgetSummary çalıştırır. Veri boyutunda
// sorun değil; yıllara yayılan çok büyük veride gözden geçirilmeli.
function lifetimeSectionHTML(state) {
  const res = lifetimeByCategory(state);
  if (res.total <= 0) return '';
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Bugüne kadar nereye gitti</span></div>
    <div class="card">
      <div class="hero__value" style="font-size:24px;">${formatMoney(res.total, { decimals: false })}</div>
      <div class="hero__sub" style="text-align:left;margin-top:2px;">${res.months} aylık toplam harcama</div>
      <div class="lifetime" style="margin-top:10px;">
        ${res.categories.slice(0, 6).map((c) => `
          <div class="lifetime__row">
            <span class="lifetime__dot" style="background:${c.color}"></span>
            <span>
              <span class="lifetime__label">${escapeHTML(c.label)}</span>
              <span class="lifetime__avg">ayda ${formatMoney(c.monthlyAvg, { decimals: false })}</span>
            </span>
            <span class="lifetime__total">${formatMoney(c.amount, { decimals: false })}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- Analiz ---------------------------------------------------------------
function analysisHTML(state, year) {
  const years = yearsWithData(state);
  const trend = categoryTrend(state, `${year}-12`, 12);
  const prev = years.find((y) => y < year);
  const comparison = prev ? compareYears(state, prev, year) : null;
  const real = prev ? realChange(state, prev, year) : null;
  if (!comparison && trend.length === 0) return '';

  const keys = ['spent', 'invested'];
  const rows = comparison ? comparison.rows.filter((r) => keys.includes(r.key)) : [];

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Analiz</span>
      ${prev ? `<span class="section-header__note">${prev} — ${year}</span>` : ''}
    </div>
    ${comparison ? `
    <div class="card">
      ${realHTML(real, prev, year)}
      <div class="year-table__scroll" style="margin-top:12px;">
        <table class="year-table">
          <thead><tr><th></th><th>${prev}</th><th>${year}</th><th>Değişim</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${escapeHTML(r.label)}</td>
                <td>${formatMoney(r.from, { decimals: false })}</td>
                <td>${formatMoney(r.to, { decimals: false })}</td>
                <td>${changeCell(r)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
    ${trendHTML(trend)}`;
}

function realHTML(real, prev, year) {
  if (!real) return `<div class="section-title" style="margin-top:0;">${year} · ${prev} karşılaştırması</div>`;
  if (!real.reliable) {
    const eksik = real.basePayslipMonths < 6
      ? `${prev} yılında yalnız <b>${real.basePayslipMonths} ay bordro</b> girilmiş`
      : `${prev} yılında yalnız <b>${real.baseMonths} ay</b> veri var`;
    return `
      <div class="section-title" style="margin-top:0;">Zam mı, erime mi?</div>
      <p class="analysis-verdict" style="color:var(--text-tertiary);">
        ${eksik} — yüzdeler yanıltır, yorum yapmıyorum.
        Aşağıdaki tablodaki tutarlar yine de doğru.
      </p>`;
  }
  const good = real.better;
  const pts = Math.abs(real.gapPoints).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return `
    <div class="section-title" style="margin-top:0;">Zam mı, erime mi?</div>
    <p class="analysis-verdict ${good ? 'is-positive' : 'is-negative'}">
      Eline geçen <b>%${real.incomePct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</b>,
      harcaman <b>%${real.spentPct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</b> değişti —
      ${good ? `${pts} puan öndesin.` : `${pts} puan geridesin.`}
    </p>`;
}

function trendHTML(rows) {
  if (rows.length === 0) return '';
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Kategori trendi <span style="font-weight:500;color:var(--text-tertiary);">son 12 ay</span></div>
      <div class="trend-list">
        ${rows.slice(0, 8).map((r) => `
          <div class="trend-row">
            <span class="trend-row__dot" style="background:${r.color}"></span>
            <span class="trend-row__label">${escapeHTML(r.label)}</span>
            ${sparklineSVG(r.months, r.color)}
            <span class="trend-row__total">${formatMoney(r.total, { decimals: false })}</span>
            <span class="trend-row__dir trend-row__dir--${r.direction}">${DIRECTION_LABEL[r.direction] || ''}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function sparklineSVG(months, color) {
  const w = 72;
  const h = 22;
  const max = Math.max(...months, 1);
  const step = months.length > 1 ? w / (months.length - 1) : w;
  const points = months.map((m, i) => `${(i * step).toFixed(1)},${(h - (m / max) * (h - 2) - 1).toFixed(1)}`);
  return `
    <svg class="trend-row__spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
    </svg>`;
}
