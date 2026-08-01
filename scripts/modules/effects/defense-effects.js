// scripts/modules/effects/defense-effects.js v1.7.0 - 2026-07-31
// v1.7.0: registerDefenseAE — skip the update when nothing changed (auto-sync
//         was rewriting ~100 identical AEs every load); strip statuses another
//         AE already provides so creates aren't core-rejected (Body Armor vs
//         Growth-derived armor fight); log a warning instead of "created"
//         when creation was prevented.
// scripts/modules/effects/defense-effects.js v1.6.0 - 2026-07-02
// v1.6.0: Energy Reflection defense AE (Step #3 slice 1). New defenseType
//         "energyReflection" built when sys.isEnergyReflection. Flags:
//         reflectionType (specific energy or broad "energy"), threshold
//         (Unearthly 100 per RAW), rank/rankValue (reflect range). The
//         Resistance AE is suppressed for reflection items — the preset
//         also seeds isResistance+invulnerability for sheet coherence,
//         and an unlimited invulnerability AE would swallow the >100
//         remainder the hero is supposed to take.
// v1.5.3: Pass mshIntentional when deleting defense AEs so the global
//         preDeleteActiveEffect guard does not block sync cleanup.
// v1.5.2: Remove stale/orphan defense AEs by powerItemId as well as
//         ongoingId, and prune defense AEs that point at missing or
//         no-longer-defensive powers during bulk sync.
// v1.5.1: Treat resistanceEffect=invulnerability as an invulnerability
//         even if older/imported items lack resistanceIsInvulnerability.
// v1.5.0: Absorption AE also builds from absorptionSpecific alone (no broad
//         Type required), so a type-specific absorber (e.g. sound) can be
//         scoped without widening it. Status id falls back to the specific.
// v1.4.1: inferArmorNature helper — armorNature derives from source ===
//         "equipment" or grantedByEquipment === true when not explicitly
//         set on the power. Explicit values always win. Per
//         DESIGN-material-strength §4 / §7.6.
// v1.4.0: Align BA/FF detection with getBodyArmorValues — name-fallback
//         detection (item.name or system.type contains "body armor" /
//         "force field") in syncDefenseEffects and syncAllDefenseEffects.
//         Powers like "Body Armor" with isBodyArmor unset now get a
//         proper defense AE built on sync; previously only the
//         damage-pipeline path recognized them, leaving the AE pipeline
//         (shred FEAT target, resistance pipeline) blind. Helpers
//         isBodyArmorByName / isForceFieldByName / looksLikeDefensivePower
//         centralize the fallback.
// v1.3.0: Body Armor defense AE now carries materialStrength field
//         (defaults to power rank). Consumed by executeShredFeat for
//         the target-side intensity in the Shred FEAT pipeline.
// v1.2.0: Absorption defense AE — resolveAbsorptionValues, buildAbsorptionAE, sync block.
//         Gated on sys.absorptionType truthy. Flags: absorptionType, absorptionSpecific,
//         convertsToHealth, canRedirect, rankValue.
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
// Absorption:  "defense.absorption.<itemId>"
// Reflection:  "defense.energyReflection.<itemId>"

function defenseEffectId(type, itemId) {
  return `defense.${type}.${itemId}`;
}

function isDefenseEffect(ae) {
  const scope = SCOPE();
  return ae.flags?.[scope]?.effectCategory === "defense";
}

function getDefenseFlags(ae) {
  const scope = SCOPE();
  return ae.flags?.[scope] || {};
}

function getDefenseTypeForEffectId(effectId = "") {
  const parts = String(effectId || "").split(".");
  return parts.length >= 3 && parts[0] === "defense" ? parts[1] : "";
}

function getItemIdForEffectId(effectId = "") {
  const parts = String(effectId || "").split(".");
  return parts.length >= 3 && parts[0] === "defense" ? parts.slice(2).join(".") : "";
}

function matchesDefenseAEForItem(ae, effectId, defenseType = "", itemId = "") {
  const f = getDefenseFlags(ae);
  if (f.effectCategory !== "defense") return false;
  if (defenseType && f.defenseType !== defenseType) return false;

  return f.ongoingId === effectId
      || (!!itemId && f.powerItemId === itemId);
}

