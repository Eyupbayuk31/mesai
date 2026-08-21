// Bütçe sekmesi: dönem harcamaları, kategori dökümü ve tahmini ödemeden kalan.

import { currentPeriodKey, periodLabel, shiftPeriod } from '../period.js';
import { budgetSummary, budgetTips, allCategories } from '../budget.js';
import { formatMoney, formatDayMonthShort, formatWeekdayShort, todayISO } from '../format.js';
import { enableSwipeToDelete } from './swipe.js';
import { showToast } from './toast.js';

export function renderBudget(container, state, ctx) {
  const periodKey = ctx.budgetPeriodKey || currentPeriodKey();
  const summary = budgetSummary(state, periodKey);
  const isCurrent = periodKey === currentPeriodKey();

  const recentExpenses = [...summary.expenses]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));

  container.innerHTML = `
    <div class="period-card">
      <button class="period-card__nav" id="prevPeriod" type="button" aria-label="Önceki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub">${summary.expenseCount} harcama · ${formatMoney(summary.spent, { decimals: false })}</div>
      </div>
      <button class="period-card__nav" id="nextPeriod" type="button" aria-label="Sonraki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    ${summary.hasSalary ? `
    <div class="card card--bordro">
      <div class="hero">
        <div class="hero__label">Kalan bütçe</div>
        <div class="hero__value ${summary.remaining < 0 ? 'is-negative' : ''}">${formatMoney(summary.remaining, { decimals: false })}</div>
        <div class="hero__sub">toplam bütçe ${formatMoney(summary.expectedTotal, { decimals: false })} − harcama ${formatMoney(summary.spent, { decimals: false })}</div>
        ${summary.dailyAllowance !== null ? `
        <div class="hero__compare ${summary.remaining < 0 ? 'is-down' : 'is-up'}">
          ${summary.remaining < 0 ? 'bütçe aşıldı' : `günde ${formatMoney(summary.dailyAllowance, { decimals: false })} harcayabilirsin`} · ${summary.daysLeft} gün kaldı
        </div>` : ''}
      </div>
      <div class="rows rows--receipt">
        ${receiptRow('Toplam bütçe', formatMoney(summary.expectedTotal, { decimals: false }))}
        ${summary.advances > 0 ? receiptRow('Avans geri eklendi', `+ ${formatMoney(summary.advances, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
        ${receiptRow('Harcama', `− ${formatMoney(summary.spent, { decimals: false })}`, { valueCls: 'is-negative' })}
        ${summary.byCategory.map((c) => receiptRow(`<span style="color:var(--text-tertiary);"><span class="dot" style="background:${c.color};"></span>${c.label}</span>`, formatMoney(c.amount, { decimals: false }))).join('')}
        ${receiptRow('Kalan', formatMoney(summary.remaining, { decimals: false }), { rowCls: 'row--total' })}
      </div>
    </div>` : `
    <div class="card card--bordro">
      <div class="hero">
        <div class="hero__label">Bu dönem harcama</div>
        <div class="hero__value">${formatMoney(summary.spent, { decimals: false })}</div>
        <div class="hero__sub">${summary.expenseCount} kayıt</div>
      </div>
      <div class="cta-note">Tahmini ödemenden düşerek kalan bütçeyi görmek için Ayarlar → Maaş ve ücret'ten maaşını gir.</div>
      <button class="btn btn--ghost" id="goSalary" type="button" style="margin-top:8px;">Maaşımı gir</button>
    </div>`}

    <div class="section-title">Öneriler</div>
    <div class="card tips-card">
      ${budgetTips(summary).map((t) => `
      <div class="tip-row">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="tip-row__icon"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.5 1 2.5h6c0-1 .3-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>
        <span>${t}</span>
      </div>`).join('')}
    </div>

    <div class="section-header">
      <span class="section-title" style="margin:0;">Harcamalar</span>
      <button class="section-header__link" id="addExpense" type="button">Harcama ekle ›</button>
    </div>
    ${recentExpenses.length === 0 ? emptyStateHTML(isCurrent) : `<ul class="list" id="expenseList">${recentExpenses.map((e) => expenseRowHTML(e, state.settings)).join('')}</ul>`}
  `;

  container.querySelector('#prevPeriod').addEventListener('click', () => ctx.setBudgetPeriod(shiftPeriod(periodKey, -1)));
  container.querySelector('#nextPeriod').addEventListener('click', () => ctx.setBudgetPeriod(shiftPeriod(periodKey, 1)));

  container.querySelector('#goSalary')?.addEventListener('click', () => ctx.navigate({ tab: 'settings', page: 'salary' }));

  container.querySelector('#addExpense').addEventListener('click', () => ctx.openExpense());

  const listEl = container.querySelector('#expenseList');
  if (listEl) {
    enableSwipeToDelete(listEl, {
      onDelete: (id) => {
        const expense = state.expenses.find((e) => e.id === id);
        ctx.store.removeExpense(id);
        showToast('Harcama silindi', { actionLabel: 'Geri al', onAction: () => ctx.store.addExpense(expense) });
      },
      onTap: (id) => {
        const expense = state.expenses.find((e) => e.id === id);
        ctx.openExpense(expense);
      },
    });
  }
}

function expenseRowHTML(e, settings) {
  const [, , day] = e.date.split('-');
  const category = categoryLabel(e.category, settings);
  return `
    <li class="entry-row entry-row--expense" data-id="${e.id}">
      <div class="entry-row__content">
        <div class="entry-row__date">
          <div class="entry-row__day">${Number(day)}</div>
          <div class="entry-row__weekday">${formatWeekdayShort(e.date).replace('.', '')}</div>
        </div>
        <div class="entry-row__mid">
          <div class="entry-row__hours"><span class="dot" style="background:${category.color}; display:inline-block;"></span>&nbsp;${category.label}</div>
          <div class="entry-row__meta">${formatDayMonthShort(e.date)}${e.note ? ' · ' + escapeHTML(e.note) : ''}</div>
        </div>
        <div class="entry-row__amount entry-row__amount--expense">− ${formatMoney(Number(e.amount) || 0, { decimals: false })}</div>
      </div>
      <div class="entry-row__delete">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7"/></svg>
      </div>
    </li>
  `;
}

function categoryLabel(key, settings) {
  const all = allCategories(settings);
  return all.find((c) => c.key === key) || all[all.length - 1];
}

// Fiş (receipt) satırı: etiket ······ değer. Özet kartındakiyle aynı desen.
function receiptRow(label, value, { rowCls = '', valueCls = '' } = {}) {
  return `<div class="row ${rowCls}"><span class="row__label">${label}</span><span class="row__leader"></span><span class="row__value ${valueCls}">${value}</span></div>`;
}

function emptyStateHTML(isCurrent) {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 15h2"/></svg>
      </div>
      <div class="empty__title">Bu dönemde harcama yok</div>
      <div class="empty__sub">${isCurrent ? "Sağ alttaki + butonuyla harcamanı ekle" : 'Bu döneme harcama girilmemiş'}</div>
    </div>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
