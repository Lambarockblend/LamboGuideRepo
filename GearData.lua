-- LamboGuide - GearData.lua
-- Data for the "is this item better than what I wear?" check (Gear.lua).
--
-- Every number and list here has a source; nothing is estimated:
-- * Stat priorities and conversions: Icy Veins WoW Forever stat priority pages,
--   one per spec, "Last Updated: Nov 4, 2026" (checked 2026-11-10):
--   https://www.icy-veins.com/wow-forever/<spec>-pve-stat-priority
--   Icy Veins says these are priorities, not fixed stat weights, so LamboGuide
--   does not turn them into a score. It only reports which priority stats an
--   item raises or lowers.
-- * Item class / subclass numbers and APIs: the game's own API documentation
--   (Blizzard_APIDocumentationGenerated, client 1.60.1), see Gear.lua.
-- * Stat keys from C_Item.GetItemStats are the game's ITEM_MOD_* global strings
--   (warcraft.wiki.gg API_C_Item.GetItemStats); keys are sorted into groups by
--   the stat word in their name, unknown keys are passed on as "other".

LamboGuideGearData = LamboGuideGearData or {}
local D = LamboGuideGearData

D.SOURCE = "Icy Veins WoW Forever stat priority pages (updated 2026-11-04)"

-- Key word -> stat group. Checked in this order, first match wins.
D.KEY_RULES = {
    { "DAMAGE_PER_SECOND", "dps" },
    { "RANGED_ATTACK_POWER", "rap" },
    { "FERAL_ATTACK_POWER", "feralap" },
    { "ATTACK_POWER", "ap" },
    { "ARMOR_PENETRATION", "armorpen" },
    { "SPELL_PENETRATION", "spellpen" },
    { "HEALING", "heal" },
    { "SPELL_POWER", "sp" },
    { "SPELL_DAMAGE", "sp" },
    { "MANA_REGENERATION", "mp5" },
    { "POWER_REGEN0", "mp5" },
    { "EXPERTISE", "expertise" },
    { "HASTE", "haste" },
    { "CRIT", "crit" },
    { "HIT", "hit" },
    { "DEFENSE", "def" },
    { "DODGE", "dodge" },
    { "PARRY", "parry" },
    { "BLOCK_VALUE", "blockvalue" },
    { "BLOCK", "block" },
    { "STRENGTH", "str" },
    { "AGILITY", "agi" },
    { "INTELLECT", "int" },
    { "SPIRIT", "spi" },
    { "STAMINA", "sta" },
    { "RESISTANCE0_NAME", "armor" },
    { "ARMOR", "armor" },
}

-- Priority entry (Icy Veins wording) -> how it is measured from the stat groups.
-- "conv": extra groups counted into the entry with a sourced factor.
-- "fallback": group used only when the item has none of the main groups.
D.ENTRIES = {
    ["Weapon Dps"]       = { groups = { "dps" } },
    ["Weapon Damage"]    = { groups = { "dps" } },
    ["Hit Chance"]       = { groups = { "hit" } },   -- one Hit stat for spells and melee (Enhancement page: "dual benefit of Hit")
    ["Expertise"]        = { groups = { "expertise" } },
    ["Critical Strike"]  = { groups = { "crit" } },
    ["Critical Strike Chance"] = { groups = { "crit" } },
    ["Strength"]         = { groups = { "str" } },
    ["Agility"]          = { groups = { "agi" } },
    ["Intellect"]        = { groups = { "int" } },
    ["Spirit"]           = { groups = { "spi" } },
    ["Mp5"]              = { groups = { "mp5" } },
    ["Spell Power"]      = { groups = { "sp" } },
    -- "While Spell Power increases both the damage of your spells and the healing of your spells,
    -- Healing Power only affects your healing spells." (Holy/Discipline Priest pages)
    -- Healer items that list healing also list spell power at 1/3 (Restoration Druid page), so
    -- spell power is only counted when the item has no healing stat.
    ["Healing Power"]    = { groups = { "heal" }, fallback = "sp" },
    ["Haste"]            = { groups = { "haste" } },
    ["Attack Power"]     = { groups = { "ap", "rap" } },
    ["Stamina"]          = { groups = { "sta" } },
    ["Armor"]            = { groups = { "armor" } },
    ["Defense"]          = { groups = { "def" } },
    ["Dodge"]            = { groups = { "dodge" } },
    ["Avoidance"]        = { groups = { "dodge", "parry" } },   -- "Avoidance means Dodge and Parry Chance" (Protection Warrior page)
    ["Spell Pierce"]     = { groups = { "spellpen" } },
    ["Weapon Skill"]     = { groups = {} },                     -- not an item stat key; cannot be read
}

