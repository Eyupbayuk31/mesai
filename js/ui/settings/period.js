import { WEEKDAY_LABELS, WEEKDAY_JS_VALUES } from './shared.js';
import { currentPeriodKey, shiftPeriod, payDateForPeriod, periodLabel } from '../../period.js';
import { formatFullDate, toISODate } from '../../format.js';

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
      <div class="preview-strip" style="margin-top:14px; margin-bottom:0;">
        <span class="preview-strip__label">Örnek</span>
        <span class="preview-strip__value" id="payExample"></span>
      </div>
      <div class="field__hint" style="margin-top:8px;" id="payExampleHint"></div>
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

  // Ayarın ne yaptığı "sonraki ay / 2 ay sonra" diye soyut kalıyordu. Somut
  // örnek basılır: hangi ayın maaşı hangi gün yatıyor, ve bu ay eldeki para
  // hangi bordrodan geliyor. Bütün gelir hesabı buna bağlı olduğu için
  // yanlış seçim bütün sayıları kaydırır.
  const daySelect = container.querySelector('#payDaySelect');
  const offsetSelect = container.querySelector('#payOffsetSelect');
  const exampleEl = container.querySelector('#payExample');
  const hintEl = container.querySelector('#payExampleHint');

  function updateExample(payDay, offset) {
    const thisPeriod = currentPeriodKey();
    // Ödeme günü geçmiş en yeni dönem = bu ay eldeki para.
    const sample = shiftPeriod(thisPeriod, -offset);
    exampleEl.textContent = `${periodLabel(sample)} maaşı → ${formatFullDate(toISODate(payDateForPeriod(sample, { payDay, payMonthOffset: offset })))}`;
    hintEl.innerHTML = offset === 0
      ? `Maaş, çalışılan ayın kendi içinde yatıyor.`
      : `Yani <b>${periodLabel(thisPeriod)}</b> içinde harcadığın para <b>${periodLabel(sample)}</b> bordrosundan geliyor. Gider sekmesindeki bütçe de buna göre hesaplanır.`;
  }
  updateExample(settings.payDay, settings.payMonthOffset ?? 1);

  daySelect.addEventListener('change', (e) => {
    const payDay = Number(e.target.value);
    ctx.store.updateSettings({ payDay });
    updateExample(payDay, Number(offsetSelect.value));
  });
  offsetSelect.addEventListener('change', (e) => {
    const payMonthOffset = Number(e.target.value);
    ctx.store.updateSettings({ payMonthOffset });
    updateExample(Number(daySelect.value), payMonthOffset);
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
