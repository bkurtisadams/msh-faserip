// scripts/dev/kernel-attack-diff.mjs — kernel slice 5 (blunt) acceptance.
// Run from the msh-faserip repo root: node scripts/dev/kernel-attack-diff.mjs
// Compares the legacy attack-path math retired in attack-action.js /
// blunt-attack-action.js / action-config.js against the vendored kernel.
// Exit 1 on any diff outside the expected (triaged) set.

import {
  RANKS, rankByKey, rankForNumber, rankDistance, shiftRank, requiredColor, colorAtLeast, colorForRoll, COLORS,
} from "../lib/faserip-rules/faserip-kernel.js";
import { EFFECT_COLUMNS, effectForColor, reduceEffectColor, resolveGrabBreak } from "../lib/faserip-rules/faserip-effects.js";
import { resolveFeat } from "../lib/faserip-rules/faserip-kernel.js";
import { AP_SHOT_SHIFT, RUBBER_SHOT, MERCY_SHOT, HEAT_SEEKER, explosiveShotDamage, canisterExplosiveDamage, incendiaryBurnIntensity, CANISTERS } from "../lib/faserip-rules/faserip-ammo.js";
import { bluntDamage, meleeWeaponDamage, bluntThrowDamage, chargeToHitShift, resolveChargeImpact, chargeDamageParts } from "../lib/faserip-rules/faserip-damage.js";

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

// 5b. EA follow-up gate + no effect reduction on the edged column
section("EA follow-up gate vs effectForColor; EA effect reduction refused");
for (const c of COLORS) {
  const tok = effectForColor("EA", c);
  const l = { slam: false, stun: c === "yellow", kill: c === "red" };
  const k = { slam: tok === "slam", stun: tok === "stun", kill: tok === "kill" };
  if (JSON.stringify(l) !== JSON.stringify(k)) fail(`EA follow-up ${c}: ${JSON.stringify(l)} vs ${JSON.stringify(k)}`);
}
for (const rolled of ["yellow", "red"]) {
  const r = reduceEffectColor("EA", rolled, 1);
  if (r.allowed || r.color !== rolled) fail(`EA reduce ${rolled}: expected refused, got ${JSON.stringify(r)}`);
}
console.log("  EA yellow=Stun red=Kill; reduceEffectColor refuses without 50 Karma (dialog offers no cap)");

// 5c. Claws limitation +2CS bump: legacy index clamp vs shiftRank
section("claws +2CS material bump: legacy index clamp vs shiftRank");
let clawKnown = 0;
for (const m of NAMES) {
  const i = NAMES.indexOf(m);
  const l = NAMES[Math.min(i + 2, NAMES.length - 1)];
  const key = KEY_OF[m];
  const k = rankDistance("SHZ", key) > 0 ? m : NAMES[RANKS.indexOf(shiftRank(key, 2))];
  if (l === k) continue;
  if (i >= NAMES.indexOf("Shift-Y")) { clawKnown++; continue; }
  fail(`claw bump ${m}: legacy ${l} vs kernel ${k}`);
}
known(`${clawKnown} ranks Shift-Y and above: legacy clamp ran past Shift-Z (to Beyond), kernel stops at Shift-Z / leaves Class ranks unshifted (unreachable: claws material is Fe-Un)`);

// 5e. Fo / En follow-up gates; Fo and En effect reduction refused (RULED 2026-09-02);
//     En reduction allowed at 50 Karma per step (killCapable); En free path is the
//     caller's Energy Generation exception, not the column.
section("Fo / En follow-up gates vs effectForColor");
for (const c of COLORS) {
  const fo = effectForColor("Fo", c), en = effectForColor("En", c);
  const lFo = { slam: false, stun: c === "red", kill: false };
  const kFo = { slam: fo === "slam", stun: fo === "stun", kill: fo === "kill" };
  const lEn = { slam: false, stun: false, kill: c === "red" };
  const kEn = { slam: en === "slam", stun: en === "stun", kill: en === "kill" };
  if (JSON.stringify(lFo) !== JSON.stringify(kFo)) fail(`Fo follow-up ${c}: ${JSON.stringify(lFo)} vs ${JSON.stringify(kFo)}`);
  if (JSON.stringify(lEn) !== JSON.stringify(kEn)) fail(`En follow-up ${c}: ${JSON.stringify(lEn)} vs ${JSON.stringify(kEn)}`);
}
section("Fo / En effect reduction: refused free; En allowed for 50 Karma per step");
for (const rolled of ["yellow", "red"]) {
  const fo = reduceEffectColor("Fo", rolled, 1);
  if (fo.allowed || fo.color !== rolled) fail(`Fo reduce ${rolled}: expected refused, got ${JSON.stringify(fo)}`);
  const enFree = reduceEffectColor("En", rolled, 1, 0);
  if (enFree.allowed || enFree.karmaCost !== 50) fail(`En reduce ${rolled} unpaid: expected refused/cost 50, got ${JSON.stringify(enFree)}`);
  const enPaid = reduceEffectColor("En", rolled, 1, 50);
  if (!enPaid.allowed || enPaid.karmaCost !== 50) fail(`En reduce ${rolled} paid: expected allowed/cost 50, got ${JSON.stringify(enPaid)}`);
}
const enTwo = reduceEffectColor("En", "red", 2, 100);
if (!enTwo.allowed || enTwo.color !== "green" || enTwo.karmaCost !== 100) fail(`En red->green for 100: got ${JSON.stringify(enTwo)}`);
known("Fo effect reduction: legacy pullEffect true (2026-08-31) -> false (RULED 2026-09-02, Force Attack section); force dialog never offered a cap, so no play change");

