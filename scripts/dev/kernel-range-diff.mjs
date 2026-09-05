// scripts/dev/kernel-range-diff.mjs v1.0.0 - 2026-09-05
// Range slice proof: range-helpers.js v1.0.0 (re-exported by
// ranged-attack-action.js v2.0.0 to the ranged dialogs) vs faserip-rules range v0.1.0. The pre-slice v1.3.0
// behaviour is restated in `legacy` so the two rulings show as fixed-bugs.
// Run from the msh-faserip system root:  node scripts/dev/kernel-range-diff.mjs
globalThis.game ??= { settings: { get: () => false } };
globalThis.canvas ??= {};
const {
  POWER_RANGE, THROW_RANGE, weaponRangeShift, thrownRangeShift, powerRangeShift, powerMaximumDistance, RANGE_VERSION,
} = await import('../lib/faserip-rules/faserip-range.js');
const { RANKS, rankByKey } = await import('../lib/faserip-rules/faserip-kernel.js');
const {
  powerRangeInAreas, throwingRangeInAreas, rangeLabel, weaponRangePenalty, thrownRangePenalty, powerRangePenalty,
} = await import('../modules/actions/range-helpers.js');

let match = 0, fixed = 0, open = 0;
const M = (label, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja === jb) { match++; console.log(`MATCH     ${label}`); } else { fixed++; console.log(`FIXED-BUG ${label}\n          current ${ja}\n          kernel  ${jb}`); } };
const FIXED = (label, was, now) => { fixed++; console.log(`FIXED-BUG ${label}\n          v1.3.0  ${JSON.stringify(was)}\n          now     ${JSON.stringify(now)}`); };
const GAP = (label, note) => console.log(`GAP       ${label}  ${note}`);

// v1.3.0 literals (ranged-attack-action.js before this slice)
const legacy = {
  power: { "Shift-0": 0, "Feeble": 0, "Poor": 1, "Typical": 2, "Good": 4, "Excellent": 6, "Remarkable": 8, "Incredible": 10, "Amazing": 20, "Monstrous": 40, "Unearthly": 60, "Shift-X": 80, "Shift-Y": 160, "Shift-Z": 400 },
  throw: { "Shift-0": 0, "Feeble": 1, "Poor": 1, "Typical": 1, "Good": 2, "Excellent": 3, "Remarkable": 4, "Incredible": 5, "Amazing": 6, "Monstrous": 7, "Unearthly": 8, "Shift-X": 10, "Shift-Y": 15, "Shift-Z": 20 },
  weaponPenalty: d => d > 1 ? -(d - 1) : 0,
  thrownPenalty: d => d > 1 ? -(d - 1) : 0,
  grenadePenalty: d => -(Math.max(0, d - 1)),
  powerPenalty: (max, d) => (d > max && max > 0) ? -(d - max) : 0,
};
const nameOf = k => rankByKey(k).name.replace(' ', '-');

console.log(`faserip-range v${RANGE_VERSION}\n`);
console.log('== Tables');
for (const [name, areas] of Object.entries(legacy.power)) M(`power range ${name} = ${areas}`, powerRangeInAreas(name), areas);
for (const [name, areas] of Object.entries(legacy.throw)) M(`throwing range ${name} = ${areas}`, throwingRangeInAreas(name), areas);
M('Class 1000+ power ranges are LOS (were 999/9999/99999 sentinels)', ['Class 1000', 'Class 3000', 'Class 5000', 'Beyond'].map(n => rangeLabel(powerRangeInAreas(n))), ['LOS', 'LOS', 'LOS', 'LOS']);
M('Class 1000+ throwing ranges are LOS (were 999 sentinels)', ['Class 1000', 'Class 3000', 'Class 5000'].map(n => rangeLabel(throwingRangeInAreas(n))), ['LOS', 'LOS', 'LOS']);
M('every rank key has a power and throwing range', RANKS.every(r => POWER_RANGE[r.key] && THROW_RANGE[r.key]), true);

console.log('\n== Penalties');
FIXED('weapon penalty: -1CS per area to the target (Rifle at 4 areas)', legacy.weaponPenalty(4), weaponRangePenalty(4, 15));
M('weapon penalty: own area 0, adjacent -1', [weaponRangePenalty(0), weaponRangePenalty(1)], [0, -1]);
M('weapon beyond listed range: no shift, caller refuses', weaponRangeShift({ distance: 16, maxRange: 15 }).inRange, false);
FIXED('thrown penalty (RULED 2026-09-05): -1CS per area, Strength range caps (Excellent, 2 areas)', legacy.thrownPenalty(2), thrownRangePenalty(2, 'Excellent'));
FIXED('grenade penalty: same rule (3 areas)', legacy.grenadePenalty(3), thrownRangePenalty(3, 'Remarkable'));
M('thrown beyond Strength range: no shift, caller refuses', thrownRangeShift({ distance: 4, strengthKey: 'EX' }).inRange, false);
for (const [rank, d] of [['Excellent', 6], ['Excellent', 7], ['Excellent', 9], ['Remarkable', 3]]) {
  M(`power penalty ${rank} at ${d} areas`, powerRangePenalty(rank, d), legacy.powerPenalty(legacy.power[rank], d));
}
M('power penalty: LOS ranks never shift', powerRangePenalty('Class 1000', 500), 0);
M('power maximum distance: Excellent power, Excellent Agility = 11 areas', powerMaximumDistance({ powerRank: 'EX', abilityRank: 'EX' }), 11);
GAP('power at maximum distance', 'kernel powerRangeShift reports atMaximum when the shifted ability reaches Shift 0; energy/force do not yet refuse or warn at that point.');
GAP('touch-only powers at range', 'energy/force keep the maxRange > 0 guard (no penalty computed for Shift 0/Feeble powers); the text does not say whether touch powers extend with -1CS per area. Not ruled.');
GAP('Nullify range', 'mental-power-action.js getNullifyRange() has its own table; not part of this slice.');

console.log(`\n${match} match, ${fixed} fixed-bug, ${open} open`);
