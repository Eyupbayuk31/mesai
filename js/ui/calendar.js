// Ay takvimi: saf ızgara hesabı + görünüm HTML'i.

import { toISODate, formatHours } from '../format.js';

export const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// Bir ayın 6×7 ızgarası. weekStartsOn: 1 = Pazartesi (TR standardı).
// Önceki/sonraki aya taşan günler `inMonth: false` ile döner ki ızgara
// her ay aynı yükseklikte kalsın.
export function calendarMonthGrid(year, month, weekStartsOn = 1) {
  const firstOfMonth = new Date(year, month - 1, 1);
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
  const gridStart = new Date(year, month - 1, 1 - offset);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      date,
      iso: toISODate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1 && date.getFullYear() === year,
    });
  }
  return cells;
}

const TYPE_CLASS = { normal: 'normal', weekend: 'weekend', holiday: 'holiday' };

// entriesByDate: { '2026-08-21': [entry, ...] }
export function calendarHTML({ year, month, entriesByDate, settings, todayISO }) {
  const cells = calendarMonthGrid(year, month);

  const body = cells.map((cell) => {
    const dayEntries = entriesByDate[cell.iso] || [];
    const hours = dayEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    const worksThisDay = settings.weeklySchedule?.[cell.date.getDay()]?.works;
    const dominantType = dayEntries[0]?.type;

    const classes = [
      'cal-cell',
      cell.inMonth ? '' : 'cal-cell--outside',
      cell.iso === todayISO ? 'cal-cell--today' : '',
      hours > 0 ? 'cal-cell--has' : '',
      cell.inMonth && !worksThisDay ? 'cal-cell--off' : '',
    ].filter(Boolean).join(' ');

    return `
      <button class="${classes}" type="button" data-date="${cell.iso}">
        <span class="cal-cell__day">${cell.day}</span>
        ${hours > 0
          ? `<span class="cal-cell__badge cal-cell__badge--${TYPE_CLASS[dominantType] || 'normal'}">${formatHours(hours).replace(' sa', '')}</span>`
          : '<span class="cal-cell__badge cal-cell__badge--empty"></span>'}
      </button>
    `;
  }).join('');

  return `
    <div class="cal">
      <div class="cal__head">${WEEKDAY_HEADERS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal__grid">${body}</div>
    </div>
  `;
}

export function groupEntriesByDate(entries) {
  const map = {};
  for (const e of entries) {
    (map[e.date] ||= []).push(e);
  }
  return map;
}
