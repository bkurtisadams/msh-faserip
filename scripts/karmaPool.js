// karmaPool.js v2.1.0 - 2026-07-22
// v2.1.0: Karma recompute sites delegate to computeKarmaTotals (karma-rules.js).
// karmaPool.js v2.0.0 - 2026-02-28
// v2.0.0: Rewrite - fix double-deduct, consistent karma calc, add GM award to pool, clean UI
import { computeKarmaTotals } from "./karma-rules.js";

export class KarmaPoolSheet extends DocumentSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "karma-pool"],
      template: "systems/msh-faserip/templates/karma-pool-sheet.html",
      width: 520,
      height: 520,
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
    const freshActor = game.actors.get(this.object.id);
    const actorData = freshActor.toObject(false);
    
    context.system = actorData.system;
    context.actorId = freshActor.id;
    context.actorName = freshActor.name;
    context.isGM = game.user.isGM;
    
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    context.poolMembers = teamMemberIds.map(id => {
      const member = game.actors.get(id);
      if (!member) return null;
      return {
        id: member.id,
        name: member.name,
        karma: this._getActorKarma(member),
        poolContribution: member.system.karma?.poolContribution || 0,
        isCurrent: member.id === freshActor.id
      };
    }).filter(m => m !== null);
    
    context.currentKarma = this._getActorKarma(freshActor);
    context.memberCount = context.poolMembers.length;
    context.equalShare = context.memberCount > 0 ? Math.floor(context.teamKarmaPool / context.memberCount) : 0;
    
    return context;
  }

  _getActorKarma(actor) {
    const totalEarned = actor.system.karma?.lifetime || 0;
    let totalSpent = 0;
    if (actor.system.karma?.history && Array.isArray(actor.system.karma.history)) {
      actor.system.karma.history.forEach(event => {
        if (event.amount < 0) totalSpent += Math.abs(event.amount);
      });
    }
    const advancementFund = actor.system.karma?.advancement || 0;
    return Math.max(0, totalEarned - totalSpent - advancementFund);
  }

  _getGameDate() {
    try {
      const d = game.msh.getCampaignDateTime().date;
      return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
    } catch { return ""; }
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.contribute-to-pool').click(ev => this._onContributeToPool(ev));
    html.find('.use-from-pool').click(ev => this._onUseFromPool(ev));
    html.find('.withdraw-from-pool').click(ev => this._onWithdrawFromPool(ev));
    
    html.find('.add-to-pool').click(ev => this._onAddMember(ev));
    html.find('.remove-from-pool').click(ev => this._onRemoveMember(ev));
    html.find('.gm-adjust-pool').click(ev => this._onGMAdjustPool(ev));
    html.find('.gm-award-pool').click(ev => this._onGMAwardToPool(ev));
    html.find('.gm-edit-contribution').click(ev => this._onGMEditContribution(ev));
    html.find('.reset-all-contributions').click(ev => this._onResetAllContributions(ev));
    html.find('.delete-pool').click(ev => this._onDeletePool(ev));
  }

  _onContributeToPool(event) {
    event.preventDefault();
    const currentKarma = this._getActorKarma(game.actors.get(this.object.id));
    
    new Dialog({
      title: "Contribute to Team Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>${this.object.name}'s Available Karma: <strong>${currentKarma}</strong></label>
          </div>
          <div class="form-group">
            <label>Amount to Contribute:</label>
            <input type="number" name="amount" value="0" min="1" max="${currentKarma}" />
          </div>
          <p style="font-size:0.85em; color:#666; margin-top:6px;">
            Deducted from personal karma and added to the shared team pool.
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
            
            const karmaEvent = {
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: this._getGameDate(),
              amount: -amount,
              type: "Pool Contribution",
              description: `Contributed ${amount} to team karma pool`
            };
            
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            const { earned: totalEarned, value: newKarmaValue } =
              computeKarmaTotals(history, { advancement: this.object.system.karma?.advancement });
            const totalContribution = (this.object.system.karma?.poolContribution || 0) + amount;
            
            await this.object.update({
              "system.karma.history": history,
              "system.karma.lifetime": totalEarned,
              "system.attributes.karma.value": newKarmaValue,
              "system.karma.poolContribution": totalContribution
            });
            
            const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool + amount);
            
            ui.notifications.info(`${this.object.name} contributed ${amount} karma to the team pool.`);
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "contribute"
    }).render(true);
  }

  _onUseFromPool(event) {
    event.preventDefault();
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    if (currentPool <= 0) {
      ui.notifications.warn("Pool is empty.");
      return;
    }
    
    new Dialog({
      title: "Use Team Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Team Pool Available: <strong>${currentPool}</strong></label>
          </div>
          <div class="form-group">
            <label>Amount to Use:</label>
            <input type="number" name="amount" value="10" min="1" max="${currentPool}" />
          </div>
          <div class="form-group">
            <label>Reason:</label>
            <input type="text" name="reason" placeholder="e.g., Critical FEAT roll, building project..." />
          </div>
          <p style="font-size:0.85em; color:#666; margin-top:6px;">
            Pool karma can be used to manipulate die rolls or build things, but not for advancement.
          </p>
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
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "use"
    }).render(true);
  }

  _onWithdrawFromPool(event) {
    event.preventDefault();
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const memberCount = teamMemberIds.length;
    
    if (currentPool === 0) {
      ui.notifications.warn("Pool is empty.");
      return;
    }
    if (memberCount === 0) {
      ui.notifications.warn("No team members in pool.");
      return;
    }
    
    const equalShare = Math.floor(currentPool / memberCount);
    
    new Dialog({
      title: "Withdraw from Team Pool",
      content: `
        <div style="margin-bottom:12px;">
          <p><strong>${this.object.name}</strong> withdraws their equal share from the team pool.</p>
          <div style="background:#f5f5f0; padding:10px; border-radius:4px; margin:10px 0;">
            <div>Current Pool: <strong>${currentPool}</strong></div>
            <div>Team Members: <strong>${memberCount}</strong></div>
            <div>Your Equal Share: <strong>${equalShare}</strong></div>
          </div>
          <p style="font-size:0.85em; color:#666;">
            Per FASERIP rules, you receive an equal share (${currentPool} / ${memberCount}) regardless of original contribution.
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
            
            const karmaEvent = {
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: this._getGameDate(),
              amount: equalShare,
              type: "Pool Withdrawal",
              description: `Withdrew equal share (${equalShare}) from team karma pool`
            };
            
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.push(karmaEvent);
            
            const { earned: totalEarned, value: newKarmaValue } =
              computeKarmaTotals(history, { advancement: this.object.system.karma?.advancement });
            
            await this.object.update({
              "system.karma.history": history,
              "system.karma.lifetime": totalEarned,
              "system.attributes.karma.value": newKarmaValue,
              "system.karma.poolContribution": 0
            });
            
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool - equalShare);
            
            if (leaveTeam) {
              const ids = game.settings.get("msh-faserip", "teamMembers") || [];
              const idx = ids.indexOf(this.object.id);
              if (idx > -1) {
                ids.splice(idx, 1);
                await game.settings.set("msh-faserip", "teamMembers", ids);
              }
            }
            
            ui.notifications.info(`${this.object.name} withdrew ${equalShare} karma from the team pool.`);
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "withdraw"
    }).render(true);
  }

  _onAddMember(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const availableActors = game.actors.filter(a => 
      !teamMemberIds.includes(a.id) && a.hasPlayerOwner && a.type === "hero"
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
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "add"
    }).render(true);
  }

  _onRemoveMember(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    
    const memberId = event.currentTarget.dataset.id;
    if (!memberId) return;
    const member = game.actors.get(memberId);
    if (!member) return;
    
    new Dialog({
      title: "Remove from Team Pool",
      content: `
        <p>Remove <strong>${member.name}</strong> from the team karma pool?</p>
        <p style="font-size:0.85em; color:#666;">This resets their pool contribution tracking to 0.</p>
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
              await member.update({ "system.karma.poolContribution": 0 });
              ui.notifications.info(`${member.name} removed from team pool.`);
              this.render(true);
            }
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "cancel"
    }).render(true);
  }

  _onGMAdjustPool(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    new Dialog({
      title: "GM: Adjust Team Karma Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Current Pool Total: <strong>${currentPool}</strong></label>
          </div>
          <div class="form-group">
            <label>New Pool Total:</label>
            <input type="number" name="newTotal" value="${currentPool}" min="0" />
          </div>
          <div class="form-group">
            <label>Reason (optional):</label>
            <input type="text" name="reason" placeholder="e.g., GM correction..." />
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
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "adjust"
    }).render(true);
  }

  _onGMAwardToPool(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    new Dialog({
      title: "GM: Award Karma to Pool",
      content: `
        <form>
          <div class="form-group">
            <label>Current Pool: <strong>${currentPool}</strong></label>
          </div>
          <div class="form-group">
            <label>Amount to Award:</label>
            <input type="number" name="amount" value="0" min="1" />
          </div>
          <div class="form-group">
            <label>Reason:</label>
            <input type="text" name="reason" placeholder="e.g., Group defeated Rhino, stopped robbery..." />
          </div>
          <p style="font-size:0.85em; color:#666; margin-top:6px;">
            Current karma multiplier: x${multiplier}. Enter the final amount (after any multiplier/split you want to apply).
          </p>
        </form>
      `,
      buttons: {
        award: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Award to Pool",
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val());
            const reason = html.find('[name="reason"]').val();
            if (amount <= 0) {
              ui.notifications.error("Amount must be positive.");
              return;
            }
            await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool + amount);
            ui.notifications.info(`Awarded ${amount} karma to team pool${reason ? ': ' + reason : ''}`);
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award"
    }).render(true);
  }

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
            <label>Current Tracked Contribution: <strong>${currentContribution}</strong></label>
          </div>
          <div class="form-group">
            <label>New Contribution Value:</label>
            <input type="number" name="newContribution" value="${currentContribution}" min="0" />
          </div>
          <p style="font-size:0.85em; color:#666; margin-top:6px;">
            This only changes the tracked amount, not the actual pool total or personal karma.
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
            await member.update({ "system.karma.poolContribution": newContribution });
            ui.notifications.info(`${memberName}'s pool contribution updated to ${newContribution}`);
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
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
        <p style="font-size:0.85em; color:#666;">This does not affect the pool total or personal karma.</p>
      `,
      buttons: {
        reset: {
          icon: '<i class="fas fa-eraser"></i>',
          label: "Reset All",
          callback: async () => {
            const updates = teamMembers.map(member => 
              member.update({ "system.karma.poolContribution": 0 })
            );
            await Promise.all(updates);
            ui.notifications.info("All contribution tracking reset to 0.");
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "cancel"
    }).render(true);
  }

  async _onDeletePool(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    
    const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const teamMembers = game.actors.filter(a => teamMemberIds.includes(a.id));
    const refundPerMember = teamMembers.length > 0 ? Math.floor(currentPool / teamMembers.length) : 0;
    
    const confirmed = await Dialog.confirm({
      title: "Dissolve Karma Pool",
      content: `
        <p>Dissolve the team karma pool and refund karma equally?</p>
        <p><strong>Pool Total:</strong> ${currentPool}</p>
        <p><strong>Team Members:</strong> ${teamMembers.length}</p>
        ${currentPool > 0 ? `<p><strong>Refund Per Member:</strong> ${refundPerMember}</p>` : ''}
        <p style="color:#8b0000; margin-top:10px;">This resets the pool to 0, clears all contribution tracking, and refunds karma.</p>
      `
    });
    
    if (!confirmed) return;
    
    const updates = [];
    for (const member of teamMembers) {
      const updateData = { "system.karma.poolContribution": 0 };
      
      if (currentPool > 0 && refundPerMember > 0) {
        const karmaEvent = {
          timestamp: new Date().toISOString(),
          realDate: new Date().toLocaleDateString(),
          gameDate: this._getGameDate(),
          amount: refundPerMember,
          type: "Pool Refund",
          description: `Team karma pool dissolved — equal share refunded`
        };
        
        const history = foundry.utils.deepClone(member.system.karma?.history || []);
        history.push(karmaEvent);
        updateData["system.karma.history"] = history;
        
        const { earned: totalEarned, value: newValue } =
          computeKarmaTotals(history, { advancement: member.system.karma?.advancement });
        updateData["system.karma.lifetime"] = totalEarned;
        updateData["system.attributes.karma.value"] = newValue;
      }
      
      updates.push(member.update(updateData));
    }
    
    await Promise.all(updates);
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", 0);
    
    ui.notifications.info(`Team karma pool dissolved.${currentPool > 0 ? ` ${refundPerMember} karma refunded to each of ${teamMembers.length} members.` : ''}`);
    this.render(true);
  }

} // end of class KarmaPoolSheet
