// scripts/modules/actions/escaping-action.js
import { AttackAction } from "./attack-action.js";
import { getStrengthInfo, shiftRank, buildResultGrid, bannerColors, labelFor, effectsFor } from "./action-utils.js";
export class EscapingAction extends AttackAction {
  constructor(args) {
    super(args);
    this.actionType = "escaping";
    this.label = labelFor(this.actionType);
    this.effects = effectsFor(this.actionType);
  }

  async execute() {
    const actor = this.actor;
    const strength = getStrengthInfo(actor);
    const choice = await this._showDialog(actor);
    if (!choice) return;

    // Escaping is rolled on the character’s Strength (per your Wrestling section “resolved on Strength”)
    const effectiveRank = shiftRank(strength.rank, choice.shift);

    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} attempts to Escape a Hold`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }

    const needTo100 = Math.max(0, 100 - roll.total);
    const karmaSpent = Math.min(Math.max(0, choice.karma || 0), needTo100);
    const cappedTotal = Math.min(100, roll.total + karmaSpent);

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effect = this.effects[colorLower] || "Miss";

    const grid = buildResultGrid(this.actionType, colorLower, this.effects);
    const { bg, fg } = bannerColors(colorLower);

    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#4e342e;">
          <strong>${actor.name} — Escaping a Hold</strong>
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
          <div>FEAT Rank: ${choice.selfEndOrStr}${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
          ${choice.opponentName ? `<div>Opponent: ${choice.opponentName}</div>` : ``}
          <div>Roll: ${roll.total}${karmaSpent ? ` + Karma ${karmaSpent}` : ``} = ${cappedTotal}</div>
        </div>

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
        </div>

        ${this._effectBlock(effect)}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    return { roll, color, effectiveRank, cappedTotal, karmaSpent };
  }

  async _showDialog(actor) {
    // Auto-fill opponent from target if any
    let prefillOpp = "";
    const t = Array.from(game.user?.targets ?? []);
    if (t.length === 1) prefillOpp = t[0].name || "";

    const dialogHtml = `
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Opponent (label):</label>
        <input type="text" name="opponentName" style="width:220px;" value="${prefillOpp}">
        </div>

        <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Column Shift:</label>
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:60px;">
        </div>

        <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Karma:</label>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:60px;">
        </div>

        <div style="margin-top:10px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
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
        title: `Escaping Hold: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              const $ = (s) => html.find(s);
              resolve({
                opponentName: String($('[name="opponentName"]').val() || "Opponent"),
                selfEndOrStr: String($('[name="selfRank"]').val() || "Good"),
                shift: Number($('[name="shift"]').val() || 0),
                karma: Number($('[name="karma"]').val() || 0),
                skipDice: !!$('[name="skipDice"]').is(':checked')
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
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
          <div style="font-size:.9em;">You’re free and may either: move up to ½ distance; attempt to Grapple the former attacker; or perform any other action at -2 CS.</div>
        </div>`;
    }
    return "";
  }
}
