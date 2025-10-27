// scripts/modules/combat/damage-resolution.js
/**
 * Combat damage resolution for Slam, Stun, and Kill effects
 * Extracted from charge-damage.js and consolidated for reusability
 */

/**
 * Calculate Grand Slam knockback distance based on attacker's Strength
 * FASERIP Rule: Target is knocked away with speed equal to Strength as ground speed
 * @param {number} strengthValue - Attacker's Strength rank value
 * @returns {number} - Distance in areas
 */
import { rollUniversalTable } from "../dice/universal-table.js";
export function getGrandSlamDistance(strengthValue) {
  // Convert strength value to areas for knockback
  if (strengthValue >= 100) return 10; // Unearthly and above
  if (strengthValue >= 75) return 9;   // Monstrous
  if (strengthValue >= 50) return 8;   // Amazing
  if (strengthValue >= 40) return 7;   // Incredible
  if (strengthValue >= 30) return 6;   // Remarkable
  if (strengthValue >= 20) return 5;   // Excellent
  if (strengthValue >= 10) return 4;   // Good
  if (strengthValue >= 6) return 3;    // Typical
  if (strengthValue >= 4) return 2;    // Poor
  if (strengthValue >= 2) return 1;    // Feeble
  return 0; // Shift-0
}

/**
 * Resolve Slam effect via Endurance FEAT
 * Target rolls Endurance FEAT on Universal Table to determine slam outcome
 * 
 * @param {Object} options - Slam resolution options
 * @param {string} options.targetEnduranceRank - Target's Endurance rank name
 * @param {number} options.targetEnduranceValue - Target's Endurance rank value
 * @param {number} options.attackerStrength - Attacker's Strength value (for Grand Slam distance)
 * @param {number} options.penetratingDamage - Damage that got through armor
 * @param {number} [options.roll] - Optional pre-rolled d100 value (for testing/manual mode)
 * @returns {Object} Slam resolution results
 *   - canApply: boolean - Whether effect can apply
 *   - effect: string - "No Slam" | "Stagger" | "1 Area" | "Grand Slam"
 *   - roll: number - The d100 roll
 *   - colorResult: string - "white" | "green" | "yellow" | "red"
 *   - knockbackDistance: number - Distance in areas
 *   - description: string - Human-readable description
 */
export function resolveSlamFeat(options) {
  const {
    targetEnduranceRank = "Typical",
    targetEnduranceValue = 6,
    attackerStrength = 0,
    penetratingDamage = 0,
    roll = null
  } = options;

  // Check if effect can apply (must deal damage per FASERIP rules)
  // Note: Martial Arts A/D bypass this - handle in action logic or manual mode
  if (penetratingDamage <= 0) {
    return {
      canApply: false,
      reason: "No penetrating damage - effect does not apply",
      effect: "No Slam",
      knockbackDistance: 0
    };
  }

  // Roll or use provided roll
  const diceRoll = roll ?? Math.ceil(Math.random() * 100);
  
  // Lookup result on Universal Table
  const colorResult = game.msh?.rollUniversalTable(targetEnduranceRank, diceRoll) || 'white';

  let effect;
  let knockbackDistance = 0;
  let description = "";

  switch (colorResult.toLowerCase()) {
    case 'white':
      effect = 'No Slam';
      description = 'Target is not affected by the slam. Takes damage as for a normal hit.';
      break;
    case 'green':
      effect = 'Stagger';
      description = 'Target is knocked back a step or two, no longer adjacent to attacker.';
      break;
    case 'yellow':
      effect = '1 Area';
      knockbackDistance = 1;
      description = 'Target is knocked 1 area away.';
      break;
    case 'red':
      effect = 'Grand Slam';
      knockbackDistance = getGrandSlamDistance(attackerStrength);
      description = `Target is knocked away ${knockbackDistance} areas (attacker's strength as ground speed).`;
      break;
  }

  return {
    canApply: true,
    effect,
    roll: diceRoll,
    colorResult,
    knockbackDistance,
    description
  };
}

