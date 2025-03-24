export class FaseripActorSheet extends ActorSheet {
  // Add a property to track the biography toggle state
  _isBiographyOpen = false;
  
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
    // get contacts
    context.contacts = this.actor.items.filter(item => item.type === "contact") || [];

    // the calculated current karma value
    context.currentKarma = this.actor.currentKarma;

    // the biography toggle state to the context
    context.isBiographyOpen = this._isBiographyOpen;

    // equipment
    context.equipment = this.actor.items.filter(item => item.type === "equipment") || [];

    return context;
  }

  /** @override */
  _updateObject(event, formData) {
    // Expand the form data
    const expandedData = foundry.utils.expandObject(formData);

    // Call the parent update
    return super._updateObject(event, expandedData);
  }

  _onDragStart(event) {
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (item) {
      // Set up the drag data
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Item",
        actorId: this.actor.id,
        itemId: item.id,
        uuid: item.uuid,
        data: item
      }));
    }
  }

  // In actorSheet.js, add to the activateListeners function
  activateListeners(html) {
    super.activateListeners(html);

    // Power rows draggable
    html.find('.power-row').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Talent rows draggable
    html.find('.talent-item').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Contact rows draggable
    html.find('.contact-item').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Equipment rows draggable
    html.find('.equipment-row').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Biography Toggle Button
    html.find('.biography-toggle').click(ev => {
      ev.preventDefault();
      // Toggle the biography open state
      this._isBiographyOpen = !this._isBiographyOpen;
      // Re-render the sheet
      this.render(false);
    });
    
    // Handle form changes in biography section
    html.find('.biography-details input, .biography-details textarea').change(ev => {
      const formData = this._getSubmitData();
      this.actor.update(formData);
    });

    // Karma History button
    html.find('.view-karma-history').click(ev => {
      // Import dynamically to avoid circular dependencies
      import('./karma.js').then(module => {
        const sheet = new module.KarmaSheet(this.actor);
        sheet.render(true);
      });
    });

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

    // Add Resistance listener
    html.find('.add-resistance').click(ev => {
      console.log("Add Resistance button clicked");

      // Check if resistances array exists, if not, create it
      const resistances = this.actor.system.resistances || [];

      // Create a new resistance object
      const newResistance = {
        type: "physical",  // Default type
        rank: "Good",      // Default rank
        value: 10          // Default value
      };

      // Add the new resistance to the array
      resistances.push(newResistance);

      // Update the actor with the new resistances array
      this.actor.update({ "system.resistances": resistances })
        .then(() => {
          console.log("Resistance added successfully");
          this.render(false); // Re-render the sheet to show the new resistance
        })
        .catch(err => console.error("Error adding resistance:", err));
    });

    // Add delete resistance listener
    html.find('.delete-resistance').click(ev => {
      const index = $(ev.currentTarget).data("index");
      console.log(`Delete resistance at index ${index}`);

      const resistances = duplicate(this.actor.system.resistances || []);

      // Remove the resistance at the specified index
      resistances.splice(index, 1);

      // Update the actor with the modified resistances array
      this.actor.update({ "system.resistances": resistances })
        .then(() => {
          console.log("Resistance deleted successfully");
          this.render(false); // Re-render the sheet
        })
        .catch(err => console.error("Error deleting resistance:", err));
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

      if (!item) {
        console.error("Could not find power item");
        return;
      }

      // Define action types based on power type
      let actionOptions = [];
      const powerType = item.system.type || "";

      // Determine appropriate action types based on the power
      if (powerType.includes("Energy") || powerType.includes("Fire") || powerType.includes("Electric")) {
        actionOptions = [
          { value: "Energy (En)", label: "Energy (En)" }
        ];
      } else if (powerType.includes("Force") || powerType.includes("Plasma") || powerType.includes("Sonic")) {
        actionOptions = [
          { value: "Force (Fo)", label: "Force (Fo)" }
        ];
      } else if (powerType.includes("Missile") || powerType.includes("Projectile")) {
        actionOptions = [
          { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" },
          { value: "Throwing Edged (TE)", label: "Throwing Edged (TE)" },
          { value: "Throwing Blunt (TB)", label: "Throwing Blunt (TB)" }
        ];
      } else if (powerType.includes("Mental") || powerType.includes("Psi")) {
        actionOptions = [
          { value: "Mental Attack", label: "Mental Attack" }
        ];
      } else {
        // Generic options for unknown power types
        actionOptions = [
          { value: "Energy (En)", label: "Energy (En)" },
          { value: "Force (Fo)", label: "Force (Fo)" },
          { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" },
          { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" },
          { value: "Edged Attack (EA)", label: "Edged Attack (EA)" },
          { value: "Grappling (GP)", label: "Grappling (GP)" },
          { value: "General Power Use", label: "General Power Use" }
        ];
      }

      // Get saved power settings (from item.system or flags)
      const savedActionType = item.getFlag("msh-faserip", "lastActionType") || "";
      const savedColumnShift = item.getFlag("msh-faserip", "lastColumnShift") || 0;
      const skipDiceRoll = item.getFlag("msh-faserip", "skipDiceRoll") || false;

      // Create action type options HTML, with saved option selected
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get the power's rank and value
      const powerRank = item.system.rank || "Typical";
      const powerValue = item.system.value || 6;

      // Create dialog for roll options
      let dialogContent = `
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Action Type:</label>
    <select id="action-type" name="actionType" style="width: 180px;">
      ${actionOptionsHTML}
    </select>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Power Rank:</label>
    <input type="text" id="power-rank" name="powerRank" value="${powerRank}" style="width: 100px;" readonly>
    <span style="margin-left: 5px;">(${powerValue})</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Column Shift:</label>
    <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
    <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Karma Points:</label>
    <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
  </div>
  <div style="margin-bottom: 10px;">
    <label>
      <input type="checkbox" id="save-settings" name="saveSettings" checked> 
      Remember these settings for future rolls
    </label>
  </div>
  <div>
    <label>
      <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
      Skip dice animation
    </label>
  </div>`;

      new Dialog({
        title: `Power Roll: ${item.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="actionType"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await item.setFlag("msh-faserip", "lastActionType", actionType);
                await item.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await item.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Apply column shifts to get effective rank
              let effectiveRank = powerRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
                  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
                ];
                const index = ranks.indexOf(powerRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                  console.log(`Applied ${columnShift} column shifts to ${powerRank}, now ${effectiveRank}`);
                }
              }

              // Create the roll
              const roll = new Roll("1d100");

              // Evaluate the roll
              await roll.evaluate();

              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} uses ${item.name}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }

              // Calculate the result
              const totalRoll = roll.total + karma;
              const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);

              // Define action types and results based on color
              const ACTIONS = {
                "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
                "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
                "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
                "Throwing Edged (TE)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
                "Throwing Blunt (TB)": { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
                "Energy (En)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
                "Force (Fo)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
                "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
                "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
                "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
                "Mental Attack": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" },
                "General Power Use": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
              };

              // Get the result text based on action type and color
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
                <strong>${this.actor.name} - ${item.name} (${actionType})</strong>
              </div>
              <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Base Rank: ${powerRank} (${powerValue})</div>
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
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
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
    html.find('.talent-roll').click(async ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Get talent bonus as column shift value
      let talentBonus = 0;
      switch (item.system.bonus) {
        case "+1CS": talentBonus = 1; break;
        case "+2CS": talentBonus = 2; break;
        case "+3CS": talentBonus = 3; break;
        case "Special": talentBonus = 1; break; // Default for special
        default: talentBonus = 0;
      }

      // Get saved talent settings
      const savedActionType = item.getFlag("msh-faserip", "lastActionType") || "";
      const savedExtraShift = item.getFlag("msh-faserip", "lastExtraShift") || 0;
      const skipDiceRoll = item.getFlag("msh-faserip", "skipDiceRoll") || false;

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
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
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
    <input type="number" id="shift" name="shift" value="${savedExtraShift}" style="width: 50px;">
    <span style="color: #666; font-size: 0.9em;">(additional +/- CS)</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Karma Points:</label>
    <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
  </div>
  <div style="margin-bottom: 10px;">
    <label>
      <input type="checkbox" id="save-settings" name="saveSettings" checked> 
      Remember these settings for future rolls
    </label>
  </div>
  <div>
    <label>
      <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
      Skip dice animation
    </label>
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
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await item.setFlag("msh-faserip", "lastActionType", actionType);
                await item.setFlag("msh-faserip", "lastExtraShift", extraShift);
                await item.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

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

              // Create the roll
              const roll = new Roll("1d100");

              // Evaluate the roll
              await roll.evaluate();

              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} uses ${item.name}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }

              // Calculate the result
              const totalRoll = roll.total + karma;
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
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content
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

    // Roll Contact button
    // Contact roll button
    html.find('.contact-roll').click(async ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Get saved contact settings
      const savedActionType = item.getFlag("msh-faserip", "lastActionType") || "Availability";
      const savedColumnShift = item.getFlag("msh-faserip", "lastColumnShift") || 0;
      const skipDiceRoll = item.getFlag("msh-faserip", "skipDiceRoll") || false;

      // Define contact action types
      const actionOptions = [
        { value: "Availability", label: "Availability" },
        { value: "Information", label: "Information Request" },
        { value: "Equipment", label: "Equipment Request" },
        { value: "Assistance", label: "Request Assistance" },
        { value: "Favor", label: "Request Favor" }
      ];

      // Create action type options HTML
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get the hero's popularity
      const heroPopularity = this.actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = this.actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = this.actor.system.powerOrigin === "mutant" || this.actor.system.isMutant;

      // Get contact type and determine potential resource level
      const contactType = item.system.type || "General";
      let resourceLevel = "Typical";

      // Determine resource level based on contact type (from your provided info)
      switch (contactType) {
        case "Law Enforcement": resourceLevel = "Remarkable"; break;
        case "Military": resourceLevel = "Amazing"; break;
        case "Business World": resourceLevel = "Incredible"; break;
        case "Journalism": resourceLevel = "Poor"; break;
        case "Crime":
          // Resources depend on level, let's assume Typical
          resourceLevel = "Typical";
          break;
        case "Espionage": resourceLevel = "Incredible"; break;
        case "Scientific": resourceLevel = "Good"; break;
        case "State": resourceLevel = "Remarkable"; break;
        case "National": resourceLevel = "Monstrous"; break;
        case "International": resourceLevel = "Monstrous"; break;
        case "Planetary": resourceLevel = "Unearthly"; break;
        default: resourceLevel = "Typical";
      }

      // Determine effective disposition (normally Friendly, but affected by negative popularity)
      let effectiveDisposition = "Friendly";
      if (heroPopularity < 0) {
        effectiveDisposition = "Neutral";
      }

      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly": requiredFeatColor = "Green"; break;
        case "Neutral": requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile": requiredFeatColor = "Impossible"; break;
      }

      // Create dialog for roll options
      let dialogContent = `
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Request Type:</label>
    <select id="action-type" name="actionType" style="width: 180px;">
      ${actionOptionsHTML}
    </select>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Contact Type:</label>
    <input type="text" id="contact-type" value="${contactType}" style="width: 180px;" readonly>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Disposition:</label>
    <input type="text" id="disposition" value="${effectiveDisposition}" style="width: 100px;" readonly>
    ${heroPopularity < 0 ?
          '<span style="color: #aa0000; font-size: 0.9em;"> (Modified due to negative popularity)</span>' : ''}
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Popularity:</label>
    <input type="text" id="popularity-rank" value="${heroPopularityRank}" style="width: 100px;" readonly>
    <span style="margin-left: 5px;">(${heroPopularity})</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Resources:</label>
    <input type="text" id="resources" value="${resourceLevel}" style="width: 100px;" readonly>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Required Result:</label>
    <input type="text" id="required-result" value="${requiredFeatColor}" style="width: 100px;" readonly>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Column Shift:</label>
    <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
    <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Karma Points:</label>
    <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
  </div>
  <div style="margin-bottom: 10px;">
    <label>
      <input type="checkbox" id="save-settings" name="saveSettings" checked> 
      Remember these settings for future rolls
    </label>
  </div>
  <div>
    <label>
      <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
      Skip dice animation
    </label>
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
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await item.setFlag("msh-faserip", "lastActionType", actionType);
                await item.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await item.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Apply column shifts to get effective rank
              let effectiveRank = heroPopularityRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
                ];
                const index = ranks.indexOf(effectiveRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                  console.log(`Applied ${columnShift} column shifts to ${heroPopularityRank}, now ${effectiveRank}`);
                }
              }

              // Apply mutant penalty if applicable
              if (isMutant) {
                // Apply a -1CS to reflect mutant penalty
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
                ];
                const index = ranks.indexOf(effectiveRank);
                if (index > 0) { // Don't go below Shift-0
                  effectiveRank = ranks[index - 1];
                  console.log(`Applied -1CS mutant penalty, now ${effectiveRank}`);
                }
              }

              // Create the roll
              const roll = new Roll("1d100");

              // Evaluate the roll
              await roll.evaluate();

              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} contacts ${item.name}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }

              // Calculate the result
              const totalRoll = roll.total + karma;
              const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);

              // Check if the result meets the required FEAT color
              let meetsFeatRequirement = false;
              switch (requiredFeatColor) {
                case "Green":
                  meetsFeatRequirement = (resultColor.toLowerCase() === "green" || resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
                  break;
                case "Yellow":
                  meetsFeatRequirement = (resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
                  break;
                case "Red":
                  meetsFeatRequirement = (resultColor.toLowerCase() === "red");
                  break;
                case "Impossible":
                  meetsFeatRequirement = false; // Always fails
                  break;
              }

              // Define all possible results by color 
              const ALL_RESULTS = {
                "Availability": {
                  white: "Unavailable",
                  green: "Available (Limited)",
                  yellow: "Available",
                  red: "Eager to Help"
                },
                "Information": {
                  white: "No Information",
                  green: "Basic Information",
                  yellow: "Good Information",
                  red: "Detailed Information"
                },
                "Equipment": {
                  white: "No Equipment",
                  green: "Basic Equipment",
                  yellow: `Good Equipment (up to ${resourceLevel} rank)`,
                  red: `Excellent Equipment (up to ${resourceLevel} rank)`
                },
                "Assistance": {
                  white: "No Assistance",
                  green: "Limited Assistance",
                  yellow: "Direct Assistance",
                  red: "Above and Beyond"
                },
                "Favor": {
                  white: "Refuses",
                  green: "Small Favor Only",
                  yellow: "Willing to Help",
                  red: "Goes Above and Beyond"
                }
              };

              // Determine the result text
              let resultText;
              if (meetsFeatRequirement) {
                // If requirement met, use the result corresponding to the color rolled
                resultText = ALL_RESULTS[actionType][resultColor.toLowerCase()];
              } else {
                // If requirement not met, show the "failure" result regardless of color
                if (actionType === "Availability") resultText = "Unavailable";
                else if (actionType === "Information") resultText = "No Information";
                else if (actionType === "Equipment") resultText = "No Equipment";
                else if (actionType === "Assistance") resultText = "No Assistance";
                else if (actionType === "Favor") resultText = "Refuses";
              }

              // Create chat message styled to match others
              let content = `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
              <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>${this.actor.name} - ${contactType} Contact: ${item.name} (${actionType})</strong>
              </div>
              <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Popularity: ${heroPopularityRank} (${heroPopularity})</div>
                <div>Disposition: ${effectiveDisposition} (Required: ${requiredFeatColor})</div>
                ${isMutant ? '<div style="color: #aa0000;">Mutant Penalty Applied (-1CS)</div>' : ''}
                <div>Effective Rank: ${heroPopularityRank} ${columnShift !== 0 ? `→ ${effectiveRank} (${columnShift > 0 ? '+' : ''}${columnShift}CS)` : ''}</div>
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
              ${!meetsFeatRequirement ?
                  `<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Failed to meet required ${requiredFeatColor} result for ${effectiveDisposition} contact</div>` : ''}
              ${heroPopularity < 0 ?
                  '<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Negative popularity affects contact relations</div>' : ''}
            </div>
          `;

              // Send to chat
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content
              });

              // If hero has negative popularity, using contacts costs Karma
              if (heroPopularity < 0) {
                ui.notifications.warn("Negative popularity: Using contacts costs Karma!");
                // You could implement Karma reduction here if desired
              }
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    });

    // Add Equipment button
    html.find('.add-equipment').click(ev => {
      console.log("Add Equipment button clicked"); // Debug line

      // Create the new equipment item data
      const itemData = {
        name: "New Equipment",
        type: "equipment",
        system: {
          description: "",
          materialStrength: "Typical",
          category: "gear",
          price: "Poor",
          notes: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Equipment created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating equipment:", err));
    });

    // Browse Equipment Compendium button
    html.find('.browse-compendium[data-type="equipment"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "equipment" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Equipment compendium not found.");
      }
    });

    // Equipment info button
    html.find('.equipment-info').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
    
      if (!item) return;
    
      // Create a dialog to show equipment information
      let content = `
        <h2>${item.name}</h2>
        <div class="equipment-details">
          <div class="label">Category:</div><div>${item.system.category || 'None'}</div>
          <div class="label">Material Strength:</div><div>${item.system.materialStrength || 'Typical'}</div>
          <div class="label">Price:</div><div>${item.system.price || 'Poor'}</div>`;
          
      // Add category-specific details
      if (item.system.category === "weapon") {
        content += `
          <div class="label">Weapon Type:</div><div>${item.system.weaponType || 'None'}</div>
          <div class="label">Range:</div><div>${item.system.range || 'None'}</div>
          <div class="label">Damage:</div><div>${item.system.damage || 'None'} (${item.system.damageType || 'None'})</div>
          <div class="label">Rate:</div><div>${item.system.rate || 'None'}</div>
          <div class="label">Shots:</div><div>${item.system.shotsRemaining || item.system.shots || 'None'}/${item.system.shots || 'None'}</div>`;
      } else if (item.system.category === "armor") {
        content += `
          <div class="label">Protection:</div><div>${item.system.protection || 'None'}</div>
          <div class="label">Coverage:</div><div>${item.system.coverage || 'Partial'}</div>`;
      } else if (item.system.category === "power-item") {
        content += `
          <div class="label">Power Rank:</div><div>${item.system.powerRank || 'Typical'}</div>
          <div class="label">Power Type:</div><div>${item.system.powerType || 'None'}</div>
          <div class="label">Linked Ability:</div><div>${item.system.linkedAbility || 'None'}</div>`;
      }
      
      content += `
        </div>
        <div class="description">${item.system.description || 'No description available.'}</div>
        <div class="notes">${item.system.notes ? `<strong>Notes:</strong> ${item.system.notes}` : ''}</div>
      `;
    
      new Dialog({
        title: "Equipment Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });

    // Edit equipment button
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
    
      if (item) {
        // Open the item sheet for proper editing
        item.sheet.render(true);
      }
    });

    // Delete equipment button
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
    
      if (!itemId) return;
    
      // Confirm deletion
      new Dialog({
        title: "Delete Equipment",
        content: "<p>Are you sure you want to delete this equipment?</p>",
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

    // Roll equipment button
    html.find('.equipment-roll').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
    
      if (item) {
        item.rollItem();
      }
    });

    // Reload weapon
    html.find('.reload-weapon').click(ev => {
      ev.preventDefault();
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      
      if (item && item.system.category === "weapon") {
        // Reset shotsRemaining to full shots
        item.update({"system.shotsRemaining": item.system.shots})
          .then(() => {
            ui.notifications.info(`${item.name} reloaded.`);
            this.render(false);
          })
          .catch(err => {
            console.error("Error reloading weapon:", err);
            ui.notifications.error("Could not reload weapon.");
          });
      }
    });

    // Continue with other listeners...
  }
}