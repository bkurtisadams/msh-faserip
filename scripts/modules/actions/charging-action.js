// scripts/modules/actions/charging-action.js
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  labelFor,
  effectsFor,
  buildResultGrid,
  bannerColors,
  getAbilityInfo,
  rollWithKarmaAndHistory,
  buildActionsBox,
  getResultHoverText,
  getTargetingContext,
  debugLog
} from "./action-utils.js";

/**
 * ChargingAction - Endurance-based attack combining movement and combat
 * Rules:
 * - Must move at least 1 area to charge
 * - +1CS per area moved (max +3CS)
 * - Damage = Endurance or Body Armor (higher) + 2pts per area moved
 * - Body Armor can reflect damage back to attacker
 */
export class ChargingAction extends BaseAction {
  async execute() {
  const actor = this.actor;
  const actionType = "charging";
  const actionName = labelFor(actionType);
  const effects = effectsFor(actionType);

  // Get Endurance and Body Armor
  const endurance = getAbilityInfo(actor, "endurance");
  const agility = getAbilityInfo(actor, "agility");
  
  // Get Body Armor if it exists
  let bodyArmorRank = "Shift-0";
  let bodyArmorValue = 0;
  const bodyArmorPower = actor.items.find(i => 
    i.type === "power" && 
    (i.name.toLowerCase().includes("body armor") || 
     i.name.toLowerCase().includes("body armour"))
  );
  if (bodyArmorPower) {
    bodyArmorRank = bodyArmorPower.system?.rank || "Shift-0";
    bodyArmorValue = bodyArmorPower.system?.value || 0;
  }

  // Material strength examples for each rank
  const MATERIAL_EXAMPLES = {
    "Shift-0": "Air, vacuum",
    "Feeble": "Cloth, glass, brush, paper",
    "Poor": "Normal plastics, crystal, wood",
    "Typical": "Rubber, soft metals (gold, brass, copper), ice, adobe",
    "Good": "Brick, aluminum, light machinery, asphalt, high strength plastics",
    "Excellent": "Concrete, Beta cloth, iron, bullet-proof glass",
    "Remarkable": "Reinforced concrete, steel",
    "Incredible": "Solid stone, Vibranium, volcanic rock",
    "Amazing": "Osmium steel, granite, gemstones",
    "Monstrous": "Diamond, super-heavy alloys",
    "Unearthly": "Adamantium steel, mystical/enchanted elements",
    "Class 1000": "Virtually indestructible (Cap's shield, Thor's hammer)",
    "Class 3000": "Virtually indestructible (Cap's shield, Thor's hammer)",
    "Class 5000": "Virtually indestructible (Cap's shield, Thor's hammer)"
  };

  // Auto-populate target's Body Armor from targeted token
  let targetBArank = "Shift-0";
  let targetBAvalue = 0;
  let targetName = "";
  let targetUuid = "";
  let autoPopulated = false;
  
  const targets = game.user.targets;
  if (targets.size === 1) {
    const targetToken = targets.first();
    const targetActor = targetToken.actor;
    
    if (targetActor) {
      targetName = targetToken.name;
      autoPopulated = true; // Mark as auto-populated even if no BA found
      
      // Find target's Body Armor power
      const targetBApower = targetActor.items.find(i => 
        i.type === "power" && 
        (i.name.toLowerCase().includes("body armor") || 
         i.name.toLowerCase().includes("body armour"))
      );
      
      if (targetBApower) {
        targetBArank = targetBApower.system?.rank || "Shift-0";
        targetBAvalue = targetBApower.system?.value || 0;
        console.log(`FASERIP | Auto-populated target BA: ${targetName} (Body Armor: ${targetBArank} = ${targetBAvalue})`);
      } else {
        console.log(`FASERIP | Auto-populated target BA: ${targetName} (No Body Armor found - defaulting to Shift-0)`);
      }
    }
  } else if (targets.size > 1) {
    ui.notifications.warn("Multiple tokens targeted. Please select only one target for charging.");
  }

  // Restore saved settings
  const savedAreas = await actor.getFlag("msh-faserip", "lastChargingAreas") || 1;
  const savedTargetType = await actor.getFlag("msh-faserip", "lastChargingTargetType") || "character";
  const savedTargetBA = autoPopulated ? targetBArank : (await actor.getFlag("msh-faserip", "lastChargingTargetBA") || "Shift-0");
  const savedTargetBAValue = autoPopulated ? targetBAvalue : (await actor.getFlag("msh-faserip", "lastChargingTargetBAValue") || 0);
  const savedObjectMaterial = await actor.getFlag("msh-faserip", "lastChargingObjectMaterial") || "Excellent";
  const savedObjectDesc = await actor.getFlag("msh-faserip", "lastChargingObjectDesc") || "";

  // If auto-populated a character, override saved target type
  const defaultTargetType = autoPopulated ? "character" : savedTargetType;

  // Material strength options with examples
  const materialOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    const example = MATERIAL_EXAMPLES[r] ? ` — ${MATERIAL_EXAMPLES[r]}` : '';
    return `<option value="${r}" ${r === savedObjectMaterial ? 'selected' : ''}>${r} (${val})${example}</option>`;
  }).join('');

  // Build rank options for character BA
  const rankOptions = RANKS.map(r => 
    `<option value="${r}" ${r === savedTargetBA ? 'selected' : ''}>${r}</option>`
  ).join('');

  // Build dialog
  const dialogHtml = `
    <div style="margin-bottom:6px;">
      <div style="display:grid;grid-template-columns:80px 1fr;gap:3px 8px;font-size:.9em;line-height:1.3;">
        <span style="font-weight:600;">Action:</span><span style="font-weight:600;">${actionName}</span>
        <span style="font-weight:600;">Target:</span><span style="color:#d32f2f;font-style:italic;">${targetName || "(no target selected)"}</span>
        <span style="font-weight:600;">Endurance:</span><span>${endurance.rank} (${endurance.value})</span>
        <span style="font-weight:600;">Body Armor:</span><span>${bodyArmorRank} (${bodyArmorValue})</span>
        <span style="font-weight:600;">Agility:</span><span>${agility.rank} (${agility.value})</span>
      </div>
    </div>
    
    <div style="margin:4px 0 6px 0;padding:4px 0;border-top:1px solid #ddd;">
      <div style="margin-bottom:3px;">
        <label style="display:inline-block;width:90px;font-size:.9em;">Column Shift:</label>
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:45px;padding:2px;">
        <span style="color:#666;font-size:.8em;margin-left:4px;">(+/−)</span>
      </div>
      <div>
        <label style="display:inline-block;width:90px;font-size:.9em;">Karma Points:</label>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:45px;padding:2px;">
      </div>
    </div>

    <div style="margin:6px 0;padding:6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
      <div style="margin-bottom:4px;font-size:.9em;">
        <label style="display:inline-block;width:80px;" title="Areas moved">Movement:</label>
        <input type="number" name="areas" value="${savedAreas}" min="1" max="20" style="width:60px;padding:2px;">
        <span id="charge-bonus" style="margin-left:6px;font-weight:bold;color:#2e7d32;" title="Column Shift bonus from movement">
          CS: ${Math.min(3, savedAreas)}
        </span>
      </div>
      <div style="font-size:0.8em;color:#777;">
        Must move at least one area. Gain one CS per area moved (cap three at three or more areas).
      </div>
    </div>

    <div style="margin:6px 0;font-size:.9em;">
      <label style="font-weight:600;margin-right:8px;">Target Type:</label>
      <label><input type="radio" name="target-type" value="character" ${defaultTargetType === 'character' ? 'checked' : ''}> Character</label>
      <label style="margin-left:8px;"><input type="radio" name="target-type" value="object" ${defaultTargetType === 'object' ? 'checked' : ''}> Inanimate Object</label>
    </div>

    <div style="margin-bottom:12px;">
      <div id="character-target-panel" style="padding:6px;border:1px solid #2196F3;border-radius:3px;background:#e3f2fd;font-size:0.9em;">
        <div style="font-weight:bold;margin-bottom:6px;color:#1565c0;">Character Target</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:140px;">Body Armor Rank:</label>
          <select name="targetBodyArmorRank" style="width:200px;padding:2px;">${rankOptions}</select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:140px;">Body Armor Value:</label>
          <input type="number" name="targetBodyArmorValue" value="${savedTargetBAValue}" min="0" style="width:100px;padding:2px;">
        </div>
        <div id="char-damage-preview" style="margin-top:4px;padding:4px;background:#fff;border:1px solid #2196F3;border-radius:3px;font-size:0.85em;">
          <strong>Damage Preview:</strong><br>
          <span id="char-damage-calc">Calculating...</span>
        </div>
        <div id="char-rebound-warning" style="margin-top:4px;padding:4px;display:none;background:#ffebee;border:1px solid #f44336;border-radius:3px;font-size:0.85em;color:#d32f2f;font-weight:bold;">
          ⚠ Target BA > damage → rebounds!
        </div>
      </div>

      <div id="object-target-panel" style="padding:6px;border:1px solid #ff9800;border-radius:3px;background:#fff3e0;display:none;font-size:0.9em;">
        <div style="font-weight:bold;margin-bottom:6px;color:#e65100;">Inanimate Object</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:140px;">Description:</label>
          <input type="text" name="objectDescription" value="${savedObjectDesc}" placeholder="e.g., Brick wall, Steel door" style="width:calc(100% - 145px);padding:2px;">
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:140px;">Material Strength:</label>
          <select name="objectMaterial" style="width:200px;padding:2px;">${materialOptions}</select>
        </div>
        <div id="obj-damage-preview" style="margin-top:4px;padding:4px;background:#fff;border:1px solid #ff9800;border-radius:3px;font-size:0.85em;">
          <strong>Damage Preview:</strong><br>
          <span id="obj-damage-calc">Calculating...</span>
        </div>
        <div id="obj-rebound-warning" style="margin-top:4px;padding:4px;display:none;background:#ffebee;border:1px solid #f44336;border-radius:3px;font-size:0.85em;color:#d32f2f;font-weight:bold;">
          ⚠ Material > damage → rebounds!
        </div>
      </div>
    </div>

    <div style="font-size:0.8em;color:#777;margin-bottom:8px;">
      Absorbed portion rebounds to the attacker; your Body Armor may soak it.
    </div>

    <div style="margin-top:6px;padding-top:5px;border-top:1px solid #ddd;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.9em;">
      <label><input type="checkbox" name="remember" checked> Remember settings</label>
      <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
    </div>
    
    ${autoPopulated ? `<div style="margin-top:8px;padding:4px;background:#e8f5e9;border:1px solid #4CAF50;border-radius:3px;font-size:.85em;color:#2e7d32;">✓ Auto-populated from targeted token</div>` : ""}
  `;

  const choice = await new Promise(resolve => {
    new Dialog({
      title: `${actionName}: ${actor.name}`,
      content: dialogHtml,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const $ = (sel) => html.find(sel);
            const areas = Math.max(1, Number($('[name="areas"]').val() || 1));
            const shift = Number($('[name="shift"]').val() || 0);
            const karma = Number($('[name="karma"]').val() || 0);
            const targetType = String($('[name="target-type"]:checked').val() || "character");
            const skipDice = !!$('[name="skipDice"]').is(':checked');
            const remember = !!$('[name="remember"]').is(':checked');

            let targetBArank, targetBAvalue, objectMaterial, objectDesc;

            if (targetType === "character") {
              targetBArank = String($('[name="targetBodyArmorRank"]').val() || "Shift-0");
              targetBAvalue = Number($('[name="targetBodyArmorValue"]').val() || 0);
              objectMaterial = null;
              objectDesc = null;
            } else {
              objectMaterial = String($('[name="objectMaterial"]').val() || "Excellent");
              objectDesc = String($('[name="objectDescription"]').val() || "Object");
              targetBArank = objectMaterial;
              targetBAvalue = game.msh.getRankValue(objectMaterial) || 20;
            }

            if (remember) {
              await actor.setFlag("msh-faserip", "lastChargingAreas", areas);
              await actor.setFlag("msh-faserip", "lastChargingTargetType", targetType);
              if (targetType === "character") {
                await actor.setFlag("msh-faserip", "lastChargingTargetBA", targetBArank);
                await actor.setFlag("msh-faserip", "lastChargingTargetBAValue", targetBAvalue);
              } else {
                await actor.setFlag("msh-faserip", "lastChargingObjectMaterial", objectMaterial);
                await actor.setFlag("msh-faserip", "lastChargingObjectDesc", objectDesc);
              }
            }

            // Calculate movement bonus (max +3CS)
            const movementBonus = Math.min(3, areas);
            const totalShift = shift + movementBonus;

            resolve({
              areas,
              shift,
              karma,
              skipDice,
              targetType,
              targetBArank,
              targetBAvalue,
              objectMaterial,
              objectDesc,
              totalShift,
              movementBonus
            });
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "roll",
      render: (html) => {
        const $charPanel = html.find('#character-target-panel');
        const $objPanel = html.find('#object-target-panel');

        const togglePanels = () => {
          const type = html.find('[name="target-type"]:checked').val();
          if (type === 'character') {
            $charPanel.show();
            $objPanel.hide();
          } else {
            $charPanel.hide();
            $objPanel.show();
          }
          updatePreview();
        };

        const updatePreview = () => {
        const areas = Math.max(1, Number(html.find('[name="areas"]').val() || 1));
        const movementBonus = Math.min(3, areas);

        // UI: avoid + and - symbols in labels
        html.find('#charge-bonus').text(`CS bonus: ${movementBonus}`);

        // Numbers for the attacker
        const baseRankValue = Math.max(endurance.value, bodyArmorValue);
        const speedDamage = areas * 2;
        const totalDamage = baseRankValue + speedDamage;

        const type = String(html.find('[name="target-type"]:checked').val() || "character");

        if (type === 'character') {
          // Character target preview
          const targetBA = Number(html.find('[name="targetBodyArmorValue"]').val() || 0);
          const absorbed = Math.min(targetBA, totalDamage);
          const targetTakes = totalDamage - absorbed;
          const reboundRaw = (targetBA > totalDamage) ? absorbed : 0;  // only rebound if BA > damage
          const reboundFinal = Math.max(0, reboundRaw - bodyArmorValue);

          const $calc = html.find('#char-damage-calc');
          const $warn = html.find('#char-rebound-warning');

          $calc.html(
            `${totalDamage} total (${baseRankValue} base, ${speedDamage} speed)<br>` +
            `→ Target absorbs ${absorbed}, takes ${targetTakes}.<br>` +
            `→ Rebound ${reboundRaw} to you; after your BA ${bodyArmorValue}, you take ${reboundFinal}.`
          );

          if (reboundFinal > 0) $warn.show(); else $warn.hide();

        } else {
          // Object (material) target preview
          const objectMat = String(html.find('[name="objectMaterial"]').val() || "Excellent");
          const objectMatValue = game.msh.getRankValue(objectMat) || 20;

          const absorbed = Math.min(objectMatValue, totalDamage);
          const objectTakes = totalDamage - absorbed;
            const reboundRaw = (objectMatValue > totalDamage) ? absorbed : 0;  // only rebound if Material > damage
          const reboundFinal = Math.max(0, reboundRaw - bodyArmorValue);

          const $calc = html.find('#obj-damage-calc');
          const $warn = html.find('#obj-rebound-warning');

          $calc.html(
            `${totalDamage} total (${baseRankValue} base, ${speedDamage} speed)<br>` +
            `→ Object absorbs ${absorbed}, takes ${objectTakes}.<br>` +
            `→ Rebound ${reboundRaw} to you; after your BA ${bodyArmorValue}, you take ${reboundFinal}.`
          );

          if (reboundFinal > 0) $warn.show(); else $warn.hide();
        }
      };

        html.find('[name="areas"]').on('input', updatePreview);
        html.find('[name="target-type"]').on('change', togglePanels);
        html.find('[name="targetBodyArmorRank"]').on('change', () => {
          const rank = html.find('[name="targetBodyArmorRank"]').val();
          const value = game.msh.getRankValue(rank) || 0;
          html.find('[name="targetBodyArmorValue"]').val(value);
          updatePreview();
        });
        html.find('[name="targetBodyArmorValue"]').on('input', updatePreview);
        html.find('[name="objectMaterial"]').on('change', updatePreview);

        togglePanels(); // Initial setup
        updatePreview(); // Initial preview
      }
    }).render(true);
  });

  if (!choice) return;

  // Effective rank after all modifiers (with Shift-Z cap)
  let effectiveRank = shiftRank(endurance.rank, choice.totalShift);
  const shiftZindex = RANKS.indexOf("Shift-Z");
  const effectiveIndex = RANKS.indexOf(effectiveRank);
  if (shiftZindex >= 0 && effectiveIndex > shiftZindex) {
    effectiveRank = "Shift-Z";
    console.log("FASERIP | Charging: Effective rank capped at Shift-Z per rules");
  }

  debugLog("Charging: Dialog choices", {
    areas: choice.areas,
    shift: choice.shift,
    karma: choice.karma,
    totalShift: choice.totalShift,
    movementBonus: choice.movementBonus,
    targetType: choice.targetType,
    targetBArank: choice.targetBArank,
    targetBAvalue: choice.targetBAvalue,
    effectiveRank: effectiveRank
  });

  // Roll
  const roll = await new Roll("1d100").evaluate();
  if (!choice.skipDice) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} performs ${actionName}`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  const { cappedTotal, totalKarmaUsed } =
    await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll);

  const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
  const colorLower = String(color || "").toLowerCase();
  const effectResult = effects[colorLower] || color;

  // define once, above this block (right after you have colorLower)
  const targetLabel = (choice.targetType === "character")
    ? ((typeof targetName !== "undefined" && targetName) ? targetName : "Target")
    : (choice.objectDesc ? choice.objectDesc : "Object");

  // Calculate damage numbers for this attempt
  const baseRankValue = Math.max(endurance.value, bodyArmorValue);
  const speedDamage = choice.areas * 2;
  const totalDamage = baseRankValue + speedDamage;

  // Outputs used by the chat card
  let damageToTarget = 0;
  let damageToAttacker = 0;
  let reflectionNote = "";
  let penetratingDamage = 0;

  if (colorLower !== "white") {
    const absorbedByDefense = Math.min(choice.targetBAvalue, totalDamage);
    const reboundAmount = (choice.targetBAvalue > totalDamage) ? absorbedByDefense : 0;

    damageToTarget = Math.max(0, totalDamage - absorbedByDefense);
    damageToAttacker = Math.max(0, reboundAmount - bodyArmorValue);
    penetratingDamage = damageToTarget;

    if (reboundAmount > 0) {
      const defenseType = choice.targetType === "character" ? "BA" : "Material Strength";
      reflectionNote = `
        <div style="padding:6px;margin:6px 10px;background:#ffebee;border:1px solid #f44336;border-radius:3px;">
          <strong>Rebound:</strong> ${targetLabel}'s ${defenseType} (${choice.targetBAvalue}) exceeded your damage (${totalDamage}) and returns ${absorbedByDefense} to you.
          Your BA (${bodyArmorValue}) soaks what it can.
          <strong> You take ${damageToAttacker} damage.</strong>
        </div>
      `;
      if (damageToAttacker > 0) {
        reflectionNote += `
          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
            <a class="faserip-chip"
              data-action="apply-self-damage"
              data-actor-uuid="${actor.uuid}"
              data-damage="${damageToAttacker}"
              title="Apply collision damage to attacker"
              style="display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;background:#fff;color:#333;cursor:pointer;">
              Apply Self Damage
            </a>
          </div>
        `;
      }
    }

    debugLog("Charging Resolve (contact)", {
      attacker: actor?.name,
      target: targetLabel,
      areas: choice.areas,
      baseRankValue,
      speedDamage,
      totalDamage,
      targetDefense: choice.targetBAvalue,
      absorbedByDefense,
      reboundAmount,
      damageToTarget,
      attackerBA: bodyArmorValue,
      damageToAttacker,
      penetratingDamage
    });
  } else {
    penetratingDamage = 0;
    debugLog("Charging Resolve (miss)", {
      attacker: actor?.name,
      target: targetLabel,
      areas: choice.areas,
      baseRankValue,
      speedDamage,
      totalDamage
    });
  }

  // Build result grid and banner
  const grid = buildResultGrid(actionType, colorLower, effects, getResultHoverText);
  const { bg, fg } = bannerColors(colorLower);

  // Action chips
  const actions = buildActionsBox({
    showSlam: colorLower === "yellow" && choice.targetType === "character" && damageToTarget > 0,
    showStun: colorLower === "red" && choice.targetType === "character",
    actorUuid: actor.uuid,
    damage: damageToTarget,
    attackForm: "charging",
    bypassArmor: true,
    // Add prefill data for Slam/Stun checks
    prefillData: {
      dmgThrough: penetratingDamage,
      attackForm: "charging",
      ownerActor: actor.name,
      ownerActorUuid: actor.uuid,
      targetName: targetName || "Target",
      targetUuid: targetUuid || ""
    }
  });

  // Special miss handling
  const missNote = colorLower === "white" ? `
    <div style="padding:6px;margin:6px 10px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
      <strong>Miss - Continued Movement:</strong> You continue moving at half your speed in a straight line.
      Changing direction requires an Agility FEAT (${agility.rank}).
      If you hit an obstacle, you make a collision attack against it.
    </div>
  ` : "";

  const targetInfo = choice.targetType === "character"
    ? `Target: ${targetLabel} (Body Armor: ${choice.targetBArank} = ${choice.targetBAvalue})`
    : `Target: ${targetLabel} (Material: ${choice.targetBArank} = ${choice.targetBAvalue})`;

  const contextHtml = `
    <div>Endurance: ${endurance.rank} (${endurance.value})</div>
    <div>Body Armor: ${bodyArmorRank} (${bodyArmorValue})</div>
    <div>Areas Moved: ${choice.areas} → Movement Bonus: +${choice.movementBonus}CS${choice.shift !== 0 ? ` (base shift: ${choice.shift > 0 ? '+' : ''}${choice.shift})` : ''}</div>
    <div>Effective Rank: ${effectiveRank}</div>
    <div>Damage: ${baseRankValue} (max of END/BA) + ${speedDamage} (2×${choice.areas}) = ${totalDamage} points</div>
    <div>${targetInfo}</div>
    ${!reflectionNote ? `<div>${targetLabel} takes: ${damageToTarget} damage (${totalDamage} - ${choice.targetBAvalue})</div>` : ''}
    <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
  `;

  // targeting info
  const targetingContext = getTargetingContext(actor, actionName);

  const cardHtml = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
        <strong>${actor.name} - ${actionName}</strong>
      </div>
      <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
        ${targetingContext}
      </div>
      <div style="padding:5px 10px;font-size:.9em;">${contextHtml}</div>
      ${grid}
      <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
        RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
      </div>
      ${reflectionNote}
      ${missNote}
      ${colorLower !== "white" && choice.targetType === "character" ? actions : ""}
    </div>
  `;

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
}
}