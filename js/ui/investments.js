// Yatırım sekmesi: portföy panosu (donut + toplam), varlık kartları ve
// alım defteri. Fiyat elle girilir; bütçeyle bağı yoktur, ayrı defterdir.

import {
  portfolioSummary, donutSlices, assetPosition, assetLots, lotTotal,
  PRESET_ASSETS, nextAssetColor, DONUT_RADIUS, priceUpdateFromLot, suggestedUnitCost,
  monthlyInvestBuckets, recentLots, ASSET_KINDS, kindOf, kindByKey, unitOf, quantityPresets,
  formatQuantity, quantityLabel, priceLabel, avgLabel, portfolioByKind, bestWorstAsset,
  isSell, checkSell, priceObservations, priceChangePct, emptyTrade, applyTradeEdit, formatInputNumber, marketPriceFor,
} from '../investments.js';
import { portfolioChartHTML, bindPortfolioChart, assetPriceChartHTML } from './investChart.js';
import {
  getCachedMarket, getMarketLog, symbolForAsset, symbolLabel, nudgeDismissed, dismissNudge,
} from '../marketPrices.js';
import { currentPeriodKey, periodLabel } from '../period.js';
import { formatMoney, formatDayMonth, formatMonthYear, todayISO, toISODate, parseAmount } from '../format.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export const title = 'Yatırım';

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

