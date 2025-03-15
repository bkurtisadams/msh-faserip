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
  
    activateListeners(html) {
      super.activateListeners(html);
  
      if (!this.isEditable) return;
  
      // Drag-and-drop items
      new DragDrop({
        dragSelector: ".item-list .item",
        dropSelector: ".faserip-sheet",
        callbacks: { drop: this._onDropItem.bind(this) }
      }).bind(html[0]);
  
      // FEAT Roll buttons
      html.find(".feat-roll").click(ev => {
        const abilityKey = ev.currentTarget.dataset.ability;
        game.msh.rollFeat(this.actor, abilityKey);
      });
  
      // Item macros on sheet
      html.find(".item .item-use").click(ev => {
        const itemId = ev.currentTarget.closest(".item").dataset.itemId;
        const item = this.actor.items.get(itemId);
        this.itemMacro(item);
      });
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
  
      let itemData;
  
      if (data.type === "Item") {
        if (data.pack) {
          const pack = game.packs.get(data.pack);
          const item = await pack.getDocument(data.id);
          item.updateSource({ _id: foundry.utils.randomID() });
          return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        } else if (data.actorId) {
          const sourceActor = game.actors.get(data.actorId);
          const item = sourceActor.items.get(data.id);
          item.updateSource({ _id: foundry.utils.randomID() });
          return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        } else {
          const item = game.items.get(data.id);
          item.updateSource({ _id: foundry.utils.randomID() });
          return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        }
      }
      return false;
  }
  
  }
  