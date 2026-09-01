import { timeSelectHTML } from '../timeSelect.js';
import { seniority, entitlementFor } from '../../leave.js';
import { todayISO } from '../../format.js';
import { WEEKDAY_LABELS_FULL, WEEKDAY_JS_VALUES } from './shared.js';

export const title = 'Çalışma programı';

function dayScheduleRowHTML(dayNum, label, daySchedule) {
  return `
    <div class="day-schedule-row">
      <div class="day-schedule-row__header">
        <span class="day-schedule-row__label">${label}</span>
        <button class="switch ${daySchedule.works ? 'is-on' : ''}" data-day-toggle="${dayNum}" type="button" aria-label="${label} çalışıyor musun"></button>
      </div>
      ${daySchedule.works ? `
        <div class="day-schedule-row__times">
          ${timeSelectHTML(`day${dayNum}Start`, daySchedule.start)}
          <span class="day-schedule-row__dash">–</span>
          ${timeSelectHTML(`day${dayNum}End`, daySchedule.end)}
        </div>
      ` : `<div class="field__hint">Bu gün çalışmıyorsun</div>`}
    </div>
  `;
}

export function render(container, state, ctx) {
  const settings = state.settings;

  container.innerHTML = `
    <div class="card" id="weeklyScheduleCard">
      <p class="field__hint" style="margin-top:-4px; margin-bottom:14px;">"Giriş-Çıkış" ile mesai girerken, buradaki normal saatlerin üstündeki kısım otomatik mesai sayılır.</p>
      ${WEEKDAY_JS_VALUES.map((dayNum, i) => dayScheduleRowHTML(dayNum, WEEKDAY_LABELS_FULL[i], settings.weeklySchedule[dayNum])).join('')}
    </div>

    <div class="section-title">Kıdem ve izin</div>
    <div class="card" id="hireCard">
      <div class="field">
        <label class="field__label">İşe giriş tarihi</label>
        <input class="input" type="date" id="hireDateInput" value="${settings.hireDate || ''}" />
      </div>
      <p class="field__hint" id="seniorityLine" style="margin:-4px 0 14px;">${seniorityLineHTML(settings)}</p>
      <div class="switch-row" style="border-top:1px solid var(--divider); padding-bottom:0;">
        <div>
          <div class="switch-row__label">18 yaş altı / 50 yaş üstü</div>
          <div class="switch-row__hint">Bu durumda yıllık izin en az 20 gündür (İş Kanunu md. 53).</div>
        </div>
        <button class="switch ${settings.leaveMinimum20 ? 'is-on' : ''}" id="minimum20Switch" type="button" aria-label="18 yaş altı / 50 yaş üstü"></button>
      </div>
    </div>

    <div class="section-title">Resmi tatiller</div>
    <div class="card" id="eveCard">
      <div class="switch-row" style="padding-top:0;">
        <div>
          <div class="switch-row__label">Bayram arifesinde çalışıyoruz</div>
          <div class="switch-row__hint">Arife yasada yarım gün tatildir. Açarsan o gün iş günü sayılır; yemek ve yol parası beklentisine girer.</div>
        </div>
        <button class="switch ${settings.halfDayEves ? 'is-on' : ''}" id="halfDayEvesSwitch" type="button" aria-label="Bayram arifesinde çalışıyoruz"></button>
      </div>
    </div>

    <div class="section-title">Mesai molası</div>
    <div class="card" id="breakWindowCard">
      <div class="switch-row" style="padding-top:0;">
        <div>
          <div class="switch-row__label">Mola süresini düş</div>
          <div class="switch-row__hint">Bu aralıkla kesişen mesai süresi otomatik düşülür</div>
        </div>
        <button class="switch ${settings.breakWindow.enabled ? 'is-on' : ''}" id="breakEnabledSwitch" type="button" aria-label="Mola süresini düş"></button>
      </div>
      ${settings.breakWindow.enabled ? `
        <div class="input-row" style="margin-top:10px;">
          <div class="field">
            <label class="field__label" style="font-size:12px;">Başlangıç</label>
            ${timeSelectHTML('breakStart', settings.breakWindow.start)}
          </div>
          <div class="field">
            <label class="field__label" style="font-size:12px;">Bitiş</label>
            ${timeSelectHTML('breakEnd', settings.breakWindow.end)}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  const scheduleCard = container.querySelector('#weeklyScheduleCard');

  scheduleCard.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-day-toggle]');
    if (!toggleBtn) return;
    const dayNum = toggleBtn.dataset.dayToggle;
    const current = settings.weeklySchedule[dayNum];
    ctx.store.updateSettings({
      weeklySchedule: { ...settings.weeklySchedule, [dayNum]: { ...current, works: !current.works } },
      // Kurulum ekranı "programı ayarladın mı" sorusunu bu bayraktan bilir.
      scheduleTouched: true,
    });
  });

  scheduleCard.addEventListener('change', (e) => {
    const select = e.target.closest('select[id^="day"]');
    if (!select) return;
    const match = select.id.match(/^day(\d)(Start|End)(Hour|Minute)$/);
    if (!match) return;
    const [, dayNum, part] = match;
    const hourSel = scheduleCard.querySelector(`#day${dayNum}${part}Hour`);
    const minuteSel = scheduleCard.querySelector(`#day${dayNum}${part}Minute`);
    const timeValue = `${hourSel.value}:${minuteSel.value}`;
    const current = settings.weeklySchedule[dayNum];
    const key = part === 'Start' ? 'start' : 'end';
    ctx.store.updateSettings({
      weeklySchedule: { ...settings.weeklySchedule, [dayNum]: { ...current, [key]: timeValue } },
      scheduleTouched: true,
    });
  });

  container.querySelector('#hireDateInput').addEventListener('change', (e) => {
    ctx.store.updateSettings({ hireDate: e.target.value || '' });
  });
  container.querySelector('#minimum20Switch').addEventListener('click', () => {
    ctx.store.updateSettings({ leaveMinimum20: !settings.leaveMinimum20 });
  });

  container.querySelector('#halfDayEvesSwitch').addEventListener('click', () => {
    ctx.store.updateSettings({ halfDayEves: !settings.halfDayEves });
  });

  const breakCard = container.querySelector('#breakWindowCard');

  breakCard.querySelector('#breakEnabledSwitch').addEventListener('click', () => {
    ctx.store.updateSettings({ breakWindow: { ...settings.breakWindow, enabled: !settings.breakWindow.enabled } });
  });

  breakCard.addEventListener('change', (e) => {
    const select = e.target.closest('select[id^="break"]');
    if (!select) return;
    const match = select.id.match(/^break(Start|End)(Hour|Minute)$/);
    if (!match) return;
    const [, part] = match;
    const hourSel = breakCard.querySelector(`#break${part}Hour`);
    const minuteSel = breakCard.querySelector(`#break${part}Minute`);
    const timeValue = `${hourSel.value}:${minuteSel.value}`;
    const key = part === 'Start' ? 'start' : 'end';
    ctx.store.updateSettings({ breakWindow: { ...settings.breakWindow, [key]: timeValue } });
  });
}

// "3 yıl 2 ay kıdem · yılda 14 gün izin hakkı" — tarih girilince görünür.
function seniorityLineHTML(settings) {
  const s = seniority(settings.hireDate, todayISO());
  if (!s) return 'Tarihi girince kıdemin ve yıllık izin hakkın hesaplanır.';
  const kidem = s.years > 0
    ? `${s.years} yıl${s.months > 0 ? ` ${s.months} ay` : ''} kıdem`
    : `${s.months} ay kıdem`;
  const hak = entitlementFor(s.years, { minimum20: settings.leaveMinimum20 });
  return hak > 0
    ? `<b>${kidem}</b> · yılda <b>${hak} gün</b> izin hakkı`
    : `<b>${kidem}</b> · yıllık izin hakkı 1 yılı doldurunca doğar`;
}
