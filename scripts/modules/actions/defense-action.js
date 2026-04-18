// scripts/modules/actions/defense-action.js v2.0.0 - 2026-03-18
// v2.0.0: Restyle dialog to frp-dlg system — color-coded header (green),
//         wireCSPanel, frp-fx-grid with hover tooltips, frp-foot, mode selector in titlebar
// v1.5.1: Fix dodge — only write defenseShiftRanged (not defenseShift) so dodge has
//         no effect on adjacent Slugfest/Wrestling per rules
// v1.5.0: Redesign dialog to Style A (grid header, inline CS/karma, standardized footer)
// v1.4.1: Always use compact badge layout — drop buildInlineRollDisplay widget from defense cards
// v1.3.8: Fix dodge movementMult and selfPenaltyCS not wired as AE changes (only in flags); ruler now enforces half speed
// v1.3.7: Add canAttack:false to blocking effect; blocking now prevents attacks per rules
// v1.3.6: Wire dodge CS penalty and half movement to Active Effect changes array
// v1.3.4: Fix evasion bonus duration - use 2 rounds to survive round-change expiration; usability controlled by createdRound check
// v1.3.3: Fix evasion bonus duration - 1 round starting next round, cannot be saved
// v1.3.2: Split evasion into two effects - "Evading" (blocks attacks, 1 round) and "Evasion Bonus" (+CS, 2 rounds)
// v1.3.1: Fix evasion duration - yellow/red get 2 rounds for next-round bonus, track createdRound
// v1.3.0: Fix evasion - track evadeSuccessful for green/yellow/red results, attacks check this to miss
// v1.2.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.1.0: Add inline rolls for consolidated chat cards
import { BaseAction } from "./base-action.js";
import { 
  extractKarmaFromDialog, 
  getAvailableKarma, 
  getMinimumKarmaCommitment,
  setupKarmaControlHandlers
} from "../dice/dice-roller.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  effectsFor,
  labelFor,
  rollWithKarmaAndHistory,
  bannerColors,
  showDiceAnimation,
  buildModeSelector, setupModeSelector
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

/**
 * Handles: "dodging" | "evading" | "blocking" | "catching"
 * Expect dispatcher to pass { actionType, abilityName, opts }
 */
export class DefenseAction extends BaseAction {
  constructor(a, b, c) {
    const inferAbilityFor = (t) => ({
      dodging:  'agility',
      evading:  'fighting',
      blocking: 'strength',
      catching: 'agility'
    }[t] || 'fighting');

    // Case 1: new DefenseAction({ actor, actionType, abilityName, opts })
    if (a && typeof a === "object" && a !== null && "actor" in a) {
      const cfg         = a || {};
      const actionType  = cfg.actionType || cfg.opts?.actionType || "dodging";
      const abilityName = cfg.abilityName || cfg.opts?.abilityName || inferAbilityFor(actionType);
      const opts        = cfg.opts || {};
      super({ actor: cfg.actor, abilityName, opts });   // <-- pass object
      this.actionType  = actionType;
      this.abilityName = abilityName;
      return;
    }

    // Case 2: new DefenseAction(actor, { actionType, abilityName, opts })
    if (a && typeof b === "object" && b !== null) {
      const actor       = a;
      const actionType  = b.actionType || b.opts?.actionType || "dodging";
      const abilityName = b.abilityName || b.opts?.abilityName || inferAbilityFor(actionType);
      const opts        = b.opts || {};
      super({ actor, abilityName, opts });              // <-- pass object
      this.actionType  = actionType;
      this.abilityName = abilityName;
      return;
    }

    // Case 3 (legacy): new DefenseAction(actor, abilityName, opts)
    const actor       = a;
    const abilityName = (typeof b === "string" && b) ? b : inferAbilityFor(c?.actionType || "dodging");
    const opts        = c || {};
    const actionType  = opts.actionType || "dodging";
    super({ actor, abilityName, opts });                // <-- pass object
    this.actionType  = actionType;
    this.abilityName = abilityName;
  }
  
  async execute() {
    console.debug("DefenseAction:", {
        type: this.actionType,
        ability: this.abilityName,
        actor: this.actor?.name
        });

    const actor = this.actor;
    const actionType = this.actionType;
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName);

    // Karma data
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;
    const savedShift = Number(this.opts.shift ?? 0);

