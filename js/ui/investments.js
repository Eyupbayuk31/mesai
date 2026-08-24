// Yatırım sekmesi: portföy panosu (donut + toplam), varlık kartları ve
// alım defteri. Fiyat elle girilir; bütçeyle bağı yoktur, ayrı defterdir.

import {
  portfolioSummary, donutSlices, assetPosition, assetLots, lotTotal,
  PRESET_ASSETS, nextAssetColor, DONUT_RADIUS, priceUpdateFromLot, suggestedUnitCost,
} from '../investments.js';
import { formatMoney, formatDayMonth, todayISO } from '../format.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export const title = 'Yatırım';

export function render(container, state, ctx) {
  const summary = portfolioSummary(state);

  container.innerHTML = summary.assetCount === 0 ? emptyHTML() : `
    <div class="panes">
      <div class="pane">
        ${dashboardHTML(summary)}
      </div>
      <div class="pane">
        <div class="section-title">Varlıklar</div>
        <div class="asset-list">${summary.positions.map(assetCardHTML).join('')}</div>
        ${addButtonHTML()}
      </div>
    </div>
  `;

  container.querySelector('#addAssetBtn')?.addEventListener('click', () => openAssetFormSheet(ctx, null));

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
        ${warn ? `<div class="hero__note">${warn}</div>` : ''}
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
        <span>${formatQty(p.quantity)} ${escapeHTML(p.unit)} · ort. ${formatMoney(p.avgCost)}</span>
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
            ${PRESET_ASSETS.map((pr) => `<button class="quick-chip" type="button" data-preset="${escapeAttr(pr.label)}" data-unit="${pr.unit}">${pr.label}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="input-row">
          <div class="field">
            <label class="field__label">Birim</label>
            <input class="input" type="text" id="assetUnit" value="${escapeAttr(asset?.unit || 'gram')}" placeholder="gram / adet / lot" />
          </div>
          <div class="field">
            <label class="field__label">Güncel fiyat (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="assetPrice"
              value="${asset?.currentPrice ? String(asset.currentPrice).replace('.', ',') : ''}" placeholder="7900" autocomplete="off" />
          </div>
        </div>
        <div class="field__hint" style="margin:-10px 0 0;">
          1 birimin bugünkü değeri. Kâr/zarar buna göre hesaplanır; sonra alım eklersen kendiliğinden tazelenir.
        </div>
      `;

      bodyEl.querySelector('#presetChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-preset]');
        if (!chip) return;
        bodyEl.querySelector('#assetLabel').value = chip.dataset.preset;
        bodyEl.querySelector('#assetUnit').value = chip.dataset.unit;
      });

      footerEl.querySelector('#saveAssetBtn').addEventListener('click', () => {
        const label = bodyEl.querySelector('#assetLabel').value.trim();
        if (!label) { showToast('Ne biriktirdiğini yaz'); return; }
        const price = parseAmount(bodyEl.querySelector('#assetPrice').value);
        const payload = {
          label,
          unit: bodyEl.querySelector('#assetUnit').value.trim() || 'adet',
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
          <div class="field">
            <label class="field__label">Kaç ${escapeHTML(asset.unit || 'adet')} aldın?</label>
            <input class="input" type="text" inputmode="decimal" id="lotQuantity"
              value="${lot ? String(lot.quantity).replace('.', ',') : ''}" placeholder="1" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field__label">Kaçtan aldın? (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="lotUnitCost"
              value="${lot ? String(lot.unitCost).replace('.', ',') : (known ? String(known).replace('.', ',') : '')}" placeholder="7100" autocomplete="off" />
          </div>
        </div>
        <div class="field__hint" style="margin:-10px 0 14px;">
          ${known && isNew
    ? `Bilinen fiyat <b>${formatMoney(known)}</b> yazıldı — farklı aldıysan değiştir. Kaydedince güncel fiyat da bu olur.`
    : 'Bu fiyat aynı zamanda güncel fiyat olarak kaydedilir; ayrıca girmene gerek yok.'}
        </div>

        <div class="preview-strip">
          <span class="preview-strip__label">Ödediğin</span>
          <span class="preview-strip__value" id="lotTotalPreview">—</span>
        </div>

        <div class="field">
          <label class="field__label">Tarih</label>
          <input class="input" type="date" id="lotDate" value="${lot?.date || todayISO()}" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Not <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="lotNote" value="${escapeAttr(lot?.note || '')}" placeholder="ör. kuyumcudan" />
        </div>
      `;

      const qtyEl = bodyEl.querySelector('#lotQuantity');
      const costEl = bodyEl.querySelector('#lotUnitCost');
      const previewEl = bodyEl.querySelector('#lotTotalPreview');

      const updatePreview = () => {
        const q = parseAmount(qtyEl.value);
        const c = parseAmount(costEl.value);
        previewEl.textContent = (q > 0 && c > 0) ? formatMoney(q * c) : '—';
      };
      qtyEl.addEventListener('input', updatePreview);
      costEl.addEventListener('input', updatePreview);
      updatePreview();
      setTimeout(() => qtyEl.focus(), 120);

      footerEl.querySelector('#saveLotBtn').addEventListener('click', () => {
        const quantity = parseAmount(qtyEl.value);
        const unitCost = parseAmount(costEl.value);
        if (quantity <= 0) { showToast(`Kaç ${asset.unit || 'adet'} aldığını gir`); return; }
        if (unitCost <= 0) { showToast('Kaçtan aldığını gir'); return; }

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
    title: `${asset.label} · güncel piyasa fiyatı`,
    footerHTML: '<button class="btn btn--primary" id="savePriceBtn" type="button">Kaydet</button>',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          Bugün 1 ${escapeHTML(asset.unit || 'adet')} kaç lira? Kâr/zarar bu fiyata göre hesaplanır.
          Yeni alım eklersen burayı elle güncellemene gerek yok — alım fiyatı buraya da yazılır.
        </p>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Birim fiyat (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="priceInput"
            value="${asset.currentPrice ? String(asset.currentPrice).replace('.', ',') : ''}" placeholder="7900" autocomplete="off" />
        </div>
      `;
      const input = bodyEl.querySelector('#priceInput');
      setTimeout(() => input.focus(), 120);
      const save = () => {
        const price = parseLocaleNumber(input.value);
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

  openSheet({
    title: asset.label,
    footerHTML: `
      <button class="btn btn--primary" id="addLotBtn" type="button">Alım ekle</button>
      <button class="btn btn--secondary btn--sm" id="editAssetBtn" type="button" style="margin-top:8px;">Varlığı düzenle</button>
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="stat-strip">
          <div class="stat-strip__item"><span class="stat-strip__label">Miktar</span><span class="stat-strip__value">${formatQty(p.quantity)} ${escapeHTML(p.unit)}</span></div>
          <div class="stat-strip__item"><span class="stat-strip__label">Ort. maliyet</span><span class="stat-strip__value">${formatMoney(p.avgCost)}</span></div>
          <div class="stat-strip__item"><span class="stat-strip__label">Değer</span><span class="stat-strip__value">${formatMoney(p.value, { decimals: false })}</span></div>
        </div>
        <div class="section-title" style="margin-top:14px;">Alımlar (${lots.length})</div>
        ${lots.length === 0 ? '<div class="field__hint" style="margin-bottom:6px;">Henüz alım yok. Aşağıdaki <b>Alım ekle</b> ile kaç tane aldığını gir.</div>' : ''}
        <div class="lot-list">
          ${lots.map((l) => `
            <button class="lot-row" type="button" data-lot="${l.id}">
              <span class="lot-row__date">${formatDayMonth(l.date)}</span>
              <span class="lot-row__qty">${formatQty(l.quantity)} × ${formatMoney(l.unitCost)}</span>
              <span class="lot-row__total">${formatMoney(lotTotal(l), { decimals: false })}</span>
            </button>
          `).join('')}
        </div>
      `;

      bodyEl.querySelector('.lot-list').addEventListener('click', (e) => {
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

function formatQty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
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
