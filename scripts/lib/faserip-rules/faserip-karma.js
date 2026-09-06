// faserip-rules karma v0.7.0
// v0.7.0: Karma chapter pass (2026-09-05). Award timing, pool by-laws
//         (no advancement from a pool, one pool per hero, reform only after
//         the next session, optional lock), declared-amount rule for Building
//         Things, optional 5-point increments, advancement fund rules (one
//         fund at a time, quiet time only) and the rationale thresholds,
//         charity appearance prerequisites, Popularity advancement's charity
//         window. All values already in the module re-confirmed against the
//         text; no changes to existing numbers.
// v0.6.0: FEATs Karma may not manipulate: Resource FEATs, Popularity FEATs,
//         and FEATs forced by a Blindside or an unexpected attack (unless
//         forewarned). KARMA_FORBIDDEN_FEATS + karmaAllowedFor().
// faserip-rules karma v0.5.0
// v0.5.0: RULED 2026-09-03 — Power Stunt mastery at 10 SUCCESSES: the FEAT
//         ladder counts successful uses; the tenth success masters the stunt
//         (automatic thereafter). Book "more than ten times" read as a
//         book error (Judge's ruling). powerStuntRequiredColor(successes).
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

export const KARMA_VERSION = '0.7.0';
export const KARMA_CERTIFIED = true;

// Certain FEATs may not be manipulated by Karma: Resource FEATs, Popularity
// FEATs, and FEATs resulting from being Blindsided or suffering an unexpected
// attack (allowed again if the character had previous warning).
export const KARMA_FORBIDDEN_FEATS = ['resource', 'popularity', 'blindsided', 'unexpected-attack'];
export function karmaAllowedFor(featKind, { forewarned = false } = {}) {
  if (!KARMA_FORBIDDEN_FEATS.includes(featKind)) return true;
  return forewarned && (featKind === 'blindsided' || featKind === 'unexpected-attack');
}

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

// Awards are made at the end of a battle (never while any hero is still in
// or about to be in combat), at the completion of a task, and at the end of
// the adventure or session. Crime, rescue and disaster awards and losses
// land as soon as they occur. Gaming awards go to individuals only.
export const AWARD_TIMING = {
  battleEnd: true, taskComplete: true, sessionEnd: true,
  immediate: ['stopCrime', 'rescue', 'preventDisaster', 'commitCrime', 'death'],
  gamingAwardsIndividualOnly: true,
};

// Charity appearances: the charity accepts on a red Popularity FEAT; at most
// one appearance per week per hero or group counts.
export const CHARITY_APPEARANCE = { popularityFeatColor: 'red', maxPerWeek: 1 };

// --- Karma pools --------------------------------------------------------

// Pool by-laws: two or more consenting heroes; pool Karma manipulates rolls
// and builds things but never buys advancement; a hero belongs to one pool
// at a time; a dissolved pool cannot re-form until after the next session;
// permanent pools may be drawn on by members who are not present. Optional
// locking pool: nothing may be withdrawn, use is limited to die rolls,
// dissolved only by unanimous vote.
export const POOL_RULES = {
  minMembers: 2,
  advancementFromPool: false,
  poolsPerHero: 1,
  reformAfterNextSession: true,
  permanentPoolAbsentDraw: true,
  lock: { optional: true, withdrawals: false, useLimitedToDieRolls: true, dissolveUnanimous: true },
};

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
export const KARMA_INCREMENT_OPTION = 5;   // optional rule: spend in increments of 5
export const EFFECT_REDUCTION_COST = 50;   // per color, Kill-capable columns
export const EFFECT_REDUCTION_COLUMNS = ['edged', 'shooting', 'energy']; // attacks that cannot be pulled without Karma
export const POWER_STUNT_COST = 100;

// The declared spend: at least 10 (or the remainder if less), the amount
// need not be named up front, and the 10 is spent even if the roll already
// succeeded or no amount could save it (Examples 2 and 3).
export function declaredKarmaSpend({ reserve, wanted = null }) {
  const minimum = Math.min(MIN_KARMA_DECLARATION, reserve);
  const amount = wanted == null ? minimum : Math.min(reserve, Math.max(minimum, wanted));
  return { minimum, amount };
}

// Building Things is the one roll where the amount must be fixed before the
// dice; an undeclared amount is taken as 10.
export const BUILD_KARMA = { amountBeforeRoll: true, undeclaredDefault: 10 };

// Power stunt FEAT by prior SUCCESSES (RULED 2026-09-03): none red; one to
// three yellow; four to nine green; ten successes = mastered, automatic.
export const POWER_STUNT_MASTERY = 10;
export function powerStuntRequiredColor(successes) {
  if (successes >= POWER_STUNT_MASTERY) return 'automatic';
  if (successes > 3) return 'green';
  if (successes >= 1) return 'yellow';
  return 'red';
}

// --- Advancement --------------------------------------------------------

// One Advancement fund per hero at a time, for one of the seven purposes;
// after a purchase the remainder may move to another purpose. Funds are
// added in quiet time, never mid-combat or mid-adventure, and are untouched
// by negative modifiers.
export const ADVANCEMENT_FUND_RULES = {
  purposes: ['ability', 'resource', 'popularity', 'power', 'powerAddition', 'talentAddition', 'contactAddition'],
  fundsAtOnce: 1,
  quietTimeOnly: true,
  immuneToLosses: true,
};

// Rationales: an ability may rise to Excellent freely; beyond Excellent, or
// more than one rank above the original, the Judge may ask why. Powers need
// one for any increase past the first rank gained; new Powers and Talents
// always need one.
export function abilityAdvancementNeedsRationale({ originalRankKey, newRankKey }) {
  return rankDistance('EX', newRankKey) > 0 || rankDistance(originalRankKey, newRankKey) > 1;
}
export const POPULARITY_ADVANCEMENT_CHARITY_WINDOW_DAYS = 21;

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
