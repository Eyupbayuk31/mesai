// Mobil menü: soldan açılan çekmece. Masaüstünde kenar çubuğu zaten sabit
// durduğu için çekmece hiç açılmaz (CSS ile gizli, düğmesi de görünmez).
//
// Açıkken geçmişe bir kayıt bırakır: telefonun geri hareketi menüyü kapatır,
// sayfayı değiştirmez.

const HISTORY_MARK = 'drawer';

let el = null;
let backdrop = null;
let isOpen = false;

function ensure() {
  if (!el) {
    el = document.getElementById('drawer');
    backdrop = document.getElementById('drawerBackdrop');
  }
  return el;
}

export function isDrawerOpen() {
  return isOpen;
}

export function openDrawer() {
  if (!ensure() || isOpen) return;
  isOpen = true;
  el.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add('has-drawer');
  requestAnimationFrame(() => {
    el.classList.add('is-open');
    backdrop.classList.add('is-open');
  });
  history.pushState({ ...history.state, [HISTORY_MARK]: true }, '');
}

export function closeDrawer({ fromHistory = false } = {}) {
  if (!ensure() || !isOpen) return;
  isOpen = false;
  el.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.body.classList.remove('has-drawer');
  setTimeout(() => {
    if (!isOpen) { el.hidden = true; backdrop.hidden = true; }
  }, 240);
  // Menü kendi geçmiş kaydını temizler; geri tuşuyla kapandıysa zaten gitti.
  if (!fromHistory && history.state?.[HISTORY_MARK]) history.back();
}

export function toggleDrawer() {
  if (isOpen) closeDrawer();
  else openDrawer();
}

/** app.js açılışta bir kez bağlar. */
export function wireDrawer({ onNavigate, listEl }) {
  ensure();
  backdrop.addEventListener('click', () => closeDrawer());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { e.preventDefault(); closeDrawer(); }
  });

  window.addEventListener('popstate', () => {
    if (isOpen && !history.state?.[HISTORY_MARK]) closeDrawer({ fromHistory: true });
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-tab]');
    if (!btn) return;
    closeDrawer();
    // Kapanma animasyonu bitmeden yeni sayfa çizilirse takılıyor gibi duruyor.
    setTimeout(() => onNavigate({ tab: btn.dataset.navTab, page: btn.dataset.navPage || null }), 120);
  });
}
