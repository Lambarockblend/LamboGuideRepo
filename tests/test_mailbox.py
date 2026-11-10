"""End-to-end test: Mailbox.lua (game side, in lupa) <-> lg_mailbox.Link (helper side)
through one real AddOns.txt file, with a simulated clock and simulated write races."""
import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import random
import sys
import tempfile
import zlib
from pathlib import Path

sys.path.insert(0, ROOT + "")
import lupa.lua51 as lupa  # noqa: E402
import lg_mailbox as MB  # noqa: E402


def run(seed: int, chaos: float, question: str, answers: list[str], zip_lua: bool) -> dict:
    rnd = random.Random(seed)
    tmp = Path(tempfile.mkdtemp())
    state = tmp / "WTF" / "Account" / "ACC" / "Realm" / "Char" / "AddOns.txt"
    state.parent.mkdir(parents=True)
    state.write_text("LamboGuide: enabled\r\nQuestie: enabled\r\n", encoding="utf-8")
    clock = [1000.0]

    lua = lupa.LuaRuntime(unpack_returned_tuples=True, encoding=None)
    g = lua.globals()
    mem: dict[str, bool] = {}
    names = set(MB.UP_NAMES + MB.DOWN_NAMES + ["LamboGuide", "Questie"])
    stats = {"saves": 0, "resets": 0, "clobbers": 0}

    def reset():
        stats["resets"] += 1
        mem.clear()
        mem.update(MB.parse_states(state.read_text(encoding="utf-8")))

    def save():
        stats["saves"] += 1
        # the client writes its whole in-memory list
        state.write_text("".join(f"{k}: {'enabled' if v else 'disabled'}\r\n" for k, v in sorted((n, mem.get(n, False)) for n in names)), encoding="utf-8")

    def get(name, who):
        return 2 if mem.get(name.decode()) else 0

    def enable(name, who):
        mem[name.decode()] = True

    def disable(name, who):
        mem[name.decode()] = False

    lua.execute(b"C_AddOns = {}")
    ca = g[b"C_AddOns"]
    ca[b"GetAddOnEnableState"] = lambda n, w: get(n, w)
    ca[b"EnableAddOn"] = lambda n, w=None: enable(n, w)
    ca[b"DisableAddOn"] = lambda n, w=None: disable(n, w)
    ca[b"SaveAddOns"] = save
    ca[b"ResetAddOns"] = reset
    ca[b"DoesAddOnExist"] = lambda n: n.decode() in names
    g[b"UnitGUID"] = lambda u: b"Player-1-0000ABCD"
    if zip_lua:
        lua.execute(b"Enum = { CompressionMethod = { Deflate = 1 } }; C_EncodingUtil = {}")
        def comp(s, m):
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            return c.compress(s) + c.flush()
        def decomp(s, m):
            return zlib.decompress(s, -15)
        g[b"C_EncodingUtil"][b"CompressString"] = comp
        g[b"C_EncodingUtil"][b"DecompressString"] = decomp
    lua.execute(Path(ROOT + "/Mailbox.lua").read_bytes())
    M = g[b"LamboGuideMailbox"]
    reset()
    assert M[b"Start"](clock[0]), "mailbox did not start"

    game_got: list[str] = []
    helper_got: list[str] = []
    lua_cb = lua.eval(b"function(store) return function(s) store(s) end end")
    M[b"onMessage"] = lua_cb(lambda s: game_got.append(bytes(s).decode("utf-8")))

    link = MB.Link(state.parent.parent.parent.parent, helper_got.append, clock=lambda: clock[0])

    def lua_bytes(text: str):
        # Lua strings are byte strings; hand UTF-8 bytes over unchanged
        return text.encode("utf-8")

    M[b"Send"](lua_bytes("H1 zip=" + ("1" if zip_lua else "0")))
    M[b"Send"](lua_bytes(question))
    answered = False
    snapshot = state.read_text(encoding="utf-8")
    t_question_done = None
    for _ in range(40000):
        clock[0] += 0.02
        M[b"Tick"](clock[0])
        # race: occasionally the helper or game overwrites with an older copy of the file
        if chaos and rnd.random() < chaos:
            state.write_text(snapshot, encoding="utf-8")
            stats["clobbers"] += 1
        if rnd.random() < 0.3:
            snapshot = state.read_text(encoding="utf-8")
        if rnd.random() < 0.4:
            link.step()
        if len(helper_got) >= 2 and not answered:
            answered = True
            t_question_done = clock[0]
            for a in answers:
                link.send(a)
        if answered and len(game_got) >= len(answers) and not link.busy():
            break
    return {"helper": helper_got, "game": game_got, "time_q": (t_question_done or 0) - 1000.0,
            "time_total": clock[0] - 1000.0, "stats": stats, "retries": link.retries}


def check(seed, chaos, zip_lua):
    q = "Q17\nLG2 lang=Turkish; effort=medium\nQuestion: Şu an neredeyim? ğüşıöç\n\n" + ("WoW Forever live character data x=1; " * 60)
    answers = ["A17\n" + ("Kuzeye git, Auberdine'deki görevi teslim et. İkinci satır.\n" * 30), "A18\nkısa cevap"]
    r = run(seed, chaos, q, answers, zip_lua)
    assert r["helper"][0].startswith("H1"), r["helper"][:1]
    assert r["helper"][1] == q, "question corrupted"
    assert r["game"] == answers, f"answers corrupted/missing: {len(r['game'])}"
    return r


if __name__ == "__main__":
    for zip_lua in (False, True):
        r = check(1, 0.0, zip_lua)
        print(f"clean zip={zip_lua}: question {r['time_q']:.1f}s, total {r['time_total']:.1f}s, saves {r['stats']['saves']}")
    for seed in range(2, 12):
        r = check(seed, 0.03, seed % 2 == 0)
        print(f"chaos seed={seed}: total {r['time_total']:.1f}s, clobbers {r['stats']['clobbers']}")
    print("mailbox tests OK")
