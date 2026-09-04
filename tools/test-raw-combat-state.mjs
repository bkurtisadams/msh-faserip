// tools/test-raw-combat-state.mjs v2.1.0 - 2026-09-03
// Pure-node tests for scripts/rules/raw-combat-state.js (two-state model).
// Run from the repo root: node tools/test-raw-combat-state.mjs
import assert from 'node:assert/strict';
import {
  RAW_PHASES,
  normalizeRawPhase,
  authorizeRawAction,
  authorizeRawMovement,
  getPreActionRequirement,
  isPreActionResolved,
  isDefenseRequirement,
  defensePending,
  canChangeAction,
  isCombatantReady,
  readinessSummary
} from '../scripts/rules/raw-combat-state.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`✓ ${name}`); };
const base = {
  round: 4,
  declaration: { type: 'attack', label: 'Attack' }, preActionResolved: null,
  actionState: null, actorName: 'Hero'
};
const act = (over) => authorizeRawAction({ ...base, phase: RAW_PHASES.ACTIONS, ...over });

// Phase normalization
test('stored two-state values pass through', () => {
  assert.equal(normalizeRawPhase('declare'), RAW_PHASES.DECLARE);
  assert.equal(normalizeRawPhase('actions'), RAW_PHASES.ACTIONS);
});
test('legacy v2 phase values collapse onto actions', () => {
  for (const legacy of ['preaction', 'actions-winner', 'actions-loser']) assert.equal(normalizeRawPhase(legacy), RAW_PHASES.ACTIONS);
});
test('absent phase (round 1, flag unset) is declaration', () => assert.equal(normalizeRawPhase(undefined), RAW_PHASES.DECLARE));

// Declaration gate
test('Declaration blocks attacks', () => assert.equal(authorizeRawAction({ ...base, phase: RAW_PHASES.DECLARE, actionType: 'blunt-attack' }).ok, false));
test('Declaration blocks movement', () => assert.equal(authorizeRawMovement({ ...base, phase: RAW_PHASES.DECLARE }).ok, false));
test('Non-voluntary actions are never gated', () => assert.equal(authorizeRawAction({ ...base, phase: RAW_PHASES.DECLARE, actionType: 'death-save' }).ok, true));

// Default declaration
test('Missing declaration defaults to Attack and permits an attack', () => assert.equal(act({ declaration: null, actionType: 'blunt-attack' }).ok, true));
test('Missing declaration permits movement', () => assert.equal(authorizeRawMovement({ phase: RAW_PHASES.ACTIONS, declaration: null }).ok, true));

// Actions state: attack path
test('Declared Attack permits one attack and consumes it', () => {
  const v = act({ actionType: 'blunt-attack' });
  assert.equal(v.ok, true); assert.equal(v.consumesCombatAction, true);
});
test('Used combat action blocks a second attack', () => assert.equal(act({ actionType: 'blunt-attack', actionState: { round: 4, combatActionUsed: true } }).ok, false));
test('Stale prior-round actionState does not block', () => assert.equal(act({ actionType: 'blunt-attack', actionState: { round: 3, combatActionUsed: true } }).ok, true));
test('Declared Charge requires the Charging action', () => {
  assert.equal(act({ declaration: { type: 'charge', label: 'Charge' }, actionType: 'blunt-attack' }).ok, false);
  assert.equal(act({ declaration: { type: 'charge', label: 'Charge' }, actionType: 'charging' }).ok, true);
});
test('Charging without a declared Charge is refused', () => assert.equal(act({ actionType: 'charging' }).ok, false));
test('Move Only / Other cannot attack', () => {
  assert.equal(act({ declaration: { type: 'move', label: 'Move Only' }, actionType: 'blunt-attack' }).ok, false);
  assert.equal(act({ declaration: { type: 'other', label: 'Other' }, actionType: 'shooting' }).ok, false);
});
test('Block / Evade cannot attack', () => {
  assert.equal(act({ declaration: { type: 'block', label: 'Block' }, actionType: 'blunt-attack' }).ok, false);
  assert.equal(act({ declaration: { type: 'evade', label: 'Evade' }, actionType: 'blunt-attack' }).ok, false);
});
test('Block forbids movement; Dodge permits it', () => {
  assert.equal(authorizeRawMovement({ phase: RAW_PHASES.ACTIONS, declaration: { type: 'block' } }).ok, false);
  assert.equal(authorizeRawMovement({ phase: RAW_PHASES.ACTIONS, declaration: { type: 'dodge' } }).ok, true);
});

