import { Store } from './store.js';
import { currentPeriodKey } from './period.js';
import { renderHome } from './ui/home.js';
import { renderReport } from './ui/report.js';
import { renderSettings } from './ui/settings.js';

const store = new Store();

const screenEl = document.getElementById('screen');
const topbarTitle = document.getElementById('topbarTitle');
const topbarAction = document.getElementById('topbarAction');
const tabbar = document.getElementById('tabbar');
const fab = document.getElementById('fab');

const TAB_TITLES = { home: 'Özet', report: 'Rapor', settings: 'Ayarlar' };

const ctx = {
  store,
  reportPeriodKey: currentPeriodKey(),
  setReportPeriod(key) { ctx.reportPeriodKey = key; render(); },
  setTab(tab) { setTab(tab); },
  setTopbarAction(label, onClick) {
    if (!label) { topbarAction.hidden = true; topbarAction.onclick = null; return; }
    topbarAction.hidden = false;
    topbarAction.textContent = label;
    topbarAction.onclick = onClick;
  },
  canInstall() { return !!deferredInstallPrompt; },
  async promptInstall() {
    if (!deferredInstallPrompt) return null;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner();
    return choice;
  },
};

let currentTab = 'home';

function applyTheme() {
  const theme = store.getState().settings.theme;
  document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
}

function setTab(tab) {
  currentTab = tab;
  for (const item of tabbar.querySelectorAll('.tabbar__item')) {
    item.classList.toggle('is-active', item.dataset.tab === tab);
  }
  render();
  screenEl.scrollTo(0, 0);
}

function render() {
  applyTheme();
  topbarTitle.textContent = TAB_TITLES[currentTab];
  ctx.setTopbarAction(null);
  const state = store.getState();
  if (currentTab === 'home') renderHome(screenEl, state, ctx);
  else if (currentTab === 'report') renderReport(screenEl, state, ctx);
  else if (currentTab === 'settings') renderSettings(screenEl, state, ctx);
}

tabbar.addEventListener('click', (e) => {
  const btn = e.target.closest('.tabbar__item');
  if (!btn) return;
  setTab(btn.dataset.tab);
});

fab.addEventListener('click', async () => {
  const { openEntrySheet } = await import('./ui/entry.js');
  openEntrySheet(store, null);
});

store.subscribe(() => render());

// Sistem tema tercihi değişirse (theme=auto iken) yeniden çiz
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.getState().settings.theme === 'auto') applyTheme();
});

if (!store.available) {
  const banner = document.createElement('div');
  banner.className = 'warning-banner';
  banner.style.position = 'fixed';
  banner.style.top = 'calc(var(--topbar-h) + var(--safe-top) + 8px)';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.width = 'calc(100% - 32px)';
  banner.style.maxWidth = '440px';
  banner.style.zIndex = '45';
  banner.textContent = 'Veriler bu cihazda saklanamıyor. Kapatırsan kaybolabilir.';
  document.body.appendChild(banner);
}

setTab('home');

// Service worker kaydı
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(reg);
          }
        });
      });
    }).catch(() => {});
  });
}

function showUpdateBanner(reg) {
  if (document.getElementById('updateBanner')) return;
  const el = document.createElement('div');
  el.id = 'updateBanner';
  el.className = 'update-banner';
  el.innerHTML = `<span>Yeni sürüm hazır</span><button type="button" style="font-weight:800;">Yenile</button>`;
  el.querySelector('button').addEventListener('click', () => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.waiting?.addEventListener('statechange', () => window.location.reload());
    window.location.reload();
  });
  document.body.appendChild(el);
}

// PWA yükleme (Ana ekrana ekle) — tarayıcı kendi banner'ını her zaman
// göstermeyebiliyor, bu yüzden olayı yakalayıp kendi CTA'mızı sunuyoruz.
const INSTALL_DISMISS_KEY = 'mesai.installBannerDismissed';
let deferredInstallPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandalone && !sessionDismissed()) showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallBanner();
});

function sessionDismissed() {
  try { return window.localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
}

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;
  const el = document.createElement('div');
  el.id = 'installBanner';
  el.className = 'update-banner';
  el.innerHTML = `
    <span>Mesai'yi ana ekranına ekle</span>
    <span style="display:flex; gap:14px; align-items:center;">
      <button type="button" id="installBannerAdd" style="font-weight:800;">Ekle</button>
      <button type="button" id="installBannerClose" aria-label="Kapat" style="line-height:0;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </span>
  `;
  el.querySelector('#installBannerAdd').addEventListener('click', () => ctx.promptInstall());
  el.querySelector('#installBannerClose').addEventListener('click', () => {
    try { window.localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch {}
    hideInstallBanner();
  });
  document.body.appendChild(el);
}

function hideInstallBanner() {
  document.getElementById('installBanner')?.remove();
}
