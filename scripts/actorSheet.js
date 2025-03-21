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
    context.talents = this.actor.items.filter(item => item.type === "talent") || [];
    // Add this line to get contacts
    context.contacts = this.actor.items.filter(item => item.type === "contact") || [];
    
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

// Edit power button - more specific selector
html.find('.powers-table .item-edit').click(ev => {
  const li = $(ev.currentTarget).closest(".power-row");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (item) {
    item.sheet.render(true);
  }
});

// Delete power button - more specific selector
html.find('.powers-table .item-delete').click(ev => {
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

///////////////////////////////////////////////////////////////////////////////////////////
// Add Talent button
///////////////////////////////////////////////////////////////////////////////////////////
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

// Talent info button
html.find('.talent-info').click(ev => {
  const li = $(ev.currentTarget).closest(".talent-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  // Create a dialog to show talent information
  let content = `
    <h2>${item.name}</h2>
    <div class="talent-details">
      <div class="label">Bonus:</div><div>${item.system.bonus || 'None'}</div>
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Specialty:</div><div>${item.system.specialty || 'None'}</div>
      <div class="label">Ability Modified:</div><div>${item.system.abilityModified ? item.system.abilityModified.charAt(0).toUpperCase() + item.system.abilityModified.slice(1) : 'None'}</div>
    </div>
    <div class="description">${item.system.description || 'No description available.'}</div>
  `;
  
  new Dialog({
    title: "Talent Information",
    content: content,
    buttons: {
      close: {
        label: "Close"
      }
    },
    width: 400
  }).render(true);
});
  
// Edit talent button
html.find('.talents-list .item-edit').click(ev => {
  const li = $(ev.currentTarget).closest(".talent-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (item) {
    item.sheet.render(true);
  }
});

// Delete talent button
html.find('.talents-list .item-delete').click(ev => {
  const li = $(ev.currentTarget).closest(".talent-item");
  const itemId = li.data("itemId");
  
  if (!itemId) return;
  
  // Confirm deletion
  new Dialog({
    title: "Delete Talent",
    content: "<p>Are you sure you want to delete this talent?</p>",
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

// Talent roll button
// Talent roll button
html.find('.talent-roll').click(async ev => { // Changed to async
  const li = $(ev.currentTarget).closest(".talent-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
 
  if (!item) return;
 
  // Get ability and bonus information
  let abilityModified = item.system.abilityModified;
  let abilityRank = abilityModified ? this.actor.system.abilities[abilityModified].rank : "Typical";
  
  // Determine column shifts based on bonus
  let columnShifts = 0;
  switch(item.system.bonus) {
    case "+1CS": columnShifts = 1; break;
    case "+2CS": columnShifts = 2; break;
    case "+3CS": columnShifts = 3; break;
    case "Special": 
      // Handle special talents
      columnShifts = 1; // Default to +1CS for Special
      break;
  }
  
  // Apply column shifts to get effective rank
  let effectiveRank = abilityRank;
  if (columnShifts !== 0) {
    const ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];
    const index = ranks.indexOf(abilityRank);
    if (index !== -1) {
      const newIndex = Math.min(Math.max(index + columnShifts, 0), ranks.length - 1);
      effectiveRank = ranks[newIndex];
      console.log(`Applied ${columnShifts} column shifts to ${abilityRank}, now ${effectiveRank}`);
    }
  }
  
  // Roll the dice
  const roll = new Roll("1d100");
  await roll.evaluate(); // Changed to await evaluation
  
  // Get result from universal table
  const resultColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
  
  // Format ability name for display
  const abilityName = abilityModified ? 
    abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) : 
    "None";
  
  // Create formatted description text
  let description = "";
  if (item.system.type === "Weapon Skill" && item.system.specialty === "Blunt Weapons") {
    description = "Characters with this Talent gain a +1CS to hit when attacking with a weapon that resolves attacks on the Blunt Attacks column of the Battle Effects Table.";
  }
  
  let content = `
    <div class="faserip-talent-roll">
      <h3>${item.name}</h3>
      <div class="roll-info">
        <div><strong>Talent:</strong> ${item.system.type || 'Unknown'} ${item.system.specialty ? '- ' + item.system.specialty : ''}</div>
        <div><strong>Base Ability:</strong> ${abilityName} (${abilityRank})</div>
        ${columnShifts !== 0 ? `<div><strong>Column Shift:</strong> ${columnShifts > 0 ? '+' : ''}${columnShifts} → ${effectiveRank}</div>` : ''}
        <div><strong>Roll:</strong> ${roll.total}</div>
      </div>
      <div class="result result-${resultColor.toLowerCase()}">
        ${resultColor.toUpperCase()}
      </div>
      ${description ? `
      <div class="description">
        ${description}
      </div>` : ''}
      ${item.system.description ? `
      <div class="talent-description">
        <strong>Description:</strong> ${item.system.description}
      </div>` : ''}
    </div>
    <style>
      .faserip-talent-roll {
        font-family: Arial, sans-serif;
        background: #f9f8f4;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 8px;
      }
      .faserip-talent-roll h3 {
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
        margin-bottom: 5px;
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
      .description, .talent-description {
        font-size: 0.9em;
        border-top: 1px solid #eee;
        padding-top: 5px;
        margin-top: 5px;
      }
    </style>
  `;
  
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: content,
    roll: roll
  });
});;

////////////////////////////////////////////////////////////////////////////////////////
// Add Contact button
////////////////////////////////////////////////////////////////////////////////////////
// Add Contact button
html.find('.add-contact').click(ev => {
  console.log("Add Contact button clicked"); // Debug line
  
  // Create the new contact item data
  const itemData = {
    name: "New Contact",
    type: "contact", 
    system: {
      description: "",
      type: "",
      disposition: "Friendly",
      specialties: [],
      location: "",
      notes: "" // Add notes field
    }
  };
  
  this.actor.createEmbeddedDocuments("Item", [itemData])
  .then(() => {
    console.log("Contact created successfully");
    this.render(false); // Re-render the sheet to show the new contact
  })
  .catch(err => console.error("Error creating contact:", err));
});

// Browse Contacts Compendium button
html.find('.browse-compendium[data-type="contacts"]').click(ev => {
  const pack = game.packs.find(p => p.metadata.name === "contacts" && p.metadata.system === "msh-faserip");
  if (pack) {
    pack.render(true);
  } else {
    ui.notifications.warn("Contacts compendium not found.");
  }
});

// Contact info button
// Contact info button
html.find('.contact-info').click(ev => {
  const li = $(ev.currentTarget).closest(".contact-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  // Create a dialog to show contact information
  let content = `
    <h2>${item.name}</h2>
    <div class="contact-details">
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Disposition:</div><div>${item.system.disposition || 'Friendly'}</div>
      <div class="label">Location:</div><div>${item.system.location || 'Unknown'}</div>
    </div>
    
    ${item.system.notes ? `
    <div class="contact-notes">
      <h3>Notes:</h3>
      <div>${item.system.notes}</div>
    </div>
    ` : ''}
    
    <div class="contact-description">
      <h3>Description:</h3>
      <div>${item.system.description || 'No description available.'}</div>
    </div>
  `;
  
  new Dialog({
    title: "Contact Information",
    content: content,
    buttons: {
      close: {
        label: "Close"
      }
    },
    width: 400
  }).render(true);
});;

// Edit contact button
html.find('.contacts-list .item-edit').click(ev => {
  const li = $(ev.currentTarget).closest(".contact-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (item) {
    item.sheet.render(true);
  }
});

// Delete contact button
html.find('.contacts-list .item-delete').click(ev => {
  const li = $(ev.currentTarget).closest(".contact-item");
  const itemId = li.data("itemId");
  
  if (!itemId) return;
  
  // Confirm deletion
  new Dialog({
    title: "Delete Contact",
    content: "<p>Are you sure you want to delete this contact?</p>",
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

// Contact roll button
html.find('.contact-roll').click(ev => {
  const li = $(ev.currentTarget).closest(".contact-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  // Create a simple dialog showing contact roll result
  const roll = new Roll("1d100").evaluate({async: false});
  
  // Determine disposition color
  let dispositionColor = "#999";
  switch (item.system.disposition) {
    case "Friendly": dispositionColor = "#4CAF50"; break;
    case "Neutral": dispositionColor = "#2196F3"; break;
    case "Suspicious": dispositionColor = "#FF9800"; break;
    case "Hostile": dispositionColor = "#F44336"; break;
  }
  
  let content = `
    <div class="faserip-contact-roll">
      <h3>${item.name}</h3>
      <div class="roll-info">
        <div><strong>Type:</strong> ${item.system.type || 'Unknown'}</div>
        <div><strong>Disposition:</strong> <span style="color: ${dispositionColor};">${item.system.disposition || 'Friendly'}</span></div>
        <div><strong>Roll:</strong> ${roll.total}</div>
      </div>
      <div class="result">
        ${roll.total <= 50 ? "Contact provides help/information" : "Contact is unavailable or unwilling"}
      </div>
    </div>
    <style>
      .faserip-contact-roll {
        font-family: Arial, sans-serif;
        background: #f9f8f4;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 8px;
      }
      .faserip-contact-roll h3 {
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
        background: #f0f0f0;
        border: 1px solid #ccc;
      }
    </style>
  `;

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: content,
    roll: roll
  });
});

  // Continue with other listeners...
}
}