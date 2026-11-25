// rules-reference.js v2.1.3 - 2026-09-09
// v2.1.3: Fixed-bug — mentalPowers.ultimateSkill desc omitted the Other
//         Skills exclusions (Student, Heir to Fortune, Leadership are not
//         eligible; Professional and Mystic/Mental are excluded entirely).
//         The book’s own contrast (“considered Unearthly … as opposed to
//         modifying … +1 or +2CS”) is now in the desc: Ultimate Skill
//         replaces the talent’s own CS, it does not stack with it.
// v2.1.2: POISON_RULES no longer restates Judge rulings PR1-PR5 in prose;
//         the block points at the kernel ERRATA entries that now hold
//         them. Display strings unchanged.
// v2.1.1: TOXINS.spiderVenom Typical -> Excellent per the Judge's Book Intensity
//         Table (RULED 2026-09-05: a black widow is deadly).
// Canonical FASERIP rules reference. All mechanics data in one place.
// Source: Marvel Super Heroes (TSR) Advanced Set / Ultimate Powers Book.

// ── Canonical rank order (low → high) — derived from the kernel ────────────
import {
  RANKS as KERNEL_RANKS, rankByKey as kernelRankByKey,
  rankForNumber as kernelRankForNumber, shiftRank as kernelShiftRank,
  rankDistance as kernelRankDistance,
} from "../lib/faserip-rules/faserip-kernel.js";
import { initiativeModifier } from "../lib/faserip-rules/faserip-initiative.js";
import { kernelKeyFor } from "../kernel/adapter.js";

function hyphenName(key) {
  const r = kernelRankByKey(key);
  if (key === "SH0") return "Shift-0";
  if (["SHX", "SHY", "SHZ"].includes(key)) return r.name.replace(" ", "-");
  return r.name;
}

export const RANKS_ORDERED = KERNEL_RANKS.map(r => hyphenName(r.key));

// ── Rank → standard value (kernel standard rank numbers) ──────────────────
export const RANK_VALUES = Object.fromEntries(
  KERNEL_RANKS.map(r => [hyphenName(r.key), r.standard])
);

// Legacy alias — old code that imported RANKS as the values object
export const RANKS = RANK_VALUES;

// ── Rank ranges (kernel min/max; cosmic ranges per GM ruling 2026-08-31) ───
export const RANK_RANGES = Object.fromEntries(
  KERNEL_RANKS.filter(r => r.key !== "SH0")
    .map(r => [hyphenName(r.key), [r.min, r.max]])
);

// ── Rank abbreviations ─────────────────────────────────────────────────
export const RANK_ABBR = {
  "Shift-0": "Sh0", "Feeble": "Fe", "Poor": "Pr", "Typical": "Ty",
  "Good": "Gd", "Excellent": "Ex", "Remarkable": "Rm", "Incredible": "In",
  "Amazing": "Am", "Monstrous": "Mn", "Unearthly": "Un",
  "Shift-X": "ShX", "Shift-Y": "ShY", "Shift-Z": "ShZ",
  "Class 1000": "CL1000", "Class 3000": "CL3000", "Class 5000": "CL5000", "Beyond": "Bey"
};

// ── Aliases: space/no-separator variants → canonical hyphen form ─────────────
export const RANK_ALIASES = {
  "Shift 0": "Shift-0", "Shift0": "Shift-0",
  "Shift X": "Shift-X", "ShiftX": "Shift-X",
  "Shift Y": "Shift-Y", "ShiftY": "Shift-Y",
  "Shift Z": "Shift-Z", "ShiftZ": "Shift-Z",
  "Class1000": "Class 1000", "Class3000": "Class 3000", "Class5000": "Class 5000"
};

// ── Utility functions ────────────────────────────────────────────────────

/** Normalize any rank name variant to canonical hyphen form. */
export function normalizeRank(name) {
  if (!name) return "Shift-0";
  const s = String(name).trim();
  if (RANK_ALIASES[s]) return RANK_ALIASES[s];
  const key = kernelKeyFor(s);
  return key ? hyphenName(key) : s;
}

/** Get the standard numeric value for a rank name. */
export function rankValue(name) {
  if (!name) return 0;
  const n = normalizeRank(name);
  return RANK_VALUES[n] ?? CONFIG?.FASERIP?.rankValues?.[n] ?? 0;
}

/**
 * Numeric value safe to persist in a Foundry document. Beyond's standard
 * rank number is infinite, which JSON cannot store; persist this finite
 * sentinel instead. valueToRank maps it (and any non-finite value) back to
 * Beyond. Sheets should display the rank as Infinite/∞.
 */
export const BEYOND_STORAGE_SENTINEL = Number.MAX_SAFE_INTEGER;

export function rankValueForStorage(name) {
  const n = normalizeRank(name);
  const standard = RANK_VALUES[n];
  if (standard === Infinity) return BEYOND_STORAGE_SENTINEL;
  return Number.isFinite(standard) ? standard : 0;
}

/** Get the rank name for a numeric value per the kernel rank ranges
 *  (cosmic tiers per GM ruling 2026-08-31: Class 5000 is 5000+, Beyond is
 *  Infinity). 0 and below are Shift-0. */
export function valueToRank(val) {
  const v = Number(val) || 0;
  if (v <= 0) return "Shift-0";
  if (!Number.isFinite(v) || v >= BEYOND_STORAGE_SENTINEL) return "Beyond";
  return hyphenName(kernelRankForNumber(v).key);
}

/** Shift a rank name up/down by delta steps. Class 1000+ ranks cannot be shifted. Clamps to Shift-Z. */
export function shiftRank(name, delta) {
  const n = normalizeRank(name);
  const key = kernelKeyFor(n);
  if (!key) return n;
  if (kernelRankDistance("SHZ", key) > 0) return n; // Class 1000+ unshiftable
  return hyphenName(kernelShiftRank(key, delta).key);
}

/**
 * Plain rank-ladder movement — NOT a p.15 Universal Table column shift.
 * For operations that move a rank up or down the ladder itself: chargen
 * ability raises (Ability Modifier Table caps via min/max), vehicle stat
 * degradation (Class 1000+ speed CAN step down), etc. Defaults span the
 * full ladder except Beyond (Infinity is not reachable by stepping).
 */
export function stepRank(name, steps, { min = "Shift-0", max = "Class 5000" } = {}) {
  const n = normalizeRank(name);
  const i = RANKS_ORDERED.indexOf(n);
  if (i < 0) return n;
  const lo = Math.max(0, RANKS_ORDERED.indexOf(normalizeRank(min)));
  const hi = RANKS_ORDERED.indexOf(normalizeRank(max));
  const newI = Math.min(Math.max(i + steps, lo), hi >= 0 ? hi : RANKS_ORDERED.length - 1);
  return RANKS_ORDERED[newI];
}

/** Get the ordinal index of a rank (0-based). Returns 0 for unknown ranks. */
export function rankIndex(name) {
  const n = normalizeRank(name);
  const i = RANKS_ORDERED.indexOf(n);
  return i >= 0 ? i : 0;
}

/** Next rank above a damage total: { currentRank, nextRank, nextMin, bonus }, or null at the top of the ladder. */
export function getCombinedNextRank(damage) {
  const n = Number(damage) || 0;
  if (n <= 0) return null;
  const currentRank = valueToRank(n);
  const idx = RANKS_ORDERED.indexOf(currentRank);
  if (idx < 0 || idx >= RANKS_ORDERED.length - 1) return null;
  const nextRank = RANKS_ORDERED[idx + 1];
  const nextMin = RANK_RANGES[nextRank]?.[0] ?? rankValue(nextRank);
  if (!Number.isFinite(nextMin) || nextMin <= n) return null;
  return { currentRank, nextRank, nextMin, bonus: nextMin - n };
}

// Turn=6sec, 10 turns/min, 600 turns/hr
export const TIME = { turnSeconds: 6, turnsPerMinute: 10, turnsPerHour: 600 };

// Blunt weapon dmg (Slugfest / melee only):
//   = Str or material strength (whichever less);
//   if material > Str, use next rank minimum.
// Edged weapon (melee and thrown): always inflicts minimum listed dmg;
//   max of min(Str, material) for powerful wielders.
// Blunt Throwing: plain min(Str, material). No bump rule.

// Slammed into building = charging attack on that building.

// Kill result: attacker loses ALL Karma to 0.
// Energy attacks: only White causes dying (Green/Yellow/Red = No Effect).

// ── EFFECTS GATE ──
// Slam/Stun/Kill only apply if attacker inflicts some damage.
// Borderline: if damage equals armor (net 0 but real attack), effects still apply.
// Effects negated only when armor strictly exceeds damage (no damage possible).

// ── PULL PUNCH ──
// Blunt attacks: can reduce damage AND effect (Stun→Slam→Hit).
// Edged/Shooting/Energy: cannot reduce effect (Kill result stands). Energy can reduce damage.
// Thrown Edged: cannot reduce effect, can reduce damage.
// Thrown Blunt: can reduce both damage and effect.
// Force: can reduce damage, cannot reduce effect.

// ── RECOVERY & HEALING ──
export const RECOVERY = {
  // Recovery: 10 turns after last damage (no further damage), regain Endurance rank# HP (once/day)
  recoveryTurns: 10,
  recoveryFrequency: "once per day",
  // Healing: Endurance rank# HP per hour after last damage
  // Doubled by bedrest or medical care
  healingMultiplier: { normal: 1, bedrest: 2, medicalCare: 2 }
};

