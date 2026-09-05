// faserip-rules resources v0.1.0
// Resource FEATs (Advanced Set): purchase colour by rank gap, the once-per-
// week rule, failure lockout, and the Bank Loan option.
import { rankByKey, rankDistance, shiftRank, colorForRoll, colorAtLeast } from './faserip-kernel.js';

export const RESOURCES_VERSION = '0.1.0';
export const RESOURCES_CERTIFIED = true;

export const RESOURCE_FEAT_INTERVAL_DAYS = 7;
export const LOAN_MAX_RANKS_ABOVE = 1;
export const LOAN_PAYMENT_SHIFT = -2;

/**
 * Colour needed to buy an item, or why it cannot be attempted.
 * Item three or more ranks below Resources: automatic. One or two below:
 * green. Equal: yellow. Above Resources: a lone character may not try.
 */
export function purchaseColor({ resourceRank, itemRank }) {
  const gap = rankDistance(itemRank, resourceRank); // resources minus item
  if (gap < 0) return { allowed: false, needed: null, automatic: false, gap, reason: 'item rank exceeds Resource rank' };
  if (gap >= 3) return { allowed: true, needed: null, automatic: true, gap };
  if (gap >= 1) return { allowed: true, needed: 'green', automatic: false, gap };
  return { allowed: true, needed: 'yellow', automatic: false, gap };
}

/**
 * The once-per-week rule: a Resource FEAT within the previous seven days
 * makes any further FEAT fail automatically. Times are in seconds.
 */
export function resourceFeatAvailable({ lastFeatAt = null, now, daySeconds = 86400 }) {
  if (lastFeatAt == null) return { available: true, secondsRemaining: 0 };
  const elapsed = now - lastFeatAt;
  const wait = RESOURCE_FEAT_INTERVAL_DAYS * daySeconds;
  if (elapsed >= wait) return { available: true, secondsRemaining: 0 };
  return { available: false, secondsRemaining: wait - elapsed };
}

/**
 * After a failed purchase the character cannot try for any item of that
 * rank or higher for a week (saving up).
 */
export function purchaseBlockedByFailure({ failedRank, failedAt, itemRank, now, daySeconds = 86400 }) {
  if (failedRank == null || failedAt == null) return false;
  if (now - failedAt >= RESOURCE_FEAT_INTERVAL_DAYS * daySeconds) return false;
  return rankDistance(failedRank, itemRank) >= 0; // item at or above the failed rank
}

/** Resolve a Resource FEAT roll (Karma allowed, capped at 100). */
export function resolveResourceFeat({ resourceRank, itemRank, roll, karma = 0 }) {
  const p = purchaseColor({ resourceRank, itemRank });
  if (!p.allowed) return { ...p, success: false, color: null };
  if (p.automatic) return { ...p, success: true, color: null };
  const total = Math.min(100, roll + karma);
  const color = colorForRoll(resourceRank, total);
  return { ...p, roll, karma, total, color, success: colorAtLeast(color, p.needed) };
}

/**
 * Bank Loan option: buy up to one rank above Resources with no purchase
 * FEAT (RULED 2026-09-05), then make a monthly Resource FEAT against a cost
 * two ranks below the item for as many months as the item's rank number.
 * Failure to pay: the bank takes the item back.
 */
export function bankLoan({ resourceRank, itemRank }) {
  const above = rankDistance(resourceRank, itemRank);
  if (above > LOAN_MAX_RANKS_ABOVE) return { allowed: false, reason: `loans reach at most ${LOAN_MAX_RANKS_ABOVE} rank above Resources` };
  const paymentRank = shiftRank(itemRank, LOAN_PAYMENT_SHIFT).key;
  const months = rankByKey(itemRank).standard;
  return { allowed: true, purchaseFeat: null, paymentRank, months, monthlyFeat: purchaseColor({ resourceRank, itemRank: paymentRank }) };
}
