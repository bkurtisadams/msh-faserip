import { BluntAttackAction }   from "./blunt-attack-action.js";
import { EdgedAttackAction }   from "./edged-attack-action.js";
import { RangedAttackAction }  from "./ranged-attack-action.js";
import { DefenseAction }       from "./defense-action.js";
import { ManeuverAction }      from "./maneuver-action.js";
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
import { debugLog } from "./action-utils.js";

// Anchor: mode resolver (safe even if settings not registered yet)
function resolveCombatMode(actor) {
  try {
    // Prefer actor override if you already expose it via game.msh.getCombatModeFor
    const v =
      (game.msh?.getCombatModeFor?.(actor)) ??
      (game.settings?.get?.("msh-faserip", "combatMode")) ??
      "semi";
    return String(v || "semi");
  } catch (_e) {
    return "semi";
  }
}

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
  "death-save":     DeathSaveAction
};

// scripts/modules/actions/action-dispatcher.js
export class ActionDispatcher {
  static async roll(actionType, { actor, abilityName, opts = {} } = {}) {
    debugLog("ActionDispatcher.roll()", { actionType, abilityName, opts });

    // --- Central guard: if actor is Nullified, they cannot use inborn super-human powers (RAW)
    // We block only power-channel actions here (energy/force). Martial/ranged/etc. still allowed.
    if (actor) {
      const SCOPE = game.system?.id || 'msh-faserip';
      const isNullified = actor.effects?.some(e => e.getFlag?.(SCOPE, 'status.nullified') === true);
      if (isNullified && (actionType === 'energy' || actionType === 'force')) {
        ui.notifications?.warn?.(`${actor.name}'s inborn powers are nullified and cannot be used right now.`);
        return;
      }

      // Light hint for aura maintenance: handlers can read this if they want stricter behavior.
      const auraNullifyActive = actor.effects?.some(e => e.getFlag?.(SCOPE, 'aura.nullify.active') === true);
      if (auraNullifyActive) {
        // Pass through a hint so action handlers can decide whether to allow/deny:
        opts = { ...(opts ?? {}), nullifyAuraActive: true };
      }
    }
    
    const Handler = registry[actionType];

    if (!Handler) throw new Error(`Unknown actionType: ${actionType}`);
    const handler = new Handler({ actor, actionType, abilityName, opts });
    
    // Anchor: mode gate — merge flags into handler.opts so actions can read this.opts.showConfirm/autoApply
    const mode = resolveCombatMode(actor);
    debugLog("ActionDispatcher mode", { actor: actor?.name, mode });

    let modeFlags = {};
    if (mode === "auto" || mode === "classic") {
      modeFlags = { mode: "auto", autoApply: true, showConfirm: false };
    } else if (mode === "semi") {
      modeFlags = { mode: "semi", autoApply: false, showConfirm: true };
    } else {
      modeFlags = { mode: "manual", autoApply: false, showConfirm: false };
    }

    // Merge into the handler’s own options so action code can read this.opts
    handler.opts = { ...(handler.opts ?? {}), ...modeFlags };
    debugLog("ActionDispatcher merged mode flags", handler.opts);

    // Call without passing flags; actions consume this.opts.*
    return await handler.execute();

  }
}

