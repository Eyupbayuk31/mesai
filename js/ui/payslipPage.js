// Bordro: bir yılın tamamı tek ekranda.
//
// Kullanıcının akışı yılda bir kez oturup 12 ayı girmek. Dönem dönem gezip
// form açmak yerine tablo: her satırda cebe geçen net maaş ve yol parası,
// yanında uygulamanın beklediği tutar ve fark. Detay isteyen satırdaki ›
// ile diğer kalemleri (yemek, mesai, prim, kesinti) de girer.

import { periodSummary } from '../payroll.js';
import { currentPeriodKey } from '../period.js';
import { formatMoney, parseLocaleNumber } from '../format.js';
import {
  PAYSLIP_LINES, comparePayslip, payslipFor, hasPayslipData, payslipStats, payslipLineTotals,
} from '../payslip.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const EXTRA_LINES = PAYSLIP_LINES.filter((l) => l.key !== 'amount' && l.key !== 'transport');

export function render(container, state, ctx) {
  const year = ctx.payslipYear || Number((ctx.reportPeriodKey || currentPeriodKey()).slice(0, 4));
  ctx.payslipYear = year;

  const periodKeys = MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const summaries = periodKeys.map((k) => periodSummary(state, k));
  const stats = payslipStats(state, summaries);
  const lineTotals = payslipLineTotals(state, summaries);
  const thisPeriod = currentPeriodKey();

  container.innerHTML = `
    <div class="period-card">
      <button class="period-card__nav" id="prevYear" type="button" aria-label="Önceki yıl">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${year}</div>
        <div class="period-card__sub">${statsLine(stats)}</div>
      </div>
      <button class="period-card__nav" id="nextYear" type="button" aria-label="Sonraki yıl">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p class="field__hint" style="margin:14px 0 10px;">
      Her ay cebine geçen net maaşı ve yol parasını yaz. Diğer kalemler için satırdaki <b>›</b>.
    </p>

    <div class="card">
      <div class="year-table__scroll">
        <table class="year-table payslip-table">
          <thead>
            <tr><th>Ay</th><th>Net maaş</th><th>Yol parası</th><th>Beklenen</th><th>Fark</th><th></th></tr>
          </thead>
          <tbody>
            ${summaries.map((summary, i) => rowHTML(state, summary, i, thisPeriod)).join('')}
          </tbody>
        </table>
      </div>
      <button class="btn btn--primary" id="savePayslips" type="button" style="margin-top:14px;">Kaydet</button>
    </div>

    ${lineTotals.length === 0 ? '' : `
    <div class="section-title">Kalem bazında ${year} toplamı</div>
    <div class="card">
      <div class="rows rows--receipt">
        ${lineTotals.map((t) => `
          <div class="row">
            <span class="row__label">${t.label} <span style="color:var(--text-tertiary);">${t.months} ay</span></span>
            <span class="row__leader"></span>
            <span class="row__value">
              ${formatMoney(t.paid, { decimals: false })}
              <span class="payslip-line__diff ${Math.abs(t.diff) <= 1 ? '' : t.diff < 0 ? 'is-negative' : 'is-positive'}">
                ${Math.abs(t.diff) <= 1 ? '✓' : `${t.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(t.diff), { decimals: false })}`}
              </span>
            </span>
          </div>`).join('')}
      </div>
      <p class="field__hint" style="margin:12px 0 0;">
        Beklenen tutarlar uygulamanın hesabı; fark, o kalemin yıl boyunca ne kadar eksik/fazla yattığı.
      </p>
    </div>`}
  `;

  container.querySelector('#prevYear').addEventListener('click', () => { ctx.payslipYear = year - 1; ctx.rerender(); });
  container.querySelector('#nextYear').addEventListener('click', () => { ctx.payslipYear = year + 1; ctx.rerender(); });

  container.querySelector('.payslip-table').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-detail]');
    if (!btn) return;
    const index = Number(btn.dataset.detail);
    openLineSheet(ctx, summaries[index], readRow(container, index));
  });

  container.querySelector('#savePayslips').addEventListener('click', () => {
    let saved = 0;
    let cleared = 0;
    // ÖNCE hepsi okunur: her kayıt store'u değiştirip sayfayı yeniden çizdiği
    // için, yazarken okumaya devam etmek kalan satırların girdisini siliyordu.
    const rows = periodKeys.map((_, i) => readRow(container, i));

    for (let i = 0; i < periodKeys.length; i += 1) {
      const periodKey = periodKeys[i];
      const row = rows[i];
      const existing = payslipFor(state, periodKey);
      const hasAmount = Number.isFinite(row.amount) && row.amount > 0;
      const hasTransport = Number.isFinite(row.transport);

      if (!hasAmount && !hasTransport) {
        // Doluyken boşaltılmışsa kayıt silinir; hiç dolmamışsa kayıt üretilmez.
        if (existing && hasPayslipData(existing)) { ctx.store.removePayslip(periodKey); cleared += 1; }
        continue;
      }
      ctx.store.setPayslip(periodKey, {
        amount: hasAmount ? row.amount : 0,
        transport: hasTransport ? row.transport : undefined,
      });
      saved += 1;
    }
    showToast(saved > 0 ? `${saved} ay kaydedildi${cleared ? `, ${cleared} ay silindi` : ''}` : cleared ? `${cleared} ay silindi` : 'Değişiklik yok');
  });
}

