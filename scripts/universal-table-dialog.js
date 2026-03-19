// universal-table-dialog.js v1.0.0 - 2026-03-18
// Extracted from rolls.js. The popout Universal Table window with
// action column buttons (drag-to-hotbar, click-to-roll).

import { rankRows } from "./modules/dice/universal-table.js";

// ── Multi-target helpers ───────────────────────────────────

function validateAdjacentTargets(attackerToken, targetTokens) {
  if (!attackerToken || !targetTokens || targetTokens.length < 2) {
    return { valid: false, invalidTargets: targetTokens || [] };
  }

  const invalidTargets = [];
  const gridSize = canvas.scene.grid.size;

  for (const targetToken of targetTokens) {
    const pathResult = canvas.grid.measurePath([attackerToken.center, targetToken.center]);
    const distance = pathResult.distance;
    const areas = distance / gridSize;

    if (areas > 1.5) {
      invalidTargets.push(targetToken);
    }
  }

  return { valid: invalidTargets.length === 0, invalidTargets };
}

// Per FASERIP rules: Blunt Slugfest, Escaping, Energy and Force Powers
const MULTI_ADJACENT_CODES = ["BA", "Es", "En", "Fo"];
// Per FASERIP rules: Slugfest attacks and Shooting only
const MULTI_ATTACK_CODES = ["BA", "EA", "Sh"];

function isValidMultiTargetAttack(actionCode) {
  return MULTI_ADJACENT_CODES.includes(actionCode);
}

function isValidMultipleAttack(actionCode) {
  return MULTI_ATTACK_CODES.includes(actionCode);
}

