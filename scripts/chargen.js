// chargen.js - Marvel Super Heroes Random Character Generation
// Based on the Advanced Set rules
//
// 2026-05-15: _buildUpdates now seeds system.karma.lifetime and a
//   "Starting karma (chargen)" entry in system.karma.history at the value
//   of s.karma (R+I+P). Required so actor.prepareDerivedData's
//   history-derived karma reconciliation has something to work from on
//   freshly chargen'd actors; without the seed, derive would zero them out.

import { POWER_DATA, TALENT_DATA, CONTACT_DATA } from './chargen-data.js';
import { stepRank } from './rules/rules-reference.js';

// Ability Modifier Table rule: "no ability may be modified in any fashion
// below Feeble or above Monstrous"
const shiftAbilityRank = (rankName, shifts) =>
  stepRank(rankName, shifts, { min: "Feeble", max: "Monstrous" });

export const RANKS = [
  { name: "Shift-0", min: 0, standard: 0 },
  { name: "Feeble", min: 1, standard: 2 },
  { name: "Poor", min: 3, standard: 4 },
  { name: "Typical", min: 5, standard: 6 },
  { name: "Good", min: 8, standard: 10 },
  { name: "Excellent", min: 16, standard: 20 },
  { name: "Remarkable", min: 26, standard: 30 },
  { name: "Incredible", min: 36, standard: 40 },
  { name: "Amazing", min: 46, standard: 50 },
  { name: "Monstrous", min: 63, standard: 75 },
  { name: "Unearthly", min: 88, standard: 100 },
  { name: "Shift-X", min: 126, standard: 150 },
  { name: "Shift-Y", min: 176, standard: 200 },
  { name: "Shift-Z", min: 351, standard: 500 },
  { name: "Class 1000", min: 1000, standard: 1000 },
  { name: "Class 3000", min: 3000, standard: 3000 },
  { name: "Class 5000", min: 5000, standard: 5000 }
];

// Origin table
const ORIGIN_TABLE = [
  { roll: [1, 30], origin: "Altered Human" },
  { roll: [31, 60], origin: "Mutant" },
  { roll: [61, 90], origin: "Hi-Tech" },
  { roll: [91, 95], origin: "Robot" },
  { roll: [96, 100], origin: "Alien" }
];

// Column 1: Altered Humans, Mutants
const COLUMN_1 = [
  { roll: [1, 5], rank: "Feeble" },
  { roll: [6, 10], rank: "Poor" },
  { roll: [11, 20], rank: "Typical" },
  { roll: [21, 40], rank: "Good" },
  { roll: [41, 60], rank: "Excellent" },
  { roll: [61, 80], rank: "Remarkable" },
  { roll: [81, 96], rank: "Incredible" },
  { roll: [97, 100], rank: "Amazing" }
];

// Column 2: Normal Folks (not used for heroes but shown for reference)
const COLUMN_2 = [
  { roll: [1, 5], rank: "Feeble" },
  { roll: [6, 25], rank: "Poor" },
  { roll: [26, 75], rank: "Typical" },
  { roll: [76, 95], rank: "Good" },
  { roll: [96, 100], rank: "Excellent" }
];

// Column 3: High Technology
const COLUMN_3 = [
  { roll: [1, 5], rank: "Feeble" },
  { roll: [6, 10], rank: "Poor" },
  { roll: [11, 40], rank: "Typical" },
  { roll: [41, 80], rank: "Good" },
  { roll: [81, 95], rank: "Excellent" },
  { roll: [96, 100], rank: "Remarkable" }
];

// Column 4: Robots & Power Ranks
const COLUMN_4 = [
  { roll: [1, 5], rank: "Feeble" },
  { roll: [6, 10], rank: "Poor" },
  { roll: [11, 15], rank: "Typical" },
  { roll: [16, 40], rank: "Good" },
  { roll: [41, 50], rank: "Excellent" },
  { roll: [51, 70], rank: "Remarkable" },
  { roll: [71, 90], rank: "Incredible" },
  { roll: [91, 98], rank: "Amazing" },
  { roll: [99, 100], rank: "Monstrous" }
];

// Column 5: Aliens
const COLUMN_5 = [
  { roll: [1, 10], rank: "Feeble" },
  { roll: [11, 20], rank: "Poor" },
  { roll: [21, 30], rank: "Typical" },
  { roll: [31, 40], rank: "Good" },
  { roll: [41, 60], rank: "Excellent" },
  { roll: [61, 70], rank: "Remarkable" },
  { roll: [71, 80], rank: "Incredible" },
  { roll: [81, 95], rank: "Amazing" },
  { roll: [96, 100], rank: "Monstrous" }
];

// Column 6: Battlesuit Modification
const COLUMN_6 = [
  { roll: [1, 15], mod: -1 },
  { roll: [16, 50], mod: 0 },
  { roll: [51, 70], mod: 1 },
  { roll: [71, 85], mod: 2 },
  { roll: [86, 95], mod: 3 },
  { roll: [96, 100], mod: 4 }
];

// Ability Modifier Table
const ABILITY_MODIFIER = [
  { roll: [1, 15], mod: -1 },
  { roll: [16, 50], mod: 0 },
  { roll: [51, 70], mod: 1 },
  { roll: [71, 85], mod: 2 },
  { roll: [86, 95], mod: 3 },
  { roll: [96, 100], mod: 4 }
];

// Powers, Talents, Contacts initial/max
const POWERS_TABLE = [
  { roll: [1, 20], initial: 2, max: 4 },
  { roll: [21, 60], initial: 3, max: 4 },
  { roll: [61, 90], initial: 4, max: 4 },
  { roll: [91, 100], initial: 5, max: 5 }
];

const TALENTS_TABLE = [
  { roll: [1, 20], initial: 1, max: 6 },
  { roll: [21, 60], initial: 2, max: 5 },
  { roll: [61, 90], initial: 3, max: 4 },
  { roll: [91, 100], initial: 4, max: 4 }
];

const CONTACTS_TABLE = [
  { roll: [1, 20], initial: 0, max: 4 },
  { roll: [21, 60], initial: 1, max: 4 },
  { roll: [61, 90], initial: 2, max: 4 },
  { roll: [91, 100], initial: 3, max: 4 }
];

// Power Categories
const POWER_CATEGORIES = [
  { roll: [1, 5], category: "Resistances" },
  { roll: [6, 10], category: "Senses" },
  { roll: [11, 15], category: "Movement" },
  { roll: [16, 25], category: "Matter Control" },
  { roll: [26, 40], category: "Energy Control" },
  { roll: [41, 55], category: "Body Control" },
  { roll: [56, 70], category: "Distance Attacks" },
  { roll: [71, 75], category: "Mental Powers" },
  { roll: [76, 90], category: "Body Alterations/Offensive" },
  { roll: [91, 100], category: "Body Alterations/Defensive" }
];

// Talent Categories
const TALENT_CATEGORIES = [
  { roll: [1, 20], category: "Weapon Skills" },
  { roll: [21, 45], category: "Fighting Skills" },
  { roll: [46, 65], category: "Professional Skills" },
  { roll: [66, 85], category: "Scientific Skills" },
  { roll: [86, 90], category: "Mystic and Mental Skills" },
  { roll: [91, 100], category: "Other Skills" }
];

// Power listings by category
export const POWER_LISTS = {
  "Resistances": [
    { name: "Resistance to Fire and Heat", star: false },
    { name: "Resistance to Cold", star: false },
    { name: "Resistance to Electricity", star: false },
    { name: "Resistance to Radiation", star: false },
    { name: "Resistance to Toxins", star: false },
    { name: "Resistance to Corrosives", star: false },
    { name: "Resistance to Emotion Attacks", star: false },
    { name: "Resistance to Mental Attacks", star: false },
    { name: "Resistance to Magical Attacks", star: false },
    { name: "Resistance to Disease", star: false },
    { name: "Invulnerability", star: true }
  ],
  "Senses": [
    { name: "Protected Senses", star: false },
    { name: "Enhanced Senses", star: false },
    { name: "Infravision", star: false },
    { name: "Cosmic Awareness", star: true },
    { name: "Combat Sense", star: true },
    { name: "Computer Links", star: false },
    { name: "Emotion Detection", star: false },
    { name: "Energy Detection", star: false },
    { name: "Magic Detection", star: false },
    { name: "Magnetic Detection", star: false },
    { name: "Mutant Detection", star: false },
    { name: "Psionic Detection", star: false },
    { name: "Astral Detection", star: false },
    { name: "Tracking Ability", star: false }
  ],
  "Movement": [
    { name: "Flight", star: false },
    { name: "Gliding", star: false },
    { name: "Leaping", star: false },
    { name: "Wall-Crawling", star: false },
    { name: "Lightning Speed", star: false },
    { name: "Teleportation", star: true },
    { name: "Levitation", star: false },
    { name: "Swimming", star: false },
    { name: "Climbing", star: false },
    { name: "Digging", star: false },
    { name: "Dimensional Travel", star: true }
  ],
  "Matter Control": [
    { name: "Earth Control", star: false },
    { name: "Air Control", star: false },
    { name: "Fire Control", star: false },
    { name: "Water Control", star: false },
    { name: "Weather Control", star: false },
    { name: "Density Manipulation - Others", star: false },
    { name: "Body Transformation - Others", star: false },
    { name: "Animal Transformation - Others", star: false }
  ],
  "Energy Control": [
    { name: "Magnetic Manipulation", star: false },
    { name: "Electrical Manipulation", star: false },
    { name: "Light Manipulation", star: false },
    { name: "Sound Manipulation", star: false },
    { name: "Darkforce Manipulation", star: false },
    { name: "Gravity Manipulation", star: false },
    { name: "Probability Manipulation", star: true },
    { name: "Nullifying Power", star: true },
    { name: "Energy Reflection", star: false },
    { name: "Time Control", star: true }
  ],
  "Body Control": [
    { name: "Growth", star: false },
    { name: "Shrinking", star: false },
    { name: "Density Manipulation - Self", star: false },
    { name: "Phasing", star: false },
    { name: "Invisibility", star: false },
    { name: "Plasticity", star: false },
    { name: "Elongation", star: false },
    { name: "Shape-Shifting", star: false },
    { name: "Imitation", star: false },
    { name: "Body Transformation - Self", star: true },
    { name: "Animal Transformation - Self", star: false },
    { name: "Raise Lowest Ability", star: false },
    { name: "Blending", star: false },
    { name: "Power Absorption", star: false },
    { name: "Alter Ego", star: false }
  ],
  "Distance Attacks": [
    { name: "Projectile Missile", star: false },
    { name: "Ensnaring Missile", star: false },
    { name: "Ice Generation", star: false },
    { name: "Fire Generation", star: false },
    { name: "Energy Generation", star: false },
    { name: "Sound Generation", star: false },
    { name: "Stunning Missile", star: false },
    { name: "Corrosive Missile", star: false },
    { name: "Slashing Missile", star: false },
    { name: "Nullifier Missile", star: false },
    { name: "Darkforce Generation", star: false }
  ],
  "Mental Powers": [
    { name: "Telepathy", star: false },
    { name: "Image Generation", star: true },
    { name: "Telekinesis", star: false },
    { name: "Mind Control", star: true },
    { name: "Emotion Control", star: true },
    { name: "Force Field Generation", star: false },
    { name: "Animal Communication and Control", star: false },
    { name: "Mechanical Intuition", star: false },
    { name: "Animal Empathy", star: false },
    { name: "Empathy", star: false },
    { name: "Psi-Screen", star: false },
    { name: "Mental Probe", star: false },
    { name: "Animate Drawings", star: false },
    { name: "Possession", star: true },
    { name: "Transferral", star: true },
    { name: "Astral Projection", star: false },
    { name: "Psionic Attack", star: false },
    { name: "Precognition", star: true },
    { name: "Postcognition", star: false },
    { name: "Plant Control", star: false },
    { name: "Ultimate Skill", star: false }
  ],
  "Body Alterations/Offensive": [
    { name: "Extra Body Parts", star: false },
    { name: "Extra Attacks", star: false },
    { name: "Energy Touch", star: false },
    { name: "Paralyzing Touch", star: false },
    { name: "Claws", star: false },
    { name: "Rotting Touch", star: false },
    { name: "Corrosive Touch", star: false },
    { name: "Health-Drain Touch", star: true },
    { name: "Blinding Touch", star: false }
  ],
  "Body Alterations/Defensive": [
    { name: "Body Armor", star: false },
    { name: "Water Breathing", star: false },
    { name: "Absorption", star: false },
    { name: "Regeneration", star: false },
    { name: "Solar Regeneration", star: false },
    { name: "Recovery", star: false },
    { name: "Life Support", star: false },
    { name: "Pheromones", star: false },
    { name: "Damage Transfer", star: false },
    { name: "Healing", star: false },
    { name: "Immortality", star: true }
  ]
};

