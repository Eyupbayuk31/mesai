import { PROFILES, setActiveProfile } from '../profile.js';
import { APP_VERSION } from './settings/about.js';

// Profil seçimi tam ekran gösterilir; #app'in normal sekme/tabbar yapısının
// yerine geçer. Seçim yapılınca sayfa yeniden yüklenir ki store doğru profil
// anahtarıyla temiz şekilde ayağa kalksın.
//
// Ekran uygulamanın kapağı: marka, kısa bir yönerge ve profiller. Ne yaptığını
// anlatan cümleye gerek yok — buraya gelen zaten uygulamayı açmış durumda.
export function renderProfilePicker(appEl) {
  appEl.innerHTML = `
    <div class="profile-picker">
      <div class="profile-picker__brand">
        <span class="profile-picker__mark">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
        </span>
        <span class="profile-picker__wordmark">
          <span class="profile-picker__name">Mesai Takip</span>
          <span class="profile-picker__tag">bordro &amp; bütçe</span>
        </span>
      </div>

      <div class="profile-picker__label">Profil seç</div>
      <div class="profile-picker__list">
        ${PROFILES.map((p, i) => `
          <button class="profile-card" type="button" data-profile="${p.id}">
            <span class="profile-card__avatar">${p.name.charAt(0)}</span>
            <span class="profile-card__name">${p.name}</span>
            <span class="profile-card__key">${i + 1}</span>
          </button>
        `).join('')}
      </div>

      <div class="profile-picker__foot">v${APP_VERSION}</div>
    </div>
  `;

  const pick = (id) => {
    setActiveProfile(id);
    window.location.reload();
  };

  appEl.querySelectorAll('[data-profile]').forEach((btn) => {
    btn.addEventListener('click', () => pick(btn.dataset.profile));
  });

  // Masaüstünde klavyeyle: 1/2 tuşları profilleri seçer.
  document.addEventListener('keydown', function onKey(e) {
    const index = Number(e.key) - 1;
    if (Number.isInteger(index) && PROFILES[index]) {
      document.removeEventListener('keydown', onKey);
      pick(PROFILES[index].id);
    }
  });
}
