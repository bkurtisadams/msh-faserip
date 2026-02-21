// scripts/rules/mitigation.js v2.0.0 - 2026-02-12
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
    bypassForceField = false
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
      apMode
    });
  }
  
  const result = {
    rawDamage: rawDamage,
    netDamage: rawDamage,
    absorbed: 0,
    layers: []
  };
  
  if (bypassArmor) {
    if (debug) console.log('[MITIGATION] Armor bypassed');
    return result;
  }
  
  const dmgTypeLower = String(damageType).toLowerCase();
  const isEnergyDamage = dmgTypeLower.includes("energy");
  
  let currentDamage = rawDamage;

  // ── Try defense AEs first, fall back to item-based lookup ──
  const aeDefenses = getDefensesFromAEs(targetActor, dmgTypeLower);
  const hasAEDefenses = aeDefenses.hasArmor || aeDefenses.hasForceField || aeDefenses.hasResistance;

  if (hasAEDefenses) {
    // ── AE-based mitigation path ──
    if (debug) console.log('[MITIGATION] Using defense AE path', aeDefenses);

    // Layer 1: Body Armor (from AEs)
    if (aeDefenses.hasArmor) {
      const armorLayer = applyBodyArmorFromAE(currentDamage, aeDefenses.armor, {
        isEnergyDamage, armorPiercing, armorPiercingCS, apMode
      });
      if (armorLayer.absorbed > 0) {
        currentDamage -= armorLayer.absorbed;
        result.absorbed += armorLayer.absorbed;
        result.layers.push(armorLayer);
      }
    }

    // Layer 2: Force Field (from AEs)
    if (aeDefenses.hasForceField && !bypassForceField) {
      const ffLayer = applyForceFieldFromAE(currentDamage, aeDefenses.forceField, {
        isEnergyDamage
      });
      if (ffLayer.absorbed > 0) {
        currentDamage -= ffLayer.absorbed;
        result.absorbed += ffLayer.absorbed;
        result.layers.push(ffLayer);
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
      isEnergyDamage, dmgTypeLower, existingPhysical: aeDefenses.armor.physical,
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

// ─── Defense AE reader (synchronous — AEs are in memory) ─────────────────────

function getDefensesFromAEs(actor, dmgTypeLower) {
  const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
  if (!actor?.effects) return { hasArmor: false, hasForceField: false, hasResistance: false };

  const activeDefenses = actor.effects.filter(e =>
    !e.disabled && e.flags?.[scope]?.effectCategory === "defense"
  );
  if (activeDefenses.length === 0) {
    return { hasArmor: false, hasForceField: false, hasResistance: false };
  }

  // Aggregate body armor (take highest)
  let armorPhys = 0, armorEner = 0, armorPR = "", armorER = "";
  for (const ae of activeDefenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "bodyArmor") continue;
    const p = Number(f.physical) || 0;
    const e = Number(f.energy) || 0;
    if (p > armorPhys) { armorPhys = p; armorPR = f.physicalRank || ""; }
    if (e > armorEner) { armorEner = e; armorER = f.energyRank || ""; }
  }

  // Aggregate force field (take highest)
  let ffPhys = 0, ffEner = 0, ffFull = 0, ffPR = "", ffER = "";
  for (const ae of activeDefenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "forceField") continue;
    const p = Number(f.physical) || 0;
    const e = Number(f.energy) || 0;
    const fv = Number(f.fullValue) || 0;
    if (e > ffEner) { ffEner = e; ffER = f.energyRank || ""; }
    if (p > ffPhys) { ffPhys = p; ffPR = f.physicalRank || ""; }
    if (fv > ffFull) ffFull = fv;
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

    if (f.isInvulnerability || eff === "immunity") {
      resImm = true;
      resImmThr = Math.max(resImmThr, val);
    } else if (eff === "damageReduction") {
      resDR = Math.max(resDR, val);
    } else if (eff === "columnShift") {
      resCS += (Number(f.rankValue) || 2);
    }
  }

  return {
    hasArmor: armorPhys > 0 || armorEner > 0,
    hasForceField: ffFull > 0,
    hasResistance: resDR > 0 || resCS > 0 || resImm,
    armor: { physical: armorPhys, energy: armorEner, physicalRank: armorPR, energyRank: armorER },
    forceField: { physical: ffPhys, energy: ffEner, fullValue: ffFull, physicalRank: ffPR, energyRank: ffER },
    resistance: { damageReduction: resDR, csBonus: resCS, hasImmunity: resImm, immunityThreshold: resImmThr, type: resType },
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
  return fullDmgType.includes(resType);
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
  const { isEnergyDamage } = options;
  let physField = Number(ffData.physical || 0);
  let enerField = Number(ffData.energy || 0);

  if (!isEnergyDamage && physField > 0) {
    physField = Math.max(0, physField - 10);
  }

  const eff = isEnergyDamage ? enerField : physField;
  return {
    type: 'Force Field',
    absorbed: Math.min(damage, eff),
    original: isEnergyDamage ? ffData.energy : ffData.physical,
    modified: eff,
    ignoresAP: true,
    source: "defense-ae",
  };
}

function applyResistanceFromAE(damage, resData, options) {
  const { rawDamage } = options;

  // Invulnerability check
  if (resData.hasImmunity && rawDamage < resData.immunityThreshold) {
    return {
      type: `${resData.type} Invulnerability`,
      absorbed: damage,
      remainingDamage: 0,
      immune: true,
      reason: `Attack intensity (${rawDamage}) below invulnerability (${resData.immunityThreshold})`,
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

  if (isEnergyDamage || dmgTypeLower === "physical-ranged") return noResult;

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