// scripts/modules/actions/nullify-utils.js v1.0.1 - 2026-07-31
// v1.0.1: Fix requiredColorFromDelta comments — thresholds unchanged; auto-fail
//         is intensity 2+ ranks above ability per adopted Impossible FEATs rule.
// scripts/modules/actions/nullify-utils.js v1.0.0 - 2026-03-22
// Shared utilities for nullify.js and nullify-aura.js.
// Extracted to break circular import dependency.

import { POWER_RANGE_VALUES } from "../dice/universal-table.js";

export const RANKS = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing",
  "Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
];

export const rIdx = (r) => Math.max(0, RANKS.findIndex(x => x.toLowerCase() === String(r||"").toLowerCase()));

const order = { white: 0, green: 1, yellow: 2, red: 3 };

/**
 * Get the effective nullify aura range in areas for a given power rank.
 * Respects the nullifyMaxRange game setting (0 = full RAW, >0 = cap).
 */
export function getNullifyRange(powerRank) {
  const raw = POWER_RANGE_VALUES[powerRank] ?? POWER_RANGE_VALUES[
    Object.keys(POWER_RANGE_VALUES).find(k => k.toLowerCase() === powerRank.toLowerCase())
  ] ?? 4;

  const cap = game.settings?.get?.("msh-faserip", "nullifyMaxRange") ?? 0;
  if (cap > 0) return Math.min(raw, cap);
  return raw;
}

/**
 * Per RAW Advanced Set FEAT rules:
 *   Ability 3+ ranks above intensity (delta <= -3) = Automatic success (auto-resist)
 *   Ability > Intensity (delta -1 to -2)           = Green needed to resist
 *   Intensity = Ability (delta 0)                  = Yellow needed
 *   Intensity 1 rank above (delta = 1)             = Red needed
 *   Intensity 2+ ranks above (delta >= 2)          = Impossible = auto-fail
 */
export function requiredColorFromDelta(delta) {
  if (delta >= 2)  return "auto-fail";   // intensity 2+ ranks above ability = impossible (optional rule, adopted)
  if (delta === 1) return "red";
  if (delta === 0) return "yellow";
  if (delta >= -2) return "green";
  return "auto-success";                 // ability 3+ ranks above intensity = automatic resist
}

export function meetsThreshold(rolledColor, requiredColor) {
  if (requiredColor === "auto-fail") return false;
  if (requiredColor === "auto-success") return true;
  return (order[String(rolledColor).toLowerCase()] >= order[String(requiredColor).toLowerCase()]);
}
