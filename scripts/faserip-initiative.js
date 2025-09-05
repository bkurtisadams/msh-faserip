// faserip-initiative.js - Foundry v13 Compatible version for Marvel FASERIP initiative

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
    
    console.log("FASERIP Initiative: Initializing for Foundry v13");
    
    // Register settings
    this.registerSettings();
    
    // Apply hooks with proper v13 timing
    Hooks.once("ready", () => this._registerHooks());
  }
  
  /**
   * Register all necessary hooks
   */
  static _registerHooks() {
    console.log("FASERIP Initiative: Registering hooks for v13");
    
    // CRITICAL: Replace the standard initiative formula
    CONFIG.Combat.initiative = {
      formula: "1d10",
      decimals: 0
    };
    
    // Override Combat methods using Foundry v13 approach
    this._patchCombatMethods();
    
    // Register hooks
    Hooks.on("renderCombatTracker", this._onRenderCombatTracker.bind(this));
    Hooks.on("updateCombat", this._handleUpdateCombat.bind(this));
    Hooks.on("createCombatant", this._onCreateCombatant.bind(this));
  }
  
  /**
   * Patch Combat class methods for v13 compatibility
   */
  static _patchCombatMethods() {
    // Store original methods
    const originalRollInitiative = Combat.prototype.rollInitiative;
    
    // Override the rollInitiative method for v13
    Combat.prototype.rollInitiative = function(ids, options={}) {
      // If using our system, completely bypass normal initiative
      if (game.settings.get("msh-faserip", "useCustomInitiative")) {
        console.log("FASERIP Initiative: Intercepting rollInitiative call");
        
        // Use our side initiative instead
        FaseripInitiative.rollSideInitiative(this);
        return Promise.resolve(this);
      }
      
      // Otherwise use original method
      return originalRollInitiative.call(this, ids, options);
    };
  }
  
  /**
   * When a combatant is added, assign side
   */
  static async _onCreateCombatant(combatant, options, userId) {
    // Only execute on GM client
    if (!game.user.isGM || !game.settings.get("msh-faserip", "useCustomInitiative")) return;
    
    // Determine side based on actor type and disposition
    let isPC = false;
    
    if (combatant.actor.type === "hero") {
      isPC = true;
    } else if (combatant.actor.type === "villain") {
      isPC = false;
    } else {
      // For NPCs, check disposition
      const tokenDisposition = combatant.token?.disposition ?? combatant.actor.prototypeToken.disposition;
      
      if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
        isPC = true;
      } else if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
        isPC = false;
      } else {
        // Neutral - use ownership as fallback
        isPC = combatant.actor.hasPlayerOwner;
      }
    }
    
    // Set side flag
    await combatant.setFlag("msh-faserip", "side", isPC ? "pc" : "npc");
  }
  
  /**
   * Handle combat updates (round changes) - Updated for v13
   */
  static _handleUpdateCombat(combat, update, options, userId) {
    // Only proceed if FASERIP and auto-reroll enabled
    if (!game.settings.get("msh-faserip", "useCustomInitiative") || 
        !game.settings.get("msh-faserip", "autoRerollInitiative")) {
      return;
    }
    
    // Check if round advanced - v13 compatible check
    const previousRound = foundry.utils.getProperty(options, "previousRound") || combat.previous?.round;
    if (update.round && previousRound && update.round > previousRound) {
      console.log(`FASERIP Initiative: Round advanced to ${update.round}, rerolling initiative`);
      
      // Wait a moment for update to complete
      setTimeout(() => {
        this.rollSideInitiative(combat);
      }, 100);
    }
  }

  
  /**
   * Modify combat tracker UI - Updated for v13
   */
  static _onRenderCombatTracker(app, html, data) {
    // Only if FASERIP is enabled
    if (!game.settings.get("msh-faserip", "useCustomInitiative")) return;
    
    const combat = app.viewed;
    if (!combat) return;

    // DEBUG: Log what players are seeing
    console.log("FASERIP Initiative Debug:", {
      userIsGM: game.user.isGM,
      userName: game.user.name,
      pcInit: combat.getFlag("msh-faserip", "pcInitiative"),
      npcInit: combat.getFlag("msh-faserip", "npcInitiative"),
      goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
      allFlags: combat.flags["msh-faserip"]
    });
    
    // Convert html to jQuery if it isn't already
    const $html = html instanceof jQuery ? html : $(html);
    
    // Add initiative buttons if user is GM
    if (game.user.isGM) {
      const headerControls = $html.find('.combat-tracker-header .encounter-controls');
      if (headerControls.length && headerControls.find('.faserip-initiative-btn').length === 0) {
        
        // Add both reroll and settings buttons
        const buttonContainer = $(`
          <div class="faserip-initiative-controls">
            <a class="combat-control faserip-initiative-btn" title="Reroll Initiative" data-action="reroll">
              <i class="fas fa-dice-d10"></i>
            </a>
            <a class="combat-control faserip-settings-btn" title="FASERIP Initiative Settings" data-action="settings">
              <i class="fas fa-cog"></i>
            </a>
          </div>
        `);
        
        headerControls.append(buttonContainer);
        
        // Bind click events
        buttonContainer.find('[data-action="reroll"]').click(ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (combat && combat.id) {
            this.rollSideInitiative(combat);
          } else {
            ui.notifications.warn("No active combat encounter");
          }
        });
        
        buttonContainer.find('[data-action="settings"]').click(ev => {
          ev.preventDefault();
          ev.stopPropagation();
          this._showSettingsDialog();
        });
      }
    } // END OF GM-ONLY SECTION
    
    // UI DISPLAY CODE - RUNS FOR ALL USERS
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

    // ONLY PROCEED WITH UI MODIFICATIONS IF WE HAVE COMPLETE DATA
    // Check if we have the essential data before modifying UI
    const hasCompleteInitiativeData = (
      pcInit !== undefined && 
      npcInit !== undefined && 
      goesFirst !== undefined &&
      pcRoll !== undefined &&
      npcRoll !== undefined
    );

    if (!hasCompleteInitiativeData) {
      console.log("FASERIP Initiative: Waiting for complete flag data...");
      return; // Exit early if data is incomplete
    }

    // Add compact info below round number
    const roundDisplay = $html.find('.combat-round');
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
    const combatants = $html.find('.combatant');
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
          if (mod > 0) {
            $(el).find('.token-name').after(`<span class="intuition-indicator" title="Highest Intuition (+${mod})"><i class="fas fa-star"></i></span>`);
          }
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
          
          // Replace the initiative display with our custom one
          initElement.attr('title', tooltip);
          
          // Only replace the text if we're showing initiative as numbers (not turn order)
          if (combatant.initiative !== null) {
            // Show the actual initiative value, hiding the 1 or 2 sorting value
            initElement.html(`<span class="init-roll-display" title="${tooltip}">
              ${sideData.total}
            </span>`);
          }
        }
      }
    });
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
   * Roll initiative for both sides - Updated for v13
   */
  static async rollSideInitiative(combat) {
    // Only execute on GM client
    if (!game.user.isGM || !combat || this.isRolling) return;
    
    if (!combat || this.isRolling) return;
    
    // Validate combat state
    if (!combat.id || !combat.combatants) {
      console.warn("FASERIP Initiative: Invalid combat state");
      return;
    }
    
    // Prevent multiple rolls
    this.isRolling = true;
    
    try {
      console.log("FASERIP Initiative: Rolling side initiative (v13)");
      
      // Find the character with highest Intuition on each side
      const [pcHighest, npcHighest] = await this._getHighestIntuitionCharacters(combat);
      
      // Calculate modifiers
      const pcMod = this._getModifierForIntuition(pcHighest.intuition);
      const npcMod = this._getModifierForIntuition(npcHighest.intuition);
      
      // Roll for both sides using explicit formula
      const pcRoll = await new Roll("1d10").evaluate();
      const npcRoll = await new Roll("1d10").evaluate();
      
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
        // In case of a tie, reroll until there is a clear winner
        console.log("FASERIP Initiative: Tie detected, rerolling...");
        
        // Show a message about the tie
        ChatMessage.create({
          user: game.user.id,
          content: `<div class="faserip-initiative-tie">Initiative Tie (${pcTotal} vs ${npcTotal})! Rerolling...</div>`,
          flavor: `Initiative Tie`,
        });
        
        // Reset rolling flag so we can reroll
        this.isRolling = false;
        
        // Reroll initiative after a short delay
        setTimeout(() => {
          this.rollSideInitiative(combat);
        }, 1000);
        
        // Exit current roll process
        return;
      }
      
      // Store results as flags - BATCH UPDATE
      const flagUpdates = {
        "flags.msh-faserip.pcInitiative": pcTotal,
        "flags.msh-faserip.npcInitiative": npcTotal,
        "flags.msh-faserip.pcModifier": pcMod,
        "flags.msh-faserip.npcModifier": npcMod,
        "flags.msh-faserip.pcRoll": pcRoll.total,
        "flags.msh-faserip.npcRoll": npcRoll.total,
        "flags.msh-faserip.goesFirst": goesFirst,
        "flags.msh-faserip.pcHighestName": pcHighest.name,
        "flags.msh-faserip.npcHighestName": npcHighest.name
      };

      await combat.update(flagUpdates);
      
      // Show 3D dice if available
      if (game.dice3d) {
        await game.dice3d.showForRoll(pcRoll, game.user, true);
        await game.dice3d.showForRoll(npcRoll, game.user, true);
      }
      
      // Update combatant initiatives
      const updates = [];
      
      // Create a map of combatants by side
      const pcCombatants = [];
      const npcCombatants = [];
      
      // First pass: categorize by side
      // First pass: categorize by side - UPDATED
      for (const c of combat.combatants) {
        // Use the flag we set, or determine it fresh
        let side = c.getFlag("msh-faserip", "side");
        
        if (!side) {
          // Determine side if flag is missing
          if (c.actor.type === "hero") {
            side = 'pc';
          } else if (c.actor.type === "villain") {
            side = 'npc';
          } else {
            const tokenDisposition = c.token?.disposition ?? c.actor.prototypeToken.disposition;
            if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
              side = 'pc';
            } else if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
              side = 'npc';
            } else {
              side = c.actor.hasPlayerOwner ? 'pc' : 'npc';
            }
          }
        }
        
        if (side === 'pc') {
          pcCombatants.push(c);
        } else {
          npcCombatants.push(c);
        }
      }
      
      // Second pass: set initiative values (2 for winner side, 1 for loser side)
      const winningSideCombatants = goesFirst === 'pc' ? pcCombatants : npcCombatants;
      const losingSideCombatants = goesFirst === 'pc' ? npcCombatants : pcCombatants;
      
      // Winner side gets 2, loser side gets 1
      for (const c of winningSideCombatants) {
        updates.push({_id: c.id, initiative: 2});
      }
      
      for (const c of losingSideCombatants) {
        updates.push({_id: c.id, initiative: 1});
      }
      
      // Apply updates
      if (updates.length) {
        await combat.updateEmbeddedDocuments("Combatant", updates, {render: false});
      }

      // Ensure all combatants have correct side flags (batch operation)
      const combatantFlagUpdates = [];
      for (const c of combat.combatants) {
        const currentSide = c.getFlag("msh-faserip", "side");
        let correctSide;
        
        if (c.actor.type === "hero") {
          correctSide = 'pc';
        } else if (c.actor.type === "villain") {
          correctSide = 'npc';
        } else {
          const tokenDisposition = c.token?.disposition ?? c.actor.prototypeToken.disposition;
          if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
            correctSide = 'pc';
          } else if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
            correctSide = 'npc';
          } else {
            correctSide = c.actor.hasPlayerOwner ? 'pc' : 'npc';
          }
        }
        
        if (currentSide !== correctSide) {
          combatantFlagUpdates.push({
            _id: c.id,
            "flags.msh-faserip.side": correctSide
          });
        }
      }

      if (combatantFlagUpdates.length > 0) {
        await combat.updateEmbeddedDocuments("Combatant", combatantFlagUpdates, {render: false});
      }
      
      // Send chat message with results
      const roundInfo = combat.round ? `Round ${combat.round}` : 'Combat Start';
      
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
      
      // Set focus to first combatant of winning side
      if (winningSideCombatants.length > 0) {
        const firstWinnerID = winningSideCombatants[0].id;
        
        // Update turns and set current turn
        await combat.setupTurns();
        const turnIndex = combat.turns.findIndex(t => t.id === firstWinnerID);
        
        if (turnIndex !== -1) {
          await combat.update({turn: turnIndex}, {render: false});
          
          // Use v13 compatible DOM manipulation
          setTimeout(() => {
            try {
              // Use built-in scroll method if available
              if (ui.combat?.scrollToTurn) {
                ui.combat.scrollToTurn();
              }
              
              // v13 compatible element selection
              if (ui.combat?.element) {
                // Convert to jQuery if needed, or use native DOM
                const $combatElement = ui.combat.element instanceof jQuery ? 
                  ui.combat.element : $(ui.combat.element);
                
                // Find the combatant element
                const combatantElement = $combatElement.find(`[data-combatant-id="${firstWinnerID}"]`);
                if (combatantElement.length > 0) {
                  // Remove active class from all combatants
                  $combatElement.find('.combatant').removeClass('active');
                  
                  // Add active class to the winning side's first combatant
                  combatantElement.addClass('active');
                  
                  // Scroll to the element
                  combatantElement[0].scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest' 
                  });
                  
                  // Add brief highlight effect
                  combatantElement.addClass('faserip-highlight');
                  setTimeout(() => {
                    combatantElement.removeClass('faserip-highlight');
                  }, 1000);
                }
              }
            } catch (error) {
              console.warn("FASERIP Initiative: Could not enhance combat focus:", error);
            }
          }, 100);
          
          console.log(`FASERIP Initiative: Setting focus to combatant at index ${turnIndex}`);
        }
      }
      
      // Update UI
      ui.combat?.render();
      
    } catch (error) {
      console.error("FASERIP Initiative Error:", error);
      ui.notifications.error("Failed to roll FASERIP initiative. Check console for details.");
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
    
    // Determine side based on actor type and disposition, not just ownership
    let isPC = false;
    
    // First, check actor type
    if (c.actor.type === "hero") {
      isPC = true;
    } else if (c.actor.type === "villain") {
      isPC = false;
    } else {
      // For NPCs, check disposition (token disposition or prototype token disposition)
      const tokenDisposition = c.token?.disposition ?? c.actor.prototypeToken.disposition;
      
      if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
        isPC = true;  // Friendly NPCs go with PCs
      } else if (tokenDisposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
        isPC = false; // Hostile NPCs go with NPCs/villains
      } else {
        // Neutral - could go either way, let's use ownership as fallback
        isPC = c.actor.hasPlayerOwner;
      }
    }
    
    // Update highest for the appropriate side
    if (isPC && intuition > pcHighest.intuition) {
      pcHighest = { name: c.name, intuition: intuition };
    } else if (!isPC && intuition > npcHighest.intuition) {
      npcHighest = { name: c.name, intuition: intuition };
    }
    
    // REMOVE THIS LINE - don't set flags during this iteration
    // await c.setFlag("msh-faserip", "side", isPC ? "pc" : "npc");
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