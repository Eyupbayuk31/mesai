import { formatMoney } from '../../format.js';
import { hourlyRate } from '../../payroll.js';
import { parseLocaleNumber } from '../../format.js';
import { commitNumberOnChange } from './shared.js';

export const title = 'Maaş ve ücret';

export function render(container, state, ctx) {
  const settings = state.settings;

  container.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="field__label">Aylık net maaş</label>
        <input class="input" type="text" inputmode="decimal" id="salaryInput" value="${settings.monthlySalary || ''}" placeholder="ör. 35000" />
      </div>
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">Saat böleni</label>
        <input class="input" type="text" inputmode="decimal" id="divisorInput" value="${settings.hoursDivisor}" />
        <div class="field__hint">30 gün × günlük 7,5 saat = 225 (varsayılan)</div>
      </div>
      <div class="preview-strip" style="margin-top:14px; margin-bottom:0;">
        <span class="preview-strip__label">Saat ücretin</span>
        <span class="preview-strip__value" id="rateDisplay">${formatMoney(hourlyRate(settings))}</span>
      </div>
    </div>

    <div class="section-title">Mesai çarpanları</div>
    <div class="card">
      <div class="input-row">
        <div class="field">
          <label class="field__label">Normal</label>
          <input class="input" type="text" inputmode="decimal" id="multNormal" value="${settings.multipliers.normal}" />
        </div>
        <div class="field">
          <label class="field__label">Hafta tatili</label>
          <input class="input" type="text" inputmode="decimal" id="multWeekend" value="${settings.multipliers.weekend}" />
        </div>
        <div class="field">
          <label class="field__label">Resmi tatil</label>
          <input class="input" type="text" inputmode="decimal" id="multHoliday" value="${settings.multipliers.holiday}" />
        </div>
      </div>
      <div class="switch-row">
        <div>
          <div class="switch-row__label">Otomatik tür tahmini</div>
          <div class="switch-row__hint">Hafta tatili / resmi tatil önerisi</div>
        </div>
        <button class="switch ${settings.autoDetectType ? 'is-on' : ''}" id="autoDetectSwitch" type="button" aria-label="Otomatik tür tahmini"></button>
      </div>
    </div>
  `;

  const salaryInput = container.querySelector('#salaryInput');
  const divisorInput = container.querySelector('#divisorInput');
  const rateDisplay = container.querySelector('#rateDisplay');

  function livePreview() {
    const salary = parseLocaleNumber(salaryInput.value) || 0;
    const divisor = parseLocaleNumber(divisorInput.value) || 225;
    rateDisplay.textContent = formatMoney(hourlyRate({ monthlySalary: salary, hoursDivisor: divisor }));
  }
  salaryInput.addEventListener('input', livePreview);
  divisorInput.addEventListener('input', livePreview);

  commitNumberOnChange(salaryInput, (v) => ctx.store.updateSettings({ monthlySalary: v }));
  commitNumberOnChange(divisorInput, (v) => ctx.store.updateSettings({ hoursDivisor: v || 225 }));

  const map = { multNormal: 'normal', multWeekend: 'weekend', multHoliday: 'holiday' };
  for (const [id, key] of Object.entries(map)) {
    commitNumberOnChange(container.querySelector(`#${id}`), (v) => {
      ctx.store.updateSettings({ multipliers: { ...ctx.store.getState().settings.multipliers, [key]: v } });
    });
  }

  container.querySelector('#autoDetectSwitch').addEventListener('click', () => {
    ctx.store.updateSettings({ autoDetectType: !settings.autoDetectType });
  });
}
