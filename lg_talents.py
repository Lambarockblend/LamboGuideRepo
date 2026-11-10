"""Talents Forever data -> LamboGuide library facts.

Source: https://talentsforever.com/data.json (fan-made WoW Forever talent calculator, data export under
CC BY 4.0, attribution: "Data from talentsforever.com"). The file lists, per class, every talent with its rank
texts and its difference from Classic, every trainer spell with the level each rank is learned at, racials and the
site's change log. We turn it into short facts for the library; every fact carries the talentsforever.com link
as its source, which is the attribution the license asks for.

Nothing here needs the AI: the data is structured, so the facts are built by code. If the file's license field
ever stops saying CC-BY-4.0, the update is skipped.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
from typing import Callable

import lg_library as LIB

SOURCE_URL = "https://talentsforever.com/data.json"
SITE = "talentsforever.com"
BASE = "https://talentsforever.com/"
LICENSE = "CC-BY-4.0"
MAX_FACT = 480
CHANGELOG_TAGS = {"talents", "spells", "builds"}
CHANGELOG_KEEP = 25


def _clip(text: str, n: int = MAX_FACT) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _plain(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text or ""))


def _classic_note(c: dict | None) -> str:
    if not c:
        return ""
    status = c.get("status", "")
    if status == "new":
        return " New in Forever (not in Classic)."
    if status == "changed":
        old = _clip(c.get("text", ""), 120)
        return " Changed from Classic" + (f" (Classic: {old})" if old else "") + "."
    if status == "moved":
        return f" Moved from Classic's {c.get('tree', '?')} tree."
    return ""


def _talent_facts(cname: str, cls: str, cdata: dict) -> list[dict]:
    facts: list[dict] = []
    trees = cdata.get("trees", [])
    overview = ", ".join(f"{t.get('name')} ({len(t.get('talents', []))} talents)" for t in trees)
    facts.append({"fact": _clip(f"{cname} talent trees in WoW Forever: {overview}. {cdata.get('source', '')}", 520),
                  "topic": "talents", "class": cls})
    for tree in trees:
        tname = tree.get("name", "")
        for t in tree.get("talents", []):
            desc = [d for d in t.get("desc", []) if d]
            text = f"{cname} {tname} talent {t.get('name')}: max rank {t.get('max', 1)}, row {t.get('row')} column {t.get('col')}"
            if t.get("req"):
                text += f", needs {t['req']}"
            text += "."
            if desc:
                text += f" Rank 1: {desc[0]}"
                if len(desc) > 1:
                    text += f" Max rank: {desc[-1]}"
            if t.get("cost"):
                text += f" Cost: {t['cost']}."
            text += _classic_note(t.get("classic"))
            if t.get("hotfix"):
                text += f" Hotfix {t['hotfix']}."
            facts.append({"fact": _clip(text), "topic": "talents", "class": cls})
        gone = tree.get("removed", [])
        if gone:
            names = ", ".join(f"{g.get('name')} ({g.get('max', 1)} ranks)" for g in gone)
            facts.append({"fact": _clip(f"{cname} {tname} talents from Classic that are gone in WoW Forever: {names}."),
                          "topic": "talents", "class": cls})
    return facts


def _level_of(entry: dict) -> int | None:
    m = re.search(r"level (\d+)", entry.get("lv", "") or "")
    return int(m.group(1)) if m else None


def _spell_facts(cname: str, cls: str, spell_desc: dict) -> list[dict]:
    """Trainer spells: one fact per level ("what do I learn at level N") and one per spell."""
    by_level: dict[int, list[str]] = {}
    by_spell: dict[str, list[tuple[int | None, str, dict]]] = {}
    for key, e in spell_desc.items():
        parts = key.split("|")
        if len(parts) != 3 or parts[0] != cname:
            continue
        _, spell, rank = parts
        by_spell.setdefault(spell, []).append((_level_of(e), rank, e))
    for spell, entries in by_spell.items():
        for lvl, rank, e in entries:
            if lvl is None:
                continue
            tag = (f" {rank}" if rank else "") + (" (not sold by the class trainer)" if e.get("nt") in (2, 3, 4) else "")
            by_level.setdefault(lvl, []).append(spell + tag)
    facts: list[dict] = []
    for lvl in sorted(by_level):
        facts.append({"fact": _clip(f"{cname} spells learned at level {lvl}: {', '.join(sorted(by_level[lvl]))}."),
                      "topic": "abilities", "class": cls, "levels": str(lvl)})
    for spell, entries in sorted(by_spell.items()):
        entries.sort(key=lambda x: (x[0] is None, x[0] or 0, x[1]))
        known = [x for x in entries if x[0] is not None]
        first, last = entries[0], entries[-1]
        levels = ", ".join(f"{x[1] or 'learned'} at {x[0]}" for x in known) if known else ""
        info = ""
        for line in first[2].get("l", []):
            info += " " + " | ".join(p for p in line if p) + "."
        desc = last[2].get("d", "")
        if not known and not desc:
            continue                                      # General-tab spells (Attack, Throw...) carry no text at all
        text = f"{cname} ability {spell}" + (f" ({levels})" if levels else "") + ":"
        if desc:
            text += f" {desc}"
        text += info
        lo = known[0][0] if known else None
        facts.append({"fact": _clip(text), "topic": "abilities", "class": cls, "levels": str(lo) if lo else ""})
    return facts


def _racial_facts(data: dict) -> list[dict]:
    facts: list[dict] = []
    for faction, races in data.get("racials", {}).items():
        for r in races:
            abil = "; ".join(f"{a[0]}: {a[1]}" for a in r.get("abilities", []) if len(a) >= 2)
            classes = ", ".join(r.get("classes", []))
            race = r.get("race", "").lower()
            facts.append({"fact": _clip(f"{r.get('race')} ({faction}) racial abilities in WoW Forever: {abil}. Playable classes: {classes}."),
                          "topic": "races", "race": re.sub(r"\s*\(.*\)", "", race)})
    for cname, info in data.get("class_racials", {}).items():
        for race, spells in info.get("races", {}).items():
            abil = "; ".join(f"{s[0]}: {s[1]}" for s in spells if len(s) >= 2)
            facts.append({"fact": _clip(f"{race} {cname} racial class spells: {abil}."), "topic": "races",
                          "class": cname.lower(), "race": race.lower()})
    return facts


def _class_ability_facts(data: dict) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for cname, items in data.get("class_abilities", {}).items():
        out[cname.lower()] = [{"fact": _clip(f"{cname} class mechanic {a[0]}: {a[1]}"), "topic": "mechanics", "class": cname.lower()}
                              for a in items if len(a) >= 2]
    return out


def _changelog_facts(data: dict) -> list[dict]:
    facts: list[dict] = []
    for e in data.get("changelog", []):
        if e.get("tag") in CHANGELOG_TAGS:
            facts.append({"fact": _clip(f"Talents Forever change log {e.get('date')}: {e.get('title')}. {_plain(e.get('text', ''))}"),
                          "topic": "patch notes"})
        if len(facts) >= CHANGELOG_KEEP:
            break
    return facts


def build(data: dict) -> dict[str, tuple[str, list[dict]]]:
    """-> { url: (title, facts) }, one page per class plus a general one."""
    pages: dict[str, tuple[str, list[dict]]] = {}
    abilities = _class_ability_facts(data)
    for cname, cdata in data.get("talents", {}).items():
        cls = cname.lower()
        facts = _talent_facts(cname, cls, cdata)
        facts += _spell_facts(cname, cls, data.get("spell_desc", {}))
        facts += abilities.get(cls, [])
        pages[f"{BASE}{cls}"] = (f"Talents Forever: {cname} talents and spells", facts)
    general = _racial_facts(data) + _changelog_facts(data)
    legacy = data.get("legacy") or {}
    if legacy.get("note"):
        general.append({"fact": _clip(f"WoW Forever Legacy perks: {legacy['note']} ({legacy.get('points')} points at launch)."),
                        "topic": "mechanics"})
    pages[BASE] = ("Talents Forever: racials, Legacy and change log", general)
    return pages


def update(lib: LIB.Library, fetcher: LIB.Fetcher, log: Callable[[str], None] = print) -> int:
    """Fetch data.json if it changed and rebuild the facts. -> number of facts written (0 when unchanged)."""
    if not fetcher.allowed(SOURCE_URL):
        log("talents: robots.txt does not allow the data file")
        return 0
    status, body, hdr = fetcher.get(SOURCE_URL, lib.get_meta("talents_etag"), lib.get_meta("talents_modified"), accept="application/json")
    if status == 304 or status != 200 or not body:
        return 0
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    if digest == lib.get_meta("talents_hash"):
        return 0
    try:
        data = json.loads(body)
    except ValueError:
        log("talents: data file is not valid JSON")
        return 0
    if data.get("license") != LICENSE:
        log(f"talents: license is {data.get('license')!r}, not {LICENSE}; skipped")
        return 0
    now = dt.datetime.now().isoformat(timespec="seconds")
    total = 0
    for url, (title, facts) in build(data).items():
        cls = url.rstrip("/").rsplit("/", 1)[-1] if url != BASE else ""
        lib.db.execute("INSERT OR REPLACE INTO pages(url, site, title, class, topic, etag, modified, hash, updated_label, fetched_at, facts, status) "
                       "VALUES(?,?,?,?,?,?,?,?,?,?,0,'ok')",
                       (url, SITE, title, cls, "talents", hdr.get("etag", ""), hdr.get("modified", ""), digest,
                        str(data.get("generated", "")), now))
        total += lib.replace_facts(url, SITE, title, facts)
    lib.set_meta("talents_etag", hdr.get("etag", ""))
    lib.set_meta("talents_modified", hdr.get("modified", ""))
    lib.set_meta("talents_hash", digest)
    log(f"talents: {total} facts from talentsforever.com data of {data.get('generated')}")
    return total
