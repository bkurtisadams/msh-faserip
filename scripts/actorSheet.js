export class FaseripActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      width: 600,
      height: 700,
      // Fix the selectors
      dragDrop: [{ 
        dragSelector: ".item", 
        dropSelector: ".powers-list, .talents-list, .contacts-list, .equipment-list, .headquarters-list, .vehicles-list" 
      }],
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
      
      // Tab activation - simplified approach
      html.find('.tabs-navigation a').click(ev => {
        ev.preventDefault();
        const tabName = ev.currentTarget.dataset.tab;
        
        // Remove active class from all tabs and contents
        html.find('.tabs-navigation a').removeClass('active');
        html.find('.tab').removeClass('active');
        
        // Add active class to clicked tab and corresponding content
        ev.currentTarget.classList.add('active');
        html.find(`.tab[data-tab="${tabName}"]`).addClass('active');
        
        console.log(`Tab switched to: ${tabName}`); // Debug log
      });
      
      // Activate the first tab by default
      html.find('.tabs-navigation a:first').click();
      
      // Item management
      html.find('.item-edit').click(this._onItemEdit.bind(this));
      html.find('.item-delete').click(this._onItemDelete.bind(this));
      html.find('.add-power').click(this._onAddPower.bind(this));
      html.find('.add-talent').click(this._onAddTalent.bind(this));
      html.find('.add-contact').click(this._onAddContact.bind(this));
      
      // Power info display
      html.find('.power-info, .power-image').click(this._onPowerInfo.bind(this));
      
      // Power roll
      html.find('.power-roll').click(this._onPowerRoll.bind(this));
      
      // Browse compendium
      html.find('.browse-compendium').click(this._onBrowseCompendium.bind(this));
      
      // FEAT rolls
      html.find('.feat-roll').click(this._onFeatRoll.bind(this));
      
      // Add drag-drop handling
      this._addDragDropListeners(html);
      
      // Debug: Log information about powers
      console.log("Powers count:", this.actor.items.filter(i => i.type === "power").length);
      console.log("First tab:", html.find('.tabs-navigation a:first').data('tab'));
    }

/**
 * Handle clicking on a power's info icon or image
 * @param {Event} event The originating click event
 * @private
 */
_onPowerInfo(event) {
  event.preventDefault();
  const itemId = event.currentTarget.dataset.itemId;
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  const content = `
    <div class="power-info-dialog">
      <h2>${item.name}</h2>
      <div class="power-details">
        <div class="label">Rank:</div>
        <div class="value">${item.system.rank || 'None'}</div>
        
        <div class="label">Value:</div>
        <div class="value">${item.system.value || '0'}</div>
        
        <div class="label">Range:</div>
        <div class="value">${item.system.range || 'None'}</div>
        
        <div class="label">Type:</div>
        <div class="value">${item.system.type || 'None'}</div>
        
        <div class="label">Source:</div>
        <div class="value">${item.system.source || 'None'}</div>
      </div>
      
      <div class="description">
        ${item.system.description || 'No description available.'}
      </div>
    </div>
  `;
  
  new Dialog({
    title: `Power Information: ${item.name}`,
    content: content,
    buttons: {
      close: {
        icon: '<i class="fas fa-check"></i>',
        label: "Close"
      }
    },
    default: "close"
  }).render(true);
}

/**
 * Handle power roll button click
 * @param {Event} event The originating click event
 * @private
 */
_onPowerRoll(event) {
  event.preventDefault();
  const itemId = event.currentTarget.dataset.itemId;
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  // Call rollItem method from the item
  if (typeof item.rollItem === 'function') {
    item.rollItem();
  } else {
    // Fallback if item doesn't have rollItem method
    const roll = new Roll("1d100").evaluate({async: false});
    const rank = item.system.rank || "Typical";
    const result = game.msh.rollUniversalTable(rank, roll.total);
    
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <h3>${item.name} (${rank})</h3>
        <div>Roll: ${roll.total}</div>
        <div>Result: <span style="color:green">${result}</span></div>
        <div>${item.system.description || ''}</div>
      `
    });
  }
}

/**
 * Handle browsing a compendium
 * @param {Event} event The originating click event 
 * @private
 */
_onBrowseCompendium(event) {
  event.preventDefault();
  const type = event.currentTarget.dataset.type;
  
  const packKey = `msh-faserip.${type}`;
  const pack = game.packs.get(packKey);
  
  if (!pack) {
    ui.notifications.error(`Compendium pack ${packKey} not found.`);
    return;
  }
  
  pack.render(true);
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
      system: {
        rank: "Typical",
        description: ""
      }
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
    
    try {
      // Get dropped data
      let data;
      try {
        data = JSON.parse(event.dataTransfer.getData('text/plain'));
        console.log("Drop data:", data); // Debugging
      } catch (err) {
        console.error("Could not parse drop data:", err);
        return false;
      }
      
      if (!data) {
        console.warn("No data in drop event");
        return false;
      }
      
      if (data.type !== "Item") {
        console.warn("Dropped data is not an item:", data.type);
        return false;
      }
      
      // Handle dropped Item
      let item;
      
      // First try direct UUID retrieval (most reliable)
      if (data.uuid) {
        try {
          item = await fromUuid(data.uuid);
          console.log("Retrieved item via UUID:", item);
        } catch (err) {
          console.error("Error retrieving item via UUID:", err);
        }
      }
      
      // If no item found yet, try pack + id
      if (!item && data.pack) {
        try {
          const pack = game.packs.get(data.pack);
          if (pack) {
            item = await pack.getDocument(data.id);
            console.log("Retrieved item from pack:", item);
          } else {
            console.warn("Pack not found:", data.pack);
          }
        } catch (err) {
          console.error("Error retrieving item from pack:", err);
        }
      }
      
      // Last resort - try world item collection
      if (!item && data.id) {
        item = game.items.get(data.id);
        console.log("Retrieved world item:", item);
      }
      
      if (!item) {
        console.error("Could not retrieve item from drop data:", data);
        ui.notifications.error("Could not find the dropped item.");
        return false;
      }
      
      // Create the owned item
      console.log("Creating embedded document from:", item.toObject());
      return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    } catch (err) {
      console.error("Uncaught error in drop handler:", err);
      ui.notifications.error("Error processing dropped item.");
      return false;
    }
  }
}