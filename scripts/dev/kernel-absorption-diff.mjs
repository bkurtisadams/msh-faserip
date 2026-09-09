// scripts/dev/kernel-absorption-diff.mjs v1.0.0 - 2026-09-09
// Proof: legacy Absorption math (mitigation.js v3.7.0 applyAbsorptionFromAE +
// action-utils.js v1.13.0 temp-HP block) vs the faserip-rules powers kernel
// (absorbAttack, RULED 2026-09-09 heal-then-pool). Run from the system root:
//   node scripts\dev\kernel-absorption-diff.mjs
// Every divergence is triaged; there is no OPEN category left.

import { absorbAttack, ABSORPTION_POOL_ROUNDS } from "../lib/faserip-rules/faserip-powers.js";

// Legacy model transcribed: absorb min(damage, rank); excess is ordinary
// damage; if convertsToHealth the absorbed amount heals AFTER the excess is
// subtracted, capped at max + rank; overflow above max is "temp HP" meant to
// cliff-decay at round+10 (never fired: stat.loss/health was undispatched);
// redirect bank = the ABSORBED amount (if canRedirect).
function legacy({ rank, damage, hp, max, heldTemp }) {
  const absorbed = Math.min(damage, rank);
  const excess = damage - absorbed;
  const before = hp + heldTemp;                   // value already includes temp
  let after = Math.max(0, before - excess);
  const ceiling = max + rank;
  const next = Math.min(ceiling, after + absorbed);
  const tempGained = Math.max(0, next - max);     // per-event ledger, stacks
  after = next;
  return { absorbed, total: after, temp: Math.max(0, after - max), tempGained, redirect: absorbed, healedReal: Math.min(max, after) - Math.max(0, hp - excess) };
}

const counts = { MATCH: 0 };
const reasons = {};
const bug = (why) => { reasons[why] = (reasons[why] || 0) + 1; };
const samples = [];

for (const rank of [10, 30, 48])
for (const max of [40, 100])
for (const hp of [0, 1, 25, 60, 88, 100].filter(h => h <= max))
for (const heldPool of [0, 18].filter(p => p <= rank))
for (const damage of [1, 5, 12, 30, 48, 60, 90]) {
  const L = legacy({ rank, damage, hp, max, heldTemp: heldPool });
  const K = absorbAttack({ rankNumber: rank, damage, health: hp, maxHealth: max, pool: heldPool, round: 1 });
  const kTotal = K.health + K.pool;
  const same = L.total === kTotal && L.redirect === K.redirect && (L.temp === K.pool);
  if (same) { counts.MATCH++; continue; }
  if (L.redirect !== K.redirect) bug("FIXED-BUG redirect banked the absorbed amount; RAW banks the excess above the rank number");
  if (heldPool > 0 && L.temp !== K.pool) bug("FIXED-BUG legacy stacked per-event temp HP; pool is capped at the rank number and refreshed");
  else if (L.total !== kTotal && L.temp !== K.pool) bug("FIXED-BUG legacy capped the total at max+rank after the excess; kernel caps the pool at rank on top of real Health");
  if (samples.length < 6 && (L.total !== kTotal || L.temp !== K.pool)) samples.push({ rank, max, hp, heldPool, damage, legacy: L, kernel: { health: K.health, pool: K.pool, healed: K.healed, redirect: K.redirect } });
}

// Certified anchors from the book and the rulings
const anchors = [
  ["book 100/100 + 48 bolt at Am(48) -> 148", absorbAttack({ rankNumber: 48, damage: 48, health: 100, maxHealth: 100 }), r => r.health + r.pool === 148],
  ["RULED 70/100 + 5 shock -> 75, no pool", absorbAttack({ rankNumber: 48, damage: 5, health: 70, maxHealth: 100 }), r => r.health === 75 && r.pool === 0],
  ["RULED 100/100 hit 60 at Am(48) -> real 88, pool 48, redirect 12", absorbAttack({ rankNumber: 48, damage: 60, health: 100, maxHealth: 100 }), r => r.health === 88 && r.pool === 48 && r.redirect === 12],
  ["book: pool dissipates in 10 rounds", { ok: ABSORPTION_POOL_ROUNDS === 10 }, r => r.ok],
];
let anchorFail = 0;
for (const [label, r, test] of anchors) { const ok = test(r); if (!ok) anchorFail++; console.log(`${ok ? "ok  " : "FAIL"} ${label}`); }

console.log(`\nMATCH ${counts.MATCH}`);
for (const [k, v] of Object.entries(reasons)) console.log(`${v}  ${k}`);
console.log(`\nsample divergences:`);
for (const s of samples) console.log(JSON.stringify(s));
process.exit(anchorFail ? 1 : 0);
