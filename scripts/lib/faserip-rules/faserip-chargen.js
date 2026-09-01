// faserip-rules chargen v0.6.0
// Generated-character creation: origins, random ranks, secondary abilities,
// Powers/Talents/Contacts counts, category tables, and rollable lists.
// Certified against Players Book ch.1 tables and worked examples
// (Example 2, the mutant Lodestone, aligns cleanly and anchors column 1).

import { rankForNumber, rankByKey, shiftRank, RANKS } from './faserip-kernel.js';

export const CHARGEN_VERSION = '0.6.0';
export const CHARGEN_CERTIFIED = true;

// --- Origins ------------------------------------------------------------

export const ORIGIN_TABLE = [
  { lo: 1,  hi: 30,  origin: 'altered-human' },
  { lo: 31, hi: 60,  origin: 'mutant' },
  { lo: 61, hi: 90,  origin: 'hi-tech' },
  { lo: 91, hi: 95,  origin: 'robot' },
  { lo: 96, hi: 100, origin: 'alien' },
];

export function rollOrigin(d100) {
  const row = ORIGIN_TABLE.find(r => d100 >= r.lo && d100 <= r.hi);
  return row.origin;
}

// Origin packages. columns: Random Ranks column for primaries. Power ranks
// for ALL heroes roll on column 4; random Talent ranks on column 2.
export const ORIGIN_RULES = {
  'altered-human': { column: 1, raiseAnyOneAbility: 1 },
  'mutant': {
    column: 1, bonusPowers: 1, powerCap: 5, resourceShift: -1,
    popularityBase: 0, enduranceShift: 1, slowPopularityChange: true,
  },
  'hi-tech': {
    column: 3, reasonShift: 2, resourcesFlat: 'GD', requiredContacts: 1,
    requiredScientificOrProfessionalTalents: 1, battlesuitOption: true,
  },
  'robot': { column: 4, popularityBase: 0, healsNormally: true, reactivatable: true },
  'alien': {
    column: 5, bonusPowers: -1, powerFloor: 2, resourcesFlat: 'PR', maxContacts: 1,
  },
};

// --- Random Ranks Table -------------------------------------------------
// Bands restored where the PDF text garbles them: column 2 prints "78-95"
// for Good leaving 76-77 unmapped (restored 76-95). See ERRATA.
export const RANDOM_RANKS = {
  1: [ // Mutants, Altered Humans
    { lo: 1, hi: 5, rank: 'FE' }, { lo: 6, hi: 10, rank: 'PR' },
    { lo: 11, hi: 20, rank: 'TY' }, { lo: 21, hi: 40, rank: 'GD' },
    { lo: 41, hi: 60, rank: 'EX' }, { lo: 61, hi: 80, rank: 'RM' },
    { lo: 81, hi: 96, rank: 'IN' }, { lo: 97, hi: 100, rank: 'AM' },
  ],
  2: [ // Normal Folks (also random Talent ranks)
    { lo: 1, hi: 5, rank: 'FE' }, { lo: 6, hi: 25, rank: 'PR' },
    { lo: 26, hi: 75, rank: 'TY' }, { lo: 76, hi: 95, rank: 'GD' },
    { lo: 96, hi: 100, rank: 'EX' },
  ],
  3: [ // High Technology
    { lo: 1, hi: 5, rank: 'FE' }, { lo: 6, hi: 10, rank: 'PR' },
    { lo: 11, hi: 40, rank: 'TY' }, { lo: 41, hi: 80, rank: 'GD' },
    { lo: 81, hi: 95, rank: 'EX' }, { lo: 96, hi: 100, rank: 'RM' },
  ],
  4: [ // Robots (also all Power ranks)
    { lo: 1, hi: 5, rank: 'FE' }, { lo: 6, hi: 10, rank: 'PR' },
    { lo: 11, hi: 15, rank: 'TY' }, { lo: 16, hi: 40, rank: 'GD' },
    { lo: 41, hi: 50, rank: 'EX' }, { lo: 51, hi: 70, rank: 'RM' },
    { lo: 71, hi: 90, rank: 'IN' }, { lo: 91, hi: 98, rank: 'AM' },
    { lo: 99, hi: 100, rank: 'MN' },
  ],
  5: [ // Aliens
    { lo: 1, hi: 10, rank: 'FE' }, { lo: 11, hi: 20, rank: 'PR' },
    { lo: 21, hi: 30, rank: 'TY' }, { lo: 31, hi: 40, rank: 'GD' },
    { lo: 41, hi: 60, rank: 'EX' }, { lo: 61, hi: 70, rank: 'RM' },
    { lo: 71, hi: 80, rank: 'IN' }, { lo: 81, hi: 95, rank: 'AM' },
    { lo: 96, hi: 100, rank: 'MN' },
  ],
};

