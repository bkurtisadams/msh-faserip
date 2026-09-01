// faserip-karma test suite — run: node faserip-karma.test.js
// [CERT] tests certify against Players Book ch.3 prose and worked examples.

import {
  CRIME_KARMA, crimeKarma, rescueAward, foeDefeatAward,
  propertyDestructionLoss, DEFEAT_LOSS, SPECIAL_DEATH_LOSS,
  COMMITMENT_KARMA, charityAppearanceAward, CHARITY_ACT_AWARD, donationAward,
  negativePopularityLoss, GAMING_AWARDS, splitGroupAward,
  applyKarmaDelta, applyDeathPenalty,
  poolLeaveShare, poolAbsorbLoss, poolKillWipe, LEADERSHIP_POOL_BONUS,
  MIN_KARMA_DECLARATION, EFFECT_REDUCTION_COST, POWER_STUNT_COST,
  powerStuntRequiredColor, advancementOptions,
  powerAdditionCost, TALENT_ADDITION_COST, contactAdditionCost,
  KARMA_VERSION, KARMA_CERTIFIED,
} from './faserip-karma.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-karma v${KARMA_VERSION}  (KARMA_CERTIFIED=${KARMA_CERTIFIED})\n`);

// --- Crime awards, certified by the chapter's examples ------------------

t('[CERT] liquor store example: stop robbery (20) + arrest (10) = 30', () => {
  eq(crimeKarma('robbery', 'stop') + crimeKarma('robbery', 'arrest'), 30);
});

t('[CERT] Scorpion example: arrest (10) + Amazing-tail foe award (50) = 60', () => {
  eq(crimeKarma('robbery', 'arrest') + foeDefeatAward(50), 60);
});

t('[CERT] conspiracy example: 4 theft arrests (20) + stop local conspiracy (30) + arrest (15) + 3 Incredible foes (120) = 185', () => {
  const total = 4 * crimeKarma('theft', 'arrest')
    + crimeKarma('localConspiracy', 'stop')
    + crimeKarma('localConspiracy', 'arrest')
    + 3 * foeDefeatAward(40);
  eq(total, 185);
});

t('[CERT] monster example: stop destructive (20) + max rescue (100) = 120, five heroes -> 24 each', () => {
  const total = crimeKarma('destructive', 'stop') + rescueAward(6);
  eq(total, 120);
  eq(splitGroupAward(total, 5), 24);
});

t('[CERT] group split drops fractions: 100 across three heroes -> 33 each', () => {
  eq(splitGroupAward(100, 3), 33);
});

t('[CERT] Fort Knox example: committing theft costs -20 even under mind control', () => {
  eq(crimeKarma('theft', 'commit'), -20);
});

t('[CERT] anti-toxin courier example: rescue +20, permitted theft -5', () => {
  eq(rescueAward(1), 20);
  eq(crimeKarma('theft', 'permit'), -5);
});

t('[CERT] foe award requires Remarkable+; award equals the actual rank number', () => {
  eq(foeDefeatAward(25), 0);
  eq(foeDefeatAward(26), 26);
  eq(foeDefeatAward(75), 75);
});

t('[CERT] rescue caps at 100 (Iron Man saves a 747)', () => {
  eq(rescueAward(200), 100);
});

// --- Losses -------------------------------------------------------------

t('[CERT] Hulk fight example: 7 leveled areas -> -35 per hero; public defeat -40', () => {
  eq(propertyDestructionLoss(7), -35);
  eq(DEFEAT_LOSS.public, -40);
  eq(DEFEAT_LOSS.private, -20);
});

t('[CERT] noble/mysterious/self-destruction deaths cost a flat 50', () => {
  eq(SPECIAL_DEATH_LOSS, -50);
});

t('[CERT] a kill zeroes current Karma; advancement fund survives (except immortals)', () => {
  eq(applyDeathPenalty({ current: 500, advancementFund: 300 }), { current: 0, advancementFund: 300 });
  eq(applyDeathPenalty({ current: 500, advancementFund: 300, immortal: true }), { current: 0, advancementFund: 0 });
});

t('[CERT] Karma never drops below 0', () => {
  eq(applyKarmaDelta(15, -40), 0);
});

// --- Personal Karma -----------------------------------------------------

t('[CERT] Spider-Man week: weekly award 10 + kept date 5', () => {
  eq(COMMITMENT_KARMA.weeklyMax + COMMITMENT_KARMA.make, 15);
});

