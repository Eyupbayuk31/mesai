// "Kim ısmarlasın?" çekilişi.
//
// NOT: Çekiliş HİLELİ — sonuç her zaman Fuat. Kullanıcının açık isteği bu
// (aramızda şaka). Karıştırma animasyonu gerçek bir çekiliş gibi görünsün diye
// isimler rastgele sırayla hızlıca dönüyor, sonra yavaşlayıp Fuat'ta duruyor.

const KISILER = ['Eyüp', 'Fuat', 'Gökmen'];
const KAZANAN = 'Fuat';
const SAYAC_KEY = 'mesai.lunch.counts';

export const title = 'Kim ısmarlasın?';

// Sayaç sadece bu cihazda durur; senkronlanan veriye karışmaz.
function readCounts() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAYAC_KEY));
    if (raw && typeof raw === 'object') return raw;
  } catch {}
  return {};
}

function bumpCount(name) {
  const counts = readCounts();
  counts[name] = (counts[name] || 0) + 1;
  try { localStorage.setItem(SAYAC_KEY, JSON.stringify(counts)); } catch {}
  return counts;
}

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

    <div class="section-title">Şeref tablosu</div>
    <div class="card" id="lunchBoard">${boardHTML()}</div>
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
      const counts = bumpCount(KAZANAN);
      const board = container.querySelector('#lunchBoard');
      if (board) board.innerHTML = boardHTML(counts);
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

function boardHTML(counts = readCounts()) {
  const toplam = KISILER.reduce((sum, k) => sum + (counts[k] || 0), 0);
  if (!toplam) {
    return `<p class="field__hint" style="margin:0;">Henüz çekiliş yapılmadı. Kader bekliyor.</p>`;
  }
  return `
    <div class="rows">
      ${KISILER.map((k) => {
    const adet = counts[k] || 0;
    const yuzde = toplam ? Math.round((adet / toplam) * 100) : 0;
    return `
          <div class="row">
            <span class="row__label">${k}</span>
            <span class="row__value ${adet ? 'is-negative' : ''}">${adet} kez${adet ? ` · %${yuzde}` : ''}</span>
          </div>`;
  }).join('')}
    </div>
    <p class="field__hint" style="margin:10px 0 0;">Toplam ${toplam} çekiliş. İstatistik yalan söylemez.</p>
  `;
}
