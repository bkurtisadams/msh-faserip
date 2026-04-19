// scripts/modules/effects/defense-effects.js v1.1.1 - 2026-04-03
// v1.1.1: Replace local getRankValue with import from rules-reference.js
// v1.1.0: syncDefenseEffects respects isActive — inactive powers remove defense AEs
// v1.0.1: Strip token badge icons from passive defense AEs (body armor, force field, resistance)
// Passive defense Active Effects for Body Armor, Force Field, and Resistance powers.
// These are always-on (no timer/cycle), toggleable, and auto-sync from power items.
// The mitigation pipeline reads protection values from AE flags.

import { applyEffect } from "./effect-engine.js";
import { rankValue as getRankValue, valueToRank } from "../../rules/rules-reference.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

function getClosestRankName(value) {
  if (!CONFIG.FASERIP?.rankValues) return "";
  let closest = "";
  let closestDiff = Infinity;
  for (const [name, val] of Object.entries(CONFIG.FASERIP.rankValues)) {
    const diff = Math.abs(val - value);
    if (diff < closestDiff) { closest = name; closestDiff = diff; }
  }
  return closest;
}

// ─── Effect ID conventions ───────────────────────────────────────────────────
// Body Armor:  "defense.bodyArmor.<itemId>"
// Force Field: "defense.forceField.<itemId>"
// Resistance:  "defense.resistance.<itemId>"

function defenseEffectId(type, itemId) {
  return `defense.${type}.${itemId}`;
}

function isDefenseEffect(ae) {
  const scope = SCOPE();
  return ae.flags?.[scope]?.effectCategory === "defense";
}

// ─── Resolve protection values from a power item ─────────────────────────────

function resolveBodyArmorValues(item) {
  const sys = item.system || {};
  const rankValue = getRankValue(sys.rank);
  const armorType = sys.bodyArmorType || "both";
  const baseVal = typeof sys.value === "number" ? sys.value : rankValue;

  let physical = (sys.armorPhysical !== undefined && sys.armorPhysical !== 0)
    ? sys.armorPhysical : baseVal;
  let energy = (sys.armorEnergy !== undefined && sys.armorEnergy !== 0)
    ? sys.armorEnergy : Math.max(0, baseVal - 20);

  if (armorType === "physical") energy = 0;
  if (armorType === "energy") physical = 0;

  return {
    physical,
    energy,
    physicalRank: sys.rank || getClosestRankName(physical),
    energyRank: getClosestRankName(energy),
    armorType,
    armorNature: sys.armorNature || "natural",
  };
}

function resolveForceFieldValues(item) {
  const sys = item.system || {};
  const rankValue = getRankValue(sys.rank);
  const value = typeof sys.value === "number" ? sys.value : rankValue;

  // Force Field: full vs Energy, -10 vs physical
  return {
    physical: Math.max(0, value - 10),
    energy: value,
    fullValue: value,
    physicalRank: getClosestRankName(Math.max(0, value - 10)),
    energyRank: sys.rank || getClosestRankName(value),
    forceFieldType: sys.forceFieldType || "personal",
    forceFieldPersonal: sys.forceFieldPersonal ?? true,
    forceFieldCoverage: sys.forceFieldCoverage || 0,
  };
}

function resolveResistanceValues(item) {
  const sys = item.system || {};
  const rankValue = getRankValue(sys.rank);
  const value = typeof sys.value === "number" ? sys.value : rankValue;
  const isInvuln = sys.resistanceIsInvulnerability === true;

  return {
    resistanceType: sys.resistanceType || "",
    resistanceSpecific: sys.resistanceSpecific || "",
    resistanceEffect: sys.resistanceEffect || "damageReduction",
    resistanceValue: isInvuln ? 1000 : value,
    rankValue: value,
    rank: sys.rank || getClosestRankName(value),
    isInvulnerability: isInvuln,
  };
}

// ─── AE builders ─────────────────────────────────────────────────────────────

