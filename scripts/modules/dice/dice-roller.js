// File: systems/msh-faserip/scripts/modules/dice/dice-roller.js

import { runAsGM } from '../../gm-utils.js';

/**
 * Roll d100 and apply karma spending
 * @param {Actor} actor - The actor making the roll
 * @param {Object} options - Roll configuration
 * @param {number} options.karma - Amount of karma to spend (0-50)
 * @param {string} options.sourceName - Name of the power/talent/etc for history
 * @param {boolean} options.skipDiceDisplay - If true, don't show roll in chat
 * @param {string} options.flavorText - Flavor text for the roll display
 * @returns {Promise<Object>} - {roll, cappedTotal, karmaUsed, dailyKarmaUsed, lifetimeKarmaUsed}
 */
export async function rollD100AndApplyKarma(actor, options = {}) {
  const {
    karma = 0,
    sourceName = "Roll",
    skipDiceDisplay = false,
    flavorText = null
  } = options;

  // Create and evaluate the d100 roll
  const roll = new Roll("1d100");
  await roll.evaluate();

  // Display the dice roll with flavor text if not skipped
  if (!skipDiceDisplay) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavorText || `${actor.name} rolls d100`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  // Initialize karma tracking
  let cappedTotal = roll.total;
  let karmaUsed = 0;
  let dailyKarmaUsedAmount = 0;
  let lifetimeKarmaUsedAmount = 0;

  // Apply karma if any was specified
  if (karma > 0) {
    const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");

    if (dailyKarmaEnabled && actor.system.karma.dailyKarmaUsed < actor.system.karma.dailyKarmaMax) {
      // Try to use daily karma first
      const dailyKarmaRemaining = actor.system.karma.dailyKarmaMax - actor.system.karma.dailyKarmaUsed;
      const karmaFromDaily = Math.min(karma, dailyKarmaRemaining);
      
      dailyKarmaUsedAmount = karmaFromDaily;
      karmaUsed += karmaFromDaily;

      // Update daily karma usage
      await runAsGM({
        operation: 'update',
        targetActorUuid: actor.uuid,
        args: [{ "system.karma.dailyKarmaUsed": actor.system.karma.dailyKarmaUsed + dailyKarmaUsedAmount }]
      });

      // If karma request exceeds daily karma, use lifetime karma for the rest
      const remainingKarmaToSpend = karma - karmaFromDaily;
      if (remainingKarmaToSpend > 0) {
        cappedTotal = Math.min(100, roll.total + remainingKarmaToSpend);
        lifetimeKarmaUsedAmount = cappedTotal - roll.total;
        karmaUsed += lifetimeKarmaUsedAmount;
      } else {
        cappedTotal = Math.min(100, roll.total + karmaFromDaily);
      }
    } else {
      // No daily karma enabled or daily karma depleted - use lifetime karma
      cappedTotal = Math.min(100, roll.total + karma);
      lifetimeKarmaUsedAmount = cappedTotal - roll.total;
      karmaUsed = lifetimeKarmaUsedAmount;
    }
  }

  // Build karma history entries
  const historyUpdates = [];
  if (dailyKarmaUsedAmount > 0) {
    historyUpdates.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -dailyKarmaUsedAmount,
      type: "Daily Roll",
      description: `Spent daily karma on ${sourceName}`
    });
  }
  if (lifetimeKarmaUsedAmount > 0) {
    historyUpdates.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -lifetimeKarmaUsedAmount,
      type: "Die Roll",
      description: `Spent lifetime karma on ${sourceName}`
    });
  }

  // Update karma history if there were any karma expenditures
  if (historyUpdates.length > 0) {
    const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
    const newHistory = currentHistory.concat(historyUpdates);
    
    await runAsGM({
      operation: 'update',
      targetActorUuid: actor.uuid,
      args: [{ "system.karma.history": newHistory }]
    });

    // Update displayed current karma (assuming this method exists on FaseripRolls)
    if (game.msh?.FaseripRolls?._updateCurrentKarma) {
      await game.msh.FaseripRolls._updateCurrentKarma(actor);
    }
  }

  return {
    roll,
    cappedTotal,
    karmaUsed,
    dailyKarmaUsed: dailyKarmaUsedAmount,
    lifetimeKarmaUsed: lifetimeKarmaUsedAmount
  };
}

/**
 * Create a basic d100 roll without karma (for simple rolls)
 * @param {Actor} actor - The actor making the roll
 * @param {string} flavorText - Optional flavor text
 * @param {boolean} showInChat - Whether to display in chat
 * @returns {Promise<Roll>} - The evaluated roll
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
