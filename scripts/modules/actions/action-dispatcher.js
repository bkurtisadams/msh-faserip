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
  "grappling":      ManeuverAction,
  "grabbing":       ManeuverAction,
  "escaping":       ManeuverAction,
  "charging":       ChargingAction,
  "stun":           CheckAction,
  "slam":           CheckAction,
  "kill":           CheckAction
};

// scripts/modules/actions/action-dispatcher.js
export class ActionDispatcher {
  static async roll(actionType, { actor, abilityName, opts = {} } = {}) {
    console.debug("ActionDispatcher.roll()", { actionType, abilityName, opts });
    const Handler = registry[actionType];
    if (!Handler) throw new Error(`Unknown actionType: ${actionType}`);
    const handler = new Handler({ actor, actionType, abilityName, opts });
    return await handler.execute();
  }
}

