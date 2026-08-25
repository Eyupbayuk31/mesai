import { PROFILES, setActiveProfile } from '../profile.js';
import { profileSummary, profileLine, greeting, LAST_SEEN_PREFIX } from '../profileStats.js';
import { APP_VERSION } from './settings/about.js';

// Profil seçimi tam ekran gösterilir; #app'in normal sekme/tabbar yapısının
// yerine geçer. Seçim yapılınca sayfa yeniden yüklenir ki store doğru profil
// anahtarıyla temiz şekilde ayağa kalksın.
//
// Ekran uygulamanın kapağı. Kartlarda kayıt sayısı ve son giriş yazar: kimin
// hangisi olduğu isimden değil, verisinden de belli olsun.

function readItem(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function renderProfilePicker(appEl) {
  const now = Date.now();
  const cards = PROFILES.map((p) => {
    const summary = profileSummary(readItem, p.id);
    return { ...p, summary, line: profileLine(summary, now) };
  });

  // En son kullanılan profil öne çıkar: çoğu açılışta doğru olan seçim odur.
  const lastUsed = cards
    .filter((c) => c.summary.lastSeen)
    .sort((a, b) => Date.parse(b.summary.lastSeen) - Date.parse(a.summary.lastSeen))[0];

  appEl.innerHTML = `
    <div class="profile-picker">
      <div class="profile-picker__glow" aria-hidden="true"></div>

      <div class="profile-picker__inner">
        <div class="profile-picker__brand reveal" style="--delay:0ms;">
          <span class="profile-picker__mark">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
          </span>
          <span class="profile-picker__name">Mesai Takip</span>
          <span class="profile-picker__tag">mesai · bordro · bütçe</span>
        </div>

        <div class="profile-picker__greeting reveal" style="--delay:70ms;">
          <span class="profile-picker__hello">${greeting()}</span>
          <span class="profile-picker__ask">Kim giriyor?</span>
        </div>

        <div class="profile-picker__list reveal" style="--delay:140ms;">
          ${cards.map((p, i) => `
            <button class="profile-card ${lastUsed && lastUsed.id === p.id ? 'is-last' : ''}" type="button" data-profile="${p.id}">
              <span class="profile-card__avatar">${p.name.charAt(0)}</span>
              <span class="profile-card__name">${p.name}</span>
              <span class="profile-card__line">${p.line}</span>
              ${lastUsed && lastUsed.id === p.id ? '<span class="profile-card__badge">son kullanılan</span>' : ''}
              <span class="profile-card__key" aria-hidden="true">${i + 1}</span>
            </button>
          `).join('')}
        </div>

        <p class="profile-picker__hint reveal" style="--delay:210ms;">
          Veriler yalnızca bu cihazda tutulur. Profiller birbirinin kaydını görmez.
        </p>
      </div>

      <div class="profile-picker__foot reveal" style="--delay:280ms;">
        <span class="profile-picker__credit">Bu sayfa Eyüp tarafından ücretsiz oluşturulmuştur</span>
        <span class="profile-picker__version">v${APP_VERSION}</span>
      </div>
    </div>
  `;

  const pick = (id) => {
    setActiveProfile(id);
    try { window.localStorage.setItem(LAST_SEEN_PREFIX + id, new Date().toISOString()); } catch { /* dolu depo: seçim yine çalışsın */ }
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
