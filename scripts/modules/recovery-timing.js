// scripts/modules/recovery-timing.js v1.0.0 - 2026-08-20
// Pure timing helpers for FASERIP dying / Recovery / Healing.

/** Return a sane positive FASERIP turn length in seconds. */
export function normalizeTurnSeconds(value, fallback = 6) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Number of complete FASERIP turns represented by an elapsed-second delta. */
export function countElapsedTurns(deltaSeconds, turnSeconds = 6) {
  const dt = Number(deltaSeconds);
  const turn = normalizeTurnSeconds(turnSeconds);
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.max(0, Math.floor(dt / turn));
}

/**
 * Healing repeats hourly. The next manual heal is measured from whichever is
 * later: the most recent damage or the most recent manual heal.
 */
export function healingAnchor(lastDamageWorldTime, lastHealingWorldTime) {
  const damage = Number(lastDamageWorldTime);
  const healed = Number(lastHealingWorldTime);
  const hasDamage = lastDamageWorldTime !== null && lastDamageWorldTime !== undefined && Number.isFinite(damage);
  const hasHealed = lastHealingWorldTime !== null && lastHealingWorldTime !== undefined && Number.isFinite(healed);
  if (!hasDamage && !hasHealed) return null;
  if (!hasDamage) return healed;
  if (!hasHealed) return damage;
  return Math.max(damage, healed);
}

/** Remaining seconds until the next hourly Healing tick. */
export function healingSecondsRemaining({
  worldNow,
  lastDamageWorldTime,
  lastHealingWorldTime,
  intervalSeconds = 3600,
} = {}) {
  const now = Number(worldNow);
  const anchor = healingAnchor(lastDamageWorldTime, lastHealingWorldTime);
  if (!Number.isFinite(now) || anchor == null) return null;
  const interval = Number.isFinite(Number(intervalSeconds)) && Number(intervalSeconds) > 0
    ? Number(intervalSeconds)
    : 3600;
  return Math.max(0, interval - (now - anchor));
}
