// scripts/modules/actions/check-action.js
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  labelFor,
  effectsFor,
  buildResultGrid,
  bannerColors,
  getAbilityInfo,
} from "./action-utils.js";

/**
 * CheckAction covers: "stun" | "slam" | "kill"
 * Dispatcher must call: new CheckAction({ actor, actionType, opts })
 */
export class CheckAction extends BaseAction {
  constructor(a) {
    // Expect a single config object: { actor, actionType, abilityName?, opts? }
    // abilityName is unused (checks are rolled on TARGET Endurance), but accepted for symmetry
    if (!a || typeof a !== "object") throw new Error("CheckAction requires a config object.");
    const { actor, actionType, abilityName = "endurance", opts = {} } = a;
    super({ actor, abilityName, opts });
    this.actionType = actionType;
  }

  async execute() {
    const actor       = this.actor;
    const actionType  = this.actionType; // "stun" | "slam" | "kill"
    const actionName  = labelFor(actionType);
    const effects     = effectsFor(actionType); // you already defined these in action-utils (stun/slam/kill maps)

    // Pull the attacker's Strength rank (used for Slam context)
    const attackerStr = getAbilityInfo(actor, "strength"); // { name, rank, value }

    // --- Dialog: gather target info & context ---
    const targetRanks = RANKS.map(r => `<option value="${r}">${r}</option>`).join("");
    const dialogHtml = `
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:130px;">Check:</label><strong>${actionName}</strong></div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target (label):</label>
        <input type="text" name="targetName" style="width:220px;" placeholder="e.g., Doctor Doom">
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target Endurance:</label>
        <select name="targetEndRank" style="width:180px;">${targetRanks}</select>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Column Shift (on target):</label>
        <input type="number" name="shift" value="0" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ easier, - harder for target)</span>
      </div>

      <div style="margin-bottom:10px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Damage Gate</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:130px;">Damage that penetrated:</label>
          <input type="number" name="dmgThrough" value="0" min="0" style="width:80px;">
          <span style="color:#666;font-size:.9em;">(after Armor/Fields/Resistances)</span>
        </div>
        <div>
          <label><input type="checkbox" name="borderline"> Apply borderline allowance (tie still affects)</label>
        </div>
        <div style="color:#666;font-size:.85em;margin-top:4px;">
          Effects only apply if some damage penetrates; in borderline ties, they still apply.
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Karma (target spend):</label>
        <input type="number" name="karma" value="0" min="0" style="width:60px;">
        <span style="color:#666;font-size:.85em;">(only up to 100 total; history not recorded unless you roll as this actor)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Attack Form:</label>
        <select name="attackForm" style="width:220px;">
          <option value="blunt">Blunt (Slugfest)</option>
          <option value="edged">Edged (Slugfest)</option>
          <option value="shooting">Shooting</option>
          <option value="throwing">Throwing</option>
          <option value="energy">Energy</option>
          <option value="force">Force</option>
          <option value="charging">Charging</option>
          <option value="wrestling">Wrestling</option>
        </select>
        <span style="color:#666;font-size:.85em;">(Kill: E/S applies to Edged or Shooting only)</span>
      </div>

      ${actionType === "slam" ? `
        <div style="margin:8px 0 0;padding:6px;border:1px dashed #bbb;border-radius:3px;background:#fff;">
          <div style="font-weight:bold;">Slam context</div>
          <div>Attacker Strength: <strong>${attackerStr.rank}</strong> (${attackerStr.value})</div>
          <div style="color:#666;font-size:.85em;">Grand Slam travel ≈ attacker's Strength as ground speed (e.g., Unearthly ≈ 10 areas).</div>
        </div>
      ` : ``}

      <div style="margin-top:10px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${actionName} Check`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              const $ = (sel)=> html.find(sel);
              resolve({
                targetName: String($('[name="targetName"]').val() || "Target"),
                targetEndRank: String($('[name="targetEndRank"]').val() || "Good"),
                shift: Number($('[name="shift"]').val() || 0),
                dmgThrough: Number($('[name="dmgThrough"]').val() || 0),
                borderline: !!$('[name="borderline"]').is(':checked'),
                karma: Number($('[name="karma"]').val() || 0),
                attackForm: String($('[name="attackForm"]').val() || "blunt"),
                skipDice: !!$('[name="skipDice"]').is(':checked'),
              });
            }
          },
          cancel: { label: "Cancel", callback: ()=> resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
    if (!choice) return;

    // --- Damage gate: effects only if dmg > 0 (or borderline toggle) ---
    const effectGateOpen = (choice.dmgThrough > 0) || !!choice.borderline;

    // --- Target FEAT rank after column shifts ---
    const effectiveEndRank = shiftRank(choice.targetEndRank, choice.shift);

    // --- Roll d100 (target’s FEAT); cap with "spend up to 100" locally (no history unless you choose to use the actor) ---
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${choice.targetName} rolls Endurance vs ${actionName}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    const needTo100 = Math.max(0, 100 - roll.total);
    const karmaSpend = Math.min(Math.max(0, choice.karma || 0), needTo100);
    const cappedTotal = Math.min(100, roll.total + karmaSpend);

    // --- Determine color/result on target’s Endurance ---
    const color = game.msh.rollUniversalTable(effectiveEndRank, cappedTotal);
    const colorLower = String(color||"").toLowerCase();
    const baseEffect = effects[colorLower] || color;

    // --- Apply special Kill "E/S" rule ---
    let finalEffect = baseEffect;
    if (actionType === "kill" && baseEffect) {
      // E/S only applies if attack form is Edged or Shooting; otherwise treat as No Effect
      if (String(baseEffect).toUpperCase() === "E/S") {
        const isEdgedOrShooting = (choice.attackForm === "edged" || choice.attackForm === "shooting");
        finalEffect = isEdgedOrShooting ? "Endurance Loss (E/S)" : "No effect";
      }
    }

    // --- If no damage penetrated (and not borderline), effects are negated ---
    const effectsSuppressed = !effectGateOpen;
    if (effectsSuppressed) {
      finalEffect = "No effect (no damage penetrated)";
    }

    // --- Build visual grid/banners using your helper maps ---
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // --- Extra explanatory block per check type ---
    const extraHtml = this._extraExplanationHtml({
      actionType, choice, attackerStr, colorLower, effectiveEndRank, finalEffect, effectsSuppressed
    });

    // --- Final chat card ---
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#4e342e;">
          <strong>${actor.name} - ${actionName} Check vs ${choice.targetName}</strong>
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
          <div>Target Endurance: ${choice.targetEndRank}${choice.shift ? ` — Shift ${choice.shift} → ${effectiveEndRank}` : ""}</div>
          <div>Attack Form: ${choice.attackForm}${actionType==="slam" ? ` — Attacker STR: ${attackerStr.rank} (${attackerStr.value})` : ""}</div>
          <div>Damage Penetrated: ${choice.dmgThrough}${choice.borderline ? " (borderline allowed)" : ""}</div>
          <div>Roll: ${roll.total}${karmaSpend ? ` + Karma: ${karmaSpend}` : ""} = ${cappedTotal}</div>
        </div>

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(finalEffect).toUpperCase()}
        </div>

        ${extraHtml}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }

  _extraExplanationHtml({ actionType, choice, attackerStr, colorLower, effectiveEndRank, finalEffect, effectsSuppressed }) {
    // Slam: show movement/dir rules; Stun: durations; Kill: E/S clarification
    if (actionType === "slam") {
      const lines = {
        white: "No Slam — target still takes damage.",
        green: "Stagger — no longer adjacent; may act next round.",
        yellow: "1 Area — attacker chooses direction if damage penetrated; defender chooses if not.",
        red: "Grand Slam — travel ≈ attacker Strength ground speed (e.g., Unearthly ≈ 10 areas)."
      };
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#fffde7;border:1px solid #f9a825;border-radius:3px;">
          <div style="font-weight:bold;">Slam Details</div>
          <div>${lines[colorLower] || ""}</div>
          <div style="color:#555;font-size:.85em;margin-top:4px;">
            Colliding with walls/objects deals impact as per charging vs obstacle; direction per rules above.
          </div>
          ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;"><strong>Note:</strong> No damage penetrated → Slam effects do not apply.</div>` : ""}
        </div>
      `;
    }

    if (actionType === "stun") {
      const lines = {
        white: "1–10 rounds Stunned — roll 1d10; no actions.",
        green: "1 round Stunned — no action next round (can “play possum”).",
        yellow: "No effect.",
        red: "No effect."
      };
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #1e88e5;border-radius:3px;">
          <div style="font-weight:bold;">Stun Details</div>
          <div>${lines[colorLower] || ""}</div>
          ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;"><strong>Note:</strong> No damage penetrated → Stun does not apply.</div>` : ""}
        </div>
      `;
    }

    if (actionType === "kill") {
      const lines = {
        white: "Endurance Loss — target loses 1 Endurance rank and is dying; loses 1 rank per turn until stabilized.",
        green: "E/S — Endurance Loss only if attack form is Edged (Slugfest) or Shooting; otherwise No Effect.",
        yellow: "No effect.",
        red: "No effect."
      };
      const esNote = (String(finalEffect).toLowerCase().includes("endurance loss"))
        ? `<div style="color:#b71c1c;margin-top:6px;">Karma note: A hero who kills loses all Karma.</div>`
        : "";

      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#f1f8e9;border:1px solid #7cb342;border-radius:3px;">
          <div style="font-weight:bold;">Kill Details</div>
          <div>${lines[colorLower] || ""}</div>
          ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;"><strong>Note:</strong> No damage penetrated → Kill does not apply.</div>` : ""}
          ${esNote}
        </div>
      `;
    }

    return "";
  }
}
