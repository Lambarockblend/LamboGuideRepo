"""lg_talents.py: talentsforever.com data export -> library facts (offline, fake web)."""
import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import io
import json
import sys
import tempfile
import urllib.error
from email.message import Message
from pathlib import Path

sys.path.insert(0, ROOT + "")
import lg_library as L  # noqa: E402
import lg_talents as T  # noqa: E402

DATA = {
    "license": "CC-BY-4.0", "attribution": "Data from talentsforever.com (https://talentsforever.com)", "generated": "2026-11-04",
    "talents": {
        "Warrior": {"icon": "x", "classic_total": 52, "source": "Talent trees from the WoW Forever beta client, build 1.60.1.70755.",
                    "trees": [
                        {"name": "Protection", "talents": [
                            {"name": "Anticipation", "max": 5, "row": 2, "col": 1, "passive": True,
                             "desc": ["Increases your Defense Skill by 4.", "b", "c", "d", "Increases your Defense Skill by 20."],
                             "classic": {"status": "changed", "tree": "Protection", "text": "Increases your Defense skill by 2.", "moved": True}},
                            {"name": "Shield Slam", "max": 1, "row": 7, "col": 2, "req": "Concussion Blow", "cost": "20 Rage | Melee Range",
                             "desc": ["Slam the target with your shield."], "classic": {"status": "new"}, "hotfix": "2026-11-03"},
                        ], "removed": [{"name": "Toughness", "max": 5, "text": "armor", "row": 2}]},
                        {"name": "Arms", "talents": [], "removed": []},
                    ]},
    },
    "spell_desc": {
        "Warrior|Charge|Rank 1": {"d": "Charge an enemy.", "l": [["", "8-25 yd range"], ["Instant", "15 sec cooldown"]], "lv": "Learned at level 4"},
        "Warrior|Charge|Rank 2": {"d": "Charge an enemy, 60 rage.", "l": [], "lv": "Learned at level 26"},
        "Warrior|Taunt|": {"d": "Taunts the target.", "l": [["", "Melee Range"]], "lv": "Learned at level 10"},
        "Warrior|Last Stand|": {"d": "Gain health.", "l": [], "lv": "Learned at level 20", "nt": 3},
        "Warrior|Attack|": {"d": "", "l": [], "lv": ""},
        "Mage|Fireball|Rank 1": {"d": "Fire.", "l": [], "lv": "Learned at level 1"},
    },
    "class_abilities": {"Warrior": [["Rage", "From damage taken and your swings.", "icon"]]},
    "racials": {"Horde": [{"race": "Orc", "classes": ["Warrior", "Hunter"],
                           "abilities": [["Blood Fury", "Instant, 2 min cooldown.", "i"], ["Hardiness", "Stun duration reduced by 20%.", "i"]]}]},
    "class_racials": {"Priest": {"races": {"Human": [["Divine Grace", "Heals a friendly target.", "i"]]}}},
    "legacy": {"note": "Earned from challenges anywhere on your account.", "points": 16},
    "changelog": [{"date": "2026-11-02", "tag": "talents", "title": "Blizzard's 2 Nov notes", "text": "Warrior <b>changes</b> &amp; fixes."},
                  {"date": "2026-10-22", "tag": "site", "title": "Hunter video", "text": "not used"}],
}

# ---- build
pages = T.build(DATA)
assert set(pages) == {T.BASE + "warrior", T.BASE}, set(pages)
facts = [f["fact"] for f in pages[T.BASE + "warrior"][1]]
assert any(f.startswith("Warrior talent trees in WoW Forever: Protection (2 talents), Arms (0 talents).") for f in facts), facts[0]
assert any("Anticipation: max rank 5, row 2 column 1. Rank 1: Increases your Defense Skill by 4. Max rank: Increases your Defense Skill by 20."
           " Changed from Classic (Classic: Increases your Defense skill by 2.)." in f for f in facts)
