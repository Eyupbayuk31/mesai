import { currentPeriodKey, periodLabel, payDateForPeriod, daysUntilPay } from '../period.js';
import { periodSummary } from '../payroll.js';
import { formatMoney, formatHours, formatFullDate } from '../format.js';
import { entryRowHTML } from './entryRow.js';
import { enableSwipeToDelete } from './swipe.js';
import { showToast } from './toast.js';

export async function renderHome(container, state, ctx) {
  const periodKey = currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const settings = state.settings;
  const hasSalary = Number(settings.monthlySalary) > 0;

  const payDate = payDateForPeriod(periodKey, settings);
  const daysLeft = daysUntilPay(periodKey, settings);
  const daysText = daysLeft === 0 ? 'bugün' : daysLeft === 1 ? 'yarın' : `${daysLeft} gün kaldı`;

  const recentEntries = [...summary.entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
    .slice(0, 5);

  container.innerHTML = `
    <div class="period-card">
      <div style="width:34px;"></div>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub"><b>${formatFullDate(toISO(payDate))}</b> tarihinde yatacak · ${daysText}</div>
      </div>
      <div style="width:34px;"></div>
    </div>

    ${!hasSalary ? `
      <div class="card cta-card">
        <div class="cta-card__icon">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="cta-card__title">Önce maaşını gir</div>
        <div class="cta-card__sub">Saatlik ücretini hesaplayabilmemiz için aylık maaşına ihtiyacımız var.</div>
        <button class="btn btn--primary" id="goSettings" type="button">Maaşımı gir</button>
      </div>
    ` : `
      <div class="card">
        <div class="hero">
          <div class="hero__label">Bu dönem mesai</div>
          <div class="hero__value">${formatHours(summary.totalHours)}</div>
          <div class="hero__sub">${formatMoney(summary.overtimePay)}</div>
        </div>
        ${renderTypeChips(summary)}
      </div>

      <div class="card">
        <div class="rows">
          <div class="row"><span class="row__label">Maaş</span><span class="row__value">${formatMoney(summary.baseSalary, { decimals: false })}</span></div>
          <div class="row"><span class="row__label">Mesai ücreti</span><span class="row__value is-positive">+ ${formatMoney(summary.overtimePay, { decimals: false })}</span></div>
          ${summary.bonuses > 0 ? `<div class="row"><span class="row__label">Prim</span><span class="row__value is-positive">+ ${formatMoney(summary.bonuses, { decimals: false })}</span></div>` : ''}
          ${summary.advances > 0 ? `<div class="row"><span class="row__label">Avans</span><span class="row__value is-negative">− ${formatMoney(summary.advances, { decimals: false })}</span></div>` : ''}
          ${summary.deductions > 0 ? `<div class="row"><span class="row__label">Kesinti</span><span class="row__value is-negative">− ${formatMoney(summary.deductions, { decimals: false })}</span></div>` : ''}
          <div class="row row--total"><span class="row__label">Tahmini eline geçecek</span><span class="row__value">${formatMoney(summary.netTotal)}</span></div>
        </div>
      </div>
    `}

    <div class="section-title">Son mesailer</div>
    ${recentEntries.length === 0 ? emptyState() : `<ul class="list" id="recentList">${recentEntries.map((e) => entryRowHTML(e, settings)).join('')}</ul>`}
  `;

  container.querySelector('#goSettings')?.addEventListener('click', () => ctx.setTab('settings'));

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

function renderTypeChips(summary) {
  const items = [
    { key: 'normal', label: 'Normal' },
    { key: 'weekend', label: 'Hafta tatili' },
    { key: 'holiday', label: 'Resmi tatil' },
  ].filter((t) => summary.byType[t.key].hours > 0);
  if (items.length === 0) return '';
  return `<div class="chips" style="margin-top:18px;">${items.map((t) => `<span class="chip chip--${t.key}">${t.label} · ${formatHours(summary.byType[t.key].hours)}</span>`).join('')}</div>`;
}

function emptyState() {
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

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
