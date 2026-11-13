// power-sheet-view.mjs v1.0.0 - 2026-11-13
// v1.0.0: Pure view model for the tabbed power sheet (Details-tab type
//         blocks, Defense kind, rank-derived read-only values).
import { RANK_VALUES, RANKS_ORDERED, POWER_RANGE, shiftRank } from "./rules/rules-reference.js";

export const GROWTH_TABLE = {
  "Feeble": ["8 feet", "+1CS"], "Poor": ["10 feet", "+1CS"], "Typical": ["12 feet", "+1CS"],
  "Good": ["14 feet", "+1CS"], "Excellent": ["16 feet", "+1CS"], "Remarkable": ["18 feet", "+2CS"],
  "Incredible": ["20 feet", "+2CS"], "Amazing": ["22 feet", "+2CS"], "Monstrous": ["25 feet", "+3CS"],
  "Unearthly": ["30 feet", "+3CS"], "Shift-X": ["40 feet", "+3CS"], "Shift-Y": ["50 feet", "+3CS"],
  "Shift-Z": ["100 feet", "+3CS"]
};

export const SHRINK_TABLE = {
  "Feeble": ["48 inches (1/2)", "0"], "Poor": ["24 inches (1/4)", "0"], "Typical": ["12 inches (1/8)", "0"],
  "Good": ["6 inches (1/16)", "1CS"], "Excellent": ["3 inches (1/32)", "1CS"], "Remarkable": ["1 inch (1/100)", "2CS"],
  "Incredible": ["1/2 inch (1/200)", "2CS"], "Amazing": ["1/4 inch (1/400)", "2CS"],
  "Monstrous": ["1/10 inch (1/1000)", "3CS"], "Unearthly": ["1/100 inch (1/10000)", "3CS"]
};

export const TYPE_MIN_RANK = {
  "Resistance to Toxins": "Endurance +1CS",
  "Resistance to Disease": "Endurance +1CS",
  "Resistance to Emotion Attacks": "Intuition +1CS",
  "Resistance to Mental Attacks": "Psyche +1CS",
  "Leaping": "Strength +1CS",
  "Lightning Speed": "Endurance +1CS",
  "Solar Regeneration": "Endurance +1CS",
  "Extra Attacks": "Fighting +1CS",
  "Psi-Screen": "Psyche +1CS",
  "Combat Sense": "Intuition"
};

const MIN_RANK_KEYS = {
  "endurance+1": "Endurance +1CS", "intuition+1": "Intuition +1CS", "psyche+1": "Psyche +1CS"
};

export const TYPES_REQUIRING_LIMITATION = ["Probability Manipulation", "Precognition", "Time Control"];

export const SECTION_LABELS = {
  detection: "Detection / Senses",
  abilitySubstitution: "Ability Substitution",
  movement: "Movement",
  control: "Control",
  transformation: "Transformation",
  healing: "Healing / Absorption",
  special: "Special Strength",
  bodyparts: "Extra Body Parts and Attacks"
};

const TYPE_SECTIONS = {
  "Claws": ["special"], "Telekinesis": ["special"], "Ensnaring Missile": ["special"],
  "Extra Body Parts": ["bodyparts"], "Extra Attacks": ["bodyparts"]
};

export function typeSections(type) {
  return TYPE_SECTIONS[type] || [];
}

export function defenseKind(sys) {
  if (sys.isBodyArmor) return "bodyArmor";
  if (sys.isForceField) return "forceField";
  if (sys.isEnergyReflection) return "reflection";
  if (sys.isResistance) {
    return (sys.resistanceEffect === "invulnerability" || sys.resistanceIsInvulnerability) ? "invulnerability" : "resistance";
  }
  return "";
}