export function rollRank(column, d100) {
  const row = RANDOM_RANKS[column].find(r => d100 >= r.lo && d100 <= r.hi);
  if (!row) throw new Error(`No band for ${d100} on column ${column}`);
  return row.rank;
}

export function initialRankNumber(rankKey) {
  const n = rankByKey(rankKey).initial;
  if (n === null) throw new Error(`No initial rank number for ${rankKey}`);
  return n;
}

// Generated abilities may not be modified below Feeble or above Monstrous.
export const MODIFY_FLOOR = 'FE';
export const MODIFY_CEIL = 'MN';

export function shiftGeneratedRank(rankKey, cs) {
  const idx = k => RANKS.findIndex(r => r.key === k);
  const target = shiftRank(rankKey, cs);
  const lo = idx(MODIFY_FLOOR), hi = idx(MODIFY_CEIL), ti = idx(target.key);
  if (ti < lo) return rankByKey(MODIFY_FLOOR);
  if (ti > hi) return rankByKey(MODIFY_CEIL);
  return target;
}

// --- Ability Modifier Table --------------------------------------------
// Certified by the hi-tech battlesuit example: 02 -> -1, 37 -> 0,
// 77 -> +2, 86 -> +3.
export function abilityModifier(d100) {
  if (d100 <= 15) return -1;
  if (d100 <= 50) return 0;
  if (d100 <= 70) return 1;
  if (d100 <= 85) return 2;
  if (d100 <= 95) return 3;
  return 4;
}

// Investing a common item with powers: material strength modified on the
// Ability Modifier Table adding 15 to the roll.
export function investItemModifier(d100) {
  return abilityModifier(Math.min(d100 + 15, 100));
}

// --- Secondary abilities -----------------------------------------------

export function generateHealth({ fighting, agility, strength, endurance }) {
  return fighting + agility + strength + endurance;
}

export function generateKarma({ reason, intuition, psyche }) {
  return reason + intuition + psyche;
}

// Initial Resources: Typical (Poor for aliens) plus an Ability Modifier
// roll; mutants -1 rank; hi-tech may take flat Good instead of rolling
// (rules text offers the choice; Example 3 applies the roll on top of
// Good — ERRATA OPEN, kernel follows the rules text). Floor: Feeble.
export function initialResources({ origin, modifierRoll = null, hiTechTakeFlat = true }) {
  if (origin === 'hi-tech' && hiTechTakeFlat) return rankByKey('GD');
  let rank = rankByKey(origin === 'alien' ? 'PR' : 'TY');
  let cs = modifierRoll !== null ? abilityModifier(modifierRoll) : 0;
  if (origin === 'mutant') cs -= 1;
  return clampResourceShift(rank.key, cs);
}

function clampResourceShift(rankKey, cs) {
  const idx = k => RANKS.findIndex(r => r.key === k);
  const target = shiftRank(rankKey, cs);
  return idx(target.key) < idx('FE') ? rankByKey('FE') : target;
}

// Purchasing extras before choices are made: -1 Resource rank per extra
// Talent or Contact, -2 per extra Power; reductions are permanent and may
// not go below Feeble.
export function purchaseExtras({ resourcesRank, extraTalents = 0, extraContacts = 0, extraPowers = 0 }) {
  const cs = -(extraTalents + extraContacts + 2 * extraPowers);
  return clampResourceShift(resourcesRank, cs);
}

