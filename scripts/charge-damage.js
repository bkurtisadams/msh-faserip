// charge-damage.js v1.1.0 - 2026-07-31
// v1.1.0: Delete dead legacy .calculate-slam-collision handler body (was
//         return-gated; caused "unreachable code" console warning). Live
//         handler is chat-hooks.js:712.
// charge-damage.js v1.0.1 - 2025-12-23
// v1.0.1: Disable legacy .calculate-slam-collision handler (now handled by chat-hooks.js + collision-damage.js)

import { 
  resolveSlamFeat, 
  resolveStunFeat, 
  getGrandSlamDistance 
} from './modules/combat/damage-resolution.js';
// At the top of charge-damage.js with other imports
import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { applyDamageToTargets } from "./modules/actions/action-utils.js";

/**
 * Calculate charge damage based on FASERIP rules
 * @param {Object} options - Charge calculation options
 *   - attackerEndurance: Number - Attacker's Endurance rank value
 *   - attackerBodyArmor: Number - Attacker's Body Armor rank value (0 if none)
 *   - defenderBodyArmor: Number - Defender's Body Armor rank value (0 if none)
 *   - areasMovedThrough: Number - Number of areas moved through before impact
 *   - resultColor: String - Universal table result ("white", "green", "yellow", "red")
 *   - isInanimateObject: Boolean - Whether target is an inanimate object
 *   - objectMaterialStrength: Number - Material strength if inanimate object
 *   - attackerStrength: Number - Attacker's strength for slam calculations
 *   - defenderEndurance: Number - Defender's endurance value
 *   - defenderEnduranceRank: String - Defender's endurance rank
 * @returns {Object} - Damage calculation results
 */
