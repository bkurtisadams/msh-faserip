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
      popularity: hero.system.attributes?.popularity?.hero?.value || 0
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
    context.karmaAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
    
    // Get karma multiplier setting
    context.karmaMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    return context;
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
    
    // Simple dialog to show hero info or open their sheet
    new Dialog({
      title: `${hero.name} - Team Settings`,
      content: `
        <p>Click below to open ${hero.name}'s character sheet.</p>
      `,
      buttons: {
        sheet: {
          icon: '<i class="fas fa-user"></i>',
          label: "Open Sheet",
          callback: () => {
            hero.sheet.render(true);
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
      const newCurrent = (hero.system.attributes.karma.value || 0) + karmaPerHero;
      
      await hero.update({
        "system.karma.history": history,
        "system.karma.lifetime": newLifetime,
        "system.attributes.karma.value": newCurrent
      });
    }
    
    // Log team award for display in Awards tab
    const teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
    teamAwards.push({
      date: new Date().toLocaleDateString(),
      totalAmount: totalKarma,
      amountPerHero: karmaPerHero,
      teamSize: heroes.length,
      reason: awardType,
      description: description || "Team karma award",
      multiplier: multiplier
    });
    await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);
    
    ui.notifications.info(`Distributed ${totalKarma} karma split among ${heroes.length} team members (${karmaPerHero} each)`);
    this.render();
  }

  async _onClearAwards(event) {
    const confirmed = await Dialog.confirm({
      title: "Clear Team Awards History",
      content: "This will clear the team awards display but not affect individual karma histories. Continue?"
    });
    
    if (confirmed) {
      await game.settings.set("msh-faserip", "teamKarmaAwards", []);
      ui.notifications.info("Team awards history cleared");
      this.render();
    }
  }
}