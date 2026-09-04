// scripts/rules/raw-combat-state.js v2.1.0 - 2026-09-03
// v2.1.0: Rulings 2026-09-03. isDefenseRequirement / defensePending: a target
//         whose declared Dodge/Block/Evade is unrolled cannot be attacked yet
//         (RAW step 4: pre-action rolls precede either side's actions).
//         canChangeAction: the Change Action window closes once any combatant
//         has used a combat action this round (RAW: the change roll belongs to
//         the pre-action phase). Ready state helpers for the Declare window.
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

const DEFENSE_REQUIREMENT_ACTIONS = new Set(Object.keys(RAW_DEFENSE_ACTIONS));

export function isDefenseRequirement(requirement) {
  return !!requirement && DEFENSE_REQUIREMENT_ACTIONS.has(requirement.action);
}

// A declared Dodge/Block/Evade must be rolled before anyone attacks its owner.
// Multiple Attacks is the attacker's own gate and never delays a defender.
export function defensePending({ declaration, preActionResolved, round }) {
  const req = getPreActionRequirement(declaration);
  if (!isDefenseRequirement(req)) return false;
  return !isPreActionResolved({ declaration, preActionResolved, round });
}

// Change Action (Yellow Agility) is a pre-action roll: available after
// initiative, before either side acts, once per round, and only while the
// character's own declaration is still open.
export function canChangeAction({
  phase,
  round,
  changeActionAttempted,
  preActionResolved,
  actionState,
  actionsBegun = false,
  actorName = "Character"
} = {}) {
  if (normalizeRawPhase(phase) !== RAW_PHASES.ACTIONS) return { ok: false, message: "Change Action is rolled after initiative." };
  if (changeActionAttempted?.round === round) return { ok: false, message: "Change Action has already been attempted this round." };
  if (actionState?.round === round && actionState?.combatActionUsed) return { ok: false, message: "The declared combat action has already been used this round." };
  if (preActionResolved?.round === round) return { ok: false, message: "The declared Pre-Action FEAT has already been resolved; the action is locked." };
  if (actionsBegun) return { ok: false, message: `Actions have begun this round; ${actorName} can no longer change action (Change Action is a pre-action roll).` };
  return { ok: true };
}

// Declare-window readiness. Player-owned eligible combatants must be ready
// (or have touched their declaration this round); NPCs are the Judge's and
// never block. With no player-owned combatants there is nothing to wait for,
// but nothing to auto-trigger on either — the Judge rolls.
export function isCombatantReady({ ready, declaration, round }) {
  if (ready?.round === round) return true;
  return declaration?.round === round && !declaration?.defaulted;
}

export function readinessSummary(entries, round) {
  const players = entries.filter(e => e.playerOwned);
  const readyCount = players.filter(e => isCombatantReady({ ...e, round })).length;
  return {
    total: players.length,
    ready: readyCount,
    missing: players.filter(e => !isCombatantReady({ ...e, round })),
    allReady: players.length > 0 && readyCount >= players.length
  };
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
