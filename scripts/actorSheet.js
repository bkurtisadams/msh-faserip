export class FaseripActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      width: 600,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    const actorData = this.actor.toObject(false);
    
    context.system = actorData.system;
    
    // Get items sorted by type for display in the template
    context.powers = this.actor.items.filter(item => item.type === "power") || [];
    // Add this line to get talents
    context.talents = this.actor.items.filter(item => item.type === "talent") || [];
    
    return context;
  }

  /** @override */
  _updateObject(event, formData) {
    // Expand the form data
    const expandedData = foundry.utils.expandObject(formData);
    
    // Call the parent update
    return super._updateObject(event, expandedData);
  }

  // In actorSheet.js, add to the activateListeners function
  activateListeners(html) {
    super.activateListeners(html);
    
    // Add Power button - more direct approach
    html.find('.add-power').click(ev => {
      console.log("Add Power button clicked"); // Debug line
      
      // Create the new power item data
      const itemData = {
        name: "New Power",
        type: "power", 
        system: {
          description: "",
          rank: "Typical",
          value: 6,
          range: "",
          type: "",
          subtype: "",
          isActive: true
        }
      };
      
      this.actor.createEmbeddedDocuments("Item", [itemData])
      .then(() => {
        console.log("Power created successfully");
        this.render(false); // Re-render the sheet to show the new power
      })
      .catch(err => console.error("Error creating power:", err));
  });

  // Browse Powers Compendium button
  html.find('.browse-compendium[data-type="powers"]').click(ev => {
    const pack = game.packs.find(p => p.metadata.name === "powers" && p.metadata.system === "msh-faserip");
    if (pack) {
      pack.render(true);
    } else {
      ui.notifications.warn("Powers compendium not found.");
    }
  });

  // In actorSheet.js, add to your activateListeners function

// Power info button
html.find('.power-info').click(ev => {
  const li = $(ev.currentTarget).closest(".power-row");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  // Create a dialog to show power information
  let content = `
    <h2>${item.name}</h2>
    <div class="power-details">
      <div class="label">Rank:</div><div>${item.system.rank} (${item.system.value})</div>
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Range:</div><div>${item.system.range || 'None'}</div>
      <div class="label">Active:</div><div>${item.system.isActive ? 'Yes' : 'No'}</div>
    </div>
    <div class="description">${item.system.description || 'No description available.'}</div>
  `;
  
  new Dialog({
    title: "Power Information",
    content: content,
    buttons: {
      close: {
        label: "Close"
      }
    },
    width: 400
  }).render(true);
});

// Edit power button
html.find('.item-edit').click(ev => {
  const li = $(ev.currentTarget).closest(".power-row");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (item) {
    item.sheet.render(true);
  }
});

// Delete power button
html.find('.item-delete').click(ev => {
  const li = $(ev.currentTarget).closest(".power-row");
  const itemId = li.data("itemId");
  
  // Confirm deletion
  new Dialog({
    title: "Delete Power",
    content: "<p>Are you sure you want to delete this power?</p>",
    buttons: {
      delete: {
        icon: '<i class="fas fa-trash"></i>',
        label: "Delete",
        callback: () => {
          this.actor.deleteEmbeddedDocuments("Item", [itemId]);
          this.render(false);
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel"
      }
    },
    default: "cancel"
  }).render(true);
});

// Roll power button
html.find('.power-roll').click(ev => {
  const li = $(ev.currentTarget).closest(".power-row");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (item && item.rollItem) {
    item.rollItem();
  } else {
    console.error("Could not roll power - item not found or rollItem method not available");
  }
});

// Add Talent button
html.find('.add-talent').click(ev => {
  console.log("Add Talent button clicked"); // Debug line
  
  // Create the new talent item data
  const itemData = {
    name: "New Talent",
    type: "talent", 
    system: {
      description: "",
      bonus: "+1CS",
      abilityModified: "",
      type: "",
      specialty: ""
    }
  };
  
  this.actor.createEmbeddedDocuments("Item", [itemData])
  .then(() => {
    console.log("Talent created successfully");
    this.render(false); // Re-render the sheet to show the new talent
  })
  .catch(err => console.error("Error creating talent:", err));
});

// Browse Talents Compendium button
html.find('.browse-compendium[data-type="talents"]').click(ev => {
  const pack = game.packs.find(p => p.metadata.name === "talents" && p.metadata.system === "msh-faserip");
  if (pack) {
    pack.render(true);
  } else {
    ui.notifications.warn("Talents compendium not found.");
  }
});
  
  // Continue with other listeners...
}
}