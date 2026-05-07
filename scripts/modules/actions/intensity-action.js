// intensity-action.js v4.1.1 - 2026-05-06
// v4.1.1: Split the Use button's label and icon (V14 DialogV2 escapes raw HTML in label,
//         which rendered the <i class="fas fa-radiation"></i> as literal text). Use the
//         shim's separate icon field instead.
// v4.1.0: Per-attack-mode Resistance FEAT support. resolveIntensityFields() accepts an
//         optional attackMode argument and returns its resist* fields when set, taking
//         priority over item-level intensityRank and the power save block. Adds 2d10
//         and 5d10 duration modes for Gravity-Enhancer-style 2-20 / 5-50 turn effects.
//         IntensityAction.execute() reads opts.attackMode (passed by the equipment action
//         hub when chaining a resist FEAT after a multi-mode weapon's damage attack).
// v4.0.0: Support power items (save.intensity/onFail schema) alongside equipment items.
//         Reads save.ability for target FEAT, handles duration modes (1d10, rank, fixed, scene, escape).
// v3.0.0: Apply effects on failed Endurance FEAT — reads intensityEffect field,
//         rolls 1d10 duration, calls effect-engine wrappers on target.
// v2.0.0: Correct FASERIP logic — TARGET rolls Endurance FEAT vs item's Intensity Rank.
import { BaseAction } from "./base-action.js";
import {
  getTargetData,
  buildResultBadge,
  buildRollDisplay,
  getAbilityInfo,
  RANKS
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

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
  deafened: "Deafened",
  stunned: "Stunned",
  unconscious: "Unconscious",
  incapacitated: "Incapacitated",
  immobilized: "Immobilized",
  paralyzed: "Paralyzed",
  nullified: "Nullified",
  slammed: "Slammed",
  grabbed: "Grabbed",
  weakened: "Weakened",
  custom: "Affected"
};

/**
 * Normalize intensity fields from either equipment or power items.
 * Equipment: system.intensityRank, system.intensityEffect, system.intensityDescription
 * Per-mode: attackMode.resistRank/resistAbility/resistEffect/resistDuration/resistDescription
 *           (highest priority — caller passes the active attack mode)
 * Power: system.save.intensity (power-rank|fixed-rank|none), system.save.onFail.effect, etc.
 */
function resolveIntensityFields(item, attackMode = null) {
  const sys = item.system || {};

  // Per-attack-mode override (multi-mode weapons with chained Resistance FEAT)
  if (attackMode && attackMode.resistRank) {
    return {
      rank: attackMode.resistRank,
      effect: attackMode.resistEffect || "",
      description: attackMode.resistDescription || "",
      saveAbility: attackMode.resistAbility || "endurance",
      durationMode: attackMode.resistDuration || "1d10",
      fixedRounds: 0
    };
  }

  // Equipment path — explicit intensityRank field
  if (sys.intensityRank) {
    return {
      rank: sys.intensityRank,
      effect: sys.intensityEffect || "",
      description: sys.intensityDescription || "",
      saveAbility: "endurance",
      durationMode: "1d10",
      fixedRounds: 0
    };
  }

  // Power path — save block (requires requiresSave checkbox)
  const save = sys.save || {};
  if (sys.requiresSave && save.intensity && save.intensity !== "none") {
    const rank = save.intensity === "power-rank"
      ? (sys.rank || sys.powerRank || "Typical")
      : (save.fixedRank || "Typical");

    const onFail = save.onFail || {};
    return {
      rank,
      effect: onFail.effect || "",
      description: onFail.notes || "",
      saveAbility: save.ability || "endurance",
      durationMode: onFail.duration || "1-10",
      fixedRounds: Number(onFail.rounds) || 0
    };
  }

  return null;
}

/**
 * Resolve duration in rounds based on mode.
 */
async function resolveDuration(mode, fixedRounds, powerRank) {
  switch (mode) {
    case "1-10":
    case "1d10": {
      const r = await (new Roll("1d10")).evaluate({ async: true });
      return { rounds: r.total, label: `1d10 = ${r.total}` };
    }
    case "2d10": {
      const r = await (new Roll("2d10")).evaluate({ async: true });
      return { rounds: r.total, label: `2d10 = ${r.total}` };
    }
    case "5d10": {
      const r = await (new Roll("5d10")).evaluate({ async: true });
      return { rounds: r.total, label: `5d10 = ${r.total}` };
    }
    case "rank": {
      const rv = RANKS[powerRank] || 6;
      return { rounds: rv, label: `${powerRank} rank (${rv})` };
    }
    case "rounds": {
      return { rounds: fixedRounds || 1, label: `${fixedRounds || 1} fixed` };
    }
    case "scene": {
      return { rounds: 999, label: "scene" };
    }
    case "escape": {
      return { rounds: 999, label: "until escape" };
    }
    default: {
      const r = await (new Roll("1d10")).evaluate({ async: true });
      return { rounds: r.total, label: `1d10 = ${r.total}` };
    }
  }
}

