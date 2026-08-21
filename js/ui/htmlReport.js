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

function adjustmentRows(adjustments) {
  if (adjustments.length === 0) return '';
  return `
    <h2>Ek kalemler</h2>
    <table class="table">
      <thead><tr><th>Kalem</th><th class="num">Tutar</th></tr></thead>
      <tbody>
        ${adjustments.map((a) => `
          <tr>
            <td>${escapeHTML(a.label || ADJ_LABEL[a.kind] || a.kind)}</td>
            <td class="num" style="color:${a.kind === 'bonus' ? '#12946b' : '#e2483d'};">
              ${a.kind === 'bonus' ? '+' : '−'} ${formatMoney(a.amount)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function buildHtmlReport({ profileName, periodKey, summary, settings }) {
  const payDate = payDateForPeriod(periodKey, settings);
  const payDateLabel = formatFullDate(
    `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, '0')}-${String(payDate.getDate()).padStart(2, '0')}`
  );

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mesai Raporu — ${escapeHTML(profileName)} — ${periodLabel(periodKey)}</title>
<style>
  :root {
    --accent: #f5900f;
    --accent-strong: #d97706;
    --text: #14171f;
    --text-secondary: #5b6472;
    --border: #e6e8ee;
    --bg-soft: #f7f8fb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: var(--text);
    background: #fff;
    max-width: 820px;
    margin: 0 auto;
    line-height: 1.4;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  .header__meta { text-align: right; font-size: 13px; color: var(--text-secondary); }
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

  @media print {
    body { padding: 12mm; max-width: none; }
    .stat { background: #fff; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="header__badge">Mesai Takip</div>
      <div class="header__title">${escapeHTML(profileName)} — ${periodLabel(periodKey)}</div>
    </div>
    <div class="header__meta">
      Oluşturulma: <b>${todayLabel()}</b><br />
      Ödeme tarihi: <b>${payDateLabel}</b>
    </div>
  </div>

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

  ${adjustmentRows(summary.adjustments)}

  <h2>Günlük kayıtlar (${summary.entryCount})</h2>
  ${summary.entries.length === 0 ? `<p style="color:var(--text-secondary); font-size:13px;">Bu dönemde kayıt yok.</p>` : `
    <table class="table">
      <thead><tr><th>Tarih</th><th>Gün</th><th>Tür</th><th class="num">Saat aralığı</th><th class="num">Süre</th><th class="num">Tutar</th><th>Not</th></tr></thead>
      <tbody>${entryRows(summary.entries, settings)}</tbody>
    </table>
  `}

  <div class="footer">
    <span>Mesai Takip uygulamasıyla oluşturuldu</span>
    <span>${todayLabel()}</span>
  </div>
</body>
</html>`;
}
