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
                        
                        // Log what we found
                        console.log(`Wrestling damage: Found target token: ${targetToken?.name || "None"}`);
                        console.log(`Wrestling damage: Found attacker token: ${attackerToken?.name || "None"}`);
                        
                        // Determine the best actor references to use
                        // Prioritize token actors if available
                        const attackerActor = attackerToken?.actor || attackerBaseActor;
                        const targetActor = targetToken?.actor || targetBaseActor;
                        
                        if (attackerActor && targetActor) {
                            // Get attacker's strength value for damage
                            const strengthValue = attackerActor.system.abilities.strength.value || 0;
                            
                            try {
                                console.log(`Wrestling damage: Using attacker: ${attackerActor.name}`);
                                console.log(`Wrestling damage: Using target: ${targetActor.name}`);
                                console.log(`Wrestling damage: Target initial health: ${targetActor.system.attributes.health.value}`);
                                console.log(`Wrestling damage: Applying ${strengthValue} damage`);
                                
                                // For unlinked tokens, we need to ensure we're updating the token actor
                                // and not the base actor
                                const isUnlinkedToken = targetToken && !targetToken.document.actorLink;
                                console.log(`Wrestling damage: Target is unlinked token: ${isUnlinkedToken}`);
                                
                                // Track the health before update
                                const healthBefore = targetActor.system.attributes.health.value;
                                
                                // Process the damage
                                await CombatHandler.processAttack({
                                    attacker: attackerActor,
                                    target: target,
                                    baseDamage: strengthValue,
                                    damageType: "Physical-Blunt",
                                    sourceName: "Wrestling Hold",
                                    canBeStun: false,
                                    canBeSlam: false,
                                    canBeKill: false,
                                    originalRollResult: "green" // Always a hit
                                });
                                
                                // Check if health was updated correctly
                                console.log(`Wrestling damage: Target health after update: ${targetActor.system.attributes.health.value}`);
                                
                                // Force a token refresh in case the health bar update didn't trigger automatically
                                if (targetToken) {
                                    targetToken.refresh();
                                    console.log("Wrestling damage: Refreshed target token");
                                }
                                
                                // Calculate actual damage done
                                const damageDealt = Math.max(0, healthBefore - targetActor.system.attributes.health.value);
                                
                                // Temporarily change button text to show damage was applied
                                const originalButtonText = $button.text();
                                $button.text(`Applied ${damageDealt} Damage!`).addClass("damage-just-applied");
                                
                                // After a brief delay, revert the button text to allow reuse
                                setTimeout(() => {
                                    $button.text(originalButtonText).removeClass("damage-just-applied");
                                }, 2000); // Revert after 2 seconds
                                
                                // Add a notification in chat about the damage being applied
                                ChatMessage.create({
                                    content: `<div class="wrestling-damage-notice">${attackerActor.name} applies ${damageDealt} points of Strength damage to ${targetActor.name} while maintaining the hold!</div>`,
                                    speaker: ChatMessage.getSpeaker({actor: attackerActor})
                                });
                                
                            } catch (error) {
                                console.error("Error applying wrestling damage:", error);
                                ui.notifications.error("Failed to apply wrestling damage");
                                console.error(error); // Log the full error
                            }
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
                            
                            // Apply the effects based on result using our updated ActiveEffect methods
                            let effectApplied = false;
                            
                            if (featType === "Kill" && featResultText === "End. Loss") {
                                const currentEndurance = CONFIG.FASERIP.rankValues[target.system.abilities.endurance.rank] || 0;
                                const newEnduranceRank = Object.keys(CONFIG.FASERIP.rankValues).find(key => 
                                    (CONFIG.FASERIP.rankValues[key] || 0) < currentEndurance) || "Shift-0";
                                
                                ui.notifications.info(`${target.name} loses an Endurance rank! (Now ${newEnduranceRank})`);
                                await target.update({"system.abilities.endurance.rank": newEnduranceRank});
                                effectApplied = true;
                            }
                            else if (featType === "Stun" && featResultText === "1–10") {
                                // Roll stun duration
                                const stunDuration = await new Roll("1d10").evaluate();
                                ui.notifications.info(`${target.name} is Stunned for ${stunDuration.total} rounds!`);
                                
                                // Use our improved stun effect method
                                await this.applyStunnedEffect(target, stunDuration.total);
                                effectApplied = true;
                            }
                            else if (featType === "Slam" && featResultText === "1 area") {
                                ui.notifications.info(`${target.name} is slammed back 1 area!`);
                                
                                // Apply a "Slammed" effect with proper ActiveEffect structure
                                await target.createEmbeddedDocuments("ActiveEffect", [{
                                    name: "Slammed",
                                    icon: "icons/svg/falling.svg", 
                                    flags: {
                                        "msh-faserip": {
                                            slammed: true,
                                            distance: 1 // areas
                                        }
                                    },
                                    changes: [
                                        {
                                            key: "system.status.prone", 
                                            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                                            value: true
                                        },
                                        {
                                            key: "system.effectiveCSMod",
                                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                                            value: -1
                                        }
                                    ],
                                    duration: {
                                        rounds: 1,
                                        startTime: game.time.worldTime,
                                        startRound: game.combat?.round || 0
                                    },
                                    statuses: ["prone"]
                                }]);
                                effectApplied = true;
                            }
                            else if (featType === "Slam" && featResultText === "Stagger") {
                                ui.notifications.info(`${target.name} staggers but remains in place!`);
                                
                                // Apply a "Staggered" effect
                                await target.createEmbeddedDocuments("ActiveEffect", [{
                                    name: "Staggered",
                                    icon: "icons/svg/stoned.svg",
                                    flags: {
                                        "msh-faserip": {
                                            staggered: true
                                        }
                                    },
                                    changes: [
                                        {
                                            key: "system.effectiveCSMod",
                                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                                            value: -1
                                        },
                                        {
                                            key: "system.attributes.movement.value",
                                            mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
                                            value: 0.5
                                        }
                                    ],
                                    duration: {
                                        rounds: 1,
                                        startTime: game.time.worldTime,
                                        startRound: game.combat?.round || 0
                                    },
                                    statuses: ["staggered"]
                                }]);
                                effectApplied = true;
                            }
                            
                            // Create chat message to show the result
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
                            ${effectApplied ? `<div style="padding: 5px 10px; font-size: 0.9em; font-style: italic;">Effect: ${
                                featType === "Kill" && featResultText === "End. Loss" ? "Endurance rank reduced" :
                                featType === "Stun" && featResultText === "1–10" ? `Stunned for ${stunDuration.total} rounds` :
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