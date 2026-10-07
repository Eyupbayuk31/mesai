// Yatırım sekmesi çizgi grafikleri: portföy değeri (maliyetle birlikte) ve
// tek varlığın fiyat seyri. Kütüphane yok: çizgiler SVG, etiketler ve ipucu
// HTML — metin gerilmesin diye SVG yalnızca şekli çizer.
//
// Tek eksen, ince (2px) çizgi, ızgara geri planda. İki seri (değer / maliyet)
// olduğundan lejant her zaman var; ayrıca tablo görünümü sunulur.

import { portfolioHistory, HISTORY_RANGES } from '../investments.js';
import { formatMoney, formatDayMonth, parseISODate } from '../format.js';

const W = 320;
const H = 140;
const PAD_X = 4;
const PAD_Y = 10;

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dateLabel(iso, withYear) {
  const base = formatDayMonth(iso);
  return withYear ? `${base} ${parseISODate(iso).getFullYear()}` : base;
}

// Değerleri [PAD_Y, H - PAD_Y] aralığına yayar; tüm seriler için ortak ölçek.
function makeScale(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const span = max - min;
  return { min, max, y: (v) => PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y) };
}

function xAt(i, count) {
  return count <= 1 ? W / 2 : PAD_X + (i / (count - 1)) * (W - 2 * PAD_X);
}

function pathOf(points, y) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, points.length).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
}

/**
 * Portföy değeri grafiği kartı. Veri yoksa ya da tek nokta varsa boş döner:
 * tek noktalı "grafik" bilgi taşımaz.
 */
export function portfolioChartHTML(state, rangeKey) {
  const { points } = portfolioHistory(state, rangeKey);
  const ranges = `
    <div class="chips invest-chart__ranges" id="chartRange" role="group" aria-label="Zaman aralığı">
      ${HISTORY_RANGES.map((r) => `<button class="quick-chip ${r.key === rangeKey ? 'is-active' : ''}" type="button" data-range="${r.key}">${r.label}</button>`).join('')}
    </div>`;

  if (points.length < 2) {
    // Aralığı daraltınca nokta kalmayabilir: seçici yine de görünsün ki geri dönülebilsin.
    return `
      <div class="card">
        <div class="section-header" style="margin-bottom:10px;"><span class="section-title" style="margin:0;">Değer seyri</span></div>
        ${ranges}
        <div class="field__hint">Grafik için en az iki farklı günde bilgi gerekir. Alım ekledikçe ya da fiyatı güncelledikçe dolar.</div>
      </div>`;
  }

  const values = points.flatMap((p) => [p.value, p.cost]);
  const { y, min, max } = makeScale(values);
  const valueLine = pathOf(points.map((p) => p.value), y);
  const costLine = pathOf(points.map((p) => p.cost), y);
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${valueLine} L${xAt(points.length - 1, points.length).toFixed(1)} ${H - PAD_Y} L${xAt(0, points.length).toFixed(1)} ${H - PAD_Y} Z`;
  const crossYear = first.date.slice(0, 4) !== last.date.slice(0, 4);
  const gain = last.value - last.cost;
  const up = gain >= 0;

  const grid = [0, 0.5, 1].map((t) => {
    const gy = PAD_Y + t * (H - 2 * PAD_Y);
    return `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" class="invest-chart__grid" vector-effect="non-scaling-stroke" />`;
  }).join('');

  return `
    <div class="card invest-chart" id="portfolioChart" data-count="${points.length}">
      <div class="section-header" style="margin-bottom:10px;">
        <span class="section-title" style="margin:0;">Değer seyri</span>
        <span class="section-header__meta ${up ? 'is-positive' : 'is-negative'}">${up ? '+' : '−'}${formatMoney(Math.abs(gain), { decimals: false })}</span>
      </div>
      ${ranges}
      <div class="invest-chart__legend">
        <span><i class="invest-chart__key invest-chart__key--value"></i>Portföy değeri</span>
        <span><i class="invest-chart__key invest-chart__key--cost"></i>Yatırılan maliyet</span>
      </div>
      <div class="invest-chart__plot" id="chartPlot" tabindex="0"
        aria-label="Portföy değeri ${escapeHTML(dateLabel(first.date, crossYear))} ile bugün arasında ${formatMoney(first.value, { decimals: false })} değerinden ${formatMoney(last.value, { decimals: false })} değerine geldi">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          ${grid}
          <path d="${area}" class="invest-chart__area" />
          <path d="${costLine}" class="invest-chart__line invest-chart__line--cost" vector-effect="non-scaling-stroke" fill="none" />
          <path d="${valueLine}" class="invest-chart__line invest-chart__line--value" vector-effect="non-scaling-stroke" fill="none" />
        </svg>
        <span class="invest-chart__ymax">${formatMoney(max, { decimals: false })}</span>
        <span class="invest-chart__ymin">${formatMoney(min, { decimals: false })}</span>
        <div class="invest-chart__cursor" id="chartCursor" hidden>
          <i class="invest-chart__dot invest-chart__dot--value" id="chartDotValue"></i>
          <i class="invest-chart__dot invest-chart__dot--cost" id="chartDotCost"></i>
        </div>
        <div class="invest-chart__tip" id="chartTip" hidden></div>
      </div>
      <div class="invest-chart__axis">
        <span>${escapeHTML(dateLabel(first.date, crossYear))}</span>
        <span>bugün</span>
      </div>
      <details class="invest-chart__table">
        <summary>Tablo olarak gör</summary>
        <table class="invest-chart__tbl">
          <thead><tr><th>Tarih</th><th class="num">Değer</th><th class="num">Maliyet</th></tr></thead>
          <tbody>
            ${[...points].reverse().map((p) => `<tr><td>${escapeHTML(dateLabel(p.date, true))}</td><td class="num">${formatMoney(p.value, { decimals: false })}</td><td class="num">${formatMoney(p.cost, { decimals: false })}</td></tr>`).join('')}
          </tbody>
        </table>
      </details>
    </div>`;
}

