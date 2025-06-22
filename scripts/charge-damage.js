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
        objectMaterialStrength = 0
    } = options;

    console.log("🏃 Calculating charge damage with options:", options);

    let results = {
        baseDamage: 0,
        speedDamage: 0,
        totalDamage: 0,
        damageToAttacker: 0,
        damageToDefender: 0,
        columnShiftBonus: 0,
        reboundDamage: 0,
        description: "",
        effectType: "miss"
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

    // Calculate damage based on result type
    if (results.effectType === "miss") {
        results.description = "Miss - No damage inflicted. Attacker continues moving for half speed.";
        return results;
    }

    // For Hit, Slam, or Stun results
    // Base damage = max(Endurance, Body Armor) + 2 points per area moved
    results.baseDamage = Math.max(attackerEndurance, attackerBodyArmor);
    results.speedDamage = 2 * areasMovedThrough;
    results.totalDamage = results.baseDamage + results.speedDamage;

    console.log(`💥 Base damage: ${results.baseDamage} (max of Endurance ${attackerEndurance} and Body Armor ${attackerBodyArmor})`);
    console.log(`⚡ Speed damage: ${results.speedDamage} (2 × ${areasMovedThrough} areas)`);
    console.log(`🎯 Total damage: ${results.totalDamage}`);

    // Handle damage absorption and rebound
    const effectiveDefenderArmor = isInanimateObject ? objectMaterialStrength : defenderBodyArmor;
    
    if (effectiveDefenderArmor >= results.totalDamage) {
        // All damage is absorbed and rebounded
        results.reboundDamage = results.totalDamage;
        results.damageToDefender = 0;
        
        // Apply rebound damage to attacker, reduced by their armor
        const netReboundDamage = Math.max(0, results.reboundDamage - attackerBodyArmor);
        results.damageToAttacker = netReboundDamage;
        
        console.log(`🛡️ All damage absorbed by ${isInanimateObject ? 'material strength' : 'defender armor'}: ${effectiveDefenderArmor}`);
        console.log(`↩️ Rebound damage: ${results.reboundDamage} - ${attackerBodyArmor} armor = ${netReboundDamage} to attacker`);
        
        results.description = `${isInanimateObject ? 'Object' : 'Defender'} armor (${effectiveDefenderArmor}) absorbs all damage. ` +
                            `Attacker takes ${netReboundDamage} rebound damage.`;
    } else {
        // Partial absorption
        const damageAbsorbed = effectiveDefenderArmor;
        results.damageToDefender = Math.max(0, results.totalDamage - damageAbsorbed);
        results.damageToAttacker = 0;
        
        console.log(`🛡️ Damage absorbed: ${damageAbsorbed}`);
        console.log(`💀 Net damage to ${isInanimateObject ? 'object' : 'defender'}: ${results.damageToDefender}`);
        
        results.description = `${results.totalDamage} total damage - ${damageAbsorbed} absorbed = ${results.damageToDefender} damage dealt.`;
    }

    // Add effect description
    switch (results.effectType) {
        case "hit":
            results.description += " Hit result.";
            break;
        case "slam":
            results.description += " Slam result - target may be knocked back.";
            break;
        case "stun":
            results.description += " Stun result - target may be stunned.";
            break;
    }

    return results;
}

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

/**
 * Get slam distance based on attacker's strength rank (for Grand Slam)
 * @param {String} strengthRank - Attacker's strength rank name
 * @returns {Number} - Distance in areas
 */
export function getGrandSlamDistance(strengthRank) {
    const strengthDistances = {
        "Shift-0": 0,
        "Feeble": 1,
        "Poor": 2,
        "Typical": 3,
        "Good": 4,
        "Excellent": 5,
        "Remarkable": 6,
        "Incredible": 7,
        "Amazing": 8,
        "Monstrous": 9,
        "Unearthly": 10,
        "Shift X": 12,
        "Shift Y": 14,
        "Shift Z": 16,
        "Class 1000": 32,
        "Class 3000": 50,
        "Class 5000": 100,
        "Beyond": 200
    };

    return strengthDistances[strengthRank] || 0;
}

/**
 * Process a charge attack with full FASERIP rules
 * @param {Object} attackData - Charge attack data
 *   - attacker: Actor making the charge
 *   - target: Target of the charge
 *   - areasMovedThrough: Number of areas moved
 *   - rollResult: Universal table result color
 * @returns {Object} - Complete charge attack results
 */
