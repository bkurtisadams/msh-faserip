// scripts/modules/effects/effect-modifiers.js v1.0.0 - 2025-12-22
// Effect modifier system for FASERIP combat
// Aggregates column shifts and status flags from active effects

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

/**
 * Standard effect templates with mechanical modifiers
 * Shifts are column shifts (positive = bonus, negative = penalty)
 * 
 * attackShift: Modifier to your attack rolls
 * defenseShift: Modifier to attacks against you (negative = easier to hit)
 * abilityShifts: Modifiers to specific ability FEATs
 * movementMult: Movement multiplier (0 = none, 0.5 = half, 1 = normal)
 * canAct: Whether the character can take actions
 * canMove: Whether the character can move
 * notes: Rules text for display
 */
export const EFFECT_TEMPLATES = {
  stunned: {
    attackShift: -2,
    defenseShift: -2,
    abilityShifts: {},
    movementMult: 0,
    canAct: false,
    canMove: false,
    notes: "Cannot take any actions. -2CS to attacks against stunned target."
  },
  
  staggered: {
    attackShift: 0,
    defenseShift: 0,
    abilityShifts: {},
    movementMult: 0.5,
    canAct: true,
    canMove: true,
    notes: "Half movement next round. No longer adjacent to attacker."
  },
  
  prone: {
    attackShift: -1,
    defenseShift: -1,        // Easier to hit in melee
    defenseShiftRanged: 1,   // Harder to hit at range
    abilityShifts: {
      agility: -2
    },
    movementMult: 0.5,
    canAct: true,
    canMove: true,
    notes: "+1CS to ranged attacks against prone. -1CS to melee attacks. -2CS to Agility FEATs."
  },
  
  grappled: {
    attackShift: -2,
    defenseShift: -2,
    abilityShifts: {
      fighting: -2,
      agility: -2
    },
    movementMult: 0,
    canAct: true,  // Can attempt escape or limited attacks
    canMove: false,
    notes: "Cannot move. -2CS to attacks and defense. Must escape or attack holder."
  },
  
  held: {
    attackShift: -4,
    defenseShift: -4,
    abilityShifts: {
      fighting: -4,
      agility: -4,
      strength: -2
    },
    movementMult: 0,
    canAct: true,  // Can attempt escape
    canMove: false,
    notes: "Firmly held. -4CS to attacks and defense. Must break free."
  },
  
  blinded: {
    attackShift: -4,
    defenseShift: -2,
    abilityShifts: {
      agility: -4,
      intuition: -2
    },
    movementMult: 0.25,
    canAct: true,
    canMove: true,
    notes: "Cannot see. -4CS to attacks, -2CS defense. Quarter movement."
  },
  
  entangled: {
    attackShift: -2,
    defenseShift: -1,
    abilityShifts: {
      agility: -4
    },
    movementMult: 0,
    canAct: true,
    canMove: false,
    notes: "Trapped in material. Must break free with Strength vs material."
  },
  
  unconscious: {
    attackShift: 0,
    defenseShift: -4,
    abilityShifts: {},
    movementMult: 0,
    canAct: false,
    canMove: false,
    notes: "Completely helpless. Automatic hit at point blank."
  },
  
  dying: {
    attackShift: 0,
    defenseShift: -4,
    abilityShifts: {},
    movementMult: 0,
    canAct: false,
    canMove: false,
    notes: "Losing 1 Endurance rank per round. Needs stabilization."
  },
  
  evading: {
    attackShift: -3,  // Penalty to your attacks while evading
    defenseShift: 2,  // Bonus to defense (harder to hit)
    abilityShifts: {
      agility: 2
    },
    movementMult: 1,
    canAct: false,  // Full action spent evading
    canMove: true,
    notes: "Full dodge. +2CS to defense. Cannot attack this round."
  },
  
  blocking: {
    attackShift: 0,
    defenseShift: 0,  // Armor handled separately
    abilityShifts: {},
    movementMult: 0.5,
    canAct: true,
    canMove: true,
    notes: "Blocking with shield/object. Armor rank applies vs physical attacks."
  },
  
  charging: {
    attackShift: 0,
    defenseShift: -1,  // Easier to hit while charging
    abilityShifts: {},
    movementMult: 2,  // Double movement
    canAct: true,
    canMove: true,
    notes: "Charging attack. -1CS to defense."
  },
  
  grandSlam: {
    attackShift: 0,
    defenseShift: -2,
    abilityShifts: {
      agility: -2
    },
    movementMult: 0,
    canAct: false,  // Knocked flying
    canMove: false,
    notes: "Knocked back multiple areas. Prone on landing."
  },
  
  slammed: {
    attackShift: 0,
    defenseShift: -1,
    abilityShifts: {},
    movementMult: 0,
    canAct: true,
    canMove: true,  // Can get up
    notes: "Knocked back 1 area. Prone."
  }
};

