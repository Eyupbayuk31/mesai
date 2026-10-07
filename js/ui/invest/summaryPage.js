// Yatırım > Özet: salt okunur pano. Hero (değer, kâr/zarar, gerçekleşen, dolar
// bazında), dağılım, hedefler, değer seyri, aylık yatırım ve en altta HTML rapor.
// Alım/satım girişi ana Yatırım sayfasında; burada hiçbir kayıt yazılmaz.

import {
  portfolioSummary, donutSlices, DONUT_RADIUS, monthlyInvestBuckets, portfolioByKind,
  bestWorstAsset, goalProgress, allocationGap, cleanTargets, portfolioUsd,
} from '../../investments.js';
import { getCachedUsdRates } from '../../usdRates.js';
import { getCachedMarket, getMarketLog } from '../../marketPrices.js';
import { currentPeriodKey, periodLabel } from '../../period.js';
import { formatMoney, formatMonthYear, todayISO } from '../../format.js';
import { profileName } from '../../profile.js';
import { portfolioChartHTML, bindPortfolioChart } from '../investChart.js';
import { downloadFile } from '../exportUtils.js';
import { buildInvestReport } from '../investReport.js';
import { showToast } from '../toast.js';
import { formatPct, escapeHTML, marketTimeLabel, formatUsd, priceWarning } from './shared.js';
import { openGoalSheet } from './goalSheet.js';
import { bindMarketBits } from './bindings.js';
import { exportLots } from './lotsPage.js';

export const summaryPageTitle = 'Özet';


// --- Sayfa ---------------------------------------------------------------

export function renderSummary(container, state, ctx) {
  const market = getCachedMarket();
  const summary = portfolioSummary(state, Date.now(), market);
  const range = ctx.investRange || '6m';
  const chartExtra = { market, marketLog: getMarketLog(), estimated: summary.estimatedCount > 0 };
  ctx.refreshMarket?.();
  ctx.refreshUsd?.();

  if (summary.positions.length === 0) {
    container.innerHTML = `
      <div class="card empty">
        <div class="empty__title">Özet için henüz yatırım yok</div>
        <div class="empty__sub">İlk alımını Yatırım sayfasından ekle; değer, kâr/zarar ve grafikler burada görünür.</div>
        <button class="btn btn--primary" id="goInvest" type="button" style="margin-top:14px;">Alım ekle</button>
      </div>`;
    container.querySelector('#goInvest').addEventListener('click', () => ctx.navigate({ tab: 'invest', page: null }));
    return;
  }

  const usdOn = !!state.settings?.investUsdView;
  const usd = usdOn ? portfolioUsd(state, getCachedUsdRates()?.rates, Date.now(), market) : null;

  container.innerHTML = `
    <div class="panes">
      <div class="pane">
        ${dashboardHTML(summary, market, usdOn ? { usd } : null)}
        ${bestWorstHTML(summary)}
        ${goalsCardHTML(state, summary)}
      </div>
      <div class="pane">
        ${portfolioChartHTML(state, range, chartExtra)}
        ${investChartHTML(state)}
      </div>
    </div>
    ${reportCardHTML()}
  `;

  bindPortfolioChart(container, state, ctx, range, chartExtra);
  bindMarketBits(container, ctx);
  container.querySelectorAll('[data-usd-toggle]').forEach((el) => el.addEventListener('click', () => {
    ctx.store.updateSettings({ investUsdView: !usdOn });
    ctx.refreshUsd?.();
  }));
  container.querySelectorAll('[data-open-goals]').forEach((el) => el.addEventListener('click', () => openGoalSheet(ctx)));

  container.querySelector('#exportInvestReport')?.addEventListener('click', () => {
    const html = buildInvestReport({
      profileName: profileName(ctx.profileId),
      state,
      market,
      usdRates: getCachedUsdRates()?.rates || null,
    });
    downloadFile(`yatirim-raporu-${todayISO()}.html`, html, 'text/html;charset=utf-8');
    showToast('Yatırım raporu indirildi');
  });
  container.querySelector('#exportInvestCsv')?.addEventListener('click', () => exportLots(ctx, state));
}

