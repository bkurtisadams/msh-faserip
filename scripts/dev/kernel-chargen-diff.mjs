// scripts/dev/kernel-chargen-diff.mjs v1.1.0 - 2026-09-05
// v1.1.0: reads chargen.js v2.0.0's derived tables via CHARGEN_TABLES and
//         asserts the three v1.0.0 fixed-bugs as MATCH.
// Slice 8 proof: chargen.js tables and generator rules vs faserip-rules
// chargen v0.6.0. Run from the msh-faserip system root:
//   node scripts/dev/kernel-chargen-diff.mjs
import { readFileSync } from 'node:fs';
import {
  ORIGIN_TABLE, ORIGIN_RULES, RANDOM_RANKS, rollRank, initialRankNumber,
  abilityModifier, PTC_TABLE, adjustPowerCount, POWER_CATEGORY_TABLE,
  TALENT_CATEGORY_TABLE, POWER_LIST, TALENT_LIST, initialResources,
  initialPopularity, rollPower, rollTalent, CHARGEN_VERSION,
} from '../lib/faserip-rules/faserip-chargen.js';
import { RANKS as KERNEL_RANKS, rankByKey } from '../lib/faserip-rules/faserip-kernel.js';
globalThis.game ??= { settings: { get: () => false } };
const { RANKS, POWER_LISTS, TALENT_LISTS, CHARGEN_TABLES, CharacterGenerator } = await import('../chargen.js');

const src = readFileSync(new URL('../chargen.js', import.meta.url), 'utf8');
const grab = (name) => CHARGEN_TABLES[name];

let match = 0, fixed = 0, open = 0;
const M = (label, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja === jb) { match++; console.log(`MATCH     ${label}`); } else { fixed++; console.log(`FIXED-BUG ${label}\n          current ${ja}\n          kernel  ${jb}`); } };
const OPEN = (label, note) => { open++; console.log(`OPEN      ${label}  ${note}`); };
const GAP = (label, note) => { console.log(`GAP       ${label}  ${note}`); };

