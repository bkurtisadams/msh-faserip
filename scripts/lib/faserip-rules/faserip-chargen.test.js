// faserip-chargen test suite — run: node faserip-chargen.test.js
// [CERT] tests certify against Players Book ch.1 tables and examples.
// Example 2 (the mutant, Lodestone) is the primary anchor: its rolls align
// with the printed tables. Examples 1 and 3 are scrambled in the PDF text
// extraction (see ERRATA) and are used only where internally consistent.

import {
  rollOrigin, ORIGIN_RULES, RANDOM_RANKS, rollRank, initialRankNumber,
  shiftGeneratedRank, abilityModifier, investItemModifier,
  generateHealth, generateKarma, initialResources, purchaseExtras,
  initialPopularity, PTC_TABLE, rollCounts, adjustPowerCount,
  rollPowerCategory, rollTalentCategory, POWER_LIST, TALENT_LIST,
  rollPower, rollTalent, LIMITS_PER_CHARACTER, MAX_POWERS_RAISED_BY_LIMIT,
  CHARGEN_VERSION, CHARGEN_CERTIFIED,
} from './faserip-chargen.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-chargen v${CHARGEN_VERSION}  (CHARGEN_CERTIFIED=${CHARGEN_CERTIFIED})\n`);

// --- Origins ------------------------------------------------------------

t('[CERT] origin bands: 30 altered human, 33 mutant, 61 hi-tech, 95 robot, 96 alien', () => {
  eq(rollOrigin(30), 'altered-human');
  eq(rollOrigin(33), 'mutant');   // Example 2 rolled a 33
  eq(rollOrigin(61), 'hi-tech');
  eq(rollOrigin(95), 'robot');
  eq(rollOrigin(96), 'alien');
});

// --- Random Ranks: Lodestone anchors column 1 ---------------------------

t('[CERT] Lodestone rolls on column 1: 85 In, 22 Gd, 12 Ty, 87 In, 02 Fe, 37 Gd, 21 Gd', () => {
  eq(rollRank(1, 85), 'IN');
  eq(rollRank(1, 22), 'GD');
  eq(rollRank(1, 12), 'TY');
  eq(rollRank(1, 87), 'IN');
  eq(rollRank(1, 2), 'FE');
  eq(rollRank(1, 37), 'GD');
  eq(rollRank(1, 21), 'GD');
});

t('[CERT] mutant Endurance rises one rank: rolled In(87) becomes Amazing(46)', () => {
  const raised = shiftGeneratedRank(rollRank(1, 87), ORIGIN_RULES.mutant.enduranceShift);
  eq(raised.key, 'AM');
  eq(initialRankNumber('AM'), 46);
});

t('[CERT] Lodestone secondary abilities: Health 95, Karma 17', () => {
  // F In(36) A Gd(8) S Ty(5) E Am(46 after raise); R Fe(1) I Gd(8) P Gd(8)
  eq(generateHealth({ fighting: 36, agility: 8, strength: 5, endurance: 46 }), 95);
  eq(generateKarma({ reason: 1, intuition: 8, psyche: 8 }), 17);
});

t('[CERT] every Random Ranks column covers 01-00 with no gaps or overlaps', () => {
  for (const col of Object.keys(RANDOM_RANKS)) {
    let next = 1;
    for (const band of RANDOM_RANKS[col]) {
      if (band.lo !== next) throw new Error(`column ${col}: gap before ${band.lo}`);
      next = band.hi + 1;
    }
    if (next !== 101) throw new Error(`column ${col}: ends at ${next - 1}`);
  }
});

t('[CERT] generated characters cap at Feeble-Monstrous when modified', () => {
  eq(shiftGeneratedRank('FE', -2).key, 'FE');
  eq(shiftGeneratedRank('MN', 2).key, 'MN');
});

// --- Ability Modifier Table (certified by the LEOPARD battlesuit rolls) --

t('[CERT] battlesuit example: 02 -> -1CS, 37 -> unchanged, 77 -> +2CS, 86 -> +3CS', () => {
  eq(abilityModifier(2), -1);
  eq(abilityModifier(37), 0);
  eq(abilityModifier(77), 2);
  eq(abilityModifier(86), 3);
});

t('[CERT] resource-roll spot checks: 27 -> 0, 68 -> +1, 84 -> +2, 96 -> +4', () => {
  eq(abilityModifier(27), 0);
  eq(abilityModifier(68), 1);
  eq(abilityModifier(84), 2);
  eq(abilityModifier(96), 4);
});

t('[CERT] invested items add 15 to the modifier roll (30 -> treated as 45)', () => {
  eq(investItemModifier(30), 0);
  eq(investItemModifier(60), 2);
});

// --- Resources and Popularity -------------------------------------------

t('[CERT] Lodestone resources: Typical + roll 84 (+2) = Excellent, mutant -1 = Good', () => {
  eq(initialResources({ origin: 'mutant', modifierRoll: 84 }).key, 'GD');
});

