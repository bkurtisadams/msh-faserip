// teamSheet.js v1.3.0 - 2025-01-18
// v1.3.0: Pool share value display, dissolve pool function, property damage in awards
// v1.2.1: Add edit/delete for team karma award history entries
// v1.2.0: Redesigned UI - 3 tabs (Team/Karma/Session), multiplier in header, defeated villains tracking
// v1.1.0: Add dropdown for adding team members, include NPCs with friendly disposition
export class TeamSheet extends Application {
  constructor(options = {}) {
    super(options);
    
    // Listen for time updates
    this._timeUpdateHook = Hooks.on("msh-faserip.timeUpdated", () => {
      if (this.rendered) {
        this.render(false); // Re-render without changing position/size
      }
    });
  }

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

  async close(options) {
    // Clean up hook listener
    if (this._timeUpdateHook) {
      Hooks.off("msh-faserip.timeUpdated", this._timeUpdateHook);
    }
    return super.close(options);
  }

  getData() {
    const context = super.getData();
    context.isGM = game.user.isGM;

    // Get campaign time once
    const campaignTime = game.msh.getCampaignDateTime();
    
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
    
    // Get available heroes and NPCs (friendly/neutral disposition)
    context.availableHeroes = game.actors.filter(a => 
      (a.type === "hero" || a.type === "npc") &&
      a.prototypeToken.disposition >= 0 &&
      !teamMemberIds.includes(a.id)
    ).map(actor => ({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img || "icons/svg/mystery-man.svg"
    })).sort((a, b) => a.name.localeCompare(b.name));
    
    // Team karma pool
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    // Pool share value (if dissolved)
    const teamSize = context.teamMembers.length || 1;
    context.poolShareValue = Math.floor(context.teamKarmaPool / teamSize);
    
    // Team awards history
    context.teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];

    // Time tracking - use the campaignTime we already calculated
    context.currentDateTime = campaignTime.formatted;
    context.combatSyncEnabled = game.settings.get("msh-faserip", "combatSyncEnabled") ?? true;
    
    // Combat logs
    context.combatLogs = game.settings.get("msh-faserip", "combatLogs") || [];
    context.autoLogCombat = game.settings.get("msh-faserip", "autoLogCombat") ?? false;
    