// En altta: raporu indir.
function reportCardHTML() {
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Rapor</span></div>
    <div class="card">
      <p class="field__hint" style="margin:-2px 0 12px;">
        Yatırım raporu: değer, maliyet, kâr/zarar, değer seyri, varlık tablosu, hedefler ve
        tüm alım/satımlar. Yazdırılabilir ve paylaşılabilir tek HTML dosyasıdır; CSV yalnızca
        alım/satım defterini verir.
      </p>
      <div class="adj-actions">
        <button class="btn btn--primary btn--sm" id="exportInvestReport" type="button">HTML rapor indir</button>
        <button class="btn btn--secondary btn--sm" id="exportInvestCsv" type="button">CSV indir</button>
      </div>
    </div>
  `;
}

const CHART_MONTHS = 6;

function dashboardHTML(summary, market, usdView) {
  const slices = donutSlices(summary.positions);
  const up = summary.totalProfit >= 0;
  const sign = up ? '+' : '−';
  const warn = priceWarning(summary);

  return `
    <div class="card card--bordro">
      <div class="hero">
        <div class="hero__label">Toplam portföy değeri</div>
        <div class="hero__value">${formatMoney(summary.totalValue, { decimals: false })}</div>
        <div class="hero__sub">
          maliyet ${formatMoney(summary.totalCost, { decimals: false })} ·
          <b class="${up ? 'is-positive' : 'is-negative'}">${sign}${formatMoney(Math.abs(summary.totalProfit), { decimals: false })}
          (%${formatPct(Math.abs(summary.profitPct))})</b>
        </div>
        ${summary.totalRealized !== 0 ? `<div class="hero__sub">satışlardan gerçekleşen <b class="${summary.totalRealized >= 0 ? 'is-positive' : 'is-negative'}">${summary.totalRealized >= 0 ? '+' : '−'}${formatMoney(Math.abs(summary.totalRealized), { decimals: false })}</b></div>` : ''}
        ${usdLineHTML(usdView)}
        ${warn ? `<button class="hero__note hero__note--action" id="bulkPriceBtn" type="button">${warn} · fiyatları güncelle →</button>` : ''}
        ${summary.estimatedCount > 0 ? `<div class="hero__note">${summary.estimatedCount} varlık piyasa alış fiyatıyla <b>tahmini</b> · ${marketTimeLabel(market)} <button class="section-header__link" id="marketRefreshBtn" type="button">yenile</button></div>` : ''}
      </div>

      ${slices.length < 2 ? '' : `<div class="donut-block">
        ${donutSVG(slices)}
        <div class="donut-legend">
          ${slices.map((s) => `
            <div class="donut-legend__row">
              <span class="donut-legend__dot" style="background:${s.color}"></span>
              <span class="donut-legend__label">${escapeHTML(s.label)}</span>
              <span class="donut-legend__value">${formatMoney(s.value, { decimals: false })}</span>
              <span class="donut-legend__pct">%${formatPct(s.pct)}</span>
            </div>
          `).join('')}
        </div>
      </div>`}
      ${kindStripHTML(summary)}
    </div>
  `;
}

// Donut: tek daire üstünde stroke-dasharray ile dilimler. Kütüphane yok.
function donutSVG(slices) {
  const size = 108;
  const c = size / 2;
  return `
    <svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Portföy dağılımı">
      <circle class="donut__track" cx="${c}" cy="${c}" r="${DONUT_RADIUS}" fill="none" stroke-width="13" />
      ${slices.map((s) => `
        <circle cx="${c}" cy="${c}" r="${DONUT_RADIUS}" fill="none"
          stroke="${s.color}" stroke-width="13"
          stroke-dasharray="${s.dash.toFixed(3)} ${s.gap.toFixed(3)}"
          stroke-dashoffset="${s.offset.toFixed(3)}"
          transform="rotate(-90 ${c} ${c})" />
      `).join('')}
    </svg>
  `;
}

// Hero'da tek satır: kapalıyken davet, açıkken dolar cinsinden getiri. Kur verisi
// henüz gelmediyse (ya da bir işlemin gününe ait kur yoksa) rakam uydurulmaz.
function usdLineHTML(usdView) {
  if (!usdView) return '<button class="hero__note hero__note--action" type="button" data-usd-toggle>Dolar bazında getiriyi göster ›</button>';
  const u = usdView.usd;
  if (!u) return '<div class="hero__note">dolar bazında hesaplanıyor… <button class="section-header__link" type="button" data-usd-toggle>kapat</button></div>';
  const up = u.profit >= 0;
  return `<div class="hero__sub">dolar bazında <b class="${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}%${formatPct(Math.abs(u.profitPct))} (${up ? '+' : '−'}${formatUsd(u.profit)})</b>
    <button class="section-header__link" type="button" data-usd-toggle>kapat</button></div>`;
}

// Birikim hedefi ilerlemesi ve hedef dağılıma göre sapma. Hedef yoksa ekranı
// kalabalıklaştırmadan tek satırlık bir davet gösterilir.
function goalsCardHTML(state, summary) {
  const settings = state.settings || {};
  const goal = goalProgress(settings.investGoal, summary.totalValue, todayISO());
  const targets = cleanTargets(settings.investTargets);
  if (!goal && !targets) {
    return '<button class="goal-invite" type="button" data-open-goals>Hedef belirle: birikim tutarı, hedef dağılım ›</button>';
  }

  let goalHTML = '';
  if (goal) {
    const when = goal.byMonth ? ` · ${formatMonthYear(goal.byMonth)}'a kadar` : '';
    const note = goal.reached
      ? 'Hedefe ulaştın.'
      : goal.overdue
        ? `Hedef tarihi geçti; kalan ${formatMoney(goal.remaining, { decimals: false })}.`
        : goal.byMonth
          ? `Hedefe ${goal.monthsLeft > 0 ? `${goal.monthsLeft} ay` : 'bu ay'} kaldı: ayda yaklaşık <b>${formatMoney(goal.perMonth, { decimals: false })}</b> gerekiyor.`
          : `Kalan ${formatMoney(goal.remaining, { decimals: false })}.`;
    goalHTML = `
      <div class="goal-block">
        <div class="goal-block__head"><span>Birikim hedefi${when}</span><b>${formatMoney(goal.amount, { decimals: false })}</b></div>
        <div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(goal.pct)}" aria-label="Hedefe ilerleme">
          <div class="goal-bar__fill ${goal.reached ? 'is-done' : ''}" style="width:${goal.pct.toFixed(1)}%"></div>
        </div>
        <div class="goal-block__sub"><span>${formatMoney(goal.value, { decimals: false })} · %${formatPct(goal.pct)}</span></div>
        <div class="goal-block__note">${note}</div>
      </div>`;
  }

  let allocHTML = '';
  const gap = targets ? allocationGap(portfolioByKind(summary), targets) : [];
  if (gap.length > 0) {
    // Sıradaki alım önerisi: hedefin en çok altında kalan tür (en az 3 puan).
    const behind = [...gap].filter((g) => g.diff <= -3).sort((a, b) => a.diff - b.diff)[0];
    allocHTML = `
      <div class="goal-block">
        <div class="goal-block__head"><span>Hedef dağılım</span></div>
        ${gap.map((g) => {
    const off = Math.abs(g.diff) < 1;
    return `
        <div class="alloc-row">
          <div class="alloc-row__top">
            <span>${escapeHTML(g.label)}</span>
            <span>%${formatPct(g.pct)} <em>/ hedef %${formatPct(g.targetPct)}</em></span>
          </div>
          <div class="alloc-bar" aria-hidden="true">
            <div class="alloc-bar__fill" style="width:${Math.min(100, g.pct).toFixed(1)}%"></div>
            <div class="alloc-bar__target" style="left:${Math.min(100, g.targetPct).toFixed(1)}%"></div>
          </div>
          <div class="alloc-row__shift ${off ? '' : (g.diff > 0 ? 'is-over' : 'is-under')}">${off ? 'hedefte' : `${formatMoney(Math.abs(g.shift), { decimals: false })} ${g.shift > 0 ? 'ekle' : 'azalt'} (${Math.abs(g.diff).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} puan ${g.diff > 0 ? 'üstünde' : 'altında'})`}</div>
        </div>`;
  }).join('')}
        ${behind ? `<div class="goal-block__note">Sıradaki alımı <b>${escapeHTML(behind.label)}</b> için yap; hedefin altında.</div>` : ''}
      </div>`;
  }

  return `
    <div class="card goals-card">
      <div class="section-header" style="margin-bottom:8px;">
        <span class="section-title" style="margin:0;">Hedefler</span>
        <button class="section-header__link" type="button" data-open-goals>Düzenle ›</button>
      </div>
      ${goalHTML}${allocHTML}
    </div>
  `;
}

