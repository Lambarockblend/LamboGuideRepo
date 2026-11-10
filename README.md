# LamboGuide

**WoW: Forever için oyun içi yapay zekâ rehberi** — yapan: **Lambarock** · [English below](#english)

LamboGuide karakterini okur (ırk, sınıf, seviye, bölge, görevler, çanta, giyili eşyalar) ve sorularını oyunun içinde,
WoW Forever'a özel bilgilerle cevaplar. Cevaplar kendi ChatGPT hesabınla üretilir; API anahtarı ya da ek ücret gerekmez.

> LamboGuide **sadece okur ve öneri verir.** Oyunu senin yerine oynamaz, tuşa basmaz, karakteri hareket ettirmez.
> Blizzard ile bağlantısı olmayan bir hayran projesidir.

## Ne yapar
- **Soru sor, cevap oyuna gelsin.** `/lg` ya da sağ alttaki **LG** düğmesi. Cevap kendiliğinden pencereye düşer.
- **Kaynaklı cevaplar.** Her cevabın altında kaynak düğmeleri çıkar (tıkla → adres kopyalama kutusu).
- **Harita işareti + yön oku.** Cevaptaki "Haritada: …" düğmesi haritaya işaret koyar, ok mesafeyi gösterir. `/lg ok` kapatır.
- **Eşya sor, karşılaştır.** Eşyaya (ya da büyüye) Shift+tık ile birden fazlasını sohbet kutusuna bağla, soruyu kendin yaz. Ayarlar > "Fare altını ekle" ile atadığın tuş fare altındakini aynı şekilde etiketler (oyunun kullandığı tuşlar reddedilir, Alt+tuş öner).
- **Tek pencere, iki sayfa.** Karakter sayfası: karakter, aktif görevler (kısa açıklamalarıyla), meslekler, envanter araması. Yama Notları sayfası. Papirüs görünümü.
- **"Bu eşya daha iyi mi?"** Eşya ipucunda, giydiğinle öncelikli statlarda karşılaştırma (`/lg gear`).
- **Envanter.** Tüm karakterlerinin çanta, banka ve parası (`/lg envanter`), eşya ipucunda toplam adet.
- **Oturum bilgisi, müzayede fiyat hafızası, seviye ve zindan notları, önerilen addonlar** (`/lg addon`).
- **Rehber kütüphanesi.** Yardımcı, güvenilir Forever kaynaklarından kısa bilgiler derler ve günde iki kez arka planda günceller.
- Türkçe / İngilizce arayüz.

## Kurulum
1. [Son sürümden](../../releases/latest) `LamboGuide-Setup-<sürüm>.exe` dosyasını indir ve çalıştır.
   Windows "bilinmeyen yayıncı" derse: **Ek bilgi > Yine de çalıştır** (kurulum imzalı değil).
2. Kurulum addonu, bağlantı klasörlerini, yardımcı uygulamayı ve (istersen) Questie'yi kurar.
3. WoW açıksa **bir kez tamamen kapatıp aç**.
4. İlk açılışta yardımcıda "Yapay zekâya bağlan"a bas ve tarayıcıda ChatGPT girişini yap. Şifreni LamboGuide görmez.

Yardımcı saatin yanında **LG** simgesi olarak çalışır ve yeni sürüm çıkınca kendini günceller.
Kaldırmak için: Windows > Uygulamalar > LamboGuide.

CurseForge paketi yalnızca addonu içerir; yapay zekâ cevapları için yukarıdaki kurulum gerekir.

## Nasıl çalışır
WoW addonları internete ya da dosyalara erişemez. LamboGuide bu yüzden iki parçadır:

- **Addon (Lua):** arayüz ve karakter verisi.
- **Yardımcı (Windows):** soruyu alır, [Codex CLI](https://github.com/openai/codex) üzerinden senin ChatGPT oturumunla
  cevaplatır, cevabı oyuna geri yollar.

İkisi, oyunun kendi `AddOns.txt` dosyası üzerinden konuşur: kurulum `LamboGuideU001…U768` ve `LamboGuideD0001…D1024`
adlı **boş** addon klasörleri oluşturur; her birinin açık/kapalı durumu bir bittir. Ekran okunmaz, pano kullanılmaz,
oyuna tuş gönderilmez. Addon listesinde bu klasörleri "LamboGuide" grubu altında görürsün; silme ve elle açıp kapatma.

## Gizlilik
- Sorduğun soru ve karakter verisi (ad, sınıf, seviye, bölge, eşyalar, görevler) yalnızca kendi ChatGPT hesabına gider.
- LamboGuide'ın sunucusu yoktur; hiçbir veri bize gelmez.
- Yardımcı ayrıca rehber sitelerini (kütüphane için) ve GitHub'ı (yeni sürüm ve Questie indirmesi için) ziyaret eder; bu isteklerde karakter verin gönderilmez.
- Kayıtlar bilgisayarında kalır: `%LOCALAPPDATA%\LamboGuide` (sohbet geçmişi, kütüphane, günlük).

## Önerilen addonlar
Questie (görev konumları için önerilir), TomTom, Auctionator, Details. LamboGuide bunların dosyalarını içermez;
kuruluysa açık arayüzleri üzerinden kullanır. Ayrıntı: [SOURCES_AND_LICENSES.md](SOURCES_AND_LICENSES.md).

## Geliştiriciler için
```
pip install lupa
python tests/test_lua.py        # tests/ altındaki her dosya ayrı çalışır (sahte WoW ortamı)
python lamboguide_companion.py --install --wow "D:\Games\World of Warcraft"   # addonu ve bağlantı klasörlerini kurar (Windows)
python lamboguide_companion.py  # yardımcıyı pencereyle açar
```
`v*` etiketi gönderilince `.github/workflows/release.yml` Windows'ta kurulum exe'sini ve CurseForge zip'ini derler.
Hata günlüğü: `%LOCALAPPDATA%\LamboGuide\companion.log`. Oyun içi teşhis: `/lg linkdebug`.

## Lisans
[GPL-3.0](LICENSE) · Copyright (C) 2026 Lambarock. Yazı tipi: DejaVu Sans ([lisansı](DejaVuSans-LICENSE.txt)).
World of Warcraft ve ilgili adlar Blizzard Entertainment'a aittir.

---

## English
**In-game AI guide for WoW: Forever**, by **Lambarock**.

LamboGuide reads your character (race, class, level, zone, quests, bags, gear) and answers your questions inside the
game with Forever-specific guidance. Answers are produced with your own ChatGPT account; no API key is needed.
It is **read-only**: it never plays, presses keys or moves your character. Fan project, not affiliated with Blizzard.

**Features:** answers arrive in the game window by themselves · source buttons under every answer · map marker and
direction arrow · tag several items with Shift+click (or a hover key) and ask your own question · Character page
(quests with short descriptions, professions, inventory) and Patch Notes page · "is this item better?" tooltip line · inventory of
all your characters · session stats, auction price memory, level and dungeon notes · Turkish / English.

**Install:** download `LamboGuide-Setup-<version>.exe` from the [latest release](../../releases/latest) and run it
(unsigned: *More info > Run anyway*). Fully restart WoW once, then sign in to ChatGPT from the helper window.

**How it works:** addons cannot reach the network, so a small Windows helper asks the
[Codex CLI](https://github.com/openai/codex) with your ChatGPT sign-in. Addon and helper talk through the game's own
`AddOns.txt`: empty `LamboGuideU…/D…` addon folders whose enabled state carries one bit each. No screen reading, no
clipboard, no input sent to the game.

**Privacy:** your question and character data go only to your own ChatGPT account. LamboGuide has no server. The helper
also fetches guide sites (library) and GitHub (updates, Questie download) without sending character data.

License: [GPL-3.0](LICENSE).