function buildBodyArmorAE(item, values) {
  const scope = SCOPE();
  const label = `Body Armor: ${item.name} (${values.physicalRank}: ${values.physical}/${values.energy})`;

  return {
    name: label,
    img: "",  // no token badge - passive defense tracked in effects list only
    disabled: false,
    changes: [],
    statuses: ["body-armor"],
    flags: {
      [scope]: {
        effectCategory: "defense",
        defenseType: "bodyArmor",
        ongoingId: defenseEffectId("bodyArmor", item.id),
        powerItemId: item.id,
        powerName: item.name,
        physical: values.physical,
        energy: values.energy,
        physicalRank: values.physicalRank,
        energyRank: values.energyRank,
        armorType: values.armorType,
        armorNature: values.armorNature,
        isForceField: false,
      }
    },
  };
}

function buildForceFieldAE(item, values) {
  const scope = SCOPE();
  const label = `Force Field: ${item.name} (${values.energyRank}: ${values.energy}E/${values.physical}P)`;

  return {
    name: label,
    img: "",  // no token badge - passive defense tracked in effects list only
    flags: {
      [scope]: {
        effectCategory: "defense",
        defenseType: "forceField",
        ongoingId: defenseEffectId("forceField", item.id),
        powerItemId: item.id,
        powerName: item.name,
        physical: values.physical,
        energy: values.energy,
        fullValue: values.fullValue,
        physicalRank: values.physicalRank,
        energyRank: values.energyRank,
        forceFieldType: values.forceFieldType,
        forceFieldPersonal: values.forceFieldPersonal,
        forceFieldCoverage: values.forceFieldCoverage,
        isForceField: true,
      }
    },
  };
}

function buildResistanceAE(item, values) {
  const scope = SCOPE();
  const rt = String(values.resistanceType || "");
  const typeLabel = rt
    ? rt.charAt(0).toUpperCase() + rt.slice(1)
    : "Unknown";
  const invulnLabel = values.isInvulnerability ? "Invulnerability" : "Resistance";
  const label = `${invulnLabel}: ${typeLabel} (${values.rank}: ${values.resistanceValue})`;

  return {
    name: label,
    img: "",  // no token badge - passive defense tracked in effects list only
    disabled: false,
    changes: [],
    statuses: [`resistance-${values.resistanceType}`],
    flags: {
      [scope]: {
        effectCategory: "defense",
        defenseType: "resistance",
        ongoingId: defenseEffectId("resistance", item.id),
        powerItemId: item.id,
        powerName: item.name,
        resistanceType: values.resistanceType,
        resistanceSpecific: values.resistanceSpecific,
        resistanceEffect: values.resistanceEffect,
        resistanceValue: values.resistanceValue,
        rankValue: values.rankValue,
        rank: values.rank,
        isInvulnerability: values.isInvulnerability,
        isForceField: false,
      }
    },
  };
}

// ─── Registration / removal ──────────────────────────────────────────────────

/**
 * Register or update a defense AE for a power item.
 * If the AE already exists, updates its flags; otherwise creates it.
 */
async function registerDefenseAE(actor, effectId, aeData, disabled = false) {
  const scope = SCOPE();
  const existing = actor.effects.find(e => e.flags?.[scope]?.ongoingId === effectId);

  if (existing) {
    // Update in place — set disabled state from power's isActive
    const updates = {
      name: aeData.name,
      img: aeData.img,
      statuses: aeData.statuses,
      disabled: disabled,
    };
    // Merge flags
    const flagPath = `flags.${scope}`;
    const newFlags = aeData.flags?.[scope] || {};
    for (const [k, v] of Object.entries(newFlags)) {
      updates[`${flagPath}.${k}`] = v;
    }
    await existing.update(updates);
    console.log(`[FASERIP] Defense AE updated: ${aeData.name} on ${actor.name} (disabled=${disabled})`);
    return existing;
  }

  // Create new AE with correct disabled state
  aeData.disabled = disabled;
  const ae = await applyEffect(actor, aeData);
  console.log(`[FASERIP] Defense AE created: ${aeData.name} on ${actor.name} (disabled=${disabled})`);
  return ae;
}

