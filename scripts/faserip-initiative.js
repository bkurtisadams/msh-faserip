// faserip-initiative.js - Final version for Marvel FASERIP initiative
// Addresses all issues with multiple rolls and proper chat messages

export class FaseripInitiative {
  static initialized = false;
  static isRolling = false;
  
  /**
   * Register initiative-related settings
   */
  static registerSettings() {
    game.settings.register("msh-faserip", "useCustomInitiative", {
      name: "Use FASERIP Initiative Rules",
      hint: "Enable side-based initiative with Intuition modifiers.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => {
        ui.combat?.render();
      }
    });
    
    game.settings.register("msh-faserip", "autoRerollInitiative", {
      name: "Auto Reroll Initiative Each Round",
      hint: "Automatically reroll initiative at the start of each new round.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
  }

  /**
   * Initialize the FASERIP initiative system
   */
  static init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log("FASERIP Initiative: Initializing");
    
    // Register settings
    this.registerSettings();
    
    // Apply hooks - we add a small delay to ensure this happens after core Foundry initialization
    setTimeout(() => this._registerHooks(), 100);
  }
  
  /**
   * Register all necessary hooks
   */
  static _registerHooks() {
    // CRITICAL: Replace the standard initiative formula
    CONFIG.Combat.initiative = {
      formula: "1d10",
      decimals: 0
    };
    
    // CRITICAL: Override getRollData to prevent automatic initiative rolling
    const originalGetRollData = Combat.prototype.getInitiativeRollData;
    Combat.prototype.getInitiativeRollData = function(combatant) {
      if (game.settings.get("msh-faserip", "useCustomInitiative")) {
        // If using our system, return minimal data (no formula)
        return { formula: "", decimals: 0 };
      }
      
      // Otherwise use original method
      return originalGetRollData.call(this, combatant);
    };
    
    // CRITICAL: Override the rollInitiative method
    const originalRollInitiative = Combat.prototype.rollInitiative;
    Combat.prototype.rollInitiative = function(ids, options={}) {
      // If using our system, use our method instead
      if (game.settings.get("msh-faserip", "useCustomInitiative")) {
        // If it's already from our system, proceed
        if (options.faserip) {
          return originalRollInitiative.call(this, ids, options);
        }
        
        console.log("FASERIP Initiative: Intercepting rollInitiative");
        
        // Use our side initiative instead
        FaseripInitiative.rollSideInitiative(this);
        return this;
      }
      
      // Otherwise use original method
      return originalRollInitiative.call(this, ids, options);
    };
    
    // Additional hooks
    Hooks.on("renderCombatTracker", this._onRenderCombatTracker.bind(this));
    Hooks.on("getSceneControlButtons", this._addInitiativeConfigButton.bind(this));
    Hooks.on("updateCombat", this._handleUpdateCombat.bind(this));
    
    // Make sure combatants have side flags
    Hooks.on("createCombatant", this._onCreateCombatant.bind(this));
  }
  
  /**
   * When a combatant is added, assign side
   */
  static async _onCreateCombatant(combatant, options, userId) {
    if (!game.settings.get("msh-faserip", "useCustomInitiative")) return;
    
    // Set side flag
    const isPC = combatant.actor?.hasPlayerOwner;
    await combatant.setFlag("msh-faserip", "side", isPC ? "pc" : "npc");
  }
  
  /**
   * Handle combat updates (round changes)
   */
  static _handleUpdateCombat(combat, update, options, userId) {
    // Only proceed if FASERIP and auto-reroll enabled
    if (!game.settings.get("msh-faserip", "useCustomInitiative") || 
        !game.settings.get("msh-faserip", "autoRerollInitiative")) {
      return;
    }
    
    // Check if round advanced
    if (update.round && combat.previous?.round && update.round > combat.previous.round) {
      console.log(`FASERIP Initiative: Round advanced to ${update.round}, rerolling initiative`);
      
      // Wait a moment for update to complete
      setTimeout(() => {
        this.rollSideInitiative(combat);
      }, 100);
    }
  }
  
