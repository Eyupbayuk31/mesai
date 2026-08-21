import { WEEKDAY_LABELS, WEEKDAY_JS_VALUES } from './shared.js';

export const title = 'Dönem ve ödeme';

function dayOptions(selected) {
  let html = '';
  for (let d = 1; d <= 31; d++) {
    html += `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}</option>`;
  }
  return html;
}

export function render(container, state, ctx) {
  const settings = state.settings;

  container.innerHTML = `
    <div class="card">
      <p class="field__hint" style="margin-top:-4px; margin-bottom:14px;">Dönem takvim ayıdır (ayın 1'i – son günü). Ödemenin ne zaman yattığını buradan ayarla.</p>
      <div class="input-row">
        <div class="field">
          <label class="field__label">Ödeme günü</label>
          <select class="input" id="payDaySelect">${dayOptions(settings.payDay)}</select>
        </div>
        <div class="field">
          <label class="field__label">Ne zaman öder</label>
          <select class="input" id="payOffsetSelect">
            <option value="0" ${settings.payMonthOffset === 0 ? 'selected' : ''}>Aynı ay</option>
            <option value="1" ${settings.payMonthOffset === 1 ? 'selected' : ''}>Sonraki ay</option>
            <option value="2" ${settings.payMonthOffset === 2 ? 'selected' : ''}>2 ay sonra</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section-title">Hafta tatili günleri</div>
    <div class="card">
      <p class="field__hint" style="margin-top:-4px; margin-bottom:12px;">Bu günlerde yapılan mesai otomatik olarak "hafta tatili" önerilir.</p>
      <div class="chips" id="weekendDaysChips">
        ${WEEKDAY_LABELS.map((label, i) => {
          const jsVal = WEEKDAY_JS_VALUES[i];
          const active = settings.weekendDays.includes(jsVal);
          return `<button class="quick-chip ${active ? 'is-active' : ''}" data-day="${jsVal}" type="button">${label}</button>`;
        }).join('')}
      </div>
    </div>
  `;

  container.querySelector('#payDaySelect').addEventListener('change', (e) => {
    ctx.store.updateSettings({ payDay: Number(e.target.value) });
  });
  container.querySelector('#payOffsetSelect').addEventListener('change', (e) => {
    ctx.store.updateSettings({ payMonthOffset: Number(e.target.value) });
  });
  container.querySelector('#weekendDaysChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-day]');
    if (!chip) return;
    const day = Number(chip.dataset.day);
    const current = settings.weekendDays;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    ctx.store.updateSettings({ weekendDays: next });
  });
}
