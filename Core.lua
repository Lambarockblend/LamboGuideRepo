-- LamboGuide - read-only character helper for WoW Forever, by Lambarock.
-- The addon only READS character data. Questions and answers travel to the local helper through the
-- addon-state mailbox (Mailbox.lua): no screen reading, no clipboard, no key presses.
local ADDON = "LamboGuide"
LamboGuideDB = LamboGuideDB or {}
local DB

local FONT = "Interface\\AddOns\\LamboGuide\\DejaVuSans.ttf"   -- has all Turkish letters
local FALLBACK_FONT = "Fonts\\FRIZQT__.TTF"

---------------------------------------------------------------- texts
local TEXT = {
    tr = {
        chats="Sohbetler", new="Yeni sohbet", chat="Sohbet", character="Karakter", quests="Görevler", professions="Meslekler",
        send="Gönder", close="Kapat", test="Bağlantı Testi", patch="Yama Notları", model="Model", thinking="Düşünme",
        low="Düşük", medium="Orta", high="Yüksek", deleteChat="Sohbeti sil", chatDefault="Sohbet",
        deleteConfirm="Bu sohbeti silmek istiyor musun? Emin misin?", yes="Evet", no="Hayır", copyUrl="Bağlantıyı kopyala (Ctrl+C), sonra tarayıcına yapıştır:", close="Kapat",
        welcome="Karakterini, görevlerini veya çantandaki bir eşyayı sor. Bir eşyayı sormak için soru kutusuna tıkla ve eşyaya Shift+tıkla. Cevap hazır olunca kendiliğinden gelir.",
        settings="Ayarlar", popout="Sohbeti ayrı pencerede aç", language="Dil", poppedNote="Sohbet ayrı pencerede.", dock="Sohbeti geri getir", new_="Yeni sohbet",
        placeholder="Sorunu yaz ve Enter'a bas...", sending="Soru yardımcıya iletiliyor...",
        sentWait="Soru gönderildi. Cevap hazır olunca kendiliğinden gelir.", thinkingNow="Düşünüyor", helperOff="Soru iletilemedi: yardımcı program açık değil. Yardımcıyı aç (saatin yanındaki LG simgesi), sonra tekrar sor.", noLink="Yardımcı programa bağlanılamadı. LamboGuide kurulumunu çalıştır, yardımcı açıkken oyunu bir kez tamamen kapatıp aç.",
        replyOk="Cevap alındı.", busy="Önceki soru hâlâ iletiliyor, bekle.",
        hint="Yardımcı uygulama açık olmalı (saatin yanındaki LG simgesi).",
        status_idle="Hazır", status_tx="İletiliyor", status_wait="Cevap bekleniyor", status_ok="Cevap alındı", status_link="Yardımcı bağlı", status_nolink="Yardımcı bağlı değil", onMap="Haritada", inventory="Envanter", addonsRow="Önerilen addonlar", askLevelUp="Yeni seviyemde eğitmenden ne öğrenmeliyim, yetenek puanımı nereye vermeliyim ve sıradaki hedefim ne olmalı?", askDungeon="%s için kısa rehber: bosslar ve dikkat edilecekler, zindanın görevleri, karakterime uygun önemli ganimetler.", wpSet="Haritaya işaret kondu (M ile bak), ok yolu gösteriyor.", wpFail="Bu yere işaret konamadı.", hoverKey="Fare altını ekle", none="Yok", pressKey="Bir tuşa bas (Esc: kaldır)", keyTaken="Bu tuş oyunda zaten kullanılıyor (%s). Alt veya Ctrl ile birlikte bas, örnek: Alt+Q.", tagged="Sohbet kutusuna eklendi, sorunu yazıp gönder.", questDescBtn="Görev açıklamalarını getir", questDescWait="Açıklamalar bekleniyor…", questDescAsk="Aşağıdaki satırların her biri bir WoW görevi (numara|ad|hedef|oyun metni). Her görev için ne yapılacağını anlatan tek kısa Türkçe cümle yaz (en çok 14 kelime). Cevapta yalnızca görev başına bir satır olsun, şu biçimde: numara|cümle. Başka hiçbir şey yazma.", questDescFail="Açıklamalar okunamadı, tekrar dene.", hoverNone="Fare bir eşyanın, büyünün veya birimin üstünde değil.", hoverAsk="Bu %s hakkında bilgi ver: karakterim için işe yarar mı, ne yapmalıyım?", hoverShow="Fare altı: %s", combatWait="Savaştan sonra tekrar dene.",
        patchQuery="WoW: Forever resmi yama ve hotfix notlarını web'de ara. En yeni önce olacak şekilde tarih, başlık, değişiklik özeti ve kaynak bağlantılarını listele. Retail ve Classic Era ile karıştırma.",
        patchShow="Son yama notları", pingShow="Bağlantı testi",
        charTitle="KARAKTER", gear="GİYİLİ EŞYALAR", bags="ÇANTA", activeQuests="AKTİF GÖREVLER",
        noQuests="Aktif görev yok veya görev bilgisi okunamadı.", noBags="Çantada okunabilir eşya yok.", noGear="Giyili eşya bilgisi alınamadı.",
        noJobs="Meslek bulunamadı.", location="Bölge", coords="Koordinat", race="Irk", class="Sınıf", faction="Taraf", level="Seviye", money="Para", xp="Deneyim",
        launcher="LamboGuide aç/kapat · Lambarock", ready="LamboGuide (Lambarock) hazır. Sağ alttaki LG düğmesi veya /lg ile açılır.",
        asciiOn="Ğ→G", asciiOff="Ğ Ü Ş",
    },
    en = {
        chats="Chats", new="New Chat", chat="Chat", character="Character", quests="Quests", professions="Professions",
        send="Send", close="Close", test="Link Test", patch="Patch Notes", model="Model", thinking="Reasoning",
        low="Low", medium="Medium", high="High", deleteChat="Delete chat", chatDefault="Chat",
        deleteConfirm="Do you want to delete this chat? Are you sure?", yes="Yes", no="No", copyUrl="Copy the link (Ctrl+C), then paste it in your browser:", close="Close",
        welcome="Ask about your character, quests or an item in your bags. To ask about an item, click the input box and Shift+click the item. The answer arrives by itself when ready.",
        settings="Settings", popout="Open chat in its own window", language="Language", poppedNote="Chat is in its own window.", dock="Bring chat back", new_="New chat",
        placeholder="Type your question and press Enter...", sending="Sending question to the helper...",
        sentWait="Question sent. The answer arrives by itself when ready.", thinkingNow="Thinking", helperOff="The question could not be sent: the helper app is not running. Start it (LG icon next to the clock), then ask again.", noLink="No link to the helper app. Run the LamboGuide installer, then fully restart the game once while the helper is running.",
        replyOk="Answer received.", busy="The previous question is still being sent, please wait.",
        hint="The helper app must be running (LG icon next to the clock).",
        status_idle="Ready", status_tx="Sending", status_wait="Waiting for answer", status_ok="Answer received", status_link="Helper connected", status_nolink="Helper not connected", onMap="On map", inventory="Inventory", addonsRow="Recommended addons", askLevelUp="At my new level, what should I learn from the trainer, where should my talent points go and what should I do next?", askDungeon="Short guide for %s: bosses and what to watch for, the dungeon quests, and important loot for my character.", wpSet="Map marker set (press M), the arrow shows the way.", wpFail="Could not mark this place.", hoverKey="Tag hovered", none="None", pressKey="Press a key (Esc: remove)", keyTaken="That key is already used by the game (%s). Press it together with Alt or Ctrl, for example Alt+Q.", tagged="Added to the chat box, type your question and send.", questDescBtn="Get quest descriptions", questDescWait="Waiting for descriptions…", questDescAsk="Each line below is a WoW quest (number|name|objective|game text). For each quest write one short sentence about what to do (14 words at most). Answer with exactly one line per quest in the form: number|sentence. Write nothing else.", questDescFail="Could not read the descriptions, try again.", hoverNone="The mouse is not over an item, spell or unit.", hoverAsk="Tell me about this %s: is it useful for my character, what should I do?", hoverShow="Hovered: %s", combatWait="Try again after combat.",
        patchQuery="Search the web for official WoW: Forever patch and hotfix notes. List newest first with date, title, short change summary and source links. Do not mix in Retail or Classic Era.",
        patchShow="Latest patch notes", pingShow="Link test",
        charTitle="CHARACTER", gear="EQUIPPED ITEMS", bags="BAGS", activeQuests="ACTIVE QUESTS",
        noQuests="No active quests, or the quest API is unavailable.", noBags="No readable items in bags.", noGear="Could not read equipped items.",
        noJobs="No professions found.", location="Zone", coords="Coordinates", race="Race", class="Class", faction="Faction", level="Level", money="Money", xp="Experience",
        launcher="Toggle LamboGuide · by Lambarock", ready="LamboGuide by Lambarock is ready. Use the LG button at the bottom right or /lg.",
        asciiOn="Ğ→G", asciiOff="Ğ Ü Ş",
    },
}

local ASCII_MAP = {
    ["\195\167"]="c", ["\195\135"]="C", ["\196\159"]="g", ["\196\158"]="G", ["\196\177"]="i", ["\196\176"]="I",
    ["\195\182"]="o", ["\195\150"]="O", ["\197\159"]="s", ["\197\158"]="S", ["\195\188"]="u", ["\195\156"]="U",
}
local function ToASCII(s)
    s = tostring(s or "")
    for from, to in pairs(ASCII_MAP) do s = s:gsub(from, to) end
    return s
end
local function Disp(s)                       -- text as shown inside addon widgets
    if DB and DB.ascii then return ToASCII(s) end
    return tostring(s or "")
end
local function T(key)
    local lang = (DB and DB.language == "en") and "en" or "tr"
    return (TEXT[lang] and TEXT[lang][key]) or TEXT.tr[key] or key
end
local function Tx(key) return Disp(T(key)) end