export function calculateChargeDamage(options) {
    const {
        attackerEndurance,
        attackerBodyArmor = 0,
        defenderBodyArmor = 0,
        areasMovedThrough,
        resultColor,
        isInanimateObject = false,
        objectMaterialStrength = 0,
        attackerStrength = 0,
        defenderEndurance = 6,
        defenderEnduranceRank = "Typical"
    } = options;

    console.log("🏃 Calculating charge damage with options:", options);

    let results = {
        baseDamage: 0,
        speedDamage: 0,
        totalDamage: 0,
        damageToAttacker: 0,
        damageToDefender: 0,
        columnShiftBonus: 0,
        description: "",
        effectType: "miss",
        slamEffect: null,
        knockbackDistance: 0,
        stunEffect: null,
        stunDuration: 0,
        reboundDamage: 0
    };

    // Calculate column shift bonus for charge (+1CS per area, max +3CS)
    results.columnShiftBonus = Math.min(areasMovedThrough, 3);

    // Determine effect type based on result color
    switch (resultColor.toLowerCase()) {
        case "white":
            results.effectType = "miss";
            break;
        case "green":
            results.effectType = "hit";
            break;
        case "yellow":
            results.effectType = "slam";
            break;
        case "red":
            results.effectType = "stun";
            break;
    }

    // Handle Miss result
    if (results.effectType === "miss") {
        results.description = "Miss - No damage inflicted. Attacker continues moving for half speed.";
        return results;
    }

    // Calculate damage for Hit, Slam, or Stun results
    // Damage = max(Endurance, Body Armor) + 2 points per area moved
    results.baseDamage = Math.max(attackerEndurance, attackerBodyArmor);
    results.speedDamage = 2 * areasMovedThrough;
    results.totalDamage = results.baseDamage + results.speedDamage;

    console.log(`[IMPACT] Base damage: ${results.baseDamage} (max of Endurance ${attackerEndurance} and Body Armor ${attackerBodyArmor})`);
    console.log(`[SPEED] Speed damage: ${results.speedDamage} (2 × ${areasMovedThrough} areas)`);
    console.log(`[TARGET] Total damage: ${results.totalDamage}`);

    // Determine effective defender armor
    const effectiveDefenderArmor = isInanimateObject ? objectMaterialStrength : defenderBodyArmor;

    // Apply FASERIP rebound rules
    if (effectiveDefenderArmor > results.totalDamage) {
        // REBOUND - Wall is stronger than impact force
        results.reboundDamage = results.totalDamage;
        results.damageToDefender = 0; // Wall takes no damage
        
        // All impact damage rebounds to character
        if (attackerBodyArmor >= results.reboundDamage) {
            results.damageToAttacker = 0;
            console.log(`[ARMOR] All damage rebounded (${results.reboundDamage}) but attacker's armor (${attackerBodyArmor}) absorbs it`);
        } else {
            results.damageToAttacker = results.reboundDamage - attackerBodyArmor;
            console.log(`[ARMOR] Rebound damage: ${results.reboundDamage} - ${attackerBodyArmor} attacker armor = ${results.damageToAttacker}`);
        }
        
        results.description = `${isInanimateObject ? 'Wall' : 'Defender'} (${effectiveDefenderArmor}) > impact (${results.totalDamage}) - full rebound!`;
        
    } else {
        // BREAK THROUGH - Character breaks through wall
        const damageAbsorbed = Math.min(results.totalDamage, effectiveDefenderArmor);
        results.damageToDefender = results.totalDamage - damageAbsorbed; // Wall is destroyed
        
        // MSH Rule: "Charging through a [X] strength wall will inflict [X] points of damage on the attacker"
        // Wall hits character back with its material strength value
        const damageFromWall = effectiveDefenderArmor;
        const damageAfterArmor = Math.max(0, damageFromWall - attackerBodyArmor);
        results.damageToAttacker = damageAfterArmor;
        
        console.log(`[OK] Break through: Wall strength ${damageFromWall} - ${attackerBodyArmor} character armor = ${damageAfterArmor} to character`);
        results.description = `Breaks through! Wall (${effectiveDefenderArmor}) inflicts ${damageFromWall} damage, ${attackerBodyArmor} absorbed by armor = ${damageAfterArmor} damage taken.`;
    }

    // Handle Slam effects (only if damage was dealt to defender)
    if (results.effectType === "slam" && results.damageToDefender > 0) {
        const targetData = {
            enduranceRank: defenderEnduranceRank,
            enduranceValue: defenderEndurance
        };
        
        const slamResult = resolveSlamFeat({targetEnduranceRank: targetData.enduranceRank, targetEnduranceValue: targetData.enduranceValue, attackerStrength, penetratingDamage: results.damageToDefender});
        results.slamEffect = slamResult.effect;
        results.knockbackDistance = slamResult.knockbackDistance;
        
        console.log(`🎯 Slam effect resolved: ${slamResult.effect}`);
        results.description += ` ${slamResult.description}`;
    }

    // Handle Stun effects (only if damage was dealt to defender)
    if (results.effectType === "stun" && results.damageToDefender > 0) {
        const targetData = {
            enduranceRank: defenderEnduranceRank,
            enduranceValue: defenderEndurance
        };
        
        // Resolve stun effect
        const stunResult = resolveStunFeat({targetEnduranceRank: targetData.enduranceRank, targetEnduranceValue: targetData.enduranceValue, penetratingDamage: results.damageToDefender});
        results.stunEffect = stunResult.effect;
        results.stunDuration = stunResult.stunDuration;
        
        console.log(`😵 Stun effect resolved: ${stunResult.effect} (${stunResult.stunDuration} rounds)`);
        results.description += ` Stun: ${stunResult.description}`;
        
        // Stun results can also include slam effects
        const slamResult = resolveSlamFeat({targetEnduranceRank: targetData.enduranceRank, targetEnduranceValue: targetData.enduranceValue, attackerStrength, penetratingDamage: results.damageToDefender});
        results.slamEffect = slamResult.effect;
        results.knockbackDistance = slamResult.knockbackDistance;
        
        if (slamResult.effect !== "No Slam") {
            console.log(`🎯 Stun also includes slam: ${slamResult.effect}`);
            results.description += ` Also ${slamResult.description}`;
        }
    }

    // Add effect type to description
    switch (results.effectType) {
        case "hit":
            results.description += " Hit result.";
            break;
        case "slam":
            results.description += " Slam result.";
            break;
        case "stun":
            results.description += " Stun result.";
            break;
    }

    return results;
}

// resolveStunEffect moved to modules/combat/damage-resolution.js

/**
 * Calculate damage when a character is slammed into an inanimate object
 * @param {Object} options - Slam calculation options
 *   - characterEndurance: Number - Character's Endurance rank value
 *   - characterBodyArmor: Number - Character's Body Armor rank value (0 if none)
 *   - objectMaterialStrength: Number - Material strength of the object
 *   - slamSpeed: Number - Speed at which character hits object (areas/round)
 *   - attackerStrength: Number - Strength of original attacker (for Grand Slam distance)
 * @returns {Object} - Slam damage calculation results
 */
