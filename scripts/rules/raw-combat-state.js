// scripts/rules/raw-combat-state.js v2.0.0 - 2026-08-21
// v2.0.0: Two-state model (declare / actions). Pre-Action is a per-character
//         gate inside the actions state, not a phase; winner/loser sub-phases
//         removed (side initiative values already order the tracker). Missing
//         declarations default to Attack.
// Pure RAW combat-state helpers. No Foundry globals so the phase traffic-cop
// can be regression-tested without booting Foundry.

export const RAW_PHASES = Object.freeze({
  DECLARE: "declare",
  ACTIONS: "actions"
});

// Pre-v2 combats may still carry these stored phase values.
const LEGACY_ACTION_PHASES = new Set(["preaction", "actions-winner", "actions-loser", "actions"]);

export function normalizeRawPhase(stored) {
  if (LEGACY_ACTION_PHASES.has(stored)) return RAW_PHASES.ACTIONS;
  return RAW_PHASES.DECLARE;
}

export const RAW_ATTACK_TYPES = new Set([
  "blunt-attack", "edged-attack", "shooting", "throwing-edged", "throwing-blunt",
  "energy", "force", "mental-power", "grenade", "grappling", "grabbing", "charging"
]);

export const RAW_DEFENSE_ACTIONS = Object.freeze({
  dodging: "dodge",
  blocking: "block",
  evading: "evade"
});

export const RAW_VOLUNTARY_TYPES = new Set([
  ...RAW_ATTACK_TYPES,
  ...Object.keys(RAW_DEFENSE_ACTIONS)
]);

// Declarations are optional: an absent one is the default Attack intention.
function withDefault(declaration) {
  return (declaration && declaration.type)
    ? declaration
    : { type: "attack", label: "Attack", defaulted: true };
}

export function getPreActionRequirement(declaration) {
  const decl = declaration || {};
  if (!decl.type) return null;
  if (decl.type === "dodge") return { action: "dodging", ability: "agility", label: "Dodge" };
  if (decl.type === "block" || decl.type === "defend") return { action: "blocking", ability: "strength", label: "Block" };
  if (decl.type === "evade") return { action: "evading", ability: "fighting", label: "Evade" };
  if (decl.type === "multi") {
    const attackCount = Number(decl.attackCount || 2) >= 3 ? 3 : 2;
    return {
      action: "multiattack",
      ability: "fighting",
      label: `${attackCount} Attacks`,
      attackCount,
      intensity: attackCount === 3 ? "Amazing" : "Remarkable"
    };
  }
  return null;
}

export function isPreActionResolved({ declaration, preActionResolved, round }) {
  const req = getPreActionRequirement(declaration);
  if (!req) return true;
  return !!(preActionResolved && preActionResolved.round === round && preActionResolved.action === req.action);
}

export function authorizeRawAction({
  phase,
  declaration,
  preActionResolved,
  actionState,
  round,
  actionType,
  rawPreAction = false,
  actorName = "Character"
} = {}) {
  if (!RAW_VOLUNTARY_TYPES.has(actionType)) return { ok: true, consumesCombatAction: false };

  const decl = withDefault(declaration);
  const state = normalizeRawPhase(phase);

  if (state === RAW_PHASES.DECLARE) {
    return { ok: false, message: "Roll initiative first. Combat actions and movement begin once initiative is set." };
  }

  const declaredDefense = decl.type === "defend" ? "block" : decl.type;
  const expectedDefense = RAW_DEFENSE_ACTIONS[actionType];
  const resolved = isPreActionResolved({ declaration: decl, preActionResolved, round });

  // Declared defensive FEATs: rolled once via the tracker Roll button, then locked.
  if (expectedDefense) {
    if (declaredDefense !== expectedDefense) {
      return { ok: false, message: `${actorName} declared ${decl.label || decl.type}, not ${expectedDefense}. Use Change Action first.` };
    }
    if (resolved) {
      return { ok: false, message: "The declared defensive FEAT is already locked for this round." };
    }
    if (!rawPreAction) {
      return { ok: false, message: `Use ${actorName}'s Roll button in the combat tracker so the result can be locked.` };
    }
    return { ok: true, consumesCombatAction: false };
  }

  // Attack path: a declared Multiple Attacks FEAT must be resolved first.
  if (!resolved) {
    return { ok: false, message: `${actorName}'s declared FEAT has not been rolled yet. Use the tracker Roll button.` };
  }

  if (!RAW_ATTACK_TYPES.has(actionType)) return { ok: true, consumesCombatAction: false };

  const used = !!(actionState?.round === round && actionState?.combatActionUsed);
  if (used) return { ok: false, message: `${actorName} has already used the declared combat action this round.` };

  if (["block", "defend", "evade"].includes(decl.type)) {
    return { ok: false, message: `${actorName} declared ${decl.label || decl.type} and cannot make an attack this round.` };
  }
  if (decl.type === "move") return { ok: false, message: `${actorName} declared Move Only. A successful Change Action was required before attacking.` };
  if (decl.type === "other") return { ok: false, message: `${actorName} declared Other. A successful Change Action was required before attacking.` };
  if (decl.type === "charge" && actionType !== "charging") return { ok: false, message: `${actorName} declared a Charge. Use the Charging action.` };
  if (actionType === "charging" && decl.type !== "charge") return { ok: false, message: `${actorName} did not declare a Charge.` };
  if (decl.type === "multi" && !["blunt-attack", "edged-attack", "shooting"].includes(actionType)) {
    return { ok: false, message: "RAW Multiple Attacks apply to Slugfest and Shooting attacks only." };
  }
  if (!["attack", "charge", "dodge", "multi"].includes(decl.type)) {
    return { ok: false, message: `${actorName}'s declaration does not permit this attack.` };
  }

  return { ok: true, consumesCombatAction: true };
}

export function authorizeRawMovement({
  phase,
  declaration,
  actorName = "Character"
} = {}) {
  const decl = withDefault(declaration);
  const state = normalizeRawPhase(phase);

  if (state === RAW_PHASES.DECLARE) {
    return { ok: false, message: "Movement begins once initiative is rolled." };
  }
  if (["block", "defend"].includes(decl.type)) {
    return { ok: false, message: `${actorName} declared Block and may take no other action this round.` };
  }
  return { ok: true };
}
