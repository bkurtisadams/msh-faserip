// scripts/modules/actions/escaping-action.js v1.5.0 - 2025-12-27
// v1.5.0: Fix escape to only remove grappled on yellow/red (green is also Miss), fix karma default unchecked
// v1.4.0: Remove grappled/held effects on successful escape
// v1.3.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.2.0: Accept prefill from opts for opponent name/strength
// v1.1.0: Add inline rolls for consolidated chat cards
import { AttackAction } from "./attack-action.js";
import { 
  getStrengthInfo, 
  shiftRank, 
  rollWithKarmaAndHistory,
  buildResultGrid, 
  buildActionsBox,
  bannerColors, 
  labelFor, 
  effectsFor,
  getTargetingContext,
  buildInlineRollDisplay,
  showDiceAnimation
} from "./action-utils.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

/**
 * Remove grappled/held effects from an actor
 * @param {Actor} actor 
 */
async function removeHoldEffects(actor) {
  if (!actor?.effects) return;
  
  const holdEffects = actor.effects.filter(e => {
    if (e.disabled) return false;
    // Check statuses
    if (e.statuses?.has?.("grappled") || e.statuses?.has?.("held")) return true;
    // Check flags
    const flags = e.flags?.["msh-faserip"] || {};
    if (flags.effectType === "grappled" || flags.effectType === "held") return true;
    if (flags.status?.isGrappled || flags.status?.isHeld) return true;
    // Check name patterns
    const name = (e.name || "").toLowerCase();
    if (name.includes("grappled") || name.includes("held") || name.includes("partial hold") || name.includes("full hold")) return true;
    return false;
  });
  
  for (const eff of holdEffects) {
    try {
      await eff.delete();
      console.log(`[FASERIP] Removed hold effect: ${eff.name}`);
    } catch (err) {
      console.warn(`[FASERIP WARN] Failed to remove effect ${eff.name}:`, err);
    }
  }
}

export class EscapingAction extends AttackAction {
  constructor(args) {
    super(args);
    this.actionType = "escaping";
    this.label = labelFor(this.actionType);
    this.effects = effectsFor(this.actionType);
  }