/**
 * Remove a defense AE by effectId.
 */
async function removeDefenseAE(actor, effectId) {
  const scope = SCOPE();
  const ae = actor.effects.find(e => e.flags?.[scope]?.ongoingId === effectId);
  if (ae) {
    await ae.delete();
    console.log(`[FASERIP] Defense AE removed: ${effectId} from ${actor.name}`);
  }
}

// ─── Public sync API ─────────────────────────────────────────────────────────

/**
 * Sync all defense AEs for a single power item.
 * Called from createItem/updateItem/deleteItem hooks.
 * @param {Actor} actor
 * @param {Item} item - Power item
 * @param {boolean} removing - True if item is being deleted
 */
export async function syncDefenseEffects(actor, item, removing = false) {
  if (!actor || !item || item.type !== "power") return;
  const sys = item.system || {};

  // Determine if the power is currently inactive (toggled off).
  // Passive powers (activationType === "passive") are always on.
  const isInactive = !removing && sys.activationType !== "passive" && sys.isActive === false;

  // ── Body Armor ──
  const baId = defenseEffectId("bodyArmor", item.id);
  if (removing) {
    await removeDefenseAE(actor, baId);
  } else if (sys.isBodyArmor) {
    const values = resolveBodyArmorValues(item);
    const aeData = buildBodyArmorAE(item, values);
    await registerDefenseAE(actor, baId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, baId);
  }

  // ── Force Field ──
  const ffId = defenseEffectId("forceField", item.id);
  if (removing) {
    await removeDefenseAE(actor, ffId);
  } else if (sys.isForceField) {
    const values = resolveForceFieldValues(item);
    const aeData = buildForceFieldAE(item, values);
    await registerDefenseAE(actor, ffId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, ffId);
  }

  // ── Resistance ──
  const resId = defenseEffectId("resistance", item.id);
  if (removing) {
    await removeDefenseAE(actor, resId);
  } else if (sys.isResistance && sys.resistanceType) {
    const values = resolveResistanceValues(item);
    const aeData = buildResistanceAE(item, values);
    await registerDefenseAE(actor, resId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, resId);
  }
}

/**
 * Sync all defense powers on an actor (bulk, e.g. on world load).
 * @param {Actor} actor
 */
export async function syncAllDefenseEffects(actor) {
  if (!actor) return;
  const powers = actor.items.filter(i => i.type === "power");
  for (const item of powers) {
    const sys = item.system || {};
    if (sys.isBodyArmor || sys.isForceField || (sys.isResistance && sys.resistanceType)) {
      await syncDefenseEffects(actor, item, false);
    }
  }
}

// ─── Query API (for mitigation pipeline) ─────────────────────────────────────

/**
 * Get all active (enabled) defense AEs on an actor.
 * @param {Actor} actor
 * @returns {ActiveEffect[]}
 */
export function getActiveDefenseEffects(actor) {
  if (!actor?.effects) return [];
  const scope = SCOPE();
  return actor.effects.filter(e =>
    !e.disabled && e.flags?.[scope]?.effectCategory === "defense"
  );
}

/**
 * Get aggregated body armor values from defense AEs.
 * Returns the highest physical and energy values across all enabled body armor AEs.
 * @param {Actor} actor
 * @param {string} damageType - For energy detection
 * @returns {Object} { physical, energy, physicalRank, energyRank, hasArmor }
 */
export function getBodyArmorFromEffects(actor, damageType = "physical-blunt") {
  const defenses = getActiveDefenseEffects(actor);
  const scope = SCOPE();

  let physical = 0, energy = 0;
  let physicalRank = "", energyRank = "";

  for (const ae of defenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "bodyArmor") continue;

    const p = Number(f.physical) || 0;
    const e = Number(f.energy) || 0;
    if (p > physical) { physical = p; physicalRank = f.physicalRank || ""; }
    if (e > energy) { energy = e; energyRank = f.energyRank || ""; }
  }

  return { physical, energy, physicalRank, energyRank, hasArmor: physical > 0 || energy > 0 };
}

