// faserip-initiative test suite — run: node faserip-initiative.test.js
// [CERT] tests certify against the Players Book Initiative section and the
// dated rulings in the kernel ERRATA ledger.

import {
  INITIATIVE_VERSION, INITIATIVE_CERTIFIED,
  INITIATIVE_MODIFIER_TABLE, initiativeModifier,
  NATURAL_ONE, initiativeTotal,
  effectiveIntuition, TALENT_INITIATIVE_BONUS, talentInitiativeBonus,
  characterInitiativeModifier, sideInitiativeModifier,
  resolveSideInitiative, resolveIndividualInitiative, initiativeMatters,
  CHANGE_ACTION, changeActionOutcome,
  PRE_ACTION_FEATS, preActionBlocksAttack,
} from './faserip-initiative.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-initiative v${INITIATIVE_VERSION}  (INITIATIVE_CERTIFIED=${INITIATIVE_CERTIFIED})\n`);

// ── Modifier table ──
t('[CERT] Initiative Modifier table: seven bands 0-10/+0 … 76+/+6', () => {
  eq(INITIATIVE_MODIFIER_TABLE.map(r => r.mod), [0, 1, 2, 3, 4, 5, 6]);
  eq(INITIATIVE_MODIFIER_TABLE.map(r => r.min), [0, 11, 21, 31, 41, 51, 76]);
});
t('[CERT] band edges: 10→+0, 11→+1, 20→+1, 21→+2, 30→+2, 31→+3, 40→+3, 41→+4, 50→+4, 51→+5', () => {
  eq([10, 11, 20, 21, 30, 31, 40, 41, 50, 51].map(initiativeModifier), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
});
t('[CERT] printed 51-75 / 75+ overlap: 75 is +5, 76 is +6 (ERRATA NOTE)', () => {
  eq(initiativeModifier(75), 5);
  eq(initiativeModifier(76), 6);
});
t('modifier caps at +6 for cosmic numbers; garbage and negatives give +0', () => {
  eq(initiativeModifier(1000), 6);
  eq(initiativeModifier(-3), 0);
  eq(initiativeModifier('x'), 0);
});

// ── Natural one ──
t('[CERT] a roll of 1 is always a 1, whatever the modifier', () => {
  eq(NATURAL_ONE, 1);
  eq(initiativeTotal(1, 6), 1);
  eq(initiativeTotal(1, 0), 1);
});
t('other rolls add the modifier', () => {
  eq(initiativeTotal(7, 3), 10);
  eq(initiativeTotal(10, 0), 10);
});

// ── Intuition substitutions ──
t('[CERT] Combat Sense replaces Intuition when higher', () => {
  const r = effectiveIntuition({ intuitionNumber: 20, combatSenseNumber: 40 });
  eq([r.value, r.source, r.rank], [40, 'Combat Sense', 'IN']);
});
t('lower Combat Sense leaves Intuition in place', () => {
  eq(effectiveIntuition({ intuitionNumber: 40, combatSenseNumber: 20 }).source, 'Intuition');
});
t('[RULED 2026-09-03] Enhanced Senses substitutes only as the hearing variant', () => {
  const r = effectiveIntuition({ intuitionNumber: 10, enhancedHearingNumber: 30 });
  eq([r.value, r.source], [30, 'Enhanced Hearing']);
  eq(effectiveIntuition({ intuitionNumber: 10 }).value, 10);
});

// ── Talents ──
t('[CERT] Martial Arts E gives +1 when unarmed; Weapons Specialist +1 with the specialty weapon', () => {
  eq(TALENT_INITIATIVE_BONUS, { martialArtsE: 1, weaponsSpecialist: 1 });
  eq(talentInitiativeBonus({ hasMartialArtsE: true, context: { unarmed: true } }), { bonus: 1, source: 'MA-E' });
  eq(talentInitiativeBonus({ hasWeaponsSpecialist: true, context: { specialtyWeapon: true } }), { bonus: 1, source: 'Wpn Spec' });
});
t('[RULED 2026-09-03] no declared context → no talent bonus (no "+1 assumed")', () => {
  eq(talentInitiativeBonus({ hasMartialArtsE: true, hasWeaponsSpecialist: true }), { bonus: 0, source: '' });
});
t('talent does not apply outside its context', () => {
  eq(talentInitiativeBonus({ hasMartialArtsE: true, context: { unarmed: false, specialtyWeapon: true } }).bonus, 0);
  eq(talentInitiativeBonus({ hasWeaponsSpecialist: true, context: { unarmed: true } }).bonus, 0);
});
t('talent bonuses never stack past +1', () => {
  const r = talentInitiativeBonus({ hasMartialArtsE: true, hasWeaponsSpecialist: true, context: { unarmed: true, specialtyWeapon: true } });
  eq(r.bonus, 1);
});

// ── Per-character and side modifiers ──
t('character modifier = own Int modifier + own talent bonus', () => {
  const m = characterInitiativeModifier({ name: 'A', intuitionNumber: 30, hasMartialArtsE: true, context: { unarmed: true } });
  eq([m.intMod, m.talent.bonus, m.total], [2, 1, 3]);
});
t('[CERT] side modifier is based on the highest Intuition on that side', () => {
  const s = sideInitiativeModifier([{ name: 'Low', intuitionNumber: 10 }, { name: 'High', intuitionNumber: 50 }]);
  eq([s.name, s.intMod, s.total], ['High', 4, 4]);
});
t('[RULED 2026-09-03] no cross-character stacking: Int 50 (+4) beside MA-E on an Int 10 character is +4, not +5', () => {
  const s = sideInitiativeModifier([
    { name: 'Brawler', intuitionNumber: 10, hasMartialArtsE: true, context: { unarmed: true } },
    { name: 'Seer', intuitionNumber: 50 },
  ]);
  eq([s.name, s.total], ['Seer', 4]);
});
t('[RULED 2026-09-03] a lower-Intuition character whose talent lifts the total wins the side modifier', () => {
  const s = sideInitiativeModifier([
    { name: 'Brawler', intuitionNumber: 31, hasMartialArtsE: true, context: { unarmed: true } },
    { name: 'Seer', intuitionNumber: 40 },
  ]);
  eq([s.name, s.total], ['Brawler', 4]);
});
t('equal totals fall to the higher Intuition, then the earlier entry', () => {
  eq(sideInitiativeModifier([{ name: 'A', intuitionNumber: 21 }, { name: 'B', intuitionNumber: 30 }]).name, 'B');
  eq(sideInitiativeModifier([{ name: 'A', intuitionNumber: 30 }, { name: 'B', intuitionNumber: 30 }]).name, 'A');
});
t('empty side yields a zero modifier', () => eq(sideInitiativeModifier([]).total, 0));

// ── Side resolution ──
t('[CERT] higher total wins and its side acts first', () => {
  const r = resolveSideInitiative({ pc: { roll: 6, modifier: 2 }, npc: { roll: 7, modifier: 0 } });
  eq([r.pcTotal, r.npcTotal, r.winner, r.order], [8, 7, 'pc', ['pc', 'npc']]);
});
t('[CERT] the modifier can carry a low roll past a high one', () => {
  const r = resolveSideInitiative({ pc: { roll: 3, modifier: 6 }, npc: { roll: 8, modifier: 0 } });
  eq(r.winner, 'pc');
});
t('[CERT] natural 1 loses to a modified 2', () => {
  const r = resolveSideInitiative({ pc: { roll: 1, modifier: 6 }, npc: { roll: 2, modifier: 0 } });
  eq([r.pcTotal, r.winner], [1, 'npc']);
});
t('[RULED 2026-09-03] ties re-roll', () => {
  const r = resolveSideInitiative({ pc: { roll: 5, modifier: 2 }, npc: { roll: 7, modifier: 0 } });
  eq([r.tie, r.reroll, r.winner, r.order], [true, true, null, []]);
});

// ── Individual resolution ──
t('individual initiative orders by total with shared positions for equal totals', () => {
  const r = resolveIndividualInitiative([
    { id: 'a', roll: 5, modifier: 2 }, { id: 'b', roll: 9, modifier: 0 }, { id: 'c', roll: 7, modifier: 2 }, { id: 'd', roll: 1, modifier: 6 },
  ]);
  eq(r.order.map(e => [e.id, e.total, e.position]), [['b', 9, 1], ['c', 9, 1], ['a', 7, 3], ['d', 1, 4]]);
  eq(r.ties, [{ total: 9, ids: ['b', 'c'] }]);
});

// ── When initiative matters ──
t('[CERT] initiative is rolled only while both sides have someone who can act', () => {
  eq(initiativeMatters({ pcEligible: 2, npcEligible: 1 }), true);
  eq(initiativeMatters({ pcEligible: 2, npcEligible: 0 }), false);
});

// ── Change Action ──
t('[CERT] Change Action is a yellow Agility FEAT in the pre-action phase; success costs -1CS afterwards', () => {
  eq([CHANGE_ACTION.ability, CHANGE_ACTION.requiredColor, CHANGE_ACTION.penaltyCS, CHANGE_ACTION.phase], ['agility', 'yellow', -1, 'preaction']);
  eq(changeActionOutcome('yellow'), { success: true, penaltyCS: -1 });
  eq(changeActionOutcome('red'), { success: true, penaltyCS: -1 });
  eq(changeActionOutcome('green'), { success: false, penaltyCS: 0 });
});

// ── Pre-action ordering ──
t('[RULED 2026-09-03] an unrolled declared Dodge/Block/Evade blocks attacks on its owner; Multi does not', () => {
  eq(Object.keys(PRE_ACTION_FEATS), ['dodge', 'block', 'evade', 'multi']);
  eq(preActionBlocksAttack('dodge', false), true);
  eq(preActionBlocksAttack('block', false), true);
  eq(preActionBlocksAttack('evade', true), false);
  eq(preActionBlocksAttack('multi', false), false);
  eq(preActionBlocksAttack('attack', false), false);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