/**
 * Get the effect type key from an effect's flags
 * @param {ActiveEffect} effect 
 * @returns {string|null} Effect type key or null
 */
export function getEffectType(effect) {
  const flags = effect?.flags?.[SCOPE()] || {};
  
  // Check for explicit effectType flag
  if (flags.effectType) return flags.effectType;
  
  // Check status flags
  if (flags.isStunned || flags.status?.isStunned) return "stunned";
  if (flags.isUnconscious || flags.status?.isUnconscious) return "unconscious";
  if (flags.isDying || flags.status?.isDying) return "dying";
  if (flags.isEvading || flags.status?.isEvading) return "evading";
  if (flags.isBlocking || flags.status?.isBlocking) return "blocking";
  if (flags.isGrappled || flags.status?.isGrappled) return "grappled";
  if (flags.isHeld || flags.status?.isHeld) return "held";
  if (flags.isEntangled || flags.status?.isEntangled) return "entangled";
  if (flags.isBlinded || flags.status?.isBlinded) return "blinded";
  if (flags.isProne || flags.status?.isProne) return "prone";
  if (flags.staggered || flags.status?.staggered) return "staggered";
  if (flags.grandSlam || flags.status?.grandSlam) return "grandSlam";
  if (flags.slammed || flags.status?.slammed) return "slammed";
  if (flags.isCharging || flags.status?.isCharging) return "charging";
  
  // Check statuses set
  if (effect.statuses?.has?.("stunned")) return "stunned";
  if (effect.statuses?.has?.("unconscious")) return "unconscious";
  if (effect.statuses?.has?.("dying")) return "dying";
  if (effect.statuses?.has?.("prone")) return "prone";
  if (effect.statuses?.has?.("grappled")) return "grappled";
  if (effect.statuses?.has?.("blinded")) return "blinded";
  if (effect.statuses?.has?.("staggered")) return "staggered";
  
  return null;
}

/**
 * Get modifiers for a single effect
 * Checks for custom shifts in flags first, falls back to template
 * @param {ActiveEffect} effect 
 * @returns {object} Modifier object
 */
export function getEffectModifiers(effect) {
  if (!effect || effect.disabled) {
    return {
      attackShift: 0,
      defenseShift: 0,
      defenseShiftRanged: 0,
      abilityShifts: {},
      movementMult: 1,
      canAct: true,
      canMove: true
    };
  }
  
  const flags = effect.flags?.[SCOPE()] || {};
  const effectType = getEffectType(effect);
  const template = effectType ? EFFECT_TEMPLATES[effectType] : null;
  
  // Custom shifts in flags take precedence over template
  const customShifts = flags.shifts || {};
  
  return {
    attackShift: customShifts.attack ?? template?.attackShift ?? 0,
    defenseShift: customShifts.defense ?? template?.defenseShift ?? 0,
    defenseShiftRanged: customShifts.defenseRanged ?? template?.defenseShiftRanged ?? template?.defenseShift ?? 0,
    abilityShifts: { ...(template?.abilityShifts || {}), ...(customShifts.abilities || {}) },
    movementMult: customShifts.movementMult ?? template?.movementMult ?? 1,
    canAct: customShifts.canAct ?? template?.canAct ?? true,
    canMove: customShifts.canMove ?? template?.canMove ?? true,
    effectType,
    effectName: effect.name
  };
}

/**
 * Aggregate all active effect modifiers for an actor
 * @param {Actor} actor 
 * @param {object} options - Additional context
 * @param {boolean} options.isRanged - Whether checking ranged defense
 * @returns {object} Aggregated modifiers
 */
export function getActiveModifiers(actor, options = {}) {
  const result = {
    attackShift: 0,
    defenseShift: 0,
    abilityShifts: {
      fighting: 0,
      agility: 0,
      strength: 0,
      endurance: 0,
      reason: 0,
      intuition: 0,
      psyche: 0
    },
    movementMult: 1,
    canAct: true,
    canMove: true,
    activeEffects: [],  // List of effect names contributing
    debug: []           // Debug info for each effect
  };
  
  if (!actor?.effects) return result;
  
  for (const effect of actor.effects) {
    if (effect.disabled) continue;
    
    const mods = getEffectModifiers(effect);
    
    // Accumulate shifts (additive)
    result.attackShift += mods.attackShift;
    
    // Defense shift depends on ranged vs melee
    if (options.isRanged && mods.defenseShiftRanged !== undefined) {
      result.defenseShift += mods.defenseShiftRanged;
    } else {
      result.defenseShift += mods.defenseShift;
    }
    
    // Ability shifts (additive)
    for (const [ability, shift] of Object.entries(mods.abilityShifts || {})) {
      const abilityLower = ability.toLowerCase();
      if (result.abilityShifts.hasOwnProperty(abilityLower)) {
        result.abilityShifts[abilityLower] += shift;
      }
    }
    
    // Movement (multiplicative, take worst)
    result.movementMult = Math.min(result.movementMult, mods.movementMult);
    
    // Actions (any "cannot act" effect prevents action)
    if (!mods.canAct) result.canAct = false;
    if (!mods.canMove) result.canMove = false;
    
    // Track contributing effects
    if (mods.attackShift !== 0 || mods.defenseShift !== 0 || !mods.canAct || !mods.canMove) {
      result.activeEffects.push(effect.name);
      result.debug.push({
        name: effect.name,
        type: mods.effectType,
        attackShift: mods.attackShift,
        defenseShift: mods.defenseShift,
        canAct: mods.canAct,
        canMove: mods.canMove
      });
    }
  }
  
  return result;
}

