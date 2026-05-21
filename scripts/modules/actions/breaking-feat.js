// breaking-feat.js v1.6.0 - 2026-05-21
// v1.6.0: Add executePenetrationFeat() + buildPenetrationFeatCardHtml()
//         for the house rule "claws penetrate natural BA" path.
//         Per DESIGN-material-strength.md §8 House Rule. Comparator is
//         the claws material strength (NOT power rank — different from
//         the shred FEAT), making the substance itself the
//         differentiator. Wolverine Cl1000 vs Hulk Amazing natural BA
//         = rankGap +6 = auto-pen. Generic Good claws vs same Hulk =
//         pre-check fails. Only used when world setting
//         houseRules.clawsPenetrateNaturalBA is on. Per-attack only —
//         does not disable AEs.
// v1.5.0: Add executeShredFeat() + buildShredFeatCardHtml() for the
//         claws / corrosive / rotting Shred FEAT path. Per DESIGN-
//         material-strength.md rev 2 §5: comparator is power rank
//         (acting as Strength per Rotting/Corrosive "Power rank
//         Strength" wording), pre-check uses claws material strength
//         vs target material strength as a capability gate. Auto-
//         shred at rankGap >= +3, impossible at rankGap <= -2.
//         executeBreakingFeat unchanged — still wielderStr comparator
//         for the generic "character bashes through wall" case.
// v1.4.0: Extract executeBreakingFeat() for auto/semi mode; dialog uses shared logic
// v1.3.0: Fix inverted break result (success=breaks), auto-success/fail for 3+ rank gap
// v1.2.1: Add debug logging
// v1.2.0: Auto-populate target material from attack context
// v1.1.0: Chat card styled to match attack action format

import { rollUniversalTable } from "../dice/universal-table.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

const RANKS = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent",
  "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
  "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
];

// Banner colors for result display
function bannerColors(color) {
  switch (String(color).toLowerCase()) {
    case "white": return { bg: "#e0e0e0", fg: "#333" };
    case "green": return { bg: "#4caf50", fg: "#fff" };
    case "yellow": return { bg: "#ffeb3b", fg: "#333" };
    case "red": return { bg: "#f44336", fg: "#fff" };
    default: return { bg: "#9e9e9e", fg: "#fff" };
  }
}

/**
 * Execute a Breaking FEAT roll (no dialog).
 * Returns a result object for inline display or chat card posting.
 *
 * @param {Object} opts
 * @param {string} opts.weaponMatRank - Weapon material rank
 * @param {string} opts.targetMatRank - Target material/armor rank
 * @param {Actor}  [opts.actor]       - The wielding actor
 * @param {boolean} [opts.postChat=false] - If true, post a standalone chat card
 * @returns {Promise<Object|null>} result object or null if no check needed
 */
export async function executeBreakingFeat({ weaponMatRank = "Excellent", targetMatRank = "", weaponName = "", itemUuid = null, actor = null, postChat = false }) {
  const weaponIdx = RANKS.indexOf(weaponMatRank);
  const targetIdx = RANKS.indexOf(targetMatRank);

  if (weaponIdx === -1 || targetIdx === -1 || weaponIdx >= targetIdx) {
    console.log("[FASERIP] Breaking FEAT: no check needed (weapon not weaker than target)");
    return null;
  }

  const wielderStr = actor?.system?.abilities?.strength?.rank ?? "Typical";
  const comparatorRank = wielderStr;
  const intensityRank = weaponMatRank;

  const strIdx = RANKS.indexOf(comparatorRank);
  const matIdx = RANKS.indexOf(intensityRank);
  const rankGap = strIdx - matIdx;

  let color, roll = null, autoResult = null, passed = false;

  if (rankGap >= 3) {
    autoResult = "auto-break";
    color = "green";
  } else if (rankGap <= -3) {
    autoResult = "auto-survive";
    color = "white";
  } else {
    roll = new Roll("1d100");
    await roll.evaluate();
    color = game.msh.rollUniversalTable(comparatorRank, roll.total);
    const reqColor = requiredColorForIntensity(comparatorRank, intensityRank);
    passed = compareColors(color, reqColor);
  }

  const colorLower = String(color).toLowerCase();
  const weaponBreaks = autoResult ? autoResult === "auto-break" : passed;
  const reqColor = requiredColorForIntensity(comparatorRank, intensityRank);

  // Auto-mark the item broken when the weapon breaks.
  // Only applies to equipment items (not natural weapons, objects, etc.).
  if (weaponBreaks && itemUuid) {
    try {
      const item = await fromUuid(itemUuid);
      if (item && item.type === "equipment" && !item.system?.broken) {
        await item.update({ "system.broken": true });
        console.log(`[FASERIP] Broken flag set on ${item.name} (${itemUuid})`);
      }
    } catch (e) {
      console.warn("[FASERIP] Could not mark item broken:", itemUuid, e);
    }
  }

  const result = {
    weaponMatRank,
    targetMatRank,
    weaponName,
    itemUuid,
    wielderStr: comparatorRank,
    intensityRank,
    colorLower,
    reqColor,
    roll: roll?.total ?? null,
    autoResult,
    weaponBreaks,
    actorName: actor?.name ?? "Character"
  };

  if (postChat) {
    const cardHtml = buildBreakingFeatCardHtml(result);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml
    });
  }

  return result;
}

