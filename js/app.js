import { Store } from './store.js';
import { currentPeriodKey } from './period.js';
import { Router } from './router.js';
import { renderHome } from './ui/home.js';
import { renderEntries } from './ui/entries.js';
import { renderReport } from './ui/report.js';
import { renderBudget } from './ui/budget.js';
import { renderSettingsRoute, settingsPageTitle } from './ui/settings/index.js';
import { getActiveProfile } from './profile.js';
import { showToast } from './ui/toast.js';
import { SyncEngine } from './sync/engine.js';

const appEl = document.getElementById('app');
const activeProfile = getActiveProfile();

if (!activeProfile) {
  const { renderProfilePicker } = await import('./ui/profilePicker.js');
  renderProfilePicker(appEl);
} else {
  boot(activeProfile);
}

function boot(profileId) {
  const store = new Store(profileId);
  const router = new Router();

  const screenEl = document.getElementById('screen');
  const topbarTitle = document.getElementById('topbarTitle');
  const topbarBack = document.getElementById('topbarBack');
  const topbarAction = document.getElementById('topbarAction');
  const tabbar = document.getElementById('tabbar');
  const fab = document.getElementById('fab');

  const TAB_TITLES = { home: 'Özet', entries: 'Kayıtlar', report: 'Rapor', budget: 'Bütçe', settings: 'Ayarlar' };
  // FAB yalnızca hızlı ekleme anlamı olan sekme köklerinde görünür.
  const FAB_TABS = new Set(['home', 'entries', 'report', 'budget']);

  const ctx = {
    store,
    profileId,
    reportPeriodKey: currentPeriodKey(),
    // Bütçe sekmesinin görüntülediği dönem sekmeler arası korunur.
    budgetPeriodKey: currentPeriodKey(),
    // Kayıtlar sekmesinin görünüm/filtre/sayfa durumu sekmeler arası korunur.
    entriesView: { mode: 'list', periodKey: currentPeriodKey(), allTime: false, type: 'all', page: 1 },
    setReportPeriod(key) { ctx.reportPeriodKey = key; render(); },
    setBudgetPeriod(key) { ctx.budgetPeriodKey = key; render(); },
    openExpense: async (expense = null, opts = {}) => {
      const { openExpenseSheet } = await import('./ui/expenseSheet.js');
      openExpenseSheet(store, expense, opts);
    },
    setEntriesView(partial) {
      Object.assign(ctx.entriesView, partial);
      render();
    },
    setTab(tab) { router.navigate({ tab, page: null }); },
    navigate(route) { router.navigate(route); },
    back() { router.back(); },
    rerender() { render(); },
    // Senkron motoru: Yedekleme ekranı durumu buradan okur, elle tetikler.
    sync: null,
    syncNow(reason) { return ctx.sync ? ctx.sync.syncNow(reason) : Promise.resolve(null); },
    openEntryForDate: async (dateISO, entry) => {
      const { openEntrySheet } = await import('./ui/entry.js');
      openEntrySheet(store, entry || null, { date: dateISO });
    },
    setTopbarAction(label, onClick) {
      if (!label) { topbarAction.hidden = true; topbarAction.onclick = null; return; }
      topbarAction.hidden = false;
      topbarAction.textContent = label;
      topbarAction.onclick = onClick;
    },
    async switchProfile() {
      const { clearActiveProfile } = await import('./profile.js');
      clearActiveProfile();
      window.location.reload();
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
    // Elle güncelleme kontrolü (Ayarlar -> Uygulama hakkında). Yeni sürüm
    // kurulursa mevcut banner akışı devreye girer.
    async checkForUpdate() {
      if (!('serviceWorker' in navigator)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          showToast('Güncelleme kaydı bulunamadı');
          return;
        }
        await reg.update();
        showToast(reg.waiting ? 'Yeni sürüm hazır' : 'Güncellemeler kontrol edildi');
        if (reg.waiting) showUpdateBanner(reg);
      } catch {
        showToast('Güncelleme kontrolü başarısız');
      }
    },
    // Takılı kalan servis çalışanını ve önbelleği sıfırlar; sayfa ağdan taze
    // yüklenir. Veriler localStorage'da olduğu için korunur.
    async repairCache() {
      showToast('Önbellek onarılıyor…');
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith('mesai-')).map((k) => caches.delete(k)));
        }
      } catch {}
      window.location.reload();
    },
  };

  function applyTheme() {
    const theme = store.getState().settings.theme;
    document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
  }

  function render() {
    applyTheme();
    const { tab, page } = router.getRoute();
    const state = store.getState();

    for (const item of tabbar.querySelectorAll('.tabbar__item')) {
      item.classList.toggle('is-active', item.dataset.tab === tab);
    }

    // Alt sayfada geri butonu ve alt sayfanın kendi başlığı gösterilir.
    topbarBack.hidden = !page;
    topbarTitle.textContent = page ? (settingsPageTitle(page) || TAB_TITLES[tab]) : TAB_TITLES[tab];
    fab.hidden = !!page || !FAB_TABS.has(tab);
    // Bütçe sekmesinde aynı düğme harcama ekler; etiketi buna göre değişir.
    const fabAction = tab === 'budget' ? 'Harcama ekle' : 'Mesai ekle';
    fab.querySelector('.fab__label').textContent = fabAction;
    fab.setAttribute('aria-label', fabAction);
    ctx.setTopbarAction(null);

    if (tab === 'home') renderHome(screenEl, state, ctx);
    else if (tab === 'entries') renderEntries(screenEl, state, ctx);
    else if (tab === 'report') renderReport(screenEl, state, ctx);
    else if (tab === 'budget') renderBudget(screenEl, state, ctx);
    else if (tab === 'settings') renderSettingsRoute(screenEl, state, ctx, page);
  }

  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tabbar__item');
    if (!btn) return;
    router.navigate({ tab: btn.dataset.tab, page: null });
  });

  topbarBack.addEventListener('click', () => router.back());

  fab.addEventListener('click', async () => {
    // Bütçe sekmesinde + düğmesi harcama ekler, diğerlerinde mesai.
    if (router.getRoute().tab === 'budget') {
      ctx.openExpense();
      return;
    }
    const { openEntrySheet } = await import('./ui/entry.js');
    openEntrySheet(store, null);
  });

  router.subscribe(() => {
    render();
    screenEl.scrollTo(0, 0);
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

  render();

  // Otomatik senkron: bağlıysa açılışta, veri değişince, öne gelince ve
  // düzenli aralıkla buluttaki yedekle karşılıklı birleşir.
  ctx.sync = new SyncEngine({
    store,
    profileId,
    onStatus: (status) => {
      // Yalnızca Yedekleme ekranı açıkken yeniden çizmek yeterli; başka
      // ekranlarda durum göstergesi yok, boşuna render edilmez.
      if (router.route.tab === 'settings' && router.route.page === 'backup') render();
    },
  });
  ctx.sync.start();

  // Service worker kaydı. updateViaCache:none -> sw.js her açılışta HTTP
  // önbelleğini atlayıp ağdan kontrol edilir; PWA arka planda beklerken
  // yayımlanan sürümler ön plana ilk dönüşte yakalanır.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          watchRegistration(reg);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') reg.update().catch(() => {});
          });
        })
        .catch(() => {});
    });
  }

  function watchRegistration(reg) {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
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
}
