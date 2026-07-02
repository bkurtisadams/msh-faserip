// build-powers-pack.mjs v1.0.0 - 2026-07-02
// Compiles packs/_source/powers/*.json into the packs/powers LevelDB pack.
// Source JSON is the single source of truth; never edit packs/powers directly.
// Run from the system root with Foundry SHUT DOWN:
//   node tools/build-powers-pack.mjs
// Requires: npm install @foundryvtt/foundryvtt-cli
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { readdirSync, readFileSync, rmSync } from "fs";
import path from "path";

const SRC = "packs/_source/powers";
const DEST = "packs/powers";
const ID_RE = /^[a-zA-Z0-9]{16}$/;

const files = readdirSync(SRC).filter(f => f.endsWith(".json"));
const ids = new Set();
const names = new Set();
let errors = 0;

for (const f of files) {
  const doc = JSON.parse(readFileSync(path.join(SRC, f), "utf8"));
  const where = `${f}:`;
  if (!ID_RE.test(doc._id ?? "")) { console.error(where, "bad _id", doc._id); errors++; }
  if (doc._key !== `!items!${doc._id}`) { console.error(where, "_key mismatch"); errors++; }
  if (ids.has(doc._id)) { console.error(where, "duplicate _id"); errors++; }
  if (names.has(doc.name)) { console.error(where, "duplicate name", doc.name); errors++; }
  if (doc.type !== "power") { console.error(where, "type is not power"); errors++; }
  if (!doc.img) { console.error(where, "missing img"); errors++; }
  if (!doc.system?.category || !doc.system?.type) { console.error(where, "missing category/type"); errors++; }
  if ((doc.system?.description ?? "").trim().length < 40) { console.error(where, "suspiciously short description"); errors++; }
  ids.add(doc._id);
  names.add(doc.name);
}

if (errors) {
  console.error(`Validation failed: ${errors} error(s) across ${files.length} source files. Pack not built.`);
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
await compilePack(SRC, DEST, { log: false });
console.log(`Built ${DEST} from ${files.length} source documents.`);
