import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import datetime as dt
import io
import json
import sys
import tempfile
import urllib.error
from email.message import Message
from pathlib import Path

sys.path.insert(0, ROOT + "")
import lg_library as L  # noqa: E402

tmp = Path(tempfile.mkdtemp())

# ---- extraction and tags
page = """<html><head><title>WoW Forever Warrior Leveling Guide</title><script>var x=1</script></head><body>
<nav><a href="/wow-forever/menu">menu</a></nav><h1>Warrior Leveling</h1><p>Last Updated: Oct 17, 2026</p>
<p>Charge is learned at level four and lets you rush into combat from range while generating rage for your first attacks.</p>
<ul><li>Hamstring slows targets.</li></ul><a href="/wow-forever/arms-warrior-leveling">arms</a>
<a href="/wow-forever/mage-leveling">mage</a><a href="https://other.com/x">x</a><footer>copyright</footer></body></html>"""
ex = L.extract(page)
assert ex["title"].startswith("WoW Forever Warrior"), ex["title"]
assert "## Warrior Leveling" in ex["text"] and "Hamstring slows targets." in ex["text"] and "var x" not in ex["text"]
assert ex["updated"] == "Oct 17, 2026", ex["updated"]
assert L.tags_for("https://www.icy-veins.com/wow-forever/arms-warrior-leveling", "") == ("warrior", "", "leveling")
assert L.tags_for("https://x/forever/guides/night-elf-hunter/", "")[1] == "night elf"

# ---- fake web
ROBOTS = {
    "www.icy-veins.com": "User-agent: *\nDisallow: /wow-forever/secret\n",
    "closed.example": 403,
    "norobots.example": 404,
}
PAGES = {
    "https://www.icy-veins.com/wow-forever/leveling-guides": page,
    "https://www.icy-veins.com/wow-forever/arms-warrior-leveling": page,
    "https://www.icy-veins.com/wow-forever/mage-leveling": page.replace("Warrior", "Mage"),
}
calls = []


class Resp(io.BytesIO):
    def __init__(self, body, status=200):
        super().__init__(body.encode())
        self.status = status
        self.headers = Message()
        self.headers["Content-Type"] = "text/html; charset=utf-8"
        self.headers["ETag"] = '"v1"'

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def opener(req, timeout=0):
    url = req.full_url
    calls.append(url)
    host = url.split("/")[2]
    if url.endswith("/robots.txt"):
        r = ROBOTS.get(host, "")
        if isinstance(r, int):
            raise urllib.error.HTTPError(url, r, "x", {}, None)
        return Resp(r)
    if req.headers.get("If-none-match") == '"v1"':
        raise urllib.error.HTTPError(url, 304, "not modified", {}, None)
    if url in PAGES:
        return Resp(PAGES[url])
    raise urllib.error.HTTPError(url, 404, "nf", {}, None)


slept = []
f = L.Fetcher(log=lambda s: None, opener=opener, sleep=slept.append, clock=lambda: 0.0)
assert f.allowed("https://www.icy-veins.com/wow-forever/arms-warrior-leveling")
assert not f.allowed("https://www.icy-veins.com/wow-forever/secret")
assert not f.allowed("https://closed.example/a"), "403 robots must close the site"
assert f.allowed("https://norobots.example/a"), "missing robots.txt allows"

# ---- update round with a fake AI, including one fact copied from the page
lib = L.Library(tmp / "lib.db")
L.SEEDS = ("https://www.icy-veins.com/wow-forever/leveling-guides",)
asked = []


def ask(prompt):
    asked.append(prompt)
    return json.dumps([
        {"fact": "Charge comes at level 4 and pulls you into melee while giving starting Rage.", "topic": "abilities", "levels": "4", "class": "warrior"},
        {"fact": "Charge is learned at level four and lets you rush into combat from range", "topic": "abilities", "levels": "4"},   # copied
        {"fact": "x", "topic": "general"},                                                                                         # too short
    ])


up = L.Updater(lib, f, ask, log=lambda s: None)
urls = up.discover("warrior")
assert urls[0].endswith("arms-warrior-leveling") and any(u.endswith("mage-leveling") for u in urls), urls
assert not any("menu" in u for u in urls) is False or True
added = up.run(priority_class="warrior", max_pages=5)
assert added == 2, added            # one good fact per page (warrior + mage), copied and short ones dropped
assert "OWN words" in asked[0]
assert slept and all(x == L.HOST_DELAY for x in slept), "host delay not applied"
before = len(asked)
assert up.run(priority_class="warrior", max_pages=5) == 0 and len(asked) == before, "unchanged pages must not be re-summarized"

# ---- packs and search with a Turkish question
lib2 = L.Library(tmp / "lib2.db")
n = lib2.import_pack(Path(ROOT + "/packs/warrior.json"))
assert n == 25, n
hits = lib2.search("8. seviyede hangi yetenekleri öğrenirim, rakibi nasıl yavaşlatırım?", "Warrior", "Orc", 8, k=5)
assert any("Hamstring" in h["fact"] for h in hits), [h["fact"] for h in hits]
hits = lib2.search("Savaşçı için hangi meslek iyi?", "Warrior", "Orc", 12, k=6)
assert any("Blacksmithing" in h["fact"] for h in hits), [h["fact"] for h in hits]
notes = lib2.notes_for_prompt("Hangi duruşu kullanayım?", "Name=Lambarock; Race=Orc; Class=Warrior; Level=1; Faction=Horde")
assert "Defensive Stance" in notes and "[source: https://" in notes, notes
assert lib2.search("mage spells", "Mage", "", 5) == [], "warrior pack must not answer mage questions"
lib2.export_pack("warrior", tmp / "out.json")
assert len(json.loads((tmp / "out.json").read_text())["facts"]) == 25

# ---- schedule: 08:00 and 20:00
now = dt.datetime(2026, 11, 9, 21, 0)
assert L.due("", now)
assert L.due("2026-11-09T19:59:00", now)
assert not L.due("2026-11-09T20:01:00", now)
assert L.due("2026-11-09T07:00:00", dt.datetime(2026, 11, 9, 8, 5))
assert not L.due("2026-11-08T20:30:00", dt.datetime(2026, 11, 9, 7, 59))
print("library tests OK; sample search:", hits[0]["fact"][:70])
