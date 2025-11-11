// scripts/modules/actions/mental-power-action.js
import { BaseAction } from "./base-action.js";
import { resolveCombatMode, ActionDispatcher } from "./action-dispatcher.js";
import { buildActionsBox, buildModeSelector, setupModeSelector } from "./action-utils.js";

/**
 * Mental Power Action - for powers that skip to-hit roll and go straight to saves
 * Examples: Psionic Attack, Mind Control, Emotion Control, Mental Probe
 */
export class MentalPowerAction extends BaseAction {
  constructor(config) {
    const actor = config.actor;
    const opts = config.opts || {};
    const itemId = opts.itemId;
    
    super({ actor, abilityName: "psyche", opts });
    
    this.item = itemId ? actor.items.get(itemId) : null;
    this.actionType = "mental-power";
  }

  async execute() {
    console.log("=== Mental Power Action - Execute Start ===");
    const actor = this.actor;
    const item = this.item;
    console.log("Mental Power Action - Actor:", actor?.name, "Item:", item?.name);

    if (!item) {
      console.log("Mental Power Action - ERROR: No item found");
      ui.notifications.error("No mental power selected");
      return;
    }

    const powerName = item.name;
    const powerRank = item.system.rank || "Typical";
    const powerValue = item.system.value || 6;
    const range = item.system.range || "rank";
    const calculatedRange = item.system.calculatedRange || this._getRangeByRank(powerRank);
    console.log("Mental Power Action - Power info:", { powerName, powerRank, powerValue, range, calculatedRange });
    
    // Determine save ability from power system or default to Psyche
    const saveAbility = item.system.save?.ability || this._getDefaultSaveAbility(item);
    const saveIntensity = item.system.save?.intensity || "power-rank";
    const saveFixedRank = item.system.save?.fixedRank || powerRank;
    console.log("Mental Power Action - Save info:", { saveAbility, saveIntensity, saveFixedRank });

    // Check if power requires a save
    const requiresSave = item.system.requiresSave !== false; // Default true for mental powers
    console.log("Mental Power Action - Requires save:", requiresSave);

    // Get targets
    const targets = Array.from(game.user.targets);
    console.log("Mental Power Action - Targets found:", targets.length);
    
    if (targets.length === 0) {
      console.log("Mental Power Action - ERROR: No targets selected");
      ui.notifications.warn("No target selected for mental power");
      return;
    }

    if (targets.length > 1) {
      console.log("Mental Power Action - WARNING: Multiple targets, using first");
      ui.notifications.warn("Mental powers affect one target at a time. Using first target.");
    }

    const target = targets[0];
    const targetActor = target.actor;
    const targetName = targetActor?.name || "Unknown";
    console.log("Mental Power Action - Target:", targetName, "Actor:", targetActor?.name);

    // Determine combat mode
    const combatMode = resolveCombatMode(targetActor);
    const isManualMode = this.opts?.mode === "manual" || combatMode === "manual";
    const isFullAuto = combatMode === "full";
    console.log("Mental Power Action - Combat mode:", { combatMode, isManualMode, isFullAuto });

    // Build dialog
    console.log("Mental Power Action - Building dialog...");
    const dialogHtml = `
      ${buildModeSelector({ mode: combatMode })}
      
      <div style="margin-bottom:8px;">
        <strong>Power:</strong> ${powerName}
      </div>
      <div style="margin-bottom:8px;">
        <strong>Rank:</strong> ${powerRank} (${powerValue})
      </div>
      <div style="margin-bottom:8px;">
        <strong>Range:</strong> ${calculatedRange}
      </div>
      <div style="margin-bottom:12px;">
        <strong>Target:</strong> ${targetName}
      </div>
      
      <div style="padding:8px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;margin-bottom:12px;">
        <div style="font-weight:bold;margin-bottom:4px;">Mental Power - No Attack Roll</div>
        <div style="font-size:0.9em;">Target must make a <strong>${saveAbility.toUpperCase()}</strong> save vs <strong>${powerRank}</strong> intensity</div>
        ${isFullAuto ? '<div style="font-size:0.85em;margin-top:4px;font-style:italic;">Save will auto-trigger in Full Auto mode</div>' : ''}
      </div>

      <div style="margin-bottom:8px;">
        <label>
          <input type="checkbox" name="skipAnimation" ${this.opts.skipDice ? "checked" : ""}>
          Skip animation
        </label>
      </div>
    `;

    console.log("Mental Power Action - Showing dialog...");
    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${powerName} - Mental Power`,
        content: dialogHtml,
        buttons: {
          use: {
            icon: '<i class="fas fa-brain"></i>',
            label: "Use Power",
            callback: (html) => {
              resolve({
                skipAnimation: html.find('[name="skipAnimation"]').is(':checked')
              });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "use",
        render: async (html) => {
          await setupModeSelector(actor, html, this.opts || {}, "lastMentalPowerMode");
        }
      }).render(true);
    });

    if (!choice) {
      console.log("Mental Power Action - User cancelled dialog");
      return;
    }

    console.log("Mental Power Action - User confirmed, choice:", choice);

    // Re-check combat mode after dialog (user may have changed it)
    const finalMode = this.opts?.mode || combatMode;
    const isFinalManual = finalMode === "manual";
    const isFinalAuto = finalMode === "full";
    console.log("Mental Power Action - Final mode after dialog:", { finalMode, isFinalManual, isFinalAuto });

    // Build action buttons
    console.log("Mental Power Action - Building action buttons...");
    console.log("Mental Power Action - buildActionsBox params:", {
      showNullifySave: requiresSave,
      nullifyIntensityRank: powerRank,
      saveAbility: saveAbility,
      actorUuid: actor.uuid,
      targetUuid: target.document?.uuid || target.actor?.uuid,
      targetName: targetName,
      autoApply: false,
      autoSave: isFinalAuto,
      attackForm: "mental"
    });

    const actionsHtml = buildActionsBox({
      showNullifySave: requiresSave,
      nullifyIntensityRank: powerRank,
      saveAbility: saveAbility,
      actorUuid: actor.uuid,
      targetUuid: target.document?.uuid || target.actor?.uuid,
      targetName: targetName,
      autoApply: false,
      autoSave: isFinalAuto,     // Hide button in full auto
      attackForm: "mental"
      });

      // Render nothing in full-auto (prevents disabled/hidden chip from confusing hooks)
      const renderedActionsHtml = actionsHtml;  // Always show, but button will be disabled

    console.log("Mental Power Action - Action buttons HTML length:", actionsHtml.length);
    console.log("Mental Power Action - Action buttons HTML:", actionsHtml);

    // Create chat card
    console.log("Mental Power Action - Building chat card...");

// Label-ize the save ability like the blunt card labels (“Ability: Psyche”)
const saveAbilityLabel = (saveAbility && typeof saveAbility === "string")
  ? (saveAbility.charAt(0).toUpperCase() + saveAbility.slice(1))
  : "Psyche";

// Top “banner” (purple), info grid (blunt-style), then a purple callout and the standard actions row.
const cardHtml = `
  <div style="border:1px solid #b39ddb;border-radius:4px;overflow:hidden;background:#fff;">
    <!-- Top banner (purple theme) -->
    <div style="background:#6a1b9a;color:#fff;border-bottom:1px solid #4a148c;padding:8px 10px;">
      <div style="font-weight:700;">${actor.name} uses ${powerName}</div>
      <div style="font-size:.85em;opacity:.9;">→ ${targetName}</div>
    </div>

    <!-- Info grid (match blunt card formatting) -->
    <div style="padding:8px 10px;">
      <div style="display:grid;grid-template-columns:90px 1fr;gap:3px 8px;font-size:.9em;line-height:1.3;">
        <span style="font-weight:600;">Action:</span><span>Mental Power</span>
        <span style="font-weight:600;">Target:</span><span style="color:#6d4c41;font-style:italic;">${targetName}</span>
        <span style="font-weight:600;">Ability:</span><span>${saveAbilityLabel}</span>
        <span style="font-weight:600;">Intensity:</span><span>${powerRank} (${powerValue})</span>
        <span style="font-weight:600;">Range:</span><span>${calculatedRange}</span>
        <span style="font-weight:600;">Type:</span><span>No attack roll (save required)</span>
      </div>
    </div>

    <!-- Purple “Save Required” callout -->
    <div style="margin:6px 10px 0 10px;padding:8px;background:#f3e5f5;border:1px solid #8e24aa;border-radius:4px;">
      <div style="font-weight:700;color:#6a1b9a;margin-bottom:4px;">Save Required</div>
      <div style="font-size:.9em;">
        ${targetName} must make a <strong>${saveAbilityLabel.toUpperCase()}</strong> FEAT vs
        <strong>${powerRank}</strong> intensity.
      </div>
      ${item.system?.save?.onFail?.notes
        ? `<div style="font-size:.85em;margin-top:4px;color:#5e35b1;font-style:italic;">${item.system.save.onFail.notes}</div>`
        : ""}
    </div>

    <!-- Action chips (Force Save, etc.) -->
    <div style="padding:8px 10px 10px 10px;">
      ${renderedActionsHtml}
    </div>
  </div>
`;

    console.log("Mental Power Action - Chat card HTML length:", cardHtml.length);

    // Build message flags for auto-save
    console.log("Mental Power Action - Building message flags...");
    const nameLc = (powerName || "").toLowerCase();
    let effectName   = item.system?.save?.onFail?.effectName || null;
    let failMessage  = item.system?.save?.onFail?.message     || null;
    let abilityLabel = saveAbility;
    let intensity    = item.system?.save?.intensity || "power-rank";
    let fixedRank    = item.system?.save?.fixedRank || powerRank;

    // Sensible defaults per common mental powers
    if (!effectName) {
      if (nameLc.includes("psionic attack")) {
        effectName   = "Unconscious";
        failMessage  = "is knocked unconscious";
        abilityLabel = "psyche";
      } else if (nameLc.includes("mind control") || nameLc.includes("possession")) {
        effectName   = "Controlled";
        failMessage  = "falls under psychic control";
        abilityLabel = "psyche";
      } else if (nameLc.includes("emotion control")) {
        effectName   = "Emotion Controlled";
        failMessage  = "is overwhelmed by emotion";
        abilityLabel = "intuition";
      } else if (nameLc.includes("mental probe")) {
        effectName   = "Mentally Fatigued";
        failMessage  = "suffers mental strain";
        abilityLabel = "psyche";
      } else if (nameLc.includes("nullif")) {
        effectName   = "Nullified";
        failMessage  = "has powers nullified";
      }
    }

    const defenderUuid = target.document?.uuid || target.actor?.uuid;

    const msgFlags = {
      "msh-faserip": {
        actionId: "mental-power",
        powerName,
        powerRank,
        powerValue,
        requiresSave: requiresSave === true,
        attackerUuid: actor.uuid,
        targetUuid: defenderUuid,
        defenderUuid,
        saveAbility: abilityLabel,
        saveIntensity: intensity,
        saveFixedRank: fixedRank,
        effectName,
        failMessage,
        itemId: item.id,
        saveConfig: item.system.save || {}
      }
    };
    console.log("Mental Power Action - Message flags:", msgFlags);

    console.log("Mental Power Action - Creating chat message...");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      flags: msgFlags
    });
    console.log("Mental Power Action - Chat message created successfully");

    // Play mental power SFX if available
    console.log("Mental Power Action - Checking for SFX...");
    if (game.msh?.playCombatSFX) {
      console.log("Mental Power Action - Playing SFX...");
        const srcItem = this?.opts?.item || actor.items.get?.(this?.opts?.itemId) || null;
        await game.msh.playCombatSFX({
          item: srcItem,
          actionType: "mental-power",
          damageType: "mental",
          rollResult: "purple", // or map color to result if available
          isHit: true           // or derive based on new logic
        });
      console.log("Mental Power Action - SFX played");
    } else {
      console.log("Mental Power Action - No SFX system available");
    }
    console.log("=== Mental Power Action - Execute Complete ===");
  }

  /**
   * Determine default save ability based on power type
   */
  _getDefaultSaveAbility(item) {
    const type = (item.system.type || "").toLowerCase();
    const name = (item.name || "").toLowerCase();

    // Emotion-based powers use Intuition
    if (type.includes("emotion") || name.includes("emotion")) {
      return "intuition";
    }

    // Most mental powers use Psyche
    return "psyche";
  }

  /**
   * Get range by rank (same as in itemSheet.js)
   */
  _getRangeByRank(rank) {
    const rankRanges = {
      "Feeble": "Touch only",
      "Poor": "Touch only",
      "Typical": "1 area",
      "Good": "2 areas",
      "Excellent": "4 areas",
      "Remarkable": "6 areas",
      "Incredible": "8 areas",
      "Amazing": "10 areas",
      "Monstrous": "20 areas",
      "Unearthly": "40 areas",
      "Shift-X": "60 areas",
      "Shift-Y": "80 areas",
      "Shift-Z": "160 areas",
      "Class 1000": "400 areas",
      "Class 3000": "100 miles",
      "Class 5000": "10,000 miles",
      "Beyond": "1,000,000 miles"
    };
    return rankRanges[rank] || "Unknown";
  }
}