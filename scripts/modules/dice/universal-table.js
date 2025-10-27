// File: scripts/modules/dice/universal-table.js
// Universal Table data structures and rank lookup utilities for FASERIP system

// Rank names array for lookups
export const RANKS = [
  "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable",
  "Incredible", "Amazing", "Monstrous", "Unearthly", "Shift-X", "Shift-Y", "Shift-Z",
  "Class 1000", "Class 3000", "Class 5000"
];

// Extended rank names including Shift-0 and Beyond
export const RANKS_EXTENDED = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", "Incredible",
  "Amazing", "Monstrous", "Unearthly", "Shift X", "Shift Y", "Shift Z",
  "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

// Action types with codes and labels
export const actionTypes = [
  { code: "BA", label: "Blunt Attacks" },
  { code: "EA", label: "Edged Attacks" },
  { code: "Sh", label: "Shooting Attacks" },
  { code: "TE", label: "Throwing Edged" },
  { code: "TB", label: "Throwing Blunt" },
  { code: "En", label: "Energy" },
  { code: "Fo", label: "Force" },
  { code: "Gp", label: "Grappling" },
  { code: "Gb", label: "Grabbing" },
  { code: "Es", label: "Escaping" },
  { code: "Ch", label: "Charging" },
  { code: "Do", label: "Dodging" },
  { code: "Ev", label: "Evading" },
  { code: "Bl", label: "Blocking" },
  { code: "Ca", label: "Catching" },
  { code: "St", label: "Stun?" },
  { code: "Sl", label: "Slam?" },
  { code: "Ki", label: "Kill?" }
];

// Maps action codes to the ability they use
export const ACTION_ABILITY_MAP = {
  BA: "fighting",
  EA: "fighting",
  Sh: "agility",
  TE: "agility",
  TB: "agility",
  En: "agility",
  Fo: "agility",
  Gp: "strength",
  Gb: "strength",
  Es: "strength",
  Ch: "endurance",
  Do: "agility",
  Ev: "fighting",
  Bl: "strength",
  Ca: "agility",
  St: "endurance",
  Sl: "endurance",
  Ki: "endurance"
};

