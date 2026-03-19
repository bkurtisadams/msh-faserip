// power-router.js v1.1.0 - 2026-03-19
// v1.1.0: Route "psionic attack" through mental-power action (was intensity).
// Shared power routing logic extracted from actorSheet.js .power-roll handler.
// Determines the correct action type for a power and dispatches through ActionDispatcher.

import { ActionDispatcher } from "./action-dispatcher.js";

// ── Type lists ─────────────────────────────────────────────

const LEGACY_MAP = {
  "ranged-energy": "energy",
  "ranged-force": "force",
  "ranged-projectile": "shooting",
  "ranged-thrown": "throwing-blunt",
  "melee-blunt": "blunt-attack",
  "melee-edged": "edged-attack",
  "touch": "energy",
  "grapple": "grappling",
  "charging": "charging"
};

const FORCE_TYPES = [
  "air control", "water control", "earth control",
  "sound generation", "stunning missile",
  "telekinesis", "magnetic manipulation", "gravity manipulation",
  "force field generation", "weather control"
];

const ENERGY_TYPES = [
  "fire control", "fire generation", "energy generation",
  "electrical manipulation", "light manipulation",
  "energy touch", "darkforce manipulation", "darkforce generation",
  "shocking touch", "corrosive touch", "rotting touch",
  "health-drain touch", "paralyzing touch", "blinding touch"
];

const THROWING_BLUNT_TYPES = ["ice generation"];
const THROWING_EDGED_TYPES = ["slashing missile"];
const SHOOTING_TYPES       = ["projectile missile"];
const EDGED_ATTACK_TYPES   = ["claws"];
const GRAPPLING_TYPES      = ["ensnaring missile"];

const MENTAL_TYPES = [
  "mind control", "emotion control",
  "possession", "transferral", "mental probe",
  "telepathy", "image generation",
  "psionic attack"
];

const NON_ATTACK_CATEGORIES = ["resistances", "senses", "movement"];
const NON_ATTACK_TYPES = [
  // Resistances
  "resistance to fire", "resistance to cold", "resistance to electricity",
  "resistance to radiation", "resistance to toxins", "resistance to corrosives",
  "resistance to emotion", "resistance to mental", "resistance to magical",
  "resistance to disease", "invulnerability",
  // Senses
  "protected senses", "enhanced senses", "infravision", "cosmic awareness",
  "combat sense", "computer links", "emotion detection", "energy detection",
  "magic detection", "magnetic detection", "mutant detection", "psionic detection",
  "astral detection", "tracking",
  // Movement
  "flight", "gliding", "leaping", "wall-crawling", "lightning speed",
  "teleportation", "levitation", "swimming", "climbing", "digging",
  "dimensional travel",
  // Body Controls (self-affecting)
  "growth", "shrinking", "density manipulation", "phasing", "invisibility",
  "plasticity", "elongation", "shape-shifting", "imitation",
  "body transformation", "animal transformation", "blending", "alter ego",
  // Body Alterations/Defensive
  "body armor", "water breathing", "absorption", "regeneration",
  "solar regeneration", "recovery", "life support", "pheromones",
  "damage transfer", "healing", "immortality"
];

// Action type → required ability
const ABILITY_FOR_ACTION = {
  "edged-attack":    "fighting",
  "blunt-attack":    "fighting",
  "grappling":       "strength",
  "charging":        "endurance",
  "mental-power":    undefined  // mental-power uses its own ability resolution
};
// Everything else (energy, force, shooting, throwing-*) defaults to agility.

// ── Helpers ────────────────────────────────────────────────

function matchesList(powerTypeLower, list) {
  for (const entry of list) {
    if (powerTypeLower.includes(entry)) return true;
  }
  return false;
}

function detectFromList(powerTypeLower, list) {
  for (const entry of list) {
    if (powerTypeLower.includes(entry)) return true;
  }
  return false;
}

// ── Main entry point ───────────────────────────────────────

/**
 * Route a power item to the correct action dialog via ActionDispatcher.
 * @param {Actor} actor - The owning actor
 * @param {Item} item   - The power item
 * @returns {Promise}   - Result from ActionDispatcher.roll() or undefined
 */