function generateMultiTargetOptionsHTML(actionCode) {
  const targetCount = game.user.targets.size;
  const validMultiTarget = isValidMultiTargetAttack(actionCode);
  const validMultiAttack = isValidMultipleAttack(actionCode);

  if (!validMultiTarget && !validMultiAttack) return "";

  let html = `
    <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border: 1px solid #b8d4da; border-radius: 3px;">
      <div style="font-weight: bold; margin-bottom: 5px; color: #2c5aa0;">Multiple Target Options:</div>`;

  if (validMultiTarget) {
    html += `
      <div style="margin-bottom: 5px;">
        <label>
          <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right: 5px;">
          Multiple Adjacent Targets (-4CS, single roll affects all)
        </label>
        <div style="font-size: 0.8em; color: #666; margin-left: 20px;">
          Targets selected: ${targetCount} | All must be adjacent to attacker
        </div>
        <div style="font-size: 0.8em; color: #888; margin-left: 20px;">
          Valid for: Blunt Attack, Escaping, Energy, Force
        </div>
      </div>`;
  }

  if (validMultiAttack) {
    html += `
      <div style="margin-bottom: 5px;">
        <label>
          <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right: 5px;">
          Multiple Attacks (requires Fighting FEAT)
        </label>
        <div id="multi-attacks-options" style="margin-left: 20px; display: none;">
          <label style="display: block; margin: 3px 0;">
            <input type="radio" name="attackCount" value="2" checked style="margin-right: 5px;">
            2 Attacks (Remarkable FEAT, -1CS each)
          </label>
          <label style="display: block; margin: 3px 0;">
            <input type="radio" name="attackCount" value="3" style="margin-right: 5px;">
            3 Attacks (Amazing FEAT, -1CS each)
          </label>
        </div>
        <div style="font-size: 0.8em; color: #888; margin-left: 20px;">
          Valid for: Slugfest (Blunt, Edged) and Shooting attacks only
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}

function addMultiTargetEventHandlers(html) {
  const multiAdjacentCheckbox = html.find('#multi-adjacent');
  const multiAttacksCheckbox = html.find('#multi-attacks');
  const multiAttacksOptions = html.find('#multi-attacks-options');

  const dialogTitle = html.closest('.dialog').find('.window-title').text();
  const actionMatch = dialogTitle.match(/Roll: (\w+)/);
  const currentAction = actionMatch ? actionMatch[1] : null;

  function updateMultiOptions() {
    const validMultiTarget = isValidMultiTargetAttack(currentAction);
    const validMultiAttack = isValidMultipleAttack(currentAction);

    multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
    if (!validMultiTarget) multiAdjacentCheckbox.prop('checked', false);

    multiAttacksCheckbox.prop('disabled', !validMultiAttack);
    if (!validMultiAttack) {
      multiAttacksCheckbox.prop('checked', false);
      multiAttacksOptions.hide();
    }
  }

  multiAdjacentCheckbox.on('change', function () {
    if (this.checked) {
      multiAttacksCheckbox.prop('disabled', true).prop('checked', false);
      multiAttacksOptions.hide();
    } else {
      multiAttacksCheckbox.prop('disabled', !isValidMultipleAttack(currentAction));
    }
  });

  multiAttacksCheckbox.on('change', function () {
    if (this.checked) {
      multiAdjacentCheckbox.prop('disabled', true).prop('checked', false);
      multiAttacksOptions.show();
    } else {
      multiAttacksOptions.hide();
      multiAdjacentCheckbox.prop('disabled', !isValidMultiTargetAttack(currentAction));
    }
  });

  updateMultiOptions();
}

// ── Main dialog ────────────────────────────────────────────

export async function openUniversalTableDialog(actor) {
  const actionTypes = [
    { labelTop: "Blunt", labelMid: "Attack", code: "BA", ability: "Fighting", white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
    { labelTop: "Edged", labelMid: "Attack", code: "EA", ability: "Fighting", white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    { labelTop: "Shooting", labelMid: "Attack", code: "Sh", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    { labelTop: "Throwing", labelMid: "Edged", code: "TE", ability: "Agility", white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    { labelTop: "Throwing", labelMid: "Blunt", code: "TB", ability: "Agility", white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
    { labelTop: "Energy", labelMid: "Attack", code: "En", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    { labelTop: "Force", labelMid: "Attack", code: "Fo", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
    { labelTop: "Grappling", labelMid: "Attack", code: "Gp", ability: "Strength", white: "Miss", green: "Hit", yellow: "Partial", red: "Hold" },
    { labelTop: "Grabbing", labelMid: "Attack", code: "Gb", ability: "Strength", white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
    { labelTop: "Escaping", labelMid: "Hold", code: "Es", ability: "Strength", white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
    { labelTop: "Charging", labelMid: "Attack", code: "Ch", ability: "Endurance", white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
    { labelTop: "Dodging", labelMid: "Defense", code: "Do", ability: "Agility", white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
    { labelTop: "Evading", labelMid: "Defense", code: "Ev", ability: "Fighting", white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
    { labelTop: "Blocking", labelMid: "Defense", code: "Bl", ability: "Strength", white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
    { labelTop: "Catching", labelMid: "Objects", code: "Ca", ability: "Agility", white: "Auto-hit", green: "Miss", yellow: "Damage", red: "Catch" },
    { labelTop: "Stun", labelMid: "Check", code: "St", ability: "Endurance", white: "1–10", green: "1", yellow: "Damage", red: "No" },
    { labelTop: "Slam", labelMid: "Check", code: "Sl", ability: "Endurance", white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
    { labelTop: "Kill", labelMid: "Check", code: "Ki", ability: "Endurance", white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
  ];

  const actorItems = actor.items.contents;
  const powers = game.msh.getActorPowers(actor);
  const talents = actorItems.filter(i => i.type === "talent");
  const equipment = actorItems.filter(i => i.type === "equipment");

  const savedAction = actor.getFlag("msh-faserip", "universalRollAction") || "";
  const savedSource = actor.getFlag("msh-faserip", "universalRollSource") || "";
  const savedCS = actor.getFlag("msh-faserip", "universalRollCS") || 0;
  const savedKarma = actor.getFlag("msh-faserip", "universalRollKarma") || 0;

  const dialogContent = `
    <form>
      <div class="form-group">
        <label>Action Type</label>
        <select name="action">
          ${actionTypes.map(type => `
            <option value="${type.code}" ${type.code === savedAction ? "selected" : ""}>
              ${type.labelTop} ${type.labelMid} (${type.code})
            </option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Source</label>
        <select name="source">
          <option value="">(Select Power, Talent, or Equipment)</option>
          <optgroup label="Powers">
            ${powers.map(p => `<option value="power:${p.id}" ${`power:${p.id}` === savedSource ? "selected" : ""}>${p.name} (${p.system?.rank || 'Typical'})</option>`).join('')}
          </optgroup>
          <optgroup label="Talents">
            ${talents.map(t => `<option value="talent:${t.id}" ${`talent:${t.id}` === savedSource ? "selected" : ""}>${t.name}</option>`).join('')}
          </optgroup>
          <optgroup label="Equipment">
            ${equipment.map(e => `<option value="equipment:${e.id}" ${`equipment:${e.id}` === savedSource ? "selected" : ""}>${e.name}</option>`).join('')}
          </optgroup>
        </select>
      </div>
      <div class="form-group">
        <label>Generic Column Shift Modifier</label>
        <input type="number" name="cs" value="${savedCS}">
      </div>
      <div class="form-group">
        <label>Karma to Spend</label>
        <input type="number" name="karma" value="${savedKarma}">
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" name="save" checked />
          Remember these settings
        </label>
      </div>
    </form>
  `;

  const html = await renderTemplate("systems/msh-faserip/templates/universal-table.html", {
    actionTypes,
    rankRows
  });

  const dlg = new Dialog({
    title: "Universal Table",
    content: html,
    buttons: {},
    render: html => {
      const app = html.closest(".app.dialog");
      if (app.length) {
        app.css({ width: "1100px", resize: "both", overflow: "auto" });
        const left = Math.max((window.innerWidth - 1100) / 2, 50);
        app[0].style.left = `${left}px`;
      }
    }
  });
  dlg.render(true);

  Hooks.once("renderDialog", (_app, html) => {

    html.find("#toggleRankTable").on("click", () => {
      html.find("#rankTableContainer").toggle();
    });

    html.find("#fontSizeSlider").on("input", (event) => {
      const size = event.target.value + "px";
      html.find(".stack").css("font-size", size);
    });

    html.find(".action-button").each((_, el) => {
      el.addEventListener("dragstart", async ev => {
        const action = ev.currentTarget.dataset.action;
        if (!action) { ev.preventDefault(); ui.notifications.warn("No action code found on element."); return; }

        const actor = game.user.character || canvas.tokens.controlled[0]?.actor;
        if (!actor) { ev.preventDefault(); ui.notifications.warn("Select a token or assign a character first."); return; }

        const actionNames = {
          BA: "Blunt Attack", EA: "Edged Attack", Sh: "Shooting",
          TE: "Thrown Edged", TB: "Thrown Blunt", En: "Energy Attack",
          Fo: "Force Attack", Gp: "Grapple", Gb: "Grab", Es: "Escape",
          Ch: "Charge", Ki: "Kill", St: "Stun", Sl: "Slam", Do: "Dodge",
          Ev: "Evade", Bl: "Block", Ca: "Catch"
        };

        const iconMap = {
          BA: "blunt", EA: "edged", Sh: "shooting", TE: "thrown", TB: "thrown_blunt",
          En: "energy", Fo: "force", Gp: "grapple", Gb: "grab", Es: "escape",
          Ch: "charge", Ki: "kill", St: "stun", Sl: "slam", Do: "dodge",
          Ev: "evade", Bl: "block", Ca: "catch"
        };

        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "UniversalAction",
          actionCode: action,
          actionName: actionNames[action] || action,
          actorId: actor.id,
          actorName: actor.name,
          iconName: iconMap[action] || "dice-target"
        }));

        const command = `// Universal Action Macro - same pattern as power macros
        const actor = game.user.character || canvas.tokens.controlled[0]?.actor || game.actors.get("${actor.id}");
        if (!actor) {
          return ui.notifications.warn("Select a token or assign a character first.");
        }

        const savedCS = actor.getFlag("msh-faserip", "cs_${action}") || 0;
        const savedKarma = actor.getFlag("msh-faserip", "karma_${action}") || 0;

        function generateMultiTargetOptionsHTML(actionCode) {
          const targetCount = game.user.targets.size;
          const validMultiTarget = ["BA", "Es", "En", "Fo"].includes(actionCode);
          const validMultiAttack = ["BA", "EA", "Sh"].includes(actionCode);
          
          if (!validMultiTarget && !validMultiAttack) {
            return "";
          }
          
          let html = \`
            <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border: 1px solid #b8d4da; border-radius: 3px;">
              <div style="font-weight: bold; margin-bottom: 5px; color: #2c5aa0;">Multiple Target Options:</div>
          \`;
          
          if (validMultiTarget) {
            html += \`
              <div style="margin-bottom: 5px;">
                <label>
                  <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right: 5px;">
                  Multiple Adjacent Targets (-4CS, single roll affects all)
                </label>
                <div style="font-size: 0.8em; color: #666; margin-left: 20px;">
                  Targets selected: \${targetCount} | All must be adjacent to attacker
                </div>
              </div>
            \`;
          }
          
          if (validMultiAttack) {
            html += \`
              <div style="margin-bottom: 5px;">
                <label>
                  <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right: 5px;">
                  Multiple Attacks (requires Fighting FEAT)
                </label>
                <div id="multi-attacks-options" style="margin-left: 20px; display: none;">
                  <label style="display: block; margin: 3px 0;">
                    <input type="radio" name="attackCount" value="2" checked style="margin-right: 5px;">
                    2 Attacks (Remarkable FEAT, -1CS each)
                  </label>
                  <label style="display: block; margin: 3px 0;">
                    <input type="radio" name="attackCount" value="3" style="margin-right: 5px;">
                    3 Attacks (Amazing FEAT, -1CS each)
                  </label>
                </div>
              </div>
            \`;
          }
          
          html += \`</div>\`;
          return html;
        }

        const multiTargetOptionsHTML = generateMultiTargetOptionsHTML("${action}");

        new Dialog({
          title: \`Roll: ${action}\`,
          content: \`
          <form>
            <div class="form-group">
              <label>Column Shift</label>
              <input type="number" name="cs" value="\${savedCS}" />
            </div>
            <div class="form-group">
              <label>Karma</label>
              <input type="number" name="karma" value="\${savedKarma}" />
            </div>
            <div class="form-group">
              <label>Damage Value</label>
              <input type="number" name="damageValue" value="" placeholder="Enter weapon/power damage" />
              <div style="font-size: 0.8em; color: #666;">Leave blank to use ability value</div>
            </div>
            <div class="form-group">
              <label>Weapon/Power Used</label>
              <input type="text" name="weaponName" value="" placeholder="e.g., Colt .45, Energy Blast, Katana" />
              <div style="font-size: 0.8em; color: #666;">Optional: For chat display purposes</div>
            </div>
            \${multiTargetOptionsHTML}
            <div class="form-group">
              <label><input type="checkbox" name="remember" checked /> Remember these settings</label>
            </div>
          </form>
        \`,
          buttons: {
            roll: {
              label: "Roll",
              callback: async (html) => {
              const cs = parseInt(html.find('[name="cs"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const damageValue = parseInt(html.find('[name="damageValue"]').val()) || null;
              const weaponName = html.find('[name="weaponName"]').val().trim();
              const remember = html.find('[name="remember"]').is(":checked");
              const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
              const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;

              if (remember) {
                await actor.setFlag("msh-faserip", \`cs_${action}\`, cs);
                await actor.setFlag("msh-faserip", \`karma_${action}\`, karma);
              }

              game.msh.rollUniversalAction("${action}", actor.id, cs, karma, {
                multiAdjacent,
                multiAttacks,
                attackCount,
                customDamage: damageValue,
                weaponName: weaponName
              });
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "roll"
        }).render(true);`;

        let macro = game.macros.find(m => m.name === `FEAT: ${action} (${actor.name})` && m.command === command);
        if (!macro) {
          const iconName = iconMap[action] || "dice-target";
          const img = `systems/msh-faserip/assets/icons/actions/${iconName}.png`;

          const macroData = {
            name: `FEAT: ${action} (${actor.name})`,
            type: "script",
            command,
            img,
            flags: {"faserip.universalActionMacro": true}
          };

          try {
            macro = await Macro.create({
              ...macroData,
              ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
            });
          } catch (err) {
            if (game.msh?.runAsGM) {
              await game.msh.runAsGM({
                operation: "createMacro",
                macroData,
                slot: null,
                userId: game.user.id
              });
              macro = game.macros.find(m => m.name === macroData.name && m.command === command);
              if (!macro) {
                ui.notifications.warn("Macro created - please drag again");
                return;
              }
            } else {
              ui.notifications.error("Cannot create macro - socketlib not available");
              return;
            }
          }
        }

        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Macro",
          uuid: macro.uuid
        }));
      });

      el.addEventListener("click", ev => {
        ev.stopPropagation();

        const action = ev.currentTarget.dataset.action;
        if (!action) return;

        const actor = game.user.character || canvas.tokens.controlled[0]?.actor;
        if (!actor) return ui.notifications.warn("Select a token or assign a character first.");

        const savedCS = actor.getFlag("msh-faserip", `cs_${action}`) || 0;
        const savedKarma = actor.getFlag("msh-faserip", `karma_${action}`) || 0;

        const multiTargetOptionsHTML = generateMultiTargetOptionsHTML(action);

        new Dialog({
          title: `Roll: ${action}`,
          content: `
          <form>
            <div class="form-group">
              <label>Column Shift</label>
              <input type="number" name="cs" value="${savedCS}" />
            </div>
            <div class="form-group">
              <label>Karma</label>
              <input type="number" name="karma" value="${savedKarma}" />
            </div>
            <div class="form-group">
              <label>Damage Value</label>
              <input type="number" name="damageValue" value="" placeholder="Enter weapon/power damage" />
              <div style="font-size: 0.8em; color: #666;">Leave blank to use ability value</div>
            </div>
            <div class="form-group">
              <label>Weapon/Power Used</label>
              <input type="text" name="weaponName" value="" placeholder="e.g., Colt .45, Energy Blast, Katana" />
              <div style="font-size: 0.8em; color: #666;">Optional: For chat display purposes</div>
            </div>
            ${multiTargetOptionsHTML}
            <div class="form-group">
              <label><input type="checkbox" name="remember" checked /> Remember these settings</label>
            </div>
          </form>
        `,
          buttons: {
            roll: {
              label: "Roll",
              callback: async (html) => {
                const cs = parseInt(html.find('[name="cs"]').val()) || 0;
                const karma = parseInt(html.find('[name="karma"]').val()) || 0;
                const damageValue = parseInt(html.find('[name="damageValue"]').val()) || null;
                const weaponName = html.find('[name="weaponName"]').val().trim();
                const remember = html.find('[name="remember"]').is(":checked");
                const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
                const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
                const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;

                if (multiAdjacent) {
                  const targetTokens = Array.from(game.user.targets);
                  if (targetTokens.length < 2) {
                    ui.notifications.warn("Multiple adjacent targets requires at least 2 targets selected!");
                    return;
                  }
                  const attackerToken = canvas.tokens.controlled[0];
                  if (!attackerToken) {
                    ui.notifications.warn("No attacker token selected!");
                    return;
                  }
                  const validation = validateAdjacentTargets(attackerToken, targetTokens);
                  if (!validation.valid) {
                    ui.notifications.warn(`Some targets are not adjacent: ${validation.invalidTargets.map(t => t.name).join(', ')}`);
                    return;
                  }
                }

                if (remember) {
                  await actor.setFlag("msh-faserip", `cs_${action}`, cs);
                  await actor.setFlag("msh-faserip", `karma_${action}`, karma);
                }

                game.msh.rollUniversalAction(action, actor.id, cs, karma, {
                  multiAdjacent,
                  multiAttacks,
                  attackCount,
                  customDamage: damageValue,
                  weaponName: weaponName
                });
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "roll",
          render: (html) => {
            addMultiTargetEventHandlers(html);
          }
        }).render(true);
      });

    });

  });
  // end of openUniversalTableDialog
}
