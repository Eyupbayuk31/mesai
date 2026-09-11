// Gelir raporu: para nereden geldi, bordro tuttu mu, mesai ne yaptı.

import { currentPeriodKey, periodLabel } from '../../period.js';
import { periodSummary, yearSummary } from '../../payroll.js';
import { yearFinance, scopeFinance } from '../../budget.js';
import {
  payslipRows, payslipStats, payslipLineTotals, openBalance,
  payslipFor, hasPayslipData, comparePayslip, explainPayslipDiff,
} from '../../payslip.js';
import { receivedInPeriod } from '../../received.js';
import { yearsWithData, compareYears, overtimeShareByYear } from '../../analysis.js';
import { formatMoney, formatHours, formatMonthYear, locative } from '../../format.js';
import { entryRowHTML } from '../entryRow.js';
import {
  scopeCardHTML, scopeSwitchHTML, wireScopeNav, readScope, scopeLabel,
  changeCell, escapeHTML, visibleMonths,
} from './shared.js';
import { subExportHTML, wireSubExport } from './export.js';

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function render(container, state, ctx) {
  const view = readScope(ctx);
  if (view.kind === 'month') { renderMonth(container, state, ctx, view); return; }
  renderYear(container, state, ctx, view);
}

// --- Ay kapsamı -----------------------------------------------------------
//
// Yılda sığmayan detaylar burada: o ayın bordro karşılaştırması tam
// açıklamasıyla, mesai kayıtlarının listesi, tür kırılımı. Kıyas bölümleri
// basılmaz — ay görünümü yalnız o ayın detayı.
function renderMonth(container, state, ctx, view) {
  const periodKey = view.periodKey;
  const settings = state.settings;
  const summary = periodSummary(state, periodKey);
  const received = receivedInPeriod(state, periodKey);
  const finance = scopeFinance(state, view);
  const slip = payslipFor(state, periodKey);
  const filled = hasPayslipData(slip);
  const cmp = filled ? comparePayslip(summary, slip, settings) : null;
  const explanation = cmp ? explainPayslipDiff(summary, cmp, settings) : '';

  const sub = `${received.total > 0 ? formatMoney(received.total, { decimals: false }) : 'para girişi yok'} · ${formatHours(summary.totalHours)} mesai`;

  container.innerHTML = `
    ${scopeSwitchHTML(view)}
    ${scopeCardHTML(view, sub)}

    <div class="stat-strip stat-strip--kpi">
      <div class="stat-strip__item stat-strip__item--wide">
        <div class="stat-strip__label">Eline geçen</div>
        <div class="stat-strip__value">${received.total > 0 ? formatMoney(received.total, { decimals: false }) : '—'}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Mesai</div>
        <div class="stat-strip__value">${formatHours(summary.totalHours)}</div>
      </div>
      <div class="stat-strip__divider stat-strip__divider--wide"></div>
      <div class="stat-strip__item stat-strip__item--desktop">
        <div class="stat-strip__label">Mesai ücreti</div>
        <div class="stat-strip__value">${formatMoney(summary.overtimePay, { decimals: false })}</div>
      </div>
    </div>

    <div class="panes">
      <div class="pane">
        ${monthReceivedHTML(received, periodKey)}
        ${monthPayslipHTML(periodKey, summary, cmp, explanation, filled)}
      </div>
      <div class="pane">
        ${monthEntriesHTML(summary, settings)}
      </div>
    </div>

    ${subExportHTML('exportIncomeReport', 'Gelir raporunu HTML indir')}
  `;

  wireScopeNav(container, ctx, view, sub);
  wireSubExport(container, state, ctx, view, { id: 'exportIncomeReport', scope: 'income', fileName: 'gelir-raporu' });

  container.querySelector('#monthPayslipLink')?.addEventListener('click', () => {
    ctx.payslipYear = Number(periodKey.slice(0, 4));
    ctx.payslipFocus = periodKey;
    ctx.navigate({ tab: 'income', page: 'payslip' });
  });
}