-- Sourced conversions, per spec list (only where the page states them):
local AP_TO_STR = { from = "ap", into = "Strength", per = 2, note = "2 Attack Power per Strength" }
local FERAL_AP_TO_STR = { from = "feralap", into = "Strength", per = 2, note = "2 Attack Power per Strength" }

-- Class token -> talent trees in client tab order (C_SpecializationInfo index).
-- Each tree has one or more priority lists, in the order Icy Veins shows them.
D.CLASSES = {
    WARRIOR = { trees = {
        { name = "Arms", lists = { { key = "dps",
            prio = { "Weapon Dps", "Hit Chance", "Expertise", "Critical Strike", "Strength" },
            -- Page: "Compare Haste, Agility, Attack Power, and additional Hit Chance alongside
            -- Critical Strike and Strength rather than judging an item by a single stat."
            also = { "Haste", "Agility" }, conv = { AP_TO_STR } } } },
        { name = "Fury", lists = { { key = "dps",
            prio = { "Weapon Dps", "Hit Chance", "Expertise", "Critical Strike", "Strength" },
            -- Page: "Compare Haste, Agility, Attack Power, and additional Hit Chance alongside
            -- Critical Strike and Strength rather than judging an item by a single stat."
            also = { "Haste", "Agility" }, conv = { AP_TO_STR } } } },
        { name = "Protection", lists = {
            { key = "threat", kind = "melee", words = { "threat", "tehdit", "offensive" },
              prio = { "Expertise", "Hit Chance", "Agility", "Strength", "Stamina" }, conv = { AP_TO_STR } },
            { key = "defensive", words = { "defensive", "defans", "savunma", "survival" },
              prio = { "Stamina", "Armor", "Agility", "Avoidance", "Defense" } } } },
    } },
    PALADIN = { trees = {
        { name = "Holy", lists = { { key = "heal",
            prio = { "Healing Power", "Intellect", "Spirit", "Mp5", "Critical Strike" } } } },
        { name = "Protection", lists = { { key = "tank",
            prio = { "Stamina", "Defense", "Spell Power", "Intellect", "Strength" } } } },
        { name = "Retribution", lists = {
            { key = "unsealed", words = { "unsealed", "command", "fiziksel" },
              prio = { "Weapon Damage", "Hit Chance", "Expertise", "Strength", "Spell Power" }, conv = { AP_TO_STR } },
            { key = "holyshock", words = { "holyshock", "shock", "shockadin" },
              prio = { "Weapon Dps", "Hit Chance", "Spell Power", "Critical Strike", "Expertise" } } } },
    } },
    HUNTER = { trees = {
        { name = "Beast Mastery", lists = { { key = "dps",
            prio = { "Weapon Damage", "Hit Chance", "Critical Strike Chance", "Agility", "Attack Power" } } } },
        { name = "Marksmanship", lists = { { key = "dps",
            prio = { "Weapon Damage", "Hit Chance", "Critical Strike Chance", "Agility", "Attack Power" } } } },
        { name = "Survival", lists = { { key = "dps",
            prio = { "Weapon Damage", "Hit Chance", "Critical Strike Chance", "Agility", "Attack Power" } } } },
    } },
    ROGUE = { trees = {
        { name = "Assassination", lists = { { key = "dps",
            prio = { "Expertise", "Hit Chance", "Agility", "Weapon Damage", "Critical Strike" } } } },
        { name = "Combat", lists = { { key = "dps",
            prio = { "Expertise", "Hit Chance", "Agility", "Weapon Damage", "Critical Strike" } } } },
        { name = "Subtlety", lists = { { key = "dps",
            prio = { "Weapon Damage", "Expertise", "Hit Chance", "Weapon Skill", "Agility" } } } },
    } },
    PRIEST = { trees = {
        { name = "Discipline", lists = { { key = "heal",
            prio = { "Healing Power", "Mp5", "Spirit", "Intellect", "Critical Strike" } } } },
        { name = "Holy", lists = { { key = "heal",
            prio = { "Healing Power", "Mp5", "Spirit", "Intellect", "Critical Strike" } } } },
        { name = "Shadow", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Critical Strike", "Spell Pierce", "Spirit" } } } },
    } },
    SHAMAN = { trees = {
        { name = "Elemental", lists = { { key = "dps",
            prio = { "Spell Power", "Hit Chance", "Critical Strike", "Intellect", "Mp5" } } } },
        -- Page: "Weapon DPS is always your most valuable stat. Following that: Hit Chance, Expertise, ..."
        { name = "Enhancement", lists = { { key = "dps",
            prio = { "Weapon Dps", "Hit Chance", "Expertise", "Intellect", "Strength", "Spell Power" }, conv = { AP_TO_STR } } } },
        { name = "Restoration", lists = { { key = "heal",
            prio = { "Healing Power", "Critical Strike", "Intellect", "Spirit", "Mp5" } } } },
    } },
    MAGE = { trees = {
        { name = "Arcane", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Critical Strike", "Intellect", "Spirit", "Mp5" } } } },
        { name = "Fire", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Critical Strike", "Intellect", "Spirit", "Mp5" } } } },
        { name = "Frost", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Critical Strike", "Intellect", "Mp5", "Spirit" } } } },
    } },
    WARLOCK = { trees = {
        { name = "Affliction", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Critical Strike", "Haste", "Intellect" } } } },
        { name = "Demonology", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Critical Strike", "Haste", "Intellect" } } } },
        { name = "Destruction", lists = { { key = "dps",
            prio = { "Hit Chance", "Spell Power", "Haste", "Critical Strike", "Intellect" } } } },
    } },
    DRUID = { trees = {
        { name = "Balance", lists = { { key = "dps",
            prio = { "Hit Chance", "Critical Strike", "Spell Power", "Intellect" } } } },
        { name = "Feral Combat", lists = {
            { key = "cat", words = { "cat", "kedi", "dps", "threat" },
              prio = { "Weapon Dps", "Expertise", "Hit Chance", "Agility", "Strength" }, conv = { AP_TO_STR, FERAL_AP_TO_STR } },
            { key = "bear", words = { "bear", "ayi", "tank" },
              prio = { "Armor", "Defense", "Stamina", "Agility", "Dodge" } } } },
        { name = "Restoration", lists = { { key = "heal",
            prio = { "Healing Power", "Intellect", "Spirit", "Mp5", "Critical Strike" } } } },
    } },
}

-- Which combat rating table a list uses for Hit / Crit / Haste (melee, ranged or spell).
-- Item stats in Forever are ratings (in game: Devilsaur Gauntlets ITEM_MOD_CRIT_RATING_SHORT=14);
-- Gear.lua turns them into percent with the client's GetCombatRatingBonusForCombatRatingValue
-- for the player's own level, using the client's CR_* globals named here.
D.RATINGS = {
    hit   = { melee = "CR_HIT_MELEE", ranged = "CR_HIT_RANGED", spell = "CR_HIT_SPELL" },
    crit  = { melee = "CR_CRIT_MELEE", ranged = "CR_CRIT_RANGED", spell = "CR_CRIT_SPELL" },
    haste = { melee = "CR_HASTE_MELEE", ranged = "CR_HASTE_RANGED", spell = "CR_HASTE_SPELL" },
    expertise = "CR_EXPERTISE", dodge = "CR_DODGE", parry = "CR_PARRY", block = "CR_BLOCK",
    def = "CR_DEFENSE_SKILL",                  -- gives Defense skill points, not percent
}
local SPELL = {
    PALADIN = { Holy = true, Protection = true }, PRIEST = { Discipline = true, Holy = true, Shadow = true },
    SHAMAN = { Elemental = true, Restoration = true }, MAGE = { Arcane = true, Fire = true, Frost = true },
    WARLOCK = { Affliction = true, Demonology = true, Destruction = true }, DRUID = { Balance = true, Restoration = true },
}
for token, cls in pairs(D.CLASSES) do
    for _, tree in ipairs(cls.trees) do
        for _, list in ipairs(tree.lists) do
            if not list.kind then
                if (SPELL[token] and SPELL[token][tree.name]) or list.key == "holyshock" then list.kind = "spell"
                elseif token == "HUNTER" and tree.name ~= "Survival" then list.kind = "ranged"
                else list.kind = "melee" end
            end
        end
    end
end

-- Turkish names for the priority entries (English names are the Icy Veins wording).
D.ENTRY_TR = {
    ["Weapon Dps"] = "Silah DPS", ["Weapon Damage"] = "Silah hasarı", ["Hit Chance"] = "İsabet",
    ["Expertise"] = "Uzmanlık", ["Critical Strike"] = "Kritik", ["Critical Strike Chance"] = "Kritik",
    ["Strength"] = "Güç", ["Agility"] = "Çeviklik", ["Intellect"] = "Zeka", ["Spirit"] = "Ruh",
    ["Mp5"] = "Mp5", ["Spell Power"] = "Büyü gücü", ["Healing Power"] = "Şifa gücü", ["Haste"] = "Hız",
    ["Attack Power"] = "Saldırı gücü", ["Stamina"] = "Dayanıklılık", ["Armor"] = "Zırh", ["Defense"] = "Savunma",
    ["Dodge"] = "Sıyrılma", ["Avoidance"] = "Sıyrılma+Savuşturma", ["Spell Pierce"] = "Büyü delme",
    ["Weapon Skill"] = "Silah becerisi",
}

-- Equip location -> slot name(s) of the character frame (CharacterXxxSlot in the Forever UI).
-- The slot number is asked from the client with C_PaperDollInfo.GetInventorySlotInfo(name).
D.SLOTS = {
    INVTYPE_HEAD = { "HeadSlot" }, INVTYPE_NECK = { "NeckSlot" }, INVTYPE_SHOULDER = { "ShoulderSlot" },
    INVTYPE_CHEST = { "ChestSlot" }, INVTYPE_ROBE = { "ChestSlot" }, INVTYPE_WAIST = { "WaistSlot" },
    INVTYPE_LEGS = { "LegsSlot" }, INVTYPE_FEET = { "FeetSlot" }, INVTYPE_WRIST = { "WristSlot" },
    INVTYPE_HAND = { "HandsSlot" }, INVTYPE_FINGER = { "Finger0Slot", "Finger1Slot" },
    INVTYPE_TRINKET = { "Trinket0Slot", "Trinket1Slot" }, INVTYPE_CLOAK = { "BackSlot" },
    INVTYPE_WEAPON = { "MainHandSlot", "SecondaryHandSlot" }, INVTYPE_2HWEAPON = { "MainHandSlot" },
    INVTYPE_WEAPONMAINHAND = { "MainHandSlot" }, INVTYPE_WEAPONOFFHAND = { "SecondaryHandSlot" },
    INVTYPE_SHIELD = { "SecondaryHandSlot" }, INVTYPE_HOLDABLE = { "SecondaryHandSlot" },
    INVTYPE_RANGED = { "RangedSlot" }, INVTYPE_RANGEDRIGHT = { "RangedSlot" }, INVTYPE_THROWN = { "RangedSlot" },
    INVTYPE_RELIC = { "RangedSlot" },
}

D.SLOT_NAMES = {
    tr = { HeadSlot = "kafa", NeckSlot = "boyun", ShoulderSlot = "omuz", ChestSlot = "göğüs", WaistSlot = "bel",
           LegsSlot = "bacak", FeetSlot = "ayak", WristSlot = "bilek", HandsSlot = "eldiven", Finger0Slot = "yüzük",
           Finger1Slot = "yüzük", Trinket0Slot = "tılsım", Trinket1Slot = "tılsım", BackSlot = "pelerin",
           MainHandSlot = "ana el", SecondaryHandSlot = "yan el", RangedSlot = "menzilli" },
    en = { HeadSlot = "Head", NeckSlot = "Neck", ShoulderSlot = "Shoulder", ChestSlot = "Chest", WaistSlot = "Waist",
           LegsSlot = "Legs", FeetSlot = "Feet", WristSlot = "Wrist", HandsSlot = "Hands", Finger0Slot = "Ring",
           Finger1Slot = "Ring", Trinket0Slot = "Trinket", Trinket1Slot = "Trinket", BackSlot = "Back",
           MainHandSlot = "Main Hand", SecondaryHandSlot = "Off Hand", RangedSlot = "Ranged" },
}