// Talent listings by category
export const TALENT_LISTS = {
  "Weapon Skills": [
    { name: "Guns", star: false },
    { name: "Thrown Weapons", star: false },
    { name: "Bows", star: false },
    { name: "Blunt Weapons", star: false },
    { name: "Sharp Weapons", star: false },
    { name: "Oriental Weapons", star: false },
    { name: "Marksman", star: true },
    { name: "Weapons Master", star: true },
    { name: "Weapons Specialist", star: true }
  ],
  "Fighting Skills": [
    { name: "Martial Arts A", star: false },
    { name: "Martial Arts B", star: false },
    { name: "Martial Arts C", star: false },
    { name: "Martial Arts D", star: false },
    { name: "Martial Arts E", star: false },
    { name: "Wrestling", star: false },
    { name: "Thrown Objects", star: false },
    { name: "Tumbling", star: false },
    { name: "Acrobatics", star: false }
  ],
  "Professional Skills": [
    { name: "Medicine", star: true },
    { name: "Law", star: false },
    { name: "Law-Enforcement", star: false },
    { name: "Pilot", star: false },
    { name: "Military", star: false },
    { name: "Business/Finance", star: false },
    { name: "Journalism", star: false },
    { name: "Engineering", star: false },
    { name: "Crime", star: false },
    { name: "Psychiatry", star: false },
    { name: "Detective/Espionage", star: false }
  ],
  "Scientific Skills": [
    { name: "Chemistry", star: false },
    { name: "Biology", star: false },
    { name: "Geology", star: false },
    { name: "Genetics", star: false },
    { name: "Archeology", star: false },
    { name: "Physics", star: false },
    { name: "Computers", star: false },
    { name: "Electronics", star: false }
  ],
  "Mystic and Mental Skills": [
    { name: "Trance", star: false },
    { name: "Mesmerism and Hypnosis", star: false },
    { name: "Sleight of Hand", star: false },
    { name: "Resist Domination", star: false },
    { name: "Mystic Origin", star: true },
    { name: "Occult Lore", star: false }
  ],
  "Other Skills": [
    { name: "Artist", star: false },
    { name: "Languages", star: false },
    { name: "First Aid", star: false },
    { name: "Repair/Tinkering", star: false },
    { name: "Trivia", star: false },
    { name: "Performer", star: false },
    { name: "Animal Training", star: true },
    { name: "Heir to Fortune", star: true },
    { name: "Student", star: true },
    { name: "Leadership", star: true }
  ]
};

// Contact types
export const CONTACT_TYPES = [
  "Medicine", "Law", "Law-Enforcement", "Military", "Business World",
  "Journalism", "Crime", "Engineering", "Psychiatry", "Detective/Espionage",
  "Hero Group", "Artist/Performer", "Chemistry", "Biology", "Geology",
  "Genetics", "Archeology", "Physics", "Computers", "Electronics",
  "Local Political", "State Political", "National Political",
  "International Political", "Planetary Political",
  "Religion", "Occult Lore", "Mythology"
];

// Origin modifiers data for comparison table and tracker
const ORIGIN_MODIFIERS = {
  "Normal": {
    column: 2,
    abilityBonus: "—",
    powers: "0 (none)",
    resources: "Typical +mod",
    popularity: 0,
    contacts: "—",
    talents: "—",
    special: "No powers; for NPCs and supporting cast",
    trackerItems: [
      { text: "Use Column 2", step: 2 },
      { text: "No Powers", step: 5 }
    ],
    warnings: [],
    benefits: [
      "Normal talents/contacts",
      "Good for NPCs"
    ]
  },
  "Altered Human": {
    column: 1,
    abilityBonus: "+1 rank (pick any)",
    powers: "—",
    resources: "Typical +mod",
    popularity: 10,
    contacts: "—",
    talents: "—",
    special: "—",
    trackerItems: [
      { text: "Use Column 1", step: 2 },
      { text: "+1 rank to any ability", step: 2 }
    ],
    warnings: []
  },
  "Mutant": {
    column: 1,
    abilityBonus: "Endurance +1",
    powers: "+1 power",
    resources: "Typical +mod -1",
    popularity: 0,
    contacts: "—",
    talents: "—",
    special: "Mutant detection; Powers mostly inborn",
    trackerItems: [
      { text: "Use Column 1", step: 2 },
      { text: "Endurance +1 rank", step: 2 },
      { text: "Resources -1 rank", step: 3 },
      { text: "Popularity = 0", step: 3 },
      { text: "+1 Power", step: 5 }
    ],
    warnings: [
      "Slow Pop changes",
      "Mutant detection",
      "Powers mostly inborn"
    ]
  },
  "Hi-Tech": {
    column: 3,
    abilityBonus: "Reason +2",
    powers: "—",
    resources: "Good +mod",
    popularity: 10,
    contacts: "1 required",
    talents: "1 sci/prof required",
    special: "Battlesuit option with Body Armor",
    trackerItems: [
      { text: "Use Column 3", step: 2 },
      { text: "Reason +2 ranks", step: 2 },
      { text: "Resources = Good", step: 3 },
      { text: "1 Contact required", step: 7 },
      { text: "1 Sci/Prof Talent req.", step: 6 }
    ],
    warnings: [
      "Powers via equipment",
      "Battlesuit option (if Body Armor)"
    ]
  },
  "Robot": {
    column: 4,
    abilityBonus: "—",
    powers: "—",
    resources: "Typical +mod",
    popularity: 0,
    contacts: "—",
    talents: "—",
    special: "Heals normally; No karma loss on death",
    trackerItems: [
      { text: "Use Column 4", step: 2 },
      { text: "Popularity = 0", step: 3 }
    ],
    warnings: [],
    benefits: [
      "Can heal normally",
      "No karma loss on death",
      "Can be reactivated"
    ]
  },
  "Alien": {
    column: 5,
    abilityBonus: "—",
    powers: "-1 power (min 2)",
    resources: "Poor +mod",
    popularity: 10,
    contacts: "1 max",
    talents: "—",
    special: "Declare power source; Outcast if no race contact",
    trackerItems: [
      { text: "Use Column 5", step: 2 },
      { text: "Resources = Poor", step: 3 },
      { text: "-1 Power (min 2)", step: 5 },
      { text: "1 Contact max", step: 7 }
    ],
    warnings: [
      "Declare power source",
      "Outcast if no race Contact"
    ]
  }
};

function roll100() {
  return Math.floor(Math.random() * 100) + 1;
}

function rollOnTable(table, rollValue = null) {
  const roll = rollValue ?? roll100();
  for (const entry of table) {
    if (roll >= entry.roll[0] && roll <= entry.roll[1]) {
      return { roll, result: entry };
    }
  }
  return { roll, result: table[table.length - 1] };
}

function getRankData(rankName) {
  return RANKS.find(r => r.name === rankName) || RANKS[3];
}

// Return min or standard rank number based on game setting
function rankValue(rankData) {
  try {
    if (game.settings.get("msh-faserip", "chargenStandardRanks")) return rankData.standard;
  } catch (e) { /* setting not registered yet or unavailable */ }
  return rankData.min;
}

// Calculate slots used by chosen powers/talents (starred = 2 slots, normal = 1)
function calcSlotsUsed(chosen) {
  return (chosen || []).reduce((acc, item) => acc + (item.star ? 2 : 1), 0);
}

function getColumnForOrigin(origin) {
  switch (origin) {
    case "Normal":
      return { num: 2, data: COLUMN_2 };
    case "Altered Human":
    case "Mutant":
      return { num: 1, data: COLUMN_1 };
    case "Hi-Tech":
      return { num: 3, data: COLUMN_3 };
    case "Robot":
      return { num: 4, data: COLUMN_4 };
    case "Alien":
      return { num: 5, data: COLUMN_5 };
    default:
      return { num: 1, data: COLUMN_1 };
  }
}

export class CharacterGenerator {
  constructor(actor) {
    this.actor = actor;
    this.state = {
      step: 0,
      origin: null,
      originRoll: null,
      abilities: {},
      health: 0,
      karma: 0,
      resources: { rank: "Typical", value: 6, roll: null },
      popularity: { hero: 10, secretId: 0 },
      hasSecretId: false,
      powersData: { initial: 0, max: 0, roll: null, categories: [], chosen: [] },
      talentsData: { initial: 0, max: 0, roll: null, categories: [], chosen: [] },
      contactsData: { initial: 0, max: 0, roll: null, chosen: [] },
      alteredBonusUsed: false,
      log: []
    };
  }

  log(message) {
    this.state.log.push(message);
  }

  reset() {
    this.state = {
      step: 0,
      origin: null,
      originRoll: null,
      abilities: {},
      health: 0,
      karma: 0,
      resources: { rank: "Typical", value: 6, roll: null },
      popularity: { hero: 10, secretId: 0 },
      hasSecretId: false,
      powersData: { initial: 0, max: 0, roll: null, categories: [], chosen: [] },
      talentsData: { initial: 0, max: 0, roll: null, categories: [], chosen: [] },
      contactsData: { initial: 0, max: 0, roll: null, chosen: [] },
      alteredBonusUsed: false,
      log: []
    };
  }

  rollOrigin() {
    const { roll, result } = rollOnTable(ORIGIN_TABLE);
    this.state.origin = result.origin;
    this.state.originRoll = roll;
    this.log(`Origin Roll: ${roll} → ${result.origin}`);
    return { roll, origin: result.origin };
  }

  setOrigin(origin) {
    this.state.origin = origin;
    this.state.originRoll = null;
    this.log(`Origin chosen: ${origin}`);
  }

  rollPrimaryAbilities() {
    const origin = this.state.origin;
    const { data: column } = getColumnForOrigin(origin);

    const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
    const results = {};

    for (const ability of abilities) {
      const { roll, result } = rollOnTable(column);
      const rankData = getRankData(result.rank);
      results[ability] = {
        roll,
        rank: result.rank,
        value: rankValue(rankData),
        initialRank: result.rank,
        initialRoll: roll,
        initialValue: rankValue(rankData)
      };
      this.log(`${ability.charAt(0).toUpperCase() + ability.slice(1)}: Roll ${roll} → ${result.rank} (${rankValue(rankData)})`);
    }

    this.applyOriginModifiers(results);
    this.state.abilities = results;
    return results;
  }

  applyOriginModifiers(abilities) {
    const origin = this.state.origin;

    switch (origin) {
      case "Altered Human":
        this.log("Altered Human: May raise one primary ability by 1 rank");
        break;

      case "Mutant":
        abilities.endurance.rank = shiftAbilityRank(abilities.endurance.rank, 1);
        abilities.endurance.value = rankValue(getRankData(abilities.endurance.rank));
        abilities.endurance.modified = true;
        this.log(`Mutant: Endurance raised to ${abilities.endurance.rank}`);
        break;

      case "Hi-Tech":
        abilities.reason.rank = shiftAbilityRank(abilities.reason.rank, 2);
        abilities.reason.value = rankValue(getRankData(abilities.reason.rank));
        abilities.reason.modified = true;
        this.log(`Hi-Tech: Reason raised to ${abilities.reason.rank}`);
        break;

      case "Robot":
        this.log("Robot: No automatic ability modifications");
        break;

      case "Alien":
        this.log("Alien: No automatic ability modifications");
        break;
    }
  }

  raiseAbility(abilityKey) {
    if (this.state.origin !== "Altered Human") return false;
    if (this.state.alteredBonusUsed) {
      this.log("Altered Human bonus already used.");
      return false;
    }
    const ability = this.state.abilities[abilityKey];
    if (!ability) return false;

    ability.rank = shiftAbilityRank(ability.rank, 1);
    ability.value = rankValue(getRankData(ability.rank));
    ability.modified = true;
    this.state.alteredBonusUsed = true;
    this.log(`Altered Human bonus: ${abilityKey} raised to ${ability.rank}`);
    return true;
  }

  generateSecondaryAbilities() {
    const a = this.state.abilities;

    this.state.health = a.fighting.value + a.agility.value + a.strength.value + a.endurance.value;
    this.log(`Health: ${a.fighting.value} + ${a.agility.value} + ${a.strength.value} + ${a.endurance.value} = ${this.state.health}`);

    this.state.karma = a.reason.value + a.intuition.value + a.psyche.value;
    this.log(`Initial Karma: ${a.reason.value} + ${a.intuition.value} + ${a.psyche.value} = ${this.state.karma}`);

    let resourceRank = "Typical";
    if (this.state.origin === "Alien") {
      resourceRank = "Poor";
      this.log("Alien: Resources start at Poor");
    } else if (this.state.origin === "Hi-Tech") {
      resourceRank = "Good";
      this.log("Hi-Tech: Resources set to Good");
    }

    const { roll, result } = rollOnTable(ABILITY_MODIFIER);
    const modifiedRank = shiftAbilityRank(resourceRank, result.mod);
    this.state.resources.roll = roll;
    this.log(`Resources: ${resourceRank} + modifier roll ${roll} (${result.mod >= 0 ? '+' : ''}${result.mod}) = ${modifiedRank}`);

    let finalResourceRank = modifiedRank;
    if (this.state.origin === "Mutant") {
      finalResourceRank = shiftAbilityRank(modifiedRank, -1);
      this.log(`Mutant: Resources reduced to ${finalResourceRank}`);
    }

    this.state.resources = {
      rank: finalResourceRank,
      value: rankValue(getRankData(finalResourceRank)),
      roll: roll,
      modShift: result.mod
    };

    let basePop = 10;
    if (this.state.origin === "Mutant" || this.state.origin === "Robot" || this.state.origin === "Normal") {
      basePop = 0;
      this.log(`${this.state.origin}: Starting Popularity is 0`);
    }

    this.state.popularity = { hero: basePop, secretId: basePop };
  }

