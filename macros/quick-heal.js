// quick-heal.js v1.1.1 - 2025-12-25
// v1.1.1: Prioritize initialRank over actor flag, skip corrupted Shift-0 flags
// v1.1.0: Fix restoration - check originalEndurance flag, better fallback chain, clear flags after heal
// Restore selected tokens to full health, clear effects, restore Endurance
// Usage: game.msh.macros.quickHeal()

const RANK_VALUES = {
  "Sh-0": 0, "Shift-0": 0, "Shift 0": 0, "Sh0": 0,
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
  "Sh-X": 150, "Shift-X": 150, "ShX": 150,
  "Sh-Y": 200, "Shift-Y": 200, "ShY": 200,
  "Sh-Z": 500, "Shift-Z": 500, "ShZ": 500,
  "CL1000": 1000, "Class 1000": 1000,
  "CL3000": 3000, "Class 3000": 3000,
  "CL5000": 5000, "Class 5000": 5000
};

const ABBREV_TO_FULL = {
  "Sh-0": "Shift-0", "Sh0": "Shift-0",
  "Fe": "Feeble", "Pr": "Poor", "Ty": "Typical",
  "Gd": "Good", "Ex": "Excellent", "Rm": "Remarkable", "In": "Incredible",
  "Am": "Amazing", "Mn": "Monstrous", "Un": "Unearthly",
  "Sh-X": "Shift-X", "ShX": "Shift-X",
  "Sh-Y": "Shift-Y", "ShY": "Shift-Y",
  "Sh-Z": "Shift-Z", "ShZ": "Shift-Z",
  "CL1000": "Class 1000", "CL3000": "Class 3000", "CL5000": "Class 5000"
};

const SCOPE = "msh-faserip";

function getRankValue(rankName) {
  return RANK_VALUES[rankName] || game.msh?.getRankValue?.(rankName) || CONFIG.FASERIP?.rankValues?.[rankName] || 0;
}

function normalizeRank(rank) {
  if (!rank) return null;
  return ABBREV_TO_FULL[rank] || rank;
}

