export class FaseripActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      width: 600,
      height: 700,
      dragDrop: [{ dragSelector: '.item', dropSelector: '.faserip-sheet' }],
      tabs: [{ navSelector: ".tabs-navigation", contentSelector: ".tab", initial: "powers" }],
      template: "systems/msh-faserip/templates/actor-sheet.html"
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    
    // Initialize data structure if needed
    if (!this.actor.system.abilities) {
      this.actor.update({
        "system.abilities": {
          fighting: { value: 10, rank: "Typical" },
          agility: { value: 10, rank: "Typical" },
          strength: { value: 10, rank: "Typical" },
          endurance: { value: 10, rank: "Typical" },
          reason: { value: 10, rank: "Typical" },
          intuition: { value: 10, rank: "Typical" },
          psyche: { value: 10, rank: "Typical" }
        }
      });
    }
    
    // Group items by type for easier access in the template
    context.powers = this.actor.items.filter(item => item.type === "power");
    context.talents = this.actor.items.filter(item => item.type === "talent");
    context.contacts = this.actor.items.filter(item => item.type === "contact");
    context.equipment = this.actor.items.filter(item => item.type === "equipment");
    context.vehicles = this.actor.items.filter(item => item.type === "vehicle");
    context.headquarters = this.actor.items.filter(item => item.type === "headquarters");
    
    console.log("Sheet context:", context); // Debug logging
    
    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Item management
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    html.find('.add-power').click(this._onAddPower.bind(this));
    html.find('.add-talent').click(this._onAddTalent.bind(this));
    html.find('.add-contact').click(this._onAddContact.bind(this));
    
    // FEAT rolls
    html.find('.feat-roll').click(this._onFeatRoll.bind(this));
    
    // Add drag-drop handling
    this._addDragDropListeners(html);
  }
  
  /**
   * Add drag and drop event listeners to HTML element
   */
  _addDragDropListeners(html) {
    // Set up the drag events
    const dragItems = html.find('[draggable="true"]');
    dragItems.each((i, li) => {
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });
    
    // Set up the drop target
    html[0].addEventListener("dragover", this._onDragOver.bind(this));
    html[0].addEventListener("drop", this._onDrop.bind(this));
  }
  
  /* Event Handler Methods */
  
  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    item.sheet.render(true);
  }
  
  _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const itemId = li.dataset.itemId;
    if (itemId) {
      this.actor.deleteEmbeddedDocuments("Item", [itemId]);
    }
  }
  
  _onAddPower(event) {
    event.preventDefault();
    this.actor.createEmbeddedDocuments("Item", [{
      name: "New Power",
      type: "power",
      system: { rank: "Typical" }
    }]);
  }
  
  _onAddTalent(event) {
    event.preventDefault();
    this.actor.createEmbeddedDocuments("Item", [{
      name: "New Talent",
      type: "talent"
    }]);
  }
  
  _onAddContact(event) {
    event.preventDefault();
    this.actor.createEmbeddedDocuments("Item", [{
      name: "New Contact",
      type: "contact"
    }]);
  }
  
  _onFeatRoll(event) {
    event.preventDefault();
    const abilityKey = event.currentTarget.dataset.ability;
    game.msh.rollFeat(this.actor, abilityKey);
  }
  
  /* Drag and Drop Methods */
  
  _onDragStart(event) {
    const itemId = event.currentTarget.dataset.itemId;
    if (!itemId) return;
    
    const item = this.actor.items.get(itemId);
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      uuid: item.uuid,
      id: item.id,
      pack: item.pack,
      name: item.name
    }));
  }
  
  _onDragOver(event) {
    event.preventDefault();
    return false;
  }
  
  async _onDrop(event) {
    event.preventDefault();
    
    // Get dropped data
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      return false;
    }
    
    if (!data || data.type !== "Item") return;
    
    // Handle dropped Item
    let item;
    if (data.uuid) {
      item = await fromUuid(data.uuid);
    } else if (data.pack) {
      const pack = game.packs.get(data.pack);
      item = await pack.getDocument(data.id);
    } else if (data.id) {
      item = game.items.get(data.id);
    }
    
    if (!item) return;
    
    // Create the owned item
    return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
  }
}