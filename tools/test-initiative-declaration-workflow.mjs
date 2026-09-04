// tools/test-initiative-declaration-workflow.mjs v2.1.0 - 2026-09-03
// Initiative modifier certification plus source-wiring assertions for the
// v3 two-state RAW workflow. Run from the repo root:
//   node tools/test-initiative-declaration-workflow.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getInitiativeModifier } from '../scripts/rules/rules-reference.js';
import { RAW_PHASES, normalizeRawPhase } from '../scripts/rules/raw-combat-state.js';

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

// Initiative modifier table (Advanced Set, keyed on Intuition rank number;
// the printed 75 overlap is treated as +5, see rules-reference.js).
for (const [value, expected] of [[0,0],[10,0],[11,1],[20,1],[21,2],[30,2],[31,3],[40,3],[41,4],[50,4],[51,5],[75,5],[76,6],[100,6],[150,6]]) {
  assert.equal(getInitiativeModifier(value), expected, `initiative modifier at ${value}`); n++;
}

// Two-state model.
ok(Object.keys(RAW_PHASES).length === 2, 'RAW state machine has exactly two states');
ok(normalizeRawPhase('preaction') === RAW_PHASES.ACTIONS, 'legacy preaction collapses onto actions');
ok(/static PHASE_DECLARE = "declare"/.test(initiative) && /static PHASE_ACTIONS = "actions"/.test(initiative), 'controller exposes the two states only');
ok(!/PHASE_PREACTION|ACTIONS_WINNER|ACTIONS_LOSER|canClosePreAction|_advanceFromPreAction/.test(initiative), 'no v2 phase machinery survives in the controller');

// RAW initiative wiring.
ok(/raw-combat-state\.js/.test(initiative), 'initiative controller imports the pure RAW state machine');
ok(/preMoveToken/.test(initiative) && /authorizeTokenMovement/.test(initiative), 'token movement is gated through preMoveToken and the RAW controller');
ok(/mshRawMovementBypass/.test(initiative), 'forced/admin movement has an explicit bypass hook');
ok(/authorizeRawAction/.test(dispatcher), 'action dispatcher delegates phase/declaration decisions to the RAW controller');
ok(/combatActionUsed/.test(dispatcher) && /markRawCombatActionUsed/.test(dispatcher), 'combat action is consumed after committed dispatch');
ok(attackFiles.every(src => /rawActionCancelled/.test(src)), 'all primary attack dialogs report cancellation so cancel does not spend the action');
ok(/_applyDefaultDeclarations/.test(initiative) && /defaulted: true/.test(initiative), 'undeclared combatants default to Attack at initiative');
ok(/_autoResolveMultiFeats/.test(initiative), 'Automatic Multiple Attacks FEATs resolve without dice');
ok(/requiredColor:\s*"Yellow"/.test(initiative), 'Change Action requires Yellow Agility');
ok(/system\.combatMods\.selfPenaltyCS"[^\n]*value:\s*"-1"/.test(initiative), 'successful Change Action creates the -1CS effect');
ok(/transient \? Number\(options\.columnShift \|\| 0\)/.test(ability) && /transient \? false/.test(ability), 'transient Pre-Action FEATs do not inherit remembered CS/skip-dice state');
ok(/selfPenaltyCS/.test(defense), 'defense FEATs apply actor self penalties');
ok(/combatId: gate\.combat\.id/.test(dispatcher) && /combatId: combatant\.parent\?\.id/.test(initiative), 'player combatant updates are scoped to the correct combat document');
ok(/combatId \? game\.combats\?\.get/.test(gmUtils), 'GM combatant-flag bridge resolves the requested combat');

// Round reset: one combat.update, round-scoped flags only, declarations kept.
const resetBlock = initiative.slice(initiative.indexOf('Hooks.on("combatRound"'), initiative.indexOf('Hooks.on("createCombatant"'));
ok(/"flags\.msh-faserip\.turnPhase": this\.PHASE_DECLARE/.test(resetBlock), 'round reset returns to Declaration inside the flag-clear update');
ok(!/_setPhase/.test(initiative), 'no separate phase write remains');
ok(/"flags\.msh-faserip\.preActionResolved": null/.test(resetBlock) && /"flags\.msh-faserip\.actionState": null/.test(resetBlock) && /"flags\.msh-faserip\.changeActionAttempted": null/.test(resetBlock), 'round reset clears round-scoped results');
ok(!/"flags\.msh-faserip\.declaredAction": null/.test(resetBlock), 'round reset preserves declarations for the next Initiative');
ok(/initiative:\s*null/.test(resetBlock) && /"flags\.msh-faserip\.goesFirst": null/.test(resetBlock), 'round reset clears tracker initiative and side-result flags');
ok(!/\.-=[A-Za-z]/.test(initiative), 'no deprecated "-=" flag deletions');

// Auto-roll entry points.
const startBlock = initiative.slice(initiative.indexOf('Hooks.on("combatStart"'), initiative.indexOf('Hooks.on("preMoveToken"'));
ok(!/useRawTurnPhases/.test(startBlock), 'round-1 auto-roll applies in every FASERIP mode, not only RAW phases');
ok(/autoRerollInitiative/.test(startBlock), 'round-1 auto-roll honours the Auto Reroll setting');

// Batched tracker writes.
ok(!/setInitiative\(/.test(initiative), 'no per-combatant setInitiative calls');
ok((initiative.match(/updateEmbeddedDocuments\("Combatant", initiativeOps\)/g) || []).length === 2, 'side and individual rolls each write initiative in one batched update');

// Side modifier rulings (2026-09-03).
ok(/_getSideInitiativeModifier\(/.test(initiative) && !/_getHighestIntuition|_getHighestTalentBonus/.test(initiative), 'side modifier is one character\'s own Int mod + own talent, side takes the max');
ok(/const total = intMod \+ talent\.bonus;/.test(initiative), 'per-character effective modifier sums own Intuition modifier and own talent bonus');
ok(!/\$\{source\} \(assumed\)/.test(initiative), 'legacy "+1 (assumed)" talent bonus is gone');
ok(/if \(!game\.settings\.get\("msh-faserip", "useRawTurnPhases"\)\) return \{ bonus: 0, source: "" \};/.test(initiative), 'talent bonuses require the declared context');
ok(/name\.includes\("enhanced sense"\) && this\._isHearingPower\(p\)/.test(initiative), 'Enhanced Senses substitutes for Intuition only for the hearing variant');
ok(/Tie — reroll/.test(initiative) && /setTimeout\(\(\) => this\.rollSideInitiative\(combat\), 1000\)/.test(initiative), 'side initiative ties re-roll');

console.log(`initiative/declaration workflow tests passed (${n} assertions)`);
