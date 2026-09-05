// faserip-rules damage v0.9.0
// v0.9.0: Life, Death, and Health — regain-consciousness FEAT, impaired
//         Endurance number (highest of the reduced rank), stabilization by
//         aid, Shift 0 disabilities, robot reactivation, Recovery gate and
//         timing constants. Certified against the Advanced Set passage.
// v0.8.1: Charging to-hit/miss helpers and the Material Strength examples
//         (previously vendored in msh-faserip only).
// Damage computation, defenses, dying, and recovery.
// Certified against Players Book combat, Powers in Combat, and
// Life/Death/Health prose.

import {
  rankForNumber, rankByKey, rankDistance, shiftRank,
  requiredColor, colorForRoll, colorAtLeast, resolveFeat, RANKS,
} from './faserip-kernel.js';

export const DAMAGE_VERSION = '0.9.0';
export const DAMAGE_CERTIFIED = true;

// --- Damage by attack form ---------------------------------------------

// Bare hands: Strength rank number. Blunt weapon: if the item's material
// strength rank exceeds the user's Strength rank, damage is the minimum
// number of the rank one above the user's Strength (Aunt May 2 -> 3,
// Daredevil 10 -> 16); otherwise up to the material's standard number
// (Thing + Excellent pipe -> 20). Reducible by the attacker.
export function bluntDamage({ strength, weaponMaterialRank = null }) {
  if (!weaponMaterialRank) return strength;
  const sRank = rankForNumber(strength);
  if (rankDistance(sRank.key, weaponMaterialRank) > 0) {
    return shiftRank(sRank.key, 1).min;
  }
  return Math.min(strength, rankByKey(weaponMaterialRank).standard);
}

// Designed melee weapons (knife, sword...): always at least the listed
// damage; at most the lesser of user Strength and material strength
// (Wonder Man + knife: min 10, max 20).
export function meleeWeaponDamage({ listedDamage, strength, weaponMaterialRank }) {
  const cap = Math.min(strength, rankByKey(weaponMaterialRank).standard);
  return { min: listedDamage, max: Math.max(listedDamage, cap) };
}

// Blunt thrown: lesser of thrower's Strength and item material strength.
export function bluntThrowDamage({ strength, itemMaterialRank }) {
  return Math.min(strength, rankByKey(itemMaterialRank).standard);
}

// Charging: higher of current Endurance or Body Armor rank number,
// plus 2 per area covered (End Gd(10), 10 areas -> 30). The base is
// reducible by the attacker; the speed bonus is fixed.
export function chargeDamage({ endurance, bodyArmor = 0, areas }) {
  return Math.max(endurance, bodyArmor) + 2 * areas;
}

export function chargeDamageParts({ endurance, bodyArmor = 0, areas }) {
  const base = Math.max(endurance, bodyArmor);
  return { base, speedBonus: 2 * areas, total: base + 2 * areas, baseReducible: true, speedBonusFixed: true };
}

// Charging to-hit: minimum one area moved; +1CS per area moved before
// reaching combat, maximum +3CS; Endurance for figuring may not be
// raised beyond Shift Z. Charging takes full movement (other actions
// halve it).
export const CHARGE_MIN_AREAS = 1;
export const CHARGE_MAX_TO_HIT_CS = 3;
export const CHARGE_ENDURANCE_SHIFT_CAP = 'SHZ';

export function chargeToHitShift(areasMoved) {
  if (areasMoved < CHARGE_MIN_AREAS) return null;
  return Math.min(areasMoved, CHARGE_MAX_TO_HIT_CS);
}

// A charging Miss continues the mover half his speed (round up) in a
// straight line; changing direction takes an Agility FEAT; a material
// obstacle in the line becomes the attack's target instead. The charged
// character may counterattack only if his action followed the charge.
export function chargeMissContinuation(speedAreas) {
  return Math.ceil(speedAreas / 2);
}

