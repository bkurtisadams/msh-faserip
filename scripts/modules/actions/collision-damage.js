// collision-damage.js v2.0.0 - 2026-09-02
// v2.0.0: Kernel slice 5g follow-up. Slammed character's Body Armor read via
//         getBodyArmorValues (equipment/override/force-field aware; was a
//         power-name match). Character obstacle prefilled from the targeted
//         token and its UUID carried through, so the defender's damage can be
//         applied (defenderActorUuid was never passed before). Damage via
//         kernel chargeDamageParts + resolveChargeImpact; material examples
//         from kernel MATERIAL_EXAMPLES; private rank array retired.
// collision-damage.js v1.1.1 - 2025-12-23
// v1.1.1: Fix apply damage - use apply-collision-damage action with target-uuid
// v1.1.0: Compact dialog layout, default to Good (brick) material
import { applyDamageToActorUuid, debugLog, getBodyArmorValues } from "./action-utils.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";
import { RANKS_ORDERED as RANKS } from "../../rules/rules-reference.js";
import { chargeDamageParts, resolveChargeImpact, MATERIAL_EXAMPLES as KERNEL_MATERIALS, INDESTRUCTIBLE_MATERIAL_RANKS } from "../../lib/faserip-rules/faserip-damage.js";
import { kernelKeyFor } from "../../kernel/adapter.js";

// First targeted token other than the slammed character: the character obstacle.
function _targetedObstacle(excludeUuid) {
  for (const t of (game.user?.targets ?? [])) {
    const a = t?.actor;
    if (!a) continue;
    if (excludeUuid && (a.uuid === excludeUuid || t.document?.uuid === excludeUuid)) continue;
    const ba = getBodyArmorValues(a, "physical-charging");
    return { name: a.name, uuid: a.uuid, armorRank: ba?.physicalRank || "Shift-0", armorValue: Number(ba?.physicalArmor) || 0 };
  }
  return null;
}

