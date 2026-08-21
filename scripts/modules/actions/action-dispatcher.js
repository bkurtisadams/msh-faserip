// scripts/modules/actions/action-dispatcher.js
import { BluntAttackAction }   from "./blunt-attack-action.js";
import { EdgedAttackAction }   from "./edged-attack-action.js";
import { DefenseAction }       from "./defense-action.js";
import { CheckAction }         from "./check-action.js";
import { ShootingAction } from "./shooting-action.js";
import { ThrowingEdgedAction } from "./throwing-edged-action.js";
import { ThrowingBluntAction } from "./throwing-blunt-action.js";
import { EnergyAction } from "./energy-action.js";
import { ForceAction } from "./force-action.js";
import { ChargingAction } from "./charging-action.js";
import { GrapplingAction } from "./grappling-action.js";
import { GrabbingAction } from "./grabbing-action.js";
import { EscapingAction } from "./escaping-action.js";
import { DeathSaveAction } from "./death-save-action.js";
import { ManualModeDialog } from "./manual-mode-dialog.js";
import { debugLog } from "./action-utils.js";
import { MentalPowerAction } from "./mental-power-action.js";
import { GrenadeAction } from "./grenade-action.js";
import { IntensityAction } from "./intensity-action.js";
import { authorizeRawAction, RAW_VOLUNTARY_TYPES } from "../../rules/raw-combat-state.js";

// Anchor: mode resolver (safe even if settings not registered yet)
export function resolveCombatMode(actor) {
  try {
    // REMOVED: actor-level combat mode (no longer in UI)
    // Priority: global setting > fallback
    
    // Check global setting
    const globalMode = game.settings?.get?.("msh-faserip", "defaultCombatMode");
    console.log("FASERIP DEBUG | resolveCombatMode - globalMode:", globalMode);
    if (globalMode) return String(globalMode);
    
    // Fallback
    console.log("FASERIP DEBUG | resolveCombatMode - using fallback: semi");
    return "semi";
  } catch (_e) {
    console.log("FASERIP DEBUG | resolveCombatMode - error, using fallback: semi");
    return "semi";
  }
}

// Canonical codes (from your actionCodeMap)
const CANONICAL_CODES = {
  "blunt-attack":   "BA",
  "edged-attack":   "EA",
  "shooting":       "Sh",
  "throwing-edged": "TE",
  "throwing-blunt": "TB",
  "energy":         "En",
  "force":          "Fo",
  "grappling":      "Gp",
  "grabbing":       "Gb",
  "escaping":       "Es",
  "charging":       "Ch",
  "dodging":        "Do",
  "evading":        "Ev",
  "blocking":       "Bl",
  "catching":       "Ca",
  "stun":           "St",
  "slam":           "Sl",
  "kill":           "Ki",
  "death": "death-save",
  "deathsave": "death-save",
  "death-save": "death-save",
  "grenade": "grenade",
  "intensity": "Int"

};

// Build a robust alias map that matches either code or long name, any case
const ACTION_ALIASES = (() => {
  const map = {};
  for (const [type, code] of Object.entries(CANONICAL_CODES)) {
    // long name variants
    map[type] = type;
    map[type.toLowerCase()] = type;
    map[type.toUpperCase()] = type;

    // code variants (exact, lower, upper)
    map[code] = type;                 // e.g., "Sh"
    map[code.toLowerCase()] = type;   // e.g., "sh"
    map[code.toUpperCase()] = type;   // e.g., "SH"
  }
  return map;
})();

function normalizeActionType(input) {
  const key = String(input ?? "").trim();
  return ACTION_ALIASES[key] ?? ACTION_ALIASES[key.toLowerCase()] ?? ACTION_ALIASES[key.toUpperCase()] ?? key;
}

// Map action types to their required abilities
const ACTION_ABILITIES = {
  "blunt-attack": "fighting",
  "edged-attack": "fighting",
  "shooting": "agility",
  "throwing-edged": "agility",
  "throwing-blunt": "agility",
  "energy": "agility", // Will be specified in opts
  "force": "agility",  // Will be specified in opts
  "dodging": "agility",
  "evading": "fighting",
  "blocking": "strength",
  "catching": "agility",
  "grappling": "strength",
  "grabbing": "strength",
  "escaping": "strength",
  "charging": "endurance",
  "stun": "endurance",
  "slam": "endurance",
  "kill": "endurance",
  "save-nullify": "endurance",
  "power-save": "endurance",
  "death-save": "endurance",
  "grenade": "agility",
  "intensity": "endurance"
};

const registry = {
  "blunt-attack":   BluntAttackAction,
  "edged-attack":   EdgedAttackAction,
  "shooting":       ShootingAction,
  "throwing-edged": ThrowingEdgedAction,
  "throwing-blunt": ThrowingBluntAction,
  "energy":         EnergyAction,
  "force":          ForceAction,
  "dodging":        DefenseAction,
  "evading":        DefenseAction,
  "blocking":       DefenseAction,
  "catching":       DefenseAction,
  "grappling":      GrapplingAction,
  "grabbing":       GrabbingAction,
  "escaping":       EscapingAction,
  "charging":       ChargingAction,
  "stun":           CheckAction,
  "slam":           CheckAction,
  "kill":           CheckAction,
  "save-nullify":   CheckAction,
  "power-save":     CheckAction,
  "death-save":     DeathSaveAction,
  "mental-power":   MentalPowerAction,
  "grenade":        GrenadeAction,
  "intensity":      IntensityAction
};