/**
 * Resolve Stun effect via Endurance FEAT
 * Target rolls Endurance FEAT on Universal Table to determine stun outcome
 * 
 * @param {Object} options - Stun resolution options
 * @param {string} options.targetEnduranceRank - Target's Endurance rank name
 * @param {number} options.targetEnduranceValue - Target's Endurance rank value
 * @param {number} options.penetratingDamage - Damage that got through armor
 * @param {number} [options.roll] - Optional pre-rolled d100 value (for testing/manual mode)
 * @returns {Object} Stun resolution results
 *   - canApply: boolean - Whether effect can apply
 *   - effect: string - "1-10 rounds" | "1 round" | "No effect"
 *   - roll: number - The d100 roll
 *   - colorResult: string - "white" | "green" | "yellow" | "red"
 *   - stunDuration: number - Duration in rounds (0 = no effect)
 *   - description: string - Human-readable description
 */
export function resolveStunFeat(options) {
  const {
    targetEnduranceRank = "Typical",
    targetEnduranceValue = 6,
    penetratingDamage = 0,
    roll = null
  } = options;

  // Check if effect can apply (must deal damage per FASERIP rules)
  // Note: Martial Arts A/D bypass this - handle in action logic or manual mode
  if (penetratingDamage <= 0) {
    return {
      canApply: false,
      reason: "No penetrating damage - effect does not apply",
      effect: "No effect",
      stunDuration: 0
    };
  }

  // Roll or use provided roll
  const diceRoll = roll ?? Math.ceil(Math.random() * 100);
  
  // Lookup result on Universal Table
  const colorResult = game.msh?.rollUniversalTable(targetEnduranceRank, diceRoll) || 'white';

  let effect;
  let stunDuration = 0;
  let description = "";

  switch (colorResult.toLowerCase()) {
    case 'white':
      effect = '1-10 rounds';
      stunDuration = Math.ceil(Math.random() * 10); // Roll 1d10
      description = `Knocked out for ${stunDuration} rounds. May take no actions.`;
      break;
    case 'green':
      effect = '1 round';
      stunDuration = 1;
      description = 'Knocked down for 1 round. May take no action next round.';
      break;
    case 'yellow':
    case 'red':
      effect = 'No effect';
      stunDuration = 0;
      description = 'Not affected by the stun result.';
      break;
  }

  return {
    canApply: true,
    effect,
    roll: diceRoll,
    colorResult,
    stunDuration,
    description
  };
}

/**
 * Async version of resolveSlamFeat that creates a Foundry Roll and posts to chat
 * Useful for interactive resolution via chat buttons
 * 
 * @param {Actor} target - Target actor making the endurance feat
 * @param {number} attackerStrength - Attacker's strength for grand slam distance
 * @returns {Promise<Object>} Slam resolution results with roll object
 */
export async function resolveSlamFeatWithRoll(target, attackerStrength = 0) {
  const enduranceRank = target.system?.abilities?.endurance?.rank || "Typical";
  const enduranceValue = target.system?.abilities?.endurance?.value || 6;

  // Create and roll a Foundry Roll object
  const roll = new Roll("1d100");
  await roll.evaluate({async: true});
  await roll.toMessage({
    flavor: `Slam Endurance FEAT: ${target.name} (${enduranceRank})`
  });

  // Use the synchronous function with the roll result
  const result = resolveSlamFeat({
    targetEnduranceRank: enduranceRank,
    targetEnduranceValue: enduranceValue,
    attackerStrength,
    penetratingDamage: 1, // Assume damage if we're rolling
    roll: roll.total
  });

  return {
    ...result,
    rollObject: roll
  };
}

/**
 * Async version of resolveStunFeat that creates a Foundry Roll and posts to chat
 * Useful for interactive resolution via chat buttons
 * 
 * @param {Actor} target - Target actor making the endurance feat
 * @returns {Promise<Object>} Stun resolution results with roll object
 */
export async function resolveStunFeatWithRoll(target) {
  const enduranceRank = target.system?.abilities?.endurance?.rank || "Typical";
  const enduranceValue = target.system?.abilities?.endurance?.value || 6;

  // Create and roll a Foundry Roll object
  const roll = new Roll("1d100");
  await roll.evaluate({async: true});
  await roll.toMessage({
    flavor: `Stun Endurance FEAT: ${target.name} (${enduranceRank})`
  });

  // Use the synchronous function with the roll result
  const result = resolveStunFeat({
    targetEnduranceRank: enduranceRank,
    targetEnduranceValue: enduranceValue,
    penetratingDamage: 1, // Assume damage if we're rolling
    roll: roll.total
  });

  return {
    ...result,
    rollObject: roll
  };
}