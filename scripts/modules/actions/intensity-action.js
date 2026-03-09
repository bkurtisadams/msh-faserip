// intensity-action.js v2.0.0 - 2026-03-08
// v2.0.0: Correct FASERIP logic — TARGET rolls Endurance FEAT vs item's Intensity Rank.
//         Attacker does NOT roll. Uses standard card builder utilities.
import { BaseAction } from "./base-action.js";
import {
  getTargetData,
  buildCardShell,
  buildActorTargetHtml,
  buildAbilitySection,
  buildResultBadge,
  buildRollDisplay,
  buildContentBox,
  getAbilityInfo
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

const RANKS = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable",
  "Incredible","Amazing","Monstrous","Unearthly","Shift X","Shift Y","Shift Z",
  "Class 1000","Class 3000","Class 5000","Beyond"
];

// What color result means the target resists
// White = fail (affected), Green+ = resist
function intensityResult(colorLower) {
  switch (colorLower) {
    case "white": return "Affected";
    case "green": return "Resists";
    case "yellow": return "Resists";
    case "red": return "Fully Resists";
    default: return "Unknown";
  }
}

export class IntensityAction extends BaseAction {

  async execute() {
    const actor = this.actor;
    const item = this.opts?.item || this.opts?.sourceItem || this.opts?.equipment
      || (this.opts?.itemId ? actor.items.get(this.opts.itemId) : null);

    if (!item) return ui.notifications.warn("No equipment item for Intensity roll.");

    const intensityRank = item.system?.intensityRank;
    if (!intensityRank) return ui.notifications.warn(`${item.name} has no Intensity Rank set.`);

    const intensityDesc = item.system?.intensityDescription || "";
    const { targets, targetDisplay } = getTargetData();

    // Build confirmation dialog
    const targetList = targets.length
      ? targets.map(t => {
          const endRank = t.actor?.system?.abilities?.endurance?.rank || "Typical";
          return `<div style="margin:2px 0;"><strong>${t.name}</strong> — Endurance: ${endRank}</div>`;
        }).join("")
      : `<div style="color:#d32f2f;font-style:italic;">No targets selected. Select target tokens first.</div>`;

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
        <div style="margin-bottom:6px;font-weight:bold;font-size:0.9em;">Targets (Endurance FEAT to resist):</div>
        <div style="margin-bottom:8px;padding:4px 8px;background:#f9f9f9;border:1px solid #ddd;border-radius:3px;font-size:0.9em;">
          ${targetList}
        </div>
        <div style="font-size:0.8em;color:#888;">
          Each target rolls Endurance vs ${intensityRank} Intensity.<br>
          White = Affected. Green+ = Resists.
        </div>
      </div>`;

    return new Promise(resolve => {
      new Dialog({
        title: `${item.name} — Intensity (${intensityRank})`,
        content,
        buttons: {
          roll: {
            label: '<i class="fas fa-radiation"></i> Use',
            callback: async () => {
              if (!targets.length) {
                ui.notifications.warn("No targets selected.");
                return resolve(null);
              }
              await this._resolveTargets(actor, item, intensityRank, intensityDesc, targets);
              resolve();
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
  }

  async _resolveTargets(actor, item, intensityRank, intensityDesc, targets) {
    const resultRows = [];

    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;

      const endInfo = getAbilityInfo(targetActor, "endurance");
      const endRank = endInfo.rank || "Typical";

      // Roll target's Endurance
      const r = await (new Roll("1d100")).evaluate({ async: true });
      const total = r.total;

      const color = (game.msh?.rollUniversalTable ?? rollUniversalTable)(endRank, Math.min(100, total));
      const colorLower = (color || "white").toLowerCase();
      const effectLabel = intensityResult(colorLower);

      const rollDisplay = buildRollDisplay(r);
      const badge = buildResultBadge(colorLower, effectLabel);

      resultRows.push({
        targetName: targetToken.name,
        endRank,
        roll: r,
        total,
        colorLower,
        effectLabel,
        rollDisplay,
        badge
      });
    }

    // Build chat card with all target results
    const descLine = intensityDesc
      ? `<div style="font-style:italic;color:#555;margin-bottom:4px;">${intensityDesc}</div>`
      : "";

    const targetResultsHtml = resultRows.map(row => {
      return `<div style="padding:4px 10px;font-size:.9em;border-top:1px solid #e0e0e0;">
        <div style="margin-bottom:2px;"><strong>${row.targetName}</strong> — Endurance: ${row.endRank}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Roll: ${row.rollDisplay}</span>
          ${row.badge}
        </div>
      </div>`;
    }).join("");

    const card = `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:#8b0000;">INTENSITY</strong>
        <span style="color:#666;font-weight:normal;font-size:.85em;">vs ${intensityRank}</span>
      </div>
      <div style="padding:4px 10px;font-size:.95em;">
        <strong>${actor.name}</strong> uses <strong>${item.name}</strong>
      </div>
      <div style="padding:2px 10px 4px;font-size:.9em;color:#555;">
        ${descLine}
        <div>Intensity: <strong>${intensityRank}</strong> — Targets must make Endurance FEAT to resist</div>
      </div>
      ${targetResultsHtml}
    </div>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: card
    });
  }
}