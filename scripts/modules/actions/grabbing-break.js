// scripts/modules/actions/grabbing-break.js

/**
 * Grabbing Break Check
 *
 * When a RED (Break) result is rolled on a Grabbing action, this check determines
 * if the grabbed item is broken/damaged/activated.
 *
 * Rule: Roll Strength vs Item Material
 * - White result: Item is damaged, broken, or goes off
 * - Any color (Green/Yellow/Red): Item intact - may use it or move up to half speed
 */
import { rollUniversalTable } from "../dice/universal-table.js";
export function openGrabbingBreakDialog({ itemMaterial = "Excellent", itemName = "Item", actor = null }) {
  // Close any existing instance (same id)
  const existing = Object.values(ui.windows).find(w => w.id === "grabbing-break-dialog");
  if (existing) existing.close({ force: true });

  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  const wielderStr = actor?.system?.abilities?.strength?.rank ?? 'Typical';
  const wielderStrValue = actor?.system?.abilities?.strength?.value ?? 6;

  const dlg = new Dialog({
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
          <label style="display:inline-block; width:130px;">Your Strength:</label>
          <input type="text" value="${wielderStr}" readonly style="width:160px;">
          <span style="margin-left:6px;">(${wielderStrValue})</span>
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
          <strong>Grabbing Break Check (Intensity FEAT):</strong> Roll your <em>Strength</em> against the item's <em>Material</em>.
          <ul style="margin:4px 0 0 20px; padding:0;">
            <li><strong>If STR &gt; Material:</strong> GREEN succeeds (item breaks/activates).</li>
            <li><strong>If STR = Material:</strong> YELLOW succeeds.</li>
            <li><strong>If STR &lt; Material:</strong> RED succeeds.</li>
          </ul>
          <div style="margin-top:4px;">Failure means the item remains intact.</div>
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

          const effectiveRank = shiftRank(wielderStr, shift);

          // Roll
          const roll = await (new Roll("1d100")).evaluate({ async: true });
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor?.name ?? 'Character'} — Grabbing Break Check`,
            rollMode: game.settings.get("core", "rollMode")
          });

          const { cappedTotal, totalKarmaUsed } =
            await rollWithKarmaAndHistory(actor, "Grabbing Break Check", karma, roll);

          // Determine result on Universal Table
          const COLORS = ["white", "green", "yellow", "red"];
          const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
          const colorLower = String(color || "").toLowerCase();

          // Determine required color from STR vs Material (Intensity)
          const sIdx = RANKS.indexOf(wielderStr);
          const mIdx = RANKS.indexOf(selectedMaterial);

          // Default to red if we can't find ranks
          let requiredColor = "red";
          if (sIdx > -1 && mIdx > -1) {
            if (sIdx > mIdx) requiredColor = "green";
            else if (sIdx === mIdx) requiredColor = "yellow";
            else requiredColor = "red";
          }

          // Success if rolled color meets or exceeds the required threshold
          const meetsThreshold =
            COLORS.indexOf(colorLower) >= COLORS.indexOf(requiredColor);

          // Success => item breaks/activates; failure => intact
          const itemBreaks = meetsThreshold;

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
                <div>Your Strength: ${wielderStr} (${wielderStrValue})${shift ? ` — Shift ${shift} → ${effectiveRank}` : ""}</div>
                <div>Item Material: ${selectedMaterial}</div>

                <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
                <div>Result Color: ${color.toUpperCase()}</div>
              </div>
              <div style="text-align:center; padding:8px; margin:5px; font-weight:bold; font-size:1.05em; border-radius:3px;
                          background-color:${resultBg}; color:white;">
                ${resultText}
              </div>
              <div style="padding:6px 10px; margin:6px 10px; background:#f5f5f5; border:1px solid #ddd; border-radius:3px;">
                <div style="font-size:0.9em;">${outcomeText}</div>
              </div>
              <div>Required Success: ${requiredColor.toUpperCase()} (from STR vs Material)</div>
            </div>
          `;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });
          dlg.close();
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    id: "grabbing-break-dialog" // Added a unique ID for the dialog
  });
  dlg.render(true);
}