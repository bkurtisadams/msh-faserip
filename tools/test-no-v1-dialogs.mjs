// tools/test-no-v1-dialogs.mjs v1.1.0 - 2026-11-11
// v1.1.0: The three Karma files are guarded for V1 dialog calls. Their sheet
//         classes still extend the V1 DocumentSheet, so only dialogs are checked.
// Guards the files that have been taken off Foundry's V1 dialogs and windows,
// and reports how much V1 usage is left elsewhere.
// Run: node tools/test-no-v1-dialogs.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLEAN = [
  'scripts/actorSheet.js',
  'scripts/actor-sheet-v2.js',
  'scripts/vehicle-actor-sheet.js'
];
const V1 = /\bnew Dialog\(|\bDialog\.(?:confirm|prompt|wait)\(|extends\s+(?:foundry\.appv1\.[\w.]+|FormApplication|Application|ActorSheet|ItemSheet|Dialog)\b/g;

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (file) => (stripComments(fs.readFileSync(path.join(root, file), 'utf8')).match(V1) ?? []).length;

for (const file of CLEAN) assert.equal(count(file), 0, `${file} must not use V1 dialogs or V1 window classes`);

const DIALOG_CLEAN = ['scripts/karma.js', 'scripts/karmaPool.js', 'scripts/karmaAdvancement.js'];
const V1_DIALOG = /\bnew Dialog\(|\bDialog\.(?:confirm|prompt|wait)\(/g;
for (const file of DIALOG_CLEAN) {
  const src = stripComments(fs.readFileSync(path.join(root, file), 'utf8'));
  assert.equal((src.match(V1_DIALOG) ?? []).length, 0, `${file} must not use V1 dialogs`);
  assert.equal((src.match(/<\/?form\b/g) ?? []).length, 0, `${file} dialog content must not carry its own <form> (a V2 dialog is the form)`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (!/\/(lib|dev)$/.test(rel)) walk(rel, out); }
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const remaining = walk('scripts').map(f => [f, count(f)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
const total = remaining.reduce((n, [, c]) => n + c, 0);
console.log(`V1 dialog/window uses still in other files: ${total} in ${remaining.length} files`);
for (const [f, n] of remaining) console.log(`  ${String(n).padStart(3)}  ${f}`);
console.log(`no-V1-dialogs check passed (${CLEAN.length} files clean, ${DIALOG_CLEAN.length} more clean of V1 dialogs)`);
