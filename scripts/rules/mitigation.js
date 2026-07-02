// scripts/rules/mitigation.js v3.2.2 - 2026-07-02
// v3.2.2: Ignore stale defense AEs during mitigation when their source
//         power item no longer exists or no longer qualifies for that
//         defense type. This prevents orphan invulnerability effects from
//         applying even before the async sync cleanup runs.
// v3.2.1: Recognize resistanceEffect=invulnerability in AE resistance
//         flags and apply Class 1000-style reduction instead of only
//         checking the legacy immunity string.
// v3.2.0: Consume ignoresNaturalArmor / ignoresArtificialArmor from options.
//         Body-armor AE aggregation now filters AEs by armorNature when an
//         ignore flag is set. Additive: with both flags false (default) the
//         BA aggregation is identical to v3.1.3. Item-based fallback path
//         (applyPassiveArmor for un-synced actors) unchanged for now; the
//         touch powers that drive these flags only land on actors with
//         current defense AEs in practice.
// v3.1.3: Pull HP write + temp-HP scheduling out of applyAbsorptionFromAE.
//         Previously the in-function targetActor.update raced with the
//         caller's damage-apply update (action-utils.js applyDamageToTargets),
//         so the heal was invisible or got overwritten. Mitigation now just
//         reports healAmount/tempHPRank/sourceAeId on the layer and on the
//         top-level result (absorptionHeal, absorptionTempHPRank,
//         absorptionAeIds). action-utils.js applyDamageToTargets v-bump
//         consumes these in the same update pass and schedules the cliff
//         decay post-update. Redirect bank kept in mitigation (setFlag
//         doesn't race with HP).
// v3.1.2: Absorption redirect chat: handle no-combat case. Out of combat,
//         game.combat.round is undefined and "expires end of round 0" reads
//         nonsensically. Now reports "may redirect on next action" when no
//         combat is active; flag's bankedRound/expiresRound store null.
// v3.1.1: Normalize short-form damage codes (E/S/F/BA/EA/TB/TE/GP/Gb) at the
//         top of calculateMitigation. attack-action.js passes "E" for energy
//         attacks; previous isEnergyDamage substring check failed against
//         "e".includes("energy"), causing absorption (and FF in non-bypass
//         paths) to miss the match. Single normalization at entry now feeds
//         a consistent long-form string to all downstream layers.
// v3.1.0: Absorption defense layer — applies before BA/FF for matched damage type.
//         Per-hit absorb cap = power rank value. If convertsToHealth, schedules
//         temp HP cliff decay at round+10 via ongoing-engine. If canRedirect,
//         banks pendingRedirect flag (one-round shelf life) and posts chat
//         reminder. Immunity-only mode (convertsToHealth=false) just sinks the
//         damage. ffBreach unaffected. Reads from defense-AE flags with
//         defenseType: "absorption".
// v3.0.1: Block armor now excluded vs physical-charging per RAW
//         (Advanced Set Block action: "Not vs Shooting, Energy, or Charging").
//         Previously charging damage was incorrectly absorbed by blocking armor.
// v3.0.0: Force Field overload (breach) detection with round-cumulative tracking.
//         BA+FF stacking enforcement: personal FF replaces BA (use one or other).
//         Returns ffBreach object on result when FF is overloaded.
// v2.0.0: Use defense AEs as primary source for body armor, force field, and resistance.
//         Falls back to item-based lookups (getBodyArmorValues/getResistanceModifiers) if
//         no defense AEs are found. This ensures backward compatibility with actors that
//         haven't been synced yet.

import { getBodyArmorValues } from "../modules/actions/action-utils.js";

