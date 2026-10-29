# Çalışma Takip

GitHub Pages üzerinde çalışan, Firestore REST API ve cihazdaki localStorage ile kayıt tutan statik uygulama.

## Eklenen plan

Mart 2027 TUS hedefi 65–70 puandır. Genel ders tarihleri kendiliğinden değiştirilmez:

| Başlangıç | Bitiş | Ders |
| --- | --- | --- |
| 27.10.2026 | 09.11.2026 | Pediatri |
| 10.11.2026 | 30.11.2026 | Genel Cerrahi + Kadın Doğum |
| 01.12.2026 | 07.12.2026 | Mikrobiyoloji |
| 08.12.2026 | 21.12.2026 | Patoloji tekrarı |
| 22.12.2026 | 28.12.2026 | Farmakoloji |
| 29.12.2026 | 11.01.2027 | Dahiliye tekrarı |

Ocak sonrasındaki tüm dersleri kapsayan tekrar programı ayrıca hazırlanacaktır.

- Normal mesai 2 saat, boş hafta içi 4 saat, hafta sonu 4–5 saat, halı saha 2–3 saat. Aralıkların alt sınırı başlangıç hedefidir. Gün türü Planım sekmesinde, kesin süre takvimde değiştirilebilir. Eksik süre borç olarak taşınmaz.
- İlk açılışta boş günlük hedefler doldurulur; mevcut hedefler korunur. 29 Ekim boş hafta içi olarak tanımlıdır.
- 27–28 Ekim için bildirilen günlük 2 saat, mevcut kayıtların yalnızca eksik kısmı eklenerek tamamlanır. Bu aktarım bir kez yapılır. Başlangıç verisinin cihazdaki kopyası `ct_before_plan_v1` anahtarında tutulur.
- Her dersin tamamlanan seansları ve tamamlanma durumu izlenir. Kronometreden kaydederken seans sayımı ve ders seçilebilir; süre kaydı kendi başına seans hedefini artırmaz. Seans sayımı seçimi çalışan kronometreyle birlikte saklanır.
- Pediatri için 29 Ekim itibarıyla kalan 20 seans, 3 Kasım erken bitirme hedefidir. Seans başına yaklaşık 20 sayfa yalnızca tahmindir. Genel bitiş tarihi 9 Kasım olarak kalır.
- 29 Ekim 2 ek seans, 30 Ekim 2, 31 Ekim 5, 1 Kasım 5, 2–3 Kasım ortak 5 seans olarak gösterilir. Toplam 19 olduğu için 1 seansın henüz atanmadığı açıkça belirtilir.
- Elle eklenen seanslar yalnızca ilerlemeyi artırır; ayrıca çalışma süresi oluşturmaz. Aynı çalışma hem elle hem kronometreden eklenmemelidir. İlerleme kayıtları geri alınabilir.

## İnceleme bulguları ve kayıt davranışı

Önceki sürüm tek HTML dosyasında kronometre, genel görevler, takvim ve saat hedeflerini içeriyordu. Ders dönemleri veya seans hedefi modeli bulunmuyordu.

Düzeltilen sorunlar:

- Haftalık hedef hesabında tarih nesnesi yerine `YYYY-MM-DD` anahtarı kullanılır.
- Başarısız bulut kaydı artık başarılı eşitleme olarak gösterilmez. Yerel değişiklikler bekletilir ve bağlantı gelince yeniden denenir.
- Yazmalar sıraya alınır; eski bir arka plan okuması yeni düzenlemeyi silemez.
- Firestore `currentDocument.updateTime` önkoşulu farklı cihazdaki düzenlemenin sessizce ezilmesini engeller. Çakışmada yerel kayıt korunur, otomatik yazma durur. Önce yedek indirilebilir, ardından kullanıcı isterse bulut kopyasını yükleyebilir. Otomatik birleştirme yapılmaz.
- Alan maskesi, bu sürümün yönetmediği Firestore alanlarını korur.
- Gece yarısını geçen seanslar ilgili günlere bölünür; tamamlanan seans bir kez sayılır. Böyle bir kaydın tüm süre parçaları silinirse ilişkili ilerleme de kaldırılır.

Mevcut mimari tek bir `data/shared` Firestore belgesi kullanır ve uygulamada kullanıcı oturumu yoktur. Yetkilendirme mevcut Firebase güvenlik kurallarına bağlıdır; bu çalışma kuralları değiştirmez. Eski sürümü açık tutan cihazlar eski kayıt davranışını kullanır; güncellemeden sonra cihazlardaki sayfalar yenilenmelidir.

Teknik sözleşme: [Firestore belge güncelleme](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/patch), [güncelleme önkoşulu](https://firebase.google.com/docs/firestore/reference/rest/v1/Precondition).

## Geliştirme ve doğrulama

Derleme veya paket kurulumu gerekmez. GitHub Pages aynı klasördeki `index.html`, `plan.js` ve `plan.css` dosyalarını sunar.

Node.js ile otomatik kontroller:

```text
node --test tests/app.test.cjs
```

Gerçek Firebase verisinden tamamen ayrı yerel ekran kontrolü:

```text
node preview.cjs
```

`http://127.0.0.1:8765` sahte Firestore yanıtları kullanır. `?offline=1` bağlantı hatasını canlandırır. Önizleme üzerinde yapılan işlemler gerçek veritabanına gitmez. Firebase güvenlik kurallarını veya üretim bulut bağlantısını doğrulamaz.