export function calculateSlamDamage(options) {
    const {
        characterEndurance,
        characterBodyArmor = 0,
        objectMaterialStrength,
        slamSpeed,
        attackerStrength
    } = options;

    console.log("💥 Calculating slam-into-object damage:", options);

    // Treat slam as a charging attack by the slammed character
    const chargeOptions = {
        attackerEndurance: characterEndurance,
        attackerBodyArmor: characterBodyArmor,
        defenderBodyArmor: 0, // Objects don't have body armor
        areasMovedThrough: slamSpeed,
        resultColor: "green", // Assume hit for slam damage calculation
        isInanimateObject: true,
        objectMaterialStrength: objectMaterialStrength
    };

    const damageResults = calculateChargeDamage(chargeOptions);
    
    // For slams into objects, the character always takes the damage
    damageResults.damageToCharacter = damageResults.damageToAttacker || damageResults.damageToDefender;
    damageResults.description = `Character slammed into object with material strength ${objectMaterialStrength}. ` +
                               damageResults.description.replace('Attacker', 'Character');

    return damageResults;
}

// getGrandSlamDistance and resolveSlamEnduranceFeat moved to modules/combat/damage-resolution.js
// Use resolveSlamFeatWithRoll() for async interactive version

export function getBodyArmorValue(actor) {
    console.log(`🛡️ Getting body armor for ${actor.name}`);
    
    let bodyArmorValue = 0;
    
    // Check for body armor equipment
    const armorItems = actor.items.filter(i => 
        i.type === "equipment" && 
        i.system.category === "armor" && 
        i.system.protection
    );
    
    if (armorItems.length > 0) {
        const bestArmor = armorItems.reduce((best, current) => {
            const bestValue = typeof best.system.protection === 'number' ? 
                best.system.protection : 
                (CONFIG.FASERIP?.rankValues?.[best.system.protection] || 0);
            
            const currentValue = typeof current.system.protection === 'number' ? 
                current.system.protection : 
                (CONFIG.FASERIP?.rankValues?.[current.system.protection] || 0);
            
            return currentValue > bestValue ? current : best;
        });
        
        bodyArmorValue = typeof bestArmor.system.protection === 'number' ? 
            bestArmor.system.protection : 
            (CONFIG.FASERIP?.rankValues?.[bestArmor.system.protection] || 0);
        
        console.log(`🛡️ Best equipment armor: ${bestArmor.name} = ${bodyArmorValue}`);
    }

    // Check for Body Armor powers
    const bodyArmorPower = actor.items.find(i => 
        i.type === "power" && 
        (i.name.toLowerCase().includes("body armor") || 
         i.name.toLowerCase().includes("armor") ||
         i.system.type?.toLowerCase().includes("body armor"))
    );
    
    if (bodyArmorPower) {
        const powerValue = typeof bodyArmorPower.system.value === 'number' ? 
            bodyArmorPower.system.value : 
            (CONFIG.FASERIP?.rankValues?.[bodyArmorPower.system.rank] || 0);
        
        bodyArmorValue = Math.max(bodyArmorValue, powerValue);
        console.log(`🛡️ Body armor power: ${bodyArmorPower.name} = ${powerValue}, final = ${bodyArmorValue}`);
    }

    console.log(`🛡️ Final body armor for ${actor.name}: ${bodyArmorValue}`);
    return bodyArmorValue;
}

