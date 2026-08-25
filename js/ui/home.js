import { currentPeriodKey, periodLabel, payDateForPeriod, daysUntilPay, shiftPeriod } from '../period.js';
import { periodSummary, scheduledWeeklyHours } from '../payroll.js';
import { holidayListForYear, nextHoliday } from '../holidays.js';
import { formatMoney, formatHours, formatFullDate, formatDayMonthShort, formatWeekdayShort, toISODate, todayISO } from '../format.js';
import { entryRowHTML } from './entryRow.js';
import { enableSwipeToDelete } from './swipe.js';
import { showToast } from './toast.js';
import { openSheet } from './sheet.js';
import { mountPeriodInfo } from './periodNav.js';
import {
  periodProgress, projectPeriod, overtimeShare,
  weeklyBuckets, periodRecord, busiestWeekday, todayNudge,
} from '../homeStats.js';
import { readStatus, relativeTime } from '../sync/engine.js';
import { loansSummary } from '../loans.js';
import { portfolioSummary } from '../investments.js';
import { lifetimeByCategory } from '../budget.js';

// Hatırlatmayı kapatma bilgisi cihaza özeldir; senkronlanan veriye karışmaz.
const NUDGE_KEY = 'mesai.nudge.dismissed';
const WEEK_COUNT = 6;

const RECENT_COUNT = 5;

// Bu haftanın (Pazartesi başlangıçlı) mesai toplamı.
function thisWeekHours(entries, today = new Date()) {
  const offset = (today.getDay() + 6) % 7; // Pazartesi = 0
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  const mondayISO = toISODate(monday);
  const todayStr = toISODate(today);
  return entries
    .filter((e) => e.date >= mondayISO && e.date <= todayStr)
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
}

