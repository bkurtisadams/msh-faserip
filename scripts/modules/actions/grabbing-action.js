// scripts/modules/actions/grabbing-action.js v1.6.0 - 2026-02-27
// v1.6.0: Redesign dialog to Style A (grid header, inline CS/karma, standardized footer)
// v1.5.0: Restyle chat card to match attack card pattern (flex header, inline badge, no buildResultGrid/banner)
// v1.4.0: Add support for weapon-based grabbing (whips with Gb damage type use material strength)
// v1.3.0: Fix karma checkbox to always default unchecked (not persisted)
// v1.2.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.1.0: Add inline rolls for consolidated chat cards
import { AttackAction } from "./attack-action.js";
import {
  RANKS,
  getStrengthInfo,
  shiftRank,
  rollWithKarmaAndHistory,
  effectsFor,
  labelFor,
  buildActionsBox,
  bannerColors,
  buildInlineRollDisplay,
  showDiceAnimation,
  getTargetData
} from "./action-utils.js";
import { extractKarmaFromDialog, getAvailableKarma, getMinimumKarmaCommitment } from "../dice/dice-roller.js";
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

    // Check if a weapon was passed (e.g., whip with Gb damage type)
    const passedItem = this.opts?.item || this.opts?.sourceItem || this.opts?.equipment || null;
    const isWeaponGrab = passedItem?.type === "equipment" && 
                         passedItem?.system?.damageType?.toUpperCase() === "GB";
    
    // For weapon grabs, use material strength; otherwise use actor's Strength
    let strength;
    let strengthSource;
    if (isWeaponGrab) {
      const materialRank = passedItem.system?.materialStrength || "Typical";
      const rankValues = {
        "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10, "Excellent": 20,
        "Remarkable": 30, "Incredible": 40, "Amazing": 50, "Monstrous": 75, "Unearthly": 100,
        "Shift X": 150, "Shift Y": 200, "Shift Z": 500, "Class 1000": 1000
      };
      strength = {
        rank: materialRank,
        value: rankValues[materialRank] || 6
      };
      strengthSource = passedItem.name;
    } else {
      strength = getStrengthInfo(actor);
      strengthSource = "Strength";
    }

    // Build dialog with auto-filled target + strength if exactly one token targeted
    const choice = await this._prompt(actor, strength, { isWeaponGrab, weaponName: isWeaponGrab ? passedItem.name : null, strengthSource });
    if (!choice) return;

    // Effective rank after CS
    const effectiveRank = shiftRank(strength.rank, choice.shift);

    // Decide comparator once (target STR or item material if fixed) for both legend and outcome
    const cmpRank = this._chooseComparatorRank(choice); // may be null/undefined
    const mustDowngradeGreen = cmpRank ? !this._rankGTE(strength.rank, cmpRank) : false;

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    // Roll + optional karma cap (uses your standard helper)
    const roll = await (new Roll("1d100")).evaluate();
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} attempts to Grab ${choice.itemLabel} from ${choice.targetName}`, useConsolidated);
    }
    const { cappedTotal, totalKarmaUsed } =
        await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    // Build inline roll display for consolidated mode
    const inlineRollHtml = useConsolidated ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal) : "";

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

    const { bg, fg } = bannerColors(colorLower);

    // Shift display (hover tooltip style)
    let shiftDisplay = "";
    if (choice.shift) {
      const csBox = `<span title="${choice.shift > 0 ? '+' : ''}${choice.shift}CS" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${choice.shift > 0 ? '+' : ''}${choice.shift}CS</span>`;
      shiftDisplay = ` (${csBox} → ${effectiveRank})`;
    }

    // Roll display (yellow hover box)
    const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
    const rollDisplay = totalKarmaUsed
      ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
      : rollBox;

    const compNote = this._composeComparatorLine(choice);
    const takeNote = takeDowngraded
      ? `<div style="font-size:.85em;color:#666;margin-top:2px;">Green downgraded to <strong>Miss</strong> (Attacker STR &lt; comparator).</div>`
      : "";

    // For RED (Break), show a "Grabbing Break Check" button
    const grabbingBreak = (String(effectResult).toLowerCase() === "break")
      ? { itemMaterial: choice.itemMaterial || "Excellent", itemName: choice.itemLabel || "Item" }
      : null;

    const actions = buildActionsBox({
      grabbingBreak,
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,
    });

    const effectBlock = this._effectBlock(String(effectResult).toLowerCase(), strength, choice);

    // Final card — matches attack card pattern
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <!-- Header: Action + FEAT type -->
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">${actionName.toUpperCase()}</strong>
          <span style="color:#666;font-size:.85em;">Strength FEAT</span>
        </div>
        <!-- Actor → Target + item -->
        <div style="padding:4px 10px;font-size:.95em;">
          <strong>${actor.name}</strong>${choice.targetName ? ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${choice.targetName}</strong>` : ''}
          <span style="color:#666;font-size:.85em;margin-left:6px;">· ${choice.itemLabel}</span>
        </div>
        <!-- Strength + Roll + inline result badge -->
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>Strength: ${strength.rank}${shiftDisplay}${choice.targetStrength ? ` <span style="color:#666;font-size:.9em;">(vs ${choice.targetStrength})</span>` : ''}</div>
          ${compNote ? `<div style="font-size:.85em;color:#666;">Take comparator: ${compNote}</div>` : ''}
          ${choice.itemMaterial ? `<div style="font-size:.85em;color:#666;">Item material: ${choice.itemMaterial}</div>` : ''}
          ${inlineRollHtml ? '' : `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span>Roll: ${rollDisplay}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
            </span>
          </div>`}
          ${takeNote}
        </div>
        ${inlineRollHtml}
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
  async _prompt(actor, strength, { isWeaponGrab = false, weaponName = null, strengthSource = "Strength" } = {}) {
    // Try to pull a single targeted token
    let prefillTargetName = "";
    let prefillTargetStr = "";
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length === 1) {
      const t = targets[0];
      prefillTargetName = t.name || "";
      prefillTargetStr = t.actor?.system?.abilities?.strength?.rank || "";
    }

    // Load persisted settings (karma checkbox never persisted - always starts unchecked)
    const savedShift = await actor.getFlag("msh-faserip", "lastGrabbingShift") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastGrabbingRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastGrabbingSkipDice")) ?? false;
    const savedSpendKarma = false; // Always default to unchecked

    // Title and ability label
    const dialogTitle = isWeaponGrab ? `Grabbing with ${weaponName}: ${actor.name}` : `${this.actionName}: ${actor.name}`;
    const abilityLabel = isWeaponGrab ? `${weaponName} (Material)` : "Strength";

    // Karma data
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const html = `
      <!-- Context: Target + Grab stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target</div>
          <input type="text" name="targetName" style="width:100%;margin-top:4px;font-weight:600;" placeholder="Who holds the item?" value="${prefillTargetName}">
          <div style="margin-top:4px;">
            <span style="color:#666;font-size:.85em;">STR:</span>
            <input type="text" name="targetStrength" style="width:80px;" placeholder="Excellent" value="${prefillTargetStr}">
          </div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Grab</div>
          <div style="font-weight:600;">${abilityLabel}: ${strength.rank}</div>
          <div style="color:#666;">Rank Value: ${strength.value}</div>
          ${isWeaponGrab ? `<div style="color:#6a1b9a;font-size:.85em;">Using weapon material strength</div>` : ''}
        </div>
      </div>

      <!-- Item Details -->
      <div style="padding:8px;background:#fff;border:1px solid #ddd;border-radius:3px;margin-bottom:8px;">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;">
          <label style="font-weight:600;">Item:</label>
          <input type="text" name="itemLabel" placeholder="e.g., Pistol, Bomb, Idol" value="" style="padding:4px;">
          <label style="font-size:.9em;">Material:</label>
          <div>
            <input type="text" name="itemMaterial" placeholder="e.g., Incredible" style="width:120px;padding:4px;">
            <span style="font-size:.8em;color:#666;margin-left:4px;">If glued/clamped</span>
          </div>
        </div>
      </div>

      <!-- Modifiers Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${Number(this.opts?.shift ?? savedShift)}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${savedShift < 0 ? 'color:#c62828;' : savedShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(strength.rank, savedShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedShift !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>
        <div class="karma-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${hasKarma ? 'background:#e3f2fd;border:1px solid #90caf9;' : ''}">
          ${hasKarma ? `
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="spend-karma" name="spendKarma">
              <span style="font-weight:600;">Karma:</span>
            </label>
            <span title="Available: ${availableKarma} | Min commitment: ${minKarma} | Amount chosen after roll" style="padding:1px 4px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${availableKarma}</span>
            <span style="color:#999;font-size:.8em;">(min ${minKarma})</span>
          ` : `<span style="color:#999;">No karma</span>`}
        </div>
      </div>

      <!-- CS Notes Row -->
      <div id="cs-notes-row" style="margin-bottom:6px;">
        <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., Martial Arts C +1CS" value="" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
      </div>

      <!-- Results Reference -->
      <div style="padding:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;margin-bottom:8px;">
        <div style="font-weight:bold;margin-bottom:4px;">Grabbing Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss:</strong> No possession; item may scatter 1 area.<br>
          <strong>Take (Grn):</strong> Only if STR ≥ comparator.<br>
          <strong>Grab (Ylw):</strong> Gain possession regardless.<br>
          <strong>Break (Red):</strong> Gain + Breaking FEAT vs item material.
        </div>
      </div>

      <!-- Footer -->
      <div id="msh-bottom-controls" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: dialogTitle,
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

              // Persist shift if requested (karma checkbox never persisted)
              if (result.remember) {
                await actor.setFlag("msh-faserip", "lastGrabbingShift", result.shift);
              }

              resolve(result);
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          // CS field handlers
          const $shift = html.find('[name="shift"]');
          const $csField = html.find('.cs-field');
          const $rankDisplay = html.find('#shifted-rank-display');
          const $csReset = html.find('.cs-reset');
          const updateCS = () => {
            const s = Number($shift.val()) || 0;
            const shifted = shiftRank(strength.rank, s);
            $rankDisplay.text(shifted);
            $rankDisplay.css('color', s < 0 ? '#c62828' : s > 0 ? '#2e7d32' : '');
            $csField.css('background', s < 0 ? '#ffebee' : s > 0 ? '#e8f5e9' : '');
            $csField.css('border-color', s < 0 ? '#ef5350' : s > 0 ? '#66bb6a' : 'transparent');
            $csReset.css('visibility', s !== 0 ? 'visible' : 'hidden');
          };
          $shift.on('input', updateCS);
          $csReset.on('click', () => { $shift.val(0); updateCS(); });
        }
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