const nameOf = k => rankByKey(k).name.replace(' ', '-');
const bands = (cur, key) => cur.map(r => ({ lo: r.roll[0], hi: r.roll[1], [key]: r[key] }));
const originSlug = { 'Altered Human': 'altered-human', 'Mutant': 'mutant', 'Hi-Tech': 'hi-tech', 'Robot': 'robot', 'Alien': 'alien' };
const catSlug = s => s.toLowerCase().replace(/ and /g, '-').replace(/\//g, '-').replace(/ /g, '-');

console.log(`faserip-chargen v${CHARGEN_VERSION}\n`);

console.log('== Origins');
M('origin table', bands(grab('ORIGIN_TABLE'), 'origin').map(r => ({ ...r, origin: originSlug[r.origin] })), ORIGIN_TABLE);
for (const [n, col] of [[1, 'COLUMN_1'], [2, 'COLUMN_2'], [3, 'COLUMN_3'], [4, 'COLUMN_4'], [5, 'COLUMN_5']]) {
  M(`random ranks column ${n}`, bands(grab(col), 'rank'), RANDOM_RANKS[n].map(r => ({ ...r, rank: nameOf(r.rank) })));
}
M('ability modifier table', grab('ABILITY_MODIFIER').map(r => [r.roll[0], r.roll[1], r.mod]), [[1, 15, -1], [16, 50, 0], [51, 70, 1], [71, 85, 2], [86, 95, 3], [96, 100, 4]]);
M('column 6 (battlesuit) is the ability modifier table', grab('COLUMN_6'), grab('ABILITY_MODIFIER'));
M('mutant Endurance +1, hi-tech Reason +2, altered human +1 any', [1, 2, 1], [ORIGIN_RULES.mutant.enduranceShift, ORIGIN_RULES['hi-tech'].reasonShift, ORIGIN_RULES['altered-human'].raiseAnyOneAbility]);
M('generated rank floor/ceiling Feeble..Monstrous', src.includes('{ min: "Feeble", max: "Monstrous" }'), true);
GAP('Normal Folks origin', 'chargen.js offers "Normal" (column 2, no Powers, Popularity 0) for NPCs; the kernel has no such origin package. System extension, kept.');

console.log('\n== Rank numbers');
for (const r of RANKS.filter(r => r.name !== 'Shift-0' && r.min <= 75)) {
  const key = KERNEL_RANKS.find(k => k.name.replace(' ', '-') === r.name)?.key;
  M(`initial rank number ${r.name} = ${r.min}`, r.min, initialRankNumber(key));
}
GAP('standard-number option', 'chargenStandardRanks setting writes the standard number instead of the initial one — house option, not in the kernel.');

console.log('\n== Resources and Popularity');
M('alien Resources start Poor, mutant -1 rank', ['Poor', 'Good'], [rankByKey(initialResources({ origin: 'alien', modifierRoll: 37 }).key).name, rankByKey(initialResources({ origin: 'mutant', modifierRoll: 84 }).key).name]);
OPEN('hi-tech Resources', 'chargen.js rolls the modifier on top of Good (Players Book Example 3); kernel initialResources takes flat Good per the rules text. Kernel ERRATA already OPEN — chargen.js keeps the Example 3 reading until ruled.');
M('base Popularity 10; mutants and robots 0', [10, 0, 0, 10, 10], ['altered-human', 'mutant', 'robot', 'hi-tech', 'alien'].map(o => initialPopularity({ origin: o }).hero));
const gen = new CharacterGenerator(null);
gen.setOrigin('Mutant'); gen.state.abilities = Object.fromEntries(['fighting', 'agility', 'strength', 'endurance', 'reason', 'intuition', 'psyche'].map(a => [a, { rank: 'Good', value: 8 }]));
gen.generateSecondaryAbilities(); gen.setSecretId(true);
M('secret ID: -5 to the hero side, secret side never below 0 (Lodestone -5/0)', { hero: gen.state.popularity.hero, secret: gen.state.popularity.secretId }, initialPopularity({ origin: 'mutant', secretId: true }));
GAP('popularity options', 'kernel initialPopularity also takes publicId (+10), hangsWithMutants (-5), unpopular (-5); the chargen tab only offers secret ID.');
GAP('purchase extras', 'kernel purchaseExtras (-1 Resources per extra Talent/Contact, -2 per extra Power) has no chargen.js caller.');

console.log('\n== Powers, Talents, Contacts counts');
M('powers count table', bands(grab('POWERS_TABLE'), 'initial').map((r, i) => ({ lo: r.lo, hi: r.hi, initial: r.initial, max: grab('POWERS_TABLE')[i].max })), PTC_TABLE.map(r => ({ lo: r.lo, hi: r.hi, ...r.powers })));
M('talents count table', grab('TALENTS_TABLE').map(r => ({ lo: r.roll[0], hi: r.roll[1], initial: r.initial, max: r.max })), PTC_TABLE.map(r => ({ lo: r.lo, hi: r.hi, ...r.talents })));
M('contacts count table', grab('CONTACTS_TABLE').map(r => ({ lo: r.roll[0], hi: r.roll[1], initial: r.initial, max: r.max })), PTC_TABLE.map(r => ({ lo: r.lo, hi: r.hi, ...r.contacts })));
M('mutant +1 Power to max; alien -1 Power floor 2', [{ initial: 3, max: 4 }, { initial: 2, max: 4 }], [adjustPowerCount({ origin: 'mutant', counts: { initial: 2, max: 4 } }), adjustPowerCount({ origin: 'alien', counts: { initial: 3, max: 4 } })]);
M('hi-tech at least 1 Contact; alien at most 1', [1, 1], [ORIGIN_RULES['hi-tech'].requiredContacts, ORIGIN_RULES.alien.maxContacts]);

console.log('\n== Categories and lists');
M('power category table', bands(grab('POWER_CATEGORIES'), 'category').map(r => ({ ...r, category: catSlug(r.category) })), POWER_CATEGORY_TABLE);
M('talent category table', bands(grab('TALENT_CATEGORIES'), 'category').map(r => ({ ...r, category: catSlug(r.category) })), TALENT_CATEGORY_TABLE);
for (const [label, cur, ker] of [['power', POWER_LISTS, POWER_LIST], ['talent', TALENT_LISTS, TALENT_LIST]]) {
  for (const cat of Object.keys(cur)) {
    const kl = ker[catSlug(cat)];
    M(`${label} list ${cat}: names`, cur[cat].map(p => p.name), kl.map(p => p.name));
    M(`${label} list ${cat}: starred (2-slot) entries`, cur[cat].filter(p => p.star).map(p => p.name), kl.filter(p => p.slots === 2).map(p => p.name));
  }
}
M('random power pick uses the printed d10 sub-table (Body Armor 1-3, Flight 1-2)', src.includes('_rollListEntry(kernelRollPower') && src.includes('_rollListEntry(kernelRollTalent') ? 'd10' : 'uniform', 'd10');
M('power ranks roll on column 4', src.includes('rollOnTable(COLUMN_4)'), true);
GAP('hi-tech required talent', 'kernel requiredScientificOrProfessionalTalents=1 is shown in the origin tracker but not enforced when Talents are chosen.');
GAP('limitation guards', 'kernel LIMITS_PER_CHARACTER=1 / MAX_POWERS_RAISED_BY_LIMIT=3 have no chargen.js enforcement (limitations are handled after generation).');

console.log(`\n${match} match, ${fixed} fixed-bug, ${open} open`);
