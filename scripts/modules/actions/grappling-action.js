// scripts/modules/actions/grappling-action.js v2.2.0 - 2025-12-27
// v2.2.0: Add opts.prefill support for Grapple Back from escape reverse
// v2.1.0: Add Deal Hold Damage chip on Full Hold (red) result
// v2.0.0: Compact chat card format matching blunt attack (inline result badge, CS hover, no grid)
// v1.5.0: Fix karma checkbox to always default unchecked (not persisted)
// v1.4.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.3.0: Fix escape button to pass holder info for dialog prefill
// v1.2.0: Use effect-engine wrappers for Partial Hold/Full Hold effects
// v1.1.0: Add inline rolls for consolidated chat cards
import { AttackAction } from "./attack-action.js";
import {
  RANKS,
  getStrengthInfo, 
  shiftRank, 
  rollWithKarmaAndHistory,
  buildActionsBox,
  bannerColors, 
  labelFor, 
  effectsFor,
  applyCapabilitiesToDialog,
  showDiceAnimation
} from "./action-utils.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";
import { applyGrappled, applyHeld } from "../effects/effect-engine.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";

export class GrapplingAction extends AttackAction {
  constructor(args) {
    super(args);
    this.actionType = "grappling";
    this.label = labelFor(this.actionType);
    this.effects = effectsFor(this.actionType);
  }

