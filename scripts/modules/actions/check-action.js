// scripts/modules/actions/check-action.js v1.10.0 - 2026-03-19
// v1.10.0: Replace inline mental defense scan with shared scanMentalDefenses() from action-utils.
//          Accept "power-save" action type alongside legacy "save-nullify".
// v1.7.0: Consolidate slam dual-card — _createSlamChatMessage replaced by _slamDetailHtml folded into check card result box
// v1.6.2: Read Endurance rank from actor directly (actor IS the defender) - prefill.targetEndRank was stale/missing
// v1.6.1: Fix check card showing literal 'Target' — actor IS the defender, drop targetName from card header
// v1.6.0: Restyle stun/slam/kill check cards to match attack card style (gray card, inline roll badge, white result box)
// v1.5.2: Fix slam explanation text in _extraExplanationHtml - was completely backwards (White↔Red, Green↔Yellow)
// v1.5.0: Add returnResultOnly mode for inline embedding in attack cards (collapsible sections)
// v1.4.1: Show stun duration with hover text for die type
// v1.4.0: Change stun duration from "d10 + cap" to configurable die (stunDurationDie setting)
// v1.3.0: Show when stun duration was capped by maxStunDuration setting in chat card
// v1.2.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.1.0: Integrate effect modifiers for ability FEAT shifts
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  labelFor,
  effectsFor,
  bannerColors,
  getAbilityInfo,
  universalColor,
  showDiceAnimation,
  debugLog,
  scanMentalDefenses
} from "./action-utils.js";
import { resolveKillFeat, getKillContextFromAttackForm } from "../../rules/kill-resolver.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
//import { rollUniversalTable } from "../dice/universal-table.js";
import * as Effects from "../effects/effect-engine.js";
import * as Nullify from "./nullify.js";
import { resolveSlamFeat, getGrandSlamDistance } from "../combat/damage-resolution.js";
import { getAbilityShift } from "../effects/effect-modifiers.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

/** Small util */
function rankIndex(r) {
  return Math.max(0, RANKS.findIndex(x => x.toLowerCase() === String(r||"").toLowerCase()));
}

export class CheckAction extends BaseAction {
  constructor({ actor, actionType, abilityName, opts = {} }) {
    super({ actor, actionType, abilityName, opts });
  }

  /** Build a simple select */
  _rankOptions(selected) {
    return RANKS.map(r => `<option value="${r}" ${String(r).toLowerCase()===String(selected).toLowerCase()?"selected":""}>${r}</option>`).join("");
  }

