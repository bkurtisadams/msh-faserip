import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getInitiativeModifier } from '../scripts/rules/rules-reference.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const initiative = read('scripts/faserip-initiative.js');
const dispatcher = read('scripts/modules/actions/action-dispatcher.js');
const ability = read('scripts/modules/actions/ability-feat-dialog.js');
const defense = read('scripts/modules/actions/defense-action.js');
const blunt = read('scripts/modules/actions/blunt-attack-action.js');
const edged = read('scripts/modules/actions/edged-attack-action.js');
const shooting = read('scripts/modules/actions/shooting-action.js');

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// RAW initiative modifier boundaries used by side initiative.
for (const [value, expected] of [[10,0],[11,1],[20,1],[21,2],[30,2],[31,3],[40,3],[41,4],[50,4],[51,5],[75,5],[76,6],[100,6]]) {
  assert.equal(getInitiativeModifier(value), expected, `initiative modifier at ${value}`); n++;
}

ok(/pcRoll\.total === 1 \? 1/.test(initiative) && /npcRoll\.total === 1 \? 1/.test(initiative), 'natural initiative 1 remains 1');
ok(/_isInitiativeEligible\(combatant\)/.test(initiative) && /hp <= 0/.test(initiative), 'initiative eligibility filters incapacitated actors');
ok(/requiredColor:\s*"Yellow"/.test(initiative), 'Change Action requires Yellow Agility');
ok(/system\.combatMods\.selfPenaltyCS"[^\n]*value:\s*"-1"/.test(initiative), 'successful Change Action creates -1CS effect');
ok(/changeActionAttempted/.test(initiative) && /already been attempted this round/.test(initiative), 'Change Action is locked after one attempt');
ok(/preActionResolved/.test(initiative) && /already been resolved this round/.test(initiative), 'required Pre-Action FEAT is locked after resolution');
ok(/decl\.type === "move" \|\| decl\.type === "charge"/.test(initiative), 'Move Only and Charge retain full movement');
ok(/hasDodgeEffect \? null : 0\.5/.test(initiative), 'Dodge declaration does not stack a second half-speed multiplier');
ok(/decl\.type === "evade"/.test(initiative) && /Pre-Action/.test(initiative), 'Evade is declaration-driven');
ok(/action:\s*"multiattack"/.test(initiative) && /intensity:\s*count === 3 \? "Amazing" : "Remarkable"/.test(initiative), '2/3 attacks create RM/AM Pre-Action requirements');
ok(/transient \? Number\(options\.columnShift \|\| 0\)/.test(ability) && /transient \? false/.test(ability), 'transient Pre-Action FEATs do not inherit remembered CS/skip-dice state');
ok(/selfPenaltyCS/.test(ability) && /totalColumnShift = columnShift \+ selfPenaltyCS/.test(ability), 'ability FEAT dialog applies actor self penalties');
ok(/selfPenaltyCS/.test(defense), 'defense FEATs apply actor self penalties');
ok(/rawPreAction/.test(dispatcher) && /Pre-Action Roll button in the combat tracker/.test(dispatcher), 'direct sheet defense cannot bypass the locked tracker Pre-Action roll');
ok(/initiativeMode === "foundry"/.test(dispatcher), 'Standard Foundry initiative is not trapped by RAW declaration gating');
ok(/Side-Based RAW/.test(dispatcher) && /side is not acting yet/.test(dispatcher), 'side-based RAW gate blocks the inactive side');
ok(/\["block", "defend", "evade"\]/.test(dispatcher) && /cannot make an attack this round/.test(dispatcher), 'Block/Evade prevent later attacks while Dodge remains distinct');
ok(/Multiple Attacks were not declared/.test(blunt) && /getDeclaredMultiAttackState/.test(blunt), 'blunt attacks consume tracker Multiple Attack declaration');
ok(/Multiple Attacks were not declared/.test(edged) && /getDeclaredMultiAttackState/.test(edged), 'edged attacks consume tracker Multiple Attack declaration');
ok(/Multiple Attacks were not declared/.test(shooting) && /getDeclaredMultiAttackState/.test(shooting), 'shooting consumes tracker Multiple Attack declaration');
const declarationFn = initiative.split('static async _showDeclarationDialog', 2)[1]?.split('static async _createChangeActionPenalty', 1)[0] || '';
ok(!/ChatMessage\.create/.test(declarationFn), 'declaration dialog does not post public chat messages');
ok(/faserip-declaration-chip private/.test(initiative), 'NPC declaration details have a private tracker presentation');
ok(/player declarations/.test(initiative) && /rollBtn\.disabled = !prog\.complete/.test(initiative), 'initiative waits for eligible player declarations by default');
ok(/sideMode \? this\.PHASE_ACTIONS_WINNER : this\.PHASE_ACTIONS/.test(initiative), 'individual initiative gets a generic action phase instead of side winner/loser phases');


ok(/static _trackedCombatants\(combat\)/.test(initiative) && /Array\.from\(combat\.turns \?\? \[\]\)/.test(initiative), 'declaration roster is scoped to Foundry combat.turns');
ok(/const all = this\._eligibleCombatants\(combat\)/.test(initiative), 'declaration progress derives only from tracked eligible combatants');
ok(/for \(const c of this\._trackedCombatants\(combat\)\)/.test(initiative), 'side initiative ignores stale/non-tracker combatant documents');
ok(/const trackedIds = new Set\(this\._trackedCombatants\(combat\)/.test(initiative), 'individual initiative ignores stale/non-tracker combatant documents');
ok(/_resolveCombatForCombatant\(combatantId\)/.test(initiative) && /ui\.combat\?\.viewed/.test(initiative), 'tracker controls resolve the viewed combat instead of blindly using game.combat');

console.log(`initiative/declaration workflow tests passed (${n} assertions)`);
