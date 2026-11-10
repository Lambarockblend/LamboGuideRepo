import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import io
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, ROOT + "")
tmp = Path(tempfile.mkdtemp())
os.environ["LOCALAPPDATA"] = str(tmp / "appdata")
import lg_setup as S  # noqa: E402
import lg_update as U  # noqa: E402

drive = tmp / "D"
forever = drive / "Games" / "World of Warcraft" / "_forever_"
(forever / "Interface" / "AddOns").mkdir(parents=True)
(drive / "Games" / "World of Warcraft" / "_retail_").mkdir()

assert S.find_forever(drives=[str(drive)]) == forever
assert S.find_forever(str(drive / "Games" / "World of Warcraft")) == forever
assert S.find_forever(str(tmp / "nothing")) is None


def make_zip(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return b.getvalue()


ZIPS = {
    "Questie/Questie": make_zip({"Questie/Questie_Forever.toc": "## Interface: 16001", "../evil.txt": "x"}),
    "Questie/QuestieDB": make_zip({"QuestieDB/QuestieDB.toc": "## Interface: 16001"}),
}


class R(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def opener(req, timeout=0):
    url = req.full_url
    for repo, blob in ZIPS.items():
        if url == f"https://api.github.com/repos/{repo}/releases/latest":
            return R(json.dumps({"tag_name": "v1", "assets": [{"name": "src.tar.gz"}, {"name": repo.split('/')[1] + "-v1.zip",
                                 "browser_download_url": "https://dl/" + repo}]}).encode())
        if url == "https://dl/" + repo:
            return R(blob)
    raise AssertionError(url)


log = []
res = S.install(Path(ROOT + ""), None, questie=True, autostart=False, log=log.append, opener=opener, drives=[str(drive)])
addons = forever / "Interface" / "AddOns"
assert (addons / "LamboGuide" / "LamboGuide.toc").exists() and (addons / "LamboGuide" / "Extras.lua").exists()
assert not (addons / "LamboGuide" / "lamboguide_companion.py").exists(), "helper code must not go into the game folder"
assert (addons / "LamboGuideU001" / "LamboGuideU001.toc").exists() and (addons / "LamboGuideD1024").exists()
assert res["links_created"] == 1792, res
assert (addons / "Questie" / "Questie_Forever.toc").exists() and (addons / "QuestieDB").exists()
assert not (addons.parent / "evil.txt").exists() and not (addons / "evil.txt").exists(), "zip path escape"
assert json.loads((tmp / "appdata" / "LamboGuide" / "install.json").read_text())["forever"] == str(forever)
# second run: nothing new to create, Questie replaced cleanly
res2 = S.install(Path(ROOT + ""), str(forever), questie=False, autostart=False, log=log.append)
assert res2["links_created"] == 0
S.uninstall(log.append, str(forever))
assert not any(addons.glob("LamboGuide*")) and (addons / "Questie").exists(), "uninstall must keep Questie"

# the helper finds the installed game through install.json
(addons / "LamboGuide").mkdir(); (addons / "LamboGuide" / "LamboGuide.toc").write_text("x")
assert S.find_addons_dir() == addons

# files of the old reply path (before 0.7.1) are cleaned up, nothing else is touched
(addons / "LamboGuideSlot001").mkdir(); (addons / "LamboGuideSlot001" / "Inbox.lua").write_text("x")
(addons / "LamboGuide" / "sig").mkdir(); (addons / "LamboGuide" / "sig" / "001.wav").write_bytes(b"")
(addons / "LamboGuideSlotMachine").mkdir()                       # someone else's addon with a similar name
assert S.remove_old_link_files(addons, log.append) == 2
assert not (addons / "LamboGuideSlot001").exists() and not (addons / "LamboGuide" / "sig").exists()
assert (addons / "LamboGuideSlotMachine").exists() and (addons / "LamboGuide" / "LamboGuide.toc").exists() and (addons / "Questie").exists()

# updater
assert U.newer("v0.8.0", "0.7.9") and not U.newer("v0.7.0", "0.7.0") and U.newer("1.0", "0.9.9")
rel_json = {"tag_name": "v0.8.0", "assets": [{"name": "LamboGuide-0.8.0-curseforge.zip", "browser_download_url": "x"},
                                            {"name": "LamboGuide-Setup-0.8.0.exe", "browser_download_url": "https://dl/setup"}]}
op = lambda req, timeout=0: R(json.dumps(rel_json).encode())
base = tmp / "base"; base.mkdir()
(base / "version.json").write_text(json.dumps({"version": "0.7.0", "repo": "me/LamboGuide"}))
rel = U.check(base, op)
assert rel and rel["url"] == "https://dl/setup", rel
(base / "version.json").write_text(json.dumps({"version": "0.8.0", "repo": "me/LamboGuide"}))
assert U.check(base, op) is None
(base / "version.json").write_text(json.dumps({"version": "0.7.0", "repo": ""}))
assert U.check(base, op) is None, "no repo configured -> no update"
stamp = tmp / "stamp"
assert U.due(stamp); U.touch(stamp); assert not U.due(stamp)
print("setup + update OK:", res["questie"])
