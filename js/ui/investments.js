// Yatırım sekmesi (ana sayfa): alım/satım girişi. Küçük bir değer satırı, bekleyen
// planlar, varlık kartları (Fiyat / Sat / Alım ekle) ve son alımlar. Grafikler,
// hedefler ve rapor Yatırım > Özet sayfasında (js/ui/invest/summaryPage.js).
// Fiyat elle girilir ya da isteğe bağlı piyasa fiyatı kullanılır; bütçeyle bağı yoktur.

import {
  portfolioSummary, recentLots, formatQuantity, avgLabel, isSell, pendingPlans,
  skipPlanMonth, unitOf,
} from '../investments.js';
import { getCachedMarket, symbolForAsset, nudgeDismissed, dismissNudge } from '../marketPrices.js';
import { formatMoney, formatDayMonth, todayISO } from '../format.js';
import { showToast } from './toast.js';
import { formatPct, escapeHTML, priceWarning } from './invest/shared.js';
import { openLotSheet } from './invest/lotSheet.js';
import { openPriceSheet, openAssetSheet, openBulkPriceSheet } from './invest/assetSheets.js';
import { exportLots } from './invest/lotsPage.js';
import { bindMarketBits } from './invest/bindings.js';

export const title = 'Yatırım';

export { renderLotsPage, lotsPageTitle } from './invest/lotsPage.js';
export { renderSummary, summaryPageTitle } from './invest/summaryPage.js';

export function render(container, state, ctx) {
  const market = getCachedMarket();
  const summary = portfolioSummary(state, Date.now(), market);
  // Açılışta/sekmeye girişte taze fiyat iste; yoksa/yeniyse hiçbir şey yapmaz.
  ctx.refreshMarket?.();

  const hasAnything = summary.positions.length > 0;
  container.innerHTML = !hasAnything ? emptyHTML() : `
    ${miniHeroHTML(summary)}
    ${marketNudgeHTML(state)}
    ${planCardHTML(state)}
    <div class="panes">
      <div class="pane">
        <div class="section-header">
          <span class="section-title" style="margin:0;">Varlıklar</span>
          ${summary.assetCount > 1 ? '<button class="section-header__link" id="updatePricesBtn" type="button">Fiyatları güncelle ›</button>' : ''}
        </div>
        <div class="asset-list">${summary.positions.map(assetCardHTML).join('')}</div>
        ${addButtonHTML()}
      </div>
      <div class="pane">
        ${recentLotsHTML(state)}
      </div>
    </div>
  `;

  bindMarketBits(container, ctx);
  container.querySelector('#addAssetBtn')?.addEventListener('click', () => openAddInvestment(ctx));
  container.querySelector('#goSummary')?.addEventListener('click', () => ctx.navigate({ tab: 'invest', page: 'summary' }));
  container.querySelector('#marketNudgeOn')?.addEventListener('click', () => {
    for (const a of state.assets) {
      const symbol = symbolForAsset(a);
      if (symbol && !a.priceSource) ctx.store.updateAsset(a.id, { priceSource: symbol });
    }
    ctx.refreshMarket?.({ force: true });
  });
  container.querySelector('#marketNudgeOff')?.addEventListener('click', () => { dismissNudge(); ctx.rerender(); });
  container.querySelector('#planCard')?.addEventListener('click', (e) => {
    const buy = e.target.closest('[data-plan-buy]');
    const skip = e.target.closest('[data-plan-skip]');
    if (!buy && !skip) return;
    const id = (buy || skip).dataset.planBuy || (buy || skip).dataset.planSkip;
    const due = pendingPlans(ctx.store.getState(), todayISO()).find((d) => d.asset.id === id);
    if (!due) return;
    if (buy) openLotSheet(ctx, due.asset, null, 'buy', { plan: { quantity: due.plan.quantity, periodKey: due.periodKey } });
    else {
      ctx.store.updateAsset(id, { plan: skipPlanMonth(due.plan, due.periodKey) });
      showToast('Bu ay atlandı');
    }
  });
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

// --- Küçük özet ----------------------------------------------------------------

// Ana sayfanın tek özet satırı: toplam değer ve kâr/zarar, dokununca Özet sayfası.
// Fiyat eksik/eskimişse tıklanabilir bir uyarı altında durur (burada düzeltilebilir).
function miniHeroHTML(summary) {
  const up = summary.totalProfit >= 0;
  const warn = priceWarning(summary);
  return `
    <button class="card mini-hero" id="goSummary" type="button" aria-label="Yatırım özetini aç">
      <span class="mini-hero__main">
        <span class="mini-hero__label">Portföy değeri${summary.estimatedCount > 0 ? ' · tahmini' : ''}</span>
        <span class="mini-hero__value">${formatMoney(summary.totalValue, { decimals: false })}</span>
      </span>
      <span class="mini-hero__side">
        ${summary.totalCost > 0 ? `<b class="${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(summary.totalProfit), { decimals: false })} (%${formatPct(Math.abs(summary.profitPct))})</b>` : ''}
        <span class="mini-hero__link">Özet ›</span>
      </span>
    </button>
    ${warn ? `<button class="hero__note hero__note--action mini-hero__warn" id="bulkPriceBtn" type="button">${warn} · fiyatları güncelle →</button>` : ''}
  `;
}

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
      ${p.asset?.plan ? `<div class="asset__meta"><span>Aylık plan: ${formatQuantity(p.asset.plan.quantity, p.asset)} ${escapeHTML(p.unit)} · ayın ${p.asset.plan.day}'i</span></div>` : ''}
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

// FAB ve "Alım ekle" düğmesi: tek pencere. Tek varlık varsa o hazır seçili gelir
// (değiştirmek bir dokunuş); birden fazlaysa önce ne aldığını seçersin.
export function openAddInvestment(ctx) {
  const assets = ctx.store.getState().assets || [];
  openLotSheet(ctx, assets.length === 1 ? assets[0] : null, null, 'buy', { pickable: true });
}

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

// Planı olan varlık için bu ay vakti gelen ve henüz yapılmamış alımlar.
// Kendiliğinden alım yazmaz: "Aldım" formu planlanan miktarla açar, "Atla" ayı geçer.
function planCardHTML(state) {
  const due = pendingPlans(state, todayISO());
  if (due.length === 0) return '';
  return `
    <div class="card plan-card" id="planCard">
      <div class="plan-card__title">Bu ay planladığın alım</div>
      ${due.map((d) => `
        <div class="plan-row">
          <div class="plan-row__text">
            <b>${escapeHTML(d.asset.label)}</b> · ${formatQuantity(d.plan.quantity, d.asset)} ${escapeHTML(unitOf(d.asset))}
            <small>ayın ${d.day}'i${d.overdue ? ' · gecikti' : ''}</small>
          </div>
          <div class="plan-row__actions">
            <button class="asset__buy" type="button" data-plan-buy="${d.asset.id}">Aldım</button>
            <button class="asset__sell" type="button" data-plan-skip="${d.asset.id}">Atla</button>
          </div>
        </div>`).join('')}
    </div>
  `;
}

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
