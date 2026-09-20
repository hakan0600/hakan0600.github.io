# YÖKDİL Kelime

Kitaptaki kelime listesinin fotoğrafını çek, program otomatik okuyup kaydetsin. Kartlarla çalış (sıralı / karışık), quiz çöz, gece sesli dinle.
Tek kod tabanı: bilgisayarda masaüstü uygulaması gibi, telefonda ana ekrana eklenen uygulama olarak çalışır (PWA).

## Bilgisayarda açmak
Masaüstündeki **YOKDIL Kelime** kısayoluna çift tıkla. Kısayol yoksa:

```
powershell -ExecutionPolicy Bypass -File kisayol_olustur.ps1
```

Program küçük bir yerel sunucu açar (`127.0.0.1:8765`, dışarıya kapalı), Edge'i uygulama penceresinde gösterir. Pencereyi kapatınca her şey kapanır. Kelimelerin `data/edge-profile` içinde saklanır.

## Kullanım
- **Ekle → Fotoğraf**: listenin fotoğrafını çek/seç (bilgisayarda sürükle ya da Ctrl+V). Okunan kelimeler onay ekranında çıkar; yanlışları düzeltip **Kaydet**. Sarı satırlar programın İngilizce/Türkçe ayrımını tahmin ettiği satırlardır.
- **Ekle → Yapıştır / Tek tek**: metinden ya da elle ekleme. `kelime: anlam`, `kelime - anlam`, `kelime (v.) anlam` biçimleri okunur.
- **Çalış**: kartlar. Sıralı modda kaldığın yerden devam eder. Klavye: Boşluk çevir, ← → gez, 1 bilmiyorum, 2 biliyorum, S oku.
- **Quiz**: çoktan seçmeli, yazarak veya **eşleştirme** (6'şarlık turlar: İngilizce kelimeyi Türkçe anlamıyla eşle; hata ve süre sayılır). EN→TR, TR→EN, karışık. Bitince yanlışlarını tekrar et.
- **Dinle**: sıralı/karışık sesli liste, kelimeyi 1-3 kez okuma, Türkçe anlamını okuma, uyku zamanlayıcısı, ekranı karartma.
- **Kelimeler**: arama, düzenleme, liste silme / baştan başlatma. **⚙️ Ayarlar**: ses seçimi, yedek indir/yükle.

## Fotoğraf okuma nasıl çalışır
1. **Yönü kendisi bulur** (baş aşağı veya yan çekilmiş sayfalar sorun değil).
2. Gölgeyi ve kitabın filigranını siler, yazıyı okur (cihazın içinde, internet gerekmez, sayfa başına ~10-20 sn).
3. **Sütunlu sayfaları** (yan yana İngilizce | Türkçe sütun çiftleri) konumdan çözer; siyah başlıklı **eş anlamlı tabloları** başlığı anlam olarak alarak okur; düz listeleri (`kelime: anlam`) metin olarak ayrıştırır.
4. Şüpheli satırların hücresi **kırpılıp 2-4 kat büyütülerek yeniden okunur** ("zoom"); hâlâ bozuksa okunamayan taraf diğer taraftan ve **gömülü sözlükten internetsiz** düzeltilir (yeşil "düzeltildi" etiketi). Düzeltilemeyen satırlar **işaretsiz ve kırmızı** kalır, çöp kaydetmez.

Gerçek kitap fotoğraflarıyla ölçüldü (üç sütunlu, filigranlı, baş aşağı, eğik): alfabetik "Reading Words" sayfalarında kelimelerin ~%95'i bulunuyor, anlamların ~%90-95'i doğru. Eş anlamlı tablolarda anlam sütun başlığından geldiği için daha yaklaşık; başlığı okunamayan sütunlar atlanır veya "emin değil" olur.

## Sınırlar (bilmek iyi)
- **Fotoğraf okuma kusursuz değil.** Özellikle `ğ, ı, ş` gibi harf işaretleri kaybolabilir ("dogru"), eğik ya da bulanık satırlar bozulabilir. Kaydetmeden önce onay ekranında göz at. Sayfayı düz tutup aydınlıkta, yazılar net görünecek şekilde çekmek sonucu çok iyileştirir.
- **Sesler**: Edge'in "Natural" sesleri çok doğal ama internet ister. İnternet yoksa cihazdaki yerel sese düşer; yerel ses yoksa çalmaz.
- **Telefonda ekran kilitlenince** tarayıcı sesi durdurabilir. Dinlerken ekran açık kalır (uyanık tutma), **Ekranı karart** ile siyah olur. Şarja tak.
- Kelimeler her cihazın kendi tarayıcısında saklanır. Bilgisayardan telefona taşımak için **Ayarlar → Yedeği indir**, diğer cihazda **Yedeği yükle**.
- Okunamayan kelime/anlam **internetsiz** düzeltilir: gömülü sözlük (`vendor/lex`, ~5 MB: FreeDict [GPL] + MUSE en-tr [CC BY-NC, yalnızca kişisel kullanım] + sık kullanılan kelime listeleri). Sözlükte olmayan ifadeler (ör. "inclined to do") düzeltilemez, "emin değil" kalır. Sözlük anlamı kitaptakiyle birebir aynı olmayabilir.

## İnternetteki sürüm (herkes kendi telefonundan, herhangi bir ağdan)
Uygulama internete de konabilir (GitHub Pages). Sonuç `https` bir adrestir; Android Chrome'da doğrudan **Uygulamayı yükle** çıkar (Chrome bayrağı gerekmez), bilgisayar açık olmadan çalışır. Herkesin kelimeleri **kendi cihazında** kalır; sunucuda kelime, hesap ya da kişisel veri tutulmaz. Bilgisayardan telefona aktarma (`Kelimelerimi telefona gönder`) yalnızca bilgisayardaki sürümde vardır; internetteki sürümde **Ayarlar → Yedeği indir / yükle** kullanılır.

## Android telefona kurmak (aynı Wi-Fi, hesap gerekmez)
Uygulama bilgisayardan telefona ağ üzerinden verilir; telefona kurulunca bilgisayar olmadan çalışır.

1. Bilgisayarda uygulamayı **masaüstü kısayolundan** aç (sunucu açık kalsın).
2. Bilgisayarda bir kez **`telefon_izni.bat`** dosyasına çift tıkla, "Evet" de. Güvenlik duvarında yalnızca yerel ağa 8765 numaralı bağlantı noktası açılır (internete açılmaz). Kaldırmak için: `Remove-NetFirewallRule -DisplayName "YOKDIL Kelime (telefon)"`.
3. Uygulamada **⚙️ Ayarlar → Telefonda kullan** bölümü telefonun adresini gösterir (ör. `http://192.168.x.x:8765`).
4. Telefonda Chrome'a `chrome://flags` yaz, "Insecure origins treated as secure" ara, kutuya o adresi yaz, **Enabled** seç, **Relaunch**. (Adres `https` olmadığı için Chrome uygulama olarak kurmaya bu ayarla izin verir.)
5. Chrome'da adresi aç → menü ⋮ → **Uygulamayı yükle**. Bir kez açılınca OCR motoru ve sözlük (~21 MB) telefona iner; sonra internetsiz ve bilgisayarsız çalışır.

6. **Kelimeleri telefona aktar:** her cihazın kelimeleri ayrı saklanır. Bilgisayardaki uygulamada **⚙️ Ayarlar → Kelimelerimi telefona gönder**'e bas; telefondaki uygulamada **⚙️ Ayarlar → Kelimeleri bilgisayardan al**'a bas. Aynı kelime iki kez eklenmez; "bildim" işaretleri ve listeler de gelir. Aktarma kutusu **tek kullanımlıktır**: telefon aldıktan sonra silinir, kelimelerin ağda bekleyip durmaz (tekrar aktarmak için "gönder"e yeniden bas). Telefonda eklediklerini bilgisayara taşımak için **Yedeği indir / Yedeği yükle** kullanılır.

Notlar:
- Bilgisayarın yerel ağ adresi değişirse (yönlendirici başka adres verirse) telefondaki uygulama boş açılır. Modemde bilgisayara **sabit adres** ver ya da kelimeleri önce **Ayarlar → Yedeği indir** ile sakla.
- **Kim erişebilir?** Sunucu yalnızca uygulama pencereni açtığın sürece çalışır. Güvenlik duvarı kuralı yalnızca **aynı ağdaki** (yerel alt ağ) cihazlara izin verir: başka Wi-Fi'ye bağlı ya da mobil veriden gelen biri erişemez. Ama aynı Wi-Fi'ye bağlı biri (aile, misafir) adresi bilirse uygulamayı açabilir; kendi telefonundaki uygulama boş gelir, senin kelimelerin ancak aktarma kutusundayken ("gönder"le "al" arasında) okunabilir. Kamuya açık bir Wi-Fi'de (kafe, otel) uygulamayı açık tutma.
- Sunucu yalnızca uygulamanın kendi dosyalarını sunar; kayıtlı kelimelerin, tarayıcı profilin ve proje dosyaların ağdan **erişilemez**.
- İnternetteki bir adrese (ör. GitHub Pages) koymak istersen klasörü olduğu gibi yayınlaman yeterli; o zaman `https` olduğu için 4. adım gerekmez.

## Dosyalar
| Dosya | Görev |
|---|---|
| `index.html`, `css/style.css` | Sayfa ve stil |
| `js/app.js` | Ekranlar (kartlar, quiz, dinle, kelimeler, ekle, ayarlar) |
| `js/parser.js` | Metni İngilizce–Türkçe çiftlerine ayırır |
| `js/layout.js` | Sütunlu/başlıklı tabloları sözcük konumlarından çözer, çöp satırları eler |
| `js/fixer.js` | Okunamayan satırları gömülü sözlükle düzeltir (internetsiz) |
| `js/ocr.js` | Fotoğraf okuma (Tesseract.js, cihaz içinde): yön bulma, arka plan düzeltme |
| `js/tts.js` | Sesli okuma |
| `js/store.js` | Kelime deposu ve yedek |
| `sw.js`, `manifest.webmanifest` | Çevrimdışı çalışma ve kurulabilirlik |
| `vendor/tesseract/` | OCR motoru ve Türkçe/İngilizce dil dosyaları (~16 MB) |
| `launcher.pyw`, `kisayol_olustur.ps1` | Masaüstü başlatıcı ve kısayol (sunucu yerel ağa açık, yalnızca uygulama dosyalarını sunar) |
| `telefon_izni.bat`, `telefon_izni.ps1` | Telefon için güvenlik duvarı izni (bir kez) |
| `tests/parser.test.html` | Ayrıştırıcı testleri (Edge'de aç, "24/24 geçti" yazmalı) |
| `tests/fixtures/` | OCR deneme görselleri |
