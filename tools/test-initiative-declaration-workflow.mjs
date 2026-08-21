import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getInitiativeModifier } from '../scripts/rules/rules-reference.js';
import { authorizeRawAction, authorizeRawMovement, RAW_PHASES, canClosePreAction } from '../scripts/rules/raw-combat-state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const initiative = read('scripts/faserip-initiative.js');
const dispatcher = read('scripts/modules/actions/action-dispatcher.js');
const gmUtils = read('scripts/gm-utils.js');
const ability = read('scripts/modules/actions/ability-feat-dialog.js');
const defense = read('scripts/modules/actions/defense-action.js');
const attackFiles = [
  'blunt-attack-action.js','edged-attack-action.js','shooting-action.js','throwing-edged-action.js',
  'throwing-blunt-action.js','energy-action.js','force-action.js','mental-power-action.js','grenade-action.js',
  'grappling-action.js','grabbing-action.js','charging-action.js'
].map(f => read(`scripts/modules/actions/${f}`));

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

for (const [value, expected] of [[10,0],[11,1],[20,1],[21,2],[30,2],[31,3],[40,3],[41,4],[50,4],[51,5],[75,5],[76,6],[100,6]]) {
  assert.equal(getInitiativeModifier(value), expected, `initiative modifier at ${value}`); n++;
}

// Behavior-level smoke assertions using the pure state machine.
const base = { initiativeMode:'side', side:'pc', goesFirst:'pc', round:2, declaration:{type:'attack',label:'Attack'}, actorName:'Hero' };
assert.equal(authorizeRawAction({ ...base, phase:RAW_PHASES.PREACTION, actionType:'blunt-attack' }).ok, false); n++;
assert.equal(authorizeRawAction({ ...base, phase:RAW_PHASES.ACTIONS_WINNER, actionType:'blunt-attack' }).ok, true); n++;
assert.equal(authorizeRawAction({ ...base, phase:RAW_PHASES.ACTIONS_WINNER, actionType:'blunt-attack', actionState:{round:2,combatActionUsed:true} }).ok, false); n++;
assert.equal(authorizeRawMovement({ ...base, phase:RAW_PHASES.PREACTION }).ok, false); n++;
assert.equal(authorizeRawMovement({ ...base, phase:RAW_PHASES.ACTIONS_WINNER }).ok, true); n++;
assert.equal(canClosePreAction({ phase:RAW_PHASES.PREACTION, pendingCount:0, initiativeMode:'side', goesFirst:'pc' }).ok, true); n++;
assert.equal(canClosePreAction({ phase:RAW_PHASES.PREACTION, pendingCount:2, initiativeMode:'side', goesFirst:'pc' }).ok, false); n++;

// Integration wiring.
ok(/raw-combat-state\.js/.test(initiative), 'initiative controller imports the pure RAW state machine');
ok(/preMoveToken/.test(initiative) && /authorizeTokenMovement/.test(initiative), 'token movement is phase-gated through Foundry v14 preMoveToken and the RAW controller');
ok(/mshRawMovementBypass/.test(initiative), 'forced/admin movement has an explicit bypass hook');
ok(/authorizeRawAction/.test(dispatcher), 'action dispatcher delegates phase/declaration decisions to the RAW controller');
ok(!/setCombatPhase/.test(dispatcher), 'actions cannot implicitly close Pre-Action');
ok(!/setCombatPhase/.test(gmUtils), 'obsolete player-to-GM implicit Pre-Action bridge is removed');
ok(/combatActionUsed/.test(dispatcher) && /markRawCombatActionUsed/.test(dispatcher), 'combat action is consumed after committed dispatch');
ok(attackFiles.every(src => /rawActionCancelled/.test(src)), 'all primary attack dialogs report cancellation so cancel does not spend the action');
ok(/actionState/.test(initiative) && /"actionState"/.test(initiative), 'round reset clears action-consumption state');
ok(/for \(const flag of \["preActionResolved", "changeActionAttempted", "actionState"\]\)/.test(initiative), 'round reset clears only round-scoped results');
ok(!/for \(const flag of \["declaredAction", "preActionResolved"/.test(initiative), 'round reset preserves unchanged declarations for the next Initiative');
ok(/declaredAction = \{ \.\.\.choice, label: meta\.label, round: combat\.round \}/.test(initiative), 'new declarations are stamped with the round for carried-plan UI');
ok(/initiative:\s*null/.test(initiative) && /-=goesFirst/.test(initiative), 'new RAW round clears prior tracker initiative and side-result flags');
ok(/_findFirstWinnerTurn/.test(initiative) && /_isInitiativeEligible\(x\.c\)/.test(initiative), 'winner cursor calculation ignores KO/ineligible stale initiative rows');
ok(/if \(rawPhases\) \{\s*await this\._setPhase\(combat, this\.PHASE_PREACTION\);\s*\} else/s.test(initiative), 'RAW initiative enters Pre-Action without positioning the action cursor');
ok(/btn\.disabled = pending\.length > 0/.test(initiative), 'GM Begin Actions waits for required Pre-Action FEATs');
ok(/_advanceFromPreAction/.test(initiative) && /canClosePreAction/.test(initiative), 'GM Begin Actions uses explicit validated Pre-Action close logic');
ok(/One atomic document update is important here/.test(initiative) && /flags\.msh-faserip\.turnPhase/.test(initiative), 'phase close and cursor positioning are written atomically');
ok(/btn\.type = "button"/.test(initiative), 'phase buttons are explicit non-submit buttons in the live tracker');
ok(!/GM override: advance with unresolved Pre-Action FEATs/.test(initiative), 'Pre-Action has no skip-required-roll force button');
ok(/Required rolls complete · Change Action\/Judge window remains open/.test(initiative), 'empty Pre-Action remains an explicit GM-controlled window');
ok(/_showNpcPlanDialog/.test(initiative) && /Private NPC Plans/.test(initiative), 'GM has private bulk NPC planning');
ok(/rollBtn\.disabled = !prog\.allComplete/.test(initiative), 'initiative waits for all eligible tracker combatants by default');
ok(/Undeclared combatants cannot take voluntary actions this round/.test(initiative), 'GM force-roll override states the undeclared-action consequence');
ok(/requiredColor:\s*"Yellow"/.test(initiative), 'Change Action still requires Yellow Agility');
ok(/system\.combatMods\.selfPenaltyCS"[^\n]*value:\s*"-1"/.test(initiative), 'successful Change Action still creates -1CS effect');
ok(/transient \? Number\(options\.columnShift \|\| 0\)/.test(ability) && /transient \? false/.test(ability), 'transient Pre-Action FEATs do not inherit remembered CS/skip-dice state');
ok(/selfPenaltyCS/.test(defense), 'defense FEATs continue to apply actor self penalties');
ok(/combatId: gate\.combat\.id/.test(dispatcher) && /combatId: combatant\.parent\?\.id/.test(initiative), 'player combatant updates are scoped to the correct combat document');
ok(/combatId \? game\.combats\?\.get/.test(gmUtils), 'GM combatant-flag bridge resolves the requested combat');

console.log(`initiative/declaration workflow tests passed (${n} assertions)`);
