// equipment.js - place in your system's module directory
export class FaseripEquipmentSheet extends ItemSheet {
  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "equipment"],
      template: "systems/msh-faserip/templates/equipment-sheet.html",
      width: 530,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  /** @override */
  getData() {
    const data = super.getData();

    // Make sure system exists on the data object
    if (!data.system) {
      data.system = {};
    }
    
    // Add any computed data or references needed for the template
    data.dtypes = ["String", "Number", "Boolean"];
    
    // Define equipment categories for dropdowns
    data.equipmentCategories = [
      { value: "weapon", label: "Weapon" }, 
      { value: "armor", label: "Armor" }, 
      { value: "gear", label: "Gear" }, 
      { value: "power-item", label: "Power Item" },  // For items that mimic powers
      { value: "custom", label: "Custom Equipment" }  // For fully custom equipment
    ];
    
    // Weapon types
    data.weaponTypes = [
      { value: "melee", label: "Melee Weapon" },
      { value: "shooting", label: "Shooting Weapon" },
      { value: "thrown", label: "Thrown Weapon" },
      { value: "energy", label: "Energy Weapon" },
      { value: "force", label: "Force Weapon" }
    ];
    
    // Damage types
    data.damageTypes = [
      { value: "S", label: "Shooting (S)" },
      { value: "E", label: "Energy (E)" },
      { value: "F", label: "Force (F)" },
      { value: "EA", label: "Edged Attack (EA)" },
      { value: "BA", label: "Blunt Attack (BA)" }
    ];
    
    // Ammunition types
    data.ammoTypes = [
      { value: "Standard", label: "Standard" },
      { value: "Mercy", label: "Mercy Shot" },
      { value: "AP", label: "Armor Piercing (AP)" },
      { value: "Rubber", label: "Rubber Shot" },
      { value: "Explosive", label: "Explosive Shot" },
      { value: "Canister", label: "Canister Shot" },
      { value: "Heat-Seeker", label: "Heat-Seeker" },
      { value: "Power Pack", label: "Power Pack" }
    ];
    
    // Rank options for various properties
    data.ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z"
    ];
    
    // Power types for power items
    data.powerTypes = [
      { value: "energy", label: "Energy Control" },
      { value: "force", label: "Force" },
      { value: "matter", label: "Matter Control" },
      { value: "mental", label: "Mental" },
      { value: "magical", label: "Magical" },
      { value: "self", label: "Self-Alteration" },
      { value: "sensory", label: "Sensory" },
      { value: "travel", label: "Travel" },
      { value: "custom", label: "Custom" }
    ];
    
    // Ability options for linking power items
    data.abilities = [
      { value: "fighting", label: "Fighting" },
      { value: "agility", label: "Agility" },
      { value: "strength", label: "Strength" },
      { value: "endurance", label: "Endurance" },
      { value: "reason", label: "Reason" },
      { value: "intuition", label: "Intuition" },
      { value: "psyche", label: "Psyche" }
    ];
    
    // Ensure custom abilities array exists
    if (!data.system.customAbilities) {
      data.system.customAbilities = [];
    }
    
    return data;
  }

