import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';
import { todayISO, toISODate, parseLocaleNumber, formatMoney, formatHours, parseISODate } from '../format.js';
import { hoursBetween, crossesMidnight, entryAmount, shiftOvertime, addMinutesToTime } from '../payroll.js';
import { suggestType } from '../holidays.js';
import { timeSelectHTML } from './timeSelect.js';
import { nowHM, defaultEndTime } from '../timeDefaults.js';

const TYPE_OPTIONS = [
  { key: 'normal', label: 'Normal', mult: 'multipliers.normal' },
  { key: 'weekend', label: 'Hafta tatili', mult: 'multipliers.weekend' },
  { key: 'holiday', label: 'Resmi tatil', mult: 'multipliers.holiday' },
];

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function scheduleDefaultsForDate(dateISO, settings) {
  const date = parseISODate(dateISO);
  const daySchedule = settings.weeklySchedule?.[date.getDay()];
  if (daySchedule && daySchedule.works) {
    return { shiftStart: daySchedule.start, shiftEnd: daySchedule.end };
  }
  return { shiftStart: '10:00', shiftEnd: '14:00' };
}

// options.date: yeni kayıt için ön-seçili tarih (takvimde bir güne dokununca).
export function openEntrySheet(store, existingEntry, options = {}) {
  const settings = store.getState().settings;
  const isEdit = !!existingEntry;
  const initialDate = existingEntry?.date || options.date || todayISO();
  const scheduleDefaults = scheduleDefaultsForDate(initialDate, settings);
  // Bugüne yeni kayıt giriliyorsa çıkış saati şu anki saatle gelir.
  const isToday = initialDate === todayISO();
  const endDefaults = {
    shiftEnd: defaultEndTime({ isNew: !isEdit, isToday, defaultEnd: scheduleDefaults.shiftEnd }),
    rangeEnd: defaultEndTime({ isNew: !isEdit, isToday, defaultEnd: '19:00' }),
  };

  const formState = {
    date: initialDate,
    mode: existingEntry?.start ? 'range' : (settings.defaultEntryMode || 'shift'),
    hours: existingEntry?.hours ?? 3,
    start: existingEntry?.start || '18:00',
    end: existingEntry?.end || endDefaults.rangeEnd,
    shiftStart: scheduleDefaults.shiftStart,
    shiftEnd: endDefaults.shiftEnd,
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

function computedHoursFor(formState, settings) {
  if (formState.mode === 'range') return hoursBetween(formState.start, formState.end);
  if (formState.mode === 'shift') return shiftOvertime(parseISODate(formState.date), formState.shiftStart, formState.shiftEnd, settings).overtimeHours;
  return parseLocaleNumber(formState.hours) || 0;
}

function renderBody(formState, settings) {
  const computedHours = computedHoursFor(formState, settings);
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
        <button class="segmented__item ${formState.mode === 'shift' ? 'is-active' : ''}" type="button" data-mode="shift">Giriş-Çıkış</button>
        <button class="segmented__item ${formState.mode === 'range' ? 'is-active' : ''}" type="button" data-mode="range">Aralık</button>
      </div>
    </div>

    <div id="modeBody">${renderModeBody(formState, settings)}</div>
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

function renderModeBody(formState, settings) {
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

  if (formState.mode === 'shift') {
    return `
      <div class="input-row">
        <div class="field">
          <label class="field__label" style="font-size:12px;">İlk giriş</label>
          ${timeSelectHTML('shiftStart', formState.shiftStart)}
        </div>
        <div class="field">
          <label class="field__label" style="font-size:12px;">Son çıkış</label>
          ${timeSelectHTML('shiftEnd', formState.shiftEnd)}
        </div>
      </div>
      <div class="quick-chips" id="shiftQuickChips" style="margin-top:-8px;">${shiftQuickChipsHTML(formState, settings)}</div>
      <div id="shiftBreakdown">${shiftBreakdownHTML(formState, settings)}</div>
    `;
  }

  return `
    <div class="input-row">
      <div class="field">
        <label class="field__label" style="font-size:12px;">Başlangıç</label>
        ${timeSelectHTML('start', formState.start)}
      </div>
      <div class="field">
        <label class="field__label" style="font-size:12px;">Bitiş</label>
        ${timeSelectHTML('end', formState.end)}
      </div>
    </div>
    <div class="quick-chips" id="rangeNowChips" style="margin-top:-8px;">
      <button class="quick-chip quick-chip--now" type="button" data-now="start">Başlangıç: şimdi</button>
      <button class="quick-chip quick-chip--now" type="button" data-now="end">Bitiş: şimdi</button>
    </div>
    <div class="field__hint" id="rangeComputed" style="margin-top:-8px;margin-bottom:16px;">= ${formatHours(hoursBetween(formState.start, formState.end))}</div>
  `;
}

const QUICK_OFFSETS = [
  { minutes: 15, label: '+15dk' },
  { minutes: 30, label: '+30dk' },
  { minutes: 45, label: '+45dk' },
  { minutes: 60, label: '+1sa' },
  { minutes: 90, label: '+1,5sa' },
  { minutes: 120, label: '+2sa' },
];

// Çıkış saatini tek dokunuşla girmek için: normal mesai bitişinden (veya
// çalışma günü değilse giriş saatinden) itibaren +15dk/+30dk/... çipleri.
function shiftQuickChipsHTML(formState, settings) {
  const date = parseISODate(formState.date);
  const daySchedule = settings.weeklySchedule?.[date.getDay()];
  const base = daySchedule && daySchedule.works ? daySchedule.end : formState.shiftStart;
  return `<button class="quick-chip quick-chip--now" type="button" data-now="shiftEnd">Şimdi</button>`
    + QUICK_OFFSETS.map((o) => `<button class="quick-chip" type="button" data-quick-offset="${o.minutes}" data-quick-base="${base}">${o.label}</button>`).join('');
}

function shiftBreakdownHTML(formState, settings) {
  const date = parseISODate(formState.date);
  const result = shiftOvertime(date, formState.shiftStart, formState.shiftEnd, settings);
  const dayName = DAY_NAMES[date.getDay()];
  const breakNote = result.breakHours > 0
    ? ` (${formatHours(result.breakHours)} mola düşüldü)`
    : '';

  if (!result.scheduled) {
    return `
      <div class="field__hint" style="margin-bottom:14px;">
        ${dayName} çalışma günün değil — girdiğin süreden <b style="color:var(--accent);">${formatHours(result.overtimeHours)}</b> mesai sayılır${breakNote}.
      </div>
    `;
  }

  const scheduleLabel = `${dayName} normal mesain: ${result.scheduled.start}–${result.scheduled.end}`;
  if (result.overtimeHours <= 0) {
    return `<div class="field__hint" style="margin-bottom:14px;">${scheduleLabel}. Bugün fazla mesain görünmüyor.</div>`;
  }
  return `
    <div class="field__hint" style="margin-bottom:14px;">
      ${scheduleLabel}. ${result.scheduled.end}–${formState.shiftEnd} arası <b style="color:var(--accent);">${formatHours(result.overtimeHours)}</b> mesai sayılır${breakNote}.
    </div>
  `;
}

function formatHoursInput(hours) {
  const n = Number(hours);
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

function wireEvents(bodyEl, footerEl, formState, settings, store, existingEntry) {
  function updatePreview() {
    const computedHours = computedHoursFor(formState, settings);
    const amount = entryAmount({ hours: computedHours, type: formState.type }, settings);
    bodyEl.querySelector('#previewValue').textContent = formatMoney(amount);
  }

  function rerenderModeBody() {
    bodyEl.querySelector('#modeBody').innerHTML = renderModeBody(formState, settings);
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
    } else if (formState.mode === 'shift') {
      function updateShift({ refreshChips } = {}) {
        const shiftStartHour = bodyEl.querySelector('#shiftStartHour');
        const shiftStartMinute = bodyEl.querySelector('#shiftStartMinute');
        const shiftEndHour = bodyEl.querySelector('#shiftEndHour');
        const shiftEndMinute = bodyEl.querySelector('#shiftEndMinute');
        formState.shiftStart = `${shiftStartHour.value}:${shiftStartMinute.value}`;
        formState.shiftEnd = `${shiftEndHour.value}:${shiftEndMinute.value}`;
        if (refreshChips) bodyEl.querySelector('#shiftQuickChips').innerHTML = shiftQuickChipsHTML(formState, settings);
        bodyEl.querySelector('#shiftBreakdown').innerHTML = shiftBreakdownHTML(formState, settings);
        updatePreview();
      }
      bodyEl.querySelector('#shiftStartHour').addEventListener('change', () => updateShift({ refreshChips: true }));
      bodyEl.querySelector('#shiftStartMinute').addEventListener('change', () => updateShift({ refreshChips: true }));
      bodyEl.querySelector('#shiftEndHour').addEventListener('change', () => updateShift());
      bodyEl.querySelector('#shiftEndMinute').addEventListener('change', () => updateShift());
      bodyEl.querySelector('#shiftQuickChips').addEventListener('click', (e) => {
        // "Şimdi": çıkarken saati elle aramak yerine tek dokunuş.
        if (e.target.closest('[data-now]')) {
          const [nh, nm] = nowHM().split(':');
          bodyEl.querySelector('#shiftEndHour').value = nh;
          bodyEl.querySelector('#shiftEndMinute').value = nm;
          updateShift();
          return;
        }
        const chip = e.target.closest('[data-quick-offset]');
        if (!chip) return;
        const newEnd = addMinutesToTime(chip.dataset.quickBase, Number(chip.dataset.quickOffset));
        const [h, m] = newEnd.split(':');
        bodyEl.querySelector('#shiftEndHour').value = h;
        bodyEl.querySelector('#shiftEndMinute').value = m;
        updateShift();
      });
    } else {
      const startHour = bodyEl.querySelector('#startHour');
      const startMinute = bodyEl.querySelector('#startMinute');
      const endHour = bodyEl.querySelector('#endHour');
      const endMinute = bodyEl.querySelector('#endMinute');
      const computedEl = bodyEl.querySelector('#rangeComputed');
      function updateRange() {
        formState.start = `${startHour.value}:${startMinute.value}`;
        formState.end = `${endHour.value}:${endMinute.value}`;
        const h = hoursBetween(formState.start, formState.end);
        computedEl.textContent = `= ${formatHours(h)}`;
        const noteTarget = bodyEl.querySelector('#midnightNote');
        if (noteTarget) noteTarget.innerHTML = crossesMidnight(formState.start, formState.end) ? '<div class="field__hint">Ertesi güne sarkıyor</div>' : '';
        updatePreview();
      }
      // Kendi kimliğiyle seçilir: gövdede daha önce gelen tarih çipleri de
      // .quick-chips sınıfını taşıyor.
      bodyEl.querySelector('#rangeNowChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-now]');
        if (!chip) return;
        const [nh, nm] = nowHM().split(':');
        const target = chip.dataset.now;
        (target === 'start' ? startHour : endHour).value = nh;
        (target === 'start' ? startMinute : endMinute).value = nm;
        updateRange();
      });

      startHour.addEventListener('change', updateRange);
      startMinute.addEventListener('change', updateRange);
      endHour.addEventListener('change', updateRange);
      endMinute.addEventListener('change', updateRange);
    }
  }

  // Tarih
  const dateInput = bodyEl.querySelector('#dateInput');
  dateInput.addEventListener('input', () => {
    formState.date = dateInput.value;
    if (formState.mode === 'shift') {
      const defaults = scheduleDefaultsForDate(formState.date, settings);
      formState.shiftStart = defaults.shiftStart;
      formState.shiftEnd = defaults.shiftEnd;
      rerenderModeBody();
    }
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
    const hours = computedHoursFor(formState, settings);
    if (!hours || hours <= 0) {
      showToast(formState.mode === 'shift' ? 'Bu saatlerde mesai görünmüyor' : 'Geçerli bir saat girmelisin');
      return;
    }
    if (!formState.date) {
      showToast('Bir tarih seçmelisin');
      return;
    }

    let start = null;
    let end = null;
    if (formState.mode === 'range') {
      start = formState.start;
      end = formState.end;
    } else if (formState.mode === 'shift') {
      const result = shiftOvertime(parseISODate(formState.date), formState.shiftStart, formState.shiftEnd, settings);
      start = result.windowStart;
      end = result.windowEnd;
    }

    const payload = {
      date: formState.date,
      hours,
      start,
      end,
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
