// scripts/modules/actions/manual-mode-dialog.js
import { ACTION_RESULT_LABELS } from "../dice/universal-table.js";
import { shiftRank, getAbilityInfo, labelFor, bannerColors, buildResultGrid, rollWithKarma, debugLog } from "./action-utils.js";

export class ManualModeDialog {

  // manual-mode-dialog.js (inside the class)
  static setupChatListeners() {
    // Idempotent guard
    game.msh ??= {};
    if (game.msh.manualToggleInstalled) return;
    game.msh.manualToggleInstalled = true;

    // Remove any stale copies (hot-reload safe), then add one handler
    $(document)
      .off("click.mshManualToggle")
      .on("click.mshManualToggle", ".manual-action-toggle", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        const $btn = $(ev.currentTarget);
        const $content = $btn.next(".manual-action-content");
        const expanded = $content.is(":visible");

        // stop(true,true) kills queued animations so rapid clicks don't stack
        $content.stop(true, true).slideToggle(120);
        $btn.attr("aria-expanded", String(!expanded));
      });
  }

  /**
   * Show a simple manual mode dialog for any action type
   * @param {Actor} actor - The actor performing the action
   * @param {string} abilityName - The ability being used (e.g., "fighting", "agility")
   * @param {string} actionType - The action type (e.g., "blunt-attack", "shooting")
   * @param {Object} opts - Additional options
   */
  static async show(actor, abilityName, actionType, opts = {}) {
    debugLog("ManualModeDialog.show()", { actor: actor.name, abilityName, actionType });

    const ability = getAbilityInfo(actor, abilityName);
    const actionName = labelFor(actionType);

    // Load saved preferences
    const savedCS = await actor.getFlag("msh-faserip", `manual.${actionType}.cs`) || 0;
    const savedKarma = await actor.getFlag("msh-faserip", `manual.${actionType}.karma`) || 0;

    const dialogHtml = `
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Action:</label>
        <strong>${actionName}</strong>
      </div>
      
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Ability:</label>
        <input type="text" value="${ability.name}" style="width:140px;" readonly>
      </div>
      
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Rank:</label>
        <input type="text" value="${ability.rank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${ability.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Column Shifts:</label>
        <input type="number" name="cs" value="${savedCS}" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Karma Points:</label>
        <input type="number" name="karma" value="${savedKarma}" min="0" style="width:60px;">
      </div>

      <div style="margin-top:8px;">
        <label><input type="checkbox" name="remember" checked> Remember these settings</label>
      </div>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll FEAT",
            callback: async (html) => {
              const $ = (sel) => html.find(sel);
              const cs = Number($('[name="cs"]').val() || 0);
              const karma = Number($('[name="karma"]').val() || 0);
              const remember = !!$('[name="remember"]').is(':checked');

              // Save preferences if remember is checked
              if (remember) {
                await actor.setFlag("msh-faserip", `manual.${actionType}.cs`, cs);
                await actor.setFlag("msh-faserip", `manual.${actionType}.karma`, karma);
              }

              // Apply column shifts to rank
              const shiftedRank = shiftRank(ability.rank, cs);

              // Roll d100 and apply karma using action-utils
              const rollResult = await rollWithKarma(actor, actionName, karma);

              console.log("rollResult:", rollResult);
              console.log("rollResult.cappedTotal:", rollResult.cappedTotal);
              console.log("shiftedRank:", shiftedRank);

              // Use existing rollUniversalTable function
              const color = game.msh.rollUniversalTable(shiftedRank, rollResult.cappedTotal);

              // Post result to chat
              await this._postResultToChat({
                actor,
                actionName,
                actionType,
                ability,
                originalRank: ability.rank,
                shiftedRank,
                cs,
                karma,
                rollResult,
                color
              });
              
              resolve({ color, roll: rollResult.cappedTotal });
            }
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "roll"
      }).render(true);
    });
  }

  /**
   * Post the manual mode result to chat (matching existing chat card style)
   */
  static async _postResultToChat({ 
    actor, 
    actionName, 
    actionType,
    ability, 
    originalRank, 
    shiftedRank, 
    cs, 
    karma, 
    rollResult, 
    color 
  }) {
    const colorLower = color.toLowerCase();
    const { bg, fg } = bannerColors(colorLower);

    // Map action type to code for effect label
    const actionCodeMap = {
      "blunt-attack": "BA",
      "edged-attack": "EA",
      "shooting": "Sh",
      "throwing-edged": "TE",
      "throwing-blunt": "TB",
      "energy": "En",
      "force": "Fo",
      "grappling": "Gp",
      "grabbing": "Gb",
      "escaping": "Es",
      "charging": "Ch",
      "dodging": "Do",
      "evading": "Ev",
      "blocking": "Bl",
      "catching": "Ca",
      "stun": "St",
      "slam": "Sl",
      "kill": "Ki"
    };
    
    const actionCode = actionCodeMap[actionType] || "BA";
    const effectResult = ACTION_RESULT_LABELS[actionCode]?.[colorLower] || colorLower;

    // Build result grid
    const grid = buildResultGrid(actionCode, colorLower, ACTION_RESULT_LABELS[actionCode]);

    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - ${actionName}</strong>
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div>Ability: ${ability.name}</div>
          <div>Base Rank: ${ability.rank} (${ability.value})</div>
          ${cs !== 0 ? `<div>Effective Rank: ${shiftedRank} (${cs > 0 ? '+' : ''}${cs}CS)</div>` : ""}
          <div>Roll: ${rollResult.roll.total}${karma ? ` + Karma: ${karma}` : ""} = ${rollResult.cappedTotal}</div>
        </div>
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${colorLower.toUpperCase()} — ${effectResult.toUpperCase()}
        </div>

        <div style="padding:6px 10px;background:#f9f9f9;border-top:1px solid #e0e0e0;">
          <div class="manual-action-toggle" style="cursor:pointer;font-weight:600;font-size:0.9em;color:#555;user-select:none;">
            📖 Action Rules (click to expand)
          </div>
          <div class="manual-action-content" style="display:none;margin-top:6px;font-size:0.85em;line-height:1.4;color:#444;">
            ${this._getActionDescription(actionType)}
          </div>
        </div>

        <div style="padding:8px 10px;font-size:.85em;color:#666;background:#fffbf0;border-top:1px solid #e0e0e0;">
          <div style="margin-bottom:4px;"><strong>⚙ Manual Mode:</strong> Review the result grid above for all possible outcomes.</div>
          <div style="font-size:0.8em;line-height:1.3;">
            ${this._getCombatReminders(actionType, colorLower)}
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  }

  /**
   * Get combat effect reminders based on action type and result
   */
  static _getCombatReminders(actionType, colorLower) {
    const reminders = [];
    
    // Actions that can cause Slam
    const slamActions = ["blunt-attack", "charging"];
    // Actions that can cause Stun  
    const stunActions = ["blunt-attack", "throwing-blunt", "throwing-edged", "force", "charging"];
    // Actions that can cause Kill
    const killActions = ["edged-attack", "shooting", "energy"];
    
    if (colorLower === "yellow" && slamActions.includes(actionType)) {
      reminders.push("• <strong>Slam:</strong> Target rolls Endurance FEAT vs Slam column (may knock back/down)");
    }
    
    if (colorLower === "yellow" && stunActions.includes(actionType)) {
      reminders.push("• <strong>Stun:</strong> Target rolls Endurance FEAT vs Stun column (may knock out 1-10 rounds)");
    }
    
    if (colorLower === "red" && slamActions.includes(actionType)) {
      reminders.push("• <strong>Slam:</strong> Target rolls Endurance FEAT vs Slam column (may knock back/down)");
    }
    
    if (colorLower === "red" && stunActions.includes(actionType)) {
      reminders.push("• <strong>Stun:</strong> Target rolls Endurance FEAT vs Stun column (may knock out 1-10 rounds)");
    }
    
    if (colorLower === "red" && killActions.includes(actionType)) {
      reminders.push("• <strong>Kill Result:</strong> Target rolls Endurance FEAT vs Kill column (may cause Endurance loss)");
    }
    
    // Grappling/Grabbing/Escaping special notes
    if (actionType === "grappling" && colorLower === "yellow") {
      reminders.push("• <strong>Partial Grab:</strong> Target is partially held, -2CS to actions");
    }
    if (actionType === "grappling" && colorLower === "red") {
      reminders.push("• <strong>Hold:</strong> Target is fully grappled, can only attempt to escape");
    }
    if (actionType === "escaping" && colorLower === "red") {
      reminders.push("• <strong>Break & Reverse:</strong> You escape and may immediately grab your opponent");
    }
    
    // Damage reminders for hits
    if (colorLower !== "white") {
      reminders.push("• Apply damage to target's Health, check for 0 Health = death save required");
    }
    
    return reminders.length > 0 ? reminders.join("<br>") : "• Apply effects as shown in result grid above";
  }

  /**
   * Get detailed action description for the info section
   */
  static _getActionDescription(actionType) {
    const descriptions = {
      "blunt-attack": `<strong>Blunt Attack:</strong> Hand-to-hand combat with bare hands, fists, or blunt weapons. Uses Fighting ability. May score Hit, Slam, or Stun results. Damage equals Strength rank number (or weapon's material strength minimum). Hero may choose to pull punches or inflict lesser results.`,
      
      "edged-attack": `<strong>Edged Attack:</strong> Combat with claws, teeth, knives, or swords. Uses Fighting ability. May score Hit, Stun, or Kill results. Always inflicts minimum weapon damage. Damage cannot be reduced. Character inflicts damage equal to Strength or weapon material strength (whichever is less).`,
      
      "shooting": `<strong>Shooting Attack:</strong> Projectile weapons (guns, bows, etc.). Uses Agility ability. May score Miss, Hit, Bullseye, or Kill results. Effect and damage cannot be reduced. Range determined by weapon. Passing through cover suffers -2CS penalty.`,
      
      "throwing-edged": `<strong>Throwing (Edged):</strong> Throwing edged weapons like knives or axes. Uses Agility ability. May score Miss, Hit, Bullseye, or Stun results. Range based on Strength. Damage equals weapon or Strength (whichever is less).`,
      
      "throwing-blunt": `<strong>Throwing (Blunt):</strong> Throwing blunt objects. Uses Agility ability. May score Miss, Hit, Bullseye, or Stun results. Range based on Strength. Damage equals Strength rank number.`,
      
      "energy": `<strong>Energy Attack:</strong> Energy blasts, lightning, fire beams. Uses power rank or Agility. May score Miss, Hit, Bullseye, or Kill results. Energy beams inflict damage on intervening structures first, then pass through with reduced strength.`,
      
      "force": `<strong>Force Attack:</strong> Concussive energy, telekinetic blasts. Uses power rank or Agility. May score Miss, Hit, Bullseye, or Stun results. Similar to energy but more physical impact.`,
      
      "grappling": `<strong>Grappling:</strong> Wrestling holds and pins. Uses Strength ability. May score Miss, Partial Grab (Yellow = -2CS to target), or Hold (Red = target can only escape). Held targets cannot take other actions.`,
      
      "grabbing": `<strong>Grabbing:</strong> Attempt to grab and hold opponent. Uses Strength ability. Success means opponent is held. Target may attempt to escape on their turn.`,
      
      "escaping": `<strong>Escaping:</strong> Breaking free from grapple or grab. Uses Strength ability. Red result = Break & Reverse (you escape AND may immediately grab opponent).`,
      
      "charging": `<strong>Charging:</strong> Running attack for extra damage. Uses Endurance ability. Damage = Strength + speed rank. May result in Slam. Both attacker and target take damage if hit. Attacker must move at least 1 area.`,
      
      "dodging": `<strong>Dodging:</strong> Defensive move to avoid ranged attacks. Uses Agility ability. Success gives -2CS to attacker's roll or +1CS if exceptional. Character can take no other actions this round.`,
      
      "evading": `<strong>Evading:</strong> Defensive move to avoid melee attacks. Uses Fighting ability. Success gives -4CS to attacker's roll or +2CS if exceptional. Character can take no other actions this round.`,
      
      "blocking": `<strong>Blocking:</strong> Using Strength to resist physical attacks. Uses Strength as temporary Body Armor against one attack. Roll determines CS modifier to Strength for armor value (-6CS to +1CS). Cannot block energy or shooting attacks.`,
      
      "catching": `<strong>Catching:</strong> Attempting to catch thrown/falling objects. Uses Agility ability. Results: Auto-hit (object hits you), Miss (+1CS for attacker), Damage (caught but may damage it), or Catch (clean catch). -3CS if object targeted at you. Minimum Agility: Unearthly for bullets, Amazing for arrows, Remarkable for other projectiles.`
    };
    
    return descriptions[actionType] || "Combat action using appropriate ability vs Universal Table.";
  }
}