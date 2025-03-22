// karma.js with modifications
export class KarmaSheet extends DocumentSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "karma"],
      template: "systems/msh-faserip/templates/karma-sheet.html",
      width: 620,
      height: 480,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      tabs: []
    });
  }

  get title() {
    return `Karma History: ${this.object.name}`;
  }

  getData() {
    const context = super.getData();
    const actorData = this.object.toObject(false);
    
    context.system = actorData.system;
    context.isGM = game.user.isGM; // check if user is GM
    
    // Ensure karma history exists
    if (!context.system.karma) {
      context.system.karma = {
        history: [],
        lifetime: 0,
        advancement: 0,
        pool: 0
      };
    }
    
    if (!Array.isArray(context.system.karma.history)) {
      context.system.karma.history = [];
    }

    if (!context.system.karma.advancementPurpose) {
      context.system.karma.advancementPurpose = "";
    }
    if (!context.system.karma.advancementDetail) {
      context.system.karma.advancementDetail = "";
    }
    if (!context.system.karma.poolName) {
      context.system.karma.poolName = "";
    }
    if (!context.system.karma.poolMembers) {
      context.system.karma.poolMembers = [];
    }
    
    // Sort history by date descending
    context.system.karma.history.sort((a, b) => {
      const dateA = new Date(a.realDate || 0);
      const dateB = new Date(b.realDate || 0);
      return dateB - dateA;
    });
    
    // Add CSS classes based on event type
    context.system.karma.history.forEach(event => {
      if (event.type === "Die Roll") {
        event.cssClass = "karma-die-roll";
      } else if (event.type === "Power Stunt") {
        event.cssClass = "karma-power-stunt";
      } else if (event.amount < 0) {
        event.cssClass = "karma-loss";
      } else if (event.amount > 0) {
        event.cssClass = "karma-gain";
      }
    });
    
    // Calculate total spent karma
    context.totalSpent = this._calculateTotalSpent(context.system.karma.history);
    
    // Calculate current available karma
    const totalEarned = context.system.karma.lifetime || 0;
    const advancementFund = context.system.karma.advancement || 0;
    const karmaPool = context.system.karma.pool || 0;
    
    // Current karma = Total earned - Total spent - Advancement Fund - Karma Pool
    context.currentKarma = Math.max(0, totalEarned - context.totalSpent - advancementFund - karmaPool);
    
    return context;
  }
  
  // Method to calculate total spent karma
  _calculateTotalSpent(history) {
    if (!history || !history.length) return 0;
    
    let totalSpent = 0;
    history.forEach(event => {
      if (event.amount < 0) {
        totalSpent += Math.abs(event.amount);
      }
    });
    
    return totalSpent;
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Add Karma button
    html.find('.add-karma').click(ev => this._onAddKarma(ev));
    
    // Spend Karma button
    html.find('.spend-karma').click(ev => this._onSpendKarma(ev));
    
    // Import button
    html.find('.import-karma').click(ev => this._onImportKarma(ev));
    
    // Export button
    html.find('.export-karma').click(ev => this._onExportKarma(ev));
    
    // Toggle history button
    html.find('.toggle-history').click(ev => {
      // Toggle the entire history section instead of just adding/removing a class
      const historySection = html.find('.history-section');
      historySection.slideToggle(200);
      
      // Update the button icon to indicate state
      const icon = $(ev.currentTarget).find('i');
      if (icon.hasClass('fa-history')) {
        icon.removeClass('fa-history').addClass('fa-chevron-up');
        $(ev.currentTarget).text(' Hide History');
        $(ev.currentTarget).prepend(icon);
      } else {
        icon.removeClass('fa-chevron-up').addClass('fa-history');
        $(ev.currentTarget).text(' Toggle History');
        $(ev.currentTarget).prepend(icon);
      }
    });

    // Edit Karma entry
    html.find('.edit-karma').click(ev => {
      const index = Number(ev.currentTarget.dataset.index);
      this._onEditKarma(index);
    });
    
    // Delete Karma entry
    html.find('.delete-karma').click(ev => {
      const index = Number(ev.currentTarget.dataset.index);
      this._onDeleteKarma(index);
    });

    // Clear All Karma button (GM only)
    if (game.user.isGM) {
        html.find('.clear-karma').click(ev => this._onClearKarma(ev));
    }

    // Advancement and pool related listeners
    html.find('.allocate-karma').click(ev => this._onAllocateKarma(ev));
    html.find('.purchase-advancement').click(ev => this._onPurchaseAdvancement(ev));
    html.find('.contribute-to-pool').click(ev => this._onContributeToPool(ev));
    html.find('.withdraw-from-pool').click(ev => this._onWithdrawFromPool(ev));
    html.find('.add-to-pool').click(ev => this._onAddToPool(ev));
    html.find('.remove-from-pool').click(ev => this._onRemoveFromPool(ev));
      
    // Show/hide ability selector when advancement type changes
    html.find('#advancement-type').change(ev => {
        const type = ev.currentTarget.value;
        if (type === "ability") {
            html.find('#ability-selector').removeClass('hidden');
        } else {
            html.find('#ability-selector').addClass('hidden');
        }
        this._updateAdvancementCalculator(html, type);
    });
  }

  _onClearKarma(event) {
      event.preventDefault();
      
      // Create confirmation dialog with warnings
      new Dialog({
        title: "Clear All Karma Data",
        content: `
          <div class="form-group">
            <p class="warning">WARNING: This will permanently erase all karma history and reset all karma values to zero.</p>
            <p>This action cannot be undone. Are you sure you want to proceed?</p>
          </div>
        `,
        buttons: {
          clear: {
            icon: '<i class="fas fa-exclamation-triangle"></i>',
            label: "Clear All Karma Data",
            callback: async () => {
              await this.object.update({
                "system.karma.history": [],
                "system.attributes.karma.value": 0,
                "system.karma.lifetime": 0,
                "system.karma.advancement": 0,
                "system.karma.pool": 0
              });
              
              ui.notifications.info(`All karma data for ${this.object.name} has been cleared.`);
              this.render();
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
  }

  _onAddKarma(event) {
    event.preventDefault();

    // Create the add karma dialog
    new Dialog({
      title: "Add Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Real Date:</label>
            <input type="text" name="realDate" value="${new Date().toLocaleDateString()}" />
          </div>
          <div class="form-group">
            <label>Game Date (optional):</label>
            <input type="text" name="gameDate" value="" />
          </div>
          <div class="form-group">
            <label>Event Type:</label>
            <select name="eventType">
              <option value="Custom">Custom</option>
              <option value="Rescue">Rescue (+20)</option>
              <option value="Violent Crime">Stop Violent Crime (+30)</option>
              <option value="Destructive Crime">Stop Destructive Crime (+20)</option>
              <option value="Theft">Stop Theft (+10)</option>
              <option value="Arrest">Arrest Criminal (+10)</option>
              <option value="Defeated Foe">Defeated Foe (varies)</option>
              <option value="Personal Commitment">Personal Commitment (+5)</option>
              <option value="Weekly Award">Weekly Award (+10)</option>
              <option value="Charity">Charity Appearance (Pop)</option>
              <option value="Defeat">Defeat (-20/-40)</option>
              <option value="Property Damage">Property Damage (-5 per area)</option>
              <option value="Role-Playing">Role-Playing Bonus</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount:</label>
            <input type="number" name="amount" value="0" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description"></textarea>
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-check"></i>',
          label: "Add",
          callback: (html) => {
            const form = html.find("form")[0];
            const formData = new FormData(form);
            
            const karmaEvent = {
              realDate: formData.get("realDate"),
              gameDate: formData.get("gameDate"),
              amount: Number(formData.get("amount")),
              type: formData.get("eventType"),
              description: formData.get("description")
            };
            
            this._addKarmaEvent(karmaEvent);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "add",
      render: (html) => {
        // Update amount based on event type selection
        html.find('[name="eventType"]').change(ev => {
          const type = ev.currentTarget.value;
          let amount = 0;
          
          switch(type) {
            case "Rescue": amount = 20; break;
            case "Violent Crime": amount = 30; break;
            case "Destructive Crime": amount = 20; break;
            case "Theft": amount = 10; break;
            case "Arrest": amount = 10; break;
            case "Personal Commitment": amount = 5; break;
            case "Weekly Award": amount = 10; break;
            case "Role-Playing": amount = 10; break;
            case "Defeat": amount = -20; break;
            case "Property Damage": amount = -5; break;
          }
          
          html.find('[name="amount"]').val(amount);
        });
      }
    }).render(true);
  }

  _onSpendKarma(event) {
    event.preventDefault();
    
    new Dialog({
      title: "Spend Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Spend Type:</label>
            <select name="spendType">
              <option value="Die Roll">Manipulate Die Roll (min 10)</option>
              <option value="Power Stunt">Power Stunt (100)</option>
              <option value="Advancement">Transfer to Advancement Fund</option>
              <option value="Pool">Transfer to Karma Pool</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount:</label>
            <input type="number" name="amount" value="10" min="1" max="${this.object.system.attributes.karma.value}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description"></textarea>
          </div>
        </form>
      `,
      buttons: {
        spend: {
          icon: '<i class="fas fa-check"></i>',
          label: "Spend",
          callback: (html) => {
            const form = html.find("form")[0];
            const formData = new FormData(form);
            
            const spendType = formData.get("spendType");
            const amount = Number(formData.get("amount"));
            const description = formData.get("description");
            
            // Ensure amount is valid
            if (amount <= 0 || amount > this.object.system.attributes.karma.value) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            // Create the karma event with negative amount
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -amount,
              type: spendType,
              description: description
            };
            
            this._addKarmaEvent(karmaEvent);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "spend",
      render: (html) => {
        // Update amount based on spend type selection
        html.find('[name="spendType"]').change(ev => {
          const type = ev.currentTarget.value;
          let amount = 10;
          
          switch(type) {
            case "Die Roll": amount = 10; break;
            case "Power Stunt": amount = 100; break;
          }
          
          html.find('[name="amount"]').val(amount);
        });
      }
    }).render(true);
  }

  _onImportKarma(event) {
    event.preventDefault();
    
    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Based on file extension, handle differently
      if (file.name.endsWith('.csv')) {
        this._importCSV(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        this._importExcel(file);
      } else {
        ui.notifications.error("Unsupported file format. Please use CSV or Excel files.");
      }
    };
    
    input.click();
  }

  async _importCSV(file) {
    try {
      // Read the file
      const reader = new FileReader();
      const text = await new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error("File reading failed"));
        reader.readAsText(file);
      });
      
      // Parse CSV manually
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        ui.notifications.warn("CSV file contains insufficient data");
        return;
      }
      
      // Parse header
      const headers = this._parseCSVLine(lines[0]);
      
      // Parse data rows
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this._parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index];
          });
          data.push(row);
        }
      }
      
      this._showImportDialog(data);
    } catch (error) {
      console.error("CSV import error:", error);
      ui.notifications.error("Error importing CSV: " + error.message);
    }
  }

  // Helper method to parse a CSV line
  _parseCSVLine(line) {
    const values = [];
    let inQuotes = false;
    let currentValue = "";
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && !inQuotes) {
        // Start of quoted field
        inQuotes = true;
      } else if (char === '"' && inQuotes && line[i+1] === '"') {
        // Escaped quote within quoted field
        currentValue += '"';
        i++;
      } else if (char === '"' && inQuotes) {
        // End of quoted field
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        // End of field
        values.push(currentValue);
        currentValue = "";
      } else {
        // Regular character
        currentValue += char;
      }
    }
    
    // Add the last field
    values.push(currentValue);
    return values;
  }

  async _importExcel(file) {
    ui.notifications.error("Excel import requires SheetJS library which is not available. Please use CSV format instead.");
  }

  _showImportDialog(data) {
    if (!data || data.length === 0) {
      ui.notifications.warn("No data found in the imported file.");
      return;
    }
    
    // Show preview and column mapping dialog
    const sampleData = data.slice(0, 5);
    const columns = Object.keys(sampleData[0]);
    
    let mappingOptions = '';
    columns.forEach(col => {
      mappingOptions += `
        <div class="form-group">
          <label>${col}:</label>
          <select name="map-${col}">
            <option value="">-- Ignore --</option>
            <option value="realDate" ${col.toLowerCase().includes('date') ? 'selected' : ''}>Real Date</option>
            <option value="gameDate" ${col.toLowerCase().includes('game') ? 'selected' : ''}>Game Date</option>
            <option value="amount" ${col.toLowerCase().includes('amount') || col.toLowerCase().includes('karma') ? 'selected' : ''}>Amount</option>
            <option value="type" ${col.toLowerCase().includes('type') || col.toLowerCase().includes('event') ? 'selected' : ''}>Event Type</option>
            <option value="description" ${col.toLowerCase().includes('desc') ? 'selected' : ''}>Description</option>
          </select>
        </div>
      `;
    });
    
    new Dialog({
      title: "Import Karma History",
      content: `
        <div>
          <p>Please map the columns from your file to the Karma history fields:</p>
          ${mappingOptions}
          <div class="form-group">
            <label>Import Mode:</label>
            <select name="importMode">
              <option value="append">Append to existing history</option>
              <option value="replace">Replace existing history</option>
            </select>
          </div>
        </div>
      `,
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: (html) => {
            // Get the mapping
            const mapping = {};
            columns.forEach(col => {
              const target = html.find(`[name="map-${col}"]`).val();
              if (target) mapping[col] = target;
            });
            
            const importMode = html.find('[name="importMode"]').val();
            
            // Process the data with mapping
            const processedData = data.map(row => {
              const event = {};
              
              Object.entries(mapping).forEach(([source, target]) => {
                event[target] = row[source];
              });
              
              // Ensure amount is a number
              if (event.amount) {
                event.amount = Number(event.amount);
              }
              
              return event;
            });
            
            this._importKarmaData(processedData, importMode);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "import"
    }).render(true);
  }

  async _importKarmaData(data, mode) {
    // Get current history
    let history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    
    if (mode === "replace") {
      history = data;
    } else { // append
      history = history.concat(data);
    }
    
    // Calculate totals
    let karmaTotal = 0;
    let lifetimeTotal = 0;
    
    history.forEach(event => {
      if (event.amount) {
        karmaTotal += event.amount;
        if (event.amount > 0) lifetimeTotal += event.amount;
      }
    });
    
    // Ensure karma doesn't go negative
    karmaTotal = Math.max(0, karmaTotal);
    
    // Update the actor
    await this.object.update({
      "system.karma.history": history,
      "system.attributes.karma.value": karmaTotal,
      "system.karma.lifetime": lifetimeTotal
    });
    
    ui.notifications.info(`Imported ${data.length} karma entries.`);
    this.render();
  }

  _onExportKarma(event) {
    event.preventDefault();
    
    const history = this.object.system.karma?.history || [];
    if (history.length === 0) {
      ui.notifications.warn("No karma history to export.");
      return;
    }
    
    // Create CSV content
    const headers = ["Real Date", "Game Date", "Amount", "Event Type", "Description"];
    let csv = headers.join(",") + "\n";
    
    history.forEach(event => {
      const row = [
        `"${event.realDate || ''}"`,
        `"${event.gameDate || ''}"`,
        event.amount || 0,
        `"${event.type || ''}"`,
        `"${(event.description || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(",") + "\n";
    });
    
    // Download the CSV file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karma-history-${this.object.name.replace(/\s+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  _onEditKarma(index) {
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    if (index < 0 || index >= history.length) return;
    
    const event = history[index];
    
    new Dialog({
      title: "Edit Karma Entry",
      content: `
        <form>
          <div class="form-group">
            <label>Real Date:</label>
            <input type="text" name="realDate" value="${event.realDate || ''}" />
          </div>
          <div class="form-group">
            <label>Game Date (optional):</label>
            <input type="text" name="gameDate" value="${event.gameDate || ''}" />
          </div>
          <div class="form-group">
            <label>Event Type:</label>
            <input type="text" name="eventType" value="${event.type || ''}" />
          </div>
          <div class="form-group">
            <label>Amount:</label>
            <input type="number" name="amount" value="${event.amount || 0}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description">${event.description || ''}</textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: (html) => {
            const form = html.find("form")[0];
            const formData = new FormData(form);
            
            // Update event
            event.realDate = formData.get("realDate");
            event.gameDate = formData.get("gameDate");
            event.amount = Number(formData.get("amount"));
            event.type = formData.get("eventType");
            event.description = formData.get("description");
            
            // Save back to history array
            history[index] = event;
            
            this._updateKarmaHistory(history);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "save"
    }).render(true);
  }

  _onDeleteKarma(index) {
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    if (index < 0 || index >= history.length) return;
    
    // Confirm deletion
    new Dialog({
      title: "Confirm Deletion",
      content: `<p>Are you sure you want to delete this karma entry?</p>`,
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Delete",
          callback: () => {
            history.splice(index, 1);
            this._updateKarmaHistory(history);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "cancel"
    }).render(true);
  }

  _addKarmaEvent(event) {
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    history.push(event);
    
    this._updateKarmaHistory(history);
  }

  async _updateKarmaHistory(history) {
    // Recalculate totals
    let totalEarned = 0;
    let totalSpent = 0;
    
    history.forEach(event => {
      const amount = Number(event.amount) || 0;
      if (amount > 0) {
        totalEarned += amount;
      } else {
        totalSpent += Math.abs(amount);
      }
    });
    
    // Get current advancement fund and karma pool values
    const advancementFund = this.object.system.karma.advancement || 0;
    const karmaPool = this.object.system.karma.pool || 0;
    
    // Calculate current available karma
    let currentKarma = totalEarned - totalSpent - advancementFund - karmaPool;
    
    // Ensure karma doesn't go negative
    currentKarma = Math.max(0, currentKarma);
    
    // Update the actor
    await this.object.update({
      "system.karma.history": history,
      "system.attributes.karma.value": currentKarma,
      "system.karma.lifetime": totalEarned
    });
    
    this.render();
  }

  // New methods for advancement
  _onAllocateKarma(event) {
    event.preventDefault();
    
    const advancementType = this.element.find('#advancement-type').val();
    if (!advancementType) {
      ui.notifications.warn("Please select an advancement purpose.");
      return;
    }
    
    const currentAdvancement = this.object.system.karma.advancementPurpose;
    if (currentAdvancement && currentAdvancement !== advancementType) {
      ui.notifications.warn("You already have karma allocated for " + currentAdvancement + ". You must complete that advancement first.");
      return;
    }
    
    let abilityToAdvance = "";
    if (advancementType === "ability") {
      abilityToAdvance = this.element.find('#ability-to-advance').val();
    }
    
    new Dialog({
      title: "Allocate Karma for Advancement",
      content: `
        <form>
          <div class="form-group">
            <label>Current Karma: ${this.object.system.attributes.karma.value}</label>
          </div>
          <div class="form-group">
            <label>Amount to Allocate:</label>
            <input type="number" name="amount" value="0" min="0" max="${this.object.system.attributes.karma.value}">
          </div>
        </form>
      `,
      buttons: {
        allocate: {
          icon: '<i class="fas fa-check"></i>',
          label: "Allocate",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            
            if (amount <= 0 || amount > this.object.system.attributes.karma.value) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            // Create karma event for allocation
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -amount,
              type: "Advancement Allocation",
              description: `Allocated for ${advancementType}${abilityToAdvance ? ' (' + abilityToAdvance + ')' : ''}`
            };
            
            // Add to history and update karma
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            // Calculate new values
            let currentKarma = this.object.system.attributes.karma.value - amount;
            let advancementKarma = (this.object.system.karma.advancement || 0) + amount;
            
            // Update the actor
            await this.object.update({
              "system.karma.history": history,
              "system.attributes.karma.value": currentKarma,
              "system.karma.advancement": advancementKarma,
              "system.karma.advancementPurpose": advancementType,
              "system.karma.advancementDetail": abilityToAdvance
            });
            
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "allocate"
    }).render(true);
  }
  
  _updateAdvancementCalculator(html, type) {
    const calculatorDiv = html.find('.advancement-calculator');
    const contentDiv = html.find('#calculator-content');
    
    if (!type) {
      calculatorDiv.addClass('hidden');
      return;
    }
    
    calculatorDiv.removeClass('hidden');
    let content = "";
    
    switch(type) {
      case "ability":
        const ability = html.find('#ability-to-advance').val();
        const abilityValue = this.object.system.abilities[ability].value;
        const abilityRank = this.object.system.abilities[ability].rank;
        const nextNumber = abilityValue + 1;
        const isCresting = (nextNumber % 10 === 6); // First number of next rank
        
        const baseCost = nextNumber;
        const crestingCost = isCresting ? 400 : 0;
        const totalCost = baseCost + crestingCost;
        
        content = `
          <p>Current ${ability.charAt(0).toUpperCase() + ability.slice(1)}: ${abilityRank} (${abilityValue})</p>
          <p>Next Value: ${nextNumber}</p>
          <p>Base Cost: ${baseCost} Karma</p>
          ${isCresting ? `<p>Cresting Cost: 400 Karma</p>` : ''}
          <p><strong>Total Cost: ${totalCost} Karma</strong></p>
        `;
        break;
        
      case "power":
        content = `<p>Power Advancement: Cost is 20 × the rank number gained, plus 500 for cresting.</p>`;
        break;
      case "powerAdd":
        content = `<p>Power Addition: Cost is 3000 + (40 × starting rank number)</p>`;
        break;
      case "resource":
        content = `<p>Resource Advancement: Cost is 10 × the rank number, plus 200 for cresting.</p>`;
        break;
      case "popularity":
        content = `<p>Popularity Advancement: Cost is 10 × the current rank number. No cresting cost.</p>`;
        break;
      case "talent":
        content = `<p>Talent Addition: Cost is 2000 from PC, 1000 from NPC.</p>`;
        break;
      case "contact":
        content = `<p>Contact Addition: Cost is 500 + (10 × Contact's Resource rank).</p>`;
        break;
    }
    
    contentDiv.html(content);
  }
  
  _onPurchaseAdvancement(event) {
    event.preventDefault();
    
    // Check if there's an advancement purpose selected
    const purpose = this.object.system.karma.advancementPurpose;
    const detail = this.object.system.karma.advancementDetail;
    const availableKarma = this.object.system.karma.advancement || 0;
    
    if (!purpose) {
      ui.notifications.warn("No advancement purpose selected. Please allocate karma first.");
      return;
    }
    
    // Calculate cost based on purpose
    let cost = 0;
    let description = "";
    let updateData = {};
    
    switch(purpose) {
      case "ability":
        if (!detail) {
          ui.notifications.error("No ability selected for advancement.");
          return;
        }
        
        const ability = detail;
        const abilityValue = this.object.system.abilities[ability].value;
        const nextNumber = abilityValue + 1;
        const isCresting = (nextNumber % 10 === 6);
        
        const baseCost = nextNumber;
        const crestingCost = isCresting ? 400 : 0;
        cost = baseCost + crestingCost;
        
        description = `Advanced ${ability} from ${abilityValue} to ${nextNumber}`;
        updateData[`system.abilities.${ability}.value`] = nextNumber;
        break;
        
      // Add other advancement type calculations
      // These would need to be customized based on your system
    }
    
    if (cost > availableKarma) {
      ui.notifications.error(`Insufficient karma for this advancement. Need ${cost}, have ${availableKarma}.`);
      return;
    }
    
    // Confirm the purchase
    new Dialog({
      title: "Confirm Advancement Purchase",
      content: `
        <p>You're about to purchase: ${description}</p>
        <p>Cost: ${cost} Karma</p>
        <p>Available: ${availableKarma} Karma</p>
        <p>Remaining: ${availableKarma - cost} Karma</p>
      `,
      buttons: {
        purchase: {
          icon: '<i class="fas fa-check"></i>',
          label: "Purchase",
          callback: async () => {
            // Create karma event for the purchase
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -cost,
              type: "Advancement Purchase",
              description: description
            };
            
            // Update karma advancement
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            // Complete the update
            updateData["system.karma.history"] = history;
            updateData["system.karma.advancement"] = availableKarma - cost;
            
            // If advancement is complete, clear the purpose
            if (availableKarma - cost === 0) {
              updateData["system.karma.advancementPurpose"] = "";
              updateData["system.karma.advancementDetail"] = "";
            }
            
            await this.object.update(updateData);
            ui.notifications.info(`Advancement purchased: ${description}`);
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "purchase"
    }).render(true);
  }
  
  // Karma Pool Methods
  _onContributeToPool(event) {
    event.preventDefault();
    
    new Dialog({
      title: "Contribute to Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Current Karma: ${this.object.system.attributes.karma.value}</label>
          </div>
          <div class="form-group">
            <label>Amount to Contribute:</label>
            <input type="number" name="amount" value="0" min="0" max="${this.object.system.attributes.karma.value}">
          </div>
        </form>
      `,
      buttons: {
        contribute: {
          icon: '<i class="fas fa-check"></i>',
          label: "Contribute",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            
            if (amount <= 0 || amount > this.object.system.attributes.karma.value) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            // Create karma event for pool contribution
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -amount,
              type: "Pool Contribution",
              description: `Contributed to ${this.object.system.karma.poolName || "Karma Pool"}`
            };
            
            // Add to history and update karma
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            // Calculate new values
            let currentKarma = this.object.system.attributes.karma.value - amount;
            let poolKarma = (this.object.system.karma.pool || 0) + amount;
            
            // Update the actor
            await this.object.update({
              "system.karma.history": history,
              "system.attributes.karma.value": currentKarma,
              "system.karma.pool": poolKarma
            });
            
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "contribute"
    }).render(true);
  }
  
  _onWithdrawFromPool(event) {
    event.preventDefault();
    
    new Dialog({
      title: "Withdraw from Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Pool Karma: ${this.object.system.karma.pool || 0}</label>
          </div>
          <div class="form-group">
            <label>Amount to Withdraw:</label>
            <input type="number" name="amount" value="0" min="0" max="${this.object.system.karma.pool || 0}">
          </div>
        </form>
      `,
      buttons: {
        withdraw: {
          icon: '<i class="fas fa-check"></i>',
          label: "Withdraw",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            
            if (amount <= 0 || amount > this.object.system.karma.pool) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            // Create karma event for pool withdrawal
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: amount,
              type: "Pool Withdrawal",
              description: `Withdrew from ${this.object.system.karma.poolName || "Karma Pool"}`
            };
            
            // Add to history and update karma
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            // Calculate new values
            let currentKarma = this.object.system.attributes.karma.value + amount;
            let poolKarma = this.object.system.karma.pool - amount;
            
            // Update the actor
            await this.object.update({
              "system.karma.history": history,
              "system.attributes.karma.value": currentKarma,
              "system.karma.pool": poolKarma
            });
            
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "withdraw"
    }).render(true);
  }
  
  // Pool membership methods
  _onAddToPool(event) {
    event.preventDefault();
    
    // Fetch available characters
    const availableActors = game.actors.filter(a => 
      a.id !== this.object.id && 
      (a.type === "hero" || a.type === "villain" || a.type === "npc")
    );
    
    let options = availableActors.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    
    new Dialog({
      title: "Add Character to Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Select Character:</label>
            <select name="character">
              <option value="">-- Select Character --</option>
              ${options}
            </select>
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-user-plus"></i>',
          label: "Add to Pool",
          callback: async (html) => {
            const characterId = html.find('[name="character"]').val();
            if (!characterId) {
              ui.notifications.warn("No character selected.");
              return;
            }
            
            const character = game.actors.get(characterId);
            if (!character) return;
            
            // Get current pool members
            const poolMembers = foundry.utils.deepClone(this.object.system.karma.poolMembers || []);
            
            // Check if already in pool
            if (poolMembers.some(m => m.id === characterId)) {
              ui.notifications.warn(`${character.name} is already in the pool.`);
              return;
            }
            
            // Add to pool
            poolMembers.push({
              id: characterId,
              name: character.name
            });
            
            await this.object.update({
              "system.karma.poolMembers": poolMembers
            });
            
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "add"
    }).render(true);
  }
  
  _onRemoveFromPool(event) {
    event.preventDefault();
    
    const memberId = event.currentTarget.dataset.id;
    if (!memberId) return;
    
    // Get current pool members
    const poolMembers = foundry.utils.deepClone(this.object.system.karma.poolMembers || []);
    
    // Find the member
    const memberIndex = poolMembers.findIndex(m => m.id === memberId);
    if (memberIndex === -1) return;
    
    const memberName = poolMembers[memberIndex].name;
    
    // Confirm removal
    new Dialog({
      title: "Remove Character from Karma Pool",
      content: `<p>Remove ${memberName} from the karma pool?</p>`,
      buttons: {
        remove: {
          icon: '<i class="fas fa-user-minus"></i>',
          label: "Remove",
          callback: async () => {
            poolMembers.splice(memberIndex, 1);
            
            await this.object.update({
              "system.karma.poolMembers": poolMembers
            });
            
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "cancel"
    }).render(true);
  }
}