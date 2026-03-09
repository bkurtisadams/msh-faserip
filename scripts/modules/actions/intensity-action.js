// intensity-action.js v1.0.0 - 2026-03-08
// Generic "Intensity" action: rolls attacker's item Intensity Rank on the Universal Table.
// Targets must make Endurance FEAT vs the Intensity to resist the effect.
import { BaseAction } from "./base-action.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { debugLog } from "./action-utils.js";

export class IntensityAction extends BaseAction {

  static actionType = "intensity";
  static label = "Intensity Attack";

  static async roll({ actor, abilityName = "endurance", opts = {} } = {}) {
    const item = opts.item || opts.sourceItem || opts.equipment;
    if (!item) return ui.notifications.warn("No equipment item for Intensity roll.");

    const intensityRank = item.system?.intensityRank;
    if (!intensityRank) return ui.notifications.warn(`${item.name} has no Intensity Rank set.`);

    const intensityDesc = item.system?.intensityDescription || "";
    const RANKS = [
      "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable",
      "Incredible","Amazing","Monstrous","Unearthly","Shift X","Shift Y","Shift Z",
      "Class 1000","Class 3000","Class 5000","Beyond"
    ];
    const RANK_VALUES = {
      "Shift-0":0,"Feeble":2,"Poor":4,"Typical":6,"Good":10,"Excellent":20,
      "Remarkable":30,"Incredible":40,"Amazing":50,"Monstrous":75,"Unearthly":100,
      "Shift X":150,"Shift Y":200,"Shift Z":500,
      "Class 1000":1000,"Class 3000":3000,"Class 5000":5000,"Beyond":Infinity
    };

    // Build dialog
    const content = `
      <div style="min-width:340px;">
        <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <img src="${item.img}" width="32" height="32" style="border:0;"/>
          <div>
            <div style="font-weight:bold;font-size:1.1em;">${item.name}</div>
            <div style="font-size:0.85em;color:#666;">Intensity: <b>${intensityRank}</b></div>
          </div>
        </div>
        ${intensityDesc ? `<div style="background:#f5f0e8;border:1px solid #c0a070;border-radius:3px;padding:6px;margin-bottom:8px;font-size:0.85em;">${intensityDesc}</div>` : ""}
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Column Shift:</label>
          <input type="number" name="shift" value="0" style="width:60px;"/>
          <span style="color:#666;font-size:.85em;">(+ right, - left)</span>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Karma Spent:</label>
          <input type="number" name="karma" value="0" min="0" style="width:60px;"/>
        </div>
        <div style="font-size:0.8em;color:#888;margin-top:6px;">
          Targets resist with Endurance FEAT vs ${intensityRank} Intensity.
        </div>
      </div>`;

    return new Promise(resolve => {
      new Dialog({
        title: `${item.name} — Intensity Attack`,
        content,
        buttons: {
          roll: {
            label: '<i class="fas fa-radiation"></i> Roll Intensity',
            callback: async (html) => {
              const shift = Number(html.find('[name="shift"]').val()) || 0;
              const karma = Math.max(0, Number(html.find('[name="karma"]').val()) || 0);

              // Apply column shift
              const baseIdx = Math.max(0, RANKS.indexOf(intensityRank));
              const effectiveIdx = Math.max(0, Math.min(RANKS.length - 1, baseIdx + shift));
              const effectiveRank = RANKS[effectiveIdx];

              // Roll
              const r = await (new Roll("1d100")).evaluate({ async: true });
              let total = r.total;
              let karmaUsed = 0;
              if (karma > 0) {
                const cap = Math.min(100, total + karma);
                karmaUsed = cap - total;
                total = cap;
              }

              // Deduct karma
              if (karmaUsed > 0) {
                const history = foundry.utils.deepClone(actor.system.karma?.history || []);
                history.push({
                  timestamp: new Date().toISOString(),
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -karmaUsed,
                  type: "Die Roll",
                  description: `Spent on ${item.name} (Intensity)`
                });
                await actor.update({ "system.karma.history": history });
              }

              const color = (game.msh?.rollUniversalTable ?? rollUniversalTable)(effectiveRank, Math.min(100, total));
              const colorLower = (color || "white").toLowerCase();

              // Build result text
              const resultMap = {
                white: "No Effect",
                green: "Effect (partial)",
                yellow: "Full Effect",
                red: "Maximum Effect"
              };
              const resultText = resultMap[colorLower] || color;

              // Build chat card
              const shiftLine = shift !== 0 
                ? `<div><b>Column Shift:</b> ${shift > 0 ? "+" : ""}${shift}CS → ${effectiveRank}</div>` 
                : "";
              const karmaLine = karmaUsed > 0 
                ? `<div><b>Karma:</b> +${karmaUsed} (${r.total} → ${total})</div>` 
                : "";
              const descLine = intensityDesc 
                ? `<div style="font-style:italic;margin-top:4px;color:#555;">${intensityDesc}</div>` 
                : "";

              const colorStyles = {
                white: "background:#f0f0f0;color:#333;border:1px solid #ccc;",
                green: "background:#4CAF50;color:#fff;",
                yellow: "background:#FFC107;color:#333;",
                red: "background:#F44336;color:#fff;"
              };

              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                roll: r,
                content: `
                  <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                    <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:#8b0000;">INTENSITY</strong>
                      <span style="color:#666;font-weight:normal;font-size:.85em;">${intensityRank}</span>
                    </div>
                    <div style="padding:4px 10px;font-size:.95em;"><strong>${actor.name}</strong> uses <strong>${item.name}</strong></div>
                    <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
                      ${descLine}
                      <div style="margin-top:3px;">Roll: <span style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;">${r.total}</span>${karmaUsed > 0 ? ` + ${karmaUsed} karma = ${total}` : ""}</div>
                      ${shiftLine}
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
                        <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;${colorStyles[colorLower] || colorStyles.white}">
                          ${colorLower.toUpperCase()} — ${resultText.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div style="padding:4px 10px 6px;font-size:.8em;color:#888;">
                      Targets resist: Endurance FEAT vs ${effectiveRank} Intensity
                    </div>
                  </div>`
              });

              resolve();
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
  }
}