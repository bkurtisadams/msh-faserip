// actorSheet.js v2.1.0 - 2026-02-20
// v2.1.0: Equipment tab - group by category, hide empty groups, decode damage type codes
// v2.0.0: Fix equipment roll routing for Energy/Force/Grappling/Grabbing damage types
// v1.9.0: Log Resource and Popularity FEATs to karma history
// v1.8.0: Add clickable Teleport label for movement FEAT dialog
// v1.7.0: Add clickable Swim label for movement FEAT dialog
// v1.6.0: Add clickable Run label for movement FEAT dialog
// v1.5.0: Refactor movement FEAT dialogs to separate movement-feats.js module
// v1.4.0: Add clickable Fly label with FEAT dialog for flight maneuvers
// v1.3.0: Add clickable Leap label with FEAT dialog for movement rolls
// v1.2.0: Fix ability FEAT karma to use two-phase system per rules (declare before, decide amount after roll)
// v1.1.0: Add visual indicators for Endurance impairment and reduced health max (dying state)
// v1.0.2: Fix column shift persistence in blunt attack dialog
// v1.0.1: Remove verbose debug logging on sheet render
import { prepareActiveEffectCategories, onManageActiveEffect } from "../helpers/effects.mjs";
import { getItemMaterialRank, getBluntNextRankMinRule } from "./gm-utils.js";
import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { ACTION_INFO } from "./modules/actions/action-config.js";
import { StuntRoller } from './stunts.js';
import { rollUniversalTable } from "./modules/dice/universal-table.js";
import { ChargenUIManager } from './chargen.js';
import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma } from './modules/dice/dice-roller.js';
import { MovementFeats } from './movement-feats.js';


function getPopularityRankWithRange(value, context) {
  const rank = context._getPopularityRank(value);
  const ranges = {
    "Feeble": "1–2",
    "Poor": "3–4",
    "Typical": "5–7",
    "Good": "8–15",
    "Excellent": "16–25",
    "Remarkable": "26–35",
    "Incredible": "36–45",
    "Amazing": "46–62",
    "Monstrous": "63–87",
    "Unearthly": "88–125",
    "Shift-X": "126–175",
    "Shift-Y": "176–350",
    "Shift-Z": "351–999",
    "Class 1000": "1000–2999",
    "Class 3000": "3000–4999",
    "Class 5000": "5000+"
  };
  return `${rank} (${ranges[rank] || "?"})`;
}

/**
 * Applies a column shift to a FASERIP rank and returns the new rank and its base value.
 * @param {string} rankName - The current rank (e.g. "Amazing")
 * @param {number} currentValue - The current numeric value (e.g. 46)
 * @param {number} csShift - Number of column shifts (positive or negative)
 * @returns {{ rank: string, value: number }}
 */
// scripts/actorSheet.js  — replace the whole function with this version
export function applyColumnShiftToRank(rankName, currentValue, csShift) {
  // Keep the canonical list here
  const rankList = [
    { name: "Shift-0", min: 0 },
    { name: "Feeble", min: 1 },
    { name: "Poor", min: 3 },
    { name: "Typical", min: 5 },
    { name: "Good", min: 8 },
    { name: "Excellent", min: 16 },
    { name: "Remarkable", min: 26 },
    { name: "Incredible", min: 36 },
    { name: "Amazing", min: 46 },
    { name: "Monstrous", min: 63 },
    { name: "Unearthly", min: 88 },
    { name: "Shift-X", min: 126 },
    { name: "Shift-Y", min: 176 },
    { name: "Shift-Z", min: 351 },
    { name: "Class 1000", min: 1000 },
    { name: "Class 3000", min: 3000 },
    { name: "Class 5000", min: 5000 },
    { name: "Beyond", min: 9999 }
  ];

  // --- normalize input names so "Shift X" and "Shift-X" match
  const normalize = (s) => {
    if (!s) return s;
    return s
      .replace(/^Shift\s*X$/i, "Shift-X")
      .replace(/^Shift\s*Y$/i, "Shift-Y")
      .replace(/^Shift\s*Z$/i, "Shift-Z")
      .replace(/^Shift\s*0$/i, "Shift-0");
  };

  const normalizedName = normalize(rankName);

  // 1) Try exact name match
  let index = rankList.findIndex(r => r.name === normalizedName);

  // 2) Fallback by value: pick the HIGHEST rank whose min <= value
  if (index === -1) {
    if (typeof currentValue === "number" && !Number.isNaN(currentValue)) {
      for (let i = rankList.length - 1; i >= 0; i--) {
        if (currentValue >= rankList[i].min) { index = i; break; }
      }
    }
    if (index === -1) index = 0;
  }

  // Apply column shift and clamp
  const newIndex = Math.max(0, Math.min(rankList.length - 1, index + (csShift || 0)));
  const newRank = rankList[newIndex];

  return { rank: newRank.name, value: newRank.min };
}


export class FaseripActorSheet extends ActorSheet {
  // Add a property to track the biography toggle state
  _isBiographyOpen = false;
  
  // Add a property for the character creation manager
  _charCreationManager = null; // NEW PROPERTY

    // Track the in-sheet Universal Table hook
  _universalTableHookId = null;

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      width: 700,
      height: 800,
      tabs: [{ navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", initial: "powers" },
        { navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", tab: "create-character", label: "Creator" }],
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    const actorData = this.actor.toObject(false);

    context.system = actorData.system;
    context.flags = this.actor.flags;

    // Get items sorted by type for display in the template
    context.powers = this.actor.items.filter(item => item.type === "power") || [];
    context.powers = this.actor.items
    .filter(item => item.type === "power")
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // make talents sortable within the talents tab
    context.talents = this.actor.items
      .filter(item => item.type === "talent")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // get contacts & make sortable
    context.contacts = this.actor.items
      .filter(item => item.type === "contact")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Use availableKarma getter for the bottom left display (lifetime calculation)
    context.availableKarma = this.actor.availableKarma;

    // Keep currentKarma for R+I+P display if needed elsewhere
    context.currentKarma = this.actor.currentKarma;

    // the biography toggle state to the context
    context.isBiographyOpen = this._isBiographyOpen;

    // equipment made sortable
    context.equipment = this.actor.items
      .filter(item => item.type === "equipment")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // headquarters made sortable
    context.headquarters = this.actor.items
      .filter(item => item.type === "headquarters")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // vehicles made sortable
    context.vehicles = this.actor.items
      .filter(item => item.type === "vehicle")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Add ranks array for dropdowns
    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    // active effects
    context.effects = prepareActiveEffectCategories(
      this.actor.allApplicableEffects ? this.actor.allApplicableEffects() : this.actor.effects
    );

    context.editable = this.isEditable;
    context.isBiographyOpen = this._isBiographyOpen;

    // karma - FIX: Define karma variable first
    const karma = context.system.karma || {};
    const lifetime = karma.lifetime || 0;
    const advancement = karma.advancement || 0;
    
    // Get shared team karma pool from settings
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    // Individual contribution tracking (for reference)
    context.poolContribution = karma.poolContribution || 0;

    let spent = 0;
    if (Array.isArray(karma.history)) {
      for (const event of karma.history) {
        if (event.amount < 0) spent += Math.abs(event.amount);
      }
    }

    // Apply initial columns visibility preference
    context.hideInitialColumns = this.actor.getFlag('msh-faserip', 'hideInitialColumns') || false;

    // Movement data for template
    context.suggestedMovement = this.actor.suggestedMovement;
    context.leapingData = this.actor.leapingData;
    context.movementInfo = this.actor.movementInfo;

    context.availableKarma = Math.max(0, lifetime - spent - advancement);
    
    // Check for Endurance impairment (from Dying state)
    const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    const impairedEffect = this.actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
    const dyingEffect = this.actor.effects.find(e => e.getFlag(scope, "isDying") || e.statuses?.has?.("dying"));
    
    if (impairedEffect || dyingEffect) {
      const originalEndurance = impairedEffect?.getFlag(scope, "originalEndurance") || 
                                dyingEffect?.getFlag(scope, "originalEndurance") ||
                                this.actor.getFlag(scope, "originalEndurance");
      const currentEndurance = context.system.abilities?.endurance?.rank;
      
      context.isEnduranceImpaired = originalEndurance && originalEndurance !== currentEndurance;
      context.originalEndurance = originalEndurance;
      context.currentEndurance = currentEndurance;
      
      // Calculate original health max from original endurance
      if (originalEndurance) {
        const rankValues = {
          "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
          "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
          "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
          "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000, "Beyond": 10000
        };
        const originalEnduranceValue = rankValues[originalEndurance] || 0;
        const currentEnduranceValue = context.system.abilities?.endurance?.value || 0;
        const healthMaxDiff = originalEnduranceValue - currentEnduranceValue;
        context.originalHealthMax = context.system.attributes.health.max + healthMaxDiff;
        context.healthMaxReduced = healthMaxDiff > 0;
      }
    } else {
      context.isEnduranceImpaired = false;
      context.healthMaxReduced = false;
    }
    
    // Check for Dying state
    context.isDying = !!dyingEffect;

    // Crisis row visibility: show Wake Up / Stabilize only when relevant
    const currentHP = context.system?.attributes?.health?.value ?? 1;
    context.isInCrisis = context.isDying || currentHP === 0;

    // Recovery button: disable if already used today
    const lastRecoveryDate = this.actor.getFlag(scope, "lastRecoveryDate");
    context.recoveryUsedToday = lastRecoveryDate === new Date().toDateString();

    // Healing button: disable if health at max, no damage recorded, or still on 1-hour cooldown
    const hpValue = context.system?.attributes?.health?.value ?? 0;
    const hpMax = context.system?.attributes?.health?.max ?? 0;
    const lastDamageWorldTime = this.actor.getFlag(scope, "lastDamageWorldTime");
    const worldNow = game.time?.worldTime ?? 0;
    const timeSinceDamage = (lastDamageWorldTime != null) ? (worldNow - lastDamageWorldTime) : -1;
    const healingCooldownRemaining = (timeSinceDamage >= 0 && timeSinceDamage < 3600)
      ? Math.ceil((3600 - timeSinceDamage) / 60) : 0;
    context.healthAtMax = hpMax > 0 && hpValue >= hpMax;
    context.healingUnavailable = context.healthAtMax || lastDamageWorldTime == null || healingCooldownRemaining > 0;
    context.healingCooldownRemaining = healingCooldownRemaining;
    
    return context;
  }

  async _toggleSheetLock(html) {
    const currentLock = this.actor.getFlag('msh-faserip', 'sheetLocked') || false;
    const newLock = !currentLock;
    
    await this.actor.setFlag('msh-faserip', 'sheetLocked', newLock);
    
    const form = html.closest('.faserip-sheet');
    if (newLock) {
      form.addClass('sheet-locked');
    } else {
      form.removeClass('sheet-locked');
    }
    
    const lockButton = html.find('.sheet-lock-toggle');
    const lockIcon = lockButton.find('i');
    
    if (newLock) {
      lockButton.addClass('locked');
      lockButton.attr('title', 'Unlock Sheet');
      lockIcon.removeClass('fa-lock-open').addClass('fa-lock');
    } else {
      lockButton.removeClass('locked');
      lockButton.attr('title', 'Lock Sheet');
      lockIcon.removeClass('fa-lock').addClass('fa-lock-open');
    }
  }

  /**
   * Apply visual indicators for Endurance impairment and health max reduction
   * Called from activateListeners to highlight affected fields
   */
  _applyImpairmentIndicators(html) {
    const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    const impairedEffect = this.actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
    const dyingEffect = this.actor.effects.find(e => e.getFlag(scope, "isDying") || e.statuses?.has?.("dying"));
    
    // Get original endurance for comparison
    const originalEndurance = impairedEffect?.getFlag(scope, "originalEndurance") || 
                              dyingEffect?.getFlag(scope, "originalEndurance") ||
                              this.actor.getFlag(scope, "originalEndurance");
    const currentEndurance = this.actor.system?.abilities?.endurance?.rank;
    const isImpaired = originalEndurance && originalEndurance !== currentEndurance;
    
    // Style for impaired/dying state
    const impairedStyle = "background: #ffebee !important; border-color: #ef5350 !important;";
    const dyingStyle = "background: #ffcdd2 !important; border-color: #c62828 !important;";
    
    // Apply to Endurance row (the E row in the abilities table)
    const enduranceRow = html.find('tr').filter(function() {
      return $(this).find('.ability-key').text().trim() === 'E';
    });
    
    if (dyingEffect) {
      // Dying state - more severe styling
      enduranceRow.find('select, input').css('cssText', dyingStyle);
      enduranceRow.find('.ability-key').css('cssText', 'background: #c62828 !important; color: white !important;');
      
      // Add tooltip showing original value
      if (originalEndurance) {
        enduranceRow.find('select[name="system.abilities.endurance.rank"]')
          .attr('title', `DYING - Originally: ${originalEndurance}`);
      }
    } else if (isImpaired) {
      // Impaired state - warning styling
      enduranceRow.find('select, input').css('cssText', impairedStyle);
      enduranceRow.find('.ability-key').css('cssText', 'background: #ef5350 !important; color: white !important;');
      
      // Add tooltip showing original value
      enduranceRow.find('select[name="system.abilities.endurance.rank"]')
        .attr('title', `Impaired - Originally: ${originalEndurance}`);
    }
    
    // Apply to Health display if max is reduced
    if (isImpaired || dyingEffect) {
      const healthSection = html.find('.sec-col.health');
      const healthMaxInput = healthSection.find('input[name="system.attributes.health.max"]');
      
      // Calculate original health max
      const rankValues = {
        "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
        "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
        "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
        "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000, "Beyond": 10000
      };
      const originalEnduranceValue = rankValues[originalEndurance] || 0;
      const currentEnduranceValue = this.actor.system?.abilities?.endurance?.value || 0;
      const currentHealthMax = this.actor.system?.attributes?.health?.max || 0;
      const originalHealthMax = currentHealthMax + (originalEnduranceValue - currentEnduranceValue);
      
      if (originalEnduranceValue > currentEnduranceValue) {
        if (dyingEffect) {
          healthMaxInput.css('cssText', dyingStyle);
          healthSection.find('.sec-head').css('cssText', 'background: #c62828 !important; color: white !important;');
        } else {
          healthMaxInput.css('cssText', impairedStyle);
          healthSection.find('.sec-head').css('cssText', 'background: #ef5350 !important; color: white !important;');
        }
        healthMaxInput.attr('title', `Reduced from ${originalHealthMax} due to Endurance loss`);
      }
      
      // Also check if current health exceeds new max and highlight
      const currentHealth = this.actor.system?.attributes?.health?.value || 0;
      if (currentHealth > currentHealthMax) {
        const healthValueInput = healthSection.find('input[name="system.attributes.health.value"]');
        healthValueInput.css('cssText', 'background: #fff3e0 !important; border-color: #ff9800 !important;');
        healthValueInput.attr('title', `Health (${currentHealth}) exceeds max (${currentHealthMax})`);
      }
    }
  }

  /** @override */
  _updateObject(event, formData) {
    // Expand the form data
    const expandedData = foundry.utils.expandObject(formData);

    // Call the parent update
    return super._updateObject(event, expandedData);
  }

  // Replace your existing _onDragStart method with this one
  _onDragStart(event) {
    // Don't process if shift key is held (let the specific item handlers manage sorting)
    if (event.shiftKey) return;
    
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (item) {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "FaseripItem",  // Changed from "Item"
        actorId: this.actor.id,
        itemId: item.id,
        uuid: item.uuid,
        data: item
      }));
    }
  }
  
  // This is separate from the async close method on UniversalTablePopout at the bottom of the file; don’t touch that one.
  async close(options = {}) {
    // Unregister the in-sheet Universal Table hook when the sheet closes
    if (this._universalTableHookId) {
      Hooks.off('msh-faserip.universalTableRoll', this._universalTableHookId);
      this._universalTableHookId = null;
    }
    return super.close(options);
  }

  // In actorSheet.js, add to the activateListeners function
  activateListeners(html) {
    super.activateListeners(html);

    // Inline item-field edits (e.g. shotsRemaining count on equipment rows)
    html.find('.item-field').change(async ev => {
      const input  = ev.currentTarget;
      const itemId = input.dataset.itemId;
      const field  = input.name;          // e.g. "system.shotsRemaining"
      const value  = Number(input.value);
      if (!itemId || !field) return;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      await item.update({ [field]: value });
    });

    // Apply visual indicators for Endurance impairment and health max reduction
    this._applyImpairmentIndicators(html);

    // Initialize Character Generation Tab
    this._initChargenTab(html);

    // Sheet lock toggle
    html.find('.sheet-lock-toggle').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this._toggleSheetLock(html);
    });

    const isLocked = this.actor.getFlag('msh-faserip', 'sheetLocked') || false;
    if (isLocked) {
      html.closest('.faserip-sheet').addClass('sheet-locked');
    }

    // Movement info chat button
    html.find('.movement-chat-btn').on('click', (event) => {
      event.preventDefault();
      this._sendMovementToChat();
    });

    // Movement label click handlers (for FEAT dialogs)
    html.find('.movement-label.clickable').on('click', (event) => {
      event.preventDefault();
      const movementType = event.currentTarget.dataset.movement;
      
      // Lazy-initialize MovementFeats helper
      if (!this._movementFeats) {
        this._movementFeats = new MovementFeats(this);
      }
      
      switch (movementType) {
        case 'leap':
          this._movementFeats.showLeapDialog();
          break;
        case 'fly':
          this._movementFeats.showFlyDialog();
          break;
        case 'run':
          this._movementFeats.showRunDialog();
          break;
        case 'swim':
          this._movementFeats.showSwimDialog();
          break;
        case 'teleport':
          this._movementFeats.showTeleportDialog();
          break;
      }
    });

    // Auto-populate Resources value when rank changes
    html.find('select[name="system.attributes.resources.rank"]').change((event) => {
      const selectedRank = $(event.currentTarget).val();
      
      const rankList = [
        { name: "Shift-0", min: 0 },
        { name: "Feeble", min: 1 },
        { name: "Poor", min: 3 },
        { name: "Typical", min: 5 },
        { name: "Good", min: 8 },
        { name: "Excellent", min: 16 },
        { name: "Remarkable", min: 26 },
        { name: "Incredible", min: 36 },
        { name: "Amazing", min: 46 },
        { name: "Monstrous", min: 63 },
        { name: "Unearthly", min: 88 }
      ];
      
      const rank = rankList.find(r => r.name === selectedRank);
      if (rank) {
        html.find('input[name="system.attributes.resources.value"]').val(rank.min);
        this.actor.update({ "system.attributes.resources.value": rank.min });
      }
    });

    // Hide initial roll/rank columns functionality
    const $table = html.find('.primary-abilities .abilities-table');
    const $section = html.find('.abilities-section');

    // Apply saved initial columns visibility state
    const hideInitialColumns = this.actor.getFlag('msh-faserip', 'hideInitialColumns');
    if (hideInitialColumns) {
      $table.addClass('initial-hidden');
      $section.addClass('initial-hidden');
    }

    // Ctrl+click either "Initial" header (keep this existing functionality)
    html.find('.primary-abilities .abilities-table thead th.initial.toggle-header').on('click', ev => {
      if (!ev.ctrlKey) return;
      $table.toggleClass('initial-hidden');
      $section.toggleClass('initial-hidden');
    });

    // Click the icon to toggle initial columns visibility
    // Click the icon to toggle initial columns visibility
