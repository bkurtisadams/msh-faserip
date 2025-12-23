// attack-action.js v1.8.0 - 2025-12-22
// v1.8.0: Compact chat card layout - result badge in header, removed grid, inline damage display
// v1.7.0: Integrate effect modifiers system for combat penalties
// v1.6.1: Add debug logging for multi-attack FEAT auto-success diagnosis
// v1.6.0: Fix auto-trigger of Slam/Stun/Kill checks in full auto mode
// v1.5.x: Previous version without auto-trigger
import { BaseAction } from "./base-action.js";
// NOTE: resolveCombatMode imported dynamically to avoid circular dependency
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";

import { 
  RANKS, getStrengthInfo, shiftRank, getAbilityInfo,
  rollWithKarmaAndHistory, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets,
  debugLog, universalColor, buildInlineRollDisplay, buildInlineFeatDisplay
} from "./action-utils.js";
//import { rollUniversalTable } from "../dice/universal-table.js";
import { buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { ACTION_LABELS } from "./action-config.js";
import { ACTION_EFFECTS } from "./action-config.js";
import { SCOPE, getFlagScope } from "./flags.js";
import { getAttackShift, getDefenseShift, canActorAct, getModifierSummary } from "../effects/effect-modifiers.js";


export class AttackAction extends BaseAction {
  constructor(args) {
    super(args);
    this.src = "hands";     // hands | weapon | natural
    this.pulled = false;
  }

  // attack-action.js (base class)
  getTargetCount() {
    const t = this.targets;
    if (Array.isArray(t)) return t.length;
    if (t && typeof t.size === "number") return t.size; // Set/Map (e.g., User.targets)
    // last resort: live selection
    return Number(game?.user?.targets?.size ?? 1);
  }

  /** First selected token, honoring an override if present */
  _selectPrimaryTarget() {
    const arr = Array.isArray(this?.targets)
      ? this.targets
      : Array.from(game?.user?.targets ?? []);
    return arr[0] ?? null;
  }

  _computeEffectiveRank(baseRank, columnShift=0) {
    return shiftRank(baseRank, columnShift);
  }

  _getAbilityTriplet() {
    const ab = getAbilityInfo(this.actor, this.abilityName);
    const colShift = Number(this.opts.shift ?? 0);
    const effectiveRank = this._computeEffectiveRank(ab.rank, colShift);
    return { base: ab, effectiveRank, columnShift: colShift };
  }

  _getStrength() { return getStrengthInfo(this.actor); }

  async _rollFightingFeat(actor, fightingAbility, intensity, attackCount) {
    // RAW: Auto when Ability ≥ Intensity + 4 ranks (diff >= 4)
    // Optional "Impossible": when Intensity ≥ Ability + 2 ranks (diff <= -2)
    const AUTO_DIFF = 4;

    // Toggle this to enable (RAW optional). If disabled, nothing is "impossible";
    // the required color rule applies (e.g., Red-only).
    const USE_IMPOSSIBLE = true;
    const IMPOSSIBLE_DIFF = -2;

    const availableKarma = actor.system.karma.value || 0;
    
    // Get intensity rank value for comparison
    const intensityIndex = RANKS.indexOf(intensity);
    const fightingIndex  = RANKS.indexOf(fightingAbility.rank);
    const diff = fightingIndex - intensityIndex;

    // Debug logging for multi-attack FEAT
    console.log("[FASERIP] _rollFightingFeat check:", {
      actorName: actor?.name,
      fightingRank: fightingAbility?.rank,
      fightingIndex,
      intensity,
      intensityIndex,
      diff,
      AUTO_DIFF,
      willAutoSucceed: diff >= AUTO_DIFF,
      RANKS_sample: RANKS.slice(0, 12)
    });

    if (diff >= AUTO_DIFF) {
      console.log("[FASERIP] Multi-attack FEAT: AUTOMATIC SUCCESS (diff >= 4)");
      return { success: true, intensity, roll: null, totalRoll: null, resultColor: "AUTO", cancelled: false, auto: true };
    }
    if (USE_IMPOSSIBLE && diff <= IMPOSSIBLE_DIFF) {
      return { success: false, intensity, roll: null, totalRoll: null, resultColor: "IMPOSSIBLE", cancelled: false, auto: false };
    }

    if (diff <= IMPOSSIBLE_DIFF) {
      // Impossible under standard rules (no roll)
      return {
        success: false,
        intensity,
        roll: null,
        totalRoll: null,
        resultColor: "IMPOSSIBLE",  // sentinel for UI/logging
        cancelled: false,
        auto: false
      };
    }

    // otherwise fall through to the normal roll path

    
    // In Full Auto mode, skip dialog and roll automatically with 0 karma
    if (this.opts?.autoApply === true) {
      const roll = await (new Roll("1d100")).evaluate();
      const totalRoll = roll.total;
      
      const effFeatRank = shiftRank(fightingAbility.rank, this.opts?.featCs ?? 0);
      const resultColor = game.msh.rollUniversalTable(effFeatRank, totalRoll);
      const colorLower = resultColor.toLowerCase();
      
      // Determine success based on FEAT intensity comparison rules
      let success = false;
      if (fightingIndex > intensityIndex) {
        success = ["green", "yellow", "red"].includes(colorLower);
      } else if (fightingIndex === intensityIndex) {
        success = ["yellow", "red"].includes(colorLower);
      } else {
        success = colorLower === "red";
      }
      
      // Check if using consolidated chat cards
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) { /* setting not registered yet */ }
      
      // Only show separate messages if NOT using consolidated mode
      if (!useConsolidated) {
        // Show result in chat (auto-rolled)
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `Multiple Attack FEAT: ${intensity} (Auto-rolled)`,
        });
        
        const bgColor = success ? "#e8f5e9" : "#ffebee";
        const borderColor = success ? "#4caf50" : "#f44336";
        const textColor = success ? "#2e7d32" : "#d32f2f";
        
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:3px; padding:8px; margin:5px 0;">
              <div style="color:${textColor}; font-weight:bold; margin-bottom:5px;">
                Multiple Attack FEAT - ${success ? "SUCCESS" : "FAILED"} (Full Auto)
              </div>
              <div style="font-size:0.9em;">
                <div>Fighting: ${fightingAbility.rank} vs Intensity: ${intensity}</div>
                <div>Roll: ${roll.total}</div>
                <div>Result: <strong>${resultColor.toUpperCase()}</strong></div>
                <div style="margin-top:5px; font-style:italic;">
                  ${success 
                    ? `${attackCount} attacks at -1CS each` 
                    : `FEAT failed: Only 1 attack at -3CS`}
                </div>
              </div>
            </div>
          `
        });
      }
      
      return { success, intensity, roll, totalRoll, resultColor, cancelled: false };
    }
    
    // Manual/Semi mode: show dialog
    // Determine required color based on FEAT rules (with auto/impossible)
    let requiredColor;
    {
      const d = fightingIndex - intensityIndex;
      if (d >= AUTO_DIFF)                         requiredColor = "Automatic (no roll)";
      else if (USE_IMPOSSIBLE && d <= IMPOSSIBLE_DIFF) requiredColor = "Impossible (fails)";
      else if (d > 0)                             requiredColor = "Green or better";
      else if (d === 0)                           requiredColor = "Yellow or better";
      else                                        requiredColor = "Red only";
    }
    
    const dialogContent = `
      <div style="text-align: center; padding: 10px;">
        <h3>${actor.name} - Multiple Attack FEAT</h3>
        <p>Attempting <strong>${attackCount} attacks</strong> requires a Fighting FEAT roll.</p>
        <div style="margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
          <p><strong>Fighting Rank:</strong> ${fightingAbility.rank} (${fightingAbility.value})</p>
          <p><strong>Intensity:</strong> ${intensity}</p>
          <p><strong>Required Result:</strong> ${requiredColor}</p>
        </div>
        <hr style="margin: 10px 0;">
        <div style="margin-top: 10px;">
          ${generateKarmaControlsHTML(actor, 0)}

          <div style="margin-top: 10px;">
          <label style="display: block; margin-bottom: 5px;">Column Shift (CS):</label>
          <input type="number" id="multi-feat-cs" value="0" min="-10" max="10" step="1"
                style="width: 60px; padding: 4px; text-align:center; border:1px solid #bbb; border-radius:4px;">
          <span style="margin-left: 8px; font-size: 0.9em; color: #666;">
            (from talents / powers / equipment)
          </span>

        </div>

        </div>
      </div>
    `;
    
    return new Promise((resolve) => {
      new Dialog({
        title: `Multiple Attack FEAT (${attackCount} attacks)`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll FEAT",
            callback: async (html) => {
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const cs = Number(html.find('#multi-feat-cs').val() || 0);
              
              const roll = await (new Roll("1d100")).evaluate();
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `Multiple Attack FEAT: ${intensity}`,
              });
              
              const effFeatRank = shiftRank(fightingAbility.rank, cs);
              let totalRoll = roll.total;
              
              // Apply karma if spending
              if (spendKarma && karmaToSpend > 0) {
                totalRoll = Math.min(100, totalRoll + karmaToSpend);
                // Deduct karma
                const currentKarma = actor.system.karma.value || 0;
                const newKarma = Math.max(0, currentKarma - karmaToSpend);
                await actor.update({ "system.karma.value": newKarma });
              }
              
              const resultColor = game.msh.rollUniversalTable(effFeatRank, totalRoll);
              const colorLower = resultColor.toLowerCase();
              
              // Determine success based on FEAT intensity comparison rules
              let success = false;
              if (fightingIndex > intensityIndex) {
                success = ["green", "yellow", "red"].includes(colorLower);
              } else if (fightingIndex === intensityIndex) {
                success = ["yellow", "red"].includes(colorLower);
              } else {
                success = colorLower === "red";
              }
              
              // Check if using consolidated chat cards
              let useConsolidated = false;
              try {
                useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
              } catch (_e) { /* setting not registered yet */ }
              
              // Only post separate chat result if NOT using consolidated mode
              if (!useConsolidated) {
                const bgColor = success ? "#e8f5e9" : "#ffebee";
                const borderColor = success ? "#4caf50" : "#f44336";
                const textColor = success ? "#2e7d32" : "#d32f2f";
                
                await ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({ actor }),
                  content: `
                    <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:3px; padding:8px; margin:5px 0;">
                      <div style="color:${textColor}; font-weight:bold; margin-bottom:5px;">
                        Multiple Attack FEAT - ${success ? "SUCCESS" : "FAILED"}
                      </div>
                      <div style="font-size:0.9em;">
                        <div>Fighting: ${fightingAbility.rank}${cs ? ` (${cs > 0 ? '+' : ''}${cs}CS → ${effFeatRank})` : ''} vs Intensity: ${intensity}</div>
                        <div>Roll: ${roll.total}${karmaToSpend ? ` + ${karmaToSpend} Karma = ${totalRoll}` : ''}</div>
                        <div>Result: <strong>${resultColor.toUpperCase()}</strong></div>
                        <div style="margin-top:5px; font-style:italic;">
                          ${success 
                            ? `${attackCount} attacks at -1CS each` 
                            : `FEAT failed: Only 1 attack at -3CS`}
                        </div>
                      </div>
                    </div>
                  `
                });
              }
              
              resolve({ success, intensity, roll, totalRoll, resultColor, cancelled: false });
            }
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve({ success: false, cancelled: true })
          }
        },
        default: "roll",
        render: (html) => {
          setupKarmaControlHandlers(html);
        }
      }).render(true);
    });
  }

  /**
   * Core single-attack execution used by all attack types.
   * Handles roll, damage calc, chat card, and optional auto-apply.
   */
  async _executeSingleAttack({
    choice,
    actor,
    ability,
    actionType,
    actionName,
    effects,
    damageType = "physical-blunt",
    rawDamage = 0,
    damageNote = "",
    sourceName = "Attack",
    attackForm = "blunt",
    breakingFeat = null,
    targetCount = 1
  }) {
    // === EARLY WEAPON CHECK: Abort if firearm is empty ===
    const weapon = choice?.weapon ?? null;

    if (weapon?.system) {
      const sys = weapon.system;
      const isFirearm =
        String(sys.weaponType || "").toLowerCase() === "firearm" ||
        String(sys.weaponType || "").toLowerCase() === "shooting" ||
        String(actionType).toLowerCase() === "shooting";

      if (isFirearm) {
      // Parse first numeric in a value
      const toNum = (v) => {
        if (v == null || v === "") return NaN;
        if (typeof v === "number") return v;
        const m = String(v).match(/-?\d+(\.\d+)?/);
        return m ? Number(m[0]) : NaN;
      };

      // Find first valid ammo field
      const current = [
        sys.ammo?.current,
        sys.ammo?.value,
        sys.shotsRemaining,
        sys.shots,
        sys.uses?.value,
        sys.clip,
        sys.magazine
      ].map(v => toNum(v)).find(n => Number.isFinite(n));

      if (Number.isFinite(current) && current <= 0) {
          // ─── PLAY EMPTY-CLICK SFX ───
          const CLICK_SFX = "systems/msh-faserip/audio/sfx/weapon-empty.mp3";
          try {
            if (game.msh?.playCombatSFX) {
              await game.msh.playCombatSFX({
                item: weapon,
                actionType: "shooting",
                outOfAmmo: true,
                sourceName: weapon?.name ?? "Weapon (empty)"
              });
            }
          } catch (e) {
            console.warn("FASERIP | Could not play empty click SFX:", e);
          }

          ui.notifications?.warn(`${weapon?.name ?? "Weapon"}: out of ammo`);

          // (Optional) small chat card so players see the click in the log
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background:#fff;border:1px solid #bbb;border-radius:3px;padding:6px 8px;">
                <b>${actor.name}</b> pulls the trigger — <i>click!</i> <span style="color:#888">(empty)</span>
              </div>
            `
          });

          return; // abort this attack before any rolls/effects
        }
      }
    }
    // ANCHOR: early-weapon-resolve

    const actionLabel = `${actionName}${targetCount > 1 ? ` (${targetCount} targets)` : ''}`;

    // === EFFECT MODIFIERS: Apply attack/defense shifts from active effects ===
    const attackerMods = canActorAct(actor);
    if (!attackerMods.canAct) {
      ui.notifications?.warn(`${actor.name}: ${attackerMods.reason}`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background:#fff;border:1px solid #e57373;border-radius:3px;padding:6px 8px;">
            <b>${actor.name}</b> cannot act — ${attackerMods.reason}
          </div>
        `
      });
      return; // abort attack
    }
    
    // Get attacker's attack shift from effects
    const attackerShift = getAttackShift(actor);
    
    // Get defender's defense shift (if single target)
    let defenderShift = 0;
    const primaryTarget = this._selectPrimaryTarget();
    const defenderActor = primaryTarget?.actor ?? null;
    if (defenderActor) {
      // Check if ranged attack for prone modifier
      const isRanged = ["shooting", "energy", "force"].includes(attackForm.toLowerCase());
      defenderShift = getDefenseShift(defenderActor, isRanged);
    }
    
    // Total effect shift (attacker bonus + defender penalty)
    // Positive defenderShift = harder to hit, so we subtract it
    const effectShift = attackerShift - defenderShift;

    // Apply column shift (manual + effect modifiers)
    let effectiveRank = ability.rank;
    const manualShift = choice.shift || 0;
    const totalShift = manualShift + effectShift;
    if (totalShift) effectiveRank = shiftRank(effectiveRank, totalShift);
    
    // Log effect modifier application
    if (effectShift !== 0) {
      debugLog("Effect modifiers applied to attack:", {
        attacker: actor.name,
        attackerShift,
        defender: defenderActor?.name || "none",
        defenderShift,
        totalEffectShift: effectShift,
        manualShift,
        finalShift: totalShift
      });
    }

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    // Roll + karma (two-phase system: spendKarma flag triggers decision dialog after roll)
    // inlineRoll suppresses separate roll chat message when consolidated is enabled
    const { roll, cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(
      actor, actionLabel, choice.karma || 0, null,
      { spendKarma: choice.spendKarma, rank: effectiveRank, skipDice: choice.skipDice, inlineRoll: useConsolidated }
    );

    // Build inline roll display if consolidated mode is enabled
    const inlineRollHtml = useConsolidated ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal) : "";

    // Check if manual mode -- return if true
    const isManualMode = this.opts?.mode === "manual";
    
    // Continue with normal resolution for Semi/Full modes...
    // Resolve color (always, even in manual mode)
    //let color = rollUniversalTable(effectiveRank, cappedTotal);
    //const colorLower = String(color || "white").toLowerCase();
    // Resolve color (always, even in manual mode)
    let color = universalColor(effectiveRank, cappedTotal);
    const colorLower = String(color || "white").toLowerCase();

    // Apply result cap if pulling punch
    if (choice.resultCap && choice.resultCap !== 'none') {
      const capOrder = ['white', 'green', 'yellow', 'red'];
      const currentIndex = capOrder.indexOf(colorLower);
      const capIndex = capOrder.indexOf(choice.resultCap);
      if (currentIndex > capIndex) {
        color = choice.resultCap;
      }
    }

    const effectResult = effects[colorLower] || color;
    const { bg, fg } = bannerColors(colorLower);
    const isHit = colorLower !== 'white';

    // Create a chat card for each target
    let targetList;
    if (choice?.specificTarget) {
      // Single specific target (for multi-attack distribution)
      targetList = [choice.specificTarget];
    } else {
      // All currently selected targets
      const selected = Array.from(game.user?.targets ?? []);
      targetList = selected.length > 0 ? selected : [null]; // null for untargeted attacks
    }

    debugLog("FASERIP | _executeSingleAttack targetList:", targetList?.map(t => t?.name ?? "untargeted"));

    for (const target of targetList) {
      const targetActor = target?.actor;
      const targetName = target?.name || "Unknown Target";

      // Calculate armor and penetrating damage for this specific target
     let penetratingDamage = 0;
     if (isHit && rawDamage > 0) {
       if (targetActor) {
         const armorData = getBodyArmorValues(targetActor, damageType);
         // Ensure numbers whether rawDamage arrived as "20" or 20
         const rd = Number(rawDamage) || 0;
         const ap = Number(armorData?.applicable) || 0;
         penetratingDamage = Math.max(0, rd - ap);
       } else {
         penetratingDamage = Number(rawDamage) || 0;
         }
       }

      // Apply damage cap from pull punch
      if (choice.pulledDamage > 0 && choice.pulledDamage < penetratingDamage) {
        penetratingDamage = choice.pulledDamage;
      }

      const afterArmor = penetratingDamage;

      // Calculate breaking feat for this attack
      const currentBreakingFeat = (colorLower !== "white" && penetratingDamage > 0 && breakingFeat)
        ? breakingFeat
        : null;

      // Build actions box ONLY if not manual mode
      // Follow-ups must match the Universal Table per action type.
      //  • Blunt/Charging:  Yellow→Slam, Red→Stun
      //  • Edged/Throwing-Edged: Yellow→Stun, Red→Kill (Kill handled elsewhere)
      //  • Shooting/Energy: Yellow→Bullseye (no Slam/Stun), Red→Kill
      //  • Force:           Yellow→Bullseye (no Slam),   Red→Stun
      //  • Throwing-Blunt:  Yellow→Hit (no follow-up),   Red→Stun
      let showSlam = false;
      let showStun = false;
      let showKill = false;

      switch (String(actionType)) {
        case "blunt-attack":
        case "charging":
          showSlam = (colorLower === "yellow");
          showStun = (colorLower === "red");
          break;

        case "edged-attack":
        case "throwing-edged":
          showStun = (colorLower === "yellow");
          showKill = (colorLower === "red");    // ← Kill on red
          break;

        case "shooting":
        case "energy":
          // Yellow = Bullseye → no Slam/Stun check; Red = Kill
          showKill = (colorLower === "red");    // ← Kill on red
          break;

        case "force":
          // Yellow = Bullseye → no Slam; Red = Stun
          showStun = (colorLower === "red");
          break;

        case "throwing-blunt":
          // Yellow = Hit; Red = Stun
          showStun = (colorLower === "red");
          break;

        default:
          // No generic follow-ups
          break;
      }

      // Calculate autoSave before using it
      const { resolveCombatMode } = await import("./action-dispatcher.js");
      const autoSave = (typeof resolveCombatMode === "function" && targetActor)
        ? (resolveCombatMode(targetActor) === "full")
        : false;

      const actions = (!isManualMode && isHit && canEffectsApply(penetratingDamage) && targetActor)
        ? buildActionsBox({
            showSlam,
            showStun,
            showKill,
            pulled: choice.resultCap !== 'none' || (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage),
            breakingFeat: currentBreakingFeat,
            actorUuid: actor.uuid,
            targetUuid: target?.document?.uuid ?? target?.actor?.uuid,
            damage: Number(penetratingDamage) || 0,
            prefill: { dmgThrough: Number(penetratingDamage) || 0 },
            attackForm,
            damageType,
            bypassArmor: choice.bypassArmor || false,
            autoApply: !!this.opts?.autoApply,
            autoSave: false,  // prevent chat button duplicates
          })
        : "";

      // Build pull punch indicator (compact)
      let pullPunchNote = "";
      if (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage) {
        pullPunchNote += `<span style="color:#ff6f00;font-size:.85em;"> (pulled to ${choice.pulledDamage})</span>`;
      }
      if (choice.resultCap && choice.resultCap !== 'none') {
        pullPunchNote += `<span style="color:#ff6f00;font-size:.85em;"> (capped at ${choice.resultCap})</span>`;
      }

      // Build inline FEAT display if multi-attack FEAT was performed and consolidated mode is enabled
      const multiAttackFeatHtml = (useConsolidated && choice?.multiAttackFeatResult) 
        ? buildInlineFeatDisplay(
            choice.multiAttackFeatResult, 
            `Multi-Attack FEAT (${choice.multiAttackFeatResult.attackCount} attacks)`
          )
        : "";

      // Build compact shift display
      let shiftDisplay = "";
      if (totalShift !== 0) {
        shiftDisplay = ` (${totalShift > 0 ? '+' : ''}${totalShift}CS → ${effectiveRank})`;
      }

      // Build compact roll display: "Roll: 57 (42 + 15 karma)" or "Roll: 42"
      const rollDisplay = totalKarmaUsed 
        ? `${cappedTotal} <span style="color:#666;" title="d100 = ${roll.total}, karma = ${totalKarmaUsed}">(${roll.total} + ${totalKarmaUsed} karma)</span>`
        : `<span title="d100 = ${roll.total}">${roll.total}</span>`;

      // Get target armor info for display
      let armorDisplay = "";
      if (isHit && targetActor) {
        const armorData = getBodyArmorValues(targetActor, damageType);
        const armorValue = Number(armorData?.applicable) || 0;
        if (armorValue > 0) {
          armorDisplay = ` <span style="color:#666;">(vs ${armorValue} armor)</span>`;
        }
      }

      // Add manual mode notice if applicable
      const manualModeNotice = isManualMode ? `
        <div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
          Manual Mode: GM adjudicates
        </div>
      ` : "";

      // Compact chat card
      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <!-- Header: Action + Result badge -->
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
            <strong style="color:#8b0000;">${actionLabel.toUpperCase()}</strong>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
            </span>
          </div>
          
          <!-- Attacker → Target -->
          <div style="padding:4px 10px;font-size:.95em;">
            <strong>${actor.name}</strong>${targetActor ? ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${targetName}</strong>` : ''}
          </div>
          
          <!-- Ability + Roll -->
          <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
            <div>${ability.name}: ${ability.rank}${shiftDisplay}</div>
            <div>Roll: ${rollDisplay}</div>
          </div>
          
          ${multiAttackFeatHtml}
          
          <!-- Damage -->
          <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
            ${isHit 
              ? `<div><strong>Damage:</strong> ${rawDamage} → <strong>${afterArmor}</strong> after armor${armorDisplay}${pullPunchNote}</div>`
              : `<div><strong>Damage:</strong> ${rawDamage} <span style="color:#666;">(missed)</span></div>`
            }
            <div style="color:#666;font-size:.9em;">Source: ${sourceName}${damageNote ? ` — ${damageNote}` : ''}</div>
          </div>
          
          ${actions}
          ${manualModeNotice}
        </div>
      `;

      const damageFlags = buildDamageFlags({
        actionId: actionType,
        damageType: damageType,
        rawDamage,
        afterArmor,
        resultColor: colorLower,
        cappedTotal,
        targets: target ? [target] : []
      });

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cardHtml,
        flags: damageFlags
      });

      // ============================================================
      // FIX: Auto-apply damage with wasKillResult for kill-capable attacks
      // ============================================================
      if (!isManualMode && this.opts?.autoApply && isHit && rawDamage > 0 && targetActor) {
        debugLog("Auto-applying damage in full auto mode", {
          damage: rawDamage,
          afterArmor,
          target: targetName,
          wasKillResult: showKill  // NEW: pass kill result
        });

        await applyDamageToTargets({
          damage: rawDamage,
          attackerUuid: actor.uuid,
          damageType: damageType,
          showNotification: false,
          bypassArmor: choice.bypassArmor || false,
          attackForm: attackForm,
          armorPiercing: choice.armorPiercing || 0,
          targets: [target],
          // === FIX: Pass kill result flag ===
          wasKillResult: showKill,
          forceKilling: showKill  // ensure kill save triggers on red
        });
      }

      // ============================================================
      // NEW v1.6.0: Auto-trigger status effect checks in full auto mode
      // ============================================================
      if (!isManualMode && this.opts?.autoApply && canEffectsApply(penetratingDamage) && targetActor) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        
        // Get attacker strength info for Slam checks
        const attackerStrInfo = getStrengthInfo(actor);
        const attackerStrength = attackerStrInfo?.value || 10;
        const attackerStrengthRank = attackerStrInfo?.rank || "Typical";
        
        // Get target's endurance for the save
        const targetEndInfo = getAbilityInfo(targetActor, "endurance");
        const targetEndRank = targetEndInfo?.rank || "Typical";
        
        // Build common prefill data
        const basePrefill = {
          dmgThrough: penetratingDamage,
          targetName: targetName,
          targetEndRank: targetEndRank,
          defenderUuid: target?.document?.uuid ?? targetActor?.uuid,
          targetUuid: target?.document?.uuid ?? targetActor?.uuid,
          attackForm: attackForm,
          borderline: false
        };

        // === AUTO-TRIGGER SLAM CHECK ===
        if (showSlam) {
          debugLog("Auto-triggering Slam check", { 
            target: targetName, 
            damage: penetratingDamage,
            attackerStrength: attackerStrengthRank
          });
          
          try {
            await ActionDispatcher.roll("slam", {
              actor: targetActor,  // Defender makes the save
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: attackForm,
                prefill: {
                  ...basePrefill,
                  attackerStrength: attackerStrength,
                  attackerStrengthRank: attackerStrengthRank,
                  attackerName: actor.name
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Slam failed:", e);
          }
        }

        // === AUTO-TRIGGER STUN CHECK ===
        if (showStun) {
          debugLog("Auto-triggering Stun check", { 
            target: targetName, 
            damage: penetratingDamage 
          });
          
          try {
            await ActionDispatcher.roll("stun", {
              actor: targetActor,  // Defender makes the save
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: attackForm,
                damageType: damageType,
                prefill: {
                  ...basePrefill
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Stun failed:", e);
          }
        }

        // === AUTO-TRIGGER KILL CHECK ===
        if (showKill) {
          debugLog("Auto-triggering Kill check", { 
            target: targetName, 
            damage: penetratingDamage,
            attackForm: attackForm
          });
          
          try {
            await ActionDispatcher.roll("kill", {
              actor: targetActor,  // Defender makes the save
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: attackForm,
                damageType: damageType,
                prefill: {
                  ...basePrefill
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Kill failed:", e);
          }
        }
      }
      // ============================================================
      // END v1.6.0 auto-trigger block
      // ============================================================
    }

    // Play combat SFX once after all cards (still plays in manual mode)
    if (game.msh?.playCombatSFX) {
      const weapon =
        this?.opts?.item
        || choice?.weapon
        || (choice?.weaponId ? this.actor.items.get(choice.weaponId) : null)
        || null;

      const sourceName = weapon?.name ?? "Attack";

      const dmgType =
        damageType
        || weapon?.system?.damageType
        || (actionType === "edged"   ? "physical-edged"
          : actionType === "blunt"  ? "physical-blunt"
          : actionType === "energy" ? "energy"
          : actionType); // final fallback

      const rollResult = String(colorLower ?? "").toLowerCase();
      const hit        = typeof isHit === "boolean" ? isHit : rollResult !== "white";

        await game.msh.playCombatSFX({
          item: weapon,
          actionType,
          damageType: dmgType,
          rollResult,
          isHit: hit,
          sourceName
        });

        // --- Spend ammo for firearms (string/number tolerant; supports current template.json) ---
        try {
          if (String(actionType).toLowerCase() === "shooting" && weapon?.system) {
            const sys = weapon.system;

            // Parse first numeric in a value (works for "20", "", null, "Burst (3)", etc.)
            const toNum = (v, dflt = NaN) => {
              if (v == null || v === "") return dflt;
              if (typeof v === "number" && Number.isFinite(v)) return v;
              if (typeof v === "string") {
                const m = v.match(/-?\d+(\.\d+)?/);
                return m ? Number(m[0]) : dflt;
              }
              return dflt;
            };

            // Decide rounds to spend: prefer HUD/sender opts, then item hints, else 1
            // Choose the first finite, positive number; default to 1 if none.
            const candidates = [
              this?.opts?.roundsFired,
              this?.opts?.shotsToSpend
            ];
            const first = candidates.map(v => toNum(v)).find(n => Number.isFinite(n) && n > 0);
            const rounds = Number.isFinite(first) ? Math.max(1, Math.trunc(first)) : 1;

            // (optional debug)
            if (!Number.isFinite(first)) {
              console.warn("FASERIP | Ammo spend: no finite rounds found; defaulting to 1", { candidates });
            }

            // Helper to update any ammo-like field (string or number), return true if updated
            const tryUpdate = async (path) => {
              const cur = foundry.utils.getProperty(weapon, path);
              const curNum = toNum(cur);
              if (!Number.isFinite(curNum)) return false;
              const next = Math.max(0, curNum - rounds);
              await weapon.update({ [path]: next }); // Foundry will coerce as needed
              console.log("FASERIP | Ammo spend", { weapon: weapon.name, path, cur, curNum, rounds, next });
              return true;
            };

            // First match wins (order chosen to fit your template.json)
            const updated =
              (sys.ammo && (await tryUpdate("system.ammo.current") || await tryUpdate("system.ammo.value"))) ||
              (await tryUpdate("system.shotsRemaining")) ||
              (await tryUpdate("system.shots")) ||
              (sys.uses && await tryUpdate("system.uses.value")) ||
              (await tryUpdate("system.clip")) ||
              (await tryUpdate("system.magazine"));

            if (!updated) {
              console.warn("FASERIP | No numeric ammo field found on weapon", weapon.name, { sys });
            } else if (rounds > 1) {
              ui.notifications?.info?.(`${weapon.name}: fired ${rounds} rounds`);
            }
          }
        } catch (e) {
          console.warn("FASERIP | Ammo spend failed:", e);
        }

    }
  }
}