  setSecretId(hasSecret) {
    if (this.state.hasSecretId === hasSecret) return;
    
    if (hasSecret && !this.state.hasSecretId) {
      this.state.popularity.hero -= 5;
      this.state.popularity.secretId -= 5;
      this.log("Secret ID: Popularity reduced by 5");
    } else if (!hasSecret && this.state.hasSecretId) {
      this.state.popularity.hero += 5;
      this.state.popularity.secretId += 5;
      this.log("Secret ID removed: Popularity restored");
    }
    this.state.hasSecretId = hasSecret;
  }

  rollSpecialAbilityCounts() {
    const { roll: pRoll, result: pResult } = rollOnTable(POWERS_TABLE);
    let powerInitial = pResult.initial;
    let powerMax = pResult.max;

    // Normal folks get no powers
    if (this.state.origin === "Normal") {
      powerInitial = 0;
      powerMax = 0;
      this.log("Normal: No powers available");
    } else if (this.state.origin === "Mutant") {
      powerInitial = Math.min(powerInitial + 1, powerMax);
      this.log(`Mutant: +1 Power (${pResult.initial} → ${powerInitial})`);
    } else if (this.state.origin === "Alien") {
      powerInitial = Math.max(2, powerInitial - 1);
      this.log(`Alien: -1 Power (${pResult.initial} → ${powerInitial})`);
    }

    this.state.powersData = {
      initial: powerInitial,
      max: powerMax,
      roll: this.state.origin === "Normal" ? "N/A" : pRoll,
      categories: [],
      chosen: []
    };
    this.log(`Powers: ${this.state.origin === "Normal" ? "None (Normal)" : `Roll ${pRoll} → ${powerInitial} initial, ${powerMax} max`}`);

    const { roll: tRoll, result: tResult } = rollOnTable(TALENTS_TABLE);
    this.state.talentsData = {
      initial: tResult.initial,
      max: tResult.max,
      roll: tRoll,
      categories: [],
      chosen: []
    };
    this.log(`Talents: Roll ${tRoll} → ${tResult.initial} initial, ${tResult.max} max`);

    const { roll: cRoll, result: cResult } = rollOnTable(CONTACTS_TABLE);
    let contactInitial = cResult.initial;
    let contactMax = cResult.max;

    if (this.state.origin === "Hi-Tech" && contactInitial < 1) {
      contactInitial = 1;
      this.log("Hi-Tech: Must have at least 1 Contact");
    }
    if (this.state.origin === "Alien") {
      contactInitial = Math.min(contactInitial, 1);
      contactMax = 1;
      this.log("Alien: Maximum 1 Contact");
    }

    this.state.contactsData = {
      initial: contactInitial,
      max: contactMax,
      roll: cRoll,
      chosen: []
    };
    this.log(`Contacts: Roll ${cRoll} → ${contactInitial} initial, ${contactMax} max`);
  }

  rollPowerCategories() {
    const count = this.state.powersData.initial;
    const categories = [];
    for (let i = 0; i < count; i++) {
      const { roll, result } = rollOnTable(POWER_CATEGORIES);
      categories.push({ index: i, roll, category: result.category, bonus: false });
      this.log(`Power Category ${i + 1}: Roll ${roll} → ${result.category}`);
    }
    this.state.powersData.categories = categories;
  }

  rollTalentCategories() {
    const count = this.state.talentsData.initial;
    const categories = [];
    for (let i = 0; i < count; i++) {
      const { roll, result } = rollOnTable(TALENT_CATEGORIES);
      categories.push({ index: i, roll, category: result.category });
      this.log(`Talent Category ${i + 1}: Roll ${roll} → ${result.category}`);
    }
    this.state.talentsData.categories = categories;
  }

  choosePower(category, powerName, categoryIndex = null) {
    const powerList = POWER_LISTS[category];
    if (!powerList) return false;

    const power = powerList.find(p => p.name === powerName);
    if (!power) return false;

    // Get detailed power data
    const powerInfo = POWER_DATA[powerName] || {};

    // Check if this power is already chosen
    if (this.state.powersData.chosen.some(p => p.name === powerName)) {
      this.log(`Cannot choose ${powerName}: already chosen`);
      return false;
    }

    // Check if this category slot is already filled
    if (categoryIndex !== null && this.state.powersData.chosen.some(p => p.categoryIndex === categoryIndex)) {
      this.log(`Cannot choose ${powerName}: category slot already filled`);
      return false;
    }

    if (power.star) {
      const slotsUsed = this.state.powersData.chosen.reduce((acc, p) => acc + (p.star ? 2 : 1), 0);
      if (slotsUsed + 2 > this.state.powersData.initial) {
        this.log(`Cannot choose ${powerName}: requires 2 slots`);
        return false;
      }
    }

    const { roll, result } = rollOnTable(COLUMN_4);
    let rankName = result.rank;
    let rankData = getRankData(rankName);

    // Apply minRank restrictions
    if (powerInfo.minRank) {
      const minRankName = this.resolveMinRank(powerInfo.minRank);
      const minRankIdx = RANKS.findIndex(r => r.name === minRankName);
      const currentIdx = RANKS.findIndex(r => r.name === rankName);
      if (currentIdx < minRankIdx) {
        rankName = minRankName;
        rankData = getRankData(rankName);
        this.log(`${powerName}: Raised to minimum ${rankName}`);
      }
    }

    // Store full power data
    const catEntry = categoryIndex !== null ? this.state.powersData.categories[categoryIndex] : null;
    const chosenPower = {
      name: powerName,
      category,
      categoryIndex,
      categoryRoll: catEntry?.roll || "",
      star: power.star,
      rank: rankName,
      value: rankValue(rankData),
      roll,
      description: powerInfo.description || "",
      stunts: powerInfo.stunts || [],
      bonusPower: powerInfo.bonusPower || null,
      limitationRequired: powerInfo.limitationRequired || false,
      notes: powerInfo.notes || ""
    };

    this.state.powersData.chosen.push(chosenPower);
    this.log(`Chose Power: ${powerName} (${category}) - ${rankName} (${rankValue(rankData)})`);

    // Handle bonus power
    if (powerInfo.bonusPower && !this.state.powersData.chosen.some(p => p.name === powerInfo.bonusPower)) {
      this.log(`${powerName} grants Bonus Power: ${powerInfo.bonusPower}`);
      this.state.powersData.pendingBonus = {
        powerName: powerInfo.bonusPower,
        fromPower: powerName
      };
    }

    // Warn about required limitations
    if (powerInfo.limitationRequired) {
      this.log(`⚠️ ${powerName} REQUIRES a limitation!`);
    }

    return true;
  }

  // Resolve minRank that references abilities like "Endurance+1"
  resolveMinRank(minRankStr) {
    if (!minRankStr.includes("+")) return minRankStr;
    
    const match = minRankStr.match(/^(\w+)\+(\d+)$/);
    if (!match) return "Feeble";
    
    const abilityName = match[1].toLowerCase();
    const shift = parseInt(match[2]);
    const ability = this.state.abilities[abilityName];
    if (!ability) return "Feeble";
    
    return stepRank(ability.rank, shift);
  }

  acceptBonusPower() {
    const pending = this.state.powersData.pendingBonus;
    if (!pending) return false;

    // Find the bonus power's category
    let bonusCategory = null;
    for (const [cat, powers] of Object.entries(POWER_LISTS)) {
      if (powers.some(p => p.name === pending.powerName)) {
        bonusCategory = cat;
        break;
      }
    }

    if (!bonusCategory) {
      this.log(`Could not find category for bonus power: ${pending.powerName}`);
      this.state.powersData.pendingBonus = null;
      return false;
    }

    // Add a bonus category slot
    const bonusIndex = this.state.powersData.categories.length;
    this.state.powersData.categories.push({
      index: bonusIndex,
      roll: "Bonus",
      category: bonusCategory,
      bonus: true
    });

    // Choose the bonus power
    const result = this.choosePower(bonusCategory, pending.powerName, bonusIndex);
    if (result) {
      // Mark it as bonus in the chosen array
      const chosenBonus = this.state.powersData.chosen.find(p => p.name === pending.powerName);
      if (chosenBonus) {
        chosenBonus.isBonus = true;
        chosenBonus.bonusFrom = pending.fromPower;
      }
    }

    this.state.powersData.pendingBonus = null;
    return result;
  }

  declineBonusPower() {
    if (this.state.powersData.pendingBonus) {
      this.log(`Declined bonus power: ${this.state.powersData.pendingBonus.powerName}`);
      this.state.powersData.pendingBonus = null;
    }
  }

  autoPickPower(category) {
    const powerList = POWER_LISTS[category];
    if (!powerList) return false;

    const chosenNames = this.state.powersData.chosen.map(p => p.name);
    const available = powerList.filter(p => !p.star && !chosenNames.includes(p.name));
    if (available.length === 0) return false;

    const power = available[Math.floor(Math.random() * available.length)];
    return this.choosePower(category, power.name);
  }

  chooseTalent(category, talentName, categoryIndex = null) {
    const talentList = TALENT_LISTS[category];
    if (!talentList) return false;

    const talent = talentList.find(t => t.name === talentName);
    if (!talent) return false;

    // Get detailed talent data
    const talentInfo = TALENT_DATA[talentName] || {};

    // Check if this talent is already chosen
    if (this.state.talentsData.chosen.some(t => t.name === talentName)) {
      this.log(`Cannot choose ${talentName}: already chosen`);
      return false;
    }

    // Check if this category slot is already filled
    if (categoryIndex !== null && this.state.talentsData.chosen.some(t => t.categoryIndex === categoryIndex)) {
      this.log(`Cannot choose ${talentName}: category slot already filled`);
      return false;
    }

    if (talent.star) {
      const slotsUsed = this.state.talentsData.chosen.reduce((acc, t) => acc + (t.star ? 2 : 1), 0);
      if (slotsUsed + 2 > this.state.talentsData.initial) {
        this.log(`Cannot choose ${talentName}: requires 2 slots`);
        return false;
      }
    }

    // Store full talent data
    const talCatEntry = categoryIndex !== null ? this.state.talentsData.categories[categoryIndex] : null;
    this.state.talentsData.chosen.push({
      name: talentName,
      category,
      categoryIndex,
      categoryRoll: talCatEntry?.roll || "",
      star: talent.star,
      effect: talentInfo.effect || "",
      ability: talentInfo.ability || null,
      modifier: talentInfo.modifier || 0,
      notes: talentInfo.notes || "",
      grantsContact: talentInfo.grantsContact || null
    });

    this.log(`Chose Talent: ${talentName} (${category})`);

    // Handle granted contacts
    if (talentInfo.grantsContact) {
      const contactTypes = talentInfo.grantsContact.split(/,\s*| x\d+/);
      for (const contactType of contactTypes) {
        const cleanType = contactType.trim();
        if (cleanType && !this.state.talentsData.grantedContacts) {
          this.state.talentsData.grantedContacts = [];
        }
        if (cleanType) {
          this.state.talentsData.grantedContacts.push({
            type: cleanType,
            fromTalent: talentName
          });
          this.log(`${talentName} grants Contact: ${cleanType}`);
        }
      }
    }

    return true;
  }

  autoPickTalent(category) {
    const talentList = TALENT_LISTS[category];
    if (!talentList) return false;

    const chosenNames = this.state.talentsData.chosen.map(t => t.name);
    const available = talentList.filter(t => !t.star && !chosenNames.includes(t.name));
    if (available.length === 0) return false;

    const talent = available[Math.floor(Math.random() * available.length)];
    return this.chooseTalent(category, talent.name);
  }

  chooseContact(type, name = null) {
    if (this.state.contactsData.chosen.length >= this.state.contactsData.initial) {
      return false;
    }

    // Check if this contact type is already chosen
    if (this.state.contactsData.chosen.some(c => c.type === type)) {
      this.log(`Cannot choose ${type}: already have a contact of this type`);
      return false;
    }

    // Get detailed contact data
    const contactInfo = CONTACT_DATA[type] || {};

    this.state.contactsData.chosen.push({
      type,
      name: name || type,
      contactType: contactInfo.type || "Professional",
      resourceRank: contactInfo.resourceRank || "Typical",
      specialty: contactInfo.specialty || "",
      notes: contactInfo.notes || ""
    });

    this.log(`Chose Contact: ${name || type} (${type})`);
    if (contactInfo.specialty) {
      this.log(`  → Specialty: ${contactInfo.specialty}`);
    }
    if (contactInfo.resourceRank) {
      this.log(`  → Resources: ${contactInfo.resourceRank}`);
    }
    return true;
  }

