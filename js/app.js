import { Store } from './store.js';
import { currentPeriodKey } from './period.js';
import { Router } from './router.js';
import { renderHome } from './ui/home.js';
import { renderEntries } from './ui/entries.js';
import { renderIncome } from './ui/income.js';
import * as payslipPage from './ui/payslipPage.js';
import * as absencesPage from './ui/absences.js';
import { NAV_TREE, QUICK_TABS, navLabel, navListHTML } from './ui/nav.js';
import { wireDrawer, toggleDrawer, closeDrawer } from './ui/drawer.js';
import { renderReport } from './ui/report.js';
import { renderBudget } from './ui/budget.js';
import * as loansPage from './ui/loans.js';
import * as investPage from './ui/investments.js';
import { renderSettingsRoute, settingsPageTitle } from './ui/settings/index.js';
import { getActiveProfile, profileName } from './profile.js';
import { showToast } from './ui/toast.js';
import { SyncEngine, readStatus, relativeTime } from './sync/engine.js';
import { APP_VERSION } from './ui/settings/about.js';

const appEl = document.getElementById('app');

// Önbellek onarımı adres çubuğuna ?yenile=... bırakır; işini görünce silinsin.
if (window.location.search.includes('yenile=')) {
  history.replaceState(history.state, '', window.location.pathname);
}

const activeProfile = getActiveProfile();

