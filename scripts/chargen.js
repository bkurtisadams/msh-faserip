// chargen.js - Marvel Super Heroes Random Character Generation
// Based on the Advanced Set rules

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
  return RANKS.find(r => r.name === rankName) || RANKS[3]; // Default Typical
}

function shiftRank(rankName, shifts) {
  const idx = RANKS.findIndex(r => r.name === rankName);
  if (idx === -1) return rankName;
  const newIdx = Math.max(0, Math.min(RANKS.length - 1, idx + shifts));
  return RANKS[newIdx].name;
}

export class CharacterGenerator {
  constructor(actor) {
    this.actor = actor;
    this.state = {
      step: 0,
      origin: null,
      abilities: {},
      health: 0,
      karma: 0,
      resources: { rank: "Typical", value: 6 },
      popularity: { hero: 10, secretId: 0 },
      hasSecretId: false,
      powersData: { initial: 0, max: 0, categories: [], chosen: [] },
      talentsData: { initial: 0, max: 0, categories: [], chosen: [] },
      contactsData: { initial: 0, max: 0, chosen: [] },
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
      abilities: {},
      health: 0,
      karma: 0,
      resources: { rank: "Typical", value: 6 },
      popularity: { hero: 10, secretId: 0 },
      hasSecretId: false,
      powersData: { initial: 0, max: 0, categories: [], chosen: [] },
      talentsData: { initial: 0, max: 0, categories: [], chosen: [] },
      contactsData: { initial: 0, max: 0, chosen: [] },
      alteredBonusUsed: false,
      log: []
    };
  }

  // Step 1: Roll or choose origin
  rollOrigin() {
    const roll = roll100();
    let origin;
    if (roll <= 30) origin = "Altered Human";
    else if (roll <= 60) origin = "Mutant";
    else if (roll <= 90) origin = "Hi-Tech";
    else if (roll <= 95) origin = "Robot";
    else origin = "Alien";
    
    this.state.origin = origin;
    this.log(`Origin Roll: ${roll} → ${origin}`);
    return { roll, origin };
  }

  setOrigin(origin) {
    this.state.origin = origin;
    this.log(`Origin chosen: ${origin}`);
  }

  // Step 2: Generate primary abilities
  rollPrimaryAbilities() {
    const origin = this.state.origin;
    let column;
    
    switch (origin) {
      case "Altered Human":
      case "Mutant":
        column = COLUMN_1;
        break;
      case "Hi-Tech":
        column = COLUMN_3;
        break;
      case "Robot":
        column = COLUMN_4;
        break;
      case "Alien":
        column = COLUMN_5;
        break;
      default:
        column = COLUMN_1;
    }

    const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
    const results = {};

    for (const ability of abilities) {
      const { roll, result } = rollOnTable(column);
      const rankData = getRankData(result.rank);
      results[ability] = {
        roll,
        rank: result.rank,
        value: rankData.min,
        initialRank: result.rank,
        initialRoll: roll
      };
      this.log(`${ability.charAt(0).toUpperCase() + ability.slice(1)}: Roll ${roll} → ${result.rank} (${rankData.min})`);
    }

    // Apply origin modifiers
    this.applyOriginModifiers(results);
    
    this.state.abilities = results;
    return results;
  }

  applyOriginModifiers(abilities) {
    const origin = this.state.origin;

    switch (origin) {
      case "Altered Human":
        // May raise any single primary ability by one rank (handled in UI)
        this.log("Altered Human: May raise one primary ability by 1 rank");
        break;

      case "Mutant":
        // Endurance raised by one rank
        abilities.endurance.rank = shiftRank(abilities.endurance.rank, 1);
        abilities.endurance.value = getRankData(abilities.endurance.rank).min;
        this.log(`Mutant: Endurance raised to ${abilities.endurance.rank}`);
        break;

      case "Hi-Tech":
        // Reason raised by two ranks
        abilities.reason.rank = shiftRank(abilities.reason.rank, 2);
        abilities.reason.value = getRankData(abilities.reason.rank).min;
        this.log(`Hi-Tech: Reason raised to ${abilities.reason.rank}`);
        break;

      case "Robot":
        // No automatic modifications
        this.log("Robot: No automatic ability modifications");
        break;

      case "Alien":
        // No automatic modifications
        this.log("Alien: No automatic ability modifications");
        break;
    }
  }

  // Allow Altered Human to raise one ability
  raiseAbility(abilityKey) {
    if (this.state.origin !== "Altered Human") return false;
    if (this.state.alteredBonusUsed) {
      this.log("Altered Human bonus already used.");
      return false;
    }
    const ability = this.state.abilities[abilityKey];
    if (!ability) return false;

    ability.rank = shiftRank(ability.rank, 1);
    ability.value = getRankData(ability.rank).min;
    this.state.alteredBonusUsed = true;
    this.log(`Altered Human bonus: ${abilityKey} raised to ${ability.rank}`);
    return true;
  }

