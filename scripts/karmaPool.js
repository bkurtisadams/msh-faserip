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
    
    // Force fresh actor data by re-fetching from game.actors
    const freshActor = game.actors.get(this.object.id);
    const actorData = freshActor.toObject(false);
    
    context.system = actorData.system;
    context.actorName = freshActor.name;
    context.isGM = game.user.isGM;
    
    // Get shared team pool
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    // Get team members - FORCE FRESH DATA
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    context.poolMembers = teamMemberIds.map(id => {
      const member = game.actors.get(id); // Force fresh fetch
      if (!member) return null;
      
      return {
        id: member.id,
        name: member.name,
        karma: member.system.attributes?.karma?.value || 0,
        poolContribution: member.system.karma?.poolContribution || 0
      };
    }).filter(m => m !== null); // Remove any null entries
    
    // Calculate current actor's available karma using fresh data
    context.currentKarma = this._getCurrentKarma();
    
    return context;
  }

  _getCurrentKarma() {
    // Force fresh actor data
    const freshActor = game.actors.get(this.object.id);
    
    // Calculate lifetime karma minus spent minus advancement
    const totalEarned = freshActor.system.karma?.lifetime || 0;
    let totalSpent = 0;
    
    if (freshActor.system.karma?.history && Array.isArray(freshActor.system.karma.history)) {
      freshActor.system.karma.history.forEach(event => {
        if (event.amount < 0) {
          totalSpent += Math.abs(event.amount);
        }
      });
    }
    
    const advancementFund = freshActor.system.karma?.advancement || 0;
    
    return Math.max(0, totalEarned - totalSpent - advancementFund);
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.contribute-to-pool').click(ev => this._onContributeToPool(ev));
    html.find('.use-from-pool').click(ev => this._onUseFromPool(ev));
    html.find('.add-to-pool').click(ev => this._onAddToPool(ev));
    html.find('.remove-from-pool').click(ev => this._onRemoveFromPool(ev));
    html.find('.delete-pool').click(ev => this._onDeletePool(ev));
    html.find('.withdraw-from-pool').click(ev => this._onWithdrawFromPool(ev));
    html.find('.gm-adjust-pool').click(ev => this._onGMAdjustPool(ev));
    html.find('.gm-edit-contribution').click(ev => this._onGMEditContribution(ev));
    html.find('.reset-all-contributions').click(ev => this._onResetAllContributions(ev));
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
      content: `
        <p>Remove <strong>${member.name}</strong> from the team karma pool?</p>
        <p style="color: #666; font-size: 0.9em;">
          This will reset their pool contribution to 0.
        </p>
      `,
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
              
              // Reset pool contribution
              await member.update({
                "system.karma.poolContribution": 0
              });
              
              ui.notifications.info(`${member.name} removed from team pool.`);
              this.render(true); // Force full refresh
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
    
    const refundPerMember = teamMembers.length > 0 ? Math.floor(currentPool / teamMembers.length) : 0;
    
    const confirmed = await Dialog.confirm({
      title: "Delete Karma Pool",
      content: `
        <p>Delete the team karma pool and clean up all member data?</p>
        <p><strong>Pool Total:</strong> ${currentPool} karma</p>
        <p><strong>Team Members:</strong> ${teamMembers.length}</p>
        ${currentPool > 0 ? `<p><strong>Refund Per Member:</strong> ${refundPerMember} karma</p>` : ''}
        <p style="color: #8b0000; margin-top: 10px;">This will reset the pool to 0, clear all contribution tracking, and optionally refund karma.</p>
      `
    });
    
    if (confirmed) {
      // Update all members
      const updates = [];
      
      for (const member of teamMembers) {
        const updateData = {
          "system.karma.poolContribution": 0
        };
        
        if (currentPool > 0 && refundPerMember > 0) {
          const karmaEvent = {
            realDate: new Date().toLocaleDateString(),
            gameDate: "",
            amount: refundPerMember,
            type: "Pool Refund",
            description: `Team karma pool dissolved - equal share refunded`
          };
          
          const history = foundry.utils.deepClone(member.system.karma?.history || []);
          history.push(karmaEvent);
          updateData["system.karma.history"] = history;
        }
        
        updates.push(member.update(updateData));
      }
      
      // Wait for all updates to complete
      await Promise.all(updates);
      
      // Reset pool to 0
      await game.settings.set("msh-faserip", "teamKarmaPoolTotal", 0);
      
      // Small delay to ensure data propagates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      ui.notifications.info(`Team karma pool dissolved. ${currentPool > 0 ? `${refundPerMember} karma refunded to each of ${teamMembers.length} members.` : 'All contribution data cleared.'}`);
      
      // Force full re-render
      this.render(true);
    }
  }

  // NEW: Individual withdrawal method
  _onWithdrawFromPool(event) {
    event.preventDefault();
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const numberOfMembers = teamMemberIds.length;
    
    if (currentPool === 0) {
      ui.notifications.warn("Pool is empty - nothing to withdraw.");
      return;
    }
    
    if (numberOfMembers === 0) {
      ui.notifications.warn("No team members in pool.");
      return;
    }
    
    const equalShare = Math.floor(currentPool / numberOfMembers);
    
    new Dialog({
      title: "Withdraw from Team Pool",
      content: `
        <div style="margin-bottom: 15px;">
          <p><strong>${this.object.name}</strong> will withdraw from the team karma pool.</p>
          <div style="background: #f5f5f0; padding: 10px; border-radius: 3px; margin: 10px 0;">
            <div><strong>Current Pool:</strong> ${currentPool} karma</div>
            <div><strong>Team Members:</strong> ${numberOfMembers}</div>
            <div><strong>Your Equal Share:</strong> ${equalShare} karma</div>
          </div>
          <p style="color: #666; font-size: 0.9em;">
            Per FASERIP rules, you receive an equal share (${currentPool} ÷ ${numberOfMembers}) regardless of original contribution.
          </p>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="leaveTeam" checked />
            Remove me from team pool members
          </label>
        </div>
      `,
      buttons: {
        withdraw: {
          icon: '<i class="fas fa-hand-holding-usd"></i>',
          label: "Withdraw",
          callback: async (html) => {
            const leaveTeam = html.find('[name="leaveTeam"]').is(':checked');
            
            // Add karma to actor's history
            const karmaEvent = {
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: equalShare,
              type: "Pool Withdrawal",
              description: `Withdrew equal share from team karma pool`
            };
            
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            // Reset pool contribution
            await this.object.update({
              "system.karma.history": history,
              "system.karma.poolContribution": 0
            });
            
            // Reduce pool
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool - equalShare);
            
            // Optionally remove from team
            if (leaveTeam) {
              const index = teamMemberIds.indexOf(this.object.id);
              if (index > -1) {
                teamMemberIds.splice(index, 1);
                await game.settings.set("msh-faserip", "teamMembers", teamMemberIds);
              }
            }
            
            ui.notifications.info(`${this.object.name} withdrew ${equalShare} karma from the team pool!`);
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

// NEW: GM adjust pool total
  _onGMAdjustPool(event) {
    event.preventDefault();
    
    if (!game.user.isGM) return;
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    new Dialog({
      title: "GM: Adjust Team Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Current Pool Total:</label>
            <input type="number" value="${currentPool}" disabled />
          </div>
          <div class="form-group">
            <label>New Pool Total:</label>
            <input type="number" name="newTotal" value="${currentPool}" min="0" />
          </div>
          <div class="form-group">
            <label>Reason (optional):</label>
            <input type="text" name="reason" placeholder="e.g., GM award, correction..." />
          </div>
        </form>
      `,
      buttons: {
        adjust: {
          icon: '<i class="fas fa-check"></i>',
          label: "Set Pool",
          callback: async (html) => {
            const newTotal = Number(html.find('[name="newTotal"]').val());
            const reason = html.find('[name="reason"]').val();
            
            if (newTotal < 0) {
              ui.notifications.error("Pool total cannot be negative.");
              return;
            }
            
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", newTotal);
            
            const message = reason ? `: ${reason}` : '';
            ui.notifications.info(`Team karma pool adjusted to ${newTotal}${message}`);
            this.render();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "adjust"
    }).render(true);
  }

// NEW: GM edit individual contribution
  _onGMEditContribution(event) {
    event.preventDefault();
    
    if (!game.user.isGM) return;
    
    const memberId = event.currentTarget.dataset.id;
    const memberName = event.currentTarget.dataset.name;
    const member = game.actors.get(memberId);
    
    if (!member) return;
    
    const currentContribution = member.system.karma?.poolContribution || 0;
    
    new Dialog({
      title: `GM: Edit ${memberName}'s Contribution`,
      content: `
        <form>
          <div class="form-group">
            <label>Current Pool Contribution:</label>
            <input type="number" value="${currentContribution}" disabled />
          </div>
          <div class="form-group">
            <label>New Pool Contribution:</label>
            <input type="number" name="newContribution" value="${currentContribution}" min="0" />
          </div>
          <p style="color: #666; font-size: 0.9em; margin-top: 8px;">
            Note: This only changes the tracked contribution amount, not the actual pool total or personal karma.
          </p>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            const newContribution = Number(html.find('[name="newContribution"]').val());
            
            if (newContribution < 0) {
              ui.notifications.error("Contribution cannot be negative.");
              return;
            }
            
            await member.update({
              "system.karma.poolContribution": newContribution
            });
            
            ui.notifications.info(`${memberName}'s pool contribution updated to ${newContribution}`);
            this.render();
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

  _onResetAllContributions(event) {
    event.preventDefault();
    
    if (!game.user.isGM) return;
    
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const teamMembers = game.actors.filter(a => teamMemberIds.includes(a.id));
    
    new Dialog({
      title: "Reset All Contribution Tracking",
      content: `
        <p>Reset all pool contribution values to 0 for all ${teamMembers.length} team members?</p>
        <p style="color: #666; font-size: 0.9em;">This will not affect the pool total or personal karma, only the tracked contribution amounts.</p>
      `,
      buttons: {
        reset: {
          icon: '<i class="fas fa-eraser"></i>',
          label: "Reset All",
          callback: async () => {
            // Update all members and wait for completion
            const updates = teamMembers.map(member => 
              member.update({ "system.karma.poolContribution": 0 })
            );
            
            await Promise.all(updates);
            
            // Small delay to ensure data propagates
            await new Promise(resolve => setTimeout(resolve, 100));
            
            ui.notifications.info("All contribution tracking reset to 0.");
            
            // Force a full re-render with fresh data
            this.render(true);
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
  
} // end of class KarmaPoolSheet