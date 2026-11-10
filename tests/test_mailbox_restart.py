"""Regression (seen in game 2026-11-10): the helper is restarted while the game keeps running, and the game's
AddOns.txt leaves enabled (default) addons out. The first answer of the new helper must still arrive."""
import sys
import tempfile
from pathlib import Path

ROOT = str(Path(__file__).resolve().parent.parent)
sys.path.insert(0, ROOT)
import lupa.lua51 as lupa  # noqa: E402
import lg_mailbox as MB  # noqa: E402

tmp = Path(tempfile.mkdtemp())
state = tmp / "WTF" / "Account" / "ACC" / "93" / "Char" / "AddOns.txt"
state.parent.mkdir(parents=True)
state.write_text("LamboGuide: enabled\r\n", encoding="utf-8")
clock = [1000.0]
names = MB.UP_NAMES + MB.DOWN_NAMES
mem: dict[str, bool] = {}


def reset():
    mem.clear()
    mem.update(MB.parse_states(state.read_text(encoding="utf-8")))


def save():
    # like WoW Forever: only addons that are not in their default (enabled) state are written
    state.write_text("".join(f"{n}: disabled\r\n" for n in names if not mem.get(n, True)), encoding="utf-8")


lua = lupa.LuaRuntime(unpack_returned_tuples=True, encoding=None)
g = lua.globals()
lua.execute(b"C_AddOns = {}")
ca = g[b"C_AddOns"]
ca[b"GetAddOnEnableState"] = lambda n, w: 2 if mem.get(n.decode(), True) else 0
ca[b"EnableAddOn"] = lambda n, w=None: mem.__setitem__(n.decode(), True)
ca[b"DisableAddOn"] = lambda n, w=None: mem.__setitem__(n.decode(), False)
ca[b"SaveAddOns"] = save
ca[b"ResetAddOns"] = reset
ca[b"DoesAddOnExist"] = lambda n: n.decode() in names
g[b"UnitGUID"] = lambda u: b"Player-1-0000ABCD"
lua.execute(Path(ROOT + "/Mailbox.lua").read_bytes())
M = g[b"LamboGuideMailbox"]
reset()
assert M[b"Start"](clock[0])
game_got: list[str] = []
M[b"onMessage"] = lua.eval(b"function(store) return function(s) store(s) end end")(lambda s: game_got.append(bytes(s).decode()))


def pump(link, until, steps=20000):
    for _ in range(steps):
        clock[0] += 0.02
        M[b"Tick"](clock[0])
        link.step()
        if until():
            return True
    return False


got1: list[str] = []
link1 = MB.Link(tmp / "WTF" / "Account", got1.append, clock=lambda: clock[0])
M[b"Send"](b"H1 zip=0")
assert pump(link1, lambda: bool(got1)), "hello did not reach helper 1"
for i in range(3):                                     # helper 1 sends a few messages, its seq moves on
    link1.send(f"h1 ok {i}")
assert pump(link1, lambda: len(game_got) >= 3 and not link1.busy()), game_got

# helper restarts; game keeps running
got2: list[str] = []
link2 = MB.Link(tmp / "WTF" / "Account", got2.append, clock=lambda: clock[0])
M[b"Send"]("Q5\nSeviye 1 orc warrior tankım".encode())
assert pump(link2, lambda: any(m.startswith("Q5") for m in got2)), got2
answer = "A5\n" + "Battle Stance'ta kal, Heroic Strike kullan. " * 20
link2.send(answer)
assert pump(link2, lambda: answer in game_got), f"answer lost after helper restart: {game_got[-1][:40]!r}"
print("mailbox restart OK")
