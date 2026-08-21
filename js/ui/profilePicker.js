import { PROFILES, setActiveProfile } from '../profile.js';

// Kullanıcı seçimi tam ekran gösterilir; #app'in normal sekme/tabbar
// yapısının yerine geçer. Seçim yapılınca sayfa yeniden yüklenir ki store
// doğru profil anahtarıyla temiz şekilde ayağa kalksın.
export function renderProfilePicker(appEl) {
  appEl.innerHTML = `
    <div class="profile-picker">
      <div class="profile-picker__icon">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
      </div>
      <h1 class="profile-picker__title">Kimsin?</h1>
      <p class="profile-picker__sub">Mesai kayıtların ve ayarların kendi profilinde ayrı tutulur.</p>
      <div class="profile-picker__list">
        ${PROFILES.map((p) => `
          <button class="profile-card" type="button" data-profile="${p.id}">
            <span class="profile-card__avatar">${p.name.charAt(0)}</span>
            <span class="profile-card__name">${p.name}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  appEl.querySelectorAll('[data-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveProfile(btn.dataset.profile);
      window.location.reload();
    });
  });
}
