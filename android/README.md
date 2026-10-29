# Çalışma Takip · Android

Android 8+ için küçük, yerel Java uygulaması. Android 16 (API 36.1) emülatöründe doğrulandı. Uygulama yalnızca kronometre kartını gösterir: süre, Başlat/Kaydet, seans sayımı, ders seçimi, bugünün hedefi ve günlük/haftalık görevler. Genel takvim ve günlük hedefler web uygulamasından yönetilir.

## Kurulum

1. Telefonda [APK’yı indir](https://bifro.github.io/calisma-takip-demo/downloads/calisma-takip-1.0.0.apk) ve Android'in paket yükleyicisiyle aç.
2. Gerekirse kullandığın tarayıcı/dosya uygulaması için bu APK'yı yükleme iznini Android ayarlarından ver.
3. Uygulamayı ilk kez internet açıkken başlat. Mevcut Firebase planı ve kronometre yüklenir.
4. **Kilit ekranı bildirimini aç** düğmesine dokun ve bildirim iznini ver. Telefonun kilit ekranı ayarlarında bu uygulamanın bildirimlerinin gösterilmesine izin ver.
5. Ders ve seans sayımı seçimini uygulamada yap. Bildirimde çalışırken **Kaydet**, boşta **Başlat** görünür. Bildirime dokununca kart açılır.
6. Mevcut web sayfalarını bir kez yenile; Android ile ortak kronometreyi takip eden güncel kodu yüklesinler.

Android, kilit ekranındaki bildirimin boyutunu ve renklerini belirler. Web kartının birebir HTML görünümü bildirim içine gömülmez. Bildirim yerel sistem kronometresi kullanır; ekran kilitliyken JavaScript'e veya saniyelik ağ isteklerine ihtiyaç duymaz. Gösterilen ders ve seans sayımı, çalışmayı başlatmadan önce uygulamada seçilir.

## Ortak kayıt ve eşitleme

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

`aapt2`, `javac`, D8, zipalign ve apksigner çalıştırılır. Türkçe klasör adlarıyla Android araçlarının uyumu için derleme ASCII isimli geçici klasörde yapılır; `-WorkRoot` ile yer seçilebilir. Son dosya `dist/calisma-takip-1.0.0.apk` olur.

Bu bir kişisel kurulum APK'sıdır; mağaza yayını yapılmamıştır. Sürüm güncellemeleri için aynı imza gerekir. Özel anahtar ve parolası `.signing/` altında yalnızca yerelde saklanır, GitHub'a yüklenmez. Bu klasör güvenli biçimde yedeklenmelidir. Test APK'sı kullanıcıya dağıtılmaz.

## Testler

`tests/TimerInstrumentation.java`, ayrı bir Android 16 emülatöründe sahte bir bellek veritabanı ve ayrı test tercihleri kullanır. Canlı Firestore'a yalnızca okuma kontrolü yapılır; üretim belgesine test kaydı yazılmaz. Kontroller: JSON veri uyumu, gece yarısı bölünmesi, tekrar kaydetme, başka cihazdaki yeni sayaç, kalıcı çevrimdışı kuyruk, koşullu yazma çakışması, web/APK çift kayıt önleme, kartın çizimi, sistem kronometreli bildirim ve bildirimdeki Kaydet eylemi.

```text
adb -s emulator-5580 install -r dist/calisma-takip-1.0.0.apk
adb -s emulator-5580 install -r dist/timer-tests.apk
adb -s emulator-5580 shell am instrument -w tr.bifro.calisma.tests/tr.bifro.calisma.TimerInstrumentation
```

Örnek sonuç: **25 doğrulama geçti; canlı Firebase okuması geçti.** Gerçek telefonun üretici arayüzü ve güç yönetimi ayrıca kullanıcı cihazında kontrol edilmelidir.
