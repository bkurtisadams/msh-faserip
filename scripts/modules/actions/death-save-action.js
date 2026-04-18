// scripts/modules/actions/death-save-action.js v1.9.6 - 2026-03-20
// v1.9.6: Pass mshReplacing option when deleting existing unconscious effects in _createStunnedEffect
//         so rest-system deleteActiveEffect hook doesn't trigger premature consciousness attempt.
// v1.9.5: Fix _buildEnduranceLadder rank format: "Shift X" → "Shift-X" to match actor data
// v1.9.4: Add canAct:false to Unconscious effect changes so existing canActorAct guard blocks attacks.
// v1.7.0: Restyle card to match attack/check card layout (gray card, flex header, color badge, white result box)
//         Drop <details> collapsible, embed duration roll in card, remove emoji from console.log
// v1.6.0: _createDyingEffect delegates to ongoing-engine.applyDyingOngoing.
// v1.5.2: Add fromDeathSave flag to Unconscious effect for wake-up health restoration
// v1.5.0: Apply IMMEDIATE first Endurance rank loss when dying (per rules)
// v1.4.0: Separate Kill Save (conscious) from Death Save (unconscious from 0 HP)
// v1.3.2: Store originalEndurance in Dying effect flags and actor flags for recovery tracking
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  bannerColors,
  showDiceAnimation,
} from "./action-utils.js";
import { resolveKillFeat, KILL_CONTEXTS, getKillContextFromAttackForm } from "../../rules/kill-resolver.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { safeActorCreateEffect, safeActorDeleteEffects } from "../../gm-utils.js";

export class DeathSaveAction extends BaseAction {
  constructor(a) {
    if (!a || typeof a !== "object") throw new Error("DeathSaveAction requires a config object.");
    const { actor, abilityName = "endurance", opts = {} } = a;
    super({ actor, abilityName, opts });
  }

  async execute() {
    const actor      = this.actor;
    const endurance  = getAbilityInfo(actor, "endurance");
    const attackForm = this.opts?.attackForm || "";
    const killContext = attackForm
      ? getKillContextFromAttackForm(attackForm)
      : KILL_CONTEXTS.ZERO_HEALTH;

    // --- AUTO MODE FAST-PATH ---
    if (this?.opts?.autoApply === true) {
      const fromZeroHealth = this.opts?.fromZeroHealth !== false;
      const endRank   = actor.system?.abilities?.endurance?.rank  || "Good";
      const endValue  = actor.system?.abilities?.endurance?.value || 8;
      const featCs    = Number(this.opts?.featCs ?? 0);
      const effectiveRank = shiftRank(endRank, featCs);
      const shiftDisplay  = featCs ? ` (${featCs > 0 ? "+" : ""}${featCs}CS)` : "";

      const roll = await (new Roll("1d100")).evaluate();
      const colorLower = String(game.msh.rollUniversalTable(effectiveRank, Math.min(100, roll.total))).toLowerCase();

      const stunDie = game.settings.get("msh-faserip", "stunDurationDie") || "d10";
      let unconsciousDuration = null;
      if (fromZeroHealth) {
        const durationRoll = await (new Roll(`1${stunDie}`)).evaluate();
        unconsciousDuration = durationRoll.total;
      }

      const killResult = resolveKillFeat(colorLower, killContext);
      const isDying    = (killResult.outcome === "EnduranceLoss");
      const isRobot    = actor.system?.origin === "Robot";

      console.log(`[FASERIP] Death Save | ${actor.name} rolled ${colorLower.toUpperCase()} (${roll.total}) vs ${effectiveRank} — ${killResult.label}`);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: this._buildDeathSaveCard({
          actor, effectiveRank, shiftDisplay, endValue,
          roll, colorLower, killResult, isDying, fromZeroHealth,
          unconsciousDuration, attackForm, killContext, isRobot
        })
      });

