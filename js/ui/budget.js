// Bütçe sekmesi: dönem harcamaları, kategori dökümü ve tahmini ödemeden kalan.

import { currentPeriodKey, periodLabel, shiftPeriod } from '../period.js';
import { budgetSummary, budgetTips, allCategories, spendingPace, comparePreviousPeriod } from '../budget.js';
import { openRecurringSheet } from './expenseSheet.js';
import { formatMoney, formatDayMonthShort, formatWeekdayShort, todayISO } from '../format.js';
import { enableSwipeToDelete } from './swipe.js';
import { mountPeriodNav } from './periodNav.js';
import { showToast } from './toast.js';

export function renderBudget(container, state, ctx) {
  const periodKey = ctx.budgetPeriodKey || currentPeriodKey();
  const summary = budgetSummary(state, periodKey);
  const isCurrent = periodKey === currentPeriodKey();
  const pace = spendingPace(summary);
  const comparison = comparePreviousPeriod(state, periodKey);

  const recentExpenses = [...summary.expenses]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));

  container.innerHTML = `
    <div class="period-card">
      <button class="period-card__nav" id="prevPeriod" type="button" aria-label="Önceki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub">${summary.expenseCount} harcama${summary.virtualCount > 0 ? ` · ${summary.virtualCount} sürekli` : ''} · ${formatMoney(summary.spent, { decimals: false })}</div>
      </div>
      <button class="period-card__nav" id="nextPeriod" type="button" aria-label="Sonraki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    ${summary.hasSalary ? `
    <div class="card card--bordro card--split">
      <div class="hero">
        <div class="hero__label">Kalan bütçe</div>
        <div class="hero__value ${summary.remaining < 0 ? 'is-negative' : ''}">${formatMoney(summary.remaining, { decimals: false })}</div>
        <div class="hero__sub">toplam bütçe ${formatMoney(summary.expectedTotal, { decimals: false })} − harcama ${formatMoney(summary.spent, { decimals: false })}</div>
        <div class="hero__badges">
          ${summary.dailyAllowance !== null ? `
          <div class="hero__compare ${summary.remaining < 0 ? 'is-down' : 'is-up'}">
            ${summary.remaining < 0 ? 'bütçe aşıldı' : `günde ${formatMoney(summary.dailyAllowance, { decimals: false })} harcayabilirsin`} · ${summary.daysLeft} gün kaldı
          </div>` : ''}
          ${comparisonHTML(comparison)}
        </div>
        ${paceHTML(pace, summary)}
        ${summary.advances > 0 ? `
        <p class="hero__note">Avans dahil — Özet'teki <b>eline geçecek</b>, avansın düşülmüş halidir.</p>` : ''}
      </div>
      <div class="card__detail">
      ${categoryBarHTML(summary)}
      <div class="rows rows--receipt">
        ${summary.advances > 0 ? `
          ${receiptRow('Eline geçecek', formatMoney(summary.netTotal, { decimals: false }))}
          ${receiptRow('Avans <span style="color:var(--text-tertiary);">(zaten aldın)</span>', `+ ${formatMoney(summary.advances, { decimals: false })}`, { valueCls: 'is-positive' })}
          ${receiptRow('Toplam bütçe', formatMoney(summary.expectedTotal, { decimals: false }), { rowCls: 'row--subtotal' })}
        ` : receiptRow('Toplam bütçe', formatMoney(summary.expectedTotal, { decimals: false }))}
        ${receiptRow('Harcama', `− ${formatMoney(summary.spent, { decimals: false })}`, { valueCls: 'is-negative' })}
        ${summary.byCategory.map((c) => receiptRow(`<span style="color:var(--text-tertiary);"><span class="dot" style="background:${c.color};"></span>${c.label}</span>`, formatMoney(c.amount, { decimals: false }))).join('')}
        ${receiptRow('Kalan', formatMoney(summary.remaining, { decimals: false }), { rowCls: 'row--total' })}
      </div>
      </div>
      ${summary.upcomingTotal > 0 ? `
      <div class="recurring-note">
        ↻ Sonraki aylarda otomatik gelecek: <b>${formatMoney(summary.upcomingTotal, { decimals: false })}</b>
        <span style="color:var(--text-tertiary);">(${summary.upcomingRecurring.map((r) => escapeHTML(r.label || 'gider')).join(', ')})</span>
      </div>` : ''}
    </div>` : `
    <div class="card card--bordro">
      <div class="hero">
        <div class="hero__label">Bu dönem harcama</div>
        <div class="hero__value">${formatMoney(summary.spent, { decimals: false })}</div>
        <div class="hero__sub">${summary.expenseCount} kayıt</div>
      </div>
      ${categoryBarHTML(summary)}
      <div class="cta-note">Tahmini ödemenden düşerek kalan bütçeyi görmek için Ayarlar → Maaş ve ücret'ten maaşını gir.</div>
      <button class="btn btn--ghost" id="goSalary" type="button" style="margin-top:8px;">Maaşımı gir</button>
    </div>`}

    <div class="panes">
    <div class="pane">
    ${loansRowHTML(summary)}

    <div class="section-title">Öneriler</div>
    <div class="card tips-card">
      ${budgetTips(summary).map((t) => `
      <div class="tip-row">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="tip-row__icon"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.5 1 2.5h6c0-1 .3-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>
        <span>${t}</span>
      </div>`).join('')}
    </div>

    </div>

    <div class="pane">
    <div class="section-header">
      <span class="section-title" style="margin:0;">Harcamalar</span>
      <button class="section-header__link" id="addExpense" type="button">Harcama ekle ›</button>
    </div>
    ${recentExpenses.length === 0 ? emptyStateHTML(isCurrent) : `<ul class="list" id="expenseList">${recentExpenses.map((e) => expenseRowHTML(e, state.settings)).join('')}</ul>`}
    </div>
    </div>
  `;

  mountPeriodNav(ctx, {
    label: periodLabel(periodKey),
    sub: `${summary.expenseCount} harcama · ${formatMoney(summary.spent, { decimals: false })}`,
    onPrev: () => ctx.setBudgetPeriod(shiftPeriod(periodKey, -1)),
    onNext: () => ctx.setBudgetPeriod(shiftPeriod(periodKey, 1)),
  });

  container.querySelector('#prevPeriod').addEventListener('click', () => ctx.setBudgetPeriod(shiftPeriod(periodKey, -1)));
  container.querySelector('#nextPeriod').addEventListener('click', () => ctx.setBudgetPeriod(shiftPeriod(periodKey, 1)));

  container.querySelector('#goSalary')?.addEventListener('click', () => ctx.navigate({ tab: 'settings', page: 'salary' }));

  container.querySelector('#addExpense').addEventListener('click', () => ctx.openExpense());

  container.querySelector('#loansRow').addEventListener('click', () => ctx.navigate({ tab: 'budget', page: 'loans' }));

  const listEl = container.querySelector('#expenseList');
  if (listEl) {
    enableSwipeToDelete(listEl, {
      onDelete: (id) => {
        if (id.startsWith('vr_')) return; // sanal satır silinmez, tanımı düzenle
        const expense = state.expenses.find((e) => e.id === id);
        ctx.store.removeExpense(id);
        showToast('Harcama silindi', { actionLabel: 'Geri al', onAction: () => ctx.store.addExpense(expense) });
      },
      onTap: (id) => {
        if (id.startsWith('vr_')) {
          const def = (state.recurring || []).find((r) => `vr_${r.id}` === id);
          if (def) openRecurringSheet(ctx.store, def);
          return;
        }
        const expense = state.expenses.find((e) => e.id === id);
        ctx.openExpense(expense);
      },
    });
  }
}


