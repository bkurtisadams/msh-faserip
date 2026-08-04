// scripts/rules/kill-resolver.js v1.3.0 - 2026-03-20
// v1.3.0: Add isLethalAttackForm() for four-color rule — edged/shooting/thrown-edged/energy
//         are inherently lethal regardless of whether the specific roll was a Kill result.
// v1.2.0: Add throwing-blunt to non-lethal attack forms (zero_health context on 0HP kill check)
// v1.1.0: Include Thrown Edged in E/S group (Green = Endurance Loss)

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

export function resolveKillFeat(color, context) {
  const debug = game.settings?.get('msh-faserip', 'debugMode') || false;
  const colorLower = String(color || "").toLowerCase();
  
  if (debug) {
    console.log('[KILL RESOLVER] resolveKillFeat called', { color: colorLower, context });
  }
  
  if (colorLower === "white") {
    const result = {
      outcome: KILL_OUTCOMES.ENDURANCE_LOSS,
      label: "Endurance Loss",
      description: "Target begins dying - loses 1 Endurance rank per turn"
    };
    if (debug) console.log('[KILL RESOLVER] White result:', result);
    return result;
  }
  
  if (colorLower === "green") {
    let result;
    switch (context) {
      case KILL_CONTEXTS.EDGED_MELEE:
      case KILL_CONTEXTS.SHOOTING:
      case KILL_CONTEXTS.EDGED_THROWING:  // Thrown edged counts as E/S (Bullseye the supervillain rule)
        result = {
          outcome: KILL_OUTCOMES.ENDURANCE_LOSS,
          label: "Endurance Loss (E/S)",
          description: "Target begins dying - loses 1 Endurance rank per turn"
        };
        break;
        
      case KILL_CONTEXTS.ENERGY:
      case KILL_CONTEXTS.ZERO_HEALTH:
        result = {
          outcome: KILL_OUTCOMES.NO_EFFECT,
          label: "No Effect",
          description: "Target is stunned but not dying"
        };
        break;
        
      default:
        console.warn(`[KILL RESOLVER] Unknown Kill context: ${context}, treating green as No Effect`);
        result = {
          outcome: KILL_OUTCOMES.NO_EFFECT,
          label: "No Effect",
          description: "Target is stunned but not dying"
        };
    }
    if (debug) console.log('[KILL RESOLVER] Green result:', result);
    return result;
  }
  
  if (colorLower === "yellow" || colorLower === "red") {
    const result = {
      outcome: KILL_OUTCOMES.NO_EFFECT,
      label: "No Effect",
      description: "Target is stunned but not dying"
    };
    if (debug) console.log('[KILL RESOLVER] Yellow/Red result:', result);
    return result;
  }
  
  console.error(`[KILL RESOLVER] Unexpected Kill column color: ${color}`);
  return {
    outcome: KILL_OUTCOMES.NO_EFFECT,
    label: "No Effect",
    description: "Unknown result - treating as No Effect"
  };
}
/**
 * Returns true if the attack form is inherently lethal (edged, shooting, thrown edged, energy).
 * Used by four-color rule: these attack forms always trigger death saves at 0 HP.
 */
export function isLethalAttackForm(attackForm) {
  const ctx = getKillContextFromAttackForm(attackForm);
  return ctx !== KILL_CONTEXTS.ZERO_HEALTH;
}

export function getKillContextFromAttackForm(attackForm) {
  const debug = game.settings?.get('msh-faserip', 'debugMode') || false;
  const formLower = String(attackForm || "").toLowerCase().replace(/[_\s-]/g, "");
  
  if (debug) {
    console.log('[KILL RESOLVER] getKillContextFromAttackForm', { attackForm, normalized: formLower });
  }
  
  let context;
  
  // Edged attacks
  if (formLower === "edged" || formLower === "edgedmelee" || formLower === "edgedattack") {
    context = KILL_CONTEXTS.EDGED_MELEE;
  } 
  // Shooting attacks
  else if (formLower === "shooting" || formLower === "rangedattack" || formLower === "firearm") {
    context = KILL_CONTEXTS.SHOOTING;
  } 
  // Edged throwing
  else if (formLower === "edgedthrowing" || formLower === "throwingedged") {
    context = KILL_CONTEXTS.EDGED_THROWING;
  } 
  // Energy attacks
  else if (formLower === "energy" || formLower === "energyattack") {
    context = KILL_CONTEXTS.ENERGY;
  }
  // Non-lethal attack forms (shouldn't normally trigger Kill, but handle gracefully)
  else if (formLower === "blunt" || formLower === "bluntattack" || 
           formLower === "force" || formLower === "forceattack" ||
           formLower === "charging" ||
           formLower === "throwingblunt" || formLower === "throwblunt") {
    if (debug) {
      console.log('[KILL RESOLVER] Non-lethal attack form, treating as zero_health context');
    }
    context = KILL_CONTEXTS.ZERO_HEALTH;
  }
  // Unknown
  else {
    console.warn(`[KILL RESOLVER] Unknown attack form: ${attackForm}, defaulting to zero_health`);
    context = KILL_CONTEXTS.ZERO_HEALTH;
  }
  
  if (debug) {
    console.log('[KILL RESOLVER] Resolved context:', context);
  }
  
  return context;
}