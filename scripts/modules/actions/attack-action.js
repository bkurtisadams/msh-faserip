// attack-action.js v1.9.23 - 2026-04-30
// v1.9.23: Multi-Attack FEAT dialog wrapped in frp-dlg + frp-header-v3 — picks up
//          all Pass-1 high-contrast styling (boxes, footer, ink). Replaces inline
//          grey/yellow ctx-cards and CS row with frp-box + frp-cs-box patterns.
//          Header logic preserved: actor + Fighting + ×N attacks → Multi-Attack.
// v1.9.22: Ammo variant effects — rubber (blunt column, suppress slam), mercy (KO save),
//          explosive (2x damage), heat-seeker (no range penalty), variant badge on chat card.
// v1.9.21: Semi mode now auto-triggers slam/stun/kill checks (not just full auto).
//          These are mechanical consequences, not player choices — must resolve before
//          next attack in multi-attack sequence. Damage application still full-auto only.
// v1.9.20: Expand isRanged to include charging/throwing so dodge defenseShiftRanged applies correctly
// v1.9.19: Semi mode always shows multi-attack FEAT dialog (auto/impossible shown as confirmation)
// v1.9.18: Multi-attack FEAT - CS now correctly affects success determination
// v1.9.17: Multi-attack FEAT dialog redesigned to match compact blunt-attack style
// v1.9.17: Fix reload button - use <a> tag instead of <button> (Foundry v13 sanitizes buttons from chat content)
// v1.9.16: Fix reload button - store token ID for synthetic actor lookup
// v1.9.15: Add reload button to out-of-ammo chat card
// v1.9.14: Evasion chat card shows real roll color instead of fake White; damage shows "evaded" not "miss"
// v1.9.13: Fix evasion bonus - apply to attack shift BEFORE roll so it shows in CS breakdown and effective rank
// v1.9.12: Fix chat card to display modified result after evasion bonus (use targetBg/targetFg/targetEffectResult)
// v1.9.11: Fix evasion - block attacks while evading, fix SFX to not play hit sounds on evaded miss
// v1.9.10: Fix evasion timing - evade blocks attack only in same round, bonus applies in next round
// v1.9.9: Add evasion checking - successful evasion causes attack to miss, failed evasion gives auto-hit
// v1.9.8: CS hover uses csNotes directly as label (e.g., "Ultimate Skill +4, +2 Stunned")
// v1.9.7: Remove duplicate kill check - applyDamageToTargets now handles via death-save
// v1.9.6: Breaking FEAT fallback to derive rank from numeric armor value; added debug logging
// v1.9.5: Borderline rule - effects can apply when armor exactly equals damage (passed via prefill)
// v1.9.4: Breaking FEAT shows when weapon mat < target mat; miss shows "Damage: 0 (miss)"
// v1.9.3: Pass target armor rank to Breaking FEAT dialog for auto-population
// v1.9.2: Damage line uses math notation (30 − 6 armor = 24) with source/armor hover text
// v1.9.1: Detailed CS breakdown hover showing manual, multi-attack, adjacent, and effect modifiers
// v1.9.0: Collapsible slam/stun sections inline in attack card (consolidatedChatCards mode)
// v1.8.6: Show actual effect names in CS breakdown hover (e.g., "-2 Stunned" instead of "-2 attacker")
// v1.8.5: CS breakdown in chat card (yellow box with hover showing manual/attacker/defender sources)
// v1.8.4: Move result badge to roll line, add attack number in header (1 of 2, vs 3 targets)
// v1.8.3: Yellow box on rolled d100 in chat card to indicate hover text
// v1.8.2: Fix result cap (Yellow/Green) - use capped color for effect lookup and Slam/Stun/Kill checks
// v1.8.1: Fix pull punch - use afterArmor (with pull cap) in applyDamageToTargets
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
  debugLog, universalColor, buildInlineRollDisplay, buildInlineFeatDisplay,
  buildCollapsibleSlamSection, buildCollapsibleStunSection, buildCollapsibleBreakingSection
} from "./action-utils.js";
//import { rollUniversalTable } from "../dice/universal-table.js";
import { executeBreakingFeat } from "./breaking-feat.js";
import { buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { ACTION_LABELS } from "./action-config.js";
import { ACTION_EFFECTS } from "./action-config.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { SCOPE, getFlagScope } from "./flags.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown, canActorAct, getModifierSummary, getEvasionAttackBonus, consumeEvasionAttackBonus } from "../effects/effect-modifiers.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";


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
    // RAW: Auto when Ability 3+ ranks above Intensity (diff >= 3)
    // Optional "Impossible": when Intensity ≥ Ability + 2 ranks (diff <= -2)
    const AUTO_DIFF = 3;

    // Toggle this to enable (RAW optional). If disabled, nothing is "impossible";
    // the required color rule applies (e.g., Red-only).
    const USE_IMPOSSIBLE = true;
    const IMPOSSIBLE_DIFF = -2;

    const availableKarma = actor.system.attributes?.karma?.value || 0;
    
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
      console.log("[FASERIP] Multi-attack FEAT: AUTOMATIC SUCCESS (diff >= 3)");
      // Full Auto: return immediately. Semi: fall through to dialog which shows "Automatic".
      if (this.opts?.autoApply === true) {
        return { success: true, intensity, roll: null, totalRoll: null, resultColor: "AUTO", cancelled: false, auto: true };
      }
    }
    if (USE_IMPOSSIBLE && diff <= IMPOSSIBLE_DIFF) {
      // Full Auto: return immediately. Semi: fall through to dialog which shows "Impossible".
      if (this.opts?.autoApply === true) {
        return { success: false, intensity, roll: null, totalRoll: null, resultColor: "IMPOSSIBLE", cancelled: false, auto: false };
      }
    }

    if (diff <= IMPOSSIBLE_DIFF) {
      if (this.opts?.autoApply === true) {
        return {
          success: false,
          intensity,
          roll: null,
          totalRoll: null,
          resultColor: "IMPOSSIBLE",
          cancelled: false,
          auto: false
        };
      }
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
                <div>Roll: <span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span></div>
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
    
    const isAuto       = diff >= AUTO_DIFF;
    const isImpossible = USE_IMPOSSIBLE && diff <= IMPOSSIBLE_DIFF;
    const isPreDetermined = isAuto || isImpossible;

    const fightingShort = RANK_ABBR[fightingAbility.rank] || fightingAbility.rank;

    // Color scheme for the FEAT-status box: green-on-auto, red-on-impossible, neutral otherwise
    const statusBg = isAuto ? '#e8f5e9' : isImpossible ? '#ffebee' : '#fff';
    const statusBorder = isAuto ? '#2e7d32' : isImpossible ? '#b71c1c' : '#b8a868';
    const statusInk = isAuto ? '#1b5e20' : isImpossible ? '#6a0000' : '#1a1a1a';
    const statusText = isAuto ? '✓ Automatic' : isImpossible ? '✗ Impossible' : `Need: ${requiredColor}`;

    const dialogContent = `
    <div class="frp-dlg">
      <!-- Header banner: Actor (Fighting RANK VALUE) ×N Multi-Attack -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Fighting</span>
          <span class="h-stat-rank">${fightingShort} ${fightingAbility.value}</span>
        </span>
        <span class="h-paren">)</span>
        <span class="h-arrow">&times;${attackCount}</span>
        <span class="h-target">Multi-Attack</span>
      </div>

      <!-- FEAT Intensity / requirement readout -->
      <div class="frp-box" style="background:${statusBg};border:1.5px solid ${statusBorder};display:flex;align-items:center;gap:8px;">
        <span class="frp-box-label" style="margin:0;">FEAT Intensity</span>
        <strong style="font-family:'Oswald',sans-serif;font-size:14px;color:#1a1a1a;">${intensity}</strong>
        <span style="margin-left:auto;font-family:'Oswald',sans-serif;font-size:12px;font-weight:700;color:${statusInk};">${statusText}</span>
      </div>

      ${isPreDetermined ? '' : `
      <!-- CS row + notes -->
      <div class="frp-box frp-cs-box" style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="frp-box-label" style="margin:0;color:#6a0000;">CS</span>
          <input type="number" name="shift" value="0" style="width:46px;padding:2px;text-align:center;font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;border:1px solid #888;border-radius:2px;">
          <span style="color:#6a0000;font-weight:700;">&rarr;</span>
          <strong id="shifted-rank-display" style="font-family:'Oswald',sans-serif;font-size:14px;">${fightingAbility.rank}</strong>
          <button type="button" class="cs-reset" style="visibility:hidden;padding:1px 5px;font-size:11px;cursor:pointer;border:1px solid #888;border-radius:2px;background:#eee;" title="Reset to 0">&times;</button>
        </div>
        <input type="text" name="csNotes" placeholder="e.g., Martial Arts B +1" style="width:100%;padding:3px 6px;font-size:12px;border:1px solid #888;border-radius:2px;">
      </div>

      ${generateKarmaControlsHTML(actor, 0)}

      <div class="frp-foot">
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
        </div>
      </div>
      `}
    </div>
    `;
    
    return new Promise((resolve) => {
      showFaseripButtonDialog({
        title: `Multiple Attack FEAT (${attackCount} attacks)`,
        content: dialogContent,
        buttons: {
          roll: {
            label: isAuto ? "Proceed" : isImpossible ? "Acknowledge" : "Roll FEAT",
            callback: async (html) => {
              // Auto/Impossible: no roll needed, resolve immediately
              if (isAuto) {
                return resolve({ success: true, intensity, roll: null, totalRoll: null, resultColor: "AUTO", cancelled: false, auto: true });
              }
              if (isImpossible) {
                return resolve({ success: false, intensity, roll: null, totalRoll: null, resultColor: "IMPOSSIBLE", cancelled: false, auto: false });
              }

              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const cs = Number(html.find('[name="shift"]').val() || 0);
              
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

                const historyEntry = {
                  timestamp: new Date().toISOString(),
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -karmaToSpend,
                  type: "Die Roll",
                  description: `Spent karma on Multiple Attack FEAT`
                };
                const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
                await actor.update({
                  "system.karma.history": currentHistory.concat([historyEntry])
                });
              }
              
              const resultColor = game.msh.rollUniversalTable(effFeatRank, totalRoll);
              const colorLower = resultColor.toLowerCase();
              
              // Determine success using shifted fighting rank so CS actually affects outcome
              const shiftedFightingIndex = RANKS.indexOf(effFeatRank);
              let success = false;
              if (shiftedFightingIndex > intensityIndex) {
                success = ["green", "yellow", "red"].includes(colorLower);
              } else if (shiftedFightingIndex === intensityIndex) {
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
                        <div>Roll: <span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>${karmaToSpend ? ` + ${karmaToSpend} Karma = ${totalRoll}` : ''}</div>
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
          if (isPreDetermined) return; // No controls to wire up
          setupKarmaControlHandlers(html);
          // Live CS rank display
          html.find('[name="shift"]').on("input", function() {
            const cs = Number(this.value) || 0;
            html.find("#shifted-rank-display").text(shiftRank(fightingAbility.rank, cs));
            html.find(".cs-reset").css("visibility", cs !== 0 ? "visible" : "hidden");
          });
          html.find(".cs-reset").on("click", function() {
            html.find('[name="shift"]').val(0).trigger("input");
          });
        }
      });
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
    targetCount = 1,
    attackNumber = 1,
    totalAttacks = 1,
    postHitCallback = null
  }) {
    // === EARLY WEAPON CHECK: Abort if firearm is empty ===
    const weapon = choice?.weapon
      ?? (choice?.weaponId ? this.actor.items.get(choice.weaponId) : null)
      ?? null;

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
                <b>${actor.name}</b> pulls the trigger — <i>click!</i> <span style="color:#888">(${weapon.name} empty)</span>
                <div style="margin-top:6px;">
                  <a class="faserip-reload-weapon"
                          data-item-id="${weapon.id}"
                          data-actor-id="${actor.id}"
                          data-token-id="${actor.token?.id ?? actor.getActiveTokens?.()?.[0]?.id ?? ''}"
                          style="display:inline-block;background:#8b0000;color:#fff;border:none;border-radius:3px;padding:3px 10px;cursor:pointer;font-size:.85em;text-decoration:none;">
                    ↺ Reload ${weapon.name}
                  </a>
                </div>
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
    
    // === CHECK FOR EVADING: Cannot attack while evading ===
    const evadingEffect = actor.effects.find(e => 
      e.flags?.["msh-faserip"]?.isEvading && !e.disabled
    );
    if (evadingEffect) {
      const evadeTarget = evadingEffect.flags?.["msh-faserip"]?.evadedTarget || "an opponent";
      ui.notifications?.warn(`${actor.name} is evading and cannot attack this round!`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background:#fff;border:1px solid #ff9800;border-radius:3px;padding:6px 8px;">
            <b>${actor.name}</b> cannot attack — currently evading ${evadeTarget}
            <div style="font-size:.85em;color:#666;margin-top:4px;">The evading character makes no attacks that round.</div>
          </div>
        `
      });
      return; // abort attack
    }
    
    // Get attacker's attack shift from effects (with breakdown)
    const attackerShiftData = getAttackShiftBreakdown(actor);
    let attackerShift = attackerShiftData.total;
    const attackerEffects = [...attackerShiftData.breakdown];  // Copy so we can add to it
    
    // Get defender's defense shift (if single target)
    // Prefer specificTarget (set during multi-attack loops) over live game.user.targets
    let defenderShift = 0;
    let defenderEffects = [];
    const primaryTarget = choice?.specificTarget ?? this._selectPrimaryTarget();
    debugLog(`_executeSingleAttack: specificTarget=${choice?.specificTarget?.name ?? "NONE"}, primaryTarget=${primaryTarget?.name ?? "NONE"}, attackNumber=${attackNumber ?? "?"}`);
    const defenderActor = primaryTarget?.actor ?? null;
    
    // Check for evasion bonus BEFORE calculating effective rank
    // This applies the +CS from a previous successful evasion (yellow/red result)
    let evasionBonusData = { hasBonus: false, bonusCS: 0, effectId: null, targetName: null };
    if (primaryTarget) {
      evasionBonusData = getEvasionAttackBonus(actor, primaryTarget);
      if (evasionBonusData.hasBonus && evasionBonusData.bonusCS > 0) {
        attackerShift += evasionBonusData.bonusCS;
        attackerEffects.push({
          name: `Evasion Bonus vs ${evasionBonusData.targetName || 'target'}`,
          shift: evasionBonusData.bonusCS
        });
        console.log("[FASERIP] Evasion bonus added to attack shift:", {
          attacker: actor.name,
          target: primaryTarget.name,
          bonusCS: evasionBonusData.bonusCS,
          newAttackerShift: attackerShift
        });
      }
    }
    
    if (defenderActor) {
      // Check if non-adjacent attack — dodge applies to ranged, charging, and throwing but NOT adjacent slugfest/wrestling
      // attackForm can be "blunt"/"edged" for both melee and throwing, so check actionType too
      const atLower = String(actionType).toLowerCase();
      const afLower = String(attackForm).toLowerCase();
      const isRanged = ["shooting", "energy", "force"].includes(afLower) ||
                       ["charging", "throwing-blunt", "throwing-edged"].includes(atLower);
      const defenderShiftData = getDefenseShiftBreakdown(defenderActor, isRanged);
      defenderShift = defenderShiftData.total;
      defenderEffects = defenderShiftData.breakdown;
    }
    
    // Total effect shift (attacker bonus + defender penalty)
    // Positive defenderShift = harder to hit, so we subtract it
    const effectShift = attackerShift - defenderShift;

    // Apply column shift (manual + range/obstacle/movement + effect modifiers)
    // Ranged actions set choice.totalShift which already includes manual + range + obstacle + movement.
    // Melee actions only set choice.shift (manual CS). Use totalShift when present.
    let effectiveRank = ability.rank;
    const manualShift = (choice.totalShift != null) ? choice.totalShift : (choice.shift || 0);
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
        finalShift: totalShift,
        evasionBonus: evasionBonusData.hasBonus ? evasionBonusData.bonusCS : 0
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

    // Use the (possibly capped) color for effect lookup
    const effectColorLower = String(color || "white").toLowerCase();
    const effectResult = effects[effectColorLower] || color;
    const { bg, fg } = bannerColors(effectColorLower);
    const isHit = effectColorLower !== 'white';

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

    // Track if any target was actually hit (considering evasion) for SFX purposes
    let anyTargetActuallyHit = false;

    for (const target of targetList) {
      const targetActor = target?.actor;
      const targetName = target?.name || "Unknown Target";

      // ================================================================
      // EVASION CHECK: See if target successfully evaded this attack
      // ================================================================
      let targetEffectColor = effectColorLower;  // May be modified by evasion
      let targetIsHit = isHit;                   // May be modified by evasion
      let evasionNote = "";
      
      // Get current combat round for timing checks
      const currentRound = game.combat?.round || 0;
      
      if (targetActor) {
        // DEBUG: Log all evading effects on target, including disabled ones
        const allEvadeEffects = targetActor.effects.filter(e => 
          e.flags?.["msh-faserip"]?.isEvading
        );
        if (allEvadeEffects.length > 0) {
          console.log("[FASERIP] Evasion check on target:", {
            target: targetName,
            attackRollColor: effectColorLower,
            currentRound,
            effectsFound: allEvadeEffects.map(e => ({
              name: e.name,
              disabled: e.disabled,
              flags: e.flags?.["msh-faserip"],
              durationRemaining: e.duration?.remaining,
              isTemporary: e.isTemporary
            }))
          });
        }
        // Check for evasion effect on the target (did they evade US?)
        const evadeEffect = targetActor.effects.find(e => 
          e.flags?.["msh-faserip"]?.isEvading && !e.disabled
        );
        
        if (evadeEffect) {
          const evadeFlags = evadeEffect.flags?.["msh-faserip"] || {};
          const evadeCreatedRound = evadeFlags.createdRound || 0;
          
          // Evasion only blocks attacks in the SAME round it was made
          const isSameRound = (currentRound === evadeCreatedRound);
          console.log("[FASERIP] Evasion conditions:", {
            isSameRound, evadeCreatedRound, currentRound,
            evadeSuccessful: evadeFlags.evadeSuccessful,
            autoHit: evadeFlags.autoHit,
            attackColor: effectColorLower,
            wouldAutoHit: evadeFlags.autoHit && effectColorLower === "white"
          });
          
          if (isSameRound) {
            // Check if evasion was successful (green/yellow/red result on evade roll)
            if (evadeFlags.evadeSuccessful) {
              // Successful evasion: attack misses regardless of roll
              // Keep targetEffectColor as the real roll result for display clarity
              targetIsHit = false;
              evasionNote = `<div style="padding:4px 8px;margin:4px 0;background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;color:#2e7d32;font-weight:bold;text-align:center;">EVADED — Target dodged the attack!</div>`;
              console.log("[FASERIP] Evasion success:", { 
                attacker: actor.name, 
                target: targetName, 
                evadedTarget: evadeFlags.evadedTarget,
                originalColor: effectColorLower 
              });
            } else if (evadeFlags.autoHit && effectColorLower === "white") {
              // Failed evasion (white on evade roll): attacker gets at least green
              targetEffectColor = "green";
              targetIsHit = true;
              evasionNote = `<div style="padding:4px 8px;margin:4px 0;background:#ffecb3;border:1px solid #ffc107;border-radius:3px;color:#f57f17;font-style:italic;text-align:center;">Evasion failed: Auto-Hit (White → Green)</div>`;
              console.log("[FASERIP] Evasion auto-hit:", { 
                attacker: actor.name, 
                target: targetName,
                originalColor: effectColorLower 
              });
            } else if (evadeFlags.autoHit && effectColorLower !== "white") {
              // Failed evasion auto-hit is active, but attack already rolled green+ naturally
              evasionNote = `<div style="padding:4px 8px;margin:4px 0;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;color:#e65100;font-style:italic;text-align:center;font-size:.9em;">Evasion failed (auto-hit) — attack hit naturally (${effectColorLower})</div>`;
              console.log("[FASERIP] Evasion auto-hit irrelevant (attack already hit):", {
                attacker: actor.name, target: targetName, attackColor: effectColorLower
              });
            }
          }
        }
        
        // If we have an evasion bonus that was applied earlier (to the attack shift),
        // show a note and consume it now that the attack has resolved
        if (evasionBonusData.hasBonus && evasionBonusData.bonusCS > 0) {
          evasionNote += `<div style="padding:4px 8px;margin:4px 0;background:#e3f2fd;border:1px solid #1976d2;border-radius:3px;color:#0d47a1;font-style:italic;text-align:center;">Evasion Bonus: +${evasionBonusData.bonusCS}CS vs ${evasionBonusData.targetName || 'evaded target'}</div>`;
          
          // Consume the bonus (mark as used) - only consume once for the first target
          if (!evasionBonusData.consumed) {
            await consumeEvasionAttackBonus(actor, evasionBonusData.effectId);
            evasionBonusData.consumed = true;
            console.log("[FASERIP] Consumed evasion attack bonus after attack resolved:", {
              attacker: actor.name,
              target: targetName,
              bonusCS: evasionBonusData.bonusCS
            });
          }
        }
      }

      // Track if this target was actually hit (for SFX purposes)
      if (targetIsHit) {
        anyTargetActuallyHit = true;
      }

      // Recalculate display values based on modified result (after evasion)
      // These may differ from the original roll if evasion blocked or bonus upgraded
      const targetBg = bannerColors(targetEffectColor).bg;
      const targetFg = bannerColors(targetEffectColor).fg;
      const targetEffectResult = effects[targetEffectColor] || targetEffectColor;

      // Calculate armor and penetrating damage for this specific target
     let penetratingDamage = 0;
     let armorData = null;
     let armorValue = 0;
     let isBorderline = false;
     if (targetIsHit && rawDamage > 0) {
       if (targetActor) {
         armorData = getBodyArmorValues(targetActor, damageType);
         // Ensure numbers whether rawDamage arrived as "20" or 20
         const rd = Number(rawDamage) || 0;
         const _apFlat = Number(choice?.armorPiercing || 0);
         const _apCS   = Number(choice?.armorPiercingCS || 0);
         const _apMode = choice?.apMode || "value";
         const _baseArmor = Number(armorData?.applicable) || 0;
         if (_apMode === "cs" && _apCS > 0 && _baseArmor > 0) {
           const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
           let _i = _RV.findIndex(v => v >= _baseArmor);
           if (_i < 0) _i = _RV.length - 1;
           if (_i > 0 && _RV[_i] > _baseArmor) _i--;
           armorValue = _RV[Math.max(0, _i - _apCS)];
         } else {
           armorValue = Math.max(0, _baseArmor - _apFlat);
         }
         penetratingDamage = Math.max(0, rd - armorValue);
         // Borderline: armor exactly equals damage (effects can still apply per rules)
         //isBorderline = (rd > 0 && rd === armorValue);
         isBorderline = (rd > 0 && rd === armorValue && !armorData?.isForceField);
       } else {
         penetratingDamage = Number(rawDamage) || 0;
         }
       }

      // Apply damage cap from pull punch
      if (choice.pulledDamage > 0 && choice.pulledDamage < penetratingDamage) {
        penetratingDamage = choice.pulledDamage;
      }

      const afterArmor = penetratingDamage;

      // Calculate breaking feat for this attack - include target material for auto-population
      // Show button when weapon material < target material (regardless of penetrating damage)
      let currentBreakingFeat = null;
      if (targetIsHit && breakingFeat && targetActor) {
        const RANKS = [
          "Shift-0","Feeble","Poor","Typical","Good","Excellent",
          "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
          "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
        ];
        const RANK_VALUES = [0, 1, 3, 5, 8, 16, 26, 36, 46, 63, 88, 150, 250, 500, 1000, 3000, 5000, Infinity];
        
        // Get target's armor rank for the Breaking FEAT dialog
        const isEnergy = armorData?.isEnergyDamage;
        let targetMatRank = isEnergy ? armorData?.energyRank : armorData?.physicalRank;
        
        // Fallback: if no rank string, derive from numeric armor value
        if (!targetMatRank && armorData) {
          const armorVal = isEnergy ? armorData.energy : armorData.physical;
          if (armorVal > 0) {
            // Find closest rank for this armor value
            for (let i = RANK_VALUES.length - 1; i >= 0; i--) {
              if (armorVal >= RANK_VALUES[i]) {
                targetMatRank = RANKS[i];
                break;
              }
            }
          }
        }
        
        const weaponIdx = RANKS.indexOf(breakingFeat.weaponMat);
        const targetIdx = RANKS.indexOf(targetMatRank);
        
        console.log("[FASERIP] Breaking FEAT check:", {
          weaponMat: breakingFeat.weaponMat,
          weaponIdx,
          targetMatRank,
          targetIdx,
          wouldShow: weaponIdx !== -1 && targetIdx !== -1 && weaponIdx < targetIdx
        });
        
        // Only show Breaking FEAT if weapon material < target material
        if (weaponIdx !== -1 && targetIdx !== -1 && weaponIdx < targetIdx) {
          currentBreakingFeat = {
            ...breakingFeat,
            targetMat: targetMatRank || ""
          };
        }
      } else if (breakingFeat) {
        console.log("[FASERIP] Breaking FEAT skipped:", {
          hasBreakingFeat: !!breakingFeat,
          hasTargetActor: !!targetActor,
          breakingFeat
        });
      }

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

      // Vehicles have no Endurance — Slam/Stun/Kill effects do not apply
      const targetIsVehicle = targetActor?.type === "vehicle";

      switch (String(actionType)) {
        case "blunt-attack":
        case "charging":
          showSlam = (targetEffectColor === "yellow");
          showStun = (targetEffectColor === "red");
          break;

        case "edged-attack":
        case "throwing-edged":
          showStun = (targetEffectColor === "yellow");
          showKill = (targetEffectColor === "red");    // ← Kill on red
          break;

        case "shooting":
        case "energy":
          // Yellow = Bullseye → no Slam/Stun check; Red = Kill
          showKill = (targetEffectColor === "red");    // ← Kill on red
          break;

        case "force":
          // Yellow = Bullseye → no Slam; Red = Stun
          showStun = (targetEffectColor === "red");
          break;

        case "throwing-blunt":
          // Yellow = Hit; Red = Stun
          showStun = (targetEffectColor === "red");
          break;

        default:
          // No generic follow-ups
          break;
      }

      // Vehicles have no Endurance — suppress all combat effect checks
      if (targetIsVehicle) {
        showSlam = false;
        showStun = false;
        showKill = false;
      }

      // Rubber shot: ignore Slam results per ammo rules
      const ammoVariant = choice?.variantType || "standard";
      if (ammoVariant === "rubber" && showSlam) {
        showSlam = false;
      }

      // Build ammo variant note for chat card
      const variantLabel = {
        rubber: "Rubber Shot (blunt effects, no Slam)",
        mercy: "Mercy Shot (Rm KO drug)",
        explosive: "Explosive Shot (2× damage)",
        heatSeeker: "Heat-Seeker (no range penalty)",
        canister: "Canister Shot (area effect)",
        ap: "AP Shot (−2CS armor)"
      }[ammoVariant] || "";
      const variantBadge = variantLabel
        ? `<div style="padding:2px 8px;margin:2px 10px;font-size:.8em;color:#1565c0;"><i class="fas fa-crosshairs"></i> ${variantLabel}</div>`
        : "";

      // Kill result karma warning for attack card
      const targetIsRobot = targetActor?.system?.origin === "Robot";
      const killWarning = (showKill && !targetIsRobot) ? `<div style="padding:4px 8px;margin:4px 10px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:.85em;color:#e65100;text-align:center;">Kill result — hero loses ALL Karma if target dies</div>` : (showKill && targetIsRobot) ? `<div style="padding:4px 8px;margin:4px 10px;background:#e3f2fd;border:1px solid #90caf9;border-radius:3px;font-size:.85em;color:#1565c0;text-align:center;">Kill result — target is a Robot/construct. No Karma loss for attacker.</div>` : "";

      // Calculate autoSave before using it
      const { resolveCombatMode } = await import("./action-dispatcher.js");
      const autoSave = (typeof resolveCombatMode === "function" && targetActor)
        ? (resolveCombatMode(targetActor) === "full")
        : false;

      // Inline Breaking FEAT for full-auto consolidated cards
      let inlineBreakingHtml = "";
      if (useConsolidated && !isManualMode && this.opts?.autoApply && currentBreakingFeat) {
        try {
          const breakResult = await executeBreakingFeat({
            weaponMatRank: currentBreakingFeat.weaponMat,
            targetMatRank: currentBreakingFeat.targetMat,
            weaponName: currentBreakingFeat.weaponName,
            itemUuid: currentBreakingFeat.itemUuid,
            actor,
            postChat: false
          });
          if (breakResult) {
            inlineBreakingHtml = buildCollapsibleBreakingSection(breakResult);
            currentBreakingFeat = null;
          }
        } catch (e) {
          console.error("[FASERIP ERROR] Inline Breaking FEAT failed:", e);
        }
      }

      // Show actions box if there are effects to apply OR a Breaking FEAT check is needed
      const hasEffects = canEffectsApply(penetratingDamage, { borderline: isBorderline });
      const needsActionsBox = !isManualMode && targetIsHit && targetActor && (hasEffects || currentBreakingFeat);
      
      const actions = needsActionsBox
        ? buildActionsBox({
            showSlam: hasEffects && showSlam && !targetIsVehicle,
            showStun: hasEffects && showStun && !targetIsVehicle,
            showKill: hasEffects && showKill && !targetIsVehicle,
            pulled: choice.resultCap !== 'none' || (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage),
            breakingFeat: currentBreakingFeat,
            actorUuid: actor.uuid,
            targetUuid: target?.document?.uuid ?? target?.actor?.uuid,
            damage: Number(penetratingDamage) || 0,
            prefillData: {
              dmgThrough: Number(penetratingDamage) || 0,
              attackerStrength: getStrengthInfo(actor)?.value || 10,
              attackerStrengthRank: getStrengthInfo(actor)?.rank || "Typical",
              attackerName: actor.name
            },
            attackForm,
            damageType,
            bypassArmor: true,  // damage is already post-armor (penetratingDamage)
            armorPiercing: Number(choice?.armorPiercing || 0),
            armorPiercingCS: Number(choice?.armorPiercingCS || 0),
            apMode: choice?.apMode || "value",
            bypassForceField: !!choice?.bypassForceField,
            autoApply: !!this.opts?.autoApply,
            autoSave: false,  // prevent chat button duplicates
          })
        : "";

      // Build inline FEAT display if multi-attack FEAT was performed and consolidated mode is enabled
      const multiAttackFeatHtml = (useConsolidated && choice?.multiAttackFeatResult) 
        ? buildInlineFeatDisplay(
            choice.multiAttackFeatResult, 
            `Multi-Attack FEAT (${choice.multiAttackFeatResult.attackCount} attacks)`
          )
        : "";

      // ============================================
      // INLINE SLAM/STUN CHECKS (for consolidated chat cards)
      // ============================================
      let inlineSlamHtml = "";
      let inlineStunHtml = "";
      let inlineSlamResult = null;
      let inlineStunResult = null;
      
      // Get inline check results if: consolidated mode + full auto + effect applies + has target
      // Effects will be applied by the regular auto-trigger block, we just capture the results for display
      if (useConsolidated && !isManualMode && this.opts?.autoApply && canEffectsApply(penetratingDamage, { borderline: isBorderline }) && targetActor && !targetIsVehicle) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        
        // Get attacker strength info for Slam checks
        const attackerStrInfo = getStrengthInfo(actor);
        const inlineAttackerStrength = attackerStrInfo?.value || 10;
        const inlineAttackerStrengthRank = attackerStrInfo?.rank || "Typical";
        
        // Get target's endurance for the save
        const targetEndInfo = getAbilityInfo(targetActor, "endurance");
        const targetEndRank = targetEndInfo?.rank || "Typical";
        
        // Common prefill data
        const inlinePrefill = {
          dmgThrough: penetratingDamage,
          targetName: targetName,
          targetEndRank: targetEndRank,
          defenderUuid: target?.document?.uuid ?? targetActor?.uuid,
          targetUuid: target?.document?.uuid ?? targetActor?.uuid,
          attackForm: attackForm,
          borderline: isBorderline
        };
        
        // GET INLINE SLAM RESULT (for display only - effects applied later)
        if (showSlam) {
          try {
            inlineSlamResult = await ActionDispatcher.roll("slam", {
              actor: targetActor,
              abilityName: "endurance",
              opts: {
                autoApply: true,
                returnResultOnly: true,
                attackForm: attackForm,
                prefill: {
                  ...inlinePrefill,
                  attackerStrength: inlineAttackerStrength,
                  attackerStrengthRank: inlineAttackerStrengthRank,
                  attackerName: actor.name
                }
              }
            });
            
            if (inlineSlamResult) {
              inlineSlamHtml = buildCollapsibleSlamSection(inlineSlamResult);
            }
          } catch (e) {
            console.error("[FASERIP ERROR] Inline Slam check failed:", e);
          }
        }
        
        // GET INLINE STUN RESULT (for display only - effects applied later)
        if (showStun) {
          try {
            inlineStunResult = await ActionDispatcher.roll("stun", {
              actor: targetActor,
              abilityName: "endurance",
              opts: {
                autoApply: true,
                returnResultOnly: true,
                attackForm: attackForm,
                damageType: damageType,
                prefill: { ...inlinePrefill }
              }
            });
            
            if (inlineStunResult) {
              inlineStunHtml = buildCollapsibleStunSection(inlineStunResult);
            }
          } catch (e) {
            console.error("[FASERIP ERROR] Inline Stun check failed:", e);
          }
        }
      }

      // Build compact shift display with breakdown
      let shiftDisplay = "";
      if (totalShift !== 0) {
        const parts = [];
        const breakdown = choice.shiftBreakdown;
        
        // Manual shift from dialog (user-entered) + situational tags
        if (breakdown?.csNotes) {
          // csNotes contains the full label from sit tags (e.g., "Range 3 -2, Blindside +2")
          parts.push(breakdown.csNotes);
        } else if (breakdown?.manual && breakdown.manual !== 0) {
          // No notes, just show the number
          parts.push(`${breakdown.manual > 0 ? '+' : ''}${breakdown.manual}`);
        }
        
        // Multi-attack penalty
        if (breakdown?.multiAttack && breakdown.multiAttack !== 0) {
          const label = breakdown.multiAttack === -1 ? "multi-atk" : "multi-atk fail";
          parts.push(`${breakdown.multiAttack} ${label}`);
        }
        
        // Range penalty (ranged attacks)
        if (breakdown?.range && breakdown.range !== 0) {
          parts.push(`${breakdown.range} range`);
        }
        
        // Obstacle penalty (ranged attacks)
        if (breakdown?.obstacle && breakdown.obstacle !== 0) {
          parts.push(`${breakdown.obstacle} obstacle`);
        }
        
        // Movement penalty (ranged attacks)
        if (breakdown?.movement && breakdown.movement !== 0) {
          parts.push(`${breakdown.movement} movement`);
        }
        
        // Adjacent targets penalty
        if (breakdown?.adjacent && breakdown.adjacent !== 0) {
          parts.push(`${breakdown.adjacent} adjacent`);
        }
        
        // Fallback: if no breakdown but manualShift exists, show as "other"
        if (!breakdown && manualShift !== 0) {
          parts.push(`${manualShift > 0 ? '+' : ''}${manualShift} other`);
        }
        
        // Show attacker effects by name
        for (const eff of attackerEffects) {
          parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
        }
        // Show defender effects by name (flip sign since they're subtracted)
        for (const eff of defenderEffects) {
          parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
        }
        
        const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
        const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
        shiftDisplay = ` (${csBox} → ${effectiveRank})`;
      }

      // Build compact roll display: "Roll: 57 (42 + 15 karma)" or "Roll: 42"
      // Yellow box on raw roll indicates hover text available
      const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
      const rollDisplay = totalKarmaUsed 
        ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
        : rollBox;

      // Add manual mode notice if applicable
      const manualModeNotice = isManualMode ? `
        <div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
          Manual Mode: GM adjudicates
        </div>
      ` : "";

      // Compact chat card
      // For adjacent attacks (single roll, multiple targets), show "Attack vs X targets"
      // For regular attacks, show "Attack N of M"
      const attackIndicator = targetCount > 1
        ? `<span style="color:#666;font-weight:normal;font-size:.85em;flex-shrink:0;white-space:nowrap;">Attack vs ${targetCount} targets</span>`
        : `<span style="color:#666;font-weight:normal;font-size:.85em;flex-shrink:0;white-space:nowrap;">Attack ${attackNumber} of ${totalAttacks}</span>`;
      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <!-- Header: Action + Attack number -->
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span style="min-width:0;"><strong style="color:#8b0000;">${actionLabel.toUpperCase()}</strong>${weapon?.name ? `<br><span style="color:#555;font-size:.85em;font-weight:normal;">${weapon.name}</span>` : ''}</span>
            ${attackIndicator}
          </div>
          
          <!-- Attacker → Target -->
          <div style="padding:4px 10px;font-size:.95em;">
            <strong>${actor.name}</strong>${targetActor ? ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${targetName}</strong>` : ''}
          </div>
          
          ${multiAttackFeatHtml}
          ${variantBadge}
          
          <!-- Ability + Roll + Result -->
          <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
            <div>${ability.name}: ${ability.rank}${shiftDisplay}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>Roll: ${rollDisplay}</span>
              <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${targetBg};color:${targetFg};">
                ${String(targetEffectColor).toUpperCase()} — ${String(targetEffectResult).toUpperCase()}
              </span>
            </div>
          </div>
          
          ${evasionNote}
          ${killWarning}
          
          <!-- Damage -->
          ${(() => {
            if (!targetIsHit) {
              // Miss - show zero damage with reason
              const missReason = evasionNote ? "evaded" : "miss";
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;color:#666;">
                <strong>Damage:</strong> 0 (${missReason})
              </div>`;
            }
            
            // Build damage source hover text
            const sourceHover = damageNote || `${sourceName}`;
            const dmgBox = `<span title="${sourceHover}" style="cursor:help;">${rawDamage}</span>`;
            
            // Check if damage was pulled
            let pullNote = "";
            if (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage) {
              pullNote = ` <span style="color:#ff6f00;">(→${choice.pulledDamage} pulled)</span>`;
            }
            
            // Build result cap note
            let capNote = "";
            if (choice.resultCap && choice.resultCap !== 'none') {
              capNote = ` <span style="color:#ff6f00;">(capped ${choice.resultCap})</span>`;
            }
            
            // Build armor display if applicable
            if (armorValue > 0 && targetActor) {
              // Build armor hover text with rank if available
              const isEnergy = armorData?.isEnergyDamage;
              const armorRank = isEnergy ? armorData?.energyRank : armorData?.physicalRank;
              const armorType = armorData?.isForceField ? "Force Field" : "Body Armor";
              const _apFlat = Number(choice?.armorPiercing || 0);
              const _apCS   = Number(choice?.armorPiercingCS || 0);
              const _apMode = choice?.apMode || "value";
              const _apApplied = (_apMode === "cs" && _apCS > 0) || (_apMode !== "cs" && _apFlat > 0);
              const _apNote = _apApplied
                ? (_apMode === "cs"
                    ? ` <span style="color:#1565c0;font-size:.85em;" title="AP ammo: armor reduced ${_apCS}CS">(AP -${_apCS}CS)</span>`
                    : ` <span style="color:#1565c0;font-size:.85em;" title="Armor Piercing: armor reduced by ${_apFlat}">(AP -${_apFlat})</span>`)
                : "";
              const armorHover = armorRank ? `${armorRank} ${armorType} (${armorValue})` : `${armorType} (${armorValue})`;
              const armorBox = `<span title="${armorHover}" style="cursor:help;">${armorValue} armor</span>`;
              
              if (!game.user.isGM) {
                // Player sees net damage only
                return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                  <strong>Damage:</strong> <strong>${afterArmor}</strong>${capNote}
                </div>`;
              }
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <strong>Damage:</strong> ${dmgBox}${pullNote} − ${armorBox}${_apNote} = <strong>${afterArmor}</strong>${capNote}
              </div>`;
            } else {
              // No armor - simple display
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <strong>Damage:</strong> ${dmgBox}${pullNote}${capNote}
              </div>`;
            }
          })()}
          
          ${inlineSlamHtml}
          ${inlineStunHtml}
          ${inlineBreakingHtml}
          
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

      // Pre-stamp resolvedChecks BEFORE message creation so the
      // chat-hooks render-time chip auto-fire can see it and skip checks
      // this attack-action will auto-trigger itself. Without this pre-stamp,
      // both paths fire applySlam/applyStun and the delete-then-create
      // dedup inside those wrappers makes Times-Up emit a phantom
      // "expired" card for the deleted intermediate AE.
      if (!isManualMode) {
        const SCOPE_ID = game.system?.id || "msh-faserip";
        const willResolve = [];
        if (showSlam) willResolve.push("slam");
        if (showStun) willResolve.push("stun");
        if (showKill) willResolve.push("kill");
        if (willResolve.length) {
          damageFlags[SCOPE_ID] = {
            ...(damageFlags[SCOPE_ID] || {}),
            resolvedChecks: willResolve
          };
        }
      }

      const attackChatMsg = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cardHtml,
        flags: damageFlags
      });

      // ============================================================
      // FIX: Auto-apply damage with wasKillResult for kill-capable attacks
      // ============================================================
      if (!isManualMode && this.opts?.autoApply && targetIsHit && rawDamage > 0 && targetActor) {
        debugLog("Auto-applying damage in full auto mode", {
          damage: rawDamage,
          afterArmor,
          target: targetName,
          wasKillResult: showKill  // NEW: pass kill result
        });

        await applyDamageToTargets({
          damage: afterArmor,  // Use after-armor damage (includes pull punch cap)
          attackerUuid: actor.uuid,
          damageType: damageType,
          showNotification: false,
          bypassArmor: true,  // Armor already calculated above
          attackForm: attackForm,
          armorPiercing: choice.armorPiercing || 0,
          bypassForceField: !!choice?.bypassForceField,
          targets: [target],
          // === FIX: Pass kill result flag ===
          wasKillResult: showKill,
          forceKilling: showKill  // ensure kill save triggers on red
        });

        // ── Continuing damage (corrosive, acid, etc.) ──
        // If the source power has continuingDamage flagged OR is an inherently
        // ongoing type (corrosive, rotting per RAW), register an ongoing effect
        // on the target for subsequent-round damage per the schedule.
        const weapon = choice?.weapon;
        const wSys = weapon?.system || {};
        const nameLc = String(weapon?.name || "").toLowerCase();
        const dtLc = String(wSys.damageType || "").toLowerCase();
        const isCorrosive = /corrosive|acid/.test(nameLc) || /corrosive|acid/.test(dtLc);
        const isRotting = /rotting|decay/.test(nameLc);
        const continuingByRule = isCorrosive || isRotting;
        const continuingByAuthor = wSys.continuingDamage === true;
        if (weapon?.type === "power" && (continuingByAuthor || continuingByRule) && afterArmor > 0) {
          const { applyContinuingDamage } = await import("../effects/ongoing-engine.js");
          const totalRounds = Math.max(1, Number(wSys.continuingDamageRounds) || 3);
          const pattern = continuingByRule ? "diminishing-2cs" : "constant";
          const canWash = isCorrosive;
          await applyContinuingDamage(targetActor, {
            name: `${weapon.name} — Continuing`,
            initialRank: wSys.rank || "Typical",
            pattern,
            rounds: totalRounds,
            includeInitial: false,  // initial hit already applied via applyDamageToTargets
            canWash,
            damageType: wSys.damageType || damageType,
            originUuid: actor.uuid,
            img: isCorrosive ? "icons/svg/acid.svg" : "icons/svg/blood.svg",
          });
        }
      }

      // ============================================================
      // Auto-trigger status effect checks in full auto AND semi mode.
      // Slam/stun/kill are mechanical consequences of the attack roll,
      // not player choices — they should resolve before the next attack.
      // Damage application (above) remains gated on autoApply (full auto only).
      // ============================================================
      if (!isManualMode && canEffectsApply(penetratingDamage, { borderline: isBorderline }) && targetActor && !targetIsVehicle) {
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
          borderline: isBorderline
        };

        // === AUTO-TRIGGER SLAM CHECK ===
        // In consolidated mode, pass pre-rolled result; otherwise normal flow
        if (showSlam) {
          debugLog("Auto-triggering Slam check", { 
            target: targetName, 
            damage: penetratingDamage,
            attackerStrength: attackerStrengthRank,
            hasPreRolledResult: !!inlineSlamResult,
            useConsolidated
          });
          
          try {
            await ActionDispatcher.roll("slam", {
              actor: targetActor,  // Defender makes the save
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: attackForm,
                // In consolidated mode, skip chat message and use pre-rolled result
                skipChatMessage: useConsolidated,
                preRolledResult: inlineSlamResult,
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
        // In consolidated mode, pass pre-rolled result; otherwise normal flow
        if (showStun) {
          debugLog("Auto-triggering Stun check", { 
            target: targetName, 
            damage: penetratingDamage,
            hasPreRolledResult: !!inlineStunResult,
            useConsolidated
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
                // In consolidated mode, skip chat message and use pre-rolled result
                skipChatMessage: useConsolidated,
                preRolledResult: inlineStunResult,
                prefill: {
                  ...basePrefill
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Stun failed:", e);
          }
        }

        // === KILL CHECK ===
        // NOTE: Kill check is now handled by applyDamageToTargets which calls death-save
        // with the Kill Check embedded. We no longer trigger a separate kill check here
        // to avoid duplicate chat cards.
        // See: action-utils.js applyDamageToTargets() line ~1445
      }
      // ============================================================
      // END v1.6.0 auto-trigger block
      // ============================================================

      // Mark auto-triggered checks as resolved so chat chips grey out
      if (attackChatMsg && !isManualMode) {
        const resolved = [];
        if (showSlam) resolved.push("slam");
        if (showStun) resolved.push("stun");
        if (showKill) resolved.push("kill");
        if (resolved.length) {
          try {
            const SCOPE = game.system?.id || "msh-faserip";
            await attackChatMsg.setFlag(SCOPE, "resolvedChecks", resolved);
          } catch (e) {
            console.warn("[FASERIP WARN] Could not set resolvedChecks flag:", e);
          }
        }
      }

      // ============================================================
      // ENTANGLING WEAPON CHECK: If weapon has entangling flag and hit landed
      // Rules: Agility FEAT to hit (already resolved), then target Agility FEAT
      // vs material strength or enmeshed. Handled by entangling-action.
      // ============================================================
      if (targetIsHit && weapon?.system?.entangling && targetActor) {
        try {
          const { processEntanglingHit } = await import("./entangling-action.js");
          await processEntanglingHit({
            attacker: actor,
            target: targetActor,
            weapon,
            weaponMaterialStrength: weapon.system.materialStrength || "Typical"
          });
        } catch (e) {
          console.error("[FASERIP ERROR] Entangling check failed:", e);
        }
      }

      // ============================================================
      // POST-HIT CALLBACK: variant-specific follow-ups (mercy KO drug,
      // area-effect ripple, etc). Called once per resolved target with
      // the attack outcome. Fire-and-forget — exceptions logged but do
      // not interrupt the rest of the attack chain.
      // ============================================================
      if (postHitCallback && targetActor) {
        try {
          await postHitCallback({
            targetActor,
            target,
            targetName,
            isHit: targetIsHit,
            color: colorLower,
            rawDamage,
            afterArmor,
            penetratingDamage,
            damageType,
            attackForm,
            weapon,
            actor
          });
        } catch (e) {
          console.error("[FASERIP ERROR] postHitCallback failed:", e);
        }
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
      // Use the tracked actual hit status (accounts for evasion)
      const hit = anyTargetActuallyHit;

        await game.msh.playCombatSFX({
          item: weapon,
          actionType,
          damageType: dmgType,
          rollResult,
          isHit: hit,
          sourceName
        });

        // Play matching visual FX (no-op if disabled or Sequencer absent)
        if (game.msh?.fx?.playAttack) {
          await game.msh.fx.playAttack({
            actor: this.actor,
            item: weapon,
            actionType,
            damageType: dmgType,
            isHit: hit,
            targets: Array.isArray(this?.targets) ? this.targets : null
          });
        }

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

            // Decide rounds to spend: prefer HUD/sender opts, then weapon rate of fire, else 1
            const candidates = [
              this?.opts?.roundsFired,
              this?.opts?.shotsToSpend,
              sys.rate
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