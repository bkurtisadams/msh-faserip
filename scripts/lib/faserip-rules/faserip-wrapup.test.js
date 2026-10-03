// faserip-wrapup test suite — run: node faserip-wrapup.test.js
// [CERT] tests certify against Players Book ch.3 Karma amounts.

import {
  COMMITMENT_OUTCOMES, outcomeFromCtt, cttFromOutcome, clampAward, dueCommitments,
  weeklyStatus, formatWeekdays, planWrapUp, heroTotals, WEEK_SECONDS
} from './faserip-wrapup.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`expected ${y}, got ${x}`);
}

const heroes = [{ id: 'a', name: 'Astrid' }, { id: 's', name: 'Screamwave' }];

t('[CERT] commitment amounts: kept +5, missed -10, left early -5', () => {
  eq([COMMITMENT_OUTCOMES.kept.amount, COMMITMENT_OUTCOMES.missed.amount, COMMITMENT_OUTCOMES.left.amount], [5, -10, -5]);
});

t('CTT statuses map both ways', () => {
  eq(['kept', 'left-early', 'missed', 'ruling', 'open'].map(outcomeFromCtt), ['kept', 'left', 'missed', 'ruling', '']);
  eq(['kept', 'left', 'missed', 'ruling', ''].map(cttFromOutcome), ['kept', 'left-early', 'missed', 'ruling', 'open']);
});

t('[CERT] gaming awards clamp: role-play 10, stump 15, humor 5', () => {
  const plan = planWrapUp({ heroes, gaming: { a: { rp: 14, stump: 40, humor: true } } });
  eq(plan.map(e => [e.type, e.amount]), [['Role-Playing', 10], ['Stump the Judge', 15], ['Humor Award', 5]]);
  eq(clampAward(-3, 10), 0);
  eq(clampAward('7.9', 10), 7);
});

t('commitments pay by outcome; open and unknown heroes are skipped', () => {
  const plan = planWrapUp({ heroes, commitments: [
    { id: 'c1', actorId: 'a', title: 'Cover shift', outcome: 'kept' },
    { id: 'c2', actorId: 's', title: 'Home by 10', outcome: 'missed' },
    { id: 'c3', actorId: 's', title: 'Test', outcome: '' },
    { id: 'c4', actorId: 'x', title: 'Not on team', outcome: 'kept' }
  ] });
  eq(plan.map(e => [e.heroId, e.amount, e.commitmentId]), [['a', 5, 'c1'], ['s', -10, 'c2']]);
});

t('a ruling pays the entered amount; zero writes nothing', () => {
  const plan = planWrapUp({ heroes, commitments: [
    { id: 'c1', actorId: 'a', title: 'Late', outcome: 'ruling', ruling: '-3' },
    { id: 'c2', actorId: 's', title: 'Late', outcome: 'ruling', ruling: 0 }
  ] });
  eq(plan.map(e => [e.type, e.amount]), [['Commitment Ruling', -3]]);
});

t('[CERT] weekly award: up to 10, only when switched on', () => {
  eq(planWrapUp({ heroes, weeklyOn: false, weekly: { a: 6 } }).length, 0);
  const plan = planWrapUp({ heroes, weeklyOn: true, weekly: { a: 6, s: 25 }, weekLabel: '4/13 to 4/20' });
  eq(plan.map(e => [e.heroId, e.amount, e.description]), [['a', 6, 'Weekly award, 4/13 to 4/20'], ['s', 10, 'Weekly award, 4/13 to 4/20']]);
});

t('totals sum every entry per hero', () => {
  const plan = planWrapUp({ heroes, gaming: { a: { rp: 8 } }, commitments: [{ id: 'c', actorId: 'a', title: 'x', outcome: 'missed' }] });
  eq(heroTotals(heroes, plan), { a: -2, s: 0 });
});

t('due commitments: fired or settled, not yet awarded, commitments only', () => {
  const events = [
    { id: '1', category: 'commitment', firedStart: true, status: 'open' },
    { id: '2', category: 'commitment', status: 'kept' },
    { id: '3', category: 'commitment', status: 'open' },
    { id: '4', category: 'commitment', firedStart: true },
    { id: '5', category: 'obligation', firedStart: true }
  ];
  eq(dueCommitments(events, ['4']).map(e => e.id), ['1', '2']);
});

t('weekly status needs a recorded last award', () => {
  eq(weeklyStatus(null, 1000), { known: false, passed: false, days: null });
  eq(weeklyStatus({}, 1000), { known: false, passed: false, days: null });
  eq(weeklyStatus({ worldTime: 0 }, WEEK_SECONDS - 1), { known: true, passed: false, days: 6 });
  eq(weeklyStatus({ worldTime: 0 }, WEEK_SECONDS), { known: true, passed: true, days: 7 });
});

t('weekday lists collapse runs of three or more', () => {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  eq(formatWeekdays([5, 1, 2, 3, 4], names), 'Mon to Fri');
  eq(formatWeekdays([1, 3, 5], names), 'Mon, Wed, Fri');
  eq(formatWeekdays([], names), '');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
