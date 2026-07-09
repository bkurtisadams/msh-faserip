// hardware-rules.mjs v1.2.1 - 2026-07-08
// v1.2.1: HW_CLASS_RANKS standard applicable-rank templates per item class
//         and seedApplicableRanks() to append missing standard rows when the
//         class changes (dedup by case-insensitive label match).
// v1.2.0: Slice 3 — computeCost() mode dispatcher; computeModificationCost()
//         (ability boosts one rank at a time at the new rank's cost, easy
//         bolt-on capability at Typical, device-altering capability at the
//         new power's rank with Good floor / Monstrous floor for
//         beyond-1980s tech); kitbashRounds(); repairHours(),
//         centerRepairAuto(), effectiveRepairReason() for repair centers;
//         requiredColorVsIntensity() and colorMeets() for the chapter's
//         Reason-FEAT tools (alien tech, borrowed devices, computers).
//         defaultHardware() gains mode / mod / kitBashed / salvaged.
// v1.1.0: Slice 2 — defaultHardware() gains resourceFeat / successFeat /
//         startedGameDate blocks; fundingResourceRank() for solo / combined
//         (two heroes within one rank, effective +1CS) / Contacts funding.
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

/* ── Standard applicable ranks per item class ─────────────────────────────── */

export const HW_CLASS_RANKS = {
  weapon:    ["Damage / Intensity", "Range", "Material Strength"],
  vehicle:   ["Control", "Speed", "Body", "Protection"],
  powersuit: ["Material Strength / Body Armor"],
  robot:     ["Fighting", "Agility", "Strength", "Endurance", "Reason", "Material Strength"],
  other:     ["Material Strength"]
};

/** Append the class's standard rank rows (at Typical) not already present,
 *  matching labels case-insensitively so a user's "Damage" row satisfies the
 *  "Damage / Intensity" template. */
export function seedApplicableRanks(itemClass, existing = []) {
  const rows = (existing ?? []).filter(r => r && (r.label || r.rank));
  const has = (tpl) => rows.some(r => {
    const a = String(r.label || "").toLowerCase();
    if (!a) return false;
    return tpl.toLowerCase().split("/").some(part => {
      const b = part.trim();
      return b && (a.includes(b) || b.includes(a));
    });
  });
  for (const tpl of HW_CLASS_RANKS[itemClass] ?? []) {
    if (!has(tpl)) rows.push({ label: tpl, rank: "Typical" });
  }
  return rows;
}

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

/* ── Modifications (RAW p.69) ─────────────────────────────────────────────── */

export const HW_MOD_KINDS = {
  abilityBoost:      "Improve an existing rank (one rank at a time)",
  addCapabilityEasy: "Add capability, simple installation (e.g. artillery on a tank)",
  addCapabilityHard: "Add capability, device must be altered (e.g. flight on a car)"
};

/** A modification may only raise a rank one step at a time. */
export function validateModStep(fromRank, toRank) {
  return normalizeRank(toRank) === shiftRank(fromRank, 1);
}

/**
 * Effective cost of a modification.
 * abilityBoost      — cost = the NEW rank, one rank step enforced.
 * addCapabilityEasy — Typical (installation only).
 * addCapabilityHard — the new power's rank, never less than Good; never less
 *                     than Monstrous if not reproducible by 1980s tech
 *                     (hw.modifiers.beyondTech).
 */
export function computeModificationCost(hw = {}) {
  const m = hw.mod ?? {};
  const target = m.target ? ` on ${m.target}` : "";
  if (m.kind === "abilityBoost") {
    const from = normalizeRank(m.fromRank || "Typical");
    const to = normalizeRank(m.toRank || shiftRank(from, 1));
    if (!validateModStep(from, to)) {
      return { valid: false, costRank: "", steps:
        [`Invalid step ${from} \u2192 ${to}: modifications raise ranks one at a time.`] };
    }
    return { valid: true, costRank: to, steps: [
      `Modification${target}: ${from} \u2192 ${to}`,
      `Effective Cost: ${to} (cost of the new rank)`
    ] };
  }
  if (m.kind === "addCapabilityEasy") {
    return { valid: true, costRank: "Typical", steps: [
      `Modification${target}: add capability, simple installation`,
      "Effective Cost: Typical (installation only)"
    ] };
  }
  if (m.kind === "addCapabilityHard") {
    const power = normalizeRank(m.newPowerRank || "Good");
    const floor = hw.modifiers?.beyondTech ? "Monstrous" : "Good";
    const costRank = rankIndex(power) >= rankIndex(floor) ? power : floor;
    const steps = [`Modification${target}: add ${power}-rank capability, device altered`];
    if (costRank !== power)
      steps.push(hw.modifiers?.beyondTech
        ? "Raised to Monstrous floor (not reproducible by 1980s technology)"
        : "Raised to Good floor (minimum for device-altering capability)");
    steps.push(`Effective Cost: ${costRank}`);
    return { valid: true, costRank, steps };
  }
  return { valid: false, costRank: "", steps: ["Choose a modification kind."] };
}

