// Bordro: bir yılın tamamı tek ekranda.
//
// Kullanıcının akışı yılda bir kez oturup 12 ayı girmek. Dönem dönem gezip
// form açmak yerine tablo: her satırda cebe geçen net maaş, yol parası ve
// bordroda yazan çalışılan gün / mesai saati. Yanında uygulamanın beklediği
// tutar, fark ve o farkın akıbeti (soruldu mu, düzeldi mi, kabul mü).
// Detay isteyen satırdaki › ile diğer kalemleri (yemek, mesai, kesinti)
// de girer.

import { periodSummary, workdayBreakdown, hourlyRate } from '../payroll.js';
import { currentPeriodKey, periodLabel, shiftPeriod, payDateForPeriod, daysUntilPay } from '../period.js';
import { formatMoney, formatHours, formatDayMonthShort, formatFullDate, toISODate, locative, parseLocaleNumber } from '../format.js';
import {
  PAYSLIP_LINES, comparePayslip, explainPayslipDiff, payslipFor, hasPayslipData,
  payslipStats, payslipLineTotals, payslipRows, openBalance, hoursCheck,
  adjustForShortfall,
} from '../payslip.js';
import { mountPeriodNav } from './periodNav.js';
import { absenceDatesInPeriod } from '../absences.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';
import { payslipPeriodFor } from '../received.js';

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
// Yıllık tablonun sütunları. 'eksik' BİLEREK yok: tabloda okunmuyor, listeye
// eklense yıllık kaydet her seferinde onu undefined'a çekip silerdi.
// Eksik, ay görünümünde ve kalem sheet'inde giriliyor.
const FIELDS = ['amount', 'transport', 'days', 'hours'];

export function render(container, state, ctx) {
  // Günlük kullanımda ilgilendiğin tek ay var: 10'unda yatacak olan.
  // 12 aylık tablo "yılda bir otur hepsini gir" akışı için; ikinci sekmede.
  if (ctx.payslipFocus) ctx.payslipView = 'month';
  if (ctx.payslipView !== 'year') { renderMonth(container, state, ctx); return; }
  renderYear(container, state, ctx);
}

function viewSwitchHTML(active) {
  return `
    <div class="segmented" id="payslipView" style="margin-bottom:12px;">
      <button class="segmented__item ${active === 'month' ? 'is-active' : ''}" data-view="month" type="button">Bu ay</button>
      <button class="segmented__item ${active === 'year' ? 'is-active' : ''}" data-view="year" type="button">Yıllık giriş</button>
    </div>`;
}

function wireViewSwitch(container, ctx) {
  container.querySelector('#payslipView')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    ctx.payslipView = btn.dataset.view;
    ctx.rerender();
  });
}

