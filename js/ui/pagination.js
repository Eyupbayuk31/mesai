// Liste sayfalama: saf hesap + numara çubuğu HTML'i.

export const PER_PAGE = 15;

// Sayfa aralık dışıysa kırpılır; boş liste için totalPages 1 kalır.
export function paginate(items, page, perPage = PER_PAGE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: safePage,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, total),
  };
}

// Gösterilecek sayfa numaraları; aradaki boşluklar null ("…") ile işaretlenir.
// En fazla `maxNumbers` numara gösterilir, aktif sayfa hep görünür kalır.
export function pageWindow(page, totalPages, maxNumbers = 5) {
  if (totalPages <= maxNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set([1, totalPages, page]);
  // Aktif sayfanın iki yanını, uçlara yaklaşınca kayan bir pencereyle doldur.
  let left = page - 1;
  let right = page + 1;
  while (pages.size < maxNumbers) {
    if (left >= 1) pages.add(left--);
    if (pages.size < maxNumbers && right <= totalPages) pages.add(right++);
    if (left < 1 && right > totalPages) break;
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) withGaps.push(null);
    withGaps.push(sorted[i]);
  }
  return withGaps;
}

// Tek sayfalık listede çubuk hiç gösterilmez.
export function paginationHTML({ page, totalPages }) {
  if (totalPages <= 1) return '';
  const numbers = pageWindow(page, totalPages)
    .map((n) => (n === null
      ? `<span class="pagination__gap">…</span>`
      : `<button class="pagination__page ${n === page ? 'is-active' : ''}" type="button" data-page="${n}">${n}</button>`))
    .join('');

  return `
    <nav class="pagination" aria-label="Sayfalar">
      <button class="pagination__nav" type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Önceki sayfa">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      ${numbers}
      <button class="pagination__nav" type="button" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''} aria-label="Sonraki sayfa">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </nav>
  `;
}
