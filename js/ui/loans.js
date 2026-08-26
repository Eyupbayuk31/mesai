// Krediler ve Borçlar sayfaları (Gider → Krediler / Borçlar).
//
// İki sayfa da aynı motoru ve aynı kalıbı kullanır; fark yalnız hangi türleri
// gösterdikleri. Taksitli borç her ay bütçeden düşer ve bitince kendiliğinden
// durur; açık borcun taksiti yoktur, ödendikçe azalır.

import { currentPeriodKey } from '../period.js';
import { loansSummary, loanKind, isOpenDebt, DEBT_KINDS } from '../loans.js';
import { allCategories } from '../budget.js';
import { formatMoney, formatMonthYear, parseLocaleNumber, todayISO } from '../format.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

export const title = 'Krediler';

// İki sayfanın tek farkı: hangi türleri gösterip hangi türü eklediği.
const LOAN_PAGE = {
  kinds: ['kredi'],
  defaultKind: 'kredi',
  addLabel: 'Kredi ekle',
  listTitle: 'Krediler',
  heroLabel: 'Toplam kalan kredi borcu',
  emptyTitle: 'Kayıtlı kredi yok',
  emptySub: 'Araba kredisi, ihtiyaç kredisi gibi taksitli borçlarını ekle; her ay bütçeden düşsün, kalan borç azalsın.',
};

const DEBT_PAGE = {
  kinds: ['kisi', 'kart', 'diger'],
  defaultKind: 'kisi',
  addLabel: 'Borç ekle',
  listTitle: 'Borçlar',
  heroLabel: 'Toplam kalan borç',
  emptyTitle: 'Kayıtlı borç yok',
  emptySub: 'Bir kişiye olan borcunu ya da kredi kartı bakiyeni ekle. Taksitliyse her ay bütçeden düşer; değilse ödedikçe azalır.',
};

export function render(container, state, ctx) {
  renderPage(container, state, ctx, LOAN_PAGE);
}

/** Gider → Borçlar: kişiye borç, kredi kartı, diğer. */
export function renderDebts(container, state, ctx) {
  renderPage(container, state, ctx, DEBT_PAGE);
}

function renderPage(container, state, ctx, page) {
  const periodKey = currentPeriodKey();
  const summary = loansSummary(state, periodKey, { kind: page.kinds });
  const openCount = summary.openCount;

  container.innerHTML = `
    ${summary.count === 0 ? emptyHTML(page) : `
      <div class="card income-hero">
        <div class="income-hero__main">
          <div class="income-hero__label">${page.heroLabel}</div>
          <div class="income-hero__value ${summary.totalRemaining > 0 ? 'is-negative' : 'is-positive'}">${formatMoney(summary.totalRemaining, { decimals: false })}</div>
          <div class="income-hero__meta">
            ${openCount === 0 ? 'Hepsi kapandı 🎉' : `${openCount} açık kayıt`}
          </div>
          <div class="income-hero__facts">
            ${fact('Bu ay taksit', formatMoney(summary.monthlyTotal, { decimals: false }), summary.monthlyTotal > 0 ? 'bütçeden düşüyor' : 'taksit yok')}
            ${fact('Toplam borç', formatMoney(summary.totalDebt, { decimals: false }), '')}
            ${fact('Ödenen', formatMoney(Math.max(0, summary.totalDebt - summary.totalRemaining), { decimals: false }), '')}
          </div>
        </div>
      </div>

      <div class="section-header">
        <span class="section-title" style="margin:0;">${page.listTitle}</span>
        <span class="section-header__meta">${summary.count} kayıt</span>
      </div>
      <div class="loan-list">
        ${summary.items.map((item) => loanCardHTML(item)).join('')}
      </div>
    `}

    <div class="table-foot" style="border-top:0;">
      <span class="table-foot__hint">${summary.count === 0 ? '' : 'Kayda dokunarak düzenleyebilir, ödeme ekleyebilirsin.'}</span>
      <button class="btn btn--primary btn--inline" id="addLoanBtn" type="button">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        ${page.addLabel}
      </button>
    </div>
  `;

  container.querySelector('#addLoanBtn').addEventListener('click', () => openLoanSheet(ctx.store, null, page));

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
    if (loan) openLoanSheet(ctx.store, loan, page);
  });
}

function fact(label, value, sub) {
  return `
    <div class="income-fact">
      <div class="income-fact__label">${label}</div>
      <div class="income-fact__value">${value}</div>
      ${sub ? `<div class="income-fact__sub">${sub}</div>` : ''}
    </div>`;
}

