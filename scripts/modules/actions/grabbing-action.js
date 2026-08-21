// scripts/modules/actions/grabbing-action.js v1.7.0 - 2026-03-11
// v1.7.0: Consistency fixes — add effect modifiers, mode selector, replace local rankValues
//         with game.msh.getRankValue, fix remember settings to localStorage pattern,
//         remove unused rollUniversalTable import, add applyCapabilitiesToDialog
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
  getTargetData,
  applyCapabilitiesToDialog,
  buildModeSelector,
  setupModeSelector
} from "./action-utils.js";
import {
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

import { showFaseripDialog } from "./dialog-shim.js";
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
      strength = {
        rank: materialRank,
        value: game.msh.getRankValue(materialRank) || 6
      };
      strengthSource = passedItem.name;
    } else {
      strength = getStrengthInfo(actor);
      strengthSource = "Strength";
    }

    // Build dialog with auto-filled target + strength if exactly one token targeted
    const choice = await this._prompt(actor, strength, { isWeaponGrab, weaponName: isWeaponGrab ? passedItem.name : null, strengthSource });
    if (!choice) return { rawActionCancelled: true };

    // Effective rank after CS + effect modifiers
    const attackerEffects = getAttackShiftBreakdown(actor);
    let defenderEffects = { total: 0, breakdown: [] };

    // Try to get target actor for defender effects
    const targetTokens = Array.from(game.user?.targets ?? []);
    const targetActor = targetTokens[0]?.actor ?? null;
    if (targetActor) {
      defenderEffects = getDefenseShiftBreakdown(targetActor, false);
    }

    const manualShift = choice.shift || 0;
    const effectShift = (attackerEffects.total || 0) - (defenderEffects.total || 0);
    const totalShift = manualShift + effectShift;
    const effectiveRank = shiftRank(strength.rank, totalShift);

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

    // Shift display (hover tooltip style with breakdown)
    let shiftDisplay = "";
    if (totalShift) {
      const parts = [];
      if (manualShift !== 0) parts.push(`${manualShift > 0 ? '+' : ''}${manualShift} manual`);
      for (const eff of (attackerEffects.breakdown || [])) {
        parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
      }
      for (const eff of (defenderEffects.breakdown || [])) {
        parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
      }
      const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
      const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
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

    // Load persisted settings - localStorage pattern (matches blunt attack)
    const lsRememberKey = "msh.grabbing.remember";
    const lsSkipKey = "msh.grabbing.skipDice";
    const savedRemember = localStorage.getItem(lsRememberKey) === "1";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";
    const savedShift = savedRemember ? (await actor.getFlag("msh-faserip", "lastGrabbingShift") ?? 0) : 0;
    const savedSpendKarma = false; // Always default to unchecked

    // Title and ability label
    const dialogTitle = isWeaponGrab ? `Grabbing with ${weaponName}` : this.actionName;
    const abilityLabel = isWeaponGrab ? `${weaponName} (Material)` : "Strength";

    // Karma data
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const abilityShort = RANK_ABBR[strength.rank] || strength.rank;
    const { targetDisplay } = getTargetData();

    // Build CS row via shared utility
    const csRowHtml = buildCSRow({
      savedCS: Number(this.opts?.shift ?? savedShift),
      abilityRank: strength.rank
    });

    const html = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Strength / Rank Value) grabs Target -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base ${abilityLabel}:</span>
          <span class="h-stat-rank">${abilityShort} ${strength.value}</span>
        </span>
        <span class="h-paren">)</span>
        <span class="h-verb">grabs</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>
      </div>

      <!-- CS row (manual input + ? reference) -->
      ${csRowHtml}

      <!-- Target + Item details -->
      <div class="frp-box frp-dmg-box">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;">
          <label style="font-weight:600;font-size:.9em;">Target:</label>
          <input type="text" name="targetName" placeholder="Who holds the item?" value="${prefillTargetName}">
          <label style="font-weight:600;font-size:.9em;">STR:</label>
          <input type="text" name="targetStrength" placeholder="Excellent" value="${prefillTargetStr}">
          <label style="font-weight:600;font-size:.9em;">Item:</label>
          <input type="text" name="itemLabel" placeholder="e.g., Pistol, Bomb, Idol" value="">
          <label style="font-weight:600;font-size:.9em;">Material:</label>
          <div>
            <input type="text" name="itemMaterial" placeholder="e.g., Incredible" style="width:120px;">
            <span style="font-size:.8em;color:#666;margin-left:4px;">If glued/clamped</span>
          </div>
        </div>
        ${isWeaponGrab ? `<div style="color:#6a1b9a;font-size:.85em;margin-top:4px;">Using weapon material strength</div>` : ''}
      </div>

      <!-- Options: Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!hasKarma ? ' inactive' : hasKarma ? ' inactive' : ''}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w" title="No possession; item may scatter 1 area">Miss</div>
        <div class="frp-fx-cell g" title="Take item only if STR ≥ comparator">Take</div>
        <div class="frp-fx-cell y" title="Gain possession regardless of STR">Grab</div>
        <div class="frp-fx-cell r" title="Gain item + Breaking FEAT vs item material">Break</div>
      </div>

      <!-- Footer -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" id="msh-remember-settings" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>
    `;

    return new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      showFaseripDialog({
        title: dialogTitle,
        content: html,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');
          $dialog.find('.dialog-buttons').hide();

          // Inject mode buttons into titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastGrabbingMode");

          // Set dialog width
          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // Wire CS panel from shared utility
          _csState = wireCSPanel(html, {
            abilityRank: strength.rank,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          applyCapabilitiesToDialog(html, "grabbing", { actor });

          // Auto-focus Roll button
          html.find('#frp-roll').focus();

          // Intercept Enter key
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);
            const { spendKarma } = extractKarmaFromDialog(html);
            const cs = _csState.get();
            const result = {
              targetName: String($dlg('[name="targetName"]').val() || "Target"),
              targetStrength: String($dlg('[name="targetStrength"]').val() || ""),
              itemLabel: String($dlg('[name="itemLabel"]').val() || "Item"),
              itemMaterial: String($dlg('[name="itemMaterial"]').val() || ""),
              shift: cs.manualCS,
              spendKarma,
              remember: !!$dlg('#msh-remember-settings').is(':checked'),
              skipDice: !!$dlg('#msh-skip-dice').is(':checked')
            };

            // Save remember/skipDice to localStorage
            try {
              localStorage.setItem(lsRememberKey, result.remember ? "1" : "0");
              localStorage.setItem(lsSkipKey, result.skipDice ? "1" : "0");
            } catch (_e) {}

            // Persist shift if requested
            if (result.remember) {
              await actor.setFlag("msh-faserip", "lastGrabbingShift", result.shift);
            }

            _resolved = true;
            resolve(result);
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
        }
      });
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