// "Ana ekrana ekle" yönergeleri.
//
// iOS Safari `beforeinstallprompt` olayını HİÇ tetiklemez (Apple bu API'yi
// desteklemiyor), yani uygulama iOS'ta kendi kurulum düğmesini gösteremez.
// Tek yol Paylaş menüsündeki "Ana Ekrana Ekle". Bu yüzden platformu tanıyıp
// adımları elle anlatıyoruz.

import { openSheet } from './sheet.js';

export function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ kendini masaüstü Mac gibi tanıtır; dokunmatik nokta sayısından
  // ayırt edilir.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// iOS'ta üçüncü taraf tarayıcılar da (Chrome, Edge…) iOS 16.4'ten beri ekleme
// yapabiliyor, ama menü yeri farklı — kullanıcıya doğru yeri söyleyelim.
function iosBrowser() {
  const ua = navigator.userAgent || '';
  if (/CriOS/.test(ua)) return 'chrome';
  if (/FxiOS/.test(ua)) return 'firefox';
  if (/EdgiOS/.test(ua)) return 'edge';
  return 'safari';
}

const SHARE_ICON = `
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;">
    <path d="M12 15V3.5"/><path d="m8.5 7 3.5-3.5L15.5 7"/>
    <path d="M6 11.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1"/>
  </svg>`;

function stepsHTML(steps, note) {
  return `
    <ol class="install-steps">
      ${steps.map((s) => `<li>${s}</li>`).join('')}
    </ol>
    ${note ? `<p class="field__hint" style="margin:14px 0 0;">${note}</p>` : ''}
  `;
}

function iosContent() {
  const browser = iosBrowser();
  const shareWhere = browser === 'safari'
    ? `ekranın <b>altındaki</b> ${SHARE_ICON} <b>Paylaş</b> düğmesine dokun`
    : `sağ üstteki <b>⋯</b> menüsünü aç ve ${SHARE_ICON} <b>Paylaş</b>'ı seç`;

  return stepsHTML([
    shareWhere,
    'Açılan listeyi yukarı kaydır',
    '<b>“Ana Ekrana Ekle”</b>ye dokun',
    'Sağ üstten <b>Ekle</b> de',
  ], browser === 'safari'
    ? 'iPhone’da bu adımı uygulamanın kendisi başlatamaz — Apple buna izin vermiyor. Ekledikten sonra uygulama tam ekran açılır ve verilerin korunur.'
    : 'Safari’de yapman daha sağlam olur: aynı sayfayı Safari’de açıp adımları uygula.');
}

function androidContent() {
  return stepsHTML([
    'Sağ üstteki <b>⋮</b> menüsünü aç',
    '<b>“Uygulamayı yükle”</b> veya <b>“Ana ekrana ekle”</b>ye dokun',
    'Onayla',
  ], 'Tarayıcı bazen kendi kurulum çubuğunu da gösterir; ikisi de aynı işi yapar.');
}

function desktopContent() {
  return stepsHTML([
    'Adres çubuğunun sağındaki <b>yükleme simgesine</b> (ekran/artı) tıkla',
    'Ya da tarayıcı menüsünden <b>“Mesai Takip’i yükle”</b>yi seç',
  ], 'Yüklendiğinde uygulama kendi penceresinde, sekmesiz açılır.');
}

// Kurulum yönergelerini açar. Tarayıcı kendi kurulum penceresini
// sunabiliyorsa (Android/masaüstü) onu tercih ederiz; iOS'ta o hiç gelmez.
export function openInstallGuide() {
  if (isStandalone()) {
    openSheet({
      title: 'Zaten kurulu',
      build(bodyEl) {
        bodyEl.innerHTML = `<p style="font-size:14.5px; color:var(--text-secondary); line-height:1.6;">
          Uygulamayı şu an ana ekrandan açılmış haliyle kullanıyorsun. Yeniden eklemene gerek yok.
        </p>`;
      },
    });
    return;
  }

  const ios = isIOS();
  const desktop = !ios && !/Android/i.test(navigator.userAgent || '');

  openSheet({
    title: 'Ana ekrana ekle',
    build(bodyEl) {
      bodyEl.innerHTML = ios ? iosContent() : desktop ? desktopContent() : androidContent();
    },
  });
}