function openAssetFormSheet(ctx, asset) {
  const store = ctx.store;
  const isNew = !asset;
  let selectedKind = asset ? kindOf(asset).key : 'altin';

  openSheet({
    title: isNew ? 'Varlık ekle' : 'Varlığı düzenle',
    footerHTML: `
      <button class="btn btn--primary" id="saveAssetBtn" type="button">${isNew ? 'Ekle' : 'Kaydet'}</button>
      ${isNew ? '' : '<button class="btn btn--danger btn--sm" id="removeAssetFormBtn" type="button" style="margin-top:8px;">Varlığı sil</button>'}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Ne biriktiriyorsun?</label>
          <input class="input" type="text" id="assetLabel" value="${escapeAttr(asset?.label || '')}" placeholder="ör. Gram altın" autocomplete="off" />
          ${isNew ? `<div class="quick-chips" id="presetChips">
            ${PRESET_ASSETS.map((pr) => `<button class="quick-chip" type="button" data-preset="${escapeAttr(pr.label)}" data-unit="${pr.unit}" data-kind="${pr.kind}">${pr.label}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="field">
          <label class="field__label">Tür</label>
          <div class="cat-chips" id="kindChips">
            ${ASSET_KINDS.map((k) => `
              <button class="cat-chip ${k.key === selectedKind ? 'is-active' : ''}" data-kind="${k.key}" type="button" style="--cat-color:var(--accent);">
                <span class="cat-chip__dot"></span>${k.label}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="input-row">
          <div class="field">
            <label class="field__label">Birim</label>
            <input class="input" type="text" id="assetUnit" value="${escapeAttr(asset ? unitOf(asset) : kindByKey(selectedKind).defaultUnit)}" placeholder="gram / dolar / lot" />
          </div>
          <div class="field">
            <label class="field__label" id="assetPriceLabel">${priceLabelFor(selectedKind, asset ? unitOf(asset) : kindByKey(selectedKind).defaultUnit)}</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="assetPrice"
              value="${asset?.currentPrice ? String(asset.currentPrice).replace('.', ',') : ''}" placeholder="7900" autocomplete="off" />
          </div>
        </div>
        <div class="field__hint" id="assetPriceHint" style="margin:-10px 0 0;"></div>
        <label class="market-toggle" id="marketToggle" hidden>
          <input type="checkbox" id="assetAuto" ${asset?.priceSource ? 'checked' : ''} />
          <span>
            <b>Fiyatı otomatik güncelle <em>(tahmini)</em></b>
            <small id="assetAutoHint"></small>
          </span>
        </label>
      `;

      const unitEl = bodyEl.querySelector('#assetUnit');
      const priceLabelEl = bodyEl.querySelector('#assetPriceLabel');
      const priceHintEl = bodyEl.querySelector('#assetPriceHint');

      // Etiketler türe ve birime göre canlı: "1 dolar kaç ₺?" / "1 gram kaç ₺?"
      const syncLabels = () => {
        const unit = unitEl.value.trim() || kindByKey(selectedKind).defaultUnit;
        priceLabelEl.textContent = priceLabelFor(selectedKind, unit);
        priceHintEl.innerHTML = kindByKey(selectedKind).rate
          ? `Bugünkü kur. Alım eklerken "kaç ${escapeHTML(unit)} aldın" diye sorulur, TL karşılığını uygulama hesaplar.`
          : `1 ${escapeHTML(unit)} bugün kaç lira? Kâr/zarar buna göre hesaplanır; alım eklersen kendiliğinden tazelenir.`;
      };
      // Piyasada karşılığı varsa (gram altın, dolar…) otomatik fiyat seçeneği çıkar.
      const labelEl = bodyEl.querySelector('#assetLabel');
      const autoBox = bodyEl.querySelector('#assetAuto');
      const syncAuto = () => {
        const symbol = symbolForAsset({ label: labelEl.value, kind: selectedKind });
        const toggle = bodyEl.querySelector('#marketToggle');
        toggle.hidden = !symbol;
        bodyEl.querySelector('#assetAutoHint').textContent = symbol
          ? `Piyasadaki ${symbolLabel(symbol)} alış fiyatı kullanılır; kâr/zarar "tahmini" yazar. İstediğin an elle girdiğin fiyata dönebilirsin.`
          : '';
        // Yeni varlıkta uygun bulunca varsayılan açık; düzenlemede kullanıcının seçimi korunur.
        if (isNew && symbol && !toggle.dataset.touched) autoBox.checked = true;
        if (!symbol) autoBox.checked = false;
      };
      autoBox.addEventListener('change', () => { bodyEl.querySelector('#marketToggle').dataset.touched = '1'; });
      labelEl.addEventListener('input', syncAuto);

      syncLabels();
      unitEl.addEventListener('input', syncLabels);
      syncAuto();

      bodyEl.querySelector('#kindChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-kind]');
        if (!chip) return;
        selectedKind = chip.dataset.kind;
        bodyEl.querySelectorAll('#kindChips .cat-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
        // Birim elle değiştirilmediyse türün varsayılanına geçsin.
        const defaults = ASSET_KINDS.map((k) => k.defaultUnit);
        if (!unitEl.value.trim() || defaults.includes(unitEl.value.trim())) {
          unitEl.value = kindByKey(selectedKind).defaultUnit;
        }
        syncLabels();
        syncAuto();
      });

      bodyEl.querySelector('#presetChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-preset]');
        if (!chip) return;
        bodyEl.querySelector('#assetLabel').value = chip.dataset.preset;
        unitEl.value = chip.dataset.unit;
        selectedKind = chip.dataset.kind;
        bodyEl.querySelectorAll('#kindChips .cat-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.kind === selectedKind));
        syncLabels();
        syncAuto();
      });

      footerEl.querySelector('#saveAssetBtn').addEventListener('click', () => {
        const label = bodyEl.querySelector('#assetLabel').value.trim();
        if (!label) { showToast('Ne biriktirdiğini yaz'); return; }
        const price = parseAmount(bodyEl.querySelector('#assetPrice').value);
        const payload = {
          label,
          kind: selectedKind,
          unit: unitEl.value.trim() || kindByKey(selectedKind).defaultUnit,
        };
        if (price > 0) {
          payload.currentPrice = price;
          payload.priceUpdatedAt = new Date().toISOString();
        }
        // Kaynak yalnız seçiliyse yazılır; kapatınca null (eski kayıtlarda alan hiç yok).
        const symbol = symbolForAsset({ label, kind: selectedKind });
        if (symbol && autoBox.checked) payload.priceSource = symbol;
        else if (!isNew && asset.priceSource) payload.priceSource = null;

        if (isNew) {
          const preset = PRESET_ASSETS.find((pr) => pr.label.toLowerCase() === label.toLowerCase());
          const created = store.addAsset({ ...payload, color: preset?.color || nextAssetColor(store.getState().assets) });
          if (created.priceSource) ctx.refreshMarket?.({ force: true });
          showToast('Varlık eklendi');
          closeSheet();
          // Sıradaki adım belli: kaç tane aldığını hemen sor.
          setTimeout(() => openLotSheet(ctx, { ...created }, null), 300);
          return;
        }
        store.updateAsset(asset.id, payload);
        if (payload.priceSource) ctx.refreshMarket?.({ force: true });
        showToast('Varlık güncellendi');
        closeSheet();
      });

      footerEl.querySelector('#removeAssetFormBtn')?.addEventListener('click', () => {
        const lots = assetLots(store.getState(), asset.id);
        if (!window.confirm(`${asset.label}${lots.length ? ` ve ${lots.length} alım kaydı` : ''} silinecek. Emin misin?`)) return;
        store.removeAsset(asset.id);
        showToast('Varlık silindi');
        closeSheet();
      });
    },
  });
}

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

function openLotSheet(ctx, asset, lot, mode = 'buy', opts = {}) {
  const store = ctx.store;
  const isNew = !lot;
  const sellMode = mode === 'sell' || isSell(lot);
  let market = getCachedMarket();
  // Varlık seçimi yalnızca yeni ALIMDA: düzenlemede ve satışta varlık bellidir.
  const pickable = isNew && !sellMode && (!asset || !!opts.pickable);

  let current = asset || null;   // kayıtlı varlık
  let draft = null;              // henüz kaydedilmemiş yeni varlık: {label, kind, unit, color, symbol}
  let trade = emptyTrade();
  let suggested = null;          // formu dolduran birim fiyat önerisi
  let suggestedFromMarket = false;
  const texts = { quantity: '', price: '', total: '' };

  const view = () => current || draft;
  const decimalsFor = (field) => (field === 'quantity' ? Math.max(kindOf(view()).decimals, 2) : 2);

  const othersPosition = () => (current
    ? assetPosition(current, assetLots(store.getState(), current.id).filter((l) => l.id !== lot?.id), Date.now(), market)
    : null);

  function setTexts() {
    for (const f of ['quantity', 'price', 'total']) texts[f] = formatInputNumber(trade[f], decimalsFor(f));
  }

  // Seçim değişince form baştan kurulur: öneri fiyat gelir, yazılanlar sıfırlanır.
  function startTrade() {
    const v = view();
    const price = current
      ? suggestedUnitCost(current, market)
      : (draft?.symbol ? suggestedUnitCost({ priceSource: draft.symbol }, market) : null);
    suggested = price || null;
    suggestedFromMarket = !!(current
      ? marketPriceFor(current, market)
      : (draft?.symbol && marketPriceFor({ priceSource: draft.symbol }, market)));
    trade = v ? emptyTrade(suggested || 0) : emptyTrade();
    setTexts();
  }

  if (lot) {
    const q = Number(lot.quantity) || 0;
    const p = Number(lot.unitCost) || 0;
    trade = { quantity: q, price: p, total: q * p, derived: ['total'] };
    setTexts();
  } else if (current) {
    startTrade();
  }

  const titleText = pickable
    ? 'Alım ekle'
    : isNew ? `${asset.label} · ${sellMode ? 'satış ekle' : 'alım ekle'}` : (sellMode ? 'Satışı düzenle' : 'Alımı düzenle');

  openSheet({
    title: titleText,
    footerHTML: `
      <button class="btn btn--primary" id="saveLotBtn" type="button">${isNew ? 'Ekle' : 'Kaydet'}</button>
      ${isNew ? '' : `<button class="btn btn--danger btn--sm" id="removeLotBtn" type="button" style="margin-top:8px;">${sellMode ? 'Satışı sil' : 'Alımı sil'}</button>`}
    `,
    build(bodyEl, footerEl) {
      const owned = new Set((store.getState().assets || []).map((a) => String(a.label).toLocaleLowerCase('tr')));
      bodyEl.innerHTML = `
        ${pickable ? `
        <div class="field" id="pickBox">
          <label class="field__label">Ne aldın?</label>
          <div class="quick-chips" id="pickChips">
            ${(store.getState().assets || []).map((a) => `<button class="quick-chip ${current?.id === a.id ? 'is-active' : ''}" type="button" data-pick="${a.id}">${escapeHTML(a.label)}</button>`).join('')}
            ${PRESET_ASSETS.filter((pr) => !owned.has(pr.label.toLocaleLowerCase('tr'))).map((pr) => `<button class="quick-chip" type="button" data-preset="${escapeAttr(pr.label)}">${escapeHTML(pr.label)}</button>`).join('')}
            <button class="quick-chip" type="button" data-custom="1">+ Başka</button>
          </div>
          <div id="customBox" hidden>
            <input class="input" type="text" id="customLabel" placeholder="ör. THYAO, Euro fonu" autocomplete="off" style="margin-top:10px;" />
            <div class="cat-chips" id="customKinds" style="margin-top:10px;">
              ${ASSET_KINDS.map((k) => `<button class="cat-chip" data-kind="${k.key}" type="button" style="--cat-color:var(--accent);"><span class="cat-chip__dot"></span>${k.label}</button>`).join('')}
            </div>
          </div>
        </div>` : ''}

        <div id="tradePart" ${view() ? '' : 'hidden'}>
          <div id="tradeFields"></div>

          <div class="field" style="margin-top:6px;">
            <label class="field__label">Tarih</label>
            <input class="input" type="date" id="lotDate" value="${lot?.date || todayISO()}" />
            <div class="quick-chips" id="lotDateChips">
              <button class="quick-chip" type="button" data-day="0">Bugün</button>
              <button class="quick-chip" type="button" data-day="-1">Dün</button>
            </div>
          </div>

          <button class="lot-note-toggle" id="lotNoteToggle" type="button" ${lot?.note ? 'hidden' : ''}>+ Not ekle</button>
          <div class="field" id="lotNoteField" style="margin-bottom:0;" ${lot?.note ? '' : 'hidden'}>
            <label class="field__label">Not</label>
            <input class="input" type="text" id="lotNote" value="${escapeAttr(lot?.note || '')}" placeholder="ör. kuyumcudan" />
          </div>
        </div>
      `;

      const fieldsEl = bodyEl.querySelector('#tradeFields');
      const partEl = bodyEl.querySelector('#tradePart');
      const dateEl = bodyEl.querySelector('#lotDate');
      let autoOn = true; // yeni varlıkta piyasa fiyatı kutusu

      // Alanların altındaki canlı bilgiler: fiyatın kaynağı, satışın kârı.
      function updateExtras() {
        const hintEl = fieldsEl.querySelector('#tPriceHint');
        if (hintEl) {
          hintEl.textContent = suggestedFromMarket && suggested && trade.price === suggested && !trade.derived.includes('price')
            ? `Piyasa alış fiyatı · ${marketTimeLabel(market)} (tahmini). Gerçek fiyatın farklıysa değiştir.`
            : '';
        }
        const realizedEl = fieldsEl.querySelector('#lotRealizedHint');
        const pos = othersPosition();
        if (realizedEl) {
          if (!(trade.quantity > 0 && trade.price > 0) || !pos || pos.avgCost <= 0) { realizedEl.textContent = ''; return; }
          const gain = Math.min(trade.quantity, pos.quantity || trade.quantity) * (trade.price - pos.avgCost);
          realizedEl.innerHTML = `Bu satıştan gerçekleşen: <b class="${gain >= 0 ? 'is-positive' : 'is-negative'}">${gain >= 0 ? '+' : '−'}${formatMoney(Math.abs(gain))}</b>`;
        }
      }

      function paintInput(field) {
        const el = fieldsEl.querySelector(`#t_${field}`);
        if (!el) return;
        el.value = texts[field];
        el.classList.toggle('is-derived', trade.derived.includes(field));
      }

      function onEdit(field, value) {
        texts[field] = value;
        trade = applyTradeEdit(trade, field, parseAmount(value));
        for (const f of ['quantity', 'price', 'total']) {
          if (f === field) continue;
          if (trade.derived.includes(f)) texts[f] = formatInputNumber(trade[f], decimalsFor(f));
          else if (!(trade[f] > 0)) texts[f] = '';
          paintInput(f);
        }
        fieldsEl.querySelector(`#t_${field}`)?.classList.remove('is-derived');
        updateExtras();
      }

      function renderFields() {
        const v = view();
        if (!v) { partEl.hidden = true; return; }
        partEl.hidden = false;
        const unit = unitOf(v);
        const pos = othersPosition();
        const qtyChips = sellMode
          ? (pos && pos.quantity > 0 ? [{ q: pos.quantity, text: `Hepsi · ${formatQuantity(pos.quantity, v)} ${unit}` }] : [])
          : quantityPresets(v).map((q) => ({ q, text: `${String(q).replace('.', ',')} ${unit}` }));
        fieldsEl.innerHTML = `
          ${sellMode && pos ? `<div class="field__hint" style="margin:-4px 0 12px;">Elinde: <b>${formatQuantity(pos.quantity, v)} ${escapeHTML(unit)}</b> · ${escapeHTML(avgLabel(v))} ${formatMoney(pos.avgCost)}</div>` : ''}
          <div class="input-row">
            <div class="field" style="margin-bottom:8px;">
              <label class="field__label" for="t_quantity">${sellMode ? `Kaç ${escapeHTML(unit)} sattın?` : escapeHTML(quantityLabel(v))}</label>
              <input class="input" type="text" inputmode="decimal" id="t_quantity" placeholder="1" autocomplete="off" />
            </div>
            <div class="field" style="margin-bottom:8px;">
              <label class="field__label" for="t_total">${sellMode ? 'Eline geçen (₺)' : 'Ödediğin toplam (₺)'}</label>
              <input class="input input--amount" type="text" inputmode="decimal" id="t_total" placeholder="5000" autocomplete="off" />
            </div>
          </div>
          <div class="field__hint trade-hint">İkisinden birini yaz, diğeri hesaplanır.</div>
          <div class="quick-chips" id="qtyChips" style="margin-bottom:14px;">
            ${qtyChips.map((c) => `<button class="quick-chip" type="button" data-qty="${c.q}">${escapeHTML(c.text)}</button>`).join('')}
          </div>
          <div class="field" style="margin-bottom:6px;">
            <label class="field__label" for="t_price">${sellMode ? `1 ${escapeHTML(unit)} kaç ₺'ye sattın?` : escapeHTML(priceLabel(v))}</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="t_price" placeholder="7100" autocomplete="off" />
            <div class="field__hint" id="tPriceHint" style="margin-top:6px;"></div>
          </div>
          ${sellMode ? '<div class="field__hint" id="lotRealizedHint" style="margin:8px 0 4px;"></div>' : ''}
          ${!current && draft?.symbol && !sellMode ? `
          <label class="market-toggle" style="margin:12px 0 6px;">
            <input type="checkbox" id="newAuto" ${autoOn ? 'checked' : ''} />
            <span><b>Fiyatı otomatik güncelle <em>(tahmini)</em></b><small>Piyasadaki ${escapeHTML(symbolLabel(draft.symbol))} alış fiyatı kullanılır; kâr/zarar "tahmini" yazar.</small></span>
          </label>` : ''}
        `;
        for (const f of ['quantity', 'price', 'total']) {
          paintInput(f);
          fieldsEl.querySelector(`#t_${f}`).addEventListener('input', (e) => onEdit(f, e.target.value));
        }
        fieldsEl.querySelector('#qtyChips').addEventListener('click', (e) => {
          const chip = e.target.closest('[data-qty]');
          if (!chip) return;
          // Kısayol tam değeri taşır ("Hepsi" kayan noktalı olabilir); kutuda yuvarlanmış
          // görünür ama kaydedilen değer tamdır, böylece küçük bir artık kalmaz.
          onEdit('quantity', chip.dataset.qty);
          texts.quantity = formatInputNumber(trade.quantity, decimalsFor('quantity'));
          paintInput('quantity');
        });
        fieldsEl.querySelector('#newAuto')?.addEventListener('change', (e) => { autoOn = e.target.checked; });
        updateExtras();
      }
      renderFields();

      // --- Varlık seçimi (yalnız yeni alımda) ---
      const pickChips = bodyEl.querySelector('#pickChips');
      const customBox = bodyEl.querySelector('#customBox');
      const markActive = (el) => {
        pickChips.querySelectorAll('.quick-chip').forEach((c) => c.classList.toggle('is-active', c === el));
      };
      const afterPick = () => {
        startTrade();
        renderFields();
        setTimeout(() => fieldsEl.querySelector('#t_quantity')?.focus(), 80);
      };

      pickChips?.addEventListener('click', (e) => {
        const chip = e.target.closest('.quick-chip');
        if (!chip) return;
        markActive(chip);
        customBox.hidden = !chip.dataset.custom;
        if (chip.dataset.pick) {
          current = store.getState().assets.find((a) => a.id === chip.dataset.pick) || null;
          draft = null;
        } else if (chip.dataset.preset) {
          const pr = PRESET_ASSETS.find((x) => x.label === chip.dataset.preset);
          current = null;
          draft = { label: pr.label, kind: pr.kind, unit: pr.unit, color: pr.color, symbol: symbolForAsset({ label: pr.label, kind: pr.kind }) };
        } else {
          current = null;
          draft = { label: '', kind: 'altin', unit: kindByKey('altin').defaultUnit, color: null, symbol: null };
          bodyEl.querySelectorAll('#customKinds .cat-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.kind === 'altin'));
          setTimeout(() => bodyEl.querySelector('#customLabel')?.focus(), 80);
        }
        if (!chip.dataset.custom) afterPick();
        else { startTrade(); renderFields(); }
      });

      // "Başka" varlıkta ad/tür değişince piyasa karşılığı (ör. "Dolar" → USD)
      // değişebilir. Yalnız öneri fiyat ya da kaynak değiştiyse form yeniden
      // kurulur; yoksa kullanıcının yazdığı miktarlar yerinde kalır.
      const resymbol = ({ force = false } = {}) => {
        const prevSymbol = draft.symbol;
        const prevSuggested = suggested;
        draft.symbol = symbolForAsset({ label: draft.label, kind: draft.kind });
        if (draft.symbol !== prevSymbol || force) {
          const keep = { ...trade, derived: [...trade.derived] };
          const keepTexts = { ...texts };
          startTrade();
          // Öneri fiyat değişmediyse kullanıcının yazdıklarını geri koy.
          if (suggested === prevSuggested) { trade = keep; Object.assign(texts, keepTexts); }
          renderFields();
        }
      };
      bodyEl.querySelector('#customLabel')?.addEventListener('input', (e) => {
        if (!draft) return;
        draft.label = e.target.value;
        resymbol();
      });
      bodyEl.querySelector('#customKinds')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-kind]');
        if (!chip || !draft) return;
        draft.kind = chip.dataset.kind;
        draft.unit = kindByKey(draft.kind).defaultUnit;
        bodyEl.querySelectorAll('#customKinds .cat-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
        resymbol({ force: true });
      });

      bodyEl.querySelector('#lotDateChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-day]');
        if (!chip) return;
        const d = new Date();
        d.setDate(d.getDate() + Number(chip.dataset.day));
        dateEl.value = toISODate(d);
      });

      bodyEl.querySelector('#lotNoteToggle')?.addEventListener('click', (e) => {
        e.target.hidden = true;
        const field = bodyEl.querySelector('#lotNoteField');
        field.hidden = false;
        field.querySelector('input').focus();
      });

      if (current || lot) setTimeout(() => fieldsEl.querySelector('#t_quantity')?.focus(), 120);

      // Piyasa fiyatı henüz yoksa/eskiyse form açılırken istenir; gelince, kullanıcı
      // henüz bir şey yazmadıysa birim fiyat kendiliğinden dolar. Yazdıklarına dokunulmaz.
      if (!lot) {
        ctx.refreshMarket?.({ always: true }).then((res) => {
          if (!res?.ok) return;
          market = res.market;
          if (!view() || trade.quantity > 0 || trade.total > 0 || trade.price > 0) return;
          startTrade();
          for (const f of ['quantity', 'price', 'total']) paintInput(f);
          updateExtras();
        }).catch(() => {});
      }

      footerEl.querySelector('#saveLotBtn').addEventListener('click', () => {
        const v = view();
        if (!v) { showToast('Ne aldığını seç'); return; }
        if (!current && !String(draft?.label || '').trim()) { showToast('Ne aldığını yaz'); return; }
        const unit = unitOf(v);
        const { quantity, price: unitCost } = trade;
        if (!(quantity > 0)) { showToast(`Kaç ${unit} ${sellMode ? 'sattığını' : 'aldığını'} gir`); return; }
        if (!(unitCost > 0)) { showToast(`1 ${unit} kaç ₺ olduğunu gir`); return; }

        const payload = {
          assetId: current?.id,
          quantity,
          unitCost,
          date: dateEl.value || todayISO(),
          note: bodyEl.querySelector('#lotNote').value.trim(),
        };
        const state = store.getState();

        if (sellMode) {
          // Satış, o güne kadar alınandan fazlası olamaz.
          const check = checkSell(state, current.id, payload, lot?.id);
          if (!check.ok) {
            showToast(`Eldeki miktardan fazla satamazsın (${formatQuantity(check.available, current)} ${unit})`);
            return;
          }
          payload.side = 'sell';
        } else if (!isNew) {
          // Alımı küçültmek/ileri almak, sonradan yapılmış bir satışı havada bırakabilir.
          const next = assetLots(state, current.id).map((l) => (l.id === lot.id ? { ...l, ...payload } : l));
          if (assetPosition(current, next).oversold && !window.confirm('Bu değişiklikten sonra bazı satışlar elindeki miktarı aşıyor. Yine de kaydedilsin mi?')) return;
        }

        // Yeni varlık, alımla birlikte oluşur (ayrı bir "varlık ekle" adımı yok).
        let target = current;
        if (!target) {
          target = store.addAsset({
            label: String(draft.label).trim(),
            kind: draft.kind,
            unit: draft.unit,
            color: draft.color || nextAssetColor(state.assets),
            ...(draft.symbol && autoOn ? { priceSource: draft.symbol } : {}),
          });
          payload.assetId = target.id;
        }

        if (isNew) store.addInvestment(payload);
        else store.updateInvestment(lot.id, payload);

        // Alım da satım da bir fiyat gözlemidir: en yeni işlem güncel fiyatı tazeler.
        const saved = store.getState().assets.find((a) => a.id === target.id);
        const priceUpdate = priceUpdateFromLot(saved, payload);
        if (priceUpdate) store.updateAsset(target.id, priceUpdate);
        if (saved?.priceSource) ctx.refreshMarket?.({ force: true });

        showToast(`${sellMode ? 'Satış' : 'Alım'} ${isNew ? 'eklendi' : 'güncellendi'}`);
        closeSheet();
      });

      footerEl.querySelector('#removeLotBtn')?.addEventListener('click', () => {
        if (!sellMode) {
          // Alımı silmek, ona dayanan satışları havada bırakabilir.
          const next = assetLots(store.getState(), current.id).filter((l) => l.id !== lot.id);
          if (assetPosition(current, next).oversold && !window.confirm('Bu alımı silersen bazı satışlar elindeki miktarı aşar. Yine de silinsin mi?')) return;
        }
        store.removeInvestment(lot.id);
        showToast(sellMode ? 'Satış silindi' : 'Alım silindi');
        closeSheet();
      });
    },
  });
}

