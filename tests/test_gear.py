"""Gear.lua in a fake game: priority-stat comparison, red tooltip lines, slots, spec lists, texts, AI line, slash."""
import pathlib as _pl
import sys
from pathlib import Path

ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import lupa.lua51 as lupa  # noqa: E402

lua = lupa.LuaRuntime(unpack_returned_tuples=True)
lua.execute(r'''
PRINTED = {}
function print(s) PRINTED[#PRINTED + 1] = s end
NOW = 100
function GetTime() return NOW end
CLASS = "WARRIOR"
function UnitClass() return CLASS:lower(), CLASS, 1 end
DW = false
function CanDualWield() return DW end
POINTS = { 0, 0, 0 }
C_SpecializationInfo = {
  GetSpecializationInfo = function(i) return 100 + i, "Tree" .. i, "", 0, nil, nil, POINTS[i] or 0 end,
}
-- the client's global strings for stat keys
ITEM_MOD_STRENGTH_SHORT = "Strength"; ITEM_MOD_STAMINA_SHORT = "Stamina"; ITEM_MOD_AGILITY_SHORT = "Agility"
ITEM_MOD_HIT_RATING_SHORT = "Hit"; ITEM_MOD_ATTACK_POWER_SHORT = "Attack Power"; RESISTANCE0_NAME = "Armor"

local Color = {}
Color.__index = Color
function Color:IsRGBEqualTo(o) return self.r == o.r and self.g == o.g and self.b == o.b end
local function C(r, g, b) return setmetatable({ r = r, g = g, b = b }, Color) end
RED_FONT_COLOR = C(1, 0.125, 0.125)
WHITE = C(1, 1, 1)
SLOTS = { HeadSlot = 1, NeckSlot = 2, ChestSlot = 5, Finger0Slot = 11, Finger1Slot = 12, MainHandSlot = 16,
          SecondaryHandSlot = 17, RangedSlot = 18 }
C_PaperDollInfo = { GetInventorySlotInfo = function(name) return SLOTS[name], "tex", false end }

-- id -> name, equipLoc, stats, red lines
ITEMS = {
  [1]  = { "Old Sword",    "INVTYPE_WEAPON",   { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 6, ITEM_MOD_STRENGTH_SHORT = 2 } },
  [2]  = { "Better Sword", "INVTYPE_WEAPON",   { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 8, ITEM_MOD_STRENGTH_SHORT = 4 } },
  [3]  = { "Big Axe",      "INVTYPE_2HWEAPON", { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 15, ITEM_MOD_STRENGTH_SHORT = 10 } },
  [4]  = { "Plate Chest",  "INVTYPE_CHEST",    { RESISTANCE0_NAME = 400, ITEM_MOD_STRENGTH_SHORT = 8 }, { "Plate", "Requires Level 40" } },
  [5]  = { "Mail Chest",   "INVTYPE_CHEST",    { RESISTANCE0_NAME = 200, ITEM_MOD_STRENGTH_SHORT = 5 } },
  [6]  = { "Shield",       "INVTYPE_SHIELD",   { RESISTANCE0_NAME = 500, ITEM_MOD_STAMINA_SHORT = 4 } },
  [7]  = { "Ring A",       "INVTYPE_FINGER",   { ITEM_MOD_STRENGTH_SHORT = 3 } },
  [8]  = { "Ring B",       "INVTYPE_FINGER",   { ITEM_MOD_STRENGTH_SHORT = 6 } },
  [9]  = { "Hit Ring",     "INVTYPE_FINGER",   { ITEM_MOD_HIT_RATING_SHORT = 1, ITEM_MOD_STAMINA_SHORT = 5 } },
  [10] = { "AP Chest",     "INVTYPE_CHEST",    { ITEM_MOD_ATTACK_POWER_SHORT = 20 } },
  [11] = { "Potion",       "",                 nil },
  [12] = { "Uncached",     "INVTYPE_HEAD",     nil },
  [13] = { "Agi Chest",    "INVTYPE_CHEST",    { ITEM_MOD_AGILITY_SHORT = 20 } },
  [14] = { "Stam Chest",   "INVTYPE_CHEST",    { ITEM_MOD_STAMINA_SHORT = 9 } },
  [15] = { "Heal Robe",    "INVTYPE_ROBE",     { ITEM_MOD_SPELL_HEALING_DONE_SHORT = 30, ITEM_MOD_SPELL_DAMAGE_DONE_SHORT = 10 } },
  [16] = { "SP Robe",      "INVTYPE_ROBE",     { ITEM_MOD_SPELL_POWER_SHORT = 20 } },
  [18] = { "Crit Gloves",  "INVTYPE_CHEST",    { ITEM_MOD_CRIT_RATING_SHORT = 14, ITEM_MOD_ATTACK_POWER_SHORT = 28 } },
  [17] = { "Odd Ring",     "INVTYPE_FINGER",   { ITEM_MOD_SOMETHING_NEW_SHORT = 3 } },
}
function __id(x) return tonumber(tostring(x):match("item:(%d+)")) or tonumber(x) end
function LINK(id) return "|cffffffff|Hitem:" .. id .. "::::::::30:::::|h[" .. ITEMS[id][1] .. "]|h|r" end
C_Item = {
  GetItemStats = function(link) local it = ITEMS[__id(link)]; return it and it[3] end,
  GetItemInfoInstant = function(x) local id = __id(x); local it = ITEMS[id]; if not it then return nil end
    return id, "t", "s", it[2], 0, 4, 0 end,
  GetItemInfo = function(x) local id = __id(x); local it = ITEMS[id]; if not it then return nil end
    local link = type(x) == "string" and x:find("|H") and x or LINK(id)
    return it[1], link, 2, 20, 1, "t", "s", 1, it[2], 0, 0, 4, 0 end,
}
TOOLTIP_API = true
C_TooltipInfo = { GetHyperlink = function(link)
  if not TOOLTIP_API then return nil end
  local it = ITEMS[__id(link)]; local lines = { { leftText = it[1], leftColor = WHITE } }
  for _, t in ipairs(it[4] or {}) do lines[#lines + 1] = { leftText = t, leftColor = RED_FONT_COLOR } end
  return { lines = lines } end }
WORN = {}
function GetInventoryItemLink(_, slot) local id = WORN[slot]; return id and LINK(id) or nil end
''')
for f in ("GearData.lua", "Gear.lua"):
    lua.execute(Path(ROOT, f).read_text(encoding="utf-8"))