// Initial Popularity: 10 (0 for mutants and robots); +10 publicly known,
// -5 secret ID, -5 non-mutant who runs with mutants, -5 generally
// unpopular/ugly. The secret-ID side may never start negative
// (Lodestone: hero -5, secret 0).
export function initialPopularity({ origin, publicId = false, secretId = false, hangsWithMutants = false, unpopular = false }) {
  let base = (origin === 'mutant' || origin === 'robot') ? 0 : 10;
  if (publicId) base += 10;
  if (secretId) base -= 5;
  if (hangsWithMutants) base -= 5;
  if (unpopular) base -= 5;
  if (!secretId) return { hero: base, secret: null };
  return { hero: base, secret: Math.max(0, base) };
}

// --- Powers, Talents, and Contacts counts -------------------------------
// initial/max per category. PDF text prints ranges "21-80"/"61-90"
// overlapping; restored to the canonical 21-60/61-90 (see ERRATA).
export const PTC_TABLE = [
  { lo: 1,  hi: 20,  powers: { initial: 2, max: 4 }, talents: { initial: 1, max: 6 }, contacts: { initial: 0, max: 4 } },
  { lo: 21, hi: 60,  powers: { initial: 3, max: 4 }, talents: { initial: 2, max: 5 }, contacts: { initial: 1, max: 4 } },
  { lo: 61, hi: 90,  powers: { initial: 4, max: 4 }, talents: { initial: 3, max: 4 }, contacts: { initial: 2, max: 4 } },
  { lo: 91, hi: 100, powers: { initial: 5, max: 5 }, talents: { initial: 4, max: 4 }, contacts: { initial: 3, max: 4 } },
];

export function rollCounts(kind, d100) {
  const row = PTC_TABLE.find(r => d100 >= r.lo && d100 <= r.hi);
  return { ...row[kind] };
}

// Origin adjustments to Power counts: mutants +1 (respecting max, hard cap
// 5); aliens -1 (minimum 2).
export function adjustPowerCount({ origin, counts }) {
  const rules = ORIGIN_RULES[origin] ?? {};
  let { initial, max } = counts;
  if (rules.bonusPowers > 0) initial = Math.min(initial + rules.bonusPowers, max, rules.powerCap ?? Infinity);
  if (rules.bonusPowers < 0) initial = Math.max(initial + rules.bonusPowers, rules.powerFloor ?? 0);
  return { initial, max };
}

// --- Category tables ----------------------------------------------------
// Power Categories: PDF text prints "08-10" and "18-25" leaving 06-07 and
// 16-17 unmapped; restored to 06-10 and 16-25 (see ERRATA).
export const POWER_CATEGORY_TABLE = [
  { lo: 1,  hi: 5,   category: 'resistances' },
  { lo: 6,  hi: 10,  category: 'senses' },
  { lo: 11, hi: 15,  category: 'movement' },
  { lo: 16, hi: 25,  category: 'matter-control' },
  { lo: 26, hi: 40,  category: 'energy-control' },
  { lo: 41, hi: 55,  category: 'body-control' },
  { lo: 56, hi: 70,  category: 'distance-attacks' },
  { lo: 71, hi: 75,  category: 'mental-powers' },
  { lo: 76, hi: 90,  category: 'body-alterations-offensive' },
  { lo: 91, hi: 100, category: 'body-alterations-defensive' },
];

export const TALENT_CATEGORY_TABLE = [
  { lo: 1,  hi: 20,  category: 'weapon-skills' },
  { lo: 21, hi: 45,  category: 'fighting-skills' },
  { lo: 46, hi: 65,  category: 'professional-skills' },
  { lo: 66, hi: 85,  category: 'scientific-skills' },
  { lo: 86, hi: 90,  category: 'mystic-mental-skills' },
  { lo: 91, hi: 100, category: 'other-skills' },
];

export function rollPowerCategory(d100) {
  return POWER_CATEGORY_TABLE.find(r => d100 >= r.lo && d100 <= r.hi).category;
}

export function rollTalentCategory(d100) {
  return TALENT_CATEGORY_TABLE.find(r => d100 >= r.lo && d100 <= r.hi).category;
}

// --- Power list (ch.1 listing; slots: 2 for starred powers) -------------
// d10: [lo, hi] for rollable entries; null entries are choose-only.
const P = (name, d10 = null, slots = 1) => ({ name, d10, slots });