  // Step 3: Generate secondary abilities
  generateSecondaryAbilities() {
    const a = this.state.abilities;
    
    // Health = F + A + S + E
    this.state.health = a.fighting.value + a.agility.value + a.strength.value + a.endurance.value;
    this.log(`Health: ${a.fighting.value} + ${a.agility.value} + ${a.strength.value} + ${a.endurance.value} = ${this.state.health}`);
    
    // Karma = R + I + P
    this.state.karma = a.reason.value + a.intuition.value + a.psyche.value;
    this.log(`Initial Karma: ${a.reason.value} + ${a.intuition.value} + ${a.psyche.value} = ${this.state.karma}`);
    
    // Resources
    let resourceRank = "Typical";
    if (this.state.origin === "Alien") {
      resourceRank = "Poor";
      this.log("Alien: Resources start at Poor");
    } else if (this.state.origin === "Hi-Tech") {
      resourceRank = "Good";
      this.log("Hi-Tech: Resources set to Good");
    }
    
    // Roll modifier
    const { roll, result } = rollOnTable(ABILITY_MODIFIER);
    const modifiedRank = shiftRank(resourceRank, result.mod);
    this.log(`Resources: ${resourceRank} + modifier roll ${roll} (${result.mod >= 0 ? '+' : ''}${result.mod}) = ${modifiedRank}`);
    
    // Mutant reduction
    let finalResourceRank = modifiedRank;
    if (this.state.origin === "Mutant") {
      finalResourceRank = shiftRank(modifiedRank, -1);
      this.log(`Mutant: Resources reduced to ${finalResourceRank}`);
    }
    
    this.state.resources = {
      rank: finalResourceRank,
      value: getRankData(finalResourceRank).min
    };
    
    // Popularity
    let basePop = 10;
    if (this.state.origin === "Mutant" || this.state.origin === "Robot") {
      basePop = 0;
      this.log(`${this.state.origin}: Starting Popularity is 0`);
    }
    
    this.state.popularity = { hero: basePop, secretId: basePop };
  }

  setSecretId(hasSecret) {
    this.state.hasSecretId = hasSecret;
    if (hasSecret) {
      this.state.popularity.hero -= 5;
      this.log("Secret Identity: Popularity reduced by 5");
    }
  }

  // Step 4: Generate special abilities counts
  rollSpecialAbilityCounts() {
  // Powers
  const powersRoll = rollOnTable(POWERS_TABLE);
  let powersInitial = powersRoll.result.initial;
  let powersMax = powersRoll.result.max;

  if (this.state.origin === "Mutant") {
    powersInitial = Math.min(powersInitial + 1, 5);
    this.log(`Mutant: +1 Power (now ${powersInitial})`);
  }
  if (this.state.origin === "Alien") {
    powersInitial = Math.max(powersInitial - 1, 2);
    this.log(`Alien: -1 Power (now ${powersInitial})`);
  }

  this.state.powersData = {
    initial: powersInitial,
    max: powersMax,
    categories: [],
    chosen: [],
    rollResult: powersRoll.roll
  };
  this.log(`Powers: Roll ${powersRoll.roll} → ${powersInitial} initial, ${powersMax} max`);

  // Talents
  const talentsRoll = rollOnTable(TALENTS_TABLE);
  this.state.talentsData = { 
    initial: talentsRoll.result.initial, 
    max: talentsRoll.result.max,
    categories: [],
    chosen: [],
    rollResult: talentsRoll.roll
  };
  this.log(`Talents: Roll ${talentsRoll.roll} → ${talentsRoll.result.initial} initial, ${talentsRoll.result.max} max`);

  // Contacts
  const contactsRoll = rollOnTable(CONTACTS_TABLE);
  let contactsInitial = contactsRoll.result.initial;

  if (this.state.origin === "Hi-Tech") {
    contactsInitial = Math.max(contactsInitial, 1);
    this.log("Hi-Tech: Must have at least 1 Contact (support organization)");
  }
  if (this.state.origin === "Alien") {
    contactsInitial = 1;
    this.log("Alien: Starts with exactly 1 initial Contact (usually home race)");
  }

  this.state.contactsData = { 
    initial: contactsInitial, 
    max: contactsRoll.result.max,
    chosen: [],
    rollResult: contactsRoll.roll
  };
  this.log(`Contacts: Roll ${contactsRoll.roll} → ${contactsInitial} initial, ${contactsRoll.result.max} max`);
}


  // Roll power categories
  rollPowerCategories() {
    const categories = [];
    for (let i = 0; i < this.state.powersData.initial; i++) {
      const { roll, result } = rollOnTable(POWER_CATEGORIES);
      categories.push({ roll, category: result.category });
      this.log(`Power ${i + 1} Category: Roll ${roll} → ${result.category}`);
    }
    this.state.powersData.categories = categories;
    return categories;
  }

  // Roll talent categories  
  rollTalentCategories() {
    const categories = [];
    for (let i = 0; i < this.state.talentsData.initial; i++) {
      const { roll, result } = rollOnTable(TALENT_CATEGORIES);
      categories.push({ roll, category: result.category });
      this.log(`Talent ${i + 1} Category: Roll ${roll} → ${result.category}`);
    }
    this.state.talentsData.categories = categories;
    return categories;
  }

  // Roll power rank
  rollPowerRank() {
    const { roll, result } = rollOnTable(COLUMN_4);
    const rankData = getRankData(result.rank);
    return { roll, rank: result.rank, value: rankData.min };
  }

  // Choose a power from a category
  choosePower(category, powerName, { silent = false } = {}) {
    const powerList = POWER_LISTS[category];
    if (!powerList) return null;

    // Prevent exact duplicate powers by name
    if (this.state.powersData.chosen.some(p => p.name === powerName)) {
      const msg = `Duplicate power "${powerName}" ignored (powers should be unique).`;
      this.log(msg);
      if (!silent && typeof ui !== "undefined" && ui.notifications) {
        ui.notifications.warn(msg);
      }
      return null;
    }

    const power = powerList.find(p => p.name === powerName);
    if (!power) return null;

    // Enforce star-powers counting as 2 slots vs max
    const slotCost = power.star ? 2 : 1;
    const usedSlots = this.state.powersData.chosen.reduce(
      (sum, p) => sum + (p.star ? 2 : 1),
      0
    );
    const maxSlots = this.state.powersData.max ?? this.state.powersData.initial ?? 0;

    if (maxSlots && usedSlots + slotCost > maxSlots) {
      const msg = `Cannot add "${powerName}" – it would exceed the maximum number of starting powers.`;
      this.log(msg);
      if (!silent && typeof ui !== "undefined" && ui.notifications) {
        ui.notifications.warn(msg);
      }
      return null;
    }

    const rankInfo = this.rollPowerRank();
    const chosenPower = {
      name: power.name,
      category,
      rank: rankInfo.rank,
      value: rankInfo.value,
      star: power.star,
      rankRoll: rankInfo.roll
    };

    this.state.powersData.chosen.push(chosenPower);
    this.log(`Power chosen: ${power.name} at ${rankInfo.rank} (${rankInfo.value}) - Roll ${rankInfo.roll}`);

    return chosenPower;
  }