g = lua.globals()
G = g.LamboGuideGear
fails = []


def check(name, cond):
    if not cond:
        fails.append(name)
        print("FAIL", name)


def setup(cls="WARRIOR", worn=None, points=(0, 31, 0), dw=False, lang="en"):
    g.CLASS, g.DW = cls, dw
    lua.execute("WORN = {}; POINTS = {%s}" % ",".join(map(str, points)))
    for slot, item in (worn or {}).items():
        lua.execute("WORN[%d] = %d" % (slot, item))
    lua.execute('LamboGuideDB = { language = "%s" }' % lang)
    G.Invalidate()


raw = lua.eval("function(id) return LamboGuideGear.Compare(LINK(id)) end")
cmp = lambda i: (lambda v: v[0] if isinstance(v, tuple) else v)(raw(i))  # noqa: E731
why = lambda i: raw(i)[1]  # noqa: E731
line = lua.eval("function(id) return (LamboGuideGear.Line(LINK(id))) end")
ai = lua.eval("function(id) return LamboGuideGear.AiLine(LINK(id)) end")


def changes(r):
    return [(c.entry, c.delta) for c in r.changes.values()]


# 1. Fury (talents): sword with more DPS and Strength -> better, changes in priority order.
setup(worn={16: 1})
r = cmp(2)
check("better", r.verdict == "better")
check("priority order", changes(r) == [("Weapon Dps", 2), ("Strength", 2)])
check("spec from talents", G.GetSpec()[1] == "Fury" and G.GetSpec()[2] == "talents")
check("line better", line(2).startswith("Your priority stats go up: +2 Weapon Dps, +2 Strength [Fury]"))
# 2. Worse and mixed.
check("worse", cmp(1) is not None and setup(worn={16: 2}) is None and cmp(1).verdict == "worse")
setup(worn={11: 8, 12: 8})
r = cmp(9)
check("mixed ring", r.verdict == "mixed" and changes(r) == [("Hit Chance", 1), ("Strength", -6)])
check("mixed text", line(9).startswith("Mixed: +1 Hit Chance, -6 Strength"))
# 3. Sourced conversions: 40 AP = 20 Strength for warriors; 20 Agility = 1% crit.
setup(worn={5: 15})
check("ap counts as strength/2", changes(cmp(10)) == [("Strength", 10)])
check("agility is its own 'also compare' entry", changes(cmp(13)) == [("Agility", 20)])
check("stamina not in fury list -> same", cmp(14).verdict == "same")
# 4. Protection lists: threat (default) vs defensive via slash.
setup(worn={5: 5}, points=(0, 0, 31))
check("prot default list", G.GetSpec()[0] == "3:threat")
G.Slash("defensive")
check("slash list word", G.GetSpec()[0] == "3:defensive" and G.GetSpec()[2] == "setting")
r = cmp(14)
check("defensive uses stamina/armor", changes(r) == [("Stamina", 9), ("Armor", -200)] and r.verdict == "mixed")
G.Slash("auto")
check("auto", G.GetSpec()[0] == "3:threat")
# 5. Red tooltip lines = unusable, with the game's own words.
setup(worn={5: 5})
r = cmp(4)
check("unusable from red lines", r.verdict == "unusable" and list(r.red.values()) == ["Plate", "Requires Level 40"])
check("unusable text", line(4) == "You cannot use this: Plate, Requires Level 40 [Fury]")
g.TOOLTIP_API = False
check("no tooltip api -> not blocked", cmp(4).verdict != "unusable" and cmp(4).usableKnown is False)
g.TOOLTIP_API = True
# 6. Slots: empty ring slot, two-hander vs both hands, off hand under a two-hander, dual wield.
setup(worn={11: 7})
check("empty ring", cmp(8).verdict == "empty" and list(cmp(8).slots.values()) == ["Finger1Slot"])
setup(worn={16: 1, 17: 2}, dw=True)
r = cmp(3)
check("2h vs pair: dps not compared", r.notComparable[1].entry == "Weapon Dps" and changes(r) == [("Strength", 4)])
check("2h text mentions weapons", "compare weapon DPS yourself" in line(3))
setup(worn={16: 3})
check("offhand under 2h", cmp(6).verdict == "twohanded")
setup(worn={16: 2, 17: 1}, dw=True)
r = cmp(2)
check("worn item is flagged", r.verdict == "equipped" and line(2) is None)
setup(worn={16: 2}, dw=True)
check("dual wield: empty off hand", cmp(1).verdict == "empty")
setup(worn={16: 2}, dw=False)
check("no dual wield: main hand only", cmp(1).verdict == "worse")
# 7. Not gear / loading.
setup()
check("potion", why(11) == "notgear")
check("uncached", why(12) == "loading")
# 8. No talent points: no verdict, plain stat differences with game names.
setup(worn={5: 5}, points=(0, 0, 0))
r = cmp(14)
check("nospec", r.verdict == "nospec" and r.noSpec is True)
check("nospec line", line(14) == "No talent points yet, stat change: -200 Armor, +9 Stamina, -5 Strength")
setup(worn={}, points=(0, 0, 0))
check("nospec empty slot lists stats", line(14) == "This slot is empty: +9 Stamina")
# 9. Healers: healing stat counts, spell power only when no healing stat.
setup(cls="PRIEST", worn={5: 16}, points=(0, 31, 0))
r = cmp(15)
check("healer heal", changes(r)[0] == ("Healing Power", 10))
setup(cls="PRIEST", worn={5: 15}, points=(0, 31, 0))
check("healer sp fallback", changes(cmp(16))[0] == ("Healing Power", -10))
# 10. Unknown stat keys still reach the AI by name.
setup(worn={11: 7, 12: 7})
a = ai(17)
check("ai other stats", "ITEM_MOD_SOMETHING_NEW_SHORT" in a and "-3 Strength" in a)
setup(worn={16: 1})
a = ai(2)
check("ai line", a.startswith("Gear check (Fury Warrior): compared with the equipped Main Hand [Old Sword].")
      and "Weapon Dps > Hit Chance > Expertise > Critical Strike > Strength" in a and "verdict: better" in a)
