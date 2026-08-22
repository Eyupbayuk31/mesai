// Kayıtlar sekmesi: filtreli + sayfalanmış liste, veya ay takvimi.

import { periodLabel, shiftPeriod, periodKeyFromISODate, currentPeriodKey } from '../period.js';
import { entryAmount } from '../payroll.js';
import { formatMoney, formatHours, todayISO } from '../format.js';
import { entryRowHTML } from './entryRow.js';
import { enableSwipeToDelete } from './swipe.js';
import { showToast } from './toast.js';
import { paginate, paginationHTML } from './pagination.js';
import { calendarHTML, groupEntriesByDate } from './calendar.js';
import { mountPeriodNav } from './periodNav.js';
import { entryTableHTML, sortEntries } from './entryTable.js';

const TYPE_FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'normal', label: 'Normal' },
  { key: 'weekend', label: 'Hafta tatili' },
  { key: 'holiday', label: 'Resmi tatil' },
];

// Görünüm durumuna göre kayıtları süz — saf, sırası en yeniden eskiye.
export function filterEntries(entries, view) {
  return entries
    .filter((e) => (view.allTime ? true : periodKeyFromISODate(e.date) === view.periodKey))
    .filter((e) => (view.type === 'all' ? true : e.type === view.type))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
}

// Masaüstü tablosunda daha çok satır sığar; sayfa başına kayıt buna göre değişir.
function perPageFor() {
  return (typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches) ? 25 : 15;
}

export function renderEntries(container, state, ctx) {
  const view = ctx.entriesView;
  const settings = state.settings;
  const filtered = filterEntries(state.entries, view);

  const totalHours = filtered.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const totalAmount = filtered.reduce((sum, e) => sum + entryAmount(e, settings), 0);
  const filterActive = view.type !== 'all';

  container.innerHTML = `
    <div class="segmented" id="viewSegmented" style="margin-bottom:12px;">
      <button class="segmented__item ${view.mode === 'list' ? 'is-active' : ''}" data-view="list" type="button">Liste</button>
      <button class="segmented__item ${view.mode === 'calendar' ? 'is-active' : ''}" data-view="calendar" type="button">Takvim</button>
    </div>

    <div class="period-card">
      <button class="period-card__nav" id="prevPeriod" type="button" aria-label="Önceki ay" ${view.allTime ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${view.allTime ? 'Tüm zamanlar' : periodLabel(view.periodKey)}</div>
        <div class="period-card__sub">${filtered.length} kayıt · ${formatHours(totalHours)} · ${formatMoney(totalAmount, { decimals: false })}</div>
      </div>
      <button class="period-card__nav" id="nextPeriod" type="button" aria-label="Sonraki ay" ${view.allTime ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    ${view.mode === 'list' ? `
      <div class="chips" id="filterChips" style="margin:14px 0;">
        ${TYPE_FILTERS.map((f) => `<button class="quick-chip ${view.type === f.key ? 'is-active' : ''}" data-type="${f.key}" type="button">${f.label}</button>`).join('')}
        <button class="quick-chip ${view.allTime ? 'is-active' : ''}" data-alltime="1" type="button">Tüm zamanlar</button>
      </div>
      ${listSectionHTML(filtered, settings, view, filterActive)}
    ` : calendarSectionHTML(filtered, state, view)}
  `;

  wireCommon(container, ctx, view, `${filtered.length} kayıt · ${formatHours(totalHours)}`);
  if (view.mode === 'list') wireList(container, state, ctx, filtered);
  else wireCalendar(container, ctx);
}

function listSectionHTML(filtered, settings, view, filterActive) {
  if (filtered.length === 0) return emptyStateHTML(filterActive);

  const sort = view.sort || { key: 'date', dir: 'desc' };
  const sorted = sortEntries(filtered, sort.key, sort.dir, settings);
  const pageData = paginate(sorted, view.page, perPageFor());
  return `
    <ul class="list" id="entryList">${pageData.items.map((e) => entryRowHTML(e, settings)).join('')}</ul>
    <div class="entry-table-wrap" id="entryTableWrap">${entryTableHTML(pageData.items, settings, sort)}</div>
    ${paginationHTML(pageData)}
    ${pageData.totalPages > 1
      ? `<p class="list-meta">${pageData.from}–${pageData.to} / ${pageData.total} kayıt</p>`
      : ''}
  `;
}

function calendarSectionHTML(filtered, state, view) {
  // Takvim her zaman bir aya bakar; "tüm zamanlar" seçiliyken bu dönemi gösterir.
  const periodKey = view.allTime ? currentPeriodKey() : view.periodKey;
  const [year, month] = periodKey.split('-').map(Number);
  const monthEntries = state.entries.filter((e) => periodKeyFromISODate(e.date) === periodKey);

  return `
    ${calendarHTML({
      year,
      month,
      entriesByDate: groupEntriesByDate(monthEntries),
      settings: state.settings,
      todayISO: todayISO(),
    })}
    <p class="list-meta">Bir güne dokunarak mesai ekle veya düzenle</p>
  `;
}

