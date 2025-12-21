// quick-heal.js v1.0.0 - 2025-12-21
// Restore selected tokens to full health, clear effects, restore Endurance
// Usage: game.msh.macros.quickHeal()

const RANK_VALUES = {
  "Sh-0": 0, "Shift-0": 0, "Shift 0": 0,
  "Fe": 2, "Feeble": 2,
  "Pr": 4, "Poor": 4,
  "Ty": 6, "Typical": 6,
  "Gd": 10, "Good": 10,
  "Ex": 20, "Excellent": 20,
  "Rm": 30, "Remarkable": 30,
  "In": 40, "Incredible": 40,
  "Am": 50, "Amazing": 50,
  "Mn": 75, "Monstrous": 75,
  "Un": 100, "Unearthly": 100,
  "Sh-X": 150, "Shift-X": 150,
  "Sh-Y": 200, "Shift-Y": 200,
  "Sh-Z": 500, "Shift-Z": 500,
  "CL1000": 1000, "Class 1000": 1000,
  "CL3000": 3000, "Class 3000": 3000,
  "CL5000": 5000, "Class 5000": 5000
};

const ABBREV_TO_FULL = {
  "Sh-0": "Shift-0", "Fe": "Feeble", "Pr": "Poor", "Ty": "Typical",
  "Gd": "Good", "Ex": "Excellent", "Rm": "Remarkable", "In": "Incredible",
  "Am": "Amazing", "Mn": "Monstrous", "Un": "Unearthly",
  "Sh-X": "Shift-X", "Sh-Y": "Shift-Y", "Sh-Z": "Shift-Z",
  "CL1000": "Class 1000", "CL3000": "Class 3000", "CL5000": "Class 5000"
};

/**
 * Restore selected tokens to full health, clear dying/impaired effects, restore Endurance
 * @returns {Promise<void>}
 */
export async function quickHeal() {
  const tokens = canvas.tokens.controlled;
  
  if (!tokens.length) {
    ui.notifications.warn("No tokens selected");
    return;
  }
  
  for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;
    
    const isUnlinked = token.document.actorLink === false;
    
    console.log(`[FASERIP] Quick Heal: Processing ${actor.name}`, {
      isToken: !!token,
      isUnlinked
    });
    
    // Delete effects FIRST (prevents hooks from overwriting our restored values)
    const effects = actor.effects.contents;
    if (effects.length) {
      console.log(`[FASERIP] Quick Heal: Deleting ${effects.length} effects`);
      await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
    }
    
    // Clear token status icons
    if (token.document.actorLink === false) {
      await token.document.update({"delta.statuses": []});
    }
    
    // Determine original Endurance from token's initialRank field
    let originalRank = "Good";
    let originalValue = 10;
    
    const initialRankAbbrev = actor.system.abilities?.endurance?.initialRank;
    if (initialRankAbbrev && ABBREV_TO_FULL[initialRankAbbrev]) {
      originalRank = ABBREV_TO_FULL[initialRankAbbrev];
      originalValue = RANK_VALUES[initialRankAbbrev] || 10;
      console.log(`[FASERIP] Quick Heal: Using token initialRank`, {
        initialRankAbbrev,
        originalRank,
        originalValue
      });
    }
    
    // Get max health
    const maxHealth = actor.system.attributes?.health?.max || 100;
    
    // Apply updates based on token type
    if (isUnlinked) {
      // Unlinked token: use delta path
      const deltaUpdate = {
        "delta.system.abilities.endurance.rank": originalRank,
        "delta.system.abilities.endurance.value": originalValue,
        "delta.system.attributes.health.value": maxHealth,
        "delta.system.details.isDead": false
      };
      
      console.log(`[FASERIP] Quick Heal: Applying delta update`, deltaUpdate);
      await token.document.update(deltaUpdate);
    } else {
      // Linked token: update actor directly
      const updateData = {
        "system.abilities.endurance.rank": originalRank,
        "system.abilities.endurance.value": originalValue,
        "system.attributes.health.value": maxHealth,
        "system.details.isDead": false
      };
      
      await actor.update(updateData);
    }
    
    console.log(`[FASERIP] Quick Heal: Restored ${actor.name}`, {
      endurance: actor.system.abilities?.endurance,
      health: actor.system.attributes?.health?.value
    });
    
    // Refresh token bar display
    token.renderFlags.set({refreshBars: true});
    
    // Force sheet re-render if open
    if (actor.sheet?.rendered) {
      actor.sheet.render(false);
    }
  }
  
  ChatMessage.create({
    content: `<div style="text-align:center;"><strong>Healed ${tokens.length} character(s) to full health</strong></div>`,
    whisper: [game.user.id]
  });
  
  ui.notifications.info(`Healed ${tokens.length} token(s)`);
}