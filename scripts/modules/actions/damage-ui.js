/**
 * Build standardized flags for ChatMessage.create so downstream handlers
 * (e.g., Apply Damage) can read exact values without scraping HTML.
 *
 * @param {Object} opts
 * @param {string} opts.actionId
 * @param {string} opts.damageType
 * @param {number} opts.rawDamage
 * @param {number} opts.afterArmor
 * @param {string} opts.resultColor         lower-case color ("white","green","yellow","red")
 * @param {number} opts.cappedTotal         final roll (after karma etc.)
 * @param {Iterable<Token>|Array<Token>} [opts.targets=[]]  tokens or token-like
 * @returns {Object} flags object for ChatMessage.create({ flags })
 */
export function buildDamageFlags({
  actionId,
  damageType,
  rawDamage,
  afterArmor,
  resultColor,
  cappedTotal,
  targets = []
}) {
  const mapped = Array.from(targets ?? []).map(
    t => t?.document?.uuid ?? t?.actor?.uuid ?? t?.id
  );
  return {
    "msh-faserip": {
      actionId,
      damageType,
      rawDamage: Number.isFinite(rawDamage) ? rawDamage : 0,
      afterArmor: Number.isFinite(afterArmor) ? afterArmor : 0,
      resultColor,
      cappedTotal,
      targets: mapped
    }
  };
}