function statsLine(stats) {
  if (stats.checked === 0) return 'henüz bordro girilmedi';
  const parts = [`${stats.checked} ay girildi`, `${stats.match} tuttu`];
  if (stats.short > 0) parts.push(`${stats.short} eksik`);
  if (stats.over > 0) parts.push(`${stats.over} fazla`);
  if (Math.abs(stats.totalDiff) > 1) parts.push(`toplam ${stats.totalDiff > 0 ? '+' : '−'}${formatMoney(Math.abs(stats.totalDiff), { decimals: false })}`);
  return parts.join(' · ');
}

function rowHTML(state, summary, index, thisPeriod) {
  const slip = payslipFor(state, summary.periodKey) || {};
  const filled = hasPayslipData(slip);
  const cmp = filled ? comparePayslip(summary, slip) : null;
  const future = summary.periodKey > thisPeriod;

  return `
    <tr class="${future ? 'is-future' : ''}">
      <td>${MONTHS[index]}</td>
      <td><input class="input input--amount payslip-cell" type="text" inputmode="decimal"
            data-row="${index}" data-field="amount" value="${numValue(slip.amount)}" placeholder="0" autocomplete="off" /></td>
      <td><input class="input input--amount payslip-cell" type="text" inputmode="decimal"
            data-row="${index}" data-field="transport" value="${numValue(slip.transport)}"
            placeholder="${summary.transportPay > 0 ? Math.round(summary.transportPay) : '0'}" autocomplete="off" /></td>
      <td>${formatMoney(summary.payoutTotal, { decimals: false })}</td>
      <td>${cmp
    ? (Math.abs(cmp.diff) <= 1
      ? '<span class="is-positive">tuttu ✓</span>'
      : `<span class="${cmp.diff < 0 ? 'is-negative' : 'is-positive'}">${cmp.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(cmp.diff), { decimals: false })}</span>`)
    : '<span style="color:var(--text-tertiary);">girilmedi</span>'}</td>
      <td><button class="payslip-detail" type="button" data-detail="${index}" aria-label="Diğer kalemler">›</button></td>
    </tr>
  `;
}

function numValue(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).replace('.', ',');
}

function readRow(container, index) {
  const get = (field) => {
    const el = container.querySelector(`[data-row="${index}"][data-field="${field}"]`);
    if (!el || el.value.trim() === '') return NaN;
    return parseLocaleNumber(el.value);
  };
  return { amount: get('amount'), transport: get('transport') };
}

// --- Ayın diğer kalemleri ------------------------------------------------

function openLineSheet(ctx, summary, tableRow) {
  const state = ctx.store.getState();
  const slip = payslipFor(state, summary.periodKey) || {};

  openSheet({
    title: `${MONTHS[Number(summary.periodKey.slice(5, 7)) - 1]} bordrosu`,
    footerHTML: '<button class="btn btn--primary" id="saveLinesBtn" type="button">Kaydet</button>',
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          Bordroda ayrı yazan kalemleri gir; girmediklerin karşılaştırmaya katılmaz.
          Ödeme günü beklenen: <b>${formatMoney(summary.payoutTotal, { decimals: false })}</b>
        </p>
        ${EXTRA_LINES.map((line) => `
          <div class="field">
            <label class="field__label">${line.label} (₺)
              <span style="font-weight:500;color:var(--text-tertiary);">hesaba göre ${formatMoney(line.expectedOf(summary), { decimals: false })}</span>
            </label>
            <input class="input input--amount" type="text" inputmode="decimal" data-line="${line.key}"
              value="${numValue(slip[line.key])}" placeholder="0" autocomplete="off" />
          </div>
        `).join('')}
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Not <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="slipNote" value="${(slip.note || '').replace(/"/g, '&quot;')}" placeholder="ör. ikramiye ayrı yattı" />
        </div>
      `;

      footerEl.querySelector('#saveLinesBtn').addEventListener('click', () => {
        const payload = {};
        for (const line of EXTRA_LINES) {
          const el = bodyEl.querySelector(`[data-line="${line.key}"]`);
          const raw = el.value.trim();
          payload[line.key] = raw === '' ? undefined : parseLocaleNumber(raw);
        }
        payload.note = bodyEl.querySelector('#slipNote').value.trim();
        // Tablodaki iki alan da birlikte yazılır ki kaydedilmemiş giriş kaybolmasın.
        if (Number.isFinite(tableRow.amount)) payload.amount = tableRow.amount;
        if (Number.isFinite(tableRow.transport)) payload.transport = tableRow.transport;
        ctx.store.setPayslip(summary.periodKey, payload);
        showToast('Bordro kalemleri kaydedildi');
        closeSheet();
      });
    },
  });
}
