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

// Anchor: mode resolver (safe even if settings not registered yet)
function resolveCombatMode(actor) {
  try {
    // Priority: actor setting > global setting > fallback
    const actorMode = actor?.system?.combatMode;
    if (actorMode) return String(actorMode);
    
    // Check global setting
    const globalMode = game.settings?.get?.("msh-faserip", "defaultCombatMode");
    if (globalMode) return String(globalMode);
    
    // Fallback
    return "semi";
  } catch (_e) {
    return "semi";
  }
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
  "death-save": "endurance"
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
  "death-save":     DeathSaveAction
};

export class ActionDispatcher {
  static async roll(actionType, { actor, abilityName, opts = {} } = {}) {
    debugLog("ActionDispatcher.roll()", { actionType, abilityName, opts });

    // --- Central guard: if actor is Nullified, they cannot use inborn super-human powers (RAW)
    if (actor) {
      const SCOPE = game.system?.id || 'msh-faserip';
      const isNullified = actor.effects?.some(e => e.getFlag?.(SCOPE, 'status.nullified') === true);
      if (isNullified && (actionType === 'energy' || actionType === 'force')) {
        ui.notifications?.warn?.(`${actor.name}'s inborn powers are nullified and cannot be used right now.`);
        return;
      }

      const auraNullifyActive = actor.effects?.some(e => e.getFlag?.(SCOPE, 'aura.nullify.active') === true);
      if (auraNullifyActive) {
        opts = { ...(opts ?? {}), nullifyAuraActive: true };
      }
    }
    
    // Check combat mode
    const mode = resolveCombatMode(actor);
    debugLog("ActionDispatcher mode", { actor: actor?.name, mode });

    // MANUAL MODE INTERCEPT
    if (mode === "manual") {
      debugLog("Manual mode detected - showing simple dialog");
      
      // Determine which ability to use
      const ability = abilityName || opts.abilityName || ACTION_ABILITIES[actionType] || "fighting";
      
      // Show manual mode dialog and return
      return await ManualModeDialog.show(actor, ability, actionType, opts);
    }

    // Otherwise, proceed with full action handler
    const Handler = registry[actionType];
    if (!Handler) throw new Error(`Unknown actionType: ${actionType}`);
    
    const handler = new Handler({ actor, actionType, abilityName, opts });
    
    // Set mode flags for semi/full auto
    let modeFlags = {};
    if (mode === "auto" || mode === "classic" || mode === "full") {
      modeFlags = { mode: "auto", autoApply: true, showConfirm: false };
    } else if (mode === "semi") {
      modeFlags = { mode: "semi", autoApply: false, showConfirm: true };
    }

    handler.opts = { ...(handler.opts ?? {}), ...modeFlags };
    debugLog("ActionDispatcher merged mode flags", handler.opts);

    return await handler.execute();
  }
}