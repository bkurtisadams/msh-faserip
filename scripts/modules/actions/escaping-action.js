// scripts/modules/actions/escaping-action.js v3.2.0 - 2026-09-02
// v3.2.0: Kernel slice 5f. Result via resolveKernelAttack on the Es column
//         with itemized shifts; hold removal, Escaped/Reversed effects and
//         the Grapple Back button keyed on the effect token (escape /
//         reverse) instead of colour; prefs written in ONE actor.update.
// scripts/modules/actions/escaping-action.js v3.1.1 - 2026-05-24
// v3.1.1: Drop the STR-contest third cell (escaping is a one-roll FEAT). Third
//         cell reverts to DAMAGE (em-dash — escapes deal no damage); meta
//         label reverts to Range:adjacent. Remove now-unused RANK_ABBR import.
// scripts/modules/actions/escaping-action.js v3.1.0 - 2026-05-23
// v3.1.0: Render the chat card on the shared attack-card.hbs shell, mirroring
//         grappling: third cell is a STR-vs-STR contest (escapee vs holder,
//         raw Strength), effect detail in the notes slot, buttons unchanged.
//         _buildChatCard is now async (awaits renderTemplate).
// scripts/modules/actions/escaping-action.js v3.0.0 - 2026-03-18
// v3.0.0: Restyle dialog to frp-dlg system — blue header, wireCSPanel, frp-fx-grid with tooltips
// v2.3.0: Apply post-escape effects — Yellow: half move + no actions. Red: half move + -2CS.
//         Exclude selfPenaltyCS from escape rolls (escape is wrestling, not "normal action")
// v2.2.0: Consistency fixes — add mode selector, fix remember settings to localStorage pattern
// v2.1.0: Restyle chat card to match attack card pattern (inline badge, white result box, no color banner)
// v2.0.0: Compact chat card format, CS notes, effect modifiers, Grapple Back chip on Reverse
// v1.6.0: Add detailed logging for effect removal debugging
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
  resolveKernelAttack,
  buildActionsBox,
  bannerColors, 
  labelFor, 
  effectsFor,
  applyCapabilitiesToDialog,
  showDiceAnimation,
  buildModeSelector,
  setupModeSelector
} from "./action-utils.js";
import { extractKarmaFromDialog, getAvailableKarma, getMinimumKarmaCommitment, setupKarmaControlHandlers } from "../dice/dice-roller.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";
import { applyEscaped, applyReversed } from "../effects/effect-engine.js";

import { showFaseripDialog } from "./dialog-shim.js";
/**
 * Remove grappled/held effects from an actor
 * @param {Actor} actor 
 */
