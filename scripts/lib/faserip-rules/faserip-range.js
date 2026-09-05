// faserip-rules range v0.1.0
// Range Modifiers and the Power Rank Range Table, certified against the
// Advanced Set text. Ranges are in areas; the attacker's own area is 0.
import { rankByKey, rankDistance, shiftRank, RANKS } from './faserip-kernel.js';

export const RANGE_VERSION = '0.1.0';
export const RANGE_CERTIFIED = true;

// Power Rank Range Table. Powers without a stated range use their rank.
// Class 1000+ ranges are given in miles; on a battle map they are effectively
// unlimited (line of sight), so `los: true` carries that alongside the miles.
export const POWER_RANGE = {
  SH0:    { areas: 0, touch: true },
  FE:     { areas: 0, touch: true },
  PR:     { areas: 1 },
  TY:     { areas: 2 },
  GD:     { areas: 4 },
  EX:     { areas: 6 },
  RM:     { areas: 8 },
  IN:     { areas: 10 },
  AM:     { areas: 20 },
  MN:     { areas: 40 },
  UN:     { areas: 60 },
  SHX:    { areas: 80 },
  SHY:    { areas: 160 },
  SHZ:    { areas: 400 },
  CL1000: { areas: Infinity, miles: 100, los: true },
  CL3000: { areas: Infinity, miles: 10000, los: true },
  CL5000: { areas: Infinity, miles: 1000000, los: true },
  BEYOND: { areas: Infinity, unlimited: true, los: true },
};

// Throwing range by Strength: the maximum distance a thrown item travels.
export const THROW_RANGE = {
  SH0: { areas: 0 }, FE: { areas: 1 }, PR: { areas: 1 }, TY: { areas: 1 }, GD: { areas: 2 },
  EX: { areas: 3 }, RM: { areas: 4 }, IN: { areas: 5 }, AM: { areas: 6 }, MN: { areas: 7 },
  UN: { areas: 8 }, SHX: { areas: 10 }, SHY: { areas: 15 }, SHZ: { areas: 20 },
  CL1000: { areas: Infinity, los: true }, CL3000: { areas: Infinity, los: true },
  CL5000: { areas: Infinity, los: true }, BEYOND: { areas: Infinity, los: true },
};

export function powerRange(rankKey) {
  const r = POWER_RANGE[rankKey];
  if (!r) throw new Error(`Unknown rank key: ${rankKey}`);
  return r;
}

export function throwRange(strengthKey) {
  const r = THROW_RANGE[strengthKey];
  if (!r) throw new Error(`Unknown rank key: ${strengthKey}`);
  return r;
}

// Weapons: -1CS to hit for each area to the target (a Rifle at 4 areas is
// -4CS); the listed range is a hard limit. RULED 2026-09-05: thrown items take
// the same penalty, the Strength table only caps how far they travel.
export const RANGE_SHIFT_PER_AREA = -1;

export function weaponRangeShift({ distance, maxRange }) {
  const d = Math.max(0, Math.floor(distance));
  if (Number.isFinite(maxRange) && d > maxRange) return { inRange: false, shift: 0, distance: d, maxRange };
  return { inRange: true, shift: RANGE_SHIFT_PER_AREA * d, distance: d, maxRange };
}

export function thrownRangeShift({ distance, strengthKey }) {
  return weaponRangeShift({ distance, maxRange: throwRange(strengthKey).areas });
}

// Powers: no penalty within the rank's range; -1CS per additional area
// beyond it. The chance cannot fall below Shift 0 — reaching it is the
// power's maximum distance unless the power is line of sight.
export function powerRangeShift({ powerRank, distance, abilityRank = null }) {
  const range = powerRange(powerRank);
  const d = Math.max(0, Math.floor(distance));
  if (range.los) return { inRange: true, shift: 0, beyond: 0, distance: d, maxRange: Infinity, atMaximum: false, los: true };
  const beyond = Math.max(0, d - range.areas);
  const shift = -beyond;
  let atMaximum = false, effectiveRank = null;
  if (abilityRank) {
    const distanceToShift0 = rankDistance('SH0', abilityRank);
    effectiveRank = shiftRank(abilityRank, shift).key;
    atMaximum = beyond >= distanceToShift0;
  }
  return { inRange: beyond === 0, shift, beyond, distance: d, maxRange: range.areas, atMaximum, effectiveRank, los: false };
}

// Farthest area a non-LOS power can reach with a given ability column:
// its range plus one area per column shift down to Shift 0.
export function powerMaximumDistance({ powerRank, abilityRank }) {
  const range = powerRange(powerRank);
  if (range.los) return Infinity;
  return range.areas + rankDistance('SH0', abilityRank);
}