export function openCollisionDamageDialog({ 
  targetName = "Target", 
  targetUuid = "",
  targetEndurance = "Good", 
  slamDistance = 1 
}) {
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
        
        // Body Armor via the shared resolver (equipment, overrides, force field)
        const ba = getBodyArmorValues(targetActor, "physical-charging");
        if (ba?.physicalRank) autoPopulatedArmor = ba.physicalRank;

        console.log(`FASERIP | Auto-populated collision data: ${targetName} (END: ${autoPopulatedEnd}, BA: ${autoPopulatedArmor})`);
        debugLog("Collision: Auto-populate details", { actorName: targetActor.name, enduranceRank: autoPopulatedEnd, bodyArmor: ba });
      }
    } catch (e) {
      console.warn("FASERIP | Failed to auto-populate collision data:", e);
    }
  }

  // Material strength examples from the kernel table
  const materialExample = (r) => {
    const key = kernelKeyFor(r);
    if (!key) return "";
    if (INDESTRUCTIBLE_MATERIAL_RANKS.includes(key)) return "Virtually indestructible (Cap's shield, Mjolnir)";
    const list = KERNEL_MATERIALS[key];
    return list ? list.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ") : "";
  };

  // Character obstacle: prefill from the targeted token (editable)
  const obstacle = _targetedObstacle(targetUuid);

  // Plain rank options with values (for Body Armor and Endurance)
  const enduranceOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    return `<option value="${r}" ${r===autoPopulatedEnd?'selected':''}>${r} (${val})</option>`;
  }).join('');
  
  const armorOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    return `<option value="${r}" ${r===autoPopulatedArmor?'selected':''}>${r} (${val})</option>`;
  }).join('');
  const obstacleArmorOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    return `<option value="${r}" ${r===(obstacle?.armorRank || "Good")?'selected':''}>${r} (${val})</option>`;
  }).join('');
  
  // Material strength options with examples (for obstacles) - default to Good (brick)
  const materialOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    const ex = materialExample(r);
    const example = ex ? ` — ${ex}` : '';
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
          <div style="margin-bottom:4px;font-size:.9em;color:${obstacle ? "#2e7d32" : "#999"};">
            ${obstacle ? `Targeted: <strong>${obstacle.name}</strong> (Body Armor from sheet)` : "No token targeted — enter the defender's Body Armor"}
          </div>
          <div style="margin-bottom:4px;">
            <label>BA Rank:</label>
            <select name="obstacle-armor-rank" style="width:140px;">${obstacleArmorOptions}</select>
          </div>
          <div>
            <label>BA Value:</label>
            <input type="number" name="obstacle-armor-value" value="${obstacle ? obstacle.armorValue : 10}" min="0" style="width:60px;">
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
            selfActorUuid: targetUuid,
            defenderActorUuid: obstacleType === 'character' ? (obstacle?.uuid || "") : "",
            defenderName: obstacleType === 'character' ? (obstacle?.name || "Defender") : ""
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
      
      // Initialize with the targeted defender's value (or the rank's standard)
      if (!obstacle) $armorValue.val(game.msh.getRankValue($armorRank.val()));
      
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
  defenderActorUuid = "",      // optional: the defender if obstacleType is "character"
  defenderName = ""
}) {
  const getVal = (rank) => game.msh.getRankValue(rank) || 0;

  const targetEndVal = getVal(targetEndurance);
  const targetArmorVal = getVal(targetArmor);
  const obstacleDefenseVal = obstacleDefenseValue !== undefined ? obstacleDefenseValue : getVal(obstacleDefense);

  // Kernel: the collision is a charging attack at the slam speed. Damage =
  // max(Endurance, Body Armor) + 2 per area; the obstacle absorbs up to its
  // defense and that amount rebounds through the slammed character's BA.
  const parts = chargeDamageParts({ endurance: targetEndVal, bodyArmor: targetArmorVal, areas: areasMovedThrough });
  const baseDamage = parts.base;
  const speedDamage = parts.speedBonus;
  const totalDamage = parts.total;

  const impact = resolveChargeImpact({ damage: totalDamage, targetDefense: obstacleDefenseVal, attackerDefense: targetArmorVal });
  const absorbedByObstacle = impact.rebound;
  const damageToObstacle = impact.targetTakes;
  const reboundAmount = impact.rebound;
  const damageToTarget = impact.attackerTakes;

  const rebounded = reboundAmount > 0;

  let explanation = "";
  explanation += `Total ${totalDamage} = ${baseDamage} base + ${speedDamage} speed. `;
  explanation += `${rebounded ? `Obstacle absorbs ${absorbedByObstacle} and returns it.` : `Obstacle absorbs ${absorbedByObstacle}.`} `;
  explanation += `${targetName} ${damageToTarget > 0 ? `takes ${damageToTarget} after own BA ${targetArmorVal}. ` : `takes no damage after own BA ${targetArmorVal}. `}`;
  explanation += `${obstacleType === 'character' ? (defenderName || 'Defender') : 'Object'} takes ${damageToObstacle}.`;

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
    defenderActorUuid,
    defenderName
  };
}

async function postCollisionResult(result) {
  const targetLine = `${result.targetName} — Endurance ${result.targetEndurance} (${result.targetEndVal}), Body Armor ${result.targetArmor} (${result.targetArmorVal})`;
  const obstacleLabel = result.obstacleType === "character" ? "Body Armor" : "Material Strength";
  const obstacleLine = `${result.obstacleType === "character" ? (result.defenderName || "Character") : "Object"} — ${obstacleLabel} ${result.obstacleDefense} (${result.obstacleDefenseVal})`;

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
         ${result.obstacleType === "character" ? (result.defenderName || "Defender") : "Object"} takes ${result.damageToObstacle} damage
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
          title="Apply collision damage to ${result.defenderName || "defender"}"
          style="display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;background:#fff;color:#333;cursor:pointer;">
          Apply Damage (${result.defenderName || "Defender"})
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