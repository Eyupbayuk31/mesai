export const title = 'Görünüm';

export function render(container, state, ctx) {
  const settings = state.settings;

  container.innerHTML = `
    <div class="card">
      <label class="field__label">Mesai giriş varsayılanı</label>
      <div class="segmented" id="entryModeSegmented" style="margin-bottom:6px;">
        <button class="segmented__item ${settings.defaultEntryMode === 'hours' ? 'is-active' : ''}" data-mode="hours" type="button">Saat</button>
        <button class="segmented__item ${settings.defaultEntryMode === 'shift' ? 'is-active' : ''}" data-mode="shift" type="button">Giriş-Çıkış</button>
        <button class="segmented__item ${settings.defaultEntryMode === 'range' ? 'is-active' : ''}" data-mode="range" type="button">Aralık</button>
      </div>
      <div class="field__hint">Mesai eklerken hangi mod açık gelsin</div>
    </div>

    <div class="section-title">Tema</div>
    <div class="card">
      <div class="segmented" id="themeSegmented">
        <button class="segmented__item ${settings.theme === 'auto' ? 'is-active' : ''}" data-theme="auto" type="button">Otomatik</button>
        <button class="segmented__item ${settings.theme === 'light' ? 'is-active' : ''}" data-theme="light" type="button">Açık</button>
        <button class="segmented__item ${settings.theme === 'dark' ? 'is-active' : ''}" data-theme="dark" type="button">Koyu</button>
      </div>
    </div>
  `;

  container.querySelector('#entryModeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    ctx.store.updateSettings({ defaultEntryMode: btn.dataset.mode });
  });
  container.querySelector('#themeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    ctx.store.updateSettings({ theme: btn.dataset.theme });
  });
}
