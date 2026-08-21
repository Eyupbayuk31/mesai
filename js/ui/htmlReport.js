// Dönem için tasarımlı, tek dosya, yazdırılabilir HTML rapor üretimi.

import { formatMoney, formatHours, formatFullDate, formatWeekday } from '../format.js';
import { entryAmount } from '../payroll.js';
import { periodLabel, payDateForPeriod } from '../period.js';

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };
const TYPE_COLOR = { normal: '#3b6fe0', weekend: '#a24fd6', holiday: '#e2483d' };
const ADJ_LABEL = { advance: 'Avans', deduction: 'Kesinti', bonus: 'Prim' };

function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayLabel() {
  return formatFullDate(new Date().toISOString().slice(0, 10));
}

function statCard(label, value, accent) {
  return `
    <div class="stat">
      <div class="stat__label">${label}</div>
      <div class="stat__value" style="${accent ? `color:${accent};` : ''}">${value}</div>
    </div>
  `;
}

function typeRows(summary, settings) {
  return ['normal', 'weekend', 'holiday']
    .filter((t) => summary.byType[t].hours > 0)
    .map((t) => `
      <tr>
        <td><span class="dot" style="background:${TYPE_COLOR[t]};"></span>${TYPE_LABEL[t]}</td>
        <td class="num">×${settings.multipliers[t]}</td>
        <td class="num">${formatHours(summary.byType[t].hours)}</td>
        <td class="num">${formatMoney(summary.byType[t].amount)}</td>
      </tr>
    `).join('');
}

function entryRows(entries, settings) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.map((e) => `
    <tr>
      <td>${formatFullDate(e.date)}</td>
      <td>${formatWeekday(e.date)}</td>
      <td><span class="dot" style="background:${TYPE_COLOR[e.type] || '#888'};"></span>${TYPE_LABEL[e.type] || e.type}</td>
      <td class="num">${e.start && e.end ? `${e.start}–${e.end}` : '—'}</td>
      <td class="num">${formatHours(e.hours)}</td>
      <td class="num">${formatMoney(entryAmount(e, settings))}</td>
      <td>${escapeHTML(e.note || '')}</td>
    </tr>
  `).join('');
}

