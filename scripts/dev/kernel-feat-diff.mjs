// File: scripts/dev/kernel-feat-diff.mjs v1.0.0 - 2026-09-01
// Acceptance tool for slice 3: exhaustively diffs the kernel-backed FEAT
// helpers against the pre-slice implementations. Expected output: ZERO
// requirement/success diffs, and applyCS diffs ONLY at the cosmic
// boundaries (the fixed rules bug). Run from repo root:
//   node scripts/dev/kernel-feat-diff.mjs

import { RANKS_ORDERED, shiftRank } from '../rules/rules-reference.js';
import { requiredColor, colorAtLeast, rankByKey } from '../lib/faserip-rules/faserip-kernel.js';
import { kernelKeyFor } from '../kernel/adapter.js';
import { requiredColorFromDelta, meetsThreshold } from '../modules/actions/nullify-utils.js';

const OLD_RANKS = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

// ── pre-slice implementations (frozen) ──
function oldRequirement(abilityRank, intensity) {
  const a = OLD_RANKS.indexOf(abilityRank), i = OLD_RANKS.indexOf(intensity);
  if (a === -1 || i === -1) return { requirement: "Any Color", impossible: false, automatic: false };
  const d = a - i;
  if (d < -1) return { requirement: "Red", impossible: true, automatic: false };
  if (d >= 3) return { requirement: "Automatic", impossible: false, automatic: true };
  if (d === -1) return { requirement: "Red", impossible: false, automatic: false };
  if (d === 0) return { requirement: "Yellow", impossible: false, automatic: false };
  return { requirement: "Green", impossible: false, automatic: false };
}
function oldApplyCS(rank, shift) {
  if (shift === 0) return rank;
  const idx = OLD_RANKS.indexOf(rank);
  if (idx === -1) return rank;
  return OLD_RANKS[Math.min(Math.max(idx + shift, 0), OLD_RANKS.length - 1)];
}
function oldCheckSuccess(resultColor, requirement) {
  const color = resultColor.toLowerCase();
  switch (requirement) {
    case "Green": return ["green", "yellow", "red"].includes(color);
    case "Yellow": return ["yellow", "red"].includes(color);
    case "Red": return color === "red";
    case "Automatic": return true;
    default: return true;
  }
}

// ── new implementations (as shipped in ability-feat-dialog.js) ──
function newRequirement(abilityRank, intensity) {
  const aKey = kernelKeyFor(abilityRank), iKey = kernelKeyFor(intensity);
  if (!aKey || !iKey) return { requirement: "Any Color", impossible: false, automatic: false };
  const needed = requiredColor(aKey, iKey);
  if (needed === "impossible") return { requirement: "Red", impossible: true, automatic: false };
  if (needed === "automatic") return { requirement: "Automatic", impossible: false, automatic: true };
  return { requirement: needed.charAt(0).toUpperCase() + needed.slice(1), impossible: false, automatic: false };
}
function newCheckSuccess(resultColor, requirement) {
  const needed = String(requirement).toLowerCase();
  if (!["green", "yellow", "red"].includes(needed)) return true;
  return colorAtLeast(String(resultColor).toLowerCase(), needed);
}

let diffs = 0;
const grid = ["None", ...OLD_RANKS];

console.log('=== determineFeatRequirement: old vs new (19x19 grid) ===');
for (const a of grid) for (const i of grid) {
  const o = JSON.stringify(oldRequirement(a, i)), n = JSON.stringify(newRequirement(a, i));
  if (o !== n) { console.log(`  DIFF ${a} vs ${i}: ${o} -> ${n}`); diffs++; }
}
console.log(diffs === 0 ? '  identical across the grid' : `  ${diffs} diffs (UNEXPECTED)`);

console.log('\n=== checkFeatSuccess: old vs new ===');
let sd = 0;
for (const c of ["white", "green", "yellow", "red"])
  for (const r of ["Green", "Yellow", "Red", "Automatic", "Any Color"]) {
    if (oldCheckSuccess(c, r) !== newCheckSuccess(c, r)) { console.log(`  DIFF ${c}/${r}`); sd++; }
  }
console.log(sd === 0 ? '  identical' : `  ${sd} diffs (UNEXPECTED)`);

console.log('\n=== applyCS: old vs new (expected diffs = cosmic clamp fixes only) ===');
let ad = 0;
for (const r of OLD_RANKS) for (let s = -4; s <= 4; s++) {
  const o = oldApplyCS(r, s), n = shiftRank(r, s);
  if (o !== n) { console.log(`  ${r} ${s >= 0 ? '+' : ''}${s}CS: "${o}" -> "${n}"`); ad++; }
}
console.log(`  ${ad} shift cells changed (all should involve Class 1000+/Beyond or Shift-Z ceiling)`);

console.log('\n=== requiredColorFromDelta vs kernel requiredColor (delta sweep) ===');
// delta = intensity index - ability index; verify against kernel over real rank pairs
let nd = 0;
const KEYS = OLD_RANKS.map(kernelKeyFor);
for (let a = 0; a < KEYS.length; a++) for (let i = 0; i < KEYS.length; i++) {
  const delta = i - a;
  const viaDelta = requiredColorFromDelta(delta);
  const viaKernel = requiredColor(KEYS[a], KEYS[i]);
  const map = { 'auto-fail': 'impossible', 'auto-success': 'automatic' };
  if ((map[viaDelta] ?? viaDelta) !== viaKernel) {
    console.log(`  DIFF delta ${delta} (${OLD_RANKS[a]} vs ${OLD_RANKS[i]}): ${viaDelta} vs kernel ${viaKernel}`); nd++;
  }
}
console.log(nd === 0 ? '  equivalent across all rank pairs' : `  ${nd} diffs (UNEXPECTED)`);

console.log('\n=== meetsThreshold sanity ===');
console.log('  yellow meets green:', meetsThreshold('yellow', 'green'), ' white meets green:', meetsThreshold('white', 'green'), ' auto-fail:', meetsThreshold('red', 'auto-fail'));

process.exit(diffs + sd + nd ? 1 : 0);