/** Cost dispatcher: invention (default) vs modification. */
export function computeCost(hw = {}) {
  return hw.mode === "modification" ? computeModificationCost(hw) : computeEffectiveCost(hw);
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

/** Each kit-bashed day of work takes one round at the bench. */
export function kitbashRounds(daysRemaining) {
  return Math.ceil(Math.max(0, Number(daysRemaining) || 0));
}

/* ── Repairs (RAW p.70) ───────────────────────────────────────────────────── */

/** Repair-center time to restore a device to targetRank: the rank number in
 *  hours (restoring to Excellent = 20 hours). */
export function repairHours(targetRank) {
  return RANK_VALUES[normalizeRank(targetRank)] ?? 0;
}

/** Repairs are automatic when the center's rank exceeds the rank being
 *  restored; otherwise a Reason FEAT is needed. */
export function centerRepairAuto(centerRank, targetRank) {
  return rankIndex(centerRank) > rankIndex(targetRank);
}

/** FEAT uses the repair tech's Reason or the center's value, whichever is
 *  lower. */
export function effectiveRepairReason(techReason, centerRank) {
  return rankIndex(techReason) <= rankIndex(centerRank)
    ? normalizeRank(techReason) : normalizeRank(centerRank);
}

/* ── Intensity FEATs ──────────────────────────────────────────────────────── */

/** Standard intensity FEAT: ability at/above intensity needs green; 1-2
 *  ranks above the ability needs yellow / red; 3+ above is impossible. */
export function requiredColorVsIntensity(abilityRank, intensityRank) {
  const d = rankIndex(intensityRank) - rankIndex(abilityRank);
  if (d <= 0) return "green";
  if (d === 1) return "yellow";
  if (d === 2) return "red";
  return "impossible";
}

/** Does a rolled color meet the required color? (white<green<yellow<red) */
export function colorMeets(rolled, required) {
  const order = { white: 0, green: 1, yellow: 2, red: 3 };
  if (required === "impossible") return false;
  return (order[String(rolled).toLowerCase()] ?? -1) >= (order[String(required).toLowerCase()] ?? 4);
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

/* ── Resource FEAT funding ────────────────────────────────────────────────── */

/**
 * Effective Resources rank for the invention Resource FEAT.
 * solo     — the inventor's own Resources.
 * combined — two characters with Resources within one rank make a single
 *            FEAT; treated as one rank above the inventor's Resources
 *            (RAW example: two Amazing fund a Monstrous project).
 * contacts — the backing organization's Resources rank is used directly.
 *            Persuading them (Popularity FEATs, strings attached) is the
 *            Judge's table, not this function's.
 */
export function fundingResourceRank(baseRank, funding = "solo", contactsRank = "") {
  if (funding === "combined") return shiftRank(baseRank, 1);
  if (funding === "contacts") return normalizeRank(contactsRank || baseRank);
  return normalizeRank(baseRank);
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
    mode: "invention",
    mod: { kind: "abilityBoost", target: "", fromRank: "Typical", toRank: "Good", newPowerRank: "Good" },
    kitBashed: false,
    salvaged: false,
    resourceFeat: { made: false, funding: "solo", gameDate: "" },
    successFeat: { rolled: false, color: "", talentsCS: 0, rebuild: false,
                   gameDate: "", fineTuneDays: 0, failTurns: 0 },
    startedGameDate: "",
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

  // Funding — RAW p.68: two Amazing-Resource heroes fund a Monstrous project
  eq("funding solo", fundingResourceRank("Amazing", "solo"), "Amazing");
  eq("funding combined", fundingResourceRank("Amazing", "combined"), "Monstrous");
  eq("funding contacts", fundingResourceRank("Good", "contacts", "Monstrous"), "Monstrous");
  eq("default schema has feat blocks", defaultHardware().resourceFeat.made === false && defaultHardware().successFeat.rolled === false, true);

  // Class rank seeding
  eq("seed weapon count", seedApplicableRanks("weapon", []).length, 3);
  eq("seed keeps existing count", seedApplicableRanks("weapon", [{label:"Damage", rank:"Excellent"}]).length, 3);
  eq("seed no dup material", seedApplicableRanks("weapon", [{label:"Material Strength", rank:"Typical"}]).filter(r=>r.label.toLowerCase().includes("material")).length, 1);
  eq("seed vehicle order", seedApplicableRanks("vehicle", []).map(r=>r.label).join(","), "Control,Speed,Body,Protection");
  eq("seed preserves rank", seedApplicableRanks("weapon", [{label:"Damage", rank:"Excellent"}])[0].rank, "Excellent");

  // Modifications — RAW p.69
  const modc = (mod, beyondTech=false) => computeModificationCost({ mod, modifiers:{beyondTech} });
  eq("mod boost cost", modc({kind:"abilityBoost", fromRank:"Good", toRank:"Excellent"}).costRank, "Excellent");
  eq("mod boost step enforced", modc({kind:"abilityBoost", fromRank:"Good", toRank:"Remarkable"}).valid, false);
  eq("mod step validator", validateModStep("Excellent","Remarkable"), true);
  eq("mod easy Typical", modc({kind:"addCapabilityEasy"}).costRank, "Typical");
  eq("mod hard floor Good", modc({kind:"addCapabilityHard", newPowerRank:"Poor"}).costRank, "Good");
  eq("mod hard power rank", modc({kind:"addCapabilityHard", newPowerRank:"Remarkable"}).costRank, "Remarkable");
  eq("mod hard beyondTech floor", modc({kind:"addCapabilityHard", newPowerRank:"Good"}, true).costRank, "Monstrous");
  eq("computeCost dispatch", computeCost({mode:"modification", mod:{kind:"addCapabilityEasy"}}).costRank, "Typical");

  // Kit-bash rounds — RAW p.69: 75-day project completes in 75 turns
  eq("kitbash rounds", kitbashRounds(75), 75);
  eq("kitbash rounds partial", kitbashRounds(2.5), 3);

  // Repairs — RAW p.70 example: restore to Excellent 20 hours, to Remarkable 30
  eq("repair hours Ex", repairHours("Excellent"), 20);
  eq("repair hours Rm", repairHours("Remarkable"), 30);
  eq("repair auto (In center, Ex target)", centerRepairAuto("Incredible","Excellent"), true);
  eq("repair auto (In center, Rm target)", centerRepairAuto("Incredible","Remarkable"), true);
  eq("repair not auto (Gd center, Ex target)", centerRepairAuto("Good","Excellent"), false);
  eq("repair reason lower of", effectiveRepairReason("Remarkable","Incredible"), "Remarkable");
  eq("repair reason capped by center", effectiveRepairReason("Remarkable","Good"), "Good");

  // Intensity FEATs
  eq("intensity green", requiredColorVsIntensity("Remarkable","Remarkable"), "green");
  eq("intensity yellow", requiredColorVsIntensity("Good","Excellent"), "yellow");
  eq("intensity red", requiredColorVsIntensity("Good","Remarkable"), "red");
  eq("intensity impossible", requiredColorVsIntensity("Typical","Incredible"), "impossible");
  eq("colorMeets yellow>=green", colorMeets("yellow","green"), true);
  eq("colorMeets green<red", colorMeets("green","red"), false);

  // Range table
  eq("range 4", rangeRankForAreas(4), "Good");
  eq("range 10", rangeRankForAreas(10), "Incredible");
  eq("range 40", rangeRankForAreas(40), "Monstrous");
  eq("range touch", rangeRankForAreas(0), null);

  console.log(`hardware-rules self-tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
