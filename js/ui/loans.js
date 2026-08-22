// Borçlar sayfası (Bütçe → Borçlar).
//
// Her kredi bir sürekli gider gibi her ay bütçeden düşer, ama taksit sayısı
// bellidir: bitince kendiliğinden durur. Ara ödeme yapıldığında borç azalır ve
// bitiş tarihi öne gelir.

import { currentPeriodKey } from '../period.js';
import { loansSummary } from '../loans.js';
import { allCategories } from '../budget.js';
import { formatMoney, formatMonthYear, parseLocaleNumber, todayISO } from '../format.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export const title = 'Borçlar';

export function render(container, state, ctx) {
  const periodKey = currentPeriodKey();
  const summary = loansSummary(state, periodKey);

  container.innerHTML = `
    ${summary.count === 0 ? emptyHTML() : `
      <div class="card card--bordro">
        <div class="hero">
          <div class="hero__label">Toplam kalan borç</div>
          <div class="hero__value">${formatMoney(summary.totalRemaining, { decimals: false })}</div>
          <div class="hero__sub">${summary.openCount} açık kredi · bu ay ${formatMoney(summary.monthlyTotal, { decimals: false })} taksit</div>
        </div>
      </div>

      <div class="section-title">Krediler</div>
      <div class="loan-list">
        ${summary.items.map((item) => loanCardHTML(item)).join('')}
      </div>
    `}

    <button class="btn btn--primary" id="addLoanBtn" type="button" style="margin-top:16px;">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Kredi ekle
    </button>
  `;

  container.querySelector('#addLoanBtn').addEventListener('click', () => openLoanSheet(ctx.store, null));

  container.querySelector('.loan-list')?.addEventListener('click', (e) => {
    const payBtn = e.target.closest('[data-pay]');
    if (payBtn) {
      const loan = state.loans.find((l) => l.id === payBtn.dataset.pay);
      if (loan) openExtraPaymentSheet(ctx.store, loan);
      return;
    }
    const card = e.target.closest('[data-loan]');
    if (!card) return;
    const loan = state.loans.find((l) => l.id === card.dataset.loan);
    if (loan) openLoanSheet(ctx.store, loan);
  });
}

function loanCardHTML({ loan, status }) {
  const pct = Math.round(status.progress * 100);
  return `
    <div class="card loan" data-loan="${loan.id}" role="button" tabindex="0">
      <div class="loan__head">
        <span class="loan__name">${escapeHTML(loan.label || 'Kredi')}</span>
        <span class="loan__remaining ${status.finished ? 'is-positive' : ''}">
          ${status.finished ? 'Bitti 🎉' : formatMoney(status.remaining, { decimals: false })}
        </span>
      </div>
      <div class="goal__track"><div class="goal__fill ${status.finished ? 'is-done' : ''}" style="width:${pct}%"></div></div>
      <div class="loan__meta">
        <span>${status.paidInstallments}/${status.installments} taksit · %${pct} ödendi</span>
        <span>${status.finished
    ? formatMoney(status.total, { decimals: false })
    : `Bitiş: ${formatMonthYear(status.endPeriod)}`}</span>
      </div>
      <div class="loan__foot">
        <span>Aylık ${formatMoney(status.amount, { decimals: false })}${status.extraPaid > 0 ? ` · ara ödeme ${formatMoney(status.extraPaid, { decimals: false })}` : ''}</span>
        ${status.finished ? '' : `<button class="loan__pay" data-pay="${loan.id}" type="button">Ara ödeme +</button>`}
      </div>
    </div>
  `;
}

