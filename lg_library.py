"""LamboGuide guide library.

Reads WoW Forever guide pages from sites that allow it (robots.txt checked every time),
turns them into short facts written in our own words (by the AI, with a no-copy check),
and keeps them in a local SQLite full-text index. Before every question the helper looks up
the most relevant facts and gives them to the AI together with their source links.
Guide text itself is never stored or shown, only our summaries plus the link.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable, Iterable

USER_AGENT = "LamboGuideLibrary/0.6 (personal WoW Forever guide helper; respects robots.txt)"
HOST_DELAY = 4.0             # seconds between requests to the same site
MAX_FACTS_PER_PAGE = 30
COPY_SHINGLE = 8             # a fact may not share any 8-word run with the source page

CLASSES = ("warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid")
RACES = ("human", "dwarf", "night elf", "gnome", "orc", "undead", "tauren", "troll")

# Index pages to start from, and which links on each site count as Forever guides.
SEEDS = (
    "https://www.icy-veins.com/wow-forever/leveling-guides",
    "https://www.warcrafttavern.com/forever/guides/type/leveling/",
    "https://www.warcrafttavern.com/forever/guides/",
    "https://www.method.gg/wow-forever",
    "https://mobalytics.gg/wow-forever/guides",
    "https://wowtbc.gg/warcraftforever/",
)
FOLLOW = {
    "www.icy-veins.com": re.compile(r"^/wow-forever/[a-z0-9-]+$"),
    "www.warcrafttavern.com": re.compile(r"^/forever/guides/[a-z0-9-]+/?$"),
    "www.method.gg": re.compile(r"^/wow-forever/[a-z0-9-]+$"),
    "mobalytics.gg": re.compile(r"^/wow-forever/(classes|guides)/[a-z0-9-]+$"),
    "wowtbc.gg": re.compile(r"^/warcraftforever/[a-z0-9-]+(/[a-z0-9-]+)?/?$"),
}

# Turkish question words -> English terms used in the facts.
TR_EN = {
    "görev": "quest", "gorev": "quest", "yetenek": "talent ability", "talent": "talent", "meslek": "profession",
    "zindan": "dungeon", "ırk": "race", "irk": "race", "silah": "weapon", "zırh": "armor", "zirh": "armor",
    "seviye": "level", "rotasyon": "rotation", "büyü": "spell ability", "buyu": "spell ability", "eşya": "item gear",
    "esya": "item gear", "öfke": "rage", "ofke": "rage", "kamp": "camp camping", "binek": "mount riding",
    "duruş": "stance", "durus": "stance", "eğitmen": "trainer", "egitmen": "trainer", "para": "gold money",
    "altın": "gold", "altin": "gold", "tank": "tank threat", "iyileş": "heal", "iyiles": "heal", "pet": "pet",
    "maden": "mining", "demirci": "blacksmithing", "deri": "leatherworking skinning", "aşçı": "cooking", "asci": "cooking",
    "ilk yardım": "first aid", "simya": "alchemy", "terzi": "tailoring", "büyücülük": "enchanting",
    "öğren": "learned level spells", "ogren": "learned level spells", "ırk özellik": "racial", "miras": "legacy",
    "hızlı": "fast leveling", "hizli": "fast leveling", "solo": "solo", "grup": "group", "istatistik": "stat",
}
STOP = set("the and for with that this from your you are was what how when where which into have has had not but can will "
           "bir bu şu ne nasıl neden için ile ve veya mı mi mu mü da de ki gibi daha çok en hangi olarak olur".split())


# ---------------------------------------------------------------- text extraction
class _Extract(HTMLParser):
    SKIP = {"script", "style", "nav", "footer", "header", "aside", "form", "noscript", "svg", "button", "select"}
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "td", "th", "dd", "dt", "blockquote"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts: list[str] = []
        self.buf: list[str] = []
        self.links: list[str] = []
        self.title = ""
        self._in_title = False
        self._tag = ""

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        if tag in self.BLOCK:
            self._flush()
            self._tag = tag

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        if tag == "title":
            self._in_title = False
        if tag in self.BLOCK:
            self._flush()

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if not self.skip:
            self.buf.append(data)

    def _flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if len(text) > 2:
            self.parts.append(("## " if self._tag in ("h1", "h2", "h3", "h4") else "") + text)


def extract(page_html: str) -> dict:
    p = _Extract()
    p.feed(page_html)
    p._flush()
    text = "\n".join(p.parts)
    updated = re.search(r"(?:Last Updated|Updated on|Last reviewed)[:\s]*([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}|[A-Z][a-z]+ \d{4})", text)
    return {"title": html.unescape(p.title).strip(), "text": text, "links": p.links, "updated": updated.group(1) if updated else ""}


def tags_for(url: str, title: str) -> tuple[str, str, str]:
    s = (url + " " + title).lower().replace("_", "-")
    cls = next((c for c in CLASSES if re.search(rf"(^|[^a-z]){c}([^a-z]|$)", s)), "")
    race = next((r for r in RACES if r.replace(" ", "-") in s or r in s), "")
    if "class-quest" in s or "class quest" in s:
        topic = "class quests"
    elif "level" in s:
        topic = "leveling"
    elif "profession" in s or any(x in s for x in ("mining", "herbalism", "alchemy", "blacksmith", "cooking", "camp")):
        topic = "professions"
    elif any(x in s for x in ("pve", "dps", "tank", "heal", "raid", "dungeon")):
        topic = "pve"
    else:
        topic = "general"
    return cls, race, topic


# ---------------------------------------------------------------- no-copy check
def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def shingles(text: str, n: int = COPY_SHINGLE) -> set[tuple]:
    w = _words(text)
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


def copies_source(fact: str, source_shingles: set[tuple]) -> bool:
    return bool(shingles(fact) & source_shingles)


# ---------------------------------------------------------------- store
class Library:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.path), check_same_thread=False)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS pages(url TEXT PRIMARY KEY, site TEXT, title TEXT, class TEXT, race TEXT, topic TEXT,
                etag TEXT, modified TEXT, hash TEXT, updated_label TEXT, fetched_at TEXT, facts INTEGER DEFAULT 0, status TEXT);
            CREATE VIRTUAL TABLE IF NOT EXISTS facts USING fts5(fact, topic, class UNINDEXED, race UNINDEXED, levels UNINDEXED,
                url UNINDEXED, site UNINDEXED, title UNINDEXED, created UNINDEXED, tokenize='porter unicode61');
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
        """)
        self.db.commit()

    # -- meta
    def get_meta(self, key: str, default: str = "") -> str:
        row = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else default

    def set_meta(self, key: str, value: str):
        self.db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)", (key, value))
        self.db.commit()

    # -- facts
    def replace_facts(self, url: str, site: str, title: str, facts: Iterable[dict]):
        now = dt.datetime.now().isoformat(timespec="seconds")
        self.db.execute("DELETE FROM facts WHERE url=?", (url,))
        n = 0
        for f in facts:
            self.db.execute("INSERT INTO facts(fact, topic, class, race, levels, url, site, title, created) VALUES(?,?,?,?,?,?,?,?,?)",
                            (f["fact"], f.get("topic", ""), f.get("class", ""), f.get("race", ""), f.get("levels", ""), url, site, title, now))
            n += 1
        self.db.execute("UPDATE pages SET facts=? WHERE url=?", (n, url))
        self.db.commit()
        return n

    def count(self) -> int:
        return self.db.execute("SELECT count(*) FROM facts").fetchone()[0]

    def search(self, question: str, cls: str = "", race: str = "", level: int | None = None, k: int = 8) -> list[dict]:
        cls, race = (cls or "").lower(), (race or "").lower()
        q = question.lower()
        terms = [w for w in re.findall(r"[a-zçğıöşü0-9']{3,}", q) if w not in STOP]
        for tr, en in TR_EN.items():
            if tr in q:
                terms += en.split()
        terms = list(dict.fromkeys(t for t in terms if re.fullmatch(r"[a-z0-9']+", t)))
        rows = []
        if terms:
            match = " OR ".join(f'"{t}"' for t in terms[:24])
            try:
                rows = self.db.execute("SELECT fact, topic, class, race, levels, url, site, title, bm25(facts) FROM facts WHERE facts MATCH ?",
                                       (match,)).fetchall()
            except sqlite3.OperationalError:
                rows = []
        if cls:      # always offer the class's core facts, even when the question is in Turkish
            # (not the data-sheet sites: their hundreds of talent/spell rows only show up when the question matches them)
            rows += [r + (0.0,) for r in self.db.execute("SELECT fact, topic, class, race, levels, url, site, title FROM facts WHERE class=? AND site<>'talentsforever.com' LIMIT 400", (cls,)).fetchall()]
        scored = {}
        for fact, topic, fcls, frace, levels, url, site, title, rank in rows:
            if fcls and cls and fcls != cls:
                continue
            if frace and race and frace != race:
                continue
            score = -float(rank) * 2.0                     # bm25: smaller is better
            score += 3.0 if fcls and fcls == cls else 0.0
            score += 1.0 if frace and frace == race else 0.0
            if level is not None and levels:
                m = re.match(r"(\d+)\s*-\s*(\d+)", levels) or re.match(r"(\d+)", levels)
                if m:
                    lo = int(m.group(1)); hi = int(m.group(2)) if m.lastindex and m.lastindex > 1 else lo
                    if lo <= level <= hi:
                        score += 2.5
                    elif lo > level:
                        score += max(0.0, 1.5 - (lo - level) * 0.15)      # upcoming soon: still useful
                    else:
                        score -= 1.0
            key = fact
            if key not in scored or scored[key]["score"] < score:
                scored[key] = {"fact": fact, "topic": topic, "levels": levels, "url": url, "site": site, "title": title, "score": score}
        return sorted(scored.values(), key=lambda r: -r["score"])[:k]

    def notes_for_prompt(self, question: str, context: str, k: int = 8) -> str:
        def field(name):
            m = re.search(name + r"=([^;\n]*)", context or "")
            return m.group(1).strip() if m else ""
        lvl = field("Level")
        hits = self.search(question, field("Class"), field("Race"), int(lvl) if lvl.isdigit() else None, k)
        if not hits:
            return ""
        lines = [f"- {h['fact']}" + (f" (levels {h['levels']})" if h["levels"] else "") + f" [source: {h['url']}]" for h in hits]
        return "LamboGuide library notes (our own summaries of WoW Forever guide pages; verify if unsure and cite the source links you use):\n" + "\n".join(lines)

    # -- packs (for sharing / a central store later)
    def export_pack(self, cls: str, path: Path):
        rows = self.db.execute("SELECT fact, topic, class, race, levels, url, site, title, created FROM facts WHERE class=? OR class=''", (cls,)).fetchall()
        keys = ("fact", "topic", "class", "race", "levels", "url", "site", "title", "created")
        Path(path).write_text(json.dumps({"format": 1, "class": cls, "exported": dt.date.today().isoformat(),
                                          "facts": [dict(zip(keys, r)) for r in rows]}, ensure_ascii=False, indent=1), encoding="utf-8")

    def import_pack(self, path: Path) -> int:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        by_url: dict[str, list[dict]] = {}
        for f in data.get("facts", []):
            by_url.setdefault(f["url"], []).append(f)
        n = 0
        for url, facts in by_url.items():
            have = self.db.execute("SELECT count(*) FROM facts WHERE url=?", (url,)).fetchone()[0]
            if have:
                continue                                   # crawled data is newer than a bundled pack
            self.db.execute("INSERT OR IGNORE INTO pages(url, site, title, class, topic, status) VALUES(?,?,?,?,?,?)",
                            (url, facts[0].get("site", ""), facts[0].get("title", ""), facts[0].get("class", ""), facts[0].get("topic", ""), "pack"))
            n += self.replace_facts(url, facts[0].get("site", ""), facts[0].get("title", ""), facts)
        return n


