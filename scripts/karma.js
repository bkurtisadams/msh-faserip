// karma.js v1.11.0 - 2026-04-17
// v1.11.0: Compact column layout for karma history. Real Date and
//          Game Date columns merged into a single stacked "Date"
//          cell (real-date bold on top, game-date subtle below).
//          Event Type column removed; the label now renders as a
//          compact color-coded pill at the start of the Description
//          cell, reusing the row's existing event-type CSS class.
//          Description column gains ~170px. CSV export unchanged —
//          still emits Real Date and Game Date as separate columns
//          for spreadsheet analysis. Edit dialog unchanged too.
// v1.10.0: Replace v1.9.0 up/down arrows with a drag handle. Arrows
//          required select → click → re-render flow that deselected
//          checkboxes and felt clumsy. HTML5 drag-and-drop on a
//          grip icon lets GM grab a row and drop it anywhere within
//          the same realDate cluster. Cross-date drops are rejected
//          with a notification (edit the realDate to move across
//          days). Visual states: source row 50% opacity during drag,
//          target row shows a red top-border indicating insertion
//          point.
// v1.9.0: (superseded) Up/down arrows in Actions column let GM reorder
//         entries that share a realDate. Replaced by drag handle.
// v1.8.0: History sort prefers user-editable realDate over internal
//         timestamp. Previously `timestamp || realDate || 0` short-
//         circuited on timestamp (always set at creation), so editing
//         an entry's realDate changed the displayed string but not
//         the sort position. New `_historyEntryDate` helper uses
//         realDate first, falling back to timestamp only when realDate
//         is empty/unparseable. Applied to all four sort call sites
//         (getData, edit, delete, bulk delete).
// v1.7.0: Category-based karma multipliers (combat/rescue/personal/gaming/penalty)
//         and group award mode (split/full/pool) via karma-multipliers.js helper.
//         Legacy karmaMultiplier setting preserved as global fallback when a
//         category multiplier is unset. Losses only multiplied if penalty
//         category multiplier > 1. Calc display now shows category tag.
// v1.6.4: Spend Karma dialog now closes when user picks Ability Advancement.
//         Previously it lingered behind the advancement sub-dialog in a useless state.
// v1.6.3: Fix Ability Advancement cost formula. Per RAW (Potato Salad Man example),
//         each +1 point costs 10× the CURRENT numeric value, not 10× the Standard
//         Rank Number. e.g. Good(14)→Good(15) = 140 karma, not 100. Cresting +400
//         still triggers on crossing a rank's range boundary (e.g. 7→8, 15→16).
// v1.6.2: Fix _getNewRank thresholds to use book Rank Ranges.
// v1.6.1: Replace local RANK_MINS/RANK_ORDER with import from rules-reference.js
// v1.6.0: Add missing karma types: Failing Commitment, Leaving Early, Negative Popularity, Commit Robbery
import { RANKS_ORDERED } from "./rules/rules-reference.js";
import { computeKarmaAward, getCategoryMultiplier, getGroupAwardMode, getCategoryForEvent } from "./karma-multipliers.js";

export class KarmaSheet extends DocumentSheet {
  sortNewestFirst = true;
  searchFilter = "";