    // Settings
    context.karmaMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    context.multiplierOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    // Defeated villains
    context.defeatedVillains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    
    return context;
  }
  
  _calculateAvailableKarma(actor) {
    const lifetime = actor.system.karma?.lifetime || 0;
    let spent = 0;
    
    (actor.system.karma?.history || []).forEach(event => {
      if (event.amount < 0) {
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

    // Member management - dropdown + button pattern
    html.find('.add-hero-to-team-btn').click(ev => {
      const select = html.find('.add-hero-select');
      const heroId = select.val();
      if (heroId) {
        this._onAddHeroToTeam(heroId);
        select.val(''); // Reset dropdown
      } else {
        ui.notifications.warn("Select a character to add");
      }
    });
    html.find('.remove-hero-from-team').click(ev => this._onRemoveHeroFromTeam(ev));
    html.find('.hero-portrait').click(ev => {
      const heroId = ev.currentTarget.dataset.heroId;
      const hero = game.actors.get(heroId);
      if (hero) hero.sheet.render(true);
    });
    
    // Karma awards
    html.find('.award-team-karma').click(ev => this._onAwardTeamKarma(ev));
    html.find('.award-individual-karma').click(ev => this._onAwardIndividualKarma(ev));
    html.find('.award-session-karma').click(ev => this._onAwardSessionKarma(ev));
    html.find('.clear-awards-history').click(ev => this._onClearAwardsHistory(ev));
    html.find('.edit-award').click(ev => this._onEditAward(ev));
    html.find('.delete-award').click(ev => this._onDeleteAward(ev));

    // Karma penalty
    html.find('.apply-karma-penalty').click(ev => this._onApplyKarmaPenalty(ev));
    
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

    html.find('.dissolve-pool').click(ev => this._onDissolvePool(ev));

    // Time tracking controls
    html.find('.time-settings-btn').click(ev => this._onTimeSettings(ev));
    html.find('.combat-sync-toggle').change(async (ev) => {
      await game.settings.set("msh-faserip", "combatSyncEnabled", ev.target.checked);
      ui.notifications.info(`Combat sync ${ev.target.checked ? 'enabled' : 'disabled'}`);
    });

    // Combat logs controls
    html.find('.add-log-entry').click(ev => this._onAddLogEntry(ev));
    html.find('.edit-log-btn').click(ev => this._onEditLogEntry(ev));
    html.find('.delete-log-btn').click(ev => this._onDeleteLogEntry(ev));
    html.find('.clear-all-logs').click(ev => this._onClearAllLogs(ev));
    html.find('.auto-log-toggle').change(async (ev) => {
      await game.settings.set("msh-faserip", "autoLogCombat", ev.target.checked);
      ui.notifications.info(`Auto-log ${ev.target.checked ? 'enabled' : 'disabled'}`);
    });

    // Multiplier change (header)
    html.find('.multiplier-select').change(async (ev) => {
      const newMultiplier = Number(ev.target.value);
      await game.settings.set("msh-faserip", "karmaMultiplier", newMultiplier);
      ui.notifications.info(`Karma multiplier set to ×${newMultiplier}`);
    });

    // Defeated villains
    html.find('.add-defeated-villain').click(ev => this._onAddDefeatedVillain(ev));
    html.find('.delete-villain').click(ev => this._onDeleteVillain(ev));

    // Award karma from log entry
    html.find('.award-from-log').click(ev => this._onAwardFromLog(ev));

    // Time adjustment handler (KEEP THIS ONE)
    html.find('.time-adjust-btn').on('click', async (ev) => {
      if (!game.user.isGM) return;
      
      const unit = ev.currentTarget.dataset.unit;
      let seconds = 0;
      
      switch(unit) {
        case 'turn': seconds = 6; break;
        case 'minute': seconds = 60; break;
        case 'hour': seconds = 3600; break;
        case 'day': seconds = 86400; break;
        case 'custom':
          const input = await Dialog.prompt({
            title: "Custom Time Adjustment",
            content: '<p>Enter seconds to advance (negative to go back):</p><input type="number" id="custom-seconds" value="0" style="width: 100%; padding: 5px;">',
            callback: (html) => parseInt(html.find('#custom-seconds').val()) || 0
          });
          seconds = input;
          break;
      }
      
      if (seconds !== 0) {
        await game.time.advance(seconds);
        console.log(`🕐 FASERIP | Manually advanced time by ${seconds} seconds`);
        Hooks.callAll("msh-faserip.timeUpdated");
        this.render(false); // Refresh sheet to show new time
      }
    });

  }

  async _onAddHeroToTeam(heroId) {
    const teamMembers = game.settings.get("msh-faserip", "teamMembers") || [];
    
    if (!teamMembers.includes(heroId)) {
      teamMembers.push(heroId);
      await game.settings.set("msh-faserip", "teamMembers", teamMembers);
      const actor = game.actors.get(heroId);
      ui.notifications.info(`${actor?.name || "Member"} added to team.`);
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

  _getBaseKarmaFromTeamAward(type, { customFoeRank = 0 } = {}) {
    const map = {
      "Rescue": 20, "Multiple Rescues (5+)": 100,
      "Violent Crime (Stop)": 30, "Violent Crime (Arrest)": 15,
      "Destructive Crime (Stop)": 20, "Destructive Crime (Arrest)": 10,
      "Theft (Stop)": 10, "Theft (Arrest)": 5,
      "Robbery (Stop)": 20, "Robbery (Arrest)": 10,
      "Misdemeanor (Stop)": 5, "Misdemeanor (Arrest)": 5,
      "National Offense (Stop)": 20, "National Offense (Arrest)": 20,
      "Local Conspiracy (Stop)": 30, "Local Conspiracy (Arrest)": 15,
      "National Conspiracy (Stop)": 40, "National Conspiracy (Arrest)": 25,
      "Global Conspiracy (Stop)": 50, "Global Conspiracy (Arrest)": 25,
      "Defeated Foe - Remarkable": 30,
      "Defeated Foe - Incredible": 40,
      "Defeated Foe - Amazing": 50,
      "Defeated Foe - Monstrous": 75,
      "Defeated Foe - Unearthly": 100
    };
    if (type === "Defeated Foe - Custom") return Math.max(1, customFoeRank || 1);
    return map[type] ?? null; // null means "leave whatever user typed"
  }

  _onAwardTeamKarma(event) {
    if (!game.user.isGM) return;

    const currentMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;

    new Dialog({
      title: "Award Team Karma (Group Award)",
      content: `
        <form>
          <div class="form-group">
            <label>Award Type:</label>
            <select name="awardType">
              <optgroup label="Rescue">
                <option value="Rescue">Rescue (+20, cap 100)</option>
                <option value="Multiple Rescues (5+)">Multiple Rescues (5+) (+100)</option>
              </optgroup>

              <optgroup label="Stop/Prevent vs Arrest (book values)">
                <option value="Violent Crime (Stop)">Violent Crime — Stop/Prevent (+30)</option>
                <option value="Violent Crime (Arrest)">Violent Crime — Arrest (+15)</option>

                <option value="Destructive Crime (Stop)">Destructive Crime — Stop/Prevent (+20)</option>
                <option value="Destructive Crime (Arrest)">Destructive Crime — Arrest (+10)</option>

                <option value="Theft (Stop)">Theft — Stop/Prevent (+10)</option>
                <option value="Theft (Arrest)">Theft — Arrest (+5)</option>

                <option value="Robbery (Stop)">Robbery — Stop/Prevent (+20)</option>
                <option value="Robbery (Arrest)">Robbery — Arrest (+10)</option>

                <option value="Misdemeanor (Stop)">Misdemeanor — Stop/Prevent (+5)</option>
                <option value="Misdemeanor (Arrest)">Misdemeanor — Arrest (+5)</option>

                <option value="National Offense (Stop)">National Offense — Stop/Prevent (+20)</option>
                <option value="National Offense (Arrest)">National Offense — Arrest (+20)</option>

                <option value="Local Conspiracy (Stop)">Local Conspiracy — Stop/Prevent (+30)</option>
                <option value="Local Conspiracy (Arrest)">Local Conspiracy — Arrest (+15)</option>

                <option value="National Conspiracy (Stop)">National Conspiracy — Stop/Prevent (+40)</option>
                <option value="National Conspiracy (Arrest)">National Conspiracy — Arrest (+25)</option>

                <option value="Global Conspiracy (Stop)">Global Conspiracy — Stop/Prevent (+50)</option>
                <option value="Global Conspiracy (Arrest)">Global Conspiracy — Arrest (+25)</option>
              </optgroup>

              <optgroup label="Defeated Foe (highest rank number)">
                <option value="Defeated Foe - Remarkable">Defeated Remarkable Foe (+30)</option>
                <option value="Defeated Foe - Incredible">Defeated Incredible Foe (+40)</option>
                <option value="Defeated Foe - Amazing">Defeated Amazing Foe (+50)</option>
                <option value="Defeated Foe - Monstrous">Defeated Monstrous Foe (+75)</option>
                <option value="Defeated Foe - Unearthly">Defeated Unearthly Foe (+100)</option>
                <option value="Defeated Foe - Custom">Defeated Foe — Custom Rank Number</option>
              </optgroup>

              <optgroup label="Other">
                <option value="Team Mission">Team Mission Success (enter amount)</option>
                <option value="Custom">Custom Team Award (enter amount)</option>
              </optgroup>
            </select>
          </div>

          <div class="form-group" data-field="customFoeRank">
            <label>Custom Foe Rank Number:</label>
            <input type="number" name="customFoeRank" value="30" min="1" />
          </div>

          <div class="form-group">
            <label>Base Karma Amount (auto-fills from type; you can override):</label>
            <input type="number" name="karmaAmount" value="20" min="1" />
          </div>

          <div class="form-group">
            <label>Karma Multiplier (1-10):</label>
            <input type="number" name="karmaMultiplier" value="${currentMultiplier}" min="1" max="10" />
          </div>

          <div class="form-group" style="background:#ffebee;padding:10px;border-radius:3px;border:1px solid #ffcdd2;">
            <label><i class="fas fa-house-damage"></i> Property Damage (-5 karma per area, per hero):</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:5px;">
              <input type="number" name="propertyDamageAreas" value="0" min="0" style="width:60px;" />
              <span>areas × 5 = <strong class="dmg-penalty-display">0</strong> per hero</span>
            </div>
          </div>

          <div class="form-group">
            <label>When:</label>
            <select name="awardWhen">
              <option value="Immediate">Immediate</option>
              <option value="End of Combat">End of Combat</option>
              <option value="End of Session">End of Session</option>
            </select>
          </div>

          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" rows="3" placeholder="Describe the deed..."></textarea>
          </div>

          <div class="form-group" style="background:#fff3e0;padding:10px;border-radius:3px;">
            <label>
              <input type="checkbox" name="addToPool" checked />
              Add to Team Karma Pool (recommended for group awards)
            </label>
            <small style="color:#666;display:block;margin-top:5px;">
              Unchecked = split equally among members’ personal karma
            </small>
          </div>
        </form>
      `,
      buttons: {
        award: {
          icon: '<i class="fas fa-trophy"></i>',
          label: "Award Karma",
          callback: async (html) => {
            const awardType = html.find('[name="awardType"]').val();
            const customFoeRank = Number(html.find('[name="customFoeRank"]').val() || 0);
            let karmaAmount = Number(html.find('[name="karmaAmount"]').val());
            const multiplier = Number(html.find('[name="karmaMultiplier"]').val());
            const when = html.find('[name="awardWhen"]').val();
            const description = html.find('[name="description"]').val();
            const addToPool = html.find('[name="addToPool"]').is(':checked');
            const propertyDamageAreas = Number(html.find('[name="propertyDamageAreas"]').val() || 0);

            // Auto base from type (you can still override in the field)
            const autoBase = this._getBaseKarmaFromTeamAward(awardType, { customFoeRank });
            if (!html.find('[name="karmaAmount"]').data('touched') && autoBase) karmaAmount = autoBase;

            // Rescue caps
            if (awardType.startsWith("Rescue")) karmaAmount = Math.min(karmaAmount, 100);
            if (awardType.startsWith("Multiple Rescues")) karmaAmount = 100;

            await game.settings.set("msh-faserip", "karmaMultiplier", multiplier);
            await this._awardTeamKarma(karmaAmount, awardType, description, multiplier, addToPool, { when, propertyDamageAreas });
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award",
      render: (html) => {
        const $amount = html.find('[name="karmaAmount"]');
        $amount.on('input', () => $amount.data('touched', true));
        const sync = () => {
          const type = html.find('[name="awardType"]').val();
          const customFoeRank = Number(html.find('[name="customFoeRank"]').val() || 0);
          const auto = this._getBaseKarmaFromTeamAward(type, { customFoeRank });
          if (!$amount.data('touched') && auto) $amount.val(auto);
          // show/hide custom foe rank
          html.find('[data-field="customFoeRank"]').toggle(type === 'Defeated Foe - Custom');
        };
        html.find('[name="awardType"]').on('change', sync);
        html.find('[name="customFoeRank"]').on('input', sync);
        sync();

        // Property damage penalty display
        html.find('[name="propertyDamageAreas"]').on('input', (ev) => {
          const areas = Number(ev.target.value) || 0;
          const penalty = areas * 5;
          html.find('.dmg-penalty-display').text(penalty);
        });
      }
    }).render(true);
  }

  async _awardTeamKarma(karmaAmount, awardType, description, multiplier, addToPool, options = {}) {
    const { propertyDamageAreas = 0 } = options;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    
    if (heroes.length === 0) {
      ui.notifications.warn("No team members to award karma to");
      return;
    }

    if (awardType.startsWith("Rescue")) {
      karmaAmount = Math.min(karmaAmount, 100);
    }
    if (awardType.startsWith("Multiple Rescues")) {
      karmaAmount = 100;
    }
    
    const totalKarma = karmaAmount * multiplier;
    const propertyPenaltyPerHero = propertyDamageAreas * 5; // -5 per area, per hero
    
    if (addToPool) {
      // Add directly to team karma pool (property damage doesn't apply to pool awards)
      const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
      await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool + totalKarma);
      
      // If property damage, apply penalty separately to each hero
      if (propertyPenaltyPerHero > 0) {
        for (const hero of heroes) {
          const penaltyEvent = {
            timestamp: new Date().toISOString(),
            realDate: new Date().toLocaleDateString(),
            gameDate: "",
            amount: -propertyPenaltyPerHero,
            type: "Property Damage",
            description: `${propertyDamageAreas} area(s) destroyed`
          };
          
          const history = foundry.utils.deepClone(hero.system.karma?.history || []);
          history.push(penaltyEvent);
          
          await hero.update({
            "system.karma.history": history
          });
        }
      }
      
      // Log award
      const teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
      teamAwards.push({
        date: new Date().toLocaleDateString(),
        totalAmount: totalKarma,
        destination: "Team Pool",
        teamSize: heroes.length,
        reason: awardType + (propertyPenaltyPerHero > 0 ? ` (−${propertyPenaltyPerHero}/hero dmg)` : ''),
        description: description || "Team karma award added to pool",
        multiplier: multiplier
      });
      await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);
      
      let msg = `${totalKarma} karma awarded to team pool!`;
      if (propertyPenaltyPerHero > 0) {
        msg += ` Property damage: −${propertyPenaltyPerHero} per hero.`;
      }
      ui.notifications.info(msg);
      
    } else {
      // Split equally among members' personal karma
      const karmaPerHero = Math.floor(totalKarma / heroes.length);
      const netPerHero = karmaPerHero - propertyPenaltyPerHero;
      
      for (const hero of heroes) {
        const history = foundry.utils.deepClone(hero.system.karma?.history || []);
        
        // Award entry
        const karmaEvent = {
          timestamp: new Date().toISOString(),
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: karmaPerHero,
          type: awardType,
          description: description || `Team award: ${karmaPerHero} of ${totalKarma} total${multiplier > 1 ? ` (${multiplier}x)` : ''}`
        };
        history.push(karmaEvent);
        
        // Property damage penalty entry (if any)
        if (propertyPenaltyPerHero > 0) {
          const penaltyEvent = {
            timestamp: new Date().toISOString(),
            realDate: new Date().toLocaleDateString(),
            gameDate: "",
            amount: -propertyPenaltyPerHero,
            type: "Property Damage",
            description: `${propertyDamageAreas} area(s) destroyed`
          };
          history.push(penaltyEvent);
        }
        
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
        destination: `Split (${karmaPerHero} each${propertyPenaltyPerHero > 0 ? `, net ${netPerHero}` : ''})`,
        teamSize: heroes.length,
        reason: awardType + (propertyPenaltyPerHero > 0 ? ` (−${propertyPenaltyPerHero} dmg)` : ''),
        description: description || "Team karma award split equally",
        multiplier: multiplier
      });
      await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);
      
      let msg = `${totalKarma} karma split equally: ${karmaPerHero} each to ${heroes.length} heroes!`;
      if (propertyPenaltyPerHero > 0) {
        msg += ` Property damage: −${propertyPenaltyPerHero} per hero (net ${netPerHero}).`;
      }
      ui.notifications.info(msg);
    }
    
    this.render(true);
  }

  _onAwardIndividualKarma(event) {
    if (!game.user.isGM) return;

    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    if (heroes.length === 0) return ui.notifications.warn("No team members available");

    const heroOptions = heroes.map(h => `<option value="${h.id}">${h.name}</option>`).join('');

    new Dialog({
      title: "Award Individual Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Hero:</label>
            <select name="heroId">${heroOptions}</select>
          </div>

          <div class="form-group">
            <label>Award Type:</label>
            <select name="awardType">
              <optgroup label="Personal Commitments">
                <option value="Personal Commitment">Personal Commitment (+5)</option>
                <option value="Weekly Award">Weekly Award (up to +10)</option>
              </optgroup>
              <optgroup label="Gaming Awards">
                <option value="Role-Playing">Role-Playing (up to +10)</option>
                <option value="Stump the Judge">Stump the Judge (up to +15)</option>
                <option value="Humor">Humor (+5)</option>
              </optgroup>
              <optgroup label="Charity">
                <option value="Charity: Appearance">Charity: Personal Appearance (Pop rank, max +20)</option>
                <option value="Charity: Act">Charity: Act of Charity (10/20/30/40 by FEAT)</option>
                <option value="Charity: Donation">Charity: Donation (FEAT rank # or +10)</option>
              </optgroup>
              <optgroup label="Custom">
                <option value="Custom">Custom Individual Award</option>
              </optgroup>
            </select>
          </div>

          <!-- Optional helpers for Charity -->
          <div class="form-group" data-field="actDifficulty">
            <label>Act of Charity Difficulty:</label>
            <select name="actDifficulty">
              <option value="auto">Automatic (+10)</option>
              <option value="green">Green (+20)</option>
              <option value="yellow">Yellow (+30)</option>
              <option value="red">Red (+40)</option>
            </select>
          </div>

          <div class="form-group" data-field="donationRank">
            <label>Donation FEAT Rank Number (or leave 0 to default +10):</label>
            <input type="number" name="donationRank" value="0" min="0" />
          </div>

          <div class="form-group">
            <label>Karma Amount (auto-fills from type; you can override):</label>
            <input type="number" name="karmaAmount" value="10" min="1" />
          </div>

          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" rows="3" placeholder="Why is this hero receiving personal karma?"></textarea>
          </div>
          <p style="background:#e3f2fd;padding:8px;border-radius:3px;font-size:0.9em;">
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
            const awardType = html.find('[name="awardType"]').val();
            const actDifficulty = html.find('[name="actDifficulty"]').val();
            const donationRank = Number(html.find('[name="donationRank"]').val() || 0);

            // get default based on hero + award type
            const hero = game.actors.get(heroId);
            let auto = this._computeIndividualAutoAmount(hero, awardType, { actDifficulty, donationRank });

            // allow override
            const userVal = Number(html.find('[name="karmaAmount"]').val());
            const karmaAmount = Number.isFinite(userVal) && userVal > 0 ? userVal : auto;

            const description = html.find('[name="description"]').val();
            await this._awardIndividualKarma(heroId, karmaAmount, awardType, description);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award",
      render: (html) => {
        const sync = () => {
          const type = html.find('[name="awardType"]').val();
          html.find('[data-field="actDifficulty"]').toggle(type === 'Charity: Act');
          html.find('[data-field="donationRank"]').toggle(type === 'Charity: Donation');
          const hero = game.actors.get(html.find('[name="heroId"]').val());
          const donationRank = Number(html.find('[name="donationRank"]').val() || 0);
          const actDifficulty = html.find('[name="actDifficulty"]').val();
          const auto = this._computeIndividualAutoAmount(hero, type, { actDifficulty, donationRank });
          html.find('[name="karmaAmount"]').val(auto);
        };
        html.find('[name="awardType"], [name="heroId"], [name="actDifficulty"], [name="donationRank"]').on('change input', sync);
        sync();
      }
    }).render(true);
  }


  async _awardIndividualKarma(heroId, karmaAmount, awardType, description) {
    const hero = game.actors.get(heroId);
    if (!hero) return;
    
    const karmaEvent = {
      timestamp: new Date().toISOString(),
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

  // Session Karma Award - GM can award R+I+P (or custom amount) to all team members at session start
  _onAwardSessionKarma(event) {
    if (!game.user.isGM) return;

    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    if (heroes.length === 0) return ui.notifications.warn("No team members to award karma to");

    // Build table rows with checkboxes and editable amounts
    const heroRows = heroes.map(hero => {
      const r = hero.system.abilities?.reason?.value || 0;
      const i = hero.system.abilities?.intuition?.value || 0;
      const p = hero.system.abilities?.psyche?.value || 0;
      const baseKarma = r + i + p;
      return `
        <tr data-hero-id="${hero.id}">
          <td><input type="checkbox" name="include-${hero.id}" checked /></td>
          <td><img src="${hero.img}" style="width:32px;height:32px;border-radius:4px;vertical-align:middle;margin-right:4px;" />${hero.name}</td>
          <td style="text-align:center;">${r}</td>
          <td style="text-align:center;">${i}</td>
          <td style="text-align:center;">${p}</td>
          <td><input type="number" name="amount-${hero.id}" value="${baseKarma}" min="0" style="width:60px;" /></td>
        </tr>
      `;
    }).join('');

    new Dialog({
      title: "Award Session Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Session/Reason:</label>
            <input type="text" name="sessionName" placeholder="e.g., Session 12, Episode: The Hydro-Man Affair" style="width:100%;" />
          </div>
          
          <p style="margin:10px 0;font-size:0.9em;color:#666;">
            Default amounts are each hero's R+I+P. Adjust individually as needed.
          </p>
          
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="width:30px;"></th>
                <th style="text-align:left;">Hero</th>
                <th style="text-align:center;width:40px;">R</th>
                <th style="text-align:center;width:40px;">I</th>
                <th style="text-align:center;width:40px;">P</th>
                <th style="width:70px;">Award</th>
              </tr>
            </thead>
            <tbody>
              ${heroRows}
            </tbody>
          </table>
          
          <div style="display:flex;gap:10px;margin-top:10px;">
            <button type="button" class="select-all" style="flex:1;"><i class="fas fa-check-square"></i> Select All</button>
            <button type="button" class="select-none" style="flex:1;"><i class="fas fa-square"></i> Select None</button>
          </div>
        </form>
      `,
      buttons: {
        award: {
          icon: '<i class="fas fa-star"></i>',
          label: "Award Session Karma",
          callback: async (html) => {
            const sessionName = html.find('[name="sessionName"]').val() || "Session Award";
            
            // Collect selected heroes and amounts
            const awards = [];
            for (const hero of heroes) {
              const included = html.find(`[name="include-${hero.id}"]`).is(':checked');
              if (included) {
                const amount = Number(html.find(`[name="amount-${hero.id}"]`).val()) || 0;
                if (amount > 0) {
                  awards.push({ hero, amount });
                }
              }
            }
            
            if (awards.length === 0) {
              ui.notifications.warn("No heroes selected for karma award");
              return;
            }
            
            // Award karma to each selected hero
            for (const { hero, amount } of awards) {
              const karmaEvent = {
                timestamp: new Date().toISOString(),
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: amount,
                type: "Session Award",
                description: sessionName
              };
              
              const history = foundry.utils.deepClone(hero.system.karma?.history || []);
              history.push(karmaEvent);
              
              const newLifetime = (hero.system.karma?.lifetime || 0) + amount;
              
              await hero.update({
                "system.karma.history": history,
                "system.karma.lifetime": newLifetime
              });
            }
            
            // Add to team awards history
            const teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
            const totalAwarded = awards.reduce((sum, a) => sum + a.amount, 0);
            teamAwards.unshift({
              date: new Date().toLocaleDateString(),
              totalAmount: totalAwarded,
              destination: "Individual",
              teamSize: awards.length,
              reason: "Session Award",
              description: sessionName,
              multiplier: 1
            });
            await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);
            
            ui.notifications.info(`Session karma awarded to ${awards.length} heroes (${totalAwarded} total)`);
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award",
      render: (html) => {
        // Select all/none buttons
        html.find('.select-all').click(() => {
          html.find('input[type="checkbox"]').prop('checked', true);
        });
        html.find('.select-none').click(() => {
          html.find('input[type="checkbox"]').prop('checked', false);
        });
      }
    }, { width: 500 }).render(true);
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

  _onEditAward(event) {
    if (!game.user.isGM) return;
    
    const index = Number(event.currentTarget.dataset.index);
    const awards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
    
    if (index < 0 || index >= awards.length) return;
    
    const award = awards[index];

    new Dialog({
      title: "Edit Award Entry",
      content: `
        <form>
          <div class="form-group">
            <label>Date:</label>
            <input type="text" name="date" value="${award.date || ''}" />
          </div>
          <div class="form-group">
            <label>Total Karma:</label>
            <input type="number" name="totalAmount" value="${award.totalAmount || 0}" />
          </div>
          <div class="form-group">
            <label>Destination:</label>
            <input type="text" name="destination" value="${award.destination || ''}" />
          </div>
          <div class="form-group">
            <label>Team Size:</label>
            <input type="number" name="teamSize" value="${award.teamSize || 0}" />
          </div>
          <div class="form-group">
            <label>Award Type:</label>
            <input type="text" name="reason" value="${award.reason || ''}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" rows="2">${award.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Multiplier:</label>
            <input type="number" name="multiplier" value="${award.multiplier || 1}" min="1" max="10" />
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            award.date = html.find('[name="date"]').val();
            award.totalAmount = Number(html.find('[name="totalAmount"]').val());
            award.destination = html.find('[name="destination"]').val();
            award.teamSize = Number(html.find('[name="teamSize"]').val());
            award.reason = html.find('[name="reason"]').val();
            award.description = html.find('[name="description"]').val();
            award.multiplier = Number(html.find('[name="multiplier"]').val());
            
            awards[index] = award;
            await game.settings.set("msh-faserip", "teamKarmaAwards", awards);
            ui.notifications.info("Award entry updated");
            this.render(true);
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

  async _onDeleteAward(event) {
    if (!game.user.isGM) return;
    
    const index = Number(event.currentTarget.dataset.index);
    const awards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
    
    if (index < 0 || index >= awards.length) return;
    
    const award = awards[index];

    const confirmed = await Dialog.confirm({
      title: "Delete Award Entry",
      content: `<p>Delete this award entry?</p>
                <p style="font-style:italic;color:#666;">${award.reason}: ${award.totalAmount} karma</p>
                <p style="color:#d32f2f;font-size:0.9em;">Note: This only removes the log entry. It does not reverse karma already awarded to heroes or the pool.</p>`
    });

    if (confirmed) {
      awards.splice(index, 1);
      await game.settings.set("msh-faserip", "teamKarmaAwards", awards);
      ui.notifications.info("Award entry deleted");
      this.render(true);
    }
  }

  async _onDissolvePool(event) {
    if (!game.user.isGM) return;

    const poolTotal = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    if (poolTotal <= 0) {
      ui.notifications.warn("Pool is empty");
      return;
    }

    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    
    if (heroes.length === 0) {
      ui.notifications.warn("No team members to distribute to");
      return;
    }

    const share = Math.floor(poolTotal / heroes.length);
    const remainder = poolTotal % heroes.length;

    const confirmed = await Dialog.confirm({
      title: "Dissolve Karma Pool?",
      content: `
        <p>This will empty the team pool and return karma to each member.</p>
        <div style="background:#e3f2fd;padding:10px;border-radius:4px;margin:10px 0;">
          <div><strong>Pool Total:</strong> ${poolTotal}</div>
          <div><strong>Members:</strong> ${heroes.length}</div>
          <div><strong>Share Each:</strong> ${share}</div>
          ${remainder > 0 ? `<div style="color:#666;font-size:0.9em;">Remainder lost: ${remainder}</div>` : ''}
        </div>
        <p>Continue?</p>
      `
    });

    if (!confirmed) return;

    // Distribute to each hero
    for (const hero of heroes) {
      const history = foundry.utils.deepClone(hero.system.karma?.history || []);
      history.push({
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: share,
        type: "Pool Dissolved",
        description: `Team pool disbanded (${share} of ${poolTotal})`
      });

      const newLifetime = (hero.system.karma?.lifetime || 0) + share;

      await hero.update({
        "system.karma.history": history,
        "system.karma.lifetime": newLifetime
      });
    }

    // Empty the pool
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", 0);

    // Log it in team awards
    const teamAwards = game.settings.get("msh-faserip", "teamKarmaAwards") || [];
    teamAwards.push({
      date: new Date().toLocaleDateString(),
      totalAmount: -poolTotal,
      destination: `Dissolved (${share} each)`,
      teamSize: heroes.length,
      reason: "Pool Dissolved",
      description: `Pool disbanded, ${share} karma returned to each member`,
      multiplier: 1
    });
    await game.settings.set("msh-faserip", "teamKarmaAwards", teamAwards);

    ui.notifications.info(`Pool dissolved. ${share} karma returned to each of ${heroes.length} members.`);
    this.render(true);
  }

  _onApplyKarmaPenalty(event) {
    if (!game.user.isGM) return;

    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    if (!heroes.length) return ui.notifications.warn("No team members available");

    const heroOptions = [
      `<option value="__ALL__">(All Active Team Members)</option>`,
      ...heroes.map(h => `<option value="${h.id}">${h.name}</option>`)
    ].join('');

    new Dialog({
      title: "Apply Karma Penalty / Loss",
      content: `
        <form>
          <div class="form-group">
            <label>Target:</label>
            <select name="targetId">${heroOptions}</select>
          </div>

          <div class="form-group">
            <label>Penalty Type:</label>
            <select name="penaltyType">
              <optgroup label="Defeats">
                <option value="Public Defeat">Public Defeat (−40)</option>
                <option value="Private Defeat">Private Defeat (−20)</option>
              </optgroup>
              <optgroup label="Permit Crimes (loss equals arrest value)">
                <option value="Permit Violent Crime">Permit Violent Crime (−15)</option>
                <option value="Permit Destructive Crime">Permit Destructive Crime (−10)</option>
                <option value="Permit Theft">Permit Theft (−5)</option>
                <option value="Permit Misdemeanor">Permit Misdemeanor (−5)</option>
                <option value="Permit National Offense">Permit National Offense (−20)</option>
                <option value="Permit Other Crimes">Permit Other Crimes (−10)</option>
                <option value="Permit Robbery">Permit Robbery (−10)</option>
              </optgroup>
              <optgroup label="Committing Crimes">
                <option value="Commit Violent Crime">Commit Violent Crime (−60)</option>
                <option value="Commit Destructive Crime">Commit Destructive Crime (−40)</option>
                <option value="Commit Theft">Commit Theft (−10)</option>
                <option value="Commit Misdemeanor">Commit Misdemeanor (−5)</option>
                <option value="Commit National Offense">Commit National Offense (−40)</option>
                <option value="Commit Other Crimes">Commit Other Crimes (−10)</option>
              </optgroup>
              <optgroup label="Property / Death">
                <option value="Property Destruction">Property Destruction (−5 per area, per hero)</option>
                <option value="Death/Kill (Zero Karma)">Death / Kill — Reduce to 0 (and zero pool if member)</option>
                <option value="Noble/Mysterious/Self-Destruction">Noble / Mysterious / Self-Destruction (−50)</option>
              </optgroup>
              <optgroup label="Custom">
                <option value="Custom Loss">Custom Loss (enter negative amount)</option>
              </optgroup>
            </select>
          </div>

          <div class="form-group" data-field="areas">
            <label>Damaged Areas (per hero):</label>
            <input type="number" name="areas" value="1" min="1" />
          </div>

          <div class="form-group" data-field="custom">
            <label>Custom Negative Amount:</label>
            <input type="number" name="customLoss" value="-10" />
          </div>

          <div class="form-group">
            <label>Description / Notes:</label>
            <textarea name="description" rows="3" placeholder="What happened?"></textarea>
          </div>
        </form>
      `,
      buttons: {
        apply: {
          icon: '<i class="fas fa-exclamation-triangle"></i>',
          label: "Apply Penalty",
          callback: async (html) => {
            const targetId = html.find('[name="targetId"]').val();
            const penaltyType = html.find('[name="penaltyType"]').val();
            const areas = Number(html.find('[name="areas"]').val() || 1);
            const customLoss = Number(html.find('[name="customLoss"]').val() || -10);
            const description = html.find('[name="description"]').val();

            await this._applyKarmaPenalty({ targetId, penaltyType, areas, customLoss, description });
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "apply",
      render: (html) => {
        const sync = () => {
          const t = html.find('[name="penaltyType"]').val();
          html.find('[data-field="areas"]').toggle(t === "Property Destruction");
          html.find('[data-field="custom"]').toggle(t === "Custom Loss");
        };
        html.find('[name="penaltyType"]').on('change', sync);
        sync();
      }
    }).render(true);
  }

  _computeIndividualAutoAmount(hero, type, { actDifficulty = "auto", donationRank = 0 } = {}) {
    const pop = hero?.system?.attributes?.popularity?.hero?.value ?? 0;
    switch (type) {
      case "Personal Commitment": return 5;
      case "Weekly Award": return 10; // "up to 10" – GM may override
      case "Role-Playing": return 10; // "up to 10"
      case "Stump the Judge": return 15; // "up to 15"
      case "Humor": return 5;

      case "Charity: Appearance": return Math.min(Math.max(pop, 0), 20);
      case "Charity: Act": {
        const map = { auto: 10, green: 20, yellow: 30, red: 40 };
        return map[actDifficulty] ?? 10;
      }
      case "Charity: Donation": {
        return donationRank > 0 ? donationRank : 10; // FEAT rank number, or +10 if no FEAT
      }

      default: return 10; // safe default
    }
  }

  // ========== TIME TRACKING METHODS ==========
  
  _formatDateTime() {
    try {
      const campaignTime = game.msh.getCampaignDateTime();
      return campaignTime.formatted;
    } catch (err) {
      console.error("FASERIP | Error formatting campaign date/time:", err);
      return "Time unavailable";
    }
  }
  
  async _onTimeAdjust(event) {
    const unit = event.currentTarget.dataset.unit;
    
    const unitLabels = {
      turn: { label: "Turns", seconds: 6 },
      minute: { label: "Minutes", seconds: 60 },
      hour: { label: "Hours", seconds: 3600 },
      day: { label: "Days", seconds: 86400 },
      custom: { label: "Seconds", seconds: 1 }
    };
    
    const config = unitLabels[unit];
    
    const content = `
      <div style="display:grid;gap:8px;">
        <label>Enter ${config.label}:</label>
        <input type="number" id="time-adjust-input" value="0" style="width:100%;padding:4px;">
        <div style="font-size:0.9em;color:#666;">
          ${unit === 'custom' ? 'Enter seconds directly' : `(${config.seconds} seconds each)`}<br>
          Positive = forward, Negative = backward
        </div>
      </div>
    `;
    
    new Dialog({
      title: `Adjust Time by ${config.label}`,
      content,
      buttons: {
        apply: {
          label: "Apply",
          callback: async (html) => {
            const value = parseInt(html.find('#time-adjust-input').val()) || 0;
            if (value !== 0) {
              await this._adjustTime(value * config.seconds);
            }
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "apply",
      render: (html) => {
        html.find('#time-adjust-input').focus().select();
      }
    }).render(true);
  }
  
  async _adjustTime(seconds) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can adjust time");
      return;
    }
    
    // Advance Foundry's world time
    await game.time.advance(seconds);
    
    console.log(`🕐 FASERIP | Manually advanced time by ${seconds} seconds`);
    
    // Trigger update hook to refresh displays
    Hooks.callAll("msh-faserip.timeUpdated");
    
    // Refresh the sheet to show new time
    this.render(false);
  }
  
  async _onTimeSettings(event) {
    event.preventDefault();
    
    const campaignTime = game.msh.getCampaignDateTime();
    const currentStartDate = game.settings.get("msh-faserip", "campaignStartDate");
    
    // Format current campaign time for datetime-local input
    const currentTimeISO = campaignTime.date.toISOString().slice(0, 16);
    
    new Dialog({
      title: "Time Settings",
      content: `
        <form>
          <div class="form-group">
            <label>Campaign Start Date/Time</label>
            <input type="datetime-local" name="startDateTime" value="${currentStartDate.slice(0, 16)}" 
                  style="width: 100%; padding: 5px;">
            <p class="notes">Set the starting date/time for your campaign (e.g., January 1, 1976)</p>
          </div>
          
          <div class="form-group">
            <label>Current Campaign Time</label>
            <input type="datetime-local" name="currentDateTime" value="${currentTimeISO}" 
                  style="width: 100%; padding: 5px;">
            <p class="notes">Adjust the current in-game time. Time elapsed: ${Math.floor(campaignTime.elapsedSeconds / 86400)} days, 
              ${Math.floor((campaignTime.elapsedSeconds % 86400) / 3600)} hours</p>
          </div>
          
          <div class="form-group">
            <label>
              <input type="checkbox" name="combatSync" ${game.settings.get("msh-faserip", "combatSyncEnabled") ? "checked" : ""}>
              Auto-sync time with combat tracker
            </label>
            <p class="notes">When enabled, time advances 6 seconds per combat round</p>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            const newStartDate = html.find('[name="startDateTime"]').val() + ":00";
            const newCurrentTime = html.find('[name="currentDateTime"]').val() + ":00";
            const combatSync = html.find('[name="combatSync"]').prop('checked');
            
            // Calculate desired elapsed time (in milliseconds)
            const startDate = new Date(newStartDate);
            const currentDate = new Date(newCurrentTime);
            const desiredElapsedMs = currentDate - startDate;
            
            // Update the reference point: worldTime - desiredElapsed = campaignStartWorldTime
            const newStartWorldTime = game.time.worldTime - desiredElapsedMs;
            
            // Update all settings
            await game.settings.set("msh-faserip", "campaignStartDate", newStartDate);
            await game.settings.set("msh-faserip", "campaignStartWorldTime", newStartWorldTime);
            await game.settings.set("msh-faserip", "combatSyncEnabled", combatSync);
            
            console.log(`FASERIP | Updated campaign time: ${newCurrentTime}`);
            console.log(`FASERIP | Reference point: ${newStartWorldTime}`);
            
            ui.notifications.info("Time settings updated");
            this.render(false); // Refresh the sheet
            
            // Trigger update hook
            Hooks.callAll("msh-faserip.timeUpdated");
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
  
  // ========== COMBAT LOG METHODS ==========
  
  async _onAddLogEntry(event) {
    const content = `
      <div style="display:grid;gap:8px;">
        <label>Log Entry:</label>
        <textarea id="log-text" rows="3" style="width:100%;padding:4px;" placeholder="Defeated 5 Maggia Thugs..."></textarea>
        <div style="font-size:0.9em;color:#666;">
          Timestamp will be set to current game time
        </div>
      </div>
    `;
    
    new Dialog({
      title: "Add Combat Log Entry",
      content,
      buttons: {
        add: {
          label: "Add",
          callback: async (html) => {
            const text = html.find('#log-text').val().trim();
            if (text) {
              await this._addLogEntry(text);
            }
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "add",
      render: (html) => {
        html.find('#log-text').focus();
      }
    }).render(true);
  }
  
  async _addLogEntry(text, timestamp = null) {
    const logs = game.settings.get("msh-faserip", "combatLogs") || [];
    
    const newLog = {
      id: foundry.utils.randomID(),
      timestamp: timestamp || this._formatDateTime(),
      text: text
    };
    
    logs.unshift(newLog); // Add to beginning
    await game.settings.set("msh-faserip", "combatLogs", logs);
    
    ui.notifications.info("Log entry added");
    this.render(true);
  }
  
  async _onEditLogEntry(event) {
    const logId = event.currentTarget.dataset.logId;
    const logs = game.settings.get("msh-faserip", "combatLogs") || [];
    const log = logs.find(l => l.id === logId);
    
    if (!log) return;
    
    const content = `
      <div style="display:grid;gap:8px;">
        <label>Log Entry:</label>
        <textarea id="log-text" rows="3" style="width:100%;padding:4px;">${log.text}</textarea>
      </div>
    `;
    
    new Dialog({
      title: "Edit Combat Log Entry",
      content,
      buttons: {
        save: {
          label: "Save",
          callback: async (html) => {
            const text = html.find('#log-text').val().trim();
            if (text) {
              log.text = text;
              await game.settings.set("msh-faserip", "combatLogs", logs);
              ui.notifications.info("Log entry updated");
              this.render(true);
            }
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "save",
      render: (html) => {
        html.find('#log-text').focus().select();
      }
    }).render(true);
  }
  
  async _onDeleteLogEntry(event) {
    const logId = event.currentTarget.dataset.logId;
    const logs = game.settings.get("msh-faserip", "combatLogs") || [];
    const log = logs.find(l => l.id === logId);
    
    if (!log) return;
    
    const confirmed = await Dialog.confirm({
      title: "Delete Log Entry",
      content: `<p>Delete this log entry?</p><p style="font-style:italic;color:#666;">${log.text}</p>`
    });
    
    if (confirmed) {
      const filtered = logs.filter(l => l.id !== logId);
      await game.settings.set("msh-faserip", "combatLogs", filtered);
      ui.notifications.info("Log entry deleted");
      this.render(true);
    }
  }
  
  async _onClearAllLogs(event) {
    const confirmed = await Dialog.confirm({
      title: "Clear All Logs",
      content: "<p>Delete all combat log entries?</p><p style='color:#d32f2f;'>This cannot be undone.</p>"
    });
    
    if (confirmed) {
      await game.settings.set("msh-faserip", "combatLogs", []);
      ui.notifications.info("All logs cleared");
      this.render(true);
    }
  }

  _onAddDefeatedVillain(event) {
    if (!game.user.isGM) return;

    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const teamSize = teamMemberIds.length;

    const rankOptions = [
      { rank: "Remarkable", value: 30 },
      { rank: "Incredible", value: 40 },
      { rank: "Amazing", value: 50 },
      { rank: "Monstrous", value: 75 },
      { rank: "Unearthly", value: 100 },
      { rank: "Shift X", value: 150 },
      { rank: "Shift Y", value: 200 },
      { rank: "Shift Z", value: 500 },
      { rank: "Class 1000", value: 1000 },
      { rank: "Custom", value: 0 }
    ];

    const rankOptionsHtml = rankOptions.map(r => 
      `<option value="${r.rank}" data-value="${r.value}">${r.rank} (${r.value})</option>`
    ).join('');

    new Dialog({
      title: "Add Defeated Villain",
      content: `
        <form>
          <div class="form-group">
            <label>Villain Name:</label>
            <input type="text" name="villainName" placeholder="Dr. Doom" />
          </div>
          <div class="form-group">
            <label>Highest Rank:</label>
            <select name="villainRank">${rankOptionsHtml}</select>
          </div>
          <div class="form-group" data-field="customValue" style="display:none;">
            <label>Custom Rank Value:</label>
            <input type="number" name="customValue" value="30" min="1" />
          </div>
          <hr style="margin: 10px 0;">
          <div class="form-group">
            <label>
              <input type="checkbox" name="awardKarma" checked />
              Award karma now
            </label>
          </div>
          <div class="karma-preview" style="background:#e3f2fd;padding:10px;border-radius:4px;margin-top:8px;">
            <div><strong>Base:</strong> <span class="base-value">30</span></div>
            <div><strong>Multiplier:</strong> ×${multiplier}</div>
            <div><strong>Total:</strong> <span class="total-value">${30 * multiplier}</span></div>
            <div><strong>Per Hero:</strong> <span class="per-hero-value">${teamSize > 0 ? Math.floor((30 * multiplier) / teamSize) : 0}</span> (${teamSize} members)</div>
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label>
              <input type="checkbox" name="addToPool" />
              Add to Team Pool instead of splitting
            </label>
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-skull"></i>',
          label: "Add & Award",
          callback: async (html) => {
            const villainName = html.find('[name="villainName"]').val().trim();
            if (!villainName) {
              ui.notifications.warn("Please enter a villain name");
              return;
            }

            const rankSelect = html.find('[name="villainRank"]');
            const rank = rankSelect.val();
            let value = Number(rankSelect.find(':selected').data('value'));
            
            if (rank === "Custom") {
              value = Number(html.find('[name="customValue"]').val()) || 30;
            }

            const awardKarma = html.find('[name="awardKarma"]').is(':checked');
            const addToPool = html.find('[name="addToPool"]').is(':checked');

            // Save villain to list
            const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
            const totalKarma = value * multiplier;
            const karmaPerHero = teamSize > 0 ? Math.floor(totalKarma / teamSize) : 0;

            const villain = {
              id: foundry.utils.randomID(),
              name: villainName,
              rank: rank,
              value: value,
              date: new Date().toLocaleDateString(),
              karmaAwarded: awardKarma ? totalKarma : 0,
              multiplier: multiplier,
              addedToPool: addToPool
            };
            villains.push(villain);
            await game.settings.set("msh-faserip", "defeatedVillains", villains);

            // Award karma if checked
            if (awardKarma && teamSize > 0) {
              await this._awardTeamKarma(
                value, 
                `Defeated Foe - ${rank}`, 
                `Defeated ${villainName}`, 
                multiplier, 
                addToPool
              );
            } else if (awardKarma && teamSize === 0) {
              ui.notifications.warn("No team members to award karma to");
            }

            ui.notifications.info(`${villainName} added to defeated villains`);
            this.render(true);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "add",
      render: (html) => {
        const updatePreview = () => {
          const rankSelect = html.find('[name="villainRank"]');
          const rank = rankSelect.val();
          let value = Number(rankSelect.find(':selected').data('value'));
          
          if (rank === "Custom") {
            value = Number(html.find('[name="customValue"]').val()) || 30;
            html.find('[data-field="customValue"]').show();
          } else {
            html.find('[data-field="customValue"]').hide();
          }

          const total = value * multiplier;
          const perHero = teamSize > 0 ? Math.floor(total / teamSize) : 0;

          html.find('.base-value').text(value);
          html.find('.total-value').text(total);
          html.find('.per-hero-value').text(perHero);
        };

        html.find('[name="villainRank"]').on('change', updatePreview);
        html.find('[name="customValue"]').on('input', updatePreview);
        updatePreview();
      }
    }).render(true);
  }

  async _onDeleteVillain(event) {
    const villainId = event.currentTarget.dataset.villainId;
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const villain = villains.find(v => v.id === villainId);
    
    if (!villain) return;

    const confirmed = await Dialog.confirm({
      title: "Remove Villain",
      content: `<p>Remove <strong>${villain.name}</strong> from defeated villains list?</p>
                <p style="color:#666;font-size:0.9em;">Note: This does not reverse any karma already awarded.</p>`
    });

    if (confirmed) {
      const filtered = villains.filter(v => v.id !== villainId);
      await game.settings.set("msh-faserip", "defeatedVillains", filtered);
      ui.notifications.info(`${villain.name} removed from list`);
      this.render(true);
    }
  }

  _onAwardFromLog(event) {
    if (!game.user.isGM) return;

    const logText = event.currentTarget.dataset.logText || "";
    
    // Open the team karma award dialog with pre-filled description
    const currentMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;

    new Dialog({
      title: "Award Karma from Log Entry",
      content: `
        <form>
          <div class="form-group">
            <label>Award Type:</label>
            <select name="awardType">
              <optgroup label="Rescue">
                <option value="Rescue">Rescue (+20, cap 100)</option>
                <option value="Multiple Rescues (5+)">Multiple Rescues (5+) (+100)</option>
              </optgroup>
              <optgroup label="Stop/Prevent vs Arrest">
                <option value="Violent Crime (Stop)">Violent Crime — Stop (+30)</option>
                <option value="Violent Crime (Arrest)">Violent Crime — Arrest (+15)</option>
                <option value="Destructive Crime (Stop)">Destructive Crime — Stop (+20)</option>
                <option value="Destructive Crime (Arrest)">Destructive Crime — Arrest (+10)</option>
                <option value="Robbery (Stop)">Robbery — Stop (+20)</option>
                <option value="Robbery (Arrest)">Robbery — Arrest (+10)</option>
                <option value="Theft (Stop)">Theft — Stop (+10)</option>
                <option value="Theft (Arrest)">Theft — Arrest (+5)</option>
              </optgroup>
              <optgroup label="Other">
                <option value="Custom">Custom Award (enter amount)</option>
              </optgroup>
            </select>
          </div>

          <div class="form-group">
            <label>Base Karma Amount:</label>
            <input type="number" name="karmaAmount" value="20" min="1" />
          </div>

          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" rows="2">${logText}</textarea>
          </div>

          <div class="form-group" style="background:#fff3e0;padding:10px;border-radius:3px;">
            <label>
              <input type="checkbox" name="addToPool" checked />
              Add to Team Karma Pool
            </label>
          </div>
        </form>
      `,
      buttons: {
        award: {
          icon: '<i class="fas fa-trophy"></i>',
          label: "Award Karma",
          callback: async (html) => {
            const awardType = html.find('[name="awardType"]').val();
            let karmaAmount = Number(html.find('[name="karmaAmount"]').val());
            const description = html.find('[name="description"]').val();
            const addToPool = html.find('[name="addToPool"]').is(':checked');

            // Rescue caps
            if (awardType.startsWith("Rescue")) karmaAmount = Math.min(karmaAmount, 100);
            if (awardType.startsWith("Multiple Rescues")) karmaAmount = 100;

            await this._awardTeamKarma(karmaAmount, awardType, description, currentMultiplier, addToPool);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award",
      render: (html) => {
        const $amount = html.find('[name="karmaAmount"]');
        $amount.on('input', () => $amount.data('touched', true));
        
        html.find('[name="awardType"]').on('change', () => {
          if ($amount.data('touched')) return;
          const type = html.find('[name="awardType"]').val();
          const auto = this._getBaseKarmaFromTeamAward(type);
          if (auto) $amount.val(auto);
        });
      }
    }).render(true);
  }

} // end of class TeamSheet