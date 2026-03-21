// quick-heal.js v1.4.0 - 2026-03-21
// v1.4.0: Preserve non-standard ability rank values (e.g. Good 15) — resolve original
//         endurance value from actor/base data instead of always deriving from rank name.
// v1.3.0: Fix effects not deleting — pass mshIntentional option so preDeleteActiveEffect
//         hook doesn't block dying/impaired/defense/regen effect removal.
//         Restore HP BEFORE deleting effects so deleteActiveEffect hook doesn't
//         trigger consciousness attempts while health is still 0.
//         Clear rest-system flags (wasKnockedOut, lastDamageWorldTime, lastDamageTime).
// v1.2.0: Fix Endurance restoration — use current rank unless dying/impaired effect
//         stored an original. initialRank is last resort (pre-advancement chargen value).
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
    const hasDyingOrImpaired = !!(dyingEffect || impairedEffect);
    
    console.log(`[FASERIP] Quick Heal: Sources`, {
      effectOriginal,
      actorFlagOriginal,
      initialRankAbbrev,
      initialRankFull,
      currentRank: actor.system.abilities?.endurance?.rank,
      currentValue: actor.system.abilities?.endurance?.value,
      baseRank: baseEndurance?.rank,
      baseValue: baseEndurance?.value,
      hasDyingOrImpaired
    });
    
    // Resolve original rank
    // Priority: stored original from dying/impaired effect > actor flag > current rank
    // Only fall back to initialRank as absolute last resort (chargen value, pre-advancement)
    let originalRank = null;
    
    if (hasDyingOrImpaired && effectOriginal && !isCorruptedOriginal(effectOriginal)) {
      originalRank = effectOriginal;
    } else if (hasDyingOrImpaired && actorFlagOriginal && !isCorruptedOriginal(actorFlagOriginal)) {
      originalRank = actorFlagOriginal;
    } else if (actor.system.abilities?.endurance?.rank && !isCorruptedOriginal(actor.system.abilities.endurance.rank)) {
      originalRank = actor.system.abilities.endurance.rank;
    } else if (isUnlinked && baseEndurance?.rank && !isCorruptedOriginal(baseEndurance.rank)) {
      originalRank = baseEndurance.rank;
    } else if (initialRankFull && !isCorruptedOriginal(initialRankFull)) {
      originalRank = initialRankFull;
    } else {
      originalRank = "Good";
    }
    
    // Resolve original value — preserve non-standard rank numbers (e.g. Good 15)
    // The dying system only stores rank name, not value, so we need to find the
    // actual numeric value from the best available source.
    let originalValue;
    
    if (!hasDyingOrImpaired) {
      // Not dying/impaired — current value IS the correct value
      originalValue = Number(actor.system.abilities?.endurance?.value) || getRankValue(originalRank);
    } else if (isUnlinked && baseEndurance?.value && baseEndurance.rank === originalRank) {
      // Unlinked token dying — base actor has the pre-damage value
      originalValue = Number(baseEndurance.value);
    } else if (actor.system.abilities?.endurance?.initialValue && normalizeRank(initialRankAbbrev) === originalRank) {
      // initialValue matches the original rank — use it (preserves GM adjustments if rank unchanged)
      originalValue = Number(actor.system.abilities.endurance.initialValue);
    } else {
      // Last resort: derive from rank name (loses non-standard values)
      originalValue = getRankValue(originalRank);
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
    
    // === RESTORE HP FIRST ===
    // Must happen before effect deletion so the deleteActiveEffect hook
    // in rest-system sees HP > 0 and doesn't trigger consciousness attempts
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
    
    // === DELETE EFFECTS AFTER HP RESTORE ===
    // Pass mshIntentional so preDeleteActiveEffect hook allows removal of
    // protected effects (dying, impaired endurance, regeneration, defense)
    const effects = actor.effects.contents;
    if (effects.length) {
      console.log(`[FASERIP] Quick Heal: Deleting ${effects.length} effects`);
      await actor.deleteEmbeddedDocuments(
        "ActiveEffect",
        effects.map(e => e.id),
        { mshIntentional: true }
      );
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
    
    // Clear the originalEndurance flag
    try {
      await actor.unsetFlag(SCOPE, "originalEndurance");
      console.log(`[FASERIP] Quick Heal: Cleared originalEndurance flag`);
    } catch (e) { /* may not exist */ }
    
    // Clear rest-system flags so healed character isn't treated as recently damaged/KO'd
    try {
      await actor.unsetFlag(SCOPE, "wasKnockedOut");
      await actor.unsetFlag(SCOPE, "lastDamageWorldTime");
      await actor.unsetFlag(SCOPE, "lastDamageTime");
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