  generateFullRandom() {
    this.rollOrigin();
    this.rollPrimaryAbilities();
    this.generateSecondaryAbilities();
    this.rollSpecialAbilityCounts();
    this.rollPowerCategories();
    this.rollTalentCategories();

    for (const cat of this.state.powersData.categories) {
      this.autoPickPower(cat.category);
    }

    for (const cat of this.state.talentsData.categories) {
      this.autoPickTalent(cat.category);
    }

    const contactCount = this.state.contactsData.initial;
    for (let i = 0; i < contactCount; i++) {
      const type = CONTACT_TYPES[Math.floor(Math.random() * CONTACT_TYPES.length)];
      this.chooseContact(type);
    }
  }

  async applyToActor() {
    if (!this.actor) return;

    const updates = this.buildActorUpdates();
    if (updates) {
      await this.actor.update(updates);
    }

    const itemData = this.buildItemData();
    if (itemData && itemData.length > 0) {
      await this.actor.createEmbeddedDocuments("Item", itemData);
    }
  }

  getState() {
    return this.state;
  }

  getLog() {
    return this.state.log;
  }

  buildTextSummary() {
    const s = this.state;
    if (!s || !s.abilities) return "";

    const a = s.abilities;
    const primaryLines = Object.entries(a)
      .map(([key, data]) => `${key.toUpperCase()} ${data.rank} (${data.value})`)
      .join(" | ");

    const powerLines = (s.powersData?.chosen || [])
      .map(p => `• ${p.name} (${p.category}) ${p.rank} (${p.value})`)
      .join("\n");

    const talentLines = (s.talentsData?.chosen || [])
      .map(t => `• ${t.name} (${t.category})`)
      .join("\n");

    const contactLines = (s.contactsData?.chosen || [])
      .map(c => `• ${c.name} [${c.type}]`)
      .join("\n");

    return [
      `Hero Origin: ${s.origin || "-"}`,
      "",
      "Primary Abilities:",
      primaryLines,
      "",
      "Secondary:",
      `Health: ${s.health}`,
      `Karma: ${s.karma}`,
      `Resources: ${s.resources.rank} (${s.resources.value})`,
      `Popularity: ${s.popularity.hero}`,
      "",
      "Powers:",
      powerLines || "• None",
      "",
      "Talents:",
      talentLines || "• None",
      "",
      "Contacts:",
      contactLines || "• None"
    ].join("\n");
  }

  buildShortLabel() {
    const s = this.state || {};
    const a = s.abilities || {};

    const f = a.fighting?.rank?.substring(0, 2) || "-";
    const ag = a.agility?.rank?.substring(0, 2) || "-";
    const e = a.endurance?.rank?.substring(0, 2) || "-";

    const powers = (s.powersData?.chosen || []);
    const topPowers = powers.slice(0, 2).map(p => p.name).join(", ");
    const powerPart = topPowers ? topPowers : "none";

    return `${s.origin || "Unknown"} F/A/E ${f}/${ag}/${e} — ${powerPart}`;
  }

  buildActorUpdates() {
    const s = this.state;
    if (!s || !s.abilities) return null;

    const a = s.abilities;
    const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
    const updates = {
      "system.origin": s.origin || "",
      "system.powerOrigin": s.origin?.toLowerCase().replace("-", " ") || "altered human",
      "system.isMutant": s.origin === "Mutant",
      "system.identityType": s.hasSecretId ? "secret" : "public",
    };

    for (const ab of abilities) {
      const d = a[ab];
      updates[`system.abilities.${ab}.value`] = d.value;
      updates[`system.abilities.${ab}.rank`] = d.rank;
      updates[`system.abilities.${ab}.initialRoll`] = d.initialRoll || "";
      updates[`system.abilities.${ab}.initialRank`] = d.initialRank || "";
      updates[`system.abilities.${ab}.initialValue`] = d.initialValue || d.value;
      updates[`system.abilities.${ab}.originModified`] = d.modified || false;
    }

    Object.assign(updates, {
      "system.attributes.health.value": s.health,
      "system.attributes.health.max": s.health,
      "system.attributes.karma.value": s.karma,
      "system.attributes.karma.max": s.karma,
      "system.karma.lifetime": s.karma,
      "system.karma.history": [{
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: s.karma,
        type: "Session Award",
        description: "Starting karma (chargen)"
      }],
      "system.attributes.resources.rank": s.resources.rank,
      "system.attributes.resources.value": s.resources.value,
      "system.attributes.popularity.hero.value": s.popularity.hero,
      "system.attributes.popularity.secretId.value": s.hasSecretId ? s.popularity.secretId : 0,

      "system.chargen.originRoll": s.originRoll || "",
      "system.chargen.resourcesBaseRank": s.origin === "Alien" ? "Poor" : s.origin === "Hi-Tech" ? "Good" : "Typical",
      "system.chargen.resourcesModRoll": s.resources.roll || "",
      "system.chargen.resourcesModShift": s.resources.modShift ?? "",
      "system.chargen.popularityBase": s.origin === "Mutant" || s.origin === "Robot" ? 0 : 10,
      "system.chargen.powersRoll": s.powersData?.roll || "",
      "system.chargen.powersInitial": s.powersData?.initial || "",
      "system.chargen.powersMax": s.powersData?.max || "",
      "system.chargen.talentsRoll": s.talentsData?.roll || "",
      "system.chargen.talentsInitial": s.talentsData?.initial || "",
      "system.chargen.talentsMax": s.talentsData?.max || "",
      "system.chargen.contactsRoll": s.contactsData?.roll || "",
      "system.chargen.contactsInitial": s.contactsData?.initial || "",
      "system.chargen.contactsMax": s.contactsData?.max || "",
      "system.chargen.alteredBonusAbility": s.alteredBonusUsed ? (abilities.find(ab => a[ab].modified && s.origin === "Altered Human") || "") : "",
      "system.chargen.log": s.log || []
    });

    return updates;
  }

  buildItemData() {
    const s = this.state;
    const items = [];

    for (const p of (s.powersData?.chosen || [])) {
      items.push({
        name: p.name,
        type: "power",
        system: {
          rank: p.rank,
          value: p.value,
          category: p.category,
          isStarred: p.star || false,
          isBonus: p.isBonus || false,
          bonusFrom: p.bonusFrom || "",
          initialRoll: p.roll || "",
          initialRank: p.rank,
          initialValue: p.value,
          categoryRoll: p.categoryRoll || "",
          limitationRequired: p.limitationRequired || false,
          limitationDetail: p.limitationDetail || "",
          preLimitationRank: p.preLimitationRank || "",
          description: p.description || `Generated power from ${p.category} category.`,
          stunts: (p.stunts || []).join("\n"),
          notes: p.notes || ""
        }
      });
    }

    for (const t of (s.talentsData?.chosen || [])) {
      items.push({
        name: t.name,
        type: "talent",
        system: {
          type: t.category,
          category: t.category,
          categoryRoll: t.categoryRoll || "",
          effect: t.effect || "",
          ability: t.ability || "",
          modifier: t.modifier || 0,
          grantsContact: t.grantsContact || "",
          description: t.effect || `Generated talent from ${t.category} category.`,
          notes: t.notes || ""
        }
      });
    }

    // Add contacts from contactsData.chosen
    for (const c of (s.contactsData?.chosen || [])) {
      items.push({
        name: c.name || c.type,
        type: "contact",
        system: {
          type: c.type,
          contactType: c.contactType || "Professional",
          resourceRank: c.resourceRank || "Typical",
          specialty: c.specialty || "",
          disposition: "Friendly",
          description: c.specialty || "Generated contact.",
          notes: c.notes || ""
        }
      });
    }

    // Add contacts granted by talents
    for (const gc of (s.talentsData?.grantedContacts || [])) {
      // Skip if already have this contact type
      if (items.some(i => i.type === "contact" && i.system.type === gc.type)) continue;
      
      const contactInfo = CONTACT_DATA[gc.type] || {};
      items.push({
        name: gc.type,
        type: "contact",
        system: {
          type: gc.type,
          contactType: contactInfo.type || "Professional",
          resourceRank: contactInfo.resourceRank || "Typical",
          specialty: contactInfo.specialty || "",
          disposition: "Friendly",
          description: `Granted by ${gc.fromTalent} talent.`,
          notes: contactInfo.notes || ""
        }
      });
    }

    return items;
  }
}

// UI Manager for the character creation tab
export class ChargenUIManager {
  constructor(sheet, html) {
    this.sheet = sheet;
    this.html = html;
    this.actor = sheet.actor;
    this.generator = null;
    this.currentStep = 0;
    this._boundEvents = false;
    this.history = [];

    this.bindEvents(html);
  }

  initialize() {
    this.generator = new CharacterGenerator(this.actor);
    this.bindEvents();
    this.renderStep(0);
  }

  bindEvents() {
    if (this._boundEvents) return;
    this._boundEvents = true;

    const container = this.html.find('.chargen-container');
    if (!container.length) return;

    container.on('click', '.chargen-start', () => this.startGeneration());
    container.on('click', '.chargen-quick-random', () => this.quickRandomCharacter());
    container.on('click', '.chargen-reset', () => this.reset());
    container.on('click', '.chargen-roll-origin', () => this.rollOrigin());
    container.on('change', '.chargen-origin-select', ev => this.selectOrigin(ev.target.value));
    container.on('change', '.chargen-normal-folks', ev => this.toggleNormalFolks(ev.target.checked));
    container.on('click', '.chargen-roll-abilities', () => this.rollAbilities());
    container.on('click', '.chargen-raise-ability', ev => {
      const ability = ev.currentTarget.dataset.ability;
      this.raiseAbility(ability);
    });
    container.on('click', '.chargen-generate-secondary', () => this.generateSecondary());
    container.on('change', '.chargen-secret-id', ev => this.setSecretId(ev.target.checked));
    container.on('click', '.chargen-roll-specials', () => this.rollSpecials());
    container.on('click', '.chargen-roll-categories', () => this.rollCategories());
    container.on('click', '.chargen-roll-talent-categories', () => this.rollTalentCategoriesOnly());
    container.on('click', '.chargen-choose-power', ev => {
      const category = ev.currentTarget.dataset.category;
      const power = ev.currentTarget.dataset.power;
      const index = parseInt(ev.currentTarget.dataset.index, 10);
      this.choosePower(category, power, index);
    });
    container.on('click', '.chargen-choose-talent', ev => {
      const category = ev.currentTarget.dataset.category;
      const talent = ev.currentTarget.dataset.talent;
      const index = parseInt(ev.currentTarget.dataset.index, 10);
      this.chooseTalent(category, talent, index);
    });
    container.on('click', '.chargen-choose-contact', ev => {
      const type = ev.currentTarget.dataset.type;
      this.chooseContact(type);
    });
    container.on('click', '.chargen-roll-powers', () => this.rollAllPowersRandomly());
    container.on('click', '.chargen-roll-talents', () => this.rollAllTalentsRandomly());
    container.on('click', '.chargen-accept-bonus', () => this.acceptBonusPower());
    container.on('click', '.chargen-decline-bonus', () => this.declineBonusPower());
    container.on('click', '.chargen-next', () => this.nextStep());
    container.on('click', '.chargen-prev', () => this.prevStep());
    container.on('click', '.chargen-apply', () => this.applyToActor());
    container.on('click', '.chargen-reroll', () => this.quickRandomCharacter());
    container.on('click', '.chargen-discard', () => this.reset());
  }

  acceptBonusPower() {
    if (this.generator.acceptBonusPower()) {
      this.updateDisplay();
    }
  }

  declineBonusPower() {
    this.generator.declineBonusPower();
    this.updateDisplay();
  }

  startGeneration() {
    if (typeof game !== "undefined" && !game.user.isGM) return;
    this.generator = new CharacterGenerator(this.actor);
    this.currentStep = 1;
    this.renderStep(1);
  }

  quickRandomCharacter() {
    if (typeof game !== "undefined" && !game.user.isGM) return;
    this.generator = new CharacterGenerator(this.actor);
    this.generator.generateFullRandom();
    this.currentStep = 8;
    this.renderStep(8);

    if (typeof ui !== "undefined" && ui.notifications) {
      ui.notifications.info(`Random ${this.generator.state.origin} generated!`);
    }
  }

  reset() {
    this.generator = null;
    this.currentStep = 0;
    this.renderStep(0);
  }

  rollOrigin() {
    this.generator.rollOrigin();
    this.updateDisplay();
  }

