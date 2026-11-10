-- LamboGuide extras (read-only helpers; nothing here plays for the player).
--   * Inventory: bags, bank and money of every character on this account, searchable.
--   * Arrow: a small direction arrow + distance to the map waypoint.
--   * Session: XP/hour, time to level, gold/hour.
--   * Prices: auction prices the player saw while browsing the AH, shown in item tooltips.
--   * Notes: level-up, dungeon entry, repair and full-bag reminders.
--   * Recommended addons list with copyable links.

LamboGuideExtras = LamboGuideExtras or {}
local X = LamboGuideExtras
-- Blizzard's default fonts have no Turkish letters (boxes for s, g, i with marks): our own window texts use DejaVu
local FONT = "Interface\\AddOns\\LamboGuide\\DejaVuSans.ttf"
local function Font(fs, size)
    if fs and fs.SetFont then pcall(fs.SetFont, fs, FONT, size or 12, "") end
    return fs
end
X.Font = Font

local TEXT = {
    tr = {
        inventory = "Envanter", search = "Ara", noItems = "Kayıtlı eşya yok. Çantanı ve bankanı bir kez açman yeterli.",
        bags = "çanta", bank = "banka", gear = "giyili", total = "toplam", money = "Para", updated = "güncellendi",
        session = "OTURUM", sessionTime = "Süre", xpHour = "XP/saat", toLevel = "Seviyeye kalan", goldHour = "Altın/saat",
        arrived = "Vardın", arrowTip = "Sol tık: sürükle  ·  Sağ tık: oku kapat",
        levelUp = "Seviye %d oldun! Eğitmende yeni yetenekler olabilir.", levelAsk = "Ne öğrenmeliyim?",
        talent = "Harcanmamış %d yetenek puanın var.",
        dungeon = "%s içindesin.", dungeonAsk = "Zindan özeti iste",
        repair = "Ekipmanın yıpranıyor (%%%d). Fırsat bulunca tamir ettir.", bagsFull = "Çantanda sadece %d boş yer kaldı.",
        ahPrice = "LG AH fiyatı", vendor = "Satıcı fiyatı", ago = "önce", day = "gün", hour = "saat", min = "dk",
        addonsTitle = "Önerilen addonlar", installed = "kurulu", notInstalled = "kurulu değil", copyHint = "Bağlantıyı seç, Ctrl+C ile kopyala.",
        addons = {
            Questie = "Görev yerleri ve hedefler haritada. LamboGuide konumları buradan okur.",
            Auctionator = "Müzayede evinde arama, satış fiyatı ve tarama.",
            TomTom = "Gelişmiş yön oku ve harita işaretleri.",
            Details = "Hasar ve iyileştirme ölçer.",
        },
    },
    en = {
        inventory = "Inventory", search = "Search", noItems = "No items saved yet. Open your bags and bank once.",
        bags = "bags", bank = "bank", gear = "equipped", total = "total", money = "Money", updated = "updated",
        session = "SESSION", sessionTime = "Time", xpHour = "XP/hour", toLevel = "Time to level", goldHour = "Gold/hour",
        arrived = "Arrived", arrowTip = "Left drag: move  ·  Right click: close arrow",
        levelUp = "You reached level %d! The trainer may have new abilities.", levelAsk = "What should I learn?",
        talent = "You have %d unspent talent points.",
        dungeon = "You are in %s.", dungeonAsk = "Get a dungeon briefing",
        repair = "Your gear is wearing out (%%%d). Repair when you can.", bagsFull = "Only %d free bag slots left.",
        ahPrice = "LG AH price", vendor = "Vendor price", ago = "ago", day = "d", hour = "h", min = "m",
        addonsTitle = "Recommended addons", installed = "installed", notInstalled = "not installed", copyHint = "Select the link and press Ctrl+C.",
        addons = {
            Questie = "Quest givers and objectives on the map. LamboGuide reads locations from it.",
            Auctionator = "Auction house search, selling prices and scans.",
            TomTom = "Advanced arrow and map waypoints.",
            Details = "Damage and healing meter.",
        },
    },
}
local function L(key)
    local lang = (LamboGuideDB and LamboGuideDB.language == "en") and "en" or "tr"
    return TEXT[lang][key] or TEXT.tr[key] or key