// Updated Material Strength Table (rank -> example materials).
// Class 1000-5000 materials are virtually indestructible (Cap's shield,
// Mjolnir).
export const MATERIAL_EXAMPLES = {
  FE: ['cloth', 'glass', 'brush', 'paper'],
  PR: ['normal plastics', 'crystal', 'wood'],
  TY: ['rubber', 'soft metals (gold, brass, copper)', 'ice', 'adobe', 'computer chips'],
  GD: ['brick', 'aluminum', 'light machinery pieces', 'asphalt', 'high strength plastics'],
  EX: ['concrete', 'Beta cloth', 'iron', 'bullet-proof glass'],
  RM: ['reinforced concrete', 'steel'],
  IN: ['solid stone', 'Vibranium', 'volcanic rock'],
  AM: ['osmium steel', 'granite', 'gemstones'],
  MN: ['diamond', 'super-heavy alloys'],
  UN: ['Adamantium steel', 'certain mystical and enchanted elements'],
};
export const INDESTRUCTIBLE_MATERIAL_RANKS = ['CL1000', 'CL3000', 'CL5000'];

// --- Defenses ----------------------------------------------------------

// Effective protection value by defense kind and attack class.
// Body Armor: full vs physical/force; rank number -20 vs Energy column
// (Ex 25 -> 5, Mn 87 -> 67, Gd 10 -> 0).
// Force Field: full vs Energy; -10 vs all other attacks.
export function defenseValue({ kind, rankNumber }, attackClass) {
  if (kind === 'body-armor') {
    return attackClass === 'energy' ? Math.max(0, rankNumber - 20) : rankNumber;
  }
  if (kind === 'force-field') {
    return attackClass === 'energy' ? rankNumber : Math.max(0, rankNumber - 10);
  }
  throw new Error(`Unknown defense kind: ${kind}`);
}

// A character with both Body Armor and a Force Field uses one or the
// other against any given attack, never both — callers pass one defense.
// effectsApply implements the borderline rule: damage exactly balanced
// by defenses still allows Slam/Stun/Kill; damage below defenses negates
// them along with all damage.
export function applyDefense({ damage, defense = null, attackClass = 'physical' }) {
  const value = defense ? defenseValue(defense, attackClass) : 0;
  const through = Math.max(0, damage - value);
  const effectsApply = damage > 0 && damage >= value;
  return { damage, defenseValue: value, through, effectsApply };
}

// Charging exchange: defense absorbs up to its value and returns it to
// the attacker, whose own defense absorbs in turn (Gd BA charger, 30 dmg,
// vs Ex BA target: target takes 10, attacker takes 10). Stuns and Slams
// still apply per the borderline rule. Inanimate targets: material
// strength counts as Body Armor.
export function resolveChargeImpact({ damage, targetDefense = 0, attackerDefense = 0 }) {
  const targetTakes = Math.max(0, damage - targetDefense);
  const rebound = Math.min(damage, targetDefense);
  const attackerTakes = Math.max(0, rebound - attackerDefense);
  return { damage, targetTakes, rebound, attackerTakes };
}

// Falling causes no damage; the sudden stop does. Landing is a Charging
// attack on the ground with its material strength as Body Armor
// (She-Hulk: Incredible BA vs Excellent road — the road gives, she walks
// away). The "damage equivalent to the distance" clause when the ground
// holds is ambiguous — model 'charging' (default) applies the standard
// rebound; model 'distance' takes floors fallen as damage through Body
// Armor. ERRATA OPEN.
export function resolveFallImpact({ enduranceNumber, bodyArmorNumber = 0, impactSpeedAreas, floorsFallen, groundMaterialRank, model = 'charging' }) {
  const dmg = chargeDamage({ endurance: enduranceNumber, bodyArmor: bodyArmorNumber, areas: impactSpeedAreas });
  const groundBA = rankByKey(groundMaterialRank).standard;
  const groundGives = dmg > groundBA;
  let heroTakes;
  if (model === 'charging' || groundGives) {
    heroTakes = resolveChargeImpact({ damage: dmg, targetDefense: groundBA, attackerDefense: bodyArmorNumber }).attackerTakes;
  } else {
    heroTakes = applyDefense({ damage: floorsFallen, defense: bodyArmorNumber ? { kind: 'body-armor', rankNumber: bodyArmorNumber } : null }).through;
  }
  return { chargeDamage: dmg, groundBA, groundGives, heroTakes, model };
}

