# Mesai Takip

Aylık maaşlı çalışanlar için mesai takip ve maaş raporu uygulaması. Tamamen
tarayıcıda çalışır (PWA), veriler yalnızca senin telefonunda saklanır — hiçbir
sunucuya veri gönderilmez.

## Ne işe yarar

- Mesai kaydını **saat sayısı** (`3,5 saat`) veya **başlangıç–bitiş saati**
  (`18:00–21:30`) girerek ekle
- Mesai türünü (normal ×1,5, hafta tatili ×2, resmi tatil ×2) tarihe göre
  otomatik öner, istersen elle değiştir
- Saat ücretin **aylık maaşından otomatik** hesaplanır (varsayılan: maaş ÷ 225)
- Dönem = takvim ayı; **ödeme günü ve gecikmesi** ayarlanabilir (örn. Ağustos
  dönemi → 10 Eylül'de öder)
- Özet ekranında bu dönem kaç saat mesai yaptığını ve ne kadar alacağını gör
- Rapor ekranında geçmiş dönemlere gez, prim/avans/kesinti ekle, yıllık grafiği
  incele, CSV/JSON olarak dışa aktar
- Tamamen **offline çalışır**, internet olmadan da açılır

## Telefona kurulum (Android)

1. Bu adresi Chrome'da aç: **https://eyupbayuk31.github.io/mesai/**
2. Sağ üstteki üç nokta menüsüne dokun → **"Ana ekrana ekle"**
3. Artık normal bir uygulama gibi ikonuna dokunarak açabilirsin, internetsiz de
   çalışır

## Geliştirme

Build adımı yok — saf HTML/CSS/JS. Yerelde çalıştırmak için:

```bash
python3 -m http.server 8080
# tarayıcıda http://localhost:8080 adresini aç
```

Testleri çalıştırmak için:

```bash
node --test
```

## Yayın (GitHub Pages)

Repo ayarlarında **Settings → Pages → Source = GitHub Actions** seçili olmalı
(bir kerelik kurulum). `main` dalına her push'ta `.github/workflows/pages.yml`
otomatik olarak siteyi yayınlar.

## Veri ve yedekleme

Tüm veriler tarayıcının `localStorage`'ında tutulur. Ayarlar sekmesinden
istediğin zaman JSON olarak yedek indirebilir veya geri yükleyebilirsin.
Tarayıcı verisini temizlersen veya telefon değiştirirsen, önce yedek almadıysan
veriler kaybolur.
