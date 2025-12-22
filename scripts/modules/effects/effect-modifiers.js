// scripts/modules/effects/effect-modifiers.js v1.1.0 - 2025-12-22
// Effect modifier system for FASERIP combat
// Reads combat modifiers from actor.system.combatMods (populated by Active Effects)

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

/**
 * Get the aggregated combat modifiers from an actor
 * Foundry Active Effects automatically apply changes to system.combatMods
 * @param {Actor} actor 
 * @param {object} options - Additional context
 * @param {boolean} options.isRanged - Whether checking ranged defense
 * @returns {object} Combat modifiers
 */
export function getActiveModifiers(actor, options = {}) {
  const defaults = {
    attackShift: 0,
    defenseShift: 0,
    defenseShiftRanged: 0,
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
    canMove: true
  };
  
  if (!actor?.system?.combatMods) return defaults;
  
  const mods = actor.system.combatMods;
  
  return {
    attackShift: Number(mods.attackShift) || 0,
    defenseShift: options.isRanged 
      ? (Number(mods.defenseShiftRanged) || 0)
      : (Number(mods.defenseShift) || 0),
    abilityShifts: {
      fighting: Number(mods.abilityShifts?.fighting) || 0,
      agility: Number(mods.abilityShifts?.agility) || 0,
      strength: Number(mods.abilityShifts?.strength) || 0,
      endurance: Number(mods.abilityShifts?.endurance) || 0,
      reason: Number(mods.abilityShifts?.reason) || 0,
      intuition: Number(mods.abilityShifts?.intuition) || 0,
      psyche: Number(mods.abilityShifts?.psyche) || 0
    },
    movementMult: Number(mods.movementMult) ?? 1,
    canAct: mods.canAct !== false,
    canMove: mods.canMove !== false
  };
}

/**
 * Check if actor can take actions
 * @param {Actor} actor 
 * @returns {object} { canAct, reason }
 */
export function canActorAct(actor) {
  const mods = getActiveModifiers(actor);
  
  if (!mods.canAct) {
    // Find effects preventing action
    const blocking = actor.effects
      ?.filter(e => !e.disabled)
      ?.filter(e => {
        const changes = e.changes || [];
        return changes.some(c => c.key === "system.combatMods.canAct" && c.value === "false");
      })
      ?.map(e => e.name)
      ?.join(", ") || "active effects";
    
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
    // Find effects preventing movement
    const blocking = actor.effects
      ?.filter(e => !e.disabled)
      ?.filter(e => {
        const changes = e.changes || [];
        return changes.some(c => c.key === "system.combatMods.canMove" && c.value === "false");
      })
      ?.map(e => e.name)
      ?.join(", ") || "active effects";
    
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
  const effects = actor.effects?.filter(e => !e.disabled)?.map(e => ({
    name: e.name,
    changes: e.changes
  })) || [];
  
  console.log(`[FASERIP] Active Modifiers for ${actor.name}:`, {
    combatMods: actor.system?.combatMods,
    computed: mods,
    activeEffects: effects
  });
  return mods;
}
