// scripts/modules/actions/grabbing-break.js v2.0.0 - 2026-09-02
// v2.0.0: RAW model. The Break follow-up is a roll ON the item's material
//         strength column: any colour = attacker keeps the item (use it or move
//         half speed), white = item damaged/broken/goes off. The previous code
//         (and its v1.1.0 kernel port) ran a Strength-vs-material Intensity FEAT
//         with success = breaks — inverted, and Strength is not part of the
//         rule. Now via kernel resolveGrabBreak; private rank array replaced by
//         RANKS_ORDERED; dead universal-table import dropped.
// scripts/modules/actions/grabbing-break.js

/**
 * Grabbing Break Check
 *
 * When a Break result is rolled on a Grabbing action, a second roll on the
 * item's material strength column decides its fate:
 * - White: item is damaged, broken, or goes off
 * - Any colour (Green/Yellow/Red): item intact — use it or move up to half speed
 */
import { showFaseripButtonDialog } from "./dialog-shim.js";
import { RANKS_ORDERED as RANKS } from "../../rules/rules-reference.js";
import { rankDistance } from "../../lib/faserip-rules/faserip-kernel.js";
import { resolveGrabBreak } from "../../lib/faserip-rules/faserip-effects.js";
import { kernelKeyFor } from "../../kernel/adapter.js";
export function openGrabbingBreakDialog({ itemMaterial = "Excellent", itemName = "Item", actor = null }) {
  // Close any existing instance (same id)
  const existing = Object.values(ui.windows).find(w => w.id === "grabbing-break-dialog");
  if (existing) existing.close({ force: true });

  showFaseripButtonDialog({
    title: `Grabbing Break Check — ${actor?.name ?? "Character"}`,
    content: `
      <div style="line-height:1.4;">
        <div style="margin-bottom:8px;">
          <label style="display:inline-block; width:130px;">Character:</label>
          <strong>${actor?.name ?? "Unknown"}</strong>
        </div>

        <div style="margin-bottom:8px;">
          <label style="display:inline-block; width:130px;">Item Grabbed:</label>
          <strong>${itemName}</strong>
        </div>

        <div style="margin-bottom:8px;">
          <label style="display:inline-block; width:130px;">Item Material:</label>
          <select name="itemMaterial" style="width:170px;">
              ${RANKS.map(r => `<option value="${r}" ${r===itemMaterial?'selected':''}>${r}</option>`).join('')}
          </select>
          </div>

        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:130px;">Column Shift:</label>
          <input type="number" name="shift" value="0" style="width:60px;">
          <span style="color:#666;font-size:.9em;">(+ easier, - harder)</span>
        </div>

        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:130px;">Karma:</label>
          <input type="number" name="karma" value="0" min="0" style="width:60px;">
        </div>

        <div style="font-size:0.85em; color:#555; margin-top:12px; padding:8px; background:#fff3e0; border:1px solid #ff9800; border-radius:3px;">
          <strong>Grabbing Break Check:</strong> roll on the item's <em>Material Strength</em> column.
          <ul style="margin:4px 0 0 20px; padding:0;">
            <li><strong>Green / Yellow / Red:</strong> item intact — use it, or move up to half speed away (round up).</li>
            <li><strong>White:</strong> item is damaged, broken, or goes off.</li>
          </ul>
        </div>
      </div>

    `,
    buttons: {
      roll: {
        label: "Roll Check",
        callback: async (html) => {
          const $ = (s) => html.find(s);
          // User inputs
          const selectedMaterial = String($('[name="itemMaterial"]').val() || itemMaterial);
          const shift = Number($('[name="shift"]').val() || 0);
          const karma = Number($('[name="karma"]').val() || 0);

          // Import helpers
          const { shiftRank, rollWithKarmaAndHistory } = await import("./action-utils.js");

          const effectiveRank = shiftRank(selectedMaterial, shift);

          // Roll
          const roll = await (new Roll("1d100")).evaluate();
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor?.name ?? 'Character'} — Grabbing Break Check`,
            rollMode: game.settings.get("core", "rollMode")
          });

          const { cappedTotal, totalKarmaUsed } =
            await rollWithKarmaAndHistory(actor, "Grabbing Break Check", karma, roll);

          // Second roll on the item's material column via the kernel.
          const matKey = kernelKeyFor(selectedMaterial);
          const matShiftable = !!matKey && rankDistance("SHZ", matKey) <= 0;
          const check = matKey
            ? resolveGrabBreak({ materialRank: matKey, shifts: (shift && matShiftable) ? [{ cs: shift, reason: "manual" }] : [], roll: cappedTotal, karma: 0 })
            : null;
          const color = check ? check.color : game.msh.rollUniversalTable(effectiveRank, cappedTotal);
          const itemBreaks = check ? check.broken : String(color).toLowerCase() === "white";

          // Result card styling
          const resultBg = itemBreaks ? '#F44336' : '#4CAF50';
          const resultText = itemBreaks
            ? 'ITEM DAMAGED/BROKEN/ACTIVATED!'
            : '✓ ITEM INTACT';

          const outcomeText = itemBreaks
            ? 'The item is damaged, broken, or goes off in your hands!'
            : 'The item remains intact. You may use it or move up to half your speed.';

          // Post result card
          const content = `
            <div style="background-color:#f5f5f0; border:1px solid #c0c0c0; border-radius:3px; margin-bottom:5px;">
              <div style="padding:5px 10px; border-bottom:1px solid #c0c0c0; font-size:1.1em; color:#8b0000;">
                <strong>${actor?.name ?? 'Character'} — Grabbing Break Check</strong>
              </div>
              <div style="padding:5px 10px; font-size:0.9em;">
                <div>Item: ${itemName}</div>
                <div>Item Material: ${selectedMaterial}${shift ? ` — Shift ${shift} → ${effectiveRank}` : ""}</div>

                <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
                <div>Result Color: ${String(color).toUpperCase()}</div>
              </div>
              <div style="text-align:center; padding:8px; margin:5px; font-weight:bold; font-size:1.05em; border-radius:3px;
                          background-color:${resultBg}; color:white;">
                ${resultText}
              </div>
              <div style="padding:6px 10px; margin:6px 10px; background:#f5f5f5; border:1px solid #ddd; border-radius:3px;">
                <div style="font-size:0.9em;">${outcomeText}</div>
              </div>
              <div>Roll on the item's material column — any colour keeps it intact.</div>
            </div>
          `;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    id: "grabbing-break-dialog" // Added a unique ID for the dialog
  });
}