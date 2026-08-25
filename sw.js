const CACHE_NAME = 'mesai-v48';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/plex-mono-latin-500.woff2',
  './fonts/plex-mono-latin-ext-500.woff2',
  './fonts/plex-mono-latin-600.woff2',
  './fonts/plex-mono-latin-ext-600.woff2',
  './fonts/plex-mono-latin-700.woff2',
  './fonts/plex-mono-latin-ext-700.woff2',
  './js/app.js',
  './js/store.js',
  './js/githubSync.js',
  './js/sync/merge.js',
  './js/sync/engine.js',
  './js/profile.js',
  './js/router.js',
  './js/period.js',
  './js/payroll.js',
  './js/homeStats.js',
  './js/timeDefaults.js',
  './js/holidays.js',
  './js/format.js',
  './js/budget.js',
  './js/loans.js',
  './js/payslip.js',
  './js/investments.js',
  './js/analysis.js',
  './js/ui/home.js',
  './js/ui/entries.js',
  './js/ui/entry.js',
  './js/ui/report.js',
  './js/ui/budget.js',
  './js/ui/loans.js',
  './js/ui/investments.js',
  './js/ui/expenseSheet.js',
  './js/ui/calendar.js',
  './js/ui/pagination.js',
  './js/ui/periodNav.js',
  './js/ui/entryTable.js',
  './js/ui/dayEntries.js',
  './js/ui/settings/index.js',
  './js/ui/settings/shared.js',
  './js/ui/settings/salary.js',
  './js/ui/settings/schedule.js',
  './js/ui/settings/period.js',
  './js/ui/settings/budget.js',
  './js/ui/settings/appearance.js',
  './js/ui/settings/backup.js',
  './js/ui/settings/lunch.js',
  './js/ui/settings/about.js',
  './js/ui/installGuide.js',
  './js/ui/sheet.js',
  './js/ui/toast.js',
  './js/ui/swipe.js',
  './js/ui/entryRow.js',
  './js/ui/exportUtils.js',
  './js/ui/htmlReport.js',
  './js/ui/timeSelect.js',
  './js/ui/profilePicker.js',
  './screenshots/wide-home.png',
  './screenshots/wide-report.png',
  './screenshots/narrow-home.png',
  './screenshots/narrow-budget.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Kod (HTML/JS/CSS) ağdan önce gelir, varlıklar (font/ikon) önbellekten.
//
// Neden: her şey cache-first olunca uygulamanın YARISI eskiyebiliyordu —
// yeni index.html eski app.js ile açılıp yeni sekme boş sayfa veriyordu.
// Kod dosyaları birkaç KB; ağdan almak ucuz, tutarlılık ise şart. İnternet
// yoksa önbellekteki sürüme düşülür, uygulama çevrimdışı çalışmaya devam eder.
function isCode(url, request) {
  return request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.webmanifest');
}

function putInCache(request, response) {
  if (response && response.ok) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isCode(url, event.request)) {
    // cache: 'no-cache' — tarayıcının disk önbelleğine SORMADAN sunucuya
    // doğrulatır (değişmemişse 304, bedava). Bu olmadan index.html eski
    // diskten, app.js ağdan gelip uygulama yarı eski açılıyor, modül
    // yüklenemeyince de ekran tamamen boş kalıyordu.
    event.respondWith(
      fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((response) => putInCache(event.request, response))
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Font, ikon, ekran görüntüsü: değişmeyen varlıklar — önbellekten hızlıca,
  // arka planda tazelenir.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => putInCache(event.request, response))
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