// ── BODY ARMOR & FORCE FIELDS ──
export const ARMOR = {
  bodyArmor: {
    reduction: "rank number",
    vsEnergy: -20,           // -20 vs Energy attacks
    notes: "Damage reduced to 0 = no Slam/Stun/Kill effects"
  },
  forceField: {
    vsEnergy: "full",        // Full protection vs Energy
    vsPhysical: -10,         // -10 vs physical
    overload: {
      personal: "System off, hero takes excess dmg, may be stunned/slammed",
      projected: "Psyche FEAT vs attack intensity or unconscious"
    }
  },
  stacking: "Use one or other, not both (unless FF projected by third party)"
};

// ── CHARGING (Endurance FEAT) ──
export const CHARGING = {
  requirement: "Must move 1+ area",
  csBonus: "+1CS per area moved (max +3CS, cap ShZ)",
  damage: "Endurance or Body Armor (whichever higher) + 2pts per area",
  rebound: "Damage absorbed by defender BA rebounds to attacker; attacker absorbs rebound with own BA. Formula: defender takes max(0, dmg - defBA); attacker takes max(0, min(dmg, defBA) - attBA). Stun/Slam effects still apply even when all damage is absorbed. Book example (Advanced Set): Gd End 10-speed (30 dmg) vs Ex BA (20) + Gd atk BA (10) → target takes 10 through + rebound 20 → attacker absorbs 10, takes 10.",
  inanimate: "Material strength = BA",
  missResult: "Continues half speed, may hit obstacle"
};

// Intuition modifier lookup — kernel initiative module (keys on rank
// NUMBER; the printed 51-75 / 75+ overlap resolves to 75 → +5).
export function getInitiativeModifier(intuitionValue) {
  return initiativeModifier(intuitionValue);
}

// ── FEAT DIFFICULTY ──
export const FEAT_DIFFICULTY = {
  // Intensity > Ability = red needed
  // Intensity = Ability = yellow needed
  // Ability > Intensity = green needed
  // Ability 3+ ranks above intensity = automatic success.
  // (GM ruling 2026-07-31: the Player's Book's "over 3 ranks" is a
  // misprint — contradicted later in the same book and verified as
  // "three or more ranks lower than the hero's Ability" in the Judge's
  // Book and published modules, e.g. After Midnight.)
  automatic: "Ability 3+ ranks above intensity",
  // Impossible FEATs (printed Optional Rule, adopted by GM ruling
  // 2026-07-31): any action more than one rank above the ability —
  // i.e. intensity 2+ ranks above — automatically fails, no roll.
  // Resource FEATs are ALWAYS limited this way (not optional).
  impossible: "Intensity 2+ ranks above ability",
  // Power Stunts:
  powerStunts: {
    neverTried: "red",
    upTo3Times: "yellow",
    threeOrMore: "green",
    tenOrMore: "automatic"
  }
};

// ── MOVEMENT ──
export const MOVEMENT = {
  groundSpeed: {
    "Feeble": 1,    // areas per turn
    "Poor": 2, "Typical": 2, "Good": 2, "Excellent": 2,
    "Remarkable": 3  // Rm+ = 3
  },
  actionsHalfSpeed: true,
  rangePenalty: {
    weapons: "-1CS per area beyond first",
    powers: "No penalty in rank range, -1CS per area beyond"
  },
  flight: {
    acceleration: "Endurance areas per round",
    altitude: "Each floor = 1 area of movement",
    diving: "+1 area per 3 floors dropped (cascades)",
    pullOut: "Agility FEAT",
    powerDive: "+4CS charging (flight only)"
  },
  movingTarget: {
    upTo5Areas: -1,
    upTo10Areas: -2,
    faster: -4
  }
};

// ── RESISTANCES ──
// Additional FEAT vs attack intensity, success = no dmg, fail = BA protection
// Claws: Power rank = dmg vs non-material, material strength = what they can cut
// Flight combat: can be slammed regardless of End

// ── ADVANCEMENT ──
export const ADVANCEMENT = {
  ability: { costPer1: "10x current rank number", cresting: 400 },
  resource: { costPer1: "10x rank number", cresting: 200 },
  popularity: {
    costPer1: "10x rank number", cresting: 0,
    requirement: "1 publicized charity act in past 3 weeks"
  },
  power: { costPer1: "20x rank number", cresting: 500 },
  powerAddition: { base: 3000, perRank: 40, robot: { base: 3000, perRank: 10 } },
  talentAddition: { fromNPC: 1000, fromPC: 2000 },
  contactAddition: { base: 500, perResourceRank: 10 },
  karmaPool: "Group Karma, cannot use for advancement, kill = pool to 0"
};

// ── RESOURCES ──
export const RESOURCES = {
  frequency: "1 FEAT per week",
  difficulty: {
    "3+ below": "automatic",
    "1-2 below": "green",
    "equal": "yellow",
    "above": "impossible (bank loan +1 rank)"
  },
  popularityFEAT: {
    friendly: "green",
    neutral: "yellow",
    unfriendly: "red",
    hostile: "impossible"
  },
  csModifiers: {
    targetBenefits: +2,
    danger: -3,
    goodValue: -1,
    remarkableValue: -2,
    wontReturn: -2,
    unique: -3
  },
  negativePop: "Always yellow",
  popChanges: {
    defeatVillain: +2, publicDefeat: -5, accused: "half",
    cleared: +10, media: -5, charity: +1, rescue: +2,
    mutant: "All Pop awards reduced by 1"
  }
};

// 1 RP ≈ $50–75
export const RESOURCE_PRICES = {
  vehicles: {
    "Bicycle": 4,
    "New Mini-Car": 60, "Used Mini-Car": 40,
    "New Mid-Size Car": 100, "Used Mid-Size Car": 80,
    "New Sports Car": 500, "Used Sports Car": 400,
    "New Luxury Car": 1000, "Used Luxury Car": 800,
    "Small Airplane": 400, "Small Jet": 2000,
    "Small Powerboat": 250, "Small Yacht": 500
  },
  travel: {
    "Bus Ticket": 2, "Train Ticket": 4,
    "Airplane Ticket (Transcontinental)": 10,
    "Airplane Ticket (Intercontinental)": 20
  },
  "rent (per month)": {
    "Efficiency Apartment": 4, "1 Bedroom Apartment": 8,
    "2 Bedroom Apartment": 16, "Luxury Apartment": 24,
    "One-Story House": 10, "Two-Story House": 20,
    "Mansion (per floor)": 40,
    "Office": 20, "Office Floor": 50,
    "Office Building (per floor)": 1000
  },
  "buy property": {
    "Efficiency Apartment": 600, "1 Bedroom Apartment": 900,
    "2 Bedroom Apartment": 1200, "Luxury Apartment": 2000,
    "One-Story House": 1300, "Two-Story House": 1800,
    "Mansion": 3000,
    "Empty Land (per acre)": 500,
    "Construction (per room)": 50
  },
  weapons: {
    "Knife": 1, "Handgun": 5, "Rifle": 8
  },
  equipment: {
    "Camera": 7,
    "Office Equipment (per room)": 75,
    "Electronic Equipment (per room)": 100,
    "Electrical Generator": 500,
    "Factory Equipment (per area)": 1000,
    "Fence (per area)": 20
  },
  personal: {
    "Clean Clothes": 2,
    "Formal Dress or Tuxedo": 6,
    "Expensive Night Out": 2
  }
};

// ── MATERIAL STRENGTH ──
export const MATERIAL_STRENGTH = {
  "Feeble": "cloth, glass",
  "Poor": "plastic, wood",
  "Typical": "rubber, soft metals, ice",
  "Good": "brick, aluminum",
  "Excellent": "concrete, iron, bulletproof glass",
  "Remarkable": "reinforced concrete, steel",
  "Incredible": "solid stone, vibranium",
  "Amazing": "osmium steel, granite, gems",
  "Monstrous": "diamond, super-heavy alloys",
  "Unearthly": "adamantium steel, enchanted",
  "Class 1000+": "virtually indestructible"
};
// Breaking: Str FEAT vs material, success = 2ft hole max
// <2" thick = -1 rank, 1-2ft = +1 rank, >2ft = +2 ranks

// ── UNIVERSAL TABLE ──
// The core resolution mechanic. Roll d100, cross-reference with rank column.
// Returns: "white", "green", "yellow", "red"
//
// Action Results Table — column headers with ability and color outcomes:
//   BA (Fighting):  W=Miss,  G=Hit,      Y=Slam,     R=Stun
//   EA (Fighting):  W=Miss,  G=Hit,      Y=Stun,     R=Kill
//   Sh (Agility):   W=Miss,  G=Hit,      Y=Bullseye, R=Kill
//   TE (Agility):   W=Miss,  G=Hit,      Y=Stun,     R=Kill
//   TB (Agility):   W=Miss,  G=Hit,      Y=Hit,      R=Stun
//   En (Agility):   W=Miss,  G=Hit,      Y=Bullseye, R=Kill
//   Fo (Agility):   W=Miss,  G=Hit,      Y=Bullseye, R=Stun
//   Gp (Strength):  W=Miss,  G=Miss,     Y=Partial,  R=Hold
//   Gb (Strength):  W=Miss,  G=Take,     Y=Grab,     R=Break
//   Es (Strength):  W=Miss,  G=Miss,     Y=Escape,   R=Reverse
//   Ch (Endurance): W=Miss,  G=Hit,      Y=Slam,     R=Stun
//   Do (Agility):   W=None,  G=-2CS,     Y=-4CS,     R=-6CS
//   Ev (Fighting):  W=Autohit, G=Evasion, Y=+1CS,    R=+2CS
//   Bl (Strength):  W=-6CS,  G=-4CS,     Y=-2CS,     R=+1CS
//   Ca (Agility):   W=Autohit, G=Miss,   Y=Damage,   R=Catch
//   St (Endurance): W=1-10,  G=1,        Y=No,       R=No
//   Sl (Endurance): W=Gr.Slam, G=1 area, Y=Stagger,  R=No
//   Ki (Endurance): W=En.Loss, G=E/S,    Y=No,       R=No

