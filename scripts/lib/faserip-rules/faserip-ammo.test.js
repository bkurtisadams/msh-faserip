// faserip-ammo test suite — run: node faserip-ammo.test.js
// [CERT] tests certify against the Players Book ammunition rules.

import {
  POWER_PACK_ONLY, AP_SHOT_SHIFT, apAdjustedDefense,
  MERCY_SHOT, resolveMercyShot, RUBBER_SHOT,
  EXPLOSIVE_SHOT, explosiveShotDamage,
  CANISTERS, canisterExplosiveDamage, incendiaryBurnIntensity,
  HEAT_SEEKER, heatSeekerTarget,
  AMMO_VERSION, AMMO_CERTIFIED,
} from './faserip-ammo.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-ammo v${AMMO_VERSION}  (AMMO_CERTIFIED=${AMMO_CERTIFIED})\n`);

t('[CERT] AP Shot: Good(10) Body Armor reduced 2CS to Poor(4) for hit and damage', () => {
  const r = apAdjustedDefense({ kind: 'body-armor', rankNumber: 10 });
  eq(r.apRank, 'PR');
  eq(r.rankNumber, 4);
});

t('[CERT] AP Shot has no effect on force fields', () => {
  const r = apAdjustedDefense({ kind: 'force-field', rankNumber: 40 });
  eq(r.rankNumber, 40);
  eq(r.apApplied, undefined);
});

t('[CERT] AP floor: Feeble armor shifts to Shift 0 (nothing)', () => {
  const r = apAdjustedDefense({ kind: 'body-armor', rankNumber: 2 });
  eq(r.rankNumber, 0);
});

t('[CERT] Mercy Shot: no damage; Remarkable Intensity drug, KO 1-10 rounds when it would have hurt (errata OPEN)', () => {
  const through = resolveMercyShot({ weaponDamage: 10, defense: { kind: 'body-armor', rankNumber: 4 } });
  eq(through.damage, 0);
  eq(through.drugApplies, true);
  eq(through.drugIntensity, 'RM');
  const stopped = resolveMercyShot({ weaponDamage: 10, defense: { kind: 'body-armor', rankNumber: 40 } });
  eq(stopped.drugApplies, false);
  const borderline = resolveMercyShot({ weaponDamage: 10, defense: { kind: 'body-armor', rankNumber: 10 } });
  eq(borderline.drugApplies, true);
});

t('[CERT] Rubber Shot: slugfest damage type, Slam results ignored', () => {
  eq(RUBBER_SHOT, { damageType: 'blunt', suppressSlam: true });
});

t('[CERT] Explosive Shot doubles listed damage; bursts affect the whole area', () => {
  eq(explosiveShotDamage(10), 20);
  eq(EXPLOSIVE_SHOT.burstAffectsArea, true);
});

t('[CERT] canisters: tear gas In, knock-out Rm, smoke Ex, one area each', () => {
  eq(CANISTERS.gas, { payload: 'tear-gas', intensity: 'IN', areas: 1 });
  eq(CANISTERS.knockOut.intensity, 'RM');
  eq(CANISTERS.smoke.intensity, 'EX');
});

t('[CERT] explosive canister: double in target area, normal in adjacent', () => {
  eq(canisterExplosiveDamage(20), 40);
  eq(canisterExplosiveDamage(20, { adjacent: true }), 20);
});

t('[CERT] incendiary burns at the weapon-damage intensity for 1-10 rounds', () => {
  eq(incendiaryBurnIntensity(20), 'EX');
  eq(CANISTERS.incendiary.burnsRounds, '1-10');
});

t('[CERT] heat-seeker: gyro-jet only, no range penalty, tracks hottest, random among equals', () => {
  eq(HEAT_SEEKER, { gyroJetOnly: true, noRangePenalty: true, tieBreak: 'random' });
  const targets = [{ id: 'a', heat: 5 }, { id: 'b', heat: 9 }, { id: 'c', heat: 9 }];
  eq(heatSeekerTarget(targets, 0).id, 'b');
  eq(heatSeekerTarget(targets, 1).id, 'c');
});

t('[CERT] stun, concussion, and laser weapons take power packs only', () => {
  eq(POWER_PACK_ONLY, ['stun', 'concussion', 'laser']);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
