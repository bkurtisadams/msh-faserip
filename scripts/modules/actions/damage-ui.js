// scripts/modules/actions/damage-ui.js

/**
 * Build a standardized "Damage" block for action chat cards.
 * Shows raw damage, optional note, after-armor (single target or 'varies'),
 * and a source label (e.g., Bare Hands, Weapon: X, Power: Y).
 *
 * @param {Object} opts
 * @param {boolean} opts.isHit
 * @param {number}  opts.rawDamage
 * @param {number}  opts.afterArmor
 * @param {string}  [opts.note=""]
 * @param {string}  [opts.sourceLabel="Bare Hands"]
 * @param {string}  [opts.targetName=""]
 * @param {number}  [opts.multiTargetCount=0]
 * @returns {string} HTML
 */
export function makeDamageBlock({
  isHit,
  rawDamage,
  afterArmor,
  note = "",
  sourceLabel = "Bare Hands",
  targetName = "",
  multiTargetCount = 0
}) {
  const safeRaw = Number.isFinite(rawDamage) ? rawDamage : 0;
  const safeAfter = Number.isFinite(afterArmor) ? afterArmor : 0;

  const afterArmorLine = !isHit ? "" :
    (multiTargetCount > 1
      ? `<div><b>After Armor (varies):</b> Resolve per target</div>`
      : `<div><b>After Armor${targetName ? ` (${escapeHtml(targetName)})` : ""}:</b> ${safeAfter}</div>`);

  return `
    <div style="margin:6px 10px;padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff;">
      <div><b>Damage (raw):</b> ${safeRaw}${note ? ` <span style="color:#666;">— ${escapeHtml(note)}</span>` : ""}</div>
      ${afterArmorLine}
      <div style="font-size:.9em;color:#555;">Source: ${escapeHtml(sourceLabel)}</div>
    </div>
  `;
}

/**
 * Compute after-armor amounts given targets and a resolver.
 * If there is exactly one target, subtract that target's applicable armor.
 * Otherwise, return rawDamage and metadata for UI.
 *
 * @param {Object} opts
 * @param {boolean} opts.isHit
 * @param {number}  opts.rawDamage
 * @param {string}  opts.damageType               e.g., "physical-blunt", "physical-edged", "energy-generic"
 * @param {Iterable<Token>|Set<Token>|Array<Token>} opts.targets  usually game.user?.targets
 * @param {(actor: Actor, damageType: string) => { applicable: number }} opts.getArmorFn
 * @returns {{ afterArmor: number, targetName: string, multiTargetCount: number, targetsArray: Token[] }}
 */
export function computeAfterArmor({
  isHit,
  rawDamage,
  damageType,
  targets,
  getArmorFn
}) {
  const arr = Array.from(targets ?? []);
  const single = arr.length === 1;

  let afterArmor = Number.isFinite(rawDamage) ? rawDamage : 0;
  let targetName = "";

  if (isHit && afterArmor > 0 && single) {
    const tok = arr[0];
    targetName = tok?.name || "";
    const armor = safeArmor(getArmorFn?.(tok?.actor, damageType));
    afterArmor = Math.max(0, afterArmor - armor.applicable);
  }

  return {
    afterArmor,
    targetName,
    multiTargetCount: arr.length,
    targetsArray: arr
  };
}

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

/* ---------------------------------- */
/* Internal tiny utilities            */
/* ---------------------------------- */

/** Minimal HTML escape for inline text content. */
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Normalize armor object shape. */
function safeArmor(a) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  if (!a || typeof a !== "object") return { applicable: 0 };
  return { applicable: n(a.applicable) };
}
