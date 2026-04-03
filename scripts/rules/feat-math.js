// feat-math.js v1.1.0 - 2026-04-03
// v1.1.0: Re-export from rules-reference.js instead of local rank data.
//         NOTE: This file is currently unused — nothing imports it.
//         Kept for potential future use; prefer importing directly from rules-reference.js.
export { RANKS_ORDERED as RANK_ORDER, rankIndex } from "./rules-reference.js";
import { rankIndex } from "./rules-reference.js";

export function isAutoFeat(abilityRank, intensityRank) {
  const diff = rankIndex(abilityRank) - rankIndex(intensityRank);
  return diff >= 3;  // Clarified rule: 3 or more ranks
}

export function isImpossibleByDefault(abilityRank, intensityRank) {
  const diff = rankIndex(intensityRank) - rankIndex(abilityRank);
  return diff >= 2;  // Intensity 2+ ranks above ability
}

export function requiredColor(abilityRank, intensityRank) {
  const diff = rankIndex(abilityRank) - rankIndex(intensityRank);
  if (diff > 0) return 'green';
  if (diff === 0) return 'yellow';
  return 'red';
}