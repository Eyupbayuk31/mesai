// Piyasa fiyatları sayfası (Yatırım > Piyasa fiyatları): dolar, euro, altın…
// anlık alış/satış, günlük değişim, bu cihazda biriken kısa geçmiş ve elindeki
// miktarın tahmini değeri. Salt okunur bir panodur — hiçbir kayıt yazmaz.
//
// Fiyat kaynağı js/marketPrices.js; çekim ve önbellek oradadır. Sayfa açılınca
// (10 dk'dan eskiyse) kendiliğinden yenilenir, "yenile" ile zorlanır.

import {
  getCachedMarket, getMarketLog, marketRows, convertToTry, isFresh, MARKET_URL,
} from '../marketPrices.js';
import { portfolioSummary } from '../investments.js';
import { formatMoney, todayISO, toISODate, parseAmount } from '../format.js';
import { showToast } from './toast.js';

export const title = 'Piyasa fiyatları';

// Dolar, euro ve gram altın tek tıkla gözüksün; renkler yatırım ekranındaki
// varlık renkleriyle aynı (kartı tanıyalım diye).
const COLORS = {
  USD: '#2f8a5c', EUR: '#2f63c4', GBP: '#5b6472',
  GRA: '#d4a017', CEYREKALTIN: '#c98b12', YARIMALTIN: '#b8770e', TAMALTIN: '#a3640c',
  CUMHURIYETALTINI: '#8a560a', GUMUS: '#8c96a3',
};

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatPct(value) {
  return Math.abs(Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "bugün 11:42" / "dün 18:05" / "3 gün önce"
function timeLabel(market) {
  const t = Date.parse(market?.fetchedAt);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const hhmm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (toISODate(d) === todayISO()) return `bugün ${hhmm}`;
  const days = Math.floor((Date.now() - t) / 86400000);
  return days <= 1 ? `dün ${hhmm}` : `${days} gün önce`;
}

// Kısa geçmiş çizgisi: bu cihazda biriken günlük alış fiyatları. İki günden az
// veri varsa çizilmez — tek noktalı çizgi bilgi taşımaz.
function sparkSVG(series, color) {
  if (!Array.isArray(series) || series.length < 2) return '';
  const w = 84;
  const h = 28;
  const values = series.map((s) => s.p);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const pts = series.map((s, i) => {
    const x = (i / (series.length - 1)) * (w - 4) + 2;
    const y = 3 + (1 - (s.p - min) / (max - min)) * (h - 6);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const first = values[0];
  const last = values[values.length - 1];
  return `<svg class="mkt__spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"
    aria-label="Son ${series.length} günde ${last >= first ? 'yükseliş' : 'düşüş'}"><path d="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function changePill(change) {
  if (change === null || change === undefined) return '';
  const flat = Math.abs(change) < 0.005;
  const up = change > 0;
  const cls = flat ? 'mkt__chg--flat' : up ? 'is-positive' : 'is-negative';
  const arrow = flat ? '–' : up ? '▲' : '▼';
  return `<span class="mkt__chg ${cls}" title="Günlük değişim">${arrow} %${formatPct(change)}</span>`;
}

function tileHTML(item) {
  const color = COLORS[item.symbol] || 'var(--accent)';
  return `
    <article class="card mkt__tile" data-symbol="${item.symbol}">
      <header class="mkt__head">
        <span class="mkt__name"><span class="asset__dot" style="background:${color}"></span>${escapeHTML(item.label)}</span>
        ${changePill(item.change)}
      </header>
      <div class="mkt__price">${formatMoney(item.buy)}</div>
      <div class="mkt__sub">${escapeHTML(item.unit)} · alış</div>
      <div class="mkt__row">
        <span class="mkt__sell">satış <b>${formatMoney(item.sell)}</b></span>
        ${sparkSVG(item.series, color)}
      </div>
      ${item.held ? `<div class="mkt__held">Elinde ${Number(item.held.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${escapeHTML(item.held.unit)} · <b>${formatMoney(item.held.value, { decimals: false })}</b></div>` : ''}
    </article>`;
}

function converterHTML(groups, conv) {
  const items = groups.flatMap((g) => g.items);
  if (items.length === 0) return '';
  return `
    <div class="card mkt__conv">
      <div class="section-title" style="margin-top:0;">Hızlı çevirici</div>
      <div class="input-row">
        <div class="field" style="margin-bottom:0;">
          <label class="field__label" for="convAmount">Miktar</label>
          <input class="input" id="convAmount" type="text" inputmode="decimal" placeholder="100" autocomplete="off" value="${escapeHTML(conv.amount)}" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label" for="convSymbol">Birim</label>
          <select class="input" id="convSymbol">
            ${items.map((i) => `<option value="${i.symbol}" ${i.symbol === conv.symbol ? 'selected' : ''}>${escapeHTML(i.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="mkt__conv-out" id="convOut" aria-live="polite"></div>
    </div>`;
}

export function render(container, state, ctx) {
  const market = getCachedMarket();
  const positions = portfolioSummary(state, Date.now(), market).positions;
  const groups = marketRows(market, getMarketLog(), positions);
  const fresh = isFresh(market);
  ctx.marketConv = ctx.marketConv || { amount: '', symbol: 'USD' };

  // Sayfa açılışında taze fiyat iste (10 dk'dan tazeyse istek atılmaz).
  ctx.refreshMarket?.({ always: true });

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="card empty">
        <div class="empty__icon">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>
        </div>
        <div class="empty__title">Fiyatlar henüz alınmadı</div>
        <div class="empty__sub">İnternete bağlıyken piyasa fiyatları burada görünür. Bağlantıyı kontrol edip tekrar dene.</div>
        <button class="btn btn--primary" id="mktRefresh" type="button" style="margin-top:14px;">Fiyatları getir</button>
      </div>`;
    container.querySelector('#mktRefresh').addEventListener('click', () => refresh(ctx));
    return;
  }

  container.innerHTML = `
    <div class="mkt__bar">
      <div class="mkt__stamp">
        <span class="mkt__live ${fresh ? '' : 'is-stale'}" aria-hidden="true"></span>
        <span>${fresh ? 'Güncellendi' : 'Eski fiyat'} · ${escapeHTML(timeLabel(market))}</span>
      </div>
      <button class="section-header__link" id="mktRefresh" type="button">Yenile</button>
    </div>
    ${fresh ? '' : '<div class="card mkt__warn">Fiyatlar 3 günden eski. Yatırım ekranında bu fiyatlar kullanılmaz; yenilemek için internete bağlan.</div>'}

    ${groups.map((g) => `
      <section class="mkt__group">
        <div class="section-title">${g.label}</div>
        <div class="mkt__grid">${g.items.map(tileHTML).join('')}</div>
      </section>`).join('')}

    ${converterHTML(groups, ctx.marketConv)}

    <p class="mkt__foot">Fiyatlar <a href="${MARKET_URL}" target="_blank" rel="noopener noreferrer">Truncgil</a> servisinden okunur; bilgi amaçlıdır, işlem fiyatı değildir.
      Yatırım ekranında bu fiyatların <b>alış</b> değeri kullanılır ve "tahmini" yazar.
      Küçük grafikler yalnızca bu cihazda uygulama açıkken biriken günlük fiyatlardır.</p>
  `;

  container.querySelector('#mktRefresh').addEventListener('click', () => refresh(ctx));

  const amountEl = container.querySelector('#convAmount');
  const symbolEl = container.querySelector('#convSymbol');
  const outEl = container.querySelector('#convOut');
  if (amountEl) {
    const update = () => {
      ctx.marketConv = { amount: amountEl.value, symbol: symbolEl.value };
      const amount = parseAmount(amountEl.value);
      const total = convertToTry(market, symbolEl.value, amount);
      outEl.innerHTML = total > 0
        ? `<span>${amount.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${escapeHTML(symbolEl.selectedOptions[0].textContent)}</span> <b>≈ ${formatMoney(total)}</b>`
        : '<span class="mkt__hint">Miktarı yaz, alış fiyatıyla kaç lira ettiğini göster.</span>';
    };
    amountEl.addEventListener('input', update);
    symbolEl.addEventListener('change', update);
    update();
  }
}

async function refresh(ctx) {
  const res = await ctx.refreshMarket?.({ force: true, always: true });
  if (res && !res.ok) showToast('Fiyat alınamadı — son bilinen fiyatlar gösteriliyor');
  else if (res?.ok) showToast('Fiyatlar güncellendi');
}
