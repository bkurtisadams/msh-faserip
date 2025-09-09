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

  static _addFaseripUI(html, combat) {
    if (!combat) return;
    
    // Ensure we have a jQuery object for consistency
    const $html = html instanceof jQuery ? html : $(html);
    
    // Get ALL the initiative data
    const faseripData = {
      pcInit: combat.getFlag("msh-faserip", "pcInitiative"),
      npcInit: combat.getFlag("msh-faserip", "npcInitiative"),
      pcRoll: combat.getFlag("msh-faserip", "pcRoll"),
      npcRoll: combat.getFlag("msh-faserip", "npcRoll"),
      pcMod: combat.getFlag("msh-faserip", "pcModifier") || 0,
      npcMod: combat.getFlag("msh-faserip", "npcModifier") || 0,
      goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
      pcHighestName: combat.getFlag("msh-faserip", "pcHighestName") || "",
      npcHighestName: combat.getFlag("msh-faserip", "npcHighestName") || ""
    };
    
    if (this._hasCompleteData(faseripData)) {
      this._addInitiativeBar($html, faseripData);
      this._modifyCombatantDisplay($html, combat, faseripData);
    }
  }


  /**
   * Initialize the FASERIP initiative system
   */
  static init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log("FASERIP Initiative: Initializing for Foundry v13");
    
    // Register settings and hooks
    this.registerSettings();
    this._registerHooks();
    
  }
  
  /**
   * Register all necessary hooks
   */
  // 1) Register hooks once.
