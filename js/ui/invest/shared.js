// Yatırım ekranlarının ortak küçük yardımcıları (biçimleme, kaçış, piyasa saati).

import { todayISO, toISODate } from '../../format.js';

export function formatPct(value) {
  return (Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function escapeAttr(str) {
  return escapeHTML(str);
}

// "bugün 11:42" / "dün 18:05" / "3 gün önce"
export function marketTimeLabel(market) {
  const t = Date.parse(market?.fetchedAt);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const hhmm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((Date.now() - t) / 86400000);
  if (toISODate(d) === todayISO()) return `bugün ${hhmm}`;
  return days <= 1 ? `dün ${hhmm}` : `${days} gün önce`;
}
