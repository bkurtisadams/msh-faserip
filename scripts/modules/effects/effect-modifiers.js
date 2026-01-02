// scripts/modules/effects/effect-modifiers.js v1.3.3 - 2026-01-02
// v1.3.3: Fix evasion bonus - only applies in exactly createdRound + 1, expires after that
// v1.3.2: Update getEvasionAttackBonus to look for isEvasionBonus effect (not isEvading)
// v1.3.1: Fix evasion bonus - check createdRound so bonus only applies in next round, better target matching
// v1.3.0: Add getEvasionAttackBonus and consumeEvasionAttackBonus for evasion next-round bonus
// v1.2.0: Add getAttackShiftBreakdown and getDefenseShiftBreakdown for effect name display
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
 * Get attack shift breakdown by effect name
 * @param {Actor} actor 
 * @returns {object} { total, breakdown: [{name, shift}] }
 */
export function getAttackShiftBreakdown(actor) {
  const total = getAttackShift(actor);
  const breakdown = [];
  
  if (!actor?.effects) return { total, breakdown };
  
  for (const effect of actor.effects) {
    if (effect.disabled) continue;
    for (const change of (effect.changes || [])) {
      if (change.key === "system.combatMods.attackShift") {
        const shift = Number(change.value) || 0;
        if (shift !== 0) {
          breakdown.push({ name: effect.name, shift });
        }
      }
    }
  }
  
  return { total, breakdown };
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
 * Get defense shift breakdown by effect name
 * @param {Actor} actor 
 * @param {boolean} isRanged - Whether the attack is ranged
 * @returns {object} { total, breakdown: [{name, shift}] }
 */
export function getDefenseShiftBreakdown(actor, isRanged = false) {
  const total = getDefenseShift(actor, isRanged);
  const breakdown = [];
  
  if (!actor?.effects) return { total, breakdown };
  
  const key = isRanged ? "system.combatMods.defenseShiftRanged" : "system.combatMods.defenseShift";
  
  for (const effect of actor.effects) {
    if (effect.disabled) continue;
    for (const change of (effect.changes || [])) {
      if (change.key === key) {
        const shift = Number(change.value) || 0;
        if (shift !== 0) {
          breakdown.push({ name: effect.name, shift });
        }
      }
    }
  }
  
  return { total, breakdown };
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

/**
 * Check if attacker has an evasion bonus against a specific target
 * This is used when the attacker previously evaded the target and got yellow/red
 * The bonus only applies in the round AFTER the evasion was made (cannot be saved)
 * @param {Actor} attacker - The attacking actor
 * @param {Actor|Token} target - The target being attacked
 * @returns {object} { hasBonus, bonusCS, effectId, targetName }
 */
export function getEvasionAttackBonus(attacker, target) {
  if (!attacker?.effects) {
    return { hasBonus: false, bonusCS: 0, effectId: null, targetName: null };
  }
  
  // Get target name for matching
  const targetName = target?.name || target?.actor?.name || "";
  const targetLower = targetName.toLowerCase().trim();
  
  // Get current combat round
  const currentRound = game.combat?.round || 0;
  
  // Find evasion BONUS effect (separate from evading status effect)
  const bonusEffect = attacker.effects.find(e => {
    if (e.disabled) return false;
    const flags = e.flags?.[SCOPE()] || {};
    
    // Must be an evasion bonus effect (not the evading status effect)
    if (!flags.isEvasionBonus) return false;
    
    // Must have a bonus to apply
    if (!flags.nextRoundAttackBonusCS || flags.nextRoundAttackBonusCS <= 0) return false;
    
    // Must not have been used already
    if (flags.nextRoundBonusUsed) return false;
    
    // Bonus only applies in the round AFTER the evasion was made
    // The effect's startRound is set to createdRound + 1
    const createdRound = flags.createdRound || 0;
    if (currentRound !== createdRound + 1) {
      console.log("[FASERIP] Evasion bonus not applicable - wrong round", {
        createdRound,
        currentRound,
        expectedRound: createdRound + 1
      });
      return false;
    }
    
    // Check if target matches the evaded target
    const evadedTarget = (flags.evadedTarget || "").toLowerCase().trim();
    const evadedTargetLower = flags.evadedTargetLower || evadedTarget;
    
    // If no specific target was named during evasion, the bonus applies to any melee attacker
    if (!evadedTarget || evadedTarget === "" || evadedTarget === "adjacent attacker") {
      console.log("[FASERIP] Evasion bonus applies - no specific target named");
      return true;
    }
    
    // Check for name match (case-insensitive, partial match allowed)
    if (targetLower && evadedTargetLower) {
      // Either the evaded target contains the attack target name, or vice versa
      if (evadedTargetLower.includes(targetLower) || targetLower.includes(evadedTargetLower)) {
        console.log("[FASERIP] Evasion bonus applies - target name matched", {
          evadedTarget: evadedTargetLower,
          attackTarget: targetLower
        });
        return true;
      }
    }
    
    return false;
  });
  
  if (!bonusEffect) {
    return { hasBonus: false, bonusCS: 0, effectId: null, targetName: null };
  }
  
  const flags = bonusEffect.flags?.[SCOPE()] || {};
  return {
    hasBonus: true,
    bonusCS: flags.nextRoundAttackBonusCS || 0,
    effectId: bonusEffect.id,
    targetName: flags.evadedTarget || "evaded target"
  };
}

/**
 * Consume (mark as used) the evasion attack bonus
 * @param {Actor} attacker - The attacking actor
 * @param {string} effectId - The effect ID to consume
 */
export async function consumeEvasionAttackBonus(attacker, effectId) {
  if (!attacker || !effectId) return;
  
  const effect = attacker.effects.get(effectId);
  if (!effect) return;
  
  try {
    // Mark the bonus as used
    await effect.update({
      [`flags.${SCOPE()}.nextRoundBonusUsed`]: true,
      name: effect.name.replace(/\(\+\d+CS\)/, "(bonus used)")
    });
    
    console.log("[FASERIP] Consumed evasion attack bonus:", {
      actor: attacker.name,
      effectId
    });
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to consume evasion bonus:", e);
  }
}
