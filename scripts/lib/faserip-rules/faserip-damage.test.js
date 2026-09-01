// faserip-damage test suite — run: node faserip-damage.test.js
// [CERT] tests certify against Players Book worked examples and prose.

import {
  bluntDamage, meleeWeaponDamage, bluntThrowDamage, chargeDamage, chargeDamageParts,
  chargeToHitShift, chargeMissContinuation, MATERIAL_EXAMPLES, INDESTRUCTIBLE_MATERIAL_RANKS,
  defenseValue, applyDefense, resolveChargeImpact, forceFieldBreach,
  resolveResistance, enduranceLossStep, recoveryAmount, healingPerHour,
  applyHealing, resolveFallImpact, KARMA_STABILIZE_ONE_ROUND, KARMA_EXTRA_ENDURANCE_FEAT,
  DAMAGE_VERSION, DAMAGE_CERTIFIED,
} from './faserip-damage.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-damage v${DAMAGE_VERSION}  (DAMAGE_CERTIFIED=${DAMAGE_CERTIFIED})\n`);

// --- Damage by attack form ---------------------------------------------

t('[CERT] bare hands inflict Strength rank number', () => {
  eq(bluntDamage({ strength: 75 }), 75);
});

t('[CERT] Aunt May Feeble(2) + Excellent lead pipe -> 3 (min of next rank above Strength)', () => {
  eq(bluntDamage({ strength: 2, weaponMaterialRank: 'EX' }), 3);
});

t('[CERT] Daredevil Good(10) + Excellent lead pipe -> 16', () => {
  eq(bluntDamage({ strength: 10, weaponMaterialRank: 'EX' }), 16);
});

t('[CERT] Thing Monstrous(75) + Excellent lead pipe -> 20 (capped at material)', () => {
  eq(bluntDamage({ strength: 75, weaponMaterialRank: 'EX' }), 20);
});

t('[CERT] Wonder Man + knife: minimum 10, maximum 20 (Excellent material)', () => {
  eq(meleeWeaponDamage({ listedDamage: 10, strength: 100, weaponMaterialRank: 'EX' }), { min: 10, max: 20 });
});

t('[CERT] weak wielder never drops a designed weapon below its listed damage', () => {
  eq(meleeWeaponDamage({ listedDamage: 10, strength: 2, weaponMaterialRank: 'EX' }), { min: 10, max: 10 });
});

t('[CERT] blunt thrown: lesser of Strength and item material strength', () => {
  eq(bluntThrowDamage({ strength: 100, itemMaterialRank: 'GD' }), 10);
  eq(bluntThrowDamage({ strength: 6, itemMaterialRank: 'RM' }), 6);
});

t('[CERT] charging example: Endurance Good(10), 10 areas -> 10 + 2x10 = 30', () => {
  eq(chargeDamage({ endurance: 10, areas: 10 }), 30);
});

t('[CERT] charging uses higher of Endurance or Body Armor as the base', () => {
  eq(chargeDamage({ endurance: 10, bodyArmor: 40, areas: 5 }), 50);
});

t('[CERT] charge to-hit: +1CS per area moved, max +3, minimum one area', () => {
  eq(chargeToHitShift(0), null);
  eq(chargeToHitShift(1), 1);
  eq(chargeToHitShift(3), 3);
  eq(chargeToHitShift(10), 3);
});

t('[CERT] charge damage parts: base reducible, speed bonus fixed', () => {
  eq(chargeDamageParts({ endurance: 10, areas: 10 }), { base: 10, speedBonus: 20, total: 30, baseReducible: true, speedBonusFixed: true });
});

t('[CERT] a charging Miss continues half speed rounding up', () => {
  eq(chargeMissContinuation(7), 4);
  eq(chargeMissContinuation(10), 5);
});

t('[CERT] material examples: asphalt Good, steel Remarkable, Adamantium Unearthly; Class ranks indestructible', () => {
  eq(MATERIAL_EXAMPLES.GD.includes('asphalt'), true);
  eq(MATERIAL_EXAMPLES.RM.includes('steel'), true);
  eq(MATERIAL_EXAMPLES.UN.includes('Adamantium steel'), true);
  eq(INDESTRUCTIBLE_MATERIAL_RANKS, ['CL1000', 'CL3000', 'CL5000']);
});

t('[CERT] charging through a Good wall inflicts 10 on an unarmored attacker', () => {
  eq(resolveChargeImpact({ damage: 30, targetDefense: 10, attackerDefense: 0 }).attackerTakes, 10);
});

// --- Defenses ----------------------------------------------------------

t('[CERT] Body Armor vs Energy: Ex(25)->5, Mn(87)->67, Gd(10)->0', () => {
  eq(defenseValue({ kind: 'body-armor', rankNumber: 25 }, 'energy'), 5);
  eq(defenseValue({ kind: 'body-armor', rankNumber: 87 }, 'energy'), 67);
  eq(defenseValue({ kind: 'body-armor', rankNumber: 10 }, 'energy'), 0);
});

t('[CERT] Force Field: full vs Energy, -10 vs all other attacks', () => {
  eq(defenseValue({ kind: 'force-field', rankNumber: 21 }, 'energy'), 21);
  eq(defenseValue({ kind: 'force-field', rankNumber: 21 }, 'physical'), 11);
});

