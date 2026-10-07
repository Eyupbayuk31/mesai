// Hedefler penceresi: birikim hedefi (tutar + ay) ve hedef dağılım (tür başına %).
// Yalnız ayarlara yazar (investGoal, investTargets); hiçbir alım/varlık kaydına dokunmaz.

import { ASSET_KINDS, cleanTargets } from '../../investments.js';
import { formatMoney, parseAmount, todayISO } from '../../format.js';
import { openSheet, closeSheet } from '../sheet.js';
import { showToast } from '../toast.js';
import { escapeHTML } from './shared.js';

export function openGoalSheet(ctx) {
  const store = ctx.store;
  const settings = store.getState().settings || {};
  const goal = settings.investGoal || null;
  const targets = cleanTargets(settings.investTargets) || {};

  openSheet({
    title: 'Hedefler',
    footerHTML: `
      <button class="btn btn--primary" id="saveGoalsBtn" type="button">Kaydet</button>
      ${goal || Object.keys(targets).length ? '<button class="btn btn--danger btn--sm" id="clearGoalsBtn" type="button" style="margin-top:8px;">Hedefleri temizle</button>' : ''}
    `,
    build(bodyEl, footerEl) {
      bodyEl.innerHTML = `
        <div class="section-title" style="margin-top:0;">Birikim hedefi</div>
        <div class="input-row">
          <div class="field">
            <label class="field__label" for="goalAmount">Hedef tutar (₺)</label>
            <input class="input input--amount" type="text" inputmode="decimal" id="goalAmount" value="${goal?.amount ? String(goal.amount).replace('.', ',') : ''}" placeholder="200000" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field__label" for="goalMonth">Hangi aya kadar?</label>
            <input class="input" type="month" id="goalMonth" value="${escapeHTML(goal?.byMonth || '')}" min="${todayISO().slice(0, 7)}" />
          </div>
        </div>
        <div class="field__hint" style="margin:-6px 0 18px;">Portföyünün güncel değeri bu hedefe göre ilerler. Tarih boş kalırsa yalnızca ilerleme gösterilir.</div>

        <div class="section-title">Hedef dağılım (%)</div>
        <div class="goal-grid">
          ${ASSET_KINDS.map((k) => `
            <label class="goal-grid__row" for="tg_${k.key}">
              <span>${escapeHTML(k.label)}</span>
              <span class="goal-grid__input"><input class="input" type="text" inputmode="decimal" id="tg_${k.key}" data-kind="${k.key}" value="${targets[k.key] ? String(targets[k.key]).replace('.', ',') : ''}" placeholder="—" autocomplete="off" /><em>%</em></span>
            </label>`).join('')}
        </div>
        <div class="field__hint" id="goalSum" style="margin-top:8px;"></div>
      `;

      const inputs = [...bodyEl.querySelectorAll('[data-kind]')];
      const sumEl = bodyEl.querySelector('#goalSum');
      const updateSum = () => {
        const sum = inputs.reduce((t, el) => t + (parseAmount(el.value) || 0), 0);
        sumEl.textContent = sum > 0
          ? `Toplam %${sum.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}${Math.abs(sum - 100) < 0.05 ? '' : ' — 100 olmak zorunda değil, oransal hesaplanır.'}`
          : 'Boş bıraktığın tür hedefsiz sayılır.';
      };
      inputs.forEach((el) => el.addEventListener('input', updateSum));
      updateSum();

      footerEl.querySelector('#saveGoalsBtn').addEventListener('click', () => {
        const amount = parseAmount(bodyEl.querySelector('#goalAmount').value);
        const month = bodyEl.querySelector('#goalMonth').value;
        const raw = {};
        for (const el of inputs) raw[el.dataset.kind] = parseAmount(el.value);
        const nextTargets = cleanTargets(raw);
        if (month && !(amount > 0)) { showToast('Hedef tutarı da yaz'); return; }
        store.updateSettings({
          investGoal: amount > 0 ? { amount, byMonth: /^\d{4}-\d{2}$/.test(month) ? month : null } : null,
          investTargets: nextTargets,
        });
        showToast(amount > 0 || nextTargets ? 'Hedefler kaydedildi' : 'Hedef yok');
        closeSheet();
      });

      footerEl.querySelector('#clearGoalsBtn')?.addEventListener('click', () => {
        store.updateSettings({ investGoal: null, investTargets: null });
        showToast(`Hedefler temizlendi${goal ? ` (${formatMoney(goal.amount, { decimals: false })})` : ''}`);
        closeSheet();
      });
    },
  });
}
