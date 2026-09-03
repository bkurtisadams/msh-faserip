// scripts/dev/kernel-karma-diff.mjs — kernel slice 6 acceptance.
// Run from the msh-faserip repo root: node scripts/dev/kernel-karma-diff.mjs
// Legacy karma sheet numbers vs the vendored faserip-karma kernel.

import { RANKS, rankForNumber } from "../lib/faserip-rules/faserip-kernel.js";
import {
  CRIME_KARMA, COMMITMENT_KARMA, GAMING_AWARDS, DEFEAT_LOSS, SPECIAL_DEATH_LOSS,
  rescueAward, ADVANCEMENT, advancementOptions, splitGroupAward, applyKarmaDelta,
  powerAdditionCost, TALENT_ADDITION_COST, contactAdditionCost, poolLeaveShare,
  MIN_KARMA_DECLARATION, EFFECT_REDUCTION_COST, POWER_STUNT_COST,
} from "../lib/faserip-rules/faserip-karma.js";
import { spendCost, advancementCost } from "../karma-costs.js";

let failures = 0, expected = 0;
const fail = (s) => { failures++; console.log("  DIFF  " + s); };
const known = (s) => { expected++; console.log("  RULED " + s); };
const section = (t) => console.log("\n== " + t);

// 1. Add Karma dialog base amounts (legacy literal) vs kernel
section("Add Karma base amounts: legacy literal vs kernel");
const LEGACY = {
  "Violent Crime - Stop": 30, "Violent Crime - Arrest": 15, "Destructive Crime - Stop": 20, "Destructive Crime - Arrest": 10,
  "Theft - Stop": 10, "Theft - Arrest": 5, "Robbery - Stop": 20, "Robbery - Arrest": 10, "Misdemeanor - Stop": 5, "Misdemeanor - Arrest": 5,
  "National Offense - Stop": 20, "National Offense - Arrest": 10, "Local Conspiracy - Stop": 30, "Local Conspiracy - Arrest": 15,
  "National Conspiracy - Stop": 40, "National Conspiracy - Arrest": 20, "Global Conspiracy - Stop": 50, "Global Conspiracy - Arrest": 25,
  "Other Crime - Stop": 15, "Other Crime - Arrest": 5, "Rescue": 20, "Multiple Rescues (5+)": 100,
  "Personal Commitment": 5, "Weekly Award": 10, "Failing Commitment": -10, "Leaving Early": -5,
  "Role-Playing": 10, "Stump the Judge": 15, "Humor Award": 5,
  "Commit Violent Crime": -60, "Commit Destructive Crime": -40, "Commit Theft": -20, "Commit Robbery": -20, "Commit Misdemeanor": -10,
  "Commit National Offense": -40, "Commit Other Crime": -20, "Public Defeat": -40, "Private Defeat": -20,
  "Permit Violent Crime": -15, "Permit Destructive Crime": -10, "Permit Theft": -5, "Permit Robbery": -10, "Permit Misdemeanor": -5,
  "Permit National Offense": -10, "Permit Other Crime": -5, "Property Damage": -5,
  "Noble Death": -50, "Mysterious Death": -50, "Self-Destruction": -50,
};
const CLASSES = [["violent","Violent Crime"],["destructive","Destructive Crime"],["theft","Theft"],["robbery","Robbery"],["misdemeanor","Misdemeanor"],
  ["nationalOffense","National Offense"],["localConspiracy","Local Conspiracy"],["nationalConspiracy","National Conspiracy"],["globalConspiracy","Global Conspiracy"],["other","Other Crime"]];
