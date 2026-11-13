import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPowerSheetView, defenseKind, forceFieldRows, typeSections,
} from '../scripts/power-sheet-view.mjs';

const read = p => readFileSync(new URL(`../templates/${p}`, import.meta.url), 'utf8');
const tpl = ['power-sheet-v2.html', 'parts/power-attack.hbs', 'parts/power-save.hbs', 'parts/power-fx.hbs'].map(read).join('\n');

assert.ok(!tpl.includes('data-tab='), 'single scrolling form, no tabs');
const header = tpl.slice(tpl.indexOf('class="ps2-header"'), tpl.indexOf('class="ps2-body"'));
assert.ok(!header.includes('name="system.rank"') && !header.includes('name="system.value"'), 'Rank is not in the header');
assert.ok(/Rank &amp; Identity[^]*?name="system\.rank"[^]*?name="system\.value"/.test(tpl), 'Rank and Value sit in Rank & Identity');
for (const gone of ['system.isStarred', 'isStuntPower', 'isBonusPower', 'system.grantedByEquipment',
  'system.limitation.usesPerDay', 'system.limitation.maxRank', 'system.control.useAsWeapon',
  'system.mental.telepathy', 'system.isBodyArmor', 'system.isForceField', 'system.isResistance',
  'system.isEnergyReflection', 'targetResistsWith']) {
  assert.ok(!tpl.includes(`name="${gone}"`) && !tpl.includes(`name="flags.msh-faserip.${gone}"`), `${gone} has no control`);
}
for (const kept of ['system.save.ability2', 'system.countsAsTwoPowers', 'system.isBonus',
  'system.movement.teleportCarry', 'system.continuingDamage', 'system.specialMechanics']) {
  assert.ok(tpl.includes(`name="${kept}"`), `${kept} has a control`);
}
assert.ok(tpl.includes('id="ps2-defense-kind"'));
assert.ok(!/id="ps2-defense-kind"[^>]*name=/.test(tpl), 'Kind is not a submitted field');

assert.equal(defenseKind({}), '');
assert.equal(defenseKind({ isBodyArmor: true, isForceField: true }), 'bodyArmor');
assert.equal(defenseKind({ isForceField: true }), 'forceField');
assert.equal(defenseKind({ isResistance: true }), 'resistance');
assert.equal(defenseKind({ isResistance: true, resistanceEffect: 'invulnerability' }), 'invulnerability');
assert.equal(defenseKind({ isEnergyReflection: true }), 'reflection');

const ff = forceFieldRows('Incredible', 40);
assert.equal(ff.coverage, 4);
assert.deepEqual(ff.rows, [
  { areas: 1, energy: 'Incredible (40)', physical: 30 },
  { areas: 2, energy: 'Remarkable (30)', physical: 20 },
  { areas: 3, energy: 'Excellent (20)', physical: 10 },
  { areas: 4, energy: 'Good (10)', physical: 0 },
]);
assert.equal(forceFieldRows('Monstrous', 75).coverage, 7, 'book example: rank number 70s covers 7 areas');
assert.equal(forceFieldRows('Feeble', 2).coverage, 1);

let v = buildPowerSheetView({ type: 'Growth', rank: 'Incredible', value: 40 });
assert.equal(v.isGrowth, true);
assert.equal(v.growthHeight, '20 feet');
assert.equal(v.growthToHit, '+2CS');
assert.equal(v.showAbilitySubSection, false);

v = buildPowerSheetView({ type: 'Shrinking', rank: 'Good', value: 10 });
assert.equal(v.shrinkHeight, '6 inches (1/16)');
assert.equal(v.shrinkShift, '1CS');

v = buildPowerSheetView({ type: 'Leaping' });
assert.equal(v.minRank, 'Strength +1CS');
assert.equal(buildPowerSheetView({ type: 'Combat Sense' }).minRank, 'Intuition');
assert.equal(buildPowerSheetView({ resistanceMinRank: 'psyche+1' }).minRank, 'Psyche +1CS');
assert.equal(buildPowerSheetView({}).minRank, 'None for this type');

assert.equal(buildPowerSheetView({ type: 'Time Control' }).limitationRequired, 'Yes');
assert.equal(buildPowerSheetView({ type: 'Flight' }).limitationRequired, 'No');
assert.equal(buildPowerSheetView({ limitationRequired: true }).limitationRequired, 'Yes');

assert.equal(buildPowerSheetView({ source: 'mystical' }).showMagic, true);
assert.equal(buildPowerSheetView({ source: 'natural' }).showMagic, false);
assert.equal(buildPowerSheetView({}, { isBonusPower: true }).isBonus, true);
assert.equal(buildPowerSheetView({ limitation: { rankBonus: '2' } }).rankBonus, 2);

v = buildPowerSheetView({ area: 14, save: { multiTargetCS: -1 } });
assert.ok(v.areaOptions.some(o => o.value === 14 && o.selected), 'out-of-list area keeps its value');
assert.ok(v.multiTargetOptions.some(o => o.value === -1 && o.selected));

v = buildPowerSheetView({ type: 'Force Field Generation', rank: 'Incredible', value: 40, isForceField: true });
assert.equal(v.showFieldInDefense, false, 'Field select lives in the type block for Force Field Generation');
assert.equal(buildPowerSheetView({ isForceField: true }).showFieldInDefense, true);

assert.deepEqual(typeSections('Claws'), ['special']);
assert.deepEqual(typeSections('Extra Body Parts'), ['bodyparts']);
assert.deepEqual(typeSections('Flight'), []);

console.log('power sheet layout tests passed');
