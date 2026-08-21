import assert from 'node:assert/strict';
import {
  normalizeTurnSeconds,
  countElapsedTurns,
  healingAnchor,
  healingSecondsRemaining,
} from '../scripts/modules/recovery-timing.js';

assert.equal(normalizeTurnSeconds(6), 6);
assert.equal(normalizeTurnSeconds(0), 6);
assert.equal(countElapsedTurns(5, 6), 0);
assert.equal(countElapsedTurns(6, 6), 1);
assert.equal(countElapsedTurns(60, 6), 10, 'one minute must be ten FASERIP turns');
assert.equal(countElapsedTurns(61, 6), 10);

assert.equal(healingAnchor(100, null), 100);
assert.equal(healingAnchor(100, 3700), 3700, 'repeat heal anchors from the most recent heal');
assert.equal(healingAnchor(null, null), null);

assert.equal(healingSecondsRemaining({ worldNow: 3699, lastDamageWorldTime: 100 }), 1);
assert.equal(healingSecondsRemaining({ worldNow: 3700, lastDamageWorldTime: 100 }), 0);
assert.equal(healingSecondsRemaining({ worldNow: 7299, lastDamageWorldTime: 100, lastHealingWorldTime: 3700 }), 1);
assert.equal(healingSecondsRemaining({ worldNow: 7300, lastDamageWorldTime: 100, lastHealingWorldTime: 3700 }), 0,
  'manual Healing must become eligible again one hour after the prior heal');

console.log('recovery timing tests passed (12 assertions)');
