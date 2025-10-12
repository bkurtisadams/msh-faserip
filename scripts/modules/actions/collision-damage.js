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
          <label style="display:inline-block;width:160px;font-weight:bold;">Target (slammed character):</label>
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
          <label style="display:inline-block;width:160px;font-weight:bold;">Obstacle:</label>
        </div>
        
        <div style="margin-bottom:6px;margin-left:20px;">
          <label style="display:inline-block;width:140px;">Type:</label>
          <label><input type="radio" name="obstacle-type" value="character" checked> Character</label>
          <label style="margin-left:10px;"><input type="radio" name="obstacle-type" value="object"> Inanimate Object</label>
        </div>
        
        <div id="obstacle-character-row" style="margin-left:20px;">
          <div style="margin-bottom:6px;">
            <label style="display:inline-block;width:140px;">Body Armor Rank:</label>
            <select name="obstacle-armor-rank" style="width:200px;">${rankOptions}</select>
          </div>
          <div style="margin-bottom:6px;">
            <label style="display:inline-block;width:140px;">Body Armor Value:</label>
            <input type="number" name="obstacle-armor-value" value="10" min="0" style="width:100px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">Edit if non-standard armor</span>
          </div>
        </div>
        
        <div id="obstacle-object-row" style="display:none;margin-bottom:6px;margin-left:20px;">
          <label style="display:inline-block;width:140px;">Material Strength:</label>
          <select name="obstacle-material" style="width:500px;">${materialOptions}</select>
        </div>

        <div style="margin-top:16px;padding:8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:0.9em;">
          <strong>Charging Damage Rules:</strong>
          <ul style="margin:6px 0 0 0;padding-left:20px;">
            <li>Base damage = max(Endurance, Body Armor)</li>
            <li>Speed damage = 2 × areas traveled (${2 * slamDistance} in this case)</li>
            <li>If defender's armor > damage: rebound to attacker</li>
            <li>If attacker's armor > rebound: no damage to either</li>
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
      const $charRow = html.find('#obstacle-character-row');
      const $objRow = html.find('#obstacle-object-row');
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
      
      html.find('[name="obstacle-type"]').on('change', () => {
        const type = html.find('[name="obstacle-type"]:checked').val();
        if (type === 'character') {
          $charRow.show();
          $objRow.hide();
        } else {
          $charRow.hide();
          $objRow.show();
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
  
  // Use provided value if available, otherwise look it up
  const obstacleDefenseVal = obstacleDefenseValue !== undefined ? obstacleDefenseValue : getVal(obstacleDefense);
  
  // Base damage = max(Endurance, Body Armor)
  const baseDamage = Math.max(targetEndVal, targetArmorVal);
  
  // Speed damage = 2 × areas
  const speedDamage = 2 * areasMovedThrough;
  
  // Total damage before armor
  const totalDamage = baseDamage + speedDamage;
  
  // Check if defender's armor rebounds damage
  let damageToTarget = totalDamage;
  let damageToObstacle = 0;
  let reboundDamage = 0;
  let finalDamageToTarget = totalDamage;
  
  if (obstacleDefenseVal > totalDamage) {
    // Damage is rebounded
    reboundDamage = totalDamage;
    damageToObstacle = 0;
    
    // Check if target's armor absorbs rebound
    if (targetArmorVal >= reboundDamage) {
      finalDamageToTarget = 0;
    } else {
      finalDamageToTarget = reboundDamage - targetArmorVal;
    }
  } else {
    // Obstacle takes some damage, target continues
    damageToObstacle = totalDamage - obstacleDefenseVal;
    finalDamageToTarget = 0; // Target doesn't take damage if obstacle yields
  }
  
  return {
    targetName,
    targetEndurance,
    targetArmor,
    obstacleType,
    obstacleDefense,
    areasMovedThrough,
    baseDamage,
    speedDamage,
    totalDamage,
    obstacleDefenseVal,
    reboundDamage,
    finalDamageToTarget,
    damageToObstacle
  };
}

async function postCollisionResult(result) {
  const content = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#d32f2f;">
        <strong>Collision Damage — ${result.targetName}</strong>
      </div>
      
      <div style="padding:5px 10px;font-size:0.9em;">
        <div style="margin-bottom:8px;"><strong>Target:</strong> ${result.targetName} (END: ${result.targetEndurance}, Armor: ${result.targetArmor})</div>
        <div style="margin-bottom:8px;"><strong>Obstacle:</strong> ${result.obstacleType === 'character' ? 'Character' : 'Object'} (Defense: ${result.obstacleDefense} = ${result.obstacleDefenseVal})</div>
        <div style="margin-bottom:8px;"><strong>Distance Slammed:</strong> ${result.areasMovedThrough} area${result.areasMovedThrough > 1 ? 's' : ''}</div>
        
        <hr style="margin:8px 0;">
        
        <div><strong>Base Damage:</strong> ${result.baseDamage} (max of Endurance ${game.msh.getRankValue(result.targetEndurance)}, Armor ${game.msh.getRankValue(result.targetArmor)})</div>
        <div><strong>Speed Damage:</strong> ${result.speedDamage} (2 × ${result.areasMovedThrough} areas)</div>
        <div><strong>Total Damage:</strong> ${result.totalDamage}</div>
        <div><strong>Obstacle Defense:</strong> ${result.obstacleDefenseVal}</div>
        
        <hr style="margin:8px 0;">
        
        ${result.reboundDamage > 0 ? `
          <div style="color:#d32f2f;font-weight:bold;margin-bottom:6px;">
            ⚠ Obstacle defense (${result.obstacleDefenseVal}) > damage (${result.totalDamage}) → Rebound!
          </div>
          <div><strong>Rebound Damage:</strong> ${result.reboundDamage}</div>
          <div><strong>Target Armor Absorbs:</strong> ${game.msh.getRankValue(result.targetArmor)}</div>
          <div style="background:#ffebee;padding:6px;margin-top:6px;border:1px solid #ef5350;border-radius:3px;">
            <strong>💥 ${result.targetName} takes ${result.finalDamageToTarget} damage</strong>
          </div>
        ` : `
          <div style="background:#e8f5e9;padding:6px;margin-top:6px;border:1px solid #4CAF50;border-radius:3px;">
            <strong>✓ Obstacle yields — ${result.targetName} takes no damage</strong>
            ${result.damageToObstacle > 0 ? `<div>Obstacle takes ${result.damageToObstacle} damage</div>` : ''}
          </div>
        `}
      </div>
    </div>
  `;
  
  await ChatMessage.create({ content });
}