export function calculateMitigation(rawDamage, targetActor, options = {}) {
  const debug = game.settings?.get('msh-faserip', 'debugMode') || false;
  
  const {
    damageType = "Physical-Blunt",
    attackForm = "blunt",
    bypassArmor = false,
    armorPiercing = 0,
    armorPiercingCS = 0,
    apMode = "value",
    bypassForceField = false,
    attackIntensity = 0,
    ignoresNaturalArmor = false,
    ignoresArtificialArmor = false
  } = options;
  
  if (debug) {
    console.log('[MITIGATION] calculateMitigation', {
      rawDamage,
      targetActor: targetActor.name,
      damageType,
      attackForm,
      bypassArmor,
      armorPiercing,
      armorPiercingCS,
      apMode,
      ignoresNaturalArmor,
      ignoresArtificialArmor
    });
  }
  
  const result = {
    rawDamage: rawDamage,
    netDamage: rawDamage,
    absorbed: 0,
    layers: [],
    ffBreach: null,
    // Absorption-specific fields surfaced to caller for race-free HP write:
    //   absorptionHeal: total HP to add post-damage (only when convertsToHealth)
    //   absorptionTempHPRank: ceiling for overheal above max
    //   absorptionAeIds: source defense AE ids for ongoing-engine bookkeeping
    absorptionHeal: 0,
    absorptionTempHPRank: 0,
    absorptionAeIds: [],
  };
  
  // Normalize short-form damage codes (E/S/F/BA/EA/TB/TE/GP/Gb) to long form.
  // Callers vary: attack-action.js often passes "E"/"BA" while others pass
  // "energy"/"physical-blunt". Normalize once so all downstream substring
  // checks (isEnergyDamage, absorption matching, etc) work consistently.
  let dmgTypeLower = String(damageType).toLowerCase();
  const _shortToLong = {
    "e": "energy", "f": "force",
    "s": "physical-shooting",
    "ba": "physical-blunt", "ea": "physical-edged",
    "tb": "physical-throwing-blunt", "te": "physical-throwing-edged",
    "gp": "grappling", "gb": "grabbing",
  };
  if (_shortToLong[dmgTypeLower]) dmgTypeLower = _shortToLong[dmgTypeLower];
  const isEnergyDamage = dmgTypeLower.includes("energy");
  
  let currentDamage = rawDamage;

  // ── Try defense AEs first, fall back to item-based lookup ──
  const aeDefenses = getDefensesFromAEs(targetActor, dmgTypeLower, {
    ignoresNaturalArmor,
    ignoresArtificialArmor
  });
  const hasAEDefenses = aeDefenses.hasArmor || aeDefenses.hasForceField || aeDefenses.hasResistance || aeDefenses.hasAbsorption;

  // ── Absorption — applies before BA/FF for matched damage type ──
  // Per-hit cap = rank#. Absorbed → optionally heals + temp HP. Excess flows
  // through normal mitigation. Pending-redirect bank for next-round.
  if (aeDefenses.hasAbsorption) {
    const absLayer = applyAbsorptionFromAE(currentDamage, aeDefenses.absorption, {
      dmgTypeLower, isEnergyDamage, targetActor
    });
    if (absLayer.absorbed > 0) {
      currentDamage -= absLayer.absorbed;
      result.absorbed += absLayer.absorbed;
      result.layers.push(absLayer);
      if (absLayer.healAmount > 0) {
        result.absorptionHeal += absLayer.healAmount;
        result.absorptionTempHPRank = Math.max(result.absorptionTempHPRank, absLayer.tempHPRank || 0);
        if (absLayer.sourceAeId) result.absorptionAeIds.push(absLayer.sourceAeId);
      }
    }
  }

  // bypassArmor means body armor was already subtracted upstream (attack-action.js),
  // but force field and resistance were NOT pre-calculated — still need to check them.
  if (bypassArmor) {
    if (debug) console.log('[MITIGATION] BA bypassed (pre-calculated), checking FF + resistance');

    // Force Field (not pre-calculated by attack-action)
    if (hasAEDefenses && aeDefenses.hasForceField && !bypassForceField) {
      const ffLayer = applyForceFieldFromAE(currentDamage, aeDefenses.forceField, {
        isEnergyDamage, targetActorUuid: targetActor.uuid, attackIntensity
      });
      if (ffLayer.absorbed > 0) {
        currentDamage -= ffLayer.absorbed;
        result.absorbed += ffLayer.absorbed;
      }
      result.layers.push(ffLayer);

      if (ffLayer.overloaded) {
        result.ffBreach = {
          isPersonal: aeDefenses.forceField.isPersonal,
          aeId: aeDefenses.forceField.aeId,
          excessDamage: ffLayer.excessDamage,
          attackIntensity: attackIntensity,
          fullValue: aeDefenses.forceField.fullValue
        };
        if (debug) console.log('[MITIGATION] FF BREACHED (bypass path)', result.ffBreach);

        if (!aeDefenses.forceField.isPersonal) {
          currentDamage = 0;
          if (debug) console.log('[MITIGATION] Projected FF breach — target unharmed');
        }
      }
    }

    // AE-based resistance
    if (hasAEDefenses && aeDefenses.hasResistance) {
      const resLayer = applyResistanceFromAE(currentDamage, aeDefenses.resistance, { rawDamage });
      if (resLayer.absorbed > 0 || resLayer.immune) {
        currentDamage = resLayer.remainingDamage;
        result.absorbed += resLayer.absorbed;
        result.layers.push(resLayer);
      }
    } else if (!hasAEDefenses) {
      // Legacy item-based resistance
      const resistanceLayer = applyResistance(currentDamage, targetActor, {
        damageType: dmgTypeLower, rawDamage
      });
      if (resistanceLayer.absorbed > 0 || resistanceLayer.immune) {
        currentDamage = resistanceLayer.remainingDamage;
        result.absorbed += resistanceLayer.absorbed;
        result.layers.push(resistanceLayer);
      }
    }

    result.netDamage = Math.max(0, currentDamage);
    if (debug) console.log('[MITIGATION] Result (bypass+FF+resistance)', result);
    return result;
  }

  if (hasAEDefenses) {
    // ── AE-based mitigation path ──
    if (debug) console.log('[MITIGATION] Using defense AE path', aeDefenses);

    const hasPersonalFF = aeDefenses.hasForceField && aeDefenses.forceField.isPersonal;

    // BA+FF stacking rule: personal FF replaces BA. Only apply BA if no personal FF,
    // or if FF is projected by a third party (which we don't enforce exclusion for).
    // "A personal force field is considered to replace Body Armor"
    if (aeDefenses.hasArmor && !hasPersonalFF) {
      const armorLayer = applyBodyArmorFromAE(currentDamage, aeDefenses.armor, {
        isEnergyDamage, armorPiercing, armorPiercingCS, apMode
      });
      if (armorLayer.absorbed > 0) {
        currentDamage -= armorLayer.absorbed;
        result.absorbed += armorLayer.absorbed;
        result.layers.push(armorLayer);
      }
    } else if (aeDefenses.hasArmor && hasPersonalFF) {
      if (debug) console.log('[MITIGATION] Skipping BA — personal FF replaces Body Armor');
      result.layers.push({ type: 'Body Armor', absorbed: 0, skipped: true, reason: 'Personal FF replaces BA' });
    }

    // Force Field (from AEs) — with cumulative round tracking and overload
    if (aeDefenses.hasForceField && !bypassForceField) {
      const ffLayer = applyForceFieldFromAE(currentDamage, aeDefenses.forceField, {
        isEnergyDamage, targetActorUuid: targetActor.uuid, attackIntensity
      });
      if (ffLayer.absorbed > 0) {
        currentDamage -= ffLayer.absorbed;
        result.absorbed += ffLayer.absorbed;
      }
      result.layers.push(ffLayer);

      // FF overload: breach detected
      if (ffLayer.overloaded) {
        result.ffBreach = {
          isPersonal: aeDefenses.forceField.isPersonal,
          aeId: aeDefenses.forceField.aeId,
          excessDamage: ffLayer.excessDamage,
          attackIntensity: attackIntensity,
          fullValue: aeDefenses.forceField.fullValue
        };
        if (debug) console.log('[MITIGATION] FF BREACHED', result.ffBreach);

        // Projected FF: "those inside are unharmed by that attack"
        // Zero out remaining damage for the protected target.
        // Personal FF: excess damage passes through normally.
        if (!aeDefenses.forceField.isPersonal) {
          currentDamage = 0;
          if (debug) console.log('[MITIGATION] Projected FF breach — target unharmed');
        }
      }
    }

    // Layer 3: Resistance (from AEs)
    if (aeDefenses.hasResistance) {
      const resLayer = applyResistanceFromAE(currentDamage, aeDefenses.resistance, {
        rawDamage
      });
      if (resLayer.absorbed > 0 || resLayer.immune) {
        currentDamage = resLayer.remainingDamage;
        result.absorbed += resLayer.absorbed;
        result.layers.push(resLayer);
      }
    }

    // Blocking armor (always from blocking AE, not defense AE)
    const blockLayer = applyBlockingArmor(currentDamage, targetActor, {
      isEnergyDamage, dmgTypeLower, existingPhysical: hasPersonalFF ? 0 : aeDefenses.armor.physical,
    });
    if (blockLayer.absorbed > 0) {
      currentDamage -= blockLayer.absorbed;
      result.absorbed += blockLayer.absorbed;
      result.layers.push(blockLayer);
    }

  } else {
    // ── Legacy item-based mitigation path ──
    if (debug) console.log('[MITIGATION] Using legacy item-based path');

    const armorData = getBodyArmorValues(targetActor, dmgTypeLower);
    
    // Layer 1: Body Armor (not force fields)
    if (!armorData.isForceField) {
      const armorLayer = applyBodyArmor(currentDamage, armorData, {
        isEnergyDamage, armorPiercing, armorPiercingCS, apMode
      });
      if (armorLayer.absorbed > 0) {
        currentDamage -= armorLayer.absorbed;
        result.absorbed += armorLayer.absorbed;
        result.layers.push(armorLayer);
      }
    }
    
    // Layer 2: Force Field
    if (armorData.isForceField && !bypassForceField) {
      const forceFieldLayer = applyForceField(currentDamage, armorData, { isEnergyDamage });
      if (forceFieldLayer.absorbed > 0) {
        currentDamage -= forceFieldLayer.absorbed;
        result.absorbed += forceFieldLayer.absorbed;
        result.layers.push(forceFieldLayer);
      }
    }
    
    // Layer 3: Resistance (legacy)
    const resistanceLayer = applyResistance(currentDamage, targetActor, {
      damageType: dmgTypeLower, rawDamage
    });
    if (resistanceLayer.absorbed > 0 || resistanceLayer.immune) {
      currentDamage = resistanceLayer.remainingDamage;
      result.absorbed += resistanceLayer.absorbed;
      result.layers.push(resistanceLayer);
    }
  }

  // Layer 4: Passive Armor (always item-based)
  const passiveArmorLayer = applyPassiveArmor(currentDamage, targetActor, {
    damageType: dmgTypeLower
  });
  if (passiveArmorLayer.absorbed > 0) {
    currentDamage -= passiveArmorLayer.absorbed;
    result.absorbed += passiveArmorLayer.absorbed;
    result.layers.push(passiveArmorLayer);
  }
  
  result.netDamage = Math.max(0, currentDamage);
  
  if (debug) console.log('[MITIGATION] Result', result);
  
  return result;
}

