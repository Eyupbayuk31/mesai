// Dosya indirme ve CSV üretimi.

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const TYPE_LABEL = { normal: 'Normal', weekend: 'Hafta tatili', holiday: 'Resmi tatil' };

export function csvForEntries(entries, settings, entryAmountFn) {
  const header = ['Tarih', 'Saat', 'Tür', 'Baslangic', 'Bitis', 'Tutar', 'Not'];
  const lines = [header.join(';')];
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const e of sorted) {
    const amount = entryAmountFn(e, settings);
    lines.push([
      e.date,
      String(e.hours).replace('.', ','),
      TYPE_LABEL[e.type] || e.type,
      e.start || '',
      e.end || '',
      amount.toFixed(2).replace('.', ','),
      csvEscape(e.note || ''),
    ].join(';'));
  }
  return lines.join('\n');
}

/**
 * Yatırım alımlarının CSV'si. Excel'e açılıp kuyumcu/banka dökümüyle
 * karşılaştırılabilsin diye tutar da hesaplanmış olarak yazılır.
 *
 * @param {Array} lots recentLots() gibi varlık bilgisi eklenmiş alımlar
 */
export function csvForInvestments(lots) {
  const header = ['Tarih', 'Varlik', 'Tur', 'Miktar', 'Birim', 'Birim fiyat', 'Tutar', 'Not'];
  const lines = [header.join(';')];
  const sorted = [...lots].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const l of sorted) {
    const quantity = Number(l.quantity) || 0;
    const unitCost = Number(l.unitCost) || 0;
    lines.push([
      l.date,
      csvEscape(l.label || ''),
      csvEscape(l.kindLabel || ''),
      String(quantity).replace('.', ','),
      csvEscape(l.unit || ''),
      unitCost.toFixed(2).replace('.', ','),
      (quantity * unitCost).toFixed(2).replace('.', ','),
      csvEscape(l.note || ''),
    ].join(';'));
  }
  return lines.join('\n');
}

function csvEscape(value) {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
