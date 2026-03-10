// intensity-action.js v3.0.0 - 2026-03-10
// v3.0.0: Apply effects on failed Endurance FEAT — reads intensityEffect field,
//         rolls 1d10 duration, calls effect-engine wrappers on target.
// v2.0.0: Correct FASERIP logic — TARGET rolls Endurance FEAT vs item's Intensity Rank.
import { BaseAction } from "./base-action.js";
import {
  getTargetData,
  buildResultBadge,
  buildRollDisplay,
  getAbilityInfo
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

// White = fail (affected), Green+ = resist
function intensityResult(colorLower) {
  switch (colorLower) {
    case "white": return "Affected";
    case "green": return "Resists";
    case "yellow": return "Resists";
    case "red":   return "Fully Resists";
    default:      return "Unknown";
  }
}

const EFFECT_LABELS = {
  blinded: "Blinded",
  stunned: "Stunned",
  unconscious: "Unconscious",
  incapacitated: "Incapacitated",
  immobilized: "Immobilized",
  custom: "Affected"
};

export class IntensityAction extends BaseAction {

  async execute() {
    const actor = this.actor;
    const item = this.opts?.item || this.opts?.sourceItem || this.opts?.equipment
      || (this.opts?.itemId ? actor.items.get(this.opts.itemId) : null);

    if (!item) return ui.notifications.warn("No equipment item for Intensity roll.");

    const intensityRank = item.system?.intensityRank;
    if (!intensityRank) return ui.notifications.warn(`${item.name} has no Intensity Rank set.`);

    const intensityDesc = item.system?.intensityDescription || "";
    const intensityEffect = item.system?.intensityEffect || "";
    const { targets } = getTargetData();

    const targetList = targets.length
      ? targets.map(t => {
          const endRank = t.actor?.system?.abilities?.endurance?.rank || "Typical";
          return `<div style="margin:2px 0;"><strong>${t.name}</strong> — Endurance: ${endRank}</div>`;
        }).join("")
      : `<div style="color:#d32f2f;font-style:italic;">No targets selected. Select target tokens first.</div>`;

    const effectLabel = EFFECT_LABELS[intensityEffect] || "GM adjudicate";

    const content = `
      <div style="min-width:340px;">
        <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <img src="${item.img}" width="32" height="32" style="border:0;"/>
          <div>
            <div style="font-weight:bold;font-size:1.1em;">${item.name}</div>
            <div style="font-size:0.85em;color:#666;">Intensity: <b>${intensityRank}</b> — Effect: <b>${effectLabel}</b></div>
          </div>
        </div>
        ${intensityDesc ? `<div style="background:#f5f0e8;border:1px solid #c0a070;border-radius:3px;padding:6px;margin-bottom:8px;font-size:0.85em;">${intensityDesc}</div>` : ""}
        <div style="margin-bottom:6px;font-weight:bold;font-size:0.9em;">Targets (Endurance FEAT to resist):</div>
        <div style="margin-bottom:8px;padding:4px 8px;background:#f9f9f9;border:1px solid #ddd;border-radius:3px;font-size:0.9em;">
          ${targetList}
        </div>
        <div style="font-size:0.8em;color:#888;">
          Each target rolls Endurance vs ${intensityRank} Intensity.<br>
          White = ${effectLabel}. Green+ = Resists.
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
              await this._resolveTargets(actor, item, intensityRank, intensityDesc, intensityEffect, targets);
              resolve();
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
  }

  async _resolveTargets(actor, item, intensityRank, intensityDesc, intensityEffect, targets) {
    const resultRows = [];

    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;

      const endInfo = getAbilityInfo(targetActor, "endurance");
      const endRank = endInfo.rank || "Typical";

      // Roll target's Endurance FEAT
      const r = await (new Roll("1d100")).evaluate({ async: true });
      const total = r.total;
      const color = (game.msh?.rollUniversalTable ?? rollUniversalTable)(endRank, Math.min(100, total));
      const colorLower = (color || "white").toLowerCase();
      const effectLabel = intensityResult(colorLower);

      const rollDisplay = buildRollDisplay(r);
      const badge = buildResultBadge(colorLower, effectLabel);

      // On White (fail), apply the effect
      let appliedLine = "";
      if (colorLower === "white" && intensityEffect) {
        const durationRoll = await (new Roll("1d10")).evaluate({ async: true });
        const durationRounds = durationRoll.total;
        appliedLine = await this._applyIntensityEffect(
          targetActor, intensityEffect, durationRounds, actor.uuid, intensityDesc
        );
        if (appliedLine) {
          appliedLine = `<div style="color:#d32f2f;font-weight:bold;font-size:.85em;margin-top:2px;">\u2192 ${appliedLine} (1d10 = ${durationRounds})</div>`;
        }
      } else if (colorLower === "white" && !intensityEffect) {
        appliedLine = `<div style="color:#d32f2f;font-style:italic;font-size:.85em;margin-top:2px;">\u2192 Affected (GM adjudicate)</div>`;
      }

      resultRows.push({ targetName: targetToken.name, endRank, rollDisplay, badge, appliedLine });
    }

    // Build chat card
    const descLine = intensityDesc
      ? `<div style="font-style:italic;color:#555;margin-bottom:4px;">${intensityDesc}</div>` : "";

    const effectTag = intensityEffect
      ? ` \u2014 <span style="color:#d32f2f;">${EFFECT_LABELS[intensityEffect] || "Custom"}</span>` : "";

    const targetResultsHtml = resultRows.map(row =>
      `<div style="padding:4px 10px;font-size:.9em;border-top:1px solid #e0e0e0;">
        <div style="margin-bottom:2px;"><strong>${row.targetName}</strong> \u2014 Endurance: ${row.endRank}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Roll: ${row.rollDisplay}</span>
          ${row.badge}
        </div>
        ${row.appliedLine}
      </div>`
    ).join("");

    const card = `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:#8b0000;">INTENSITY</strong>
        <span style="color:#666;font-weight:normal;font-size:.85em;">vs ${intensityRank}${effectTag}</span>
      </div>
      <div style="padding:4px 10px;font-size:.95em;">
        <strong>${actor.name}</strong> uses <strong>${item.name}</strong>
      </div>
      <div style="padding:2px 10px 4px;font-size:.9em;color:#555;">
        ${descLine}
        <div>Intensity: <strong>${intensityRank}</strong> \u2014 Targets must make Endurance FEAT to resist</div>
      </div>
      ${targetResultsHtml}
    </div>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: card
    });
  }

  /** Apply the configured effect to the target, return a summary string */
  async _applyIntensityEffect(targetActor, effectType, rounds, originUuid, desc) {
    const {
      applyBlinded,
      applyStun,
      applyUnconscious,
      applyEffect
    } = await import("../effects/effect-engine.js");

    const AE_MODE = {
      MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5
    };

    try {
      switch (effectType) {
        case "blinded":
          await applyBlinded(targetActor, { rounds, originUuid });
          return `Blinded for ${rounds} turn${rounds !== 1 ? "s" : ""}`;

        case "stunned":
          await applyStun(targetActor, { rounds, originUuid });
          return `Stunned for ${rounds} turn${rounds !== 1 ? "s" : ""}`;

        case "unconscious":
          await applyUnconscious(targetActor, { rounds, originUuid });
          return `Unconscious for ${rounds} turn${rounds !== 1 ? "s" : ""}`;

        case "incapacitated":
          await applyEffect(targetActor, {
            name: "Incapacitated",
            img: "icons/svg/paralysis.svg",
            rounds,
            originUuid,
            changes: [
              { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
              { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
              { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-2", priority: 20 },
              { key: "system.combatMods.movementMult", mode: AE_MODE.MULTIPLY, value: "0.5", priority: 20 }
            ],
            flags: {
              effectType: "incapacitated",
              status: { isIncapacitated: true },
              intensitySource: desc || "Intensity"
            },
            statuses: ["incapacitated"]
          });
          return `Incapacitated for ${rounds} turn${rounds !== 1 ? "s" : ""}`;

        case "immobilized":
          await applyEffect(targetActor, {
            name: "Immobilized",
            img: "icons/svg/frozen.svg",
            rounds,
            originUuid,
            changes: [
              { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
              { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
              { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
              { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-2", priority: 20 }
            ],
            flags: {
              effectType: "immobilized",
              status: { isImmobilized: true },
              intensitySource: desc || "Intensity"
            },
            statuses: ["immobilized"]
          });
          return `Immobilized for ${rounds} turn${rounds !== 1 ? "s" : ""}`;

        case "custom":
          await applyEffect(targetActor, {
            name: desc || "Intensity Effect",
            img: "icons/svg/hazard.svg",
            rounds,
            originUuid,
            changes: [],
            flags: {
              effectType: "intensityCustom",
              status: { isAffected: true },
              intensitySource: desc || "Intensity"
            },
            statuses: ["affected"]
          });
          return `${desc || "Affected"} for ${rounds} turn${rounds !== 1 ? "s" : ""}`;

        default:
          return "";
      }
    } catch (err) {
      console.error("[FASERIP ERROR] _applyIntensityEffect failed:", err);
      return "Effect failed (see console)";
    }
  }
}