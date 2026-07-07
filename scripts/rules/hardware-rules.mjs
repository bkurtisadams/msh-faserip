// hardware-rules.mjs v1.0.0 - 2026-07-07
// v1.0.0: Slice 1 — pure Hardware chapter rules (Advanced Set pp. 65-70).
//         Effective cost (highest applicable rank, +2CS equal / +1CS one
//         below / 2+ below free, situational CS modifiers, Beyond-1980s-tech
//         Monstrous applicable rank), build time in days = cost rank number
//         with assistant / round-the-clock reductions, success-FEAT CS
//         modifiers with RAW caps, color degradation when cost > Reason,
//         kit-bash Karma cost, weapon range→rank table.
//         Pure module — no Foundry globals. Self-tests run via:
//           node scripts/rules/hardware-rules.mjs
// Source: "Hardware: Building, Modifying, and Alien Technology".

import {
  RANK_VALUES, normalizeRank, shiftRank, rankIndex
} from "./rules-reference.js";

/* ── Item classes ─────────────────────────────────────────────────────────── */

export const HW_ITEM_CLASSES = {
  weapon:    "Weapon",
  vehicle:   "Vehicle",
  powersuit: "Power Suit",
  robot:     "Robot / Construct",
  other:     "Other Device"
};

/* ── Effective-cost CS modifiers ──────────────────────────────────────────────
   beyondTech is NOT here — per RAW it adds a Monstrous applicable rank,
   not a column shift. Handled inside computeEffectiveCost().              */

export const HW_COST_MODIFIERS = {
  // General (any item)
  invisible:          { cs: +2, label: "Cannot normally be seen",     classes: null },
  pocketSized:        { cs: +1, label: "Pocket-sized",                classes: null },
  portable:           { cs: +1, label: "Portable",                    classes: null },
  multiArea:          { cs: +1, label: "Occupies more than one area", classes: null },
  // Weapons
  meleeTouch:         { cs: -1, label: "Inflicts damage on touch only (melee)", classes: ["weapon"] },
  // Vehicles
  noProtection:       { cs: -1, label: "Craft offers no Protection",  classes: ["vehicle"] },
  gev:                { cs: +1, label: "Craft is a GEV",              classes: ["vehicle"] },
  // Robots
  humanoid:           { cs: -1, label: "Humanoid form",               classes: ["robot"] },
  imitatesIndividual: { cs: +1, label: "Imitates a specific individual", classes: ["robot"] }
};

/* ── Effective cost ───────────────────────────────────────────────────────── */

/**
 * Compute effective cost per RAW.
 * @param {object} hw  hardware sub-schema: { applicableRanks:[{label,rank}],
 *                     modifiers:{...bool}, customCS:number }
 * @returns {{valid:boolean, costRank:string, baseRank:string, cs:number,
 *            steps:string[]}}
 */
export function computeEffectiveCost(hw = {}) {
  const ranks = [];
  for (const r of hw.applicableRanks ?? []) {
    if (!r?.rank) continue;
    const n = normalizeRank(r.rank);
    if (RANK_VALUES[n] === undefined) continue;
    ranks.push({ label: r.label || "rank", rank: n });
  }
  if (hw.modifiers?.beyondTech) {
    ranks.push({ label: "Not reproducible by 1980s technology", rank: "Monstrous" });
  }
  if (!ranks.length) {
    return { valid: false, costRank: "", baseRank: "", cs: 0,
             steps: ["No applicable ranks — add at least one."] };
  }

  // Highest applicable rank is the base.
  let base = ranks[0];
  for (const r of ranks) if (rankIndex(r.rank) > rankIndex(base.rank)) base = r;
  const bi = rankIndex(base.rank);

  let cs = 0;
  const steps = [`Base ${base.rank} (${base.label})`];
  for (const r of ranks) {
    if (r === base) continue;
    const d = bi - rankIndex(r.rank);
    if (d === 0)      { cs += 2; steps.push(`+2CS ${r.label} (${r.rank}, equal to base)`); }
    else if (d === 1) { cs += 1; steps.push(`+1CS ${r.label} (${r.rank}, one below base)`); }
    else              {          steps.push(`+0CS ${r.label} (${r.rank}, 2+ below base)`); }
  }

  for (const [key, def] of Object.entries(HW_COST_MODIFIERS)) {
    if (!hw.modifiers?.[key]) continue;
    cs += def.cs;
    steps.push(`${def.cs > 0 ? "+" : ""}${def.cs}CS ${def.label}`);
  }

  const custom = Number(hw.customCS || 0);
  if (custom) { cs += custom; steps.push(`${custom > 0 ? "+" : ""}${custom}CS custom shift`); }

  const costRank = shiftRank(base.rank, cs);
  steps.push(`Effective Cost: ${costRank}`);
  return { valid: true, costRank, baseRank: base.rank, cs, steps };
}

