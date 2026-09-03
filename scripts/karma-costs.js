// scripts/karma-costs.js v1.1.0 - 2026-09-02
// v1.1.0: RULED 2026-09-02 — one rank number at a time, crest at the range
//         boundary. "crest" mode removed; the kernel offers the crest only
//         from a rank's top number and the step walker takes it there.
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

// Raise a rank number by `points`, one at a time; the purchase that crosses
// a range boundary carries the kernel's crest fee (RULED 2026-09-02).
// Returns { total, lines, newValue, points }.
export function advancementCost({ kind, current, points, rankNameOf = (n) => String(n) }) {
  const cfg = ADVANCEMENT[kind];
  if (!cfg) throw new Error(`Unknown advancement kind: ${kind}`);
  const start = Math.max(0, Math.floor(Number(current) || 0));
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
  if (kind) return advancementCost({ kind, current: params.current, points: params.points ?? 1 }).total;
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
