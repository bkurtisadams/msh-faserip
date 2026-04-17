// rules-reference.js v1.1.0 - 2026-04-03
// v1.1.0: Canonical rank data — normalized to hyphen format (Shift-X not "Shift X"),
//         added Beyond rank, exported RANK_VALUES/RANKS_ORDERED helpers,
//         added rankValue/valueToRank/shiftRank/normalizeRank utility functions.
//         All other files should import rank data from here instead of redeclaring.
// v1.0.1: Fix WRESTLING.escaping.green (was "Escape", should be "Miss" per Es column),
//         fix ATTACK_RESULTS.throwingBlunt.yellow (was "Bullseye", should be "Hit" per TB column)
// Canonical FASERIP rules reference. All mechanics data in one place.
// Source: Marvel Super Heroes (TSR) Advanced Set / Ultimate Powers Book.

// ── Canonical rank order (low → high) ────────────────────────────────────────
export const RANKS_ORDERED = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

// ── Rank → standard value ────────────────────────────────────────────────────
export const RANK_VALUES = {
  "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
  "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
  "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
  "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000, "Beyond": 9999
};

// Legacy alias — old code that imported RANKS as the values object
export const RANKS = RANK_VALUES;

// ── Rank ranges (for value → rank lookups) ───────────────────────────────────
export const RANK_RANGES = {
  "Feeble": [1, 2], "Poor": [3, 4], "Typical": [5, 7], "Good": [8, 15],
  "Excellent": [16, 25], "Remarkable": [26, 35], "Incredible": [36, 45],
  "Amazing": [46, 62], "Monstrous": [63, 87], "Unearthly": [88, 125],
  "Shift-X": [126, 175], "Shift-Y": [176, 350], "Shift-Z": [351, Infinity]
};

// ── Rank abbreviations ───────────────────────────────────────────────────────
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

// ── Utility functions ────────────────────────────────────────────────────────

/** Normalize any rank name variant to canonical hyphen form. */
export function normalizeRank(name) {
  if (!name) return "Shift-0";
  const s = String(name).trim();
  return RANK_ALIASES[s] ?? (RANK_VALUES[s] !== undefined ? s : (RANK_ALIASES[s] ?? s));
}

/** Get the standard numeric value for a rank name. */
export function rankValue(name) {
  if (!name) return 0;
  const n = normalizeRank(name);
  return RANK_VALUES[n] ?? CONFIG?.FASERIP?.rankValues?.[n] ?? 0;
}

/** Get the rank name for a numeric value (highest rank whose value ≤ val). */
export function valueToRank(val) {
  if (val <= 0) return "Shift-0";
  let best = "Shift-0";
  for (const r of RANKS_ORDERED) {
    if ((RANK_VALUES[r] ?? 0) <= val) best = r;
    else break;
  }
  return best;
}

/** Shift a rank name up/down by delta steps. Class 1000+ ranks cannot be shifted. Clamps to Shift-Z. */
export function shiftRank(name, delta) {
  const n = normalizeRank(name);
  const i = RANKS_ORDERED.indexOf(n);
  if (i < 0) return n;
  // Class 1000+ ranks (index 14+) cannot be column-shifted (rule pg. 15)
  if (i >= 14) return n;
  // Clamp between Shift-0 (0) and Shift-Z (13)
  const newI = Math.min(Math.max(i + delta, 0), 13);
  return RANKS_ORDERED[newI];
}

/** Get the ordinal index of a rank (0-based). Returns 0 for unknown ranks. */
export function rankIndex(name) {
  const n = normalizeRank(name);
  const i = RANKS_ORDERED.indexOf(n);
  return i >= 0 ? i : 0;
}

// Turn=6sec, 10 turns/min, 600 turns/hr
export const TIME = { turnSeconds: 6, turnsPerMinute: 10, turnsPerHour: 600 };

// ── COMBAT RESULTS BY ATTACK TYPE ──
// Each entry: { white, green, yellow, red }
// Slugfest = Fighting FEAT (adjacent)
export const ATTACK_RESULTS = {
  blunt:         { white: "Miss", green: "Hit",      yellow: "Slam",     red: "Stun" },
  edged:         { white: "Miss", green: "Hit",      yellow: "Stun",     red: "Kill" },
  shooting:      { white: "Miss", green: "Hit",      yellow: "Bullseye", red: "Kill" },
  throwingEdged: { white: "Miss", green: "Hit",      yellow: "Stun",     red: "Kill" },
  throwingBlunt: { white: "Miss", green: "Hit",      yellow: "Hit",      red: "Stun" },
  energy:        { white: "Miss", green: "Hit",      yellow: "Bullseye", red: "Kill" },
  force:         { white: "Miss", green: "Hit",      yellow: "Bullseye", red: "Stun" },
  charging:      { white: "Miss", green: "Hit",      yellow: "Slam",     red: "Stun" },
  grappling:     { white: "Miss", green: "Miss",     yellow: "Partial",  red: "Full" },
  escaping:      { white: "Miss", green: "Miss",     yellow: "Escape",   red: "Reverse" },
  grabbing:      { white: "Miss", green: "Take",     yellow: "Grab",     red: "Break" }
};

// Which effects each attack type can trigger
// pullDamage: can reduce damage. pullEffect: can reduce effect column.
export const ATTACK_EFFECTS = {
  blunt:         { effects: ["Slam", "Stun"], pullDamage: true,  pullEffect: true },
  edged:         { effects: ["Stun", "Kill"], pullDamage: false, pullEffect: false },
  shooting:      { effects: ["Kill"],         pullDamage: false, pullEffect: false },
  throwingEdged: { effects: ["Stun", "Kill"], pullDamage: true,  pullEffect: false },
  throwingBlunt: { effects: ["Stun"],         pullDamage: true,  pullEffect: true  },
  energy:        { effects: ["Kill"],         pullDamage: true,  pullEffect: false },
  force:         { effects: ["Stun"],         pullDamage: true,  pullEffect: false },
  charging:      { effects: ["Slam", "Stun"], pullDamage: true,  pullEffect: true }
};

// Blunt weapon dmg (Slugfest / melee only):
//   = Str or material strength (whichever less);
//   if material > Str, use next rank minimum.
// Edged weapon (melee and thrown): always inflicts minimum listed dmg;
//   max of min(Str, material) for powerful wielders.
// Blunt Throwing: plain min(Str, material). No bump rule.

// ── SLAM (Endurance FEAT after Slam result) ──
export const SLAM_RESULTS = {
  white:  "Grand Slam",  // speed = attacker Str as ground speed
  green:  "1 Area",      // attacker chooses direction if dmg dealt, defender if no dmg
  yellow: "Stagger",     // not adjacent, no extra dmg
  red:    "No Slam"
};
// Slammed into building = charging attack on that building.

// ── STUN (Endurance FEAT after Stun result) ──
export const STUN_RESULTS = {
  white:  "Unconscious 1-10 rounds",  // no actions
  green:  "Stunned 1 round",          // conscious but no action, can play possum
  yellow: "No Effect",
  red:    "No Effect"
};

// ── KILL (Endurance FEAT after Kill result) ──
export const KILL_RESULTS = {
  white:  "Endurance Loss",  // dying: lose 1 rank/turn until Shift0=death
  green:  "E/S Only",        // only Edged Slugfest, Shooting, Thrown Edged cause dying; else No Effect
  yellow: "No Effect",
  red:    "No Effect"
};
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

// ── 0 HP / DYING ──
export const ZERO_HP = {
  unconsciousRounds: "1-10",
  // Roll Endurance FEAT vs Kill column
  // No Effect = unconscious, wake with HP = Endurance rank number
  // Endurance Loss = dying (lose 1 rank/turn, Shift0 = death)
  stabilize: {
    karma50: "Stabilize 1 round",
    karma200: "Re-roll Endurance FEAT (requires FEAT success)",
    anyAid: "Stops Endurance loss (unconscious 1-10 hrs)"
    // Any aid = first aid, pulling to safety, checking on them
  },
  impaired: {
    penalty: "-2CS all actions until Endurance restored",
    healNormal: "1 Endurance rank/week",
    healMedical: "1 Endurance rank/day"
  },
  disabilities: "At Shift0, roll green FEAT each physical ability above Good or lose to next lowest printed number"
};

// ── RECOVERY & HEALING ──
export const RECOVERY = {
  // Recovery: 10 turns after last damage (no further damage), regain Endurance rank# HP (once/day)
  recoveryTurns: 10,
  recoveryFrequency: "once per day",
  // Healing: Endurance rank# HP per hour after last damage
  // Doubled by bedrest or medical care
  healingMultiplier: { normal: 1, bedrest: 2, medicalCare: 2 }
};