// Geçen dönemle kıyas — ayın aynı gününe kadarki harcamalar karşılaştırılır.
// Borç özeti + Borçlar sayfasına giriş. Hiç kredi yoksa da görünür ki
// kullanıcı özelliğin varlığını fark etsin.
function loansRowHTML(summary) {
  const loans = summary.loans;
  const has = loans && loans.count > 0;
  return `
    <div class="card card--menu" style="margin-top:14px;">
      <div class="link-row" id="loansRow">
        <span>Borçlar${has ? `<span class="link-row__sub">${loans.openCount} açık kredi · bu ay ${formatMoney(loans.monthlyTotal, { decimals: false })}</span>` : ''}</span>
        <span class="link-row__value">${has ? formatMoney(loans.totalRemaining, { decimals: false }) : 'Kredi ekle'}</span>
        <span class="link-row__chevron">›</span>
      </div>
    </div>
  `;
}

function comparisonHTML(comparison) {
  if (!comparison) return '';
  const { diff, partial } = comparison;
  if (Math.abs(diff) < 1) return `<div class="hero__compare is-neutral">Geçen ayla aynı</div>`;
  // Harcamada ARTIŞ kötüdür: renk mantığı mesai kartının tersi.
  const up = diff > 0;
  return `
    <div class="hero__compare ${up ? 'is-down' : 'is-up'}">
      Geçen ${partial ? 'ayın aynı gününe göre' : 'aya göre'} ${up ? '+' : '−'}${formatMoney(Math.abs(diff), { decimals: false })}
    </div>
  `;
}