/**
 * Get aggregated force field values from defense AEs.
 * @param {Actor} actor
 * @returns {Object} { physical, energy, fullValue, physicalRank, energyRank, hasForceField }
 */
export function getForceFieldFromEffects(actor) {
  const defenses = getActiveDefenseEffects(actor);
  const scope = SCOPE();

  let physical = 0, energy = 0, fullValue = 0;
  let physicalRank = "", energyRank = "";

  for (const ae of defenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "forceField") continue;

    const p = Number(f.physical) || 0;
    const e = Number(f.energy) || 0;
    const fv = Number(f.fullValue) || 0;
    if (e > energy) { energy = e; energyRank = f.energyRank || ""; }
    if (p > physical) { physical = p; physicalRank = f.physicalRank || ""; }
    if (fv > fullValue) fullValue = fv;
  }

  return { physical, energy, fullValue, physicalRank, energyRank, hasForceField: fullValue > 0 };
}

/**
 * Get resistance values from defense AEs matching a damage type.
 * @param {Actor} actor
 * @param {string} damageType - e.g. "energy-fire", "physical-blunt"
 * @returns {Object} { damageReduction, csBonus, hasImmunity, immunityThreshold, resistanceType, hasResistance }
 */
export function getResistanceFromEffects(actor, damageType = "physical-blunt") {
  const defenses = getActiveDefenseEffects(actor);
  const scope = SCOPE();
  const dmgLower = String(damageType).toLowerCase();

  // Extract base type (e.g. "fire" from "energy-fire")
  let baseType = dmgLower;
  if (dmgLower.includes("-")) baseType = dmgLower.split("-")[1];

  let damageReduction = 0;
  let csBonus = 0;
  let hasImmunity = false;
  let immunityThreshold = 0;
  let matchedType = "";

  for (const ae of defenses) {
    const f = ae.flags?.[scope];
    if (f?.defenseType !== "resistance") continue;

    const resType = (f.resistanceType || "").toLowerCase();
    if (!isResistanceMatch(baseType, resType, dmgLower)) continue;

    matchedType = f.resistanceType;
    const value = Number(f.resistanceValue) || 0;
    const effect = f.resistanceEffect || "damageReduction";

    if (f.isInvulnerability || effect === "immunity") {
      hasImmunity = true;
      immunityThreshold = Math.max(immunityThreshold, value);
    } else if (effect === "damageReduction") {
      damageReduction = Math.max(damageReduction, value);
    } else if (effect === "columnShift") {
      csBonus += (Number(f.rankValue) || 2);
    }
  }

  return {
    damageReduction,
    csBonus,
    hasImmunity,
    immunityThreshold,
    resistanceType: matchedType,
    hasResistance: damageReduction > 0 || csBonus > 0 || hasImmunity,
  };
}

/**
 * Check if a resistance type matches a damage type.
 */
function isResistanceMatch(baseType, resType, fullDmgType) {
  if (!resType) return false;
  if (resType === baseType) return true;

  // Broad matches
  if (resType === "physical" && (fullDmgType.includes("physical") || fullDmgType.includes("blunt") || fullDmgType.includes("edged"))) return true;
  if (resType === "energy" && fullDmgType.includes("energy")) return true;
  if ((resType === "fire" || resType === "heat") && (baseType === "fire" || baseType === "heat")) return true;
  if ((resType === "cold" || resType === "ice") && (baseType === "cold" || baseType === "ice")) return true;
  if ((resType === "electricity" || resType === "electric") && (baseType === "electricity" || baseType === "electric")) return true;
  if (resType === "radiation" && baseType === "light") return true;

  return fullDmgType.includes(resType);
}