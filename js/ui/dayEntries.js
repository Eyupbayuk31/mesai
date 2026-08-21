// Takvimde bir güne birden fazla kayıt varsa açılan seçim sayfası.

import { openSheet, closeSheet } from './sheet.js';
import { formatFullDate, formatHours, formatMoney } from '../format.js';
import { entryAmount } from '../payroll.js';

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };

export function openDayEntriesSheet(ctx, dateISO, dayEntries) {
  const settings = ctx.store.getState().settings;

  openSheet({
    title: formatFullDate(dateISO),
    footerHTML: `<button class="btn btn--primary" id="addForDayBtn" type="button">Bu güne mesai ekle</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="rows">
          ${dayEntries.map((e) => `
            <button class="row" type="button" data-entry-id="${e.id}" style="width:100%; text-align:left;">
              <span class="row__label"><span class="dot dot--${e.type}"></span>${formatHours(e.hours)} · ${TYPE_LABEL[e.type] || e.type}</span>
              <span class="row__value is-positive">${formatMoney(entryAmount(e, settings), { decimals: false })}</span>
            </button>
          `).join('')}
        </div>
      `;

      bodyEl.querySelectorAll('[data-entry-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const entry = dayEntries.find((e) => e.id === btn.dataset.entryId);
          closeSheet();
          setTimeout(() => ctx.openEntryForDate(dateISO, entry), 280);
        });
      });

      footerEl.querySelector('#addForDayBtn').addEventListener('click', () => {
        closeSheet();
        setTimeout(() => ctx.openEntryForDate(dateISO), 280);
      });
    },
  });
}