// Ay: eline geçen fişi (Özet kartındaki kalıbın aynısı).
function monthReceivedHTML(received, periodKey) {
  const label = { payslip: 'Bordro', advance: 'Avans', manual: 'Para girişi' };
  if (received.total === 0) {
    return `
      <div class="section-header"><span class="section-title" style="margin:0;">Eline geçen</span></div>
      <div class="card empty">
        <div class="empty__title">Bu ay para girişi yok</div>
        <div class="empty__sub">${escapeHTML(periodLabel(periodKey))} bordrosunu girersen bu ayın geliri burada görünür.</div>
      </div>`;
  }
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Eline geçen</span></div>
    <div class="card">
      <div class="rows rows--receipt">
        ${received.lines.map((l, i) => `
          <div class="row">
            <span class="row__label">${escapeHTML(label[l.key] || l.key)}</span>
            <span class="row__leader"></span>
            <span class="row__value ${i === 0 ? '' : 'is-positive'}">${i === 0 ? '' : '+ '}${formatMoney(l.amount, { decimals: false })}</span>
          </div>`).join('')}
        <div class="row row--total"><span class="row__label">Toplam</span><span class="row__leader"></span><span class="row__value">${formatMoney(received.total)}</span></div>
      </div>
    </div>`;
}

// Ay: bordro karşılaştırması — yıl tablosunda tek satır olan şey burada
// sebebiyle birlikte.
function monthPayslipHTML(periodKey, summary, cmp, explanation, filled) {
  const header = `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Bordro karşılaştırma</span>
      <button class="section-header__link" id="monthPayslipLink" type="button">Bordroyu aç ›</button>
    </div>`;

  if (!filled) {
    return `${header}
      <div class="card empty">
        <div class="empty__title">Bu ayın bordrosu girilmedi</div>
        <div class="empty__sub">Hesaba göre ${formatMoney(summary.payoutTotal, { decimals: false })} yatmalıydı. Cebine geçeni girersen tutup tutmadığını görürsün.</div>
      </div>`;
  }

  const durum = {
    match: { cls: 'is-positive', baslik: 'Tutuyor ✓' },
    short: { cls: 'is-negative', baslik: `${formatMoney(Math.abs(cmp.diff))} eksik` },
    over: { cls: 'is-positive', baslik: `${formatMoney(cmp.diff)} fazla` },
  }[cmp.status];

  return `${header}
    <div class="card">
      <div class="hero" style="padding-top:4px;">
        <div class="hero__value ${durum.cls}" style="font-size:26px;">${durum.baslik}</div>
        <div class="hero__sub">hesaba göre ${formatMoney(cmp.expected, { decimals: false })} · yatan ${formatMoney(cmp.paid, { decimals: false })}</div>
        ${explanation ? `<p class="hero__note">${explanation}</p>` : ''}
      </div>
      <div class="rows rows--receipt">
        ${cmp.lines.map((l) => `
          <div class="row">
            <span class="row__label">${escapeHTML(l.label)} <span style="color:var(--text-tertiary);">beklenen ${formatMoney(l.expected, { decimals: false })}</span></span>
            <span class="row__leader"></span>
            <span class="row__value">${formatMoney(l.paid, { decimals: false })}
              <span class="payslip-line__diff ${Math.abs(l.diff) <= 1 ? '' : l.diff < 0 ? 'is-negative' : 'is-positive'}">
                ${Math.abs(l.diff) <= 1 ? '✓' : `${l.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(l.diff), { decimals: false })}`}
              </span>
            </span>
          </div>`).join('')}
      </div>
    </div>`;
}

// Ay: o ayın mesai kayıtları + tür kırılımı.
function monthEntriesHTML(summary, settings) {
  const entries = [...summary.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const types = Object.entries(summary.byType).filter(([, v]) => v.hours > 0);
  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Mesai kayıtları</span>
      <span class="section-header__note">${entries.length} kayıt · ${formatHours(summary.totalHours)}</span>
    </div>
    ${types.length === 0 ? '' : `
    <div class="card">
      <div class="rows rows--receipt">
        ${types.map(([key, v]) => `
          <div class="row">
            <span class="row__label">${escapeHTML(TYPE_LABEL[key] || key)} <span style="color:var(--text-tertiary);">${formatHours(v.hours)}</span></span>
            <span class="row__leader"></span>
            <span class="row__value is-positive">${formatMoney(v.amount, { decimals: false })}</span>
          </div>`).join('')}
        <div class="row row--total"><span class="row__label">Toplam</span><span class="row__leader"></span><span class="row__value">${formatMoney(summary.overtimePay)}</span></div>
      </div>
    </div>`}
    ${entries.length === 0
    ? '<div class="card empty"><div class="empty__title">Bu ay mesai kaydın yok</div><div class="empty__sub">Kaldığın saatleri girdikçe burada listelenir.</div></div>'
    : `<ul class="list">${entries.map((e) => entryRowHTML(e, settings)).join('')}</ul>`}`;
}

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };

