import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const actorSheet = fs.readFileSync(path.join(root, 'scripts', 'actorSheet.js'), 'utf8');
const actorSheetV2 = fs.readFileSync(path.join(root, 'scripts', 'actor-sheet-v2.js'), 'utf8');
const header = fs.readFileSync(path.join(root, 'templates', 'parts', 'header.hbs'), 'utf8');

assert(!actorSheet.includes('Update ${abilityLabel} value?'),
  'Core ability rank changes must not open the old verification dialog');
assert(actorSheet.includes("html.find(valueSelector).val(rankValueForStorage(rank));"),
  'Ability rank changes must synchronously write the standard rank number');
assert(actorSheet.includes("html.find(rankSelector).val(valueToRank(value));"),
  'Manual ability number changes must synchronously derive the printed rank');
assert(actorSheet.includes("element.disabled = true;"),
  'Sheet locking must disable controls against keyboard edits');
assert(actorSheet.includes("_bindCoreStatTabbing(html)"),
  'Legacy and adapted sheets must bind explicit core-stat Tab navigation');
assert(actorSheet.includes("_captureSheetFocus()"),
  'Legacy sheet must snapshot focus before submitOnChange re-render');
assert(actorSheetV2.includes("v1._captureSheetFocus.call(this._adapterThis(v1));"),
  'V2 sheet must snapshot focus before PART replacement');
assert(header.includes('type="hidden" name="system.attributes.resources.value"'),
  'Beyond Resources must retain a named document-safe value during form submit');

const requiredOrder = [
  'system.abilities.fighting.rank',
  'system.abilities.fighting.value',
  'system.abilities.agility.rank',
  'system.abilities.agility.value',
  'system.abilities.strength.rank',
  'system.abilities.strength.value',
  'system.abilities.endurance.rank',
  'system.abilities.endurance.value',
  'system.abilities.reason.rank',
  'system.abilities.reason.value',
  'system.abilities.intuition.rank',
  'system.abilities.intuition.value',
  'system.abilities.psyche.rank',
  'system.abilities.psyche.value',
  'system.attributes.health.value',
  'system.attributes.karma.value',
  'system.attributes.resources.rank',
  'system.attributes.resources.value',
  'system.attributes.popularity.hero.value',
  'system.attributes.popularity.secretId.value'
];
let last = -1;
for (const field of requiredOrder) {
  const index = actorSheet.indexOf(`"${field}"`);
  assert(index > last, `Core Tab order is missing or out of sequence: ${field}`);
  last = index;
}

console.log('Core stat editing regression checks passed.');