export const POWER_LIST = {
  'resistances': [
    P('Resistance to Fire and Heat', [1, 1]), P('Resistance to Cold', [2, 2]),
    P('Resistance to Electricity', [3, 3]), P('Resistance to Radiation', [4, 4]),
    P('Resistance to Toxins', [5, 5]), P('Resistance to Corrosives', [6, 6]),
    P('Resistance to Emotion Attacks', [7, 7]), P('Resistance to Mental Attacks', [8, 8]),
    P('Resistance to Magical Attacks', [9, 9]), P('Resistance to Disease', [10, 10]),
    P('Invulnerability', null, 2),
  ],
  'senses': [
    P('Protected Senses', [1, 1]), P('Enhanced Senses', [2, 2]), P('Infravision', [3, 3]),
    P('Cosmic Awareness', null, 2), P('Combat Sense', null, 2),
    P('Computer Links', [4, 4]), P('Emotion Detection', [5, 5]), P('Energy Detection', [6, 6]),
    P('Magic Detection'), P('Magnetic Detection', [7, 7]), P('Mutant Detection'),
    P('Psionic Detection', [8, 8]), P('Astral Detection', [9, 9]), P('Tracking Ability', [10, 10]),
  ],
  'movement': [
    P('Flight', [1, 2]), P('Gliding', [3, 3]), P('Leaping', [4, 4]),
    P('Wall-Crawling', [5, 6]), P('Lightning Speed', [7, 7]),
    P('Teleportation', null, 2), P('Levitation', [8, 8]), P('Swimming', [9, 9]),
    P('Climbing', [10, 10]), P('Digging'), P('Dimensional Travel', null, 2),
  ],
  'matter-control': [
    P('Earth Control', [1, 2]), P('Air Control', [3, 4]), P('Fire Control', [5, 6]),
    P('Water Control', [7, 8]), P('Weather Control', [9, 10]),
    P('Density Manipulation - Others'), P('Body Transformation - Others'),
    P('Animal Transformation - Others'),
  ],
  'energy-control': [
    P('Magnetic Manipulation', [1, 2]), P('Electrical Manipulation', [3, 4]),
    P('Light Manipulation', [5, 6]), P('Sound Manipulation', [7, 8]),
    P('Darkforce Manipulation', [9, 9]), P('Gravity Manipulation', [10, 10]),
    P('Probability Manipulation', null, 2), P('Nullifying Power', null, 2),
    P('Energy Reflection'), P('Time Control', null, 2),
  ],
  'body-control': [
    P('Growth', [1, 1]), P('Shrinking', [2, 2]),
    P('Density Manipulation - Self'), P('Phasing'),
    P('Invisibility', [3, 3]), P('Plasticity', [4, 4]), P('Elongation'),
    P('Shape-Shifting', [5, 5]), P('Imitation'),
    P('Body Transformation - Self', [6, 6], 2), P('Animal Transformation - Self', [7, 7]),
    P('Raise Lowest Ability', [8, 8]), P('Blending', [9, 9]),
    P('Power Absorption'), P('Alter Ego', [10, 10]),
  ],
  'distance-attacks': [
    P('Projectile Missile', [1, 1]), P('Ensnaring Missile', [2, 2]),
    P('Ice Generation', [3, 3]), P('Fire Generation', [4, 4]),
    P('Energy Generation', [5, 5]), P('Sound Generation', [6, 6]),
    P('Stunning Missile', [7, 7]), P('Corrosive Missile', [8, 8]),
    P('Slashing Missile', [9, 9]), P('Nullifier Missile'),
    P('Darkforce Generation', [10, 10]),
  ],
  'mental-powers': [
    P('Telepathy', [1, 1]), P('Image Generation', [2, 2], 2), P('Telekinesis', [3, 3]),
    P('Mind Control', null, 2), P('Emotion Control', null, 2),
    P('Force Field Generation', [4, 4]), P('Animal Communication and Control', [5, 5]),
    P('Mechanical Intuition'), P('Animal Empathy'), P('Empathy', [6, 6]),
    P('Psi-Screen', [7, 7]), P('Mental Probe', [8, 8]), P('Animate Drawings'),
    P('Possession', null, 2), P('Transferral', null, 2),
    P('Astral Projection', [9, 9]), P('Psionic Attack', [10, 10]),
    P('Precognition', null, 2), P('Postcognition'), P('Plant Control'), P('Ultimate Skill'),
  ],
  'body-alterations-offensive': [
    P('Extra Body Parts', [1, 3]), P('Extra Attacks', [4, 4]),
    P('Energy Touch', [5, 5]), P('Paralyzing Touch', [6, 6]), P('Claws', [7, 8]),
    P('Rotting Touch', [9, 9]), P('Corrosive Touch', [10, 10]),
    P('Health-Drain Touch', null, 2), P('Blinding Touch'),
  ],
  'body-alterations-defensive': [
    P('Body Armor', [1, 3]), P('Water Breathing', [4, 4]), P('Absorption', [5, 5]),
    P('Regeneration', [6, 6]), P('Solar Regeneration', [7, 7]), P('Recovery', [8, 9]),
    P('Life Support', [10, 10]), P('Pheromones'), P('Damage Transfer'),
    P('Healing'), P('Immortality', null, 2),
  ],
};

