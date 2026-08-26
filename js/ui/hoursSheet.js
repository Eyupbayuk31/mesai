// Mesai çizelgesi: yalnız saatler.
//
// Bordro ya da işyerinin puantajıyla karşılaştırmak için para içermeyen sade
// bir döküm gerekiyordu — "şu gün kaç saat kaldım" dışında bir şey yazmasın.
// İki biçim: yazdırılabilir HTML ve tek dokunuşla paylaşılabilen fotoğraf (PNG).
//
// PNG doğrudan canvas'a çizilir: dış kütüphane yok, yazı tipi sistemden gelir,
// tuval kirlenmediği için toBlob her tarayıcıda çalışır.

import { formatHours, formatFullDate, formatWeekdayShort } from '../format.js';

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };

/** Çizelgenin saf verisi — hem HTML hem PNG bunu kullanır. */
export function hoursTable(entries, { title, subtitle, profileName }) {
  const rows = [...entries]
    .filter((e) => (Number(e?.hours) || 0) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({
      date: e.date,
      dateLabel: formatFullDate(e.date),
      weekday: formatWeekdayShort(e.date).replace('.', ''),
      hours: Number(e.hours) || 0,
      hoursLabel: formatHours(Number(e.hours) || 0),
      type: TYPE_LABEL[e.type] || 'Normal',
      range: e.start && e.end ? `${e.start} – ${e.end}` : '',
      note: e.note || '',
    }));

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const byType = {};
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + r.hours;

  return {
    title, subtitle, profileName, rows,
    totalHours,
    totalLabel: formatHours(totalHours),
    dayCount: new Set(rows.map((r) => r.date)).size,
    byType: Object.entries(byType).map(([type, hours]) => ({ type, hours, label: formatHours(hours) })),
  };
}

// --- HTML ---------------------------------------------------------------