html.find('.primary-abilities thead').on('click', '.initial-columns-toggle', (event) => {
  console.log('=== INITIAL COLUMNS TOGGLE CLICKED ===');
  console.log('Event:', event);
  console.log('Target:', event.target);
  console.log('CurrentTarget:', event.currentTarget);
  
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  
  const wasHidden = $table.hasClass('initial-hidden');
  console.log('Before toggle - Table has initial-hidden:', wasHidden);
  console.log('Before toggle - Section has initial-hidden:', $section.hasClass('initial-hidden'));
  
  $table.toggleClass('initial-hidden');
  $section.toggleClass('initial-hidden');
  
  const nowHidden = $table.hasClass('initial-hidden');
  console.log('After toggle - Table has initial-hidden:', nowHidden);
  console.log('After toggle - Section has initial-hidden:', $section.hasClass('initial-hidden'));
  
  // Save preference
  this.actor.setFlag('msh-faserip', 'hideInitialColumns', nowHidden);
  console.log('Flag saved:', nowHidden);
  console.log('=== END TOGGLE ===\n');
  
  return false;
});

    // Universal Table tab - CTRL+click opens legacy dialog, SHIFT+click opens popout
    html.find('a[data-tab="universal-table"]').on('click', (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        game.msh.openUniversalTableDialog?.(this.actor);
        return false;
      }
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        this._openUniversalTablePopout();
        return false;
      }
      // Normal click: let Foundry handle tab switching
    });

    // Listen for universal table rolls so the in-sheet tab also highlights results
    if (!this._universalTableHookId) {
      this._onSheetUniversalTableRoll; // keep method bound to this instance
      this._universalTableHookId = Hooks.on('msh-faserip.universalTableRoll', (data) => {
        this._onSheetUniversalTableRoll(data);
      });
    }

    html.find('.open-team-tracker').click(ev => {
      import('./teamSheet.js').then(module => {
        const sheet = new module.TeamSheet();
        sheet.render(true);
      });
    });
    // Recovery & Rest Button Handlers
    html.find('.recovery-btn').click(async (event) => {
      event.preventDefault();
      const button = $(event.currentTarget);
      const action = button.data('action');
      
      // Check if rest system is available
      if (!game.msh?.rest) {
        ui.notifications.error("Rest system not initialized!");
        return;
      }
      
      switch(action) {
        case 'recovery':
          await game.msh.rest.attemptRecovery(this.actor);
          break;
          
        case 'healing':
          await game.msh.rest.attemptHealing(this.actor);
          break;
          
        case 'medical-care':
          const currentCare = this.actor.getFlag('msh-faserip', 'medicalCare') || false;
          await game.msh.rest.setMedicalCare(this.actor, !currentCare);
          this.render(false);
          break;
          
        case 'wake-up':
          await game.msh.rest.attemptRegainConsciousness(this.actor);
          break;
          
        case 'stabilize':
          // Check if dying
          const scope = "msh-faserip";
          const dyingEffect = this.actor.effects.find(e => 
            e.getFlag(scope, "isDying") || e.statuses?.has?.("dying")
          );
          
          if (!dyingEffect) {
            ui.notifications.warn(`${this.actor.name} is not dying`);
            return;
          }
          
          // Show stabilization options dialog
          new Dialog({
            title: `Stabilize ${this.actor.name}`,
            content: `
              <div style="padding:8px;">
                <p><strong>${this.actor.name}</strong> is dying!</p>
                <p>Choose stabilization method:</p>
              </div>
            `,
            buttons: {
              karma50: {
                label: "50 Karma (1 round pause)",
                callback: async () => {
                  await dyingEffect.setFlag(scope, "stabilizedRounds", 1);
                  ChatMessage.create({
                    content: `<p style="color:#ff9800;"><strong>${this.actor.name}</strong> stabilized for 1 round (50 Karma spent)!</p>`
                  });
                  ui.notifications.info(`${this.actor.name} stabilized for 1 round`);
                }
              },
              karma200: {
                label: "200 Karma + FEAT",
                callback: async () => {
                  ui.notifications.info("Roll Endurance FEAT manually - success = stabilized");
                }
              },
              aid: {
                label: "Aid/First Aid (permanent)",
                callback: async () => {
                  await game.msh.rest.stabilizeDying(this.actor);
                }
              },
              cancel: {
                label: "Cancel",
                callback: () => {}
              }
            },
            default: "aid"
          }).render(true);
          break;
      }
    });


    // Collapsible effect sections
    html.find('.effect-header').click((event) => {
      // Don't collapse if clicking the add button
      if ($(event.target).closest('.btn-add').length) return;
      
      const header = $(event.currentTarget);
      const section = header.closest('.effect-section');
      section.toggleClass('collapsed');
    });
    
    // Existing effect management
    html.find('.effect-control').click(ev => {
      if ($(ev.currentTarget).data('action') === 'create') {
        onManageActiveEffect(ev, this.actor);
      } else {
        const li = $(ev.currentTarget).closest('.effect-row');
        if (li.length) {
          onManageActiveEffect(ev, this.actor);
        }
      }
    });

    // universal roll trigger listener
    /* html.find('.universal-roll-trigger').click(ev => {
      ev.preventDefault();
      game.msh.openUniversalTableDialog?.(this.actor);
    }); */

    // Make the universal roll trigger draggable for macros
    html.find('.universal-roll-trigger').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        // Use the same format as item drag handling
        const actorId = this.actor.id;
        
        // Create dragData similar to item drag data but for universal table
        const dragData = {
          type: "UniversalTable",
          actorId: actorId,
          // You can include other data needed for the universal table
          data: {
            name: `Universal Table (${this.actor.name})`,
            img: "icons/svg/d20-grey.svg"
          }
        };
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Talents - draggable and sortable
    html.find('.talent-item').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
    
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "TalentSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "TalentSort") return;
    
          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;
    
          const items = this.actor.items
            .filter(i => i.type === "talent")
            .sort((a, b) => a.sort - b.sort);
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;
    
          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);
    
          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);
    
          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));
    
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in talent drag and drop:", err);
        }
      });
    });

    // Contacts made draggable/sortable w/in the contact tab
    // Contacts - draggable and sortable
    html.find('.contact-item').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
    
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "ContactSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "ContactSort") return;
    
          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;
    
          const items = this.actor.items
            .filter(i => i.type === "contact")
            .sort((a, b) => a.sort - b.sort);
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;
    
          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);
    
          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);
    
          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));
    
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in contact drag and drop:", err);
        }
      });
    });
    
    // Equipment - draggable and sortable
    html.find('.equipment-row').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;

        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "EquipmentSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "EquipmentSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "equipment")
            .sort((a, b) => a.sort - b.sort);
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;

          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);

          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);

          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));

          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in equipment drag and drop:", err);
        }
      });
    });

    // Make entire vehicle rows draggable (like powers and talents)
    html.find('.vehicle-row').each((i, row) => {
      // No need to set draggable="true" here if it's already in the HTML
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
        
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "VehicleSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "VehicleSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "vehicle")
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;

          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);

          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);

          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));

          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in vehicle drag and drop:", err);
        }
      });
    });

    // Headquarters - draggable and sortable
    html.find('.headquarters-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        // If shift key is pressed, do sorting, otherwise create a macro
        let dragData;
        if (ev.shiftKey) {
          dragData = {
            type: "HeadquartersSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "Item",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Biography Toggle Button
    html.find('.biography-toggle').click(ev => {
      ev.preventDefault();
      // Toggle the biography open state
      this._isBiographyOpen = !this._isBiographyOpen;
      // Re-render the sheet
      this.render(false);
    });

    // Handle form changes in biography section
/*     html.find('.biography-details input, .biography-details textarea').change(ev => {
      const formData = this._getSubmitData();
      this.actor.update(formData);
    }); */

    // Karma History button
    html.find('.view-karma-history').click(ev => {
      // Import dynamically to avoid circular dependencies
      import('./karma.js').then(module => {
        const sheet = new module.KarmaSheet(this.actor);
        sheet.render(true);
      });
    });

    // Add Power button - more direct approach
    html.find('.add-power').click(ev => {
      console.log("Add Power button clicked"); // Debug line

      // Create the new power item data
      const itemData = {
        name: "New Power",
        type: "power",
        system: {
          description: "",
          rank: "Typical",
          value: 6,
          range: "",
          type: "",
          subtype: "",
          isActive: true
        },
        sort: this.actor.items.size  // sort added
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Power created successfully");
          this.render(false); // Re-render the sheet to show the new power
        })
        .catch(err => console.error("Error creating power:", err));
    });

    // Listener for powers
    // Powers - draggable and sortable
    html.find('.power-row').each((i, row) => {
      // We don't need to set draggable=true here since it's already in the HTML
      
      row.addEventListener("dragstart", ev => {
        console.log("Power drag start", ev.shiftKey);
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
        
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "PowerSort",
            itemId: itemId
          };
          console.log("Power sort drag", dragData);
        } else {
          // Hotbar macro drag
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
          console.log("Power hotbar drag", dragData);
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          console.log("Drop data", sourceData);
          
          if (sourceData.type !== "PowerSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "power")
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;

          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);

          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);

          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));

          console.log("Updating items with new sort order", updates);
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in power drag and drop:", err);
        }
      });
    });

    // Add Resistance
    html.find('.add-resistance').click(async (ev) => {
      ev.preventDefault();
      
      // Ensure resistances is always initialized as an array
      let resistances = foundry.utils.deepClone(this.actor.system.resistances);
      if (!Array.isArray(resistances)) {
        resistances = [];
      }
    
      resistances.push({ type: "physical", rank: "Good", value: 10 });
      await this.actor.update({ "system.resistances": resistances });
    });

    // Resistance Info Dialog
    html.find('.resistance-info').click(ev => {
      ev.preventDefault();
      const index = Number(ev.currentTarget.dataset.index);
      const resistance = this.actor.system.resistances[index];
      if (!resistance) return;

      new Dialog({
        title: "Resistance Information",
        content: `
          <p><strong>Type:</strong> ${resistance.type}</p>
          <p><strong>Rank:</strong> ${resistance.rank} (${resistance.value})</p>
        `,
        buttons: { close: { label: "Close" } }
      }).render(true);
    });

    // Resistance edit button
    html.find('.resistance-edit').click(ev => {
      const index = $(ev.currentTarget).data("index");
      
      // Handle different data structures for resistances
      let resistances;
      if (Array.isArray(this.actor.system.resistances)) {
        resistances = this.actor.system.resistances;
      } else if (this.actor.system.resistances && typeof this.actor.system.resistances === 'object') {
        resistances = Object.values(this.actor.system.resistances);
      } else {
        resistances = [];
      }
      
      const resistance = resistances[index];
      
      if (!resistance) {
        console.error("No resistance found at index:", index);
        return;
      }
      
      let content = `
        <form>
          <div class="form-group">
            <label>Resistance Type</label>
            <select id="resistance-type" name="type">
              <option value="physical" ${resistance.type === "physical" ? "selected" : ""}>Physical</option>
              <option value="energy" ${resistance.type === "energy" ? "selected" : ""}>Energy</option>
              <option value="mental" ${resistance.type === "mental" ? "selected" : ""}>Mental</option>
              <option value="magical" ${resistance.type === "magical" ? "selected" : ""}>Magical</option>
              <option value="fire" ${resistance.type === "fire" ? "selected" : ""}>Fire</option>
              <option value="cold" ${resistance.type === "cold" ? "selected" : ""}>Cold</option>
              <option value="electricity" ${resistance.type === "electricity" ? "selected" : ""}>Electricity</option>
              <option value="radiation" ${resistance.type === "radiation" ? "selected" : ""}>Radiation</option>
              <option value="toxin" ${resistance.type === "toxin" ? "selected" : ""}>Toxin</option>
              <option value="corrosive" ${resistance.type === "corrosive" ? "selected" : ""}>Corrosive</option>
              <option value="disease" ${resistance.type === "disease" ? "selected" : ""}>Disease</option>
              <option value="emotion" ${resistance.type === "emotion" ? "selected" : ""}>Emotion</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rank</label>
            <select id="resistance-rank" name="rank">
              <option value="Shift-0">Shift-0</option>
              <option value="Feeble">Feeble</option>
              <option value="Poor">Poor</option>
              <option value="Typical">Typical</option>
              <option value="Good">Good</option>
              <option value="Excellent">Excellent</option>
              <option value="Remarkable">Remarkable</option>
              <option value="Incredible">Incredible</option>
              <option value="Amazing">Amazing</option>
              <option value="Monstrous">Monstrous</option>
              <option value="Unearthly">Unearthly</option>
              <option value="Shift-X">Shift-X</option>
              <option value="Shift-Y">Shift-Y</option>
              <option value="Shift-Z">Shift-Z</option>
              <option value="Class 1000">Class 1000</option>
              <option value="Class 3000">Class 3000</option>
              <option value="Class 5000">Class 5000</option>
              <option value="Beyond">Beyond</option>
            </select>
          </div>
          <div class="form-group">
            <label>Value</label>
            <input type="number" id="resistance-value" name="value" value="${resistance.value}">
          </div>
        </form>
      `;
      
      new Dialog({
        title: "Edit Resistance",
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: (html) => {
              const newType = html.find('#resistance-type').val();
              const newRank = html.find('#resistance-rank').val();
              const newValue = parseInt(html.find('#resistance-value').val()) || 0;
              
              // Ensure we're working with an array
              let updatedResistances;
              if (Array.isArray(this.actor.system.resistances)) {
                updatedResistances = foundry.utils.deepClone(this.actor.system.resistances);
              } else {
                updatedResistances = Object.values(this.actor.system.resistances || {});
              }
              
              updatedResistances[index] = {
                type: newType,
                rank: newRank,
                value: newValue
              };
              
              // Update the actor
              this.actor.update({
                "system.resistances": updatedResistances
              });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "save",
        width: 400
      }).render(true);
    });

    // Delete Resistance
    html.find('.delete-resistance').click(async (ev) => {
      ev.preventDefault();

      // Use jQuery consistently to access data attributes
      const index = Number($(ev.currentTarget).data("index"));
      
      console.log("Delete resistance - index:", index);
      console.log("Current resistances:", this.actor.system.resistances);
      console.log("Resistances type:", typeof this.actor.system.resistances);
      console.log("Is array:", Array.isArray(this.actor.system.resistances));
      
      // Handle different data structures
      let resistances;
      if (Array.isArray(this.actor.system.resistances)) {
        resistances = foundry.utils.deepClone(this.actor.system.resistances);
      } else if (this.actor.system.resistances && typeof this.actor.system.resistances === 'object') {
        // Convert object to array if needed
        resistances = Object.values(this.actor.system.resistances);
        console.log("Converted object to array:", resistances);
      } else {
        // Initialize as empty array if undefined
        resistances = [];
        console.log("Initialized empty array");
      }

      if (index >= 0 && index < resistances.length) {
        console.log("Removing resistance at index:", index, "Resistance:", resistances[index]);
        resistances.splice(index, 1);
        await this.actor.update({ "system.resistances": resistances });
        console.log("Updated resistances:", resistances);
      } else {
        console.error("Invalid resistance index:", index, "Array length:", resistances.length);
      }
    });

    // Browse Powers Compendium button
    html.find('.browse-compendium[data-type="powers"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "powers" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Powers compendium not found.");
      }
    });

    // Power info button
    html.find('.power-info').click(async ev => {
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a compact chat card to show power information
      const content = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#0d47a1;">
            <strong>${item.name}</strong>
          </div>
          <div style="padding:5px 10px;font-size:.9em;">
            <div><strong>Rank:</strong> ${item.system.rank} (${item.system.value})</div>
            <div><strong>Type:</strong> ${item.system.type || 'None'}</div>
            <div><strong>Range:</strong> ${item.system.range || 'None'}</div>
            <div><strong>Active:</strong> ${item.system.isActive ? 'Yes' : 'No'}</div>
            ${item.system.description ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd;">${item.system.description}</div>` : ''}
          </div>
        </div>
      `;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: content,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
      });
    });

    // Edit power button - more specific selector
    html.find('.powers-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete power button - more specific selector
    html.find('.powers-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");

      // Confirm deletion
      new Dialog({
        title: "Delete Power",
        content: "<p>Are you sure you want to delete this power?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll power button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.power-roll').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) {
        console.error("Could not find power item");
        return;
      }

      // Import ActionDispatcher
      const { ActionDispatcher } = await import("./modules/actions/action-dispatcher.js");
      
      // Route based on power category and type
      const category = item.system.category || "";
      const powerType = (item.system.type || "").toLowerCase();
      const requiresSave = item.system.requiresSave;
      const catLower = category.toLowerCase();
      
      // Determine attack type - explicit setting or auto-detect
      let actionType = item.system.attackType;
      
      // Normalize legacy values to current action types
      if (actionType) {
        const legacyMap = {
          "ranged-energy": "energy",
          "ranged-force": "force",
          "ranged-projectile": "shooting",
          "ranged-thrown": "throwing-blunt",
          "melee-blunt": "blunt-attack",
          "melee-edged": "edged-attack",
          "touch": "energy",
          "grapple": "grappling",
          "charging": "charging"
        };
        actionType = legacyMap[actionType] || actionType;
      }
      
      // If no explicit type, auto-detect from power name/category
      if (!actionType || actionType === "") {
        // Specific power type mappings based on UE rulebook
        const powerTypeLower = powerType.toLowerCase();
        
        // FORCE attacks (Force column - Slam/Stun results)
        // Air, Water, Earth control; Sound; Stunning Missile; Telekinesis; Magnetic; Gravity; Weather winds
        const forceTypes = [
          "air control", "water control", "earth control",
          "sound generation", "stunning missile",
          "telekinesis", "magnetic manipulation", "gravity manipulation",
          "force field generation", "weather control"
        ];
        
        // ENERGY attacks (Energy column - Stun/Kill results)
        // Fire, Light, Electrical, Energy Touch, Darkforce, Energy Generation
        const energyTypes = [
          "fire control", "fire generation", "energy generation",
          "electrical manipulation", "light manipulation",
          "energy touch", "darkforce manipulation", "darkforce generation",
          "shocking touch", "corrosive touch", "rotting touch",
          "health-drain touch", "paralyzing touch", "blinding touch"
        ];
        
        // THROWING BLUNT attacks
        const throwingBluntTypes = ["ice generation"];
        
        // THROWING EDGED attacks  
        const throwingEdgedTypes = ["slashing missile"];
        
        // SHOOTING attacks
        const shootingTypes = ["projectile missile"];
        
        // EDGED ATTACK (Fighting-based melee)
        const edgedAttackTypes = ["claws"];
        
        // GRAPPLING attacks
        const grapplingTypes = ["ensnaring missile"];
        
        // MENTAL attacks (Psyche FEAT, no to-hit)
        const mentalTypes = [
          "psionic attack", "mind control", "emotion control",
          "possession", "transferral", "mental probe",
          "telepathy", "image generation"
        ];
        
        // NON-ATTACK powers - don't open attack dialogs
        const nonAttackCategories = ["resistances", "senses", "movement"];
        const nonAttackTypes = [
          // Resistances
          "resistance to fire", "resistance to cold", "resistance to electricity",
          "resistance to radiation", "resistance to toxins", "resistance to corrosives",
          "resistance to emotion", "resistance to mental", "resistance to magical",
          "resistance to disease", "invulnerability",
          // Senses
          "protected senses", "enhanced senses", "infravision", "cosmic awareness",
          "combat sense", "computer links", "emotion detection", "energy detection",
          "magic detection", "magnetic detection", "mutant detection", "psionic detection",
          "astral detection", "tracking",
          // Movement
          "flight", "gliding", "leaping", "wall-crawling", "lightning speed",
          "teleportation", "levitation", "swimming", "climbing", "digging",
          "dimensional travel",
          // Body Controls (self-affecting)
          "growth", "shrinking", "density manipulation", "phasing", "invisibility",
          "plasticity", "elongation", "shape-shifting", "imitation",
          "body transformation", "animal transformation", "blending", "alter ego",
          // Body Alterations/Defensive
          "body armor", "water breathing", "absorption", "regeneration",
          "solar regeneration", "recovery", "life support", "pheromones",
          "damage transfer", "healing", "immortality"
        ];
        
        // Check for non-attack powers first
        if (nonAttackCategories.includes(catLower)) {
          ui.notifications.info(`${item.name} is not typically used as an attack power.`);
          return;
        }
        
        // Check specific non-attack types
        for (const nat of nonAttackTypes) {
          if (powerTypeLower.includes(nat)) {
            ui.notifications.info(`${item.name} is not typically used as an attack power.`);
            return;
          }
        }
        
        // Check specific attack type mappings
        for (const ft of forceTypes) {
          if (powerTypeLower.includes(ft)) {
            actionType = "force";
            break;
          }
        }
        
        if (!actionType) {
          for (const et of energyTypes) {
            if (powerTypeLower.includes(et)) {
              actionType = "energy";
              break;
            }
          }
        }
        
        if (!actionType) {
          for (const tbt of throwingBluntTypes) {
            if (powerTypeLower.includes(tbt)) {
              actionType = "throwing-blunt";
              break;
            }
          }
        }
        
        if (!actionType) {
          for (const tet of throwingEdgedTypes) {
            if (powerTypeLower.includes(tet)) {
              actionType = "throwing-edged";
              break;
            }
          }
        }
        
        if (!actionType) {
          for (const st of shootingTypes) {
            if (powerTypeLower.includes(st)) {
              actionType = "shooting";
              break;
            }
          }
        }
        
        if (!actionType) {
          for (const eat of edgedAttackTypes) {
            if (powerTypeLower.includes(eat)) {
              actionType = "edged-attack";
              break;
            }
          }
        }
        
        if (!actionType) {
          for (const gt of grapplingTypes) {
            if (powerTypeLower.includes(gt)) {
              actionType = "grappling";
              break;
            }
          }
        }
        
        if (!actionType) {
          for (const mt of mentalTypes) {
            if (powerTypeLower.includes(mt)) {
              actionType = "mental";
              break;
            }
          }
        }
        
        // Category-based fallbacks if no specific type matched
        if (!actionType) {
          if (catLower === "mentalpowers" || requiresSave) {
            actionType = "mental";
          } else if (catLower === "mattercontrol") {
            // Matter Control defaults to Force (physical manipulation)
            actionType = "force";
          } else if (catLower === "energycontrol") {
            // Energy Control defaults to Energy
            actionType = "energy";
          } else if (catLower === "distanceattacks") {
            // Distance Attacks - check for specific patterns
            if (/fire|energy|electric|light|dark|corrosive/i.test(powerTypeLower)) {
              actionType = "energy";
            } else if (/sound|stun|force/i.test(powerTypeLower)) {
              actionType = "force";
            } else if (/ice|throw/i.test(powerTypeLower)) {
              actionType = "throwing-blunt";
            } else if (/slash|edge/i.test(powerTypeLower)) {
              actionType = "throwing-edged";
            } else if (/projectile|missile|shoot/i.test(powerTypeLower)) {
              actionType = "shooting";
            } else if (/ensnar|grappl|web/i.test(powerTypeLower)) {
              actionType = "grappling";
            } else {
              actionType = "energy"; // Default for distance attacks
            }
          } else if (catLower === "bodyalterationsoffensive") {
            // Offensive body alterations - mostly touch-based energy
            if (/claw/i.test(powerTypeLower)) {
              actionType = "edged-attack";
            } else {
              actionType = "energy"; // Touch attacks are energy
            }
          } else {
            // Unknown category - default to energy
            actionType = "energy";
          }
        }
      }
      
      // Route to appropriate action
      if (actionType === "mental") {
        return ActionDispatcher.roll("mental-power", {
          actor: this.actor,
          opts: { 
            itemId: item.id,
            item: item
          }
        });
      }
      
      // Fighting-based attacks
      if (actionType === "edged-attack" || actionType === "blunt-attack") {
        return ActionDispatcher.roll(actionType, {
          actor: this.actor,
          abilityName: "fighting",
          opts: { 
            itemId: item.id,
            item: item
          }
        });
      }
      
      // Strength-based attacks
      if (actionType === "grappling") {
        return ActionDispatcher.roll(actionType, {
          actor: this.actor,
          abilityName: "strength",
          opts: { 
            itemId: item.id,
            item: item
          }
        });
      }
      
      // Endurance-based attacks
      if (actionType === "charging") {
        return ActionDispatcher.roll(actionType, {
          actor: this.actor,
          abilityName: "endurance",
          opts: { 
            itemId: item.id,
            item: item
          }
        });
      }
      
      // Agility-based ranged attacks (force, energy, throwing, shooting)
      return ActionDispatcher.roll(actionType, {
        actor: this.actor,
        abilityName: "agility",
        opts: { 
          itemId: item.id,
          item: item
        }
      });
    });

    ///////////////////////////////////////////////////////////////////////////////////////////
    // Add Talent button
    ///////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-talent').click(ev => {
      console.log("Add Talent button clicked"); // Debug line

      // Create the new talent item data
      const itemData = {
        name: "New Talent",
        type: "talent",
        system: {
          description: "",
          bonus: "+1CS",
          abilityModified: "",
          type: "",
          specialty: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Talent created successfully");
          this.render(false); // Re-render the sheet to show the new talent
        })
        .catch(err => console.error("Error creating talent:", err));
    });

    // Browse Talents Compendium button
    html.find('.browse-compendium[data-type="talents"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "talents" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Talents compendium not found.");
      }
    });

    // Talent info button
    html.find('.talent-info').click(ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a dialog to show talent information
      let content = `
    <h2>${item.name}</h2>
    <div class="talent-details">
      <div class="label">Bonus:</div><div>${item.system.bonus || 'None'}</div>
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Specialty:</div><div>${item.system.specialty || 'None'}</div>
      <div class="label">Ability Modified:</div><div>${item.system.abilityModified ? item.system.abilityModified.charAt(0).toUpperCase() + item.system.abilityModified.slice(1) : 'None'}</div>
    </div>
    <div class="description">${item.system.description || 'No description available.'}</div>
  `;

      new Dialog({
        title: "Talent Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });

    // Edit talent button
    html.find('.talents-list .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete talent button
    html.find('.talents-list .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Talent",
        content: "<p>Are you sure you want to delete this talent?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // roll talent button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.talent-roll').click(async ev => {
      const actor = this.actor;
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Talents might need special handling or use check-action
      // For now, route through the old system OR create a TalentAction class
      
      // Option A: Keep using old system for talents (if they're special)
      await game.msh.rollTalent(actor, item);
      
      // Option B: Create new talent handler (future work)
      // const { ActionDispatcher } = await import("./modules/actions/action-dispatcher.js");
      // await ActionDispatcher.roll("talent", { 
      //   actor: this.actor, 
      //   opts: { item }
      // });
    });

    ////////////////////////////////////////////////////////////////////////////////////////
    // Add Contact button
    ////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-contact').click(ev => {
      console.log("Add Contact button clicked"); // Debug line

      // Create the new contact item data
      const itemData = {
        name: "New Contact",
        type: "contact",
        system: {
          description: "",
          type: "",
          disposition: "Friendly",
          specialties: [],
          location: "",
          notes: "" // Add notes field
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Contact created successfully");
          this.render(false); // Re-render the sheet to show the new contact
        })
        .catch(err => console.error("Error creating contact:", err));
    });

    // Browse Contacts Compendium button
    html.find('.browse-compendium[data-type="contacts"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "contacts" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Contacts compendium not found.");
      }
    });

    // Contact info button
    html.find('.contact-info').click(ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a dialog to show contact information
      let content = `
    <h2>${item.name}</h2>
    <div class="contact-details">
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Disposition:</div><div>${item.system.disposition || 'Friendly'}</div>
      <div class="label">Location:</div><div>${item.system.location || 'Unknown'}</div>
    </div>
    
    ${item.system.notes ? `
    <div class="contact-notes">
      <h3>Notes:</h3>
      <div>${item.system.notes}</div>
    </div>
    ` : ''}
    
    <div class="contact-description">
      <h3>Description:</h3>
      <div>${item.system.description || 'No description available.'}</div>
    </div>
  `;

      new Dialog({
        title: "Contact Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });;

    // Edit contact button
    html.find('.contacts-list .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete contact button
    html.find('.contacts-list .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Contact",
        content: "<p>Are you sure you want to delete this contact?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll Contact button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.contact-roll').click(async ev => {
      const actor = this.actor;
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Get saved contact settings
      const savedActionType = item.getFlag("msh-faserip", "lastActionType") || "Availability";
      const savedColumnShift = item.getFlag("msh-faserip", "lastColumnShift") || 0;
      const skipDiceRoll = item.getFlag("msh-faserip", "skipDiceRoll") || false;

      // Define contact action types
      const actionOptions = [
        { value: "Availability", label: "Availability" },
        { value: "Information", label: "Information Request" },
        { value: "Equipment", label: "Equipment Request" },
        { value: "Assistance", label: "Request Assistance" },
        { value: "Favor", label: "Request Favor" }
      ];

      // Create action type options HTML
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get the hero's popularity
      const heroPopularity = this.actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = this.actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = this.actor.system.powerOrigin === "mutant" || this.actor.system.isMutant;

      // Get contact type and determine potential resource level
      const contactType = item.system.type || "General";
      const CONTACT_RESOURCE_LEVELS = {
        "Professional":  "Remarkable",
        "Scientific":    "Incredible",
        "Political":     "Amazing",
        "Mystic":        "Good",
        "Criminal":      "Typical",
        "Hero Group":    "Incredible",
        "Other":         "Typical"
      };
      const resourceLevel = CONTACT_RESOURCE_LEVELS[contactType] ?? "Typical";

      // Disposition: base on stored contact value, degrade one step on negative popularity
      const DISP_ORDER = ["Friendly", "Neutral", "Suspicious", "Hostile"];
      const storedDisposition = item.system.disposition || "Friendly";
      const storedDispIdx = DISP_ORDER.indexOf(storedDisposition);
      const effectiveDispIdx = (heroPopularity < 0)
        ? Math.min(storedDispIdx + 1, DISP_ORDER.length - 1)
        : storedDispIdx;
      const effectiveDisposition = DISP_ORDER[effectiveDispIdx] ?? "Friendly";

      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly":   requiredFeatColor = "Green"; break;
        case "Neutral":    requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile":    requiredFeatColor = "Impossible"; break;
      }

      // Create dialog for roll options
      let dialogContent = `
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Request Type:</label>
    <select id="action-type" name="actionType" style="width: 180px;">
      ${actionOptionsHTML}
    </select>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Contact Type:</label>
    <input type="text" id="contact-type" value="${contactType}" style="width: 180px;" readonly>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Disposition:</label>
    <input type="text" id="disposition" value="${effectiveDisposition}" style="width: 100px;" readonly>
    ${heroPopularity < 0 ?
          '<span style="color: #aa0000; font-size: 0.9em;"> (Modified due to negative popularity)</span>' : ''}
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Popularity:</label>
    <input type="text" id="popularity-rank" value="${heroPopularityRank}" style="width: 100px;" readonly>
    <span style="margin-left: 5px;">(${heroPopularity})</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Resources:</label>
    <input type="text" id="resources" value="${resourceLevel}" style="width: 100px;" readonly>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Required Result:</label>
    <input type="text" id="required-result" value="${requiredFeatColor}" style="width: 100px;" readonly>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Column Shift:</label>
    <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
    <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
  </div>
  <div style="margin-bottom: 10px;">
    <label style="display: inline-block; width: 120px;">Karma Points:</label>
    <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
  </div>
  <div style="margin-bottom: 10px;">
    <label>
      <input type="checkbox" id="save-settings" name="saveSettings" checked> 
      Remember these settings for future rolls
    </label>
  </div>
  <div>
    <label>
      <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
      Skip dice animation
    </label>
  </div>`;

      new Dialog({
        title: `Contact Roll: ${item.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="actionType"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await item.setFlag("msh-faserip", "lastActionType", actionType);
                await item.setFlag("msh-faserip", "lastColumnShift", columnShift);
                /* await item.setFlag("msh-faserip", "lastDamageCS", damageCS); */
                await item.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Apply column shifts to get effective rank
              let effectiveRank = heroPopularityRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
                ];
                const index = ranks.indexOf(effectiveRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                  console.log(`Applied ${columnShift} column shifts to ${heroPopularityRank}, now ${effectiveRank}`);
                }
              }

              // Apply mutant penalty if applicable (skipped for mutant-friendly contacts)
              if (isMutant && !item.system.ignoreMutantPenalty) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
                ];
                const index = ranks.indexOf(effectiveRank);
                if (index > 0) {
                  effectiveRank = ranks[index - 1];
                  console.log(`Applied -1CS mutant penalty, now ${effectiveRank}`);
                }
              }

              // Create the roll
              const roll = new Roll("1d100");

              // Evaluate the roll
              await roll.evaluate();

              let cappedTotal = roll.total;
              let karmaUsed = 0;

              // Karma spending - uses lifetime karma only
              if (karma > 0) {
                cappedTotal = Math.min(100, roll.total + karma);
                karmaUsed = karma;

                // Create history entry for karma spending
                const historyEntry = {
                  timestamp: new Date().toISOString(),
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -karma,
                  type: "Die Roll",
                  description: `Spent karma on ${item.name} (Contact)`
                };
                
                const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
                currentHistory.push(historyEntry);
                
                await game.msh.runAsGM({
                  operation: 'update',
                  targetActorUuid: this.actor.uuid,
                  args: [{ "system.karma.history": currentHistory }]
                });
              }

              const totalKarmaUsed = karmaUsed;

              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} contacts ${item.name}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }

              // Calculate the result
              //const totalRoll = roll.total + karma;
              const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
              //highlightResultCell(effectiveRank, cappedTotal);

              // Check if the result meets the required FEAT color
              let meetsFeatRequirement = false;
              switch (requiredFeatColor) {
                case "Green":
                  meetsFeatRequirement = (resultColor.toLowerCase() === "green" || resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
                  break;
                case "Yellow":
                  meetsFeatRequirement = (resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
                  break;
                case "Red":
                  meetsFeatRequirement = (resultColor.toLowerCase() === "red");
                  break;
                case "Impossible":
                  meetsFeatRequirement = false; // Always fails
                  break;
              }

              // Define all possible results by color 
              const ALL_RESULTS = {
                "Availability": {
                  white: "Unavailable",
                  green: "Available (Limited)",
                  yellow: "Available",
                  red: "Eager to Help"
                },
                "Information": {
                  white: "No Information",
                  green: "Basic Information",
                  yellow: "Good Information",
                  red: "Detailed Information"
                },
                "Equipment": {
                  white: "No Equipment",
                  green: "Basic Equipment",
                  yellow: `Good Equipment (up to ${resourceLevel} rank)`,
                  red: `Excellent Equipment (up to ${resourceLevel} rank)`
                },
                "Assistance": {
                  white: "No Assistance",
                  green: "Limited Assistance",
                  yellow: "Direct Assistance",
                  red: "Above and Beyond"
                },
                "Favor": {
                  white: "Refuses",
                  green: "Small Favor Only",
                  yellow: "Willing to Help",
                  red: "Goes Above and Beyond"
                }
              };

              // Determine the result text
              let resultText;
              if (meetsFeatRequirement) {
                // If requirement met, use the result corresponding to the color rolled
                resultText = ALL_RESULTS[actionType][resultColor.toLowerCase()];
              } else {
                // If requirement not met, show the "failure" result regardless of color
                if (actionType === "Availability") resultText = "Unavailable";
                else if (actionType === "Information") resultText = "No Information";
                else if (actionType === "Equipment") resultText = "No Equipment";
                else if (actionType === "Assistance") resultText = "No Assistance";
                else if (actionType === "Favor") resultText = "Refuses";
              }

              // Create chat message styled to match others
              let content = `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
              <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                <strong>${this.actor.name} - ${contactType} Contact: ${item.name} (${actionType})</strong>
              </div>
              <div style="padding: 5px 10px; font-size: 0.9em;">
                <div>Popularity: ${heroPopularityRank} (${heroPopularity})</div>
                <div>Disposition: ${storedDisposition}${effectiveDisposition !== storedDisposition ? ` → ${effectiveDisposition} (negative popularity)` : ''} (Required: ${requiredFeatColor})</div>
                ${isMutant && !item.system.ignoreMutantPenalty ? '<div style="color: #aa0000;">Mutant Penalty Applied (-1CS)</div>' : ''}
                <div>Effective Rank: ${heroPopularityRank} ${columnShift !== 0 ? `→ ${effectiveRank} (${columnShift > 0 ? '+' : ''}${columnShift}CS)` : ''}</div>

                <div>Roll: ${roll.total} + Karma: ${totalKarmaUsed} = ${cappedTotal}</div>

                </div>
              <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                  resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                    resultColor.toLowerCase() === 'yellow' ? 'FFC107' :
                      '#F44336'}; 
                color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                ${resultText} (${resultColor.toUpperCase()})
              </div>
              ${!meetsFeatRequirement ?
                  `<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Failed to meet required ${requiredFeatColor} result for ${effectiveDisposition} contact</div>` : ''}
              ${heroPopularity < 0 ?
                  '<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Negative popularity affects contact relations</div>' : ''}
            </div>
          `;

              // Send to chat
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content
              });

              // If hero has negative popularity, using contacts costs Karma
              if (heroPopularity < 0) {
                ui.notifications.warn("Negative popularity: Using contacts costs Karma!");
                // You could implement Karma reduction here if desired
              }
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    });

    // Equipment tab: hide empty groups, decode damage type badges
    const dtypeLabels = {
      S: "Shooting", E: "Energy", F: "Force",
      EA: "Edged", BA: "Blunt", TE: "Throw-Edged", TB: "Throw-Blunt",
      GP: "Grappling", Gb: "Grabbing", Stun: "Stunning"
    };
    html.find('.equip-group').each(function() {
      const group = $(this);
      const hasRows = group.find('tbody tr').length > 0;
      if (!hasRows) group.hide();
    });
    html.find('.equipment-type-badge').each(function() {
      const el = $(this);
      const code = el.data('dtype') || el.text().trim();
      if (dtypeLabels[code]) el.text(dtypeLabels[code]);
    });

    // Add Equipment button
    html.find('.add-equipment').click(ev => {
      console.log("Add Equipment button clicked"); // Debug line

      // Create the new equipment item data
      const itemData = {
        name: "New Equipment",
        type: "equipment",
        system: {
          description: "",
          materialStrength: "Typical",
          category: "gear",
          price: "Poor",
          notes: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Equipment created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating equipment:", err));
    });

    // Browse Equipment Compendium button
    html.find('.browse-compendium[data-type="equipment"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "equipment" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Equipment compendium not found.");
      }
    });

    // Equipment info button
    html.find('.equipment-info').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a dialog to show equipment information
      let content = `
        <h2>${item.name}</h2>
        <div class="equipment-details">
          <p><strong>Category:</strong> ${item.system.category || 'None'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Price:</strong> ${item.system.price || 'Poor'}</p>`;
          
      // Add category-specific details
      if (item.system.category === "weapon") {
        content += `
          <p><strong>Weapon Type:</strong> ${item.system.weaponType || 'None'}</p>
          <p><strong>Range:</strong> ${item.system.range || 'None'}</p>
          <p><strong>Damage:</strong> ${item.system.damage || 'None'} (${item.system.damageType || 'None'})</p>
          <p><strong>Rate:</strong> ${item.system.rate || 'None'}</p>
          <p><strong>Shots:</strong> ${item.system.shotsRemaining || item.system.shots || 'None'}/${item.system.shots || 'None'}</p>`;
      } else if (item.system.category === "armor") {
        content += `
          <p><strong>Protection:</strong> ${item.system.protection || 'None'}</p>
          <p><strong>Coverage:</strong> ${item.system.coverage || 'Partial'}</p>`;
      } else if (item.system.category === "other") {
        details += `<p><strong>Type:</strong> ${item.system.weaponType || 'Other'}</p>`;
        if (item.system.weaponType === "grenade") {
          details += `<p><strong>Grenade Type:</strong> ${item.system.grenadeType || 'Unknown'}</p>`;
          details += `<p><strong>Damage:</strong> ${item.system.grenadeDamage || '—'}</p>`;
          details += `<p><strong>Radius:</strong> ${item.system.grenadeRadius || 1} area(s)</p>`;
          details += `<p><strong>Count:</strong> ${item.system.shotsRemaining ?? item.system.shots ?? 0}</p>`;
        }
      } else if (item.system.category === "power-item") {
        content += `
          <p><strong>Power Rank:</strong> ${item.system.powerRank || 'Typical'}</p>
          <p><strong>Power Type:</strong> ${item.system.powerType || 'None'}</p>
          <p><strong>Linked Ability:</strong> ${item.system.linkedAbility || 'None'}</p>`;
      }
      
      content += `
        </div>
        <div class="description">${item.system.description || 'No description available.'}</div>
        <div class="notes">${item.system.notes ? `<strong>Notes:</strong> ${item.system.notes}` : ''}</div>
      `;

      new Dialog({
        title: "Equipment Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });

    // Edit equipment button
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
    
      if (item) {
        // Open the item sheet for proper editing
        item.sheet.render(true);
      }
    });

    // Delete equipment button
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
    
      if (!itemId) return;
    
      // Confirm deletion
      new Dialog({
        title: "Delete Equipment",
        content: "<p>Are you sure you want to delete this equipment?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll equipment button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.equipment-roll').click(async ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      const { ActionDispatcher } = await import("./modules/actions/action-dispatcher.js");
      
      // Determine action type based on equipment category
      let actionType;
      const category = item.system.category?.toLowerCase();
      const weaponType = item.system.weaponType?.toLowerCase();
      const damageType = item.system.damageType?.toUpperCase();
      const explicitAttackType = item.system.attackType || "";

      // Explicit attackType always wins
      if (explicitAttackType) {
        actionType = explicitAttackType;
      } else if (category === "other") {
        // Other weapons: grenade or missile
        if (weaponType === "grenade") {
          actionType = "grenade";
        } else if (weaponType === "missile") {
          actionType = "missile"; // future
        } else {
          return; // unknown other type
        }
      } else if (category === "weapon") {
        // Legacy grenade items (category=weapon + grenadeType set) — migrate on the fly
        if (item.system.grenadeType) {
          await item.update({ "system.category": "other", "system.weaponType": "grenade" });
          actionType = "grenade";
        } else if (damageType === "E") {
          actionType = "energy";
        } else if (damageType === "F") {
          actionType = "force";
        } else if (damageType === "GP") {
          actionType = "grappling";
        } else if (damageType === "GB") {
          actionType = "grabbing";
        } else if (damageType === "STUN") {
          // Stun weapons use Shooting column but have special stun effect
          actionType = "shooting";
        } else if (weaponType === "shooting" || weaponType === "firearm") {
          actionType = "shooting";
        } else if (weaponType === "melee") {
          // Use damageType to determine if edged or blunt
          actionType = (damageType === "EA") ? "edged-attack" : "blunt-attack";
        } else if (weaponType === "thrown") {
          // Check attackModes first, then damageType (EA and TE both = throwing-edged)
          const throwMode = (item.system.attackModes || []).find(m => m.actionType === "throwing-edged" || m.actionType === "throwing-blunt");
          if (throwMode) {
            actionType = throwMode.actionType;
          } else {
            actionType = (damageType === "TE" || damageType === "EA") ? "throwing-edged" : "throwing-blunt";
          }
        } else {
          // Fallback: try to infer from damageType
          if (damageType === "S") actionType = "shooting";
          else if (damageType === "EA") actionType = "edged-attack";
          else if (damageType === "BA") actionType = "blunt-attack";
          else if (damageType === "TE") actionType = "throwing-edged";
          else if (damageType === "TB") actionType = "throwing-blunt";
          else actionType = "shooting"; // ultimate fallback
        }
      } else if (category === "melee" || category === "melee weapon") {
        actionType = (damageType === "EA") ? "edged-attack" : "blunt-attack";
      } else if (category === "thrown") {
        const throwMode = (item.system.attackModes || []).find(m => m.actionType === "throwing-edged" || m.actionType === "throwing-blunt");
        if (throwMode) {
          actionType = throwMode.actionType;
        } else {
          actionType = (damageType === "TE" || damageType === "EA") ? "throwing-edged" : "throwing-blunt";
        }
      } else {
        // Check for grenade items regardless of category (catches gear default + old data)
        if (item.system.grenadeType) {
          await item.update({ "system.category": "other", "system.weaponType": "grenade" });
          actionType = "grenade";
        } else {
          return item.rollItem();
        }
      }

      // Determine ability based on action type
      let abilityName;
      if (actionType === "energy" || actionType === "force" || actionType === "shooting" || 
          actionType === "throwing-edged" || actionType === "throwing-blunt" || actionType === "grenade" || actionType === "missile") {
        abilityName = "agility";
      } else if (actionType === "grappling" || actionType === "grabbing") {
        abilityName = "strength";
      } else {
        abilityName = "fighting";
      }
            
      return ActionDispatcher.roll(actionType, {
        actor: this.actor,
        abilityName: abilityName,
        opts: { 
          itemId: item.id,
          item: item,
          sourceItem: item,
          equipment: item
        }
      });
    });

    // Reload weapon
    html.find('.reload-weapon').click(ev => {
      ev.preventDefault();
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      
      if (item && item.system.category === "weapon") {
        // Reset shotsRemaining to full shots
        item.update({"system.shotsRemaining": item.system.shots})
          .then(() => {
            ui.notifications.info(`${item.name} reloaded.`);
            this.render(false);
          })
          .catch(err => {
            console.error("Error reloading weapon:", err);
            ui.notifications.error("Could not reload weapon.");
          });
      }
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add Vehicle button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-vehicle').click(ev => {
      console.log("Add Vehicle button clicked"); // Debug line

      // Create the new vehicle item data
      const itemData = {
        name: "New Vehicle",
        type: "vehicle",
        system: {
          description: "",
          type: "Road",
          cost: "Typical",
          control: "Typical",
          speed: "Typical",
          body: "Typical", 
          protection: "Typical",
          compartmented: false,
          features: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Vehicle created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating vehicle:", err));
    });

    // Browse Vehicles Compendium button
    html.find('.browse-compendium[data-type="vehicles"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "vehicles" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Vehicles compendium not found.");
      }
    });

    // vehicle control feat button
    html.find('.vehicle-control-roll').each((i, btn) => {
      btn.addEventListener('click', async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const vehicle = this.actor.items.get(itemId);
        if (!vehicle) return ui.notifications.warn("Vehicle not found");
        this._rollVehicleControl(vehicle);
      });

      btn.addEventListener('dragstart', ev => {
        const command = `game.actors.get("${this.actor.id}").sheet._rollVehicleControl(game.actors.get("${this.actor.id}").items.get("${btn.dataset.itemId}"));`;
        const dragData = {
          type: "script",
          name: `Vehicle Control (${this.actor.name})`,
          img: "icons/svg/steering-wheel.svg",
          command
        };
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Vehicle info button (clickable image)
    html.find('.vehicle-info').click(ev => {
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      // Show vehicle details in a dialog
      let content = `
        <h2>${item.name}</h2>
        <div class="vehicle-details">
          <p><strong>Type:</strong> ${item.system.type}</p>
          <p><strong>Cost:</strong> ${item.system.cost}</p>
          <p><strong>Control:</strong> ${item.system.control}</p>
          <p><strong>Speed:</strong> ${item.system.speed}</p>
          <p><strong>Body:</strong> ${item.system.body}</p>
          <p><strong>Protection:</strong> ${item.system.protection}</p>
          <p><strong>Compartmented:</strong> ${item.system.compartmented ? "Yes" : "No"}</p>
        </div>
        ${item.system.features ? `<p><strong>Features:</strong> ${item.system.features}</p>` : ''}
        ${item.system.description ? `<div class="description">${item.system.description}</div>` : ''}
      `;

      new Dialog({
        title: "Vehicle Information",
        content,
        buttons: { close: { label: "Close" } },
        width: 400
      }).render(true);
    });

    // Make ONLY the vehicle name text draggable
    html.find('.vehicle-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "VehicleSort",
          itemId
        }));
      });
    });

    // Edit vehicle button
    html.find('.vehicles-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".vehicle-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete vehicle button
    html.find('.vehicles-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".vehicle-row");
      const itemId = li.data("itemId");

      if (!itemId) return;

      new Dialog({
        title: "Delete Vehicle",
        content: "<p>Are you sure you want to delete this vehicle?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add Headquarters button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-headquarters').click(ev => {
      console.log("Add Headquarters button clicked"); // Debug line

      // Create the new headquarters item data
      const itemData = {
        name: "New Headquarters",
        type: "headquarters",
        system: {
          description: "",
          location: "",
          size: "",
          materialStrength: "Typical",
          ownership: "owned",
          purchaseCost: "",
          rentalCost: "",
          isRichArea: false,
          features: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Headquarters created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating headquarters:", err));
    });

    // Browse Headquarters Compendium button
    html.find('.browse-compendium[data-type="headquarters"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "headquarters" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Headquarters compendium not found.");
      }
    });

    // Headquarters info button (clickable image)
    html.find('.headquarters-info').click(ev => {
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      // Show headquarters details in a dialog
      let content = `
        <h2>${item.name}</h2>
        <div class="headquarters-details">
          <p><strong>Location:</strong> ${item.system.location || 'Unknown'}</p>
          <p><strong>Size:</strong> ${item.system.size || 'Typical'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Ownership:</strong> ${item.system.ownership || 'Owned'}</p>
          ${item.system.purchaseCost ? `<p><strong>Purchase Cost:</strong> ${item.system.purchaseCost}</p>` : ''}
          ${item.system.rentalCost ? `<p><strong>Rental Cost:</strong> ${item.system.rentalCost}</p>` : ''}
          ${item.system.isRichArea ? `<p><strong>Located in Rich Area:</strong> Yes</p>` : ''}
          ${item.system.features ? `<p><strong>Features:</strong> ${item.system.features}</p>` : ''}
        </div>
        ${item.system.description ? `<div class="description">${item.system.description}</div>` : ''}
      `;

      new Dialog({
        title: "Headquarters Information",
        content,
        buttons: { close: { label: "Close" } },
        width: 400
      }).render(true);
    });

    // Headquarters - draggable and sortable
html.find('.headquarters-draggable').each((i, el) => {
  el.setAttribute("draggable", true);
  el.addEventListener("dragstart", ev => {
    const itemId = el.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    // Default to item drag (for macros/hotbar)
    let dragData = {
      type: "Item",
      uuid: item.uuid
    };
    
    // If holding shift, do sorting instead
    if (ev.shiftKey) {
      dragData = {
        type: "HeadquartersSort",
        itemId: itemId
      };
    }
    
    ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  });
});

// Make the entire row a drop target
html.find('.headquarters-row').each((i, row) => {
  row.addEventListener("dragover", ev => {
    ev.preventDefault();
    row.classList.add("drag-over");
  });

  row.addEventListener("dragleave", ev => {
    row.classList.remove("drag-over");
  });

  row.addEventListener("drop", async ev => {
    row.classList.remove("drag-over");
    ev.preventDefault();

    try {
      const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
      if (sourceData.type !== "HeadquartersSort") return;

      const sourceId = sourceData.itemId;
      const targetId = row.dataset.itemId;
      if (!sourceId || !targetId || sourceId === targetId) return;

      const items = this.actor.items
        .filter(i => i.type === "headquarters")
        .sort((a, b) => a.sort - b.sort);
      const source = items.find(i => i.id === sourceId);
      const target = items.find(i => i.id === targetId);
      if (!source || !target) return;

      const sourceIndex = items.indexOf(source);
      const targetIndex = items.indexOf(target);

      items.splice(sourceIndex, 1);
      items.splice(targetIndex, 0, source);

      const updates = items.map((item, index) => ({
        _id: item.id,
        sort: index
      }));

      await this.actor.updateEmbeddedDocuments("Item", updates);
      this.render();
    } catch (err) {
      console.error("Error in headquarters drag and drop:", err);
    }
  });
});

    // Edit headquarters button
    html.find('.headquarters-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".headquarters-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete headquarters button
    html.find('.headquarters-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".headquarters-row");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Headquarters",
        content: "<p>Are you sure you want to delete this headquarters?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // RESOURCE BUTTON method
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.resources-header-button').click(ev => {
      ev.preventDefault();
    
      // Ctrl+Click opens the info dialog
      if (ev.ctrlKey) {
        this._showResourceInfoDialog();
      } else {
        // Plain click rolls instantly
        this._onResourceRoll();
      }
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Popularity activateListeners method
    html.find('.popularity-header-button').click(ev => {
      const isMutant = this.actor.system.powerOrigin === "mutant" || this.actor.system.isMutant;
      const hasSecretId = this.actor.system.identityType === "secret";
      const heroPopularity = this.actor.system.attributes.popularity.value;
      const secretIdPopularity = hasSecretId ? (this.actor.system.attributes.popularity.secretId?.value || 0) : 0;
    
      const dialogContent = `
        <div style="margin-bottom: 10px;">
          ${hasSecretId ? `
            <label style="display: inline-block; width: 120px;">Identity:</label>
            <select id="identity-type" name="identityType" style="width: 120px;">
              <option value="hero">Hero Identity (${heroPopularity})</option>
              <option value="secret">Secret Identity (${secretIdPopularity})</option>
            </select>
          ` : `
            <label style="display: inline-block; width: 120px;">Popularity:</label>
            <input type="number" id="popularity-value" value="${heroPopularity}" style="width: 50px;" readonly>
          `}
          ${isMutant ? '<span style="color: #aa6600; margin-left: 5px;">Mutant (-1 modifier to all results)</span>' : ''}
        </div>
    
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Target Disposition:</label>
          <select id="disposition" name="disposition" style="width: 120px;">
            <option value="friendly">Friendly</option>
            <option value="neutral" selected>Neutral</option>
            <option value="unfriendly">Unfriendly</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
    
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Request Description:</label>
          <input type="text" id="request-description" style="width: 180px;" placeholder="e.g., Information request">
        </div>
    
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="column-shift" name="columnShift" value="0" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
    
        <div style="margin-bottom: 10px;">
          <p style="font-size: 0.9em; margin-top: 5px;">Common modifiers:</p>
          <ul style="font-size: 0.85em; margin-top: 5px; margin-bottom: 5px; padding-left: 20px;">
            <li>Target benefits: +2CS</li>
            <li>Target is placed in danger: -3CS</li>
            <li>Item value up to Good: -1CS</li>
            <li>Item value up to Remarkable: -2CS</li>
            <li>Item might not be returned: -2CS</li>
            <li>Item is unique: -3CS</li>
          </ul>
        </div>
      `;
    
      new Dialog({
        title: `Popularity Roll: ${this.actor.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll",
            callback: html => this._onPopularityRoll(html)
          },
          close: { icon: '<i class="fas fa-times"></i>', label: "Close" }
        },
        default: "roll"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Mini roll under RESOURCES: instant roll (ignore Ctrl/info)
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.on('click', '.resources-mini-roll', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._onResourceRoll();
    });

    // Mini roll under POPULARITY: open the same dialog as the header
    html.on('click', '.popularity-mini-roll', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // just trigger the existing header click so it builds the dialog
      const col = $(ev.currentTarget).closest('.sec-col.popularity');
      col.find('.popularity-header-button').trigger('click');
    });
        
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Ability FEAT roll buttons
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Find the ability FEAT roll buttons section in activateListeners(html)
    html.find('.ability-key').click(ev => {
      const abilityKey = ev.currentTarget.textContent.trim().toLowerCase();
      let abilityName, abilityFullName;
      
      // Map the key to the actual ability name
      switch(abilityKey) {
        case 'f': abilityName = 'fighting'; abilityFullName = 'Fighting'; break;
        case 'a': abilityName = 'agility'; abilityFullName = 'Agility'; break;
        case 's': abilityName = 'strength'; abilityFullName = 'Strength'; break;
        case 'e': abilityName = 'endurance'; abilityFullName = 'Endurance'; break;
        case 'r': abilityName = 'reason'; abilityFullName = 'Reason'; break;
        case 'i': abilityName = 'intuition'; abilityFullName = 'Intuition'; break;
        case 'p': abilityName = 'psyche'; abilityFullName = 'Psyche'; break;
        default: return; // Invalid ability key
      }
      
      // Get ability information
      const ability = this.actor.system.abilities[abilityName];
      if (!ability) return;
      
      const abilityRank = ability.rank;
      const abilityValue = ability.value;
      
      // Check if this is a Strength FEAT
      const isStrength = abilityName === 'strength';
      
      // Get saved settings if they exist
      const savedColumnShift = this.actor.getFlag("msh-faserip", `last${abilityFullName}ColumnShift`) || 0;
      const savedIntensity = this.actor.getFlag("msh-faserip", `last${abilityFullName}Intensity`) || "None";
      const skipDiceRoll = this.actor.getFlag("msh-faserip", `last${abilityFullName}SkipDiceRoll`) || false;
      const savedFeatType = this.actor.getFlag("msh-faserip", `last${abilityFullName}FeatType`) || "standard";
      const savedWeightIntensity = this.actor.getFlag("msh-faserip", `last${abilityFullName}WeightIntensity`) || "Remarkable";
      const savedMaterial = this.actor.getFlag("msh-faserip", `last${abilityFullName}Material`) || "Steel";
      const savedThickness = this.actor.getFlag("msh-faserip", `last${abilityFullName}Thickness`) || "2-12";
      
      // Define all available ranks for intensity dropdown
      const allRanks = [
        "None", "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      // Weight to intensity mapping
      const weightIntensities = [
        { rank: "Feeble", display: "Feeble (Up to 50 lbs)" },
        { rank: "Poor", display: "Poor (Up to 100 lbs)" },
        { rank: "Typical", display: "Typical (Up to 200 lbs)" },
        { rank: "Good", display: "Good (Up to 400 lbs)" },
        { rank: "Excellent", display: "Excellent (Up to 800 lbs)" },
        { rank: "Remarkable", display: "Remarkable (Up to 2000 lbs / 1 ton)" },
        { rank: "Incredible", display: "Incredible (Up to 10 tons)" },
        { rank: "Amazing", display: "Amazing (Up to 50 tons)" },
        { rank: "Monstrous", display: "Monstrous (Up to 80 tons)" },
        { rank: "Unearthly", display: "Unearthly (Up to 100 tons)" },
        { rank: "Shift-X", display: "Shift-X (Up to 250 tons)" },
        { rank: "Shift-Y", display: "Shift-Y (Up to 500 tons)" },
        { rank: "Shift-Z", display: "Shift-Z (Up to 1000 tons)" }
      ];
      
      // Material strength data
      /* const materials = {
        "Cloth": "Feeble",
        "Glass": "Feeble",
        "Brush": "Feeble",
        "Paper": "Feeble",
        "Normal Plastics": "Poor",
        "Crystal": "Poor",
        "Wood": "Poor",
        "Rubber": "Typical",
        "Gold": "Typical",
        "Brass": "Typical",
        "Copper": "Typical",
        "Ice": "Typical",
        "Adobe": "Typical",
        "Computer Chips": "Typical",
        "Brick": "Good",
        "Aluminum": "Good",
        "Light Machinery": "Good",
        "Asphalt": "Good",
        "High Strength Plastics": "Good",
        "Concrete": "Excellent",
        "Beta Cloth": "Excellent",
        "Iron": "Excellent",
        "Bullet-proof Glass": "Excellent",
        "Reinforced Concrete": "Remarkable",
        "Steel": "Remarkable",
        "Solid Stone": "Incredible",
        "Vibranium": "Incredible",
        "Volcanic Rock": "Incredible",
        "Osmium Steel": "Amazing",
        "Granite": "Amazing",
        "Gemstones": "Amazing",
        "Diamond": "Monstrous",
        "Super-heavy Alloys": "Monstrous",
        "Adamantium Steel": "Unearthly",
        "Mystical/Enchanted": "Unearthly"
      }; */

      // Material strength data - organized by rank
      const materialsByRank = {
        "Feeble": ["Cloth", "Glass", "Brush", "Paper"],
        "Poor": ["Normal Plastics", "Crystal", "Wood"],
        "Typical": ["Rubber", "Gold", "Brass", "Copper", "Ice", "Adobe", "Computer Chips"],
        "Good": ["Brick", "Aluminum", "Light Machinery", "Asphalt", "High Strength Plastics"],
        "Excellent": ["Concrete", "Beta Cloth", "Iron", "Bullet-proof Glass"],
        "Remarkable": ["Reinforced Concrete", "Steel"],
        "Incredible": ["Solid Stone", "Vibranium", "Volcanic Rock"],
        "Amazing": ["Osmium Steel", "Granite", "Gemstones"],
        "Monstrous": ["Diamond", "Super-heavy Alloys"],
        "Unearthly": ["Adamantium Steel", "Mystical/Enchanted"],
        "Class 1000-5000": ["Cap's Shield", "Thor's Hammer", "Virtually Indestructible"]
      };

      // Flatten into lookup table for getting rank from material
      const materials = {};
      for (const [rank, mats] of Object.entries(materialsByRank)) {
        for (const mat of mats) {
          materials[mat] = rank === "Class 1000-5000" ? "Unearthly" : rank; // Cap at Unearthly for game purposes
        }
      }

      // Create grouped options HTML for material dropdown
      const materialOptionsHTML = Object.entries(materialsByRank).map(([rank, mats]) => {
        const options = mats.map(material => 
          `<option value="${material}" ${material === savedMaterial ? 'selected' : ''}>${material}</option>`
        ).join('');
        return `<optgroup label="${rank}">${options}</optgroup>`;
      }).join('');
      
      // Create options HTML for intensity dropdown
      const intensityOptionsHTML = allRanks.map(rank => 
        `<option value="${rank}" ${rank === savedIntensity ? 'selected' : ''}>${rank}</option>`
      ).join('');
      
      // Create options for weight intensity dropdown
      const weightIntensityOptionsHTML = weightIntensities.map(item =>
        `<option value="${item.rank}" ${item.rank === savedWeightIntensity ? 'selected' : ''}>${item.display}</option>`
      ).join('');
      
      // Build the dialog content
      let dialogContent = `
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 100px;">Ability Rank:</label>
          <input type="text" id="ability-rank" name="abilityRank" value="${abilityRank}" style="width: 120px;" readonly>
          <span style="margin-left: 5px;">(${abilityValue})</span>
        </div>`;
      
      // Add FEAT Type selection for Strength
      if (isStrength) {
        dialogContent += `
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 100px;">FEAT Type:</label>
            <label><input type="radio" name="featType" value="standard" ${savedFeatType === 'standard' ? 'checked' : ''}> Standard</label>
            <label style="margin-left: 10px;"><input type="radio" name="featType" value="lifting" ${savedFeatType === 'lifting' ? 'checked' : ''}> Lifting</label>
            <label style="margin-left: 10px;"><input type="radio" name="featType" value="breaking" ${savedFeatType === 'breaking' ? 'checked' : ''}> Breaking</label>
          </div>
          
          <div id="lifting-section" style="display: none; padding: 8px; background-color: #f0f0f0; border-radius: 3px; margin-bottom: 10px;">
            <div style="font-weight: bold; margin-bottom: 5px; text-align: center;">─── Lifting Weight ───</div>
            <div style="margin-bottom: 5px;">
              <label style="display: inline-block; width: 50px;">Weight:</label>
              <select id="weight-intensity" name="weightIntensity" style="width: 300px;">
                ${weightIntensityOptionsHTML}
              </select>
            </div>
          </div>
          
          <div id="breaking-section" style="display: none; padding: 8px; background-color: #f0f0f0; border-radius: 3px; margin-bottom: 10px;">
            <div style="font-weight: bold; margin-bottom: 5px; text-align: center;">─── Breaking Material ───</div>
            <div style="margin-bottom: 5px;">
              <label style="display: inline-block; width: 60px;">Material:</label>
              <select id="material-select" name="material" style="width: 200px;">
                ${materialOptionsHTML}
              </select>
              <span id="base-material-strength" style="margin-left: 5px; font-size: 0.9em;"></span>
            </div>
            <div style="margin-bottom: 5px;">
              <label style="display: inline-block; width: 60px;">Thickness:</label>
              <label><input type="radio" name="thickness" value="<2" ${savedThickness === '<2' ? 'checked' : ''}> &lt;2"</label>
              <label style="margin-left: 8px;"><input type="radio" name="thickness" value="2-12" ${savedThickness === '2-12' ? 'checked' : ''}> 2-12"</label>
              <label style="margin-left: 8px;"><input type="radio" name="thickness" value="1-2ft" ${savedThickness === '1-2ft' ? 'checked' : ''}> 1-2'</label>
              <label style="margin-left: 8px;"><input type="radio" name="thickness" value=">2ft" ${savedThickness === '>2ft' ? 'checked' : ''}> &gt;2'</label>
              <span id="effective-material-strength" style="margin-left: 10px; font-weight: bold;"></span>
            </div>
          </div>`;
      }
      
      dialogContent += `
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Intensity:</label>
          <select id="intensity" name="intensity" style="width: 120px;">
            ${intensityOptionsHTML}
          </select>
        </div>
        <div style="margin-bottom: 10px;" id="feat-requirement">
          <label style="display: inline-block; width: 120px;">Required FEAT:</label>
          <span id="required-feat-text" style="font-weight: bold;">Any Color</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        ${generateKarmaControlsHTML(this.actor)}
        <div style="margin-bottom: 10px;">
          <label>
            <input type="checkbox" id="save-settings" name="saveSettings" checked> 
            Remember settings for future rolls
          </label>
        </div>
        <div>
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>`;
      
      const dialog = new Dialog({
        title: `${abilityFullName} FEAT Roll: ${this.actor.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const intensity = html.find('[name="intensity"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const spendKarma = html.find('#spend-karma').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              
              // Get Strength-specific settings if applicable
              let featType = 'standard';
              let weightIntensity = '';
              let material = '';
              let thickness = '';
              
              if (isStrength) {
                featType = html.find('[name="featType"]:checked').val();
                weightIntensity = html.find('[name="weightIntensity"]').val();
                material = html.find('[name="material"]').val();
                thickness = html.find('[name="thickness"]:checked').val();
              }
              
              // Save settings if requested
              if (saveSettings) {
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}ColumnShift`, columnShift);
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}Intensity`, intensity);
                await this.actor.setFlag("msh-faserip", `last${abilityFullName}SkipDiceRoll`, skipDice);
                
                if (isStrength) {
                  await this.actor.setFlag("msh-faserip", `last${abilityFullName}FeatType`, featType);
                  await this.actor.setFlag("msh-faserip", `last${abilityFullName}WeightIntensity`, weightIntensity);
                  await this.actor.setFlag("msh-faserip", `last${abilityFullName}Material`, material);
                  await this.actor.setFlag("msh-faserip", `last${abilityFullName}Thickness`, thickness);
                }
              }
              
              // Apply column shifts to get effective rank
              let effectiveRank = abilityRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
                  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
                ];
                const index = ranks.indexOf(abilityRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                  console.log(`Applied ${columnShift} column shifts to ${abilityRank}, now ${effectiveRank}`);
                }
              }
              
              // Determine FEAT requirement and possibility
              let featRequirement = "Any Color";
              let isImpossible = false;
              let isAutomatic = false;
              
              if (intensity !== "None") {
                const { requirement, impossible, automatic } = this._determineFeatRequirement(effectiveRank, intensity);
                featRequirement = requirement;
                isImpossible = impossible;
                isAutomatic = automatic;
              }
              
              // Handle impossible FEAT
              if (isImpossible) {
                ui.notifications.warn(`FEAT is impossible: ${effectiveRank} ability vs ${intensity} intensity. Need ability to be within one rank of intensity.`);
                return;
              }
              
              // Build additional context for strength feats
              let strengthContext = '';
              if (isStrength && featType !== 'standard') {
                if (featType === 'lifting') {
                  const weightDisplay = weightIntensities.find(w => w.rank === weightIntensity)?.display || weightIntensity;
                  strengthContext = `<div>Lifting: ${weightDisplay}</div>`;
                } else if (featType === 'breaking') {
                  const thicknessDisplay = thickness === '<2' ? '< 2"' : 
                                          thickness === '2-12' ? '2-12"' : 
                                          thickness === '1-2ft' ? '1-2 feet' : '> 2 feet';
                  strengthContext = `<div>Breaking: ${material} (${thicknessDisplay})</div>`;
                }
              }
              
              // Handle automatic FEAT
              if (isAutomatic) {
                const content = `
                  <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                    <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                      <strong>${this.actor.name} - ${abilityFullName} FEAT Roll vs ${intensity}</strong>
                    </div>
                    <div style="padding: 5px 10px; font-size: 0.9em;">
                      <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                      ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                      ${strengthContext}
                      <div>Intensity: ${intensity}</div>
                      <div>Ability rank is 3+ ranks higher than intensity</div>
                    </div>
                    <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                      background-color: #4CAF50; color: white;">
                      AUTOMATIC SUCCESS
                    </div>
                  </div>
                `;
                
                // Send to chat
                await ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  content: content
                });
                return;
              }
              
              // Create the roll
              const roll = new Roll("1d100");
              
              // Evaluate the roll
              await roll.evaluate();
              
              // Display the dice roll with flavor text if not skipped
              if (!skipDice) {
                await roll.toMessage({
                  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                  flavor: `${this.actor.name} makes a ${abilityFullName} FEAT roll${intensity !== "None" ? ` vs ${intensity} intensity` : ""}`,
                  rollMode: game.settings.get("core", "rollMode")
                });
              }
              
              // Calculate the result with karma (two-phase system per rules)
              let cappedTotal = roll.total;
              let karmaUsed = 0;

              // Phase 2: If karma was declared, show decision dialog AFTER rolling
              if (spendKarma && getAvailableKarma(this.actor) > 0) {
                const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
                const karmaResult = await showKarmaDecisionDialog(
                  this.actor, 
                  roll.total, 
                  effectiveRank, 
                  `${abilityFullName} FEAT`, 
                  initialColor
                );
                cappedTotal = karmaResult.finalResult;
                karmaUsed = karmaResult.karmaSpent;
                // Note: karma already deducted by showKarmaDecisionDialog
              }

              const totalKarmaUsed = karmaUsed;

              const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
              
              // Check if FEAT succeeded based on intensity requirement
              let featSuccess = true;
              if (intensity !== "None") {
                featSuccess = this._checkFeatSuccess(resultColor, featRequirement);
              }
              
              // Create chat message styled to match your existing output format
              let content = `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                  <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                    <strong>${this.actor.name} - ${abilityFullName} FEAT Roll${intensity !== "None" ? ` vs ${intensity}` : ""}</strong>
                  </div>
                  <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                    ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                    ${strengthContext}
                    ${intensity !== "None" ? `<div>Intensity: ${intensity} (Required: ${featRequirement})</div>` : ''}
                    <div>Roll: ${roll.total} + Karma: ${totalKarmaUsed} = ${cappedTotal}</div>
                  </div>
                  <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                    background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
                      resultColor.toLowerCase() === 'green' ? '#4CAF50' :
                        resultColor.toLowerCase() === 'yellow' ? '#FFC107' :
                          '#F44336'}; 
                    color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
                    ${resultColor.toUpperCase()} RESULT
                  </div>
                  ${intensity !== "None" ? `
                    <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
                      ${featSuccess ? 'FEAT SUCCEEDED' : 'FEAT FAILED'}
                    </div>
                  ` : ''}
                </div>
              `;
              
              // Send to chat
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll",
        render: html => {
          if (!isStrength) {
            // Original functionality for non-Strength abilities
            // Function to update FEAT requirement display
            const updateFeatRequirement = () => {
              const intensity = html.find('#intensity').val();
              const columnShift = parseInt(html.find('#shift').val()) || 0;
              const reqText = html.find('#required-feat-text');
              
              if (intensity === "None") {
                reqText.text("Any Color").css('color', '#333');
                return;
              }
              
              // Apply column shifts to get effective rank
              let effectiveRank = abilityRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
                  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
                ];
                const index = ranks.indexOf(abilityRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                }
              }
              
              const { requirement, impossible, automatic } = this._determineFeatRequirement(effectiveRank, intensity);
              
              if (impossible) {
                reqText.text("IMPOSSIBLE").css('color', '#F44336');
              } else if (automatic) {
                reqText.text("AUTOMATIC").css('color', '#4CAF50');
              } else {
                // Color code the requirement based on FEAT color
                let color = '#333'; // default color
                if (requirement === 'Green') {
                  color = '#4CAF50'; // green
                } else if (requirement === 'Yellow') {
                  color = '#FFC107'; // yellow/amber
                } else if (requirement === 'Red') {
                  color = '#F44336'; // red
                }
                reqText.text(requirement).css('color', color);
              }
            };
            
            // Update on intensity or column shift change
            html.find('#intensity, #shift').on('change', updateFeatRequirement);
            
            // Initial update
            updateFeatRequirement();
          } else {
            // Enhanced functionality for Strength
            
            // Get reference to the dialog element for resizing
            const dialogElement = html.closest('.dialog');
            
            // Function to show/hide sections based on FEAT type
            const updateFeatTypeDisplay = () => {
              const featType = html.find('[name="featType"]:checked').val();
              const liftingSection = html.find('#lifting-section');
              const breakingSection = html.find('#breaking-section');
              const intensitySelect = html.find('#intensity');
              const intensityRow = intensitySelect.closest('div'); // Get the parent div
              
              if (featType === 'lifting') {
                liftingSection.show();
                breakingSection.hide();
                intensityRow.hide();
                updateWeightIntensity();
              } else if (featType === 'breaking') {
                liftingSection.hide();
                breakingSection.show();
                intensityRow.hide();
                updateMaterialStrength();
              } else {
                liftingSection.hide();
                breakingSection.hide();
                intensityRow.show();
                intensitySelect.prop('disabled', false);
                // Reset to saved intensity when switching back to standard
                intensitySelect.val(savedIntensity);
                updateFeatRequirement();
              }
              
              updateFeatRequirement();
              
              // Force dialog to recalculate height
              if (dialogElement.length > 0) {
                dialogElement[0].style.height = 'auto';
              }
            };
            
            // Function to update weight intensity and set main intensity
            const updateWeightIntensity = () => {
              const weightIntensity = html.find('#weight-intensity').val();
              html.find('#intensity').val(weightIntensity);
              updateFeatRequirement();
            };
            
            // Function to update material strength based on selection and thickness
            const updateMaterialStrength = () => {
              const material = html.find('#material-select').val();
              const thickness = html.find('[name="thickness"]:checked').val();
              const baseStrength = materials[material];
              
              html.find('#base-material-strength').text(`(${baseStrength})`);
              
              // Calculate effective strength based on thickness
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
                "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
              ];
              
              let shift = 0;
              if (thickness === '<2') shift = -1;
              else if (thickness === '2-12') shift = 0;
              else if (thickness === '1-2ft') shift = 1;
              else if (thickness === '>2ft') shift = 2;
              
              const index = ranks.indexOf(baseStrength);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + shift, 0), ranks.length - 1);
                const effectiveStrength = ranks[newIndex];
                html.find('#effective-material-strength').text(`→ ${effectiveStrength}`);
                html.find('#intensity').val(effectiveStrength);
                updateFeatRequirement();
              }
            };
            
            // Function to update FEAT requirement display
            const updateFeatRequirement = () => {
              const intensity = html.find('#intensity').val();
              const columnShift = parseInt(html.find('#shift').val()) || 0;
              const reqText = html.find('#required-feat-text');
              
              if (intensity === "None") {
                reqText.text("Any Color").css('color', '#333');
                return;
              }
              
              // Apply column shifts to get effective rank
              let effectiveRank = abilityRank;
              if (columnShift !== 0) {
                const ranks = [
                  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
                  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
                ];
                const index = ranks.indexOf(abilityRank);
                if (index !== -1) {
                  const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                  effectiveRank = ranks[newIndex];
                }
              }
              
              const { requirement, impossible, automatic } = this._determineFeatRequirement(effectiveRank, intensity);
              
              if (impossible) {
                reqText.text("IMPOSSIBLE").css('color', '#F44336');
              } else if (automatic) {
                reqText.text("AUTOMATIC").css('color', '#4CAF50');
              } else {
                // Color code the requirement based on FEAT color
                let color = '#333'; // default color
                if (requirement === 'Green') {
                  color = '#4CAF50'; // green
                } else if (requirement === 'Yellow') {
                  color = '#FFC107'; // yellow/amber
                } else if (requirement === 'Red') {
                  color = '#F44336'; // red
                }
                reqText.text(requirement).css('color', color);
              }
            };
            
            // Event listeners for Strength-specific functionality
            html.find('[name="featType"]').on('change', updateFeatTypeDisplay);
            html.find('#weight-intensity').on('change', updateWeightIntensity);
            html.find('#material-select').on('change', updateMaterialStrength);
            html.find('[name="thickness"]').on('change', updateMaterialStrength);
            html.find('#intensity, #shift').on('change', updateFeatRequirement);
            
            // Initial display update
            updateFeatTypeDisplay();
          }
        }
      }).render(true);
    });

    // === STUNTS TAB LISTENERS ===
    // Stunts Tab - Add stunt
    html.find('.add-stunt-general').click(async ev => {
      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      const rankOptions = ranks.map(r => `<option value="${r}">${r}</option>`).join('');
      
      new Dialog({
        title: "Add Power Stunt",
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" placeholder="e.g., Triple Teleport" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>Rank:</label>
              <select name="rank" id="stunt-rank-select" style="width: 150px;">
                ${rankOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Rank Number:</label>
              <input type="number" name="value" value="6" min="0" style="width: 100px;" />
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" placeholder="Describe what this stunt does..." style="width: 100%;"></textarea>
            </div>
            <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
              <strong>Note:</strong> First use will require a Red FEAT and cost 100 Karma.
            </p>
          </form>
        `,
        buttons: {
          create: {
            icon: '<i class="fas fa-plus"></i>',
            label: "Create Stunt",
            callback: async html => {
              const name = html.find('[name="name"]').val()?.trim();
              
              if (!name) {
                ui.notifications.warn("Stunt name is required!");
                return;
              }
              
              // add Power Stunt
              const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
              stunts.push({
                name: name,
                parentPower: null, // ← Add this - will populate from power sheet
                rank: html.find('[name="rank"]').val(),
                value: parseInt(html.find('[name="value"]').val()) || 6,
                description: html.find('[name="description"]').val() || "",
                timesUsed: 0
              });
              
              await this.actor.update({ "system.stunts": stunts });
              ui.notifications.info(`Stunt "${name}" created!`);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "create"
      }).render(true);
    });

    // Stunts Tab
    // Roll Power Stunt
    html.find('.roll-stunt-tab').click(async ev => {
      ev.preventDefault();
      const stuntIndex = parseInt($(ev.currentTarget).data('stunt-index'));
      const roller = new StuntRoller(this.actor);
      await roller.rollStunt(stuntIndex);
    });

    // Stunts Tab - Edit stunt
    html.find('.edit-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
      const stunt = stunts[stuntIndex];
      
      if (!stunt) return;
      
      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      const rankOptions = ranks.map(r => 
        `<option value="${r}" ${r === stunt.rank ? 'selected' : ''}>${r}</option>`
      ).join('');
      
      new Dialog({
        title: `Edit Stunt: ${stunt.name}`,
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" value="${stunt.name}" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>Parent Power (optional):</label>
              <input type="text" name="parentPower" value="${stunt.parentPower || ''}" 
                    placeholder="e.g., Teleportation" style="width: 100%;" />
              <small style="color: #666;">Links this stunt to a specific power</small>
            </div>
              <label>Rank:</label>
              <select name="rank" style="width: 150px;">
                ${rankOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Rank Number:</label>
              <input type="number" name="value" value="${stunt.value}" min="0" style="width: 100px;" />
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" style="width: 100%;">${stunt.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>Times Used:</label>
              <input type="number" name="timesUsed" value="${stunt.timesUsed || 0}" min="0" style="width: 100px;" />
              <span style="margin-left: 10px; color: #666;">
                ${stunt.timesUsed < 1 ? 'Red FEAT (100 Karma)' : 
                  stunt.timesUsed < 4 ? 'Yellow FEAT (100 Karma)' : 
                  stunt.timesUsed < 10 ? 'Green FEAT (100 Karma)' : 
                  'Mastered (No Cost)'}
              </span>
            </div>
          </form>
        `,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: async html => {
              stunts[stuntIndex] = {
                name: html.find('[name="name"]').val(),
                parentPower: html.find('[name="parentPower"]').val() || null,
                rank: html.find('[name="rank"]').val(),
                value: parseInt(html.find('[name="value"]').val()) || 6,
                description: html.find('[name="description"]').val(),
                timesUsed: parseInt(html.find('[name="timesUsed"]').val()) || 0
              };
              await this.actor.update({ "system.stunts": stunts });
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "save"
      }).render(true);
    });

    // Stunts Tab - Delete stunt
    html.find('.delete-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = this.actor.system.stunts || [];
      const stunt = stunts[stuntIndex];
      
      const confirmed = await Dialog.confirm({
        title: "Delete Stunt",
        content: `<p>Are you sure you want to delete the stunt "<strong>${stunt?.name || 'Unknown'}</strong>"?</p>`
      });
      
      if (!confirmed) return;
      
      const updatedStunts = foundry.utils.deepClone(stunts);
      updatedStunts.splice(stuntIndex, 1);
      await this.actor.update({ "system.stunts": updatedStunts });
      this.render(false);
    });

    // Actions Tab -- buttons in Actions tab
    html.find('.action-btn').click(async ev => {
      const button = ev.currentTarget;
      const actionType = button.dataset.action;
      const abilityName = button.dataset.ability;
      
      // Check if CTRL key is held
      if (ev.ctrlKey) {
        await this._showActionInfo(actionType);
      } else {
        await this._rollAction(actionType, abilityName);
      }
    });

    // NEW: Make action buttons draggable to hotbar
    html.find('.action-btn').each((i, btn) => {
      btn.setAttribute('draggable', true);
      
      btn.addEventListener('dragstart', ev => {
        const actionCode = btn.dataset.action;
        const actionAbility = btn.dataset.ability;
        const actionName = btn.querySelector('.action-name')?.textContent?.replace(/<br>/g, ' ') || actionCode;
        
        const dragData = {
          type: "UniversalAction",
          actionCode: actionCode,
          actionName: actionName,
          actorId: this.actor.id,
          actorName: this.actor.name,
          iconName: actionCode
        };
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        console.log("📤 Character Sheet drag:", dragData);
      });
    });

    // Universal Table cell click - highlight the cell
    html.find('.rank-cell').click(ev => {
      // Remove previous highlights
      html.find('.rank-cell').removeClass('highlighted');
      
      // Highlight clicked cell
      $(ev.currentTarget).addClass('highlighted');
      
      // Get the roll range and rank
      const row = $(ev.currentTarget).closest('tr');
      const rollLabel = row.data('roll-label');
      const cellIndex = $(ev.currentTarget).index();
      const headerRow = html.find('.universal-rank-table thead tr').eq(0);
      const rankAbbr = headerRow.find('th').eq(cellIndex).text().trim();
      const color = $(ev.currentTarget).data('color');
      
      // Optional: Show a notification
      ui.notifications.info(`Roll ${rollLabel} on ${rankAbbr} = ${color.toUpperCase()}`);
    });
    
    // This serves as a fallback to ensure all draggable items can create macros
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".power-row, .talent-item, .contact-item, .equipment-row, .vehicle-draggable, .headquarters-draggable",
      dropSelector: null,
      permissions: { dragstart: true },
      callbacks: {
          dragstart: (event) => {
              // Don't interfere with shift+drag for sorting
              if (event.shiftKey) return;
              
              const li = event.currentTarget;
              const itemId = li.dataset.itemId;
              const item = this.actor.items.get(itemId);
              if (!item) return;

              console.log("🔥 DragDrop handler creating macro for:", item.name);
              
              // Use the format from the older file for creating macros
              event.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "FaseripItem",
                  actorId: this.actor.id,
                  itemId: item.id,
                  uuid: item.uuid,
                  data: item
              }));
          }
      }
  }).bind(html[0]);

      /** @override */
  
    // NEW: Initialize CharacterCreationTabManager if the tab exists
    // We query html[0] because 'html' in activateListeners is a jQuery object
    const creationTabElement = html[0].querySelector('.char-creation-tab');
    if (creationTabElement && !this._charCreationManager) {
        this._charCreationManager = new CharacterCreationTabManager(this.actor, creationTabElement);
    } else if (this._charCreationManager) {
        // If manager already exists (e.g., sheet was re-rendered), ensure it re-renders its content
        // This is important if `saveGeneratedData` is called on the manager, but the main sheet re-renders.
        this._charCreationManager.loadGeneratedData(); // Re-load and render on sheet re-open/re-render
    }

    // Show stunt description in chat
    html.find('.show-stunt-description').click(async ev => {
      ev.preventDefault();
      const stuntIndex = parseInt($(ev.currentTarget).data('stunt-index'));
      const stunt = this.actor.system.stunts[stuntIndex];
      
      if (!stunt) return;
      
      // Determine difficulty color
      let difficultyColor, difficultyText;
      if (stunt.timesUsed === 0) {
        difficultyColor = '#F44336';
        difficultyText = 'Red FEAT';
      } else if (stunt.timesUsed <= 3) {
        difficultyColor = '#FFC107';
        difficultyText = 'Yellow FEAT';
      } else if (stunt.timesUsed < 10) {
        difficultyColor = '#4CAF50';
        difficultyText = 'Green FEAT';
      } else {
        difficultyColor = '#2196F3';
        difficultyText = 'Mastered';
      }
      
      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
            <strong>${this.actor.name} — Power Stunt</strong>
          </div>
          
          <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
            <div><strong>Stunt:</strong> ${stunt.name}</div>
            ${stunt.parentPower ? `<div><strong>Parent Power:</strong> ${stunt.parentPower}</div>` : ''}
          </div>

          <div style="padding:5px 10px;font-size:.9em;">
            <div>Rank: ${stunt.rank} (${stunt.value})</div>
            <div>Difficulty: <span style="color:${difficultyColor};font-weight:bold;">${difficultyText}</span></div>
            <div>Times Used: ${stunt.timesUsed}</div>
            ${stunt.timesUsed < 10 ? `<div style="color:#666;font-size:.85em;">${10 - stunt.timesUsed} more success${10 - stunt.timesUsed === 1 ? '' : 'es'} until mastered</div>` : ''}
          </div>

          ${stunt.description ? `
            <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
              <div style="font-weight:bold;color:#0d47a1;">Description</div>
              <div style="font-size:.9em;">${stunt.description}</div>
            </div>
          ` : `
            <div style="padding:6px 10px;margin:6px 10px;background:#f5f5f5;border:1px solid #ccc;border-radius:3px;">
              <div style="font-size:.9em;color:#666;font-style:italic;">No description provided</div>
            </div>
          `}
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: cardHtml
      });
    });


    // Continue with other listeners...
  }

  /**
   * Determine FEAT requirement based on ability rank vs intensity
   * @param {string} abilityRank - The effective ability rank
   * @param {string} intensity - The intensity rank
   * @returns {object} - Object with requirement, impossible, and automatic flags
   */
  _determineFeatRequirement(abilityRank, intensity) {
    const ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];
    
    const abilityIndex = ranks.indexOf(abilityRank);
    const intensityIndex = ranks.indexOf(intensity);
    
    if (abilityIndex === -1 || intensityIndex === -1) {
      return { requirement: "Any Color", impossible: false, automatic: false };
    }
    
    const difference = abilityIndex - intensityIndex;
    
    // Impossible: intensity more than one rank higher than ability
    if (difference < -1) {
      return { requirement: "Red", impossible: true, automatic: false };
    }
    
    // Automatic: intensity three or more ranks lower than ability  
    if (difference >= 3) {
      return { requirement: "Automatic", impossible: false, automatic: true };
    }
    
    // Red FEAT: intensity one rank higher than ability
    if (difference === -1) {
      return { requirement: "Red", impossible: false, automatic: false };
    }
    
    // Yellow FEAT: intensity equal to ability
    if (difference === 0) {
      return { requirement: "Yellow", impossible: false, automatic: false };
    }
    
    // Green FEAT: intensity one or two ranks lower than ability
    if (difference === 1 || difference === 2) {
      return { requirement: "Green", impossible: false, automatic: false };
    }
    
    return { requirement: "Any Color", impossible: false, automatic: false };
  }

  /**
   * Check if a FEAT result meets the requirement
   * @param {string} resultColor - The color result from the universal table
   * @param {string} requirement - The required FEAT color
   * @returns {boolean} - Whether the FEAT succeeded
   */
  _checkFeatSuccess(resultColor, requirement) {
    const color = resultColor.toLowerCase();
    
    switch (requirement) {
      case "Green":
        return ["green", "yellow", "red"].includes(color);
      case "Yellow":
        return ["yellow", "red"].includes(color);
      case "Red":
        return color === "red";
      case "Automatic":
        return true;
      default:
        return true; // Any color succeeds if no specific requirement
    }
  }

  _showResourceInfoDialog() {
    const content = `
      <h2>Resource FEATs</h2>
      <p>Resources are a measure of a character's wealth and buying power. Instead of tracking exact money, the FASERIP system uses Resource FEATs to determine if a character can afford an item.</p>
  
      <h3>Using Resources</h3>
      <p>To purchase anything, a character must make a Resource FEAT. This is the equivalent of a credit check or checking the bank account to see how much cash is available.</p>
  
      <h3>Resource FEAT Rules:</h3>
      <ul>
        <li>A Resource FEAT may be made once per week.</li>
        <li>A character cannot purchase an item with a higher rank than their Resource rank.</li>
        <li>If the item's rank is 3 ranks lower than the Resource rank, purchase is automatic.</li>
        <li>If 1–2 ranks lower, a green FEAT is needed.</li>
        <li>If equal to Resource rank, a yellow FEAT is needed.</li>
      </ul>
  
      <h3>Success and Failure</h3>
      <p>Success means the character can purchase the item. Failure indicates the item is too expensive and the character cannot try for any item of that rank or higher for the next week.</p>
  
      <table>
        <tr><th>Resource Rank</th><th>Buying Power</th></tr>
        <tr><td>Shift-0</td><td>Homeless, no income</td></tr>
        <tr><td>Feeble</td><td>Poor, struggling to make ends meet</td></tr>
        <tr><td>Poor</td><td>Low income, basic necessities only</td></tr>
        <tr><td>Typical</td><td>Average income, modest lifestyle</td></tr>
        <tr><td>Good</td><td>Comfortable income, can afford luxuries</td></tr>
        <tr><td>Excellent</td><td>Well-off, upper middle class</td></tr>
        <tr><td>Remarkable</td><td>Wealthy, significant disposable income</td></tr>
        <tr><td>Incredible</td><td>Very wealthy, millionaire</td></tr>
        <tr><td>Amazing</td><td>Extremely wealthy, multi-millionaire</td></tr>
        <tr><td>Monstrous</td><td>Super-rich, billionaire</td></tr>
        <tr><td>Unearthly</td><td>Absurdly wealthy, virtually unlimited resources</td></tr>
      </table>
  
      <h3>Optional Bank Loans</h3>
      <p>Characters may purchase something up to one rank higher than their Resource rank through a bank loan. The character then must make monthly Resource FEATs of two ranks less for as many months as the rank number of the item.</p>
    `;
  
    new Dialog({
      title: "Resources in FASERIP",
      content,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: "Close"
        },
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Make Resource Roll",
          callback: () => this._onResourceRoll()
        }
      },
      default: "close",
      classes: ["resources-dialog"]
    }).render(true);
  }

  // Resource Roll method
  _onResourceRoll() {
    const resourceRank = this.actor.system.attributes.resources.rank;
    const resourceValue = this.actor.system.attributes.resources.value;
  
    const ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
    ];
  
    // Create dialog for roll options
    const dialogContent = `
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Resource Rank:</label>
        <input type="text" id="resource-rank" value="${resourceRank}" style="width: 100px;" readonly>
        <span style="margin-left: 5px;">(${resourceValue})</span>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Item Cost Rank:</label>
        <select id="item-rank" name="itemRank" style="width: 120px;">
          ${ranks.map(r => `<option value="${r}">${r}</option>`).join("")}
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Item Description:</label>
        <input type="text" id="item-description" style="width: 180px;" placeholder="e.g., Apartment rent">
      </div>
      <div style="margin-bottom: 10px;">
        <label><input type="checkbox" id="bank-loan" name="bankLoan"> Using a bank loan (allows 1 rank higher purchase)</label>
      </div>
    `;
  
    new Dialog({
      title: `Resource Roll: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll",
          callback: async (html) => {
            const itemRank = html.find('#item-rank').val();
            const itemDescription = html.find('#item-description').val() || "item";
            const bankLoan = html.find('#bank-loan').is(':checked');
  
            const resourceIndex = ranks.indexOf(resourceRank);
            const itemIndex = ranks.indexOf(itemRank);
  
            if (resourceIndex === -1 || itemIndex === -1) {
              return ui.notifications.error("Invalid rank selection");
            }
  
            // Purchase validation
            if (itemIndex > resourceIndex + (bankLoan ? 1 : 0)) {
              return ui.notifications.warn("Item rank is too high for your resources.");
            }
  
            // Determine required FEAT
            let featColorNeeded;
            const rankDifference = resourceIndex - itemIndex;
  
            if (rankDifference >= 3) {
              featColorNeeded = "Automatic";
            } else if (rankDifference === 1 || rankDifference === 2) {
              featColorNeeded = "Green";
            } else if (rankDifference === 0 || (bankLoan && itemIndex === resourceIndex + 1)) {
              featColorNeeded = "Yellow";
            }
  
            // Roll and evaluate
            const roll = new Roll("1d100");
            await roll.evaluate();
  
            const resultColor = game.msh.rollUniversalTable(resourceRank, roll.total);
            const resultColorLower = resultColor.toLowerCase();
            let success = false;
  
            if (featColorNeeded === "Automatic") success = true;
            else if (featColorNeeded === "Green") success = ["green", "yellow", "red"].includes(resultColorLower);
            else if (featColorNeeded === "Yellow") success = ["yellow", "red"].includes(resultColorLower);
            else if (featColorNeeded === "Red") success = resultColorLower === "red";
  
            // Format chat output
            const colorMap = {
              white: "#f8f8f8",
              green: "#4CAF50",
              yellow: "#FFC107",
              red: "#F44336"
            };
            const textColor = (["white", "yellow"].includes(resultColorLower)) ? "#333" : "white";
  
            const chatContent = `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px;">
                <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                  <strong>${this.actor.name} - Resource FEAT for ${itemDescription}</strong>
                </div>
                <div style="padding: 5px 10px; font-size: 0.9em;">
                  <div>Resource Rank: ${resourceRank} (${resourceValue})</div>
                  <div>Item Rank: ${itemRank}</div>
                  ${bankLoan ? '<div>Using Bank Loan</div>' : ''}
                  <div>Required FEAT: ${featColorNeeded}</div>
                  <div>Roll: ${roll.total}</div>
                </div>
                <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px;
                  background-color: ${colorMap[resultColorLower]}; color: ${textColor};">
                  ${resultColor.toUpperCase()}
                </div>
                <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${success ? '#4CAF50' : '#F44336'};">
                  ${success ? 'SUCCESS: Purchase Possible' : 'FAILURE: Cannot Afford'}
                </div>
                ${bankLoan && success ? `
                  <div style="padding: 5px 10px; font-size: 0.9em; background-color: #fffde7; border: 1px solid #ffd54f; margin-top: 5px;">
                    <strong>Bank loan approved</strong><br>
                    You must make a ${ranks[Math.max(0, resourceIndex - 2)]} Resource FEAT each month for ${itemIndex + 1} months.
                    <br>Failure to pay results in the bank reclaiming the item.
                  </div>` : ''}
              </div>
            `;
  
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: chatContent
            });

            // Log Resource FEAT to karma history
            const historyEntry = {
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: 0,
              type: "Resource FEAT",
              description: `${itemDescription} (${itemRank}) - ${success ? 'SUCCESS' : 'FAILED'}${bankLoan ? ' [Bank Loan]' : ''}`
            };
            
            const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
            currentHistory.push(historyEntry);
            
            if (typeof game.msh?.runAsGM === 'function') {
              game.msh.runAsGM({
                operation: 'update',
                targetActorUuid: this.actor.uuid,
                args: [{ "system.karma.history": currentHistory }]
              });
            } else {
              await this.actor.update({ "system.karma.history": currentHistory });
            }
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  // _onPopularityRoll method
  async _onPopularityRoll(html) {
    console.log("== POPULARITY ROLL START ==");
    console.log("Actor:", this.actor.name);
    console.log("Raw popularity object:", this.actor.system.attributes.popularity);
  
    const heroPopularity = this.actor.system.attributes.popularity.hero?.value ?? 0;
    const secretIdPopularity = this.actor.system.attributes.popularity.secretId?.value ?? 0;
    const isMutant = this.actor.system.powerOrigin === "mutant" || this.actor.system.isMutant;
  
    console.log("Hero Pop:", heroPopularity);
    console.log("Secret ID Pop:", secretIdPopularity);
    console.log("Is Mutant:", isMutant);
  
    const identityType = html.find('#identity-type').val() || "hero";
    const disposition = html.find('#disposition').val() || "neutral";
    const requestDescription = html.find('#request-description').val() || "request";
    const columnShift = parseInt(html.find('#column-shift').val()) || 0;
  
    console.log("Selected identity:", identityType);
    console.log("Disposition:", disposition);
    console.log("Request:", requestDescription);
    console.log("Column Shift:", columnShift);
  
    let usedPopValue, identityLabel;
    
    if (identityType === "secret") {
      usedPopValue = secretIdPopularity;
      identityLabel = `Secret ID - ${this.actor.system.identity}`;
    } else {
      usedPopValue = heroPopularity;
      identityLabel = `Hero ID - ${this.actor.name}`;
    }
      
    console.log("Used Popularity Value:", usedPopValue);
    console.log("Label:", identityLabel);
  
    const baseRank = this._getPopularityRank(usedPopValue);
    const shifted = applyColumnShiftToRank(baseRank, usedPopValue, columnShift);
    const effectiveRank = shifted.rank;
    const effectiveValue = shifted.value;
  
    let featColorNeeded = {
      friendly: "Green",
      neutral: "Yellow",
      unfriendly: "Red",
      hostile: "Impossible"
    }[disposition] || "Yellow";
  
    const isNegative = usedPopValue < 0;
    if (isNegative) featColorNeeded = "Yellow";
  
    if (featColorNeeded === "Impossible") {
      ui.notifications.warn("Hostile targets will not respond to Popularity requests.");
      return;
    }
  
    // ✅ Roll the dice and show 3D dice in chat
    const roll = new Roll("1d100");
    await roll.evaluate();
  
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} - ${identityLabel} Popularity Roll for ${requestDescription}`,
      rollMode: game.settings.get("core", "rollMode")
    });
  
    // ✅ Now apply roll logic
    const resultColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
    const color = resultColor.toLowerCase();
  
    const success =
      (featColorNeeded === "Green" && ["green", "yellow", "red"].includes(color)) ||
      (featColorNeeded === "Yellow" && ["yellow", "red"].includes(color)) ||
      (featColorNeeded === "Red" && color === "red");
  
    const rankDisplay = getPopularityRankWithRange(effectiveValue, this);
  
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${identityLabel} Popularity Roll for ${requestDescription}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>${identityLabel}</div>

          <div>Popularity: ${usedPopValue}${isNegative ? ' (Negative)' : ''}</div>
          <div>Target Disposition: ${disposition.charAt(0).toUpperCase() + disposition.slice(1)}</div>
          <div>Required FEAT: ${featColorNeeded}</div>
          <div>Column Shift: ${columnShift >= 0 ? "+" + columnShift : columnShift}</div>
          <div>Effective Rank: ${rankDisplay}</div>
          <div>Roll: ${roll.total}</div>
          ${isMutant ? '<div style="color: #aa6600;">Mutant Penalty Applied (-1 to awards/penalties)</div>' : ''}
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px;
          background-color: ${color === 'white' ? '#f8f8f8' :
            color === 'green' ? '#4CAF50' :
            color === 'yellow' ? '#FFC107' : '#F44336'};
          color: ${color === 'white' || color === 'yellow' ? '#333' : 'white'};">
          ${resultColor.toUpperCase()}
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${success ? '#4CAF50' : '#F44336'};">
          ${success ? 'SUCCESS: Request Granted' : 'FAILURE: Request Denied'}
        </div>
      </div>
    `;
  
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });

    // Log Popularity FEAT to karma history
    const featHistoryEntry = {
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: 0,
      type: "Popularity FEAT",
      description: `${requestDescription} (${disposition}) - ${success ? 'SUCCESS' : 'FAILED'}`
    };
    
    const featHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
    featHistory.push(featHistoryEntry);
    
    if (typeof game.msh?.runAsGM === 'function') {
      game.msh.runAsGM({
        operation: 'update',
        targetActorUuid: this.actor.uuid,
        args: [{ "system.karma.history": featHistory }]
      });
    } else {
      await this.actor.update({ "system.karma.history": featHistory });
    }
  
    if (isNegative) {
      new Dialog({
        title: "Negative Popularity Karma Loss",
        content: `<p>You lose Karma due to negative popularity.</p>
                  <div><label>Karma Loss:</label> <input type="number" id="karma-loss" value="1" min="1"></div>`,
        buttons: {
          confirm: {
            label: "Confirm",
            callback: html => {
              const loss = parseInt(html.find('#karma-loss').val()) || 1;
              
              // Add karma loss to history
              const historyEntry = {
                timestamp: new Date().toISOString(),
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -loss,
                type: "Karma Loss",
                description: `Lost karma from negative popularity`
              };
              
              const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
              currentHistory.push(historyEntry);
              
              game.msh.runAsGM({
                operation: 'update',
                targetActorUuid: this.actor.uuid,
                args: [{ "system.karma.history": currentHistory }]
              });
              
              ui.notifications.info(`${this.actor.name} lost ${loss} Karma.`);
            }
          }
        },
        default: "confirm"
      }).render(true);
    }
  }

// Add this helper method to the FaseripActorSheet class
_getPopularityRank(value) {
  if (value <= 0) return "Shift-0";
  if (value <= 2) return "Feeble";
  if (value <= 4) return "Poor";
  if (value <= 7) return "Typical";
  if (value <= 15) return "Good";
  if (value <= 25) return "Excellent";
  if (value <= 35) return "Remarkable";
  if (value <= 45) return "Incredible";
  if (value <= 62) return "Amazing";
  if (value <= 87) return "Monstrous";
  if (value <= 125) return "Unearthly";
  if (value <= 175) return "Shift-X";
  if (value <= 350) return "Shift-Y";
  if (value <= 999) return "Shift-Z";
  if (value <= 3000) return "Class 1000";
  if (value <= 5000) return "Class 3000";
  return "Class 5000";
}

// New method: _rollVehicleControl(vehicle)
_rollVehicleControl(vehicle) {
  const actor = this.actor;
  const agility = actor.system.abilities.agility?.value ?? 6;
  // --- Rank ladder + values (min thresholds) ---
  const rankTable = [
    "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
    "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
    "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];
  const rankMinValues = [0, 2, 4, 6, 10, 20, 30, 40, 50, 75, 100, 150, 200, 500, 1000, 3000, 5000, 10000];
  const rankValues = Object.fromEntries(rankTable.map((r, i) => [r, rankMinValues[i]]));

  const getRankFromValue = (val) => {
    for (let i = rankTable.length - 1; i >= 0; i--) {
      if (rankValues[rankTable[i]] <= val) return rankTable[i];
    }
    return rankTable[0];
  };

 // Compare RAW values to find limiting factor
  const controlRank = vehicle.system.control || "Typical";
  const controlCSLoss = Number(vehicle.system.controlCSLoss || 0);
  const controlIndex = Math.max(0, rankTable.indexOf(controlRank));

  // Driver Agility rank from numeric Agility score
  const driverAgiRank = getRankFromValue(agility);
  const driverAgiIndex = rankTable.indexOf(driverAgiRank);

  // Only apply CS losses if vehicle Control is STRICTLY LESS than driver Agility
  const isControlLimiting = (controlIndex < driverAgiIndex);

  // If Control < Agility: vehicle limits (apply CS losses)
  // If Control >= Agility: driver limits (NO CS losses)
  const adjustedControlIndex = isControlLimiting 
    ? Math.max(0, controlIndex - controlCSLoss)
    : controlIndex;
  const adjustedControlRank = rankTable[adjustedControlIndex];

  // Used FEAT rank = LOWER of driver agility vs adjusted vehicle control
  const baseRankIndex = Math.min(driverAgiIndex, adjustedControlIndex);
  const baseUsedRank = rankTable[baseRankIndex];
  
  // Numeric value for the base-used rank (some cards/logic expect this)
  const usedValue = rankValues[baseUsedRank];

  // Prevent control roll if vehicle is destroyed
  const bodyRank = vehicle.system.body || "Typical";
  const maxHP = rankValues[bodyRank] ?? 6;
  const currentHP = vehicle.system.bodyHP ?? maxHP;

  if (currentHP <= 0) {
    const message = `${actor.name} attempts to operate <strong>${vehicle.name}</strong>, but it is <span style="color:#b00"><strong>destroyed</strong></span> and cannot be controlled.`;

    // UI popup
    ui.notifications.error(`${vehicle.name} is destroyed and cannot be operated.`);

    // Chat card with matching styling
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#0d47a1;">
            <strong>${actor.name} - Vehicle Control FEAT</strong>
          </div>
          <div style="padding:5px 10px;font-size:.9em;">
            <div>Vehicle: ${vehicle.name}</div>
            <div>Driver Agility: ${driverAgiRank} (${agility})</div>
            <div>Control Rank: ${controlRank}${isControlLimiting && controlCSLoss > 0 ? ` — ${controlCSLoss} CS Lost → ${adjustedControlRank}` : ""}</div>
            <div>Used Rank: ${baseUsedRank}${cs !== 0 ? ` — Shift ${cs >= 0 ? '+' : ''}${cs} → ${shiftedRank}` : ""}</div>
            <div>Roll: ${controlRoll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
            ${stunt ? `<div>Stunt: ${stuntName || "(unnamed)"}${stuntFailure ? " — <span style='color:#c62828;'>FAILED</span>" : ""}</div>` : ""}
          </div>
           
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px 10px;font-size:.85em;text-align:center;">
            <div style="padding:4px;background:#f5f5f5;border:1px solid #ddd;border-radius:2px;">
              <div style="font-weight:600;color:#666;">White:</div>
              <div style="color:#c62828;">Crash</div>
            </div>
            <div style="padding:4px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:2px;">
              <div style="font-weight:600;color:#2e7d32;">Green:</div>
              <div>Maintained</div>
            </div>
            <div style="padding:4px;background:#fffde7;border:1px solid #fff176;border-radius:2px;">
              <div style="font-weight:600;color:#f57f17;">Yellow:</div>
              <div>Maintained</div>
            </div>
            <div style="padding:4px;background:#ffebee;border:1px solid #ef9a9a;border-radius:2px;">
              <div style="font-weight:600;color:#c62828;">Red:</div>
              <div>Maintained</div>
            </div>
          </div>

          <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${mainBg};color:${mainTx};">
            RESULT: ${featColor.toUpperCase()} — ${stuntFailure ? `STUNT FAILED` : (isCrash ? "OUT OF CONTROL" : "CONTROL MAINTAINED")}
          </div>
          ${crashDetails}
        </div>
      `
    });

    return;
  }

  new Dialog({
    title: `Vehicle Control FEAT: ${vehicle.name}`,
    content: `
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Vehicle:</label>
        <strong>${vehicle.name}</strong>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Driver:</label>
        <strong>${actor.name}</strong>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Used Rank:</label>
        <input type="text" value="${baseUsedRank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${usedValue})</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Column Shift:</label>
        <input id="cs" type="number" value="0" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Current Speed:</label>
        <select id="current-speed">
          ${rankTable.slice(0, 10).map(r => `<option value="${r}" ${r === (vehicle.system.speed || "Typical") ? "selected" : ""}>${r}</option>`).join('')}
        </select>
        <span style="color:#666;font-size:.85em;">(speed at moment of FEAT)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Karma Points:</label>
        <input id="karma" type="number" value="0" min="0" style="width:60px;">
        <span style="color:#666;font-size:.85em;">(spend only up to 100)</span>
      </div>

      <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Stunt Settings</div>
        <div style="margin-bottom:6px;">
          <label><input type="checkbox" id="stunt-check"> Attempting Stunt?</label>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:100px;">Stunt Name:</label>
          <input id="stunt-name" type="text" placeholder="e.g., Bootleg Turn" style="width:200px;">
        </div>
      </div>

      <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Crash Settings</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Crash Object:</label>
          <select id="crash-object">
            ${rankTable.slice(0, 10).map(r => `<option value="${r}" ${r === "Excellent" ? "selected" : ""}>${r}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Passengers:</label>
          <select id="buckled">
            <option value="yes">Buckled In (Blunt)</option>
            <option value="no">Not Buckled (Edged)</option>
          </select>
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll",
        callback: async html => {
          const cs = parseInt(html.find("#cs").val()) || 0;
          const currentSpeed = html.find("#current-speed").val();
          const karma = parseInt(html.find("#karma").val()) || 0;
          const crashObjRank = html.find("#crash-object").val();
          const buckled = html.find("#buckled").val();
          const stunt = html.find("#stunt-check")[0].checked;
          const stuntName = html.find("#stunt-name").val();

          const shiftedIndex = Math.min(Math.max(baseRankIndex + cs, 0), rankTable.length - 1);
          const shiftedRank = rankTable[shiftedIndex];
          const shiftedValue = rankValues[shiftedRank];

          const controlRoll = new Roll("1d100");
          await controlRoll.evaluate();
          await controlRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor.name} makes a Vehicle Control FEAT${stunt ? ` to perform a stunt: ${stuntName}` : ""}`
          });

          // Karma spending - uses lifetime karma only
          let cappedTotal = controlRoll.total;
          let karmaUsed = 0;

          if (karma > 0) {
            cappedTotal = Math.min(100, controlRoll.total + karma);
            karmaUsed = karma;

            // Create history entry for karma spending
            const historyEntry = {
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -karma,
              type: "Die Roll",
              description: `Spent karma on Vehicle Control for ${vehicle.name}`
            };
            const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
            currentHistory.push(historyEntry);
            await game.msh.runAsGM({
              operation: 'update',
              targetActorUuid: this.actor.uuid,
              args: [{ "system.karma.history": currentHistory }]
            });
          }
          const totalKarmaUsed = karmaUsed;

          // ---- Defense-style banner helpers (safe local fallbacks) ----
          const colorStyles = (globalThis.colorStyles)
            || (game?.msh?.ui?.colorStyles)
            || { white:"#f5f5f5", green:"#e8f5e9", yellow:"#fffde7", red:"#ffebee" };

          const textColor = (globalThis.textColor)
            || (game?.msh?.ui?.textColor)
            || (c => {
                const m = { white:"#333", green:"#1b5e20", yellow:"#5d4037", red:"#b71c1c" };
                return m[String(c).toLowerCase()] || "#333";
              });

          // FEAT color using your thresholds and the karma-capped total
          const getFEATColor = (rank, total) => {
            const [g, y, r] = {
              "Shift-0": [0, 36, 66], "Feeble": [6, 26, 56], "Poor": [16, 36, 66],
              "Typical": [26, 46, 76], "Good": [36, 56, 86], "Excellent": [46, 66, 91],
              "Remarkable": [51, 71, 96], "Incredible": [61, 81, 96], "Amazing": [66, 86, 96],
              "Monstrous": [71, 91, 96], "Unearthly": [76, 96, 100], "Shift-X": [91, 98, 100],
              "Shift-Y": [96, 99, 100], "Shift-Z": [98, 100, 100], "Class 1000": [100, 100, 100],
              "Class 3000": [100, 100, 100], "Class 5000": [100, 100, 100], "Beyond": [100, 100, 100]
            }[rank] ?? [36, 66, 91];
            if (total < g) return "white";
            if (total < y) return "green";
            if (total < r) return "yellow";
            return "red";
          };

          const featColor = getFEATColor(shiftedRank, cappedTotal).toLowerCase();
          const isCrash = (featColor === "white");
          const stuntFailure = (stunt && isCrash);

          // Crash sequence
          let crashDetails = "";
          if (isCrash) {
            // need current speed for crash sequence:
            const speedRank = currentSpeed || vehicle.system.speed || "Typical";
            const bodyRank  = vehicle.system.body  || "Typical";

            // CRITICAL FIX: Crash FEAT uses LOWER of Speed or Body (per rules page 53)
            // "as if the vehicle had a 'strength' equal to its Speed or Body, whichever is lower"
            const vehicleStrengthRank = rankValues[speedRank] <= rankValues[bodyRank]
              ? speedRank
              : bodyRank;

            const crashRoll = new Roll("1d100"); await crashRoll.evaluate();
            const crashColor = getFEATColor(vehicleStrengthRank, crashRoll.total).toLowerCase();
            const brokeThrough = (crashColor === "red");

            // Base damage = material strength OR Speed, whichever is HIGHER (per rules page 53)
            const baseDamageRank = brokeThrough ? crashObjRank : speedRank;
            const baseDamage     = rankValues[baseDamageRank];

            const protectionRank = vehicle.system.protection || "Typical";
            const protection     = rankValues[protectionRank];
            const netDamage      = Math.max(0, baseDamage - protection);

            // Post-crash FEAT vs Body to determine CS losses
            const bodyValue   = rankValues[bodyRank];
            const damageLevel = baseDamage > bodyValue ? "greater" : baseDamage === bodyValue ? "equal" : "less";
            const damageRoll  = new Roll("1d100"); await damageRoll.evaluate();
            const damageColor = getFEATColor(bodyRank, damageRoll.total).toLowerCase();

            let outcome = "";
            if (damageLevel === "greater") {
              outcome = damageColor === "red"    ? "Body -1CS"
                    : damageColor === "yellow" ? "Speed -1CS, Control FEAT required"
                    : damageColor === "green"  ? "Control -1CS, Control FEAT required"
                                                : "All -1CS, Vehicle out of control!";
            } else if (damageLevel === "equal") {
              outcome = damageColor === "red"    ? "No damage to vehicle"
                    : damageColor === "yellow" ? "Body -1CS"
                    : damageColor === "green"  ? "Speed -1CS, Control FEAT required"
                                                : "Control -1CS, Control FEAT required";
            } else {
              outcome = ["red", "yellow"].includes(damageColor) ? "No effect"
                    : damageColor === "green"  ? "Body -1CS, Control FEAT required"
                                                : "Control -1CS, damage to passengers, Control FEAT required";
            }

            // Apply effects to vehicle
            const updateData = {};

            if (damageLevel === "greater") {
              if (damageColor === "red")    updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
              if (damageColor === "yellow") updateData["system.speedCSLoss"]   = (vehicle.system.speedCSLoss   || 0) + 1;
              if (damageColor === "green")  updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              if (damageColor === "white") {
                updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
                updateData["system.speedCSLoss"]   = (vehicle.system.speedCSLoss   || 0) + 1;
                updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              }
            } else if (damageLevel === "equal") {
              if (damageColor === "yellow") updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
              if (damageColor === "green")  updateData["system.speedCSLoss"]   = (vehicle.system.speedCSLoss   || 0) + 1;
              if (damageColor === "white")  updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
            } else {
              if (damageColor === "green")  updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
              if (damageColor === "white")  updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
            }

            // HP tracking from Body rank min value
            const maxHP     = rankValues[bodyRank] ?? 6;
            const currentHP = vehicle.system.bodyHP ?? maxHP;
            updateData["system.bodyHP"] = Math.max(0, currentHP - netDamage);
            await vehicle.update(updateData);

            if (updateData["system.bodyHP"] === 0) {
              outcome += " <strong style='color:#c62828;'>Vehicle destroyed!</strong>";
            }

            // Use defense-style color helpers
            const bannerBg1 = colorStyles?.[crashColor] || "#eee";
            const bannerTx1 = (typeof textColor === "function") ? textColor(crashColor) : "#333";
            const bannerBg2 = colorStyles?.[damageColor] || "#eee";
            const bannerTx2 = (typeof textColor === "function") ? textColor(damageColor) : "#333";

            crashDetails = `
              <div style="padding:8px 10px;margin:0;background:#fff;border-top:1px solid #ddd;font-size:.9em;">
                <div style="font-weight:bold;margin-bottom:6px;color:#d32f2f;">Crash Outcome</div>
                <div>Vehicle Crash Strength: ${vehicleStrengthRank} (lower of Speed/Body)</div>
                <div>Crash Roll: ${crashRoll.total}</div>
                <div style="margin:8px 0;">
                  <div style="text-align:center;padding:8px;font-weight:bold;font-size:1em;border-radius:3px;background-color:${bannerBg1};color:${bannerTx1};">
                    CRASH FEAT: ${crashColor.toUpperCase()}
                  </div>
                </div>
                <div>${brokeThrough ? "✓ Vehicle broke through obstacle" : "✗ Vehicle stopped by obstacle"}</div>
                <div>Base Damage: ${baseDamageRank} (${baseDamage})</div>
                <div>After Protection: ${netDamage}</div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;">
                  <div>Post-Crash Roll: ${damageRoll.total}</div>
                  <div style="margin:6px 0;">
                    <div style="text-align:center;padding:8px;font-weight:bold;font-size:1em;border-radius:3px;background-color:${bannerBg2};color:${bannerTx2};">
                      POST-CRASH: ${damageColor.toUpperCase()}
                    </div>
                  </div>
                  <div><strong>${stuntFailure ? `Stunt caused crash!` : outcome}</strong></div>
                </div>
              </div>
            `;
          }

          // Defense-style result banner for the main FEAT
          const mainBg = colorStyles?.[featColor] || "#eee";
          const mainTx = (typeof textColor === "function") ? textColor(featColor) : "#333";

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#a52a2a;">
                  <strong>${actor.name} - Vehicle Control FEAT</strong>
                </div>
                <div style="padding:5px 10px;font-size:.9em;">
                  <div>Vehicle: ${vehicle.name}</div>
                  <div>Driver Agility: ${driverAgiRank} (${agility})</div>
                  <div>Control Rank: ${controlRank}${isControlLimiting && controlCSLoss > 0 ? ` — ${controlCSLoss} CS Lost → ${adjustedControlRank}` : ""}</div>
                  <div>Used Rank: ${baseUsedRank}${cs !== 0 ? ` — Shift ${cs >= 0 ? '+' : ''}${cs} → ${shiftedRank}` : ""}</div>
                  <div>Roll: ${controlRoll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
                  ${stunt ? `<div style="margin-top:4px;"><strong>Stunt:</strong> ${stuntName || "(unnamed)"}</div>` : ""}
                </div>

                <div style="padding:8px 10px;border-top:1px solid #ddd;">
                  <div style="font-weight:bold;margin-bottom:6px;">Possible Results:</div>
                  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:.85em;text-align:center;">
                    <div style="padding:6px 4px;background:${featColor === 'white' ? '#333' : '#e0e0e0'};color:${featColor === 'white' ? '#fff' : '#666'};border-radius:2px;font-weight:600;" title="Vehicle crashes and goes out of control. Damage to passengers and vehicle.">
                      <div>White:</div>
                      <div>Crash</div>
                    </div>
                    <div style="padding:6px 4px;background:${featColor === 'green' ? '#4caf50' : '#e0e0e0'};color:${featColor === 'green' ? '#fff' : '#666'};border-radius:2px;font-weight:600;" title="Control maintained successfully.">
                      <div>Green:</div>
                      <div>Control</div>
                    </div>
                    <div style="padding:6px 4px;background:${featColor === 'yellow' ? '#fbc02d' : '#e0e0e0'};color:${featColor === 'yellow' ? '#333' : '#666'};border-radius:2px;font-weight:600;" title="Control maintained successfully.">
                      <div>Yellow:</div>
                      <div>Control</div>
                    </div>
                    <div style="padding:6px 4px;background:${featColor === 'red' ? '#d32f2f' : '#e0e0e0'};color:${featColor === 'red' ? '#fff' : '#666'};border-radius:2px;font-weight:600;" title="Control maintained successfully.">
                      <div>Red:</div>
                      <div>Control</div>
                    </div>
                  </div>
                </div>

                <div style="text-align:center;padding:10px;margin:8px 0;font-weight:bold;font-size:1.1em;text-transform:uppercase;border-radius:3px;background:${mainBg};color:${mainTx};">
                  ${stuntFailure ? `STUNT FAILED — ${stuntName || "UNNAMED STUNT"}` : `RESULT: ${featColor.toUpperCase()} — ${isCrash ? "OUT OF CONTROL" : "CONTROL MAINTAINED"}`}
                </div>
                ${crashDetails}
              </div>
            `
          });
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}

  async _rollStandaloneStunt(stunt, stuntIndex) {
    console.log("=== POWER STUNT DEBUG START ===");
    console.log("Stunt:", stunt.name);
    console.log("Times Used:", stunt.timesUsed);
    console.log("Rank:", stunt.rank);
    console.log("Value:", stunt.value);
    
    const rank = stunt.rank || "Typical";
    const rankValue = stunt.value || 6;
    
    // Check if stunt is mastered (10+ uses) - no FEAT or Karma needed
    if (stunt.timesUsed >= 10) {
      console.log("Stunt is MASTERED (10+ uses) - auto success");
      ui.notifications.info(`${stunt.name} is mastered! No FEAT or Karma required.`);
      
      const chatHtml = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Rank: ${rank} (${rankValue})</div>
            <div>Status: MASTERED (10+ uses)</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50 !important; color: white;">
            AUTOMATIC SUCCESS
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatHtml
      });
      return;
    }
    
    // Check if actor has at least 100 karma available
    const availableKarma = this.actor.availableKarma || 0;
    console.log("Available Karma:", availableKarma);
    
    if (availableKarma < 100) {
      console.log("INSUFFICIENT KARMA - Cannot perform stunt");
      ui.notifications.error(`Insufficient Karma! ${stunt.name} requires 100 Karma. You have ${availableKarma} available.`);
      
      const chatHtml = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Required Karma: 100</div>
            <div>Available Karma: ${availableKarma}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #F44336 !important; color: white;">
            INSUFFICIENT KARMA
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatHtml
      });
      return;
    }
    
    // Determine required FEAT color based on current times used
    let requiredColor;
    if (stunt.timesUsed === 0) {
      requiredColor = "red";
      console.log("Times used = 0: Required FEAT = RED");
    } else if (stunt.timesUsed <= 3) {
      requiredColor = "yellow";
      console.log("Times used 1-3: Required FEAT = YELLOW");
    } else {
      requiredColor = "green";
      console.log("Times used 4-9: Required FEAT = GREEN");
    }
    
    console.log("Required FEAT Color:", requiredColor);
    
    // Calculate maximum additional karma they can spend
    const maxAdditionalKarma = availableKarma - 100;
    console.log("Max additional karma available:", maxAdditionalKarma);
    
    // Prompt for optional Karma bonus
    const karmaInput = await Dialog.prompt({
      title: "Add Karma Bonus to Roll?",
      label: "Optional Karma bonus (in addition to 100 Karma base cost):",
      callback: html => parseInt(html.find("input").val() || "0"),
      content: `
        <p>Base cost: <strong>100 Karma</strong></p>
        <p>Available for bonus: <strong>${maxAdditionalKarma} Karma</strong></p>
        <p>Required FEAT: <strong style="color:${requiredColor}">${requiredColor.toUpperCase()}</strong></p>
        <label>Additional Karma bonus to roll (max ${maxAdditionalKarma}):</label>
        <input type="number" min="0" max="${maxAdditionalKarma}" value="0" style="width:100%"/>
      `
    });
    
    const karmaBonus = Math.min(maxAdditionalKarma, Number.isNaN(karmaInput) ? 0 : karmaInput);
    console.log("Karma bonus:", karmaBonus);
    
    // Roll 1d100
    const roll = new Roll("1d100");
    await roll.evaluate();
    console.log("Roll result:", roll.total);
    
    // Calculate total with karma bonus
    const totalRoll = Math.min(100, roll.total + karmaBonus);
    console.log("Total roll (with karma):", totalRoll);
    
    // Use the universal table to determine FEAT result color
    const resultColor = game.msh.rollUniversalTable(rank, totalRoll);
    console.log("Result color from universal table:", resultColor);
    console.log("Result color (lowercase):", resultColor.toLowerCase());
    
    // Check if the result meets the requirement
    const resultColorLower = resultColor.toLowerCase();
    console.log("Checking success with:");
    console.log("  Required:", requiredColor);
    console.log("  Got:", resultColorLower);
    
    let success = false;
    if (requiredColor === "green") {
      success = ["green", "yellow", "red"].includes(resultColorLower);
      console.log("  Green check: needs green/yellow/red, got", resultColorLower, "=", success);
    } else if (requiredColor === "yellow") {
      success = ["yellow", "red"].includes(resultColorLower);
      console.log("  Yellow check: needs yellow/red, got", resultColorLower, "=", success);
    } else if (requiredColor === "red") {
      success = resultColorLower === "red";
      console.log("  Red check: needs red, got", resultColorLower, "=", success);
    }
    
    console.log("FINAL SUCCESS VALUE:", success);
    
    // Increment usage count if successful
    if (success) {
      console.log("Success! Incrementing usage count from", stunt.timesUsed, "to", stunt.timesUsed + 1);
      const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
      stunts[stuntIndex].timesUsed++;
      await this.actor.update({ "system.stunts": stunts });
    } else {
      console.log("Failed! Usage count stays at", stunt.timesUsed);
    }
    
    // Log Karma spending to history
    const karmaSheet = await import('./karma.js').then(m => new m.KarmaSheet(this.actor));
    
    // Base 100 Karma cost
    await karmaSheet._addKarmaEvent({
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -100,
      type: "Power Stunt",
      description: `Attempted stunt "${stunt.name}" (${requiredColor} FEAT required)`
    });
    
    // Additional karma bonus
    if (karmaBonus > 0) {
      await karmaSheet._addKarmaEvent({
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: -karmaBonus,
        type: "Die Roll",
        description: `Karma bonus for "${stunt.name}" power stunt`
      });
    }
    
    // Determine result text
    const resultText = success ? "STUNT SUCCEEDED" : "STUNT FAILED";
    
    // Build chat content - matching power roll format exactly
    let content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>Base Rank: ${rank} (${rankValue})</div>
          <div>Times Used: ${stunt.timesUsed} → Required FEAT: ${requiredColor.toUpperCase()}</div>
          <div>Base Karma Cost: 100</div>
          ${karmaBonus > 0 ? `<div>Additional Karma Spent: ${karmaBonus}</div>` : ''}
          <div>Roll: ${roll.total}${karmaBonus > 0 ? ` + Karma: ${karmaBonus}` : ''} = ${totalRoll}</div>
          ${success ? `<div>Usage count increased to ${stunt.timesUsed + 1}</div>` : ''}
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${resultColorLower === 'white' ? '#f8f8f8 !important' :
            resultColorLower === 'green' ? '#4CAF50 !important' :
              resultColorLower === 'yellow' ? '#FFC107 !important' :
                '#F44336 !important'};
          color: ${resultColorLower === 'white' || resultColorLower === 'yellow' ? '#333' : 'white'};">
          ${resultText} (${resultColor.toUpperCase()})
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
    
    console.log("=== POWER STUNT DEBUG END ===");
  }

  _getFeatColor(rankValue, roll) {
    if (roll >= 91) return "red";
    if (roll >= 66) return rankValue >= 36 ? "red" : "yellow";
    if (roll >= 36) return rankValue >= 16 ? "yellow" : "green";
    return "green";
  }

