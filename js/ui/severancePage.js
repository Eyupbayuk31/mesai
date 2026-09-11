// Tazminat hesabı: net maaştan kıdem, ihbar ve izin ücreti.
//
// Kullanıcının bildiği tek sayı cebine geçen net maaş; tazminatın tamamı ise
// brüt üzerinden hesaplanıyor. Sayfanın işi bu iki dünyayı birbirine
// bağlamak ve ARADAKİ HER ADIMI göstermek — "şu kadar alırsın" deyip
// geçmek, yanlış çıktığında fark edilmeyen bir hesap demek.
//
// Sayfanın iki yerde bilerek temkinli olduğu nokta var:
//   1. Çıkış şekli. Tazminatın olup olmadığını belirleyen asıl girdi bu;
//      istifada kıdem de ihbar da doğmaz. Varsayılan bir şey seçip sessizce
//      para göstermek yerine kullanıcıya açıkça sorduruyoruz.
//   2. Vergi parametreleri. Yıldan yıla (tavan yılda iki kez) değişiyorlar;
//      hangi yılın tablosuyla hesaplandığı ekranda yazıyor ve düzenlenebiliyor.

import { formatMoney, parseLocaleNumber, todayISO } from '../format.js';
import { currentPeriodKey } from '../period.js';
import { workdaysForPeriod } from '../payroll.js';
import { leaveLedger } from '../leave.js';
import { absenceDatesInPeriod } from '../absences.js';
import {
  taxParamsFor, DEFAULT_TAX_PARAMS, severanceReport, seniorityText, netToGross,
} from '../severance.js';
import { openSheet, closeSheet } from './sheet.js';
import { showToast } from './toast.js';
import { commitNumberOnChange } from './settings/shared.js';

export const title = 'Tazminat hesapla';

// Çıkış şekli tazminat hakkını belirler. Etiketler İş Kanunu'ndaki hâllerin
// günlük karşılığı; hangi hakkın neden doğduğu satırın altında yazılı.
const REASONS = [
  {
    key: 'isveren',
    label: 'İşveren çıkardı',
    hint: 'Performans, işten çıkarma, işyeri kapanması — haklı sebep gösterilmeden',
    kidem: true, ihbar: true,
  },
  {
    key: 'hakli-istifa',
    label: 'Haklı sebeple istifa ettim',
    hint: 'Ücret ödenmedi, mobbing, şartlar ağırlaştı (İş K. md. 24)',
    kidem: true, ihbar: false,
  },
  {
    key: 'askerlik-emeklilik',
    label: 'Askerlik · emeklilik · evlilik',
    hint: 'Askerlik, emeklilik ya da kadın işçinin evlilikten sonraki 1 yıl içindeki ayrılışı',
    kidem: true, ihbar: false,
  },
  {
    key: 'istifa',
    label: 'İstifa ettim',
    hint: 'Kendi isteğiyle, haklı sebep olmadan — kıdem de ihbar da doğmaz',
    kidem: false, ihbar: false,
  },
  {
    key: 'isveren-hakli',
    label: 'İşveren haklı sebeple çıkardı',
    hint: 'Ahlak ve iyi niyet kurallarına aykırılık (İş K. md. 25/II) — tazminatsız',
    kidem: false, ihbar: false,
  },
];

const reasonOf = (key) => REASONS.find((r) => r.key === key) || REASONS[0];

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Formun ilk hâli. Uygulamanın zaten bildiği her şey doldurulur: işe giriş
 * tarihi, net maaş, yemek/yol ve kullanılmayan izin günü. Kullanıcı yalnız
 * çıkış tarihini ve sebebini seçsin diye.
 */
