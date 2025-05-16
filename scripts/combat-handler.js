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
  St: { white: "1–10", green: "1", yellow: "Damage", red: "No" },
  Sl: { white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
  Ki: { white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
};

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
        originalRollResult = "green" // Assume at least a hit if this function is called
    } = attackData;

    if (!target) {
        ui.notifications.warn("No target specified for damage.");
        return;
    }

    // 1. Get Defenses from Target
    let defenseData = await this.getTargetDefenses(target, damageType, baseDamage, options.skipDefenseDialog);

    // 2. Calculate Net Damage
    let netDamage = baseDamage;
    let damageAbsorbed = 0;
    let defenseUsed = "None";

    // Check if resistance applies to this damage type
    if (defenseData.resistanceValue > 0 && isResistanceApplicable(damageType, defenseData.resistanceType)) {
        // If damage is completely below resistance, no damage is taken
        if (baseDamage <= defenseData.resistanceValue) {
            netDamage = 0;
            damageAbsorbed = baseDamage;
            defenseUsed = `${defenseData.resistanceType} Resistance (Immune)`;
        } else {
            // Otherwise, reduce damage by resistance value
            netDamage = Math.max(0, baseDamage - defenseData.resistanceValue);
            damageAbsorbed = baseDamage - netDamage;
            defenseUsed = `${defenseData.resistanceType} Resistance`;
        }
    } else {
        // If no resistance applies, use the higher of Body Armor or Force Field
        let effectiveBodyArmor = (damageType.startsWith("Energy")) ? Math.max(0, defenseData.bodyArmorValue - 20) : defenseData.bodyArmorValue;
        let effectiveForceField = (damageType.startsWith("Energy")) ? defenseData.forceFieldValue : Math.max(0, defenseData.forceFieldValue - 10);
        
        if (effectiveBodyArmor >= effectiveForceField) {
            if (effectiveBodyArmor > 0) {
                const absorbedByBA = Math.min(netDamage, effectiveBodyArmor);
                netDamage -= absorbedByBA;
                damageAbsorbed += absorbedByBA;
                defenseUsed = "Body Armor";
            }
        } else {
            if (effectiveForceField > 0) {
                const absorbedByFF = Math.min(netDamage, effectiveForceField);
                netDamage -= absorbedByFF;
                damageAbsorbed += absorbedByFF;
                defenseUsed = "Force Field";
            }
        }
    }

    netDamage = Math.max(0, netDamage); // Damage cannot be negative

    // helper function for resistance
    function isResistanceApplicable(damageType, resistanceType) {
        // Map damage types to applicable resistances
        const resistanceMap = {
            "Energy-Fire": ["fire", "heat"],
            "Energy-Cold": ["cold"],
            "Energy-Electricity": ["electricity"],
            "Energy-Radiation": ["radiation"],
            "Physical-Toxic": ["toxin", "poison"],
            "Physical-Corrosive": ["corrosive", "acid"],
            "Mental": ["mental", "emotion"],
            "Magic": ["magic", "magical"],
            "Disease": ["disease"]
        };
        
        // Check if resistance applies to this damage type
        for (const [damageKey, resistances] of Object.entries(resistanceMap)) {
            if (damageType.toLowerCase().includes(damageKey.toLowerCase())) {
                return resistances.includes(resistanceType.toLowerCase());
            }
        }
        
        return false;
    }

    // 3. Apply Net Damage to Target Health
    const currentHealth = target.system.attributes.health.value;
    const newHealth = Math.max(0, currentHealth - netDamage);
    await target.update({"system.attributes.health.value": newHealth});
    
    if (netDamage > 0) {
        ui.notifications.info(`${target.name} takes ${netDamage} damage.`);
    } else {
        ui.notifications.info(`${target.name} takes no damage after defenses.`);
    }

    // 4. Create a summary chat message
    let defenseSummary = `Defenses Applied by ${target.name}:`;
    if (defenseData.usedBodyArmor) defenseSummary += ` Body Armor (${defenseData.bodyArmorValue}),`;
    if (defenseData.usedForceField) defenseSummary += ` Force Field (${defenseData.forceFieldValue}),`;
    if (defenseData.usedResistance) defenseSummary += ` Resistance (${defenseData.resistanceValue} vs ${damageType}),`;
    if (!defenseData.usedBodyArmor && !defenseData.usedForceField && !defenseData.usedResistance) defenseSummary += " None.";
    else defenseSummary = defenseSummary.slice(0, -1) + "."; // Remove last comma

    let chatContent = `
        <div class="msh-damage-summary">
            <h4>Damage Resolution: ${sourceName} vs ${target.name}</h4>
            <p><strong>Base Damage:</strong> ${baseDamage} (${damageType})</p>
            <p>${defenseSummary}</p>
            <p><strong>Damage Absorbed:</strong> ${damageAbsorbed}</p>
            <p><strong>Net Damage Taken:</strong> ${netDamage}</p>
        </div>
    `;

    // 5. Handle Secondary Effects (Stun, Slam, Kill) *if damage was inflicted*
    let secondaryEffectResult = "";
    if (netDamage > 0) { // Only if some damage got through
        // Determine which secondary effect to apply based on attack type and roll result
        if (damageType.toLowerCase().includes("blunt")) {
            // Blunt attack effects
            if (originalRollResult.toLowerCase() === "yellow" && canBeSlam) {
                // Yellow result for Blunt typically results in Slam
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Slam", sourceName);
                chatContent += `<p><strong>Slam Check:</strong> ${secondaryEffectResult}</p>`;
            } else if (originalRollResult.toLowerCase() === "red" && canBeStun) {
                // Red result for Blunt typically results in Stun
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName);
                chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
            }
        } else if (damageType.toLowerCase().includes("edged")) {
            // Edged attack effects
            if (originalRollResult.toLowerCase() === "yellow" && canBeStun) {
                // Yellow result for Edged typically results in Stun
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName);
                chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
            } else if (originalRollResult.toLowerCase() === "red" && canBeKill) {
                // Red result for Edged typically results in Kill
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Kill", sourceName);
                chatContent += `<p><strong>Kill Check:</strong> ${secondaryEffectResult}</p>`;
            }
        } else if (damageType.toLowerCase().includes("energy")) {
            // Energy attack effects
            if (originalRollResult.toLowerCase() === "yellow" && canBeStun) {
                // Yellow result for Energy typically results in Stun
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName);
                chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
            } else if (originalRollResult.toLowerCase() === "red" && canBeKill) {
                // Red result for Energy typically results in Kill
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Kill", sourceName);
                chatContent += `<p><strong>Kill Check:</strong> ${secondaryEffectResult}</p>`;
            }
        } else if (damageType.toLowerCase().includes("force")) {
            // Force attack effects
            if (originalRollResult.toLowerCase() === "yellow" && canBeStun) {
                // Yellow result for Force typically results in Stun
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName);
                chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
            } else if (originalRollResult.toLowerCase() === "red" && canBeStun) {
                // Red result for Force typically results in Stun as well
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Stun", sourceName);
                chatContent += `<p><strong>Stun Check:</strong> ${secondaryEffectResult}</p>`;
            }
        } else if (damageType.toLowerCase().includes("shooting")) {
            // Shooting attack effects
            if (originalRollResult.toLowerCase() === "yellow" && canBeSlam) {
                // Yellow result for Shooting typically results in Bullseye
                // Often treated as Slam in implementations
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Slam", sourceName);
                chatContent += `<p><strong>Bullseye/Slam Check:</strong> ${secondaryEffectResult}</p>`;
            } else if (originalRollResult.toLowerCase() === "red" && canBeKill) {
                // Red result for Shooting typically results in Kill
                secondaryEffectResult = await this.rollSecondaryFeat(target, "Kill", sourceName);
                chatContent += `<p><strong>Kill Check:</strong> ${secondaryEffectResult}</p>`;
            }
        }
    } else if ( (canBeStun && (originalRollResult.toLowerCase() === "yellow" || originalRollResult.toLowerCase() === "red")) ||
                (canBeSlam && originalRollResult.toLowerCase() === "yellow") ||
                (canBeKill && originalRollResult.toLowerCase() === "red") ) {
         chatContent += `<p>No damage inflicted; secondary effects (Stun/Slam/Kill) are negated.</p>`;
    }

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: attacker}),
        content: chatContent
        // You might want to whisper this to GM and target or make it public
    });

    // 6. Check for Unconsciousness / Death if Health is 0
    if (target.system.attributes.health.value <= 0) {
        // Determine if this is a potentially lethal attack
        // Energy attacks, Edged attacks, and Shooting attacks can trigger death checks
        const isLethalDamage = 
            damageType.toLowerCase().includes("energy") || 
            damageType.toLowerCase().includes("edged") || 
            damageType.toLowerCase().includes("shooting");
            
        await this.handleZeroHealth(target, attacker, isLethalDamage);
    }

    console.log("CombatHandler.processAttack called with:", attackData); // Added for debugging
}

    /**
     * Prompts the target (or GM) to apply defenses.
     * @returns {Object} { bodyArmorValue, forceFieldValue, resistanceValue, usedBodyArmor, usedForceField, usedResistance }
     */
    static async getTargetDefenses(target, damageType, baseDamage, skipDialog = false) {
        // Default defense values
        let defenses = {
            bodyArmorValue: 0,
            forceFieldValue: 0,
            resistanceValue: 0,
            usedBodyArmor: false,
            usedForceField: false,
            usedResistance: false
        };

        // --- Automatic Defense Calculation (Example) ---
        // Body Armor (item)
        const armorItems = target.items.filter(i => i.type === "equipment" && i.system.category === "armor" && i.system.protection);
        if (armorItems.length > 0) {
            // Assuming the best armor is equipped or active; more complex logic might be needed
            const bestArmor = armorItems.sort((a,b) => (CONFIG.FASERIP.rankValues[b.system.protection] || 0) - (CONFIG.FASERIP.rankValues[a.system.protection] || 0))[0];
            defenses.bodyArmorValue = CONFIG.FASERIP.rankValues[bestArmor.system.protection] || 0;
            defenses.usedBodyArmor = true; // Assume it's always used if present
        }

        // Body Armor (natural/power) - This part needs more detail on how you store natural BA
        const naturalBAPower = target.items.find(i => i.type === "power" && i.name.toLowerCase().includes("body armor"));
        if (naturalBAPower) {
            const naturalBAValue = CONFIG.FASERIP.rankValues[naturalBAPower.system.rank] || 0;
            if (naturalBAValue > defenses.bodyArmorValue) { // Use the better of item or natural
                defenses.bodyArmorValue = naturalBAValue;
                defenses.usedBodyArmor = true;
            }
        }

        // Force Field (power)
        const ffPower = target.items.find(i => i.type === "power" && i.name.toLowerCase().includes("force field") && i.system.isActive);
        if (ffPower) {
            defenses.forceFieldValue = CONFIG.FASERIP.rankValues[ffPower.system.rank] || 0;
            defenses.usedForceField = true;
        }

        // ========= RESISTANCE HANDLING =========
        console.log("Target resistances:", target.system.resistances);
        
        // First, normalize the resistances data structure
        let resistancesArray = [];
        if (Array.isArray(target.system.resistances)) {
            resistancesArray = target.system.resistances;
        } else if (typeof target.system.resistances === 'object') {
            // Convert object with numeric keys to array
            resistancesArray = Object.values(target.system.resistances);
        }
        console.log("Normalized resistances array:", resistancesArray);

        // Normalize damage type
        let normalizedDamageType = damageType.toLowerCase();

        // If we have a short code, expand it
        const damageTypeExpansion = {
            "s": "physical-shooting",
            "sh": "physical-shooting",
            "ba": "physical-blunt",
            "ea": "physical-edged",
            "tb": "physical-blunt",
            "te": "physical-edged",
            "gp": "physical-grapple",
            "gb": "physical-grab",
            "e": "energy-energy",
            "en": "energy-energy",
            "f": "force",
            "fo": "force",
            "st": "stun",
            "stun": "stun"
        };

        if (damageTypeExpansion[normalizedDamageType]) {
            normalizedDamageType = damageTypeExpansion[normalizedDamageType];
        }

        console.log(`Normalized damage type: ${normalizedDamageType}`);

        // Find relevant resistance from system.resistances
        let relevantResistance = null;
        
        // Direct match - exact damage type
        relevantResistance = resistancesArray.find(r => 
            r.type?.toLowerCase() === normalizedDamageType
        );
        console.log("Direct match result:", relevantResistance);

        // Category match - e.g., "physical-blunt" would match "physical"
        if (!relevantResistance) {
            const mainCategory = normalizedDamageType.split('-')[0];
            relevantResistance = resistancesArray.find(r => 
                r.type?.toLowerCase() === mainCategory
            );
            console.log("Category match result:", relevantResistance, "using main category:", mainCategory);
        }

        // Substring match (fallback)
        if (!relevantResistance) {
            relevantResistance = resistancesArray.find(r => 
                normalizedDamageType.includes(r.type?.toLowerCase() || "")
            );
            console.log("Substring match result:", relevantResistance);
        }

        // If we found a resistance in system.resistances, use it
        if (relevantResistance) {
            defenses.resistanceValue =
                typeof relevantResistance.value === "number"
                    ? relevantResistance.value
                    : CONFIG.FASERIP.rankValues[relevantResistance.rank] || 0;
            defenses.usedResistance = true;
            console.log(`✅ Resistance from system.resistances matched: ${relevantResistance.type}, value = ${defenses.resistanceValue}`);
        }

        // Also check for Resistance powers (as an item)
        const mainCategory = normalizedDamageType.split('-')[0];
        
        // Check for any resistance power related to this damage type
        const resPower = target.items.find(i => {
            if (i.type !== "power") return false;
            const powerName = i.name.toLowerCase();
            
            // Check if it's a "Resistance to X" power
            if (powerName.startsWith("resistance to ") || powerName.startsWith("immunity to ")) {
                // Extract the resistance type from the power name
                const resType = powerName.replace(/^(resistance|immunity) to /, "").trim();
                
                // Check if this resistance type matches our damage type
                return mainCategory.includes(resType) || resType.includes(mainCategory);
            }
            return false;
        });
        
        if (resPower) {
            console.log(`Found resistance power: ${resPower.name}`);
            const powerResVal = typeof resPower.system.value === "number"
                ? resPower.system.value
                : CONFIG.FASERIP.rankValues[resPower.system.rank] || 0;
                
            // Use the better of system.resistances or power-based resistance
            if (powerResVal > defenses.resistanceValue) { 
                defenses.resistanceValue = powerResVal;
                defenses.usedResistance = true;
                console.log(`✅ Using resistance from power: ${resPower.name}, value = ${powerResVal}`);
            }
        }

        console.log("Final resistanceValue used in damage calc:", defenses.resistanceValue);

        if (skipDialog) { // GM might use this to speed things up
            return defenses;
        }

        // --- Dialog for Player to Confirm/Adjust Defenses ---
        // Only prompt if there are potential defenses to apply or if target is a PC
        if (target.hasPlayerOwner && (defenses.bodyArmorValue > 0 || defenses.forceFieldValue > 0 || defenses.resistanceValue > 0)) {
            return new Promise((resolve) => {
                let dialogContent = `
                    <h4>${target.name} is attacked with ${baseDamage} ${damageType} damage!</h4>
                    <p>Apply defenses:</p>
                    <form>
                        ${defenses.bodyArmorValue > 0 ? `
                        <div class="form-group">
                            <label for="useBodyArmor">Use Body Armor (${defenses.bodyArmorValue})?</label>
                            <input type="checkbox" name="useBodyArmor" id="useBodyArmor" ${defenses.usedBodyArmor ? "checked" : ""}>
                        </div>` : ""}
                        ${defenses.forceFieldValue > 0 ? `
                        <div class="form-group">
                            <label for="useForceField">Use Force Field (${defenses.forceFieldValue})?</label>
                            <input type="checkbox" name="useForceField" id="useForceField" ${defenses.usedForceField ? "checked" : ""}>
                        </div>` : ""}
                        ${defenses.resistanceValue > 0 ? `
                        <div class="form-group">
                            <label for="useResistance">Use Resistance (${defenses.resistanceValue} vs ${damageType})?</label>
                            <input type="checkbox" name="useResistance" id="useResistance" ${defenses.usedResistance ? "checked" : ""}>
                        </div>` : ""}
                        <p><em>GM will adjudicate complex interactions (e.g., FF overload).</em></p>
                    </form>`;
                if (defenses.bodyArmorValue === 0 && defenses.forceFieldValue === 0 && defenses.resistanceValue === 0){
                    dialogContent = `<h4>${target.name} is attacked with ${baseDamage} ${damageType} damage!</h4> <p>No apparent defenses. Taking full damage.</p>`;
                }

                new Dialog({
                    title: "Apply Defenses",
                    content: dialogContent,
                    buttons: {
                        apply: {
                            label: "Apply",
                            callback: (html) => {
                                let finalDefenses = { bodyArmorValue: 0, forceFieldValue: 0, resistanceValue: 0, usedBodyArmor: false, usedForceField: false, usedResistance: false };
                                if (html.find("#useBodyArmor").is(":checked")) {
                                    finalDefenses.bodyArmorValue = defenses.bodyArmorValue;
                                    finalDefenses.usedBodyArmor = true;
                                }
                                if (html.find("#useForceField").is(":checked")) {
                                    finalDefenses.forceFieldValue = defenses.forceFieldValue;
                                    finalDefenses.usedForceField = true;
                                }
                                if (html.find("#useResistance").is(":checked")) {
                                    finalDefenses.resistanceValue = defenses.resistanceValue;
                                    finalDefenses.usedResistance = true;
                                }
                                resolve(finalDefenses);
                            }
                        }
                    },
                    default: "apply",
                    close: () => resolve(defenses) // If closed, use auto-calculated or no defenses
                }).render(true);
            });
        }
        return defenses; // No dialog needed, return auto-calculated
    }

    /**
     * Rolls an Endurance FEAT for Stun, Slam, or Kill.
     * @returns {String} Text result of the FEAT.
     */
    static async rollSecondaryFeat(target, featType, sourceName) {
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
                            
                            // Roll the dice
                            const roll = await new Roll("1d100").evaluate({async: true});
                            
                            // Apply karma to the roll total
                            const totalRoll = Math.min(100, roll.total + karmaSpent);
                            
                            // Determine the result color
                            const colorResult = game.msh.rollUniversalTable(enduranceRank, totalRoll);
                            
                            // Get the result based on action type and color
                            const actionCode = featType === "Stun" ? "St" : featType === "Slam" ? "Sl" : "Ki";
                            const featResultText = ACTION_RESULT_LABELS[actionCode][colorResult.toLowerCase()];
                            
                            // Deduct karma if spent, using your karma history system
                            if (karmaSpent > 0) {
                                // First update karma value
                                await target.update({
                                    "system.attributes.karma.value": availableKarma - karmaSpent
                                });
                                
                                // Create a new karma history entry that matches your format
                                const history = foundry.utils.deepClone(target.system.karma?.history || []);
                                const newEvent = {
                                    realDate: new Date().toLocaleDateString(),
                                    gameDate: game.time?.worldTime ? game.time.worldTime.toString() : "",
                                    amount: -karmaSpent,
                                    type: "Save",
                                    description: `${featType} save against ${sourceName}`
                                };
                                history.push(newEvent);
                                await target.update({ "system.karma.history": history });
                            }
                            
                            // Apply the effects based on result
                            let effectApplied = false;
                            
                            if (featType === "Kill" && featResultText === "End. Loss") {
                                const currentEndurance = CONFIG.FASERIP.rankValues[target.system.abilities.endurance.rank] || 0;
                                const newEnduranceRank = Object.keys(CONFIG.FASERIP.rankValues).find(key => 
                                    (CONFIG.FASERIP.rankValues[key] || 0) < currentEndurance) || "Shift-0";
                                
                                ui.notifications.info(`${target.name} loses an Endurance rank! (Now ${newEnduranceRank})`);
                                // await target.update({"system.abilities.endurance.rank": newEnduranceRank});
                                effectApplied = true;
                            }
                            else if (featType === "Stun" && featResultText === "1–10") {
                                // Roll stun duration
                                const stunDuration = await new Roll("1d10").evaluate({async: true});
                                ui.notifications.info(`${target.name} is Stunned for ${stunDuration.total} rounds!`);
                                
                                // Apply "Stunned" Active Effect
                                const effect = {
                                    label: "Stunned",
                                    icon: "icons/svg/daze.svg",
                                    duration: {
                                        rounds: stunDuration.total,
                                        startRound: game.combat?.round || 0
                                    },
                                    flags: {
                                        "msh-faserip": {
                                            stunned: true
                                        }
                                    }
                                };
                                
                                await target.createEmbeddedDocuments("ActiveEffect", [effect]);
                                effectApplied = true;
                            }
                            else if (featType === "Slam" && featResultText === "1 area") {
                                ui.notifications.info(`${target.name} is slammed back 1 area!`);
                                effectApplied = true;
                            }
                            else if (featType === "Slam" && featResultText === "Stagger") {
                                ui.notifications.info(`${target.name} staggers but remains in place!`);
                                effectApplied = true;
                            }
                            
                            // Create chat message to show the result
                            await ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({ actor: target }),
                                content: `
                                    <div style="background: #f5f5f0; padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
                                        <h3>${target.name} - ${featType} Save</h3>
                                        <div>Rolled ${roll.total} ${karmaSpent > 0 ? `+ ${karmaSpent} Karma` : ''} = ${totalRoll} against ${enduranceRank} Endurance</div>
                                        <div style="margin-top: 10px; text-align: center; padding: 5px; background-color: ${
                                            colorResult.toLowerCase() === 'white' ? '#f8f8f8' :
                                            colorResult.toLowerCase() === 'green' ? '#4CAF50' :
                                            colorResult.toLowerCase() === 'yellow' ? '#FFC107' : '#F44336'
                                        }; color: ${
                                            colorResult.toLowerCase() === 'white' || colorResult.toLowerCase() === 'yellow' ? '#333' : 'white'
                                        }; border-radius: 3px; font-weight: bold;">
                                            Result: ${featResultText} (${colorResult.toUpperCase()})
                                        </div>
                                        ${effectApplied ? `<div style="margin-top: 5px; font-style: italic;">Effect: ${
                                            featType === "Kill" && featResultText === "End. Loss" ? "Endurance rank reduced" :
                                            featType === "Stun" && featResultText === "1–10" ? "Stunned for 1d10 rounds" :
                                            featType === "Slam" && featResultText === "1 area" ? "Knocked back 1 area" :
                                            featType === "Slam" && featResultText === "Stagger" ? "Staggers in place" :
                                            "No effect"
                                        }</div>` : ''}
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
     * Handles actor reaching 0 Health.
     * @param {Object} target - The actor that reached 0 Health.
     * @param {Object} attacker - The actor that caused the damage.
     * @param {Boolean} isLethalDamage - Whether the damage was from a potentially lethal source.
     */
    static async handleZeroHealth(target, attacker, isLethalDamage = false) {
        ui.notifications.warn(`${target.name} has reached 0 Health!`);
        
        // Generate unconsciousness effect (1-10 rounds)
        const unconsciousDuration = Math.floor(Math.random() * 10) + 1;
        const effectData = { 
            label: "Unconscious", 
            icon: "icons/svg/skull.svg", 
            duration: {
                rounds: unconsciousDuration,
                startRound: game.combat?.round || 0
            }
        };
        await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
        
        let chatContent = `<p>${target.name} is Unconscious for ${unconsciousDuration} rounds.</p>`;
        
        // Only lethal damage types can trigger the death process
        if (isLethalDamage) {
            // Roll Endurance FEAT vs. Kill (as per rules, pg 31 "Life, Death, and Health")
            const killCheckResult = await this.rollSecondaryFeat(target, "Kill", "Reaching 0 Health");
            chatContent += `<p><strong>Death Check:</strong> ${killCheckResult}</p>`;
            
            // If Endurance Loss from Kill check, character starts dying
            if (killCheckResult.includes("End. Loss")) {
                ui.notifications.error(`${target.name} is dying!`);
                
                // Create a Dying effect
                const dyingEffectData = {
                    label: "Dying",
                    icon: "icons/svg/poison.svg",
                    flags: {
                        "msh-faserip": {
                            dying: true,
                            currentRound: game.combat?.round || 0
                        }
                    }
                };
                await target.createEmbeddedDocuments("ActiveEffect", [dyingEffectData]);
                
                chatContent += `<p>${target.name} is losing Endurance ranks each turn. Help needed!</p>`;
                
                // Note: You'd need to implement a combat round listener to handle Endurance loss per turn
                // This would be defined elsewhere in your code
            }
        } else {
            // Non-lethal (Blunt/Force) damage just causes unconsciousness
            chatContent += `<p>Knocked out by blunt force/subdual damage. No risk of death.</p>`;
        }

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: target}),
            content: chatContent,
            whisper: ChatMessage.getWhisperRecipients("GM") // Whisper to GM
        });
    }
}

// Make it available globally for now, or import where needed
//game.msh.CombatHandler = CombatHandler;