// ─── Force Field cumulative round tracking ───────────────────────────────────
// FF breach is cumulative per round: total absorbed across all hits in a round.
// Tracked via in-memory map keyed by actor UUID + combat round.

const _ffRoundTracker = new Map();

function _ffTrackerKey(actorUuid) {
  const round = game.combat?.round ?? -1;
  return `${actorUuid}::${round}`;
}

function getFFCumulativeAbsorbed(actorUuid) {
  const key = _ffTrackerKey(actorUuid);
  return _ffRoundTracker.get(key) || 0;
}

function trackFFAbsorbed(actorUuid, amount) {
  const key = _ffTrackerKey(actorUuid);
  const prev = _ffRoundTracker.get(key) || 0;
  _ffRoundTracker.set(key, prev + amount);
}

/** Call at round start to clear stale entries. */
export function resetFFRoundTracker() {
  _ffRoundTracker.clear();
}

// ─── Defense AE reader (synchronous — AEs are in memory) ─────────────────────

function getDefensesFromAEs(actor, dmgTypeLower, opts = {}) {
  const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
  if (!actor?.effects) return { hasArmor: false, hasForceField: false, hasResistance: false, hasAbsorption: false };

  const { ignoresNaturalArmor = false, ignoresArtificialArmor = false } = opts;

  const activeDefenses = actor.effects.filter(e =>
    !e.disabled
    && e.flags?.[scope]?.effectCategory === "defense"
    && isDefenseAEBackedByCurrentPower(actor, e, scope)
  );
  if (activeDefenses.length === 0) {
    return { hasArmor: false, hasForceField: false, hasResistance: false, hasAbsorption: false };
  }

  const isEnergyDamage = dmgTypeLower.includes("energy");

  // Aggregate body armor (take highest). When the attack ignores natural or
  // artificial armor (claws, corrosive, rotting), skip non-matching AEs by
  // armorNature. Unknown / missing armorNature defaults to "natural" to match
  // the schema default and pre-v3.2.0 data.
  let armorPhys = 0, armorEner = 0, armorPR = "", armorER = "";
  for (const ae of activeDefenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "bodyArmor") continue;
    const nature = f.armorNature || "natural";
    if (ignoresNaturalArmor && nature === "natural") continue;
    if (ignoresArtificialArmor && nature === "artificial") continue;
    const p = Number(f.physical) || 0;
    const e = Number(f.energy) || 0;
    if (p > armorPhys) { armorPhys = p; armorPR = f.physicalRank || ""; }
    if (e > armorEner) { armorEner = e; armorER = f.energyRank || ""; }
  }

  // Aggregate force field (take highest)
  let ffPhys = 0, ffEner = 0, ffFull = 0, ffPR = "", ffER = "";
  let ffPersonal = true, ffAeId = null;
  for (const ae of activeDefenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "forceField") continue;
    const p = Number(f.physical) || 0;
    const e = Number(f.energy) || 0;
    const fv = Number(f.fullValue) || 0;
    if (e > ffEner) { ffEner = e; ffER = f.energyRank || ""; }
    if (p > ffPhys) { ffPhys = p; ffPR = f.physicalRank || ""; }
    if (fv > ffFull) {
      ffFull = fv;
      ffPersonal = f.forceFieldPersonal ?? true;
      ffAeId = ae.id;
    }
  }

  // Aggregate resistance (matching damage type)
  let baseType = dmgTypeLower;
  if (dmgTypeLower.includes("-")) baseType = dmgTypeLower.split("-")[1];

  let resDR = 0, resCS = 0, resImm = false, resImmThr = 0, resType = "";
  for (const ae of activeDefenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "resistance") continue;
    const rt = (f.resistanceType || "").toLowerCase();
    if (!isResMatch(baseType, rt, dmgTypeLower)) continue;

    resType = f.resistanceType;
    const val = Number(f.resistanceValue) || 0;
    const eff = f.resistanceEffect || "damageReduction";

    if (f.isInvulnerability || eff === "immunity" || eff === "invulnerability") {
      resImm = true;
      resImmThr = Math.max(resImmThr, val || 1000);
    } else if (eff === "damageReduction") {
      resDR = Math.max(resDR, val);
    } else if (eff === "columnShift") {
      resCS += (Number(f.rankValue) || 2);
    }
  }

  // Aggregate absorption (take highest matching rank). Match rules:
  //   absorptionType "both" → any physical or energy damage
  //   absorptionType "physical" → any physical-* damage
  //   absorptionType "energy" → any energy or energy-* damage
  //   absorptionSpecific (when present) → fuzzy substring match against full damage type
  //     (e.g. "electrical" matches "energy-electrical"). Specific overrides type.
  let absRank = 0, absRankLabel = "", absConverts = false, absRedirect = false, absAeId = null, absMatched = "", absSpecific = "";
  for (const ae of activeDefenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "absorption") continue;
    const at = (f.absorptionType || "").toLowerCase();
    const spec = String(f.absorptionSpecific || "").toLowerCase().trim();

    let matched = false;
    if (spec) {
      // Specific-type match takes priority. Check both the full damage type
      // and the base subtype after "-".
      if (dmgTypeLower.includes(spec) || baseType.includes(spec)) matched = true;
    } else if (at === "both") {
      matched = true;
    } else if (at === "physical") {
      if (dmgTypeLower.includes("physical") || dmgTypeLower.includes("blunt") || dmgTypeLower.includes("edged") || dmgTypeLower.includes("shooting")) matched = true;
    } else if (at === "energy") {
      if (isEnergyDamage) matched = true;
    }
    if (!matched) continue;

    const rv = Number(f.rankValue) || 0;
    if (rv > absRank) {
      absRank = rv;
      absRankLabel = f.rank || "";
      absConverts = f.convertsToHealth === true;
      absRedirect = f.canRedirect === true;
      absAeId = ae.id;
      absMatched = at;
      absSpecific = f.absorptionSpecific || "";
    }
  }

  return {
    hasArmor: armorPhys > 0 || armorEner > 0,
    hasForceField: ffFull > 0,
    hasResistance: resDR > 0 || resCS > 0 || resImm,
    hasAbsorption: absRank > 0,
    armor: { physical: armorPhys, energy: armorEner, physicalRank: armorPR, energyRank: armorER },
    forceField: { physical: ffPhys, energy: ffEner, fullValue: ffFull, physicalRank: ffPR, energyRank: ffER, isPersonal: ffPersonal, aeId: ffAeId },
    resistance: { damageReduction: resDR, csBonus: resCS, hasImmunity: resImm, immunityThreshold: resImmThr, type: resType },
    absorption: { rank: absRank, rankLabel: absRankLabel, convertsToHealth: absConverts, canRedirect: absRedirect, aeId: absAeId, matchedType: absMatched, specific: absSpecific },
  };
}