function initialForm(state) {
  const settings = state.settings || {};
  const periodKey = currentPeriodKey();
  const workdays = workdaysForPeriod(periodKey, settings, absenceDatesInPeriod(state, periodKey));
  const fringe = (Number(settings.mealAllowance) || 0) * workdays
    + (Number(settings.transportAllowance) || 0) * workdays;
  const ledger = leaveLedger(state, settings, todayISO());

  // İzin günü BİLEREK doldurulmaz. Defterin "kalan"ı, kullanılan izin hiç
  // işaretlenmediğinde "hak edilen"e eşit çıkıyor (7 yıllık kıdemde 116 gün)
  // ve tazminat toplamını tek başına domine ediyor. Uygulamanın gerçekten
  // bildiği tek şey hak ediş; kullanılanı bilmiyorsa kalanı da bilmiyor
  // demektir. Sayı öneri olarak sunulur, kullanıcı dokununca girer.
  const suggestLeave = ledger.hasHireDate && ledger.totalUsed > 0 ? ledger.remaining : 0;

  return {
    salaryMode: 'net',
    salary: Number(settings.monthlySalary) || 0,
    useFringe: fringe > 0,
    fringe: Math.round(fringe),
    hireDate: settings.hireDate || '',
    endDate: todayISO(),
    reason: 'isveren',
    leaveDays: suggestLeave,
    // Defterin hesabı — öneri olarak gösterilir.
    ledgerLeave: ledger.hasHireDate ? ledger.remaining : 0,
    ledgerTracked: ledger.totalUsed > 0,
  };
}

export function render(container, state, ctx) {
  if (!ctx.severanceForm) ctx.severanceForm = initialForm(state);
  const form = ctx.severanceForm;
  const params = taxParamsFor(state.settings);
  const reason = reasonOf(form.reason);

  const gross = form.salaryMode === 'gross' ? form.salary : 0;
  const net = form.salaryMode === 'net' ? form.salary : 0;
  const report = severanceReport({
    netSalary: net,
    grossSalary: gross,
    fringeMonthly: form.useFringe ? form.fringe : 0,
    hireDate: form.hireDate,
    endDate: form.endDate,
    severanceEligible: reason.kidem,
    noticeEligible: reason.ihbar,
    leaveDays: form.leaveDays,
  }, params);

  const ready = form.salary > 0 && !!form.hireDate && !!report.seniority;

  container.innerHTML = `
    <div class="panes">
      <div class="pane">
        ${inputCardHTML(form, reason)}
      </div>
      <div class="pane">
        ${ready ? resultHTML(report, reason) : notReadyHTML(form)}
        ${ready ? payrollCardHTML(report, form) : ''}
        ${paramsCardHTML(params, state)}
      </div>
    </div>
  `;

  wire(container, state, ctx, form);
}

// --- Giriş ----------------------------------------------------------------

