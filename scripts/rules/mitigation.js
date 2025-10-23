// scripts/rules/mitigation.js

import { getBodyArmorValues } from "../modules/actions/action-utils.js";

export function calculateMitigation(rawDamage, targetActor, options = {}) {
  const debug = game.settings?.get('msh-faserip', 'debugMode') || false;
  
  const {
    damageType = "Physical-Blunt",
    attackForm = "blunt",
    bypassArmor = false,
    armorPiercing = 0,
    armorPiercingCS = 0,
    apMode = "value"
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
  
  // Get armor data using existing function
  const armorData = getBodyArmorValues(targetActor, dmgTypeLower);
  
  // Layer 1: Body Armor (not force fields)
  if (!armorData.isForceField) {
    const armorLayer = applyBodyArmor(currentDamage, armorData, {
      isEnergyDamage,
      armorPiercing,
      armorPiercingCS,
      apMode
    });
    
    if (armorLayer.absorbed > 0) {
      currentDamage -= armorLayer.absorbed;
      result.absorbed += armorLayer.absorbed;
      result.layers.push(armorLayer);
    }
  }
  
  // Layer 2: Force Field
  if (armorData.isForceField) {
    const forceFieldLayer = applyForceField(currentDamage, armorData, {
      isEnergyDamage
    });
    
    if (forceFieldLayer.absorbed > 0) {
      currentDamage -= forceFieldLayer.absorbed;
      result.absorbed += forceFieldLayer.absorbed;
      result.layers.push(forceFieldLayer);
    }
  }
  
  // Layer 3: Resistance
  const resistanceLayer = applyResistance(currentDamage, targetActor, {
    damageType: dmgTypeLower,
    rawDamage
  });
  
  if (resistanceLayer.absorbed > 0 || resistanceLayer.immune) {
    currentDamage = resistanceLayer.remainingDamage;
    result.absorbed += resistanceLayer.absorbed;
    result.layers.push(resistanceLayer);
  }
  
  // Layer 4: Passive Armor (from equipment powers)
  const passiveArmorLayer = applyPassiveArmor(currentDamage, targetActor, {
    damageType: dmgTypeLower
  });
  
  if (passiveArmorLayer.absorbed > 0) {
    currentDamage -= passiveArmorLayer.absorbed;
    result.absorbed += passiveArmorLayer.absorbed;
    result.layers.push(passiveArmorLayer);
  }
  
  result.netDamage = Math.max(0, currentDamage);
  
  if (debug) {
    console.log('[MITIGATION] Result', result);
  }
  
  return result;
}

function applyBodyArmor(damage, armorData, options) {
  const { isEnergyDamage, armorPiercing, armorPiercingCS, apMode } = options;
  
  let physArmor = Number(armorData.physical || 0);
  let enerArmor = Number(armorData.energy || 0);
  
  // Energy attacks reduce body armor by 20
  if (isEnergyDamage && physArmor > 0) {
    physArmor = Math.max(0, physArmor - 20);
  }
  
  // Apply Armor Piercing
  if (apMode === "cs" && armorPiercingCS > 0) {
    const armorToReduce = isEnergyDamage ? enerArmor : physArmor;
    if (armorToReduce > 0) {
      const reduced = applyArmorPiercingCS(armorToReduce, armorPiercingCS);
      if (isEnergyDamage) {
        enerArmor = reduced;
      } else {
        physArmor = reduced;
      }
    }
  } else if (armorPiercing > 0) {
    if (isEnergyDamage) {
      enerArmor = Math.max(0, enerArmor - armorPiercing);
    } else {
      physArmor = Math.max(0, physArmor - armorPiercing);
    }
  }
  
  const effectiveArmor = isEnergyDamage ? enerArmor : physArmor;
  const absorbed = Math.min(damage, effectiveArmor);
  
  return {
    type: 'Body Armor',
    absorbed,
    original: isEnergyDamage ? armorData.energy : armorData.physical,
    modified: effectiveArmor,
    apApplied: (armorPiercing > 0 || armorPiercingCS > 0)
  };
}

function applyForceField(damage, armorData, options) {
  const { isEnergyDamage } = options;
  
  let physField = Number(armorData.physical || 0);
  let enerField = Number(armorData.energy || 0);
  
  // Physical attacks reduce force field by 10
  if (!isEnergyDamage && physField > 0) {
    physField = Math.max(0, physField - 10);
  }
  
  // Force fields ignore Armor Piercing
  const effectiveField = isEnergyDamage ? enerField : physField;
  const absorbed = Math.min(damage, effectiveField);
  
  return {
    type: 'Force Field',
    absorbed,
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
  
  // Check for immunity (attack weaker than resistance)
  if (rawDamage < resistanceValue) {
    return {
      type: `${resistanceType} Resistance`,
      absorbed: damage,
      remainingDamage: 0,
      immune: true,
      reason: `Attack intensity (${rawDamage}) below resistance (${resistanceValue})`
    };
  }
  
  // Normal resistance reduces damage
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
  
  const absorbed = Math.min(damage, armorPower.value ?? 0);
  
  return {
    type: `Passive Armor (${armorPower.name || "Unnamed"})`,
    absorbed,
    powerName: armorPower.name
  };
}

function applyArmorPiercingCS(armorValue, csReduction) {
  const rankEntries = Object.entries(CONFIG.FASERIP.rankValues)
    .sort((a, b) => a[1] - b[1]);
  
  // Find the closest rank at or above the armor value
  let currentIndex = rankEntries.findIndex(([_, val]) => val >= armorValue);
  
  // If armor is higher than all ranks, use the highest rank
  if (currentIndex < 0) {
    currentIndex = rankEntries.length - 1;
  }
  
  // If armor is between ranks, find the next lower rank
  if (currentIndex > 0 && rankEntries[currentIndex][1] > armorValue) {
    currentIndex--;
  }
  
  const newIndex = Math.max(0, currentIndex - csReduction);
  return rankEntries[newIndex][1];
}

function isResistanceApplicable(damageType, resistanceType) {
  const dmgLower = String(damageType).toLowerCase();
  const resLower = String(resistanceType).toLowerCase();
  
  if (resLower === "physical") {
    return dmgLower.includes("physical") || dmgLower.includes("blunt") || dmgLower.includes("edged");
  }
  if (resLower === "energy") {
    return dmgLower.includes("energy");
  }
  if (resLower === "cold" || resLower === "ice") {
    return dmgLower.includes("cold") || dmgLower.includes("ice");
  }
  if (resLower === "fire" || resLower === "heat") {
    return dmgLower.includes("fire") || dmgLower.includes("heat");
  }
  if (resLower === "electricity" || resLower === "electric") {
    return dmgLower.includes("electricity") || dmgLower.includes("electric");
  }
  
  return dmgLower.includes(resLower);
}

export function getMitigationSummary(mitigationResult) {
  if (mitigationResult.layers.length === 0) {
    return "No defenses applied";
  }
  
  return mitigationResult.layers
    .filter(layer => layer.absorbed > 0 || layer.immune)
    .map(layer => {
      if (layer.immune) {
        return `${layer.type}: IMMUNE (${layer.reason})`;
      }
      return `${layer.type} absorbed ${layer.absorbed} damage`;
    })
    .join("; ");
}