function investChartHTML(state) {
  const buckets = monthlyInvestBuckets(state, currentPeriodKey(), CHART_MONTHS);
  const max = Math.max(...buckets.map((b) => b.amount), 0);
  const total = buckets.reduce((sum, b) => sum + b.amount, 0);
  if (total <= 0) return '';

  return `
    <div class="card">
      <div class="section-header" style="margin-bottom:10px;">
        <span class="section-title" style="margin:0;">Son ${CHART_MONTHS} ay yatırım</span>
        <span class="section-header__meta">${formatMoney(total, { decimals: false })}</span>
      </div>
      <div class="bar-chart bar-chart--mini">
        ${buckets.map((b) => {
    const pct = max > 0 ? Math.max(3, Math.round((b.amount / max) * 100)) : 3;
    return `
          <div class="bar-chart__col" title="${periodLabel(b.periodKey)} · ${formatMoney(b.amount, { decimals: false })}">
            <div class="bar-chart__track">
              <div class="bar-chart__bar ${b.amount > 0 ? 'has-value' : ''} ${b.isCurrent ? 'is-current' : ''}" style="height:${pct}%"></div>
            </div>
            <div class="bar-chart__label">${formatMonthYear(b.periodKey).slice(0, 3)}</div>
          </div>`;
  }).join('')}
      </div>
    </div>
  `;
}

