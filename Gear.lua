-- LamboGuide - Gear.lua
-- "Is this item better than what I wear?"
-- Compares the item with the equipped piece on the stats that matter for the
-- player's talent tree, using the Icy Veins WoW Forever stat priorities in
-- GearData.lua. There is no invented score: the result says which priority
-- stats go up or down. If they move in both directions it says "mixed" and
-- lists them, because the source gives a priority order, not stat weights.
--
-- Public:
--   LamboGuideGear.Compare(item)        -> result | nil, why
--   LamboGuideGear.Line(item)           -> short player text (TR/EN), r, g, b | nil
--   LamboGuideGear.AiLine(item)         -> one English line for the AI context | nil
--   LamboGuideGear.TooltipLine(tip, id) -> true when a line was added
--   LamboGuideGear.GetSpec()            -> key, label, source ("setting" | "talents") | nil
--   LamboGuideGear.SetSpec(tree, list)  -> tree index (+ list key) or nil for automatic
--   LamboGuideGear.Invalidate()
--   LamboGuideGear.Slash(arg)           -> "/lg gear [on|off|auto|<tree> [list]|<list>]"
--
-- Client APIs used (all in the Forever 1.60.1 API documentation):
--   C_Item.GetItemInfo / GetItemInfoInstant / GetItemStats, GetInventoryItemLink,
--   C_PaperDollInfo.GetInventorySlotInfo, C_SpecializationInfo.GetSpecializationInfo
--   (7th return = points spent), CanDualWield, C_TooltipInfo.GetHyperlink (red lines =
--   the game says you cannot use the item: wrong armor/weapon type, level, class ...).

LamboGuideGear = LamboGuideGear or {}
local G = LamboGuideGear
local D = LamboGuideGearData

local function Pass(ok, ...) if ok then return ... end end
local function Call(fn, ...)
    if type(fn) ~= "function" then return nil end
    return Pass(pcall(fn, ...))
end

local function DB()
    if type(LamboGuideDB) ~= "table" then return {} end
    return LamboGuideDB
end
local function Lang() return DB().language == "en" and "en" or "tr" end

-- ---------------------------------------------------------------- client
local function ItemInfo(item)
    if C_Item and C_Item.GetItemInfo then return Call(C_Item.GetItemInfo, item) end
    return Call(GetItemInfo, item)
end
local function ItemInstant(item)
    if C_Item and C_Item.GetItemInfoInstant then return Call(C_Item.GetItemInfoInstant, item) end
    return Call(GetItemInfoInstant, item)
end
local function ItemStats(link)
    if C_Item and C_Item.GetItemStats then return Call(C_Item.GetItemStats, link) end
    return Call(GetItemStats, link)
end
local function SlotId(name)
    if C_PaperDollInfo and C_PaperDollInfo.GetInventorySlotInfo then
        return (Call(C_PaperDollInfo.GetInventorySlotInfo, name))
    end
    return (Call(GetInventorySlotInfo, name))
end
local function Equipped(slotName)
    local id = SlotId(slotName)
    return id and Call(GetInventoryItemLink, "player", id) or nil
end
local function PlayerClass()
    local _, token = Call(UnitClass, "player")
    return token
end
local function ItemId(item)
    if type(item) == "number" then return item end
    return tonumber(tostring(item or ""):match("item:(%d+)"))
end

local function IsRed(c)
    if type(c) ~= "table" or type(RED_FONT_COLOR) ~= "table" then return false end
    if c.IsRGBEqualTo and RED_FONT_COLOR.r then return c:IsRGBEqualTo(RED_FONT_COLOR) and true or false end
    local r = RED_FONT_COLOR
    return c.r == r.r and c.g == r.g and c.b == r.b
end

