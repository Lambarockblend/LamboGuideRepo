"""0.7.3 UI: shift+click links into our box without focus, hover key tags instead of asking, walking keys are refused,
chat list only with saved chats, quest descriptions."""
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
lua.execute(r"""
HOOKS = {}
hooksecurefunc = function(a, b, c) if type(a) == "string" then HOOKS[a] = b else HOOKS[b] = c end end
ChatEdit_InsertLink = function() return false end
GetBindingAction = function(k) if k == "W" or k == "S" then return "MOVEFORWARD" end return "" end
GetQuestLogQuestText = function(i) return "Bring me three crystals. Hurry!", "Collect 3 crystals from the matriarch. Then return." end
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
T = g.LamboGuideTest
inbox = "(function() for _, o in ipairs(__created()) do if o._kind == 'EditBox' and o._scripts.OnEnterPressed then return o end end end)()"

ask = """
local input
for _, o in ipairs(__created()) do if o._kind == "EditBox" then input = o end end
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


# shift+click: our window is open, the box has no focus, the normal chat box is not in use -> the link lands in our box
lua.execute("INPUT = " + inbox + "; INPUT:SetText(''); INPUT._focus = false")
lua.execute("HOOKS.ChatEdit_InsertLink('|cff1eff00|Hitem:2123::::::::8:::::|h[Linen Cap]|h|r')")
assert "Linen Cap" in lua.eval("INPUT:GetText()"), lua.eval("INPUT:GetText()")
assert lua.eval("INPUT._focus") is True

# the normal chat box is busy: leave the link to Blizzard
lua.execute("INPUT:SetText(''); INPUT._focus = false; ChatEdit_GetActiveWindow = function() return { IsShown = function() return true end } end")
lua.execute("HOOKS.ChatEdit_InsertLink('|Hitem:2123|h[Linen Cap]|h')")
assert lua.eval("INPUT:GetText()") == "", lua.eval("INPUT:GetText()")
lua.execute("ChatEdit_GetActiveWindow = nil")

# hover key: tag in the box, nothing sent
lua.execute("INPUT:SetText(''); GameTooltip:Show(); LamboGuide_AskHovered()")
assert "Linen Cap" in lua.eval("INPUT:GetText()")
assert lua.eval("LamboGuideDB.awaitingReq") is None

# several links at once (comparison): both stay in the box
lua.execute("INPUT:SetText(''); INPUT._focus = false")
lua.execute("HOOKS.ChatEdit_InsertLink('|Hitem:2123|h[Linen Cap]|h'); HOOKS.ChatEdit_InsertLink('|Hitem:2124|h[Cloth Hood]|h')")
assert "Linen Cap" in lua.eval("INPUT:GetText()") and "Cloth Hood" in lua.eval("INPUT:GetText()")

# keys the game already uses are refused, free ones are fine
assert T.KeyTaken("W") == "MOVEFORWARD" and T.KeyTaken("S") == "MOVEFORWARD"
assert T.KeyTaken("ALT-Q") is None

# chat list: only with saved chats, and "+" does not pile up empty chats
lua.execute("INPUT:SetText('')")
assert T.HasSavedChats() is False
T.NewChat(); T.NewChat()
assert lua.eval("#LamboGuideDB.chats") == 1, lua.eval("#LamboGuideDB.chats")
lua.execute(ask % "ilk soru")
assert T.HasSavedChats() is True

# quest descriptions: Turkish needs the AI answer, English uses the game's own first sentence
lua.execute('LamboGuideDB.language = "tr"; LamboGuideDB.awaitingReq = nil; LamboGuideDB.silentReq = nil')
assert "Collect" not in T.QuestText()
tick(25)                                  # the first question times out (no helper), the queue is free again
T.RequestQuestDesc()
assert lua.eval("LamboGuideDB.silentReq") is not None and lua.eval("LamboGuideDB.questAsk[1]") == "The Red Crystal"
n = T.HandleQuestDesc("Tabii: \n1|Matriarch'tan 3 kristal topla.\nbaska satir")
assert n == 1 and "Matriarch'tan 3 kristal topla." in T.QuestText(), T.QuestText()
lua.execute('LamboGuideDB.language = "en"')
assert "Collect 3 crystals from the matriarch." in T.QuestText(), T.QuestText()
print("ui 0.7.3 OK")