// ─── Resolve protection values from a power item ─────────────────────────────

function inferArmorNature(sys) {
  if (sys?.armorNature) return sys.armorNature;
  if (sys?.grantedByEquipment === true) return "artificial";
  if (sys?.source === "equipment") return "artificial";
  return "natural";
}

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
    armorNature: inferArmorNature(sys),
    // Material strength of the BA itself — used by Shred FEAT.
    // Per RAW the power rank IS the BA's material strength (same
    // convention as the Claws power "Power rank lists both the damage
    // inflicted by the claws and the material strength"). Override via
    // a dedicated schema field is a future addition if needed.
    materialStrength: sys.rank || getClosestRankName(physical),
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
  const resistanceEffect = sys.resistanceEffect || "damageReduction";
  const isInvuln = sys.resistanceIsInvulnerability === true
    || resistanceEffect === "invulnerability"
    || resistanceEffect === "immunity";

  return {
    resistanceType: sys.resistanceType || "",
    resistanceSpecific: sys.resistanceSpecific || "",
    resistanceEffect: isInvuln ? "invulnerability" : resistanceEffect,
    resistanceValue: isInvuln ? 1000 : value,
    rankValue: value,
    rank: sys.rank || getClosestRankName(value),
    isInvulnerability: isInvuln,
  };
}

function resolveAbsorptionValues(item) {
  const sys = item.system || {};
  const rankValue = getRankValue(sys.rank);
  const value = typeof sys.value === "number" ? sys.value : rankValue;

  return {
    absorptionType: sys.absorptionType || "",
    absorptionSpecific: sys.absorptionSpecific || "",
    convertsToHealth: sys.absorptionConvertsToHealth === true,
    canRedirect: sys.absorptionCanRedirect === true,
    rankValue: value,
    rank: sys.rank || getClosestRankName(value),
  };
}

function resolveEnergyReflectionValues(item) {
  const sys = item.system || {};
  const rankValue = getRankValue(sys.rank);
  const value = typeof sys.value === "number" ? sys.value : rankValue;
  // Specific energy form chosen on the sheet (resistanceType dropdown),
  // falling back to the preset's broad "energy".
  const reflectionType = sys.energyReflectionType && sys.energyReflectionType !== "energy"
    ? sys.energyReflectionType
    : (sys.resistanceType || sys.energyReflectionType || "energy");

  return {
    reflectionType,
    // RAW: attacks up to Unearthly damage or Intensity inflict no damage.
    threshold: 100,
    rankValue: value,
    rank: sys.rank || getClosestRankName(value),
  };
}

function isBodyArmorByName(item) {
  const name = String(item.name || "").toLowerCase();
  const type = String(item.system?.type || "").toLowerCase();
  return name.includes("body armor") || name.includes("body armour")
      || type.includes("body armor");
}

function isForceFieldByName(item) {
  const name = String(item.name || "").toLowerCase();
  const type = String(item.system?.type || "").toLowerCase();
  return name.includes("force field") || type.includes("force field");
}

