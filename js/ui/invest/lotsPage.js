// Tüm alımlar alt sayfası ve CSV dışa aktarma.

import { recentLots, formatQuantity, isSell } from '../../investments.js';
import { formatMoney, formatDayMonth, todayISO } from '../../format.js';
import { showToast } from '../toast.js';
import { escapeHTML } from './shared.js';
import { openLotSheet } from './lotSheet.js';

export const lotsPageTitle = 'Tüm alımlar';

export function renderLotsPage(container, state, ctx) {
  const rows = recentLots(state, 0);
  const assets = state.assets || [];
  const filter = ctx.investFilter || 'all';
  const shown = filter === 'all' ? rows : rows.filter((l) => l.assetId === filter);
  const total = shown.reduce((sum, l) => sum + l.total, 0);

  container.innerHTML = `
    <div class="period-card">
      <div style="width:34px;"></div>
      <div class="period-card__body">
        <div class="period-card__label">${shown.length} alım</div>
        <div class="period-card__sub">toplam ${formatMoney(total, { decimals: false })}</div>
      </div>
      <div style="width:34px;"></div>
    </div>

    ${assets.length > 1 ? `
    <div class="chips" id="lotFilter" style="margin:14px 0;">
      <button class="quick-chip ${filter === 'all' ? 'is-active' : ''}" type="button" data-filter="all">Hepsi</button>
      ${assets.map((a) => `<button class="quick-chip ${filter === a.id ? 'is-active' : ''}" type="button" data-filter="${a.id}">${escapeHTML(a.label)}</button>`).join('')}
    </div>` : ''}

    <div class="card">
      <div class="lot-list" id="allLotList">
        ${shown.length === 0 ? '<div class="field__hint">Bu varlıkta alım yok.</div>' : shown.map((l) => `
          <button class="lot-row lot-row--wide" type="button" data-lot="${l.id}">
            <span class="lot-row__date">${formatDayMonth(l.date)}</span>
            <span class="lot-row__asset">
              <span class="asset__dot" style="background:${l.color || 'var(--accent)'}"></span>
              <span class="lot-row__name">${escapeHTML(l.label)}${l.note ? `<span class="lot-row__note">${escapeHTML(l.note)}</span>` : ''}</span>
            </span>
            <span class="lot-row__qty">${isSell(l) ? '<b class="lot-tag lot-tag--sell">Satış</b> ' : ''}${formatQuantity(l.quantity, l.asset)} ${escapeHTML(l.unit)} × ${formatMoney(l.unitCost)}</span>
            <span class="lot-row__total">${isSell(l) ? '+' : ''}${formatMoney(l.total, { decimals: false })}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <button class="btn btn--secondary btn--sm" id="exportLotsBtn" type="button" style="margin-top:14px;">CSV indir</button>
  `;

  container.querySelector('#lotFilter')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    ctx.investFilter = chip.dataset.filter;
    ctx.rerender();
  });

  container.querySelector('#allLotList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-lot]');
    if (!row) return;
    const lot = (state.investments || []).find((l) => l.id === row.dataset.lot);
    const asset = assets.find((a) => a.id === lot?.assetId);
    if (lot && asset) openLotSheet(ctx, asset, lot);
  });

  container.querySelector('#exportLotsBtn').addEventListener('click', () => exportLots(ctx, state));
}

export async function exportLots(ctx, state) {
  const { downloadFile, csvForInvestments } = await import('./exportUtils.js');
  const rows = recentLots(state, 0);
  if (rows.length === 0) { showToast('Dışa aktarılacak alım yok'); return; }
  const stamp = todayISO();
  downloadFile(`yatirim-alimlari-${stamp}.csv`, '﻿' + csvForInvestments(rows), 'text/csv;charset=utf-8');
  showToast('CSV indirildi');
}
