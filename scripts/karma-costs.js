// scripts/karma-costs.js v1.0.0 - 2026-09-02
// Kernel slice 6b. Karma spend costs from faserip-karma. Pure — no Foundry
// globals — so the node proof (scripts/dev/kernel-karma-diff.mjs) can import it.

import {
  ADVANCEMENT, advancementOptions, powerAdditionCost, TALENT_ADDITION_COST,
  contactAdditionCost, MIN_KARMA_DECLARATION, EFFECT_REDUCTION_COST, POWER_STUNT_COST,
} from "./lib/faserip-rules/faserip-karma.js";

export const SPEND_TYPE_KIND = {
  "Ability Advancement": "ability",
  "Power Advancement": "power",
  "Resource Advancement": "resource",
  "Popularity Advancement": "popularity",
};

export const TALENT_SOURCES = [
  ["fromNPC", "Taught by an NPC"],
  ["fromPC", "Taught by a player character"],
  ["studentFromNPC", "Student, taught by an NPC"],
  ["studentFromPC", "Student, taught by a player character"],
];

// Raise a rank number. mode "step": `points` one at a time, crossing a rank
// boundary with the crest fee when the top of the range is reached.
// mode "crest": one purchase from the current number straight to the next
// rank's minimum (kernel book anchor: Amazing(61) -> Monstrous(63) =
// 20x61 + 500 = 1720). Returns { total, lines, newValue, points }.
export function advancementCost({ kind, current, points, mode = "step", rankNameOf = (n) => String(n) }) {
  const cfg = ADVANCEMENT[kind];
  if (!cfg) throw new Error(`Unknown advancement kind: ${kind}`);
  const start = Math.max(0, Math.floor(Number(current) || 0));
  if (mode === "crest") {
    const o = advancementOptions({ current: start, kind });
    if (!o.crest) return { total: 0, lines: [], newValue: start, points: 0 };
    return {
      total: o.crest.cost,
      lines: [
        { label: `1 pt at ${rankNameOf(start)} (${start}→${o.crest.to})`, cost: o.crest.cost - cfg.crestFee },
        { label: `Cresting: ${rankNameOf(start)} → ${rankNameOf(o.crest.to)}`, cost: cfg.crestFee, cresting: true }
      ],
      newValue: o.crest.to, points: o.crest.to - start
    };
  }
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  let cv = start, total = 0, segStart = start, segTotal = 0;
  const lines = [];
  for (let i = 0; i < pts; i++) {
    const o = advancementOptions({ current: cv, kind });
    if (o.step) {
      total += o.step.cost; segTotal += o.step.cost; cv = o.step.to;
    } else if (o.crest) {
      const stepCost = o.crest.cost - cfg.crestFee;
      segTotal += stepCost;
      lines.push({ label: `${cv - segStart + 1} pt${cv - segStart + 1 > 1 ? "s" : ""} at ${rankNameOf(segStart)} (${segStart}→${o.crest.to})`, cost: segTotal });
      lines.push({ label: `Cresting: ${rankNameOf(cv)} → ${rankNameOf(o.crest.to)}`, cost: cfg.crestFee, cresting: true });
      total += o.crest.cost; cv = o.crest.to; segStart = cv; segTotal = 0;
    } else {
      break; // Class 1000+ — not advanceable by karma
    }
  }
  if (cv > segStart) lines.push({ label: `${cv - segStart} pt${cv - segStart > 1 ? "s" : ""} at ${rankNameOf(segStart)} (${segStart}→${cv})`, cost: segTotal });
  return { total, lines, newValue: cv, points: cv - start };
}

// One number for every Spend Karma type. params by type:
//  advancement kinds: { current, points }
//  Power Addition:    { startingRank, robot }
//  Talent Addition:   { source }              (key of TALENT_SOURCES)
//  Contact Addition:  { resourceRank, extradimensional }
export function spendCost(type, params = {}) {
  const kind = SPEND_TYPE_KIND[type];
  if (kind) return advancementCost({ kind, current: params.current, points: params.points ?? 1, mode: params.crest ? "crest" : "step" }).total;
  switch (type) {
    case "Die Roll":         return MIN_KARMA_DECLARATION;
    case "Reduce Effect":    return EFFECT_REDUCTION_COST * Math.max(1, Number(params.steps) || 1);
    case "Power Stunt":      return POWER_STUNT_COST;
    case "Power Addition":   return powerAdditionCost(Number(params.startingRank) || 0, { robot: !!params.robot });
    case "Talent Addition":  return TALENT_ADDITION_COST[params.source] ?? TALENT_ADDITION_COST.fromNPC;
    case "Contact Addition": return contactAdditionCost(Number(params.resourceRank) || 0, { extradimensional: !!params.extradimensional });
    default:                 return 0;
  }
}