/**
 * Check if actor can take actions
 * @param {Actor} actor 
 * @returns {object} { canAct, reason }
 */
export function canActorAct(actor) {
  const mods = getActiveModifiers(actor);
  
  if (!mods.canAct) {
    const blocking = mods.activeEffects.join(", ");
    return {
      canAct: false,
      reason: `Cannot act due to: ${blocking}`
    };
  }
  
  return { canAct: true, reason: null };
}

/**
 * Check if actor can move
 * @param {Actor} actor 
 * @returns {object} { canMove, movementMult, reason }
 */
export function canActorMove(actor) {
  const mods = getActiveModifiers(actor);
  
  if (!mods.canMove) {
    const blocking = mods.activeEffects.join(", ");
    return {
      canMove: false,
      movementMult: 0,
      reason: `Cannot move due to: ${blocking}`
    };
  }
  
  return {
    canMove: true,
    movementMult: mods.movementMult,
    reason: mods.movementMult < 1 ? `Movement reduced to ${Math.round(mods.movementMult * 100)}%` : null
  };
}

/**
 * Get total attack column shift for an actor
 * @param {Actor} actor 
 * @returns {number} Total attack shift
 */
export function getAttackShift(actor) {
  return getActiveModifiers(actor).attackShift;
}

/**
 * Get total defense column shift for an actor
 * @param {Actor} actor 
 * @param {boolean} isRanged - Whether the attack is ranged
 * @returns {number} Total defense shift
 */
export function getDefenseShift(actor, isRanged = false) {
  return getActiveModifiers(actor, { isRanged }).defenseShift;
}

/**
 * Get ability FEAT column shift for an actor
 * @param {Actor} actor 
 * @param {string} ability - Ability name (fighting, agility, etc.)
 * @returns {number} Total ability shift
 */
export function getAbilityShift(actor, ability) {
  const mods = getActiveModifiers(actor);
  const abilityLower = String(ability).toLowerCase();
  return mods.abilityShifts[abilityLower] || 0;
}

/**
 * Build a summary string of active modifiers for display
 * @param {Actor} actor 
 * @returns {string} Summary text
 */
export function getModifierSummary(actor) {
  const mods = getActiveModifiers(actor);
  const parts = [];
  
  if (mods.attackShift !== 0) {
    parts.push(`Attack: ${mods.attackShift > 0 ? '+' : ''}${mods.attackShift}CS`);
  }
  if (mods.defenseShift !== 0) {
    parts.push(`Defense: ${mods.defenseShift > 0 ? '+' : ''}${mods.defenseShift}CS`);
  }
  if (!mods.canAct) {
    parts.push("Cannot Act");
  }
  if (!mods.canMove) {
    parts.push("Cannot Move");
  } else if (mods.movementMult < 1) {
    parts.push(`Movement: ${Math.round(mods.movementMult * 100)}%`);
  }
  
  // Ability shifts
  for (const [ability, shift] of Object.entries(mods.abilityShifts)) {
    if (shift !== 0) {
      const abilityName = ability.charAt(0).toUpperCase() + ability.slice(1);
      parts.push(`${abilityName}: ${shift > 0 ? '+' : ''}${shift}CS`);
    }
  }
  
  return parts.length > 0 ? parts.join(", ") : "No modifiers";
}

/**
 * Debug helper - log all active modifiers for an actor
 * @param {Actor} actor 
 */
export function debugActorModifiers(actor) {
  const mods = getActiveModifiers(actor);
  console.log(`[FASERIP] Active Modifiers for ${actor.name}:`, {
    attackShift: mods.attackShift,
    defenseShift: mods.defenseShift,
    abilityShifts: mods.abilityShifts,
    movementMult: mods.movementMult,
    canAct: mods.canAct,
    canMove: mods.canMove,
    effects: mods.debug
  });
  return mods;
}
