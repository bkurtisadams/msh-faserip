// faserip-rules ammo v0.8.0
// Specialized ammunition mechanics (Players Book equipment chapter).
// Price/packaging table intentionally not encoded here — equipment data
// lives with the audited weapon tables (msh-faserip rules-reference.js).

import { rankForNumber, rankByKey, shiftRank } from './faserip-kernel.js';
import { defenseValue } from './faserip-damage.js';

export const AMMO_VERSION = '0.8.0';
export const AMMO_CERTIFIED = true;

// Stun, concussion, and laser weapons run on power packs and may not use
// other ammunition; gyro-jets use only gyro-jet ammunition (several
// warhead types).
export const POWER_PACK_ONLY = ['stun', 'concussion', 'laser'];
export const GYROJET_ONLY_AMMO = ['heat-seeker'];

// AP Shot: reduces the target's Body Armor by 2CS (Good -> Poor) for
// hitting and damage; NO effect on force fields (including forcefield-
// stiffened armor).
export const AP_SHOT_SHIFT = -2;

export function apAdjustedDefense(defense) {
  if (!defense) return defense;
  if (defense.kind === 'force-field') return { ...defense };
  const rank = shiftRank(rankForNumber(defense.rankNumber).key, AP_SHOT_SHIFT);
  return { ...defense, rankNumber: rank.standard, apApplied: true, apRank: rank.key };
}

// Mercy Shot: no damage; spreads a Remarkable Intensity knock-out drug,
// KO 1-10 rounds. Trigger text is contradictory ("inflict no damage...
// if the bullet inflicts damage") — implemented as: drug applies when the
// weapon's damage would have met or beaten the defenses (borderline-
// consistent). ERRATA OPEN.
export const MERCY_SHOT = { damage: 0, drug: 'knock-out', drugIntensity: 'RM', koRounds: '1-10' };

export function resolveMercyShot({ weaponDamage, defense = null, attackClass = 'physical' }) {
  const value = defense ? defenseValue(defense, attackClass) : 0;
  const drugApplies = weaponDamage > 0 && weaponDamage >= value;
  return { damage: 0, drugApplies, drugIntensity: MERCY_SHOT.drugIntensity, koRounds: MERCY_SHOT.koRounds };
}

// Rubber Shot: inflicts slugfest (blunt) damage instead of shooting
// damage; ignore Slam results.
export const RUBBER_SHOT = { damageType: 'blunt', suppressSlam: true };

// Explosive Shot: twice the weapon's listed damage; burst/scatter weapons
// affect everyone in the area.
export const EXPLOSIVE_SHOT = { damageMultiplier: 2, burstAffectsArea: true };

export function explosiveShotDamage(listedDamage) {
  return listedDamage * EXPLOSIVE_SHOT.damageMultiplier;
}

// Canister Shot: payload chosen at purchase, same cost.
export const CANISTERS = {
  gas:       { payload: 'tear-gas',      intensity: 'IN', areas: 1 },
  knockOut:  { payload: 'knock-out-gas', intensity: 'RM', areas: 1 },
  smoke:     { payload: 'smoke',         intensity: 'EX', areas: 1 },
  explosive: { targetAreaMultiplier: 2, adjacentAreaMultiplier: 1 },
  incendiary:{ burnsRounds: '1-10', burnIntensityEqualsWeaponDamage: true },
};

export function canisterExplosiveDamage(listedDamage, { adjacent = false } = {}) {
  const m = adjacent ? CANISTERS.explosive.adjacentAreaMultiplier : CANISTERS.explosive.targetAreaMultiplier;
  return listedDamage * m;
}

export function incendiaryBurnIntensity(weaponDamage) {
  return rankForNumber(weaponDamage).key;
}

// Heat-Seeker (gyro-jet pistols only): tracks the hottest source in line
// up to the weapon's maximum range, no range penalty, random pick among
// equally hot targets.
export const HEAT_SEEKER = { gyroJetOnly: true, noRangePenalty: true, tieBreak: 'random' };

export function heatSeekerTarget(targets, rngIndex = 0) {
  if (!targets.length) return null;
  const maxHeat = Math.max(...targets.map(t => t.heat));
  const hottest = targets.filter(t => t.heat === maxHeat);
  return hottest[rngIndex % hottest.length];
}
