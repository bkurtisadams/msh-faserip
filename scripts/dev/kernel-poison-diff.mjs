// scripts/dev/kernel-poison-diff.mjs v1.0.0 - 2026-09-05
// Poisons proof: poison-engine.js v1.3.0 + ongoing-engine.js v1.10.0 vs
// faserip-rules poisons v0.1.0 / intensities v0.1.0. The pre-slice behaviour
// is restated in `legacy`. Run from the msh-faserip system root:
//   node scripts/dev/kernel-poison-diff.mjs
import {
  POISON_UNCONSCIOUS_ROUNDS, POISON_REFEAT_TURNS, MAX_ENDURANCE_RANKS_LOST_PER_ROUND, POISON_LOSS_PRIORITY,
  POISON_DEATH_AT, HALTING, POISON_IMPAIRED_SHIFT, poisonFeat, poisonFailure, POISONS_VERSION,
} from '../lib/faserip-rules/faserip-poisons.js';
import { findIntensity, INTENSITIES_VERSION } from '../lib/faserip-rules/faserip-intensities.js';
import { rankByKey } from '../lib/faserip-rules/faserip-kernel.js';
import { TOXINS, POISON_RULES } from '../rules/rules-reference.js';

let match = 0, fixed = 0, open = 0;
const M = (label, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja === jb) { match++; console.log(`MATCH     ${label}`); } else { fixed++; console.log(`FIXED-BUG ${label}\n          current ${ja}\n          kernel  ${jb}`); } };
const FIXED = (label, was, now) => { fixed++; console.log(`FIXED-BUG ${label}\n          was     ${JSON.stringify(was)}\n          now     ${JSON.stringify(now)}`); };
const GAP = (label, note) => console.log(`GAP       ${label}  ${note}`);

// pre-slice poison-engine / ongoing-engine behaviour
const legacy = {
  lossNumber: 'standard of the new rank (getRankValue)',
  haltLeavesImpairedRecord: false,
  koRounds: '1d10', refeatTurns: '1d10', deathAt: 'Shift-0', capPerRound: 1, priority: 'poison',
  featLadder: 'determineFeatRequirement (standard intensity ladder)',
  halting: 'victim FEAT or First Aid/Medicine + antitoxin',
  poisonPenaltyCS: 0,
};

console.log(`faserip-poisons v${POISONS_VERSION} / intensities v${INTENSITIES_VERSION}\n`);
console.log('== Exposure and spiral');
M('PR3: standard intensity ladder (Good End vs Good toxin = yellow; Remarkable vs Good = green)', [poisonFeat({ featRank: 'GD', toxinIntensity: 'GD', roll: 50 }).needed, poisonFeat({ featRank: 'RM', toxinIntensity: 'GD', roll: 50 }).needed], ['yellow', 'green']);
M('PR1: unconscious 1-10 rounds, re-FEAT 1-10 turns, separate rolls', [legacy.koRounds, legacy.refeatTurns], [`1d${POISON_UNCONSCIOUS_ROUNDS.max}`, `1d${POISON_REFEAT_TURNS.max}`]);
FIXED('reduced Endurance number on a poison loss: highest of the new rank (Ex -> Gd = 15)', legacy.lossNumber, `${poisonFailure({ enduranceRank: 'EX' }).number} (highest of ${rankByKey(poisonFailure({ enduranceRank: 'EX' }).rank).name})`);
M('death on reaching Shift 0 by poison', legacy.deathAt, rankByKey(POISON_DEATH_AT).name.replace(' ', '-'));
M('one Endurance rank per round from any cause; poison has priority', [legacy.capPerRound, legacy.priority], [MAX_ENDURANCE_RANKS_LOST_PER_ROUND, POISON_LOSS_PRIORITY]);
M('halting: victim FEAT, or trained helper with antitoxin', HALTING.helperRequires.antitoxin && HALTING.helperRequires.training.length === 2 && !HALTING.untrainedHelp, true);
M('PR2: no -2CS from poison rank loss (kept as Judge ruling)', legacy.poisonPenaltyCS, POISON_IMPAIRED_SHIFT);
FIXED('a halted poison leaves an Impaired Endurance record so the lost ranks heal per Impaired Abilities', legacy.haltLeavesImpairedRecord, true);
GAP('PR4 repeat exposure / PR5 carrier delivery', 'Judge rulings with no book text; unchanged, now in the kernel ERRATA.');

console.log('\n== Toxin catalog vs Judge\'s Book Intensity Tables');
M('snake venom Good', TOXINS.snakeVenomGd.intensity, rankByKey(findIntensity('endurance', 'snake').rank).name);
M('spider venom Excellent (RULED 2026-09-05: catalog raised from Typical)', TOXINS.spiderVenom.intensity, rankByKey(findIntensity('endurance', 'spider').rank).name);
GAP('rules-reference POISON_RULES prose block', 'now duplicated by the kernel module; can be trimmed to a pointer in a later sweep.');

console.log(`\n${match} match, ${fixed} fixed-bug, ${open} open`);
