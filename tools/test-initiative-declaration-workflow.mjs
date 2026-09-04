// tools/test-initiative-declaration-workflow.mjs v3.0.0 - 2026-09-04
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
ok(/requiredColor: CHANGE_ACTION\.requiredColor/.test(initiative) && /showAbilityFeatDialog\(actor, CHANGE_ACTION\.ability/.test(initiative), 'Change Action ability and colour come from the kernel CHANGE_ACTION');
ok(/system\.combatMods\.selfPenaltyCS"[^\n]*value: String\(CHANGE_ACTION\.penaltyCS\)/.test(initiative), 'successful Change Action applies the kernel penaltyCS');
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
ok(/autoRerollInitiative/.test(startBlock) && /rollSideInitiative\(combat\)/.test(startBlock), 'legacy modes auto-roll round 1 on combatStart');
ok(/useRawTurnPhases"\)\) \{ ui\.combat\?\.render\(true\); return; \}/.test(startBlock), 'RAW mode opens round 1 in Declare instead of auto-rolling');
const rawResetBlock = resetBlock.slice(resetBlock.indexOf('if (rawPhases) {'), resetBlock.indexOf('return;\n      }') );
ok(!/autoRerollInitiative|rollSideInitiative/.test(rawResetBlock), 'RAW round reset never auto-rolls (declaring is free before the roll)');
ok(/"flags\.msh-faserip\.ready": null/.test(resetBlock), 'round reset clears Ready flags');

// Batched tracker writes.
ok(!/setInitiative\(/.test(initiative), 'no per-combatant setInitiative calls');
ok((initiative.match(/updateEmbeddedDocuments\("Combatant", initiativeOps\)/g) || []).length === 2, 'side and individual rolls each write initiative in one batched update');

// Side modifier rulings (2026-09-03).
ok(/sideInitiativeModifier\(combatants\.map\(c => this\._initiativeFacts\(c\)\)\)/.test(initiative) && !/_getHighestIntuition|_getHighestTalentBonus/.test(initiative), 'side modifier comes from the kernel sideInitiativeModifier over character facts');
ok(/resolveSideInitiative\(\{/.test(initiative) && !/roll\.total === 1 \? 1/.test(initiative) && /initiativeTotal\(roll\.total, intMod \+ talent\.bonus\)/.test(initiative), 'natural 1, totals and tie come from the kernel');
ok(!/\$\{source\} \(assumed\)/.test(initiative), 'legacy "+1 (assumed)" talent bonus is gone');
ok(/facts\.context = \{ unarmed: q\.unarmed === true, specialtyWeapon: q\.weaponSpecialist === true \};/.test(initiative) && /if \(game\.settings\.get\("msh-faserip", "useRawTurnPhases"\)\) \{/.test(initiative), 'declared context is supplied to the kernel only with RAW Turn Sequence on');
ok(/name\.includes\("enhanced sense"\) && this\._isHearingPower\(p\)/.test(initiative), 'Enhanced Senses substitutes for Intuition only for the hearing variant');
ok(/if \(resolved\.reroll\) \{/.test(initiative) && /setTimeout\(\(\) => this\.rollSideInitiative\(combat\), 1000\)/.test(initiative), 'side initiative ties re-roll');
ok(/from "\.\.\/lib\/faserip-rules\/faserip-initiative\.js"/.test(read('scripts/rules/rules-reference.js')) && /return initiativeModifier\(intuitionValue\);/.test(read('scripts/rules/rules-reference.js')), 'rules-reference getInitiativeModifier delegates to the kernel');

// RAW workflow rulings (2026-09-03): defences resolve before attacks,
// Change Action is pre-action only, Ready-driven Declare window.
const dispatcherSrc = dispatcher;
const defenseSrc = defense;
ok(/defensePending\(/.test(dispatcherSrc) && /RAW_ATTACK_TYPES\.has\(type\)/.test(dispatcherSrc), 'dispatcher refuses attacks while a target\'s declared defence is unrolled');
ok(/this\.opts\.autoRoll\s*\?\s*\{ shift: savedShift, karma: 0, spendKarma: false/.test(defenseSrc), 'DefenseAction has a no-dialog, no-Karma auto-roll path');
ok(/_autoResolveDefenseFeats/.test(initiative) && /autoRoll: true,\s*shift: Number\(decl\.shift\) \|\| 0/.test(initiative), 'declared defences auto-roll at initiative with the saved CS');
ok((initiative.match(/_autoResolveDeclaredFeats\(combat\)/g) || []).length >= 4 && (initiative.match(/await this\._autoResolveMultiFeats\(combat\)/g) || []).length === 1, 'every resolution point runs Multi and defence auto-rolls together');
ok(/canChangeAction\(/.test(initiative) && /actionsBegun: this\._actionsBegun\(combat\)/.test(initiative), 'Change Action availability comes from the pure rule incl. actions-begun lock');
ok(/Hooks\.on\("updateCombatant"/.test(initiative) && /rawAutoRollWhenReady/.test(initiative) && /readinessSummary/.test(initiative), 'Ready flags close the Declare window on the GM client');
ok(/data-action="ready"/.test(initiative) && /action === "ready"/.test(initiative), 'players have a Ready control on their tracker row');
ok(/_postJudgeEvent/.test(initiative) && /Pre-Action Event/.test(initiative), 'Judge Event button posts a pre-action event card');
ok(/this\.isRolling = true;\s*const rawPhases/.test(initiative), 'side roll claims isRolling before awaiting default declarations');
ok(/lastDefenseAutoRoll/.test(initiative) && /lastDefenseShift/.test(initiative), 'defence CS / auto-roll remembered per actor');

// Settings pass (2026-09-03): retired settings must not be registered or read.
const allSrc = [initiative, dispatcher, gmUtils, ability, defense, ...attackFiles,
  read('scripts/init.js'), read('scripts/gm-tools.js'),
  read('scripts/modules/effects/ongoing-engine.js'), read('scripts/modules/effects/effect-engine.js'),
  read('scripts/modules/effects/poison-engine.js'), read('scripts/dev/runtime-regression-tests.js')].join('\n');
for (const key of ['useTalentInitBonuses', 'showPhaseReminder', 'autoLogCombat', 'combatLogs', 'turnSeconds']) {
  ok(!new RegExp(`["']${key}["']`).test(allSrc), `retired setting ${key} is neither registered nor read`);
}
ok(/export const TURN_SECONDS = 6;/.test(read('scripts/modules/recovery-timing.js')), 'turn length is the RAW six-second constant');
ok(/name: "RAW Turn Sequence \(Declare → Initiative → Actions\)"/.test(initiative), 'RAW master switch is labelled as the turn sequence');
ok(/"Auto-Roll Initiative Each Round \(non-RAW\)"/.test(initiative) && /"Roll Initiative When Players Are Ready \(RAW\)"/.test(initiative), 'auto-roll settings name their mode');

// Swap Side (2026-09-03).
const panel = read('scripts/combat-panel.js');
ok(/static async swapSide\(/.test(initiative) && /"flags\.msh-faserip\.sideOverride": newSide/.test(initiative), 'Swap Side persists a sideOverride flag');
ok(/const correct = this\._resolveSide\(c\);/.test(initiative) && /getFlag\("msh-faserip", "sideOverride"\) \?\? this\._determineSide/.test(initiative), '_ensureSideFlags honours the override over actor type / disposition');
ok(/getCombatantContextOptions/.test(initiative) && /getCombatTrackerEntryContext/.test(initiative), 'context entries registered for v12 and v13+ trackers');
ok(/FaseripInitiative\.swapSide\(combatant\)/.test(panel) && /clearSideOverride\(combatant\)/.test(panel), 'combat panel menu routes through the same swap/reset');
ok(/update\.initiative = newSide === "pc" \? data\.pcInit : data\.npcInit;/.test(initiative), 'mid-round swap takes the new side\'s initiative total');

console.log(`initiative/declaration workflow tests passed (${n} assertions)`);