const kernelAmounts = {};
for (const [k, l] of CLASSES) {
  kernelAmounts[`${l} - Stop`] = CRIME_KARMA[k].stop; kernelAmounts[`${l} - Arrest`] = CRIME_KARMA[k].arrest;
  kernelAmounts[`Commit ${l}`] = CRIME_KARMA[k].commit; kernelAmounts[`Permit ${l}`] = CRIME_KARMA[k].permit;
}
Object.assign(kernelAmounts, {
  "Rescue": rescueAward(1), "Multiple Rescues (5+)": rescueAward(5),
  "Personal Commitment": COMMITMENT_KARMA.make, "Weekly Award": COMMITMENT_KARMA.weeklyMax,
  "Failing Commitment": COMMITMENT_KARMA.failToShow, "Leaving Early": COMMITMENT_KARMA.leaveEarly,
  "Role-Playing": GAMING_AWARDS.rolePlayMax, "Stump the Judge": GAMING_AWARDS.stumpTheJudgeMax, "Humor Award": GAMING_AWARDS.humor,
  "Public Defeat": DEFEAT_LOSS.public, "Private Defeat": DEFEAT_LOSS.private, "Property Damage": -5,
  "Noble Death": SPECIAL_DEATH_LOSS, "Mysterious Death": SPECIAL_DEATH_LOSS, "Self-Destruction": SPECIAL_DEATH_LOSS,
});
let missing = [];
for (const [k, v] of Object.entries(kernelAmounts)) {
  if (!(k in LEGACY)) { missing.push(`${k} (${v})`); continue; }
  if (LEGACY[k] === v) continue;
  if (k === "Commit Robbery") known(`Commit Robbery: legacy -20 -> kernel ${v} (2x stop; sheet value copied Theft) — fixed bug`);
  else if (k === "Commit Other Crime") known(`Commit Other Crime: legacy -20 -> kernel ${v} (RULED 2026-08-31, Summary Listing)`);
  else fail(`${k}: legacy ${LEGACY[k]} vs kernel ${v}`);
}
known(`${missing.length} rows absent from the legacy dialog, now added: ${missing.join(", ")}`);
console.log(`  ${Object.keys(kernelAmounts).length} event types compared`);

// 2. Ability advancement: legacy per-point loop vs kernel advancementOptions chain
section("ability advancement: legacy loop vs advancementOptions");
const legacyCost = (from, to) => {
  let total = 0, cv = from, curRank = rankForNumber(cv).key;
  for (let i = 0; i < to - from; i++) {
    total += 10 * cv; const nv = cv + 1; const nRank = rankForNumber(nv).key;
    if (nRank !== curRank) { total += 400; curRank = nRank; }
    cv = nv;
  }
  return total;
};
const kernelCost = (from, to) => {
  let total = 0, cv = from;
  while (cv < to) {
    const o = advancementOptions({ current: cv, kind: "ability" });
    if (o.step) { total += o.step.cost; cv = o.step.to; }
    else { total += o.crest.cost; cv = o.crest.to; }
  }
  return total;
};
let advN = 0;
for (let from = 1; from <= 120; from++) for (let to = from + 1; to <= Math.min(from + 20, 125); to++) {
  advN++;
  const l = legacyCost(from, to), k = kernelCost(from, to);
  if (l !== k) fail(`advance ${from}->${to}: legacy ${l} vs kernel ${k}`);
}
console.log(`  ${advN} ranges (book anchors: 14->15 = ${kernelCost(14,15)}, 15->16 = ${kernelCost(15,16)})`);
if (kernelCost(14,15) !== 140 || kernelCost(15,16) !== 550) fail("book anchors 140 / 550");
if (ADVANCEMENT.ability.multiplier !== 10 || ADVANCEMENT.ability.crestFee !== 400) fail("ability advancement constants");

// 3. Ledger floor and group split
section("ledger floor and group split");
for (const cur of [0, 5, 30]) for (const delta of [-60, -5, 0, 20]) {
  const l = Math.max(0, cur + delta), k = applyKarmaDelta(cur, delta);
  if (l !== k) fail(`delta ${cur}${delta >= 0 ? "+" : ""}${delta}: ${l} vs ${k}`);
}
for (const total of [100, 185, 33]) for (const n of [1, 2, 3, 4]) {
  const l = Math.floor(total / n), k = splitGroupAward(total, n);
  if (l !== k) fail(`split ${total}/${n}: ${l} vs ${k}`);
}
console.log("  Math.max(0, ...) == applyKarmaDelta; Math.floor(gross/heroes) == splitGroupAward");

