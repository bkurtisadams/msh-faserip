// item.js
import { FaseripEquipmentSheet } from "./equipment.js";

export class FaseripItem extends Item {
  prepareData() {
    super.prepareData();
  
    const itemData = this.system;
  
    switch (this.type) {
      case "power":
        itemData.rank = itemData.rank || "Typical";
        itemData.value = itemData.value || 0;
        itemData.range = itemData.range || "";
        itemData.type = itemData.type || "";
        itemData.source = itemData.source || "";
        itemData.description = itemData.description || "";

        // Initialize magic-related fields
        itemData.isMagic = itemData.isMagic ?? false;
        itemData.magic = itemData.magic || {
          energyType: "",         // "personal", "universal", "dimensional"
          sourceEntity: "",       // e.g., "Cyttorak"
          usesCeremony: false,
          successAbility: "psyche",  // Default to psyche
          targetResistsWith: "",
          backlashNotes: "",
          castCost: 0
        };
        break;
  
      case "talent":
      case "contact":
        itemData.description = itemData.description || "";
        break;
  
      // In the prepareData method of your FaseripItem class in item.js
      case "equipment":
        // Basic equipment properties
        itemData.materialStrength = itemData.materialStrength || "Typical";
        itemData.description = itemData.description || "";
        itemData.category = itemData.category || "gear"; // weapon, armor, gear, power-item, vehicle-item, custom
        itemData.notes = itemData.notes || ""; // Additional notes about the equipment
        itemData.price = itemData.price || "Poor"; // Default price for all equipment
        
        // Weapon-specific properties
        if (itemData.category === "weapon") {
          itemData.weaponType = itemData.weaponType || ""; // shooting, melee, thrown, energy, force, custom
          itemData.range = itemData.range || ""; // Range in areas
          itemData.damage = itemData.damage || ""; // Damage points
          itemData.damageType = itemData.damageType || ""; // S, E, F, EA, BA, GP, GB, custom
          itemData.rate = itemData.rate || "1"; // Shots per round
          itemData.shots = itemData.shots || ""; // Shots before reload
          itemData.burst = itemData.burst ?? false;
          itemData.scatter = itemData.scatter ?? false;
          itemData.isIllegal = itemData.isIllegal ?? false;
          itemData.militaryOnly = itemData.militaryOnly ?? false;
          itemData.usesPowerPack = itemData.usesPowerPack ?? false;
          itemData.reloadTime = itemData.reloadTime ?? 1;
          itemData.twoMan = itemData.twoMan ?? false;
          itemData.stationary = itemData.stationary ?? false;
          itemData.stunIntensity = itemData.stunIntensity || "";
          itemData.controlType = itemData.controlType || "";
          itemData.payloadType = itemData.payloadType || "";

          // Initialize shotsRemaining to equal shots if not defined or empty
          if (itemData.shotsRemaining === undefined || itemData.shotsRemaining === "" || itemData.shotsRemaining === null) {
            itemData.shotsRemaining = itemData.shots;
          }
          itemData.ammoType = itemData.ammoType || "Standard"; // Ammunition type

          // Grenade properties
          itemData.grenadeType = itemData.grenadeType || "";
          itemData.grenadeRadius = itemData.grenadeRadius || 1;
          itemData.grenadeIntensity = itemData.grenadeIntensity || "";
          // Grenade damage
          itemData.grenadeDamage = itemData.grenadeDamage || "";
          itemData.grenadeDamageType = itemData.grenadeDamageType || "";

          // Missile properties
          itemData.missileType = itemData.missileType || "";
          itemData.guidanceSystem = itemData.guidanceSystem || "";
          itemData.payloadType = itemData.payloadType || "";
          itemData.missileBody = itemData.missileBody || "";
          itemData.missileControl = itemData.missileControl || "";
          itemData.missileSpeed = itemData.missileSpeed || "";
          // Missile damage
          itemData.missileDamage = itemData.missileDamage || "";
          itemData.missileSecondaryDamage = itemData.missileSecondaryDamage || "";
          itemData.missileDamageType = itemData.missileDamageType || "";

          // Special ammo tracking
          itemData.specialAmmo = itemData.specialAmmo || {
            mercy: false,
            ap: false,
            rubber: false,
            explosive: false,
            canister: false,
            heatSeeker: false
          };
        }
        
        // Armor-specific properties
        if (itemData.category === "armor") {
          itemData.protection = itemData.protection || ""; // Protection value
          itemData.coverage = itemData.coverage || "partial"; // partial or full
        }
        
        // Power item properties
        if (itemData.category === "power-item") {
          itemData.powerRank = itemData.powerRank || "Typical";
          itemData.linkedAbility = itemData.linkedAbility || "reason";
          itemData.powerType = itemData.powerType || "";
          itemData.powerRange = itemData.powerRange || "";
        }
        
        // Custom item properties
        if (itemData.category === "custom") {
          itemData.customAbilities = itemData.customAbilities || [];
        }
        break;
  
      case "vehicle":
        itemData.speed = itemData.speed || 0;
        itemData.materialStrength = itemData.materialStrength || "Typical";
        itemData.description = itemData.description || "";
        break;
  
      case "headquarters":
        itemData.size = itemData.size || "Typical";
        itemData.materialStrength = itemData.materialStrength || "Typical";
        itemData.location = itemData.location || "";
        itemData.description = itemData.description || "";
        break;
    }
  }