// Force field overload: damage exceeding the Power rank number breaches
// the field. Personal: switches off, wielder takes the excess and may be
// stunned/slammed. Projected: Psyche FEAT vs attack intensity or the
// wielder is unconscious; the field protects those within that round.
export function forceFieldBreach({ fieldRankNumber, damage }) {
  const breached = damage > fieldRankNumber;
  return { breached, excess: breached ? damage - fieldRankNumber : 0 };
}

// Resistances: attacks of strictly lower intensity rank than the
// resistance have no effect (Power description). Equal or higher: FEAT
// vs the damage as Intensity; success negates, failure leaves the
// resistance acting as Body Armor at its rank number (Powers in Combat).
export function resolveResistance({ resistanceNumber, intensityNumber, roll, karma = 0, karmaAllowed = true }) {
  const rRank = rankForNumber(resistanceNumber);
  const iRank = rankForNumber(intensityNumber);
  if (rankDistance(iRank.key, rRank.key) > 0) {
    return { negated: true, automatic: true, fallbackArmor: 0 };
  }
  const needed = requiredColor(rRank.key, iRank.key);
  if (needed === 'impossible') {
    return { negated: false, automatic: false, needed, fallbackArmor: resistanceNumber };
  }
  const modified = Math.min(roll + (karmaAllowed ? karma : 0), 100);
  const color = colorForRoll(rRank.key, modified);
  const negated = colorAtLeast(color, needed);
  return { negated, automatic: false, needed, color, modifiedRoll: modified, fallbackArmor: negated ? 0 : resistanceNumber };
}

// --- Life, death, and the spiral ---------------------------------------

export const KARMA_STABILIZE_ONE_ROUND = 50;
export const KARMA_EXTRA_ENDURANCE_FEAT = 200;

// 0 Health: unconscious for 1-10 rounds, then an Endurance FEAT on the
// Kill column (see effects resolveKill). "No effect" = Stunned 1-10 rounds
// and may regain consciousness; "Endurance Loss" begins the spiral.
export const ZERO_HEALTH_UNCONSCIOUS_ROUNDS = { min: 1, max: 10 };
export const STUN_ROUNDS = { min: 1, max: 10 };

// One Endurance rank lost per turn while dying. Loss is temporary; for
// further Endurance checks the number is the highest of the new rank.
// Reaching Shift 0 is not yet death; slipping below Shift 0 is.
export function impairedEnduranceNumber(rankKey) {
  const r = rankByKey(rankKey);
  return r.max === Infinity ? r.standard : r.max;
}

export function enduranceLossStep(rankKey) {
  if (rankKey === 'SH0') return { dead: true, rank: null, numberForChecks: null };
  const i = RANKS.findIndex(r => r.key === rankKey);
  if (i < 1) throw new Error(`Unknown rank key: ${rankKey}`);
  const next = RANKS[i - 1];
  return { dead: false, rank: next.key, numberForChecks: impairedEnduranceNumber(next.key) };
}

// Aid of any kind (first aid, summoning help, pulling to safety, checking
// on the character) halts the loss. The character stays unconscious for
// 1-10 more hours if at 0 Health.
export const STABILIZE_UNCONSCIOUS_HOURS = { min: 1, max: 10 };
export function stabilizationOutcome({ health }) {
  return health > 0
    ? { lossHalted: true, unconscious: false, hours: null }
    : { lossHalted: true, unconscious: true, hours: STABILIZE_UNCONSCIOUS_HOURS };
}

// Regaining consciousness: a Stunned character wakes in 1-10 turns. A
// 0-Health character is unconscious 1-10 turns, then rolls an Endurance
// FEAT (no Intensity stated: green). Failure: still unconscious, check
// again in 1-10 turns. Success: conscious with Health equal to the
// Endurance rank number (the impaired number while ranks are lost).
export const WAKE_RETRY_TURNS = { min: 1, max: 10 };
export function regainConsciousnessFeat({ enduranceRank, enduranceNumber, roll, karma = 0, karmaAllowed = true, shifts = [] }) {
  const feat = resolveFeat({ rank: enduranceRank, shifts, intensity: null, roll, karma, karmaAllowed });
  return { ...feat, wakeHealth: feat.success ? enduranceNumber : null, retryTurns: feat.success ? null : WAKE_RETRY_TURNS };
}

