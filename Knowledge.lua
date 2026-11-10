-- LamboGuide knowledge helpers (read-only).
-- * Quest locations: if the player has QuestieDB (Forever) installed, read turn-in NPCs and
--   objective spawns through its public LibQuestieDB API. We ship none of its data or code.
-- * Map waypoints: the game's own C_Map user waypoint (plus TomTom when it is installed).
-- * Item details: the text lines of a hidden tooltip, so the AI sees real in-game stats.

LamboGuideKnowledge = LamboGuideKnowledge or {}
local K = LamboGuideKnowledge

local function Pass(ok, ...) if ok then return ... end end
local function Safe(fn, ...)
    if type(fn) ~= "function" then return nil end
    return Pass(pcall(fn, ...))                 -- keeps every return value (some APIs return 17)
end

local function Q() local db = rawget(_G, "LibQuestieDB"); if type(db) == "table" and db.Quest and db.Npc then return db end end
function K.HasQuestie() return Q() ~= nil end

---------------------------------------------------------------- area id -> ui map id
local nameToMap
local function BuildNameIndex()
    nameToMap = {}
    if not (C_Map and C_Map.GetMapChildrenInfo) then return end
    for _, root in ipairs({ 947, 1414, 1415, 12, 13 }) do               -- Azeroth, Kalimdor, Eastern Kingdoms (modern and old ids)
        local list = Safe(C_Map.GetMapChildrenInfo, root, nil, true)
        if type(list) == "table" then
            for _, m in ipairs(list) do if m.name and m.mapID and not nameToMap[m.name] then nameToMap[m.name] = m.mapID end end
        end
    end
end

local mapCache = {}
function K.MapForArea(areaId)
    if not areaId then return nil end
    if mapCache[areaId] ~= nil then return mapCache[areaId] or nil end
    local id
    local loader = rawget(_G, "QuestieLoader")
    if loader and loader.ImportModule then
        local zdb = Safe(loader.ImportModule, loader, "ZoneDB")
        if zdb and zdb.GetUiMapIdByAreaId then id = Safe(zdb.GetUiMapIdByAreaId, zdb, areaId) end
    end
    if not id and C_Map and C_Map.GetAreaInfo then
        local name = Safe(C_Map.GetAreaInfo, areaId)
        if name then
            if not nameToMap then BuildNameIndex() end
            id = nameToMap[name]
        end
    end
    mapCache[areaId] = id or false
    return id
end

local function MapName(mapId)
    local info = mapId and C_Map and C_Map.GetMapInfo and Safe(C_Map.GetMapInfo, mapId)
    return info and info.name or nil
end

local function PlayerPos()
    if not (C_Map and C_Map.GetBestMapForUnit) then return end
    local map = Safe(C_Map.GetBestMapForUnit, "player")
    local pos = map and C_Map.GetPlayerMapPosition and Safe(C_Map.GetPlayerMapPosition, map, "player")
    if pos and pos.GetXY then local x, y = pos:GetXY(); return map, (x or 0) * 100, (y or 0) * 100 end
    return map
end

-- Best spawn: on the player's current map the closest one, otherwise the first known one.
local function BestSpawn(spawns, pMap, px, py)
    if type(spawns) ~= "table" then return end
    local best, bestD, first
    for area, points in pairs(spawns) do
        local map = K.MapForArea(area)
        if map and type(points) == "table" then
            for _, p in ipairs(points) do
                local x, y = tonumber(p[1]), tonumber(p[2])
                if x and y and x >= 0 and y >= 0 then
                    first = first or { map = map, x = x, y = y }
                    if map == pMap and px then
                        local d = (x - px) ^ 2 + (y - py) ^ 2
                        if not bestD or d < bestD then best, bestD = { map = map, x = x, y = y }, d end
                    end
                end
            end
        end
    end
    return best or first
end

local function Place(npcId, pMap, px, py)
    local db = Q()
    local name = Safe(db.Npc.name, npcId)
    local s = BestSpawn(Safe(db.Npc.spawns, npcId), pMap, px, py)
    if not name then return nil end
    if not s then return name end
    return string.format("%s @ %s %.1f,%.1f {map=%d}", name, MapName(s.map) or "?", s.x, s.y, s.map)
end