export async function rollPower(actor, item) {
  if (!actor || !item) {
    ui.notifications.error("Actor or power not found");
    return;
  }

  const category     = item.system.category || "";
  const powerType    = (item.system.type || "").toLowerCase();
  const requiresSave = item.system.requiresSave;
  const catLower     = category.toLowerCase();

  // Determine attack type — explicit setting or auto-detect
  let actionType = item.system.attackType;

  // Normalize legacy values
  if (actionType) {
    actionType = LEGACY_MAP[actionType] || actionType;
  }

  // Auto-detect if no explicit type
  if (!actionType || actionType === "") {
    const ptl = powerType.toLowerCase();

    // Non-attack powers — bail
    if (NON_ATTACK_CATEGORIES.includes(catLower)) {
      ui.notifications.info(`${item.name} is not typically used as an attack power.`);
      return;
    }
    for (const nat of NON_ATTACK_TYPES) {
      if (ptl.includes(nat)) {
        ui.notifications.info(`${item.name} is not typically used as an attack power.`);
        return;
      }
    }

    // Specific type matching
    if      (detectFromList(ptl, FORCE_TYPES))          actionType = "force";
    else if (detectFromList(ptl, ENERGY_TYPES))         actionType = "energy";
    else if (detectFromList(ptl, THROWING_BLUNT_TYPES)) actionType = "throwing-blunt";
    else if (detectFromList(ptl, THROWING_EDGED_TYPES)) actionType = "throwing-edged";
    else if (detectFromList(ptl, SHOOTING_TYPES))       actionType = "shooting";
    else if (detectFromList(ptl, EDGED_ATTACK_TYPES))   actionType = "edged-attack";
    else if (detectFromList(ptl, GRAPPLING_TYPES))      actionType = "grappling";
    else if (detectFromList(ptl, MENTAL_TYPES))         actionType = "mental";

    // requiresSave + save.intensity → intensity dialog
    if (!actionType && requiresSave) {
      const saveBlock = item.system.save || {};
      if (saveBlock.intensity && saveBlock.intensity !== "none") {
        const saveAbility = saveBlock.ability || "endurance";
        return ActionDispatcher.roll("intensity", {
          actor,
          abilityName: saveAbility,
          opts: { itemId: item.id, item }
        });
      }
    }

    // Category-based fallbacks
    if (!actionType) {
      if (catLower === "mentalpowers") {
        actionType = "mental";
      } else if (catLower === "mattercontrol") {
        actionType = "force";
      } else if (catLower === "energycontrol") {
        actionType = "energy";
      } else if (catLower === "distanceattacks") {
        const ptl2 = powerType.toLowerCase();
        if      (/fire|energy|electric|light|dark|corrosive/i.test(ptl2)) actionType = "energy";
        else if (/sound|stun|force/i.test(ptl2))                         actionType = "force";
        else if (/ice|throw/i.test(ptl2))                                actionType = "throwing-blunt";
        else if (/slash|edge/i.test(ptl2))                               actionType = "throwing-edged";
        else if (/projectile|missile|shoot/i.test(ptl2))                 actionType = "shooting";
        else if (/ensnar|grappl|web/i.test(ptl2))                        actionType = "grappling";
        else                                                              actionType = "energy";
      } else if (catLower === "bodyalterationsoffensive") {
        actionType = /claw/i.test(powerType) ? "edged-attack" : "energy";
      } else {
        actionType = "energy";
      }
    }
  }

  // ── Dispatch ─────────────────────────────────────────────

  // Mental powers use their own action class
  if (actionType === "mental") {
    return ActionDispatcher.roll("mental-power", {
      actor,
      opts: { itemId: item.id, item }
    });
  }

  // Determine ability from action type
  const abilityName = ABILITY_FOR_ACTION[actionType] || "agility";

  return ActionDispatcher.roll(actionType, {
    actor,
    abilityName,
    opts: { itemId: item.id, item }
  });
}
