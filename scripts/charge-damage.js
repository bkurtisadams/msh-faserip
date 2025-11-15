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

// Rest of the code remains the same...
export async function processChargeAttack(attackData) {
    const { attacker, target, areasMovedThrough, rollResult } = attackData;
    
    // Get attacker stats
    const attackerEndurance = attacker.system.abilities.endurance.value || 0;
    const attackerStrength = attacker.system.abilities.strength.value || 0;
    const attackerBodyArmor = getBodyArmorValue(attacker);
    
    // Get target stats
    const isInanimateObject = !target.system?.abilities;
    const defenderBodyArmor = isInanimateObject ? 0 : getBodyArmorValue(target);
    const defenderEndurance = isInanimateObject ? 0 : (target.system.abilities.endurance.value || 0);
    const defenderEnduranceRank = isInanimateObject ? "Typical" : (target.system.abilities.endurance.rank || "Typical");
    const objectMaterialStrength = isInanimateObject ? 
        (CONFIG.FASERIP?.rankValues?.[target.system?.materialStrength] || 0) : 0;

    // Calculate charge damage
    const damageResults = calculateChargeDamage({
        attackerEndurance,
        attackerBodyArmor,
        defenderBodyArmor,
        defenderEndurance,
        defenderEnduranceRank,
        areasMovedThrough,
        resultColor: rollResult,
        isInanimateObject,
        objectMaterialStrength,
        attackerStrength
    });

    // Start building chat content
    let chatContent = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>Charge Attack: ${attacker.name} vs ${target.name}</strong>
            </div>
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div><strong>Roll Result:</strong> ${rollResult.toUpperCase()} (${damageResults.effectType})</div>
                <div><strong>Areas Moved:</strong> ${areasMovedThrough} (+${damageResults.columnShiftBonus}CS bonus)</div>
                <div><strong>Attack Stats:</strong> Endurance ${attackerEndurance}, Body Armor ${attackerBodyArmor}</div>
                <div><strong>Defense Stats:</strong> ${isInanimateObject ? `Material Strength ${objectMaterialStrength}` : `Body Armor ${defenderBodyArmor}`}</div>
                <hr style="margin: 8px 0;">
                <div><strong>Base Damage:</strong> ${damageResults.baseDamage} (max of Endurance and Body Armor)</div>
                <div><strong>Speed Damage:</strong> ${damageResults.speedDamage} (2 × ${areasMovedThrough} areas)</div>
                <div><strong>Total Damage:</strong> ${damageResults.totalDamage}</div>
                <hr style="margin: 8px 0;">
                <div><strong>Result:</strong> ${damageResults.description}</div>
                <hr style="margin: 8px 0;">
                ${damageResults.damageToDefender > 0 ? `<div style="color: #cc0000; font-weight: bold;">📍 ${target.name} takes ${damageResults.damageToDefender} damage</div>` : ''}
                ${damageResults.damageToAttacker > 0 ? `<div style="color: #cc0000; font-weight: bold;">💥 ${attacker.name} takes ${damageResults.damageToAttacker} rebound damage</div>` : ''}
    `;

    // Add FEAT roll buttons for slam and stun (don't auto-resolve anymore)
    if (damageResults.effectType === "slam" && damageResults.damageToDefender > 0 && !isInanimateObject) {
        chatContent += `
            <button class="resolve-slam-feat" 
                    data-target="${target.uuid}" 
                    data-attacker-strength="${attackerStrength}"
                    style="margin-top: 8px; padding: 5px 10px; background: #ff6b6b; border: 1px solid #ff5252; border-radius: 3px; cursor: pointer; font-weight: bold;">
                🎲 ${target.name} Roll Slam Endurance FEAT
            </button>
        `;
    }

    if (damageResults.effectType === "stun" && damageResults.damageToDefender > 0 && !isInanimateObject) {
        chatContent += `
            <button class="resolve-stun-feat" 
                    data-target="${target.uuid}" 
                    data-attacker-strength="${attackerStrength}"
                    style="margin-top: 8px; padding: 5px 10px; background: #9c27b0; border: 1px solid #7b1fa2; border-radius: 3px; cursor: pointer; font-weight: bold;">
                🎲 ${target.name} Roll Stun Endurance FEAT
            </button>
        `;
    }

    // Close the div
    chatContent += `
            </div>
        </div>
    `;

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        content: chatContent
    });

    // Apply damage using existing combat handler
    if (damageResults.damageToDefender > 0) {
        await game.msh.runAsGM({
            operation: 'adjustTargetHealth',
            targetActorUuid: target.uuid,
            newHealth: Math.max(0, target.system.attributes.health.value - damageResults.damageToDefender)
        });
    }

    if (damageResults.damageToAttacker > 0) {
        await game.msh.runAsGM({
            operation: 'adjustTargetHealth',
            targetActorUuid: attacker.uuid,
            newHealth: Math.max(0, attacker.system.attributes.health.value - damageResults.damageToAttacker)
        });
    }

    return damageResults;
}

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
    console.log("🔧 initializeSlamHandlers() called");
    // Add event listener for collision damage calculation
    Hooks.on("renderChatMessage", (app, html, data) => {
        
        // Handle slam FEAT rolls - FIXED
        html.find('.resolve-slam-feat').on('click', async function() {
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
            $(this).prop('disabled', true).text('FEAT Rolled');
        });

        // Handle stun FEAT rolls - FIXED
        html.find('.resolve-stun-feat').on('click', async function() {
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
            $(this).prop('disabled', true).text('FEAT Rolled');
        });

        // EXISTING collision damage handler (unchanged)
        html.find('.calculate-slam-collision').on('click', async function() {
            console.log("🎯 Collision button clicked");
            const targetUuid = this.dataset.target;
            const slamDistance = parseInt(this.dataset.distance);
            const slamSpeed = parseInt(this.dataset.speed);
            const attackerStrength = parseInt(this.dataset.attackerStrength);
            
            const targetDoc = await fromUuid(targetUuid);
            const targetActor = targetDoc?.actor ?? targetDoc;
            
            if (!targetActor) {
                ui.notifications.error("Target actor not found!");
                return;
            }
            
            // Material strength options
            const materialOptions = [
                { value: 2, label: "Feeble (Cloth, glass, brush, paper)" },
                { value: 4, label: "Poor (Plastics, crystal, wood)" },
                { value: 6, label: "Typical (Rubber, soft metals, ice, adobe)" },
                { value: 10, label: "Good (Brick, aluminum, light machinery, asphalt)" },
                { value: 20, label: "Excellent (Concrete, Beta cloth, iron, bullet-proof glass)" },
                { value: 30, label: "Remarkable (Reinforced concrete, steel)" },
                { value: 40, label: "Incredible (Solid stone, Vibranium, volcanic rock)" },
                { value: 50, label: "Amazing (Osmium steel, granite, gemstones)" },
                { value: 75, label: "Monstrous (Diamond, super-heavy alloys)" },
                { value: 100, label: "Unearthly (Adamantium steel, mystical elements)" },
                { value: 1000, label: "Class 1000 (Legendary artifacts - Cap's shield)" },
                { value: 3000, label: "Class 3000 (Nearly indestructible artifacts)" },
                { value: 5000, label: "Class 5000 (Thor's hammer, ultimate artifacts)" }
            ];
            
            // Create collision dialog
            const collisionData = await new Promise((resolve) => {
                const dialog = new Dialog({
                    title: "Slam Collision Damage",
                    content: `
                        <div style="padding: 10px;">
                            <p><strong>${targetActor.name}</strong> is slammed ${slamDistance} area${slamDistance > 1 ? 's' : ''}!</p>
                            
                            <div style="margin: 15px 0;">
                                <label style="display: block; margin-bottom: 5px;"><strong>Distance to impact (areas):</strong></label>
                                <input type="number" id="distance-to-obstacle" min="0.5" max="${slamDistance}" step="0.5" value="${slamDistance}" 
                                    style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
                                <small style="color: #666;">How many areas before hitting the obstacle? (Max: ${slamDistance})</small>
                            </div>
                            
                            <div style="margin: 15px 0;">
                                <label style="display: block; margin-bottom: 8px;"><strong>Obstacle Type:</strong></label>
                                <div style="margin-left: 10px;">
                                    <label style="display: block; margin-bottom: 5px; cursor: pointer;">
                                        <input type="radio" name="obstacle-type" value="object" checked style="margin-right: 5px;">
                                        Inanimate Object (wall, building, etc.)
                                    </label>
                                    <label style="display: block; cursor: pointer;">
                                        <input type="radio" name="obstacle-type" value="character" style="margin-right: 5px;">
                                        Character (use targeted token)
                                    </label>
                                </div>
                            </div>
                            
                            <div id="object-options" style="margin: 15px 0;">
                                <label style="display: block; margin-bottom: 5px;"><strong>Material Strength:</strong></label>
                                <select id="obstacle-material" style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
                                    ${materialOptions.map(opt => 
                                        `<option value="${opt.value}" ${opt.value === 10 ? 'selected' : ''}>${opt.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <div id="character-options" style="margin: 15px 0; display: none; padding: 10px; background-color: #e8f4f8; border-radius: 3px;">
                                <small style="color: #666;">
                                    <strong>Note:</strong> Make sure you have targeted the character token on the canvas before clicking Calculate.
                                </small>
                            </div>
                        </div>
                    `,
                    buttons: {
                        calculate: {
                            icon: '<i class="fas fa-calculator"></i>',
                            label: "Calculate Collision",
                            callback: (html) => {
                                const distanceToObstacle = parseFloat(html.find('#distance-to-obstacle').val());
                                const obstacleType = html.find('input[name="obstacle-type"]:checked').val();
                                const materialStrength = parseInt(html.find('#obstacle-material').val());
                                resolve({ distanceToObstacle, obstacleType, materialStrength });
                            }
                        },
                        cancel: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Cancel",
                            callback: () => resolve(null)
                        }
                    },
                    default: "calculate",
                    render: (html) => {
                        // Toggle between object and character options
                        html.find('input[name="obstacle-type"]').on('change', function() {
                            const type = $(this).val();
                            if (type === "character") {
                                html.find('#object-options').hide();
                                html.find('#character-options').show();
                            } else {
                                html.find('#object-options').show();
                                html.find('#character-options').hide();
                            }
                        });
                    }
                }).render(true);
            });
            
            if (collisionData === null) return; // User cancelled
            
            const { distanceToObstacle, obstacleType, materialStrength } = collisionData;
            
            // BRANCH: Character vs Object collision
            if (obstacleType === "character") {
                // CHARACTER-TO-CHARACTER COLLISION
                // Get currently targeted token
                const targets = Array.from(game.user.targets);
                
                if (targets.length === 0) {
                    ui.notifications.error("No character targeted! Please target a token on the canvas.");
                    return;
                }
                
                const secondaryToken = targets[0];
                const secondaryActor = secondaryToken.actor;
                
                if (!secondaryActor) {
                    ui.notifications.error("Targeted token has no actor!");
                    return;
                }
                
                // Don't allow slamming into yourself
                if (secondaryActor.uuid === targetActor.uuid) {
                    ui.notifications.error("Cannot slam into yourself!");
                    return;
                }
                
                // Create flavor text message
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ alias: "Slam Collision" }),
                    content: `
                        <div style="background-color: #8b0000; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                💥 CHARACTER COLLISION! 💥
                            </div>
                            <div style="padding: 5px; font-size: 0.9em;">
                                <div><strong>${targetActor.name}</strong> is slammed into <strong>${secondaryActor.name}</strong>!</div>
                                <div style="margin: 5px 0;">Distance traveled: ${distanceToObstacle} areas</div>
                                <div style="margin-top: 8px;">Resolving as Charging attack...</div>
                            </div>
                        </div>
                    `
                });
                
                // Resolve as Charging attack: slammed character "charges" the secondary target
                await ActionDispatcher.roll("charging", {
                    actor: targetActor,  // Slammed character becomes "attacker"
                    abilityName: "fighting",
                    opts: {
                        autoApply: true,
                        showConfirm: false,
                        prefill: {
                            targetUuid: secondaryToken.document.uuid,
                            areasMovedThrough: distanceToObstacle
                        }
                    }
                });
                
                ui.notifications.info(`${targetActor.name} charging attack on ${secondaryActor.name} resolved!`);
                
            } else {
                // OBJECT COLLISION (existing code)
                const characterEndurance = targetActor.system.abilities.endurance.value || 0;
                const characterBodyArmor = getBodyArmorValue(targetActor);
                
                // Calculate slam damage using distance to obstacle
                const slamResults = calculateSlamDamage({
                    characterEndurance,
                    characterBodyArmor,
                    objectMaterialStrength: materialStrength,
                    slamSpeed: distanceToObstacle,
                    attackerStrength
                });
                
                // Determine break-through and remaining movement
                let areasLost = 0;
                let breaksThrough = false;
                let remainingMovement = 0;
                let breakThroughText = "";
                
                if (materialStrength <= 4) {
                    areasLost = 1;
                    breaksThrough = true;
                    breakThroughText = "Breaks through! Loses 1 area of movement.";
                } else if (materialStrength <= 20) {
                    areasLost = 2;
                    breaksThrough = true;
                    breakThroughText = "Breaks through! Loses 2 areas of movement.";
                } else if (materialStrength <= 40) {
                    areasLost = 3;
                    breaksThrough = true;
                    breakThroughText = "Breaks through! Loses 3 areas of movement.";
                } else {
                    areasLost = 0;
                    breaksThrough = false;
                    breakThroughText = "Cannot break through! Movement stops.";
                }
                
                if (breaksThrough) {
                    remainingMovement = slamDistance - distanceToObstacle - areasLost;
                    if (remainingMovement > 0) {
                        breakThroughText += ` <strong>${remainingMovement} area${remainingMovement > 1 ? 's' : ''} of movement remaining!</strong>`;
                    } else {
                        breakThroughText += " Movement exhausted.";
                    }
                }
                
                // Create detailed damage report
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ alias: "Collision Damage" }),
                    content: `
                        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                            <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                                <strong>${targetActor.name} - Slam Collision</strong>
                            </div>
                            <div style="padding: 5px 10px; font-size: 0.9em;">
                                <div><strong>Total Slam Distance:</strong> ${slamDistance} areas</div>
                                <div><strong>Distance to Obstacle:</strong> ${distanceToObstacle} areas</div>
                                <div><strong>Material Strength:</strong> ${materialStrength}</div>
                                <div><strong>Character Endurance:</strong> ${characterEndurance}</div>
                                <div><strong>Character Body Armor:</strong> ${characterBodyArmor}</div>
                                <div style="margin-top: 8px;"><strong>Impact Force:</strong> ${slamResults.totalDamage} (${characterEndurance} base + ${Math.round(distanceToObstacle * 2)} speed)</div>
                                ${slamResults.damageToCharacter > 0 ? 
                                    `<div style="color: #cc0000; font-weight: bold; margin-top: 5px;">Damage to ${targetActor.name}: ${slamResults.damageToCharacter}</div>` : 
                                    '<div style="color: #28a745; font-weight: bold; margin-top: 5px;">No damage taken</div>'
                                }
                                <div style="margin-top: 8px; padding: 5px; background-color: #fff3cd; border-radius: 3px;">
                                    ${breakThroughText}
                                </div>
                            </div>
                        </div>
                    `
                });
                
                // Apply damage if any
                if (slamResults.damageToCharacter > 0 && targetActor) {
                console.log(
                    "[COLLISION] Applying",
                    slamResults.damageToCharacter,
                    "collision damage to",
                    targetActor.name
                );

                try {
                    // Find an active token for the target actor on the current scene
                    const targetToken = targetActor.getActiveTokens()?.[0] ?? null;
                    const targetTokenOrDoc = targetToken?.document ?? targetToken;

                    if (!targetTokenOrDoc) {
                    console.warn(
                        "[COLLISION] No active token found for collision target",
                        targetActor.name
                    );
                    } else {
                    await applyDamageToTargets({
                        damage: slamResults.damageToCharacter,
                        damageType: "physical-blunt",
                        attackForm: "blunt",
                        // Pass an explicit token/doc so the GM-safe path can run
                        targets: [targetTokenOrDoc]
                    });

                       ui.notifications.info(
                        `${targetActor.name} is slammed into the wall for ${slamResults.damageToCharacter} collision impact (before armor).`
                        );
                    }
                } catch (err) {
                    console.error("[COLLISION] Failed to apply collision damage", err);
                    ui.notifications.error(
                    `Failed to apply collision damage to ${targetActor.name}. Check console for details.`
                    );
                }
                }

            }
            
            // Disable the button to prevent multiple calculations
            $(this).prop('disabled', true).text('Collision Calculated');
            
        }); // end of html.find('.calculate-slam-collision').on('click', async function() {
    }); // end of Hooks.on("renderChatMessage", (app, html, data) => {
}