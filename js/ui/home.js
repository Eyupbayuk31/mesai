import { currentPeriodKey, periodLabel, payDateForPeriod, daysUntilPay, shiftPeriod } from '../period.js';
import { periodSummary, scheduledWeeklyHours } from '../payroll.js';
import { holidayListForYear, nextHoliday } from '../holidays.js';
import { formatMoney, formatHours, formatFullDate, formatDayMonthShort, formatWeekdayShort, toISODate, todayISO } from '../format.js';
import { entryRowHTML } from './entryRow.js';
import { enableSwipeToDelete } from './swipe.js';
import { showToast } from './toast.js';
import { openSheet } from './sheet.js';

const RECENT_COUNT = 5;

// Bu haftanın (Pazartesi başlangıçlı) mesai toplamı.
function thisWeekHours(entries, today = new Date()) {
  const offset = (today.getDay() + 6) % 7; // Pazartesi = 0
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  const mondayISO = toISODate(monday);
  const todayStr = toISODate(today);
  return entries
    .filter((e) => e.date >= mondayISO && e.date <= todayStr)
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
}

export function renderHome(container, state, ctx) {
  const periodKey = currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const prevSummary = periodSummary(state, shiftPeriod(periodKey, -1));
  const settings = state.settings;
  const hasSalary = Number(settings.monthlySalary) > 0;

  const payDate = payDateForPeriod(periodKey, settings);
  const daysLeft = daysUntilPay(periodKey, settings);
  const daysText = daysLeft === 0 ? 'bugün' : daysLeft === 1 ? 'yarın' : `${daysLeft} gün kaldı`;

  const recentEntries = [...summary.entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
    .slice(0, RECENT_COUNT);

  container.innerHTML = `
    <div class="period-card">
      <div style="width:34px;"></div>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub"><b>${formatFullDate(toISODate(payDate))}</b> tarihinde yatacak · ${daysText}</div>
      </div>
      <div style="width:34px;"></div>
    </div>

    ${!hasSalary ? salaryCtaHTML() : `
      <div class="card card--bordro">
        <div class="hero">
          <div class="hero__label">Bu dönem mesai</div>
          <div class="hero__value">${formatHours(summary.totalHours)}</div>
          <div class="hero__sub">${formatMoney(summary.overtimePay)}</div>
          ${comparisonHTML(summary, prevSummary, periodKey)}
          ${goalBarHTML(summary, settings.monthlyGoalHours)}
        </div>
        ${typeChipsHTML(summary)}
        <div class="rows rows--receipt">
          ${receiptRow('Maaş', formatMoney(summary.baseSalary, { decimals: false }))}
          ${receiptRow('Mesai ücreti', `+ ${formatMoney(summary.overtimePay, { decimals: false })}`, { valueCls: 'is-positive' })}
          ${summary.mealPay > 0 ? receiptRow(`Yemek parası <span style="color:var(--text-tertiary);">(${summary.allowanceDays} gün)</span>`, `+ ${formatMoney(summary.mealPay, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${summary.transportPay > 0 ? receiptRow(`Yol parası <span style="color:var(--text-tertiary);">(${summary.allowanceDays} gün)</span>`, `+ ${formatMoney(summary.transportPay, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${summary.bonuses > 0 ? receiptRow('Prim', `+ ${formatMoney(summary.bonuses, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${(summary.advances > 0 || summary.deductions > 0) ? receiptRow('Toplam gelir', formatMoney(summary.totalIncome, { decimals: false }), { rowCls: 'row--subtotal' }) : ''}
          ${summary.advances > 0 ? receiptRow('Avans', `− ${formatMoney(summary.advances, { decimals: false })}`, { valueCls: 'is-negative' }) : ''}
          ${summary.deductions > 0 ? receiptRow('Kesinti', `− ${formatMoney(summary.deductions, { decimals: false })}`, { valueCls: 'is-negative' }) : ''}
          ${receiptRow('Tahmini eline geçecek', formatMoney(summary.netTotal), { rowCls: 'row--total' })}
        </div>
      </div>

      <div class="stat-strip">
        <div class="stat-strip__item">
          <div class="stat-strip__label">Bu hafta</div>
          <div class="stat-strip__value">${formatHours(thisWeekHours(state.entries))}</div>
        </div>
        <div class="stat-strip__divider"></div>
        <div class="stat-strip__item">
          <div class="stat-strip__label">Kayıt</div>
          <div class="stat-strip__value">${summary.entryCount}</div>
        </div>
        <div class="stat-strip__divider"></div>
        <div class="stat-strip__item">
          <div class="stat-strip__label">Saat ücreti</div>
          <div class="stat-strip__value">${formatMoney(summary.baseSalary / (settings.hoursDivisor || 225), { decimals: false })}</div>
        </div>
      </div>

      ${statusCardHTML(state)}

      <button class="btn btn--primary" id="quickAdd" type="button" style="margin-top:14px;">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Bugün mesai ekle
      </button>
    `}

    <div class="section-header">
      <span class="section-title" style="margin:0;">Son mesailer</span>
      ${summary.entryCount > 0
        ? `<button class="section-header__link" id="seeAll" type="button">Tümünü gör (${summary.entryCount}) ›</button>`
        : ''}
    </div>
    ${recentEntries.length === 0 ? emptyStateHTML() : `<ul class="list" id="recentList">${recentEntries.map((e) => entryRowHTML(e, settings)).join('')}</ul>`}
  `;

  container.querySelector('#goSettings')?.addEventListener('click', () => {
    ctx.navigate({ tab: 'settings', page: 'salary' });
  });

  container.querySelector('#quickAdd')?.addEventListener('click', () => {
    ctx.openEntryForDate(todayISO());
  });

  container.querySelector('#holidayRow')?.addEventListener('click', openHolidaySheet);

  container.querySelector('#seeAll')?.addEventListener('click', () => {
    ctx.setEntriesView({ periodKey, allTime: false, type: 'all', page: 1, mode: 'list' });
    ctx.setTab('entries');
  });

  const listEl = container.querySelector('#recentList');
  if (listEl) {
    enableSwipeToDelete(listEl, {
      onDelete: (id) => handleDelete(ctx.store, id),
      onTap: async (id) => {
        const entry = state.entries.find((e) => e.id === id);
        const { openEntrySheet } = await import('./entry.js');
        openEntrySheet(ctx.store, entry);
      },
    });
  }
}

// Geçen dönemle saat farkı — ilk dönemde (kıyas yoksa) gösterilmez.
function comparisonHTML(summary, prevSummary, periodKey) {
  if (prevSummary.entryCount === 0) return '';
  const diff = summary.totalHours - prevSummary.totalHours;
  if (Math.abs(diff) < 0.01) {
    return `<div class="hero__compare">Geçen ayla aynı</div>`;
  }
  const up = diff > 0;
  const arrow = up
    ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
    : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
  return `
    <div class="hero__compare ${up ? 'is-up' : 'is-down'}">
      ${arrow} Geçen aya göre ${up ? '+' : '−'}${formatHours(Math.abs(diff))}
    </div>
  `;
}

// Fiş (receipt) satırı: etiket ······ değer. Kılavuz çizgisi CSS'te.
function receiptRow(label, value, { rowCls = '', valueCls = '' } = {}) {
  return `<div class="row ${rowCls}"><span class="row__label">${label}</span><span class="row__leader"></span><span class="row__value ${valueCls}">${value}</span></div>`;
}

// Aylık mesai hedefi ilerlemesi — hedef girilmemişse hiç görünmez.
function goalBarHTML(summary, goal) {
  const goalHours = Number(goal) || 0;
  if (goalHours <= 0) return '';
  const pct = Math.min(100, Math.round((summary.totalHours / goalHours) * 100));
  const reached = summary.totalHours >= goalHours;
  return `
    <div class="goal">
      <div class="goal__meta">
        <span>Hedef ${reached ? 'aşıldı' : ''}</span>
        <span>${formatHours(summary.totalHours)} / ${formatHours(goalHours)} · %${pct}</span>
      </div>
      <div class="goal__track"><div class="goal__fill ${reached ? 'is-done' : ''}" style="width:${pct}%"></div></div>
    </div>
  `;
}

// Durum kartı: sıradaki resmi tatil + haftalık puantaj (program + mesai, 45 sa sınırı)
function statusCardHTML(state) {
  const holiday = nextHoliday(todayISO());
  const planned = scheduledWeeklyHours(state.settings);
  const overtime = thisWeekHours(state.entries);
  const total = Math.round((planned + overtime) * 4) / 4;
  const scale = Math.max(total, 45);
  const plannedPct = Math.min(100, (planned / scale) * 100);
  const overtimePct = Math.min(100 - plannedPct, (overtime / scale) * 100);
  const limitPct = Math.min(100, (45 / scale) * 100);
  return `
    <div class="card status-card">
      ${holiday ? `
      <button class="status-row" id="holidayRow" type="button">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="status-row__icon"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/></svg>
        <span class="status-row__label">Sıradaki tatil</span>
        <span class="status-row__value">${holiday.name} · ${formatDayMonthShort(holiday.date)}</span>
        <span class="status-row__chip">${holiday.daysLeft} gün</span>
      </button>` : ''}
      <div class="status-row status-row--meter">
        <span class="status-row__label">Bu hafta puantaj</span>
        <span class="status-row__value">${formatHours(total)} <span class="status-row__sub">program ${formatHours(planned)} + mesai ${formatHours(overtime)}</span></span>
      </div>
      <div class="meter" role="img" aria-label="Bu hafta toplam ${formatHours(total)}, kanuni sınır 45 saat">
        <div class="meter__fill meter__fill--planned" style="width:${plannedPct.toFixed(1)}%"></div>
        <div class="meter__fill meter__fill--overtime" style="left:${plannedPct.toFixed(1)}%; width:${overtimePct.toFixed(1)}%"></div>
        ${total > 45 ? `<div class="meter__limit" style="left:${limitPct.toFixed(1)}%" title="Kanuni sınır 45 sa"></div>` : ''}
      </div>
      <div class="status-card__foot">Kanuni haftalık çalışma sınırı 45 saat</div>
    </div>
  `;
}

function openHolidaySheet() {
  const year = new Date().getFullYear();
  const list = holidayListForYear(year);
  const today = todayISO();
  openSheet({
    title: `${year} resmi tatiller`,
    build(bodyEl) {
      bodyEl.innerHTML = `
        <ul class="holiday-list">
          ${list.map((h) => `
            <li class="holiday-list__item ${h.date < today ? 'is-past' : ''} ${h.date === today ? 'is-today' : ''}">
              <span class="holiday-list__date">${formatDayMonthShort(h.date)}<small>${formatWeekdayShort(h.date)}</small></span>
              <span class="holiday-list__name">${h.name}</span>
            </li>
          `).join('')}
        </ul>
        <p class="field__hint" style="margin-top:12px;">Dini bayramlar Diyanet takvimine göredir; 2030'a kadar listelenir. Bugünkü tarih kalın gösterilir, geçmiş tatiller soluk.</p>
      `;
    },
  });
}

function typeChipsHTML(summary) {
  const items = [
    { key: 'normal', label: 'Normal' },
    { key: 'weekend', label: 'Hafta tatili' },
    { key: 'holiday', label: 'Resmi tatil' },
  ].filter((t) => summary.byType[t.key].hours > 0);
  if (items.length === 0) return '';
  return `<div class="chips" style="margin-top:18px;">${items.map((t) => `<span class="chip chip--${t.key}">${t.label} · ${formatHours(summary.byType[t.key].hours)}</span>`).join('')}</div>`;
}

function salaryCtaHTML() {
  return `
    <div class="card cta-card">
      <div class="cta-card__icon">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <div class="cta-card__title">Önce maaşını gir</div>
      <div class="cta-card__sub">Saatlik ücretini hesaplayabilmemiz için aylık maaşına ihtiyacımız var.</div>
      <button class="btn btn--primary" id="goSettings" type="button">Maaşımı gir</button>
    </div>
  `;
}

function emptyStateHTML() {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
      </div>
      <div class="empty__title">Henüz mesai kaydı yok</div>
      <div class="empty__sub">Sağ alttaki + butonuyla ilk mesaini ekle</div>
    </div>
  `;
}

function handleDelete(store, id) {
  const entry = store.getState().entries.find((e) => e.id === id);
  if (!entry) return;
  store.removeEntry(id);
  showToast('Mesai kaydı silindi', {
    actionLabel: 'Geri al',
    onAction: () => store.addEntry(entry),
  });
}