function inputCardHTML(form, reason) {
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Bilgiler</span></div>
    <div class="card">
      <div class="segmented" id="salaryMode" style="margin-bottom:14px;">
        <button class="segmented__item ${form.salaryMode === 'net' ? 'is-active' : ''}" data-mode="net" type="button">Net maaş</button>
        <button class="segmented__item ${form.salaryMode === 'gross' ? 'is-active' : ''}" data-mode="gross" type="button">Brüt maaş</button>
      </div>
      <div class="field" style="margin-bottom:14px;">
        <label class="field__label">Aylık ${form.salaryMode === 'net' ? 'net' : 'brüt'} maaş (₺)</label>
        <input class="input" type="text" inputmode="decimal" id="salaryInput" value="${form.salary || ''}" placeholder="ör. 50000" />
        <div class="field__hint">${form.salaryMode === 'net'
    ? 'Cebine geçen tutar. Brütü ve tüm kesintiler aşağıda hesaplanır.'
    : 'Bordroda yazan çıplak brüt ücret.'}</div>
      </div>

      <div class="switch-row">
        <div>
          <div class="switch-row__label">Yemek ve yolu ekle</div>
          <div class="switch-row__hint">Kıdem ve ihbar “giydirilmiş” ücretten hesaplanır</div>
        </div>
        <button class="switch ${form.useFringe ? 'is-on' : ''}" id="fringeSwitch" type="button" aria-label="Yemek ve yolu ekle"></button>
      </div>
      ${form.useFringe ? `
      <div class="field" style="margin:12px 0 14px;">
        <label class="field__label">Aylık yemek + yol (₺)</label>
        <input class="input" type="text" inputmode="decimal" id="fringeInput" value="${form.fringe || ''}" placeholder="ör. 6000" />
        <div class="field__hint">Ayarlardaki günlük tutarların bu ayın iş günüyle çarpımı geldi; düzenleyebilirsin.</div>
      </div>` : '<div style="height:14px;"></div>'}

      <div class="input-row">
        <div class="field" style="margin-bottom:14px;">
          <label class="field__label">İşe giriş</label>
          <input class="input" type="date" id="hireInput" value="${esc(form.hireDate)}" />
        </div>
        <div class="field" style="margin-bottom:14px;">
          <label class="field__label">İşten çıkış</label>
          <input class="input" type="date" id="endInput" value="${esc(form.endDate)}" />
        </div>
      </div>

      <div class="field" style="margin-bottom:14px;">
        <label class="field__label">Kullanılmayan yıllık izin (gün)</label>
        <input class="input" type="text" inputmode="numeric" id="leaveInput" value="${form.leaveDays || ''}" placeholder="0" />
        <div class="field__hint">${leaveHintHTML(form)}</div>
      </div>

      <div class="field" style="margin-bottom:0;">
        <label class="field__label">Çıkış şekli</label>
        <button class="select-row" id="reasonBtn" type="button">
          <span>${esc(reason.label)}</span>
          <span class="link-row__chevron">›</span>
        </button>
        <div class="field__hint">${esc(reason.hint)}</div>
      </div>
    </div>`;
}

/**
 * İzin alanının ipucu. Defterin sayısı ancak kullanılan izinler
 * işaretlenmişse bir şey ifade eder; işaretlenmemişse "hak edilen"in
 * kendisidir ve kalan izin diye sunulamaz.
 */
function leaveHintHTML(form) {
  const n = form.ledgerLeave || 0;
  if (!n) return 'Çıkışta ödenecek, kullanılmamış izin günü sayısı.';
  if (form.ledgerTracked) {
    return `Gelinmeyen günler sayfasındaki kalan izninden geldi (${n} gün).`;
  }
  return `Kullandığın izinleri işaretlemediğin için kalan izin bilinmiyor.
    Kıdemine göre HAK ETTİĞİN toplam ${n} gün —
    <button class="hint-link" id="useLedgerLeave" type="button">${n} günü kullan</button>
    ya da doğru sayıyı elle yaz.`;
}

function notReadyHTML(form) {
  const eksik = [];
  if (!form.salary) eksik.push('maaş');
  if (!form.hireDate) eksik.push('işe giriş tarihi');
  if (form.hireDate && form.endDate && form.endDate < form.hireDate) eksik.push('çıkış tarihi (girişten sonra olmalı)');
  return `
    <div class="card received-empty">
      <div class="received-empty__title">Hesap için biraz daha bilgi lazım</div>
      <p class="received-empty__body">Eksik olan: ${esc(eksik.join(', ') || 'tarihler')}.</p>
    </div>`;
}

// --- Sonuç ----------------------------------------------------------------

function row(label, value, cls = '') {
  return `<div class="row ${cls}"><span class="row__label">${label}</span><span class="row__leader"></span><span class="row__value">${value}</span></div>`;
}

function money(v) {
  return formatMoney(v, { decimals: false });
}

// Binde oranını okunur yaz: 0.00759 → "7,59". Düz çarpım kayan nokta
// artığı bırakıyordu ("binde 7,590000000000001").
function perMille(rate) {
  return (Number(rate) * 1000).toFixed(3).replace(/0+$/, '').replace(/[.,]$/, '').replace('.', ',');
}

function resultHTML(report, reason) {
  const { kidem, ihbar, izin, seniority } = report;

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Eline geçecek</span>
      <span class="section-header__note">${esc(seniorityText(seniority))} kıdem</span>
    </div>
    <div class="card card--bordro">
      <div class="rows rows--receipt">
        ${kidem.eligible
    ? row('Kıdem tazminatı', money(kidem.net))
      + row('<span style="color:var(--text-tertiary);">brüt</span>', `<span style="color:var(--text-tertiary);">${money(kidem.gross)}</span>`, 'row--sub')
      + row('<span style="color:var(--text-tertiary);">damga vergisi</span>', `<span style="color:var(--text-tertiary);">− ${money(kidem.stamp)}</span>`, 'row--sub')
    : row('Kıdem tazminatı', `<span style="color:var(--text-tertiary);">yok</span>`)
      + row(`<span style="color:var(--text-tertiary);">${kidem.reason === 'under-one-year' ? '1 yıl dolmadı' : 'bu çıkış şeklinde doğmuyor'}</span>`, '', 'row--sub')}

        ${ihbar.eligible
    ? row('İhbar tazminatı', money(ihbar.net))
      + row(`<span style="color:var(--text-tertiary);">${ihbar.weeks} hafta brüt</span>`, `<span style="color:var(--text-tertiary);">${money(ihbar.gross)}</span>`, 'row--sub')
      + row('<span style="color:var(--text-tertiary);">gelir + damga vergisi</span>', `<span style="color:var(--text-tertiary);">− ${money(ihbar.incomeTax + ihbar.stamp)}</span>`, 'row--sub')
    : row('İhbar tazminatı', `<span style="color:var(--text-tertiary);">yok</span>`)
      + row('<span style="color:var(--text-tertiary);">bu çıkış şeklinde doğmuyor</span>', '', 'row--sub')}

        ${izin.gross > 0
    ? row('İzin ücreti', money(izin.net))
      + row(`<span style="color:var(--text-tertiary);">${izin.days} gün brüt</span>`, `<span style="color:var(--text-tertiary);">${money(izin.gross)}</span>`, 'row--sub')
      + row('<span style="color:var(--text-tertiary);">gelir + damga vergisi</span>', `<span style="color:var(--text-tertiary);">− ${money(izin.incomeTax + izin.stamp)}</span>`, 'row--sub')
    : ''}

        ${row('Toplam brüt', money(report.totalGross), 'row--subtotal')}
        ${row('Kesintiler', `− ${money(report.totalTax)}`, 'row--subtotal')}
        ${row('Eline geçecek', money(report.totalNet), 'row--total')}
      </div>
      ${kidem.cappedBy ? `<p class="field__hint" style="margin:12px 0 0;">
        Giydirilmiş brüt ücretin (${money(kidem.base)}) kıdem tavanını aşıyor;
        kıdem tazminatı tavandan, yani aylık ${money(kidem.capped)} üzerinden
        hesaplandı. Tavanı aşan kısım kanunen dikkate alınmaz.
      </p>` : ''}
      ${kidem.eligible ? `<p class="field__hint" style="margin:12px 0 0;">
        Kıdem tazminatından gelir vergisi kesilmez, yalnız binde
        ${perMille(report.params.stampRate)} damga vergisi kesilir.
        İhbar ve izin ücretinden ise gelir vergisi de kesilir.
      </p>` : ''}
    </div>`;
}

