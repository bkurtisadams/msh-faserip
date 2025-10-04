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
// scripts/actorSheet.js  — replace the whole function with this version
export function applyColumnShiftToRank(rankName, currentValue, csShift) {
  // Keep the canonical list here
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

  // --- normalize input names so "Shift X" and "Shift-X" match
  const normalize = (s) => {
    if (!s) return s;
    return s
      .replace(/^Shift\s*X$/i, "Shift-X")
      .replace(/^Shift\s*Y$/i, "Shift-Y")
      .replace(/^Shift\s*Z$/i, "Shift-Z")
      .replace(/^Shift\s*0$/i, "Shift-0");
  };

  const normalizedName = normalize(rankName);

  // 1) Try exact name match
  let index = rankList.findIndex(r => r.name === normalizedName);

  // 2) Fallback by value: pick the HIGHEST rank whose min <= value
  if (index === -1) {
    if (typeof currentValue === "number" && !Number.isNaN(currentValue)) {
      for (let i = rankList.length - 1; i >= 0; i--) {
        if (currentValue >= rankList[i].min) { index = i; break; }
      }
    }
    if (index === -1) index = 0;
  }

  // Apply column shift and clamp
  const newIndex = Math.max(0, Math.min(rankList.length - 1, index + (csShift || 0)));
  const newRank = rankList[newIndex];

  return { rank: newRank.name, value: newRank.min };
}


export class FaseripActorSheet extends ActorSheet {
  // Add a property to track the biography toggle state
  _isBiographyOpen = false;
  
  // Add a property for the character creation manager
  _charCreationManager = null; // NEW PROPERTY
  
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      width: 650,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", initial: "powers" },
        { navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", tab: "create-character", label: "Creator" }],
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

    // Use availableKarma getter for the bottom left display (lifetime calculation)
    context.availableKarma = this.actor.availableKarma;

    // Keep currentKarma for R+I+P display if needed elsewhere
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

    context.editable = this.isEditable;

    // karma - FIX: Define karma variable first
    const karma = context.system.karma || {};
    const lifetime = karma.lifetime || 0;
    const advancement = karma.advancement || 0;
    const pool = karma.pool || 0;

    // Daily karma data - FIX: Now karma is defined
    const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
    context.dailyKarmaEnabled = dailyKarmaEnabled;
    context.dailyKarmaMax = karma.dailyKarmaMax || 0;
    context.dailyKarmaUsed = karma.dailyKarmaUsed || 0;
    context.dailyKarmaRemaining = Math.max(0, context.dailyKarmaMax - context.dailyKarmaUsed);

    let spent = 0;
    if (Array.isArray(karma.history)) {
      for (const event of karma.history) {
        if (event.amount < 0 && event.type !== "Daily Roll") spent += Math.abs(event.amount);
      }
    }

    context.availableKarma = Math.max(0, lifetime - spent - advancement - pool);
    return context;
  }

  /** @override */
  _updateObject(event, formData) {
    // Expand the form data
    const expandedData = foundry.utils.expandObject(formData);

    // Call the parent update
    return super._updateObject(event, expandedData);
  }

