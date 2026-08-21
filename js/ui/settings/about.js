import { showToast } from '../toast.js';
import { profileName } from '../../profile.js';

// Uygulama sürümü — her yayınla burası ve sw.js CACHE_VERSION birlikte artar.
// Ayarlar → Uygulama hakkında'da görünür; güncelleme gelmiş mi buradan anlaşılır.
export const APP_VERSION = '1.8.2';

export const title = 'Uygulama hakkında';

export function render(container, state, ctx) {
  const entryCount = state.entries.length;

  container.innerHTML = `
    <div class="card">
      <div class="rows">
        <div class="row"><span class="row__label">Sürüm</span><span class="row__value">v${APP_VERSION}</span></div>
        <div class="row"><span class="row__label">Aktif profil</span><span class="row__value">${profileName(ctx.profileId)}</span></div>
        <div class="row"><span class="row__label">Toplam kayıt</span><span class="row__value">${entryCount}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="link-row" id="installRow"><span>Ana ekrana ekle</span><span class="link-row__chevron">›</span></div>
    </div>

    <div class="card">
      <div class="link-row" id="checkUpdateRow"><span>Güncellemeleri kontrol et</span><span class="link-row__chevron">›</span></div>
      <div class="link-row" id="repairCacheRow"><span>Uygulama önbelleğini onar</span><span class="link-row__chevron">›</span></div>
    </div>

    <div class="card">
      <p class="field__hint" style="margin:0; line-height:1.6;">
        Önbellek onarımı uygulamayı ağdan yeniden yükler; kayıtların ve
        ayarların cihazında saklandığı için korunur. Güncelleme gelmediğinde
        veya uygulama eski sürümde takıldığında kullan.
      </p>
    </div>
  `;

  container.querySelector('#installRow').addEventListener('click', async () => {
    if (ctx.canInstall()) {
      await ctx.promptInstall();
      return;
    }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    showToast(isStandalone
      ? 'Uygulama zaten ana ekranına eklenmiş'
      : 'Tarayıcı menüsünden "Ana ekrana ekle" seçeneğini kullan');
  });

  container.querySelector('#checkUpdateRow').addEventListener('click', () => ctx.checkForUpdate());
  container.querySelector('#repairCacheRow').addEventListener('click', () => ctx.repairCache());
}
