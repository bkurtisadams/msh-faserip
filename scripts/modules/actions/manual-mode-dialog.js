// scripts/modules/actions/manual-mode-dialog.js
import { ACTION_RESULT_LABELS } from "../dice/universal-table.js";
import { shiftRank, getAbilityInfo, labelFor, bannerColors, buildResultGrid, rollWithKarma, debugLog } from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

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
        // FIX: Use siblings() instead of next() to handle whitespace text nodes
        const $content = $btn.siblings(".manual-action-content").first();
        const expanded = $content.is(":visible");
        const $icon = $btn.find(".toggle-icon");

        // stop(true,true) kills queued animations so rapid clicks don't stack
        $content.stop(true, true).slideToggle(120);
        $btn.attr("aria-expanded", String(!expanded));
        
        // Toggle icon between chevron-down and chevron-up
        if (!expanded) {
          $icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
        } else {
          $icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
        }
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
    //const actionCode = actionCodeMap[actionType] || "BA" || "EA" || "Sh" || "TE" || "TB" || "En" || "Fo" || "Gp" || "Gb" || "Es" || "Ch" || "Do" || "Ev" || "Bl" || "Ca";
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
          <div class="manual-action-toggle" style="cursor:pointer;font-weight:600;font-size:0.9em;color:#555;user-select:none;display:flex;align-items:center;gap:6px;">
            <i class="fas fa-chevron-down toggle-icon" style="font-size:0.8em;"></i>
            <span>Action Rules</span>
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
      "blunt-attack": `
        <strong>Blunt Attack (Fighting):</strong>
        <ul>
          <li><em>Results:</em> Miss, Hit, <u>Slam</u>, <u>Stun</u>.</li>
          <li><em>Damage:</em> Attacker’s <b>Strength rank number</b>. Bare hands/gauntlets use STR.</li>
          <li><em>Blunt weapons:</em> Up to the item’s <b>Material Strength</b>. If item MS &gt; user STR, damage becomes the <b>minimum of the next rank</b> (e.g., Feeble→Typical min).</li>
          <li><em>Options:</em> May voluntarily <b>pull punches</b>—reduce damage or even lower the color (e.g., Red→Yellow).</li>
          <li><em>Slam:</em> Deal STR damage; target makes Endurance FEAT for Slam effects.</li>
          <li><em>Stun:</em> Deal STR damage; target makes Endurance FEAT for Stun effects.</li>
        </ul>
      `,

      "edged-attack": `
        <strong>Edged Attack (Fighting):</strong>
        <ul>
          <li><em>Results:</em> Hit, <u>Stun</u>, <u>Kill</u>.</li>
          <li><em>Damage:</em> At least the weapon’s listed damage; may instead use <b>min(STR, weapon MS)</b>.</li>
          <li><em>Options:</em> May <b>not</b> reduce <em>effect</em> color (no Red→Yellow swap). Damage can’t be softened below weapon minimum.</li>
          <li><em>Stun:</em> Deal damage; target makes Endurance FEAT for Stun.</li>
          <li><em>Kill:</em> Deal damage; target checks Kill column (see Kill rules).</li>
        </ul>
      `,

      "shooting": `
        <strong>Shooting Attack (Agility):</strong>
        <ul>
          <li><em>Results:</em> Miss, Hit, <u>Bullseye</u>, <u>Kill</u>.</li>
          <li><em>Damage:</em> As weapon lists (some cause effects like Mercy Bullets instead of damage).</li>
          <li><em>Bullseye:</em> Precision hit (e.g., disarm); Judge adjudicates special part hits; should not be fatal.</li>
          <li><em>Miss:</em> Projectile may continue; Judge may roll to hit something else along the path.</li>
          <li><em>Options:</em> May <b>not</b> reduce damage or effect color.</li>
          <li><em>Range:</em> -1CS to hit per area traveled for weapons.</li>
        </ul>
      `,

      "edged-throwing": `
        <strong>Edged Throwing (Agility):</strong>
        <ul>
          <li><em>Results:</em> Miss, Hit, <u>Stun</u>, <u>Kill</u>.</li>
          <li><em>Damage:</em> As the thrown edged weapon lists.</li>
          <li><em>Options:</em> <b>May not</b> reduce <em>effect</em> color; may choose to deal <b>less damage</b>.</li>
          <li><em>Miss:</em> As Shooting—may strike something else along the path.</li>
          <li><em>Stun/Kill:</em> Deal damage; then resolve the appropriate Endurance FEAT (Stun or Kill).</li>
        </ul>
      `,

      "blunt-throwing": `
        <strong>Blunt Throwing (Agility):</strong>
        <ul>
          <li><em>Results:</em> Miss, Hit, <u>Bullseye</u>, <u>Stun</u>.</li>
          <li><em>Damage:</em> <b>min(Thrower STR, Item MS)</b>.</li>
          <li><em>Options:</em> May reduce <b>effect</b> color and/or <b>damage</b>.</li>
          <li><em>Bullseye:</em> Precision placement (Judge adjudicates).</li>
          <li><em>Stun:</em> Deal damage; target makes Endurance FEAT for Stun.</li>
        </ul>
      `,

      "energy": `
        <strong>Energy Attack (Agility):</strong>
        <ul>
          <li><em>Results:</em> Miss, Hit, <u>Bullseye</u>, <u>Kill</u>.</li>
          <li><em>Damage:</em> Capped at the power/weapon’s <b>maximum</b>.</li>
          <li><em>Options:</em> May reduce <b>damage</b>, but <b>not effect</b> color.</li>
          <li><em>Bullseye:</em> Target a specific part as per Judge.</li>
          <li><em>Range:</em> Powers can exceed normal range at <b>-1CS per extra area</b> (can’t go below Shift 0).</li>
        </ul>
      `,

      "force": `
        <strong>Force (Concussive) Attack (Agility):</strong>
        <ul>
          <li><em>Results:</em> Miss, Hit, <u>Bullseye</u>, <u>Stun</u>.</li>
          <li><em>Damage:</em> Based on power/weapon description.</li>
          <li><em>Options:</em> May choose <b>less damage</b>; may <b>not</b> reduce effect color.</li>
          <li><em>Stun:</em> Deal damage; target makes Endurance FEAT for Stun.</li>
        </ul>
      `,

      "grappling": `
        <strong>Grappling (Strength):</strong>
        <ul>
          <li><em>Results:</em> Miss, <u>Partial Hold</u>, <u>Hold</u>.</li>
          <li><em>Partial Hold:</em> You seize a limb/part; target suffers <b>-2CS</b> to actions and <b>cannot move</b> if your STR ≥ target’s STR. No damage.</li>
          <li><em>Hold:</em> Target fully restrained; you may perform <b>one additional action</b> and deal up to <b>STR damage</b> (Body Armor applies).</li>
        </ul>
      `,

      "grabbing": `
        <strong>Grabbing (Strength):</strong>
        <ul>
          <li><em>Results:</em> Miss, <u>Take</u>, <u>Grab</u>, <u>Break</u>. Generally no damage.</li>
          <li><em>Take:</em> You get the item if your STR ≥ target STR (or item MS); otherwise counts as Miss.</li>
          <li><em>Grab:</em> You get the item regardless of target’s STR.</li>
          <li><em>Break:</em> You succeed; then roll vs item <b>Material Strength</b>:
            <ul>
              <li><em>Color (G/Y/R):</em> You may use the item or move up to <b>half speed</b> with it.</li>
              <li><em>White:</em> Item breaks/misfires/goes off (Judge adjudicates).</li>
            </ul>
          </li>
        </ul>
      `,

      "escaping": `
        <strong>Escaping (Strength):</strong>
        <ul>
          <li><em>Results:</em> Miss (still held), <u>Escape</u>, <u>Reverse</u>.</li>
          <li><em>Escape:</em> Free from hold; may move up to <b>half speed</b> (no other actions).</li>
          <li><em>Reverse:</em> Free and may <b>move half</b>, attempt to <b>Grapple</b> former attacker, or take another action at <b>-2CS</b>.</li>
        </ul>
      `,

      "charging": `
        <strong>Charging (Endurance):</strong>
        <ul>
          <li><em>Move:</em> Must move ≥1 area; may move full speed and still attack.</li>
          <li><em>To Hit:</em> <b>+1CS per area moved</b> (max +3CS). Resolve on Charging column.</li>
          <li><em>Results:</em> Miss (continue straight <b>½ speed</b>), Hit, <u>Slam</u>, <u>Stun</u>.</li>
          <li><em>Damage (Hit):</em> Up to <b>max(Endurance, Body Armor)</b> + <b>2</b> per area moved.</li>
          <li><em>Rebound:</em> If defender’s Body Armor &gt; your inflicted damage, the <b>excess rebounds</b> onto you (your BA can absorb).</li>
          <li><em>Objects:</em> Walls count as Body Armor equal to Material Strength for collisions.</li>
        </ul>
      `,

      "dodging": `
        <strong>Dodging (Agility):</strong>
        <ul>
          <li><em>When:</em> Declare at start of round; you may move <b>½ speed</b>, no charge, and take at most <b>one</b> other action.</li>
          <li><em>Effect:</em> Roll Agility; apply <b>-2/-4/-6CS</b> to attacks you’re aware of (this round).</li>
          <li><em>Limits:</em> No effect vs Slugfest/Wrestling; can’t dodge surprise/blindsides.</li>
          <li><em>Cost:</em> Your own FEATs this round suffer <b>-2CS</b>.</li>
        </ul>
      `,

      "evading": `
        <strong>Evading (Fighting):</strong>
        <ul>
          <li><em>Use:</em> Against a single <b>adjacent</b> attacker (Slugfest/Wrestling).</li>
          <li><em>Action:</em> You make no attacks this round; roll on Evasion column.</li>
          <li><em>Results:</em> <b>Auto-Hit</b> (their attack is at least Green), <b>Evasion</b> (no damage), <b>Evasion +1CS/+2CS</b> (you avoid and gain +1/+2CS to your first attack vs that foe next round).</li>
        </ul>
      `,

      "blocking": `
        <strong>Blocking (Strength):</strong>
        <ul>
          <li><em>Use:</em> Mitigate <b>physical</b> attacks (Slugfest, Grapple damage, Edged/Blunt Throwing, Force, Wrestling). Not vs <b>Energy</b> or <b>Shooting</b>.</li>
          <li><em>Action:</em> No other action; you may shield allies behind you. Normal Body Armor still applies (Force Fields don’t add to Block).</li>
          <li><em>Effect:</em> Roll Strength; treat a result of <b>-6/-4/-2/+1CS</b> as the <b>effective Body Armor</b> derived from your STR versus that single attack.</li>
        </ul>
      `,

      "catching": `
        <strong>Catching (Agility):</strong>
        <ul>
          <li><em>Targets:</em> One falling/thrown object (or ally) at a time.</li>
          <li><em>Results:</em> <b>Auto-Hit</b> (it hits you), <b>Miss</b> (attack continues at +1CS vs you), <b>Damage</b> (you catch but may damage it), <b>Catch</b> (clean catch).</li>
          <li><em>Vs aimed attacks:</em> You suffer <b>-3CS</b> to Catch.</li>
          <li><em>Agility mins:</em> <b>Unearthly</b> to catch bullets; <b>Amazing</b> for arrows; <b>Remarkable</b> for other projectiles; any Agility for falling bodies/objects.</li>
        </ul>
      `
    };
    
    return descriptions[actionType] || "Combat action using appropriate ability vs Universal Table.";
  }
}