// A character with lost Endurance ranks acts at -2CS until restored: one
// rank per week normally, one per day in hospital or under a doctor's
// care; never above the pre-damage number.
export const IMPAIRED_ABILITY_SHIFT = -2;
export const ENDURANCE_RANK_HEAL_DAYS = { normal: 7, hospital: 1 };
export function enduranceRestoreStep({ rankKey, originalRankKey, originalNumber }) {
  if (rankKey === originalRankKey) return { restored: false, atCap: true, rank: rankKey, number: originalNumber };
  const next = shiftRank(rankKey, 1);
  if (rankDistance(next.key, originalRankKey) <= 0) {
    return { restored: true, atCap: true, rank: originalRankKey, number: originalNumber };
  }
  return { restored: true, atCap: false, rank: next.key, number: impairedEnduranceNumber(next.key) };
}

// Disabilities: at Shift 0 Endurance, each physical ability above Good
// makes a green FEAT; failure reduces it to the next lower printed
// (standard) number, recoverable only by experience.
export const DISABILITY_ABILITIES = ['fighting', 'agility', 'strength', 'endurance'];
export function disabilityCheck({ abilityRank, roll, karma = 0, karmaAllowed = true }) {
  if (rankDistance('GD', abilityRank) <= 0) return { atRisk: false, impaired: false, rank: abilityRank, number: rankByKey(abilityRank).standard };
  const feat = resolveFeat({ rank: abilityRank, intensity: null, roll, karma, karmaAllowed });
  if (feat.success) return { atRisk: true, impaired: false, rank: abilityRank, number: rankByKey(abilityRank).standard, feat };
  const lower = shiftRank(abilityRank, -1);
  return { atRisk: true, impaired: true, rank: lower.key, number: lower.standard, feat };
}

// Robots at 0 Health with all Endurance ranks lost are not dead: a Reason
// FEAT of Intensity equal to the robot's highest Ability or Power rank
// rebuilds it (no Karma on return); reactivation takes days equal to the
// highest Power rank number (Vision: 10D = 100 days).
export function robotReactivation({ highestRankKey, highestPowerNumber }) {
  return { reasonIntensity: highestRankKey, days: highestPowerNumber, karmaOnReturn: 0 };
}

// --- Recovery and healing ----------------------------------------------

// Recovery: Endurance rank number regained 10 turns after damage, once
// per day, provided the character was not knocked unconscious and was not
// damaged again in the interval (then only Healing is possible).
export const RECOVERY_DELAY_TURNS = 10;
export const RECOVERY_PER_DAY = 1;
export function recoveryAmount(enduranceNumber) {
  return enduranceNumber;
}

export function recoveryAllowed({ conscious, knockedOut = false, damagedAgain = false, usedToday = false, turnsSinceDamage = RECOVERY_DELAY_TURNS }) {
  if (!conscious) return { allowed: false, reason: 'unconscious' };
  if (knockedOut) return { allowed: false, reason: 'knocked unconscious' };
  if (damagedAgain) return { allowed: false, reason: 'damaged again' };
  if (usedToday) return { allowed: false, reason: 'once per day' };
  if (turnsSinceDamage < RECOVERY_DELAY_TURNS) return { allowed: false, reason: 'ten turns', turnsRemaining: RECOVERY_DELAY_TURNS - turnsSinceDamage };
  return { allowed: true, reason: null };
}

// Healing: Endurance rank number in the hour (600 turns) after last
// damage, measured from the latest damage; doubled by bedrest and
// medical supervision. Health never exceeds maximum.
export const HEALING_INTERVAL_TURNS = 600;
export function healingPerHour(enduranceNumber, { medicalCare = false } = {}) {
  return enduranceNumber * (medicalCare ? 2 : 1);
}

export function applyHealing({ current, max, amount }) {
  return Math.min(max, current + amount);
}
