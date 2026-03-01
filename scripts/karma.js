// karma.js v1.5.0 - 2026-02-28
// v1.5.0: Fix edit matching, timestamps, consistent karma calc, multiplier/split add dialog
export class KarmaSheet extends DocumentSheet {
  sortNewestFirst = true;
  searchFilter = "";

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "karma"],
      template: "systems/msh-faserip/templates/karma-sheet.html",
      width: 720,
      height: 520,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      tabs: []
    });
  }

  get title() {
    return `Karma History: ${this.object.name}`;
  }

  getData() {
    const context = super.getData();
    const actorData = this.object.toObject(false);
    
    context.system = actorData.system;
    context.isGM = game.user.isGM;
    
    if (!context.system.karma) {
      context.system.karma = { history: [], lifetime: 0, advancement: 0, poolContribution: 0 };
    }
    if (!Array.isArray(context.system.karma.history)) {
      context.system.karma.history = [];
    }
    if (!context.system.karma.advancementPurpose) context.system.karma.advancementPurpose = "";
    if (!context.system.karma.advancementDetail) context.system.karma.advancementDetail = "";
    if (!context.system.karma.poolContribution) context.system.karma.poolContribution = 0;

    // Team pool and multiplier from settings
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    context.karmaMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    // Sort history
    context.system.karma.history.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.realDate || 0);
      const dateB = new Date(b.timestamp || b.realDate || 0);
      return this.sortNewestFirst ? dateB - dateA : dateA - dateB;
    });
    
    context.sortToggle = {
      icon: this.sortNewestFirst ? 'fa-arrow-down' : 'fa-arrow-up',
      tooltip: this.sortNewestFirst ? 
        'Currently showing newest first. Click to show oldest first.' :
        'Currently showing oldest first. Click to show newest first.'
    };
    
    // CSS classes for event types
    context.system.karma.history.forEach(event => {
      if (event.type === "Die Roll") event.cssClass = "karma-die-roll";
      else if (event.type === "Power Stunt") event.cssClass = "karma-power-stunt";
      else if (event.type === "Session Award") event.cssClass = "karma-session-award";
      else if (event.type === "Resource FEAT") event.cssClass = "karma-resource-feat";
      else if (event.type === "Popularity FEAT") event.cssClass = "karma-popularity-feat";
      else if (event.type === "Pool Contribution" || event.type === "Pool Withdrawal" || event.type === "Pool Refund") event.cssClass = "karma-pool-event";
      else if (event.amount < 0) event.cssClass = "karma-loss";
      else if (event.amount > 0) event.cssClass = "karma-gain";
    });
    
    context.totalSpent = this._calculateTotalSpent(context.system.karma.history);
    
    // Available Karma: lifetime - spent - advancement (pool contributions are in history as negative)
    const totalEarned = context.system.karma.lifetime || 0;
    const advancementFund = context.system.karma.advancement || 0;
    context.currentKarma = Math.max(0, totalEarned - context.totalSpent - advancementFund);
    
    return context;
  }
  
  _calculateTotalSpent(history) {
    if (!history || !history.length) return 0;
    let totalSpent = 0;
    history.forEach(event => {
      if (event.amount < 0) totalSpent += Math.abs(event.amount);
    });
    return totalSpent;
  }

  // Single source of truth for current available karma
  _getCurrentKarma() {
    const totalEarned = this.object.system.karma?.lifetime || 0;
    let totalSpent = 0;
    if (this.object.system.karma?.history && Array.isArray(this.object.system.karma.history)) {
      this.object.system.karma.history.forEach(event => {
        if (event.amount < 0) totalSpent += Math.abs(event.amount);
      });
    }
    const advancementFund = this.object.system.karma?.advancement || 0;
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
    
    html.find('.add-karma').click(ev => this._onAddKarma(ev));
    html.find('.spend-karma').click(ev => this._onSpendKarma(ev));
    html.find('.import-karma').click(ev => this._onImportKarma(ev));
    html.find('.export-karma').click(ev => this._onExportKarma(ev));
    html.find('.sort-toggle').click(ev => this._onSortToggle(ev));
    
    html.find('.toggle-history').click(ev => {
      const historySection = html.find('.history-section');
      historySection.slideToggle(200);
      const icon = $(ev.currentTarget).find('i');
      if (icon.hasClass('fa-history')) {
        icon.removeClass('fa-history').addClass('fa-chevron-up');
        $(ev.currentTarget).text(' Hide History');
        $(ev.currentTarget).prepend(icon);
      } else {
        icon.removeClass('fa-chevron-up').addClass('fa-history');
        $(ev.currentTarget).text(' Toggle History');
        $(ev.currentTarget).prepend(icon);
      }
    });

    html.find('.edit-karma').click(ev => {
      const index = Number(ev.currentTarget.dataset.index);
      this._onEditKarma(index);
    });
    
    html.find('.delete-karma').click(ev => {
      const index = Number(ev.currentTarget.dataset.index);
      this._onDeleteKarma(index);
    });

    // Multi-select
    html.find('.select-all-karma').change(ev => {
      const isChecked = ev.currentTarget.checked;
      html.find('.select-karma-entry').prop('checked', isChecked);
      this._updateDeleteSelectedButton(html);
    });
    html.find('.select-karma-entry').change(ev => {
      this._updateDeleteSelectedButton(html);
      const total = html.find('.select-karma-entry').length;
      const checked = html.find('.select-karma-entry:checked').length;
      html.find('.select-all-karma').prop('checked', checked === total && total > 0);
    });
    html.find('.delete-selected-karma').click(ev => this._onDeleteSelectedKarma(html));

    // Search
    const searchInput = html.find('.karma-search');
    searchInput.val(this.searchFilter);
    searchInput.on('input', ev => this._onSearchInput(ev, html));
    html.find('.karma-search-clear').click(ev => this._onSearchClear(ev, html));
    if (this.searchFilter) this._applySearchFilter(html, this.searchFilter);

    // GM clear all
    if (game.user.isGM) {
      html.find('.clear-karma').click(ev => this._onClearKarma(ev));
    }

    // GM multiplier edit
    html.find('.karma-multiplier-display').click(ev => {
      if (!game.user.isGM) return;
      this._onEditMultiplier(ev);
    });

    html.find('.open-pool').click(ev => {
      import('./karmaPool.js').then(module => {
        const poolSheet = new module.KarmaPoolSheet(this.object);
        poolSheet.render(true);
      });
    });

    html.find('.open-team-tracker').click(ev => {
      import('./teamSheet.js').then(module => {
        const sheet = new module.TeamSheet();
        sheet.render(true);
      });
    });
  }

  _onEditMultiplier(event) {
    event.preventDefault();
    const currentMultiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    
    new Dialog({
      title: "Set Karma Multiplier",
      content: `
        <form>
          <div class="form-group">
            <label>Karma Multiplier:</label>
            <input type="number" name="multiplier" value="${currentMultiplier}" min="1" max="10" step="0.5" />
          </div>
          <p style="font-size:0.85em; color:#666; margin-top:6px;">
            Applied to base awards in the Add Karma dialog. Most GMs use 2x or 3x.
          </p>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            const val = Number(html.find('[name="multiplier"]').val()) || 1;
            await game.settings.set("msh-faserip", "karmaMultiplier", Math.max(1, val));
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "save"
    }).render(true);
  }

  _onClearKarma(event) {
    event.preventDefault();
    new Dialog({
      title: "Clear All Karma Data",
      content: `
        <div class="form-group">
          <p class="warning">WARNING: This will permanently erase all karma history and reset all karma values to zero.</p>
          <p>This action cannot be undone. Are you sure you want to proceed?</p>
        </div>
      `,
      buttons: {
        clear: {
          icon: '<i class="fas fa-exclamation-triangle"></i>',
          label: "Clear All Karma Data",
          callback: async () => {
            await this.object.update({
              "system.karma.history": [],
              "system.attributes.karma.value": 0,
              "system.karma.lifetime": 0,
              "system.karma.advancement": 0,
              "system.karma.pool": 0,
              "system.karma.poolContribution": 0
            });
            ui.notifications.info(`All karma data for ${this.object.name} has been cleared.`);
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "cancel"
    }).render(true);
  }

  _onAddKarma(event) {
    event.preventDefault();
    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const teamCount = teamMemberIds.length;

    // Base amounts per event type (before multiplier)
    const eventAmounts = {
      "Violent Crime - Stop": 30, "Violent Crime - Arrest": 15,
      "Destructive Crime - Stop": 20, "Destructive Crime - Arrest": 10,
      "Theft - Stop": 10, "Theft - Arrest": 5,
      "Robbery - Stop": 20, "Robbery - Arrest": 10,
      "Misdemeanor - Stop": 5, "Misdemeanor - Arrest": 5,
      "National Offense - Stop": 20, "National Offense - Arrest": 10,
      "Local Conspiracy - Stop": 30, "Local Conspiracy - Arrest": 15,
      "National Conspiracy - Stop": 40, "National Conspiracy - Arrest": 20,
      "Global Conspiracy - Stop": 50, "Global Conspiracy - Arrest": 25,
      "Other Crime - Stop": 15, "Other Crime - Arrest": 5,
      "Rescue": 20, "Multiple Rescues (5+)": 100,
      "Defeated Foe": 0,
      "Personal Commitment": 5, "Weekly Award": 10,
      "Charity - Appearance": 0, "Charity - Act": 0, "Charity - Donation": 0,
      "Role-Playing": 10, "Stump the Judge": 15, "Humor Award": 5,
      "Session Award": 0,
      "Commit Violent Crime": -60, "Commit Destructive Crime": -40,
      "Commit Theft": -20, "Commit Misdemeanor": -10,
      "Commit National Offense": -40, "Commit Other Crime": -20,
      "Public Defeat": -40, "Private Defeat": -20,
      "Permit Violent Crime": -15, "Permit Destructive Crime": -10,
      "Permit Theft": -5, "Permit Robbery": -10,
      "Permit Misdemeanor": -5, "Permit National Offense": -10,
      "Permit Other Crime": -5,
      "Property Damage": -5,
      "Noble Death": -50, "Mysterious Death": -50, "Self-Destruction": -50,
      "Death - Kill": 0,
      "Custom": 0
    };

    // Events that are always individual (never split)
    const alwaysIndividual = [
      "Personal Commitment", "Weekly Award", "Role-Playing", "Stump the Judge",
      "Humor Award", "Charity - Appearance", "Charity - Act", "Charity - Donation",
      "Public Defeat", "Private Defeat", "Property Damage",
      "Noble Death", "Mysterious Death", "Self-Destruction", "Death - Kill",
      "Commit Violent Crime", "Commit Destructive Crime", "Commit Theft",
      "Commit Misdemeanor", "Commit National Offense", "Commit Other Crime",
      "Permit Violent Crime", "Permit Destructive Crime", "Permit Theft",
      "Permit Robbery", "Permit Misdemeanor", "Permit National Offense",
      "Permit Other Crime", "Custom"
    ];

    const optionGroups = `
      <optgroup label="Stop/Prevent Crime">
        <option value="Violent Crime - Stop">Stop Violent Crime (30)</option>
        <option value="Destructive Crime - Stop">Stop Destructive Crime (20)</option>
        <option value="Theft - Stop">Stop Theft (10)</option>
        <option value="Robbery - Stop">Stop Robbery (20)</option>
        <option value="Misdemeanor - Stop">Stop Misdemeanor (5)</option>
        <option value="National Offense - Stop">Stop National Offense (20)</option>
        <option value="Local Conspiracy - Stop">Stop Local Conspiracy (30)</option>
        <option value="National Conspiracy - Stop">Stop National Conspiracy (40)</option>
        <option value="Global Conspiracy - Stop">Stop Global Conspiracy (50)</option>
        <option value="Other Crime - Stop">Stop Other Crime (15)</option>
      </optgroup>
      <optgroup label="Arrest Criminal">
        <option value="Violent Crime - Arrest">Arrest - Violent Crime (15)</option>
        <option value="Destructive Crime - Arrest">Arrest - Destructive Crime (10)</option>
        <option value="Theft - Arrest">Arrest - Theft (5)</option>
        <option value="Robbery - Arrest">Arrest - Robbery (10)</option>
        <option value="Misdemeanor - Arrest">Arrest - Misdemeanor (5)</option>
        <option value="National Offense - Arrest">Arrest - National Offense (10)</option>
        <option value="Local Conspiracy - Arrest">Arrest - Local Conspiracy (15)</option>
        <option value="National Conspiracy - Arrest">Arrest - National Conspiracy (20)</option>
        <option value="Global Conspiracy - Arrest">Arrest - Global Conspiracy (25)</option>
        <option value="Other Crime - Arrest">Arrest - Other Crime (5)</option>
      </optgroup>
      <optgroup label="Combat &amp; Rescue">
        <option value="Rescue">Rescue (+20, max 100)</option>
        <option value="Multiple Rescues (5+)">Multiple Rescues 5+ (+100)</option>
        <option value="Defeated Foe">Defeated Foe (enter rank#)</option>
      </optgroup>
      <optgroup label="Personal">
        <option value="Personal Commitment">Personal Commitment (+5)</option>
        <option value="Weekly Award">Weekly Award (+10)</option>
        <option value="Charity - Appearance">Charity Appearance (+Pop, max 20)</option>
        <option value="Charity - Act">Charity Act (+10-40)</option>
        <option value="Charity - Donation">Charity Donation (+Res rank#)</option>
      </optgroup>
      <optgroup label="Gaming Awards">
        <option value="Role-Playing">Role-Playing (+10)</option>
        <option value="Stump the Judge">Stump the Judge (+15)</option>
        <option value="Humor Award">Humor Award (+5)</option>
        <option value="Session Award">Session Award (custom)</option>
      </optgroup>
      <optgroup label="Losses: Crimes Committed">
        <option value="Commit Violent Crime">Commit Violent Crime (-60)</option>
        <option value="Commit Destructive Crime">Commit Destructive Crime (-40)</option>
        <option value="Commit Theft">Commit Theft (-20)</option>
        <option value="Commit Misdemeanor">Commit Misdemeanor (-10)</option>
        <option value="Commit National Offense">Commit National Offense (-40)</option>
        <option value="Commit Other Crime">Commit Other Crime (-20)</option>
      </optgroup>
      <optgroup label="Losses: Defeats">
        <option value="Public Defeat">Public Defeat (-40)</option>
        <option value="Private Defeat">Private Defeat (-20)</option>
      </optgroup>
      <optgroup label="Losses: Permitted Crimes">
        <option value="Permit Violent Crime">Permit Violent Crime (-15)</option>
        <option value="Permit Destructive Crime">Permit Destructive Crime (-10)</option>
        <option value="Permit Theft">Permit Theft (-5)</option>
        <option value="Permit Robbery">Permit Robbery (-10)</option>
        <option value="Permit Misdemeanor">Permit Misdemeanor (-5)</option>
        <option value="Permit National Offense">Permit National Offense (-10)</option>
        <option value="Permit Other Crime">Permit Other Crime (-5)</option>
      </optgroup>
      <optgroup label="Losses: Death &amp; Destruction">
        <option value="Property Damage">Property Damage (-5/area)</option>
        <option value="Noble Death">Noble Death (-50)</option>
        <option value="Mysterious Death">Mysterious Death (-50)</option>
        <option value="Self-Destruction">Self-Destruction (-50)</option>
        <option value="Death - Kill">Death/Kill (ALL karma to 0)</option>
      </optgroup>
      <optgroup label="Other">
        <option value="Custom">Custom (enter amount)</option>
      </optgroup>
    `;

    new Dialog({
      title: "Add Karma",
      content: `
        <form class="karma-add-dialog">
          <div class="form-group">
            <label>Event Type:</label>
            <select name="eventType">${optionGroups}</select>
          </div>
          <div class="form-group karma-award-type">
            <label>Award Type:</label>
            <div class="radio-group">
              <label><input type="radio" name="awardType" value="individual" checked /> Individual</label>
              <label><input type="radio" name="awardType" value="group" /> Group (split)</label>
            </div>
          </div>
          <div class="form-group karma-split-section" style="display:none;">
            <label>Heroes Splitting:</label>
            <input type="number" name="splitCount" value="${Math.max(teamCount, 2)}" min="2" max="20" />
          </div>
          <div class="karma-calculation" style="background:#f5f5f0; padding:8px; border-radius:4px; margin:6px 0; font-size:0.9em;">
            <div>Base: <span class="calc-base">0</span></div>
            <div>x<span class="calc-multiplier">${multiplier}</span> multiplier = <span class="calc-gross">0</span></div>
            <div class="calc-split-line" style="display:none;">/ <span class="calc-split-count">2</span> heroes = <span class="calc-split-result">0</span></div>
          </div>
          <div class="form-group karma-pool-option" style="display:none;">
            <label>
              <input type="checkbox" name="sendToPool" />
              Send this group award to the team pool instead
            </label>
          </div>
          <div class="form-group">
            <label>Final Amount:</label>
            <input type="number" name="amount" value="0" />
          </div>
          <div class="form-group">
            <label>Real Date:</label>
            <input type="text" name="realDate" value="${new Date().toLocaleDateString()}" />
          </div>
          <div class="form-group">
            <label>Game Date:</label>
            <input type="text" name="gameDate" value="${this._getGameDate()}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description"></textarea>
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-check"></i>',
          label: "Add",
          callback: async (html) => {
            const form = html.find("form")[0];
            const formData = new FormData(form);
            const eventType = formData.get("eventType");
            const amount = Number(formData.get("amount"));
            const sendToPool = html.find('[name="sendToPool"]').is(':checked');

            // Handle Death - Kill: set karma to 0
            if (eventType === "Death - Kill") {
              const currentKarma = this._getCurrentKarma();
              if (currentKarma > 0) {
                const karmaEvent = {
                  timestamp: new Date().toISOString(),
                  realDate: formData.get("realDate"),
                  gameDate: formData.get("gameDate"),
                  amount: -currentKarma,
                  type: "Death - Kill",
                  description: formData.get("description") || "Kill — all karma lost"
                };
                this._addKarmaEvent(karmaEvent);
              }
              ui.notifications.warn(`${this.object.name} killed — all karma lost!`);
              return;
            }

            if (sendToPool && amount > 0) {
              const currentPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
              await game.settings.set("msh-faserip", "teamKarmaPoolTotal", currentPool + amount);
              ui.notifications.info(`Added ${amount} karma to team pool (${eventType})`);
              return;
            }
            
            const karmaEvent = {
              timestamp: new Date().toISOString(),
              realDate: formData.get("realDate"),
              gameDate: formData.get("gameDate"),
              amount: amount,
              type: eventType,
              description: formData.get("description")
            };
            
            this._addKarmaEvent(karmaEvent);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "add",
      render: (html) => {
        const recalc = () => {
          const type = html.find('[name="eventType"]').val();
          const baseAmount = eventAmounts[type] || 0;
          const isGroup = html.find('[name="awardType"]:checked').val() === "group";
          const splitCount = Number(html.find('[name="splitCount"]').val()) || 2;
          const isIndividualOnly = alwaysIndividual.includes(type);
          const isLoss = baseAmount < 0;

          // Show/hide award type and split controls
          if (isIndividualOnly || isLoss) {
            html.find('.karma-award-type').hide();
            html.find('.karma-split-section').hide();
            html.find('.karma-pool-option').hide();
            html.find('.calc-split-line').hide();
          } else {
            html.find('.karma-award-type').show();
            if (isGroup) {
              html.find('.karma-split-section').show();
              html.find('.karma-pool-option').show();
              html.find('.calc-split-line').show();
            } else {
              html.find('.karma-split-section').hide();
              html.find('.karma-pool-option').hide();
              html.find('.calc-split-line').hide();
            }
          }

          // Calculate
          const gross = Math.floor(baseAmount * multiplier);
          let finalAmount;
          if (isGroup && !isIndividualOnly && !isLoss) {
            finalAmount = Math.floor(gross / splitCount);
          } else if (isLoss) {
            finalAmount = baseAmount; // losses not multiplied
          } else {
            finalAmount = gross;
          }

          // Update display
          html.find('.calc-base').text(baseAmount);
          html.find('.calc-multiplier').text(multiplier);
          html.find('.calc-gross').text(gross);
          html.find('.calc-split-count').text(splitCount);
          html.find('.calc-split-result').text(Math.floor(gross / splitCount));

          // Hide calculation for losses and custom
          if (isLoss || type === "Custom" || type === "Death - Kill") {
            html.find('.karma-calculation').hide();
          } else {
            html.find('.karma-calculation').show();
          }

          html.find('[name="amount"]').val(finalAmount);
        };

        html.find('[name="eventType"]').change(recalc);
        html.find('[name="awardType"]').change(recalc);
        html.find('[name="splitCount"]').on('input', recalc);
        recalc();
      }
    }).render(true);
  }

  _onSpendKarma(event) {
    event.preventDefault();
    const availableKarma = this._getCurrentKarma();
    
    new Dialog({
      title: "Spend Karma",
      content: `
        <form>
          <div class="form-group">
            <label>Available Karma: ${availableKarma}</label>
          </div>
          <div class="form-group">
            <label>Spend Type:</label>
            <select name="spendType">
              <option value="Die Roll">Manipulate Die Roll (min 10)</option>
              <option value="Reduce Effect">Reduce Combat Effect (50 per color)</option>
              <option value="Power Stunt">Power Stunt (100)</option>
              <option value="Ability Advancement">Ability Advancement</option>
              <option value="Power Advancement">Power Advancement</option>
              <option value="Power Addition">Power Addition</option>
              <option value="Resource Advancement">Resource Advancement</option>
              <option value="Popularity Advancement">Popularity Advancement</option>
              <option value="Talent Addition">Talent Addition</option>
              <option value="Contact Addition">Contact Addition</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount:</label>
            <input type="number" name="amount" value="10" min="1" max="${availableKarma}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" placeholder="Describe what you're spending karma on..."></textarea>
          </div>
        </form>
      `,
      buttons: {
        spend: {
          icon: '<i class="fas fa-check"></i>',
          label: "Spend",
          callback: async (html) => {
            const spendType = html.find('[name="spendType"]').val();
            const amount = Number(html.find('[name="amount"]').val());
            const description = html.find('[name="description"]').val();
            
            if (amount <= 0 || amount > availableKarma) {
              ui.notifications.error("Invalid Karma amount.");
              return;
            }
            
            if (spendType.includes("Advancement") || spendType.includes("Addition")) {
              if (!description.trim()) {
                ui.notifications.error("Please provide a description for advancement purchases.");
                return;
              }
            }
            
            const finalDescription = description || spendType;
            const karmaEvent = {
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: this._getGameDate(),
              amount: -amount,
              type: spendType,
              description: finalDescription
            };
            
            this._addKarmaEvent(karmaEvent);
            ui.notifications.info(`Spent ${amount} karma on ${finalDescription}`);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "spend",
      render: (html) => {
        html.find('[name="spendType"]').change(ev => {
          const type = ev.currentTarget.value;
          let amount = 10;
          let placeholder = "Describe what you're spending karma on...";
          
          switch(type) {
            case "Die Roll": amount = 10; placeholder = "e.g., Spent on Fighting FEAT roll"; break;
            case "Reduce Effect": amount = 50; placeholder = "e.g., Reduced Kill to Yellow on energy blast"; break;
            case "Power Stunt": amount = 100; placeholder = "e.g., Used Telekinesis to lift a building"; break;
            case "Ability Advancement": amount = 50; placeholder = "e.g., Fighting 30 to 31 (include cresting cost)"; break;
            case "Power Advancement": amount = 100; placeholder = "e.g., Energy Blast from Remarkable to Incredible"; break;
            case "Power Addition": amount = 3000; placeholder = "e.g., Added Flight at Typical rank"; break;
            case "Resource Advancement": amount = 100; placeholder = "e.g., Resources 20 to 21"; break;
            case "Popularity Advancement": amount = 50; placeholder = "e.g., Hero Popularity 15 to 16"; break;
            case "Talent Addition": amount = 1000; placeholder = "e.g., Learned Martial Arts A from NPC"; break;
            case "Contact Addition": amount = 500; placeholder = "e.g., Added Police Contact with Good resources"; break;
          }
          
          html.find('[name="amount"]').val(amount);
          html.find('[name="description"]').attr('placeholder', placeholder);
        });
      }
    }).render(true);
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

  _onImportKarma(event) {
    event.preventDefault();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.name.endsWith('.csv')) {
        this._importCSV(file);
      } else {
        ui.notifications.error("Unsupported file format. Please use CSV files.");
      }
    };
    input.click();
  }

  async _importCSV(file) {
    try {
      const reader = new FileReader();
      const text = await new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error("File reading failed"));
        reader.readAsText(file);
      });
      
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        ui.notifications.warn("CSV file contains insufficient data");
        return;
      }
      
      const headers = this._parseCSVLine(lines[0]);
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this._parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((header, index) => { row[header] = values[index]; });
          data.push(row);
        }
      }
      this._showImportDialog(data);
    } catch (error) {
      console.error("[FASERIP ERROR] CSV import error:", error);
      ui.notifications.error("Error importing CSV: " + error.message);
    }
  }

  _parseCSVLine(line) {
    const values = [];
    let inQuotes = false;
    let currentValue = "";
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && !inQuotes) { inQuotes = true; }
      else if (char === '"' && inQuotes && line[i+1] === '"') { currentValue += '"'; i++; }
      else if (char === '"' && inQuotes) { inQuotes = false; }
      else if (char === ',' && !inQuotes) { values.push(currentValue); currentValue = ""; }
      else { currentValue += char; }
    }
    values.push(currentValue);
    return values;
  }

  _showImportDialog(data) {
    if (!data || data.length === 0) {
      ui.notifications.warn("No data found in the imported file.");
      return;
    }
    
    const sampleData = data.slice(0, 5);
    const columns = Object.keys(sampleData[0]);
    
    let mappingOptions = '';
    columns.forEach(col => {
      mappingOptions += `
        <div class="form-group">
          <label>${col}:</label>
          <select name="map-${col}">
            <option value="">-- Ignore --</option>
            <option value="realDate" ${col.toLowerCase().includes('date') ? 'selected' : ''}>Real Date</option>
            <option value="gameDate" ${col.toLowerCase().includes('game') ? 'selected' : ''}>Game Date</option>
            <option value="amount" ${col.toLowerCase().includes('amount') || col.toLowerCase().includes('karma') ? 'selected' : ''}>Amount</option>
            <option value="type" ${col.toLowerCase().includes('type') || col.toLowerCase().includes('event') ? 'selected' : ''}>Event Type</option>
            <option value="description" ${col.toLowerCase().includes('desc') ? 'selected' : ''}>Description</option>
          </select>
        </div>
      `;
    });
    
    new Dialog({
      title: "Import Karma History",
      content: `
        <div>
          <p>Map columns from your file to Karma history fields:</p>
          ${mappingOptions}
          <div class="form-group">
            <label>Import Mode:</label>
            <select name="importMode">
              <option value="append">Append to existing history</option>
              <option value="replace">Replace existing history</option>
            </select>
          </div>
        </div>
      `,
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: (html) => {
            const mapping = {};
            columns.forEach(col => {
              const target = html.find(`[name="map-${col}"]`).val();
              if (target) mapping[col] = target;
            });
            const importMode = html.find('[name="importMode"]').val();
            const processedData = data.map(row => {
              const event = {};
              Object.entries(mapping).forEach(([source, target]) => { event[target] = row[source]; });
              if (event.amount) event.amount = Number(event.amount);
              event.timestamp = event.timestamp || new Date().toISOString();
              return event;
            });
            this._importKarmaData(processedData, importMode);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "import"
    }).render(true);
  }

  async _importKarmaData(data, mode) {
    let history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    if (mode === "replace") { history = data; }
    else { history = history.concat(data); }
    await this._updateKarmaHistory(history);
    ui.notifications.info(`Imported ${data.length} karma entries.`);
  }

  _onExportKarma(event) {
    event.preventDefault();
    const history = this.object.system.karma?.history || [];
    if (history.length === 0) {
      ui.notifications.warn("No karma history to export.");
      return;
    }
    
    const headers = ["Real Date", "Game Date", "Amount", "Event Type", "Description"];
    let csv = headers.join(",") + "\n";
    history.forEach(event => {
      const row = [
        `"${event.realDate || ''}"`,
        `"${event.gameDate || ''}"`,
        event.amount || 0,
        `"${event.type || ''}"`,
        `"${(event.description || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(",") + "\n";
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karma-history-${this.object.name.replace(/\s+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  _onSearchInput(ev, html) {
    const query = ev.currentTarget.value.toLowerCase().trim();
    this.searchFilter = query;
    this._applySearchFilter(html, query);
  }

  _onSearchClear(ev, html) {
    ev.preventDefault();
    this.searchFilter = "";
    html.find('.karma-search').val("");
    this._applySearchFilter(html, "");
  }

  _applySearchFilter(html, query) {
    const rows = html.find('.karma-entry');
    let visibleCount = 0;
    rows.each((i, row) => {
      const $row = $(row);
      const text = $row.text().toLowerCase();
      if (!query || text.includes(query)) { $row.show(); visibleCount++; }
      else { $row.hide(); }
    });
    html.find('.search-no-results').remove();
    if (visibleCount === 0 && rows.length > 0 && query) {
      html.find('tbody').append(`<tr class="search-no-results"><td colspan="8" class="empty-message">No matching entries found.</td></tr>`);
    }
    html.find('.karma-search-clear').toggle(query.length > 0);
  }

  _onSortToggle(event) {
    event.preventDefault();
    this.sortNewestFirst = !this.sortNewestFirst;
    this.render();
  }

  // FIX: Edit uses snapshot of original values for matching
  _onEditKarma(index) {
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    
    history.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.realDate || 0);
      const dateB = new Date(b.timestamp || b.realDate || 0);
      return this.sortNewestFirst ? dateB - dateA : dateA - dateB;
    });
    
    if (index < 0 || index >= history.length) return;
    const event = history[index];

    // Snapshot BEFORE dialog opens
    const origTimestamp = event.timestamp;
    const origRealDate = event.realDate;
    const origType = event.type;
    const origAmount = event.amount;
    const origDescription = event.description;
    
    new Dialog({
      title: "Edit Karma Entry",
      content: `
        <form>
          <div class="form-group">
            <label>Real Date:</label>
            <input type="text" name="realDate" value="${event.realDate || ''}" />
          </div>
          <div class="form-group">
            <label>Game Date (optional):</label>
            <input type="text" name="gameDate" value="${event.gameDate || ''}" />
          </div>
          <div class="form-group">
            <label>Event Type:</label>
            <input type="text" name="eventType" value="${event.type || ''}" />
          </div>
          <div class="form-group">
            <label>Amount:</label>
            <input type="number" name="amount" value="${event.amount || 0}" />
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description">${event.description || ''}</textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: (html) => {
            const form = html.find("form")[0];
            const formData = new FormData(form);
            
            // Find in UNSORTED original using ORIGINAL values
            const originalHistory = foundry.utils.deepClone(this.object.system.karma?.history || []);
            const originalIndex = originalHistory.findIndex(e => 
              e.timestamp === origTimestamp &&
              e.realDate === origRealDate &&
              e.type === origType &&
              e.amount === origAmount &&
              e.description === origDescription
            );
            
            const target = originalIndex !== -1 ? originalHistory : history;
            const targetIndex = originalIndex !== -1 ? originalIndex : index;
            
            if (originalIndex === -1) {
              console.warn("[FASERIP WARN] Edit: original entry not found, using sorted fallback");
            }
            
            target[targetIndex].realDate = formData.get("realDate");
            target[targetIndex].gameDate = formData.get("gameDate");
            target[targetIndex].amount = Number(formData.get("amount"));
            target[targetIndex].type = formData.get("eventType");
            target[targetIndex].description = formData.get("description");
            
            this._updateKarmaHistory(target);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "save"
    }).render(true);
  }

  _onDeleteKarma(index) {
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    history.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.realDate || 0);
      const dateB = new Date(b.timestamp || b.realDate || 0);
      return this.sortNewestFirst ? dateB - dateA : dateA - dateB;
    });
    
    if (index < 0 || index >= history.length) return;
    
    new Dialog({
      title: "Confirm Deletion",
      content: `<p>Are you sure you want to delete this karma entry?</p>`,
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Delete",
          callback: () => {
            history.splice(index, 1);
            this._updateKarmaHistory(history);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "cancel"
    }).render(true);
  }

  _updateDeleteSelectedButton(html) {
    const checkedCount = html.find('.select-karma-entry:checked').length;
    const btn = html.find('.delete-selected-karma');
    if (checkedCount > 0) {
      btn.prop('disabled', false);
      btn.html(`<i class="fas fa-trash-alt"></i> Del Sel. (${checkedCount})`);
    } else {
      btn.prop('disabled', true);
      btn.html('<i class="fas fa-trash-alt"></i> Del Sel.');
    }
  }

  _onDeleteSelectedKarma(html) {
    const checkedBoxes = html.find('.select-karma-entry:checked');
    const count = checkedBoxes.length;
    if (count === 0) return;

    const indices = [];
    checkedBoxes.each((i, el) => { indices.push(Number(el.dataset.index)); });

    new Dialog({
      title: "Confirm Deletion",
      content: `<p>Are you sure you want to delete ${count} karma ${count === 1 ? 'entry' : 'entries'}?</p>
                <p style="color: #8b0000; font-weight: bold;">This cannot be undone.</p>`,
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: `Delete ${count} ${count === 1 ? 'Entry' : 'Entries'}`,
          callback: () => {
            const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
            history.sort((a, b) => {
              const dateA = new Date(a.timestamp || a.realDate || 0);
              const dateB = new Date(b.timestamp || b.realDate || 0);
              return this.sortNewestFirst ? dateB - dateA : dateA - dateB;
            });
            indices.sort((a, b) => b - a);
            for (const idx of indices) { history.splice(idx, 1); }
            this._updateKarmaHistory(history);
            ui.notifications.info(`Deleted ${count} karma ${count === 1 ? 'entry' : 'entries'}.`);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "cancel"
    }).render(true);
  }

  _addKarmaEvent(event) {
    if (!event.timestamp) event.timestamp = new Date().toISOString();
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    history.push(event);
    this._updateKarmaHistory(history);
  }

  async _updateKarmaHistory(history) {
    let totalEarned = 0;
    let totalSpent = 0;
    
    history.forEach(event => {
      const amount = Number(event.amount) || 0;
      if (amount > 0) totalEarned += amount;
      else if (amount < 0) totalSpent += Math.abs(amount);
    });
    
    const advancementFund = this.object.system.karma?.advancement || 0;
    const currentKarmaValue = Math.max(0, totalEarned - totalSpent - advancementFund);

    await this.object.update({
      "system.karma.history": history,
      "system.attributes.karma.value": currentKarmaValue,
      "system.karma.lifetime": totalEarned
    });
    
    this.render();
  }
} // end of class KarmaSheet
