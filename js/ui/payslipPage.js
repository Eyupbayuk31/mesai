// Bordro: bir yılın tamamı tek ekranda.
//
// Kullanıcının akışı yılda bir kez oturup 12 ayı girmek. Dönem dönem gezip
// form açmak yerine tablo: her satırda cebe geçen net maaş, yol parası ve
// bordroda yazan çalışılan gün / mesai saati. Yanında uygulamanın beklediği
// tutar, fark ve o farkın akıbeti (soruldu mu, düzeldi mi, kabul mü).
// Detay isteyen satırdaki › ile diğer kalemleri (yemek, mesai, kesinti)
// de girer.

import { periodSummary } from '../payroll.js';
import { currentPeriodKey } from '../period.js';
import { formatMoney, formatHours, locative, parseLocaleNumber } from '../format.js';
import {
  PAYSLIP_LINES, comparePayslip, payslipFor, hasPayslipData, payslipStats, payslipLineTotals,
  payslipRows, openBalance, hoursCheck,
} from '../payslip.js';
import { mountPeriodNav } from './periodNav.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const EXTRA_LINES = PAYSLIP_LINES.filter((l) => l.key !== 'amount' && l.key !== 'transport');

// Bir eksiğin akıbeti. Rozete dokundukça sırayla ilerler.
const STATUSES = [
  { key: 'acik', label: 'Açık', hint: 'Henüz sorulmadı' },
  { key: 'soruldu', label: 'Soruldu', hint: 'Muhasebeye soruldu, cevap bekleniyor' },
  { key: 'duzeltildi', label: 'Düzeltildi', hint: 'Düzeltileceği söylendi' },
  { key: 'kabul', label: 'Kabul', hint: 'Fark bilinçli kabul edildi, alacak sayılmaz' },
];
const STATUS_BY_KEY = new Map(STATUSES.map((s) => [s.key, s]));

function nextStatus(key) {
  const i = STATUSES.findIndex((s) => s.key === (key || 'acik'));
  return STATUSES[(i + 1) % STATUSES.length].key;
}

// Tabloda girilen dört alan. Hepsi opsiyonel; hiçbiri girilmemişse kayıt yok.
const FIELDS = ['amount', 'transport', 'days', 'hours'];

export function render(container, state, ctx) {
  const year = ctx.payslipYear || Number((ctx.reportPeriodKey || currentPeriodKey()).slice(0, 4));
  ctx.payslipYear = year;

  const settings = state.settings;
  const periodKeys = MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const summaries = periodKeys.map((k) => periodSummary(state, k));
  const stats = payslipStats(state, summaries, settings);
  const lineTotals = payslipLineTotals(state, summaries, settings);
  const rows = payslipRows(state, summaries, settings);
  const byPeriod = new Map(rows.map((r) => [r.periodKey, r]));
  const balance = openBalance(rows);
  const thisPeriod = currentPeriodKey();

  // Masaüstünde ekran içindeki yıl kartı gizli; gezinme üst çubuğa taşınır.
  mountPeriodNav(ctx, {
    label: String(year),
    sub: statsLine(stats),
    onPrev: () => { ctx.payslipYear = year - 1; ctx.rerender(); },
    onNext: () => { ctx.payslipYear = year + 1; ctx.rerender(); },
  });

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

    ${heroHTML(balance, stats, year)}

    <p class="field__hint" style="margin:14px 0 10px;">
      Her ay cebine geçen net maaşı ve yol parasını yaz. Bordroda çalışılan gün ve
      fazla mesai saati de yazıyorsa onları da gir — fark çıkarsa <b>sebebini</b> o iki sütun söyler.
      Diğer kalemler için satırdaki <b>›</b>.
    </p>

    <div class="card">
      <p class="scroll-hint">Tabloyu sağa kaydırarak gün, saat ve fark sütunlarını görebilirsin.</p>
      <div class="year-table__scroll">
        <table class="year-table payslip-table">
          <thead>
            <tr>
              <th>Ay</th><th>Net maaş</th><th>Yol parası</th><th>Gün</th><th>Saat</th>
              <th>Beklenen</th><th>Fark</th><th>Durum</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${summaries.map((summary, i) => rowHTML(state, summary, i, thisPeriod, byPeriod, settings)).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-foot">
        <span class="table-foot__hint" id="saveHint">Değişiklikler kaydedilene kadar tutulmaz.</span>
        <button class="btn btn--primary btn--inline" id="savePayslips" type="button">Kaydet</button>
      </div>
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

  container.querySelector('#yearStrip')?.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-jump]');
    if (!cell) return;
    const input = container.querySelector(`[data-row="${cell.dataset.jump}"][data-field="amount"]`);
    if (!input) return;
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus({ preventScroll: true });
  });

  container.querySelector('#prevYear').addEventListener('click', () => { ctx.payslipYear = year - 1; ctx.rerender(); });
  container.querySelector('#nextYear').addEventListener('click', () => { ctx.payslipYear = year + 1; ctx.rerender(); });

  const saveAll = () => saveRows(container, ctx, state, periodKeys);

  container.querySelector('.payslip-table').addEventListener('click', (e) => {
    const detail = e.target.closest('[data-detail]');
    if (detail) {
      const index = Number(detail.dataset.detail);
      openLineSheet(ctx, summaries[index], readRow(container, index));
      return;
    }
    const badge = e.target.closest('[data-status-period]');
    if (badge) {
      // Rozet sayfayı yeniden çizdiği için önce tabloya yazılanlar kaydedilir;
      // yoksa girip de kaydetmediğin satırlar uçardı.
      saveAll();
      const periodKey = badge.dataset.statusPeriod;
      const next = nextStatus(badge.dataset.status);
      ctx.store.setPayslip(periodKey, { status: next });
      showToast(`${MONTHS[Number(periodKey.slice(5, 7)) - 1]}: ${STATUS_BY_KEY.get(next).label}`);
    }
  });

  container.querySelector('#savePayslips').addEventListener('click', () => {
    const { saved, cleared } = saveAll();
    showToast(saved > 0 ? `${saved} ay kaydedildi${cleared ? `, ${cleared} ay silindi` : ''}` : cleared ? `${cleared} ay silindi` : 'Değişiklik yok');
  });
}