/**
 * Build a standalone Breaking FEAT chat card (used by dialog and semi-mode direct roll).
 */
export function buildBreakingFeatCardHtml(result) {
  const { weaponMatRank, targetMatRank, weaponName, wielderStr, intensityRank, colorLower, reqColor, roll, autoResult, weaponBreaks, actorName } = result;
  const { bg, fg } = bannerColors(colorLower);
  const { bg: reqBg, fg: reqFg } = bannerColors(reqColor);
  const weaponLabel = weaponName ? weaponName : "Weapon";

  return `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
        <strong style="color:#8b0000;">BREAKING FEAT</strong>
      </div>
      <div style="padding:4px 10px;font-size:.95em;">
        <strong>${actorName}</strong>
      </div>
      <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
        <div>Strength: ${wielderStr}</div>
        ${autoResult ? `
        <div style="font-weight:bold;color:#555;">
          ${autoResult === "auto-break" ? "Automatic (Str 3+ ranks above material)" : "Automatic (Str 3+ ranks below material)"}
        </div>
        ` : `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Roll: <span title="d100 = ${roll}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll}</span></span>
          <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
            ${colorLower.toUpperCase()}
          </span>
        </div>
        `}
      </div>
      <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
        <div><strong>${weaponLabel}:</strong> ${weaponMatRank} material</div>
        <div><strong>Target Armor:</strong> ${targetMatRank}</div>
        ${!autoResult ? `<div><strong>To break:</strong> <span style="padding:1px 6px;border-radius:2px;background:${reqBg};color:${reqFg};font-size:.85em;">${reqColor.toUpperCase()}</span> <span style="color:#666;">(Str ${wielderStr} vs ${intensityRank} intensity)</span></div>` : ''}
      </div>
      <div style="margin:6px 10px 8px;padding:8px;text-align:center;font-weight:bold;border-radius:3px;background:${weaponBreaks ? '#ffebee' : '#e8f5e9'};border:1px solid ${weaponBreaks ? '#ef5350' : '#66bb6a'};color:${weaponBreaks ? '#c62828' : '#2e7d32'};">
        ${weaponBreaks ? 'WEAPON BREAKS' : 'WEAPON SURVIVES'}
      </div>
    </div>`;
}

// ─── Shred FEAT (claws / corrosive / rotting) ──────────────────────────────

/**
 * Execute a Shred FEAT — material-strength-driven attempt to destroy
 * armor or non-living object material. Used by the claws, corrosive
 * touch, and rotting touch shred actions.
 *
 * Per DESIGN-material-strength.md rev 2 §5 and the explicit RAW
 * "Power rank Strength" wording in Rotting/Corrosive: the comparator
 * is the power's rank (acting as Strength); the attacker material
 * strength is a separate pre-check capability gate. For most claws
 * powers attackerMatRank === powerRank; Wolverine's adamantium case
 * separates them (Class 1000 material strength, Excellent power rank).
 *
 * @param {Object} opts
 * @param {string} opts.attackerMatRank - Claws/power material strength
 *                                        (pre-check value).
 * @param {string} opts.powerRank       - Power rank acting as Strength.
 *                                        FEAT comparator.
 * @param {string} opts.targetMatRank   - Target material strength
 *                                        (BA material rank or object
 *                                        material rank). FEAT intensity.
 * @param {string} [opts.attackerName]
 * @param {string} [opts.powerName]
 * @param {Actor}  [opts.actor]         - Shredding actor (for speaker).
 * @param {Actor}  [opts.targetActor]   - Target actor (for AE disable).
 * @param {string} [opts.targetBaAeId]  - BA defense AE ongoingId to
 *                                        disable on shred success.
 * @param {boolean} [opts.postChat=false]
 * @returns {Promise<Object|null>} result object or null on bad input
 */
