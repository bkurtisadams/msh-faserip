// scripts/dev/kernel-recovery-diff.mjs v1.1.0 - 2026-09-05
// v1.1.0: current-behaviour block updated to rest-system v1.6.0 /
//         ongoing-engine v1.9.0 (Slice 7b); dying number and consciousness
//         now asserted against kernel damage v0.9.0. One ERRATA OPEN remains.
// Slice 7 proof: rest-system.js + recovery-timing.js + ongoing-engine.js dying
// tick vs faserip-rules damage. Run from the msh-faserip system root:
//   node scripts/dev/kernel-recovery-diff.mjs
import {
  recoveryAmount, healingPerHour, applyHealing, enduranceLossStep, impairedEnduranceNumber,
  enduranceRestoreStep, regainConsciousnessFeat, stabilizationOutcome, recoveryAllowed,
  IMPAIRED_ABILITY_SHIFT, ENDURANCE_RANK_HEAL_DAYS, STABILIZE_UNCONSCIOUS_HOURS, WAKE_RETRY_TURNS,
  RECOVERY_DELAY_TURNS, HEALING_INTERVAL_TURNS,
  KARMA_STABILIZE_ONE_ROUND, KARMA_EXTRA_ENDURANCE_FEAT,
} from '../lib/faserip-rules/faserip-damage.js';
import { RANKS } from '../lib/faserip-rules/faserip-kernel.js';
import { healingSecondsRemaining, countElapsedTurns, healingAnchor, TURN_SECONDS } from '../modules/recovery-timing.js';

// ---- current system behaviour (rest-system.js v1.6.0 / ongoing-engine.js v1.9.0)
const cur = {
  recovery: { amount: (endNumber) => recoveryAmount(endNumber), delaySeconds: RECOVERY_DELAY_TURNS * TURN_SECONDS, oncePerGameDay: true, requiresConscious: true, blockedAfterKO: true, koGateClearsOn: 'next damage taken while conscious' },
  healing: { amount: (endNumber, medical) => healingPerHour(endNumber, { medicalCare: medical }), intervalSeconds: HEALING_INTERVAL_TURNS * TURN_SECONDS, anchor: 'max(lastDamage,lastHeal)', capAtMax: true },
  impaired: { cs: -2, healSeconds: { normal: ENDURANCE_RANK_HEAL_DAYS.normal * 86400, hospital: ENDURANCE_RANK_HEAL_DAYS.hospital * 86400 } },
  consciousness: { feat: (rank, n, roll) => regainConsciousnessFeat({ enduranceRank: rank, enduranceNumber: n, roll }), retry: WAKE_RETRY_TURNS },
  stabilize: { hours: STABILIZE_UNCONSCIOUS_HOURS, ifHealthAbove0: 'conscious but impaired' },
  dying: { tickNumber: (rankKey) => enduranceLossStep(rankKey).numberForChecks, restore: (a, b, n) => enduranceRestoreStep({ rankKey: a, originalRankKey: b, originalNumber: n }), healthDropsByEnduranceLoss: true, maxHealthRecalc: true, karmaStabilize: 50, karmaReFeat: 200 },
};

let match = 0, bug = 0, open = 0;
const M = (label, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? match++ : bug++; console.log(`${ok ? 'MATCH   ' : 'FIXED-BUG'} ${label}${ok ? '' : `  current=${JSON.stringify(a)} kernel=${JSON.stringify(b)}`}`); };
const OPEN = (label, detail) => { open++; console.log(`OPEN      ${label}  ${detail}`); };
const GAP = (label, detail) => { console.log(`GAP       ${label}  ${detail}`); };

console.log('== Recovery');
for (const r of RANKS) if (r.key !== 'SH0') M(`recovery ${r.key}`, cur.recovery.amount(r.standard), recoveryAmount(r.standard));
M('recovery delay = 10 turns = 60s world', cur.recovery.delaySeconds, countElapsedTurns(60, 6) * 6);
M('recovery gate: ten turns not yet elapsed', recoveryAllowed({ conscious: true, turnsSinceDamage: 4 }).allowed, false);
M('recovery once per game day', cur.recovery.oncePerGameDay, true);
M('recovery requires conscious', cur.recovery.requiresConscious, true);
M('recovery blocked after KO (flag supplied by caller)', recoveryAllowed({ conscious: true, knockedOut: cur.recovery.blockedAfterKO }).allowed, false);
M('recovery KO gate clears on a conscious hit (RULED 2026-09-05)', cur.recovery.koGateClearsOn, 'next damage taken while conscious');

