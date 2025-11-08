import { 
  resolveSlamFeat, 
  resolveStunFeat, 
  getGrandSlamDistance 
} from './modules/combat/damage-resolution.js';

// resolveSlamEffect moved to modules/combat/damage-resolution.js

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

    console.log(`💥 Base damage: ${results.baseDamage} (max of Endurance ${attackerEndurance} and Body Armor ${attackerBodyArmor})`);
    console.log(`⚡ Speed damage: ${results.speedDamage} (2 × ${areasMovedThrough} areas)`);
    console.log(`🎯 Total damage: ${results.totalDamage}`);

    // Determine effective defender armor
    const effectiveDefenderArmor = isInanimateObject ? objectMaterialStrength : defenderBodyArmor;

    // Apply FASERIP rebound rules
    if (effectiveDefenderArmor > results.totalDamage) {
        // Rebound occurs - armor completely stops the attack
        results.reboundDamage = results.totalDamage;
        results.damageToDefender = 0;
        
        if (attackerBodyArmor >= results.reboundDamage) {
            results.damageToAttacker = 0;
            console.log(`🛡️ All damage rebounded (${results.reboundDamage}) but attacker's armor (${attackerBodyArmor}) absorbs it`);
        } else {
            results.damageToAttacker = results.reboundDamage - attackerBodyArmor;
            console.log(`🛡️ Rebound damage: ${results.reboundDamage} - ${attackerBodyArmor} attacker armor = ${results.damageToAttacker}`);
        }
        
        results.description = `${isInanimateObject ? 'Object' : 'Defender'} armor (${effectiveDefenderArmor}) > damage (${results.totalDamage}) - damage rebounded.`;
    } else {
        // Normal damage resolution - no rebound
        const damageAbsorbed = Math.min(results.totalDamage, effectiveDefenderArmor);
        results.damageToDefender = results.totalDamage - damageAbsorbed;
        results.damageToAttacker = 0;
        
        console.log(`✅ Normal hit: ${results.totalDamage} damage - ${damageAbsorbed} absorbed = ${results.damageToDefender} to defender`);
        results.description = `${results.totalDamage} damage - ${damageAbsorbed} absorbed = ${results.damageToDefender} damage dealt.`;
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

            console.log("DEBUG: UUID from button:", targetUuid);  // new
            
            const targetDoc = await fromUuid(targetUuid);
            const targetActor = targetDoc?.actor ?? targetDoc;  // ← FIX: Get .actor if it's a token

            console.log("DEBUG: Resolved actor:", targetActor, targetActor?.name);  // new

            if (!targetActor) {
                ui.notifications.error("Target actor not found!");
                return;
            }
            
            // Directly prompt for material strength with a simple dropdown
            const materialOptions = [
                { value: 2, label: "Feeble (Cardboard, Glass)" },
                { value: 4, label: "Poor (Wood, Plastic)" },
                { value: 6, label: "Typical (Brick Wall)" },
                { value: 10, label: "Good (Stone Wall)" },
                { value: 20, label: "Excellent (Steel Wall)" },
                { value: 30, label: "Remarkable (Reinforced Steel)" },
                { value: 40, label: "Incredible (Super-Strong Material)" },
                { value: 50, label: "Amazing (Nearly Indestructible)" },
                { value: 75, label: "Monstrous (Extremely Durable)" },
                { value: 100, label: "Unearthly (Virtually Indestructible)" }
            ];
            
            // Create simple select dialog without the full Dialog class
            const selectHtml = materialOptions.map(opt => 
                `<option value="${opt.value}" ${opt.value === 6 ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            
            const materialStrength = await new Promise((resolve) => {
                new Dialog({
                    title: "Select Obstacle Material",
                    content: `
                        <div style="text-align: center; padding: 10px;">
                            <p><strong>${targetActor.name}</strong> hits an obstacle!</p>
                            <select id="obstacle-material" style="width: 100%; padding: 5px;">
                                ${selectHtml}
                            </select>
                        </div>
                    `,
                    buttons: {
                        ok: {
                            label: "Calculate Damage",
                            callback: (html) => resolve(parseInt(html.find('#obstacle-material').val()))
                        },
                        cancel: {
                            label: "No Collision",
                            callback: () => resolve(null)
                        }
                    },
                    default: "ok"
                }).render(true);
            });
            
            if (materialStrength === null) return; // User cancelled
            
            // Calculate slam damage using the existing function
            const slamResults = calculateSlamDamage({
                characterEndurance: targetActor.system.abilities.endurance.value || 0,
                characterBodyArmor: getBodyArmorValue(targetActor),
                objectMaterialStrength: materialStrength,
                slamSpeed: slamSpeed,
                attackerStrength: attackerStrength
            });
            
            // Create detailed damage report
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ alias: "Collision Damage" }),
                content: `
                    <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                            <strong>Slam Collision: ${targetActor.name} hits obstacle</strong>
                        </div>
                        <div style="padding: 5px 10px; font-size: 0.9em;">
                            <div><strong>Slam Speed:</strong> ${slamSpeed} areas/round</div>
                            <div><strong>Material Strength:</strong> ${materialStrength}</div>
                            <div><strong>Character Endurance:</strong> ${targetActor.system.abilities.endurance.value || 0}</div>
                            <div><strong>Damage Calculation:</strong> ${slamResults.description}</div>
                            ${slamResults.damageToCharacter > 0 ? 
                                `<div style="color: #cc0000;"><strong>Damage to ${targetActor.name}:</strong> ${slamResults.damageToCharacter}</div>` : 
                                '<div style="color: #28a745;"><strong>No damage taken</strong></div>'
                            }
                        </div>
                    </div>
                `
            });
            
            // Apply damage if any
            if (slamResults.damageToCharacter > 0) {
                const currentHealth = targetActor.system.attributes.health.value;
                const newHealth = Math.max(0, currentHealth - slamResults.damageToCharacter);
                
                await game.msh.runAsGM({
                    operation: 'adjustTargetHealth',
                    targetActorUuid: targetActor.uuid,
                    newHealth: newHealth
                });
                
                ui.notifications.info(`${targetActor.name} takes ${slamResults.damageToCharacter} collision damage!`);
            }
            
            // Disable the button to prevent multiple calculations
            $(this).prop('disabled', true).text('Damage Calculated');
        });
    });
}