// tools/test-actor-sheet-submit.mjs v1.1.0 - 2026-11-11
// v1.1.0: The V1 sheet's _updateObject is gone; the V2 sheet is the only caller.
// Behaviour tests for scripts/actor-sheet-submit.js, the submit rules shared
// by the V1 and V2 actor sheets. Run: node tools/test-actor-sheet-submit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeActorSubmit } from '../scripts/actor-sheet-submit.js';
import { BEYOND_STORAGE_SENTINEL } from '../scripts/rules/rules-reference.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const warn = console.warn; console.warn = () => {};
let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const actor = (over = {}) => ({ system: {
  abilities: { fighting: { rank: 'Remarkable', value: 30 }, strength: { rank: 'Good', value: 10 } },
  attributes: { resources: { rank: 'Typical', value: 6 } },
  ...over
} });
const F = 'system.abilities.fighting';
const R = 'system.attributes.resources';

eq(normalizeActorSubmit(actor(), `${F}.rank`, { [`${F}.rank`]: 'Incredible', [`${F}.value`]: 30 }),
  { [`${F}.rank`]: 'Incredible', [`${F}.value`]: 40 }, 'a rank change writes the standard rank number');
eq(normalizeActorSubmit(actor(), `${F}.value`, { [`${F}.rank`]: 'Remarkable', [`${F}.value`]: 36 }),
  { [`${F}.rank`]: 'Incredible', [`${F}.value`]: 36 }, 'a number change keeps the number and derives the rank (36 is Incredible)');
eq(normalizeActorSubmit(actor(), `${F}.value`, { [`${F}.value`]: -5 })[`${F}.value`], 0, 'a negative number floors at 0');
eq(normalizeActorSubmit(actor(), `${F}.rank`, { [`${F}.rank`]: 'Beyond' })[`${F}.value`], BEYOND_STORAGE_SENTINEL, 'Beyond stores the document-safe sentinel');
eq(normalizeActorSubmit(actor(), 'name', { name: 'X', [`${F}.rank`]: 'Remarkable', [`${F}.value`]: 30 }),
  { name: 'X', [`${F}.rank`]: 'Remarkable', [`${F}.value`]: 30 }, 'an unrelated edit leaves abilities alone');

eq(normalizeActorSubmit(actor(), `${R}.rank`, { [`${R}.rank`]: 'Excellent', [`${R}.value`]: 6 }),
  { [`${R}.rank`]: 'Excellent', [`${R}.value`]: 20 }, 'a Resources rank change writes its number');
eq(normalizeActorSubmit(actor(), `${R}.value`, { [`${R}.rank`]: 'Typical', [`${R}.value`]: 12 }),
  { [`${R}.rank`]: 'Good', [`${R}.value`]: 12 }, 'a Resources number change derives its rank');
eq(normalizeActorSubmit(actor(), 'name', { name: 'X', [`${R}.rank`]: 'Good', [`${R}.value`]: 6 }),
  { name: 'X', [`${R}.rank`]: 'Good', [`${R}.value`]: 10 }, 'a stale Resources number never races a changed rank');

const shifted = actor({ combatMods: { abilityShifts: { fighting: -2 } } });
eq(normalizeActorSubmit(shifted, 'name', { name: 'X', [`${F}.rank`]: 'Good', [`${F}.value`]: 10 }),
  { name: 'X' }, 'an effect-shifted display rank and number (Rm at -2CS shows Gd 10) are not saved');
eq(normalizeActorSubmit(shifted, 'name', { name: 'X', [`${F}.rank`]: 'Remarkable', [`${F}.value`]: 30 }),
  { name: 'X', [`${F}.rank`]: 'Remarkable', [`${F}.value`]: 30 }, 'the real stored rank passes through while shifted');
eq(normalizeActorSubmit(shifted, 'name', { name: 'X', [`${F}.value`]: 27 }),
  { name: 'X', [`${F}.value`]: 27 }, 'a custom number that is not the shifted display value passes through');

const legacy = fs.readFileSync(path.join(root, 'scripts', 'actorSheet.js'), 'utf8');
const v2 = fs.readFileSync(path.join(root, 'scripts', 'actor-sheet-v2.js'), 'utf8');
assert(!/extends\s+foundry\.appv1/.test(legacy) && !legacy.includes('_updateObject('), 'the legacy sheet class has left the V1 framework and has no submit path of its own'); n++;
assert(/_processSubmitData\(event, form, submitData, options = \{\}\)[\s\S]{0,300}normalizeActorSubmit\(this\.actor, changedField, flat\)/.test(v2), 'V2 sheet applies the shared submit rules'); n++;
assert(v2.includes('v1._teardownSheetHooks.call(this._adapterThis(v1))'), 'V2 close runs the V1 teardown'); n++;

console.warn = warn;
console.log(`actor sheet submit tests passed (${n} assertions)`);