export function renderHome(container, state, ctx) {
  const periodKey = currentPeriodKey();
  const summary = periodSummary(state, periodKey);
  const prevSummary = periodSummary(state, shiftPeriod(periodKey, -1));
  const settings = state.settings;
  const hasSalary = Number(settings.monthlySalary) > 0;

  const payDate = payDateForPeriod(periodKey, settings);
  const daysLeft = daysUntilPay(periodKey, settings);
  const daysText = daysLeft === 0 ? 'bugün' : daysLeft === 1 ? 'yarın' : `${daysLeft} gün kaldı`;

  const recentEntries = [...summary.entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
    .slice(0, RECENT_COUNT);

  // İlk açılış: maaş yok, tek bir kayıt da yok. Sıfırlarla dolu bir özet
  // yerine ne yapılacağını söyleyen kurulum ekranı basılır.
  if (!hasSalary && (state.entries || []).length === 0) {
    renderOnboarding(container, state, ctx);
    return;
  }

  const progress = periodProgress(periodKey, todayISO());
  // Kayıt yokken "%0 kadar ek" ve "bu hızla ~0 sa" satırları bilgi değil
  // gürültü: ekranı sıfırlarla dolduruyorlardı.
  const projection = hasSalary && summary.entryCount > 0 ? projectPeriod(summary, progress) : null;
  const share = hasSalary && summary.totalHours > 0 ? overtimeShare(summary) : null;
  const nudge = nudgeState(state);

  container.innerHTML = `
    ${syncPillHTML()}
    <div class="period-card">
      <div style="width:34px;"></div>
      <div class="period-card__body">
        <div class="period-card__label">${periodLabel(periodKey)}</div>
        <div class="period-card__sub"><b>${formatFullDate(toISODate(payDate))}</b> tarihinde yatacak · ${daysText}</div>
      </div>
      <div style="width:34px;"></div>
    </div>

    ${nudge.show ? nudgeHTML() : ''}

    ${hasSalary ? `
    <div class="stat-strip stat-strip--kpi">
      <div class="stat-strip__item stat-strip__item--wide">
        <div class="stat-strip__label">Bu dönem kazancın</div>
        <div class="stat-strip__value">${formatMoney(summary.earnedTotal, { decimals: false })}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Bu hafta</div>
        <div class="stat-strip__value">${formatHours(thisWeekHours(state.entries))}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Kayıt</div>
        <div class="stat-strip__value">${summary.entryCount}</div>
      </div>
      <div class="stat-strip__divider"></div>
      <div class="stat-strip__item">
        <div class="stat-strip__label">Saat ücreti</div>
        <div class="stat-strip__value">${formatMoney(summary.baseSalary / (settings.hoursDivisor || 225), { decimals: false })}</div>
      </div>
    </div>` : ''}

    ${!hasSalary ? salaryCtaHTML() : `
      <div class="card card--bordro card--split">
        <div class="hero">
          <div class="hero__label">Bu dönem mesai</div>
          <div class="hero__value">${formatHours(summary.totalHours)}</div>
          <div class="hero__sub">${formatMoney(summary.overtimePay)}</div>
          <div class="hero__badges">
            ${comparisonHTML(summary, prevSummary, periodKey)}
            ${shareHTML(share)}
          </div>
          ${summary.entryCount === 0 ? '<p class="hero__note">Bu ay henüz mesai kaydın yok. Kaldığın saati girdiğinde tutarı burada görünecek.</p>' : ''}
          ${goalBarHTML(summary, settings.monthlyGoalHours)}
          ${projectionHTML(projection, settings.monthlyGoalHours)}
        </div>
        <div class="card__detail">
        ${typeChipsHTML(summary)}
        <div class="rows rows--receipt">
          ${receiptRow('Maaş', formatMoney(summary.baseSalary, { decimals: false }))}
          ${receiptRow('Mesai ücreti', `+ ${formatMoney(summary.overtimePay, { decimals: false })}`, { valueCls: 'is-positive' })}
          ${summary.mealPay > 0 ? receiptRow(`Yemek parası <span style="color:var(--text-tertiary);">(${summary.allowanceDays} gün)</span>`, `+ ${formatMoney(summary.mealPay, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${summary.transportPay > 0 ? receiptRow(`Yol parası <span style="color:var(--text-tertiary);">(${summary.allowanceDays} gün)</span>`, `+ ${formatMoney(summary.transportPay, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${summary.bonuses > 0 ? receiptRow('Prim', `+ ${formatMoney(summary.bonuses, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${summary.extraIncome > 0 ? receiptRow('Para girişi', `+ ${formatMoney(summary.extraIncome, { decimals: false })}`, { valueCls: 'is-positive' }) : ''}
          ${summary.deductions > 0 ? receiptRow('Kesinti', `− ${formatMoney(summary.deductions, { decimals: false })}`, { valueCls: 'is-negative' }) : ''}
          ${receiptRow('Bu dönem kazancın', formatMoney(summary.earnedTotal), { rowCls: 'row--total' })}
          ${summary.advances > 0 ? receiptRow('Avans olarak aldın', `− ${formatMoney(summary.advances, { decimals: false })}`, { valueCls: 'is-negative' }) : ''}
          ${summary.advances > 0 ? receiptRow('Ödeme günü yatacak', formatMoney(summary.payoutTotal), { rowCls: 'row--subtotal' }) : ''}
        </div>
        ${summary.advances > 0 ? `
        <p class="hero__note" style="text-align:left;">Avans ayrı bir para değil — kazancının erken ödenmiş parçası. Bütçedeki <b>kalan</b> da bu kazançtan hesaplanır.</p>` : ''}
        </div>
      </div>

      <button class="btn btn--primary" id="quickAdd" type="button" style="margin-top:14px;">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Bugün mesai ekle
      </button>
    `}

    <div class="panes">
    <div class="pane">
    ${netWorthHTML(state)}
    ${state.entries.length > 0 ? weeklyChartHTML(state.entries) : ''}
    ${hasSalary ? `
      <div class="section-header">
        <span class="section-title" style="margin:0;">Durum</span>
      </div>
      ${statusCardHTML(state, periodKey)}` : ''}
    </div>

    <div class="pane">
    <div class="section-header">
      <span class="section-title" style="margin:0;">Son mesailer</span>
      ${summary.entryCount > 0
        ? `<button class="section-header__link" id="seeAll" type="button">Tümünü gör (${summary.entryCount}) ›</button>`
        : ''}
    </div>
    ${recentEntries.length === 0 ? emptyStateHTML() : `<ul class="list" id="recentList">${recentEntries.map((e) => entryRowHTML(e, settings)).join('')}</ul>`}
    ${lifetimeHTML(state)}
    </div>
    </div>
  `;

  container.querySelector('#netWorthCard')?.addEventListener('click', () => ctx.setTab('invest'));
  container.querySelector('.lifetime')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-lifetime]')) ctx.setTab('expense');
  });

  mountPeriodInfo(ctx, {
    label: periodLabel(periodKey),
    sub: `${formatFullDate(toISODate(payDate))} · ${daysText}`,
  });

  container.querySelector('#goSettings')?.addEventListener('click', () => {
    ctx.navigate({ tab: 'settings', page: 'salary' });
  });

  container.querySelector('#quickAdd')?.addEventListener('click', () => {
    ctx.openEntryForDate(todayISO());
  });

  container.querySelector('#holidayRow')?.addEventListener('click', openHolidaySheet);

  container.querySelector('#debtRow')?.addEventListener('click', () => {
    ctx.navigate({ tab: 'expense', page: 'loans' });
  });

  // Senkron rozeti → Yedekleme sayfası (durum ve tanılama orada).
  container.querySelector('#syncPill')?.addEventListener('click', () => {
    ctx.navigate({ tab: 'settings', page: 'backup' });
  });

  container.querySelector('#nudgeAdd')?.addEventListener('click', () => {
    ctx.openEntryForDate(todayISO());
  });

  container.querySelector('#nudgeClose')?.addEventListener('click', () => {
    try { localStorage.setItem(NUDGE_KEY, todayISO()); } catch {}
    container.querySelector('#nudge')?.remove();
  });

  // Bir haftaya dokun → Kayıtlar sekmesi o haftanın ayıyla açılır.
  container.querySelector('#weekChart')?.addEventListener('click', (e) => {
    const col = e.target.closest('[data-week]');
    if (!col) return;
    ctx.setEntriesView({
      periodKey: col.dataset.week.slice(0, 7),
      allTime: false,
      type: 'all',
      page: 1,
      mode: 'list',
    });
    ctx.navigate({ tab: 'income', page: 'entries' });
  });

  container.querySelector('#seeAll')?.addEventListener('click', () => {
    ctx.setEntriesView({ periodKey, allTime: false, type: 'all', page: 1, mode: 'list' });
    ctx.navigate({ tab: 'income', page: 'entries' });
  });

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


// --- İlk açılış -----------------------------------------------------------
// Uygulama boşken özet ekranı sıfırlarla dolu kartlardan ibaretti: boş grafik,
// "kayıt yok" kutusu ve sayfayı ortadan ikiye bölen dev bir düğme. Bunun
// yerine ne yapılacağını sırayla söyleyen tek bir ekran.

const ONBOARD_STEPS = [
  {
    key: 'salary',
    title: 'Maaşını gir',
    desc: 'Saat ücretin ve mesai tutarların bu rakamdan hesaplanır.',
    done: (state) => Number(state.settings.monthlySalary) > 0,
    route: { tab: 'settings', page: 'salary' },
  },
  {
    key: 'schedule',
    title: 'Çalışma programını ayarla',
    desc: 'Hangi gün kaça kadar çalışıyorsun — mesai buradan sonrasıdır.',
    done: (state) => state.settings.scheduleTouched === true,
    route: { tab: 'settings', page: 'schedule' },
    optional: true,
  },
  {
    key: 'entry',
    title: 'İlk mesaini ekle',
    desc: 'Kaldığın saati yaz, tutarını uygulama hesaplasın.',
    done: (state) => (state.entries || []).length > 0,
    action: 'entry',
  },
];

function renderOnboarding(container, state, ctx) {
  const steps = ONBOARD_STEPS.map((step) => ({ ...step, isDone: !!step.done(state) }));
  const nextIndex = steps.findIndex((s) => !s.isDone);

  container.innerHTML = `
    <div class="onboard">
      <div class="onboard__mark">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
      </div>
      <h1 class="onboard__title">Hoş geldin</h1>
      <p class="onboard__sub">
        Yaptığın mesaiyi saydır, ay sonunda bordroda doğru yatmış mı kontrol et.
        Üç adımda kuruluyor.
      </p>

      <ol class="onboard__steps">
        ${steps.map((step, i) => `
          <li class="onboard-step ${step.isDone ? 'is-done' : ''} ${i === nextIndex ? 'is-next' : ''}"
              data-step="${step.key}" role="button" tabindex="0">
            <span class="onboard-step__num">${step.isDone ? '✓' : i + 1}</span>
            <span class="onboard-step__body">
              <span class="onboard-step__title">${step.title}${step.optional ? '<span class="onboard-step__tag">isteğe bağlı</span>' : ''}</span>
              <span class="onboard-step__desc">${step.desc}</span>
            </span>
            <svg class="onboard-step__go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </li>`).join('')}
      </ol>

      <p class="onboard__foot">
        Kayıtların yalnızca bu cihazda durur. Telefon ve bilgisayarı eşitlemek istersen
        <button class="onboard__link" id="onboardBackup" type="button">Ayarlar → Yedekleme</button>.
      </p>
    </div>
  `;

  container.querySelector('.onboard__steps').addEventListener('click', (e) => {
    const li = e.target.closest('[data-step]');
    if (!li) return;
    const step = ONBOARD_STEPS.find((s) => s.key === li.dataset.step);
    if (!step) return;
    if (step.action === 'entry') ctx.openEntryForDate(todayISO());
    else ctx.navigate(step.route);
  });
  container.querySelector('#onboardBackup').addEventListener('click', () => {
    ctx.navigate({ tab: 'settings', page: 'backup' });
  });
}

// --- Senkron rozeti -------------------------------------------------------
// Ayarlar'a girmeden telefonla PC'nin aynı veriyi gördüğü anlaşılsın diye.
// Senkron kapalıysa hiç basılmaz; her şey yolundayken göze batmayacak kadar küçük.
function syncPillHTML() {
  const status = readStatus();
  if (!status || status.state === 'off' || status.state === 'idle') return '';

  const bad = status.state === 'error' || status.state === 'offline';
  let label;
  if (status.state === 'syncing') label = 'Senkronlanıyor…';
  else if (status.state === 'offline') label = 'Senkron: internet yok';
  else if (status.state === 'error') label = 'Senkron hatası — dokun';
  else if (status.state === 'pending') label = 'Senkron: değişiklik bekliyor';
  else {
    const when = relativeTime(status.lastSyncAt);
    label = when ? `Senkron: ${when}` : 'Senkron edildi';
  }

  return `<button class="sync-pill ${bad ? 'is-error' : ''}" id="syncPill" type="button">
    <span class="sync-pill__dot"></span>${label}
  </button>`;
}

// --- Bugün kayıt hatırlatması --------------------------------------------
function nudgeState(state) {
  const result = todayNudge(state);
  if (!result.show) return result;
  try {
    // Aynı gün içinde kapatıldıysa bir daha çıkmaz; ertesi gün yeniden bakılır.
    if (localStorage.getItem(NUDGE_KEY) === result.date) return { show: false, reason: 'kapatildi' };
  } catch {}
  return result;
}

function nudgeHTML() {
  return `
    <div class="nudge" id="nudge">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nudge__icon"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 2"/></svg>
      <span class="nudge__text">Bugün mesai yaptıysan eklemeyi unutma</span>
      <button class="nudge__add" id="nudgeAdd" type="button">Ekle</button>
      <button class="nudge__close" id="nudgeClose" type="button" aria-label="Kapat">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
  `;
}

// --- Mesai / maaş oranı ---------------------------------------------------
function shareHTML(share) {
  if (share === null || share === undefined) return '';
  const pct = share * 100;
  // %1'in altındaki oranlar "%0" görünmesin diye tek ondalık.
  const text = pct > 0 && pct < 10 ? pct.toFixed(1).replace('.', ',') : String(Math.round(pct));
  return `<div class="hero__compare is-neutral">Maaşın %${text}'i kadar ek</div>`;
}

// --- Ay sonu tahmini ------------------------------------------------------
function projectionHTML(projection, goal) {
  if (!projection) return '';
  const goalHours = Number(goal) || 0;
  const behind = goalHours > 0 && projection.hours < goalHours;
  const prefix = projection.reliable ? 'Bu hızla ay sonunda' : 'Kaba tahmin — ay sonunda';
  return `
    <div class="projection ${behind ? 'is-behind' : ''}">
      ${prefix} <b>~${formatHours(projection.hours)}</b> · <b>${formatMoney(projection.pay, { decimals: false })}</b>
      ${behind ? `<span class="projection__warn">hedefin altında</span>` : ''}
    </div>
  `;
}

// --- Son 6 hafta mini grafik ---------------------------------------------
// Çubuk yüksekliği yalnızca __track belirli yükseklikteyken çözülür; markup
// bu yüzden report.js'teki kalıbın aynısı.
function weeklyChartHTML(entries) {
  const buckets = weeklyBuckets(entries, WEEK_COUNT, todayISO());
  const max = Math.max(...buckets.map((b) => b.hours), 0);
  const total = buckets.reduce((sum, b) => sum + b.hours, 0);

  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Son ${WEEK_COUNT} hafta</span>
      <span class="section-header__meta">${formatHours(total)}</span>
    </div>
    <div class="card">
      <div class="bar-chart bar-chart--mini" id="weekChart">
        ${buckets.map((b) => {
    const pct = max > 0 ? Math.max(3, Math.round((b.hours / max) * 100)) : 3;
    return `
          <button class="bar-chart__col" data-week="${b.mondayISO}" data-end="${b.sundayISO}" type="button"
                  title="${formatDayMonthShort(b.mondayISO)} haftası · ${formatHours(b.hours)}">
            <div class="bar-chart__track">
              <div class="bar-chart__bar ${b.hours > 0 ? 'has-value' : ''} ${b.isCurrent ? 'is-current' : ''}" style="height:${pct}%"></div>
            </div>
            <div class="bar-chart__label">${formatDayMonthShort(b.mondayISO)}</div>
          </button>`;
  }).join('')}
      </div>
    </div>
  `;
}

// --- Rekor ve en yoğun gün ------------------------------------------------
const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// Toplam kalan borç — kredi yoksa hiç görünmez.
function debtRowHTML(state, periodKey) {
  const loans = loansSummary(state, periodKey);
  if (loans.totalRemaining <= 0) return '';
  return `
    <button class="status-row" id="debtRow" type="button">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="status-row__icon"><rect x="2.5" y="6" width="19" height="12.5" rx="2.5"/><path d="M2.5 10h19M6 14.5h4"/></svg>
      <span class="status-row__label">Kalan borç</span>
      <span class="status-row__value">${formatMoney(loans.totalRemaining, { decimals: false })}</span>
      <span class="status-row__chip">${loans.openCount} kredi</span>
    </button>
  `;
}

function recordRowsHTML(state, periodKey) {
  const record = periodRecord(state.entries, periodKey);
  const busiest = busiestWeekday(state.entries);
  if (!record && !busiest) return '';
  return `
    ${record ? `
      <div class="status-row">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="status-row__icon"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H5.5v1.5A3 3 0 0 0 8 9.4M16 5h2.5v1.5A3 3 0 0 1 16 9.4"/><path d="M12 13v3M9 20h6l-.6-2.5H9.6z"/></svg>
        <span class="status-row__label">Ayın rekoru</span>
        <span class="status-row__value">${formatDayMonthShort(record.date)} · ${formatHours(record.hours)}</span>
      </div>` : ''}
    ${busiest ? `
      <div class="status-row">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="status-row__icon"><path d="M4 19.5V13M9.3 19.5V8M14.7 19.5v-6M20 19.5V4.5"/></svg>
        <span class="status-row__label">En yoğun gün</span>
        <span class="status-row__value">${WEEKDAY_NAMES[busiest.weekday]} · ${busiest.count} kayıt</span>
      </div>` : ''}
  `;
}

// Geçen dönemle saat farkı — ilk dönemde (kıyas yoksa) gösterilmez.
function comparisonHTML(summary, prevSummary, periodKey) {
  if (prevSummary.entryCount === 0) return '';
  const diff = summary.totalHours - prevSummary.totalHours;
  if (Math.abs(diff) < 0.01) {
    return `<div class="hero__compare">Geçen ayla aynı</div>`;
  }
  const up = diff > 0;
  const arrow = up
    ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
    : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
  return `
    <div class="hero__compare ${up ? 'is-up' : 'is-down'}">
      ${arrow} Geçen aya göre ${up ? '+' : '−'}${formatHours(Math.abs(diff))}
    </div>
  `;
}

// Fiş (receipt) satırı: etiket ······ değer. Kılavuz çizgisi CSS'te.
function receiptRow(label, value, { rowCls = '', valueCls = '' } = {}) {
  return `<div class="row ${rowCls}"><span class="row__label">${label}</span><span class="row__leader"></span><span class="row__value ${valueCls}">${value}</span></div>`;
}

// Aylık mesai hedefi ilerlemesi — hedef girilmemişse hiç görünmez.
function goalBarHTML(summary, goal) {
  const goalHours = Number(goal) || 0;
  if (goalHours <= 0) return '';
  const pct = Math.min(100, Math.round((summary.totalHours / goalHours) * 100));
  const reached = summary.totalHours >= goalHours;
  return `
    <div class="goal">
      <div class="goal__meta">
        <span>Hedef ${reached ? 'aşıldı' : ''}</span>
        <span>${formatHours(summary.totalHours)} / ${formatHours(goalHours)} · %${pct}</span>
      </div>
      <div class="goal__track"><div class="goal__fill ${reached ? 'is-done' : ''}" style="width:${pct}%"></div></div>
    </div>
  `;
}

// Durum kartı: sıradaki resmi tatil + haftalık puantaj (program + mesai, 45 sa sınırı)
function statusCardHTML(state, periodKey = currentPeriodKey()) {
  const holiday = nextHoliday(todayISO());
  const planned = scheduledWeeklyHours(state.settings);
  const overtime = thisWeekHours(state.entries);
  const total = Math.round((planned + overtime) * 4) / 4;
  const scale = Math.max(total, 45);
  const plannedPct = Math.min(100, (planned / scale) * 100);
  const overtimePct = Math.min(100 - plannedPct, (overtime / scale) * 100);
  const limitPct = Math.min(100, (45 / scale) * 100);
  return `
    <div class="card status-card">
      ${holiday ? `
      <button class="status-row" id="holidayRow" type="button">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="status-row__icon"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/></svg>
        <span class="status-row__label">Sıradaki tatil</span>
        <span class="status-row__value">${holiday.name} · ${formatDayMonthShort(holiday.date)}</span>
        <span class="status-row__chip">${holiday.daysLeft} gün</span>
      </button>` : ''}
      <div class="status-row status-row--meter">
        <span class="status-row__label">Bu hafta puantaj</span>
        <span class="status-row__value">${formatHours(total)}</span>
      </div>
      <div class="status-row__note">program ${formatHours(planned)} + mesai ${formatHours(overtime)}</div>
      <div class="meter" role="img" aria-label="Bu hafta toplam ${formatHours(total)}, kanuni sınır 45 saat">
        <div class="meter__fill meter__fill--planned" style="width:${plannedPct.toFixed(1)}%"></div>
        <div class="meter__fill meter__fill--overtime" style="left:${plannedPct.toFixed(1)}%; width:${overtimePct.toFixed(1)}%"></div>
        ${total > 45 ? `<div class="meter__limit" style="left:${limitPct.toFixed(1)}%" title="Kanuni sınır 45 sa"></div>` : ''}
      </div>
      ${debtRowHTML(state, periodKey)}
      ${recordRowsHTML(state, periodKey)}
      <div class="status-card__foot">Kanuni haftalık çalışma sınırı 45 saat</div>
    </div>
  `;
}

function openHolidaySheet() {
  const year = new Date().getFullYear();
  const list = holidayListForYear(year);
  const today = todayISO();
  openSheet({
    title: `${year} resmi tatiller`,
    build(bodyEl) {
      bodyEl.innerHTML = `
        <ul class="holiday-list">
          ${list.map((h) => `
            <li class="holiday-list__item ${h.date < today ? 'is-past' : ''} ${h.date === today ? 'is-today' : ''}">
              <span class="holiday-list__date">${formatDayMonthShort(h.date)}<small>${formatWeekdayShort(h.date)}</small></span>
              <span class="holiday-list__name">${h.name}</span>
            </li>
          `).join('')}
        </ul>
        <p class="field__hint" style="margin-top:12px;">Dini bayramlar Diyanet takvimine göredir; 2030'a kadar listelenir. Bugünkü tarih kalın gösterilir, geçmiş tatiller soluk.</p>
      `;
    },
  });
}

function typeChipsHTML(summary) {
  const items = [
    { key: 'normal', label: 'Normal' },
    { key: 'weekend', label: 'Hafta tatili' },
    { key: 'holiday', label: 'Resmi tatil' },
  ].filter((t) => summary.byType[t.key].hours > 0);
  if (items.length === 0) return '';
  return `<div class="chips" style="margin-top:18px;">${items.map((t) => `<span class="chip chip--${t.key}">${t.label} · ${formatHours(summary.byType[t.key].hours)}</span>`).join('')}</div>`;
}

function salaryCtaHTML() {
  return `
    <div class="card cta-card">
      <div class="cta-card__icon">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <div class="cta-card__title">Önce maaşını gir</div>
      <div class="cta-card__sub">Saatlik ücretini hesaplayabilmemiz için aylık maaşına ihtiyacımız var.</div>
      <button class="btn btn--primary" id="goSettings" type="button">Maaşımı gir</button>
    </div>
  `;
}

function emptyStateHTML() {
  return `
    <div class="card empty">
      <div class="empty__icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
      </div>
      <div class="empty__title">Henüz mesai kaydı yok</div>
      <div class="empty__sub">&quot;Mesai ekle&quot; ile ilk kaydını gir</div>
    </div>
  `;
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

// --- Net değer: yatırım − kalan borç -------------------------------------

function netWorthHTML(state) {
  const portfolio = portfolioSummary(state);
  const loans = loansSummary(state, currentPeriodKey());
  const debt = loans.totalRemaining || 0;
  // İkisi de yoksa kart anlamsız — hiç basılmaz.
  if (portfolio.totalValue <= 0 && debt <= 0) return '';

  const net = portfolio.totalValue - debt;
  const up = portfolio.totalProfit >= 0;
  return `
    <div class="section-header">
      <span class="section-title" style="margin:0;">Net değer</span>
    </div>
    <div class="card" id="netWorthCard" role="button" tabindex="0">
      <div class="hero__value" style="font-size:26px;">${formatMoney(net, { decimals: false })}</div>
      <div class="rows" style="margin-top:10px;">
        ${receiptRow('Yatırım', formatMoney(portfolio.totalValue, { decimals: false }), { valueCls: 'is-positive' })}
        ${portfolio.totalCost > 0 ? receiptRow('Yatırım kâr/zarar', `${up ? '+' : '−'}${formatMoney(Math.abs(portfolio.totalProfit), { decimals: false })} (%${Math.abs(portfolio.profitPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })})`, { valueCls: up ? 'is-positive' : 'is-negative' }) : ''}
        ${debt > 0 ? receiptRow('Kalan borç', `− ${formatMoney(debt, { decimals: false })}`, { valueCls: 'is-negative' }) : ''}
      </div>
    </div>
  `;
}

// --- Kümülatif: bugüne kadar nereye ne gitti ------------------------------

const LIFETIME_ROWS = 5;

function lifetimeHTML(state) {
  const res = lifetimeByCategory(state);
  if (res.total <= 0) return '';
  const rows = res.categories.slice(0, LIFETIME_ROWS);
  return `
    <div class="section-header" style="margin-top:6px;">
      <span class="section-title" style="margin:0;">Bugüne kadar nereye gitti</span>
    </div>
    <div class="card">
      <div class="hero__value" style="font-size:24px;">${formatMoney(res.total, { decimals: false })}</div>
      <div class="hero__sub" style="text-align:left;margin-top:2px;">${res.months} aylık toplam harcama</div>
      <div class="lifetime" style="margin-top:10px;">
        ${rows.map((c) => `
          <button class="lifetime__row" type="button" data-lifetime="${c.key}">
            <span class="lifetime__dot" style="background:${c.color}"></span>
            <span>
              <span class="lifetime__label">${c.label}</span>
              <span class="lifetime__avg">ayda ${formatMoney(c.monthlyAvg, { decimals: false })}</span>
            </span>
            <span class="lifetime__total">${formatMoney(c.amount, { decimals: false })}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}
