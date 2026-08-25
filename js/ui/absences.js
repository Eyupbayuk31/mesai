// Gelinmeyen günler: takvimden işaretle.
//
// Maaşı etkilemez; yemek kartı ve yol parası beklentisini düzeltir. Uygulama
// bunları bilmediği sürece "eksik yatmış" diye boş yere alarm veriyordu.

import { calendarMonthGrid, WEEKDAY_HEADERS } from './calendar.js';
import { currentPeriodKey, periodLabel, shiftPeriod } from '../period.js';
import { workdaysForPeriod } from '../payroll.js';
import { isHoliday, holidayName } from '../holidays.js';
import { ABSENCE_KINDS, absenceKind, absenceOn, absencesInPeriod, absenceDatesInPeriod, absenceStats } from '../absences.js';
import { formatDayMonth, todayISO } from '../format.js';
import { mountPeriodNav } from './periodNav.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export function render(container, state, ctx) {
  const periodKey = ctx.absencePeriodKey || currentPeriodKey();
  ctx.absencePeriodKey = periodKey;
  const [year, month] = periodKey.split('-').map(Number);
  const settings = state.settings;

  const rows = absencesInPeriod(state, periodKey);
  const marked = new Map(rows.map((a) => [a.date, a]));
  const workdays = workdaysForPeriod(periodKey, settings);
  const payDays = workdaysForPeriod(periodKey, settings, absenceDatesInPeriod(state, periodKey));
  const stats = absenceStats(state, year);
  const today = todayISO();

  const cells = calendarMonthGrid(year, month);
  const ozet = `${workdays} iş günü${rows.length ? ` · ${rows.length} gün gelinmedi · yan ödeme ${payDays} gün` : ''}`;

  // Masaüstünde ekran içindeki dönem kartı gizli; gezinme üst çubuğa taşınır.
  mountPeriodNav(ctx, {
    label: periodLabel(periodKey),
    sub: ozet,
    onPrev: () => { ctx.absencePeriodKey = shiftPeriod(periodKey, -1); ctx.rerender(); },
    onNext: () => { ctx.absencePeriodKey = shiftPeriod(periodKey, 1); ctx.rerender(); },
  });

  container.innerHTML = `
    <div class="period-card">
      <button class="period-card__nav" id="prevMonth" type="button" aria-label="Önceki ay">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub">${rows.length ? `${rows.length} gün gelinmedi` : 'gelinmeyen gün yok'}</div>
      </div>
      <button class="period-card__nav" id="nextMonth" type="button" aria-label="Sonraki ay">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <div class="stat-strip stat-strip--kpi">
      <div class="stat-strip__item">
        <div class="stat-strip__label">İş günü</div>
        <div class="stat-strip__value">${workdays}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Gelinmedi</div>
        <div class="stat-strip__value ${rows.length ? 'is-negative' : ''}">${rows.length}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item stat-strip__item--lead">
        <div class="stat-strip__label">Yan ödeme günü</div>
        <div class="stat-strip__value">${payDays}</div>
      </div>
    </div>

    <div class="card cal-card">
      <div class="cal-legend">
        ${ABSENCE_KINDS.map((k) => `<span class="cal-legend__item"><i class="dot" style="background:${k.color};"></i>${k.label}</span>`).join('')}
      </div>
      <div class="cal__head">${WEEKDAY_HEADERS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal__grid" id="absenceGrid">
        ${cells.map((cell) => {
    const record = marked.get(cell.iso);
    const kind = record ? absenceKind(record.kind) : null;
    const works = settings.weeklySchedule?.[cell.date.getDay()]?.works;
    const holiday = isHoliday(cell.iso);
    const classes = [
      'cal-cell',
      cell.inMonth ? '' : 'cal-cell--outside',
      cell.iso === today ? 'cal-cell--today' : '',
      cell.inMonth && (!works || holiday) ? 'cal-cell--off' : '',
      record ? 'cal-cell--absent' : '',
    ].filter(Boolean).join(' ');
    return `
          <button class="${classes}" type="button" data-date="${cell.iso}" ${cell.inMonth ? '' : 'disabled'}
                  ${kind ? `style="--kind:${kind.color};"` : ''}
                  title="${kind ? kind.label : holiday ? holidayName(cell.iso) : ''}">
            <span class="cal-cell__day">${cell.day}</span>
            ${kind ? `<span class="cal-cell__mark" style="background:${kind.color};" aria-label="${kind.label}"></span>` : ''}
          </button>`;
  }).join('')}
      </div>
      <p class="field__hint" style="margin:12px 0 0;">
        Gelmediğin güne dokun, türünü seç. Yemek ve yol parası beklentisi o gün için düşer — maaşa dokunulmaz.
      </p>
    </div>

    ${rows.length === 0 ? '' : `
    <div class="section-header"><span class="section-title" style="margin:0;">Bu ay</span></div>
    <div class="card">
      <div class="rows">
        ${rows.map((a) => {
    const kind = absenceKind(a.kind);
    return `
          <div class="row" data-edit="${a.date}" role="button" tabindex="0">
            <span class="row__label"><span class="dot" style="background:${kind.color};"></span>${formatDayMonth(a.date)}</span>
            <span class="row__value" style="color:var(--text-secondary);">${kind.label}</span>
          </div>`;
  }).join('')}
      </div>
    </div>`}

    <div class="section-header"><span class="section-title" style="margin:0;">${year} özeti</span></div>
    <div class="card">
      ${stats.total === 0
    ? '<p class="field__hint" style="margin:0;">Bu yıl gelinmeyen gün işaretlenmemiş.</p>'
    : `
      <div class="rows rows--receipt">
        ${ABSENCE_KINDS.filter((k) => stats.counts[k.key] > 0).map((k) => `
          <div class="row">
            <span class="row__label"><span class="dot" style="background:${k.color};"></span>${k.label}</span>
            <span class="row__leader"></span>
            <span class="row__value">${stats.counts[k.key]} gün</span>
          </div>`).join('')}
        <div class="row row--total"><span class="row__label">Toplam</span><span class="row__leader"></span><span class="row__value">${stats.total} gün</span></div>
      </div>`}
    </div>
  `;

  container.querySelector('#prevMonth').addEventListener('click', () => { ctx.absencePeriodKey = shiftPeriod(periodKey, -1); ctx.rerender(); });
  container.querySelector('#nextMonth').addEventListener('click', () => { ctx.absencePeriodKey = shiftPeriod(periodKey, 1); ctx.rerender(); });

  container.querySelector('#absenceGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-date]');
    if (!cell || cell.disabled) return;
    openKindSheet(ctx, cell.dataset.date, absenceOn(state, cell.dataset.date));
  });
  container.addEventListener('click', (e) => {
    const row = e.target.closest('[data-edit]');
    if (row) openKindSheet(ctx, row.dataset.edit, absenceOn(state, row.dataset.edit));
  });
}

function openKindSheet(ctx, dateISO, existing) {
  openSheet({
    title: formatDayMonth(dateISO),
    footerHTML: existing ? '<button class="btn btn--danger btn--sm" id="clearAbsence" type="button">İşareti kaldır</button>' : '',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">Bu gün neden gelinmedi?</p>
        <div class="cat-chips" id="kindChips">
          ${ABSENCE_KINDS.map((k) => `
            <button class="cat-chip ${existing?.kind === k.key ? 'is-active' : ''}" type="button" data-kind="${k.key}" style="--cat-color:${k.color};">
              <span class="cat-chip__dot"></span>${k.label}
            </button>`).join('')}
        </div>
      `;
      bodyEl.querySelector('#kindChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-kind]');
        if (!chip) return;
        ctx.store.setAbsence(dateISO, chip.dataset.kind);
        showToast(`${formatDayMonth(dateISO)} işaretlendi`);
        closeSheet();
      });
      footerEl?.querySelector('#clearAbsence')?.addEventListener('click', () => {
        ctx.store.removeAbsence(dateISO);
        showToast('İşaret kaldırıldı');
        closeSheet();
      });
    },
  });
}
