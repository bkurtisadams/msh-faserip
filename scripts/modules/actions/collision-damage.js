// scripts/modules/actions/collision-damage.js

export function openCollisionDamageDialog({ targetName = "Target", targetEndurance = "Good", slamDistance = 1 }) {
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

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

  // Plain rank options with values (for Body Armor)
  const rankOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    return `<option value="${r}" ${r===targetEndurance?'selected':''}>${r} (${val})</option>`;
  }).join('');
  
  // Material strength options with examples (for obstacles)
  const materialOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    const example = MATERIAL_EXAMPLES[r] ? ` — ${MATERIAL_EXAMPLES[r]}` : '';
    return `<option value="${r}">${r} (${val})${example}</option>`;
  }).join('');

  const dlg = new Dialog({
    title: `Collision Damage Calculator — ${targetName}`,
    content: `
      <div style="line-height:1.6;">
        <div style="margin-bottom:12px;padding:8px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
          <strong>Scenario:</strong> ${targetName} was slammed ${slamDistance} area${slamDistance > 1 ? 's' : ''} and hits an obstacle.
          Damage is calculated as a Charging attack.
        </div>

        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:160px;font-weight:bold;">Slammed Character:</label>
        </div>
        
        <div style="margin-bottom:6px;margin-left:20px;">
          <label style="display:inline-block;width:140px;">Name:</label>
          <input type="text" name="target-name" value="${targetName}" readonly style="width:300px;background:#f5f5f5;">
        </div>
        
        <div style="margin-bottom:6px;margin-left:20px;">
          <label style="display:inline-block;width:140px;">Endurance:</label>
          <select name="target-endurance" style="width:200px;">${rankOptions}</select>
        </div>
        
        <div style="margin-bottom:6px;margin-left:20px;">
          <label style="display:inline-block;width:140px;">Body Armor:</label>
          <select name="target-armor" style="width:200px;">${rankOptions}</select>
        </div>

        <div style="margin:16px 0 8px 0;">
          <label style="display:inline-block;width:160px;font-weight:bold;">Obstacle Type:</label>
          <label><input type="radio" name="obstacle-type" value="object" checked> Inanimate Object</label>
          <label style="margin-left:10px;"><input type="radio" name="obstacle-type" value="character"> Character</label>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-left:20px;">
          <div id="obstacle-object-panel" style="padding:8px;border:1px solid #ddd;border-radius:3px;background:#fafafa;">
            <div style="margin-bottom:6px;font-weight:bold;color:#555;">Inanimate Object</div>
            <label style="display:block;margin-bottom:4px;">Material Strength:</label>
            <select name="obstacle-material" style="width:100%;">${materialOptions}</select>
          </div>
          
          <div id="obstacle-character-panel" style="padding:8px;border:1px solid #ddd;border-radius:3px;background:#fafafa;display:none;">
            <div style="margin-bottom:6px;font-weight:bold;color:#555;">Character</div>
            <div style="margin-bottom:6px;">
              <label style="display:block;margin-bottom:4px;">Body Armor Rank:</label>
              <select name="obstacle-armor-rank" style="width:100%;">${rankOptions}</select>
            </div>
            <div style="margin-bottom:6px;">
              <label style="display:block;margin-bottom:4px;">Body Armor Value:</label>
              <input type="number" name="obstacle-armor-value" value="10" min="0" style="width:100px;">
              <div style="font-size:0.85em;color:#666;margin-top:2px;">Edit if non-standard</div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;padding:8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:0.9em;">
          <strong>Charging Damage Rules:</strong>
          <ul style="margin:6px 0 0 0;padding-left:20px;">
            <li>Base damage = max(Endurance, Body Armor)</li>
            <li>Speed damage = 2 × areas traveled (${2 * slamDistance} in this case)</li>
            <li>Total damage = Base + Speed</li>
            <li><strong>If obstacle BA > total damage:</strong> damage rebounds to attacker (minus attacker's BA)</li>
            <li><strong>Otherwise:</strong> attacker takes no damage; obstacle takes (total - obstacle BA)</li>
          </ul>
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
            areasMovedThrough: slamDistance
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
    }
  });
  
  dlg.render(true);
}

function calculateCollisionDamage({ targetName, targetEndurance, targetArmor, obstacleType, obstacleDefense, obstacleDefenseValue, areasMovedThrough }) {
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
  
  // Charging rebound rule: rebound ONLY if obstacle BA STRICTLY GREATER than total damage
  let damageToTarget = 0;
  let damageToObstacle = 0;
  let rebounded = false;
  let explanation = "";
  
  if (obstacleDefenseVal > totalDamage) {
    // Rebound: ALL damage reflects back to attacker
    rebounded = true;
    const reboundAmount = totalDamage;
    
    // Attacker's BA absorbs what it can
    damageToTarget = Math.max(0, reboundAmount - targetArmorVal);
    damageToObstacle = 0;
    
    explanation = `Obstacle BA/Material (${obstacleDefenseVal}) > total damage (${totalDamage}) → all damage rebounds. `;
    if (targetArmorVal > 0) {
      explanation += `${targetName}'s BA (${targetArmorVal}) absorbs some. `;
    }
    explanation += `${targetName} takes ${damageToTarget} damage. Obstacle takes no damage.`;
    
  } else {
    // No rebound: obstacle takes damage (reduced by its BA/material), attacker takes nothing
    rebounded = false;
    damageToTarget = 0;
    damageToObstacle = Math.max(0, totalDamage - obstacleDefenseVal);
    
    explanation = `Total damage (${totalDamage}) ≥ obstacle BA/Material (${obstacleDefenseVal}) → no rebound. `;
    explanation += `${targetName} takes no damage. Obstacle takes ${damageToObstacle} damage.`;
  }
  
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
    explanation
  };
}

