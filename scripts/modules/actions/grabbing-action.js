// scripts/modules/actions/grabbing-action.js
import { AttackAction } from "./attack-action.js";
import {
  RANKS,
  getStrengthInfo,
  shiftRank,
  rollWithKarmaAndHistory,
  effectsFor,
  labelFor,
  buildResultGrid,
  buildActionsBox,
  bannerColors,
  getTargetingContext
} from "./action-utils.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

/**
 * Grabbing (Wrestling) — STR vs UT → Miss / Take / Grab / Break
 * - Miss: no possession; loose items may scatter up to 1 area (GM decides).
 * - Take (GREEN): gain possession iff Attacker STR ≥ comparator (target STR, or item material if glued/clamped). Else treat as Miss.
 * - Grab (YELLOW): gain possession regardless of STR comparison.
 * - Break (RED): gain possession and present a "Breaking FEAT" button for the follow-up material check (handled by chat-hooks / breaking-feat.js).
 *
 * Notes:
 * - We do NOT auto-run the Break follow-up; we present a button (consistent with BluntAttackAction).
 * - Target STR is auto-filled from a selected token; otherwise user can enter/adjust manually.
 * - Optional "Item Material" lets the Judge treat glued/clamped items as an intensity comparator for Take.
 */
export class GrabbingAction extends AttackAction {
  constructor(args) {
    super(args);
    this.actionType = "grabbing";
    this.actionName = labelFor(this.actionType);
    this.effects = effectsFor(this.actionType);
  }

