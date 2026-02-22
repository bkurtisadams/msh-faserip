// scripts/modules/rest-system.js
// Player-driven rest, recovery, and healing system for FASERIP

import { getFlagScope } from "./actions/flags.js";

const SCOPE = getFlagScope();

/**
 * FASERIP Rest System
 * 
 * Recovery: Regain Endurance rank number in Health after 10 turns of rest
 *   - Once per day
 *   - Must be conscious (Health > 0)
 *   - Cannot be interrupted by damage
 * 
 * Healing: Heal Endurance rank number after 600 turns (1 hour) since last damage
 *   - Can be used multiple times
 *   - Works even if unconscious
 *   - Doubled with medical care
 *   - Timer resets if damaged again
 */

export class RestSystem {
  
  /**
   * Check if actor can attempt Recovery (10 turns rest)
   * @param {Actor} actor - The actor to check
   * @returns {Object} {canRest: boolean, reason: string}
   */
  static canAttemptRecovery(actor) {
    if (!actor) {
      return { canRest: false, reason: "No actor provided" };
    }

    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;
    
    // Must be conscious
    if (currentHealth <= 0) {
      return { 
        canRest: false, 
        reason: "Cannot recover while unconscious (Health must be above 0)" 
      };
    }

    // Already at max health
    if (currentHealth >= maxHealth) {
      return { 
        canRest: false, 
        reason: "Already at maximum Health" 
      };
    }

    // Check once-per-day limit
    const lastRecoveryDate = actor.getFlag(SCOPE, "lastRecoveryDate");
    const today = new Date().toDateString();
    
    if (lastRecoveryDate === today) {
      return { 
        canRest: false, 
        reason: "Recovery can only be used once per day (already used today)" 
      };
    }

    // Check if enough time has passed (10 turns = 60 seconds in FASERIP)
    const lastDamageTime = actor.getFlag(SCOPE, "lastDamageTime");
    if (lastDamageTime) {
      const timeSinceDamage = Date.now() - lastDamageTime;
      const tenTurns = 60 * 1000; // 60 seconds
      
      if (timeSinceDamage < tenTurns) {
        const remaining = Math.ceil((tenTurns - timeSinceDamage) / 1000);
        return { 
          canRest: false, 
          reason: `Must wait ${remaining} more seconds since last damage (10 turns total)` 
        };
      }
    }

    return { canRest: true, reason: "Ready for recovery" };
  }

