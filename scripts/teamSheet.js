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

            // Auto base from type (you can still override in the field)
            const autoBase = this._getBaseKarmaFromTeamAward(awardType, { customFoeRank });
            if (!html.find('[name="karmaAmount"]').data('touched') && autoBase) karmaAmount = autoBase;

            // Rescue caps
            if (awardType.startsWith("Rescue")) karmaAmount = Math.min(karmaAmount, 100);
            if (awardType.startsWith("Multiple Rescues")) karmaAmount = 100;

            await game.settings.set("msh-faserip", "karmaMultiplier", multiplier);
            await this._awardTeamKarma(karmaAmount, awardType, description, multiplier, addToPool, { when });
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
      }
    }).render(true);
  }

  async _awardTeamKarma(karmaAmount, awardType, description, multiplier, addToPool) {
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

}