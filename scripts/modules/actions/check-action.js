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

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

/** Small util */
function rankIndex(r) {
  return Math.max(0, RANKS.findIndex(x => x.toLowerCase() === String(r||"").toLowerCase()));
}

export class CheckAction extends BaseAction {
  constructor(actor, actionType, opts = {}) {
    super(actor, actionType, opts);
  }

  /** Build a simple select */
  _rankOptions(selected) {
    return RANKS.map(r => `<option value="${r}" ${String(r).toLowerCase()===String(selected).toLowerCase()?"selected":""}>${r}</option>`).join("");
  }

  async execute() {
    const actor       = this.actor;
    const actionType  = String(this.actionType || "").toLowerCase(); // "stun" | "slam" | "kill" | "save-nullify"
    const actionName  = labelFor(actionType);
    const mapping     = effectsFor(actionType) || {};
    const attackerStr = getAbilityInfo(actor, "strength");

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
          await this._createStunnedEffect(defenderUuid, targetName, 1);
        }
      }

      // SLAM (single-resolution; use rolled color)
      if (actionType === "slam" && !effectsSuppressed) {
        await this._createSlamEffect(actor, { targetUuid: defenderUuid, dmgThrough, targetEndRank }, colorLower);
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
        actionType, attackerStr, colorLower, finalEffect: effectText, effectsSuppressed,
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
      actionType, attackerStr, colorLower, finalEffect, effectsSuppressed
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

  async _createSlamEffect(ownerActor, { targetUuid="", dmgThrough=0 }={}, colorLower="white") {
    const targetActor = await this._resolveTokenActor(targetUuid);
    if (!targetActor) return;

    // Canonical mapping: Green=Stagger, Yellow=1 area (prone), Red=Grand Slam (STR-based areas, prone)
    let kind = "No Slam", knockbackAreas = 0, prone = false, stagger = false;
    switch (colorLower) {
      case "green":
        kind = "Stagger"; stagger = true; break;
      case "yellow":
        kind = "1 area"; knockbackAreas = 1; prone = true; break;
      case "red":
        kind = "Grand Slam"; knockbackAreas = this._strengthToAreas(getAbilityInfo(ownerActor,"strength").rank); prone = true; break;
      default:
        kind = "No Slam"; break;
    }
    // You can keep dmgThrough for future rules; not used in this base effect
    await Effects.applySlam(targetActor, { kind, knockbackAreas, prone, stagger });
    ui.notifications.info(`${targetActor.name}: ${kind}${knockbackAreas?` (${knockbackAreas} area${knockbackAreas>1?"s":""})`:""}`);
  }

  _extraExplanationHtml({ actionType, attackerStr, colorLower, finalEffect, effectsSuppressed, stunDuration=null, rawStunDuration=null }) {
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
      const strRank = attackerStr?.rank || "Typical";
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
} // end class
