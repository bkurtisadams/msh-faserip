// collision-damage.js v1.1.1 - 2025-12-23
// v1.1.1: Fix apply damage - use apply-collision-damage action with target-uuid
// v1.1.0: Compact dialog layout, default to Good (brick) material
import { applyDamageToActorUuid, debugLog } from "./action-utils.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

export function openCollisionDamageDialog({ 
  targetName = "Target", 
  targetUuid = "",
  targetEndurance = "Good", 
  slamDistance = 1 
}) {
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  // Auto-populate from target actor if UUID provided
  let autoPopulatedEnd = targetEndurance;
  let autoPopulatedArmor = "Shift-0";
  let autoPopulated = false;

  if (targetUuid) {
    try {
      const resolved = fromUuidSync ? fromUuidSync(targetUuid) : null;
      const targetActor = resolved?.documentName === "Actor" ? resolved
                        : (resolved?.documentName === "Token" ? resolved.actor : null);
      
      if (targetActor) {
        autoPopulated = true;
        
        // Get Endurance
        const endRank = targetActor.system?.abilities?.endurance?.rank;
        if (endRank) {
          autoPopulatedEnd = endRank;
        }
        
        // Get Body Armor from power
        const bodyArmorPower = targetActor.items.find(i => 
          i.type === "power" && 
          (i.name.toLowerCase().includes("body armor") || 
          i.name.toLowerCase().includes("body armour"))
        );
        
        if (bodyArmorPower) {
          const baRank = bodyArmorPower.system?.rank || "Shift-0";
          autoPopulatedArmor = baRank;
        }
        
        console.log(`FASERIP | Auto-populated collision data: ${targetName} (END: ${autoPopulatedEnd}, BA: ${autoPopulatedArmor})`);
        
        debugLog("Collision: Auto-populate details", {
          actorName: targetActor.name,
          enduranceRank: autoPopulatedEnd,
          bodyArmorRank: autoPopulatedArmor,
          allPowers: targetActor.items.filter(i => i.type === "power").map(p => p.name),
          bodyArmorPowerFound: !!bodyArmorPower,
          bodyArmorPowerName: bodyArmorPower?.name
        });
      }
    } catch (e) {
      console.warn("FASERIP | Failed to auto-populate collision data:", e);
    }
  }

  // Material strength examples for each rank
  const MATERIAL_EXAMPLES = {
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

  // Plain rank options with values (for Body Armor and Endurance)
  const enduranceOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    return `<option value="${r}" ${r===autoPopulatedEnd?'selected':''}>${r} (${val})</option>`;
  }).join('');
  
  const armorOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    return `<option value="${r}" ${r===autoPopulatedArmor?'selected':''}>${r} (${val})</option>`;
  }).join('');
  
  // Material strength options with examples (for obstacles) - default to Good (brick)
  const materialOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    const example = MATERIAL_EXAMPLES[r] ? ` — ${MATERIAL_EXAMPLES[r]}` : '';
    return `<option value="${r}" ${r === "Good" ? 'selected' : ''}>${r} (${val})${example}</option>`;
  }).join('');

  showFaseripButtonDialog({
    title: `Collision Damage — ${targetName}`,
    content: `
      <div style="line-height:1.5;">
        <p><strong>${targetName}</strong> slammed ${slamDistance} area${slamDistance > 1 ? 's' : ''} and hits an obstacle.</p>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Endurance:</label>
          <select name="target-endurance" style="width:180px;">${enduranceOptions}</select>
        </div>
        
        <div style="margin-bottom:10px;">
          <label style="display:inline-block;width:120px;">Body Armor:</label>
          <select name="target-armor" style="width:180px;">${armorOptions}</select>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;"><strong>Obstacle:</strong></label>
          <label><input type="radio" name="obstacle-type" value="object" checked> Object</label>
          <label style="margin-left:8px;"><input type="radio" name="obstacle-type" value="character"> Character</label>
        </div>
        
        <div id="obstacle-object-panel" style="margin-left:120px;margin-bottom:8px;">
          <select name="obstacle-material" style="width:280px;">${materialOptions}</select>
        </div>
        
        <div id="obstacle-character-panel" style="margin-left:120px;margin-bottom:8px;display:none;">
          <div style="margin-bottom:4px;">
            <label>BA Rank:</label>
            <select name="obstacle-armor-rank" style="width:140px;">${armorOptions}</select>
          </div>
          <div>
            <label>BA Value:</label>
            <input type="number" name="obstacle-armor-value" value="10" min="0" style="width:60px;">
          </div>
        </div>
      </div>
    `,
    buttons: {
      calculate: {
        label: "Calculate",
        callback: async (html) => {
          const $ = (sel) => html.find(sel);
          
          // Target data
          const targetEnd = $('[name="target-endurance"]').val();
          const targetArmor = $('[name="target-armor"]').val();
          
          // Obstacle data
          const obstacleType = $('[name="obstacle-type"]:checked').val();
          
          let obstacleDefense, obstacleDefenseValue;
          if (obstacleType === 'character') {
            obstacleDefense = $('[name="obstacle-armor-rank"]').val();
            obstacleDefenseValue = Number($('[name="obstacle-armor-value"]').val() || 0);
          } else {
            obstacleDefense = $('[name="obstacle-material"]').val();
            obstacleDefenseValue = game.msh.getRankValue(obstacleDefense);
          }
          
          // Calculate damage
          const result = calculateCollisionDamage({
            targetName,
            targetEndurance: targetEnd,
            targetArmor,
            obstacleType,
            obstacleDefense,
            obstacleDefenseValue,
            areasMovedThrough: slamDistance,
            selfActorUuid: targetUuid  // Pass the UUID so we can apply damage
          });
          
          // Post result to chat
          await postCollisionResult(result);
        }
      },
      cancel: { label: "Cancel" }
    },
    render: (html) => {
      const $objectPanel = html.find('#obstacle-object-panel');
      const $charPanel = html.find('#obstacle-character-panel');
      const $armorValue = html.find('[name="obstacle-armor-value"]');
      const $armorRank = html.find('[name="obstacle-armor-rank"]');
      
      // Update armor value when rank changes
      $armorRank.on('change', () => {
        const rank = $armorRank.val();
        const value = game.msh.getRankValue(rank);
        $armorValue.val(value);
      });
      
      // Initialize with current rank's value
      const initialRank = $armorRank.val();
      $armorValue.val(game.msh.getRankValue(initialRank));
      
      // Toggle panels based on radio selection
      html.find('[name="obstacle-type"]').on('change', () => {
        const type = html.find('[name="obstacle-type"]:checked').val();
        if (type === 'object') {
          $objectPanel.show();
          $charPanel.hide();
        } else {
          $objectPanel.hide();
          $charPanel.show();
        }
      });
    },
    width: 420
  });
}