# 11. Tooltip line and switch.
lua.execute('''
TIP = { lines = {} }
function TIP:AddLine(t) self.lines[#self.lines + 1] = t end
function TIP:GetItem() return "Better Sword", LINK(2) end
''')
lua.execute("LamboGuideDB.gearTooltip = false")
check("tooltip off", lua.eval("LamboGuideGear.TooltipLine(TIP, 2)") is False)
lua.execute("LamboGuideDB.gearTooltip = nil")
check("tooltip on", lua.eval("LamboGuideGear.TooltipLine(TIP, 2)") is True and lua.eval("TIP.lines[1]").startswith("LG: "))
# 12. Turkish text, slash tree names, ASCII chat.
setup(worn={16: 1}, lang="tr")
check("turkish", line(2).startswith("Öncelikli statların artıyor: +2 Silah DPS, +2 Güç"))
setup(cls="DRUID", points=(0, 31, 0), lang="tr")
G.Slash("feral bear")
check("two-word tree + list", G.GetSpec()[0] == "2:bear")
G.Slash("")
check("ascii chat", all(ord(c) < 128 for c in g.PRINTED[len(g.PRINTED) - 1]))
setup(cls="HUNTER", points=(31, 0, 0))
G.Slash("beast mastery")
check("tree with space", G.GetSpec()[1] == "Beast Mastery")
G.Slash("banana")
check("bad choice", "banana" in g.PRINTED[len(g.PRINTED)])

