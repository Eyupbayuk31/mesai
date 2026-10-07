// İki yatırım sayfasının (ana sayfa ve Özet) ortak düğmeleri: fiyat uyarısı ve
// piyasa fiyatını yenile. Sayfa neyi çizdiyse onu bağlar; olmayan öğe sessizce atlanır.

import { showToast } from '../toast.js';
import { openBulkPriceSheet } from './assetSheets.js';

export function bindMarketBits(container, ctx) {
  container.querySelector('#bulkPriceBtn')?.addEventListener('click', () => openBulkPriceSheet(ctx));
  container.querySelector('#marketRefreshBtn')?.addEventListener('click', async () => {
    const res = await ctx.refreshMarket?.({ force: true });
    if (res && !res.ok) showToast('Fiyat alınamadı — son bilinen fiyat kullanılıyor');
    else if (res?.ok) showToast('Piyasa fiyatı güncellendi');
  });
}