// --- Yıl kapsamı ----------------------------------------------------------
function renderYear(container, state, ctx, view) {
  const year = view.year;
  const finance = yearFinance(state, year);
  const ySummary = yearSummary(state, year);

  // Bordro bölümünün üç fonksiyonu da içeride payslipRows çalıştırıyor;
  // summaries bir kez hesaplanıp üçüne birden veriliyor.
  const periodKeys = [];
  for (let m = 1; m <= 12; m += 1) periodKeys.push(`${year}-${String(m).padStart(2, '0')}`);
  const summaries = periodKeys.map((k) => periodSummary(state, k));
  const slipRows = payslipRows(state, summaries);
  const balance = openBalance(slipRows);

  const sub = `${finance.incomeMonths} ay bordro · ${formatHours(ySummary.totalHours)} mesai`;

  container.innerHTML = `
    ${scopeSwitchHTML(view)}
    ${scopeCardHTML(view, sub)}

    <div class="stat-strip stat-strip--kpi">
      <div class="stat-strip__item stat-strip__item--wide">
        <div class="stat-strip__label">Yıl boyunca eline geçen</div>
        <div class="stat-strip__value">${formatMoney(finance.received, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Bordro</div>
        <div class="stat-strip__value">${finance.incomeMonths}/12</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Mesai ücreti</div>
        <div class="stat-strip__value">${formatMoney(ySummary.totalOvertimePay, { decimals: false })}</div>
      </div>
      ${balance.open > 1 ? `
      <div class="stat-strip__divider stat-strip__divider--wide"></div>
      <div class="stat-strip__item stat-strip__item--desktop">
        <div class="stat-strip__label">Açık alacak</div>
        <div class="stat-strip__value is-negative">${formatMoney(balance.open, { decimals: false })}</div>
      </div>` : ''}
    </div>

    <div class="panes">
      <div class="pane">
        ${receivedTableHTML(finance)}
        ${payslipSectionHTML(state, year, summaries, slipRows, balance)}
      </div>
      <div class="pane">
        ${hoursSectionHTML(ySummary)}
        ${analysisHTML(state, year)}
      </div>
    </div>

    ${subExportHTML('exportIncomeReport', 'Gelir raporunu HTML indir')}
  `;

  wireScopeNav(container, ctx, view, sub);
  wireSubExport(container, state, ctx, view, { id: 'exportIncomeReport', scope: 'income', fileName: 'gelir-raporu' });

  container.querySelector('#payslipPageLink')?.addEventListener('click', () => {
    // Yıl imlecini devret, yoksa kullanıcı başka yıla düşer.
    ctx.payslipYear = year;
    ctx.navigate({ tab: 'income', page: 'payslip' });
  });
  container.querySelector('[data-payslip-period]')?.closest('table')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-payslip-period]');
    if (row) { ctx.setReportPeriod(row.dataset.payslipPeriod); ctx.navigate({ tab: 'income', page: null }); }
  });
}

