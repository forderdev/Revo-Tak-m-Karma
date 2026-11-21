# Takım Karma

FC Pro Clubs yayınları için takım ve mevki çarkı. İsimleri gir, takım sayısını seç, çarklar her oyuncu için önce takımı sonra mevkiyi çevirsin. Takımlar her zaman eşit kalır. Kick sohbetinde `!katil` yazan izleyici listeye kendiliğinden eklenir.

Sunucu gerektirmez, düz HTML/CSS/JS. Kick bağlantısı isteğe bağlıdır ve küçük bir Cloudflare Worker ile çalışır.

## Nasıl kullanılır

- İsimleri tek tek yaz ya da alt alta yapıştır. Numaralı liste de olur, numaralar silinir.
- Takım sayısı 2 ile 4 arası. **Rastgele** ya da **Sırayla** (1. isim 1. takıma, 2. isim 2. takıma...) dağıtır.
- Bir oyuncunun takımını ya da mevkisini kilitleyebilirsin. Kilitli kısım çevrilmez.
- Takım başına 6 kişi ya da daha azsa oyuncular hücuma ve orta sahaya dağılır. **Defansa da dağıt** açıksa tüm mevkiler kullanılır. 6'dan fazlaysa defans zorunlu açılır.
- **İnsan kaleci** kapalıysa kaleyi yapay zekâ oynar.
- Takım başına 11'den fazla kişi varsa fazlalar yedek olur.
- Çekiliş sırasında: **Boşluk** tuşu çevirir. **Atla** bu oyuncuyu hemen yerleştirir, **Hepsini atla** kalanları bir anda dağıtır, **Otomatik** kendi kendine devam eder. **Geri al** son atamayı yeniden çeker.
- Bitince **Discord'a kopyala** takımları mesaj olarak panoya alır.

Her şey tarayıcıda saklanır. Sayfayı yenilesen de liste ve yarım kalan çekiliş yerinde durur.

## Yerelde açmak

`index.html` dosyasını tarayıcıda açman yeterli. Ya da klasörde:

```
python -m http.server 5517
```

Sonra `http://localhost:5517` adresine git.

## GitHub Pages'e koymak

1. GitHub'da boş bir depo aç (README eklemeden).
2. Bu klasörü depoya gönder.
3. Depoda **Settings → Pages → Build and deployment** bölümünde kaynak olarak **Deploy from a branch**, dal olarak **main** ve klasör olarak **/ (root)** seç.
4. Bir iki dakika sonra site `https://kullaniciadi.github.io/depo-adi/` adresinde açılır.

## Kick sohbetini bağlamak

Site sohbete yazmaz, sadece okur. Kick sohbet mesajlarını resmi API üzerinden bir Cloudflare Worker'a gönderir, Worker da `!katil` ve `!ayril` komutlarını siteye iletir. Bu kurulum bir kere yapılır ve ücretsiz plan yeter.

### 1. Kick uygulaması

1. [kick.com/settings/developer](https://kick.com/settings/developer) sayfasında yeni bir uygulama oluştur.
2. Yönlendirme adresi (redirect URL) zorunluysa site adresini yaz, kullanılmıyor.
3. İzinlerde **events:subscribe** (olaylara abone olma) seçili olsun.
4. **Webhooks** seçeneğini aç. Adresi 3. adımda Worker kurulunca gireceksin.
5. **Client ID** ve **Client Secret** değerlerini bir kenara not et. Bunları kimseyle paylaşma ve depoya yazma.

### 2. Worker kurulumu

[Node.js](https://nodejs.org) kurulu olmalı. Ardından `worker` klasöründe:

```
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put KICK_CLIENT_ID
npx wrangler secret put KICK_CLIENT_SECRET
```

`secret put` komutları değeri sorar, Kick uygulamasındaki değerleri yapıştır. `deploy` sonunda Worker'ın adresi yazılır, örneğin `https://takim-karma-kick.hesabin.workers.dev`.

İstersen `worker/wrangler.toml` içinde:

- `ALLOWED_CHANNELS` ile sadece kendi kanalına izin verebilirsin (`"revo"` gibi).
- `ALLOWED_ORIGINS` ile sadece kendi sitenin bağlanmasını sağlayabilirsin (`"https://kullaniciadi.github.io"` gibi).

Değiştirdikten sonra `npx wrangler deploy` komutunu tekrar çalıştır.

### 3. Webhook adresi

Kick uygulamasının webhook adresine Worker adresinin sonuna `/webhook` ekleyerek yaz:

```
https://takim-karma-kick.hesabin.workers.dev/webhook
```

### 4. Sitede bağlan

Sitede **Kick sohbeti** bölümüne kanal adını yaz, **Bağlantı sunucusu** altına Worker adresini gir ve **Bağlan**'a bas. Durum "Bağlı" olunca sohbette `!katil` yazan listeye düşer.

Worker adresini her seferinde girmek istemiyorsan `js/kick.js` dosyasındaki `DEFAULT_WORKER` değerine yazıp depoya gönder.

Bir sorun olursa sitedeki durum yazısı Kick'in döndürdüğü hatayı gösterir. Worker kayıtlarını canlı izlemek için `worker` klasöründe `npx wrangler tail` çalıştırabilirsin.

## Testler

```
node --test tests/
```

Dağıtım kuralları (eşit takımlar, kilitler, defans ve yedek mantığı) ve Worker'daki komut ayrıştırma ile imza doğrulama test edilir.