function isResMatch(baseType, resType, fullDmgType) {
  if (!resType) return false;
  if (resType === baseType) return true;
  if (resType === "physical" && (fullDmgType.includes("physical") || fullDmgType.includes("blunt") || fullDmgType.includes("edged"))) return true;
  if (resType === "energy" && fullDmgType.includes("energy")) return true;
  if ((resType === "fire" || resType === "heat") && (baseType === "fire" || baseType === "heat")) return true;
  if ((resType === "cold" || resType === "ice") && (baseType === "cold" || baseType === "ice")) return true;
  if ((resType === "electricity" || resType === "electric") && (baseType === "electricity" || baseType === "electric")) return true;
  if (resType === "radiation" && baseType === "light") return true;
  return fullDmgType.includes(resType);
}


function getItemIdFromDefenseOngoingId(ongoingId = "") {
  const parts = String(ongoingId || "").split(".");
  return parts.length >= 3 && parts[0] === "defense" ? parts.slice(2).join(".") : "";
}

function isDefenseAEBackedByCurrentPower(actor, ae, scope) {
  const f = ae.flags?.[scope] || {};
  const itemId = f.powerItemId || getItemIdFromDefenseOngoingId(f.ongoingId || "");

  // Very old/manual defense AEs may not know their source item. Keep them
  // for backwards compatibility, but any AE that DOES name a power must still
  // point at a live, qualifying power.
  if (!itemId) return true;

  const item = actor.items?.get?.(itemId);
  if (!item || item.type !== "power") return false;

  const sys = item.system || {};
  const defenseType = f.defenseType || "";
  const name = String(item.name || "").toLowerCase();
  const powerType = String(sys.type || "").toLowerCase();

  if (defenseType === "bodyArmor") {
    return !!(sys.isBodyArmor || name.includes("body armor") || name.includes("body armour") || powerType.includes("body armor"));
  }

  if (defenseType === "forceField") {
    return !!(sys.isForceField || name.includes("force field") || powerType.includes("force field"));
  }

  if (defenseType === "resistance") {
    return !!(sys.isResistance && sys.resistanceType);
  }

  if (defenseType === "absorption") {
    return !!(sys.absorptionType || sys.absorptionSpecific);
  }

  return false;
}

