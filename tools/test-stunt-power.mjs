import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stuntPowerContext, rankUpdate, derivedRank, stuntEntryFor, parentIdFor,
} from '../scripts/stunt-power.js';

const flags = { p2: true };
const mk = (id, name, system) => ({ id, type: 'power', name, system, getFlag: (s, k) => k === 'isStuntPower' && flags[id] === true });
const actor = { documentName: 'Actor', name: 'Screamwave', system: { stunts: [
  { name: 'Wide Band', parentPowerId: 'p1', timesUsed: 2 },
  { name: 'Sonic Stun', parentPowerId: 'p1', timesUsed: 10, presetKey: 'sound-stun' },
] } };
const scream = mk('p1', 'Sonic Scream', { rank: 'Incredible', value: 42 });
const stun = mk('p2', 'Sonic Stun', { rank: 'Good', value: 10, stuntParentId: '', stuntShift: 0 });
const items = [scream, stun];
for (const i of items) i.parent = actor;
actor.items = { get: id => items.find(i => i.id === id), filter: f => items.filter(f) };
const uses = (s, n) => s.presetKey === 'sound-stun' && String(n).toLowerCase().includes('sonic stun');

assert.equal(stuntEntryFor(actor, stun, uses).index, 1);
assert.equal(stuntEntryFor(actor, stun).index, 1, 'falls back to a name match');
assert.equal(parentIdFor(actor, stun, stuntEntryFor(actor, stun, uses)), 'p1', 'parent taken from the Stunts tab entry');

let c = stuntPowerContext(stun, { usesItem: uses });
assert.equal(c.isStuntPower, true);
assert.equal(c.parentId, 'p1');
assert.equal(c.savedParentId, '');
assert.equal(c.rank, 'Incredible');
assert.equal(c.value, 42, 'no shift keeps the parent rank number');
assert.equal(c.statusText, 'Sonic Stun: Mastered');
assert.deepEqual(c.parentOptions.map(o => o.id), ['p1'], 'a stunt power cannot be its own or another stunt power\'s parent');

assert.deepEqual(derivedRank(scream, -1), { rank: 'Remarkable', value: 30 });
stun.system.stuntParentId = 'p1';
assert.deepEqual(rankUpdate(stun, scream), { 'system.rank': 'Incredible', 'system.value': 42 });
stun.system.stuntShift = -1;
assert.deepEqual(rankUpdate(stun, scream), { 'system.rank': 'Remarkable', 'system.value': 30 });
stun.system.rank = 'Remarkable'; stun.system.value = 30;
assert.equal(rankUpdate(stun, scream), null, 'no write when already in step');
assert.equal(rankUpdate(stun, null), null);

flags.p2 = false;
assert.equal(stuntPowerContext(stun, { usesItem: uses }).usedByStunt, 'Sonic Stun', 'unmarked power used by a stunt gets the hint');
assert.equal(stuntPowerContext(scream, { usesItem: uses }).usedByStunt, '');

const loose = { id: 'p9', type: 'power', name: 'New Trick', parent: null, system: { rank: 'Good', value: 10 }, getFlag: () => true };
c = stuntPowerContext(loose, {});
assert.equal(c.onActor, false);
assert.equal(c.parentId, '');
assert.equal(c.rank, 'Good');

const shortSheet = readFileSync(new URL('../templates/stunt-power-sheet.html', import.meta.url), 'utf8');
for (const p of ['power-attack', 'power-save', 'power-fx']) {
  assert.ok(shortSheet.includes(`parts/${p}.hbs`), `short sheet uses ${p}`);
}
for (const gone of ['system.category', 'system.countsAsTwoPowers', 'system.isLimited', 'system.isDefensePower']) {
  assert.ok(!shortSheet.includes(`name="${gone}"`), `${gone} not on the short sheet`);
}
const init = readFileSync(new URL('../scripts/init.js', import.meta.url), 'utf8');
assert.ok(init.includes('templates/parts/power-attack.hbs') && init.includes('registerStuntPowerSync();'));

console.log('stunt power tests passed');