  // Add this method for drag/drop functionality
  toDragData() {
    return {
      type: "Item",
      uuid: this.uuid,
      id: this.id,
      pack: this.pack ?? null,
      name: this.name,
      img: this.img
    };
  }

/**
 * Roll this item
 */
rollItem() {
  switch (this.type) {
    case "power":
      return game.msh.rollPower(this.actor, this);
    case "talent":
      return game.msh.rollTalent(this.actor, this);
    case "contact":
      return game.msh.rollContact(this.actor, this);
    case "equipment":
      return game.msh.rollEquipment(this.actor, this);
    case "action":
      return game.msh.rollUniversalAction(this.system.code, this.actor.id);
    default:
      ui.notifications.warn(`Cannot roll item of type: ${this.type}`);
      return null;
  }
}

// Move the original power rolling logic to a separate method
async _rollPower() {
  const actor = this.actor;
  
  // Power information
  const rank = this.system.rank || "Typical";
  const value = this.system.value || 6;
  const range = this.system.range || "None";
  const type = this.system.type || "None";
  
  // Define action types from the Universal Table
  const ACTIONS = {
    "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }},
    "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }},
    "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }},
    "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }},
    "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" }},
    "Energy (En)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }},
    "Force (Fo)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" }},
    "Grappling (GP)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" }},
    "Grabbing (Gb)": { ability: "strength", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" }},
    "Escaping (ES)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" }},
    "Charging (Ch)": { ability: "endurance", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }},
    "Dodging (Do)": { ability: "agility", results: { white: "None", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" }},
    "Evading (Ev)": { ability: "fighting", results: { white: "AutoHit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" }},
    "Blocking (Bl)": { ability: "fighting", results: { white: "-6 CS", green: "-4 CS", yellow: "-2 CS", red: "+1 CS" }},
    "Catching (Ca)": { ability: "strength", results: { white: "Autohit", green: "Miss", yellow: "Damage", red: "Catch" }},
    "General Power Use": { ability: "none", results: { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }}
  };

  // Create dialog for roll options
  let dialogContent = `
  <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Action Type:</label>
      <select id="action" name="action" style="width: 180px;">
        ${Object.keys(ACTIONS).map(action => 
          `<option value="${action}">${action}</option>`
        ).join('')}
      </select>
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
    title: `Power Roll: ${this.name} (${rank})`,
    content: dialogContent,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const actionName = html.find('[name="action"]').val();
          const action = ACTIONS[actionName];
          const shift = parseInt(html.find('[name="shift"]').val()) || 0;
          const karma = parseInt(html.find('[name="karma"]').val()) || 0;
          
          // Apply column shifts if needed
          let effectiveRank = rank;
          if (shift !== 0) {
            const ranks = [
              "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
              "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
            ];
            const index = ranks.indexOf(rank);
            if (index !== -1) {
              const newIndex = Math.min(Math.max(index + shift, 0), ranks.length - 1);
              effectiveRank = ranks[newIndex];
            }
          }
          
          // Roll dice and add karma
          const roll = await new Roll("1d100").evaluate({async: true});
          const finalRoll = Math.min(100, roll.total + karma);
          
          // Get result color
          const colorResult = game.msh.rollUniversalTable(effectiveRank, finalRoll);
          const effect = action.results[colorResult.toLowerCase()];
          
          // Create chat message
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            roll: roll,
            content: `
              <div class="faserip-power-roll">
                <h3>${this.name} - ${actionName}</h3>
                <div class="roll-info">
                  <div><strong>Base Rank:</strong> ${rank} (${value})</div>
                  <div><strong>Column Shift:</strong> ${shift !== 0 ? `${shift} → ${effectiveRank}` : "None"}</div>
                  <div><strong>Roll:</strong> ${roll.total} + Karma: ${karma} = ${finalRoll}</div>
                </div>
                <div class="result result-${colorResult.toLowerCase()}">
                  ${effect} (${colorResult.toUpperCase()})
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

}