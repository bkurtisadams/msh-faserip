// faserip-rules popularity v0.1.0
// Popularity FEATs (Advanced Set): dispositions, request column shifts,
// negative Popularity, failure consequences. Secret and public identities
// carry separate Popularity numbers; the caller passes the one in play.
import { rankForNumber, shiftRank, requiredColor, colorForRoll, colorAtLeast, RANKS } from './faserip-kernel.js';

export const POPULARITY_VERSION = '0.1.0';
export const POPULARITY_CERTIFIED = true;

export const DISPOSITIONS = ['friendly', 'neutral', 'unfriendly', 'hostile'];

// Friendly green, Neutral yellow, Unfriendly red, Hostile impossible.
export const DISPOSITION_COLOR = { friendly: 'green', neutral: 'yellow', unfriendly: 'red', hostile: null };

export const DISPOSITION_EXAMPLES = {
  friendly: ['close friends and relatives', 'listed Contacts'],
  neutral: ['people who have heard of the hero but never met him', 'other heroes not yet worked with', 'large groups of strangers'],
  unfriendly: ['people who have never met or heard of the hero', 'total strangers', 'individuals of opposite Popularity sign', 'Neutral characters the hero has offended'],
  hostile: ['people actively opposing the hero and his goals', 'sworn enemies', 'people the hero has hurt'],
};

// Column shifts for the nature of the request.
export const REQUEST_MODIFIERS = {
  targetBenefits: 2,
  targetInDanger: -3,
  valueUpToGood: -1,
  valueUpToRemarkable: -2,
  mayNotBeReturned: -2,
  unique: -3,
};

export function requestShift(flags = {}) {
  let cs = 0;
  for (const [k, v] of Object.entries(REQUEST_MODIFIERS)) if (flags[k]) cs += v;
  return cs;
}

// What a failure means for each disposition.
export const FAILURE_CONSEQUENCE = {
  friendly: 'polite refusal, usually with a good reason',
  neutral: 'curt refusal; the target may become Unfriendly',
  unfriendly: 'the target turns ugly; the hero may be attacked',
  hostile: 'will not listen',
};

// Popularity number -> rank column (a Popularity of 45 rolls on Incredible).
export function popularityRank(popularity) {
  return rankForNumber(Math.abs(popularity)).key;
}

/**
 * Work out the column and colour for a Popularity FEAT.
 * Negative Popularity ignores disposition: everything is yellow, the only
 * modifier is the target's benefit, and only Contacts can be approached.
 */
export function popularityFeat({ popularity, disposition, request = {}, isContact = false }) {
  const negative = popularity < 0;
  const baseRank = popularityRank(popularity);
  if (negative) {
    const shift = request.targetBenefits ? REQUEST_MODIFIERS.targetBenefits : 0;
    const column = shiftRank(baseRank, shift).key;
    if (!isContact) return { allowed: false, reason: 'negative Popularity: only Contacts can be approached', negative, baseRank, column, shift, needed: 'yellow' };
    return { allowed: true, negative, baseRank, column, shift, needed: 'yellow', disposition, consequence: FAILURE_CONSEQUENCE[disposition] ?? null };
  }
  if (!DISPOSITIONS.includes(disposition)) throw new Error(`Unknown disposition: ${disposition}`);
  const needed = DISPOSITION_COLOR[disposition];
  const shift = requestShift(request);
  const column = shiftRank(baseRank, shift).key;
  if (!needed) return { allowed: false, reason: 'hostile targets are impossible FEATs', negative, baseRank, column, shift, needed: null, disposition };
  return { allowed: true, negative, baseRank, column, shift, needed, disposition, consequence: FAILURE_CONSEQUENCE[disposition] };
}

/** Resolve a rolled Popularity FEAT. Karma is added to the roll, capped at 100. */
export function resolvePopularityFeat({ popularity, disposition, request = {}, isContact = false, roll, karma = 0 }) {
  const feat = popularityFeat({ popularity, disposition, request, isContact });
  if (!feat.allowed) return { ...feat, roll, success: false, color: null };
  const total = Math.min(100, roll + karma);
  const color = colorForRoll(feat.column, total);
  const success = colorAtLeast(color, feat.needed);
  return { ...feat, roll, karma, total, color, success, consequence: success ? null : feat.consequence };
}
