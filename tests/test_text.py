"""lg_text: reading the addon's question and shaping the answer for the in-game window."""
import pathlib as _pl
import sys

ROOT = str(_pl.Path(__file__).resolve().parent.parent)
sys.path.insert(0, ROOT)
import lg_text as P  # noqa: E402

msg = ("LG2 lang=Turkish; effort=medium; model=gpt-6.1-sol; kind=ask\nQuestion: Su an neredeyim? ğüşıöç\n\n"
       "WoW Forever live character data (read-only):\nName=Test; Class=Priest\n" + "Quest=abc; " * 120)
d = P.parse_game_prompt(msg)
assert d["question"] == "Su an neredeyim? ğüşıöç" and d["kind"] == "ask" and d["language"] == "Turkish"
assert d["context"].startswith("WoW Forever live character data") and d["model"] == "gpt-6.1-sol"
assert P.parse_game_prompt("LG2 lang=English; effort=high; model=evil; kind=ping\nQuestion: ping")["model"] == "auto" == P.MODEL_CHOICES[0]
assert P.parse_game_prompt("LG2 lang=Turkish; effort=low; model=auto; kind=ask\nQuestion: x")["model"] == "auto"

# markdown out, links kept as {url:..;label}, sentence punctuation stays outside the link
t = P.to_mailbox_text("**Merhaba** [Wowhead](https://www.wowhead.com/x) ve https://a.io/y.\n\n\n# Baslik\n- madde")
assert t == "Merhaba {url:https://www.wowhead.com/x;Wowhead} ve {url:https://a.io/y;a.io}.\n\nBaslik\n- madde", repr(t)
# map markers survive the cleaning untouched
assert "{wp:1411,43.3,68.5,Kaltunk}" in P.to_mailbox_text("Git: {wp:1411,43.3,68.5,Kaltunk} **simdi**")
# long answers are cut on a word, never inside a link, and stay under the limit (bytes)
long = "kelime " * 300 + "[kaynak](https://example.org/" + "a" * 80 + ") son"
cut = P.to_mailbox_text(long, limit=2150)
assert len(cut.encode("utf-8")) <= 2150 and cut.endswith("(devami yardimci penceresinde)"), cut[-80:]
assert cut.count("{url:") == cut.count("}"), cut[-120:]

# map markers: only map ids the game gave in the character data survive (2026-11-10: AI invented map 1)
ctx = "Zone=Durotar / Valley of Trials {map=1411}; Coordinates=44.9, 67.9"
out = P.keep_known_markers("git: {wp:1,43.3,68.5,Kaltunk} ve {wp:1411,43.3,68.5,Kaltunk}.", ctx)
assert out == "git: Kaltunk ve {wp:1411,43.3,68.5,Kaltunk}.", out
assert P.keep_known_markers("{wp:1411,143,68,X}", ctx) == "X"
print("text helpers OK")
