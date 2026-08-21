// Harcama ekle/düzenle alt sayfası (bottom sheet).

import { CATEGORIES } from '../budget.js';
import { parseLocaleNumber, todayISO } from '../format.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export function openExpenseSheet(store, expense = null, { date } = {}) {
  const isEdit = !!expense;
  openSheet({
    title: isEdit ? 'Harcamayı düzenle' : 'Harcama ekle',
    footerHTML: `
      <button class="btn btn--primary" id="saveExpenseBtn" type="button">${isEdit ? 'Güncelle' : 'Ekle'}</button>
      ${isEdit ? '<button class="btn btn--danger btn--sm" id="deleteExpenseBtn" type="button" style="margin-top:8px;">Sil</button>' : ''}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="expenseAmount" placeholder="ör. 250" value="${isEdit ? String(expense.amount).replace('.', ',') : ''}" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field__label">Kategori</label>
          <div class="cat-chips" id="catChips">
            ${CATEGORIES.map((c) => `
              <button class="cat-chip ${(!isEdit && c.key === 'market') || (isEdit && expense.category === c.key) ? 'is-active' : ''}" data-cat="${c.key}" type="button" style="--cat-color:${c.color};">
                <span class="cat-chip__dot"></span>${c.label}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field__label">Tarih</label>
          <input class="input" type="date" id="expenseDate" value="${isEdit ? expense.date : date || todayISO()}" />
        </div>
        <div class="field">
          <label class="field__label">Not <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="expenseNote" placeholder="ör. pazar alışverişi" value="${isEdit ? escapeAttr(expense.note || '') : ''}" />
        </div>
      `;

      const amountInput = bodyEl.querySelector('#expenseAmount');
      amountInput.focus();

      bodyEl.querySelectorAll('[data-cat]').forEach((chip) => {
        chip.addEventListener('click', () => {
          bodyEl.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('is-active'));
          chip.classList.add('is-active');
        });
      });

      function save() {
        const amount = parseLocaleNumber(amountInput.value);
        if (!Number.isFinite(amount) || amount <= 0) {
          showToast('Geçerli bir tutar girmelisin');
          amountInput.focus();
          return;
        }
        const category = bodyEl.querySelector('.cat-chip.is-active')?.dataset.cat || 'diger';
        const dateValue = bodyEl.querySelector('#expenseDate').value || todayISO();
        const note = bodyEl.querySelector('#expenseNote').value.trim();
        if (isEdit) {
          store.updateExpense(expense.id, { amount, category, date: dateValue, note });
          showToast('Harcama güncellendi');
        } else {
          store.addExpense({ amount, category, date: dateValue, note });
          showToast('Harcama eklendi');
        }
        closeSheet();
      }

      footerEl.querySelector('#saveExpenseBtn').addEventListener('click', save);
      footerEl.querySelector('#deleteExpenseBtn')?.addEventListener('click', () => {
        store.removeExpense(expense.id);
        showToast('Harcama silindi');
        closeSheet();
      });
    },
  });
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
