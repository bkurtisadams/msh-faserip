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
  getTargetingContext
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

    // Restore saved settings
    const savedAreas = await actor.getFlag("msh-faserip", "lastChargingAreas") || 1;
    const savedTargetBA = await actor.getFlag("msh-faserip", "lastChargingTargetBA") || "Shift-0";
    const savedTargetBAValue = await actor.getFlag("msh-faserip", "lastChargingTargetBAValue") || 0;

    // Build dialog
    const dialogHtml = `
      <div style="margin-bottom:8px;"><strong>${actionName}</strong></div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:140px;">Endurance Rank:</span>
        <input type="text" value="${endurance.name}" style="width:120px" readonly>
        <span style="margin-left:6px;">${endurance.rank} (${endurance.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:140px;">Agility (for miss):</span>
        <input type="text" value="${agility.name}" style="width:120px" readonly>
        <span style="margin-left:6px;">${agility.rank} (${agility.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:140px;">Your Body Armor:</span>
        <input type="text" value="${bodyArmorRank}" style="width:120px" readonly>
        <span style="margin-left:6px;">(${bodyArmorValue})</span>
      </div>

      <div style="margin-bottom:12px;padding:8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:4px;">Movement & Modifiers</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:140px;">Areas moved:</label>
          <input type="number" name="areas" value="${savedAreas}" min="1" max="20" style="width:60px;">
          <span id="charge-bonus" style="margin-left:6px;font-weight:bold;color:#2e7d32;">+1 CS</span>
        </div>
        <div style="font-size:0.85em;color:#666;">
          Must move at least 1 area. +1CS per area moved (max +3CS at 3+ areas)
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:140px;">Base Column Shift:</span>
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:60px;">
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:140px;">Karma Points:</span>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:60px;">
      </div>

      <div style="margin-bottom:12px;padding:8px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:4px;">Target's Body Armor</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:80px;">Rank:</label>
          <select name="targetBodyArmorRank" style="width:120px;">
            ${RANKS.map(r => `<option value="${r}" ${r === savedTargetBA ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:80px;">Value:</label>
          <input type="number" name="targetBodyArmorValue" value="${savedTargetBAValue}" min="0" style="width:80px;">
        </div>
        <div id="damage-preview" style="margin-top:8px;padding:4px;background:#fff;border:1px solid #2196F3;border-radius:3px;font-size:0.9em;">
          <strong>Estimated Damage:</strong> <span id="damage-calc">Calculating...</span>
        </div>
        <div style="margin-top:4px;font-size:0.85em;color:#666;">
          Damage reflects back to you if target's BA > your damage
        </div>
      </div>

      <div style="margin-top:8px;">
        <input type="checkbox" id="remember" name="remember" checked>
        <label for="remember">Remember settings</label>
        <input type="checkbox" id="skipDice" name="skipDice" style="margin-left:12px;">
        <label for="skipDice">Skip dice animation</label>
      </div>
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
              const targetBArank = String($('[name="targetBodyArmorRank"]').val() || "Shift-0");
              const targetBAvalue = Number($('[name="targetBodyArmorValue"]').val() || 0);
              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

              if (remember) {
                await actor.setFlag("msh-faserip", "lastChargingAreas", areas);
                await actor.setFlag("msh-faserip", "lastChargingTargetBA", targetBArank);
                await actor.setFlag("msh-faserip", "lastChargingTargetBAValue", targetBAvalue);
              }

              // Calculate movement bonus (max +3CS)
              const movementBonus = Math.min(3, areas);
              const totalShift = shift + movementBonus;

              resolve({
                areas,
                shift,
                karma,
                skipDice,
                targetBArank,
                targetBAvalue,
                totalShift,
                movementBonus
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          const updatePreview = () => {
            const areas = Math.max(1, Number(html.find('[name="areas"]').val() || 1));
            const movementBonus = Math.min(3, areas);
            
            // Update charge bonus display
            html.find('#charge-bonus').text(`+${movementBonus} CS`);

            // Calculate potential damage
            const baseRankValue = Math.max(endurance.value, bodyArmorValue);
            const speedDamage = areas * 2;
            const totalDamage = baseRankValue + speedDamage;

            // Show damage calculation
            const calc = `${baseRankValue} (END/BA) + ${speedDamage} (speed) = ${totalDamage} points`;
            html.find('#damage-calc').text(calc);
          };

          html.find('[name="areas"]').on('input', updatePreview);
          html.find('[name="targetBodyArmorRank"]').on('change', () => {
            // Auto-fill BA value when rank changes
            const rank = html.find('[name="targetBodyArmorRank"]').val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="targetBodyArmorValue"]').val(value);
            updatePreview();
          });

          updatePreview(); // Initial
        }
      }).render(true);
    });

    if (!choice) return;

    // Effective rank after all modifiers
    const effectiveRank = shiftRank(endurance.rank, choice.totalShift);

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

    // Calculate damage
    const baseRankValue = Math.max(endurance.value, bodyArmorValue);
    const speedDamage = choice.areas * 2;
    const totalDamage = baseRankValue + speedDamage;

    // Check for damage reflection
    let damageToTarget = totalDamage;
    let damageToAttacker = 0;
    let reflectionNote = "";

    if (choice.targetBAvalue > totalDamage) {
      // Damage reflects back
      const reflected = totalDamage;
      damageToTarget = 0;
      damageToAttacker = Math.max(0, reflected - bodyArmorValue);
      reflectionNote = `<div style="padding:6px;margin:6px 10px;background:#ffebee;border:1px solid #f44336;border-radius:3px;">
        <strong>⚠️ Damage Reflected!</strong> Target's BA (${choice.targetBAvalue}) > your damage (${totalDamage}).
        ${bodyArmorValue > 0 ? `Your BA (${bodyArmorValue}) absorbs some. ` : ''}
        <strong>You take ${damageToAttacker} damage!</strong>
      </div>`;
    }

    // Build result grid and banner
    const grid = buildResultGrid(actionType, colorLower, effects, getResultHoverText);
    const { bg, fg } = bannerColors(colorLower);

    // Action chips
    const actions = buildActionsBox({
      showSlam: colorLower === "yellow",
      showStun: colorLower === "red",
      actorUuid: actor.uuid,
      damage: damageToTarget,
      attackForm: "charging"
    });

    // Special miss handling
    const missNote = colorLower === "white" ? `
      <div style="padding:6px;margin:6px 10px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
        <strong>Miss - Continued Movement:</strong> You continue moving ${Math.ceil(choice.areas / 2)} areas in a straight line.
        Changing direction requires an Agility FEAT (${agility.rank}).
      </div>
    ` : "";

    const contextHtml = `
      <div>Endurance: ${endurance.rank} (${endurance.value}) — Your BA: ${bodyArmorRank} (${bodyArmorValue})</div>
      <div>Base Shift: ${choice.shift} + Movement: +${choice.movementBonus}CS = ${choice.totalShift}CS → ${effectiveRank}</div>
      <div>Areas Moved: ${choice.areas} — Speed Damage: +${speedDamage} points</div>
      <div>Target Body Armor: ${choice.targetBArank} (${choice.targetBAvalue})</div>
      <div>Base Damage: ${baseRankValue} + Speed: ${speedDamage} = ${totalDamage} total</div>
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
        ${colorLower !== "white" ? actions : ""}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }
}