t('[CERT] aliens start Resources at Poor; hi-tech flat Good option', () => {
  eq(initialResources({ origin: 'alien', modifierRoll: 37 }).key, 'PR');
  eq(initialResources({ origin: 'hi-tech' }).key, 'GD');
});

t('[CERT] purchases: -1 rank per extra Talent/Contact, -2 per extra Power, floor Feeble', () => {
  eq(purchaseExtras({ resourcesRank: 'EX', extraTalents: 1, extraPowers: 1 }).key, 'PR');
  eq(purchaseExtras({ resourcesRank: 'PR', extraPowers: 2 }).key, 'FE');
});

t('[CERT] Lodestone popularity: mutant 0, secret ID -> hero -5, secret side clamped at 0', () => {
  eq(initialPopularity({ origin: 'mutant', secretId: true }), { hero: -5, secret: 0 });
});

t('[CERT] Example 1 popularity: no secret ID, publicly known -> 20', () => {
  eq(initialPopularity({ origin: 'altered-human', publicId: true }), { hero: 20, secret: null });
});

t('[CERT] Example 3 popularity: 10 with secret ID -> 5/5', () => {
  eq(initialPopularity({ origin: 'hi-tech', secretId: true }), { hero: 5, secret: 5 });
});

// --- Powers/Talents/Contacts counts -------------------------------------

t('[CERT] a Contacts roll of 03 grants no initial Contacts (Example 1)', () => {
  eq(rollCounts('contacts', 3), { initial: 0, max: 4 });
});

t('[CERT] counts table covers 01-00; top band grants 5/5 powers', () => {
  let next = 1;
  for (const band of PTC_TABLE) {
    if (band.lo !== next) throw new Error(`gap before ${band.lo}`);
    next = band.hi + 1;
  }
  eq(next, 101);
  eq(rollCounts('powers', 95), { initial: 5, max: 5 });
});

t('[CERT] mutants gain one Power up to max (2/4 -> 3/4), hard cap 5; aliens lose one, floor 2', () => {
  eq(adjustPowerCount({ origin: 'mutant', counts: { initial: 2, max: 4 } }), { initial: 3, max: 4 });
  eq(adjustPowerCount({ origin: 'mutant', counts: { initial: 5, max: 5 } }), { initial: 5, max: 5 });
  eq(adjustPowerCount({ origin: 'alien', counts: { initial: 3, max: 4 } }), { initial: 2, max: 4 });
  eq(adjustPowerCount({ origin: 'alien', counts: { initial: 2, max: 4 } }), { initial: 2, max: 4 });
});

// --- Categories and lists: Lodestone's three powers ----------------------

t('[CERT] Lodestone categories: 67 distance attacks, 28 energy control, 93 body alterations defensive', () => {
  eq(rollPowerCategory(67), 'distance-attacks');
  eq(rollPowerCategory(28), 'energy-control');
  eq(rollPowerCategory(93), 'body-alterations-defensive');
});

t('[CERT] Lodestone picks: distance 9 Slashing Missile, energy 1 Magnetic Manipulation, defensive 2 Body Armor', () => {
  eq(rollPower('distance-attacks', 9).name, 'Slashing Missile');
  eq(rollPower('energy-control', 1).name, 'Magnetic Manipulation');
  eq(rollPower('body-alterations-defensive', 2).name, 'Body Armor');
});

t('[CERT] talent categories: 27 fighting, 64 professional, 75 scientific, 02 weapon, 91 other', () => {
  eq(rollTalentCategory(27), 'fighting-skills');
  eq(rollTalentCategory(64), 'professional-skills');
  eq(rollTalentCategory(75), 'scientific-skills');
  eq(rollTalentCategory(2), 'weapon-skills');
  eq(rollTalentCategory(91), 'other-skills');
});

t('[CERT] scientific talent 8 is Archeology (Lodestone); starred entries cost two slots', () => {
  eq(rollTalent('scientific-skills', 8).name, 'Archeology');
  const inv = POWER_LIST.resistances.find(p => p.name === 'Invulnerability');
  eq(inv.slots, 2);
  const med = TALENT_LIST['professional-skills'].find(p => p.name === 'Medicine');
  eq(med.slots, 2);
  const lawEnf = TALENT_LIST['professional-skills'].find(p => p.name === 'Law-Enforcement');
  eq(lawEnf.slots, 2);
});

t('[CERT] every rollable category covers d10 1-10 without overlap', () => {
  for (const [listName, list] of [['powers', POWER_LIST], ['talents', TALENT_LIST]]) {
    for (const cat of Object.keys(list)) {
      const covered = new Array(11).fill(0);
      for (const e of list[cat]) {
        if (!e.d10) continue;
        for (let i = e.d10[0]; i <= e.d10[1]; i++) covered[i]++;
      }
      for (let i = 1; i <= 10; i++) {
        if (covered[i] !== 1) throw new Error(`${listName}/${cat}: d10 ${i} covered ${covered[i]} times`);
      }
    }
  }
});

t('[CERT] power rank limitation guards: one limit per character, at most three powers raised', () => {
  eq(LIMITS_PER_CHARACTER, 1);
  eq(MAX_POWERS_RAISED_BY_LIMIT, 3);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