// ─── AE-based mitigation layers ──────────────────────────────────────────────

function applyBodyArmorFromAE(damage, armorData, options) {
  const { isEnergyDamage, armorPiercing, armorPiercingCS, apMode } = options;

  let physArmor = Number(armorData.physical || 0);
  let enerArmor = Number(armorData.energy || 0);

  if (isEnergyDamage && physArmor > 0) {
    physArmor = Math.max(0, physArmor - 20);
  }

  if (apMode === "cs" && armorPiercingCS > 0) {
    const toReduce = isEnergyDamage ? enerArmor : physArmor;
    if (toReduce > 0) {
      const reduced = applyArmorPiercingCS(toReduce, armorPiercingCS);
      if (isEnergyDamage) enerArmor = reduced; else physArmor = reduced;
    }
  } else if (armorPiercing > 0) {
    if (isEnergyDamage) enerArmor = Math.max(0, enerArmor - armorPiercing);
    else physArmor = Math.max(0, physArmor - armorPiercing);
  }

  const eff = isEnergyDamage ? enerArmor : physArmor;
  return {
    type: 'Body Armor',
    absorbed: Math.min(damage, eff),
    original: isEnergyDamage ? armorData.energy : armorData.physical,
    modified: eff,
    apApplied: (armorPiercing > 0 || armorPiercingCS > 0),
    source: "defense-ae",
  };
}

