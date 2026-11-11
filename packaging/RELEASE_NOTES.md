## LamboGuide 0.7.4

**WoW: Forever için oyun içi yapay zekâ rehberi** — yapan Lambarock. 0.7.4: kurulum artık Başlat menüsüne ve masaüstüne LamboGuide kısayolu ekler (yardımcıyı kapatırsan buradan tekrar açarsın).
**In-game AI guide for WoW: Forever** — by Lambarock. 0.7.4: the installer now adds a LamboGuide shortcut to the Start menu and desktop (reopen the helper from there if you close it).

**Yardımcı kapandıysa:** Başlat menüsü veya masaüstündeki LamboGuide kısayoluna bas; saatin yanındaki (gizli oklar `^` içinde olabilir) LG simgesi görünür.
**If the helper was closed:** open the LamboGuide shortcut (Start menu/desktop); the LG icon appears next to the clock (it may be under the `^` arrow).

**Kurulum:** `LamboGuide-Setup-0.7.4.exe` dosyasını indirip çalıştır. Windows "bilinmeyen yayıncı" uyarısı verirse
"Ek bilgi" > "Yine de çalıştır" (kurulum imzalı değil). Kurulumdan sonra WoW'u bir kez tamamen kapatıp aç, yardımcıda
"Yapay zekâya bağlan"a bas ve ChatGPT girişini yap. Şifreni LamboGuide görmez.

**Install:** download and run `LamboGuide-Setup-0.7.4.exe`. If Windows warns about an unknown publisher choose
"More info" > "Run anyway" (the installer is unsigned). Fully restart WoW once, press "Connect to AI" in the helper
and sign in to ChatGPT. LamboGuide never sees your password.

### Oyun içi addon / In-game addon
- Soru sor, cevap kendiliğinden gelsin; bekleme sırasında "Düşünüyor" animasyonu. / Ask, the answer arrives by itself, with a "Thinking" animation while you wait.
- Kaynak düğmeleri, haritaya işaret ve yön oku. / Source buttons, map marker and direction arrow.
- Shift+tık ile birden fazla eşya/büyüyü sohbet kutusuna bağla, kendi sorunu yaz (karşılaştırma için); fare altı tuşu da aynı şekilde etiketler. Oyunun kullandığı tuşlar (W, S…) reddedilir. / Shift+click several items or spells into the chat box and write your own question (comparisons); the hover key tags the same way and refuses keys the game already uses.
- Tek pencere: Karakter sayfası (karakter, aktif görevler kısa açıklamalarıyla, meslekler, envanter araması) ve Yama Notları sayfası, papirüs görünümlü. / One window: a Character page (character, active quests with short descriptions, professions, inventory search) and a Patch Notes page, on parchment.
- Eşya ipucunda "Bu eşya daha iyi mi?" satırı, tüm karakterlerin envanteri, müzayede fiyat hafızası, seviye ve zindan notları, önerilen addonlar. / "Is this item better?" tooltip line, account-wide inventory, auction price memory, level and dungeon notes, recommended addons.
- Sohbet geçmişi, sohbet listesi, Türkçe / İngilizce arayüz, Türkçe harfli yazı tipi. / Chat history and list, Turkish / English UI, a font with Turkish letters.

### Yardımcı program / Helper app
- Soruyu senin ChatGPT hesabınla (Codex CLI) cevaplar; API anahtarı ve ek ücret yok. Model "Auto": hesabının izin verdiği model kullanılır. / Answers with your own ChatGPT account via Codex CLI; no API key or extra cost. Model "Auto" uses whatever your plan allows.
- Oyunla `AddOns.txt` üzerinden konuşur: ekran okumaz, pano ve tuş göndermez. / Talks to the game through `AddOns.txt`: no screen reading, clipboard or key input.
- Tek kopya çalışır, saatin yanında LG simgesi, yeni sürümü kendi bulur ve günceller. / Single instance, tray icon, finds and installs updates by itself.
- Güvenilir Forever kaynaklarından rehber kütüphanesi (günde iki kez arka planda). / Guide library from trusted Forever sources, refreshed twice a day in the background.

Yalnızca okur ve öneri verir; oyunu senin yerine oynamaz. Blizzard ile bağlantısı yoktur. Lisans: GPL-3.0.
It only reads and suggests; it never plays for you. Not affiliated with Blizzard. License: GPL-3.0.

`LamboGuide-0.7.4-curseforge.zip` yalnızca addonu içerir (CurseForge için). / Addon-only package (for CurseForge).
