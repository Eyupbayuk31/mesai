// Yatırım sekmesi: portföy panosu (donut + toplam), varlık kartları ve
// alım defteri. Fiyat elle girilir; bütçeyle bağı yoktur, ayrı defterdir.

import {
  portfolioSummary, donutSlices, assetPosition, assetLots, lotTotal,
  PRESET_ASSETS, nextAssetColor, DONUT_RADIUS, priceUpdateFromLot, suggestedUnitCost,
} from '../investments.js';
import { formatMoney, formatDayMonth, parseLocaleNumber, todayISO } from '../format.js';
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

  container.querySelector('#addInvestmentBtn')?.addEventListener('click', () => openLotSheet(ctx, null));

  container.querySelector('.asset-list')?.addEventListener('click', (e) => {
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
        <span class="asset__value">${formatMoney(p.value, { decimals: false })}</span>
      </div>
      <div class="asset__meta">
        <span>${formatQty(p.quantity)} ${escapeHTML(p.unit)} · ort. ${formatMoney(p.avgCost)}</span>
        ${p.hasPrice
    ? `<span class="${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(p.profit), { decimals: false })} (%${formatPct(Math.abs(p.profitPct))})</span>`
    : '<span class="asset__missing">fiyat girilmedi</span>'}
      </div>
      <div class="asset__foot">
        <span>${p.lotCount} alım · maliyet ${formatMoney(p.cost, { decimals: false })}</span>
        <button class="asset__price" data-price="${p.assetId}" type="button">
          ${p.hasPrice ? `${formatMoney(p.price)} ${p.stale ? '⚠' : ''}` : 'Fiyat gir'}
        </button>
      </div>
      ${p.stale ? `<div class="asset__stale">Fiyat ${p.staleDays} gün önce güncellendi</div>` : ''}
    </div>
  `;
}

function addButtonHTML() {
  return `
    <button class="btn btn--primary" id="addInvestmentBtn" type="button" style="margin-top:16px;">
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
      <div class="empty__sub">Altın, döviz, hisse… ne aldıysan maliyetiyle yaz. Ortalama maliyetini ve kâr/zararını uygulama hesaplasın.</div>
    </div>
    ${addButtonHTML()}
  `;
}

// --- Alım ekle / düzenle -------------------------------------------------

function openLotSheet(ctx, lot, presetAssetId = null) {
  const store = ctx.store;
  const state = store.getState();
  const isNew = !lot;
  const assets = state.assets || [];
  let selectedId = lot?.assetId || presetAssetId || assets[0]?.id || null;
  let newAsset = selectedId ? null : { label: '', unit: 'gram' };

  openSheet({
    title: isNew ? 'Alım ekle' : 'Alımı düzenle',
    footerHTML: `
      <button class="btn btn--primary" id="saveLotBtn" type="button">${isNew ? 'Ekle' : 'Kaydet'}</button>
      ${isNew ? '' : '<button class="btn btn--danger btn--sm" id="removeLotBtn" type="button" style="margin-top:8px;">Alımı sil</button>'}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Varlık</label>
          <div class="cat-chips" id="assetChips">
            ${assets.map((a) => `
              <button class="cat-chip ${a.id === selectedId ? 'is-active' : ''}" data-asset-id="${a.id}" type="button" style="--cat-color:${a.color || 'var(--accent)'};">
                <span class="cat-chip__dot"></span>${escapeHTML(a.label)}
              </button>
            `).join('')}
            <button class="cat-chip ${selectedId ? '' : 'is-active'}" data-asset-id="" type="button" style="--cat-color:var(--text-tertiary);">
              <span class="cat-chip__dot"></span>+ Yeni
            </button>
          </div>
        </div>

        <div id="newAssetFields" ${selectedId ? 'hidden' : ''}>
          <div class="field">
            <label class="field__label">Ne aldın?</label>
            <input class="input" type="text" id="newAssetLabel" value="" placeholder="ör. Gram altın" autocomplete="off" />
            <div class="quick-chips" id="presetChips">
              ${PRESET_ASSETS.map((p) => `<button class="quick-chip" type="button" data-preset="${escapeAttr(p.label)}" data-unit="${p.unit}">${p.label}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label class="field__label">Birim</label>
            <input class="input" type="text" id="newAssetUnit" value="gram" placeholder="gram / adet / lot" />
          </div>
        </div>

        <div class="input-row">
          <div class="field">
            <label class="field__label">Miktar</label>
            <input class="input" type="text" inputmode="decimal" id="lotQuantity" value="${lot ? String(lot.quantity).replace('.', ',') : ''}" placeholder="1" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field__label">Aldığın birim fiyat (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="lotUnitCost" value="${initialUnitCost(lot, assets, selectedId)}" placeholder="7100" autocomplete="off" />
          </div>
        </div>
        <div class="field__hint" id="priceHint" style="margin:-10px 0 14px;"></div>

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
      const newFields = bodyEl.querySelector('#newAssetFields');

      const updatePreview = () => {
        const q = parseLocaleNumber(qtyEl.value);
        const c = parseLocaleNumber(costEl.value);
        previewEl.textContent = (q > 0 && c > 0) ? formatMoney(q * c) : '—';
      };
      qtyEl.addEventListener('input', updatePreview);
      costEl.addEventListener('input', updatePreview);
      updatePreview();

      const hintEl = bodyEl.querySelector('#priceHint');
      // Aynı fiyatı iki kez yazdırmamak için: bilinen son fiyat forma doldurulur,
      // kaydedilince de güncel fiyat bu alımdan tazelenir.
      const updateHint = () => {
        const asset = assets.find((a) => a.id === selectedId);
        const known = suggestedUnitCost(asset);
        hintEl.innerHTML = known
          ? `Bilinen son fiyat <b>${formatMoney(known)}</b> yazıldı — farklı aldıysan değiştir. Kaydedince güncel fiyat da bu olur.`
          : 'Bu fiyat aynı zamanda güncel fiyat olarak kaydedilir; ayrıca girmene gerek yok.';
      };
      updateHint();

      bodyEl.querySelector('#assetChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-asset-id]');
        if (!chip) return;
        selectedId = chip.dataset.assetId || null;
        newAsset = selectedId ? null : { label: '', unit: 'gram' };
        bodyEl.querySelectorAll('#assetChips .cat-chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        newFields.hidden = !!selectedId;
        // Yeni seçilen varlığın bilinen fiyatı forma gelsin (düzenlemede dokunma).
        if (isNew) {
          const known = suggestedUnitCost(assets.find((a) => a.id === selectedId));
          costEl.value = known ? String(known).replace('.', ',') : '';
          updatePreview();
        }
        updateHint();
      });

      bodyEl.querySelector('#presetChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-preset]');
        if (!chip) return;
        bodyEl.querySelector('#newAssetLabel').value = chip.dataset.preset;
        bodyEl.querySelector('#newAssetUnit').value = chip.dataset.unit;
      });

      footerEl.querySelector('#saveLotBtn').addEventListener('click', () => {
        const quantity = parseLocaleNumber(qtyEl.value);
        const unitCost = parseLocaleNumber(costEl.value);
        if (!Number.isFinite(quantity) || quantity <= 0) { showToast('Miktarı gir'); return; }
        if (!Number.isFinite(unitCost) || unitCost <= 0) { showToast('Birim fiyatı gir'); return; }

        let assetId = selectedId;
        if (!assetId) {
          const label = bodyEl.querySelector('#newAssetLabel').value.trim();
          if (!label) { showToast('Varlık adını yaz'); return; }
          const preset = PRESET_ASSETS.find((p) => p.label.toLowerCase() === label.toLowerCase());
          const created = store.addAsset({
            label,
            unit: bodyEl.querySelector('#newAssetUnit').value.trim() || 'adet',
            color: preset?.color || nextAssetColor(store.getState().assets),
          });
          assetId = created.id;
        }

        const payload = {
          assetId,
          quantity,
          unitCost,
          date: bodyEl.querySelector('#lotDate').value || todayISO(),
          note: bodyEl.querySelector('#lotNote').value.trim(),
        };
        if (isNew) store.addInvestment(payload);
        else store.updateInvestment(lot.id, payload);

        // Alım bir fiyat gözlemidir: en yeni alım güncel fiyatı da tazeler.
        const asset = store.getState().assets.find((a) => a.id === assetId);
        const priceUpdate = priceUpdateFromLot(asset, payload);
        if (priceUpdate) store.updateAsset(assetId, priceUpdate);

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
      <button class="btn btn--primary" id="addLotBtn" type="button">Bu varlığa alım ekle</button>
      <button class="btn btn--danger btn--sm" id="removeAssetBtn" type="button" style="margin-top:8px;">Varlığı sil</button>
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="stat-strip">
          <div class="stat-strip__item"><span class="stat-strip__label">Miktar</span><span class="stat-strip__value">${formatQty(p.quantity)} ${escapeHTML(p.unit)}</span></div>
          <div class="stat-strip__item"><span class="stat-strip__label">Ort. maliyet</span><span class="stat-strip__value">${formatMoney(p.avgCost)}</span></div>
          <div class="stat-strip__item"><span class="stat-strip__label">Değer</span><span class="stat-strip__value">${formatMoney(p.value, { decimals: false })}</span></div>
        </div>
        <div class="section-title" style="margin-top:14px;">Alımlar (${lots.length})</div>
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
        setTimeout(() => openLotSheet(ctx, lot), 280);
      });

      footerEl.querySelector('#addLotBtn').addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openLotSheet(ctx, null, asset.id), 280);
      });

      footerEl.querySelector('#removeAssetBtn').addEventListener('click', () => {
        // Varlıkla birlikte alımları da gider; kullanıcı ne kaybedeceğini bilsin.
        if (!window.confirm(`${asset.label} ve ${lots.length} alım kaydı silinecek. Emin misin?`)) return;
        ctx.store.removeAsset(asset.id);
        showToast('Varlık silindi');
        closeSheet();
      });
    },
  });
}

// FAB'dan çağrılır: sekmedeyken + düğmesi alım ekler.
export function openAddInvestment(ctx) {
  openLotSheet(ctx, null);
}

// Yeni alımda bilinen son fiyat hazır gelir; düzenlemede kaydın kendi fiyatı.
function initialUnitCost(lot, assets, selectedId) {
  if (lot) return String(lot.unitCost).replace('.', ',');
  const known = suggestedUnitCost(assets.find((a) => a.id === selectedId));
  return known ? String(known).replace('.', ',') : '';
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