// 4. Spend Karma: legacy flat defaults vs kernel-computed costs (slice 6b)
section("Spend Karma defaults: legacy flat values vs kernel formulas");
const LEGACY_SPEND = { "Die Roll": 10, "Reduce Effect": 50, "Power Stunt": 100, "Power Advancement": 100, "Power Addition": 3000,
  "Resource Advancement": 100, "Popularity Advancement": 50, "Talent Addition": 1000, "Contact Addition": 500 };
if (spendCost("Die Roll") !== MIN_KARMA_DECLARATION || spendCost("Reduce Effect") !== EFFECT_REDUCTION_COST || spendCost("Power Stunt") !== POWER_STUNT_COST) fail("constant spend costs");
for (const t of ["Die Roll", "Reduce Effect", "Power Stunt"]) if (spendCost(t) !== LEGACY_SPEND[t]) fail(`${t}: legacy ${LEGACY_SPEND[t]} vs kernel ${spendCost(t)}`);
known(`Power/Resource/Popularity Advancement and Power/Talent/Contact Addition were flat editable defaults (100/100/50/3000/1000/500); now computed: e.g. Power Rm(30)+1 = ${spendCost("Power Advancement",{current:30,points:1})}, Resource 20+1 = ${spendCost("Resource Advancement",{current:20,points:1})}, Popularity 15+1 = ${spendCost("Popularity Advancement",{current:15,points:1})}, Power Addition Ty(6) = ${spendCost("Power Addition",{startingRank:6})}, Talent from PC = ${spendCost("Talent Addition",{source:"fromPC"})}, Contact Gd(10) = ${spendCost("Contact Addition",{resourceRank:10})}`);
// advancementCost (all kinds) == chained kernel advancementOptions
for (const kind of ["ability", "power", "resource", "popularity"]) for (let from = 1; from <= 100; from += 3) for (const pts of [1, 2, 5, 12]) {
  let cv = from, total = 0;
  for (let i = 0; i < pts; i++) { const o = advancementOptions({ current: cv, kind }); if (o.step) { total += o.step.cost; cv = o.step.to; } else if (o.crest) { total += o.crest.cost; cv = o.crest.to; } else break; }
  const r = advancementCost({ kind, current: from, points: pts });
  if (r.total !== total || r.newValue !== cv) fail(`advancementCost ${kind} ${from}+${pts}: ${r.total}/${r.newValue} vs ${total}/${cv}`);
}
const o61 = advancementOptions({ current: 61, kind: "power" }), o62 = advancementOptions({ current: 62, kind: "power" });
if (o61.crest || !o61.step || o61.step.cost !== 1220) fail(`61: crest must not be offered mid-rank: ${JSON.stringify(o61)}`);
if (o62.step || !o62.crest || o62.crest.cost !== 1740 || o62.crest.to !== 63) fail(`62: crest 62->63 for 1740: ${JSON.stringify(o62)}`);
const walk60 = advancementCost({ kind: "power", current: 60, points: 3 });
if (walk60.total !== 1200 + 1220 + 1740 || walk60.newValue !== 63) fail(`Coldboy 60->63: ${JSON.stringify(walk60)}`);
known(`RULED 2026-09-02: one rank number at a time, crest at the boundary — Coldboy Am(60)->Mn(63) = 1200 + 1220 + 1740 = ${walk60.total}; the book's 61->63 for 1720 is an error (62 skipped)`);
console.log("  advancementCost == chained advancementOptions for ability/power/resource/popularity; crest offered only from the rank's top number");
// pool equal share
for (const pool of [100, 185, 33]) for (const n of [1, 2, 3, 4]) if (Math.floor(pool / n) !== poolLeaveShare(pool, n)) fail(`pool share ${pool}/${n}`);
console.log("  Math.floor(pool/members) == poolLeaveShare");

console.log(`\n${failures} unexpected diff(s), ${expected} ruled/known diff classes`);
process.exit(failures ? 1 : 0);
