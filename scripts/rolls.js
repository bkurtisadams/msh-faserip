// File: systems/msh-faserip/rolls.js

// This file contains roll functions that can be called directly from macros
// without requiring the character sheet to be open

export class FaseripRolls {
  
    /**
     * Roll a power
     * @param {Actor} actor - The actor who owns the power
     * @param {Item} power - The power item to roll
     * @param {Object} options - Optional configuration for the roll
     */
    static async rollPower(actor, power, options = {}) {
      if (!actor || !power) {
        ui.notifications.error("Actor or power not found");
        return;
      }
      
      // Get saved power settings or use defaults
      const savedActionType = power.getFlag("msh-faserip", "lastActionType") || "";
      const savedColumnShift = power.getFlag("msh-faserip", "lastColumnShift") || 0;
      const skipDiceRoll = power.getFlag("msh-faserip", "skipDiceRoll") || false;
      
      // Use provided options or fall back to saved settings
      const actionType = options.actionType || savedActionType;
      const columnShift = options.columnShift ?? savedColumnShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;
      
      // Get the power's rank and value
      const powerRank = power.system.rank || "Typical";
      const powerValue = power.system.value || 6;
      
      // Apply column shifts to get effective rank
      let effectiveRank = powerRank;
      if (columnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
          "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
        ];
        const index = ranks.indexOf(powerRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${columnShift} column shifts to ${powerRank}, now ${effectiveRank}`);
        }
      }
      
      // Create the roll
      const roll = new Roll("1d100");
      
      // Evaluate the roll
      await roll.evaluate();
      
      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} uses ${power.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }
      
      // Calculate the result
      const totalRoll = roll.total + karma;
      const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
      
      // Define action types and results based on color
      const ACTIONS = {
        "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
        "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Throwing Edged (TE)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Throwing Blunt (TB)": { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
        "Energy (En)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Force (Fo)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
        "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
        "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
        "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
        "Mental Attack": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" },
        "General Power Use": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
      };
      
      // Get the result text based on action type and color
      let resultText = "";
      if (ACTIONS[actionType]) {
        resultText = ACTIONS[actionType][resultColor.toLowerCase()];
      } else {
        resultText = resultColor.toUpperCase();
      }
      
      // Create chat message styled to match screenshot
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${power.name} (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Base Rank: ${powerRank} (${powerValue})</div>
            <div>Column Shift: ${columnShift} → ${effectiveRank}</div>
            <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
              resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
                  '#F44336'}; 
            color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
        </div>
      `;
      
      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });
      
