// scripts/modules/actions/defense-action.js v1.3.7 - 2026-02-07
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
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  effectsFor,
  labelFor,
  rollWithKarmaAndHistory,
  buildResultGrid,
  bannerColors,
  buildInlineRollDisplay,
  showDiceAnimation
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

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

    // Per-action extra inputs
    const extra = this._buildExtraInputs(actionType);

    // ------- Dialog -------
    const dialogHtml = `
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Action:</label><strong>${actionName}</strong></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Ability:</label>
        <input type="text" value="${ability.name}" style="width:160px;" readonly></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Rank:</label>
        <input type="text" value="${ability.rank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${ability.value})</span></div>

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Column Shift:</label>
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span></div>

      ${generateKarmaControlsHTML(actor, 0)}

      ${extra.html}

      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice" ${this.opts.skipDice ? "checked" : ""}> Skip dice animation</label>
      </div>

      ${this._actionNotes(actionType)}
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => resolve(this._readDialog(actionType, html))
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          setupKarmaControlHandlers(html);
          extra.onRender?.(html);
        }
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

    // Build inline roll display for consolidated mode
    const inlineRollHtml = useConsolidated ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal) : "";

    // Result & effect text
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    // Build grid & banner
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // Compute special outcome blocks per action
    const specialHtml = await this._specialOutcomeHtml({ actionType, ability, colorLower, choice });

    // CREATE THE EFFECT AUTOMATICALLY (NEW!)
    await this._createDefenseEffect({ actionType, ability, colorLower, choice });

    // Action chips (light placeholders)
    const actionsHtml = this._actionsBox({ actionType, colorLower });

    // Build roll info section - use inline display if consolidated, else plain text
    const rollInfoSection = inlineRollHtml ? `
      <div style="padding:5px 10px;font-size:.9em;">
        <div>Ability: ${ability.name}</div>
        <div>Base Rank: ${ability.rank} (${ability.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
        ${this._contextLine(actionType, choice)}
      </div>
      ${inlineRollHtml}
    ` : `
      <div style="padding:5px 10px;font-size:.9em;">
        <div>Ability: ${ability.name}</div>
        <div>Base Rank: ${ability.rank} (${ability.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
        ${this._contextLine(actionType, choice)}
        <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
      </div>
    `;

    // Final card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#0d47a1;">
          <strong>${actor.name} - ${actionName}</strong>
        </div>
        ${rollInfoSection}
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${specialHtml}
        ${actionsHtml}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }

  // ------- Per-action UI bits -------

  _buildExtraInputs(actionType) {
    if (actionType === "evading") {
      return {
        html: `
          <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
            <div style="font-weight:bold;margin-bottom:6px;">Evade Settings</div>
            <div style="margin-bottom:6px;">
              <label style="display:inline-block;width:160px;">Opponent (name or note):</label>
              <input type="text" name="evadeTarget" style="width:220px;" placeholder="Who you’re evading">
            </div>
          </div>
        `
      };
    }
    if (actionType === "catching") {
      return {
        html: `
          <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
            <div style="font-weight:bold;margin-bottom:6px;">Catching Settings</div>
            <div style="margin-bottom:6px;">
              <label style="display:inline-block;width:160px;">Scenario:</label>
              <select name="catchScenario" style="width:220px;">
                <option value="falling">Falling object / ally</option>
                <option value="shooting-bullet">Shooting: bullet (needs Unearthly Agility)</option>
                <option value="shooting-arrow">Shooting: arrow (needs Amazing Agility)</option>
                <option value="throwing-other">Thrown projectile (needs Remarkable Agility)</option>
              </select>
            </div>
            <div style="margin-bottom:6px;">
              <label><input type="checkbox" name="catchVsYou"> Object/attack is directed at you (–3CS to catch)</label>
            </div>
          </div>
        `
      };
    }
    // dodging / blocking: no extras needed
    return { html: "" };
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

  _actionNotes(actionType) {
    if (actionType === "dodging") {
      return `
        <div style="margin-top:10px;color:#555;font-size:.85em;">
          <div>• Dodging is Agility. Reduces <em>attacker’s</em> CS on attacks you’re aware of this phase.</div>
          <div>• While Dodging: half move; no Charge; only one other action; your FEATs this turn are at <strong>-2CS</strong>.</div>
          <div>• Typically used vs ranged/charging; no effect vs adjacent Slugfest/Wrestling.</div>
        </div>`;
    }
    if (actionType === "evading") {
      return `
        <div style="margin-top:10px;color:#555;font-size:.85em;">
          <div>• Evading is Fighting vs a single adjacent attacker. You make no attack this round.</div>
          <div>• Results: Auto-Hit; Evasion; Evasion +1CS; Evasion +2CS (next round attack bonus vs that attacker).</div>
        </div>`;
    }
    if (actionType === "blocking") {
      return `
        <div style="margin-top:10px;color:#555;font-size:.85em;">
          <div>• Blocking uses Strength as temporary Body Armor vs physical (Grappling, Slugfest, Edged/Blunt Throwing, Force, Wrestling). No effect vs Shooting/Energy; not Charging.</div>
          <div>• You take no other action; can shield allies behind you. Normal Armor stacks (not Force Fields).</div>
        </div>`;
    }
    if (actionType === "catching") {
      return `
        <div style="margin-top:10px;color:#555;font-size:.85em;">
          <div>• Catching is Agility vs one item. Results: Auto-hit; Miss (+1CS to attacker if it was an attack); Damage (you might harm what you caught); Catch (clean).</div>
          <div>• –3CS to catch items specifically directed at you.</div>
          <div>• Min Agility: Unearthly (bullets), Amazing (arrows), Remarkable (other thrown). Any Agility for falling.</div>
        </div>`;
    }
    return "";
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
      return `<div>Catching: ${map[choice.catchScenario] || "Object"}${choice.catchVsYou ? " — vs you (–3CS)" : ""}</div>`;
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
          <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #4CAF50;border-radius:3px;text-align:center;">
            <strong>Body Armor Granted: ${armorRank} (${armorValue})</strong>
            <div style="font-size:.85em;color:#2e7d32;">Applies vs physical (not Shooting/Energy; not Charging). Use manually for next incoming attack.</div>
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
        <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #1976d2;border-radius:3px;">
          <div><strong>Dodging Effect:</strong> Attacker suffers ${penalty ? `${penalty} CS` : "no"} penalty on attacks you’re aware of this phase.</div>
          <div style="font-size:.85em;color:#0d47a1;">Your own FEATs this turn: -2CS. Half move; no Charge; only one other action.</div>
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
        <div style="padding:6px 10px;margin:6px 10px;background:#fffde7;border:1px solid #fbc02d;border-radius:3px;">
          <div><strong>Evasion Result:</strong> ${note}</div>
          ${nextRoundBonus ? `<div style="font-size:.85em;color:#f57f17;">Remember: next round, first attack vs ${choice.evadeTarget || "that attacker"}: +${nextRoundBonus}CS.</div>` : ""}
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
        <div style="padding:6px 10px;margin:6px 10px;background:#f1f8e9;border:1px solid #7cb342;border-radius:3px;">
          <div><strong>Catching Result:</strong> ${hint}</div>
          ${choice.catchVsYou ? `<div style="font-size:.85em;color:#558b2f;">This catch was vs you: apply an additional -3CS to the catching attempt.</div>` : ""}
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
            rounds: 1,
            startRound: game.combat?.round || 0,
            startTurn: game.combat?.turn || 0
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
      
      // Build changes array: apply defense shift to both melee and ranged keys
      // Per rules, dodge works vs ranged & charging but NOT slugfest/wrestling;
      // GM should override for adjacent slugfest/wrestling attacks
      const changes = [];
      if (defenseBonus > 0) {
        changes.push(
          { key: "system.combatMods.defenseShift", mode: 2, value: String(defenseBonus), priority: 20 },
          { key: "system.combatMods.defenseShiftRanged", mode: 2, value: String(defenseBonus), priority: 20 }
        );
      }

      const effectData = {
        name: `Dodging (${penaltyText})`,
        icon: "icons/svg/windmill.svg",
        origin: this.actor.uuid,
        disabled: false,
        duration: {
          rounds: 1,
          startRound: game.combat?.round || 0,
          startTurn: game.combat?.turn || 0
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
          rounds: 1,
          startRound: game.combat?.round || 0,
          startTurn: game.combat?.turn || 0
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
            rounds: 2,  // Fallback duration; real expiry controlled by expiresAtRound flag
            startRound: currentRound,
            startTurn: game.combat?.turn || 0
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
    const chip = (label, title, enabled) => {
      const base = "display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;";
      const style = enabled
        ? `${base}background:#fff;color:#333;cursor:pointer;`
        : `${base}background:#f7f7f7;color:#333;cursor:not-allowed;opacity:.55;filter:grayscale(.3);`;
      const key = label.toLowerCase().replace(/\s+/g,'-');
      return `<a class="faserip-chip" data-action="${key}" ${enabled? "" : 'aria-disabled="true"'} title="${title}" style="${style}">${label}</a>`;
    };
    
    // Enable “Use Armor” only when blocking result wasn’t White
    const useArmor = (actionType === "blocking" && colorLower !== "white");

    return `
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
        <div style="font-size:0.85em;color:#2e7d32;font-weight:bold;width:100%;text-align:center;margin-bottom:4px;">
          ✓ Effect Applied to Token
        </div>
        ${chip("Reapply Effect","Manually reapply this defense effect if needed", true)}
        ${useArmor ? chip("Use Armor","Apply temporary Body Armor vs next attack", true) : ""}
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