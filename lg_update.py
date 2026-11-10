"""Self-update: once a day the helper asks GitHub for the newest LamboGuide release and, if it is
newer, runs its installer silently (the installer replaces the addon and the helper and
starts the helper again)."""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Callable

UA = "LamboGuideUpdater"
SETUP_NAME = re.compile(r"LamboGuide[-_ ]?Setup.*\.exe$", re.I)


def load_version(base: Path) -> dict:
    try:
        return json.loads((base / "version.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"version": "0.0.0", "repo": ""}


def newer(a: str, b: str) -> bool:
    """True when version a is newer than b ("v0.8.1" > "0.8.0")."""
    def parts(v):
        return [int(x) for x in re.findall(r"\d+", v)[:4]] + [0] * 4
    return parts(a)[:4] > parts(b)[:4]


def latest(repo: str, opener=urllib.request.urlopen) -> dict | None:
    if not repo or "/" not in repo:
        return None
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/releases/latest",
                                 headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
    with opener(req, timeout=30) as r:
        rel = json.loads(r.read())
    asset = next((a for a in rel.get("assets", []) if SETUP_NAME.search(a.get("name", ""))), None)
    if not asset:
        return None
    return {"version": rel.get("tag_name", ""), "url": asset["browser_download_url"], "name": asset["name"]}


def check(base: Path, opener=urllib.request.urlopen) -> dict | None:
    info = load_version(base)
    rel = latest(info.get("repo", ""), opener)
    if rel and newer(rel["version"], info.get("version", "0")):
        return rel
    return None


def download_and_run(rel: dict, log: Callable[[str], None] = print, opener=urllib.request.urlopen) -> bool:
    if os.name != "nt":
        return False
    req = urllib.request.Request(rel["url"], headers={"User-Agent": UA})
    target = Path(tempfile.gettempdir()) / rel["name"]
    with opener(req, timeout=300) as r:
        target.write_bytes(r.read())
    log(f"update: running {target.name} ({rel['version']})")
    # Inno Setup silent flags; the installer closes and restarts the helper itself.
    subprocess.Popen([str(target), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"],
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
    return True


def due(stamp_file: Path, every: float = 86400) -> bool:
    try:
        return time.time() - float(stamp_file.read_text()) > every
    except (OSError, ValueError):
        return True


def touch(stamp_file: Path):
    stamp_file.parent.mkdir(parents=True, exist_ok=True)
    stamp_file.write_text(str(time.time()))
