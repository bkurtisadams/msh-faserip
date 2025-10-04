export class TeamSheet extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "team-tracker"],
      template: "systems/msh-faserip/templates/team-sheet.html",
      width: 480,
      height: 600,
      resizable: true,
      title: "Team Tracker",
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "members"
        }
      ]
    });
  }

  getData() {
    const context = super.getData();
    
    // Get team members (PC heroes)
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    context.teamMembers = game.actors.filter(a => 
      a.type === "hero" && 
      a.hasPlayerOwner &&
      teamMembers.includes(a.id)
    ).map(hero => ({
      id: hero.id,
      name: hero.name,
      img: hero.img || "icons/svg/mystery-man.svg",
      
      // FASERIP abilities
      fighting: hero.system.abilities?.fighting?.value || 0,
      agility: hero.system.abilities?.agility?.value || 0,
      strength: hero.system.abilities?.strength?.value || 0,
      endurance: hero.system.abilities?.endurance?.value || 0,
      reason: hero.system.abilities?.reason?.value || 0,
      intuition: hero.system.abilities?.intuition?.value || 0,
      psyche: hero.system.abilities?.psyche?.value || 0,
      
      // FASERIP ranks
      fightingRank: hero.system.abilities?.fighting?.rank || "Typical",
      agilityRank: hero.system.abilities?.agility?.rank || "Typical",
      strengthRank: hero.system.abilities?.strength?.rank || "Typical",
      enduranceRank: hero.system.abilities?.endurance?.rank || "Typical",
      reasonRank: hero.system.abilities?.reason?.rank || "Typical",
      intuitionRank: hero.system.abilities?.intuition?.rank || "Typical",
      psycheRank: hero.system.abilities?.psyche?.rank || "Typical",
      
      // Derived stats
      health: hero.system.attributes?.health?.value || 0,
      healthMax: hero.system.attributes?.health?.max || 0,
      karma: hero.system.attributes?.karma?.value || 0,
      karmaMax: hero.system.attributes?.karma?.max || 0,
      resources: hero.system.attributes?.resources?.rank || "Typical",
      popularity: hero.system.attributes?.popularity?.hero?.value || 0,
      
      // Pool contribution
      poolContribution: hero.system.karma?.pool || 0
    }));

    // Get all PC heroes for adding to team
    context.availableHeroes = game.actors.filter(a => 
      a.type === "hero" && 
      a.hasPlayerOwner &&
      !teamMembers.includes(a.id)
    ).map(hero => ({
      id: hero.id,
      name: hero.name,
      img: hero.img || "icons/svg/mystery-man.svg"
    }));

    // Get team karma awards history
    context.karmaAwards = this._getTeamKarmaAwards();
    
    // Get defeated villains log
    context.defeatedVillains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    
    // Get karma multiplier setting
    context.karmaMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    // Calculate team pool total
    context.teamPoolTotal = context.teamMembers.reduce((total, member) => total + member.poolContribution, 0);
    
    return context;
  }

  _getTeamKarmaAwards() {
    // Get karma awards from team members' history that were team-wide
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    const awards = [];
    
    teamMembers.forEach(memberId => {
      const hero = game.actors.get(memberId);
      if (hero && hero.system.karma?.history) {
        hero.system.karma.history.forEach(event => {
          if (event.description && event.description.includes("Team") && event.amount > 0) {
            awards.push({
              date: event.realDate,
              member: hero.name,
              amount: event.amount,
              reason: event.type,
              description: event.description
            });
          }
        });
      }
    });
    
    // Sort by date descending (most recent first)
    return awards.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Tab switching functionality
    html.find('.tab-button').click(ev => {
        ev.preventDefault();
        const targetTab = ev.currentTarget.dataset.tab;
        
        // Remove active class from all tabs and panels
        html.find('.tab-button').removeClass('active');
        html.find('.tab-panel').removeClass('active');
        
        // Add active class to clicked tab and corresponding panel
        html.find(`[data-tab="${targetTab}"]`).addClass('active');
    });

    // Team member management
    html.find('.add-hero-to-team').click(ev => this._onAddHeroToTeam(ev));
    html.find('.remove-hero-from-team').click(ev => this._onRemoveHeroFromTeam(ev));
    html.find('.hero-settings').click(ev => this._onHeroSettings(ev));
    
    // Karma awards
    html.find('.distribute-karma').click(ev => this._onDistributeKarma(ev));
    html.find('.clear-awards').click(ev => this._onClearAwards(ev));
    
    // Villain logs
    html.find('.add-defeated-villain').click(ev => this._onAddDefeatedVillain(ev));
    html.find('.remove-villain').click(ev => this._onRemoveVillain(ev));
    html.find('.clear-logs').click(ev => this._onClearLogs(ev));

    // Hero portraits - click to open sheet
    html.find('.hero-portrait').click(ev => {
        const heroId = ev.currentTarget.dataset.heroId;
        const hero = game.actors.get(heroId);
        if (hero) hero.sheet.render(true);
    });
}

  async _onAddHeroToTeam(event) {
    const heroId = event.currentTarget.dataset.heroId;
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    
    if (!teamMembers.includes(heroId)) {
      teamMembers.push(heroId);
      await game.settings.set("msh-faserip", "teamMembers", teamMembers);
      this.render();
    }
  }

  async _onRemoveHeroFromTeam(event) {
    const heroId = event.currentTarget.dataset.heroId;
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    const index = teamMembers.indexOf(heroId);
    
    if (index > -1) {
      teamMembers.splice(index, 1);
      await game.settings.set("msh-faserip", "teamMembers", teamMembers);
      this.render();
    }
  }

  _onHeroSettings(event) {
    const heroId = event.currentTarget.dataset.heroId;
    const hero = game.actors.get(heroId);
    
    new Dialog({
      title: `${hero.name} - Team Settings`,
      content: `
        <form>
          <div class="form-group">
            <label>Karma Pool Contribution:</label>
            <input type="number" name="poolContribution" value="${hero.system.karma?.pool || 0}" min="0" />
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            const contribution = Number(html.find('[name="poolContribution"]').val());
            await hero.update({ "system.karma.pool": contribution });
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

  _onDistributeKarma(event) {
    const currentMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    new Dialog({
      title: "Distribute Team Karma Award",
      content: `
        <form>
          <div class="form-group">
            <label>Karma Award:</label>
            <input type="number" name="karmaAmount" value="20" min="1" />
          </div>
          <div class="form-group">
            <label>Award Type:</label>
            <select name="awardType">
              <option value="Rescue">Rescue (+20)</option>
              <option value="Violent Crime">Stop Violent Crime (+30)</option>
              <option value="Defeated Villain">Defeated Villain (varies)</option>
              <option value="Team Mission">Team Mission Success</option>
              <option value="Heroic Act">Heroic Act</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" placeholder="Describe the heroic act..."></textarea>
          </div>
          <div class="form-group">
            <label>Karma Multiplier (1-100):</label>
            <input type="number" name="karmaMultiplier" value="${currentMultiplier}" min="1" max="100" />
          </div>
        </form>
      `,
      buttons: {
        distribute: {
          icon: '<i class="fas fa-gift"></i>',
          label: "Distribute",
          callback: async (html) => {
            const karmaAmount = Number(html.find('[name="karmaAmount"]').val());
            const awardType = html.find('[name="awardType"]').val();
            const description = html.find('[name="description"]').val();
            const multiplier = Number(html.find('[name="karmaMultiplier"]').val());
            
            // Save the multiplier setting for next time
            await game.settings.set("msh-faserip", "karmaMultiplier", multiplier);
            
            await this._distributeKarma(karmaAmount, awardType, description, multiplier);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      }
    }).render(true);
  }

  async _distributeKarma(karmaAmount, awardType, description, multiplier) {
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMembers.includes(a.id));
    
    if (heroes.length === 0) {
      ui.notifications.warn("No team members to distribute karma to");
      return;
    }
    
    // Calculate total karma pool and split among team members
    const totalKarma = karmaAmount * multiplier;
    const karmaPerHero = Math.floor(totalKarma / heroes.length);
    
    for (const hero of heroes) {
      const karmaEvent = {
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: karmaPerHero,
        type: awardType,
        description: description || `Team karma award (${karmaPerHero} of ${totalKarma} total${multiplier > 1 ? `, ${multiplier}x multiplier` : ''})`
      };
      
      const history = foundry.utils.deepClone(hero.system.karma?.history || []);
      history.push(karmaEvent);
      
      const newLifetime = (hero.system.karma.lifetime || 0) + karmaPerHero;
      
      await hero.update({
        "system.karma.history": history,
        "system.karma.lifetime": newLifetime
      });
    }
    
    ui.notifications.info(`Distributed ${totalKarma} karma split among ${heroes.length} team members (${karmaPerHero} each)`);
    this.render();
  }

  async _onClearAwards(event) {
    const confirmed = await Dialog.confirm({
      title: "Clear Team Awards",
      content: "This will clear the awards display but not affect individual karma histories. Continue?"
    });
    
    if (confirmed) {
      // This is just a display function, actual clearing would need to modify individual histories
      ui.notifications.info("Awards display refreshed");
      this.render();
    }
  }

  _onAddDefeatedVillain(event) {
    new Dialog({
      title: "Add Defeated Villain",
      content: `
        <form>
          <div class="form-group">
            <label>Villain Name:</label>
            <input type="text" name="villainName" />
          </div>
          <div class="form-group">
            <label>Power Level:</label>
            <select name="powerLevel">
              <option value="Remarkable">Remarkable (+40 Karma)</option>
              <option value="Incredible">Incredible (+50 Karma)</option>
              <option value="Amazing">Amazing (+75 Karma)</option>
              <option value="Monstrous">Monstrous (+100 Karma)</option>
              <option value="Unearthly">Unearthly (+150 Karma)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Date Defeated:</label>
            <input type="text" name="dateDefeated" value="${new Date().toLocaleDateString()}" />
          </div>
          <div class="form-group">
            <label>Notes:</label>
            <textarea name="notes"></textarea>
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-check"></i>',
          label: "Add",
          callback: async (html) => {
            const villainData = {
              name: html.find('[name="villainName"]').val(),
              powerLevel: html.find('[name="powerLevel"]').val(),
              dateDefeated: html.find('[name="dateDefeated"]').val(),
              notes: html.find('[name="notes"]').val(),
              id: foundry.utils.randomID()
            };
            
            const defeatedVillains = game.settings.get("msh-faserip", "defeatedVillains") || [];
            defeatedVillains.push(villainData);
            await game.settings.set("msh-faserip", "defeatedVillains", defeatedVillains);
            
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

  async _onRemoveVillain(event) {
    const villainId = event.currentTarget.dataset.villainId;
    const defeatedVillains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const index = defeatedVillains.findIndex(v => v.id === villainId);
    
    if (index > -1) {
      defeatedVillains.splice(index, 1);
      await game.settings.set("msh-faserip", "defeatedVillains", defeatedVillains);
      this.render();
    }
  }

  async _onClearLogs(event) {
    const confirmed = await Dialog.confirm({
      title: "Clear Villain Logs",
      content: "This will permanently delete all defeated villain records. Continue?"
    });
    
    if (confirmed) {
      await game.settings.set("msh-faserip", "defeatedVillains", []);
      this.render();
    }
  }
}