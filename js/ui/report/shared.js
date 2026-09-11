// Üç rapor sayfasının paylaştığı parçalar.

import { periodLabel, shiftPeriod, currentPeriodKey } from '../../period.js';
import { formatMoney } from '../../format.js';
import { mountPeriodNav } from '../periodNav.js';

export function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Bir ay satırı nasıl çizilecek?
 *
 * Saf ve dışa açık: rapor sayfalarının en kritik kararı bu ve DOM olmadan
 * test edilebilmeli. Dört hâl var, ikisi kolayca karıştırılıyor:
 *
 *   future    — ay henüz gelmedi. "Veri yok" DEĞİL; Kasım'a "veri yok"
 *               demek yıl sonunu bozuk gösterir.
 *   empty     — geçmiş ama hiç veri yok. Listeye hiç girmez.
 *   no-income — harcama/mesai var ama bordro girilmemiş. Satır kalır ama
 *               eline geçen ve KALAN hücreleri "—" olur: kalan'a −harcama
 *               yazmak olmayan bir açık icat etmektir, uydurma gelirle aynı
 *               sınıf bir yalan.
 *   full      — bordro girilmiş, bütün hücreler dolu.
 */
export function monthRowState(m) {
  if (!m) return 'empty';
  if (m.isFuture) return 'future';
  if (!m.hasData) return 'empty';
  return m.hasIncome ? 'full' : 'no-income';
}

/** Raporlarda gösterilecek aylar: gelecek ve bomboş aylar elenir. */
export function visibleMonths(finance) {
  return (finance?.months || []).filter((m) => monthRowState(m) !== 'empty' && monthRowState(m) !== 'future');
}

// --- Kapsam (ay / yıl) ----------------------------------------------------

/** Kapsamın okunur adı: "Eylül 2026" ya da "2026". */
export function scopeLabel(view) {
  return view?.kind === 'month' ? periodLabel(view.periodKey) : String(view?.year ?? '');
}

/** Kapsamdaki dönem sayısı — "/12" gibi sabitler yerine bunu kullan. */
export function scopeMonthCount(view) {
  return view?.kind === 'month' ? 1 : 12;
}

/** [ Ay ] [ Yıl ] anahtarı. Ayarlar ve Bordro sayfalarındaki kalıbın aynısı. */
export function scopeSwitchHTML(view) {
  const kind = view?.kind === 'month' ? 'month' : 'year';
  return `
    <div class="segmented" id="reportScope" style="margin-bottom:12px;">
      <button class="segmented__item ${kind === 'month' ? 'is-active' : ''}" data-scope-kind="month" type="button">Ay</button>
      <button class="segmented__item ${kind === 'year' ? 'is-active' : ''}" data-scope-kind="year" type="button">Yıl</button>
    </div>`;
}

/** Kapsam kartı (mobil) — masaüstünde üst çubuğa wireScopeNav ile taşınır. */
export function scopeCardHTML(view, sub) {
  const month = view?.kind === 'month';
  return `
    <div class="period-card">
      <button class="period-card__nav" id="scopePrev" type="button" aria-label="${month ? 'Önceki ay' : 'Önceki yıl'}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${escapeHTML(scopeLabel(view))}</div>
        <div class="period-card__sub">${escapeHTML(sub)}</div>
      </div>
      <button class="period-card__nav" id="scopeNext" type="button" aria-label="${month ? 'Sonraki ay' : 'Sonraki yıl'}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>`;
}

/**
 * Kapsam anahtarını ve oklarını bağlar; üst çubuğu da kurar.
 * app.js her render'da üst çubuğu temizlediği için her sayfa kendisi çağırır.
 *
 * Oklar aktif kapsama göre davranır. Kapsam değişince ikizi de düzeltilir:
 * Ay'a geçerken periodKey seçili yılın içine çekilir, Yıl'a geçerken yıl
 * seçili aydan alınır — yoksa "Eylül 2026" seçiliyken 2025'e düşülür.
 */
export function wireScopeNav(container, ctx, view, sub) {
  const month = view.kind === 'month';
  const step = (delta) => (month
    ? ctx.setReportView({ periodKey: shiftPeriod(view.periodKey, delta), year: Number(shiftPeriod(view.periodKey, delta).slice(0, 4)) })
    : ctx.setReportView({ year: view.year + delta, periodKey: `${view.year + delta}${view.periodKey.slice(4)}` }));

  mountPeriodNav(ctx, { label: scopeLabel(view), sub, onPrev: () => step(-1), onNext: () => step(1) });
  container.querySelector('#scopePrev')?.addEventListener('click', () => step(-1));
  container.querySelector('#scopeNext')?.addEventListener('click', () => step(1));

  container.querySelector('#reportScope')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-scope-kind]');
    if (!btn || btn.dataset.scopeKind === view.kind) return;
    if (btn.dataset.scopeKind === 'month') {
      // Yıl → Ay: seçili yılın içinde kal. Bu yıldaysak bugünün ayı,
      // değilse o yılın son ayı en makul giriş noktası.
      const inYear = view.periodKey.slice(0, 4) === String(view.year);
      const now = currentPeriodKey();
      const periodKey = inYear ? view.periodKey
        : (String(view.year) === now.slice(0, 4) ? now : `${view.year}-12`);
      ctx.setReportView({ kind: 'month', periodKey });
    } else {
      ctx.setReportView({ kind: 'year', year: Number(view.periodKey.slice(0, 4)) });
    }
  });
}

/** Sayfaların kapsam nesnesini tek yerden okuması için. */
export function readScope(ctx) {
  const v = ctx.reportView;
  if (v && v.kind) return v;
  const now = currentPeriodKey();
  return { kind: 'year', year: Number(now.slice(0, 4)), periodKey: now };
}

/** Kıyas tablosunda değişim hücresi. pct null ise oran basılmaz. */
export function changeCell(row) {
  if (row.pct === null) return '<span style="color:var(--text-tertiary);">—</span>';
  const up = row.pct >= 0;
  const good = row.lowerIsBetter ? !up : up;
  const sign = up ? '+' : '−';
  return `<span class="${good ? 'is-positive' : 'is-negative'}">${sign}%${Math.abs(Math.round(row.pct))}</span>`;
}

/**
 * "Eline geçen" hücresinin ipucu.
 *
 * Eskiden başka bir ayın adını basıyordu ("Ağustos bordrosu"); bordro artık
 * kendi ayına yazıldığı için o ipucu yanlış olurdu. Satırın ayı zaten ilk
 * sütunda yazılı, eklenecek bir şey kalmadı.
 */
export function receivedTitle() {
  return '';
}

export function moneyOrDash(value, show) {
  return show ? formatMoney(value, { decimals: false }) : '<span style="color:var(--text-tertiary);">—</span>';
}
