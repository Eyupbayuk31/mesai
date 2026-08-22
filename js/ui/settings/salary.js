import { formatMoney, parseLocaleNumber } from '../../format.js';
import { hourlyRate, workdaysForPeriod, addSalaryChange } from '../../payroll.js';
import { currentPeriodKey } from '../../period.js';
import { formatMonthYear } from '../../format.js';
import { showToast } from '../toast.js';
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
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">Aylık mesai hedefi (sa) <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
        <input class="input" type="text" inputmode="decimal" id="goalInput" value="${settings.monthlyGoalHours || ''}" placeholder="ör. 40" />
        <div class="field__hint">Özet'teki bordro kartında ilerleme çubuğu gösterilir. Boş bırak = kapalı.</div>
      </div>
      <div class="preview-strip" style="margin-top:14px; margin-bottom:0;">
        <span class="preview-strip__label">Saat ücretin</span>
        <span class="preview-strip__value" id="rateDisplay">${formatMoney(hourlyRate(settings))}</span>
      </div>
    </div>

    ${salaryHistoryHTML(settings)}

    <div class="section-title">Yemek ve yol parası</div>
    <div class="card">
      <div class="field" style="margin-bottom:14px;">
        <label class="field__label">Günlük yemek bedeli (₺)</label>
        <input class="input" type="text" inputmode="decimal" id="mealInput" value="${settings.mealAllowance || ''}" placeholder="ör. 250" />
        <div class="field__hint">Çalıştığın her gün yemek kartına yatan tutar.</div>
      </div>
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">Günlük yol bedeli (₺)</label>
        <input class="input" type="text" inputmode="decimal" id="transportInput" value="${settings.transportAllowance || ''}" placeholder="ör. 55" />
        <div class="field__hint">İşe geliş-gidiş için ödenen günlük ulaşım tutarı.</div>
      </div>
      <div class="field__hint" style="margin-bottom:14px;">İkisi de resmi tatiller düşülerek ayın iş günü sayısıyla çarpılır.</div>
      <div class="preview-strip" style="margin-bottom:8px; margin-top:0;">
        <span class="preview-strip__label">Bu ay yemek</span>
        <span class="preview-strip__value" id="mealPreview">—</span>
      </div>
      <div class="preview-strip" style="margin-bottom:0; margin-top:0;">
        <span class="preview-strip__label">Bu ay yol</span>
        <span class="preview-strip__value" id="transportPreview">—</span>
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

  wireSalaryHistory(container, ctx);

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

  // Hedef boş bırakılırsa kapatılabilir olmalı (commitNumberOnChange NaN'ı atlar)
  const goalInput = container.querySelector('#goalInput');
  goalInput.addEventListener('change', () => {
    const raw = goalInput.value.trim();
    const value = raw === '' ? 0 : (parseLocaleNumber(raw) || 0);
    ctx.store.updateSettings({ monthlyGoalHours: value });
  });

  const mealInput = container.querySelector('#mealInput');
  const transportInput = container.querySelector('#transportInput');
  const mealPreview = container.querySelector('#mealPreview');
  const transportPreview = container.querySelector('#transportPreview');
  function updateAllowancePreviews() {
    const days = workdaysForPeriod(currentPeriodKey(), ctx.store.getState().settings);
    const dailyMeal = parseLocaleNumber(mealInput.value) || 0;
    const dailyTransport = parseLocaleNumber(transportInput.value) || 0;
    const line = (daily) => (daily > 0
      ? `${days} gün × ${formatMoney(daily, { decimals: false })} = ${formatMoney(days * daily, { decimals: false })}`
      : '—');
    mealPreview.textContent = line(dailyMeal);
    transportPreview.textContent = line(dailyTransport);
  }
  mealInput.addEventListener('input', updateAllowancePreviews);
  transportInput.addEventListener('input', updateAllowancePreviews);
  updateAllowancePreviews();
  commitNumberOnChange(mealInput, (v) => ctx.store.updateSettings({ mealAllowance: v }));
  commitNumberOnChange(transportInput, (v) => ctx.store.updateSettings({ transportAllowance: v }));

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

// --- Maaş geçmişi ---------------------------------------------------------
// Maaş tek bir değer olsaydı zam alındığı anda GEÇMİŞ ayların raporu da
// değişirdi. Değişiklikler tarihiyle saklanır; her dönem kendi maaşıyla
// hesaplanır (js/payroll.js → salaryForPeriod).
function salaryHistoryHTML(settings) {
  const history = [...(settings.salaryHistory || [])]
    .sort((a, b) => (a.fromPeriod < b.fromPeriod ? 1 : -1));

  return `
    <div class="section-title">Maaş geçmişi</div>
    <div class="card">
      ${history.length === 0 ? `
        <p class="field__hint" style="margin:-2px 0 12px;">
          Zam aldığında buraya "şu aydan itibaren şu maaş" diye ekle. Böylece
          geçmiş ayların raporu zamla birlikte değişmez, her dönem kendi
          maaşıyla hesaplanır.
        </p>` : `
        <div class="rows" style="margin-bottom:12px;">
          ${history.map((h) => `
            <div class="row">
              <span class="row__label">${h.initial ? 'Başlangıçtan itibaren' : `${formatMonthYear(h.fromPeriod)}'dan itibaren`}</span>
              <span class="row__value">${formatMoney(h.amount, { decimals: false })}
                <button class="row__remove" data-remove-salary="${h.id}" type="button" aria-label="Sil">×</button>
              </span>
            </div>`).join('')}
        </div>
        <p class="field__hint" style="margin:0 0 12px;">
          En eski kayıttan önceki dönemler de ${formatMoney(history[history.length - 1].amount, { decimals: false })} ile hesaplanır.
        </p>`}
      <div class="input-row">
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Hangi aydan itibaren</label>
          <input class="input" type="month" id="salaryFromPeriod" value="${currentPeriodKey()}" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Yeni maaş (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="salaryNewAmount" placeholder="ör. 42000" />
        </div>
      </div>
      <button class="btn btn--secondary btn--sm" id="addSalaryBtn" type="button" style="margin-top:12px;">Maaş değişikliği ekle</button>
    </div>
  `;
}

function wireSalaryHistory(container, ctx) {
  container.querySelector('#addSalaryBtn')?.addEventListener('click', () => {
    const fromPeriod = container.querySelector('#salaryFromPeriod').value;
    const amount = parseLocaleNumber(container.querySelector('#salaryNewAmount').value);
    if (!fromPeriod) { showToast('Ay seçmelisin'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Geçerli bir maaş gir'); return; }

    const settings = ctx.store.getState().settings;
    ctx.store.updateSettings(addSalaryChange(settings, { fromPeriod, amount }, currentPeriodKey()));
    showToast(`${formatMonthYear(fromPeriod)} için ${formatMoney(amount, { decimals: false })} kaydedildi`);
  });

  container.querySelector('.card')?.parentElement?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-salary]');
    if (!btn) return;
    const settings = ctx.store.getState().settings;
    const history = (settings.salaryHistory || []).filter((h) => h.id !== btn.dataset.removeSalary);
    ctx.store.updateSettings({ salaryHistory: history });
    showToast('Maaş kaydı silindi');
  });
}