function looksLikeDefensivePower(item) {
  const sys = item.system || {};
  return sys.isBodyArmor || isBodyArmorByName(item)
      || sys.isForceField || isForceFieldByName(item)
      || (sys.isResistance && sys.resistanceType)
      || sys.absorptionType || sys.absorptionSpecific
      || sys.isEnergyReflection;
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
        materialStrength: values.materialStrength,
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

function buildAbsorptionAE(item, values) {
  const scope = SCOPE();
  const typeLabel = values.absorptionSpecific
    || (values.absorptionType ? values.absorptionType.charAt(0).toUpperCase() + values.absorptionType.slice(1) : "Unknown");
  const modeBits = [];
  if (values.convertsToHealth) modeBits.push("heals");
  if (values.canRedirect) modeBits.push("redirect");
  const modeLabel = modeBits.length ? ` [${modeBits.join("/")}]` : "";
  const label = `Absorption: ${typeLabel} (${values.rank}: ${values.rankValue})${modeLabel}`;

  return {
    name: label,
    img: "",
    disabled: false,
    changes: [],
    statuses: [`absorption-${values.absorptionType || values.absorptionSpecific || "any"}`],
    flags: {
      [scope]: {
        effectCategory: "defense",
        defenseType: "absorption",
        ongoingId: defenseEffectId("absorption", item.id),
        powerItemId: item.id,
        powerName: item.name,
        absorptionType: values.absorptionType,
        absorptionSpecific: values.absorptionSpecific,
        convertsToHealth: values.convertsToHealth,
        canRedirect: values.canRedirect,
        rankValue: values.rankValue,
        rank: values.rank,
        isForceField: false,
      }
    },
  };
}

function buildEnergyReflectionAE(item, values) {
  const scope = SCOPE();
  const typeLabel = values.reflectionType
    ? values.reflectionType.charAt(0).toUpperCase() + values.reflectionType.slice(1)
    : "Energy";
  const label = `Energy Reflection: ${typeLabel} (${values.rank}: blocks \u2264${values.threshold})`;

  return {
    name: label,
    img: "",  // no token badge - passive defense tracked in effects list only
    disabled: false,
    changes: [],
    statuses: [`energy-reflection-${values.reflectionType || "energy"}`],
    flags: {
      [scope]: {
        effectCategory: "defense",
        defenseType: "energyReflection",
        ongoingId: defenseEffectId("energyReflection", item.id),
        powerItemId: item.id,
        powerName: item.name,
        reflectionType: values.reflectionType,
        threshold: values.threshold,
        rankValue: values.rankValue,
        rank: values.rank,
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
  const newFlags = aeData.flags?.[scope] || {};
  const defenseType = newFlags.defenseType || getDefenseTypeForEffectId(effectId);
  const itemId = newFlags.powerItemId || getItemIdForEffectId(effectId);
  const existing = actor.effects.find(e => matchesDefenseAEForItem(e, effectId, defenseType, itemId));

  // Core rejects an AE whose status another AE already provides (e.g. a
  // Body Armor power alongside Growth-derived armor). Strip duplicates so
  // creates aren't prevented and updates don't collide; the status icon
  // is already shown by the other AE.
  const wanted = Array.isArray(aeData.statuses) ? aeData.statuses : [];
  const statuses = wanted.filter(s =>
    !actor.effects.some(e => e !== existing && e.statuses?.has?.(s))
  );

  if (existing) {
    // Skip the DB write when nothing changed — the auto-sync runs every
    // load and was rewriting ~100 identical AEs per boot.
    const eq = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
    const curStatuses = existing.statuses instanceof Set ? [...existing.statuses] : (existing.statuses ?? []);
    const flagsCur = existing.flags?.[scope] ?? {};
    const unchanged =
      existing.name === aeData.name &&
      existing.img === aeData.img &&
      existing.disabled === disabled &&
      curStatuses.length === statuses.length &&
      statuses.every(s => curStatuses.includes(s)) &&
      Object.entries(newFlags).every(([k, v]) => eq(flagsCur[k], v));
    if (unchanged) return existing;

    // Update in place — set disabled state from power's isActive
    const updates = {
      name: aeData.name,
      img: aeData.img,
      statuses: statuses,
      disabled: disabled,
    };
    // Merge flags
    const flagPath = `flags.${scope}`;
    for (const [k, v] of Object.entries(newFlags)) {
      updates[`${flagPath}.${k}`] = v;
    }
    await existing.update(updates);
    console.log(`[FASERIP] Defense AE updated: ${aeData.name} on ${actor.name} (disabled=${disabled})`);
    return existing;
  }

  // Create new AE with correct disabled state
  aeData.statuses = statuses;
  aeData.disabled = disabled;
  const ae = await applyEffect(actor, aeData);
  if (ae) {
    console.log(`[FASERIP] Defense AE created: ${aeData.name} on ${actor.name} (disabled=${disabled})`);
  } else {
    console.warn(`[FASERIP WARN] Defense AE creation was prevented: ${aeData.name} on ${actor.name}`);
  }
  return ae;
}

/**
 * Remove a defense AE by effectId.
 */
async function removeDefenseAE(actor, effectId) {
  const defenseType = getDefenseTypeForEffectId(effectId);
  const itemId = getItemIdForEffectId(effectId);
  const matches = actor.effects.filter(e => matchesDefenseAEForItem(e, effectId, defenseType, itemId));
  if (matches.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", matches.map(e => e.id), { mshIntentional: true });
    console.log(`[FASERIP] Defense AE removed: ${effectId} from ${actor.name} (${matches.length})`);
  }
}

async function pruneStaleDefenseAEs(actor, powers = null) {
  if (!actor?.effects) return 0;
  const powerItems = powers || actor.items.filter(i => i.type === "power");
  const powerById = new Map(powerItems.map(i => [i.id, i]));
  const staleIds = [];

  for (const ae of actor.effects) {
    const f = getDefenseFlags(ae);
    if (f.effectCategory !== "defense") continue;

    const itemId = f.powerItemId || getItemIdForEffectId(f.ongoingId || "");
    if (!itemId) continue;

    const item = powerById.get(itemId);
    if (!item || !looksLikeDefensivePower(item)) {
      staleIds.push(ae.id);
      continue;
    }

    const sys = item.system || {};
    const defenseType = f.defenseType;
    const stillValid = defenseType === "bodyArmor"
      ? (sys.isBodyArmor || isBodyArmorByName(item))
      : defenseType === "forceField"
        ? (sys.isForceField || isForceFieldByName(item))
        : defenseType === "resistance"
          ? (sys.isResistance && sys.resistanceType)
          : defenseType === "absorption"
            ? (sys.absorptionType || sys.absorptionSpecific)
            : false;

    if (!stillValid) staleIds.push(ae.id);
  }

  if (staleIds.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", staleIds, { mshIntentional: true });
    console.log(`[FASERIP] Pruned ${staleIds.length} stale defense AE(s) from ${actor.name}`);
  }
  return staleIds.length;
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
  } else if (sys.isBodyArmor || isBodyArmorByName(item)) {
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
  } else if (sys.isForceField || isForceFieldByName(item)) {
    const values = resolveForceFieldValues(item);
    const aeData = buildForceFieldAE(item, values);
    await registerDefenseAE(actor, ffId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, ffId);
  }

  // ── Resistance ──
  // Suppressed for Energy Reflection items: the reflection preset also seeds
  // isResistance + invulnerability for sheet coherence, but an unlimited
  // invulnerability AE would swallow the >100 remainder (RAW: hero takes it).
  const resId = defenseEffectId("resistance", item.id);
  if (removing) {
    await removeDefenseAE(actor, resId);
  } else if (sys.isResistance && sys.resistanceType && !sys.isEnergyReflection) {
    const values = resolveResistanceValues(item);
    const aeData = buildResistanceAE(item, values);
    await registerDefenseAE(actor, resId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, resId);
  }

  // ── Absorption ──
  const absId = defenseEffectId("absorption", item.id);
  if (removing) {
    await removeDefenseAE(actor, absId);
  } else if (sys.absorptionType || sys.absorptionSpecific) {
    const values = resolveAbsorptionValues(item);
    const aeData = buildAbsorptionAE(item, values);
    await registerDefenseAE(actor, absId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, absId);
  }

  // ── Energy Reflection ──
  const reflId = defenseEffectId("energyReflection", item.id);
  if (removing) {
    await removeDefenseAE(actor, reflId);
  } else if (sys.isEnergyReflection) {
    const values = resolveEnergyReflectionValues(item);
    const aeData = buildEnergyReflectionAE(item, values);
    await registerDefenseAE(actor, reflId, aeData, isInactive);
  } else {
    await removeDefenseAE(actor, reflId);
  }
}

/**
 * Sync all defense powers on an actor (bulk, e.g. on world load).
 * @param {Actor} actor
 */
export async function syncAllDefenseEffects(actor) {
  if (!actor) return;
  const powers = actor.items.filter(i => i.type === "power");
  await pruneStaleDefenseAEs(actor, powers);
  for (const item of powers) {
    await syncDefenseEffects(actor, item, false);
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

    if (f.isInvulnerability || effect === "immunity" || effect === "invulnerability") {
      hasImmunity = true;
      immunityThreshold = Math.max(immunityThreshold, value || 1000);
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