static _registerHooks() {
  console.log("FASERIP Initiative: Registering hooks for v13");

  // Keep your initiative formula (safe in v13)
  CONFIG.Combat.initiative = { formula: "1d10", decimals: 0 };

  // Intercept initiative rolls ONLY when using side initiative
  const originalRollInitiative = Combat.prototype.rollInitiative;
  Combat.prototype.rollInitiative = async function(ids, options = {}) {
    if (game.settings.get("msh-faserip", "useCustomInitiative")) {
      console.log("FASERIP Initiative: Side initiative intercept");
      await FaseripInitiative.rollSideInitiative(this);
      return this;
    }
    return originalRollInitiative.call(this, ids, options);
  };

  // Use the stable render hook to inject your UI
  Hooks.on("renderCombatTracker", (app, html /*, data */) => {
    if (!game.settings.get("msh-faserip", "useCustomInitiative")) return;

    // v13: html is an HTMLElement (not jQuery)
    const root = html instanceof HTMLElement ? html : html[0];

    const combat = app.viewed;
    if (!combat) return;

    const data = {
      pcInit: combat.getFlag("msh-faserip", "pcInitiative"),
      npcInit: combat.getFlag("msh-faserip", "npcInitiative"),
      pcRoll: combat.getFlag("msh-faserip", "pcRoll"),
      npcRoll: combat.getFlag("msh-faserip", "npcRoll"),
      pcMod: combat.getFlag("msh-faserip", "pcModifier") ?? 0,
      npcMod: combat.getFlag("msh-faserip", "npcModifier") ?? 0,
      goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
      pcHighestName: combat.getFlag("msh-faserip", "pcHighestName") ?? "",
      npcHighestName: combat.getFlag("msh-faserip", "npcHighestName") ?? ""
    };

    if (FaseripInitiative._hasCompleteData(data) && !root.querySelector(".faserip-initiative-bar")) {
      FaseripInitiative._addInitiativeBar_native(root, data);
      FaseripInitiative._modifyCombatantDisplay_native(root, combat, data);
    }
  });

  // Fire on round changes reliably in v13
  Hooks.on("combatRound", async (combat, round) => {
    if (!game.user.isGM) return;
    if (!game.settings.get("msh-faserip", "useCustomInitiative")) return;
    if (!game.settings.get("msh-faserip", "autoRerollInitiative")) return;
    try {
      await FaseripInitiative.rollSideInitiative(combat);
      ui.combat?.render(true);
    } catch (err) {
      console.error("FASERIP Initiative: combatRound reroll failed", err);
    }
  });

  // Keep your createCombatant logic as-is (it’s fine)
  Hooks.on("createCombatant", this._onCreateCombatant.bind(this));
}

  static _addInitiativeBar_native(root, data) {
    const pcText = `Side A ${data.pcRoll}${data.pcMod && data.pcRoll !== 1 ? `+${data.pcMod}` : ""}=${data.pcInit}`;
    const npcText = `Side B ${data.npcRoll}${data.npcMod && data.npcRoll !== 1 ? `+${data.npcMod}` : ""}=${data.npcInit}`;

    const bar = document.createElement("div");
    bar.className = "faserip-initiative-bar";
    bar.innerHTML = `
      <span>${pcText} ${data.goesFirst === "pc" ? '<span class="goes-first">(First)</span>' : ""}</span>
      &nbsp;—&nbsp;
      <span>${npcText} ${data.goesFirst === "npc" ? '<span class="goes-first">(First)</span>' : ""}</span>
    `;

    // Anchor fallback chain for v13 markup
    const anchor =
      root.querySelector(".combat-sidebar-header") ||
      root.querySelector(".directory-header") ||
      root.querySelector("header"); // last resort

    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(bar, anchor.nextSibling);
    }
  }

  static _modifyCombatantDisplay_native(root, combat, data) {
    for (const el of root.querySelectorAll(".combatant")) {
      const id = el.getAttribute("data-combatant-id");
      const c = combat.combatants.get(id);
      if (!c) continue;

      const side = c.getFlag("msh-faserip", "side")
                ?? (c.actor?.hasPlayerOwner ? "pc" : "npc");
      el.classList.add(`${side}-side`);
    }
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
  /**
 * Handle combat updates (round changes) - Updated for v13
 */
static _handleUpdateCombat(combat, update, options, userId) {
  // Only proceed if FASERIP and auto-reroll enabled
  if (!game.settings.get("msh-faserip", "useCustomInitiative") || 
      !game.settings.get("msh-faserip", "autoRerollInitiative")) {
    return;
  }
  
  // Only execute on GM client
  if (!game.user.isGM) return;
  
  // Check if round advanced - need to compare against the previous value
  if (Number.isInteger(update.round)) {
    // Get the previous round from the update context or combat's previous state
    const previousRound = foundry.utils.getProperty(options, "previousRound") || 
                         combat.previous?.round || 
                         (combat.round - 1); // fallback calculation
    
    if (update.round > previousRound) {
      console.log(`FASERIP Initiative: Round advanced from ${previousRound} to ${update.round}, rerolling initiative`);
      
      // Wait a moment for update to complete, then reroll
      setTimeout(async () => {
        try {
          await this.rollSideInitiative(combat);
          
          // Force UI refresh for all clients
          setTimeout(() => {
            if (ui.combat) {
              ui.combat.render(true);
            }
          }, 200);
          
        } catch (error) {
          console.error("FASERIP Initiative: Error during round change reroll:", error);
        }
      }, 150);
    }
  }
}
  
  /**
   * Modify combat tracker UI - Updated for v13
   */
  // Keep everything in your FaseripInitiative class, just replace this method:
static _onRenderCombatTracker(app, html, data) {
  // Only if FASERIP is enabled
  if (!game.settings.get("msh-faserip", "useCustomInitiative")) return;
  
  const combat = app.viewed;
  if (!combat) return;

  // Get initiative data
  const faseripData = {
    pcInit: combat.getFlag("msh-faserip", "pcInitiative"),
    npcInit: combat.getFlag("msh-faserip", "npcInitiative"),
    pcRoll: combat.getFlag("msh-faserip", "pcRoll"),
    npcRoll: combat.getFlag("msh-faserip", "npcRoll"),
    pcMod: combat.getFlag("msh-faserip", "pcModifier") || 0,
    npcMod: combat.getFlag("msh-faserip", "npcModifier") || 0,
    goesFirst: combat.getFlag("msh-faserip", "goesFirst")
  };

  // Only proceed if we have complete data AND no existing bar
  if (!this._hasCompleteData(faseripData) || html.querySelector('.faserip-initiative-bar')) {
    return;
  }

  this._addInitiativeBar(html, faseripData);
  this._modifyCombatantDisplay(html, combat, faseripData);
}

static _modifyCombatantDisplay(html, combat, data) {
  // Convert html to jQuery-like object if needed
  const $html = html instanceof jQuery ? html : $(html);
  
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
  });
}

static _hasCompleteData(data) {
  return data.pcInit !== undefined && data.npcInit !== undefined && 
         data.goesFirst !== undefined && data.pcRoll !== undefined && 
         data.npcRoll !== undefined;
}

