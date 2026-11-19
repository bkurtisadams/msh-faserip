// power-validation.mjs v1.0.0 - 2026-11-19
// Rank checks for the Edit Power sheet. Minimum ranks come from the power
// type (TYPE_MIN_RANK, e.g. "Endurance +1CS") or a resistance's
// resistanceMinRank key, resolved against the owning actor's current
// abilities. A rank below the minimum is a warning only; the power saves.

import { RANKS_ORDERED, shiftRank } from "./rules/rules-reference.js";
import { TYPE_MIN_RANK } from "./power-sheet-view.mjs";

const RESIST_MIN_KEYS = {
  "endurance+1": "Endurance +1CS", "intuition+1": "Intuition +1CS", "psyche+1": "Psyche +1CS"
};

function minRankFormula(sys) {
  return TYPE_MIN_RANK[sys?.type] || RESIST_MIN_KEYS[sys?.resistanceMinRank] || "";
}

function resolveFormula(formula, actor) {
  const m = formula.match(/^(\w+)(?:\s*\+(\d+)CS)?$/i);
  if (!m || !actor) return "";
  const base = actor.system?.abilities?.[m[1].toLowerCase()]?.rank;
  if (!base) return "";
  return m[2] ? shiftRank(base, Number(m[2])) : base;
}

export function buildRankValidation(item) {
  const sys = item?.system || {};
  const formula = minRankFormula(sys);
  if (!formula) return { label: "None for this type", warnings: [], hasWarnings: false };
  const minRank = resolveFormula(formula, item?.actor);
  const label = minRank ? `${minRank} (${formula})` : formula;
  const warnings = [];
  const rank = sys.rank || "";
  if (minRank && rank && RANKS_ORDERED.indexOf(rank) < RANKS_ORDERED.indexOf(minRank)) {
    warnings.push(`Rank ${rank} is below the minimum for ${sys.type}: ${minRank} (${formula}).`);
  }
  return { label, warnings, hasWarnings: warnings.length > 0 };
}