async _rollAction(actionType, abilityName) {
  const actor = this.actor;
  
  // Get action information
  const actionInfo = ACTION_INFO[actionType];
  if (!actionInfo) {
    ui.notifications.warn(`No information found for action: ${actionType}`);
    return;
  }
  
  try {
    // Perform the roll
    const rollResult = await ActionDispatcher.roll(actionType, {
      actor,
      abilityName,
      opts: {
        actionType,
        karma: 0,
        pulled: false,
        source: "hands"
      }
    });
    
    // Create chat card with action info
    await this._showActionInfo(actionInfo, actor, rollResult);
    
  } catch (err) {
    console.error(err);
    ui.notifications.error(err.message ?? "Action failed.");
  }
}

  async _showActionInfo(actionType) {
    const actionInfo = ACTION_INFO[actionType];
    
    if (!actionInfo) {
      ui.notifications.warn(`No information found for action: ${actionType}`);
      return;
    }
    
    // Create simple info card
    const content = `
      <div class="marvel-action-info">
        <h3 style="margin-top:0; border-bottom: 2px solid #444; padding-bottom: 8px;">
          <strong>${actionInfo.name}</strong>
          <span style="color: #666; font-size: 0.9em;">(${actionInfo.ability})</span>
        </h3>
        
        <p style="font-style: italic; color: #555;">
          ${actionInfo.description}
        </p>
        
        <p style="margin: 8px 0;">
          <strong>Possible Results:</strong> ${actionInfo.effects.join(', ')}
        </p>
        
        <div style="background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 8px;">
          <strong>Details:</strong><br>
          ${actionInfo.details}
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  }

  _getResultHoverText(actionType, color) {
    const hoverTexts = {
      'blunt-attack': {
        white: 'Miss - No damage inflicted',
        green: 'Hit - Inflict Strength rank damage',
        yellow: 'Slam - Inflict damage and may Slam opponent',
        red: 'Stun - Inflict damage and may Stun opponent'
      },
      'edged-attack': {
        white: 'Miss - No damage inflicted',
        green: 'Hit - Inflict weapon damage',
        yellow: 'Stun - Inflict damage and may Stun opponent',
        red: 'Kill - Inflict damage and may Kill opponent'
      },
      'shooting': {
        white: 'Miss - No damage, may hit another target',
        green: 'Hit - Inflict weapon damage',
        yellow: 'Bullseye - Hit specific target area',
        red: 'Kill - Inflict damage and may Kill opponent'
      },
      'throwing-edged': {
        white: 'Miss - No damage, may hit another target',
        green: 'Hit - Inflict weapon damage',
        yellow: 'Stun - Inflict damage and may Stun opponent',
        red: 'Kill - Inflict damage and may Kill opponent'
      },
      'throwing-blunt': {
        white: 'Miss - No damage',
        green: 'Hit - Inflict Strength or material damage',
        yellow: 'Hit - Inflict Strength or material damage',
        red: 'Stun - Inflict damage and may Stun opponent'
      },
      'energy': {
        white: 'Miss - No damage inflicted',
        green: 'Hit - Inflict power rank damage',
        yellow: 'Bullseye - Hit specific target area',
        red: 'Kill - Inflict damage and may Kill opponent'
      },
      'force': {
        white: 'Miss - No damage inflicted',
        green: 'Hit - Inflict power rank damage',
        yellow: 'Bullseye - Hit specific target area',
        red: 'Stun - Inflict damage and may Stun opponent'
      },
      'grappling': {
        white: 'Miss - Failed to hold opponent, no other actions',
        green: 'Miss - Failed to hold opponent, no other actions',
        yellow: 'Partial Hold - Grabbed limb, target acts at -2CS',
        red: 'Hold - Target fully restrained, can inflict Strength damage'
      },
      'grabbing': {
        white: 'Miss - Item not taken, may be knocked loose',
        green: 'Take - Gained possession if Strength ≥ target',
        yellow: 'Grab - Gained possession regardless of Strength',
        red: 'Break - Item taken or potentially damaged/activated'
      },
      'escaping': {
        white: 'Miss - Still held, no other actions this turn',
        green: 'Escape - Free of hold, may move half speed',
        yellow: 'Escape - Free of hold, may move half speed',
        red: 'Reverse - Free and may counter-grapple or act at -2CS'
      },
      'charging': {
        white: 'Miss - No damage, continue moving half speed in straight line\nRequirements: Move 1+ areas, +1CS per area (max +3CS)\nAgility FEAT needed to change direction after miss',
        green: 'Hit - Damage = Endurance/Body Armor (higher) + 2pts per area moved\nRequirements: Move 1+ areas, +1CS per area (max +3CS)\nBody Armor may reflect damage to attacker',
        yellow: 'Slam - Damage as Hit result, plus may Slam opponent\nDamage = Endurance/Body Armor (higher) + 2pts per area\nBody Armor may reflect damage to attacker',
        red: 'Stun - Damage as Hit result, plus may Stun opponent\nDamage = Endurance/Body Armor (higher) + 2pts per area\nBody Armor may reflect damage to attacker'
      },
      'dodging': {
        white: 'None - No reduction to incoming attacks. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
        green: '-2 CS - Reduce attacker CS by 2. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
        yellow: '-4 CS - Reduce attacker CS by 4. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
        red: '-6 CS - Reduce attacker CS by 6. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action'
      },
      'evading': {
        white: 'Auto-hit - Opponent automatically scores green result',
        green: 'Evasion - Dodge successful, no damage taken',
        yellow: 'Evasion +1CS - Dodge and gain +1CS next attack',
        red: 'Evasion +2CS - Dodge and gain +2CS next attack'
      },
      'blocking': {
        white: '-6 CS - Strength shifted down 6 columns as Body Armor',
        green: '-4 CS - Strength shifted down 4 columns as Body Armor',
        yellow: '-2 CS - Strength shifted down 2 columns as Body Armor',
        red: '+1 CS - Strength shifted up 1 column as Body Armor'
      },
      'catching': {
        white: 'Autohit - Object hits you instead (auto green)',
        green: 'Miss - Failed to catch, attack gets +1CS',
        yellow: 'Damage - Caught but may damage object/person',
        red: 'Catch - Successfully caught with no damage'
      },
      'stun': {
        white: '1-10 rounds - Knocked out for 1-10 rounds',
        green: '1 round - Knocked down, no action next round',
        yellow: 'No effect - Character not stunned',
        red: 'No effect - Character not stunned'
      },
      'slam': {
        white: 'Grand Slam - Knocked away at attacker Strength speed',
        green: '1 area - Knocked back one area',
        yellow: 'Stagger - Knocked back a step, no longer adjacent',
        red: 'No Slam - Not affected by slam'
      },
      'kill': {
        white: 'Endurance Loss - Dying, lose 1 rank/turn',
        green: 'E/S - Endurance Loss only if Edged/Shooting attack',
        yellow: 'No effect - Character survives, takes damage only',
        red: 'No effect - Character survives, takes damage only'
      }
    };
    
    return hoverTexts[actionType]?.[color] || `${color} result for ${actionType}`;
  }

  async _sendMovementToChat() {
    const info = this.actor.movementInfo;
    const movement = this.actor.system.movement || {};
    const FaseripActor = CONFIG.Actor.documentClass;
    
    const runAreas = movement.run || this.actor.suggestedMovement;
    const swimAreas = movement.swim || 1;
    const flyAreas = movement.fly || 0;
    const teleportAreas = movement.teleport || 0;
    const leapAreas = movement.leap || info.leap.acrossAreas;
    
    // Get flight info from air speed table
    const flightInfo = flyAreas > 0 ? FaseripActor.getFlightInfo(flyAreas) : null;
    const flyMph = flightInfo ? flightInfo.mph : 0;
    const lowAltitudeMax = flightInfo ? flightInfo.groundAreas : 0;
    const flightRank = flightInfo ? flightInfo.rank : "";
    // Get cruising speeds (2 ranks lower - no exhaustion checks)
    const cruisingFlight = flyAreas > 0 ? FaseripActor.getCruisingFlight(flyAreas) : null;
    const cruisingRun = runAreas > this.actor.suggestedMovement ? FaseripActor.getCruisingLand(runAreas) : null;
    
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#0d47a1;">
          <strong>${this.actor.name} - Movement Reference</strong>
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div><strong>Run:</strong> ${runAreas} areas/turn (${runAreas * 15} mph)${cruisingRun ? ` <em>(cruise: ${cruisingRun.areas}, max subject to exhaustion)</em>` : ''}</div>
          <div><strong>Leap:</strong> ${leapAreas} areas across</div>
          <div><strong>Swim:</strong> ${swimAreas} areas/turn (${swimAreas * 15} mph)</div>
          ${flyAreas > 0 ? `<div><strong>Fly:</strong> ${flyAreas} areas/turn (${flyMph} mph) — ${flightRank}${cruisingFlight ? ` <em>(cruise: ${cruisingFlight.areas}, max subject to exhaustion)</em>` : ''}</div>` : ''}
          ${teleportAreas > 0 ? `<div><strong>Teleport:</strong> ${teleportAreas} areas (instantaneous)</div>` : ''}
        </div>
        
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Leaping (Strength: ${info.strengthRank})</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            <div>Across: ${info.leap.acrossFeet}' (${info.leap.acrossAreas} areas)</div>
            <div>Up: ${info.leap.upFeet}' (${info.leap.upFloors} floors)</div>
            <div>Down: ${info.leap.downFeet}' (${info.leap.downFloors} floors)</div>
            <div style="margin-top:5px;"><em>Half distance: automatic</em></div>
            <div><em>Full distance: Green Strength FEAT</em></div>
            <div><em>x2 distance: Red Strength FEAT</em></div>
          </div>
        </details>
        
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Exhaustion (Endurance: ${info.exhaustion.enduranceRank})</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            ${["Unearthly", "Shift-X", "Shift X", "Shift-Y", "Shift Y", "Shift-Z", "Shift Z", "Class 1000", "Class 3000", "Class 5000"].includes(info.exhaustion.enduranceRank) ? 
              `<div><strong>IMMUNE</strong> - Unearthly+ Endurance exempt from exhaustion</div>` :
              `<div>After <strong>${info.exhaustion.threshold} turns</strong>: Green Endurance FEAT or rest 1-10 turns</div>
              <div>After <strong>${info.exhaustion.threshold * 2} turns</strong>: Yellow FEAT or rest 2-20 turns</div>
              <div>After <strong>${info.exhaustion.threshold * 3} turns</strong>: Red FEAT or rest 3-30 turns</div>
              <div>After <strong>${info.exhaustion.threshold * 4} turns</strong>: Mandatory rest 3-30 turns</div>
              <div style="margin-top:5px;"><em>Moving 2 ranks slower: no exhaustion check needed</em></div>
              <div><em>Devices, vehicles, robots: exempt from exhaustion</em></div>`
            }
          </div>
        </details>
        
        ${flyAreas > 0 ? `
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Flight Rules (${flightRank})</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            ${cruisingFlight ? `<div><strong>Cruising:</strong> ${cruisingFlight.areas} areas/turn (${cruisingFlight.mph} mph) - no exhaustion</div>` : ''}
            ${cruisingFlight ? `<div><strong>Max Speed:</strong> ${flyAreas} areas/turn (${flyMph} mph) - subject to exhaustion</div>` : ''}
            <div>Acceleration: ${info.acceleration} areas/turn</div>
            <div>Low altitude/enclosed max: ${lowAltitudeMax} areas/turn</div>
            <div>Exceeding ${lowAltitudeMax} areas requires Agility FEAT</div>
            <div>90° turn costs 1 area</div>
            <div>>90° turn requires Agility FEAT</div>
            <div>Landing at >3 areas/turn requires Agility FEAT</div>
          </div>
        </details>
        ` : ''}
        
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Other Movement Rules</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            <div>Actions while moving: <strong>half speed</strong></div>
            <div>Turning >90°: <strong>half speed</strong></div>
            <div>Through doorway: +½ area</div>
            <div>Breaking through wall: -1 to -3 areas (by material)</div>
          </div>
        </details>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: cardHtml
    });
  }

  _openUniversalTablePopout(rollData = null) {
    // Use existing instance or create new one
    if (!this._universalTablePopout) {
      this._universalTablePopout = new UniversalTablePopout();
    }
    this._universalTablePopout.setRollData(rollData);
    this._universalTablePopout.render(true);
  }

  // Character Generation Tab Initialization
  _initChargenTab(html) {
    const chargenTab = html.find('.chargen-tab');
    if (!chargenTab.length) return;

    // Initialize the ChargenUIManager if not already done
    if (!this._chargenManager) {
      this._chargenManager = new ChargenUIManager(this, html);
      this._chargenManager.bindEvents();
    } else {
      // Update the html reference for re-renders
      this._chargenManager.html = html;
      // Re-check if we need to bind events (for fresh html)
      if (!this._chargenManager._boundEvents) {
        this._chargenManager.bindEvents();
      }
    }
  }
  
    /**
   * Handle universal table rolls for the in-sheet Universal Table tab.
   * Mirrors the behavior of UniversalTablePopout._onUniversalTableRoll,
   * but targets the actor sheet's table.
   */
  _onSheetUniversalTableRoll(data) {
    // Only proceed if the sheet is actually rendered
    if (!this.rendered) return;

    const { rank, roll } = data;
    const html = this.element;
    if (!html || !html.length) return;

    // Normalize rank name using the same mapping as the popout
    let normalizedRank = UniversalTablePopout.RANK_ALIASES[rank] || rank;

    // Find column index for this rank
    const colIndex = UniversalTablePopout.RANK_ORDER.indexOf(normalizedRank);
    if (colIndex === -1) return;

    // Clear previous highlights inside the sheet
    html.find('.rank-cell').removeClass('roll-highlight');

    // Find the row matching the roll
    const rows = html.find('tbody tr');
    rows.each((i, row) => {
      const $row = $(row);
      const label = $row.find('th').first().text().trim();
      if (!label) return;

      // Parse roll ranges like "02-03", "04-06", or single "01", "100"
      let match = false;
      if (label.includes('–') || label.includes('-')) {
        const [min, max] = label.split(/[–-]/).map(n => parseInt(n));
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
          match = roll >= min && roll <= max;
        }
      } else {
        const numericLabel = parseInt(label);
        if (!Number.isNaN(numericLabel)) {
          match = roll === numericLabel;
        }
      }

      if (match) {
        // Highlight the cell at colIndex within this row
        const cell = $row.find('td').eq(colIndex);
        cell.addClass('roll-highlight');
      }
    });
  }

  // other methods
}

class UniversalTablePopout extends Application {
  // Rank order matching the table columns (0-indexed)
  static RANK_ORDER = [
    "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", "Incredible",
    "Amazing", "Monstrous", "Unearthly", "Shift-X", "Shift-Y", "Shift-Z",
    "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];

  // Alternate rank names mapping
  static RANK_ALIASES = {
    "Shift X": "Shift-X",
    "Shift Y": "Shift-Y",
    "Shift Z": "Shift-Z",
    "Shift 0": "Shift-0"
  };

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "universal-table-popout",
      title: "Universal Table",
      template: "systems/msh-faserip/templates/universal-table-popout.html",
      width: 750,
      height: 500,
      resizable: true,
      popOut: true
    });
  }

  constructor(options = {}) {
    super(options);
    this.rollData = null;
    this._hookId = null;
  }

  setRollData(data) {
    this.rollData = data;
  }

  getData() {
    return { rollData: this.rollData };
  }

  render(force = false, options = {}) {
    // Register hook to listen for universal table rolls
    if (!this._hookId) {
      this._hookId = Hooks.on('msh-faserip.universalTableRoll', (data) => {
        this._onUniversalTableRoll(data);
      });
    }
    return super.render(force, options);
  }

  async close(options = {}) {
    // Unregister hook when window closes
    if (this._hookId) {
      Hooks.off('msh-faserip.universalTableRoll', this._hookId);
      this._hookId = null;
    }
    return super.close(options);
  }

  _onUniversalTableRoll(data) {
    if (!this.rendered) return;
    
    const { rank, roll, color } = data;
    const html = this.element;
    
    // Normalize rank name
    let normalizedRank = UniversalTablePopout.RANK_ALIASES[rank] || rank;
    
    // Find column index for this rank
    const colIndex = UniversalTablePopout.RANK_ORDER.indexOf(normalizedRank);
    if (colIndex === -1) return;
    
    // Clear previous highlights
    html.find('.rank-cell').removeClass('roll-highlight');
    
    // Find the row matching the roll
    const rows = html.find('tbody tr');
    rows.each((i, row) => {
      const $row = $(row);
      const label = $row.find('th').first().text().trim();
      
      // Parse roll ranges like "02-03", "04-06", or single "01", "100"
      let match = false;
      if (label.includes('–') || label.includes('-')) {
        const [min, max] = label.split(/[–-]/).map(n => parseInt(n));
        match = roll >= min && roll <= max;
      } else {
        match = roll === parseInt(label);
      }
      
      if (match) {
        // Highlight the cell at colIndex
        const cell = $row.find('td').eq(colIndex);
        cell.addClass('roll-highlight');
      }
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    if (this.rollData) {
      const { roll, rankIndex, color } = this.rollData;
      
      // Find the row matching the roll
      const rows = html.find('tbody tr');
      rows.each((i, row) => {
        const $row = $(row);
        const label = $row.find('th').first().text().trim();
        
        // Parse roll ranges like "02-03", "04-06", or single "01", "100"
        let match = false;
        if (label.includes('-')) {
          const [min, max] = label.split('-').map(n => parseInt(n));
          match = roll >= min && roll <= max;
        } else {
          match = roll === parseInt(label);
        }
        
        if (match && rankIndex >= 0) {
          // Highlight the cell at rankIndex (add 1 to skip the th)
          const cell = $row.find('td').eq(rankIndex);
          cell.addClass('highlighted');
        }
      });
    }
    
    // Cell click highlighting
    html.find('.rank-cell').click(ev => {
      html.find('.rank-cell').removeClass('highlighted');
      $(ev.currentTarget).addClass('highlighted');
    });
  }
}