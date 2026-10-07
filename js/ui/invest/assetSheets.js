// Varlık pencereleri: varlık düzenle, güncel fiyat, varlık detayı (alım listesi), toplu fiyat.

import { assetPosition, assetLots, lotTotal, PRESET_ASSETS, nextAssetColor, ASSET_KINDS, kindOf, kindByKey, unitOf, formatQuantity, priceLabel, isSell, priceObservations, priceChangePct } from '../../investments.js';
import { assetPriceChartHTML } from '../investChart.js';
import { getCachedMarket, getMarketLog, symbolForAsset, symbolLabel } from '../../marketPrices.js';
import { formatMoney, formatDayMonth, parseAmount } from '../../format.js';
import { openSheet, closeSheet } from '../sheet.js';
import { showToast } from '../toast.js';
import { formatPct, escapeHTML, escapeAttr } from './shared.js';
import { openLotSheet } from './lotSheet.js';

export function openAssetFormSheet(ctx, asset) {
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

export function openPriceSheet(ctx, asset) {
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

export function openAssetSheet(ctx, asset) {
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

export function openBulkPriceSheet(ctx) {
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

// Varlık formunda tür/birim değiştikçe güncellenen fiyat sorusu.
function priceLabelFor(kindKey, unit) {
  const safeUnit = unit || kindByKey(kindKey).defaultUnit;
  return `1 ${safeUnit} kaç ₺?`;
}