export async function executeShredFeat({
  attackerMatRank = "",
  powerRank = "",
  targetMatRank = "",
  attackerName = "",
  powerName = "",
  actor = null,
  targetActor = null,
  targetBaAeId = null,
  postChat = false
}) {
  const atkMatIdx = RANKS.indexOf(attackerMatRank);
  const powerIdx  = RANKS.indexOf(powerRank);
  const tgtMatIdx = RANKS.indexOf(targetMatRank);

  if (atkMatIdx === -1 || powerIdx === -1 || tgtMatIdx === -1) {
    console.warn("[FASERIP] Shred FEAT: bad ranks", { attackerMatRank, powerRank, targetMatRank });
    return null;
  }

  // Pre-check: claws material strength must be >= target material
  // strength. Without this the claws aren't physically capable of
  // denting the material and the FEAT is refused before rolling.
  const preCheckFailed = atkMatIdx < tgtMatIdx;
  if (preCheckFailed) {
    const result = {
      attackerMatRank, powerRank, targetMatRank,
      attackerName, powerName,
      preCheckFailed: true,
      colorLower: "white",
      reqColor: "red",
      roll: null,
      autoResult: "pre-check-fail",
      shredded: false,
      actorName: actor?.name ?? "Character"
    };
    if (postChat) {
      const cardHtml = buildShredFeatCardHtml(result);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cardHtml
      });
    }
    return result;
  }

  // FEAT: Power rank (Ability) vs target material strength (Intensity).
  // rankGap >= +3 = auto-shred; rankGap <= -2 = impossible per Judges
  // Book; otherwise roll on the power rank column.
  const rankGap = powerIdx - tgtMatIdx;

  let color, roll = null, autoResult = null, passed = false;

  if (rankGap >= 3) {
    autoResult = "auto-shred";
    color = "green";
    passed = true;
  } else if (rankGap <= -2) {
    autoResult = "impossible";
    color = "white";
    passed = false;
  } else {
    roll = new Roll("1d100");
    await roll.evaluate();
    color = game.msh.rollUniversalTable(powerRank, roll.total);
    const reqColor = requiredColorForIntensity(powerRank, targetMatRank);
    passed = compareColors(color, reqColor);
  }

  const colorLower = String(color).toLowerCase();
  const reqColor = requiredColorForIntensity(powerRank, targetMatRank);
  const shredded = passed;

  // Auto-disable the target's BA defense AE on a successful shred.
  // The AE is found by its ongoingId flag. Disabled AEs are filtered
  // out by the mitigation pipeline, so subsequent attacks against the
  // target ignore that BA entirely until the GM re-enables.
  if (shredded && targetActor && targetBaAeId) {
    try {
      const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
      const ae = targetActor.effects.find(e => e.flags?.[scope]?.ongoingId === targetBaAeId);
      if (ae && !ae.disabled) {
        await ae.update({ disabled: true });
        console.log(`[FASERIP] Shred FEAT: disabled BA AE ${targetBaAeId} on ${targetActor.name}`);
      }
    } catch (e) {
      console.warn("[FASERIP] Shred FEAT: could not disable BA AE", targetBaAeId, e);
    }
  }

  const result = {
    attackerMatRank, powerRank, targetMatRank,
    attackerName, powerName,
    preCheckFailed: false,
    colorLower,
    reqColor,
    roll: roll?.total ?? null,
    autoResult,
    shredded,
    actorName: actor?.name ?? "Character"
  };

  if (postChat) {
    const cardHtml = buildShredFeatCardHtml(result);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml
    });
  }

  return result;
}

