// faserip-rules wrapup v0.1.0
// v0.1.0: Session wrap-up (2026-10-03). Plans the end-of-session personal
//         awards from the Karma chapter: gaming awards (role-play up to 10,
//         Stump the Judge up to 15, humor 5), commitments kept (+5), missed
//         (-10) and left early (-5), a GM ruling amount, and the weekly
//         award (up to 10) once a game week has passed. All individual.
//         Pure: no Foundry globals.

import { COMMITMENT_KARMA, GAMING_AWARDS } from './faserip-karma.js';

export const WEEK_SECONDS = 7 * 86400;

export const COMMITMENT_OUTCOMES = {
  kept:   { amount: COMMITMENT_KARMA.make,       type: 'Personal Commitment', label: 'Kept' },
  left:   { amount: COMMITMENT_KARMA.leaveEarly, type: 'Leaving Early',       label: 'Left early' },
  missed: { amount: COMMITMENT_KARMA.failToShow, type: 'Failing Commitment',  label: 'Missed' },
  ruling: { amount: null,                        type: 'Commitment Ruling',   label: 'Ruling' }
};

const CTT_TO_OUTCOME = { kept: 'kept', 'left-early': 'left', missed: 'missed', ruling: 'ruling' };
const OUTCOME_TO_CTT = { kept: 'kept', left: 'left-early', missed: 'missed', ruling: 'ruling' };

export function outcomeFromCtt(status) { return CTT_TO_OUTCOME[status] || ''; }
export function cttFromOutcome(outcome) { return OUTCOME_TO_CTT[outcome] || 'open'; }

export function clampAward(value, max) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(max, n));
}

export function dueCommitments(events, awardedIds = []) {
  const done = new Set(awardedIds);
  return (events || []).filter(e =>
    e?.category === 'commitment' && !done.has(e.id)
    && (e.firedStart || (e.status && e.status !== 'open')));
}

export function weeklyStatus(last, nowWorldTime) {
  if (!last || !Number.isFinite(Number(last.worldTime))) return { known: false, passed: false, days: null };
  const elapsed = Number(nowWorldTime) - Number(last.worldTime);
  return { known: true, passed: elapsed >= WEEK_SECONDS, days: Math.max(0, Math.floor(elapsed / 86400)) };
}

export function formatWeekdays(indices, names) {
  const idx = [...new Set((indices || []).map(Number))].sort((a, b) => a - b);
  if (!idx.length) return '';
  const short = i => String(names?.[i] ?? i).slice(0, 3);
  const consecutive = idx.length >= 3 && idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
  if (consecutive) return `${short(idx[0])} to ${short(idx[idx.length - 1])}`;
  return idx.map(short).join(', ');
}

// input: { heroes: [{id,name}], gaming: {id:{rp,stump,humor}},
//   commitments: [{id, actorId, title, outcome, ruling}],
//   weeklyOn, weekly: {id: n}, weekLabel }
// -> entries [{heroId, amount, type, description, source}]
export function planWrapUp(input) {
  const entries = [];
  const heroIds = new Set((input.heroes || []).map(h => h.id));
  for (const h of input.heroes || []) {
    const g = input.gaming?.[h.id] || {};
    const rp = clampAward(g.rp, GAMING_AWARDS.rolePlayMax);
    const stump = clampAward(g.stump, GAMING_AWARDS.stumpTheJudgeMax);
    if (rp) entries.push({ heroId: h.id, amount: rp, type: 'Role-Playing', description: 'Role-play award' });
    if (stump) entries.push({ heroId: h.id, amount: stump, type: 'Stump the Judge', description: 'Stump the Judge award' });
    if (g.humor) entries.push({ heroId: h.id, amount: GAMING_AWARDS.humor, type: 'Humor Award', description: 'Humor award' });
  }
  for (const c of input.commitments || []) {
    if (!heroIds.has(c.actorId)) continue;
    const o = COMMITMENT_OUTCOMES[c.outcome];
    if (!o) continue;
    const amount = c.outcome === 'ruling' ? Math.trunc(Number(c.ruling) || 0) : o.amount;
    if (!amount) continue;
    entries.push({ heroId: c.actorId, amount, type: o.type, description: `${o.label}: ${c.title}`, commitmentId: c.id });
  }
  if (input.weeklyOn) {
    for (const h of input.heroes || []) {
      const w = clampAward(input.weekly?.[h.id], COMMITMENT_KARMA.weeklyMax);
      if (w) entries.push({ heroId: h.id, amount: w, type: 'Weekly Award', description: input.weekLabel ? `Weekly award, ${input.weekLabel}` : 'Weekly award' });
    }
  }
  return entries;
}

export function heroTotals(heroes, entries) {
  const totals = Object.fromEntries((heroes || []).map(h => [h.id, 0]));
  for (const e of entries) if (e.heroId in totals) totals[e.heroId] += e.amount;
  return totals;
}

export const WRAPUP_VERSION = '0.1.0';
