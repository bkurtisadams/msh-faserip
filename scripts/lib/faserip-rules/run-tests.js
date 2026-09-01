// Runs every faserip-*.test.js in this directory and aggregates results.
// Usage: npm test   (or: node run-tests.js [--quiet])

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes('--quiet');
const suites = readdirSync(here).filter(f => /^faserip-.*\.test\.js$/.test(f)).sort();

let totalPass = 0, totalFail = 0, failedSuites = [];

for (const suite of suites) {
  const r = spawnSync(process.execPath, [join(here, suite)], { encoding: 'utf8' });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  if (!quiet) process.stdout.write(out);
  const m = out.match(/(\d+) passed, (\d+) failed/);
  if (m) {
    totalPass += Number(m[1]);
    totalFail += Number(m[2]);
  }
  if (r.status !== 0 || !m) failedSuites.push(suite);
  if (quiet) console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${suite}  ${m ? `${m[1]} passed, ${m[2]} failed` : '(no summary)'}`);
}

console.log(`\n${suites.length} suites: ${totalPass} passed, ${totalFail} failed${failedSuites.length ? `  [failing: ${failedSuites.join(', ')}]` : ''}`);
process.exit(failedSuites.length ? 1 : 0);