/**
 * Zaman aralığı seçicisi ve imleç/ipucu. `points` yeniden hesaplanır: DOM'daki
 * veriyle değil, aynı fonksiyonla — ekranda görünenle ipucu hep tutarlı.
 */
export function bindPortfolioChart(container, state, ctx, rangeKey) {
  container.querySelector('#chartRange')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-range]');
    if (!chip) return;
    ctx.investRange = chip.dataset.range;
    ctx.rerender();
  });

  const plot = container.querySelector('#chartPlot');
  if (!plot) return;
  const { points } = portfolioHistory(state, rangeKey);
  if (points.length < 2) return;

  const values = points.flatMap((p) => [p.value, p.cost]);
  const { y } = makeScale(values);
  const cursor = plot.querySelector('#chartCursor');
  const tip = plot.querySelector('#chartTip');
  const dotValue = plot.querySelector('#chartDotValue');
  const dotCost = plot.querySelector('#chartDotCost');
  const crossYear = points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4);

  const show = (i) => {
    const p = points[i];
    const rect = plot.getBoundingClientRect();
    const px = (xAt(i, points.length) / W) * rect.width;
    cursor.hidden = false;
    cursor.style.left = `${px}px`;
    dotValue.style.top = `${(y(p.value) / H) * rect.height}px`;
    dotCost.style.top = `${(y(p.cost) / H) * rect.height}px`;
    const gain = p.value - p.cost;
    tip.innerHTML = `
      <b>${escapeHTML(dateLabel(p.date, crossYear))}</b>
      <span>Değer ${formatMoney(p.value, { decimals: false })}</span>
      <span>Maliyet ${formatMoney(p.cost, { decimals: false })}</span>
      <span class="${gain >= 0 ? 'is-positive' : 'is-negative'}">${gain >= 0 ? '+' : '−'}${formatMoney(Math.abs(gain), { decimals: false })}</span>`;
    tip.hidden = false;
    // İpucu imleci izler ama kenardan taşmaz.
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(px, half + 2), rect.width - half - 2)}px`;
  };
  const hide = () => { cursor.hidden = true; tip.hidden = true; };

  const nearest = (clientX) => {
    const rect = plot.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xAt(i, points.length) - x);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  };

  plot.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerleave', hide);
  // Klavye: oklarla noktalar arasında gez, Esc kapatır.
  let kbIndex = points.length - 1;
  plot.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { kbIndex = Math.max(0, kbIndex - 1); show(kbIndex); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { kbIndex = Math.min(points.length - 1, kbIndex + 1); show(kbIndex); e.preventDefault(); }
    else if (e.key === 'Escape') hide();
  });
  plot.addEventListener('blur', hide);
}

/**
 * Tek varlığın fiyat seyri (varlık detay sayfası): küçük çizgi + son N günlük
 * değişimler. En az iki gözlem yoksa boş döner.
 */
export function assetPriceChartHTML(observations, changes) {
  if (!observations || observations.length < 2) return '';
  const { y } = makeScale(observations.map((o) => o.price));
  const line = pathOf(observations.map((o) => o.price), y);
  const first = observations[0];
  const last = observations[observations.length - 1];
  const crossYear = first.date.slice(0, 4) !== last.date.slice(0, 4);
  const chips = changes.filter((c) => c.pct !== null).map((c) => {
    const up = c.pct >= 0;
    return `<span class="invest-chart__chg ${up ? 'is-positive' : 'is-negative'}"><em>${c.label}</em> ${up ? '+' : '−'}%${Math.abs(c.pct).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>`;
  }).join('');
  return `
    <div class="invest-chart invest-chart--asset">
      <div class="section-header" style="margin:18px 0 8px;">
        <span class="section-title" style="margin:0;">Fiyat seyri</span>
        <span class="section-header__note">${escapeHTML(dateLabel(first.date, crossYear))} → bugün</span>
      </div>
      <div class="invest-chart__plot invest-chart__plot--mini" role="img"
        aria-label="Fiyat ${formatMoney(first.price)} değerinden ${formatMoney(last.price)} değerine geldi">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="${W}" y1="${H - PAD_Y}" y2="${H - PAD_Y}" class="invest-chart__grid" vector-effect="non-scaling-stroke" />
          <path d="${line}" class="invest-chart__line invest-chart__line--value" vector-effect="non-scaling-stroke" fill="none" />
        </svg>
      </div>
      ${chips ? `<div class="invest-chart__changes">${chips}</div>` : ''}
    </div>`;
}
