// Yatırım sekmesi: portföy panosu (donut + toplam), varlık kartları ve
// alım defteri. Fiyat elle girilir; bütçeyle bağı yoktur, ayrı defterdir.

import {
  portfolioSummary, donutSlices, assetPosition, assetLots, lotTotal,
  PRESET_ASSETS, nextAssetColor, DONUT_RADIUS, priceUpdateFromLot, suggestedUnitCost,
  monthlyInvestBuckets, recentLots, ASSET_KINDS, kindOf, kindByKey, unitOf, quantityPresets,
  formatQuantity, quantityLabel, priceLabel, avgLabel, portfolioByKind, bestWorstAsset,
} from '../investments.js';
import { currentPeriodKey, periodLabel } from '../period.js';
import { formatMoney, formatDayMonth, formatMonthYear, todayISO, toISODate } from '../format.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export const title = 'Yatırım';

export function render(container, state, ctx) {
  const summary = portfolioSummary(state);

  const hasAnything = summary.positions.length > 0;
  container.innerHTML = !hasAnything ? emptyHTML() : `
    ${kpiStripHTML(summary)}
    <div class="panes">
      <div class="pane">
        ${dashboardHTML(summary)}
        ${bestWorstHTML(summary)}
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

  container.querySelector('#addAssetBtn')?.addEventListener('click', () => openAssetFormSheet(ctx, null));
  container.querySelector('#bulkPriceBtn')?.addEventListener('click', () => openBulkPriceSheet(ctx));
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

function dashboardHTML(summary) {
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
        ${warn ? `<button class="hero__note hero__note--action" id="bulkPriceBtn" type="button">${warn} · fiyatları güncelle →</button>` : ''}
      </div>

      <div class="donut-block">
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
      </div>
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
  return `
    <div class="card asset" data-asset="${p.assetId}" role="button" tabindex="0">
      <div class="asset__head">
        <span class="asset__name"><span class="asset__dot" style="background:${p.color || 'var(--accent)'}"></span>${escapeHTML(p.label)}</span>
        <span class="asset__value">${p.hasLots ? formatMoney(p.value, { decimals: false }) : ''}</span>
      </div>
      ${p.hasLots ? `
      <div class="asset__meta">
        <span>${formatQuantity(p.quantity, p.asset)} ${escapeHTML(p.unit)} · ${avgLabel(p.asset)} ${formatMoney(p.avgCost)}</span>
        ${p.hasPrice
    ? `<span class="${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })} (%${formatPct(Math.abs(p.profitPct))})</span>`
    : '<span class="asset__missing">fiyat girilmedi</span>'}
      </div>` : `
      <div class="asset__meta"><span>Henüz alım yok — kaç tane aldığını gir</span></div>`}
      <div class="asset__foot">
        <span>${p.hasLots ? `${p.lotCount} alım · maliyet ${formatMoney(p.cost, { decimals: false })}` : ''}</span>
        <span style="display:flex; gap:8px; align-items:center;">
          <button class="asset__price" data-price="${p.assetId}" type="button">
            ${p.hasPrice ? `${formatMoney(p.price)} ${p.stale ? '⚠' : ''}` : 'Fiyat gir'}
          </button>
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
      Varlık ekle
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
      <div class="empty__sub">Önce ne biriktirdiğini tanımla — altın, döviz, hisse. Sonra kartına basıp alımlarını girersin; ortalama maliyeti ve kâr/zararı uygulama hesaplar.</div>
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
      syncLabels();
      unitEl.addEventListener('input', syncLabels);

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
      });

      bodyEl.querySelector('#presetChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-preset]');
        if (!chip) return;
        bodyEl.querySelector('#assetLabel').value = chip.dataset.preset;
        unitEl.value = chip.dataset.unit;
        selectedKind = chip.dataset.kind;
        bodyEl.querySelectorAll('#kindChips .cat-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.kind === selectedKind));
        syncLabels();
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

        if (isNew) {
          const preset = PRESET_ASSETS.find((pr) => pr.label.toLowerCase() === label.toLowerCase());
          const created = store.addAsset({ ...payload, color: preset?.color || nextAssetColor(store.getState().assets) });
          showToast('Varlık eklendi');
          closeSheet();
          // Sıradaki adım belli: kaç tane aldığını hemen sor.
          setTimeout(() => openLotSheet(ctx, { ...created }, null), 300);
          return;
        }
        store.updateAsset(asset.id, payload);
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

// --- Alım ekle / düzenle -------------------------------------------------
//
// Adım 2: kaç tane, kaçtan? Varlık bellidir, tekrar sorulmaz. Birim fiyat
// bilinen son fiyatla dolu gelir — aynıysa elleme.

function openLotSheet(ctx, asset, lot) {
  const store = ctx.store;
  const isNew = !lot;
  const known = suggestedUnitCost(asset);

  openSheet({
    title: isNew ? `${asset.label} · alım ekle` : 'Alımı düzenle',
    footerHTML: `
      <button class="btn btn--primary" id="saveLotBtn" type="button">${isNew ? 'Ekle' : 'Kaydet'}</button>
      ${isNew ? '' : '<button class="btn btn--danger btn--sm" id="removeLotBtn" type="button" style="margin-top:8px;">Alımı sil</button>'}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="input-row">
          <div class="field" style="margin-bottom:8px;">
            <label class="field__label">${escapeHTML(quantityLabel(asset))}</label>
            <input class="input" type="text" inputmode="decimal" id="lotQuantity"
              value="${lot ? String(lot.quantity).replace('.', ',') : ''}" placeholder="1" autocomplete="off" />
          </div>
          <div class="field" style="margin-bottom:8px;">
            <label class="field__label">${escapeHTML(priceLabel(asset))}</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="lotUnitCost"
              value="${lot ? String(lot.unitCost).replace('.', ',') : (known ? String(known).replace('.', ',') : '')}" placeholder="7100" autocomplete="off" />
          </div>
        </div>

        <div class="quick-chips" id="qtyChips" style="margin-bottom:14px;">
          ${quantityPresets(asset).map((q) => `<button class="quick-chip" type="button" data-qty="${q}">${String(q).replace('.', ',')} ${escapeHTML(unitOf(asset))}</button>`).join('')}
        </div>

        <div class="lot-total" id="lotTotalBox">
          <span class="lot-total__label">Ödediğin</span>
          <span class="lot-total__value" id="lotTotalPreview">—</span>
          <span class="lot-total__calc" id="lotTotalCalc"></span>
        </div>

        <div class="field" style="margin-top:14px;">
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
      `;

      const qtyEl = bodyEl.querySelector('#lotQuantity');
      const costEl = bodyEl.querySelector('#lotUnitCost');
      const previewEl = bodyEl.querySelector('#lotTotalPreview');
      const calcEl = bodyEl.querySelector('#lotTotalCalc');
      const boxEl = bodyEl.querySelector('#lotTotalBox');
      const dateEl = bodyEl.querySelector('#lotDate');

      // Tutar iki alan da doluyken görünür; eksikken boş kutu yerine ne
      // beklendiğini söyler.
      const updatePreview = () => {
        const q = parseAmount(qtyEl.value);
        const c = parseAmount(costEl.value);
        const ready = q > 0 && c > 0;
        boxEl.classList.toggle('is-ready', ready);
        previewEl.textContent = ready ? formatMoney(q * c) : '—';
        calcEl.textContent = ready
          ? `${formatQuantity(q, asset)} ${unitOf(asset)} × ${formatMoney(c)}`
          : 'Miktar ve fiyatı gir, tutarı hesaplayayım';
      };
      qtyEl.addEventListener('input', updatePreview);
      costEl.addEventListener('input', updatePreview);
      updatePreview();
      setTimeout(() => qtyEl.focus(), 120);

      bodyEl.querySelector('#qtyChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-qty]');
        if (!chip) return;
        qtyEl.value = chip.dataset.qty.replace('.', ',');
        updatePreview();
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

      footerEl.querySelector('#saveLotBtn').addEventListener('click', () => {
        const quantity = parseAmount(qtyEl.value);
        const unitCost = parseAmount(costEl.value);
        if (quantity <= 0) { showToast(`Kaç ${unitOf(asset)} aldığını gir`); return; }
        if (unitCost <= 0) { showToast(`1 ${unitOf(asset)} kaç ₺ olduğunu gir`); return; }

        const payload = {
          assetId: asset.id,
          quantity,
          unitCost,
          date: bodyEl.querySelector('#lotDate').value || todayISO(),
          note: bodyEl.querySelector('#lotNote').value.trim(),
        };
        if (isNew) store.addInvestment(payload);
        else store.updateInvestment(lot.id, payload);

        // Alım bir fiyat gözlemidir: en yeni alım güncel fiyatı da tazeler.
        const saved = store.getState().assets.find((a) => a.id === asset.id);
        const priceUpdate = priceUpdateFromLot(saved, payload);
        if (priceUpdate) store.updateAsset(asset.id, priceUpdate);

        showToast(isNew ? 'Alım eklendi' : 'Alım güncellendi');
        closeSheet();
      });

      footerEl.querySelector('#removeLotBtn')?.addEventListener('click', () => {
        store.removeInvestment(lot.id);
        showToast('Alım silindi');
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
  const p = assetPosition(asset, lots);
  const unit = unitOf(asset);
  const rate = kindOf(asset).rate;
  const up = p.profit >= 0;

  openSheet({
    title: asset.label,
    footerHTML: `
      <button class="btn btn--primary" id="addLotBtn" type="button">Alım ekle</button>
      <button class="btn btn--secondary btn--sm" id="editAssetBtn" type="button" style="margin-top:8px;">Varlığı düzenle</button>
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="asset-detail">
          <div class="asset-detail__hero">
            <div class="asset-detail__label">Bugünkü değeri</div>
            <div class="asset-detail__value">${formatMoney(p.value, { decimals: false })}</div>
            <div class="asset-detail__sub">
              ${formatQuantity(p.quantity, asset)} ${escapeHTML(unit)}
              ${p.hasPrice ? `· ${rate ? 'kur' : 'fiyat'} ${formatMoney(p.price)}` : ''}
            </div>
            ${p.hasPrice ? `
            <div class="asset-detail__pl ${up ? 'is-positive' : 'is-negative'}">
              ${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })}
              <span>(%${formatPct(Math.abs(p.profitPct))})</span>
            </div>` : `
            <button class="asset-detail__cta" id="setPriceBtn" type="button">Güncel ${rate ? 'kuru' : 'fiyatı'} gir →</button>`}
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
              <span class="asset-detail__cell-label">Alım sayısı</span>
              <span class="asset-detail__cell-value">${lots.length}</span>
            </div>
          </div>
        </div>

        <div class="section-header" style="margin-top:18px;">
          <span class="section-title" style="margin:0;">Alımlar</span>
          <span class="section-header__note">${lots.length ? 'satıra dokun, düzenle' : ''}</span>
        </div>
        ${lots.length === 0 ? `
        <div class="field__hint">Henüz alım yok. Aşağıdaki <b>Alım ekle</b> ile kaç ${escapeHTML(unit)} aldığını gir.</div>` : `
        <div class="lot-table">
          ${lots.map((l) => {
    const total = lotTotal(l);
    // Bu alım tek başına ne durumda? Ortalamaya karışmadan, kendi fiyatıyla.
    const lotProfit = p.hasPrice ? (p.price - (Number(l.unitCost) || 0)) * (Number(l.quantity) || 0) : null;
    const lotFlat = lotProfit !== null && Math.abs(lotProfit) < 0.005;
    const lotUp = (lotProfit || 0) >= 0;
    return `
            <button class="lot-table__row" type="button" data-lot="${l.id}">
              <span class="lot-table__date">${formatDayMonth(l.date)}</span>
              <span class="lot-table__detail">${formatQuantity(l.quantity, asset)} ${escapeHTML(unit)} × ${formatMoney(l.unitCost)}${l.note ? `<span class="lot-row__note">${escapeHTML(l.note)}</span>` : ''}</span>
              <span class="lot-table__total">${formatMoney(total, { decimals: false })}</span>
              <span class="lot-table__pl ${lotProfit === null || lotFlat ? 'lot-table__pl--flat' : lotUp ? 'is-positive' : 'is-negative'}">
                ${lotProfit === null ? '' : lotFlat ? '—' : `${lotUp ? '+' : '−'}${formatMoney(Math.abs(lotProfit), { decimals: false })}`}
              </span>
            </button>`;
  }).join('')}
          <div class="lot-table__row lot-table__row--total">
            <span class="lot-table__date">Toplam</span>
            <span class="lot-table__detail">${formatQuantity(p.quantity, asset)} ${escapeHTML(unit)}</span>
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

      footerEl.querySelector('#editAssetBtn').addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openAssetFormSheet(ctx, asset), 280);
      });
    },
  });
}

// FAB'dan çağrılır. Tek varlık varsa doğrudan ona alım ekler; birden fazlaysa
// hangisine ekleneceğini sorar; hiç yoksa önce varlık tanımlatır.
export function openAddInvestment(ctx) {
  const assets = ctx.store.getState().assets || [];
  if (assets.length === 0) { openAssetFormSheet(ctx, null); return; }
  if (assets.length === 1) { openLotSheet(ctx, assets[0], null); return; }

  openSheet({
    title: 'Hangisine alım ekleyeceksin?',
    build(bodyEl) {
      bodyEl.innerHTML = `
        <div class="lifetime">
          ${assets.map((a) => `
            <button class="lifetime__row" type="button" data-pick="${a.id}">
              <span class="lifetime__dot" style="background:${a.color || 'var(--accent)'}"></span>
              <span><span class="lifetime__label">${escapeHTML(a.label)}</span></span>
              <span class="lifetime__total">›</span>
            </button>
          `).join('')}
        </div>
        <button class="btn btn--secondary btn--sm" id="pickNewAsset" type="button" style="margin-top:14px;">+ Yeni varlık</button>
      `;
      bodyEl.addEventListener('click', (e) => {
        const row = e.target.closest('[data-pick]');
        if (row) {
          const asset = assets.find((a) => a.id === row.dataset.pick);
          closeSheet();
          setTimeout(() => openLotSheet(ctx, asset, null), 280);
          return;
        }
        if (e.target.closest('#pickNewAsset')) {
          closeSheet();
          setTimeout(() => openAssetFormSheet(ctx, null), 280);
        }
      });
    },
  });
}

// "7100d", "7 100 TL" gibi girişleri de kabul et: sayı dışındaki her şey atılır.
function parseAmount(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d.,]/g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
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

// --- Üst KPI şeridi ------------------------------------------------------

function kpiStripHTML(summary) {
  const up = summary.totalProfit >= 0;
  return `
    <div class="stat-strip stat-strip--kpi stat-strip--report">
      <div class="stat-strip__item stat-strip__item--lead">
        <div class="stat-strip__label">Portföy</div>
        <div class="stat-strip__value">${formatMoney(summary.totalValue, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Maliyet</div>
        <div class="stat-strip__value">${formatMoney(summary.totalCost, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Kâr/zarar</div>
        <div class="stat-strip__value ${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(summary.totalProfit), { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider stat-strip__divider--wide"></div>
      <div class="stat-strip__item stat-strip__item--desktop">
        <div class="stat-strip__label">Varlık</div>
        <div class="stat-strip__value">${summary.assetCount}</div>
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
            <span class="lot-row__qty">${formatQuantity(l.quantity, l.asset)} ${escapeHTML(l.unit)} × ${formatMoney(l.unitCost)}</span>
            <span class="lot-row__total">${formatMoney(l.total, { decimals: false })}</span>
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
  if (!res) return '';
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
            <span class="lot-row__qty">${formatQuantity(l.quantity, l.asset)} ${escapeHTML(l.unit)} × ${formatMoney(l.unitCost)}</span>
            <span class="lot-row__total">${formatMoney(l.total, { decimals: false })}</span>
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
