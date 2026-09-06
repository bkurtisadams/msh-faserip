// scripts/dev/kernel-reduction-diff.mjs v1.0.0 - 2026-09-05
// Proof for the Karma effect-reduction slice. Run from the system root:
//   node scripts/dev/kernel-reduction-diff.mjs
// Checks the kernel's per-column reduction policy against what each attack
// dialog actually renders, so a column can never silently lose the control
// that makes its RAW-legal reduction reachable.
//
// Verdicts: MATCH (kernel and dialog agree), FIXED-BUG (this slice changed
// behaviour to match the book), OPEN (ledgered ruling outstanding),
// GAP (no code path yet).

import { readFileSync } from "node:fs";
import { EFFECT_COLUMNS, reduceEffectColor } from "../lib/faserip-rules/faserip-effects.js";
import { EFFECT_REDUCTION_COST } from "../lib/faserip-rules/faserip-karma.js";

const DIALOGS = {
  BA: "scripts/modules/actions/blunt-attack-action.js",
  EA: "scripts/modules/actions/edged-attack-action.js",
  Sh: "scripts/modules/actions/shooting-action.js",
  TE: "scripts/modules/actions/throwing-edged-action.js",
  TB: "scripts/modules/actions/throwing-blunt-action.js",
  En: "scripts/modules/actions/energy-action.js",
  Fo: "scripts/modules/actions/force-action.js",
  Ch: "scripts/modules/actions/charging-action.js",
};

// Columns whose effect the book forbids pulling for free. RULED 2026-09-05:
// thrown edged is an Edged Attack for this rule.
const PAID = new Set(["EA", "Sh", "TE", "En"]);

let match = 0, fixed = 0, open = 0, gap = 0;
const line = (verdict, col, msg) => {
  console.log(`${verdict.padEnd(9)} ${col.padEnd(3)} ${msg}`);
  if (verdict === "MATCH") match++;
  else if (verdict === "FIXED-BUG") fixed++;
  else if (verdict === "OPEN") open++;
  else gap++;
};

console.log(`kernel reduction policy vs dialogs (cost ${EFFECT_REDUCTION_COST}/colour)\n`);

for (const [col, path] of Object.entries(DIALOGS)) {
  const cfg = EFFECT_COLUMNS[col];
  const free = cfg.reduceEffect === true;
  const paid = !free && cfg.killCapable === true;
  const forbidden = !free && !paid;

  // Kernel behaviour, red -> yellow.
  const unpaid = reduceEffectColor(col, "red", 1, 0);
  const withKarma = reduceEffectColor(col, "red", 1, EFFECT_REDUCTION_COST);

  let src = "";
  try { src = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"); }
  catch { src = readFileSync(path, "utf8"); }
  const hasControl = /name="resultCap"/.test(src);

  if (free) {
    if (unpaid.allowed !== true || unpaid.karmaCost !== 0) {
      line("GAP", col, `kernel should allow a free pull, got ${JSON.stringify(unpaid)}`);
    } else if (hasControl) {
      line("MATCH", col, `${cfg.name}: free pull, dialog offers the cap`);
    } else {
      line("GAP", col, `${cfg.name}: free pull is legal but the dialog renders no cap control`);
    }
    continue;
  }

  if (paid) {
    if (unpaid.allowed !== false) {
      line("GAP", col, `${cfg.name}: kernel allowed an unpaid pull`);
    } else if (withKarma.karmaCost !== EFFECT_REDUCTION_COST || withKarma.color !== "yellow") {
      line("GAP", col, `${cfg.name}: paid pull priced ${withKarma.karmaCost}, got ${withKarma.color}`);
    } else if (!hasControl) {
      line("GAP", col, `${cfg.name}: pull costs ${EFFECT_REDUCTION_COST}/colour but the dialog renders no cap control`);
    } else if (col === "TE" || col === "EA" || col === "Sh") {
      line("FIXED-BUG", col, `${cfg.name}: cap control added 2026-09-05; the paid path was unreachable`);
    } else {
      line("MATCH", col, `${cfg.name}: ${EFFECT_REDUCTION_COST}/colour, dialog offers the cap`);
    }
    if (!PAID.has(col)) line("GAP", col, `${col} is kill-capable but absent from the ruling's paid set`);
    continue;
  }

  if (forbidden) {
    if (unpaid.allowed !== false || withKarma.allowed !== false) {
      line("GAP", col, `${cfg.name}: effect is not reducible but the kernel allowed it`);
    } else if (hasControl) {
      line("GAP", col, `${cfg.name}: effect is not reducible yet the dialog offers a cap`);
    } else {
      line("MATCH", col, `${cfg.name}: effect not reducible, no cap offered`);
    }
  }
}

// Grenades roll a plain Agility FEAT, not an effect column, so there is no
// result to cap. Ledgered as a GAP until grenades move onto a column.
line("GAP", "Gr", "grenades resolve off-column (Agility FEAT); no effect to reduce");

console.log(`\n${match} match / ${fixed} fixed-bug / ${open} open / ${gap} gap`);
process.exit(0);
