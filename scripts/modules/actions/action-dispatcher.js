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


function rawDeclarationGate(actor, type, opts = {}) {
  let enabled = false;
  let initiativeMode = "side";
  try {
    enabled = !!game.settings.get("msh-faserip", "useRawTurnPhases");
    initiativeMode = game.settings.get("msh-faserip", "initiativeMode") || "side";
  } catch { enabled = false; }
  const combat = game.combat;
  // Standard Foundry initiative intentionally does not use the FASERIP
  // declaration-phase controller even if an old world left the RAW toggle on.
  if (!enabled || initiativeMode === "foundry" || !combat?.started || !actor) return { ok: true };
  const voluntary = new Set([
    "blunt-attack", "edged-attack", "shooting", "throwing-edged", "throwing-blunt",
    "energy", "force", "mental-power", "grenade", "grappling", "grabbing", "charging",
    "dodging", "evading", "blocking"
  ]);
  if (!voluntary.has(type)) return { ok: true };

  const combatant = combat.combatants.find(c => c.actor?.id === actor.id || c.actor?.uuid === actor.uuid);
  if (!combatant) return { ok: true };
  const phase = combat.getFlag("msh-faserip", "turnPhase") || "declare";
  const decl = combatant.getFlag("msh-faserip", "declaredAction");
  if (!decl?.type) return { ok: false, message: `${actor.name} has not declared an action this round.` };

  const defenseMap = { dodging: "dodge", blocking: "block", evading: "evade" };
  const attackTypes = new Set(["blunt-attack", "edged-attack", "shooting", "throwing-edged", "throwing-blunt", "energy", "force", "mental-power", "grenade", "grappling", "grabbing", "charging"]);
  if (phase === "declare") {
    return { ok: false, message: "RAW Declaration phase: record the intended action first; actions are resolved after initiative." };
  }
  if (phase === "preaction" && attackTypes.has(type)) {
    return { ok: false, message: "Attacks are resolved after the Pre-Action phase." };
  }
  if (phase === "preaction" && defenseMap[type]) {
    const declaredDefense = decl.type === "defend" ? "block" : decl.type;
    if (declaredDefense !== defenseMap[type]) {
      return { ok: false, message: `${actor.name} declared ${decl.label || decl.type}, not ${defenseMap[type]}. Use Change Action first.` };
    }
    // Required defensive FEATs are owned by the tracker workflow so a sheet
    // button cannot produce an untracked result and then be rerolled from the
    // tracker. The tracker marks its dispatch explicitly.
    if (!opts?.rawPreAction) {
      return { ok: false, message: `Use ${actor.name}'s Pre-Action Roll button in the combat tracker so the result can be locked.` };
    }
  }

  if (phase === "actions-winner" || phase === "actions-loser" || phase === "actions") {
    // Side-Based RAW: only the side whose action phase is active may resolve
    // voluntary combat actions. Individual initiative uses the generic
    // "actions" phase and therefore follows Foundry's initiative cursor.
    if (initiativeMode === "side" && (phase === "actions-winner" || phase === "actions-loser")) {
      const goesFirst = combat.getFlag("msh-faserip", "goesFirst");
      const sideFlag = combatant.getFlag("msh-faserip", "side");
      const disposition = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
      const side = sideFlag || (combatant.actor?.type === "hero" ? "pc"
        : combatant.actor?.type === "villain" ? "npc"
        : disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? "pc"
        : disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ? "npc"
        : combatant.actor?.hasPlayerOwner ? "pc" : "npc");
      const activeSide = phase === "actions-winner" ? goesFirst : (goesFirst === "pc" ? "npc" : "pc");
      if (goesFirst && side !== activeSide) {
        return { ok: false, message: `${actor.name}'s side is not acting yet.` };
      }
    }

    if (["dodge", "block", "evade", "multi", "defend"].includes(decl.type)) {
      const pre = combatant.getFlag("msh-faserip", "preActionResolved");
      const expected = decl.type === "dodge" ? "dodging" : (["block", "defend"].includes(decl.type) ? "blocking" : decl.type === "evade" ? "evading" : "multiattack");
      if (!(pre?.round === combat.round && pre.action === expected)) {
        return { ok: false, message: `${actor.name}'s required Pre-Action FEAT has not been resolved.` };
      }
    }
    if (defenseMap[type]) return { ok: false, message: "Defensive Pre-Action FEATs are already locked for this round." };
    // Evade explicitly permits no attacks that round; Block permits no other
    // action. Dodge is different: it may be followed by one other action, with
    // its Active Effect supplying the RAW -2CS penalty.
    if (["block", "defend", "evade"].includes(decl.type) && attackTypes.has(type)) {
      return { ok: false, message: `${actor.name} declared ${decl.label || decl.type} and cannot make an attack this round.` };
    }
    if (decl.type === "move" && attackTypes.has(type)) return { ok: false, message: `${actor.name} declared Move Only. Use Change Action before attacking.` };
    if (decl.type === "charge" && attackTypes.has(type) && type !== "charging") return { ok: false, message: `${actor.name} declared a Charge. Use the Charging action or Change Action.` };
    if (type === "charging" && decl.type !== "charge") return { ok: false, message: `${actor.name} did not declare a Charge.` };
    if (decl.type === "multi" && attackTypes.has(type) && !["blunt-attack", "edged-attack", "shooting"].includes(type)) {
      return { ok: false, message: "RAW Multiple Attacks apply to Slugfest and Shooting attacks only." };
    }
  }
  return { ok: true };
}
export class ActionDispatcher {
  static async roll(actionType, { actor, abilityName, opts = {} } = {}) {
    debugLog("ActionDispatcher.roll()", { actionType, actor, abilityName, opts });

    const type = normalizeActionType(actionType);

    const declarationGate = rawDeclarationGate(actor, type, opts);
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

    return await handler.execute();
  }
}