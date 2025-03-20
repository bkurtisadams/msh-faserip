export class FaseripActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      width: 600,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      // Two key options for form submission:
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

/** @override */
static get defaultOptions() {
  return foundry.utils.mergeObject(super.defaultOptions, {
    classes: ["faserip-sheet", "sheet", "actor"],
    width: 600,
    height: 700,
    tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
    template: "systems/msh-faserip/templates/actor-sheet.html",
    submitOnChange: true  // This is crucial
  });
}

/** @override */
getData() {
  const context = super.getData();

  // Log current data state for debugging
  console.log("Current actor data before preparing sheet:", this.actor.system);

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

  console.log("Sheet context prepared:", context); // Debug logging

  return context;
}

/** @override */
/** @override */
async _updateObject(event, formData) {
  console.log("Form submission triggered:", event.type);
  console.log("Form data received:", formData);
  
  // Explicitly expand the object to handle nested properties
  const expandedData = foundry.utils.expandObject(formData);
  console.log("Expanded data:", expandedData);
  
  // Update with the expanded data
  return super._updateObject(event, expandedData);
}

/** @override */
activateListeners(html) {
  super.activateListeners(html);
  
  // Connect all form inputs to trigger form submission on change
  html.find('input, select, textarea').change(this._onChangeInput.bind(this));
  
  // Special handler for the group save button
  html.find('.save-group').click(this._onSaveGroup.bind(this));
  
  // DEBUG - Log what tab elements we're finding
  console.log("Tabs object:", this._tabs[0]);
  console.log("Tab navigation:", html.find('.sheet-tabs-navigation .item').length);
  console.log("Tab content:", html.find('.tab').length);
  
  // Activate tabs - use Foundry's system but with correct selectors
  const tabs = this._tabs[0];
  if (tabs) {
    // Manually set the active tab
    const activeTab = tabs.active || "powers";
    html.find(`.sheet-tabs-navigation .item[data-tab="${activeTab}"]`).addClass("active");
    html.find(`.tab[data-tab="${activeTab}"]`).addClass("active");
    
    // Click handler that works with the sheet structure
    html.find('.sheet-tabs-navigation .item').click(ev => {
      ev.preventDefault();
      const tabName = ev.currentTarget.dataset.tab;
      if (!tabName) return;
      
      // Update UI classes
      html.find('.sheet-tabs-navigation .item').removeClass("active");
      html.find('.tab').removeClass("active");
      ev.currentTarget.classList.add("active");
      html.find(`.tab[data-tab="${tabName}"]`).addClass("active");
      
      // Update tab state
      tabs.active = tabName;
    });
  }
  
  // Item management
  html.find('.item-edit').click(this._onItemEdit.bind(this));
  html.find('.item-delete').click(this._onItemDelete.bind(this));
  html.find('.add-power').click(this._onAddPower.bind(this));
  html.find('.add-talent').click(this._onAddTalent.bind(this));
  html.find('.add-contact').click(this._onAddContact.bind(this));
  html.find('.add-equipment').click(this._onAddEquipment.bind(this));
  html.find('.add-vehicle').click(this._onAddVehicle.bind(this));
  html.find('.add-headquarters').click(this._onAddHeadquarters.bind(this));
  html.find('.add-resistance').click(this._onAddResistance.bind(this));
  html.find('.delete-resistance').click(this._onDeleteResistance.bind(this));

  // Power info display
  html.find('.power-info, .power-image').click(this._onPowerInfo.bind(this));

  // Power roll
  html.find('.power-roll').click(this._onPowerRoll.bind(this));

  // Browse compendium
  html.find('.browse-compendium').click(this._onBrowseCompendium.bind(this));

  // FEAT rolls
  html.find('.feat-roll').click(this._onFeatRoll.bind(this));

  // Karma management
  html.find('.karma-history').click(this._onKarmaHistory.bind(this));
  html.find('.karma-advancement').click(this._onKarmaAdvancement.bind(this));

  // Add drag-drop handling
  this._addDragDropListeners(html);

  // Debug: Log information about powers
  console.log("Powers count:", this.actor.items.filter(i => i.type === "power").length);
  console.log("First tab:", html.find('.tabs-navigation a:first').data('tab'));
}

/**
 * Handle input changes on the sheet
 * @param {Event} event   The originating change event
 * @private
 */
_onChangeInput(event) {
  // Don't prevent default - let the form handle submission
  // Just log for debugging
  console.log(`Input changed: ${event.currentTarget.name} = ${event.currentTarget.value}`);
  
  // If this is the special group field that doesn't use 'name' attribute
  if (event.currentTarget.id === "special-group-field") {
    const value = event.currentTarget.value;
    console.log("Special group field changed:", value);
  }
}

/**
 * Handle saving the group field manually
 * @param {Event} event   The originating click event
 * @private
 */
_onSaveGroup(event) {
  event.preventDefault();
  const groupField = document.getElementById("special-group-field");
  if (!groupField) return;
  
  const value = groupField.value;
  const dataField = groupField.dataset.field || "system.group";
  
  console.log(`Saving special group field: ${dataField} = ${value}`);
  
  // Create update data object with the correct path
  const updateData = {};
  updateData[dataField] = value;
  
  // Update the actor
  this.actor.update(updateData)
    .then(() => {
      ui.notifications.info("Group affiliation saved successfully!");
      console.log("Group update SUCCESS");
      console.log("Actor system after update:", foundry.utils.deepClone(this.actor.system));
    })
    .catch(err => {
      console.error("Group update FAILED:", err);
      ui.notifications.error("Failed to save group affiliation.");
    });
}

