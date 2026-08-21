// Harcama ekle/düzenle alt sayfası (bottom sheet).

import { allCategories } from '../budget.js';
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
      const cats = allCategories(store.getState().settings);
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="expenseAmount" placeholder="ör. 250" value="${isEdit ? String(expense.amount).replace('.', ',') : ''}" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field__label">Kategori</label>
          <div class="cat-chips" id="catChips">
            ${cats.map((c) => `
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
        ${isEdit && expense.recurringId ? `
        <div class="switch-row" style="border-top:1px solid var(--divider);">
          <div>
            <div class="switch-row__label">↻ Her ay tekrarlanıyor</div>
            <div class="switch-row__hint">Bu gider sonraki aylarda otomatik girer</div>
          </div>
          <button class="btn btn--danger btn--sm" id="stopRecurringBtn" type="button">Kaldır</button>
        </div>` : !isEdit || !expense.recurringId ? `
        <div class="switch-row" style="border-top:1px solid var(--divider);">
          <div>
            <div class="switch-row__label">Her ay tekrarla</div>
            <div class="switch-row__hint">Kira, kredi, internet gibi sabit giderler — bu ay girilen gerçek harcamadan sonra her ay otomatik gelir</div>
          </div>
          <button class="switch" id="makeRecurring" type="button" aria-label="Her ay tekrarla"></button>
        </div>` : ''}
      `;

      const amountInput = bodyEl.querySelector('#expenseAmount');
      amountInput.focus();

      let recurringOn = false;
      const recurringSwitch = bodyEl.querySelector('#makeRecurring');
      recurringSwitch?.addEventListener('click', () => {
        recurringOn = !recurringOn;
        recurringSwitch.classList.toggle('is-on', recurringOn);
      });

      footerEl.querySelector('#stopRecurringBtn')?.addEventListener('click', () => {
        store.removeRecurring(expense.recurringId);
        store.updateExpense(expense.id, { recurringId: null });
        showToast('Artık her ay gelmeyecek');
        closeSheet();
      });

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
          const record = store.addExpense({ amount, category, date: dateValue, note });
          if (recurringOn) {
            const def = store.addRecurring({
              label: note || (allCategories(store.getState().settings).find((c) => c.key === category)?.label || ''),
              amount,
              category,
              day: Number(dateValue.slice(8, 10)),
              since: dateValue.slice(0, 7),
            });
            // Kaydı tanımına bağla: listede "her ay" etiketi görünsün, düzenlerken
            // tekrar anahtarı değil "tekrarlanıyor" durumu görünsün.
            store.updateExpense(record.id, { recurringId: def.id });
            showToast('Harcama eklendi — sonraki aylarda otomatik gelecek');
          } else {
            showToast('Harcama eklendi');
          }
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

// Sürekli gider tanımını düzenle: kaydet tüm ayları (geleceği) etkiler,
// "Kaldır" tanımı siler ve sanal satırlar listeden kalkar.
export function openRecurringSheet(store, def) {
  openSheet({
    title: 'Sürekli gider',
    footerHTML: `
      <button class="btn btn--primary" id="saveRecurringBtn" type="button">Kaydet</button>
      <button class="btn btn--danger btn--sm" id="removeRecurringBtn" type="button" style="margin-top:8px;">Kaldır — bir daha gelmesin</button>
    `,
    build(bodyEl, footerEl) {
      const cats = allCategories(store.getState().settings);
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">Değişiklik bu giderin gelecekteki tüm aylarına yansır.</p>
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="recurringAmount" value="${String(def.amount).replace('.', ',')}" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field__label">Kategori</label>
          <div class="cat-chips">
            ${cats.map((c) => `
              <button class="cat-chip ${def.category === c.key ? 'is-active' : ''}" data-cat="${c.key}" type="button" style="--cat-color:${c.color};">
                <span class="cat-chip__dot"></span>${c.label}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="input-row">
          <div class="field" style="margin-bottom:0;">
            <label class="field__label">Ayın günü</label>
            <input class="input" type="text" inputmode="numeric" id="recurringDay" value="${def.day}" />
            <div class="field__hint">Ay kısa çekerse ayın sonuna kırpılır</div>
          </div>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Etiket</label>
          <input class="input" type="text" id="recurringLabel" value="${escapeAttr(def.label || '')}" placeholder="ör. Kredi taksidi" />
        </div>
      `;

      bodyEl.querySelectorAll('[data-cat]').forEach((chip) => {
        chip.addEventListener('click', () => {
          bodyEl.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('is-active'));
          chip.classList.add('is-active');
        });
      });

      footerEl.querySelector('#saveRecurringBtn').addEventListener('click', () => {
        const amount = parseLocaleNumber(bodyEl.querySelector('#recurringAmount').value);
        if (!Number.isFinite(amount) || amount <= 0) {
          showToast('Geçerli bir tutar girmelisin');
          return;
        }
        store.updateRecurring(def.id, {
          amount,
          category: bodyEl.querySelector('.cat-chip.is-active')?.dataset.cat || def.category,
          day: Math.min(31, Math.max(1, Math.round(Number(bodyEl.querySelector('#recurringDay').value) || def.day))),
          label: bodyEl.querySelector('#recurringLabel').value.trim(),
        });
        showToast('Sürekli gider güncellendi');
        closeSheet();
      });

      footerEl.querySelector('#removeRecurringBtn').addEventListener('click', () => {
        store.removeRecurring(def.id);
        showToast('Sürekli gider kaldırıldı');
        closeSheet();
      });
    },
  });
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
