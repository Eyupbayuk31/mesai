// Gelir sayfası: dönemin kazancı nereden geliyor, bordroda tuttu mu?
//
// Eskiden bu kartlar Rapor'un içindeydi; Rapor artık geriye dönük analiz
// sayfası, dönemin kendi hesabı buraya taşındı.

import { periodLabel, shiftPeriod, currentPeriodKey, payDateForPeriod, daysUntilPay } from '../period.js';
import { periodSummary } from '../payroll.js';
import { comparePayslip, explainPayslipDiff, payslipFor, hasPayslipData } from '../payslip.js';
import { formatMoney, formatHours, formatFullDate, toISODate, parseLocaleNumber } from '../format.js';
import { incomeMix } from '../incomeMix.js';
import { entryRowHTML } from './entryRow.js';
import { mountPeriodNav } from './periodNav.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

const TYPE_ROWS = [
  { key: 'normal', label: 'Normal' },
  { key: 'weekend', label: 'Hafta tatili' },
  { key: 'holiday', label: 'Resmi tatil' },
];

const PREVIEW_COUNT = 3;

export function renderIncome(container, state, ctx) {
  const periodKey = ctx.reportPeriodKey || currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const settings = state.settings;

  const mix = incomeMix(summary);
  const payDate = payDateForPeriod(periodKey, settings);
  const daysLeft = daysUntilPay(periodKey, settings);
  const daysText = daysLeft === 0 ? 'bugün' : daysLeft === 1 ? 'yarın' : `${daysLeft} gün kaldı`;
  const future = periodKey > currentPeriodKey();

  container.innerHTML = `
    <div class="period-card">
      <button class="period-card__nav" id="prevPeriod" type="button" aria-label="Önceki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub">${summary.entryCount} kayıt · ${formatHours(summary.totalHours)}</div>
      </div>
      <button class="period-card__nav" id="nextPeriod" type="button" aria-label="Sonraki dönem">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <div class="card income-hero">
      <div class="income-hero__main">
        <div class="income-hero__label">${future ? 'Bu dönem beklenen' : 'Ödeme günü yatacak'}</div>
        <div class="income-hero__value">${formatMoney(summary.payoutTotal, { decimals: false })}</div>
        <div class="income-hero__meta">
          <b>${formatFullDate(toISODate(payDate))}</b>${future ? '' : ` · ${daysText}`}
        </div>
        <div class="income-hero__facts">
          ${fact('Mesai', formatHours(summary.totalHours), summary.overtimePay > 0 ? formatMoney(summary.overtimePay, { decimals: false }) : '')}
          ${fact('Kayıt', String(summary.entryCount), '')}
          ${summary.advances > 0 ? fact('Avans düşüldü', `− ${formatMoney(summary.advances, { decimals: false })}`, `kazanç ${formatMoney(summary.earnedTotal, { decimals: false })}`) : fact('Saat ücreti', formatMoney(summary.baseSalary / (settings.hoursDivisor || 225), { decimals: false }), '')}
        </div>
      </div>
      <div class="income-hero__mix">${mixHTML(mix)}</div>
    </div>

    <div class="panes">
    <div class="pane">
      <div class="section-header"><span class="section-title" style="margin:0;">Kazanç dökümü</span></div>
      <div class="card">
        <div class="rows rows--receipt">
          <div class="row"><span class="row__label"><span class="dot" style="background:var(--mix-salary);"></span>Maaş</span><span class="row__leader"></span><span class="row__value">${formatMoney(summary.baseSalary, { decimals: false })}</span></div>
          ${overtimeRowsHTML(summary, settings)}
          ${summary.mealPay > 0 ? `<div class="row row--detail"><span class="row__label"><span class="dot" style="background:var(--mix-allowance);"></span>Yemek parası <span class="row__detail">${summary.allowanceDays} gün</span></span><span class="row__leader"></span><span class="row__value is-positive">+ ${formatMoney(summary.mealPay, { decimals: false })}</span></div>` : ''}
          ${summary.transportPay > 0 ? `<div class="row row--detail"><span class="row__label"><span class="dot" style="background:var(--mix-allowance);"></span>Yol parası <span class="row__detail">${summary.allowanceDays} gün</span></span><span class="row__leader"></span><span class="row__value is-positive">+ ${formatMoney(summary.transportPay, { decimals: false })}</span></div>` : ''}
          ${summary.extraIncome + summary.bonuses > 0 ? `<div class="row"><span class="row__label"><span class="dot" style="background:var(--mix-extra);"></span>Para girişi</span><span class="row__leader"></span><span class="row__value is-positive">+ ${formatMoney(summary.extraIncome + summary.bonuses, { decimals: false })}</span></div>` : ''}
          ${summary.deductions > 0 ? `<div class="row"><span class="row__label">Kesinti</span><span class="row__leader"></span><span class="row__value is-negative">− ${formatMoney(summary.deductions, { decimals: false })}</span></div>` : ''}
          <div class="row row--total"><span class="row__label">Dönem kazancın</span><span class="row__leader"></span><span class="row__value">${formatMoney(summary.earnedTotal)}</span></div>
          ${summary.advances > 0 ? `<div class="row"><span class="row__label">Avans olarak aldın</span><span class="row__leader"></span><span class="row__value is-negative">− ${formatMoney(summary.advances, { decimals: false })}</span></div>` : ''}
          ${summary.advances > 0 ? `<div class="row row--subtotal"><span class="row__label">Ödeme günü yatacak</span><span class="row__leader"></span><span class="row__value">${formatMoney(summary.payoutTotal)}</span></div>` : ''}
        </div>
      </div>

      <div class="section-header"><span class="section-title" style="margin:0;">Ek kalemler</span></div>
      <div class="card">
        <div class="adj-actions">
          ${adjButton('addIncome', 'income', 'Para girişi')}
          ${adjButton('addAdvance', 'advance', 'Avans')}
          ${adjButton('addDeduction', 'deduction', 'Kesinti')}
        </div>
        ${summary.adjustments.length === 0
    ? '<p class="field__hint" style="margin:14px 0 0;">Maaş dışında yatan ya da kesilen bir şey varsa buraya ekle; dönem hesabına girer.</p>'
    : `
          <div class="rows" id="adjustmentRows" style="margin-top:14px;">
            ${summary.adjustments.map((a) => {
      const plus = a.kind === 'bonus' || a.kind === 'income';
      return `
              <div class="row" data-adj-id="${a.id}">
                <span class="row__label"><span class="adj-tag adj-tag--${a.kind}">${adjustmentLabel(a.kind)}</span>${escapeHTML(a.label || '')}</span>
                <span class="row__value ${plus ? 'is-positive' : 'is-negative'}" style="display:flex; align-items:center; gap:10px;">
                  ${plus ? '+' : '−'} ${formatMoney(a.amount, { decimals: false })}
                  <button class="link-row__chevron" data-remove-adj="${a.id}" type="button" aria-label="Sil" style="line-height:0;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                  </button>
                </span>
              </div>`;
    }).join('')}
          </div>`}
      </div>
    </div>

    <div class="pane">
      ${payslipCardHTML(state, summary, settings)}

      <div class="section-header">
        <span class="section-title" style="margin:0;">Bu dönemin mesaileri</span>
        ${summary.entryCount > 0
    ? `<button class="section-header__link" id="seeAllEntries" type="button">Tümü (${summary.entryCount}) ›</button>`
    : ''}
      </div>
      ${summary.entries.length === 0
    ? '<div class="card empty"><div class="empty__title">Bu dönemde kayıt yok</div><div class="empty__sub">Sağ alttaki + ile mesai ekleyebilirsin.</div></div>'
    : `<ul class="list">${previewEntries(summary.entries).map((e) => entryRowHTML(e, settings)).join('')}</ul>`}
    </div>
    </div>
  `;

  mountPeriodNav(ctx, {
    label: periodLabel(periodKey),
    sub: `${summary.entryCount} kayıt · ${formatHours(summary.totalHours)}`,
    onPrev: () => ctx.setReportPeriod(shiftPeriod(periodKey, -1)),
    onNext: () => ctx.setReportPeriod(shiftPeriod(periodKey, 1)),
  });

  container.querySelector('#prevPeriod').addEventListener('click', () => ctx.setReportPeriod(shiftPeriod(periodKey, -1)));
  container.querySelector('#nextPeriod').addEventListener('click', () => ctx.setReportPeriod(shiftPeriod(periodKey, 1)));
  container.querySelector('#seeAllEntries')?.addEventListener('click', () => ctx.navigate({ tab: 'income', page: 'entries' }));

  container.querySelector('#addIncome').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'income'));
  container.querySelector('#addAdvance').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'advance'));
  container.querySelector('#addDeduction').addEventListener('click', () => openAdjustmentSheet(ctx.store, periodKey, 'deduction'));
  container.querySelector('#adjustmentRows')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-adj]');
    if (btn) ctx.store.removeAdjustment(btn.dataset.removeAdj);
  });

  container.querySelector('#payslipSaveBtn')?.addEventListener('click', () => {
    const amount = parseLocaleNumber(container.querySelector('#payslipAmount').value);
    const transport = parseLocaleNumber(container.querySelector('#payslipTransport').value);
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Cebine geçen net maaşı gir'); return; }
    ctx.store.setPayslip(periodKey, { amount, transport: Number.isFinite(transport) ? transport : undefined });
    showToast('Bordro kaydedildi');
  });
  container.querySelector('#payslipClearBtn')?.addEventListener('click', () => {
    ctx.store.removePayslip(periodKey);
    showToast('Bordro kaydı silindi');
  });
  container.querySelector('#payslipYearBtn')?.addEventListener('click', () => ctx.navigate({ tab: 'income', page: 'payslip' }));
  container.querySelector('#absenceLink')?.addEventListener('click', () => ctx.navigate({ tab: 'income', page: 'absences' }));
}