// Tabloya yazılan her şeyi store'a geçirir. ÖNCE hepsi okunur: her kayıt
// store'u değiştirip sayfayı yeniden çizdiği için, yazarken okumaya devam
// etmek kalan satırların girdisini siliyordu.
function saveRows(container, ctx, state, periodKeys) {
  const rows = periodKeys.map((_, i) => readRow(container, i));
  let saved = 0;
  let cleared = 0;

  for (let i = 0; i < periodKeys.length; i += 1) {
    const periodKey = periodKeys[i];
    const row = rows[i];
    const existing = payslipFor(state, periodKey);
    const any = FIELDS.some((f) => Number.isFinite(row[f]));

    if (!any) {
      // Doluyken boşaltılmışsa kayıt silinir; hiç dolmamışsa kayıt üretilmez.
      if (existing && (hasPayslipData(existing) || Number.isFinite(Number(existing.days)) || Number.isFinite(Number(existing.hours)))) {
        ctx.store.removePayslip(periodKey);
        cleared += 1;
      }
      continue;
    }
    const payload = {};
    for (const f of FIELDS) payload[f] = Number.isFinite(row[f]) ? row[f] : undefined;
    ctx.store.setPayslip(periodKey, payload);
    saved += 1;
  }
  return { saved, cleared };
}

function heroHTML(balance, stats, year) {
  const alacak = balance.open > 1;
  const extras = [];
  if (balance.compensated > 1) extras.push(`${formatMoney(balance.compensated, { decimals: false })} sonraki ayda telafi edildi`);
  if (balance.accepted > 1) extras.push(`${formatMoney(balance.accepted, { decimals: false })} kabul edildi`);

  return `
    <div class="card income-hero">
      <div class="income-hero__main">
        <div class="income-hero__label">${year} yılından alacağın</div>
        <div class="income-hero__value ${alacak ? 'is-negative' : 'is-positive'}">${formatMoney(balance.open, { decimals: false })}</div>
        <div class="income-hero__meta">
          ${stats.checked === 0
    ? 'Aşağıdaki tabloya bordronu gir, uygulamanın hesabıyla karşılaştıralım.'
    : alacak
      ? 'Eksik yatan ve henüz kapanmayan tutar.'
      : 'Girilen aylarda açık kalan bir eksik yok.'}
          ${extras.length ? `<br><span style="color:var(--text-tertiary);">${extras.join(' · ')}</span>` : ''}
        </div>
        <div class="income-hero__facts">
          ${fact('Girilen ay', `${stats.checked} / 12`, '')}
          ${fact('Tuttu', String(stats.match), '')}
          ${fact('Eksik', String(stats.short), stats.over > 0 ? `${stats.over} ay fazla` : '')}
        </div>
      </div>
      <div class="income-hero__mix">${yearBarsHTML(stats)}</div>
    </div>`;
}