// --- Tek ay görünümü ------------------------------------------------------
function renderMonth(container, state, ctx) {
  const settings = state.settings;
  // Odak: ayardaki ödeme kaydırmasına göre "parası şimdi yatacak/yatmış" ay.
  const periodKey = ctx.payslipMonth || ctx.payslipFocus || payslipPeriodFor(settings, currentPeriodKey());
  ctx.payslipMonth = periodKey;
  ctx.payslipFocus = null;

  const summary = periodSummary(state, periodKey);
  const slip = payslipFor(state, periodKey) || {};
  const filled = hasPayslipData(slip);
  const cmp = filled ? comparePayslip(summary, slip, settings) : null;
  const explanation = cmp ? explainPayslipDiff(summary, cmp, settings) : '';
  const breakdown = workdayBreakdown(periodKey, settings, absenceDatesInPeriod(state, periodKey));
  const payDate = payDateForPeriod(periodKey, settings);
  const left = daysUntilPay(periodKey, settings);
  const whenText = left > 0 ? `${left} gün kaldı` : left === 0 ? 'bugün' : `${Math.abs(left)} gün önce yattı`;

  const durum = cmp && {
    match: { cls: 'is-positive', baslik: 'Tutuyor ✓', not: 'Ödenen tutar hesapla aynı.' },
    short: { cls: 'is-negative', baslik: `${formatMoney(Math.abs(cmp.diff))} eksik`, not: 'Ödenen tutar hesabın altında.' },
    over: { cls: 'is-positive', baslik: `${formatMoney(cmp.diff)} fazla`, not: 'Ödenen tutar hesabın üstünde.' },
  }[cmp.status];

  mountPeriodNav(ctx, {
    label: periodLabel(periodKey),
    sub: `${formatFullDate(toISODate(payDate))} · ${whenText}`,
    onPrev: () => { ctx.payslipMonth = shiftPeriod(periodKey, -1); ctx.rerender(); },
    onNext: () => { ctx.payslipMonth = shiftPeriod(periodKey, 1); ctx.rerender(); },
  });

  container.innerHTML = `
    ${viewSwitchHTML('month')}

    <div class="period-card">
      <button class="period-card__nav" id="prevMonth" type="button" aria-label="Önceki ay">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub"><b>${formatFullDate(toISODate(payDate))}</b> · ${whenText}</div>
      </div>
      <button class="period-card__nav" id="nextMonth" type="button" aria-label="Sonraki ay">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    ${durum ? `
    <div class="card card--bordro">
      <div class="hero">
        <div class="hero__label">${periodLabel(periodKey)} bordrosu</div>
        <div class="hero__value ${durum.cls}">${durum.baslik}</div>
        <div class="hero__sub">hesaba göre ${formatMoney(cmp.expected, { decimals: false })} · yatan ${formatMoney(cmp.paid, { decimals: false })}</div>
        ${cmp.shortfall ? `<p class="hero__note" style="opacity:.85;">
          ${formatHours(cmp.shortfall.hours)} eksik saat için ${formatMoney(cmp.shortfall.cost, { decimals: false })}
          maaştan düşülerek hesaplandı.</p>` : ''}
        ${explanation ? `<p class="hero__note">${explanation}</p>` : ''}
      </div>
    </div>` : ''}

    <div class="section-header">
      <span class="section-title" style="margin:0;">Cebine ne geçti</span>
      <span class="section-header__note">hesaba göre ${formatMoney(summary.payoutTotal, { decimals: false })}</span>
    </div>
    <div class="card">
      <p class="field__hint" style="margin:-2px 0 14px;">
        Bordroda yazan tutarları gir; boş bıraktığın kalem karşılaştırmaya girmez.
      </p>
      ${lineFieldsHTML(PAYSLIP_LINES, summary, slip)}
      <div class="input-row">
        <div class="field">
          <label class="field__label">Çalışılan gün <span style="font-weight:500;color:var(--text-tertiary);">hesaba göre ${breakdown.workdays}</span></label>
          <input class="input input--amount" type="text" inputmode="decimal" id="monthDays" value="${numValue(slip.days)}" placeholder="0" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field__label">Mesai saati <span style="font-weight:500;color:var(--text-tertiary);">hesaba göre ${formatHours(summary.totalHours)}</span></label>
          <input class="input input--amount" type="text" inputmode="decimal" id="monthHours" value="${numValue(slip.hours)}" placeholder="0" autocomplete="off" />
        </div>
      </div>
      ${/* Eksik saat bordronun kendi sütunu ve doğrudan maaştan para
           kesiyor. Uygulama bunu hesaplayamaz (mesai takip ediyoruz, giriş
           saati değil), o yüzden bordrodan okunup giriliyor. */''}
      <div class="field">
        <label class="field__label">Eksik saat <span style="font-weight:500;color:var(--text-tertiary);">geç kalma · maaştan kesilir</span></label>
        <input class="input input--amount" type="text" inputmode="decimal" id="monthEksik" value="${numValue(slip.eksik)}" placeholder="0" autocomplete="off" />
        <div class="field__hint" id="eksikHint">${eksikHintText(slip.eksik, settings, periodKey)}</div>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label class="field__label">Not <span style="font-weight:500;color:var(--text-tertiary);">(opsiyonel)</span></label>
        <input class="input" type="text" id="monthNote" value="${(slip.note || '').replace(/"/g, '&quot;')}" placeholder="ör. ikramiye ayrı yattı" />
      </div>
      ${/* Girilenlerin canlı toplamı. Olmadığında en sık hata görünmüyordu:
           bordronun EN ALT satırını "Net maaş"a yazıp yol ve mesaiyi de ayrıca
           girmek. O zaman ikisi iki kez sayılıyor ve sebebi anlaşılmadan
           "fazla yatmış" çıkıyor. */''}
      <div class="preview-strip" style="margin:14px 0 0;">
        <span class="preview-strip__label">Girilenlerin toplamı</span>
        <span class="preview-strip__value" id="slipSum">—</span>
      </div>
      <div class="field__hint" id="slipSumHint" style="margin-top:6px;"></div>
      <div class="table-foot">
        ${filled ? '<button class="btn btn--ghost btn--inline" id="monthClear" type="button">Bu ayı sil</button>' : '<span class="table-foot__hint">Kaydedene kadar tutulmaz.</span>'}
        <button class="btn btn--primary btn--inline" id="monthSave" type="button">Kaydet</button>
      </div>
    </div>

    <div class="section-header"><span class="section-title" style="margin:0;">Gün hesabı</span></div>
    <div class="card">${dayBreakdownHTML(breakdown)}</div>
  `;

  wireViewSwitch(container, ctx);
  container.querySelector('#prevMonth').addEventListener('click', () => { ctx.payslipMonth = shiftPeriod(periodKey, -1); ctx.rerender(); });
  container.querySelector('#nextMonth').addEventListener('click', () => { ctx.payslipMonth = shiftPeriod(periodKey, 1); ctx.rerender(); });

  container.querySelector('#monthSave').addEventListener('click', () => {
    const payload = {};
    for (const line of PAYSLIP_LINES) {
      const raw = container.querySelector(`[data-line="${line.key}"]`).value.trim();
      payload[line.key] = raw === '' ? undefined : parseLocaleNumber(raw);
    }
    const num = (id) => {
      const raw = container.querySelector(id).value.trim();
      return raw === '' ? undefined : parseLocaleNumber(raw);
    };
    payload.days = num('#monthDays');
    payload.hours = num('#monthHours');
    payload.eksik = num('#monthEksik');
    payload.note = container.querySelector('#monthNote').value.trim();
    ctx.store.setPayslip(periodKey, payload);
    showToast(`${periodLabel(periodKey)} bordrosu kaydedildi`);
  });

  container.querySelector('#monthClear')?.addEventListener('click', () => {
    ctx.store.removePayslip(periodKey);
    showToast('Bordro kaydı silindi');
  });

  wireLiveSum(container, summary, settings, periodKey);

  requestAnimationFrame(() => container.querySelector('[data-line="amount"]')?.focus({ preventScroll: true }));
}