/* ── Time ─────────────────────────────────────────────────────────────────── */

/** Days to build = rank number of the effective cost (Typical → 6 days). */
export function buildDays(costRank) {
  return RANK_VALUES[normalizeRank(costRank)] ?? 0;
}

/**
 * Working-condition reductions.
 * assistant: "none" | "aid" (÷2) | "brilliant" (Reason within one rank, ÷4)
 * roundTheClock halves again (and imposes -1CS on the success FEAT — see
 * successFeatCS; that flag is the caller's to pass through).
 */
export function adjustedDays(days, { assistant = "none", roundTheClock = false } = {}) {
  let f = 1;
  if (assistant === "aid") f = 2;
  else if (assistant === "brilliant") f = 4;
  if (roundTheClock) f *= 2;
  return days / f;
}

/* ── Success FEAT ─────────────────────────────────────────────────────────── */

/**
 * Column shifts on the invention success Reason FEAT, RAW caps applied:
 * +1CS assistant (no less than one rank lower, max +1)
 * +1CS per applicable talent (max +3CS)
 * -1CS if rushed (round-the-clock)
 * -1CS per special requirement (max -3CS)
 * +1CS rebuilding from failed experiment / kit-bash salvage
 */
export function successFeatCS({ assistant = false, talents = 0, rushed = false,
                                specialReqs = 0, rebuild = false } = {}) {
  let cs = 0;
  if (assistant) cs += 1;
  cs += Math.min(Math.max(Number(talents) || 0, 0), 3);
  if (rushed) cs -= 1;
  cs -= Math.min(Math.max(Number(specialReqs) || 0, 0), 3);
  if (rebuild) cs += 1;
  return cs;
}

/** If effective cost exceeds the inventor's Reason, the rolled color reads
 *  one worse: red→yellow→green→white. */
export function degradeColor(color) {
  const map = { red: "yellow", yellow: "green", green: "white", white: "white" };
  return map[String(color).toLowerCase()] ?? color;
}

/** True when the success roll must be read one color worse. */
export function costExceedsReason(costRank, reasonRank) {
  return rankIndex(costRank) > rankIndex(reasonRank);
}

/* ── Kit-bashing ──────────────────────────────────────────────────────────── */

/** 10 Karma converts one day of work into one round. */
export function kitbashKarma(daysRemaining) {
  return Math.ceil(Math.max(0, Number(daysRemaining) || 0) * 10);
}

/* ── Weapon range → rank ──────────────────────────────────────────────────── */

const RANGE_TABLE = [
  ["Poor", 1], ["Typical", 2], ["Good", 4], ["Excellent", 6],
  ["Remarkable", 8], ["Incredible", 11], ["Amazing", 20], ["Monstrous", 40],
  ["Unearthly", 60], ["Shift-X", 80], ["Shift-Y", 160], ["Shift-Z", 400]
];

/** Range rank from range in areas. Touch/0 → null (no applicable range rank). */
export function rangeRankForAreas(areas) {
  const a = Number(areas) || 0;
  if (a <= 0) return null;
  for (const [rank, max] of RANGE_TABLE) if (a <= max) return rank;
  return "Class 1000";
}

/* ── Default sub-schema ───────────────────────────────────────────────────── */

/** Fresh hardware block for a new invention (mirrors template.json). */
export function defaultHardware() {
  return {
    enabled: true,
    status: "design",
    itemClass: "other",
    applicableRanks: [{ label: "Material Strength", rank: "Typical" }],
    modifiers: {
      invisible: false, pocketSized: false, portable: false, multiArea: false,
      meleeTouch: false, noProtection: false, gev: false,
      humanoid: false, imitatesIndividual: false, beyondTech: false
    },
    customCS: 0,
    specialReqCount: 0,
    effectiveCost: "Typical",
    derivation: "",
    time: { daysRequired: 6, daysElapsed: 0, assistant: "none", roundTheClock: false },
    notes: ""
  };
}

/* ── Self-tests (node scripts/rules/hardware-rules.mjs) ───────────────────── */

const isMain = typeof process !== "undefined" &&
  process?.argv?.[1]?.replace(/\\/g, "/").endsWith("hardware-rules.mjs");

