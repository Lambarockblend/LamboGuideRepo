"""Extras.lua + Core.lua in the mock game: inventory, session, AH prices, notes, arrow, addons."""
import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, ROOT + "")
import lupa.lua51 as lupa  # noqa: E402

src = Path(__file__).with_name("test_lua.py").read_text(encoding="utf-8")
prelude = re.search(r"lua\.execute\(r'''(.*?)'''\)", src, re.S).group(1)
lua = lupa.LuaRuntime(unpack_returned_tuples=True)
lua.execute(prelude)
lua.execute(r'''
CLOCK = 1000
function GetTime() return CLOCK end
function time() return 1800000000 + CLOCK end
function GetRealmName() return "Forever-EU" end
XP, XPMAX, LVL = 100, 400, 8
function UnitXP() return XP end
function UnitXPMax() return XPMAX end
function UnitLevel() return LVL end
MONEY = 5000
function GetMoney() return MONEY end
LINEN = "|cffffffff|Hitem:2589::::::::8:::::|h[Linen Cloth]|h|r"
C_Container = {
  GetContainerNumSlots = function(bag) if bag == 0 then return 4 elseif bag == -1 then return 2 end return 0 end,
  GetContainerItemInfo = function(bag, slot)
    if bag == 0 and slot == 1 then return { hyperlink = LINEN, stackCount = 5, itemID = 2589 } end
    if bag == -1 and slot == 2 then return { hyperlink = LINEN, stackCount = 3, itemID = 2589 } end
  end }
function GetNumAuctionItems() return 2 end
function GetAuctionItemInfo(kind, i)
  if i == 1 then return "Linen Cloth", nil, 5, 1, true, 1, nil, 0, 0, 50, 0, false, nil, nil, nil, 0, 2589 end
  return "Linen Cloth", nil, 10, 1, true, 1, nil, 0, 0, 200, 0, false, nil, nil, nil, 0, 2589
end
function GetItemInfo(id) return "Linen Cloth", LINEN, 1, 5, 0, "Trade Goods", "Cloth", 20, "", 0, 13 end
INSIDE = false
function IsInInstance() if INSIDE then return true, "party" end return false, "none" end
function GetInstanceInfo() return "Ragefire Chasm", "party" end
function UnitCharacterPoints() return 1 end
C_AddOns = { IsAddOnLoaded = function(n) return n == "Questie" end }
function CreateVector2D(x, y) return { x = x, y = y } end
C_Map = { GetWorldPosFromMapPos = function(map, v) return 1, { x = 100 + v.x * 1000, y = 200 + v.y * 1000 } end }
PX, PY, FACING = 600, 700, 0
function UnitPosition() return PX, PY, 0, 1 end   -- like the game: 1st value pairs with GetWorldPosFromMapPos .x
function GetPlayerFacing() return FACING end
''')
for f in ("Knowledge.lua", "GearData.lua", "Gear.lua", "Extras.lua", "Core.lua"):
    lua.execute(Path(ROOT + "/" + f).read_text(encoding="utf-8"))

fire = lua.eval('''function(ev, a) for _, o in ipairs(__created()) do local h = o._scripts and o._scripts.OnEvent; if h then h(o, ev, a) end end end''')
fire("PLAYER_LOGIN")
X = lua.globals().LamboGuideExtras

# inventory: bags at login, bank when opened
assert "Linen Cloth x5" in X.InventoryText("lin"), X.InventoryText("lin")
fire("BANKFRAME_OPENED")
inv = X.InventoryText("")
assert "Linen Cloth x8" in inv and "Testchar" in inv, inv
assert X.OwnedCount(2589) == 8

# session stats
lua.execute("CLOCK = CLOCK + 1800; XP = 300")
fire("PLAYER_XP_UPDATE")
st = X.SessionStats()
assert abs(st.xpHour - 400) < 1e-6 and abs(st.toLevel - 900) < 1e-6, (st.xpHour, st.toLevel)
lua.execute("XP = 50; XPMAX = 500; LVL = 9")
fire("PLAYER_LEVEL_UP", 9)
assert abs(X.session.xp - 350) < 1e-6, X.session.xp           # 200 + (400-300) + 50