function applyForceFieldFromAE(damage, ffData, options) {
  const { isEnergyDamage, targetActorUuid, attackIntensity } = options;
  const fullValue = Number(ffData.fullValue) || 0;
  let physField = Number(ffData.physical || 0);
  let enerField = Number(ffData.energy || 0);

  // FF: full rank vs energy, rank-10 vs physical
  if (!isEnergyDamage && physField > 0) {
    physField = Math.max(0, physField - 10);
  }

  const eff = isEnergyDamage ? enerField : physField;

  // Cumulative round tracking — breach threshold is total absorbed this round
  const prevAbsorbed = targetActorUuid ? getFFCumulativeAbsorbed(targetActorUuid) : 0;
  const remainingCapacity = Math.max(0, fullValue - prevAbsorbed);

  // How much this hit can absorb (capped by effective value AND remaining capacity)
  const absorbThisHit = Math.min(damage, eff, remainingCapacity);

  // Track what was absorbed this round
  if (targetActorUuid && absorbThisHit > 0) {
    trackFFAbsorbed(targetActorUuid, absorbThisHit);
  }

  // Overload check: total absorbed this round (including this hit) + any overflow
  const totalAbsorbedNow = prevAbsorbed + absorbThisHit;
  const damageAfterAbsorb = damage - absorbThisHit;
  const overloaded = (totalAbsorbedNow >= fullValue) && damageAfterAbsorb > 0;

  const result = {
    type: 'Force Field',
    absorbed: absorbThisHit,
    original: isEnergyDamage ? ffData.energy : ffData.physical,
    modified: eff,
    ignoresAP: true,
    source: "defense-ae",
    cumulativeAbsorbed: totalAbsorbedNow,
    fullValue: fullValue,
    overloaded: overloaded,
  };

  if (overloaded) {
    // Excess damage passes through to the target
    result.excessDamage = damageAfterAbsorb;
    result.attackIntensity = attackIntensity || 0;
  }

  return result;
}

function applyAbsorptionFromAE(damage, absData, options) {
  const { dmgTypeLower, isEnergyDamage, targetActor } = options;
  const rank = Number(absData.rank) || 0;
  const absorbThisHit = Math.min(damage, rank);

  const layer = {
    type: 'Absorption',
    absorbed: absorbThisHit,
    rank,
    ignoresAP: true,
    source: "defense-ae",
    matchedType: absData.matchedType,
    matchedSpecific: absData.specific,
    convertsToHealth: absData.convertsToHealth,
    canRedirect: absData.canRedirect,
    sourceAeId: absData.aeId,
  };

  if (absorbThisHit <= 0) return layer;

  // Heal amount is the absorbed quantity; caller (action-utils.js applyDamage)
  // applies it AFTER subtracting netDamage so the math is race-free and the
  // temp-HP ceiling is checked against post-damage HP. We DO NOT write HP
  // here. Caller is also responsible for scheduling the temp HP cliff decay
  // via applyAbsorptionTempHPOngoing once it knows how much overflow exists.
  if (absData.convertsToHealth) {
    layer.healAmount = absorbThisHit;
    layer.tempHPRank = rank;  // ceiling for overheal
  }

  // Redirect bank (flag-only, one round shelf life) — setFlag is independent
  // of HP and safe to fire here.
  if (absData.canRedirect && targetActor) {
    try {
      const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
      const inCombat = !!(game.combat && game.combat.round > 0);
      const round = inCombat ? game.combat.round : null;
      const pending = {
        amount: absorbThisHit,
        damageType: dmgTypeLower,
        bankedRound: round,
        expiresRound: inCombat ? round + 1 : null,
        sourceAeId: absData.aeId,
      };
      targetActor.setFlag(scope, "pendingRedirect", pending);
      layer.redirectBanked = absorbThisHit;
      const expiryText = inCombat
        ? `may redirect next round (expires end of round ${round + 1})`
        : `may redirect on next action (no combat active — flag persists until cleared)`;
      ChatMessage?.create?.({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        content: `<div class="msh-card"><strong>${targetActor.name}</strong> absorbed <b>${absorbThisHit}</b> ${dmgTypeLower} — ${expiryText}.</div>`,
      });
    } catch (e) {
      console.warn("[FASERIP MITIGATION] Absorption redirect bank failed:", e);
    }
  }

  return layer;
}

