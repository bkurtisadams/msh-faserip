export class FaseripItem extends Item {
    prepareData() {
      super.prepareData();
  
      const itemData = this.system;
  
      switch (this.type) {
        case "power":
          itemData.rank = itemData.rank || "Typical";
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

    async rollItem() {
        const actor = this.actor;
        if (!actor) return ui.notifications.error("No actor linked to item!");
    
        const rank = this.system.rank || "Typical";
        const roll = await new Roll("1d100").evaluate({async: true});
        const result = game.msh.rollUniversalTable(rank, roll);
    
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <strong>${this.name} (${rank}):</strong> ${roll} - <span style="color:green">${result}</span><br>
            ${this.system.description}
          `
        });
      }
  }
  