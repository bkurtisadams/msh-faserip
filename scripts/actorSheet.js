import { prepareActiveEffectCategories, onManageActiveEffect } from "../helpers/effects.mjs";

function getPopularityRankWithRange(value, context) {
  const rank = context._getPopularityRank(value);
  const ranges = {
    "Feeble": "1–2",
    "Poor": "3–4",
    "Typical": "5–7",
    "Good": "8–15",
    "Excellent": "16–25",
    "Remarkable": "26–35",
    "Incredible": "36–45",
    "Amazing": "46–62",
    "Monstrous": "63–87",
    "Unearthly": "88–125",
    "Shift-X": "126–175",
    "Shift-Y": "176–350",
    "Shift-Z": "351–999",
    "Class 1000": "1000–2999",
    "Class 3000": "3000–4999",
    "Class 5000": "5000+"
  };
  return `${rank} (${ranges[rank] || "?"})`;
}

/**
 * Applies a column shift to a FASERIP rank and returns the new rank and its base value.
 * @param {string} rankName - The current rank (e.g. "Amazing")
 * @param {number} currentValue - The current numeric value (e.g. 46)
 * @param {number} csShift - Number of column shifts (positive or negative)
 * @returns {{ rank: string, value: number }}
 */
function applyColumnShiftToRank(rankName, currentValue, csShift) {
  const rankList = [
    { name: "Shift-0", min: 0 },
    { name: "Feeble", min: 1 },
    { name: "Poor", min: 3 },
    { name: "Typical", min: 5 },
    { name: "Good", min: 8 },
    { name: "Excellent", min: 16 },
    { name: "Remarkable", min: 26 },
    { name: "Incredible", min: 36 },
    { name: "Amazing", min: 46 },
    { name: "Monstrous", min: 63 },
    { name: "Unearthly", min: 88 },
    { name: "Shift-X", min: 126 },
    { name: "Shift-Y", min: 176 },
    { name: "Shift-Z", min: 351 },
    { name: "Class 1000", min: 1000 },
    { name: "Class 3000", min: 3000 },
    { name: "Class 5000", min: 5000 },
    { name: "Beyond", min: 9999 }
  ];

  // Find current index by name, fallback to value if needed
  let index = rankList.findIndex(r => r.name === rankName);

  if (index === -1) {
    // Fallback: try to find by value
    index = rankList.findIndex(r => currentValue >= r.min);
    if (index === -1) index = 0;
  }

  const newIndex = Math.max(0, Math.min(rankList.length - 1, index + csShift));
  const newRank = rankList[newIndex];

  return {
    rank: newRank.name,
    value: newRank.min
  };
}

export class FaseripActorSheet extends ActorSheet {
  // Add a property to track the biography toggle state
  _isBiographyOpen = false;
  
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      width: 650,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", initial: "powers" }],
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
    context.powers = this.actor.items
    .filter(item => item.type === "power")
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // make talents sortable within the talents tab
    context.talents = this.actor.items
      .filter(item => item.type === "talent")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // get contacts & make sortable
    context.contacts = this.actor.items
      .filter(item => item.type === "contact")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // the calculated current karma value
    context.currentKarma = this.actor.currentKarma;

    // the biography toggle state to the context
    context.isBiographyOpen = this._isBiographyOpen;

