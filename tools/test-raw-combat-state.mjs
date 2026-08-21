import assert from 'node:assert/strict';
import {
  RAW_PHASES,
  authorizeRawAction,
  authorizeRawMovement,
  getPreActionRequirement,
  getActiveSide,
  isPreActionResolved,
  canClosePreAction
} from '../scripts/rules/raw-combat-state.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`✓ ${name}`); };
const base = {
  initiativeMode: 'side', side: 'pc', goesFirst: 'pc', round: 4,
  declaration: { type: 'attack', label: 'Attack' }, preActionResolved: null,
  actionState: null, actorName: 'Hero'
};

// Explicit Pre-Action close authorization
test('Pre-Action can close when required rolls are complete and a side winner exists', () => assert.equal(canClosePreAction({ phase: RAW_PHASES.PREACTION, pendingCount: 0, initiativeMode: 'side', goesFirst: 'pc' }).ok, true));
test('Pre-Action cannot close with a required roll pending', () => assert.equal(canClosePreAction({ phase: RAW_PHASES.PREACTION, pendingCount: 1, initiativeMode: 'side', goesFirst: 'pc' }).ok, false));
test('Pre-Action cannot close without a recorded side initiative winner', () => assert.equal(canClosePreAction({ phase: RAW_PHASES.PREACTION, pendingCount: 0, initiativeMode: 'side', goesFirst: null }).ok, false));
test('Declaration phase cannot masquerade as Pre-Action close', () => assert.equal(canClosePreAction({ phase: RAW_PHASES.DECLARE, pendingCount: 0, initiativeMode: 'side', goesFirst: 'pc' }).ok, false));

// Phase order / attack authorization
test('Declaration blocks attacks', () => assert.equal(authorizeRawAction({ ...base, phase: RAW_PHASES.DECLARE, actionType: 'blunt-attack' }).ok, false));
test('Pre-Action never auto-closes on attack', () => assert.match(authorizeRawAction({ ...base, phase: RAW_PHASES.PREACTION, actionType: 'blunt-attack' }).message, /GM must click Begin Actions/));
test('Winner phase allows winning-side declared attack', () => assert.equal(authorizeRawAction({ ...base, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, true));
test('Winner phase blocks losing side', () => assert.equal(authorizeRawAction({ ...base, side: 'npc', phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));
test('Loser phase allows losing side', () => assert.equal(authorizeRawAction({ ...base, side: 'npc', phase: RAW_PHASES.ACTIONS_LOSER, actionType: 'blunt-attack' }).ok, true));
test('Loser phase blocks winner side', () => assert.equal(authorizeRawAction({ ...base, phase: RAW_PHASES.ACTIONS_LOSER, actionType: 'blunt-attack' }).ok, false));

// Declaration compatibility
test('Move Only cannot turn into attack for free', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'move', label: 'Move Only' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));
test('Other cannot turn into attack for free', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'other', label: 'Other' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'energy' }).ok, false));
test('Charge declaration only permits Charging attack', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'charge', label: 'Charge' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));
test('Charge attack requires Charge declaration', () => assert.equal(authorizeRawAction({ ...base, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'charging' }).ok, false));
test('Declared Charge permits Charging action', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'charge', label: 'Charge' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'charging' }).ok, true));
test('Block prohibits attack', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'block', label: 'Block' }, preActionResolved: { round: 4, action: 'blocking' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));
test('Evade prohibits attack', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'evade', label: 'Evade' }, preActionResolved: { round: 4, action: 'evading' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));
test('Dodge permits one later attack after Pre-Action', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'dodge', label: 'Dodge' }, preActionResolved: { round: 4, action: 'dodging' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, true));

// Action consumption
test('Second ordinary attack is blocked after action consumed', () => assert.equal(authorizeRawAction({ ...base, actionState: { round: 4, combatActionUsed: true }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));
test('Old-round action-use flag does not block', () => assert.equal(authorizeRawAction({ ...base, actionState: { round: 3, combatActionUsed: true }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, true));
test('Successful Multiple Attacks declaration permits Slugfest', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'multi', attackCount: 2 }, preActionResolved: { round: 4, action: 'multiattack', success: true }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, true));
test('Multiple Attacks cannot be used for Energy attack', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'multi', attackCount: 2 }, preActionResolved: { round: 4, action: 'multiattack', success: true }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'energy' }).ok, false));
test('Required Pre-Action result from wrong round does not count', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'dodge' }, preActionResolved: { round: 3, action: 'dodging' }, phase: RAW_PHASES.ACTIONS_WINNER, actionType: 'blunt-attack' }).ok, false));

// Pre-Action defense routing
test('Declared Dodge can resolve only via raw Pre-Action dispatch', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'dodge' }, phase: RAW_PHASES.PREACTION, actionType: 'dodging', rawPreAction: true }).ok, true));
test('Sheet Dodge reroll is blocked during Pre-Action', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'dodge' }, phase: RAW_PHASES.PREACTION, actionType: 'dodging', rawPreAction: false }).ok, false));
test('Undeclared Evade cannot be substituted for Dodge', () => assert.equal(authorizeRawAction({ ...base, declaration: { type: 'dodge' }, phase: RAW_PHASES.PREACTION, actionType: 'evading', rawPreAction: true }).ok, false));

// Movement traffic cop
test('Declaration blocks movement', () => assert.equal(authorizeRawMovement({ ...base, phase: RAW_PHASES.DECLARE }).ok, false));
test('Pre-Action blocks movement', () => assert.equal(authorizeRawMovement({ ...base, phase: RAW_PHASES.PREACTION }).ok, false));
test('Winner side may move during winner phase', () => assert.equal(authorizeRawMovement({ ...base, phase: RAW_PHASES.ACTIONS_WINNER }).ok, true));
test('Losing side may not move during winner phase', () => assert.equal(authorizeRawMovement({ ...base, side: 'npc', phase: RAW_PHASES.ACTIONS_WINNER }).ok, false));
test('Losing side may move during loser phase', () => assert.equal(authorizeRawMovement({ ...base, side: 'npc', phase: RAW_PHASES.ACTIONS_LOSER }).ok, true));
test('Block prohibits movement as another action', () => assert.equal(authorizeRawMovement({ ...base, declaration: { type: 'block', label: 'Block' }, phase: RAW_PHASES.ACTIONS_WINNER }).ok, false));
test('Attack declaration movement remains permitted in action phase', () => assert.equal(authorizeRawMovement({ ...base, phase: RAW_PHASES.ACTIONS_WINNER }).ok, true));

// Helpers
test('2 attacks require Remarkable Fighting Pre-Action', () => assert.deepEqual(getPreActionRequirement({ type: 'multi', attackCount: 2 }), { action: 'multiattack', ability: 'fighting', label: '2 Attacks', attackCount: 2, intensity: 'Remarkable' }));
test('3 attacks require Amazing Fighting Pre-Action', () => assert.equal(getPreActionRequirement({ type: 'multi', attackCount: 3 }).intensity, 'Amazing'));
test('Dodge requirement resolves only in same round', () => assert.equal(isPreActionResolved({ declaration: { type: 'dodge' }, preActionResolved: { round: 4, action: 'dodging' }, round: 4 }), true));
test('Active side helper returns initiative winner', () => assert.equal(getActiveSide({ phase: RAW_PHASES.ACTIONS_WINNER, goesFirst: 'npc' }), 'npc'));
test('Active side helper returns initiative loser', () => assert.equal(getActiveSide({ phase: RAW_PHASES.ACTIONS_LOSER, goesFirst: 'npc' }), 'pc'));

console.log(`\n${passed} RAW combat-state assertions passed.`);
