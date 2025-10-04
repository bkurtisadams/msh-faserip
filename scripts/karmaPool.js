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
    return `Team Karma Pool`;
  }

  getData() {
    const context = super.getData();
    const actorData = this.object.toObject(false);
    
    context.system = actorData.system;
    context.actorName = this.object.name;
    
    // Get shared team pool
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    // Get team members from settings
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    context.poolMembers = game.actors.filter(a => teamMemberIds.includes(a.id)).map(a => ({
      id: a.id,
      name: a.name,
      karma: a.system.attributes?.karma?.value || 0,
      poolContribution: a.system.karma?.poolContribution || 0
    }));
    
    // Calculate current actor's available karma
    context.currentKarma = this._getCurrentKarma();
    
    return context;
  }

  _getCurrentKarma() {
    // Calculate lifetime karma minus spent (excluding daily rolls) minus advancement
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
    
    return Math.max(0, totalEarned - totalSpentLifetime - advancementFund);
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.contribute-to-pool').click(ev => this._onContributeToPool(ev));
    html.find('.use-from-pool').click(ev => this._onUseFromPool(ev));
    html.find('.add-to-pool').click(ev => this._onAddToPool(ev));
    html.find('.remove-from-pool').click(ev => this._onRemoveFromPool(ev));
    html.find('.delete-pool').click(ev => this._onDeletePool(ev));
  }

  _onContributeToPool(event) {
    event.preventDefault();
    
    const currentKarma = this._getCurrentKarma();
    
    new Dialog({
      title: "Contribute to Team Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>${this.object.name}'s Available Karma:</label>
            <input type="number" value="${currentKarma}" disabled />
          </div>
          <div class="form-group">
            <label>Amount to Contribute:</label>
            <input type="number" name="amount" value="0" min="0" max="${currentKarma}" />
          </div>
          <p style="font-size: 0.9em; color: #666; margin-top: 8px;">
            This will be deducted from personal karma and added to the shared team pool.
          </p>
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
              description: `Contributed to team karma pool`
            };
            
            // Add to history
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            // Update lifetime contribution tracking
            const totalContribution = (this.object.system.karma?.poolContribution || 0) + amount;
            
            // Deduct from current karma
            const newCurrent = (this.object.system.attributes.karma.value || 0) - amount;
            
            // Update the actor
            await this.object.update({
              "system.karma.history": history,
              "system.karma.poolContribution": totalContribution,
              "system.attributes.karma.value": newCurrent
            });
            
            // Add to shared team pool
            const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool + amount);
            
            ui.notifications.info(`${this.object.name} contributed ${amount} karma to the team pool!`);
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

  _onUseFromPool(event) {
    event.preventDefault();
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    new Dialog({
      title: "Use Team Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Team Pool Available:</label>
            <input type="number" value="${currentPool}" disabled />
          </div>
          <div class="form-group">
            <label>Amount to Use:</label>
            <input type="number" name="amount" value="0" min="0" max="${currentPool}" />
          </div>
          <div class="form-group">
            <label>Reason:</label>
            <input type="text" name="reason" placeholder="e.g., Critical roll, building project..." />
          </div>
        </form>
      `,
      buttons: {
        use: {
          icon: '<i class="fas fa-check"></i>',
          label: "Use Karma",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            const reason = html.find('[name="reason"]').val();
            
            if (amount <= 0 || amount > currentPool) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool - amount);
            ui.notifications.info(`Used ${amount} karma from team pool${reason ? ': ' + reason : ''}`);
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      }
    }).render(true);
  }

  _onAddToPool(event) {
    event.preventDefault();
    
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const availableActors = game.actors.filter(a => 
      !teamMemberIds.includes(a.id) &&
      a.hasPlayerOwner &&
      a.type === "hero"
    );
    
    if (availableActors.length === 0) {
      ui.notifications.warn("No available heroes to add to the team pool.");
      return;
    }
    
    let options = availableActors.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    
    new Dialog({
      title: "Add Hero to Team Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Select Hero:</label>
            <select name="character">
              <option value="">-- Select Hero --</option>
              ${options}
            </select>
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-user-plus"></i>',
          label: "Add to Team",
          callback: async (html) => {
            const characterId = html.find('[name="character"]').val();
            if (!characterId) {
              ui.notifications.warn("No character selected.");
              return;
            }
            
            const character = game.actors.get(characterId);
            if (!character) return;
            
            teamMemberIds.push(characterId);
            await game.settings.set("msh-faserip", "teamMembers", teamMemberIds);
            
            ui.notifications.info(`${character.name} added to team pool.`);
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
    
    const member = game.actors.get(memberId);
    if (!member) return;
    
    new Dialog({
      title: "Remove from Team Pool",
      content: `<p>Remove ${member.name} from the team karma pool?</p>`,
      buttons: {
        remove: {
          icon: '<i class="fas fa-user-minus"></i>',
          label: "Remove",
          callback: async () => {
            const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
            const index = teamMemberIds.indexOf(memberId);
            
            if (index > -1) {
              teamMemberIds.splice(index, 1);
              await game.settings.set("msh-faserip", "teamMembers", teamMemberIds);
              ui.notifications.info(`${member.name} removed from team pool.`);
              this.render();
            }
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

  async _onDeletePool(event) {
    event.preventDefault();
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const teamMembers = game.actors.filter(a => teamMemberIds.includes(a.id));
    
    if (currentPool === 0) {
      ui.notifications.warn("Pool is already empty.");
      return;
    }
    
    const refundPerMember = Math.floor(currentPool / teamMembers.length);
    
    const confirmed = await Dialog.confirm({
      title: "Delete Karma Pool",
      content: `
        <p>Delete the team karma pool and refund karma to members?</p>
        <p><strong>Pool Total:</strong> ${currentPool} karma</p>
        <p><strong>Team Members:</strong> ${teamMembers.length}</p>
        <p><strong>Refund Per Member:</strong> ${refundPerMember} karma</p>
        <p style="color: #8b0000; margin-top: 10px;">This will reset the pool to 0 and return karma to all team members equally.</p>
      `
    });
    
    if (confirmed) {
      // Refund karma to each team member
      for (const member of teamMembers) {
        const karmaEvent = {
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: refundPerMember,
          type: "Pool Refund",
          description: `Team karma pool dissolved - equal share refunded`
        };
        
        const history = foundry.utils.deepClone(member.system.karma?.history || []);
        history.push(karmaEvent);
        
        const newCurrent = (member.system.attributes.karma.value || 0) + refundPerMember;
        
        await member.update({
          "system.karma.history": history,
          "system.attributes.karma.value": newCurrent
        });
      }
      
      // Reset pool to 0
      await game.settings.set("msh-faserip", "teamKarmaPoolTotal", 0);
      
      ui.notifications.info(`Team karma pool dissolved. ${refundPerMember} karma refunded to each of ${teamMembers.length} members.`);
      this.render();
    }
  }
}