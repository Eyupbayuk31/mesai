// Üç rapor sayfasının paylaştığı parçalar.

import { periodLabel } from '../../period.js';
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

/** Yıl kartı (mobil) — masaüstünde üst çubuğa mountYearNav ile taşınır. */
export function yearCardHTML(year, sub) {
  return `
    <div class="period-card">
      <button class="period-card__nav" id="prevYear" type="button" aria-label="Önceki yıl">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${year}</div>
        <div class="period-card__sub">${escapeHTML(sub)}</div>
      </div>
      <button class="period-card__nav" id="nextYear" type="button" aria-label="Sonraki yıl">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>`;
}

/**
 * Yıl gezinmesini hem karta hem üst çubuğa bağlar.
 * app.js her render'da üst çubuğu temizlediği için her sayfa kendisi kurar.
 */
export function wireYearNav(container, ctx, year, sub) {
  mountPeriodNav(ctx, {
    label: String(year),
    sub,
    onPrev: () => ctx.setReportYear(year - 1),
    onNext: () => ctx.setReportYear(year + 1),
  });
  container.querySelector('#prevYear')?.addEventListener('click', () => ctx.setReportYear(year - 1));
  container.querySelector('#nextYear')?.addEventListener('click', () => ctx.setReportYear(year + 1));
}

/** Kıyas tablosunda değişim hücresi. pct null ise oran basılmaz. */
export function changeCell(row) {
  if (row.pct === null) return '<span style="color:var(--text-tertiary);">—</span>';
  const up = row.pct >= 0;
  const good = row.lowerIsBetter ? !up : up;
  const sign = up ? '+' : '−';
  return `<span class="${good ? 'is-positive' : 'is-negative'}">${sign}%${Math.abs(Math.round(row.pct))}</span>`;
}

/** "Eline geçen" hücresinin ipucu — kaydırma yoksa yanıltıcı olur, basılmaz. */
export function receivedTitle(m) {
  if (!m.hasIncome || m.payslipPeriod === m.periodKey) return '';
  return ` title="${escapeHTML(periodLabel(m.payslipPeriod))} bordrosu"`;
}

export function moneyOrDash(value, show) {
  return show ? formatMoney(value, { decimals: false }) : '<span style="color:var(--text-tertiary);">—</span>';
}
