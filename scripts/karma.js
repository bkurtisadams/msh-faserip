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

    // <-- NEW/MODIFIED SECTION START -->
    // Daily Karma specific data
    context.dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
    context.dailyKarmaMax = context.system.karma.dailyKarmaMax || 0;
    context.dailyKarmaUsed = context.system.karma.dailyKarmaUsed || 0;
    context.dailyKarmaRemaining = Math.max(0, context.dailyKarmaMax - context.dailyKarmaUsed);
    
    // Sort history by date ascending (oldest to newest)
    context.system.karma.history.sort((a, b) => {
      const dateA = new Date(a.realDate || 0);
      const dateB = new Date(b.realDate || 0);
      return dateA - dateB;
    });
    
    // Add CSS classes based on event type
    context.system.karma.history.forEach(event => {
      if (event.type === "Die Roll") {
        event.cssClass = "karma-die-roll";
      } else if (event.type === "Power Stunt") {
        event.cssClass = "karma-power-stunt";
      } else if (event.type === "Daily Roll") {
        event.cssClass = "karma-daily-roll";
      } else if (event.amount < 0) {
        event.cssClass = "karma-loss";
      } else if (event.amount > 0) {
        event.cssClass = "karma-gain";
      }
    });
    
    // Calculate total spent karma, excluding 'Daily Roll' entries
    context.totalSpent = this._calculateTotalSpentLifetime(context.system.karma.history);
    
    // FIXED: Calculate Available Karma as lifetime calculation
    const totalEarned = context.system.karma.lifetime || 0;
    const totalSpentLifetime = context.totalSpent;
    const advancementFund = context.system.karma.advancement || 0;
    const karmaPool = context.system.karma.pool || 0;
    
    context.currentKarma = Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool);
    
    return context;
  }
  
  // Method to calculate total spent karma, excluding "Daily Roll" entries
  _calculateTotalSpentLifetime(history) { // <-- MODIFIED METHOD NAME
    if (!history || !history.length) return 0;
    
    let totalSpent = 0;
    history.forEach(event => {
      // Only count karma that has been spent (negative amount) AND is not a "Daily Roll"
      if (event.amount < 0 && event.type !== "Daily Roll") { // <-- MODIFIED LINE
        totalSpent += Math.abs(event.amount);
      }
    });
    
    return totalSpent;
  }

  // In karma.js, replace the existing _getCurrentKarma method with:
  _getCurrentKarma() {
    // Calculate lifetime karma minus spent (excluding daily rolls) minus funds
    const totalEarned = this.object.system.karma.lifetime || 0;
    let totalSpentLifetime = 0;
    
    if (this.object.system.karma.history && Array.isArray(this.object.system.karma.history)) {
      this.object.system.karma.history.forEach(event => {
        // Only count non-daily roll spending toward lifetime spent
        if (event.amount < 0 && event.type !== "Daily Roll") {
          totalSpentLifetime += Math.abs(event.amount);
        }
      });
    }
    
    const advancementFund = this.object.system.karma.advancement || 0;
    const karmaPool = this.object.system.karma.pool || 0;
    
    return Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool);
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

    // Reset Daily Karma button (available to all users)
    html.find('.reset-daily-karma').click(ev => this._onResetDailyKarma(ev));

    // In the activateListeners method of KarmaSheet class, add:
    /* html.find('.open-advancement').click(ev => {
      // Import dynamically to avoid circular dependencies
      import('./karmaAdvancement.js').then(module => {
        const advancementSheet = new module.KarmaAdvancementSheet(this.object);
        advancementSheet.render(true);
      });
    }); */

    html.find('.open-pool').click(ev => {
      // Import dynamically to avoid circular dependencies
      import('./karmaPool.js').then(module => {
        const poolSheet = new module.KarmaPoolSheet(this.object);
        poolSheet.render(true);
      });
    });

    // other listeners
  }

  // <-- NEW METHOD START -->
  async _onResetDailyKarma(event) {
    event.preventDefault();

    const confirmed = await Dialog.confirm({
      title: "Reset Daily Karma",
      content: `Are you sure you want to reset <strong>${this.object.name}</strong>'s daily karma usage to 0?`
    });

    if (confirmed) {
      // Simple reset - no history entry needed
      await this.object.update({ "system.karma.dailyKarmaUsed": 0 });
      ui.notifications.info(`Daily karma for ${this.object.name} has been reset.`);
    }
  }
  // <-- NEW METHOD END -->

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
                "system.karma.pool": 0,
                "system.karma.dailyKarmaUsed": 0, // <-- NEW LINE
                "system.karma.dailyKarmaMax": 0  // <-- NEW LINE
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
              <option value="Daily Roll" disabled>Daily Roll (Automated)</option> <!-- NEW LINE -->
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
    
    // Calculate available karma properly
    const totalEarned = this.object.system.karma.lifetime || 0;
    const totalSpentLifetime = this._calculateTotalSpentLifetime(this.object.system.karma.history || []);
    const advancementFund = this.object.system.karma.advancement || 0;
    const karmaPool = this.object.system.karma.pool || 0;
    const availableKarma = Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool);
    
    new Dialog({
      title: "Spend Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Available Karma: ${availableKarma}</label>
          </div>
          <div class="form-group">
            <label>Spend Type:</label>
            <select name="spendType">
              <option value="Die Roll">Manipulate Die Roll (min 10)</option>
              <option value="Power Stunt">Power Stunt (100)</option>
              <option value="Ability Advancement">Ability Advancement</option>
              <option value="Power Advancement">Power Advancement</option>
              <option value="Power Addition">Power Addition</option>
              <option value="Resource Advancement">Resource Advancement</option>
              <option value="Popularity Advancement">Popularity Advancement</option>
              <option value="Talent Addition">Talent Addition</option>
              <option value="Contact Addition">Contact Addition</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount:</label>
            <input type="number" name="amount" value="10" min="1" max="${availableKarma}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" placeholder="Describe what you're spending karma on..."></textarea>
          </div>
        </form>
      `,
      buttons: {
        spend: {
          icon: '<i class="fas fa-check"></i>',
          label: "Spend",
          callback: async (html) => {
            const spendType = html.find('[name="spendType"]').val();
            const amount = Number(html.find('[name="amount"]').val());
            const description = html.find('[name="description"]').val();
            
            // Validate amount
            if (amount <= 0 || amount > availableKarma) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            // Validate description for advancement types
            if (spendType.includes("Advancement") || spendType.includes("Addition")) {
              if (!description.trim()) {
                ui.notifications.error("Please provide a description for advancement purchases.");
                return;
              }
            }
            
            // Handle specific advancement types with actual character updates
            let updateData = {};
            let finalDescription = description || `${spendType}`;
            
            if (spendType === "Ability Advancement" && description.trim()) {
              // Try to parse ability advancement from description
              // Format: "Fighting 30 to 31" or similar
              const match = description.match(/(\w+)\s+(\d+)\s+to\s+(\d+)/i);
              if (match) {
                const abilityName = match[1].toLowerCase();
                const newValue = parseInt(match[3]);
                
                if (this.object.system.abilities[abilityName]) {
                  updateData[`system.abilities.${abilityName}.value`] = newValue;
                  
                  // Update rank if needed
                  const newRank = this._getNewRank(newValue);
                  updateData[`system.abilities.${abilityName}.rank`] = newRank;
                  
                  finalDescription = `Advanced ${abilityName} to ${newValue}`;
                }
              }
            }
            
            if (spendType === "Resource Advancement" && description.trim()) {
              // Try to parse resource advancement
              const match = description.match(/(\d+)\s+to\s+(\d+)/);
              if (match) {
                const newValue = parseInt(match[2]);
                updateData["system.attributes.resources.value"] = newValue;
                
                const newRank = this._getNewRank(newValue);
                updateData["system.attributes.resources.rank"] = newRank;
                
                finalDescription = `Advanced Resources to ${newValue}`;
              }
            }
            
            if (spendType === "Popularity Advancement" && description.trim()) {
              // Try to parse popularity advancement
              const match = description.match(/(\d+)\s+to\s+(\d+)/);
              if (match) {
                const newValue = parseInt(match[2]);
                updateData["system.attributes.popularity.hero.value"] = newValue;
                
                finalDescription = `Advanced Hero Popularity to ${newValue}`;
              }
            }
            
            // Create the karma event with negative amount
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -amount,
              type: spendType,
              description: finalDescription
            };
            
            // Add to history
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            updateData["system.karma.history"] = history;
            
            // Update the actor
            await this.object.update(updateData);
            
            ui.notifications.info(`Spent ${amount} karma on ${finalDescription}`);
            this.render();
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
          let placeholder = "Describe what you're spending karma on...";
          
          switch(type) {
            case "Die Roll": 
              amount = 10; 
              placeholder = "e.g., Spent on Fighting FEAT roll";
              break;
            case "Power Stunt": 
              amount = 100; 
              placeholder = "e.g., Used Telekinesis to lift a building";
              break;
            case "Ability Advancement":
              amount = 50;
              placeholder = "e.g., Fighting 30 to 31 (include cresting cost)";
              break;
            case "Power Advancement":
              amount = 100;
              placeholder = "e.g., Energy Blast from Remarkable to Incredible";
              break;
            case "Power Addition":
              amount = 3000;
              placeholder = "e.g., Added Flight at Typical rank";
              break;
            case "Resource Advancement":
              amount = 100;
              placeholder = "e.g., Resources 20 to 21";
              break;
            case "Popularity Advancement":
              amount = 50;
              placeholder = "e.g., Hero Popularity 15 to 16";
              break;
            case "Talent Addition":
              amount = 1000;
              placeholder = "e.g., Learned Martial Arts A from NPC";
              break;
            case "Contact Addition":
              amount = 500;
              placeholder = "e.g., Added Police Contact with Good resources";
              break;
          }
          
          html.find('[name="amount"]').val(amount);
          html.find('[name="description"]').attr('placeholder', placeholder);
        });
      }
    }).render(true);
  }

  _getNewRank(value) {
    if (value >= 10000) return "Beyond";
    if (value >= 5000) return "Class 5000";
    if (value >= 3000) return "Class 3000";
    if (value >= 1000) return "Class 1000";
    if (value >= 500) return "Shift-Z";
    if (value >= 200) return "Shift-Y";
    if (value >= 150) return "Shift-X";
    if (value >= 100) return "Unearthly";
    if (value >= 75) return "Monstrous";
    if (value >= 50) return "Amazing";
    if (value >= 40) return "Incredible";
    if (value >= 30) return "Remarkable";
    if (value >= 20) return "Excellent";
    if (value >= 10) return "Good";
    if (value >= 6) return "Typical";
    if (value >= 4) return "Poor";
    if (value >= 2) return "Feeble";
    return "Shift-0";
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
    
    // Recalculate totals needed for a complete update
    let totalEarned = 0;
    let totalSpentLifetime = 0; // Excludes daily rolls
    let dailyKarmaUsed = 0;
    
    history.forEach(event => {
      const amount = Number(event.amount) || 0;
      if (amount > 0) {
        totalEarned += amount;
      } else { // amount < 0
        if (event.type === "Daily Roll") { // <-- NEW LINE
          dailyKarmaUsed += Math.abs(amount); // <-- NEW LINE
        } else { // <-- NEW LINE
          totalSpentLifetime += Math.abs(amount); // <-- NEW LINE
        } // <-- NEW LINE
      }
    });
    
    // Get current advancement fund and karma pool values (they are not affected by history import directly)
    const advancementFund = this.object.system.karma.advancement || 0;
    const karmaPool = this.object.system.karma.pool || 0;
    const dailyKarmaMax = this.object.system.karma.dailyKarmaMax || 0; // <-- NEW LINE

    // Calculate effective karma value based on game setting
    const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled"); // <-- NEW LINE
    let currentKarmaValue; // This is system.attributes.karma.value

    if (dailyKarmaEnabled) { // <-- NEW LINE
        const dailyRemaining = Math.max(0, dailyKarmaMax - dailyKarmaUsed); // <-- NEW LINE
        currentKarmaValue = dailyRemaining; // <-- NEW LINE
        if (dailyRemaining <= 0) { // If daily is depleted, fall back to lifetime karma // <-- NEW LINE
            currentKarmaValue = Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool); // <-- NEW LINE
        } // <-- NEW LINE
    } else { // Use standard lifetime karma calculation if daily karma is not enabled // <-- NEW LINE
        currentKarmaValue = Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool); // <-- NEW LINE
    } // <-- NEW LINE

    // Update the actor
    await this.object.update({
      "system.karma.history": history,
      "system.attributes.karma.value": currentKarmaValue, // <-- MODIFIED LINE
      "system.karma.lifetime": totalEarned,
      "system.karma.dailyKarmaUsed": dailyKarmaUsed // <-- NEW LINE
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
    // Get a copy of the history array
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    
    // Sort the history array the same way it's displayed (oldest to newest)
    history.sort((a, b) => {
      const dateA = new Date(a.realDate || 0);
      const dateB = new Date(b.realDate || 0);
      return dateA - dateB; // Changed from dateB - dateA
    });
    
    // Now access the correct entry based on the sorted index
    if (index < 0 || index >= history.length) return;
    
    const event = history[index];
    
    // Continue with the dialog creation
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
            
            // Get the original unsorted history
            const originalHistory = foundry.utils.deepClone(this.object.system.karma?.history || []);
            
            // Find the original entry and update it
            // This is a naive way to find the original index, might fail if multiple entries are identical
            const originalIndex = originalHistory.findIndex(e => 
              e.realDate === event.realDate && 
              e.type === event.type && 
              e.description === event.description &&
              e.amount === event.amount // Also compare amount for better uniqueness
            );
            
            if (originalIndex !== -1) {
              originalHistory[originalIndex] = event;
              this._updateKarmaHistory(originalHistory);
            } else {
              // Fallback if entry not found (shouldn't happen often if unique enough data)
              // Or if the order was somehow changed, update the current sorted array
              this._updateKarmaHistory(history);
            }
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
    // Get a copy of the history array
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    
    // Sort the history array the same way it's displayed (oldest to newest)
    history.sort((a, b) => {
      const dateA = new Date(a.realDate || 0);
      const dateB = new Date(b.realDate || 0);
      return dateA - dateB; // Changed from dateB - dateA
    });
    
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
            // Remove the entry at the specified index in the sorted array
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

  // In _updateKarmaHistory method, remove the daily karma calculation:
  async _updateKarmaHistory(history) {
    let totalEarned = 0;
    let totalSpentLifetime = 0;
    
    history.forEach(event => {
      const amount = Number(event.amount) || 0;
      if (amount > 0) {
        totalEarned += amount;
      } else if (amount < 0) {
        // All negative entries are lifetime spending
        totalSpentLifetime += Math.abs(amount);
      }
    });
    
    // Keep current daily karma usage unchanged
    const currentDailyUsed = this.object.system.karma.dailyKarmaUsed || 0;
    
    // Calculate display karma
    const advancementFund = this.object.system.karma.advancement || 0;
    const karmaPool = this.object.system.karma.pool || 0;
    const dailyKarmaMax = this.object.system.karma.dailyKarmaMax || 0;
    
    const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
    let currentKarmaValue;

    if (dailyKarmaEnabled) {
      const dailyRemaining = Math.max(0, dailyKarmaMax - currentDailyUsed);
      currentKarmaValue = dailyRemaining;
      if (dailyRemaining <= 0) {
        currentKarmaValue = Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool);
      }
    } else {
      currentKarmaValue = Math.max(0, totalEarned - totalSpentLifetime - advancementFund - karmaPool);
    }

    await this.object.update({
      "system.karma.history": history,
      "system.attributes.karma.value": currentKarmaValue,
      "system.karma.lifetime": totalEarned
      // Don't modify dailyKarmaUsed here
    });
    
    this.render();
  }

}