// --- Fiyat güncelle ------------------------------------------------------

function openPriceSheet(ctx, asset) {
  openSheet({
    title: `${asset.label} · güncel ${kindOf(asset).rate ? 'kur' : 'fiyat'}`,
    footerHTML: '<button class="btn btn--primary" id="savePriceBtn" type="button">Kaydet</button>',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          ${escapeHTML(priceLabel(asset))} Kâr/zarar buna göre hesaplanır.
          Yeni alım eklersen burayı elle güncellemene gerek yok — alımdaki değer buraya da yazılır.
        </p>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">${escapeHTML(priceLabel(asset))}</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="priceInput"
            value="${asset.currentPrice ? String(asset.currentPrice).replace('.', ',') : ''}" placeholder="7900" autocomplete="off" />
        </div>
      `;
      const input = bodyEl.querySelector('#priceInput');
      setTimeout(() => input.focus(), 120);
      const save = () => {
        const price = parseAmount(input.value);
        if (!Number.isFinite(price) || price <= 0) { showToast('Geçerli bir fiyat gir'); return; }
        ctx.store.setAssetPrice(asset.id, price);
        showToast('Fiyat güncellendi');
        closeSheet();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      footerEl.querySelector('#savePriceBtn').addEventListener('click', save);
    },
  });
}

// --- Varlık detayı: alım listesi ----------------------------------------

function openAssetSheet(ctx, asset) {
  const state = ctx.store.getState();
  const lots = assetLots(state, asset.id);
  const market = getCachedMarket();
  const p = assetPosition(asset, lots, Date.now(), market);
  const unit = unitOf(asset);
  const rate = kindOf(asset).rate;
  const up = p.profit >= 0;

  openSheet({
    title: asset.label,
    footerHTML: `
      <button class="btn btn--primary" id="addLotBtn" type="button">Alım ekle</button>
      ${p.holding ? '<button class="btn btn--secondary btn--sm" id="sellLotBtn" type="button" style="margin-top:8px;">Satış ekle</button>' : ''}
      <button class="btn btn--secondary btn--sm" id="editAssetBtn" type="button" style="margin-top:8px;">Varlığı düzenle</button>
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="asset-detail">
          <div class="asset-detail__hero">
            <div class="asset-detail__label">${p.holding ? 'Bugünkü değeri' : 'Elde kalmadı'}</div>
            <div class="asset-detail__value">${formatMoney(p.value, { decimals: false })}</div>
            <div class="asset-detail__sub">
              ${formatQuantity(p.quantity, asset)} ${escapeHTML(unit)}
              ${p.hasPrice ? `· ${rate ? 'kur' : 'fiyat'} ${formatMoney(p.price)}${p.estimated ? ' (tahmini)' : ''}` : ''}
            </div>
            ${!p.holding ? '' : p.hasPrice ? `
            <div class="asset-detail__pl ${up ? 'is-positive' : 'is-negative'}">
              ${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })}
              <span>(%${formatPct(Math.abs(p.profitPct))})</span>
            </div>` : `
            <button class="asset-detail__cta" id="setPriceBtn" type="button">Güncel ${rate ? 'kuru' : 'fiyatı'} gir →</button>`}
            ${p.sellCount > 0 ? `<div class="asset-detail__sub">satışlardan gerçekleşen <b class="${p.realized >= 0 ? 'is-positive' : 'is-negative'}">${p.realized >= 0 ? '+' : '−'}${formatMoney(Math.abs(p.realized), { decimals: false })}</b></div>` : ''}
          </div>

          <div class="asset-detail__grid">
            <div class="asset-detail__cell">
              <span class="asset-detail__cell-label">Toplam maliyet</span>
              <span class="asset-detail__cell-value">${formatMoney(p.cost, { decimals: false })}</span>
            </div>
            <div class="asset-detail__cell">
              <span class="asset-detail__cell-label">${rate ? 'Ortalama kur' : 'Ortalama maliyet'}</span>
              <span class="asset-detail__cell-value">${formatMoney(p.avgCost)}</span>
            </div>
            <div class="asset-detail__cell">
              <span class="asset-detail__cell-label">${p.sellCount ? 'Alım / satış' : 'Alım sayısı'}</span>
              <span class="asset-detail__cell-value">${p.sellCount ? `${p.buyCount} / ${p.sellCount}` : lots.length}</span>
            </div>
          </div>
        </div>

        ${assetPriceChartHTML(priceObservations(asset, lots, getMarketLog()), [
    { label: '1 hf', days: 7 }, { label: '1 ay', days: 30 }, { label: '3 ay', days: 90 },
  ].map((c) => ({ label: c.label, pct: priceChangePct(priceObservations(asset, lots, getMarketLog()), c.days) })))}

        <div class="section-header" style="margin-top:18px;">
          <span class="section-title" style="margin:0;">${p.sellCount ? 'Alım ve satışlar' : 'Alımlar'}</span>
          <span class="section-header__note">${lots.length ? 'satıra dokun, düzenle' : ''}</span>
        </div>
        ${lots.length === 0 ? `
        <div class="field__hint">Henüz alım yok. Aşağıdaki <b>Alım ekle</b> ile kaç ${escapeHTML(unit)} aldığını gir.</div>` : `
        <div class="lot-table">
          ${lots.map((l) => {
    const total = lotTotal(l);
    // Bu alım tek başına ne durumda? Ortalamaya karışmadan, kendi fiyatıyla.
    // Satışta o satırın kârı ortalama maliyete bağlıdır; satır bazında gösterilmez.
    const sold = isSell(l);
    const lotProfit = p.hasPrice && !sold ? (p.price - (Number(l.unitCost) || 0)) * (Number(l.quantity) || 0) : null;
    const lotFlat = lotProfit !== null && Math.abs(lotProfit) < 0.005;
    const lotUp = (lotProfit || 0) >= 0;
    return `
            <button class="lot-table__row" type="button" data-lot="${l.id}">
              <span class="lot-table__date">${formatDayMonth(l.date)}</span>
              <span class="lot-table__detail">${sold ? '<b class="lot-tag lot-tag--sell">Satış</b> ' : ''}${formatQuantity(l.quantity, asset)} ${escapeHTML(unit)} × ${formatMoney(l.unitCost)}${l.note ? `<span class="lot-row__note">${escapeHTML(l.note)}</span>` : ''}</span>
              <span class="lot-table__total">${sold ? '+' : ''}${formatMoney(total, { decimals: false })}</span>
              <span class="lot-table__pl ${lotProfit === null || lotFlat ? 'lot-table__pl--flat' : lotUp ? 'is-positive' : 'is-negative'}">
                ${lotProfit === null ? '' : lotFlat ? '—' : `${lotUp ? '+' : '−'}${formatMoney(Math.abs(lotProfit), { decimals: false })}`}
              </span>
            </button>`;
  }).join('')}
          <div class="lot-table__row lot-table__row--total">
            <span class="lot-table__date">Toplam</span>
            <span class="lot-table__detail">${p.holding ? `elde ${formatQuantity(p.quantity, asset)} ${escapeHTML(unit)}` : 'elde kalmadı'}</span>
            <span class="lot-table__total">${formatMoney(p.cost, { decimals: false })}</span>
            <span class="lot-table__pl ${p.hasPrice ? (up ? 'is-positive' : 'is-negative') : ''}">
              ${p.hasPrice ? `${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })}` : ''}
            </span>
          </div>
        </div>`}
      `;

      bodyEl.querySelector('#setPriceBtn')?.addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openPriceSheet(ctx, asset), 280);
      });

      bodyEl.querySelector('.lot-table')?.addEventListener('click', (e) => {
        const row = e.target.closest('[data-lot]');
        if (!row) return;
        const lot = lots.find((l) => l.id === row.dataset.lot);
        closeSheet();
        setTimeout(() => openLotSheet(ctx, asset, lot), 280);
      });

      footerEl.querySelector('#addLotBtn').addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openLotSheet(ctx, asset, null), 280);
      });

      footerEl.querySelector('#sellLotBtn')?.addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openLotSheet(ctx, asset, null, 'sell'), 280);
      });

      footerEl.querySelector('#editAssetBtn').addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openAssetFormSheet(ctx, asset), 280);
      });
    },
  });
}

// FAB ve "Alım ekle" düğmesi: tek pencere. Tek varlık varsa o hazır seçili gelir
// (değiştirmek bir dokunuş); birden fazlaysa önce ne aldığını seçersin.
export function openAddInvestment(ctx) {
  const assets = ctx.store.getState().assets || [];
  openLotSheet(ctx, assets.length === 1 ? assets[0] : null, null, 'buy', { pickable: true });
}

function formatPct(value) {
  return (Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(str) {
  return escapeHTML(str);
}

// --- Piyasa fiyatı (tahmini) ----------------------------------------------

// "bugün 11:42" / "dün 18:05" / "3 gün önce"
function marketTimeLabel(market) {
  const t = Date.parse(market?.fetchedAt);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const hhmm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((Date.now() - t) / 86400000);
  if (toISODate(d) === todayISO()) return `bugün ${hhmm}`;
  return days <= 1 ? `dün ${hhmm}` : `${days} gün önce`;
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

// Varlık formunda tür/birim değiştikçe güncellenen fiyat sorusu.
function priceLabelFor(kindKey, unit) {
  const safeUnit = unit || kindByKey(kindKey).defaultUnit;
  return `1 ${safeUnit} kaç ₺?`;
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

function openBulkPriceSheet(ctx) {
  const assets = ctx.store.getState().assets || [];
  if (assets.length === 0) return;

  openSheet({
    title: 'Fiyatları güncelle',
    footerHTML: '<button class="btn btn--primary" id="savePricesBtn" type="button">Kaydet</button>',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">Değişenleri yaz, gerisine dokunma.</p>
        <div class="bulk-price">
          ${assets.map((a) => {
    const days = a.priceUpdatedAt ? Math.floor((Date.now() - Date.parse(a.priceUpdatedAt)) / 86400000) : null;
    return `
            <label class="bulk-price__row">
              <span class="bulk-price__name">
                <span class="asset__dot" style="background:${a.color || 'var(--accent)'}"></span>
                <span>
                  ${escapeHTML(a.label)}
                  <span class="bulk-price__meta">1 ${escapeHTML(unitOf(a))}${days === null ? ' · fiyat yok' : days === 0 ? ' · bugün' : ` · ${days} gün önce`}</span>
                </span>
              </span>
              <input class="input input--amount bulk-price__input" type="text" inputmode="decimal"
                data-asset="${a.id}" value="${a.currentPrice ? String(a.currentPrice).replace('.', ',') : ''}" placeholder="0" autocomplete="off" />
            </label>`;
  }).join('')}
        </div>
      `;

      footerEl.querySelector('#savePricesBtn').addEventListener('click', () => {
        let changed = 0;
        for (const input of bodyEl.querySelectorAll('[data-asset]')) {
          const asset = assets.find((a) => a.id === input.dataset.asset);
          const price = parseAmount(input.value);
          if (!asset || price <= 0) continue;
          if (Number(asset.currentPrice) === price) continue;
          ctx.store.setAssetPrice(asset.id, price);
          changed += 1;
        }
        showToast(changed > 0 ? `${changed} fiyat güncellendi` : 'Değişiklik yok');
        closeSheet();
      });
    },
  });
}

