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
        break;
  
      case "talent":
      case "contact":
        itemData.description = itemData.description || "";
        break;
  
      case "equipment":
        itemData.materialStrength = itemData.materialStrength || "Typical";
        itemData.description = itemData.description || "";
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

// In item.js, replace the rollItem method
async rollItem() {
  const actor = this.actor;
  if (!actor) return ui.notifications.error("No actor linked to item!");

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
            // Remove the flavor text to avoid duplication
            // flavor: `${this.name} (${rank})`,
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