    // equipment made sortable
    context.equipment = this.actor.items
      .filter(item => item.type === "equipment")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // headquarters made sortable
    context.headquarters = this.actor.items
      .filter(item => item.type === "headquarters")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // vehicles made sortable
    context.vehicles = this.actor.items
      .filter(item => item.type === "vehicle")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));


    // Add ranks array for dropdowns
    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    // active effects
    context.effects = prepareActiveEffectCategories(
      this.actor.allApplicableEffects ? this.actor.allApplicableEffects() : this.actor.effects
    );
    console.log("Prepared effects:", context.effects);

    context.editable = this.isEditable; // (if not already present)

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

    html.on("click", ".effect-control", (ev) => {
      const row = ev.currentTarget.closest("li");
      const document =
        row?.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row?.dataset.parentId);
      onManageActiveEffect(ev, document);
    });

    // Power rows draggable
    html.find('.power-row').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Talent rows draggable & sortable
    html.find('.talent-item').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    html.find('.talent-item').each((i, row) => {
      row.setAttribute("draggable", true);
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "TalentSort",
          itemId
        }));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (sourceData.type !== "TalentSort") return;
    
        const sourceId = sourceData.itemId;
        const targetId = row.dataset.itemId;
        if (!sourceId || !targetId || sourceId === targetId) return;
    
        const items = this.actor.items
          .filter(i => i.type === "talent")
          .sort((a, b) => a.sort - b.sort);
        const source = items.find(i => i.id === sourceId);
        const target = items.find(i => i.id === targetId);
        if (!source || !target) return;
    
        const sourceIndex = items.indexOf(source);
        const targetIndex = items.indexOf(target);
    
        items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, source);
    
        const updates = items.map((item, index) => ({
          _id: item.id,
          sort: index
        }));
    
        await this.actor.updateEmbeddedDocuments("Item", updates);
        this.render();
      });
    });

    // Contact rows draggable
    html.find('.contact-item').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Contacts made draggable/sortable w/in the contact tab
    html.find('.contact-item').each((i, row) => {
      row.setAttribute("draggable", true);
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "ContactSort",
          itemId
        }));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (sourceData.type !== "ContactSort") return;
    
        const sourceId = sourceData.itemId;
        const targetId = row.dataset.itemId;
        if (!sourceId || !targetId || sourceId === targetId) return;
    
        const items = this.actor.items
          .filter(i => i.type === "contact")
          .sort((a, b) => a.sort - b.sort);
        const source = items.find(i => i.id === sourceId);
        const target = items.find(i => i.id === targetId);
        if (!source || !target) return;
    
        const sourceIndex = items.indexOf(source);
        const targetIndex = items.indexOf(target);
    
        items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, source);
    
        const updates = items.map((item, index) => ({
          _id: item.id,
          sort: index
        }));
    
        await this.actor.updateEmbeddedDocuments("Item", updates);
        this.render();
      });
    });

    // Equipment rows draggable
    html.find('.equipment-row').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this));
    });

    // Equipment made draggable & sortable w/in its tab
    html.find('.equipment-row').each((i, row) => {
      row.setAttribute("draggable", true);
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "EquipmentSort",
          itemId
        }));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (sourceData.type !== "EquipmentSort") return;
    
        const sourceId = sourceData.itemId;
        const targetId = row.dataset.itemId;
        if (!sourceId || !targetId || sourceId === targetId) return;
    
        const items = this.actor.items
          .filter(i => i.type === "equipment")
          .sort((a, b) => a.sort - b.sort);
        const source = items.find(i => i.id === sourceId);
        const target = items.find(i => i.id === targetId);
        if (!source || !target) return;
    
        const sourceIndex = items.indexOf(source);
        const targetIndex = items.indexOf(target);
    
        items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, source);
    
        const updates = items.map((item, index) => ({
          _id: item.id,
          sort: index
        }));
    
        await this.actor.updateEmbeddedDocuments("Item", updates);
        this.render();
      });
    });

    // Vehicle rows draggable
    // Make ONLY the vehicle name draggable
    html.find('.vehicle-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "VehicleSort",
          itemId
        }));
      });
    });

    // Allow sorting via row drop targets
    html.find('.vehicle-row').each((i, row) => {
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (sourceData.type !== "VehicleSort") return;

        const sourceId = sourceData.itemId;
        const targetId = row.dataset.itemId;
        if (!sourceId || !targetId || sourceId === targetId) return;

        const items = this.actor.items
          .filter(i => i.type === "vehicle")
          .sort((a, b) => a.sort - b.sort);
        const source = items.find(i => i.id === sourceId);
        const target = items.find(i => i.id === targetId);
        if (!source || !target) return;

        const sourceIndex = items.indexOf(source);
        const targetIndex = items.indexOf(target);

        items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, source);

        const updates = items.map((item, index) => ({
          _id: item.id,
          sort: index
        }));

        await this.actor.updateEmbeddedDocuments("Item", updates);
        this.render();
      });
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
        },
        sort: this.actor.items.size  // sort added
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Power created successfully");
          this.render(false); // Re-render the sheet to show the new power
        })
        .catch(err => console.error("Error creating power:", err));
    });

    // Listener for powers
    html.find('.power-row').each((i, row) => {
      row.setAttribute("draggable", true);
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "PowerSort",
          itemId
        }));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (sourceData.type !== "PowerSort") return;

        const sourceId = sourceData.itemId;
        const targetId = row.dataset.itemId;
        if (!sourceId || !targetId || sourceId === targetId) return;

        const items = this.actor.items.filter(i => i.type === "power").sort((a, b) => a.sort - b.sort);
        const source = items.find(i => i.id === sourceId);
        const target = items.find(i => i.id === targetId);
        if (!source || !target) return;

        const sourceIndex = items.indexOf(source);
        const targetIndex = items.indexOf(target);

        items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, source);

        const updates = items.map((item, index) => ({
          _id: item.id,
          sort: index
        }));

        await this.actor.updateEmbeddedDocuments("Item", updates);
        this.render();
      });
    });


    // Add Resistance
    html.find('.add-resistance').click(async (ev) => {
      ev.preventDefault();
      
      // Ensure resistances is always initialized as an array
      let resistances = foundry.utils.deepClone(this.actor.system.resistances);
      if (!Array.isArray(resistances)) {
        resistances = [];
      }
    
      resistances.push({ type: "physical", rank: "Good", value: 10 });
      await this.actor.update({ "system.resistances": resistances });
    });

    // Resistance Info Dialog
    html.find('.resistance-info').click(ev => {
      ev.preventDefault();
      const index = Number(ev.currentTarget.dataset.index);
      const resistance = this.actor.system.resistances[index];
      if (!resistance) return;

      new Dialog({
        title: "Resistance Information",
        content: `
          <p><strong>Type:</strong> ${resistance.type}</p>
          <p><strong>Rank:</strong> ${resistance.rank} (${resistance.value})</p>
        `,
        buttons: { close: { label: "Close" } }
      }).render(true);
    });

    // Resistance edit button
    html.find('.resistance-edit').click(ev => {
      const index = $(ev.currentTarget).data("index");
      const resistance = this.actor.system.resistances[index];
      
      if (!resistance) return;
      
      let content = `
        <form>
          <div class="form-group">
            <label>Resistance Type</label>
            <select id="resistance-type" name="type">
              <option value="physical" ${resistance.type === "physical" ? "selected" : ""}>Physical</option>
              <option value="energy" ${resistance.type === "energy" ? "selected" : ""}>Energy</option>
              <option value="mental" ${resistance.type === "mental" ? "selected" : ""}>Mental</option>
              <option value="magical" ${resistance.type === "magical" ? "selected" : ""}>Magical</option>
              <option value="fire" ${resistance.type === "fire" ? "selected" : ""}>Fire</option>
              <option value="cold" ${resistance.type === "cold" ? "selected" : ""}>Cold</option>
              <option value="electricity" ${resistance.type === "electricity" ? "selected" : ""}>Electricity</option>
              <option value="radiation" ${resistance.type === "radiation" ? "selected" : ""}>Radiation</option>
              <option value="toxin" ${resistance.type === "toxin" ? "selected" : ""}>Toxin</option>
              <option value="corrosive" ${resistance.type === "corrosive" ? "selected" : ""}>Corrosive</option>
              <option value="disease" ${resistance.type === "disease" ? "selected" : ""}>Disease</option>
              <option value="emotion" ${resistance.type === "emotion" ? "selected" : ""}>Emotion</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rank</label>
            <select id="resistance-rank" name="rank">
              <option value="Shift-0" ${resistance.rank === "Shift-0" ? "selected" : ""}>Shift-0</option>
              <option value="Feeble" ${resistance.rank === "Feeble" ? "selected" : ""}>Feeble</option>
              <option value="Poor" ${resistance.rank === "Poor" ? "selected" : ""}>Poor</option>
              <option value="Typical" ${resistance.rank === "Typical" ? "selected" : ""}>Typical</option>
              <option value="Good" ${resistance.rank === "Good" ? "selected" : ""}>Good</option>
              <option value="Excellent" ${resistance.rank === "Excellent" ? "selected" : ""}>Excellent</option>
              <option value="Remarkable" ${resistance.rank === "Remarkable" ? "selected" : ""}>Remarkable</option>
              <option value="Incredible" ${resistance.rank === "Incredible" ? "selected" : ""}>Incredible</option>
              <option value="Amazing" ${resistance.rank === "Amazing" ? "selected" : ""}>Amazing</option>
              <option value="Monstrous" ${resistance.rank === "Monstrous" ? "selected" : ""}>Monstrous</option>
              <option value="Unearthly" ${resistance.rank === "Unearthly" ? "selected" : ""}>Unearthly</option>
            </select>
          </div>
          <div class="form-group">
            <label>Value</label>
            <input type="number" id="resistance-value" name="value" value="${resistance.value}">
          </div>
        </form>
      `;
      
      new Dialog({
        title: "Edit Resistance",
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: (html) => {
              const newType = html.find('#resistance-type').val();
              const newRank = html.find('#resistance-rank').val();
              const newValue = parseInt(html.find('#resistance-value').val()) || 0;
              
              // Create updated array
              const resistances = duplicate(this.actor.system.resistances);
              resistances[index] = {
                type: newType,
                rank: newRank,
                value: newValue
              };
              
              // Update the actor
              this.actor.update({
                "system.resistances": resistances
              });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "save",
        width: 400
      }).render(true);
    });

    // Delete Resistance
    html.find('.delete-resistance').click(async (ev) => {
      ev.preventDefault();

      // Use jQuery consistently to access data attributes
      const index = Number($(ev.currentTarget).data("index"));
      
      let resistances = foundry.utils.deepClone(this.actor.system.resistances);
      if (!Array.isArray(resistances)) {
        console.error("Resistances is not an array.");
        return;
      }

      if (index >= 0 && index < resistances.length) {
        resistances.splice(index, 1);
        await this.actor.update({ "system.resistances": resistances });
      } else {
        console.error("Invalid resistance index:", index);
      }
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
          <p><strong>Rank:</strong> ${item.system.rank} (${item.system.value})</p>
          <p><strong>Type:</strong> ${item.system.type || 'None'}</p>
          <p><strong>Range:</strong> ${item.system.range || 'None'}</p>
          <p><strong>Active:</strong> ${item.system.isActive ? 'Yes' : 'No'}</p>
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll power button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      const savedDamageCS = item.getFlag("msh-faserip", "lastDamageCS") || 0;
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
    <label style="display: inline-block; width: 120px;">Damage CS Modifier:</label>
    <input type="number" id="damage-cs" name="damageCs" value="${savedDamageCS}" style="width: 50px;">
    <span style="color: #666; font-size: 0.9em;">(modifies damage rank)</span>
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
              const damageCS = parseInt(html.find('[name="damageCs"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await item.setFlag("msh-faserip", "lastActionType", actionType);
                await item.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await item.setFlag("msh-faserip", "lastDamageCS", damageCS);

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

              const damageRankResult = applyColumnShiftToRank(powerRank, powerValue, damageCS);
              const damageRankName = damageRankResult.rank;
              const damageRankValue = damageRankResult.value;

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
                ${damageCS !== 0
                  ? `<div>Damage Column Shift: ${damageCS > 0 ? "+" : ""}${damageCS}CS → <strong>${damageRankName} (${damageRankValue})</strong></div>`
                  : ""}
                
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

    // roll talent button
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
      const savedDamageCS = item.getFlag("msh-faserip", "lastDamageCS") || 0;
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
          <label style="display: inline-block; width: 120px;">Extra FEAT CS:</label>
          <input type="number" id="shift" name="shift" value="${savedExtraShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(affects FEAT rank)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Damage CS Modifier:</label>
          <input type="number" id="damage-cs" name="damageCs" value="${savedDamageCS}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(modifies damage rank)</span>
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
              const damageCS = parseInt(html.find('[name="damageCs"]').val()) || 0;

              const extraShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await item.setFlag("msh-faserip", "lastActionType", actionType);
                await item.setFlag("msh-faserip", "lastExtraShift", extraShift);
                await item.setFlag("msh-faserip", "lastDamageCS", damageCS);
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

              // 💥 NEW: Apply damage CS to get effective damage rank
              const damageRankResult = applyColumnShiftToRank(abilityRank, abilityValue, damageCS);
              const damageRankName = damageRankResult.rank;
              const damageRankValue = damageRankResult.value;

              // Create the roll
              const roll = new Roll("1d100");
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
                    ${damageCS !== 0
                      ? `<div>Damage Column Shift: ${damageCS > 0 ? "+" : ""}${damageCS}CS → <strong>${damageRankName} (${damageRankValue})</strong></div>`
                      : ""}
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
                /* await item.setFlag("msh-faserip", "lastDamageCS", damageCS); */
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
          <p><strong>Category:</strong> ${item.system.category || 'None'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Price:</strong> ${item.system.price || 'Poor'}</p>`;
          
      // Add category-specific details
      if (item.system.category === "weapon") {
        content += `
          <p><strong>Weapon Type:</strong> ${item.system.weaponType || 'None'}</p>
          <p><strong>Range:</strong> ${item.system.range || 'None'}</p>
          <p><strong>Damage:</strong> ${item.system.damage || 'None'} (${item.system.damageType || 'None'})</p>
          <p><strong>Rate:</strong> ${item.system.rate || 'None'}</p>
          <p><strong>Shots:</strong> ${item.system.shotsRemaining || item.system.shots || 'None'}/${item.system.shots || 'None'}</p>`;
      } else if (item.system.category === "armor") {
        content += `
          <p><strong>Protection:</strong> ${item.system.protection || 'None'}</p>
          <p><strong>Coverage:</strong> ${item.system.coverage || 'Partial'}</p>`;
      } else if (item.system.category === "power-item") {
        content += `
          <p><strong>Power Rank:</strong> ${item.system.powerRank || 'Typical'}</p>
          <p><strong>Power Type:</strong> ${item.system.powerType || 'None'}</p>
          <p><strong>Linked Ability:</strong> ${item.system.linkedAbility || 'None'}</p>`;
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add Vehicle button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-vehicle').click(ev => {
      console.log("Add Vehicle button clicked"); // Debug line

      // Create the new vehicle item data
      const itemData = {
        name: "New Vehicle",
        type: "vehicle",
        system: {
          description: "",
          type: "Road",
          cost: "Typical",
          control: "Typical",
          speed: "Typical",
          body: "Typical", 
          protection: "Typical",
          compartmented: false,
          features: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Vehicle created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating vehicle:", err));
    });

    // Browse Vehicles Compendium button
    html.find('.browse-compendium[data-type="vehicles"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "vehicles" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Vehicles compendium not found.");
      }
    });

    // vehicle control feat button
    html.find('.vehicle-control-roll').each((i, btn) => {
      btn.addEventListener('click', async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const vehicle = this.actor.items.get(itemId);
        if (!vehicle) return ui.notifications.warn("Vehicle not found");
        this._rollVehicleControl(vehicle);
      });

      btn.addEventListener('dragstart', ev => {
        const command = `game.actors.get("${this.actor.id}").sheet._rollVehicleControl(game.actors.get("${this.actor.id}").items.get("${btn.dataset.itemId}"));`;
        const dragData = {
          type: "script",
          name: `Vehicle Control (${this.actor.name})`,
          img: "icons/svg/steering-wheel.svg",
          command
        };
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Vehicle info button (clickable image)
    html.find('.vehicle-info').click(ev => {
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      // Show vehicle details in a dialog
      let content = `
        <h2>${item.name}</h2>
        <div class="vehicle-details">
          <p><strong>Type:</strong> ${item.system.type}</p>
          <p><strong>Cost:</strong> ${item.system.cost}</p>
          <p><strong>Control:</strong> ${item.system.control}</p>
          <p><strong>Speed:</strong> ${item.system.speed}</p>
          <p><strong>Body:</strong> ${item.system.body}</p>
          <p><strong>Protection:</strong> ${item.system.protection}</p>
          <p><strong>Compartmented:</strong> ${item.system.compartmented ? "Yes" : "No"}</p>
        </div>
        ${item.system.features ? `<p><strong>Features:</strong> ${item.system.features}</p>` : ''}
        ${item.system.description ? `<div class="description">${item.system.description}</div>` : ''}
      `;

      new Dialog({
        title: "Vehicle Information",
        content,
        buttons: { close: { label: "Close" } },
        width: 400
      }).render(true);
    });

    // Make ONLY the vehicle name text draggable
    html.find('.vehicle-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "VehicleSort",
          itemId
        }));
      });
    });

    // Edit vehicle button
    html.find('.vehicles-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".vehicle-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete vehicle button
    html.find('.vehicles-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".vehicle-row");
      const itemId = li.data("itemId");

      if (!itemId) return;

      new Dialog({
        title: "Delete Vehicle",
        content: "<p>Are you sure you want to delete this vehicle?</p>",
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add Headquarters button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-headquarters').click(ev => {
      console.log("Add Headquarters button clicked"); // Debug line

      // Create the new headquarters item data
      const itemData = {
        name: "New Headquarters",
        type: "headquarters",
        system: {
          description: "",
          location: "",
          size: "",
          materialStrength: "Typical",
          ownership: "owned",
          purchaseCost: "",
          rentalCost: "",
          isRichArea: false,
          features: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Headquarters created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating headquarters:", err));
    });

    // Browse Headquarters Compendium button
    html.find('.browse-compendium[data-type="headquarters"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "headquarters" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Headquarters compendium not found.");
      }
    });

    // Headquarters info button (clickable image)
    html.find('.headquarters-info').click(ev => {
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      // Show headquarters details in a dialog
      let content = `
        <h2>${item.name}</h2>
        <div class="headquarters-details">
          <p><strong>Location:</strong> ${item.system.location || 'Unknown'}</p>
          <p><strong>Size:</strong> ${item.system.size || 'Typical'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Ownership:</strong> ${item.system.ownership || 'Owned'}</p>
          ${item.system.purchaseCost ? `<p><strong>Purchase Cost:</strong> ${item.system.purchaseCost}</p>` : ''}
          ${item.system.rentalCost ? `<p><strong>Rental Cost:</strong> ${item.system.rentalCost}</p>` : ''}
          ${item.system.isRichArea ? `<p><strong>Located in Rich Area:</strong> Yes</p>` : ''}
          ${item.system.features ? `<p><strong>Features:</strong> ${item.system.features}</p>` : ''}
        </div>
        ${item.system.description ? `<div class="description">${item.system.description}</div>` : ''}
      `;

      new Dialog({
        title: "Headquarters Information",
        content,
        buttons: { close: { label: "Close" } },
        width: 400
      }).render(true);
    });

    // Make headquarters draggable & sortable w/in the tab
    html.find('.headquarters-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "HeadquartersSort",
          itemId
        }));
      });
    });
    
    // Make the entire row a drop target
    html.find('.headquarters-row').each((i, row) => {
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (sourceData.type !== "HeadquartersSort") return;
    
        const sourceId = sourceData.itemId;
        const targetId = row.dataset.itemId;
        if (!sourceId || !targetId || sourceId === targetId) return;
    
        const items = this.actor.items
          .filter(i => i.type === "headquarters")
          .sort((a, b) => a.sort - b.sort);
        const source = items.find(i => i.id === sourceId);
        const target = items.find(i => i.id === targetId);
        if (!source || !target) return;
    
        const sourceIndex = items.indexOf(source);
        const targetIndex = items.indexOf(target);
    
        items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, source);
    
        const updates = items.map((item, index) => ({
          _id: item.id,
          sort: index
        }));
    
        await this.actor.updateEmbeddedDocuments("Item", updates);
        this.render();
      });
    });

    // Edit headquarters button
    html.find('.headquarters-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".headquarters-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete headquarters button
    html.find('.headquarters-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".headquarters-row");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Headquarters",
        content: "<p>Are you sure you want to delete this headquarters?</p>",
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // RESOURCE BUTTON method
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.resources-header-button').click(ev => {
      // Create dialog content with information about Resource FEATs
      const content = `
        <h2>Resource FEATs</h2>
        
        <p>Resources are a measure of a character's wealth and buying power. Instead of tracking exact money, the FASERIP system uses Resource FEATs to determine if a character can afford an item.</p>
        
        <h3>Using Resources</h3>
        <p>To purchase anything, a character must make a Resource FEAT. This is the equivalent of a credit check or checking the bank account to see how much cash is available.</p>
        
        <h3>Resource FEAT Rules:</h3>
        <ul>
          <li>A Resource FEAT may be made once per week.</li>
          <li>A character cannot purchase an item with a higher rank than their Resource rank.</li>
          <li>If the item's rank is 3 ranks lower than the Resource rank, purchase is automatic.</li>
          <li>If 1-2 ranks lower, a green FEAT is needed.</li>
          <li>If equal to Resource rank, a yellow FEAT is needed.</li>
        </ul>
        
        <h3>Success and Failure</h3>
        <p>Success means the character can purchase the item. Failure indicates the item is too expensive and the character cannot try for any item of that rank or higher for the next week.</p>
        
        <table>
          <tr>
            <th>Resource Rank</th>
            <th>Buying Power</th>
          </tr>
          <tr>
            <td>Shift-0</td>
            <td>Homeless, no income</td>
          </tr>
          <tr>
            <td>Feeble</td>
            <td>Poor, struggling to make ends meet</td>
          </tr>
          <tr>
            <td>Poor</td>
            <td>Low income, basic necessities only</td>
          </tr>
          <tr>
            <td>Typical</td>
            <td>Average income, modest lifestyle</td>
          </tr>
          <tr>
            <td>Good</td>
            <td>Comfortable income, can afford luxuries</td>
          </tr>
          <tr>
            <td>Excellent</td>
            <td>Well-off, upper middle class</td>
          </tr>
          <tr>
            <td>Remarkable</td>
            <td>Wealthy, significant disposable income</td>
          </tr>
          <tr>
            <td>Incredible</td>
            <td>Very wealthy, millionaire</td>
          </tr>
          <tr>
            <td>Amazing</td>
            <td>Extremely wealthy, multi-millionaire</td>
          </tr>
          <tr>
            <td>Monstrous</td>
            <td>Super-rich, billionaire</td>
          </tr>
          <tr>
            <td>Unearthly</td>
            <td>Absurdly wealthy, virtually unlimited resources</td>
          </tr>
        </table>
        
        <h3>Optional Bank Loans</h3>
        <p>Characters may purchase something up to one rank higher than their Resource rank through a bank loan. The character then must make monthly Resource FEATs of two ranks less for as many months as the rank number of the item.</p>
      `;
      
      // Create the dialog
      new Dialog({
        title: "Resources in FASERIP",
        content: content,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Close"
          },
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Make Resource Roll",
            callback: () => this._onResourceRoll()
          }
        },
        default: "close",
        classes: ["resources-dialog"]
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Popularity activateListeners method
    html.find('.popularity-header-button').click(ev => {
      const isMutant = this.actor.system.powerOrigin === "mutant" || this.actor.system.isMutant;
      const hasSecretId = this.actor.system.identityType === "secret";
      const heroPopularity = this.actor.system.attributes.popularity.value;
      const secretIdPopularity = hasSecretId ? (this.actor.system.attributes.popularity.secretId?.value || 0) : 0;
    
      const dialogContent = `
        <div style="margin-bottom: 10px;">
          ${hasSecretId ? `
            <label style="display: inline-block; width: 120px;">Identity:</label>
            <select id="identity-type" name="identityType" style="width: 120px;">
              <option value="hero">Hero Identity (${heroPopularity})</option>
              <option value="secret">Secret Identity (${secretIdPopularity})</option>
            </select>
          ` : `
            <label style="display: inline-block; width: 120px;">Popularity:</label>
            <input type="number" id="popularity-value" value="${heroPopularity}" style="width: 50px;" readonly>
          `}
          ${isMutant ? '<span style="color: #aa6600; margin-left: 5px;">Mutant (-1 modifier to all results)</span>' : ''}
        </div>
    
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Target Disposition:</label>
          <select id="disposition" name="disposition" style="width: 120px;">
            <option value="friendly">Friendly</option>
            <option value="neutral" selected>Neutral</option>
            <option value="unfriendly">Unfriendly</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
    
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Request Description:</label>
          <input type="text" id="request-description" style="width: 180px;" placeholder="e.g., Information request">
        </div>
    
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="column-shift" name="columnShift" value="0" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
    
        <div style="margin-bottom: 10px;">
          <p style="font-size: 0.9em; margin-top: 5px;">Common modifiers:</p>
          <ul style="font-size: 0.85em; margin-top: 5px; margin-bottom: 5px; padding-left: 20px;">
            <li>Target benefits: +2CS</li>
            <li>Target is placed in danger: -3CS</li>
            <li>Item value up to Good: -1CS</li>
            <li>Item value up to Remarkable: -2CS</li>
            <li>Item might not be returned: -2CS</li>
            <li>Item is unique: -3CS</li>
          </ul>
        </div>
      `;
    
      new Dialog({
        title: `Popularity Roll: ${this.actor.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll",
            callback: html => this._onPopularityRoll(html)
          },
          close: { icon: '<i class="fas fa-times"></i>', label: "Close" }
        },
        default: "roll"
      }).render(true);
    });
        
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Ability FEAT roll buttons
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.ability-key').click(ev => {
      const abilityKey = ev.currentTarget.textContent.trim().toLowerCase();
      let abilityName, abilityFullName;
      
      // Map the key to the actual ability name
      switch(abilityKey) {
        case 'f': abilityName = 'fighting'; abilityFullName = 'Fighting'; break;
        case 'a': abilityName = 'agility'; abilityFullName = 'Agility'; break;
        case 's': abilityName = 'strength'; abilityFullName = 'Strength'; break;
        case 'e': abilityName = 'endurance'; abilityFullName = 'Endurance'; break;
        case 'r': abilityName = 'reason'; abilityFullName = 'Reason'; break;
        case 'i': abilityName = 'intuition'; abilityFullName = 'Intuition'; break;
        case 'p': abilityName = 'psyche'; abilityFullName = 'Psyche'; break;
        default: return; // Invalid ability key
      }
      
      // Get ability information
      const ability = this.actor.system.abilities[abilityName];
      if (!ability) return;
      
      const abilityRank = ability.rank;
      const abilityValue = ability.value;
      
      // Get saved settings if they exist
      const savedColumnShift = this.actor.getFlag("msh-faserip", `last${abilityFullName}ColumnShift`) || 0;
      const skipDiceRoll = this.actor.getFlag("msh-faserip", `last${abilityFullName}SkipDiceRoll`) || false;
      
      // Create dialog for roll options
      let dialogContent = `
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Ability Rank:</label>
          <input type="text" id="ability-rank" name="abilityRank" value="${abilityRank}" style="width: 100px;" readonly>
          <span style="margin-left: 5px;">(${abilityValue})</span>
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
            Remember column shift for future rolls
          </label>
        </div>
        <div>
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>`;
      
      new Dialog({
        title: `${abilityFullName} FEAT Roll: ${this.actor.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              
              // Save settings if requested
              if (saveSettings) {
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}ColumnShift`, columnShift);
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}SkipDiceRoll`, skipDice);
              }
              
              // Apply column shifts to get effective rank
              let effectiveRank = abilityRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
                  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
                ];
                const index = ranks.indexOf(abilityRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                  console.log(`Applied ${columnShift} column shifts to ${abilityRank}, now ${effectiveRank}`);
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
                  flavor: `${this.actor.name} makes a ${abilityFullName} FEAT roll`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }
              
              // Calculate the result
              const totalRoll = roll.total + karma;
              const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);
              
              // Create chat message styled to match your existing output format
              let content = `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                  <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                    <strong>${this.actor.name} - ${abilityFullName} FEAT Roll</strong>
                  </div>
                  <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                    ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                    <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
                  </div>
                  <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                    background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                      resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                        resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
                          '#F44336'}; 
                    color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                    ${resultColor.toUpperCase()} RESULT
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
    
    // Continue with other listeners...
  }

  // In actorSheet.js, add as a method to FaseripActorSheet
  _onResourceRoll() {
    const resourceRank = this.actor.system.attributes.resources.rank;
    const resourceValue = this.actor.system.attributes.resources.value;
    
    // Create dialog for roll options
    let dialogContent = `
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Resource Rank:</label>
        <input type="text" id="resource-rank" value="${resourceRank}" style="width: 100px;" readonly>
        <span style="margin-left: 5px;">(${resourceValue})</span>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Item Cost Rank:</label>
        <select id="item-rank" name="itemRank" style="width: 120px;">
          <option value="Shift-0">Shift-0</option>
          <option value="Feeble">Feeble</option>
          <option value="Poor">Poor</option>
          <option value="Typical">Typical</option>
          <option value="Good">Good</option>
          <option value="Excellent">Excellent</option>
          <option value="Remarkable">Remarkable</option>
          <option value="Incredible">Incredible</option>
          <option value="Amazing">Amazing</option>
          <option value="Monstrous">Monstrous</option>
          <option value="Unearthly">Unearthly</option>
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Item Description:</label>
        <input type="text" id="item-description" style="width: 180px;" placeholder="e.g., Apartment rent">
      </div>
      <div style="margin-bottom: 10px;">
        <label>
          <input type="checkbox" id="bank-loan" name="bankLoan"> 
          Using a bank loan (allows 1 rank higher purchase)
        </label>
      </div>
    `;

    new Dialog({
      title: `Resource Roll: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll",
          callback: async (html) => {
            const itemRank = html.find('[id="item-rank"]').val();
            const itemDescription = html.find('[id="item-description"]').val() || "item";
            const bankLoan = html.find('[id="bank-loan"]').is(':checked');
            
            // Determine ranks
            const ranks = [
              "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
              "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
            ];
            
            const resourceIndex = ranks.indexOf(resourceRank);
            const itemIndex = ranks.indexOf(itemRank);
            
            if (resourceIndex === -1 || itemIndex === -1) {
              ui.notifications.error("Invalid rank selection");
              return;
            }
            
            // Check if purchase is possible based on ranks
            if (itemIndex > resourceIndex && !bankLoan) {
              ui.notifications.warn("Item rank is higher than resource rank - purchase impossible without a loan");
              return;
            }

            if (itemIndex > resourceIndex + 1) {
              ui.notifications.warn("Item rank is too high even with a bank loan");
              return;
            }

            // Determine FEAT color needed
            let featColorNeeded;
            let rankDifference = resourceIndex - itemIndex;

            if (rankDifference >= 3) {
              featColorNeeded = "Automatic";
            } else if (rankDifference === 1 || rankDifference === 2) {
              featColorNeeded = "Green";
            } else if (rankDifference === 0) {
              featColorNeeded = "Yellow";
            } else if (bankLoan && itemIndex === resourceIndex + 1) {
              featColorNeeded = "Yellow";  // This is what's changed - bank loans use yellow FEAT for initial approval
            }

            // Create the roll
            const roll = new Roll("1d100");

            // Evaluate the roll
            await roll.evaluate();

            // Calculate the result
            const resultColor = game.msh.rollUniversalTable(resourceRank, roll.total);

            // Determine success
            let success = false;
            if (featColorNeeded === "Automatic") {
              success = true;
            } else if (featColorNeeded === "Green") {
              success = ["green", "yellow", "red"].includes(resultColor.toLowerCase());
            } else if (featColorNeeded === "Yellow") {
              success = ["yellow", "red"].includes(resultColor.toLowerCase());
            } else if (featColorNeeded === "Red") {
              success = resultColor.toLowerCase() === "red";
            }
            
            // Create chat message
            let content = `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                  <strong>${this.actor.name} - Resource FEAT for ${itemDescription}</strong>
                </div>
                <div style="padding: 5px 10px; font-size: 0.9em;">
                  <div>Resource Rank: ${resourceRank} (${resourceValue})</div>
                  <div>Item Rank: ${itemRank}</div>
                  ${bankLoan ? '<div>Using Bank Loan</div>' : ''}
                  <div>Required FEAT: ${featColorNeeded}</div>
                  <div>Roll: ${roll.total}</div>
                </div>
                <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                  background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                    resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                      resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
                        '#F44336'}; 
                  color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                  ${resultColor.toUpperCase()}
                </div>
                <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${success ? '#4CAF50' : '#F44336'};">
                  ${success ? 'SUCCESS: Purchase Possible' : 'FAILURE: Cannot Afford'}
                </div>
                ${bankLoan && success ? 
                  `<div style="padding: 5px 10px; font-size: 0.9em; background-color: #fffde7; border: 1px solid #ffd54f; margin-top: 5px;">
                     <strong>Bank loan approved</strong><br> 
                     You must make a ${ranks[Math.max(0, resourceIndex-2)]} Resource FEAT each month for ${itemIndex+1} months.
                     <br>Failure to pay results in the bank reclaiming the item.
                   </div>` 
                  : ''}
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
  }

  // _onPopularityRoll method
  async _onPopularityRoll(html) {
    console.log("== POPULARITY ROLL START ==");
    console.log("Actor:", this.actor.name);
    console.log("Raw popularity object:", this.actor.system.attributes.popularity);
  
    const heroPopularity = this.actor.system.attributes.popularity.hero?.value ?? 0;
    const secretIdPopularity = this.actor.system.attributes.popularity.secretId?.value ?? 0;
    const isMutant = this.actor.system.powerOrigin === "mutant" || this.actor.system.isMutant;
  
    console.log("Hero Pop:", heroPopularity);
    console.log("Secret ID Pop:", secretIdPopularity);
    console.log("Is Mutant:", isMutant);
  
    const identityType = html.find('#identity-type').val() || "hero";
    const disposition = html.find('#disposition').val() || "neutral";
    const requestDescription = html.find('#request-description').val() || "request";
    const columnShift = parseInt(html.find('#column-shift').val()) || 0;
  
    console.log("Selected identity:", identityType);
    console.log("Disposition:", disposition);
    console.log("Request:", requestDescription);
    console.log("Column Shift:", columnShift);
  
    let usedPopValue, identityLabel;
    
    if (identityType === "secret") {
      usedPopValue = secretIdPopularity;
      identityLabel = `Secret ID - ${this.actor.system.identity}`;
    } else {
      usedPopValue = heroPopularity;
      identityLabel = `Hero ID - ${this.actor.name}`;
    }
      
    console.log("Used Popularity Value:", usedPopValue);
    console.log("Label:", identityLabel);
  
    const baseRank = this._getPopularityRank(usedPopValue);
    const shifted = applyColumnShiftToRank(baseRank, usedPopValue, columnShift);
    const effectiveRank = shifted.rank;
    const effectiveValue = shifted.value;
  
    let featColorNeeded = {
      friendly: "Green",
      neutral: "Yellow",
      unfriendly: "Red",
      hostile: "Impossible"
    }[disposition] || "Yellow";
  
    const isNegative = usedPopValue < 0;
    if (isNegative) featColorNeeded = "Yellow";
  
    if (featColorNeeded === "Impossible") {
      ui.notifications.warn("Hostile targets will not respond to Popularity requests.");
      return;
    }
  
    // ✅ Roll the dice and show 3D dice in chat
    const roll = new Roll("1d100");
    await roll.evaluate();
  
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} - ${identityLabel} Popularity Roll for ${requestDescription}`,
      rollMode: game.settings.get("core", "rollMode")
    });
  
    // ✅ Now apply roll logic
    const resultColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
    const color = resultColor.toLowerCase();
  
    const success =
      (featColorNeeded === "Green" && ["green", "yellow", "red"].includes(color)) ||
      (featColorNeeded === "Yellow" && ["yellow", "red"].includes(color)) ||
      (featColorNeeded === "Red" && color === "red");
  
    const rankDisplay = getPopularityRankWithRange(effectiveValue, this);
  
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${identityLabel} Popularity Roll for ${requestDescription}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>${identityLabel}</div>

          <div>Popularity: ${usedPopValue}${isNegative ? ' (Negative)' : ''}</div>
          <div>Target Disposition: ${disposition.charAt(0).toUpperCase() + disposition.slice(1)}</div>
          <div>Required FEAT: ${featColorNeeded}</div>
          <div>Column Shift: ${columnShift >= 0 ? "+" + columnShift : columnShift}</div>
          <div>Effective Rank: ${rankDisplay}</div>
          <div>Roll: ${roll.total}</div>
          ${isMutant ? '<div style="color: #aa6600;">Mutant Penalty Applied (-1 to awards/penalties)</div>' : ''}
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px;
          background-color: ${color === 'white' ? '#f8f8f8' :
            color === 'green' ? '#4CAF50' :
            color === 'yellow' ? '#FFD700' : '#F44336'};
          color: ${color === 'white' || color === 'yellow' ? '#333' : 'white'};">
          ${resultColor.toUpperCase()}
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${success ? '#4CAF50' : '#F44336'};">
          ${success ? 'SUCCESS: Request Granted' : 'FAILURE: Request Denied'}
        </div>
      </div>
    `;
  
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });
  
    if (isNegative) {
      new Dialog({
        title: "Negative Popularity Karma Loss",
        content: `<p>You lose Karma due to negative popularity.</p>
                  <div><label>Karma Loss:</label> <input type="number" id="karma-loss" value="1" min="1"></div>`,
        buttons: {
          confirm: {
            label: "Confirm",
            callback: html => {
              const loss = parseInt(html.find('#karma-loss').val()) || 1;
              const current = this.actor.system.attributes.karma.value;
              this.actor.update({ "system.attributes.karma.value": Math.max(0, current - loss) });
              ui.notifications.info(`${this.actor.name} lost ${loss} Karma.`);
            }
          }
        },
        default: "confirm"
      }).render(true);
    }
  }

