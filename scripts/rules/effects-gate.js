// scripts/rules/effects-gate.js

export function canEffectsApply(damageThrough, options = {}) {
  const debug = game.settings?.get('msh-faserip', 'debugMode') || false;
  
  const {
    borderline = false,
    ignoreDamageGate = false
  } = options;
  
  if (debug) {
    console.log('[EFFECTS GATE] Checking if effects can apply', {
      damageThrough,
      borderline,
      ignoreDamageGate
    });
  }
  
  // If caller explicitly ignores the gate, effects always apply
  if (ignoreDamageGate) {
    if (debug) console.log('[EFFECTS GATE] Gate bypassed via ignoreDamageGate');
    return true;
  }
  
  // Effects apply if damage > 0 OR borderline rule is invoked
  const effectGateOpen = (damageThrough > 0) || borderline;
  
  if (debug) {
    console.log('[EFFECTS GATE] Result:', {
      effectGateOpen,
      reason: effectGateOpen 
        ? (damageThrough > 0 ? 'damage penetrated' : 'borderline rule')
        : 'no damage and no borderline'
    });
  }
  
  return effectGateOpen;
}

export function shouldSuppressEffects(damageThrough, options = {}) {
  return !canEffectsApply(damageThrough, options);
}