// The Universal Table grid itself lives in modules/dice/universal-table.js
// (rank rows verified against the published chart; see its v1.2.0/v1.3.0
// changelog). A corrupted duplicate grid and lookupUniversalTable() were
// removed from this file in v1.3.0 — resolve rolls via
// game.msh.rollUniversalTable / action-utils.universalColor().

// ══════════════════════════════════════════════════════════════
// EQUIPMENT: WEAPONS
// ══════════════════════════════════════════════════════════════
// Range: max range in areas (numeric, per printed table). -1CS per area beyond
//   the first for weapons (not powers). Missile launcher range varies by missile.
// Price: Resource rank to meet/beat on Resource FEAT (the rank-letter column;
//   prose anchor: Concussion Pistol listed at Incredible).
// Black market: +1CS cost. Illegal items = Other Crime to possess.
// Rate: shots per round. "burst" = up to 3 adjacent targets, 1 roll.
//   "scatter" = all in 1 area of target hit.
// Shots: rounds before reload (1 round to reload; Bow talent may negate).
// Damage: standard ammo. Stun weapons have Intensity instead.
// Type: S=Shooting, E=Energy, F=Force column on Universal Table.

// Melee damage rules:
// Blunt Attack: damage = Str or material strength (whichever less).
//   If material > Str, use next rank minimum value.
// Edged Attack with combat weapon: always inflicts minimum listed damage.
//   Powerful character may inflict up to Str or material strength (whichever less).
// Weapon vs higher material: Breaking FEAT — compare material vs wielder Str or target BA.

export const AMMUNITION = {
  standard: {
    handguns: { cost: "Fe", rounds: 50 },
    rifles: { cost: "Fe", rounds: 50 },
    assaultRifle: { cost: "Fe", rounds: 30 },
    automaticRifle: { cost: "Fe", rounds: "20 (1 clip)" },
    subMachineGun: { cost: "Fe", rounds: "7 (1 clip)" },
    machineGun: { cost: "Pr", rounds: "20 (1 clip)" },
    shotgun: { cost: "Fe", rounds: 10 },
    bazooka: { cost: "Fe", rounds: 1 },
    law: { cost: "Fe", rounds: 1 },
    lightArtillery: { cost: "Pr", rounds: 1 },
    heavyArtillery: { cost: "Ty", rounds: 1 },
    superHeavy: { cost: "Gd", rounds: 1 }
  },
  powerPack: {
    pistol: { cost: "Ty" }, rifle: { cost: "Gd" }, cannon: { cost: "Ex" }
  },
  mercy: {
    // Rm Intensity KO drug on skin. KO 1-10 rounds if bullet penetrates.
    handgun: { cost: "Fe", rounds: 10 },
    rifle: { cost: "Fe", rounds: 10 },
    assaultRifle: { cost: "Fe", rounds: 5 },
    automaticRifle: { cost: "Ty", rounds: "20 (1 clip)" }
  },
  ap: {
    // Reduce target Body Armor by 2CS. No effect on force fields.
    handgun: { cost: "Fe", rounds: 10 },
    sniperRifle: { cost: "Fe", rounds: 10 },
    lawBazooka: { cost: "Fe", rounds: 1 }
  },
  rubber: {
    // Slugfest damage instead of shooting. Ignore Slam results.
    handgun: { cost: "Fe", rounds: 40 },
    rifle: { cost: "Fe", rounds: 40 }
  },
  explosive: {
    // 2x normal damage. If burst/scatter, all in area affected.
    handgun: { cost: "Ty", rounds: 10 },
    rifle: { cost: "Ty", rounds: 10 },
    bazooka: { cost: "Gd", rounds: 1 }
  },
  canister: {
    // Gas(In tear gas), KO(Rm KO gas), Smoke(Ex), Explosive(2x target/1x adjacent), Incendiary(fire 1-10 rnd)
    lawBazookaRiot: { cost: "Gd", rounds: 1 },
    lightArtillery: { cost: "Gd", rounds: 1 },
    heavyArtillery: { cost: "Ex", rounds: 1 },
    superHeavy: { cost: "Rm", rounds: 1 }
  },
  gyroJet: {
    standard: { cost: "Pr", rounds: 5 },
    explosive: { cost: "Pr", rounds: 1 },
    heatSeeker: { cost: "Pr", rounds: 1 },
    explosiveHS: { cost: "Gd", rounds: 1 }
  }
};

// ── WEAPON RULES SUMMARY ──
// Range penalty: -1CS per area beyond first (weapons only, not powers).
// Bursts: up to 3 adjacent targets, single roll.
// Scatter: all in 1 area of target hit.
// Two-handed: fire one-handed at -2CS (unless noted).
// Bows/Crossbows: -1CS without Bow talent.
// Reload: 1 round (Bow talent may negate).
// Power packs: stun/concussion/laser weapons. Cannot use other ammo.
// Stun: Endurance FEAT vs Intensity or KO 1-10 turns.

// ══════════════════════════════════════════════════════════════
// HEADQUARTERS & BASE OPERATIONS
// ══════════════════════════════════════════════════════════════
// Heroes may rent, buy, or build HQs. Buildings defined by size, cost
// (rent/buy), and material strength. Room packages outfit the interior.


// Magic in FASERIP duplicates super-human Powers from a magical base.
// Power ranks generated normally = Spell rank.
// Casting uses Psyche to determine success; effects use Power rank.
// Example: Ex Psyche + Rm Mind Control → cast on Ex column, Rm Intensity to break.

// ── MAGICAL POWERS BY ENERGY TYPE ──
export const MAGIC_POWERS = {
  personal: {
    resistances: ["Gold", "Corrosives", "Disease", "Electricity", "Emotion Attacks", "Fire/Heat", "Radiation", "Toxins"],
    senses: ["Combat Sense", "Enhanced Senses", "Infravision", "Protected Senses",
             "Astral Detection", "Emotion Detection", "Energy Detection", "Magic Detection",
             "Magnetic Detection", "Psionic Detection", "Tracking Ability"],
    bodyAlterationsDefensive: ["Absorption", "Body Armor", "Healing", "Pheromones", "Recovery"],
    mental: ["Astral Projection", "Emotion Control", "Empathy", "Mental Probe",
             "Mind Control", "Postcognition", "Psi-Screen", "Psionic Attack", "Telepathy"],
    bodyControl: ["Blending", "Imitation", "Invisibility", "Shape-Shifting"],
    movement: ["Flight", "Gliding", "Levitation", "Lightning Speed", "Swimming"]
  },
  universal: {
    matterControl: ["Air Control", "Earth Control", "Fire Control", "Water Control",
                    "Weather Control", "Density Manipulation"],
    senses: ["Astral Detection", "Emotion Detection", "Energy Detection", "Magic Detection",
             "Magnetic Detection", "Psionic Detection", "Combat Sense", "Cosmic Awareness",
             "Enhanced Senses", "Infravision", "Protected Senses", "Tracking Ability"],
    energyControl: ["Electrical Manipulation", "Gravity Manipulation", "Light Manipulation",
                    "Magnetic Manipulation", "Sound Manipulation", "Energy Reflection"],
    mental: ["Animal Control/Communication", "Animal Empathy", "Animate Drawings",
             "Emotion Control", "Force Field Generation", "Image Generation",
             "Mind Control", "Precognition", "Psi-Screen", "Telekinesis", "Transferal"],
    distanceAttacks: ["Corrosive Missiles", "Ensnaring Missiles", "Nullifier Missiles",
                      "Projectile Missiles", "Slashing Missiles", "Stunning Missiles",
                      "Ice Generation", "Fire Generation", "Energy Generation", "Sound Generation"],
    movement: ["Climbing", "Digging", "Flight", "Gliding", "Leaping",
               "Lightning Speed", "Teleportation", "Swimming", "Wall-Crawling"],
    resistances: ["Cold", "Electricity", "Energy Attacks", "Fire/Heat", "Mental Attacks", "Radiation"],
    bodyAlterationsOffensive: ["Blinding Touch", "Corrosive Touch", "Energy Touch", "Health-Drain Touch",
                    "Paralyzing Touch", "Rotting Touch", "Claws", "Extra Attacks", "Extra Body Parts"],
    bodyAlterationsDefensive: ["Absorption", "Damage Transfer", "Healing", "Recovery", "Regeneration", "Water Breathing"],
    bodyControl: ["Animal Transformation (Self)", "Animal Transformation (Others)", "Blending",
                  "Body Transformation (Self)", "Body Transformation (Others)",
                  "Density Manipulation (Self)", "Elongation", "Growth", "Imitation",
                  "Invisibility", "Phasing", "Plasticity", "Power Absorption", "Shape-Shifting", "Shrinking"]
  },
  dimensional: {
    // Entities commonly entreated listed in parentheses
    resistances: ["Magical Attacks (Satannish, Oshtur)", "Invulnerability (Various)"],
    senses: ["Astral Detection (Various)", "Cosmic Awareness (Aggamotto)",
             "Enhanced Senses (Aggamotto, Nirvalon)", "Magic Detection (Various)",
             "Psionic Detection (Various)", "Tracking Ability (Various)"],
    movement: ["Climbing", "Digging", "Dimensional Travel (Hoggoth, Seraphim)",
               "Flight (Seraphim, Elemental Spirits)", "Leaping", "Lightning Speed (Watoomb)",
               "Swimming (Elemental Spirits)", "Teleportation (Watoomb)", "Wall-Crawling"],
    matterControl: ["Air Control (Vaitorr, Watoomb, Elemental Spirits)",
                    "Earth Control (Elemental Spirits)", "Fire Control (Faltine, Elemental Spirits)",
                    "Water Control (Munnopor, Elemental Spirits)",
                    "Weather Control (Munnopor, Satannish, Elemental Spirits)",
                    "Density Manipulation"],
    bodyControl: ["Animal Transformation", "Body Transformation", "Blending (Ikonn)",
                  "Growth", "Phasing", "Shrinking", "Shape-Shifting"],
    energyControl: ["Time Control", "Nullifying Power (Amtor)", "Darkforce Manipulation (Darkforce Dimension)",
                    "Light Manipulation (Nirvalon, Seraphim)", "Probability Manipulation"],
    distanceAttacks: ["Darkforce Generation (Darkforce Dimension)",
                      "Energy Generation (Seraphim, Faltine, Oshtur, Balthakk)",
                      "Fire Generation (Faltine, Falroth, Elemental Spirits)",
                      "Ice Generation (Ikthalon)", "Sound Generation",
                      "Corrosive Missile (Bromagdon)", "Ensnaring Missile (Raggadorr, Cytorrak, Dyzakk)",
                      "Nullifier Missile", "Projectile Missile (Denak, Daveroth)",
                      "Slashing Missile (Denak, Cyndriarr, Hoggoth)", "Stunning Missile"],
    mental: ["Animal Communication/Control (Set for reptiles)",
             "Animate Drawings (Ikonn)", "Emotion Control (D'Spayre, Nirvalon)",
             "Force Field Generation (Cytorrak, Seraphim)", "Image Generation (Ikonn)",
             "Mind Control (Nightmare, Munnopor)", "Possession", "Postcognition",
             "Precognition (Aggamotto)", "Telekinesis", "Ultimate Skill"],
    bodyAlterationsDefensive: ["Body Armor (Seraphim)", "Extra Body Parts",
                    "Immortality (Various, always exacting a high price)", "Life Support"]
  }
};