// Maps action codes and colors to result labels
export const ACTION_RESULT_LABELS = {
  BA: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
  EA: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  Sh: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  TE: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  TB: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
  En: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  Fo: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
  Gp: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
  Gb: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
  Es: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
  Ch: { white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
  Do: { white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
  Ev: { white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
  Bl: { white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
  Ca: { white: "Miss", green: "Catch", yellow: "Catch", red: "No" },
  St: { white: "1–10", green: "1", yellow: "Damage", red: "No" },
  Sl: { white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
  Ki: { white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
};

// The Universal Table - maps roll results to colors for each rank
// Columns: Shift-0, Feeble, Poor, Typical, Good, Excellent, Remarkable, Incredible, Amazing, Monstrous, Unearthly, Shift X, Shift Y, Shift Z, Class 1000, Class 3000, Class 5000, Beyond
export const rankRows = [
  { label: "01", colors:    ["white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white"] },
  { label: "02–03", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green"] },
  { label: "04–06", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green"] },
  { label: "07–10", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green"] },
  { label: "11–15", colors: ["white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green"] },
  { label: "16–20", colors: ["white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green"] },
  { label: "21–25", colors: ["white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow"] },
  { label: "26–30", colors: ["white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow","yellow"] },
  { label: "31–35", colors: ["white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow","yellow","yellow"] },
  { label: "36–40", colors: ["white","white","white","white","white","white","green","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow"] },
  { label: "41–45", colors: ["white","white","white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "46–50", colors: ["white","white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "51–55", colors: ["white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "56–60", colors: ["white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "61–65", colors: ["white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"   ,"red"] },
  { label: "66–70", colors: ["green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"   ,"red"  ,"red"] },
  { label: "71–75", colors: ["green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"  ,"red"   ,"red"  ,"red"] },
  { label: "76–80", colors: ["green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "81–85", colors: ["green","green","green","yellow","yellow","yellow","yellow","yellow","yellow" ,"yellow","yellow","red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "86–90", colors: ["green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "91–94", colors: ["green","yellow","yellow","yellow","yellow","yellow","yellow","red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "95–97", colors: ["yellow","yellow","yellow","yellow","yellow","red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "98–99", colors: ["yellow","yellow","yellow","red"   ,"red"   ,"red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "100", colors:   ["red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] }
];

// Power Rank Range Table - maps ranks to range in areas
export const POWER_RANGE_VALUES = {
  "Shift-0": 0, "Feeble": 0, "Poor": 1, "Typical": 2, "Good": 4,
  "Excellent": 6, "Remarkable": 8, "Incredible": 10, "Amazing": 20,
  "Monstrous": 40, "Unearthly": 60, "Shift X": 80, "Shift Y": 160,
  "Shift Z": 400,
  // Converted miles to areas (1 mile = 1760 yards/areas)
  "Class 1000": 176000,   // 100 miles
  "Class 3000": 17600000, // 10,000 miles
  "Class 5000": 1760000000, // 1,000,000 miles
  "Beyond": Infinity      // Unlimited
};

// Result rows for UI display (used in Universal Table dialog)
export const resultRows = [
  {
    result: "white",
    cells: [
      { value: "Miss", span: 5 }, { value: "Miss", span: 2 }, { value: "Miss", span: 1 },
      { value: "Miss", span: 1 }, { value: "Miss", span: 1 }, { value: "None", span: 1 },
      { value: "Autohit", span: 1 }, { value: "-6 CS", span: 1 }, { value: "Autohit", span: 1 },
      { value: "Miss", span: 1 }, { value: "1–10", span: 1 }, { value: "Gr. Slam", span: 1 },
      { value: "En. Loss", span: 1 }
    ]
  },
  {
    result: "green",
    cells: [
      { value: "Hit", span: 5 }, { value: "Hit", span: 2 }, { value: "Hit", span: 1 },
      { value: "Hit", span: 1 }, { value: "Hit", span: 1 }, { value: "-2 CS", span: 1 },
      { value: "Evasion", span: 1 }, { value: "+4 CS", span: 1 }, { value: "Catch", span: 1 },
      { value: "1", span: 1 }, { value: "1 area", span: 1 }, { value: "E/S", span: 1 }
    ]
  },
  {
    result: "yellow",
    cells: [
      { value: "Slam", span: 1 }, { value: "Stun", span: 1 }, { value: "Bullseye", span: 1 },
      { value: "Stun", span: 1 }, { value: "Bullseye", span: 1 }, { value: "Bullseye", span: 1 },
      { value: "Partial", span: 1 }, { value: "Grab", span: 1 }, { value: "Escape", span: 1 },
      { value: "Slam", span: 1 }, { value: "-4 CS", span: 1 }, { value: "+1 CS", span: 1 },
      { value: "+2 CS", span: 1 }, { value: "Catch", span: 1 }, { value: "Damage", span: 1 },
      { value: "Stagger", span: 1 }, { value: "No", span: 1 }
    ]
  },
  {
    result: "red",
    cells: [
      { value: "Stun", span: 1 }, { value: "Kill", span: 1 }, { value: "Kill", span: 1 },
      { value: "Kill", span: 1 }, { value: "Stun", span: 1 }, { value: "Kill", span: 1 },
      { value: "Hold", span: 1 }, { value: "Break", span: 1 }, { value: "Reverse", span: 1 },
      { value: "Stun", span: 1 }, { value: "-6 CS", span: 1 }, { value: "+2 CS", span: 1 },
      { value: "+1 CS", span: 1 }, { value: "No", span: 1 }, { value: "No", span: 1 },
      { value: "No", span: 1 }
    ]
  }
];

// Utility functions

/**
 * Get the index of a rank in the RANKS array
 * @param {String} rankName - The rank name (case-insensitive)
 * @returns {Number} - The index (0-based), or 0 if not found
 */
export function rankIndex(rankName) {
  const i = RANKS.findIndex(r => r.toLowerCase() === String(rankName).toLowerCase());
  return i >= 0 ? i : 0;
}

/**
 * Get the index of a rank in the RANKS_EXTENDED array
 * @param {String} rankName - The rank name
 * @returns {Number} - The index (0-based), or -1 if not found
 */
export function getRankIndex(rankName) {
  return RANKS_EXTENDED.indexOf(rankName);
}

/**
 * Convert a d100 roll value to its label in the Universal Table
 * @param {Number} value - The roll value (1-100)
 * @returns {String} - The row label (e.g., "01", "02–03", etc.)
 */
export function getRollLabelFromValue(value) {
  if (value === 1) return "01";
  if (value <= 3) return "02–03";
  if (value <= 6) return "04–06";
  if (value <= 10) return "07–10";
  if (value <= 15) return "11–15";
  if (value <= 20) return "16–20";
  if (value <= 25) return "21–25";
  if (value <= 30) return "26–30";
  if (value <= 35) return "31–35";
  if (value <= 40) return "36–40";
  if (value <= 45) return "41–45";
  if (value <= 50) return "46–50";
  if (value <= 55) return "51–55";
  if (value <= 60) return "56–60";
  if (value <= 65) return "61–65";
  if (value <= 70) return "66–70";
  if (value <= 75) return "71–75";
  if (value <= 80) return "76–80";
  if (value <= 85) return "81–85";
  if (value <= 90) return "86–90";
  if (value <= 94) return "91–94";
  if (value <= 97) return "95–97";
  if (value <= 99) return "98–99";
  return "100";
}

/**
 * Get the highest Fighting rank among selected targets
 * Used for determining intensity in multiple target attacks
 * @param {Array} targets - Array of tokens or actors
 * @returns {String} - The highest rank name
 */
export function maxDefenderFightingRankName(targets = []) {
  let bestIdx = -1, bestName = "Feeble";
  for (const t of targets) {
    const a = t?.actor ?? t;
    const rn = a?.system?.abilities?.fighting?.rank ?? a?.system?.fighting?.rank ?? "Feeble";
    const idx = rankIndex(rn);
    if (idx > bestIdx) { bestIdx = idx; bestName = rn; }
  }
  return bestName;
}

/**
 * Determine the color result needed for N attacks in multiple attack sequences
 * @param {Number} n - Number of attacks
 * @returns {String} - Color needed ("green", "yellow", or "red")
 */
export function requiredColorForAttackCount(n) {
  if (n >= 3) return "red";
  if (n === 2) return "yellow";
  return "green"; // 1 attack doesn't need the multi-attack FEAT
}

/**
 * Check if a rolled color meets the requirement for an action
 * @param {String} rolled - The color rolled
 * @param {String} needed - The color needed
 * @returns {Boolean} - True if the rolled color is sufficient
 */
export function colorMeetsRequirement(rolled, needed) {
  const order = { white: 0, green: 1, yellow: 2, red: 3, auto: 4 };
  return (order[rolled] ?? 0) >= (order[needed] ?? 0);
}

// === Compatibility exports for column-shifts.js ===
// Canonical rank order used for Column Shift math (Shift-0 .. Shift Z)
export const RANKS_ORDERED = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent",
  "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
  "Shift X","Shift Y","Shift Z"
];

// Accept common spellings/abbreviations; normalize to our canonical names above
function normalizeRankName(name) {
  const s = String(name ?? "").trim().toLowerCase()
    .replace(/\s*-\s*/g, " ")         // "Shift-X" -> "Shift X", "Shift-0" -> "Shift 0"
    .replace(/\s+/g, " ");            // collapse spaces
  const ABBR = {
    "fe":"feeble","pr":"poor","ty":"typical","gd":"good","ex":"excellent",
    "rm":"remarkable","in":"incredible","am":"amazing","mn":"monstrous","un":"unearthly",
    "sx":"shift x","sy":"shift y","sz":"shift z","s0":"shift 0","shift-0":"shift 0"
  };
  const expanded = ABBR[s] ?? s;
  // map "shift 0" -> "Shift-0" (our canonical for zero); others are "Shift X/Y/Z"
  if (expanded === "shift 0") return "Shift-0";
  return expanded.replace(/\bshift x\b/, "Shift X")
                 .replace(/\bshift y\b/, "Shift Y")
                 .replace(/\bshift z\b/, "Shift Z")
                 .replace(/\bfeeble\b/, "Feeble")
                 .replace(/\bpoor\b/, "Poor")
                 .replace(/\btypical\b/, "Typical")
                 .replace(/\bgood\b/, "Good")
                 .replace(/\bexcellent\b/, "Excellent")
                 .replace(/\bremarkable\b/, "Remarkable")
                 .replace(/\bincredible\b/, "Incredible")
                 .replace(/\bamazing\b/, "Amazing")
                 .replace(/\bmonstrous\b/, "Monstrous")
                 .replace(/\bunearthly\b/, "Unearthly");
}

// Public helpers used by column-shifts.js:
export function rankIndexOf(rankName) {
  const norm = normalizeRankName(rankName);
  const idx = RANKS_ORDERED.indexOf(norm);
  return idx >= 0 ? idx : 0; // default to Shift-0
}

export function rankNameAt(index) {
  const i = Math.max(0, Math.min(RANKS_ORDERED.length - 1, index | 0));
  return RANKS_ORDERED[i];
}

/**
 * Roll on the Universal Table to determine color result
 * @param {String} rank - The rank name (e.g. "Excellent", "Shift X")
 * @param {Number} roll - The d100 roll result (1-100)
 * @returns {String} - The color result ("white", "green", "yellow", or "red")
 */
export function rollUniversalTable(rank, roll) {
  console.log("🎲 rollUniversalTable called with rank:", rank, "roll:", roll);
  
  const tableRanks = {
    "Shift-0": [66, 95, 100],
    "Feeble": [61, 91, 100],
    "Poor": [56, 86, 100],
    "Typical": [51, 81, 98],
    "Good": [46, 75, 98],
    "Excellent": [41, 71, 95],
    "Remarkable": [36, 66, 95],
    "Incredible": [31, 61, 91],
    "Amazing": [26, 56, 91],
    "Monstrous": [21, 51, 86],
    "Unearthly": [16, 46, 86],
    "Shift X": [11, 41, 81],
    "Shift Y": [7, 41, 81],
    "Shift Z": [4, 36, 75],
    "Class 1000": [2, 36, 75],
    "Class 3000": [2, 31, 71],
    "Class 5000": [2, 26, 66],
    "Beyond": [2, 21, 61],
    
    // Add backward compatibility for old formats
    "Shift-X": [11, 41, 81],
    "Shift-Y": [7, 41, 81],
    "Shift-Z": [4, 36, 75],
    "1000": [2, 36, 75],
    "3000": [2, 31, 71],
    "5000": [2, 26, 66]
  };

  // Normalize the rank name
  let normalizedRank = rank;
  
  // Handle common variations
  if (rank === "Class1000") normalizedRank = "Class 1000";
  if (rank === "Class3000") normalizedRank = "Class 3000";
  if (rank === "Class5000") normalizedRank = "Class 5000";
  
  console.log("🎲 Normalized rank:", normalizedRank);
  
  const thresholds = tableRanks[normalizedRank];
  if (!thresholds) {
    console.warn(`Rank ${rank} not found in universal table. Available ranks:`, Object.keys(tableRanks));
    ui.notifications.error(`Rank ${rank} not found.`);
    return "white";
  }

  console.log("🎲 Thresholds for", normalizedRank, ":", thresholds);
  
  const [green, yellow, red] = thresholds;
  let result;
  
  if (roll <= green) {
      result = "white";
      console.log("🎲 Result: WHITE (roll", roll, "<=", green, ")");
  } else if (roll <= yellow) {
      result = "green";
      console.log("🎲 Result: GREEN (roll", roll, "<=", yellow, ")");
  } else if (roll <= red) {
      result = "yellow";
      console.log("🎲 Result: YELLOW (roll", roll, "<=", red, ")");
  } else {
      result = "red";
      console.log("🎲 Result: RED (roll", roll, ">", red, ")");
  }
  
  return result;
}