// Yılın 12 ayı tek bakışta: hangi ay girilmiş, tutmuş mu?
function yearBarsHTML(stats) {
  return `
    <div class="year-strip">
      <div class="year-strip__label">Aylar</div>
      <div class="year-strip__cells" id="yearStrip">
        ${MONTHS.map((m, i) => `
          <button class="year-cell year-cell--${stats.cells[i]}" type="button" data-jump="${i}" title="${m}: ${CELL_TITLE[stats.cells[i]]}">
            <span>${i + 1}</span>
          </button>`).join('')}
      </div>
      <div class="year-strip__legend">
        <span><i class="year-dot year-dot--match"></i>tuttu</span>
        <span><i class="year-dot year-dot--short"></i>eksik</span>
        <span><i class="year-dot year-dot--over"></i>fazla</span>
        <span><i class="year-dot year-dot--empty"></i>girilmedi</span>
      </div>
    </div>`;
}

const CELL_TITLE = { match: 'tuttu', short: 'eksik', over: 'fazla', empty: 'girilmedi' };

function fact(label, value, sub) {
  return `
    <div class="income-fact">
      <div class="income-fact__label">${label}</div>
      <div class="income-fact__value">${value}</div>
      ${sub ? `<div class="income-fact__sub">${sub}</div>` : ''}
    </div>`;
}

function statsLine(stats) {
  if (stats.checked === 0) return 'henüz bordro girilmedi';
  const parts = [`${stats.checked} ay girildi`];
  if (stats.match > 0) parts.push(`${stats.match} tuttu`);
  if (stats.short > 0) parts.push(`${stats.short} eksik`);
  if (stats.over > 0) parts.push(`${stats.over} fazla`);
  return parts.join(' · ');
}

function rowHTML(state, summary, index, thisPeriod, byPeriod, settings) {
  const slip = payslipFor(state, summary.periodKey) || {};
  const row = byPeriod.get(summary.periodKey) || null;
  const cmp = row || (hasPayslipData(slip) ? comparePayslip(summary, slip, settings) : null);
  const hrs = hoursCheck(summary, slip, settings);
  const future = summary.periodKey > thisPeriod;
  const dayDiff = cmp?.dayCheck?.diff;

  return `
    <tr class="${future ? 'is-future' : ''}">
      <td>${MONTHS[index]}</td>
      <td><input class="input input--amount payslip-cell" type="text" inputmode="decimal"
            data-row="${index}" data-field="amount" value="${numValue(slip.amount)}" placeholder="—" autocomplete="off" /></td>
      <td><input class="input input--amount payslip-cell" type="text" inputmode="decimal"
            data-row="${index}" data-field="transport" value="${numValue(slip.transport)}"
            placeholder="${summary.transportPay > 0 ? Math.round(summary.transportPay) : '—'}" autocomplete="off" /></td>
      <td>
        <input class="input input--amount payslip-cell payslip-cell--narrow" type="text" inputmode="decimal"
            data-row="${index}" data-field="days" value="${numValue(slip.days)}"
            placeholder="${summary.allowanceDays}" autocomplete="off" aria-label="${MONTHS[index]} bordroda yazan gün" />
        ${dayDiff ? `<div class="payslip-sub ${dayDiff < 0 ? 'is-negative' : 'is-positive'}">${dayDiff > 0 ? '+' : '−'}${Math.abs(dayDiff)} gün</div>` : ''}
      </td>
      <td>
        <input class="input input--amount payslip-cell payslip-cell--narrow" type="text" inputmode="decimal"
            data-row="${index}" data-field="hours" value="${numValue(slip.hours)}"
            placeholder="${summary.totalHours > 0 ? formatHours(summary.totalHours).replace(' sa', '') : '—'}" autocomplete="off" aria-label="${MONTHS[index]} bordroda yazan mesai saati" />
        ${hrs && hrs.status !== 'match'
    ? `<div class="payslip-sub ${hrs.diff < 0 ? 'is-negative' : 'is-positive'}">${hrs.diff > 0 ? '+' : '−'}${formatHours(Math.abs(hrs.diff))}</div>`
    : hrs ? '<div class="payslip-sub is-positive">saat tuttu</div>' : ''}
      </td>
      <td>${formatMoney(cmp?.payoutExpected ?? summary.payoutTotal, { decimals: false })}</td>
      <td>${diffCellHTML(cmp)}</td>
      <td>${statusCellHTML(row)}</td>
      <td><button class="payslip-detail" type="button" data-detail="${index}" aria-label="Diğer kalemler">›</button></td>
    </tr>
  `;
}

