export class KarmaPoolSheet extends DocumentSheet {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["faserip", "sheet", "karma-pool"],
        template: "systems/msh-faserip/templates/karma-pool-sheet.html",
        width: 480,
        height: 400,
        resizable: true,
        closeOnSubmit: false,
        submitOnChange: false
      });
    }
  
    get title() {
      return `Karma Pool: ${this.object.name}`;
    }
  
    getData() {
      const context = super.getData();
      const actorData = this.object.toObject(false);
      
      context.system = actorData.system;
      
      // Ensure karma pool members exist
      if (!context.system.karma.poolMembers) {
        context.system.karma.poolMembers = [];
      }
      
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
      
      html.find('.contribute-to-pool').click(ev => this._onContributeToPool(ev));
      html.find('.withdraw-from-pool').click(ev => this._onWithdrawFromPool(ev));
      html.find('.add-to-pool').click(ev => this._onAddToPool(ev));
      html.find('.remove-from-pool').click(ev => this._onRemoveFromPool(ev));
      
      // Update pool name when it changes
      html.find('#pool-name').change(ev => {
        const poolName = ev.currentTarget.value.trim();
        this.object.update({
          "system.karma.poolName": poolName
        });
      });
      
      // Populate available characters
      const availableActors = game.actors.filter(a => 
        a.id !== this.object.id && 
        (a.type === "hero" || a.type === "villain" || a.type === "npc")
      );
      
      const select = html.find('#available-characters');
      availableActors.forEach(actor => {
        const option = document.createElement('option');
        option.value = actor.id;
        option.text = actor.name;
        select.append(option);
      });
    }
  
    // Copy/Paste the pool-related methods from karma.js here
    // _onContributeToPool, _onWithdrawFromPool, _onAddToPool, _onRemoveFromPool
    // Karma Pool Methods
  _onContributeToPool(event) {
    event.preventDefault();
    
    // Get calculated current karma instead of using attributes.karma.value
    const currentKarma = this._getCurrentKarma();
    
    new Dialog({
      title: "Contribute to Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Current Karma: ${currentKarma}</label>
          </div>
          <div class="form-group">
            <label>Amount to Contribute:</label>
            <input type="number" name="amount" value="0" min="0" max="${currentKarma}">
          </div>
        </form>
      `,
      buttons: {
        contribute: {
          icon: '<i class="fas fa-check"></i>',
          label: "Contribute",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            
            if (amount <= 0 || amount > currentKarma) {
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
            let poolKarma = (this.object.system.karma.pool || 0) + amount;
            
            // Update the actor
            await this.object.update({
              "system.karma.history": history,
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
  // other methods
  }