function adjustmentRows(summary) {
  const rows = [];
  if (summary.mealPay > 0) {
    rows.push(`
      <tr>
        <td>Yemek parası (${summary.allowanceDays} gün × ${formatMoney(summary.mealAllowance, { decimals: false })})</td>
        <td class="num" style="color:#12946b;">+ ${formatMoney(summary.mealPay)}</td>
      </tr>
    `);
  }
  if (summary.transportPay > 0) {
    rows.push(`
      <tr>
        <td>Yol parası (${summary.allowanceDays} gün × ${formatMoney(summary.transportAllowance, { decimals: false })})</td>
        <td class="num" style="color:#12946b;">+ ${formatMoney(summary.transportPay)}</td>
      </tr>
    `);
  }
  for (const a of summary.adjustments) {
    rows.push(`
      <tr>
        <td>${escapeHTML(a.label || ADJ_LABEL[a.kind] || a.kind)}</td>
        <td class="num" style="color:${a.kind === 'bonus' ? '#12946b' : '#e2483d'};">
          ${a.kind === 'bonus' ? '+' : '−'} ${formatMoney(a.amount)}
        </td>
      </tr>
    `);
  }
  if (rows.length === 0) return '';
  return `
    <h2>Ek kalemler</h2>
    <table class="table">
      <thead><tr><th>Kalem</th><th class="num">Tutar</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;
}

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Yıllık mesai saatleri — gömülü SVG, dış bağımlılık yok, yazdırmada da çıkar.
function yearChartSVG(ySummary) {
  const W = 720;
  const H = 200;
  const padL = 34;
  const padB = 26;
  const padT = 12;
  const maxHours = Math.max(1, ...ySummary.months.map((m) => m.hours));
  const colW = (W - padL) / 12;
  const barW = colW * 0.56;
  const plotH = H - padB - padT;

  const bars = ySummary.months.map((m, i) => {
    const h = (m.hours / maxHours) * plotH;
    const x = padL + i * colW + (colW - barW) / 2;
    const y = padT + plotH - h;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="3" fill="${m.hours > 0 ? '#f5900f' : '#e6e8ee'}" />
      ${m.hours > 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#5b6472" font-weight="600">${String(m.hours).replace('.', ',')}</text>` : ''}
      <text x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="#9aa2b1">${MONTH_NAMES[i].slice(0, 3)}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Aylık mesai saatleri">
      <line x1="${padL}" y1="${padT + plotH}" x2="${W}" y2="${padT + plotH}" stroke="#e6e8ee" stroke-width="1" />
      <text x="0" y="${padT + 8}" font-size="9.5" fill="#9aa2b1">${String(maxHours).replace('.', ',')} sa</text>
      ${bars}
    </svg>
  `;
}

function yearTableRows(ySummary, withMeal, withTransport) {
  return ySummary.months.map((m, i) => `
    <tr>
      <td>${MONTH_NAMES[i]}</td>
      <td class="num">${formatHours(m.hours)}</td>
      <td class="num">${formatMoney(m.amount)}</td>
      ${withMeal ? `<td class="num">${formatMoney(m.meal, { decimals: false })}</td>` : ''}
      ${withTransport ? `<td class="num">${formatMoney(m.transport, { decimals: false })}</td>` : ''}
    </tr>
  `).join('');
}

// scope: 'period' (varsayılan) veya 'year'. Yıl kapsamı için yearSummary gerekir.
export function buildHtmlReport({ profileName, periodKey, summary, settings, scope = 'period', yearSummary = null }) {
  if (scope === 'year' && yearSummary) {
    return buildYearReport({ profileName, yearSummary, summary, settings });
  }
  return buildPeriodReport({ profileName, periodKey, summary, settings });
}

function buildYearReport({ profileName, yearSummary, settings }) {
  // Yan ödeme girilmişse aylık tabloya ilgili kolonlar da eklenir.
  const withMeal = Number(settings.mealAllowance) > 0;
  const withTransport = Number(settings.transportAllowance) > 0;
  return htmlShell({
    title: `Mesai Raporu — ${escapeHTML(profileName)} — ${yearSummary.year}`,
    headerTitle: `${escapeHTML(profileName)} — ${yearSummary.year} yılı`,
    metaRight: `Oluşturulma: <b>${todayLabel()}</b><br />Kapsam: <b>12 ay</b>`,
    body: `
      <div class="stats">
        ${statCard('Yıllık mesai', formatHours(yearSummary.totalHours))}
        ${statCard('Yıllık mesai ücreti', formatMoney(yearSummary.totalOvertimePay), '#12946b')}
        ${statCard('Aylık ortalama', formatHours(yearSummary.totalHours / 12))}
        ${statCard('Saat ücreti', formatMoney(settings.monthlySalary / (settings.hoursDivisor || 225)))}
      </div>

      <h2>Aylık dağılım</h2>
      <div class="chart">${yearChartSVG(yearSummary)}</div>

      <table class="table">
        <thead><tr><th>Ay</th><th class="num">Saat</th><th class="num">Tutar</th>${withMeal ? '<th class="num">Yemek</th>' : ''}${withTransport ? '<th class="num">Yol</th>' : ''}</tr></thead>
        <tbody>
          ${yearTableRows(ySummary, withMeal, withTransport)}
          <tr class="total-row">
            <td>Toplam</td>
            <td class="num">${formatHours(yearSummary.totalHours)}</td>
            <td class="num">${formatMoney(yearSummary.totalOvertimePay)}</td>
            ${withMeal ? `<td class="num">${formatMoney(yearSummary.totalMealPay, { decimals: false })}</td>` : ''}
            ${withTransport ? `<td class="num">${formatMoney(yearSummary.totalTransportPay, { decimals: false })}</td>` : ''}
          </tr>
        </tbody>
      </table>
    `,
  });
}

function buildPeriodReport({ profileName, periodKey, summary, settings }) {
  const payDate = payDateForPeriod(periodKey, settings);
  const payDateLabel = formatFullDate(
    `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, '0')}-${String(payDate.getDate()).padStart(2, '0')}`
  );

  return htmlShell({
    title: `Mesai Raporu — ${escapeHTML(profileName)} — ${periodLabel(periodKey)}`,
    headerTitle: `${escapeHTML(profileName)} — ${periodLabel(periodKey)}`,
    metaRight: `Oluşturulma: <b>${todayLabel()}</b><br />Ödeme tarihi: <b>${payDateLabel}</b>`,
    body: `
      <div class="stats">
        ${statCard('Toplam mesai', formatHours(summary.totalHours))}
        ${statCard('Mesai ücreti', formatMoney(summary.overtimePay), '#12946b')}
        ${statCard('Maaş', formatMoney(summary.baseSalary, { decimals: false }))}
        ${statCard('Net toplam', formatMoney(summary.netTotal), 'var(--accent-strong)')}
      </div>

      <h2>Mesai türü kırılımı</h2>
      <table class="table">
        <thead><tr><th>Tür</th><th class="num">Çarpan</th><th class="num">Saat</th><th class="num">Tutar</th></tr></thead>
        <tbody>
          ${typeRows(summary, settings)}
          <tr class="total-row">
            <td colspan="2">Toplam</td>
            <td class="num">${formatHours(summary.totalHours)}</td>
            <td class="num">${formatMoney(summary.overtimePay)}</td>
          </tr>
        </tbody>
      </table>

      ${adjustmentRows(summary)}

      <h2>Günlük kayıtlar (${summary.entryCount})</h2>
      ${summary.entries.length === 0 ? `<p style="color:var(--text-secondary); font-size:13px;">Bu dönemde kayıt yok.</p>` : `
        <table class="table">
          <thead><tr><th>Tarih</th><th>Gün</th><th>Tür</th><th class="num">Saat aralığı</th><th class="num">Süre</th><th class="num">Tutar</th><th>Not</th></tr></thead>
          <tbody>${entryRows(summary.entries, settings)}</tbody>
        </table>
      `}
    `,
  });
}

// Her iki rapor türünün paylaştığı sayfa kabuğu (stiller, başlık, altbilgi).
function htmlShell({ title, headerTitle, metaRight, body }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root {
    --accent: #d97d0d;
    --accent-strong: #9a5404;
    --text: #1c1913;
    --text-secondary: #5c564a;
    --border: #e7e1d2;
    --bg-soft: #f7f4ec;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 40px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: var(--text);
    background: #fff;
    max-width: 820px;
    line-height: 1.4;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2px solid var(--text);
    padding-bottom: 18px;
    margin-bottom: 24px;
  }
  .header__badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent-strong);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .header__title { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; }
  .header__meta { text-align: right; font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
  .header__meta b { color: var(--text); }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  .stat {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    background: var(--bg-soft);
  }
  .stat__label { font-size: 11.5px; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .stat__value { font-size: 19px; font-weight: 800; margin-top: 4px; letter-spacing: -0.01em; }

  h2 { font-size: 15px; font-weight: 750; margin: 28px 0 10px; letter-spacing: -0.01em; }

  .chart {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 20px;
    background: var(--bg-soft);
  }

  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-secondary);
    border-bottom: 1.5px solid var(--text);
    padding: 7px 8px;
  }
  .table td {
    padding: 8px 8px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .table tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 7px;
  }

  .total-row td { font-weight: 800; border-top: 1.5px solid var(--text); }

  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--text-secondary);
    display: flex;
    justify-content: space-between;
  }

  @media (max-width: 640px) {
    body { padding: 20px 16px; }
    .stats { grid-template-columns: repeat(2, 1fr); }
    .header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .header__meta { text-align: left; }
  }

  @media print {
    body { padding: 12mm; max-width: none; }
    .stat, .chart { background: #fff; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="header__badge">Mesai Takip</div>
      <div class="header__title">${headerTitle}</div>
    </div>
    <div class="header__meta">${metaRight}</div>
  </div>

  ${body}

  <div class="footer">
    <span>Mesai Takip uygulamasıyla oluşturuldu</span>
    <span>${todayLabel()}</span>
  </div>
</body>
</html>`;
}
