// power-router.js v1.13.1 - 2026-09-03
// v1.13.1: rollPower tags existing tab stunts that match book presets for the
//          power (stunt-mechanics adoptPresets) before dispatch.
// power-router.js v1.13.0 - 2026-09-03
// v1.13.0: Psi-Screen early-route (system.mental.psiScreen or name) to
//          psi-screen-action.js (protect others) instead of the generic mental
//          save dialog. Delivered LF.
// power-router.js v1.12.0 - 2026-07-05
// v1.12.0: Body-defense early-route (audit: bodyAlterationsDefensive passive
//          leftovers) — bodyAlterationsDefensive-category powers without a
//          dedicated dialog dispatch to body-defense-action.js (info cards) before
//          the non-attack bail. Recovery / Healing / Damage Transfer route earlier.
// power-router.js v1.11.0 - 2026-07-05
// v1.11.0: Body-control early-route (audit Step #8, slice 8b) — bodyControl-
//          category / isTransformPower powers dispatch to body-control-action.js
//          (Shape-Shifting / Imitation / Animal Transformation Power FEATs +
//          passive state info cards) before the non-attack bail.
// power-router.js v1.10.0 - 2026-07-03
// v1.10.0: Movement early-route (audit Step #6) — movement-category /
//          isMovementPower powers dispatch to movement-action.js (Teleport /
//          Dimensional Travel Power FEATs + passive info cards).
// power-router.js v1.9.0 - 2026-07-03
// v1.9.0: Senses early-route (audit Step #7) — senses-category / isSensePower
//         powers dispatch to sense-action.js (detection Power FEATs + passive
//         info cards) before the non-attack bail.
// power-router.js v1.8.0 - 2026-05-15
// v1.8.0: Blinding Touch early-route — dedicated dialog (was previously in
//         ENERGY_TYPES list, misrouted to EnergyAction as energy damage).
//         Matches by name or isBlindingTouch flag.
// v1.7.0: Paralyzing Touch early-route — dedicated dialog (was previously
//         in ENERGY_TYPES list, misrouted to EnergyAction as energy damage).
//         Matches by name or isParalyzingTouch flag. Self-target permitted
//         per RAW "user can be KO'd by own touch".
// v1.6.0: Health-Drain Touch early-route — dedicated dialog (was previously
//         in ENERGY_TYPES list, misrouted to EnergyAction). Removes
//         "health-drain touch" from ENERGY_TYPES; matches by name or by
//         isHealthDrain flag.
// v1.5.0: Damage Transfer early-route — detects by name or isDamageTransfer
//         flag. Opens showDamageTransferDialog (two-target conduit touch).
// v1.4.0: Healing power early-route — detects by name or isHealingPower
//         flag (with regenerationType/absorptionType absent, since those
//         share the same template section). Opens showHealingDialog
//         (two-mode: Health / Endurance rank).
// v1.3.0: Recovery power early-route — detects by hasRecoveryPower flag or
//         name match before the NON_ATTACK_TYPES bail; opens
//         showRecoveryFeatDialog (Power-rank FEAT, oncePerDay).
// v1.2.0: Wire battleEffectsColumn as explicit action type override.
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

