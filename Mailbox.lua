-- LamboGuide mailbox: a reusable two-way link between the addon and the helper app.
--
-- Idea: a bank of empty, load-on-demand helper addons. Each one is a single bit:
-- "enabled" = 1, "disabled" = 0. The game publishes its outgoing frame by switching
-- the LamboGuideU### bits and calling SaveAddOns() (the client writes AddOns.txt).
-- The helper publishes its frame by editing the LamboGuideD#### lines in that file;
-- the game re-reads them with ResetAddOns(). No pixels, no screen capture, no /reload.
--
-- Frame layout (both directions, size = bank bits / 8):
--   [1] 'L'  [2] flags (1 first, 2 last, 4 compressed)  [3] seq (0 = idle)  [4] ack
--   [5..6] epoch (game session id)  [7] payload length  [8..] payload  [-2..-1] Fletcher-16
-- Stop-and-wait: a sender moves to its next chunk when the peer's ack equals its seq.

LamboGuideMailbox = LamboGuideMailbox or {}
local M = LamboGuideMailbox

local UP_BITS, DOWN_BITS = 768, 1024
local UP_SIZE, DOWN_SIZE = UP_BITS / 8, DOWN_BITS / 8
local HEAD, TAIL = 7, 2
local F_FIRST, F_LAST, F_ZIP = 1, 2, 4
local MAGIC = 76
local RESEND = 8          -- seconds without an ack before the whole message is sent again
local VERIFY = 1.0        -- seconds between full checks of our own published bits

M.UP_BITS, M.DOWN_BITS, M.HEAD, M.TAIL = UP_BITS, DOWN_BITS, HEAD, TAIL

local UP_NAMES, DOWN_NAMES = {}, {}
for i = 1, UP_BITS do UP_NAMES[i] = string.format("LamboGuideU%03d", i) end
for i = 1, DOWN_BITS do DOWN_NAMES[i] = string.format("LamboGuideD%04d", i) end
M.UP_NAMES, M.DOWN_NAMES = UP_NAMES, DOWN_NAMES

local POW = {}
for i = 0, 7 do POW[i] = 2 ^ i end

---------------------------------------------------------------- codec
local function Fletcher(s, n)
    local a, b = 0, 0
    for i = 1, n do a = (a + s:byte(i)) % 255; b = (b + a) % 255 end
    return b * 256 + a
end

