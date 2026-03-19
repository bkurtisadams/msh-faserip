// scripts/modules/actions/mental-power-action.js v2.2.0 - 2026-03-19
// v2.2.0: Nullifying Power auto-activates aura + self-suppresses caster's inborn powers.
//         Adds Toggle Nullify Aura button to chat card. Sets isNullifyAura flag.
//         Save ability defaults to Endurance for Nullifying Power.
// v1.1.0: Unified chat card layout via buildCardShell/buildContentBox utilities
import { BaseAction } from "./base-action.js";
import { resolveCombatMode, ActionDispatcher } from "./action-dispatcher.js";
import { buildActionsBox, buildModeSelector, setupModeSelector, buildCardShell, buildActorTargetHtml, buildContentBox, RANKS, rankValue, valueToRank, scanMentalDefenses, scanForceField } from "./action-utils.js";

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
    const actor = this.actor;
    const item = this.item;

    if (!item) {
      ui.notifications.error("No mental power selected");
      return;
    }

    const powerName = item.name;
    const powerRank = item.system.rank || "Typical";
    const powerValue = item.system.value || 6;
    const calculatedRange = item.system.calculatedRange || this._getRangeByRank(powerRank);
    
    // Determine save ability from power system or default to Psyche
    const saveAbility = item.system.save?.ability || this._getDefaultSaveAbility(item);
    const saveIntensity = item.system.save?.intensity || "power-rank";
    const saveFixedRank = item.system.save?.fixedRank || powerRank;

    // Check if power requires a save
    const requiresSave = item.system.requiresSave !== false; // Default true for mental powers

    // Get targets
    const targets = Array.from(game.user.targets);
    
    if (targets.length === 0) {
      ui.notifications.warn("No target selected for mental power");
      return;
    }

    if (targets.length > 1) {
      ui.notifications.warn("Mental powers affect one target at a time. Using first target.");
    }

    const target = targets[0];
    const targetActor = target.actor;
    const targetName = targetActor?.name || "Unknown";

    // ── Psionic Attack: check for Force Field intensity reduction ──
    const nameLc = (powerName || "").toLowerCase();
    const isPsionicAttack = nameLc.includes("psionic attack");
    let effectiveIntensityRank = powerRank;
    let effectiveIntensityValue = powerValue;
    let ffInfo = null;
    let ffBlocked = false;
    let ffReductionNote = "";

    if (isPsionicAttack && targetActor) {
      ffInfo = scanForceField(targetActor);
      if (ffInfo) {
        if (ffInfo.value >= powerValue) {
          // FF fully absorbs the psionic attack
          ffBlocked = true;
          ffReductionNote = `${ffInfo.source} (${ffInfo.rank}) fully absorbs the attack`;
        } else {
          // FF reduces intensity: subtract FF rank number from attack rank number
          const remaining = powerValue - ffInfo.value;
          effectiveIntensityRank = valueToRank(remaining);
          effectiveIntensityValue = remaining;
          ffReductionNote = `${ffInfo.source} (${ffInfo.rank}/${ffInfo.value}) reduces intensity: ${powerRank} (${powerValue}) → ${effectiveIntensityRank} (${effectiveIntensityValue})`;
        }
        console.log(`[FASERIP] Psionic Attack vs Force Field: ${ffReductionNote}`);
      }
    }

    // ── Scan target mental defenses (Psi-Screen, Mental Powers → replace Psyche) ──
    let mentalDef = null;
    let defenseNote = "";
    if (targetActor && saveAbility === "psyche") {
      mentalDef = scanMentalDefenses(targetActor, saveAbility);
      if (mentalDef.source !== "Psyche") {
        defenseNote = `${targetName} uses ${mentalDef.source} (${mentalDef.rank}) instead of Psyche`;
        console.log(`[FASERIP] Mental defense substitution: ${defenseNote}`);
      }
    }

    // Determine combat mode
    const combatMode = resolveCombatMode(targetActor);
    const isFullAuto = combatMode === "full";

    // ── Defense details for dialog ──
    const defenseLines = [];
    if (mentalDef && mentalDef.source !== "Psyche") {
      defenseLines.push(`<div style="font-size:0.85em;color:#5e35b1;"><strong>Defense:</strong> ${mentalDef.source} (${mentalDef.rank}) replaces Psyche</div>`);
    }
    if (ffInfo && isPsionicAttack) {
      const ffColor = ffBlocked ? "#d32f2f" : "#e65100";
      defenseLines.push(`<div style="font-size:0.85em;color:${ffColor};"><strong>Force Field:</strong> ${ffReductionNote}</div>`);
    }
    const defenseBlock = defenseLines.length
      ? `<div style="padding:6px 8px;background:#f3e5f5;border:1px solid #ce93d8;border-radius:3px;margin-bottom:8px;">${defenseLines.join("")}</div>`
      : "";

    // Build dialog
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
      ${defenseBlock}
      <div style="padding:8px;background:${ffBlocked ? '#ffebee' : '#fff3cd'};border:1px solid ${ffBlocked ? '#ef9a9a' : '#ffc107'};border-radius:3px;margin-bottom:12px;">
        ${ffBlocked
          ? `<div style="font-weight:bold;color:#c62828;margin-bottom:4px;">Attack Blocked by Force Field</div>
             <div style="font-size:0.9em;">${ffReductionNote}</div>`
          : `<div style="font-weight:bold;margin-bottom:4px;">Mental Power - No Attack Roll</div>
             <div style="font-size:0.9em;">Target must make a <strong>${saveAbility.toUpperCase()}</strong> save vs <strong>${effectiveIntensityRank}</strong> intensity${ffInfo ? ' (reduced by FF)' : ''}</div>
             ${isFullAuto ? '<div style="font-size:0.85em;margin-top:4px;font-style:italic;">Save will auto-trigger in Full Auto mode</div>' : ''}`
        }
      </div>

      <div style="margin-bottom:8px;">
        <label>
          <input type="checkbox" name="skipAnimation" ${this.opts.skipDice ? "checked" : ""}>
          Skip animation
        </label>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${powerName} - Mental Power`,
        content: dialogHtml,
        buttons: {
          use: {
            icon: '<i class="fas fa-brain"></i>',
            label: ffBlocked ? "Blocked" : "Use Power",
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
        default: ffBlocked ? "cancel" : "use",
        render: async (html) => {
          await setupModeSelector(actor, html, this.opts || {}, "lastMentalPowerMode");
        }
      }).render(true);
    });

    if (!choice) {
      return;
    }

    // ── If FF fully blocked, just post a blocked chat card ──
    if (ffBlocked) {
      const blockedCard = buildCardShell({
        actionLabel: powerName,
        headerRight: "Mental Power",
        actorHtml: buildActorTargetHtml(actor.name, targetName),
        sections: [
          buildContentBox(`<div style="display:grid;grid-template-columns:90px 1fr;gap:3px 8px;font-size:.9em;line-height:1.3;">
            <span style="font-weight:600;">Intensity:</span><span>${powerRank} (${powerValue})</span>
            <span style="font-weight:600;">Range:</span><span>${calculatedRange}</span>
          </div>`),
          buildContentBox(`<div style="font-weight:700;color:#2e7d32;margin-bottom:4px;">Blocked by Force Field</div>
            <div style="font-size:.9em;">${targetName}'s ${ffInfo.source} (${ffInfo.rank}/${ffInfo.value}) fully absorbs the psionic attack (${powerValue}).</div>`)
        ]
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: blockedCard
      });
      console.log("[FASERIP] Psionic Attack blocked by Force Field");
      return;
    }

    // Re-check combat mode after dialog (user may have changed it)
    const finalMode = this.opts?.mode || combatMode;
    const isFinalAuto = finalMode === "full";

    // Build action buttons — use effective (FF-reduced) intensity
    const actionsHtml = buildActionsBox({
      showNullifySave: requiresSave,
      nullifyIntensityRank: effectiveIntensityRank,
      saveAbility: saveAbility,
      actorUuid: actor.uuid,
      targetUuid: target.document?.uuid || target.actor?.uuid,
      targetName: targetName,
      autoApply: false,
      autoSave: isFinalAuto,
      attackForm: "mental"
    });

    // Build chat card

    // Label-ize the save ability
    const saveAbilityLabel = (saveAbility && typeof saveAbility === "string")
      ? (saveAbility.charAt(0).toUpperCase() + saveAbility.slice(1))
      : "Psyche";

    // Show effective defense rank in info grid
    const defenseDisplay = (mentalDef && mentalDef.source !== "Psyche")
      ? `${mentalDef.source} (${mentalDef.rank})`
      : saveAbilityLabel;

    let intensityDisplay = `${effectiveIntensityRank} (${effectiveIntensityValue})`;
    if (ffInfo && !ffBlocked) {
      intensityDisplay += ` <span style="font-size:.8em;color:#e65100;">[reduced from ${powerRank} by ${ffInfo.source}]</span>`;
    }

    const infoGrid = `<div style="display:grid;grid-template-columns:90px 1fr;gap:3px 8px;font-size:.9em;line-height:1.3;">
      <span style="font-weight:600;">Save:</span><span>${defenseDisplay}</span>
      <span style="font-weight:600;">Intensity:</span><span>${intensityDisplay}</span>
      <span style="font-weight:600;">Range:</span><span>${calculatedRange}</span>
      <span style="font-weight:600;">Type:</span><span>No attack roll (save required)</span>
    </div>`;

    // Defense breakdown callout
    const defBreakdownLines = [];
    if (mentalDef && mentalDef.source !== "Psyche") {
      defBreakdownLines.push(`<div style="font-size:.85em;color:#5e35b1;">
        <strong>\u25B6 ${mentalDef.source}</strong> (${mentalDef.rank}) used instead of Psyche for save</div>`);
    }
    if (ffInfo && !ffBlocked) {
      defBreakdownLines.push(`<div style="font-size:.85em;color:#e65100;">
        <strong>\u25B6 ${ffInfo.source}</strong> (${ffInfo.rank}/${ffInfo.value}) reduced intensity from ${powerRank} (${powerValue}) to ${effectiveIntensityRank} (${effectiveIntensityValue})</div>`);
    }
    const defBreakdown = defBreakdownLines.length
      ? `<div style="margin-top:6px;padding:4px 6px;background:#f3e5f5;border-left:3px solid #9c27b0;border-radius:2px;">${defBreakdownLines.join("")}</div>`
      : "";

    const saveCallout = `<div style="font-weight:700;color:#6a1b9a;margin-bottom:4px;">Save Required</div>
    <div style="font-size:.9em;">
      ${targetName} must make a <strong>${defenseDisplay.toUpperCase()}</strong> FEAT vs
      <strong>${effectiveIntensityRank}</strong> intensity.
    </div>
    ${defBreakdown}`;

    // Collapsible power description (if present on the item)
    const powerDesc = (item.system?.description || "").trim();
    const descSection = powerDesc
      ? `<div style="padding:0 10px 6px;">
           <details style="font-size:.85em;color:#555;">
             <summary style="cursor:pointer;font-weight:600;color:#8b0000;user-select:none;">Power Description</summary>
             <div style="margin-top:4px;padding:6px 8px;background:#faf8f2;border:1px solid #e0d8c8;border-radius:3px;line-height:1.4;">${powerDesc}</div>
           </details>
         </div>`
      : "";

    // Detect Nullifying Power early (before card build) for aura toggle button
    const isNullifyAura = nameLc.includes("nullif");

    // Nullify Aura toggle button (only for Nullifying Power)
    const nullifyAuraBtn = isNullifyAura
      ? `<div style="padding:4px 10px 6px;text-align:center;">
           <a class="faserip-chip" data-action="toggle-nullify-aura"
              style="display:inline-flex;align-items:center;justify-content:center;font-size:13px;padding:4px 12px;border:1px solid #6a1b9a;border-radius:4px;background:#f3e5f5;color:#6a1b9a;cursor:pointer;font-weight:600;"
              title="Toggle Nullification Aura on/off (self-suppresses caster's inborn powers)">
              Toggle Nullify Aura
           </a>
         </div>`
      : "";

    const cardHtml = buildCardShell({
      actionLabel: powerName,
      headerRight: "Mental Power",
      actorHtml: buildActorTargetHtml(actor.name, targetName),
      sections: [
        buildContentBox(infoGrid),
        buildContentBox(saveCallout),
        descSection,
        `<div style="padding:4px 10px 10px;">${actionsHtml}</div>`,
        nullifyAuraBtn
      ]
    });

    // Build message flags for auto-save — use effective intensity
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
        abilityLabel = "endurance";
      }
    }

    // ── Nullifying Power: activate aura + self-suppress on caster ──
    if (isNullifyAura) {
      const { isAuraMaintained, startAura } = await import("./nullify.js");
      if (!isAuraMaintained(actor)) {
        await startAura(actor, item.uuid);
        console.log(`[FASERIP] ${actor.name} activated Nullifying Power aura — self-suppressed inborn powers`);
      }
    }

    // If FF reduced the intensity, override to fixed-rank with the reduced rank
    if (ffInfo && !ffBlocked) {
      intensity = "fixed-rank";
      fixedRank = effectiveIntensityRank;
    }

    const defenderUuid = target.document?.uuid || target.actor?.uuid;

    const msgFlags = {
      "msh-faserip": {
        actionId: "mental-power",
        powerName,
        powerRank: effectiveIntensityRank,
        powerValue: effectiveIntensityValue,
        originalPowerRank: powerRank,
        originalPowerValue: powerValue,
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
        isNullifyAura,
        nullify: isNullifyAura ? { powerItemUuid: item.uuid } : undefined,
        saveConfig: item.system.save || {},
        // Mental defense info for the save resolver
        mentalDefense: mentalDef && mentalDef.source !== "Psyche" ? {
          rank: mentalDef.rank,
          value: mentalDef.value,
          source: mentalDef.source
        } : null,
        forceFieldReduction: ffInfo && !ffBlocked ? {
          rank: ffInfo.rank,
          value: ffInfo.value,
          source: ffInfo.source,
          reducedIntensityRank: effectiveIntensityRank,
          reducedIntensityValue: effectiveIntensityValue
        } : null
      }
    };

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      flags: msgFlags
    });

    // Play mental power SFX if available
    if (game.msh?.playCombatSFX) {
      await game.msh.playCombatSFX({
        item: this?.opts?.item || actor.items.get?.(this?.opts?.itemId) || null,
        actionType: "mental-power",
        damageType: "mental",
        rollResult: "",
        isHit: true  // Mental powers always "hit" (no attack roll)
      });
    }
    console.log("[FASERIP] Mental Power Action complete");
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