// Pre-Action requirements (per-character gates)
test('Dodge/Block/Evade/Multi map to their FEAT abilities', () => {
  assert.deepEqual(getPreActionRequirement({ type: 'dodge' }), { action: 'dodging', ability: 'agility', label: 'Dodge' });
  assert.deepEqual(getPreActionRequirement({ type: 'block' }), { action: 'blocking', ability: 'strength', label: 'Block' });
  assert.deepEqual(getPreActionRequirement({ type: 'evade' }), { action: 'evading', ability: 'fighting', label: 'Evade' });
  assert.equal(getPreActionRequirement({ type: 'multi', attackCount: 3 }).intensity, 'Amazing');
  assert.equal(getPreActionRequirement({ type: 'multi' }).intensity, 'Remarkable');
  assert.equal(getPreActionRequirement({ type: 'attack' }), null);
});
test('Declared defence must roll from the tracker (rawPreAction) then locks', () => {
  const decl = { type: 'dodge', label: 'Dodge' };
  assert.equal(act({ declaration: decl, actionType: 'dodging' }).ok, false);
  assert.equal(act({ declaration: decl, actionType: 'dodging', rawPreAction: true }).ok, true);
  assert.equal(act({ declaration: decl, actionType: 'dodging', rawPreAction: true, preActionResolved: { round: 4, action: 'dodging' } }).ok, false);
});
test('Undeclared defence is refused', () => assert.equal(act({ actionType: 'blocking', rawPreAction: true }).ok, false));
test('Declared Multi blocks attacks until the FEAT is resolved', () => {
  const decl = { type: 'multi', attackCount: 2, label: '2 Attacks' };
  assert.equal(act({ declaration: decl, actionType: 'blunt-attack' }).ok, false);
  assert.equal(act({ declaration: decl, actionType: 'blunt-attack', preActionResolved: { round: 4, action: 'multiattack' } }).ok, true);
});
test('Multi applies to Slugfest and Shooting only', () => {
  const resolved = { round: 4, action: 'multiattack' };
  const decl = { type: 'multi', attackCount: 2, label: '2 Attacks' };
  assert.equal(act({ declaration: decl, preActionResolved: resolved, actionType: 'shooting' }).ok, true);
  assert.equal(act({ declaration: decl, preActionResolved: resolved, actionType: 'energy' }).ok, false);
});
test('isPreActionResolved is round-scoped', () => {
  const decl = { type: 'evade' };
  assert.equal(isPreActionResolved({ declaration: decl, preActionResolved: { round: 4, action: 'evading' }, round: 4 }), true);
  assert.equal(isPreActionResolved({ declaration: decl, preActionResolved: { round: 3, action: 'evading' }, round: 4 }), false);
  assert.equal(isPreActionResolved({ declaration: { type: 'attack' }, preActionResolved: null, round: 4 }), true);
});

// Rulings 2026-09-03
test('Declared defences are defence requirements; Multi is not', () => {
  assert.equal(isDefenseRequirement(getPreActionRequirement({ type: 'dodge' })), true);
  assert.equal(isDefenseRequirement(getPreActionRequirement({ type: 'block' })), true);
  assert.equal(isDefenseRequirement(getPreActionRequirement({ type: 'evade' })), true);
  assert.equal(isDefenseRequirement(getPreActionRequirement({ type: 'multi' })), false);
  assert.equal(isDefenseRequirement(null), false);
});
test('A target with an unrolled declared Dodge blocks attacks until rolled', () => {
  assert.equal(defensePending({ declaration: { type: 'dodge' }, preActionResolved: null, round: 4 }), true);
  assert.equal(defensePending({ declaration: { type: 'dodge' }, preActionResolved: { round: 4, action: 'dodging' }, round: 4 }), false);
  assert.equal(defensePending({ declaration: { type: 'dodge' }, preActionResolved: { round: 3, action: 'dodging' }, round: 4 }), true);
});
test('An unrolled Multi on the target never delays the attacker', () => assert.equal(defensePending({ declaration: { type: 'multi' }, preActionResolved: null, round: 4 }), false));
test('Default Attack target is never pending', () => assert.equal(defensePending({ declaration: null, preActionResolved: null, round: 4 }), false));

const cca = (over) => canChangeAction({ phase: RAW_PHASES.ACTIONS, round: 4, actorName: 'Hero', ...over });
test('Change Action is open after initiative before anyone acts', () => assert.equal(cca({}).ok, true));
test('Change Action is closed during Declaration', () => assert.equal(cca({ phase: RAW_PHASES.DECLARE }).ok, false));
test('Change Action closes once any combatant has acted this round', () => assert.equal(cca({ actionsBegun: true }).ok, false));
test('Change Action is once per round', () => assert.equal(cca({ changeActionAttempted: { round: 4 } }).ok, false));
test('Change Action is closed after own FEAT resolved or own action used', () => {
  assert.equal(cca({ preActionResolved: { round: 4, action: 'dodging' } }).ok, false);
  assert.equal(cca({ actionState: { round: 4, combatActionUsed: true } }).ok, false);
});
test('Prior-round attempts and states do not lock Change Action', () => assert.equal(cca({ changeActionAttempted: { round: 3 }, preActionResolved: { round: 3 }, actionState: { round: 3, combatActionUsed: true } }).ok, true));

test('Ready flag or a fresh non-default declaration makes a combatant ready', () => {
  assert.equal(isCombatantReady({ ready: { round: 4 }, declaration: null, round: 4 }), true);
  assert.equal(isCombatantReady({ ready: { round: 3 }, declaration: null, round: 4 }), false);
  assert.equal(isCombatantReady({ ready: null, declaration: { type: 'dodge', round: 4 }, round: 4 }), true);
  assert.equal(isCombatantReady({ ready: null, declaration: { type: 'dodge', round: 3 }, round: 4 }), false);
  assert.equal(isCombatantReady({ ready: null, declaration: { type: 'attack', round: 4, defaulted: true }, round: 4 }), false);
});
test('Readiness counts player-owned combatants only; NPCs never block', () => {
  const r = readinessSummary([
    { name: 'A', playerOwned: true, ready: { round: 4 } },
    { name: 'B', playerOwned: true, ready: null, declaration: { type: 'attack', round: 3 } },
    { name: 'Thug', playerOwned: false, ready: null }
  ], 4);
  assert.equal(r.total, 2); assert.equal(r.ready, 1); assert.equal(r.allReady, false);
  assert.deepEqual(r.missing.map(e => e.name), ['B']);
});
test('All players ready → allReady; no players → never allReady (Judge rolls)', () => {
  assert.equal(readinessSummary([{ playerOwned: true, ready: { round: 4 } }], 4).allReady, true);
  assert.equal(readinessSummary([{ playerOwned: false }], 4).allReady, false);
  assert.equal(readinessSummary([], 4).allReady, false);
});

console.log(`raw-combat-state tests passed (${passed})`);
