// File: systems/msh-faserip/scripts/modules/dice/dice-roller.js
// Two-phase karma system per FASERIP rules:
// Phase 1: Declare intent to spend karma BEFORE rolling
// Phase 2: After seeing roll, decide amount (minimum 10 or all remaining)

import { runAsGM } from '../../gm-utils.js';

// Inline debug helper to avoid import issues
function debugLog(...args) {
  try {
    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log("FASERIP DEBUG |", ...args);
    }
  } catch (_) {}
}

/**
 * Get available karma for an actor
 */
export function getAvailableKarma(actor) {
  return actor.system.karma?.availableLifetime 
    || actor.system.attributes?.karma?.value 
    || actor.system.karma?.value 
    || 0;
}

/**
 * Get the minimum karma commitment for an actor
 * Rules: minimum 10, or all remaining if < 10
 */
export function getMinimumKarmaCommitment(actor) {
  const availableKarma = getAvailableKarma(actor);
  if (availableKarma <= 0) return 0;
  return Math.min(10, availableKarma);
}

/**
 * Generate HTML for karma declaration checkbox (Phase 1 - before roll)
 * Just a simple checkbox to declare intent - amount chosen AFTER roll
 */
export function generateKarmaControlsHTML(actor, defaultChecked = false) {
  const availableKarma = getAvailableKarma(actor);
  const minKarma = getMinimumKarmaCommitment(actor);
  
  if (availableKarma <= 0) {
    return `<div style="color: #666; font-size: 0.9em; margin: 8px 0;">No karma available to spend.</div>`;
  }
  
  return `
    <div class="karma-controls" style="margin: 8px 0; padding: 8px; background: #f5f0e0; border: 1px solid #c9b98a; border-radius: 3px;">
      <div style="margin-bottom: 4px;">
        <input type="checkbox" id="spend-karma" name="spendKarma" ${defaultChecked ? 'checked' : ''}>
        <label for="spend-karma" style="font-weight: bold;">Spend Karma on this roll</label>
      </div>
      <div style="font-size: 0.85em; color: #666;">
        Available: ${availableKarma} | Minimum commitment: ${minKarma}
      </div>
      <div style="color: #8b0000; font-size: 0.8em; margin-top: 4px; font-style: italic;">
        ⚠️ You choose the amount AFTER rolling, but must spend at least ${minKarma} once committed.
      </div>
    </div>
  `;
}

/**
 * Setup karma control event handlers (minimal for phase 1)
 */
export function setupKarmaControlHandlers(html) {
  // No complex handlers needed - just a checkbox
}

/**
 * Extract karma declaration from dialog (Phase 1)
 * Only returns whether karma was declared - amount comes in phase 2
 */
export function extractKarmaFromDialog(html) {
  const spendKarma = html.find('#spend-karma').is(':checked');
  return { spendKarma, karmaToSpend: 0 }; // Amount determined in phase 2
}

/**
 * Get CSS color code for a Universal Table result color
 */
function getColorCode(color) {
  const colors = {
    'white': '#666',
    'green': '#2e7d32',
    'yellow': '#f57f17',
    'red': '#c62828'
  };
  return colors[String(color).toLowerCase()] || '#666';
}

/**
 * Get background color for a Universal Table result color
 */
function getColorBg(color) {
  const colors = {
    'white': '#f5f5f5',
    'green': '#e8f5e9',
    'yellow': '#fffde7',
    'red': '#ffebee'
  };
  return colors[String(color).toLowerCase()] || '#f5f5f5';
}

/**
 * Calculate karma needed to reach a specific color on the Universal Table
 */
function calculateKarmaToColor(rollResult, rank, targetColor) {
  const colorHierarchy = { 'white': 0, 'green': 1, 'yellow': 2, 'red': 3 };
  const targetLevel = colorHierarchy[targetColor] || 0;
  
  for (let karma = 1; karma <= 100; karma++) {
    const newResult = rollResult + karma;
    if (newResult > 100) return 999; // Can't exceed 100
    
    const newColor = game.msh.rollUniversalTable(rank, newResult);
    const colorLower = String(newColor || "").toLowerCase();
    const colorLevel = colorHierarchy[colorLower] || 0;
    
    if (colorLevel >= targetLevel) {
      return karma;
    }
  }
  return 999; // Can't achieve
}

