// Yatırım sekmesi: portföy panosu (donut + toplam), varlık kartları ve
// alım defteri. Fiyat elle girilir; bütçeyle bağı yoktur, ayrı defterdir.

import {
  portfolioSummary, donutSlices, DONUT_RADIUS, monthlyInvestBuckets, recentLots, formatQuantity,
  avgLabel, portfolioByKind, bestWorstAsset, isSell,
} from '../investments.js';
import { portfolioChartHTML, bindPortfolioChart } from './investChart.js';
import { getCachedMarket, getMarketLog, symbolForAsset, nudgeDismissed, dismissNudge } from '../marketPrices.js';
import { currentPeriodKey, periodLabel } from '../period.js';
import { formatMoney, formatDayMonth, formatMonthYear } from '../format.js';
import { showToast } from './toast.js';
import { formatPct, escapeHTML, marketTimeLabel } from './invest/shared.js';
import { openLotSheet } from './invest/lotSheet.js';
import { openPriceSheet, openAssetSheet, openBulkPriceSheet } from './invest/assetSheets.js';
import { exportLots } from './invest/lotsPage.js';

export const title = 'Yatırım';

export { renderLotsPage, lotsPageTitle } from './invest/lotsPage.js';

export function render(container, state, ctx) {
  const market = getCachedMarket();
  const summary = portfolioSummary(state, Date.now(), market);
  const range = ctx.investRange || '6m';
  const chartExtra = { market, marketLog: getMarketLog(), estimated: summary.estimatedCount > 0 };
  // Açılışta/sekmeye girişte taze fiyat iste; yoksa/yeniyse hiçbir şey yapmaz.
  ctx.refreshMarket?.();

  const hasAnything = summary.positions.length > 0;
  container.innerHTML = !hasAnything ? emptyHTML() : `
    ${marketNudgeHTML(state)}
    <div class="panes">
      <div class="pane">
        ${dashboardHTML(summary, market)}
        ${bestWorstHTML(summary)}
        ${portfolioChartHTML(state, range, chartExtra)}
        ${investChartHTML(state)}
      </div>
      <div class="pane">
        <div class="section-header">
          <span class="section-title" style="margin:0;">Varlıklar</span>
          ${summary.assetCount > 1 ? '<button class="section-header__link" id="updatePricesBtn" type="button">Fiyatları güncelle ›</button>' : ''}
        </div>
        <div class="asset-list">${summary.positions.map(assetCardHTML).join('')}</div>
        ${addButtonHTML()}
      </div>
    </div>
    ${recentLotsHTML(state)}
  `;

  bindPortfolioChart(container, state, ctx, range, chartExtra);
  container.querySelector('#addAssetBtn')?.addEventListener('click', () => openAddInvestment(ctx));
  container.querySelector('#bulkPriceBtn')?.addEventListener('click', () => openBulkPriceSheet(ctx));
  container.querySelector('#marketRefreshBtn')?.addEventListener('click', async () => {
    const res = await ctx.refreshMarket?.({ force: true });
    if (res && !res.ok) showToast('Fiyat alınamadı — son bilinen fiyat kullanılıyor');
    else if (res?.ok) showToast('Piyasa fiyatı güncellendi');
  });
  container.querySelector('#marketNudgeOn')?.addEventListener('click', () => {
    for (const a of state.assets) {
      const symbol = symbolForAsset(a);
      if (symbol && !a.priceSource) ctx.store.updateAsset(a.id, { priceSource: symbol });
    }
    ctx.refreshMarket?.({ force: true });
  });
  container.querySelector('#marketNudgeOff')?.addEventListener('click', () => { dismissNudge(); ctx.rerender(); });
  container.querySelector('#updatePricesBtn')?.addEventListener('click', () => openBulkPriceSheet(ctx));
  container.querySelector('#allLotsBtn')?.addEventListener('click', () => ctx.navigate({ tab: 'invest', page: 'lots' }));
  container.querySelector('#exportLotsBtn')?.addEventListener('click', () => exportLots(ctx, state));

  container.querySelector('#recentLotList')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-lot]');
    if (!row) return;
    const lot = (state.investments || []).find((l) => l.id === row.dataset.lot);
    const asset = state.assets.find((a) => a.id === lot?.assetId);
    if (lot && asset) openLotSheet(ctx, asset, lot);
  });

  container.querySelector('.asset-list')?.addEventListener('click', (e) => {
    const buyBtn = e.target.closest('[data-buy]');
    if (buyBtn) {
      const asset = state.assets.find((a) => a.id === buyBtn.dataset.buy);
      if (asset) openLotSheet(ctx, asset, null);
      return;
    }
    const sellBtn = e.target.closest('[data-sell]');
    if (sellBtn) {
      const asset = state.assets.find((a) => a.id === sellBtn.dataset.sell);
      if (asset) openLotSheet(ctx, asset, null, 'sell');
      return;
    }
    const priceBtn = e.target.closest('[data-price]');
    if (priceBtn) {
      const asset = state.assets.find((a) => a.id === priceBtn.dataset.price);
      if (asset) openPriceSheet(ctx, asset);
      return;
    }
    const card = e.target.closest('[data-asset]');
    if (!card) return;
    const asset = state.assets.find((a) => a.id === card.dataset.asset);
    if (asset) openAssetSheet(ctx, asset);
  });
}