function calculateCollisionDamage({
  targetName,
  targetEndurance,
  targetArmor,
  obstacleType,
  obstacleDefense,
  obstacleDefenseValue,
  areasMovedThrough,
  selfActorUuid = "",          // optional: the slammed character / attacker
  defenderActorUuid = ""       // optional: the defender if obstacleType is "character"
}) {
  const getVal = (rank) => game.msh.getRankValue(rank) || 0;

  const targetEndVal = getVal(targetEndurance);
  const targetArmorVal = getVal(targetArmor);
  const obstacleDefenseVal = obstacleDefenseValue !== undefined ? obstacleDefenseValue : getVal(obstacleDefense);

  // Base damage = max(Endurance, Body Armor) of the slammed character
  const baseDamage = Math.max(targetEndVal, targetArmorVal);

  // Speed damage = 2 × areas
  const speedDamage = 2 * areasMovedThrough;

  // Total damage
  const totalDamage = baseDamage + speedDamage;

  // Absorbed-portion rebound (always)
  const absorbedByObstacle = Math.min(obstacleDefenseVal, totalDamage);
  const damageToObstacle = totalDamage - absorbedByObstacle;

  const reboundAmount = absorbedByObstacle;
  const damageToTarget = Math.max(0, reboundAmount - targetArmorVal);

  const rebounded = reboundAmount > 0;

  let explanation = "";
  explanation += `Total ${totalDamage} = ${baseDamage} base + ${speedDamage} speed. `;
  explanation += `${rebounded ? `Obstacle absorbs ${absorbedByObstacle} and returns it.` : `Obstacle absorbs ${absorbedByObstacle}.`} `;
  explanation += `${targetName} ${damageToTarget > 0 ? `takes ${damageToTarget} after own BA ${targetArmorVal}. ` : `takes no damage after own BA ${targetArmorVal}. `}`;
  explanation += `${obstacleType === 'character' ? 'Defender' : 'Object'} takes ${damageToObstacle}.`;

  return {
    targetName,
    targetEndurance,
    targetEndVal,
    targetArmor,
    targetArmorVal,
    obstacleType,
    obstacleDefense,
    obstacleDefenseVal,
    areasMovedThrough,
    baseDamage,
    speedDamage,
    totalDamage,
    rebounded,
    damageToTarget,
    damageToObstacle,
    explanation,
    selfActorUuid,
    defenderActorUuid
  };
}

