// scripts/modules/actions/check-action.js
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  labelFor,
  effectsFor,
  bannerColors,
  getAbilityInfo,
} from "./action-utils.js";
import { resolveKillFeat, getKillContextFromAttackForm } from "../../rules/kill-resolver.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import * as Effects from "../effects/effect-engine.js";
import * as Nullify from "./nullify.js";
import { resolveSlamFeat, getGrandSlamDistance } from "../combat/damage-resolution.js";

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
      opts: this.opts
    });

    const actor       = this.actor;
    const actionType  = String(this.actionType || "").toLowerCase(); // "stun" | "slam" | "kill" | "save-nullify"
    const actionName  = labelFor(actionType);
    const mapping     = effectsFor(actionType) || {};
    //const attackerStr = getAbilityInfo(actor, "strength");
    const targetAbility = getAbilityInfo(actor, this.abilityName || "endurance");

    // Prefill from opts (e.g., auto path or chat hook)
    const prefill     = this.opts?.prefill || {};

    // TDZ-safe flag computed early
    let isSaveNullify = false;

    // ------------------------------
    // FULL AUTO FAST-PATH
    // ------------------------------
    if (this?.opts?.autoApply === true) {
      // Compute variant id once
      const actionId = String(
        this?.actionId || this?.type || this?.opts?.actionId || this?.opts?.checkType || this?.actionType || ""
      ).toLowerCase();
      isSaveNullify = (actionId === "save-nullify" || actionId === "nullify-save" || actionId === "force-save-nullify");

      // Build choice (synthetic dialog result)
      const targetName    = prefill.targetName     || "Target";
      const targetEndRank = prefill.targetEndRank  || "Good";
      const shift         = Number(prefill.shift ?? 0) || 0;
      const dmgThrough    = Number(prefill.dmgThrough ?? 0) || 0;
      const borderline    = !!prefill.borderline;
      const attackForm    = String(prefill.attackForm || this?.opts?.attackForm || "blunt").toLowerCase();
      const defenderUuid  = prefill.targetUuid || prefill.defenderUuid || "";

      const effectiveEndRank = shift ? shiftRank(targetEndRank, shift) : targetEndRank;

      // Roll percent
      const roll = new Roll("1d100");
      await roll.evaluate(); // v13+: do not pass {async:true}
      if (!this.opts?.skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `${actionName}: ${targetName} (${effectiveEndRank})`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }
      const capped = Math.min(100, roll.total);
      const color = (typeof rollUniversalTable === "function")
        ? rollUniversalTable(effectiveEndRank, capped)
        : (game?.msh?.rollUniversalTable?.(effectiveEndRank, capped) ?? "white");
      const colorLower = String(color || "white").toLowerCase();

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
      let rawDuration  = null;
      if (actionType === "stun" && !effectsSuppressed) {
        if (colorLower === "white") {
          // White = 1-10 rounds (roll 1d10)
          const d = new Roll("1d10");
          await d.evaluate();
          rawDuration = d.total;
          const maxDur = game.settings?.get?.("msh-faserip","maxStunDuration") || 10;
          stunDuration = Math.min(rawDuration, maxDur);
          await d.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${targetName} Stun Duration (1d10)${rawDuration>stunDuration?` - capped ${maxDur}`:""}`
          });
          await this._createStunnedEffect(defenderUuid, targetName, stunDuration);
        } else if (colorLower === "green") {
          // Green = 1 round
          await this._createStunnedEffect(defenderUuid, targetName, 1);
        }
        // Yellow/Red = No effect (no stun applied)
      }

      // SLAM - CORRECTED LOGIC (White = worst, Red = best for defender)
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
        
        // Create detailed chat message based on effect
        await this._createSlamChatMessage({
          targetName,
          targetUuid: defenderUuid,
          slamEffect,
          knockbackDistance,
          attackerStrength,
          attackerStrengthRank,
          attackerName,
          colorLower
        });
        
        // Create the Active Effect
        if (slamEffect !== "No Slam") {
          await this._createSlamEffect(actor, {
            targetUuid: defenderUuid,
            slamEffect,
            knockbackDistance,
            attackerStrength
          });
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
            ui.notifications.warn(`${targetActor.name} is DYING (Endurance steps down each round unless stabilized).`);
          }
        }
      }

      // NULLIFY (NEVER damage-gated)
      if (isSaveNullify) {
        // Prefer the targeted Token's synthetic actor (handles unlinked tokens)
        const saveActor = await this._resolveTokenActor(defenderUuid || (this.opts?.prefill?.targetUuid || ""));
        if (saveActor) {
          const endRank     = targetEndRank;
          let intensityRank = endRank;
          if (this?.opts?.powerRankName) intensityRank = this.opts.powerRankName;
          if (this?.opts?.intensity === "fixed-rank" && this?.opts?.fixedRank) intensityRank = this.opts.fixedRank;

          await Nullify.resolveAndApply(actor, saveActor, {
            endRank,
            intensityRank,
            rolledColor: colorLower,
            originUuid: this?.opts?.originUuid ?? null
          });
        }
      }

      // Build and post a light-weight chat card
      const banner = bannerColors[colorLower] || { bg:"#eee", fg:"#333", bd:"#ccc" };
      const effectText = (actionType === "kill") ? (baseEffect || color) : (mapping[colorLower] || color);
      const extraHtml  = this._extraExplanationHtml({
        actionType, targetAbility, colorLower, finalEffect: effectText, effectsSuppressed,
        stunDuration, rawStunDuration: rawDuration
      });

      const content = `
        <div style="border:1px solid ${banner.bd};border-radius:3px;overflow:hidden;">
          <div style="padding:6px 10px;background:${banner.bg};color:${banner.fg};border-bottom:1px solid ${banner.bd};">
            <b>${actor.name}</b> — ${labelFor(actionType)} vs <b>${targetName}</b>
          </div>
          <div style="padding:8px 10px;font-size:.95em;">
            <div><b>Result:</b> <span style="text-transform:capitalize">${colorLower}</span> — ${effectText}</div>
            ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;">No damage penetrated → effect suppressed.</div>` : ""}
            ${extraHtml || ""}
          </div>
        </div>
      `;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        flags: { [SCOPE()]: { autoChecksDone: true } }
      });
      return;
    } // end auto fast-path

    // ------------------------------
    // MANUAL / SEMI: show a compact dialog
    // ------------------------------
    const targetRanks = this._rankOptions(prefill.targetEndRank || "Good");
    const preDmg = Number(prefill.dmgThrough ?? 0) || 0;
    const html = `
      <div class="frp-dialog" style="min-width:410px;">
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Target Name:</label>
          <input type="text" name="targetName" value="${prefill.targetName||"Target"}" style="width:220px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Target Endurance:</label>
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

    const effectiveEndRank = choice.shift ? shiftRank(choice.targetEndRank, choice.shift) : choice.targetEndRank;
    const roll = new Roll("1d100");
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actionName}: ${choice.targetName} (${effectiveEndRank})`
    });
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
    if (actionType === "stun" && !effectsSuppressed) {
      if (colorLower === "white") {
        const d = new Roll("1d10");
        await d.evaluate();
        const maxDur = game.settings?.get?.("msh-faserip","maxStunDuration") || 10;
        const dur = Math.min(d.total, maxDur);
        await d.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${choice.targetName} Stun Duration (1d10)` });
        await this._createStunnedEffect(this.opts?.prefill?.targetUuid || "", choice.targetName, dur);
      } else if (colorLower === "green") {
        await this._createStunnedEffect(this.opts?.prefill?.targetUuid || "", choice.targetName, 1);
      }
    }

    if (actionType === "slam" && !effectsSuppressed) {
      await this._createSlamEffect(actor, { targetUuid: this.opts?.prefill?.targetUuid || "", dmgThrough: choice.dmgThrough }, colorLower);
    }

    if (actionType === "kill" && !effectsSuppressed) {
      const hasEndLoss = String(finalEffect || "").toLowerCase().includes("endurance");
      if (hasEndLoss) {
        const targetActor = await this._resolveTokenActor(this.opts?.prefill?.targetUuid || "");
        if (targetActor) {
          await Effects.applyDying(targetActor, {
            enduranceValue: targetActor.system?.abilities?.endurance?.value ?? 10
          });
          ui.notifications.warn(`${targetActor.name} is DYING (Endurance steps down each round unless stabilized).`);
        }
      }
    }

    const banner = bannerColors[colorLower] || { bg:"#eee", fg:"#333", bd:"#ccc" };
    const extraHtml  = this._extraExplanationHtml({
      actionType, targetAbility, colorLower, finalEffect, effectsSuppressed
    });
    const content = `
      <div style="border:1px solid ${banner.bd};border-radius:3px;overflow:hidden;">
        <div style="padding:6px 10px;background:${banner.bg};color:${banner.fg};border-bottom:1px solid ${banner.bd};">
          <b>${actor.name}</b> — ${labelFor(actionType)} vs <b>${choice.targetName}</b>
        </div>
        <div style="padding:8px 10px;font-size:.95em;">
          <div><b>Result:</b> <span style="text-transform:capitalize">${colorLower}</span> — ${finalEffect}</div>
          ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;">No damage penetrated → effect suppressed.</div>` : ""}
          ${extraHtml || ""}
        </div>
      </div>
    `;
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
    await Effects.applyStun(targetActor, { rounds });
    ui.notifications.info(`${targetName || targetActor.name}: Stunned for ${rounds} round${rounds>1?"s":""}.`);
  }

  _strengthToAreas(rankName) {
    // Rough mapping; tweak as desired
    const idx = rankIndex(rankName);
    if (idx <= rankIndex("Typical"))    return 1;
    if (idx <= rankIndex("Excellent"))  return 2;
    if (idx <= rankIndex("Remarkable")) return 3;
    if (idx <= rankIndex("Incredible")) return 4;
    if (idx <= rankIndex("Amazing"))    return 5;
    return 6;
  }

  async _createSlamEffect(actor, options) {
    const { targetUuid, slamEffect, knockbackDistance, attackerStrength } = options;
    const targetActor = await this._resolveTokenActor(targetUuid);
    if (!targetActor) return;
    
    const SCOPE = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    let effectData = null;
    
    if (slamEffect === "Grand Slam") {
      effectData = {
        name: `Grand Slam (Knockback ${knockbackDistance} areas)`,
        icon: "icons/svg/falling.svg",
        origin: this.actor?.uuid ?? null,
        flags: {
          [SCOPE]: {
            effectType: "grandSlam",
            slamSpeed: knockbackDistance,
            attackerStrength
          }
        },
        changes: [
          { key: "system.status.prone", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
        ],
        duration: {
          rounds: 2,
          startRound: game.combat?.round ?? 0
        },
        statuses: ["prone"]
      };
    } else if (slamEffect === "1 Area") {
      effectData = {
        name: "Slammed (1 Area)",
        icon: "icons/svg/falling.svg",
        origin: this.actor?.uuid ?? null,
        flags: {
          [SCOPE]: { slammed: true, distance: 1 }
        },
        changes: [
          { key: "system.status.prone", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
        ],
        duration: {
          rounds: 1,
          startRound: game.combat?.round ?? 0
        },
        statuses: ["prone"]
      };
    } else if (slamEffect === "Stagger") {
      effectData = {
        name: "Staggered",
        icon: "icons/svg/stoned.svg",
        flags: {
          [SCOPE]: { staggered: true }
        },
        duration: {
          rounds: 1,
          startRound: game.combat?.round ?? 0
        },
        statuses: ["staggered"]
      };
    }
    
    if (effectData) {
      await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
  }

  _extraExplanationHtml({ actionType, targetAbility, colorLower, finalEffect, effectsSuppressed, stunDuration=null, rawStunDuration=null }) {
    if (actionType === "stun") {
      const lines = {
        white: stunDuration ? `1–10 rounds Stunned — rolled ${stunDuration} rounds.` : "1–10 rounds Stunned — roll 1d10; no actions.",
        green: "1 round Stunned — no actions next round (can “play possum”).",
        yellow: "No effect.",
        red: "No effect."
      };
      return `<div style="margin-top:8px;color:#444;">${lines[colorLower]||""}</div>`;
    }
    if (actionType === "slam") {
      if (effectsSuppressed) {
        return `<div style="margin-top:8px;color:#b71c1c;">No damage penetrated — Slam does not apply.</div>`;
      }
      const strRank = targetAbility?.rank || "Typical";
      const areas   = this._strengthToAreas(strRank);
      const notes = {
        white: `No effect.`,
        green: `Stagger; half-move next round.`,
        yellow:`Knockback 1 area; prone.`,
        red:  `Grand Slam — knocked away up to ~${areas} areas; prone.`
      };
      return `<div style="margin-top:8px;color:#444;">${notes[colorLower]||""}</div>`;
    }
    if (actionType === "kill") {
      return `<div style="margin-top:8px;color:#444;">${String(finalEffect||"").replace(/E\/S/,"Edged/Shooting")}</div>`;
    }
    return "";
  }

  async _createSlamChatMessage(options) {
    const {
      targetName,
      targetUuid,
      slamEffect,
      knockbackDistance,
      attackerStrength,
      attackerStrengthRank,
      attackerName,
      colorLower
    } = options;
    
    let content = "";
    
    if (slamEffect === "Grand Slam") {
      content = `
        <div style="background-color:#8B0000;color:white;padding:10px;border-radius:5px;margin:5px 0;">
          <div style="font-size:1.2em;font-weight:bold;text-align:center;margin-bottom:8px;">💥 GRAND SLAM! 💥</div>
          <div style="padding:5px;font-size:0.9em;">
            <div><strong>${targetName}</strong> is launched away with tremendous force!</div>
            <div style="margin:5px 0;"><strong>Mechanical Effects:</strong></div>
            <div>• Attacker Strength: ${attackerStrengthRank} (${attackerStrength})</div>
            <div>• Knockback Distance: ${knockbackDistance} areas</div>
            <div>• Launch Speed: ${knockbackDistance} areas/round</div>
            <div>• Direction: ${attackerName} chooses (if damage dealt)</div>
            <div style="margin-top:8px;"><strong>Collision Damage:</strong></div>
            <div>• If target hits obstacle: charging damage applies</div>
            <div>• Buildings reduce knockback per movement rules</div>
            <div>• Target takes slam damage if hitting walls/objects</div>
          </div>
          <div style="margin-top:10px;text-align:center;">
            <button class="calculate-slam-collision"
                    data-target="${targetUuid}"
                    data-distance="${knockbackDistance}"
                    data-speed="${knockbackDistance}"
                    data-attacker-strength="${attackerStrength}"
                    style="background:#DB747E;color:white;border-radius:3px;padding:5px 10px;border-radius:3px;cursor:pointer;">
              Calculate Collision Damage
            </button>
          </div>
        </div>
      `;
    } else if (slamEffect === "1 Area") {
      content = `
        <div style="background-color:#DC3545;color:white;padding:10px;border-radius:5px;margin:5px 0;">
          <div style="font-size:1.2em;font-weight:bold;text-align:center;margin-bottom:8px;">💢 SLAMMED - 1 AREA 💢</div>
          <div style="padding:5px;font-size:0.9em;">
            <div><strong>${targetName}</strong> is knocked back 1 area!</div>
            <div style="margin:5px 0;"><strong>Mechanical Effects:</strong></div>
            <div>• Knocked 1 area away from attacker</div>
            <div>• May hit obstacles during knockback</div>
            <div>• Takes damage if slammed into walls/objects</div>
            <div>• ${attackerName} chooses direction (if damage dealt)</div>
            <div>• Target chooses direction (if no damage dealt)</div>
          </div>
          <div style="margin-top:10px;text-align:center;">
            <button class="calculate-slam-collision"
                    data-target="${targetUuid}"
                    data-distance="1"
                    data-speed="1"
                    data-attacker-strength="${attackerStrength}"
                    style="background:#DB747E;color:white;border-radius:3px;padding:5px 10px;border-radius:3px;cursor:pointer;">
              Calculate Collision Damage
            </button>
          </div>
        </div>
      `;
    } else if (slamEffect === "Stagger") {
      content = `
        <div style="background-color:#FFC107;color:black;padding:10px;border-radius:5px;margin:5px 0;">
          <div style="font-size:1.2em;font-weight:bold;text-align:center;margin-bottom:8px;">😵‍💫 STAGGERED 😵‍💫</div>
          <div style="padding:5px;font-size:0.9em;">
            <div><strong>${targetName}</strong> staggers from the impact!</div>
            <div style="margin:5px 0;"><strong>Mechanical Effects:</strong></div>
            <div>• Knocked back a step or two</div>
            <div>• No longer adjacent to attacker</div>
            <div>• Fully capable of combat next round</div>
            <div>• No movement penalty or damage</div>
            <div>• May fall off cliffs if near edges</div>
          </div>
        </div>
      `;
    } else { // No Slam
      content = `
        <div style="background-color:#28A745;color:white;padding:10px;border-radius:5px;margin:5px 0;">
          <div style="font-size:1.1em;font-weight:bold;text-align:center;margin-bottom:5px;">🛡️ SLAM RESISTED 🛡️</div>
          <div style="padding:5px;font-size:0.9em;">
            <div><strong>${targetName}</strong> plants their feet and resists!</div>
            <div style="margin:5px 0;"><strong>Effect:</strong></div>
            <div>• No knockback effect</div>
            <div>• Remains in current position</div>
            <div>• Still adjacent to attacker</div>
          </div>
        </div>
      `;
    }
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: "Slam Effect" }),
      content
    });
  }
} // end class