// Mesai satırları. Tek tür varsa "Mesai ücreti · 14 sa ×1,5" tek satırdır;
// birden fazla türde her tür ayrı satır, altında toplam. (Eskiden tür
// kırılımı ile toplam yan yana basılıyor, aynı para iki kez yazılmış
// görünüyordu.)
function overtimeRowsHTML(summary, settings) {
  const active = TYPE_ROWS.filter((t) => summary.byType[t.key].hours > 0);
  if (active.length === 0) return '';

  const dot = '<span class="dot" style="background:var(--mix-overtime);"></span>';
  if (active.length === 1) {
    const t = active[0];
    const detay = `${formatHours(summary.byType[t.key].hours)} ×${String(settings.multipliers[t.key]).replace('.', ',')}`;
    return `
      <div class="row row--detail">
        <span class="row__label">${dot}Mesai ücreti <span class="row__detail">${t.label.toLocaleLowerCase('tr-TR')} · ${detay}</span></span>
        <span class="row__leader"></span>
        <span class="row__value is-positive">+ ${formatMoney(summary.overtimePay, { decimals: false })}</span>
      </div>`;
  }

  return `
    ${active.map((t) => `
      <div class="row row--sub row--detail">
        <span class="row__label"><span class="dot dot--${t.key}"></span>${t.label} <span class="row__detail">${formatHours(summary.byType[t.key].hours)} ×${String(settings.multipliers[t.key]).replace('.', ',')}</span></span>
        <span class="row__leader"></span>
        <span class="row__value is-positive">+ ${formatMoney(summary.byType[t.key].amount, { decimals: false })}</span>
      </div>`).join('')}
    <div class="row row--detail">
      <span class="row__label">${dot}Mesai ücreti <span class="row__detail">${formatHours(summary.totalHours)}</span></span>
      <span class="row__leader"></span>
      <span class="row__value is-positive">+ ${formatMoney(summary.overtimePay, { decimals: false })}</span>
    </div>`;
}

