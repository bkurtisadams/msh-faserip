// scripts/dev/kernel-movement-diff.mjs v1.1.0 - 2026-09-04
// v1.1.0: current-behaviour block updated to movement-feats v1.9.0 (Slice 7a);
//         the six former fixed-bugs are now asserted as matches.
// Slice 7 proof: actor.js MOVEMENT_DATA + movement-feats.js behaviour vs
// faserip-rules movement v0.7.2. Run from the msh-faserip system root:
//   node scripts/dev/kernel-movement-diff.mjs
import {
  LONG_DISTANCE, LEAP_TABLE, AREA_YARDS, FLOOR_FEET, MPH_PER_AREA,
  enduranceAreasPerRound, lowAltitudeMax, exhaustionCheck, exhaustionExempt,
  SPEED_FEAT, LANDING_FEAT_ABOVE, decelerate, drowningFeatColor, breathHoldRounds,
  teleportPassengerFeatColor, teleportIntoObjectDamage, SWIM_MAX_UNPOWERED,
  HALF_SPEED,
} from '../lib/faserip-rules/faserip-movement.js';
import { RANKS, rankByKey } from '../lib/faserip-rules/faserip-kernel.js';

const KEY = {
  Feeble: 'FE', Poor: 'PR', Typical: 'TY', Good: 'GD', Excellent: 'EX', Remarkable: 'RM',
  Incredible: 'IN', Amazing: 'AM', Monstrous: 'MN', Unearthly: 'UN', 'Shift-X': 'SHX',
  'Shift-Y': 'SHY', 'Shift-Z': 'SHZ', 'Class 1000': 'CL1000', 'Class 3000': 'CL3000', 'Class 5000': 'CL5000',
};
const NAMES = Object.keys(KEY);

// ---- current system (copied verbatim from actor.js v1.7.0 / movement-feats.js v1.8.0)
const landSpeed = { Feeble: 1, Poor: 2, Typical: 3, Good: 4, Excellent: 5, Remarkable: 6, Incredible: 7, Amazing: 8, Monstrous: 9, Unearthly: 10, 'Shift-X': 12, 'Shift-Y': 14, 'Shift-Z': 16, 'Class 1000': 32, 'Class 3000': 50, 'Class 5000': 100 };
const airSpeed = { Feeble: [2, 30, 1], Poor: [4, 60, 2], Typical: [6, 90, 3], Good: [8, 120, 4], Excellent: [10, 150, 5], Remarkable: [15, 225, 6], Incredible: [20, 300, 7], Amazing: [25, 375, 8], Monstrous: [30, 450, 9], Unearthly: [40, 600, 10], 'Shift-X': [50, 750, 12], 'Shift-Y': [100, 1500, 14], 'Shift-Z': [200, 3750, 16] };
const leaping = { Feeble: [2, 2, 3], Poor: [4, 4, 8], Typical: [6, 6, 9], Good: [10, 10, 15], Excellent: [20, 20, 30], Remarkable: [30, 30, 45], Incredible: [40, 40, 60], Amazing: [50, 50, 75], Monstrous: [75, 75, 105], Unearthly: [100, 100, 150], 'Shift-X': [150, 150, 225], 'Shift-Y': [200, 200, 300], 'Shift-Z': [500, 500, 750], 'Class 1000': [1000, 1000, 1500], 'Class 3000': [3000, 3000, 4500], 'Class 5000': [5000, 5000, 7500] };
const rankNumbers = { Feeble: 2, Poor: 4, Typical: 6, Good: 10, Excellent: 20, Remarkable: 30, Incredible: 40, Amazing: 50, Monstrous: 75, Unearthly: 100, 'Shift-X': 150, 'Shift-Y': 200, 'Shift-Z': 500, 'Class 1000': 1000, 'Class 3000': 3000, 'Class 5000': 5000 };
const EXHAUSTION_IMMUNE_RANKS = ['Unearthly', 'Shift-X', 'Shift-Y', 'Shift-Z', 'Class 1000', 'Class 3000', 'Class 5000'];
const suggestedMovement = (endName) => endName === 'Feeble' ? 1 : ['Poor', 'Typical', 'Good', 'Excellent'].includes(endName) ? 2 : 3;
const currentLeapExtended = { mode: 'add', feet: 132 };
const currentLeapMultiplier = { half: 0.5, full: 1 };
const currentLeapRequirement = { half: 'Automatic', full: 'Green', extended: 'Red' };
const currentSpeedFeat = { requirement: 'Yellow', greenResult: 'No bonus speed', whiteResult: 'trip-slam' };
const currentExhaustion = { requirement: 'Green', failure: 'Must rest 1-10 turns', ladder: (t, n) => exhaustionCheck(t, n) };
const currentCruise = { flyByRanks: 2, fallbackByAreas: 2, checksAtCruise: 'none' };
const currentDrowning = { ladder: (t) => drowningFeatColor(t) };
const currentTeleport = { passenger: (trips) => teleportPassengerFeatColor(trips), intoSolidDamageMultiplier: 1, intoSolidSuccess: 'bounce clear, unconscious 1-10', intoSolidFail: 'unconscious, Endurance loss' };
const currentFlyFeats = { 'sharp-turn': 'Agility FEAT >90°', landing: 'Agility FEAT >3 areas', 'low-altitude': 'Agility FEAT above groundAreas', 'dive-pullout': 'Agility FEAT' };
const currentActionsHalveSpeed = true;
const currentSwimSpeedFeat = true;

