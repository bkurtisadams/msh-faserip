// scripts/modules/actions/grappling-action.js
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
  applyCapabilitiesToDialog
} from "./action-utils.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

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

    // Load persisted defaults
    const savedShift = await actor.getFlag("msh-faserip", "lastGrappleShift") ?? 0;
    const savedKarmaFlag = await actor.getFlag("msh-faserip", "lastGrappleKarma") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastGrappleRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastGrappleSkipDice")) ?? false;
    const savedSpendKarma = (savedKarmaFlag === true) || (Number(savedKarmaFlag) > 0);

    const choice = await this._showGrapplingDialog(actor, strength, { savedShift, savedSpendKarma });
    if (!choice) return;

    // Always save remember/skipDice preferences
    await actor.setFlag("msh-faserip", "lastGrappleRemember", choice.remember);
    await actor.setFlag("msh-faserip", "lastGrappleSkipDice", choice.skipDice);

    // Persist settings if requested
    if (choice.remember) {
      await actor.setFlag("msh-faserip", "lastGrappleShift", choice.shift);
      await actor.setFlag("msh-faserip", "lastGrappleKarma", choice.spendKarma ? 1 : 0);
    }

    const effectiveRank = shiftRank(strength.rank, choice.shift);

    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} attempts to Grapple ${choice.targetName}`,
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

    // Show escape button for Partial Hold and Hold results
    const showEscape = (colorLower === "yellow" || colorLower === "red");
    const actions = buildActionsBox({
      showEscape: showEscape,
      targetUuid: choice.targetUuid,
      targetName: choice.targetName,
      targetStrength: choice.targetStrength,
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
      grid, 
      bg, 
      fg,
      targetingContext,
      actions
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showGrapplingDialog(actor, strength, { savedShift = 0, savedSpendKarma = false } = {}) {
    // auto-fill target from current single targeted token
    let prefillTargetName = "";
    let prefillTargetStr  = "";
    let prefillTargetUuid = "";
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length === 1) {
        const tok = targets[0];
        prefillTargetName = tok?.name || "";
        prefillTargetStr  = tok?.actor?.system?.abilities?.strength?.rank || "";
        prefillTargetUuid = tok?.actor?.uuid || "";
    }

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
        <label style="display:inline-block;width:130px;">Target:</label>
        <input type="text" name="targetName" style="width:220px;" placeholder="e.g., Doctor Doom" value="${prefillTargetName}">
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target Strength:</label>
        <input type="text" name="targetStrength" style="width:180px;" placeholder="e.g., Excellent" value="${prefillTargetStr}">
        <div style="margin-left:130px;font-size:.85em;color:#666;">Used to decide if movement is prevented on Partial Hold</div>
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
        <div style="font-weight:bold;margin-bottom:4px;">Grappling Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss:</strong> No hold; no other attacks this round.<br>
          <strong>Partial Hold:</strong> Target acts at -2 CS; no move if your STR ≥ target STR; no damage.<br>
          <strong>Hold:</strong> Target fully restrained; you may inflict up to STR damage (subject to Body Armor) and take one other action.
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
            callback: (html) => {
              const $ = (s) => html.find(s);
              const { spendKarma } = extractKarmaFromDialog(html);
              resolve({
                targetName:     String($('[name="targetName"]').val() || "Target"),
                targetStrength: String($('[name="targetStrength"]').val() || ""),
                targetUuid:     prefillTargetUuid,
                shift:          Number($('[name="shift"]').val() || 0),
                spendKarma,
                remember:       !!$('[name="remember"]').is(':checked'),
                skipDice:       !!$('[name="skipDice"]').is(':checked')
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

  _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, grid, bg, fg, targetingContext, actions }) {
    const partialMovement =
      choice.targetStrength
        ? this._compareRanks(strength.rank, choice.targetStrength) >= 0
          ? `<li style="color:#f57f17;font-weight:bold;">Target cannot move (your STR ${strength.rank} ≥ target ${choice.targetStrength})</li>`
          : `<li>Target can still move (your STR ${strength.rank} &lt; target ${choice.targetStrength})</li>`
        : `<li>Movement restriction depends on relative Strength</li>`;

    const blocks = {
      miss: `
        <div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
          <div style="font-weight:bold;color:#c62828;">Miss</div>
          <div style="font-size:.9em;">No hold established. ${actor.name} may not make other attacks this round.</div>
        </div>`,
      "partial hold": `
        <div style="padding:6px 10px;margin:6px 10px;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
          <div style="font-weight:bold;color:#f57f17;">Partial Hold</div>
          <ul style="margin:6px 0 0 18px;font-size:.9em;">
            <li>Target acts at -2 CS</li>
            ${partialMovement}
            <li>No damage inflicted</li>
          </ul>
        </div>`,
      "hold": `
        <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
          <div style="font-weight:bold;color:#2e7d32;">Full Hold</div>
          <ul style="margin:6px 0 0 18px;font-size:.9em;">
            <li>Target fully restrained; cannot act</li>
            <li>You may perform one additional action</li>
            <li><strong>May inflict up to ${strength.rank} (${strength.value}) damage</strong> (subject to Body Armor)</li>
          </ul>
        </div>`
    };

    const effectLower = String(effect).toLowerCase();

    return `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} — Grappling</strong>
        </div>

        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
          <div>Strength: ${strength.rank} (${strength.value})${(choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : '')}</div>
          ${choice.targetStrength ? `<div>Target STR: ${choice.targetStrength}</div>` : ``}
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ``} = ${cappedTotal}</div>
        </div>

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
        </div>

        ${blocks[effectLower] || ""}
        ${actions}
      </div>
    `;
  }

  _compareRanks(a, b) {
    const R = ["Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"];
    return Math.sign(R.indexOf(a) - R.indexOf(b));
  }
}