end
X.L = L

local function Pass(ok, ...) if ok then return ... end end
local function Safe(fn, ...)
    if type(fn) ~= "function" then return nil end
    return Pass(pcall(fn, ...))                 -- keeps every return value (some APIs return 17)
end
local GOLD, RESET, MUTED = "|cffffd36a", "|r", "|cffa9a094"

local function Money(c)
    c = math.floor(tonumber(c) or 0)
    local neg = c < 0; c = math.abs(c)
    local s = (c >= 10000 and (math.floor(c / 10000) .. "g ") or "") .. ((c >= 100) and ((math.floor(c / 100) % 100) .. "s ") or "") .. (c % 100) .. "c"
    return (neg and "-" or "") .. s
end
X.Money = Money

local function Ago(t)
    local d = (time and time() or 0) - (tonumber(t) or 0)
    if d >= 86400 then return math.floor(d / 86400) .. " " .. L("day") .. " " .. L("ago") end
    if d >= 3600 then return math.floor(d / 3600) .. " " .. L("hour") .. " " .. L("ago") end
    return math.max(1, math.floor(d / 60)) .. " " .. L("min") .. " " .. L("ago")
end

local function Me()
    local realm = (GetRealmName and GetRealmName()) or "?"
    local name = (UnitName and UnitName("player")) or "?"
    return realm, name
end

---------------------------------------------------------------- inventory
local function Store()
    LamboGuideDB.inv = LamboGuideDB.inv or {}
    local realm, name = Me()
    LamboGuideDB.inv[realm] = LamboGuideDB.inv[realm] or {}
    local rec = LamboGuideDB.inv[realm][name] or {}
    LamboGuideDB.inv[realm][name] = rec
    return rec
end

local function SlotInfo(bag, slot)
    if C_Container and C_Container.GetContainerItemInfo then
        local i = Safe(C_Container.GetContainerItemInfo, bag, slot)
        if i then return i.hyperlink, i.stackCount or 1, i.itemID end
        return nil
    end
    if GetContainerItemLink then
        local link = Safe(GetContainerItemLink, bag, slot)
        if link then
            local _, count = Safe(GetContainerItemInfo, bag, slot)
            return link, count or 1, tonumber(link:match("item:(%d+)"))
        end
    end
end

local function NumSlots(bag)
    if C_Container and C_Container.GetContainerNumSlots then return Safe(C_Container.GetContainerNumSlots, bag) or 0 end
    return (GetContainerNumSlots and Safe(GetContainerNumSlots, bag)) or 0
end

local function ScanBags(bags)
    local items, free, total = {}, 0, 0
    for _, bag in ipairs(bags) do
        for slot = 1, NumSlots(bag) do
            total = total + 1
            local link, count, id = SlotInfo(bag, slot)
            if link and id then
                local e = items[id] or { n = 0, name = link:match("%[(.-)%]") or tostring(id) }
                e.n = e.n + (count or 1); items[id] = e
            else
                free = free + 1
            end
        end
    end
    return items, free, total
end

