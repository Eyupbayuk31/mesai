// Alım / satış penceresi: ne aldın → miktar ya da tutar → ekle. Düzenleme ve silme de burada.

import { assetPosition, assetLots, PRESET_ASSETS, nextAssetColor, priceUpdateFromLot, suggestedUnitCost, ASSET_KINDS, kindOf, kindByKey, unitOf, quantityPresets, formatQuantity, quantityLabel, priceLabel, avgLabel, isSell, checkSell, emptyTrade, applyTradeEdit, formatInputNumber, marketPriceFor } from '../../investments.js';
import { getCachedMarket, symbolForAsset, symbolLabel } from '../../marketPrices.js';
import { formatMoney, todayISO, toISODate, parseAmount } from '../../format.js';
import { openSheet, closeSheet } from '../sheet.js';
import { showToast } from '../toast.js';
import { escapeHTML, escapeAttr, marketTimeLabel } from './shared.js';

export function openLotSheet(ctx, asset, lot, mode = 'buy', opts = {}) {
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
        const calcEl = fieldsEl.querySelector('#tCalc');
        if (calcEl) {
          const v = view();
          calcEl.textContent = trade.quantity > 0 && trade.price > 0
            ? `${formatQuantity(trade.quantity, v)} ${unitOf(v)} × ${formatMoney(trade.price)}`
            : 'Miktar ve fiyatı gir, tutarı hesaplayayım';
        }
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
        // Tutarla girişin kapalı olduğu türlerde (altın, hisse) tutar yalnızca sonuçtur.
        if (el.tagName !== 'INPUT') {
          el.textContent = trade.total > 0 ? formatMoney(trade.total) : '—';
          el.closest('.lot-total')?.classList.toggle('is-ready', trade.total > 0);
          return;
        }
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
        if (fieldsEl.querySelector(`#t_${field}`)?.tagName === 'INPUT') fieldsEl.querySelector(`#t_${field}`).classList.remove('is-derived');
        updateExtras();
      }

      function renderFields() {
        const v = view();
        if (!v) { partEl.hidden = true; return; }
        partEl.hidden = false;
        const unit = unitOf(v);
        const byAmount = kindOf(v).byAmount;
        const pos = othersPosition();
        const qtyChips = sellMode
          ? (pos && pos.quantity > 0 ? [{ q: pos.quantity, text: `Hepsi · ${formatQuantity(pos.quantity, v)} ${unit}` }] : [])
          : quantityPresets(v).map((q) => ({ q, text: `${String(q).replace('.', ',')} ${unit}` }));
        fieldsEl.innerHTML = `
          ${sellMode && pos ? `<div class="field__hint" style="margin:-4px 0 12px;">Elinde: <b>${formatQuantity(pos.quantity, v)} ${escapeHTML(unit)}</b> · ${escapeHTML(avgLabel(v))} ${formatMoney(pos.avgCost)}</div>` : ''}
          ${byAmount ? `
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
          <div class="field__hint trade-hint">İkisinden birini yaz, diğeri hesaplanır.</div>` : `
          <div class="field" style="margin-bottom:8px;">
            <label class="field__label" for="t_quantity">${sellMode ? `Kaç ${escapeHTML(unit)} sattın?` : escapeHTML(quantityLabel(v))}</label>
            <input class="input" type="text" inputmode="decimal" id="t_quantity" placeholder="1" autocomplete="off" />
          </div>`}
          <div class="quick-chips" id="qtyChips" style="margin-bottom:14px;">
            ${qtyChips.map((c) => `<button class="quick-chip" type="button" data-qty="${c.q}">${escapeHTML(c.text)}</button>`).join('')}
          </div>
          <div class="field" style="margin-bottom:6px;">
            <label class="field__label" for="t_price">${sellMode ? `1 ${escapeHTML(unit)} kaç ₺'ye sattın?` : escapeHTML(priceLabel(v))}</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="t_price" placeholder="7100" autocomplete="off" />
            <div class="field__hint" id="tPriceHint" style="margin-top:6px;"></div>
          </div>
          ${byAmount ? '' : `
          <div class="lot-total" id="lotTotalBox">
            <span class="lot-total__label">${sellMode ? 'Eline geçen' : 'Ödediğin'}</span>
            <span class="lot-total__value" id="t_total">—</span>
            <span class="lot-total__calc" id="tCalc"></span>
          </div>`}
          ${sellMode ? '<div class="field__hint" id="lotRealizedHint" style="margin:8px 0 4px;"></div>' : ''}
          ${!current && draft?.symbol && !sellMode ? `
          <label class="market-toggle" style="margin:12px 0 6px;">
            <input type="checkbox" id="newAuto" ${autoOn ? 'checked' : ''} />
            <span><b>Fiyatı otomatik güncelle <em>(tahmini)</em></b><small>Piyasadaki ${escapeHTML(symbolLabel(draft.symbol))} alış fiyatı kullanılır; kâr/zarar "tahmini" yazar.</small></span>
          </label>` : ''}
        `;
        for (const f of ['quantity', 'price', 'total']) {
          paintInput(f);
          const el = fieldsEl.querySelector(`#t_${f}`);
          if (el?.tagName === 'INPUT') el.addEventListener('input', (e) => onEdit(f, e.target.value));
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