// --- Net ↔ brüt dökümü ----------------------------------------------------

function payrollCardHTML(report, form) {
  const p = report.payroll;
  const yon = form.salaryMode === 'net' ? 'Net maaşından brüt' : 'Brüt maaşından net';
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">${yon}</span></div>
    <div class="card card--bordro">
      <div class="rows rows--receipt">
        ${row('Brüt maaş', money(report.grossSalary), 'row--subtotal')}
        ${row('SGK primi (%14)', `− ${money(p.sgk)}`)}
        ${row('İşsizlik sigortası (%1)', `− ${money(p.unemployment)}`)}
        ${row('Gelir vergisi', `− ${money(p.incomeTax)}`)}
        ${p.exemption > 0 ? row('<span style="color:var(--text-tertiary);">asgari ücret istisnası düşüldü</span>', `<span style="color:var(--text-tertiary);">+ ${money(p.exemption)}</span>`, 'row--sub') : ''}
        ${row('Damga vergisi', `− ${money(p.stamp)}`)}
        ${row('Net maaş', money(p.net), 'row--total')}
      </div>
      ${report.fringe > 0 ? `<p class="field__hint" style="margin:12px 0 0;">
        Kıdem ve ihbar, brüt maaşa aylık ${money(report.fringe)} yemek/yol
        eklenmiş giydirilmiş ücretten (${money(report.dressedGross)}) hesaplandı.
      </p>` : ''}
      <p class="field__hint" style="margin:10px 0 0;">
        Hesap ocak esaslıdır: kümülatif vergi matrahı sıfır kabul edilir. Yıl
        içinde üst vergi dilimine geçmiş biri için net→brüt çevrimi bir miktar
        iyimser çıkar.
      </p>
    </div>`;
}

// --- Parametreler ---------------------------------------------------------

function paramsCardHTML(params, state) {
  const custom = !!state.settings?.taxParams;
  return `
    <div class="section-header"><span class="section-title" style="margin:0;">Vergi parametreleri</span></div>
    <div class="card">
      <div class="rows">
        ${row('Yıl', `${params.year}${custom ? ' · düzenlendi' : ''}`)}
        ${row('Brüt asgari ücret', money(params.minWageGross))}
        ${row('Kıdem tazminatı tavanı', money(params.severanceCap))}
        ${row('SGK tavanı', money(params.sgkCeiling))}
      </div>
      <p class="field__hint" style="margin:12px 0 12px;">
        Asgari ücret ve vergi dilimleri her yıl, kıdem tavanı yılda iki kez
        (Ocak ve Temmuz) değişir. Yeni tutarlar açıklandığında buradan
        güncelle — yoksa hesap sessizce eskir.
      </p>
      <button class="btn btn--secondary btn--inline" id="editParams" type="button">Parametreleri düzenle</button>
    </div>`;
}

// --- Bağlama --------------------------------------------------------------

function wire(container, state, ctx, form) {
  const update = (patch) => {
    ctx.severanceForm = { ...form, ...patch };
    ctx.rerender();
  };

  container.querySelector('#salaryMode')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === form.salaryMode) return;
    // Mod değişince tutarı da çevir: "brüt" deyip net rakamı bırakmak
    // sessizce yanlış bir hesap üretirdi.
    const params = taxParamsFor(state.settings);
    if (!form.salary) { update({ salaryMode: btn.dataset.mode }); return; }
    const salary = btn.dataset.mode === 'gross'
      ? netToGross(form.salary, params)
      : severanceReport({ grossSalary: form.salary }, params).payroll.net;
    update({ salaryMode: btn.dataset.mode, salary: Math.round(salary) });
  });

  const salaryInput = container.querySelector('#salaryInput');
  if (salaryInput) commitNumberOnChange(salaryInput, (v) => update({ salary: v }), { emptyValue: 0 });

  container.querySelector('#fringeSwitch')?.addEventListener('click', () => update({ useFringe: !form.useFringe }));
  const fringeInput = container.querySelector('#fringeInput');
  if (fringeInput) commitNumberOnChange(fringeInput, (v) => update({ fringe: v }), { emptyValue: 0 });

  container.querySelector('#hireInput')?.addEventListener('change', (e) => update({ hireDate: e.target.value }));
  container.querySelector('#endInput')?.addEventListener('change', (e) => update({ endDate: e.target.value }));

  const leaveInput = container.querySelector('#leaveInput');
  if (leaveInput) commitNumberOnChange(leaveInput, (v) => update({ leaveDays: Math.round(v) }), { emptyValue: 0 });
  container.querySelector('#useLedgerLeave')?.addEventListener('click', () => update({ leaveDays: form.ledgerLeave || 0 }));

  container.querySelector('#reasonBtn')?.addEventListener('click', () => openReasonSheet(form.reason, (key) => update({ reason: key })));
  container.querySelector('#editParams')?.addEventListener('click', () => openParamsSheet(state, ctx));
}

function openReasonSheet(current, onPick) {
  openSheet({
    title: 'Çıkış şekli',
    build(bodyEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          Tazminatın doğup doğmadığını belirleyen asıl soru bu. İstifada ne
          kıdem ne ihbar doğar; işveren çıkardıysa ikisi de doğar.
        </p>
        <div class="card card--menu">
          ${REASONS.map((r) => `
            <button class="menu-row" type="button" data-reason="${r.key}">
              <span class="menu-row__label">${esc(r.label)}${r.key === current ? ' ✓' : ''}</span>
              <span class="menu-row__value">${r.kidem ? 'kıdem' : ''}${r.kidem && r.ihbar ? ' + ' : ''}${r.ihbar ? 'ihbar' : ''}${!r.kidem && !r.ihbar ? 'tazminat yok' : ''}</span>
              <span class="menu-row__chevron">›</span>
            </button>
            <p class="field__hint" style="margin:-2px 10px 8px;">${esc(r.hint)}</p>`).join('')}
        </div>`;
      bodyEl.querySelectorAll('[data-reason]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeSheet();
          onPick(btn.dataset.reason);
        });
      });
    },
  });
}

