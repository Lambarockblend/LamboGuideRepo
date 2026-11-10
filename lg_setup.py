"""LamboGuide setup: everything the one-click installer does, so the player has nothing else to do.

    LamboGuideHelper.exe --install [--questie] [--wow "D:\\Games\\World of Warcraft"]
    LamboGuideHelper.exe --uninstall

* finds WoW: Forever (registry, Battle.net settings, common folders on every drive)
* copies the LamboGuide addon and creates its link folders
* optionally downloads Questie + QuestieDB from their official GitHub releases (on the
  player's own PC, with their consent; we never ship their files)
* starts the helper with Windows (tray icon, no window)
"""
from __future__ import annotations

import io
import json
import os
import shutil
import string
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

APP = "LamboGuide"
UA = "LamboGuideSetup"
QUESTIE_REPOS = ("Questie/Questie", "Questie/QuestieDB")
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def data_dir() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / APP


# ---------------------------------------------------------------- finding the game
def _registry_paths() -> list[Path]:
    out: list[Path] = []
    try:
        import winreg
    except ImportError:
        return out
    keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Blizzard Entertainment\World of Warcraft", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\World of Warcraft", "InstallLocation"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\World of Warcraft", "InstallLocation"),
    ]
    for hive, sub, name in keys:
        try:
            with winreg.OpenKey(hive, sub) as k:
                value, _ = winreg.QueryValueEx(k, name)
                if value:
                    out.append(Path(value))
        except OSError:
            pass
    return out


def _battlenet_paths() -> list[Path]:
    cfg = Path(os.environ.get("APPDATA", "")) / "Battle.net" / "Battle.net.config"
    try:
        data = json.loads(cfg.read_text(encoding="utf-8", errors="replace"))
        base = data.get("Client", {}).get("Install", {}).get("DefaultInstallPath")
        return [Path(base) / "World of Warcraft"] if base else []
    except (OSError, ValueError):
        return []


def candidate_roots(drives: list[str] | None = None) -> list[Path]:
    roots = []
    for p in _registry_paths() + _battlenet_paths():
        roots += [p, p.parent]                       # registry may point at _retail_ or at the game root
    for env in ("ProgramFiles(x86)", "ProgramFiles"):
        if os.environ.get(env):
            roots.append(Path(os.environ[env]) / "World of Warcraft")
    if drives is None:
        drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")] if os.name == "nt" else []
    for d in drives:
        for sub in ("World of Warcraft", "Games/World of Warcraft", "Program Files (x86)/World of Warcraft",
                    "Program Files/World of Warcraft", "Battle.net/World of Warcraft", "Blizzard/World of Warcraft"):
            roots.append(Path(d) / sub)
    seen, out = set(), []
    for r in roots:
        key = str(r).lower()
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def find_forever(explicit: str | None = None, drives: list[str] | None = None) -> Path | None:
    """Returns the _forever_ folder (the one that holds Interface/ and WTF/)."""
    tries = [Path(explicit)] if explicit else candidate_roots(drives)
    for root in tries:
        for cand in (root, root / "_forever_"):
            if cand.name.lower() == "_forever_" and cand.is_dir():
                return cand
    return None


def find_addons_dir() -> Path | None:
    """AddOns folder of the WoW Forever copy that has LamboGuide in it (installer's choice first)."""
    try:
        info = json.loads((data_dir() / "install.json").read_text(encoding="utf-8"))
        c = Path(info["forever"]) / "Interface" / "AddOns"
        if (c / "LamboGuide" / "LamboGuide.toc").exists():
            return c
    except (OSError, ValueError, KeyError):
        pass
    for root in candidate_roots():
        c = root / "_forever_" / "Interface" / "AddOns"
        if (c / "LamboGuide" / "LamboGuide.toc").exists():
            return c
    return None


def remove_old_link_files(addons: Path, log: Callable[[str], None] = print) -> int:
    """Versions before 0.7.1 used LamboGuideSlot001..060 folders and LamboGuide\\sig\\*.wav. They are ours and unused now."""
    n = 0
    for p in addons.glob("LamboGuideSlot[0-9][0-9][0-9]"):
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
            n += 1
    sig = addons / "LamboGuide" / "sig"
    if sig.is_dir():
        shutil.rmtree(sig, ignore_errors=True)
        n += 1
    if n:
        log(f"old link files removed: {n}")
    return n