async function removeHoldEffects(actor) {
  if (!actor?.effects) {
    console.log(`[FASERIP] removeHoldEffects: No effects collection on actor`);
    return;
  }
  
  console.log(`[FASERIP] removeHoldEffects: Checking ${actor.effects.size} effects on ${actor.name}`);
  
  const holdEffects = [];
  for (const e of actor.effects) {
    if (e.disabled) continue;
    
    // Check statuses (Set in Foundry v13)
    const hasGrappledStatus = e.statuses?.has?.("grappled") || Array.from(e.statuses || []).includes("grappled");
    const hasHeldStatus = e.statuses?.has?.("held") || Array.from(e.statuses || []).includes("held");
    
    // Check flags
    const flags = e.flags?.["msh-faserip"] || {};
    const hasGrappledFlag = flags.effectType === "grappled" || flags.status?.isGrappled;
    const hasHeldFlag = flags.effectType === "held" || flags.status?.isHeld;
    
    // Check name patterns
    const name = (e.name || "").toLowerCase();
    const hasGrappledName = name.includes("grappled") || name.includes("partial hold");
    const hasHeldName = name.includes("held") || name.includes("full hold");
    
    const isHoldEffect = hasGrappledStatus || hasHeldStatus || hasGrappledFlag || hasHeldFlag || hasGrappledName || hasHeldName;
    
    console.log(`[FASERIP] Effect "${e.name}": statuses=${Array.from(e.statuses || [])}, flagType=${flags.effectType}, isHold=${isHoldEffect}`);
    
    if (isHoldEffect) {
      holdEffects.push(e);
    }
  }
  
  console.log(`[FASERIP] Found ${holdEffects.length} hold effects to remove`);
  
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

    // Build shift breakdown for hover text
    const shiftBreakdown = {
      manual: choice.shift || 0,
      csNotes: choice.csNotes || ""
    };

    // Get effect-based modifiers
    // NOTE: Escape is a wrestling action, NOT a "normal action" — the Partial Hold
    // -2CS selfPenaltyCS applies to "normal actions" only per rules text.
    // Use getAttackShift (attackShift only) instead of getAttackShiftBreakdown (which includes selfPenaltyCS).
    const rawAttackShift = getAttackShiftBreakdown(actor);
    // Filter out selfPenaltyCS entries from the total and breakdown
    let effectShift = 0;
    const filteredBreakdown = [];
    for (const entry of rawAttackShift.breakdown) {
      if (entry.name.includes("(self penalty)")) continue; // skip selfPenaltyCS
      effectShift += entry.shift;
      filteredBreakdown.push(entry);
    }

    // Re-add Impaired Endurance: per RAW, -2CS applies to ALL FEATs including
    // escape ("Character at less than full Endurance: -2CS"). The selfPenaltyCS
    // filter above (intended to exclude Partial Hold) also strips Impaired
    // Endurance, so re-add it directly from the actor's effects.
    const impairedEffect = actor.effects.find(e => e.getFlag("msh-faserip", "isImpairedEndurance"));
    if (impairedEffect) {
      effectShift += -2;
      filteredBreakdown.push({ name: impairedEffect.name, shift: -2 });
    }
    
    // Calculate total shift including effects (excluding selfPenaltyCS)
    const manualShift = choice.shift || 0;
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
      await showDiceAnimation(roll, actor, `${actor.name} attempts to Escape a Hold`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    const attackShifts = [];
    if (manualShift) attackShifts.push({ cs: manualShift, reason: "manual" });
    for (const entry of filteredBreakdown) attackShifts.push({ cs: entry.shift, reason: entry.name });
    const kernelAttack = resolveKernelAttack({ column: "Es", rank: strength.rank, shifts: attackShifts, roll: cappedTotal });
    const color = kernelAttack.color;
    const colorLower = color;
    const effectToken = kernelAttack.effect || "miss";
    const effect = kernelAttack.effectLabel;
    const { bg, fg } = bannerColors(colorLower);

    // Build actions box - show Grapple Back on Reverse
    const showGrappleBack = (effectToken === "reverse");
    const actions = buildActionsBox({
      showGrappleBack: showGrappleBack,
      grappleBackTargetUuid: choice.opponentUuid || "",
      grappleBackTargetName: choice.opponentName || "Opponent",
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,
    });

    const cardHtml = await this._buildChatCard({
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
      attackerEffects: filteredBreakdown
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    // Remove hold effects on Escape or Reverse (green is a Miss on the Es column)
    if (effectToken === "escape") {
      console.log(`[FASERIP] Escape successful (${colorLower}), removing hold effects from ${actor.name}`);
      await removeHoldEffects(actor);
      // Per rules: "free of the hold, may move at half speed, may not perform any other actions"
      await applyEscaped(actor);
    } else if (effectToken === "reverse") {
      console.log(`[FASERIP] Escape reversed (${colorLower}), removing hold effects from ${actor.name}`);
      await removeHoldEffects(actor);
      // Per rules: "free + may grapple back, or perform any other action at -2CS, half move"
      await applyReversed(actor);
    } else {
      console.log(`[FASERIP] Escape failed (${colorLower}), hold effects remain`);
    }

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showDialog(actor, strength) {
    // Auto-fill opponent from opts prefill first, then from target if any
    let prefillOpp = this.opts?.prefill?.opponentName || "";
    let prefillOppStr = this.opts?.prefill?.opponentStr || "";
    let prefillOppUuid = this.opts?.prefill?.opponentUuid || "";
    
    // If no prefill from opts, try from targeted token
    if (!prefillOpp) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        prefillOpp = targets[0].name || "";
        prefillOppStr = targets[0].actor?.system?.abilities?.strength?.rank || "";
        prefillOppUuid = targets[0].actor?.uuid || "";
      }
    }

    // Load persisted settings - localStorage pattern (matches blunt attack)
    const lsRememberKey = "msh.escaping.remember";
    const lsSkipKey = "msh.escaping.skipDice";
    const savedRemember = localStorage.getItem(lsRememberKey) === "1";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";
    const savedShift = savedRemember ? (await actor.getFlag("msh-faserip", "lastEscapeShift") ?? 0) : 0;
    const savedCsNotes = savedRemember ? ((await actor.getFlag("msh-faserip", "lastEscapeCsNotes")) || "") : "";

    // Karma data
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;
    const savedShiftVal = Number(this.opts?.shift ?? savedShift);

    // CS row from shared utility
    const csRowHtml = buildCSRow({ savedCS: savedShiftVal, abilityRank: strength.rank });

    // Blue header gradient for escape
    const headerGrad = 'linear-gradient(90deg, #4682B4 0%, #2c5f8a 100%)';

    const dialogHtml = `
    <div class="frp-dlg">
      <!-- Header banner -->
      <div class="frp-header-v3" style="background: ${headerGrad};">
        <span class="h-actor">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Strength</span>
          <span class="h-stat-rank">${strength.rank} ${strength.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${prefillOpp ? `<span class="h-verb">escapes</span><span class="h-target">${prefillOpp}</span>` : ''}
      </div>

      <!-- Opponent context -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:5px;">
        <div class="frp-box">
          <div class="frp-box-label">Holding You</div>
          <input type="text" name="opponentName" class="frp-cs-notes" style="margin-top:0;font-weight:600;"
                 placeholder="Who is holding you?" value="${prefillOpp}">
          <div style="margin-top:3px;display:flex;align-items:center;gap:4px;">
            <span style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;color:#777;">STR:</span>
            <input type="text" name="opponentStr" class="frp-cs-notes" style="margin-top:0;width:80px;"
                   placeholder="Excellent" value="${prefillOppStr}">
          </div>
        </div>
        <div class="frp-box">
          <div class="frp-box-label">Your Escape</div>
          <div style="font-family:'Oswald',sans-serif;font-weight:700;font-size:14px;">${strength.rank}</div>
          <div style="font-size:12px;color:#444;">Rank Value: ${strength.value}</div>
        </div>
      </div>

      <!-- CS row -->
      ${csRowHtml}

      <!-- CS Notes -->
      <input type="text" name="csNotes" class="frp-cs-notes" style="margin-bottom:5px;"
             placeholder="e.g., Acrobatics +1CS, Slippery -2CS" value="${savedCsNotes}">

      <!-- Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${hasKarma ? ' inactive' : ' inactive'}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w" title="White: still held; no actions this turn.">Miss</div>
        <div class="frp-fx-cell g" title="Green: still held; no actions this turn.">Miss</div>
        <div class="frp-fx-cell y" title="Yellow: free; half move; no other actions.">Escape</div>
        <div class="frp-fx-cell r" title="Red: free + grapple back or act at -2CS.">Reverse</div>
      </div>

      <!-- Footer -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>
    `;

    return new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      showFaseripDialog({
        title: `Escape: ${actor.name}`,
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          $dialog.find('.dialog-buttons').hide();

          // Mode selector in titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastEscapingMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // Wire CS panel
          _csState = wireCSPanel(html, {
            abilityRank: strength.rank,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // Auto-focus Roll button
          html.find('#frp-roll').focus();

          // Enter key -> Roll
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // Roll button
          html.find('#frp-roll').on('click', async () => {
            if (_resolved) return;
            _resolved = true;
            const $ = (s) => html.find(s);
            const { spendKarma } = extractKarmaFromDialog(html);
            const result = {
              opponentName: String($('[name="opponentName"]').val() || "Opponent"),
              opponentStr: String($('[name="opponentStr"]').val() || ""),
              opponentUuid: prefillOppUuid,
              shift: Number($('[name="shift"]').val() || 0),
              csNotes: String($('[name="csNotes"]').val() || ""),
              spendKarma,
              remember: !!$('[name="remember"]').is(':checked'),
              skipDice: !!$('[name="skipDice"]').is(':checked')
            };
            
            // Save remember/skipDice to localStorage
            try {
              localStorage.setItem(lsRememberKey, result.remember ? "1" : "0");
              localStorage.setItem(lsSkipKey, result.skipDice ? "1" : "0");
            } catch (_e) {}
            
            // Persist settings if requested — single document update
            if (result.remember) {
              await actor.update({ "flags.msh-faserip": { lastEscapeShift: result.shift, lastEscapeCsNotes: result.csNotes || "" } });
            }
            
            dlg.close();
            resolve(result);
          });

          // Cancel button
          html.find('#frp-cancel').on('click', () => {
            if (_resolved) return;
            _resolved = true;
            dlg.close();
            resolve(null);
          });

          applyCapabilitiesToDialog(html, "escaping", { actor });
        },
        close: () => { if (!_resolved) resolve(null); }
      });
    });
  }

  async _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, bg, fg, actions, totalShift, shiftBreakdown, attackerEffects = [] }) {
    const effectLower = String(effect).toLowerCase();

    // Effective-rank tooltip (the CS breakdown the FEAT was read against)
    let effRankTooltip = `Strength ${strength.rank}`;
    if (totalShift !== 0) {
      const parts = [];
      if (shiftBreakdown?.manual && shiftBreakdown.manual !== 0) {
        parts.push(shiftBreakdown.csNotes || `${shiftBreakdown.manual > 0 ? '+' : ''}${shiftBreakdown.manual}`);
      }
      for (const eff of attackerEffects) parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
      const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
      effRankTooltip = `${breakdownText} → ${effectiveRank}`;
    }

    // Roll cell
    const rollNum = totalKarmaUsed ? cappedTotal : roll.total;
    const rollTooltip = totalKarmaUsed
      ? `d100 = ${roll.total} + ${totalKarmaUsed} karma = ${cappedTotal}`
      : `d100 = ${roll.total}`;

    // Escape attempts inflict no damage.
    const dmgValue = "—";
    const dmgTooltip = "Escape attempts inflict no damage";

    const effectBlocks = {
      miss: `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Miss</div>
          <div>You remain held and may take no other actions this turn.</div>
        </div>`,
      escape: `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Escape</div>
          <div>You slip free of the hold. Move up to <strong>half speed</strong> — no other actions.</div>
        </div>`,
      reverse: `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Reverse</div>
          <div>You break free. Choose one: move up to half distance · attempt Grapple on former attacker · any other action at <strong>-2CS</strong>.</div>
        </div>`
    };

    const cardData = {
      actionLabel: "ESCAPE",
      formClass: "escape",
      weaponName: "",
      indicatorHtml: `<span style="color:#888;font-size:12px;">Strength FEAT</span>`,
      hasTarget: !!choice.opponentName,
      targetName: choice.opponentName || "",
      targetLabel: "From",
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