export async function processChargeAttack(attackData) {
    const { attacker, target, areasMovedThrough, rollResult } = attackData;
    
    // Get attacker stats
    const attackerEndurance = attacker.system.abilities.endurance.value || 0;
    const attackerBodyArmor = getBodyArmorValue(attacker);
    
    // Get target stats
    const isInanimateObject = !target.system?.abilities;
    const defenderBodyArmor = isInanimateObject ? 0 : getBodyArmorValue(target);
    const objectMaterialStrength = isInanimateObject ? 
        (CONFIG.FASERIP?.rankValues?.[target.system?.materialStrength] || 0) : 0;

    // Calculate charge damage
    const damageResults = calculateChargeDamage({
        attackerEndurance,
        attackerBodyArmor,
        defenderBodyArmor,
        areasMovedThrough,
        resultColor: rollResult,
        isInanimateObject,
        objectMaterialStrength
    });

    // Create chat message with results
    let chatContent = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>Charge Attack: ${attacker.name} vs ${target.name}</strong>
            </div>
            <div style="padding: 5px 10px; font-size: 0.9em;">
                <div><strong>Areas Moved:</strong> ${areasMovedThrough} (+${damageResults.columnShiftBonus}CS bonus)</div>
                <div><strong>Base Damage:</strong> ${damageResults.baseDamage} (max of Endurance ${attackerEndurance} and Body Armor ${attackerBodyArmor})</div>
                <div><strong>Speed Damage:</strong> ${damageResults.speedDamage} (2 × ${areasMovedThrough} areas)</div>
                <div><strong>Total Damage:</strong> ${damageResults.totalDamage}</div>
                <div><strong>Result:</strong> ${damageResults.description}</div>
                ${damageResults.damageToAttacker > 0 ? `<div style="color: #cc0000;"><strong>Attacker takes:</strong> ${damageResults.damageToAttacker} damage</div>` : ''}
                ${damageResults.damageToDefender > 0 ? `<div style="color: #cc0000;"><strong>Defender takes:</strong> ${damageResults.damageToDefender} damage</div>` : ''}
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

/**
 * Helper function to get body armor value from an actor
 * @param {Actor} actor - The actor to check
 * @returns {Number} - Body armor value
 */
export function getBodyArmorValue(actor) {
    console.log(`🛡️ DEBUG: Getting body armor for ${actor.name}`);
    
    // Check for body armor equipment
    const armorItems = actor.items.filter(i => 
        i.type === "equipment" && 
        i.system.category === "armor" && 
        i.system.protection
    );
    
    console.log(`🛡️ DEBUG: Found ${armorItems.length} armor items:`, armorItems.map(i => `${i.name} (${i.system.protection})`));
    
    let bodyArmorValue = 0;
    
    if (armorItems.length > 0) {
        const bestArmor = armorItems.reduce((best, current) => {
            // Handle both numeric values and rank names
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
            
            console.log(`🛡️ DEBUG: Comparing armor - ${best.name} (${best.system.protection}=${bestValue}) vs ${current.name} (${current.system.protection}=${currentValue})`);
            return currentValue > bestValue ? current : best;
        });
        
        // Set the body armor value, handling both numeric and rank name formats
        if (typeof bestArmor.system.protection === 'number') {
            bodyArmorValue = bestArmor.system.protection;
        } else {
            bodyArmorValue = CONFIG.FASERIP?.rankValues?.[bestArmor.system.protection] || 0;
        }
        console.log(`🛡️ DEBUG: Best equipment armor: ${bestArmor.name} with protection ${bestArmor.system.protection} = ${bodyArmorValue}`);
    }

    // Check for Body Armor powers
    const bodyArmorPower = actor.items.find(i => 
        i.type === "power" && 
        (i.name.toLowerCase().includes("body armor") || 
         i.name.toLowerCase().includes("armor") ||
         i.system.type?.toLowerCase().includes("body armor"))
    );
    
    if (bodyArmorPower) {
        // Handle both numeric values and rank names for powers
        let powerValue = 0;
        if (typeof bodyArmorPower.system.value === 'number') {
            powerValue = bodyArmorPower.system.value;
        } else {
            powerValue = CONFIG.FASERIP?.rankValues?.[bodyArmorPower.system.rank] || 0;
        }
        console.log(`🛡️ DEBUG: Found body armor power: ${bodyArmorPower.name} with rank ${bodyArmorPower.system.rank} = ${powerValue}`);
        bodyArmorValue = Math.max(bodyArmorValue, powerValue);
        console.log(`🛡️ DEBUG: Final body armor value after power: ${bodyArmorValue}`);
    }

    console.log(`🛡️ DEBUG: Final body armor value for ${actor.name}: ${bodyArmorValue}`);
    return bodyArmorValue;
}

// ============================================
// COLLISION DAMAGE EVENT HANDLER
// ============================================

/**
 * Initialize collision damage event handlers
 * This should be called when the module loads
 */
export function initializeSlamHandlers() {
    console.log("🔧 initializeSlamHandlers() called");
    // Add event listener for collision damage calculation
    Hooks.on("renderChatMessage", (app, html, data) => {
        html.find('.calculate-slam-collision').on('click', async function() {
            console.log("🎯 Collision button clicked");
            const targetUuid = this.dataset.target;
            const slamDistance = parseInt(this.dataset.distance);
            const slamSpeed = parseInt(this.dataset.speed);
            const attackerStrength = parseInt(this.dataset.attackerStrength);
            
            const targetActor = await fromUuid(targetUuid);
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