// Kahramanın altındaki küçük gerçekler şeridi.
function fact(label, value, sub) {
  return `
    <div class="income-fact">
      <div class="income-fact__label">${label}</div>
      <div class="income-fact__value">${value}</div>
      ${sub ? `<div class="income-fact__sub">${sub}</div>` : ''}
    </div>`;
}

// Gelirin bileşimi: tek yığın çubuk + okunur bir liste. "Maaşım 45 bin"
// demek kolay; cebe girenin ne kadarı mesai, ne kadarı yemek-yol — asıl
// merak edilen bu.
function mixHTML(mix) {
  if (mix.total <= 0) {
    return '<div class="income-hero__empty">Bu dönem için henüz hesaplanacak bir gelir yok.</div>';
  }
  return `
    <div class="mix">
      <div class="mix__bar" role="img" aria-label="Gelir bileşimi">
        ${mix.parts.map((p) => `<span class="mix__seg" style="width:${p.pct}%; background:${p.color};" title="${p.label} %${p.pct}"></span>`).join('')}
      </div>
      <ul class="mix__legend">
        ${mix.parts.map((p) => `
          <li class="mix__item">
            <span class="dot" style="background:${p.color};"></span>
            <span class="mix__name">${p.label}</span>
            <span class="mix__pct">%${p.pct}</span>
            <span class="mix__amount">${formatMoney(p.amount, { decimals: false })}</span>
          </li>`).join('')}
      </ul>
    </div>`;
}