# ---------------------------------------------------------------- installing files
ADDON_FILES = ("LamboGuide.toc", "Core.lua", "Mailbox.lua", "Knowledge.lua", "Extras.lua", "GearData.lua", "Gear.lua", "Bindings.xml", "DejaVuSans.ttf", "DejaVuSans-LICENSE.txt")


def install_addon(src: Path, forever: Path, log: Callable[[str], None] = print) -> Path:
    dest = forever / "Interface" / "AddOns" / "LamboGuide"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ADDON_FILES:
        if (src / name).exists():
            shutil.copy2(src / name, dest / name)
    log(f"addon -> {dest}")
    return dest


def create_links(forever: Path, log: Callable[[str], None] = print) -> int:
    import lg_mailbox as MB
    made = MB.ensure_bank(forever / "Interface" / "AddOns")
    log(f"link folders created: {made}")
    return made


# ---------------------------------------------------------------- Questie from its official releases
def _get(url: str, opener=urllib.request.urlopen) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
    with opener(req, timeout=60) as r:
        return r.read()


def pick_asset(assets: list[dict]) -> dict | None:
    zips = [a for a in assets if str(a.get("name", "")).lower().endswith(".zip")]
    forever = [a for a in zips if "forever" in a["name"].lower()]
    return (forever or zips or [None])[0]


def install_github_addon(repo: str, addons: Path, opener=urllib.request.urlopen, log: Callable[[str], None] = print) -> list[str]:
    rel = json.loads(_get(f"https://api.github.com/repos/{repo}/releases/latest", opener))
    asset = pick_asset(rel.get("assets", []))
    if not asset:
        raise RuntimeError(f"{repo}: no zip in the latest release")
    blob = _get(asset["browser_download_url"], opener)
    top: set[str] = set()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for info in z.infolist():
            parts = Path(info.filename).parts
            if not parts or ".." in parts or Path(info.filename).is_absolute():
                continue                                   # never write outside AddOns
            top.add(parts[0])
        for folder in top:
            target = addons / folder
            if target.exists():
                shutil.rmtree(target)
        z.extractall(addons, members=[i for i in z.infolist() if ".." not in Path(i.filename).parts and not Path(i.filename).is_absolute()])
    log(f"{repo} {rel.get('tag_name', '')} -> {', '.join(sorted(top))}")
    return sorted(top)


# ---------------------------------------------------------------- autostart
def set_autostart(command: str | None, log: Callable[[str], None] = print) -> bool:
    try:
        import winreg
    except ImportError:
        return False
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if command:
            winreg.SetValueEx(k, APP, 0, winreg.REG_SZ, command)
            log("autostart on")
        else:
            try:
                winreg.DeleteValue(k, APP)
            except OSError:
                pass
            log("autostart off")
    return True


def helper_command() -> str:
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --tray'
    pyw = Path(sys.executable).with_name("pythonw.exe")
    return f'"{pyw if pyw.exists() else sys.executable}" "{Path(__file__).with_name("lamboguide_companion.py")}" --tray'


# ---------------------------------------------------------------- whole flow
def install(src: Path, wow: str | None = None, questie: bool = False, autostart: bool = True,
            log: Callable[[str], None] = print, opener=urllib.request.urlopen, drives: list[str] | None = None) -> dict:
    forever = find_forever(wow, drives)
    if not forever:
        raise RuntimeError("WoW Forever klasörü bulunamadı. Kurulumda klasörü elle seç.")
    install_addon(src, forever, log)
    made = create_links(forever, log)
    remove_old_link_files(forever / "Interface" / "AddOns", log)
    result = {"forever": str(forever), "links_created": made, "questie": []}
    if questie:
        for repo in QUESTIE_REPOS:
            try:
                result["questie"] += install_github_addon(repo, forever / "Interface" / "AddOns", opener, log)
            except Exception as exc:                       # the guide still works without Questie
                log(f"{repo}: {exc}")
    if autostart:
        set_autostart(helper_command(), log)
    data_dir().mkdir(parents=True, exist_ok=True)
    (data_dir() / "install.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    return result


def uninstall(log: Callable[[str], None] = print, wow: str | None = None) -> None:
    set_autostart(None, log)
    forever = find_forever(wow)
    if forever:
        addons = forever / "Interface" / "AddOns"
        for p in addons.glob("LamboGuide*"):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
        log("addon and link folders removed")
