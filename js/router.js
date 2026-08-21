// Rota yöneticisi: sekme + isteğe bağlı alt sayfa.
//
// Rota şekli: { tab: 'settings', page: 'salary' } — `page` yoksa sekme kökü.
// history API kullanır, böylece telefonun donanım geri tuşu ve kaydırma jesti
// alt sayfadan sekme köküne döner (uygulamadan çıkmaz).

export const DEFAULT_ROUTE = { tab: 'home', page: null };

function normalize(route) {
  return { tab: route?.tab || 'home', page: route?.page || null };
}

export function routesEqual(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  return x.tab === y.tab && x.page === y.page;
}

export class Router {
  constructor() {
    this.route = normalize(history.state?.route || DEFAULT_ROUTE);
    this.listeners = new Set();
    // Açılış rotasını geçmişe yaz ki ilk geri hareketi tutarlı olsun.
    history.replaceState({ route: this.route }, '');
    window.addEventListener('popstate', (e) => {
      this.route = normalize(e.state?.route || DEFAULT_ROUTE);
      this._notify();
    });
  }

  getRoute() {
    return this.route;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn(this.route);
  }

  // Alt sayfa açmak geçmişe yeni kayıt ekler (geri tuşu geri götürsün).
  // Sekmeler arası geçiş geçmişi kirletmez — mevcut kaydın üstüne yazar.
  navigate(route, { replace } = {}) {
    const next = normalize(route);
    if (routesEqual(next, this.route)) return;
    const shouldReplace = replace ?? !next.page;
    const method = shouldReplace ? 'replaceState' : 'pushState';
    history[method]({ route: next }, '');
    this.route = next;
    this._notify();
  }

  // Alt sayfadaysa geçmişte geri gider; sekme kökündeyse bir şey yapmaz.
  back() {
    if (this.route.page) history.back();
  }
}