// "Bu hızla ay sonunda ne kadar, bütçe ne zaman biter?"
function paceHTML(pace, summary) {
  if (!pace) return '';
  const short = pace.runsOutOn !== null;
  const prefix = pace.reliable ? 'Bu hızla ay sonunda' : 'Kaba tahmin — ay sonunda';
  return `
    <div class="projection ${short ? 'is-behind' : ''}">
      ${prefix} <b>${formatMoney(pace.projected, { decimals: false })}</b> harcarsın
      ${short ? `· bütçe <b>${formatDayMonthShort(pace.runsOutOn)}</b> günü biter
        <span class="projection__warn">${pace.daysShort} gün açık</span>` : ''}
    </div>
  `;
}

// Kategori dökümünün renkli şeridi. Altındaki fiş satırları zaten kesin
// tutarları veriyor; şerit "para nereye gidiyor" sorusunu tek bakışta cevaplar.
function categoryBarHTML(summary) {
  if (summary.spent <= 0 || summary.byCategory.length < 2) return '';
  return `
    <div class="cat-bar" role="img" aria-label="Kategori dağılımı">
      ${summary.byCategory.map((c) => {
    const pct = (c.amount / summary.spent) * 100;
    return `<span class="cat-bar__seg" style="width:${pct.toFixed(2)}%; background:${c.color};"
                  title="${escapeHTML(c.label)} · ${formatMoney(c.amount, { decimals: false })} (%${Math.round(pct)})"></span>`;
  }).join('')}
    </div>
  `;
}

function expenseRowHTML(e, settings) {
  const [, , day] = e.date.split('-');
  const category = categoryLabel(e.category, settings);
  const isMonthly = e.virtual || e.recurringId; // sanal satır ya da tanıma bağlı gerçek harcama
  return `
    <li class="entry-row entry-row--expense ${isMonthly ? 'entry-row--recurring' : ''}" data-id="${e.id}">
      <div class="entry-row__content">
        <div class="entry-row__date">
          <div class="entry-row__day">${Number(day)}</div>
          <div class="entry-row__weekday">${isMonthly ? 'her ay' : formatWeekdayShort(e.date).replace('.', '')}</div>
        </div>
        <div class="entry-row__mid">
          <div class="entry-row__hours"><span class="dot" style="background:${category.color}; display:inline-block;"></span>&nbsp;${category.label}</div>
          <div class="entry-row__meta">${formatDayMonthShort(e.date)}${e.note ? ' · ' + escapeHTML(e.note) : ''}${isMonthly ? ` · <span class="recurring-tag">${e.virtual ? 'otomatik' : 'işaretli'}</span>` : ''}</div>
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
      <div class="empty__sub">${isCurrent ? '&quot;Harcama ekle&quot; ile ilk harcamanı gir' : 'Bu döneme harcama girilmemiş'}</div>
    </div>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
