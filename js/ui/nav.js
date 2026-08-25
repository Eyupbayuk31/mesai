// Tek navigasyon ağacı: masaüstündeki sabit kenar çubuğu ile mobildeki
// çekmece aynı listeyi basar. İki yerde iki ayrı menü tutmak, birinde
// unutulan sayfa demekti.

export const NAV_TREE = [
  {
    tab: 'home',
    label: 'Özet',
    quick: true,
    icon: '<path d="M4 11.5 12 4l8 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    tab: 'income',
    label: 'Gelir',
    quick: true,
    icon: '<path d="M12 20V5" stroke-linecap="round"/><path d="M6 11l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
    children: [
      { page: 'entries', label: 'Mesai kayıtları' },
      { page: 'payslip', label: 'Bordro' },
    ],
  },
  {
    tab: 'expense',
    label: 'Gider',
    quick: true,
    icon: '<path d="M12 4v15" stroke-linecap="round"/><path d="M6 13l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>',
    children: [
      { page: 'loans', label: 'Krediler' },
    ],
  },
  {
    tab: 'invest',
    label: 'Yatırım',
    quick: true,
    icon: '<path d="M3.5 17.5 9.5 11l3.5 3.5L20.5 7" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h5.5v5.5" stroke-linecap="round" stroke-linejoin="round"/>',
    children: [
      { page: 'lots', label: 'Tüm alımlar' },
    ],
  },
  {
    tab: 'report',
    label: 'Rapor',
    icon: '<rect x="4" y="4" width="16" height="17" rx="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 13v4M12 10v7M16 15v2" stroke-linecap="round"/>',
  },
  {
    tab: 'settings',
    label: 'Ayarlar',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.44.63.8.79H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-linecap="round" stroke-linejoin="round"/>',
  },
];

/** Alt barda görünen sekmeler — günlük kullanılanlar. */
export const QUICK_TABS = NAV_TREE.filter((n) => n.quick).map((n) => n.tab);

export function navLabel(tab, page) {
  const node = NAV_TREE.find((n) => n.tab === tab);
  if (!node) return '';
  if (!page) return node.label;
  return node.children?.find((c) => c.page === page)?.label || node.label;
}

function iconSVG(node) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">${node.icon}</svg>`;
}

/**
 * Menü listesi (çekmece ve kenar çubuğu ortak).
 * @param {{tab:string,page:?string}} route
 */
export function navListHTML(route) {
  return NAV_TREE.map((node) => {
    const active = node.tab === route.tab;
    const rows = [`
      <button class="nav-item ${active && !route.page ? 'is-active' : ''} ${active ? 'is-current' : ''}" type="button" data-nav-tab="${node.tab}">
        ${iconSVG(node)}
        <span>${node.label}</span>
      </button>`];

    // Alt sayfalar yalnız o bölümdeyken açılır: menü bir anda uzayıp
    // kaybolmaz, nerede olduğun görünür.
    if (node.children && active) {
      for (const child of node.children) {
        rows.push(`
          <button class="nav-item nav-item--child ${route.page === child.page ? 'is-active' : ''}" type="button"
                  data-nav-tab="${node.tab}" data-nav-page="${child.page}">
            <span>${child.label}</span>
          </button>`);
      }
    }
    return rows.join('');
  }).join('');
}

/** Menüdeki tıklamayı rotaya çevirir. */
export function navTargetFrom(target) {
  const btn = target.closest('[data-nav-tab]');
  if (!btn) return null;
  return { tab: btn.dataset.navTab, page: btn.dataset.navPage || null };
}