# ---------------------------------------------------------------- fetching
class Fetcher:
    def __init__(self, log: Callable[[str], None] = print, opener=None, sleep=time.sleep, clock=time.monotonic):
        self.log = log
        self.open = opener or urllib.request.urlopen
        self.sleep, self.clock = sleep, clock
        self.robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self.last: dict[str, float] = {}

    def _wait(self, host: str):
        gap = self.clock() - self.last.get(host, -1e9)
        if gap < HOST_DELAY:
            self.sleep(HOST_DELAY - gap)
        self.last[host] = self.clock()

    def allowed(self, url: str) -> bool:
        parts = urllib.parse.urlsplit(url)
        host = parts.netloc
        if host not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                self._wait(host)
                with self.open(urllib.request.Request(f"{parts.scheme}://{host}/robots.txt", headers={"User-Agent": USER_AGENT}), timeout=20) as r:
                    rp.parse(r.read().decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    rp = None                               # robots itself is locked: treat the site as closed
                else:
                    rp.parse([])                            # no robots.txt (404 etc.): standard says everything allowed
            except Exception as e:
                self.log(f"library: robots for {host} unreachable ({e}); skipping site this round")
                return False
            self.robots[host] = rp
        rp = self.robots[host]
        return bool(rp and rp.can_fetch(USER_AGENT, url))

    def get(self, url: str, etag: str = "", modified: str = "", accept: str = "text/html") -> tuple[int, str, dict]:
        host = urllib.parse.urlsplit(url).netloc
        headers = {"User-Agent": USER_AGENT, "Accept": accept}
        if etag:
            headers["If-None-Match"] = etag
        if modified:
            headers["If-Modified-Since"] = modified
        self._wait(host)
        try:
            with self.open(urllib.request.Request(url, headers=headers), timeout=30) as r:
                body = r.read(3_000_000).decode(r.headers.get_content_charset() or "utf-8", "replace")
                return r.status, body, {"etag": r.headers.get("ETag", ""), "modified": r.headers.get("Last-Modified", "")}
        except urllib.error.HTTPError as e:
            return e.code, "", {}


# ---------------------------------------------------------------- summarizing
SUMMARY_PROMPT = """You turn a World of Warcraft: Forever guide page into short facts for an in-game helper.
Rules:
- Write every fact in your OWN words, as a short sentence (max 200 characters). Never copy sentences or long phrases from the page.
- Only facts that are useful while playing WoW Forever: abilities and the level they are learned, talents, quests, locations, professions, races, gear and stat advice, mechanics.
- Keep numbers (levels, coordinates, percentages) exact. If the page says something is beta-only or uncertain, say so in the fact.
- Skip ads, navigation, author bios, comments and anything not about WoW Forever.
- At most {max_facts} facts.
Return ONLY a JSON array, each item: {{"fact": "...", "topic": "leveling|talents|abilities|quests|professions|races|gear|mechanics|pve|general", "levels": "e.g. 10-20 or 30 or empty", "class": "{cls_hint}", "race": ""}}

Page title: {title}
Page URL: {url}
Page text:
{text}
"""


def parse_facts(answer: str, cls_hint: str, race_hint: str) -> list[dict]:
    m = re.search(r"\[.*\]", answer, re.S)
    if not m:
        return []
    try:
        items = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        fact = re.sub(r"\s+", " ", str(it.get("fact", ""))).strip()
        if not (12 <= len(fact) <= 260):
            continue
        cls = str(it.get("class") or cls_hint).lower()
        out.append({"fact": fact, "topic": str(it.get("topic", "general"))[:20], "levels": str(it.get("levels", ""))[:12],
                    "class": cls if cls in CLASSES else "", "race": (str(it.get("race") or race_hint).lower() if (it.get("race") or race_hint) in RACES else "")})
    return out


class Updater:
    """One update round: discover guide pages, fetch changed ones, summarize, store."""

    def __init__(self, lib: Library, fetcher: Fetcher, ask: Callable[[str], str], log: Callable[[str], None] = print):
        self.lib, self.fetcher, self.ask, self.log = lib, fetcher, ask, log

    def discover(self, priority_class: str = "") -> list[str]:
        found: list[str] = []
        for seed in SEEDS:
            if not self.fetcher.allowed(seed):
                self.log(f"library: robots.txt does not allow {seed}")
                continue
            status, body, _ = self.fetcher.get(seed)
            if status != 200:
                continue
            base = urllib.parse.urlsplit(seed)
            pattern = FOLLOW.get(base.netloc)
            for href in extract(body)["links"]:
                u = urllib.parse.urlsplit(urllib.parse.urljoin(seed, href))
                if u.netloc == base.netloc and pattern and pattern.match(u.path):
                    url = f"{u.scheme}://{u.netloc}{u.path}"
                    if url not in found:
                        found.append(url)
        pc = priority_class.lower()
        return sorted(found, key=lambda u: (0 if pc and pc in u.lower() else 1 if not any(c in u.lower() for c in CLASSES) else 2, u))

    def update_page(self, url: str) -> int:
        if not self.fetcher.allowed(url):
            self.lib.db.execute("INSERT OR REPLACE INTO pages(url, status) VALUES(?, 'robots')", (url,))
            self.lib.db.commit()
            return 0
        row = self.lib.db.execute("SELECT etag, modified, hash FROM pages WHERE url=?", (url,)).fetchone()
        etag, modified, old_hash = row if row else ("", "", "")
        status, body, hdr = self.fetcher.get(url, etag or "", modified or "")
        if status == 304:
            return 0
        if status != 200 or not body:
            return 0
        page = extract(body)
        text = page["text"]
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        site = urllib.parse.urlsplit(url).netloc.removeprefix("www.")
        cls, race, topic = tags_for(url, page["title"])
        now = dt.datetime.now().isoformat(timespec="seconds")
        self.lib.db.execute("INSERT OR REPLACE INTO pages(url, site, title, class, race, topic, etag, modified, hash, updated_label, fetched_at, facts, status) "
                            "VALUES(?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT facts FROM pages WHERE url=?),0),'ok')",
                            (url, site, page["title"][:200], cls, race, topic, hdr.get("etag", ""), hdr.get("modified", ""), digest,
                             page["updated"], now, url))
        self.lib.db.commit()
        if digest == old_hash:
            return 0
        prompt = SUMMARY_PROMPT.format(max_facts=MAX_FACTS_PER_PAGE, cls_hint=cls, title=page["title"], url=url, text=text[:24000])
        facts = parse_facts(self.ask(prompt), cls, race)
        source = shingles(text)
        clean = [f for f in facts if not copies_source(f["fact"], source)]
        if len(clean) < len(facts):
            self.log(f"library: dropped {len(facts) - len(clean)} facts too close to the page wording ({url})")
        for f in clean:
            f.setdefault("topic", topic)
        return self.lib.replace_facts(url, site, page["title"][:200], clean)

    def run(self, priority_class: str = "", max_pages: int = 25, stop: Callable[[], bool] = lambda: False) -> int:
        total = 0
        urls = self.discover(priority_class)
        self.log(f"library: {len(urls)} guide pages found")
        for url in urls[:max_pages]:
            if stop():
                break
            try:
                total += self.update_page(url)
            except Exception as e:                       # one bad page never stops the round
                self.log(f"library: {url}: {e!r}")
        self.lib.set_meta("last_run", dt.datetime.now().isoformat(timespec="seconds"))
        return total


def due(last_run: str, now: dt.datetime, hours=(8, 20)) -> bool:
    """True when a scheduled slot (08:00 or 20:00 local) has passed since the last run."""
    if not last_run:
        return True
    try:
        last = dt.datetime.fromisoformat(last_run)
    except ValueError:
        return True
    slots = []
    for day in (now.date() - dt.timedelta(days=1), now.date()):
        for h in hours:
            slots.append(dt.datetime.combine(day, dt.time(h)))
    latest = max(s for s in slots if s <= now)
    return last < latest