// ── MYSTICAL ORIGIN ──
// Talent that indicates potential to wield magic.
// Requires: Good Psyche minimum to pursue magical training.
// Must seek out a master (NPC, Judge controls availability).
// Without training: may still use for Reason FEATs involving arcane lore.

// ── SPELL EFFECTS TABLE ──
// Determines duration, area, and damage based on spell Power rank.
// Mage may always choose less than listed values.
export const SPELL_EFFECTS = {
  //                    Sh0      Fe       Pr       Ty       Gd       Ex        Rm        In        Am         Mn          Un          ShX         ShY         ShZ         CL1000      CL3000      CL5000      Beyond
  duration:          ["None", "1 round","1 round","1 round","1 round","1 minute","1 hour", "1 day",  "1 month", "1 year",  "Perm.",   "Perm.",   "Perm.",   "Perm.",   "Perm.",   "Perm.",   "Perm.",   "Perm."],
  areaOfEffect:      ["None", "Touch",  "Touch",  "Touch",  "Same Area","1 Area","2 Areas","5 Areas","12 Areas","1 sq.mi.","10 sq.mi.","1 planet","1 planet","1 planet","1 dimen.","1 dimen.","5 dimen.","ALL"],
  standardDamage:    [0,       2,        4,        6,        10,       20,       30,       40,       50,        75,        100,       150,       200,       500,       1000,      3000,      5000,      Infinity]
};
// Rank index order matches RANKS_ORDERED (0=Sh0 through 17=Beyond).

// ══════════════════════════════════════════════════════════════
// HARDWARE: BUILDING, MODIFYING, & ALIEN TECHNOLOGY
// ══════════════════════════════════════════════════════════════

// ── ALIEN / UNFAMILIAR TECHNOLOGY ──
// Using another hero's hi-tech devices: Green Reason FEAT or wrong button/system.
//   Failure: -1CS or -2CS to hit/effectiveness, or system damage.
// Alien tech first encounter: Reason FEAT vs Remarkable Intensity.
//   Once passed, normal use. New FEAT only for stunts.

// ── EFFECTIVE COST CALCULATION ──
// Base: highest applicable rank number.
//   Each applicable rank EQUAL to highest: +2CS
//   Each applicable rank ONE BELOW highest: +1CS
//   Ranks 2+ below: no effect
//
// Applicable ranks by item type:
//   Weapons: Damage (or Intensity for stun), Range, Material Strength
//   Vehicles: Control, Speed, Body, Protection
//   Power Suits: modified abilities (final stats), material strength or Body Armor (higher)
//   Robots: all listed abilities + Power ranks
//   Other: material strength + Power ranks involved

// ── SPECIAL REQUIREMENTS ──
// Effective cost < Remarkable: rarely needs special requirement.
// Effective cost Remarkable+: may have one special requirement.
// Effective cost Monstrous+: always at least one special requirement.
// Types: specific circuit, secondary invention, new production method,
//        special alloy/substance, existing device as model.

// ── RESOURCE FEAT & BUILDING TIME ──
// Resource FEAT to afford (single character, combined if within 1 rank, or via Contacts).
// Failed FEAT: may retry next week.
// Time = effective cost rank number in DAYS (Ty=6 days, Un=100 days).
// Time modifiers:
//   Lab assistant: time halved
//   Assistant Reason within 1 rank of inventor: time quartered
//   Working straight through: time halved again (but -1CS on success roll)
//   NPC-built (from hero's designs): always maximum time
// Hero may only work on one project at a time.

// ── KIT-BASHING ──
// Emergency rapid construction. 10 Karma = 1 day compressed to 1 round.
// Example: Mn(75) effective cost = 75 days normal, or 75 rounds for 750 Karma.
// Can rush partial completion: remaining days × 10 Karma = remaining rounds.
// Kit-bashed devices: Reason FEAT to succeed, operates 1-10 rounds then inoperative.
// Salvaging pieces grants bonus on future FEAT to duplicate.
// Karma sources: personal, pools, advancement funds, allies assisting.

// ── MODIFICATION ──
// One modification at a time. Abilities improved one rank at a time.
// Effective cost = new ability rank.
// Adding abilities the device didn't have:
//   Easy install (e.g., artillery to tank): Ty effective cost
//   Requires device modification (e.g., flight to car): new power rank, min Good
//   Unreproducible tech: Monstrous minimum
// Time and success as for invention. Failure may damage original device.
// Modifications may be kit-bashed.

// ── PROGRAMMING & REPROGRAMMING ──
// Computers: Reason = information breadth + accessibility.
//   Restriction rank (usually Excellent, sensitive = Rm+).
//   Access: Green Reason FEAT if passwords known, Red if not.
// Robots: reprogram with Reason FEAT. Time = restriction rank number in turns.

// ══════════════════════════════════════════════════════════════
// POWERS
// ══════════════════════════════════════════════════════════════
// Power ranks determine effectiveness. Powers may be inborn, technological, or magical.
// Power Stunts: 100 Karma to attempt (10 for mage personal/universal, 50 dimensional).
//   Never tried=red, up to 3 times=yellow, 3+=green, 10+=automatic.

