// scripts/modules/actions/escaping-action.js v2.3.0 - 2026-03-15
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
  RANKS,
  getStrengthInfo, 
  shiftRank, 
  rollWithKarmaAndHistory,
  buildActionsBox,
  bannerColors, 
  labelFor, 
  effectsFor,
  applyCapabilitiesToDialog,
  showDiceAnimation,
  buildModeSelector,
  setupModeSelector
} from "./action-utils.js";
import { extractKarmaFromDialog, getAvailableKarma, getMinimumKarmaCommitment } from "../dice/dice-roller.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";
import { applyEscaped, applyReversed } from "../effects/effect-engine.js";

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

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effect = this.effects[colorLower] || "Miss";
    const { bg, fg } = bannerColors(colorLower);

    // Build actions box - show Grapple Back on Reverse (red)
    const showGrappleBack = (colorLower === "red");
    const actions = buildActionsBox({
      showGrappleBack: showGrappleBack,
      grappleBackTargetUuid: choice.opponentUuid || "",
      grappleBackTargetName: choice.opponentName || "Opponent",
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
      bg,
      fg,
      actions,
      totalShift,
      shiftBreakdown,
      attackerEffects: filteredBreakdown
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    // Remove hold effects on successful escape (yellow=Escape or red=Reverse only; green is also Miss for escaping)
    if (colorLower === "yellow") {
      console.log(`[FASERIP] Escape successful (yellow), removing hold effects from ${actor.name}`);
      await removeHoldEffects(actor);
      // Per rules: "free of the hold, may move at half speed, may not perform any other actions"
      await applyEscaped(actor);
    } else if (colorLower === "red") {
      console.log(`[FASERIP] Escape reversed (red), removing hold effects from ${actor.name}`);
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
    const savedSpendKarma = false; // Always default to unchecked
    const savedCsNotes = savedRemember ? ((await actor.getFlag("msh-faserip", "lastEscapeCsNotes")) || "") : "";

    // Karma data for inline display
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;
    const savedShiftVal = Number(this.opts?.shift ?? savedShift);

    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Opponent + Your stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Holding You</div>
          <input type="text" name="opponentName" style="width:100%;margin-top:4px;font-weight:600;" placeholder="Who is holding you?" value="${prefillOpp}">
          <div style="margin-top:4px;">
            <span style="color:#666;font-size:.85em;">STR:</span>
            <input type="text" name="opponentStr" style="width:80px;" placeholder="Excellent" value="${prefillOppStr}">
          </div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Escape</div>
          <div style="font-weight:600;">Strength: ${strength.rank}</div>
          <div style="color:#666;">Rank Value: ${strength.value}</div>
        </div>
      </div>

      <!-- Modifiers Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedShiftVal < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedShiftVal > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${savedShiftVal}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${savedShiftVal < 0 ? 'color:#c62828;' : savedShiftVal > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(strength.rank, savedShiftVal)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedShiftVal !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
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
        <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., Acrobatics +1CS, Slippery -2CS" value="${savedCsNotes}" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
      </div>

      <!-- Results Reference -->
      <div style="padding:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;margin-bottom:8px;">
        <div style="font-weight:bold;margin-bottom:4px;">Escaping Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss (W):</strong> Still held; no actions this turn.<br>
          <strong>Escape (G/Y):</strong> Free; half move; no other actions.<br>
          <strong>Reverse (Red):</strong> Free + grapple back or act at -2CS.
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
        title: `Escape: ${actor.name}`,
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
              
              // Persist settings if requested (karma checkbox never persisted)
              if (result.remember) {
                await actor.setFlag("msh-faserip", "lastEscapeShift", result.shift);
                await actor.setFlag("msh-faserip", "lastEscapeCsNotes", result.csNotes || "");
              }
              
              resolve(result);
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          setupModeSelector(actor, html, this.opts || {}, "lastEscapingMode");
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
          applyCapabilitiesToDialog(html, "escaping", { actor });
        }
      }).render(true);
    });
  }

  _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, bg, fg, actions, totalShift, shiftBreakdown, attackerEffects = [] }) {
    const effectLower = String(effect).toLowerCase();

    // CS shift display (hover tooltip style)
    let shiftDisplay = "";
    if (totalShift !== 0) {
      const parts = [];
      if (shiftBreakdown?.manual && shiftBreakdown.manual !== 0) {
        parts.push(shiftBreakdown.csNotes || `${shiftBreakdown.manual > 0 ? '+' : ''}${shiftBreakdown.manual}`);
      }
      for (const eff of attackerEffects) {
        parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
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

    // Effect-specific result boxes (white bg, subtle border — matches attack card)
    const effectBlocks = {
      miss: `
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Miss</div>
          <div>You remain held and may take no other actions this turn.</div>
        </div>`,
      escape: `
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Escape</div>
          <div>You slip free of the hold. Move up to <strong>half speed</strong> — no other actions.</div>
        </div>`,
      reverse: `
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Reverse</div>
          <div>You break free. Choose one: move up to half distance · attempt Grapple on former attacker · any other action at <strong>-2CS</strong>.</div>
        </div>`
    };

    return `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <!-- Header -->
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">ESCAPE</strong>
          <span style="color:#666;font-size:.85em;">Strength FEAT</span>
        </div>
        <!-- Escaper vs Holder -->
        <div style="padding:4px 10px;font-size:.95em;">
          <strong>${actor.name}</strong> <span style="color:#666;">escaping from</span> <strong style="color:#d32f2f;">${choice.opponentName}</strong>
          ${choice.opponentStr ? `<span style="color:#666;font-size:.85em;margin-left:8px;">(their STR: ${choice.opponentStr})</span>` : ''}
        </div>
        <!-- Strength + Roll + inline result badge -->
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>Strength: ${strength.rank}${shiftDisplay}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span>Roll: ${rollDisplay}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
            </span>
          </div>
        </div>
        ${effectBlocks[effectLower] || ""}
        ${actions}
      </div>
    `;
  }
}