  /**
   * Attempt Recovery - restore Endurance rank number in Health
   * @param {Actor} actor - The actor attempting recovery
   * @returns {Promise<Object>} {success: boolean, message: string, healed: number}
   */
  static async attemptRecovery(actor) {
    const check = this.canAttemptRecovery(actor);
    
    if (!check.canRest) {
      ui.notifications.warn(check.reason);
      return { success: false, message: check.reason, healed: 0 };
    }

    const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;
    
    const healAmount = Math.min(enduranceValue, maxHealth - currentHealth);
    const newHealth = currentHealth + healAmount;

    // Apply healing
    await actor.update({
      "system.attributes.health.value": newHealth
    });

    // Mark recovery as used today
    const today = new Date().toDateString();
    await actor.setFlag(SCOPE, "lastRecoveryDate", today);

    const message = `${actor.name} recovered ${healAmount} Health (10 turns of rest)`;
    
    // Chat message
    await ChatMessage.create({
      content: `<div style="background:#e8f5e9;border:1px solid #4CAF50;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> recovered <strong>${healAmount} Health</strong> after 10 turns of rest.
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Health: ${currentHealth} → ${newHealth}
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    ui.notifications.info(message);
    
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log("FASERIP | Recovery applied:", {
        actor: actor.name,
        healAmount,
        oldHealth: currentHealth,
        newHealth
      });
    }

    return { success: true, message, healed: healAmount };
  }

  /**
   * Check if actor can attempt Healing (1 hour since last damage)
   * @param {Actor} actor - The actor to check
   * @returns {Object} {canHeal: boolean, reason: string}
   */
  static canAttemptHealing(actor) {
    if (!actor) {
      return { canHeal: false, reason: "No actor provided" };
    }

    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;

    // Already at max health
    if (currentHealth >= maxHealth) {
      return { 
        canHeal: false, 
        reason: "Already at maximum Health" 
      };
    }

    // Check if enough time has passed (600 turns = 1 hour = 3600 world seconds)
    const lastDamageWorldTime = actor.getFlag(SCOPE, "lastDamageWorldTime");
    if (!lastDamageWorldTime && lastDamageWorldTime !== 0) {
      return { 
        canHeal: false, 
        reason: "No damage recorded - take damage first to start healing timer" 
      };
    }

    const worldNow = game.time?.worldTime ?? 0;
    const timeSinceDamage = worldNow - lastDamageWorldTime;
    const oneHour = 3600; // 1 hour in world seconds

    if (timeSinceDamage < oneHour) {
      const remaining = Math.ceil((oneHour - timeSinceDamage) / 60); // minutes
      return { 
        canHeal: false, 
        reason: `Must wait ${remaining} more minutes since last damage (1 hour total)` 
      };
    }

    return { canHeal: true, reason: "Ready for healing" };
  }

  /**
   * Attempt Healing - restore Endurance rank number (×2 with medical care)
   * @param {Actor} actor - The actor attempting healing
   * @returns {Promise<Object>} {success: boolean, message: string, healed: number}
   */
  static async attemptHealing(actor) {
    const check = this.canAttemptHealing(actor);
    
    if (!check.canHeal) {
      ui.notifications.warn(check.reason);
      return { success: false, message: check.reason, healed: 0 };
    }

    const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;
    const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
    const multiplier = hasMedicalCare ? 2 : 1;
    
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;
    
    const healAmount = Math.min(enduranceValue * multiplier, maxHealth - currentHealth);
    const newHealth = currentHealth + healAmount;

    // Apply healing
    await actor.update({
      "system.attributes.health.value": newHealth
    });

    // Clear damage timer
    await actor.unsetFlag(SCOPE, "lastDamageWorldTime");
    await actor.unsetFlag(SCOPE, "lastDamageTime"); // legacy cleanup

    const medicalNote = hasMedicalCare ? " (with medical care)" : "";
    const message = `${actor.name} healed ${healAmount} Health${medicalNote}`;
    
    // Chat message
    await ChatMessage.create({
      content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> healed <strong>${healAmount} Health</strong> after 1 hour${medicalNote}.
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Health: ${currentHealth} → ${newHealth}
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    ui.notifications.info(message);
    
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log("FASERIP | Healing applied:", {
        actor: actor.name,
        healAmount,
        medicalCare: hasMedicalCare,
        oldHealth: currentHealth,
        newHealth
      });
    }

    return { success: true, message, healed: healAmount };
  }

  /**
   * Toggle medical care flag for an actor
   * @param {Actor} actor - The actor
   * @param {boolean} enabled - True to enable medical care
   */
  static async setMedicalCare(actor, enabled) {
    await actor.setFlag(SCOPE, "medicalCare", enabled);
    const status = enabled ? "receiving medical care (healing ×2)" : "no longer receiving medical care";
    ui.notifications.info(`${actor.name} is now ${status}`);
    
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log(`FASERIP | Medical care ${enabled ? 'enabled' : 'disabled'} for ${actor.name}`);
    }
  }

  /**
   * Get current rest status for an actor (for UI display)
   * @param {Actor} actor - The actor to check
   * @returns {Object} Status information
   */
  static getRestStatus(actor) {
    const recoveryCheck = this.canAttemptRecovery(actor);
    const healingCheck = this.canAttemptHealing(actor);
    
    const lastDamageTime = actor.getFlag(SCOPE, "lastDamageTime");
    const lastRecoveryDate = actor.getFlag(SCOPE, "lastRecoveryDate");
    const medicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
    
    return {
      recovery: {
        available: recoveryCheck.canRest,
        reason: recoveryCheck.reason,
        lastUsed: lastRecoveryDate
      },
      healing: {
        available: healingCheck.canHeal,
        reason: healingCheck.reason,
        lastDamage: lastDamageTime,
        medicalCare
      }
    };
  }

  /**
   * Attempt to regain consciousness (0 HP character waking up)
   * Roll Endurance FEAT vs Kill column
   * @param {Actor} actor - The actor attempting to wake
   * @returns {Promise<Object>} {success: boolean, message: string, rolled: number, color: string}
   */
static async attemptRegainConsciousness(actor) {
    if (!actor) {
      return { success: false, message: "No actor provided" };
    }

    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    
    // Must be at 0 HP
    if (currentHealth > 0) {
      const msg = `${actor.name} is already conscious (Health: ${currentHealth})`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Check if still has Unconscious effect
    const hasUnconsciousEffect = actor.effects.find(e => 
      e.name?.toLowerCase().includes("unconscious") || 
      e.name?.toLowerCase().includes("stunned")
    );
    
    if (hasUnconsciousEffect) {
      const msg = `${actor.name} is still unconscious (${hasUnconsciousEffect.name}). Wait for the effect to expire.`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Check if still has Dying effect
    const hasDyingEffect = actor.effects.find(e => 
      e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
    );

    if (hasDyingEffect) {
      const msg = `${actor.name} is still dying. Cannot attempt consciousness while dying.`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Roll Endurance FEAT vs Kill column
    const enduranceRank = actor.system?.abilities?.endurance?.rank || "Typical";
    
    // Import the universal table function
    let color, roll;
    if (game.msh?.rollUniversalTable) {
      roll = Math.floor(Math.random() * 100) + 1;
      color = game.msh.rollUniversalTable(enduranceRank, roll);
    } else {
      // Fallback if universal table not available
      roll = Math.floor(Math.random() * 100) + 1;
      if (roll <= 45) color = "white";
      else if (roll <= 75) color = "green";
      else if (roll <= 95) color = "yellow";
      else color = "red";
    }

    const colorLower = color.toLowerCase();
    
    // Success on Green or better (Green/Yellow/Red)
    const success = (colorLower !== "white");
    
    if (success) {
      // Wake up with Health = Endurance rank value
      const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;
      await actor.update({
        "system.attributes.health.value": enduranceValue
      });

      // Clear damage timer - healing already granted by wake-up, no immediate re-heal
      await actor.unsetFlag(SCOPE, "lastDamageWorldTime");
      await actor.unsetFlag(SCOPE, "lastDamageTime"); // legacy cleanup

      const message = `${actor.name} regained consciousness with ${enduranceValue} Health!`;
      
      // Chat message
      await ChatMessage.create({
        content: `<div style="background:#e8f5e9;border:2px solid #4CAF50;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#2e7d32;margin-bottom:8px;">
            <i class="fas fa-heart"></i> ${actor.name} Regained Consciousness!
          </div>
          <div style="margin-bottom:6px;">
            <strong>Endurance FEAT:</strong> ${color.toUpperCase()} (rolled ${roll})
          </div>
          <div style="margin-bottom:6px;">
            <strong>Result:</strong> Success - Conscious with ${enduranceValue} Health
          </div>
          <div style="background:#c8e6c9;padding:8px;margin-top:8px;border-radius:3px;text-align:center;">
            <strong>Health: 0 → ${enduranceValue}</strong>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });

      ui.notifications.info(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Consciousness regained:", {
          actor: actor.name,
          roll,
          color,
          health: enduranceValue
        });
      }

      // Remove Dying effect if present (they're awake, no longer dying)
      const dyingEffect = actor.effects.find(e => 
        e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
      );
      if (dyingEffect) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [dyingEffect.id], { mshIntentional: true });
        
        if (game.settings.get(SCOPE, "debugMode")) {
          console.log(`FASERIP | Removed Dying effect from ${actor.name} (regained consciousness)`);
        }
      }
      
      // Update Impaired Endurance timestamp
      const impairedEffect = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));
      if (impairedEffect) {
        await impairedEffect.update({
          [`flags.${SCOPE}.lastHealed`]: Date.now()
        });
      }

      return { success: true, message, rolled: roll, color };
      
    } else {
      // Failed - remain unconscious for 1-10 more rounds
      const rounds = Math.floor(Math.random() * 10) + 1;
      
      // Create new Unconscious effect
      const effectData = {
        name: `Unconscious (${rounds} rounds)`,
        icon: "icons/svg/unconscious.svg",
        origin: actor.uuid,
        flags: {
          [SCOPE]: {
            isStunned: true,
            fromConsciousnessFail: true
          }
        },
        duration: {
          rounds: rounds,
          startRound: game.combat?.round || 0
        }
      };
      
      await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

      const message = `${actor.name} failed to regain consciousness (unconscious ${rounds} more rounds)`;
      
      // Chat message
      await ChatMessage.create({
        content: `<div style="background:#ffebee;border:2px solid #ef5350;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#c62828;margin-bottom:8px;">
            <i class="fas fa-times-circle"></i> ${actor.name} Failed to Wake
          </div>
          <div style="margin-bottom:6px;">
            <strong>Endurance FEAT:</strong> ${color.toUpperCase()} (rolled ${roll})
          </div>
          <div style="margin-bottom:6px;">
            <strong>Result:</strong> Failed - Remains unconscious
          </div>
          <div style="background:#ffcdd2;padding:8px;margin-top:8px;border-radius:3px;text-align:center;">
            <strong>Unconscious for ${rounds} more rounds</strong>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });

      ui.notifications.warn(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Consciousness attempt failed:", {
          actor: actor.name,
          roll,
          color,
          unconsciousRounds: rounds
        });
      }

      return { success: false, message, rolled: roll, color, unconsciousRounds: rounds };
    }
  }

  /**
   * Stabilize a dying character (removes Dying and original Unconscious effects)
   * @param {Actor} actor - The dying actor
   * @returns {Promise<Object>} {success: boolean, message: string}
   */
  static async stabilizeDying(actor) {
    if (!actor) {
      return { success: false, message: "No actor provided" };
    }

    // Find and remove Dying effect
    const dyingEffect = actor.effects.find(e => 
      e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
    );
    
    if (!dyingEffect) {
      const msg = `${actor.name} is not dying`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Get original Endurance rank from Dying effect
    const originalEndurance = dyingEffect.getFlag(SCOPE, "originalEndurance");
    const currentEndurance = actor.system.abilities.endurance.rank;

    // Remove Dying effect
    await actor.deleteEmbeddedDocuments("ActiveEffect", [dyingEffect.id], { mshIntentional: true });
    
    // Remove original Unconscious effect from death save (if present)
    const unconsciousFromDeathSave = actor.effects.find(e => 
      e.getFlag(SCOPE, "fromDeathSave")
    );
    if (unconsciousFromDeathSave) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [unconsciousFromDeathSave.id], { mshIntentional: true });
    }
    
    // Unconscious for 1-10 hours
    const hours = Math.floor(Math.random() * 10) + 1;
    
    const unconsciousEffect = {
      name: `Unconscious (${hours} hours)`,
      icon: "icons/svg/unconscious.svg",
      origin: actor.uuid,
      flags: {
        [SCOPE]: {
          isStunned: true,
          fromDeathSave: true,      // ← Changed from fromStabilization
          fromStabilization: true   // ← Keep this too for tracking
        }
      },
      duration: {
        rounds: hours * 600,
        startRound: game.combat?.round || 0
      }
    };
    
    await actor.createEmbeddedDocuments("ActiveEffect", [unconsciousEffect]);
    
    // Create or update Impaired Endurance effect if Endurance was reduced
    let impairedEffect = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));

    if (impairedEffect) {
      // Effect already exists from dying - update it with stabilization timestamp
      await impairedEffect.update({
        [`flags.${SCOPE}.lastHealed`]: Date.now(),
        [`flags.${SCOPE}.medicalCare`]: actor.getFlag(SCOPE, "medicalCare") ?? false
      });
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log(`✅ FASERIP | Updated existing Impaired Endurance effect for ${actor.name}`);
      }
    } else if (originalEndurance && currentEndurance !== originalEndurance) {
      // Effect doesn't exist yet (edge case - stabilized before losing a rank)
      const rankNames = [
        "Shift 0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
      ];
      
      const currentIndex = rankNames.indexOf(currentEndurance);
      const originalIndex = rankNames.indexOf(originalEndurance);
      
      if (currentIndex >= 0 && originalIndex >= 0 && currentIndex < originalIndex) {
        const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
        const daysUntilHealing = hasMedicalCare ? 1 : 7;
        
        const impairedEffectData = {
          name: `Impaired Endurance (${currentEndurance} of ${originalEndurance})`,
          icon: "icons/svg/blood.svg",
          origin: actor.uuid,
          statuses: ["impaired-endurance"],
          flags: {
            [SCOPE]: {
              isImpairedEndurance: true,
              originalEndurance: originalEndurance,
              currentEndurance: currentEndurance,
              lastHealed: Date.now(),
              medicalCare: hasMedicalCare
            },
            core: { statusId: "impaired-endurance" }
          },
          duration: {
            rounds: daysUntilHealing * 600 * 24,
            startRound: game.combat?.round || 0
          },
          changes: [{
            key: "system.columnShift",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: "-2"
          }]
        };
        
        await actor.createEmbeddedDocuments("ActiveEffect", [impairedEffectData]);
        
        if (game.settings.get(SCOPE, "debugMode")) {
          console.log(`✅ FASERIP | Created Impaired Endurance effect for ${actor.name}`);
        }
      }
    }
    
    const message = `${actor.name} stabilized! Unconscious for ${hours} hours. Endurance impaired (${currentEndurance} of ${originalEndurance}).`;
    
    await ChatMessage.create({
      content: `<div style="background:#e8f5e9;border:2px solid #4CAF50;padding:10px;border-radius:5px;">
        <div style="font-size:1.2em;font-weight:bold;color:#2e7d32;margin-bottom:8px;">
          <i class="fas fa-medkit"></i> ${actor.name} Stabilized!
        </div>
        <div>Dying halted - unconscious for ${hours} hours</div>
        <div>Endurance impaired: ${currentEndurance} of ${originalEndurance} (-2CS penalty)</div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
    
    ui.notifications.info(message);
    
    return { success: true, message };
  }

  /**
   * Heal one rank of impaired Endurance
   * Rules: 1 rank/week normal, 1 rank/day with medical care
   * @param {Actor} actor - The actor to heal
   * @param {boolean} medicalCare - Whether under medical care (daily vs weekly healing)
   * @returns {Promise<Object>} {success: boolean, message: string, rankRestored: string|null}
   */
  static async healImpairedEndurance(actor, medicalCare = false) {
    if (!actor) {
      return { success: false, message: "No actor provided" };
    }

    // Find Impaired Endurance effect
    const impairedEffect = actor.effects.find(e => 
      e.getFlag(SCOPE, "isImpairedEndurance")
    );
    
    if (!impairedEffect) {
      return { success: false, message: `${actor.name} does not have impaired Endurance` };
    }

    const originalEndurance = impairedEffect.getFlag(SCOPE, "originalEndurance");
    const currentEndurance = actor.system.abilities.endurance.rank;
    const lastHealed = impairedEffect.getFlag(SCOPE, "lastHealed") || 0;
    
    // Check if enough time has passed
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const weekInMs = 7 * dayInMs;
    const requiredTime = medicalCare ? dayInMs : weekInMs;
    const timeSinceHealing = now - lastHealed;
    
    if (timeSinceHealing < requiredTime) {
      const timeRemaining = requiredTime - timeSinceHealing;
      const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000));
      return { 
        success: false, 
        message: `${actor.name} needs ${hoursRemaining} more hours before healing another Endurance rank` 
      };
    }

    // Get rank names for display
    const rankNames = [
      "Shift 0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
    ];
    
    const currentRankIndex = rankNames.indexOf(currentEndurance);
    const originalRankIndex = rankNames.indexOf(originalEndurance);
    
    if (currentRankIndex === -1 || originalRankIndex === -1) {
      return { success: false, message: "Invalid Endurance rank data" };
    }

    // Calculate new Endurance rank (increase by 1 step)
    const newRankIndex = Math.min(currentRankIndex + 1, originalRankIndex);
    
    if (newRankIndex === currentRankIndex) {
      return { success: false, message: `${actor.name}'s Endurance is already at maximum (${originalEndurance})` };
    }

    const newRank = rankNames[newRankIndex];
    const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
    const newHealthMax = (actor.system.abilities.fighting.value || 0) +
                         (actor.system.abilities.agility.value || 0) +
                         (actor.system.abilities.strength.value || 0) +
                         newValue;

    // Update actor Endurance rank, value, and derived health max
    await actor.update({
      "system.abilities.endurance.rank": newRank,
      "system.abilities.endurance.value": newValue,
      "system.attributes.health.max": newHealthMax
    });

    // Check if fully healed
    if (newRankIndex >= originalRankIndex) {
      // Remove Impaired Endurance effect
      await actor.deleteEmbeddedDocuments("ActiveEffect", [impairedEffect.id], { mshIntentional: true });
      
      const message = `${actor.name}'s Endurance fully restored to ${originalEndurance}!`;
      
      await ChatMessage.create({
        content: `<div style="background:#e8f5e9;border:2px solid #4CAF50;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#2e7d32;">
            <i class="fas fa-heart"></i> ${actor.name} Fully Recovered!
          </div>
          <div>Endurance restored to ${originalEndurance} - no more penalties!</div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
      
      ui.notifications.info(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Endurance fully restored:", {
          actor: actor.name,
          from: currentEndurance,
          to: newRank
        });
      }
      
      return { success: true, message, rankRestored: newRank };
    } else {
      // Update effect to reflect new rank and reset timer
      const daysUntilNextHealing = medicalCare ? 1 : 7;
      
      await impairedEffect.update({
        name: `Impaired Endurance (${newRank} of ${originalEndurance})`,
        [`flags.${SCOPE}.currentEndurance`]: newRank,
        [`flags.${SCOPE}.lastHealed`]: now,
        [`flags.${SCOPE}.medicalCare`]: medicalCare,
        "duration.rounds": daysUntilNextHealing * 600 * 24,
        "duration.startRound": game.combat?.round || 0
      });
      
      const careNote = medicalCare ? " (with medical care)" : "";
      const message = `${actor.name} healed 1 Endurance rank${careNote}: ${currentEndurance} → ${newRank}`;
      
      await ChatMessage.create({
        content: `<div style="background:#fff3e0;border:2px solid #FF9800;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#e65100;">
            <i class="fas fa-heart-pulse"></i> Endurance Healing
          </div>
          <div>${actor.name}: ${newRank} of ${originalEndurance}${careNote}</div>
          <div style="margin-top:6px;color:#555;">-2CS penalty continues until fully healed</div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
      
      ui.notifications.info(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Endurance rank healed:", {
          actor: actor.name,
          from: currentEndurance,
          to: newRank,
          remaining: originalRankIndex - newRankIndex
        });
      }
      
      return { success: true, message, rankRestored: newRank };
    }
  }
}