      return { roll, resultColor, resultText };
    }
    
    /**
     * Roll a talent
     * @param {Actor} actor - The actor who owns the talent
     * @param {Item} talent - The talent item to roll
     * @param {Object} options - Optional configuration for the roll
     */
    static async rollTalent(actor, talent, options = {}) {
      if (!actor || !talent) {
        ui.notifications.error("Actor or talent not found");
        return;
      }
      
      // Get talent bonus as column shift value
      let talentBonus = 0;
      switch (talent.system.bonus) {
        case "+1CS": talentBonus = 1; break;
        case "+2CS": talentBonus = 2; break;
        case "+3CS": talentBonus = 3; break;
        case "Special": talentBonus = 1; break; // Default for special
        default: talentBonus = 0;
      }
      
      // Get saved talent settings
      const savedActionType = talent.getFlag("msh-faserip", "lastActionType") || "";
      const savedExtraShift = talent.getFlag("msh-faserip", "lastExtraShift") || 0;
      const skipDiceRoll = talent.getFlag("msh-faserip", "skipDiceRoll") || false;
      
      // Use provided options or fall back to saved settings
      const actionType = options.actionType || savedActionType;
      const extraShift = options.extraShift ?? savedExtraShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;
      
      // Total column shift is talent bonus plus any extra shifts
      const totalColumnShift = talentBonus + extraShift;
      
      // Get ability information
      let abilityModified = talent.system.abilityModified;
      let abilityRank = abilityModified ? actor.system.abilities[abilityModified].rank : "Typical";
      let abilityValue = abilityModified ? actor.system.abilities[abilityModified].value : 6;
      
      // Apply column shifts to get effective rank
      let effectiveRank = abilityRank;
      if (totalColumnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
          "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
        ];
        const index = ranks.indexOf(abilityRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${totalColumnShift} column shifts to ${abilityRank}, now ${effectiveRank}`);
        }
      }
      
      // Create the roll
      const roll = new Roll("1d100");
      
      // Evaluate the roll
      await roll.evaluate();
      
      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} uses ${talent.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }
      
      // Calculate the result
      const totalRoll = roll.total + karma;
      const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
      
      // Format ability name for display
      const abilityName = abilityModified ?
        abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) :
        "None";
      
      // Define action types and results based on color
      const ACTIONS = {
        // Combat results
        "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
        "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
        "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
        "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
        
        // Non-combat results
        "Knowledge Check": { white: "No Knowledge", green: "Basic Knowledge", yellow: "Good Knowledge", red: "Expert Knowledge" },
        "Practical Application": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" },
        "Analysis": { white: "Failed Analysis", green: "Basic Analysis", yellow: "Detailed Analysis", red: "Complete Analysis" },
        "Research": { white: "No Results", green: "Basic Results", yellow: "Good Results", red: "Breakthrough" },
        "Technical Application": { white: "Failure", green: "Works Minimally", yellow: "Works Well", red: "Works Perfectly" },
        "Mental Power": { white: "No Effect", green: "Minor Effect", yellow: "Moderate Effect", red: "Major Effect" },
        "Mystical Knowledge": { white: "No Insight", green: "Minor Insight", yellow: "Significant Insight", red: "Complete Insight" },
        "Skill Use": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" }
      };
      
      // Get the result text - if action type doesn't have specific results, use color names
      let resultText = "";
      if (ACTIONS[actionType]) {
        resultText = ACTIONS[actionType][resultColor.toLowerCase()];
      } else {
        resultText = resultColor.toUpperCase();
      }
      
      // Create chat message styled to match screenshot
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${abilityName} Roll (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Base Rank: ${abilityRank} (${abilityValue})</div>
            <div>Column Shift: ${totalColumnShift} → ${effectiveRank}</div>
            <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
              resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
                  '#F44336'}; 
            color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
        </div>
      `;
      
      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });
      
      return { roll, resultColor, resultText };
    }
    
    /**
     * Roll a contact
     * @param {Actor} actor - The actor who owns the contact
     * @param {Item} contact - The contact item to roll
     * @param {Object} options - Optional configuration for the roll
     */
    static async rollContact(actor, contact, options = {}) {
      if (!actor || !contact) {
        ui.notifications.error("Actor or contact not found");
        return;
      }
      
      // Get saved contact settings
      const savedActionType = contact.getFlag("msh-faserip", "lastActionType") || "Availability";
      const savedColumnShift = contact.getFlag("msh-faserip", "lastColumnShift") || 0;
      const skipDiceRoll = contact.getFlag("msh-faserip", "skipDiceRoll") || false;
      
      // Use provided options or fall back to saved settings
      const actionType = options.actionType || savedActionType;
      const columnShift = options.columnShift ?? savedColumnShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;
      
      // Get the hero's popularity
      const heroPopularity = actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = actor.system.powerOrigin === "mutant" || actor.system.isMutant;
      
      // Get contact type
      const contactType = contact.system.type || "General";
      
      // Determine effective disposition (normally Friendly, but affected by negative popularity)
      let effectiveDisposition = "Friendly";
      if (heroPopularity < 0) {
        effectiveDisposition = "Neutral";
      }
      
      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly": requiredFeatColor = "Green"; break;
        case "Neutral": requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile": requiredFeatColor = "Impossible"; break;
      }
      
      // Apply column shifts to get effective rank
      let effectiveRank = heroPopularityRank;
      if (columnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
        ];
        const index = ranks.indexOf(effectiveRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${columnShift} column shifts to ${heroPopularityRank}, now ${effectiveRank}`);
        }
      }
      
      // Apply mutant penalty if applicable
      if (isMutant) {
        // Apply a -1CS to reflect mutant penalty
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
        ];
        const index = ranks.indexOf(effectiveRank);
        if (index > 0) { // Don't go below Shift-0
          effectiveRank = ranks[index - 1];
          console.log(`Applied -1CS mutant penalty, now ${effectiveRank}`);
        }
      }
      
      // Create the roll
      const roll = new Roll("1d100");
      
      // Evaluate the roll
      await roll.evaluate();
      
      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} contacts ${contact.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }
      
      // Calculate the result
      const totalRoll = roll.total + karma;
      const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
      
      // Check if the result meets the required FEAT color
      let meetsFeatRequirement = false;
      switch (requiredFeatColor) {
        case "Green":
          meetsFeatRequirement = (resultColor.toLowerCase() === "green" || resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
          break;
        case "Yellow":
          meetsFeatRequirement = (resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
          break;
        case "Red":
          meetsFeatRequirement = (resultColor.toLowerCase() === "red");
          break;
        case "Impossible":
          meetsFeatRequirement = false; // Always fails
          break;
      }
      
      // Determine resource level based on contact type (simplified for brevity)
      let resourceLevel = "Typical";
      
      // Define all possible results by color 
      const ALL_RESULTS = {
        "Availability": {
          white: "Unavailable",
          green: "Available (Limited)",
          yellow: "Available",
          red: "Eager to Help"
        },
        "Information": {
          white: "No Information",
          green: "Basic Information",
          yellow: "Good Information",
          red: "Detailed Information"
        },
        "Equipment": {
          white: "No Equipment",
          green: "Basic Equipment",
          yellow: `Good Equipment (up to ${resourceLevel} rank)`,
          red: `Excellent Equipment (up to ${resourceLevel} rank)`
        },
        "Assistance": {
          white: "No Assistance",
          green: "Limited Assistance",
          yellow: "Direct Assistance",
          red: "Above and Beyond"
        },
        "Favor": {
          white: "Refuses",
          green: "Small Favor Only",
          yellow: "Willing to Help",
          red: "Goes Above and Beyond"
        }
      };
      
      // Determine the result text
      let resultText;
      if (meetsFeatRequirement) {
        // If requirement met, use the result corresponding to the color rolled
        resultText = ALL_RESULTS[actionType][resultColor.toLowerCase()];
      } else {
        // If requirement not met, show the "failure" result regardless of color
        if (actionType === "Availability") resultText = "Unavailable";
        else if (actionType === "Information") resultText = "No Information";
        else if (actionType === "Equipment") resultText = "No Equipment";
        else if (actionType === "Assistance") resultText = "No Assistance";
        else if (actionType === "Favor") resultText = "Refuses";
      }
      
      // Create chat message styled to match others
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${contactType} Contact: ${contact.name} (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Popularity: ${heroPopularityRank} (${heroPopularity})</div>
            <div>Disposition: ${effectiveDisposition} (Required: ${requiredFeatColor})</div>
            ${isMutant ? '<div style="color: #aa0000;">Mutant Penalty Applied (-1CS)</div>' : ''}
            <div>Effective Rank: ${heroPopularityRank} ${columnShift !== 0 ? `→ ${effectiveRank} (${columnShift > 0 ? '+' : ''}${columnShift}CS)` : ''}</div>
            <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
              resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
                  '#F44336'}; 
            color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
          ${!meetsFeatRequirement ?
            `<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Failed to meet required ${requiredFeatColor} result for ${effectiveDisposition} contact</div>` : ''}
          ${heroPopularity < 0 ?
            '<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Negative popularity affects contact relations</div>' : ''}
        </div>
      `;
      
      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });
      
      // If hero has negative popularity, using contacts costs Karma
      if (heroPopularity < 0) {
        ui.notifications.warn("Negative popularity: Using contacts costs Karma!");
        // You could implement Karma reduction here if desired
      }
      
      return { roll, resultColor, resultText, meetsFeatRequirement };
    }
    
    /**
 * Roll equipment
 * @param {Actor} actor - The actor who owns the equipment
 * @param {Item} equipment - The equipment item to roll
 * @param {Object} options - Optional configuration for the roll
 */
    static async rollEquipment(actor, equipment, options = {}) {
      if (!actor || !equipment) {
        ui.notifications.error("Actor or equipment not found");
        return;
      }
      
      // Get equipment information
      const category = equipment.system.category || "gear";
      
      // Handle different equipment categories
      if (category === "weapon") {
        // Roll for weapon attack
        const rank = equipment.system.materialStrength || "Typical";
        const damage = equipment.system.damage || "-";
        const damageType = equipment.system.damageType || "Blunt";
        const range = equipment.system.range || "None";
        
        // Determine default action type based on damage type
        let defaultAction = "Blunt Attack (BA)";
        if (damageType === "Edged" || damageType === "Slashing") {
          defaultAction = "Edged Attack (EA)";
        } else if (range !== "None" && range !== "") {
          defaultAction = "Shooting Attack (Sh)";
        }
        
        // Define action types from the Universal Table
        const ACTIONS = {
          "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }},
          "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }},
          "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }},
          "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }},
          "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" }}
        };
        
        // If this is a macro or direct call with options provided
        if (options.useDirectRoll) {
          const actionName = options.actionType || defaultAction;
          const action = ACTIONS[actionName];
          const shift = parseInt(options.columnShift) || 0;
          const karma = parseInt(options.karma) || 0;
          
          // Get the ability to use (fighting or agility)
          const abilityKey = action.ability || "fighting";
          const abilityRank = actor.system.abilities[abilityKey].rank || "Typical";
          const abilityValue = actor.system.abilities[abilityKey].value || 10;
          
          // Apply column shifts if needed
          let effectiveRank = abilityRank;
          if (shift !== 0) {
            const ranks = [
              "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
              "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
            ];
            const index = ranks.indexOf(abilityRank);
            if (index !== -1) {
              const newIndex = Math.min(Math.max(index + shift, 0), ranks.length - 1);
              effectiveRank = ranks[newIndex];
            }
          }
          
          // Create the roll and evaluate it
          const roll = new Roll("1d100");
          await roll.evaluate({async: true});
          
          // Display dice on screen if not skipped
          if (!options.skipDice) {
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `${actor.name} uses ${equipment.name}`,
              rollMode: game.settings.get("core", "rollMode")
            });
          }
          
          // Calculate the result
          const totalRoll = roll.total + karma;
          const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
          const effect = action.results[resultColor.toLowerCase()];
          
          // Record ammo use if applicable
          if (equipment.system.shots && equipment.system.shotsRemaining !== undefined) {
            const currentShots = parseInt(equipment.system.shotsRemaining) || 0;
            if (currentShots > 0) {
              // Reduce ammo by 1
              await equipment.update({"system.shotsRemaining": currentShots - 1});
            } else {
              // Weapon is out of ammo - no auto reload
              ui.notifications.warn(`${equipment.name} is out of ammunition! Reload required.`);
            }
          }
          
          // Create chat message with matched styling
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                  <strong>${actor.name} - ${equipment.name} (${actionName})</strong>
                </div>
                <div style="padding: 5px 10px; font-size: 0.9em;">
                  <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                  <div>Column Shift: ${shift !== 0 ? `${shift} → ${effectiveRank}` : "None"}</div>
                  <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
                </div>
                <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                  background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                    resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                      resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
                        '#F44336'}; 
                  color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                  ${effect} (${resultColor.toUpperCase()})
                </div>
              </div>
            `
          });
          
          return { roll, resultColor, effect };
        }
        
        // Otherwise show dialog for interactive roll
        // Create dialog for roll options
        let dialogContent = `
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Action Type:</label>
          <select id="action" name="action" style="width: 180px;">
            ${Object.keys(ACTIONS).map(action => 
              `<option value="${action}" ${action === defaultAction ? 'selected' : ''}>${action}</option>`
            ).join('')}
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Karma Points:</label>
          <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
        </div>
        <div>
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice"> 
            Skip dice animation
          </label>
        </div>`;
    
        return new Dialog({
          title: `Equipment Roll: ${equipment.name}`,
          content: dialogContent,
          buttons: {
            roll: {
              label: "Roll",
              callback: (html) => {
                const actionName = html.find('[name="action"]').val();
                const shift = parseInt(html.find('[name="shift"]').val()) || 0;
                const karma = parseInt(html.find('[name="karma"]').val()) || 0;
                const skipDice = html.find('[name="skipDice"]').is(':checked');
                
                // Call this method again but with the gathered options
                return FaseripRolls.rollEquipment(actor, equipment, {
                  useDirectRoll: true,
                  actionType: actionName,
                  columnShift: shift,
                  karma: karma,
                  skipDice: skipDice
                });
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "roll"
        }).render(true);
      } 
      else if (category === "power-item") {
    // For power items, roll using the power mechanism
    const powerRank = equipment.system.powerRank || "Typical";
    const powerType = equipment.system.powerType || "";
    
    // Use the power roll function
    return game.msh.rollPower(actor, {
      name: equipment.name,
      type: "power",
      system: {
        rank: powerRank,
        value: FaseripRolls._getRankValue(powerRank),
        type: powerType,
        range: equipment.system.powerRange || ""
      },
      getFlag: () => null // Simple stub for the getFlag method
    });
  }
  else {
    // For other equipment types, show info message
    ui.notifications.info(`${actor.name} uses ${equipment.name} (${equipment.system.materialStrength || "Typical"})`);
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="faserip-equipment-use">
          <h3>${actor.name} uses ${equipment.name}</h3>
          <div class="equipment-info">
            <div><strong>Type:</strong> ${category}</div>
            <div><strong>Material:</strong> ${equipment.system.materialStrength || "Typical"}</div>
            ${equipment.system.description ? `<div class="description">${equipment.system.description}</div>` : ''}
          </div>
        </div>
        <style>
          .faserip-equipment-use {
            font-family: Arial, sans-serif;
            background: #f9f8f4;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 8px;
          }
          .faserip-equipment-use h3 {
            margin: 0 0 8px 0;
            border-bottom: 1px solid #ccc;
            padding-bottom: 4px;
            font-size: 1.1em;
          }
          .equipment-info {
            margin-bottom: 8px;
            font-size: 0.95em;
          }
          .equipment-info div {
            margin-bottom: 3px;
          }
          .description {
            margin-top: 6px;
            font-style: italic;
            border-top: 1px dotted #ccc;
            padding-top: 6px;
          }
        </style>
      `
    });
    
    return true;
  }
}

// Helper method to convert rank names to values
static _getRankValue(rankName) {
  const rankValues = {
    "Shift-0": 0,
    "Feeble": 2,
    "Poor": 4,
    "Typical": 6,
    "Good": 10,
    "Excellent": 20,
    "Remarkable": 30,
    "Incredible": 40,
    "Amazing": 50,
    "Monstrous": 75,
    "Unearthly": 100
  };
  
  return rankValues[rankName] || 6; // Default to Typical if not found
}
  }