// scripts/rules/kill-resolver.js

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
        result = {
          outcome: KILL_OUTCOMES.ENDURANCE_LOSS,
          label: "Endurance Loss (E/S)",
          description: "Target begins dying - loses 1 Endurance rank per turn"
        };
        break;
        
      case KILL_CONTEXTS.EDGED_THROWING:
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

export function isKillResultLethal(color, context) {
  const result = resolveKillFeat(color, context);
  return result.outcome === KILL_OUTCOMES.ENDURANCE_LOSS;
}

export function getKillContextFromAttackForm(attackForm) {
  const debug = game.settings?.get('msh-faserip', 'debugMode') || false;
  const formLower = String(attackForm || "").toLowerCase().replace(/[_\s-]/g, "");
  
  if (debug) {
    console.log('[KILL RESOLVER] getKillContextFromAttackForm', { attackForm, normalized: formLower });
  }
  
  let context;
  if (formLower === "edged" || formLower === "edgedmelee" || formLower === "edgedattack") {
    context = KILL_CONTEXTS.EDGED_MELEE;
  } else if (formLower === "shooting" || formLower === "rangedattack") {
    context = KILL_CONTEXTS.SHOOTING;
  } else if (formLower === "edgedthrowing" || formLower === "throwingedged") {
    context = KILL_CONTEXTS.EDGED_THROWING;
  } else if (formLower === "energy" || formLower === "energyattack") {
    context = KILL_CONTEXTS.ENERGY;
  } else {
    console.warn(`[KILL RESOLVER] Unknown attack form for Kill context: ${attackForm}, defaulting to EDGED_THROWING`);
    context = KILL_CONTEXTS.EDGED_THROWING;
  }
  
  if (debug) {
    console.log('[KILL RESOLVER] Resolved context:', context);
  }
  
  return context;
}