  selectOrigin(origin) {
    if (origin) {
      this.generator.setOrigin(origin);
      this.updateDisplay();
    }
  }

  toggleNormalFolks(isNormal) {
    if (isNormal) {
      this.generator.setOrigin("Normal");
    } else if (this.generator.state.origin === "Normal") {
      this.generator.state.origin = null;
      this.generator.state.originRoll = null;
    }
    this.updateDisplay();
  }

  rollAbilities() {
    this.generator.rollPrimaryAbilities();
    this.updateDisplay();
  }

  raiseAbility(ability) {
    if (this.generator.raiseAbility(ability)) {
      this.updateDisplay();
    }
  }

  generateSecondary() {
    this.generator.generateSecondaryAbilities();
    this.updateDisplay();
  }

  setSecretId(hasSecret) {
    this.generator.setSecretId(hasSecret);
    this.updateDisplay();
  }

  rollSpecials() {
    this.generator.rollSpecialAbilityCounts();
    this.updateDisplay();
  }

  rollCategories() {
    this.generator.rollPowerCategories();
    this.generator.rollTalentCategories();
    this.updateDisplay();
  }

  rollTalentCategoriesOnly() {
    this.generator.rollTalentCategories();
    this.updateDisplay();
  }

  choosePower(category, power, index) {
    this.generator.choosePower(category, power, index);
    this.updateDisplay();
  }

  chooseTalent(category, talent, index) {
    this.generator.chooseTalent(category, talent, index);
    this.updateDisplay();
  }

  rollAllPowersRandomly() {
    if (!this.generator?.state?.powersData) return;
    const data = this.generator.state.powersData;
    const needed = data.initial || 0;

    for (const entry of data.categories) {
      const slotsUsed = calcSlotsUsed(data.chosen);
      if (slotsUsed >= needed) break;
      const alreadyChosen = data.chosen.some(p => p.categoryIndex === entry.index);
      if (alreadyChosen) continue;
      
      const powerList = POWER_LISTS[entry.category];
      if (!powerList) continue;
      
      const chosenNames = data.chosen.map(p => p.name);
      const slotsRemaining = needed - slotsUsed;
      // Filter out starred powers if not enough slots, and already chosen powers
      const available = powerList.filter(p => {
        if (chosenNames.includes(p.name)) return false;
        if (p.star && slotsRemaining < 2) return false;
        return true;
      });
      // Prefer non-starred to avoid using extra slots
      const nonStarred = available.filter(p => !p.star);
      const pickFrom = nonStarred.length > 0 ? nonStarred : available;
      if (pickFrom.length === 0) continue;
      
      const power = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      this.generator.choosePower(entry.category, power.name, entry.index);
    }
    this.updateDisplay();
  }

  rollAllTalentsRandomly() {
    if (!this.generator?.state?.talentsData) return;
    const data = this.generator.state.talentsData;
    const needed = data.initial || 0;

    for (const entry of data.categories) {
      const slotsUsed = calcSlotsUsed(data.chosen);
      if (slotsUsed >= needed) break;
      const alreadyChosen = data.chosen.some(t => t.categoryIndex === entry.index);
      if (alreadyChosen) continue;
      
      const talentList = TALENT_LISTS[entry.category];
      if (!talentList) continue;
      
      const chosenNames = data.chosen.map(t => t.name);
      const slotsRemaining = needed - slotsUsed;
      // Filter out starred talents if not enough slots, and already chosen talents
      const available = talentList.filter(t => {
        if (chosenNames.includes(t.name)) return false;
        if (t.star && slotsRemaining < 2) return false;
        return true;
      });
      // Prefer non-starred to avoid using extra slots
      const nonStarred = available.filter(t => !t.star);
      const pickFrom = nonStarred.length > 0 ? nonStarred : available;
      if (pickFrom.length === 0) continue;
      
      const talent = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      this.generator.chooseTalent(entry.category, talent.name, entry.index);
    }
    this.updateDisplay();
  }

  chooseContact(type) {
    this.generator.chooseContact(type);
    this.updateDisplay();
  }