# 12b. Ratings -> percent by the game for the player's level (rating table chosen by spec kind).
lua.execute("CR_CRIT_MELEE = 9; CR_CRIT_SPELL = 11; function GetCombatRatingBonusForCombatRatingValue(i, v) if i == 9 then return v / 14 end return v / 7 end")
setup(worn={5: 15}, lang="en")
r = cmp(18)
check("rating to percent", r.percent is True and changes(r) == [("Critical Strike", 1), ("Strength", 14)])
check("percent shown", "+1% Critical Strike" in line(18))
check("ai says converted", "Ratings converted to percent" in ai(18) and "also compare: Haste, Agility" in ai(18))
lua.execute("GetCombatRatingBonusForCombatRatingValue = nil")
setup(worn={5: 15})
r = cmp(18)
check("no api: raw rating, no %", not r.percent and changes(r)[0] == ("Critical Strike", 14) and "+14 Critical Strike" in line(18))
# 13. Debug and item commands print without errors.
setup(worn={16: 1, 5: 5})
n = len(g.PRINTED)
G.Slash("debug")
check("debug prints", len(g.PRINTED) >= n + 3 and "ITEM_MOD_STRENGTH_SHORT=2(str)" in "".join(g.PRINTED[i] for i in range(n + 1, len(g.PRINTED) + 1)))
G.Slash("item:2")
tail = "".join(g.PRINTED[i] for i in range(len(g.PRINTED) - 2, len(g.PRINTED) + 1))
check("item command", "Your priority stats go up" in tail and "stats: ITEM_MOD_DAMAGE_PER_SECOND_SHORT=8(dps)" in tail)

if fails:
    print("test_gear: %d FAILED" % len(fails))
    sys.exit(1)
print("test_gear: OK")
