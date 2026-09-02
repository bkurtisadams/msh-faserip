// scripts/modules/actions/grabbing-action.js v2.0.0 - 2026-09-02
// v2.0.0: Chat card on the shared attack-card.hbs template (banner, ROLL /
//         STRENGTH / COMPARATOR cells, effect block, actions) — matches the
//         Grappling and Escaping cards; hand-built HTML retired. Break block
//         text follows the RAW second roll (material column, white = breaks).
// v1.8.0: Kernel slice 5f. Result via resolveKernelAttack on the Gb column
//         with itemized shifts (take / grab / break tokens); comparator
//         rank check via adapter compareRankNames (RANKS index compare
//         retired).
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
  getStrengthInfo,
  shiftRank,
  rollWithKarmaAndHistory,
  resolveKernelAttack,
  effectsFor,
  labelFor,
  buildActionsBox,
  bannerColors,
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
import { compareRankNames } from "../../kernel/adapter.js";
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

    // Universal Table result via kernel (Gb column)
    const attackShifts = [];
    if (manualShift) attackShifts.push({ cs: manualShift, reason: "manual" });
    for (const eff of (attackerEffects.breakdown || [])) attackShifts.push({ cs: eff.shift, reason: eff.name });
    for (const eff of (defenderEffects.breakdown || [])) attackShifts.push({ cs: -eff.shift, reason: eff.name });
    const kernelAttack = resolveKernelAttack({ column: "Gb", rank: strength.rank, shifts: attackShifts, roll: cappedTotal });
    const color = kernelAttack.color;
    let colorLower = color;
    let effectResult = kernelAttack.effectLabel;

    // Enforce Take rule: Attacker STR ≥ comparator, else Treat as Miss (visual White)
    let takeDowngraded = false;
    if (String(effectResult).toLowerCase() === "take" && mustDowngradeGreen) {
        effectResult = "Miss";
        colorLower = "white";
        takeDowngraded = true;
    }

    const { bg, fg } = bannerColors(colorLower);

    const compNote = this._composeComparatorLine(choice);

    // For Break, show a "Grabbing Break Check" button
    const grabbingBreak = (String(effectResult).toLowerCase() === "break")
      ? { itemMaterial: choice.itemMaterial || "Excellent", itemName: choice.itemLabel || "Item" }
      : null;

    const actions = buildActionsBox({
      grabbingBreak,
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,
    });

    const cardHtml = await this._buildChatCard({
      actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal,
      color, effect: effectResult, bg, fg, actions, totalShift, manualShift,
      attackerEffects: attackerEffects.breakdown || [],
      defenderEffects: defenderEffects.breakdown || [],
      compNote, takeDowngraded
    });

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
    const cmp = compareRankNames(aRank, bRank);
    if (cmp !== null) return cmp >= 0;
    // unknown comparator -> pass; unknown attacker rank -> fail
    return !!String(aRank || "").trim() && compareRankNames(aRank, aRank) !== null;
  }

  _composeComparatorLine(choice) {
    const mat = String(choice.itemMaterial || "").trim();
    const tStr = String(choice.targetStrength || "").trim();

    if (mat) return `Item Material = ${mat} (glued/clamped/locked case)`;
    if (tStr) return `Target STR = ${tStr}`;
    return ""; // no comparator provided (Take will default to pass if none)
  }

  async _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, bg, fg, actions, totalShift, manualShift, attackerEffects = [], defenderEffects = [], compNote = "", takeDowngraded = false }) {
    const effectLower = String(effect).toLowerCase();

    // Effective-rank tooltip (the CS breakdown the FEAT was read against)
    let effRankTooltip = `Strength ${strength.rank}`;
    if (totalShift !== 0) {
      const parts = [];
      if (manualShift) parts.push(choice.csNotes || `${manualShift > 0 ? '+' : ''}${manualShift} manual`);
      for (const eff of attackerEffects) parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
      for (const eff of defenderEffects) parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
      const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
      effRankTooltip = `${breakdownText} → ${effectiveRank}`;
    }

    // Roll cell
    const rollNum = totalKarmaUsed ? cappedTotal : roll.total;
    const rollTooltip = totalKarmaUsed
      ? `d100 = ${roll.total} + ${totalKarmaUsed} karma = ${cappedTotal}`
      : `d100 = ${roll.total}`;

    // Third cell: the Take comparator (grabbing inflicts no damage)
    const cmp = this._chooseComparatorRank(choice);
    const dmgValue = cmp || "—";
    const dmgTooltip = compNote ? `Take comparator: ${compNote}` : "No comparator supplied — Take passes";

    const box = (title, body) => `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">${title}</div>
          <div>${body}</div>
        </div>`;
    const downgradeNote = takeDowngraded
      ? `<div style="margin-top:3px;color:#666;">Take downgraded to <strong>Miss</strong> — Strength ${strength.rank} is below the comparator (${cmp}).</div>`
      : "";
    const effectBlocks = {
      miss: box("Miss", `Item not secured. If it was loose, it may scatter up to one area (Judge decides direction).${downgradeNote}`),
      take: box("Take", `Possession gained — Strength ${strength.rank} meets or beats the comparator${cmp ? ` (${cmp})` : ""}.`),
      grab: box("Grab", "Possession gained regardless of the Strength comparison."),
      break: box("Break", `Item seized. Use the <strong>Grabbing Break Check</strong> button to roll on the item's material column: any colour keeps it intact (use it or move half speed), white means it is damaged, broken, or goes off.`)
    };

    const cardData = {
      actionLabel: "GRABBING",
      formClass: "grabbing",
      weaponName: choice.itemLabel || "",
      indicatorHtml: `<span style="color:#888;font-size:12px;">Strength FEAT</span>`,
      hasTarget: !!choice.targetName,
      targetName: choice.targetName || "",
      targetLabel: "Target",
      rangeText: "adjacent",
      badgesHtml: "",
      resultBg: bg,
      resultFg: fg,
      resultText: `${String(color).toUpperCase()} — ${String(effect).toUpperCase()}`,
      rollNum,
      rollTooltip,
      abilityLabelUpper: "STRENGTH",
      effRankValue: effectiveRank,
      effRankTooltip,
      dmgValue,
      dmgTooltip,
      notesHtml: effectBlocks[effectLower] || "",
      consequenceHtml: "",
      actionsHtml: actions,
      manualNoticeHtml: ""
    };

    return await foundry.applications.handlebars.renderTemplate(
      "systems/msh-faserip/templates/chat/attack-card.hbs",
      cardData
    );
  }
}