import pathlib as _pl
ROOT = str(_pl.Path(__file__).resolve().parent.parent)
import sys
sys.path.insert(0, ROOT + "")
import lupa.lua51 as lupa

lua = lupa.LuaRuntime(unpack_returned_tuples=True)
lua.execute(r'''
local scripts, created = {}, {}
local numeric = { GetHeight=1, GetWidth=1, GetStringHeight=1, GetVerticalScroll=1, GetEffectiveScale=1, GetScale=1 }
local mt = {}
local function new(kind)
  local o = setmetatable({_kind=kind, _text="", _shown=false, _scripts={}}, mt)
  created[#created+1] = o
  return o
end
mt.__index = function(t, k)
  if numeric[k] then return function() return 40 end end
  if k == "GetText" then return function(self) return self._text end end
  if k == "SetText" then return function(self, s) self._text = s; local h = self._scripts.OnTextChanged; if h then h(self) end end end
  if k == "SetScript" then return function(self, n, f) self._scripts[n] = f end end
  if k == "IsShown" then return function(self) return self._shown end end
  if k == "Show" then return function(self) self._shown = true end end
  if k == "Hide" then return function(self) self._shown = false end end
  if k == "GetChildren" then return function() end end
  if k == "GetPoint" then return function() return "CENTER", nil, "CENTER", 0, 0 end end
  if k == "GetFontString" then return function(self) return self end end
  if k == "CreateTexture" or k == "CreateFontString" then return function() return new("sub") end end
  if k == "SetFont" then return function() return true end end
  return function(self, ...) return self end
end
function CreateFrame(kind, name, parent, tmpl) local f = new(kind); if name then _G[name] = f end; return f end
UIParent = new("UIParent")
UIParent.GetHeight = function() return 768 end
GameTooltip = new("tip")
StaticPopupDialogs = {}
function StaticPopup_Show(n) STATIC_SHOWN = n end
tinsert = table.insert; UISpecialFrames = {}
SlashCmdList = {}
function UnitName() return "Testchar" end
function UnitClass() return "Priest" end
function UnitRace() return "Night Elf" end
function UnitLevel() return 8 end
function UnitFactionGroup() return "Alliance" end
function GetRealZoneText() return "Darkshore" end
function GetSubZoneText() return "Twilight Vale" end
function GetMoney() return 12345 end
function GetCVar(n) if n == "gxWindow" then return "1" end return "1920x1080" end
function GetTime() return 100 end
GetInventoryItemLink = function(u, s) if s == 1 then return "|cff1eff00|Hitem:2123:0|h[Linen Cap]|h|r" end end
NUM_BAG_SLOTS = 4
function GetNumQuestLogEntries() return 2 end
function GetQuestLogTitle(i) if i == 1 then return "Header", 0, 0, 1 end return "The Red Crystal", 9, 0, nil, 0, 0 end
function GetQuestLogSelection() return 1 end
function SelectQuestLogEntry() end
function GetNumQuestLeaderBoards() return 1 end
function GetQuestLogLeaderBoard() return "Crystal: 1/3" end
function GetNumSkillLines() return 0 end
EVENTS = {}
function __created() return created end
''')
lua.execute(open(ROOT + "/Core.lua", encoding="utf-8").read())
res = lua.execute(r'''
local out = {}
-- find the event frame handler and fire login
for _, o in ipairs(__created()) do
  if o._scripts.OnEvent then o._scripts.OnEvent(o, "PLAYER_LOGIN"); break end
end
assert(LamboGuideDB.language == "tr")
-- open window via slash
SlashCmdList["LAMBOGUIDE"]("")
assert(LamboGuideFrame._shown, "frame not shown")
-- type + send question
local input
for _, o in ipairs(__created()) do if o._kind == "EditBox" then input = o end end
input:SetText("Su an neredeyim? \196\159\195\188\197\159")
input._scripts.OnEnterPressed(input)
local chat = LamboGuideDB.chats[1]
assert(#chat.messages == 2, "messages "..#chat.messages)
-- no helper link in this bare environment: the player is told so, nothing waits forever
out.noLink = chat.messages[2].text
out.awaiting = tostring(LamboGuideDB.awaitingReq)
out.title = chat.title
return out
''')
print({k: res[k] for k in res})
assert "LamboGuide kurulumunu" in res['noLink'], res['noLink']
assert res['awaiting'] == 'nil'
assert lua.eval('LamboGuidePixelStrip') is None                      # the old screen strip is gone
print("utf8 prefix:", lua.eval('LamboGuideTest.Utf8Prefix("a\\195\\167b", 2)') == "a")
