// scripts/modules/dice/column-shifts.js
// Purpose: Aggregate column shifts, clamp to Shift 0..Shift Z, and compute FEAT intensity requirement.

/* Expected imports from your universal-table module (adjust names if needed):
   - RANKS: ordered array of rank names from Shift 0 up to Shift Z (no Class ranks for clamping).
   - rankIndexOf(name: string): number
   - rankNameAt(index: number): string
*/
//import { RANKS, rankIndexOf, rankNameAt } from "./universal-table.js";
import { RANKS_ORDERED as RANKS, rankIndexOf, rankNameAt } from "./universal-table.js";
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