// --- Ay ay eline geçen ----------------------------------------------------
function receivedTableHTML(finance) {
  const rows = visibleMonths(finance).filter((m) => m.hasIncome);
  if (rows.length === 0) {
    return `
      <div class="section-header"><span class="section-title" style="margin:0;">Ay ay eline geçen</span></div>
      <div class="card empty">
        <div class="empty__title">Bu yıl bordro girilmedi</div>
        <div class="empty__sub">Bordro girdikçe hangi ay ne kadar para girdiği burada birikir.</div>
      </div>`;
  }
  const showAdvance = rows.some((m) => m.advances > 0);
  const showManual = rows.some((m) => m.manual > 0);
  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Ay ay eline geçen</span>
      <span class="section-header__note">${rows.length} ay</span>
    </div>
    <div class="card">
      <div class="year-table__scroll">
        <table class="year-table">
          <thead>
            <tr><th>Ay</th><th>Bordro</th>${showAdvance ? '<th>Avans</th>' : ''}${showManual ? '<th>Para girişi</th>' : ''}<th>Toplam</th></tr>
          </thead>
          <tbody>
            ${rows.map((m) => `
              <tr>
                <td>${escapeHTML(formatMonthYear(m.periodKey).replace(` ${m.year}`, ''))}</td>
                <td>${m.payslip > 0 ? formatMoney(m.payslip, { decimals: false }) : '—'}</td>
                ${showAdvance ? `<td>${m.advances > 0 ? formatMoney(m.advances, { decimals: false }) : '—'}</td>` : ''}
                ${showManual ? `<td>${m.manual > 0 ? formatMoney(m.manual, { decimals: false }) : '—'}</td>` : ''}
                <td>${formatMoney(m.received, { decimals: false })}</td>
              </tr>`).join('')}
            <tr class="is-total">
              <td>Toplam</td>
              <td>${formatMoney(rows.reduce((t, m) => t + m.payslip, 0), { decimals: false })}</td>
              ${showAdvance ? `<td>${formatMoney(rows.reduce((t, m) => t + m.advances, 0), { decimals: false })}</td>` : ''}
              ${showManual ? `<td>${formatMoney(rows.reduce((t, m) => t + m.manual, 0), { decimals: false })}</td>` : ''}
              <td>${formatMoney(finance.received, { decimals: false })}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// --- Mesai ----------------------------------------------------------------
function hoursSectionHTML(ySummary) {
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Mesai</span></div>
    <div class="card">
      <div class="bar-chart">${ySummary.months.map((m) => barHTML(m, ySummary)).join('')}</div>
      <div class="rows" style="margin-top:14px;">
        <div class="row"><span class="row__label">Yıllık toplam</span><span class="row__value">${formatHours(ySummary.totalHours)}</span></div>
        <div class="row"><span class="row__label">Mesai ücreti</span><span class="row__value is-positive">${formatMoney(ySummary.totalOvertimePay, { decimals: false })}</span></div>
      </div>
    </div>`;
}

function barHTML(monthData, ySummary) {
  const maxHours = Math.max(1, ...ySummary.months.map((m) => m.hours));
  const heightPct = Math.max(3, Math.round((monthData.hours / maxHours) * 100));
  const isCurrent = monthData.periodKey === currentPeriodKey();
  return `
    <div class="bar-chart__col">
      <div class="bar-chart__track">
        <div class="bar-chart__bar ${monthData.hours > 0 ? 'has-value' : ''}" style="height:${heightPct}%; ${isCurrent ? 'outline:2px solid var(--accent); outline-offset:2px;' : ''}" title="${formatHours(monthData.hours)}"></div>
      </div>
      <div class="bar-chart__label">${MONTH_SHORT[monthData.month - 1]}</div>
    </div>`;
}

// --- Bordro karşılaştırma -------------------------------------------------
function payslipSectionHTML(state, year, summaries, rows, balance) {
  if (rows.length === 0) return '';
  const stats = payslipStats(state, summaries);
  const totals = payslipLineTotals(state, summaries);
  const diffCls = stats.totalDiff < -1 ? 'is-negative' : stats.totalDiff > 1 ? 'is-positive' : '';
  const lineOf = (row, key) => row.lines.find((l) => l.key === key);
  const withHours = rows.some((r) => r.hours);

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Bordro karşılaştırma</span>
      <button class="section-header__link" id="payslipPageLink" type="button">Bordroyu aç ›</button>
    </div>
    <div class="card">
      <p class="field__hint" style="margin:-2px 0 12px;">
        Kontrol edilen <b>${stats.checked} ay</b> · ${stats.match} tuttu${stats.short > 0 ? ` · <b style="color:var(--negative);">${stats.short} eksik</b>` : ''}${stats.over > 0 ? ` · ${stats.over} fazla` : ''}
        ${Math.abs(stats.totalDiff) > 1 ? ` · toplam <b class="${diffCls}">${stats.totalDiff > 0 ? '+' : '−'}${formatMoney(Math.abs(stats.totalDiff), { decimals: false })}</b>` : ''}
      </p>

      <div class="year-table__scroll">
        <table class="year-table">
          <thead>
            <tr><th>Ay</th><th>Beklenen</th><th>Normal ücret</th><th>Yol</th><th>Toplam</th>${withHours ? '<th>Saat farkı</th>' : ''}<th>Fark</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
    const maas = lineOf(r, 'amount');
    const yol = lineOf(r, 'transport');
    return `
              <tr data-payslip-period="${r.periodKey}">
                <td>${escapeHTML(formatMonthYear(r.periodKey).replace(` ${year}`, ''))}</td>
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
            <span class="row__label">${escapeHTML(t.label)} <span style="color:var(--text-tertiary);">${t.months} ay · beklenen ${formatMoney(t.expected, { decimals: false })}</span></span>
            <span class="row__leader"></span>
            <span class="row__value">
              ${formatMoney(t.paid, { decimals: false })}
              <span class="payslip-line__diff ${Math.abs(t.diff) <= 1 ? '' : t.diff < 0 ? 'is-negative' : 'is-positive'}">
                ${Math.abs(t.diff) <= 1 ? '✓' : `${t.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(t.diff), { decimals: false })}`}
              </span>
            </span>
          </div>`).join('')}
      </div>
    </div>`;
}

function hoursDiffCell(row) {
  if (!row.hours) return '<span style="color:var(--text-tertiary);">—</span>';
  const h = row.hours;
  if (h.status === 'match') return '<span class="is-positive">tuttu ✓</span>';
  return `<span class="${h.diff < 0 ? 'is-negative' : 'is-positive'}">${h.diff > 0 ? '+' : '−'}${formatHours(Math.abs(h.diff))}</span>`;
}

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

// --- Analiz ---------------------------------------------------------------
function analysisHTML(state, year) {
  const years = yearsWithData(state);
  const prev = years.find((y) => y < year);
  const comparison = prev ? compareYears(state, prev, year) : null;
  const shares = overtimeShareByYear(state, years.slice(0, 3));
  const shareRows = shares.filter((s) => s.earned > 0);
  if (!comparison && shareRows.length === 0) return '';

  // Yalnız gelir tarafını ilgilendiren satırlar.
  const keys = ['income', 'remaining', 'hours', 'overtimePay'];
  const rows = comparison ? comparison.rows.filter((r) => keys.includes(r.key)) : [];

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Analiz</span>
      ${prev ? `<span class="section-header__note">${prev} — ${year}</span>` : ''}
    </div>
    ${comparison ? `
    <div class="card">
      ${!comparison.incomeComparable ? `
      <p class="field__hint" style="margin:-2px 0 12px;">
        Gelir oranı basılmadı: ${prev} yılında ${comparison.fromIncomeMonths}, ${year} yılında
        ${comparison.toIncomeMonths} ay bordro girilmiş. Eksik yılla kıyas yanıltır.
      </p>` : ''}
      <div class="year-table__scroll">
        <table class="year-table">
          <thead><tr><th></th><th>${prev}</th><th>${year}</th><th>Değişim</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${escapeHTML(r.label)}</td>
                <td>${r.money ? formatMoney(r.from, { decimals: false }) : formatHours(r.from)}</td>
                <td>${r.money ? formatMoney(r.to, { decimals: false }) : formatHours(r.to)}</td>
                <td>${changeCell(r)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
    ${shareRows.length === 0 ? '' : `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Hesaplanan gelirinin ne kadarı mesai?</div>
      <p class="field__hint" style="margin:-6px 0 10px;">
        Bu oran mesai kayıtlarından hesaplanır (maaş + mesai + yan ödeme), bordrodan değil.
      </p>
      <div class="rows">
        ${shareRows.map((s) => `
          <div class="row">
            <span class="row__label">${s.year} <span style="color:var(--text-tertiary);">${formatHours(s.hours)}</span></span>
            <span class="row__value">%${s.share.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span style="color:var(--text-tertiary);font-weight:600;">${formatMoney(s.overtimePay, { decimals: false })}</span></span>
          </div>`).join('')}
      </div>
    </div>`}`;
}
