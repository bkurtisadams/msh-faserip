// scripts/dev/kernel-attack-diff.mjs — kernel slice 5 (blunt) acceptance.
// Run from the msh-faserip repo root: node scripts/dev/kernel-attack-diff.mjs
// Compares the legacy attack-path math retired in attack-action.js /
// blunt-attack-action.js / action-config.js against the vendored kernel.
// Exit 1 on any diff outside the expected (triaged) set.

import {
  RANKS, rankByKey, rankForNumber, rankDistance, shiftRank, requiredColor, colorAtLeast, COLORS,
} from "../lib/faserip-rules/faserip-kernel.js";
import { EFFECT_COLUMNS, effectForColor, reduceEffectColor } from "../lib/faserip-rules/faserip-effects.js";
import { bluntDamage, meleeWeaponDamage } from "../lib/faserip-rules/faserip-damage.js";

const NAMES = RANKS.map(r => {
  if (r.key === "SH0") return "Shift-0";
  if (["SHX", "SHY", "SHZ"].includes(r.key)) return r.name.replace(" ", "-");
  return r.name;
});
const KEY_OF = Object.fromEntries(NAMES.map((n, i) => [n, RANKS[i].key]));
const SHIFTABLE = NAMES.slice(0, NAMES.indexOf("Shift-Z") + 1);

const LABEL = {
  miss: "Miss", hit: "Hit", slam: "Slam", stun: "Stun", kill: "Kill", bullseye: "Bullseye",
  partial: "Partial", hold: "Hold", take: "Take", grab: "Grab", break: "Break", escape: "Escape",
  reverse: "Reverse", none: "None", autohit: "Auto-hit", evasion: "Evasion",
  "evasion+1cs": "Evasion +1CS", "evasion+2cs": "Evasion +2CS",
  "cs-2": "-2 CS", "cs-4": "-4 CS", "cs-6": "-6 CS", "cs+1": "+1 CS", catch: "Catch", damage: "Damage",
};

let failures = 0, expected = 0;
const fail = (s) => { failures++; console.log("  DIFF  " + s); };
const known = (s) => { expected++; console.log("  RULED " + s); };
const section = (t) => console.log("\n== " + t);

// 1. action-config ACTION_EFFECTS (legacy literal) vs kernel-derived labels
section("ACTION_EFFECTS literal vs kernel EFFECT_COLUMNS");
const LEGACY_EFFECTS = {
  "blunt-attack":   { white:"Miss", green:"Hit", yellow:"Slam",    red:"Stun" },
  "edged-attack":   { white:"Miss", green:"Hit", yellow:"Stun",    red:"Kill" },
  "shooting":       { white:"Miss", green:"Hit", yellow:"Bullseye",red:"Kill" },
  "throwing-edged": { white:"Miss", green:"Hit", yellow:"Stun",    red:"Kill" },
  "throwing-blunt": { white:"Miss", green:"Hit", yellow:"Hit",     red:"Stun" },
  "energy":         { white:"Miss", green:"Hit", yellow:"Bullseye",red:"Kill" },
  "force":          { white:"Miss", green:"Hit", yellow:"Bullseye",red:"Stun" },
  "grappling":      { white:"Miss", green:"Miss",yellow:"Partial", red:"Hold" },
  "grabbing":       { white:"Miss", green:"Take",yellow:"Grab",    red:"Break" },
  "escaping":       { white:"Miss", green:"Miss",yellow:"Escape",red:"Reverse" },
  "charging":       { white:"Miss", green:"Hit", yellow:"Slam",    red:"Stun" },
  "dodging":        { white:"None", green:"-2 CS",yellow:"-4 CS",  red:"-6 CS" },
  "evading":        { white:"Auto-hit", green:"Evasion", yellow:"Evasion +1CS", red:"Evasion +2CS" },
  "blocking":       { white:"-6 CS",green:"-4 CS",yellow:"-2 CS",  red:"+1 CS" },
  "catching":       { white:"Autohit", green:"Miss", yellow:"Damage", red:"Catch" },
};
const COLUMNS = {
  "blunt-attack":"BA","edged-attack":"EA","shooting":"Sh","throwing-edged":"TE","throwing-blunt":"TB",
  "energy":"En","force":"Fo","grappling":"Gp","grabbing":"Gb","escaping":"Es","charging":"Ch",
  "dodging":"Do","evading":"Ev","blocking":"Bl","catching":"Ca",
};
for (const [type, code] of Object.entries(COLUMNS)) {
  for (const color of COLORS) {
    const k = LABEL[EFFECT_COLUMNS[code].results[color]];
    const l = LEGACY_EFFECTS[type][color];
    if (k === l) continue;
    if (type === "throwing-blunt" && color === "yellow") known(`${type}.${color}: ${l} -> ${k} (TB yellow = Bullseye, RULED 2026-08-31)`);
    else if (type === "catching" && color === "white") known(`${type}.${color}: ${l} -> ${k} (label spelling unified with Evading)`);
    else fail(`${type}.${color}: legacy ${l} vs kernel ${k}`);
  }
}