/**
 * Update damage timestamp when actor takes damage.
 * Also interrupts any ongoing effects flagged with interruptOnDamage.
 * @param {Actor} actor - The actor taking damage
 */
export async function recordDamage(actor) {
  const now = Date.now();
  const worldNow = game.time?.worldTime ?? 0;
  await actor.setFlag(SCOPE, "lastDamageTime", now);
  await actor.setFlag(SCOPE, "lastDamageWorldTime", worldNow);

  // Interrupt all ongoing effects that are damage-sensitive
  try {
    const { interruptOngoingEffects } = await import("./effects/ongoing-engine.js");
    await interruptOngoingEffects(actor);
  } catch (e) {
    console.warn("[FASERIP WARN] interruptOngoingEffects failed, falling back to legacy:", e);
    // Legacy fallback: interrupt regeneration AEs directly
    for (const ef of actor.effects) {
      if (ef.disabled) continue;
      const flags = ef.flags?.[SCOPE];
      if (flags?.effectType === "regeneration" || flags?.ongoingId) {
        await ef.update({ disabled: true });
      }
    }
  }

  if (game.settings.get(SCOPE, "debugMode")) {
    console.log(`FASERIP | Damage timestamp recorded for ${actor.name} (worldTime: ${worldNow})`);
  }
}

