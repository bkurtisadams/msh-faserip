// File: scripts/dev/kernel-damage-diff.mjs v1.0.0 - 2026-09-01
// Acceptance tool for slice 4a: proves computeBluntDamage/computeEdgedDamage
// logic is equivalent to the kernel damage module across the realistic grid,
// and the charging formula matches chargeDamageParts. Expected output: zero
// diffs everywhere except the noted cosmic-bump boundary (if any appear).
// Run from repo root: node scripts/dev/kernel-damage-diff.mjs

import { RANKS_ORDERED, RANK_RANGES, rankValue } from '../rules/rules-reference.js';
import { bluntDamage, meleeWeaponDamage, chargeDamage, chargeDamageParts } from '../lib/faserip-rules/faserip-damage.js';
import { kernelKeyFor } from '../kernel/adapter.js';

// The shipped compute logic (mirrors action-utils.js post-4a, minus notes)
function computeBlunt(strRank, strVal, matRank, weaponBase = 0) {
  const RANKS = RANKS_ORDERED;
  const getVal = (r) => rankValue(r) || 0;
  const sIdx = RANKS.indexOf(strRank), mIdx = RANKS.indexOf(matRank);
  if (sIdx < 0 || mIdx < 0) return Math.max(strVal, weaponBase);
  if (sIdx < mIdx) {
    const nextRankName = RANKS[sIdx + 1] || strRank;
    const bumped = RANK_RANGES[nextRankName]?.[0] ?? getVal(nextRankName);
    return Math.max(bumped, weaponBase);
  }
  return Math.max(Math.min(strVal, getVal(matRank)), weaponBase);
}
function computeEdged(strRank, strVal, matRank, weaponBase = 0) {
  const RANKS = RANKS_ORDERED;
  const getVal = (r) => rankValue(r) || 0;
  const sIdx = RANKS.indexOf(strRank), mIdx = RANKS.indexOf(matRank);
  if (sIdx < 0 || mIdx < 0) return Math.max(strVal, weaponBase);
  return Math.max(Math.min(strVal, getVal(matRank)), weaponBase);
}

const REAL = RANKS_ORDERED.filter(r => !["Shift-0", "Class 1000", "Class 3000", "Class 5000", "Beyond"].includes(r));
let diffs = 0;

console.log('=== computeBluntDamage vs kernel bluntDamage + weaponBase floor ===');
for (const sr of REAL) for (const mr of REAL) for (const base of [0, 10]) {
  const strVal = rankValue(sr);
  const mine = computeBlunt(sr, strVal, mr, base);
  const kern = Math.max(bluntDamage({ strength: strVal, weaponMaterialRank: kernelKeyFor(mr) }), base);
  if (mine !== kern) { console.log(`  DIFF ${sr}(${strVal}) vs ${mr} base ${base}: compute ${mine}, kernel ${kern}`); diffs++; }
}
console.log(diffs === 0 ? '  equivalent across the grid' : `  ${diffs} diffs`);

console.log('\n=== book anchors through the compute path ===');
const anchors = [
  ['Feeble', 2, 'Excellent', 0, 3, 'Aunt May + lead pipe'],
  ['Good', 10, 'Excellent', 0, 16, 'Daredevil + lead pipe'],
  ['Monstrous', 75, 'Excellent', 0, 20, 'Thing + lead pipe'],
];
for (const [sr, sv, mr, base, want, label] of anchors) {
  const got = computeBlunt(sr, sv, mr, base);
  console.log(`  ${got === want ? 'ok  ' : 'FAIL'} ${label}: ${got}`);
  if (got !== want) diffs++;
}

console.log('\n=== computeEdgedDamage vs kernel meleeWeaponDamage(...).max ===');
let ed = 0;
for (const sr of REAL) for (const mr of REAL) for (const base of [0, 10, 20]) {
  const strVal = rankValue(sr);
  const mine = computeEdged(sr, strVal, mr, base);
  const kern = meleeWeaponDamage({ listedDamage: base, strength: strVal, weaponMaterialRank: kernelKeyFor(mr) }).max;
  if (mine !== kern) { console.log(`  DIFF ${sr} vs ${mr} base ${base}: ${mine} vs ${kern}`); ed++; }
}
console.log(ed === 0 ? '  equivalent across the grid' : `  ${ed} diffs`);
diffs += ed;

console.log('\n=== charging formula vs kernel ===');
let cd = 0;
for (const end of [6, 10, 30, 75]) for (const ba of [0, 20, 40]) for (const areas of [1, 5, 10]) {
  const inline = Math.max(end, ba) + 2 * areas;
  const kern = chargeDamage({ endurance: end, bodyArmor: ba, areas });
  const parts = chargeDamageParts({ endurance: end, bodyArmor: ba, areas });
  if (inline !== kern || parts.total !== kern || parts.base + parts.speedBonus !== kern) {
    console.log(`  DIFF end ${end} ba ${ba} areas ${areas}`); cd++;
  }
}
console.log(cd === 0 ? '  equivalent (book example: End Gd(10), 10 areas -> ' + chargeDamage({ endurance: 10, areas: 10 }) + ')' : `  ${cd} diffs`);
diffs += cd;

process.exit(diffs ? 1 : 0);