function emptyHTML() {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12.5" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/></svg>
      </div>
      <div class="empty__title">Kayıtlı kredi yok</div>
      <div class="empty__sub">Araba kredisi, ihtiyaç kredisi gibi taksitli borçlarını ekle; her ay bütçeden düşsün, kalan borç azalsın.</div>
    </div>
  `;
}

// --- Kredi ekle / düzenle -------------------------------------------------

function openLoanSheet(store, loan) {
  const isNew = !loan;
  const cats = allCategories(store.getState().settings);
  const def = loan || {
    label: '', amount: '', installments: '', firstPeriod: currentPeriodKey(),
    day: 15, category: 'kredi', active: true,
  };

  openSheet({
    title: isNew ? 'Kredi ekle' : 'Krediyi düzenle',
    footerHTML: `
      <button class="btn btn--primary" id="saveLoanBtn" type="button">${isNew ? 'Ekle' : 'Kaydet'}</button>
      ${isNew ? '' : `<button class="btn btn--danger btn--sm" id="removeLoanBtn" type="button" style="margin-top:8px;">Krediyi sil</button>`}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Kredi adı</label>
          <input class="input" type="text" id="loanLabel" value="${escapeAttr(def.label)}" placeholder="ör. Araba kredisi" />
        </div>
        <div class="input-row">
          <div class="field">
            <label class="field__label">Aylık taksit (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="loanAmount" value="${def.amount === '' ? '' : String(def.amount).replace('.', ',')}" placeholder="10000" />
          </div>
          <div class="field">
            <label class="field__label">Taksit sayısı</label>
            <input class="input" type="text" inputmode="numeric" id="loanInstallments" value="${def.installments}" placeholder="36" />
          </div>
        </div>
        <div class="preview-strip">
          <span class="preview-strip__label">Toplam borç</span>
          <span class="preview-strip__value" id="loanTotalPreview">—</span>
        </div>
        <div class="input-row">
          <div class="field">
            <label class="field__label">İlk taksit ayı</label>
            <input class="input" type="month" id="loanFirstPeriod" value="${def.firstPeriod}" />
          </div>
          <div class="field">
            <label class="field__label">Ayın günü</label>
            <input class="input" type="text" inputmode="numeric" id="loanDay" value="${def.day}" />
          </div>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Kategori</label>
          <div class="cat-chips">
            ${cats.map((c) => `
              <button class="cat-chip ${def.category === c.key ? 'is-active' : ''}" data-cat="${c.key}" type="button" style="--cat-color:${c.color};">
                <span class="cat-chip__dot"></span>${c.label}
              </button>
            `).join('')}
          </div>
        </div>
      `;

      const amountEl = bodyEl.querySelector('#loanAmount');
      const countEl = bodyEl.querySelector('#loanInstallments');
      const previewEl = bodyEl.querySelector('#loanTotalPreview');

      // Toplam borç yazarken canlı görünsün — kredi kağıdıyla karşılaştırmak kolay olsun.
      const updatePreview = () => {
        const amount = parseLocaleNumber(amountEl.value);
        const count = Math.round(Number(countEl.value) || 0);
        previewEl.textContent = (amount > 0 && count > 0)
          ? `${formatMoney(amount * count, { decimals: false })} (${count} × ${formatMoney(amount, { decimals: false })})`
          : '—';
      };
      amountEl.addEventListener('input', updatePreview);
      countEl.addEventListener('input', updatePreview);
      updatePreview();

      bodyEl.querySelectorAll('[data-cat]').forEach((chip) => {
        chip.addEventListener('click', () => {
          bodyEl.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('is-active'));
          chip.classList.add('is-active');
        });
      });

      footerEl.querySelector('#saveLoanBtn').addEventListener('click', () => {
        const amount = parseLocaleNumber(amountEl.value);
        const installments = Math.round(Number(countEl.value) || 0);
        if (!Number.isFinite(amount) || amount <= 0) { showToast('Aylık taksit tutarını gir'); return; }
        if (installments <= 0) { showToast('Taksit sayısını gir'); return; }

        const payload = {
          label: bodyEl.querySelector('#loanLabel').value.trim() || 'Kredi',
          amount,
          installments,
          firstPeriod: bodyEl.querySelector('#loanFirstPeriod').value || currentPeriodKey(),
          day: Math.min(31, Math.max(1, Math.round(Number(bodyEl.querySelector('#loanDay').value) || 1))),
          category: bodyEl.querySelector('.cat-chip.is-active')?.dataset.cat || 'kredi',
        };

        if (isNew) store.addLoan(payload);
        else store.updateLoan(loan.id, payload);
        showToast(isNew ? 'Kredi eklendi' : 'Kredi güncellendi');
        closeSheet();
      });

      footerEl.querySelector('#removeLoanBtn')?.addEventListener('click', () => {
        store.removeLoan(loan.id);
        showToast('Kredi silindi');
        closeSheet();
      });
    },
  });
}

// --- Ara / erken ödeme ----------------------------------------------------

function openExtraPaymentSheet(store, loan) {
  openSheet({
    title: 'Ara ödeme',
    footerHTML: `<button class="btn btn--primary" id="savePaymentBtn" type="button">Ekle</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          <b>${escapeHTML(loan.label || 'Kredi')}</b> için taksit dışı ödeme. Kalan borçtan düşer,
          bitiş tarihini öne çeker ve o ayın bütçesinden de harcama olarak iner.
        </p>
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="paymentAmount" placeholder="0" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field__label">Tarih</label>
          <input class="input" type="date" id="paymentDate" value="${todayISO()}" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Not</label>
          <input class="input" type="text" id="paymentNote" placeholder="ör. ikramiye ile" />
        </div>
      `;

      footerEl.querySelector('#savePaymentBtn').addEventListener('click', () => {
        const amount = parseLocaleNumber(bodyEl.querySelector('#paymentAmount').value);
        if (!Number.isFinite(amount) || amount <= 0) { showToast('Geçerli bir tutar girmelisin'); return; }
        store.addExpense({
          date: bodyEl.querySelector('#paymentDate').value || todayISO(),
          amount,
          category: loan.category || 'kredi',
          note: bodyEl.querySelector('#paymentNote').value.trim() || `${loan.label || 'Kredi'} ara ödeme`,
          loanId: loan.id,
        });
        showToast('Ara ödeme eklendi');
        closeSheet();
      });
    },
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(str) {
  return escapeHTML(str);
}
