# Mesai Takip

Aylık maaşlı çalışanlar için mesai takip ve maaş raporu uygulaması. Tamamen
tarayıcıda çalışır (PWA), veriler yalnızca senin telefonunda saklanır — hiçbir
sunucuya veri gönderilmez.

## Ne işe yarar

**Mesai girişi**
- **Giriş-Çıkış**: o gün kaçta girip kaçta çıktığını gir, haftalık çalışma
  programına göre fazla mesai otomatik hesaplansın (+15dk/+30dk/+1sa çipleriyle
  tek dokunuş)
- **Saat** (`3,5 saat`) veya **Aralık** (`18:00–21:30`) modunda da girilebilir
- Mesai molası (varsayılan 18:30–19:00) mesai süresinden otomatik düşülür
- Mesai türü (normal ×1,5, hafta tatili ×2, resmi tatil ×2) tarihe göre önerilir

**Görüntüleme**
- **Özet**: bu dönem kaç saat/ne kadar, geçen aya kıyas, bu hafta, son mesailer
- **Kayıtlar**: sayfalanmış liste (tür ve dönem filtreli) veya **ay takvimi** —
  takvimde bir güne dokunup mesai ekleyebilir/düzenleyebilirsin
- **Rapor**: dönem özeti, avans/kesinti kalemleri, yıllık grafik
- **Bütçe**: günlük harcamalarını kategorilere gir; **tahmini eline geçecekten
  düşülerek kalan bütçe** ve ay sonuna kadar günde ne kadar harcayabileceğin
  gösterilir
- **HTML rapor** indir: dönem veya tüm yıl için, yazdırılabilir tek dosya
  (CSV ve JSON dışa aktarma da var)

**Diğer**
- Saat ücretin **aylık maaşından otomatik** hesaplanır (varsayılan: maaş ÷ 225)
- **Yemek ve yol parası**: günlük bedelleri gir, tutarlar ayın iş günü sayısına
  göre (haftalık program − resmi tatiller) otomatik hesaplanıp tahmini ödemeye
  ve raporlara eklenir
- Dönem = takvim ayı; **ödeme günü ve gecikmesi** ayarlanabilir (örn. Ağustos
  dönemi → 10 Eylül'de öder)
- **Çoklu profil**: Eyüp ve Fuat'ın kayıtları/ayarları tamamen ayrı tutulur
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

Tüm veriler tarayıcının `localStorage`'ında, cihazda tutulur. Ayarlar →
Yedekleme'den üç yol var:

- **JSON indir / geri yükle** — dosya olarak elle yedek
- **CSV indir** — kayıtları tabloya aktarmak için
- **GitHub yedeği (gizli gist)** — "Kaydet" ile buluta yazar, "Getir" ile geri
  yükler. Her profil gist içinde kendi dosyasında tutulur (`mesai-eyup.json`);
  her kayıt aynı dosyanın üstüne yazar, eski yedekler birikmez.

### GitHub yedeği için token

Token **koda gömülü değildir** — uygulama içinde sen girersin ve yalnızca
kendi cihazında saklanır, repoya asla yazılmaz.

1. github.com → Settings → Developer settings → Personal access tokens →
   **Tokens (classic)** → Generate new token
2. Yetkilerden **yalnızca `gist`** kutusunu işaretle — bu izin repolarına
   erişemez, sadece gist okur/yazar
3. Token'ı Ayarlar → Yedekleme → GitHub token alanına yapıştırıp **Bağlan**

Yedek gizli (secret) gist'e yazılır: listelenmez, ama linkini bilen okuyabilir.