/**
 * Show karma decision dialog AFTER rolling (Phase 2)
 * Player sees their roll result and decides how much karma to spend
 * 
 * @param {Actor} actor - The actor spending karma
 * @param {number} rollResult - The d100 roll result
 * @param {string} rank - The rank being rolled against
 * @param {string} sourceName - Description of what the roll is for
 * @param {string} initialColor - The Universal Table color result without karma
 * @returns {Promise<{karmaSpent: number, finalResult: number, finalColor: string}>}
 */
export async function showKarmaDecisionDialog(actor, rollResult, rank, sourceName, initialColor) {
  const availableKarma = getAvailableKarma(actor);
  const minKarma = getMinimumKarmaCommitment(actor);
  const maxUseful = Math.min(availableKarma, 100 - rollResult); // Can't go above 100
  
  // Calculate karma needed to reach each color threshold
  const karmaToGreen = calculateKarmaToColor(rollResult, rank, 'green');
  const karmaToYellow = calculateKarmaToColor(rollResult, rank, 'yellow');
  const karmaToRed = calculateKarmaToColor(rollResult, rank, 'red');
  
  // Build radio button options
  let optionsHtml = '';
  
  // Minimum commitment option (always shown)
  const minResult = Math.min(100, rollResult + minKarma);
  const minColor = game.msh.rollUniversalTable(rank, minResult);
  optionsHtml += `
    <div style="margin: 6px 0; padding: 6px; background: ${getColorBg(minColor)}; border-radius: 3px;">
      <input type="radio" name="karmaChoice" id="karma-min" value="${minKarma}" checked>
      <label for="karma-min">
        <strong>Minimum (${minKarma}):</strong> 
        ${rollResult} + ${minKarma} = ${minResult} → 
        <span style="color: ${getColorCode(minColor)}; font-weight: bold;">${String(minColor).toUpperCase()}</span>
      </label>
    </div>
  `;
  
  // Options to reach specific colors (if achievable and costs more than minimum)
  if (karmaToGreen > minKarma && karmaToGreen <= maxUseful) {
    const result = rollResult + karmaToGreen;
    optionsHtml += `
      <div style="margin: 6px 0; padding: 6px; background: #e8f5e9; border-radius: 3px;">
        <input type="radio" name="karmaChoice" id="karma-green" value="${karmaToGreen}">
        <label for="karma-green">
          <strong>Reach GREEN (${karmaToGreen}):</strong> 
          ${rollResult} + ${karmaToGreen} = ${result} → 
          <span style="color: #2e7d32; font-weight: bold;">GREEN</span>
        </label>
      </div>
    `;
  }
  
  if (karmaToYellow > minKarma && karmaToYellow <= maxUseful && karmaToYellow !== karmaToGreen) {
    const result = rollResult + karmaToYellow;
    optionsHtml += `
      <div style="margin: 6px 0; padding: 6px; background: #fffde7; border-radius: 3px;">
        <input type="radio" name="karmaChoice" id="karma-yellow" value="${karmaToYellow}">
        <label for="karma-yellow">
          <strong>Reach YELLOW (${karmaToYellow}):</strong> 
          ${rollResult} + ${karmaToYellow} = ${result} → 
          <span style="color: #f57f17; font-weight: bold;">YELLOW</span>
        </label>
      </div>
    `;
  }
  
  if (karmaToRed > minKarma && karmaToRed <= maxUseful && karmaToRed !== karmaToYellow) {
    const result = rollResult + karmaToRed;
    optionsHtml += `
      <div style="margin: 6px 0; padding: 6px; background: #ffebee; border-radius: 3px;">
        <input type="radio" name="karmaChoice" id="karma-red" value="${karmaToRed}">
        <label for="karma-red">
          <strong>Reach RED (${karmaToRed}):</strong> 
          ${rollResult} + ${karmaToRed} = ${result} → 
          <span style="color: #c62828; font-weight: bold;">RED</span>
        </label>
      </div>
    `;
  }
  
  // Custom amount option
  optionsHtml += `
    <div style="margin: 10px 0; padding: 8px; border-top: 1px solid #ccc;">
      <input type="radio" name="karmaChoice" id="karma-custom" value="custom">
      <label for="karma-custom"><strong>Custom amount:</strong></label>
      <input type="number" id="karma-custom-amount" min="${minKarma}" max="${maxUseful}" value="${minKarma}" style="width: 60px; margin-left: 8px;" disabled>
      <span style="font-size: 0.85em; color: #666;">(${minKarma} - ${maxUseful})</span>
    </div>
  `;
  
  return new Promise((resolve) => {
    new Dialog({
      title: `Karma Decision: ${sourceName}`,
      content: `
        <div style="background: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px;">
          <div style="padding: 8px 12px; border-bottom: 1px solid #c0c0c0; background: ${getColorBg(initialColor)};">
            <strong>You Rolled: ${rollResult}</strong> → 
            <span style="color: ${getColorCode(initialColor)}; font-weight: bold; font-size: 1.1em;">
              ${String(initialColor).toUpperCase()}
            </span>
            <span style="margin-left: 10px; color: #666;">(vs ${rank})</span>
          </div>
          
          <div style="padding: 12px;">
            <div style="margin-bottom: 12px; padding: 8px; background: #fff3e0; border-left: 4px solid #ff9800; font-size: 0.9em;">
              You declared karma spending. Choose how much to spend.<br>
              <strong>Available:</strong> ${availableKarma} | <strong>Minimum:</strong> ${minKarma}
            </div>
            
            <div class="karma-options">
              ${optionsHtml}
            </div>
          </div>
        </div>
      `,
      buttons: {
        spend: {
          icon: '<i class="fas fa-check"></i>',
          label: "Spend Karma",
          callback: async (html) => {
            let karmaSpent = minKarma;
            const choice = html.find('input[name="karmaChoice"]:checked').val();
            
            if (choice === 'custom') {
              karmaSpent = parseInt(html.find('#karma-custom-amount').val()) || minKarma;
            } else {
              karmaSpent = parseInt(choice) || minKarma;
            }
            
            // Enforce bounds
            karmaSpent = Math.max(minKarma, Math.min(karmaSpent, maxUseful));
            
            const finalResult = Math.min(100, rollResult + karmaSpent);
            const finalColor = game.msh.rollUniversalTable(rank, finalResult);
            
            // Deduct karma
            await deductKarma(actor, karmaSpent, sourceName);
            
            resolve({ karmaSpent, finalResult, finalColor });
          }
        }
      },
      default: "spend",
      render: (html) => {
        // Enable custom input when custom radio selected
        html.find('input[name="karmaChoice"]').on('change', function() {
          const isCustom = html.find('#karma-custom').is(':checked');
          html.find('#karma-custom-amount').prop('disabled', !isCustom);
          if (isCustom) {
            html.find('#karma-custom-amount').focus();
          }
        });
      }
    }).render(true);
  });
}

