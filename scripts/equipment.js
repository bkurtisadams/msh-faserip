// equipment.js
import { CombatHandler } from './combat-handler.js';

// Power Rank Range Table (based on "Faserip Combat 02.txt")
const POWER_RANGE_VALUES = {
  "Shift-0": 0, "Feeble": 0, "Poor": 1, "Typical": 2, "Good": 4,
  "Excellent": 6, "Remarkable": 8, "Incredible": 10, "Amazing": 20,
  "Monstrous": 40, "Unearthly": 60, "Shift X": 80, "Shift Y": 160,
  "Shift Z": 400,
  // Converted miles to areas (1 mile = 1760 yards/areas)
  "Class 1000": 4000,   // 100 miles
  "Class 3000": 400000, // 10,000 miles
  "Class 5000": 40000000, // 1,000,000 miles
  "Beyond": Infinity      // Unlimited
};

export class FaseripEquipmentSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "equipment"],
      template: "systems/msh-faserip/templates/equipment-sheet.html",
      width: 530,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  getData() {
    // Get base data
    const context = super.getData();
    context.item = this.item;
    context.system = this.item.system;

    // Add custom CSS class based on document type
    const classes = ["faserip", "sheet", "item", this.item.type];
    context.cssClass = classes.join(" ");

    // All FASERIP Ranks
    context.ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift X", "Shift Y", "Shift Z",
      "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    // All FASERIP Combat Damage Types + custom resistance types
context.damageTypes = [
  "S",    // Shooting
  "E",    // Energy
  "F",    // Force
  "EA",   // Edged Attack
  "BA",   // Blunt Attack
  "TE",   // Throwing Edged
  "TB",   // Throwing Blunt
  "GP",   // Grappling
  "Gb",   // Grabbing

  // Extended types used for resistances or passive armor
  "sensory",
  "mental",
  "radiation",
  "corrosive",
  "toxin",
  "magic",
  "disease",
  "emotion"
  // Note: "Stun" is an *effect* type, not a damage type on the Universal Table column.
      // If you want a "Stun" damage type, you'd need to define how it maps to the table.
      // Current weapon sheet already has stunIntensity for weapons that only stun.
];

    // --- END NEW ---

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".add-granted-power").on("click", ev => {
      ev.preventDefault();
      const powers = duplicate(this.object.system.powers || []);
      powers.push({
        name: "",
        rank: "Typical",
        value: 6,
        damageType: "",
        isPassiveArmor: false,
        grantedByEquipment: true
      });
      this.object.update({ "system.powers": powers });
    });

    html.find(".remove-granted-power").on("click", ev => {
      ev.preventDefault();
      const index = Number(ev.currentTarget.dataset.index);
      const powers = duplicate(this.object.system.powers || []);
      powers.splice(index, 1);
      this.object.update({ "system.powers": powers });
    });

    // grenade listeners
    html.find('[name="system.grenadeType"]').change(ev => {
      const grenadeType = ev.currentTarget.value;
      let damage = "";
      let damageType = "";
      let intensity = "";

      // Set default values based on grenade type
      switch (grenadeType) {
        case "fragmentation":
          damage = "RM (30)";
          damageType = "EA";
          break;
        case "concussive":
          damage = "40";
          damageType = "BA";
          break;
        case "sonic":
          damage = "20";
          damageType = "E";
          break;
        case "flash":
          damage = "Amazing Intensity";
          damageType = ""; // Flash often has no direct damage type in the universal table context
          intensity = "Amazing";
          break;
        case "tearGas":
          intensity = "Typical";
          break;
        case "knockout":
          intensity = "Excellent";
          break;
        case "smoke":
          intensity = "Excellent";
          break;
        // Add other types as needed
      }

      // Update the fields
      html.find('[name="system.grenadeDamage"]').val(damage);
      html.find('[name="system.grenadeDamageType"]').val(damageType);

      // Update intensity if set (and clear if not applicable)
      html.find('[name="system.grenadeIntensity"]').val(intensity);
    });

    html.find('[name="system.payloadType"]').change(ev => {
      const payloadType = ev.currentTarget.value;
      let damage = "";
      let secondaryDamage = "";
      let damageType = "EA"; // Default for most missiles

      // Set default damage values based on payload type
      switch (payloadType) {
        case "standard":
          damage = "40";
          break;
        case "concentrated":
          damage = "40";
          break;
        case "high-explosive":
          damage = "70";
          secondaryDamage = "20";
          break;
        case "incendiary":
          damage = "40";
          damageType = "E"; // Incendiary deals Energy damage
          break;
        case "gas":
          damage = ""; // Gas payloads deal no direct damage, but apply intensity
          damageType = "";
          html.find('[name="system.missileIntensity"]').val("Typical"); // Assuming Typical intensity for gas payload
          break;
        // Add other types as needed
      }

      // Update the fields
      html.find('[name="system.missileDamage"]').val(damage);
      html.find('[name="system.missileSecondaryDamage"]').val(secondaryDamage);
      html.find('[name="system.missileDamageType"]').val(damageType);
    });

    // Toggle collapsible sections
    html.find('.collapsible').click(ev => {
      const header = ev.currentTarget;
      const section = header.dataset.section;
      const content = header.nextElementSibling;
      const icon = header.querySelector('i');

      // Toggle the content display
      const isOpen = content.style.display !== "none";
      if (!isOpen) {
        content.style.display = "block";
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        this.object.setFlag("msh-faserip", `section_${section}_open`, true);
      } else {
        content.style.display = "none";
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        this.object.setFlag("msh-faserip", `section_${section}_open`, false);
      }
    });

    // Initialize section states based on saved flags
    html.find('.collapsible').each((i, el) => {
      const header = el;
      const section = header.dataset.section;
      const content = header.nextElementSibling;
      const icon = header.querySelector('i');

      const isOpen = this.object.getFlag("msh-faserip", `section_${section}_open`);
      if (isOpen) {
        content.style.display = "block";
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
      } else {
        // Ensure closed state is consistent on load if flag is false or not set
        content.style.display = "none";
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
      }
    });

    // Show/hide category-specific fields when category changes
    html.find('.equipment-category-select').change(ev => {
      const category = ev.currentTarget.value;
      this.object.update({"system.category": category}); // Ensure category is saved immediately

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
      this.render(true); // Re-render to ensure all conditional displays are correct
    });

    // Make sure correct fields are shown on initial load
    const currentCategory = this.object.system.category;
    html.find('.weapon-fields, .armor-fields, .power-item-fields, .custom-fields').hide(); // Hide all initially
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
    html.find('.add-custom-ability').click(async ev => {
      const stunts = this.object.system.customAbilities || [];
      stunts.push({
        name: "New Ability",
        description: "",
        rank: "Typical",
        damageType: "",
        range: "",
        isPassiveArmor: false, // Initialize new armor fields
        armorDamageType: ""
      });
      await this.object.update({ "system.customAbilities": stunts }, {diff: false});
      this.render(true); // Re-render to show the new row immediately
    });

    // Remove custom ability handler
    html.find('.remove-custom-ability').click(async ev => {
      const index = parseInt(ev.currentTarget.dataset.index);

      let abilities = duplicate(this.object.system.customAbilities || []);
      if (!Array.isArray(abilities)) {
        abilities = []; // Ensure it's an array for splice to work
        console.warn("customAbilities was not an array, creating empty array");
      }

      if (abilities.length > index) {
        abilities.splice(index, 1);
        await this.object.update({ "system.customAbilities": abilities }, {diff: false});
        this.render(true); // Re-render to reflect the removal
      } else {
        console.error("Invalid ability index:", index, "length:", abilities.length);
      }
    });

    // --- NEW LISTENER FOR SAVING DROPDOWN DATA IN CUSTOM ABILITIES ---
    // This listener captures changes within the custom abilities list to ensure data is saved
    html.find('.custom-abilities-list').on('change', 'select, input, textarea', async ev => {
        ev.preventDefault(); // Prevent default form behavior if submitOnChange is global

        const newCustomAbilities = [];
        const abilityRows = html.find('.custom-ability'); // Get all custom ability rows in the DOM

        // Iterate through each row and reconstruct the ability object from its form elements
        for (let i = 0; i < abilityRows.length; i++) {
            const abilityRow = abilityRows[i];

            // Access elements by their name attribute within this specific row
            const name = abilityRow.querySelector(`[name="system.customAbilities.${i}.name"]`)?.value || "";
            const description = abilityRow.querySelector(`[name="system.customAbilities.${i}.description"]`)?.value || "";
            const rank = abilityRow.querySelector(`[name="system.customAbilities.${i}.rank"]`)?.value || "Typical";
            const damageType = abilityRow.querySelector(`[name="system.customAbilities.${i}.damageType"]`)?.value || "";
            const range = abilityRow.querySelector(`[name="system.customAbilities.${i}.range"]`)?.value || "";
            const isPassiveArmor = abilityRow.querySelector(`[name="system.customAbilities.${i}.isPassiveArmor"]`)?.checked || false;
            const armorDamageType = abilityRow.querySelector(`[name="system.customAbilities.${i}.armorDamageType"]`)?.value || "";

            newCustomAbilities.push({
                name,
                description,
                rank,
                damageType,
                range,
                isPassiveArmor,
                armorDamageType
            });
        }

        // Update the item's data model with the reconstructed array
        await this.object.update({ "system.customAbilities": newCustomAbilities }, { diff: false });
        // Re-render the sheet to ensure the UI reflects the saved state accurately
        // This is crucial for dropdowns to show their 'selected' state and for conditional displays (like armor type)
        this.render(true);
    });

    // --- NEW LISTENER FOR TOGGLING ARMOR TYPE DISPLAY IN CUSTOM ABILITIES ---
    // This makes the 'Armor Type (Specific)' dropdown appear/disappear based on 'Grants Passive Armor' checkbox
    html.find('.custom-abilities-list').on('change', 'input[name$=".isPassiveArmor"]', async ev => {
        const checkbox = ev.currentTarget;
        const abilityRow = checkbox.closest('.custom-ability');
        const armorTypeSelectGroup = abilityRow.querySelector('.form-group[style*="display: none;"]'); // Target the hidden group

        if (checkbox.checked) {
            if (armorTypeSelectGroup) armorTypeSelectGroup.style.display = "block";
        } else {
            if (armorTypeSelectGroup) armorTypeSelectGroup.style.display = "none";
        }
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

    if (!actor) return ui.notifications.error("No actor linked to item!");

    // Get equipment details
    const category = item.system.category || "gear";

    switch (category) {
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

  // Roll a weapon attack
  async _rollWeapon(item, actor) {
    // Get weapon details
    const weaponType = item.system.weaponType || "";
    let ability = "strength";

    // Determine which ability to use based on weapon type
    if (weaponType === "shooting" || weaponType === "energy") {
      ability = "agility";
    } else if (weaponType === "thrown") {
      ability = "agility";
    }

    // Get ability rank and damage type
    const abilityRank = actor.system.abilities[ability].rank || "Typical";
    const abilityValue = actor.system.abilities[ability].value || 6;
    const damageType = item.system.damageType || "S";
    const damage = item.system.damage || "0";

    // *** AMMO TYPE CHECKING CODE ***
    const ammoType = item.system.ammoType || "standard";
    
    // Modify damage calculation based on ammo type
    let finalDamage = damage;
    let specialEffects = {};

    switch(ammoType) {
      case "mercy":
        finalDamage = 0; // No damage
        specialEffects.mercyShot = true;
        break;
      case "explosive":
        finalDamage = damage * 2; // Double damage
        break;
      case "rubber":
        specialEffects.noSlam = true;
        // normalizedDamageType will be handled in CombatHandler
        break;
    }
    // *** END OF NEW CODE ***

    // Create dialog options
    // Define action types from the Universal Table
    const ACTIONS = {
      "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" } },
      "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
      "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
      "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
      "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" } },
      "Energy (En)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
      "Force (Fo)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" } },
      "Grappling (Gp)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" } },
      "Grabbing (Gb)": { ability: "strength", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" } },
      "Escaping (Es)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" } },
      "Stunning Attack": { ability: "agility", results: { white: "No Effect", green: "Partial Effect", yellow: "Stun", red: "Knockout" } }
    };

    // Determine default action based on weapon type
    let defaultAction = "Shooting Attack (Sh)";
    if (weaponType === "melee" && damageType === "BA") {
      defaultAction = "Blunt Attack (BA)";
    } else if (weaponType === "melee" && damageType === "EA") {
      defaultAction = "Edged Attack (EA)";
    } else if (weaponType === "thrown" && damageType === "BA") {
      defaultAction = "Throwing Blunt (TB)";
    } else if (weaponType === "thrown" && damageType === "EA") {
      defaultAction = "Throwing Edged (TE)";
    } else if (weaponType === "energy" || damageType === "E") {
      defaultAction = "Energy (En)";
    } else if (weaponType === "force" || damageType === "F") {
      defaultAction = "Force (Fo)";
    } else if (weaponType === "grappling" || damageType === "GP") {
      defaultAction = "Grappling (GP)";
    } else if (weaponType === "grabbing" || damageType === "Gb") {
      defaultAction = "Grabbing (Gb)";
    } else if (item.system.stunIntensity && item.system.stunIntensity !== "") {
      defaultAction = "Stunning Attack";
    }

    let dialogContent = `
    <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Weapon:</label>
        <input type="text" value="${item.name}" readonly style="width: 180px;">
      </div>
      <!-- ADD THIS AMMO TYPE SELECTOR -->
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Ammo Type:</label>
        <select name="ammoType" style="width: 180px;">
          <option value="standard">Standard</option>
          <option value="ap">Armor Piercing</option>
          <option value="mercy">Mercy Shot</option>
          <option value="rubber">Rubber Shot</option>
          <option value="explosive">Explosive Shot</option>
        </select>
      </div>
      <!-- END ADD -->
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Action Type:</label>
        <select id="action" name="action" style="width: 180px;">
          ${Object.keys(ACTIONS).map(action =>
            `<option value="${action}" ${action === defaultAction ? 'selected' : ''}>${action}</option>`
          ).join('')}
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Target Distance:</label>
        <input type="number" id="distance" name="distance" value="1" min="1" style="width: 50px;"> areas
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Column Shift:</label>
        <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
        <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
      </div>
      <div>
        <label style="display: inline-block; width: 120px;">Karma Points:</label>
        <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
      </div>
    </div>`;

    new Dialog({
      title: `Weapon Attack: ${item.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
          const actionName = html.find('[name="action"]').val();
          const action = ACTIONS[actionName];
          const distance = parseInt(html.find('[name="distance"]').val()) || 1;
          const shift = parseInt(html.find('[name="shift"]').val()) || 0;
          const karma = parseInt(html.find('[name="karma"]').val()) || 0;
          
          // ADD THIS: Get ammo type from dialog and log it
          const selectedAmmoType = html.find('[name="ammoType"]').val() || "standard";
          console.log("Selected ammo type from dialog:", selectedAmmoType);

          // Calculate range penalty for shooting weapons
          let totalShift = shift;
          if (weaponType === "shooting" && distance > 1) {
            totalShift -= (distance - 1);
          }

          // Apply column shifts if needed
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

          try {
            // Create the roll
            const roll = new Roll("1d100");
            await roll.evaluate();

            // Calculate final roll with karma
            let cappedTotal = roll.total;
            let karmaUsed = 0;

            if (karma > 0) {
              cappedTotal = Math.min(100, roll.total + karma);
              karmaUsed = cappedTotal - roll.total;
            }

            if (karmaUsed > 0) {
              console.log("Logging Karma:", karmaUsed);
              ui.notifications.info(`Logging ${karmaUsed} Karma for ${item.name}`);

              const history = foundry.utils.deepClone(actor.system.karma?.history || []);
              const newEvent = {
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -karmaUsed,
                type: "Die Roll",
                description: `Spent on ${item.name} (Equipment)`
              };
              history.push(newEvent);

              await actor.update({ "system.karma.history": history });
            }

            // Get result color from universal table
            const colorResult = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

            // Get the specific result based on action type and color
            const effect = action.results[colorResult.toLowerCase()];

            // Get additional weapon properties
            const legality = item.system.legality || "legal";
            const burstScatter = item.system.burstScatter || "none";
            const stunIntensity = item.system.stunIntensity || "";
            const continuingDamage = item.system.continuingDamage || "";
            const continuingRounds = item.system.continuingDamageRounds || "";
            const requiresTwoOperators = item.system.requiresTwoOperators || false;

            // Add to chat message content
            let additionalInfo = "";
            if (stunIntensity) {
              additionalInfo += `<div>Stun/Gas Intensity: ${stunIntensity} (Endurance FEAT to resist)</div>`;
              if (actionName === "Stunning Attack") {
                additionalInfo += `<div>Effect: Knockout for 1d10 rounds on failed FEAT</div>`;
              }
            }
            if (continuingDamage && continuingRounds) {
              additionalInfo += `<div>Continuing Damage: ${continuingDamage} for ${continuingRounds}</div>`;
            }
            if (burstScatter !== "none") {
              additionalInfo += `<div>${burstScatter === "burst" ? "Burst Attack (affects up to 3 adjacent targets)" : "Scatter Attack (affects all in target area)"}</div>`;
            }
            if (requiresTwoOperators) {
              additionalInfo += `<div>Requires Two Operators</div>`;
            }
            if (legality !== "legal") {
              const legalText = {
                "restricted": "Restricted",
                "military": "Military Only",
                "illegal": "Illegal"
              }[legality] || legality;
              additionalInfo += `<div>Legality: ${legalText}</div>`;
            }

            console.log("=== WEAPON DAMAGE DEBUG ===");
            console.log("item.system.damage:", item.system.damage);
            console.log("item.system.damageType:", item.system.damageType);
            console.log("damage variable:", damage);
            console.log("damageType variable:", damageType);
            console.log("========================");
            
            // Create the formatted chat message with proper colors
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              roll: roll,
              content: `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                  <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                    <strong>${actor.name} - ${item.name} (${actionName})</strong>
                  </div>
                  <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                    <div>Column Shift: ${totalShift !== 0 ? `${totalShift > 0 ? '+' : ''}${totalShift}CS → ${effectiveRank}` : `0 → ${effectiveRank}`}</div>
                    <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
                    <div>Damage: ${damage} (${damageType})</div>
                    ${selectedAmmoType !== "standard" ? `<div>Ammo Type: ${selectedAmmoType}</div>` : ''}
                    ${additionalInfo}
                  </div>
                  <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px;
                    background-color: ${
                      colorResult.toLowerCase() === 'white' ? '#f8f8f8' :
                      colorResult.toLowerCase() === 'green' ? '#4CAF50' :
                      colorResult.toLowerCase() === 'yellow' ? '#FFC107' :
                      '#F44336'
                    };
                    color: ${
                      colorResult.toLowerCase() === 'white' || colorResult.toLowerCase() === 'yellow' ? '#333' : 'white'
                    };">
                    ${effect} (${colorResult.toUpperCase()})
                  </div>
                </div>
              `
            });

            // Automatically apply damage to the targeted token (if any)
            const target = Array.from(game.user.targets)[0]?.actor;

            if (target) {
              // Convert damage (string or rank) into number
              let baseDamage = parseInt(damage);
              if (isNaN(baseDamage)) {
                baseDamage = CONFIG.FASERIP.rankValues[damage] || 0;
              }

              const canBeStun = effect?.toLowerCase().includes("stun") || actionName.toLowerCase().includes("stunning");
              const canBeSlam = effect?.toLowerCase().includes("slam");
              const canBeKill = effect?.toLowerCase().includes("kill");

              // damage type normalization
              let normalizedDamageType;
              switch (damageType.toUpperCase()) {
                case "S":
                case "SH":
                case "BA":
                  normalizedDamageType = "Physical-Blunt";
                  break;
                case "EA":
                  normalizedDamageType = "Physical-Edged";
                  break;
                case "TE":
                  normalizedDamageType = "Physical-Edged";
                  break;
                case "TB":
                  normalizedDamageType = "Physical-Blunt";
                  break;
                case "E":
                case "EN":
                  normalizedDamageType = "Energy-Energy";
                  break;
                case "F":
                case "FO":
                  normalizedDamageType = "Force";
                  break;
                case "GP":
                  normalizedDamageType = "Physical-Grapple";
                  break;
                case "GB":
                  normalizedDamageType = "Physical-Grab";
                  break;
                default:
                  normalizedDamageType = "Physical-Blunt";
              }
              console.log(`Weapon damage type "${damageType}" normalized to "${normalizedDamageType}"`);
              
              // ADD THIS: Create special effects object based on ammo type
              let specialEffects = {};
              if (selectedAmmoType === "mercy") {
                specialEffects.mercyShot = true;
              } else if (selectedAmmoType === "rubber") {
                specialEffects.noSlam = true;
              }

              // Update the CombatHandler.processAttack call
              await CombatHandler.processAttack({
                attacker: actor,
                target: target,
                baseDamage: baseDamage,
                damageType: normalizedDamageType,
                sourceName: item.name,
                canBeStun,
                canBeSlam,
                canBeKill,
                originalRollResult: colorResult.toLowerCase()
              }, {
                ammoType: selectedAmmoType,  // ← Use the local variable
                specialEffects: specialEffects,  // ← Use the local variable
                skipDefenseDialog: false
              });
            } else {
              ui.notifications.info("No target selected. Damage not applied.");
            }

            // Update shots remaining if it's a weapon
            if (item.system.category === "weapon" && item.system.shots) {
              let shotsRemaining = item.system.shotsRemaining;
              if (shotsRemaining === undefined || shotsRemaining === "") {
                shotsRemaining = item.system.shots;
              }

              shotsRemaining = Math.max(0, parseInt(shotsRemaining) - 1);
              await item.update({ "system.shotsRemaining": shotsRemaining });

              if (shotsRemaining === 0) {
                ui.notifications.warn(`${item.name} needs to be reloaded!`);
              }
            }

          } catch (error) {
            console.error("Error rolling dice:", error);
            ui.notifications.error("Error when rolling dice. See console for details.");
          }
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

    // --- INITIAL DISTANCE AND RANGE INFO FOR DIALOG ---
    let initialDistance = 0;
    const targetToken = game.user.targets.first();
    if (targetToken && canvas.tokens.controlled.length > 0) {
      const controlledToken = canvas.tokens.controlled[0];
      const ray = new Ray(controlledToken.center, targetToken.center);
      initialDistance = Math.round(ray.distance / canvas.scene.grid.size);
    }

    let dialogPowerRangeInfo = "";
    const basePowerRange = POWER_RANGE_VALUES[powerRank] || 0;

    if (initialDistance > basePowerRange) {
      const penalty = initialDistance - basePowerRange;
      dialogPowerRangeInfo = `<div><strong>Range:</strong> ${initialDistance} areas (Base: ${basePowerRange} areas). Penalty: -${penalty}CS.</div>`;
    } else if (initialDistance > 0) {
      dialogPowerRangeInfo = `<div><strong>Range:</strong> ${initialDistance} areas (within base range of ${basePowerRange} areas). No penalty.</div>`;
    } else {
      dialogPowerRangeInfo = `<div><strong>Range:</strong> Adjacent (no penalty).</div>`;
    }
    // --- END INITIAL DISTANCE AND RANGE INFO ---

    // Define action types for this power
    const actionTypes = [];

    // Determine available actions based on power type
    switch (powerType) {
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
      <label style="display: inline-block; width: 120px;">Target Distance:</label> <!-- NEW INPUT -->
      <input type="number" id="distance" name="distance" value="${initialDistance}" min="0" style="width: 50px;"> areas
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
    ${dialogPowerRangeInfo} <!-- NEW INFO DISPLAY -->
    `;

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
            const dialogDistance = parseInt(html.find('[name="distance"]').val()) || 0; // NEW: Get distance from dialog

            // --- RECALCULATE effective column shift with range penalty for the actual roll ---
            let effectivePowerRangePenalty = 0;
            // Recalculate basePowerRange here too to ensure it's fresh if powerRank changed in-between
            const basePowerRange = POWER_RANGE_VALUES[powerRank] || 0; 
            if (dialogDistance > basePowerRange) {
              effectivePowerRangePenalty = dialogDistance - basePowerRange;
            }
            const totalColumnShift = columnShift - effectivePowerRangePenalty;
            // --- END RECALCULATE ---

            // Apply column shifts to get effective rank
            let effectiveRank = powerRank;
            if (totalColumnShift !== 0) { // Use totalColumnShift here
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
              ];

              const index = ranks.indexOf(powerRank);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1);
                effectiveRank = ranks[newIndex];
              }
            }

            // Roll dice and add karma
            const roll = new Roll("1d100");
            await roll.evaluate();
            let cappedTotal = roll.total;
            let karmaUsed = 0;

            if (karma > 0) {
              cappedTotal = Math.min(100, roll.total + karma);
              karmaUsed = cappedTotal - roll.total;
            }

            if (karmaUsed > 0) {
              const history = foundry.utils.deepClone(actor.system.karma?.history || []);
              const newEvent = {
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -karmaUsed,
                type: "Die Roll",
                description: `Spent on ${item.name} (Equipment)`
              };
              history.push(newEvent);

              await actor.update({
                "system.karma.history": history
              });
              // Assuming _updateCurrentKarma exists and is called after karma history updates
              if (typeof game.msh?.FaseripRolls?._updateCurrentKarma === 'function') {
                game.msh.FaseripRolls._updateCurrentKarma(actor);
              }
            }

            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

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

            // --- RECALCULATE chatPowerRangeInfo for the chat message ---
            let chatPowerRangeInfo = "";
            if (dialogDistance > basePowerRange) {
              const penalty = dialogDistance - basePowerRange;
              chatPowerRangeInfo = `<div><strong>Range:</strong> ${dialogDistance} areas (Base: ${basePowerRange} areas). Penalty: -${penalty}CS.</div>`;
            } else if (dialogDistance > 0) {
              chatPowerRangeInfo = `<div><strong>Range:</strong> ${dialogDistance} areas (within base range of ${basePowerRange} areas). No penalty.</div>`;
            } else {
              chatPowerRangeInfo = `<div><strong>Range:</strong> Adjacent (no penalty).</div>`;
            }
            // --- END RECALCULATE ---

            // Create chat message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              roll: roll,
              content: `
                <div class="faserip-power-roll">
                  <h3>${actor.name} uses ${item.name} (${actionType})</h3>
                  <div class="roll-info">
                    <div><strong>Power Rank:</strong> ${powerRank}</div>
                    <div><strong>Column Shift:</strong> ${totalColumnShift !== 0 ?
                      `${totalColumnShift > 0 ? '+' : ''}${totalColumnShift}CS → ${effectiveRank}` :
                      "None"}</div>
                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
                    ${chatPowerRangeInfo} <!-- Uses the re-calculated chatPowerRangeInfo -->
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
            const roll = new Roll("1d100");
            await roll.evaluate();
            let cappedTotal = roll.total;
            let karmaUsed = 0;

            if (karma > 0) {
              cappedTotal = Math.min(100, roll.total + karma);
              karmaUsed = cappedTotal - roll.total;
            }

            if (karmaUsed > 0) {
              const history = foundry.utils.deepClone(actor.system.karma?.history || []);
              const newEvent = {
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -karmaUsed,
                type: "Die Roll",
                description: `Spent on ${ability.name} (Custom Ability)`
              };
              history.push(newEvent);

              await actor.update({
                "system.karma.history": history
              });
            }

            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

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

                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>

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