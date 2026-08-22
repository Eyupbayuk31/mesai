// Ayarlar sekmesinin kökü (kategori menüsü) ve alt sayfa yönlendirmesi.

import { formatMoney } from '../../format.js';
import { hourlyRate } from '../../payroll.js';
import { profileName } from '../../profile.js';
import * as salaryPage from './salary.js';
import * as schedulePage from './schedule.js';
import * as periodPage from './period.js';
import * as budgetPage from './budget.js';
import * as appearancePage from './appearance.js';
import * as backupPage from './backup.js';
import { readStatus, relativeTime } from '../../sync/engine.js';
import * as aboutPage from './about.js';

const PAGES = {
  salary: salaryPage,
  schedule: schedulePage,
  period: periodPage,
  budget: budgetPage,
  appearance: appearancePage,
  backup: backupPage,
  about: aboutPage,
};

export function settingsPageTitle(page) {
  return PAGES[page]?.title || null;
}

export function renderSettingsRoute(container, state, ctx, page) {
  const target = PAGES[page];
  if (target) target.render(container, state, ctx);
  else renderSettingsMenu(container, state, ctx);
}

// --- Menü satırlarının sağında gösterilen özet değerler ---

function salarySummary(settings) {
  if (!Number(settings.monthlySalary)) return 'Girilmedi';
  return `${formatMoney(settings.monthlySalary, { decimals: false })} · ${formatMoney(hourlyRate(settings))}/sa`;
}

function scheduleSummary(settings) {
  // Hafta içi (Pzt–Cum) aynı saatlerdeyse tek satırda özetle, değilse "özel".
  const weekdays = [1, 2, 3, 4, 5].map((d) => settings.weeklySchedule[d]);
  const allSame = weekdays.every((d) => d.works && d.start === weekdays[0].start && d.end === weekdays[0].end);
  if (allSame) return `Hafta içi ${weekdays[0].start}–${weekdays[0].end}`;
  const workingDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => settings.weeklySchedule[d].works).length;
  return `${workingDays} gün çalışma`;
}

function periodSummaryLabel(settings) {
  const when = settings.payMonthOffset === 0 ? 'aynı ay' : settings.payMonthOffset === 1 ? 'sonraki ay' : `${settings.payMonthOffset} ay sonra`;
  return `Her ayın ${settings.payDay}'i, ${when}`;
}

function themeSummary(settings) {
  return { auto: 'Otomatik', light: 'Açık', dark: 'Koyu' }[settings.theme] || 'Otomatik';
}

function budgetSummaryLabel(settings) {
  const custom = Array.isArray(settings.customCategories) ? settings.customCategories : [];
  return custom.length ? `${9 + custom.length} kategori · ${custom.length} özel` : '9 hazır kategori';
}

function backupSummary(state) {
  // Bulut senkronu açıksa asıl bilgi odur; dosya yedeği ikinci plandadır.
  const status = readStatus();
  if (status.state === 'error') return 'Senkron hatası';
  if (status.state === 'offline') return 'Senkron: internet yok';
  if (status.state === 'syncing') return 'Senkronlanıyor…';
  if (status.lastSyncAt) {
    const when = relativeTime(status.lastSyncAt);
    return when ? `Senkron: ${when}` : 'Senkron edildi';
  }
  if (!state.lastBackupAt) return 'Hiç yedek alınmadı';
  const days = Math.floor((Date.now() - new Date(state.lastBackupAt).getTime()) / 86400000);
  if (days <= 0) return 'Bugün yedeklendi';
  if (days === 1) return 'Dün yedeklendi';
  return `${days} gün önce`;
}

const MENU_ICONS = {
  salary: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2A2.6 2.6 0 0 0 12 8c-1.4 0-2.5.8-2.5 2s1.1 2 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.6 2.6 0 0 1-2.5-1.2M12 6.5v11"/>',
  schedule: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  period: '<path d="M3.5 7.5h17v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 11h17M7.5 3.5v4"/>',
  budget: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2 7.2-7.2a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.4a2 2 0 0 1-.4 1.4z"/><circle cx="15.5" cy="8.5" r="1.3"/>',
  appearance: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  backup: '<path d="M12 15.5V4m0 11.5-4-4m4 4 4-4"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
};

function menuRowHTML(page, label, summary) {
  return `
    <button class="menu-row" type="button" data-settings-page="${page}">
      <span class="menu-row__icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MENU_ICONS[page]}</svg>
      </span>
      <span class="menu-row__label">${label}</span>
      <span class="menu-row__value">${summary}</span>
      <span class="menu-row__chevron">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </span>
    </button>
  `;
}

function renderSettingsMenu(container, state, ctx) {
  const settings = state.settings;
  const name = profileName(ctx.profileId);

  container.innerHTML = `
    <div class="card profile-row" id="switchProfileRow" role="button" tabindex="0">
      <span class="profile-row__avatar">${name.charAt(0)}</span>
      <span class="profile-row__body">
        <span class="profile-row__name">${name}</span>
        <span class="profile-row__hint">Aktif profil</span>
      </span>
      <span class="profile-row__action">Değiştir ›</span>
    </div>

    <div class="card card--menu">
      ${menuRowHTML('salary', 'Maaş ve ücret', salarySummary(settings))}
      ${menuRowHTML('schedule', 'Çalışma programı', scheduleSummary(settings))}
      ${menuRowHTML('period', 'Dönem ve ödeme', periodSummaryLabel(settings))}
      ${menuRowHTML('budget', 'Bütçe kategorileri', budgetSummaryLabel(settings))}
      ${menuRowHTML('appearance', 'Görünüm', themeSummary(settings))}
      ${menuRowHTML('backup', 'Yedekleme', backupSummary(state))}
      ${menuRowHTML('about', 'Uygulama hakkında', '')}
    </div>
  `;

  container.querySelector('#switchProfileRow').addEventListener('click', () => ctx.switchProfile());

  container.querySelectorAll('[data-settings-page]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.navigate({ tab: 'settings', page: btn.dataset.settingsPage }));
  });
}