  async execute() {
    const actor = this.actor;
    const actionName = this.label;
    const strength = getStrengthInfo(actor);

    // Load persisted defaults (karma checkbox never persisted - always starts unchecked)
    const savedShift = await actor.getFlag("msh-faserip", "lastGrappleShift") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastGrappleRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastGrappleSkipDice")) ?? false;
    const savedSpendKarma = false; // Always default to unchecked
    const savedCsNotes = (await actor.getFlag("msh-faserip", "lastGrappleCsNotes")) || "";
    const dialogShift = this.opts?.shift ?? (savedRemember ? savedShift : 0);

    const choice = await this._showGrapplingDialog(actor, strength, { 
      savedShift: dialogShift, 
      savedSpendKarma, 
      savedRemember, 
      savedSkipDice,
      savedCsNotes
    });
    if (!choice) return;

    // Always save remember/skipDice preferences
    await actor.setFlag("msh-faserip", "rememberSettings", choice.remember);
    await actor.setFlag("msh-faserip", "skipDiceRoll", choice.skipDice);
    await actor.setFlag("msh-faserip", "lastGrappleRemember", choice.remember);
    await actor.setFlag("msh-faserip", "lastGrappleSkipDice", choice.skipDice);

    // Persist settings if requested (karma checkbox never persisted)
    if (choice.remember) {
      await actor.setFlag("msh-faserip", "lastGrappleShift", choice.shift);
      await actor.setFlag("msh-faserip", "lastGrappleCsNotes", choice.csNotes || "");
    }

    // Build shift breakdown for hover text
    const shiftBreakdown = {
      manual: choice.shift || 0,
      csNotes: choice.csNotes || ""
    };

    // Get effect-based modifiers
    const attackerEffects = getAttackShiftBreakdown(actor);
    let targetActor = null;
    let defenderEffects = { total: 0, breakdown: [] };
    
    if (choice.targetUuid) {
      try {
        const tDoc = await fromUuid(choice.targetUuid);
        targetActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
        if (targetActor) {
          defenderEffects = getDefenseShiftBreakdown(targetActor, false);
        }
      } catch (_e) { /* ignore */ }
    }

    // Calculate total shift including effects
    const manualShift = choice.shift || 0;
    const effectShift = (attackerEffects.total || 0) - (defenderEffects.total || 0);
    const totalShift = manualShift + effectShift;

    const effectiveRank = shiftRank(strength.rank, totalShift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    const roll = await (new Roll("1d100")).evaluate();
    
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} attempts to Grapple ${choice.targetName}`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
        await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effect = this.effects[colorLower] || "Miss";
    const { bg, fg } = bannerColors(colorLower);

    // Show escape button for Partial Hold and Hold results
    const showEscape = (colorLower === "yellow" || colorLower === "red");
    if (showEscape && choice?.targetUuid) {
      try {
        const tDoc = await fromUuid(choice.targetUuid);
        const tActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
        if (tActor) {
          // Remove any existing hold effects
          const existingHolds = tActor.effects?.filter(e => 
            e.statuses?.has?.("grappled") || 
            e.statuses?.has?.("held") ||
            e.getFlag?.("core", "statusId") === "partial-hold" ||
            e.getFlag?.("core", "statusId") === "full-hold"
          );
          for (const eff of existingHolds || []) {
            await eff.delete();
          }
          
          // Apply appropriate hold effect using effect-engine
          if (colorLower === "yellow") {
            // Partial Hold = Grappled
            await applyGrappled(tActor, { 
              holderUuid: actor.uuid, 
              holderName: actor.name,
              rounds: null  // Until escaped
            });
          } else {
            // Full Hold = Held
            await applyHeld(tActor, { 
              holderUuid: actor.uuid, 
              holderName: actor.name,
              rounds: null  // Until escaped
            });
          }
        }
      } catch (e) {
        console.warn("[FASERIP WARN] Grappling hold status failed", e);
      }
    }
    
    // For the escape button, the "defender" is the HOLDER (this actor), not the target
    // This prefills the escape dialog with the holder's name and strength
    const holderStrength = actor.system?.abilities?.strength?.rank || "Good";
    
    // Show Hold Damage button only on Full Hold (red)
    const showHoldDamage = (colorLower === "red");
    
    const actions = buildActionsBox({
      showEscape: showEscape,
      showHoldDamage: showHoldDamage,
      holdDamageMax: strength.value,
      holdDamageRank: strength.rank,
      holdTargetUuid: choice.targetUuid || "",
      holdTargetName: choice.targetName || "Target",
      // Escape chip uses targetUuid/Name/Strength for the holder (opponent to escape from)
      targetUuid: actor.uuid,
      targetName: actor.name,
      targetStrength: holderStrength,
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,
    });

    const cardHtml = this._buildChatCard({
      actor, 
      choice, 
      strength, 
      effectiveRank, 
      roll, 
      totalKarmaUsed, 
      cappedTotal, 
      color, 
      effect,
      bg, 
      fg,
      actions,
      totalShift,
      shiftBreakdown,
      attackerEffects: attackerEffects.breakdown,
      defenderEffects: defenderEffects.breakdown
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showGrapplingDialog(actor, strength, { savedShift = 0, savedSpendKarma = false, savedRemember = false, savedSkipDice = false, savedCsNotes = "" } = {}) {
    // Auto-fill target from opts prefill first, then from targeted token
    let prefillTargetName = this.opts?.prefill?.targetName || "";
    let prefillTargetStr  = this.opts?.prefill?.targetStrength || "";
    let prefillTargetUuid = this.opts?.prefill?.targetUuid || "";
    
    // If no prefill from opts, try from targeted token
    if (!prefillTargetName) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        const tok = targets[0];
        prefillTargetName = tok?.name || "";
        prefillTargetStr  = tok?.actor?.system?.abilities?.strength?.rank || "";
        prefillTargetUuid = tok?.actor?.uuid || "";
      }
    }

    // Check for Wrestling talent (+2 CS)
    const hasWrestling = actor.items?.some(i => 
      i.type === "talent" && 
      (i.name?.toLowerCase().includes("wrestling") || i.system?.wrestling)
    );

    const dialogHtml = `
      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target</div>
          <input type="text" name="targetName" style="width:100%;margin-top:4px;font-weight:600;" placeholder="e.g., Doctor Doom" value="${prefillTargetName}">
          <div style="margin-top:4px;">
            <span style="color:#666;font-size:.85em;">STR:</span>
            <input type="text" name="targetStrength" style="width:80px;" placeholder="Excellent" value="${prefillTargetStr}">
          </div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Grapple</div>
          <div style="font-weight:600;">Strength: ${strength.rank}</div>
          <div style="color:#666;">Rank Value: ${strength.value}</div>
          ${hasWrestling ? `<div style="color:#2e7d32;font-size:.85em;">Wrestling Talent: +2 CS</div>` : ''}
        </div>
      </div>

      <!-- Column Shift with Notes -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#fff8e1;border:1px solid #ffc107;border-radius:3px;">
        <div>
          <label style="font-weight:600;color:#666;font-size:.85em;">CS:</label>
          <input type="number" name="shift" value="${Number(savedShift)}" style="width:50px;text-align:center;">
        </div>
        <div>
          <input type="text" name="csNotes" value="${savedCsNotes}" placeholder="CS explanation (e.g., Wrestling +2, Stunned -2)" style="width:100%;font-size:.9em;">
        </div>
      </div>

      ${generateKarmaControlsHTML(actor, savedSpendKarma)}
      
      <div style="display:flex;gap:16px;margin-top:8px;">
        <label style="font-size:.9em;"><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember settings</label>
        <label style="font-size:.9em;"><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice animation</label>
      </div>

      <div style="margin-top:12px;padding:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:4px;">Grappling Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss (White/Green):</strong> No hold; no other attacks this round.<br>
          <strong>Partial Hold (Yellow):</strong> Target acts at -2 CS; no move if your STR ≥ target STR; no damage.<br>
          <strong>Full Hold (Red):</strong> Target restrained; you may inflict up to STR damage and take one other action.
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: `Grappling: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              const $ = (s) => html.find(s);
              const { spendKarma } = extractKarmaFromDialog(html);
              resolve({
                targetName:     String($('[name="targetName"]').val() || "Target"),
                targetStrength: String($('[name="targetStrength"]').val() || ""),
                targetUuid:     prefillTargetUuid,
                shift:          Number(($('[name="shift"]').val() ?? $('[name="columnShift"]').val() ?? 0)),
                csNotes:        String($('[name="csNotes"]').val() || ""),
                spendKarma,
                remember:       (
                  !!$('[name="remember"]').is(':checked') ||
                  !!$('[name="rememberSettings"]').is(':checked')
                ),
                skipDice:       (
                  !!$('[name="skipDice"]').is(':checked') ||
                  !!$('[name="skipDiceRoll"]').is(':checked')
                )
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          setupKarmaControlHandlers(html);
          applyCapabilitiesToDialog(html, "grappling", { actor });
        }
      }).render(true);
    });
  }

  _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, bg, fg, actions, totalShift, shiftBreakdown, attackerEffects = [], defenderEffects = [] }) {
    const effectLower = String(effect).toLowerCase();
    
    // Build CS hover breakdown
    let shiftDisplay = "";
    if (totalShift !== 0) {
      const parts = [];
      
      // Manual shift from dialog
      if (shiftBreakdown?.manual && shiftBreakdown.manual !== 0) {
        if (shiftBreakdown.csNotes) {
          parts.push(shiftBreakdown.csNotes);
        } else {
          parts.push(`${shiftBreakdown.manual > 0 ? '+' : ''}${shiftBreakdown.manual}`);
        }
      }
      
      // Attacker effects
      for (const eff of attackerEffects) {
        parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
      }
      
      // Defender effects (flip sign)
      for (const eff of defenderEffects) {
        parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
      }
      
      const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
      const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
      shiftDisplay = ` (${csBox} → ${effectiveRank})`;
    }

    // Build roll display with yellow hover box
    const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
    const rollDisplay = totalKarmaUsed 
      ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
      : rollBox;

    // Effect-specific blocks
    const partialMovement = choice.targetStrength
      ? this._compareRanks(strength.rank, choice.targetStrength) >= 0
        ? `<div style="color:#f57f17;font-weight:bold;">Target cannot move (STR ${strength.rank} ≥ ${choice.targetStrength})</div>`
        : `<div>Target can still move (STR ${strength.rank} &lt; ${choice.targetStrength})</div>`
      : `<div style="color:#666;font-style:italic;">Movement restriction depends on relative Strength</div>`;

    const effectBlocks = {
      miss: `
        <div style="padding:6px 10px;margin:4px 10px 6px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#c62828;">Miss</div>
          <div>No hold established. ${actor.name} may not make other attacks this round.</div>
        </div>`,
      partial: `
        <div style="padding:6px 10px;margin:4px 10px 6px;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#f57f17;">Partial Hold</div>
          <div>Target acts at -2 CS; no damage inflicted.</div>
          ${partialMovement}
        </div>`,
      hold: `
        <div style="padding:6px 10px;margin:4px 10px 6px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#2e7d32;">Full Hold</div>
          <div>Target fully restrained; cannot act.</div>
          <div>You may perform one additional action.</div>
          <div><strong>May inflict up to ${strength.rank} (${strength.value}) damage</strong> (subject to Body Armor)</div>
        </div>`
    };

    return `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <!-- Header -->
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">GRAPPLING</strong>
          <span style="color:#666;font-size:.85em;">Strength FEAT</span>
        </div>
        
        <!-- Attacker → Target -->
        <div style="padding:4px 10px;font-size:.95em;">
          <strong>${actor.name}</strong> <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${choice.targetName}</strong>
          ${choice.targetStrength ? `<span style="color:#666;font-size:.85em;margin-left:8px;">(STR: ${choice.targetStrength})</span>` : ''}
        </div>
        
        <!-- Ability + Roll + Result -->
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>Strength: ${strength.rank}${shiftDisplay}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>Roll: ${rollDisplay}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
            </span>
          </div>
        </div>
        
        ${effectBlocks[effectLower] || ""}
        ${actions}
      </div>
    `;
  }

  _compareRanks(a, b) {
    const R = ["Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"];
    return Math.sign(R.indexOf(a) - R.indexOf(b));
  }
}
