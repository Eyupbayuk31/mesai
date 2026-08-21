// Bütçe kategorileri: hazır kategorilerin listesi + kullanıcının kendi
// kategorilerini (ad + renk) ekleyip sildiği sayfa.

import { allCategories } from '../../budget.js';
import { showToast } from '../toast.js';

export const title = 'Bütçe kategorileri';

const COLOR_POOL = [
  '#c94f4f', '#d97d0d', '#c9a227', '#5a9e32', '#2f8a5c',
  '#0e8a8a', '#3d7bd9', '#7a5bd9', '#b0431f', '#5c6470',
];

export function render(container, state, ctx) {
  const settings = state.settings;
  const custom = Array.isArray(settings.customCategories) ? settings.customCategories : [];
  let selectedColor = COLOR_POOL[0];

  container.innerHTML = `
    <div class="section-title">Özel kategoriler</div>
    <div class="card">
      ${custom.length === 0 ? `
        <p class="field__hint" style="margin:4px 0 12px;">Kendi kategorini ekleyebilirsin — örn. "Araba", "Çocuk", "Sağlık". Harcama ekleme ekranında hazır kategorilerle birlikte görünür.</p>
      ` : `
        <div class="rows">
          ${custom.map((c) => `
          <div class="row">
            <span class="row__label"><span class="dot" style="background:${c.color};"></span>${escapeHTML(c.label)}</span>
            <button class="cat-del" data-del-cat="${c.key}" type="button" aria-label="Kategoriyi sil">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>`).join('')}
        </div>
        <p class="field__hint" style="margin:12px 0 0;">Sildiğin kategorinin eski harcamaları otomatik "Diğer"e düşer.</p>
      `}

      <div class="field" style="margin-bottom:10px; margin-top:${custom.length ? '16px' : '0'};">
        <label class="field__label">Yeni kategori adı</label>
        <input class="input" type="text" id="newCatName" placeholder="ör. Araba" maxlength="24" autocomplete="off" />
      </div>
      <div class="color-swatches" id="colorSwatches">
        ${COLOR_POOL.map((c, i) => `
          <button class="color-swatch ${i === 0 ? 'is-active' : ''}" data-color="${c}" style="background:${c};" type="button" aria-label="Renk seç"></button>
        `).join('')}
      </div>
      <button class="btn btn--primary btn--sm" id="addCatBtn" type="button" style="margin-top:14px;">Kategori ekle</button>
    </div>

    <div class="section-title">Hazır kategoriler</div>
    <div class="card">
      <div class="cat-chips">
        ${allCategories(settings).map((c) => `
          <span class="cat-chip" style="--cat-color:${c.color};"><span class="cat-chip__dot"></span>${c.label}</span>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      selectedColor = sw.dataset.color;
      container.querySelectorAll('.color-swatch').forEach((s) => s.classList.toggle('is-active', s === sw));
    });
  });

  container.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.delCat;
      const label = custom.find((c) => c.key === key)?.label || 'Kategori';
      ctx.store.updateSettings({ customCategories: custom.filter((c) => c.key !== key) });
      showToast(`${label} silindi — harcamaları "Diğer"e düştü`);
    });
  });

  const nameInput = container.querySelector('#newCatName');
  container.querySelector('#addCatBtn').addEventListener('click', () => {
    const label = nameInput.value.trim();
    if (!label) {
      showToast('Kategori adı boş olamaz');
      nameInput.focus();
      return;
    }
    const exists = allCategories(ctx.store.getState().settings).some((c) => c.label.toLowerCase() === label.toLowerCase());
    if (exists) {
      showToast('Bu isimde kategori zaten var');
      return;
    }
    const record = { key: `c_${Date.now().toString(36)}`, label, color: selectedColor };
    ctx.store.updateSettings({ customCategories: [...custom, record] });
    showToast(`${label} eklendi`);
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