  async execute() {
    console.log("CheckAction.execute() START", {
      thisActor: this.actor,
      thisActorName: this.actor?.name,
      thisAbilityName: this.abilityName,
      actionType: this.actionType,
      opts: this.opts
    });

    const actor       = this.actor;
    const actionType  = String(this.actionType || "").toLowerCase(); // "stun" | "slam" | "kill" | "save-nullify"
    
    if (actionType === "kill") {
      console.log("[FASERIP DEBUG] CheckAction handling KILL action - this creates a SEPARATE chat card!");
    }
    
    const actionName  = labelFor(actionType);
    const mapping     = effectsFor(actionType) || {};
    //const attackerStr = getAbilityInfo(actor, "strength");
    const targetAbility = getAbilityInfo(actor, this.abilityName || "endurance");

    // Prefill from opts (e.g., auto path or chat hook)
    const prefill     = this.opts?.prefill || {};

    // TDZ-safe flag computed early
    let isSaveNullify = false;
    {
      const _aid = String(
        this?.actionId || this?.type || this?.opts?.actionId || this?.opts?.checkType || this?.actionType || ""
      ).toLowerCase();
      isSaveNullify = (_aid === "save-nullify" || _aid === "nullify-save" || _aid === "force-save-nullify" || _aid === "power-save" || _aid === "force-power-save");
    }

    // ------------------------------
    // FULL AUTO FAST-PATH
    // ------------------------------
    if (this?.opts?.autoApply === true) {
      // Compute variant id once
      const actionId = String(
        this?.actionId || this?.type || this?.opts?.actionId || this?.opts?.checkType || this?.actionType || ""
      ).toLowerCase();
      isSaveNullify = (actionId === "save-nullify" || actionId === "nullify-save" || actionId === "force-save-nullify" || actionId === "power-save" || actionId === "force-power-save");

      // Build choice (synthetic dialog result)
      const targetName    = prefill.targetName     || "Target";
      const targetEndRank = actor?.system?.abilities?.endurance?.rank || prefill.targetEndRank || "Good";
      const shift         = Number(prefill.shift ?? 0) || 0;
      const dmgThrough    = Number(prefill.dmgThrough ?? 0) || 0;
      const borderline    = !!prefill.borderline;
      const attackForm    = String(prefill.attackForm || this?.opts?.attackForm || "blunt").toLowerCase();
      const defenderUuid  = prefill.targetUuid || prefill.defenderUuid || "";

      // Get effect-based ability shift for the defender's endurance
      // Also include selfPenaltyCS (e.g. Impaired Endurance -2CS on all FEATs)
      let effectAbilityShift = 0;
      if (defenderUuid) {
        try {
          const doc = await fromUuid(defenderUuid);
          const defenderActor = doc?.actor ?? doc ?? null;
          if (defenderActor) {
            effectAbilityShift = getAbilityShift(defenderActor, "endurance");
            effectAbilityShift += Number(defenderActor.system?.combatMods?.selfPenaltyCS) || 0;
          }
        } catch (_e) { /* uuid resolution failed */ }
      }
      
      // Total shift = manual shift + effect shift
      const totalShift = shift + effectAbilityShift;
      const effectiveEndRank = totalShift ? shiftRank(targetEndRank, totalShift) : targetEndRank;

      // Check consolidated chat card setting
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) { /* setting not registered yet */ }

      // Check for skipChatMessage (used in consolidated mode to apply effects without chat)
      const skipChatMessage = this.opts?.skipChatMessage || false;
      
      // Check for preRolledResult (use existing result instead of re-rolling)
      const preRolled = this.opts?.preRolledResult;
      
      let roll, capped, colorLower;
      
      if (preRolled && preRolled.colorLower) {
        // Use pre-rolled result (from inline check for consolidated mode)
        colorLower = preRolled.colorLower;
        capped = preRolled.roll || 50;
        roll = { total: capped };  // Synthetic roll object for compatibility
        debugLog("Using pre-rolled result", { colorLower, capped, preRolled });
      } else {
        // Roll percent normally
        roll = new Roll("1d100");
        await roll.evaluate();
        
        // Show dice animation (skip if using pre-rolled or skipChatMessage)
        if (!this.opts?.skipDice && !skipChatMessage) {
          await showDiceAnimation(roll, actor, `${actionName}: ${targetName} (${effectiveEndRank})`, useConsolidated);
        }
        
        capped = Math.min(100, roll.total);
        colorLower = String(universalColor(effectiveEndRank, capped) || "white").toLowerCase();
      }
      
      // ============================================
      // RETURN RESULT ONLY MODE (for inline embedding)
      // ============================================
      if (this?.opts?.returnResultOnly) {
        // Calculate result data without creating chat messages or applying effects
        if (actionType === "slam") {
          const attackerStrength = prefill.attackerStrength || 30;
          const attackerStrengthRank = prefill.attackerStrengthRank || "Remarkable";
          let slamEffect = "";
          let knockbackDistance = 0;
          
          switch (colorLower) {
            case "white":
              slamEffect = "Grand Slam";
              knockbackDistance = getGrandSlamDistance(attackerStrength);
              break;
            case "green":
              slamEffect = "1 Area";
              knockbackDistance = 1;
              break;
            case "yellow":
              slamEffect = "Stagger";
              break;
            case "red":
              slamEffect = "No Slam";
              break;
          }
          
          return {
            actionType: "slam",
            colorLower,
            slamEffect,
            knockbackDistance,
            attackerStrength,
            attackerStrengthRank,
            targetName,
            roll: roll.total,
            effectiveEndRank,
            defenderUuid,
            effectsSuppressed: false
          };
        }
        
        if (actionType === "stun") {
          let stunDur = null;
          if (colorLower === "white") {
            const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
            const d = new Roll(`1${stunDie}`);
            await d.evaluate();
            stunDur = d.total;
          } else if (colorLower === "green") {
            stunDur = 1;
          }
          
          return {
            actionType: "stun",
            colorLower,
            stunDuration: stunDur,
            targetName,
            roll: roll.total,
            effectiveEndRank,
            defenderUuid,
            effectsSuppressed: false
          };
        }
        
        // For other action types, return generic result
        return {
          actionType,
          colorLower,
          targetName,
          roll: roll.total,
          effectiveEndRank,
          defenderUuid
        };
      }

      // Determine base effect label
      let baseEffect = mapping[colorLower] || color;
      if (actionType === "kill") {
        const ctx = getKillContextFromAttackForm(attackForm);
        baseEffect = resolveKillFeat(colorLower, ctx);
      }

      // Damage-gate: do NOT gate Nullify
      const effectsSuppressed = isSaveNullify
        ? false
        : !canEffectsApply(dmgThrough, {
            borderline,
            ignoreDamageGate: this.opts?.ignoreDamageGate
          });

      // Apply effects according to type
      // STUN
      let stunDuration = null;
      if (actionType === "stun" && !effectsSuppressed) {
        if (colorLower === "white") {
          // Check for pre-rolled stun duration
          if (preRolled && typeof preRolled.stunDuration === 'number') {
            stunDuration = preRolled.stunDuration;
          } else {
            // White = roll for stun duration (configurable die)
            const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
            const d = new Roll(`1${stunDie}`);
            await d.evaluate();
            stunDuration = d.total;
            // Only show separate duration message if NOT consolidated and NOT skipChatMessage
            if (!useConsolidated && !skipChatMessage) {
              await d.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `${targetName} Stun Duration (1${stunDie})`
              });
            }
          }
          await this._createStunnedEffect(defenderUuid, targetName, stunDuration);
        } else if (colorLower === "green") {
          // Green = 1 round
          stunDuration = 1;
          await this._createStunnedEffect(defenderUuid, targetName, 1);
        }
        // Yellow/Red = No effect (no stun applied)
      }

      // SLAM - CORRECTED LOGIC (White = worst, Red = best for defender)
      let slamDetails = null;
      if (actionType === "slam" && !effectsSuppressed) {
        const attackerStrength = prefill.attackerStrength || 30;
        const attackerStrengthRank = prefill.attackerStrengthRank || "Remarkable";
        const attackerName = prefill.attackerName || "Attacker";
        
        // Map color to slam effect (CORRECTED - White is worst for defender)
        let slamEffect = "";
        let knockbackDistance = 0;
        
        switch (colorLower) {
          case "white":
            slamEffect = "Grand Slam";
            knockbackDistance = getGrandSlamDistance(attackerStrength);
            break;
          case "green":
            slamEffect = "1 Area";
            knockbackDistance = 1;
            break;
          case "yellow":
            slamEffect = "Stagger";
            break;
          case "red":
            slamEffect = "No Slam";
            break;
        }

        // Capture for folding into the check card result box
        slamDetails = {
          targetName,
          targetUuid: defenderUuid,
          slamEffect,
          knockbackDistance,
          attackerStrength,
          attackerStrengthRank,
          attackerName,
          colorLower
        };
        
        // _createSlamChatMessage is now a no-op; details fold into _buildCheckCard via slamDetails
        
        // Create the Active Effect
        if (slamEffect !== "No Slam") {
          await this._createSlamEffect(actor, {
            targetUuid: defenderUuid,
            slamEffect,
            knockbackDistance,
            attackerStrength
          }, this.opts);
        }
      }

      // KILL (Endurance Loss → DYING)
      if (actionType === "kill" && !effectsSuppressed) {
        const hasEndLoss = String(baseEffect || "").toLowerCase().includes("endurance");
        if (hasEndLoss) {
          const targetActor = await this._resolveTokenActor(defenderUuid);
          if (targetActor) {
            await Effects.applyDying(targetActor, {
              enduranceValue: targetActor.system?.abilities?.endurance?.value ?? 10
            });
            if (targetActor.system?.origin === "Robot") {
              ui.notifications.warn(`${targetActor.name} is DEACTIVATING — losing structural integrity each round until stabilized or repaired.`);
            } else {
              ui.notifications.warn(`${targetActor.name} is DYING (Endurance steps down each round unless stabilized).`);
            }
          }
        }
      }

      // NULLIFY (NEVER damage-gated)
      // NULLIFY / MENTAL POWER SAVE (NEVER damage-gated)
      if (isSaveNullify) {
        // Prefer the targeted Token's synthetic actor (handles unlinked tokens)
        const saveActor = await this._resolveTokenActor(defenderUuid || (this.opts?.prefill?.targetUuid || ""));
        if (saveActor) {
          let endRank     = targetEndRank;
          let intensityRank = endRank;
          if (this?.opts?.powerRankName) intensityRank = this.opts.powerRankName;
          if (this?.opts?.intensity === "fixed-rank" && this?.opts?.fixedRank) intensityRank = this.opts.fixedRank;

          // ── Mental defense substitution (Psi-Screen / Mental Powers replace Psyche) ──
          const saveAbilityCheck = (this.abilityName || "psyche").toLowerCase();
          const mentalDef = scanMentalDefenses(saveActor, saveAbilityCheck);
          if (mentalDef.source !== "Psyche") {
            endRank = mentalDef.rank;
            console.log(`[FASERIP] Mental save substitution: ${saveActor.name} uses ${mentalDef.source} (${mentalDef.rank}) instead of Psyche`);
          }

          // Check if this is a custom mental power (not nullification)
          const customEffectName = this?.opts?.effectName;
          const customFailMessage = this?.opts?.failMessage;
          const powerName = this?.opts?.powerName || "Mental Power";
          const saveAbility = this.abilityName || "psyche";
          const saveAbilityUpper = saveAbility.toUpperCase();

          if (customEffectName && colorLower === "white") {
            // Custom mental power effect (e.g., Psionic Attack → Unconscious)
            const d = new Roll("1d10");
            await d.evaluate();
            const duration = d.total;
            await d.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `${targetName} ${customEffectName} Duration (1d10)`
            });
            
            // Create custom effect
            await Effects.applyEffect(saveActor, {
              name: customEffectName,
              img: "icons/svg/unconscious.svg",
              rounds: duration,
              originUuid: actor.uuid,
              flags: {
                "msh-faserip": {
                  type: "mental-power",
                  powerName: powerName,
                  sourceUuid: actor.uuid
                },
                meta: {
                  unitLabel: "round",
                  unitLabelPlural: "rounds"
                }
              }
            });
            
            // Chat message
            // Chat message with color-coded result
        const { bg, fg } = bannerColors("white");
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: saveActor }),
          content: `
            <div style="border:1px solid #d32f2f;border-radius:4px;background:#fff;">
              <div style="padding:8px 10px;border-bottom:1px solid #ffcdd2;">
                <div style="color:#c62828;font-weight:700;">${targetName} — ${saveAbilityUpper} FEAT Failed</div>
              </div>
              <div style="padding:8px 10px;">
                <div><strong>Roll:</strong> WHITE (failed)</div>
                <div><strong>Result:</strong> ${customFailMessage} for ${duration} rounds</div>
              </div>
              <div style="text-align:center;padding:8px;margin:6px;background:${bg};color:${fg};font-weight:700;border-radius:4px;">
                ${customEffectName.toUpperCase()} (${duration} ROUNDS)
              </div>
            </div>
          `
        });
            return; // Mental power effect applied, don't create standard card
          } else if (customEffectName) {
            // Custom power but save succeeded - create proper result card
            const effectText = mapping[colorLower] || `${colorLower} - Success`;
            const { bg, fg } = bannerColors(colorLower);
            
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: saveActor }),
              content: `
                <div style="border:1px solid #4caf50;border-radius:4px;background:#fff;">
                  <div style="padding:8px 10px;border-bottom:1px solid #81c784;">
                    <div style="color:#2e7d32;font-weight:700;">${targetName} — ${saveAbilityUpper} FEAT</div>
                  </div>
                  <div style="padding:8px 10px;">
                    <div><strong>Power:</strong> ${powerName}</div>
                    <div><strong>Roll:</strong> ${colorLower.toUpperCase()}</div>
                    <div><strong>Result:</strong> ${effectText}</div>
                  </div>
                  <div style="text-align:center;padding:8px;margin:6px;background:${bg};color:${fg};font-weight:700;border-radius:4px;">
                    ${targetName.toUpperCase()} RESISTED!
                  </div>
                </div>
              `
            });
            return; // Mental power resisted, don't create standard card
          } else {
            // Standard Nullification
            await Nullify.resolveAndApply(actor, saveActor, {
              endRank,
              intensityRank,
              rolledColor: colorLower,
              originUuid: this?.opts?.originUuid ?? null
            });
            return; // Nullify creates its own chat card, don't create standard card
          }
        }
      }

      // Build and post a chat card matching attack card style
      const effectText = (actionType === "kill")
        ? (baseEffect?.label || color)
        : (mapping[colorLower] || color);
      const extraHtml  = this._extraExplanationHtml({
        actionType, targetAbility, colorLower, finalEffect: effectText, effectsSuppressed,
        stunDuration, slamDetails,
        targetIsRobot: (await this._resolveTokenActor(defenderUuid))?.system?.origin === "Robot"
      });

      // Build shift display text
      let shiftDisplay = "";
      if (totalShift !== 0) {
        const parts = [];
        if (shift !== 0) parts.push(`Manual ${shift > 0 ? '+' : ''}${shift}`);
        if (effectAbilityShift !== 0) parts.push(`Effects ${effectAbilityShift > 0 ? '+' : ''}${effectAbilityShift}`);
        shiftDisplay = ` (${parts.join(', ')})`;
      }

      const content = this._buildCheckCard({
        actor, actionType, effectiveEndRank, shiftDisplay,
        roll, colorLower, effectText, effectsSuppressed, extraHtml,
        targetName,
        saveAbility: isSaveNullify ? (this.abilityName || null) : null
      });
      if (!skipChatMessage) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content,
          flags: { [SCOPE()]: { autoChecksDone: true } }
        });
      }
      return;
    } // end auto fast-path

    // ------------------------------
    // MANUAL / SEMI: show a compact dialog
    // ------------------------------
    const _saveAbilityName = isSaveNullify ? (this.abilityName || "endurance") : "endurance";
    const _saveAbilityLabel = _saveAbilityName.charAt(0).toUpperCase() + _saveAbilityName.slice(1);
    const targetRanks = this._rankOptions(prefill.targetEndRank || actor?.system?.abilities?.[_saveAbilityName]?.rank || actor?.system?.abilities?.endurance?.rank || "Good");
    const preDmg = Number(prefill.dmgThrough ?? 0) || 0;
    const html = `
      <div class="frp-dialog" style="min-width:410px;">
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Target Name:</label>
          <input type="text" name="targetName" value="${prefill.targetName||"Target"}" style="width:220px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Target ${_saveAbilityLabel}:</label>
          <select name="targetEndRank" style="width:220px;">${targetRanks}</select>
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Column Shift (on target):</label>
          <input type="number" name="shift" value="${Number(prefill.shift??0)||0}" style="width:70px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Damage penetrated:</label>
          <input type="number" name="dmgThrough" value="${preDmg}" min="0" style="width:90px;">
        </div>
        <div style="margin-bottom:8px;">
          <label><input type="checkbox" name="borderline" ${prefill.borderline ? "checked" : ""}> Borderline (tie still affects)</label>
        </div>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${labelFor(actionType)}: ${actor.name}`,
        content: html,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              const $ = (s) => html.find(s);
              resolve({
                targetName: String($('[name="targetName"]').val() || "Target"),
                targetEndRank: String($('[name="targetEndRank"]').val() || "Good"),
                shift: Number($('[name="shift"]').val() || 0),
                dmgThrough: Number($('[name="dmgThrough"]').val() || 0),
                borderline: !!$('[name="borderline"]').is(':checked'),
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
    if (!choice) return;

    // Include actor's own selfPenaltyCS (e.g. Impaired Endurance -2CS) in the shift
    const _selfPenalty = Number(actor?.system?.combatMods?.selfPenaltyCS) || 0;
    const _totalShift  = choice.shift + _selfPenalty;
    const effectiveEndRank = _totalShift ? shiftRank(choice.targetEndRank, _totalShift) : choice.targetEndRank;
    
    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }
    
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    // Roll is always embedded in the card (no separate roll.toMessage)
    
    const color = (typeof rollUniversalTable === "function")
      ? rollUniversalTable(effectiveEndRank, Math.min(100, roll.total))
      : (game?.msh?.rollUniversalTable?.(effectiveEndRank, Math.min(100, roll.total)) ?? "white");
    const colorLower = String(color || "white").toLowerCase();

    let finalEffect = mapping[colorLower] || color;
    if (actionType === "kill") {
      const ctx = getKillContextFromAttackForm(String(this?.opts?.attackForm || "blunt"));
      finalEffect = resolveKillFeat(colorLower, ctx);
    }

    const effectsSuppressed = !canEffectsApply(choice.dmgThrough, {
      borderline: choice.borderline,
      ignoreDamageGate: this.opts?.ignoreDamageGate
    });

    // Minimal effect application in manual mode (same as auto)
    let manualStunDuration = null;
    if (actionType === "stun" && !effectsSuppressed) {
      if (colorLower === "white") {
        const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
        const d = new Roll(`1${stunDie}`);
        await d.evaluate();
        manualStunDuration = d.total;
        // Only show separate duration message if NOT consolidated
        if (!useConsolidated) {
          await d.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${choice.targetName} Stun Duration (1${stunDie})` });
        }
        await this._createStunnedEffect(this.opts?.prefill?.targetUuid || "", choice.targetName, manualStunDuration);
      } else if (colorLower === "green") {
        manualStunDuration = 1;
        await this._createStunnedEffect(this.opts?.prefill?.targetUuid || "", choice.targetName, 1);
      }
    }

    let manualSlamDetails = null;
    if (actionType === "slam" && !effectsSuppressed) {
      // Manual path - map color to slam effect (same logic as auto path)
      const prefill = this.opts?.prefill || {};
      const attackerStrength = prefill.attackerStrength || 30;
      const attackerStrengthRank = prefill.attackerStrengthRank || "Remarkable";
      const attackerName = prefill.attackerName || "Attacker";
      let slamEffect = "";
      let knockbackDistance = 0;
      
      switch (colorLower) {
        case "white":
          slamEffect = "Grand Slam";
          knockbackDistance = getGrandSlamDistance(attackerStrength);
          break;
        case "green":
          slamEffect = "1 Area";
          knockbackDistance = 1;
          break;
        case "yellow":
          slamEffect = "Stagger";
          break;
        case "red":
          slamEffect = "No Slam";
          break;
      }

      manualSlamDetails = {
        targetName: choice.targetName || "Target",
        targetUuid: prefill.targetUuid || "",
        slamEffect,
        knockbackDistance,
        attackerStrength,
        attackerStrengthRank,
        attackerName,
        colorLower
      };
      
      if (slamEffect !== "No Slam") {
        await this._createSlamEffect(actor, {
          targetUuid: prefill.targetUuid || "",
          slamEffect,
          knockbackDistance,
          attackerStrength
        }, this.opts);
      }
    }

    if (actionType === "kill" && !effectsSuppressed) {
      const _txt = (typeof finalEffect === "string" ? finalEffect : finalEffect?.label) || "";
      const hasEndLoss = _txt.toLowerCase().includes("endurance");
      if (hasEndLoss) {
        const targetActor = await this._resolveTokenActor(this.opts?.prefill?.targetUuid || "");
        if (targetActor) {
          await Effects.applyDying(targetActor, {
            enduranceValue: targetActor.system?.abilities?.endurance?.value ?? 10
          });
          if (targetActor.system?.origin === "Robot") {
            ui.notifications.warn(`${targetActor.name} is DEACTIVATING — losing structural integrity each round until stabilized or repaired.`);
          } else {
            ui.notifications.warn(`${targetActor.name} is DYING (Endurance steps down each round unless stabilized).`);
          }
        }
      }
    }

    // ── Mental Power Save (save-nullify with custom effect, e.g. Psionic Attack → Unconscious) ──
    let mentalPowerExtraHtml = "";
    if (isSaveNullify && this?.opts?.effectName) {
      const customEffectName  = this.opts.effectName;
      const customFailMessage = this.opts.failMessage || "is affected";
      const powerName         = this.opts.powerName || "Mental Power";
      const saveAbilityLabel  = (this.abilityName || "psyche").charAt(0).toUpperCase() + (this.abilityName || "psyche").slice(1);

      if (colorLower === "white") {
        // Failed save — roll duration and apply effect
        const d = new Roll("1d10");
        await d.evaluate();
        const duration = d.total;

        // Apply the effect to the target
        const targetUuid = this.opts?.prefill?.targetUuid || choice.targetUuid || "";
        const saveActor = await this._resolveTokenActor(targetUuid);
        if (saveActor) {
          await Effects.applyEffect(saveActor, {
            name: customEffectName,
            img: "icons/svg/unconscious.svg",
            rounds: duration,
            originUuid: actor.uuid,
            flags: {
              "msh-faserip": {
                type: "mental-power",
                powerName: powerName,
                sourceUuid: actor.uuid
              },
              meta: { unitLabel: "round", unitLabelPlural: "rounds" }
            }
          });
        }

        mentalPowerExtraHtml = `<div style="margin-top:6px;color:#c62828;font-weight:bold;">
          ${choice.targetName || "Target"} ${customFailMessage} for ${duration} rounds (1d10 = ${duration})
        </div>`;
      } else {
        // Resisted
        mentalPowerExtraHtml = `<div style="margin-top:6px;color:#2e7d32;font-weight:bold;">
          ${choice.targetName || "Target"} resists ${powerName}!
        </div>`;
      }
    }

    const effectText = (actionType === "kill") ? (finalEffect?.label ?? "No Effect") : finalEffect;
    const baseExtraHtml = this._extraExplanationHtml({
      actionType, targetAbility, colorLower, finalEffect: effectText, effectsSuppressed,
      stunDuration: manualStunDuration,
      slamDetails: manualSlamDetails,
      targetIsRobot: (await this._resolveTokenActor(this.opts?.prefill?.targetUuid || ""))?.system?.origin === "Robot"
    });
    const extraHtml = (baseExtraHtml || "") + mentalPowerExtraHtml;
    const shiftDisplay = choice.shift ? ` (${choice.shift > 0 ? '+' : ''}${choice.shift}CS)` : '';

    const content = this._buildCheckCard({
      actor, actionType, effectiveEndRank, shiftDisplay,
      roll, colorLower, effectText, effectsSuppressed, extraHtml,
      targetName: choice.targetName || prefill.targetName || null,
      saveAbility: isSaveNullify ? (this.abilityName || null) : null
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
  }

  /** Prefer a Token's synthetic actor (unlinked tokens) over the base Actor */
  async _resolveTokenActor(targetUuid) {
    let doc = null;
    try { if (targetUuid) doc = await fromUuid(targetUuid); } catch {}

    // If UUID is a TokenDocument → use its synthetic actor
    if (doc?.documentName === "Token") {
      return doc.actor ?? null;
    }

    // If UUID is an Actor → try to find the currently targeted token for that Actor
    if (doc?.documentName === "Actor") {
      const sel = game.user?.targets?.first?.();
      if (sel?.actor && sel.actor.id === doc.id) return sel.actor;

      // Fallback: if exactly one scene token references this Actor, use its synthetic actor
      const matches = canvas.tokens?.placeables?.filter(t => t?.actor && t.actor.id === doc.id) ?? [];
      if (matches.length === 1) return matches[0].actor;

      // Last resort: return the base Actor (linked tokens case)
      return doc;
    }

    // No UUID or unknown doc — if exactly one target is selected, use that
    if (game.user?.targets?.size === 1) {
      return game.user.targets.first()?.actor ?? null;
    }
    return null;
  }

  // ---------- helpers ----------

  async _createStunnedEffect(targetUuid, targetName, rounds=1) {
    const targetActor = await this._resolveTokenActor(targetUuid);
    if (!targetActor) return;
    await Effects.applyStun(targetActor, { rounds }, this.opts || {});
    ui.notifications.info(`${targetName || targetActor.name}: Stunned for ${rounds} round${rounds>1?"s":""}.`);
  }

  _strengthToAreas(rankName) {
    // Grand Slam: attacker Strength taken as ground speed (Speed rank table)
    // Same mapping as getGrandSlamDistance but by rank name instead of value
    const table = {
      "Shift-0": 0, "Feeble": 1, "Poor": 2, "Typical": 3, "Good": 4,
      "Excellent": 5, "Remarkable": 6, "Incredible": 7, "Amazing": 8,
      "Monstrous": 9, "Unearthly": 10, "Shift-X": 12, "Shift-Y": 14,
      "Shift-Z": 16, "Class 1000": 32, "Class 3000": 50, "Class 5000": 100
    };
    return table[rankName] || 3;
  }

  async _createSlamEffect(actor, options, opts = {}) {
    const { targetUuid, slamEffect, knockbackDistance, attackerStrength } = options;
    const targetActor = await this._resolveTokenActor(targetUuid);
    if (!targetActor) return;
    
    // Use centralized applySlam which handles duplicate checking
    await Effects.applySlam(targetActor, {
      kind: slamEffect,
      knockbackAreas: knockbackDistance || 0,
      prone: (slamEffect === "Grand Slam" || slamEffect === "1 Area"),
      stagger: (slamEffect === "Stagger")
    }, opts);
  }

  _buildCheckCard({ actor, actionType, effectiveEndRank, shiftDisplay, roll, colorLower, effectText, effectsSuppressed, extraHtml, targetName = null, saveAbility = null }) {
    const { bg, fg } = bannerColors(colorLower);
    const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
    const displayName = targetName || actor.name;

    // Use save ability for mental power saves, else default to Endurance
    const abilityLabel = saveAbility
      ? (saveAbility.charAt(0).toUpperCase() + saveAbility.slice(1))
      : "Endurance";
    const actionLabel = saveAbility && saveAbility !== "endurance"
      ? `${abilityLabel} SAVE`
      : labelFor(actionType).toUpperCase();
    const headerRight = `${abilityLabel} FEAT`;

    const resultBox = (effectsSuppressed || extraHtml) ? `
      <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
        ${effectsSuppressed ? '<div style="color:#b71c1c;">No damage penetrated — effect suppressed.</div>' : ''}
        ${extraHtml || ''}
      </div>` : '';

    return `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">${actionLabel}</strong>
          <span style="color:#666;font-weight:normal;font-size:.85em;">${headerRight}</span>
        </div>
        <div style="padding:4px 10px;font-size:.95em;"><strong>${displayName}</strong></div>
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>${abilityLabel}: ${effectiveEndRank}${shiftDisplay}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span>Roll: ${rollBox}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${colorLower.toUpperCase()} — ${String(effectText).toUpperCase()}
            </span>
          </div>
        </div>
        ${resultBox}
      </div>
    `;
  }

  _extraExplanationHtml({ actionType, targetAbility, colorLower, finalEffect, effectsSuppressed, stunDuration=null, slamDetails=null, targetIsRobot=false }) {
    if (actionType === "stun") {
      let stunText = "";
      if (colorLower === "white") {
        const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
        if (stunDuration !== null) {
          if (game.user.isGM) {
            stunText = `Stunned <strong title="Rolled 1${stunDie}">${stunDuration}</strong> round${stunDuration !== 1 ? 's' : ''}.`;
          } else {
            stunText = `Stunned — knocked out for multiple rounds.`;
          }
        } else {
          stunText = `Stunned - roll 1${stunDie} for duration.`;
        }
      } else if (colorLower === "green") {
        stunText = "Stunned 1 round - no actions next round.";
      } else {
        stunText = "No effect.";
      }
      return `<div style="margin-top:8px;color:#444;">${stunText}</div>`;
    }

    if (actionType === "slam") {
      if (effectsSuppressed) {
        return `<div style="margin-top:8px;color:#b71c1c;">No damage penetrated — Slam does not apply.</div>`;
      }
      // If full slam details available (from prefill), use rich HTML; else fall back to brief note
      if (slamDetails) {
        return this._slamDetailHtml(slamDetails);
      }
      const strRank = targetAbility?.rank || "Typical";
      const areas   = this._strengthToAreas(strRank);
      const notes = {
        white: `Grand Slam — knocked away up to ~${areas} areas; prone.`,
        green: `Knockback 1 area; prone.`,
        yellow:`Stagger — no longer adjacent, fully capable next round.`,
        red:   `No Slam — target resists.`
      };
      return `<div style="margin-top:8px;color:#444;">${notes[colorLower]||""}</div>`;
    }
    if (actionType === "kill") {
      const effectStr = String(finalEffect||"").replace(/E\/S/,"Edged/Shooting");
      const isLethal = effectStr.toLowerCase().includes("endurance");
      let karmaNote = "";
      if (isLethal && targetIsRobot) {
        karmaNote = `<div style="margin-top:6px;padding:4px 8px;background:#e3f2fd;border:1px solid #90caf9;border-radius:3px;font-size:.85em;color:#1565c0;">Target is a Robot/construct — no Karma loss for attacker.</div>`;
      } else if (isLethal) {
        karmaNote = `<div style="margin-top:6px;padding:4px 8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:.85em;color:#e65100;">Attacker loses ALL Karma if target dies</div>`;
      }
      return `<div style="margin-top:8px;color:#444;">${effectStr}</div>${karmaNote}`;
    }
    return "";
  }

  async _createSlamChatMessage(options) {
    // Deprecated: slam detail now folded into the check card via _slamDetailHtml().
    // This method is kept as a no-op so existing call sites don't throw.
  }

  _slamDetailHtml({ targetName, targetUuid, slamEffect, knockbackDistance, attackerStrength, attackerStrengthRank, attackerName }) {
    if (slamEffect === "Grand Slam") {
      return `
        <div style="margin-top:6px;">
          <strong>Grand Slam</strong> — ${targetName} launched ${knockbackDistance} area${knockbackDistance !== 1 ? 's' : ''} away at ${attackerStrengthRank} (${attackerStrength}) speed.
          <div style="color:#666;font-size:.9em;margin-top:2px;">${attackerName} chooses direction (if damage dealt). Collision damage applies if target hits obstacle.</div>
          <div style="margin-top:6px;">
            <button class="calculate-slam-collision"
                    data-target="${targetUuid}"
                    data-distance="${knockbackDistance}"
                    data-speed="${knockbackDistance}"
                    data-attacker-strength="${attackerStrength}"
                    style="background:#8b0000;color:white;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:.85em;">
              Calculate Collision Damage
            </button>
          </div>
        </div>`;
    }
    if (slamEffect === "1 Area") {
      return `
        <div style="margin-top:6px;">
          <strong>Slam — 1 Area</strong> — ${targetName} knocked back 1 area.
          <div style="color:#666;font-size:.9em;margin-top:2px;">${attackerName} chooses direction (if damage dealt); target chooses (if no damage). Collision damage applies if hitting obstacle.</div>
          <div style="margin-top:6px;">
            <button class="calculate-slam-collision"
                    data-target="${targetUuid}"
                    data-distance="1"
                    data-speed="1"
                    data-attacker-strength="${attackerStrength}"
                    style="background:#8b0000;color:white;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:.85em;">
              Calculate Collision Damage
            </button>
          </div>
        </div>`;
    }
    if (slamEffect === "Stagger") {
      return `
        <div style="margin-top:6px;">
          <strong>Stagger</strong> — ${targetName} pushed back but not adjacent. No movement penalty; no damage; combat continues next round.
        </div>`;
    }
    // No Slam
    return `<div style="margin-top:6px;"><strong>No Slam</strong> — ${targetName} resists, remains in position.</div>`;
  }

} // end class