// 5f. Grapple family: effect tokens vs the colour gates the dialogs used to key on
section("Gp / Gb / Es effect tokens vs legacy colour gates");
for (const c of COLORS) {
  const gp = effectForColor("Gp", c), gb = effectForColor("Gb", c), es = effectForColor("Es", c);
  const lGp = { escapeBtn: c === "yellow" || c === "red", partial: c === "yellow", holdDmg: c === "red" };
  const kGp = { escapeBtn: gp === "partial" || gp === "hold", partial: gp === "partial", holdDmg: gp === "hold" };
  const lGb = LEGACY_EFFECTS.grabbing[c].toLowerCase(), kGb = gb;
  const lEs = { removeHold: c === "yellow" || c === "red", grappleBack: c === "red", escaped: c === "yellow" };
  const kEs = { removeHold: es === "escape" || es === "reverse", grappleBack: es === "reverse", escaped: es === "escape" };
  if (JSON.stringify(lGp) !== JSON.stringify(kGp)) fail(`Gp ${c}: ${JSON.stringify(lGp)} vs ${JSON.stringify(kGp)}`);
  if (lGb !== kGb) fail(`Gb ${c}: legacy ${lGb} vs kernel ${kGb}`);
  if (JSON.stringify(lEs) !== JSON.stringify(kEs)) fail(`Es ${c}: ${JSON.stringify(lEs)} vs ${JSON.stringify(kEs)}`);
}
section("rank compare (grapple movement / grab comparator): legacy indexOf vs rankDistance");
for (const a of NAMES) for (const b of NAMES) {
  const l = Math.sign(NAMES.indexOf(a) - NAMES.indexOf(b));
  const k = Math.sign(rankDistance(KEY_OF[b], KEY_OF[a]));
  if (l !== k) fail(`compare ${a} vs ${b}: legacy ${l} vs kernel ${k}`);
}
section("grabbing break: roll on the material column (colour = intact, white = broken)");
let gbN = 0, gbInverted = 0;
for (const m of SHIFTABLE) for (let roll = 1; roll <= 100; roll++) {
  const c = colorForRoll(KEY_OF[m], roll);
  const k = resolveGrabBreak({ materialRank: KEY_OF[m], roll });
  gbN++;
  if (k.intact !== (c !== "white") || k.broken !== (c === "white")) fail(`grab break ${m} roll ${roll}: colour ${c} but intact=${k.intact}`);
  // legacy model: STR-vs-material intensity FEAT, success = breaks (attacker STR = material for the comparison)
  const legacyBreaks = colorAtLeast(colorForRoll(KEY_OF[m], roll), "yellow");
  if (legacyBreaks !== k.broken) gbInverted++;
}
known(`${gbInverted} of ${gbN} grabbing-break cases differ from the retired model (STR-vs-material Intensity FEAT, success = breaks): RAW is a roll on the material column with white = breaks — fixed bug, grabbing-break.js v2.0.0`);
console.log(`  ${gbN} cases`);

// 5g. Charging: Ch follow-up gate, cap, movement bonus, object rebound
section("Ch follow-up gate vs effectForColor; Ch cap; movement bonus");
for (const c of COLORS) {
  const ch = effectForColor("Ch", c);
  const l = { slam: c === "yellow", stun: c === "red", kill: false };
  const k = { slam: ch === "slam", stun: ch === "stun", kill: ch === "kill" };
  if (JSON.stringify(l) !== JSON.stringify(k)) fail(`Ch follow-up ${c}: ${JSON.stringify(l)} vs ${JSON.stringify(k)}`);
}
for (const rolled of order) for (const cap of ["green", "yellow"]) {
  const steps = order.indexOf(rolled) - order.indexOf(cap);
  const legacy = steps > 0 ? cap : rolled;
  const k = steps > 0 ? reduceEffectColor("Ch", rolled, steps).color : rolled;
  if (legacy !== k) fail(`Ch cap ${rolled}->${cap}: legacy ${legacy} vs kernel ${k}`);
}
for (let areas = 0; areas <= 12; areas++) {
  const l = Math.min(3, areas), k = chargeToHitShift(areas) ?? 0;
  if (l !== k) fail(`movement bonus ${areas} areas: legacy ${l} vs kernel ${k}`);
}
section("charging into an object: legacy rebound vs resolveChargeImpact");
let objN = 0, objKnown = 0;
for (const dmg of [10, 20, 30, 40, 50, 75, 100]) for (const mat of [0, 6, 10, 20, 30, 40, 50, 100]) for (const ba of [0, 10, 20, 30]) {
  const legacyObj = Math.max(0, dmg - mat);
  const legacyAtt = mat > dmg ? Math.max(0, mat - ba) : 0;
  const k = resolveChargeImpact({ damage: dmg, targetDefense: mat, attackerDefense: ba });
  objN++;
  if (legacyObj !== k.targetTakes) fail(`object takes dmg ${dmg} mat ${mat}: legacy ${legacyObj} vs kernel ${k.targetTakes}`);
  if (legacyAtt !== k.attackerTakes) objKnown++;
}
known(`${objKnown} of ${objN} object-charge cases: legacy rebounded only when material > damage and returned the FULL material value; kernel/character path rebound min(damage, material) on every hit through attacker BA (book example: 30 dmg vs Ex 20 BA, Gd 10 BA attacker takes 10) — fixed bug`);

