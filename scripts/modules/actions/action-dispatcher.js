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
  "death-save": "death-save"

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
    debugLog("ActionDispatcher.roll()", { actionType, actor, abilityName, opts });

    const type = normalizeActionType(actionType);

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

    // Always carry the chosen mode through
    let modeFlags = { mode };
    if (mode === "auto" || mode === "classic" || mode === "full") {
      modeFlags = { mode, autoApply: true, showConfirm: false };
    } else if (mode === "semi") {
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

    return await handler.execute();
  }
}
