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
    console.debug("ActionDispatcher.roll()", { actionType, abilityName, opts });

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
      const SCOPE2 = game.system?.id || 'msh-faserip';
      const auraNullifyActive = actor.effects?.some(e => e.getFlag?.(SCOPE2, 'aura.nullify.active') === true);
      if (auraNullifyActive) {
        // Pass through a hint so action handlers can decide whether to allow/deny:
        opts = { ...(opts ?? {}), nullifyAuraActive: true };
      }
    }
    
    const Handler = registry[actionType];

    if (!Handler) throw new Error(`Unknown actionType: ${actionType}`);
    const handler = new Handler({ actor, actionType, abilityName, opts });
    return await handler.execute();
  }
}