async function postCollisionResult(result) {
  const targetLine = `${result.targetName} — Endurance ${result.targetEndurance} (${result.targetEndVal}), Body Armor ${result.targetArmor} (${result.targetArmorVal})`;
  const obstacleLabel = result.obstacleType === "character" ? "Body Armor" : "Material Strength";
  const obstacleLine = `${result.obstacleType === "character" ? "Character" : "Object"} — ${obstacleLabel} ${result.obstacleDefense} (${result.obstacleDefenseVal})`;

  const outcomeBlocks = [];

  if (result.damageToTarget > 0) {
    outcomeBlocks.push(
      `<div style="background:#ffebee;padding:8px;border:1px solid #ef5350;border-radius:3px;text-align:center;font-weight:bold;">
         ${result.targetName} takes ${result.damageToTarget} damage from collision
       </div>`
    );
  } else {
    outcomeBlocks.push(
      `<div style="background:#e8f5e9;padding:8px;border:1px solid #4CAF50;border-radius:3px;text-align:center;font-weight:bold;">
         ${result.targetName} takes no damage
       </div>`
    );
  }

  if (result.damageToObstacle > 0) {
    outcomeBlocks.push(
      `<div style="margin-top:8px;padding:6px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
         ${result.obstacleType === "character" ? "Defender" : "Object"} takes ${result.damageToObstacle} damage
       </div>`
    );
  } else {
    outcomeBlocks.push(
      `<div style="margin-top:8px;padding:6px;background:#fafafa;border:1px solid #ddd;border-radius:3px;">
         ${result.obstacleType === "character" ? "Defender" : "Object"} takes no damage
       </div>`
    );
  }

  // Action chips
  const chips = [];

  // Apply damage to slammed character (the primary damage)
  if (result.damageToTarget > 0 && result.selfActorUuid) {
    chips.push(
      `<a class="faserip-chip"
          data-action="apply-collision-damage"
          data-damage="${result.damageToTarget}"
          data-target-uuid="${result.selfActorUuid}"
          title="Apply collision damage to ${result.targetName}"
          style="display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;background:#fff;color:#333;cursor:pointer;">
          Apply Damage (${result.targetName})
      </a>`
    );
  }

  // Apply damage to obstacle if it's a character
  if (result.defenderActorUuid && result.obstacleType === "character" && result.damageToObstacle > 0) {
    chips.push(
      `<a class="faserip-chip"
          data-action="apply-collision-damage"
          data-damage="${result.damageToObstacle}"
          data-target-uuid="${result.defenderActorUuid}"
          title="Apply collision damage to defender"
          style="display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;background:#fff;color:#333;cursor:pointer;">
          Apply Damage (Defender)
      </a>`
    );
  }

  const actionsBox = chips.length
    ? `<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
        ${chips.join("")}
      </div>`
    : "";

  const content = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#d32f2f;">
        <strong>Collision Damage — ${result.targetName}</strong>
      </div>

      <div style="padding:5px 10px;font-size:0.9em;">
        <div style="margin-bottom:8px;"><strong>Slammed Character:</strong> ${targetLine}</div>
        <div style="margin-bottom:8px;"><strong>Obstacle:</strong> ${obstacleLine}</div>
        <div style="margin-bottom:8px;"><strong>Distance:</strong> ${result.areasMovedThrough} area${result.areasMovedThrough > 1 ? "s" : ""}</div>

        <hr style="margin:8px 0;">

        <div style="margin-bottom:4px;"><strong>Damage Calculation:</strong></div>
        <div style="margin-left:12px;margin-bottom:4px;">Base equals ${result.baseDamage}</div>
        <div style="margin-left:12px;margin-bottom:4px;">Speed equals ${result.speedDamage}</div>
        <div style="margin-left:12px;font-weight:bold;">Total equals ${result.totalDamage}</div>

        <hr style="margin:8px 0;">

        <div style="padding:8px;background:#fff9c4;border:1px solid #f57c00;border-radius:3px;margin-bottom:8px;">
          ${result.explanation}
        </div>

        ${outcomeBlocks.join("")}
        ${actionsBox}
      </div>
    </div>
  `;

  await ChatMessage.create({ content });
}

if (!globalThis.mshCollisionHandlersBound) {
  Hooks.on("renderChatMessageHTML", (message, element) => {
  const html = $(element);

    html.on("click", 'a.faserip-chip[data-action="apply-self-damage"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const dmg = Number(btn.getAttribute("data-damage") || 0);
      const uuid = btn.getAttribute("data-actor-uuid") || "";
      await applyDamageToActorUuid(dmg, uuid, { updateButton: btn });
    });

    html.on("click", 'a.faserip-chip[data-action="apply-dmg-to-uuid"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const dmg = Number(btn.getAttribute("data-damage") || 0);
      const uuid = btn.getAttribute("data-actor-uuid") || "";
      await applyDamageToActorUuid(dmg, uuid, { updateButton: btn });
    });
  });
  globalThis.mshCollisionHandlersBound = true;
}