/** @override */
activateListeners(html) {
  super.activateListeners(html);

  // Handle changes to form inputs
  html.find('input, select, textarea').change(ev => {
    this._onSubmit(ev);
  });

  // Handle category changes specially
  html.find('.equipment-category-select').change(ev => {
    // First submit the form to save the category change
    this._onSubmit(ev).then(() => {
      // After saving, get the new category and update visibility
      const category = ev.currentTarget.value;
      
      // Hide all category-specific sections first
      html.find('.weapon-fields, .armor-fields, .power-item-fields, .custom-fields').hide();
      
      // Show the appropriate section based on category
      if (category === 'weapon') {
        html.find('.weapon-fields').show();
      } else if (category === 'armor') {
        html.find('.armor-fields').show();
      } else if (category === 'power-item') {
        html.find('.power-item-fields').show();
      } else if (category === 'custom') {
        html.find('.custom-fields').show();
      }
    });
  });

  // Make sure correct fields are shown on initial load
  const currentCategory = this.object.system?.category || "gear";
  if (currentCategory === 'weapon') {
    html.find('.weapon-fields').show();
  } else if (currentCategory === 'armor') {
    html.find('.armor-fields').show();
  } else if (currentCategory === 'power-item') {
    html.find('.power-item-fields').show();
  } else if (currentCategory === 'custom') {
    html.find('.custom-fields').show();
  }
  
  // Add custom ability handler
  html.find('.add-custom-ability').click(ev => {
    const abilities = this.object.system.customAbilities || [];
    abilities.push({
      name: "New Ability",
      description: "",
      rank: "Typical",
      damageType: "",
      range: ""
    });
    
    this.object.update({"system.customAbilities": abilities});
  });
  
  // Remove custom ability handler
  html.find('.remove-custom-ability').click(ev => {
    const index = $(ev.currentTarget).data("index");
    const abilities = duplicate(this.object.system.customAbilities || []);
    abilities.splice(index, 1);
    this.object.update({"system.customAbilities": abilities});
  });
  
  // Roll equipment button
  html.find('.roll-equipment').click(ev => {
    this.rollEquipment();
  });
}
  
  // Method to handle equipment rolls
  async rollEquipment() {
    const item = this.object;
    const actor = item.actor;
    
    if (!actor) return ui.notifications.error("This equipment must be on a character sheet to roll!");
    
    switch(item.system.category) {
      case "weapon":
        return this._rollWeapon(item, actor);
      
      case "power-item":
        return this._rollPowerItem(item, actor);
        
      case "custom":
        return this._rollCustomAbility(item, actor);
        
      default:
        return ui.notifications.warn("This equipment type cannot be rolled!");
    }
  }
  
  // Roll a standard weapon attack
  async _rollWeapon(item, actor) {
    // Determine which ability to use based on weapon type
    let ability = "strength";
    if (item.system.weaponType === "shooting" || item.system.weaponType === "energy") {
      ability = "agility";
    } else if (item.system.weaponType === "thrown") {
      ability = "agility";
    }
    
    // Get ability rank and damage type
    const abilityRank = actor.system.abilities[ability].rank || "Typical";
    const abilityValue = actor.system.abilities[ability].value || 6;
    const damageType = item.system.damageType || "S";
    const damage = item.system.damage || "0";
    
    // Get range penalties if applicable
    let rangeNote = "";
    if (item.system.weaponType === "shooting" && item.system.range > 1) {
      rangeNote = `<div><em>Note: Shooting weapons get -1CS per area beyond the first.</em></div>`;
    }
    
    // Create dialog for roll options
    let dialogContent = `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Weapon:</label>
      <input type="text" value="${item.name}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Ability:</label>
      <input type="text" value="${ability.charAt(0).toUpperCase() + ability.slice(1)} (${abilityRank})" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Damage:</label>
      <input type="text" value="${damage}" readonly style="width: 50px;">
      <span style="margin-left: 5px;">(${damageType})</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Target Distance:</label>
      <input type="number" id="distance" name="distance" value="1" min="1" style="width: 50px;"> areas
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Extra Column Shift:</label>
      <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
      <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Karma Points:</label>
      <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
    </div>
    ${rangeNote}`;

    return new Dialog({
      title: `Weapon Attack: ${item.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const distance = parseInt(html.find('[name="distance"]').val()) || 1;
            const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
            const karma = parseInt(html.find('[name="karma"]').val()) || 0;
            
            // Calculate range penalty for shooting weapons
            let rangeShift = 0;
            if (item.system.weaponType === "shooting" && distance > 1) {
              rangeShift = -(distance - 1);
            }
            
            // Apply total column shifts to get effective rank
            const totalShift = columnShift + rangeShift;
            let effectiveRank = abilityRank;
            
            if (totalShift !== 0) {
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
              ];
              
              const index = ranks.indexOf(abilityRank);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + totalShift, 0), ranks.length - 1);
                effectiveRank = ranks[newIndex];
              }
            }
            
            // Roll dice and add karma
            const roll = await new Roll("1d100").evaluate({async: true});
            const finalRoll = Math.min(100, roll.total + karma);
            
            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, finalRoll);
            
            // Define results based on attack type
            const attackResults = {
              "S": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "E": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "F": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
              "EA": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
              "BA": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }
            };
            
            let resultText = colorResult.toUpperCase();
            if (attackResults[damageType] && attackResults[damageType][colorResult.toLowerCase()]) {
              resultText = attackResults[damageType][colorResult.toLowerCase()];
            }
            
            // Handle special ammo types
            let ammoNote = "";
            if (item.system.ammoType) {
              switch(item.system.ammoType) {
                case "Mercy":
                  ammoNote = `<div><em>Mercy Shot: Target must make Endurance FEAT vs Remarkable or be knocked out.</em></div>`;
                  break;
                case "AP":
                  ammoNote = `<div><em>Armor Piercing: Target's Body Armor reduced by 2CS.</em></div>`;
                  break;
                case "Rubber":
                  ammoNote = `<div><em>Rubber Shot: Inflicts Slugfest damage instead of Shooting damage.</em></div>`;
                  break;
                case "Explosive":
                  ammoNote = `<div><em>Explosive Shot: Inflicts double damage.</em></div>`;
                  break;
                case "Heat-Seeker":
                  ammoNote = `<div><em>Heat-Seeking: No penalty for range, tracks hottest target.</em></div>`;
                  break;
              }
            }
            
            // Create chat message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              roll: roll,
              content: `
                <div class="faserip-weapon-roll">
                  <h3>${actor.name} attacks with ${item.name}</h3>
                  <div class="roll-info">
                    <div><strong>Ability:</strong> ${ability.charAt(0).toUpperCase() + ability.slice(1)} (${abilityRank})</div>
                    <div><strong>Distance:</strong> ${distance} area${distance > 1 ? 's' : ''}</div>
                    <div><strong>Column Shift:</strong> ${totalShift !== 0 ? 
                      `${totalShift > 0 ? '+' : ''}${totalShift}CS → ${effectiveRank}` : 
                      "None"}</div>
                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karma} = ${finalRoll}</div>
                    <div><strong>Damage:</strong> ${damage} (${damageType})</div>
                    ${item.system.ammoType ? `<div><strong>Ammo Type:</strong> ${item.system.ammoType}</div>` : ''}
                    ${item.system.rate ? `<div><strong>Rate of Fire:</strong> ${item.system.rate}</div>` : ''}
                    ${item.system.shots ? `<div><strong>Shots:</strong> ${item.system.shots}</div>` : ''}
                  </div>
                  <div class="result result-${colorResult.toLowerCase()}">
                    ${resultText} (${colorResult.toUpperCase()})
                  </div>
                  ${ammoNote}
                </div>
                <style>
                  .faserip-weapon-roll {
                    font-family: Arial, sans-serif;
                    background: #f9f8f4;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 8px;
                  }
                  .faserip-weapon-roll h3 {
                    margin: 0 0 8px 0;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 4px;
                    font-size: 1.1em;
                  }
                  .roll-info {
                    margin-bottom: 8px;
                    font-size: 0.95em;
                  }
                  .roll-info div {
                    margin-bottom: 3px;
                  }
                  .result {
                    text-align: center;
                    padding: 6px;
                    border-radius: 3px;
                    font-weight: bold;
                    font-size: 1.1em;
                  }
                  .result-white {
                    background-color: #f0f0f0;
                    color: #333;
                    border: 1px solid #ccc;
                  }
                  .result-green {
                    background-color: #4CAF50;
                    color: white;
                  }
                  .result-yellow {
                    background-color: #FFC107;
                    color: #333;
                  }
                  .result-red {
                    background-color: #F44336;
                    color: white;
                  }
                </style>
              `
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }
  
  // Roll a power-based item
  async _rollPowerItem(item, actor) {
    // Get item's power information
    const ability = item.system.linkedAbility || "reason";
    const abilityRank = actor.system.abilities[ability].rank || "Typical";
    const powerRank = item.system.powerRank || "Typical";
    const powerType = item.system.powerType || "energy";
    
    // Define action types for this power
    const actionTypes = [];
    
    // Determine available actions based on power type
    switch(powerType) {
      case "energy":
        actionTypes.push(
          { value: "Energy Attack", label: "Energy Attack" },
          { value: "Energy Manipulation", label: "Energy Manipulation" }
        );
        break;
      case "force":
        actionTypes.push(
          { value: "Force Attack", label: "Force Attack" },
          { value: "Force Field", label: "Force Field" }
        );
        break;
      case "matter":
        actionTypes.push(
          { value: "Matter Manipulation", label: "Matter Manipulation" },
          { value: "Matter Transformation", label: "Matter Transformation" }
        );
        break;
      case "mental":
        actionTypes.push(
          { value: "Mental Attack", label: "Mental Attack" },
          { value: "Mind Control", label: "Mind Control" },
          { value: "Telepathy", label: "Telepathy" }
        );
        break;
      case "travel":
        actionTypes.push(
          { value: "Movement", label: "Movement" },
          { value: "Teleportation", label: "Teleportation" }
        );
        break;
      default:
        actionTypes.push(
          { value: "Power Use", label: "Power Use" },
          { value: "Special Effect", label: "Special Effect" }
        );
    }
    
    // Build action options HTML
    const actionOptionsHTML = actionTypes.map(action => 
      `<option value="${action.value}">${action.label}</option>`
    ).join('');
    
    // Create dialog for roll options
    let dialogContent = `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Action Type:</label>
      <select id="action-type" name="actionType" style="width: 180px;">
        ${actionOptionsHTML}
      </select>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Power Rank:</label>
      <input type="text" value="${powerRank}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Ability:</label>
      <input type="text" value="${ability.charAt(0).toUpperCase() + ability.slice(1)} (${abilityRank})" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Column Shift:</label>
      <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
      <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Karma Points:</label>
      <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
    </div>`;

    return new Dialog({
      title: `Power Item Roll: ${item.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const actionType = html.find('[name="actionType"]').val();
            const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
            const karma = parseInt(html.find('[name="karma"]').val()) || 0;
            
            // Apply column shifts to get effective rank
            let effectiveRank = powerRank;
            if (columnShift !== 0) {
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
              ];
              
              const index = ranks.indexOf(powerRank);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                effectiveRank = ranks[newIndex];
              }
            }
            
            // Roll dice and add karma
            const roll = await new Roll("1d100").evaluate({async: true});
            const finalRoll = Math.min(100, roll.total + karma);
            
            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, finalRoll);
            
            // Define results based on action type
            const actionResults = {
              "Energy Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "Force Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
              "Mental Attack": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" },
              "Power Use": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
            };
            
            // Get result text based on action type and color
            let resultText = colorResult.toUpperCase();
            if (actionResults[actionType] && actionResults[actionType][colorResult.toLowerCase()]) {
              resultText = actionResults[actionType][colorResult.toLowerCase()];
            } else {
              // Default results if specific action type not defined
              if (colorResult.toLowerCase() === "white") resultText = "Failure";
              else if (colorResult.toLowerCase() === "green") resultText = "Success";
              else if (colorResult.toLowerCase() === "yellow") resultText = "Special Effect";
              else if (colorResult.toLowerCase() === "red") resultText = "Maximum Effect";
            }
            
            // Create chat message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              roll: roll,
              content: `
                <div class="faserip-power-roll">
                  <h3>${actor.name} uses ${item.name} (${actionType})</h3>
                  <div class="roll-info">
                    <div><strong>Power Rank:</strong> ${powerRank}</div>
                    <div><strong>Column Shift:</strong> ${columnShift !== 0 ? 
                      `${columnShift > 0 ? '+' : ''}${columnShift}CS → ${effectiveRank}` : 
                      "None"}</div>
                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karma} = ${finalRoll}</div>
                  </div>
                  <div class="result result-${colorResult.toLowerCase()}">
                    ${resultText} (${colorResult.toUpperCase()})
                  </div>
                </div>
                <style>
                  .faserip-power-roll {
                    font-family: Arial, sans-serif;
                    background: #f9f8f4;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 8px;
                  }
                  .faserip-power-roll h3 {
                    margin: 0 0 8px 0;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 4px;
                    font-size: 1.1em;
                  }
                  .roll-info {
                    margin-bottom: 8px;
                    font-size: 0.95em;
                  }
                  .roll-info div {
                    margin-bottom: 3px;
                  }
                  .result {
                    text-align: center;
                    padding: 6px;
                    border-radius: 3px;
                    font-weight: bold;
                    font-size: 1.1em;
                  }
                  .result-white {
                    background-color: #f0f0f0;
                    color: #333;
                    border: 1px solid #ccc;
                  }
                  .result-green {
                    background-color: #4CAF50;
                    color: white;
                  }
                  .result-yellow {
                    background-color: #FFC107;
                    color: #333;
                  }
                  .result-red {
                    background-color: #F44336;
                    color: white;
                  }
                </style>
              `
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }
  
  // Roll a custom ability
  async _rollCustomAbility(item, actor) {
    // If no custom abilities, prompt to create one
    if (!item.system.customAbilities || item.system.customAbilities.length === 0) {
      return ui.notifications.warn("This item has no custom abilities defined. Edit the item to add abilities.");
    }
    
    // If multiple abilities, let the user choose which one to use
    if (item.system.customAbilities.length > 1) {
      const abilities = item.system.customAbilities;
      let options = "";
      
      abilities.forEach((ability, index) => {
        options += `<option value="${index}">${ability.name} (${ability.rank})</option>`;
      });
      
      let choiceDialog = `
      <div style="margin-bottom: 10px;">
        <label>Choose ability to use:</label>
        <select id="ability-choice" style="width: 100%;">
          ${options}
        </select>
      </div>`;
      
      new Dialog({
        title: "Choose Custom Ability",
        content: choiceDialog,
        buttons: {
          roll: {
            label: "Select",
            callback: (html) => {
              const abilityIndex = parseInt(html.find('#ability-choice').val());
              this._rollSpecificCustomAbility(item, actor, abilities[abilityIndex]);
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
      
      return;
    }
    
    // Otherwise roll the only ability
    this._rollSpecificCustomAbility(item, actor, item.system.customAbilities[0]);
  }
  
  // Helper method to roll a specific custom ability
  async _rollSpecificCustomAbility(item, actor, ability) {
    // Get ability information
    const abilityRank = ability.rank || "Typical";
    const damageType = ability.damageType || "";
    
    // Determine action options based on damage type
    let actionTypes = [{ value: "Use Ability", label: "Use Ability" }];
    
    if (damageType) {
      actionTypes = [{ value: `${damageType} Attack`, label: `${damageType} Attack` }];
    }
    
    // Build action options HTML
    const actionOptionsHTML = actionTypes.map(action => 
      `<option value="${action.value}">${action.label}</option>`
    ).join('');
    
    // Create dialog for roll options
    let dialogContent = `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Ability:</label>
      <input type="text" value="${ability.name}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Action Type:</label>
      <select id="action-type" name="actionType" style="width: 180px;">
        ${actionOptionsHTML}
      </select>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Rank:</label>
      <input type="text" value="${abilityRank}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Column Shift:</label>
      <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
      <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Karma Points:</label>
      <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
    </div>`;
    
    return new Dialog({
      title: `Custom Ability Roll: ${ability.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const actionType = html.find('[name="actionType"]').val();
            const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
            const karma = parseInt(html.find('[name="karma"]').val()) || 0;
            
            // Apply column shifts to get effective rank
            let effectiveRank = abilityRank;
            if (columnShift !== 0) {
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
              ];
              
              const index = ranks.indexOf(abilityRank);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                effectiveRank = ranks[newIndex];
              }
            }
            
            // Roll dice and add karma
            const roll = await new Roll("1d100").evaluate({async: true});
            const finalRoll = Math.min(100, roll.total + karma);
            
            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, finalRoll);
            
            // Define results based on action type
            const RESULTS = {
              "S Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "E Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "F Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
              "EA Attack": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
              "BA Attack": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
              "Use Ability": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
            };
            
            // Get the result text
            let resultText = colorResult.toUpperCase();
            if (RESULTS[actionType] && RESULTS[actionType][colorResult.toLowerCase()]) {
              resultText = RESULTS[actionType][colorResult.toLowerCase()];
            } else {
              // Generic results
              switch (colorResult.toLowerCase()) {
                case "white": resultText = "Failure"; break;
                case "green": resultText = "Success"; break;
                case "yellow": resultText = "Special Effect"; break;
                case "red": resultText = "Maximum Effect"; break;
              }
            }
            
            // Description text (if any)
            const descriptionHtml = ability.description ? 
              `<div class="ability-description">${ability.description}</div>` : '';
            
            // Create chat message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              roll: roll,
              content: `
                <div class="faserip-custom-roll">
                  <h3>${actor.name} uses ${item.name}: ${ability.name}</h3>
                  <div class="roll-info">
                    <div><strong>Rank:</strong> ${abilityRank}</div>
                    <div><strong>Column Shift:</strong> ${columnShift !== 0 ? 
                      `${columnShift > 0 ? '+' : ''}${columnShift}CS → ${effectiveRank}` : 
                      "None"}</div>
                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karma} = ${finalRoll}</div>
                    ${ability.range ? `<div><strong>Range:</strong> ${ability.range}</div>` : ''}
                    ${ability.damageType ? `<div><strong>Damage Type:</strong> ${ability.damageType}</div>` : ''}
                  </div>
                  ${descriptionHtml}
                  <div class="result result-${colorResult.toLowerCase()}">
                    ${resultText} (${colorResult.toUpperCase()})
                  </div>
                </div>
                <style>
                  .faserip-custom-roll {
                    font-family: Arial, sans-serif;
                    background: #f9f8f4;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 8px;
                  }
                  .faserip-custom-roll h3 {
                    margin: 0 0 8px 0;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 4px;
                    font-size: 1.1em;
                  }
                  .roll-info {
                    margin-bottom: 8px;
                    font-size: 0.95em;
                  }
                  .roll-info div {
                    margin-bottom: 3px;
                  }
                  .ability-description {
                    margin: 8px 0;
                    padding: 5px;
                    background: #f0f0f0;
                    border-radius: 3px;
                    font-style: italic;
                  }
                  .result {
                    text-align: center;
                    padding: 6px;
                    border-radius: 3px;
                    font-weight: bold;
                    font-size: 1.1em;
                  }
                  .result-white {
                    background-color: #f0f0f0;
                    color: #333;
                    border: 1px solid #ccc;
                  }
                  .result-green {
                    background-color: #4CAF50;
                    color: white;
                  }
                  .result-yellow {
                    background-color: #FFC107;
                    color: #333;
                  }
                  .result-red {
                    background-color: #F44336;
                    color: white;
                  }
                </style>
              `
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }
}