export class KarmaAdvancementSheet extends DocumentSheet {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["faserip", "sheet", "karma-advancement"],
        template: "systems/msh-faserip/templates/karma-advancement-sheet.html",
        width: 480,
        height: 400,
        resizable: true,
        closeOnSubmit: false,
        submitOnChange: false
      });
    }
  
    get title() {
      return `Karma Advancement: ${this.object.name}`;
    }
  
    getData() {
      const context = super.getData();
      const actorData = this.object.toObject(false);
      
      context.system = actorData.system;
      
      // Calculate current available karma
      context.currentKarma = this._getCurrentKarma();
      
      return context;
    }
  
    _getCurrentKarma() {
      // Same method as in KarmaSheet
      const totalEarned = this.object.system.karma.lifetime || 0;
      let totalSpent = 0;
      
      if (this.object.system.karma.history && Array.isArray(this.object.system.karma.history)) {
        this.object.system.karma.history.forEach(event => {
          if (event.amount < 0) {
            totalSpent += Math.abs(event.amount);
          }
        });
      }
      
      const advancementFund = this.object.system.karma.advancement || 0;
      const karmaPool = this.object.system.karma.pool || 0;
      
      return Math.max(0, totalEarned - totalSpent - advancementFund - karmaPool);
    }
  
    activateListeners(html) {
      super.activateListeners(html);
      
      html.find('.allocate-karma').click(ev => this._onAllocateKarma(ev));
      html.find('.purchase-advancement').click(ev => this._onPurchaseAdvancement(ev));
      
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
  
    // Copy/Paste the advancement-related methods from karma.js here
    // _onAllocateKarma, _onPurchaseAdvancement, _updateAdvancementCalculator, etc.
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
    
    // Get calculated current karma instead of using attributes.karma.value
    const currentKarma = this._getCurrentKarma();
    
    new Dialog({
      title: "Allocate Karma for Advancement",
      content: `
        <form>
          <div class="form-group">
            <label>Current Karma: ${currentKarma}</label>
          </div>
          <div class="form-group">
            <label>Amount to Allocate:</label>
            <input type="number" name="amount" value="0" min="0" max="${currentKarma}">
          </div>
        </form>
      `,
      buttons: {
        allocate: {
          icon: '<i class="fas fa-check"></i>',
          label: "Allocate",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            
            if (amount <= 0 || amount > currentKarma) {
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
            let advancementKarma = (this.object.system.karma.advancement || 0) + amount;
            
            // Update the actor
            await this.object.update({
              "system.karma.history": history,
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
  }