async function postCollisionResult(result) {
  const content = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#d32f2f;">
        <strong>Collision Damage — ${result.targetName}</strong>
      </div>
      
      <div style="padding:5px 10px;font-size:0.9em;">
        <div style="margin-bottom:8px;">
          <strong>Slammed Character:</strong> ${result.targetName}<br>
          Endurance: ${result.targetEndurance} (${result.targetEndVal}), Body Armor: ${result.targetArmor} (${result.targetArmorVal})
        </div>
        
        <div style="margin-bottom:8px;">
          <strong>Obstacle:</strong> ${result.obstacleType === 'character' ? 'Character' : 'Object'}<br>
          ${result.obstacleType === 'character' ? 'Body Armor' : 'Material Strength'}: ${result.obstacleDefense} (${result.obstacleDefenseVal})
        </div>
        
        <div style="margin-bottom:8px;">
          <strong>Distance:</strong> ${result.areasMovedThrough} area${result.areasMovedThrough > 1 ? 's' : ''}
        </div>
        
        <hr style="margin:8px 0;">
        
        <div style="margin-bottom:4px;"><strong>Damage Calculation:</strong></div>
        <div style="margin-left:12px;margin-bottom:4px;">Base: ${result.baseDamage} (max of END/BA)</div>
        <div style="margin-left:12px;margin-bottom:4px;">Speed: +${result.speedDamage} (2 × ${result.areasMovedThrough} areas)</div>
        <div style="margin-left:12px;font-weight:bold;">Total: ${result.totalDamage} points</div>
        
        <hr style="margin:8px 0;">
        
        <div style="padding:8px;background:#fff9c4;border:1px solid #f57c00;border-radius:3px;margin-bottom:8px;">
          ${result.explanation}
        </div>
        
        ${result.rebounded ? `
          <div style="background:#ffebee;padding:8px;border:1px solid #ef5350;border-radius:3px;text-align:center;font-weight:bold;">
            💥 ${result.targetName} takes ${result.damageToTarget} damage (rebounded)
          </div>
        ` : `
          <div style="background:#e8f5e9;padding:8px;border:1px solid #4CAF50;border-radius:3px;text-align:center;font-weight:bold;">
            ✓ ${result.targetName} takes no damage
          </div>
          ${result.damageToObstacle > 0 ? `
            <div style="margin-top:8px;padding:6px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
              Obstacle takes ${result.damageToObstacle} damage
            </div>
          ` : ''}
        `}
      </div>
    </div>
  `;
  
  await ChatMessage.create({ content });
}