function applyResistanceFromAE(damage, resData, options) {
  const { rawDamage } = options;

  // Invulnerability / immunity check. Treat it as Class 1000-style
  // resistance: attacks up to the threshold are fully ignored; attacks above
  // it still have the threshold absorbed instead of bypassing entirely.
  if (resData.hasImmunity) {
    const threshold = Number(resData.immunityThreshold) || 1000;
    const absorbed = Math.min(damage, threshold);
    const remainingDamage = Math.max(0, damage - absorbed);
    return {
      type: `${resData.type} Invulnerability`,
      absorbed,
      remainingDamage,
      immune: remainingDamage <= 0,
      reason: remainingDamage <= 0
        ? `Attack intensity (${rawDamage}) did not exceed invulnerability (${threshold})`
        : `Invulnerability absorbed ${absorbed}; ${remainingDamage} exceeded threshold (${threshold})`,
      source: "defense-ae",
    };
  }

  // Damage reduction — sub-rank immunity per FASERIP rules
  if (resData.damageReduction > 0) {
    if (rawDamage < resData.damageReduction) {
      return {
        type: `${resData.type} Resistance`,
        absorbed: damage,
        remainingDamage: 0,
        immune: true,
        reason: `Attack intensity (${rawDamage}) below resistance (${resData.damageReduction})`,
        source: "defense-ae",
      };
    }
    const absorbed = Math.min(damage, resData.damageReduction);
    return {
      type: `${resData.type} Resistance`,
      absorbed,
      remainingDamage: damage - absorbed,
      immune: false,
      source: "defense-ae",
    };
  }

  return { type: 'Resistance', absorbed: 0, remainingDamage: damage, source: "defense-ae" };
}

function applyBlockingArmor(damage, targetActor, options) {
  const { isEnergyDamage, dmgTypeLower, existingPhysical } = options;
  const noResult = { type: 'Block', absorbed: 0 };

  // Block does not apply vs Shooting, Energy, or Charging (RAW Advanced Set).
  if (isEnergyDamage || dmgTypeLower === "physical-ranged" || dmgTypeLower === "physical-charging") return noResult;

  const blockEffect = targetActor.effects?.find(e => {
    if (e.disabled) return false;
    return e.flags?.["msh-faserip"]?.isBlocking === true;
  });
  if (!blockEffect) return noResult;

  const blockFlags = blockEffect.flags?.["msh-faserip"] || {};
  const blockingArmor = Number(blockFlags.armorValue) || 0;
  if (blockingArmor <= existingPhysical) return noResult;

  const extra = Math.min(damage, blockingArmor - existingPhysical);
  if (extra <= 0) return noResult;

  return {
    type: `Block (${blockFlags.armorRank || "?"})`,
    absorbed: extra,
    blockingArmor,
    source: "blocking-ae",
  };
}

// ─── Legacy item-based layers (unchanged) ────────────────────────────────────

function applyBodyArmor(damage, armorData, options) {
  const { isEnergyDamage, armorPiercing, armorPiercingCS, apMode } = options;
  
  let physArmor = Number(armorData.physical || 0);
  let enerArmor = Number(armorData.energy || 0);
  
  if (isEnergyDamage && physArmor > 0) {
    physArmor = Math.max(0, physArmor - 20);
  }
  
  if (apMode === "cs" && armorPiercingCS > 0) {
    const armorToReduce = isEnergyDamage ? enerArmor : physArmor;
    if (armorToReduce > 0) {
      const reduced = applyArmorPiercingCS(armorToReduce, armorPiercingCS);
      if (isEnergyDamage) enerArmor = reduced; else physArmor = reduced;
    }
  } else if (armorPiercing > 0) {
    if (isEnergyDamage) enerArmor = Math.max(0, enerArmor - armorPiercing);
    else physArmor = Math.max(0, physArmor - armorPiercing);
  }
  
  const effectiveArmor = isEnergyDamage ? enerArmor : physArmor;
  return {
    type: 'Body Armor',
    absorbed: Math.min(damage, effectiveArmor),
    original: isEnergyDamage ? armorData.energy : armorData.physical,
    modified: effectiveArmor,
    apApplied: (armorPiercing > 0 || armorPiercingCS > 0)
  };
}

