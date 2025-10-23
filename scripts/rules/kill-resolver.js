// scripts/rules/kill-resolver.js

/**
 * Centralized Kill FEAT resolution logic
 * Handles context-dependent interpretation of Kill column results
 * 
 * Kill Column Interpretation varies by attack context:
 * - Edged Melee: W=EnduranceLoss, G(E/S)=EnduranceLoss, Y=NoEffect, R=NoEffect
 * - Shooting: W=EnduranceLoss, G(E/S)=EnduranceLoss, Y=NoEffect, R=NoEffect  
 * - Edged Throwing: W=EnduranceLoss, G(E/S)=NoEffect, Y=NoEffect, R=NoEffect
 * - Energy: W=EnduranceLoss, G(E/S)=NoEffect, Y=NoEffect, R=NoEffect
 * - Zero Health Save: W=EnduranceLoss, G/Y/R=NoEffect (no attack context)
 */

export const KILL_CONTEXTS = {
  EDGED_MELEE: "edged_melee",
  SHOOTING: "shooting",
  EDGED_THROWING: "edged_throwing",
  ENERGY: "energy",
  ZERO_HEALTH: "zero_health"
};

export const KILL_OUTCOMES = {
  ENDURANCE_LOSS: "EnduranceLoss",
  NO_EFFECT: "NoEffect"
};

/**
 * Resolve a Kill FEAT result based on color and attack context
 * @param {string} color - The Universal Table result color ('white', 'green', 'yellow', 'red')
 * @param {string} context - The attack context (use KILL_CONTEXTS constants)
 * @returns {Object} - { outcome: "EnduranceLoss" | "NoEffect", label: "Endurance Loss" | "No Effect" }
 */
export function resolveKillFeat(color, context) {
  const colorLower = String(color || "").toLowerCase();
  
  // White always means Endurance Loss regardless of context
  if (colorLower === "white") {
    return {
      outcome: KILL_OUTCOMES.ENDURANCE_LOSS,
      label: "Endurance Loss",
      description: "Target begins dying - loses 1 Endurance rank per turn"
    };
  }
  
  // Green (E/S) - context dependent
  if (colorLower === "green") {
    switch (context) {
      case KILL_CONTEXTS.EDGED_MELEE:
      case KILL_CONTEXTS.SHOOTING:
        // These attack forms cause Endurance Loss on green
        return {
          outcome: KILL_OUTCOMES.ENDURANCE_LOSS,
          label: "Endurance Loss (E/S)",
          description: "Target begins dying - loses 1 Endurance rank per turn"
        };
        
      case KILL_CONTEXTS.EDGED_THROWING:
      case KILL_CONTEXTS.ENERGY:
      case KILL_CONTEXTS.ZERO_HEALTH:
        // These contexts treat green as No Effect
        return {
          outcome: KILL_OUTCOMES.NO_EFFECT,
          label: "No Effect",
          description: "Target is stunned but not dying"
        };
        
      default:
        console.warn(`Unknown Kill context: ${context}, treating green as No Effect`);
        return {
          outcome: KILL_OUTCOMES.NO_EFFECT,
          label: "No Effect",
          description: "Target is stunned but not dying"
        };
    }
  }
  
  // Yellow and Red always mean No Effect
  if (colorLower === "yellow" || colorLower === "red") {
    return {
      outcome: KILL_OUTCOMES.NO_EFFECT,
      label: "No Effect",
      description: "Target is stunned but not dying"
    };
  }
  
  // Fallback for unexpected colors
  console.error(`Unexpected Kill column color: ${color}`);
  return {
    outcome: KILL_OUTCOMES.NO_EFFECT,
    label: "No Effect",
    description: "Unknown result - treating as No Effect"
  };
}

/**
 * Helper to check if a Kill result causes death/dying
 * @param {string} color - The Universal Table result color
 * @param {string} context - The attack context
 * @returns {boolean} - True if the result causes Endurance Loss (dying)
 */
export function isKillResultLethal(color, context) {
  const result = resolveKillFeat(color, context);
  return result.outcome === KILL_OUTCOMES.ENDURANCE_LOSS;
}

/**
 * Get attack context from attack form/type
 * @param {string} attackForm - The attack form ("edged", "shooting", "throwing-edged", "energy", etc.)
 * @returns {string} - The appropriate KILL_CONTEXT constant
 */
export function getKillContextFromAttackForm(attackForm) {
  const formLower = String(attackForm || "").toLowerCase().replace(/[_\s-]/g, "");
  
  if (formLower === "edged" || formLower === "edgedmelee" || formLower === "edgedattack") {
    return KILL_CONTEXTS.EDGED_MELEE;
  }
  if (formLower === "shooting" || formLower === "rangedattack") {
    return KILL_CONTEXTS.SHOOTING;
  }
  if (formLower === "edgedthrowing" || formLower === "throwingedged") {
    return KILL_CONTEXTS.EDGED_THROWING;
  }
  if (formLower === "energy" || formLower === "energyattack") {
    return KILL_CONTEXTS.ENERGY;
  }
  
  // Default to a safe fallback (treat as edged throwing - most restrictive)
  console.warn(`Unknown attack form for Kill context: ${attackForm}, defaulting to EDGED_THROWING`);
  return KILL_CONTEXTS.EDGED_THROWING;
}
