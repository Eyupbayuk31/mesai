// "Kim ısmarlasın?" çekilişi.
//
// NOT: Çekiliş HİLELİ — sonuç her zaman Fuat. Kullanıcının açık isteği bu
// (aramızda şaka). Karıştırma animasyonu gerçek bir çekiliş gibi görünsün diye
// isimler rastgele sırayla hızlıca dönüyor, sonra yavaşlayıp Fuat'ta duruyor.

const KISILER = ['Eyüp', 'Fuat', 'Gökmen'];
const KAZANAN = 'Fuat';

export const title = 'Kim ısmarlasın?';

export function render(container, state, ctx) {
  container.innerHTML = `
    <div class="card lunch">
      <div class="lunch__eyebrow">Bugün hesap kimde?</div>
      <div class="lunch__stage" id="lunchStage">
        <div class="lunch__name" id="lunchName">?</div>
      </div>
      <div class="lunch__note" id="lunchNote">Çekilişe katılanlar: ${KISILER.join(' · ')}</div>
      <button class="btn btn--primary" id="lunchDrawBtn" type="button">Çekilişi başlat</button>
    </div>
  `;

  const stage = container.querySelector('#lunchStage');
  const nameEl = container.querySelector('#lunchName');
  const noteEl = container.querySelector('#lunchNote');
  const btn = container.querySelector('#lunchDrawBtn');

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.disabled = true;
    stage.classList.remove('is-winner');
    noteEl.textContent = 'Çekiliş yapılıyor…';
    spin(nameEl, () => {
      // Kullanıcı çekiliş sürerken sayfadan çıkmış olabilir; DOM gitmişse
      // yazmaya çalışma (yoksa null'a innerHTML denenir ve konsola hata düşer).
      if (!nameEl.isConnected) return;
      stage.classList.add('is-winner');
      nameEl.textContent = KAZANAN;
      noteEl.innerHTML = `<b>${KAZANAN} abi</b> ısmarlıyor! 🎉`;
      btn.disabled = false;
      btn.textContent = 'Tekrar çek';
    });
  });
}

// İsimleri önce hızlı, sonra gittikçe yavaş değiştirir — gerçek bir çekiliş
// hissi için. Ara isimler rastgele sırayla gelir, son isim her zaman Fuat.
function spin(nameEl, onDone) {
  const TOPLAM = 22;
  let adim = 0;

  const tur = () => {
    // Sayfa değiştiyse zamanlayıcı kendi kendine sussun.
    if (!nameEl.isConnected) return;
    adim += 1;
    if (adim >= TOPLAM) {
      onDone();
      return;
    }
    // Son karede kazananı göstermemek için ara isimleri diğerlerinden seç.
    const havuz = adim === TOPLAM - 1 ? KISILER.filter((k) => k !== KAZANAN) : KISILER;
    nameEl.textContent = havuz[Math.floor(Math.random() * havuz.length)];
    nameEl.classList.remove('is-tick');
    void nameEl.offsetWidth; // animasyonu yeniden tetikle
    nameEl.classList.add('is-tick');

    // 45 ms'den başlayıp sona doğru 320 ms'ye kadar yavaşlar.
    const oran = adim / TOPLAM;
    const gecikme = 45 + Math.round(275 * oran * oran);
    setTimeout(tur, gecikme);
  };

  tur();
}
