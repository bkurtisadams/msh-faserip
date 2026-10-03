// build-talents-pack.mjs v1.0.0 - 2026-10-03
// Compiles packs/_source/talents/*.json into the packs/talents LevelDB pack.
// Source JSON is the single source of truth; never edit packs/talents directly.
// Run from the system root with Foundry SHUT DOWN:
//   node tools/build-talents-pack.mjs          validate and build
//   node tools/build-talents-pack.mjs --check  validate only (safe with Foundry running)
// Requires: npm install @foundryvtt/foundryvtt-cli
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { existsSync, readdirSync, readFileSync, rmSync } from "fs";
import path from "path";

const SRC = "packs/_source/talents";
const DEST = "packs/talents";
const SYSTEM_PREFIX = "systems/msh-faserip/";
const ID_RE = /^[a-zA-Z0-9]{16}$/;
const TYPES = new Set([
  "Weapon Skill", "Fighting Skill", "Professional Skill",
  "Scientific Skill", "Mystic/Mental Skill", "Other"
]);
const CHECK_ONLY = process.argv.includes("--check");

const files = readdirSync(SRC).filter(f => f.endsWith(".json"));
const ids = new Set();
const names = new Set();
let errors = 0;
const fail = (f, msg) => { console.error(`${f}: ${msg}`); errors++; };

for (const f of files) {
  let doc;
  try { doc = JSON.parse(readFileSync(path.join(SRC, f), "utf8")); }
  catch (e) { fail(f, `invalid JSON (${e.message})`); continue; }

  if (!ID_RE.test(doc._id ?? "")) fail(f, `bad _id ${doc._id}`);
  if (doc._key !== `!items!${doc._id}`) fail(f, "_key mismatch");
  if (ids.has(doc._id)) fail(f, "duplicate _id");
  if (names.has(doc.name)) fail(f, `duplicate name ${doc.name}`);
  if (doc.type !== "talent") fail(f, "type is not talent");
  if (!TYPES.has(doc.system?.type)) fail(f, `bad system.type "${doc.system?.type}"`);
  if (!(doc.system?.description ?? "").trim()) fail(f, "empty description");

  const img = doc.img ?? "";
  if (!img) fail(f, "missing img");
  else if (/item-bag\.svg$/.test(img)) fail(f, "img is the default bag icon");
  else if (img.startsWith(SYSTEM_PREFIX)) {
    const local = decodeURIComponent(img.slice(SYSTEM_PREFIX.length));
    if (!existsSync(local)) fail(f, `img file not found: ${local}`);
  }

  ids.add(doc._id);
  names.add(doc.name);
}

if (errors) {
  console.error(`Validation failed: ${errors} error(s) across ${files.length} source files. Pack not built.`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`Validation passed for ${files.length} source documents. Pack not built (--check).`);
  process.exit(0);
}

rmSync(DEST, { recursive: true, force: true });
await compilePack(SRC, DEST, { log: false });
console.log(`Built ${DEST} from ${files.length} source documents.`);
