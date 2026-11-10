# LamboGuide – sources and licenses

Rule: we take ideas, not code. Code is copied only when its license allows it, with the
copyright notice kept. GPL code is not copied (it would turn all of LamboGuide into GPL).
Other addons are used only through their public in-game API, and only if the player has them
installed. We never ship their files or data.

Checked on 2026-11-09.

| Project | License (checked) | How LamboGuide may use it |
|---|---|---|
| Talents Forever (talentsforever.com) | Data file `data.json`: CC BY 4.0 (the file says so; robots.txt allows it). Game names, icons and tooltip texts belong to Blizzard. | `lg_talents.py` downloads the file on the player's PC (twice a day, only when it changed, skipped if its license field stops saying CC-BY-4.0) and turns talents, trainer spells by level, racials and change log into library facts. Every fact carries its talentsforever.com link, which is the attribution. The data is not bundled with LamboGuide. |
| Polestar (fitzforge/polestar) | GPL-3.0 | Ideas only (an item comparison in the tooltip). No code or data copied. LamboGuide's `Gear.lua` / `GearData.lua` were written from scratch from the game's own API and the Icy Veins Forever priorities, and checked line by line against Polestar on 2026-11-10 (no shared code beyond one-word Lua lines such as `end`). |
| Icy Veins WoW Forever stat priority pages | Site content (facts used, not text) | `GearData.lua` stores the stat priority order and stated conversions for each of the 27 specs (pages updated 2026-11-04, checked 2026-11-10), with the source named in the file. No page text is copied; the AI line names Icy Veins as the source. |
| Wisp AI (fedeya/wisp-ai) | GPL-3.0 | Ideas only (addon-state mailbox, hover-item hotkey, map waypoint, routines). No code copied. The LamboGuide mailbox has its own frame format, names and code. |
| Questie / QuestieDB | Mixed: "all rights reserved" for old contributions, GPLv3 for newer ones | Do not copy code or ship its database. At runtime, if the player has Questie (Forever) installed, read NPC/quest/trainer positions through its public API. |
| DejaVu Sans font (`DejaVuSans.ttf`) | Bitstream Vera / Arev license, DejaVu changes public domain (`DejaVuSans-LICENSE.txt`, copied from the dejavu-fonts repository) | Shipped unchanged with the addon so Turkish letters show in the game. The license file travels with it. |
| Codex CLI (openai/codex) | Apache-2.0 | The installer bundles the official Windows release binary unchanged, with its license file. It runs on the player's PC with the player's own ChatGPT sign-in. |
| Ace3 (LibStub, CallbackHandler, …) | BSD-style (Ace3 Development Team) | May be embedded with the license text kept. Not needed so far. |
| HereBeDragons | No license file in the repo | Do not copy. Use the game's own C_Map functions instead. |
| WeakAuras | GPL-2.0 | Ideas only. |
| TomTom | Not verified (repo not reachable) | Optional: if installed, add a TomTom waypoint through its public API; otherwise use C_Map.SetUserWaypoint. |
| Auctionator / Syndicator | Not verified (repo not reachable) | Optional: read prices/inventory through their public API if installed. No code copied. |

Web sources for the guide library are listed separately (robots.txt and terms checked per site).
Wowhead: not crawled by us; only reached through the AI provider's own live search, and only
linked as a source.
