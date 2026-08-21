// scripts/rules/raw-combat-state.js v1.1.0 - 2026-08-21
// Pure RAW combat-state helpers. No Foundry globals so the phase traffic-cop
// can be regression-tested without booting Foundry.

export const RAW_PHASES = Object.freeze({
  DECLARE: "declare",
  PREACTION: "preaction",
  ACTIONS_WINNER: "actions-winner",
  ACTIONS_LOSER: "actions-loser",
  ACTIONS: "actions"
});

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


export function canClosePreAction({
  phase,
  pendingCount = 0,
  initiativeMode = "side",
  goesFirst = null
} = {}) {
  if (phase !== RAW_PHASES.PREACTION) {
    return { ok: false, message: "Pre-Action can only be closed while the combat tracker is in the Pre-Action phase." };
  }
  if (Number(pendingCount || 0) > 0) {
    const n = Number(pendingCount || 0);
    return { ok: false, message: `${n} required Pre-Action FEAT${n === 1 ? "" : "s"} still ${n === 1 ? "remains" : "remain"}.` };
  }
  if (initiativeMode === "side" && !["pc", "npc"].includes(goesFirst)) {
    return { ok: false, message: "No initiative-winning side is recorded. Roll initiative before ending Pre-Action." };
  }
  return { ok: true };
}

export function getActiveSide({ phase, goesFirst }) {
  if (!goesFirst) return null;
  if (phase === RAW_PHASES.ACTIONS_WINNER) return goesFirst;
  if (phase === RAW_PHASES.ACTIONS_LOSER) return goesFirst === "pc" ? "npc" : "pc";
  return null;
}

export function authorizeRawAction({
  phase,
  initiativeMode = "side",
  side,
  goesFirst,
  declaration,
  preActionResolved,
  actionState,
  round,
  actionType,
  rawPreAction = false,
  actorName = "Character"
} = {}) {
  if (!RAW_VOLUNTARY_TYPES.has(actionType)) return { ok: true, consumesCombatAction: false };

  const decl = declaration || {};
  if (!decl.type) return { ok: false, message: `${actorName} has no declared action. Record an intended action before proceeding.` };

  if (phase === RAW_PHASES.DECLARE) {
    return { ok: false, message: "RAW Declaration phase: record intended actions first. Movement and combat actions begin after Initiative and Pre-Action." };
  }

  if (phase === RAW_PHASES.PREACTION) {
    const declaredDefense = decl.type === "defend" ? "block" : decl.type;
    const expectedDefense = RAW_DEFENSE_ACTIONS[actionType];
    if (expectedDefense) {
      if (declaredDefense !== expectedDefense) {
        return { ok: false, message: `${actorName} declared ${decl.label || decl.type}, not ${expectedDefense}. Use Change Action first.` };
      }
      if (!rawPreAction) {
        return { ok: false, message: `Use ${actorName}'s Pre-Action Roll button in the combat tracker so the result can be locked.` };
      }
      return { ok: true, consumesCombatAction: false };
    }
    return {
      ok: false,
      message: "Pre-Action is still open. Resolve required FEATs, Change Actions, and Judge events, then the GM must click Begin Actions."
    };
  }

  if (![RAW_PHASES.ACTIONS_WINNER, RAW_PHASES.ACTIONS_LOSER, RAW_PHASES.ACTIONS].includes(phase)) {
    return { ok: false, message: "Combat actions are not available in the current RAW phase." };
  }

  if (initiativeMode === "side" && phase !== RAW_PHASES.ACTIONS) {
    const activeSide = getActiveSide({ phase, goesFirst });
    if (activeSide && side !== activeSide) return { ok: false, message: `${actorName}'s side is not acting yet.` };
  }

  if (!isPreActionResolved({ declaration: decl, preActionResolved, round })) {
    return { ok: false, message: `${actorName}'s required Pre-Action FEAT has not been resolved.` };
  }

  if (RAW_DEFENSE_ACTIONS[actionType]) {
    return { ok: false, message: "Defensive Pre-Action FEATs are already locked for this round." };
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
  initiativeMode = "side",
  side,
  goesFirst,
  declaration,
  actorName = "Character"
} = {}) {
  const decl = declaration || {};
  if (!decl.type) return { ok: false, message: `${actorName} has no declared action. Record an intended action before proceeding.` };

  if (phase === RAW_PHASES.DECLARE) {
    return { ok: false, message: "Movement is resolved during the action phase, after Initiative and Pre-Action." };
  }
  if (phase === RAW_PHASES.PREACTION) {
    return { ok: false, message: "Movement waits until Pre-Action is closed by the GM." };
  }
  if (![RAW_PHASES.ACTIONS_WINNER, RAW_PHASES.ACTIONS_LOSER, RAW_PHASES.ACTIONS].includes(phase)) {
    return { ok: false, message: "Movement is not available in the current RAW phase." };
  }
  if (initiativeMode === "side" && phase !== RAW_PHASES.ACTIONS) {
    const activeSide = getActiveSide({ phase, goesFirst });
    if (activeSide && side !== activeSide) return { ok: false, message: `${actorName}'s side is not acting yet.` };
  }
  if (["block", "defend"].includes(decl.type)) {
    return { ok: false, message: `${actorName} declared Block and may take no other action this round.` };
  }
  return { ok: true };
}