# notes: level up with a clickable ask link
msgs = lua.eval("LamboGuideDB.chats[1].messages")
notes = [msgs[i].text for i in range(1, len(msgs) + 1) if msgs[i].note]
assert any("Seviye 9 oldun" in n and "{ask:levelup;" in n for n in notes), notes
assert any("yetenek puanın" in n for n in notes), notes
fmt = lua.eval('LamboGuideTest.FmtReply("x {ask:levelup;Ne öğrenmeliyim?}")')
assert "|Hlgask:levelup|h[Ne öğrenmeliyim?]|h" in fmt, fmt
# a shift-clicked item in the player's own message: no raw |cnIQ1: / |H codes (Forever quality colors)
fu = lua.eval('LamboGuideTest.FmtUser("|cnIQ1:|Hitem:6948::::::::1:::::::|h[Hearthstone]|h|r ne işe yarar?")')
assert "|cn" not in fu and "|H" not in fu and "[Hearthstone]" in fu and "ne işe yarar?" in fu, fu
# source links from the mailbox path: blue, clickable, URL intact (not re-colored inside the link)
fmt = lua.eval('LamboGuideTest.FmtReply("Bak: {url:https://talentsforever.com/warrior/leveling;Warrior rehberi} ve **Charge**.")')
assert "|Hlgurl:https://talentsforever.com/warrior/leveling|h[Warrior rehberi]|h" in fmt, fmt
assert fmt.count("|cff5aa9ff") == 1 and "\001" not in fmt, fmt
lua.execute('''for _, o in ipairs(__created()) do local h = o._scripts and o._scripts.OnHyperlinkClick; if h then h(o, "lgask:levelup", "[x]"); break end end''')
last_user = [msgs[i].text for i in range(1, len(msgs) + 1) if msgs[i].role == "user"]
msgs = lua.eval("LamboGuideDB.chats[1].messages")
last_user = [msgs[i].text for i in range(1, len(msgs) + 1) if msgs[i].role == "user"]
assert last_user and last_user[-1].startswith("Yeni seviyemde"), last_user

# dungeon note
lua.execute("INSIDE = true")
fire("ZONE_CHANGED_NEW_AREA")
msgs = lua.eval("LamboGuideDB.chats[1].messages")
assert "Ragefire Chasm" in msgs[len(msgs)].text and "{ask:dungeon:Ragefire Chasm;" in msgs[len(msgs)].text

# AH prices: lowest unit price of the page, tooltip/AI line
fire("AUCTION_ITEM_LIST_UPDATE")
assert X.Price(2589).p == 10, X.Price(2589).p                  # 50/5 = 10 beats 200/10 = 20
line = X.PriceLine(2589)
assert "AH ~10c" in line and "vendor 13c" in line and "owned on account 8" in line, line

# AI context gets session line
ctx = lua.eval("LamboGuideTest.Context()")
assert "Session:" in ctx and "XP/hour" in ctx, ctx[-300:]

# arrow: bearing math and distance text
d, rel = X.Bearing(0, 0, 10, 0, 0)
assert abs(d - 10) < 1e-9 and abs(rel) < 1e-9
d, rel = X.Bearing(0, 0, 0, 10, 0)
assert abs(rel - math.pi / 2) < 1e-9                           # target to the west = turn left (counter-clockwise)
lua.execute("PY = 800")                                         # player 100 yards east of the target
X.SetTarget(1439, 50, 50, "Terenthis")
X.UpdateArrow()
arrow = lua.globals().LamboGuideArrow
assert arrow.text._text == "100 yd" and arrow.label._text == "Terenthis", arrow.text._text
lua.execute("PY = 702")
X.UpdateArrow()
assert "Vard" in arrow.text._text, arrow.text._text

# recommended addons
st = X.AddonStatus()
assert st[1].name == "Questie" and st[1].loaded is True and st[2].loaded is False
X.ShowAddons()

# inventory tab in the info window
lua.execute('SelectTabForTest = true; SlashCmdList["LAMBOGUIDE"]("envanter")')
print("extras OK:", line)
