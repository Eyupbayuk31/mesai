import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Arayüz dosyaları tarayıcıda çalışır, bu yüzden mantık testleri onları yüklemez.
// Dosya bölünürken ya da yeniden adlandırılırken kopan import (var olmayan
// dışa aktarım, yanlış yol) ancak canlıda "boş sayfa" olarak görünürdü; burada
// yüklenebilirlikleri ve sw.js önbellek listesindeki yerleri doğrulanır.

// sheet.js / toast.js içe aktarılırken DOM'a dokunur; boş bir taklit yeter.
globalThis.window = globalThis.window || { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const fakeEl = () => ({
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
  querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, style: {},
});
globalThis.document = globalThis.document || {
  getElementById: fakeEl, createElement: fakeEl, addEventListener() {}, body: fakeEl(),
};

const MODULES = [
  '../js/ui/investments.js',
  '../js/ui/invest/shared.js',
  '../js/ui/invest/lotSheet.js',
  '../js/ui/invest/assetSheets.js',
  '../js/ui/invest/lotsPage.js',
  '../js/ui/invest/goalSheet.js',
  '../js/ui/invest/summaryPage.js',
  '../js/ui/invest/bindings.js',
  '../js/ui/investReport.js',
  '../js/ui/investChart.js',
  '../js/ui/market.js',
];

for (const path of MODULES) {
  test(`${path} - yüklenir`, async () => {
    const mod = await import(path);
    assert.ok(Object.keys(mod).length > 0, 'dışa aktarım yok');
  });
}

test('yatırım sayfasının dışa aktardıkları yönlendirici için tam', async () => {
  const mod = await import('../js/ui/investments.js');
  for (const name of ['title', 'render', 'renderLotsPage', 'lotsPageTitle', 'renderSummary', 'summaryPageTitle', 'openAddInvestment']) {
    assert.ok(name in mod, `${name} eksik`);
  }
});

test('sw.js önbellek listesi bu arayüz dosyalarını kapsar (çevrimdışı çalışsın)', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const path of MODULES) {
    const rel = path.replace('../', './');
    assert.ok(sw.includes(`'${rel}'`), `${rel} sw.js önbellek listesinde yok`);
  }
});