function X.ScanBags()
    if not LamboGuideDB then return end
    local rec = Store()
    local bags = {}
    for b = 0, (NUM_BAG_SLOTS or 4) do bags[#bags + 1] = b end
    rec.bags, rec.free, rec.slots = ScanBags(bags)
    rec.class = UnitClass and UnitClass("player"); rec.level = UnitLevel and UnitLevel("player")
    rec.money = GetMoney and GetMoney() or rec.money
    rec.t = time and time() or 0
    return rec
end

function X.ScanBank()
    if not LamboGuideDB then return end
    local rec = Store()
    local bags = { BANK_CONTAINER or -1 }
    local first = (NUM_BAG_SLOTS or 4) + 1
    for b = first, first + (NUM_BANKBAGSLOTS or 6) - 1 do bags[#bags + 1] = b end
    rec.bank = ScanBags(bags)
    rec.bankT = time and time() or 0
end

-- "Name x3 (Char: bags 2, bank 1; Alt: bags 1)" lines, filtered by text.
function X.InventoryText(filter)
    local inv = LamboGuideDB and LamboGuideDB.inv
    local realm = Me()
    if not inv or not inv[realm] then return L("noItems") end
    filter = (filter or ""):lower()
    local byItem = {}
    local chars = {}
    for char, rec in pairs(inv[realm]) do
        chars[#chars + 1] = char
        for where, list in pairs({ bags = rec.bags, bank = rec.bank }) do
            for id, e in pairs(list or {}) do
                if filter == "" or e.name:lower():find(filter, 1, true) then
                    local row = byItem[id] or { name = e.name, total = 0, parts = {} }
                    row.total = row.total + e.n
                    row.parts[#row.parts + 1] = char .. " " .. L(where) .. " " .. e.n
                    byItem[id] = row
                end
            end
        end
    end
    local rows = {}
    for _, r in pairs(byItem) do rows[#rows + 1] = r end
    table.sort(rows, function(a, b) return a.name < b.name end)
    table.sort(chars)
    local out = { GOLD .. L("inventory") .. RESET }
    for _, char in ipairs(chars) do
        local rec = inv[realm][char]
        out[#out + 1] = MUTED .. char .. " (" .. tostring(rec.level or "?") .. " " .. tostring(rec.class or "") .. "): " .. L("money") .. " "
            .. Money(rec.money) .. (rec.t and ("  ·  " .. L("updated") .. " " .. Ago(rec.t)) or "") .. RESET
    end
    out[#out + 1] = ""
    if #rows == 0 then out[#out + 1] = L("noItems") end
    for i, r in ipairs(rows) do
        if i > 300 then break end
        out[#out + 1] = r.name .. " x" .. r.total .. "  " .. MUTED .. "(" .. table.concat(r.parts, ", ") .. ")" .. RESET
    end
    return table.concat(out, "\n")
end

-- Short line for the AI: other characters and their gold.
function X.AltsContext()
    local inv = LamboGuideDB and LamboGuideDB.inv
    local realm, me = Me()
    if not inv or not inv[realm] then return "" end
    local parts = {}
    for char, rec in pairs(inv[realm]) do
        if char ~= me then parts[#parts + 1] = char .. " (" .. tostring(rec.level or "?") .. " " .. tostring(rec.class or "?") .. ", " .. Money(rec.money) .. ")" end
    end
    table.sort(parts)
    return #parts > 0 and ("Other characters on this realm=" .. table.concat(parts, "; ")) or ""
end

-- How many of an item the account owns (for the AI and tooltips).
function X.OwnedCount(itemId)
    local inv = LamboGuideDB and LamboGuideDB.inv
    local realm = Me()
    local n = 0
    for _, rec in pairs(inv and inv[realm] or {}) do
        for _, list in ipairs({ rec.bags or {}, rec.bank or {} }) do if list[itemId] then n = n + list[itemId].n end end
    end
    return n
end

---------------------------------------------------------------- session stats
local session = { start = nil, xp = 0, money = nil, lastXP = nil, lastMax = nil, lastLevel = nil }
X.session = session

function X.StartSession(now)
    session.start = now or (GetTime and GetTime()) or 0
    session.xp = 0
    session.money = GetMoney and GetMoney() or 0
    session.lastXP = UnitXP and UnitXP("player") or 0
    session.lastMax = UnitXPMax and UnitXPMax("player") or 0
    session.lastLevel = UnitLevel and UnitLevel("player") or 0
end

function X.OnXP()
    if not session.start then return end
    local xp, max, lvl = UnitXP("player"), UnitXPMax("player"), UnitLevel("player")
    if lvl > (session.lastLevel or lvl) then
        session.xp = session.xp + ((session.lastMax or 0) - (session.lastXP or 0)) + xp      -- crossed a level
    else
        session.xp = session.xp + math.max(0, xp - (session.lastXP or xp))
    end
    session.lastXP, session.lastMax, session.lastLevel = xp, max, lvl
end

function X.SessionStats(now)
    if not session.start then return nil end
    now = now or GetTime()
    local secs = math.max(1, now - session.start)
    local perHour = session.xp / secs * 3600
    local left = (UnitXPMax and UnitXPMax("player") or 0) - (UnitXP and UnitXP("player") or 0)
    local toLevel = perHour > 0 and (left / perHour * 3600) or nil
    local gold = ((GetMoney and GetMoney() or 0) - (session.money or 0)) / secs * 3600
    return { secs = secs, xpHour = perHour, toLevel = toLevel, goldHour = gold }
end

local function Dur(s)
    if not s then return "?" end
    s = math.floor(s)
    if s >= 3600 then return math.floor(s / 3600) .. L("hour") .. " " .. math.floor(s % 3600 / 60) .. L("min") end
    return math.floor(s / 60) .. L("min")
end

function X.SessionText()
    local s = X.SessionStats()
    if not s then return "" end
    return GOLD .. L("session") .. RESET .. "\n" .. L("sessionTime") .. ": " .. Dur(s.secs) .. "    " .. L("xpHour") .. ": " .. math.floor(s.xpHour)
        .. "\n" .. L("toLevel") .. ": " .. (s.toLevel and Dur(s.toLevel) or "?") .. "    " .. L("goldHour") .. ": " .. Money(s.goldHour)
end

function X.Context()
    local s = X.SessionStats()
    local line = s and string.format("Session: %d min played, %d XP/hour, time to next level %s, gold/hour %s", math.floor(s.secs / 60),
        math.floor(s.xpHour), s.toLevel and (math.floor(s.toLevel / 60) .. " min") or "unknown", Money(s.goldHour)) or ""
    local alts = X.AltsContext()
    if line ~= "" and alts ~= "" then return line .. "\n" .. alts end
    return line .. alts
end

---------------------------------------------------------------- AH price memory
local function PriceStore()
    LamboGuideDB.prices = LamboGuideDB.prices or {}
    local realm = Me()
    LamboGuideDB.prices[realm] = LamboGuideDB.prices[realm] or {}
    return LamboGuideDB.prices[realm]
end

function X.RecordPrice(itemId, unitPrice, now)
    itemId, unitPrice = tonumber(itemId), tonumber(unitPrice)
    if not itemId or not unitPrice or unitPrice <= 0 or not LamboGuideDB then return end
    local store = PriceStore()
    local t = now or (time and time()) or 0
    local old = store[itemId]
    -- within one browsing session keep the lowest price seen; a newer session replaces it
    if old and (t - (old.t or 0)) < 1800 and old.p <= unitPrice then return end
    store[itemId] = { p = math.floor(unitPrice), t = t }
end

function X.Price(itemId)
    local store = LamboGuideDB and LamboGuideDB.prices and LamboGuideDB.prices[(Me())]
    return store and store[tonumber(itemId)]
end

-- Old (classic) auction API: read the result page the player is looking at.
function X.ScanAuctionPage()
    if not (GetNumAuctionItems and GetAuctionItemInfo) then return end
    local n = Safe(GetNumAuctionItems, "list") or 0
    for i = 1, n do
        local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, itemId = Safe(GetAuctionItemInfo, "list", i)
        if itemId and buyout and buyout > 0 and count and count > 0 then X.RecordPrice(itemId, buyout / count) end
    end
end

-- Modern auction API results.
function X.ScanCommodity(itemId)
    if not (C_AuctionHouse and C_AuctionHouse.GetCommoditySearchResultInfo) then return end
    local r = Safe(C_AuctionHouse.GetCommoditySearchResultInfo, itemId, 1)
    if r and r.unitPrice then X.RecordPrice(itemId, r.unitPrice) end
end
function X.ScanItemKey(itemKey)
    if not (C_AuctionHouse and C_AuctionHouse.GetItemSearchResultInfo and itemKey) then return end
    local r = Safe(C_AuctionHouse.GetItemSearchResultInfo, itemKey, 1)
    if r and r.buyoutAmount then X.RecordPrice(itemKey.itemID, r.buyoutAmount) end
end

function X.PriceLine(itemId)
    local parts = {}
    local p = X.Price(itemId)
    if p then parts[#parts + 1] = "AH ~" .. Money(p.p) .. " (" .. Ago(p.t) .. ")" end
    local sell = GetItemInfo and select(11, Safe(GetItemInfo, itemId))
    if sell and sell > 0 then parts[#parts + 1] = "vendor " .. Money(sell) end
    local owned = X.OwnedCount(tonumber(itemId))
    if owned > 0 then parts[#parts + 1] = "owned on account " .. owned end
    return #parts > 0 and table.concat(parts, ", ") or nil
end

local function TooltipAdd(tip, itemId)
    if not tip or not itemId or not tip.AddDoubleLine then return end
    local p = X.Price(itemId)
    if p then tip:AddDoubleLine(GOLD .. L("ahPrice") .. RESET, Money(p.p) .. " " .. MUTED .. "(" .. Ago(p.t) .. ")" .. RESET) end
    local owned = X.OwnedCount(itemId)
    if owned > 0 then tip:AddDoubleLine(GOLD .. "LG " .. L("total") .. RESET, tostring(owned)) end
    local gear = LamboGuideGear and LamboGuideGear.TooltipLine and LamboGuideGear.TooltipLine(tip, itemId)  -- "better than what you wear?"
    if (p or owned > 0 or gear) and tip.Show then tip:Show() end
end

function X.HookTooltips()
    if X.hooked then return end
    X.hooked = true
    if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tip, data)
            if data and data.id then pcall(TooltipAdd, tip, data.id) end
        end)
    elseif GameTooltip and GameTooltip.HookScript then
        GameTooltip:HookScript("OnTooltipSetItem", function(tip)
            local _, link = tip:GetItem()
            local id = link and tonumber(link:match("item:(%d+)"))
            if id then pcall(TooltipAdd, tip, id) end
        end)
    end
end

---------------------------------------------------------------- arrow
local arrow, arrivedAt
local target                                       -- { map, x, y, label }
local function WorldPos(map, x, y)
    if not (C_Map and C_Map.GetWorldPosFromMapPos and CreateVector2D) then return end
    local cont, pos = Safe(C_Map.GetWorldPosFromMapPos, map, CreateVector2D(x / 100, y / 100))
    if pos then return cont, pos.x, pos.y end
end

function X.SetTarget(map, x, y, label)
    target = { map = tonumber(map), x = tonumber(x), y = tonumber(y), label = label }
    target.cont, target.wx, target.wy = WorldPos(target.map, target.x, target.y)
    arrivedAt = nil
    if arrow then arrow:Show() end
    X.ShowArrow()
end
function X.ClearTarget() target = nil; if arrow then arrow:Hide() end end
function X.Target() return target end

-- Bearing math: world X points north, Y points west; facing 0 = north, counter-clockwise.
function X.Bearing(px, py, tx, ty, facing)
    local dn, dw = tx - px, ty - py
    local dist = math.sqrt(dn * dn + dw * dw)
    local angle = math.atan2 and math.atan2(dw, dn) or math.atan(dw, dn)
    return dist, angle - (facing or 0)
end

function X.ShowArrow()
    if arrow then arrow:Show(); return end
    if not CreateFrame then return end
    arrow = CreateFrame("Button", "LamboGuideArrow", UIParent)
    arrow:SetSize(56, 70); arrow:SetFrameStrata("HIGH")
    local pos = LamboGuideDB and LamboGuideDB.arrowPos
    if pos and pos.point then arrow:SetPoint(pos.point, UIParent, pos.rel or pos.point, pos.x or 0, pos.y or 0) else arrow:SetPoint("TOP", UIParent, "TOP", 0, -120) end
    arrow:SetMovable(true); arrow:EnableMouse(true); arrow:RegisterForDrag("LeftButton"); arrow:RegisterForClicks("RightButtonUp")
    arrow:SetScript("OnDragStart", arrow.StartMoving)
    arrow:SetScript("OnDragStop", function(self)
        self:StopMovingOrSizing()
        local point, _, rel, x, y = self:GetPoint()
        LamboGuideDB.arrowPos = { point = point, rel = rel, x = x, y = y }
    end)
    arrow:SetScript("OnClick", function() X.ClearTarget() end)
    arrow:SetScript("OnEnter", function(self) GameTooltip:SetOwner(self, "ANCHOR_BOTTOM"); GameTooltip:SetText(L("arrowTip")); GameTooltip:Show() end)
    arrow:SetScript("OnLeave", function() GameTooltip:Hide() end)
    arrow.tex = arrow:CreateTexture(nil, "ARTWORK"); arrow.tex:SetSize(42, 42); arrow.tex:SetPoint("TOP", 0, 0)
    arrow.tex:SetTexture("Interface\\Minimap\\MinimapArrow")
    arrow.text = arrow:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall"); arrow.text:SetPoint("TOP", arrow.tex, "BOTTOM", 0, -2); Font(arrow.text, 11)
    arrow.label = arrow:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall"); arrow.label:SetPoint("TOP", arrow.text, "BOTTOM", 0, -1); Font(arrow.label, 11)
    arrow.t = 0
    arrow:SetScript("OnUpdate", function(self, elapsed)
        self.t = self.t + elapsed
        if self.t < 0.05 then return end
        self.t = 0
        X.UpdateArrow()
    end)
end

function X.UpdateArrow()
    if not arrow then return end
    local tg = target
    if not tg and C_Map and C_Map.HasUserWaypoint and Safe(C_Map.HasUserWaypoint) then      -- follow the game's own map pin too
        local p = Safe(C_Map.GetUserWaypoint)
        if p and p.position then
            tg = { map = p.uiMapID, x = p.position.x * 100, y = p.position.y * 100 }
            tg.cont, tg.wx, tg.wy = WorldPos(tg.map, tg.x, tg.y)
        end
    end
    local py, px, inst
    -- UnitPosition's 1st value is the same axis as GetWorldPosFromMapPos's .x (north), the 2nd matches .y (west).
    -- Pairing them the other way gave "5228 yd" for a target a few steps away (in game 2026-11-10).
    if UnitPosition then local a, b, _, i = Safe(UnitPosition, "player"); px, py, inst = a, b, i end
    if not tg or not tg.wx or not px then arrow:Hide(); return end
    if tg.cont and inst and tg.cont ~= inst then arrow:Hide(); return end
    local dist, rel = X.Bearing(px, py, tg.wx, tg.wy, GetPlayerFacing and Safe(GetPlayerFacing) or 0)
    arrow.tex:SetRotation(rel)
    if dist < 6 then
        arrow.text:SetText(GOLD .. L("arrived") .. RESET)
        arrivedAt = arrivedAt or (GetTime and GetTime() or 0)
        if GetTime and GetTime() - arrivedAt > 4 then X.ClearTarget() end
    else
        arrivedAt = nil
        arrow.text:SetText(string.format("%d yd", math.floor(dist + 0.5)))
    end
    arrow.label:SetText(tg.label or "")
end

---------------------------------------------------------------- recommended addons
X.RECOMMENDED = {
    { name = "Questie", folder = "Questie", url = "https://www.curseforge.com/wow/addons/questie" },
    { name = "Auctionator", folder = "Auctionator", url = "https://www.curseforge.com/wow/addons/auctionator" },
    { name = "TomTom", folder = "TomTom", url = "https://www.curseforge.com/wow/addons/tomtom" },
    { name = "Details", folder = "Details", url = "https://www.curseforge.com/wow/addons/details" },
}
local function Loaded(folder)
    if C_AddOns and C_AddOns.IsAddOnLoaded then return Safe(C_AddOns.IsAddOnLoaded, folder) end
    return IsAddOnLoaded and Safe(IsAddOnLoaded, folder)
end
function X.AddonStatus()
    local out = {}
    for _, a in ipairs(X.RECOMMENDED) do out[#out + 1] = { name = a.name, url = a.url, loaded = Loaded(a.folder) and true or false, note = L("addons")[a.name] } end
    return out
end

local addonsWin
function X.ShowAddons()
    if addonsWin then addonsWin:SetShown(not addonsWin:IsShown()); X.RefreshAddons(); return end
    local f = CreateFrame("Frame", "LamboGuideAddonsFrame", UIParent, "BasicFrameTemplateWithInset")
    addonsWin = f
    f:SetSize(380, 74 + #X.RECOMMENDED * 62); f:SetPoint("CENTER"); f:SetFrameStrata("DIALOG")
    f:SetMovable(true); f:EnableMouse(true); f:RegisterForDrag("LeftButton"); f:SetScript("OnDragStart", f.StartMoving); f:SetScript("OnDragStop", f.StopMovingOrSizing)
    if type(f.TitleText) == "table" then Font(f.TitleText, 13); f.TitleText:SetText(L("addonsTitle")) end
    if UISpecialFrames then table.insert(UISpecialFrames, "LamboGuideAddonsFrame") end
    f.rows = {}
    for i, a in ipairs(X.RECOMMENDED) do
        local name = f:CreateFontString(nil, "OVERLAY", "GameFontNormal"); name:SetPoint("TOPLEFT", 14, -32 - (i - 1) * 62); name:SetJustifyH("LEFT"); Font(name, 13)
        local note = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall"); note:SetPoint("TOPLEFT", name, "BOTTOMLEFT", 0, -2); note:SetWidth(350); note:SetJustifyH("LEFT"); Font(note, 11)
        local box = CreateFrame("EditBox", nil, f, "InputBoxTemplate"); box:SetSize(340, 18); box:SetPoint("TOPLEFT", note, "BOTTOMLEFT", 4, -3); box:SetAutoFocus(false)
        box:SetText(a.url)
        box:SetScript("OnTextChanged", function(self) if self:GetText() ~= a.url then self:SetText(a.url); self:HighlightText() end end)
        box:SetScript("OnEditFocusGained", function(self) self:HighlightText() end)
        box:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
        f.rows[i] = { name = name, note = note }
    end
    f.hint = f:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall"); f.hint:SetPoint("BOTTOMLEFT", 14, 12); Font(f.hint, 11)
    X.RefreshAddons()
    f:Show()
end
function X.RefreshAddons()
    if not addonsWin then return end
    for i, st in ipairs(X.AddonStatus()) do
        local r = addonsWin.rows[i]
        r.name:SetText(st.name .. "  " .. (st.loaded and ("|cff4ddb5a" .. L("installed")) or ("|cffff7070" .. L("notInstalled"))) .. RESET)
        r.note:SetText(st.note or "")
    end
    addonsWin.hint:SetText(L("copyHint"))
end

---------------------------------------------------------------- notes and reminders
local function Note(text, askKey, askLabel)
    local core = LamboGuideCore
    if core and core.AddNote then core.AddNote(text, askKey, askLabel) elseif print then print(GOLD .. "LamboGuide: " .. RESET .. text) end
end
X.Note = Note

local warned = {}
local function Once(key, gap)
    local now = GetTime and GetTime() or 0
    if warned[key] and now - warned[key] < (gap or 600) then return false end
    warned[key] = now
    return true
end

function X.CheckDurability()
    if not GetInventoryItemDurability then return end
    local low
    for slot = 1, 18 do
        local cur, max = Safe(GetInventoryItemDurability, slot)
        if cur and max and max > 0 then
            local pct = cur / max * 100
            if not low or pct < low then low = pct end
        end
    end
    if low and low < 25 and Once("repair", 900) then Note(string.format(L("repair"), math.floor(low))) end
end

function X.CheckBags()
    local rec = X.ScanBags()
    if rec and rec.slots and rec.slots > 0 and rec.free <= 2 and Once("bags", 600) then Note(string.format(L("bagsFull"), rec.free)) end
end

function X.OnLevelUp(level)
    Note(string.format(L("levelUp"), tonumber(level) or 0), "levelup", L("levelAsk"))
    local pts = UnitCharacterPoints and Safe(UnitCharacterPoints, "player")
    if pts and pts > 0 then Note(string.format(L("talent"), pts)) end
end

local lastInstance
function X.CheckInstance()
    if not (IsInInstance and GetInstanceInfo) then return end
    local inside, kind = IsInInstance()
    if not inside or (kind ~= "party" and kind ~= "raid") then lastInstance = nil; return end
    local name = GetInstanceInfo()
    if name and name ~= lastInstance then
        lastInstance = name
        Note(string.format(L("dungeon"), name), "dungeon:" .. name, L("dungeonAsk"))
    end
end

---------------------------------------------------------------- events
local ev = CreateFrame and CreateFrame("Frame")
if ev and ev.RegisterEvent then
    for _, e in ipairs({ "PLAYER_LOGIN", "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "PLAYER_MONEY", "BAG_UPDATE_DELAYED", "BANKFRAME_OPENED",
        "PLAYERBANKSLOTS_CHANGED", "UPDATE_INVENTORY_DURABILITY", "PLAYER_ENTERING_WORLD", "ZONE_CHANGED_NEW_AREA", "AUCTION_ITEM_LIST_UPDATE",
        "COMMODITY_SEARCH_RESULTS_UPDATED", "ITEM_SEARCH_RESULTS_UPDATED" }) do
        pcall(ev.RegisterEvent, ev, e)
    end
    ev:SetScript("OnEvent", function(_, event, a1)
        if not LamboGuideDB then return end
        local ok, err = pcall(function()
            if event == "PLAYER_LOGIN" then
                X.StartSession(); X.ScanBags(); X.HookTooltips()
            elseif event == "PLAYER_XP_UPDATE" then X.OnXP()
            elseif event == "PLAYER_LEVEL_UP" then X.OnXP(); X.OnLevelUp(a1)
            elseif event == "PLAYER_MONEY" then local r = Store(); r.money = GetMoney()
            elseif event == "BAG_UPDATE_DELAYED" then X.CheckBags()
            elseif event == "BANKFRAME_OPENED" or event == "PLAYERBANKSLOTS_CHANGED" then X.ScanBank()
            elseif event == "UPDATE_INVENTORY_DURABILITY" then X.CheckDurability()
            elseif event == "PLAYER_ENTERING_WORLD" or event == "ZONE_CHANGED_NEW_AREA" then X.CheckInstance()
            elseif event == "AUCTION_ITEM_LIST_UPDATE" then X.ScanAuctionPage()
            elseif event == "COMMODITY_SEARCH_RESULTS_UPDATED" then X.ScanCommodity(a1)
            elseif event == "ITEM_SEARCH_RESULTS_UPDATED" then X.ScanItemKey(a1)
            end
        end)
        if not ok and LamboGuideDB.debug and print then print("LamboGuide extras: " .. tostring(err)) end
    end)
end