function loanCardHTML({ loan, status }) {
  const pct = Math.round(status.progress * 100);
  const kind = loanKind(loan);
  const open = status.open;

  return `
    <div class="card loan" data-loan="${loan.id}" role="button" tabindex="0">
      <div class="loan__head">
        <span class="loan__name">
          ${escapeHTML(loan.label || kind.label)}
          <span class="loan__kind" style="--kind:${kind.color};">${kind.label}</span>
        </span>
        <span class="loan__remaining ${status.finished ? 'is-positive' : ''}">
          ${status.finished ? 'Bitti 🎉' : formatMoney(status.remaining, { decimals: false })}
        </span>
      </div>
      <div class="goal__track"><div class="goal__fill ${status.finished ? 'is-done' : ''}" style="width:${pct}%"></div></div>
      <div class="loan__meta">
        <span>${open
    ? `${formatMoney(status.paid, { decimals: false })} ödendi · %${pct}`
    : `${status.paidInstallments}/${status.installments} taksit · %${pct} ödendi`}</span>
        <span>${status.finished
    ? formatMoney(status.total, { decimals: false })
    : open
      ? `Toplam ${formatMoney(status.total, { decimals: false })}`
      : `Bitiş: ${formatMonthYear(status.endPeriod)}`}</span>
      </div>
      <div class="loan__foot">
        <span>${open
    ? 'Taksitsiz — ödedikçe azalır'
    : `Aylık ${formatMoney(status.amount, { decimals: false })}${status.extraPaid > 0 ? ` · ara ödeme ${formatMoney(status.extraPaid, { decimals: false })}` : ''}`}</span>
        ${status.finished ? '' : `<button class="loan__pay" data-pay="${loan.id}" type="button">${open ? 'Ödeme +' : 'Ara ödeme +'}</button>`}
      </div>
    </div>
  `;
}