export function hoursHtml(table) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const withRange = table.rows.some((r) => r.range);
  const withNote = table.rows.some((r) => r.note);

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(table.title)} — mesai çizelgesi</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 40px; max-width: 780px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #1c1913; background: #fff; line-height: 1.5;
  }
  header { border-bottom: 2px solid #1c1913; padding-bottom: 14px; margin-bottom: 22px; }
  h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
  .sub { color: #5c564a; font-size: 13px; margin-top: 4px; }
  .totals { display: flex; gap: 26px; margin: 0 0 22px; flex-wrap: wrap; }
  .tot__label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #5c564a; }
  .tot__value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { padding: 9px 10px; border-bottom: 1px solid #e7e1d2; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #5c564a; border-bottom: 1.5px solid #1c1913; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 800; border-top: 1.5px solid #1c1913; border-bottom: 0; }
  footer { margin-top: 26px; color: #8a8578; font-size: 11.5px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<header>
  <h1>${esc(table.title)}</h1>
  <div class="sub">${esc(table.subtitle)}${table.profileName ? ` · ${esc(table.profileName)}` : ''}</div>
</header>

<div class="totals">
  <div><div class="tot__label">Toplam mesai</div><div class="tot__value">${esc(table.totalLabel)}</div></div>
  <div><div class="tot__label">Kayıt</div><div class="tot__value">${table.rows.length}</div></div>
  <div><div class="tot__label">Gün</div><div class="tot__value">${table.dayCount}</div></div>
  ${table.byType.map((t) => `<div><div class="tot__label">${esc(t.type)}</div><div class="tot__value">${esc(t.label)}</div></div>`).join('')}
</div>

<table>
  <thead>
    <tr>
      <th>Tarih</th><th>Gün</th>${withRange ? '<th>Saat aralığı</th>' : ''}<th>Tür</th>${withNote ? '<th>Not</th>' : ''}<th class="num">Süre</th>
    </tr>
  </thead>
  <tbody>
    ${table.rows.map((r) => `
    <tr>
      <td>${esc(r.dateLabel)}</td>
      <td>${esc(r.weekday)}</td>
      ${withRange ? `<td>${esc(r.range)}</td>` : ''}
      <td>${esc(r.type)}</td>
      ${withNote ? `<td>${esc(r.note)}</td>` : ''}
      <td class="num">${esc(r.hoursLabel)}</td>
    </tr>`).join('')}
    <tr class="total">
      <td colspan="${2 + (withRange ? 1 : 0) + 1 + (withNote ? 1 : 0)}">Toplam</td>
      <td class="num">${esc(table.totalLabel)}</td>
    </tr>
  </tbody>
</table>

<footer>Mesai Takip · ${esc(table.subtitle)} · yalnız mesai saatleri</footer>
</body>
</html>`;
}

// --- PNG ----------------------------------------------------------------

const PNG = {
  width: 900,
  pad: 44,
  headH: 104,
  totalsH: 74,
  rowH: 38,
  headerRowH: 40,
};

/**
 * Çizelgeyi tuvale çizer ve PNG blob döndürür.
 * @returns {Promise<Blob>}
 */
export function hoursPng(table, { scale = 2 } = {}) {
  const cols = columnsFor(table);
  const height = PNG.headH + PNG.totalsH + PNG.headerRowH
    + (table.rows.length + 1) * PNG.rowH + PNG.pad * 2 + 34;

  const canvas = document.createElement('canvas');
  canvas.width = PNG.width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const font = (size, weight = '400') => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

  // Zemin
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PNG.width, height);

  let y = PNG.pad;

  // Başlık
  ctx.fillStyle = '#1c1913';
  ctx.font = font(26, '800');
  ctx.textBaseline = 'top';
  ctx.fillText(table.title, PNG.pad, y);
  y += 34;
  ctx.fillStyle = '#5c564a';
  ctx.font = font(14);
  ctx.fillText(`${table.subtitle}${table.profileName ? ` · ${table.profileName}` : ''}`, PNG.pad, y);
  y += 26;
  ctx.strokeStyle = '#1c1913';
  ctx.lineWidth = 2;
  line(ctx, PNG.pad, y, PNG.width - PNG.pad, y);
  y += 22;

  // Özet kutuları
  const totals = [
    ['Toplam mesai', table.totalLabel],
    ['Kayıt', String(table.rows.length)],
    ['Gün', String(table.dayCount)],
    ...table.byType.map((t) => [t.type, t.label]),
  ];
  let tx = PNG.pad;
  for (const [label, value] of totals) {
    ctx.fillStyle = '#5c564a';
    ctx.font = font(11, '600');
    ctx.fillText(label.toLocaleUpperCase('tr-TR'), tx, y);
    ctx.fillStyle = '#1c1913';
    ctx.font = font(21, '800');
    ctx.fillText(value, tx, y + 16);
    tx += Math.max(120, ctx.measureText(value).width + 60);
  }
  y += PNG.totalsH - 12;

  // Tablo başlığı
  ctx.fillStyle = '#5c564a';
  ctx.font = font(11, '700');
  for (const col of cols) {
    drawCell(ctx, col.label.toLocaleUpperCase('tr-TR'), col, y + 12);
  }
  y += PNG.headerRowH - 6;
  ctx.strokeStyle = '#1c1913';
  ctx.lineWidth = 1.5;
  line(ctx, PNG.pad, y, PNG.width - PNG.pad, y);

  // Satırlar
  ctx.font = font(14);
  for (const [i, row] of table.rows.entries()) {
    if (i % 2 === 1) {
      ctx.fillStyle = '#faf8f3';
      ctx.fillRect(PNG.pad, y, PNG.width - PNG.pad * 2, PNG.rowH);
    }
    ctx.fillStyle = '#1c1913';
    ctx.font = font(14);
    for (const col of cols) drawCell(ctx, col.value(row), col, y + 11);
    y += PNG.rowH;
    ctx.strokeStyle = '#e7e1d2';
    ctx.lineWidth = 1;
    line(ctx, PNG.pad, y, PNG.width - PNG.pad, y);
  }

  // Toplam satırı
  ctx.strokeStyle = '#1c1913';
  ctx.lineWidth = 1.5;
  line(ctx, PNG.pad, y, PNG.width - PNG.pad, y);
  ctx.fillStyle = '#1c1913';
  ctx.font = font(15, '800');
  ctx.textAlign = 'left';
  ctx.fillText('Toplam', PNG.pad, y + 12);
  ctx.textAlign = 'right';
  ctx.fillText(table.totalLabel, PNG.width - PNG.pad, y + 12);
  ctx.textAlign = 'left';
  y += PNG.rowH + 14;

  ctx.fillStyle = '#8a8578';
  ctx.font = font(11.5);
  ctx.fillText('Mesai Takip · yalnız mesai saatleri', PNG.pad, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG üretilemedi'))), 'image/png');
  });
}

function columnsFor(table) {
  const withRange = table.rows.some((r) => r.range);
  const withNote = table.rows.some((r) => r.note);
  const left = PNG.pad;
  const right = PNG.width - PNG.pad;

  const cols = [
    { label: 'Tarih', x: left, align: 'left', width: 170, value: (r) => r.dateLabel },
    { label: 'Gün', x: left + 180, align: 'left', width: 60, value: (r) => r.weekday },
  ];
  let x = left + 250;
  if (withRange) {
    cols.push({ label: 'Saat aralığı', x, align: 'left', width: 130, value: (r) => r.range });
    x += 140;
  }
  cols.push({ label: 'Tür', x, align: 'left', width: 120, value: (r) => r.type });
  x += 130;
  if (withNote) {
    cols.push({ label: 'Not', x, align: 'left', width: right - 90 - x, value: (r) => r.note });
  }
  cols.push({ label: 'Süre', x: right, align: 'right', width: 90, value: (r) => r.hoursLabel });
  return cols;
}

// Sütuna sığmayan metin kırpılır: taşan yazı komşu sütuna girmesin.
function drawCell(ctx, text, col, y) {
  const value = String(text ?? '');
  ctx.textAlign = col.align;
  ctx.fillText(fit(ctx, value, col.width), col.x, y);
  ctx.textAlign = 'left';
}

function fit(ctx, text, maxWidth) {
  if (!maxWidth || ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