assert any("Shield Slam: max rank 1" in f and "needs Concussion Blow" in f and "New in Forever" in f and "Hotfix 2026-11-03" in f for f in facts)
assert any("talents from Classic that are gone" in f and "Toughness (5 ranks)" in f for f in facts)
assert any(f.startswith("Warrior spells learned at level 4: Charge Rank 1") for f in facts)
assert any("level 20: Last Stand (not sold by the class trainer)" in f for f in facts)
assert any("Warrior ability Charge (Rank 1 at 4, Rank 2 at 26): Charge an enemy, 60 rage." in f for f in facts)
assert not any("Attack" in f and "ability" in f for f in facts), "spells with no learn level and no text are skipped as level facts only"
assert not any("Fireball" in f for f in facts), "other classes stay out of the Warrior page"
assert any("class mechanic Rage" in f for f in facts)
lvl = {f["fact"]: f.get("levels") for f in pages[T.BASE + "warrior"][1]}
assert lvl[[k for k in lvl if k.startswith("Warrior spells learned at level 4:")][0]] == "4"
gen = [f for f in pages[T.BASE][1]]
texts = [f["fact"] for f in gen]
assert any("Orc (Horde) racial abilities" in t and "Blood Fury" in t for t in texts)
assert any(f["race"] == "orc" for f in gen if "race" in f)
assert any("Human Priest racial class spells: Divine Grace" in t for t in texts)
assert any("change log 2026-11-02" in t and "Warrior changes & fixes." in t for t in texts)
assert not any("not used" in t for t in texts), "only talents/spells/builds change log entries"
assert any("Legacy perks" in t and "16 points" in t for t in texts)
assert all(len(f["fact"]) <= T.MAX_FACT + 40 for _, fs in pages.values() for f in fs)

# ---- update through a fake web
state = {"body": json.dumps(DATA), "robots": "User-agent: *\nAllow: /\n", "status": 200, "seen": []}


class Resp(io.BytesIO):
    def __init__(self, body):
        super().__init__(body.encode())
        self.status = 200
        self.headers = Message()
        self.headers["Content-Type"] = "application/json; charset=utf-8"
        self.headers["ETag"] = '"d1"'

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def opener(req, timeout=0):
    url = req.full_url
    if url.endswith("/robots.txt"):
        return Resp(state["robots"])
    assert url == T.SOURCE_URL, url
    state["seen"].append({k.lower(): v for k, v in req.headers.items()})
    if state["status"] == 304:
        raise urllib.error.HTTPError(url, 304, "Not Modified", Message(), None)
    return Resp(state["body"])


def fresh():
    return L.Library(Path(tempfile.mkdtemp()) / "lib.db"), L.Fetcher(log=lambda s: None, opener=opener, sleep=lambda s: None)


lib, fetcher = fresh()
logs = []
n = T.update(lib, fetcher, logs.append)
assert n == sum(len(fs) for _, fs in pages.values()) and lib.count() == n, (n, lib.count())
assert state["seen"][0]["accept"] == "application/json" and "if-none-match" not in state["seen"][0]
assert any("facts from talentsforever.com" in l for l in logs)
row = lib.db.execute("SELECT site, status, class, facts FROM pages WHERE url=?", (T.BASE + "warrior",)).fetchone()
assert row[0] == "talentsforever.com" and row[1] == "ok" and row[2] == "warrior" and row[3] > 5, row

# same content again: nothing rewritten; the stored ETag goes out as a conditional request
assert T.update(lib, fetcher, logs.append) == 0
assert state["seen"][-1]["if-none-match"] == '"d1"'
state["status"] = 304
assert T.update(lib, fetcher, logs.append) == 0
state["status"] = 200

# changed data: facts are replaced, not doubled
changed = json.loads(state["body"]); changed["spell_desc"]["Warrior|Taunt|"]["lv"] = "Learned at level 12"
state["body"] = json.dumps(changed)
before = lib.count()
assert T.update(lib, fetcher, logs.append) > 0 and lib.count() == before
assert any("level 12: Taunt" in r[0] for r in lib.db.execute("SELECT fact FROM facts WHERE url=?", (T.BASE + "warrior",)))

# license change or robots refusal: skipped
lib2, fetcher2 = fresh()
state["body"] = json.dumps({**DATA, "license": "All rights reserved"})
assert T.update(lib2, fetcher2, logs.append) == 0 and lib2.count() == 0
assert any("license is" in l for l in logs)
state["body"] = json.dumps(DATA)
state["robots"] = "User-agent: *\nDisallow: /data.json\n"
lib3, fetcher3 = fresh()
assert T.update(lib3, fetcher3, logs.append) == 0 and lib3.count() == 0
state["body"] = "not json"; state["robots"] = "User-agent: *\nAllow: /\n"
lib4, fetcher4 = fresh()
assert T.update(lib4, fetcher4, logs.append) == 0

# ---- what the AI gets: the right facts with the talentsforever.com link
notes = lib.notes_for_prompt("Anticipation talent ne işe yarıyor", "Class=Warrior; Race=Orc; Level=20")
assert "Anticipation" in notes and "[source: https://talentsforever.com/warrior]" in notes, notes
notes = lib.notes_for_prompt("Seviye 4 warrior eğitmenden ne öğrenmeliyim?", "Class=Warrior; Race=Orc; Level=4")
assert "spells learned at level 4" in notes, notes
# a question with no matching words does not drag in the data sheet's rows (only guide-style core facts do)
assert lib.notes_for_prompt("Hello", "Class=Warrior; Race=Orc; Level=4") == ""
print("talents OK:", n, "facts")
