// scripts/dev/kernel-blindside-diff.mjs v1.0.0 - 2026-09-05
// Proof for the Blindside Karma refusal. Run from the system root:
//   node scripts/dev/kernel-blindside-diff.mjs
// The kernel says which FEATs Karma may not touch; this checks that the
// system actually has a path from an attacker's declaration to the target's
// FEAT, and that every dialog offering Karma on a forced FEAT closes it.

import { readFileSync } from "node:fs";
import { KARMA_FORBIDDEN_FEATS, karmaAllowedFor } from "../lib/faserip-rules/faserip-karma.js";

let match = 0, fixed = 0, open = 0, gap = 0;
const line = (verdict, what, msg) => {
  console.log(`${verdict.padEnd(9)} ${what.padEnd(26)} ${msg}`);
  if (verdict === "MATCH") match++;
  else if (verdict === "FIXED-BUG") fixed++;
  else if (verdict === "OPEN") open++;
  else gap++;
};

const read = (p) => {
  try { return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"); }
  catch { return readFileSync(p, "utf8"); }
};

console.log("blindside Karma refusal: kernel vs system\n");

// --- kernel policy ------------------------------------------------------
if (KARMA_FORBIDDEN_FEATS.includes("blindsided") && KARMA_FORBIDDEN_FEATS.includes("unexpected-attack")) {
  line("MATCH", "kernel forbidden list", "blindsided and unexpected-attack are refused");
} else {
  line("GAP", "kernel forbidden list", "blindside is not in KARMA_FORBIDDEN_FEATS");
}
if (karmaAllowedFor("blindsided") === false && karmaAllowedFor("blindsided", { forewarned: true }) === true) {
  line("MATCH", "forewarned exception", "Karma allowed again with previous warning");
} else {
  line("GAP", "forewarned exception", "karmaAllowedFor does not honour forewarned");
}

// --- attacker declaration ----------------------------------------------
const DIALOGS = [
  "scripts/modules/actions/blunt-attack-action.js",
  "scripts/modules/actions/edged-attack-action.js",
  "scripts/modules/actions/shooting-action.js",
  "scripts/modules/actions/throwing-edged-action.js",
  "scripts/modules/actions/throwing-blunt-action.js",
  "scripts/modules/actions/energy-action.js",
  "scripts/modules/actions/force-action.js",
  "scripts/modules/actions/charging-action.js",
];
for (const p of DIALOGS) {
  const src = read(p);
  const name = p.split("/").pop().replace("-action.js", "");
  const declares = /id="blindside-attack"/.test(src) && /const blindside = html\.find\('#blindside-attack'\)/.test(src);
  const returns = /resolve\(\{\s*\n\s*blindside,/.test(src);
  if (declares && returns) line("FIXED-BUG", name, "declares blindside and returns it on the choice");
  else line("GAP", name, `blindside ${declares ? "declared but not returned" : "control missing"}`);
}

// --- carriage to the target's FEAT --------------------------------------
const attack = read("scripts/modules/actions/attack-action.js");
const chip = /prefillData: \{\s*\n\s*blindside: !!choice\.blindside,/.test(attack);
const inline = /const inlinePrefill = \{\s*\n\s*blindside: !!choice\.blindside,/.test(attack);
if (chip && inline) line("FIXED-BUG", "attack-action prefill", "blindside stamped on chip and inline prefills");
else line("GAP", "attack-action prefill", `missing on ${!chip ? "chip" : "inline"} prefill`);

const HOOK_PATHS = [
  "scripts/modules/chat-hooks.js",
  "scripts/modules/chat/chat-hooks.js",
  "scripts/chat-hooks.js",
];
let hooks = "";
for (const p of HOOK_PATHS) { try { hooks = read(p); break; } catch { /* next */ } }
const merges = /Object\.assign\(prefill, chipPrefill\)/.test(hooks) && /prefill = JSON\.parse\(el\.dataset\.prefill/.test(hooks);
if (merges) line("MATCH", "chat-hooks prefill", "chip prefill forwarded wholesale, no key whitelist");
else line("GAP", "chat-hooks prefill", "chip prefill is filtered; blindside may not survive the hop");

const check = read("scripts/modules/actions/check-action.js");
const gated = /blindside = !!\(prefill\.blindside \|\| this\.opts\?\.blindside\)/.test(check)
  || /_blindside = !!\(prefill\.blindside \|\| this\.opts\?\.blindside\)/.test(check);
const honoured = /if \(!blindside\) \{/.test(check);
if (gated && honoured) line("MATCH", "check-action gate", "Slam/Stun/Kill skip the Karma offer when blindsided");
else line("GAP", "check-action gate", "the Karma offer is not gated on blindside");

// --- defence dialogs ----------------------------------------------------
const def = read("scripts/modules/actions/defense-action.js");
const defOpts = /const blindsided = !!this\.opts\?\.blindside;/.test(def);
const defDeclare = /id="blindside-declared"/.test(def);
const defForced = /_blind \? 0 : _k\.karmaToSpend/.test(def);
if (defOpts && defDeclare && defForced) {
  line("FIXED-BUG", "defense-action", "Dodge/Block/Evade/Catch refuse Karma when blindsided");
} else {
  line("GAP", "defense-action", "the defence dialog still offers Karma under a blindside");
}

// --- known limits -------------------------------------------------------
line("OPEN", "forewarned flag", "no UI for the previous-warning exception; declare by not ticking the box");
line("GAP", "+2CS to-hit", "the blindside attack bonus is a later slice; this is Karma only");

console.log(`\n${match} match / ${fixed} fixed-bug / ${open} open / ${gap} gap`);
process.exit(0);