// Add this helper method to the FaseripActorSheet class
_getPopularityRank(value) {
  if (value <= 0) return "Shift-0";
  if (value <= 2) return "Feeble";
  if (value <= 4) return "Poor";
  if (value <= 7) return "Typical";
  if (value <= 15) return "Good";
  if (value <= 25) return "Excellent";
  if (value <= 35) return "Remarkable";
  if (value <= 45) return "Incredible";
  if (value <= 62) return "Amazing";
  if (value <= 87) return "Monstrous";
  if (value <= 125) return "Unearthly";
  if (value <= 175) return "Shift-X";
  if (value <= 350) return "Shift-Y";
  if (value <= 999) return "Shift-Z";
  if (value <= 3000) return "Class 1000";
  if (value <= 5000) return "Class 3000";
  return "Class 5000";
}

// New method: _rollVehicleControl(vehicle)
_rollVehicleControl(vehicle) {
  const actor = this.actor;
  const agility = actor.system.abilities.agility?.value ?? 6;
  const rankTable = [
    "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
    "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
    "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];
  const rankValues = Object.fromEntries(rankTable.map((r, i) => [r, [0, 2, 4, 6, 10, 20, 30, 40, 50, 75, 100, 150, 200, 500, 1000, 3000, 5000, 10000][i]]));
  const colorStyles = {
    white: '#f8f8f8', green: '#4CAF50', yellow: '#FFD700', red: '#F44336'
  };
  const textColor = (c) => ["white", "yellow"].includes(c) ? "#333" : "white";

  const controlRank = vehicle.system.control || "Typical";
  const controlCSLoss = vehicle.system.controlCSLoss || 0;
  const rawControlValue = rankValues[controlRank] ?? 6;
  const controlValue = Math.max(0, rawControlValue - (controlCSLoss * 2));

  // Figure out adjusted control rank after CS loss
  const adjustedControlRank = Object.entries(rankValues).find(([_, v]) => v === controlValue)?.[0] || "Unknown";

  const usedValue = Math.min(agility, controlValue);
  const baseUsedRank = Object.entries(rankValues).find(([_, v]) => v === usedValue)?.[0] || "Typical";
  const baseRankIndex = rankTable.indexOf(baseUsedRank);

  // 🧱 Prevent control roll if vehicle is destroyed
  const bodyRank = vehicle.system.body || "Typical";
  const maxHP = rankValues[bodyRank] ?? 6;
  const currentHP = vehicle.system.bodyHP ?? maxHP;

  if (currentHP <= 0) {
    const message = `${actor.name} attempts to operate <strong>${vehicle.name}</strong>, but it is <span style="color:#b00"><strong>destroyed</strong></span> and cannot be controlled.`;

    // UI popup
    ui.notifications.error(`${vehicle.name} is destroyed and cannot be operated.`);

    // Chat card
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="border:1px solid #aaa; padding:10px; background:#fbeaea; border-radius:5px;">
          <h3>Vehicle Control Attempt</h3>
          <p>${message}</p>
        </div>
      `
    });

    return;
  }

  new Dialog({
    title: `Vehicle Control FEAT: ${vehicle.name}`,
    content: `
      <p><strong>${actor.name}</strong> is attempting to control <em>${vehicle.name}</em>.</p>
      <p>Used Rank: <b>${baseUsedRank}</b> (${usedValue})</p>
      <div><label>Column Shifts (CS):</label><input id="cs" type="number" value="0"></div>
      <div><label>Karma Spent:</label><input id="karma" type="number" value="0"></div>
      <div><label>Attempting Stunt?</label> <input type="checkbox" id="stunt-check"> <input id="stunt-name" type="text" placeholder="e.g., Bootleg Turn" style="width: 60%; margin-left: 8px;"></div>
      <div><label>Crash Object:</label>
        <select id="crash-object">
          ${rankTable.slice(0, 10).map(r => `<option value="${r}" ${r === "Excellent" ? "selected" : ""}>${r}</option>`).join('')}
        </select>
      </div>
      <div><label>Passengers Buckled In?</label>
        <select id="buckled">
          <option value="yes">Yes (Blunt)</option>
          <option value="no">No (Edged)</option>
        </select>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll",
        callback: async html => {
          const cs = parseInt(html.find("#cs").val()) || 0;
          const karma = parseInt(html.find("#karma").val()) || 0;
          const crashObjRank = html.find("#crash-object").val();
          const buckled = html.find("#buckled").val();
          const stunt = html.find("#stunt-check")[0].checked;
          const stuntName = html.find("#stunt-name").val();

          const shiftedIndex = Math.min(Math.max(baseRankIndex + cs, 0), rankTable.length - 1);
          const shiftedRank = rankTable[shiftedIndex];
          const shiftedValue = rankValues[shiftedRank];

          const controlRoll = new Roll("1d100");
          await controlRoll.evaluate();
          await controlRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor.name} makes a Vehicle Control FEAT${stunt ? ` to perform a stunt: ${stuntName}` : ""}`
          });

          const controlTotal = controlRoll.total + karma;

          const getFEATColor = (rank, total) => {
            const [g, y, r] = {
              "Shift-0": [0, 36, 66], "Feeble": [6, 26, 56], "Poor": [16, 36, 66],
              "Typical": [26, 46, 76], "Good": [36, 56, 86], "Excellent": [46, 66, 91],
              "Remarkable": [51, 71, 96], "Incredible": [61, 81, 96], "Amazing": [66, 86, 96],
              "Monstrous": [71, 91, 96], "Unearthly": [76, 96, 100], "Shift-X": [91, 98, 100],
              "Shift-Y": [96, 99, 100], "Shift-Z": [98, 100, 100], "Class 1000": [100, 100, 100],
              "Class 3000": [100, 100, 100], "Class 5000": [100, 100, 100], "Beyond": [100, 100, 100]
            }[rank] ?? [36, 66, 91];
            if (total < g) return "white";
            if (total < y) return "green";
            if (total < r) return "yellow";
            return "red";
          };

          const featColor = getFEATColor(shiftedRank, controlTotal).toLowerCase();
          const isCrash = featColor === "white";
          const stuntFailure = stunt && isCrash;
          let crashDetails = "";

          if (isCrash) {
            const speedRank = vehicle.system.speed || "Typical";
            const bodyRank = vehicle.system.body || "Typical";
            const vehicleStrengthRank = rankValues[speedRank] <= rankValues[bodyRank] ? speedRank : bodyRank;
            const crashRoll = new Roll("1d100"); await crashRoll.evaluate();
            const crashColor = getFEATColor(vehicleStrengthRank, crashRoll.total).toLowerCase();
            const brokeThrough = crashColor === "red";
            const baseDamageRank = brokeThrough ? crashObjRank : speedRank;
            const baseDamage = rankValues[baseDamageRank];
            const protectionRank = vehicle.system.protection || "Typical";
            const protection = rankValues[protectionRank];
            const netDamage = Math.max(0, baseDamage - protection);

            const bodyValue = rankValues[bodyRank];
            const damageLevel = baseDamage > bodyValue ? "greater" : baseDamage === bodyValue ? "equal" : "less";
            const damageRoll = new Roll("1d100"); await damageRoll.evaluate();
            const damageColor = getFEATColor(bodyRank, damageRoll.total).toLowerCase();
            let outcome = "";
            if (damageLevel === "greater") {
              outcome = damageColor === "red" ? "Body -1CS" : damageColor === "yellow" ? "Speed -1CS, Control FEAT required" : damageColor === "green" ? "Control -1CS, Control FEAT required" : "All -1CS, Vehicle out of control!";
            } else if (damageLevel === "equal") {
              outcome = damageColor === "red" ? "No damage to vehicle" : damageColor === "yellow" ? "Body -1CS" : damageColor === "green" ? "Speed -1CS, Control FEAT required" : "Control -1CS, Control FEAT required";
            } else {
              outcome = ["red", "yellow"].includes(damageColor) ? "No effect" : damageColor === "green" ? "Body -1CS, Control FEAT required" : "Control -1CS, damage to passengers, Control FEAT required";
            }

            // Apply damage effects to the vehicle's system
            let updateData = {};
            if (damageLevel === "greater") {
              if (damageColor === "red") updateData["system.bodyCSLoss"] = (vehicle.system.bodyCSLoss || 0) + 1;
              if (damageColor === "yellow") updateData["system.speedCSLoss"] = (vehicle.system.speedCSLoss || 0) + 1;
              if (damageColor === "green") updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              if (damageColor === "white") {
                updateData["system.bodyCSLoss"] = (vehicle.system.bodyCSLoss || 0) + 1;
                updateData["system.speedCSLoss"] = (vehicle.system.speedCSLoss || 0) + 1;
                updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              }
            } else if (damageLevel === "equal") {
              if (damageColor === "yellow") updateData["system.bodyCSLoss"] = (vehicle.system.bodyCSLoss || 0) + 1;
              if (damageColor === "green") updateData["system.speedCSLoss"] = (vehicle.system.speedCSLoss || 0) + 1;
              if (damageColor === "white") updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
            } else {
              if (damageColor === "green") updateData["system.bodyCSLoss"] = (vehicle.system.bodyCSLoss || 0) + 1;
              if (damageColor === "white") {
                updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              }
            }

            // Apply net passenger damage to vehicle HP
            // Calculate max HP from body rank (reuse bodyRank from earlier)
            const maxHP = rankValues[bodyRank] ?? 6;
            const currentHP = vehicle.system.bodyHP ?? maxHP;

            // Apply net passenger damage to vehicle HP
            updateData["system.bodyHP"] = Math.max(0, currentHP - netDamage);

            // Commit the changes
            await vehicle.update(updateData);

            // Add a destruction warning if HP hits zero
            if (updateData["system.bodyHP"] === 0) {
              outcome += " Vehicle destroyed!";
            }

            crashDetails = `
              <hr>
              <div><strong>Crash Result:</strong></div>
              <div>Crash Roll: ${crashRoll.total}</div>
              <div style="text-align:center;padding:6px;margin:5px 0;font-weight:bold;font-size:1em;border-radius:3px;
                background-color:${colorStyles[crashColor]};color:${textColor(crashColor)};">
                Crash FEAT: ${crashColor.toUpperCase()}
              </div>
              <div>${brokeThrough ? "Vehicle broke through!" : "Vehicle stopped."}</div>
              <div>Damage Rank: ${baseDamageRank} → ${baseDamage} - ${protection} = ${netDamage}</div>
              <div>Post-Crash FEAT Roll: ${damageRoll.total}</div>
              <div style="text-align:center;padding:6px;margin:5px 0;font-weight:bold;font-size:1em;border-radius:3px;
                background-color:${colorStyles[damageColor]};color:${textColor(damageColor)};">
                Post-Crash Result: ${damageColor.toUpperCase()}
              </div>
              <div><strong>${stuntFailure ? `STUNT FAILED – ${stuntName} failed and crashed!` : outcome}</strong></div>`;
          }

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="border:1px solid gray;padding:10px;background:#f5f5f5">
                <h3>${actor.name} - Vehicle Control FEAT</h3>
                <p>Control Rank: ${controlRank}${controlCSLoss > 0 ? ` -${controlCSLoss}CS → ${adjustedControlRank}` : ""}</p>
                <p>Used Rank: ${baseUsedRank} → ${shiftedRank}</p>
                <p>Roll: ${controlRoll.total} + Karma ${karma} = ${controlTotal}</p>
                <div style="text-align:center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px;
                  background-color: ${colorStyles[featColor]}; color: ${textColor(featColor)};">
                  ${stuntFailure ? `STUNT FAILED – ${stuntName || "Unnamed stunt"}` : (isCrash ? "OUT OF CONTROL!" : "CONTROL MAINTAINED")} (${featColor.toUpperCase()})
                </div>
                ${crashDetails}
              </div>`
          });
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}
  
  // other methods
}