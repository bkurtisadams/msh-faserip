// combat-handler.js
import { 
    calculateChargeDamage, 
    calculateSlamDamage, 
    getGrandSlamDistance,
    processChargeAttack,
    initializeSlamHandlers  // Add this
} from './charge-damage.js';

// location: systems/msh-faserip/scripts/combat-handler.js
const ACTION_RESULT_LABELS = {
  BA: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
  EA: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  Sh: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  TE: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  TB: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
  En: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  Fo: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
  Gp: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
  Gb: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
  Es: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
  Ch: { white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
  Do: { white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
  Ev: { white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
  Bl: { white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
  Ca: { white: "Miss", green: "Catch", yellow: "Catch", red: "No" },
  St: { white: "1–10", green: "1", yellow: "No Effect", red: "No" },
  Sl: { white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
  Ki: { white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
};

// Helper function for resistance - moved outside to avoid scoping issues
function isResistanceApplicable(damageType, resistanceType) {
    const normalizedDamageType = damageType.toLowerCase();
    const normalizedResistanceType = resistanceType.toLowerCase();
    
    // CRITICAL: Map Energy-Energy to electricity for game balance
    // Lightning bolts and electrical energy attacks should trigger electricity resistance
    if ((normalizedDamageType === "energy-energy" || normalizedDamageType.includes("lightning")) && 
        normalizedResistanceType === "electricity") {
        console.log("✅ Energy-Energy/Lightning matches Electricity resistance");
        return true;
    }
    
    // Fire/Heat attacks match fire resistance
    if ((normalizedDamageType.includes("fire") || normalizedDamageType.includes("heat")) && 
        (normalizedResistanceType === "fire" || normalizedResistanceType === "heat")) {
        return true;
    }
    
    // Cold/Ice attacks match cold resistance
    if ((normalizedDamageType.includes("cold") || normalizedDamageType.includes("ice")) && 
        normalizedResistanceType === "cold") {
        return true;
    }
    
    // Radiation attacks match radiation resistance
    if (normalizedDamageType.includes("radiation") && normalizedResistanceType === "radiation") {
        return true;
    }
    
    // Toxin/Poison attacks match toxin resistance
    if ((normalizedDamageType.includes("toxin") || normalizedDamageType.includes("poison")) && 
        (normalizedResistanceType === "toxin" || normalizedResistanceType === "toxins")) {
        return true;
    }
    
    // Corrosive/Acid attacks match corrosive resistance
    if ((normalizedDamageType.includes("corrosive") || normalizedDamageType.includes("acid")) && 
        (normalizedResistanceType === "corrosive" || normalizedResistanceType === "corrosives")) {
        return true;
    }
    
    // Mental attacks match mental resistance
    if (normalizedDamageType.includes("mental") && !normalizedDamageType.includes("emotion") &&
        normalizedResistanceType === "mental") {
        return true;
    }
    
    // Emotion attacks match emotion resistance
    if (normalizedDamageType.includes("emotion") && normalizedResistanceType === "emotion") {
        return true;
    }
    
    // Magical attacks match magical resistance
    if ((normalizedDamageType.includes("magic") || normalizedDamageType.includes("magical")) && 
        (normalizedResistanceType === "magic" || normalizedResistanceType === "magical")) {
        return true;
    }
    
    // Disease attacks match disease resistance
    if (normalizedDamageType.includes("disease") && normalizedResistanceType === "disease") {
        return true;
    }
    
    // Physical attacks (general) match physical resistance
    if (normalizedDamageType.includes("physical") && normalizedResistanceType === "physical") {
        return true;
    }
    
    // Energy attacks (general) - but be careful not to overlap with specific types
    if (normalizedDamageType.includes("energy") && normalizedResistanceType === "energy" &&
        !normalizedDamageType.includes("energy-energy")) { // Don't match generic energy to electrical attacks
        return true;
    }
    
    // Direct match
    if (normalizedDamageType === normalizedResistanceType) {
        return true;
    }
    
    // Invulnerability check (Class 1000 resistance)
    if (normalizedResistanceType.includes("invulnerability")) {
        const invulType = normalizedResistanceType.replace("invulnerability", "").replace("to", "").trim();
        if (invulType) {
            return isResistanceApplicable(damageType, invulType);
        }
    }
    
    return false;
}

export class CombatHandler {

    /**
     * Main function to process a damage-dealing attack.
     * @param {Object} attackData - Information about the attack.
     *   - attacker: Actor object of the attacker.
     *   - target: Actor object of the target.
     *   - baseDamage: The initial damage value (number).
     *   - damageType: String like "Physical-Edged", "Energy-Fire", "Force", "Mental".
     *   - sourceName: Name of the power/weapon/ability causing damage.
     *   - canBeStun: Boolean, if a Stun result is possible from the attack.
     *   - canBeSlam: Boolean, if a Slam result is possible.
     *   - canBeKill: Boolean, if a Kill result is possible.
     *   - originalRollResult: The color result from the Universal Table (e.g., "Green", "Yellow", "Red").
     * @param {Object} options - Additional options for the roll.
     *   - skipDefenseDialog: Boolean, if true, tries to auto-apply defenses (GM only maybe).
     */
    static async processAttack(attackData, options = {}) {
    const {
        attacker, target, baseDamage, damageType, sourceName,
        canBeStun = false, canBeSlam = false, canBeKill = false,
        originalRollResult = "green"
    } = attackData;

    if (!target) {
        ui.notifications.warn("No target specified for damage.");
        return;
    }

    // Make sure we have actor references
    const attackerActor = attacker.actor || attacker;
    const targetActor = target.actor || target;
    
    console.log(`Process Attack: Using attacker: ${attackerActor.name}`);
    console.log(`Process Attack: Using target: ${targetActor.name}`);
    console.log("Process Attack options:", options);

    // Handle multiple attack penalties
    if (options.multipleAttackPenalty) {
        console.log(`Applying multiple attack penalty: ${options.multipleAttackPenalty}CS`);
        // This penalty will need to be applied to the actual roll in the calling function
        // Since processAttack doesn't do the rolling, just the damage processing
    }

    // 1. Get Defenses from Target
    let defenseData = await this.getTargetDefenses(target, damageType, baseDamage, options);

    // 2. Handle special ammunition effects BEFORE damage calculation
    let modifiedBaseDamage = baseDamage;
    let specialEffects = options.specialEffects || {};
    let modifiedCanBeSlam = canBeSlam; // Create a modifiable copy
    
    // Handle Mercy Shot - converts damage to knockout effect
    if (options.ammoType === "mercy") {
        if (baseDamage > 0) {
            specialEffects.mercyKnockout = true;
            modifiedBaseDamage = 0; // No actual damage
            console.log("Mercy Shot: Converting damage to knockout effect");
        }
    }
    
    // Handle Explosive Shot - double damage
    if (options.ammoType === "explosive") {
        modifiedBaseDamage = baseDamage * 2;
        console.log(`Explosive Shot: Damage increased from ${baseDamage} to ${modifiedBaseDamage}`);
    }

    // Handle Rubber Shot - prevent slam effects
    if (options.ammoType === "rubber") {
        modifiedCanBeSlam = false; // Rubber shot ignores slam results
        console.log("Rubber Shot: Slam effects disabled");
    }

    // 3. Calculate Net Damage
    let netDamage = modifiedBaseDamage;
    let damageAbsorbed = 0;
    let defenseUsed = "None";
    let defenseDetails = [];

    // Check if it's an energy attack (affects body armor)
    const isEnergyAttack = damageType.toLowerCase().includes("energy");
    
    // Apply Body Armor first (if applicable)
    let effectiveBodyArmor = defenseData.bodyArmorValue;
    if (isEnergyAttack && effectiveBodyArmor > 0) {
        effectiveBodyArmor = Math.max(0, effectiveBodyArmor - 20);
        console.log(`Energy attack: Body Armor reduced from ${defenseData.bodyArmorValue} to ${effectiveBodyArmor}`);
    }
    
    if (effectiveBodyArmor > 0) {
        const armorAbsorbed = Math.min(netDamage, effectiveBodyArmor);
        netDamage -= armorAbsorbed;
        damageAbsorbed += armorAbsorbed;
        if (armorAbsorbed > 0) {
            defenseDetails.push(`Body Armor absorbed ${armorAbsorbed} damage`);
            defenseUsed = defenseUsed === "None" ? "Body Armor" : defenseUsed + " + Body Armor";
        }
    }

    // Apply Force Field (if applicable)
    let effectiveForceField = defenseData.forceFieldValue;
    if (!isEnergyAttack && effectiveForceField > 0) {
        effectiveForceField = Math.max(0, effectiveForceField - 10);
        console.log(`Physical attack: Force Field reduced from ${defenseData.forceFieldValue} to ${effectiveForceField}`);
    }
    
    if (effectiveForceField > 0 && netDamage > 0) {
        const ffAbsorbed = Math.min(netDamage, effectiveForceField);
        netDamage -= ffAbsorbed;
        damageAbsorbed += ffAbsorbed;
        if (ffAbsorbed > 0) {
            defenseDetails.push(`Force Field absorbed ${ffAbsorbed} damage`);
            defenseUsed = defenseUsed === "None" ? "Force Field" : defenseUsed + " + Force Field";
        }
    }

    // Apply Resistance (automatic damage reduction per FASERIP rules)
    if (defenseData.resistanceValue > 0 && netDamage > 0) {
        if (isResistanceApplicable(damageType, defenseData.resistanceType)) {
            console.log(`Target has ${defenseData.resistanceType} resistance at rank value ${defenseData.resistanceValue}`);
            
            // Resistance automatically reduces damage by its rank value
            const resistanceReduction = Math.min(netDamage, defenseData.resistanceValue);
            netDamage -= resistanceReduction;
            damageAbsorbed += resistanceReduction;
            
            if (resistanceReduction > 0) {
                defenseDetails.push(`${defenseData.resistanceType} Resistance absorbed ${resistanceReduction} damage`);
                defenseUsed = defenseUsed === "None" ? `${defenseData.resistanceType} Resistance` : defenseUsed + ` + ${defenseData.resistanceType} Resistance`;
            }
            
            // Check if attack intensity is below resistance rank (immunity to weak attacks)
            const attackIntensity = modifiedBaseDamage;
            if (attackIntensity < defenseData.resistanceValue) {
                console.log(`Attack intensity (${attackIntensity}) is below resistance rank (${defenseData.resistanceValue}) - NO EFFECT`);
                netDamage = 0;
                defenseDetails.push(`Attack too weak to affect ${defenseData.resistanceType} Resistance - NO EFFECT`);
            }
            
            console.log(`Resistance reduced damage by ${resistanceReduction}, remaining damage: ${netDamage}`);
        } else {
            console.log(`Resistance ${defenseData.resistanceType} does not apply to ${damageType} damage`);
        }
    }

    netDamage = Math.max(0, netDamage);
    // 3b. Apply passive armor from equipment-granted powers
    const allPowers = game.msh.getActorPowers(targetActor);
    console.log("All powers (including equipment-granted):", allPowers);

    const matchingArmor = allPowers.filter(p => p.isPassiveArmor &&
    (!p.damageType || p.damageType === damageType));
    console.log(`Matching passive armor powers for damageType "${damageType}":`, matchingArmor);

    if (matchingArmor.length > 0 && netDamage > 0) {
    // Use the highest-value passive armor that matches
    const armorPower = matchingArmor.reduce((best, curr) =>
        (curr.value ?? 0) > (best.value ?? 0) ? curr : best, { value: 0 });

    console.log("Selected armor power:", armorPower);

    const armorAbsorbed = Math.min(netDamage, armorPower.value ?? 0);
    console.log(`Passive armor will absorb ${armorAbsorbed} from net damage ${netDamage}`);

    netDamage -= armorAbsorbed;
    damageAbsorbed += armorAbsorbed;

    defenseDetails.push(`Passive Armor (${armorPower.name || "Unnamed"}) absorbed ${armorAbsorbed} damage`);
    defenseUsed = defenseUsed === "None" ? "Passive Armor" : `${defenseUsed} + Passive Armor`;

    console.log(`New netDamage after passive armor: ${netDamage}`);
    console.log(`Total damageAbsorbed so far: ${damageAbsorbed}`);
    } else {
    console.log("No applicable passive armor found or netDamage already 0");
    }


    console.log(`Damage calculation: ${modifiedBaseDamage} modified base - ${damageAbsorbed} absorbed = ${netDamage} net damage`);

    // Calculate health values and determine if target will reach zero health
    const currentHealth = targetActor.system.attributes.health.value;
    const newHealth = Math.max(0, currentHealth - netDamage);
    const willReachZeroHealth = newHealth <= 0;

    console.log(`Current health: ${currentHealth}, net damage: ${netDamage}, new health: ${newHealth}, will reach zero: ${willReachZeroHealth}`);

    // 🎵 ADD SFX HERE - RIGHT AFTER DAMAGE CALCULATION
    await this.playCombatSFX(damageType, sourceName, originalRollResult, {
        ...options,
        netDamage: netDamage,
        damageAbsorbed: damageAbsorbed,
        attackerActor: attackerActor,
        targetActor: targetActor
    });

    // 4. Apply Net Damage to Target Health
    const isToken = target.document?.documentName === "Token" || target.documentName === "Token";
    const targetTokenData = isToken ? (target.document || target) : null;
    const isUnlinkedToken = isToken && targetTokenData && !targetTokenData.actorLink;

    console.log(`Target is token: ${isToken}`);
    console.log(`Target is unlinked token: ${isUnlinkedToken}`);
    console.log(`Target name: ${targetActor.name}`);

    console.log("Before health update:", currentHealth);
    console.log("Net damage applied:", netDamage);
    console.log("New health to set:", newHealth);

    const update = { "system.attributes.health.value": newHealth };

    try {
    if (isUnlinkedToken && (game.user.isGM || targetActor.isOwner)) {
        // Update the token’s own data if it’s an unlinked token
        await target.document.update(update);
    } else if (game.user.isGM || targetActor.isOwner) {
        // Update the actor directly
        await targetActor.update(update);
    } else if (game.msh?.socket?.executeAsGM) {
        // If you’ve got a socketlib GM helper wired up
        await game.msh.socket.executeAsGM("adjustTargetHealth", {
        targetActorUuid: targetActor.uuid,
        newHealth
        });
    } else {
        ui.notifications.warn("Couldn’t update Health: no GM helper available.");
    }
    } catch (err) {
    console.error("Health update failed:", err);
    }

    console.log("After health update:", targetActor.system.attributes.health.value);


    // 5. Create chat message
    let defenseSummary = defenseDetails.length > 0 ? defenseDetails.join("; ") : "No defenses applied";

    let chatContent = `
    <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
    <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
        <strong>Damage Resolution: ${sourceName} vs ${target.name}</strong>
    </div>
    <div style="padding: 5px 10px; font-size: 0.9em;">
        <div><strong>Base Damage:</strong> ${baseDamage}${modifiedBaseDamage !== baseDamage ? ` → ${modifiedBaseDamage}` : ''} (${damageType})</div>
        ${options.ammoType && options.ammoType !== "standard" ? `<div><strong>Ammunition:</strong> ${options.ammoType.charAt(0).toUpperCase() + options.ammoType.slice(1)}</div>` : ''}
        <div><strong>Defenses:</strong> ${defenseSummary}</div>
        <div><strong>Total Damage Absorbed:</strong> ${damageAbsorbed}</div>
        <div><strong>Net Damage Applied:</strong> ${netDamage}</div>
        <div><strong>Health:</strong> ${currentHealth} → ${newHealth}</div>
    </div>
    </div>
    `;

    // 6. Handle special ammunition effects AFTER chat content is defined
    if (specialEffects.mercyKnockout && modifiedBaseDamage === 0 && baseDamage > 0) {
        await this.rollSecondaryFeat(target, "Stun", `${sourceName} (Mercy Shot Knockout)`);
        chatContent += `<p><strong>Mercy Shot:</strong> Remarkable intensity knockout drug applied!</p>`;
    }

    if (options.ammoType === "rubber" && originalRollResult.toLowerCase() === "yellow" && canBeSlam) {
        chatContent += `<p><strong>Rubber Shot:</strong> Slam result ignored (rubber ammunition).</p>`;
    }

    // 7. Handle Secondary Effects - USE modifiedCanBeSlam instead of canBeSlam
    let secondaryEffectResult = "";
        if (netDamage > 0 && !willReachZeroHealth) { // BUT ONLY if target won't reach 0 Health
            if (damageType.toLowerCase().includes("blunt")) {
                if (originalRollResult.toLowerCase() === "yellow" && modifiedCanBeSlam) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Slam", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Slam Check:</strong> ${secondaryEffectResult}</p>`;
                } else if (originalRollResult.toLowerCase() === "red" && canBeStun) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
                }
            } else if (damageType.toLowerCase().includes("edged")) {
                // Edged attack effects
                if (originalRollResult.toLowerCase() === "yellow" && canBeStun) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
                } else if (originalRollResult.toLowerCase() === "red" && canBeKill) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Kill", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Kill Check:</strong> ${secondaryEffectResult}</p>`;
                }
            } else if (damageType.toLowerCase().includes("energy")) {
                // Energy attack effects
                if (originalRollResult.toLowerCase() === "yellow" && canBeStun) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
                } else if (originalRollResult.toLowerCase() === "red" && canBeKill) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Kill", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Kill Check:</strong> ${secondaryEffectResult}</p>`;
                }
            } else if (damageType.toLowerCase().includes("force")) {
                // Force attack effects
                if (originalRollResult.toLowerCase() === "yellow" && canBeStun) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
                } else if (originalRollResult.toLowerCase() === "red" && canBeStun) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
                }
            } else if (damageType.toLowerCase().includes("shooting")) {
                // Shooting attack effects
                if (originalRollResult.toLowerCase() === "yellow" && canBeSlam) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Slam", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Bullseye/Slam Check:</strong> ${secondaryEffectResult}</p>`;
                } else if (originalRollResult.toLowerCase() === "red" && canBeKill) {
                    secondaryEffectResult = await this.rollSecondaryFeat(target, "Kill", sourceName, damageType, attacker);
                    chatContent += `<p><strong>Kill Check:</strong> ${secondaryEffectResult}</p>`;
                }
            }
        } else if (netDamage > 0 && willReachZeroHealth) {
            chatContent += `<p>Target reduced to 0 Health - unconsciousness supersedes other effects.</p>`;
        } else if ((canBeStun && (originalRollResult.toLowerCase() === "yellow" || originalRollResult.toLowerCase() === "red")) ||
                    (canBeSlam && originalRollResult.toLowerCase() === "yellow") ||
                    (canBeKill && originalRollResult.toLowerCase() === "red")) {
            chatContent += `<p>No damage inflicted; secondary effects (Stun/Slam/Kill) are negated.</p>`;
        }

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: attacker}),
            content: chatContent
            // You might want to whisper this to GM and target or make it public
        });

        // 6. Check for Unconsciousness / Death if Health is 0
        if (newHealth <= 0) {
            const isLethalDamage = 
                damageType.toLowerCase().includes("energy") || 
                damageType.toLowerCase().includes("edged") || 
                damageType.toLowerCase().includes("shooting");
                
            await this.handleZeroHealth(target, attacker, isLethalDamage);
        }

        console.log("CombatHandler.processAttack completed");
    }

    /**
     * Process multiple attacks (2-3 attacks with Fighting FEAT)
     * @param {Object} attackData - Standard attack data
     * @param {Object} multiAttackOptions - { attackCount: 2|3, fightingFeatSuccess: boolean }
     * @param {Object} options - Standard options
     */
    static async processMultipleAttacks(attackData, multiAttackOptions, options = {}) {
        const { attackCount, fightingFeatSuccess } = multiAttackOptions;
        const { attacker, target, baseDamage, damageType, sourceName } = attackData;
        
        console.log(`Processing ${attackCount} attacks, FEAT success: ${fightingFeatSuccess}`);
        
        if (!fightingFeatSuccess) {
            // Failed FEAT: Only 1 attack at -3CS
            console.log("Fighting FEAT failed - single attack at -3CS");
            
            // Apply -3CS penalty to the attack (this would need to be handled in the calling function)
            await this.processAttack({
                ...attackData,
                sourceName: `${sourceName} (Failed Multiple Attack)`
            }, {
                ...options,
                multipleAttackPenalty: -3
            });
            
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: attacker }),
                content: `
                    <div style="background-color: #ffebee; border: 1px solid #f44336; border-radius: 3px; padding: 8px; margin: 5px 0;">
                        <div style="color: #d32f2f; font-weight: bold; margin-bottom: 5px;">Multiple Attack Failed</div>
                        <div style="font-size: 0.9em;">
                            <div>${attacker.name} failed the Fighting FEAT for multiple attacks.</div>
                            <div>Result: Single attack only, at -3CS penalty.</div>
                        </div>
                    </div>
                `
            });
            return;
        }
        
        // Successful FEAT: Multiple attacks at -1CS each
        console.log(`Fighting FEAT succeeded - ${attackCount} attacks at -1CS each`);
        
        const attackResults = [];
        
        for (let i = 1; i <= attackCount; i++) {
            console.log(`Processing attack ${i} of ${attackCount}`);
            
            // Each attack is processed separately with -1CS penalty
            const result = await this.processAttack({
                ...attackData,
                sourceName: `${sourceName} (Attack ${i}/${attackCount})`
            }, {
                ...options,
                multipleAttackPenalty: -1,
                attackNumber: i,
                totalAttacks: attackCount
            });
            
            attackResults.push(result);
            
            // Small delay between attacks for better visual flow
            if (i < attackCount) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Summary message
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: attacker }),
            content: `
                <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px; margin: 5px 0;">
                    <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">Multiple Attack Sequence Complete</div>
                    <div style="font-size: 0.9em;">
                        <div>${attacker.name} completed ${attackCount} attacks against ${target.name}.</div>
                        <div>Each attack was made at -1CS due to multiple attack rules.</div>
                    </div>
                </div>
            `
        });
        
        return attackResults;
    }

    // Add this to combat-handler.js as a static method of CombatHandler

    /**
     * Roll Fighting FEAT for multiple attacks and return the result
     * @param {Actor} actor - The actor attempting multiple attacks  
     * @param {Number} attackCount - Number of attacks (2 or 3)
     * @returns {Object} - {success: boolean, intensity: string, roll: Roll}
     */
    static async rollMultipleAttackFeat(actor, attackCount, options = {}) {
        const intensity = attackCount === 2 ? "Remarkable" : "Amazing";
        
        // Use the effective/power-modified rank if provided, otherwise fall back to base rank
        const fightingRank = options.effectiveFightingRank || actor.system.abilities.fighting.rank;
        const fightingValue = options.effectiveFightingValue || actor.system.abilities.fighting.value;
        
        // Get available Karma
        const availableKarma = actor.system.attributes.karma.value || 0;
        
        // Create dialog content
        const dialogContent = `
            <div style="text-align: center;">
                <h2>${actor.name} - Multiple Attack FEAT</h2>
                <p>Attempting <strong>${attackCount} attacks</strong> requires a Fighting FEAT roll.</p>
                <div style="margin: 10px 0;">
                    <p>Fighting Rank: <strong>${fightingRank}</strong></p>
                    <p>Required Intensity: <strong>${intensity}</strong></p>
                    <hr style="margin: 10px 0;">
                    <div>
                        <label>Spend Karma Points:</label>
                        <input type="number" id="karma-points" min="0" max="${availableKarma}" value="0" style="width: 60px;">
                        <span style="margin-left: 5px; font-size: 0.9em; color: #666;">(Available: ${availableKarma})</span>
                    </div>
                </div>
            </div>
        `;
        
        // Show dialog to player
        return new Promise((resolve) => {
            new Dialog({
                title: `Multiple Attack FEAT (${attackCount} attacks)`,
                content: dialogContent,
                buttons: {
                    roll: {
                        icon: '<i class="fas fa-dice-d20"></i>',
                        label: "Roll FEAT",
                        callback: async (html) => {
                            const karmaSpent = Math.min(
                                parseInt(html.find('#karma-points').val()) || 0,
                                availableKarma
                            );
                            
                            // Create the roll
                            const roll = new Roll("1d100");
                            await roll.evaluate();
                            
                            const totalRoll = Math.min(100, roll.total + karmaSpent);
                            // DEBUG LINES:
                            console.log(`🎯 MULTIPLE ATTACK DEBUG:`);
                            console.log(`   attackCount: ${attackCount}`);
                            console.log(`   intensity: ${intensity}`);
                            console.log(`   fightingRank: ${fightingRank}`);
                            console.log(`   totalRoll: ${totalRoll}`);
                            const resultColor = game.msh.rollUniversalTable(fightingRank, totalRoll);
                            
                            // Determine success based on intensity requirement
                            /* let success = false;
                            switch (intensity) {
                                case "Remarkable":
                                    success = ["green", "yellow", "red"].includes(resultColor.toLowerCase());
                                    break;
                                case "Amazing":
                                    success = ["yellow", "red"].includes(resultColor.toLowerCase());
                                    break;
                            } */
                            
                            // Deduct karma if spent
                            if (karmaSpent > 0) {
                                await game.msh.runAsGM({
                                    operation: "update",
                                    targetActorUuid: actor.uuid,
                                    args: [{ "system.attributes.karma.value": availableKarma - karmaSpent }]
                                });
                                
                                // Add karma history
                                const history = foundry.utils.deepClone(actor.system.karma?.history || []);
                                history.push({
                                    realDate: new Date().toLocaleDateString(),
                                    gameDate: "",
                                    amount: -karmaSpent,
                                    type: "Multiple Attack FEAT",
                                    description: `Fighting FEAT for ${attackCount} attacks`
                                });
                                await game.msh.runAsGM({
                                    operation: "update",
                                    targetActorUuid: actor.uuid,
                                    args: [{ "system.karma.history": history }]
                                });
                            }
                            
                            // Create chat message for the FEAT result
                            await ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({ actor }),
                                content: `
                                    <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                                        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                                            <strong>${actor.name} - Multiple Attack FEAT</strong>
                                        </div>
                                        <div style="padding: 5px 10px; font-size: 0.9em;">
                                            <div>Attempting: ${attackCount} attacks</div>
                                            <div>Required Intensity: ${intensity}</div>
                                            <div>Fighting Rank: ${fightingRank} (${fightingValue})</div>
                                            <div>Roll: ${roll.total} + Karma: ${karmaSpent} = ${totalRoll}</div>
                                        </div>
                                        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                                            background-color: #4A90E2; color: white;">
                                            RESULT: ${resultColor.toUpperCase()}
                                        </div>
                                    </div>
                                `
                            });
                            
                            resolve({ intensity, roll, totalRoll, resultColor });
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve({ success: false, intensity, cancelled: true })
                    }
                },
                default: "roll"
            }).render(true);
        });
    }

    static async playCombatSFX(damageType, sourceName, rollResult, options = {}) {
        console.log("=== playCombatSFX Debug Start ===");
        console.log("Input parameters:");
        console.log("  damageType:", damageType);
        console.log("  sourceName:", sourceName);
        console.log("  rollResult:", rollResult);
        console.log("  options:", options);
        
        let soundPath = null;
        let volume = 0.8; // default volume
        
        // Determine if this was a hit or miss
        const isHit = rollResult.toLowerCase() !== "white";
        const isMiss = rollResult.toLowerCase() === "white";
        
        console.log("Hit/Miss status:", isHit ? "HIT" : "MISS");
        
        // Determine sound based on damage type and source
        const lowerDamageType = damageType.toLowerCase();
        const lowerSourceName = sourceName.toLowerCase();
        
        console.log("Converted to lowercase:");
        console.log("  lowerDamageType:", lowerDamageType);
        console.log("  lowerSourceName:", lowerSourceName);
        
        // Weapon-specific sounds (check most specific first)
        if (lowerSourceName.includes("sub-machine gun") || lowerSourceName.includes("submachine gun")) {
            console.log("Match found: sub-machine gun");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/submachine-gun.wav" : "systems/msh-faserip/assets/sfx/submachine-gun-miss.wav";
        } else if (lowerSourceName.includes("machine gun")) {
            console.log("Match found: machine gun");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/machine-gun.wav" : "systems/msh-faserip/assets/sfx/machine-gun-miss.wav";
        } else if (lowerSourceName.includes("rifle")) {
            console.log("Match found: rifle");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/rifle.wav" : "systems/msh-faserip/assets/sfx/rifle-miss.wav";
        } else if (lowerSourceName.includes("shotgun")) {
            console.log("Match found: shotgun");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/shotgun.wav" : "systems/msh-faserip/assets/sfx/shotgun-miss.wav";
        } else if (lowerSourceName.includes("pistol") || lowerSourceName.includes("gun")) {
            console.log("Match found: pistol/gun");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/gunshot.wav" : "systems/msh-faserip/assets/sfx/gunshot-miss.wav";
        }
        // Damage type sounds (fallback)
        else if (lowerDamageType.includes("shooting")) {
            console.log("Match found: shooting damage type");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/gunshot.wav" : "systems/msh-faserip/assets/sfx/gunshot-miss.wav";
        } else if (lowerDamageType.includes("blunt")) {
            console.log("Match found: blunt damage type");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/punch.wav" : "systems/msh-faserip/assets/sfx/punch-miss.wav";
        } else if (lowerDamageType.includes("edged")) {
            console.log("Match found: edged damage type");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/blade.wav" : "systems/msh-faserip/assets/sfx/blade-miss.wav";
        } else if (lowerDamageType.includes("energy-fire")) {
            console.log("Match found: energy-fire damage type");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/fire-blast.wav" : "systems/msh-faserip/assets/sfx/fire-blast-miss.wav";
        } else if (lowerDamageType.includes("energy-energy")) {
            console.log("Match found: energy-energy damage type");
            soundPath = isHit ? "systems/msh-faserip/assets/sfx/lightning_bolt.wav" : "systems/msh-faserip/assets/sfx/lightning_bolt-miss.wav";
            volume = 1.0; // Make lightning louder
        } else {
            console.log("No weapon or damage type match found");
            // Generic hit/miss sounds as fallback
            if (isHit) {
                soundPath = "systems/msh-faserip/assets/sfx/generic-hit.wav";
            } else {
                soundPath = "systems/msh-faserip/assets/sfx/generic-miss.wav";
            }
        }
        
        console.log("Initial soundPath:", soundPath);
        
        // Play different sounds for critical results (only for hits)
        if (rollResult.toLowerCase() === "red" && soundPath && isHit) {
            console.log("Red result detected, checking for critical version");
            const criticalPath = soundPath.replace(".wav", "-critical.wav").replace(".ogg", "-critical.ogg");
            console.log("Critical path would be:", criticalPath);
            
            if (await this.soundFileExists(criticalPath)) {
                console.log("Critical version exists, using it");
                soundPath = criticalPath;
                volume = Math.min(volume * 1.2, 1.0); // Boost volume for critical hits
            } else {
                console.log("Critical version does not exist, keeping original");
            }
        }
        
        // Handle special ammunition (only for hits)
        if (options.ammoType === "explosive" && isHit) {
            console.log("Explosive ammo detected, overriding sound");
            soundPath = "systems/msh-faserip/sounds/explosion.wav";
            volume = 1.0;
        }
        
        console.log("Final soundPath:", soundPath);
        console.log("Final volume:", volume);
        
        if (soundPath) {
            console.log("Attempting to play sound:", soundPath, "at volume:", volume);
            try {
                await foundry.audio.AudioHelper.play({ src: soundPath, volume: volume, autoplay: true }, true);
                console.log("Sound play command executed successfully");
            } catch (error) {
                console.error("Error playing sound:", error);
            }
        } else {
            console.log("No sound to play - soundPath is null");
        }
        
        console.log("=== playCombatSFX Debug End ===");
    }

    static async soundFileExists(path) {
        try {
            const response = await fetch(path, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Rolls a resistance FEAT against incoming damage
     * @param {Object} target - The target with resistance
     * @param {String} resistanceType - Type of resistance (e.g., "physical", "fire")
     * @param {Number} resistanceValue - Rank value of the resistance
     * @param {Number} damageIntensity - The intensity to resist against
     * @param {String} sourceName - Name of the attack source
     * @returns {Object} { success: boolean, resultText: string }
     */
    /* static async rollResistanceFeat(target, resistanceType, resistanceValue, damageIntensity, sourceName) {
        const targetActor = target.actor || target;
        
        console.log("Rolling resistance FEAT for:", targetActor.name);
        console.log("Resistance type:", resistanceType, "Value:", resistanceValue);
        console.log("Damage intensity:", damageIntensity);
        
        // Find the resistance rank name from the value
        let resistanceRank = "Typical";
        for (const [rankName, rankValue] of Object.entries(CONFIG.FASERIP.rankValues)) {
            if (rankValue === resistanceValue) {
                resistanceRank = rankName;
                break;
            }
        }
        
        // Special handling for specific resistance types
        let featRank = resistanceRank;
        let featValue = resistanceValue;
        
        // Toxin, Emotion, Mental, and Disease resistances have minimum ranks
        const resistanceTypeLower = resistanceType.toLowerCase();
        
        if (resistanceTypeLower.includes("toxin")) {
            // Toxin resistance is minimum Endurance +1CS
            const enduranceValue = targetActor.system.abilities.endurance.value || 0;
            if (resistanceValue < enduranceValue) {
                featValue = enduranceValue + 10; // Approximate +1CS
                // Find the new rank
                for (const [rankName, rankValue] of Object.entries(CONFIG.FASERIP.rankValues)) {
                    if (rankValue >= featValue) {
                        featRank = rankName;
                        break;
                    }
                }
            }
        } else if (resistanceTypeLower.includes("emotion")) {
            // Emotion resistance is minimum Intuition +1CS
            const intuitionValue = targetActor.system.abilities.intuition.value || 0;
            if (resistanceValue < intuitionValue) {
                featValue = intuitionValue + 10;
                for (const [rankName, rankValue] of Object.entries(CONFIG.FASERIP.rankValues)) {
                    if (rankValue >= featValue) {
                        featRank = rankName;
                        break;
                    }
                }
            }
        } else if (resistanceTypeLower.includes("mental") && !resistanceTypeLower.includes("magical")) {
            // Mental resistance is minimum Psyche +1CS
            const psycheValue = targetActor.system.abilities.psyche.value || 0;
            if (resistanceValue < psycheValue) {
                featValue = psycheValue + 10;
                for (const [rankName, rankValue] of Object.entries(CONFIG.FASERIP.rankValues)) {
                    if (rankValue >= featValue) {
                        featRank = rankName;
                        break;
                    }
                }
            }
        } else if (resistanceTypeLower.includes("disease")) {
            // Disease resistance is minimum Endurance +1CS
            const enduranceValue = targetActor.system.abilities.endurance.value || 0;
            if (resistanceValue < enduranceValue) {
                featValue = enduranceValue + 10;
                for (const [rankName, rankValue] of Object.entries(CONFIG.FASERIP.rankValues)) {
                    if (rankValue >= featValue) {
                        featRank = rankName;
                        break;
                    }
                }
            }
        }
        
        // Get available Karma
        const availableKarma = targetActor.system.attributes.karma.value || 0;
        
        // Create dialog content
        const dialogContent = `
            <div style="text-align: center;">
                <h2>${targetActor.name} - ${resistanceType.charAt(0).toUpperCase() + resistanceType.slice(1)} Resistance FEAT</h2>
                <p>Attack from <strong>${sourceName}</strong> requires a resistance FEAT roll.</p>
                <div style="margin: 10px 0;">
                    <p>Resistance Rank: <strong>${featRank}</strong> (${featValue})</p>
                    <p>Damage Intensity: <strong>${damageIntensity}</strong></p>
                    <hr style="margin: 10px 0;">
                    <p style="font-size: 0.9em; color: #666;">
                        ${resistanceTypeLower.includes("toxin") ? "Using Toxin Resistance instead of Endurance" : ""}
                        ${resistanceTypeLower.includes("emotion") ? "Using Emotion Resistance instead of Intuition" : ""}
                        ${resistanceTypeLower.includes("mental") && !resistanceTypeLower.includes("magical") ? "Using Mental Resistance instead of Psyche" : ""}
                        ${resistanceTypeLower.includes("disease") ? "Using Disease Resistance instead of Endurance" : ""}
                    </p>
                    <div>
                        <label>Spend Karma Points:</label>
                        <input type="number" id="karma-points" min="0" max="${availableKarma}" value="0" style="width: 60px;">
                        <span style="margin-left: 5px; font-size: 0.9em; color: #666;">(Available: ${availableKarma})</span>
                    </div>
                </div>
            </div>
        `;
        
        // Show dialog to target player (or GM if NPC)
        return new Promise((resolve) => {
            const isPlayerOwned = targetActor.hasPlayerOwner;
            
            new Dialog({
                title: `${resistanceType.charAt(0).toUpperCase() + resistanceType.slice(1)} Resistance FEAT`,
                content: dialogContent,
                buttons: {
                    roll: {
                        icon: '<i class="fas fa-dice-d20"></i>',
                        label: "Roll Resistance",
                        callback: async (html) => {
                            const karmaSpent = Math.min(
                                parseInt(html.find('#karma-points').val()) || 0,
                                availableKarma
                            );
                            
                            const roll = new Roll("1d100");
                            await roll.evaluate();
                            
                            const totalRoll = Math.min(100, roll.total + karmaSpent);
                            const colorResult = game.msh.rollUniversalTable(featRank, totalRoll);
                            
                            // Determine success based on color result
                            // Generally, Green or better means success
                            let success = false;
                            if (["green", "yellow", "red"].includes(colorResult.toLowerCase())) {
                                success = true;
                            }
                            
                            // Handle karma spending
                            if (karmaSpent > 0) {
                                await game.msh.runAsGM({
                                    operation: "update",
                                    targetActorUuid: targetActor.uuid,
                                    args: [{ "system.attributes.karma.value": availableKarma - karmaSpent }]
                                });
                            }
                            
                            // Create result text
                            const resultText = success ? 
                                "Success - All damage negated!" : 
                                `Failed - Resistance provides ${featValue} armor value`;
                            
                            // Special handling for specific resistance types
                            let specialEffect = "";
                            if (success) {
                                if (resistanceTypeLower.includes("fire") || resistanceTypeLower.includes("heat")) {
                                    specialEffect = `<div style="color: #ff6600;">🔥 Fire/Heat of less than ${featRank} rank has no effect!</div>`;
                                } else if (resistanceTypeLower.includes("cold")) {
                                    specialEffect = `<div style="color: #4da6ff;">❄️ Cold/Ice of less than ${featRank} rank has no effect!</div>`;
                                } else if (resistanceTypeLower.includes("electricity")) {
                                    specialEffect = `<div style="color: #ffff00;">⚡ Electricity of less than ${featRank} rank has no effect!</div>`;
                                } else if (resistanceTypeLower.includes("radiation")) {
                                    specialEffect = `<div style="color: #00ff00;">☢️ Radiation of less than ${featRank} rank has no effect!</div>`;
                                }
                            }
                            
                            // Create chat message
                            await ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                                content: `
                                    <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                                        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                                            <strong>${targetActor.name} - ${resistanceType} Resistance FEAT</strong>
                                        </div>
                                        <div style="padding: 5px 10px; font-size: 0.9em;">
                                            <div>Resistance Rank: ${featRank} (${featValue})</div>
                                            <div>Roll: ${roll.total} + Karma: ${karmaSpent} = ${totalRoll}</div>
                                            ${specialEffect}
                                        </div>
                                        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                                            background-color: ${success ? '#4CAF50' : '#F44336'}; 
                                            color: white;">
                                            ${resultText}
                                        </div>
                                    </div>
                                `
                            });
                            
                            resolve({ success, resultText });
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "No Resistance",
                        callback: () => {
                            resolve({ success: false, resultText: "No resistance attempted" });
                        }
                    }
                },
                default: "roll",
                render: (html) => {
                    if (!isPlayerOwned) {
                        setTimeout(() => {
                            html.find('button[data-button="roll"]').trigger('click');
                        }, 5000);
                    }
                }
            }).render(true);
        });
    } */

    /**
     * Check if a resistance replaces an ability for FEAT rolls
     * @param {Actor} actor - The actor with potential resistance
     * @param {String} attackType - Type of attack being made
     * @param {String} normalAbility - The ability that would normally be used
     * @returns {Object} - { rank: String, value: Number, source: String }
     */
    static getResistanceForFeat(actor, attackType, normalAbility) {
        const resistances = [];
        
        // Check for resistance powers
        const resPowers = actor.items.filter(i => {
            if (i.type !== "power") return false;
            const powerName = i.name.toLowerCase();
            return powerName.includes("resistance");
        });
        
        for (const resPower of resPowers) {
            const powerName = resPower.name.toLowerCase();
            const powerValue = resPower.system.value || CONFIG.FASERIP?.rankValues?.[resPower.system.rank] || 0;
            const powerRank = resPower.system.rank;
            
            // Toxin Resistance replaces Endurance for poison FEATs
            if (attackType === "toxin" && powerName.includes("toxin") && normalAbility === "endurance") {
                // Toxin resistance must be at least Endurance +1CS
                const enduranceValue = actor.system.abilities.endurance.value || 0;
                const minValue = enduranceValue + 10; // Approximate +1CS
                
                return {
                    rank: powerValue >= minValue ? powerRank : actor.system.abilities.endurance.rank,
                    value: Math.max(powerValue, minValue),
                    source: "Toxin Resistance"
                };
            }
            
            // Mental Resistance replaces Psyche for mental attacks
            if (attackType === "mental" && powerName.includes("mental") && normalAbility === "psyche") {
                const psycheValue = actor.system.abilities.psyche.value || 0;
                const minValue = psycheValue + 10;
                
                return {
                    rank: powerValue >= minValue ? powerRank : actor.system.abilities.psyche.rank,
                    value: Math.max(powerValue, minValue),
                    source: "Mental Resistance"
                };
            }
            
            // Emotion Resistance replaces Intuition for emotion attacks
            if (attackType === "emotion" && powerName.includes("emotion") && normalAbility === "intuition") {
                const intuitionValue = actor.system.abilities.intuition.value || 0;
                const minValue = intuitionValue + 10;
                
                return {
                    rank: powerValue >= minValue ? powerRank : actor.system.abilities.intuition.rank,
                    value: Math.max(powerValue, minValue),
                    source: "Emotion Resistance"
                };
            }
            
            // Disease Resistance replaces Endurance for disease FEATs
            if (attackType === "disease" && powerName.includes("disease") && normalAbility === "endurance") {
                const enduranceValue = actor.system.abilities.endurance.value || 0;
                const minValue = enduranceValue + 10;
                
                return {
                    rank: powerValue >= minValue ? powerRank : actor.system.abilities.endurance.rank,
                    value: Math.max(powerValue, minValue),
                    source: "Disease Resistance"
                };
            }
        }
        
        // Return normal ability if no resistance applies
        return {
            rank: actor.system.abilities[normalAbility].rank,
            value: actor.system.abilities[normalAbility].value,
            source: normalAbility.charAt(0).toUpperCase() + normalAbility.slice(1)
        };
    }
    
     /**
     * Processes a wrestling action (Grappling, Grabbing, or Escaping)
     * @param {Object} actionData - Information about the wrestling action
     *   - attacker: Actor object of the attacker
     *   - target: Actor object of the target
     *   - actionType: "Gp" (Grappling), "Gb" (Grabbing), or "Es" (Escaping)
     *   - resultColor: white, green, yellow, or red result from the Universal Table
     *   - sourceName: Name of the action source (talent, power, etc.)
     */
    static async processWrestlingAction(actionData) {
        const { attacker, target, actionType, resultColor, sourceName } = actionData;
        
        if (!target) {
            ui.notifications.warn("No target specified for wrestling action.");
            return;
        }
        
        console.log("Wrestling action data:", actionData); // Add this debug line
        
        // Normalize the action type to handle case differences
        const normalizedActionType = actionType?.toLowerCase() || "";
        
        // Process based on normalized action type
        if (normalizedActionType === "gp") {
            return this._processGrappling(attacker, target, resultColor, sourceName);
        } else if (normalizedActionType === "gb") {
            return this._processGrabbing(attacker, target, resultColor, sourceName);
        } else if (normalizedActionType === "es") {
            return this._processEscaping(attacker, target, resultColor, sourceName);
        } else {
            ui.notifications.warn(`Unknown wrestling action type: ${actionType}`);
        }
        }
    
    /**
     * Handle grappling attempts
     * @private
     */
    static async _processGrappling(attacker, target, resultColor, sourceName) {
        // First, determine if the attacker and target are tokens or actors
        const isAttackerToken = attacker.document?.documentName === "Token" || attacker.documentName === "Token";
        const isTargetToken = target.document?.documentName === "Token" || target.documentName === "Token";

        // Get the proper actor references
        const attackerActor = isAttackerToken ? attacker.actor || attacker : attacker;
        const targetActor = isTargetToken ? target.actor || target : target;

        // Get proper names
        const attackerName = attackerActor.name;
        const targetName = targetActor.name;

        // Get proper IDs to use in the button
        const attackerId = isAttackerToken ? attacker.id : attackerActor.id;
        const targetId = isTargetToken ? target.id : targetActor.id;

        // Log useful debugging info
        console.log(`Grappling: Attacker is token: ${isAttackerToken}, ID: ${attackerId}`);
        console.log(`Grappling: Target is token: ${isTargetToken}, ID: ${targetId}`);
        
        // Chat message content to build
        let chatContent = `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>Wrestling Action: ${attackerName} attempts to grapple ${targetName}</strong>
            </div>
            <div style="padding: 5px 10px; font-size: 0.9em;">
            `;
        
        switch (resultColor) {
            case "white":
            case "green":
            // Miss - nothing happens
            chatContent += `<p><strong>Result:</strong> Miss! ${attackerName} failed to grapple ${targetName}.</p>
                <p>The attacker may not make other attacks this round.</p>`;
            break;
            
            case "yellow":
            // Partial hold - apply a status effect with -2CS penalty
            await this.applyGrapplingEffect(targetActor, "partial", attackerActor.id);
            
            // Compare strengths to determine movement restriction
            const attackerStrength = attackerActor.system.abilities.strength.value || 0;
            const targetStrength = targetActor.system.abilities.strength.value || 0;
            const canMove = attackerStrength < targetStrength;
            
            chatContent += `
                <div><strong>Result:</strong> Partial Hold! ${attackerName} has a partial hold on ${targetName}.</div>
                <div>Target actions at -2CS penalty. ${canMove ? 
                "Target may still move as their Strength exceeds the attacker's." : 
                "Target cannot move as attacker's Strength is greater or equal to theirs."}</div>
                <div><strong>Note:</strong> No damage is inflicted in a Partial Hold.</div>
            `;
            break;
            
            case "red":
            // Full hold - apply a status effect for full restraint
            await this.applyGrapplingEffect(targetActor, "full", attackerActor.id);
            
            // Get attacker's strength for potential damage
            const strength = attackerActor.system.abilities.strength.value || 0;
            
            chatContent += `
                <p><strong>Result:</strong> Full Hold! ${attackerName} has fully restrained ${targetName}.</p>
                <p>Target is completely restrained and unable to act until they escape.</p>
                <p>${attackerName} may perform one action in addition to maintaining the hold.</p>
                <p><strong>Option:</strong> ${attackerName} may inflict up to Strength (${strength}) damage to the target.</p>
                <button class="apply-wrestling-damage" data-attacker="${attackerId}" data-target="${targetId}" data-hold-type="full">Apply Strength Damage</button>
            `;
            break;
        }
        
        chatContent += `
            </div>
            </div>`;
        
        // Send the chat message
        const message = await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
            content: chatContent
        });
        
        // Add event listener for the "Apply Strength Damage" button (only for full holds)
        if (message && resultColor === "red") {
            // Use Hooks.once to ensure this only runs once after the message is rendered
            Hooks.once("renderChatMessageHTML", (messageDoc, htmlEl, data) => {
                if (messageDoc.id !== message.id) return;
                const btn = htmlEl.querySelector('.apply-wrestling-damage');
                if (btn) {
                    btn.addEventListener('click', async (ev) => {
                    const clickAttackerId = btn.dataset.attacker;
                    const clickTargetId = btn.dataset.target;
                    
                    // Store button reference safely
                    const $button = $(this);
                    
                    console.log(`Wrestling damage: Processing for attacker ID ${clickAttackerId} and target ID ${clickTargetId}`);
                    
                    // Look for tokens on the canvas
                    let targetToken = null;
                    let attackerToken = null;
                    
                    // First, try to find tokens by ID (if the IDs are token IDs)
                    for (const token of canvas.tokens.placeables) {
                        if (token.id === clickTargetId) targetToken = token;
                        if (token.id === clickAttackerId) attackerToken = token;
                    }
                    
                    // If not found by token ID, try to find by actor ID (tokens representing the actors)
                    if (!targetToken || !attackerToken) {
                        for (const token of canvas.tokens.placeables) {
                            if (!targetToken && token.actor?.id === clickTargetId) targetToken = token;
                            if (!attackerToken && token.actor?.id === clickAttackerId) attackerToken = token;
                        }
                    }
                    
                    // Get the base actors as fallback
                    const attackerBaseActor = game.actors.get(clickAttackerId);
                    const targetBaseActor = game.actors.get(clickTargetId);
                    
                    // Determine the best actor references to use
                    const attackerActor = attackerToken?.actor || attackerBaseActor;
                    const targetActor = targetToken?.actor || targetBaseActor;
                    
                    if (attackerActor && targetActor) {
                        // Get attacker's strength value for maximum damage
                        const maxStrengthValue = attackerActor.system.abilities.strength.value || 0;
                        const strengthRank = attackerActor.system.abilities.strength.rank || "Typical";
                        
                        // Show dialog to choose damage amount
                        new Dialog({
                            title: `${attackerActor.name} - Wrestling Hold Damage`,
                            content: `
                                <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
                                    <p><strong>${attackerActor.name}</strong> has a full hold on <strong>${targetActor.name}</strong>!</p>
                                    <p>Choose how much strength to apply as damage:</p>
                                    <div style="margin: 10px 0;">
                                        <label style="display: block; margin-bottom: 5px;">Attacker's Strength: ${strengthRank} (${maxStrengthValue})</label>
                                        <label style="display: block; margin-bottom: 5px;">Damage Amount:</label>
                                        <input type="number" id="damage-amount" min="0" max="${maxStrengthValue}" value="${maxStrengthValue}" style="width: 80px;">
                                        <span style="margin-left: 10px; color: #666;">Max: ${maxStrengthValue}</span>
                                    </div>
                                    <div style="margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 3px; font-size: 0.9em;">
                                        <strong>Note:</strong> You can apply anywhere from 0 to your full Strength value as damage.
                                    </div>
                                </div>
                            `,
                            buttons: {
                                apply: {
                                    icon: '<i class="fas fa-fist-raised"></i>',
                                    label: "Apply Damage",
                                    callback: async (html) => {
                                        const damageAmount = Math.min(Math.max(0, parseInt(html.find('#damage-amount').val()) || 0), maxStrengthValue);
                                        
                                        if (damageAmount === 0) {
                                            ui.notifications.info(`${attackerActor.name} chooses not to inflict damage while maintaining the hold.`);
                                            return;
                                        }
                                        
                                        try {
                                            console.log(`Wrestling damage: Using attacker: ${attackerActor.name}`);
                                            console.log(`Wrestling damage: Using target: ${targetActor.name}`);
                                            console.log(`Wrestling damage: Target initial health: ${targetActor.system.attributes.health.value}`);
                                            console.log(`Wrestling damage: Applying ${damageAmount} damage (chosen from max ${maxStrengthValue})`);
                                            
                                            // Track the health before update
                                            const healthBefore = targetActor.system.attributes.health.value;
                                            
                                            // Get the target exactly like normal attacks do
                                            const target = game.user.targets.first()?.actor;
                                            
                                            if (target) {
                                                // Process the damage exactly like normal attacks
                                                await CombatHandler.processAttack({
                                                    attacker: attackerActor,
                                                    target: target,  // ← Use the same target reference as normal attacks
                                                    baseDamage: damageAmount,
                                                    damageType: "Physical-Blunt",
                                                    sourceName: "Wrestling Hold",
                                                    canBeStun: false,
                                                    canBeSlam: false,
                                                    canBeKill: false,
                                                    originalRollResult: "green"
                                                });
                                                
                                                // Calculate actual damage done for button feedback
                                                const healthAfter = target.system.attributes.health.value;
                                                const damageDealt = Math.max(0, healthBefore - healthAfter);
                                                
                                                // Temporarily change button text to show damage was applied
                                                const originalButtonText = $button.text();
                                                $button.text(`Applied ${damageDealt} Damage!`).addClass("damage-just-applied");
                                                
                                                // After a brief delay, revert the button text to allow reuse
                                                setTimeout(() => {
                                                    $button.text(originalButtonText).removeClass("damage-just-applied");
                                                }, 2000);
                                                
                                            } else {
                                                ui.notifications.warn("No target selected. Please target the character first.");
                                            }
                                            
                                        } catch (error) {
                                            console.error("Error applying wrestling damage:", error);
                                            ui.notifications.error("Failed to apply wrestling damage");
                                            console.error(error);
                                        }
                                    }
                                },
                                cancel: {
                                    icon: '<i class="fas fa-times"></i>',
                                    label: "Cancel",
                                    callback: () => {
                                        ui.notifications.info("No damage applied.");
                                    }
                                }
                            },
                            default: "apply",
                            render: (html) => {
                                // Focus on the damage input and select the text
                                html.find('#damage-amount').focus().select();
                                
                                // Add input validation
                                html.find('#damage-amount').on('input', function() {
                                    const value = parseInt(this.value) || 0;
                                    if (value > maxStrengthValue) {
                                        this.value = maxStrengthValue;
                                    } else if (value < 0) {
                                        this.value = 0;
                                    }
                                });
                            }
                        }).render(true);
                    } else {
                        console.error(`Could not find ${!attackerActor ? "attacker" : "target"} with ID: ${!attackerActor ? clickAttackerId : clickTargetId}`);
                        ui.notifications.error("Failed to apply wrestling damage: Actor not found");
                    }
                });
                }
            });
        }
    }
    
    /**
     * Handle grabbing attempts (for items)
     * @private
     */
    static async _processGrabbing(attacker, target, resultColor, sourceName) {
        // Implementation for grabbing items
        // Would need to know what item is being grabbed
    }
    
    /**
     * Handle escape attempts
     * @private
     */
    static async _processEscaping(attacker, target, resultColor, sourceName) {
        // Implementation for escaping from holds
        // Would check if target is being grappled and by whom
    }
    
    /**
     * Applies a grappling effect to a target
     * @param {Object} target - Actor being grappled
     * @param {String} type - "partial" or "full"
     * @param {String} attackerId - ID of the attacker
     */
    static async applyGrapplingEffect(target, type, attackerId) {
    // Remove any existing grappling effects from this system
    const existingEffects = target.effects.filter(e => e.flags["msh-faserip"]?.grappling);
    if (existingEffects.length > 0) {
        await game.msh.runAsGM({
            operation: "deleteEmbeddedDocuments",
            targetActorUuid: target.uuid,
            args: ["ActiveEffect", existingEffects.map(e => e.id)]
            });
    }

    // Define effect data based on hold type
    const isPartial = type === "partial";
    const label = isPartial ? "Partial Hold" : "Full Hold";
    const icon = "icons/svg/net.svg";  // or your custom icon
    
    // Define the changes to apply
    const changes = [];
    
    // For partial holds, add -2CS modifier
    if (isPartial) {
        changes.push({
        key: "system.effectiveCSMod",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -2
        });
    } else {
        // For full holds, apply multiple changes as needed
        changes.push({
        key: "system.status.restrained",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true
        });
        // Can add additional changes for full hold if needed
    }

    // Define new ActiveEffect with proper duration
    const effect = {
        name: label, // changed from 'Label' to 'name' for v13 compatibility
        icon: icon,
        origin: `Actor.${attackerId}`,
        flags: {
        "msh-faserip": {
            grappling: true,
            grapplingType: type,
            attackerId: attackerId
        }
        },
        changes: changes,
        duration: {
        // Set duration if appropriate for your system
        // rounds: 0,  // 0 = indefinite or until removed
        startTime: game.time.worldTime,
        startRound: game.combat?.round || 0,
        startTurn: game.combat?.turn || 0
        },
        // Use appropriate status ID that matches your system's defined statuses
        statuses: [isPartial ? "partial-hold" : "restrained"]
    };

    // Apply ActiveEffect to target
    const newEffect = await game.msh.runAsGM({
        operation: "createEmbeddedDocuments",
        targetActorUuid: target.uuid,
        args: ["ActiveEffect", [effect]]
        });

    // Send styled chat message
    await ChatMessage.create({
        content: `
    <div style="background-color: ${isPartial ? "#FFA500" : "#FF0000"}; color: white; padding: 10px; border-radius: 5px; margin-bottom: 5px;">
    <div style="padding: 5px 10px; font-size: 1.2em; font-weight: bold; text-align: center;">
        ${isPartial ? "PARTIAL HOLD" : "FULL HOLD"} APPLIED
    </div>
    <div style="padding: 5px 10px; font-size: 0.9em;">
        <div><strong>${game.actors.get(attackerId)?.name || "Attacker"}</strong> has ${isPartial ? "a partial hold on" : "fully restrained"} <strong>${target.name}</strong>.</div>
        <div>Effect: ${isPartial ? "-2CS to all actions" : "Cannot act until freed"}</div>
        <div style="font-style: italic;">This effect will remain until manually removed by the GM.</div>
    </div>
    </div>
        `,
        speaker: ChatMessage.getSpeaker({ alias: "Wrestling Status" })
    });

    return newEffect;
    }


    /**
     * Prompts the target (or GM) to apply defenses.
     * @returns {Object} { bodyArmorValue, forceFieldValue, resistanceValue, usedBodyArmor, usedForceField, usedResistance }
     */
     static async getTargetDefenses(target, damageType, baseDamage, options = {}) {
        // Default defense values
        let defenses = {
            bodyArmorValue: 0,
            forceFieldValue: 0,
            resistanceValue: 0,
            resistanceType: "",
            usedBodyArmor: false,
            usedForceField: false,
            usedResistance: false
        };

        // Get the actual actor (in case target is a token)
        const targetActor = target.actor || target;

        // Get Body Armor (from equipment)
        const armorItems = targetActor.items.filter(i => 
            i.type === "equipment" && 
            i.system.category === "armor" && 
            i.system.protection
        );

        if (armorItems.length > 0) {
            const bestArmor = armorItems.reduce((best, current) => {
                let bestValue = 0;
                let currentValue = 0;
                
                if (typeof best.system.protection === 'number') {
                    bestValue = best.system.protection;
                } else {
                    bestValue = CONFIG.FASERIP?.rankValues?.[best.system.protection] || 0;
                }
                
                if (typeof current.system.protection === 'number') {
                    currentValue = current.system.protection;
                } else {
                    currentValue = CONFIG.FASERIP?.rankValues?.[current.system.protection] || 0;
                }
                
                return currentValue > bestValue ? current : best;
            });
            
            if (typeof bestArmor.system.protection === 'number') {
                defenses.bodyArmorValue = bestArmor.system.protection;
            } else {
                defenses.bodyArmorValue = CONFIG.FASERIP?.rankValues?.[bestArmor.system.protection] || 0;
            }
            defenses.usedBodyArmor = true;
        }

        // Get Body Armor from powers
        const bodyArmorPower = targetActor.items.find(i => 
            i.type === "power" && 
            (i.name.toLowerCase().includes("body armor") || 
            i.name.toLowerCase().includes("armor") ||
            i.system.type?.toLowerCase().includes("body armor"))
        );

        if (bodyArmorPower) {
            let powerValue = 0;
            if (typeof bodyArmorPower.system.value === 'number') {
                powerValue = bodyArmorPower.system.value;
            } else {
                powerValue = CONFIG.FASERIP?.rankValues?.[bodyArmorPower.system.rank] || 0;
            }
            
            if (powerValue > defenses.bodyArmorValue) {
                defenses.bodyArmorValue = powerValue;
                defenses.usedBodyArmor = true;
            }
        }

        // Check for passive armor granted by equipment
        const allPowers = game.msh.getActorPowers(targetActor);
        console.log("All powers (including equipment-granted):", allPowers);

        const applicableArmor = allPowers.filter(p =>
            p.isPassiveArmor &&
            typeof p.value === "number" &&
            p.value > 0 &&
            (!p.armorDamageType || damageType.toLowerCase().includes(p.armorDamageType.toLowerCase()))
        );

        console.log(`Matching passive armor powers for damageType "${damageType}":`, applicableArmor);

        let extraArmorValue = 0;
        for (let armor of applicableArmor) {
            extraArmorValue += armor.value;
        }

        if (extraArmorValue > defenses.bodyArmorValue) {
            defenses.bodyArmorValue = extraArmorValue;
            defenses.usedBodyArmor = true;
            console.log(`Passive armor from equipment applied: ${extraArmorValue}`);
        }

        // Handle AP ammo
        if (options.ammoType && options.ammoType.toLowerCase() === "ap") {
            console.log("=== AP AMMO DEBUG ===");
            console.log("Original body armor value:", defenses.bodyArmorValue);
            
            if (defenses.bodyArmorValue > 0) {
                const rankEntries = Object.entries(CONFIG.FASERIP.rankValues).sort((a, b) => a[1] - b[1]);
                
                let currentRankIndex = -1;
                for (let i = 0; i < rankEntries.length; i++) {
                    if (rankEntries[i][1] === defenses.bodyArmorValue) {
                        currentRankIndex = i;
                        break;
                    }
                }
                
                if (currentRankIndex >= 0) {
                    const originalArmorValue = defenses.bodyArmorValue;
                    const oldRankName = rankEntries[currentRankIndex][0];
                    
                    const newRankIndex = Math.max(0, currentRankIndex - 2);
                    const newArmorValue = rankEntries[newRankIndex][1];
                    const newRankName = rankEntries[newRankIndex][0];
                    
                    defenses.bodyArmorValue = newArmorValue;
                    
                    console.log(`AP Ammo: Reduced armor from ${oldRankName} (${originalArmorValue}) to ${newRankName} (${newArmorValue})`);
                } else {
                    console.log("Could not find matching rank for armor value:", defenses.bodyArmorValue);
                }
            }
            
            console.log("Final body armor value after AP:", defenses.bodyArmorValue);
            console.log("====================");
        }

        // Get Force Field
        const ffPower = targetActor.items.find(i => 
            i.type === "power" && 
            i.name.toLowerCase().includes("force field") && 
            i.system.isActive !== false
        );
        
        if (ffPower) {
            defenses.forceFieldValue = CONFIG.FASERIP?.rankValues?.[ffPower.system.rank] || 0;
            defenses.usedForceField = true;
        }

        // ========== RESISTANCE SECTION ==========
        console.log("Checking for resistances on:", targetActor.name);
        
        // Initialize the resistances array
        let resistancesArray = [];
        
        // Check system resistances first
        if (targetActor.system.resistances) {
            if (Array.isArray(targetActor.system.resistances)) {
                resistancesArray = [...targetActor.system.resistances];
            } else if (typeof targetActor.system.resistances === 'object') {
                resistancesArray = Object.values(targetActor.system.resistances);
            }
        }
        
        console.log("System resistances found:", resistancesArray);

        // Check for Resistance powers
        const resPowers = targetActor.items.filter(i => {
            if (i.type !== "power") return false;
            const powerName = i.name.toLowerCase();
            const powerType = i.system.type?.toLowerCase() || "";
            
            return powerName.includes("resistance") || 
                powerName.includes("immunity") ||
                powerName.includes("invulnerability") ||
                powerType.includes("resistance") ||
                powerType.includes("defensive");
        });
        
        console.log("Resistance powers found:", resPowers.map(p => p.name));
        
        // Process each resistance power
        for (const resPower of resPowers) {
            const powerName = resPower.name.toLowerCase();
            let powerValue = resPower.system.value || CONFIG.FASERIP?.rankValues?.[resPower.system.rank] || 0;
            let powerRank = resPower.system.rank;
            
            // CHECK FOR INVULNERABILITY FIRST
            if (powerName.includes("invulnerability") || 
                (powerName.includes("immunity") && !powerName.includes("disease"))) {
                // Invulnerability = Class 1000 resistance
                powerValue = 1000;
                powerRank = "Class 1000";
                
                // Determine what they're invulnerable to
                let resistanceType = "";
                
                if (powerName.includes("fire") || powerName.includes("heat")) {
                    resistanceType = "fire";
                } else if (powerName.includes("electricity") || powerName.includes("electrical") || powerName.includes("lightning")) {
                    resistanceType = "electricity";
                } else if (powerName.includes("cold") || powerName.includes("ice") || powerName.includes("frost")) {
                    resistanceType = "cold";
                } else if (powerName.includes("radiation")) {
                    resistanceType = "radiation";
                } else if (powerName.includes("toxin") || powerName.includes("poison")) {
                    resistanceType = "toxin";
                } else if (powerName.includes("corrosive") || powerName.includes("acid")) {
                    resistanceType = "corrosive";
                } else if (powerName.includes("mental") || powerName.includes("psychic") || powerName.includes("psionic")) {
                    resistanceType = "mental";
                } else if (powerName.includes("magic") || powerName.includes("magical") || powerName.includes("mystic")) {
                    resistanceType = "magic";
                } else if (powerName.includes("emotion")) {
                    resistanceType = "emotion";
                } else if (powerName.includes("disease") || powerName.includes("biological")) {
                    resistanceType = "disease";
                } else if (powerName.includes("physical")) {
                    resistanceType = "physical";
                } else if (powerName.includes("energy")) {
                    resistanceType = "energy";
                }
                
                if (resistanceType) {
                    resistancesArray.push({
                        type: resistanceType,
                        value: 1000, // Class 1000
                        rank: "Class 1000",
                        source: resPower.name,
                        isInvulnerability: true
                    });
                    console.log(`Found INVULNERABILITY: ${resPower.name} - Type: ${resistanceType}, Value: 1000`);
                }
                
            } else {
                // NORMAL RESISTANCE HANDLING (existing code)
                let resistanceType = "";
                
                // Check for specific resistance types in the power name
                if (powerName.includes("electricity") || powerName.includes("electrical") || powerName.includes("lightning")) {
                    resistanceType = "electricity";
                } else if (powerName.includes("fire") || powerName.includes("heat")) {
                    resistanceType = "fire";
                } else if (powerName.includes("cold") || powerName.includes("ice") || powerName.includes("frost")) {
                    resistanceType = "cold";
                } else if (powerName.includes("radiation") || powerName.includes("radioactive")) {
                    resistanceType = "radiation";
                } else if (powerName.includes("toxin") || powerName.includes("poison") || powerName.includes("venom")) {
                    resistanceType = "toxin";
                } else if (powerName.includes("corrosive") || powerName.includes("acid")) {
                    resistanceType = "corrosive";
                } else if (powerName.includes("mental") || powerName.includes("psychic") || powerName.includes("psionic")) {
                    resistanceType = "mental";
                } else if (powerName.includes("magic") || powerName.includes("magical") || powerName.includes("mystic")) {
                    resistanceType = "magic";
                } else if (powerName.includes("emotion")) {
                    resistanceType = "emotion";
                } else if (powerName.includes("disease") || powerName.includes("biological")) {
                    resistanceType = "disease";
                } else if (powerName.includes("physical")) {
                    resistanceType = "physical";
                } else if (powerName.includes("energy") && !powerName.includes("electricity")) {
                    resistanceType = "energy";
                }
                
                // Also check power specialty or description
                if (!resistanceType && resPower.system.specialty) {
                    const specialty = resPower.system.specialty.toLowerCase();
                    if (specialty.includes("electric")) resistanceType = "electricity";
                    else if (specialty.includes("fire")) resistanceType = "fire";
                    else if (specialty.includes("cold")) resistanceType = "cold";
                    else if (specialty.includes("radiation")) resistanceType = "radiation";
                }
                
                if (resistanceType && powerValue > 0) {
                    resistancesArray.push({
                        type: resistanceType,
                        value: powerValue,
                        rank: powerRank,
                        source: resPower.name,
                        isInvulnerability: false
                    });
                    console.log(`Found resistance power: ${resPower.name} - Type: ${resistanceType}, Value: ${powerValue}`);
                }
            }
        }

        // Check for equipment-granted resistances
        const passiveResistPowers = allPowers.filter(p =>
            (p.name?.toLowerCase().includes("resistance") || p.name?.toLowerCase().includes("immunity")) &&
            typeof p.value === "number" &&
            p.value > 0
        );

        for (const equipResPower of passiveResistPowers) {
            const powerValue = equipResPower.value;
            const powerName = equipResPower.name?.toLowerCase() || "";
            let resistanceType = equipResPower.damageType?.toLowerCase() || "";
            
            if (!resistanceType) {
                if (powerName.includes("electricity")) resistanceType = "electricity";
                else if (powerName.includes("fire")) resistanceType = "fire";
                else if (powerName.includes("cold")) resistanceType = "cold";
                else if (powerName.includes("radiation")) resistanceType = "radiation";
            }

            if (resistanceType && powerValue > 0) {
                resistancesArray.push({
                    type: resistanceType,
                    value: powerValue,
                    source: equipResPower.name + " (equipment)"
                });
                console.log(`Found equipment resistance: ${equipResPower.name} - Type: ${resistanceType}, Value: ${powerValue}`);
            }
        }

        // Now check which resistance applies to the incoming damage
        let normalizedDamageType = damageType.toLowerCase();
        console.log(`Checking resistances for damage type: ${normalizedDamageType}`);
        console.log(`Available resistances:`, resistancesArray);
        
        // SPECIAL HANDLING: Lightning/Energy attacks check electricity resistance
        if (normalizedDamageType === "energy-energy" || 
            normalizedDamageType.includes("lightning") ||
            normalizedDamageType.includes("electric")) {
            console.log("⚡ Treating Energy-Energy/Lightning as electricity damage for resistance checks");
            
            const elecResistance = resistancesArray.find(r => 
                r.type?.toLowerCase() === "electricity" || 
                r.type?.toLowerCase() === "electrical"
            );
            
            if (elecResistance) {
                defenses.resistanceValue = typeof elecResistance.value === "number" 
                    ? elecResistance.value 
                    : CONFIG.FASERIP?.rankValues?.[elecResistance.rank] || 0;
                defenses.resistanceType = "electricity";
                defenses.usedResistance = true;
                console.log(`✅ Found Electricity Resistance: ${defenses.resistanceValue} from ${elecResistance.source || 'system'}`);
                
                console.log("Final defenses:", defenses);
                return defenses;
            }
        }

        // Check for other resistance types
        let bestResistance = null;
        let bestSpecificity = 0;

        for (const resistance of resistancesArray) {
            if (!resistance || !resistance.type) continue;
            
            const resType = resistance.type.toLowerCase();
            let specificity = 0;
            
            if (isResistanceApplicable(normalizedDamageType, resType)) {
                if (normalizedDamageType === resType) {
                    specificity = 3;
                } else if (normalizedDamageType.includes(resType) || resType.includes(normalizedDamageType)) {
                    specificity = 2;
                } else {
                    specificity = 1;
                }
                
                if (specificity > bestSpecificity || 
                    (specificity === bestSpecificity && resistance.value > (bestResistance?.value || 0))) {
                    bestResistance = resistance;
                    bestSpecificity = specificity;
                }
            }
        }

        if (bestResistance) {
            defenses.resistanceValue = typeof bestResistance.value === "number" 
                ? bestResistance.value 
                : CONFIG.FASERIP?.rankValues?.[bestResistance.rank] || 0;
            defenses.resistanceType = bestResistance.type;
            defenses.usedResistance = true;
            console.log(`✅ Using resistance: ${bestResistance.type} (value: ${defenses.resistanceValue}) from ${bestResistance.source || 'system'}`);
        } else {
            console.log("❌ No applicable resistance found for damage type:", normalizedDamageType);
        }

        console.log("Final resistance value:", defenses.resistanceValue);
        console.log("Final defenses:", defenses);

        // Show dialog if needed
        if (!options.skipDefenseDialog && targetActor.hasPlayerOwner &&
            (defenses.bodyArmorValue > 0 || defenses.forceFieldValue > 0 || defenses.resistanceValue > 0)) {
            // [Dialog code remains the same...]
        }
        
        return defenses;
    }

    /**
     * Rolls an Endurance FEAT for Stun, Slam, or Kill.
     * @returns {String} Text result of the FEAT.
     */
    static async rollSecondaryFeat(target, featType, sourceName, attackType = "unknown", attacker = null) {
        // Get the endurance rank for the save
        const enduranceRank = target.system.abilities.endurance.rank;
        
        // Get available Karma
        const availableKarma = target.system.attributes.karma.value || 0;
        
        // Create dialog content
        const dialogContent = `
            <div style="text-align: center;">
                <h2>${target.name} must make a ${featType} save!</h2>
                <p>The attack from <strong>${sourceName}</strong> requires an Endurance FEAT roll.</p>
                <div style="margin: 10px 0;">
                    <p>Endurance Rank: <strong>${enduranceRank}</strong></p>
                    <hr style="margin: 10px 0;">
                    <div>
                        <label>Spend Karma Points:</label>
                        <input type="number" id="karma-points" min="0" max="${availableKarma}" value="0" style="width: 60px;">
                        <span style="margin-left: 5px; font-size: 0.9em; color: #666;">(Available: ${availableKarma})</span>
                    </div>
                </div>
            </div>
        `;
        
        // Show dialog to target player (or GM if NPC)
        return new Promise((resolve) => {
            // Determine if target is controlled by a player
            const isPlayerOwned = target.hasPlayerOwner;
            
            // Create dialog
            new Dialog({
                title: `${featType} Save Required`,
                content: dialogContent,
                buttons: {
                    roll: {
                        icon: '<i class="fas fa-dice-d20"></i>',
                        label: "Roll Save",
                        callback: async (html) => {
                            // Get karma amount
                            const karmaSpent = Math.min(
                                parseInt(html.find('#karma-points').val()) || 0,
                                availableKarma
                            );
                            
                            // Create the roll first
                            const roll = new Roll("1d100");
                            await roll.evaluate();

                            // Then use the results
                            const totalRoll = Math.min(100, roll.total + karmaSpent);
                            
                            // Determine the result color
                            const colorResult = game.msh.rollUniversalTable(enduranceRank, totalRoll);
                            
                            // Get the result based on action type and color
                            const actionCode = featType === "Stun" ? "St" : featType === "Slam" ? "Sl" : "Ki";
                            const featResultText = ACTION_RESULT_LABELS[actionCode][colorResult.toLowerCase()];
                            
                            // Deduct karma if spent
                            if (karmaSpent > 0) {
                                // First update karma value
                                await game.msh.runAsGM({
                                    operation: "update",
                                    targetActorUuid: target.uuid,
                                    args: [{
                                                                        "system.attributes.karma.value": availableKarma - karmaSpent
                                                                    }]
                                    });
                                
                                // Create a new karma history entry
                                const history = foundry.utils.deepClone(target.system.karma?.history || []);
                                const newEvent = {
                                    realDate: new Date().toLocaleDateString(),
                                    gameDate: game.time?.worldTime ? game.time.worldTime.toString() : "",
                                    amount: -karmaSpent,
                                    type: "Save",
                                    description: `${featType} save against ${sourceName}`
                                };
                                history.push(newEvent);
                                await game.msh.runAsGM({
                                    operation: "update",
                                    targetActorUuid: target.uuid,
                                    args: [{ "system.karma.history": history }]
                                    });
                            }
                            
                            // Apply effects and create detailed chat messages based on result
                            let effectApplied = false;
                            let stunDuration = null;
                            
                            // =========================
                            // KILL RESULTS
                            // =========================
                            if (featType === "Kill") {
                                if (featResultText === "End. Loss") {
                                    const currentEndurance = CONFIG.FASERIP.rankValues[target.system.abilities.endurance.rank] || 0;
                                    const newEnduranceRank = Object.keys(CONFIG.FASERIP.rankValues).find(key => 
                                        (CONFIG.FASERIP.rankValues[key] || 0) < currentEndurance) || "Shift-0";
                                    
                                    ui.notifications.error(`${target.name} loses an Endurance rank and is dying!`);
                                    await game.msh.runAsGM({
                                        operation: "update",
                                        targetActorUuid: target.uuid,
                                        args: [{"system.abilities.endurance.rank": newEnduranceRank}]
                                        });
                                    
                                    // Apply dying effect
                                    await this.applyDyingEffect(target);
                                    
                                    // Create detailed dying status message
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #8B0000; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                                💀 DYING! 💀
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> suffers Endurance Loss!</div>
                                                <div style="margin: 5px 0;"><strong>Mechanical Effects:</strong></div>
                                                <div>• Endurance reduced: ${target.system.abilities.endurance.rank} → ${newEnduranceRank}</div>
                                                <div>• Will lose 1 Endurance rank per turn</div>
                                                <div>• Dies when Endurance drops below Shift-0</div>
                                                <div style="margin-top: 8px;"><strong>How to Help:</strong></div>
                                                <div>• Spend 50 Karma per round to stabilize</div>
                                                <div>• Any aid/first aid halts Endurance loss</div>
                                                <div>• Medicine talent may help at Shift-0</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Death Save" })
                                    });
                                    effectApplied = true;
                                    
                                } else if (featResultText === "E/S") {
                                    // Determine if this attack type qualifies for Endurance Loss
                                    // Per FASERIP rules: "only if the method of attack was Edged attack in Slugfest or a Shooting attack"
                                    const edgedOrShooting = attackType.toLowerCase().includes("edged") || 
                                                        attackType.toLowerCase().includes("shooting") ||
                                                        attackType.toLowerCase() === "ea" || // Edged Attacks
                                                        attackType.toLowerCase() === "te" || // Throwing Edged
                                                        attackType.toLowerCase() === "sh";   // Shooting
                                    
                                    if (edgedOrShooting) {
                                        // Apply Endurance Loss - same as "End. Loss" result
                                        const currentEndurance = CONFIG.FASERIP.rankValues[target.system.abilities.endurance.rank] || 0;
                                        const newEnduranceRank = Object.keys(CONFIG.FASERIP.rankValues).find(key => 
                                            (CONFIG.FASERIP.rankValues[key] || 0) < currentEndurance) || "Shift-0";
                                        
                                        ui.notifications.error(`${target.name} loses an Endurance rank and is dying!`);
                                        await game.msh.runAsGM({
                                            operation: "update",
                                            targetActorUuid: target.uuid,
                                            args: [{"system.abilities.endurance.rank": newEnduranceRank}]
                                            });
                                        
                                        // Apply dying effect
                                        await this.applyDyingEffect(target);
                                        
                                        await ChatMessage.create({
                                            content: `
                                            <div style="background-color: #8B0000; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                                <div style="font-size: 1.1em; font-weight: bold; text-align: center; margin-bottom: 5px;">
                                                    💀 E/S RESULT - ENDURANCE LOSS 💀
                                                </div>
                                                <div style="padding: 5px; font-size: 0.9em;">
                                                    <div><strong>${target.name}</strong> gets E/S result on Kill save</div>
                                                    <div style="margin: 5px 0;"><strong>Attack Type:</strong> ${attackType} (Edged/Shooting)</div>
                                                    <div style="margin: 5px 0;"><strong>Effect:</strong> Endurance Loss</div>
                                                    <div>• Endurance reduced: ${target.system.abilities.endurance.rank} → ${newEnduranceRank}</div>
                                                    <div>• Character is now dying</div>
                                                    <div>• Will lose 1 Endurance rank per turn</div>
                                                    <div style="margin-top: 8px;"><strong>How to Help:</strong></div>
                                                    <div>• Spend 50 Karma per round to stabilize</div>
                                                    <div>• Any aid/first aid halts Endurance loss</div>
                                                </div>
                                            </div>
                                            `,
                                            speaker: ChatMessage.getSpeaker({ alias: "Death Save" })
                                        });
                                        effectApplied = true;
                                        
                                    } else {
                                        // No Effect for non-edged/shooting attacks
                                        await ChatMessage.create({
                                            content: `
                                            <div style="background-color: #28A745; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                                <div style="font-size: 1.1em; font-weight: bold; text-align: center; margin-bottom: 5px;">
                                                    🛡️ E/S RESULT - NO EFFECT 🛡️
                                                </div>
                                                <div style="padding: 5px; font-size: 0.9em;">
                                                    <div><strong>${target.name}</strong> gets E/S result on Kill save</div>
                                                    <div style="margin: 5px 0;"><strong>Attack Type:</strong> ${attackType} (Non-Edged/Shooting)</div>
                                                    <div style="margin: 5px 0;"><strong>Effect:</strong> No Effect</div>
                                                    <div>• E/S only applies to Edged or Shooting attacks</div>
                                                    <div>• This attack type does not qualify</div>
                                                    <div>• Character takes normal damage only</div>
                                                </div>
                                            </div>
                                            `,
                                            speaker: ChatMessage.getSpeaker({ alias: "Death Save" })
                                        });
                                    }
                                    
                                } else { // "No effect"
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #28A745; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.1em; font-weight: bold; text-align: center; margin-bottom: 5px;">
                                                🛡️ DEATH RESISTED 🛡️
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> resists the lethal damage!</div>
                                                <div style="margin: 5px 0;"><strong>Effect:</strong></div>
                                                <div>• No additional effect beyond normal damage</div>
                                                <div>• Character survives the potentially fatal blow</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Death Save" })
                                    });
                                }
                            }
                            
                            // =========================
                            // STUN RESULTS
                            // =========================
                            else if (featType === "Stun") {
                                if (featResultText === "1–10") {
                                    // Roll stun duration for 1-10 rounds
                                    const stunRoll = await new Roll("1d10").evaluate();
                                    stunDuration = stunRoll.total;
                                    ui.notifications.info(`${target.name} is Stunned for ${stunDuration} rounds!`);
                                    
                                    // Apply stun effect
                                    await this.applyStunnedEffect(target, stunDuration);
                                    
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #FFA500; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                                😵 STUNNED (${stunDuration} rounds) 😵
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> is knocked out for ${stunDuration} rounds!</div>
                                                <div style="margin: 5px 0;"><strong>Mechanical Effects:</strong></div>
                                                <div>• Cannot take any actions</div>
                                                <div>• Movement reduced to 0</div>
                                                <div>• Still conscious but incapacitated</div>
                                                <div>• Effect lasts ${stunDuration} combat rounds</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Stun Effect" })
                                    });
                                    effectApplied = true;
                                    
                                } else if (featResultText === "1") {
                                    // Apply 1-round stun effect
                                    ui.notifications.info(`${target.name} is Stunned for 1 round!`);
                                    
                                    await this.applyStunnedEffect(target, 1);
                                    
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #FF8C00; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                                😵 STUNNED (1 round) 😵
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> is knocked down for 1 round!</div>
                                                <div style="margin: 5px 0;"><strong>Mechanical Effects:</strong></div>
                                                <div>• Cannot take any actions next round</div>
                                                <div>• Still conscious but stunned</div>
                                                <div>• May "play possum" since aware</div>
                                                <div>• Recovers at start of following round</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Stun Effect" })
                                    });
                                    effectApplied = true;
                                    
                                } else { // "No effect"
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #28A745; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.1em; font-weight: bold; text-align: center; margin-bottom: 5px;">
                                                🛡️ STUN RESISTED 🛡️
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> shrugs off the stunning blow!</div>
                                                <div style="margin: 5px 0;"><strong>Effect:</strong></div>
                                                <div>• No stunning effect</div>
                                                <div>• Character remains fully functional</div>
                                                <div>• Can act normally next round</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Stun Resist" })
                                    });
                                }
                            }
                            
                            // =========================
                            // SLAM RESULTS
                            // =========================
                            else if (featType === "Slam") {
                            const actorDoc = target?.actor ?? target; // token.actor or plain actor

                            if (featResultText === "Gr. Slam") {
                                // Get attacker's strength rank for distance calculation
                                let attackerStrengthRank = "Remarkable"; // Default fallback
                                let attackerStrengthValue = 30;          // Remarkable default
                                if (attacker) {
                                attackerStrengthRank = attacker.system?.abilities?.strength?.rank ?? "Remarkable";
                                attackerStrengthValue = attacker.system?.abilities?.strength?.value ?? 30;
                                }

                                // Calculate actual slam distance based on attacker's strength
                                const slamDistance = getGrandSlamDistance(attackerStrengthRank);

                                ui.notifications.warn(`${target.name} suffers a Grand Slam - knocked away ${slamDistance} areas!`);

                                // Build the Active Effect data once (v13+: must include "name")
                                const effectData = {
                                name: `Grand Slam (Knockback ${slamDistance} areas)`,
                                label: `Grand Slam (Knockback ${slamDistance} areas)`,
                                icon: "icons/svg/falling.svg",
                                origin: attacker?.uuid ?? null,
                                disabled: false,
                                flags: {
                                    "msh-faserip": {
                                    effectType: "grandSlam",
                                    attackerName: attacker?.name || "",
                                    attackerStrength: attackerStrengthRank,
                                    slamSpeed: slamDistance
                                    }
                                },
                                changes: [
                                    { key: "system.status.prone", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
                                ],
                                duration: {
                                    rounds: 2,
                                    startTime: game.time.worldTime,
                                    startRound: game.combat?.round ?? 0
                                },
                                statuses: ["prone"]
                                };

                                // Prefer creating the effect directly if you can (GM or owner)
                                if (game.user.isGM || actorDoc?.isOwner) {
                                await actorDoc.createEmbeddedDocuments("ActiveEffect", [effectData]);
                                } else if (game.msh?.socket?.executeAsGM) {
                                await game.msh.socket.executeAsGM("createActorEffect", {
                                    targetActorUuid: actorDoc.uuid,
                                    effectData
                                });
                                } else if (typeof game.msh?.runAsGM === "function") {
                                // Legacy fallback (kept for compatibility)
                                await game.msh.runAsGM({
                                    operation: "createActorEffect",
                                    targetActorUuid: actorDoc.uuid,
                                    effectData
                                });
                                } else {
                                ui.notifications.warn("Couldn’t apply Grand Slam effect (no GM helper available). Ask the GM to enable SocketLib.");
                                }

                                // Grand Slam chat message
                                await ChatMessage.create({
                                content: `
                                <div style="background-color:#8B0000;color:white;padding:10px;border-radius:5px;margin:5px 0;">
                                    <div style="font-size:1.2em;font-weight:bold;text-align:center;margin-bottom:8px;">💥 GRAND SLAM! 💥</div>
                                    <div style="padding:5px;font-size:0.9em;">
                                    <div><strong>${target.name}</strong> is launched away with tremendous force!</div>
                                    <div style="margin:5px 0;"><strong>Mechanical Effects:</strong></div>
                                    <div>• Attacker Strength: ${attackerStrengthRank} (${attackerStrengthValue})</div>
                                    <div>• Knockback Distance: ${slamDistance} areas</div>
                                    <div>• Launch Speed: ${slamDistance} areas/round</div>
                                    <div>• Direction: ${attacker ? attacker.name + " chooses" : "GM chooses"} (if damage dealt)</div>
                                    <div style="margin-top:8px;"><strong>Collision Damage:</strong></div>
                                    <div>• If target hits obstacle: charging damage applies</div>
                                    <div>• Buildings reduce knockback per movement rules</div>
                                    <div>• Target takes slam damage if hitting walls/objects</div>
                                    </div>
                                    <div style="margin-top:10px;text-align:center;">
                                    <button class="calculate-slam-collision"
                                            data-target="${target.uuid}"
                                            data-distance="${slamDistance}"
                                            data-speed="${slamDistance}"
                                            data-attacker-strength="${attackerStrengthValue}"
                                            style="background:#dc3545;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;">
                                        Calculate Collision Damage
                                    </button>
                                    </div>
                                </div>`,
                                speaker: ChatMessage.getSpeaker({ alias: "Slam Effect" })
                                });

                                effectApplied = true;

                            } else if (featResultText === "1 area") {
                                ui.notifications.info(`${target.name} is slammed back 1 area!`);

                                // Apply 1 Area Slam effect (v13+: must include "name")
                                const effectData = {
                                name: "Slammed (1 Area)",
                                label: "Slammed (1 Area)",
                                icon: "icons/svg/falling.svg",
                                origin: attacker?.uuid ?? null,
                                disabled: false,
                                flags: { "msh-faserip": { slammed: true, distance: 1 } },
                                changes: [
                                    { key: "system.status.prone", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
                                ],
                                duration: {
                                    rounds: 1,
                                    startTime: game.time.worldTime,
                                    startRound: game.combat?.round ?? 0
                                },
                                statuses: ["prone"]
                                };

                                if (game.user.isGM || actorDoc?.isOwner) {
                                await actorDoc.createEmbeddedDocuments("ActiveEffect", [effectData]);
                                } else if (game.msh?.socket?.executeAsGM) {
                                await game.msh.socket.executeAsGM("createActorEffect", {
                                    targetActorUuid: actorDoc.uuid,
                                    effectData
                                });
                                } else if (typeof game.msh?.runAsGM === "function") {
                                await game.msh.runAsGM({
                                    operation: "createActorEffect",
                                    targetActorUuid: actorDoc.uuid,
                                    effectData
                                });
                                } else {
                                ui.notifications.warn("Couldn’t apply Slam effect (no GM helper).");
                                }

                                await ChatMessage.create({
                                content: `
                                <div style="background-color:#DC3545;color:white;padding:10px;border-radius:5px;margin:5px 0;">
                                    <div style="font-size:1.2em;font-weight:bold;text-align:center;margin-bottom:8px;">💢 SLAMMED - 1 AREA 💢</div>
                                    <div style="padding:5px;font-size:0.9em;">
                                    <div><strong>${target.name}</strong> is knocked back 1 area!</div>
                                    <div style="margin:5px 0;"><strong>Mechanical Effects:</strong></div>
                                    <div>• Knocked 1 area away from attacker</div>
                                    <div>• May hit obstacles during knockback</div>
                                    <div>• Takes damage if slammed into walls/objects</div>
                                    <div>• Attacker chooses direction (if damage dealt)</div>
                                    <div>• Target chooses direction (if no damage dealt)</div>
                                    </div>
                                </div>`,
                                speaker: ChatMessage.getSpeaker({ alias: "Slam Effect" })
                                });

                                effectApplied = true;

                            } else if (featResultText === "Stagger") {
                                    ui.notifications.info(`${target.name} staggers but remains in place!`);
                                    
                                    // Apply Stagger effect
                                    await game.msh.runAsGM({
                                        operation: "createEmbeddedDocuments",
                                        targetActorUuid: target.uuid,
                                        args: ["ActiveEffect", [{
                                        name: "Staggered",
                                        icon: "icons/svg/stoned.svg",
                                        flags: {
                                            "msh-faserip": {
                                                staggered: true
                                            }
                                        },
                                        changes: [],
                                        duration: {
                                            rounds: 1,
                                            startTime: game.time.worldTime,
                                            startRound: game.combat?.round || 0
                                        },
                                        statuses: ["staggered"]
                                    }]]
});
                                    
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #FFC107; color: black; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                                😵‍💫 STAGGERED 😵‍💫
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> staggers from the impact!</div>
                                                <div style="margin: 5px 0;"><strong>Mechanical Effects:</strong></div>
                                                <div>• Knocked back a step or two</div>
                                                <div>• No longer adjacent to attacker</div>
                                                <div>• Fully capable of combat next round</div>
                                                <div>• No movement penalty or damage</div>
                                                <div>• May fall off cliffs if near edges</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Slam Effect" })
                                    });
                                    effectApplied = true;
                                    
                                } else { // "No" - No slam effect
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #28A745; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.1em; font-weight: bold; text-align: center; margin-bottom: 5px;">
                                                🛡️ SLAM RESISTED 🛡️
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> plants their feet and resists!</div>
                                                <div style="margin: 5px 0;"><strong>Effect:</strong></div>
                                                <div>• No knockback effect</div>
                                                <div>• Remains in current position</div>
                                                <div>• Still adjacent to attacker</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Slam Resist" })
                                    });
                                }
                            }
                            
                            // Create the main save result chat message
                            await ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({ actor: target }),
                                content: `
                            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                            <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                                <strong>${target.name} - ${featType} Save</strong>
                            </div>
                            <div style="padding: 5px 10px; font-size: 0.9em;">
                                <div>Rolled ${roll.total} ${karmaSpent > 0 ? `+ ${karmaSpent} Karma` : ''} = ${totalRoll} against ${enduranceRank} Endurance</div>
                            </div>
                            <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                                background-color: ${
                                    colorResult.toLowerCase() === 'white' ? '#f8f8f8' :
                                    colorResult.toLowerCase() === 'green' ? '#4CAF50' :
                                    colorResult.toLowerCase() === 'yellow' ? '#FFC107' : '#F44336'
                                }; 
                                color: ${
                                    colorResult.toLowerCase() === 'white' || colorResult.toLowerCase() === 'yellow' ? '#333' : 'white'
                                };">
                                Result: ${featResultText} (${colorResult.toUpperCase()})
                            </div>
                            </div>
                                `
                            });
                            
                            // Return the result for the calling method
                            resolve(`Rolled ${roll.total}${karmaSpent > 0 ? ` + ${karmaSpent} Karma` : ''} = ${totalRoll} on ${enduranceRank} Endurance: ${colorResult} → ${featResultText}`);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => {
                            resolve(`${target.name} did not make the ${featType} save.`);
                        }
                    }
                },
                default: "roll",
                // For NPCs or if the player isn't available, auto-roll after a delay
                render: (html) => {
                    if (!isPlayerOwned) {
                        setTimeout(() => {
                            html.find('button[data-button="roll"]').trigger('click');
                        }, 10000); // Auto-roll for NPCs after 10 seconds
                    }
                },
                close: () => resolve(`${target.name} did not make the ${featType} save.`)
            }).render(true);
        });
    }

    /**
     * Applies a stunned effect to a target for a specified duration
     * @param {Object} target - The actor to apply the effect to
     * @param {number} duration - Duration in rounds
     */
    // Example signature: async applyStunnedEffect(target, rounds, sourceName)
    static async applyStunnedEffect(target, rounds = 1, sourceName = "Stun") {
        try {
            const actorDoc = target?.actor ?? target; // works for Token or Actor
            if (!actorDoc) {
            ui.notifications.warn("No actor found to apply Stunned.");
            return false;
            }

            // Build the Active Effect for “Stunned”
            const effectData = {
                // v13+ requires "name"
                name: `Stunned (${rounds} rnds)`,
                // keep label too if other code reads it
                label: `Stunned (${rounds} rnds)`,

                // nice to have an icon; use any path in your system
                icon: "icons/svg/daze.svg",

                origin: (typeof sourceName === "string" ? null : sourceName?.uuid) ?? null,
                disabled: false,

                statuses: ["stunned"],

                changes: [
                    { key: "system.status.stunned", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
                    // add other penalties here if you use them
                ],

                duration: {
                    rounds,
                    startTime: game.time.worldTime,
                    startRound: game.combat?.round ?? 0
                },

                flags: {
                    "msh-faserip": {
                    effectType: "stunned",
                    sourceName: (typeof sourceName === "string" ? sourceName : sourceName?.name) ?? "",
                    rounds
                    }
                }
                };


            // Prefer direct create if the user has permission
            if (game.user.isGM || actorDoc.isOwner) {
            await actorDoc.createEmbeddedDocuments("ActiveEffect", [effectData]);

            // Otherwise, use your SocketLib GM helper if available
            } else if (game.msh?.socket?.executeAsGM) {
            await game.msh.socket.executeAsGM("createActorEffect", {
                targetActorUuid: actorDoc.uuid,
                effectData
            });

            // Legacy fallback if you still keep it around
            } else if (typeof game.msh?.runAsGM === "function") {
            await game.msh.runAsGM({
                operation: "createEmbeddedDocuments",
                targetActorUuid: actorDoc.uuid,
                effectData
            });

            // Last resort: inform but don’t crash
            } else {
            ui.notifications.warn("Couldn’t apply Stunned (no GM helper available). Ask the GM to enable SocketLib.");
            return false;
            }

            return true;
        } catch (err) {
            console.error("applyStunnedEffect failed:", err);
            ui.notifications.error("Failed to apply Stunned effect. See console.");
            return false;
        }
    }


    /**
     * Handles actor reaching 0 Health.
     * @param {Object} target - The actor that reached 0 Health.
     * @param {Object} attacker - The actor that caused the damage.
     * @param {Boolean} isLethalDamage - Whether the damage was from a potentially lethal source.
     */
    static async handleZeroHealth(target, attacker, isLethalDamage = false) {
        ui.notifications.warn(`${target.name} has reached 0 Health!`);
        
        // Generate unconsciousness effect (1-10 rounds)
        const unconsciousDuration = Math.floor(Math.random() * 10) + 1;
        
        // Define the unconsciousness effect with proper changes
        const effectData = {
            name: "Unconscious", 
            icon: "icons/svg/unconscious.svg",
            flags: {
                "msh-faserip": {
                    unconscious: true
                }
            },
            changes: [
                {
                    key: "system.status.unconscious", 
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: true
                },
                {
                    key: "system.attributes.movement.value",
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: 0
                }
            ],
            duration: {
                rounds: unconsciousDuration,
                startTime: game.time.worldTime,
                startRound: game.combat?.round || 0,
                startTurn: game.combat?.turn || 0
            },
            statuses: ["unconscious"]
        };
        
        // Apply the effect
        await game.msh.runAsGM({
            operation: "createEmbeddedDocuments",
            targetActorUuid: target.uuid,
            args: ["ActiveEffect", [effectData]]
        });
        
                
        // ALL characters who reach 0 Health must make an Endurance FEAT vs Kill (pg 31)
        let killCheckResult = "";
            let chatContent = `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>${target.name} is Unconscious for ${unconsciousDuration} rounds.</div>
            </div>
            </div>
            `;

            // Only roll Kill check if damage was from a potentially lethal source
            if (isLethalDamage) {
                const killCheckResult = await this.rollSecondaryFeat(target, "Kill", "Reaching 0 Health");
                chatContent += `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div><strong>Death Check:</strong> ${killCheckResult}</div>
                </div>
                </div>
                `;
                
                // [Keep the existing logic for handling Kill check results]
                if (killCheckResult.includes("End. Loss")) {
                    // Character starts dying
                    // [existing code]
                }
            } else {
                // Non-lethal damage - just unconscious, no death possible
                chatContent += `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Non-lethal damage - unconscious but stable (no death check required).</div>
                </div>
                </div>
                `;
            }

        chatContent += `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div><strong>Death Check:</strong> ${killCheckResult}</div>
        </div>
        </div>
        `;

        // Check the result and determine what happens
        if (killCheckResult.includes("End. Loss") && isLethalDamage) {
        // Failed death save with lethal damage = start dying
        ui.notifications.error(`${target.name} is dying!`);
        
        // Apply dying effect using our dedicated method
        await this.applyDyingEffect(target);
        
        // Immediately lose the FIRST Endurance rank
        const currentRank = target.system.abilities.endurance.rank;
        const ranks = Object.keys(CONFIG.FASERIP.rankValues);
        const currentRankIndex = ranks.indexOf(currentRank);
        
        if (currentRankIndex > 0) {
            const newRank = ranks[currentRankIndex - 1];
            await game.msh.runAsGM({
                operation: "update",
                targetActorUuid: target.uuid,
                args: [{"system.abilities.endurance.rank": newRank}]
            });
            
            chatContent += `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>${target.name} loses first Endurance rank: ${currentRank} → ${newRank}. Will lose another rank each turn!</div>
            </div>
            </div>
            `;
        } else {
            // Already at Shift-0, character dies immediately
            chatContent += `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>${target.name} was already at Shift-0 Endurance and dies immediately!</div>
            </div>
            </div>
            `;
        }
        } else if (killCheckResult.includes("End. Loss") && !isLethalDamage) {
            // Failed death save but non-lethal damage = extended unconsciousness only
            chatContent += `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Failed death save but non-lethal damage - extended unconsciousness only.</div>
            </div>
            </div>
            `;
            
        } else {
            // Passed the death save = just unconscious and stable
            chatContent += `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Passed death save - unconscious but stable.</div>
            </div>
            </div>
            `;
        }

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: target}),
            content: chatContent,
            whisper: ChatMessage.getWhisperRecipients("GM")
        });
    }

    static async applyDyingEffect(target) {
        // Remove any existing dying effects
        const existingDyingEffects = target.effects.filter(e => e.flags["msh-faserip"]?.dying);
        if (existingDyingEffects.length > 0) {
            await game.msh.runAsGM({
                operation: "deleteEmbeddedDocuments",
                targetActorUuid: target.uuid,
                args: ["ActiveEffect", existingDyingEffects.map(e => e.id)]
                });
        }

        // Create dying effect
        const dyingEffect = {
            name: "Dying",
            icon: "icons/svg/skull.svg",
            flags: {
                "msh-faserip": {
                    dying: true
                }
            },
            changes: [
                {
                    key: "system.status.dying",
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: true
                }
            ],
            statuses: ["dying"]
        };

        await game.msh.runAsGM({
            operation: "createEmbeddedDocuments",
            targetActorUuid: target.uuid,
            args: ["ActiveEffect", [dyingEffect]]
            });
    }

    /**
     * Helper function to get body armor value from an actor
     * @param {Actor} actor - The actor to check
     * @returns {Number} - Body armor value
     */
    static getBodyArmorValue(actor) {
        // Check for body armor equipment
        const armorItems = actor.items.filter(i => 
            i.type === "equipment" && 
            i.system.category === "armor" && 
            i.system.protection
        );
        
        let bodyArmorValue = 0;
        
        if (armorItems.length > 0) {
            const bestArmor = armorItems.reduce((best, current) => {
                const bestValue = CONFIG.FASERIP?.rankValues?.[best.system.protection] || 0;
                const currentValue = CONFIG.FASERIP?.rankValues?.[current.system.protection] || 0;
                return currentValue > bestValue ? current : best;
            });
            
            bodyArmorValue = CONFIG.FASERIP?.rankValues?.[bestArmor.system.protection] || 0;
        }

        // Check for Body Armor powers
        const bodyArmorPower = actor.items.find(i => 
            i.type === "power" && 
            (i.name.toLowerCase().includes("body armor") || 
            i.name.toLowerCase().includes("armor") ||
            i.system.type?.toLowerCase().includes("body armor"))
        );
        
        if (bodyArmorPower) {
            const powerValue = CONFIG.FASERIP?.rankValues?.[bodyArmorPower.system.rank] || 0;
            bodyArmorValue = Math.max(bodyArmorValue, powerValue);
        }

        return bodyArmorValue;
    }
}
