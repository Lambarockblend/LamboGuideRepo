"""Helper not running (seen in game 2026-11-11): the question must not hang as "still being sent" forever.
After the timeout the player is told, the queue is free, and once the helper starts the next question goes through."""
import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, ROOT + "")
import lupa.lua51 as lupa  # noqa: E402
import lg_mailbox as MB  # noqa: E402
import lg_text as P  # noqa: E402

src = Path(__file__).with_name("test_lua.py").read_text(encoding="utf-8")
prelude = re.search(r"lua\.execute\(r'''(.*?)'''\)", src, re.S).group(1)

tmp = Path(tempfile.mkdtemp())
state = tmp / "Account" / "ACC" / "Realm" / "Char" / "AddOns.txt"
state.parent.mkdir(parents=True)
names = MB.UP_NAMES + MB.DOWN_NAMES + ["LamboGuide"]
state.write_text("".join(f"{n}: disabled\r\n" for n in names), encoding="utf-8")
mem: dict[str, bool] = {}
clock = [500.0]


def reset():
    mem.clear()
    mem.update(MB.parse_states(state.read_text(encoding="utf-8")))


def save():
    state.write_text("".join(f"{n}: {'enabled' if mem.get(n) else 'disabled'}\r\n" for n in names), encoding="utf-8")


lua = lupa.LuaRuntime(unpack_returned_tuples=True)
lua.execute(prelude)
g = lua.globals()
lua.execute("C_AddOns = {}; AddonList = nil")
ca = g.C_AddOns
ca.GetAddOnEnableState = lambda n, w=None: 2 if mem.get(n) else 0
ca.EnableAddOn = lambda n, w=None: mem.__setitem__(n, True)
ca.DisableAddOn = lambda n, w=None: mem.__setitem__(n, False)
ca.SaveAddOns = save
ca.ResetAddOns = reset
ca.DoesAddOnExist = lambda n: n in names
ca.LoadAddOn = lambda n: None
g.UnitGUID = lambda u: "Player-1-0ABC"
g.GetTime = lambda: clock[0]
reset()
lua.execute(r"""
-- QuestieDB (public API shape) + map mocks
LibQuestieDB = { Quest = {}, Npc = {} }
LibQuestieDB.Quest.name = function(id) return id == 4811 and "The Red Crystal" or nil end
LibQuestieDB.Quest.finishedBy = function(id) return { { 3693 } } end
LibQuestieDB.Quest.objectives = function(id) return { { { 2071, nil, 3 } } } end
LibQuestieDB.Npc.name = function(id) return ({ [3693] = "Terenthis", [2071] = "Moonstalker Matriarch" })[id] end
LibQuestieDB.Npc.spawns = function(id) if id == 3693 then return { [148] = { { 39.2, 43.5 }, { 80, 80 } } } end return { [148] = { { 50.1, 30.3 } } } end
QuestieLoader = { ImportModule = function(self, name) return { GetUiMapIdByAreaId = function(_, area) return area == 148 and 1439 or nil end } end }
C_QuestLog = { GetNumQuestLogEntries = function() return 1 end, GetInfo = function(i) return { title = "The Red Crystal", questID = 4811, isComplete = false } end,
  GetQuestObjectives = function() return { { text = "Crystal: 1/3" } } end }
C_Map = { GetBestMapForUnit = function() return 1439 end,
  GetPlayerMapPosition = function() return { GetXY = function() return 0.38, 0.44 end } end,
  GetMapInfo = function(id) return { name = "Darkshore", mapID = id } end,
  CanSetUserWaypointOnMap = function() return true end,
  SetUserWaypoint = function(p) WAYPOINT = p end }
UiMapPoint = { CreateFromCoordinates = function(m, x, y) return { m = m, x = x, y = y } end }
C_SuperTrack = { SetSuperTrackedUserWaypoint = function(v) SUPERTRACK = v end }
GameTooltip.GetName = function() return "GameTooltip" end
GameTooltip.NumLines = function() return 2 end
GameTooltipTextLeft1 = { GetText = function() return "Linen Cap" end }
GameTooltipTextLeft2 = { GetText = function() return "+3 Stamina" end }
GameTooltip.GetItem = function() return "Linen Cap", "|cff1eff00|Hitem:2123::::::::8:::::|h[Linen Cap]|h|r" end
""")
lua.execute(Path(ROOT + "/Knowledge.lua").read_text(encoding="utf-8"))
lua.execute(Path(ROOT + "/Mailbox.lua").read_text(encoding="utf-8"))
lua.execute(Path(ROOT + "/Core.lua").read_text(encoding="utf-8"))
lua.execute('''
for _, o in ipairs(__created()) do if o._scripts.OnEvent then o._scripts.OnEvent(o, "PLAYER_LOGIN"); break end end
SlashCmdList["LAMBOGUIDE"]("")
''')
assert lua.eval("LamboGuideTest.UsingMailbox()"), "addon did not switch to the mailbox"

