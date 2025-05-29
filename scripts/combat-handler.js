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

    // Make sure we have actor references
    const attackerActor = attacker.actor || attacker;
    const targetActor = target.actor || target;
    
    console.log(`Process Attack: Using attacker: ${attackerActor.name}`);
    console.log(`Process Attack: Using target: ${targetActor.name}`);

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
    // First determine if we're dealing with a token or actor
    const isToken = target.document?.documentName === "Token" || target.documentName === "Token";
    const targetTokenData = isToken ? (target.document || target) : null;
    const isUnlinkedToken = isToken && targetTokenData && !targetTokenData.actorLink;

    console.log(`Target is token: ${isToken}`);
    console.log(`Target is unlinked token: ${isUnlinkedToken}`);
    console.log(`Target name: ${targetActor.name}`);

    // Get current health and calculate new health
    const currentHealth = targetActor.system.attributes.health.value;
    const newHealth = Math.max(0, currentHealth - netDamage);

    console.log("Before health update:", currentHealth);
    console.log("New health to set:", newHealth);

    // Apply health update to the actor
    console.log(isUnlinkedToken ? "Updating unlinked token actor data" : "Updating actor or linked token");
    await targetActor.update({"system.attributes.health.value": newHealth});
    console.log("After health update:", targetActor.system.attributes.health.value);

    // 4. Create a summary chat message
    let defenseSummary = `Defenses Applied by ${target.name}:`;
    if (defenseData.usedBodyArmor) defenseSummary += ` Body Armor (${defenseData.bodyArmorValue}),`;
    if (defenseData.usedForceField) defenseSummary += ` Force Field (${defenseData.forceFieldValue}),`;
    if (defenseData.usedResistance) defenseSummary += ` Resistance (${defenseData.resistanceValue} vs ${damageType}),`;
    if (!defenseData.usedBodyArmor && !defenseData.usedForceField && !defenseData.usedResistance) defenseSummary += " None.";
    else defenseSummary = defenseSummary.slice(0, -1) + "."; // Remove last comma

    let chatContent = `
    <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
    <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
        <strong>Damage Resolution: ${sourceName} vs ${target.name}</strong>
    </div>
    <div style="padding: 5px 10px; font-size: 0.9em;">
        <div><strong>Base Damage:</strong> ${baseDamage} (${damageType})</div>
        <div>${defenseSummary}</div>
        <div><strong>Damage Absorbed:</strong> ${damageAbsorbed}</div>
        <div><strong>Net Damage Taken:</strong> ${netDamage}</div>
    </div>
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
            Hooks.once("renderChatMessage", (app, html, data) => {
                if (app.id === message.id) {
                    // Use jQuery for more reliable event handling
                    html.find('.apply-wrestling-damage').on('click', async function() {
                    const clickAttackerId = this.dataset.attacker;
                    const clickTargetId = this.dataset.target;
                    
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
        await target.deleteEmbeddedDocuments("ActiveEffect", existingEffects.map(e => e.id));
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
    const newEffect = await target.createEmbeddedDocuments("ActiveEffect", [effect]);

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
    static async rollSecondaryFeat(target, featType, sourceName, attackType = "unknown") {
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
                                await target.update({
                                    "system.attributes.karma.value": availableKarma - karmaSpent
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
                                await target.update({ "system.karma.history": history });
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
                                    await target.update({"system.abilities.endurance.rank": newEnduranceRank});
                                    
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
                                        await target.update({"system.abilities.endurance.rank": newEnduranceRank});
                                        
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
                                if (featResultText === "Gr. Slam") {
                                    // Grand Slam distance is based on attacker's Strength rank (per FASERIP rules)
                                    // This function needs access to the attacker - we should pass it in the function parameters
                                    // For now, use a lookup table based on common strength ranks
                                    
                                    // Note: This would be better if we passed the attacker as a parameter
                                    // The exact distance depends on the attacker's Strength rank:
                                    const strengthToDistance = {
                                        "Feeble": 1, "Poor": 2, "Typical": 3, "Good": 4, "Excellent": 5,
                                        "Remarkable": 6, "Incredible": 7, "Amazing": 8, "Monstrous": 9,
                                        "Unearthly": 10, "Shift X": 12, "Shift Y": 14, "Shift Z": 16,
                                        "Class 1000": 32, "Class 3000": 50, "Class 5000": 100
                                    };
                                    
                                    // Default to moderate distance if we can't determine attacker strength
                                    const slamDistance = 6; // Remarkable strength default
                                    
                                    ui.notifications.warn(`${target.name} suffers a Grand Slam - knocked away ${slamDistance} areas!`);
                                    
                                    // Apply Grand Slam effect
                                    await target.createEmbeddedDocuments("ActiveEffect", [{
                                        name: "Grand Slam",
                                        icon: "icons/svg/explosion.svg",
                                        flags: {
                                            "msh-faserip": {
                                                grandSlam: true,
                                                distance: slamDistance
                                            }
                                        },
                                        changes: [
                                            {
                                                key: "system.status.prone",
                                                mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                                                value: true
                                            }
                                        ],
                                        duration: {
                                            rounds: 2,
                                            startTime: game.time.worldTime,
                                            startRound: game.combat?.round || 0
                                        },
                                        statuses: ["prone"]
                                    }]);
                                    
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #8B0000; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                                💥 GRAND SLAM! 💥
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> is launched away with tremendous force!</div>
                                                <div style="margin: 5px 0;"><strong>Mechanical Effects:</strong></div>
                                                <div>• Knocked away distance = attacker's Strength rank</div>
                                                <div>• Estimated distance: ${slamDistance} areas</div>
                                                <div>• Speed equals attacker's Strength as ground speed</div>
                                                <div>• Takes charging damage if hits obstacles</div>
                                                <div>• Buildings reduce knockback per movement rules</div>
                                                <div>• Direction: attacker chooses (if damage dealt)</div>
                                                <div style="margin-top: 8px; font-style: italic; font-size: 0.8em;">
                                                    Note: Exact distance depends on attacker's Strength rank
                                                </div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Slam Effect" })
                                    });
                                    effectApplied = true;
                                    
                                } else if (featResultText === "1 area") {
                                    ui.notifications.info(`${target.name} is slammed back 1 area!`);
                                    
                                    // Apply 1 Area Slam effect
                                    await target.createEmbeddedDocuments("ActiveEffect", [{
                                        name: "Slammed (1 Area)",
                                        icon: "icons/svg/falling.svg", 
                                        flags: {
                                            "msh-faserip": {
                                                slammed: true,
                                                distance: 1
                                            }
                                        },
                                        changes: [
                                            {
                                                key: "system.status.prone", 
                                                mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                                                value: true
                                            }
                                        ],
                                        duration: {
                                            rounds: 1,
                                            startTime: game.time.worldTime,
                                            startRound: game.combat?.round || 0
                                        },
                                        statuses: ["prone"]
                                    }]);
                                    
                                    await ChatMessage.create({
                                        content: `
                                        <div style="background-color: #DC3545; color: white; padding: 10px; border-radius: 5px; margin: 5px 0;">
                                            <div style="font-size: 1.2em; font-weight: bold; text-align: center; margin-bottom: 8px;">
                                                💢 SLAMMED - 1 AREA 💢
                                            </div>
                                            <div style="padding: 5px; font-size: 0.9em;">
                                                <div><strong>${target.name}</strong> is knocked back 1 area!</div>
                                                <div style="margin: 5px 0;"><strong>Mechanical Effects:</strong></div>
                                                <div>• Knocked 1 area away from attacker</div>
                                                <div>• May hit obstacles during knockback</div>
                                                <div>• Takes damage if slammed into walls/objects</div>
                                                <div>• Attacker chooses direction (if damage dealt)</div>
                                                <div>• Target chooses direction (if no damage dealt)</div>
                                            </div>
                                        </div>
                                        `,
                                        speaker: ChatMessage.getSpeaker({ alias: "Slam Effect" })
                                    });
                                    effectApplied = true;
                                    
                                } else if (featResultText === "Stagger") {
                                    ui.notifications.info(`${target.name} staggers but remains in place!`);
                                    
                                    // Apply Stagger effect
                                    await target.createEmbeddedDocuments("ActiveEffect", [{
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
                                    }]);
                                    
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
    static async applyStunnedEffect(target, duration) {
        // Remove any existing stun effects
        const existingStunEffects = target.effects.filter(e => e.flags["msh-faserip"]?.stunned);
        if (existingStunEffects.length > 0) {
            await target.deleteEmbeddedDocuments("ActiveEffect", existingStunEffects.map(e => e.id));
        }

        // Create new stun effect
        const stunEffect = {
            name: "Stunned",
            icon: "icons/svg/daze.svg",
            flags: {
                "msh-faserip": {
                    stunned: true,
                    duration: duration
                }
            },
            changes: [
                {
                    key: "system.status.stunned",
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
                rounds: duration,
                startTime: game.time.worldTime,
                startRound: game.combat?.round || 0,
                startTurn: game.combat?.turn || 0
            },
            statuses: ["stunned"]
        };

        await target.createEmbeddedDocuments("ActiveEffect", [stunEffect]);
        
        // Enhanced chat message with clear mechanical effects
        await ChatMessage.create({
            content: `
            <div style="background-color: #FFA500; color: white; padding: 10px; border-radius: 5px;">
                <div style="font-size: 1.2em; font-weight: bold; text-align: center;">
                    STUNNED
                </div>
                <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div><strong>${target.name}</strong> is stunned for ${duration} round${duration > 1 ? 's' : ''}!</div>
                    <div style="margin-top: 5px;"><strong>Mechanical Effect:</strong></div>
                    <div>• Cannot take any actions during stunned rounds</div>
                    <div>• Movement reduced to 0</div>
                    <div>• Still conscious but completely incapacitated</div>
                    ${duration === 1 ? '<div>• May "play possum" since still conscious</div>' : ''}
                </div>
            </div>
            `,
            speaker: ChatMessage.getSpeaker({ alias: "Combat Status" })
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
        await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
        
        let chatContent = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>${target.name} is Unconscious for ${unconsciousDuration} rounds.</div>
        </div>
        </div>
        `;
                
        // Only lethal damage types can trigger the death process
        if (isLethalDamage) {
            // Roll Endurance FEAT vs. Kill (as per rules, pg 31 "Life, Death, and Health")
            const killCheckResult = await this.rollSecondaryFeat(target, "Kill", "Reaching 0 Health");
            chatContent += `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div><strong>Death Check:</strong> ${killCheckResult}</div>
        </div>
        </div>
        `;
            
            // If Endurance Loss from Kill check, character starts dying
            if (killCheckResult.includes("End. Loss")) {
                ui.notifications.error(`${target.name} is dying!`);
                
                // Apply dying effect using our dedicated method
                await this.applyDyingEffect(target);
                
                chatContent += `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>${target.name} is losing Endurance ranks each turn. Help needed!</div>
        </div>
        </div>
        `;
                
                // Let's add code to handle endurance loss per round
                // Register a hook for combat round advancement
                Hooks.once("updateCombat", async (combat, changes) => {
                    // Only handle round changes
                    if (changes.round && changes.round > combat.previous.round) {
                        // Check if actor is still dying
                        const isDying = target.effects.some(e => e.flags["msh-faserip"]?.dying);
                        if (isDying) {
                            // Get current endurance rank
                            const currentRank = target.system.abilities.endurance.rank;
                            const ranks = Object.keys(CONFIG.FASERIP.rankValues);
                            
                            // Find index of current rank
                            const currentRankIndex = ranks.indexOf(currentRank);
                            
                            // If not the lowest rank already, decrease by one rank
                            if (currentRankIndex > 0) {
                                const newRank = ranks[currentRankIndex - 1];
                                await target.update({"system.abilities.endurance.rank": newRank});
                                
                                // Send a message to chat
                                ChatMessage.create({
                                    content: `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div><strong>${target.name}</strong> is dying! Endurance decreased to ${newRank}.</div>
        </div>
        </div>
                                    `,
                                    speaker: ChatMessage.getSpeaker({actor: target})
                                });
                            } else {
                                // Character is dead
                                ChatMessage.create({
                                    content: `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div><strong>${target.name}</strong> has died.</div>
        </div>
        </div>
                                    `,
                                    speaker: ChatMessage.getSpeaker({actor: target})
                                });
                                
                                // Remove dying effect and add dead effect
                                const dyingEffects = target.effects.filter(e => e.flags["msh-faserip"]?.dying);
                                await target.deleteEmbeddedDocuments("ActiveEffect", dyingEffects.map(e => e.id));
                                
                                // Add dead effect
                                await target.createEmbeddedDocuments("ActiveEffect", [{
                                    name: "Dead",
                                    icon: "icons/svg/skull.svg",
                                    flags: {
                                        "msh-faserip": {
                                            dead: true
                                        }
                                    },
                                    changes: [
                                        {
                                            key: "system.status.dead",
                                            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                                            value: true
                                        }
                                    ],
                                    statuses: ["dead"]
                                }]);
                            }
                        }
                    }
                });
            }
        } else {
            // Non-lethal (Blunt/Force) damage just causes unconsciousness
            chatContent += `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Knocked out by blunt force/subdual damage. No risk of death.</div>
        </div>
        </div>
        `;
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