/**
 * Add a new resistance to the actor
 * @param {Event} event   The originating click event
 * @private
 */
_onAddResistance(event) {
  event.preventDefault();
  
  // Initialize resistances array if it doesn't exist
  const resistances = this.actor.system.resistances || [];
  
  // Create a new resistance with default values
  const newResistance = {
    type: "physical",
    rank: "Good",
    value: 10
  };
  
  // Add to the array
  resistances.push(newResistance);
  
  // Update the actor
  this.actor.update({
    "system.resistances": resistances
  })
    .then(() => ui.notifications.info("Resistance added."))
    .catch(err => {
      console.error("Failed to add resistance:", err);
      ui.notifications.error("Failed to add resistance.");
    });
}

/**
 * Delete a resistance from the actor
 * @param {Event} event   The originating click event
 * @private
 */
_onDeleteResistance(event) {
  event.preventDefault();
  const index = event.currentTarget.dataset.index;
  if (index === undefined) return;
  
  // Get current resistances
  const resistances = foundry.utils.deepClone(this.actor.system.resistances || []);
  
  // Remove the resistance at the given index
  resistances.splice(index, 1);
  
  // Update the actor
  this.actor.update({
    "system.resistances": resistances
  })
    .then(() => ui.notifications.info("Resistance removed."))
    .catch(err => {
      console.error("Failed to remove resistance:", err);
      ui.notifications.error("Failed to remove resistance.");
    });
}

/**
 * Add a new equipment item to the actor
 * @param {Event} event   The originating click event
 * @private
 */
_onAddEquipment(event) {
  event.preventDefault();
  this.actor.createEmbeddedDocuments("Item", [{
    name: "New Equipment",
    type: "equipment",
    system: {
      materialStrength: "Typical",
      description: ""
    }
  }]);
}

/**
 * Add a new vehicle item to the actor
 * @param {Event} event   The originating click event
 * @private
 */
_onAddVehicle(event) {
  event.preventDefault();
  this.actor.createEmbeddedDocuments("Item", [{
    name: "New Vehicle",
    type: "vehicle",
    system: {
      speed: 0,
      materialStrength: "Typical",
      description: ""
    }
  }]);
}

/**
 * Add a new headquarters item to the actor
 * @param {Event} event   The originating click event
 * @private
 */
_onAddHeadquarters(event) {
  event.preventDefault();
  this.actor.createEmbeddedDocuments("Item", [{
    name: "New Headquarters",
    type: "headquarters",
    system: {
      location: "",
      materialStrength: "Typical",
      description: ""
    }
  }]);
}

/**
 * Display karma history dialog
 * @param {Event} event   The originating click event
 * @private
 */
_onKarmaHistory(event) {
  event.preventDefault();
  
  const karmaHistory = this.actor.system.karma?.history || [];
  
  let content = `<h3>Karma History</h3>`;
  if (karmaHistory.length === 0) {
    content += `<p>No karma history recorded yet.</p>`;
  } else {
    content += `<table class="karma-history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Amount</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>`;
      
    karmaHistory.forEach(entry => {
      content += `<tr>
        <td>${entry.date}</td>
        <td>${entry.amount > 0 ? '+' : ''}${entry.amount}</td>
        <td>${entry.reason}</td>
      </tr>`;
    });
    
    content += `</tbody></table>`;
  }
  
  new Dialog({
    title: "Karma History",
    content: content,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Close"
      }
    },
    default: "close"
  }).render(true);
}

/**
 * Display karma advancement dialog
 * @param {Event} event   The originating click event
 * @private
 */
_onKarmaAdvancement(event) {
  event.preventDefault();
  
  const advancement = this.actor.system.karma?.advancement || 0;
  
  const content = `
    <h3>Karma Advancement</h3>
    <p>Current advancement pool: ${advancement}</p>
    <p>Choose an ability to advance:</p>
    <div class="karma-advancement-options">
      <button class="advance-ability" data-ability="fighting">Fighting</button>
      <button class="advance-ability" data-ability="agility">Agility</button>
      <button class="advance-ability" data-ability="strength">Strength</button>
      <button class="advance-ability" data-ability="endurance">Endurance</button>
      <button class="advance-ability" data-ability="reason">Reason</button>
      <button class="advance-ability" data-ability="intuition">Intuition</button>
      <button class="advance-ability" data-ability="psyche">Psyche</button>
    </div>
  `;
  
  const dialog = new Dialog({
    title: "Karma Advancement",
    content: content,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Close"
      }
    },
    default: "close",
    render: html => {
      html.find('.advance-ability').click(async (ev) => {
        const ability = ev.currentTarget.dataset.ability;
        // Logic for handling ability advancement would go here
        dialog.close();
      });
    }
  });
  
  dialog.render(true);
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
      const roll = new Roll("1d100").evaluate({ async: false });
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