  async execute() {
    const actor = this.actor;
    const actionName = this.label;
    const strength = getStrengthInfo(actor);
    
    const choice = await this._showDialog(actor, strength);
    if (!choice) return;

    // Escaping is rolled on the character's Strength
    const effectiveRank = shiftRank(strength.rank, choice.shift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    const roll = await (new Roll("1d100")).evaluate();
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} attempts to Escape a Hold`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    // Build inline roll display for consolidated mode
    const inlineRollHtml = useConsolidated ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal) : "";

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effect = this.effects[colorLower] || "Miss";

    const grid = buildResultGrid(this.actionType, colorLower, this.effects);
    const { bg, fg } = bannerColors(colorLower);
    const targetingContext = getTargetingContext(actor, actionName);

    // No special action buttons needed for escaping
    const actions = buildActionsBox({
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,

    });

    // Build roll info section - use inline display if consolidated, else plain text
    const rollInfoSection = inlineRollHtml ? `
      <div style="padding:5px 10px;font-size:.9em;">
        <div>Strength: ${strength.rank} (${strength.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
        ${choice.opponentStr ? `<div>Opponent STR: ${choice.opponentStr}</div>` : ``}
      </div>
      ${inlineRollHtml}
    ` : `
      <div style="padding:5px 10px;font-size:.9em;">
        <div>Strength: ${strength.rank} (${strength.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
        ${choice.opponentStr ? `<div>Opponent STR: ${choice.opponentStr}</div>` : ``}
        <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ``} = ${cappedTotal}</div>
      </div>
    `;

    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} — ${actionName}</strong>
        </div>
        
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
          <div>Opponent: ${choice.opponentName}</div>
        </div>

        ${rollInfoSection}

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
        </div>

        ${this._effectBlock(effect)}
        ${actions}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    // Remove hold effects on successful escape (yellow=Escape or red=Reverse only; green is also Miss for escaping)
    if (colorLower === "yellow" || colorLower === "red") {
      await removeHoldEffects(actor);
    }

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showDialog(actor, strength) {
    // Auto-fill opponent from opts prefill first, then from target if any
    let prefillOpp = this.opts?.prefill?.opponentName || "";
    let prefillOppStr = this.opts?.prefill?.opponentStr || "";
    
    // If no prefill from opts, try from targeted token
    if (!prefillOpp) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        prefillOpp = targets[0].name || "";
        prefillOppStr = targets[0].actor?.system?.abilities?.strength?.rank || "";
      }
    }

    // Load persisted settings (karma checkbox never persisted - always starts unchecked)
    const savedShift = await actor.getFlag("msh-faserip", "lastEscapeShift") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastEscapeRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastEscapeSkipDice")) ?? false;
    const savedSpendKarma = false; // Always default to unchecked

    const dialogHtml = `
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Action:</label>
        <strong>${this.label}</strong>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Your Strength:</label>
        <input type="text" value="${strength.rank}" style="width:160px;" readonly>
        <span style="margin-left:6px;">(${strength.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Opponent:</label>
        <input type="text" name="opponentName" style="width:220px;" value="${prefillOpp}" placeholder="Who is holding you?">
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Opponent STR:</label>
        <input type="text" name="opponentStr" style="width:160px;" value="${prefillOppStr}" placeholder="e.g., Excellent">
        <div style="margin-left:130px;font-size:.85em;color:#666;">Optional: for reference only</div>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Column Shift:</label>
        <input type="number" name="shift" value="${Number(this.opts?.shift ?? savedShift)}" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ easier, - harder)</span>
      </div>
      ${generateKarmaControlsHTML(actor, savedSpendKarma)}
      <div style="margin-top:6px;">
        <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember these settings</label>
      </div>

      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice animation</label>
      </div>

      <div style="margin-top:12px;padding:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:4px;">Escaping Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss (White/Green):</strong> Still held; no other actions.<br>
          <strong>Escape (Yellow):</strong> Free; may move up to half speed; no other actions.<br>
          <strong>Reverse (Red):</strong> Free; move ½, Grapple attacker, or take another action at -2 CS.
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: `${this.label}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $ = (s) => html.find(s);
              const { spendKarma } = extractKarmaFromDialog(html);
              const result = {
                opponentName: String($('[name="opponentName"]').val() || "Opponent"),
                opponentStr: String($('[name="opponentStr"]').val() || ""),
                shift: Number($('[name="shift"]').val() || 0),
                spendKarma,
                remember: !!$('[name="remember"]').is(':checked'),
                skipDice: !!$('[name="skipDice"]').is(':checked')
              };
              
              // Always save remember/skipDice preferences
              await actor.setFlag("msh-faserip", "lastEscapeRemember", result.remember);
              await actor.setFlag("msh-faserip", "lastEscapeSkipDice", result.skipDice);
              
              // Persist shift if requested (karma checkbox never persisted)
              if (result.remember) {
                await actor.setFlag("msh-faserip", "lastEscapeShift", result.shift);
              }
              
              resolve(result);
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => { setupKarmaControlHandlers(html); }
      }).render(true);
    });
  }

  _effectBlock(effect) {
    const e = String(effect).toLowerCase();
    if (e === "miss") {
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
          <div style="font-weight:bold;color:#c62828;">Miss</div>
          <div style="font-size:.9em;">You remain held this turn and may take no other actions.</div>
        </div>`;
    }
    if (e === "escape") {
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
          <div style="font-weight:bold;color:#0d47a1;">Escape</div>
          <div style="font-size:.9em;">You slip free; you may move up to half speed this round (no other actions).</div>
        </div>`;
    }
    if (e === "reverse") {
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
          <div style="font-weight:bold;color:#2e7d32;">Reverse</div>
          <div style="font-size:.9em;">You're free and may either: move up to ½ distance; attempt to Grapple the former attacker; or perform any other action at -2 CS.</div>
        </div>`;
    }
    return "";
  }
}