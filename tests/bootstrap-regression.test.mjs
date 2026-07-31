import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, "..");
const SYSTEM_ID = "msh-faserip";

function readText(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function walk(dir, predicate = () => true) {
  const output = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git"].includes(name)) continue;
    const absolute = join(dir, name);
    const stats = statSync(absolute);
    if (stats.isDirectory()) output.push(...walk(absolute, predicate));
    else if (predicate(absolute)) output.push(absolute);
  }
  return output;
}

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Could not find source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Could not find source marker: ${endMarker}`);
  return source.slice(start, end);
}

function relativeImports(source) {
  const specs = new Set();
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const patterns = [
    /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]?.startsWith(".")) specs.add(match[1]);
    }
  }
  return [...specs];
}

function resolveImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, join(base, "index.js"), join(base, "index.mjs")];
  return candidates.find(existsSync) ?? null;
}

const manifest = readJson("system.json");
const template = readJson("template.json");
const initSource = readText("scripts/init.js");
const effectEngineSource = readText("scripts/modules/effects/effect-engine.js");
const runtimeTestSource = readText("scripts/dev/runtime-regression-tests.js");

test("system.json uses the V14 bootstrap and dependency layout", () => {
  assert.equal(manifest.id, SYSTEM_ID);
  assert.deepEqual(manifest.esmodules, ["scripts/init.js"]);
  assert.ok(
    manifest.relationships?.requires?.some(dep => dep.id === "socketlib" && dep.type === "module"),
    "SocketLib must be declared under relationships.requires with id=socketlib"
  );

  for (const obsolete of ["name", "author", "settings", "dependencies", "gridDistance", "gridUnits", "templateVersion"]) {
    assert.equal(Object.hasOwn(manifest, obsolete), false, `Obsolete manifest field remains: ${obsolete}`);
  }

  assert.equal(manifest.grid?.distance, 44);
  assert.equal(manifest.grid?.units, "yards");
});

test("all compendium paths use LevelDB directory paths", () => {
  assert.ok(Array.isArray(manifest.packs) && manifest.packs.length > 0);
  for (const pack of manifest.packs) {
    assert.equal(pack.path.endsWith(".db"), false, `${pack.name} still uses a .db path`);
    assert.match(pack.path, /^\.\/packs\/[a-z0-9-]+$/i, `${pack.name} has an unexpected path: ${pack.path}`);
  }
});

test("manifest and template Actor/Item types stay synchronized", () => {
  const manifestActors = Object.keys(manifest.documentTypes?.Actor ?? {}).sort();
  const manifestItems = Object.keys(manifest.documentTypes?.Item ?? {}).sort();
  assert.deepEqual(manifestActors, [...template.Actor.types].sort());
  assert.deepEqual(manifestItems, [...template.Item.types].sort());
});

test("template declares repaired death, power, and vehicle fields", () => {
  assert.deepEqual(template.Actor.templates.base.details, {
    isDead: false,
    isDeactivated: false
  });

  const power = template.Item.power;
  for (const field of [
    "armorPhysicalCustom",
    "calculatedRange",
    "regenerationRate",
    "resistanceSpecific",
    "resistanceValue"
  ]) {
    assert.equal(Object.hasOwn(power, field), true, `Power schema is missing ${field}`);
  }

  assert.equal(typeof template.Actor.vehicle.currentSpeed, "number");
  assert.equal(template.Actor.vehicle.currentSpeed, 0);
});

test("Health update hooks support nested, flattened, and replicated updates", () => {
  const extractor = sourceSlice(initSource, "function _extractHealthUpdate", "function _getTurnSeconds");
  assert.match(extractor, /updateData\["system\.attributes\.health\.value"\]/);
  assert.match(extractor, /getProperty\(updateData,\s*"system\.attributes\.health\.value"\)/);

  const healthHooks = sourceSlice(initSource, "Hooks.on('preUpdateActor'", "// Handle medical care toggle button in chat");
  assert.match(healthHooks, /_lastKnownActorHealth/);
  assert.match(healthHooks, /options\.healthChange/);
  assert.match(healthHooks, /_cacheActorHealth\(actor, newHealth\)/);
  assert.match(healthHooks, /Skipping damage hook on non-GM client/);
});

test("turn timing and CTT synchronization use one authoritative clock path", () => {
  const combatRound = sourceSlice(initSource, 'Hooks.on("combatRound"', '// Handle effect expiration when world time advances');
  assert.match(combatRound, /const turnSeconds = _getTurnSeconds\(\)/);
  assert.match(combatRound, /game\.time\.advance\(turnSeconds\)/);
  assert.match(combatRound, /cttOwnsClock/);
  assert.match(combatRound, /CTT is Time Authority; skipping direct worldTime advancement/);
  assert.doesNotMatch(combatRound, /game\.time\.advance\(6\)/);

  const updateCombat = sourceSlice(initSource, 'Hooks.on("updateCombat", async', '// MA-D study cleanup');
  assert.match(updateCombat, /syncMode === "turn"[\s\S]*advanceCTTByTurns\(1\)/);
  assert.match(updateCombat, /syncMode === "round"[\s\S]*advanceCTTByTurns\(1\)/);
  assert.doesNotMatch(updateCombat, /advanceCTTByTurns\(turns\)/);
  assert.doesNotMatch(updateCombat, /combat\.turns\?\.length[\s\S]*advanceCTTByTurns/);

  const cttAdvance = sourceSlice(effectEngineSource, 'export function advanceCTTByTurns', '/* ===== Regeneration Power Support ===== */');
  assert.match(cttAdvance, /api\.advanceTime\(turns, "turn"\)/);
  assert.doesNotMatch(cttAdvance, /\.advance\(/);
});

test("Foundry runtime tests target CTT's real public and engine APIs", () => {
  assert.match(runtimeTestSource, /module\.api/);
  assert.match(runtimeTestSource, /api\?\.advanceTime/);
  assert.match(runtimeTestSource, /engine\?\.advanceTime/);
  assert.match(runtimeTestSource, /CTT Per Turn sync advances exactly one turn/);
  assert.match(runtimeTestSource, /CTT Per Round sync advances exactly once without bridge duplication/);
  assert.match(runtimeTestSource, /CTT Time Authority suppresses the legacy worldTime clock/);
  assert.doesNotMatch(runtimeTestSource, /timeEngine\.advance API/);
});

test("Recovery and Healing fallback timers tick only on round changes", () => {
  const updateCombat = sourceSlice(initSource, 'Hooks.on("updateCombat", async', '// MA-D study cleanup');
  const timerMarker = '// Check Recovery/Healing fallback timers once per Foundry round.';
  const timerStart = updateCombat.indexOf(timerMarker);
  assert.notEqual(timerStart, -1, `Could not find source marker: ${timerMarker}`);
  const timerBlock = updateCombat.slice(timerStart);
  assert.match(timerBlock, /if \("round" in changed\)/);
  assert.match(timerBlock, /recoveryTimer/);
  assert.match(timerBlock, /healingTimer/);
});

test("elapsed Dying processing uses configured turn length and multiple steps", () => {
  const elapsed = sourceSlice(initSource, "function _elapsedFaseripTurns", "function _findDyingEffect");
  assert.match(elapsed, /Math\.floor\(seconds \/ _getTurnSeconds\(\)\)/);

  const processing = sourceSlice(initSource, "async function _processDyingForElapsedTurns", "function _tokenDisplayMode");
  assert.match(processing, /for \(let i = 0; i < turnsToProcess; i\+\+\)/);
  assert.match(processing, /await processDyingRound\(actor\)/);
  assert.match(processing, /Math\.min\(requestedTurns,/);

  assert.match(initSource, /_processDyingForElapsedTurns\([\s\S]*turnsElapsed/);
});

test("legacy rollUniversalAction forwards its column shift", () => {
  const shim = sourceSlice(initSource, "game.msh.rollUniversalAction = async function", "// Add the rollUniversalTable function");
  assert.match(shim, /opts:\s*\{\s*shift:\s*Number\(columnShift\)\s*\|\|\s*0,\s*karma,/);
});

test("all JavaScript and MJS files pass Node syntax checking", () => {
  const files = walk(ROOT, file => [".js", ".mjs"].includes(extname(file)));
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
      failures.push(`${relative(ROOT, file)}\n${result.stderr || result.stdout}`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n\n"));
});

test("all modules reachable from the manifest entry point resolve", () => {
  const queue = manifest.esmodules.map(entry => resolve(ROOT, entry));
  const visited = new Set();
  const unresolved = [];

  while (queue.length) {
    const file = normalize(queue.shift());
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    for (const specifier of relativeImports(source)) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) unresolved.push(`${relative(ROOT, file)} -> ${specifier}`);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  assert.ok(visited.size > 50, `Unexpectedly small reachable module graph: ${visited.size}`);
  assert.deepEqual(unresolved, [], unresolved.join("\n"));
});