export const POWERS = {

  // ── RESISTANCES ──
  resistances: {
    fireHeat:    { desc: "Reduce fire/heat damage by rank#. Fire < rank has no effect." },
    cold:        { desc: "Reduce cold damage by rank#. Cold/ice < rank ignored. Physical ice items still affect." },
    electricity: { desc: "Reduce electrical damage by rank#. < rank ignored. Choose conductive or non-conductive." },
    radiation:   { desc: "Reduce radiation damage by rank#. Non-concussive energy rays reduced. < rank no effect." },
    toxins:      { desc: "Min rank = Endurance +1CS. Use instead of End for poison FEATs. Failing FEAT: End drops 1 rank but this Power doesn't." },
    corrosives:  { desc: "Reduce acid/caustic damage by rank#. < rank ignored. Includes rust, rot, salt, microbes." },
    emotion:     { desc: "Min rank = Intuition +1CS. Emotion/illusion/dominance attacks must overcome this rank." },
    mental:      { desc: "Min rank = Psyche +1CS. Vs psionic (not magical) attacks on Psyche." },
    magical:     { desc: "Vs magical/extra-dimensional Psyche attacks. Reduces magical damage by rank#. May be lower than Psyche." },
    disease:     { desc: "Min rank = Endurance +1CS. Includes common disease, biological warfare, vampirism." },
    invulnerability: { desc: "Class 1000 resistance to chosen form. Counts as 2 Power slots. Additional resistances may be upgraded to invulnerability at no extra cost." }
  },

  // ── SENSES ──
  senses: {
    protectedSenses:  { desc: "One+ senses protected. Ignore damaging attacks < rank Intensity." },
    enhancedSenses:   { desc: "One+ of 5 senses at rank level. Use for clues/initiative. Vulnerable: attacks at +1CS." },
    infravision:      { desc: "See in dark, 5 area range. Darkness > rank: sight limited to 2ft." },
    cosmicAwareness:  { desc: "Perceive Class 1000+ entities within 10mi. FEAT: +1CS vs opponent by finding weakness." },
    combatSense:      { desc: "Min = Intuition. Use instead of Int(surprise), Fight(block), Agi(dodge), Str(escape)." },
    computerLinks:    { desc: "Communicate/retrieve from computers at rank. Break in: compare rank vs computer Reason." },
    emotionDetection: { desc: "Detect emotional state at rank. Target conceals with Intuition as Intensity." },
    energyDetection:  { desc: "Identify energy type and track energy trails at rank per hour." },
    magicDetection:   { desc: "FEAT: W=fail, G=magic present, Y=individuals involved, R=type of spell." },
    magneticDetection:{ desc: "Detect Earth's magnetic field and aberrations at rank. Hard to get lost." },
    mutantDetection:  { desc: "Detect mutant mental radiation at Power rank range." },
    psionicDetection: { desc: "Detect paranormal mental abilities in use. G=specifically checking, Y=not paying attention." },
    astralDetection:  { desc: "Automatic: always know astral form nearby. FEAT to identify features." },
    trackingAbility:  { desc: "FEAT to catch track, then only when chance of losing (environment-dependent)." }
  },

  // ── MOVEMENT ──
  movement: {
    flight:           { desc: "Air movement at rank speed. Agi for maneuvers. Wind > rank: lose altitude. +1 area per 15ft drop, -1 area per 30ft climb." },
    gliding:          { desc: "Drop 1 story/turn, rank speed horizontal. Agi FEAT to maintain level. Wind > rank: halt/push back." },
    leaping:          { desc: "Min = Strength +1CS. Use leaping table replacing Str with rank." },
    wallCrawling:     { desc: "Move on vertical/inverted surfaces. Rank = adhesion strength vs surface slipperiness." },
    lightningSpeed:   { desc: "Min = Endurance +1CS. Move as vehicle at rank speed. Turn at max without penalty. Full accel/decel in 1 round/area." },
    teleportation:    { desc: "Instant movement. FEAT or disoriented (no action next round). Carry touched/area up to Str. Passengers: G End FEAT or disoriented 1-10rnd. Into solid: End FEAT or 2x material dmg." },
    levitation:       { desc: "Vertical movement, rank as speed in stories. Immune to wind. Horizontal by pushing off surfaces." },
    swimming:         { desc: "Water movement at rank speed. Doesn't negate breathing. Bonus: Water Breathing." },
    climbing:         { desc: "Scale vertical (not inverted) at rank speed. Move through tangles using rank instead of Agi." },
    digging:          { desc: "Tunnel at vehicle speed. Half if leaving supported tunnel. Dig through material < rank only. Bonus: Claws." },
    dimensionalTravel:{ desc: "Break into other dimensions. Auto unless pressed (FEAT). Specific dimension = Power Stunt. Start with 1 destination. Specific location = Red FEAT. Return home = Yellow FEAT." }
  },

  // ── MATTER CONTROL ──
  matterControl: {
    earthControl:    { desc: "Manipulate natural/semi-natural mineral (dirt, rock, concrete, glass). Not steel/vehicles/living. Rank as Str for amount/round. Stunts: dig, earthquake, earth beings, transport, levitate, entrap." },
    airControl:      { desc: "Manipulate air/wind. Shield vs physical missiles at rank. Air weapon at rank dmg (blocked by FF). Generate winds at rank Intensity. Start with 1 stunt: flight, weather, lightning, reduce weather." },
    fireControl:     { desc: "Control existing fire. Intensify/reduce by rank. Fiery shield at rank dmg. Stunts: fire missiles, fire shapes, entrap, heat control, absorb fire." },
    waterControl:    { desc: "Use water as missile (rank dmg, 1 area). Water shield reduces energy/force/fire by rank. Stunts: water servants, speed ships, air bubbles, fog, storms, melt ice." },
    weatherControl:  { desc: "Manipulate weather. Stunts cost 50 Karma (not 100). Start with no stunts. Options: fog, storms, winds/tornadoes, lightning, lower/raise temp, detect weather 3 days, reduce effects." },
    animateObjects:  { desc: "Inanimate objects move/attack. Animated: material str as Str/End, rank as Agi/Fight. Health = material str. Cannot animate > rank material or > liftable weight." },
    densityOthers:   { desc: "Alter target density on touch. Psyche/End FEAT to resist. Reduction: -rank physical attacks both ways, 1-10 rnd. Increase: End FEAT/rnd or unconscious, then End loss." },
    bodyTransOthers: { desc: "Convert living tissue to one chosen material on touch. Psyche/End FEAT to resist. Duration up to 1hr. Target has material str of substance. -2CS to affect non-living too." },
    animalTransOthers:{ desc: "Transform humans to animals on touch. Psyche/End FEAT to resist. Target gets animal FASE, keeps RIP. Flesh-to-flesh. Inborn Powers retained." }
  },

  // ── ENERGY CONTROL ──
  energyControl: {
    magneticManip:   { desc: "Move/control metallic objects at rank size/range/ability. Stunts: flight(-3CS), shock touch(-1CS), non-ferrous metals, non-metallic, scramble machines, affect sentient robots(+1CS), field detection(-1CS)." },
    electricalManip: { desc: "Control electricity. Resistance to electrical = rank. Stunts: heal via absorption, absorb(-2CS), conduct(-2CS), ride power lines, store+shock touch." },
    lightManip:      { desc: "Generate/manipulate light at rank Intensity. Burst(area) or line(single). Blinds, no damage. Stunts: darken/intensify, illusions(-3CS), hypnosis(-2CS), laser(-2CS)." },
    soundManip:      { desc: "Dampen/increase noise by rank. Reduce sonic attacks by rank. Bonus: Sound Generation in next slot." },
    darkforceManip:  { desc: "Manipulate Darkforce. 1 stunt at start. Options: flight(-1CS), weapon(-1CS), shapes(rank material), teleport(-2CS), darkness(rank, 3 areas, concentration)." },
    gravityManip:    { desc: "Alter gravity. 1 stunt at start. Options: flight(-2CS), levitate(-1CS), levitate others(-1CS, Agi FEAT), reduce weight, increase weight. Lasts while concentrating or 5 rounds." },
    probabilityManip:{ desc: "Alter dice. Bad Luck(01-50): low die=tens. Good Luck(51-90): high die=tens. Both(91-00). Must take limitation. Good=self only, Bad=vs attackers." },
    nullifyingPower: { desc: "Negate inborn Powers at rank. Not tech/magic. End FEAT or lose powers while in range/1-10rnd. Affects all in range. Cannot use own inborn powers while active." },
    energyReflection:{ desc: "Invulnerability to one energy type up to Un. Reflect in same round at rank range, Agi FEAT to hit. >Un: reflect 100, take remainder." },
    timeControl:     { desc: "Counts as 2 Powers + automatic limitation. All stunts developed separately. Options: lightning speed, slow area(multiple attacks), slow for injured, time travel, summon duplicates." }
  },

  // ── BODY CONTROL ──
  bodyControl: {
    growth:          { desc: "Grow taller. Use rank instead of Str. +CS to be hit: Fe-Gd=+1, Rm-Am=+2, Mn+=+3. Permanent option: +1 rank but fixed size." },
    shrinking:       { desc: "Shrink, retain Str. CS modifier vs larger foes: Gd-Ex=1, Rm-In=2, Mn-Un=3. ShX+ crosses Pym barrier into Microverse." },
    densitySelf:     { desc: "Alter mass Sh0 to rank. BA = current rank. Charging at rank. Sh0: immune to physical, not energy/force. High density > End: -1CS Fight/Agi." },
    phasing:         { desc: "Out of phase with matter. Immune to physical/most energy. Pass through material < rank. FF < rank: green FEAT. Disrupts electronics. Duration = breath holding." },
    invisibility:    { desc: "Invisible to normal sight. Still has mass. Stunts: others on touch, others at range, make invisible visible, partial, extend to heat/UV." },
    plasticity:      { desc: "Elastic/malleable body. BA = rank. Bonus: Elongation. Stunts: catch falling(rank as Agi), disguise(-2CS), bounce(leaping at -1CS)." },
    elongation:      { desc: "Extend body/limbs. Attack non-adjacent. Target can only hit attacking part (no Kill/Stun/Slam on part). Range: up to rank# yards." },
    shapeShifting:   { desc: "Modify shape to resemble objects/beings. FEAT vs target's highest of Rea/Int/Psy. Half to 1.5x original size. Visible physical powers only. Stunts: claws, glide(-2CS), material BA." },
    imitation:       { desc: "Specialized shape-shifting for humanoid forms. Duplicate appearance/voice/mannerisms. FEAT vs target's lowest of Rea/Int/Psy. May use target's Popularity." },
    bodyTransSelf:   { desc: "Transform to chosen material. BA = material str or rank (lower). Special functions of material. +1CS if limited to one state, +2CS if limited to specific substance." },
    animalTransSelf: { desc: "Assume animal form with animal's Powers. Weight/height of normal animal. FEAT to transform (auto if single animal). Other Powers lost in animal form." },
    raiseLowestAbility:{ desc: "Raise lowest ability by 20 points. Not a true Power. Then choose next Power from full list." },
    blending:        { desc: "Camouflage. Hidden at rank until movement/action. Limitation(night only, forest only, etc): +2CS instead of standard +1CS." },
    powerAbsorption: { desc: "Acquire others' Powers on touch. Psyche/End FEAT to resist. Max acquired rank = this Power rank. Only inborn powers. 1 Power at start, more as stunts. Target loses absorbed Power." },
    alterEgo:        { desc: "Separate normal persona. Normal Folks abilities. No Powers. Contacts split. Popularity split. Karma separate. Instant transformation." }
  },

  // ── DISTANCE ATTACKS ──
  distanceAttacks: {
    projectileMissile: { desc: "Specialized ranged weapon. Shooting column. No range penalty for hero. Rank range/damage. Agi to hit." },
    ensnaringMissile:  { desc: "Grappling attack at range. Agi FEAT to hit. Entangle = rank Str grapple, rank material strength." },
    iceGeneration:     { desc: "Draw water from air, form ice missiles. Rank range/damage. BT or ET column. 1 stunt at start. Stunts: entrap, BA(-1CS), shapes(-1CS), ice ramp(-1CS speed), slick spots, cold waves, absorb cold." },
    fireGeneration:    { desc: "Project flame. Rank range/damage. Energy column. 1 stunt at start. Stunts: fire shield, body transform(-2CS), fire images(-1CS), control fire(-2CS), absorb fire, project heat(-1CS)." },
    energyGeneration:  { desc: "Force bolts. Energy or Force damage (one at start, other as stunt). Rank range/damage. Agi to hit. May pull punch." },
    soundGeneration:   { desc: "Sonic attacks. Force column. Rank range/damage. Single target. Stunts: wide-band(-1CS area), stun(-1CS), flight(-2CS/-1CS with glider), sonic walls(-1CS), absorb(-1CS), holo illusions(-2CS/-3CS dmg)." },
    stunningMissile:   { desc: "Force column damage OR rank Intensity stun (choose one, other as stunt). Rank range." },
    corrosiveMissile:  { desc: "Acid/corrosive attack. Rank dmg round 1, -2CS round 2, -4CS round 3. Wash to halt. Cannot reduce damage. Burns through material < rank on FEAT." },
    slashingMissile:   { desc: "Throwing Edged column. Cannot reduce effect. Rank damage/range. Stunt: Blunt Throwing column." },
    nullifierMissile:  { desc: "No damage. Nullify inborn OR tech Powers at rank Intensity while concentrating. 1 target. Target: Psyche(inborn) or Reason(tech) FEAT each round to break." },
    darkforceGen:      { desc: "Darkforce weapon: rank damage OR rank stun, 1-10 rnd. All Darkforce Manip stunts except teleportation. Extra stunt: create darkness (rank, 3 areas)." }
  },

  // ── MENTAL POWERS ──
  mentalPowers: {
    ultimateSkill:   { desc: "Pick one Weapon, Fighting, Scientific, or Other Skill (not Student, Heir to Fortune, Leadership) and its ability becomes Unearthly — replacing that talent’s own CS, not stacking with it. Not Professional or Mystic/Mental. Judge has final say on the pick." },
    telepathy:       { desc: "Mind-to-mind communication. Surface thoughts. Auto: willing or lower Psyche. Yellow: equal Psyche. Red: mental Powers/psi-screen. Impossible: higher unwilling Psyche." },
    imageGeneration: { desc: "Mental illusions. Not on cameras/non-sentient robots. Line of sight. Int FEAT to disbelieve (only if player suspects). Illusory damage: 'death'=unconscious 1-10rnd." },
    telekinesis:     { desc: "Lift/Str FEATs at rank. Rank range. Stunts: flight(-1CS), TK force field(-2CS), TK bolts(-1CS Force column)." },
    mindControl:     { desc: "Override conscious mind. Psyche FEAT to resist vs rank Intensity. 1 area initial contact. No target memory. Additional FEAT on Karma-loss or life-threat. Controller loses 10 Karma per use." },
    emotionControl:  { desc: "Affect subconscious. Same area. Int FEAT to resist. Duration 10-100 turns. +2CS if limited to one emotion. Emotions: respect, love, fear, hatred, loyalty, doubt, pleasure." },
    forceFieldGen:   { desc: "FF covering rank#/10 areas. -1 rank per area beyond first. Personal option: +1CS but no stunts. Absorbs rank# energy dmg, rank#-10 physical. Breach: all dmg in round > rank#." },
    animalComm:      { desc: "Talk to/control animals. +1CS for class, +2CS for family, +3CS for specific animal (companion). Popularity FEAT using rank. Failure: animal may turn." },
    mechanicalIntuition:{ desc: "Ultimate Skill for invention/repair/building. All invention success rolls at Un rank. No modifiers. Must still provide Resources." },
    empathy:         { desc: "Register surface emotions (not thoughts). Cannot transmit back. Similar to Telepathy for FEAT. Blocked by Empathy/Emotion Control." },
    animalEmpathy:   { desc: "Detect/influence animal surface emotions. Instill fear, hunger, affection, etc. on FEAT." },
    psiScreen:       { desc: "Resist mental scans/domination. Min = Psyche +1CS. Use instead of Psyche vs Mental Powers. Extend to protect others (FEAT per target, fail = lose all 1-10 turns)." },
    mentalProbe:     { desc: "Search for specific image in target's mind. State target before scan. Psyche FEAT to resist (if success: no re-probe 24hr). Second Psyche FEAT or -1CS Psyche for 24hr." },
    animateDrawings: { desc: "Animate flat drawings/representations. +1CS if limited to specific type. Animated abilities cannot exceed rank. Last 1-10 rounds, dissipate, 24hr cooldown." },
    possession:      { desc: "Mind Control variant. Controller 'inside' target mind, controls all actions. Max target Psyche = rank. Psyche FEAT to escape on life-threat." },
    transferral:     { desc: "Swap consciousness with target in 1 area. Always Red FEAT. Trade mental abilities/Powers/Talents/Karma. Keep physical abilities/Powers. Fail: unconscious 1-10rnd, no retry 1 day." },
    astralProjection:{ desc: "Astral form leaves body. Observe but not interact physically. Immune to non-mental attacks. Body in trance. Body death = trapped. Travel across dimensions at rank." },
    psionicAttack:   { desc: "Psionic force blast at rank range/Intensity. Psyche FEAT or unconscious 1-10rnd. Mental Powers/Psi-Screen used instead of Psyche. FF works against." },
    precognition:    { desc: "Scan alternate futures up to 1 week. 1x/day. Must take limitation. FEAT: W=false image, G=partial truth, Y=fairly honest, R=genuinely useful. Combat option: Yellow+ = Judge reveals NPC plans." },
    postcognition:   { desc: "Read past of handled items. Green=1 day, Yellow=1 week, Red=1 year. Further: Red gives 'feeling'. Second FEAT for detail level as precognition." },
    plantControl:    { desc: "Command plants. Cannot control > rank material. Intelligent plants: Reason FEAT. Stunts: animate vines(rank Agi/material), plant images, tree creatures, fungi, gather info." }
  },

  // ── BODY ALTERATIONS — OFFENSIVE ──
  bodyAlterationsOffensive: {
    extraBodyParts: { desc: "Choose type: extra arms(extra attacks bonus), legs(lightning speed), prehensile tail(climbing), wings(flight+1CS), combat tail(Str+1CS dmg), extra eyes(enhanced senses), claws(+1CS material), spines(projectile+1CS)." },
    extraAttacks:   { desc: "Always Intuition +1CS. Use instead of Fighting for multiple attacks. Fail: only 1 attack that round, no other penalty." },
    energyTouch:    { desc: "Energy column damage. Bullseye=possible Stun. May reduce damage/effects. Conducts through materials (hits multiple on same surface). Bonus: Resistance to Electricity." },
    paralyzingTouch:{ desc: "End FEAT vs rank or KO 1-10 rounds. Always active. User can be KO'd by own touch." },
    claws:          { desc: "Edged Attack column. Rank = damage AND material strength. Cannot reduce damage/effect. +2CS material str with any limitation. Vs non-living: compare material str, Str FEAT to shred. Works on artificial BA, not natural BA or FF." },
    rottingTouch:   { desc: "Rank damage on touch. Acts on organic material as breaking at rank Str. Directed against organic BA. Offset by Resistance to Corrosives." },
    corrosiveTouch: { desc: "Rank-3CS vs living. Acts on inorganic material as breaking at rank Str. Chews through inorganic BA. Offset by Resistance to Corrosives." },
    healthDrain:    { desc: "Transfer rank# Health from target to hero on touch. Heals hero's damage. Excess above max Health lost. Target at 0: End FEAT or die. Stunt: reverse (heal others)." },
    blindingTouch:  { desc: "Blind unprotected target 1-10 rounds. Must achieve Stun or Slam result. No avoidance unless Protected Senses or helmet." }
  },

  // ── BODY ALTERATIONS — DEFENSIVE ──
  bodyAlterationsDefensive: {
    bodyArmor:      { desc: "Physical damage reduced by rank#. Energy damage reduced by rank#-20. If damage < BA, no effects apply. Natural(organic) or Artificial(suit). +1 rank if accept -1CS Agility." },
    waterBreathing: { desc: "Breathe water as air. See underwater normally. Survive depths. Next Power: Swimming or Animal Comm(sea). Both = water-only breathing." },
    absorption:     { desc: "Absorb one specific damage type. Heals + temporarily raises Health by rank#. Excess above rank: take damage but may redirect next round. Extra Health dissipates in 10 rounds." },
    regeneration:   { desc: "Recover End rank# Health every 10 turns (1 min) while resting. No actions during rest. Interrupted = restart." },
    solarRegen:     { desc: "Min = End +1CS. Heal rank# Health per 10 min in sunshine. Normal healing otherwise." },
    recovery:       { desc: "Recover lost End ranks: 1/day, Power rank FEAT. Bonus: choose any Resistance." },
    lifeSupport:    { desc: "Survive hostile environments (space, underwater, lava) for rank# turns before End FEATs. ShZ+: indefinite without food/water/air." },
    pheromones:     { desc: "Opposite sex: Psyche FEAT vs rank or Friendly. Not robots/aliens/shielded. Hostile still attracted but won't stop deathtraps." },
    damageTransfer: { desc: "Transfer Health between two separate targets on touch. Heals one, reduces other. Hero cannot gain Health." },
    healing:        { desc: "Restore lost Health/End to others (not self). Max rank# Health per hero per day. End FEAT required; fail = lose Karma equal to amount. End ranks: 1/day, FEAT; fail = lose 1 End rank (healer). Below Fe = healer dies." },
    immortality:    { desc: "No aging/normal death. Counts as 2 Powers (1 for aliens). Still takes damage. At Shift 0 End: cannot act until Fe. Loses ALL Karma on 'death'. Body slowly regenerates. Earth dimension only." }
  }
};

