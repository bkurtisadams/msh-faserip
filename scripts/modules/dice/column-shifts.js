// scripts/modules/dice/column-shifts.js
// Purpose: Aggregate column shifts, clamp to Shift 0..Shift Z, and compute FEAT intensity requirement.

/* Expected imports from your universal-table module (adjust names if needed):
   - RANKS: ordered array of rank names from Shift 0 up to Shift Z (no Class ranks for clamping).
   - rankIndexOf(name: string): number
   - rankNameAt(index: number): string
*/
//import { RANKS, rankIndexOf, rankNameAt } from "./universal-table.js";
import { RANKS_ORDERED as RANKS, rankIndexOf, rankNameAt } from "./universal-table.js";

// Fallback (optional): uncomment if universal-table doesn’t export helpers.
// const RANKS = ["Shift 0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous","Unearthly","Shift X","Shift Y","Shift Z"];
// const rankIndexOf = (n) => Math.max(0, RANKS.findIndex(r => r.toLowerCase() === String(n).toLowerCase()));
// const rankNameAt = (i) => RANKS[Math.max(0, Math.min(RANKS.length - 1, i))];

/** Sum arbitrary CS modifiers (numbers), ignore null/undefined/NaN. */
export function sumColumnShifts(...mods) {
  return mods.flat().reduce((t, m) => (Number.isFinite(m) ? t + m : t), 0);
}

/** Clamp a rank index to Shift 0..Shift Z (exclude Class 1000+ from shifts per rules). */
export function clampRankIndex(idx) {
  const min = 0;                      // Shift 0
  const max = RANKS.length - 1;       // Shift Z
  return Math.max(min, Math.min(max, idx | 0));
}

/** Apply total column shifts to a base rank name or index. Returns {index, name, totalCS}. */
export function applyColumnShifts(baseRank, totalCS = 0) {
  const baseIdx = typeof baseRank === "number" ? baseRank : rankIndexOf(baseRank);
  const shiftedIdx = clampRankIndex(baseIdx + (totalCS | 0));
  return { index: shiftedIdx, name: rankNameAt(shiftedIdx), totalCS: totalCS | 0 };
}

/**
 * Determine the FEAT intensity requirement per Advanced Set:
 * - If Ability > Intensity → need Green
 * - If Ability = Intensity → need Yellow
 * - If Intensity > Ability → need Red
 * Also expose "automatic" (≥3 ranks above) and "impossible" (optional rule; >1 rank above ability).
 */
export function resolveIntensityRequirement(abilityRankName, intensityRankName) {
  const a = rankIndexOf(abilityRankName);
  const i = rankIndexOf(intensityRankName);

  const diff = a - i; // positive = ability higher
  let requiredColor = "green";
  if (diff === 0) requiredColor = "yellow";
  if (diff < 0) requiredColor = "red";

  // Automatic FEAT if ability is ≥3 ranks above intensity (Judge’s call, but common guidance)
  const isAutomatic = diff >= 3;

  // Optional “impossible” guideline: more than one rank above ability may be considered impossible
  // (Resources are *always* limited this way).
  const isImpossible = (i - a) > 1;

  return { requiredColor, isAutomatic, isImpossible, abilityIndex: a, intensityIndex: i, rankDelta: diff };
}

/** One-stop helper: feed base rank + CS mods + optionally an intensity, get both outputs. */
export function computeShiftedRankAndRequirement(options) {
  const {
    baseRank,            // rank name or index for the acting score
    modifiers = [],      // array of CS numbers (+/-)
    intensityRank = null // rank name for the test intensity (or null)
  } = options;

  const totalCS = sumColumnShifts(modifiers);
  const { index, name } = applyColumnShifts(baseRank, totalCS);
  const requirement = intensityRank
    ? resolveIntensityRequirement(name, intensityRank)
    : null;

  return { index, name, totalCS, requirement };
}