/**
 * Parametre düzenleme. Dilimler de düzenlenebilir olmalı: yılda bir hepsi
 * değişiyor ve tavanı güncelleyip dilimleri eski bırakmak yanlış bir hesabın
 * en sinsi hâli.
 */
function openParamsSheet(state, ctx) {
  const p = taxParamsFor(state.settings);
  const FIELDS = [
    { key: 'year', label: 'Parametre yılı', step: 1 },
    { key: 'minWageGross', label: 'Brüt asgari ücret (₺)' },
    { key: 'severanceCap', label: 'Kıdem tazminatı tavanı (₺)' },
    { key: 'sgkCeiling', label: 'SGK prim tavanı (₺)' },
  ];

  openSheet({
    title: 'Vergi parametreleri',
    footerHTML: `
      <div class="adj-actions">
        <button class="btn btn--primary btn--sm" id="paramsSave" type="button">Kaydet</button>
        <button class="btn btn--secondary btn--sm" id="paramsReset" type="button">Varsayılana dön</button>
      </div>`,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <p class="field__hint" style="margin:-4px 0 14px;">
          Varsayılanlar ${DEFAULT_TAX_PARAMS.year} içindir. Yeni yılın tutarları
          açıklandığında buradan güncelle.
        </p>
        ${FIELDS.map((f) => `
          <div class="field">
            <label class="field__label">${f.label}</label>
            <input class="input" type="text" inputmode="decimal" data-param="${f.key}" value="${p[f.key]}" />
          </div>`).join('')}

        <div class="section-title" style="margin-top:6px;">Gelir vergisi dilimleri</div>
        <p class="field__hint" style="margin:0 0 12px;">
          Her satır o dilimin ÜST SINIRI ve oranı. Son satırın sınırı boş
          bırakılır — üstü sınırsızdır.
        </p>
        ${p.brackets.map((b, i) => `
          <div class="input-row">
            <div class="field">
              <label class="field__label">${i + 1}. dilim üst sınır (₺)</label>
              <input class="input" type="text" inputmode="decimal" data-bracket-limit="${i}" value="${b.upTo === Infinity ? '' : b.upTo}" placeholder="sınırsız" />
            </div>
            <div class="field">
              <label class="field__label">Oran (%)</label>
              <input class="input" type="text" inputmode="decimal" data-bracket-rate="${i}" value="${Math.round(b.rate * 1000) / 10}" />
            </div>
          </div>`).join('')}
      `;

      footerEl.querySelector('#paramsSave').addEventListener('click', () => {
        const next = {};
        FIELDS.forEach((f) => {
          const raw = bodyEl.querySelector(`[data-param="${f.key}"]`).value.trim();
          const value = parseLocaleNumber(raw);
          if (Number.isFinite(value) && value > 0) next[f.key] = value;
        });

        const brackets = [];
        bodyEl.querySelectorAll('[data-bracket-rate]').forEach((rateEl) => {
          const i = rateEl.dataset.bracketRate;
          const limitRaw = bodyEl.querySelector(`[data-bracket-limit="${i}"]`).value.trim();
          const rate = parseLocaleNumber(rateEl.value.trim());
          if (!Number.isFinite(rate) || rate < 0) return;
          const limit = limitRaw === '' ? null : parseLocaleNumber(limitRaw);
          brackets.push({ upTo: limit, rate: rate / 100 });
        });
        // Sıralama bozuksa hesap sessizce saçmalar; artan sırada olmayanı alma.
        const limits = brackets.map((b) => (b.upTo === null ? Infinity : b.upTo));
        const sorted = limits.every((v, i) => i === 0 || v > limits[i - 1]);
        if (!sorted) {
          showToast('Dilim sınırları artan sırada olmalı');
          return;
        }
        if (brackets.length) next.brackets = brackets;

        ctx.store.updateSettings({ taxParams: next });
        closeSheet();
        showToast('Parametreler kaydedildi');
        ctx.rerender();
      });

      footerEl.querySelector('#paramsReset').addEventListener('click', () => {
        ctx.store.updateSettings({ taxParams: null });
        closeSheet();
        showToast(`${DEFAULT_TAX_PARAMS.year} varsayılanlarına dönüldü`);
        ctx.rerender();
      });
    },
  });
}