/**
 * Initialize the rest system
 */
export function initRestSystem() {
  game.msh = game.msh || {};
  game.msh.rest = RestSystem;
  game.msh.recordDamage = recordDamage;
  
  // Expose convenience functions for common operations
  game.msh.healEndurance = (actor, medicalCare = false) => RestSystem.healImpairedEndurance(actor, medicalCare);
  
  console.log("FASERIP | Rest system initialized");
  
  // Register hook for automatic consciousness attempts
  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    // Only GM should handle this to avoid duplicates
    if (!game.user.isGM) return;
    
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    
    // Check if this was an Unconscious effect
    const wasUnconsciousEffect = effect.name?.toLowerCase().includes("unconscious") || 
                                  effect.name?.toLowerCase().includes("stunned");
    
    if (!wasUnconsciousEffect) return;
    
    // Check if actor is still at 0 HP
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    if (currentHealth > 0) return; // Already conscious

        // Check if actor is dead
    if (actor.system?.details?.isDead) {
      if (game.settings.get(getFlagScope(), "debugMode")) {
        console.log(`FASERIP | ${actor.name} is dead - skipping consciousness attempt`);
      }
      return;
    }
    
    // Check if still dying
    const hasDyingEffect = actor.effects.find(e => 
      e.getFlag(getFlagScope(), "isDying") || e.statuses?.has?.("dying")
    );
    
    if (hasDyingEffect) {
      if (game.settings.get(getFlagScope(), "debugMode")) {
        console.log(`FASERIP | ${actor.name} is still dying - skipping consciousness attempt`);
      }
      return;
    }
    
    // Check if this was from a death save (not from consciousness attempt)
    const fromDeathSave = effect.getFlag(getFlagScope(), "fromDeathSave");
    const fromConsciousnessFail = effect.getFlag(getFlagScope(), "fromConsciousnessFail");
    
    if (!fromDeathSave && !fromConsciousnessFail) return; // Not our effect
    
    if (game.settings.get(getFlagScope(), "debugMode")) {
      console.log("FASERIP | Unconscious effect expired for", actor.name, "- checking consciousness attempt");
    }
    
    // Import resolveCombatMode
    const { resolveCombatMode } = await import("./actions/action-dispatcher.js");
    const mode = resolveCombatMode(actor) || "manual";
    
    if (mode === "full") {
      // Full auto: automatically attempt consciousness
      console.log("FASERIP | Full auto mode - automatically attempting consciousness for", actor.name);
      await RestSystem.attemptRegainConsciousness(actor);
      
    } else if (mode === "semi") {
      // Semi mode: show button
      await ChatMessage.create({
        content: `<div style="background:#fff3e0;border:2px solid #ff9800;padding:10px;border-radius:5px;">
          <div style="font-size:1.1em;font-weight:bold;color:#e65100;margin-bottom:8px;">
            <i class="fas fa-exclamation-triangle"></i> ${actor.name} May Attempt to Regain Consciousness
          </div>
          <div style="margin-bottom:10px;color:#555;">
            The unconscious period has ended. Attempt an Endurance FEAT to wake up.
          </div>
          <button class="regain-consciousness-button" 
                  data-actor-id="${actor.id}"
                  style="width:100%;background:#ff9800;color:white;border:none;padding:10px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:1.1em;">
            <i class="fas fa-dice-d20"></i> Attempt to Regain Consciousness
          </button>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
      
    } else {
      // Manual mode: do nothing, GM/player handles it
      console.log("FASERIP | Manual mode - consciousness attempt not automatic for", actor.name);
    }
  });
  
  // Register click handler for consciousness buttons
  Hooks.on("renderChatMessage", (message, html) => {
    html.find(".regain-consciousness-button").click(async (event) => {
      const actorId = event.currentTarget.dataset.actorId;
      const actor = game.actors.get(actorId);
      
      if (!actor) {
        ui.notifications.error("Actor not found!");
        return;
      }
      
      await RestSystem.attemptRegainConsciousness(actor);
      
      // Disable button after use
      event.currentTarget.disabled = true;
      event.currentTarget.style.opacity = "0.5";
      event.currentTarget.textContent = "Already attempted";
    });
  });
}