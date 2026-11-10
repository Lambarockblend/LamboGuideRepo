"""LamboGuide text helpers: reading the question the addon sends and shaping the answer for the game.
Pure Python, no Windows/Tk needed."""
from __future__ import annotations

import re
from urllib.parse import urlparse

# ---------------------------------------------------------------- prompt / reply helpers
MODEL_CHOICES = ("gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna")


def parse_game_prompt(payload: str):
    first, _, rest = payload.partition("\n")
    m = re.search(r"lang=(English|Turkish);\s*effort=(low|medium|high);\s*model=([a-z0-9.\-]+);\s*kind=(ask|patch|ping)", first)
    language = m.group(1) if m else "Turkish"
    effort = m.group(2) if m else "medium"
    model = m.group(3) if m and m.group(3) in MODEL_CHOICES else MODEL_CHOICES[0]
    kind = m.group(4) if m else "ask"
    q_part, marker, ctx = rest.partition("\n\nWoW Forever live character data")
    question = q_part.removeprefix("Question: ").strip()
    context = ("WoW Forever live character data" + ctx).strip() if marker else ""
    return {"question": question, "context": context, "language": language, "effort": effort, "model": model, "kind": kind}


_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")


def _domain(url: str) -> str:
    host = urlparse(url.rstrip(".,;:!?")).netloc.lower()
    return host[4:] if host.startswith("www.") else host


_WP = re.compile(r"\{wp:(\d+),\s*([\d.]+),\s*([\d.]+),?\s*([^}]*)\}")


def keep_known_markers(answer: str, context: str) -> str:
    """Drop {wp:ID,...} map markers whose map id was not in the character data ({map=ID}): the AI must not invent
    them (a made-up id 1 broke Blizzard's map UI in game, 2026-11-10). The place name stays as plain text."""
    known = set(re.findall(r"\{map=(\d+)\}", context or ""))

    def fix(m):
        x, y = float(m.group(2)), float(m.group(3))
        if m.group(1) in known and 0 <= x <= 100 and 0 <= y <= 100:
            return m.group(0)
        return m.group(4).strip()
    return _WP.sub(fix, answer)


def to_mailbox_text(answer: str, limit: int = 3000, more: str = "(devami yardimci penceresinde)") -> str:
    """Plain text for the in-game window: markdown removed, links kept as {url:URL;label}, which the addon shows as
    blue link buttons (click = copy box, WoW cannot open a browser)."""
    links: list[str] = []

    def mark(url: str, label: str) -> str:
        url = url.rstrip(".,;:!?")
        label = re.sub(r"[{};|\n]", " ", label).strip() or _domain(url)
        links.append(url)
        return "{url:" + url + ";" + label + "}"

    text = answer.replace("\r", "")
    text = _LINK.sub(lambda m: mark(m.group(2), m.group(1)), text)

    def bare(m):
        url = m.group(0)
        core = url.rstrip(".,;:!?")
        return mark(core, _domain(core)) + url[len(core):]          # keep the sentence's own punctuation

    text = re.sub(r"(?<![{:;])https?://[^\s)\]>}]+", bare, text)
    text = re.sub(r"[*_`]{1,3}(?![^{]*})", "", text)
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]*", "", text, flags=re.M)       # [ \t], not \s: keep the blank line above
    text = re.sub(r"^[ \t]*[-*•][ \t]+", "- ", text, flags=re.M)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text.encode("utf-8")) > limit:
        cut = text.encode("utf-8")[:limit - len(more) - 2].decode("utf-8", errors="ignore")
        cut = cut[:cut.rfind("{url:")] if cut.rfind("{url:") > cut.rfind("}") else cut   # never cut a link in half
        cut = cut[:cut.rfind(" ")] if " " in cut[-40:] else cut
        text = cut.rstrip() + " " + more
    return text