// 2. FEAT requirement: legacy index ladder vs requiredColor (all shiftable ranks x intensities)
section("multi-attack FEAT requirement ladder vs requiredColor");
const legacyNeeded = (d) => d >= 3 ? "automatic" : d <= -2 ? "impossible" : d > 0 ? "green" : d === 0 ? "yellow" : "red";
let n2 = 0;
for (const a of NAMES) for (const i of NAMES) {
  const d = NAMES.indexOf(a) - NAMES.indexOf(i);
  const k = requiredColor(KEY_OF[a], KEY_OF[i]);
  n2++;
  if (legacyNeeded(d) !== k) fail(`need ${a} vs ${i}: legacy ${legacyNeeded(d)} vs kernel ${k}`);
}
console.log(`  ${n2} pairs`);

// 3. FEAT success: legacy colour ladder (green if above, yellow if equal, red if below) vs colorAtLeast
section("multi-attack FEAT success ladder vs colorAtLeast");
const legacySuccess = (aIdx, iIdx, c) =>
  aIdx > iIdx ? ["green","yellow","red"].includes(c) : aIdx === iIdx ? ["yellow","red"].includes(c) : c === "red";
const featSuccess = (c, needed) => needed === "automatic" ? true : needed === "impossible" ? false : colorAtLeast(c, needed);
let n3 = 0, impossibleRed = 0, autoWhite = 0;
for (const a of SHIFTABLE) for (const i of SHIFTABLE) for (const c of COLORS) {
  const aIdx = NAMES.indexOf(a), iIdx = NAMES.indexOf(i);
  const needed = requiredColor(KEY_OF[a], KEY_OF[i]);
  const l = legacySuccess(aIdx, iIdx, c), k = featSuccess(c, needed);
  n3++;
  if (l === k) continue;
  if (needed === "impossible" && c === "red" && l && !k) { impossibleRed++; continue; }
  if (needed === "automatic" && c === "white" && !l && k) { autoWhite++; continue; }
  fail(`success ${a} vs ${i} ${c}: legacy ${l} vs kernel ${k} (needed ${needed})`);
}
known(`${impossibleRed} cases: post-CS rank 2+ below intensity, legacy let a red succeed; kernel = impossible (USE_IMPOSSIBLE was already applied pre-dialog on the unshifted rank)`);
known(`${autoWhite} cases: post-CS rank 3+ above intensity on a white roll, legacy failed; kernel = automatic (RULED 2026-09-01: automatic succeeds regardless of the roll; reachable only when dialog CS lifts a non-auto rank into the auto band)`);
console.log(`  ${n3} cases`);

// 4. Pull-punch result cap (BA): legacy order clamp vs reduceEffectColor
section("pull-punch cap vs reduceEffectColor('BA')");
const order = ["white","green","yellow","red"];
for (const rolled of order) for (const cap of ["green","yellow"]) {
  const steps = order.indexOf(rolled) - order.indexOf(cap);
  const legacy = steps > 0 ? cap : rolled;
  const k = steps > 0 ? reduceEffectColor("BA", rolled, steps).color : rolled;
  if (legacy !== k) fail(`cap ${rolled}->${cap}: legacy ${legacy} vs kernel ${k}`);
}

// 5. Follow-up gate (BA): legacy yellow=slam/red=stun vs effectForColor
section("BA follow-up gate vs effectForColor");
for (const c of COLORS) {
  const tok = effectForColor("BA", c);
  const l = { slam: c === "yellow", stun: c === "red", kill: false };
  const k = { slam: tok === "slam", stun: tok === "stun", kill: tok === "kill" };
  if (JSON.stringify(l) !== JSON.stringify(k)) fail(`follow-up ${c}: ${JSON.stringify(l)} vs ${JSON.stringify(k)}`);
}