// ══════════════════════════════════════════════════════════════
// TALENTS
// ══════════════════════════════════════════════════════════════
// Talents modify existing abilities (+1CS typically). Available to normal citizens.
// Weapon Talents not cumulative with each other, but combine with Fighting Talents.
// Scientific Talents not cumulative with each other.
// New Talent cost: 1000 Karma from NPC, 2000 from PC. Student: 800/1000.

// ══════════════════════════════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════════════════════════════
// Contacts provide information, skills, heroic help, and/or equipment.
// More powerful contacts = more likely to request favors/missions.
// Contact addition cost: 500 + 10 × Contact's Resource rank#.
// Dimensional contacts: 2× normal cost.

// ══════════════════════════════════════════════════════════════
// KARMA (FULL RULES)
// ══════════════════════════════════════════════════════════════
// Karma = reward system + spendable experience points.
// Used for: manipulating die rolls, changing combat results, advancement,
//           building things, Power Stunts.

// ── KARMA AWARD TIMING ──
// 1. End of battle/conflict (not during ongoing combat)
// 2. Completion of a task (rescue, crime stop — immediate)
// 3. Conclusion of adventure or gaming session
// Group awards: split evenly (drop fractions). Individual awards to individual.
// Group awards may go directly into Karma Pool.

// ══════════════════════════════════════════════════════════════
// POPULARITY (FULL RULES)
// ══════════════════════════════════════════════════════════════
// Measure of reputation and public image. Depends on public actions and press.
// Awarded day-by-day. Can go negative (unlike Karma).