if (isMain) {
  let pass = 0, fail = 0;
  const eq = (name, got, want) => {
    if (got === want) { pass++; }
    else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  };
  const cost = (ranks, mods = {}, customCS = 0) => computeEffectiveCost({
    applicableRanks: ranks.map(([label, rank]) => ({ label, rank })),
    modifiers: mods, customCS
  }).costRank;

  // RAW p.66 — machine gun: Incredible +1CS (Remarkable damage) = Amazing
  eq("machine gun", cost([["Range", "Incredible"], ["Damage", "Remarkable"], ["Material", "Good"]]), "Amazing");
  // RAW p.66 — laser rifle: Excellent +1CS (Good range) = Remarkable
  eq("laser rifle", cost([["Damage", "Excellent"], ["Range", "Good"], ["Material", "Typical"]]), "Remarkable");
  // RAW p.66 — knife: Excellent material +1CS (Good damage) -1CS melee = Excellent
  eq("knife", cost([["Material", "Excellent"], ["Damage", "Good"]], { meleeTouch: true }), "Excellent");
  // RAW p.66 — sedan: Good +2CS (other Good) +1CS (Typical Protection) = Incredible
  eq("sedan", cost([["Speed", "Good"], ["Body", "Good"], ["Control", "Poor"], ["Protection", "Typical"]]), "Incredible");
  // RAW p.66 — skymobile: Incredible -1CS (no Protection; Excellents free) = Remarkable
  eq("skymobile", cost([["Speed", "Incredible"], ["Control", "Excellent"], ["Body", "Excellent"]], { noProtection: true }), "Remarkable");
  // RAW p.67 — power suit 1: Amazing +1CS (Incredible) = Monstrous (Gd material, Ex BA free)
  eq("power suit 1", cost([["Strength", "Amazing"], ["Endurance", "Incredible"], ["Body Armor", "Excellent"], ["Material", "Good"]]), "Monstrous");
  // RAW p.67 — power suit 2: Remarkable +2CS +1CS +1CS = Unearthly
  eq("power suit 2", cost([["Strength", "Remarkable"], ["Repulsors", "Remarkable"], ["Material", "Excellent"], ["Flight", "Excellent"]]), "Unearthly");
  // RAW p.67 — shift-variant suit: Excellent +1CS (Good flight) +3CS (ability
  // shifts). RAW text says "Amazing" but Ex+4CS is Monstrous on the ladder;
  // the example's arithmetic is off by one (its sibling example computes
  // Rm+4CS = Unearthly correctly). Rule-as-written wins: Monstrous.
  eq("shift suit", cost([["Material", "Excellent"], ["Flight", "Good"]], {}, 3), "Monstrous");
  // RAW p.67 — sparring robot: Monstrous (Incredibles are 2 below) -1CS humanoid = Amazing
  eq("sparring robot", cost([["Strength", "Monstrous"], ["Endurance", "Incredible"], ["Material", "Incredible"], ["Fighting", "Excellent"], ["Agility", "Excellent"], ["Reason", "Typical"]], { humanoid: true }), "Amazing");
  // RAW p.67 — Doug Ramsey android: Excellent +1CS (Gd material) +1CS (Gd Reason) +1CS duplicate = Amazing
  eq("doug android", cost([["Endurance", "Excellent"], ["Material", "Good"], ["Reason", "Good"], ["Agility", "Typical"], ["Strength", "Typical"], ["Fighting", "Poor"]], { imitatesIndividual: true }), "Amazing");
  // RAW p.68 — dimension scanner: beyondTech Monstrous +1CS (Amazing) = Unearthly (Ex material free)
  eq("dimension scanner", cost([["Dimensional punch", "Amazing"], ["Material", "Excellent"]], { beyondTech: true }), "Unearthly");
  // No ranks → invalid
  eq("empty invalid", computeEffectiveCost({ applicableRanks: [] }).valid, false);

  // Time
  eq("days Typical", buildDays("Typical"), 6);
  eq("days Unearthly", buildDays("Unearthly"), 100);
  // RAW p.68 — Excellent (20 days), brilliant assistant + round the clock = 2.5
  eq("time reductions", adjustedDays(20, { assistant: "brilliant", roundTheClock: true }), 2.5);
  eq("time aid", adjustedDays(20, { assistant: "aid" }), 10);

  // Success FEAT CS
  eq("success caps", successFeatCS({ assistant: true, talents: 5, rushed: true, specialReqs: 5, rebuild: true }), 1 + 3 - 1 - 3 + 1);
  eq("success plain", successFeatCS({}), 0);

  // Color degradation
  eq("degrade red", degradeColor("red"), "yellow");
  eq("degrade green", degradeColor("green"), "white");
  eq("cost>reason", costExceedsReason("Amazing", "Remarkable"), true);
  eq("cost<=reason", costExceedsReason("Remarkable", "Remarkable"), false);

  // Kit-bash — RAW p.69: Monstrous (75) effective cost = 750 Karma
  eq("kitbash 75", kitbashKarma(75), 750);
  eq("kitbash partial", kitbashKarma(5), 50);

  // Range table
  eq("range 4", rangeRankForAreas(4), "Good");
  eq("range 10", rangeRankForAreas(10), "Incredible");
  eq("range 40", rangeRankForAreas(40), "Monstrous");
  eq("range touch", rangeRankForAreas(0), null);

  console.log(`hardware-rules self-tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
