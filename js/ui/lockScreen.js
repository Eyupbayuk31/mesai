// Kilit ekranı: profil PIN'liyse uygulama açılmadan önce gelir.
//
// Profil seçim ekranının kabuğunu (.profile-picker) yeniden kullanıyor —
// ikisi de uygulamanın kapağı, ayrı bir görsel dil icat etmeye gerek yok.
//
// Yanlış denemede bekleme süresi artıyor. Bu PIN'i kırılmaz yapmaz (4 hane =
// 10.000 ihtimal) ama "otur bir dakika hepsini dene" işini de bitirir; burada
// amaç zaten kasadan çok kapı.

import { profileName, clearActiveProfile } from '../profile.js';
import { verifyPin, markUnlocked, MIN_PIN_LENGTH, MAX_PIN_LENGTH } from '../lock.js';
import { APP_VERSION } from './settings/about.js';

// Deneme sayısına göre bekleme: 3. denemeden sonra devreye girer.
function delayFor(attempts) {
  if (attempts < 3) return 0;
  return Math.min(10000, 2 ** (attempts - 2) * 500);
}

export function renderLockScreen(appEl, profileId, onUnlocked) {
  const name = profileName(profileId);
  appEl.innerHTML = `
    <div class="profile-picker">
      <div class="profile-picker__glow" aria-hidden="true"></div>

      <div class="profile-picker__inner">
        <div class="profile-picker__brand reveal" style="--delay:0ms;">
          <span class="profile-picker__mark">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
          </span>
          <span class="profile-picker__name">${name}</span>
          <span class="profile-picker__tag">kilitli</span>
        </div>

        <form class="lock-form reveal" style="--delay:70ms;" id="lockForm" autocomplete="off">
          <label class="field__label" for="lockPin" style="text-align:left; display:block;">PIN</label>
          <input class="input input--amount" id="lockPin" type="password" inputmode="numeric"
                 autocomplete="current-password" minlength="${MIN_PIN_LENGTH}" maxlength="${MAX_PIN_LENGTH}"
                 placeholder="••••" aria-describedby="lockError" />
          <div class="field__hint" id="lockError" role="alert" aria-live="polite"></div>
          <button class="btn btn--primary" id="lockSubmit" type="submit">Aç</button>
        </form>

        <p class="profile-picker__hint reveal" style="--delay:140ms;">
          PIN yalnız bu cihazda geçerli. Unutursan Ayarlar’dan sıfırlanamaz —
          profili silip yeniden kurman gerekir, veriler bulut yedeğinden geri gelir.
        </p>
        <button class="btn btn--ghost btn--sm" id="lockSwitch" type="button">Profil değiştir</button>
      </div>

      <div class="profile-picker__foot reveal" style="--delay:210ms;">
        <span class="profile-picker__credit">Bu sayfa Eyüp tarafından ücretsiz oluşturulmuştur</span>
        <span class="profile-picker__version">v${APP_VERSION}</span>
      </div>
    </div>
  `;

  const form = appEl.querySelector('#lockForm');
  const input = appEl.querySelector('#lockPin');
  const errorEl = appEl.querySelector('#lockError');
  const submit = appEl.querySelector('#lockSubmit');
  let attempts = 0;
  let busy = false;

  input.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const pin = input.value;
    if (!pin) return;

    busy = true;
    submit.disabled = true;
    submit.textContent = 'Kontrol ediliyor…';
    errorEl.textContent = '';

    const ok = await verifyPin(profileId, pin);
    if (ok) {
      markUnlocked(profileId);
      onUnlocked();
      return;
    }

    attempts += 1;
    const wait = delayFor(attempts);
    input.value = '';
    form.classList.remove('is-wrong');
    void form.offsetWidth; // animasyonu yeniden tetikle
    form.classList.add('is-wrong');

    if (wait > 0) {
      let left = Math.ceil(wait / 1000);
      errorEl.textContent = `PIN yanlış. ${left} saniye bekle.`;
      const tick = setInterval(() => {
        left -= 1;
        if (left > 0) errorEl.textContent = `PIN yanlış. ${left} saniye bekle.`;
      }, 1000);
      setTimeout(() => {
        clearInterval(tick);
        errorEl.textContent = 'PIN yanlış.';
        submit.disabled = false;
        submit.textContent = 'Aç';
        busy = false;
        input.focus();
      }, wait);
    } else {
      errorEl.textContent = 'PIN yanlış.';
      submit.disabled = false;
      submit.textContent = 'Aç';
      busy = false;
      input.focus();
    }
  });

  appEl.querySelector('#lockSwitch').addEventListener('click', () => {
    clearActiveProfile();
    window.location.reload();
  });
}