---------------------------------------------------------------- small helpers
local C = { gold="|cffffd36a", cyan="|cff72d9e8", muted="|cffb9b0a0", green="|cff7fe27c", red="|cffff7777", link="|cff5aa9ff", reset="|r" }
-- "auto": the helper passes no model, so Codex uses the one the player's ChatGPT plan allows. A fixed model that the
-- plan does not include is refused by Codex ("not supported when using Codex with a ChatGPT account", in game 2026-11-11).
local MODEL_IDS = {"auto", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna"}
local MODEL_LABELS = { ["auto"]="Auto", ["gpt-6.1-sol"]="GPT-6.1 Sol", ["gpt-6.1-terra"]="GPT-6.1 Terra", ["gpt-6-luna"]="GPT-6 Luna" }
local EFFORTS = {"low", "medium", "high"}

local function Size(f, w, h)
    if f.SetSize then f:SetSize(w, h) else f:SetWidth(w); f:SetHeight(h) end
end
local function Shown(f, on) if on then f:Show() else f:Hide() end end
local function Color(tex, r, g, b, a)
    if tex.SetColorTexture then tex:SetColorTexture(r, g, b, a or 1) else tex:SetTexture(r, g, b, a or 1) end
end
local function PassOk(ok, ...) if ok then return ... end end
local function SafeCall(fn, ...)
    if type(fn) ~= "function" then return nil end
    return PassOk(pcall(fn, ...))
end
local function Clean(s)
    local t = tostring(s or "")
    t = t:gsub("|H.-|h(.-)|h", "%1")                       -- item/spell links -> their [Name]
    t = t:gsub("|c%x%x%x%x%x%x%x%x", ""); t = t:gsub("|cn[^:|]*:", ""); t = t:gsub("|r", "")   -- |cnIQ1: = quality color (Forever)
    t = t:gsub("|T.-|t", ""); t = t:gsub("|A.-|a", "")
    return t
end
local function Utf8Prefix(s, maxBytes)
    if #s <= maxBytes then return s end
    local cut = maxBytes
    while cut > 0 do
        local b = string.byte(s, cut + 1)           -- first byte that would be dropped
        if not b or b < 128 or b >= 192 then break end
        cut = cut - 1
    end
    return s:sub(1, cut)
end
local function SetFontSafe(obj, size)
    if not obj or not obj.SetFont then return end
    local path = (DB and DB.ascii) and FALLBACK_FONT or FONT
    local ok = pcall(obj.SetFont, obj, path, size or 13, "")
    if not ok and path ~= FALLBACK_FONT then pcall(obj.SetFont, obj, FALLBACK_FONT, size or 13, "") end
end
local function StyleButton(b, size)
    local fs = b.GetFontString and b:GetFontString()
    if fs then SetFontSafe(fs, size or 12) end
end

---------------------------------------------------------------- game data readers (read-only)
local function Location()
    local zone = (GetRealZoneText and GetRealZoneText()) or (GetZoneText and GetZoneText()) or "Unknown"
    local subzone = (GetSubZoneText and GetSubZoneText()) or ""
    local x, y, mapID
    if C_Map and C_Map.GetBestMapForUnit and C_Map.GetPlayerMapPosition then
        mapID = SafeCall(C_Map.GetBestMapForUnit, "player")
        local pos = mapID and SafeCall(C_Map.GetPlayerMapPosition, mapID, "player")
        if pos then
            if pos.GetXY then x, y = SafeCall(pos.GetXY, pos) else x, y = pos.x, pos.y end
        end
    end
    if (not x or not y) and GetPlayerMapPosition then
        if SetMapToCurrentZone then SafeCall(SetMapToCurrentZone) end
        x, y = SafeCall(GetPlayerMapPosition, "player")
    end
    local coords = "?"
    if x and y and (x ~= 0 or y ~= 0) then coords = string.format("%.1f, %.1f", x * 100, y * 100) end
    return zone, subzone, coords, tonumber(mapID)
end

local function ItemName(link)
    if not link then return nil end
    local name, itemLevel, requiredLevel
    if GetItemInfo then
        local _, _, _, il, rl
        name, _, _, il, rl = SafeCall(GetItemInfo, link)
        itemLevel, requiredLevel = il, rl
    end
    name = name and Clean(name) or Clean(link):match("%[(.-)%]") or Clean(link)
    local itemID = tostring(link):match("item:(%d+)")
    local d = {}
    if itemID then d[#d + 1] = "id " .. itemID end
    if tonumber(itemLevel) and itemLevel > 0 then d[#d + 1] = "ilvl " .. itemLevel end
    if tonumber(requiredLevel) and requiredLevel > 0 then d[#d + 1] = "req " .. requiredLevel end
    if #d > 0 then name = name .. " (" .. table.concat(d, ", ") .. ")" end
    return name
end

local function Equipment()
    local slots = {{1,"Head"},{2,"Neck"},{3,"Shoulders"},{5,"Chest"},{6,"Waist"},{7,"Legs"},{8,"Feet"},{9,"Wrist"},{10,"Hands"},{15,"Back"},{16,"Main hand"},{17,"Off hand"},{18,"Ranged"}}
    local out = {}
    for _, s in ipairs(slots) do
        local link = GetInventoryItemLink and SafeCall(GetInventoryItemLink, "player", s[1])
        if link then out[#out + 1] = s[2] .. ": " .. ItemName(link) end
    end
    return out
end

local function Bags()
    local out, used, total = {}, 0, 0
    for bag = 0, (NUM_BAG_SLOTS or 4) do
        local n = (C_Container and C_Container.GetContainerNumSlots and SafeCall(C_Container.GetContainerNumSlots, bag))
            or (GetContainerNumSlots and SafeCall(GetContainerNumSlots, bag)) or 0
        n = tonumber(n) or 0; total = total + n
        for slot = 1, n do
            local link, count
            if C_Container and C_Container.GetContainerItemInfo then
                local info = SafeCall(C_Container.GetContainerItemInfo, bag, slot)
                if info then link, count = info.hyperlink, info.stackCount end
            elseif GetContainerItemLink then
                link = SafeCall(GetContainerItemLink, bag, slot)
                if link and GetContainerItemInfo then local _, c = SafeCall(GetContainerItemInfo, bag, slot); count = c end
            end
            if link then used = used + 1; out[#out + 1] = ItemName(link) .. " x" .. tostring(count or 1) end
        end
    end
    return out, used, total
end

local function FirstSentence(t, max)
    t = Clean(t or ""):gsub("%s+", " "):gsub("^ ", ""):gsub(" $", "")
    local first = t:match("^(.-[%.!%?])%s") or t
    if #first > max then first = Utf8Prefix(first, max - 2) .. ".." end
    return first
end
-- Active quests as { title, row, objective, game }: row = the list line, game = the game's own short text (client language)
local function QuestEntries(withText)
    local out = {}
    if C_QuestLog and C_QuestLog.GetNumQuestLogEntries and C_QuestLog.GetInfo then
        local count = SafeCall(C_QuestLog.GetNumQuestLogEntries) or 0
        for i = 1, count do
            local info = SafeCall(C_QuestLog.GetInfo, i)
            if info and not info.isHeader and info.questID then
                local title = Clean(info.title or ("Quest " .. info.questID))
                local row = (info.isComplete and "[DONE] " or "") .. title
                local objs = C_QuestLog.GetQuestObjectives and SafeCall(C_QuestLog.GetQuestObjectives, info.questID)
                local objective = ""
                if type(objs) == "table" then
                    local p = {}
                    for _, o in ipairs(objs) do
                        local s2 = Clean(o.text or "")
                        if s2 ~= "" then p[#p + 1] = s2 end
                    end
                    if #p > 0 then objective = table.concat(p, "; "); row = row .. " (" .. objective .. ")" end
                end
                local game = ""
                if withText and GetQuestLogQuestText then
                    local desc, obj = SafeCall(GetQuestLogQuestText, info.questLogIndex or i)
                    game = FirstSentence((obj and obj ~= "" and obj) or desc or "", 110)
                end
                out[#out + 1] = { title = title, row = row, objective = objective, game = game }
            end
        end
    elseif GetNumQuestLogEntries and GetQuestLogTitle then
        local count = SafeCall(GetNumQuestLogEntries) or 0
        local selected = GetQuestLogSelection and SafeCall(GetQuestLogSelection)
        for i = 1, count do
            local title, level, _, header, _, complete = SafeCall(GetQuestLogTitle, i)
            if title and not header then
                local clean = Clean(title)
                local row = (complete and (complete > 0 or complete == 1) and "[DONE] " or "") .. (level and ("[" .. level .. "] ") or "") .. clean
                local objective, game = "", ""
                if SelectQuestLogEntry and GetNumQuestLeaderBoards and GetQuestLogLeaderBoard then
                    SafeCall(SelectQuestLogEntry, i)
                    local p = {}
                    for j = 1, (SafeCall(GetNumQuestLeaderBoards) or 0) do
                        local text = SafeCall(GetQuestLogLeaderBoard, j)
                        if text then p[#p + 1] = Clean(text) end
                    end
                    if #p > 0 then objective = table.concat(p, "; "); row = row .. " (" .. objective .. ")" end
                    if withText and GetQuestLogQuestText then
                        local desc, obj = SafeCall(GetQuestLogQuestText)
                        game = FirstSentence((obj and obj ~= "" and obj) or desc or "", 110)
                    end
                end
                out[#out + 1] = { title = clean, row = row, objective = objective, game = game }
            end
        end
        if selected and SelectQuestLogEntry then SafeCall(SelectQuestLogEntry, selected) end
    end
    return out
end
local function Quests()
    local rows = {}
    for _, e in ipairs(QuestEntries(false)) do rows[#rows + 1] = e.row end
    return rows
end

local function ProfessionNames()
    local out = {}
    if GetProfessions and GetProfessionInfo then
        for _, id in ipairs({ SafeCall(GetProfessions) }) do
            if id then
                local name, _, level, max = SafeCall(GetProfessionInfo, id)
                if name then out[#out + 1] = Clean(name) .. " " .. tostring(level or 0) .. "/" .. tostring(max or 0) end
            end
        end
    elseif GetNumSkillLines and GetSkillLineInfo then
        for i = 1, (SafeCall(GetNumSkillLines) or 0) do
            local name, header, _, rank, _, _, maxRank = SafeCall(GetSkillLineInfo, i)
            if name and not header and maxRank and maxRank > 1 then out[#out + 1] = Clean(name) .. " " .. tostring(rank or 0) .. "/" .. tostring(maxRank) end
        end
    end
    return out
end

local function Character()
    local zone, subzone, coords, mapID = Location()
    local bags, used, total = Bags()
    return {
        name = Clean(UnitName and UnitName("player") or "Player"), race = Clean(UnitRace and UnitRace("player") or "?"),
        class = Clean(UnitClass and UnitClass("player") or "?"), level = UnitLevel and UnitLevel("player") or "?",
        faction = UnitFactionGroup and UnitFactionGroup("player") or "?", zone = Clean(zone), subzone = Clean(subzone), coords = coords, mapID = mapID,
        xp = UnitXP and UnitXP("player"), xpMax = UnitXPMax and UnitXPMax("player"), money = GetMoney and GetMoney() or 0,
        gear = Equipment(), bags = bags, bagUsed = used, bagTotal = total, quests = Quests(), professions = ProfessionNames(),
    }
end

local KN = LamboGuideKnowledge
local function QuestLocationText()
    local text = KN and KN.QuestLocations and SafeCall(KN.QuestLocations, 10)
    if not text then return "" end
    return "\nQuest locations from QuestieDB (map ids for markers)=\n" .. text
end

local function ExtrasText()
    local XT = LamboGuideExtras
    local text = XT and XT.Context and SafeCall(XT.Context)
    return (text and text ~= "") and ("\n" .. text) or ""
end

local function CompactContext()
    local p = Character()
    return string.format("WoW Forever live character data (read-only):\nName=%s; Race=%s; Class=%s; Level=%s; Faction=%s; Zone=%s%s {map=%s}; Coordinates=%s; XP=%s/%s; MoneyCopper=%s\nEquipped=%s\nActive quests=%s\nProfessions=%s\nBags (%s/%s slots)=%s",
        p.name, p.race, p.class, tostring(p.level), p.faction, p.zone, p.subzone ~= "" and (" / " .. p.subzone) or "", tostring(p.mapID or "?"), p.coords,
        tostring(p.xp or "?"), tostring(p.xpMax or "?"), tostring(p.money), table.concat(p.gear, "; "), table.concat(p.quests, "; "),
        table.concat(p.professions, "; "), tostring(p.bagUsed), tostring(p.bagTotal), table.concat(p.bags, "; "))
        .. QuestLocationText() .. ExtrasText()
end

local MAX_BYTES = 3600

---------------------------------------------------------------- state / forward declarations
local frame, info, popFrame, mainArea, placeholder, chatPanel, chatScroll, chatContent, inputBox, statusText, statusDot
local histMenu, gearMenu, modelRow, thinkRow, langRow, hoverRow, launcher, popped
local CaptureHoverKey, AskPreset
local characterView, questsView, professionsView, chatListScroll, chatListContent, inventoryView, invSearch
local tabs, currentTab = {}, "character"
local widgets = {}                       -- localized widgets {w=, key=}
local sideRows, chatRows = {}, {}
local pendingMsg, pendingDelete = nil, nil
local txReq, txSince = nil, 0          -- question on its way to the helper (nil once the helper took it)
local DELIVER_TIMEOUT = 20             -- seconds; a running helper takes a question in 1-3 s
local MBX, useMailbox = LamboGuideMailbox, false
local RenderChat, RenderSidebar, SelectTab, RefreshLabels, SetStatus, RefreshInfo, CreateUI, CreateInfo, Dock, PopOut

local function ActiveChat()
    DB.chats = DB.chats or {}
    if #DB.chats == 0 then DB.chats[1] = { title = T("chatDefault"), messages = {} } end
    DB.currentChat = math.max(1, math.min(tonumber(DB.currentChat) or 1, #DB.chats))
    local chat = DB.chats[DB.currentChat]
    chat.messages = chat.messages or {}
    return chat
end

SetStatus = function(key, extra)
    if not statusText then return end
    statusText:SetText(C.muted .. Tx(key) .. (extra and (" " .. extra) or "") .. C.reset)
    if statusDot then
        if key == "status_idle" or key == "status_ok" then Color(statusDot, 0.30, 0.85, 0.35, 1)
        elseif key == "status_nolink" then Color(statusDot, 0.95, 0.30, 0.30, 1)
        else Color(statusDot, 1, 0.82, 0.25, 1) end
    end
end

---------------------------------------------------------------- sending
-- While a question is on its way or being answered, the last row shows "Düşünüyor" with dots that grow and
-- shrink (1 2 3 3 2 1), like a typing indicator. The stored text stays the plain wait text.
local thinkFS, thinkAt, thinkStep = nil, 0, 0
local THINK_DOTS = { 1, 2, 3, 3, 2, 1 }
local function IsWaitText(t)
    return t == TEXT.tr.sending or t == TEXT.tr.sentWait or t == TEXT.en.sending or t == TEXT.en.sentWait
end
local function ThinkingText()
    return Disp(C.gold .. T("thinkingNow") .. C.reset .. " " .. string.rep(".", THINK_DOTS[thinkStep % #THINK_DOTS + 1]))
end
local function ThinkingTick(now)
    if not thinkFS or (now - thinkAt) < 0.35 then return end
    thinkAt, thinkStep = now, thinkStep + 1
    thinkFS:SetText(ThinkingText())
end

local function SendHello()
    MBX.Send("H1 zip=" .. ((C_EncodingUtil and C_EncodingUtil.DecompressString) and "1" or "0"))
end

-- The helper did not take the question in time (not running): free the queue and say so, instead of
-- leaving "previous question is still being sent" forever (seen in game 2026-11-11).
local function DeliveryWatch(now)
    if not txReq or (now - txSince) < DELIVER_TIMEOUT then return false end
    txReq = nil
    MBX.Clear(); SendHello()                       -- the hello stays queued, so the link comes up when the helper starts
    MBX.expecting = false
    DB.awaitingReq = nil; DB.silentReq = nil
    if pendingMsg then pendingMsg.text = T("helperOff") end
    pendingMsg = nil
    SetStatus("status_nolink")
    if frame and frame:IsShown() then RenderChat() end
    return true
end
do
    local watch = CreateFrame and CreateFrame("Frame")
    if watch and watch.SetScript then
        watch:SetScript("OnUpdate", function()
            if not GetTime then return end
            if txReq then DeliveryWatch(GetTime()) end
            if thinkFS then ThinkingTick(GetTime()) end
        end)
    end
end

local function BeginTransmit(question, kind, extra, silent)
    local effort = EFFORTS[DB.effort or 2] or "medium"
    local lang = DB.language == "en" and "English" or "Turkish"
    local text = "LG2 lang=" .. lang .. "; effort=" .. effort .. "; model=" .. (DB.model or MODEL_IDS[1]) .. "; kind=" .. (kind or "ask")
        .. "\nQuestion: " .. question .. (extra and extra ~= "" and ("\nAbout: " .. extra) or "") .. (silent and "" or ("\n\n" .. CompactContext()))
    text = Utf8Prefix(text, MAX_BYTES)
    DB.request = ((tonumber(DB.request) or 0) + 1) % 65536
    local chat = ActiveChat()
    local msgs = chat.messages
    pendingMsg = (not silent) and msgs[#msgs] or nil
    DB.silentReq = silent and DB.request or nil          -- a silent answer is not shown in the chat (quest descriptions)
    DB.awaitingReq = DB.request
    if not useMailbox then                      -- helper / link folders missing: say so instead of waiting forever
        DB.awaitingReq = nil
        if pendingMsg then pendingMsg.text = T("noLink") end
        pendingMsg = nil
        SetStatus("status_nolink")
        if frame and frame:IsShown() then RenderChat() end
        return
    end
    MBX.expecting = true
    txReq, txSince = DB.request, GetTime and GetTime() or 0
    MBX.Send("Q" .. DB.request .. "\n" .. text, function()
        txReq = nil
        if pendingMsg then pendingMsg.text = T("sentWait") end
        SetStatus("status_wait")
        if frame and frame:IsShown() then RenderChat() end
    end)
    SetStatus("status_tx")
end

---------------------------------------------------------------- chat logic
local function AddUserMessage(text, shown)
    local chat = ActiveChat()
    local msgs = chat.messages
    if #msgs == 0 then chat.title = Utf8Prefix(shown or text, 24) end
    local now = time and time() or 0
    msgs[#msgs + 1] = { role = "user", text = shown or text, time = now }
    msgs[#msgs + 1] = { role = "assistant", text = T("sending"), time = now }
    while #msgs > 60 do table.remove(msgs, 1) end
    RenderSidebar()
end

local hoverTags, hoverSkip = {}, {}                      -- "[Name]" -> what the tooltip said, for the next question
local function SendQuestion(text, shown, kind, extra)
    text = tostring(text or (inputBox and inputBox:GetText()) or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if KN and KN.LinkDetails then                          -- real in-game stats of shift-clicked items
        local details = {}
        for link in text:gmatch("|H(item:[%-%d:]+)|h") do
            if not hoverSkip[link:match("item:(%d+)") or ""] then
                local d = SafeCall(KN.LinkDetails, link)
                local XT = LamboGuideExtras
                local price = XT and XT.PriceLine and SafeCall(XT.PriceLine, tonumber(link:match("item:(%d+)")))
                if price then d = (d and (d .. " | ") or "") .. "prices: " .. price end
                local gearLine = LamboGuideGear and SafeCall(LamboGuideGear.AiLine, link)
                if gearLine then d = (d and (d .. " | ") or "") .. gearLine end
                if d and #details < 3 then details[#details + 1] = Clean(d) end
            end
        end
        if #details > 0 then extra = (extra and (extra .. " || ") or "") .. "Item tooltip: " .. table.concat(details, " || ") end
    end
    text = text:gsub("|c%x%x%x%x%x%x%x%x|H.-|h(%[.-%])|h|r", "%1"):gsub("|H.-|h(%[.-%])|h", "%1")
    if next(hoverTags) then
        local more = {}
        for tag, info in pairs(hoverTags) do if text:find(tag, 1, true) and #more < 3 then more[#more + 1] = info end end
        if #more > 0 then extra = (extra and (extra .. " || ") or "") .. table.concat(more, " || ") end
        hoverTags, hoverSkip = {}, {}
    end
    if text == "" then return end
    if useMailbox and txReq then if statusText then statusText:SetText(C.gold .. Tx("busy") .. C.reset) end; return end
    text = Utf8Prefix(text, 450)
    AddUserMessage(text, shown)
    if inputBox then inputBox:SetText(""); inputBox:ClearFocus() end
    SelectTab("chat")
    BeginTransmit(text, kind, extra and Utf8Prefix(extra, 900))
end

local function HandleReply(raw)
    local text = tostring(raw or "")
    local chat = ActiveChat()
    local replaced = false
    if pendingMsg then
        for _, m in ipairs(chat.messages) do if m == pendingMsg then m.text = text; replaced = true end end
    end
    if not replaced then chat.messages[#chat.messages + 1] = { role = "assistant", text = text, time = time and time() or 0 } end
    pendingMsg = nil
    if MBX then MBX.expecting = false end
    SetStatus("status_ok")
    RenderChat()
    if launcher and not (frame and frame:IsShown()) and not (popFrame and popFrame:IsShown()) then
        launcher:SetText("LG " .. C.gold .. "•" .. C.reset)
    end
end

local function HasSavedChats()
    for _, c in ipairs(DB.chats or {}) do if #(c.messages or {}) > 0 then return true end end
    return false
end
local function NewChat()
    DB.chats = DB.chats or {}
    local cur = DB.chats[DB.currentChat or 0]
    if cur and #(cur.messages or {}) == 0 then          -- the current chat is still empty: no second empty one
        pendingMsg = nil
        if histMenu then histMenu:Hide() end
        RenderSidebar(); RenderChat()
        return
    end
    DB.chats[#DB.chats + 1] = { title = T("chatDefault") .. " " .. (#DB.chats + 1), messages = {} }
    DB.currentChat = #DB.chats
    pendingMsg = nil
    if histMenu then histMenu:Hide() end
    RenderSidebar(); RenderChat()
end

local function ConfirmDelete(index)
    pendingDelete = index
    if not StaticPopupDialogs then return end
    StaticPopupDialogs["LAMBOGUIDE_DELETE_CHAT"] = {
        text = ToASCII(T("deleteConfirm")), button1 = ToASCII(T("yes")), button2 = ToASCII(T("no")),
        OnAccept = function()
            local i = pendingDelete
            if i and DB.chats[i] then table.remove(DB.chats, i) end
            if #DB.chats == 0 then DB.chats[1] = { title = T("chatDefault"), messages = {} } end
            DB.currentChat = math.max(1, math.min(DB.currentChat or 1, #DB.chats))
            pendingDelete = nil; pendingMsg = nil
            if histMenu and not HasSavedChats() then histMenu:Hide() end
            RenderSidebar(); RenderChat()
        end,
        timeout = 0, whileDead = 1, hideOnEscape = 1, preferredIndex = 3,
    }
    StaticPopup_Show("LAMBOGUIDE_DELETE_CHAT")
end

---------------------------------------------------------------- views
local ICON = {
    chat = "Interface\\Icons\\INV_Misc_Note_01", character = "Interface\\Icons\\INV_Shirt_White_01",
    quests = "Interface\\GossipFrame\\AvailableQuestIcon", professions = "Interface\\Icons\\Trade_BlackSmithing",
    patch = "Interface\\Icons\\INV_Scroll_03", settings = "Interface\\Icons\\INV_Misc_Gear_01",
    history = "Interface\\Icons\\INV_Misc_Book_09", assistant = "Interface\\Icons\\INV_Misc_Book_09",
    inventory = "Interface\\Icons\\INV_Misc_Bag_08", addons = "Interface\\Icons\\INV_Misc_Toy_10",
}
local function IconText(key, size)
    size = size or 14
    return "|T" .. ICON[key] .. ":" .. size .. ":" .. size .. ":0:0|t"
end

local function EscapePipes(s) return (tostring(s or ""):gsub("|", "||")) end
-- reply text -> colored text: `x` and **x** gold, [Item] gold in questions, URLs blue
local function FmtReply(s)
    s = EscapePipes(s)
    local links = {}
    s = s:gsub("{url:(https?://[^;}%s]+);([^}]*)}", function(url, label)
        links[#links + 1] = C.link .. "|Hlgurl:" .. url .. "|h[" .. (label ~= "" and label or url) .. "]|h" .. C.reset
        return "\001" .. #links .. "\001"
    end)
    s = s:gsub("%*%*(.-)%*%*", "`%1`")
    s = s:gsub("`([^`\n]+)`", C.gold .. "%1" .. C.reset)
    s = s:gsub("`", "")
    s = s:gsub("(https?://[%w%-%._~:/%?#@!%$&'%(%)%*%+,;=%%]+)", C.link .. "%1" .. C.reset)
    s = s:gsub("{wp:(%d+),%s*([%d%.]+),%s*([%d%.]+),?%s*([^}]*)}", function(map, x, y, label)
        label = label ~= "" and label or (x .. ", " .. y)
        return C.link .. "|Hlgwp:" .. map .. ":" .. x .. ":" .. y .. "|h[" .. T("onMap") .. ": " .. label .. "]|h" .. C.reset
    end)
    s = s:gsub("{ask:([^;}]+);([^}]*)}", function(key, label) return C.gold .. "|Hlgask:" .. key .. "|h[" .. label .. "]|h" .. C.reset end)
    s = s:gsub("\001(%d+)\001", function(i) return links[tonumber(i)] or "" end)
    return s
end

-- WoW cannot open a browser: show the address selected in a box so the player can copy it
local function ShowUrl(url)
    if not StaticPopupDialogs or not StaticPopup_Show then return end
    StaticPopupDialogs["LAMBOGUIDE_URL"] = StaticPopupDialogs["LAMBOGUIDE_URL"] or {
        text = "%s", button1 = CLOSE or "OK", hasEditBox = 1, editBoxWidth = 320,
        OnShow = function(self, data)
            local eb = self.editBox or self.EditBox
            data = data or self.data
            if eb then eb:SetText(data or ""); eb:HighlightText(); eb:SetFocus() end
        end,
        EditBoxOnEscapePressed = function(self) self:GetParent():Hide() end,
        EditBoxOnEnterPressed = function(self) self:GetParent():Hide() end,
        timeout = 0, whileDead = 1, hideOnEscape = 1, preferredIndex = 3,
    }
    StaticPopup_Show("LAMBOGUIDE_URL", ToASCII(T("copyUrl")), nil, url)
end
local function FmtUser(s)
    s = EscapePipes(Clean(s))
    s = s:gsub("%[(.-)%]", C.gold .. "[%1]" .. C.reset)
    return s
end

local function TextView(parent, w)
    local scroll = CreateFrame("ScrollFrame", nil, parent)
    scroll:SetPoint("TOPLEFT", parent, "TOPLEFT", 12, -62); scroll:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT", -12, 12)
    local child = CreateFrame("Frame", nil, scroll); Size(child, w, 400); scroll:SetScrollChild(child)
    local text = child:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    text:SetPoint("TOPLEFT", 6, -6); text:SetWidth(w - 12); text:SetJustifyH("LEFT"); text:SetJustifyV("TOP"); text:SetTextColor(0.95, 0.92, 0.85, 1)
    scroll:EnableMouseWheel(true)
    scroll:SetScript("OnMouseWheel", function(self, d)
        local max = math.max(0, child:GetHeight() - self:GetHeight())
        self:SetVerticalScroll(math.max(0, math.min(max, self:GetVerticalScroll() - d * 50)))
    end)
    scroll:Hide()
    return { scroll = scroll, child = child, text = text }
end
local function SetTextView(view, value)
    SetFontSafe(view.text, 13)
    view.text:SetText(Disp(value or ""))
    view.child:SetHeight(math.max(view.scroll:GetHeight(), (view.text:GetStringHeight() or 16) + 24))
    view.scroll:SetVerticalScroll(0)
end

-- one place that acts on a link: {wp:} map marker, {url:} copy box, {ask:} preset question
local function OpenLink(link, text)
    link = tostring(link)
    if DB and DB.linkdebug then print("LG link click: " .. EscapePipes(link)) end
    local url = link:match("^lgurl:(.+)$")
    if url then ShowUrl(url); return end
    local key = link:match("^lgask:(.+)$")
    if key then AskPreset(key); return end
    local map, x, y = link:match("^lgwp:(%d+):([%d%.]+):([%d%.]+)")
    if not map then return end
    local label = tostring(text or ""):match(":%s*(.-)%]") or ""
    if C_Map and C_Map.GetMapInfo and not SafeCall(C_Map.GetMapInfo, tonumber(map)) then     -- unknown map: Blizzard's map UI would error
        if statusText then statusText:SetText(C.red .. Tx("wpFail") .. C.reset) end
        return
    end
    local ok = KN and KN.SetWaypoint and SafeCall(KN.SetWaypoint, map, x, y, label)
    if LamboGuideExtras and LamboGuideExtras.SetTarget then SafeCall(LamboGuideExtras.SetTarget, map, x, y, label); ok = true end
    if statusText then statusText:SetText(C.gold .. Tx(ok and "wpSet" or "wpFail") .. C.reset) end
    -- no OpenWorldMap(map): on WoW Forever it makes Blizzard's world quest map code error (mapID 1, seen 2026-11-10);
    -- the marker is on the map (M) and our arrow points the way
end

-- links inside a reply, in order: { link = "lgwp:..", label = "[Haritada: X]" }
local function ReplyLinks(s)
    local out = {}
    s = tostring(s or "")
    for chunk in s:gmatch("{[^}]+}") do
        local map, x, y, label = chunk:match("^{wp:(%d+),%s*([%d%.]+),%s*([%d%.]+),?%s*([^}]*)}$")
        if map then
            out[#out + 1] = { link = "lgwp:" .. map .. ":" .. x .. ":" .. y, label = "[" .. T("onMap") .. ": " .. (label ~= "" and label or (x .. ", " .. y)) .. "]" }
        end
        local url, ulabel = chunk:match("^{url:(https?://[^;}%s]+);([^}]*)}$")
        if url then out[#out + 1] = { link = "lgurl:" .. url, label = "[" .. (ulabel ~= "" and ulabel or url) .. "]" } end
        local key, alabel = chunk:match("^{ask:([^;}]+);([^}]*)}$")
        if key then out[#out + 1] = { link = "lgask:" .. key, label = "[" .. alabel .. "]" } end
    end
    return out
end

local function MakeRow()
    local row = { buttons = {} }
    row.frame = CreateFrame("Frame", nil, chatContent)
    row.bg = row.frame:CreateTexture(nil, "BACKGROUND"); row.bg:SetAllPoints()
    row.icon = row.frame:CreateTexture(nil, "ARTWORK"); Size(row.icon, 26, 26); row.icon:SetPoint("TOPLEFT", 8, -8)
    row.author = row.frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    row.author:SetPoint("TOPLEFT", 42, -8); row.author:SetJustifyH("LEFT")
    row.body = row.frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    row.body:SetPoint("TOPLEFT", row.author, "BOTTOMLEFT", 0, -3); row.body:SetJustifyH("LEFT"); row.body:SetJustifyV("TOP")
    -- inline links work on clients that hit-test text links; WoW Forever does not (seen 2026-11-10),
    -- so every link is also a real button under the text (LinkButtons below)
    if row.frame.SetHyperlinksEnabled then
        row.frame:SetHyperlinksEnabled(true)
        row.frame:SetScript("OnHyperlinkClick", function(_, link, text) OpenLink(link, text) end)
    end
    return row
end

-- small clickable buttons under a reply, one per link, wrapped to the row width; returns their height
local function LinkButtons(row, links, width)
    for _, b in ipairs(row.buttons) do b:Hide() end
    if #links == 0 then return 0 end
    local x, y, lineH = 0, 0, 16
    for i, l in ipairs(links) do
        local b = row.buttons[i]
        if not b then
            b = CreateFrame("Button", nil, row.frame)
            b.text = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall"); b.text:SetPoint("LEFT", 2, 0)
            local hl = b:CreateTexture(nil, "HIGHLIGHT"); hl:SetAllPoints(); Color(hl, 0.35, 0.66, 1, 0.18)
            b:SetScript("OnClick", function(self) OpenLink(self.link, self.label) end)
            row.buttons[i] = b
        end
        b.link, b.label = l.link, l.label
        SetFontSafe(b.text, 12)
        b.text:SetText((l.link:match("^lgask:") and C.gold or C.link) .. Disp(l.label) .. C.reset)
        local bw = math.min(width, (tonumber(b.text:GetStringWidth()) or 60) + 6)
        if x > 0 and x + bw > width then x = 0; y = y + lineH + 2 end
        b:ClearAllPoints(); b:SetPoint("TOPLEFT", row.body, "BOTTOMLEFT", x, -4 - y); Size(b, bw, lineH); b:Show()
        x = x + bw + 6
    end
    return y + lineH + 6
end

local rendering = false
RenderChat = function()
    if not chatContent or rendering then return end
    rendering = true
    local msgs = ActiveChat().messages
    local list = msgs
    if #msgs == 0 then list = { { role = "assistant", text = T("welcome") } } end
    local w = math.max(150, (chatScroll:GetWidth() or 300) - 4)
    local y = 4
    thinkFS = nil
    for i, msg in ipairs(list) do
        local row = chatRows[i]
        if not row then row = MakeRow(); chatRows[i] = row end
        row.frame:ClearAllPoints(); row.frame:SetPoint("TOPLEFT", chatContent, "TOPLEFT", 2, -y); row.frame:SetWidth(w)
        row.author:SetWidth(w - 52); row.body:SetWidth(w - 52)
        SetFontSafe(row.author, 12); SetFontSafe(row.body, 13)
        if msg.role == "user" then
            Color(row.bg, 0.09, 0.17, 0.21, 0.97); row.author:SetTextColor(0.57, 0.88, 0.91, 1); row.body:SetTextColor(0.95, 0.93, 0.88, 1)
            row.author:SetText(Disp(Clean(UnitName and UnitName("player") or "Sen")))
            row.icon:SetTexCoord(0, 1, 0, 1)
            if SetPortraitTexture then SafeCall(SetPortraitTexture, row.icon, "player") end
            row.body:SetText(Disp(FmtUser(msg.text or "")))
        else
            Color(row.bg, 0.15, 0.11, 0.07, 0.97); row.author:SetTextColor(1, 0.83, 0.42, 1); row.body:SetTextColor(0.96, 0.93, 0.86, 1)
            row.author:SetText("LamboGuide")
            row.icon:SetTexture(ICON.assistant); row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
            if i == #list and IsWaitText(msg.text) and (txReq or DB.awaitingReq) then
                thinkFS = row.body; row.body:SetText(ThinkingText())
            else
                row.body:SetText(Disp(FmtReply(msg.text or "")))
            end
        end
        local extra = LinkButtons(row, msg.role == "user" and {} or ReplyLinks(msg.text), w - 52)
        local h = math.max(46, (row.author:GetStringHeight() or 14) + (row.body:GetStringHeight() or 16) + 22 + extra)
        row.frame:SetHeight(h); row.frame:Show(); y = y + h + 6
    end
    for i = #list + 1, #chatRows do chatRows[i].frame:Hide() end
    Size(chatContent, w + 4, math.max(chatScroll:GetHeight(), y + 6))
    chatScroll:SetVerticalScroll(math.max(0, chatContent:GetHeight() - chatScroll:GetHeight()))
    rendering = false
end

local function CharacterText()
    local p = Character()
    local L = { C.gold .. T("charTitle") .. C.reset, T("race") .. ": " .. p.race, T("class") .. ": " .. p.class,
        T("level") .. ": " .. tostring(p.level) .. "    " .. T("faction") .. ": " .. p.faction,
        T("location") .. ": " .. p.zone .. (p.subzone ~= "" and (" / " .. p.subzone) or ""), T("coords") .. ": " .. p.coords,
        T("xp") .. ": " .. tostring(p.xp or "?") .. " / " .. tostring(p.xpMax or "?"),
        T("money") .. ": " .. string.format("%dg %ds %dc", math.floor(p.money / 10000), math.floor(p.money / 100) % 100, p.money % 100), "",
        C.gold .. T("gear") .. C.reset }
    if #p.gear == 0 then L[#L + 1] = T("noGear") else for _, s in ipairs(p.gear) do L[#L + 1] = s end end
    L[#L + 1] = ""; L[#L + 1] = C.gold .. T("bags") .. " (" .. p.bagUsed .. "/" .. p.bagTotal .. ")" .. C.reset
    if #p.bags == 0 then L[#L + 1] = T("noBags") else for _, s in ipairs(p.bags) do L[#L + 1] = s end end
    local XT = LamboGuideExtras
    local sess = XT and XT.SessionText and SafeCall(XT.SessionText)
    if sess and sess ~= "" then L[#L + 1] = ""; L[#L + 1] = sess end
    return table.concat(L, "\n")
end
local questMissing = 0
local function QuestDesc(e)
    if DB.language == "en" then return e.game ~= "" and e.game or nil end
    return DB.questTr and DB.questTr[e.title]
end
local function QuestText()
    local entries = QuestEntries(true); local L = { C.gold .. T("activeQuests") .. C.reset, "" }
    questMissing = 0
    if #entries == 0 then L[#L + 1] = T("noQuests") end
    for _, e in ipairs(entries) do
        L[#L + 1] = "- " .. e.row
        local d = QuestDesc(e)
        if d then L[#L + 1] = "    " .. C.muted .. d .. C.reset elseif DB.language ~= "en" then questMissing = questMissing + 1 end
    end
    return table.concat(L, "\n")
end
local descBtn
-- One silent question for all quests that still lack a Turkish description; the answer ("n|sentence" lines) fills DB.questTr.
local function RequestQuestDesc()
    if not DB or DB.language == "en" then return end
    if txReq or DB.awaitingReq then if statusText then statusText:SetText(C.gold .. Tx("busy") .. C.reset) end; return end
    local lines, titles = {}, {}
    for _, e in ipairs(QuestEntries(true)) do
        if not (DB.questTr and DB.questTr[e.title]) and #titles < 12 then
            titles[#titles + 1] = e.title
            lines[#lines + 1] = #titles .. "|" .. e.title .. "|" .. e.objective .. "|" .. e.game
        end
    end
    if #titles == 0 then return end
    DB.questAsk = titles
    BeginTransmit(T("questDescAsk") .. "\n" .. table.concat(lines, "\n"), "ask", nil, true)
    if descBtn then descBtn:SetText(Tx("questDescWait")); StyleButton(descBtn, 12) end
end
local function HandleQuestDesc(body)
    DB.questTr = DB.questTr or {}
    local got = 0
    for line in tostring(body or ""):gmatch("[^\n]+") do
        local n, d = line:match("^%s*(%d+)%s*|%s*(.-)%s*$")
        local title = n and DB.questAsk and DB.questAsk[tonumber(n)]
        if title and d and d ~= "" then DB.questTr[title] = Utf8Prefix(Clean(d), 160); got = got + 1 end
    end
    DB.questAsk = nil
    if MBX then MBX.expecting = false end
    SetStatus(got > 0 and "status_ok" or "status_idle")
    if got == 0 then print(C.gold .. ToASCII(T("questDescFail")) .. C.reset) end
    if RefreshInfo then RefreshInfo() end
    return got
end
local function ProfessionText()
    local j = ProfessionNames(); local L = { C.gold .. T("professions") .. C.reset, "" }
    if #j == 0 then L[#L + 1] = T("noJobs") else for _, s in ipairs(j) do L[#L + 1] = s end end
    return table.concat(L, "\n")
end

local function MakeTrash(parent)
    local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate"); Size(b, 24, 24)
    local lid = b:CreateTexture(nil, "OVERLAY"); Color(lid, 0.93, 0.80, 0.54, 1); Size(lid, 14, 2); lid:SetPoint("TOP", b, "TOP", 0, -6)
    local can = b:CreateTexture(nil, "OVERLAY"); Color(can, 0.93, 0.80, 0.54, 1); Size(can, 10, 11); can:SetPoint("TOP", lid, "BOTTOM", 0, -1)
    local handle = b:CreateTexture(nil, "OVERLAY"); Color(handle, 0.93, 0.80, 0.54, 1); Size(handle, 5, 2); handle:SetPoint("BOTTOM", lid, "TOP", 0, 1)
    b:SetScript("OnEnter", function(self) GameTooltip:SetOwner(self, "ANCHOR_RIGHT"); GameTooltip:SetText(ToASCII(T("deleteChat"))); GameTooltip:Show() end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    return b
end

RenderSidebar = function()
    if not chatListContent or not DB then return end
    ActiveChat()
    local y = 0
    for i, chat in ipairs(DB.chats) do
        local row = sideRows[i]
        if not row then
            row = { title = CreateFrame("Button", nil, chatListContent, "UIPanelButtonTemplate"), trash = MakeTrash(chatListContent) }
            Size(row.title, 184, 24)
            row.trash:SetPoint("LEFT", row.title, "RIGHT", 2, 0)
            sideRows[i] = row
        end
        row.title:ClearAllPoints(); row.title:SetPoint("TOPLEFT", chatListContent, "TOPLEFT", 0, -y)
        local label = Disp(chat.title or (T("chatDefault") .. " " .. i))
        if #label > 26 then label = Utf8Prefix(label, 24) .. ".." end
        row.title:SetText(label); StyleButton(row.title, 11)
        row.title:SetAlpha(i == DB.currentChat and 1 or 0.7)
        row.title:SetScript("OnClick", function() DB.currentChat = i; pendingMsg = nil; if histMenu then histMenu:Hide() end; RenderSidebar(); RenderChat() end)
        row.trash:SetScript("OnClick", function() ConfirmDelete(i) end)
        row.title:Show(); row.trash:Show()
        y = y + 28
    end
    for i = #DB.chats + 1, #sideRows do sideRows[i].title:Hide(); sideRows[i].trash:Hide() end
    if histMenu then histMenu:SetHeight(math.min(280, math.max(70, y + 38))) end
    chatListContent:SetHeight(math.max(chatListScroll:GetHeight(), y + 4))
    local max = math.max(0, chatListContent:GetHeight() - chatListScroll:GetHeight())
    chatListScroll:SetVerticalScroll(math.min(chatListScroll:GetVerticalScroll(), max))
end

RefreshInfo = function()
    if not info or not info:IsShown() then return end
    for name, b in pairs(tabs) do b:SetAlpha(name == currentTab and 1 or 0.6) end
    if descBtn and currentTab ~= "quests" then descBtn:Hide() end
    Shown(characterView.scroll, currentTab == "character"); Shown(questsView.scroll, currentTab == "quests"); Shown(professionsView.scroll, currentTab == "professions")
    Shown(inventoryView.scroll, currentTab == "inventory"); Shown(invSearch, currentTab == "inventory")
    if currentTab == "character" then SetTextView(characterView, CharacterText())
    elseif currentTab == "quests" then
        SetTextView(questsView, QuestText())
        local waiting = DB.silentReq and DB.awaitingReq
        if descBtn then
            Shown(descBtn, DB.language ~= "en" and (questMissing > 0 or waiting))
            descBtn:SetText(waiting and Tx("questDescWait") or Tx("questDescBtn")); StyleButton(descBtn, 12)
        end
    elseif currentTab == "inventory" then
        local XT = LamboGuideExtras
        if XT and XT.ScanBags then SafeCall(XT.ScanBags) end
        SetTextView(inventoryView, XT and XT.InventoryText and (SafeCall(XT.InventoryText, invSearch:GetText()) or "") or "")
    else SetTextView(professionsView, ProfessionText()) end
end

SelectTab = function(id)
    if id == "chat" or not id then RenderChat(); return end
    currentTab = id
    if not info then CreateInfo() end
    info:Show(); RefreshInfo()
end

RefreshLabels = function()
    if not frame then return end
    for _, w in ipairs(widgets) do
        local label = Tx(w.key)
        if w.icon then label = IconText(w.icon, 14) .. " " .. label end
        w.f:SetText(label)
        if w.button then StyleButton(w.f, w.size or 12) else SetFontSafe(w.f, w.size or 12) end
    end
    modelRow:SetText(Disp(T("model") .. ": " .. (MODEL_LABELS[DB.model] or MODEL_LABELS[MODEL_IDS[1]]))); StyleButton(modelRow, 12)
    thinkRow:SetText(Disp(T("thinking") .. ": " .. T(EFFORTS[DB.effort or 2]))); StyleButton(thinkRow, 12)
    langRow:SetText(Disp(T("language") .. ": " .. (DB.language == "en" and "English" or "Türkçe"))); StyleButton(langRow, 12)
    if hoverRow then hoverRow:SetText(Disp(T("hoverKey") .. ": " .. ((DB.hoverKey and DB.hoverKey:gsub("%-", "+")) or T("none")))); StyleButton(hoverRow, 12) end
    SetFontSafe(inputBox, 14); SetFontSafe(statusText, 11)
    SetStatus(useMailbox and "status_idle" or "status_nolink")
    RenderSidebar()
end

---------------------------------------------------------------- UI construction
local function Reg(f, key, isButton, size, icon) widgets[#widgets + 1] = { f = f, key = key, button = isButton, size = size, icon = icon }; return f end
local function MakeButton(parent, key, w, h, onClick, size, icon)
    local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate"); Size(b, w, h); b:SetScript("OnClick", onClick)
    if key then Reg(b, key, true, size, icon) end
    return b
end
local function Tip(b, key)
    b:SetScript("OnEnter", function(self) GameTooltip:SetOwner(self, "ANCHOR_BOTTOM"); GameTooltip:SetText(ToASCII(T(key))); GameTooltip:Show() end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
end
local function IconButton(parent, text, w, h, tipKey, onClick)
    local b = MakeButton(parent, nil, w, h, onClick); b:SetText(text); StyleButton(b, 14); Tip(b, tipKey)
    return b
end
local function Border(f, r, g, b)
    for _, p in ipairs({ { "TOPLEFT", "TOPRIGHT", true }, { "BOTTOMLEFT", "BOTTOMRIGHT", true }, { "TOPLEFT", "BOTTOMLEFT", false }, { "TOPRIGHT", "BOTTOMRIGHT", false } }) do
        local t = f:CreateTexture(nil, "BORDER"); Color(t, r, g, b, 1)
        t:SetPoint(p[1], f, p[1], 0, 0); t:SetPoint(p[2], f, p[2], 0, 0)
        if p[3] then t:SetHeight(1) else t:SetWidth(1) end
    end
end
local function MakeMenu(w, h)
    local m = CreateFrame("Frame", nil, frame); Size(m, w, h); m:SetFrameStrata("DIALOG"); m:EnableMouse(true)
    local bg = m:CreateTexture(nil, "BACKGROUND"); bg:SetAllPoints(); Color(bg, 0.06, 0.05, 0.04, 0.98)
    Border(m, 0.55, 0.45, 0.20); m:Hide()
    return m
end
local function ToggleMenu(m)
    local other = (m == histMenu) and gearMenu or histMenu
    if other then other:Hide() end
    if m:IsShown() then m:Hide() else m:Show() end
end

local function SavePos(f, key)
    local point, _, rel, x, y = f:GetPoint()
    DB[key] = { point = point, rel = rel, x = x, y = y }
end
local function MakeWindow(name, w, h, posKey, defX, defY)
    local f = CreateFrame("Frame", name, UIParent, "BasicFrameTemplateWithInset")
    Size(f, w, h)
    local p = DB[posKey]
    if p and p.point then f:SetPoint(p.point, UIParent, p.rel or p.point, p.x or 0, p.y or 0) else f:SetPoint("CENTER", UIParent, "CENTER", defX or 0, defY or 0) end
    f:SetMovable(true); f:EnableMouse(true); f:RegisterForDrag("LeftButton"); f:SetClampedToScreen(true)
    f:SetScript("OnDragStart", f.StartMoving)
    f:SetScript("OnDragStop", function(self) self:StopMovingOrSizing(); SavePos(self, posKey) end)
    -- title between the two lines of the title bar (about 18 px tall, centre 12 px below the top edge)
    local brand = f:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge"); brand:SetPoint("CENTER", f, "TOP", 0, -12)
    pcall(brand.SetFont, brand, FONT, 13, "OUTLINE")
    if brand.SetShadowColor then brand:SetShadowColor(0, 0, 0, 0.9); brand:SetShadowOffset(1, -1) end
    brand:SetText("|cffffd36aLambo|r|cff8fdcffGuide|r")
    f.brand = brand
    f:Hide()
    return f
end

-- chat panel (messages + input + status); lives in the main window or in the pop-out window
local function CreateChatPanel(parent)
    chatPanel = CreateFrame("Frame", nil, parent); chatPanel:SetAllPoints(parent)
    local bg = chatPanel:CreateTexture(nil, "BACKGROUND")
    bg:SetPoint("TOPLEFT", chatPanel, "TOPLEFT", 0, 0); bg:SetPoint("BOTTOMRIGHT", chatPanel, "BOTTOMRIGHT", 0, 66); Color(bg, 0.04, 0.035, 0.03, 0.92)
    chatScroll = CreateFrame("ScrollFrame", nil, chatPanel)
    chatScroll:SetPoint("TOPLEFT", chatPanel, "TOPLEFT", 2, -2); chatScroll:SetPoint("BOTTOMRIGHT", chatPanel, "BOTTOMRIGHT", -2, 68); chatScroll:EnableMouseWheel(true)
    chatContent = CreateFrame("Frame", nil, chatScroll); Size(chatContent, 300, 300); chatScroll:SetScrollChild(chatContent)
    chatScroll:SetScript("OnMouseWheel", function(self, d)
        local max = math.max(0, chatContent:GetHeight() - self:GetHeight())
        self:SetVerticalScroll(math.max(0, math.min(max, self:GetVerticalScroll() - d * 55)))
    end)
    chatScroll:SetScript("OnSizeChanged", function() RenderChat() end)

    inputBox = CreateFrame("EditBox", nil, chatPanel, "InputBoxTemplate")
    inputBox:SetPoint("BOTTOMLEFT", chatPanel, "BOTTOMLEFT", 8, 32); inputBox:SetPoint("BOTTOMRIGHT", chatPanel, "BOTTOMRIGHT", -88, 32); inputBox:SetHeight(28)
    inputBox:SetAutoFocus(false); inputBox:SetMaxLetters(6000)
    inputBox:SetScript("OnEnterPressed", function() SendQuestion() end)
    inputBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
    local send = MakeButton(chatPanel, nil, 78, 26, function() SendQuestion() end, 12); send:SetPoint("BOTTOMRIGHT", chatPanel, "BOTTOMRIGHT", -2, 32)
    send:SetText("")
    local sendLabel = send:CreateFontString(nil, "OVERLAY", "GameFontNormal"); sendLabel:SetPoint("CENTER", send, "CENTER", 0, 0)
    sendLabel:SetTextColor(1, 0.82, 0.2, 1); Reg(sendLabel, "send", false, 12)
    statusDot = chatPanel:CreateTexture(nil, "OVERLAY"); Size(statusDot, 8, 8); statusDot:SetPoint("BOTTOMLEFT", chatPanel, "BOTTOMLEFT", 8, 12); Color(statusDot, 0.5, 0.5, 0.5, 1)
    statusText = chatPanel:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall"); statusText:SetPoint("LEFT", statusDot, "RIGHT", 6, 0)
end

local function CreatePop()
    popFrame = MakeWindow("LamboGuidePopFrame", 380, 270, "popPos", -470, 0)
    popFrame:SetFrameStrata("HIGH"); 
    if popFrame.CloseButton then popFrame.CloseButton:SetScript("OnClick", function() Dock() end) end
    popFrame:SetScript("OnHide", function() if popped then Dock() end end)
    tinsert(UISpecialFrames, "LamboGuidePopFrame")
end

Dock = function()
    popped = false
    if not chatPanel or not mainArea then return end
    chatPanel:SetParent(mainArea); chatPanel:ClearAllPoints(); chatPanel:SetAllPoints(mainArea)
    if popFrame and popFrame:IsShown() then popFrame:Hide() end
    if placeholder then placeholder:Hide() end
    RenderChat()
end

PopOut = function()
    if popped then Dock(); return end
    if not popFrame then CreatePop() end
    popped = true
    chatPanel:SetParent(popFrame); chatPanel:ClearAllPoints()
    chatPanel:SetPoint("TOPLEFT", popFrame, "TOPLEFT", 12, -30); chatPanel:SetPoint("BOTTOMRIGHT", popFrame, "BOTTOMRIGHT", -12, 12)
    popFrame:Show(); if placeholder then placeholder:Show() end
    RenderChat()
end

CreateInfo = function()
    info = MakeWindow("LamboGuideInfoFrame", 380, 430, "infoPos", 480, 0)
    tinsert(UISpecialFrames, "LamboGuideInfoFrame")
    local xx = 12
    for _, id in ipairs({ "character", "quests", "professions", "inventory" }) do
        local b = MakeButton(info, id, 87, 24, function() currentTab = id; RefreshInfo() end, 11, id); b:SetPoint("TOPLEFT", info, "TOPLEFT", xx, -30); tabs[id] = b; xx = xx + 89
    end
    characterView = TextView(info, 340); questsView = TextView(info, 340); professionsView = TextView(info, 340); inventoryView = TextView(info, 340)
    questsView.scroll:SetPoint("BOTTOMRIGHT", info, "BOTTOMRIGHT", -12, 42)
    descBtn = MakeButton(info, nil, 356, 24, function() RequestQuestDesc() end); descBtn:SetPoint("BOTTOM", info, "BOTTOM", 0, 12); descBtn:Hide()
    inventoryView.scroll:SetPoint("TOPLEFT", info, "TOPLEFT", 12, -88)
    invSearch = CreateFrame("EditBox", nil, info, "InputBoxTemplate"); Size(invSearch, 330, 20); invSearch:SetPoint("TOPLEFT", info, "TOPLEFT", 22, -60)
    invSearch:SetAutoFocus(false)
    invSearch:SetScript("OnTextChanged", function() if currentTab == "inventory" then RefreshInfo() end end)
    invSearch:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
    RefreshLabels()
end

CreateUI = function()
    frame = MakeWindow("LamboGuideFrame", 520, 440, "pos")
    tinsert(UISpecialFrames, "LamboGuideFrame")
    frame:SetScript("OnShow", function() if launcher then launcher:SetText("LG") end; RenderChat() end)
    frame:SetScript("OnHide", function() if gearMenu then gearMenu:Hide() end; if histMenu then histMenu:Hide() end end)

    -- top bar
    local histBtn = MakeButton(frame, "chats", 140, 24, function()
        if HasSavedChats() then RenderSidebar(); ToggleMenu(histMenu) else histMenu:Hide() end
    end, 12, "history"); histBtn:SetPoint("TOPLEFT", frame, "TOPLEFT", 12, -30)
    local newBtn = IconButton(frame, "+", 28, 24, "new", NewChat); newBtn:SetPoint("LEFT", histBtn, "RIGHT", 4, 0)
    local gearBtn = IconButton(frame, IconText("settings", 16), 28, 24, "settings", function() ToggleMenu(gearMenu) end); gearBtn:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -12, -30)
    local popBtn = IconButton(frame, "↗", 28, 24, "popout", function() PopOut() end); popBtn:SetPoint("RIGHT", gearBtn, "LEFT", -4, 0)
    local patchBtn = MakeButton(frame, "patch", 116, 24, function() SendQuestion(T("patchQuery"), T("patchShow"), "patch") end, 12, "patch"); patchBtn:SetPoint("RIGHT", popBtn, "LEFT", -4, 0)
    local charBtn = MakeButton(frame, "character", 100, 24, function() SelectTab("character") end, 12, "character"); charBtn:SetPoint("RIGHT", patchBtn, "LEFT", -4, 0)

    -- chat area
    mainArea = CreateFrame("Frame", nil, frame); mainArea:SetPoint("TOPLEFT", frame, "TOPLEFT", 12, -60); mainArea:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -12, 12)
    CreateChatPanel(mainArea)
    placeholder = CreateFrame("Frame", nil, mainArea); placeholder:SetAllPoints(mainArea); placeholder:SetFrameLevel((tonumber(chatPanel:GetFrameLevel()) or 1) + 5)
    local pbg = placeholder:CreateTexture(nil, "BACKGROUND"); pbg:SetAllPoints(); Color(pbg, 0.04, 0.035, 0.03, 0.97)
    local pnote = placeholder:CreateFontString(nil, "OVERLAY", "GameFontNormal"); pnote:SetPoint("CENTER", placeholder, "CENTER", 0, 20); Reg(pnote, "poppedNote", false, 13)
    local pback = MakeButton(placeholder, "dock", 180, 26, function() Dock() end, 12); pback:SetPoint("TOP", pnote, "BOTTOM", 0, -12)
    placeholder:Hide()

    -- chat history menu
    histMenu = MakeMenu(240, 280)
    histMenu:SetPoint("TOPLEFT", histBtn, "BOTTOMLEFT", 0, -2)
    local histClose = CreateFrame("Button", nil, histMenu, "UIPanelCloseButton"); Size(histClose, 24, 24)
    histClose:SetPoint("TOPRIGHT", histMenu, "TOPRIGHT", 3, 3); histClose:SetScript("OnClick", function() histMenu:Hide() end)
    chatListScroll = CreateFrame("ScrollFrame", nil, histMenu)
    chatListScroll:SetPoint("TOPLEFT", histMenu, "TOPLEFT", 10, -26); chatListScroll:SetPoint("BOTTOMRIGHT", histMenu, "BOTTOMRIGHT", -10, 10); chatListScroll:EnableMouseWheel(true)
    chatListContent = CreateFrame("Frame", nil, chatListScroll); Size(chatListContent, 220, 200); chatListScroll:SetScrollChild(chatListContent)
    chatListScroll:SetScript("OnMouseWheel", function(self, d)
        local max = math.max(0, chatListContent:GetHeight() - self:GetHeight())
        self:SetVerticalScroll(math.max(0, math.min(max, self:GetVerticalScroll() - d * 35)))
    end)

    -- settings menu
    gearMenu = MakeMenu(236, 224)
    gearMenu:SetPoint("TOPRIGHT", gearBtn, "BOTTOMRIGHT", 0, -2)
    modelRow = MakeButton(gearMenu, nil, 216, 24, function()
        local cur = 1; for i, id in ipairs(MODEL_IDS) do if id == DB.model then cur = i end end
        DB.model = MODEL_IDS[cur % #MODEL_IDS + 1]; RefreshLabels()
    end); modelRow:SetPoint("TOPLEFT", gearMenu, "TOPLEFT", 10, -10)
    thinkRow = MakeButton(gearMenu, nil, 216, 24, function() DB.effort = (DB.effort or 2) % 3 + 1; RefreshLabels() end); thinkRow:SetPoint("TOPLEFT", modelRow, "BOTTOMLEFT", 0, -4)
    langRow = MakeButton(gearMenu, nil, 216, 24, function() DB.language = DB.language == "en" and "tr" or "en"; RefreshLabels(); RenderChat(); RefreshInfo() end); langRow:SetPoint("TOPLEFT", thinkRow, "BOTTOMLEFT", 0, -4)
    hoverRow = MakeButton(gearMenu, nil, 216, 24, function() CaptureHoverKey() end); hoverRow:SetPoint("TOPLEFT", langRow, "BOTTOMLEFT", 0, -4)
    local addonsRow = MakeButton(gearMenu, "addonsRow", 216, 24, function() gearMenu:Hide(); if LamboGuideExtras then SafeCall(LamboGuideExtras.ShowAddons) end end, 12, "addons")
    addonsRow:SetPoint("TOPLEFT", hoverRow, "BOTTOMLEFT", 0, -4)
    local testRow = MakeButton(gearMenu, "test", 216, 24, function() gearMenu:Hide(); SendQuestion("ping", T("pingShow"), "ping") end, 12); testRow:SetPoint("TOPLEFT", addonsRow, "BOTTOMLEFT", 0, -4)
    local hint = gearMenu:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall"); hint:SetPoint("TOPLEFT", testRow, "BOTTOMLEFT", 2, -8); hint:SetWidth(212); hint:SetJustifyH("LEFT"); Reg(hint, "hint", false, 10)

    RefreshLabels(); RenderChat()
end

local function Toggle()
    if not frame then CreateUI() end
    if frame:IsShown() then frame:Hide() else frame:Show() end
end

local function CreateLauncher()
    local b = CreateFrame("Button", "LamboGuideLauncher", UIParent, "UIPanelButtonTemplate"); launcher = b
    Size(b, 40, 40); b:SetText("LG"); StyleButton(b, 14); b:SetFrameStrata("DIALOG")
    local p = DB.launcher
    if p and p.point then b:SetPoint(p.point, UIParent, p.rel or p.point, p.x or 0, p.y or 0) else b:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -8, 8) end
    b:SetMovable(true); b:EnableMouse(true); b:RegisterForDrag("RightButton")
    b:SetScript("OnDragStart", b.StartMoving)
    b:SetScript("OnDragStop", function(self)
        self:StopMovingOrSizing()
        local point, _, rel, x, y = self:GetPoint()
        DB.launcher = { point = point, rel = rel, x = x, y = y }
    end)
    b:SetScript("OnClick", Toggle)
    b:SetScript("OnEnter", function(self) GameTooltip:SetOwner(self, "ANCHOR_LEFT"); GameTooltip:SetText(ToASCII(T("launcher"))); GameTooltip:Show() end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
end

---------------------------------------------------------------- notes from LamboGuide itself (level up, dungeon, warnings)
local function AddNote(text, askKey, askLabel)
    if not DB then return end
    local chat = ActiveChat()
    local body = text .. ((askKey and askLabel) and ("  {ask:" .. askKey .. ";" .. askLabel .. "}") or "")
    chat.messages[#chat.messages + 1] = { role = "assistant", text = body, time = time and time() or 0, note = true }
    while #chat.messages > 60 do table.remove(chat.messages, 1) end
    RenderChat()
    if launcher and not (frame and frame:IsShown()) and not (popFrame and popFrame:IsShown()) then
        launcher:SetText("LG " .. C.gold .. "•" .. C.reset)
    end
end

AskPreset = function(key)
    if key == "levelup" then
        SendQuestion(T("askLevelUp"))
    else
        local dungeon = key:match("^dungeon:(.+)$")
        if dungeon then SendQuestion(string.format(T("askDungeon"), dungeon)) end
    end
end

LamboGuideCore = { AddNote = AddNote, Ask = function(...) return AskPreset(...) end, SendQuestion = function(...) return SendQuestion(...) end }

---------------------------------------------------------------- ask about what the mouse is over
BINDING_HEADER_LAMBOGUIDE = "LamboGuide"
BINDING_NAME_LAMBOGUIDE_ASKHOVER = "Fare altındakini sor / Ask about hovered"

-- Put text (an item link or a [Name] tag) into our input box, so the player writes his own question about it.
local function TagInput(tag)
    if not (inputBox and frame) then return false end
    if not frame:IsShown() and not (popFrame and popFrame:IsShown()) then PopOut() end
    inputBox:SetFocus()
    local cur = inputBox:GetText() or ""
    inputBox:Insert((cur ~= "" and not cur:find("%s$") and " " or "") .. tag .. " ")
    return true
end
function LamboGuide_AskHovered()                        -- name kept for the key binding
    if not DB or not frame then return end
    local h = KN and KN.Hovered and SafeCall(KN.Hovered)
    if not h then print(C.gold .. ToASCII(T("hoverNone")) .. C.reset); return end
    local name = Clean(h.name or "?")
    local tag = (h.kind == "item" and h.link) or ("[" .. name .. "]")
    local info = "Hovered " .. h.kind .. ": " .. (h.link or name) .. (h.text and (" | tooltip: " .. Clean(h.text)) or "")
    local gearLine = h.kind == "item" and h.link and LamboGuideGear and SafeCall(LamboGuideGear.AiLine, h.link)
    if gearLine then info = info .. " | " .. gearLine end
    hoverTags["[" .. name .. "]"] = info
    if h.kind == "item" and h.link then hoverSkip[h.link:match("item:(%d+)") or ""] = true end
    TagInput(tag)
end

local hoverButton = CreateFrame("Button", "LamboGuideHoverButton", UIParent)
hoverButton:SetScript("OnClick", function() LamboGuide_AskHovered() end)
local hoverPending, captureFrame = false, nil
local MODIFIER = { LSHIFT = true, RSHIFT = true, LCTRL = true, RCTRL = true, LALT = true, RALT = true }

-- The game action a key already does (W = move forward ...), or nil when the key is free. Walking keys must never become ours.
local function KeyTaken(combo)
    if not GetBindingAction then return nil end
    local act = SafeCall(GetBindingAction, combo)
    if act and act ~= "" and not tostring(act):find("LamboGuideHoverButton", 1, true) then return act end
end
local function ApplyHoverKey()
    if not (SetOverrideBindingClick and ClearOverrideBindings) then return end
    if InCombatLockdown and InCombatLockdown() then hoverPending = true; return end
    hoverPending = false
    ClearOverrideBindings(hoverButton)
    if DB.hoverKey and KeyTaken(DB.hoverKey) then DB.hoverKey = nil end     -- an older version allowed W/S; free the key again
    if DB.hoverKey then SetOverrideBindingClick(hoverButton, true, DB.hoverKey, "LamboGuideHoverButton") end
end

CaptureHoverKey = function()
    if InCombatLockdown and InCombatLockdown() then
        if statusText then statusText:SetText(C.gold .. Tx("combatWait") .. C.reset) end
        return
    end
    hoverRow:SetText(Tx("pressKey")); StyleButton(hoverRow, 12)
    captureFrame = captureFrame or CreateFrame("Frame", nil, UIParent)
    local cap = captureFrame
    cap:SetAllPoints(UIParent); cap:SetFrameStrata("FULLSCREEN_DIALOG"); cap:EnableKeyboard(true)
    if cap.SetPropagateKeyboardInput then cap:SetPropagateKeyboardInput(false) end
    cap:Show()
    cap:SetScript("OnKeyDown", function(self, key)
        if MODIFIER[key] then return end
        self:EnableKeyboard(false); self:Hide()
        if key == "ESCAPE" then
            DB.hoverKey = nil
        else
            local combo = ((IsAltKeyDown and IsAltKeyDown()) and "ALT-" or "") .. ((IsControlKeyDown and IsControlKeyDown()) and "CTRL-" or "")
                .. ((IsShiftKeyDown and IsShiftKeyDown()) and "SHIFT-" or "") .. key
            local taken = KeyTaken(combo)
            if taken then
                local msg = string.format(T("keyTaken"), taken)
                print(C.gold .. ToASCII(msg) .. C.reset)
                if statusText then statusText:SetText(C.gold .. Disp(msg) .. C.reset) end
            else
                DB.hoverKey = combo
            end
        end
        ApplyHoverKey(); RefreshLabels()
    end)
end

---------------------------------------------------------------- startup
local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN"); events:RegisterEvent("PLAYER_REGEN_ENABLED")
events:RegisterEvent("QUEST_LOG_UPDATE"); events:RegisterEvent("BAG_UPDATE"); events:RegisterEvent("PLAYER_EQUIPMENT_CHANGED"); events:RegisterEvent("ZONE_CHANGED_NEW_AREA")
events:SetScript("OnEvent", function(_, event)
    if event == "PLAYER_REGEN_ENABLED" then
        if hoverPending and DB then ApplyHoverKey() end
        return
    end
    if event == "PLAYER_LOGIN" then
        DB = LamboGuideDB
        DB.language = DB.language or "tr"; DB.effort = DB.effort or 2; DB.model = DB.model or MODEL_IDS[1]
        if (DB.settingsVer or 0) < 2 then           -- 0.7.2: the old default (a fixed model, medium effort) was slow or refused
            DB.settingsVer = 2; DB.model = "auto"; DB.effort = 1
        end
        DB.request = tonumber(DB.request) or 0
        DB.ascii = false
        DB.messages = nil                                    -- v0.3 leftovers
        for _, chat in ipairs(DB.chats or {}) do for _, m in ipairs(chat.messages or {}) do
            if m.text == "Soru yardimciya aktariliyor..." or m.text == "Sending question..." then m.text = T("sentWait") end
        end end
        ActiveChat()
        CreateUI(); CreateLauncher(); ApplyHoverKey()
        if MBX and MBX.Start(GetTime()) then
            useMailbox = true
            MBX.onMessage = function(text)
                local kind, req, body = text:match("^(%a)(%d*)\n?(.*)$")
                if kind == "A" then
                    req = tonumber(req)
                    if req and DB.awaitingReq == req then
                        DB.awaitingReq = nil
                        if DB.silentReq == req then DB.silentReq = nil; HandleQuestDesc(body) else HandleReply(body) end
                    end
                elseif kind == "h" then
                    if not MBX.Busy() and not DB.awaitingReq then SetStatus("status_link") end
                end
            end
            MBX.onError = function(err) if DB.debug then print("LamboGuide: " .. tostring(err)) end end
            MBX.expecting = DB.awaitingReq ~= nil
            SendHello()
        end
        SLASH_LAMBOGUIDE1 = "/lg"; SLASH_LAMBOGUIDE2 = "/lamboguide"
        SlashCmdList["LAMBOGUIDE"] = function(msg)
            msg = tostring(msg or ""):lower()
            if msg == "test" then SendQuestion("ping", T("pingShow"), "ping"); if not frame:IsShown() then Toggle() end
            elseif msg == "karakter" or msg == "char" then SelectTab("character")
            elseif msg == "envanter" or msg == "inv" then SelectTab("inventory")
            elseif msg == "linkdebug" then
                DB.linkdebug = not DB.linkdebug
                print("LG linkdebug: " .. tostring(DB.linkdebug))
                -- diagnostics for clickable links: what is under the mouse and does it support hyperlinks
                local foci = (GetMouseFoci and GetMouseFoci()) or { GetMouseFocus and GetMouseFocus() }
                for i, f in ipairs(foci or {}) do
                    local name = (f.GetDebugName and f:GetDebugName()) or (f.GetName and f:GetName()) or tostring(f)
                    print(("LG link %d: %s mouse=%s links=%s script=%s"):format(i, tostring(name),
                        tostring(f.IsMouseEnabled and f:IsMouseEnabled()), tostring(f.GetHyperlinksEnabled and f:GetHyperlinksEnabled()),
                        tostring(f.GetScript and f:GetScript("OnHyperlinkClick") ~= nil)))
                end
                if #(foci or {}) == 0 then print("LG link: nothing under mouse") end
                -- arrow diagnostics
                local XT = LamboGuideExtras
                local tg = XT and XT.Target and XT.Target()
                local py, px, _, inst = UnitPosition and UnitPosition("player")
                print(("LG arrow: target=%s wx=%s wy=%s cont=%s | player=%s,%s inst=%s | GetWorldPosFromMapPos=%s CreateVector2D=%s"):format(
                    tostring(tg and tg.map), tostring(tg and tg.wx), tostring(tg and tg.wy), tostring(tg and tg.cont),
                    tostring(px), tostring(py), tostring(inst),
                    tostring(C_Map and C_Map.GetWorldPosFromMapPos ~= nil), tostring(CreateVector2D ~= nil)))
                local arrow = _G.LamboGuideArrow
                print("LG arrow frame: " .. tostring(arrow and arrow:IsShown()) .. " text=" .. tostring(arrow and arrow.text and arrow.text:GetText()))
            elseif msg == "addon" or msg == "addons" then if LamboGuideExtras then LamboGuideExtras.ShowAddons() end
            elseif msg == "ok" or msg == "arrow" then if LamboGuideExtras then LamboGuideExtras.ClearTarget() end
            elseif msg:match("^gear") then if LamboGuideGear then LamboGuideGear.Slash(msg:match("^gear%s*(.*)")) end
            elseif msg == "reset" then DB.pos = nil; DB.popPos = nil; DB.infoPos = nil; DB.launcher = nil; print("LamboGuide: /reload")
            else Toggle() end
        end
        print(C.gold .. ToASCII(T("ready")) .. C.reset)
        -- Shift+click an item into our box. WoW Forever's Blizzard code calls ChatFrameUtil.InsertLink while the old
        -- ChatEdit_InsertLink still exists as a wrapper, so hook both (seen in game 2026-11-10) and drop the echo.
        local lastLink, lastAt = nil, -1
        local function DefaultChatBusy()
            local w = (ChatFrameUtil and ChatFrameUtil.GetActiveWindow and ChatFrameUtil.GetActiveWindow())
                or (ChatEdit_GetActiveWindow and ChatEdit_GetActiveWindow())
            return w and (not w.IsShown or w:IsShown())
        end
        local function InsertHook(link)
            if not (link and inputBox) then return end
            local open = (frame and frame:IsShown()) or (popFrame and popFrame:IsShown())
            if not (inputBox:HasFocus() or (open and not DefaultChatBusy())) then return end
            local now = GetTime and GetTime() or 0
            if link == lastLink and now - lastAt < 0.2 then return end
            lastLink, lastAt = link, now
            inputBox:SetFocus()
            inputBox:Insert(link .. " ")
            -- Blizzard does not know our box took the link, so on a stack it also opens "split stack": close it again
            if C_Timer and C_Timer.After then
                C_Timer.After(0, function()
                    local sp = _G.StackSplitFrame
                    if sp and sp.IsShown and sp:IsShown() then sp:Hide() end
                    if inputBox then inputBox:SetFocus() end
                end)
            end
        end
        if hooksecurefunc then
            if ChatEdit_InsertLink then pcall(hooksecurefunc, "ChatEdit_InsertLink", InsertHook) end
            if ChatFrameUtil and ChatFrameUtil.InsertLink then pcall(hooksecurefunc, ChatFrameUtil, "InsertLink", InsertHook) end
        end
    elseif info and info:IsShown() then
        RefreshInfo()
    end
end)

LamboGuideTest = { HasSavedChats = function() return HasSavedChats() end, NewChat = function() return NewChat() end, QuestText = function() return QuestText() end, RequestQuestDesc = function() return RequestQuestDesc() end, HandleQuestDesc = function(...) return HandleQuestDesc(...) end, KeyTaken = function(...) return KeyTaken(...) end, TagInput = function(...) return TagInput(...) end, Context = function() return CompactContext() end, UsingMailbox = function() return useMailbox end, FmtReply = function(...) return FmtReply(...) end, FmtUser = function(...) return FmtUser(...) end, DeliveryWatch = function(...) return DeliveryWatch(...) end, ThinkingTick = function(now) ThinkingTick(now); return thinkFS and thinkFS:GetText() end, Utf8Prefix = Utf8Prefix, ToASCII = ToASCII, HandleReply = function(...) return HandleReply(...) end }
