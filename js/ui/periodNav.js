// Üst çubuğun orta yuvasındaki dönem denetimi (yalnızca masaüstünde görünür).
//
// Mobilde dönem gezinme ekranın içindeki .period-card ile yapılıyor; o kart
// masaüstünde CSS ile gizleniyor. Böylece ekran modülleri tek bir veri akışıyla
// iki düzeni de besliyor, kod çiftlenmiyor.

/**
 * Oklu dönem gezinme: ‹ Ağustos 2026 ›
 * @param {object} ctx uygulama bağlamı (setTopbarContext)
 * @param {{label:string, onPrev:Function, onNext:Function, sub?:string, disabled?:boolean}} opts
 */
export function mountPeriodNav(ctx, { label, onPrev, onNext, sub, disabled = false }) {
  ctx.setTopbarContext(`
    <div class="period-nav">
      <button class="period-nav__btn" data-dir="-1" type="button" aria-label="Önceki dönem" ${disabled ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <span class="period-nav__body">
        <span class="period-nav__label">${escapeHTML(label)}</span>
        ${sub ? `<span class="period-nav__sub">${escapeHTML(sub)}</span>` : ''}
      </span>
      <button class="period-nav__btn" data-dir="1" type="button" aria-label="Sonraki dönem" ${disabled ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
  `, (root) => {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dir]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.dir === '-1') onPrev();
      else onNext();
    });
  });
}

/** Oksuz bilgi bandı — Özet'te dönem sabit olduğu için gezinme yok. */
export function mountPeriodInfo(ctx, { label, sub }) {
  ctx.setTopbarContext(`
    <div class="period-nav period-nav--static">
      <span class="period-nav__body">
        <span class="period-nav__label">${escapeHTML(label)}</span>
        ${sub ? `<span class="period-nav__sub">${escapeHTML(sub)}</span>` : ''}
      </span>
    </div>
  `);
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