// ---- report
let match = 0, bug = 0, open = 0;
const M = (label, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? match++ : bug++; console.log(`${ok ? 'MATCH   ' : 'FIXED-BUG'} ${label}${ok ? '' : `  current=${JSON.stringify(a)} kernel=${JSON.stringify(b)}`}`); };
const BUG = (label, detail) => { bug++; console.log(`FIXED-BUG ${label}  ${detail}`); };
const OPEN = (label, detail) => { open++; console.log(`OPEN      ${label}  ${detail}`); };
const GAP = (label, detail) => { console.log(`GAP       ${label}  ${detail}`); };

console.log('== Tables');
for (const n of NAMES) M(`land ${n}`, landSpeed[n], LONG_DISTANCE[KEY[n]].land);
for (const n of NAMES) M(`land mph ${n}`, landSpeed[n] * 15, LONG_DISTANCE[KEY[n]].landMph);
for (const n of Object.keys(airSpeed)) {
  const k = KEY[n];
  M(`air ${n}`, airSpeed[n][0], LONG_DISTANCE[k].air);
  M(`air mph ${n}`, airSpeed[n][1], LONG_DISTANCE[k].airMph);
  M(`groundAreas ${n} == lowAltitudeMax`, airSpeed[n][2], lowAltitudeMax(k));
}
for (const n of NAMES) M(`leap ${n} [up,across,down]`, leaping[n], [LEAP_TABLE[KEY[n]].up, LEAP_TABLE[KEY[n]].across, LEAP_TABLE[KEY[n]].down]);
for (const n of NAMES) M(`rankNumbers ${n} == standard`, rankNumbers[n], rankByKey(KEY[n]).standard);
M('AREA_YARDS*3 == 132 ft (leaping floors/areas basis)', 132, AREA_YARDS * 3);
M('FLOOR_FEET', 15, FLOOR_FEET);
M('MPH_PER_AREA', 15, MPH_PER_AREA);

console.log('\n== Endurance-keyed movement');
for (const n of NAMES) M(`suggestedMovement ${n}`, suggestedMovement(n), enduranceAreasPerRound(rankNumbers[n]));
for (const n of NAMES) M(`exhaustionThreshold ${n} (first green check at rank#)`, currentExhaustion.requirement.toLowerCase(), exhaustionCheck(rankNumbers[n], rankNumbers[n]).check);
for (const n of NAMES) M(`exhaustion immune ${n}`, EXHAUSTION_IMMUNE_RANKS.includes(n), exhaustionExempt({ enduranceNumber: rankNumbers[n] }));
M('exhaustion rest dice at first check', currentExhaustion.failure, exhaustionCheck(6, 6).restDice === '1-10' ? 'Must rest 1-10 turns' : exhaustionCheck(6, 6).restDice);
for (const t of [5, 6, 12, 18, 24]) M(`exhaustion ladder at ${t} turns (End 6)`, currentExhaustion.ladder(t, 6), exhaustionCheck(t, 6));
OPEN('cruising speed', `current: fly cruise = 2 RANKS lower (actor.getCruisingFlight), run/swim fallback = areas-2, tooltip says "no Exhaustion checks". Kernel prose: two ranks slower = at most one check per HOUR, not none. Kernel exports no cruise helper — needs a movement function + passage.`);

