// scripts/modules/actions/entangling-action.js
import { rollUniversalTable } from "../dice/universal-table.js";

/**
 * Handle entangling weapon mechanics
 * Called after a successful hit with an entangling weapon
 */
export async function processEntanglingHit({ 
  attacker, 
  target, 
  weapon,
  weaponMaterialStrength = "Typical" 
}) {
  
  if (!target) {
    ui.notifications.warn("No target for entangling check");
    return { entangled: false };
  }

  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  // Get target's Agility
  const targetAgility = target.system?.abilities?.agility?.rank || "Typical";
  const targetAgilityValue = target.system?.abilities?.agility?.value || 6;

  // Show dialog for the entangle check
  const dlg = new Dialog({
    title: `Entangling Check - ${target.name}`,
    content: `
      <div style="line-height:1.4;">
        <div style="padding:8px; background:#e3f2fd; border:1px solid #2196f3; border-radius:3px; margin-bottom:10px;">
          <strong>${attacker.name}'s ${weapon.name} hit ${target.name}!</strong>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Target (${target.name}):</label>
          <strong>Agility ${targetAgility} (${targetAgilityValue})</strong>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Weapon Material Strength:</label>
          <strong>${weaponMaterialStrength}</strong>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Target Column Shift:</label>
          <input type="number" name="targetShift" value="0" style="width:60px;">
          <span style="color:#666; font-size:0.9em;">(+ right, - left)</span>
        </div>

        <div style="font-size:0.85em; color:#555; margin-top:10px; padding:8px; background:#fff3e0; border:1px solid #ff9800; border-radius:3px;">
          <strong>⚠ Entangling Rule:</strong>
          <ul style="margin:4px 0 0 20px; padding:0;">
            <li>Target rolls Agility FEAT vs weapon's Material Strength</li>
            <li><strong>Green or better:</strong> Target avoids entanglement</li>
            <li><strong>White:</strong> Target is enmeshed</li>
            <li>Enmeshed targets can escape via Strength FEAT (break bonds) or special abilities</li>
          </ul>
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll Entangle Check",
        callback: async (html) => {
          const targetShift = parseInt(html.find('[name="targetShift"]').val()) || 0;
          
          // Apply column shifts to target's agility
          let effectiveAgility = targetAgility;
          if (targetShift !== 0) {
            const currentIndex = RANKS.indexOf(targetAgility);
            const newIndex = Math.max(0, Math.min(RANKS.length - 1, currentIndex + targetShift));
            effectiveAgility = RANKS[newIndex];
          }

          // Roll d100
          const roll = new Roll("1d100");
          await roll.evaluate();

          // Check result on Universal Table
          const color = rollUniversalTable(effectiveAgility, roll.total);
          const entangled = (color.toLowerCase() === "white");

          // Create result message
          const content = `
            <div style="background-color:#f5f5f0; border:1px solid #c0c0c0; border-radius:3px; margin-bottom:5px;">
              <div style="padding:5px 10px; border-bottom:1px solid #c0c0c0; font-size:1.1em; color:#8b0000;">
                <strong>${target.name} — Entangling Check</strong>
              </div>
              <div style="padding:5px 10px; font-size:0.9em;">
                <div><strong>Weapon:</strong> ${weapon.name} (${weaponMaterialStrength})</div>
                <div><strong>Target Agility:</strong> ${targetAgility} ${targetShift !== 0 ? `→ ${effectiveAgility}` : ''}</div>
                <div><strong>Roll:</strong> ${roll.total} → ${color.toUpperCase()}</div>
              </div>
              <div style="text-align:center; padding:8px; margin:5px; font-weight:bold; font-size:1.1em; border-radius:3px;
                          background-color:${entangled ? '#F44336' : '#4CAF50'}; color:white;">
                ${entangled ? '🕸️ ENTANGLED!' : '✓ AVOIDED ENTANGLEMENT'}
              </div>
              ${entangled ? `
                <div style="padding:5px 10px; font-size:0.85em; background:#ffebee; border-top:1px solid #c0c0c0;">
                  <strong>Escape Options:</strong>
                  <ul style="margin:4px 0; padding-left:20px;">
                    <li>Strength FEAT vs ${weaponMaterialStrength} to break bonds</li>
                    <li>Special abilities (slipping, intangibility, etc.)</li>
                  </ul>
                </div>
              ` : ''}
            </div>
          `;

          // Display the roll
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            flavor: `${target.name} — Entangling Defense`
          });

          // Display the result
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            content
          });

          // If entangled, create an Active Effect
          if (entangled) {
            await applyEntangledEffect(target, weapon, weaponMaterialStrength);
          }

          return { entangled, color };
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  });

  return new Promise((resolve) => {
    dlg.render(true);
    // Resolve when dialog closes
    dlg.close = function() {
      Dialog.prototype.close.call(this);
      resolve({ cancelled: true });
    };
  });
}

/**
 * Apply "Entangled" active effect to target
 */
async function applyEntangledEffect(target, weapon, materialStrength) {
  const effectData = {
    name: `Entangled (${weapon.name})`,
    icon: "icons/svg/net.svg",
    origin: weapon.uuid,
    flags: {
      "msh-faserip": {
        entangling: true,
        weaponName: weapon.name,
        materialStrength: materialStrength,
        escapeMethod: "strength-feat"
      }
    },
    changes: [
      {
        key: "system.movement.run",
        mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
        value: "0"
      }
    ]
  };

  await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
  
  ui.notifications.info(`${target.name} is entangled by ${weapon.name}!`);
}

/**
 * Dialog for attempting to escape entanglement
 */
export async function attemptEscapeEntanglement(actor) {
  // Find entangled effects
  const entangledEffects = actor.effects.filter(e => 
    e.flags?.["msh-faserip"]?.entangling === true
  );

  if (entangledEffects.length === 0) {
    ui.notifications.warn(`${actor.name} is not entangled.`);
    return;
  }

  // For simplicity, handle first entanglement
  const effect = entangledEffects[0];
  const weaponName = effect.flags["msh-faserip"]?.weaponName || "Unknown";
  const materialStrength = effect.flags["msh-faserip"]?.materialStrength || "Typical";

  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  const actorStrength = actor.system?.abilities?.strength?.rank || "Typical";

  const dlg = new Dialog({
    title: `Escape Entanglement - ${actor.name}`,
    content: `
      <div style="line-height:1.4;">
        <div style="padding:8px; background:#ffebee; border:1px solid #f44336; border-radius:3px; margin-bottom:10px;">
          <strong>${actor.name} is entangled by ${weaponName}!</strong>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Your Strength:</label>
          <strong>${actorStrength}</strong>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Material Strength:</label>
          <strong>${materialStrength}</strong>
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Column Shift:</label>
          <input type="number" name="shift" value="0" style="width:60px;">
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:180px;">Karma Points:</label>
          <input type="number" name="karma" value="0" min="0" style="width:60px;">
        </div>

        <div style="font-size:0.85em; color:#555; margin-top:10px; padding:8px; background:#fff3e0; border:1px solid #ff9800; border-radius:3px;">
          <strong>Escape Rule:</strong> Roll Strength FEAT vs Material Strength. 
          Green or better = escape successful.
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Attempt Escape",
        callback: async (html) => {
          const shift = parseInt(html.find('[name="shift"]').val()) || 0;
          const karma = parseInt(html.find('[name="karma"]').val()) || 0;

          // Apply column shifts
          let effectiveStrength = actorStrength;
          if (shift !== 0) {
            const currentIndex = RANKS.indexOf(actorStrength);
            const newIndex = Math.max(0, Math.min(RANKS.length - 1, currentIndex + shift));
            effectiveStrength = RANKS[newIndex];
          }

          // Roll d100 with karma
          const roll = new Roll("1d100");
          await roll.evaluate();
          const cappedTotal = Math.min(100, roll.total + karma);
          const karmaUsed = cappedTotal - roll.total;

          // Update karma if used
          if (karmaUsed > 0) {
            const history = foundry.utils.deepClone(actor.system.karma?.history || []);
            history.push({
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -karmaUsed,
              type: "Escape Entanglement",
              description: `Escaping ${weaponName}`
            });
            await actor.update({ "system.karma.history": history });
          }

          // Check result
          const color = rollUniversalTable(effectiveStrength, cappedTotal);
          const escaped = (color.toLowerCase() !== "white");

          // Display roll
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor.name} — Escape Entanglement`
          });

          // Display result
          const content = `
            <div style="background-color:#f5f5f0; border:1px solid #c0c0c0; border-radius:3px; margin-bottom:5px;">
              <div style="padding:5px 10px; border-bottom:1px solid #c0c0c0; font-size:1.1em; color:#8b0000;">
                <strong>${actor.name} — Escape Attempt</strong>
              </div>
              <div style="padding:5px 10px; font-size:0.9em;">
                <div><strong>Entangled By:</strong> ${weaponName} (${materialStrength})</div>
                <div><strong>Strength:</strong> ${actorStrength} ${shift !== 0 ? `→ ${effectiveStrength}` : ''}</div>
                <div><strong>Roll:</strong> ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
                <div><strong>Result:</strong> ${color.toUpperCase()}</div>
              </div>
              <div style="text-align:center; padding:8px; margin:5px; font-weight:bold; font-size:1.1em; border-radius:3px;
                          background-color:${escaped ? '#4CAF50' : '#F44336'}; color:white;">
                ${escaped ? '✓ ESCAPED!' : '❌ STILL ENTANGLED'}
              </div>
            </div>
          `;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });

          // Remove effect if escaped
          if (escaped) {
            await effect.delete();
            ui.notifications.info(`${actor.name} broke free!`);
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  });

  dlg.render(true);
}