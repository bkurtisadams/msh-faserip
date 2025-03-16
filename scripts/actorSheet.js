export class FaseripActorSheet extends ActorSheet {

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["faserip-sheet", "sheet", "actor"],
        template: "systems/msh-faserip/templates/actor-sheet.html",
        width: 600,
        height: "auto",
        tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "abilities" }]
      });
    }
  
    getData() {
      const context = super.getData();
      context.system = this.actor.system;
      context.items = this.actor.items;
      return context;
    }
  
    // Override activateListeners explicitly
activateListeners(html) {
  super.activateListeners(html);

  if (!this.isEditable) return;

  new DragDrop({
    dragSelector: '.item',
    dropSelector: '.faserip-sheet',
    permissions: {
      dragstart: () => this.isEditable,
      drop: () => this.isEditable
    },
    callbacks: {
      drop: this._onDropItem.bind(this)
    }
  }).bind(this.element[0]);
}

  
    itemMacro(item) {
      if (!item) return ui.notifications.warn("Item not found!");
      if (item.type === "power") {
        item.rollItem();
      } else {
        ui.notifications.info(`Macro not defined for item type: ${item.type}`);
      }
    }
  
    async _onDropItem(event, data) {
      if (!this.actor.isOwner) return false;
    
      let item;
    
      if (data.uuid) {
        // UUID method (preferred in Foundry v12)
        const droppedItem = await fromUuid(data.uuid);
        if (!droppedItem) {
          ui.notifications.error("The item could not be found.");
          return false;
        }
        item = droppedItem.toObject();
      } else if (data.type === "Item") {
        // Fallback method for older data formats (non-UUID)
        if (data.pack) {
          const pack = game.packs.get(data.pack);
          if (!pack) {
            ui.notifications.error("The compendium pack was not found.");
            return false;
          }
          const document = await pack.getDocument(data.id);
          item = document.toObject();
        } else {
          const worldItem = game.items.get(data.id);
          if (!worldItem) {
            ui.notifications.error("The item was not found in the world.");
            return false;
          }
          item = duplicate(worldItem);
        }
      } else {
        ui.notifications.error("You can only drop items onto this actor.");
        return false;
      }
    
      if (!item) {
        ui.notifications.error("Failed to retrieve item data.");
        return false;
      }
    
      // Ensure no conflicting _id
      delete item._id;
    
      // Create the item as embedded document
      return this.actor.createEmbeddedDocuments("Item", [item]);
    }
  
  }
  