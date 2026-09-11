// Uygulama kilidi ayarları.
//
// Sayfanın en önemli işi PIN kurdurmak değil, NE KORUDUĞUNU doğru anlatmak.
// "Şifre koydum" diyen biri verisinin şifrelendiğini sanabilir; sanmasın.

import {
  hasPin, setPin, clearPin, verifyPin, lockNow, lockSupported,
  MIN_PIN_LENGTH, MAX_PIN_LENGTH, validatePin,
} from '../../lock.js';
import { profileName } from '../../profile.js';
import { showToast } from '../toast.js';

export const title = 'Uygulama kilidi';

export function render(container, state, ctx) {
  const kurulu = hasPin(ctx.profileId);
  const destek = lockSupported();

  container.innerHTML = `
    <div class="card">
      <div class="rows">
        <div class="row">
          <span class="row__label">Profil</span>
          <span class="row__value">${profileName(ctx.profileId)}</span>
        </div>
        <div class="row">
          <span class="row__label">Durum</span>
          <span class="row__value ${kurulu ? 'is-positive' : ''}">${kurulu ? 'PIN kurulu' : 'Kilit yok'}</span>
        </div>
      </div>
    </div>

    ${!destek ? `
    <div class="card">
      <p class="field__hint" style="margin:0;">
        Bu tarayıcıda kilit kurulamıyor. Uygulamayı <b>https</b> adresinden
        açman gerekiyor (dosyadan açılınca tarayıcı şifreleme işlevlerini kapatıyor).
      </p>
    </div>` : kurulu ? `
    <div class="section-title">PIN’i değiştir</div>
    <div class="card">
      <div class="field">
        <label class="field__label">Şu anki PIN</label>
        <input class="input" type="password" id="currentPin" inputmode="numeric" autocomplete="current-password" placeholder="••••" />
      </div>
      <div class="field">
        <label class="field__label">Yeni PIN</label>
        <input class="input" type="password" id="newPin" inputmode="numeric" autocomplete="new-password" placeholder="••••" />
      </div>
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">Yeni PIN (tekrar)</label>
        <input class="input" type="password" id="newPin2" inputmode="numeric" autocomplete="new-password" placeholder="••••" />
      </div>
      <div class="field__hint" id="changeError" role="alert" style="margin-bottom:12px;"></div>
      <div class="adj-actions">
        <button class="btn btn--primary btn--sm" id="changeBtn" type="button">PIN’i değiştir</button>
        <button class="btn btn--secondary btn--sm" id="lockNowBtn" type="button">Şimdi kilitle</button>
      </div>
    </div>

    <div class="section-title">Kilidi kaldır</div>
    <div class="card">
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">PIN</label>
        <input class="input" type="password" id="removePin" inputmode="numeric" autocomplete="current-password" placeholder="••••" />
      </div>
      <div class="field__hint" id="removeError" role="alert" style="margin-bottom:12px;"></div>
      <button class="btn btn--danger btn--inline" id="removeBtn" type="button">Kilidi kaldır</button>
    </div>` : `
    <div class="section-title">PIN kur</div>
    <div class="card">
      <div class="field">
        <label class="field__label">PIN</label>
        <input class="input" type="password" id="newPin" inputmode="numeric" autocomplete="new-password" placeholder="••••" />
        <div class="field__hint">En az ${MIN_PIN_LENGTH}, en fazla ${MAX_PIN_LENGTH} karakter. Rakam da harf de olur.</div>
      </div>
      <div class="field" style="margin-bottom:6px;">
        <label class="field__label">PIN (tekrar)</label>
        <input class="input" type="password" id="newPin2" inputmode="numeric" autocomplete="new-password" placeholder="••••" />
      </div>
      <div class="field__hint" id="setError" role="alert" style="margin-bottom:12px;"></div>
      <button class="btn btn--primary btn--inline" id="setBtn" type="button">PIN’i kur</button>
    </div>`}

    ${/* Bu kart bilerek uzun. Yanlış bir güvenlik hissi vermek, hiç kilit
         koymamaktan daha kötü. */''}
    <div class="section-title">Bu kilit ne yapar, ne yapmaz</div>
    <div class="card">
      <p class="field__hint" style="margin:0 0 10px; line-height:1.6;">
        <b>Yapar:</b> uygulama açılırken PIN sorar. Bilgisayar açık kalınca
        yanından geçen birinin merakla bakmasını engeller. <b>10 dakika</b>
        işlem yapılmazsa kendini yeniden kilitler — sekme açık kalsa bile.
      </p>
      <p class="field__hint" style="margin:0 0 10px; line-height:1.6;">
        <b>Yapmaz:</b> veriyi şifrelemez. Kayıtlar bu cihazda düz duruyor;
        tarayıcının geliştirici araçlarını (F12) açmayı bilen biri PIN’i hiç
        görmeden hepsini okuyabilir. Aynı şekilde senkron token’ına sahip olan
        buluttaki yedeği okur. Yani bu bir kapı, kasa değil.
      </p>
      <p class="field__hint" style="margin:0; line-height:1.6;">
        PIN <b>yalnız bu cihazda</b> durur, senkronla diğer cihaza gitmez —
        telefonda da isteyeceksen orada ayrıca kurman gerekir. PIN’in kendisi
        hiçbir yere yazılmaz, yalnız doğrulamaya yarayan özeti saklanır.
      </p>
    </div>
  `;

  const val = (id) => container.querySelector(`#${id}`)?.value ?? '';
  const say = (id, text) => { const el = container.querySelector(`#${id}`); if (el) el.textContent = text; };

  container.querySelector('#setBtn')?.addEventListener('click', async () => {
    const pin = val('newPin');
    const check = validatePin(pin);
    if (!check.ok) { say('setError', check.error); return; }
    if (pin !== val('newPin2')) { say('setError', 'İki PIN aynı değil.'); return; }
    const res = await setPin(ctx.profileId, pin);
    if (!res.ok) { say('setError', res.error); return; }
    ctx.armAutoLock?.();
    showToast('PIN kuruldu');
    ctx.rerender();
  });

  container.querySelector('#changeBtn')?.addEventListener('click', async () => {
    if (!(await verifyPin(ctx.profileId, val('currentPin')))) { say('changeError', 'Şu anki PIN yanlış.'); return; }
    const pin = val('newPin');
    const check = validatePin(pin);
    if (!check.ok) { say('changeError', check.error); return; }
    if (pin !== val('newPin2')) { say('changeError', 'İki PIN aynı değil.'); return; }
    const res = await setPin(ctx.profileId, pin);
    if (!res.ok) { say('changeError', res.error); return; }
    showToast('PIN değiştirildi');
    ctx.rerender();
  });

  container.querySelector('#removeBtn')?.addEventListener('click', async () => {
    const res = await clearPin(ctx.profileId, val('removePin'));
    if (!res.ok) { say('removeError', res.error); return; }
    ctx.armAutoLock?.();
    showToast('Kilit kaldırıldı');
    ctx.rerender();
  });

  container.querySelector('#lockNowBtn')?.addEventListener('click', () => {
    lockNow();
    window.location.reload();
  });
}
