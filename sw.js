const CACHE_NAME = 'mesai-v25';
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
  './js/holidays.js',
  './js/format.js',
  './js/budget.js',
  './js/ui/home.js',
  './js/ui/entries.js',
  './js/ui/entry.js',
  './js/ui/report.js',
  './js/ui/budget.js',
  './js/ui/expenseSheet.js',
  './js/ui/calendar.js',
  './js/ui/pagination.js',
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

// Cache-first, arka planda tazeleme (stale-while-revalidate)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