  /**
   * Modify combat tracker UI
   */
  static _onRenderCombatTracker(app, html, data) {
    // Only if FASERIP is enabled
    if (!game.settings.get("msh-faserip", "useCustomInitiative")) return;
    
    const combat = app.viewed;
    if (!combat) return;
    
    // Get initiative data
    const pcInit = combat.getFlag("msh-faserip", "pcInitiative");
    const npcInit = combat.getFlag("msh-faserip", "npcInitiative");
    const pcMod = combat.getFlag("msh-faserip", "pcModifier") || 0;
    const npcMod = combat.getFlag("msh-faserip", "npcModifier") || 0;
    const pcRoll = combat.getFlag("msh-faserip", "pcRoll");
    const npcRoll = combat.getFlag("msh-faserip", "npcRoll");
    const goesFirst = combat.getFlag("msh-faserip", "goesFirst");
    const pcHighestName = combat.getFlag("msh-faserip", "pcHighestName") || "";
    const npcHighestName = combat.getFlag("msh-faserip", "npcHighestName") || "";
    
          // Add compact info below round number
    const roundDisplay = html.find('.combat-round');
    if (roundDisplay.length && roundDisplay.next('.faserip-initiative-bar').length === 0) {
      // Format the Side A (PC) display text
      let pcText = `Side A `;
      if (pcRoll !== undefined) {
        pcText += `${pcRoll}`;
        if (pcMod > 0 && pcRoll !== 1) pcText += `+${pcMod}`;
        pcText += `=${pcInit}`;
      } else {
        pcText += `-`;
      }
      
      // Format the Side B (NPC) display text
      let npcText = `Side B `;
      if (npcRoll !== undefined) {
        npcText += `${npcRoll}`;
        if (npcMod > 0 && npcRoll !== 1) npcText += `+${npcMod}`;
        npcText += `=${npcInit}`;
      } else {
        npcText += `-`;
      }
      
      const infoBar = $(`
        <div class="faserip-initiative-bar">
          ${pcText}
          ${goesFirst === 'pc' ? ' <span class="goes-first">(First)</span>' : ''}
          — 
          ${npcText}
          ${goesFirst === 'npc' ? ' <span class="goes-first">(First)</span>' : ''}
        </div>
      `);
      
      roundDisplay.after(infoBar);
    }
    
    // Mark combatants with side info
    const combatants = html.find('.combatant');
    combatants.each((i, el) => {
      const combatantId = el.dataset.combatantId;
      const combatant = combat.combatants.get(combatantId);
      if (!combatant) return;
      
      // Get side
      const side = combatant.getFlag("msh-faserip", "side") || 
                  (combatant.actor?.hasPlayerOwner ? 'pc' : 'npc');
      
      // Add side marker
      $(el).addClass(`${side}-side`);
      
      // Check if highest Intuition
      if ((side === 'pc' && combatant.name === pcHighestName) || 
          (side === 'npc' && combatant.name === npcHighestName)) {
        
        $(el).addClass('highest-intuition');
        
        // Add star indicator if not already present
        if ($(el).find('.intuition-indicator').length === 0) {
          const mod = side === 'pc' ? pcMod : npcMod;
          $(el).find('.token-name').after(`<span class="intuition-indicator" title="Highest Intuition (+${mod})"><i class="fas fa-star"></i></span>`);
        }
      }
      
      // Replace the initiative number with actual roll+mod info
      const initElement = $(el).find('.initiative');
      if (initElement.length) {
        const sideData = side === 'pc' ? 
          { total: pcInit, roll: pcRoll, mod: pcMod } : 
          { total: npcInit, roll: npcRoll, mod: npcMod };
        
        if (sideData.total !== undefined) {
          let tooltip = `${side === 'pc' ? 'Side A' : 'Side B'}: `;
          if (sideData.roll === 1) {
            tooltip += `Roll: ${sideData.roll} (no modifier on 1)`;
          } else {
            tooltip += `Roll: ${sideData.roll}${sideData.mod > 0 ? ` + ${sideData.mod}` : ''}`;
          }
          tooltip += ` = ${sideData.total}`;
          
          // Replace the initiative display with our custom one - just show the actual total
          initElement.attr('title', tooltip);
          
          // Only replace the text if we're showing initiative as numbers (not turn order)
          if (combatant.initiative !== null) {
            // Just show the actual initiative value, not the 1 or 2 sorting value
            initElement.html(`<span class="init-roll-display" title="${tooltip}">
              ${sideData.total}
            </span>`);
          }
        }
      }
    });
    
    // Add reroll button for existing combats
    if (combat.round > 0) {
      const headerControls = html.find('.combat-tracker-header .encounter-controls');
      if (headerControls.length && headerControls.find('.faserip-reroll').length === 0) {
        const rerollBtn = $(`
          <a class="combat-control faserip-reroll" title="Reroll Initiative" data-control="rerollInitiative">
            <i class="fas fa-dice-d10"></i>
          </a>
        `);
        
        headerControls.append(rerollBtn);
        
        rerollBtn.click(ev => {
          ev.preventDefault();
          this.rollSideInitiative(combat);
        });
      }
    }
  }
  
