// faserip-rules karma v0.4.2
// v0.4.2: RULED 2026-09-02 — Contact Addition costs 500 + 10 x the Contact's
//         Resource rank number, flat. No multiplier for extradimensional,
//         mystic, or planetary Contacts (Appendix C assigns categories and
//         Resource caps, not prices). The x2 option had no book source.
// faserip-rules karma v0.4.1
// v0.4.1: RULED 2026-09-02 — advancement raises one rank number at a time;
//         Cresting is the purchase that crosses the range boundary. The
//         crest option is offered only from the top number of a rank.
// Karma awards, losses, pools, spending, and advancement.
// Certified against Players Book ch.3 (The Campaign) prose, the Karma
// Summary Listing, and the chapter's worked examples.

import { rankForNumber, rankDistance, shiftRank, rankByKey } from './faserip-kernel.js';

export const KARMA_VERSION = '0.4.2';
export const KARMA_CERTIFIED = true;

// --- Awards and losses --------------------------------------------------

// { stop, arrest, commit, permit } per crime class. permit = -arrest (prose).
// commit values marked explicit come from the Summary Listing; others derive
// from "twice the listed" (2x stop). ERRATA OPEN: listing prints Commit
// Other Crimes as -10 where 2x stop implies -30; kernel follows the listing.
export const CRIME_KARMA = {
  violent:            { stop: 30, arrest: 15, commit: -60, permit: -15 },
  destructive:        { stop: 20, arrest: 10, commit: -40, permit: -10 },
  theft:              { stop: 10, arrest: 5,  commit: -20, permit: -5 },
  robbery:            { stop: 20, arrest: 10, commit: -40, permit: -10 },
  misdemeanor:        { stop: 5,  arrest: 5,  commit: -10, permit: -5 },
  nationalOffense:    { stop: 20, arrest: 10, commit: -40, permit: -10 },
  localConspiracy:    { stop: 30, arrest: 15, commit: -60, permit: -15 },
  nationalConspiracy: { stop: 40, arrest: 20, commit: -80, permit: -20 },
  globalConspiracy:   { stop: 50, arrest: 25, commit: -100, permit: -25 },
  other:              { stop: 15, arrest: 5,  commit: -10, permit: -5 },
};

export function crimeKarma(category, action) {
  const c = CRIME_KARMA[category];
  if (!c || !(action in c)) throw new Error(`Unknown crime karma: ${category}.${action}`);
  return c[action];
}

// Rescue: 20 per life saved, 100 maximum for any one action.
export function rescueAward(lives) {
  return Math.min(lives * 20, 100);
}

// Defeating a foe with any ability or Power of Remarkable or higher:
// award equals the opponent's highest rank NUMBER (Scorpion's Amazing
// tail (50) -> 50). Small fry award nothing.
export function foeDefeatAward(highestRankNumber) {
  return rankDistance('RM', rankForNumber(highestRankNumber).key) >= 0
    ? highestRankNumber : 0;
}

// Property destruction: -5 per damaged area, per hero involved.
export function propertyDestructionLoss(areas) {
  return -5 * areas;
}

export const DEFEAT_LOSS = { public: -40, private: -20 };

// Kill or allow death: ALL current Karma to 0. Advancement funds are
// unaffected by negative modifiers (immortal "deaths" are the exception
// and wipe advancement too).
export const SPECIAL_DEATH_LOSS = -50; // noble, mysterious, self-destruction

export const COMMITMENT_KARMA = {
  make: 5,          // making and honoring a commitment
  failToShow: -10,  // prose + Reed Richards example (listing prints -5)
  leaveEarly: -5,   // She-Hulk example
  weeklyMax: 10,
};

// Charity: personal appearance pays Popularity rank number (max 20, one
// per week); act of charity pays by the FEAT it required; donation pays
// the rank number of the Resource FEAT (10 when no FEAT is required).
export function charityAppearanceAward(popularityNumber) {
  return Math.min(popularityNumber, 20);
}

export const CHARITY_ACT_AWARD = { automatic: 10, green: 20, yellow: 30, red: 40 };

export function donationAward(resourceFeatRankNumber = null) {
  return resourceFeatRankNumber ?? 10;
}

