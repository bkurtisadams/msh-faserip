// scripts/modules/actions/range-helpers.js v1.0.0 - 2026-09-05
// Pure range helpers over faserip-rules range v0.1.0 for the ranged dialogs
// (no Foundry globals, so scripts/dev/kernel-range-diff.mjs can import it).
import { kernelKeyFor } from "../../kernel/adapter.js";
import {
  powerRange, throwRange, weaponRangeShift, thrownRangeShift, powerRangeShift,
} from "../../lib/faserip-rules/faserip-range.js";

/** Power rank to range in areas (Power Rank Range Table); Infinity for LOS ranks. */
export function powerRangeInAreas(rank) {
  const key = kernelKeyFor(rank);
  return key ? powerRange(key).areas : 1;
}

/** Strength rank to maximum throwing range in areas; Infinity for LOS ranks. */
export function throwingRangeInAreas(rank) {
  const key = kernelKeyFor(rank);
  return key ? throwRange(key).areas : 1;
}

/** Display form of a range: "LOS" for unlimited. */
export function rangeLabel(areas) {
  return Number.isFinite(areas) ? String(areas) : "LOS";
}

/** Weapon: -1CS per area to the target (own area 0); 0 when out of range (caller refuses). */
export function weaponRangePenalty(distance, maxRange = Infinity) {
  const r = weaponRangeShift({ distance: Number(distance) || 0, maxRange });
  return r.inRange ? r.shift : 0;
}

/** Thrown item: the weapon penalty, capped by the Strength throwing range. */
export function thrownRangePenalty(distance, strengthRank) {
  const key = kernelKeyFor(strengthRank);
  if (!key) return -(Math.max(0, Number(distance) || 0));
  const r = thrownRangeShift({ distance: Number(distance) || 0, strengthKey: key });
  return r.inRange ? r.shift : 0;
}

/** Power: -1CS per area beyond the rank's range; LOS powers 0. */
export function powerRangePenalty(powerRank, distance) {
  const key = kernelKeyFor(powerRank);
  if (!key) return 0;
  return powerRangeShift({ powerRank: key, distance: Number(distance) || 0 }).shift;
}