/**
 * Deduct karma from actor and add history entry
 */
export async function deductKarma(actor, amount, sourceName) {
  if (amount <= 0) return;
  
  debugLog(`Deducting ${amount} karma from ${actor.name} for ${sourceName}`);
  
  const historyEntry = {
    realDate: new Date().toLocaleDateString(),
    gameDate: "",
    amount: -amount,
    type: "Die Roll",
    description: `Spent karma on ${sourceName}`
  };
  
  const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
  const newHistory = currentHistory.concat([historyEntry]);
  
  await runAsGM({
    operation: 'update',
    targetActorUuid: actor.uuid,
    args: [{ "system.karma.history": newHistory }]
  });
  
  // Update displayed current karma
  if (game.msh?.FaseripRolls?._updateCurrentKarma) {
    await game.msh.FaseripRolls._updateCurrentKarma(actor);
  }
}

/**
 * Create a basic d100 roll without karma
 */
export async function rollD100(actor, flavorText = null, showInChat = true) {
  const roll = new Roll("1d100");
  await roll.evaluate();

  if (showInChat) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavorText || `${actor.name} rolls d100`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  return roll;
}

/**
 * Grant daily karma to an actor (adds R+I+P to karma pool)
 */
export async function grantDailyKarma(actor) {
  const reason = actor.system.abilities?.reason?.value || 0;
  const intuition = actor.system.abilities?.intuition?.value || 0;
  const psyche = actor.system.abilities?.psyche?.value || 0;
  const dailyAmount = reason + intuition + psyche;
  
  if (dailyAmount <= 0) {
    ui.notifications.warn(`${actor.name} has no R+I+P to grant as daily karma.`);
    return 0;
  }
  
  const historyEntry = {
    realDate: new Date().toLocaleDateString(),
    gameDate: "",
    amount: dailyAmount,
    type: "Daily Karma",
    description: `Daily karma grant (R${reason} + I${intuition} + P${psyche})`
  };

  const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
  const newHistory = currentHistory.concat([historyEntry]);
  
  await runAsGM({
    operation: 'update',
    targetActorUuid: actor.uuid,
    args: [{ "system.karma.history": newHistory }]
  });

  if (game.msh?.FaseripRolls?._updateCurrentKarma) {
    await game.msh.FaseripRolls._updateCurrentKarma(actor);
  }
  
  ui.notifications.info(`${actor.name} granted ${dailyAmount} daily karma (R+I+P)`);
  
  return dailyAmount;
}