export function forceFieldRows(rank, value, maxRows = 10) {
  const v = Number(value) || RANK_VALUES[rank] || 0;
  const coverage = Math.max(1, Math.floor(v / 10));
  const rows = [];
  const floor = RANKS_ORDERED.indexOf("Feeble");
  for (let n = 1; n <= Math.min(coverage, maxRows); n++) {
    const r = n === 1 ? rank : shiftRank(rank, -(n - 1));
    if (RANKS_ORDERED.indexOf(r) < floor) break;
    const rv = n === 1 ? v : (RANK_VALUES[r] ?? 0);
    rows.push({ areas: n, energy: `${r} (${rv})`, physical: Math.max(0, rv - 10) });
  }
  return { coverage, rows, truncated: coverage > rows.length };
}

function numberOptions(values, current, label) {
  const list = values.includes(current) ? values : [...values, current];
  return list.map(v => ({ value: v, label: label(v), selected: v === current }));
}

export function buildPowerSheetView(sys = {}, flags = {}) {
  const type = sys.type || "";
  const rank = sys.rank || "";
  const value = Number(sys.value) || RANK_VALUES[rank] || 0;
  const is = t => type === t;
  const kind = defenseKind(sys);
  const growth = GROWTH_TABLE[rank];
  const shrink = SHRINK_TABLE[rank];
  const isDarkforce = is("Darkforce Generation") || is("Darkforce Manipulation");
  const isFFG = is("Force Field Generation");
  const isEmotion = is("Emotion Control") || sys.mental?.emotionControl === true;
  const blocks = {
    isFFG,
    isTeleport: is("Teleportation"),
    isGrowth: is("Growth"),
    isShrinking: is("Shrinking"),
    isDarkforce,
    isLightningSpeed: is("Lightning Speed"),
    isProbability: is("Probability Manipulation"),
    isBodyTransform: is("Body Transformation"),
    isBodyArmorType: is("Body Armor"),
    isEmotion
  };
  const hasTypeBlock = Object.values(blocks).some(Boolean);
  const area = Number(sys.area) || 0;
  const multi = Number(sys.save?.multiTargetCS) || 0;
  const limitationRequired = sys.limitationRequired === true || TYPES_REQUIRING_LIMITATION.includes(type);

  return {
    ...blocks,
    hasTypeBlock,
    typeLabel: type || "This power",
    kind,
    kindIs: {
      bodyArmor: kind === "bodyArmor", forceField: kind === "forceField", resistance: kind === "resistance",
      invulnerability: kind === "invulnerability", reflection: kind === "reflection", none: kind === ""
    },
    isHybridDefense: !!(sys.isBodyArmor && sys.isForceField),
    showFieldInDefense: !isFFG,
    ff: isFFG || kind === "forceField" ? forceFieldRows(rank, value) : null,
    growthHeight: growth ? growth[0] : "Not on the table",
    growthToHit: growth ? growth[1] : "None",
    shrinkHeight: shrink ? shrink[0] : (value > 100 ? "Microverse" : "Normal size"),
    shrinkShift: shrink ? shrink[1] : (value > 100 ? "Special" : "0"),
    darknessIntensity: rank ? `${rank} (${value})` : "",
    calculatedRange: POWER_RANGE[rank] || "",
    minRank: TYPE_MIN_RANK[type] || MIN_RANK_KEYS[sys.resistanceMinRank] || "None for this type",
    limitationRequired: limitationRequired ? "Yes" : "No",
    limitationText: sys.limitations || sys.limitationDetail || "",
    rankBonus: Number(sys.limitation?.rankBonus) || 0,
    showMagic: sys.source === "mystical" || sys.isMagic === true,
    showAbilitySubSection: !blocks.isGrowth,
    areaOptions: numberOptions([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], area,
      v => v === 0 ? "Single target" : v === 1 ? "All in one area" : `${v} areas`),
    multiTargetOptions: numberOptions([0, -1, -2, -3], multi, v => v === 0 ? "Same Intensity" : `${v}CS`),
    hasBonusPowers: Array.isArray(sys.bonusPowers) && sys.bonusPowers.length > 0,
    hasBodyParts: Array.isArray(sys.extraBodyParts) && sys.extraBodyParts.length > 0,
    isBonus: sys.isBonus === true || flags.isBonusPower === true
  };
}
