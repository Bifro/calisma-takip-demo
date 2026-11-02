# Çalışma Takip · Android

Android 8+ için tam Çalışma Takip uygulaması. 3.3.0 sürümü, web sitesinin aynı HTML/CSS/JavaScript dosyalarını APK içine paketler: Kronometre, İstatistik, Görevler, Takvim ve Planım sekmelerinin tamamı uygulamanın içindedir. Ayrı tarayıcı açmak gerekmez. Kilit ekranındaki yerel kronometre kontrolleri korunur.

## Kurulum

1. Telefonda [APK’yı indir](https://bifro.github.io/calisma-takip-demo/downloads/calisma-takip-3.3.0.apk) ve Android'in paket yükleyicisiyle mevcut kurulumun üzerine güncelle.
2. Gerekirse kullandığın tarayıcı/dosya uygulaması için bu APK'yı yükleme iznini Android ayarlarından ver.
3. Uygulamayı ilk kez internet açıkken başlat. Mevcut Firebase planı ve kronometre yüklenir.
4. **Planım → Telefon bildirimleri → Kilit ekranı bildirimini aç** düğmesine dokun ve bildirim iznini ver. Telefonun kilit ekranı ayarlarında bu uygulamanın bildirimlerinin gösterilmesine izin ver.
5. Kronometre veya bildirimden yalnızca süreyi kaydet. Uygulamadaki çalışma kartında **Seans tamamlandı** ile ders/hedef ve adet seç. Seanslar sekmesinden hedefleri düzenle. Kapalı bildirimde çalışırken **Kaydet**, boşta **Başlat** görünür; düğmeyi kullanmak için bildirimi büyütmek gerekmez. Genişletilmiş görünümde tarih, büyük sayaç ve iki düğme bulunur. Bildirimin boş alanına dokununca kart açılır.
6. Mevcut web sayfalarını bir kez yenile; Android ile ortak kronometreyi takip eden güncel kodu yüklesinler.

1.1.0 sürümünde RemoteViews ile özel bildirim içerikleri eklendi: 48 dp kapalı görünümde sayaç ve aktif işlem düğmesi, 148 dp geniş görünümde tarih/sayaç/iki düğme. İç kart web ile aynı koyu (#1a1a1a), açık sayaç (#f0f0f0), yeşil (#1D9E75) ve turuncu (#D85A30) renkleri kullanır. Android ve üretici arayüzü bildirimin dış çerçevesini ve uygulama başlığını çizmeye devam eder; tüm bildirim alanının HTML kartı gibi görünmesi garanti edilmez. Canlı sayaç Android Chronometer bileşenidir; süre biçimi Android tarafından belirlenir. Ekran kilitliyken JavaScript'e veya saniyelik ağ isteklerine ihtiyaç duymaz. Gösterilen ders ve seans sayımı, çalışmayı başlatmadan önce uygulamada seçilir.

1.1.1 sürümünde gönderilen logo Android uygulama simgesi olarak eklendi. Farklı simge şekilleri için uyarlanabilir simge katmanları kullanılır. Web başlığı, tarayıcı sekmesi ve ana ekran kısayolu da aynı görseli kullanır.

## Ortak kayıt ve eşitleme

- Web arayüzü Android WebView içinde, `https://appassets.androidplatform.net/web/index.html` sanal HTTPS kökeninde paketlenmiş kaynaklardan yüklenir. Dosya/content erişimi, karışık içerik, uzak çerçeveler ve uzak betikler kapalıdır. JavaScript köprüsü yalnızca bu paketli sayfada bulunur. Harici HTTPS bağlantıları ayrı tarayıcıya yönlendirilir. Google Fonts stil/font dosyaları dışarıdan yüklenebilir; çevrimdışıyken sistem yazı tipi kullanılır.
- Web ekranları ve bildirim aynı `Store` kaydını kullanır. Kronometrede web ve bildirim aynı yerel Başlat/Kaydet işlemlerini çağırır. Görev, takvim, günlük hedef, seans ve plan düzenlemeleri de atomik yerel işlem kuyruğuna yazılır; ilk eşitleme sonrası çevrimdışı kullanılabilir. Arayüzün yerel dosyaları bağlantısız açılır.
- Genel düzenlemeler, başlangıç ve sonuç kopyasıyla kuyruğa girer. Başka cihazdaki bağımsız alan değişiklikleri üç yönlü karşılaştırmayla korunur; çakışan düzenlemeler otomatik ezilmez. Çakışma kurtarma işlemi, bekleyen yerel kayıtları ve işlemleri uygulamada arşivledikten sonra güncel bulut kopyasına geçer. Arşivler Planım'dan JSON olarak dışarı aktarılabilir.
- **Yedek indir** ve cihaz yedekleri Android'in dosya kaydetme seçicisini açar; geniş depolama izni istenmez.
- Veri değişiklikleri web ile ortak Firestore belgesinde eşitlenir. Paketli arayüz dosyalarını değiştirmek yeni APK güncellemesi gerektirir; web sitesindeki tasarım değişiklikleri eski APK'nın ekran dosyalarını kendiliğinden değiştirmez.

- Web ile aynı `projects/calisma-takip-74fd5/databases/(default)/documents/data/shared` belgesi kullanılır. Firebase erişim kuralları değiştirilmez; yeni kullanıcı hesabı veya ayrı çalışma verisi oluşturulmaz.
- Ortak `runningStart`, `runningPlan`, `runningCourse`, `sessions`, `studyPlan` alanları, mevcut JSON string biçiminde korunur. Hedefler ve görevler yalnızca okunur.
- Başlat/Kaydet işlemleri önce telefondaki atomik kayda yazılır. Ağ yoksa kalıcı işlem kuyruğunda tutulur. Tek yürütücü, Firestore commit ve `currentDocument.updateTime` önkoşuluyla yalnızca değişen alanları günceller; çakışmada yeni bulut kopyası üzerinden yeniden dener.
- `timerStart`, aynı kronometrenin web ve APK tarafından iki kez kaydedilmesini önler. Gece yarısını geçen süre günlere bölünür; seans tamamlama bir kez sayılır. Daha yeni bir kronometre eski bir Kaydet işlemiyle durdurulmaz.
- Web açıkken en geç olağan 30 saniyelik sorguda ve sayfaya dönünce yenilenir. Kaydet öncesinde de ortak durum kontrol edilir. APK/bildirim etkinliğinde yaklaşık 15 saniyelik eşitleme kullanılır. Başlat/Kaydet ağ işlemini hemen tetikler. Android güç tasarrufu ve bağlantı kesintileri bu süreleri uzatabilir; eşitleme anlık garantili değildir.
- Bildirim açıkken kullanıcı tarafından etkinleştirilen bir `specialUse` ön plan hizmeti, kontrolleri ve eşitlemeyi sürdürür. Kronometreyi Android kendisi çizer; hizmet her saniye uyanmaz, uyanık tutma kilidi kullanılmaz. Bildirimi uygulama içinden kapatmak bu hizmeti durdurur.
- Yeniden başlatmada bildirim ve ertelenmiş işler geri hazırlanır. Ağ gerektiren kalıcı JobScheduler işleri ayrıca yeniden denemeyi sağlar. Android'in uygulamayı zorla durdurması sonrası uygulamanın yeniden açılması gerekir.
- İki cihaz çevrimdışıyken ayrı kronometre başlatılırsa mevcut çalışma ezilmez. Telefonda açıklama görünür; yerel çalışma Kaydet ile bitirilince tamamlanan kayıt bulut verisiyle birleştirilir.

## Derleme ve imza

Harici bağımlılık veya paket kurulumu yoktur. Android SDK 36.1, Build Tools 36.1.0 ve Android Studio JBR 21 kullanılır:

```powershell
.\build.ps1 -SdkRoot 'C:\Users\fberk\AppData\Local\Android\Sdk' -WithTests
```

`aapt2`, `javac`, D8, zipalign ve apksigner çalıştırılır. Türkçe klasör adlarıyla Android araçlarının uyumu için derleme ASCII isimli geçici klasörde yapılır; `-WorkRoot` ile yer seçilebilir. Son dosya `dist/calisma-takip-3.3.0.apk` olur; dosya sürümü manifestten alınır.

Bu bir kişisel kurulum APK'sıdır; mağaza yayını yapılmamıştır. Sürüm güncellemeleri için aynı imza gerekir. Özel anahtar ve parolası `.signing/` altında yalnızca yerelde saklanır, GitHub'a yüklenmez. Bu klasör güvenli biçimde yedeklenmelidir. Test APK'sı kullanıcıya dağıtılmaz.

## Testler

`tests/TimerInstrumentation.java`, ayrı bir Android 16 emülatöründe sahte bir bellek veritabanı ve ayrı test tercihleri kullanır. Canlı Firestore'a yalnızca okuma kontrolü yapılır; üretim belgesine test kaydı yazılmaz. Kontroller: JSON veri uyumu, gece yarısı bölünmesi, tekrar kaydetme, başka cihazdaki yeni sayaç, kalıcı çevrimdışı kuyruk, koşullu yazma çakışması, web/APK çift kayıt önleme, kartın çizimi, sistem kronometreli bildirim ve bildirimdeki Kaydet eylemi.

```text
adb -s emulator-5580 install -r dist/calisma-takip-3.3.0.apk
adb -s emulator-5580 install -r dist/timer-tests.apk
adb -s emulator-5580 shell am instrument -w tr.bifro.calisma.tests/tr.bifro.calisma.TimerInstrumentation
```

Testler ayrıca kapalı bildirimdeki özel Başlat/Kaydet düğmelerini, canlı sayaç görünürlüğünü ve geniş görünümde düğmelerin etkin/pasif durumunu doğrular. Gerçek telefonun üretici arayüzü ve güç yönetimi ayrıca kullanıcı cihazında kontrol edilmelidir.

2.0.0 testleri, beş sekmeli paketli WebView arayüzünü, logo yüklemesini, uygulama içinden Kaydet işlemini, çevrimdışı görev düzenleme ve yeniden bağlantıda eşitlemeyi, diğer cihazın hedef değişikliğini korumayı, plan ilerlemesi girişini ve Android dosya kaydedicisiyle JSON yedek dışa aktarmayı da kapsar. Derleme, Windows aapt2 tarafından üretilen ters eğik çizgili ZIP varlık yollarını Android için `/` biçimine çevirir.

WebView yaklaşımı: [Android uygulama içi içerik](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [yerel köprü güvenliği](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges).

## 3.0 seans akışı

Kronometrede ders seçimi ve otomatik seans sayımı kaldırıldı. Yeni bildirim başlangıçları da ders/sayım seçmez; uygulamadaki kayıt kartından sonradan hedefe işlenir. Eski sürümde başlamış bir çalışmanın kayıtlı seçimi korunur. Süre düzeltme, elle çalışma ekleme, tamamlamayı geri alma ve hedef değiştirme web ile aynı pencerelerde yapılır. Seans hedefleri, günlük dağılımlar ve düzenlenebilir ders takvimi ortak `studyPlan` alanında saklanır. Eski serbest görevler arşiv görünümünde korunur.

Yeni `workflow.js` de web dosyalarıyla birlikte APK'ya paketlenir ve yalnızca yerel izin verilen dosya listesinde sunulur. Android testleri çevrimdışı hedef düzenleme, elle süre ekleme, kayıt sonrası tamamlama, saniye hassasiyetinde düzeltme ve sayımı geri almayı da doğrular.

## 3.1 görünümü

Aynı paketli arayüz; dağılımsız tarihli hedefleri takvimde gösterir, hedefleri bitişe göre sıralar ve çalışma sürelerini büyük gösterir. Günlük ilerleme, kaydedilen süre ile devam eden kronometrenin bugünkü bölümünü birlikte gösterir. Yerel kayıt kuyruğu, bildirim hizmeti ve Firebase sözleşmesi değişmez.