// --- Tüm alımlar (alt sayfa) ---------------------------------------------

export const lotsPageTitle = 'Tüm alımlar';

export function renderLotsPage(container, state, ctx) {
  const rows = recentLots(state, 0);
  const assets = state.assets || [];
  const filter = ctx.investFilter || 'all';
  const shown = filter === 'all' ? rows : rows.filter((l) => l.assetId === filter);
  const total = shown.reduce((sum, l) => sum + l.total, 0);

  container.innerHTML = `
    <div class="period-card">
      <div style="width:34px;"></div>
      <div class="period-card__body">
        <div class="period-card__label">${shown.length} alım</div>
        <div class="period-card__sub">toplam ${formatMoney(total, { decimals: false })}</div>
      </div>
      <div style="width:34px;"></div>
    </div>

    ${assets.length > 1 ? `
    <div class="chips" id="lotFilter" style="margin:14px 0;">
      <button class="quick-chip ${filter === 'all' ? 'is-active' : ''}" type="button" data-filter="all">Hepsi</button>
      ${assets.map((a) => `<button class="quick-chip ${filter === a.id ? 'is-active' : ''}" type="button" data-filter="${a.id}">${escapeHTML(a.label)}</button>`).join('')}
    </div>` : ''}

    <div class="card">
      <div class="lot-list" id="allLotList">
        ${shown.length === 0 ? '<div class="field__hint">Bu varlıkta alım yok.</div>' : shown.map((l) => `
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

    <button class="btn btn--secondary btn--sm" id="exportLotsBtn" type="button" style="margin-top:14px;">CSV indir</button>
  `;

  container.querySelector('#lotFilter')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    ctx.investFilter = chip.dataset.filter;
    ctx.rerender();
  });

  container.querySelector('#allLotList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-lot]');
    if (!row) return;
    const lot = (state.investments || []).find((l) => l.id === row.dataset.lot);
    const asset = assets.find((a) => a.id === lot?.assetId);
    if (lot && asset) openLotSheet(ctx, asset, lot);
  });

  container.querySelector('#exportLotsBtn').addEventListener('click', () => exportLots(ctx, state));
}

async function exportLots(ctx, state) {
  const { downloadFile, csvForInvestments } = await import('./exportUtils.js');
  const rows = recentLots(state, 0);
  if (rows.length === 0) { showToast('Dışa aktarılacak alım yok'); return; }
  const stamp = todayISO();
  downloadFile(`yatirim-alimlari-${stamp}.csv`, '﻿' + csvForInvestments(rows), 'text/csv;charset=utf-8');
  showToast('CSV indirildi');
}
