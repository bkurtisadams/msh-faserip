// karma.js
export class KarmaSheet extends DocumentSheet {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["faserip", "sheet", "karma"],
        template: "systems/msh-faserip/templates/karma-sheet.html",
        width: 640,
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
      
      return context;
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
                <option value="Defeatea Foe">Defeated Foe (varies)</option>
                <option value="Personal Commitment">Personal Commitment (+5)</option>
                <option value="Weekly Award">Weekly Award (+10)</option>
                <option value="Charity">Charity Appearance (Pop)</option>
                <option value="Defeat">Defeat (-20/-40)</option>
                <option value="Property Damage">Property Damage (-5 per area)</option>
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
      input.accept = '.csv,.xlsx,.xls';
      
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
      // Read the file
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csv = e.target.result;
        
        // Parse CSV with PapaParse
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            this._showImportDialog(results.data);
          },
          error: (error) => {
            ui.notifications.error("Error parsing CSV file: " + error.message);
          }
        });
      };
      reader.readAsText(file);
    }
  
    async _importExcel(file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        
        try {
          // Parse Excel file with SheetJS
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          
          this._showImportDialog(jsonData);
        } catch (error) {
          ui.notifications.error("Error parsing Excel file: " + error.message);
        }
      };
      reader.readAsArrayBuffer(file);
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
      let currentKarma = 0;
      let lifetimeKarma = 0;
      
      history.forEach(event => {
        const amount = Number(event.amount) || 0;
        currentKarma += amount;
        if (amount > 0) lifetimeKarma += amount;
      });
      
      // Ensure karma doesn't go negative
      currentKarma = Math.max(0, currentKarma);
      
      // Update the actor
      await this.object.update({
        "system.karma.history": history,
        "system.attributes.karma.value": currentKarma,
        "system.karma.lifetime": lifetimeKarma
      });
      
      this.render();
    }
  }