export class IntensityAction extends BaseAction {

  async execute() {
    const actor = this.actor;
    const item = this.opts?.item || this.opts?.sourceItem || this.opts?.equipment
      || (this.opts?.itemId ? actor.items.get(this.opts.itemId) : null);

    if (!item) return ui.notifications.warn("No item for Intensity roll.");

    const attackMode = this.opts?.attackMode || null;
    const fields = resolveIntensityFields(item, attackMode);
    if (!fields) return ui.notifications.warn(`${item.name} has no Intensity/Save configured.`);

    const { rank: intensityRank, effect: intensityEffect, description: intensityDesc,
            saveAbility } = fields;

    const saveAbilityLabel = saveAbility.charAt(0).toUpperCase() + saveAbility.slice(1);
    const { targets } = getTargetData();

    const targetList = targets.length
      ? targets.map(t => {
          const abilRank = t.actor?.system?.abilities?.[saveAbility]?.rank || "Typical";
          return `<div style="margin:2px 0;"><strong>${t.name}</strong> — ${saveAbilityLabel}: ${abilRank}</div>`;
        }).join("")
      : `<div style="color:#d32f2f;font-style:italic;">No targets selected. Select target tokens first.</div>`;

    const effectLabel = EFFECT_LABELS[intensityEffect] || "GM adjudicate";
    const isPower = item.type === "power";

    const content = `
      <div style="min-width:340px;">
        <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <img src="${item.img}" width="32" height="32" style="border:0;"/>
          <div>
            <div style="font-weight:bold;font-size:1.1em;">${item.name}${isPower ? ' <span style="font-size:.75em;color:#666;">(Power)</span>' : ''}</div>
            <div style="font-size:0.85em;color:#666;">Intensity: <b>${intensityRank}</b> — Effect: <b>${effectLabel}</b></div>
          </div>
        </div>
        ${intensityDesc ? `<div style="background:#f5f0e8;border:1px solid #c0a070;border-radius:3px;padding:6px;margin-bottom:8px;font-size:0.85em;">${intensityDesc}</div>` : ""}
        <div style="margin-bottom:6px;font-weight:bold;font-size:0.9em;">Targets (${saveAbilityLabel} FEAT to resist):</div>
        <div style="margin-bottom:8px;padding:4px 8px;background:#f9f9f9;border:1px solid #ddd;border-radius:3px;font-size:0.9em;">
          ${targetList}
        </div>
        <div style="font-size:0.8em;color:#888;">
          Each target rolls ${saveAbilityLabel} vs ${intensityRank} Intensity.<br>
          White = ${effectLabel}. Green+ = Resists.
        </div>
      </div>`;

    return new Promise(resolve => {
      showFaseripButtonDialog({
        title: `${item.name} — Intensity (${intensityRank})`,
        content,
        buttons: {
          roll: {
            label: 'Use',
            icon: 'fas fa-radiation',
            callback: async () => {
              if (!targets.length) {
                ui.notifications.warn("No targets selected.");
                return resolve(null);
              }
              await this._resolveTargets(actor, item, fields, targets);
              resolve();
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      });
    });
  }

  async _resolveTargets(actor, item, fields, targets) {
    const { rank: intensityRank, effect: intensityEffect, description: intensityDesc,
            saveAbility, durationMode, fixedRounds } = fields;
    const saveAbilityLabel = saveAbility.charAt(0).toUpperCase() + saveAbility.slice(1);
    const resultRows = [];

    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;

      const endInfo = getAbilityInfo(targetActor, saveAbility);
      const endRank = endInfo.rank || "Typical";

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
        const dur = await resolveDuration(durationMode, fixedRounds, intensityRank);
        appliedLine = await this._applyIntensityEffect(
          targetActor, intensityEffect, dur.rounds, actor.uuid, intensityDesc
        );
        if (appliedLine) {
          appliedLine = `<div style="color:#d32f2f;font-weight:bold;font-size:.85em;margin-top:2px;">\u2192 ${appliedLine} (${dur.label})</div>`;
        }
      } else if (colorLower === "white" && !intensityEffect) {
        appliedLine = `<div style="color:#d32f2f;font-style:italic;font-size:.85em;margin-top:2px;">\u2192 Affected (GM adjudicate)</div>`;
      }

      resultRows.push({ targetName: targetToken.name, endRank, rollDisplay, badge, appliedLine, saveAbilityLabel });
    }

    // Build chat card
    const descLine = intensityDesc
      ? `<div style="font-style:italic;color:#555;margin-bottom:4px;">${intensityDesc}</div>` : "";

    const effectTag = intensityEffect
      ? ` \u2014 <span style="color:#d32f2f;">${EFFECT_LABELS[intensityEffect] || "Custom"}</span>` : "";

    const targetResultsHtml = resultRows.map(row =>
      `<div style="padding:4px 10px;font-size:.9em;border-top:1px solid #e0e0e0;">
        <div style="margin-bottom:2px;"><strong>${row.targetName}</strong> \u2014 ${row.saveAbilityLabel}: ${row.endRank}</div>
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
        <div>Intensity: <strong>${intensityRank}</strong> \u2014 Targets must make ${saveAbilityLabel} FEAT to resist</div>
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
      applyDeafened,
      applyStun,
      applyUnconscious,
      applyParalyzed,
      applyWeakened,
      applyEffect
    } = await import("../effects/effect-engine.js");

    const durationLabel = rounds === 999 ? "scene/escape" : `${rounds} turn${rounds !== 1 ? "s" : ""}`;

    try {
      switch (effectType) {
        case "blinded":
          await applyBlinded(targetActor, { rounds, originUuid });
          return `Blinded for ${durationLabel}`;

        case "deafened":
          await applyDeafened(targetActor, { rounds, originUuid });
          return `Deafened for ${durationLabel}`;

        case "stunned":
          await applyStun(targetActor, { rounds, originUuid });
          return `Stunned for ${durationLabel}`;

        case "unconscious":
          await applyUnconscious(targetActor, { rounds, originUuid });
          return `Unconscious for ${durationLabel}`;

        case "incapacitated":
          await applyEffect(targetActor, {
            name: "Incapacitated",
            img: "icons/svg/paralysis.svg",
            rounds, originUuid,
            changes: [
              { key: "system.combatMods.attackShift", mode: "add", value: "-4", priority: 20 },
              { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 },
              { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-2", priority: 20 },
              { key: "system.combatMods.movementMult", mode: "multiply", value: "0.5", priority: 20 }
            ],
            flags: { effectType: "incapacitated", status: { isIncapacitated: true }, intensitySource: desc || "Intensity" },
            statuses: ["incapacitated"]
          });
          return `Incapacitated for ${durationLabel}`;

        case "immobilized":
          await applyEffect(targetActor, {
            name: "Immobilized",
            img: "icons/svg/frozen.svg",
            rounds, originUuid,
            changes: [
              { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
              { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 },
              { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 },
              { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-2", priority: 20 }
            ],
            flags: { effectType: "immobilized", status: { isImmobilized: true }, intensitySource: desc || "Intensity" },
            statuses: ["immobilized"]
          });
          return `Immobilized for ${durationLabel}`;

        case "paralyzed":
          await applyParalyzed(targetActor, { rounds, originUuid });
          return `Paralyzed for ${durationLabel}`;

        case "nullified":
          await applyEffect(targetActor, {
            name: "Nullified",
            img: "icons/svg/cancel.svg",
            rounds, originUuid,
            changes: [],
            flags: { effectType: "nullified", status: { isNullified: true }, intensitySource: desc || "Intensity" },
            statuses: ["nullified"]
          });
          return `Nullified for ${durationLabel}`;

        case "slammed":
          await applyEffect(targetActor, {
            name: "Slammed",
            img: "icons/svg/falling.svg",
            rounds: 1, originUuid,
            changes: [
              { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 }
            ],
            flags: { effectType: "slammed", status: { isSlammed: true }, intensitySource: desc || "Intensity" },
            statuses: ["prone"]
          });
          return "Slammed (knocked down)";

        case "grabbed":
          await applyEffect(targetActor, {
            name: "Grabbed",
            img: "icons/svg/net.svg",
            rounds, originUuid,
            changes: [
              { key: "system.combatMods.attackShift", mode: "add", value: "-2", priority: 20 },
              { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 }
            ],
            flags: { effectType: "grabbed", status: { isGrabbed: true }, intensitySource: desc || "Intensity" },
            statuses: ["restrained"]
          });
          return `Grabbed for ${durationLabel}`;

        case "weakened":
          await applyWeakened(targetActor, { rounds, originUuid });
          return `Weakened for ${durationLabel}`;

        case "custom":
          await applyEffect(targetActor, {
            name: desc || "Intensity Effect",
            img: "icons/svg/hazard.svg",
            rounds, originUuid,
            changes: [],
            flags: { effectType: "intensityCustom", status: { isAffected: true }, intensitySource: desc || "Intensity" },
            statuses: ["affected"]
          });
          return `${desc || "Affected"} for ${durationLabel}`;

        default:
          return "";
      }
    } catch (err) {
      console.error("[FASERIP ERROR] _applyIntensityEffect failed:", err);
      return "Effect failed (see console)";
    }
  }
}