  // Helper for random selection without duplicates
  autoPickPower(category) {
    const powerList = POWER_LISTS[category] || [];
    if (!powerList.length) return null;

    // Try up to N times to find a legal, non-duplicate power
    for (let i = 0; i < powerList.length; i++) {
      const candidate = powerList[Math.floor(Math.random() * powerList.length)];
      const result = this.choosePower(category, candidate.name, { silent: true });
      if (result) return result;
    }

    // No legal power found
    return null;
  }

  // Choose a talent
  chooseTalent(category, talentName, { silent = false } = {}) {
    const talentList = TALENT_LISTS[category];
    if (!talentList) return null;

    // No duplicate talents by name
    if (this.state.talentsData.chosen.some(t => t.name === talentName)) {
      const msg = `Duplicate talent "${talentName}" ignored (talents should be unique).`;
      this.log(msg);
      if (!silent && typeof ui !== "undefined" && ui.notifications) {
        ui.notifications.warn(msg);
      }
      return null;
    }

    const talent = talentList.find(t => t.name === talentName);
    if (!talent) return null;

    const chosenTalent = {
      name: talent.name,
      category,
      star: talent.star
    };

    this.state.talentsData.chosen.push(chosenTalent);
    this.log(`Talent chosen: ${talent.name} (${category})`);

    return chosenTalent;
  }

  // Helper for random selection without duplicates
  autoPickTalent(category) {
    const talentList = TALENT_LISTS[category] || [];
    if (!talentList.length) return null;

    for (let i = 0; i < talentList.length; i++) {
      const candidate = talentList[Math.floor(Math.random() * talentList.length)];
      const result = this.chooseTalent(category, candidate.name, { silent: true });
      if (result) return result;
    }

    return null;
  }


  // Choose a contact
  chooseContact(contactType, name = "") {
    const contact = {
      type: contactType,
      name: name || contactType
    };
    
    this.state.contactsData.chosen.push(contact);
    this.log(`Contact chosen: ${contact.name} (${contactType})`);
    
    return contact;
  }

  // Generate a complete random character in one shot
  generateFullRandom() {
    this.log("=== FULL RANDOM GENERATION ===");
    
    // Step 1: Origin
    this.rollOrigin();
    
    // Step 2: Primary Abilities
    this.rollPrimaryAbilities();
    
    // For Altered Human, randomly pick one ability to raise
    if (this.state.origin === "Altered Human") {
      const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
      const randomAbility = abilities[Math.floor(Math.random() * abilities.length)];
      this.raiseAbility(randomAbility);
      this.log(`Altered Human: Randomly raised ${randomAbility}`);
    }
    
    // Step 3: Secondary Abilities
    this.generateSecondaryAbilities();
    
    // Randomly decide secret ID (50% chance)
    const hasSecret = Math.random() < 0.5;
    if (hasSecret) {
      this.setSecretId(true);
    }
    
    // Step 4: Roll special ability counts
    this.rollSpecialAbilityCounts();
    
    // Step 5: Roll and choose powers
    this.rollPowerCategories();
    const powerCats = this.state.powersData.categories;
    for (const cat of powerCats) {
      if (this.state.powersData.chosen.length >= this.state.powersData.initial) break;
      this.autoPickPower(cat.category);
    }
    
    // Step 6: Roll and choose talents
    this.rollTalentCategories();
    const talentCats = this.state.talentsData.categories;
    for (const cat of talentCats) {
      if (this.state.talentsData.chosen.length >= this.state.talentsData.initial) break;
      this.autoPickTalent(cat.category);
    }
    
    // Step 7: Choose random contacts
    const numContacts = this.state.contactsData.initial;
    for (let i = 0; i < numContacts; i++) {
      const randomType = CONTACT_TYPES[Math.floor(Math.random() * CONTACT_TYPES.length)];
      this.chooseContact(randomType);
    }
    
    this.log("=== GENERATION COMPLETE ===");
    return this.state;
  }

  // Apply to actor
  async applyToActor() {
  if (!this.generator) return;

  // Build history entry before we reset anything
  const shortLabel = this.generator.buildShortLabel
    ? this.generator.buildShortLabel()
    : "Unnamed hero";
  const timestamp = new Date().toLocaleTimeString();

  this.history.unshift({
    timestamp,
    label: shortLabel
  });

  await this.generator.applyToActor();

  if (typeof ui !== "undefined" && ui.notifications) {
    ui.notifications.info("Random character applied to sheet.");
  }

  // If you want to leave the hero displayed, comment the next two lines out
  this.generator = null;
  this.currentStep = 0;
  this.updateDisplay();
}


  getState() {
    return this.state;
  }

  getLog() {
    return this.state.log;
  }