// --- Talent list (ch.1 listing; Medicine and Law-Enforcement cost 2 slots
// per Example 1) ---------------------------------------------------------

export const TALENT_LIST = {
  'weapon-skills': [
    P('Guns', [1, 2]), P('Thrown Weapons', [3, 5]), P('Bows', [6, 6]),
    P('Blunt Weapons', [7, 8]), P('Sharp Weapons', [9, 9]), P('Oriental Weapons', [10, 10]),
    P('Marksman', null, 2), P('Weapons Master', null, 2), P('Weapons Specialist', null, 2),
  ],
  'fighting-skills': [
    P('Martial Arts A', [1, 1]), P('Martial Arts B', [2, 2]), P('Martial Arts C', [3, 3]),
    P('Martial Arts D', [4, 4]), P('Martial Arts E', [5, 5]), P('Wrestling', [6, 6]),
    P('Thrown Objects', [7, 7]), P('Tumbling', [8, 8]), P('Acrobatics', [9, 10]),
  ],
  'professional-skills': [
    P('Medicine', [1, 1], 2), P('Law', [2, 2]), P('Law-Enforcement', null, 2),
    P('Pilot', [3, 3]), P('Military', [4, 4]), P('Business/Finance', [5, 5]),
    P('Journalism', [6, 6]), P('Engineering', [7, 7]), P('Crime', [8, 8]),
    P('Psychiatry', [9, 9]), P('Detective/Espionage', [10, 10]),
  ],
  'scientific-skills': [
    P('Chemistry', [1, 2]), P('Biology', [3, 4]), P('Geology', [5, 6]),
    P('Genetics', [7, 7]), P('Archeology', [8, 8]), P('Physics', [9, 9]),
    P('Computers'), P('Electronics', [10, 10]),
  ],
  'mystic-mental-skills': [
    P('Trance', [1, 2]), P('Mesmerism and Hypnosis', [3, 5]), P('Sleight of Hand', [6, 7]),
    P('Resist Domination', [8, 9]), P('Mystic Origin', null, 2), P('Occult Lore', [10, 10]),
  ],
  'other-skills': [
    P('Artist', [1, 2]), P('Languages', [3, 4]), P('First Aid', [5, 6]),
    P('Repair/Tinkering', [7, 8]), P('Trivia', [9, 10]),
    P('Performer'), P('Animal Training', null, 2), P('Heir to Fortune', null, 2),
    P('Student', null, 2), P('Leadership', null, 2),
  ],
};

export function rollInList(list, category, d10) {
  const entry = list[category]?.find(e => e.d10 && d10 >= e.d10[0] && d10 <= e.d10[1]);
  if (!entry) throw new Error(`No d10 entry ${d10} in ${category}`);
  return entry;
}

export const rollPower = (category, d10) => rollInList(POWER_LIST, category, d10);
export const rollTalent = (category, d10) => rollInList(TALENT_LIST, category, d10);

// Power rank limitations: one limit per character, at most three Powers
// raised by it; maximum rank by limitation severity tier.
export const LIMITATION_MAX_TIERS = ['EX', 'RM', 'IN', 'AM', 'MN', 'UN'];
export const LIMITS_PER_CHARACTER = 1;
export const MAX_POWERS_RAISED_BY_LIMIT = 3;