// ══════════════════════════════════════════════════════════════
// ADVANCEMENT (FULL COSTS)
// ══════════════════════════════════════════════════════════════
// Only one advancement fund active at a time. After purchase, remainder may move.
// Karma set aside is untouchable by normal use or negative modifiers.

// ══════════════════════════════════════════════════════════════
// RESOURCES (FULL RULES)
// ══════════════════════════════════════════════════════════════
// Resource FEAT: 1× per week. Cannot be modified by Karma.
// Determines if character can afford something.

// ══════════════════════════════════════════════════════════════
// FEAT RULES (FULL)
// ══════════════════════════════════════════════════════════════
// FEAT = Function of Exceptional Ability or Talent.
// Roll d100, cross-reference vs rank on Universal Table → white/green/yellow/red.
// Colored result = success (degree varies). White = usually failure.

// ── FEAT TYPES ──
// Ability FEATs: use one of FASERIP abilities, modified by Talents/situation.
// Power FEATs: use Power rank.
// Talent FEATs: Talent modifies a specific ability for the FEAT.
// Popularity FEATs: social interaction, use Popularity rank, modified by Contacts.
// Resource FEATs: credit check, use Resource rank. 1× per week. Cannot be Karma-modified.

// ── COLUMN SHIFTS ──
// +CS = shift right (easier). -CS = shift left (harder).
// Cannot shift below Shift 0 or above Shift Z.
// Class 1000+ columns cannot be shifted except in specific listed circumstances.
// Shifts may make FEATs automatic or impossible.

// Auto if weight 3+ ranks below Str. Green if 1-2 below. Yellow if equal. Red if 1 above. Impossible if 2+ above.

// ── BREAKING THINGS (Strength FEAT vs Material Strength) ──
// Success = 2ft hole maximum.
// Thickness modifiers:
//   < 2" thick: material strength -1 rank
//   2"-12": listed material strength
//   1-2 ft: material strength +1 rank
//   > 2 ft: material strength +2 ranks

// ── POWER RANGE TABLE ──
export const POWER_RANGE = {
  "Shift-0":     "Touch only",
  "Feeble":      "Touch only",
  "Poor":        "1 area",
  "Typical":     "2 areas",
  "Good":        "4 areas",
  "Excellent":   "6 areas",
  "Remarkable":  "8 areas",
  "Incredible":  "10 areas",
  "Amazing":     "20 areas",
  "Monstrous":   "40 areas",
  "Unearthly":   "60 areas",
  "Shift-X":     "80 areas",
  "Shift-Y":     "160 areas",
  "Shift-Z":     "400 areas",
  "Class 1000":  "100 miles",
  "Class 3000":  "10,000 miles",
  "Class 5000":  "1,000,000 miles",
  "Beyond":      "Unlimited"
};

// ── POWER DERIVATIONS ────────────────────────────────────────────────────────
// Key mechanical facts each power type surfaces on the power chat card,
// beyond Rank and Range. Keyed by item.system.type. Each entry is an array
// of { label, get(rank, value) }. Unknown types fall back to Rank + Range only.
// Extend as needed — prose descriptions buried in item text belong here.
export const POWER_DERIVATIONS = {
  "Air Control":                 [{ label: "Missile Shield", get: (r) => r }, { label: "Wind Intensity", get: (r) => r }],
  "Force Field":                 [{ label: "Protection",     get: (r) => r }],
  "Force Field vs Energy":       [{ label: "Protection",     get: (r) => r }],
  "Force Field vs Hostile Env.": [{ label: "Protection",     get: (r) => r }],
  "Body Armor":                  [{ label: "Protection",     get: (r) => r }],
  "Resistance to Physical":      [{ label: "Reduces By",     get: (r) => r }],
  "Resistance to Energy":        [{ label: "Reduces By",     get: (r) => r }],
  "Resistance to Fire & Heat":   [{ label: "Reduces By",     get: (r) => r }],
  "Resistance to Cold":          [{ label: "Reduces By",     get: (r) => r }],
  "Invulnerability to Physical": [{ label: "Reduces By",     get: (r) => r }],
  "Healing":                     [{ label: "Recovered",      get: (_r, v) => `${v} pts` }],
  "Regeneration":                [{ label: "Per Round",      get: (_r, v) => `${v} pts` }],
  "Flight":                      [{ label: "Speed",          get: (r) => r }],
  "Telepathy":                   [{ label: "Probe Intensity", get: (r) => r }],
  "Telekinesis":                 [{ label: "Lift / Push",    get: (r) => r }],
  "Mind Control":                [{ label: "Resist FEAT",    get: (r) => r }],
  "Invisibility":                [{ label: "Detection FEAT", get: (r) => r }],
  "Energy Emission":             [{ label: "Damage",         get: (r) => r }],
  "Fire Control":                [{ label: "Damage",         get: (r) => r }, { label: "Intensity", get: (r) => r }],
  "Ice Control":                 [{ label: "Damage",         get: (r) => r }, { label: "Intensity", get: (r) => r }],
  "Water Control":               [{ label: "Damage",         get: (r) => r }, { label: "Intensity", get: (r) => r }],
  "Earth Control":               [{ label: "Damage",         get: (r) => r }, { label: "Intensity", get: (r) => r }],
  "Plasma Control":              [{ label: "Damage",         get: (r) => r }, { label: "Shield", get: (r) => r }],
  "Growth":                      [{ label: "Size Shift",     get: (r) => r }],
  "Shrinking":                   [{ label: "Size Shift",     get: (r) => r }]
};

/** Resolve a power's range field to display text.
 *  "rank" → POWER_RANGE[rank]. Other values (touch/self/none/custom) pass through. */
export function resolveRange(rangeField, rank) {
  if (!rangeField) return "—";
  const s = String(rangeField).trim();
  if (!s) return "—";
  if (s.toLowerCase() === "rank") return POWER_RANGE[rank] || rank || "—";
  return s;
}

/** Compact a resolved range for narrow actor-sheet tables.
 *  Examples: "1 area" -> "1 Ar" and "20 areas" -> "20 Ar". */
export function compactPowerRange(rangeField, rank) {
  const resolved = resolveRange(rangeField, rank);
  return resolved.replace(/\barea(?:s)?\b/gi, "Ar");
}

/** Display labels for the 10 power category keys (system.category). */
export const POWER_CATEGORY_LABELS = {
  resistances:              "Resistances",
  senses:                   "Senses",
  movement:                 "Movement",
  matterControl:            "Matter Control",
  energyControl:            "Energy Control",
  bodyControl:              "Body Control",
  distanceAttacks:          "Distance Attacks",
  mentalPowers:             "Mental Powers",
  bodyAlterationsOffensive: "Body Alt / Offensive",
  bodyAlterationsDefensive: "Body Alt / Defensive"
};

/** Map a power category key to its display label; "—" if unset. */
export function powerCategoryLabel(key) {
  if (!key) return "—";
  return POWER_CATEGORY_LABELS[key] || key;
}

/** Derived stats for a power type at a given rank/value.
 *  Returns [{ label, value }]; empty if type not in POWER_DERIVATIONS. */
export function getPowerDerivations(type, rank, value) {
  const specs = POWER_DERIVATIONS[type];
  if (!Array.isArray(specs)) return [];
  return specs.map(s => ({ label: s.label, value: s.get(rank, value) ?? "—" }));
}

// ── POWER STUNTS ──
// Using a Power in a way not originally intended.
// Cost: 100 Karma to attempt (does not guarantee success).
// If Judge rules impossible: no Karma spent.
// FEAT color needed (vs Power rank):
//   Never tried:       Red
//   Tried 1-3 times:   Yellow
//   Tried 3+ times:    Green
//   Tried 10+ times:   Automatic (part of hero's repertoire, no FEAT needed)
// Failure: Power Stunt fails. Manner depends on situation. Should not be immediately deadly.