// --- Yıllık giriş ---------------------------------------------------------
function renderYear(container, state, ctx) {
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
    ${viewSwitchHTML('year')}

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

  // Özet'teki "bordronu gir" hatırlatmasından gelindiyse doğrudan o ayın
  // tutar alanına in. Tek seferlik: sayfa her yeniden çizildiğinde tekrar
  // zıplamasın diye bayrak hemen temizlenir.
  if (ctx.payslipFocus) {
    const index = periodKeys.indexOf(ctx.payslipFocus);
    ctx.payslipFocus = null;
    if (index >= 0) {
      const input = container.querySelector(`[data-row="${index}"][data-field="amount"]`);
      if (input) requestAnimationFrame(() => {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus({ preventScroll: true });
      });
    }
  }

  wireViewSwitch(container, ctx);
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
  const breakdown = workdayBreakdown(summary.periodKey, settings, absenceDatesInPeriod(state, summary.periodKey));
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
            placeholder="${summary.allowanceDays}" autocomplete="off"
            title="${breakdown.summaryLine}" aria-label="${MONTHS[index]} bordroda yazan gün" />
        ${dayDiff
    ? `<div class="payslip-sub ${dayDiff < 0 ? 'is-negative' : 'is-positive'}">${dayDiff > 0 ? '+' : '−'}${Math.abs(dayDiff)} gün</div>`
    : breakdown.holidays.length + breakdown.absences.length > 0
      ? `<div class="payslip-sub">${breakdown.scheduledDays} − ${dayMinusLabel(breakdown)}</div>`
      : ''}
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
        ${/* "Net maaş" artık-toplam kalemi: beklenen tutarı diğer kalemlere
             bağlı olduğu için sabit bir sayı yazılamaz. Onun yerine, o an
             hangi kalemler doluysa ona göre NE YAZILMASI gerektiği
             söyleniyor — alanın iki farklı anlamı olması en sık yapılan
             giriş hatasının kaynağıydı. */''}
        ${line.remainder ? '' : `<span style="font-weight:500;color:var(--text-tertiary);">hesaba göre ${formatMoney(line.expectedOf(summary), { decimals: false })}</span>`}
      </label>
      <input class="input input--amount" type="text" inputmode="decimal" data-line="${line.key}"
        value="${numValue(slip[line.key])}" placeholder="0" autocomplete="off" />
      ${line.remainder ? '<div class="field__hint" id="amountHint"></div>' : ''}
    </div>
  `).join('');
}

// "26 − 7 tatil" gibi kısa özet; hücrenin altına sığması gerekiyor.
function dayMinusLabel(breakdown) {
  const parts = [];
  if (breakdown.holidays.length > 0) parts.push(`${breakdown.holidays.length} tatil`);
  if (breakdown.absences.length > 0) parts.push(`${breakdown.absences.length} izin`);
  return parts.join(' − ');
}

// Kalem sayfasındaki "Gün hesabı": sayının nereden geldiği tarih tarih yazar.
function dayBreakdownHTML(breakdown) {
  if (breakdown.holidays.length === 0 && breakdown.absences.length === 0 && breakdown.eveWorkdays.length === 0) {
    return `<p class="field__hint" style="margin:-4px 0 14px;">Bu ay resmi tatil yok: <b>${breakdown.workdays} iş günü</b>.</p>`;
  }
  return `
    <div class="day-calc">
      <div class="day-calc__line">${breakdown.summaryLine}</div>
      ${breakdown.holidays.map((h) => `
        <div class="day-calc__row">
          <span>${formatDayMonthShort(h.date)}</span>
          <span>${h.name}${h.eve ? ' <i>(yarım gün)</i>' : ''}</span>
        </div>`).join('')}
      ${breakdown.absences.map((date) => `
        <div class="day-calc__row">
          <span>${formatDayMonthShort(date)}</span>
          <span>Gelinmedi</span>
        </div>`).join('')}
      ${breakdown.eveWorkdays.map((h) => `
        <div class="day-calc__row is-worked">
          <span>${formatDayMonthShort(h.date)}</span>
          <span>${h.name} — çalışıldı, iş günü sayıldı</span>
        </div>`).join('')}
    </div>`;
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
  const breakdown = workdayBreakdown(summary.periodKey, state.settings, absenceDatesInPeriod(state, summary.periodKey));

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
        <div class="field">
          <label class="field__label">Eksik saat <span style="font-weight:500;color:var(--text-tertiary);">geç kalma · maaştan kesilir</span></label>
          <input class="input input--amount" type="text" inputmode="decimal" id="sheetEksik" value="${numValue(slip.eksik)}" placeholder="0" autocomplete="off" />
          <div class="field__hint">${eksikHintText(slip.eksik, state.settings, summary.periodKey)}</div>
        </div>

        <div class="section-title" style="margin-top:4px;">Gün hesabı</div>
        ${dayBreakdownHTML(breakdown)}

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
        const eksikRaw = bodyEl.querySelector('#sheetEksik').value.trim();
        payload.eksik = eksikRaw === '' ? undefined : parseLocaleNumber(eksikRaw);
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

/**
 * Eksik saatin para karşılığı. Kesinti ÇIPLAK saat ücretinden yapılır —
 * çalışılmayan saat fazla çalışma değildir, mesai çarpanı uygulanmaz.
 */
function eksikHintText(eksik, settings, periodKey) {
  const hours = Number(String(eksik ?? '').replace(',', '.'));
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'Bordrodaki “Eksik” sütununun ay toplamı. Maaştan çıplak saat ücretiyle kesilir.';
  }
  const cost = hours * hourlyRate(settings, periodKey);
  return `${formatHours(hours)} × ${formatMoney(hourlyRate(settings, periodKey))} = <b>${formatMoney(cost, { decimals: false })}</b> maaştan kesilir.`;
}

/**
 * Girilenlerin canlı toplamı.
 *
 * En sık yapılan giriş hatasını görünür kılmak için var: bordronun EN ALT
 * satırını ("net kazanç") Net maaş alanına yazıp yol ve mesaiyi de ayrıca
 * girmek. O alt toplam ikisini zaten içerdiği için hepsi iki kez sayılıyor
 * ve sebebi anlaşılmadan "fazla yatmış" çıkıyordu.
 */
function wireLiveSum(container, summary, settings, periodKey) {
  const sumEl = container.querySelector('#slipSum');
  const hintEl = container.querySelector('#slipSumHint');
  const amountHint = container.querySelector('#amountHint');
  const eksikEl = container.querySelector('#monthEksik');
  const eksikHint = container.querySelector('#eksikHint');
  if (!sumEl) return;

  const read = (key) => {
    const el = container.querySelector(`[data-line="${key}"]`);
    const raw = el ? el.value.trim() : '';
    if (raw === '') return null;
    const v = parseLocaleNumber(raw);
    return Number.isFinite(v) ? v : null;
  };

  const refresh = () => {
    let total = 0;
    let others = 0;
    let othersFilled = 0;
    let filled = 0;
    for (const line of PAYSLIP_LINES) {
      const v = read(line.key);
      if (v === null) continue;
      filled += 1;
      const signed = line.negative ? -v : v;
      total += signed;
      if (line.key !== 'amount') { others += signed; othersFilled += 1; }
    }

    // Hedef, eksik saat girildiği anda düşmeli — yoksa canlı ipucu bir sayı,
    // kaydedince çıkan karşılaştırma başka bir sayı söylüyordu.
    const eksikSaat = parseLocaleNumber(String(eksikEl?.value ?? '').trim() || '0');
    const hedefSummary = Number.isFinite(eksikSaat) && eksikSaat > 0
      ? adjustForShortfall(summary, eksikSaat, settings)
      : summary;
    const hedef = Number(hedefSummary?.payoutTotal) || 0;
    sumEl.textContent = filled === 0 ? '—' : formatMoney(total, { decimals: false });

    // Alanın anlamı girilen kalemlere göre değişiyor; ne yazılacağını söyle.
    if (amountHint) {
      const kalan = hedef - others;
      if (othersFilled === 0) {
        amountHint.innerHTML = 'Hiçbir kalem girmediysen buraya <b>cebine geçen toplamı</b> yaz (bordroda “net kazanç”).';
      } else if (kalan < 0) {
        // Negatif kalan neredeyse her zaman tek bir şey demek: avans girilmemiş
        // ya da buraya alt toplam yazılmış. Eksi bir lira tutarı basmak
        // yardımcı olmaz, ne yapılacağını söylemek yardımcı olur.
        amountHint.innerHTML = `Buraya <b>yalnız maaş satırı</b> gelmeli (bordroda
          “Normal Ücreti”) — yol ve mesai ayrı ayrı yazılı. Girilen kalemler
          şimdiden hedefi aşıyor; avansı girmeyi unutmuş olabilirsin.`;
      } else {
        amountHint.innerHTML = `Diğer kalemleri girdiğin için buraya <b>yalnız maaş satırı</b>
          gelmeli (bordroda “Normal Ücreti”) — yol ve mesai ayrı ayrı yazılı, tekrar
          sayılmasın. Bu kalemlerle beklenen: <b>${formatMoney(kalan, { decimals: false })}</b>.`;
      }
    }

    if (filled === 0) {
      hintEl.innerHTML = `Bu toplam ödeme günü hesabına yatan tutara eşit olmalı:
        <b>${formatMoney(hedef, { decimals: false })}</b>.`;
    } else {
      const fark = total - hedef;
      const yakin = Math.abs(fark) <= 1;
      hintEl.innerHTML = `Hedef <b>${formatMoney(hedef, { decimals: false })}</b> — ${yakin
        ? 'tutuyor.'
        : `şu an ${formatMoney(Math.abs(fark), { decimals: false })} ${fark > 0 ? 'fazla' : 'eksik'}.`}`;
    }

    // Avans girilmemişken kalemler tek tek giriliyorsa toplam kaçınılmaz
    // olarak avans kadar yüksek çıkar. En sık karışan yer burası.
    if (othersFilled > 0 && read('advance') === null && Number(summary?.advances) > 0) {
      hintEl.innerHTML += `<br><b>Avans alanı boş.</b> Bordroda
        ${formatMoney(summary.advances, { decimals: false })} avans yazıyor; onu da
        girmezsen toplam o kadar yüksek kalır.`;
    }

    if (eksikHint && eksikEl) eksikHint.innerHTML = eksikHintText(eksikEl.value, settings, periodKey);
  };

  container.querySelectorAll('[data-line]').forEach((el) => el.addEventListener('input', refresh));
  eksikEl?.addEventListener('input', refresh);
  refresh();
}