function applyForceField(damage, armorData, options) {
  const { isEnergyDamage } = options;
  
  let physField = Number(armorData.physical || 0);
  let enerField = Number(armorData.energy || 0);
  
  if (!isEnergyDamage && physField > 0) {
    physField = Math.max(0, physField - 10);
  }
  
  const effectiveField = isEnergyDamage ? enerField : physField;
  return {
    type: 'Force Field',
    absorbed: Math.min(damage, effectiveField),
    original: isEnergyDamage ? armorData.energy : armorData.physical,
    modified: effectiveField,
    ignoresAP: true
  };
}

function applyResistance(damage, targetActor, options) {
  const { damageType, rawDamage } = options;
  
  const resistanceType = targetActor.system?.resistances?.type || null;
  const resistanceRank = targetActor.system?.resistances?.rank || null;
  
  if (!resistanceType || !resistanceRank) {
    return { type: 'Resistance', absorbed: 0, remainingDamage: damage };
  }
  
  const resistanceValue = CONFIG.FASERIP?.rankValues?.[resistanceRank] || 0;
  
  if (!isResistanceApplicable(damageType, resistanceType)) {
    return { type: 'Resistance', absorbed: 0, remainingDamage: damage };
  }
  
  if (rawDamage < resistanceValue) {
    return {
      type: `${resistanceType} Resistance`,
      absorbed: damage,
      remainingDamage: 0,
      immune: true,
      reason: `Attack intensity (${rawDamage}) below resistance (${resistanceValue})`
    };
  }
  
  const absorbed = Math.min(damage, resistanceValue);
  return {
    type: `${resistanceType} Resistance`,
    absorbed,
    remainingDamage: damage - absorbed,
    immune: false
  };
}

function applyPassiveArmor(damage, targetActor, options) {
  const { damageType } = options;
  
  const allPowers = game.msh?.getActorPowers?.(targetActor) || [];
  const matchingArmor = allPowers.filter(p => 
    p.isPassiveArmor && (!p.damageType || p.damageType === damageType)
  );
  
  if (matchingArmor.length === 0) {
    return { type: 'Passive Armor', absorbed: 0 };
  }
  
  const armorPower = matchingArmor.reduce((best, curr) =>
    (curr.value ?? 0) > (best.value ?? 0) ? curr : best,
    { value: 0 }
  );
  
  return {
    type: `Passive Armor (${armorPower.name || "Unnamed"})`,
    absorbed: Math.min(damage, armorPower.value ?? 0),
    powerName: armorPower.name
  };
}

function applyArmorPiercingCS(armorValue, csReduction) {
  const rankEntries = Object.entries(CONFIG.FASERIP.rankValues)
    .sort((a, b) => a[1] - b[1]);
  
  let currentIndex = rankEntries.findIndex(([_, val]) => val >= armorValue);
  if (currentIndex < 0) currentIndex = rankEntries.length - 1;
  if (currentIndex > 0 && rankEntries[currentIndex][1] > armorValue) currentIndex--;
  
  const newIndex = Math.max(0, currentIndex - csReduction);
  return rankEntries[newIndex][1];
}

function isResistanceApplicable(damageType, resistanceType) {
  const dmgLower = String(damageType).toLowerCase();
  const resLower = String(resistanceType).toLowerCase();
  
  if (resLower === "physical") return dmgLower.includes("physical") || dmgLower.includes("blunt") || dmgLower.includes("edged");
  if (resLower === "energy") return dmgLower.includes("energy");
  if (resLower === "cold" || resLower === "ice") return dmgLower.includes("cold") || dmgLower.includes("ice");
  if (resLower === "fire" || resLower === "heat") return dmgLower.includes("fire") || dmgLower.includes("heat");
  if (resLower === "electricity" || resLower === "electric") return dmgLower.includes("electricity") || dmgLower.includes("electric");
  if (resLower === "radiation") return dmgLower.includes("radiation") || dmgLower.includes("light");
  
  return dmgLower.includes(resLower);
}

export function getMitigationSummary(mitigationResult) {
  if (mitigationResult.layers.length === 0) return "No defenses applied";
  
  return mitigationResult.layers
    .filter(layer => layer.absorbed > 0 || layer.immune)
    .map(layer => {
      if (layer.immune) return `${layer.type}: IMMUNE (${layer.reason})`;
      return `${layer.type} absorbed ${layer.absorbed} damage`;
    })
    .join("; ");
}