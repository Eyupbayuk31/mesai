import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';
import { todayISO, toISODate, parseLocaleNumber, formatMoney, formatHours, parseISODate } from '../format.js';
import { hoursBetween, crossesMidnight, entryAmount } from '../payroll.js';
import { suggestType } from '../holidays.js';

const TYPE_OPTIONS = [
  { key: 'normal', label: 'Normal', mult: 'multipliers.normal' },
  { key: 'weekend', label: 'Hafta tatili', mult: 'multipliers.weekend' },
  { key: 'holiday', label: 'Resmi tatil', mult: 'multipliers.holiday' },
];

export function openEntrySheet(store, existingEntry) {
  const settings = store.getState().settings;
  const isEdit = !!existingEntry;

  const formState = {
    date: existingEntry?.date || todayISO(),
    mode: existingEntry?.start ? 'range' : (settings.defaultEntryMode || 'hours'),
    hours: existingEntry?.hours ?? 3,
    start: existingEntry?.start || '18:00',
    end: existingEntry?.end || '21:00',
    type: existingEntry?.type || 'normal',
    note: existingEntry?.note || '',
    typeAuto: !existingEntry, // yeni kayıtta otomatik öneri açık başlar
  };

  if (!existingEntry && settings.autoDetectType) {
    applySuggestion();
  }

  function applySuggestion() {
    const suggestion = suggestType(parseISODate(formState.date), formState.date, settings);
    formState.type = suggestion.type;
    formState.reason = suggestion.reason;
  }

  openSheet({
    title: isEdit ? 'Mesaiyi düzenle' : 'Mesai ekle',
    footerHTML: `<button class="btn btn--primary" id="saveEntryBtn" type="button">Kaydet</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = renderBody(formState, settings);
      wireEvents(bodyEl, footerEl, formState, settings, store, existingEntry);
    },
  });
}

function renderBody(formState, settings) {
  const computedHours = formState.mode === 'range' ? hoursBetween(formState.start, formState.end) : formState.hours;
  const previewAmount = entryAmount({ hours: computedHours, type: formState.type }, settings);
  const midnightNote = formState.mode === 'range' && crossesMidnight(formState.start, formState.end)
    ? '<div class="field__hint">Ertesi güne sarkıyor</div>' : '';

  return `
    <div class="preview-strip" id="previewStrip">
      <span class="preview-strip__label">Bu mesai için</span>
      <span class="preview-strip__value" id="previewValue">${formatMoney(previewAmount)}</span>
    </div>

    <div class="field">
      <label class="field__label">Tarih</label>
      <input class="input" type="date" id="dateInput" value="${formState.date}" />
      <div class="quick-chips">
        <button class="quick-chip" type="button" data-quick-date="today">Bugün</button>
        <button class="quick-chip" type="button" data-quick-date="yesterday">Dün</button>
      </div>
    </div>

    <div class="field">
      <label class="field__label">Süre</label>
      <div class="segmented" id="modeSegmented">
        <button class="segmented__item ${formState.mode === 'hours' ? 'is-active' : ''}" type="button" data-mode="hours">Saat</button>
        <button class="segmented__item ${formState.mode === 'range' ? 'is-active' : ''}" type="button" data-mode="range">Aralık</button>
      </div>
    </div>

    <div id="modeBody">${renderModeBody(formState)}</div>
    <div id="midnightNote">${midnightNote}</div>

    <div class="field">
      <label class="field__label">Mesai türü</label>
      <div class="type-select" id="typeSelect">
        ${TYPE_OPTIONS.map((t) => `
          <button class="type-option ${formState.type === t.key ? 'is-active' : ''}" type="button" data-type="${t.key}">
            <strong>×${settings.multipliers[t.key]}</strong>
            <span>${t.label}</span>
            ${formState.type === t.key && formState.reason ? `<span class="type-option__reason">${formState.reason}</span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label class="field__label">Not <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
      <textarea class="input" id="noteInput" placeholder="ör. proje teslimi">${formState.note}</textarea>
    </div>
  `;
}

function renderModeBody(formState) {
  if (formState.mode === 'hours') {
    return `
      <div class="field">
        <input class="input" type="text" inputmode="decimal" id="hoursInput" value="${formatHoursInput(formState.hours)}" placeholder="ör. 3,5" />
        <div class="quick-chips">
          ${[1, 2, 3, 4].map((h) => `<button class="quick-chip" type="button" data-quick-hours="${h}">${h} sa</button>`).join('')}
          <button class="quick-chip" type="button" data-step="-0.5">−0,5</button>
          <button class="quick-chip" type="button" data-step="0.5">+0,5</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="input-row">
      <div class="field">
        <label class="field__label" style="font-size:12px;">Başlangıç</label>
        <input class="input" type="time" id="startInput" value="${formState.start}" />
      </div>
      <div class="field">
        <label class="field__label" style="font-size:12px;">Bitiş</label>
        <input class="input" type="time" id="endInput" value="${formState.end}" />
      </div>
    </div>
    <div class="field__hint" id="rangeComputed" style="margin-top:-8px;margin-bottom:16px;">= ${formatHours(hoursBetween(formState.start, formState.end))}</div>
  `;
}

function formatHoursInput(hours) {
  const n = Number(hours);
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

function wireEvents(bodyEl, footerEl, formState, settings, store, existingEntry) {
  function updatePreview() {
    const computedHours = formState.mode === 'range' ? hoursBetween(formState.start, formState.end) : (parseLocaleNumber(formState.hours) || 0);
    const amount = entryAmount({ hours: computedHours, type: formState.type }, settings);
    bodyEl.querySelector('#previewValue').textContent = formatMoney(amount);
  }

  function rerenderModeBody() {
    bodyEl.querySelector('#modeBody').innerHTML = renderModeBody(formState);
    bindModeBodyEvents();
    updatePreview();
  }

  function rerenderTypeSelect() {
    bodyEl.querySelector('#typeSelect').outerHTML = renderTypeSelectOnly(formState, settings);
    bindTypeEvents();
  }

  function renderTypeSelectOnly(fs, s) {
    return `<div class="type-select" id="typeSelect">${TYPE_OPTIONS.map((t) => `
      <button class="type-option ${fs.type === t.key ? 'is-active' : ''}" type="button" data-type="${t.key}">
        <strong>×${s.multipliers[t.key]}</strong>
        <span>${t.label}</span>
        ${fs.type === t.key && fs.reason ? `<span class="type-option__reason">${fs.reason}</span>` : ''}
      </button>`).join('')}</div>`;
  }

  function bindTypeEvents() {
    bodyEl.querySelector('#typeSelect').addEventListener('click', (e) => {
      const btn = e.target.closest('.type-option');
      if (!btn) return;
      formState.type = btn.dataset.type;
      formState.typeAuto = false;
      formState.reason = null;
      rerenderTypeSelect();
      updatePreview();
    });
  }

  function bindModeBodyEvents() {
    if (formState.mode === 'hours') {
      const hoursInput = bodyEl.querySelector('#hoursInput');
      hoursInput.addEventListener('input', () => {
        formState.hours = hoursInput.value;
        updatePreview();
      });
      bodyEl.querySelectorAll('[data-quick-hours]').forEach((chip) => {
        chip.addEventListener('click', () => {
          formState.hours = Number(chip.dataset.quickHours);
          hoursInput.value = formatHoursInput(formState.hours);
          updatePreview();
        });
      });
      bodyEl.querySelectorAll('[data-step]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const current = parseLocaleNumber(hoursInput.value) || 0;
          const next = Math.max(0, Math.round((current + Number(chip.dataset.step)) * 4) / 4);
          formState.hours = next;
          hoursInput.value = formatHoursInput(next);
          updatePreview();
        });
      });
    } else {
      const startInput = bodyEl.querySelector('#startInput');
      const endInput = bodyEl.querySelector('#endInput');
      const computedEl = bodyEl.querySelector('#rangeComputed');
      function updateRange() {
        formState.start = startInput.value;
        formState.end = endInput.value;
        const h = hoursBetween(formState.start, formState.end);
        computedEl.textContent = `= ${formatHours(h)}`;
        const noteTarget = bodyEl.querySelector('#midnightNote');
        if (noteTarget) noteTarget.innerHTML = crossesMidnight(formState.start, formState.end) ? '<div class="field__hint">Ertesi güne sarkıyor</div>' : '';
        updatePreview();
      }
      startInput.addEventListener('input', updateRange);
      endInput.addEventListener('input', updateRange);
    }
  }

  // Tarih
  const dateInput = bodyEl.querySelector('#dateInput');
  dateInput.addEventListener('input', () => {
    formState.date = dateInput.value;
    if (settings.autoDetectType && formState.typeAuto) {
      const suggestion = suggestType(parseISODate(formState.date), formState.date, settings);
      formState.type = suggestion.type;
      formState.reason = suggestion.reason;
      rerenderTypeSelect();
      updatePreview();
    }
  });
  bodyEl.querySelectorAll('[data-quick-date]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const d = new Date();
      if (chip.dataset.quickDate === 'yesterday') d.setDate(d.getDate() - 1);
      formState.date = toISODate(d);
      dateInput.value = formState.date;
      dateInput.dispatchEvent(new Event('input'));
    });
  });

  // Mod segmenti
  bodyEl.querySelector('#modeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented__item');
    if (!btn) return;
    formState.mode = btn.dataset.mode;
    bodyEl.querySelectorAll('#modeSegmented .segmented__item').forEach((b) => b.classList.toggle('is-active', b === btn));
    rerenderModeBody();
  });

  // Not
  bodyEl.querySelector('#noteInput').addEventListener('input', (e) => { formState.note = e.target.value; });

  bindModeBodyEvents();
  bindTypeEvents();

  // Kaydet / Sil
  const saveBtn = footerEl.querySelector('#saveEntryBtn');
  saveBtn.addEventListener('click', () => {
    const hours = formState.mode === 'range' ? hoursBetween(formState.start, formState.end) : parseLocaleNumber(formState.hours);
    if (!hours || hours <= 0) {
      showToast('Geçerli bir saat girmelisin');
      return;
    }
    if (!formState.date) {
      showToast('Bir tarih seçmelisin');
      return;
    }
    const payload = {
      date: formState.date,
      hours,
      start: formState.mode === 'range' ? formState.start : null,
      end: formState.mode === 'range' ? formState.end : null,
      type: formState.type,
      note: formState.note.trim(),
    };
    if (existingEntry) {
      store.updateEntry(existingEntry.id, payload);
      showToast('Mesai güncellendi');
    } else {
      store.addEntry(payload);
      showToast('Mesai eklendi');
    }
    closeSheet();
  });

  if (existingEntry) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--danger btn--sm';
    deleteBtn.type = 'button';
    deleteBtn.style.marginTop = '10px';
    deleteBtn.textContent = 'Bu kaydı sil';
    deleteBtn.addEventListener('click', () => {
      store.removeEntry(existingEntry.id);
      showToast('Mesai kaydı silindi');
      closeSheet();
    });
    footerEl.appendChild(deleteBtn);
  }
}