local function Encode(size, flags, seq, ack, epoch, payload)
    payload = payload or ""
    local body = string.char(MAGIC, flags % 256, seq % 256, ack % 256, math.floor(epoch / 256) % 256, epoch % 256, #payload)
        .. payload .. string.rep("\0", size - HEAD - TAIL - #payload)
    local sum = Fletcher(body, #body)
    return body .. string.char(math.floor(sum / 256), sum % 256)
end

local function Header(raw)
    if not raw or #raw < HEAD or raw:byte(1) ~= MAGIC then return nil end
    return { flags = raw:byte(2), seq = raw:byte(3), ack = raw:byte(4), epoch = raw:byte(5) * 256 + raw:byte(6), len = raw:byte(7) }
end

local function Decode(raw, size)
    local h = Header(raw)
    if not h or #raw ~= size or h.len > size - HEAD - TAIL then return nil end
    local sum = raw:byte(size - 1) * 256 + raw:byte(size)
    if Fletcher(raw, size - TAIL) ~= sum then return nil end
    h.payload = raw:sub(HEAD + 1, HEAD + h.len)
    return h
end
M.Encode, M.Decode, M.Fletcher = Encode, Decode, Fletcher

---------------------------------------------------------------- client API wrappers
local API = {}
local function Bind()
    local C = C_AddOns
    if C and C.GetAddOnEnableState then
        API.get = function(name, who) return C.GetAddOnEnableState(name, who) end
        API.enable = function(name, who) return C.EnableAddOn(name, who) end
        API.disable = function(name, who) return C.DisableAddOn(name, who) end
        API.save, API.reset = C.SaveAddOns, C.ResetAddOns
        API.exists = C.DoesAddOnExist or function(name) return C.GetAddOnInfo(name) ~= nil end
    elseif GetAddOnEnableState then
        API.get = function(name, who) return GetAddOnEnableState(who, name) end   -- old argument order
        API.enable = function(name, who) return EnableAddOn(name, who) end
        API.disable = function(name, who) return DisableAddOn(name, who) end
        API.save, API.reset = SaveAddOns, ResetAddOns
        API.exists = function(name) local n, _, _, _, reason = GetAddOnInfo(name); return n ~= nil and reason ~= "MISSING" end
    end
    return API.get and API.enable and API.disable and API.save and API.reset and API.exists
end

local function IsOn(v)
    if type(v) == "boolean" then return v end
    return (tonumber(v) or 0) > 0
end

local function ReadBytes(names, firstByte, count, who)
    local out = {}
    for b = firstByte, firstByte + count - 1 do
        local v = 0
        for bit = 0, 7 do
            if IsOn(API.get(names[(b - 1) * 8 + bit + 1], who)) then v = v + POW[bit] end
        end
        out[#out + 1] = string.char(v)
    end
    return table.concat(out)
end

---------------------------------------------------------------- state
local S = { started = false }
M.state = S

local function Reset(now)
    S.epoch = math.random(1, 65535)
    S.seq = 0
    S.out = {}            -- queued messages {chunks=, idx=, seq=, sentAt=, onDone=}
    S.cur = nil
    S.peerSeq = 0         -- last accepted helper seq (sent back as ack)
    S.parts, S.partZip = nil, false
    S.lastDownHead = nil
    S.published = nil     -- last up frame we wrote
    S.verifiedAt = 0
    S.lastHeard = nil
    S.lastData = now or 0
    S.nextTick = 0
end

local function NextSeq()
    S.seq = S.seq % 255 + 1
    return S.seq
end

local function Compress(text)
    local E = C_EncodingUtil
    if not (E and E.CompressString and Enum and Enum.CompressionMethod) then return nil end
    local ok, out = pcall(E.CompressString, text, Enum.CompressionMethod.Deflate)
    if ok and type(out) == "string" and #out < #text then return out end
    return nil
end

local function Decompress(data)
    local E = C_EncodingUtil
    if not (E and E.DecompressString and Enum and Enum.CompressionMethod) then return nil end
    local ok, out = pcall(E.DecompressString, data, Enum.CompressionMethod.Deflate)
    if ok and type(out) == "string" then return out end
    return nil
end

local function Chunk(text)
    local zipped = Compress(text)
    local data = zipped or text
    local room = UP_SIZE - HEAD - TAIL
    local chunks, n = {}, math.max(1, math.ceil(#data / room))
    for i = 1, n do
        local flags = (i == 1 and F_FIRST or 0) + (i == n and F_LAST or 0) + (zipped and F_ZIP or 0)
        chunks[i] = { flags = flags, data = data:sub((i - 1) * room + 1, i * room) }
    end
    return chunks
end

local function StartMessage(msg, now)
    msg.idx, msg.seq, msg.sentAt = 1, NextSeq(), now
    S.cur = msg
end

---------------------------------------------------------------- receive
local function Accept(h)
    if h.flags % 2 == 1 then S.parts, S.partZip = {}, math.floor(h.flags / F_ZIP) % 2 == 1 end   -- FIRST
    if not S.parts then return end
    S.parts[#S.parts + 1] = h.payload
    if math.floor(h.flags / F_LAST) % 2 == 1 then
        local data = table.concat(S.parts)
        S.parts = nil
        if S.partZip then data = Decompress(data) end
        if data and M.onMessage then
            local ok, err = pcall(M.onMessage, data)
            if not ok and M.onError then M.onError(err) end
        end
    end
end

local function ReadDown(now)
    local headRaw = ReadBytes(DOWN_NAMES, 1, HEAD, S.who)
    local h = Header(headRaw)
    if not h or h.epoch ~= S.epoch then return nil end
    S.lastHeard = now
    local ahead = (h.seq - S.peerSeq) % 255
    if h.seq ~= 0 and ahead >= 1 and ahead <= 120 then                 -- only newer frames; stale copies are ignored
        local raw = headRaw .. ReadBytes(DOWN_NAMES, HEAD + 1, DOWN_SIZE - HEAD, S.who)
        local full = Decode(raw, DOWN_SIZE)
        if full and full.epoch == S.epoch then
            S.peerSeq = full.seq
            S.lastData = now
            Accept(full)
        end
    end
    return h.ack
end

---------------------------------------------------------------- send
local function Publish(raw, now)
    local verify = (now - S.verifiedAt) >= VERIFY
    if raw == S.published and not verify then return end
    local changed = false
    for b = 1, UP_SIZE do
        local want, had = raw:byte(b), S.published and S.published:byte(b)
        if verify or want ~= had then
            for bit = 0, 7 do
                local name = UP_NAMES[(b - 1) * 8 + bit + 1]
                local on = math.floor(want / POW[bit]) % 2 == 1
                if IsOn(API.get(name, S.who)) ~= on then
                    if on then API.enable(name, S.who) else API.disable(name, S.who) end
                    changed = true
                end
            end
        end
    end
    if verify then S.verifiedAt = now end
    if changed then API.save() end
    S.published = raw
end

local function OutgoingFrame()
    local cur = S.cur
    if cur then
        local c = cur.chunks[cur.idx]
        return Encode(UP_SIZE, c.flags, cur.seq, S.peerSeq, S.epoch, c.data)
    end
    return Encode(UP_SIZE, 0, 0, S.peerSeq, S.epoch, "")
end

---------------------------------------------------------------- public
function M.Available()
    if not Bind() then return false end
    for _, name in ipairs({ UP_NAMES[1], UP_NAMES[UP_BITS], DOWN_NAMES[1], DOWN_NAMES[DOWN_BITS] }) do
        local ok, yes = pcall(API.exists, name)
        if not ok or not yes then return false end
    end
    return true
end

function M.Start(now)
    if S.started then return true end
    if not M.Available() then return false end
    S.who = (UnitGUID and UnitGUID("player")) or (UnitName and UnitName("player")) or nil
    Reset(now)
    S.started = true
    return true
end

function M.Send(text, onDone)
    if not S.started then return false end
    S.out[#S.out + 1] = { chunks = Chunk(text), onDone = onDone }
    S.nextTick = 0
    return true
end

function M.Busy() return S.started and (S.cur ~= nil or #S.out > 0) end
function M.Connected(now) return S.started and S.lastHeard ~= nil and (now - S.lastHeard) < 15 end
function M.Progress() if S.cur then return S.cur.idx, #S.cur.chunks end end

-- One step: re-read the helper's frame, handle acks, publish our frame.
function M.Tick(now)
    if not S.started or now < S.nextTick then return end
    if AddonList and AddonList.IsShown and AddonList:IsShown() then S.nextTick = now + 1; return end
    API.reset()
    local ack = ReadDown(now)
    local cur = S.cur
    if cur and ack == cur.seq then
        cur.idx = cur.idx + 1
        if cur.idx > #cur.chunks then
            S.cur = nil
            if cur.onDone then pcall(cur.onDone) end
        else
            cur.seq, cur.sentAt = NextSeq(), now
        end
        S.lastData = now
    elseif cur and now - cur.sentAt > RESEND then
        StartMessage(cur, now)                       -- helper restarted or frame lost: start over
    end
    if not S.cur and #S.out > 0 then StartMessage(table.remove(S.out, 1), now) end
    Publish(OutgoingFrame(), now)
    local busy = S.cur ~= nil or (now - S.lastData) < 2
    local interval = busy and 0.1 or (M.expecting and 0.25) or (S.lastHeard and 5 or 2)
    S.nextTick = now + interval
end

local driver = CreateFrame and CreateFrame("Frame")
if driver and driver.SetScript then
    driver:SetScript("OnUpdate", function()
        if S.started and GetTime then
            local ok, err = pcall(M.Tick, GetTime())
            if not ok and M.onError then M.onError(err) end
        end
    end)
end