local function ActiveQuestIds()
    local ids = {}
    if C_QuestLog and C_QuestLog.GetNumQuestLogEntries and C_QuestLog.GetInfo then
        for i = 1, (Safe(C_QuestLog.GetNumQuestLogEntries) or 0) do
            local info = Safe(C_QuestLog.GetInfo, i)
            if info and not info.isHeader and info.questID then ids[#ids + 1] = { id = info.questID, done = info.isComplete } end
        end
    elseif GetNumQuestLogEntries and GetQuestLogTitle then
        for i = 1, (Safe(GetNumQuestLogEntries) or 0) do
            local title, _, _, header, _, complete, _, questId = Safe(GetQuestLogTitle, i)
            if title and not header and questId then ids[#ids + 1] = { id = questId, done = complete and complete ~= 0 } end
        end
    end
    return ids
end

-- One compact line per active quest: where to turn it in and where its targets are.
function K.QuestLocations(maxQuests)
    local db = Q()
    if not db then return nil end
    local pMap, px, py = PlayerPos()
    local lines = {}
    for _, q in ipairs(ActiveQuestIds()) do
        if #lines >= (maxQuests or 12) then break end
        local name = Safe(db.Quest.name, q.id) or ("Quest " .. q.id)
        local parts = {}
        local finished = Safe(db.Quest.finishedBy, q.id)
        local turnIn = finished and finished[1] and finished[1][1]
        if turnIn then parts[#parts + 1] = "turn in: " .. (Place(turnIn, pMap, px, py) or ("NPC " .. turnIn)) end
        if not q.done then
            local obj = Safe(db.Quest.objectives, q.id)
            local creatures = obj and obj[1]
            if type(creatures) == "table" then
                for i = 1, math.min(2, #creatures) do
                    local c = creatures[i]
                    local where = c and c[1] and Place(c[1], pMap, px, py)
                    if where then parts[#parts + 1] = "target: " .. where end
                end
            end
        end
        if #parts > 0 then lines[#lines + 1] = name .. " [" .. q.id .. "] " .. table.concat(parts, "; ") end
    end
    return #lines > 0 and table.concat(lines, "\n") or nil
end

---------------------------------------------------------------- waypoints
function K.SetWaypoint(mapId, x, y, label)
    mapId, x, y = tonumber(mapId), tonumber(x), tonumber(y)
    if not (mapId and x and y) then return false end
    local ok = false
    if C_Map and C_Map.SetUserWaypoint and UiMapPoint and UiMapPoint.CreateFromCoordinates then
        local allowed = not C_Map.CanSetUserWaypointOnMap or Safe(C_Map.CanSetUserWaypointOnMap, mapId)
        if allowed then
            local point = Safe(UiMapPoint.CreateFromCoordinates, mapId, x / 100, y / 100)
            if point then
                ok = pcall(C_Map.SetUserWaypoint, point)
                if ok and C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then pcall(C_SuperTrack.SetSuperTrackedUserWaypoint, true) end
            end
        end
    end
    local tt = rawget(_G, "TomTom")
    if tt and tt.AddWaypoint then
        if pcall(tt.AddWaypoint, tt, mapId, x / 100, y / 100, { title = label or "LamboGuide", from = "LamboGuide" }) then ok = true end
    end
    return ok
end

---------------------------------------------------------------- item / tooltip details
local scan
function K.TooltipLines(tip, maxLines)
    if not tip or not tip.GetName or not tip.NumLines then return nil end
    local name = tip:GetName()
    local out = {}
    for i = 1, math.min(tip:NumLines() or 0, maxLines or 18) do
        local left = name and rawget(_G, name .. "TextLeft" .. i)
        local right = name and rawget(_G, name .. "TextRight" .. i)
        local l = left and left.GetText and left:GetText()
        local r = right and right.IsShown and right:IsShown() and right.GetText and right:GetText()
        if l and l ~= "" then out[#out + 1] = (r and r ~= "") and (l .. " " .. r) or l end
    end
    return #out > 0 and table.concat(out, " | ") or nil
end

function K.LinkDetails(link)
    if not link or not CreateFrame then return nil end
    if not scan then
        scan = CreateFrame("GameTooltip", "LamboGuideScanTooltip", UIParent, "GameTooltipTemplate")
        if scan and scan.SetOwner then scan:SetOwner(WorldFrame or UIParent, "ANCHOR_NONE") end
    end
    if not scan or not scan.SetHyperlink then return nil end
    scan:ClearLines()
    if not pcall(scan.SetHyperlink, scan, link) then return nil end
    return K.TooltipLines(scan)
end

-- What the mouse is over right now (an item, spell or unit in GameTooltip).
function K.Hovered()
    local tip = GameTooltip
    if not (tip and tip.IsShown and tip:IsShown()) then return nil end
    local text = K.TooltipLines(tip)
    if tip.GetItem then
        local name, link = tip:GetItem()
        if link then return { kind = "item", name = name, link = link, text = text } end
    end
    if tip.GetSpell then
        local name, id = tip:GetSpell()
        if name then return { kind = "spell", name = name, id = id, text = text } end
    end
    if tip.GetUnit then
        local name = tip:GetUnit()
        if name then return { kind = "unit", name = name, text = text } end
    end
    if text then return { kind = "other", name = text:match("^[^|]+"), text = text } end
end