M = g.LamboGuideMailbox
ask = """
local input
for _, o in ipairs(__created()) do if o._kind == "EditBox" and o._scripts.OnEnterPressed then input = o end end
input:SetText("%s")
input._scripts.OnEnterPressed(input)
"""
last = "(function() local c = LamboGuideDB.chats[LamboGuideDB.activeChat] or LamboGuideDB.chats[#LamboGuideDB.chats]; return c.messages[#c.messages].text end)()"
status = "(function() for _, o in ipairs(__created()) do if type(o._text)=='string' and (o._text:find('Yard') or o._text:find('bekle')) then return o._text end end end)()"


def tick(seconds, link=None, until=None):
    end = clock[0] + seconds
    while clock[0] < end:
        clock[0] += 0.05
        M.Tick(clock[0])
        lua.eval("LamboGuideTest.DeliveryWatch")(clock[0])
        if link:
            link.step()
        if until and until():
            return True
    return False


# 1) no helper: the hello waits in the queue, but a question can still be asked (it used to answer "busy")
tick(3)
lua.execute(ask % "ilk soru")
assert "iletiliyor, bekle" not in str(lua.eval(status)), lua.eval(status)
assert lua.eval("LamboGuideDB.awaitingReq") is not None
# 2) a second question while the first is on its way is refused politely
lua.execute(ask % "ikinci soru")
assert "iletiliyor, bekle" in str(lua.eval(status)), lua.eval(status)
# 3) after the timeout the player is told and the queue is free
tick(25)
assert "yardımcı program açık değil" in lua.eval(last), lua.eval(last)
assert lua.eval("LamboGuideDB.awaitingReq") is None
assert "Yardımcı bağlı değil" in str(lua.eval(status)), lua.eval(status)
# 4) the helper starts now: hello arrives, a new question goes through, the old one is not delivered late
got = []
link = MB.Link(tmp / "Account", got.append, clock=lambda: clock[0])
assert tick(8, link, lambda: any(t.startswith("H1") for t in got)), got
lua.execute(ask % "yeni soru")
assert tick(30, link, lambda: any(t.startswith("Q") for t in got)), got
qs = [t for t in got if t.startswith("Q")]
assert len(qs) == 1 and "yeni soru" in qs[0] and "ilk soru" not in qs[0], qs
req = qs[0].split("\n", 1)[0][1:]
# while the answer is awaited the last row shows "Düşünüyor" with dots 1 2 3 3 2 1 (stored text stays the wait text)
assert "model=auto" in qs[0] and "effort=low" in qs[0], qs[0][:80]
tick(1, link)
seen = []
for k in range(7):
    clock[0] += 0.4
    seen.append(lua.eval("LamboGuideTest.ThinkingTick")(clock[0]))
assert all("Düşünüyor" in t for t in seen), seen
assert [t.count(".") for t in seen[:6]] in ([1, 2, 3, 3, 2, 1], [2, 3, 3, 2, 1, 1], [3, 3, 2, 1, 1, 2], [3, 2, 1, 1, 2, 3], [2, 1, 1, 2, 3, 3], [1, 1, 2, 3, 3, 2]), seen
assert lua.eval(last) in ("Soru gönderildi. Cevap hazır olunca kendiliğinden gelir.", "Soru yardımcıya iletiliyor..."), lua.eval(last)
link.send(f"A{req}\ntamam")
assert tick(20, link, lambda: lua.eval(last) == "tamam"), lua.eval(last)
assert lua.eval("LamboGuideTest.ThinkingTick")(clock[0] + 1) is None      # animation stops with the answer
print("helper-off timeout + thinking dots OK")