// Battle Effects Column (power sheet) → action type
const BEC_TO_ACTION = {
  "BA": "blunt-attack",
  "EA": "edged-attack",
  "S":  "shooting",
  "TE": "throwing-edged",
  "TB": "throwing-blunt",
  "En": "energy",
  "Fo": "force",
  "Ch": "charging",
  "Gp": "grappling",
  "Gb": "grabbing",
  "Me": "mental"
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
  "shocking touch", "corrosive touch", "rotting touch"
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
  "psionic attack", "nullifying power", "nullification"
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

  try {
    const { adoptPresets } = await import("./stunt-mechanics.js");
    await adoptPresets(actor, item);
  } catch (err) { console.warn("[FASERIP] stunt preset adoption skipped:", err); }

  const category     = item.system.category || "";
  const powerType    = (item.system.type || "").toLowerCase();
  const requiresSave = item.system.requiresSave;
  const catLower     = category.toLowerCase();

  // Determine attack type — explicit setting or auto-detect
  // battleEffectsColumn (power sheet UI) takes priority, then legacy attackType
  const bec = item.system.battleEffectsColumn || "";
  let actionType = BEC_TO_ACTION[bec] || item.system.attackType;

  // Nullifying Power: always route to mental-power regardless of category/type settings
  const nameLower = (item.name || "").toLowerCase();
  if (nameLower.includes("nullif")) {
    return ActionDispatcher.roll("mental-power", {
      actor,
      opts: { itemId: item.id, item }
    });
  }

  // Psi-Screen: extend the screen over others (own dialog; passive defense otherwise)
  if (item.system?.mental?.psiScreen === true || nameLower.includes("psi-screen") || nameLower.includes("psi screen") || nameLower.includes("psiscreen")) {
    const { showPsiScreenDialog } = await import("./psi-screen-action.js");
    return showPsiScreenDialog(actor, item);
  }

  // Recovery: Power-rank FEAT to restore one Endurance rank per day.
  // Matches by name or by the hasRecoveryPower flag on the power item.
  if (nameLower === "recovery" || item.system?.hasRecoveryPower === true) {
    const { showRecoveryFeatDialog } = await import("./recovery-action.js");
    return showRecoveryFeatDialog(actor, item);
  }

  // Healing: target-other dialog with Health or Endurance-rank mode.
  // Matches by name or by the isHealingPower flag with no regenerationType
  // (regenerationType is the SELF-regen flag — different power, same UI block).
  if (nameLower === "healing" ||
      (item.system?.isHealingPower === true && !item.system?.regenerationType && !item.system?.absorptionType)) {
    const { showHealingDialog } = await import("./healing-action.js");
    return showHealingDialog(actor, item);
  }

  // Damage Transfer: two-target conduit touch. Hero transfers HP from
  // source to sink; hero cannot be either party.
  if (nameLower === "damage transfer" || item.system?.isDamageTransfer === true) {
    const { showDamageTransferDialog } = await import("./damage-transfer-action.js");
    return showDamageTransferDialog(actor, item);
  }

  // Health-Drain Touch: single-target drain. Hero is the sink; overheal
  // lost per RAW. Target reduced to 0 rolls End FEAT to avoid dying.
  if (nameLower === "health-drain touch" || nameLower === "health drain touch" || item.system?.isHealthDrain === true) {
    const { showHealthDrainDialog } = await import("./health-drain-action.js");
    return showHealthDrainDialog(actor, item);
  }

  // Paralyzing Touch: Fighting FEAT (skip if self-target) → target End FEAT
  // vs power rank → on fail, applyParalyzed for 1d10 rounds. Self-target
  // permitted per RAW "user can be KO'd by own touch".
  if (nameLower === "paralyzing touch" || item.system?.isParalyzingTouch === true) {
    const { showParalyzingTouchDialog } = await import("./paralyzing-touch-action.js");
    return showParalyzingTouchDialog(actor, item);
  }

  // Blinding Touch: Fighting FEAT touch. On Slam (Y) or Stun (R) color
  // result, target blinded 1d10 rounds. Protected Senses bypasses.
  if (nameLower === "blinding touch" || item.system?.isBlindingTouch === true) {
    const { showBlindingTouchDialog } = await import("./blinding-touch-action.js");
    return showBlindingTouchDialog(actor, item);
  }

  // Senses: detection Power FEATs + passive info cards (audit Step #7).
  // Routed before the non-attack bail so sense powers get a real workflow.
  if (catLower === "senses" || item.system?.isSensePower === true) {
    const { showSenseFeat } = await import("./sense-action.js");
    return showSenseFeat(actor, item);
  }

  // Movement: Teleportation / Dimensional Travel Power FEATs + passive info
  // cards (audit Step #6). Routed before the non-attack bail.
  if (catLower === "movement" || item.system?.isMovementPower === true) {
    const { showMovementFeat } = await import("./movement-action.js");
    return showMovementFeat(actor, item);
  }

  // Body Control: self-transformation powers post an activation card — a Power
  // FEAT for Shape-Shifting / Imitation / Animal Transformation, an info card
  // for the continuous states (audit Step #8, slice 8b). Routed before the
  // non-attack bail. Passive state AEs are handled in body-control-effects.js.
  if (catLower === "bodycontrol" || item.system?.isTransformPower === true) {
    const { showBodyControlFeat } = await import("./body-control-action.js");
    return showBodyControlFeat(actor, item);
  }

  // Body Alterations (Defensive): the passive defensive powers with no dedicated
  // dialog (Water Breathing, Life Support, Pheromones, Immortality, plus Body
  // Armor / Absorption / Regeneration / Solar Regeneration) post an info card
  // instead of the non-attack bail. Recovery / Healing / Damage Transfer are
  // routed to their own dialogs earlier, so they never reach here.
  if (catLower === "bodyalterationsdefensive") {
    const { showBodyDefenseFeat } = await import("./body-defense-action.js");
    return showBodyDefenseFeat(actor, item);
  }

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
