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
// In actorSheet.js, update the talent-roll click handler
// In actorSheet.js, update the talent-roll click handler
html.find('.talent-roll').click(async ev => {
  const li = $(ev.currentTarget).closest(".talent-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
 
  if (!item) return;

  // Get talent bonus as column shift value
  let talentBonus = 0;
  switch(item.system.bonus) {
    case "+1CS": talentBonus = 1; break;
    case "+2CS": talentBonus = 2; break;
    case "+3CS": talentBonus = 3; break;
    case "Special": talentBonus = 1; break; // Default for special
    default: talentBonus = 0;
  }

  // Define action options based on talent type
  let actionOptions = [];
  
  // Get talent type and specialty
  const talentType = item.system.type || "";
  const talentSpecialty = item.system.specialty || "";
  
  // Assign appropriate action types based on talent type
  if (talentType === "Weapon Skill") {
    // Weapon skill actions
    if (talentSpecialty === "Blunt Weapons") {
      actionOptions = [
        { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" }
      ];
    } else if (talentSpecialty === "Sharp Weapons" || talentSpecialty === "Edged Weapons") {
      actionOptions = [
        { value: "Edged Attack (EA)", label: "Edged Attack (EA)" }
      ];
    } else if (talentSpecialty === "Thrown Weapons" || talentSpecialty === "Bows") {
      actionOptions = [
        { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" }
      ];
    } else {
      // Generic weapon options
      actionOptions = [
        { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" },
        { value: "Edged Attack (EA)", label: "Edged Attack (EA)" },
        { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" }
      ];
    }
  } else if (talentType === "Fighting Skill") {
    // Fighting skill actions
    actionOptions = [
      { value: "Grappling (GP)", label: "Grappling (GP)" },
      { value: "Grabbing (Gb)", label: "Grabbing (Gb)" },
      { value: "Escaping (ES)", label: "Escaping (ES)" },
      { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" }
    ];
  } else if (talentType === "Professional Skill") {
    // Professional skill actions
    actionOptions = [
      { value: "Knowledge Check", label: "Knowledge Check" },
      { value: "Practical Application", label: "Practical Application" }
    ];
  } else if (talentType === "Scientific Skill") {
    // Scientific skill actions
    actionOptions = [
      { value: "Analysis", label: "Analysis" },
      { value: "Research", label: "Research" },
      { value: "Technical Application", label: "Technical Application" }
    ];
  } else if (talentType === "Mystic/Mental Skill") {
    // Mystic/Mental skill actions
    actionOptions = [
      { value: "Mental Power", label: "Mental Power" },
      { value: "Mystical Knowledge", label: "Mystical Knowledge" }
    ];
  } else {
    // Default/generic options
    actionOptions = [
      { value: "Skill Use", label: "Skill Use" },
      { value: "Knowledge Check", label: "Knowledge Check" }
    ];
  }
  
  // Create action type options HTML
  const actionOptionsHTML = actionOptions.map(option => 
    `<option value="${option.value}">${option.label}</option>`
  ).join('');
  
  // Create dialog for roll options
  let dialogContent = `
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Action Type:</label>
    <select id="action-type" name="actionType" style="width: 180px;">
      ${actionOptionsHTML}
    </select>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Talent Bonus:</label>
    <input type="number" id="talent-bonus" name="talentBonus" value="${talentBonus}" style="width: 50px;" readonly>
    <span style="color: #666; font-size: 0.9em;">(${item.system.bonus})</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Extra Column Shift:</label>
    <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
    <span style="color: #666; font-size: 0.9em;">(additional +/- CS)</span>
  </div>
  <div>
    <label style="display: inline-block; width: 120px;">Karma Points:</label>
    <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
  </div>`;

  new Dialog({
    title: `Talent Roll: ${item.name}`,
    content: dialogContent,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const actionType = html.find('[name="actionType"]').val();
          const talentBonus = parseInt(html.find('[name="talentBonus"]').val()) || 0;
          const extraShift = parseInt(html.find('[name="shift"]').val()) || 0;
          const karma = parseInt(html.find('[name="karma"]').val()) || 0;
          
          // Total column shift is talent bonus plus any extra shifts
          const totalColumnShift = talentBonus + extraShift;
          
          // Get ability information
          let abilityModified = item.system.abilityModified;
          let abilityRank = abilityModified ? this.actor.system.abilities[abilityModified].rank : "Typical";
          let abilityValue = abilityModified ? this.actor.system.abilities[abilityModified].value : 6;
          
          // Apply column shifts to get effective rank
          let effectiveRank = abilityRank;
          if (totalColumnShift !== 0) {
            const ranks = [
              "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
              "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
              "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
            ];
            const index = ranks.indexOf(abilityRank);
            if (index !== -1) {
              const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1);
              effectiveRank = ranks[newIndex];
              console.log(`Applied ${totalColumnShift} column shifts to ${abilityRank}, now ${effectiveRank}`);
            }
          }
          
          // Roll the dice
          const roll = await new Roll("1d100").evaluate();
          const totalRoll = roll.total + karma;
          
          // Get result from universal table
          const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
          
          // Format ability name for display
          const abilityName = abilityModified ? 
            abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) : 
            "None";
          
          // Define action types and results based on color
          const ACTIONS = {
            // Combat results
            "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
            "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
            "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
            "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
            "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
            "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
            
            // Non-combat results
            "Knowledge Check": { white: "No Knowledge", green: "Basic Knowledge", yellow: "Good Knowledge", red: "Expert Knowledge" },
            "Practical Application": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" },
            "Analysis": { white: "Failed Analysis", green: "Basic Analysis", yellow: "Detailed Analysis", red: "Complete Analysis" },
            "Research": { white: "No Results", green: "Basic Results", yellow: "Good Results", red: "Breakthrough" },
            "Technical Application": { white: "Failure", green: "Works Minimally", yellow: "Works Well", red: "Works Perfectly" },
            "Mental Power": { white: "No Effect", green: "Minor Effect", yellow: "Moderate Effect", red: "Major Effect" },
            "Mystical Knowledge": { white: "No Insight", green: "Minor Insight", yellow: "Significant Insight", red: "Complete Insight" },
            "Skill Use": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" }
          };
          
          // Get the result text - if action type doesn't have specific results, use color names
          let resultText = "";
          if (ACTIONS[actionType]) {
            resultText = ACTIONS[actionType][resultColor.toLowerCase()];
          } else {
            resultText = resultColor.toUpperCase();
          }
          
          // Create chat message styled to match screenshot
          let content = `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
              <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>${this.actor.name} - ${abilityName} Roll (${actionType})</strong>
              </div>
              <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                <div>Column Shift: ${totalColumnShift} → ${effectiveRank}</div>
                <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
              </div>
              <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' : 
                                   resultColor.toLowerCase() === 'green' ? '#4CAF50' : 
                                   resultColor.toLowerCase() === 'yellow' ? '#FFD700' : 
                                   '#F44336'}; 
                color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                ${resultText} (${resultColor.toUpperCase()})
              </div>
            </div>
          `;
          
          // Send to chat
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: content,
            roll: roll
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  }).render(true);
});

////////////////////////////////////////////////////////////////////////////////////////
// Add Contact button
////////////////////////////////////////////////////////////////////////////////////////
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
// Contact roll button - updated to match screenshot styling
html.find('.contact-roll').click(async ev => {
  const li = $(ev.currentTarget).closest(".contact-item");
  const itemId = li.data("itemId");
  const item = this.actor.items.get(itemId);
  
  if (!item) return;
  
  // Create a dialog for roll options
  let dialogContent = `
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Action Type:</label>
    <select id="action-type" name="actionType" style="width: 180px;">
      <option value="Availability">Contact Availability</option>
      <option value="Information">Information Request</option>
      <option value="Favor">Favor Request</option>
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
  </div>`;

  new Dialog({
    title: `Contact Roll: ${item.name}`,
    content: dialogContent,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const actionType = html.find('[name="actionType"]').val();
          const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
          const karma = parseInt(html.find('[name="karma"]').val()) || 0;
          
          // Determine base rank based on disposition
          let baseRank = "Typical";
          switch (item.system.disposition) {
            case "Friendly": baseRank = "Good"; break;
            case "Neutral": baseRank = "Typical"; break;
            case "Suspicious": baseRank = "Poor"; break;
            case "Hostile": baseRank = "Feeble"; break;
          }
          
          // Apply column shifts
          let effectiveRank = baseRank;
          if (columnShift !== 0) {
            const ranks = [
              "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
              "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
            ];
            const index = ranks.indexOf(baseRank);
            if (index !== -1) {
              const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
              effectiveRank = ranks[newIndex];
            }
          }
          
          // Roll the dice
          const roll = await new Roll("1d100").evaluate();
          const totalRoll = roll.total + karma;
          
          // Get result from universal table
          const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
          
          // Define contact results based on color and action type
          const ACTIONS = {
            "Availability": { 
              white: "Unavailable", 
              green: "Available (Limited)", 
              yellow: "Available", 
              red: "Eager to Help" 
            },
            "Information": { 
              white: "No Information", 
              green: "Limited Information", 
              yellow: "Good Information", 
              red: "Excellent Information" 
            },
            "Favor": { 
              white: "Refuses", 
              green: "Small Favor Only", 
              yellow: "Willing to Help", 
              red: "Goes Above and Beyond" 
            }
          };
          
          // Get the result text
          const resultText = ACTIONS[actionType][resultColor.toLowerCase()];
          
          // Create chat message styled to match screenshot
          let content = `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
              <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>${this.actor.name} - Contact: ${item.name} (${actionType})</strong>
              </div>
              <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Base Rank: ${baseRank}</div>
                <div>Column Shift: ${columnShift} → ${effectiveRank}</div>
                <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
              </div>
              <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' : 
                                   resultColor.toLowerCase() === 'green' ? '#4CAF50' : 
                                   resultColor.toLowerCase() === 'yellow' ? '#FFD700' : 
                                   '#F44336'}; 
                color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                ${resultText} (${resultColor.toUpperCase()})
              </div>
            </div>
          `;
          
          // Send to chat
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: content,
            roll: roll
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  }).render(true);
});

  // Continue with other listeners...
}
}