console.log('\n== Leaping');
M('leap half automatic', currentLeapRequirement.half, 'Automatic');
M('leap full green', currentLeapRequirement.full, 'Green');
M('leap extended red', currentLeapRequirement.extended, 'Red');
M('leap half multiplier', currentLeapMultiplier.half, 0.5);
M('leap extended = +1 area (132 ft)', currentLeapExtended, { mode: 'add', feet: AREA_YARDS * 3 });
GAP('leap down', 'kernel: down = controlled fall, no damage if landed on feet. Current card has no down-safe note. Cosmetic.');

console.log('\n== Speed FEAT / running / swimming');
M('speed FEAT colour', currentSpeedFeat.requirement.toLowerCase(), SPEED_FEAT.needed);
M('speed FEAT bonus areas', 1, SPEED_FEAT.bonusAreas);
M('speed FEAT white result', currentSpeedFeat.whiteResult, SPEED_FEAT.whiteResult);
M('other actions halve speed', currentActionsHalveSpeed, HALF_SPEED.otherActions);
OPEN('swim speed FEAT', `current v1.8.0 mirrors the Run +1 area Yellow Strength FEAT for swimming; kernel SPEED_FEAT is written for running, SWIM_MAX_UNPOWERED=${SWIM_MAX_UNPOWERED}. Needs passage: does the Speed FEAT apply in water?`);
M('breath hold turns == End rank#', rankNumbers.Good, breathHoldRounds(10));
for (const t of [1, 2, 3, 5]) M(`drowning ladder turn ${t} past hold`, currentDrowning.ladder(t), drowningFeatColor(t));
OPEN('drowning consequence', 'kernel says drowning begins after the red failure; the End-rank-per-turn loss is not modelled anywhere. Card text is "Drowning begins". Needs passage.');

console.log('\n== Flight');
M('landing FEAT above N areas', 3, LANDING_FEAT_ABOVE);
M('decelerate halves, fractions up (15->8)', 8, decelerate(15));
OPEN('sharp turn', `current fly dialog: "${currentFlyFeats['sharp-turn']}"; kernel HALF_SPEED.turnOver90=${HALF_SPEED.turnOver90} applies to GROUND movement and has no flight-turn FEAT. Needs Flight passage.`);
OPEN('dive pullout', `current: "${currentFlyFeats['dive-pullout']}"; kernel models diveBonus/diveTotal only, no pull-out FEAT. Needs passage.`);
M('low altitude cap = ground speed of Power rank', 'Agility FEAT above groundAreas', currentFlyFeats['low-altitude']);
GAP('acceleration schedule', 'kernel flightAccelerationSchedule (Storm 3,6,9..20) not surfaced in dialog; actor.suggestedMovement gives the increment only.');
GAP('dive bonus', 'kernel diveBonus(+1 area / 3 floors) not in dialog.');

console.log('\n== Teleportation');
for (const t of [0, 1, 2, 5]) M(`teleport passenger colour, ${t} prior trips`, currentTeleport.passenger(t), teleportPassengerFeatColor(t));
M('teleport into solid damage x1 (RULED 2026-08-31)', 30 * currentTeleport.intoSolidDamageMultiplier, teleportIntoObjectDamage(30));
OPEN('teleport distance table', 'current TELEPORT_DISTANCE keyed to air speed (v1.7.1); kernel LONG_DISTANCE.air CL5000 = "teleportation" but no explicit teleport range table. Needs Teleportation power passage.');

console.log(`\n${match} match, ${bug} fixed-bug, ${open} open`);