  // Return a Date for sorting: prefer the user-editable realDate,
  // fall back to timestamp when realDate is missing or unparseable.
  // Never returns null — callers subtract dates directly.
  static _historyEntryDate(entry) {
    if (entry?.realDate) {
      const d = new Date(entry.realDate);
      if (!isNaN(d.getTime())) return d;
    }
    if (entry?.timestamp) {
      const d = new Date(entry.timestamp);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(0);
  }

  // Compact uppercase label for the type pill. Known types get
  // shortened forms; anything else falls back to uppercase.
  static _pillLabel(type) {
    if (!type) return "—";
    const map = {
      "Die Roll": "DIE ROLL",
      "Power Stunt": "STUNT",
      "Session Award": "SESSION",
      "Resource FEAT": "RESOURCE",
      "Popularity FEAT": "POP FEAT",
      "Encounter Award": "ENCOUNTER",
      "Encounter Loss": "ENC. LOSS",
      "Ability Advancement": "ABILITY ADV",
      "Power Advancement": "POWER ADV",
      "Pool Contribution": "POOL +",
      "Pool Withdrawal": "POOL −",
      "Pool Refund": "POOL ↩",
      "Custom": "CUSTOM"
    };
    return map[type] || type.toUpperCase();
  }

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
      const dateA = KarmaSheet._historyEntryDate(a);
      const dateB = KarmaSheet._historyEntryDate(b);
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

      // Compact uppercase label for the pill shown in Description cell.
      // Full type is preserved in event.type for the edit dialog and CSV.
      event.pillLabel = KarmaSheet._pillLabel(event.type);
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

    // Drag-and-drop reordering within same realDate
    html.find('.karma-drag-handle').on('dragstart', ev => {
      const row = ev.currentTarget.closest('tr');
      const idx = Number(row.dataset.index);
      ev.originalEvent.dataTransfer.setData('text/plain', String(idx));
      ev.originalEvent.dataTransfer.effectAllowed = 'move';
      row.classList.add('karma-dragging');
    });
    html.find('.karma-drag-handle').on('dragend', ev => {
      const row = ev.currentTarget.closest('tr');
      if (row) row.classList.remove('karma-dragging');
      html.find('.karma-drag-over').removeClass('karma-drag-over');
    });
    html.find('tr.karma-entry').on('dragover', ev => {
      ev.preventDefault();
      ev.originalEvent.dataTransfer.dropEffect = 'move';
    });
    html.find('tr.karma-entry').on('dragenter', ev => {
      ev.currentTarget.classList.add('karma-drag-over');
    });
    html.find('tr.karma-entry').on('dragleave', ev => {
      ev.currentTarget.classList.remove('karma-drag-over');
    });
    html.find('tr.karma-entry').on('drop', ev => {
      ev.preventDefault();
      const sourceIdx = Number(ev.originalEvent.dataTransfer.getData('text/plain'));
      const targetIdx = Number(ev.currentTarget.dataset.index);
      html.find('.karma-drag-over').removeClass('karma-drag-over');
      if (!isNaN(sourceIdx) && !isNaN(targetIdx)) {
        this._onDropKarmaRow(sourceIdx, targetIdx);
      }
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
      "Failing Commitment": -10, "Leaving Early": -5,
      "Charity - Appearance": 0, "Charity - Act": 0, "Charity - Donation": 0,
      "Negative Popularity": 0,
      "Role-Playing": 10, "Stump the Judge": 15, "Humor Award": 5,
      "Session Award": 0,
      "Commit Violent Crime": -60, "Commit Destructive Crime": -40,
      "Commit Theft": -20, "Commit Robbery": -20, "Commit Misdemeanor": -10,
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
      "Personal Commitment", "Weekly Award", "Failing Commitment", "Leaving Early",
      "Role-Playing", "Stump the Judge",
      "Humor Award", "Charity - Appearance", "Charity - Act", "Charity - Donation",
      "Negative Popularity",
      "Public Defeat", "Private Defeat", "Property Damage",
      "Noble Death", "Mysterious Death", "Self-Destruction", "Death - Kill",
      "Commit Violent Crime", "Commit Destructive Crime", "Commit Theft",
      "Commit Robbery", "Commit Misdemeanor", "Commit National Offense", "Commit Other Crime",
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
        <option value="Failing Commitment">Failing Commitment (-10)</option>
        <option value="Leaving Early">Leaving Early (-5)</option>
        <option value="Weekly Award">Weekly Award (+10)</option>
        <option value="Charity - Appearance">Charity Appearance (+Pop, max 20)</option>
        <option value="Charity - Act">Charity Act (+10-40)</option>
        <option value="Charity - Donation">Charity Donation (+Res rank#)</option>
        <option value="Negative Popularity">Negative Popularity (-Pop rank#)</option>
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
        <option value="Commit Robbery">Commit Robbery (-20)</option>
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
            <div>x<span class="calc-multiplier">${multiplier}</span> <span class="calc-cat" style="color:#666;font-size:0.85em;"></span> = <span class="calc-gross">0</span></div>
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
            
            // Cap negative amounts at current available karma (RAW: karma may not
            // drop below 0 from losses). Advancement fund stays protected because
            // availableKarma already excludes it.
            let finalAmount = amount;
            if (amount < 0) {
              const available = this._getCurrentKarma();
              const cappedLoss = Math.min(Math.abs(amount), available);
              finalAmount = -cappedLoss;
              if (cappedLoss < Math.abs(amount)) {
                ui.notifications.info(
                  `${eventType} loss capped at ${cappedLoss} (would have been ${Math.abs(amount)}; available was ${available}).`
                );
              }
              if (cappedLoss === 0) {
                ui.notifications.info(`${eventType} not recorded — no karma available to lose.`);
                return;
              }
            }

            const karmaEvent = {
              timestamp: new Date().toISOString(),
              realDate: formData.get("realDate"),
              gameDate: formData.get("gameDate"),
              amount: finalAmount,
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
        const groupMode = getGroupAwardMode();
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
              html.find('.karma-split-section').toggle(groupMode === "split");
              html.find('.karma-pool-option').show();
              html.find('.calc-split-line').toggle(groupMode === "split");
            } else {
              html.find('.karma-split-section').hide();
              html.find('.karma-pool-option').hide();
              html.find('.calc-split-line').hide();
            }
          }

          // Compute via helper
          const result = computeKarmaAward({
            eventType: type,
            baseAmount,
            isGroup: isGroup && !isIndividualOnly && !isLoss,
            heroCount: splitCount,
            groupMode
          });
          const catMult = result.multiplier;

          // Update display
          html.find('.calc-base').text(baseAmount);
          html.find('.calc-multiplier').text(catMult);
          html.find('.calc-cat').text(result.category ? `(${result.category})` : '');
          html.find('.calc-gross').text(result.gross);
          html.find('.calc-split-count').text(splitCount);
          html.find('.calc-split-result').text(result.perHero);

          // Hide calculation for losses and custom
          if (isLoss || type === "Custom" || type === "Death - Kill") {
            html.find('.karma-calculation').hide();
          } else {
            html.find('.karma-calculation').show();
          }

          html.find('[name="amount"]').val(result.perHero);
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
    
    const dlg = new Dialog({
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

            // Ability Advancement uses its own sub-dialog — parent already closed
            // when dropdown selected it; this is just a safety guard.
            if (spendType === "Ability Advancement") return;

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

          // Ability Advancement → hand off to sub-dialog and close this one.
          // The remaining fields (Amount/Description) don't apply to advancement.
          if (type === "Ability Advancement") {
            dlg.close();
            this._onAbilityAdvancement();
            return;
          }

          let amount = 10;
          let placeholder = "Describe what you're spending karma on...";
          
          switch(type) {
            case "Die Roll": amount = 10; placeholder = "e.g., Spent on Fighting FEAT roll"; break;
            case "Reduce Effect": amount = 50; placeholder = "e.g., Reduced Kill to Yellow on energy blast"; break;
            case "Power Stunt": amount = 100; placeholder = "e.g., Used Telekinesis to lift a building"; break;
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
    });
    dlg.render(true);
  }

  /**
   * Ability Advancement sub-dialog.
   * Calculates cost per RAW: 10 × rank number per point, +400 cresting when crossing a rank boundary.
   * Updates the ability value/rank and logs a detailed karma history entry.
   */
  _onAbilityAdvancement() {
    const actor = this.object;
    const availableKarma = this._getCurrentKarma();
    const abilities = actor.system.abilities;

    // Rank Range MINIMUMS per Advanced Set book table — used to identify
    // which rank a numeric value falls into. (NOT the Standard Rank Numbers.)
    // Rank identification uses Rank Range minimums — see _getNewRank below.
    // Cost formula: 10 × current numeric value per point (RAW).
    const RANK_ORDER = RANKS_ORDERED;
    const abilityKeys = ["fighting","agility","strength","endurance","reason","intuition","psyche"];

    // Abbreviate rank for compact display
    const abbrevRank = (rank) => {
      const map = {
        "Shift-0":"Sh0","Feeble":"Fe","Poor":"Pr","Typical":"Ty","Good":"Gd","Excellent":"Ex",
        "Remarkable":"Rm","Incredible":"In","Amazing":"Am","Monstrous":"Mn","Unearthly":"Un",
        "Shift-X":"ShX","Shift-Y":"ShY","Shift-Z":"ShZ",
        "Class 1000":"C1k","Class 3000":"C3k","Class 5000":"C5k","Beyond":"Bey"
      };
      return map[rank] || rank;
    };

    const calcAdvancementCost = (startValue, targetValue) => {
      const points = targetValue - startValue;
      if (points <= 0) return { total: 0, points: 0, newValue: startValue, newRank: this._getNewRank(startValue), lines: [] };
      // Per RAW: each +1 point costs 10× the CURRENT value (not the rank's Standard Rank Number).
      // Book example: Good(14)→Good(15) costs 140. Good(15)→Excellent(16) costs 150+400=550.
      // Cresting adds 400 the moment the value crosses into a new rank's range.
      let total = 0;
      let lines = [];
      let cv = startValue;
      let curRank = this._getNewRank(cv);
      let segStart = cv;
      let segTotal = 0;

      for (let i = 0; i < points; i++) {
        const pointCost = 10 * cv;
        total += pointCost;
        segTotal += pointCost;
        const nv = cv + 1;
        const nRank = this._getNewRank(nv);

        if (nRank !== curRank) {
          // Close segment: show "X pts (start-end) at RankAbbrev"
          const segPts = nv - segStart;
          lines.push({
            label: `${segPts} pt${segPts > 1 ? "s" : ""} at ${abbrevRank(curRank)} (${segStart}→${nv-1 === segStart ? nv : nv})`,
            cost: segTotal
          });
          lines.push({ label: `Cresting: ${curRank} → ${nRank}`, cost: 400, cresting: true });
          total += 400;
          curRank = nRank;
          segStart = nv;
          segTotal = 0;
        }
        cv = nv;
      }
      // Close final segment
      const segPts = cv - segStart;
      if (segPts > 0) {
        lines.push({
          label: `${segPts} pt${segPts > 1 ? "s" : ""} at ${abbrevRank(curRank)} (${segStart}→${cv})`,
          cost: segTotal
        });
      }

      return { total, points, newValue: targetValue, newRank: this._getNewRank(targetValue), lines };
    };

    // Build current ability options: "Fighting Ex (20)"
    const currentOptions = abilityKeys.map(k => {
      const a = abilities[k];
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      return `<option value="${k}">${label} ${abbrevRank(a.rank)} (${a.value})</option>`;
    }).join("");

    // Scoped CSS prefix to avoid Foundry collisions
    const S = "ka-adv";

    new Dialog({
      title: `Ability Advancement: ${actor.name}`,
      content: `
        <div class="${S}-wrap" style="all:initial;font-family:inherit;font-size:13px;color:#333;line-height:1.4;min-width:480px;">
          <style>
            .${S}-wrap *{box-sizing:border-box;}
            .${S}-wrap select,.${S}-wrap input[type=number],.${S}-wrap input[type=text]{
              font-family:inherit;font-size:13px;color:#333;background:#fff;
              border:1px solid #bbb;border-radius:3px;padding:4px 8px;margin:0;
              height:28px;line-height:28px;
            }
            .${S}-wrap select{padding-right:20px;cursor:pointer;}
            .${S}-wrap input[type=number]{width:70px;text-align:center;-moz-appearance:textfield;}
            .${S}-wrap input[type=number]::-webkit-inner-spin-button,
            .${S}-wrap input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
            .${S}-wrap input[type=text]{width:100%;}
            .${S}-wrap label{font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px;}
            .${S}-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
            .${S}-calc{background:#faf8f2;border:1px solid #c0a070;border-radius:4px;padding:8px 10px;margin:10px 0;min-height:60px;}
            .${S}-calc-line{display:flex;justify-content:space-between;padding:2px 0;font-size:12px;color:#555;}
            .${S}-calc-line.cresting{color:#8b0000;}
            .${S}-calc-total{display:flex;justify-content:space-between;padding:4px 0 0;margin-top:4px;border-top:1px solid #c0a070;font-weight:bold;font-size:13px;color:#333;}
            .${S}-insuf{color:#c62828;font-weight:bold;font-size:12px;margin-top:4px;}
            .${S}-avail{font-size:13px;font-weight:bold;margin-bottom:10px;color:#333;}
          </style>

          <div class="${S}-avail">Available Karma: ${availableKarma}</div>

          <div class="${S}-row">
            <div style="flex:1;">
              <label>Current ability</label>
              <select name="ability" style="width:100%;">${currentOptions}</select>
            </div>
            <div style="padding-top:16px;color:#999;font-size:16px;">→</div>
            <div>
              <label>Target</label>
              <div style="display:flex;align-items:center;gap:4px;">
                <span class="${S}-target-rank" style="font-size:12px;color:#555;min-width:24px;text-align:right;"></span>
                <input type="number" name="targetValue" value="" min="1" max="9999" title="Mousewheel to adjust" />
              </div>
            </div>
          </div>

          <div class="${S}-calc">
            <div class="${S}-calc-content"></div>
          </div>

          <div style="margin-bottom:6px;">
            <label>Rationale</label>
            <input type="text" name="rationale" placeholder="e.g., Intensive training with Captain America" />
          </div>
        </div>
      `,
      buttons: {
        advance: {
          icon: '<i class="fas fa-arrow-up"></i>',
          label: "Advance",
          callback: async (html) => {
            const abilityKey = html.find('[name="ability"]').val();
            const targetValue = Number(html.find('[name="targetValue"]').val());
            const rationale = html.find('[name="rationale"]').val()?.trim() || "";
            const abilityData = abilities[abilityKey];
            const abilityLabel = abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1);
            const startValue = abilityData.value;
            const startRank = abilityData.rank;

            if (targetValue <= startValue) {
              ui.notifications.error("Target must be higher than current value.");
              return;
            }

            const cost = calcAdvancementCost(startValue, targetValue);

            if (cost.total > availableKarma) {
              ui.notifications.error(`Not enough karma. Need ${cost.total}, have ${availableKarma}.`);
              return;
            }
            if (cost.total <= 0) {
              ui.notifications.error("Cannot calculate advancement cost.");
              return;
            }

            const rankChanged = cost.newRank !== startRank;
            let desc = `${abilityLabel}: ${startValue} (${startRank}) → ${cost.newValue} (${cost.newRank})`;
            desc += ` | ${cost.points} pt${cost.points > 1 ? "s" : ""} | Cost: ${cost.total}`;
            if (rankChanged) {
              const crestCount = cost.lines.filter(l => l.cresting).length;
              const crestTotal = crestCount * 400;
              desc += ` (includes ${crestTotal} cresting)`;
            }
            if (rationale) desc += ` | ${rationale}`;

            // Rationale warning
            const initialRank = abilityData.initialRank || startRank;
            const initialIdx = RANK_ORDER.indexOf(initialRank);
            const newIdx = RANK_ORDER.indexOf(cost.newRank);
            const exIdx = RANK_ORDER.indexOf("Excellent");
            const needsRationale = newIdx > exIdx || (initialIdx >= 0 && newIdx > initialIdx + 1);
            if (needsRationale && !rationale) {
              ui.notifications.warn("RAW: advancing beyond Excellent or +1 rank above original requires a rationale. Proceeding anyway.");
            }

            await actor.update({
              [`system.abilities.${abilityKey}.value`]: cost.newValue,
              [`system.abilities.${abilityKey}.rank`]: cost.newRank
            });

            this._addKarmaEvent({
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: this._getGameDate(),
              amount: -cost.total,
              type: "Ability Advancement",
              description: desc
            });

            ui.notifications.info(`${actor.name}: ${abilityLabel} advanced to ${cost.newValue} (${cost.newRank}) for ${cost.total} karma.`);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "advance",
      render: (html) => {
        const updateCalc = () => {
          const abilityKey = html.find('[name="ability"]').val();
          const abilityData = abilities[abilityKey];
          const startValue = abilityData.value;
          const targetValue = Number(html.find('[name="targetValue"]').val());

          // Update target rank display
          if (targetValue > 0) {
            html.find(`.${S}-target-rank`).text(abbrevRank(this._getNewRank(targetValue)));
          } else {
            html.find(`.${S}-target-rank`).text("");
          }

          if (targetValue <= startValue) {
            html.find(`.${S}-calc-content`).html(
              `<div style="color:#999;font-size:12px;">Set a target value above ${startValue} to see costs.</div>`
            );
            return;
          }

          const cost = calcAdvancementCost(startValue, targetValue);
          let h = "";
          for (const line of cost.lines) {
            const cls = line.cresting ? ` cresting` : "";
            h += `<div class="${S}-calc-line${cls}"><span>${line.label}</span><span>${line.cost.toLocaleString()}</span></div>`;
          }
          h += `<div class="${S}-calc-total"><span>Total</span><span>${cost.total.toLocaleString()} karma</span></div>`;
          if (cost.total > availableKarma) {
            h += `<div class="${S}-insuf">Insufficient karma (need ${(cost.total - availableKarma).toLocaleString()} more)</div>`;
          }
          html.find(`.${S}-calc-content`).html(h);
        };

        // When ability changes, reset target to current+1
        html.find('[name="ability"]').change(() => {
          const abilityKey = html.find('[name="ability"]').val();
          const startValue = abilities[abilityKey].value;
          html.find('[name="targetValue"]').val(startValue + 1);
          updateCalc();
        });

        html.find('[name="targetValue"]').on('input change', updateCalc);

        // Mousewheel on target value
        html.find('[name="targetValue"]').on('wheel', (ev) => {
          ev.preventDefault();
          const input = ev.currentTarget;
          const abilityKey = html.find('[name="ability"]').val();
          const minVal = abilities[abilityKey].value + 1;
          let val = Number(input.value) || minVal;
          val += (ev.originalEvent.deltaY < 0) ? 1 : -1;
          val = Math.max(minVal, val);
          input.value = val;
          updateCalc();
        });

        // Initialize
        const initKey = html.find('[name="ability"]').val();
        html.find('[name="targetValue"]').val(abilities[initKey].value + 1);
        updateCalc();
      }
    }).render(true);
  }

  _getNewRank(value) {
    // Rank Range thresholds per Advanced Set book table (NOT Standard Rank Numbers).
    if (value >= 10000) return "Beyond";
    if (value >= 5000) return "Class 5000";
    if (value >= 3000) return "Class 3000";
    if (value >= 1000) return "Class 1000";
    if (value >= 351) return "Shift-Z";
    if (value >= 176) return "Shift-Y";
    if (value >= 126) return "Shift-X";
    if (value >= 88) return "Unearthly";
    if (value >= 63) return "Monstrous";
    if (value >= 46) return "Amazing";
    if (value >= 36) return "Incredible";
    if (value >= 26) return "Remarkable";
    if (value >= 16) return "Excellent";
    if (value >= 8) return "Good";
    if (value >= 5) return "Typical";
    if (value >= 3) return "Poor";
    if (value >= 1) return "Feeble";
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
      const dateA = KarmaSheet._historyEntryDate(a);
      const dateB = KarmaSheet._historyEntryDate(b);
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

  _onDropKarmaRow(sourceIdx, targetIdx) {
    if (sourceIdx === targetIdx) return;
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    history.sort((a, b) => {
      const dateA = KarmaSheet._historyEntryDate(a);
      const dateB = KarmaSheet._historyEntryDate(b);
      return this.sortNewestFirst ? dateB - dateA : dateA - dateB;
    });

    if (sourceIdx < 0 || sourceIdx >= history.length) return;
    if (targetIdx < 0 || targetIdx >= history.length) return;

    const source = history[sourceIdx];
    const target = history[targetIdx];

    // Cross-date drops require editing the realDate, not reorder.
    // This keeps the log readable: position always reflects date.
    if ((source.realDate || "") !== (target.realDate || "")) {
      ui.notifications.info("Entries can only be reordered within the same date. Edit the date to move across days.");
      return;
    }

    // Insert-at-target semantics: remove source, re-insert at target's
    // current position (adjusted if source was above target).
    history.splice(sourceIdx, 1);
    const adjustedTarget = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
    history.splice(adjustedTarget, 0, source);

    this._updateKarmaHistory(history);
  }

  _onDeleteKarma(index) {
    const history = foundry.utils.deepClone(this.object.system.karma?.history || []);
    history.sort((a, b) => {
      const dateA = KarmaSheet._historyEntryDate(a);
      const dateB = KarmaSheet._historyEntryDate(b);
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
              const dateA = KarmaSheet._historyEntryDate(a);
              const dateB = KarmaSheet._historyEntryDate(b);
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