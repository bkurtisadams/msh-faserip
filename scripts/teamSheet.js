// teamSheet.js - REFACTORED
export class TeamSheet extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "team-tracker"],
      template: "systems/msh-faserip/templates/team-sheet.html",
      width: 620,
      height: 540,
      resizable: true,
      title: "Team Tracker",
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "overview"
        }
      ]
    });
  }

  getData() {
    const context = super.getData();
    context.isGM = game.user.isGM;
    
    // Get team members
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    
    // Force fresh data
    context.teamMembers = teamMemberIds.map(id => {
      const hero = game.actors.get(id);
      if (!hero) return null;
      
      return {
        id: hero.id,
        name: hero.name,
        img: hero.img || "icons/svg/mystery-man.svg",
        
        // Current status
        health: hero.system.attributes?.health?.value || 0,
        healthMax: hero.system.attributes?.health?.max || 0,
        karma: hero.system.attributes?.karma?.value || 0,
        karmaMax: hero.system.attributes?.karma?.max || 0,
        
        // Lifetime karma
        lifetimeKarma: hero.system.karma?.lifetime || 0,
        availableKarma: this._calculateAvailableKarma(hero),
        poolContribution: hero.system.karma?.poolContribution || 0,
        
        // Resources & Popularity
        resources: hero.system.attributes?.resources?.rank || "Typical",
        popularity: hero.system.attributes?.popularity?.hero?.value || 0
      };
    }).filter(m => m !== null);
    
    // Get available heroes
    context.availableHeroes = game.actors.filter(a => 
      a.type === "hero" && 
      a.hasPlayerOwner &&
      !teamMemberIds.includes(a.id)
    ).map(hero => ({
      id: hero.id,
      name: hero.name,
      img: hero.img || "icons/svg/mystery-man.svg"
    }));
    
    // Team karma pool
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    // Team awards history
    context.teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
    
    // Settings
    context.karmaMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    return context;
  }
  
  _calculateAvailableKarma(actor) {
    const lifetime = actor.system.karma?.lifetime || 0;
    let spent = 0;
    
    (actor.system.karma?.history || []).forEach(event => {
      if (event.amount < 0 && event.type !== "Daily Roll") {
        spent += Math.abs(event.amount);
      }
    });
    
    const advancement = actor.system.karma?.advancement || 0;
    const pool = actor.system.karma?.poolContribution || 0;
    
    return Math.max(0, lifetime - spent - advancement - pool);
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Tab switching
    html.find('.tab-button').click(ev => {
      ev.preventDefault();
      const targetTab = ev.currentTarget.dataset.tab;
      
      html.find('.tab-button').removeClass('active');
      html.find('.tab-panel').removeClass('active');
      
      html.find(`[data-tab="${targetTab}"]`).addClass('active');
    });

    // Member management
    html.find('.add-hero-to-team').click(ev => this._onAddHeroToTeam(ev));
    html.find('.remove-hero-from-team').click(ev => this._onRemoveHeroFromTeam(ev));
    html.find('.hero-portrait').click(ev => {
      const heroId = ev.currentTarget.dataset.heroId;
      const hero = game.actors.get(heroId);
      if (hero) hero.sheet.render(true);
    });
    
    // Karma awards
    html.find('.award-team-karma').click(ev => this._onAwardTeamKarma(ev));
    html.find('.award-individual-karma').click(ev => this._onAwardIndividualKarma(ev));
    html.find('.clear-awards-history').click(ev => this._onClearAwardsHistory(ev));
    
    // Pool management
    html.find('.open-pool-manager').click(ev => {
      // Open the karma pool sheet
      import('./karmaPool.js').then(module => {
        const currentActor = game.actors.find(a => game.user.character?.id === a.id) || 
                            game.actors.find(a => a.type === "hero" && a.hasPlayerOwner);
        if (currentActor) {
          const sheet = new module.KarmaPoolSheet(currentActor);
          sheet.render(true);
        } else {
          ui.notifications.warn("No hero character found for current user.");
        }
      });
    });
  }

  async _onAddHeroToTeam(event) {
    const heroId = event.currentTarget.dataset.heroId;
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    
    if (!teamMembers.includes(heroId)) {
      teamMembers.push(heroId);
      await game.settings.set("msh-faserip", "teamMembers", teamMembers);
      ui.notifications.info(`Hero added to team.`);
      this.render(true);
    }
  }

  async _onRemoveHeroFromTeam(event) {
    const heroId = event.currentTarget.dataset.heroId;
    const hero = game.actors.get(heroId);
    
    const confirmed = await Dialog.confirm({
      title: "Remove from Team",
      content: `
        <p>Remove <strong>${hero.name}</strong> from the team?</p>
        <p style="color: #666; font-size: 0.9em;">
          This will reset their karma pool contribution to 0.
        </p>
      `
    });
    
    if (!confirmed) return;
    
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    const index = teamMembers.indexOf(heroId);
    
    if (index > -1) {
      teamMembers.splice(index, 1);
      await game.settings.set("msh-faserip", "teamMembers", teamMembers);
      
      // Reset pool contribution
      if (hero) {
        await hero.update({ "system.karma.poolContribution": 0 });
      }
      
      ui.notifications.info(`${hero.name} removed from team.`);
      this.render(true);
    }
  }

  _onAwardTeamKarma(event) {
    if (!game.user.isGM) return;
    
    const currentMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    new Dialog({
      title: "Award Team Karma (Group Award)",
      content: `
        <form>
          <div class="form-group">
            <label>Base Karma Award:</label>
            <input type="number" name="karmaAmount" value="20" min="1" />
          </div>
          <div class="form-group">
            <label>Award Type:</label>
            <select name="awardType">
              <option value="Rescue">Rescue (+20)</option>
              <option value="Violent Crime">Stop Violent Crime (+30)</option>
              <option value="Destructive Crime">Stop Destructive Crime (+20)</option>
              <option value="Theft">Stop Theft (+10)</option>
              <option value="Defeated Foe - Remarkable">Defeated Remarkable Foe (+30)</option>
              <option value="Defeated Foe - Incredible">Defeated Incredible Foe (+40)</option>
              <option value="Defeated Foe - Amazing">Defeated Amazing Foe (+50)</option>
              <option value="Defeated Foe - Monstrous">Defeated Monstrous Foe (+75)</option>
              <option value="Defeated Foe - Unearthly">Defeated Unearthly Foe (+100)</option>
              <option value="Team Mission">Team Mission Success</option>
              <option value="Custom">Custom Team Award</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" rows="3" placeholder="Describe the team's heroic deed..."></textarea>
          </div>
          <div class="form-group">
            <label>Karma Multiplier (1-10):</label>
            <input type="number" name="karmaMultiplier" value="${currentMultiplier}" min="1" max="10" />
            <small style="color: #666; display: block; margin-top: 5px;">
              House rule: Scale karma for difficulty. Default 1x.
            </small>
          </div>
          <div class="form-group" style="background: #fff3e0; padding: 10px; border-radius: 3px;">
            <label>
              <input type="checkbox" name="addToPool" checked />
              Add to Team Karma Pool (recommended for group awards)
            </label>
            <small style="color: #666; display: block; margin-top: 5px;">
              Unchecked = split equally among members' personal karma
            </small>
          </div>
        </form>
      `,
      buttons: {
        award: {
          icon: '<i class="fas fa-trophy"></i>',
          label: "Award Karma",
          callback: async (html) => {
            const karmaAmount = Number(html.find('[name="karmaAmount"]').val());
            const awardType = html.find('[name="awardType"]').val();
            const description = html.find('[name="description"]').val();
            const multiplier = Number(html.find('[name="karmaMultiplier"]').val());
            const addToPool = html.find('[name="addToPool"]').is(':checked');
            
            await game.settings.set("msh-faserip", "karmaMultiplier", multiplier);
            
            await this._awardTeamKarma(karmaAmount, awardType, description, multiplier, addToPool);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "award"
    }).render(true);
  }

  async _awardTeamKarma(karmaAmount, awardType, description, multiplier, addToPool) {
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    
    if (heroes.length === 0) {
      ui.notifications.warn("No team members to award karma to");
      return;
    }
    
    const totalKarma = karmaAmount * multiplier;
    
    if (addToPool) {
      // Add directly to team karma pool
      const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
      await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool + totalKarma);
      
      // Log award
      const teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
      teamAwards.push({
        date: new Date().toLocaleDateString(),
        totalAmount: totalKarma,
        destination: "Team Pool",
        teamSize: heroes.length,
        reason: awardType,
        description: description || "Team karma award added to pool",
        multiplier: multiplier
      });
      await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);
      
      ui.notifications.info(`${totalKarma} karma awarded to team pool!`);
      
    } else {
      // Split equally among members' personal karma
      const karmaPerHero = Math.floor(totalKarma / heroes.length);
      
      for (const hero of heroes) {
        const karmaEvent = {
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: karmaPerHero,
          type: awardType,
          description: description || `Team award: ${karmaPerHero} of ${totalKarma} total${multiplier > 1 ? ` (${multiplier}x)` : ''}`
        };
        
        const history = foundry.utils.deepClone(hero.system.karma?.history || []);
        history.push(karmaEvent);
        
        const newLifetime = (hero.system.karma?.lifetime || 0) + karmaPerHero;
        
        await hero.update({
          "system.karma.history": history,
          "system.karma.lifetime": newLifetime
        });
      }
      
      // Log award
      const teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
      teamAwards.push({
        date: new Date().toLocaleDateString(),
        totalAmount: totalKarma,
        destination: `Split (${karmaPerHero} each)`,
        teamSize: heroes.length,
        reason: awardType,
        description: description || "Team karma award split equally",
        multiplier: multiplier
      });
      await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);
      
      ui.notifications.info(`${totalKarma} karma split equally: ${karmaPerHero} each to ${heroes.length} heroes!`);
    }
    
    this.render(true);
  }

  _onAwardIndividualKarma(event) {
    if (!game.user.isGM) return;
    
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    
    if (heroes.length === 0) {
      ui.notifications.warn("No team members available");
      return;
    }
    
    const heroOptions = heroes.map(h => 
      `<option value="${h.id}">${h.name}</option>`
    ).join('');
    
    new Dialog({
      title: "Award Individual Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Hero:</label>
            <select name="heroId">
              ${heroOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Karma Amount:</label>
            <input type="number" name="karmaAmount" value="10" min="1" />
          </div>
          <div class="form-group">
            <label>Award Type:</label>
            <select name="awardType">
              <option value="Personal Commitment">Personal Commitment (+5)</option>
              <option value="Weekly Award">Weekly Award (+10)</option>
              <option value="Role-Playing">Role-Playing Bonus (+10)</option>
              <option value="Humor">Humor Award (+15)</option>
              <option value="Stump the Judge">Stump the Judge (+5)</option>
              <option value="Custom">Custom Individual Award</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" rows="3" placeholder="Why is this hero receiving personal karma?"></textarea>
          </div>
          <p style="background: #e3f2fd; padding: 8px; border-radius: 3px; font-size: 0.9em;">
            <strong>Note:</strong> Individual awards go to personal karma only, not the team pool.
          </p>
        </form>
      `,
      buttons: {
        award: {
          icon: '<i class="fas fa-user-plus"></i>',
          label: "Award Karma",
          callback: async (html) => {
            const heroId = html.find('[name="heroId"]').val();
            const karmaAmount = Number(html.find('[name="karmaAmount"]').val());
            const awardType = html.find('[name="awardType"]').val();
            const description = html.find('[name="description"]').val();
            
            await this._awardIndividualKarma(heroId, karmaAmount, awardType, description);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "award"
    }).render(true);
  }

  async _awardIndividualKarma(heroId, karmaAmount, awardType, description) {
    const hero = game.actors.get(heroId);
    if (!hero) return;
    
    const karmaEvent = {
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: karmaAmount,
      type: awardType,
      description: description || `Individual ${awardType} award`
    };
    
    const history = foundry.utils.deepClone(hero.system.karma?.history || []);
    history.push(karmaEvent);
    
    const newLifetime = (hero.system.karma?.lifetime || 0) + karmaAmount;
    
    await hero.update({
      "system.karma.history": history,
      "system.karma.lifetime": newLifetime
    });
    
    ui.notifications.info(`${karmaAmount} karma awarded to ${hero.name}!`);
    this.render(true);
  }

  async _onClearAwardsHistory(event) {
    if (!game.user.isGM) return;
    
    const confirmed = await Dialog.confirm({
      title: "Clear Awards History",
      content: "Clear the team awards display? This won't affect individual karma histories or the pool."
    });
    
    if (confirmed) {
      await game.settings.set("msh-faserip", "teamKarmaAwards", []);
      ui.notifications.info("Awards history cleared");
      this.render(true);
    }
  }
}