function kindStripHTML(summary) {
  const groups = portfolioByKind(summary);
  // Tek tür varsa şerit bilgi taşımaz.
  if (groups.length < 2) return '';
  return `
    <div class="kind-strip">
      ${groups.map((g) => `
        <div class="kind-strip__item">
          <div class="kind-strip__label">${g.label}</div>
          <div class="kind-strip__value">${formatMoney(g.value, { decimals: false })}</div>
          <div class="kind-strip__pct">%${formatPct(g.pct)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function bestWorstHTML(summary) {
  const res = bestWorstAsset(summary);
  // Hepsi aynı getiride (ör. yeni alınmış, hepsi %0) sıralamanın anlamı yok.
  if (!res || Math.abs(res.best.profitPct - res.worst.profitPct) < 0.05) return '';
  const row = (title, p) => {
    const up = p.profit >= 0;
    return `
      <div class="row">
        <span class="row__label">
          <span class="asset__dot" style="background:${p.color || 'var(--accent)'}"></span>
          <span style="margin-left:7px;">${escapeHTML(p.label)}</span>
          <span class="bestworst__tag">${title}</span>
        </span>
        <span class="row__value ${up ? 'is-positive' : 'is-negative'}">
          ${up ? '+' : '−'}%${formatPct(Math.abs(p.profitPct))}
          <span style="color:var(--text-tertiary); font-weight:600;">${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })}</span>
        </span>
      </div>
    `;
  };
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Nasıl gidiyor?</div>
      <div class="rows">
        ${row('en çok kazandıran', res.best)}
        ${row('en az kazandıran', res.worst)}
      </div>
    </div>
  `;
}