// --- Pano ----------------------------------------------------------------

function dashboardHTML(summary, market) {
  const slices = donutSlices(summary.positions);
  const up = summary.totalProfit >= 0;
  const sign = up ? '+' : '−';
  const warn = summary.missingPrice > 0
    ? `${summary.missingPrice} varlığın güncel fiyatı girilmemiş`
    : summary.staleCount > 0 ? `${summary.staleCount} varlığın fiyatı eskimiş` : '';

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

// --- Varlık kartı --------------------------------------------------------

function assetCardHTML(p) {
  const up = p.profit >= 0;
  const realizedHTML = p.sellCount > 0
    ? `<span class="${p.realized >= 0 ? 'is-positive' : 'is-negative'}">gerçekleşen ${p.realized >= 0 ? '+' : '−'}${formatMoney(Math.abs(p.realized), { decimals: false })}</span>`
    : '';
  return `
    <div class="card asset" data-asset="${p.assetId}" role="button" tabindex="0">
      <div class="asset__head">
        <span class="asset__name"><span class="asset__dot" style="background:${p.color || 'var(--accent)'}"></span>${escapeHTML(p.label)}</span>
        <span class="asset__value">${p.hasLots && p.holding ? formatMoney(p.value, { decimals: false }) : ''}</span>
      </div>
      ${p.hasLots && p.holding ? `
      <div class="asset__meta">
        <span>${formatQuantity(p.quantity, p.asset)} ${escapeHTML(p.unit)} · ${avgLabel(p.asset)} ${formatMoney(p.avgCost)}</span>
        ${p.hasPrice
    ? `<span class="${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })} (%${formatPct(Math.abs(p.profitPct))})</span>`
    : '<span class="asset__missing">fiyat girilmedi</span>'}
      </div>` : p.hasLots ? `
      <div class="asset__meta"><span>Elde kalmadı — tamamı satıldı</span>${realizedHTML}</div>` : `
      <div class="asset__meta"><span>Henüz alım yok — kaç tane aldığını gir</span></div>`}
      ${p.hasLots && p.holding && p.sellCount > 0 ? `<div class="asset__meta">${realizedHTML}</div>` : ''}
      ${p.oversold ? '<div class="asset__stale">Satışlar elindeki miktarı aşıyor — kayıtları kontrol et</div>' : ''}
      <div class="asset__foot">
        <span>${p.hasLots ? `${p.buyCount} alım${p.sellCount ? ` · ${p.sellCount} satış` : ''}${p.holding ? ` · maliyet ${formatMoney(p.cost, { decimals: false })}` : ''}` : ''}</span>
        <span style="display:flex; gap:8px; align-items:center;">
          <button class="asset__price" data-price="${p.assetId}" type="button">
            ${p.hasPrice ? `Fiyat ${formatMoney(p.price)}${p.estimated ? ' · tahmini' : ''} ${p.stale ? '⚠' : ''}` : 'Fiyat gir'}
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>
          </button>
          ${p.holding ? `<button class="asset__sell" data-sell="${p.assetId}" type="button">Sat</button>` : ''}
          <button class="asset__buy" data-buy="${p.assetId}" type="button">Alım ekle +</button>
        </span>
      </div>
      ${p.stale && p.hasLots ? `<div class="asset__stale">Fiyat ${p.staleDays} gün önce güncellendi</div>` : ''}
    </div>
  `;
}

function addButtonHTML() {
  return `
    <button class="btn btn--primary" id="addAssetBtn" type="button" style="margin-top:16px;">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Alım ekle
    </button>
  `;
}

function emptyHTML() {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>
      </div>
      <div class="empty__title">Henüz yatırım yok</div>
      <div class="empty__sub">Ne aldığını seç, kaç tane ya da kaç lira verdiğini yaz. Ortalama maliyeti ve kâr/zararı uygulama hesaplar.</div>
    </div>
    ${addButtonHTML()}
  `;
}

// --- Varlık ekle / düzenle -----------------------------------------------
//
// Adım 1: NE biriktiriyorsun? Adet burada sorulmaz — varlık tanımı ile alım
// kaydı ayrı şeyler. Kaç tane aldığın kartın "Alım ekle" düğmesinde sorulur.


// --- Alım / satış ekle / düzenle -----------------------------------------
//
// Tek pencere: "ne aldın?" (varlık seçimi), kaç tane / ne kadar ödedin / birim
// fiyat, tarih. Yeni varlık ayrıca tanımlanmaz — seçilen hazır varlık (ya da
// "Başka") kaydederken kendiliğinden oluşur. Miktar, tutar ve birim fiyat
// karşılıklı hesaplanır (bkz. applyTradeEdit): "5 gram" ya da "5.000 ₺" yaz,
// diğeri çıksın. Birim fiyat piyasa fiyatıyla (açıksa) dolu gelir.
//
// Satış aynı formdur; eldeki miktarı aşamaz ve ortalama maliyete göre ne kadar
// kâr/zarar yazacağını kaydetmeden önce gösterir.


// --- Fiyat güncelle ------------------------------------------------------


// --- Varlık detayı: alım listesi ----------------------------------------


// FAB ve "Alım ekle" düğmesi: tek pencere. Tek varlık varsa o hazır seçili gelir
// (değiştirmek bir dokunuş); birden fazlaysa önce ne aldığını seçersin.
export function openAddInvestment(ctx) {
  const assets = ctx.store.getState().assets || [];
  openLotSheet(ctx, assets.length === 1 ? assets[0] : null, null, 'buy', { pickable: true });
}




// --- Piyasa fiyatı (tahmini) ----------------------------------------------


// Kaynağı henüz seçilmemiş ama piyasada karşılığı olan varlıklar için tek
// seferlik öneri. Sessizce açılmaz: elle girilmiş fiyatlar bu kullanıcının
// kararıdır; "Aç" demeden hiçbir varlığa dokunulmaz.
function marketNudgeHTML(state) {
  if (nudgeDismissed()) return '';
  const candidates = (state.assets || []).filter((a) => !a.priceSource && symbolForAsset(a));
  if (candidates.length === 0) return '';
  const names = candidates.map((a) => escapeHTML(a.label)).join(', ');
  return `
    <div class="card market-nudge">
      <div class="market-nudge__title">Fiyatı otomatik takip edelim mi?</div>
      <div class="market-nudge__sub"><b>${names}</b> için güncel piyasa alış fiyatı çekilir, kâr/zarar <b>tahmini</b> olarak gösterilir. Alımlarını yine sen girersin; veri göndermez. Elle girdiğin fiyat silinmez.</div>
      <div class="market-nudge__actions">
        <button class="btn btn--primary btn--sm" id="marketNudgeOn" type="button">Aç</button>
        <button class="btn btn--secondary btn--sm" id="marketNudgeOff" type="button">Şimdilik hayır</button>
      </div>
    </div>
  `;
}

// --- Aylık yatırım grafiği ------------------------------------------------

const CHART_MONTHS = 6;

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

// --- Son alımlar ----------------------------------------------------------

function recentLotsHTML(state) {
  const rows = recentLots(state, 8);
  const total = (state.investments || []).length;
  if (rows.length === 0) return '';
  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Son alımlar</span>
      ${total > rows.length
    ? `<button class="section-header__link" id="allLotsBtn" type="button">Tümünü gör (${total}) ›</button>`
    : '<span class="section-header__note">satıra dokun, düzenle</span>'}
    </div>
    <div class="card">
      <div class="lot-list" id="recentLotList">
        ${rows.map((l) => `
          <button class="lot-row lot-row--wide" type="button" data-lot="${l.id}">
            <span class="lot-row__date">${formatDayMonth(l.date)}</span>
            <span class="lot-row__asset">
              <span class="asset__dot" style="background:${l.color || 'var(--accent)'}"></span>
              <span class="lot-row__name">${escapeHTML(l.label)}${l.note ? `<span class="lot-row__note">${escapeHTML(l.note)}</span>` : ''}</span>
            </span>
            <span class="lot-row__qty">${isSell(l) ? '<b class="lot-tag lot-tag--sell">Satış</b> ' : ''}${formatQuantity(l.quantity, l.asset)} ${escapeHTML(l.unit)} × ${formatMoney(l.unitCost)}</span>
            <span class="lot-row__total">${isSell(l) ? '+' : ''}${formatMoney(l.total, { decimals: false })}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}


// --- Türe göre dağılım ----------------------------------------------------

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

// --- En iyi / en kötü varlık ----------------------------------------------

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

// --- Toplu fiyat güncelleme ----------------------------------------------
//
// Beş varlık için beş ayrı sayfa açmak yerine hepsi tek listede. Yalnızca
// değiştirilen alanlar kaydedilir; boş bırakılan varlığın fiyatına dokunulmaz.


// --- Tüm alımlar (alt sayfa) ---------------------------------------------