  nextStep() {
    this.currentStep++;
    this.renderStep(this.currentStep);
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.renderStep(this.currentStep);
    }
  }

  async applyToActor() {
    if (typeof game !== "undefined" && !game.user.isGM) return;
    if (!this.generator?.state) return;

    const shortLabel = this.generator.buildShortLabel();
    const timestamp = new Date().toLocaleTimeString();
    this.history.unshift({ timestamp, label: shortLabel });

    await this.generator.applyToActor();

    if (typeof ui !== "undefined" && ui.notifications) {
      ui.notifications.info("Character applied to sheet.");
    }

    this.generator.reset();
    this.currentStep = 0;
    this.updateDisplay();
  }

  updateDisplay() {
    this.renderStep(this.currentStep);
  }

  renderStep(step) {
    const container = this.html.find('.chargen-content');
    const state = this.generator?.getState();

    // GM-only check
    if (typeof game !== "undefined" && !game.user.isGM) {
      container.html(`
        <div class="chargen-intro">
          <h3>Random Character Generator</h3>
          <p style="color: #856404;">This feature is available to the Game Master only.</p>
          <p style="font-size: 0.85em; color: #666;">Contact your GM if you need a randomly generated character.</p>
        </div>
      `);
      return;
    }

    let content = '';

    if (step === 0) {
      content = this.renderIntro();
    } else {
      content = `
        <div class="chargen-body">
          ${this.renderChronicle(state, step)}
          <div class="chargen-main">
            ${this.renderStepContent(step, state)}
          </div>
        </div>
      `;
    }

    container.html(content);
  }

  renderChronicle(state, currentStep) {
    const steps = [
      { num: 1, name: "Origin", key: "origin" },
      { num: 2, name: "Primary Abilities", key: "abilities" },
      { num: 3, name: "Secondary", key: "secondary" },
      { num: 4, name: "Specials Count", key: "specials" },
      { num: 5, name: "Powers", key: "powers" },
      { num: 6, name: "Talents", key: "talents" },
      { num: 7, name: "Contacts", key: "contacts" },
      { num: 8, name: "Summary", key: "summary" }
    ];

    const isComplete = currentStep === 8;
    const chronicleClass = isComplete ? "chargen-chronicle complete" : "chargen-chronicle";
    const titleClass = isComplete ? "chronicle-title complete" : "chronicle-title";
    const titleText = isComplete ? "✓ Generation Complete" : "Generation Chronicle";

    let html = `<div class="${chronicleClass}">`;
    html += `<div class="${titleClass}">${titleText}</div>`;

    if (state?.origin) {
      html += this.renderOriginTracker(state, currentStep);
    }

    for (const step of steps) {
      const isActive = step.num === currentStep;
      const isCompleted = step.num < currentStep;
      let stepClass = "chronicle-step";
      if (isActive) stepClass += " active";
      if (isCompleted) stepClass += " completed";

      html += `<div class="${stepClass}">`;
      html += `<div class="chronicle-step-header">${step.num}. ${step.name}</div>`;
      html += `<div class="chronicle-step-result">${this.getChronicleResult(state, step.key, isCompleted, isActive)}</div>`;
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  getChronicleResult(state, key, isCompleted, isActive) {
    if (!state) return "Awaiting...";

    switch (key) {
      case "origin":
        if (state.origin) {
          const rollText = state.originRoll ? ` (Roll: ${state.originRoll})` : "";
          return `<strong>${state.origin}</strong>${rollText}`;
        }
        return isActive ? "Select an origin..." : "Awaiting...";

      case "abilities":
        if (state.abilities && Object.keys(state.abilities).length > 0) {
          const a = state.abilities;
          return `F: <strong>${a.fighting?.rank?.substring(0, 2) || "-"}</strong> ` +
                 `A: <strong>${a.agility?.rank?.substring(0, 2) || "-"}</strong> ` +
                 `S: <strong>${a.strength?.rank?.substring(0, 2) || "-"}</strong><br>` +
                 `E: <strong>${a.endurance?.rank?.substring(0, 2) || "-"}</strong> ` +
                 `R: <strong>${a.reason?.rank?.substring(0, 2) || "-"}</strong> ` +
                 `I: <strong>${a.intuition?.rank?.substring(0, 2) || "-"}</strong> ` +
                 `P: <strong>${a.psyche?.rank?.substring(0, 2) || "-"}</strong>`;
        }
        return isActive ? "Rolling..." : "Awaiting...";

      case "secondary":
        if (state.health > 0) {
          return `Health: <strong>${state.health}</strong><br>` +
                 `Karma: <strong>${state.karma}</strong><br>` +
                 `Resources: <strong>${state.resources?.rank?.substring(0, 2) || "-"}</strong><br>` +
                 `Popularity: <strong>${state.popularity?.hero}</strong>`;
        }
        return isActive ? "Calculating..." : "Awaiting...";

      case "specials":
        if (state.powersData?.roll) {
          return `Powers: <strong>${state.powersData.initial}</strong><br>` +
                 `Talents: <strong>${state.talentsData.initial}</strong><br>` +
                 `Contacts: <strong>${state.contactsData.initial}</strong>`;
        }
        return isActive ? "Rolling..." : "Awaiting...";

      case "powers":
        const powers = state.powersData?.chosen || [];
        if (powers.length > 0) {
          const powerSlots = calcSlotsUsed(powers);
          return powers.map(p => `• ${p.name}${p.star ? ' ★' : ''} (${p.rank?.substring(0, 2)})`).join("<br>") + 
                 `<br><em>Slots: ${powerSlots}/${state.powersData.initial}</em>`;
        }
        if (state.powersData?.initial > 0) {
          const currentSlots = calcSlotsUsed(powers);
          return isActive ? `Choosing... (${currentSlots}/${state.powersData.initial} slots)` : "Awaiting...";
        }
        return "Awaiting...";

      case "talents":
        const talents = state.talentsData?.chosen || [];
        if (talents.length > 0) {
          const talentSlots = calcSlotsUsed(talents);
          return talents.map(t => `• ${t.name}${t.star ? ' ★' : ''}`).join("<br>") +
                 `<br><em>Slots: ${talentSlots}/${state.talentsData.initial}</em>`;
        }
        if (state.talentsData?.initial > 0) {
          const currentSlots = calcSlotsUsed(talents);
          return isActive ? `Choosing... (${currentSlots}/${state.talentsData.initial} slots)` : "Awaiting...";
        }
        return "Awaiting...";

      case "contacts":
        const contacts = state.contactsData?.chosen || [];
        if (contacts.length > 0) {
          return contacts.map(c => `• ${c.name}`).join("<br>");
        }
        if (state.contactsData?.initial > 0) {
          return isActive ? `Choosing... (${contacts.length}/${state.contactsData.initial})` : "Awaiting...";
        }
        return "Awaiting...";

      case "summary":
        return isActive ? "Review & Save" : "Awaiting...";

      default:
        return "Awaiting...";
    }
  }

  renderOriginTracker(state, currentStep) {
    const origin = state.origin;
    const mods = ORIGIN_MODIFIERS[origin];
    if (!mods) return "";

    const trackerClass = currentStep === 8 ? "origin-tracker complete" : `origin-tracker ${origin.toLowerCase().replace("-", "").replace(" ", "")}`;

    let html = `<div class="${trackerClass}">`;
    html += `<div class="origin-tracker-header">${origin}${currentStep === 8 ? " ✓" : ""}</div>`;
    html += `<div class="origin-tracker-body">`;

    for (const item of mods.trackerItems) {
      const isDone = currentStep > item.step;
      const isActive = currentStep === item.step;
      let itemClass = "tracker-item";
      if (isDone) itemClass += " done";
      else if (isActive) itemClass += " active";
      else itemClass += " pending";

      const check = isDone ? "✓" : "○";
      html += `<div class="${itemClass}"><span class="tracker-check">${check}</span><span class="tracker-text">${item.text}</span></div>`;
    }

    if (mods.warnings?.length > 0 || mods.benefits?.length > 0) {
      html += `<div class="tracker-divider"></div>`;

      for (const warning of (mods.warnings || [])) {
        html += `<div class="tracker-item warning"><span class="tracker-icon">⚠</span><span class="tracker-text">${warning}</span></div>`;
      }

      for (const benefit of (mods.benefits || [])) {
        html += `<div class="tracker-item benefit"><span class="tracker-icon">✚</span><span class="tracker-text">${benefit}</span></div>`;
      }
    }

    html += `</div></div>`;
    return html;
  }

  renderStepContent(step, state) {
    switch (step) {
      case 1: return this.renderOriginStep(state);
      case 2: return this.renderAbilitiesStep(state);
      case 3: return this.renderSecondaryStep(state);
      case 4: return this.renderSpecialsStep(state);
      case 5: return this.renderPowersStep(state);
      case 6: return this.renderTalentsStep(state);
      case 7: return this.renderContactsStep(state);
      case 8: return this.renderSummaryStep(state);
      default: return "";
    }
  }

  renderIntro() {
    return `
      <div class="chargen-intro">
        <h3>Random Character Generator</h3>
        <p>Generate characters using MSH Advanced Set rules.</p>
        <div class="intro-buttons">
          <button type="button" class="btn-step-by-step chargen-start">
            <i class="fas fa-shoe-prints"></i> Step-by-Step
          </button>
          <button type="button" class="btn-quick-random chargen-quick-random">
            <i class="fas fa-dice"></i> Quick Random
          </button>
        </div>
        <p class="intro-hint">Quick Random for instant NPCs and villains</p>
      </div>
    `;
  }

  renderOriginStep(state) {
    const origins = ["Altered Human", "Mutant", "Hi-Tech", "Robot", "Alien"];
    const selectedOrigin = state?.origin;

    let html = `
      <div class="step-header">
        <div class="step-number">1</div>
        <div class="step-title">Choose Origin</div>
      </div>
      <p class="step-description">Review the origin comparison, then roll or pick your character's origin.</p>
    `;

    // Origin Comparison Table
    html += `
      <table class="rules-table" style="font-size: 0.75em; margin-bottom: 15px;">
        <caption>Origin Comparison — Review Before Choosing</caption>
        <thead>
          <tr>
            <th style="text-align: left; width: 120px;">Modifier</th>
            <th>Altered Human</th>
            <th>Mutant</th>
            <th>Hi-Tech</th>
            <th>Robot</th>
            <th>Alien</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: left; font-weight: bold;">Roll Range</td>
            <td>01-30</td>
            <td>31-60</td>
            <td>61-90</td>
            <td>91-95</td>
            <td>96-00</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Ability Column</td>
            <td>1</td>
            <td>1</td>
            <td>3</td>
            <td>4</td>
            <td>5</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Ability Bonus</td>
            <td class="positive">+1 rank (any)</td>
            <td class="positive">Endurance +1</td>
            <td class="positive">Reason +2</td>
            <td>—</td>
            <td>—</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Powers</td>
            <td>—</td>
            <td class="positive">+1 power</td>
            <td>—</td>
            <td>—</td>
            <td class="negative">-1 (min 2)</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Resources</td>
            <td>Typical +mod</td>
            <td class="negative">Typical -1</td>
            <td class="positive">Good +mod</td>
            <td>Typical +mod</td>
            <td class="negative">Poor +mod</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Popularity</td>
            <td>10</td>
            <td class="negative">0</td>
            <td>10</td>
            <td class="negative">0</td>
            <td>10</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Contacts</td>
            <td>—</td>
            <td>—</td>
            <td class="warning">1 required</td>
            <td>—</td>
            <td class="negative">1 max</td>
          </tr>
          <tr>
            <td style="text-align: left; font-weight: bold;">Talents</td>
            <td>—</td>
            <td>—</td>
            <td class="warning">1 sci/prof req</td>
            <td>—</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    `;

    // Roll table + controls
    html += `<div class="step-content">`;
    html += `<div class="step-table-side">`;
    html += `
      <table class="rules-table">
        <caption>Origin Roll Table</caption>
        <thead>
          <tr>
            <th>Dice Roll</th>
            <th>Origin</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const o of ORIGIN_TABLE) {
      const isSelected = selectedOrigin === o.origin;
      const rollRange = `${String(o.roll[0]).padStart(2, '0')}-${String(o.roll[1]).padStart(2, '0')}`;
      html += `<tr class="${isSelected ? 'selected' : ''}">`;
      html += `<td>${rollRange}</td>`;
      html += `<td>${o.origin}</td>`;
      html += `</tr>`;
    }

    html += `</tbody></table>`;

    // Show benefits if origin selected
    if (selectedOrigin) {
      const mods = ORIGIN_MODIFIERS[selectedOrigin];
      if (mods) {
        html += `<div class="origin-benefits">`;
        html += `<div class="origin-benefits-title">${selectedOrigin} Benefits & Restrictions</div>`;
        html += `<ul>`;
        for (const item of mods.trackerItems) {
          html += `<li class="benefit-positive">${item.text}</li>`;
        }
        for (const warning of (mods.warnings || [])) {
          html += `<li class="benefit-neutral">⚠ ${warning}</li>`;
        }
        for (const benefit of (mods.benefits || [])) {
          html += `<li class="benefit-positive">✚ ${benefit}</li>`;
        }
        html += `</ul></div>`;
      }
    }

    html += `</div>`; // end step-table-side

    // Controls
    html += `<div class="step-controls-side">`;
    
    // Normal Folks checkbox
    const isNormal = selectedOrigin === "Normal";
    html += `<div class="normal-folks-option">`;
    html += `<label><input type="checkbox" class="chargen-normal-folks" ${isNormal ? 'checked' : ''} ${selectedOrigin && !isNormal ? 'disabled' : ''}> Normal Folks</label>`;
    html += `<div class="normal-folks-note">No powers, Column 2</div>`;
    html += `</div>`;
    
    html += `<div class="controls-title">Roll or Pick</div>`;
    html += `<button type="button" class="roll-button chargen-roll-origin" ${selectedOrigin ? 'disabled' : ''}>🎲 Roll d100</button>`;
    if (state?.originRoll) {
      html += `<div class="roll-result">${state.originRoll}</div>`;
    } else {
      html += `<div class="roll-result"></div>`;
    }
    html += `<div class="or-divider">— or —</div>`;
    html += `<select class="pick-select chargen-origin-select" ${selectedOrigin ? 'disabled' : ''}>`;
    html += `<option value="">— Pick Origin —</option>`;
    for (const o of origins) {
      html += `<option value="${o}" ${selectedOrigin === o ? 'selected' : ''}>${o}</option>`;
    }
    html += `</select>`;
    html += `</div>`; // end step-controls-side
    html += `</div>`; // end step-content

    // Navigation
    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-reset">← Start Over</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!selectedOrigin ? 'disabled' : ''}>Next: Primary Abilities →</button>`;
    html += `</div>`;

    return html;
  }

  renderAbilitiesStep(state) {
    const origin = state?.origin || "Altered Human";
    const { num: colNum } = getColumnForOrigin(origin);
    const hasAbilities = state?.abilities && Object.keys(state.abilities).length > 0;
    const isAlteredHuman = origin === "Altered Human";
    const bonusUsed = state?.alteredBonusUsed;

    let html = `
      <div class="step-header">
        <div class="step-number">2</div>
        <div class="step-title">Primary Abilities</div>
      </div>
      <p class="step-description">
        <strong>${origin}</strong> uses <strong>Column ${colNum}</strong> for ability rolls.
        ${origin === "Mutant" ? "Endurance will be raised by 1 rank after rolling." : ""}
        ${origin === "Hi-Tech" ? "Reason will be raised by 2 ranks after rolling." : ""}
        ${isAlteredHuman ? "You may raise one ability by 1 rank after rolling." : ""}
      </p>
    `;

    // Random Ranks Table
    html += `
      <table class="rules-table" style="font-size: 0.8em;">
        <caption>Random Ranks Table</caption>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Initial Value</th>
            <th class="${colNum === 1 ? 'active-column' : ''}">Col 1<br><small>Altered/Mutant</small></th>
            <th class="${colNum === 2 ? 'active-column' : ''}">Col 2<br><small>Normal</small></th>
            <th class="${colNum === 3 ? 'active-column' : ''}">Col 3<br><small>Hi-Tech</small></th>
            <th class="${colNum === 4 ? 'active-column' : ''}">Col 4<br><small>Robot</small></th>
            <th class="${colNum === 5 ? 'active-column' : ''}">Col 5<br><small>Alien</small></th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Feeble</td><td>1</td><td class="${colNum === 1 ? 'active-column' : ''}">01-05</td><td class="${colNum === 2 ? 'active-column' : ''}">01-05</td><td class="${colNum === 3 ? 'active-column' : ''}">01-05</td><td class="${colNum === 4 ? 'active-column' : ''}">01-05</td><td class="${colNum === 5 ? 'active-column' : ''}">01-10</td></tr>
          <tr><td>Poor</td><td>3</td><td class="${colNum === 1 ? 'active-column' : ''}">06-10</td><td class="${colNum === 2 ? 'active-column' : ''}">06-25</td><td class="${colNum === 3 ? 'active-column' : ''}">06-10</td><td class="${colNum === 4 ? 'active-column' : ''}">06-10</td><td class="${colNum === 5 ? 'active-column' : ''}">11-20</td></tr>
          <tr><td>Typical</td><td>5</td><td class="${colNum === 1 ? 'active-column' : ''}">11-20</td><td class="${colNum === 2 ? 'active-column' : ''}">26-75</td><td class="${colNum === 3 ? 'active-column' : ''}">11-40</td><td class="${colNum === 4 ? 'active-column' : ''}">11-15</td><td class="${colNum === 5 ? 'active-column' : ''}">21-30</td></tr>
          <tr><td>Good</td><td>8</td><td class="${colNum === 1 ? 'active-column' : ''}">21-40</td><td class="${colNum === 2 ? 'active-column' : ''}">76-95</td><td class="${colNum === 3 ? 'active-column' : ''}">41-80</td><td class="${colNum === 4 ? 'active-column' : ''}">16-40</td><td class="${colNum === 5 ? 'active-column' : ''}">31-40</td></tr>
          <tr><td>Excellent</td><td>16</td><td class="${colNum === 1 ? 'active-column' : ''}">41-60</td><td class="${colNum === 2 ? 'active-column' : ''}">96-00</td><td class="${colNum === 3 ? 'active-column' : ''}">81-95</td><td class="${colNum === 4 ? 'active-column' : ''}">41-50</td><td class="${colNum === 5 ? 'active-column' : ''}">41-60</td></tr>
          <tr><td>Remarkable</td><td>26</td><td class="${colNum === 1 ? 'active-column' : ''}">61-80</td><td class="${colNum === 2 ? 'active-column' : ''}">—</td><td class="${colNum === 3 ? 'active-column' : ''}">96-00</td><td class="${colNum === 4 ? 'active-column' : ''}">51-70</td><td class="${colNum === 5 ? 'active-column' : ''}">61-70</td></tr>
          <tr><td>Incredible</td><td>36</td><td class="${colNum === 1 ? 'active-column' : ''}">81-96</td><td class="${colNum === 2 ? 'active-column' : ''}">—</td><td class="${colNum === 3 ? 'active-column' : ''}">—</td><td class="${colNum === 4 ? 'active-column' : ''}">71-90</td><td class="${colNum === 5 ? 'active-column' : ''}">71-80</td></tr>
          <tr><td>Amazing</td><td>46</td><td class="${colNum === 1 ? 'active-column' : ''}">97-00</td><td class="${colNum === 2 ? 'active-column' : ''}">—</td><td class="${colNum === 3 ? 'active-column' : ''}">—</td><td class="${colNum === 4 ? 'active-column' : ''}">91-98</td><td class="${colNum === 5 ? 'active-column' : ''}">81-95</td></tr>
          <tr><td>Monstrous</td><td>63</td><td class="${colNum === 1 ? 'active-column' : ''}">—</td><td class="${colNum === 2 ? 'active-column' : ''}">—</td><td class="${colNum === 3 ? 'active-column' : ''}">—</td><td class="${colNum === 4 ? 'active-column' : ''}">99-00</td><td class="${colNum === 5 ? 'active-column' : ''}">96-00</td></tr>
        </tbody>
      </table>
    `;

    if (!hasAbilities) {
      html += `<div style="text-align: center; margin: 20px 0;">`;
      html += `<button type="button" class="roll-button chargen-roll-abilities" style="width: auto; padding: 12px 30px;">🎲 Roll All Abilities</button>`;
      html += `</div>`;
    } else {
      // Results table
      const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
      html += `
        <table class="abilities-results">
          <thead>
            <tr>
              <th>Ability</th>
              <th>Roll</th>
              <th>Initial Rank</th>
              <th>Final Rank</th>
              <th>Value</th>
              ${isAlteredHuman && !bonusUsed ? '<th>Raise</th>' : ''}
            </tr>
          </thead>
          <tbody>
      `;

      for (const ab of abilities) {
        const a = state.abilities[ab];
        const modified = a.modified || false;
        const label = ab.charAt(0).toUpperCase() + ab.slice(1);
        html += `<tr class="${modified ? 'modified' : ''}">`;
        html += `<td class="ability-name">${label}</td>`;
        html += `<td>${a.roll}</td>`;
        html += `<td>${a.initialRank}</td>`;
        html += `<td>${modified ? `<strong>${a.rank}</strong> (+)` : a.rank}</td>`;
        html += `<td>${a.value}</td>`;
        if (isAlteredHuman && !bonusUsed) {
          html += `<td><button type="button" class="raise-btn chargen-raise-ability" data-ability="${ab}">+1</button></td>`;
        }
        html += `</tr>`;
      }

      html += `</tbody></table>`;

      if (isAlteredHuman && !bonusUsed) {
        html += `<p style="color: #856404; font-style: italic; margin-top: 10px;">Altered Human: Click +1 to raise one ability by 1 rank.</p>`;
      }
    }

    // Navigation
    const canProceed = hasAbilities && (origin !== "Altered Human" || bonusUsed);
    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!canProceed ? 'disabled' : ''}>Next: Secondary Abilities →</button>`;
    html += `</div>`;

    return html;
  }

  renderSecondaryStep(state) {
    const hasSecondary = state?.health > 0;

    let html = `
      <div class="step-header">
        <div class="step-number">3</div>
        <div class="step-title">Secondary Abilities</div>
      </div>
      <p class="step-description">Calculate Health, Karma, Resources, and Popularity based on your abilities and origin.</p>
    `;

    if (!hasSecondary) {
      html += `<div style="text-align: center; margin: 20px 0;">`;
      html += `<button type="button" class="roll-button chargen-generate-secondary" style="width: auto; padding: 12px 30px;">📊 Calculate Secondary Abilities</button>`;
      html += `</div>`;
    } else {
      const a = state.abilities;
      html += `
        <div class="secondary-results">
          <div class="secondary-row">
            <span class="secondary-label">Health</span>
            <span class="secondary-value">${state.health}</span>
          </div>
          <div class="secondary-note">F(${a.fighting.value}) + A(${a.agility.value}) + S(${a.strength.value}) + E(${a.endurance.value})</div>
          
          <div class="secondary-row">
            <span class="secondary-label">Karma</span>
            <span class="secondary-value">${state.karma}</span>
          </div>
          <div class="secondary-note">R(${a.reason.value}) + I(${a.intuition.value}) + P(${a.psyche.value})</div>
          
          <div class="secondary-row">
            <span class="secondary-label">Resources</span>
            <span class="secondary-value">${state.resources.rank} (${state.resources.value})</span>
          </div>
          <div class="secondary-note">Modifier roll: ${state.resources.roll}</div>
          
          <div class="secondary-row">
            <span class="secondary-label">Popularity</span>
            <span class="secondary-value">${state.popularity.hero}</span>
          </div>
        </div>

        <div class="secret-id-option">
          <label>
            <input type="checkbox" class="chargen-secret-id" ${state.hasSecretId ? 'checked' : ''}>
            Character has a Secret Identity
          </label>
          <div class="secret-id-note">Secret ID reduces starting Popularity by 5</div>
        </div>
      `;
    }

    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!hasSecondary ? 'disabled' : ''}>Next: Special Abilities Count →</button>`;
    html += `</div>`;

    return html;
  }

  renderSpecialsStep(state) {
    const hasSpecials = state?.powersData?.roll;

    let html = `
      <div class="step-header">
        <div class="step-number">4</div>
        <div class="step-title">Powers, Talents & Contacts Count</div>
      </div>
      <p class="step-description">Roll to determine how many Powers, Talents, and Contacts your character starts with.</p>
    `;

    // Show the tables
    html += `<div style="display: flex; gap: 15px; flex-wrap: wrap;">`;

    // Powers Table
    html += `
      <table class="rules-table" style="font-size: 0.85em; flex: 1; min-width: 150px;">
        <caption>Powers</caption>
        <thead><tr><th>Roll</th><th>Initial/Max</th></tr></thead>
        <tbody>
          <tr ${state?.powersData?.roll >= 1 && state?.powersData?.roll <= 20 ? 'class="selected"' : ''}><td>01-20</td><td>2/4</td></tr>
          <tr ${state?.powersData?.roll >= 21 && state?.powersData?.roll <= 60 ? 'class="selected"' : ''}><td>21-60</td><td>3/4</td></tr>
          <tr ${state?.powersData?.roll >= 61 && state?.powersData?.roll <= 90 ? 'class="selected"' : ''}><td>61-90</td><td>4/4</td></tr>
          <tr ${state?.powersData?.roll >= 91 ? 'class="selected"' : ''}><td>91-00</td><td>5/5</td></tr>
        </tbody>
      </table>
    `;

    // Talents Table
    html += `
      <table class="rules-table" style="font-size: 0.85em; flex: 1; min-width: 150px;">
        <caption>Talents</caption>
        <thead><tr><th>Roll</th><th>Initial/Max</th></tr></thead>
        <tbody>
          <tr ${state?.talentsData?.roll >= 1 && state?.talentsData?.roll <= 20 ? 'class="selected"' : ''}><td>01-20</td><td>1/6</td></tr>
          <tr ${state?.talentsData?.roll >= 21 && state?.talentsData?.roll <= 60 ? 'class="selected"' : ''}><td>21-60</td><td>2/5</td></tr>
          <tr ${state?.talentsData?.roll >= 61 && state?.talentsData?.roll <= 90 ? 'class="selected"' : ''}><td>61-90</td><td>3/4</td></tr>
          <tr ${state?.talentsData?.roll >= 91 ? 'class="selected"' : ''}><td>91-00</td><td>4/4</td></tr>
        </tbody>
      </table>
    `;

    // Contacts Table
    html += `
      <table class="rules-table" style="font-size: 0.85em; flex: 1; min-width: 150px;">
        <caption>Contacts</caption>
        <thead><tr><th>Roll</th><th>Initial/Max</th></tr></thead>
        <tbody>
          <tr ${state?.contactsData?.roll >= 1 && state?.contactsData?.roll <= 20 ? 'class="selected"' : ''}><td>01-20</td><td>0/4</td></tr>
          <tr ${state?.contactsData?.roll >= 21 && state?.contactsData?.roll <= 60 ? 'class="selected"' : ''}><td>21-60</td><td>1/4</td></tr>
          <tr ${state?.contactsData?.roll >= 61 && state?.contactsData?.roll <= 90 ? 'class="selected"' : ''}><td>61-90</td><td>2/4</td></tr>
          <tr ${state?.contactsData?.roll >= 91 ? 'class="selected"' : ''}><td>91-00</td><td>3/4</td></tr>
        </tbody>
      </table>
    `;

    html += `</div>`;

    if (!hasSpecials) {
      html += `<div style="text-align: center; margin: 20px 0;">`;
      html += `<button type="button" class="roll-button chargen-roll-specials" style="width: auto; padding: 12px 30px;">🎲 Roll All Counts</button>`;
      html += `</div>`;
    } else {
      html += `
        <div class="specials-counts">
          <div class="specials-row">
            <span class="specials-label">Powers</span>
            <span class="specials-value">${state.powersData.initial} initial / ${state.powersData.max} max</span>
          </div>
          <div class="specials-row">
            <span class="specials-label">Talents</span>
            <span class="specials-value">${state.talentsData.initial} initial / ${state.talentsData.max} max</span>
          </div>
          <div class="specials-row">
            <span class="specials-label">Contacts</span>
            <span class="specials-value">${state.contactsData.initial} initial / ${state.contactsData.max} max</span>
          </div>
        </div>
      `;

      if (state.origin === "Normal") {
        html += `<p style="color: #666; font-style: italic;">Normal: No powers available</p>`;
      }
      if (state.origin === "Mutant") {
        html += `<p style="color: #28a745; font-style: italic;">Mutant: +1 Power applied</p>`;
      }
      if (state.origin === "Alien") {
        html += `<p style="color: #dc3545; font-style: italic;">Alien: -1 Power applied (minimum 2)</p>`;
      }
    }

    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!hasSpecials ? 'disabled' : ''}>${state?.origin === "Normal" ? 'Next: Choose Talents →' : 'Next: Choose Powers →'}</button>`;
    html += `</div>`;

    return html;
  }

  renderPowersStep(state) {
    const hasCategories = state?.powersData?.categories?.length > 0;
    const chosen = state?.powersData?.chosen || [];
    const needed = state?.powersData?.initial || 0;
    const categories = state?.powersData?.categories || [];
    const chosenPowerNames = chosen.map(p => p.name);
    const pendingBonus = state?.powersData?.pendingBonus;
    const slotsUsed = calcSlotsUsed(chosen);
    const slotsRemaining = needed - slotsUsed;

    let html = `
      <div class="step-header">
        <div class="step-number">5</div>
        <div class="step-title">Choose Powers</div>
      </div>
    `;

    // Normal folks get no powers
    if (needed === 0) {
      // Auto-roll talent categories if not already done
      if (!state?.talentsData?.categories?.length && state?.talentsData?.initial > 0) {
        html += `
          <div class="no-powers-notice">
            <p><strong>Normal Folks</strong> do not receive any powers.</p>
            <p style="color: #666; font-size: 0.9em;">Roll your Talent categories to continue.</p>
            <div style="margin-top: 15px;">
              <button type="button" class="roll-button chargen-roll-talent-categories" style="width: auto; padding: 10px 20px;">🎲 Roll Talent Categories</button>
            </div>
          </div>
        `;
        html += `<div class="step-nav">`;
        html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
        html += `<button type="button" class="nav-btn nav-next chargen-next" disabled>Next: Choose Talents →</button>`;
        html += `</div>`;
        return html;
      }
      
      html += `
        <div class="no-powers-notice">
          <p><strong>Normal Folks</strong> do not receive any powers.</p>
          <p style="color: #666; font-size: 0.9em;">Proceed to Talents to continue character generation.</p>
        </div>
      `;
      html += `<div class="step-nav">`;
      html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
      html += `<button type="button" class="nav-btn nav-next chargen-next">Next: Choose Talents →</button>`;
      html += `</div>`;
      return html;
    }

    html += `<p class="step-description">${needed} power slots to fill. Starred (★) powers use 2 slots. Slots used: ${slotsUsed}/${needed}</p>
    `;

    // Pending bonus power prompt
    if (pendingBonus) {
      const bonusInfo = POWER_DATA[pendingBonus.powerName] || {};
      html += `
        <div class="bonus-power-prompt">
          <div class="bonus-header">🎁 Bonus Power Available!</div>
          <p><strong>${pendingBonus.fromPower}</strong> grants <strong>${pendingBonus.powerName}</strong> as a bonus power.</p>
          ${bonusInfo.description ? `<p class="bonus-desc">${bonusInfo.description}</p>` : ''}
          <div class="bonus-actions">
            <button type="button" class="btn-accept chargen-accept-bonus">✓ Accept Bonus Power</button>
            <button type="button" class="btn-decline chargen-decline-bonus">✗ Decline</button>
          </div>
        </div>
      `;
    }

    // Power Categories Table
    html += `
      <table class="rules-table" style="font-size: 0.8em; margin-bottom: 12px;">
        <caption>Power Categories Table</caption>
        <thead><tr><th>Dice Roll</th><th>Category</th></tr></thead>
        <tbody>
    `;
    for (const cat of POWER_CATEGORIES) {
      const isSelected = categories.some(c => c.category === cat.category);
      html += `<tr class="${isSelected ? 'selected' : ''}"><td>${String(cat.roll[0]).padStart(2, '0')}-${String(cat.roll[1]).padStart(2, '0')}</td><td>${cat.category}</td></tr>`;
    }
    html += `</tbody></table>`;

    if (!hasCategories) {
      html += `<div style="text-align: center; margin: 20px 0;">`;
      html += `<button type="button" class="roll-button chargen-roll-categories" style="width: auto; padding: 12px 30px;">🎲 Roll Power Categories</button>`;
      html += `</div>`;
    } else {
      // Show rolled categories
      html += `<div class="rolled-categories">Your Categories: `;
      for (const cat of categories) {
        html += `<span class="cat-tag${cat.bonus ? ' bonus' : ''}">${cat.category} (${cat.roll})</span>`;
      }
      html += `</div>`;

      // Category selection boxes
      for (const catEntry of categories) {
        const catName = catEntry.category;
        const catIndex = catEntry.index;
        const powerList = POWER_LISTS[catName] || [];
        const chosenPower = chosen.find(p => p.categoryIndex === catIndex);
        const isChosen = !!chosenPower;

        html += `<div class="power-category${isChosen ? ' chosen' : ''}${catEntry.bonus ? ' bonus-category' : ''}">`;
        html += `<div class="category-header"><span>${catName}${catEntry.bonus ? ' (Bonus)' : ''}</span><span class="roll-info">Roll: ${catEntry.roll}</span></div>`;

        if (!isChosen) {
          html += `<div class="power-list">`;
          for (const power of powerList) {
            const alreadyChosen = chosenPowerNames.includes(power.name);
            // Disable starred powers if not enough slots remaining (need 2 for starred)
            const notEnoughSlots = power.star && slotsRemaining < 2;
            const isDisabled = alreadyChosen || notEnoughSlots;
            const disabledAttr = isDisabled ? 'disabled' : '';
            const chosenClass = alreadyChosen ? ' chosen' : '';
            const noSlotsClass = notEnoughSlots ? ' no-slots' : '';
            const powerInfo = POWER_DATA[power.name] || {};
            
            // Build tooltip
            let tooltip = power.name;
            if (power.star) tooltip += `\n(Uses 2 power slots)`;
            if (notEnoughSlots) tooltip += `\n⛔ Not enough slots remaining`;
            if (powerInfo.description) tooltip += `\n${powerInfo.description}`;
            if (powerInfo.bonusPower) tooltip += `\n★ Bonus: ${powerInfo.bonusPower}`;
            if (powerInfo.limitationRequired) tooltip += `\n⚠ Requires Limitation`;
            if (powerInfo.minRank) tooltip += `\nMin Rank: ${powerInfo.minRank}`;
            
            html += `<button type="button" class="power-btn${power.star ? ' starred' : ''}${chosenClass}${noSlotsClass}${powerInfo.bonusPower ? ' has-bonus' : ''}${powerInfo.limitationRequired ? ' needs-limit' : ''} chargen-choose-power" data-category="${catName}" data-power="${power.name}" data-index="${catIndex}" title="${tooltip.replace(/"/g, '&quot;')}" ${disabledAttr}>${power.name}${power.star ? ' ★' : ''}${powerInfo.bonusPower ? ' 🎁' : ''}${powerInfo.limitationRequired ? ' ⚠' : ''}${alreadyChosen ? ' ✓' : ''}</button>`;
          }
          html += `</div>`;
          html += `<div class="pending-display">Select a power from this category...</div>`;
        } else {
          let chosenDisplay = `<strong>Chosen:</strong> ${chosenPower.name} — <strong>${chosenPower.rank} (${chosenPower.value})</strong>`;
          if (chosenPower.isBonus) chosenDisplay += ` <span class="bonus-tag">Bonus from ${chosenPower.bonusFrom}</span>`;
          if (chosenPower.limitationRequired) chosenDisplay += ` <span class="limit-tag">⚠ Needs Limitation</span>`;
          html += `<div class="chosen-display">${chosenDisplay}</div>`;
          if (chosenPower.description) {
            html += `<div class="power-desc">${chosenPower.description}</div>`;
          }
          if (chosenPower.stunts && chosenPower.stunts.length > 0) {
            html += `<div class="power-stunts"><strong>Available Stunts:</strong> ${chosenPower.stunts.slice(0, 3).join('; ')}${chosenPower.stunts.length > 3 ? '...' : ''}</div>`;
          }
        }

        html += `</div>`;
      }

      // Random fill button - show remaining slots, not powers
      if (slotsRemaining > 0 && !pendingBonus) {
        html += `<div style="text-align: center; margin: 15px 0;">`;
        html += `<button type="button" class="roll-button chargen-roll-powers" style="width: auto; padding: 10px 20px;">🎲 Random Fill Remaining (${slotsRemaining} slots)</button>`;
        html += `</div>`;
      }
    }

    const canProceed = slotsUsed >= needed && !pendingBonus;
    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!canProceed ? 'disabled' : ''}>Next: Choose Talents →</button>`;
    html += `</div>`;

    return html;
  }

  renderTalentsStep(state) {
    const hasCategories = state?.talentsData?.categories?.length > 0;
    const chosen = state?.talentsData?.chosen || [];
    const needed = state?.talentsData?.initial || 0;
    const categories = state?.talentsData?.categories || [];
    const isHiTech = state?.origin === "Hi-Tech";
    const chosenTalentNames = chosen.map(t => t.name);
    const grantedContacts = state?.talentsData?.grantedContacts || [];
    const slotsUsed = calcSlotsUsed(chosen);
    const slotsRemaining = needed - slotsUsed;

    let html = `
      <div class="step-header">
        <div class="step-number">6</div>
        <div class="step-title">Choose Talents</div>
      </div>
      <p class="step-description">${needed} talent slots to fill. Starred (★) talents use 2 slots. Slots used: ${slotsUsed}/${needed}${isHiTech ? ' <strong>Hi-Tech requires at least 1 Scientific or Professional talent.</strong>' : ''}</p>
    `;

    // Show granted contacts from talents
    if (grantedContacts.length > 0) {
      html += `<div class="granted-contacts-notice">`;
      html += `<strong>📇 Contacts Granted by Talents:</strong> `;
      html += grantedContacts.map(gc => `${gc.type} (from ${gc.fromTalent})`).join(', ');
      html += `</div>`;
    }

    // Talent Categories Table
    html += `
      <table class="rules-table" style="font-size: 0.8em; margin-bottom: 12px;">
        <caption>Talent Categories Table</caption>
        <thead><tr><th>Dice Roll</th><th>Category</th></tr></thead>
        <tbody>
    `;
    for (const cat of TALENT_CATEGORIES) {
      const isSelected = categories.some(c => c.category === cat.category);
      html += `<tr class="${isSelected ? 'selected' : ''}"><td>${String(cat.roll[0]).padStart(2, '0')}-${String(cat.roll[1]).padStart(2, '0')}</td><td>${cat.category}</td></tr>`;
    }
    html += `</tbody></table>`;

    // If no categories rolled yet, show button to roll them
    if (!hasCategories && needed > 0) {
      html += `<div style="text-align: center; margin: 20px 0;">`;
      html += `<button type="button" class="roll-button chargen-roll-talent-categories" style="width: auto; padding: 12px 30px;">🎲 Roll Talent Categories</button>`;
      html += `</div>`;
    }

    // Show rolled categories
    if (categories.length > 0) {
      html += `<div class="rolled-categories">Your Categories: `;
      for (const cat of categories) {
        html += `<span class="cat-tag">${cat.category} (${cat.roll})</span>`;
      }
      html += `</div>`;
    }

    // Category selection boxes
    for (const catEntry of categories) {
      const catName = catEntry.category;
      const catIndex = catEntry.index;
      const talentList = TALENT_LISTS[catName] || [];
      const chosenTalent = chosen.find(t => t.categoryIndex === catIndex);
      const isChosen = !!chosenTalent;

      html += `<div class="talent-category${isChosen ? ' chosen' : ''}">`;
      html += `<div class="category-header"><span>${catName}</span><span class="roll-info">Roll: ${catEntry.roll}</span></div>`;

      if (!isChosen) {
        html += `<div class="talent-list">`;
        for (const talent of talentList) {
          const alreadyChosen = chosenTalentNames.includes(talent.name);
          // Disable starred talents if not enough slots remaining (need 2 for starred)
          const notEnoughSlots = talent.star && slotsRemaining < 2;
          const isDisabled = alreadyChosen || notEnoughSlots;
          const disabledAttr = isDisabled ? 'disabled' : '';
          const chosenClass = alreadyChosen ? ' chosen' : '';
          const noSlotsClass = notEnoughSlots ? ' no-slots' : '';
          const talentInfo = TALENT_DATA[talent.name] || {};
          
          // Build tooltip
          let tooltip = talent.name;
          if (talent.star) tooltip += `\n(Uses 2 talent slots)`;
          if (notEnoughSlots) tooltip += `\n⛔ Not enough slots remaining`;
          if (talentInfo.effect) tooltip += `\n${talentInfo.effect}`;
          if (talentInfo.ability && talentInfo.modifier) tooltip += `\n+${talentInfo.modifier}CS ${talentInfo.ability}`;
          if (talentInfo.grantsContact) tooltip += `\n📇 Grants: ${talentInfo.grantsContact}`;
          
          html += `<button type="button" class="talent-btn${talent.star ? ' starred' : ''}${chosenClass}${noSlotsClass}${talentInfo.grantsContact ? ' grants-contact' : ''} chargen-choose-talent" data-category="${catName}" data-talent="${talent.name}" data-index="${catIndex}" title="${tooltip.replace(/"/g, '&quot;')}" ${disabledAttr}>${talent.name}${talent.star ? ' ★' : ''}${talentInfo.grantsContact ? ' 📇' : ''}${alreadyChosen ? ' ✓' : ''}</button>`;
        }
        html += `</div>`;
        html += `<div class="pending-display">Select a talent from this category...</div>`;
      } else {
        let chosenDisplay = `<strong>Chosen:</strong> ${chosenTalent.name}`;
        if (chosenTalent.ability && chosenTalent.modifier) {
          chosenDisplay += ` <span class="modifier-tag">+${chosenTalent.modifier}CS ${chosenTalent.ability}</span>`;
        }
        if (chosenTalent.grantsContact) {
          chosenDisplay += ` <span class="contact-tag">📇 ${chosenTalent.grantsContact}</span>`;
        }
        html += `<div class="chosen-display">${chosenDisplay}</div>`;
        if (chosenTalent.effect) {
          html += `<div class="talent-desc">${chosenTalent.effect}</div>`;
        }
      }

      html += `</div>`;
    }

    // Random fill button - show remaining slots, not talents
    if (slotsRemaining > 0 && categories.length > 0) {
      html += `<div style="text-align: center; margin: 15px 0;">`;
      html += `<button type="button" class="roll-button chargen-roll-talents" style="width: auto; padding: 10px 20px;">🎲 Random Fill Remaining (${slotsRemaining} slots)</button>`;
      html += `</div>`;
    }

    const canProceed = slotsUsed >= needed && (needed === 0 || hasCategories);
    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!canProceed ? 'disabled' : ''}>Next: Choose Contacts →</button>`;
    html += `</div>`;

    return html;
  }

  renderContactsStep(state) {
    const chosen = state?.contactsData?.chosen || [];
    const needed = state?.contactsData?.initial || 0;
    const isHiTech = state?.origin === "Hi-Tech";
    const isAlien = state?.origin === "Alien";
    const grantedContacts = state?.talentsData?.grantedContacts || [];

    let html = `
      <div class="step-header">
        <div class="step-number">7</div>
        <div class="step-title">Choose Contacts</div>
      </div>
      <p class="step-description">
        ${needed} contacts to choose.
        ${isHiTech ? ' <strong>Hi-Tech: First contact should be your support organization.</strong>' : ''}
        ${isAlien ? ' <strong>Alien: Contact should be your home race (or you are an outcast).</strong>' : ''}
      </p>
    `;

    // Show contacts already granted by talents
    if (grantedContacts.length > 0) {
      html += `<div class="granted-contacts-notice">`;
      html += `<strong>📇 Already Granted by Talents:</strong> `;
      html += grantedContacts.map(gc => `${gc.type} (from ${gc.fromTalent})`).join(', ');
      html += `</div>`;
    }

    if (chosen.length < needed) {
      html += `<div class="contact-types">`;
      for (const type of CONTACT_TYPES) {
        const alreadyChosen = chosen.some(c => c.type === type);
        const contactInfo = CONTACT_DATA[type] || {};
        
        // Build tooltip
        let tooltip = type;
        if (contactInfo.resourceRank) tooltip += `\nResources: ${contactInfo.resourceRank}`;
        if (contactInfo.specialty) tooltip += `\n${contactInfo.specialty}`;
        if (contactInfo.notes) tooltip += `\n⚠ ${contactInfo.notes}`;
        
        html += `<button type="button" class="contact-btn${alreadyChosen ? ' chosen' : ''} chargen-choose-contact" data-type="${type}" title="${tooltip.replace(/"/g, '&quot;')}" ${alreadyChosen ? 'disabled' : ''}>${type}</button>`;
      }
      html += `</div>`;
    }

    if (chosen.length > 0) {
      html += `<div class="chosen-contacts"><h4>Chosen Contacts:</h4>`;
      for (const c of chosen) {
        html += `<div class="contact-entry">`;
        html += `<div class="contact-name"><strong>${c.name}</strong> (${c.type})`;
        if (c.resourceRank) html += ` <span class="resource-tag">Resources: ${c.resourceRank}</span>`;
        html += `</div>`;
        if (c.specialty) html += `<div class="contact-specialty">${c.specialty}</div>`;
        if (c.notes) html += `<div class="contact-notes">⚠ ${c.notes}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    const canProceed = chosen.length >= needed;
    html += `<div class="step-nav">`;
    html += `<button type="button" class="nav-btn nav-prev chargen-prev">← Back</button>`;
    html += `<button type="button" class="nav-btn nav-next chargen-next" ${!canProceed ? 'disabled' : ''}>Next: Summary →</button>`;
    html += `</div>`;

    return html;
  }

  renderSummaryStep(state) {
    if (!state) {
      return `<div class="step-header"><div class="step-number">8</div><div class="step-title">Summary</div></div><p>No character generated.</p>`;
    }

    let html = `
      <div class="step-header">
        <div class="step-number">✓</div>
        <div class="step-title">Character Complete</div>
      </div>

      <div class="summary-complete">
        <h3>Generation Complete!</h3>
        <p>Review your character in the chronicle, then save or start over.</p>
      </div>

      <div class="summary-actions">
        <button type="button" class="btn-save chargen-apply">💾 Save to Character Sheet</button>
        <button type="button" class="btn-reroll chargen-reroll">🎲 Re-Roll Everything</button>
        <button type="button" class="btn-discard chargen-discard">🗑️ Discard</button>
      </div>
    `;

    return html;
  }
}