// Yatırım raporu (HTML): yalnızca yatırımı anlatan, yazdırılabilir tek dosya.
// Yatırım > Özet sayfasından indirilir. Mesai/gider raporlarındaki portföy
// bölümünden farkı: değer seyri grafiği, hedefler ve tüm alım/satım defteri de var.
//
// Saf bir üreticidir: state, piyasa önbelleği ve (varsa) USD kurlarını alır,
// dizgi döndürür — DOM'a ve depoya dokunmaz, bu yüzden test edilebilir.

import {
  portfolioSummary, portfolioByKind, portfolioHistory, portfolioUsd, goalProgress,
  allocationGap, cleanTargets, recentLots, isSell, formatQuantity,
} from '../investments.js';
import { formatMoney, formatFullDate, formatMonthYear, todayISO } from '../format.js';
import {
  escapeHTML, todayLabel, statCard, htmlShell, portfolioTable,
} from './htmlReport.js';

const UP = '#12946b';
const DOWN = '#c9402f';

function signed(value, opts = { decimals: false }) {
  return `${value >= 0 ? '+' : '−'}${formatMoney(Math.abs(value), opts)}`;
}

function pctText(value) {
  return `%${Math.abs(value).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/**
 * Değer seyri: gömülü SVG (dış bağımlılık yok, yazdırmada da çıkar). Değer düz
 * çizgi, yatırılan maliyet kesik çizgi; iki çizgi arasındaki fark kârdır.
 */
export function valueChartSVG(points) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const W = 720;
  const H = 210;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const values = points.flatMap((p) => [p.value, p.cost]);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const x = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const path = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const label = (iso) => formatFullDate(iso);
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Portföy değeri ${escapeHTML(label(first.date))} ile ${escapeHTML(label(last.date))} arasında">
      <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#e6e8ee" stroke-width="1" />
      <path d="${path('cost')}" fill="none" stroke="#9aa2b1" stroke-width="1.6" stroke-dasharray="5 4" />
      <path d="${path('value')}" fill="none" stroke="#f5900f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
      <text x="${padL}" y="${padT - 2}" font-size="10" fill="#9aa2b1">${escapeHTML(formatMoney(max, { decimals: false }))}</text>
      <text x="${padL}" y="${H - padB - 4}" font-size="10" fill="#9aa2b1">${escapeHTML(formatMoney(min, { decimals: false }))}</text>
      <text x="${padL}" y="${H - 8}" font-size="10" fill="#9aa2b1">${escapeHTML(label(first.date))}</text>
      <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="10" fill="#9aa2b1">${escapeHTML(label(last.date))}</text>
    </svg>
    <p style="color:#5b6472;font-size:12px;margin:4px 0 0;">
      <span style="color:#f5900f;font-weight:700;">━</span> Portföy değeri &nbsp;
      <span style="color:#9aa2b1;font-weight:700;">╌</span> Yatırılan maliyet
    </p>`;
}