function isCorruptedOriginal(rank) {
  if (!rank) return true;
  const normalized = normalizeRank(rank);
  return normalized === "Shift-0" || getRankValue(rank) === 0;
}

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
    const baseActor = isUnlinked ? game.actors.get(token.document.actorId) : null;
    
    console.log(`[FASERIP] Quick Heal: Processing ${actor.name}`, {
      isToken: !!token,
      isUnlinked,
      baseActorName: baseActor?.name
    });
    
    // Gather all possible sources BEFORE clearing effects
    const dyingEffect = actor.effects.find(e => e.getFlag(SCOPE, "isDying"));
    const impairedEffect = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));
    const effectOriginal = dyingEffect?.getFlag(SCOPE, "originalEndurance") || 
                          impairedEffect?.getFlag(SCOPE, "originalEndurance");
    const actorFlagOriginal = actor.getFlag(SCOPE, "originalEndurance");
    const initialRankAbbrev = actor.system.abilities?.endurance?.initialRank;
    const initialRankFull = normalizeRank(initialRankAbbrev);
    const baseEndurance = baseActor?.system.abilities?.endurance;
    const baseOriginalFlag = baseActor?.getFlag(SCOPE, "originalEndurance");
    const baseInitialFull = normalizeRank(baseEndurance?.initialRank);
    
    console.log(`[FASERIP] Quick Heal: Sources`, {
      effectOriginal,
      actorFlagOriginal,
      initialRankAbbrev,
      initialRankFull,
      currentRank: actor.system.abilities?.endurance?.rank
    });
    
    // Determine which to use - PRIORITIZE initialRank since it's from chargen and most reliable
    let originalRank = null;
    
    if (initialRankFull && !isCorruptedOriginal(initialRankFull)) {
      originalRank = initialRankFull;
      console.log(`[FASERIP] Quick Heal: Using initialRank: ${originalRank}`);
    } else if (effectOriginal && !isCorruptedOriginal(effectOriginal)) {
      originalRank = effectOriginal;
      console.log(`[FASERIP] Quick Heal: Using effect originalEndurance: ${originalRank}`);
    } else if (actorFlagOriginal && !isCorruptedOriginal(actorFlagOriginal)) {
      originalRank = actorFlagOriginal;
      console.log(`[FASERIP] Quick Heal: Using actor flag originalEndurance: ${originalRank}`);
    } else if (isUnlinked && baseInitialFull && !isCorruptedOriginal(baseInitialFull)) {
      originalRank = baseInitialFull;
      console.log(`[FASERIP] Quick Heal: Using base actor initialRank: ${originalRank}`);
    } else if (isUnlinked && baseOriginalFlag && !isCorruptedOriginal(baseOriginalFlag)) {
      originalRank = baseOriginalFlag;
      console.log(`[FASERIP] Quick Heal: Using base actor originalEndurance: ${originalRank}`);
    } else if (isUnlinked && baseEndurance?.rank && !isCorruptedOriginal(baseEndurance.rank)) {
      originalRank = baseEndurance.rank;
      console.log(`[FASERIP] Quick Heal: Using base actor current rank: ${originalRank}`);
    } else if (actor.system.abilities?.endurance?.rank && !isCorruptedOriginal(actor.system.abilities.endurance.rank)) {
      originalRank = actor.system.abilities.endurance.rank;
      console.log(`[FASERIP] Quick Heal: Using current rank: ${originalRank}`);
    } else {
      originalRank = "Good";
      console.log(`[FASERIP] Quick Heal: No valid original found, defaulting to Good`);
    }
    
    const originalValue = getRankValue(originalRank);
    
    // Delete effects
    const effects = actor.effects.contents;
    if (effects.length) {
      console.log(`[FASERIP] Quick Heal: Deleting ${effects.length} effects`);
      await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
    }
    
    // Clear token status icons
    if (isUnlinked) {
      await token.document.update({"delta.statuses": []});
    }
    
    try {
      for (const statusId of [...(actor.statuses || [])]) {
        await actor.toggleStatusEffect(statusId, { active: false });
      }
    } catch (e) {
      console.warn(`[FASERIP] Quick Heal: Error clearing statuses`, e);
    }
    
    // Calculate max health with restored endurance
    const f = actor.system.abilities?.fighting?.value || 0;
    const a = actor.system.abilities?.agility?.value || 0;
    const s = actor.system.abilities?.strength?.value || 0;
    const restoredHealthMax = f + a + s + originalValue;
    
    const targetHealthMax = isUnlinked && baseActor 
      ? baseActor.system.attributes?.health?.max 
      : restoredHealthMax;
    
    console.log(`[FASERIP] Quick Heal: Restoring`, {
      originalRank,
      originalValue,
      targetHealthMax
    });
    
    if (isUnlinked) {
      const deltaUpdate = {
        "delta.system.abilities.endurance.rank": originalRank,
        "delta.system.abilities.endurance.value": originalValue,
        "delta.system.attributes.health.value": targetHealthMax,
        "delta.system.attributes.health.max": targetHealthMax,
        "delta.system.details.isDead": false
      };
      
      console.log(`[FASERIP] Quick Heal: Applying delta update`, deltaUpdate);
      await token.document.update(deltaUpdate);
      
    } else {
      const updateData = {
        "system.abilities.endurance.rank": originalRank,
        "system.abilities.endurance.value": originalValue,
        "system.attributes.health.value": targetHealthMax,
        "system.details.isDead": false
      };
      
      await actor.update(updateData);
    }
    
    // Clear the originalEndurance flag
    try {
      await actor.unsetFlag(SCOPE, "originalEndurance");
      console.log(`[FASERIP] Quick Heal: Cleared originalEndurance flag`);
    } catch (e) { /* may not exist */ }
    
    console.log(`[FASERIP] Quick Heal: Restored ${actor.name}`, {
      endurance: actor.system.abilities?.endurance,
      health: actor.system.attributes?.health?.value
    });
    
    token.renderFlags.set({refreshBars: true});
    
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