  // Replace your existing _onDragStart method with this one
  _onDragStart(event) {
    // Don't process if shift key is held (let the specific item handlers manage sorting)
    if (event.shiftKey) return;
    
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (item) {
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

    // Debug resistances data structure
    console.log("Actor resistances on sheet load:", this.actor.system.resistances);
    console.log("Resistances type:", typeof this.actor.system.resistances);
    console.log("Is array:", Array.isArray(this.actor.system.resistances));

    html.on("click", ".effect-control", (ev) => {
      const row = ev.currentTarget.closest("li");
      const document =
        row?.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row?.dataset.parentId);
      onManageActiveEffect(ev, document);
    });

    // universal roll trigger listener
    html.find('.universal-roll-trigger').click(ev => {
      ev.preventDefault();
      game.msh.openUniversalTableDialog?.(this.actor);
    });

    // Make the universal roll trigger draggable for macros
    html.find('.universal-roll-trigger').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        // Use the same format as item drag handling
        const actorId = this.actor.id;
        
        // Create dragData similar to item drag data but for universal table
        const dragData = {
          type: "UniversalTable",
          actorId: actorId,
          // You can include other data needed for the universal table
          data: {
            name: `Universal Table (${this.actor.name})`,
            img: "icons/svg/d20-grey.svg"
          }
        };
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Talents - draggable and sortable
    html.find('.talent-item').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
    
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "TalentSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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
    
        try {
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
        } catch (err) {
          console.error("Error in talent drag and drop:", err);
        }
      });
    });

    // Contacts made draggable/sortable w/in the contact tab
    // Contacts - draggable and sortable
    html.find('.contact-item').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
    
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "ContactSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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
    
        try {
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
        } catch (err) {
          console.error("Error in contact drag and drop:", err);
        }
      });
    });
    
    // Equipment - draggable and sortable
    html.find('.equipment-row').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;

        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "EquipmentSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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

        try {
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
        } catch (err) {
          console.error("Error in equipment drag and drop:", err);
        }
      });
    });

    // Make entire vehicle rows draggable (like powers and talents)
    html.find('.vehicle-row').each((i, row) => {
      // No need to set draggable="true" here if it's already in the HTML
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
        
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "VehicleSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "VehicleSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "vehicle")
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
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
        } catch (err) {
          console.error("Error in vehicle drag and drop:", err);
        }
      });
    });

    // Headquarters - draggable and sortable
    html.find('.headquarters-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        // If shift key is pressed, do sorting, otherwise create a macro
        let dragData;
        if (ev.shiftKey) {
          dragData = {
            type: "HeadquartersSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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

    // <-- NEW BUTTON START -->
    // Reset Daily Karma button (available to all users)
    html.find('.reset-daily-karma-button').click(async ev => {
      const karmaSheetModule = await import('./karma.js');
      const sheet = new karmaSheetModule.KarmaSheet(this.actor);
      await sheet._onResetDailyKarma(ev);
      this.render(false); // Re-render actor sheet after reset
    });
    // <-- NEW BUTTON END -->

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
    // Powers - draggable and sortable
    html.find('.power-row').each((i, row) => {
      // We don't need to set draggable=true here since it's already in the HTML
      
      row.addEventListener("dragstart", ev => {
        console.log("Power drag start", ev.shiftKey);
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
        
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "PowerSort",
            itemId: itemId
          };
          console.log("Power sort drag", dragData);
        } else {
          // Hotbar macro drag
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
          console.log("Power hotbar drag", dragData);
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          console.log("Drop data", sourceData);
          
          if (sourceData.type !== "PowerSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "power")
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
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

          console.log("Updating items with new sort order", updates);
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in power drag and drop:", err);
        }
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
      
      // Handle different data structures for resistances
      let resistances;
      if (Array.isArray(this.actor.system.resistances)) {
        resistances = this.actor.system.resistances;
      } else if (this.actor.system.resistances && typeof this.actor.system.resistances === 'object') {
        resistances = Object.values(this.actor.system.resistances);
      } else {
        resistances = [];
      }
      
      const resistance = resistances[index];
      
      if (!resistance) {
        console.error("No resistance found at index:", index);
        return;
      }
      
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
              <option value="Shift-X">Shift-X</option>
              <option value="Shift-Y">Shift-Y</option>
              <option value="Shift-Z">Shift-Z</option>
              <option value="Class 1000">Class 1000</option>
              <option value="Class 3000">Class 3000</option>
              <option value="Class 5000">Class 5000</option>
              <option value="Beyond">Beyond</option>
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
              
              // Ensure we're working with an array
              let updatedResistances;
              if (Array.isArray(this.actor.system.resistances)) {
                updatedResistances = foundry.utils.deepClone(this.actor.system.resistances);
              } else {
                updatedResistances = Object.values(this.actor.system.resistances || {});
              }
              
              updatedResistances[index] = {
                type: newType,
                rank: newRank,
                value: newValue
              };
              
              // Update the actor
              this.actor.update({
                "system.resistances": updatedResistances
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
      
      console.log("Delete resistance - index:", index);
      console.log("Current resistances:", this.actor.system.resistances);
      console.log("Resistances type:", typeof this.actor.system.resistances);
      console.log("Is array:", Array.isArray(this.actor.system.resistances));
      
      // Handle different data structures
      let resistances;
      if (Array.isArray(this.actor.system.resistances)) {
        resistances = foundry.utils.deepClone(this.actor.system.resistances);
      } else if (this.actor.system.resistances && typeof this.actor.system.resistances === 'object') {
        // Convert object to array if needed
        resistances = Object.values(this.actor.system.resistances);
        console.log("Converted object to array:", resistances);
      } else {
        // Initialize as empty array if undefined
        resistances = [];
        console.log("Initialized empty array");
      }

      if (index >= 0 && index < resistances.length) {
        console.log("Removing resistance at index:", index, "Resistance:", resistances[index]);
        resistances.splice(index, 1);
        await this.actor.update({ "system.resistances": resistances });
        console.log("Updated resistances:", resistances);
      } else {
        console.error("Invalid resistance index:", index, "Array length:", resistances.length);
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

      // Use the same roll function as macros (which has range penalties)
      return game.msh.rollPower(this.actor, item);
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // roll talent button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.talent-roll').click(async ev => {
      const actor = this.actor;
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Call the centralized talent roll function
      await game.msh.rollTalent(actor, item);
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
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll Contact button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.contact-roll').click(async ev => {
      const actor = this.actor;
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

              let cappedTotal = roll.total;
              let karmaUsed = 0;

              // <-- NEW/MODIFIED SECTION START -->
              const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
              let dailyKarmaUsedAmount = 0;
              let lifetimeKarmaUsedAmount = 0;

              // Replace the complex daily karma logic with this simpler version:
              if (karma > 0) {
                /* const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
                let dailyKarmaUsedAmount = 0;
                let lifetimeKarmaUsedAmount = 0; */

                if (dailyKarmaEnabled) {
                  const dailyRemaining = this.actor.system.karma.dailyKarmaMax - (this.actor.system.karma.dailyKarmaUsed || 0);
                  if (dailyRemaining > 0) {
                    // Use daily karma first (no history entry needed)
                    dailyKarmaUsedAmount = Math.min(karma, dailyRemaining);
                    cappedTotal = Math.min(100, roll.total + dailyKarmaUsedAmount);
                    
                    // Update daily usage immediately
                    await game.msh.runAsGM({
                      operation: 'update',
                      targetActorUuid: this.actor.uuid,
                      args: [{ "system.karma.dailyKarmaUsed": (this.actor.system.karma.dailyKarmaUsed || 0) + dailyKarmaUsedAmount }]
                    });
                    
                    // If we need more karma than daily provides, use lifetime
                    const remainingNeeded = karma - dailyKarmaUsedAmount;
                    if (remainingNeeded > 0) {
                      lifetimeKarmaUsedAmount = remainingNeeded;
                      cappedTotal = Math.min(100, cappedTotal + lifetimeKarmaUsedAmount);
                    }
                  } else {
                    // No daily karma left, use lifetime
                    lifetimeKarmaUsedAmount = karma;
                    cappedTotal = Math.min(100, roll.total + lifetimeKarmaUsedAmount);
                  }
                } else {
                  // Daily karma disabled, use lifetime
                  lifetimeKarmaUsedAmount = karma;
                  cappedTotal = Math.min(100, roll.total + lifetimeKarmaUsedAmount);
                }

                // Only create history entry for lifetime karma spending
                if (lifetimeKarmaUsedAmount > 0) {
                  const historyEntry = {
                    realDate: new Date().toLocaleDateString(),
                    gameDate: "",
                    amount: -lifetimeKarmaUsedAmount,
                    type: "Die Roll",
                    description: `Spent lifetime karma on [ability/power/etc] roll`
                  };
                  
                  const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
                  currentHistory.push(historyEntry);
                  
                  await game.msh.runAsGM({
                    operation: 'update',
                    targetActorUuid: this.actor.uuid,
                    args: [{ "system.karma.history": currentHistory }]
                  });
                }
              }

              const historyUpdates = [];
              if (dailyKarmaUsedAmount > 0) {
                historyUpdates.push({
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -dailyKarmaUsedAmount,
                  type: "Daily Roll",
                  description: `Spent daily karma on ${item.name} (Contact)`
                });
              }
              if (lifetimeKarmaUsedAmount > 0) {
                historyUpdates.push({
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -lifetimeKarmaUsedAmount,
                  type: "Die Roll",
                  description: `Spent lifetime karma on ${item.name} (Contact)`
                });
              }

              if (historyUpdates.length > 0) {
                const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
                const newHistory = currentHistory.concat(historyUpdates);
                
                await game.msh.runAsGM({
                  operation: 'update',
                  targetActorUuid: actor.uuid,
                  args: [{ "system.karma.history": newHistory }]
                });
                // No need to call _updateCurrentKarma here, prepareData handles it on sheet re-render
              }
              // <-- NEW/MODIFIED SECTION END -->

              const totalKarmaUsed = dailyKarmaUsedAmount + lifetimeKarmaUsedAmount;

              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} contacts ${item.name}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }

              // Calculate the result
              //const totalRoll = roll.total + karma;
              const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
              //highlightResultCell(effectiveRank, cappedTotal);

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

                <div>Roll: ${roll.total} + Karma: ${totalKarmaUsed} = ${cappedTotal}</div>

                </div>
              <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                  resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                    resultColor.toLowerCase() === 'yellow' ? 'FFC107' :
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll equipment button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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

    // Headquarters - draggable and sortable
html.find('.headquarters-draggable').each((i, el) => {
  el.setAttribute("draggable", true);
  el.addEventListener("dragstart", ev => {
    const itemId = el.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    // Default to item drag (for macros/hotbar)
    let dragData = {
      type: "Item",
      uuid: item.uuid
    };
    
    // If holding shift, do sorting instead
    if (ev.shiftKey) {
      dragData = {
        type: "HeadquartersSort",
        itemId: itemId
      };
    }
    
    ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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

    try {
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
    } catch (err) {
      console.error("Error in headquarters drag and drop:", err);
    }
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
      ev.preventDefault();
    
      // Ctrl+Click opens the info dialog
      if (ev.ctrlKey) {
        this._showResourceInfoDialog();
      } else {
        // Plain click rolls instantly
        this._onResourceRoll();
      }
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
    // Find the ability FEAT roll buttons section in activateListeners(html)
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
      const savedIntensity = this.actor.getFlag("msh-faserip", `last${abilityFullName}Intensity`) || "None";
      const skipDiceRoll = this.actor.getFlag("msh-faserip", `last${abilityFullName}SkipDiceRoll`) || false;
      
      // Define all available ranks for intensity dropdown
      const allRanks = [
        "None", "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      // Create options HTML for intensity dropdown
      const intensityOptionsHTML = allRanks.map(rank => 
        `<option value="${rank}" ${rank === savedIntensity ? 'selected' : ''}>${rank}</option>`
      ).join('');
      
      // Create dialog for roll options
      let dialogContent = `
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Ability Rank:</label>
          <input type="text" id="ability-rank" name="abilityRank" value="${abilityRank}" style="width: 100px;" readonly>
          <span style="margin-left: 5px;">(${abilityValue})</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Intensity:</label>
          <select id="intensity" name="intensity" style="width: 120px;">
            ${intensityOptionsHTML}
          </select>
        </div>
        <div style="margin-bottom: 10px;" id="feat-requirement">
          <label style="display: inline-block; width: 120px;">Required FEAT:</label>
          <span id="required-feat-text" style="font-weight: bold;">Any Color</span>
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
            Remember settings for future rolls
          </label>
        </div>
        <div>
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>`;
      
      const dialog = new Dialog({
        title: `${abilityFullName} FEAT Roll: ${this.actor.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const intensity = html.find('[name="intensity"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              
              // Save settings if requested
              if (saveSettings) {
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}ColumnShift`, columnShift);
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}Intensity`, intensity);
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
              
              // Determine FEAT requirement and possibility
              let featRequirement = "Any Color";
              let isImpossible = false;
              let isAutomatic = false;
              
              if (intensity !== "None") {
                const { requirement, impossible, automatic } = this._determineFeatRequirement(effectiveRank, intensity);
                featRequirement = requirement;
                isImpossible = impossible;
                isAutomatic = automatic;
              }
              
              // Handle impossible FEAT
              if (isImpossible) {
                ui.notifications.warn(`FEAT is impossible: ${effectiveRank} ability vs ${intensity} intensity. Need ability to be within one rank of intensity.`);
                return;
              }
              
              // Handle automatic FEAT
              if (isAutomatic) {
                const content = `
                  <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                    <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                      <strong>${this.actor.name} - ${abilityFullName} FEAT Roll vs ${intensity}</strong>
                    </div>
                    <div style="padding: 5px 10px; font-size: 0.9em;">
                      <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                      ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                      <div>Intensity: ${intensity}</div>
                      <div>Ability rank is 3+ ranks higher than intensity</div>
                    </div>
                    <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                      background-color: #4CAF50; color: white;">
                      AUTOMATIC SUCCESS
                    </div>
                  </div>
                `;
                
                // Send to chat
                await ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  content: content
                });
                return;
              }
              
              // Create the roll
              const roll = new Roll("1d100");
              
              // Evaluate the roll
              await roll.evaluate();
              
              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} makes a ${abilityFullName} FEAT roll${intensity !== "None" ? ` vs ${intensity} intensity` : ""}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }
              
              // Calculate the result with karma
              let cappedTotal = roll.total;

              const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
              let dailyKarmaUsedAmount = 0;
              let lifetimeKarmaUsedAmount = 0;

              // Replace the complex daily karma logic with this simpler version:
              if (karma > 0) {
                if (dailyKarmaEnabled) {
                  const dailyRemaining = this.actor.system.karma.dailyKarmaMax - (this.actor.system.karma.dailyKarmaUsed || 0);
                  if (dailyRemaining > 0) {
                    // Use daily karma first (no history entry needed)
                    dailyKarmaUsedAmount = Math.min(karma, dailyRemaining);
                    cappedTotal = Math.min(100, roll.total + dailyKarmaUsedAmount);
                    
                    // Update daily usage immediately
                    await game.msh.runAsGM({
                      operation: 'update',
                      targetActorUuid: this.actor.uuid,
                      args: [{ "system.karma.dailyKarmaUsed": (this.actor.system.karma.dailyKarmaUsed || 0) + dailyKarmaUsedAmount }]
                    });
                    
                    // If we need more karma than daily provides, use lifetime
                    const remainingNeeded = karma - dailyKarmaUsedAmount;
                    if (remainingNeeded > 0) {
                      lifetimeKarmaUsedAmount = remainingNeeded;
                      cappedTotal = Math.min(100, cappedTotal + lifetimeKarmaUsedAmount);
                    }
                  } else {
                    // No daily karma left, use lifetime
                    lifetimeKarmaUsedAmount = karma;
                    cappedTotal = Math.min(100, roll.total + lifetimeKarmaUsedAmount);
                  }
                } else {
                  // Daily karma disabled, use lifetime
                  lifetimeKarmaUsedAmount = karma;
                  cappedTotal = Math.min(100, roll.total + lifetimeKarmaUsedAmount);
                }

                // Only create history entry for lifetime karma spending
                if (lifetimeKarmaUsedAmount > 0) {
                  const historyEntry = {
                    realDate: new Date().toLocaleDateString(),
                    gameDate: "",
                    amount: -lifetimeKarmaUsedAmount,
                    type: "Die Roll",
                    description: `Spent lifetime karma on ${abilityFullName} FEAT roll`
                  };
                  
                  const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
                  currentHistory.push(historyEntry);
                  
                  await game.msh.runAsGM({
                    operation: 'update',
                    targetActorUuid: this.actor.uuid,
                    args: [{ "system.karma.history": currentHistory }]
                  });
                }
              }

              const historyUpdates = [];
              if (dailyKarmaUsedAmount > 0) {
                historyUpdates.push({
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -dailyKarmaUsedAmount,
                  type: "Daily Roll",
                  description: `Spent daily karma on ${abilityFullName} FEAT roll`
                });
              }
              if (lifetimeKarmaUsedAmount > 0) {
                historyUpdates.push({
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -lifetimeKarmaUsedAmount,
                  type: "Die Roll",
                  description: `Spent lifetime karma on ${abilityFullName} FEAT roll`
                });
              }

              if (historyUpdates.length > 0) {
                const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
                const newHistory = currentHistory.concat(historyUpdates);
                
                await game.msh.runAsGM({
                  operation: 'update',
                  targetActorUuid: this.actor.uuid,
                  args: [{ "system.karma.history": newHistory }]
                });
              }

              const totalKarmaUsed = dailyKarmaUsedAmount + lifetimeKarmaUsedAmount;

              const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
              
              // Check if FEAT succeeded based on intensity requirement
              let featSuccess = true;
              if (intensity !== "None") {
                featSuccess = this._checkFeatSuccess(resultColor, featRequirement);
              }
              
              // Create chat message styled to match your existing output format
              let content = `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                  <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                    <strong>${this.actor.name} - ${abilityFullName} FEAT Roll${intensity !== "None" ? ` vs ${intensity}` : ""}</strong>
                  </div>
                  <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                    ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                    ${intensity !== "None" ? `<div>Intensity: ${intensity} (Required: ${featRequirement})</div>` : ''}
                    <div>Roll: ${roll.total} + Karma: ${totalKarmaUsed} = ${cappedTotal}</div>
                  </div>
                  <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                    background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                      resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                        resultColor.toLowerCase() === 'yellow' ? '#FFC107' :
                          '#F44336'}; 
                    color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                    ${resultColor.toUpperCase()} RESULT
                  </div>
                  ${intensity !== "None" ? `
                    <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
                      ${featSuccess ? 'FEAT SUCCEEDED' : 'FEAT FAILED'}
                    </div>
                  ` : ''}
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
        default: "roll",
        render: html => {
          // Function to update FEAT requirement display
          const updateFeatRequirement = () => {
            const intensity = html.find('#intensity').val();
            const columnShift = parseInt(html.find('#shift').val()) || 0;
            const reqText = html.find('#required-feat-text');
            
            if (intensity === "None") {
              reqText.text("Any Color").css('color', '#333');
              return;
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
              }
            }
            
            const { requirement, impossible, automatic } = this._determineFeatRequirement(effectiveRank, intensity);
            
            if (impossible) {
              reqText.text("IMPOSSIBLE").css('color', '#F44336');
            } else if (automatic) {
              reqText.text("AUTOMATIC").css('color', '#4CAF50');
            } else {
              reqText.text(requirement).css('color', '#333');
            }
          };
          
          // Update on intensity or column shift change
          html.find('#intensity, #shift').on('change', updateFeatRequirement);
          
          // Initial update
          updateFeatRequirement();
        }
      }).render(true);
    });

    // === STUNTS TAB LISTENERS ===
    // Stunts Tab - Add stunt
    html.find('.add-stunt-general').click(async ev => {
      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      const rankOptions = ranks.map(r => `<option value="${r}">${r}</option>`).join('');
      
      new Dialog({
        title: "Add Power Stunt",
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" placeholder="e.g., Triple Teleport" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>Rank:</label>
              <select name="rank" id="stunt-rank-select" style="width: 150px;">
                ${rankOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Rank Number:</label>
              <input type="number" name="value" value="6" min="0" style="width: 100px;" />
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" placeholder="Describe what this stunt does..." style="width: 100%;"></textarea>
            </div>
            <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
              <strong>Note:</strong> First use will require a Red FEAT and cost 100 Karma.
            </p>
          </form>
        `,
        buttons: {
          create: {
            icon: '<i class="fas fa-plus"></i>',
            label: "Create Stunt",
            callback: async html => {
              const name = html.find('[name="name"]').val()?.trim();
              
              if (!name) {
                ui.notifications.warn("Stunt name is required!");
                return;
              }
              
              const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
              stunts.push({
                name: name,
                rank: html.find('[name="rank"]').val(),
                value: parseInt(html.find('[name="value"]').val()) || 6,
                description: html.find('[name="description"]').val() || "",
                timesUsed: 0
              });
              
              await this.actor.update({ "system.stunts": stunts });
              ui.notifications.info(`Stunt "${name}" created!`);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "create"
      }).render(true);
    });

    // Stunts Tab - Roll stunt
    html.find('.roll-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = this.actor.system.stunts || [];
      const stunt = stunts[stuntIndex];
      
      if (!stunt) return ui.notifications.error("Stunt not found");
      
      await this._rollStandaloneStunt(stunt, stuntIndex);
    });

    // Stunts Tab - Edit stunt
    html.find('.edit-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
      const stunt = stunts[stuntIndex];
      
      if (!stunt) return;
      
      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      const rankOptions = ranks.map(r => 
        `<option value="${r}" ${r === stunt.rank ? 'selected' : ''}>${r}</option>`
      ).join('');
      
      new Dialog({
        title: `Edit Stunt: ${stunt.name}`,
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" value="${stunt.name}" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>Rank:</label>
              <select name="rank" style="width: 150px;">
                ${rankOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Rank Number:</label>
              <input type="number" name="value" value="${stunt.value}" min="0" style="width: 100px;" />
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" style="width: 100%;">${stunt.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>Times Used:</label>
              <input type="number" name="timesUsed" value="${stunt.timesUsed || 0}" min="0" style="width: 100px;" />
              <span style="margin-left: 10px; color: #666;">
                ${stunt.timesUsed < 1 ? 'Red FEAT (100 Karma)' : 
                  stunt.timesUsed < 4 ? 'Yellow FEAT (100 Karma)' : 
                  stunt.timesUsed < 10 ? 'Green FEAT (100 Karma)' : 
                  'Mastered (No Cost)'}
              </span>
            </div>
          </form>
        `,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: async html => {
              stunts[stuntIndex] = {
                name: html.find('[name="name"]').val(),
                rank: html.find('[name="rank"]').val(),
                value: parseInt(html.find('[name="value"]').val()) || 6,
                description: html.find('[name="description"]').val(),
                timesUsed: parseInt(html.find('[name="timesUsed"]').val()) || 0
              };
              await this.actor.update({ "system.stunts": stunts });
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "save"
      }).render(true);
    });

    // Stunts Tab - Delete stunt
    html.find('.delete-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = this.actor.system.stunts || [];
      const stunt = stunts[stuntIndex];
      
      const confirmed = await Dialog.confirm({
        title: "Delete Stunt",
        content: `<p>Are you sure you want to delete the stunt "<strong>${stunt?.name || 'Unknown'}</strong>"?</p>`
      });
      
      if (!confirmed) return;
      
      const updatedStunts = foundry.utils.deepClone(stunts);
      updatedStunts.splice(stuntIndex, 1);
      await this.actor.update({ "system.stunts": updatedStunts });
      this.render(false);
    });

    

    // This serves as a fallback to ensure all draggable items can create macros
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".power-row, .talent-item, .contact-item, .equipment-row, .vehicle-draggable, .headquarters-draggable",
      dropSelector: null,
      permissions: { dragstart: true },
      callbacks: {
          dragstart: (event) => {
              // Don't interfere with shift+drag for sorting
              if (event.shiftKey) return;
              
              const li = event.currentTarget;
              const itemId = li.dataset.itemId;
              const item = this.actor.items.get(itemId);
              if (!item) return;

              console.log("🔥 DragDrop handler creating macro for:", item.name);
              
              // Use the format from the older file for creating macros
              event.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "Item",
                  actorId: this.actor.id,
                  itemId: item.id,
                  uuid: item.uuid,
                  data: item
              }));
          }
      }
  }).bind(html[0]);

      /** @override */
  
    // NEW: Initialize CharacterCreationTabManager if the tab exists
    // We query html[0] because 'html' in activateListeners is a jQuery object
    const creationTabElement = html[0].querySelector('.char-creation-tab');
    if (creationTabElement && !this._charCreationManager) {
        this._charCreationManager = new CharacterCreationTabManager(this.actor, creationTabElement);
    } else if (this._charCreationManager) {
        // If manager already exists (e.g., sheet was re-rendered), ensure it re-renders its content
        // This is important if `saveGeneratedData` is called on the manager, but the main sheet re-renders.
        this._charCreationManager.loadGeneratedData(); // Re-load and render on sheet re-open/re-render
    }

    // Continue with other listeners...
  }

  /**
   * Determine FEAT requirement based on ability rank vs intensity
   * @param {string} abilityRank - The effective ability rank
   * @param {string} intensity - The intensity rank
   * @returns {object} - Object with requirement, impossible, and automatic flags
   */
  _determineFeatRequirement(abilityRank, intensity) {
    const ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];
    
    const abilityIndex = ranks.indexOf(abilityRank);
    const intensityIndex = ranks.indexOf(intensity);
    
    if (abilityIndex === -1 || intensityIndex === -1) {
      return { requirement: "Any Color", impossible: false, automatic: false };
    }
    
    const difference = abilityIndex - intensityIndex;
    
    // Impossible: intensity more than one rank higher than ability
    if (difference < -1) {
      return { requirement: "Red", impossible: true, automatic: false };
    }
    
    // Automatic: intensity three or more ranks lower than ability  
    if (difference >= 3) {
      return { requirement: "Automatic", impossible: false, automatic: true };
    }
    
    // Red FEAT: intensity one rank higher than ability
    if (difference === -1) {
      return { requirement: "Red", impossible: false, automatic: false };
    }
    
    // Yellow FEAT: intensity equal to ability
    if (difference === 0) {
      return { requirement: "Yellow", impossible: false, automatic: false };
    }
    
    // Green FEAT: intensity one or two ranks lower than ability
    if (difference === 1 || difference === 2) {
      return { requirement: "Green", impossible: false, automatic: false };
    }
    
    return { requirement: "Any Color", impossible: false, automatic: false };
  }

  /**
   * Check if a FEAT result meets the requirement
   * @param {string} resultColor - The color result from the universal table
   * @param {string} requirement - The required FEAT color
   * @returns {boolean} - Whether the FEAT succeeded
   */
  _checkFeatSuccess(resultColor, requirement) {
    const color = resultColor.toLowerCase();
    
    switch (requirement) {
      case "Green":
        return ["green", "yellow", "red"].includes(color);
      case "Yellow":
        return ["yellow", "red"].includes(color);
      case "Red":
        return color === "red";
      case "Automatic":
        return true;
      default:
        return true; // Any color succeeds if no specific requirement
    }
  }

  _showResourceInfoDialog() {
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
        <li>If 1–2 ranks lower, a green FEAT is needed.</li>
        <li>If equal to Resource rank, a yellow FEAT is needed.</li>
      </ul>
  
      <h3>Success and Failure</h3>
      <p>Success means the character can purchase the item. Failure indicates the item is too expensive and the character cannot try for any item of that rank or higher for the next week.</p>
  
      <table>
        <tr><th>Resource Rank</th><th>Buying Power</th></tr>
        <tr><td>Shift-0</td><td>Homeless, no income</td></tr>
        <tr><td>Feeble</td><td>Poor, struggling to make ends meet</td></tr>
        <tr><td>Poor</td><td>Low income, basic necessities only</td></tr>
        <tr><td>Typical</td><td>Average income, modest lifestyle</td></tr>
        <tr><td>Good</td><td>Comfortable income, can afford luxuries</td></tr>
        <tr><td>Excellent</td><td>Well-off, upper middle class</td></tr>
        <tr><td>Remarkable</td><td>Wealthy, significant disposable income</td></tr>
        <tr><td>Incredible</td><td>Very wealthy, millionaire</td></tr>
        <tr><td>Amazing</td><td>Extremely wealthy, multi-millionaire</td></tr>
        <tr><td>Monstrous</td><td>Super-rich, billionaire</td></tr>
        <tr><td>Unearthly</td><td>Absurdly wealthy, virtually unlimited resources</td></tr>
      </table>
  
      <h3>Optional Bank Loans</h3>
      <p>Characters may purchase something up to one rank higher than their Resource rank through a bank loan. The character then must make monthly Resource FEATs of two ranks less for as many months as the rank number of the item.</p>
    `;
  
    new Dialog({
      title: "Resources in FASERIP",
      content,
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
  }

  // Resource Roll method
  _onResourceRoll() {
    const resourceRank = this.actor.system.attributes.resources.rank;
    const resourceValue = this.actor.system.attributes.resources.value;
  
    const ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
    ];
  
    // Create dialog for roll options
    const dialogContent = `
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Resource Rank:</label>
        <input type="text" id="resource-rank" value="${resourceRank}" style="width: 100px;" readonly>
        <span style="margin-left: 5px;">(${resourceValue})</span>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Item Cost Rank:</label>
        <select id="item-rank" name="itemRank" style="width: 120px;">
          ${ranks.map(r => `<option value="${r}">${r}</option>`).join("")}
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Item Description:</label>
        <input type="text" id="item-description" style="width: 180px;" placeholder="e.g., Apartment rent">
      </div>
      <div style="margin-bottom: 10px;">
        <label><input type="checkbox" id="bank-loan" name="bankLoan"> Using a bank loan (allows 1 rank higher purchase)</label>
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
            const itemRank = html.find('#item-rank').val();
            const itemDescription = html.find('#item-description').val() || "item";
            const bankLoan = html.find('#bank-loan').is(':checked');
  
            const resourceIndex = ranks.indexOf(resourceRank);
            const itemIndex = ranks.indexOf(itemRank);
  
            if (resourceIndex === -1 || itemIndex === -1) {
              return ui.notifications.error("Invalid rank selection");
            }
  
            // Purchase validation
            if (itemIndex > resourceIndex + (bankLoan ? 1 : 0)) {
              return ui.notifications.warn("Item rank is too high for your resources.");
            }
  
            // Determine required FEAT
            let featColorNeeded;
            const rankDifference = resourceIndex - itemIndex;
  
            if (rankDifference >= 3) {
              featColorNeeded = "Automatic";
            } else if (rankDifference === 1 || rankDifference === 2) {
              featColorNeeded = "Green";
            } else if (rankDifference === 0 || (bankLoan && itemIndex === resourceIndex + 1)) {
              featColorNeeded = "Yellow";
            }
  
            // Roll and evaluate
            const roll = new Roll("1d100");
            await roll.evaluate();
  
            const resultColor = game.msh.rollUniversalTable(resourceRank, roll.total);
            const resultColorLower = resultColor.toLowerCase();
            let success = false;
  
            if (featColorNeeded === "Automatic") success = true;
            else if (featColorNeeded === "Green") success = ["green", "yellow", "red"].includes(resultColorLower);
            else if (featColorNeeded === "Yellow") success = ["yellow", "red"].includes(resultColorLower);
            else if (featColorNeeded === "Red") success = resultColorLower === "red";
  
            // Format chat output
            const colorMap = {
              white: "#f8f8f8",
              green: "#4CAF50",
              yellow: "#FFC107",
              red: "#F44336"
            };
            const textColor = (["white", "yellow"].includes(resultColorLower)) ? "#333" : "white";
  
            const chatContent = `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px;">
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
                  background-color: ${colorMap[resultColorLower]}; color: ${textColor};">
                  ${resultColor.toUpperCase()}
                </div>
                <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${success ? '#4CAF50' : '#F44336'};">
                  ${success ? 'SUCCESS: Purchase Possible' : 'FAILURE: Cannot Afford'}
                </div>
                ${bankLoan && success ? `
                  <div style="padding: 5px 10px; font-size: 0.9em; background-color: #fffde7; border: 1px solid #ffd54f; margin-top: 5px;">
                    <strong>Bank loan approved</strong><br>
                    You must make a ${ranks[Math.max(0, resourceIndex - 2)]} Resource FEAT each month for ${itemIndex + 1} months.
                    <br>Failure to pay results in the bank reclaiming the item.
                  </div>` : ''}
              </div>
            `;
  
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: chatContent
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
            color === 'yellow' ? '#FFC107' : '#F44336'};
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
              // <-- NEW/MODIFIED SECTION START -->
              const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
              let dailyKarmaLoss = 0;
              let lifetimeKarmaLoss = 0;

              if (dailyKarmaEnabled) {
                const dailyRemaining = this.actor.system.karma.dailyKarmaMax - this.actor.system.karma.dailyKarmaUsed;
                dailyKarmaLoss = Math.min(loss, dailyRemaining);
                lifetimeKarmaLoss = Math.max(0, loss - dailyKarmaLoss);
              } else {
                lifetimeKarmaLoss = loss;
              }

              const historyUpdates = [];
              if (dailyKarmaLoss > 0) {
                historyUpdates.push({
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -dailyKarmaLoss,
                  type: "Daily Roll",
                  description: `Lost daily karma from negative popularity`
                });
              }
              if (lifetimeKarmaLoss > 0) {
                historyUpdates.push({
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -lifetimeKarmaLoss,
                  type: "Karma Loss",
                  description: `Lost lifetime karma from negative popularity`
                });
              }

              if (historyUpdates.length > 0) {
                const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
                const newHistory = currentHistory.concat(historyUpdates);
                
                game.msh.runAsGM({
                  operation: 'update',
                  targetActorUuid: this.actor.uuid,
                  args: [{ 
                    "system.karma.history": newHistory,
                    "system.karma.dailyKarmaUsed": (this.actor.system.karma.dailyKarmaUsed || 0) + dailyKarmaLoss
                  }]
                });
                // No need to call _updateCurrentKarma here, prepareData handles it on sheet re-render
              }
              // <-- NEW/MODIFIED SECTION END -->
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
    white: '#f8f8f8', green: '#4CAF50', yellow: '#FFC107', red: '#F44336'
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

          let cappedTotal = controlRoll.total; // <-- NEW LINE
          let karmaUsed = 0; // <-- NEW LINE

          // <-- NEW/MODIFIED SECTION START -->
          const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
          let dailyKarmaUsedAmount = 0;
          let lifetimeKarmaUsedAmount = 0;

          // Replace the complex daily karma logic with this simpler version:
          if (karma > 0) {
            /* const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
            let dailyKarmaUsedAmount = 0;
            let lifetimeKarmaUsedAmount = 0; */

            if (dailyKarmaEnabled) {
              const dailyRemaining = this.actor.system.karma.dailyKarmaMax - (this.actor.system.karma.dailyKarmaUsed || 0);
              if (dailyRemaining > 0) {
                // Use daily karma first (no history entry needed)
                dailyKarmaUsedAmount = Math.min(karma, dailyRemaining);
                cappedTotal = Math.min(100, controlRoll.total + dailyKarmaUsedAmount);
                
                // Update daily usage immediately
                await game.msh.runAsGM({
                  operation: 'update',
                  targetActorUuid: this.actor.uuid,
                  args: [{ "system.karma.dailyKarmaUsed": (this.actor.system.karma.dailyKarmaUsed || 0) + dailyKarmaUsedAmount }]
                });
                
                // If we need more karma than daily provides, use lifetime
                const remainingNeeded = karma - dailyKarmaUsedAmount;
                if (remainingNeeded > 0) {
                  lifetimeKarmaUsedAmount = remainingNeeded;
                  cappedTotal = Math.min(100, cappedTotal + lifetimeKarmaUsedAmount);
                }
              } else {
                // No daily karma left, use lifetime
                lifetimeKarmaUsedAmount = karma;
                cappedTotal = Math.min(100, controlRoll.total + lifetimeKarmaUsedAmount);
              }
            } else {
              // Daily karma disabled, use lifetime
              lifetimeKarmaUsedAmount = karma;
              cappedTotal = Math.min(100, controlRoll.total + lifetimeKarmaUsedAmount);
            }

            // Only create history entry for lifetime karma spending
            if (lifetimeKarmaUsedAmount > 0) {
              const historyEntry = {
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -lifetimeKarmaUsedAmount,
                type: "Die Roll",
                description: `Spent lifetime karma on [ability/power/etc] roll`
              };
              
              const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
              currentHistory.push(historyEntry);
              
              await game.msh.runAsGM({
                operation: 'update',
                targetActorUuid: this.actor.uuid,
                args: [{ "system.karma.history": currentHistory }]
              });
            }
          }

          const historyUpdates = [];
          if (dailyKarmaUsedAmount > 0) {
            historyUpdates.push({
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -dailyKarmaUsedAmount,
              type: "Daily Roll",
              description: `Spent daily karma on Vehicle Control for ${vehicle.name}`
            });
          }
          if (lifetimeKarmaUsedAmount > 0) {
            historyUpdates.push({
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -lifetimeKarmaUsedAmount,
              type: "Die Roll",
              description: `Spent lifetime karma on Vehicle Control for ${vehicle.name}`
            });
          }

          if (historyUpdates.length > 0) {
            const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
            const newHistory = currentHistory.concat(historyUpdates);
            
            await game.msh.runAsGM({
              operation: 'update',
              targetActorUuid: actor.uuid,
              args: [{ "system.karma.history": newHistory }]
            });
            // No need to call _updateCurrentKarma here, prepareData handles it on sheet re-render
          }
          // <-- NEW/MODIFIED SECTION END -->

          const totalKarmaUsed = dailyKarmaUsedAmount + lifetimeKarmaUsedAmount;

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

          const featColor = getFEATColor(shiftedRank, cappedTotal).toLowerCase(); // <-- MODIFIED: Use cappedTotal
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
                <p>Roll: ${controlRoll.total} + Karma ${totalKarmaUsed} = ${cappedTotal}</p> <!-- MODIFIED: use karmaUsed -->
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

  async _rollStandaloneStunt(stunt, stuntIndex) {
    console.log("=== POWER STUNT DEBUG START ===");
    console.log("Stunt:", stunt.name);
    console.log("Times Used:", stunt.timesUsed);
    console.log("Rank:", stunt.rank);
    console.log("Value:", stunt.value);
    
    const rank = stunt.rank || "Typical";
    const rankValue = stunt.value || 6;
    
    // Check if stunt is mastered (10+ uses) - no FEAT or Karma needed
    if (stunt.timesUsed >= 10) {
      console.log("Stunt is MASTERED (10+ uses) - auto success");
      ui.notifications.info(`${stunt.name} is mastered! No FEAT or Karma required.`);
      
      const chatHtml = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Rank: ${rank} (${rankValue})</div>
            <div>Status: MASTERED (10+ uses)</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50 !important; color: white;">
            AUTOMATIC SUCCESS
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatHtml
      });
      return;
    }
    
    // Check if actor has at least 100 karma available
    const availableKarma = this.actor.availableKarma || 0;
    console.log("Available Karma:", availableKarma);
    
    if (availableKarma < 100) {
      console.log("INSUFFICIENT KARMA - Cannot perform stunt");
      ui.notifications.error(`Insufficient Karma! ${stunt.name} requires 100 Karma. You have ${availableKarma} available.`);
      
      const chatHtml = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Required Karma: 100</div>
            <div>Available Karma: ${availableKarma}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #F44336 !important; color: white;">
            INSUFFICIENT KARMA
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatHtml
      });
      return;
    }
    
    // Determine required FEAT color based on current times used
    let requiredColor;
    if (stunt.timesUsed === 0) {
      requiredColor = "red";
      console.log("Times used = 0: Required FEAT = RED");
    } else if (stunt.timesUsed <= 3) {
      requiredColor = "yellow";
      console.log("Times used 1-3: Required FEAT = YELLOW");
    } else {
      requiredColor = "green";
      console.log("Times used 4-9: Required FEAT = GREEN");
    }
    
    console.log("Required FEAT Color:", requiredColor);
    
    // Calculate maximum additional karma they can spend
    const maxAdditionalKarma = availableKarma - 100;
    console.log("Max additional karma available:", maxAdditionalKarma);
    
    // Prompt for optional Karma bonus
    const karmaInput = await Dialog.prompt({
      title: "Add Karma Bonus to Roll?",
      label: "Optional Karma bonus (in addition to 100 Karma base cost):",
      callback: html => parseInt(html.find("input").val() || "0"),
      content: `
        <p>Base cost: <strong>100 Karma</strong></p>
        <p>Available for bonus: <strong>${maxAdditionalKarma} Karma</strong></p>
        <p>Required FEAT: <strong style="color:${requiredColor}">${requiredColor.toUpperCase()}</strong></p>
        <label>Additional Karma bonus to roll (max ${maxAdditionalKarma}):</label>
        <input type="number" min="0" max="${maxAdditionalKarma}" value="0" style="width:100%"/>
      `
    });
    
    const karmaBonus = Math.min(maxAdditionalKarma, Number.isNaN(karmaInput) ? 0 : karmaInput);
    console.log("Karma bonus:", karmaBonus);
    
    // Roll 1d100
    const roll = new Roll("1d100");
    await roll.evaluate();
    console.log("Roll result:", roll.total);
    
    // Calculate total with karma bonus
    const totalRoll = Math.min(100, roll.total + karmaBonus);
    console.log("Total roll (with karma):", totalRoll);
    
    // Use the universal table to determine FEAT result color
    const resultColor = game.msh.rollUniversalTable(rank, totalRoll);
    console.log("Result color from universal table:", resultColor);
    console.log("Result color (lowercase):", resultColor.toLowerCase());
    
    // Check if the result meets the requirement
    const resultColorLower = resultColor.toLowerCase();
    console.log("Checking success with:");
    console.log("  Required:", requiredColor);
    console.log("  Got:", resultColorLower);
    
    let success = false;
    if (requiredColor === "green") {
      success = ["green", "yellow", "red"].includes(resultColorLower);
      console.log("  Green check: needs green/yellow/red, got", resultColorLower, "=", success);
    } else if (requiredColor === "yellow") {
      success = ["yellow", "red"].includes(resultColorLower);
      console.log("  Yellow check: needs yellow/red, got", resultColorLower, "=", success);
    } else if (requiredColor === "red") {
      success = resultColorLower === "red";
      console.log("  Red check: needs red, got", resultColorLower, "=", success);
    }
    
    console.log("FINAL SUCCESS VALUE:", success);
    
    // Increment usage count if successful
    if (success) {
      console.log("Success! Incrementing usage count from", stunt.timesUsed, "to", stunt.timesUsed + 1);
      const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
      stunts[stuntIndex].timesUsed++;
      await this.actor.update({ "system.stunts": stunts });
    } else {
      console.log("Failed! Usage count stays at", stunt.timesUsed);
    }
    
    // Log Karma spending to history
    const karmaSheet = await import('./karma.js').then(m => new m.KarmaSheet(this.actor));
    
    // Base 100 Karma cost
    await karmaSheet._addKarmaEvent({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -100,
      type: "Power Stunt",
      description: `Attempted stunt "${stunt.name}" (${requiredColor} FEAT required)`
    });
    
    // Additional karma bonus
    if (karmaBonus > 0) {
      await karmaSheet._addKarmaEvent({
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: -karmaBonus,
        type: "Die Roll",
        description: `Karma bonus for "${stunt.name}" power stunt`
      });
    }
    
    // Determine result text
    const resultText = success ? "STUNT SUCCEEDED" : "STUNT FAILED";
    
    // Build chat content - matching power roll format exactly
    let content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>Base Rank: ${rank} (${rankValue})</div>
          <div>Times Used: ${stunt.timesUsed} → Required FEAT: ${requiredColor.toUpperCase()}</div>
          <div>Base Karma Cost: 100</div>
          ${karmaBonus > 0 ? `<div>Additional Karma Spent: ${karmaBonus}</div>` : ''}
          <div>Roll: ${roll.total}${karmaBonus > 0 ? ` + Karma: ${karmaBonus}` : ''} = ${totalRoll}</div>
          ${success ? `<div>Usage count increased to ${stunt.timesUsed + 1}</div>` : ''}
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${resultColorLower === 'white' ? '#f8f8f8 !important' :
            resultColorLower === 'green' ? '#4CAF50 !important' :
              resultColorLower === 'yellow' ? '#FFC107 !important' :
                '#F44336 !important'};
          color: ${resultColorLower === 'white' || resultColorLower === 'yellow' ? '#333' : 'white'};">
          ${resultText} (${resultColor.toUpperCase()})
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
    
    console.log("=== POWER STUNT DEBUG END ===");
  }

  _getFeatColor(rankValue, roll) {
    if (roll >= 91) return "red";
    if (roll >= 66) return rankValue >= 36 ? "red" : "yellow";
    if (roll >= 36) return rankValue >= 16 ? "yellow" : "green";
    return "green";
  }
  
  // other methods
}