    // ------- Dialog -------
    // Header gradient color per action category
    const headerGrad = 'linear-gradient(90deg, #2e8b2e 0%, #1a6b1a 100%)';
    const abilityLabel = { dodging: 'Agility', evading: 'Fighting', blocking: 'Strength', catching: 'Agility' }[actionType] || ability.name;

    // Per-action extra HTML
    const extraHtml = this._buildExtraHtml(actionType);

    // Effect preview cells with hover tooltips
    const fxCells = this._buildFxCells(actionType);

    // CS row from shared utility
    const csRowHtml = buildCSRow({ savedCS: savedShift, abilityRank: ability.rank });

    const dialogHtml = `
    <div class="frp-dlg">
      <!-- Header banner -->
      <div class="frp-header-v3" style="background: ${headerGrad};">
        <span class="h-actor">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">${abilityLabel}</span>
          <span class="h-stat-rank">${ability.rank} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
      </div>

      <!-- CS row -->
      ${csRowHtml}

      <!-- Per-action fields -->
      ${extraHtml}

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
        ${fxCells}
      </div>

      <!-- Footer -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="skipDice" ${this.opts.skipDice ? "checked" : ""}> Skip dice</label>
        </div>
      </div>
    </div>
    `;

    const choice = await new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      const dlg = new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {},
        render: async (html) => {
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
          const modeKey = `last${actionType.charAt(0).toUpperCase() + actionType.slice(1)}Mode`;
          await setupModeSelector(actor, $dialog, this.opts || {}, modeKey);

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // Wire CS panel
          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // Auto-focus Roll button
          html.find('#frp-roll').focus();

          // Enter key → Roll
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // Roll button
          html.find('#frp-roll').on('click', () => {
            if (_resolved) return;
            _resolved = true;
            const result = this._readDialog(actionType, html);
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
        },
        close: () => { if (!_resolved) resolve(null); }
      }).render(true);
    });
    if (!choice) return;

    // Effective rank
    const effectiveRank = shiftRank(ability.rank, choice.shift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    // Roll
    const roll = await (new Roll("1d100")).evaluate();
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} performs ${actionName}`, useConsolidated);
    }

    // Karma (only up to 100)
    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    // Defense cards always use the compact badge layout (no inline dice widget)

    // Result & effect text
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    const { bg, fg } = bannerColors(colorLower);

    // Compute special outcome blocks per action
    const specialHtml = await this._specialOutcomeHtml({ actionType, ability, colorLower, choice });

    // CREATE THE EFFECT AUTOMATICALLY (NEW!)
    await this._createDefenseEffect({ actionType, ability, colorLower, choice });

    // Action chips (light placeholders)
    const actionsHtml = this._actionsBox({ actionType, colorLower });

    // Ability label for chat card
    const featLabel = `${abilityLabel} FEAT`;

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

    // Context line (evasion target, catching scenario)
    const contextLine = this._contextLine(actionType, choice);

    // Final card — matches attack/check card pattern
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <!-- Header: Action + FEAT type -->
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">${actionName.toUpperCase()}</strong>
          <span style="color:#666;font-size:.85em;">${featLabel}</span>
        </div>
        <!-- Actor row -->
        <div style="padding:4px 10px;font-size:.95em;"><strong>${actor.name}</strong></div>
        <!-- Ability + Roll + inline result badge -->
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>${abilityLabel}: ${ability.rank} (${ability.value})${shiftDisplay}</div>
          ${contextLine ? `<div style="color:#666;">${contextLine}</div>` : ''}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span>Roll: ${rollDisplay}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
            </span>
          </div>
        </div>
        <!-- Outcome detail box -->
        ${specialHtml}
        ${actionsHtml}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }

  // ------- Per-action UI bits -------

  _buildExtraHtml(actionType) {
    if (actionType === "evading") {
      let prefillTarget = "";
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) prefillTarget = targets[0].name || "";
      return `
        <div class="frp-box">
          <div class="frp-box-label">Opponent</div>
          <input type="text" name="evadeTarget" class="frp-cs-notes" style="margin-top:0;"
                 placeholder="Who you're evading (single adjacent)" value="${prefillTarget}">
        </div>`;
    }
    if (actionType === "catching") {
      return `
        <div class="frp-box">
          <div class="frp-box-label">Catching</div>
          <select name="catchScenario" class="frp-select" style="margin-bottom:4px;">
            <option value="falling">Falling object / ally</option>
            <option value="shooting-bullet">Bullet (needs Unearthly Agi)</option>
            <option value="shooting-arrow">Arrow (needs Amazing Agi)</option>
            <option value="throwing-other">Thrown projectile (needs Remarkable Agi)</option>
          </select>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" name="catchVsYou"> Directed at you (\u20133CS)
          </label>
        </div>`;
    }
    return "";
  }

  _buildFxCells(actionType) {
    const data = {
      dodging: [
        { cls: "w", label: "No Penalty", tip: "White: no CS penalty to attackers." },
        { cls: "g", label: "-2CS",        tip: "Green: attackers at -2CS on attacks you're aware of. Half move; -2CS own FEATs." },
        { cls: "y", label: "-4CS",        tip: "Yellow: attackers at -4CS. Half move; -2CS own FEATs. No effect vs adjacent Slugfest/Wrestling." },
        { cls: "r", label: "-6CS",        tip: "Red: attackers at -6CS. Half move; -2CS own FEATs. No effect vs adjacent Slugfest/Wrestling." }
      ],
      evading: [
        { cls: "w", label: "Auto-Hit",    tip: "White: opponent auto-hits (at least Green result). No attacks this round." },
        { cls: "g", label: "Evasion",     tip: "Green: you avoid the blow. No attacks this round." },
        { cls: "y", label: "Evasion +1",  tip: "Yellow: avoid blow + next round first attack vs that attacker at +1CS." },
        { cls: "r", label: "Evasion +2",  tip: "Red: avoid blow + next round first attack vs that attacker at +2CS." }
      ],
      blocking: [
        { cls: "w", label: "-6CS Armor",  tip: "White: Strength -6CS as Body Armor vs physical. No other actions." },
        { cls: "g", label: "-4CS Armor",  tip: "Green: Strength -4CS as Body Armor vs physical. No other actions." },
        { cls: "y", label: "-2CS Armor",  tip: "Yellow: Strength -2CS as Body Armor vs physical. No other actions." },
        { cls: "r", label: "+1CS Armor",  tip: "Red: Strength +1CS as Body Armor vs physical. No other actions." }
      ],
      catching: [
        { cls: "w", label: "Auto-Hit",    tip: "White: object/attack hits you normally." },
        { cls: "g", label: "Miss",        tip: "Green: fail to catch. If it was an attack, attacker gets +1CS." },
        { cls: "y", label: "Damage",      tip: "Yellow: catch it, but you may damage the caught object/ally." },
        { cls: "r", label: "Catch",       tip: "Red: clean catch, no ill effects." }
      ]
    };
    const cells = data[actionType] || [];
    return cells.map(c => `<div class="frp-fx-cell ${c.cls}" title="${c.tip}">${c.label}</div>`).join("\n        ");
  }

  _readDialog(actionType, html) {
    const shift   = Number(html.find('[name="shift"]').val() || 0);
    const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
    const karma   = karmaToSpend;
    const skipDice= !!html.find('[name="skipDice"]').is(':checked');

    if (actionType === "evading") {
      return { shift, karma, spendKarma, skipDice, evadeTarget: String(html.find('[name="evadeTarget"]').val() || "") };
    }
    if (actionType === "catching") {
      return {
        shift, karma, spendKarma, skipDice,
        catchScenario: String(html.find('[name="catchScenario"]').val() || "falling"),
        catchVsYou: !!html.find('[name="catchVsYou"]').is(':checked')
      };
    }
    return { shift, karma, spendKarma, skipDice };
  }

  _contextLine(actionType, choice) {
    if (actionType === "evading") {
      return `<div>Targeting: ${choice.evadeTarget ? choice.evadeTarget : "(single adjacent attacker)"} </div>`;
    }
    if (actionType === "catching") {
      const map = {
        "falling": "Falling object/ally",
        "shooting-bullet": "Shooting (bullet)",
        "shooting-arrow": "Shooting (arrow)",
        "throwing-other": "Thrown projectile"
      };
      return `<div>Catching: ${map[choice.catchScenario] || "Object"}${choice.catchVsYou ? " \u2014 vs you (\u20133CS)" : ""}</div>`;
    }
    return "";
  }

  // ------- Outcome engines per action -------

  async _specialOutcomeHtml({ actionType, ability, colorLower, choice }) {
    if (actionType === "blocking") {
      // Body Armor shift: White -6, Green -4, Yellow -2, Red +1 (from source text)
      let blockShift = 0;
      if (colorLower === 'white') blockShift = -6;
      else if (colorLower === 'green') blockShift = -4;
      else if (colorLower === 'yellow') blockShift = -2;
      else if (colorLower === 'red') blockShift = 1;

      const idx = RANKS.indexOf(ability.rank);
      if (idx !== -1) {
        const armorIndex = Math.min(Math.max(idx + blockShift, 0), RANKS.length - 1);
        const armorRank = RANKS[armorIndex];
        const armorValue = game.msh.getRankValue(armorRank);

        // Set a lightweight temp flag (manual application)
        await this._setTempFlag("blocking", { armorRank, armorValue });

        return `
          <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
            <div style="font-weight:700;color:#e65100;margin-bottom:2px;">BODY ARMOR: ${armorRank} (${armorValue})</div>
            <div style="color:#555;">${ability.rank} Strength −${Math.abs(blockShift > 0 ? 0 : blockShift)}CS = ${armorRank} Body Armor.</div>
            <div style="color:#555;margin-top:2px;">Applies vs physical attacks (Grappling, Slugfest, Throwing, Force, Wrestling). Not vs Shooting, Energy, or Charging. Normal Armor also applies; Force Fields do not stack.</div>
            <div style="color:#c62828;margin-top:3px;">No other action this round.</div>
          </div>
        `;
      }
    }

    if (actionType === "dodging") {
      // Attacker CS penalty: White None, Green -2, Yellow -4, Red -6
      const penalty = (colorLower === 'green') ? -2
                    : (colorLower === 'yellow') ? -4
                    : (colorLower === 'red') ? -6 : 0;

      await this._setTempFlag("dodging", {
        attackerPenaltyCS: penalty,
        selfPenaltyCS: -2, // your FEATs at -2CS this turn
        notes: "Half move; no Charge; only one other action; affects attacks you’re aware of this phase."
      });

      return `
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:#2e7d32;margin-bottom:2px;">${penalty ? `${penalty}CS PENALTY TO ATTACKERS` : 'NO PENALTY (WHITE)'}</div>
          <div style="color:#555;">Applies to attacks you're aware of this phase. Half move only; no Charge; only one other action.</div>
          <div style="color:#888;margin-top:3px;">Your own FEATs this round: -2CS. No effect vs adjacent Slugfest/Wrestling.</div>
        </div>
      `;
    }

    if (actionType === "evading") {
      // White: Auto-Hit; Green: Evasion; Yellow: Evasion +1; Red: Evasion +2 (for NEXT round vs that attacker)
      let nextRoundBonus = 0;
      let note = "";
      if (colorLower === 'white') {
        note = "Auto-Hit: opponent’s result counts as at least Green (Slugfest will always hit).";
      } else if (colorLower === 'green') {
        note = "Evasion: you avoid that attacker’s blow (no damage).";
      } else if (colorLower === 'yellow') {
        nextRoundBonus = 1;
        note = "Evasion +1CS: avoid this blow; next round, your first attack vs that attacker gets +1CS.";
      } else if (colorLower === 'red') {
        nextRoundBonus = 2;
        note = "Evasion +2CS: avoid this blow; next round, your first attack vs that attacker gets +2CS.";
      }

      // Store a small temp flag so you can apply the next-round bonus manually
      await this._setTempFlag("evading", {
        target: choice.evadeTarget || "(adjacent attacker)",
        evadeSuccessful: colorLower !== 'white',
        autoHit: colorLower === 'white',
        nextRoundAttackBonusCS: nextRoundBonus,
        note
      });

      return `
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:${colorLower === 'white' ? '#c62828' : '#2e7d32'};margin-bottom:2px;">${colorLower === 'white' ? 'AUTO-HIT' : 'EVASION' + (nextRoundBonus ? ' +' + nextRoundBonus + 'CS' : '')}</div>
          <div style="color:#555;">${note}</div>
          ${nextRoundBonus ? `<div style="color:#1565c0;font-weight:600;margin-top:3px;">Next round: first attack vs ${choice.evadeTarget || "that attacker"}: +${nextRoundBonus}CS (cannot save).</div>` : ""}
          ${colorLower !== 'white' ? '<div style="color:#c62828;margin-top:3px;">No attacks this round.</div>' : ""}
        </div>
      `;
    }

    if (actionType === "catching") {
      // Catching outcomes and prerequisites
      const prereqHtml = this._catchingPrereqHtml(ability, choice);
      let hint = "";
      if (colorLower === 'white') {
        hint = "Auto-hit: the object/attack hits you (treat falling as a Charge at fall speed; shooting/throwing auto-hit at least Green).";
      } else if (colorLower === 'green') {
        hint = "Miss: you fail to catch it. If it was an attack on you, attacker gains +1CS to hit.";
      } else if (colorLower === 'yellow') {
        hint = "Damage: you catch it, but you might damage the caught object/ally (resolve as damage vs that target).";
      } else if (colorLower === 'red') {
        hint = "Catch: clean catch with no ill effects.";
      }

      // –3CS if the object/attack is directed at you (we present in context; actual FEAT rank shift is up to table ops)
      await this._setTempFlag("catching", {
        scenario: choice.catchScenario,
        vsYou: !!choice.catchVsYou,
        note: hint
      });

      return `
        ${prereqHtml}
        <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:#2e7d32;margin-bottom:2px;">${colorLower === 'red' ? 'CLEAN CATCH' : colorLower === 'yellow' ? 'DAMAGE' : colorLower === 'green' ? 'MISS' : 'AUTO-HIT'}</div>
          <div style="color:#555;">${hint}</div>
          ${choice.catchVsYou ? '<div style="color:#888;margin-top:3px;">Directed at you: -3CS was applied to this roll.</div>' : ""}
        </div>
      `;
    }

    return "";
  }

  // Add this method to the DefenseAction class in defense-action.js
  // Place it after the _specialOutcomeHtml method

  /**
   * Create an ActiveEffect for defense actions that shows on the token
   */
  async _createDefenseEffect({ actionType, ability, colorLower, choice }) {
    if (actionType === "blocking") {
      let blockShift = 0;
      if (colorLower === 'white') blockShift = -6;
      else if (colorLower === 'green') blockShift = -4;
      else if (colorLower === 'yellow') blockShift = -2;
      else if (colorLower === 'red') blockShift = 1;

      const idx = RANKS.indexOf(ability.rank);
      if (idx !== -1) {
        const armorIndex = Math.min(Math.max(idx + blockShift, 0), RANKS.length - 1);
        const armorRank = RANKS[armorIndex];
        const armorValue = game.msh.getRankValue(armorRank);

        // Remove existing blocking effect
        const existingBlock = this.actor.effects.find(e => 
          e.flags?.["msh-faserip"]?.isBlocking
        );
        if (existingBlock) await existingBlock.delete();

        // Create new blocking effect
        // Per rules: "may take no other action" — prevent attacks
        // Blocking armor is checked by getBodyArmorValues() during attack resolution
        const effectData = {
          name: `Blocking (${armorRank} Armor)`,
          icon: "icons/svg/shield.svg",
          origin: this.actor.uuid,
          disabled: false,
          duration: {
            value: 1,
            units: "turns",
            expiry: "roundEnd"
          },
          changes: [
            // Block: "may take no other action"
            { key: "system.combatMods.canAct", mode: 5, value: "false", priority: 50 }
          ],
          flags: {
            "msh-faserip": {
              isBlocking: true,
              armorRank: armorRank,
              armorValue: armorValue,
              notes: "Strength as Body Armor vs physical attacks (not Shooting/Energy/Charging). No attacks this round."
            }
          }
        };

        await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      }
    }

    if (actionType === "dodging") {
      const penalty = (colorLower === 'green') ? -2
                    : (colorLower === 'yellow') ? -4
                    : (colorLower === 'red') ? -6 : 0;

      // Remove existing dodging effect
      const existingDodge = this.actor.effects.find(e => 
        e.flags?.["msh-faserip"]?.isDodging
      );
      if (existingDodge) await existingDodge.delete();

      // Create new dodging effect
      // Defense shift = positive value (harder to hit), derived from attacker penalty
      const defenseBonus = Math.abs(penalty);
      const penaltyText = penalty !== 0 ? `${penalty}CS penalty to attackers` : "no penalty";
      
      // Build changes array: defense shift applies to ranged/charging only
      // Per rules: "Only vs attacks character is aware of. No effect on adjacent Slugfest/Wrestling."
      // defenseShiftRanged is read for ranged attacks; defenseShift (melee) is NOT set.
      const changes = [
        // Half movement while dodging (ruler reads this multiplier)
        { key: "system.combatMods.movementMult", mode: 5, value: "0.5", priority: 20 },
        // -2CS on all own FEATs while dodging
        { key: "system.combatMods.selfPenaltyCS", mode: 2, value: "-2", priority: 20 }
      ];
      if (defenseBonus > 0) {
        changes.push(
          { key: "system.combatMods.defenseShiftRanged", mode: 2, value: String(defenseBonus), priority: 20 }
        );
      }

      const effectData = {
        name: `Dodging (${penaltyText})`,
        icon: "icons/svg/windmill.svg",
        origin: this.actor.uuid,
        disabled: false,
        duration: {
          value: 1,
          units: "turns",
          expiry: "roundEnd"
        },
        changes,
        flags: {
          "msh-faserip": {
            isDodging: true,
            attackerPenaltyCS: penalty,
            selfPenaltyCS: -2,
            notes: "Attackers suffer CS penalty; your FEATs at -2CS; half move only; no effect vs adjacent Slugfest/Wrestling"
          }
        }
      };

      await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
    }

    if (actionType === "evading") {
      // Evasion results per rules:
      // White: Auto-Hit - opponent gets at least green result
      // Green: Evasion - dodge successful, attacker misses (no damage)
      // Yellow: Evasion +1CS - dodge + next round bonus
      // Red: Evasion +2CS - dodge + next round bonus
      //
      // The evading character makes NO ATTACKS that round.
      // Two effects are created:
      // 1) "Evading" effect - lasts 1 round, prevents attacking, causes attacker to miss/auto-hit
      // 2) "Evasion Bonus" effect - lasts 2 rounds, gives +CS on next attack (yellow/red only)
      
      let nextRoundBonus = 0;
      let evadeSuccessful = false;  // Did we dodge the blow?
      
      if (colorLower === 'white') {
        evadeSuccessful = false;  // Auto-hit: attacker gets at least green
      } else if (colorLower === 'green') {
        evadeSuccessful = true;   // Dodge successful, no bonus
        nextRoundBonus = 0;
      } else if (colorLower === 'yellow') {
        evadeSuccessful = true;
        nextRoundBonus = 1;
      } else if (colorLower === 'red') {
        evadeSuccessful = true;
        nextRoundBonus = 2;
      }

      // Remove existing evading effects
      const existingEvade = this.actor.effects.find(e => 
        e.flags?.["msh-faserip"]?.isEvading
      );
      if (existingEvade) await existingEvade.delete();
      
      const existingBonus = this.actor.effects.find(e => 
        e.flags?.["msh-faserip"]?.isEvasionBonus
      );
      if (existingBonus) await existingBonus.delete();

      // Store the evaded target name for matching during attacks
      const evadedTargetName = choice.evadeTarget || "";
      
      // ===== EFFECT 1: Evading Status (1 round) =====
      // This effect:
      // - Prevents the evader from acting this round (canAct: false)
      // - Causes the evaded attacker to miss (or auto-hit on white)
      let evadingEffectName;
      if (colorLower === 'white') {
        evadingEffectName = evadedTargetName 
          ? `Evasion Failed vs ${evadedTargetName} (Auto-Hit)` 
          : "Evasion Failed (Auto-Hit)";
      } else {
        evadingEffectName = evadedTargetName 
          ? `Evading ${evadedTargetName}` 
          : "Evading";
      }
      
      const evadingEffectData = {
        name: evadingEffectName,
        icon: colorLower === 'white' ? "icons/svg/hazard.svg" : "icons/svg/combat.svg",
        origin: this.actor.uuid,
        disabled: false,
        duration: {
          value: 1,
          units: "turns",
          expiry: "roundEnd"
        },
        // Evading prevents actions this round (per rules: "makes no attacks that round")
        changes: [
          { key: "system.combatMods.canAct", mode: 5, value: "false", priority: 50 }
        ],
        flags: {
          "msh-faserip": {
            isEvading: true,
            evadeSuccessful: evadeSuccessful,  // TRUE = attacker's blow is dodged
            autoHit: colorLower === 'white',   // TRUE = attacker gets at least green
            evadedTarget: evadedTargetName,
            evadedTargetLower: evadedTargetName.toLowerCase(),
            createdRound: game.combat?.round || 0,
            notes: colorLower === 'white' 
              ? "Opponent auto-hits (at least Green result); you cannot attack this round"
              : `Evading: opponent's blow misses; you cannot attack this round`
          }
        }
      };

      await this.actor.createEmbeddedDocuments('ActiveEffect', [evadingEffectData]);
      
      // ===== EFFECT 2: Evasion Bonus (yellow/red only) =====
      // This effect gives +1CS or +2CS on the next attack vs the evaded target
      // It only applies in the next round and cannot be saved
      // Uses explicit expiresAtRound flag to survive Foundry's duration conversion
      if (nextRoundBonus > 0) {
        const bonusEffectName = evadedTargetName 
          ? `Evasion Bonus vs ${evadedTargetName} (+${nextRoundBonus}CS)` 
          : `Evasion Bonus (+${nextRoundBonus}CS)`;
        
        const currentRound = game.combat?.round || 0;
        
        const bonusEffectData = {
          name: bonusEffectName,
          icon: "icons/svg/upgrade.svg",
          origin: this.actor.uuid,
          disabled: false,
          duration: {
            value: 2,  // Fallback duration; real expiry controlled by expiresAtRound flag
            units: "turns",
            expiry: "roundEnd"
          },
          flags: {
            "msh-faserip": {
              isEvasionBonus: true,
              evadedTarget: evadedTargetName,
              evadedTargetLower: evadedTargetName.toLowerCase(),
              nextRoundAttackBonusCS: nextRoundBonus,
              nextRoundBonusUsed: false,
              createdRound: currentRound,
              expiresAtRound: currentRound + 2,  // Expires at start of round N+2 (usable in round N+1 only)
              notes: `+${nextRoundBonus}CS to your first attack vs ${evadedTargetName || "that attacker"} next round (cannot be saved)`
            }
          }
        };

        await this.actor.createEmbeddedDocuments('ActiveEffect', [bonusEffectData]);
        console.log("[FASERIP] Created Evasion Bonus effect:", {
          actor: this.actor.name,
          bonus: nextRoundBonus,
          createdRound: currentRound,
          expiresAtRound: currentRound + 2,
          usableInRound: currentRound + 1
        });
      }
    }
  }

  _catchingPrereqHtml(ability, choice) {
    // Show min-Agility prerequisites for shooting/throwing; falling has no min.
    const agiRankIndex = RANKS.indexOf(ability.rank);
    const need = (rank) => RANKS.indexOf(rank);

    const checks = [];
    if (choice.catchScenario === "shooting-bullet") {
      checks.push({ label: "Bullet", min: "Unearthly" });
    } else if (choice.catchScenario === "shooting-arrow") {
      checks.push({ label: "Arrow", min: "Amazing" });
    } else if (choice.catchScenario === "throwing-other") {
      checks.push({ label: "Thrown projectile", min: "Remarkable" });
    }

    if (!checks.length) return ""; // Falling object

    const rows = checks.map(c => {
      const ok = agiRankIndex >= need(c.min);
      return `<div>• ${c.label}: requires at least <strong>${c.min}</strong> Agility — ${ok ? `<span style="color:#2e7d32;">OK</span>` : `<span style="color:#c62828;">Not Met</span>`}</div>`;
    }).join("");

    return `
      <div style="padding:6px 10px;margin:6px 10px;background:#fff3e0;border:1px solid #ffb300;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:4px;">Catching Prerequisites</div>
        <div>Current Agility: <strong>${ability.rank}</strong></div>
        ${rows}
      </div>
    `;
  }

    _actionsBox({ actionType, colorLower }) {
    const labels = {
      dodging:  "Dodging effect applied to token",
      evading:  colorLower === "white" ? "Evasion failed \u2014 Auto-Hit" : "Evading + Evasion Bonus effects applied to token",
      blocking: "Blocking effect applied to token",
      catching: "Catching result noted"
    };
    const label = labels[actionType] || "Effect applied to token";
    return `
      <div style="padding:4px 8px;margin:0 10px 6px;background:#e8f5e9;border:1px solid #4CAF50;border-radius:3px;font-size:.8em;font-weight:700;color:#2e7d32;text-align:center;">
        \u2713 ${label}
      </div>
    `;
  }

  async _setTempFlag(kind, data) {
    try {
      const current = await this.actor.getFlag("msh-faserip", "defenseTemp") || {};
      current[kind] = data;
      await this.actor.setFlag("msh-faserip", "defenseTemp", current);
    } catch (e) {
      console.warn("DefenseAction: could not set temp flag", e);
    }
  }
}