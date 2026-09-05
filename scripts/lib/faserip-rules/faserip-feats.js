// faserip-rules feats v0.1.0
// Combined and Multiple FEATs (Advanced Set).
import { rankDistance, shiftRank } from './faserip-kernel.js';

export const FEATS_VERSION = '0.1.0';
export const FEATS_CERTIFIED = true;

/**
 * Combined action: when the helper's ability (or a complementary Power) is
 * within one rank of the leader's, the leader rolls at +1CS.
 */
export function combinedActionColumn({ leaderRank, helperRank, complements = true }) {
  const within = complements && Math.abs(rankDistance(helperRank, leaderRank)) <= 1;
  return { shift: within ? 1 : 0, column: within ? shiftRank(leaderRank, 1).key : leaderRank, helperCounts: within };
}

// Colour order used to find the tougher action.
const ORDER = { automatic: 0, green: 1, yellow: 2, red: 3 };

export const MAX_NONCOMBAT_ACTIONS_PER_ROUND = 3;
export const MAX_COMBAT_PLUS_NONCOMBAT = { combat: 1, noncombat: 1 };

/**
 * More than one non-combat action in a round. Both actions take the colour
 * one step above the tougher one: automatic pairs stay automatic, a green
 * tougher action makes both yellow, yellow makes both red, red cannot be
 * paired (both fail).
 */
export function multipleActionColor(requiredColors) {
  const tough = requiredColors.reduce((a, c) => (ORDER[c ?? 'automatic'] > ORDER[a] ? (c ?? 'automatic') : a), 'automatic');
  if (tough === 'automatic') return { possible: true, needed: 'automatic', tougher: tough };
  if (tough === 'green') return { possible: true, needed: 'yellow', tougher: tough };
  if (tough === 'yellow') return { possible: true, needed: 'red', tougher: tough };
  return { possible: false, needed: null, tougher: tough };
}