  /**
   * Add settings button to combat controls
   */
  static _addInitiativeConfigButton(controls) {
    const combatControls = controls.find(c => c.name === "combat");
    if (!combatControls) return;
    
    // Only add if not already there
    if (!combatControls.tools.find(t => t.name === "faseripInitiative")) {
      combatControls.tools.push({
        name: "faseripInitiative",
        title: "FASERIP Initiative Settings",
        icon: "fas fa-dice-d10",
        button: true,
        onClick: () => {
          this._showSettingsDialog();
        }
      });
    }
  }
  
  /**
   * Show settings dialog
   */
  static _showSettingsDialog() {
    new Dialog({
      title: "FASERIP Initiative Settings",
      content: `
        <form>
          <div class="form-group">
            <label>Initiative System:</label>
            <div class="form-fields">
              <select name="useCustomInitiative">
                <option value="true" ${game.settings.get("msh-faserip", "useCustomInitiative") ? "selected" : ""}>FASERIP Initiative (Side-based)</option>
                <option value="false" ${!game.settings.get("msh-faserip", "useCustomInitiative") ? "selected" : ""}>Standard Foundry Initiative</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Auto Reroll Each Round:</label>
            <div class="form-fields">
              <input type="checkbox" name="autoRerollInitiative" ${game.settings.get("msh-faserip", "autoRerollInitiative") ? "checked" : ""}>
              <span class="notes">Automatically reroll initiative at the start of each new round</span>
            </div>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save Settings",
          callback: (html) => {
            const useCustom = html.find('[name="useCustomInitiative"]').val() === "true";
            const autoReroll = html.find('[name="autoRerollInitiative"]').is(':checked');
            
            game.settings.set("msh-faserip", "useCustomInitiative", useCustom);
            game.settings.set("msh-faserip", "autoRerollInitiative", autoReroll);
            
            ui.notifications.info("FASERIP Initiative settings saved");
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
  
  /**
   * Roll initiative for both sides
   */
  static async rollSideInitiative(combat) {
    if (!combat || this.isRolling) return;
    
    // Prevent multiple rolls
    this.isRolling = true;
    
    try {
      console.log("FASERIP Initiative: Rolling side initiative");
      
      // Find the character with highest Intuition on each side
      const [pcHighest, npcHighest] = await this._getHighestIntuitionCharacters(combat);
      
      // Calculate modifiers
      const pcMod = this._getModifierForIntuition(pcHighest.intuition);
      const npcMod = this._getModifierForIntuition(npcHighest.intuition);
      
      // Roll for both sides
      const pcRoll = await new Roll("1d10").evaluate({async: true});
      const npcRoll = await new Roll("1d10").evaluate({async: true});
      
      // Calculate totals (roll of 1 is always 1)
      const pcTotal = pcRoll.total === 1 ? 1 : pcRoll.total + pcMod;
      const npcTotal = npcRoll.total === 1 ? 1 : npcRoll.total + npcMod;
      
      // Determine who goes first
      let goesFirst;
      
      if (pcTotal > npcTotal) {
        goesFirst = 'pc';
      } else if (npcTotal > pcTotal) {
        goesFirst = 'npc';
      } else {
        // Ties: higher modifier goes first
        if (pcMod > npcMod) {
          goesFirst = 'pc';
        } else if (npcMod > pcMod) {
          goesFirst = 'npc';
        } else {
          // Random if still tied
          goesFirst = Math.random() < 0.5 ? 'pc' : 'npc';
        }
      }
      
      // Store results as flags
      await combat.setFlag("msh-faserip", "pcInitiative", pcTotal);
      await combat.setFlag("msh-faserip", "npcInitiative", npcTotal);
      await combat.setFlag("msh-faserip", "pcModifier", pcMod);
      await combat.setFlag("msh-faserip", "npcModifier", npcMod);
      await combat.setFlag("msh-faserip", "pcRoll", pcRoll.total);
      await combat.setFlag("msh-faserip", "npcRoll", npcRoll.total);
      await combat.setFlag("msh-faserip", "goesFirst", goesFirst);
      await combat.setFlag("msh-faserip", "pcHighestName", pcHighest.name);
      await combat.setFlag("msh-faserip", "npcHighestName", npcHighest.name);
      
      // Show 3D dice
      if (game.dice3d) {
        await game.dice3d.showForRoll(pcRoll, game.user, true);
        await game.dice3d.showForRoll(npcRoll, game.user, true);
      }
      
      // Update combatant initiatives (2 for first side, 1 for second side)
      const updates = [];
      
      for (const c of combat.combatants) {
        const side = c.actor?.hasPlayerOwner ? 'pc' : 'npc';
        const initiative = side === goesFirst ? 2 : 1;
        updates.push({_id: c.id, initiative: initiative});
      }
      
      // Apply updates with our flag
      if (updates.length) {
        await combat.updateEmbeddedDocuments("Combatant", updates, {faserip: true});
      }
      
      // Send a SINGLE chat message with results
      const roundInfo = combat.round ? `Round ${combat.round}` : 'Combat Start';
      
      // Create clearer chat message content without explanatory text
      const content = `
        <div class="faserip-initiative-result">
          <h2>${roundInfo} - Initiative Results</h2>
          <div class="initiative-sides">
            <div class="side pc-side ${goesFirst === 'pc' ? 'first' : 'second'}">
              <h3>Side A</h3>
              <div class="roll-result">
                <div class="roll-value">${pcRoll.total}</div>
                ${pcMod > 0 ? 
                  `<div class="roll-modifier">${pcRoll.total === 1 ? '' : `+${pcMod} (${pcHighest.name})`}</div>` : 
                  ''}
                <div class="roll-total">${pcTotal}</div>
              </div>
              <div class="turn-order">${goesFirst === 'pc' ? 'Acts First' : 'Acts Second'}</div>
            </div>
            <div class="side npc-side ${goesFirst === 'npc' ? 'first' : 'second'}">
              <h3>Side B</h3>
              <div class="roll-result">
                <div class="roll-value">${npcRoll.total}</div>
                ${npcMod > 0 ? 
                  `<div class="roll-modifier">${npcRoll.total === 1 ? '' : `+${npcMod} (${npcHighest.name})`}</div>` : 
                  ''}
                <div class="roll-total">${npcTotal}</div>
              </div>
              <div class="turn-order">${goesFirst === 'npc' ? 'Acts First' : 'Acts Second'}</div>
            </div>
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        content: content,
        flavor: `${roundInfo} - Initiative Results`,
        sound: CONFIG.sounds.dice
      });
      
      // Update UI
      combat.setupTurns();
      ui.combat?.render();
      
    } catch (error) {
      console.error("FASERIP Initiative Error:", error);
    } finally {
      // Always reset rolling flag when done
      this.isRolling = false;
    }
  }
  
  /**
   * Get characters with highest Intuition on each side
   */
  static async _getHighestIntuitionCharacters(combat) {
    let pcHighest = { name: "None", intuition: 0 };
    let npcHighest = { name: "None", intuition: 0 };
    
    // Check all combatants
    for (const c of combat.combatants) {
      if (!c.actor) continue;
      
      const intuition = c.actor.system.abilities.intuition.value || 0;
      const isPC = c.actor.hasPlayerOwner;
      
      if (isPC && intuition > pcHighest.intuition) {
        pcHighest = { name: c.name, intuition: intuition };
      } else if (!isPC && intuition > npcHighest.intuition) {
        npcHighest = { name: c.name, intuition: intuition };
      }
      
      // Ensure side flag is set
      const side = c.getFlag("msh-faserip", "side");
      if (!side) {
        await c.setFlag("msh-faserip", "side", isPC ? "pc" : "npc");
      }
    }
    
    return [pcHighest, npcHighest];
  }
  
  /**
   * Get initiative modifier based on Intuition
   */
  static _getModifierForIntuition(intuition) {
    // FASERIP initiative modifier table
    if (intuition >= 75) return 6;
    if (intuition >= 51) return 5;
    if (intuition >= 41) return 4;
    if (intuition >= 31) return 3;
    if (intuition >= 21) return 2;
    if (intuition >= 11) return 1;
    return 0;
  }
}