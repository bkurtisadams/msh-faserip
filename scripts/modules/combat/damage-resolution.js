// scripts/modules/combat/damage-resolution.js v1.2.0 - 2026-04-17
// v1.2.0: Fix getGrandSlamDistance thresholds — use rank RANGE MINIMUMS
//         (Good=8, Excellent=16, Remarkable=26, ...) instead of rank-value
//         midpoints (Good=10, Excellent=20, ...). Prior version reported
//         one rank too low for any Strength value below its rank's midpoint:
//         e.g. Str 8 (low Good) gave Typical's 3 instead of Good's 4,
//         Str 16 (low Excellent) gave Good's 4 instead of Excellent's 5.
// v1.1.0: getGrandSlamDistance reads GRAND_SLAM_AREAS canonical table from
//         rules-reference.js. Adds Class 1000 (32), Class 3000 (50),
//         Class 5000 (100), Beyond (100) — previously capped at Shift-Z (16).
/**
 * Combat damage resolution for Slam, Stun, and Kill effects
 * Extracted from charge-damage.js and consolidated for reusability
 */

import { rollUniversalTable } from "../dice/universal-table.js";
import { GRAND_SLAM_AREAS, RANK_RANGES } from "../../rules/rules-reference.js";

/**
 * Calculate Grand Slam knockback distance based on attacker's Strength.
 * Per RAW: "Target is knocked away with a speed equal to the Strength of
 * the attacker taken as ground speed." Values from GRAND_SLAM_AREAS in
 * rules-reference.js (expanded Strength-as-velocity scale, distinct from
 * the basic MOVEMENT.groundSpeed table).
 *
 * Thresholds are the MINIMUM of each rank's range per RANK_RANGES, so a
 * Strength of 8 (low end of Good) correctly reports Good's distance and
 * not Typical's. Walked high-to-low so the first match wins.
 *
 * @param {number} strengthValue - Attacker's Strength rank value
 * @returns {number} - Distance in areas
 */
export function getGrandSlamDistance(strengthValue) {
  const v = Number(strengthValue) || 0;
  if (v >= 10000)                       return GRAND_SLAM_AREAS["Beyond"];
  if (v >= 5000)                        return GRAND_SLAM_AREAS["Class 5000"];
  if (v >= 3000)                        return GRAND_SLAM_AREAS["Class 3000"];
  if (v >= 1000)                        return GRAND_SLAM_AREAS["Class 1000"];
  if (v >= RANK_RANGES["Shift-Z"][0])    return GRAND_SLAM_AREAS["Shift-Z"];     // 351
  if (v >= RANK_RANGES["Shift-Y"][0])    return GRAND_SLAM_AREAS["Shift-Y"];     // 176
  if (v >= RANK_RANGES["Shift-X"][0])    return GRAND_SLAM_AREAS["Shift-X"];     // 126
  if (v >= RANK_RANGES["Unearthly"][0])  return GRAND_SLAM_AREAS["Unearthly"];   // 88
  if (v >= RANK_RANGES["Monstrous"][0])  return GRAND_SLAM_AREAS["Monstrous"];   // 63
  if (v >= RANK_RANGES["Amazing"][0])    return GRAND_SLAM_AREAS["Amazing"];     // 46
  if (v >= RANK_RANGES["Incredible"][0]) return GRAND_SLAM_AREAS["Incredible"];  // 36
  if (v >= RANK_RANGES["Remarkable"][0]) return GRAND_SLAM_AREAS["Remarkable"];  // 26
  if (v >= RANK_RANGES["Excellent"][0])  return GRAND_SLAM_AREAS["Excellent"];   // 16
  if (v >= RANK_RANGES["Good"][0])       return GRAND_SLAM_AREAS["Good"];        // 8
  if (v >= RANK_RANGES["Typical"][0])    return GRAND_SLAM_AREAS["Typical"];     // 5
  if (v >= RANK_RANGES["Poor"][0])       return GRAND_SLAM_AREAS["Poor"];        // 3
  if (v >= RANK_RANGES["Feeble"][0])     return GRAND_SLAM_AREAS["Feeble"];      // 1
  return GRAND_SLAM_AREAS["Shift-0"];
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
      effect = 'Grand Slam';
      knockbackDistance = getGrandSlamDistance(attackerStrength);
      description = `Target is knocked away ${knockbackDistance} areas (attacker's strength as ground speed).`;
      break;
    case 'green':
      effect = '1 Area';
      knockbackDistance = 1;
      description = 'Target is knocked 1 area away.';
      break;
    case 'yellow':
      effect = 'Stagger';
      description = 'Target is knocked back a step or two, no longer adjacent to attacker.';
      break;
    case 'red':
      effect = 'No Slam';
      description = 'Target is not affected by the slam. Takes damage as for a normal hit.';
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
  await roll.evaluate();
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