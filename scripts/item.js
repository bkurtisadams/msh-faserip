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
  
  // Create Foundry Roll object
  const roll = new Roll("1d100");
  
  // Roll the dice
  await roll.evaluate({async: true});
  
  // Get color result from universal table
  const colorResult = game.msh.rollUniversalTable(rank, roll.total);
  
  // Define result meanings
  const resultMeanings = {
    "White": "Miss / Failure",
    "Green": "Hit / Success",
    "Yellow": "Bullseye / Special Effect",
    "Red": "Stun / Kill / Maximum Effect"
  };
  
  // Create chat message with formatted result
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${this.name} (${rank})`,
    roll: roll,
    content: `
      <div class="faserip-power-roll">
        <div class="power-header">
          <h3>${this.name}</h3>
          <div class="power-info">
            <span><strong>Rank:</strong> ${rank} (${value})</span>
            <span><strong>Range:</strong> ${range}</span>
            <span><strong>Type:</strong> ${type}</span>
          </div>
        </div>
        <div class="roll-result">
          <div class="roll-info">
            <span class="roll-number"><strong>Roll:</strong> ${roll.total}</span>
            <div class="result-color ${colorResult.toLowerCase()}">
              <strong>Result:</strong> ${colorResult}
              <div class="result-meaning">${resultMeanings[colorResult]}</div>
            </div>
          </div>
        </div>
      </div>
      <style>
        .faserip-power-roll {
          font-family: Arial, sans-serif;
          background: #fff;
          border: 2px solid #8b0000;
          border-radius: 5px;
          padding: 10px;
          margin-bottom: 5px;
        }
        .power-header {
          border-bottom: 1px solid #8b0000;
          margin-bottom: 10px;
          padding-bottom: 5px;
        }
        .power-header h3 {
          color: #8b0000;
          margin: 0 0 5px 0;
        }
        .power-info {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .roll-result {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .roll-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .result-color {
          padding: 5px 10px;
          border-radius: 4px;
          text-align: center;
          width: 60%;
        }
        .white {
          background-color: #f5f5f5;
          color: #333;
          border: 1px solid #ccc;
        }
        .green {
          background-color: #4CAF50;
          color: white;
        }
        .yellow {
          background-color: #FFC107;
          color: #333;
        }
        .red {
          background-color: #F44336;
          color: white;
        }
        .result-meaning {
          font-size: 0.9em;
          margin-top: 2px;
        }
      </style>
    `
  });
}
}