async function rawDeclarationGate(actor, type, opts = {}) {
  let enabled = false;
  let initiativeMode = "side";
  try {
    enabled = !!game.settings.get("msh-faserip", "useRawTurnPhases");
    initiativeMode = game.settings.get("msh-faserip", "initiativeMode") || "side";
  } catch { enabled = false; }
  const combat = game.combat;
  if (!enabled || initiativeMode === "foundry" || !combat?.started || !actor) return { ok: true, consumesCombatAction: false };
  if (!RAW_VOLUNTARY_TYPES.has(type)) return { ok: true, consumesCombatAction: false };

  // Scope strictly to the actual turn roster shown by Foundry. A stale Combatant
  // document that is not in combat.turns must not gate or consume an action.
  const combatant = Array.from(combat.turns ?? []).find(c => c.actor?.id === actor.id || c.actor?.uuid === actor.uuid);
  if (!combatant) return { ok: true, consumesCombatAction: false };

  const sideFlag = combatant.getFlag("msh-faserip", "side");
  const disposition = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
  const side = sideFlag || (combatant.actor?.type === "hero" ? "pc"
    : combatant.actor?.type === "villain" ? "npc"
    : disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? "pc"
    : disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ? "npc"
    : combatant.actor?.hasPlayerOwner ? "pc" : "npc");

  const verdict = authorizeRawAction({
    phase: combat.getFlag("msh-faserip", "turnPhase") || "declare",
    initiativeMode,
    side,
    goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
    declaration: combatant.getFlag("msh-faserip", "declaredAction"),
    preActionResolved: combatant.getFlag("msh-faserip", "preActionResolved"),
    actionState: combatant.getFlag("msh-faserip", "actionState"),
    round: combat.round,
    actionType: type,
    rawPreAction: !!opts?.rawPreAction,
    actorName: actor.name
  });
  return { ...verdict, combat, combatant };
}

async function markRawCombatActionUsed(gate, actor, type) {
  if (!gate?.consumesCombatAction || !gate?.combatant || !gate?.combat) return;
  const value = { round: gate.combat.round, combatActionUsed: true, actionType: type, usedAt: Date.now() };
  if (game.user.isGM) {
    await gate.combatant.setFlag("msh-faserip", "actionState", value);
  } else if (game.msh?.runAsGM) {
    await game.msh.runAsGM({ operation: "setCombatantFlags", combatId: gate.combat.id, combatantId: gate.combatant.id, flags: { actionState: value } });
  }
  ui.combat?.render?.(true);
}

export class ActionDispatcher {
  static async roll(actionType, { actor, abilityName, opts = {} } = {}) {
    debugLog("ActionDispatcher.roll()", { actionType, actor, abilityName, opts });

    const type = normalizeActionType(actionType);

    const declarationGate = await rawDeclarationGate(actor, type, opts);
    if (!declarationGate.ok) {
      ui.notifications?.warn?.(declarationGate.message);
      return;
    }

    if (actor) {
      const SCOPE = game.system?.id || "msh-faserip";
      const isNullified =
        actor.effects?.some(e => e.getFlag?.(SCOPE, "status.nullified") === true) ?? false;

      if (isNullified && (type === "energy" || type === "force")) {
        ui.notifications?.warn?.(
          `${actor.name}'s inborn powers are nullified and cannot be used right now.`
        );
        return;
      }

      const auraNullifyActive =
        actor.effects?.some(e => e.getFlag?.(SCOPE, "aura.nullify.active") === true) ?? false;
      if (auraNullifyActive) {
        opts = { ...(opts ?? {}), nullifyAuraActive: true };
      }
    }

    const mode = opts?.mode ?? resolveCombatMode(actor);
    debugLog("ActionDispatcher mode", { actor: actor?.name, mode });

    const resolvedAbility =
      abilityName || opts?.abilityName || ACTION_ABILITIES[type] || "fighting";

    const Handler = registry[type];
    if (!Handler) throw new Error(`Unknown actionType: ${type}`);

    // Normalize legacy mode values and set flags
    const normalizedMode = (mode === "auto" || mode === "classic") ? "full" : (mode || "semi");
    let modeFlags;
    if (normalizedMode === "full") {
      modeFlags = { mode: "full", autoApply: true, showConfirm: false };
    } else if (normalizedMode === "semi") {
      modeFlags = { mode: "semi", autoApply: false, showConfirm: true };
    } else {
      modeFlags = { mode: "manual", autoApply: false, showConfirm: false };
    }

    const handler = new Handler({
      actor,
      actionType: type,
      abilityName: resolvedAbility,
      opts
    });

    handler.opts = { ...(handler.opts ?? {}), ...modeFlags };
    debugLog("ActionDispatcher merged mode flags", handler.opts);

    const result = await handler.execute();
    // A cancelled action dialog does not spend the declared combat action. Once
    // the player commits to the action, it is consumed even if the attack later
    // misses or otherwise fails.
    if (!result?.rawActionCancelled) await markRawCombatActionUsed(declarationGate, actor, type);
    return result;
  }
}
