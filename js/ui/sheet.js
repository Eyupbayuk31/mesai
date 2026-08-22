// Genel amaçlı alt sayfa (bottom sheet) kontrolcüsü.

const backdrop = document.getElementById('sheetBackdrop');
let currentSheetEl = null;
let currentOnClose = null;

function buildSheetEl() {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="sheet__handle"></div>
    <div class="sheet__header">
      <h2 class="sheet__title"></h2>
      <button class="sheet__close" type="button" aria-label="Kapat">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="sheet__body"></div>
    <div class="sheet__footer"></div>
  `;
  document.body.appendChild(el);
  return el;
}

export function closeSheet() {
  if (!currentSheetEl) return;
  currentSheetEl.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  const el = currentSheetEl;
  const onClose = currentOnClose;
  currentSheetEl = null;
  currentOnClose = null;
  setTimeout(() => {
    el.remove();
    if (onClose) onClose();
  }, 260);
}

// options: { title, footerHTML, onClose, build(bodyEl, footerEl, api) }
export function openSheet(options) {
  if (currentSheetEl) closeSheet();
  const el = buildSheetEl();
  el.querySelector('.sheet__title').textContent = options.title || '';
  el.querySelector('.sheet__close').addEventListener('click', () => closeSheet());
  const bodyEl = el.querySelector('.sheet__body');
  const footerEl = el.querySelector('.sheet__footer');
  if (!options.footerHTML) footerEl.remove();
  else footerEl.innerHTML = options.footerHTML;

  currentSheetEl = el;
  currentOnClose = options.onClose || null;

  const api = { close: closeSheet, bodyEl, footerEl: options.footerHTML ? footerEl : null };
  if (options.build) options.build(bodyEl, api.footerEl, api);

  requestAnimationFrame(() => {
    el.classList.add('is-open');
    backdrop.classList.add('is-open');
  });

  return api;
}

backdrop.addEventListener('click', () => closeSheet());

// Esc ile kapatma — masaüstünde sayfa ortada bir pencere gibi açıldığı için
// klavyeyle kapatabilmek beklenen davranış.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentSheetEl) {
    e.preventDefault();
    closeSheet();
  }
});