const ADJ_ICON = {
  income: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  advance: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  deduction: '<path d="M5 12h14"/>',
};

function adjButton(id, kind, label) {
  return `
    <button class="adj-btn adj-btn--${kind}" id="${id}" type="button">
      <span class="adj-btn__icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ADJ_ICON[kind]}</svg>
      </span>
      ${label}
    </button>`;
}

// --- Bordro karşılaştırma kartı ------------------------------------------

function payslipCardHTML(state, summary, settings) {
  const slip = payslipFor(state, summary.periodKey);
  const yearLink = '<button class="section-header__link" id="payslipYearBtn" type="button">Yıllık giriş ›</button>';

  if (!slip || !hasPayslipData(slip)) {
    return `
      <div class="section-header">
        <span class="section-title" style="margin:0;">Bordro karşılaştırma</span>${yearLink}
      </div>
      <div class="card">
        <p class="field__hint" style="margin:-2px 0 12px;">
          Ödeme günü hesaba <b>${formatMoney(summary.payoutTotal)}</b> yatmalı. Cebine geçeni yaz, tutuyor mu bakalım.
        </p>
        <div class="input-row">
          <div class="field">
            <label class="field__label">Net maaş (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="payslipAmount" placeholder="0" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field__label">Yol parası (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="payslipTransport" placeholder="${summary.transportPay > 0 ? Math.round(summary.transportPay) : '0'}" autocomplete="off" />
          </div>
        </div>
        <button class="btn btn--primary btn--sm" id="payslipSaveBtn" type="button">Karşılaştır</button>
      </div>
    `;
  }

  const cmp = comparePayslip(summary, slip, settings);
  const explanation = explainPayslipDiff(summary, cmp, settings);
  const durum = {
    match: { cls: 'is-positive', baslik: 'Tutuyor ✓', not: 'Ödenen tutar hesapla aynı.' },
    short: { cls: 'is-negative', baslik: `${formatMoney(Math.abs(cmp.diff))} eksik`, not: 'Ödenen tutar hesabın altında.' },
    over: { cls: 'is-positive', baslik: `${formatMoney(cmp.diff)} fazla`, not: 'Ödenen tutar hesabın üstünde.' },
  }[cmp.status];

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Bordro karşılaştırma</span>${yearLink}
    </div>
    <div class="card payslip payslip--${cmp.status}">
      <div class="payslip__head">
        <span class="payslip__title ${durum.cls}">${durum.baslik}</span>
        <button class="payslip__clear" id="payslipClearBtn" type="button">Sıfırla</button>
      </div>
      <div class="rows rows--receipt">
        ${cmp.lines.map((l) => `
          <div class="row">
            <span class="row__label">${l.label}</span>
            <span class="row__leader"></span>
            <span class="row__value">
              ${formatMoney(l.paid, { decimals: false })}
              <span class="payslip-line__diff ${Math.abs(l.diff) <= 1 ? '' : l.diff < 0 ? 'is-negative' : 'is-positive'}">
                ${Math.abs(l.diff) <= 1 ? '✓' : `${l.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(l.diff), { decimals: false })}`}
              </span>
            </span>
          </div>`).join('')}
        <div class="row"><span class="row__label">Hesaba göre</span><span class="row__leader"></span><span class="row__value">${formatMoney(cmp.expected)}</span></div>
        <div class="row row--total"><span class="row__label">Fark</span><span class="row__leader"></span><span class="row__value ${durum.cls}">${Math.abs(cmp.diff) <= 1 ? '—' : (cmp.diff > 0 ? '+' : '−') + formatMoney(Math.abs(cmp.diff))}</span></div>
      </div>
      ${checksHTML(cmp)}
      <p class="field__hint" style="margin:12px 0 0;">
        ${durum.not}${explanation ? ` <b style="color:var(--text-secondary);">${explanation}</b>` : ''}
      </p>
    </div>
  `;
}

// Saat ve gün kontrolü: para farkının SEBEBİ. Bordroda yazmıyorsa satır çıkmaz.
function checksHTML(cmp) {
  const parts = [];

  if (cmp.hours) {
    const h = cmp.hours;
    const cls = h.status === 'match' ? 'is-positive' : h.status === 'short' ? 'is-negative' : 'is-positive';
    const text = h.status === 'match'
      ? `Saat tutuyor: ${formatHours(h.appHours)}.`
      : `Sen ${formatHours(h.appHours)} girmişsin, bordroda ${formatHours(h.slipHours)} yazıyor — <b class="${cls}">${formatHours(Math.abs(h.diff))} ${h.diff < 0 ? 'sayılmamış' : 'fazla sayılmış'}</b>${Math.abs(h.money) >= 1 ? ` (≈${formatMoney(Math.abs(h.money), { decimals: false })})` : ''}.`;
    parts.push(`<div class="slip-check ${cls}"><span class="slip-check__key">Mesai saati</span><span>${text}</span></div>`);
  }

  if (cmp.dayCheck) {
    const d = cmp.dayCheck;
    const same = d.diff === 0;
    const cls = same ? 'is-positive' : 'is-negative';
    const text = same
      ? `Çalışılan gün tutuyor: ${d.slipDays} gün.`
      : `Uygulamaya göre ${d.appDays} gün, bordroda ${d.slipDays} gün — <b class="${cls}">${Math.abs(d.diff)} gün ${d.diff < 0 ? 'eksik' : 'fazla'}</b>. ${d.diff < 0 ? 'İzin ya da rapor işaretledin mi?' : ''}`;
    parts.push(`<div class="slip-check ${cls}"><span class="slip-check__key">Çalışılan gün</span><span>${text}${same ? '' : ' <button class="slip-check__link" id="absenceLink" type="button">Gelinmeyen günler ›</button>'}</span></div>`);
  }

  return parts.length ? `<div class="slip-checks">${parts.join('')}</div>` : '';
}

// --- Ek kalem sayfası -----------------------------------------------------

// 'bonus' artık eklenemiyor; eski kayıtlar para girişi olarak okunur.
const ADJ_LABEL = { advance: 'Avans', deduction: 'Kesinti', bonus: 'Para girişi', income: 'Para girişi' };

function adjustmentLabel(kind) {
  return ADJ_LABEL[kind] || kind;
}

function previewEntries(entries) {
  return [...entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, PREVIEW_COUNT);
}

function openAdjustmentSheet(store, periodKey, kind) {
  openSheet({
    title: adjustmentLabel(kind),
    footerHTML: '<button class="btn btn--primary" id="saveAdjBtn" type="button">Ekle</button>',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="field">
          <label class="field__label">Tutar (₺)</label>
          <input class="input input--amount" type="text" inputmode="decimal" id="adjAmount" placeholder="0" autocomplete="off" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Açıklama <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="adjLabel" placeholder="${adjustmentLabel(kind)}" />
        </div>
      `;
      setTimeout(() => bodyEl.querySelector('#adjAmount').focus(), 120);
      footerEl.querySelector('#saveAdjBtn').addEventListener('click', () => {
        const amount = parseLocaleNumber(bodyEl.querySelector('#adjAmount').value);
        if (!Number.isFinite(amount) || amount <= 0) { showToast('Geçerli bir tutar girmelisin'); return; }
        store.addAdjustment({ periodKey, kind, amount, label: bodyEl.querySelector('#adjLabel').value.trim() });
        showToast(`${adjustmentLabel(kind)} eklendi`);
        closeSheet();
      });
    },
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
