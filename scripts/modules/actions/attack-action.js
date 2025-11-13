import { BaseAction } from "./base-action.js";
import { resolveCombatMode } from "./action-dispatcher.js";

import { 
  RANKS, getStrengthInfo, shiftRank, getAbilityInfo,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets,
  debugLog
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { ACTION_LABELS } from "./action-config.js";
import { ACTION_EFFECTS } from "./action-config.js";
import { SCOPE, getFlagScope } from "./flags.js";


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
    // Optional “Impossible”: when Intensity ≥ Ability + 2 ranks (diff <= -2)
    const AUTO_DIFF = 4;

    // Toggle this to enable (RAW optional). If disabled, nothing is “impossible”;
    // the required color rule applies (e.g., Red-only).
    const USE_IMPOSSIBLE = true;
    const IMPOSSIBLE_DIFF = -2;

    const availableKarma = actor.system.karma.value || 0;
    
    // Get intensity rank value for comparison
    const intensityIndex = RANKS.indexOf(intensity);
    const fightingIndex  = RANKS.indexOf(fightingAbility.rank);
    const diff = fightingIndex - intensityIndex;

    if (diff >= AUTO_DIFF) {
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
          <label style="display: block; margin-bottom: 5px;">Spend Karma Points:</label>
          <input type="number" id="karma-points" min="0" max="${availableKarma}" value="0" 
            style="width: 80px; padding: 4px;">
          <span style="margin-left: 8px; font-size: 0.9em; color: #666;">
            (Available: ${availableKarma})
          </span>

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
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll FEAT",
            callback: async (html) => {
              const karmaSpent = Math.min(
                parseInt(html.find('#karma-points').val()) || 0,
                availableKarma
              );
              
              // Roll 1d100
              const roll = await (new Roll("1d100")).evaluate();
              const totalRoll = Math.min(100, roll.total + karmaSpent);
              
              // Get result color
              const cs = parseInt(html.find('#multi-feat-cs').val()) || 0;
              const effRank = shiftRank(fightingAbility.rank, cs);
              const effFightingIndex = RANKS.indexOf(effRank);

              // Re-check auto/impossible with CS applied
              {
                const d2 = effFightingIndex - intensityIndex;
                if (d2 >= AUTO_DIFF) {
                  await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
                      <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack FEAT - AUTOMATIC SUCCESS</div>
                      <div style="font-size:.9em;">Fighting (eff.): ${effRank} vs Intensity: ${intensity} — no roll required</div>
                    </div>`
                  });
                  return resolve({ success: true, intensity, roll: null, totalRoll: null, resultColor: "AUTO", cancelled: false, auto: true });
                }
                if (USE_IMPOSSIBLE && d2 <= IMPOSSIBLE_DIFF) {
                  await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<div style="background:#ffebee;border:1px solid #f44336;border-radius:3px;padding:8px;margin:5px 0;">
                      <div style="color:#d32f2f;font-weight:bold;margin-bottom:5px;">Multiple Attack FEAT - IMPOSSIBLE</div>
                      <div style="font-size:.9em;">Fighting (eff.): ${effRank} vs Intensity: ${intensity}</div>
                      <div style="font-size:.9em;margin-top:4px;">Proceed with a single attack at -3CS.</div>
                    </div>`
                  });
                  return resolve({ success: false, intensity, roll: null, totalRoll: null, resultColor: "IMPOSSIBLE", cancelled: false, auto: false });
                }
              }

              const resultColor = game.msh.rollUniversalTable(effRank, totalRoll);
              const colorLower = resultColor.toLowerCase();
              
              // Determine success based on FEAT intensity comparison rules
              let success = false;
              if (effFightingIndex > intensityIndex) {
                // Fighting > Intensity: Green or better succeeds
                success = ["green", "yellow", "red"].includes(colorLower);
              } else if (effFightingIndex === intensityIndex) {
                // Fighting = Intensity: Yellow or better succeeds
                success = ["yellow", "red"].includes(colorLower);
              } else {
                // Fighting < Intensity: Only Red succeeds
                success = colorLower === "red";
              }
              
              // Deduct karma if spent
              if (karmaSpent > 0) {
                const newKarma = Math.max(0, availableKarma - karmaSpent);
                await actor.update({"system.karma.value": newKarma});
                
                // Add karma history
                const history = {
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -karmaSpent,
                  type: "FEAT Roll",
                  description: `Spent karma on Multiple Attack FEAT (${intensity})`
                };
                const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
                await actor.update({"system.karma.history": currentHistory.concat([history])});
              }
              
              // Show result in chat
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `Multiple Attack FEAT: ${intensity}`,
              });
              
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
                      <div>Fighting: ${fightingAbility.rank} vs Intensity: ${intensity}</div>
                      <div>Roll: ${roll.total} + Karma: ${karmaSpent} = ${totalRoll}</div>
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
              
              resolve({ success, intensity, roll, totalRoll, resultColor, cancelled: false });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve({ cancelled: true })
          }
        },
        default: "roll"
      }).render(true);
    });
  }

  /**
   * Unified attack execution for all attack types
   * @param {Object} config - Attack configuration
   * @param {Object} config.choice - User choices from dialog
   * @param {Actor} config.actor - The attacking actor
   * @param {Object} config.ability - Ability info {name, rank, value}
   * @param {string} config.actionType - Action type identifier (e.g., "blunt-attack")
   * @param {string} config.actionName - Display name for action
   * @param {Object} config.effects - Effect mappings for colors
   * @param {string} config.damageType - Damage type (e.g., "physical-blunt")
   * @param {number} config.rawDamage - Base damage value
   * @param {string} config.damageNote - Description of damage source
   * @param {string} config.sourceName - Name of weapon/source
   * @param {string} config.attackForm - Attack form for effects ("blunt", "edged", "shooting")
   * @param {Object} config.breakingFeat - Optional breaking feat data
   * @param {number} config.targetCount - Number of targets (for display)
   */
  async _executeSingleAttack(config) {
    const {
      choice, actor, ability, actionType, actionName, effects,
      damageType, rawDamage, damageNote, sourceName, attackForm,
      breakingFeat = null, targetCount = 1,
      overrideTargets = null
    } = config;

    // ANCHOR: early-weapon-resolve
    // Resolve weapon early so we can gate empty-mag attacks
    let weapon =
      this?.opts?.item
      || choice?.weapon
      || (choice?.weaponId ? this.actor.items.get(choice.weaponId) : null)
      || null;

    // Stop immediately if out of ammo (shooting only). Also play a 'click' SFX.
    if (weapon?.system && String(actionType).toLowerCase() === "shooting") {
      const toNum = (v) => {
        if (v == null || v === "") return NaN;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const m = v.match(/-?\d+(\.\d+)?/);
          return m ? Number(m[0]) : NaN;
        }
        return NaN;
      };

      // pull current ammo from any supported field
      const cur =
        (weapon.system.ammo && (toNum(weapon.system.ammo.current) ?? toNum(weapon.system.ammo.value))) ??
        toNum(weapon.system.shotsRemaining) ??
        toNum(weapon.system.shots);

      if (!Number.isFinite(cur) || cur <= 0) {
        // Play a 'dry fire' click. Use your own SFX filename here if different.
        const CLICK_SFX = "systems/msh-faserip/assets/sfx/weapon-empty.mp3";

        try {
          const AH = foundry?.audio?.AudioHelper ?? globalThis.AudioHelper; // fallback for older
          if (AH?.play) {
            await AH.play({ src: CLICK_SFX, volume: 0.8, autoplay: true, loop: false }, true);
          } else if (game.msh?.playCombatSFX) {
            await game.msh.playCombatSFX({
              item: weapon,
              actionType: "dry",
              damageType: "none",
              rollResult: "white",
              isHit: false,
              sourceName: weapon?.name ?? "Weapon (empty)",
              sfxOverride: CLICK_SFX // only if your SFX layer supports it
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
    // ANCHOR: early-weapon-resolve

    const actionLabel = `${actionName}${targetCount > 1 ? ` (${targetCount} targets)` : ''}`;

    // Apply column shift
    let effectiveRank = ability.rank;
    if (choice.shift) effectiveRank = shiftRank(effectiveRank, choice.shift);

    // Roll + karma
    const { roll, cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(
      actor, actionLabel, choice.karma || 0, choice.skipDice ? null : undefined
    );

    // Check if manual mode -- return if true
    const isManualMode = this.opts?.mode === "manual";
    
    // Continue with normal resolution for Semi/Full modes...
    // Resolve color (always, even in manual mode)
    let color = rollUniversalTable(effectiveRank, cappedTotal);
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
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText || this._getResultHoverText));
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
          showKill = (colorLower === "red");    // ← NEW
          // Red = Kill (resolved via Kill flow/UI elsewhere); no Slam.
          break;

        case "shooting":
        case "energy":
          // Yellow = Bullseye → no Slam/Stun check; Red = Kill (handled elsewhere)
          showKill = (colorLower === "red");    // ← NEW
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
      const autoSave = (typeof resolveCombatMode === "function" && targetActor)
        ? (resolveCombatMode(targetActor) === "full")
        : false;

      const actions = (!isManualMode && !this.opts?.autoApply && isHit && canEffectsApply(penetratingDamage) && targetActor)
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

      // Auto-run Kill in full-auto mode
      if (!isManualMode && this.opts?.autoApply && autoSave && showKill && targetActor) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        console.log("BEFORE KILL CALL", {
          targetActor,
          targetActorName: targetActor?.name,
          targetActorId: targetActor?.id
        });
        await ActionDispatcher.roll("kill", {
          actor: targetActor,  // ✅ defender makes the save
          abilityName: "endurance",  // ✅ specify the ability
          opts: {
            autoApply: true,
            showConfirm: false,
            attackForm,
            prefill: {
              targetUuid: target?.document?.uuid ?? target?.actor?.uuid,
              dmgThrough: Number(penetratingDamage) || 0,
              targetName: target?.name,
              targetEndRank: targetActor?.system?.abilities?.endurance?.rank || "Good"
            }
          }
        });
      }

      // Auto-run Slam in full-auto mode
      if (!isManualMode && this.opts?.autoApply && autoSave && showSlam && targetActor) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        console.log("BEFORE SLAM CALL", {
          targetActor,
          targetActorName: targetActor?.name,
          targetActorId: targetActor?.id
        });
        await ActionDispatcher.roll("slam", {
          actor: targetActor,  // ← TARGET makes the save, not attacker!
          abilityName: "endurance",     // ← Slam uses Endurance FEAT
          opts: {
            autoApply: true,
            showConfirm: false,
            attackForm,
            prefill: {
              attackerUuid: actor.uuid,
              attackerName: actor.name,
              attackerStrength: actor.system?.abilities?.strength?.value || 30,
              attackerStrengthRank: actor.system?.abilities?.strength?.rank || "Remarkable",
              targetUuid: target?.document?.uuid ?? target?.actor?.uuid,
              dmgThrough: Number(penetratingDamage) || 0,
              targetName: target?.name,
              targetEndRank: targetActor?.system?.abilities?.endurance?.rank || "Good"
            }
          }
        });
      }
      
      // Auto-run Stun in full-auto mode
      if (!isManualMode && this.opts?.autoApply && autoSave && showStun && targetActor) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        console.log("BEFORE STUN CALL", {
          targetActor,
          targetActorName: targetActor?.name,
          targetActorId: targetActor?.id
        });
        await ActionDispatcher.roll("stun", {
          actor: targetActor,  // ← TARGET makes the save, not attacker!
          abilityName: "endurance",     // ← Slam uses Endurance FEAT
          opts: {
            autoApply: true,
            showConfirm: false,
            attackForm,
            prefill: {
              targetUuid: target?.document?.uuid ?? target?.actor?.uuid,
              dmgThrough: Number(penetratingDamage) || 0,
              targetName: target?.name,
              targetEndRank: targetActor?.system?.abilities?.endurance?.rank || "Good"
            }
          }
        });
      }

      // Build pull punch indicator
      let pullPunchNote = "";
      if (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage) {
        pullPunchNote += `<div style="color:#ff6f00;">⚠ Damage pulled: ${rawDamage} → ${choice.pulledDamage}</div>`;
      }
      if (choice.resultCap && choice.resultCap !== 'none') {
        pullPunchNote += `<div style="color:#ff6f00;">⚠ Result capped at ${choice.resultCap.toUpperCase()}</div>`;
      }

      // Damage block for this target
      const damageBlock = `
        <div style="margin:6px 10px;padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff;">
          <div><b>Damage (raw):</b> ${rawDamage}${damageNote ? ` <span style="color:#666;">— ${damageNote}</span>` : ``}</div>
          ${isHit ? `
            <div><b>After Armor${targetActor ? ` (${targetName})` : ``}:</b> ${afterArmor}</div>
          ` : ``}
          <div style="font-size:.9em;color:#555;">Source: ${sourceName}</div>
          ${pullPunchNote}
        </div>
      `;

      // Add manual mode notice if applicable
      const manualModeNotice = isManualMode ? `
        <div style="padding:6px;margin:5px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-style:italic;color:#e65100;">
          ⚠ Manual Mode: GM adjudicates damage and effects
        </div>
      ` : "";

      // Final chat card for this target
      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
            <strong>${actor.name} - ${actionLabel}</strong>
            ${targetActor ? `<br><span style="font-size:.85em;color:#555;">→ ${targetName}</span>` : ''}
          </div>
          <div style="padding:5px 10px;font-size:.9em;">
            <div>Ability: ${ability.name}</div>
            <div>Base Rank: ${ability.rank} (${ability.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
            <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
          </div>
          ${damageBlock}
          ${grid}
          <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
            RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
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
        flags: {
          ...damageFlags,
          [SCOPE]: {
            ...(damageFlags?.[SCOPE] || {}),
            autoChecksDone: true
          }
        }
      });

      // Auto-apply damage for this target ONLY if not manual mode
      if (!isManualMode && this.opts?.autoApply && isHit && rawDamage > 0 && targetActor) {
        debugLog("Auto-applying damage in full auto mode", {
          damage: rawDamage,
          afterArmor,
          target: targetName
        });

        await applyDamageToTargets({
          damage: rawDamage,
          attackerUuid: actor.uuid,
          damageType: damageType,
          showNotification: false,
          bypassArmor: choice.bypassArmor || false,
          attackForm: attackForm,
          armorPiercing: choice.armorPiercing || 0,
          targets: [target]  // Changed from specificTarget to targets array
        });
      }
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
              this?.opts?.shotsToSpend,
              sys?.roundsFired, sys?.burst, sys?.burstSize, sys?.rateOfFire, sys?.rate
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