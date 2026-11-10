"""Core.lua + Mailbox.lua (mock game) <-> lg_mailbox.Link (helper): type a question in the
addon, the helper receives it, answers, and the answer appears in the addon chat."""
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

got = []
link = MB.Link(tmp / "Account", got.append, clock=lambda: clock[0])
M = g.LamboGuideMailbox


def run(seconds, until=None):
    end = clock[0] + seconds
    while clock[0] < end:
        clock[0] += 0.02
        M.Tick(clock[0])
        link.step()
        if until and until():
            return True
    return False


assert run(5, lambda: any(t.startswith("H1") for t in got)), "no hello"
assert run(2, lambda: lua.eval("LamboGuideMailbox.state.lastHeard") is not None) is not None
link.send("h1 LamboGuide helper")
run(2)
assert "Yardımcı bağlı" in lua.eval("(function() for _, o in ipairs(__created()) do if type(o._text)=='string' and o._text:find('Yard') then return o._text end end end)()"), "status"

lua.execute('''
local input
for _, o in ipairs(__created()) do if o._kind == "EditBox" and o._scripts.OnEnterPressed then input = o end end
input:SetText("Darkshore'da hangi görevi yapayım? \\196\\159")
input._scripts.OnEnterPressed(input)
''')
assert run(30, lambda: any(t.startswith("Q") for t in got)), "question not received"
run(3, lambda: not lua.eval("LamboGuideMailbox.Busy()"))
q = [t for t in got if t.startswith("Q")][0]
req = int(re.match(r"Q(\d+)\n", q).group(1))
d = P.parse_game_prompt(q.split("\n", 1)[1])
assert d["question"] == "Darkshore'da hangi görevi yapayım? ğ", d["question"]
assert "Darkshore" in d["context"], d["context"][:200]
assert lua.eval("LamboGuideDB.chats[1].messages[2].text").startswith("Soru gönderildi"), lua.eval("LamboGuideDB.chats[1].messages[2].text")

answer = "Auberdine'e dön ve **The Red Crystal** görevini teslim et.\n- 2. adım\nKaynak: wowhead.com"
link.send(f"A{req}\n{answer}")
assert run(30, lambda: lua.eval("LamboGuideDB.awaitingReq") is None), "answer not applied"
shown = lua.eval("LamboGuideDB.chats[1].messages[2].text")
assert shown == answer, shown
assert "Quest locations from QuestieDB" in q and "Terenthis @ Darkshore 39.2,43.5 {map=1439}" in q, q[-400:]
assert "target: Moonstalker Matriarch @ Darkshore 50.1,30.3 {map=1439}" in q

# hover hotkey: tags the item under the mouse in the input box, nothing is sent until the player writes his question
before = sum(t.startswith("Q") for t in got)
lua.execute('GameTooltip:Show(); LamboGuide_AskHovered()')
run(3)
assert sum(t.startswith("Q") for t in got) == before, "hover key must not send a question by itself"
boxtext = lua.eval("(function() for _, o in ipairs(__created()) do if o._kind == 'EditBox' and o._text and o._text:find('Linen Cap') then return o._text end end end)()")
assert boxtext and "Linen Cap" in boxtext, boxtext
lua.execute("""
local input
for _, o in ipairs(__created()) do if o._kind == "EditBox" and o._text and o._text:find("Linen Cap") then input = o end end
input:SetText(input:GetText() .. "bu bana uyar mi?")
input._scripts.OnEnterPressed(input)
""")
assert run(30, lambda: sum(t.startswith("Q") for t in got) > before), "tagged question not received"
hq = [t for t in got if t.startswith("Q")][-1]
assert "About: Hovered item:" in hq and "+3 Stamina" in hq, hq[:600]
link.send(f"A{int(re.match(r'Q(\d+)', hq).group(1))}\nAuberdine'de teslim et {{wp:1439,39.2,43.5,Terenthis}}.")
assert run(30, lambda: lua.eval("LamboGuideDB.awaitingReq") is None), "hover answer"

# the waypoint marker becomes a clickable link that sets the map waypoint
fmt = lua.eval('LamboGuideTest.FmtReply("Git {wp:1439,39.2,43.5,Terenthis} hemen")')
assert "|Hlgwp:1439:39.2:43.5|h[Haritada: Terenthis]|h" in fmt, fmt
lua.execute("""
for _, o in ipairs(__created()) do
  local h = o._scripts and o._scripts.OnHyperlinkClick
  if h then h(o, "lgwp:1439:39.2:43.5", "x", "LeftButton"); break end
end""")
wp = lua.eval("WAYPOINT")
assert wp and wp.m == 1439 and abs(wp.x - 0.392) < 1e-9 and lua.eval("SUPERTRACK") is True, "waypoint not set"
# WoW Forever does not hit-test text links: the same marker is also a real button under the reply
lua.execute("WAYPOINT = nil")
lua.execute("LamboGuide_Toggle = LamboGuide_Toggle")  # no-op, keeps the frame state
btn = lua.eval("""(function()
  for _, o in ipairs(__created()) do
    local h = o._scripts and o._scripts.OnClick
    if h and o.link == "lgwp:1439:39.2:43.5" then h(o, "LeftButton"); return o.label end
  end
end)()""")
assert btn == "[Haritada: Terenthis]", btn
wp = lua.eval("WAYPOINT")
assert wp and wp.m == 1439, "waypoint button did not set the marker"
print("quest locations, hover ask, waypoint link + button OK")
print("question bytes:", len(q), "| answer shown in chat:", shown.splitlines()[0])
print("integration OK")
