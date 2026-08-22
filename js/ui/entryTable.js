// Kayıtların masaüstü tablo görünümü.
//
// Mobilde kart satırları (entryRow.js) kalır; genişliği gerçekten kullanan bu
// tablo yalnızca ≥900px'te görünür. Aynı veriden iki gösterim basılır, hangisinin
// görüneceğine CSS karar verir — böylece iki ayrı durum yönetmek gerekmez.

import { entryAmount } from '../payroll.js';
import { formatHours, formatMoney, formatWeekdayShort } from '../format.js';

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };

export const COLUMNS = [
  { key: 'date', label: 'Tarih', sortable: true },
  { key: 'weekday', label: 'Gün', sortable: false },
  { key: 'hours', label: 'Süre', sortable: true, numeric: true },
  { key: 'type', label: 'Tür', sortable: false },
  { key: 'note', label: 'Not', sortable: false },
  { key: 'amount', label: 'Tutar', sortable: true, numeric: true },
];

/**
 * Kayıtları sıralar. Saf: girdiyi değiştirmez, aynı girdi hep aynı çıktıyı verir.
 * @param {'date'|'hours'|'amount'} key
 * @param {'asc'|'desc'} dir
 */
export function sortEntries(entries, key, dir, settings) {
  const factor = dir === 'asc' ? 1 : -1;
  const value = (e) => {
    if (key === 'hours') return Number(e.hours) || 0;
    if (key === 'amount') return entryAmount(e, settings);
    return e.date;
  };
  return [...entries].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    // Eşitlikte id'ye göre kararlı sıralama — sayfalar arası zıplama olmasın.
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

export function entryTableHTML(entries, settings, sort = { key: 'date', dir: 'desc' }) {
  return `
    <table class="entry-table">
      <thead>
        <tr>
          ${COLUMNS.map((c) => headerCellHTML(c, sort)).join('')}
          <th class="entry-table__actions"><span class="sr-only">İşlem</span></th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((e) => rowHTML(e, settings)).join('')}
      </tbody>
    </table>
  `;
}

function headerCellHTML(col, sort) {
  const active = sort.key === col.key;
  const cls = [
    col.numeric ? 'is-numeric' : '',
    col.sortable ? 'is-sortable' : '',
    active ? `is-sorted is-${sort.dir}` : '',
  ].filter(Boolean).join(' ');

  if (!col.sortable) return `<th class="${cls}">${col.label}</th>`;
  return `
    <th class="${cls}">
      <button type="button" data-sort="${col.key}">
        ${col.label}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5-5 5 5"/></svg>
      </button>
    </th>
  `;
}

function rowHTML(entry, settings) {
  const [year, month, day] = entry.date.split('-');
  const time = entry.start && entry.end ? `${entry.start}–${entry.end}` : '';
  return `
    <tr class="entry-table__row" data-id="${entry.id}">
      <td class="entry-table__date">${Number(day)}.${Number(month)}.${year}</td>
      <td class="entry-table__weekday">${formatWeekdayShort(entry.date).replace('.', '')}</td>
      <td class="is-numeric entry-table__hours">${formatHours(entry.hours)}</td>
      <td><span class="type-tag type-tag--${entry.type}"><span class="dot dot--${entry.type}"></span>${TYPE_LABEL[entry.type] || 'Normal'}</span></td>
      <td class="entry-table__note">${escapeHTML(entry.note || time || '—')}</td>
      <td class="is-numeric entry-table__amount">${formatMoney(entryAmount(entry, settings), { decimals: false })}</td>
      <td class="entry-table__actions">
        <button class="entry-table__delete" type="button" data-delete="${entry.id}" aria-label="Sil">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