      if (fromZeroHealth) await this._createStunnedEffect(actor, unconsciousDuration ?? 1);
      if (isDying)        await this._createDyingEffect(actor, { rank: endRank, value: endValue });
      return;
    }
    // --- END AUTO MODE ---

    const fromZeroHealth    = this.opts?.fromZeroHealth !== false;
    const isEdgedOrShooting = (killContext === KILL_CONTEXTS.EDGED_MELEE || killContext === KILL_CONTEXTS.SHOOTING);
    const isRobot           = actor.system?.origin === "Robot";
    const atZeroHealth      = (actor?.system?.attributes?.health?.value ?? 1) === 0;
    const isUnconscious     = fromZeroHealth || atZeroHealth;
    const dialogTitle       = isUnconscious
      ? (isRobot ? "Deactivation Save" : "Death Save")
      : "Kill Save";
    const dialogDesc        = fromZeroHealth
      ? (isRobot
          ? "Robot/construct reached 0 Health. Roll Endurance FEAT vs Kill column (deactivation check)."
          : "Character has reached 0 Health. Roll Endurance FEAT vs Kill column.")
      : "Kill result from attack! Roll Endurance FEAT vs Kill column.";
    const noEffectLabel     = fromZeroHealth ? "Unconscious" : "No Effect";

    const dialogHtml = `
      <div class="frp-dialog" style="min-width:380px;">
        <div style="background:#ffebee;border:1px solid #ef5350;border-radius:3px;padding:10px;margin-bottom:8px;">
          <div style="font-weight:bold;color:#c62828;font-size:1.1em;">${dialogTitle}</div>
          <div style="font-size:.85em;color:#666;margin-top:4px;">${dialogDesc}</div>
          ${!fromZeroHealth ? '<div style="font-size:.85em;color:#1565c0;margin-top:4px;">Character remains conscious if they fail.</div>' : ""}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
            <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Character</div>
            <div style="font-weight:600;color:#c62828;">${actor.name}</div>
          </div>
          <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
            <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Endurance</div>
            <div style="font-weight:600;">${endurance.rank}</div>
            <div style="color:#666;">Rank Value: ${endurance.value}</div>
          </div>
        </div>
        ${attackForm ? `
          <div style="padding:6px 8px;margin-bottom:8px;border-radius:3px;${isEdgedOrShooting ? "background:#ffebee;border:1px solid #ef5350;" : "background:#e3f2fd;border:1px solid #90caf9;"}">
            <span style="font-weight:600;">Attack Type:</span> ${attackForm}
            ${isEdgedOrShooting
              ? `<span style="color:#c62828;margin-left:8px;">E/S: Green = Dying</span>`
              : `<span style="color:#1565c0;margin-left:8px;">Green = ${noEffectLabel} only</span>`}
          </div>
        ` : ""}
        <div class="cs-field" style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:8px;border-radius:3px;border:1px solid transparent;">
          <label style="font-weight:600;">Column Shift:</label>
          <input type="number" name="shift" value="0" style="width:50px;padding:4px;text-align:center;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display">${endurance.rank}</strong>
          <button type="button" class="cs-reset" style="visibility:hidden;padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>
        <div style="padding:8px;background:#fff3e0;border:1px solid #ffcc80;border-radius:3px;margin-bottom:8px;font-size:.9em;">
          <div style="font-weight:600;margin-bottom:4px;">Possible Results:</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;">
            <span style="color:#333;font-weight:600;">White:</span><span>Endurance Loss (Dying${!fromZeroHealth ? ", conscious" : ""})</span>
            <span style="color:#4caf50;font-weight:600;">Green:</span><span>${isEdgedOrShooting ? "Endurance Loss (E/S)" : noEffectLabel}</span>
            <span style="color:#f57f17;font-weight:600;">Yellow:</span><span>${noEffectLabel}</span>
            <span style="color:#c62828;font-weight:600;">Red:</span><span>${noEffectLabel}</span>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid #ddd;">
          <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
        </div>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${dialogTitle}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              resolve({
                shift:    Number(html.find('[name="shift"]').val()    || 0),
                skipDice: !!html.find('[name="skipDice"]').is(":checked"),
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          const updateCS = () => {
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shifted = shiftRank(endurance.rank, cs);
            html.find("#shifted-rank-display").text(shifted);
            const $field = html.find(".cs-field");
            const $reset = html.find(".cs-reset");
            if (cs < 0) {
              $field.css({ background: "#ffebee", border: "1px solid #ef5350" });
              html.find("#shifted-rank-display").css("color", "#c62828");
              $reset.css("visibility", "visible");
            } else if (cs > 0) {
              $field.css({ background: "#e8f5e9", border: "1px solid #66bb6a" });
              html.find("#shifted-rank-display").css("color", "#2e7d32");
              $reset.css("visibility", "visible");
            } else {
              $field.css({ background: "", border: "1px solid transparent" });
              html.find("#shifted-rank-display").css("color", "");
              $reset.css("visibility", "hidden");
            }
          };
          html.find('[name="shift"]').on("input change", updateCS);
          html.find(".cs-reset").on("click", (e) => {
            e.preventDefault();
            html.find('[name="shift"]').val(0).trigger("change");
          });
        }
      }).render(true);
    });

    if (!choice) return;

    const effectiveRank = shiftRank(endurance.rank, choice.shift);
    const shiftDisplay  = choice.shift ? ` (${choice.shift > 0 ? "+" : ""}${choice.shift}CS)` : "";

    let useConsolidated = false;
    try { useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards"); } catch (_e) {}

    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} ${dialogTitle} (Endurance FEAT)`, useConsolidated);
    }

    const colorLower = String(game.msh.rollUniversalTable(effectiveRank, roll.total) || "").toLowerCase();

    const stunDie = game.settings.get("msh-faserip", "stunDurationDie") || "d10";
    let unconsciousDuration = null;
    if (fromZeroHealth) {
      const durationRoll = await (new Roll(`1${stunDie}`)).evaluate();
      unconsciousDuration = durationRoll.total;
    }

    const killResult = resolveKillFeat(colorLower, killContext);
    const isDying    = (killResult.outcome === "EnduranceLoss");

    console.log(`[FASERIP] Death Save | ${actor.name} rolled ${colorLower.toUpperCase()} (${roll.total}) vs ${effectiveRank} — ${killResult.label}`);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: this._buildDeathSaveCard({
        actor, effectiveRank, shiftDisplay, endValue: endurance.value,
        roll, colorLower, killResult, isDying, fromZeroHealth,
        unconsciousDuration, attackForm, killContext, isRobot
      })
    });

    if (fromZeroHealth) await this._createStunnedEffect(actor, unconsciousDuration ?? 1);
    if (isDying) {
      await this._createDyingEffect(actor, endurance);
      if (isRobot) {
        ui.notifications.warn(`${actor.name} is DEACTIVATING — losing 1 Endurance rank per turn until stabilized or repaired.`);
      } else {
        ui.notifications.warn(`${actor.name} is DYING — losing 1 Endurance rank per turn until stabilized.`);
      }
    } else {
      if (fromZeroHealth) ui.notifications.info(`${actor.name} is unconscious for ${unconsciousDuration} rounds.`);
      else                ui.notifications.info(`${actor.name} resisted the Kill result — no effect.`);
    }
  }

  // ----------------------------------------------------------------
  // Card builder — matches attack card / check card layout exactly
  // ----------------------------------------------------------------
  _buildDeathSaveCard({ actor, effectiveRank, shiftDisplay, endValue, roll, colorLower, killResult, isDying, fromZeroHealth, unconsciousDuration, attackForm, killContext, isRobot=false }) {
    const isEdgedOrShooting = (killContext === KILL_CONTEXTS.EDGED_MELEE || killContext === KILL_CONTEXTS.SHOOTING);
    // 0 HP = unconscious regardless of how the kill save was triggered
    const atZeroHealth = (actor?.system?.attributes?.health?.value ?? 1) === 0;
    const isUnconscious = fromZeroHealth || atZeroHealth;
    const cardLabel   = isUnconscious ? (isRobot ? "DEACTIVATION SAVE" : "DEATH SAVE") : "KILL SAVE";
    const resultLabel = killResult.label || (isDying ? "Endurance Loss" : "No Effect");
    const { bg, fg }  = bannerColors(colorLower);
    const rollBox = `<span title="d100 vs ${effectiveRank} Endurance (Kill column)" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;

    let outcomeLines = [];
    if (isDying) {
      if (isRobot) {
        outcomeLines.push(isUnconscious
          ? `<div style="color:#c62828;font-weight:700;">DEACTIVATING — Offline</div>`
          : `<div style="color:#c62828;font-weight:700;">DEACTIVATING — Losing structural integrity</div>`);
        outcomeLines.push(`<div style="margin-top:4px;font-size:.9em;color:#555;">Losing 1 Endurance rank per turn until stabilized or repaired.</div>`);
      } else {
        outcomeLines.push(isUnconscious
          ? `<div style="color:#c62828;font-weight:700;">DYING — Unconscious</div>`
          : `<div style="color:#c62828;font-weight:700;">DYING — Conscious (bleeding out)</div>`);
        outcomeLines.push(`<div style="margin-top:4px;font-size:.9em;color:#555;">Losing 1 Endurance rank per turn until stabilized.</div>`);
      }
      outcomeLines.push(`<div style="margin-top:4px;font-size:.85em;color:#555;">${this._buildEnduranceLadder(effectiveRank)}</div>`);
      outcomeLines.push(`<div style="margin-top:6px;font-size:.85em;color:#555;">
        <strong>Stabilize:</strong>
        50 Karma (1 round) &nbsp;|&nbsp;
        200 Karma + FEAT (re-roll End) &nbsp;|&nbsp;
        Any Aid (stops loss)
      </div>`);
    } else if (fromZeroHealth) {
      outcomeLines.push(`<div style="color:#1565c0;font-weight:700;">UNCONSCIOUS — ${unconsciousDuration} round${unconsciousDuration !== 1 ? "s" : ""}</div>`);
      outcomeLines.push(`<div style="margin-top:4px;font-size:.9em;color:#555;">Wakes with Health = Endurance rank value (${endValue}).</div>`);
    } else {
      outcomeLines.push(`<div style="color:#2e7d32;font-weight:700;">NO EFFECT</div>`);
      outcomeLines.push(`<div style="margin-top:4px;font-size:.9em;color:#555;">Kill result resisted — no Endurance loss.</div>`);
    }

    if (attackForm && isEdgedOrShooting) {
      outcomeLines.push(`<div style="margin-top:4px;font-size:.85em;color:#555;">Attack type: ${attackForm} (Edged/Shooting rules applied)</div>`);
    }

    return `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">${cardLabel}</strong>
          <span style="color:#666;font-weight:normal;font-size:.85em;">Endurance FEAT</span>
        </div>
        <div style="padding:4px 10px;font-size:.95em;"><strong>${actor.name}</strong></div>
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>Endurance: ${effectiveRank}${shiftDisplay}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span>Roll: ${rollBox}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${colorLower.toUpperCase()} — ${resultLabel.toUpperCase()}
            </span>
          </div>
        </div>
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          ${outcomeLines.join("\n")}
        </div>
      </div>
    `;
  }

  /** Create the DYING effect — delegates to ongoing engine */
  async _createDyingEffect(actor, _endurance) {
    try {
      if (game.msh?.ongoing?.applyDying) {
        await game.msh.ongoing.applyDying(actor);
      } else {
        const { applyDyingOngoing } = await import("../effects/ongoing-engine.js");
        await applyDyingOngoing(actor);
      }
    } catch (err) {
      console.error(`[FASERIP ERROR] _createDyingEffect failed for ${actor.name}:`, err);
    }
  }

  /** Create an UNCONSCIOUS effect (N rounds) */
  async _createStunnedEffect(actor, unconsciousRounds = 1) {
    const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
    const cttSyncMode = game.settings.get("msh-faserip", "ctt.syncMode");
    const usesCTT = (cttSyncMode !== "off" && game.modules.get("calendar-time-tracker")?.active === true);

    try {
      const existing = actor.effects.filter(e => e.statuses?.has?.("unconscious"));
      if (existing.length) {
        await safeActorDeleteEffects(actor, existing.map(e => e.id), { mshReplacing: true });
      }
    } catch (err) {
      console.error("[FASERIP ERROR] Error deleting existing unconscious effects:", err);
    }

    const effectData = {
      name: `Unconscious (${unconsciousRounds} rounds)`,
      img: "icons/svg/sleep.svg",
      origin: actor.uuid,
      disabled: false,
      flags: {
        [scope]: {
          isUnconscious: true,
          zeroHealth: true,
          fromDeathSave: true,
          durationRounds: Number(unconsciousRounds)
        }
      },
      changes: [
        { key: "system.status.unconscious", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true },
        { key: "system.combatMods.canAct", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "false" }
      ],
      statuses: ["unconscious"],
      duration: usesCTT
        ? { value: Math.max(1, Number(unconsciousRounds)) * 6, units: "seconds" }
        : { value: Math.max(1, Number(unconsciousRounds)), units: "rounds", expiry: "roundEnd" }
    };

    await safeActorCreateEffect(actor, [effectData]);
    console.log(`[FASERIP] Unconscious effect created for ${actor.name} (${unconsciousRounds} rounds)`);
  }

  /** Build a short endurance rank ladder for the dying card */
  _buildEnduranceLadder(startRank = "Typical") {
    const order = [
      "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable",
      "Incredible","Amazing","Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z",
      "Class 1000","Class 3000","Class 5000","Beyond"
    ];
    const i = order.indexOf(startRank);
    if (i < 0) return `${startRank} → … → Shift-0 → Death`;
    // Show up to 4 ranks descending from current toward Shift-0
    const descent = order.slice(Math.max(0, i - 3), i + 1).reverse();
    if (i <= 3) return descent.join(" → ") + " → Death";
    return descent.join(" → ") + " → … → Shift-0 → Death";
  }
}