function emptyHTML(page) {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12.5" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/></svg>
      </div>
      <div class="empty__title">${page.emptyTitle}</div>
      <div class="empty__sub">${page.emptySub}</div>
    </div>
  `;
}

// --- Kredi ekle / düzenle -------------------------------------------------

function openLoanSheet(store, loan, page = LOAN_PAGE) {
  const isNew = !loan;
  const cats = allCategories(store.getState().settings);
  const kindOptions = DEBT_KINDS.filter((k) => page.kinds.includes(k.key));
  const def = loan || {
    label: '', amount: '', installments: '', firstPeriod: currentPeriodKey(),
    day: 15, category: kindOptions[0]?.category || 'kredi', kind: page.defaultKind, active: true,
  };
  const activeKind = loanKind(def).key;
  const tekTur = kindOptions.length <= 1;

  openSheet({
    title: isNew ? page.addLabel : `${page.listTitle.slice(0, -3)}ı düzenle`,
    footerHTML: `
      <button class="btn btn--primary" id="saveLoanBtn" type="button">${isNew ? 'Ekle' : 'Kaydet'}</button>
      ${isNew ? '' : '<button class="btn btn--danger btn--sm" id="removeLoanBtn" type="button" style="margin-top:8px;">Kaydı sil</button>'}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        ${tekTur ? '' : `
        <div class="field">
          <label class="field__label">Borç türü</label>
          <div class="cat-chips" id="kindChips">
            ${kindOptions.map((k) => `
              <button class="cat-chip ${activeKind === k.key ? 'is-active' : ''}" data-kind="${k.key}" type="button" style="--cat-color:${k.color};">
                <span class="cat-chip__dot"></span>${k.label}
              </button>`).join('')}
          </div>
        </div>`}
        <div class="field">
          <label class="field__label">${tekTur ? 'Kredi adı' : 'Kime / ne için'}</label>
          <input class="input" type="text" id="loanLabel" value="${escapeAttr(def.label)}" placeholder="${tekTur ? 'ör. Araba kredisi' : 'ör. Ahmet, Bankamatik kartı'}" />
        </div>
        <div class="input-row">
          <div class="field">
            <label class="field__label" id="amountLabel">Aylık taksit (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="loanAmount" value="${def.amount === '' ? '' : String(def.amount).replace('.', ',')}" placeholder="10000" />
          </div>
          <div class="field">
            <label class="field__label">Taksit sayısı</label>
            <input class="input" type="text" inputmode="numeric" id="loanInstallments" value="${def.installments}" placeholder="${tekTur ? '36' : 'boş = taksitsiz'}" />
          </div>
        </div>
        <p class="field__hint" style="margin:-6px 0 14px;">
          Taksit sayısını boş bırakırsan <b>taksitsiz borç</b> olur: aylık bir tutar bütçeden
          düşmez, yukarıya toplam borcu yazarsın, ödedikçe azalır.
        </p>
        <div class="preview-strip">
          <span class="preview-strip__label">Toplam borç</span>
          <span class="preview-strip__value" id="loanTotalPreview">—</span>
        </div>
        <div class="input-row" id="scheduleRow">
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

      const labelEl = bodyEl.querySelector('#amountLabel');
      const scheduleEl = bodyEl.querySelector('#scheduleRow');

      // Toplam borç yazarken canlı görünsün; taksitsizde alanın anlamı değişir
      // (aylık taksit değil, toplam borç) — etiket de ona göre güncellenir.
      const updatePreview = () => {
        const amount = parseLocaleNumber(amountEl.value);
        const count = Math.round(Number(countEl.value) || 0);
        const open = !(count > 0);
        labelEl.textContent = open ? 'Toplam borç (₺)' : 'Aylık taksit (₺)';
        scheduleEl.hidden = open;
        previewEl.textContent = !(amount > 0)
          ? '—'
          : open
            ? `${formatMoney(amount, { decimals: false })} · taksitsiz`
            : `${formatMoney(amount * count, { decimals: false })} (${count} × ${formatMoney(amount, { decimals: false })})`;
      };
      amountEl.addEventListener('input', updatePreview);
      countEl.addEventListener('input', updatePreview);
      updatePreview();

      const selectChip = (group, chip) => {
        group.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
      };
      bodyEl.querySelector('#kindChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-kind]');
        if (chip) selectChip(bodyEl.querySelector('#kindChips'), chip);
      });
      bodyEl.querySelectorAll('[data-cat]').forEach((chip) => {
        chip.addEventListener('click', () => selectChip(chip.parentElement, chip));
      });

      footerEl.querySelector('#saveLoanBtn').addEventListener('click', () => {
        const amount = parseLocaleNumber(amountEl.value);
        const installments = Math.max(0, Math.round(Number(countEl.value) || 0));
        const open = installments <= 0;
        if (!Number.isFinite(amount) || amount <= 0) {
          showToast(open ? 'Toplam borcu gir' : 'Aylık taksit tutarını gir');
          return;
        }

        const kind = tekTur
          ? page.defaultKind
          : bodyEl.querySelector('#kindChips .cat-chip.is-active')?.dataset.kind || page.defaultKind;

        const payload = {
          kind,
          label: bodyEl.querySelector('#loanLabel').value.trim() || loanKind({ kind }).label,
          amount,
          installments,
          firstPeriod: bodyEl.querySelector('#loanFirstPeriod').value || currentPeriodKey(),
          day: Math.min(31, Math.max(1, Math.round(Number(bodyEl.querySelector('#loanDay').value) || 1))),
          category: bodyEl.querySelector('[data-cat].is-active')?.dataset.cat || loanKind({ kind }).category,
        };

        if (isNew) store.addLoan(payload);
        else store.updateLoan(loan.id, payload);
        showToast(isNew ? 'Eklendi' : 'Güncellendi');
        closeSheet();
      });

      footerEl.querySelector('#removeLoanBtn')?.addEventListener('click', () => {
        store.removeLoan(loan.id);
        showToast('Kayıt silindi');
        closeSheet();
      });
    },
  });
}

// --- Ara / erken ödeme ----------------------------------------------------

function openExtraPaymentSheet(store, loan) {
  const open = isOpenDebt(loan);
  openSheet({
    title: open ? 'Ödeme ekle' : 'Ara ödeme',
    footerHTML: `<button class="btn btn--primary" id="savePaymentBtn" type="button">Ekle</button>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          <b>${escapeHTML(loan.label || loanKind(loan).label)}</b> için ödeme. Kalan borçtan düşer${open ? '' : ', bitiş tarihini öne çeker'}
          ve o ayın bütçesinden harcama olarak iner.
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
          category: loan.category || loanKind(loan).category,
          note: bodyEl.querySelector('#paymentNote').value.trim() || `${loan.label || loanKind(loan).label} ${open ? 'ödemesi' : 'ara ödeme'}`,
          loanId: loan.id,
        });
        showToast(open ? 'Ödeme eklendi' : 'Ara ödeme eklendi');
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