function emptyStateHTML(filterActive) {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
      </div>
      <div class="empty__title">${filterActive ? 'Bu filtreye uyan kayıt yok' : 'Bu dönemde kayıt yok'}</div>
      <div class="empty__sub">${filterActive ? 'Filtreyi değiştirip tekrar dene' : '&quot;Mesai ekle&quot; ile kayıt ekleyebilirsin'}</div>
      ${filterActive ? `<button class="btn btn--ghost" id="clearFilter" type="button" style="margin-top:12px;">Filtreyi temizle</button>` : ''}
    </div>
  `;
}

function wireCommon(container, ctx, view, meta) {
  mountPeriodNav(ctx, {
    label: view.allTime ? 'Tüm zamanlar' : periodLabel(view.periodKey),
    sub: meta,
    disabled: view.allTime,
    onPrev: () => ctx.setEntriesView({ periodKey: shiftPeriod(view.periodKey, -1), page: 1 }),
    onNext: () => ctx.setEntriesView({ periodKey: shiftPeriod(view.periodKey, 1), page: 1 }),
  });

  container.querySelector('#viewSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    ctx.setEntriesView({ mode: btn.dataset.view });
  });

  container.querySelector('#prevPeriod').addEventListener('click', () => {
    ctx.setEntriesView({ periodKey: shiftPeriod(view.periodKey, -1), page: 1 });
  });
  container.querySelector('#nextPeriod').addEventListener('click', () => {
    ctx.setEntriesView({ periodKey: shiftPeriod(view.periodKey, 1), page: 1 });
  });
}

function wireList(container, state, ctx, filtered) {
  // Filtre değişince sayfa başa döner, yoksa boş sayfada kalınabilir.
  container.querySelector('#filterChips')?.addEventListener('click', (e) => {
    const typeChip = e.target.closest('[data-type]');
    if (typeChip) { ctx.setEntriesView({ type: typeChip.dataset.type, page: 1 }); return; }
    const allTimeChip = e.target.closest('[data-alltime]');
    if (allTimeChip) ctx.setEntriesView({ allTime: !ctx.entriesView.allTime, page: 1 });
  });

  container.querySelector('#clearFilter')?.addEventListener('click', () => {
    ctx.setEntriesView({ type: 'all', page: 1 });
  });

  container.querySelector('.pagination')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    ctx.setEntriesView({ page: Number(btn.dataset.page) });
  });

  wireTable(container, state, ctx);

  const listEl = container.querySelector('#entryList');
  if (!listEl) return;
  enableSwipeToDelete(listEl, {
    onDelete: (id) => {
      const entry = state.entries.find((e) => e.id === id);
      ctx.store.removeEntry(id);
      showToast('Mesai kaydı silindi', { actionLabel: 'Geri al', onAction: () => ctx.store.addEntry(entry) });
    },
    onTap: async (id) => {
      const entry = state.entries.find((e) => e.id === id);
      const { openEntrySheet } = await import('./entry.js');
      openEntrySheet(ctx.store, entry);
    },
  });
}

// Tablo: başlığa tıklayınca sırala, satıra tıklayınca düzenle, çöp kutusuyla sil.
function wireTable(container, state, ctx) {
  const wrap = container.querySelector('#entryTableWrap');
  if (!wrap) return;

  wrap.addEventListener('click', async (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      const current = ctx.entriesView.sort || { key: 'date', dir: 'desc' };
      // Aynı sütuna tekrar basınca yön döner, başka sütunda varsayılan azalan.
      const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
      ctx.setEntriesView({ sort: { key, dir }, page: 1 });
      return;
    }

    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      const entry = state.entries.find((x) => x.id === delBtn.dataset.delete);
      if (!entry) return;
      ctx.store.removeEntry(entry.id);
      showToast('Mesai kaydı silindi', { actionLabel: 'Geri al', onAction: () => ctx.store.addEntry(entry) });
      return;
    }

    const row = e.target.closest('[data-id]');
    if (!row) return;
    const entry = state.entries.find((x) => x.id === row.dataset.id);
    if (!entry) return;
    const { openEntrySheet } = await import('./entry.js');
    openEntrySheet(ctx.store, entry);
  });
}

function wireCalendar(container, ctx) {
  container.querySelector('.cal__grid')?.addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    const dateISO = cell.dataset.date;
    const dayEntries = ctx.store.getState().entries.filter((entry) => entry.date === dateISO);

    if (dayEntries.length === 0) {
      ctx.openEntryForDate(dateISO);
    } else if (dayEntries.length === 1) {
      ctx.openEntryForDate(dateISO, dayEntries[0]);
    } else {
      const { openDayEntriesSheet } = await import('./dayEntries.js');
      openDayEntriesSheet(ctx, dateISO, dayEntries);
    }
  });
}