  async execute() {
    const actor = this.actor;
    const actionType = this.actionType;
    const actionName = this.actionName;
    const effects = this.effects;

    // Attacker uses Strength for Wrestling: Grabbing
    const strength = getStrengthInfo(actor);

    // Build dialog with auto-filled target + strength if exactly one token targeted
    const choice = await this._prompt(actor, strength);
    if (!choice) return;

    // Effective rank after CS
    const effectiveRank = shiftRank(strength.rank, choice.shift);

    // Decide comparator once (target STR or item material if fixed) for both legend and outcome
    const cmpRank = this._chooseComparatorRank(choice); // may be null/undefined
    const mustDowngradeGreen = cmpRank ? !this._rankGTE(strength.rank, cmpRank) : false;

    // Roll + optional karma cap (uses your standard helper)
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
        await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} attempts to Grab ${choice.itemLabel} from ${choice.targetName}`,
        rollMode: game.settings.get("core", "rollMode")
        });
    }
    const { cappedTotal, totalKarmaUsed } =
        await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank });

    // Universal Table result color
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    let colorLower = String(color || "").toLowerCase();
    let effectResult = effects[colorLower] || colorLower;

    // Enforce Take rule: Attacker STR ≥ comparator, else Treat as Miss (visual White)
    let takeDowngraded = false;
    if (String(effectResult).toLowerCase() === "take" && mustDowngradeGreen) {
        effectResult = "Miss";
        colorLower = "white";
        takeDowngraded = true;
    }

    // Adjust legend and build grid so it always matches the matchup (not the roll)
    const legendEffects = mustDowngradeGreen ? { ...effects, green: "Miss" } : effects;
    const grid = buildResultGrid(actionType, colorLower, legendEffects);

    // Optional: explain why the legend shows Green → Miss
    const noteHtml = takeDowngraded
    ? `<div style="font-size:.85em;color:#666;margin-top:4px;">
        Note: Green downgraded to <strong>Miss</strong> (Attacker STR &lt; comparator).
        </div>`
    : "";

    const { bg, fg } = bannerColors(colorLower);
    // Targeting context line (consistent with BluntAttackAction)
    const targetingContext = getTargetingContext(actor, actionName);

    // Build the small details section
    const compNote = this._composeComparatorLine(choice);
    const detailsHtml = `
    <div>Attacker STR: ${strength.rank} (${strength.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
    ${choice.targetStrength ? `<div>Target STR: ${choice.targetStrength}</div>` : ``}
    ${choice.itemMaterial ? `<div>Item Material: ${choice.itemMaterial}</div>` : ``}
    ${compNote ? `<div style="font-size:.85em;color:#666;">Comparator for "Take": ${compNote}</div>` : ``}
    <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
    `;

    // For RED (Break), show a "Grabbing Break Check" button
    const grabbingBreak = (String(effectResult).toLowerCase() === "break")
    ? { 
        itemMaterial: choice.itemMaterial || "Excellent",
        itemName: choice.itemLabel || "Item"
        }
    : null;

    const actions = buildActionsBox({
    grabbingBreak,  // ← NEW: use grabbing break instead of breaking feat
    actorUuid: actor.uuid,
    autoApply: !!this.opts?.autoApply,

    });
    // Effect blocks for the four results (text-only; no auto-ops)
    const effectBlock = this._effectBlock(String(effectResult).toLowerCase(), strength, choice);

    // Final chat card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} — ${actionName}</strong>
        </div>
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
          <div>Item: ${choice.itemLabel}</div>
        <!--  <div>Target: ${choice.targetName}</div>  -->
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          ${detailsHtml}
        </div>

        ${grid}
        ${noteHtml}
        
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${effectBlock}
        ${actions}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }

  /**
   * Dialog to collect/confirm target, target STR, item label, and optional item material.
   * Auto-fills target name + STR if a single token is targeted.
   */
  async _prompt(actor, strength) {
    // Try to pull a single targeted token
    let prefillTargetName = "";
    let prefillTargetStr = "";
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length === 1) {
      const t = targets[0];
      prefillTargetName = t.name || "";
      prefillTargetStr = t.actor?.system?.abilities?.strength?.rank || "";
    }

    // Load persisted settings
    const savedShift = await actor.getFlag("msh-faserip", "lastGrabbingShift") ?? 0;
    const savedKarmaFlag = await actor.getFlag("msh-faserip", "lastGrabbingKarma") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastGrabbingRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastGrabbingSkipDice")) ?? false;
    const savedSpendKarma = (savedKarmaFlag === true) || (Number(savedKarmaFlag) > 0);

    const html = `
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Action:</label>
        <strong>${this.actionName}</strong>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Your Strength:</label>
        <input type="text" value="${strength.rank}" style="width:160px;" readonly>
        <span style="margin-left:6px;">(${strength.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target:</label>
        <input type="text" name="targetName" style="width:240px;" value="${prefillTargetName}" placeholder="Who holds the item?">
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target STR:</label>
        <input type="text" name="targetStrength" style="width:160px;" value="${prefillTargetStr}" placeholder="e.g., Excellent">
        <div style="margin-left:130px;font-size:.85em;color:#666;">
          Used for GREEN "Take": possession only if your STR ≥ comparator (target STR, or item material if glued/clamped).
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Item (label):</label>
        <input type="text" name="itemLabel" style="width:240px;" placeholder="e.g., Pistol, Bomb, Idol" value="">
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Item Material (opt):</label>
        <input type="text" name="itemMaterial" style="width:160px;" placeholder="e.g., Incredible">
        <div style="margin-left:130px;font-size:.85em;color:#666;">
          If item is glued/clamped/locked, enter its material to use as the Take comparator.
        </div>
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
        <div style="font-weight:bold;margin-bottom:4px;">Grabbing Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss:</strong> No possession; loose item may scatter up to 1 area (GM).<br>
          <strong>Take (Green):</strong> Possession only if your STR ≥ comparator (target STR <em>or</em> item material if glued/clamped). Else, treat as Miss.<br>
          <strong>Grab (Yellow):</strong> Gain possession regardless of STR.<br>
          <strong>Break (Red):</strong> Gain possession; then use the <em>Breaking FEAT</em> button to roll vs item material (handled by dialog).
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: `${this.actionName}: ${actor.name}`,
        content: html,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (h) => {
              const $ = (s) => h.find(s);
              const { spendKarma } = extractKarmaFromDialog(h);
              const result = {
                targetName: String($('[name="targetName"]').val() || "Target"),
                targetStrength: String($('[name="targetStrength"]').val() || ""),
                itemLabel: String($('[name="itemLabel"]').val() || "Item"),
                itemMaterial: String($('[name="itemMaterial"]').val() || ""),
                shift: Number($('[name="shift"]').val() || 0),
                spendKarma,
                remember: !!$('[name="remember"]').is(':checked'),
                skipDice: !!$('[name="skipDice"]').is(':checked')
              };

              // Always save remember/skipDice preferences
              await actor.setFlag("msh-faserip", "lastGrabbingRemember", result.remember);
              await actor.setFlag("msh-faserip", "lastGrabbingSkipDice", result.skipDice);

              // Persist settings if requested
              if (result.remember) {
                await actor.setFlag("msh-faserip", "lastGrabbingShift", result.shift);
                await actor.setFlag("msh-faserip", "lastGrabbingKarma", result.spendKarma ? 1 : 0);
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

  /**
   * For "Take" (GREEN) comparator:
   * - If itemMaterial provided → use that (glued/clamped case).
   * - Else use targetStrength.
   */
  _chooseComparatorRank(choice) {
    return (choice.itemMaterial && String(choice.itemMaterial).trim())
      ? choice.itemMaterial.trim()
      : (choice.targetStrength && String(choice.targetStrength).trim())
        ? choice.targetStrength.trim()
        : ""; // no comparator supplied; will be treated as pass (attacker ≥ "" by rank lookup)
  }

  _rankGTE(aRank, bRank) {
    const ai = RANKS.indexOf(String(aRank));
    const bi = RANKS.indexOf(String(bRank));
    if (ai < 0) return false;
    if (bi < 0) return true; // if no/unknown comparator, treat as pass
    return ai >= bi;
  }

  _composeComparatorLine(choice) {
    const mat = String(choice.itemMaterial || "").trim();
    const tStr = String(choice.targetStrength || "").trim();

    if (mat) return `Item Material = ${mat} (glued/clamped/locked case)`;
    if (tStr) return `Target STR = ${tStr}`;
    return ""; // no comparator provided (Take will default to pass if none)
  }

  _effectBlock(effectLower, strength, choice) {
    if (effectLower === "miss") {
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
          <div style="font-weight:bold;color:#c62828;">Miss</div>
          <div style="font-size:.9em;">Item not secured. If it was loose, it may scatter up to one area (Judge decides direction).</div>
        </div>`;
    }
    if (effectLower === "take") {
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
          <div style="font-weight:bold;color:#0d47a1;">Take</div>
          <div style="font-size:.9em;">Possession gained (STR check vs comparator passed).</div>
        </div>`;
    }
    if (effectLower === "grab") {
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#fffde7;border:1px solid #f9a825;border-radius:3px;">
          <div style="font-weight:bold;color:#f57f17;">Grab</div>
          <div style="font-size:.9em;">You gain possession regardless of Strength comparison.</div>
        </div>`;
    }
    if (effectLower === "break") {
    return `
      <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
        <div style="font-weight:bold;color:#2e7d32;">Break</div>
        <div style="font-size:.9em;">
          Item seized. Use the <strong>Grabbing Break Check</strong> button below to roll your Strength vs the item's material 
          to see if it breaks, is damaged, or activates.
        </div>
      </div>`;
  }
    return "";
  }
}