t('[CERT] Reed fails to show -10; She-Hulk leaves early -5', () => {
  eq(COMMITMENT_KARMA.failToShow, -10);
  eq(COMMITMENT_KARMA.leaveEarly, -5);
});

t('[CERT] charity: Box red-FEAT act 40; Spidey no-FEAT webbing 10; Stark Incredible donation 40', () => {
  eq(CHARITY_ACT_AWARD.red, 40);
  eq(CHARITY_ACT_AWARD.automatic, 10);
  eq(donationAward(40), 40);
});

t('[CERT] Spider-Man toy drive: Poor Resource FEAT donation -> 4 Karma', () => {
  eq(donationAward(4), 4);
});

t('[CERT] appearance award = Popularity number capped at 20; negative Popularity use costs its number', () => {
  eq(charityAppearanceAward(100), 20);
  eq(charityAppearanceAward(5), 5);
  eq(negativePopularityLoss(-15), -15);
});

t('[CERT] gaming awards: role-play up to 10, stump the judge up to 15, humor 5', () => {
  eq(GAMING_AWARDS, { rolePlayMax: 10, stumpTheJudgeMax: 15, humor: 5 });
});

// --- Pools --------------------------------------------------------------

t('[CERT] Wolverine example: -40 loss with 30 on hand -> member 0, pool pays 10', () => {
  eq(poolAbsorbLoss({ individual: 30, pool: 200, loss: 40 }), { individual: 0, pool: 190 });
});

t('[CERT] leaving member takes an equal share; kill wipes member and pool', () => {
  eq(poolLeaveShare(201, 4), 50);
  eq(poolKillWipe(), { individual: 0, pool: 0 });
  eq(LEADERSHIP_POOL_BONUS, 50);
});

// --- Spending and stunts ------------------------------------------------

t('[CERT] spend constants: declaration min 10, effect reduction 50/color, stunt 100', () => {
  eq(MIN_KARMA_DECLARATION, 10);
  eq(EFFECT_REDUCTION_COST, 50);
  eq(POWER_STUNT_COST, 100);
});

t('[CERT] power stunt colors: never=red, 1-3=yellow, 4-10=green, 11+=automatic', () => {
  eq(powerStuntRequiredColor(0), 'red');
  eq(powerStuntRequiredColor(2), 'yellow');
  eq(powerStuntRequiredColor(3), 'yellow');
  eq(powerStuntRequiredColor(4), 'green');
  eq(powerStuntRequiredColor(10), 'green');
  eq(powerStuntRequiredColor(11), 'automatic');
});

// --- Advancement --------------------------------------------------------

t('[CERT] Potato Salad Man: Reason 14->15 costs 140; 15 -> Excellent(16) costs 550', () => {
  const at14 = advancementOptions({ current: 14, kind: 'ability' });
  eq(at14.step, { to: 15, cost: 140 });
  const at15 = advancementOptions({ current: 15, kind: 'ability' });
  eq(at15.step, null);
  eq(at15.crest, { to: 16, cost: 550 });
});

t('[CERT] Coldboy: power Amazing(60)->61 costs 1200; 61 -> Monstrous(63) crest costs 1720', () => {
  const at60 = advancementOptions({ current: 60, kind: 'power' });
  eq(at60.step, { to: 61, cost: 1200 });
  const at61 = advancementOptions({ current: 61, kind: 'power' });
  eq(at61.crest, { to: 63, cost: 1720 });
});

t('[CERT] resource crest fee 200, popularity crest free', () => {
  eq(advancementOptions({ current: 15, kind: 'resource' }).crest, { to: 16, cost: 350 });
  eq(advancementOptions({ current: 15, kind: 'popularity' }).crest, { to: 16, cost: 150 });
});

t('[CERT] additions: power 3000+40n (robots 3000+10n); talents 2000 PC / 1000 NPC (students 1000/800); contacts 500+10xRes, x2 extradimensional', () => {
  eq(powerAdditionCost(20), 3800);
  eq(powerAdditionCost(20, { robot: true }), 3200);
  eq(TALENT_ADDITION_COST, { fromPC: 2000, fromNPC: 1000, studentFromPC: 1000, studentFromNPC: 800 });
  eq(contactAdditionCost(30), 800);
  eq(contactAdditionCost(30, { extradimensional: true }), 1600);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