// ── DEFENSIVE ACTIONS ──
export const DEFENSIVE_ACTIONS = {
  dodging: {
    // Agility FEAT, pre-action
    ability: "agility",
    results: { white: 0, green: -2, yellow: -4, red: -6 }, // CS shift on incoming attacks
    penalties: "Half move, -2CS on own FEATs",
    notes: "Only vs attacks character is aware of. No effect on adjacent Slugfest/Wrestling."
  },
  evading: {
    // Fighting FEAT, adjacent only, 1 opponent
    ability: "fighting",
    results: {
      white: "Auto-Hit (at least green)",
      green: "Evasion (miss)",
      yellow: "Evasion + 1CS next round",
      red: "Evasion + 2CS next round"
    },
    notes: "No attacks that round. Bonus applies only to first attack next round vs that attacker."
  },
  blocking: {
    // Strength FEAT, no other actions
    ability: "strength",
    // Str as Body Armor vs physical attacks (Slugfest, Throwing, Force, Wrestling)
    // NOT vs Shooting, Energy, Charging
    results: { white: -6, green: -4, yellow: -2, red: 1 }, // CS from Str rank for BA value
    notes: "Normal BA still applies (not Force Fields)."
  },
  catching: {
    // Agility FEAT, 1 item
    ability: "agility",
    results: {
      white: "Auto-hit",
      green: "Miss (+1CS for attacker)",
      yellow: "Damage (catch but may damage item)",
      red: "Catch (no ill effects)"
    },
    modifiers: "-3CS vs objects directed at catcher",
    minimumAgility: { bullets: "Unearthly", arrows: "Amazing", thrown: "Remarkable", falling: "any" }
  }
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

// ── WRESTLING (Strength FEAT, adjacent) ──
export const WRESTLING = {
  grappling: {
    white: "Miss (no other attacks)",
    green: "Miss (no other attacks)",
    yellow: "Partial Hold (-2CS actions, no move if attacker Str >= target)",
    red: "Full Hold (restrained, attacker +1 action, Str dmg)"
  },
  escaping: {
    white: "Miss (still held, no action)",
    green: "Miss (still held, no action)",
    yellow: "Escape (free, half move, no other actions)",
    red: "Reverse (free + grapple back or action at -2CS)"
  },
  grabbing: {
    white: "Miss",
    green: "Take (only if Str >= target)",
    yellow: "Grab (take regardless of Str)",
    red: "Break (take + depart or risk triggering item on failed material FEAT)"
  }
};

// ── CHARGING (Endurance FEAT) ──
export const CHARGING = {
  requirement: "Must move 1+ area",
  csBonus: "+1CS per area moved (max +3CS, cap ShZ)",
  damage: "Endurance or Body Armor (whichever higher) + 2pts per area",
  rebound: "If defender BA > attacker dmg, damage rebounds to attacker (attacker BA then applies)",
  inanimate: "Material strength = BA",
  missResult: "Continues half speed, may hit obstacle"
};

// ── MARTIAL ARTS ──
export const MARTIAL_ARTS = {
  A: "Stun/Slam ignores Str/End",
  B: "+1CS Fighting",
  C: "+1CS grapple/escape/dodge",
  D: "Ignore armor for effects (2 rounds study required)",
  E: "+1 initiative"
};

// ── TALENTS (combat-relevant) ──
export const COMBAT_TALENTS = {
  wrestling: "+2CS Grappling (no damage bonus)",
  thrownObjects: "+1CS throw/catch",
  acrobatics: "+1CS dodge/evade/escape",
  tumbling: "Agility FEAT to land feet-first"
};

// ── MEDICINE / FIRST AID ──
export const MEDICINE = {
  medicine: {
    revive: "Revive Shift 0 character up to 20 turns after death",
    restore: "Restore 1 Endurance rank/week"
  },
  firstAid: {
    halt: "Halt Endurance loss",
    recover: "Recover 1 rank immediately (once)",
    stabilize: "Stabilize Shift 0 character up to 5 rounds after death"
  }
};

// ── KARMA ──
export const KARMA_SPENDING = {
  modifyRoll: { cost: 10, note: "Minimum 10pt to modify roll (add spent amount to result)" },
  reduceEffect: { cost: 50, note: "Reduces combat effect by one color" },
  powerStunt: { cost: 100, note: "Attempt a Power Stunt" },
  blindsiding: { note: "+2CS to hit, target cannot add Karma to Slam/Stun/Kill FEATs" }
};

export const KARMA_GAINS = {
  stopCrime: {
    violent: { stop: 30, arrest: 15 },
    destructive: { stop: 20, arrest: 10 },
    theft: { stop: 10, arrest: 5 },
    robbery: { stop: 20, arrest: 10 },
    misdemeanor: { stop: 5, arrest: 5 },
    nationalOffense: { stop: 20, arrest: 10 },
    localConspiracy: { stop: 30, arrest: 15 },
    nationalConspiracy: { stop: 40, arrest: 20 },
    globalConspiracy: { stop: 50, arrest: 25 },
    other: { stop: 15, arrest: 5 }
  },
  rescue: 20,          // max 100
  defeatFoe: "Highest rank number (Rm+ foes only)",
  losses: {
    commitCrime: "2x listed value",
    publicDefeat: -40,
    privateDefeat: -20,
    propertyDamage: -5, // per area
    permitCrime: "negative arrest value",
    kill: "ALL Karma to 0",
    nobleSacrifice: -50, // each hero
    mysteriousDeath: -50,
    selfDestruct: -50
  }
};

// ── INITIATIVE ──
export const INITIATIVE = {
  // Each side rolls, add modifier from highest Intuition
  intuitionModifiers: {
    0: 0, 10: 0, 11: 1, 20: 1, 21: 2, 30: 2,
    31: 3, 40: 3, 41: 4, 50: 4, 51: 5, 75: 5, 76: 6
  },
  // Roll of 1 always = 1
  changeAction: "Yellow Agility FEAT, -1CS on subsequent FEATs"
};

// Intuition modifier lookup
export function getInitiativeModifier(intuitionValue) {
  if (intuitionValue <= 10) return 0;
  if (intuitionValue <= 20) return 1;
  if (intuitionValue <= 30) return 2;
  if (intuitionValue <= 40) return 3;
  if (intuitionValue <= 50) return 4;
  if (intuitionValue <= 75) return 5;
  return 6;
}

// ── FEAT DIFFICULTY ──
export const FEAT_DIFFICULTY = {
  // Intensity > Ability = red needed
  // Intensity = Ability = yellow needed
  // Ability > Intensity = green needed
  // 3+ ranks below intensity = automatic
  automatic: "3+ ranks below intensity",
  // Power Stunts:
  powerStunts: {
    neverTried: "red",
    upTo3Times: "yellow",
    threeOrMore: "green",
    tenOrMore: "automatic"
  }
};

// ── TACTICS ──
export const TACTICS = {
  multipleTargets: {
    note: "Single roll, all adjacent, -4CS",
    allowedTypes: ["Blunt", "Escaping", "Energy", "Force"]
  },
  multipleAttacks: {
    note: "Fighting FEAT pre-action, all at -1CS; fail = 1 attack at -3CS",
    intensity: { 2: "Remarkable", 3: "Amazing" },
    allowedTypes: ["Slugfest", "Shooting"]
  },
  entangling: "Agility FEAT to hit, target Agility FEAT vs material strength or enmeshed",
  combinedAttack: "2+ attackers within 1 rank dmg, higher raised to next rank min if lower makes Agility FEAT",
  doubleTeam: "Hold + attack, +1CS but miss may hit holder",
  groundstrike: "Energy power vs ground, dmg on Force table, target takes material strength dmg",
  shockwave: "Str 2+ ranks above material, Charge at Str, no dmg but Stun/Slam possible, 2 areas",
  fastballSpecial: "Thrower Agi or thrown Fighting to hit, Endurance or Slugfest dmg with Charging bonuses",
  luring: "Opponent +2CS, but defender pulls defensive move; miss hits whatever behind lurer",
  aiming: "1 turn no fire = +1CS",
  pointBlank: { nonFighting: "+3CS", fighting: "-3CS" }
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

// ── GROWTH & SHRINKING ──
export const SIZE_MODIFIERS = {
  growth: {
    "18ft": { toHit: +1 },
    "22ft": { toHit: +2 },
    "over22ft": { toHit: +3 }
    // Also +CS to Str FEATs/Wrestling/dmg
  },
  shrinking: {
    "1inch":   { toHit: -1, attacking: +1 },
    "quarter": { toHit: -2, attacking: +2 },
    "smaller": { toHit: -3, attacking: +3 }
    // Slugfest/Missile only
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

// ── RESOURCE POINTS (Original Rules) ──
// Weekly rate = rank number of RP gained per week. Max = accumulation cap.
// Amazing+ has no maximum (Infinity).
export const RESOURCE_POINTS = {
  "Shift-0":    { weekly: 0,   max: 0 },
  "Feeble":     { weekly: 2,   max: 10 },
  "Poor":       { weekly: 4,   max: 20 },
  "Typical":    { weekly: 6,   max: 50 },
  "Good":       { weekly: 10,  max: 100 },
  "Excellent":  { weekly: 20,  max: 500 },
  "Remarkable": { weekly: 30,  max: 1000 },
  "Incredible": { weekly: 40,  max: 5000 },
  "Amazing":    { weekly: 50,  max: Infinity },
  "Monstrous":  { weekly: 75,  max: Infinity },
  "Unearthly":  { weekly: 100, max: Infinity },
  "Shift-X":    { weekly: 150, max: Infinity },
  "Shift-Y":    { weekly: 200, max: Infinity },
  "Shift-Z":    { weekly: 500, max: Infinity },
  "Class 1000": { weekly: 1000, max: Infinity },
  "Class 3000": { weekly: 3000, max: Infinity },
  "Class 5000": { weekly: 5000, max: Infinity },
  "Beyond":     { weekly: 10000, max: Infinity }
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

// ── VEHICLES ──
export const VEHICLES = {
  stats: ["Type", "Cost", "Control", "Speed", "Body", "Protection"],
  types: ["Road", "Off-Road", "Railed", "GEV", "Air", "Space", "Water", "Sub"],

  // Control FEAT ability: use lesser of operator's Agility or vehicle's Control.
  controlFEAT: {
    ability: "Lesser of Agility or Control",
    triggersByType: {
      road:    ["sudden stop", "traveling off-road", "turn 90°+", "any action above listed Speed"],
      offRoad: ["sudden stop", "turn 90°+", "any action above listed Speed"],
      railed:  ["sudden stop"],
      gev:     ["as off-road + as air vehicle"],
      air:     ["sudden turn / dodge", "turn 45°+ (one-eighth circle)", "abnormal takeoff/landing (fog, damaged, etc.)"],
      space:   ["takeoff", "landing", "sudden movement"],
      water:   ["sudden course change"],
      sub:     ["sudden course change"]
    }
  },

  // Accel: 2 areas/round per round as if Ex Endurance. Current speed rank =
  // rank equal to areas moved, or next highest on long-distance movement table.
  acceleration: {
    rate: "2 areas/round",
    asEndurance: "Excellent",
    column: "Land/Water (Air column used for GEV, Space, Air types)"
  },

  // Decel: 2 ranks/round normally; 3 ranks with a sudden-stop Control FEAT.
  deceleration: {
    normal: "2 ranks/round until Shift 0",
    sudden: "3 ranks/round (Control FEAT)"
  },

  // Air vehicles must reach ground speed equal to listed air speed rank before
  // takeoff. During runway roll they count as Ground vehicles for Control.
  // Catapults (carriers, Avengers Mansion) fling craft at required speed.
  airTakeoff: {
    groundSpeedRequired: "Equal rank to listed air speed",
    duringRunway: "Treated as Road vehicle for Control",
    catapult: "Aircraft carriers, Avengers Mansion — launched at required speed"
  },

  // Air landing: must match ground equivalent of air speed rank for safe landing.
  // Faster-than-safe landings require Control FEAT.
  airLanding: {
    safeSpeed: "Ground equivalent of air-rank speed",
    faster: "Control FEAT required"
  },

  // If floors climbed or descended in a round > forward areas moved, Control
  // FEAT required. Failure = falling spin from end of that round. For downward
  // movement, falling speed = aircraft speed.
  airAscentDescent: {
    rule: "Floors changed > forward areas moved → Control FEAT",
    failure: "Falling spin starts end of round; falling speed = aircraft speed"
  },

  // Speeding: up to +1 rank above safe speed.
  // All actions and all turns require Control FEATs, and all FEATs shift +1
  // color for success. Red remains red (no shift beyond).
  speeding: {
    max: "+1 rank above listed Speed",
    allActionsNeedControlFEAT: true,
    featShift: "green→yellow, yellow→red, red→red"
  },

  // Turns up to 90° cost 1 area of movement. Turns >90° are Vehicle Stunts.
  turns: {
    upTo90: "Costs 1 area of movement",
    over90: "Vehicle Stunt (see stunts)"
  },

  // Vehicle Stunts: player-proposed, Judge adjudicates feasibility.
  // Examples: bootleg turn (sports car), Immelman/loop (aircraft), barrel roll.
  // Karma is NOT required to attempt; failed FEAT = automatic out-of-control.
  stunts: {
    proposal: "Player proposes; Judge decides if vehicle can do it and if character can attempt",
    feat: {
      withTalentOrPowerOrBackground: "green or yellow FEAT",
      novice: "red FEAT"
    },
    karma: "No Karma required to attempt",
    failure: "Automatic out-of-control"
  },

  // Out-of-Control behavior by vehicle type. Karma cannot be spent to regain
  // control. Recovery = succeed the required Control FEAT in a later round.
  outOfControl: {
    karmaNotAllowed: true,
    road:    "Continues forward at current speed. Retry next round. Failed recovery → -1 rank speed, retry again. Continues until stop, recovery, or crash.",
    offRoad: "As road.",
    railed:  "As road.",
    gev:     "As road.",
    water:   "Continues forward in straight line, no speed loss, until recovery or crash.",
    sub:     "As water.",
    airOnGround: "Treated as Road (takeoff/landing).",
    airInFlight: "Straight line, no speed loss, + falling (3 floors round 1, 6 round 2, 10 round 3, 20/round thereafter). Recovery FEATs always yellow minimum. Continues until recovery or crash."
  },

  // Crash resolution: two-step.
  // Step 1: break-through check (Strength FEAT, min(Body,Speed) vs material).
  //   Success: vehicle continues, speed reduced by material rank.
  //   Failure: vehicle stops; proceed to step 2.
  // Step 2: damage to occupants.
  //   Base damage = max(material strength, Speed) - Protection.
  //   Attack rolled on max(material, Speed) rank column.
  //   Belted passengers: Blunt Attack. Unbelted: Edged Attack.
  //   Karma may not add to the attack roll; may spend Karma vs Stun/Slam/Kill.
  crash: {
    stepOne: {
      name: "Break-through check",
      feat: "Strength FEAT: min(Body, Speed) vs object material strength",
      success: "Vehicle continues; Speed reduced by material rank",
      failure: "Vehicle stops; step 2 applies"
    },
    stepTwo: {
      name: "Damage to occupants",
      baseDamage: "max(material strength, Speed) - Protection",
      attackColumn: "max(material, Speed) rank",
      attackType: { belted: "Blunt Attack", unbelted: "Edged Attack" },
      karma: "Not allowed on attack roll; may spend vs Stun/Slam/Kill effects"
    }
  },

  // Damage-to-Vehicle table: separate from crash damage to occupants.
  // Applies when vehicle takes damage from attacks OR survives a crash with
  // damage. Compare damage-inflicted vs vehicle Body, roll FEAT vs Body.
  // Penalties persist until repaired.
  damageToVehicle: {
    featVs: "Body rank",
    greaterThanBody: {
      red:    { statChange: "Body -1CS", extra: "damage to passengers" },
      yellow: { statChange: "Speed -1CS", extra: "Control FEAT required" },
      green:  { statChange: "Control -1CS", extra: "Control FEAT required" },
      white:  { statChange: "All -1CS", extra: "Automatic out-of-control" }
    },
    equalToBody: {
      red:    { statChange: "None", extra: "damage to passengers" },
      yellow: { statChange: "Body -1CS", extra: "damage to passengers" },
      green:  { statChange: "Speed -1CS", extra: "Control FEAT required" },
      white:  { statChange: "Control -1CS", extra: "Control FEAT required" }
    },
    lessThanBody: {
      red:    { statChange: "None", extra: "None" },
      yellow: { statChange: "None", extra: "None" },
      green:  { statChange: "Body -1CS", extra: "Control FEAT required" },
      white:  { statChange: "Control -1CS", extra: "damage to passengers, Control FEAT required" }
    },
    collapse: {
      controlBelowFeeble: "Vehicle out of control",
      speedBelowFeeble:   "Vehicle stops (crash result for plane)",
      bodyZero:           "No Protection to passengers. Water/Sub: begins sinking. Air: any action requires Control FEAT."
    }
  },

  // Vehicles in combat: attacker chooses whether to target vehicle or passenger.
  combat: {
    targetVehicle:   "Normal attack vs vehicle Body.",
    targetPassenger: "Bullseye result required to hit; Protection applies as Body Armor (unless attacker has negated it — e.g. ripped off the roof).",
    vehicleAsCharge: {
      attackRank: "Lesser of Body or Speed",
      bonus: "+1CS (target is not fixed)",
      resolvedAs: "Crash — may destroy vehicle while target survives"
    }
  }
};

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
//   Es (Strength):  W=Miss,  G=Escape,   Y=Escape,   R=Reverse
//   Ch (Endurance): W=Miss,  G=Hit,      Y=Slam,     R=Stun
//   Do (Agility):   W=None,  G=-2CS,     Y=-4CS,     R=-6CS
//   Ev (Fighting):  W=Autohit, G=Evasion, Y=+1CS,    R=+2CS
//   Bl (Strength):  W=-6CS,  G=-4CS,     Y=-2CS,     R=+1CS
//   Ca (Agility):   W=Autohit, G=Miss,   Y=Damage,   R=Catch
//   St (Endurance): W=1-10,  G=1,        Y=No,       R=No
//   Sl (Endurance): W=Gr.Slam, G=1 area, Y=Stagger,  R=No
//   Ki (Endurance): W=En.Loss, G=E/S,    Y=No,       R=No

// Universal Table grid: d100 roll vs rank → color result.
// Each row is [rollMin, rollMax, ...colorPerRank] where ranks are indexed:
//   0=Sh0, 1=Fe, 2=Pr, 3=Ty, 4=Gd, 5=Ex, 6=Rm, 7=In, 8=Am, 9=Mn, 10=Un,
//   11=ShX, 12=ShY, 13=ShZ, 14=CL1000, 15=CL3000, 16=CL5000, 17=Beyond
// W=white, G=green, Y=yellow, R=red

export const UNIVERSAL_TABLE = [
  //           Sh0  Fe   Pr   Ty   Gd   Ex   Rm   In   Am   Mn   Un   ShX  ShY  ShZ  1K   3K   5K   B
  [  1,  1,  "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W"],
  [  2,  3,  "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W"],
  [  4,  6,  "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "G", "G", "G", "G", "G"],
  [  7, 10,  "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "W", "G", "G", "G", "G", "G", "G"],
  [ 11, 15,  "W", "W", "W", "W", "W", "W", "W", "W", "W", "G", "G", "G", "G", "G", "G", "G", "G", "G"],
  [ 16, 20,  "W", "W", "W", "W", "W", "W", "W", "W", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G"],
  [ 21, 25,  "W", "W", "W", "W", "W", "W", "W", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G"],
  [ 26, 30,  "W", "W", "W", "W", "W", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G"],
  [ 31, 35,  "W", "W", "W", "W", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  [ 36, 40,  "W", "W", "W", "W", "G", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  [ 41, 45,  "W", "W", "W", "W", "G", "G", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  [ 46, 50,  "W", "W", "W", "W", "W", "G", "G", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  [ 51, 55,  "W", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y"],
  [ 56, 60,  "W", "W", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "Y"],
  [ 61, 65,  "W", "W", "W", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "G", "Y", "Y", "Y", "Y"],
  [ 66, 70,  "W", "W", "W", "W", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  [ 71, 75,  "W", "W", "W", "W", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "R", "R", "R"],
  [ 76, 80,  "W", "W", "W", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "R", "R", "R", "R", "R"],
  [ 81, 85,  "W", "W", "W", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "Y", "R", "R", "R", "R", "R", "R"],
  [ 86, 90,  "W", "W", "W", "G", "G", "G", "G", "Y", "Y", "Y", "Y", "R", "R", "R", "R", "R", "R", "R"],
  [ 91, 94,  "W", "W", "G", "G", "G", "Y", "Y", "Y", "Y", "Y", "R", "R", "R", "R", "R", "R", "R", "R"],
  [ 95, 97,  "W", "W", "G", "G", "Y", "Y", "Y", "Y", "Y", "R", "R", "R", "R", "R", "R", "R", "R", "R"],
  [ 98, 99,  "W", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R"],
  [100,100,  "W", "W", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R", "R"]
];

// Rank index for UNIVERSAL_TABLE columns
export const UNIVERSAL_TABLE_RANK_INDEX = {
  "Shift-0": 0, "Feeble": 1, "Poor": 2, "Typical": 3, "Good": 4,
  "Excellent": 5, "Remarkable": 6, "Incredible": 7, "Amazing": 8,
  "Monstrous": 9, "Unearthly": 10, "Shift X": 11, "Shift Y": 12,
  "Shift Z": 13, "Class 1000": 14, "Class 3000": 15, "Class 5000": 16,
  "Beyond": 17
};

// Lookup function: given a rank name and d100 roll, return color string
export function lookupUniversalTable(rank, roll) {
  const col = UNIVERSAL_TABLE_RANK_INDEX[rank];
  if (col === undefined) return "white";
  for (const row of UNIVERSAL_TABLE) {
    if (roll >= row[0] && roll <= row[1]) {
      return { W: "white", G: "green", Y: "yellow", R: "red" }[row[col + 2]] || "white";
    }
  }
  return "white";
}

// Color-to-label maps for each action column
export const ACTION_COLUMN_RESULTS = {
  BA: { ability: "fighting",  white: "Miss",    green: "Hit",     yellow: "Slam",     red: "Stun" },
  EA: { ability: "fighting",  white: "Miss",    green: "Hit",     yellow: "Stun",     red: "Kill" },
  Sh: { ability: "agility",   white: "Miss",    green: "Hit",     yellow: "Bullseye", red: "Kill" },
  TE: { ability: "agility",   white: "Miss",    green: "Hit",     yellow: "Stun",     red: "Kill" },
  TB: { ability: "agility",   white: "Miss",    green: "Hit",     yellow: "Hit",      red: "Stun" },
  En: { ability: "agility",   white: "Miss",    green: "Hit",     yellow: "Bullseye", red: "Kill" },
  Fo: { ability: "agility",   white: "Miss",    green: "Hit",     yellow: "Bullseye", red: "Stun" },
  Gp: { ability: "strength",  white: "Miss",    green: "Miss",    yellow: "Partial",  red: "Hold" },
  Gb: { ability: "strength",  white: "Miss",    green: "Take",    yellow: "Grab",     red: "Break" },
  Es: { ability: "strength",  white: "Miss",    green: "Miss",    yellow: "Escape",   red: "Reverse" },
  Ch: { ability: "endurance", white: "Miss",    green: "Hit",     yellow: "Slam",     red: "Stun" },
  Do: { ability: "agility",   white: "None",    green: "-2 CS",   yellow: "-4 CS",    red: "-6 CS" },
  Ev: { ability: "fighting",  white: "Autohit", green: "Evasion", yellow: "+1 CS",    red: "+2 CS" },
  Bl: { ability: "strength",  white: "-6 CS",   green: "-4 CS",   yellow: "-2 CS",    red: "+1 CS" },
  Ca: { ability: "agility",   white: "Autohit", green: "Miss",    yellow: "Damage",   red: "Catch" },
  St: { ability: "endurance", white: "1-10",    green: "1",       yellow: "No",       red: "No" },
  Sl: { ability: "endurance", white: "Gr.Slam", green: "1 area",  yellow: "Stagger",  red: "No" },
  Ki: { ability: "endurance", white: "En.Loss", green: "E/S",     yellow: "No",       red: "No" }
};

// ══════════════════════════════════════════════════════════════
// EQUIPMENT: WEAPONS
// ══════════════════════════════════════════════════════════════
// Range: max range in areas. -1CS per area beyond first for weapons (not powers).
// Price: Resource rank to meet/beat on Resource FEAT.
// Black market: +1CS cost. Illegal items = Other Crime to possess.
// Rate: shots per round. "burst" = up to 3 adjacent targets, 1 roll.
//   "scatter" = all in 1 area of target hit.
// Shots: rounds before reload (1 round to reload; Bow talent may negate).
// Damage: standard ammo. Stun weapons have Intensity instead.
// Type: S=Shooting, E=Energy, F=Force column on Universal Table.

export const SHOOTING_WEAPONS = {
  // Handguns
  cheapHandgun:      { name: "Cheap Handgun",       range: "Fe",  price: "Pr", damage: 6,  type: "S", rate: 1, shots: 6,  material: "Pr", notes: "One-handed, no special ammo" },
  handgun:           { name: "Handgun/Pistol",       range: "Ty",  price: "Ty", damage: 6,  type: "S", rate: 1, shots: "6,8,9", material: "Ex", notes: "One-handed" },
  targetPistol:      { name: "Target Pistol",        range: "Ty",  price: "Ex", damage: 6,  type: "S", rate: 1, shots: 1,  material: "Ex", notes: "One-handed, no range penalty when firing two-handed" },
  variablePistol:    { name: "Variable Pistol",      range: "Gd",  price: "Ty", damage: 6,  type: "S", rate: 1, shots: "6,8,9", material: "Ex", notes: "One-handed, may change ammo type in field" },
  gyroJetPistol:     { name: "GyroJet Pistol",       range: "Ex",  price: "Ex", damage: 10, type: "S", rate: "1 per 2", shots: 3, material: "Gd", notes: "One-handed, gyro-jet ammo only, illegal" },
  laserPistol:       { name: "Laser Pistol",         range: "Rm",  price: "In", damage: 10, type: "E", rate: 1, shots: 10, material: "Pr", notes: "One-handed, power pack, illegal" },
  stunPistol:        { name: "Stun Pistol",          range: "Rm",  price: "Pr", damage: null, type: "stun", rate: 1, shots: 10, material: "Pr", notes: "One-handed, power pack, Typical Intensity stunning" },
  concussionPistol:  { name: "Concussion Pistol",    range: "In",  price: "In", damage: 10, type: "F", rate: 1, shots: 5, material: "Ty", notes: "One-handed, power pack, illegal" },
  plasmaBeam:        { name: "Plasma Beam Handgun",  range: "Am",  price: "Mn", damage: 20, type: "F", rate: 1, shots: 10, material: "Ex", notes: "One-handed, power pack" },
  machinePistol:     { name: "Machine Pistol",       range: "Ex",  price: "Rm", damage: 20, type: "S", rate: 1, shots: 6, material: "Ex", notes: "One-handed, bursts, military" },

  // Rifles
  rifle:             { name: "Rifle",                range: "Ty",  price: "Gd", damage: 10, type: "S", rate: 1, shots: 4, material: "Gd", notes: "Two-handed, fire one-handed at -2CS" },
  huntingRifle:      { name: "Hunting Rifle",        range: "Gd",  price: "Gd", damage: 10, type: "S", rate: 1, shots: "6,7,8", material: "Gd", notes: "Two-handed" },
  sniperRifle:       { name: "Sniper Rifle",         range: "Gd",  price: "Gd", damage: 15, type: "S", rate: 1, shots: 4, material: "Gd", notes: "Two-handed, no range penalty" },
  assaultRifle:      { name: "Assault Rifle",        range: "Ex",  price: "Rm", damage: 10, type: "S", rate: 2, shots: 20, material: "Gd", notes: "Military" },
  laserRifle:        { name: "Laser Rifle",          range: "Rm",  price: "In", damage: 20, type: "S", rate: 1, shots: 20, material: "Ty", notes: "Power pack, illegal" },
  stunRifle:         { name: "Stun Rifle",           range: "Rm",  price: "In", damage: null, type: "stun", rate: 1, shots: 20, material: "Ty", notes: "Power pack, illegal, Remarkable Intensity stunning" },
  concussionRifle:   { name: "Concussion Rifle",     range: "Rm",  price: "Rm", damage: 10, type: "F", rate: 1, shots: 12, material: "Gd", notes: "Power pack, illegal" },
  automaticRifle:    { name: "Automatic Rifle",      range: "Ex",  price: "Ex", damage: 15, type: "S", rate: 1, shots: 20, material: "Gd", notes: "Military, bursts" },
  shotgun:           { name: "Shotgun",              range: "Gd",  price: "Ty", damage: 20, type: "S", rate: "1,2", shots: 2, material: "Gd", notes: "Bursts, may fire 1 or both barrels" },
  riotGun:           { name: "Riot Gun",             range: "Gd",  price: "Pr", damage: 15, type: "S", rate: 1, shots: 6, material: "Ex", notes: "Fire one-handed at -1CS, fires canister shot" },
  grenadeLauncher:   { name: "Grenade Launcher",     range: "Ex",  price: "In", damage: null, type: "S", rate: "1 per 2", shots: 1, material: "Gd", notes: "Military, fires grenades, no range penalty" },

  // Heavy weapons
  subMachineGun:     { name: "Sub-Machine Gun",      range: "Rm",  price: "Rm", damage: 25, type: "S", rate: 1, shots: 7, material: "Gd", notes: "Fire one-handed at -2CS, bursts, military" },
  machineGun:        { name: "Machine Gun",          range: "In",  price: "In", damage: 30, type: "S", rate: 1, shots: 20, material: "Gd", notes: "Bursts, military, not one-handed" },
  flamethrower:      { name: "Flamethrower",         range: "In",  price: "In", damage: 30, type: "E", rate: 1, shots: 5, material: "Ty/Gd", notes: "Military, scatter, burns In(40) first round then 10/round for 1-10 rounds" },
  bazooka:           { name: "Bazooka",              range: "In",  price: "In", damage: 40, type: "S", rate: "1 per 2", shots: 1, material: "Gd", notes: "Military, two men to fire" },
  law:               { name: "LAW",                  range: "Am",  price: "Am", damage: 40, type: "S", rate: 1, shots: 6, material: "Gd", notes: "Military, one man to fire" },
  lightArtillery:    { name: "Light Artillery",      range: "Am",  price: "Am", damage: 40, type: "S", rate: 1, shots: 20, material: "Ex", notes: "Military, two men to operate" },
  stunCannon:        { name: "Stun Cannon",          range: "Am",  price: "Am", damage: null, type: "stun", rate: 1, shots: 10, material: "Rm", notes: "Two men, one-man at -1CS, In Intensity stunning, bursts, power pack" },
  concussionCannon:  { name: "Concussion Cannon",    range: "Am",  price: "Am", damage: 40, type: "F", rate: 1, shots: 10, material: "Rm", notes: "Power pack, stationary" },
  laserCannon:       { name: "Laser Cannon",         range: "Am",  price: "Mn", damage: 30, type: "E", rate: 1, shots: 10, material: "Ex", notes: "Power pack, stationary" },
  heavyArtillery:    { name: "Heavy Artillery",      range: "Mn",  price: "Mn", damage: 50, type: "S", rate: 1, shots: 30, material: "Rm", notes: "Military, two men to fire, scatter" },
  superHeavy:        { name: "Superheavy Artillery",  range: "Un",  price: "Un", damage: 50, type: "S", rate: 1, shots: 30, material: "In", notes: "Stationary, military, two men to fire" },
  missileLauncher:   { name: "Missile Launcher",     range: "In",  price: "In", damage: null, type: "missile", rate: 1, shots: 10, material: "Rm", notes: "Fires missiles, military" },

  // Bows
  regularBow:        { name: "Regular Bow",          range: "Pr",  price: "Ex", damage: 6,  type: "S", rate: 1, shots: 1, material: "Pr", notes: "Two-handed, -1CS without Bow talent" },
  longBow:           { name: "Long Bow",             range: "Ty",  price: "Rm", damage: 10, type: "S", rate: 1, shots: 1, material: "Ty", notes: "Two-handed, -1CS without Bow talent" },
  compoundBow:       { name: "Compound Bow",         range: "Ex",  price: "In", damage: 15, type: "S", rate: 1, shots: 1, material: "Gd", notes: "Two-handed, -1CS without Bow talent" },
  crossbow:          { name: "Crossbow",             range: "Gd",  price: "Rm", damage: 10, type: "S", rate: "1 per 2", shots: 1, material: "Ty", notes: "One-handed at -2CS, -1CS without Bow talent" }
};

export const MELEE_WEAPONS = {
  knife:      { name: "Knife",          price: "Fe", damage: 10, type: "EA,ET", material: "Ex", notes: "Blade up to 12 inches, may be thrown" },
  sword:      { name: "Sword",          price: "Pr", damage: 10, type: "EA",    material: "Ex", notes: "One-handed, blade over 12 inches" },
  greatSword: { name: "Great Sword",    price: "Gd", damage: 15, type: "EA",    material: "Ex", notes: "Two-handed, one-handed at -2CS" },
  axe:        { name: "Axe",            price: "Gd", damage: 5,  type: "EA",    material: "Gd", notes: "One-handed chopping weapon" },
  greatAxe:   { name: "Great Axe",      price: "Ex", damage: 15, type: "EA",    material: "Gd", notes: "Two-handed" },
  spear:      { name: "Spear",          price: "Fe", damage: 10, type: "EA,ET", material: "Gd", notes: "Handle over 1ft, normally thrown or two-handed" },
  club:       { name: "Club",           price: "Fe", damage: 10, type: "BA,BT", material: "Gd", notes: "Includes makeshift weapons (chairs, tables)" },
  shuriken:   { name: "Shuriken",       price: "Fe", damage: 10, type: "ET",    material: "Ex", notes: "Throwing stars, max range 3 areas" },
  boomerang:  { name: "Boomerang",      price: "Pr", damage: 10, type: "BT",    material: "Gd", notes: "Returns only with Throwing talent" },
  whipLeather:{ name: "Whip (leather)", price: "Pr", damage: 0,  type: "Gp,Gb", material: "Ty", notes: "Grapple/Grab at range, effective Str = material strength" },
  whipMetal:  { name: "Whip (metal)",   price: "Gd", damage: 10, type: "Gp,Gb", material: "Gd", notes: "Grapple/Grab at range, effective Str = material strength" }
};

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

export const GRENADES = {
  fragment:    { cost: "Ex", damage: "Rm (30) EA", effect: "Scatter, all in area" },
  smoke:       { cost: "Gd", damage: null, effect: "Ex Intensity smoke, -2CS FEATs in area" },
  tearGas:     { cost: "Ex", damage: null, effect: "Ty Intensity tear gas" },
  knockoutGd:  { cost: "In", damage: null, effect: "Gd Intensity KO gas" },
  knockoutEx:  { cost: "Am", damage: null, effect: "Ex Intensity KO gas" },
  knockoutRm:  { cost: "Mn", damage: null, effect: "Rm Intensity KO gas" },
  flash:       { cost: "Ex", damage: null, effect: "Am Intensity flash, affects those facing" },
  concussive:  { cost: "Rm", damage: "40 BA", effect: "All in area" },
  sonic:       { cost: "In", damage: "20 Energy", effect: "All in area + Ex Intensity stunning" }
};

export const GASES = {
  smoke:      { intensity: "Excellent", effect: "-2CS on all FEATs in smoke-filled area" },
  tearGas:    { intensity: "Typical",   effect: "Endurance FEAT or no actions (movement only) until leaving + 1 round" },
  knockoutGas:{ intensities: "Various (Fe through Un)", effect: "Endurance FEAT or KO 1-10 rounds. Health unaffected." },
  costs: {
    smoke: "Gd", tearGas: "Ex",
    knockoutFe: "Ex", knockoutPr: "Rm", knockoutTy: "Rm", knockoutGd: "In",
    knockoutEx: "In", knockoutRm: "Am", knockoutIn: "Am", knockoutAm: "Mn",
    knockoutMn: "Mn", knockoutUn: "Un"
  }
};

export const MISSILES = {
  types: {
    standard:  { body: "Ex", control: "Rm", speed: "Ex" },
    highTech:  { body: "Ex", control: "In", speed: "Ex" },
    highSpeed: { body: "Ex", control: "In", speed: "Am" }
  },
  // No control device: straight line to target location at firing, Shift 0 column to hit.
  controlSystems: {
    wireGuided:     "Wire (Fe material) from tail. Controller Agility to hit. Sever = no control. Max 10 areas, no range penalty.",
    teleGuided:     "Nose camera, operator up to 5 miles. Lesser of Control or controller Agility.",
    computerGuided: "Programmed for target. Pr ability to distinguish similar targets.",
    radioLinked:    "Homing, tracks wavelength. Destroy tracer = out of control.",
    heatSeeking:    "Locks on hottest flame source in path. Only sidetracked by higher heat."
  },
  payloads: {
    standard:              { damage: 40,  type: "EA", area: "all in target area" },
    concentratedExplosive: { damage: 40,  type: "EA", area: "target only" },
    highExplosive:         { damage: 70,  type: "EA", area: "all in target, 20pts adjacent" },
    incendiary:            { damage: 40,  type: "E",  area: "all in area, burns Gd Intensity/round" },
    gas:                   { damage: null, type: null, area: "Am Intensity tear/KO gas, all in area" }
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
// MAGIC
// ══════════════════════════════════════════════════════════════
// Magic in FASERIP duplicates super-human Powers from a magical base.
// Power ranks generated normally = Spell rank.
// Casting uses Psyche to determine success; effects use Power rank.
// Example: Ex Psyche + Rm Mind Control → cast on Ex column, Rm Intensity to break.

// ── ENERGY TYPES ──
export const MAGIC_ENERGY_TYPES = {
  personal: {
    description: "Derives from caster's spirit, mind, body. Affects only caster or willing/mystically-linked target.",
    feat: "Green Psyche FEAT (Red if target restrained but unwilling)",
    requirements: "No chanting or gestures needed",
    cost: "1 Health point per turn of use. Health 0 = unconscious (no Endurance FEAT)."
  },
  universal: {
    description: "Ambient energies of caster's home dimension. Illusions, most attacks, teleportation.",
    feat: "Spells affecting target Psyche/abilities: target gets Psyche FEAT vs caster Psyche as Intensity",
    failPenalty: "If target resists: caster Psyche reduced 1 rank for 1-10 turns. Below Good = cannot cast.",
    requirements: "Gesture or chant required (hands and mouth free)"
  },
  dimensional: {
    description: "Energies from other dimensions, granted by powerful beings or native to those dimensions.",
    feat: "Popularity FEAT treating caster Psyche as Popularity",
    requirements: "Both chanting and gestures required. Automatic initiative roll of 1.",
    contactRelationship: {
      friendly: "Listed as Contact. Failed FEAT: spell goes off at -3CS power rank.",
      neutral: "Not listed. Failed FEAT: spell fails, nothing happens.",
      unfriendly: "Judge decides: 1-7 = Neutral, 8-10 = Hostile.",
      hostile: "Retribution. Gate opened, opponent aided, caster teleported to hostile dimension, etc."
    }
  }
};

// ── SPELL CASTING COLUMN SHIFTS ──
export const MAGIC_CASTING_SHIFTS = {
  penalties: [
    { cs: -1, condition: "Target from different dimension than caster" },
    { cs: -1, condition: "Caster is in astral form" },
    { cs: -2, condition: "Target more than 30ft or occupies more than one area" }
  ],
  bonuses: [
    { cs: +1, condition: "Spell cast in area familiar to mage or invoked Powers (home turf)" },
    { cs: +2, condition: "Spell cast in ceremony" },
    { cs: +2, condition: "Spell from ancient book/tome found during campaign" },
    { cs: +3, condition: "Target is willing (dimensional and universal energies)" }
  ],
  // Ceremony: established ritual, takes rounds equal to spell rank number.
  // Universal and Dimensional energies only.
  // All shifts are cumulative. May reduce spell below Feeble to Shift 0 = impossible.
};

// ── ELDRITCH BOLTS & SHIELDS ──
// Any starting mage may choose these instead of random Powers.
// Initial rank = caster's Psyche rank and rank number.
export const ELDRITCH_SPELLS = {
  bolt: {
    description: "Bolt of magical power (Bolt of Bedevilment, etc.)",
    range: "Per spell range table",
    damage: "Power rank. May reduce Health OR Karma (target's choice or caster's).",
    type: "If attacking Health, treat as Force attack."
  },
  shield: {
    description: "Shield of mystical energy",
    protection: "Body Armor equal to caster's rank number. Proof against magical attacks.",
    breaking: "If attacker targets shield: treat as breaking attempt (attacker bolt = Str, shield = material).",
    broken: "Caster takes no damage that round but no shield until raised next round.",
    limit: "Protects from all magic up to caster's Psyche rank."
  }
};

// ── MAGIC KARMA & ADVANCEMENT ──
export const MAGIC_KARMA = {
  gains: "Standard rate",
  losses: "2x standard rate (mages more aware of karmic consequences)",
  powerStuntCost: {
    personalUniversal: 10,  // vs 100 for normal heroes
    dimensional: 50
  },
  newSpells: {
    advancement: "Normal advancement costs halved in Karma",
    foundSpell: "500 Karma first time cast, regardless of effect. Then added to repertoire.",
    sources: "Mystic texts, ancient ruins, taught by higher-ability individuals",
    warning: "Written spells are vague about power level. May have unknown requirements or curses."
  },
  dimensionalContacts: "2x normal Contact Karma cost. Must have existing contact with plane."
};

// ── MAGICAL POWERS BY ENERGY TYPE ──
export const MAGIC_POWERS = {
  personal: {
    resistances: ["Gold", "Corrosives", "Disease", "Electricity", "Emotion Attacks", "Fire/Heat", "Radiation", "Toxins"],
    senses: ["Combat Sense", "Enhanced Senses", "Infravision", "Protected Senses",
             "Astral Detection", "Emotion Detection", "Energy Detection", "Magic Detection",
             "Magnetic Detection", "Psionic Detection", "Tracking Ability"],
    bodyDefensive: ["Absorption", "Body Armor", "Healing", "Pheromones", "Recovery"],
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
    bodyOffensive: ["Blinding Touch", "Corrosive Touch", "Energy Touch", "Health-Drain Touch",
                    "Paralyzing Touch", "Rotting Touch", "Claws", "Extra Attacks", "Extra Body Parts"],
    bodyDefensive: ["Absorption", "Damage Transfer", "Healing", "Recovery", "Regeneration", "Water Breathing"],
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
    bodyDefensive: ["Body Armor (Seraphim)", "Extra Body Parts",
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
// Rank index matches UNIVERSAL_TABLE_RANK_INDEX (0=Sh0 through 17=Beyond).

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

export const HARDWARE_WEAPON_RANGE_RANKS = {
  "Touch":  null,  // -1CS to effective cost
  "1":      "Poor",
  "2":      "Typical",
  "3-4":    "Good",
  "5-6":    "Excellent",
  "7-8":    "Remarkable",
  "9-11":   "Incredible",
  "12-20":  "Amazing",
  "21-40":  "Monstrous",    // ~1 mile
  "41-60":  "Unearthly",
  "61-80":  "Shift X",      // ~2 miles
  "81-160": "Shift Y",      // ~4 miles
  "161-400":"Shift Z",      // ~10 miles
  "10-100mi":"Class 1000",
  "intercontinental": "Class 3000",
  "interplanetary":   "Class 5000"
};

export const HARDWARE_EFFECTIVE_COST_MODIFIERS = {
  weapons: {
    touchOnly: -1,        // weapon must touch target to inflict damage
    thrown: 0             // thrown items (grenades, shuriken) ignore range modifier, no touch bonus
  },
  vehicles: {
    multiArea: +1,        // occupies more than one area (compartmented = always multi-area)
    noProtection: -1,     // craft offers no protection
    gev: +1               // ground effect vehicle
  },
  powerSuits: {
    perPowerAdded: +1,    // each Power added (if Power rank >= highest stat, becomes applicable rank instead)
    // Power Suit CS Option: +1CS per column shift to a primary ability (instead of setting fixed values)
    perAbilityCS: +1      // per CS modifier to a primary ability
  },
  robots: {
    humanoid: -1,
    imitateSpecific: +1   // duplicates a specific individual
    // NPC robots: no Intuition/Psyche. Typical Reason (limited), Good Reason (can talk).
  },
  other: {
    unreproducibleTech: "Monstrous", // additional applicable rank if tech doesn't exist in 1980s
    invisible: +2,        // device cannot normally be seen
    pocketSized: +1,
    portable: +1,
    multiArea: +1         // occupies more than one area
  }
};

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

// ── INVENTION SUCCESS (Reason FEAT) ──
export const HARDWARE_SUCCESS = {
  modifiers: {
    assistant: +1,        // max +1, assistant no less than 1 rank lower
    perTalent: +1,        // max +3CS from applicable talents
    rushedTime: -1,       // shortened by working straight through
    perSpecialReq: -1,    // max -3CS
    priorExistence: +1    // device existed from failed experiment or kit-bash
  },
  // If effective cost > inventor Reason (after shifts): read result one color lower.
  results: {
    white: "Missed something. Start again. No new Resource FEAT, same time, +1 special requirement added.",
    green: "Works but fails in 1-10 turns. May destroy/damage. Repairs as White result.",
    yellow: "Working prototype. -1CS all abilities until fine-tuned (1-10 additional days).",
    red: "Success! Device works exactly as designed."
  },
  karma: "May add Karma before roll, but amount must be decided before rolling."
};

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

// ── REPAIRS ──
export const HARDWARE_REPAIRS = {
  repairCenter: {
    cost: "Equal to effectiveness rank",
    process: "Restores 1 rank per Reason FEAT (Reason of person or center value, whichever lower)",
    time: "Effective cost rank number in HOURS (not days)",
    automatic: "If center rank > device rank, repair is automatic. Otherwise FEAT needed."
  },
  fieldRepair: {
    feat: "Reason FEAT, Intensity = original stat being repaired",
    duration: "Lasts 1-10 hours, then damage returns +1 additional rank",
  },
  beyondRepair: "Abilities reduced below Feeble cannot be repaired. Materials salvageable for new inventions (bonus to success roll)."
};

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
    ultimateSkill:   { desc: "Unearthly ability in one Talent (Weapon, Fighting, Scientific, or Other skills). Not Professional or Mystic/Mental." },
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
  bodyOffensive: {
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
  bodyDefensive: {
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

export const TALENTS = {

  // ── WEAPON SKILLS ──
  weaponSkills: {
    guns:             { desc: "+1CS Agility when firing handguns, rifles, submachine guns (including laser/stun/concussion)." },
    thrownWeapons:    { desc: "+1CS Agility for weapons designed to be thrown (spears, daggers, shuriken, disks)." },
    bows:             { desc: "+1CS to hit with all bows/crossbows. Without talent: -1CS. Fire and reload in 1 round. May fire multiple arrows on Agi FEAT." },
    bluntWeapons:     { desc: "+1CS to hit with weapons using Blunt Attacks column." },
    sharpWeapons:     { desc: "+1CS to hit with weapons using Edged Attack column (swords, daggers, spears). Not claws/natural extensions." },
    orientalWeapons:  { desc: "+1CS Fighting or Agility with shuriken, crossbows, sais, oriental swords/daggers (katana, kris)." },
    marksman:         { desc: "+1CS to hit with any line-of-sight distance weapon. No range penalties." },
    weaponsMaster:    { desc: "+1CS to hit with any weapon requiring Fighting FEAT." },
    weaponsSpecialist:{ desc: "+2CS with single weapon of choice (missile or melee). +1 initiative with that weapon." }
  },

  // ── FIGHTING SKILLS ──
  // Cumulative with each other and with Weapon Talents where applicable.
  fightingSkills: {
    martialArtsA: { desc: "Can Stun/Slam opponent regardless of comparative Str/End (judo/karate style)." },
    martialArtsB: { desc: "+1CS Fighting in unarmed combat (boxing style)." },
    martialArtsC: { desc: "+1CS Str for Grappling (including damage), +1CS Str for Escaping, +1CS Agi for Dodging." },
    martialArtsD: { desc: "Ignore Body Armor (not FF) for Stun/Slam results. No damage needed to force check. Must study target 2 rounds first." },
    martialArtsE: { desc: "+1 initiative in unarmed combat." },
    wrestling:    { desc: "+2CS Grappling attacks (no damage bonus). Stacks with MA-B for +3CS hit, +1CS damage." },
    thrownObjects:{ desc: "+1CS Throwing attacks (Edged and Blunt) and Catching. Stacks with Thrown Weapons for +2CS on thrown weapons." },
    acrobatics:   { desc: "+1CS when dodging, evading, and escaping." },
    tumbling:     { desc: "Agility FEAT to land feet-first after any non-damaging fall." }
  },

  // ── PROFESSIONAL SKILLS ──
  // May increase initial Resources through employment.
  professionalSkills: {
    medicine:          { desc: "Revive Shift 0 characters up to 20 turns. Restore 1 End rank/week beyond natural healing. +1CS Reason for medical/poison/surgery." },
    law:               { desc: "+1CS all FEATs involving law/legal procedure. May pass bar (Gd Reason FEAT). Without: more frequent Reason FEATs." },
    lawEnforcement:    { desc: "Includes Gun and Law talents. May legally carry gun and make arrests if active member." },
    pilot:             { desc: "+1CS all FEATs involving controlled aircraft (Control, Agi, Reason). May extend to spacecraft with appropriate background." },
    military:          { desc: "+1CS all FEATs in military matters. May take armed services Contact." },
    businessFinance:   { desc: "Min Resources = Good. +1CS FEATs involving money. Gains Professional Contact." },
    journalism:        { desc: "+2 additional Contacts (media-connected: newspapers, radio/TV, law enforcement sources, political, criminal snitches)." },
    engineering:       { desc: "+1CS all FEATs involving building things, including Resource FEAT for construction." },
    criminology:       { desc: "+1CS Reason and Intuition for criminal practices. Gains Contact in police or crime." },
    psychiatry:        { desc: "+1CS all FEATs involving the mind. +1CS on Mental Control, Domination, Hypnosis, Emotion Control, Mental Probe FEATs." },
    detectiveEspionage:{ desc: "+1CS to discover crime clues. Gains Contact in crime, law enforcement, law, or espionage." }
  },

  // ── SCIENTIFIC SKILLS ──
  // +1CS Reason FEATs in specialty. Only one scientific talent applies at a time.
  scientificSkills: {
    chemistry:    { desc: "+1CS chemistry: formulas, inorganic poison cures, identify chemicals by smell/touch/taste." },
    biology:      { desc: "+1CS biology: animal/plant ID, organic poison cures, disease research." },
    geology:      { desc: "+1CS earth science: volcanic activity, surrounding geology, rock types, mineral ID." },
    genetics:     { desc: "+1CS genetics: new life forms, mutant understanding, disease research." },
    archaeology:  { desc: "+1CS past: paleontology, historical records, ancient myths/legends." },
    physics:      { desc: "+1CS physics/astrophysics: motion, flight, planets, stars." },
    computers:    { desc: "+1CS computers, computer-controlled equipment, artificial intelligences." },
    electronics:  { desc: "+1CS electronic devices, creation and repair." }
  },

  // ── MYSTIC AND MENTAL SKILLS ──
  mysticMentalSkills: {
    trance:            { desc: "Self-induced trance. Appears dead (Int FEAT to check). Minimal food/water needs. Regain End ranks at 1/day." },
    mesmerismHypnosis: { desc: "Primitive Mind Control at Power rank = Reason. Info as Mental Probe. Post-hypnotic suggestions. Breaks if forced to act against nature. Fades 1-10 hours." },
    sleightOfHand:     { desc: "Palm small items, appear/disappear at Agi +1CS." },
    resistDomination:  { desc: "Psi-Screen at Psyche +1CS. Passive only, no other benefit." },
    occultLore:        { desc: "+1CS Reason FEATs involving magical items, societies, antiquities, runes, forgotten lore." },
    mysticBackground:  { desc: "Potential for magical Powers. Initial Powers may be spells (Personal/Universal/Dimensional). Requires Judge approval." }
  },

  // ── OTHER TALENTS ──
  otherTalents: {
    artist:         { desc: "Create art (painting, sculpting, writing). 1-10 weeks per work. Earns 10 Karma × weeks spent." },
    languages:      { desc: "+1 language at start. Additional languages at half Talent cost (500 Karma). Required before learning other languages." },
    firstAid:       { desc: "Halt End rank loss immediately. Recover 1 rank immediately (once per situation). Stabilize Shift 0 up to 5 rounds after reaching it." },
    repairTinkering:{ desc: "+1CS Reason FEATs for repair/modification of existing items (not building new). Cumulative with other talents (e.g., Engineering)." },
    trivia:         { desc: "+1CS Reason FEATs on one specific subject (old movies, military history, sports, etc.). Must be specific, not general." },
    performer:      { desc: "Acting, singing, dancing, etc. Earns 10 Karma per week of performance." },
    animalTraining: { desc: "Train animals via Reason FEAT. If hero has Animal Empathy or Animal Comm/Control, those Powers +1CS." },
    heirToFortune:  { desc: "Min Resources = Remarkable. Generation-only talent. Cannot be gained later." },
    student:        { desc: "Generation-only. No other initial Talents. New Talents at discount: 1000 from PC, 800 from NPC. May maintain Talent advancement alongside other advancement." },
    leadership:     { desc: "Karma Pool gains +50 bonus if recognized as team leader. Max 1 leader per pool. Points deducted if leader leaves (not returned to leader)." }
  }
};

// ══════════════════════════════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════════════════════════════
// Contacts provide information, skills, heroic help, and/or equipment.
// More powerful contacts = more likely to request favors/missions.
// Contact addition cost: 500 + 10 × Contact's Resource rank#.
// Dimensional contacts: 2× normal cost.

export const CONTACTS = {

  professional: {
    medicine:        { resources: "Varies",     desc: "Medical advice/services, free or affordable. Doctor, clinic, or researcher." },
    law:             { resources: "Varies",     desc: "Legal assistance at reduced fee, free advice. Lawyer on retainer or personal friend." },
    lawEnforcement:  { resources: "Up to Rm",   desc: "Police contact. Patrolman (Ex knowledge), Detective (Rm investigation), Captain/Commissioner (Rm Resources)." },
    military:        { resources: "Up to Am",   desc: "Armed services contact, sergeant through Joint Chiefs." },
    businessWorld:   { resources: "Up to In",   desc: "Business/finance contact, accountant through captain of industry." },
    journalism:      { resources: "Pr",         desc: "Media contact. Rm knowledge in their field. Poor Resources (except equipment vans)." },
    crime:           { resources: "Up to Rm+",  desc: "Criminal underworld. Street snitch to Maggia hierarchy. WARNING: Karma-losing situations likely. High-level may manipulate hero." },
    engineering:     { resources: "Varies",     desc: "Builder/constructor, independent or corporate. May aid in device construction." },
    psychiatry:      { resources: "Varies",     desc: "Psychiatry/psychoanalysis professional." },
    espionage:       { resources: "Up to In/Am",desc: "FBI, CIA, NSA, KGB, Interpol, MI5, SHIELD, HYDRA. Info up to Rm. Equipment: In (Am for SHIELD/HYDRA). Will request return favors." },
    heroGroup:       { resources: "Varies",     desc: "Connection to super-hero team. Use equipment, call for emergency, use HQ, training. Enemies of group become your enemies." }
  },

  scientific: {
    // All scientific contacts: Good to Rm Resources, min Excellent Reason, have listed Talent.
    desc: "Chemistry, Biology, Geology, Genetics, Archaeology, Physics, Computers, Electronics. Also Acting, Performing.",
    resources: "Gd to Rm",
    reason: "Min Excellent"
  },

  political: {
    local:          { resources: "Varies",     desc: "Alderman, mayor, councilman. Info on neighborhood." },
    state:          { resources: "Up to Rm",   desc: "Governor's office, state rep, state agency. Good services/info." },
    national:       { resources: "Up to Mn",   desc: "Congressional aide, congressman, Executive Branch, agencies. More powerful = more favors called in." },
    otherNational:  { resources: "Up to Mn",   desc: "Foreign government. May create difficulties with other political contacts if known." },
    international:  { resources: "Up to Mn",   desc: "UN or multi-national organization." },
    planetary:      { resources: "Up to Un+",  desc: "Alien characters only. Rulers/inhabitants of another planet." }
  },

  mystic: {
    mysticArts:  { desc: "Contact aware of extra-dimensional powers." },
    occultLore:  { desc: "Scholar of darker arts, Rm Reason in mystic matters. Advice on writings, spells, curses. Likely a professor, not a true mage." },
    mythology:   { desc: "Similar to Occult Lore but focused on recognized mythology (Olympians, Asgardians, etc.). Specializes in one pantheon." }
  }
};

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

// ── COMPLETE KARMA SUMMARY TABLE ──
export const KARMA_TABLE = {
  // Heroic Actions — Gains
  heroicGains: {
    violentCrimeStop:         30,  violentCrimeArrest:         15,
    destructiveCrimeStop:     20,  destructiveCrimeArrest:     10,
    theftStop:                10,  theftArrest:                 5,
    robberyStop:              20,  robberyArrest:              10,
    misdemeanorStop:           5,  misdemeanorArrest:           5,
    nationalOffenseStop:      20,  nationalOffenseArrest:      10,
    localConspiracyStop:      30,  localConspiracyArrest:      15,
    nationalConspiracyStop:   40,  nationalConspiracyArrest:   20,
    globalConspiracyStop:     50,  globalConspiracyArrest:     25,
    otherCrimeStop:           15,  otherCrimeArrest:            5,
    rescue:                   20,  // per life saved, max 100 per action
    defeatRemarkableFoe:      30,  // = highest rank# of foe (Rm+ only)
    defeatIncredibleFoe:      40,
    defeatAmazingFoe:         50,
    defeatMonstrousFoe:       75,
    defeatUnearthlyFoe:      100
  },

  // Heroic Actions — Losses
  heroicLosses: {
    commitViolentCrime:      -60,  // 2× listed values
    commitDestructiveCrime:  -40,
    commitTheft:             -20,
    commitMisdemeanor:       -10,
    commitNationalOffense:   -40,
    commitOtherCrime:        -10,
    publicDefeat:            -40,  // 3+ witnesses
    privateDefeat:           -20,  // no witnesses
    permitViolentCrime:      -15,  // = arrest value
    permitDestructiveCrime:  -10,
    permitTheft:              -5,
    permitRobbery:           -10,
    permitMisdemeanor:        -5,
    permitNationalOffense:   -10,
    permitOtherCrime:         -5,
    propertyDestruction:      -5,  // per area damaged
    death:               "ALL",   // all Karma to 0
    nobleDeath:              -50,  // per hero
    mysteriousDeath:         -50,  // per hero
    selfDestruction:         -50   // per hero
  },

  // Personal Karma
  personalKarma: {
    makeCommitment:            5,  // show up for date, meeting, etc.
    failCommitment:          -10,
    leaveCommitmentEarly:     -5,
    weeklyAward:              10,  // max, for fulfilling daily life obligations
    charityAppearance:    "Pop rank# (max 20)", // 1 per week, Red Pop FEAT to arrange
    charityAct:           "10-40", // auto=10, green=20, yellow=30, red=40
    charityDonation:      "Resource FEAT rank# (min 10 if no FEAT needed)",
    negativePopUse:       "-Pop rank#"  // each time negative Pop used to influence
  },

  // Gaming Awards
  gamingAwards: {
    rolePlay:                 10,  // max, for good character portrayal
    stumpTheJudge:            15,  // max, for creative Power/stunt use (once per stunt)
    humor:                     5   // for stopping play with a good joke/pun
  }
};

// ── SPENDING KARMA ──
export const KARMA_SPENDING_RULES = {
  dieRolls: {
    minimum: 10,        // must commit at least 10 (or remaining if < 10)
    method: "Declare before rolling. After roll, add spent amount to result. Must declare intent, not amount.",
    cannotModify: ["Resource FEATs", "Popularity FEATs", "Blindsided/unexpected attack FEATs"]
  },
  combatResults: {
    cost: 50,           // reduce result by one color (red→yellow, etc.)
    when: "Immediately after roll, before any other die rolls",
    note: "For attacks that cannot voluntarily reduce effect (Edged, Shooting, Energy)"
  },
  powerStunts: {
    cost: 100,          // 10 for mage personal/universal, 50 for dimensional
    method: "Describe stunt to Judge. Judge determines if possible and FEAT needed. Spend 100 then roll."
  },
  building: {
    method: "Karma added to invention success roll. Amount must be declared BEFORE rolling (not just intent).",
    default: 10         // if amount not declared, 10 is assumed
  },
  advancement: {
    method: "Set aside Karma into separate fund for specific purpose. Untouchable by normal use or negative modifiers.",
    timing: "End of adventures/sessions only. Never during combat or active adventure.",
    restriction: "May only have ONE advancement fund active at a time. After purchase, may move remainder to new purpose."
  }
};

// ── KARMA POOLS ──
export const KARMA_POOLS = {
  formation: "2+ consenting PC heroes contribute up to current Karma",
  use: "Any member may use pool Karma for die rolls and building. NOT for advancement.",
  types: {
    temporary: "Formed at adventure start, disbanded at end. Normal for pickup groups.",
    permanent: "Heroes who adventure together over multiple sessions. Tracked by one player. Members may draw even if others absent."
  },
  adding: "Group awards may go directly to pool or be split. Individual awards go to individual first, may voluntarily contribute.",
  losses: {
    individual: "Individual losses taken from individual first, then pool if individual runs out.",
    group: "Group loss (everyone defeated) may be taken from pool as one character.",
    death: "If member kills: BOTH individual Karma AND entire pool reduced to 0."
  },
  leaving: "Take equal share (pool ÷ number of members). May only belong to one pool.",
  dissolving: "Unanimous vote or all members leave. Karma returns in equal shares. Cannot reform until next session.",
  leadership: "Leader with Leadership talent: pool gets +50 bonus. Max 1 leader. Deducted if leader leaves.",
  locked: "(Optional) All members agree. Karma in pool cannot be withdrawn, only used for die rolls. Dissolve by unanimous vote only."
};

// ══════════════════════════════════════════════════════════════
// POPULARITY (FULL RULES)
// ══════════════════════════════════════════════════════════════
// Measure of reputation and public image. Depends on public actions and press.
// Awarded day-by-day. Can go negative (unlike Karma).

export const POPULARITY_RULES = {
  awards: {
    defeatNormalVillains:     0,   // goons, thugs, no ability/Power > Excellent
    defeatCostumedVillain:   +2,
    defeatedInPublic:        -5,
    accusedOfCrime:       "−half total", // by organized/respected government agency
    clearedOfCharges:       +10,  // may exceed earlier total
    foundGuilty:        "all to 0", // even if actually innocent (frame)
    mediaAttack:             -5,
    charityWork:             +1,   // publicly reported
    rescue:                  +2
  },

  secretID: {
    desc: "May keep separate Popularity for hero and civilian personas.",
    awards: "Ascribed to persona that performed the action.",
    revealed: "If secret ID becomes public, Popularity = lower of the two values."
  },

  negativePopularity: {
    desc: "All contacts become Neutral (not Friendly). Any Popularity FEAT use costs Karma = Pop rank#.",
    note: "FEATs still work (people obey out of fear), but each use costs Karma."
  },

  mutantPenalty: {
    desc: "All Popularity awards/penalties reduced by 1 for recognized/declared mutants.",
    examples: "No Pop gain from charity. Only +1 for catching criminals. Only -4 for public defeat."
  },

  selfPromotion: {
    desc: "PR campaigns via Karma advancement + good deeds. Charity tied to self-promotion only fulfills advancement requirement, no additional Pop gain."
  }
};

// ══════════════════════════════════════════════════════════════
// ADVANCEMENT (FULL COSTS)
// ══════════════════════════════════════════════════════════════
// Only one advancement fund active at a time. After purchase, remainder may move.
// Karma set aside is untouchable by normal use or negative modifiers.

export const ADVANCEMENT_COSTS = {
  ability: {
    perPoint: "10× current rank number",
    cresting: 400,   // additional cost to cross into next rank
    rationale: "Up to Excellent: no explanation needed. Beyond Excellent or +1 rank above original: must explain."
  },
  resource: {
    perPoint: "10× current rank number",
    cresting: 200
  },
  popularity: {
    perPoint: "10× current rank number",
    cresting: 0,     // no cresting cost
    requirement: "Must have performed 1 publicized charity act in past 3 weeks."
  },
  power: {
    perPoint: "20× current rank number",
    cresting: 500,
    rationale: "Beyond first increase: must explain."
  },
  powerAddition: {
    cost: "3000 + 40× starting rank number",
    robot: "3000 + 10× starting rank number (requires someone capable of modification)",
    rationale: "Always required for new Powers."
  },
  talentAddition: {
    fromNPC: 1000,
    fromPC: 2000,
    student: { fromNPC: 800, fromPC: 1000 },
    rationale: "Must find someone to teach. Must have rationale."
  },
  contactAddition: {
    cost: "500 + 10× Contact's Resource rank number",
    requirement: "Contact must be Friendly or Neutral (not Unfriendly/Hostile).",
    regainLost: "Half the cost of buying that Contact."
  }
};

// ══════════════════════════════════════════════════════════════
// RESOURCES (FULL RULES)
// ══════════════════════════════════════════════════════════════
// Resource FEAT: 1× per week. Cannot be modified by Karma.
// Determines if character can afford something.

export const RESOURCE_RULES = {
  feat: {
    frequency: "Once per week",
    karmaModifiable: false,
    difficulty: {
      auto: "3+ ranks below item cost",
      green: "1-2 ranks below item cost",
      yellow: "Equal to item cost",
      impossible: "Above item cost"
    },
    bankLoan: "+1 rank to Resources for purchase (must be repaid)"
  },
  popularityFEAT: {
    desc: "When borrowing or requesting aid, Popularity FEAT determines reaction.",
    friendly: "green", neutral: "yellow", unfriendly: "red", hostile: "impossible"
  },
  csModifiers: {
    targetBenefits: +2,   // item benefits the target
    danger: -3,           // dangerous situation
    goodValue: -1,
    remarkableValue: -2,
    wontReturn: -2,       // won't be returned
    unique: -3            // unique/irreplaceable item
  },
  negativePopularity: "Always yellow FEAT regardless of relationship.",
  combinedResources: "Two characters within 1 rank of each other may combine for a single FEAT at the higher rank.",
  contacts: "May use Contact's Resources if persuaded (Popularity FEAT). Contact may have restrictions/requirements."
};

// ── CRIME CATEGORIES (for Karma reference) ──
export const CRIME_CATEGORIES = {
  violent:       "Murder, assault, kidnapping. Attacking hero in secret ID.",
  destructive:   "Arson, bombings, riots, vandalism, attacks on super-powered heroes, rampages.",
  theft:         "Removal of property without threat. Shoplifting, pickpocketing, break-ins, embezzling.",
  robbery:       "Theft with violence or implied violence. Mugging, bank robbery, stick-ups.",
  misdemeanor:   "Minor crimes: gambling, concealed weapons, drug possession, driving offenses.",
  nationalOffense:"Treason, hijacking, terrorism, drug/weapon smuggling.",
  localConspiracy:"Plot affecting one company, city, or region.",
  nationalConspiracy:"Plot to take over a country.",
  globalConspiracy:"Plot directed against entire world.",
  otherCrimes:   "Selling drugs, forgery, counterfeiting, fraud."
};

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

// ── INTENSITY & DIFFICULTY ──
export const FEAT_INTENSITY_RULES = {
  // Compare requisite ability rank vs Intensity rank to determine FEAT color needed:
  automatic: "Ability 3+ ranks above Intensity (Judge's permission). No roll needed.",
  green:     "Ability 1-2 ranks above Intensity.",
  yellow:    "Ability equal to Intensity.",
  red:       "Intensity 1 rank above Ability.",
  impossible:"Intensity 2+ ranks above Ability. (Optional rule: Judge may allow red at 1 rank above only.)",
  unstated:  "If no Intensity given, any colored result = success. Judge may declare Typical as default."
};

// ── COLUMN SHIFTS ──
// +CS = shift right (easier). -CS = shift left (harder).
// Cannot shift below Shift 0 or above Shift Z.
// Class 1000+ columns cannot be shifted except in specific listed circumstances.
// Shifts may make FEATs automatic or impossible.

// ── LIFTING (Strength FEAT) ──
export const WEIGHT_INTENSITY = {
  "Feeble":      "Up to 50 lbs",
  "Poor":        "Up to 100 lbs",
  "Typical":     "Up to 200 lbs",
  "Good":        "Up to 400 lbs",
  "Excellent":   "Up to 800 lbs",
  "Remarkable":  "Up to 2000 lbs (1 ton)",
  "Incredible":  "Up to 10 tons",
  "Amazing":     "Up to 50 tons",
  "Monstrous":   "Up to 80 tons",
  "Unearthly":   "Up to 100 tons",
  "Shift X":     "Up to 250 tons",
  "Shift Y":     "Up to 500 tons",
  "Shift Z":     "Up to 1000 tons"
};
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
  "Shift X":     "80 areas",
  "Shift Y":     "160 areas",
  "Shift Z":     "400 areas",
  "Class 1000":  "100 miles",
  "Class 3000":  "10,000 miles",
  "Class 5000":  "1,000,000 miles",
  "Beyond":      "Unlimited"
};

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

export const COMBAT_ROUND_SEQUENCE = {
  step1: "Judge determines NPC actions (notes privately).",
  step2: "Players declare hero actions. May perform multiple actions (with difficulty increase).",
  step3: "Roll Initiative. Only matters when actions interfere with each other.",
  step4: "Pre-Action rolls: defensive actions (dodge, block, evade), planned events (explosions). Changing Actions resolved here.",
  step5: "Winning side's actions resolve.",
  step6: "Losing side's actions resolve."
};

export const INITIATIVE_RULES = {
  roll: "Each side rolls d10. Higher roll wins initiative (acts first). All of one side acts before the other.",
  modifier: {
    desc: "Add modifier based on highest Intuition rank number on each side.",
    table: {
      "0-10": 0, "11-20": 1, "21-30": 2, "31-40": 3,
      "41-50": 4, "51-75": 5, "76+": 6
    },
    note: "A roll of 1 is always 1 (modifier does not apply to natural 1)."
  },
  reroll: "Roll again each round as long as 2+ combatants have interfering actions.",
  ties: "Tied initiative totals result in automatic reroll.",
  changingActions: {
    desc: "After initiative roll, may change declared action.",
    feat: "Yellow Agility FEAT (resolved in pre-action phase).",
    penalty: "-1CS on all FEATs after changing."
  },
  negatedActions: "Losing initiative may negate actions (e.g., knocked out before acting). Lost actions cannot be performed that turn.",
  holdingFire: "Initiative winner may hold attack until opponent is in best range (acts when opponent about to strike).",
  // Powers/talents that affect initiative
  initiativeBonuses: {
    martialArtsE: "+1 initiative in unarmed combat.",
    weaponsSpecialist: "+1 initiative with weapon of specialty.",
    combatSense: "Power rank replaces Intuition for initiative modifier if higher.",
    enhancedSenses: "Power rank replaces Intuition for initiative modifier if higher.",
    note: "Talent bonuses: highest bonus on each side applies to that side's roll. Power replacements: highest effective Intuition on each side determines modifier."
  },
  // RAW turn phases (optional structured play)
  turnPhases: {
    declare: "Declaration Phase: Judge notes NPC actions, players declare hero actions. Multiple actions declared here.",
    preaction: "Pre-Action Phase: Defensive actions (dodge, block, evade) resolve. Changing Actions FEAT rolled. Planned events (explosions) trigger.",
    actions: "Action Phase: Winning side acts, then losing side acts."
  }
};

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

export const RANGED_ATTACK_TYPES = {
  shooting: {
    desc: "Projectile weapons (handguns, rifles, etc.)",
    results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    pullDamage: false, pullEffect: false,
    missNote: "Missile continues; Judge may roll to see if it hits another target in area/path."
  },
  edgedThrowing: {
    desc: "Thrown sharp weapons (knife, shuriken)",
    results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    pullDamage: true, pullEffect: false,
    damage: "Always minimum listed; max = min(Str, material strength) for powerful wielders"
  },
  bluntThrowing: {
    desc: "Thrown blunt objects (rock, bus, shield)",
    results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
    pullDamage: true, pullEffect: true,
    damage: "Str or material strength (whichever less) — NO next-rank bump (melee only)"
  },
  energy: {
    desc: "Energy Powers (fire blast, lightning, radiation). No physical component.",
    results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    pullDamage: true, pullEffect: false
  },
  force: {
    desc: "Physical energy manifestation (repulsors, force fields, ice ram)",
    results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
    pullDamage: true, pullEffect: false
  }
};

// Bullseye: hit specific part of target (<1ft square). Nature/result up to Judge. Never fatal.

// ── RANGE MODIFIERS ──
// Weapons: -1CS to hit per area of range.
// Powers: no penalty within Power rank range. -1CS per area beyond. Cannot reduce below Shift 0.
// Thrown items: max range by Strength rank (see table). LOS for Class 1000+.
export const THROWING_RANGE = {
  "Shift-0": 0, "Feeble": 1, "Poor": 1, "Typical": 1, "Good": 2,
  "Excellent": 3, "Remarkable": 4, "Incredible": 5, "Amazing": 6,
  "Monstrous": 7, "Unearthly": 8, "Shift X": 10, "Shift Y": 15, "Shift Z": 20,
  "Class 1000": "LOS", "Class 3000": "LOS", "Class 5000": "LOS"
};

// ── VEHICLE/FLIGHT SPEED TABLE ──
export const SPEED_TABLE = {
  //              Land(area/rnd, MPH)    Air(area/rnd, MPH)
  "Feeble":    { land: { areas: 1,  mph: 15  }, air: { areas: 2,   mph: 30   } },
  "Poor":      { land: { areas: 2,  mph: 30  }, air: { areas: 4,   mph: 60   } },
  "Typical":   { land: { areas: 3,  mph: 45  }, air: { areas: 6,   mph: 90   } },
  "Good":      { land: { areas: 4,  mph: 60  }, air: { areas: 8,   mph: 120  } },
  "Excellent": { land: { areas: 5,  mph: 75  }, air: { areas: 10,  mph: 150  } },
  "Remarkable":{ land: { areas: 6,  mph: 90  }, air: { areas: 15,  mph: 225  } },
  "Incredible":{ land: { areas: 7,  mph: 105 }, air: { areas: 20,  mph: 300  } },
  "Amazing":   { land: { areas: 8,  mph: 120 }, air: { areas: 25,  mph: 375  } },
  "Monstrous": { land: { areas: 9,  mph: 135 }, air: { areas: 30,  mph: 450  } },
  "Unearthly": { land: { areas: 10, mph: 150 }, air: { areas: 40,  mph: 600  } },
  "Shift X":   { land: { areas: 12, mph: 180 }, air: { areas: 50,  mph: 750  } },
  "Shift Y":   { land: { areas: 14, mph: 210 }, air: { areas: 100, mph: 1500 } },
  "Shift Z":   { land: { areas: 16, mph: 240 }, air: { areas: 200, mph: 3750 } },
  "Class 1000": { land: { areas: 32, mph: 480 }, air: "Interplanetary" },
  "Class 3000": { land: { areas: 50, mph: 750 }, air: "Near-Light" },
  "Class 5000": { land: { areas: 100, mph: 1500 }, air: "Teleportation" }
};

// ── LEAPING TABLE ──
export const LEAPING_TABLE = {
  //              Up(ft/floors)    Across(ft/areas)  Down(ft/floors)
  "Feeble":    { up: "2/0",       across: "2/0",     down: "3/0" },
  "Poor":      { up: "4/0",       across: "4/0",     down: "8/0" },
  "Typical":   { up: "6/0",       across: "6/0",     down: "9/0" },
  "Good":      { up: "10/0",      across: "10/0",    down: "15/1" },
  "Excellent": { up: "20/1",      across: "20/0",    down: "30/2" },
  "Remarkable":{ up: "30/2",      across: "30/0",    down: "45/3" },
  "Incredible":{ up: "40/2",      across: "40/0",    down: "60/4" },
  "Amazing":   { up: "50/3",      across: "50/0",    down: "75/5" },
  "Monstrous": { up: "75/5",      across: "75/.5",   down: "105/7" },
  "Unearthly": { up: "100/6",     across: "100/1",   down: "150/10" },
  "Shift X":   { up: "150/10",    across: "150/1",   down: "225/15" },
  "Shift Y":   { up: "200/13",    across: "200/2",   down: "300/20" },
  "Shift Z":   { up: "500/33",    across: "500/4",   down: "750/50" },
  "Class 1000":{ up: "1000/60",   across: "1000/8",  down: "1500/100" },
  "Class 3000":{ up: "3000/180",  across: "3000/25", down: "4500/300" },
  "Class 5000":{ up: "5000/300",  across: "5000/40", down: "7500/500" }
};

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

// ── COMBAT TACTICS (FULL) ──
export const COMBAT_TACTICS = {
  nonAdjacentWeapon: "Attacker/target within 1 area if using large object. Must be able to lift it. If target BA/material > weapon, weapon may shatter.",
  holdingFire: "Initiative winner may hold attack until opponent is in best range (acts when opponent about to strike).",
  pullingPunches: {
    reduceDamage: ["Blunt Attack", "Throwing Blunt", "Throwing Edged", "Energy", "Force", "Grappling", "Charging"],
    reduceEffect: ["Blunt Attack", "Throwing Blunt", "Grappling", "Charging"],
    note: "Energy/Force: specific attack descriptions say effect CANNOT be reduced despite summary listing them. Throwing Edged: can reduce damage per description."
  },
  multipleTargets: {
    singleRoll: "All targets adjacent. -4CS. Applies to: Blunt Slugfest, Escaping, Energy, Force.",
  },
  multipleAttacks: {
    preFeat: "Fighting FEAT in pre-action phase.",
    twoAttacks: "Remarkable Intensity FEAT",
    threeAttacks: "Amazing Intensity FEAT",
    penalty: "-1CS to hit on all attacks. Fail = 1 attack at -3CS.",
    allowedTypes: "Slugfest and Shooting only. Some Powers may permit as Power Stunts."
  },
  entangling: "Agility FEAT to hit. Target: Agility FEAT vs material strength or enmeshed. Escape: Str FEAT to break, or slip with applicable abilities.",
  groundstrike: "Energy vs ground. Damage on Force table. Target takes material strength damage. May open hole (Agi FEAT to avoid).",
  shootToNeutralize: "Requires Bullseye result. Kill treated as Bullseye. Only for disarming.",
  shootToStun: "Bullseye result treated as Stun. Kill is still Kill.",
  combinedAttack: "2+ attackers within 1 rank damage of each other. Higher raised to next rank minimum if lower makes Agi FEAT. Slugfest, Charging, Energy, Force.",
  doubleTeam: "Hold/Partial Hold + second attacker at +1CS. Miss may hit holder (second roll).",
  fastballSpecial: "Strong character throws weaker as missile. Thrower Agi or thrown Fighting to hit. Damage = thrown's Endurance or Slugfest + Charging speed bonuses.",
  shockwave: "Str 2+ ranks above ground material. Strike ground. 2 areas. Charge at Str. No damage but Stun/Slam possible.",
  blindsiding: {
    bonus: "+2CS to hit",
    restriction: "Target cannot add Karma to Slam/Stun/Kill FEATs",
    conditions: "Unaware from behind, distracted, attacker playing possum, attack from ally/friend.",
    immune: "Extraordinary senses (Daredevil) or danger sense (Spider-Man) — except special circumstances."
  },
  shielding: {
    initial: "Shield as initial action: may perform another action. Changed action: no other actions.",
    penalty: "-2CS all FEATs unless common shield item for hero.",
    protection: "Material strength of item as BA. Physical attacks only (Slugfest, Throwing, Shooting, Charging). Not Grappling/Grabbing.",
    bodyShield: "Put own body between attacker and target. Must be closer to target than attacker. Shooting/Throwing/Charging only. Hero becomes target."
  },
  flightCombat: {
    slam: "Flying character can be slammed regardless of End (not moored).",
    powerDive: "+4CS charging (flight only, straight down). Not for leaping/jumping/falling (+3CS max).",
    movingTarget: { upTo5areas: -1, upTo10areas: -2, faster: -4, chargingAtYou: "no penalty" }
  },
  ambush: "+1CS to hit. Set up against specific location. Triggers when any character enters. Karma spent at setup, not attack.",
  aiming: "(Optional) Spend 1 turn not firing = +1CS to hit next round. Shooting/Throwing/Powers.",
  pointBlank: { nonFighting: "+3CS (adjacent, not engaged)", fighting: "-3CS (engaged in Slugfest/Wrestling)" },
  luring: "Opponent gets +2CS. Defender pulls defensive move at moment of attack. Miss hits whatever behind luring character."
};

// ── LIFE, DEATH, AND HEALTH ──
export const HEALTH_AND_DEATH = {
  zeroHealth: {
    desc: "Unconscious 1-10 rounds. Roll Endurance FEAT on Kill column.",
    noEffect: "Stunned 1-10 rounds, regain consciousness. Health = Endurance rank# on waking.",
    enduranceLoss: "Dying. Lose 1 Endurance rank per turn until Shift 0 = death."
  },
  stabilization: {
    karma50: "Stabilize Endurance for 1 round (stopgap).",
    karma200: "Gain another Endurance FEAT when slipping a rank. Success = unconscious (alive).",
    aid: "Any aid (first aid, summoning help, pulling to safety, checking on them) halts Endurance loss. Unconscious 1-10 hours.",
    medicine: "Medicine Talent: revive Shift 0 characters up to 20 turns after.",
    firstAid: "First Aid Talent: stabilize Shift 0 up to 5 rounds after."
  },
  regainingConsciousness: {
    stun: "Regain in 1-10 turns, act normally.",
    zeroHealth: "Unconscious 1-10 turns, then Endurance FEAT. Fail = still unconscious (check again 1-10 turns). Success = conscious, Health = Endurance rank#."
  },
  recovery: {
    desc: "10 turns after last damage (no further damage), regain Endurance rank# Health.",
    frequency: "Once per day.",
    condition: "Must not be unconscious. Must not take further damage in the 10 turns."
  },
  healing: {
    desc: "Endurance rank# Health per hour after last damage.",
    doubled: "Bedrest and medical supervision (doctors/hospitals).",
    condition: "Timer resets if character takes further damage."
  },
  impaired: {
    desc: "-2CS on all actions until Endurance restored to original.",
    healRate: "1 Endurance rank per week (normal). 1 per day (hospital/doctor).",
    cap: "Cannot heal Endurance above pre-damage rank number."
  },
  disabilities: {
    desc: "Character at Shift 0 Endurance: roll Green FEAT for each physical ability above Good.",
    fail: "Ability reduced to next lowest printed number (e.g., Mn(61) → Am(50)).",
    permanent: "May only be raised by advancement (Karma spending)."
  },
  robots: {
    desc: "0 Health + all Endurance lost = deactivated (not dead). May be rebuilt if parts/personality retained.",
    reactivation: "Reason FEAT at Intensity = highest ability/Power rank. Takes highest Power rank# days. Returns with no Karma."
  }
};

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