-- Red tooltip lines for the item. nil = the client could not tell us.
local function RedLines(link)
    if not (C_TooltipInfo and C_TooltipInfo.GetHyperlink) then return nil end
    local data = Call(C_TooltipInfo.GetHyperlink, link)
    if type(data) ~= "table" or type(data.lines) ~= "table" then return nil end
    local out = {}
    for _, line in ipairs(data.lines) do
        if IsRed(line.leftColor) and line.leftText and line.leftText ~= "" then out[#out + 1] = line.leftText end
        if IsRed(line.rightColor) and line.rightText and line.rightText ~= "" then out[#out + 1] = line.rightText end
    end
    return out
end

-- ---------------------------------------------------------------- spec
local specCache

local function TalentTree(count)
    if not (C_SpecializationInfo and C_SpecializationInfo.GetSpecializationInfo) then return nil end
    local best, bestPoints = nil, 0
    for i = 1, count do
        local points = tonumber((select(7, Call(C_SpecializationInfo.GetSpecializationInfo, i, false, false)))) or 0
        if points > bestPoints then best, bestPoints = i, points end
    end
    return best
end

local function Resolve()
    local token = PlayerClass()
    local cls = token and D.CLASSES[token]
    if not cls then return nil end
    local saved = type(DB().gearSpec) == "table" and DB().gearSpec[token]
    local tree, listKey, source
    if type(saved) == "table" and cls.trees[saved.tree] then
        tree, listKey, source = saved.tree, saved.list, "setting"
    else
        tree, source = TalentTree(#cls.trees), "talents"
    end
    if not tree then return { none = true } end
    local t = cls.trees[tree]
    local list = t.lists[1]
    for _, l in ipairs(t.lists) do if l.key == listKey then list = l end end
    local label = t.name
    if #t.lists > 1 then label = label .. " (" .. list.key .. ")" end
    return { tree = tree, list = list, label = label, source = source, key = tree .. ":" .. list.key }
end

local function Spec()
    local now = (GetTime and Call(GetTime)) or 0
    if not specCache or now - specCache.at > 5 or now < specCache.at then
        specCache = Resolve()
        if not specCache then return nil end
        specCache.at = now
    end
    return specCache
end

function G.Invalidate() specCache = nil end

function G.GetSpec()
    local s = Spec()
    if not s or s.none then return nil end
    return s.key, s.label, s.source
end

function G.SetSpec(tree, listKey)
    local token = PlayerClass()
    if not token then return end
    local db = DB()
    db.gearSpec = type(db.gearSpec) == "table" and db.gearSpec or {}
    db.gearSpec[token] = tree and { tree = tree, list = listKey } or nil
    G.Invalidate()
end

-- ---------------------------------------------------------------- stats
local function GroupOf(key)
    for _, rule in ipairs(D.KEY_RULES) do
        if key:find(rule[1], 1, true) then return rule[2] end
    end
    return nil
end

-- groups: { group = value }, raw: { key = value } (all keys, for the AI and for "other")
local function ReadStats(link)
    local raw = link and ItemStats(link)
    if type(raw) ~= "table" then return nil end
    local groups, plain = {}, {}
    for key, v in pairs(raw) do
        v = tonumber(v)
        if type(key) == "string" and v and v ~= 0 then
            plain[key] = v
            local g = GroupOf(key)
            if g then groups[g] = (groups[g] or 0) + v end
        end
    end
    return groups, plain
end

local function AddInto(sum, part)
    for k, v in pairs(part or {}) do sum[k] = (sum[k] or 0) + v end
    return sum
end

-- Ratings -> percent (or Defense skill) for the player's level, by the client itself.
-- Returns a new table and whether the conversion worked.
local function ToPercent(groups, kind)
    local fn = GetCombatRatingBonusForCombatRatingValue
    if type(fn) ~= "function" or not kind then return groups, false end
    local out, ok = {}, true
    for g, v in pairs(groups) do
        local cr = D.RATINGS[g]
        if type(cr) == "table" then cr = cr[kind] end
        local index = cr and _G[cr]
        if index then
            local p = tonumber((Call(fn, index, v)))
            if p then out[g] = p else out[g] = v; ok = false end
        else
            out[g] = v
        end
    end
    return out, ok
end

local function EntryValue(entry, groups, conv)
    local def = D.ENTRIES[entry]
    if not def then return 0 end
    local v, has = 0, false
    for _, g in ipairs(def.groups) do
        if groups[g] then v = v + groups[g]; has = true end
    end
    if not has and def.fallback and groups[def.fallback] then v = groups[def.fallback] end
    for _, c in ipairs(conv or {}) do
        if c.into == entry and groups[c.from] then v = v + groups[c.from] / c.per end
    end
    return v
end

local function Round(v)
    local r = math.floor(math.abs(v) * 10 + 0.5) / 10
    return v < 0 and -r or r
end

-- ---------------------------------------------------------------- compare
local RANK = { empty = 0, better = 1, mixed = 2, same = 3, worse = 4 }

local function Targets(equipLoc)
    local list = D.SLOTS[equipLoc]
    if not list then return nil end
    local mainLink = Equipped("MainHandSlot")
    local mainIs2H = mainLink and select(4, ItemInstant(mainLink)) == "INVTYPE_2HWEAPON"
    if equipLoc == "INVTYPE_2HWEAPON" then
        return { { slots = { "MainHandSlot", "SecondaryHandSlot" } } }
    end
    if equipLoc == "INVTYPE_WEAPON" then
        if mainIs2H or not Call(CanDualWield) then return { { slots = { "MainHandSlot" } } } end
        local off = Equipped("SecondaryHandSlot")
        local offLoc = off and select(4, ItemInstant(off))
        if offLoc == "INVTYPE_SHIELD" or offLoc == "INVTYPE_HOLDABLE" then return { { slots = { "MainHandSlot" } } } end
    end
    local out = {}
    for _, s in ipairs(list) do out[#out + 1] = { slots = { s } } end
    return out
end

-- Compare new stats with the stats of the equipped items in target.slots.
local function Against(spec, newGroups, newPlain, target, newLink)
    local oldGroups, oldPlain, links, count = {}, {}, {}, 0
    for _, s in ipairs(target.slots) do
        local link = Equipped(s)
        if link then
            if link == newLink then return { equipped = true, slots = target.slots } end
            local g, p = ReadStats(link)
            if not g then return nil end                    -- equipped item not loaded yet
            AddInto(oldGroups, g); AddInto(oldPlain, p)
            links[#links + 1] = link; count = count + 1
        end
    end
    local r = { slots = target.slots, oldLinks = links, empty = count == 0, changes = {}, notComparable = {} }
    -- Weapon DPS of one two-hander vs two one-handers is not the same thing: report, do not judge.
    local mixedWeapons = (#target.slots == 2 and count == 2)
    local ups, downs = 0, 0
    if spec and not spec.none then
        local okA, okB
        newGroups, okA = ToPercent(newGroups, spec.list.kind)
        oldGroups, okB = ToPercent(oldGroups, spec.list.kind)
        r.percent = okA and okB
        local entries = {}
        for _, e in ipairs(spec.list.prio) do entries[#entries + 1] = e end
        for _, e in ipairs(spec.list.also or {}) do entries[#entries + 1] = e end
        for _, entry in ipairs(entries) do
            local def = D.ENTRIES[entry]
            local isDps = def and def.groups[1] == "dps"
            local a = EntryValue(entry, newGroups, spec.list.conv)
            local b = EntryValue(entry, oldGroups, spec.list.conv)
            if def and #def.groups == 0 then
                -- not readable from item stats (Weapon Skill)
            elseif isDps and mixedWeapons then
                if a ~= 0 or b ~= 0 then r.notComparable[#r.notComparable + 1] = { entry = entry, new = a, old = b } end
            else
                local d = Round(a - b)
                if d ~= 0 then
                    r.changes[#r.changes + 1] = { entry = entry, delta = d }
                    if d > 0 then ups = ups + 1 else downs = downs + 1 end
                end
            end
        end
    end
    -- Every other stat difference, by the game's own stat name (for the AI and the no-talent case).
    r.other = {}
    local keys = {}
    for k in pairs(newPlain) do keys[k] = true end
    for k in pairs(oldPlain) do keys[k] = true end
    for k in pairs(keys) do
        local d = Round((newPlain[k] or 0) - (oldPlain[k] or 0))
        if d ~= 0 then r.other[#r.other + 1] = { key = k, name = (type(_G) == "table" and type(_G[k]) == "string") and _G[k] or k, delta = d } end
    end
    table.sort(r.other, function(x, y) return x.name < y.name end)

    if r.empty then r.verdict = "empty"
    elseif ups > 0 and downs == 0 then r.verdict = "better"
    elseif downs > 0 and ups == 0 then r.verdict = "worse"
    elseif ups > 0 then r.verdict = "mixed"
    else r.verdict = "same" end
    return r
end

function G.Compare(item)
    if not item then return nil, "noitem" end
    local _, _, _, equipLoc = ItemInstant(item)
    if not equipLoc or not D.SLOTS[equipLoc] then return nil, "notgear" end
    local name, link = ItemInfo(item)
    if not link then return nil, "loading" end
    local newGroups, newPlain = ReadStats(link)
    if not newGroups then return nil, "loading" end
    local spec = Spec()
    if not spec then return nil, "unknown" end

    local base = { name = name, link = link, equipLoc = equipLoc,
                   spec = not spec.none and spec.label or nil, specSource = spec.source, noSpec = spec.none or nil,
                   prio = not spec.none and spec.list.prio or nil, also = not spec.none and spec.list.also or nil }
    local red = RedLines(link)
    if red and #red > 0 then
        base.verdict, base.red, base.slots = "unusable", red, D.SLOTS[equipLoc]
        return base
    end
    base.usableKnown = red ~= nil

    if (equipLoc == "INVTYPE_WEAPONOFFHAND" or equipLoc == "INVTYPE_SHIELD" or equipLoc == "INVTYPE_HOLDABLE") then
        local main = Equipped("MainHandSlot")
        if main and select(4, ItemInstant(main)) == "INVTYPE_2HWEAPON" then
            base.verdict, base.slots = "twohanded", { "SecondaryHandSlot" }
            return base
        end
    end

    local best
    for _, t in ipairs(Targets(equipLoc) or {}) do
        local r = Against(spec, newGroups, newPlain, t, link)
        if not r then return nil, "loading" end
        if r.equipped then base.verdict, base.slots = "equipped", r.slots; return base end
        if not best or RANK[r.verdict] < RANK[best.verdict] then best = r end
    end
    if not best then return nil, "notgear" end
    for k, v in pairs(best) do base[k] = v end
    if spec.none then base.verdict = best.empty and "empty" or "nospec" end
    return base
end

-- ---------------------------------------------------------------- texts
local TEXT = {
    tr = {
        better = "Öncelikli statların artıyor", worse = "Öncelikli statların azalıyor", mixed = "Karışık",
        same = "Öncelikli statlarda fark yok", empty = "Bu yuva boş", unusable = "Kullanamazsın",
        twohanded = "İki elli silah takılı; bunun için onu çıkarman gerekir",
        nospec = "Yetenek puanı yok, stat farkı", weapons = "silah DPS'i ayrıca karşılaştır",
        cmd = "Eşya karşılaştırma: %s (%s). Kaynak: Icy Veins WoW Forever öncelikleri. Değiştir: /lg gear <ağaç adı> [liste], /lg gear auto, ipucu satırı: /lg gear on|off",
        none = "yetenek puanı yok", src = { setting = "senin seçimin", talents = "yeteneklerinden" },
        lists = "Bu ağacın listeleri: %s",
        set = "Eşya karşılaştırma artık: %s", auto = "Eşya karşılaştırma yeteneklerine göre seçecek.",
        on = "İpucunda karşılaştırma satırı açık.", off = "İpucunda karşılaştırma satırı kapalı.",
        bad = "Bilinmeyen seçim: %s",
    },
    en = {
        better = "Your priority stats go up", worse = "Your priority stats go down", mixed = "Mixed",
        same = "No change in your priority stats", empty = "This slot is empty", unusable = "You cannot use this",
        twohanded = "A two-handed weapon is equipped; you would have to remove it",
        nospec = "No talent points yet, stat change", weapons = "compare weapon DPS yourself",
        cmd = "Gear check: %s (%s). Source: Icy Veins WoW Forever priorities. Change: /lg gear <tree name> [list], /lg gear auto, tooltip line: /lg gear on|off",
        none = "no talent points", src = { setting = "your choice", talents = "from talents" },
        lists = "Lists for this tree: %s",
        set = "Gear check now uses: %s", auto = "Gear check will follow your talents.",
        on = "Gear line in tooltips is on.", off = "Gear line in tooltips is off.",
        bad = "Unknown choice: %s",
    },
}
local function T(key) local t = TEXT[Lang()]; return t[key] or TEXT.tr[key] end

local GREEN, RED, GRAY, YELLOW = { 0.25, 0.9, 0.25 }, { 0.95, 0.3, 0.3 }, { 0.7, 0.7, 0.7 }, { 1, 0.82, 0 }

local function Num(v)
    local s = (v == math.floor(v)) and string.format("%d", v) or string.format("%.1f", v)
    return (v > 0 and "+" or "") .. s
end
local function EntryName(entry) return Lang() == "tr" and (D.ENTRY_TR[entry] or entry) or entry end
local PCT_GROUPS = { hit = true, crit = true, haste = true, expertise = true, dodge = true, parry = true, block = true }
local function Unit(entry, percent)
    local def = D.ENTRIES[entry]
    return (percent and def and PCT_GROUPS[def.groups[1] or ""]) and "%" or ""
end

local function ChangeList(changes, limit, percent)
    local parts = {}
    for i, c in ipairs(changes) do
        if i > limit then break end
        parts[#parts + 1] = Num(c.delta) .. Unit(c.entry, percent) .. " " .. EntryName(c.entry)
    end
    return table.concat(parts, ", ")
end

local function OtherList(other, limit)
    local parts = {}
    for i, c in ipairs(other) do
        if i > limit then break end
        parts[#parts + 1] = Num(c.delta) .. " " .. c.name
    end
    return table.concat(parts, ", ")
end

function G.Line(item)
    local r = G.Compare(item)
    if not r or r.verdict == "equipped" then return nil end
    local v, text, color = r.verdict, nil, GRAY
    if v == "unusable" then
        text, color = T("unusable") .. ": " .. table.concat(r.red, ", "), RED
    elseif v == "twohanded" then
        text, color = T("twohanded"), YELLOW
    elseif v == "nospec" then
        if #r.other == 0 then return nil end
        text, color = T("nospec") .. ": " .. OtherList(r.other, 4), GRAY
    else
        text = T(v)
        local list = v == "empty" and {} or r.changes
        if v == "empty" then
            for _, c in ipairs(r.changes) do if c.delta > 0 then list[#list + 1] = c end end
        end
        if #list > 0 then
            text = text .. ": " .. ChangeList(list, 3, r.percent)
        elseif v == "empty" and r.noSpec and #r.other > 0 then
            text = text .. ": " .. OtherList(r.other, 4)
        end
        if #r.notComparable > 0 then text = text .. " (" .. T("weapons") .. ")" end
        color = (v == "better" or v == "empty") and GREEN or (v == "worse" and RED or (v == "mixed" and YELLOW or GRAY))
    end
    if r.spec then text = text .. " [" .. r.spec .. "]" end
    return text, color[1], color[2], color[3]
end

function G.LineColor(item)
    local _, r, g, b = G.Line(item)
    return r, g, b
end

local function SlotWords(slots, lang)
    local out = {}
    for _, s in ipairs(slots or {}) do out[#out + 1] = (D.SLOT_NAMES[lang or "en"] or {})[s] or s end
    return table.concat(out, " + ")
end

function G.AiLine(item)
    local r = G.Compare(item)
    if not r then return nil end
    local token = PlayerClass() or "?"
    local who = (r.spec or "no talents yet") .. " " .. token:sub(1, 1) .. token:sub(2):lower()
    local head = "Gear check (" .. who .. "): "
    if r.verdict == "equipped" then return head .. "the player is wearing this item now." end
    if r.verdict == "unusable" then return head .. "the game shows red requirement lines, so the player cannot use it now: " .. table.concat(r.red, "; ") .. "." end
    if r.verdict == "twohanded" then return head .. "a two-handed weapon is equipped, so this off-hand item cannot be worn with it." end
    local parts = {}
    local oldNames = {}
    for _, l in ipairs(r.oldLinks or {}) do oldNames[#oldNames + 1] = "[" .. (ItemInfo(l) or "?") .. "]" end
    parts[#parts + 1] = r.empty and ("the " .. SlotWords(r.slots) .. " slot is empty.")
        or ("compared with the equipped " .. SlotWords(r.slots) .. " " .. table.concat(oldNames, " + ") .. ".")
    if r.prio then
        parts[#parts + 1] = "Icy Veins WoW Forever stat priority for this spec: " .. table.concat(r.prio, " > ")
            .. " (a priority order, not fixed weights)"
            .. (r.also and #r.also > 0 and ("; also compare: " .. table.concat(r.also, ", ")) or "") .. "."
        local ch = {}
        for _, c in ipairs(r.changes) do ch[#ch + 1] = Num(c.delta) .. Unit(c.entry, r.percent) .. " " .. c.entry end
        if r.percent then parts[#parts + 1] = "Ratings converted to percent for the player's level by the game." end
        parts[#parts + 1] = "Priority stat changes: " .. (#ch > 0 and table.concat(ch, ", ") or "none") .. "."
        for _, n in ipairs(r.notComparable) do
            parts[#parts + 1] = n.entry .. ": new " .. n.new .. " vs equipped pair " .. n.old .. " (two-hander vs two weapons, not compared)."
        end
    end
    if #r.other > 0 then parts[#parts + 1] = "All stat changes (game names): " .. OtherList(r.other, 20) .. "." end
    parts[#parts + 1] = "LamboGuide verdict: " .. r.verdict .. "."
    if not r.usableKnown then parts[#parts + 1] = "Usability could not be checked." end
    return head .. table.concat(parts, " ")
end

function G.TooltipLine(tip, itemId)
    if DB().gearTooltip == false or not tip or not tip.AddLine then return false end
    local item = itemId
    if tip.GetItem then
        local _, link = Call(tip.GetItem, tip)
        if link and ItemId(link) == tonumber(itemId) then item = link end
    end
    local text, r, g, b = G.Line(item)
    if not text then return false end
    tip:AddLine("LG: " .. text, r, g, b, true)
    return true
end

-- ---------------------------------------------------------------- slash
local ASCII = { ["ı"] = "i", ["İ"] = "I", ["ğ"] = "g", ["Ğ"] = "G", ["ş"] = "s", ["Ş"] = "S",
                ["ç"] = "c", ["Ç"] = "C", ["ö"] = "o", ["Ö"] = "O", ["ü"] = "u", ["Ü"] = "U" }
local function Plain(s) for a, b in pairs(ASCII) do s = s:gsub(a, b) end; return s end
local function Say(s) if print then print("|cffffd100LamboGuide:|r " .. Plain(s)) end end
local function Norm(s) return (Plain(tostring(s or "")):lower():gsub("[%s%-_]", "")) end

local function FindList(tree, word)
    local w = Norm(word)
    for _, l in ipairs(tree.lists) do
        if Norm(l.key) == w then return l end
        for _, x in ipairs(l.words or {}) do if Norm(x) == w then return l end end
    end
end

-- "/lg gear debug": what the client really returns for the worn items (stat keys, red lines, spec).
function G.Debug()
    local key, label, source = G.GetSpec()
    Say("spec=" .. tostring(label) .. " key=" .. tostring(key) .. " source=" .. tostring(source)
        .. " dualWield=" .. tostring(Call(CanDualWield)) .. " tooltipAPI=" .. tostring(C_TooltipInfo ~= nil))
    for _, list in pairs(D.SLOTS) do
        for _, name in ipairs(list) do
            if not G._dbgSeen then G._dbgSeen = {} end
            if not G._dbgSeen[name] then
                G._dbgSeen[name] = true
                local id, link = SlotId(name), Equipped(name)
                if link then
                    local _, plain = ReadStats(link)
                    local parts = {}
                    for k, v in pairs(plain or {}) do parts[#parts + 1] = k .. "=" .. v .. "(" .. tostring(GroupOf(k)) .. ")" end
                    table.sort(parts)
                    local red = RedLines(link)
                    Say(name .. "#" .. tostring(id) .. " " .. link .. " " .. table.concat(parts, " ")
                        .. " red=" .. (red and table.concat(red, "|") or "nil"))
                end
            end
        end
    end
    G._dbgSeen = nil
end

function G.Slash(arg)
    arg = tostring(arg or ""):match("^%s*(.-)%s*$")
    local db = DB()
    local token = PlayerClass()
    local cls = token and D.CLASSES[token]
    if arg == "" then
        local key, label, source = G.GetSpec()
        Say(string.format(T("cmd"), label or T("none"), key and T("src")[source] or "-"))
        local s = Spec()
        if cls and s and not s.none and #cls.trees[s.tree].lists > 1 then
            local names = {}
            for _, l in ipairs(cls.trees[s.tree].lists) do names[#names + 1] = l.key end
            Say(string.format(T("lists"), table.concat(names, ", ")))
        end
        return
    end
    local itemArg = arg:match("|Hitem:[^|]+|h.-|h") and arg or arg:match("item:%d+")
    if itemArg then
        local r, why = G.Compare(itemArg)
        Say((G.Line(itemArg)) or ("-- " .. tostring(r and r.verdict or why)))
        Say(G.AiLine(itemArg) or "")
        local _, link = ItemInfo(itemArg)
        local _, plain = ReadStats(link)
        local parts = {}
        for k, v in pairs(plain or {}) do parts[#parts + 1] = k .. "=" .. v .. "(" .. tostring(GroupOf(k)) .. ")" end
        table.sort(parts)
        if #parts > 0 then Say("stats: " .. table.concat(parts, " ")) end
        local spec = Spec()
        local kind = spec and not spec.none and spec.list.kind or "melee"
        local groups = ReadStats(link)
        local pct, ok = ToPercent(groups or {}, kind)
        local conv = {}
        for g, v in pairs(pct) do if D.RATINGS[g] then conv[#conv + 1] = g .. "=" .. Round(v) end end
        table.sort(conv)
        if #conv > 0 then Say("game conversion (" .. kind .. ", ok=" .. tostring(ok) .. "): " .. table.concat(conv, " ")) end
        return
    end
    local a = Norm(arg)
    if a == "debug" then G.Debug(); return end
    if a == "on" or a == "ac" then db.gearTooltip = true; Say(T("on")); return end
    if a == "off" or a == "kapat" then db.gearTooltip = false; Say(T("off")); return end
    if a == "auto" or a == "otomatik" then G.SetSpec(nil); Say(T("auto")); return end
    if not cls then Say(string.format(T("bad"), arg)); return end
    local first, rest = arg:match("^(%S+)%s*(.-)$")
    -- "<tree> [list]": tree names may have two words ("Beast Mastery", "Feral Combat")
    for i, t in ipairs(cls.trees) do
        local n = Norm(t.name)
        for _, try in ipairs({ { Norm(arg), "" }, { Norm(first), rest } }) do
            local w, listWord = try[1], try[2]
            if #w >= 3 and n:sub(1, #w) == w then
                local list = listWord ~= "" and FindList(t, listWord) or t.lists[1]
                if list then
                    G.SetSpec(i, list.key)
                    Say(string.format(T("set"), t.name .. (#t.lists > 1 and (" (" .. list.key .. ")") or "")))
                    return
                end
            end
        end
    end
    -- just a list word ("bear", "defensive") for the current tree
    local s = Spec()
    if s and not s.none then
        local list = FindList(cls.trees[s.tree], arg)
        if list then
            G.SetSpec(s.tree, list.key)
            Say(string.format(T("set"), cls.trees[s.tree].name .. " (" .. list.key .. ")"))
            return
        end
    end
    Say(string.format(T("bad"), arg))
end