/**
 * Build a standalone Shred FEAT chat card. Mirrors buildBreakingFeatCardHtml
 * styling but reports the shred-specific result fields.
 */
export function buildShredFeatCardHtml(result) {
  const {
    attackerMatRank, powerRank, targetMatRank,
    attackerName, powerName,
    preCheckFailed, colorLower, reqColor, roll, autoResult,
    shredded, actorName
  } = result;
  const { bg, fg } = bannerColors(colorLower);
  const { bg: reqBg, fg: reqFg } = bannerColors(reqColor);
  const powerLabel = powerName || attackerName || "Power";

  let resultBannerText, resultBg, resultBorder, resultFg;
  if (preCheckFailed) {
    resultBannerText = "PRE-CHECK FAILED";
    resultBg = "#fff3e0"; resultBorder = "#ff9800"; resultFg = "#e65100";
  } else if (autoResult === "impossible") {
    resultBannerText = "IMPOSSIBLE FEAT";
    resultBg = "#fff3e0"; resultBorder = "#ff9800"; resultFg = "#e65100";
  } else if (shredded) {
    resultBannerText = "ARMOR SHREDDED";
    resultBg = "#e8f5e9"; resultBorder = "#66bb6a"; resultFg = "#2e7d32";
  } else {
    resultBannerText = "NO EFFECT";
    resultBg = "#ffebee"; resultBorder = "#ef5350"; resultFg = "#c62828";
  }

  let middleBlock;
  if (preCheckFailed) {
    middleBlock = `
        <div style="font-weight:bold;color:#e65100;">
          Pre-check fail: ${attackerMatRank} material cannot dent ${targetMatRank}
        </div>`;
  } else if (autoResult === "auto-shred") {
    middleBlock = `
        <div style="font-weight:bold;color:#2e7d32;">
          Automatic (Power rank 3+ above target material)
        </div>`;
  } else if (autoResult === "impossible") {
    middleBlock = `
        <div style="font-weight:bold;color:#c62828;">
          Impossible (Target material 2+ above Power rank)
        </div>`;
  } else {
    middleBlock = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Roll: <span title="d100 = ${roll}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll}</span></span>
          <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
            ${colorLower.toUpperCase()}
          </span>
        </div>`;
  }

  return `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
        <strong style="color:#8b0000;">SHRED FEAT</strong>
      </div>
      <div style="padding:4px 10px;font-size:.95em;">
        <strong>${actorName}</strong>${powerName ? ` — <em>${powerName}</em>` : ''}
      </div>
      <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
        <div>Power Rank: ${powerRank}</div>
        ${middleBlock}
      </div>
      <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
        <div><strong>${powerLabel}:</strong> ${attackerMatRank} material</div>
        <div><strong>Target Material:</strong> ${targetMatRank}</div>
        ${!autoResult && !preCheckFailed ? `<div><strong>To shred:</strong> <span style="padding:1px 6px;border-radius:2px;background:${reqBg};color:${reqFg};font-size:.85em;">${reqColor.toUpperCase()}</span> <span style="color:#666;">(${powerRank} vs ${targetMatRank} intensity)</span></div>` : ''}
      </div>
      <div style="margin:6px 10px 8px;padding:8px;text-align:center;font-weight:bold;border-radius:3px;background:${resultBg};border:1px solid ${resultBorder};color:${resultFg};">
        ${resultBannerText}
      </div>
    </div>`;
}

// ─── Penetration FEAT (house rule: claws vs natural BA) ────────────────────

/**
 * Execute a Penetration FEAT — house rule mechanic that lets claws-class
 * powers attempt to bypass natural Body Armor for a single attack. Per
 * DESIGN-material-strength.md §8 House Rule.
 *
 * Differs from executeShredFeat:
 * - Comparator is the **claws material strength**, not the power rank.
 *   The substance of the claws is what penetrates, not the wielder's
 *   skill. This matches the design intent: adamantium claws cut through
 *   natural BA because they're adamantium, not because Wolverine is
 *   unusually capable.
 * - Per-attack only. Does NOT disable any AE. Success means the calling
 *   action stamps ignoresNaturalArmor on the choice for one attack;
 *   subsequent attacks must FEAT again.
 *
 * The caller is responsible for gating on the world setting
 * `houseRules.clawsPenetrateNaturalBA` and for only invoking this
 * against targets with natural BA. The function itself doesn't check.
 *
 * @param {Object} opts
 * @param {string} opts.attackerMatRank - Claws material strength (after
 *                                        +2CS limitation bump if applicable).
 *                                        FEAT comparator.
 * @param {string} opts.targetMatRank   - Target's natural BA material
 *                                        strength. FEAT intensity.
 * @param {string} [opts.attackerName]
 * @param {string} [opts.powerName]
 * @param {string} [opts.targetName]
 * @param {Actor}  [opts.actor]         - Attacking actor (for speaker).
 * @param {boolean} [opts.postChat=false]
 * @returns {Promise<Object|null>} result with .penetrated boolean, or null on bad ranks
 */
export async function executePenetrationFeat({
  attackerMatRank = "",
  targetMatRank = "",
  attackerName = "",
  powerName = "",
  targetName = "",
  actor = null,
  postChat = false
}) {
  const atkIdx = RANKS.indexOf(attackerMatRank);
  const tgtIdx = RANKS.indexOf(targetMatRank);

  if (atkIdx === -1 || tgtIdx === -1) {
    console.warn("[FASERIP] Penetration FEAT: bad ranks", { attackerMatRank, targetMatRank });
    return null;
  }

  const rankGap = atkIdx - tgtIdx;

  let color, roll = null, autoResult = null, passed = false;

  if (rankGap >= 3) {
    autoResult = "auto-pen";
    color = "green";
    passed = true;
  } else if (rankGap <= -2) {
    autoResult = "impossible";
    color = "white";
    passed = false;
  } else {
    roll = new Roll("1d100");
    await roll.evaluate();
    color = game.msh.rollUniversalTable(attackerMatRank, roll.total);
    const reqColor = requiredColorForIntensity(attackerMatRank, targetMatRank);
    passed = compareColors(color, reqColor);
  }

  const reqColor = requiredColorForIntensity(attackerMatRank, targetMatRank);
  const colorLower = String(color).toLowerCase();

  const result = {
    attackerMatRank, targetMatRank,
    attackerName, powerName, targetName,
    colorLower, reqColor,
    roll: roll?.total ?? null,
    autoResult,
    penetrated: passed,
    actorName: actor?.name ?? attackerName ?? "Character"
  };

  if (postChat) {
    const cardHtml = buildPenetrationFeatCardHtml(result);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml
    });
  }

  return result;
}

/**
 * Build a standalone Penetration FEAT chat card. Smaller / inline-flavor
 * relative to the shred card since this typically posts just before a
 * regular attack card (don't want to drown the chat in headers).
 */
export function buildPenetrationFeatCardHtml(result) {
  const {
    attackerMatRank, targetMatRank,
    powerName, targetName,
    colorLower, reqColor, roll, autoResult,
    penetrated, actorName
  } = result;
  const { bg, fg } = bannerColors(colorLower);
  const { bg: reqBg, fg: reqFg } = bannerColors(reqColor);
  const powerLabel = powerName || "Claws";

  let resultBannerText, resultBg, resultBorder, resultFg;
  if (autoResult === "impossible") {
    resultBannerText = "CANNOT PENETRATE";
    resultBg = "#fff3e0"; resultBorder = "#ff9800"; resultFg = "#e65100";
  } else if (penetrated) {
    resultBannerText = "CLAWS PENETRATE";
    resultBg = "#e8f5e9"; resultBorder = "#66bb6a"; resultFg = "#2e7d32";
  } else {
    resultBannerText = "DEFLECTED";
    resultBg = "#ffebee"; resultBorder = "#ef5350"; resultFg = "#c62828";
  }

  let middleBlock;
  if (autoResult === "auto-pen") {
    middleBlock = `<div style="font-weight:bold;color:#2e7d32;font-size:.85em;">Automatic (claws material 3+ above target armor)</div>`;
  } else if (autoResult === "impossible") {
    middleBlock = `<div style="font-weight:bold;color:#c62828;font-size:.85em;">Impossible (target armor 2+ above claws material)</div>`;
  } else {
    middleBlock = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.85em;">
        <span>Roll: <span title="d100 = ${roll}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll}</span></span>
        <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.85em;background:${bg};color:${fg};">${colorLower.toUpperCase()}</span>
        <span style="color:#666;">Req: <span style="padding:1px 6px;border-radius:2px;background:${reqBg};color:${reqFg};font-size:.85em;">${reqColor.toUpperCase()}</span></span>
      </div>`;
  }

  return `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:4px 10px;border-bottom:1px solid #c0c0c0;font-size:.9em;">
        <strong style="color:#8b0000;">PENETRATION FEAT</strong> — ${actorName} vs ${targetName || "target"}
      </div>
      <div style="padding:4px 10px;font-size:.85em;color:#555;">
        <div><strong>${powerLabel}:</strong> ${attackerMatRank} material vs ${targetMatRank} natural BA</div>
        ${middleBlock}
      </div>
      <div style="margin:4px 10px 6px;padding:5px;text-align:center;font-weight:bold;border-radius:3px;background:${resultBg};border:1px solid ${resultBorder};color:${resultFg};font-size:.85em;">
        ${resultBannerText}
      </div>
    </div>`;
}