if (!activeProfile) {
  const { renderProfilePicker } = await import('./ui/profilePicker.js');
  renderProfilePicker(appEl);
  window.__mesaiBooted = true;
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
  const topbarContext = document.getElementById('topbarContext');
  const fab = document.getElementById('fab');

  // FAB yalnızca hızlı ekleme anlamı olan sekme köklerinde görünür.
  const FAB_TABS = new Set(['home', 'income', 'report', 'expense', 'invest']);

  // Eski rotalar (v4 ve öncesi): geçmişte kalmış kayıtlar yeni ağaca çevrilir.
  const LEGACY_ROUTES = {
    budget: { tab: 'expense', page: null },
    entries: { tab: 'income', page: 'entries' },
  };
  function normalizeRoute(route) {
    const legacy = LEGACY_ROUTES[route.tab];
    if (!legacy) return route;
    return { tab: legacy.tab, page: route.page || legacy.page };
  }

  const ctx = {
    store,
    profileId,
    reportPeriodKey: currentPeriodKey(),
    // Bütçe sekmesinin görüntülediği dönem sekmeler arası korunur.
    budgetPeriodKey: currentPeriodKey(),
    // Kayıtlar sekmesinin görünüm/filtre/sayfa durumu sekmeler arası korunur.
    entriesView: { mode: 'list', periodKey: currentPeriodKey(), allTime: false, type: 'all', page: 1, sort: { key: 'date', dir: 'desc' } },
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
    // Üst çubuğun orta yuvası: ekranlar kendi bağlamını (dönem gezinme gibi)
    // buraya basar. Masaüstünde görünür, mobilde CSS ile gizlidir.
    setTopbarContext(html, wire) {
      if (!html) {
        topbarContext.hidden = true;
        topbarContext.innerHTML = '';
        return;
      }
      topbarContext.hidden = false;
      topbarContext.innerHTML = html;
      if (wire) wire(topbarContext);
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
        // Servis çalışanını silmek yetmiyor: tarayıcının KENDİ disk önbelleği
        // eski app.js'i tutuyorsa reload yine eskisini açıyor (sert yenileme
        // dışında hiçbir şey değişmiyordu). Sayfanın yüklediği kod dosyalarını
        // cache:'reload' ile çekip disk önbelleğinin üstüne yazıyoruz.
        const urls = performance.getEntriesByType('resource')
          .map((e) => e.name)
          .filter((n) => n.startsWith(window.location.origin) && /\.(js|css|webmanifest)(\?|$)/.test(n));
        urls.push(window.location.href);
        await Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
      } catch {}
      // Sorgu parametresi belge isteğini de taze yapar; router'ı etkilemez.
      window.location.replace(`${window.location.pathname}?yenile=${Date.now()}`);
    },
  };

  // Alt sayfa başlığı: menü ağacındaki ad, ayarlarınki kendi modülünden.
  function subPageTitle(tab, page) {
    if (tab === 'settings') return settingsPageTitle(page);
    return navLabel(tab, page);
  }

  // Kenar çubuğunun boş orta/alt kısmı: profil, senkron durumu, sürüm.
  // Masaüstünde görünür; mobilde CSS gizler.
  function renderSidebar(state) {
    const name = profileName(profileId);
    document.getElementById('sidebarAvatar').textContent = name.charAt(0);
    document.getElementById('sidebarName').textContent = name;
    document.getElementById('sidebarVersion').textContent = `v${APP_VERSION}`;
    document.getElementById('drawerProfile').textContent = name;
    document.getElementById('drawerFoot').textContent = `v${APP_VERSION}`;

    const syncEl = document.getElementById('sidebarSync');
    const status = readStatus();
    const off = !status || status.state === 'off' || status.state === 'idle';
    syncEl.hidden = off;
    if (off) return;
    const bad = status.state === 'error' || status.state === 'offline';
    syncEl.classList.toggle('is-error', bad);
    const when = relativeTime(status.lastSyncAt);
    document.getElementById('sidebarSyncText').textContent =
      status.state === 'syncing' ? 'Senkronlanıyor…'
        : status.state === 'offline' ? 'İnternet yok'
          : status.state === 'error' ? 'Senkron hatası'
            : status.state === 'pending' ? 'Değişiklik bekliyor'
              : when ? `Senkron: ${when}` : 'Senkron edildi';
  }

  function applyTheme() {
    const theme = store.getState().settings.theme;
    document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
  }

  function render() {
    applyTheme();
    const { tab, page } = normalizeRoute(router.getRoute());
    const state = store.getState();

    // Alt bar ve çekmece aynı ağaçtan basılır (js/ui/nav.js).
    const navHTML = navListHTML({ tab, page });
    document.getElementById('tabbarItems').innerHTML = navHTML;
    document.getElementById('drawerList').innerHTML = navHTML;

    // Alt sayfada geri butonu ve alt sayfanın kendi başlığı gösterilir.
    topbarBack.hidden = !page;
    topbarTitle.textContent = page ? (subPageTitle(tab, page) || navLabel(tab)) : navLabel(tab);
    fab.hidden = !!page || !FAB_TABS.has(tab);
    // Bütçe sekmesinde aynı düğme harcama ekler; etiketi buna göre değişir.
    const fabAction = tab === 'expense' ? 'Harcama ekle' : tab === 'invest' ? 'Alım ekle' : 'Mesai ekle';
    fab.querySelector('.fab__label').textContent = fabAction;
    fab.setAttribute('aria-label', fabAction);
    ctx.setTopbarAction(null);
    ctx.setTopbarContext(null);
    // Ekran başına ızgara şeması CSS'te .screen--<sekme> ile seçilir.
    // Alt sayfaya da sınıf verilir: CSS "hangi sayfadayız" bilgisine erişsin
    // (ör. Mesai kayıtları masaüstünde kart listesi yerine tablo gösterir).
    screenEl.className = `screen screen--${tab}${page ? ` screen--sub screen--${tab}-${page}` : ''}`;
    renderSidebar(state);

    if (tab === 'home') renderHome(screenEl, state, ctx);
    else if (tab === 'income') {
      if (page === 'entries') renderEntries(screenEl, state, ctx);
      else if (page === 'payslip') payslipPage.render(screenEl, state, ctx);
      else if (page === 'absences') absencesPage.render(screenEl, state, ctx);
      else renderIncome(screenEl, state, ctx);
    }
    else if (tab === 'report') renderReport(screenEl, state, ctx);
    else if (tab === 'expense') {
      if (page === 'loans') loansPage.render(screenEl, state, ctx);
      else renderBudget(screenEl, state, ctx);
    }
    else if (tab === 'invest') {
      if (page === 'lots') investPage.renderLotsPage(screenEl, state, ctx);
      else investPage.render(screenEl, state, ctx);
    }
    else if (tab === 'settings') renderSettingsRoute(screenEl, state, ctx, page);
    else renderUnknownTab(tab);
  }

  // Bilinmeyen sekme = tarayıcı eski kodu tutuyor (yeni index.html + eski
  // app.js). Boş sayfa bırakmak yerine ne olduğunu söyle ve tek dokunuşla onar.
  function renderUnknownTab(tab) {
    screenEl.innerHTML = `
      <div class="card empty">
        <div class="empty__title">Bu sayfa yüklenemedi</div>
        <div class="empty__sub">Uygulamanın eski bir sürümü açık kalmış olabilir. Güncelleyip tekrar dene.</div>
        <button class="btn btn--primary" id="repairFromUnknown" type="button" style="margin-top:14px;">Güncelle ve yenile</button>
      </div>
    `;
    screenEl.querySelector('#repairFromUnknown').addEventListener('click', () => ctx.repairCache());
    console.warn('Bilinmeyen sekme:', tab);
  }

  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-tab]');
    if (!btn) return;
    router.navigate({ tab: btn.dataset.navTab, page: btn.dataset.navPage || null });
  });

  document.getElementById('topbarMenu').addEventListener('click', () => toggleDrawer());
  wireDrawer({
    listEl: document.getElementById('drawerList'),
    onNavigate: (route) => router.navigate(route),
  });

  topbarBack.addEventListener('click', () => router.back());

  document.getElementById('sidebarProfile').addEventListener('click', () => ctx.switchProfile());
  document.getElementById('sidebarSync').addEventListener('click', () => {
    router.navigate({ tab: 'settings', page: 'backup' });
  });

  fab.addEventListener('click', async () => {
    // Bütçe sekmesinde + düğmesi harcama ekler, diğerlerinde mesai.
    const activeTab = normalizeRoute(router.getRoute()).tab;
    if (activeTab === 'expense') {
      ctx.openExpense();
      return;
    }
    if (activeTab === 'invest') {
      investPage.openAddInvestment(ctx);
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
  // Kurtarma ağı (index.html) bu bayrağı görürse devreye girmez.
  window.__mesaiBooted = true;

  // Otomatik senkron: bağlıysa açılışta, veri değişince, öne gelince ve
  // düzenli aralıkla buluttaki yedekle karşılıklı birleşir.
  ctx.sync = new SyncEngine({
    store,
    profileId,
    onStatus: (status) => {
      // Durum göstergesi iki yerde var: Yedekleme sayfası ve Özet'teki rozet.
      // Başka ekranlarda boşuna render edilmez.
      const onBackup = router.route.tab === 'settings' && router.route.page === 'backup';
      const onHome = router.route.tab === 'home' && !router.route.page;
      if (onBackup || onHome) render();
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

  // iOS'ta beforeinstallprompt HİÇ tetiklenmez (Apple desteklemiyor), yani
  // yukarıdaki dinleyici orada hiç çalışmaz. Bu yüzden banner'ı biz açıyoruz;
  // "Ekle" düğmesi Paylaş menüsü adımlarını gösterir.
  (async () => {
    const { isIOS, isStandalone } = await import('./ui/installGuide.js');
    if (isIOS() && !isStandalone() && !sessionDismissed()) {
      setTimeout(() => showInstallBanner(), 1200);
    }
  })();

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
    el.querySelector('#installBannerAdd').addEventListener('click', async () => {
      if (deferredInstallPrompt) { ctx.promptInstall(); return; }
      const { openInstallGuide } = await import('./ui/installGuide.js');
      openInstallGuide();
    });
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