static _addInitiativeBar(html, data) {
  const pcText = `Side A ${data.pcRoll}${data.pcMod && data.pcRoll !== 1 ? `+${data.pcMod}` : ''}=${data.pcInit}`;
  const npcText = `Side B ${data.npcRoll}${data.npcMod && data.npcRoll !== 1 ? `+${data.npcMod}` : ''}=${data.npcInit}`;

  const $anchor = html.find('.combat-sidebar-header, .directory-header').first();
  if ($anchor.length === 0) return;

  const bar = `
    <div class="faserip-initiative-bar">
      ${pcText} ${data.goesFirst === 'pc' ? '<span class="goes-first">(First)</span>' : ''}
      —
      ${npcText} ${data.goesFirst === 'npc' ? '<span class="goes-first">(First)</span>' : ''}
    </div>
  `;
  $anchor.after(bar);
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
      const pcRoll = await (new Roll("1d10")).evaluate();
      const npcRoll = await (new Roll("1d10")).evaluate();
      
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

      // DEBUG: Verify flags were set
      console.log("FASERIP Debug - Flags after update:", {
        round: combat.round,
        pcInit: combat.getFlag("msh-faserip", "pcInitiative"),
        npcInit: combat.getFlag("msh-faserip", "npcInitiative"),
        goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
        pcRoll: combat.getFlag("msh-faserip", "pcRoll"),
        npcRoll: combat.getFlag("msh-faserip", "npcRoll")
      });

      // Force immediate UI refresh
      setTimeout(() => {
        ui.combat?.render(true);
        console.log("FASERIP Initiative: Forced UI refresh after flag update");
      }, 50);
      
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
      
      // --- Second pass: assign initiatives using the official API ---
      const winningSideCombatants = goesFirst === 'pc' ? pcCombatants : npcCombatants;
      const losingSideCombatants  = goesFirst === 'pc' ? npcCombatants : pcCombatants;

      // If you want simple side-ordering, keep 2 / 1:
      //const winnerInit = 2;
      //const loserInit  = 1;

      // If you want real totals to show in tracker instead, use:
      const winnerInit = goesFirst === 'pc' ? pcTotal : npcTotal;
      const loserInit  = goesFirst === 'pc' ? npcTotal : pcTotal;

      const ops = [];
      for (const c of winningSideCombatants) ops.push(combat.setInitiative(c.id, winnerInit));
      for (const c of losingSideCombatants)  ops.push(combat.setInitiative(c.id, loserInit));
      await Promise.all(ops);

      // Rebuild turn order & render
      await combat.setupTurns();
      ui.combat?.render(true);
      
      // Apply updates
      if (updates.length) {
        await combat.updateEmbeddedDocuments("Combatant", updates);
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
        await combat.updateEmbeddedDocuments("Combatant", combatantFlagUpdates);
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
    <hr/>
    <div><em>Assigned tracker initiative:</em>
      <strong>${goesFirst === 'pc' ? 'Side A: 2, Side B: 1' : 'Side A: 1, Side B: 2'}</strong>
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
      // --- Set focus to the first visible winner in the sorted turn list ---
      await combat.setupTurns();

      const toNum = v => Number(v ?? -1);
      const maxInit = Math.max(...combat.turns.map(t => toNum(t.initiative)));

      const getSide = (c) => {
        const flag = c.getFlag("msh-faserip", "side");
        if (flag) return flag;
        if (c.actor?.type === "hero") return "pc";
        if (c.actor?.type === "villain") return "npc";
        const disp = c.token?.disposition ?? c.actor?.prototypeToken?.disposition;
        if (disp === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return "pc";
        if (disp === CONST.TOKEN_DISPOSITIONS.HOSTILE)  return "npc";
        return c.actor?.hasPlayerOwner ? "pc" : "npc";
      };

      // Find the first combatant in the rendered order that both
      // (a) matches the winning side and (b) has the top initiative.
      let turnIndex = combat.turns.findIndex(t => {
        const c = combat.combatants.get(t.id);
        return c && getSide(c) === goesFirst && toNum(t.initiative) === maxInit;
      });

      // Safety fallback: first entry in the list
      if (turnIndex < 0) turnIndex = 0;

      // Let this render normally so every client refreshes
      await combat.update({ turn: turnIndex });

      // Optional nicety: scroll & flash the focused row
      setTimeout(() => {
        try {
          ui.combat?.scrollToTurn?.();
          const firstId = combat.turns[turnIndex]?.id;
          const $root = ui.combat?.element;
          if ($root && firstId) {
            const target = $root.find?.(`[data-combatant-id="${firstId}"]`)?.[0];
            if (target) {
              target.classList.add("faserip-highlight");
              setTimeout(() => target.classList.remove("faserip-highlight"), 1000);
            }
          }
        } catch (e) { /* noop */ }
      }, 100);

      console.log(`FASERIP Initiative: Focus set to index ${turnIndex} (winner: ${goesFirst})`);
      
      // Force UI update for all clients
      ui.combat?.render(true);

      // Also trigger a delayed render to ensure all data is displayed
      setTimeout(() => {
        if (ui.combat) {
          ui.combat.render(true);
        }
      }, 100);
      
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
    
    const intuition = c.actor?.system?.abilities?.intuition?.value ?? 0;
    
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