// 5g-b. Slam collision: legacy collision-damage math vs kernel chargeDamageParts + resolveChargeImpact
section("slam collision: legacy formula vs kernel");
let colN = 0;
for (const end of [6, 10, 20, 30, 50]) for (const ba of [0, 10, 20, 40]) for (const areas of [1, 2, 3, 5]) for (const obs of [0, 10, 20, 40, 100]) {
  const total = Math.max(end, ba) + 2 * areas;
  const absorbed = Math.min(obs, total);
  const lObs = total - absorbed, lSelf = Math.max(0, absorbed - ba);
  const parts = chargeDamageParts({ endurance: end, bodyArmor: ba, areas });
  const k = resolveChargeImpact({ damage: parts.total, targetDefense: obs, attackerDefense: ba });
  colN++;
  if (parts.total !== total || k.targetTakes !== lObs || k.attackerTakes !== lSelf) fail(`collision end ${end} ba ${ba} areas ${areas} obs ${obs}: legacy ${total}/${lObs}/${lSelf} vs kernel ${parts.total}/${k.targetTakes}/${k.attackerTakes}`);
}
console.log(`  ${colN} cases (legacy collision math already matched the kernel model)`);

// 5h. Shooting: Sh follow-up gate (+ Aim: Stun), Rubber Shot on BA with Slam suppressed, ammo constants
section("Sh follow-up gate vs effectForColor; Aim: Stun; Rubber on BA");
for (const c of COLORS) {
  const sh = effectForColor("Sh", c);
  for (const aim of ["none", "stun"]) {
    const l = { slam: false, stun: aim === "stun" && c === "yellow", kill: c === "red" };
    const k = { slam: sh === "slam", stun: sh === "stun" || (aim === "stun" && sh === "bullseye"), kill: sh === "kill" };
    if (JSON.stringify(l) !== JSON.stringify(k)) fail(`Sh follow-up ${c} aim=${aim}: ${JSON.stringify(l)} vs ${JSON.stringify(k)}`);
  }
  const ba = effectForColor("BA", c);
  const lRub = { slam: false, stun: c === "red", label: LEGACY_EFFECTS["blunt-attack"][c] === "Slam" ? "Hit" : LEGACY_EFFECTS["blunt-attack"][c] };
  const kRub = { slam: ba === "slam" && !RUBBER_SHOT.suppressSlam, stun: ba === "stun", label: ba === "slam" ? "Hit" : LABEL[ba] };
  if (JSON.stringify(lRub) !== JSON.stringify(kRub)) fail(`Rubber ${c}: ${JSON.stringify(lRub)} vs ${JSON.stringify(kRub)}`);
}
for (const rolled of ["yellow", "red"]) {
  const r = reduceEffectColor("Sh", rolled, 1);
  if (r.allowed || r.karmaCost !== 50) fail(`Sh reduce ${rolled}: expected refused/cost 50, got ${JSON.stringify(r)}`);
}
section("ammo constants vs legacy literals");
if (-AP_SHOT_SHIFT !== 2) fail(`AP shot shift ${AP_SHOT_SHIFT}`);
if (explosiveShotDamage(10) !== 20 || canisterExplosiveDamage(10) !== 20) fail("explosive x2");
if (MERCY_SHOT.damage !== 0 || MERCY_SHOT.drugIntensity !== "RM") fail("mercy shot");
if (!HEAT_SEEKER.noRangePenalty) fail("heat seeker");
if (CANISTERS.gas.intensity !== "IN" || CANISTERS.knockOut.intensity !== "RM" || CANISTERS.smoke.intensity !== "EX") fail("canister intensities");
if (incendiaryBurnIntensity(20) !== "EX" || incendiaryBurnIntensity(40) !== "IN") fail("incendiary intensity");
console.log("  AP -2CS, explosive x2, mercy 0 dmg / Rm drug, heat-seeker no range penalty, canister In/Rm/Ex, incendiary = damage rank");

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
