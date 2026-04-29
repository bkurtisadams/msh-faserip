// breaking-feat.js v1.4.0 - 2026-03-23
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