/**
 * LEGACY COMPATIBILITY: Roll d100 and apply karma in one step
 * Used by rolls.js for talent/power/equipment rolls
 * This function supports the two-phase system when rank is provided in options
 * 
 * @param {Actor} actor - The actor making the roll
 * @param {Object} options - Roll configuration
 * @returns {Promise<Object>} - {roll, cappedTotal, karmaUsed}
 */
export async function rollD100AndApplyKarma(actor, options = {}) {
  const {
    spendKarma = false,
    karmaToSpend = 0,
    karma = 0, // Legacy parameter
    sourceName = "Roll",
    rank = null,
    skipDiceDisplay = false,
    flavorText = null
  } = options;

  // Handle legacy karma parameter
  const effectiveKarmaToSpend = karmaToSpend || karma;
  const isSpendingKarma = spendKarma || effectiveKarmaToSpend > 0;

  // Roll the d100
  const roll = new Roll("1d100");
  await roll.evaluate();

  // Display roll if not skipped
  if (!skipDiceDisplay) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavorText || `${actor.name} rolls d100`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  let cappedTotal = roll.total;
  let karmaUsed = 0;

  // If spending karma and we have a rank, use two-phase system
  if (isSpendingKarma && rank) {
    const initialColor = game.msh.rollUniversalTable(rank, roll.total);
    const result = await showKarmaDecisionDialog(actor, roll.total, rank, sourceName, initialColor);
    cappedTotal = result.finalResult;
    karmaUsed = result.karmaSpent;
    // Karma already deducted in showKarmaDecisionDialog
  } 
  // Legacy fallback: direct karma application without dialog
  else if (isSpendingKarma && effectiveKarmaToSpend > 0) {
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    
    // Enforce minimum
    let actualKarma = Math.max(minKarma, effectiveKarmaToSpend);
    actualKarma = Math.min(actualKarma, availableKarma);
    
    cappedTotal = Math.min(100, roll.total + actualKarma);
    karmaUsed = actualKarma;
    
    // Deduct karma
    await deductKarma(actor, karmaUsed, sourceName);
  }

  return { roll, cappedTotal, karmaUsed };
}