// ── POPULARITY FEATS (FULL) ──
// Used to get something from an NPC: borrow items, get info, finagle favors, persuade surrender.
// Roll on Popularity rank column.
//
// Target disposition determines FEAT color needed:
//   Friendly (close friends, relatives, listed Contacts): Green
//   Neutral (heard of hero, other heroes, strangers in groups): Yellow
//   Unfriendly (never heard of hero, total strangers, opposite Pop sign, offended Neutrals): Red
//   Hostile (actively opposing, sworn enemies, people hero has hurt): Impossible
//
// Failure effects:
//   Friendly: polite refusal with good reason.
//   Neutral: curt refusal, may become Unfriendly.
//   Unfriendly: turns ugly, hero may be attacked.
//
// CS modifiers:
//   Target benefits: +2CS
//   Target in danger: -3CS
//   Item up to Good value: -1CS
//   Item up to Remarkable value: -2CS
//   Item likely not returned: -2CS
//   Item is unique: -3CS
//
// Never used against PCs to force actions.
//
// Negative Popularity: everything is Yellow FEAT regardless of disposition.
//   Only modifier: target's best interest. Cannot approach non-Contacts for items/favors.

// ── RESOURCE FEATS (FULL) ──
// Once per week. Cannot be modified by Karma.
// Cannot attempt to buy item with rank HIGHER than Resource rank (unless bank loan).
//   3+ ranks below: Automatic
//   1-2 ranks below: Green
//   Equal rank: Yellow
//   Above rank: Impossible (without bank loan)
//
// Failure: cannot buy that rank or higher for 1 week.
//
// Bank Loan option: purchase up to 1 rank higher.
//   Must make Resource FEAT each month at rank -2CS for rank# months.
//   Failure to pay: item repossessed.
//
// Combined Resources: two characters within 1 rank may combine for single FEAT at higher rank.

// ── COMBINED ACTIONS ──
// Two characters performing same FEAT:
//   If lower character within 1 rank of higher: higher gets +1CS.
//   If lower is 2+ ranks below: no benefit.
//   Complementary Powers may also grant +1CS if Judge agrees they help.

// ── MULTIPLE ACTIONS IN ONE ROUND ──
// Up to 3 non-combat actions, or 1 combat + 1 non-combat.
// Difficulty increase:
//   Both automatic: no increase, both succeed.
//   Tougher is Green: both become Yellow.
//   Tougher is Yellow: both become Red.
//   Tougher is Red: both fail (cannot do both in same round).

// ══════════════════════════════════════════════════════════════
// COMBAT ROUND STRUCTURE & INITIATIVE
// ══════════════════════════════════════════════════════════════
// Turn = 6 seconds. 10 turns/minute. 600 turns/hour.
// Turns only matter when time is crucial (combat, chases, bombs, etc.).

// ══════════════════════════════════════════════════════════════
// COMBAT (FULL RULES)
// ══════════════════════════════════════════════════════════════

// ── ATTACK ABILITY BY TYPE ──
// Fighting: hand-to-hand (Slugfest), melee weapons
// Agility: thrown weapons, ranged Powers, shooting
// Strength: Grappling, holds, wrestling
// Endurance: charging, ramming

// ── SLUGFEST (Fighting Ability) ──
// Combatants must be adjacent (unless Powers like Elongation allow reach).
// Roll on Universal Table using Fighting. Check Blunt or Edged Attack column.
//
// BLUNT ATTACK (bare hands, flat of blade, blunt weapons):
//   White=Miss (no damage). Green=Hit (Str rank# damage). Yellow=Slam+damage. Red=Stun+damage.
//   May pull punch: reduce damage or reduce effect color.
//   Bare hands: Str rank# damage.
//   Blunt weapon: up to material strength damage. If material > Str, use lowest value of next rank.
//     Example: Feeble Str + Excellent material weapon = 3 pts (Poor minimum).
//
// EDGED ATTACK (claws, teeth, edged weapons):
//   White=Miss. Green=Hit (listed weapon damage). Yellow=Stun+damage. Red=Kill+damage.
//   Always inflicts minimum listed weapon damage. Max = Str or material strength (whichever less).
//   CANNOT reduce effect.

// ── RANGED ATTACKS (Agility Ability) ──
// Do not need to be adjacent. Straight line from attacker to target.
// Each floor of elevation = 1 area of range.
// Intervening structures:
//   Higher material passes through lower (bullet through glass).
//   Energy beam: damage applied to structure first, remainder passes through.
//   Physical weapons lose momentum through material (as movement).
//   Any weapon through intervening structure: -2CS to hit.

// Bullseye: hit specific part of target (<1ft square). Nature/result up to Judge. Never fatal.

// ── POWERS IN COMBAT ──
// Body Armor: reduces damage by rank#. Energy attacks: rank# - 20. If damage < BA, no Slam/Stun/Kill.
//   Each attack absorbed individually (5 goons × 10 dmg vs Ex(20) BA = all absorbed).
// Force Fields: protect at rank# vs Energy (full), rank# - 10 vs physical.
//   Overload (damage > rank#): personal FF shuts off (excess damage + possible stun/slam);
//   projected FF: Psyche FEAT vs attack Intensity or unconscious (FF protects those within that attack).
//   BA + FF: use one or other, not both (unless FF projected by third party).
// Resistances: additional FEAT vs attack (damage = Intensity). Success = no damage. Fail = BA protection.
// Claws: Power rank = damage vs people. Material strength = what they can shred (Str FEAT).
//   Shred works on artificial BA, not natural BA or FF.
// Growth: +1CS to be hit at 18ft, +2CS at 22ft, +3CS over 22ft. Same bonus to Str FEATs/damage.
// Shrinking: down to 1"=-1CS to hit/+1CS attacking, 1/4"=-2/+2, smaller=-3/+3. Slugfest/Missile only.

// ── KARMA IN COMBAT ──
// Announce Karma spending before rolling. Auto-spend 10 minimum.
// Add Karma spent to die roll result. Can spend more than 10.
// Cannot modify: Resource FEATs, Popularity FEATs, Blindsided/surprise FEATs.
// Reduce combat effect by 1 color: 50 Karma (immediately after roll, before other rolls).

// ── GRAND SLAM KNOCKBACK DISTANCE ──
// Areas knocked back on a Grand Slam result (white), by attacker Strength rank.
// Beyond treated as Class 5000 by callers (table stops there).
export const GRAND_SLAM_AREAS = {
  "Shift 0": 0,
  "Feeble": 1,
  "Poor": 1,
  "Typical": 3,
  "Good": 5,
  "Excellent": 6,
  "Remarkable": 7,
  "Incredible": 8,
  "Amazing": 10,
  "Monstrous": 15,
  "Unearthly": 20,
  "Shift X": 25,
  "Shift Y": 35,
  "Shift Z": 50,
  "Class 1000": 100,
  "Class 3000": 200,
  "Class 5000": 500
};

// ── POISONS & TOXINS ──
// Advanced Set RAW: Endurance FEAT vs toxin Intensity. Failure = unconscious
// 1-10 rounds + immediate loss of 1 Endurance rank. Re-FEAT at lowered rank
// after 1-10 turns: success halts, failure loses another rank. Endurance
// Shift-0 from poison = death. Poison losses override other Endurance losses;
// max 1 rank lost per round regardless of cause. Only the victim's own FEAT
// — or trained help (First Aid/Medicine) WITH antitoxin — halts the poison.
// Resistance to Toxins: rolls in place of Endurance; on failure End drops,
// the Power rank does not.
export const POISON_RULES = {
  exposureFeat: "Endurance FEAT vs toxin Intensity (Resistance to Toxins substitutes).",
  failure: "Unconscious 1-10 rounds. Lose 1 Endurance rank immediately.",
  reFeat: "After 1-10 turns, Endurance FEAT at lowered rank. Success halts. Failure: lose another rank, new 1-10 turn window.",
  death: "Endurance Shift-0 from poison = death.",
  cap: "Max 1 Endurance rank lost per round, any cause. Poison losses take priority over dying/Kill losses.",
  halting: "Victim's own FEAT, or treater with First Aid/Medicine talent AND antitoxin. Untrained help cannot halt.",
  recovery: "Lost Endurance heals per Impaired Endurance: 1 rank/week, 1 rank/day with medical care.",
  // Judge rulings PR1-PR5 were imported into the kernel ledger on
  // 2026-09-05 and are no longer restated here. See the ERRATA entries
  // dated 2026-09-05 (PR1-PR5) in scripts/lib/faserip-rules/faserip-kernel.js
  // for the rulings and faserip-poisons.js for the mechanics they govern.
};

export const TOXINS = {
  knockoutTy:   { name: "Knockout Drug (weak)",       intensity: "Typical",    delivery: "injected", notes: "Street-grade sedative dart." },
  knockoutEx:   { name: "Knockout Drug",              intensity: "Excellent",  delivery: "injected", notes: "Kraven's darts, gas grenades." },
  snakeVenomGd: { name: "Snake Venom",                intensity: "Good",       delivery: "injected", notes: "Venomous snake bite. GM addition for Kraven's lair (module snakes are constrictors)." },
  snakeVenomEx: { name: "Snake Venom (potent)",       intensity: "Excellent",  delivery: "injected", notes: "Krait, mamba, sea snake." },
  spiderVenom:  { name: "Spider Venom",               intensity: "Excellent",  delivery: "injected", notes: "Widow/recluse class. Judge's Book Intensity Table: Spider venom Excellent (RULED 2026-09-05)." },
  cyanide:      { name: "Cyanide",                    intensity: "Remarkable", delivery: "ingested", notes: "Fast-acting industrial poison." },
  arsenic:      { name: "Arsenic",                    intensity: "Excellent",  delivery: "ingested", notes: "Classic slow poison." },
  nerveAgent:   { name: "Nerve Agent",                intensity: "Incredible", delivery: "inhaled",  notes: "Military-grade. Gas mask negates." },
  contactPoison:{ name: "Contact Poison",             intensity: "Good",       delivery: "contact",  notes: "Skin absorption; gloves negate." },
  savageryDrug: { name: "Savagery Formula (Kraven)",  intensity: "Good",       delivery: "injected", notes: "Rat-bite chemical. Failure = savage rage, not KO — GM narrates in place of unconsciousness." },
};