// Using negative Popularity to influence others costs Karma equal to the
// Popularity rank number.
export function negativePopularityLoss(popularityNumber) {
  return -Math.abs(popularityNumber);
}

export const GAMING_AWARDS = { rolePlayMax: 10, stumpTheJudgeMax: 15, humor: 5 };

// Group awards split evenly, fractions dropped (100 across 3 -> 33 each).
export function splitGroupAward(total, participants) {
  return Math.floor(total / participants);
}

// Karma may never drop below 0 through loss or spending.
export function applyKarmaDelta(current, delta) {
  return Math.max(0, current + delta);
}

export function applyDeathPenalty({ current, advancementFund = 0, immortal = false }) {
  return { current: 0, advancementFund: immortal ? 0 : advancementFund };
}

// --- Karma pools --------------------------------------------------------

export const LEADERSHIP_POOL_BONUS = 50;

// A departing member takes an equal share (fractions dropped).
export function poolLeaveShare(poolTotal, memberCount) {
  return Math.floor(poolTotal / memberCount);
}

// Individual losses come from the member first, remainder from the pool
// (Wolverine -40 with 30 on hand: he drops to 0, pool pays 10).
export function poolAbsorbLoss({ individual, pool, loss }) {
  const fromIndividual = Math.min(individual, loss);
  const fromPool = Math.min(pool, loss - fromIndividual);
  return { individual: individual - fromIndividual, pool: pool - fromPool };
}

// A member killing (or causing a death): member AND pool both to 0.
export function poolKillWipe() {
  return { individual: 0, pool: 0 };
}

// --- Spending -----------------------------------------------------------

export const MIN_KARMA_DECLARATION = 10;   // declared spends cost at least 10
export const EFFECT_REDUCTION_COST = 50;   // per color, Kill-capable columns
export const POWER_STUNT_COST = 100;

// Power stunt FEAT by prior attempts: never tried red; up to three yellow;
// more than three green; more than ten it's part of the bag of tricks.
export function powerStuntRequiredColor(timesTried) {
  if (timesTried > 10) return 'automatic';
  if (timesTried > 3) return 'green';
  if (timesTried >= 1) return 'yellow';
  return 'red';
}

// --- Advancement --------------------------------------------------------

// Raising a rank number by one costs multiplier x current number. The
// purchase that crosses into the next rank (Cresting) adds the crest fee
// (Good(14)->15 = 140; 15 -> Excellent(16) = 150+400; Amazing(62) ->
// Monstrous(63) = 1240+500). RULED 2026-09-02: one number at a time — the
// Coldboy example's 61 -> 63 for 1220+500 is a book error (62 skipped).
export const ADVANCEMENT = {
  ability:    { multiplier: 10, crestFee: 400 },
  resource:   { multiplier: 10, crestFee: 200 },
  popularity: { multiplier: 10, crestFee: 0 },   // requires a publicized act of charity within 3 weeks
  power:      { multiplier: 20, crestFee: 500 },
};

export function advancementOptions({ current, kind }) {
  const cfg = ADVANCEMENT[kind];
  if (!cfg) throw new Error(`Unknown advancement kind: ${kind}`);
  const rank = rankForNumber(current);
  const stepCost = cfg.multiplier * current;
  const step = current + 1 <= rank.max
    ? { to: current + 1, cost: stepCost }
    : null;
  let crest = null;
  if (!step && rankDistance('SHZ', rank.key) <= 0) {
    const next = shiftRank(rank.key, 1);
    if (next.key !== rank.key) crest = { to: next.min, cost: stepCost + cfg.crestFee };
  }
  return { step, crest };
}

// New capabilities.
export function powerAdditionCost(startingRankNumber, { robot = false } = {}) {
  return 3000 + (robot ? 10 : 40) * startingRankNumber;
}

export const TALENT_ADDITION_COST = {
  fromPC: 2000, fromNPC: 1000,
  studentFromPC: 1000, studentFromNPC: 800,
};

// Contacts cost 500 plus 10 times the Contact's Resource rank number.
// RULED 2026-09-02: flat — no category multiplier.
export function contactAdditionCost(resourceRankNumber) {
  return 500 + 10 * resourceRankNumber;
}
