// Tek bir mesai kaydı satırının HTML'i. home.js ve report.js tarafından paylaşılır.

import { formatWeekdayShort, formatHours, formatMoney } from '../format.js';
import { entryAmount } from '../payroll.js';

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };

export function entryRowHTML(entry, settings) {
  const amount = entryAmount(entry, settings);
  const [, month, day] = entry.date.split('-');
  const timeLabel = entry.start && entry.end ? `${entry.start}–${entry.end}` : null;
  return `
    <li class="entry-row" data-id="${entry.id}">
      <div class="entry-row__content">
        <div class="entry-row__date">
          <div class="entry-row__day">${Number(day)}</div>
          <div class="entry-row__weekday">${formatWeekdayShort(entry.date).replace('.', '')}</div>
        </div>
        <div class="entry-row__mid">
          <div class="entry-row__hours">${formatHours(entry.hours)} <span class="dot dot--${entry.type}" style="display:inline-block;margin-left:4px;"></span></div>
          <div class="entry-row__meta">${TYPE_LABEL[entry.type] || 'Normal'}${timeLabel ? ' · ' + timeLabel : ''}</div>
          ${entry.note ? `<div class="entry-row__note">${escapeHTML(entry.note)}</div>` : ''}
        </div>
        <div class="entry-row__amount">${formatMoney(amount, { decimals: false })}</div>
      </div>
      <div class="entry-row__delete">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7"/></svg>
      </div>
    </li>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