  buildTextSummary() {
    const s = this.state;
    if (!s) return "";

    const primary = s.primaryAbilities || {};
    const secondary = s.secondary || {};
    const origin = s.origin || {};

    const line = (label, v) => `${label}: ${v ?? "-"}`;

    const primaryLines = Object.entries(primary)
      .map(([key, data]) => {
        const label = key.toUpperCase();
        return `${label} ${data.rank} (${data.value})`;
      })
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
      `Hero Origin: ${origin.type || "-"}`,
      "",
      "Primary Abilities:",
      primaryLines,
      "",
      "Secondary:",
      line("Health", secondary.health),
      line("Karma", secondary.karma),
      line("Resources", `${secondary.resourcesRank} (${secondary.resourcesValue})`),
      line("Popularity", `${secondary.popularityRank} (${secondary.popularityValue})`),
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
    const origin = s.origin || {};
    const primary = s.primaryAbilities || {};

    const f = primary.fighting?.rank || "-";
    const a = primary.agility?.rank || "-";
    const e = primary.endurance?.rank || "-";

    const powers = (s.powersData?.chosen || []);
    const topPowers = powers.slice(0, 2).map(p => p.name).join(", ");
    const powerPart = topPowers ? `Powers: ${topPowers}` : "Powers: none";

    return `${origin.type || "Unknown origin"} F/A/E ${f}/${a}/${e} — ${powerPart}`;
  }

  // Build the update object for applying to actor
  buildActorUpdates() {
    const s = this.state;
    if (!s || !s.abilities) return null;

    const a = s.abilities;
    
    return {
      "system.origin": s.origin || "",
      "system.powerOrigin": s.origin?.toLowerCase().replace("-", " ") || "altered human",
      "system.isMutant": s.origin === "Mutant",
      "system.identityType": s.hasSecretId ? "secret" : "public",
      
      // Primary abilities
      "system.abilities.fighting.value": a.fighting.value,
      "system.abilities.fighting.rank": a.fighting.rank,
      "system.abilities.fighting.initialRoll": a.fighting.initialRoll || "",
      "system.abilities.fighting.initialRank": a.fighting.initialRank || "",
      
      "system.abilities.agility.value": a.agility.value,
      "system.abilities.agility.rank": a.agility.rank,
      "system.abilities.agility.initialRoll": a.agility.initialRoll || "",
      "system.abilities.agility.initialRank": a.agility.initialRank || "",
      
      "system.abilities.strength.value": a.strength.value,
      "system.abilities.strength.rank": a.strength.rank,
      "system.abilities.strength.initialRoll": a.strength.initialRoll || "",
      "system.abilities.strength.initialRank": a.strength.initialRank || "",
      
      "system.abilities.endurance.value": a.endurance.value,
      "system.abilities.endurance.rank": a.endurance.rank,
      "system.abilities.endurance.initialRoll": a.endurance.initialRoll || "",
      "system.abilities.endurance.initialRank": a.endurance.initialRank || "",
      
      "system.abilities.reason.value": a.reason.value,
      "system.abilities.reason.rank": a.reason.rank,
      "system.abilities.reason.initialRoll": a.reason.initialRoll || "",
      "system.abilities.reason.initialRank": a.reason.initialRank || "",
      
      "system.abilities.intuition.value": a.intuition.value,
      "system.abilities.intuition.rank": a.intuition.rank,
      "system.abilities.intuition.initialRoll": a.intuition.initialRoll || "",
      "system.abilities.intuition.initialRank": a.intuition.initialRank || "",
      
      "system.abilities.psyche.value": a.psyche.value,
      "system.abilities.psyche.rank": a.psyche.rank,
      "system.abilities.psyche.initialRoll": a.psyche.initialRoll || "",
      "system.abilities.psyche.initialRank": a.psyche.initialRank || "",
      
      // Secondary abilities
      "system.attributes.health.value": s.health,
      "system.attributes.health.max": s.health,
      "system.attributes.karma.value": s.karma,
      "system.attributes.karma.max": s.karma,
      "system.attributes.resources.rank": s.resources.rank,
      "system.attributes.resources.value": s.resources.value,
      "system.attributes.popularity.hero.value": s.popularity.hero,
      "system.attributes.popularity.secretId.value": s.hasSecretId ? s.popularity.secretId : 0
    };
  }