function goalsSection(state, portfolio) {
  const settings = state.settings || {};
  const goal = goalProgress(settings.investGoal, portfolio.totalValue, todayISO());
  const targets = cleanTargets(settings.investTargets);
  if (!goal && !targets) return '';

  let html = '<h2>Hedefler</h2>';
  if (goal) {
    const when = goal.byMonth ? ` — ${escapeHTML(formatMonthYear(goal.byMonth))}'a kadar` : '';
    const note = goal.reached
      ? 'Hedefe ulaşıldı.'
      : goal.overdue
        ? `Hedef tarihi geçti; kalan ${formatMoney(goal.remaining, { decimals: false })}.`
        : goal.byMonth
          ? `Hedefe ${goal.monthsLeft > 0 ? `${goal.monthsLeft} ay` : 'bu ay'} kaldı: ayda yaklaşık <b>${formatMoney(goal.perMonth, { decimals: false })}</b> gerekiyor.`
          : `Kalan ${formatMoney(goal.remaining, { decimals: false })}.`;
    html += `
      <p style="margin:0 0 6px;font-size:13px;"><b>Birikim hedefi: ${formatMoney(goal.amount, { decimals: false })}</b>${when}</p>
      <div style="height:9px;border-radius:99px;background:#e6e8ee;overflow:hidden;max-width:420px;">
        <div style="height:100%;width:${goal.pct.toFixed(1)}%;background:${goal.reached ? UP : '#f5900f'};"></div>
      </div>
      <p style="margin:6px 0 14px;font-size:12.5px;color:#5b6472;">${formatMoney(goal.value, { decimals: false })} · ${pctText(goal.pct)} — ${note}</p>`;
  }
  const gap = targets ? allocationGap(portfolioByKind(portfolio), targets) : [];
  if (gap.length > 0) {
    html += `
      <table class="table">
        <thead><tr><th>Tür</th><th class="num">Şu an</th><th class="num">Hedef</th><th class="num">Fark</th><th class="num">Hedefe gelmek için</th></tr></thead>
        <tbody>
          ${gap.map((g) => `
            <tr>
              <td>${escapeHTML(g.label)}</td>
              <td class="num">${pctText(g.pct)}</td>
              <td class="num">${pctText(g.targetPct)}</td>
              <td class="num" style="color:${Math.abs(g.diff) < 1 ? '#5b6472' : (g.diff > 0 ? DOWN : '#5b6472')};">${g.diff >= 0 ? '+' : '−'}${Math.abs(g.diff).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} puan</td>
              <td class="num">${Math.abs(g.diff) < 1 ? '—' : `${formatMoney(Math.abs(g.shift), { decimals: false })} ${g.shift > 0 ? 'ekle' : 'azalt'}`}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
  return html;
}

// Tüm alım ve satımlar, eskiden yeniye (kâğıt dökümle karşılaştırması kolay).
function ledgerSection(state) {
  const rows = recentLots(state, 0).reverse();
  if (rows.length === 0) return '';
  let bought = 0;
  let sold = 0;
  const body = rows.map((l) => {
    const sell = isSell(l);
    if (sell) sold += l.total; else bought += l.total;
    return `
      <tr>
        <td>${formatFullDate(l.date)}</td>
        <td>${escapeHTML(l.label)}</td>
        <td style="color:${sell ? DOWN : '#1c1913'};font-weight:${sell ? 700 : 400};">${sell ? 'Satış' : 'Alım'}</td>
        <td class="num">${formatQuantity(l.quantity, l.asset)} ${escapeHTML(l.unit)}</td>
        <td class="num">${formatMoney(l.unitCost)}</td>
        <td class="num">${formatMoney(l.total, { decimals: false })}</td>
        <td>${escapeHTML(l.note || '')}</td>
      </tr>`;
  }).join('');
  return `
    <h2>Alım ve satım defteri (${rows.length})</h2>
    <table class="table">
      <thead><tr><th>Tarih</th><th>Varlık</th><th>İşlem</th><th class="num">Miktar</th><th class="num">Birim fiyat</th><th class="num">Tutar</th><th>Not</th></tr></thead>
      <tbody>
        ${body}
        <tr class="total-row"><td colspan="5">Toplam alım</td><td class="num">${formatMoney(bought, { decimals: false })}</td><td></td></tr>
        ${sold > 0 ? `<tr class="total-row"><td colspan="5">Toplam satış</td><td class="num">${formatMoney(sold, { decimals: false })}</td><td></td></tr>` : ''}
      </tbody>
    </table>`;
}

/**
 * @param {{profileName:string, state:object, market?:object|null, usdRates?:object|null, nowMs?:number}} args
 * @returns {string} tam HTML belgesi
 */
export function buildInvestReport({ profileName, state, market = null, usdRates = null, nowMs = Date.now() }) {
  const portfolio = portfolioSummary(state, nowMs, market);
  const usd = state.settings?.investUsdView && usdRates ? portfolioUsd(state, usdRates, nowMs, market) : null;
  const { points } = portfolioHistory(state, 'all', nowMs, { market });
  const up = portfolio.totalProfit >= 0;

  const stats = [
    statCard('Portföy değeri', formatMoney(portfolio.totalValue, { decimals: false }), 'var(--accent-strong)'),
    statCard('Maliyet', formatMoney(portfolio.totalCost, { decimals: false })),
    portfolio.totalCost > 0 ? statCard('Kâr / zarar', `${signed(portfolio.totalProfit)} (${pctText(portfolio.profitPct)})`, up ? UP : DOWN) : '',
    portfolio.totalRealized ? statCard('Satışlardan gerçekleşen', signed(portfolio.totalRealized), portfolio.totalRealized >= 0 ? UP : DOWN) : '',
    usd ? statCard('Dolar bazında getiri', `${usd.profit >= 0 ? '+' : '−'}${pctText(usd.profitPct)} (${usd.profit >= 0 ? '+' : '−'}$${Math.abs(usd.profit).toLocaleString('tr-TR', { maximumFractionDigits: 0 })})`, usd.profit >= 0 ? UP : DOWN) : '',
  ].join('');

  return htmlShell({
    title: `Yatırım Raporu — ${escapeHTML(profileName)}`,
    headerTitle: `${escapeHTML(profileName)} — Yatırım raporu`,
    metaRight: `Oluşturulma: <b>${todayLabel()}</b>`,
    body: `
      <div class="stats">${stats}</div>
      ${usd ? `<p style="color:#5b6472;font-size:12px;margin:-6px 0 14px;">Dolar bazında: her alım/satım kendi gününün USD/TRY kuruyla, güncel değer bugünkü kurla (${usd.rateNow.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}) hesaplanır; yaklaşık bir değerdir.</p>` : ''}
      ${points.length >= 2 ? `<h2>Değer seyri</h2><div class="chart">${valueChartSVG(points)}</div>` : ''}
      ${portfolioTable(portfolio)}
      ${goalsSection(state, portfolio)}
      ${ledgerSection(state)}
    `,
  });
}