// ─── Breaking FEAT dialog (generic Str vs material) ────────────────────────

export function openBreakingFeatDialog({ weaponMatRank = "Excellent", targetMatRank = "", actor = null }) {
  console.log("[FASERIP] openBreakingFeatDialog called:", { weaponMatRank, targetMatRank, actorName: actor?.name });

  const options = RANKS.map(r => `<option value="${r}" ${r === targetMatRank ? 'selected' : ''}>${r}</option>`).join('');
  const wielderStr = actor?.system?.abilities?.strength?.rank ?? 'Typical';

  showFaseripButtonDialog({
    title: `Breaking FEAT — ${actor?.name ?? "Character"}`,
    content: `
      <div style="line-height:1.4;">
        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Wielder Strength:</label>
          <input type="text" value="${wielderStr}" readonly style="width:160px;">
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Weapon Material:</label>
          <input type="text" value="${weaponMatRank}" readonly style="width:160px;">
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Target Material:</label>
          <select name="bf-target-rank" style="width:170px;">${options}</select>
        </div>

        <div style="font-size:0.85em; color:#555; margin-top:8px; padding:6px; background:#fff3e0; border:1px solid #ff9800; border-radius:3px;">
          <strong>Rule:</strong> When weapon hits tougher material (weapon material &lt; target material/BA), 
          roll Wielder's Strength vs Weapon Material to see if weapon breaks.
          <ul style="margin:4px 0 0 20px; padding:0;">
            <li>Strength &gt; Weapon Mat: Green required</li>
            <li>Strength = Weapon Mat: Yellow required</li>
            <li>Strength &lt; Weapon Mat: Red required</li>
            <li><strong>Success = weapon breaks</strong></li>
            <li>3+ ranks above = auto-break</li>
            <li>3+ ranks below = auto-survive</li>
          </ul>
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll FEAT",
        callback: async (html) => {
          const targetRank = html.find('[name="bf-target-rank"]').val();
          await executeBreakingFeat({ weaponMatRank, targetMatRank: targetRank, actor, postChat: true });
        }
      },
      cancel: { label: "Cancel" }
    }
  });
}

// ===== helpers =====

// FEAT vs Intensity: how hard a color is needed based on column distance
export function requiredColorForIntensity(comparatorRank, intensityRank) {
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];
  const ci = RANKS.indexOf(comparatorRank);
  const ii = RANKS.indexOf(intensityRank);
  if (ci === -1 || ii === -1) return 'green';

  // Per FASERIP rules:
  // - Ability > Intensity: Green needed
  // - Ability = Intensity: Yellow needed
  // - Ability < Intensity: Red needed
  if (ci > ii) return 'green';   // comparator > intensity -> Green
  if (ci === ii) return 'yellow'; // equal -> Yellow
  return 'red';                   // comparator < intensity -> Red
}

// Return true if rolled color meets/exceeds the required color
function compareColors(rolled, required) {
  const order = { white: 0, green: 1, yellow: 2, red: 3 };
  const r = order[(rolled || '').toLowerCase()] ?? 0;
  const q = order[(required || '').toLowerCase()] ?? 1;
  return r >= q;
}