import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stuntKarmaCost, stuntStatus, stuntRow, stuntRows, successesToMastery,
} from '../scripts/stunt-ledger.js';

assert.equal(stuntKarmaCost(null), 100);
assert.equal(stuntKarmaCost({ name: 'Flight', system: { type: 'Flight' } }), 100);
assert.equal(stuntKarmaCost({ name: 'Storm Lord', system: { type: 'Weather Control' } }), 50, 'Weather Control stunts cost 50');
assert.equal(stuntKarmaCost({ name: 'Weather Control', system: {} }), 50);

assert.deepEqual(stuntStatus(0), { key: 'red', label: 'Red FEAT', feat: 'red' });
assert.equal(stuntStatus(1).key, 'yellow');
assert.equal(stuntStatus(3).key, 'yellow');
assert.equal(stuntStatus(4).key, 'green');
assert.equal(stuntStatus(9).key, 'green');
assert.equal(stuntStatus(10).key, 'mastered');
assert.equal(successesToMastery(7), 3);
assert.equal(successesToMastery(12), 0);

const power = { id: 'p1', name: 'Sonic Scream', system: { type: 'Sound Generation', rank: 'Incredible', value: 40 } };
const actor = {
  items: { get: id => (id === 'p1' ? power : undefined) },
  system: {
    stunts: [
      { name: 'Wide Band', parentPowerId: 'p1', parentPower: 'Old Name', rank: 'Good', value: 10, timesUsed: 2 },
      { name: 'Orphan', parentPowerId: 'gone', parentPower: 'Lost Power', rank: 'Excellent', value: 20, timesUsed: 10 },
      { name: 'Loose', rank: 'Typical', value: 6 },
    ],
  },
};
const rows = stuntRows(actor, s => (s.name === 'Wide Band' ? -1 : 0));
assert.equal(rows.length, 3);
assert.equal(rows[0].rank, 'Incredible', 'rank is read live from the parent power');
assert.equal(rows[0].value, 40);
assert.equal(rows[0].parentName, 'Sonic Scream', 'parent name is the live power name');
assert.equal(rows[0].shiftLabel, '-1CS (Remarkable)');
assert.equal(rows[0].statusLabel, 'Yellow FEAT');
assert.equal(rows[0].costLabel, '100 Karma');
assert.equal(rows[0].parentPowerId, 'p1');
assert.equal(rows[1].parentMissing, true);
assert.equal(rows[1].rank, 'Excellent', 'missing parent falls back to the stored rank');
assert.equal(rows[1].costLabel, 'No cost');
assert.equal(rows[1].mastered, true);
assert.equal(rows[2].parentName, '');
assert.equal(rows[2].successes, 0);
assert.equal(rows[2].index, 2);
assert.equal(stuntRow(actor, actor.system.stunts[0], 0).shiftLabel, '', 'no shift without a lookup');

const tab = readFileSync(new URL('../templates/parts/tab-stunts.hbs', import.meta.url), 'utf8');
assert.ok(tab.includes('{{#each stuntRows as |row|}}'));
assert.ok(tab.includes('>Successes</th>') && !tab.includes('Times Used'));
const sheet = readFileSync(new URL('../templates/power-sheet-v2.html', import.meta.url), 'utf8');
assert.ok(sheet.includes('class="ps2-add-btn create-stunt-from-power"'), 'power sheet has the Add stunt button');
const roller = readFileSync(new URL('../scripts/stunts.js', import.meta.url), 'utf8');
assert.ok(!roller.includes('Times Attempted'));
assert.ok(!roller.includes('const baseCost = 100;'));
const actorSheet = readFileSync(new URL('../scripts/actorSheet.js', import.meta.url), 'utf8');
assert.ok(!actorSheet.includes('async _rollStandaloneStunt(') && !actorSheet.includes('_getFeatColor(rankValue'));
assert.ok(actorSheet.includes('...stunt,'), 'edit keeps presetKey and mechanic');

console.log('stunt ledger tests passed');
