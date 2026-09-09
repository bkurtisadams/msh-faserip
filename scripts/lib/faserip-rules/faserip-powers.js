// faserip-rules powers v0.2.0
// v0.2.0: RULED 2026-09-09 (Judge), superseding the 2026-09-05 flat-pool
//         ruling: the absorbed points are ONE budget. They first heal existing
//         damage to max Health ("healing existing damage"), and only the
//         remainder raises Health above max as the pool ("even temporarily
//         raising"). Health 70/100 hit by a 5-point shock -> 75, no pool; at
//         100/100 a 48-point bolt -> pool 48 (book example). The pool is
//         capped at the Power rank number and one 10-round clock is refreshed
//         by each absorption. absorbAttack takes maxHealth and the held pool.
// faserip-rules powers v0.1.0
// v0.1.0: Appendix A/B power mechanics, slice 1 — Absorption. RULED
//         2026-09-05 (Judge): the pool granted is the Power rank NUMBER,
//         flat, whatever the absorbed attack's damage; damage above the rank
//         number is taken against real Health and may not be paid out of the
//         pool the same attack grants; later damage comes off the pool first;
//         the excess is the absorber's own attack the following round. Pool
//         caps at the rank number (a second absorption refreshes, it does not
//         stack), one 10-round clock refreshed by each absorption, and the
//         redirect rolls on the absorbed damage type's own column at the
//         absorber's Agility.
// Certified against the Players Book Appendix A Absorption Power text and
// its worked example (Health 100 + Amazing(48) -> 148).

export const POWERS_VERSION = '0.2.0';
export const POWERS_CERTIFIED = true;

// --- Absorption ---------------------------------------------------------

// "Any such absorbed energy dissipates 10 rounds after it has been absorbed,
// and must be discharged before then or it is lost."
export const ABSORPTION_POOL_ROUNDS = 10;

// Redirect column by absorbed damage type. RULED 2026-09-05: the book gives
// an amount but no attack form; the redirect resolves as the absorbed type
// on its own column, at the absorber's Agility.
export const ABSORPTION_REDIRECT_COLUMNS = {
  energy: 'En',
  force: 'Fo',
  'physical-blunt': 'BA',
  'physical-edged': 'EA',
  'physical-ranged': 'Sh',
};

export function absorptionRedirectColumn(damageType) {
  return ABSORPTION_REDIRECT_COLUMNS[damageType] ?? 'En';
}

// Resolve one attack of the absorbed type.
//   rankNumber : the Absorption Power's rank number (R)
//   damage     : incoming damage of the absorbed type
//   health     : the absorber's current REAL Health
//   maxHealth  : the absorber's max Health (heal ceiling)
//   pool       : pool already held (0 if none)
//   round      : current combat round (for the pool clock)
// Up to R of the hit is absorbed. RULED 2026-09-09: the absorbed points heal
// existing damage first, then the remainder joins the pool, which is capped
// at R. Damage above R is taken against real Health and is NOT paid out of
// the pool; it is the amount available to redirect next round. Each
// absorption refreshes the single 10-round clock.
export function absorbAttack({ rankNumber, damage, health, maxHealth, pool = 0, round = 0 }) {
  const R = Math.max(0, Math.floor(Number(rankNumber) || 0));
  const dmg = Math.max(0, Math.floor(Number(damage) || 0));
  const hp = Math.max(0, Math.floor(Number(health) || 0));
  const max = Math.max(hp, Math.floor(Number(maxHealth ?? hp) || 0));
  const held = Math.max(0, Math.floor(Number(pool) || 0));
  const absorbed = Math.min(dmg, R);
  const excess = dmg - absorbed;
  const healed = Math.min(absorbed, max - hp);
  const poolGain = absorbed - healed;
  const newPool = Math.min(R, held + poolGain);
  return {
    absorbed,
    healed,
    poolGain: newPool - held,
    pool: newPool,                              // capped at R
    poolExpiresRound: round + ABSORPTION_POOL_ROUNDS,
    health: Math.max(0, hp + healed - excess),  // excess bypasses the pool
    healthLoss: excess,
    redirect: excess,                           // usable the following round
    redirectRound: round + 1,
  };
}

// Damage of any other kind (or of the absorbed kind once the Power is spent)
// comes off the pool first, then real Health.
export function applyDamageToPool({ pool = 0, health, damage }) {
  const dmg = Math.max(0, Math.floor(Number(damage) || 0));
  const fromPool = Math.min(pool, dmg);
  return {
    pool: pool - fromPool,
    health: Math.max(0, health - (dmg - fromPool)),
    fromPool,
    fromHealth: dmg - fromPool,
  };
}

// The pool is lost outright if not discharged in time.
export function absorptionPoolExpired(currentRound, poolExpiresRound) {
  return currentRound >= poolExpiresRound;
}

// Displayed Health while a pool is held: real Health plus the pool. Expiry
// removes the pool only — real Health already reflects any excess taken.
export function absorptionDisplayHealth({ health, pool = 0, expired = false }) {
  return expired ? health : health + pool;
}