export function initializeSlamHandlers() {
    if (game.msh?.slamHandlersInstalled) return;
    game.msh ??= {};
    game.msh.slamHandlersInstalled = true;
    console.log("🔧 initializeSlamHandlers() called");
    // Add event listener for collision damage calculation
    Hooks.on("renderChatMessageHTML", (message, htmlEl) => {
        
        // Handle slam FEAT rolls - FIXED
        htmlEl.querySelectorAll('.resolve-slam-feat').forEach(el => el.addEventListener('click', async function() {
            console.log("🎲 Slam FEAT button clicked");
            const targetUuid = this.dataset.target;
            const attackerStrength = parseInt(this.dataset.attackerStrength);
            
            const targetActor = await fromUuid(targetUuid);
            if (!targetActor) {
                ui.notifications.error("Target actor not found!");
                return;
            }
            
            // Make the actual Endurance FEAT roll - FIXED
            const enduranceRank = targetActor.system.abilities?.endurance?.rank || "Typical";
            const rollValue = Math.ceil(Math.random() * 100);
            
            // Create a simple chat message for the roll instead of using roll.toMessage
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: `
                    <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px;">
                        <strong>🎲 ${targetActor.name} Slam Endurance FEAT</strong><br>
                        Rank: ${enduranceRank}<br>
                        Roll: <strong>${rollValue}</strong>
                    </div>
                `
            });
            
            // Resolve the slam effect based on the roll
            const color = game.faserip?.getResultColor(enduranceRank, rollValue) || 'white';
            const slamResult = resolveSlamFeat({
                targetEnduranceRank: enduranceRank,
                targetEnduranceValue: targetActor.system.abilities?.endurance?.value || 6,
                attackerStrength: attackerStrength,
                penetratingDamage: 1,
                roll: rollValue
            });
            
            // Show the slam result
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: `
                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 3px; padding: 10px;">
                        <strong>🎯 Slam Result for ${targetActor.name}:</strong><br>
                        Roll: ${rollValue} → ${color.toUpperCase()}<br>
                        Effect: <strong>${slamResult.effect}</strong><br>
                        ${slamResult.knockbackDistance > 0 ? `Knockback: ${slamResult.knockbackDistance} areas<br>` : ''}
                        ${slamResult.description}
                        ${slamResult.knockbackDistance > 0 ? `
                            <button class="calculate-slam-collision" 
                                    data-target="${targetActor.uuid}" 
                                    data-distance="${slamResult.knockbackDistance}" 
                                    data-speed="${slamResult.knockbackDistance}" 
                                    data-attacker-strength="${attackerStrength}"
                                    style="margin-top: 8px; padding: 5px 10px; background: #d4af37; border: 1px solid #b8941f; border-radius: 3px; cursor: pointer; font-weight: bold;">
                                🎯 Calculate Collision Damage
                            </button>
                        ` : ''}
                    </div>
                `
            });
            
            // Disable the button
            this.disabled = true; this.textContent = 'FEAT Rolled';
        }));

        // Handle stun FEAT rolls - FIXED
        htmlEl.querySelectorAll('.resolve-stun-feat').forEach(el => el.addEventListener('click', async function() {
            console.log("😵 Stun FEAT button clicked");
            const targetUuid = this.dataset.target;
            const attackerStrength = parseInt(this.dataset.attackerStrength);
            
            const targetActor = await fromUuid(targetUuid);
            if (!targetActor) {
                ui.notifications.error("Target actor not found!");
                return;
            }
            
            // Make the actual Endurance FEAT roll for stun - FIXED
            const enduranceRank = targetActor.system.abilities?.endurance?.rank || "Typical";
            const rollValue = Math.ceil(Math.random() * 100);
            
            // Create a simple chat message for the roll
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: `
                    <div style="background-color: #f3e5f5; border: 1px solid #ce93d8; border-radius: 3px; padding: 8px;">
                        <strong>🎲 ${targetActor.name} Stun Endurance FEAT</strong><br>
                        Rank: ${enduranceRank}<br>
                        Roll: <strong>${rollValue}</strong>
                    </div>
                `
            });
            const stunResult = resolveStunFeat({
                targetEnduranceRank: enduranceRank,
                targetEnduranceValue: targetActor.system.abilities?.endurance?.value || 6,
                penetratingDamage: 1,
                roll: rollValue
            });
            const slamResult   = resolveSlamFeat({
                targetEnduranceRank: enduranceRank,
                targetEnduranceValue: targetActor.system.abilities?.endurance?.value || 6,
                attackerStrength: attackerStrength,
                penetratingDamage: 1,
                roll: rollValue
            });
            
            // Show the stun result
            let stunContent = `
                <div style="background-color: #f3e5f5; border: 1px solid #ce93d8; border-radius: 3px; padding: 10px;">
                    <strong>😵 Stun Result for ${targetActor.name}:</strong><br>
                    Roll: ${rollValue} → ${color.toUpperCase()}<br>
                    Stun Effect: <strong>${stunResult.effect}</strong><br>
                    ${stunResult.stunDuration > 0 ? `Duration: ${stunResult.stunDuration} rounds<br>` : ''}
                    ${stunResult.description}<br>
            `;
            
            // Add slam information if applicable
            if (slamResult.effect !== "No Slam") {
                stunContent += `
                    <br><strong>Also includes slam:</strong> ${slamResult.effect}<br>
                    ${slamResult.knockbackDistance > 0 ? `Knockback: ${slamResult.knockbackDistance} areas<br>` : ''}
                `;
            }
            
            stunContent += `</div>`;
            
            // Add collision button if there's knockback
            if (slamResult.knockbackDistance > 0) {
                stunContent = stunContent.replace('</div>', `
                    <button class="calculate-slam-collision" 
                            data-target="${targetActor.uuid}" 
                            data-distance="${slamResult.knockbackDistance}" 
                            data-speed="${slamResult.knockbackDistance}" 
                            data-attacker-strength="${attackerStrength}"
                            style="margin-top: 8px; padding: 5px 10px; background: #d4af37; border: 1px solid #b8941f; border-radius: 3px; cursor: pointer; font-weight: bold;">
                        🎯 Calculate Collision Damage
                    </button>
                </div>`);
            }
            
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: stunContent
            });
            
            // Disable the button
            this.disabled = true; this.textContent = 'FEAT Rolled';
        }));

        // Legacy .calculate-slam-collision handler removed — collision damage
        // is handled by chat-hooks.js + collision-damage.js.
    }); // end of Hooks.on("renderChatMessageHTML")
}