function diffCellHTML(cmp) {
  if (!cmp) return '<span style="color:var(--text-tertiary);">girilmedi</span>';
  if (Math.abs(cmp.diff) <= 1) {
    return `<span class="is-positive">tuttu ✓</span>${cmp.partial ? '<div class="payslip-sub">yalnız girilen kalemler</div>' : ''}`;
  }
  return `
    <span class="${cmp.diff < 0 ? 'is-negative' : 'is-positive'}">${cmp.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(cmp.diff), { decimals: false })}</span>
    ${cmp.partial ? '<div class="payslip-sub">yalnız girilen kalemler</div>' : ''}`;
}

// Durum yalnız eksik ödenen ayda anlamlı: fazla ya da tutan aya "soruldu mu"
// diye sormak gürültü olurdu.
function statusCellHTML(row) {
  if (!row) return '<span class="payslip-sub">—</span>';
  if (row.compensatedBy) {
    const month = MONTHS[Number(row.compensatedBy.slice(5, 7)) - 1];
    return `<span class="slip-badge slip-badge--done" title="${month} ayında fazla yatarak kapandı">↩ ${locative(month)} telafi</span>`;
  }
  if (row.diff >= -1) return '<span class="payslip-sub">—</span>';
  const status = STATUS_BY_KEY.get(row.status2) || STATUSES[0];
  return `<button class="slip-badge slip-badge--${status.key}" type="button"
            data-status-period="${row.periodKey}" data-status="${status.key}" title="${status.hint} · değiştirmek için dokun">${status.label}</button>`;
}

// Bir kalem bu ay için anlamlı mı? Hesaba göre bir karşılığı varsa ya da
// daha önce girilmişse gösterilir; yoksa "diğer kalemler"in altında durur.
function isRelevant(line, summary, slip) {
  if (slip[line.key] !== undefined && slip[line.key] !== null && slip[line.key] !== '') return true;
  return Number(line.expectedOf(summary)) > 0;
}

function lineFieldsHTML(lines, summary, slip) {
  return lines.map((line) => `
    <div class="field">
      <label class="field__label">${line.label} (₺)
        <span style="font-weight:500;color:var(--text-tertiary);">hesaba göre ${formatMoney(line.expectedOf(summary), { decimals: false })}</span>
      </label>
      <input class="input input--amount" type="text" inputmode="decimal" data-line="${line.key}"
        value="${numValue(slip[line.key])}" placeholder="0" autocomplete="off" />
    </div>
  `).join('');
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
  return { amount: get('amount'), transport: get('transport'), days: get('days'), hours: get('hours') };
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
        ${lineFieldsHTML(EXTRA_LINES.filter((l) => isRelevant(l, summary, slip)), summary, slip)}
        ${(() => {
          const rest = EXTRA_LINES.filter((l) => !isRelevant(l, summary, slip));
          if (rest.length === 0) return '';
          return `
            <button class="btn btn--ghost btn--sm" id="showExtraLines" type="button" style="margin-bottom:14px;">
              + Diğer kalemler (${rest.map((l) => l.label.toLocaleLowerCase('tr-TR')).join(', ')})
            </button>
            <div id="extraLines" hidden>${lineFieldsHTML(rest, summary, slip)}</div>`;
        })()}
        <div class="field" style="margin-bottom:0;">
          <label class="field__label">Not <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
          <input class="input" type="text" id="slipNote" value="${(slip.note || '').replace(/"/g, '&quot;')}" placeholder="ör. ikramiye ayrı yattı" />
        </div>
      `;

      // O ay karşılığı olmayan kalemler formu kirletmesin —
      // gerektiğinde tek dokunuşla açılır, kaydetme yolu ikisinde de aynı.
      bodyEl.querySelector('#showExtraLines')?.addEventListener('click', (e) => {
        bodyEl.querySelector('#extraLines').hidden = false;
        e.currentTarget.remove();
      });

      footerEl.querySelector('#saveLinesBtn').addEventListener('click', () => {
        const payload = {};
        for (const line of EXTRA_LINES) {
          const el = bodyEl.querySelector(`[data-line="${line.key}"]`);
          const raw = el.value.trim();
          payload[line.key] = raw === '' ? undefined : parseLocaleNumber(raw);
        }
        payload.note = bodyEl.querySelector('#slipNote').value.trim();
        // Tablodaki alanlar da birlikte yazılır ki kaydedilmemiş giriş kaybolmasın.
        for (const f of FIELDS) {
          if (Number.isFinite(tableRow[f])) payload[f] = tableRow[f];
        }
        ctx.store.setPayslip(summary.periodKey, payload);
        showToast('Bordro kalemleri kaydedildi');
        closeSheet();
      });
    },
  });
}
