// scripts/modules/actions/escaping-action.js
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
  getTargetingContext
} from "./action-utils.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

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

    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} attempts to Escape a Hold`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank });

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

    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} — ${actionName}</strong>
        </div>
        
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
          <div>Opponent: ${choice.opponentName}</div>
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
          <div>Strength: ${strength.rank} (${strength.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
          ${choice.opponentStr ? `<div>Opponent STR: ${choice.opponentStr}</div>` : ``}
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ``} = ${cappedTotal}</div>
        </div>

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
        </div>

        ${this._effectBlock(effect)}
        ${actions}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showDialog(actor, strength) {
    // Auto-fill opponent from target if any
    let prefillOpp = "";
    let prefillOppStr = "";
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length === 1) {
      prefillOpp = targets[0].name || "";
      prefillOppStr = targets[0].actor?.system?.abilities?.strength?.rank || "";
    }

    // Load persisted settings
    const savedShift = await actor.getFlag("msh-faserip", "lastEscapeShift") ?? 0;
    const savedKarmaFlag = await actor.getFlag("msh-faserip", "lastEscapeKarma") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastEscapeRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastEscapeSkipDice")) ?? false;
    const savedSpendKarma = (savedKarmaFlag === true) || (Number(savedKarmaFlag) > 0);

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
        <input type="number" name="shift" value="${Number(savedShift)}" style="width:60px;">
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
              
              // Persist settings if requested
              if (result.remember) {
                await actor.setFlag("msh-faserip", "lastEscapeShift", result.shift);
                await actor.setFlag("msh-faserip", "lastEscapeKarma", result.spendKarma ? 1 : 0);
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