  // Build item data for powers, talents, contacts
  buildItemData() {
    const s = this.state;
    const items = [];

    // Powers
    for (const p of (s.powersData?.chosen || [])) {
      items.push({
        name: p.name,
        type: "power",
        system: {
          rank: p.rank,
          value: p.value,
          category: p.category,
          isStarred: p.star || false,
          description: `Generated power from ${p.category} category.`
        }
      });
    }

    // Talents
    for (const t of (s.talentsData?.chosen || [])) {
      items.push({
        name: t.name,
        type: "talent",
        system: {
          type: t.category,
          description: `Generated talent from ${t.category} category.`
        }
      });
    }

    // Contacts
    for (const c of (s.contactsData?.chosen || [])) {
      items.push({
        name: c.name || c.type,
        type: "contact",
        system: {
          type: c.type,
          disposition: "Friendly",
          description: "Generated contact."
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
    this.randomPowers = false;
    this.randomTalents = false;
    this._boundEvents = false;
    // New: per-session concept history
    this.history = [];

    this.bindEvents(html);
  }

  initialize() {
    this.generator = new CharacterGenerator(this.actor);
    this.bindEvents();
    this.renderStep(0);
  }

  bindEvents() {
    // Only bind once - use event delegation
    if (this._boundEvents) return;
    this._boundEvents = true;
    
    const container = this.html.find('.chargen-container');
    if (!container.length) return;

    // Use event delegation for all dynamic content
    container.on('click', '.chargen-start', () => this.startGeneration());
    container.on('click', '.chargen-quick-random', () => this.quickRandomCharacter());
    container.on('click', '.chargen-reroll', () => this.quickRandomCharacter());
    container.on('click', '.chargen-reset', () => this.reset());
    container.on('click', '.chargen-roll-origin', () => this.rollOrigin());
    container.on('change', '.chargen-origin-select', ev => this.selectOrigin(ev.target.value));
    container.on('click', '.chargen-roll-abilities', () => this.rollAbilities());
    container.on('click', '.chargen-raise-ability', ev => {
      const ability = ev.currentTarget.dataset.ability;
      this.raiseAbility(ability);
    });
    container.on('click', '.chargen-generate-secondary', () => this.generateSecondary());
    container.on('change', '.chargen-secret-id', ev => this.setSecretId(ev.target.checked));
    container.on('click', '.chargen-roll-specials', () => this.rollSpecials());
    container.on('click', '.chargen-roll-categories', () => this.rollCategories());
    container.on('click', '.chargen-choose-power', ev => {
      const category = ev.currentTarget.dataset.category;
      const power = ev.currentTarget.dataset.power;
      this.choosePower(category, power);
    });
    container.on('click', '.chargen-choose-talent', ev => {
      const category = ev.currentTarget.dataset.category;
      const talent = ev.currentTarget.dataset.talent;
      this.chooseTalent(category, talent);
    });
    container.on('click', '.chargen-choose-contact', ev => {
      const type = ev.currentTarget.dataset.type;
      this.chooseContact(type);
    });

    // Toggle random / manual mode for powers
    container.on('change', '.chargen-powers-mode', ev => {
      this.randomPowers = ev.currentTarget.value === "random";
      this.updateDisplay();
    });

    // Randomly roll all remaining powers
    container.on('click', '.chargen-roll-powers', () => {
      this.rollAllPowersRandomly();
    });

    // Toggle random / manual mode for talents
    container.on('change', '.chargen-talents-mode', ev => {
      this.randomTalents = ev.currentTarget.value === "random";
      this.updateDisplay();
    });

    // Randomly roll all remaining talents
    container.on('click', '.chargen-roll-talents', () => {
      this.rollAllTalentsRandomly();
    });

    container.on('click', '.chargen-soft-reset', () => this.softReset());

    container.on('click', '.chargen-next', () => this.nextStep());
    container.on('click', '.chargen-prev', () => this.prevStep());
    container.on('click', '.chargen-apply', () => this.applyToActor());
  }

  softReset() {
    if (!this.generator) return;
    // Use the existing generator reset logic, but do NOT touch this.history
    this.generator.reset();
    this.currentStep = 0;
    this.updateDisplay();

    if (typeof ui !== "undefined" && ui.notifications) {
      ui.notifications.info("New hero started. Previous concepts kept in history.");
    }
  }

  startGeneration() {
    this.generator = new CharacterGenerator(this.actor);
    this.currentStep = 1;
    this.renderStep(1);
  }

  quickRandomCharacter() {
    this.generator = new CharacterGenerator(this.actor);
    this.generator.generateFullRandom();
    this.currentStep = 8; // Jump to summary
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
    const result = this.generator.rollOrigin();
    this.updateDisplay();
  }

  selectOrigin(origin) {
    if (origin) {
      this.generator.setOrigin(origin);
      this.updateDisplay();
    }
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

  choosePower(category, power) {
    this.generator.choosePower(category, power);
    this.updateDisplay();
  }

  chooseTalent(category, talent) {
    this.generator.chooseTalent(category, talent);
    this.updateDisplay();
  }

  rollAllPowersRandomly() {
    if (!this.generator || !this.generator.state?.powersData) return;
    const data = this.generator.state.powersData;
    const categories = data.categories || [];
    const needed = data.initial || 0;

    // Fill any categories that don't have a chosen power yet,
    // up to the allowed number of starting powers.
    for (const entry of categories) {
      if (data.chosen.length >= needed) break;
      const alreadyChosen = data.chosen.some(p => p.category === entry.category);
      if (alreadyChosen) continue;
      this.generator.autoPickPower(entry.category);
    }

    this.updateDisplay();
  }

  rollAllTalentsRandomly() {
    if (!this.generator || !this.generator.state?.talentsData) return;
    const data = this.generator.state.talentsData;
    const categories = data.categories || [];
    const needed = data.initial || 0;

    for (const entry of categories) {
      if (data.chosen.length >= needed) break;
      const alreadyChosen = data.chosen.some(t => t.category === entry.category);
      if (alreadyChosen) continue;
      this.generator.autoPickTalent(entry.category);
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
    if (!this.generator || !this.generator.state) return;

    const updates = this.generator.buildActorUpdates();
    if (!updates) return;

    // Build history entry before we reset anything
    const shortLabel = this.generator.buildShortLabel
      ? this.generator.buildShortLabel()
      : "Unnamed hero";
    const timestamp = new Date().toLocaleTimeString();

    this.history.unshift({
      timestamp,
      label: shortLabel
    });

    // Update actor attributes
    await this.actor.update(updates);

    // Create items (powers, talents, contacts)
    const itemData = this.generator.buildItemData();
    if (itemData && itemData.length > 0) {
      await this.actor.createEmbeddedDocuments("Item", itemData);
    }

    // Optionally notify
    if (typeof ui !== "undefined" && ui.notifications) {
      ui.notifications.info("Random character applied to sheet.");
    }

    // After applying, you can either leave the hero on screen,
    // or auto-soft-reset to encourage the next concept.
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
    const log = this.generator?.getLog() || [];

    let content = '';

    switch (step) {
      case 0:
        content = this.renderIntro();
        break;
      case 1:
        content = this.renderOriginStep(state);
        break;
      case 2:
        content = this.renderAbilitiesStep(state);
        break;
      case 3:
        content = this.renderSecondaryStep(state);
        break;
      case 4:
        content = this.renderSpecialsStep(state);
        break;
      case 5:
        content = this.renderPowersStep(state);
        break;
      case 6:
        content = this.renderTalentsStep(state);
        break;
      case 7:
        content = this.renderContactsStep(state);
        break;
      case 8:
        content = this.renderSummaryStep(state);
        break;
    }

    // Add log display
    const logHtml = log.length ? `
      <div class="chargen-log">
        <h4>Generation Log</h4>
        <div class="log-entries">
          ${log.map(l => `<div class="log-entry">${l}</div>`).join('')}
        </div>
      </div>
    ` : '';

    container.html(content + logHtml);
  }

  renderIntro() {
    return `
      <div class="chargen-intro">
        <h3>Random Character Generator</h3>
        <p>Generate characters using MSH Advanced Set rules.</p>
        <div class="chargen-intro-buttons">
          <button type="button" class="chargen-start">
            <i class="fas fa-shoe-prints"></i> Step-by-Step
          </button>
          <button type="button" class="chargen-quick-random">
            <i class="fas fa-dice"></i> Quick Random
          </button>
        </div>
        <p class="chargen-hint">Quick Random for instant NPCs and villains</p>
      </div>
    `;
  }

  renderOriginStep(state) {
    const origins = ["Altered Human", "Mutant", "Hi-Tech", "Robot", "Alien"];
    return `
      <div class="chargen-step">
        <h3>Step 1: Origin</h3>
        <p>Roll or choose your character's origin.</p>
        
        <div class="chargen-controls">
          <button type="button" class="chargen-roll-origin">Roll Origin (d100)</button>
          <span>or</span>
          <select class="chargen-origin-select">
            <option value="">-- Choose Origin --</option>
            ${origins.map(o => `<option value="${o}" ${state?.origin === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        
        ${state?.origin ? `
          <div class="chargen-result">
            <strong>Origin:</strong> ${state.origin}
            <div class="origin-info">${this.getOriginInfo(state.origin)}</div>
          </div>
        ` : ''}
        
        <div class="chargen-nav">
          ${state?.origin ? '<button type="button" class="chargen-next">Next: Primary Abilities →</button>' : ''}
        </div>
      </div>
    `;
  }

  getOriginInfo(origin) {
    const info = {
      "Altered Human": "May raise one primary ability by 1 rank after rolling.",
      "Mutant": "+1 Power, Endurance +1 rank, Resources -1 rank, Popularity starts at 0.",
      "Hi-Tech": "Reason +2 ranks, Resources Good, must have 1+ Contact, requires scientific/professional Talent.",
      "Robot": "Popularity starts at 0. May heal normally. No Karma loss for being killed/deactivated.",
      "Alien": "-1 Power (min 2), Resources Poor, max 1 initial Contact."
    };
    return info[origin] || "";
  }

  renderAbilitiesStep(state) {
    const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
    const hasAbilities = state?.abilities && Object.keys(state.abilities).length > 0;
    const isAlteredHuman = state?.origin === "Altered Human";
    
    return `
      <div class="chargen-step">
        <h3>Step 2: Primary Abilities</h3>
        <p>Roll your FASERIP abilities based on your origin.</p>
        
        <div class="chargen-controls">
          <button type="button" class="chargen-roll-abilities" ${hasAbilities ? 'disabled' : ''}>
            Roll All Abilities
          </button>
        </div>
        
        ${hasAbilities ? `
          <table class="chargen-abilities-table">
            <thead>
              <tr>
                <th>Ability</th>
                <th>Roll</th>
                <th>Rank</th>
                <th>Value</th>
                ${isAlteredHuman ? '<th>Raise</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${abilities.map(a => `
                <tr>
                  <td>${a.charAt(0).toUpperCase() + a.slice(1)}</td>
                  <td>${state.abilities[a].initialRoll}</td>
                  <td>${state.abilities[a].rank}</td>
                  <td>${state.abilities[a].value}</td>
                  ${isAlteredHuman ? `
                    <td>
                      <button type="button" class="chargen-raise-ability" data-ability="${a}">+1</button>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">← Previous</button>
          ${hasAbilities ? '<button type="button" class="chargen-next">Next: Secondary Abilities →</button>' : ''}
        </div>
      </div>
    `;
  }

  renderSecondaryStep(state) {
    const hasSecondary = state?.health > 0;
    
    return `
      <div class="chargen-step">
        <h3>Step 3: Secondary Abilities</h3>
        <p>Calculate Health, Karma, Resources, and Popularity.</p>
        
        <div class="chargen-controls">
          <button type="button" class="chargen-generate-secondary" ${hasSecondary ? 'disabled' : ''}>
            Generate Secondary Abilities
          </button>
        </div>
        
        ${hasSecondary ? `
          <div class="chargen-secondary-results">
            <div class="secondary-item">
              <label>Health (F+A+S+E):</label>
              <span>${state.health}</span>
            </div>
            <div class="secondary-item">
              <label>Initial Karma (R+I+P):</label>
              <span>${state.karma}</span>
            </div>
            <div class="secondary-item">
              <label>Resources:</label>
              <span>${state.resources.rank} (${state.resources.value})</span>
            </div>
            <div class="secondary-item">
              <label>Popularity:</label>
              <span>${state.popularity.hero}</span>
            </div>
            <div class="secondary-item">
              <label>
                <input type="checkbox" class="chargen-secret-id" ${state.hasSecretId ? 'checked' : ''} />
                Secret Identity (-5 Popularity)
              </label>
            </div>
          </div>
        ` : ''}
        
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">← Previous</button>
          ${hasSecondary ? '<button type="button" class="chargen-next">Next: Special Abilities →</button>' : ''}
        </div>
      </div>
    `;
  }

  renderSpecialsStep(state) {
    const hasSpecials = state?.powersData?.initial > 0;
    
    return `
      <div class="chargen-step">
        <h3>Step 4: Special Abilities Count</h3>
        <p>Determine how many Powers, Talents, and Contacts you start with.</p>
        
        <div class="chargen-controls">
          <button type="button" class="chargen-roll-specials" ${hasSpecials ? 'disabled' : ''}>
            Roll Special Ability Counts
          </button>
        </div>
        
        ${hasSpecials ? `
          <div class="chargen-specials-results">
            <div class="special-item">
              <label>Powers:</label>
              <span>${state.powersData.initial} initial / ${state.powersData.max} max</span>
            </div>
            <div class="special-item">
              <label>Talents:</label>
              <span>${state.talentsData.initial} initial / ${state.talentsData.max} max</span>
            </div>
            <div class="special-item">
              <label>Contacts:</label>
              <span>${state.contactsData.initial} initial / ${state.contactsData.max} max</span>
            </div>
          </div>
          
          <h4>Roll Power & Talent Categories</h4>
          <button type="button" class="chargen-roll-categories" ${state.powersData.categories?.length ? 'disabled' : ''}>
            Roll Categories
          </button>
          
          ${state.powersData.categories?.length ? `
            <div class="chargen-categories">
              <h5>Power Categories:</h5>
              <ul>
                ${state.powersData.categories.map((c, i) => `<li>Power ${i + 1}: ${c.category} (Roll: ${c.roll})</li>`).join('')}
              </ul>
              <h5>Talent Categories:</h5>
              <ul>
                ${state.talentsData.categories.map((c, i) => `<li>Talent ${i + 1}: ${c.category} (Roll: ${c.roll})</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        ` : ''}
        
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">← Previous</button>
          ${state?.powersData?.categories?.length ? '<button type="button" class="chargen-next">Next: Choose Powers →</button>' : ''}
        </div>
      </div>
    `;
  }

  renderPowersStep(state) {
    const categories = state?.powersData?.categories || [];
    const chosen = state?.powersData?.chosen || [];
    const needed = state?.powersData?.initial || 0;

    const remaining = Math.max(0, needed - (chosen.length || 0));
    
    return `
      <div class="chargen-step">
        <h3>Step 5: Choose Powers</h3>
        <p>Select ${needed} powers from your rolled categories. (${chosen.length}/${needed} chosen)</p>

        <!-- MODE TOGGLE: manual vs random -->
        <div class="chargen-mode-row">
          <label>
            <input type="radio"
                  name="chargen-powers-mode"
                  class="chargen-powers-mode"
                  value="manual"
                  ${this.randomPowers ? "" : "checked"}>
            Roll categories, then <b>pick powers</b> (RAW)
          </label>
          <label>
            <input type="radio"
                  name="chargen-powers-mode"
                  class="chargen-powers-mode"
                  value="random"
                  ${this.randomPowers ? "checked" : ""}>
            Roll categories and <b>randomize powers</b>
          </label>
        </div>
        
        ${categories.map((cat, idx) => {
          const alreadyChosen = chosen.find(c => c.category === cat.category);
          if (alreadyChosen) {
            return `
              <div class="chargen-power-category chosen">
                <h4>${cat.category}</h4>
                <div class="chosen-power">✓ ${alreadyChosen.name} (${alreadyChosen.rank} ${alreadyChosen.value})</div>
              </div>
            `;
          }
          
          const powers = POWER_LISTS[cat.category] || [];
          return `
            <div class="chargen-power-category">
              <h4>${cat.category}</h4>
              <div class="power-list">
                ${powers.map(p => `
                  <button type="button" class="chargen-choose-power" 
                          data-category="${cat.category}" 
                          data-power="${p.name}"
                          ${p.star ? 'data-star="true"' : ''}>
                    ${p.name}${p.star ? ' ★' : ''}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}

        <!-- RANDOM ROLL REMAINING BUTTON -->
        ${this.randomPowers && remaining > 0 ? `
          <div class="chargen-controls">
            <button type="button" class="chargen-roll-powers">
              Roll remaining powers (${remaining})
            </button>
          </div>
        ` : ``}
        
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">← Previous</button>
          ${chosen.length >= needed ? '<button type="button" class="chargen-next">Next: Choose Talents →</button>' : ''}
        </div>
      </div>
    `;
  }

  renderTalentsStep(state) {
    const categories = state?.talentsData?.categories || [];
    const chosen = state?.talentsData?.chosen || [];
    const needed = state?.talentsData?.initial || 0;

    const remaining = Math.max(0, needed - (chosen.length || 0));
    
    return `
      <div class="chargen-step">
        <h3>Step 6: Choose Talents</h3>
        <p>Select ${needed} talents from your rolled categories. (${chosen.length}/${needed} chosen)</p>

        <!-- MODE TOGGLE: manual vs random -->
        <div class="chargen-mode-row">
          <label>
            <input type="radio"
                  name="chargen-talents-mode"
                  class="chargen-talents-mode"
                  value="manual"
                  ${this.randomTalents ? "" : "checked"}>
            Roll categories, then <b>pick talents</b> (RAW)
          </label>
          <label>
            <input type="radio"
                  name="chargen-talents-mode"
                  class="chargen-talents-mode"
                  value="random"
                  ${this.randomTalents ? "checked" : ""}>
            Roll categories and <b>randomize talents</b>
          </label>
        </div>
        
        ${categories.map((cat, idx) => {
          const alreadyChosen = chosen.find(c => c.category === cat.category);
          if (alreadyChosen) {
            return `
              <div class="chargen-talent-category chosen">
                <h4>${cat.category}</h4>
                <div class="chosen-talent">✓ ${alreadyChosen.name}</div>
              </div>
            `;
          }
          
          const talents = TALENT_LISTS[cat.category] || [];
          return `
            <div class="chargen-talent-category">
              <h4>${cat.category}</h4>
              <div class="talent-list">
                ${talents.map(t => `
                  <button type="button" class="chargen-choose-talent" 
                          data-category="${cat.category}" 
                          data-talent="${t.name}"
                          ${t.star ? 'data-star="true"' : ''}>
                    ${t.name}${t.star ? ' ★' : ''}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}

        <!-- RANDOM ROLL REMAINING BUTTON -->
        ${this.randomTalents && remaining > 0 ? `
          <div class="chargen-controls">
            <button type="button" class="chargen-roll-talents">
              Roll remaining talents (${remaining})
            </button>
          </div>
        ` : ``}
        
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">← Previous</button>
          ${chosen.length >= needed ? '<button type="button" class="chargen-next">Next: Choose Contacts →</button>' : ''}
        </div>
      </div>
    `;
  }

  renderContactsStep(state) {
    const chosen = state?.contactsData?.chosen || [];
    const needed = state?.contactsData?.initial || 0;
    
    return `
      <div class="chargen-step">
        <h3>Step 7: Choose Contacts</h3>
        <p>Select ${needed} contacts. (${chosen.length}/${needed} chosen)</p>
        
        ${chosen.length < needed ? `
          <div class="contact-types">
            ${CONTACT_TYPES.map(type => `
              <button type="button" class="chargen-choose-contact" data-type="${type}">
                ${type}
              </button>
            `).join('')}
          </div>
        ` : ''}
        
        ${chosen.length ? `
          <div class="chosen-contacts">
            <h4>Chosen Contacts:</h4>
            <ul>
              ${chosen.map(c => `<li>${c.name} (${c.type})</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">← Previous</button>
          ${chosen.length >= needed ? '<button type="button" class="chargen-next">Next: Summary →</button>' : ''}
        </div>
      </div>
    `;
  }

  renderSummaryStep(state) {
  const g = this.generator;
  if (!g || !state) {
    return `
      <div class="chargen-step chargen-summary-step">
        <h3>Step 8: Summary & Apply to Sheet</h3>
        <p>No character has been generated yet.</p>
        <div class="chargen-nav">
          <button type="button" class="chargen-prev">Back</button>
        </div>
      </div>
    `;
  }

  const primary = state.abilities || {};
  const origin  = state.origin || { type: "-" };

  const secondary = {
    health: state.health,
    karma: state.karma,
    resourcesRank: state.resources?.rank,
    resourcesValue: state.resources?.value,
    popularityRank: "Heroic",
    popularityValue: state.popularity?.hero
  };

  const powers   = state.powersData?.chosen   || [];
  const talents  = state.talentsData?.chosen  || [];
  const contacts = state.contactsData?.chosen || [];

  const textSummary = g.buildTextSummary ? g.buildTextSummary(state) : "";

  return `
    <div class="chargen-step chargen-summary-step">
      <h3>Step 8: Summary & Apply to Sheet</h3>

      <div class="chargen-summary-grid">
        <section class="summary-card summary-primary">
          <h4>Identity & Origin</h4>
          <div class="summary-row">
            <span class="summary-label">Origin:</span>
            <span class="summary-value">${origin.type || "-"}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Secret ID?</span>
            <span class="summary-value">${state.secretId ? "Yes" : "No"}</span>
          </div>

          <h4>Primary Abilities</h4>
          <table class="summary-table">
            <tbody>
              ${["fighting","agility","strength","endurance","reason","intuition","psyche"].map(k => {
                const a = primary[k] || {};
                const label = k.charAt(0).toUpperCase() + k.slice(1);
                return `
                  <tr>
                    <td class="summary-ability-label">${label}</td>
                    <td class="summary-ability-rank">${a.rank || "-"}</td>
                    <td class="summary-ability-value">${a.value ?? ""}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <h4>Secondary</h4>
          <table class="summary-table">
            <tbody>
              <tr>
                <td>Health</td>
                <td>${secondary.health ?? "-"}</td>
              </tr>
              <tr>
                <td>Karma</td>
                <td>${secondary.karma ?? "-"}</td>
              </tr>
              <tr>
                <td>Resources</td>
                <td>${secondary.resourcesRank || "-"} (${secondary.resourcesValue ?? ""})</td>
              </tr>
              <tr>
                <td>Popularity</td>
                <td>${secondary.popularityRank || "-"} (${secondary.popularityValue ?? ""})</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="summary-card summary-specials">
          <h4>Powers</h4>
          <ul class="summary-list">
            ${powers.length ? powers.map(p => `
              <li>
                <span class="summary-main">${p.name}</span>
                <span class="summary-sub">(${p.category})</span>
                <span class="summary-rank">${p.rank} (${p.value})</span>
              </li>
            `).join("") : `<li>None</li>`}
          </ul>

          <h4>Talents</h4>
          <ul class="summary-list">
            ${talents.length ? talents.map(t => `
              <li>
                <span class="summary-main">${t.name}</span>
                <span class="summary-sub">(${t.category})</span>
              </li>
            `).join("") : `<li>None</li>`}
          </ul>

          <h4>Contacts</h4>
          <ul class="summary-list">
            ${contacts.length ? contacts.map(c => `
              <li>
                <span class="summary-main">${c.name || c.type || "Contact"}</span>
                ${c.type ? `<span class="summary-sub">(${c.type})</span>` : ""}
              </li>
            `).join("") : `<li>None</li>`}
          </ul>
        </section>
      </div>

      ${textSummary ? `
        <div class="chargen-result">
          <label>Full text summary (for copy/paste or notes):</label>
          <textarea class="chargen-summary-text" readonly rows="10"
                    style="width: 100%; font-family: monospace; font-size: 0.85em;">
${textSummary}
          </textarea>
        </div>
      ` : ""}

      ${this.history?.length ? `
        <div class="chargen-history">
          <div class="chargen-history-title">Earlier concepts (this session):</div>
          <ul>
            ${this.history.map(h => `
              <li><span class="chargen-history-meta">${h.timestamp}</span> — ${h.label}</li>
            `).join("")}
          </ul>
        </div>
      ` : ""}

      <div class="chargen-nav">
        <button type="button" class="chargen-prev">Back</button>
        <button type="button" class="chargen-reroll chargen-reroll-btn">
          <i class="fas fa-dice"></i> Re-roll
        </button>
        <button type="button" class="chargen-apply chargen-apply-btn">
          <i class="fas fa-download"></i> Apply to Sheet
        </button>
      </div>
    </div>
  `;
}


}