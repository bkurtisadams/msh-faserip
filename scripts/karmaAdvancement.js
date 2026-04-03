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
    
    // Calculate current available karma (lifetime - spent - advancement - pool)
    context.currentKarma = this._getCurrentKarma();
    
    return context;
  }

  _getCurrentKarma() {
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
    
    return Math.max(0, totalEarned - totalSpent - advancementFund);
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.allocate-karma').click(ev => this._onAllocateKarma(ev));
    html.find('.purchase-advancement').click(ev => this._onPurchaseAdvancement(ev));
    html.find('.reset-advancement').click(ev => this._onResetAdvancement(ev));
    
    html.find('#advancement-type').change(ev => {
      const type = ev.currentTarget.value;
      if (type === "ability") {
        html.find('#ability-selector').removeClass('hidden');
      } else {
        html.find('#ability-selector').addClass('hidden');
      }
      this._updateAdvancementCalculator(html, type);
    });

    html.find('#ability-to-advance').change(ev => {
      const type = html.find('#advancement-type').val();
      if (type === "ability") {
        this._updateAdvancementCalculator(html, type);
      }
    });
  }

  _onAllocateKarma(event) {
    event.preventDefault();
    
    const advancementType = this.element.find('#advancement-type').val();
    if (!advancementType) {
      ui.notifications.warn("Please select an advancement purpose.");
      return;
    }
    
    const currentAdvancement = this.object.system.karma.advancementPurpose;
    if (currentAdvancement && currentAdvancement !== advancementType) {
      ui.notifications.warn(`You already have karma allocated for ${currentAdvancement}. You must complete that advancement first.`);
      return;
    }
    
    let abilityToAdvance = "";
    if (advancementType === "ability") {
      abilityToAdvance = this.element.find('#ability-to-advance').val();
    }
    
    const currentKarma = this._getCurrentKarma();
    
    new Dialog({
      title: "Allocate Karma for Advancement",
      content: `
        <form>
          <div class="form-group">
            <label>Current Available Karma: ${currentKarma}</label>
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
            
            // FIX: Only update advancement fund, don't create history entry
            // The history entry represents actual spending, advancement fund is just allocation
            const newAdvancementKarma = (this.object.system.karma.advancement || 0) + amount;
            
            await this.object.update({
              "system.karma.advancement": newAdvancementKarma,
              "system.karma.advancementPurpose": advancementType,
              "system.karma.advancementDetail": abilityToAdvance
            });
            
            ui.notifications.info(`Allocated ${amount} karma for ${advancementType}`);
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

  _onResetAdvancement(event) {
    event.preventDefault();
    
    const currentAdvancement = this.object.system.karma.advancement || 0;
    const currentPurpose = this.object.system.karma.advancementPurpose || "";
    
    if (currentAdvancement <= 0 && !currentPurpose) {
      ui.notifications.warn("No karma is currently allocated to advancement.");
      return;
    }
    
    new Dialog({
      title: "Reset Advancement Fund",
      content: `
        <p>Are you sure you want to reset the advancement fund?</p>
        <p>Current advancement fund: <strong>${currentAdvancement}</strong> karma</p>
        <p>Current advancement purpose: <strong>${currentPurpose || "None"}</strong></p>
        <p>This will return the karma to your available karma pool.</p>
      `,
      buttons: {
        reset: {
          icon: '<i class="fas fa-undo"></i>',
          label: "Reset Advancement",
          callback: async () => {
            // FIX: Simply reset the advancement fund, no history entry needed
            // since allocation didn't create a history entry
            await this.object.update({
              "system.karma.advancement": 0,
              "system.karma.advancementPurpose": "",
              "system.karma.advancementDetail": ""
            });
            
            ui.notifications.info(`Advancement fund reset. ${currentAdvancement} karma returned to available pool.`);
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

  async _onPurchaseAdvancement(event) {
    event.preventDefault();
    
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
        const abilityData = this.object.system.abilities[ability];
        if (!abilityData) {
          ui.notifications.error("Ability data not found.");
          return;
        }
        
        const abilityValue = abilityData.value || 0;
        const nextNumber = abilityValue + 1;
        const isCresting = this._isCresting(abilityValue, nextNumber);
        
        const baseCost = 10 * abilityValue;
        const crestingCost = isCresting ? 400 : 0;
        cost = baseCost + crestingCost;
        
        description = `Advanced ${ability} from ${abilityValue} to ${nextNumber}`;
        updateData[`system.abilities.${ability}.value`] = nextNumber;
        
        // Update rank if cresting
        if (isCresting) {
          const newRank = this._getNewRank(nextNumber);
          updateData[`system.abilities.${ability}.rank`] = newRank;
        }
        break;
        
      case "power": {
        const customCost = await this._askForCustomCost("Power Advancement", "Enter the karma cost for this power advancement:");
        if (customCost === null) return;
        this._completePurchase(customCost, `Power advancement (${customCost} karma)`, {});
        return;
      }
        
      case "powerAdd": {
        const customCost = await this._askForCustomCost("Power Addition", "Enter the karma cost for this power addition:");
        if (customCost === null) return;
        this._completePurchase(customCost, `Power addition (${customCost} karma)`, {});
        return;
      }
        
      case "resource":
        const resourceRank = this.object.system.attributes.resources.rank || "Typical";
        const resourceValue = this.object.system.attributes.resources.value || 6;
        const nextResourceValue = resourceValue + 1;
        const resourceCresting = this._isCresting(resourceValue, nextResourceValue);
        
        const resourceBaseCost = 10 * nextResourceValue;
        const resourceCrestingCost = resourceCresting ? 200 : 0;
        cost = resourceBaseCost + resourceCrestingCost;
        
        description = `Advanced Resources from ${resourceRank} (${resourceValue}) to ${nextResourceValue}`;
        updateData["system.attributes.resources.value"] = nextResourceValue;
        
        if (resourceCresting) {
          const newResourceRank = this._getNewRank(nextResourceValue);
          updateData["system.attributes.resources.rank"] = newResourceRank;
        }
        break;
        
      case "popularity":
        const heroPopularity = this.object.system.attributes.popularity.hero?.value || 0;
        const nextPopularity = heroPopularity + 1;
        
        cost = 10 * Math.abs(heroPopularity);
        description = `Advanced Hero Popularity from ${heroPopularity} to ${nextPopularity}`;
        updateData["system.attributes.popularity.hero.value"] = nextPopularity;
        break;
        
      case "talent": {
        const customCost = await this._askForCustomCost("Talent Addition", "Enter karma cost (1000 for NPC, 2000 for PC):");
        if (customCost === null) return;
        this._completePurchase(customCost, `Talent addition (${customCost} karma)`, {});
        return;
      }
        
      case "contact": {
        const customCost = await this._askForCustomCost("Contact Addition", "Enter karma cost (500 + 10×Resource rank):");
        if (customCost === null) return;
        this._completePurchase(customCost, `Contact addition (${customCost} karma)`, {});
        return;
      }
        
      default:
        ui.notifications.error("Unknown advancement type.");
        return;
    }
    
    // For ability, resource, and popularity (direct calculations)
    this._completePurchase(cost, description, updateData);
  }

  async _completePurchase(cost, description, updateData) {
    const availableKarma = this.object.system.karma.advancement || 0;

    if (cost <= 0) {
      ui.notifications.error("Invalid advancement cost.");
      return;
    }

    if (availableKarma < cost) {
      ui.notifications.warn(`Not enough karma in advancement fund. Need ${cost}, have ${availableKarma}.`);
      return;
    }

    const confirm = await new Promise(resolve => {
      new Dialog({
        title: "Confirm Advancement",
        content: `
          <p><strong>${description}</strong></p>
          <p>Cost: <strong>${cost} Karma</strong></p>
          <p>Advancement Fund: ${availableKarma} → ${availableKarma - cost}</p>
        `,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-check"></i>',
            label: "Confirm",
            callback: () => resolve(true)
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "confirm"
      }).render(true);
    });

    if (!confirm) return;

    // Deduct from advancement fund
    const newAdvancement = availableKarma - cost;
    const finalUpdate = {
      "system.karma.advancement": newAdvancement,
      ...updateData
    };

    // Clear advancement purpose if fund is empty
    if (newAdvancement <= 0) {
      finalUpdate["system.karma.advancementPurpose"] = "";
      finalUpdate["system.karma.advancementDetail"] = "";
    }

    await this.object.update(finalUpdate);

    // Log to karma history
    const history = foundry.utils.deepClone(this.object.system.karma.history || []);
    history.push({
      amount: -cost,
      reason: `Advancement: ${description}`,
      date: new Date().toISOString()
    });
    await this.object.update({ "system.karma.history": history });

    // Chat message
    await ChatMessage.create({
      content: `<div style="background:#e8f5e9;border:1px solid #4CAF50;padding:8px;border-radius:3px;">
        <strong>${this.object.name}</strong> — ${description}
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Cost: ${cost} Karma | Remaining Fund: ${newAdvancement}
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: this.object })
    });

    ui.notifications.info(`${description} — ${cost} Karma spent.`);
    this.render();
  }

  _askForCustomCost(title, message) {
    return new Promise((resolve) => {
      new Dialog({
        title: title,
        content: `
          <form>
            <div class="form-group">
              <label>${message}</label>
              <input type="number" name="cost" value="100" min="1">
            </div>
          </form>
        `,
        buttons: {
          ok: {
            label: "OK",
            callback: (html) => {
              const cost = parseInt(html.find('[name="cost"]').val()) || 0;
              resolve(cost);
            }
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }).render(true);
    });
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
        if (!ability) {
          content = `<p>Please select an ability to advance.</p>`;
          break;
        }
        
        const abilityData = this.object.system.abilities[ability];
        if (!abilityData) {
          content = `<p>Ability data not found.</p>`;
          break;
        }
        
        const abilityValue = abilityData.value || 0;
        const abilityRank = abilityData.rank || "Typical";
        const nextNumber = abilityValue + 1;
        const isCresting = this._isCresting(abilityValue, nextNumber);
        
        const baseCost = 10 * abilityValue;
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
        
      default:
        content = `<p>Cost calculation for ${type} not yet implemented.</p>`;
    }
    
    contentDiv.html(content);
  }

  _isCresting(currentValue, nextValue) {
    // Define rank boundaries (minimum value for each rank)
    const rankBoundaries = [0, 2, 4, 6, 10, 20, 30, 40, 50, 75, 100, 150, 200, 500, 1000, 3000, 5000, 10000];
    
    let currentRankIndex = 0;
    let nextRankIndex = 0;
    
    // Find current rank
    for (let i = rankBoundaries.length - 1; i >= 0; i--) {
      if (currentValue >= rankBoundaries[i]) {
        currentRankIndex = i;
        break;
      }
    }
    
    // Find next rank
    for (let i = rankBoundaries.length - 1; i >= 0; i--) {
      if (nextValue >= rankBoundaries[i]) {
        nextRankIndex = i;
        break;
      }
    }
    
    return nextRankIndex > currentRankIndex;
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

async _getPowerAdvancementCost() {
  return new Promise((resolve) => {
    new Dialog({
      title: "Power Advancement Cost",
      content: `
        <form>
          <div class="form-group">
            <label>Power Name:</label>
            <input type="text" name="powerName" placeholder="Enter power name">
          </div>
          <div class="form-group">
            <label>Current Rank Number:</label>
            <input type="number" name="currentRank" value="30" min="1">
          </div>
          <div class="form-group">
            <label>Rank Numbers to Advance:</label>
            <input type="number" name="rankGain" value="1" min="1">
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="cresting"> Cresting to next rank tier (+500 karma)
            </label>
          </div>
        </form>
      `,
      buttons: {
        calculate: {
          label: "Calculate Cost",
          callback: (html) => {
            const powerName = html.find('[name="powerName"]').val() || "Power";
            const currentRank = parseInt(html.find('[name="currentRank"]').val()) || 30;
            const rankGain = parseInt(html.find('[name="rankGain"]').val()) || 1;
            const cresting = html.find('[name="cresting"]').is(':checked');
            
            const baseCost = 20 * rankGain;
            const crestingCost = cresting ? 500 : 0;
            const totalCost = baseCost + crestingCost;
            
            resolve({
              cost: totalCost,
              description: `Advanced ${powerName} by ${rankGain} rank${rankGain > 1 ? 's' : ''}${cresting ? ' (cresting)' : ''}`
            });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "calculate"
    }).render(true);
  });
}

async _getPowerAdditionCost() {
  return new Promise((resolve) => {
    new Dialog({
      title: "Power Addition Cost",
      content: `
        <form>
          <div class="form-group">
            <label>New Power Name:</label>
            <input type="text" name="powerName" placeholder="Enter new power name">
          </div>
          <div class="form-group">
            <label>Starting Rank Number:</label>
            <input type="number" name="startingRank" value="6" min="1">
          </div>
        </form>
      `,
      buttons: {
        calculate: {
          label: "Calculate Cost",
          callback: (html) => {
            const powerName = html.find('[name="powerName"]').val() || "New Power";
            const startingRank = parseInt(html.find('[name="startingRank"]').val()) || 6;
            
            const totalCost = 3000 + (40 * startingRank);
            
            resolve({
              cost: totalCost,
              description: `Added new power: ${powerName} at rank ${startingRank}`
            });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "calculate"
    }).render(true);
  });
}

async _getTalentAdditionCost() {
  return new Promise((resolve) => {
    new Dialog({
      title: "Talent Addition Cost",
      content: `
        <form>
          <div class="form-group">
            <label>Talent Name:</label>
            <input type="text" name="talentName" placeholder="Enter talent name">
          </div>
          <div class="form-group">
            <label>Learning From:</label>
            <select name="source">
              <option value="pc">Player Character (2000 karma)</option>
              <option value="npc">NPC (1000 karma)</option>
            </select>
          </div>
        </form>
      `,
      buttons: {
        calculate: {
          label: "Calculate Cost",
          callback: (html) => {
            const talentName = html.find('[name="talentName"]').val() || "New Talent";
            const source = html.find('[name="source"]').val();
            
            const cost = source === "pc" ? 2000 : 1000;
            
            resolve({
              cost: cost,
              description: `Learned talent: ${talentName} from ${source === "pc" ? "PC" : "NPC"}`
            });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "calculate"
    }).render(true);
  });
}

async _getContactAdditionCost() {
  return new Promise((resolve) => {
    new Dialog({
      title: "Contact Addition Cost",
      content: `
        <form>
          <div class="form-group">
            <label>Contact Name:</label>
            <input type="text" name="contactName" placeholder="Enter contact name">
          </div>
          <div class="form-group">
            <label>Contact's Resource Rank:</label>
            <select name="resourceRank">
              <option value="2">Feeble (2)</option>
              <option value="4">Poor (4)</option>
              <option value="6">Typical (6)</option>
              <option value="10">Good (10)</option>
              <option value="20">Excellent (20)</option>
              <option value="30">Remarkable (30)</option>
              <option value="40">Incredible (40)</option>
              <option value="50">Amazing (50)</option>
              <option value="75">Monstrous (75)</option>
              <option value="100">Unearthly (100)</option>
            </select>
          </div>
        </form>
      `,
      buttons: {
        calculate: {
          label: "Calculate Cost",
          callback: (html) => {
            const contactName = html.find('[name="contactName"]').val() || "New Contact";
            const resourceRank = parseInt(html.find('[name="resourceRank"]').val()) || 6;
            
            const totalCost = 500 + (10 * resourceRank);
            
            resolve({
              cost: totalCost,
              description: `Added contact: ${contactName} (Resource rank ${resourceRank})`
            });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "calculate"
    }).render(true);
  });
}
}