t('[CERT] dagger (10) vs Amazing(50) Body Armor: no damage, no Kill effect', () => {
  const r = applyDefense({ damage: 10, defense: { kind: 'body-armor', rankNumber: 50 } });
  eq(r.through, 0);
  eq(r.effectsApply, false);
});

t('[CERT] borderline rule: damage exactly balanced by defenses -> 0 through, effects still apply', () => {
  const r = applyDefense({ damage: 50, defense: { kind: 'body-armor', rankNumber: 50 } });
  eq(r.through, 0);
  eq(r.effectsApply, true);
});

t('[CERT] damage past armor: through = damage - value, effects apply', () => {
  const r = applyDefense({ damage: 75, defense: { kind: 'body-armor', rankNumber: 40 } });
  eq(r.through, 35);
  eq(r.effectsApply, true);
});

t('[CERT] charging rebound example: 30 dmg, target BA Ex(20), attacker BA Gd(10) -> target 10, attacker 10', () => {
  const r = resolveChargeImpact({ damage: 30, targetDefense: 20, attackerDefense: 10 });
  eq(r.targetTakes, 10);
  eq(r.rebound, 20);
  eq(r.attackerTakes, 10);
});

t('[CERT] charging a Good(10) wall unarmored: attacker takes 10', () => {
  const r = resolveChargeImpact({ damage: 30, targetDefense: 10, attackerDefense: 0 });
  eq(r.attackerTakes, 10);
});

t('[CERT] force field breach: damage exceeding rank number breaches with excess', () => {
  eq(forceFieldBreach({ fieldRankNumber: 75, damage: 75 }), { breached: false, excess: 0 });
  eq(forceFieldBreach({ fieldRankNumber: 75, damage: 76 }), { breached: true, excess: 1 });
});

// --- Resistances -------------------------------------------------------

t('[CERT] Amazing(50) fire resistance ignores Incredible(40) steam automatically', () => {
  const r = resolveResistance({ resistanceNumber: 50, intensityNumber: 40, roll: 1 });
  eq(r.negated, true);
  eq(r.automatic, true);
});

t('[CERT] equal-intensity resistance: yellow FEAT negates; failure falls back to armor', () => {
  const good = resolveResistance({ resistanceNumber: 50, intensityNumber: 50, roll: 60 });
  eq(good.needed, 'yellow');
  eq(good.negated, true);
  const bad = resolveResistance({ resistanceNumber: 50, intensityNumber: 50, roll: 30 });
  eq(bad.negated, false);
  eq(bad.fallbackArmor, 50);
});

// --- Life, death, and healing ------------------------------------------

t('[CERT] death spiral: one rank per turn, checks at highest number of new rank', () => {
  const step = enduranceLossStep('EX');
  eq(step.dead, false);
  eq(step.rank, 'GD');
  eq(step.numberForChecks, 15);
});

t('[CERT] slipping below Shift 0 is death', () => {
  eq(enduranceLossStep('SH0').dead, true);
});

t('[CERT] stabilization karma costs: 50 for one round, 200 for extra Endurance FEAT', () => {
  eq(KARMA_STABILIZE_ONE_ROUND, 50);
  eq(KARMA_EXTRA_ENDURANCE_FEAT, 200);
});

t('[CERT] Recovery regains Endurance rank number; Healing per hour doubles under medical care', () => {
  eq(recoveryAmount(30), 30);
  eq(healingPerHour(30), 30);
  eq(healingPerHour(30, { medicalCare: true }), 60);
});

t('[CERT] healing never exceeds maximum Health', () => {
  eq(applyHealing({ current: 90, max: 100, amount: 30 }), 100);
});

t('[CERT] She-Hulk landing: Incredible(40) BA vs Excellent road at speed 20 — the road gives, she takes nothing', () => {
  const r = resolveFallImpact({ enduranceNumber: 40, bodyArmorNumber: 40, impactSpeedAreas: 20, floorsFallen: 33, groundMaterialRank: 'EX' });
  eq(r.groundGives, true);
  eq(r.heroTakes, 0);
});

t('[CERT] unarmored faller onto Excellent road at speed 10: ground gives, rebound 20 taken', () => {
  const r = resolveFallImpact({ enduranceNumber: 6, impactSpeedAreas: 10, floorsFallen: 10, groundMaterialRank: 'EX' });
  eq(r.chargeDamage, 26);
  eq(r.groundGives, true);
  eq(r.heroTakes, 20);
});

t('[CERT] ground holds: charging model rebounds full damage; distance model takes floors fallen (errata OPEN)', () => {
  const charging = resolveFallImpact({ enduranceNumber: 6, impactSpeedAreas: 10, floorsFallen: 10, groundMaterialRank: 'RM' });
  eq(charging.groundGives, false);
  eq(charging.heroTakes, 26);
  const distance = resolveFallImpact({ enduranceNumber: 6, impactSpeedAreas: 10, floorsFallen: 10, groundMaterialRank: 'RM', model: 'distance' });
  eq(distance.heroTakes, 10);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