console.log('\n== Healing');
for (const r of RANKS) if (r.key !== 'SH0') {
  M(`healing ${r.key}`, cur.healing.amount(r.standard, false), healingPerHour(r.standard));
  M(`healing ${r.key} medical`, cur.healing.amount(r.standard, true), healingPerHour(r.standard, { medicalCare: true }));
}
M('healing capped at max', applyHealing({ current: 95, max: 100, amount: 20 }), 100);
M('healing interval 3600s = 600 turns', cur.healing.intervalSeconds, HEALING_INTERVAL_TURNS * TURN_SECONDS);
M('healing anchor = later of damage/heal', healingAnchor(1000, 4600), 4600);
M('healing remaining from anchor', healingSecondsRemaining({ worldNow: 5000, lastDamageWorldTime: 1000, lastHealingWorldTime: 4600 }), 3200);
M('healing remaining floors at 0', healingSecondsRemaining({ worldNow: 9000, lastDamageWorldTime: 1000, lastHealingWorldTime: 4600 }), 0);
GAP('healing "bedrest and medical supervision"', 'kernel doubles on bedrest+supervision together; current has a single medicalCare flag. Same behaviour, label only.');

console.log('\n== Impaired Endurance');
M('impaired CS', cur.impaired.cs, IMPAIRED_ABILITY_SHIFT);
M('impaired heal days normal', cur.impaired.healSeconds.normal / 86400, ENDURANCE_RANK_HEAL_DAYS.normal);
M('impaired heal days hospital', cur.impaired.healSeconds.hospital / 86400, ENDURANCE_RANK_HEAL_DAYS.hospital);

console.log('\n== Dying');
M('karma stabilize one round', cur.dying.karmaStabilize, KARMA_STABILIZE_ONE_ROUND);
M('karma extra Endurance FEAT', cur.dying.karmaReFeat, KARMA_EXTRA_ENDURANCE_FEAT);
for (let i = 1; i < RANKS.length; i++) {
  const step = enduranceLossStep(RANKS[i].key);
  M(`dying step ${RANKS[i].key} -> ${RANKS[i - 1].key}`, RANKS[i - 1].key, step.rank);
}
M('dying at Shift 0 = dead', enduranceLossStep('SH0').dead, true);
for (const k of ['EX', 'RM', 'AM', 'FE']) M(`dying number after ${k} loss = highest of new rank`, cur.dying.tickNumber(k), impairedEnduranceNumber(enduranceLossStep(k).rank));
M('restore Gd -> Ex carries the highest number (25)', cur.dying.restore('GD', 'RM', 30), { restored: true, atCap: false, rank: 'EX', number: 25 });
M('restore Ex -> Rm returns the original number (30)', cur.dying.restore('EX', 'RM', 30), { restored: true, atCap: true, rank: 'RM', number: 30 });
OPEN('dying Health drop', 'ERRATA OPEN 2026-09-05: the passage never says Health or maximum Health move during the spiral; msh-faserip still recomputes Health = F+A+S+E on each lost and restored rank (v1.7.0 ruling). Judge to confirm or drop.');

console.log('\n== Consciousness / stabilization');
M('wake FEAT: green succeeds, Health = Endurance number', (({ success, wakeHealth }) => ({ success, wakeHealth }))(cur.consciousness.feat('GD', 15, 60)), { success: true, wakeHealth: 15 });
M('wake FEAT: white fails, re-check 1-10 turns', (({ success, retryTurns }) => ({ success, retryTurns }))(cur.consciousness.feat('GD', 15, 10)), { success: false, retryTurns: { min: 1, max: 10 } });
M('stabilize at 0 Health: unconscious 1-10 hours', stabilizationOutcome({ health: 0 }).hours, cur.stabilize.hours);
M('stabilize above 0 Health: conscious', stabilizationOutcome({ health: 5 }).unconscious, false);
GAP('Shift 0 disabilities', 'kernel disabilityCheck (green FEAT per physical ability above Good) has no msh-faserip caller yet.');
GAP('robot reactivation', 'kernel robotReactivation has no msh-faserip caller yet.');

console.log(`\n${match} match, ${bug} fixed-bug, ${open} open`);
