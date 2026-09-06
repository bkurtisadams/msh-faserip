// faserip-rules poisons v0.1.0
// Poisons and Toxins (Judge's Book): exposure FEAT, unconsciousness, the
// Endurance spiral, death at Shift 0, the one-rank-per-round cap, and who
// may halt the poison. Certified against the Judge's Book text; Judge
// rulings PR1-PR5 (2026-08, msh-faserip) recorded in the kernel ERRATA.
import { resolveFeat, requiredColor, rankByKey } from './faserip-kernel.js';
import { enduranceLossStep, impairedEnduranceNumber, IMPAIRED_ABILITY_SHIFT } from './faserip-damage.js';

export const POISONS_VERSION = '0.1.0';
export const POISONS_CERTIFIED = true;

export const POISON_UNCONSCIOUS_ROUNDS = { min: 1, max: 10 };
export const POISON_REFEAT_TURNS = { min: 1, max: 10 };
export const MAX_ENDURANCE_RANKS_LOST_PER_ROUND = 1;   // any cause
export const POISON_LOSS_PRIORITY = 'poison';           // poison losses override dying/Kill losses
export const POISON_DEATH_AT = 'SH0';                   // reaching Shift 0 by poison is death

// Who may halt a poison: the victim's own Endurance FEAT, or a helper with
// First Aid or Medicine training AND an antitoxin. Untrained help cannot.
export const HALTING = {
  victimFeat: true,
  helperRequires: { training: ['first-aid', 'medicine'], antitoxin: true },
  untrainedHelp: false,
};

export function helperCanHalt({ trained = false, antitoxin = false }) {
  return trained && antitoxin;
}

// PR2 (Judge ruling): losing Endurance ranks to poison does not itself
// impose the -2CS Impaired penalty; the lowered rank is the penalty.
// The ranks still heal per Impaired Abilities (one per week, one per day
// under care).
export const POISON_IMPAIRED_SHIFT = 0;
export const DYING_IMPAIRED_SHIFT = IMPAIRED_ABILITY_SHIFT;

/**
 * Exposure (or re-FEAT): Endurance FEAT against the toxin's Intensity on the
 * standard intensity ladder. Resistance to Toxins may substitute its rank
 * (pass it as featRank); on failure Endurance drops, not the Power.
 */
export function poisonFeat({ featRank, toxinIntensity, roll, karma = 0, karmaAllowed = true }) {
  const feat = resolveFeat({ rank: featRank, intensity: toxinIntensity, roll, karma, karmaAllowed });
  return { ...feat, needed: feat.needed ?? requiredColor(featRank, toxinIntensity) };
}

/**
 * Consequence of a failed poison FEAT: unconscious 1-10 rounds and one
 * Endurance rank lost (to the highest number of the new rank). Reaching
 * Shift 0 is death. The re-FEAT comes 1-10 turns later at the lowered rank.
 */
export function poisonFailure({ enduranceRank }) {
  if (enduranceRank === 'SH0') return { dead: true, rank: 'SH0', number: 0 };
  const step = enduranceLossStep(enduranceRank);
  const dead = step.rank === POISON_DEATH_AT;
  return {
    dead,
    rank: step.rank,
    number: dead ? 0 : step.numberForChecks,
    unconscious: POISON_UNCONSCIOUS_ROUNDS,
    refeatIn: POISON_REFEAT_TURNS,
  };
}

/** The one-rank-per-round cap across all causes; poison takes priority. */
export function rankLossAllowed({ lostThisRound = 0, cause = 'poison' }) {
  if (lostThisRound < MAX_ENDURANCE_RANKS_LOST_PER_ROUND) return { allowed: true, deferred: null };
  return { allowed: false, deferred: cause === POISON_LOSS_PRIORITY ? 'other losses yield' : cause };
}

/** Rank number while impaired by poison: the same highest-of-rank rule. */
export function poisonedEnduranceNumber(rankKey) {
  return impairedEnduranceNumber(rankKey);
}