// 6. AP-CS armor step: legacy _RV walk vs range-true (mitigation applyArmorPiercingCS semantics)
section("AP-CS armor step: legacy _RV walk vs range-true");
const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
const legacyAP = (armor, cs) => {
  let i = _RV.findIndex(v => v >= armor);
  if (i < 0) i = _RV.length - 1;
  if (i > 0 && _RV[i] > armor) i--;
  return _RV[Math.max(0, i - cs)];
};
const rangeTrueAP = (armor, cs) => {
  const r = rankForNumber(armor);
  if (rankDistance("SHZ", r.key) > 0) return r.standard;   // Class 1000+ unshiftable
  return shiftRank(r.key, -cs).standard;
};
let n6 = 0, apKnown = 0;
const apSamples = [];
for (let armor = 1; armor <= 1200; armor++) for (const cs of [1, 2, 3]) {
  const l = legacyAP(armor, cs), k = rangeTrueAP(armor, cs);
  n6++;
  if (l === k) continue;
  apKnown++;
  if (RANKS.some(r => r.standard === armor) && apSamples.length < 8) apSamples.push(`${armor}-${cs}CS: ${l}->${k}`);
}
known(`${apKnown} cases: legacy _RV table mixes range minimums (1,3,5,8,16,26...) with stale cosmic values, so the walk returned a range MINIMUM (Ex 20 -1CS -> 8); kernel/mitigation applyArmorPiercingCS returns the shifted rank's standard number (-> 10), range-true (4b, certified 30/30). Samples: ${apSamples.join(", ")}`);
console.log(`  ${n6} cases`);

// 7. Breaking FEAT gate: legacy name-index compare vs rankDistance; value fallback vs range-true
section("Breaking FEAT gate vs rankDistance");
for (const w of NAMES) for (const t of NAMES) {
  const l = NAMES.indexOf(w) < NAMES.indexOf(t);
  const k = rankDistance(KEY_OF[w], KEY_OF[t]) > 0;
  if (l !== k) fail(`gate ${w} vs ${t}: legacy ${l} vs kernel ${k}`);
}
const LEGACY_RV = [0, 1, 3, 5, 8, 16, 26, 36, 46, 63, 88, 150, 250, 500, 1000, 3000, 5000, Infinity];
let fbKnown = 0;
for (let v = 1; v <= 6000; v++) {
  let l = null;
  for (let i = LEGACY_RV.length - 1; i >= 0; i--) if (v >= LEGACY_RV[i]) { l = NAMES[i]; break; }
  const k = NAMES[RANKS.indexOf(rankForNumber(v))];
  if (l === k) continue;
  if (v >= 126 && v < 1000) { fbKnown++; continue; }
  fail(`fallback ${v}: legacy ${l} vs kernel ${k}`);
}
known(`${fbKnown} values in 126-999: legacy cosmic thresholds (150/250/500) vs kernel ranges (ShX 126, ShY 176, ShZ 351)`);

// 8. Blunt / edged damage wrappers vs kernel (re-proof of 4a through the new wrappers' inputs)
section("blunt / edged damage: legacy formula vs kernel");
let n8 = 0;
for (const s of RANKS.slice(0, 11)) for (const m of RANKS.slice(1, 11)) for (const base of [0, 6, 10]) {
  const sIdx = RANKS.indexOf(s), mIdx = RANKS.indexOf(m);
  const legacyB = Math.max(sIdx < mIdx ? RANKS[sIdx + 1].min : Math.min(s.standard, m.standard), base);
  const kB = Math.max(bluntDamage({ strength: s.standard, weaponMaterialRank: m.key }), base);
  const legacyE = Math.max(Math.min(s.standard, m.standard), base);
  const kE = meleeWeaponDamage({ listedDamage: base, strength: s.standard, weaponMaterialRank: m.key }).max;
  n8++;
  if (legacyB !== kB) fail(`blunt ${s.name}/${m.name}/${base}: legacy ${legacyB} vs kernel ${kB}`);
  if (legacyE !== kE) fail(`edged ${s.name}/${m.name}/${base}: legacy ${legacyE} vs kernel ${kE}`);
}
console.log(`  ${n8} combos`);

console.log(`\n${failures} unexpected diff(s), ${expected} ruled/known diff classes`);
process.exit(failures ? 1 : 0);
