// init.js v1.10.0 - 2026-03-04
// v1.10.0: updateActiveEffect reconcile now filtered to faserip.token.* changes + disabled toggles only,
//          preventing unnecessary token updates on every stat/karma AE change.
// v1.9.9: Fix double death save caused by v1.9.8's await setFlag("wasKnockedOut") before
//         _combatDamageInProgress guard. The await yielded event loop, letting combat system
//         fire its own death save. Fix: move setFlag after guard, use fire-and-forget (no await).
// v1.9.4: Dying now processes via worldTime (works with CTT advances and combat tracker).
//         Removed ~30-line dying block from updateCombat hook — processOngoingEffects handles it.
// v1.9.3: Dying delegated to ongoing-engine.js processDyingRound(). ~200-line dying
//         block replaced with compact import call. game.msh.nextHigherRankName added.
// v1.9.2: CTT↔FASERIP time sync — ctt.timeAuthority setting, getCampaignDateTime reads CTT API,
//         updateWorldTime fires timeUpdated, bridge hooks for timeTracker.timeSet/timeAdvanced
// v1.9.1: Auto-sync power sheet → ongoing effects. Setting regenerationType on a power's
//         Functions tab auto-registers/removes ongoing AE on the actor. createItem,
//         updateItem, deleteItem hooks replace old name-based matching.
// v1.7.8: Replace single Fly movement action with three sub-modes (Full/Low Alt/Cruise) in Token HUD
// v1.7.7: Add FaseripTokenRuler - speed-based color coding for V13 drag ruler
// v1.7.6: Fix getCampaignDateTime - worldTime is already seconds, remove /1000
// v1.7.5: Add defeatedVillains setting for team tracker
// v1.7.4: Fix prototypeTokenOverrides check to detect keys with undefined values
// v1.7.3: Fix preCreateActor to use updateSource() for persistent token disposition
// v1.7.2: Add separate FaseripTalentSheet and FaseripContactSheet with smaller dialog size
// v1.7.1: Add expiresAtRound flag support for effect expiration (used by Evasion Bonus)
// v1.7.0: Restore health to Endurance value when waking from 0 HP knockout (not dying)
// v1.6.0: Reduce current health when Endurance drops from dying (not just max health)
// v1.5.9: Fix originalEndurance tracking - store in both actor and effect flags when first processing
// v1.5.8: Add stunDurationDie setting (replaces maxStunDuration)
// v1.5.7: Reduce console logging verbosity
// v1.5.6: Improve effect expiration - advance worldTime per turn, comprehensive debug logging
// v1.5.5: Improved effect auto-expiration with seconds-based support and debug logging
// v1.5.4: Fix icon property access to use Object.hasOwn (avoids triggering deprecated getter)
// v1.5.3: Fix v12 deprecations (ActiveEffect#icon -> img, Token#toggleEffect -> Actor#toggleStatusEffect)
// v1.5.2: Refactored console messages to use severity prefixes (no emojis)
// v1.5.1: Fix dying check to only trigger on round change (not turn change)
// v1.5.0: Consolidated updateCombat hooks, added dedup guard for dying checks
import * as GMUtils from './gm-utils.js';
import { registerGMTools } from './gm-tools.js';
import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';
import { FaseripTalentSheet } from './talentSheet.js';
import { FaseripContactSheet } from './contactSheet.js';
import { FaseripHeadquartersSheet } from './headquartersSheet.js';
import { FaseripEquipmentSheet } from './equipment.js';
import { FaseripRolls } from './rolls.js';
//import { rollUniversalTable } from './universalTable.js';  // deprecated
import { rollUniversalTable } from './modules/dice/universal-table.js';
import { openUniversalTableDialog } from './rolls.js';
import { rollUniversalAction } from './rolls.js';
import { FaseripInitiative } from './faserip-initiative.js';
import { CombatHandler } from './combat-handler.js';
import { initializeSlamHandlers } from './charge-damage.js';
import { installActionChatHandlers } from "./modules/actions/chat-hooks.js";
import { openCollisionDamageDialog } from './modules/actions/collision-damage.js';
import { FaseripActionPanel } from './action-hud.js';
import { debugLog } from './modules/actions/action-utils.js';
import { ActionDispatcher } from './modules/actions/action-dispatcher.js';
import { ManualModeDialog } from './modules/actions/manual-mode-dialog.js';
import * as Effects from "./modules/effects/effect-engine.js";
import { MSHVehicleActorSheet } from "./vehicle-actor-sheet.js";
import { resolveCombatMode } from "./modules/actions/action-dispatcher.js";
import { initRestSystem } from "./modules/rest-system.js";
import { ACTIONS } from '../helpers/action-constants.js';
import { playCombatSFX, classifyWeapon } from "./modules/actions/audio-utils.js";
import { quickHeal } from "../macros/quick-heal.js";
import { FaseripTokenRuler } from "./modules/canvas/faserip-token-ruler.js";
import { initDotToken } from "./modules/canvas/faserip-dot-token.js";

// Helper to resolve ACTIONS from CONFIG (for macro compatibility)
function getActions() {
  return CONFIG?.MSHF?.ACTIONS || globalThis?.ACTIONS || {};
}

// FASERIP Combat Sync - Use combatRound hook (fires once per round)
Hooks.on("combatRound", async (combat, updateData, updateOptions, userId) => {
  // 🔒 GM-only – only the GM advances world time
  if (!game.user.isGM) return;
  
  const syncEnabled = game.settings.get("msh-faserip", "combatSyncEnabled");
  if (syncEnabled) {
    // Advance Foundry world time by 6 seconds (1 FASERIP turn)
    await game.time.advance(6);
    console.log("[FASERIP] Combat advanced time by 6 seconds");
  }
  
  // Trigger hook to update team sheet display
  Hooks.callAll("msh-faserip.timeUpdated");

  // ── Process dying for all actors in this combat (1 rank loss per round) ──
  // This is the ONLY place processDyingRound is called during combat.
  // combatRound fires once per Foundry round = 1 FASERIP turn.
  // Set global lock so CTT timeAdvanced (triggered by game.time.advance above) skips dying.
  game.msh._dyingInProgress = true;
  try {
    const { processDyingRound } = await import("./modules/effects/ongoing-engine.js");
    const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    for (const c of combat.combatants) {
      const actor = c?.actor;
      if (!actor) continue;
      const dyingAE = actor.effects.find(e =>
        (e.flags?.[scope]?.ongoingId === "dying" || e.flags?.[scope]?.isDying) &&
        !e.disabled
      );
      if (dyingAE) {
        console.log(`[FASERIP:DYING] combatRound: processing dying for ${actor.name}`);
        await processDyingRound(actor);
      }
    }
  } catch (e) {
    console.error("[FASERIP ERROR] Dying round processing failed:", e);
  } finally {
    game.msh._dyingInProgress = false;
  }
});

// Handle effect expiration when world time advances (for CTT or out-of-combat time passage)
Hooks.on("updateWorldTime", async (worldTime, dt, options, userId) => {
  // Refresh team sheet time display for ALL clients
  Hooks.callAll("msh-faserip.timeUpdated");

  // GM-only for effect processing
  if (!game.user.isGM) return;
  
  console.debug("[FASERIP DEBUG] updateWorldTime hook fired, worldTime:", worldTime, "delta:", dt);

  // Effect expiration: skip during active combat (updateCombat hook handles that)
  if (!game.combat?.active) {
    for (const actor of Effects.getAllTokenActors()) {
      if (!actor?.effects?.size) continue;
      
      const toDelete = [];
      
      for (const ef of actor.effects) {
        if (ef.disabled) continue;
        const d = ef.duration ?? {};
        
        // Handle seconds-based effects
        if (Number.isFinite(d.seconds) && d.seconds > 0 && Number.isFinite(d.startTime)) {
          const endTime = d.startTime + d.seconds;
          const remaining = endTime - worldTime;
          
          if (remaining <= 0) {
            toDelete.push({ effect: ef, reason: `time expired (${d.seconds}s duration)` });
          }
        }
      }
      
      // Delete expired effects
      for (const { effect, reason } of toDelete) {
        console.log(`[FASERIP] Auto-expiring effect "${effect.name}" on ${actor.name}: ${reason}`);
        try {
          await effect.delete();
        } catch (e) {
          console.warn("[FASERIP WARN] Effect auto-expire failed", e);
        }
      }
    }
  }

  // Ongoing periodic effects: ALWAYS process when time advances (not gated by combat state)
  try {
    const { processOngoingEffects } = await import("./modules/effects/ongoing-engine.js");
    await processOngoingEffects(worldTime, dt);
  } catch (e) {
    console.error("[FASERIP ERROR] processOngoingEffects failed:", e);
  }

  // Dying out-of-combat: process 1 rank loss per turn elapsed.
  // combatRound hook owns this during active combat.
  // timeTracker.timeAdvanced hook owns this when CTT is active (avoids race condition,
  // since CTT calls game.time.advance() internally which also fires this hook).
  const cttActiveForDying = game.modules.get("calendar-time-tracker")?.active;
  if (!game.combat?.active && !cttActiveForDying && !game.msh._dyingInProgress) {
    if (dt >= 6) {
      try {
        const { processDyingRound } = await import("./modules/effects/ongoing-engine.js");
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        for (const actor of Effects.getAllTokenActors()) {
          if (!actor?.effects?.size) continue;
          const dyingAE = actor.effects.find(e =>
            (e.flags?.[scope]?.ongoingId === "dying" || e.flags?.[scope]?.isDying) &&
            !e.disabled
          );
          if (!dyingAE) continue;
          console.log(`[FASERIP:DYING] worldTime advance: processing 1 dying round for ${actor.name} (dt=${dt}s)`);
          const result = await processDyingRound(actor);
          console.log(`[FASERIP:DYING] worldTime: ${actor.name} → ${result}`);
        }
      } catch (e) {
        console.error("[FASERIP ERROR] worldTime dying round processing failed:", e);
      }
    }
  }});

Hooks.once("init", async () => {
  // --- Global flag scope & namespace ---
  globalThis.MSH_FLAG_SCOPE = game.system?.id || "msh-faserip";

  game.msh = game.msh || {};
  game.msh.playCombatSFX = playCombatSFX;
  game.msh._classifyWeapon = classifyWeapon;

  // Guard so we don't wrap twice if code reloads
  if (!ActiveEffect.prototype._mshFlagShimApplied) {
    const _origGetFlag = ActiveEffect.prototype.getFlag;

    ActiveEffect.prototype.getFlag = function (scope, key) {
      if (scope === "msh") {
        // Helpful breadcrumb to find the caller that still passes "msh"
        console.warn(
          `[Flag scope fix] getFlag('msh','${key}') on effect "${this?.name ?? "(no-name)"}". Redirecting to "${MSH_FLAG_SCOPE}".`
        );
        // Optional: show stack once to locate the offender in your code/bundle
        // Remove/comment this if it gets too chatty:
        console.trace();

        scope = MSH_FLAG_SCOPE;
      }
      return _origGetFlag.call(this, scope, key);
    };

    // mark as applied so we don't double-wrap
    Object.defineProperty(ActiveEffect.prototype, "_mshFlagShimApplied", {
      value: true, configurable: false, enumerable: false, writable: false
    });
  }
  // --------------------------------------------------------------------------
  
  // Register the debugMode setting FIRST
  game.settings.register("msh-faserip", "debugMode", {
    name: "Debug Mode",
    hint: "Enable debug logging for MSH FASERIP system",
    scope: "world",     // or "client" if it should be per-user
    config: true,       // shows in settings menu
    type: Boolean,
    default: false
  });

  game.settings.register("msh-faserip", "sfxBasePath", {
    name: "SFX Base Path",
    hint: "Folder with SFX files (e.g., systems/msh-faserip/assets/sfx).",
    scope: "world",
    config: true,
    type: String,
    default: "systems/msh-faserip/assets/sfx"
  });

  game.settings.register("msh-faserip", "sfxEnabled", {
    name: "Enable SFX",
    hint: "Allow the system to play sound effects for attacks and effects.",
    scope: "client",     // per-user is nicer for volume/mute
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("msh-faserip", "sfxVolume", {
    name: "SFX Volume",
    hint: "Volume for system SFX (0.0–1.0).",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.8
  });

  // Register default combat mode setting
  game.settings.register("msh-faserip", "defaultCombatMode", {
    name: "Default Combat Mode",
    hint: "Default combat mode for new characters. Manual = simple FEAT rolls, Semi-Auto = dialogs with confirmation, Full-Auto = automatic application.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "manual": "Manual (Simple FEAT Rolls)",
      "semi": "Semi-Auto (Dialogs with Confirmation)",
      "full": "Full-Auto (Automatic Application)"
    },
    default: "semi",
    requiresReload: false
  });

  // Register consolidated chat cards setting
  game.settings.register("msh-faserip", "consolidatedChatCards", {
    name: "Consolidated Chat Cards",
    hint: "When enabled, FEAT rolls are embedded in the main action chat card instead of appearing as separate messages. Reduces chat clutter.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  game.settings.register("msh-faserip", "persistedTemplates", {
    name: "Persisted Area Templates",
    hint: "Internal storage for area effect templates (smoke, gas, etc.) that auto-expire over time.",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  debugLog("init hook is running!");
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  // Initialize the game.msh namespace early
  game.msh = game.msh || {};

  game.msh.playCombatSFX = playCombatSFX;

  game.msh.FaseripActorSheet = FaseripActorSheet;

  CONFIG.FASERIP = CONFIG.FASERIP || {};

  // Non-legacy transferral: effects on items apply to actors via allApplicableEffects()
  // without being copied. Toggle/edit the effect on the item directly.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Make ACTIONS available to macros via CONFIG
  CONFIG.MSHF = CONFIG.MSHF || {};
  CONFIG.MSHF.ACTIONS = ACTIONS;

  game.msh.getCampaignDateTime = function() {
    // When CTT is active and set as time authority, read directly from CTT API
    const cttModule = game.modules.get("calendar-time-tracker");
    const useAuthority = game.settings.get("msh-faserip", "ctt.timeAuthority") ?? false;
    if (useAuthority && cttModule?.active && cttModule.api) {
      try {
        const cttDate = cttModule.api.getCurrentDate();
        if (cttDate) {
          // Build a JS Date from CTT fields for backward compat with code
          // that reads .date (e.g. team sheet input fields)
          const jsDate = new Date(
            cttDate.year ?? 1976,
            (cttDate.monthIndex ?? cttDate.month ?? 0),
            cttDate.day ?? 1,
            cttDate.hour ?? 0,
            cttDate.minute ?? 0,
            cttDate.second ?? 0
          );
          return {
            date: jsDate,
            formatted: cttDate.fullDateTime || jsDate.toLocaleString("en-US", {
              year: "numeric", month: "long", day: "numeric",
              hour: "2-digit", minute: "2-digit", second: "2-digit"
            }),
            elapsedSeconds: cttDate.totalSeconds ?? 0,
            source: "ctt"
          };
        }
      } catch (err) {
        console.warn("[FASERIP WARN] CTT timeAuthority read failed, falling back to worldTime:", err);
      }
    }

    // Fallback: compute from worldTime (original behavior)
    const startDate = new Date(game.settings.get("msh-faserip", "campaignStartDate"));
    const startWorldTime = game.settings.get("msh-faserip", "campaignStartWorldTime");
    const currentWorldTime = game.time.worldTime;
    
    // worldTime is in seconds, so no division needed
    const elapsedSeconds = currentWorldTime - startWorldTime;
    const currentDate = new Date(startDate.getTime() + (elapsedSeconds * 1000));
    
    return {
      date: currentDate,
      formatted: currentDate.toLocaleString("en-US", {
        year: "numeric",
        month: "long", 
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
      elapsedSeconds,
      source: "worldTime"
    };
  };

  // Helper: resolve combat mode from the single defaultCombatMode setting
  game.msh.getCombatModeFor = function(actor) {
    try {
      return game.settings.get("msh-faserip", "defaultCombatMode") || "semi";
    } catch (_) {
      return "semi";
    }
  };

  // Four-Color: no death save at 0 Health, unless a 'Kill' action type used.
  game.settings.register('msh-faserip', 'fourColorRule', {
    name: "Four-Color Rule (Non-lethal 0 Health)",
    hint: "If enabled, characters who hit 0 Health do NOT make a death save unless the triggering attack produced a Kill result (or the GM marks the hazard as lethal).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  Actors.registerSheet("msh-faserip", MSHVehicleActorSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "Vehicle Sheet"
  });

  function shouldConvertToSecondsByPolicy() {
    const policy = game.settings?.get?.("msh-faserip", "effects.durationPolicy") || "rounds-in-combat";
    if (policy === "seconds-only") return true;
    if (game.combat && (policy === "rounds-in-combat" || policy === "auto")) return false;
    return true; // out of combat → convert
  }

  // Convert "duration.rounds" -> seconds (based on preset turn length: FASERIP: turn = 6s).
  Hooks.on("preCreateActiveEffect", function (effect, data, options, userId) {
    // KEEP ROUNDS DURING COMBAT — do not convert to seconds while combat is active.
    if (game.combat && data?.duration?.rounds) {
      return;
    }

    // v12+: img is canonical, icon is deprecated - check property existence without triggering getter
    if (data && Object.hasOwn(data, 'icon') && !data.img) data.img = data.icon;

    // Core doesn't have impact.svg; remap to a safe built-in.
    if (data?.img === "icons/svg/impact.svg") {
      data.img = "icons/svg/target.svg";
    }


    try {
      // Ensure payload objects exist
      if (!data) data = {};
      if (!data.duration) data.duration = {};

      // 1) Gather duration from payload and from the effect's source
      var incomingHasSeconds = (data.duration.seconds !== undefined && data.duration.seconds !== null);
      var incomingHasRounds  = (data.duration.rounds  !== undefined && data.duration.rounds  !== null);

      var src = (effect && typeof effect.toObject === "function") ? effect.toObject() : {};
      var srcDuration = (src && src.duration) ? src.duration : {};
      var sourceHasRounds = (srcDuration.rounds !== undefined && srcDuration.rounds !== null);

      // Prefer payload rounds; if missing, fall back to source rounds
      var rounds = null;
      if (incomingHasRounds) {
        rounds = Number(data.duration.rounds);
      } else if (!incomingHasSeconds && sourceHasRounds) {
        rounds = Number(srcDuration.rounds);
      }

      // Nothing to do if:
      //  - no rounds anywhere, or
      //  - seconds already specified
      if (rounds === null || isNaN(rounds) || incomingHasSeconds) return;

      // 2) Determine seconds per turn from CTT preset (fallback to 6)
      var ctt = game.modules.get("calendar-time-tracker");
      var te  = (ctt && ctt.api) ? ctt.api.timeEngine : null;

      var secPerTurn = 6;
      if (te && typeof te.convertToSeconds === "function") {
        try {
          var v = Number(te.convertToSeconds(1, "turn"));
          if (!isNaN(v) && v > 0) secPerTurn = v;
        } catch (e1) { /* ignore */ }
      }

      // 3) Convert and sanitize
      var safeRounds = Math.max(0, Math.floor(isNaN(rounds) ? 0 : rounds));
      var seconds    = Math.max(0, Math.floor(safeRounds * secPerTurn));

      // 4) Prefer worldTime-based startTime when timing in seconds
      var startTime = (game.time && typeof game.time.worldTime === "number")
        ? game.time.worldTime
        : (srcDuration.startTime !== undefined ? srcDuration.startTime : undefined);

      // 5) Update the document source (reliable in preCreate)
      //    Also remove rounds/startRound/startTurn from the source
      var newSrc = effect.toObject ? effect.toObject() : {};
      if (!newSrc) newSrc = {};
      if (!newSrc.duration) newSrc.duration = {};
      newSrc.duration.seconds    = seconds;
      newSrc.duration.startTime  = startTime;
      newSrc.duration.rounds     = undefined;
      newSrc.duration.startRound = undefined;
      newSrc.duration.startTurn  = undefined;

      if (!newSrc.flags) newSrc.flags = {};
      if (!newSrc.flags["msh-faserip"]) newSrc.flags["msh-faserip"] = {};
      newSrc.flags["msh-faserip"].unitLabel       = "turn";
      newSrc.flags["msh-faserip"].unitLabelPlural = "turns";

      if (typeof effect.updateSource === "function") {
        effect.updateSource(newSrc);
      }

      // 6) Reflect the same in the incoming payload (some code reads `data`)
      data.duration.seconds = seconds;
      if (data.duration.rounds !== undefined)     delete data.duration.rounds;
      if (data.duration.startRound !== undefined) delete data.duration.startRound;
      if (data.duration.startTurn !== undefined)  delete data.duration.startTurn;

      if (!data.flags) data.flags = {};
      if (!data.flags["msh-faserip"]) data.flags["msh-faserip"] = {};
      data.flags["msh-faserip"].unitLabel       = "turn";
      data.flags["msh-faserip"].unitLabelPlural = "turns";

    } catch (err) {
      console.warn("FASERIP preCreateActiveEffect conversion failed:", err);
    }
  });




  /* Hooks.on("updateCombat", async (combat, changes) => {
    if (!("round" in changes) && !("turn" in changes)) return;
    const a = combat?.combatant?.actor; if (!a) return;
    for (const ef of a.effects) {
      try { await FX.renameEffectWithRemaining(ef); } catch {}
    }
  }); */


  Hooks.on("preUpdateActiveEffect", function (effect, changes, options, userId) {
    // v12+: img is canonical, icon is deprecated - check property existence without triggering getter
    if (changes && Object.hasOwn(changes, 'icon') && !changes.img) changes.img = changes.icon;
    if (changes?.img === "icons/svg/impact.svg") {
      changes.img = "icons/svg/target.svg";
    }
  });

  // Register Action HUD keybinding
  game.keybindings.register("msh-faserip", "openActionHUD", {
    name: "Open Action HUD",
    hint: "Opens the Action HUD for quick access to combat actions",
    category: "FASERIP",
    editable: [{ key: "KeyH", modifiers: ["Control"] }],  // Ctrl+H
    onDown: () => {
      if (ui.faseripHUD?.rendered) {
        ui.faseripHUD.bringToFront();
      } else {
        ui.faseripHUD = new FaseripActionPanel();
        ui.faseripHUD.render(true);
      }
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  // keyboard control to open Universal Table dialog
  game.keybindings.register("msh-faserip", "openUniversalTable", {
    name: "Open Universal Table",
    hint: "Opens the Universal Table using selected token, open sheet, or fallback actor",
    category: "FASERIP",
    editable: [{ key: "KeyU", modifiers: ["Control"] }],
    onDown: () => {
      const sheet = Object.values(ui.windows).find(w => w instanceof game.msh.FaseripActorSheet);
      const actor =
        sheet?.actor ??
        canvas.tokens.controlled[0]?.actor ??
        game.actors.find(a => a.type === "hero" || a.type === "npc") ??
        game.actors.contents[0]; // fallback to any actor

      if (actor) {
        game.msh.openUniversalTableDialog?.(actor);
      } else {
        ui.notifications.warn("No actor found to use for Universal Table.");
      }

      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  // Team control button
  // Add this after the keybinding registration and before the settings registration
  Hooks.on("getSceneControlButtons", function(controlsData) {
    console.log("FASERIP | getSceneControlButtons fired:", controlsData);

    // 1. Normalize whatever Foundry passed in into an array of group-objects
    let groupsArray;
    if (Array.isArray(controlsData)) {
      groupsArray = controlsData;
    } else if (controlsData && typeof controlsData === "object") {
      groupsArray = Object.values(controlsData);
    } else {
      console.error("FASERIP | Unexpected controlsData shape:", controlsData);
      return;
    }

    // 2. Find the "tokens" group
    const tokenGroup = groupsArray.find(g => g.name === "tokens" || g.name === "token");
    console.log("FASERIP | tokenGroup from hook:", tokenGroup);
    if (!tokenGroup) {
      console.error("FASERIP | Token controls not found");
      return;
    }

    // 3. Build a plain object keyed by each existing tool's name
    //    (This works whether tokenGroup.tools was originally an array or an object.)
    const existingToolsObj = {};
    if (tokenGroup.tools) {
      // If tokenGroup.tools is array-like, values() gives numeric indices first
      // If it's already an object, values() gives its property values
      for (const t of Object.values(tokenGroup.tools)) {
        if (t && t.name) existingToolsObj[t.name] = t;
      }
    }

    // 4. Insert your Team Management button under the "faserip-team" key
    if (!existingToolsObj["faserip-team"]) {
      existingToolsObj["faserip-team"] = {
        name: "faserip-team",
        title: "Team Management",
        icon: "fas fa-users-crown",
        visible: true,
        button: true,
        onClick: () => {
          console.log("FASERIP | Team Management onClick triggered!");
          import('./teamSheet.js').then(module => {
            const teamSheet = new module.TeamSheet();
            teamSheet.render(true);
          }).catch(error => {
            console.error("FASERIP: Error importing teamSheet:", error);
            ui.notifications.error("Could not load Team Sheet");
          });
        }
      };
      console.log("FASERIP | Added 'faserip-team' to tools object");
    } else {
      console.log("FASERIP | 'faserip-team' already existed, skipping re-insert");
    }

    // 4b. Combat Panel (GM-only)
    if (game.user?.isGM && !existingToolsObj["faserip-combat-panel"]) {
      existingToolsObj["faserip-combat-panel"] = {
        name: "faserip-combat-panel",
        title: "Combat Panel",
        icon: "fas fa-fist-raised",
        visible: true,
        button: true,
        onChange: () => {
          import('./combat-panel.js').then(module => {
            game.msh = game.msh || {};
            if (game.msh.combatPanel?.rendered) {
              game.msh.combatPanel.close();
            } else {
              if (!game.msh.combatPanel) game.msh.combatPanel = new module.FaseripCombatPanel();
              game.msh.combatPanel.render(true);
            }
          }).catch(err => {
            console.error("FASERIP | Combat Panel load failed:", err);
            ui.notifications.error("Could not load Combat Panel");
          });
        }
      };
      console.log("FASERIP | Added 'faserip-combat-panel' to tools object");
    }

    // 5. Assign the reconstructed tools-object back onto tokenGroup.tools
    tokenGroup.tools = existingToolsObj;

    console.log("FASERIP | tokenGroup.tools has been rebuilt:", tokenGroup.tools);
  });

  // <-- NEW/MODIFIED SECTION START -->
  // Register system settings

  // Time Tracking Settings
  game.settings.register("msh-faserip", "campaignStartDate", {
    name: "Campaign Start Date",
    hint: "The starting date/time for the campaign (e.g., 1976-01-01T00:00:00)",
    scope: "world",
    config: false,
    type: String,
    default: "1976-01-01T00:00:00"
  });

  game.settings.register("msh-faserip", "campaignStartWorldTime", {
    name: "Campaign Start World Time",
    hint: "The Foundry worldTime when campaign began",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register("msh-faserip", "combatSyncEnabled", {
    name: "Combat Sync Enabled",
    hint: "Auto-advance campaign time with combat tracker",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  // Combat Logs Settings (unchanged)
  game.settings.register("msh-faserip", "combatLogs", {
    name: "Combat Logs",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register("msh-faserip", "autoLogCombat", {
    name: "Auto-Log Combat",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register('msh-faserip', 'stunDurationDie', {
    name: "Stun Duration Die",
    hint: "Die rolled for stun duration (White result on Stun check). RAW is d10 (1-10 rounds). Use smaller dice for faster combats.",
    scope: "world",
    config: true,
    type: String,
    default: "d10",
    choices: {
      "d1": "d1 (always 1 round)",
      "d2": "d2 (1-2 rounds)",
      "d3": "d3 (1-3 rounds)",
      "d4": "d4 (1-4 rounds)",
      "d6": "d6 (1-6 rounds)",
      "d8": "d8 (1-8 rounds)",
      "d10": "d10 (1-10 rounds) - RAW"
    }
  });

  game.settings.register("msh-faserip", "unitsPerArea", {
    name: "Distance per Area",
    hint: "How many scene distance units equal 1 Area. Examples: 132 for feet, ~40 for meters, 1 if your scene units are Areas.",
    scope: "world",
    config: true,
    type: Number,
    default: 132
  });

  game.settings.register("msh-faserip", "dotMode", {
    name: "Dot Mode (Theater of the Mind)",
    hint: "Default dot mode for new scenes. Individual scenes can override this in Scene Config → Grid tab. Right-click tokens to override per-token. Ctrl+hover a dot for portrait.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("msh-faserip", "teamKarmaPoolTotal", {
    name: "Team Karma Pool Total",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  
  game.settings.register("msh-faserip", "teamMembers", {
      name: "Team Members",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("msh-faserip", "karmaMultiplier", {
      name: "Karma Multiplier",
      scope: "world",
      config: false,
      type: Number,
      default: 1
    });

    // Add this new one:
    game.settings.register("msh-faserip", "teamKarmaAwards", {
      name: "Team Karma Awards History",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("msh-faserip", "defeatedVillains", {
      name: "Defeated Villains List",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("msh-faserip", "teamHQActorId", {
      name: "Team HQ Actor ID",
      scope: "world",
      config: false,
      type: String,
      default: ""
    });

    game.settings.register("msh-faserip", "useKarmaPool", {
      name: "Enable Team Karma Pool",
      hint: "Enable the shared team karma pool (RAW rules). When off, all group awards split directly to individual heroes.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register("msh-faserip", "pendingKarmaAwards", {
      name: "Pending Karma Awards",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("msh-faserip", "turnSeconds", {
      name: "Turn Length (seconds)",
      hint: "Used when Calendar Time Tracker is not present.",
      scope: "world", config: true, type: Number, default: 6
    });

    game.settings.register("msh-faserip", "effects.durationPolicy", {
      name: "Effects Duration Policy",
      hint: "Auto = rounds in combat, seconds out of combat. Rounds-in-combat keeps round timing while combat is active.",
      scope: "world", config: true, type: String,
      choices: {
        "auto": "Auto (rounds in combat, seconds out of combat)",
        "rounds-in-combat": "Prefer rounds during combat",
        "seconds-only": "Always convert to seconds"
      },
      default: "rounds-in-combat"
    });

    // Suppress auto Recovery/Healing timers (and their chat cards) when damage is taken
    game.settings.register("msh-faserip", "effects.autoDamageTimers", {
      name: "Auto Recovery/Healing Timers on Damage",
      hint: "If OFF, taking damage will not auto-create Recovery/Healing timers or post timer chat cards. You can still create timers manually.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register("msh-faserip", "ctt.syncMode", {
      name: "CTT Sync Mode",
      hint: "Advance Calendar Time Tracker when combat advances.",
      scope: "world", config: true, type: String,
      choices: { "off":"Off", "turn":"Per Turn", "round":"Per Round" },
      default: "off"
    });

    game.settings.register("msh-faserip", "ctt.timeAuthority", {
      name: "CTT Is Time Authority",
      hint: "When ON and CTT is active, the Team Tracker reads date/time from CTT and time controls route through CTT. When OFF, FASERIP uses its own worldTime-based clock.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register("msh-faserip", "chargenStandardRanks", {
      name: "House Rule: Standard Rank Numbers",
      hint: "Generated characters use standard rank numbers (e.g. Good=10, Remarkable=30) instead of minimum rank numbers (Good=8, Remarkable=26). RAW uses minimum for generated characters and standard for pregenerated/established heroes.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    // ========== Action HUD Settings ==========
    game.settings.register("msh-faserip", "actionHudEnabled", {
      name: "Action HUD: Show on Login",
      hint: "Automatically open the Action HUD when the game loads.",
      scope: "client",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register("msh-faserip", "actionHudRememberPosition", {
      name: "Action HUD: Remember Position",
      hint: "Persist the HUD window position between sessions.",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "actionHudColumns", {
      name: "Action HUD: Grid Columns",
      hint: "Number of button columns in the HUD grid.",
      scope: "client",
      config: true,
      type: Number,
      default: 6,
      choices: { 3: "3", 4: "4", 5: "5", 6: "6", 8: "8" }
    });

    game.settings.register("msh-faserip", "actionHudZoom", {
      name: "Action HUD: Button Scale",
      hint: "Zoom level for HUD buttons (0.5–2.0). Also adjustable with Ctrl+Wheel.",
      scope: "client",
      config: true,
      type: Number,
      default: 1.0,
      range: { min: 0.5, max: 2.0, step: 0.1 }
    });

    game.settings.register("msh-faserip", "actionHudStyle", {
      name: "Action HUD: Display Style",
      hint: "Show icon art or text labels on HUD buttons.",
      scope: "client",
      config: true,
      type: String,
      default: "icons",
      choices: { icons: "Icons Only", labels: "Labels Only" }
    });

    game.settings.register("msh-faserip", "actionHudLocked", {
      name: "Action HUD: Lock Position",
      hint: "Prevent the HUD window from being dragged or moved.",
      scope: "client",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register("msh-faserip", "actionHudShowDefenses", {
      name: "Action HUD: Show Defensive Actions",
      hint: "Show Dodge, Evade, Block, and Catch buttons on the HUD.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "actionHudShowEffects", {
      name: "Action HUD: Show Effect Checks",
      hint: "Show Slam, Stun, and Kill check buttons on the HUD.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "actionHudLayout", {
      name: "Action HUD Layout",
      hint: "Persisted button order for the Action HUD.",
      scope: "client",
      config: false,
      type: String,
      default: ""
    });

    game.settings.register("msh-faserip", "actionHudPosition", {
      name: "Action HUD Position",
      hint: "Persisted window position.",
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    debugLog("FASERIP DEBUG: Team settings registered.");

    // ========== CTT ↔ FASERIP Bridge Hooks ==========
    // When CTT fires its own hooks, relay them to msh-faserip.timeUpdated
    // so the team sheet and any other FASERIP listeners refresh.
    Hooks.on("timeTracker.timeAdvanced", async (amount, unitId) => {
      Hooks.callAll("msh-faserip.timeUpdated");

      // Process dying whenever CTT manually advances time (in OR out of combat).
      // If ctt.syncMode also fires this after a combatRound hook, the dedup stamp
      // in processDyingRound (lastProcessedWorldTime) blocks the duplicate.
      if (!game.user.isGM) return;

      // Guard against re-entrant calls while an async processDyingRound is in flight
      // Also skip if combatRound hook is already processing dying (race condition fix)
      if (game.msh._cttDyingInProgress || game.msh._dyingInProgress) return;
      game.msh._cttDyingInProgress = true;

      // Convert the CTT advancement directly to seconds (hoisted so healing block can read it)
      const cttModule = game.modules.get("calendar-time-tracker");
      let deltaSeconds = 0;
      if (cttModule?.api?.timeEngine && amount && unitId) {
        try {
          deltaSeconds = cttModule.api.timeEngine.convertToSeconds(Number(amount), unitId) || 0;
        } catch (_) {}
      }
      if (deltaSeconds <= 0 && amount > 0) {
        deltaSeconds = Number(amount) * 6;
      }

      try {
        const { processDyingRound } = await import("./modules/effects/ongoing-engine.js");
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";

        // Process 1 dying round per character per CTT advance.
        // During combat, combatRound hook handles dying (1 per round).
        // Out of combat, each manual CTT advance ticks dying once — GM controls pacing.
        for (const actor of Effects.getAllTokenActors()) {
          if (!actor?.effects?.size) continue;
          const dyingAE = actor.effects.find(e =>
            (e.flags?.[scope]?.ongoingId === "dying" || e.flags?.[scope]?.isDying) &&
            !e.disabled
          );
          if (!dyingAE) continue;

          console.log(`[FASERIP:DYING] CTT timeAdvanced: ${amount} ${unitId} = ${deltaSeconds}s — processing 1 dying round for ${actor.name}`);
          const result = await processDyingRound(actor);
          console.log(`[FASERIP:DYING] CTT: ${actor.name} → ${result}`);
        }
      } catch (e) {
        console.error("[FASERIP ERROR] CTT dying processing failed:", e);
      } finally {
        game.msh._cttDyingInProgress = false;
      }

      // Process impaired Endurance healing on day/week advance
      if (deltaSeconds >= 86400) {
        try {
          const { RestSystem } = await import("./modules/rest-system.js");
          for (const actor of Effects.getAllTokenActors()) {
            if (!actor?.effects?.size) continue;
            const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
            const impairedAE = actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance") && !e.disabled);
            if (!impairedAE) continue;
            const medicalCare = actor.getFlag(scope, "medicalCare") ?? false;
            const dayInSeconds = 86400;
            const weekInSeconds = 7 * dayInSeconds;
            const required = medicalCare ? dayInSeconds : weekInSeconds;
            const lastHealed = impairedAE.getFlag(scope, "lastHealed") || 0;
            const elapsed = game.time.worldTime - lastHealed;
            if (elapsed >= required) {
              const result = await RestSystem.healImpairedEndurance(actor, medicalCare);
              if (result.success) {
                console.log(`[FASERIP] Impaired Endurance healed: ${actor.name} — ${result.message}`);
              }
            }
          }
        } catch (e) {
          console.error("[FASERIP ERROR] Impaired Endurance auto-heal failed:", e);
        }
      }
    });
    Hooks.on("timeTracker.timeSet", () => {
      Hooks.callAll("msh-faserip.timeUpdated");
    });

  // Register custom grappling effects so they show token HUD icons and work with ActiveEffect.statuses
  CONFIG.statusEffects.push(
    {
      id: "partial-hold",
      label: "Partial Hold",
      icon: "icons/svg/net.svg", // Use existing Foundry icon
      flags: { "msh-faserip": { grappling: true } }
    },
    {
      id: "full-hold", 
      label: "Full Hold",
      icon: "icons/svg/paralysis.svg", // Use existing Foundry icon
      flags: { "msh-faserip": { grappling: true } }
    }
  );

  CONFIG.statusEffects.push({
    id: "dying",
    label: "Dying",
    icon: "icons/svg/skull.svg",
    flags: { "msh-faserip": { isDying: true } }  // ← Changed to isDying
  });

  CONFIG.statusEffects.push({
    id: "impaired-endurance",
    label: "Impaired Endurance",
    icon: "icons/svg/blood.svg",
    flags: { "msh-faserip": { isImpairedEndurance: true } }
  });

  CONFIG.statusEffects.push({
    id: "dead",
    label: "Dead",
    icon: "icons/svg/skull.svg",
    flags: { "msh-faserip": { isDead: true } }  // ← Also use isDead for consistency
  });

  CONFIG.statusEffects.push(
    {
      id: "dodging",
      label: "Dodging",
      icon: "icons/svg/windmill.svg",
      flags: { "msh-faserip": { isDodging: true } }
    },
    {
      id: "evading", 
      label: "Evading",
      icon: "icons/svg/combat.svg",
      flags: { "msh-faserip": { isEvading: true } }
    },
    {
      id: "blocking",
      label: "Blocking",
      icon: "icons/svg/shield.svg",
      flags: { "msh-faserip": { isBlocking: true } }
    }
  );

  CONFIG.FASERIP.rankValues = {
    "Shift-0": 0, 
    "Feeble": 2, 
    "Poor": 4, 
    "Typical": 6, 
    "Good": 10, 
    "Excellent": 20,
    "Remarkable": 30, 
    "Incredible": 40, 
    "Amazing": 50, 
    "Monstrous": 75,
    "Unearthly": 100, 
    "Shift X": 150, 
    "Shift Y": 200, 
    "Shift Z": 500,
    "Class 1000": 1000, 
    "Class 3000": 3000, 
    "Class 5000": 5000, 
    "Beyond": 9999,
    
    // Add these alternative formats that might be generated:
    "Shift-X": 150,
    "Shift-Y": 200, 
    "Shift-Z": 500,
    "Class1000": 1000,
    "Class3000": 3000,
    "Class5000": 5000
  };

  // Build an ordered rank ladder from your values
  const _rankEntries = Object.entries(CONFIG.FASERIP.rankValues)
    .filter(([n,v]) => typeof v === "number")
    .sort((a,b) => a[1] - b[1]); // ascending by value

  const RANK_ORDER = _rankEntries.map(([name]) => name);

  // Return the next lower printed rank name, clamped at "Shift-0"
  game.msh.nextLowerRankName = function(name) {
    const i = RANK_ORDER.indexOf(name);
    if (i <= 0) return "Shift-0";
    return RANK_ORDER[i - 1];
  };

  game.msh.nextHigherRankName = function(name) {
    const i = RANK_ORDER.indexOf(name);
    if (i < 0 || i >= RANK_ORDER.length - 1) return name;
    return RANK_ORDER[i + 1];
  };

  // Convenience to get current printed rank name from an actor's Endurance
  game.msh.getEnduranceRankName = function(actor) {
    const r = actor.system?.abilities?.endurance?.rank ?? actor.system?.abilities?.endurance?.value;
    // tolerate either printed rank name or numeric; resolve to printed name
    if (typeof r === "string") return r;
    // if numeric, snap to the closest printed name by value
    let best = "Shift-0", bestDiff = Infinity;
    for (const [name, val] of _rankEntries) {
      const d = Math.abs((r ?? 0) - val);
      if (d < bestDiff) { best = name; bestDiff = d; }
    }
    return best;
  };

  CONFIG.FASERIP.damageTypes = {
    // Physical
    "physical-blunt": "Physical: Blunt",
    "physical-edged": "Physical: Edged",
    
    // Energy - these need to bypass physical armor
    "energy-force": "Energy: Force",
    "energy-generic": "Energy: Generic",
    "energy-fire": "Energy: Fire/Heat",
    "energy-cold": "Energy: Cold/Ice",
    "energy-electricity": "Energy: Electricity",
    "energy-sound": "Energy: Sound/Sonic",
    "energy-light": "Energy: Light",
    "energy-radiation": "Energy: Radiation",
    "energy-darkforce": "Energy: Darkforce",
    
    // Special
    "corrosive": "Corrosive/Acid",
    "mental": "Mental/Psionic",
    "nullification": "Nullification",
    
    // Touch Attacks
    "touch-energy": "Touch: Energy",
    "touch-paralyzing": "Touch: Paralyzing",
    "touch-rotting": "Touch: Rotting (organic)",
    "touch-corrosive": "Touch: Corrosive (inorganic)",
    "touch-healthdrain": "Touch: Health Drain",
    "touch-blinding": "Touch: Blinding"
  };

  CONFIG.FASERIP.resistanceTypes = {
    "fire": "Fire/Heat",
    "cold": "Cold/Ice",
    "electricity": "Electricity",
    "radiation": "Radiation",
    "toxins": "Toxins/Poison",
    "corrosives": "Corrosives/Acid",
    "emotion": "Emotion Attacks",
    "mental": "Mental Attacks",
    "magic": "Magical Attacks",
    "disease": "Disease"
  };

  CONFIG.FASERIP.attackTypes = {
    "ranged-energy": "Ranged: Energy Blast",
    "ranged-force": "Ranged: Force Blast",
    "ranged-projectile": "Ranged: Projectile",
    "ranged-thrown": "Ranged: Thrown Weapon",
    "melee-blunt": "Melee: Blunt Attack",
    "melee-edged": "Melee: Edged Attack",
    "touch": "Touch Attack",
    "mental": "Mental Attack",
    "grapple": "Grappling",
    "charging": "Charging Attack"
  };

  CONFIG.FASERIP.primaryEffects = {
    "damage": "Deals Damage",
    "stun": "Stunning Effect",
    "nullification": "Power Nullification",
    "control-mind": "Mind Control",
    "control-emotion": "Emotion Control",
    "control-animal": "Animal Control",
    "control-plant": "Plant Control",
    "healing": "Healing",
    "support": "Support/Buff",
    "transformation": "Transformation",
    "detection": "Detection/Sensing",
    "teleportation": "Teleportation",
    "illusion": "Illusion/Image",
    "force-field": "Force Field"
  };

  CONFIG.FASERIP.bodyArmorTypes = {
    "physical": "Physical Only",
    "energy": "Energy Only",
    "both": "Both Physical & Energy"
  };

  CONFIG.FASERIP.resistanceEffects = {
    "columnShift": "Column Shift Bonus",
    "damageReduction": "Damage Reduction",
    "immunity": "Immunity (if rank exceeds attack)"
  };

  // Helper function to check if damage type is energy-based
  CONFIG.FASERIP.isEnergyDamage = function(damageType) {
    return damageType && (
      damageType.startsWith("energy-") || 
      damageType === "mental" ||
      damageType === "touch-energy"
    );
  };

  // Helper function to check if damage type is physical
  CONFIG.FASERIP.isPhysicalDamage = function(damageType) {
    return damageType && damageType.startsWith("physical-");
  };

  // Helper function to get appropriate armor value
  CONFIG.FASERIP.getApplicableArmor = function(armorPhysical, armorEnergy, damageType) {
    if (this.isEnergyDamage(damageType)) {
      return armorEnergy || 0;
    } else if (this.isPhysicalDamage(damageType)) {
      return armorPhysical || 0;
    }
    // For special damage types, use physical as default
    return armorPhysical || 0;
  };

  await loadTemplates([
    "systems/msh-faserip/templates/universal-table.html",
    "systems/msh-faserip/templates/universal-rank-table.hbs"
  ]);

  // Create game.msh namespace
  game.msh = game.msh || {};

  game.msh.getRankValue = function(rankName) {
    if (!rankName) return 0;
    
    // Normalize the rank name
    let normalizedRank = rankName.toString().trim();
    
    // Handle "Class" ranks - remove spaces
    if (normalizedRank.includes("Class ")) {
      normalizedRank = normalizedRank.replace("Class ", "Class");
    }
    
    // Try direct lookup first
    if (CONFIG.FASERIP.rankValues[normalizedRank] !== undefined) {
      return CONFIG.FASERIP.rankValues[normalizedRank];
    }
    
    // Try common variations
    const variations = [
      normalizedRank,
      normalizedRank.replace(/\s+/g, ""), // Remove all spaces
      normalizedRank.replace(/\s+/g, " "), // Normalize spaces
      normalizedRank.replace("-", " "),    // Replace hyphens with spaces
      normalizedRank.replace(" ", "-")     // Replace spaces with hyphens
    ];
    
    for (const variation of variations) {
      if (CONFIG.FASERIP.rankValues[variation] !== undefined) {
        return CONFIG.FASERIP.rankValues[variation];
      }
    }
    
    console.warn(`Rank "${rankName}" not found in CONFIG.FASERIP.rankValues`);
    return 0;
  };

  game.msh.getRankName = function(rankValue) {
    // Find the rank name that corresponds to this value
    for (const [name, value] of Object.entries(CONFIG.FASERIP.rankValues)) {
      if (value === rankValue) {
        return name;
      }
    }
    return "Unknown";
  };
  
  game.msh.getActorPowers = function(actor) {
    const items = actor.items.contents ?? actor.items;

    const powers = items
      .filter(i => i.type === "power")
      .map(i => foundry.utils.duplicate(i.system));

    for (let item of items) {
      if (item.type === "equipment" && Array.isArray(item.system.powers)) {
        for (let power of item.system.powers) {
          if (power.grantedByEquipment) {
            powers.push(foundry.utils.duplicate(power));
          }
        }
      }
    }

    for (let power of powers) {
      if (typeof power.value === "undefined" && power.rank) {
        power.value = game.msh.getRankValue(power.rank) ?? 0;
      }
    }

    return powers;
  };

  // GAME NAMESPACE REGISTER
  // Compatibility shim: redirect old rollUniversalAction calls to new ActionDispatcher
  game.msh.rollUniversalAction = async function(actionCode, actorId, columnShift = null, karma = null, options = {}) {
    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error("Actor not found!");
      return;
    }
    
    // Map old action codes to new action types
    const actionTypeMap = {
      "BA": "blunt-attack",
      "EA": "edged-attack", 
      "Sh": "shooting",
      "TE": "throwing-edged",
      "TB": "throwing-blunt",
      "En": "energy",
      "Fo": "force",
      "Do": "dodging",
      "Ev": "evading",
      "Bl": "blocking",
      "Ca": "catching",
      "Gp": "grappling",
      "Gb": "grabbing",
      "Es": "escaping",
      "Ch": "charging"
    };
    
    const actionType = actionTypeMap[actionCode] || actionCode;
    
    // Call new dispatcher
    return await ActionDispatcher.roll(actionType, {
      actor,
      opts: { karma, ...options }
    });
  };
  // Add the rollUniversalTable function to the namespace, wrapped to emit hook
  const originalRollUniversalTable = rollUniversalTable;
  game.msh.rollUniversalTable = function(rank, roll) {
    const color = originalRollUniversalTable(rank, roll);
    // Emit hook for universal table popout to catch
    Hooks.call('msh-faserip.universalTableRoll', {
      rank: rank,
      roll: roll,
      color: color
    });
    return color;
  };

  // Back-compat / public wrapper so code can call game.msh.actions.roll()
  // (internally delegates to the new ActionDispatcher)
  game.msh.actions ??= {};
  game.msh.actions.roll = async function (actionType, { actor, abilityName, opts = {} } = {}) {
    return await ActionDispatcher.roll(actionType, { actor, abilityName, opts });
  };

   // Add the open dialog function safely inside the hook
   game.msh.openUniversalTableDialog = openUniversalTableDialog;
  
  // Add the roll functions to the namespace
  game.msh.rollPower = FaseripRolls.rollPower;
  game.msh.rollTalent = FaseripRolls.rollTalent;
  game.msh.rollContact = FaseripRolls.rollContact;
  game.msh.rollEquipment = FaseripRolls.rollEquipment;

  // Add the CombatHandler to the namespace
  game.msh.CombatHandler = CombatHandler;
  // Anchor: expose legacy handler only in classic mode (no longer a valid mode)
  // CombatHandler is always available via namespace
  

  // Add the Action HUD to the namespace
  game.msh.FaseripActionPanel = FaseripActionPanel;  // <-- ADD THIS LINE

  // Add the collision damage dialog
  game.msh.openCollisionDamageDialog = openCollisionDamageDialog;

  // Add the collision damage dialog
  game.msh.openCollisionDamageDialog = openCollisionDamageDialog;

  // Initialize faserip initiative
  FaseripInitiative.init();

  game.msh.rollFaseripInitiative = () => {
    if (!game.combat) {
      ui.notifications.warn("No active combat encounter");
      return;
    }
    const mode = game.settings.get("msh-faserip", "initiativeMode");
    if (mode === "side") FaseripInitiative.rollSideInitiative(game.combat);
    else if (mode === "individual") FaseripInitiative.rollIndividualInitiative(game.combat);
    else game.combat.rollInitiative();
  };
  
  // Add the vehicle control roll function
  game.msh.rollVehicleControl = (actor, vehicle) => {
    if (actor && actor.sheet && actor.sheet._rollVehicleControl) {
      return actor.sheet._rollVehicleControl(vehicle);
    } else {
      ui.notifications.warn("Could not access vehicle control roll function");
    }
  };
  
  // Updated rollItemMacro function
  // Define the rollItemMacro function (in your init.js)
  game.msh.rollItemMacro = async function(actorId, itemId) {
    const actor = game.actors.get(actorId);
    if (!actor) {
      return ui.notifications.warn(`Actor ${actorId} not found`);
    }
  
    const item = actor.items.get(itemId);
    if (!item) {
      return ui.notifications.warn(`Item ${itemId} not found`);
    }
  
    switch (item.type) {
      case "power": return game.msh.rollPower(actor, item);
      case "talent": return game.msh.rollTalent(actor, item);
      case "contact": return game.msh.rollContact(actor, item);
      case "equipment": return game.msh.rollEquipment(actor, item);
      case "vehicle": return actor.sheet._rollVehicleControl(item); // vehicle added
      default:
        return ui.notifications.warn(`Cannot roll item of type: ${item.type}`);
    }
  };

  // entangle - new!
  game.msh.attemptEscapeEntanglement = async function(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error("Actor not found");
      return;
    }

    const { attemptEscapeEntanglement } = await import("./modules/actions/entangling-action.js");
    await attemptEscapeEntanglement(actor);
  };
      
  // Register Handlebars helpers
  Handlebars.registerHelper('div', function(a, b) {
    return Math.floor(a / b);
  });
  
  Handlebars.registerHelper('getFlag', function(object, scope, flag) {
    return object.getFlag(scope, flag);
  });

  // Use system scope automatically: {{getSysFlag object "status.nullified"}}
  Handlebars.registerHelper('getSysFlag', function(object, flag) {
    const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
    return object.getFlag(scope, flag);
  });

  Handlebars.registerHelper('abbreviateRank', function(rank) {
    const rankMap = {
      "Shift-0": "Sh-0",
      "Feeble": "Fe",
      "Poor": "Pr",
      "Typical": "Ty",
      "Good": "Gd",
      "Excellent": "Ex",
      "Remarkable": "Rm",
      "Incredible": "In",
      "Amazing": "Am",
      "Monstrous": "Mn",
      "Unearthly": "Un",
      "Shift-X": "Sh-X",
      "Shift-Y": "Sh-Y",
      "Shift-Z": "Sh-Z",
      "Class 1000": "1000",
      "Class 3000": "3000",
      "Class 5000": "5000",
      "Beyond": "B"
    };
    return rankMap[rank] || rank;
  });

  Handlebars.registerHelper('some', function(array, property) {
    if (!Array.isArray(array)) return false;
    return array.some(item => {
      const value = property.split('.').reduce((obj, key) => obj?.[key], item);
      return Array.isArray(value) ? value.length > 0 : value;
    });
  });

  // Register document classes
  CONFIG.Actor.documentClass = FaseripActor;
  CONFIG.Item.documentClass = FaseripItem;

  // Register custom token ruler (speed-based color coding)
  CONFIG.Token.rulerClass = FaseripTokenRuler;

  // Register dot-mode token display and hooks
  initDotToken();

  // Register FASERIP movement actions for Token HUD
  // Foundry V13 built-in: users select via Token HUD or TAB during waypoint movement
  if (CONFIG.Token.movement?.actions) {
    const actions = CONFIG.Token.movement.actions;

    // Walk/Run - always available, default
    if (actions.walk) {
      actions.walk.label = "Run";
      actions.walk.canSelect = () => true;
      actions.walk.order = 0;
    }

    // Fly - replace single entry with three flight sub-modes
    // Full: max air speed (subject to exhaustion)
    // Low Alt: ground speed for flight rank (< 2 stories or enclosed spaces)
    // Cruise: 2 ranks lower air speed (no exhaustion)
    const canFly = (token) => {
      const actor = token.actor ?? token.parent;
      return (actor?.system?.movement?.fly || 0) > 0;
    };

    if (actions.fly) {
      actions.fly.canSelect = () => false;  // Hide default fly
    }

    actions.flyFull = {
      label: "Fly (Full)",
      icon: "fa-solid fa-jet-fighter-up",
      canSelect: canFly,
      order: 1
    };
    actions.flyLowAlt = {
      label: "Fly (Low Alt)",
      icon: "fa-solid fa-plane-arrival",
      canSelect: canFly,
      order: 2
    };
    actions.flyCruise = {
      label: "Fly (Cruise)",
      icon: "fa-solid fa-plane",
      canSelect: canFly,
      order: 3
    };

    // Swim - only if actor has swim speed
    if (actions.swim) {
      actions.swim.canSelect = (token) => {
        const actor = token.actor ?? token.parent;
        return (actor?.system?.movement?.swim || 0) > 0;
      };
      actions.swim.order = 4;
    }

    // Teleport - only if actor has teleport speed > 0
    if (actions.teleport) {
      actions.teleport.teleport = true;
      actions.teleport.canSelect = (token) => {
        const actor = token.actor ?? token.parent;
        return (actor?.system?.movement?.teleport || 0) > 0;
      };
      actions.teleport.order = 5;
    }

    // Hide movement types FASERIP doesn't use
    const hideActions = ["burrow", "crawl", "climb"];
    for (const key of hideActions) {
      if (actions[key]) {
        actions[key].canSelect = () => false;
      }
    }

    // Set default action to walk
    CONFIG.Token.movement.defaultAction = "walk";
  }

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);

  Actors.registerSheet("msh-faserip", FaseripActorSheet, {
    types: ["hero", "villain", "npc"],
    makeDefault: true
  });
  
  // Make sure to register vehicle items with FaseripItemSheet
  Items.registerSheet("msh-faserip", FaseripItemSheet, { 
    types: ["power", "vehicle"],
    makeDefault: true 
  });

  // Headquarters sheet - dedicated
  Items.registerSheet("msh-faserip", FaseripHeadquartersSheet, {
    types: ["headquarters"],
    makeDefault: true
  });
  
  // Talent sheet - smaller dialog
  Items.registerSheet("msh-faserip", FaseripTalentSheet, { 
    types: ["talent"],
    makeDefault: true 
  });
  
  // Contact sheet - smaller dialog
  Items.registerSheet("msh-faserip", FaseripContactSheet, { 
    types: ["contact"],
    makeDefault: true 
  });
  
  Items.registerSheet("msh-faserip", FaseripEquipmentSheet, { 
    types: ["equipment"], 
    makeDefault: true 
  });

  Handlebars.registerHelper('array', function() {
    // arguments includes the Handlebars options object at the end
    return Array.prototype.slice.call(arguments, 0, -1);
  });

  // {{capitalize "word"}} -> "Word"
  Handlebars.registerHelper('capitalize', function(str) {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  
  // Initialize rest system
  initRestSystem();

  // ── Ongoing Effects Engine API ────────────────────────────────────────
  // Generic periodic effects (Regeneration, Solar Regen, Dying, etc.)
  let OngoingEngine;
  try {
    OngoingEngine = await import("./modules/effects/ongoing-engine.js");
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to load ongoing-engine.js:", e);
  }

  // Generic API
  game.msh.ongoing = {
    register: OngoingEngine?.registerOngoingEffect,
    remove: OngoingEngine?.removeOngoingEffect,
    interrupt: OngoingEngine?.interruptOngoingEffects,
    process: OngoingEngine?.processOngoingEffects,
    processDyingRound: OngoingEngine?.processDyingRound,
    // Power-specific shortcuts
    applyRegeneration: OngoingEngine?.applyRegenerationOngoing,
    applySolarRegeneration: OngoingEngine?.applySolarRegenerationOngoing,
    applyDying: OngoingEngine?.applyDyingOngoing,
  };

  // Defense effects API
  let DefenseEffects = null;
  try {
    DefenseEffects = await import("./modules/effects/defense-effects.js");
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to load defense-effects.js:", e);
  }

  game.msh.defense = {
    sync: DefenseEffects?.syncDefenseEffects,
    syncAll: DefenseEffects?.syncAllDefenseEffects,
    getActive: DefenseEffects?.getActiveDefenseEffects,
    getBodyArmor: DefenseEffects?.getBodyArmorFromEffects,
    getForceField: DefenseEffects?.getForceFieldFromEffects,
    getResistance: DefenseEffects?.getResistanceFromEffects,
  };

  // Backward compat
  game.msh.applyRegeneration = Effects.applyRegeneration;
  game.msh.getAllTokenActors = Effects.getAllTokenActors;

  /** Start Regeneration for selected token or explicit actor (manual override) */
  game.msh.startRegeneration = async function (target) {
    const actor = target?.actor ?? target
      ?? canvas.tokens.controlled[0]?.actor
      ?? game.user?.character;
    if (!actor) {
      ui.notifications.warn("Select a token or pass an actor to start Regeneration.");
      return null;
    }
    // Find by field first, fall back to name
    const regenPower = actor.items.find(i =>
      i.type === "power" && (i.system?.regenerationType === "rest" || /^regenerat/i.test(i.name))
    );
    if (!regenPower) {
      ui.notifications.warn(`${actor.name} has no Regeneration power. Set Regeneration Type on the power's Functions tab.`);
      return null;
    }
    const endValue = actor.system?.abilities?.endurance?.value ?? 10;
    if (OngoingEngine) {
      return OngoingEngine.applyRegenerationOngoing(actor, {
        healAmount: endValue,
        cycleTurns: 10,
        powerRank: regenPower.system?.rank || null,
        powerItemId: regenPower.id,
      });
    }
    return Effects.applyRegeneration(actor, {
      healAmount: endValue,
      cycleTurns: 10,
      powerRank: regenPower.system?.rank || null,
      powerItemId: regenPower.id,
    });
  };

  /** Start Solar Regeneration for selected token (manual override) */
  game.msh.startSolarRegeneration = async function (target) {
    const actor = target?.actor ?? target
      ?? canvas.tokens.controlled[0]?.actor
      ?? game.user?.character;
    if (!actor) {
      ui.notifications.warn("Select a token or pass an actor.");
      return null;
    }
    // Find by field first, fall back to name
    const power = actor.items.find(i =>
      i.type === "power" && (i.system?.regenerationType === "solar" || /solar\s*regen/i.test(i.name))
    );
    if (!power) {
      ui.notifications.warn(`${actor.name} has no Solar Regeneration power. Set Regeneration Type to "Solar" on the power's Functions tab.`);
      return null;
    }
    if (!OngoingEngine) return null;
    return OngoingEngine.applySolarRegenerationOngoing(actor, {
      powerRank: power.system?.rank || null,
      powerItemId: power.id,
    });
  };

  /** Remove regeneration ongoing effects from selected token */
  game.msh.stopRegeneration = async function (target) {
    const actor = target?.actor ?? target
      ?? canvas.tokens.controlled[0]?.actor
      ?? game.user?.character;
    if (!actor) return;
    const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";

    if (OngoingEngine) {
      await OngoingEngine.removeOngoingEffect(actor, "regeneration");
      await OngoingEngine.removeOngoingEffect(actor, "solarRegeneration");
    }

    // Also clean up legacy flags/AEs
    const ef = actor.effects.find(e =>
      e.flags?.[scope]?.effectType === "regeneration" && !e.flags?.[scope]?.ongoingId
    );
    if (ef) await ef.delete({ mshIntentional: true });
    try { await actor.unsetFlag(scope, "regeneration"); } catch (_) {}

    console.log(`[FASERIP] Regeneration removed from ${actor.name}`);
  };

  // end of hooks.once
});

Hooks.on("preCreateActor", (document, data, options, userId) => {
  console.log("[FASERIP] preCreateActor - Type:", document.type);
  
  const updates = {};
  
  switch (document.type) {
    case "hero":
      updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      console.log("[FASERIP] Setting hero disposition to FRIENDLY (1)");
      break;
    case "villain":
      updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.HOSTILE;
      console.log("[FASERIP] Setting villain disposition to HOSTILE (-1)");
      break;
    case "vehicle":
      if (document.prototypeToken?.disposition === undefined) {
        updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.NEUTRAL;
      }
      if (document.prototypeToken?.lockRotation === undefined) {
        updates["prototypeToken.lockRotation"] = true;
      }
      if (document.prototypeToken?.width === undefined) {
        updates["prototypeToken.width"] = 2;
      }
      if (document.prototypeToken?.height === undefined) {
        updates["prototypeToken.height"] = 2;
      }
      if (document.prototypeToken?.bar1?.attribute === undefined) {
        updates["prototypeToken.bar1.attribute"] = "resources.body";
      }
      console.log("[FASERIP] Setting vehicle token defaults");
      break;
    case "npc":
    default:
      updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.NEUTRAL;
      console.log("[FASERIP] Setting NPC disposition to NEUTRAL (0)");
      break;
  }
  
  if (Object.keys(updates).length > 0) {
    document.updateSource(updates);
    console.log("[FASERIP] preCreateActor updates applied:", updates);
  }
});


// CONSOLIDATED READY HOOK - All ready logic in one place
// ─── Handle faserip.token.* ActiveEffect changes ────────────────────────────
// Pattern follows Active Token Lighting (ATL) by kandashi:
//   - applyActiveEffect hook blocks faserip.token.* from writing to actor data
//   - On any effect CRUD event, re-collect all active faserip.token.* changes
//   - Save baseline token state in flags before first application
//   - Apply merged desired state to all tokens for the actor
//   - When no effects remain, revert to saved baseline and clear flags
//
// Baseline stored at: tokenDoc.flags.msh-faserip.tokenBaseline = { "light.bright": 0, ... }

const _TOKEN_FLAG_SCOPE = "msh-faserip";
const _TOKEN_BASELINE_KEY = "tokenBaseline";

// Collect all active faserip.token.* changes for an actor into a flat object
function _collectTokenEffectState(actor) {
  const desired = {};
  for (const effect of actor.allApplicableEffects()) {
    if (effect.disabled || effect.isSuppressed) continue;
    for (const change of effect.changes) {
      if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) continue;
      if (!change.key.startsWith("faserip.token.")) continue;
      const tokenKey = change.key.replace("faserip.token.", "");
      let val = change.value;
      if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
      else if (val === "true") val = true;
      else if (val === "false") val = false;
      desired[tokenKey] = val;
    }
  }
  return desired;
}

// Reconcile token state: apply desired or revert to baseline
async function _reconcileTokenEffects(actor) {
  if (!canvas?.scene || !game.user.isGM) return;

  // Find tokens for this actor — handle both linked and unlinked (synthetic) actors
  const tokens = canvas.scene.tokens.filter(t => {
    if (t.actorLink) return t.actorId === actor.id;
    // Unlinked: the token's synthetic actor IS the actor
    return t.actor === actor;
  });
  if (!tokens.length) return;

  const desired = _collectTokenEffectState(actor);
  const desiredFlat = foundry.utils.flattenObject(desired);
  const hasDesired = Object.keys(desiredFlat).length > 0;

  for (const tokenDoc of tokens) {
    const savedBaseline = tokenDoc.getFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY);

    if (hasDesired) {
      // Build or extend the baseline: snapshot current value for every key we're about to change
      const baseline = savedBaseline ? foundry.utils.duplicate(savedBaseline) : {};
      let baselineChanged = false;
      for (const key of Object.keys(desiredFlat)) {
        if (!(key in baseline)) {
          baseline[key] = foundry.utils.getProperty(tokenDoc, key) ?? null;
          baselineChanged = true;
        }
      }
      if (!savedBaseline || baselineChanged) {
        await tokenDoc.setFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY, baseline);
      }
      // Apply desired state
      await tokenDoc.update(desired);

    } else if (savedBaseline) {
      // No active token effects — revert every key to its baseline value
      const revert = {};
      for (const [key, val] of Object.entries(savedBaseline)) {
        foundry.utils.setProperty(revert, key, val);
      }
      await tokenDoc.update(revert);
      await tokenDoc.unsetFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY);
    }
  }
}

// Debounce: multiple effect changes in quick succession get one reconcile
let _reconcileTimer = null;
function _scheduleReconcile(actor) {
  if (!actor) return;
  clearTimeout(_reconcileTimer);
  _reconcileTimer = setTimeout(() => _reconcileTokenEffects(actor), 200);
}

// Helper: resolve an effect's parent chain to find the owning actor
function _resolveEffectActor(effect) {
  const parent = effect.parent;
  if (parent?.documentName === "Actor") return parent;
  if (parent?.documentName === "Item" && parent.actor) return parent.actor;
  return null;
}

// ── Hook: block faserip.token.* from being written to actor system data ──
Hooks.on("applyActiveEffect", (actor, change, current, delta, changes) => {
  if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) return;
  if (!change.key.startsWith("faserip.token.")) return;
  return false;
});

// ── Hooks: reconcile when effects change ──
Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
  const hasTokenChanges = effect.changes?.some(c => c.key?.startsWith("faserip.token."));
  const disabledToggled = "disabled" in changes;
  if (!hasTokenChanges && !disabledToggled) return;
  if (!game.user.isGM) return;
  const actor = _resolveEffectActor(effect);
  if (actor) _scheduleReconcile(actor);
});

Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (!game.user.isGM) return;
  if (!effect.changes?.some(c => c.key.startsWith("faserip.token."))) return;
  const actor = _resolveEffectActor(effect);
  if (actor) _scheduleReconcile(actor);
});

// Stash actor ref before effect deletion (parent may be null after delete)
const _pendingDeleteActors = new Map();
Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  if (!game.user.isGM) return;
  if (!effect.changes?.some(c => c.key?.startsWith("faserip.token."))) return;
  const actor = _resolveEffectActor(effect);
  if (actor) _pendingDeleteActors.set(effect.id, actor);
});

Hooks.on("deleteActiveEffect", (effect, options, userId) => {
  if (!game.user.isGM) return;
  const actor = _pendingDeleteActors.get(effect.id) ?? _resolveEffectActor(effect);
  _pendingDeleteActors.delete(effect.id);
  if (actor) _scheduleReconcile(actor);
});

// Item added/removed from actor (carries effects with it)
Hooks.on("createItem", (item, options, userId) => {
  if (!game.user.isGM) return;
  if (item.actor && item.effects.size) _scheduleReconcile(item.actor);
});

Hooks.on("deleteItem", (item, options, userId) => {
  if (!game.user.isGM) return;
  if (item.actor) _scheduleReconcile(item.actor);
});

// On canvas ready, reconcile all tokens (handles reload/scene switch)
Hooks.on("canvasReady", () => {
  if (!game.user.isGM) return;
  for (const tokenDoc of canvas.scene.tokens) {
    const actor = tokenDoc.actor;
    if (actor) _reconcileTokenEffects(actor);
  }
});

Hooks.once("ready", async () => {
  game.msh ??= {};

  // Register team tracker combat hook for auto-capturing defeated villains
  try {
    import('./teamSheet.js').then(module => {
      module.TeamSheet.registerCombatHook();
      console.log("MSH FASERIP | Team tracker combat hook registered");
    });
  } catch (e) {
    console.warn("MSH FASERIP | Team tracker combat hook failed:", e);
  }

  // SocketLib + GM handlers
  try {
    GMUtils.registerSocket();
    console.log("MSH FASERIP | Socket/GM registered");
  } catch (e) {
    console.warn("MSH FASERIP | Socket/GM registration failed:", e);
  }

  // GM Tools (backup/restore)
  try {
    registerGMTools();
    console.log("MSH FASERIP | GM Tools registered");
  } catch (e) {
    console.warn("MSH FASERIP | GM Tools registration failed:", e);
  }

  // Slam collision handlers (optional, safe)
  try {
    initializeSlamHandlers?.();
    console.log("MSH FASERIP | Slam handlers ready");
  } catch (e) {
    console.warn("MSH FASERIP | Slam handler init failed:", e);
  }

  // Combat Panel button registered via getSceneControlButtons hook (init phase)

  // Fix prototype token overrides - remove disposition keys entirely (even if undefined)
  try {
    const o = game.settings.get("core", "prototypeTokenOverrides");
    const needsFix = "disposition" in (o.hero ?? {}) || 
                     "disposition" in (o.villain ?? {}) || 
                     "disposition" in (o.npc ?? {}) ||
                     "disposition" in (o.vehicle ?? {}) ||
                     "disposition" in (o.base ?? {});
    if (needsFix) {
      const fixed = {
        base: { ...(o.base ?? {}) },
        hero: { ...(o.hero ?? {}) },
        villain: { ...(o.villain ?? {}) },
        npc: { ...(o.npc ?? {}) },
        vehicle: { ...(o.vehicle ?? {}) }
      };
      delete fixed.base.disposition;
      delete fixed.hero.disposition;
      delete fixed.villain.disposition;
      delete fixed.npc.disposition;
      delete fixed.vehicle.disposition;
      await game.settings.set("core", "prototypeTokenOverrides", fixed);
      console.log("[FASERIP] Cleared disposition keys from prototypeTokenOverrides");
    }
  } catch (e) {
    console.warn("[FASERIP WARN] Could not adjust prototypeTokenOverrides:", e);
  }

  // Chat hooks (checks + breaking FEAT)
  try {
    installActionChatHandlers();
  } catch (e) {
    console.warn("MSH FASERIP | Failed to install chat hooks:", e);
  }

  // Manual mode chat listeners
  if (game?.ready) {
    try { ManualModeDialog.setupChatListeners(); } 
    catch (e) { console.warn("Manual toggle setup failed:", e); }
  } else {
    Hooks.on("ready", () => {
      try { ManualModeDialog.setupChatListeners(); }
      catch (e) { console.warn("Manual toggle setup failed:", e); }
    });
  }


  // Auto-open Action HUD if enabled in settings
  if (game.settings.get("msh-faserip", "actionHudEnabled")) {
    try {
      ui.faseripHUD = new FaseripActionPanel();
      ui.faseripHUD.render(true);
      console.log("MSH FASERIP | Action HUD auto-opened");
    } catch (e) {
      console.warn("MSH FASERIP | Failed to auto-open Action HUD:", e);
    }
  }

  // Register macros
  game.msh.macros = {
    quickHeal
  };
  console.log("[FASERIP] Macros registered");

  // ── Regeneration power auto-sync ──────────────────────────────
  // Clean up old/broken AEs, then create missing ones
  if (game.user.isGM) {
    try {
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
      let cleaned = 0;
      let applied = 0;

      for (const actor of Effects.getAllTokenActors()) {
        if (!actor?.items) continue;
        const regenPower = actor.items.find(i =>
          i.type === "power" && /^regenerat/i.test(i.name)
        );

        // Clean up old/broken Regeneration AEs (flags at wrong level from earlier code)
        for (const ef of [...actor.effects]) {
          const scopeFlags = ef.flags?.[scope];
          const isCorrect = scopeFlags?.effectType === "regeneration";
          const isOldBroken = !isCorrect && ef.name?.startsWith("Regeneration") &&
            (ef.statuses?.has?.("regenerating") || "effectType" in (ef.flags || {}));
          const isOrphan = !regenPower && isCorrect;
          if (isOldBroken || isOrphan) {
            await ef.delete({ mshIntentional: true });
            cleaned++;
            console.log(`[FASERIP] Removed ${isOldBroken ? "old-style" : "orphaned"} Regeneration AE from ${actor.name}`);
          }
        }

        if (!regenPower) continue;

        // Already has a correct Regeneration AE?
        const hasAE = actor.effects.some(e =>
          e.flags?.[scope]?.effectType === "regeneration"
        );
        if (hasAE) continue;

        // Create new AE
        const endValue = actor.system?.abilities?.endurance?.value ?? 10;
        await Effects.applyRegeneration(actor, {
          healAmount: endValue,
          cycleTurns: 10,
          powerRank: regenPower.system?.rank || null,
          powerItemId: regenPower.id,
        });
        applied++;
        console.log(`[FASERIP] Auto-created Regeneration AE for ${actor.name}`);
      }
      if (cleaned) console.log(`[FASERIP] Regeneration cleanup: removed ${cleaned} old AE(s)`);
      if (applied) console.log(`[FASERIP] Regeneration auto-sync: created ${applied} AE(s)`);
    } catch (e) {
      console.warn("[FASERIP WARN] Regeneration auto-sync failed:", e);
    }

    // ── Defense power auto-sync ──────────────────────────────────
    // Create missing defense AEs for actors with body armor, force field, or resistance powers
    try {
      const { syncAllDefenseEffects } = await import("./modules/effects/defense-effects.js");
      let defenseSynced = 0;
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";

      for (const actor of Effects.getAllTokenActors()) {
        if (!actor?.items) continue;
        const hasDefensePower = actor.items.some(i =>
          i.type === "power" && (i.system?.isBodyArmor || i.system?.isForceField ||
            (i.system?.isResistance && i.system?.resistanceType))
        );
        if (!hasDefensePower) continue;

        // Check if defense AEs already exist
        const hasDefenseAE = actor.effects.some(e =>
          e.flags?.[scope]?.effectCategory === "defense"
        );
        if (hasDefenseAE) continue;

        await syncAllDefenseEffects(actor);
        defenseSynced++;
      }
      if (defenseSynced) console.log(`[FASERIP] Defense auto-sync: synced ${defenseSynced} actor(s)`);
    } catch (e) {
      console.warn("[FASERIP WARN] Defense auto-sync failed:", e);
    }
  }

  // Migration: strip legacy canAct/canMove/movementMult changes from existing Dying AEs.
  // These were incorrectly added; dying characters above 0 HP can still act (rules p.31).
  // Migration: fix Impaired Endurance AEs that used wrong key system.columnShift instead of
  // system.combatMods.attackShift — the old key was never read during attack resolution.
  if (game.user.isGM) {
    try {
      const DYING_STALE_KEYS = new Set([
        "system.combatMods.canAct",
        "system.combatMods.canMove",
        "system.combatMods.movementMult"
      ]);
      let dyingMigrated = 0;
      let impairedMigrated = 0;
      for (const actor of game.actors) {
        for (const effect of actor.effects) {
          // Dying AE cleanup
          const isDying = effect.flags?.["msh-faserip"]?.effectType === "dying"
            || effect.statuses?.has?.("dying")
            || effect.name === "Dying";
          if (isDying) {
            const stale = (effect.changes || []).filter(c => DYING_STALE_KEYS.has(c.key));
            if (stale.length) {
              const clean = (effect.changes || []).filter(c => !DYING_STALE_KEYS.has(c.key));
              await effect.update({ changes: clean });
              dyingMigrated++;
            }
          }
          // Impaired Endurance key fix
          const isImpaired = effect.flags?.["msh-faserip"]?.isImpairedEndurance;
          if (isImpaired) {
            const needsFix = (effect.changes || []).some(c => c.key === "system.columnShift");
            const hasDuration = effect.duration?.seconds > 0 || effect.duration?.rounds > 0;
            if (needsFix || hasDuration) {
              const updates = {};
              if (needsFix) {
                updates.changes = (effect.changes || []).map(c =>
                  c.key === "system.columnShift"
                    ? { ...c, key: "system.combatMods.attackShift" }
                    : c
                );
              }
              if (hasDuration) {
                updates["duration.seconds"] = null;
                updates["duration.rounds"] = null;
                updates["duration.startTime"] = null;
                updates["duration.startRound"] = null;
              }
              await effect.update(updates);
              impairedMigrated++;
            }
          }
        }
      }
      if (dyingMigrated) console.log(`[FASERIP] Migrated ${dyingMigrated} Dying AE(s): removed stale canAct/canMove/movementMult changes`);
      if (impairedMigrated) console.log(`[FASERIP] Migrated ${impairedMigrated} Impaired Endurance AE(s): fixed columnShift → combatMods.attackShift`);
    } catch (e) {
      console.warn("[FASERIP WARN] AE migration failed:", e);
    }
  }

});

// ── Block CTT/auto-expiry from deleting ongoing engine AEs ──
// CTT's effects-manager and the built-in duration system can try to expire AEs.
// This hook prevents that for Regeneration while allowing intentional
// deletions (stopRegeneration, GM removal, etc).
// Dying AEs are NOT protected here — they have no duration so auto-expiry
// won't fire, and GMs need to be able to delete them from the sheet.
Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
  const effectType = effect.flags?.[scope]?.effectType;

  // Allow intentional deletions (from our own code)
  if (options?.mshIntentional) return;

  // Protect regeneration AEs
  if (effectType === "regeneration") {
    console.log(`[FASERIP] Blocked auto-expiration of Regeneration AE on ${effect.parent?.name}`);
    return false;
  }

  // Protect defense AEs (body armor, force field, resistance)
  if (effect.flags?.[scope]?.effectCategory === "defense") {
    console.log(`[FASERIP] Blocked auto-expiration of defense AE on ${effect.parent?.name}`);
    return false;
  }

  // Protect impaired endurance — managed by rest system, not time expiry
  // But allow expiry on dead/deactivated actors (no point preserving it)
  if (effect.flags?.[scope]?.isImpairedEndurance) {
    const parentActor = effect.parent;
    if (parentActor?.system?.details?.isDead || parentActor?.system?.details?.isDeactivated) {
      return; // allow — actor is dead, let it clean up
    }
    console.log(`[FASERIP] Blocked auto-expiration of Impaired Endurance AE on ${parentActor?.name}`);
    return false;
  }

  // Protect dying AE — managed by processDyingRound, not time expiry
  // But allow deletion if actor is already dead/deactivated (processDyingRound death path)
  if (effect.flags?.[scope]?.isDying || effect.flags?.[scope]?.ongoingId === "dying") {
    const parentActor = effect.parent;
    if (parentActor?.system?.details?.isDead || parentActor?.system?.details?.isDeactivated) {
      return; // allow — actor already dead, clean up the AE
    }
    console.log(`[FASERIP] Blocked auto-expiration of Dying AE on ${parentActor?.name}`);
    return false;
  }
});

// ── Regeneration: sync AEs with power items ──
// ── Power → Ongoing Effect Auto-Sync ──────────────────────────────────────
// When a power item with regenerationType/absorptionType is added, edited,
// or removed from an actor, automatically register/remove the corresponding
// ongoing effect. The player sees the AE in their Effects tab and toggles it.

async function syncPowerOngoingEffects(actor, item, removing = false) {
  if (!game.user.isGM) return;
  if (!actor || actor.documentName !== "Actor") return;
  if (item.type !== "power") return;

  let OngoingEngine;
  try {
    OngoingEngine = await import("./modules/effects/ongoing-engine.js");
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to load ongoing-engine.js for sync:", e);
    return;
  }

  // ── Defense effects sync (body armor, force field, resistance) ──
  try {
    const { syncDefenseEffects } = await import("./modules/effects/defense-effects.js");
    await syncDefenseEffects(actor, item, removing);
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to sync defense effects:", e);
  }

  const regenType = removing ? "" : (item.system?.regenerationType || "");
  const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";

  // ── Regeneration (Resting) ──────────────────────────────────────────
  if (regenType === "rest") {
    // Remove solar if it was previously set
    const hasSolar = actor.effects.some(e => e.flags?.[scope]?.ongoingId === "solarRegeneration");
    if (hasSolar) await OngoingEngine.removeOngoingEffect(actor, "solarRegeneration");

    // Register resting regeneration (skip if already exists)
    const hasRegen = actor.effects.some(e => e.flags?.[scope]?.ongoingId === "regeneration");
    if (!hasRegen) {
      const endValue = actor.system?.abilities?.endurance?.value ?? 10;
      await OngoingEngine.applyRegenerationOngoing(actor, {
        healAmount: endValue,
        cycleTurns: 10,
        powerRank: item.system?.rank || null,
        powerItemId: item.id,
      });
      console.log(`[FASERIP] Regeneration (Resting) auto-registered on ${actor.name}`);
    }

  // ── Regeneration (Solar) ────────────────────────────────────────────
  } else if (regenType === "solar") {
    // Remove resting if it was previously set
    const hasRegen = actor.effects.some(e => e.flags?.[scope]?.ongoingId === "regeneration");
    if (hasRegen) await OngoingEngine.removeOngoingEffect(actor, "regeneration");

    // Register solar regeneration
    const hasSolar = actor.effects.some(e => e.flags?.[scope]?.ongoingId === "solarRegeneration");
    if (!hasSolar) {
      await OngoingEngine.applySolarRegenerationOngoing(actor, {
        powerRank: item.system?.rank || null,
        powerItemId: item.id,
      });
      console.log(`[FASERIP] Solar Regeneration auto-registered on ${actor.name}`);
    }

  // ── None / Removing ─────────────────────────────────────────────────
  } else {
    // Clean up both types
    const hasRegen = actor.effects.some(e => e.flags?.[scope]?.ongoingId === "regeneration");
    const hasSolar = actor.effects.some(e => e.flags?.[scope]?.ongoingId === "solarRegeneration");
    if (hasRegen) {
      await OngoingEngine.removeOngoingEffect(actor, "regeneration");
      console.log(`[FASERIP] Regeneration ongoing removed from ${actor.name}`);
    }
    if (hasSolar) {
      await OngoingEngine.removeOngoingEffect(actor, "solarRegeneration");
      console.log(`[FASERIP] Solar Regeneration ongoing removed from ${actor.name}`);
    }
    // Clean up legacy flags too
    try { await actor.unsetFlag(scope, "regeneration"); } catch (_) {}
  }
}

Hooks.on("createItem", async (item, options, userId) => {
  if (!game.user.isGM) return;
  const actor = item.parent;
  await syncPowerOngoingEffects(actor, item);
});

Hooks.on("updateItem", async (item, changes, options, userId) => {
  if (!game.user.isGM) return;
  const actor = item.parent;
  if (!actor || actor.documentName !== "Actor") return;
  if (item.type !== "power") return;

  // Only re-sync if relevant fields changed
  const relevantChange = changes.system?.regenerationType !== undefined
    || changes.system?.regenerationRate !== undefined
    || changes.system?.rank !== undefined
    || changes.system?.value !== undefined
    || changes.system?.isBodyArmor !== undefined
    || changes.system?.isForceField !== undefined
    || changes.system?.isResistance !== undefined
    || changes.system?.bodyArmorType !== undefined
    || changes.system?.armorNature !== undefined
    || changes.system?.armorUseRankValue !== undefined
    || changes.system?.armorPhysical !== undefined
    || changes.system?.armorEnergy !== undefined
    || changes.system?.resistanceType !== undefined
    || changes.system?.resistanceEffect !== undefined
    || changes.system?.resistanceIsInvulnerability !== undefined
    || changes.system?.forceFieldType !== undefined
    || changes.system?.forceFieldPersonal !== undefined
    || changes.system?.forceFieldCoverage !== undefined;
  if (!relevantChange) return;

  await syncPowerOngoingEffects(actor, item);
});

Hooks.on("deleteItem", async (item, options, userId) => {
  if (!game.user.isGM) return;
  const actor = item.parent;
  await syncPowerOngoingEffects(actor, item, true);
});

// Capture old health value before update
Hooks.on('preUpdateActor', (actor, updateData, options, userId) => {
  if (options.mshDyingTick) return;
  const newHealth = updateData.system?.attributes?.health?.value;
  if (newHealth === undefined) return;
  
  const oldHealth = actor.system.attributes.health.value;
  
  options.healthChange = {
    old: oldHealth,
    new: newHealth
  };
});

// Process damage and start timers
Hooks.on('updateActor', async (actor, updateData, options, userId) => {
  try {
    // --- GM-ONLY GUARD -----------------------------------------
    // Only the GM should run damage/effect logic.
    if (!game.user.isGM) {
      if (game.settings.get("msh-faserip", "debugMode")) {
        console.log("FASERIP | Skipping damage hook on non-GM client", {
          actor: actor.name,
          user: game.user.name
        });
      }
      return;
    }

    // --- DYING TICK GUARD -----------------------------------------
    // Dying only reduces Endurance ranks (not Health). If HP was capped
    // at the new max Health, skip damage processing — this is not combat damage.
    if (options.mshDyingTick) return;
    // -----------------------------------------------------------

    // We prefer explicit healthChange when present (local updates),
    // but remote clients (like the GM when a player caused the change)
    // usually won't see options.healthChange at all.
    let oldHealth, newHealth;

    if (options?.healthChange) {
      ({ old: oldHealth, new: newHealth } = options.healthChange);
    } else {
      // Derive from actor + updateData for remote/replicated updates
      const path = "system.attributes.health.value";

      // If this update didn't touch Health at all, bail out
      const incoming = foundry.utils.getProperty(updateData, path);
      if (incoming === undefined) return;

      oldHealth = Number(foundry.utils.getProperty(actor, path) ?? 0);
      newHealth = Number(incoming ?? 0);

      if (game.settings.get("msh-faserip", "debugMode")) {
        console.log("FASERIP | Derived healthChange for remote update", {
          actor: actor.name,
          user: game.user.name,
          oldHealth,
          newHealth
        });
      }
    }

    // Ignore healing or non-damage changes (including 0->0)
    if (newHealth >= oldHealth && newHealth > 0) {
      // HP went up - clear damage timer so healing cooldown resets
      if (newHealth > oldHealth) {
        const SCOPE = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        await actor.unsetFlag(SCOPE, "lastDamageWorldTime");
        await actor.unsetFlag(SCOPE, "lastDamageTime");
      }
      return;
    }

    // Skip no-op updates where HP was already at/below 0
    // (endurance rank changes from processDyingRound fire updateActor with healthChange:{old:0,new:0})
    if (oldHealth <= 0 && newHealth <= 0) return;


    // DEAD LEGACY CODE START
    // ===== SPECIAL: FLAGGED DAMAGE TO 0 HP TARGET =====
    // This is your "they were already at 0 HP, then got hit again" logic.

/*     const pendingDamage = game.msh._pendingDamageToZeroHP?.[actor.id];
    if (pendingDamage && (Date.now() - pendingDamage.timestamp) < 1000) {
      console.log("FASERIP | Detected damage to 0 HP target - forcing death save");
      delete game.msh._pendingDamageToZeroHP[actor.id];

      const mode = resolveCombatMode(actor) || "manual";
      console.log("FASERIP DEBUG | Combat mode for 0HP repeat hit:", mode);

      if (mode === "full") {
        console.log("FASERIP DEBUG | Full auto mode - triggering death save for unconscious target");
        const { ActionDispatcher } = await import("./modules/actions/action-dispatcher.js");
        await ActionDispatcher.roll("death-save", {
          actor,
          opts: { autoApply: true, showConfirm: false }
        });
        console.log("FASERIP DEBUG | Death save complete for repeat hit");
      } else {
        await ChatMessage.create({
          content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
            <strong>${actor.name}</strong> was hit while unconscious!
            <button class="death-save-button" data-actor-id="${actor.id}">Roll Death Save</button>
          </div>`
        });
      }
      return; // Exit early - don't process as normal damage
    }
 */
    // DEAD LEGACY CODE END

    // ===== THROTTLE DAMAGE TIMER CREATION (1.5s per actor) =====
    const now = Date.now();
    game.msh._lastDamageTimerAt ??= {};
    const lastAt = game.msh._lastDamageTimerAt[actor.id] || 0;

    if ((now - lastAt) < 1500) {
      if (game.settings.get("msh-faserip", "debugMode")) {
        console.log("FASERIP | Throttled damage timer for", actor.name);
      }
      return;
    }
    game.msh._lastDamageTimerAt[actor.id] = now;

    // ===== DEDUPE WITHIN SAME TICK =====
    const damageKey = `damage-${actor.id}-${oldHealth}-${newHealth}`;
    if (game.msh._processingDamage === damageKey) {
      console.log("FASERIP | Skipping duplicate damage processing");
      return;
    }
    game.msh._processingDamage = damageKey;

    console.log("FASERIP | DAMAGE DETECTED", {
      actor: actor.name,
      oldHealth,
      newHealth,
      damage: oldHealth - newHealth
    });

    const currentHealth = Number(newHealth ?? 0);

    // === GAME RULE: Check if at/below 0 HP ===
    if (currentHealth <= 0) {
      // Skip if combat system already handling death save
      if (game.msh?._combatDamageInProgress) {
        console.log(`FASERIP | Skipping init.js death save - combat system handling`);
        // Still mark KO for Recovery guard (fire-and-forget, no await to avoid re-entrant updateActor)
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        actor.setFlag(scope, "wasKnockedOut", true);
        return;
      }
      console.log(`%cFASERIP | !!! ${actor.name} is at ${currentHealth} HP - triggering death save`, 'color: #ef5350; font-weight: bold');

      const mode = resolveCombatMode(actor) || "manual";
      console.log("FASERIP DEBUG | Combat mode resolved to:", mode);

      if (mode === "full") {
        console.log("FASERIP DEBUG | Full auto mode - about to import ActionDispatcher");
        const { ActionDispatcher } = await import("./modules/actions/action-dispatcher.js");
        console.log("FASERIP DEBUG | ActionDispatcher imported, calling roll...");
        await ActionDispatcher.roll("death-save", {
          actor,
          opts: { autoApply: true, showConfirm: false }
        });
        console.log("FASERIP DEBUG | Death save complete");
      } else {
        console.log("FASERIP DEBUG | Manual/semi mode - showing button");
        await ChatMessage.create({
          content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
            <strong>${actor.name}</strong> is at 0 HP!
            <button class="death-save-button" data-actor-id="${actor.id}">Roll Death Save</button>
          </div>`
        });
      }

      console.log("FASERIP | At 0 HP - death save will handle effects");

      // Mark KO for Recovery guard AFTER death save (fire-and-forget to avoid re-entrant updateActor)
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
      actor.setFlag(scope, "wasKnockedOut", true);

      // Still record damage timestamp for rest system
      const { recordDamage } = await import("./modules/rest-system.js");
      await recordDamage(actor);
    } else {
      // === Above 0 HP: record damage for rest system ===
      console.log("FASERIP | Above 0 HP - recording damage for rest eligibility");

      // Clear KO flag — new conscious damage cycle, Recovery is eligible again
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
      if (actor.getFlag(scope, "wasKnockedOut")) {
        await actor.unsetFlag(scope, "wasKnockedOut");
      }

      const { recordDamage } = await import("./modules/rest-system.js");
      await recordDamage(actor);
    }

  } catch (err) {
    console.error("FASERIP | Error in updateActor damage hook:", err);
  } finally {
    // Clear dedupe flag after a brief delay
    // (using the last damageKey in scope)
    if (game.msh?._processingDamage) {
      const keyToClear = game.msh._processingDamage;
      setTimeout(() => {
        if (game.msh._processingDamage === keyToClear) {
          delete game.msh._processingDamage;
        }
      }, 100);
    }
  }
});

// Handle medical care toggle button in chat
Hooks.on('renderChatMessageHTML', (message, htmlEl) => {
  htmlEl.querySelector('.toggle-medical-care')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const actorId = button.dataset.actorId;
    
    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.warn("Actor not found");
      return;
    }
    
    const scope = "msh-faserip";
    const currentCare = actor.getFlag(scope, "medicalCare") || false;
    const newCare = !currentCare;
    
    // Toggle the flag
    await actor.setFlag(scope, "medicalCare", newCare);
    
    // Find active Healing effect
    const healingEffect = actor.effects.find(e => e.flags?.[scope]?.healingTimer);
    
    if (healingEffect) {
      const baseEndurance = healingEffect.flags[scope].baseEndurance || 
                           actor.system.abilities?.endurance?.value || 10;
      const newHealAmount = newCare ? baseEndurance * 2 : baseEndurance;
      const newName = newCare ? "Healing (Medical Care)" : "Healing";
      
      // Update the effect
      await healingEffect.update({
        name: newName,
        [`flags.${scope}.healAmount`]: newHealAmount,
        [`flags.${scope}.medicalCare`]: newCare
      });
      
      // Update the CTT tracker effect if it exists
      const manager = game.msh?.faseripIntegration;
      if (manager?.timeTracker) {
        const trackerEffects = manager.timeTracker.effectsManager.getEffects();
        const trackerEffect = trackerEffects.find(e => 
          e.originalEffectId === healingEffect.id && 
          e.actorId === actor.id
        );
        
        if (trackerEffect) {
          trackerEffect.notes = `Healing ${newHealAmount} HP (${newCare ? 'with' : 'without'} medical care)`;
        }
      }
      
      ui.notifications.info(`Medical care ${newCare ? 'enabled' : 'disabled'} for ${actor.name}`);
      // (Quiet mode) — no chat card spam on toggle
            
            // Disable the button to prevent spam
            button.disabled = true;
            button.style.opacity = '0.6';
            button.innerHTML = '<i class="fas fa-check"></i> Updated!';
          } else {
            ui.notifications.warn("No active Healing timer found");
          }
        });
      });

// Each turn, decrement Endurance one printed rank for actors who are Dying (RAW)
Hooks.on("updateCombat", async (combat, changed, diff, userId) => {
  // GM-only – players don't mutate actors/effects here
  if (!game.user.isGM) return;

  console.debug("[FASERIP DEBUG] updateCombat hook fired", { changed, round: combat.round, turn: combat.turn });
  
  // Only act when the turn actually changes
  if (!("turn" in changed || "round" in changed)) {
    console.debug("[FASERIP DEBUG] Skipping - no turn/round change");
    return;
  }

  // Note: World time advances on round changes (6 seconds per FASERIP turn) via combatRound hook.
  // Individual combatant turn changes within a round do NOT advance time.

  // Dedup guard: track last processed round+turn to prevent duplicate effect processing
  // NOTE: Dying is NOT processed here — it's handled exclusively by the combatRound hook.
  const dyingKey = `${combat.round}-${combat.turn}`;
  const lastDyingKey = combat.getFlag("msh-faserip", "lastDyingProcessed");
  if (lastDyingKey === dyingKey) {
    console.debug("[FASERIP DEBUG] Skipping - dying already processed for this round/turn");
    return;
  }
  await combat.setFlag("msh-faserip", "lastDyingProcessed", dyingKey);

  // Optional CTT sync
  const syncMode = game.settings.get("msh-faserip", "ctt.syncMode");
  try {
    if (syncMode === "turn" && ("turn" in changed || "round" in changed)) {
      Effects.advanceCTTByTurns(1);
    } else if (syncMode === "round" && ("round" in changed)) {
      // Estimate turns per round: number of combatants (fallback 1)
      const turns = Math.max(1, combat.turns?.length ?? combat.combatants.size ?? 1);
      Effects.advanceCTTByTurns(turns);
    }
  } catch (_) { /* no-op */ }

  // Auto-expire round-based and seconds-based effects
  if (combat?.active) {
    const curRound = combat.round ?? 1;
    const worldTime = game.time?.worldTime ?? 0;
    
    for (const c of combat.combatants) {
      const a = c?.actor;
      if (!a) continue;
      
      // Collect effects to delete (avoid modifying collection while iterating)
      const toDelete = [];
      
      for (const ef of a.effects) {
        if (ef.disabled) continue;
        const d = ef.duration ?? {};
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        const efFlags = ef.flags?.[scope] || {};
        
        // Skip ongoing engine effects — they manage their own lifecycle
        // (dying, regeneration, etc. use CTT effectExpired or processDyingRound)
        if (efFlags.ongoingId || efFlags.isDying || efFlags.dyingTimer) continue;
        
        // Check for explicit expiresAtRound flag (used by Evasion Bonus)
        // This takes precedence over duration-based expiration
        if (Number.isFinite(efFlags.expiresAtRound)) {
          if (curRound >= efFlags.expiresAtRound) {
            toDelete.push({ effect: ef, reason: `expired at round ${efFlags.expiresAtRound} (current: ${curRound})` });
          }
          continue;  // Skip duration-based check for effects with explicit expiry
        }
        
        // Handle round-based effects
        if (Number.isFinite(d.rounds) && d.rounds > 0) {
          const startR = d.startRound ?? 0;
          const elapsed = Math.max(0, curRound - startR);
          const remaining = Math.ceil(d.rounds - elapsed);
          
          if (remaining <= 0) {
            toDelete.push({ effect: ef, reason: `0 rounds remaining (${d.rounds} rounds, started round ${startR})` });
          }
        }
        
        // Handle seconds-based effects (world time)
        else if (Number.isFinite(d.seconds) && d.seconds > 0) {
          const startT = d.startTime ?? 0;
          const endTime = startT + d.seconds;
          const remaining = endTime - worldTime;
          
          if (remaining <= 0) {
            toDelete.push({ effect: ef, reason: `time expired (${d.seconds}s duration)` });
          }
        }
      }
      
      // Delete expired effects
      for (const { effect, reason } of toDelete) {
        console.log(`[FASERIP] Auto-expiring effect "${effect.name}" on ${a.name}: ${reason}`);
        
        // Check if this is an Unconscious effect from death save (0 HP knockout)
        // If so, restore health to Endurance rank value when waking up
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        const isFromDeathSave = effect.getFlag(scope, "fromDeathSave") || 
                                (effect.getFlag(scope, "zeroHealth") && effect.getFlag(scope, "isUnconscious"));
        const isDying = a.effects.some(e => e.getFlag(scope, "isDying"));
        
        if (isFromDeathSave && !isDying) {
          // Character is waking up from 0 HP knockout (not dying)
          // Restore health to Endurance rank value
          const enduranceValue = a.system?.abilities?.endurance?.value || 8;
          const currentHealth = a.system?.attributes?.health?.value || 0;
          
          console.log(`[FASERIP] ${a.name} waking up from knockout - restoring health to Endurance value (${enduranceValue})`);
          
          try {
            await a.update({ "system.attributes.health.value": enduranceValue });
            
            // Post wake-up message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: a }),
              content: `<div style="background:#e3f2fd;border:1px solid #90caf9;padding:8px;border-radius:3px;">
                <strong>${a.name}</strong> regains consciousness!
                <div style="margin-top:4px;font-size:.9em;color:#666;">Health restored to ${enduranceValue} (Endurance rank value).</div>
              </div>`
            });
          } catch (err) {
            console.error(`[FASERIP ERROR] Failed to restore health for ${a.name}:`, err);
          }
        }
        
        try { 
          await effect.delete(); 
        } catch (e) { 
          console.warn("[FASERIP WARN] AE auto-expire failed", e); 
        }
      }
    }
  }

  // Refresh labels for round-based effects on all combatants
  for (const c of combat.combatants) {
    const a = c.actor;
    if (!a) continue;
    for (const eff of a.effects) {
      if (eff?.duration?.rounds && eff?.id) {  // ← ADD: && eff?.id
        try {
          await Effects.renameEffectWithRemaining(eff);
        } catch (e) {
          console.warn("Failed to rename effect:", e);
        }
      }
    }
  }

  // FASERIP Time Tracker sync
  /* if (game.user.isGM) {
    const syncEnabled = game.settings.get("msh-faserip", "combatSyncEnabled");
    if (syncEnabled && ("turn" in changed || "round" in changed)) {
      let secondsChange = 0;
      
      if ("turn" in changed) {
        const oldTurn = combat.previous?.turn ?? 0;
        const newTurn = combat.turn;
        const turnDiff = newTurn - oldTurn;
        secondsChange = turnDiff * 6;
      } else if ("round" in changed && !("turn" in changed)) {
        const oldRound = combat.previous?.round ?? 0;
        const newRound = combat.round;
        const roundDiff = newRound - oldRound;
        const turnsPerRound = combat.turns?.length || 1;
        secondsChange = roundDiff * turnsPerRound * 6;
      }
      
      if (secondsChange !== 0) {
        const currentElapsed = game.settings.get("msh-faserip", "elapsedSeconds") || 0;
        const newElapsed = Math.max(0, currentElapsed + secondsChange);
        await game.settings.set("msh-faserip", "elapsedSeconds", newElapsed);
        console.log(`[FASERIP] Time tracker synced: ${secondsChange > 0 ? '+' : ''}${secondsChange} seconds`);
        
        // Trigger hook to update any open team sheets
        Hooks.callAll("msh-faserip.timeUpdated", newElapsed);
      }
    }
  } */

  const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";

  // DYING: Handled by combatRound hook (fires once per Foundry round = 1 FASERIP turn).
  // processDyingRound is called there for each dying actor, ensuring exactly 1 rank loss
  // per round regardless of how many combatant turns exist within a Foundry round.

  // Check for Recovery/Healing timers
  
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    
    // Check Recovery timers
    const recoveryEffect = actor.effects.find(e => 
      e.flags?.[scope]?.recoveryTimer && 
      e.flags?.[scope]?.fallbackMode === "combat"
    );
    
    if (recoveryEffect) {
      const turnsRemaining = recoveryEffect.getFlag(scope, "turnsRemaining") || 0;
      const newRemaining = turnsRemaining - 1;
      
      if (newRemaining <= 0) {
        // Recovery complete
        const flags = recoveryEffect.flags[scope];
        const manager = game.msh?.faseripIntegration?.recoveryManager;
        if (manager) {
          await manager.completeRecovery(actor, flags);
          await actor.deleteEmbeddedDocuments("ActiveEffect", [recoveryEffect.id]);
        }
      } else {
        await recoveryEffect.setFlag(scope, "turnsRemaining", newRemaining);
        await recoveryEffect.update({ name: `Recovery Timer (${newRemaining} turns)` });
      }
    }
    
    // Check Healing timers
    const healingEffect = actor.effects.find(e => 
      e.flags?.[scope]?.healingTimer && 
      e.flags?.[scope]?.fallbackMode === "combat"
    );
    
    if (healingEffect) {
      const turnsRemaining = healingEffect.getFlag(scope, "turnsRemaining") || 0;
      const newRemaining = turnsRemaining - 1;
      
      if (newRemaining <= 0) {
        // Healing complete
        const flags = healingEffect.flags[scope];
        const manager = game.msh?.faseripIntegration?.recoveryManager;
        if (manager) {
          await manager.completeHealing(actor, flags);
          await actor.deleteEmbeddedDocuments("ActiveEffect", [healingEffect.id]);
        }
      } else {
        await healingEffect.setFlag(scope, "turnsRemaining", newRemaining);
        await healingEffect.update({ name: `${healingEffect.name.split('(')[0].trim()} (${newRemaining} turns)` });
      }
    }
  }
});

// Add the hotbarDrop hook at module level (like in the older file)
Hooks.on('hotbarDrop', (bar, data, slot) => {  // Remove async
  console.debug("[FASERIP DEBUG] hotbarDrop received:", data);
  
  if (data.type === "FaseripItem" && data.actorId) {  // Changed from "Item"
    createFaseripItemMacro(data, slot).catch(err => {
      console.error("Error creating FASERIP macro:", err);
    });
    return false; // Returns immediately
  }
  else if (data.type === "UniversalTable" && data.actorId) {
    createUniversalTableMacro(data, slot).catch(err => {
      console.error("Error creating UniversalTable macro:", err);
    });
    return false;
  }
  else if (data.type === "UniversalAction" && data.actionCode) {
    createUniversalActionMacro(data, slot).catch(err => {
      console.error("Error creating UniversalAction macro:", err);
    });
    return false;
  }
  
  return true;
});

// Define the function to create a macro (supports token/unlinked + actor sheets)
async function createFaseripItemMacro(data, slot) {
  // Resolve via UUID first (covers Scene.Token.Actor.Item for unlinked tokens)
  let item = null, actor = null;

  if (data?.uuid) {
    try {
      const doc = await fromUuid(data.uuid);
      if (doc?.documentName === "Item") {
        item = doc;
        actor = doc.parent ?? null;
      } else if (doc?.documentName === "Token") {
        actor = doc.actor ?? null;
        if (actor && data.itemId) item = actor.items.get(data.itemId) ?? null;
      }
    } catch (e) {
      console.warn("fromUuid failed for hotbarDrop:", data.uuid, e);
    }
  }

  // Fallback to actorId/itemId (dragged from Actor directory sheet)
  if (!item) {
    actor = actor ?? (data.actorId ? game.actors.get(data.actorId) : null);
    if (!actor) return ui.notifications.warn("Actor not found");
    item = data.itemId ? actor.items.get(data.itemId) : null;
  }
  if (!item) return ui.notifications.warn("Item not found on actor");
  if (!actor) actor = item.parent ?? null;

  console.log(`Creating macro for ${item.name} (${actor?.name ?? "Unknown"})`);

  // Build a UUID-based macro so it also works later from the hotbar
  const command = `// ${item.name} Macro
    (async () => {
      const item = await fromUuid("${item.uuid}");
      if (!item) return ui.notifications.error("Missing item: ${item.name}");
      const actor = item.parent;
      if (!actor) return ui.notifications.error("No parent actor for item: ${item.name}");

      const system = item.system || {};

      switch (item.type) {
        case "power": {
          const category     = system.category || "";
          const requiresSave = !!system.requiresSave;
          const saveAbility  = (system.save && system.save.ability) || system.saveAbility || null;
          const damageType   = system.damageType || null;

          const isMental =
            category === "mentalPowers" ||
            requiresSave ||
            saveAbility === "psyche" ||
            saveAbility === "intuition" ||
            damageType === "mental";

          if (isMental) {
            // Mental / save-based powers: skip to-hit, go straight to saves
            await game.msh.actions.roll("mental-power", {
              actor,
              abilityName: undefined,
              opts: { itemId: item.id, item }
            });
          } else {
            // Regular attack powers: route to energy/force actions like the sheet
            const actionType = system.attackType === "force" ? "force" : "energy";

            await game.msh.actions.roll(actionType, {
              actor,
              abilityName: "agility",   // Powers use Agility to hit
              opts: { itemId: item.id, item }
            });
          }
          break;
        }

        case "talent":
          game.msh.rollTalent(actor, item);
          break;

        case "equipment": {
          // Gear with transferable effects: toggle on/off instead of rolling
          const transferEffects = item.effects.filter(e => e.transfer);
          if (transferEffects.length && ["gear", "custom"].includes(system.category)) {
            const anyActive = transferEffects.some(e => !e.disabled);
            const updates = transferEffects.map(e => ({ _id: e.id, disabled: anyActive }));
            await item.updateEmbeddedDocuments("ActiveEffect", updates);
            const state = anyActive ? "OFF" : "ON";
            ChatMessage.create({
              content: \`<div class="faserip-chat-card"><strong>\${actor.name}</strong> turns <strong>\${state}</strong>: \${item.name}</div>\`,
              speaker: ChatMessage.getSpeaker({ actor })
            });
          } else {
            game.msh.rollEquipment(actor, item);
          }
          break;
        }

        default:
          ui.notifications.warn("Cannot roll item type: " + item.type);
      }
    })();`;

    const macroName = `${item.name} (${actor?.name ?? "Actor"})`;
    let macro = game.macros.find(m => m.name === macroName && m.flags?.["faserip.itemMacro"]);
    if (!macro) {
      const macroData = {
        name: macroName,
        type: "script",
        img: item.img || "icons/svg/item-bag.svg",
        command,
        flags: { "faserip.itemMacro": true }
      };
      
      // Use socket for non-GM users to create macro via GM
      if (!game.user.isGM && game.msh?.runAsGM) {
        await game.msh.runAsGM({
          operation: "createMacro",
          macroData,
          slot,
          userId: game.user.id
        });
        ui.notifications.info(`Created macro: ${macroName}`);
        return true;
      } else {
        macro = await Macro.create({
          ...macroData,
          ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
        });
      }
    }
    await game.user.assignHotbarMacro(macro, slot);
    ui.notifications.info(`Created macro: ${macroName}`);
    return true;
  }


// Define the function to create a Universal Table macro
async function createUniversalTableMacro(data, slot) {
  // Get reference to our Actor
  const actor = game.actors.get(data.actorId);
  if (!actor) return ui.notifications.warn("Actor not found");
  
  console.log(`Creating Universal Table macro for ${actor.name}`);
  
  // Create a command string that calls the openUniversalTableDialog function
  const command = `game.msh.openUniversalTableDialog(game.actors.get("${data.actorId}"));`;
  
  // Create the macro
  const macroName = `Universal Table (${actor.name})`;
  let macro = game.macros.find(m => m.name === macroName && m.command === command);
  
  if (!macro) {
    const macroData = {
      name: macroName,
      type: "script",
      img: data.data?.img || "icons/svg/d20-grey.svg", 
      command: command,
      flags: {"faserip.universalTableMacro": true}
    };
    
    // Use socket for non-GM users to create macro via GM
    if (!game.user.isGM && game.msh?.runAsGM) {
      await game.msh.runAsGM({
        operation: "createMacro",
        macroData,
        slot,
        userId: game.user.id
      });
      return true;
    } else {
      macro = await Macro.create({
        ...macroData,
        ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
      });
    }
  }
  
  // Assign to hotbar slot
  game.user.assignHotbarMacro(macro, slot);
  return true;
}

// Generate colored action button icon matching HUD appearance
function generateActionIcon(actionCode, label, bgColor, fgColor) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(8, 8, 112, 112);
    
    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 112, 112);
    
    // Label text
    ctx.fillStyle = fgColor;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 64);
    
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn("Icon generation failed:", err);
    return "icons/svg/combat.svg"; // Fallback
  }
}

async function createUniversalActionMacro(data, slot) {
  const { actionCode, actionName, actorId, actorName, iconName } = data;
  
  // CHECK THE SETTING!
  const actor = game.actors.get(actorId);
  const mode = game.msh.getCombatModeFor(actor);
  
  // Define ability mapping
  const abilityMap = {
    "blunt-attack": "fighting", "edged-attack": "fighting", "shooting": "agility",
    "throwing-edged": "agility", "throwing-blunt": "agility", "energy": "agility",
    "force": "agility", "grappling": "strength", "grabbing": "strength",
    "escaping": "strength", "charging": "endurance", "dodging": "agility",
    "evading": "fighting", "blocking": "strength", "catching": "agility",
    "stun": "endurance", "slam": "endurance", "kill": "endurance"
  };
  
  const abilityName = abilityMap[actionCode] || "fighting";
  
  // CREATE DIFFERENT MACRO BASED ON SETTING
  const command = `// Universal Action Macro
    (async () => {
      const actor = game.user.character || canvas.tokens.controlled[0]?.actor || game.actors.get("${actorId}");
      if (!actor) return ui.notifications.warn("Select a token or assign a character first.");

      const savedCS = await actor.getFlag("msh-faserip", "cs_${actionCode}") || 0;
      const savedKarma = await actor.getFlag("msh-faserip", "karma_${actionCode}") || 0;

      if (game.msh?.actions?.roll) {
        await game.msh.actions.roll("${actionCode}", {
          actor,
          abilityName: "${abilityName}",
          opts: { shift: savedCS, karma: savedKarma }
        });
      } else if (game.msh?.rollUniversalAction) {
        game.msh.rollUniversalAction("${actionCode}", actor.id, savedCS, savedKarma);
      } else {
        ui.notifications.error("No action entrypoint found.");
      }
    })();`;

  const macroName = `${actionName} (${actorName})`;
  let macro = game.macros.find(m => m.name === macroName && m.command === command);
  
  if (!macro) {
    // Map action codes to icon filenames in assets/icons/actions/
    const ACTION_ICONS = {
      "blunt-attack": "blunt",
      "edged-attack": "edged",
      "shooting": "shooting",
      "throwing-edged": "thrown",
      "throwing-blunt": "thrown_blunt",
      "energy": "energy",
      "force": "force",
      "grappling": "grapple",
      "grabbing": "grab",
      "escaping": "escape",
      "charging": "charge",
      "dodging": "dodge",
      "evading": "evade",
      "blocking": "block",
      "catching": "catch",
      "stun": "stun",
      "slam": "slam",
      "kill": "kill"
    };
    
    const iconName = ACTION_ICONS[actionCode] || "dice-target";
    const img = `systems/msh-faserip/assets/icons/actions/${iconName}.png`;
    
    const macroData = {
      name: macroName,
      type: "script",
      command: command,
      img: img,
      flags: {"faserip.universalActionMacro": true}
    };
    
    // Use socket for non-GM users to create macro via GM
    if (!game.user.isGM && game.msh?.runAsGM) {
      await game.msh.runAsGM({
        operation: "createMacro",
        macroData,
        slot,
        userId: game.user.id
      });
      return true;
    } else {
      macro = await Macro.create({
        ...macroData,
        ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
      });
    }
  }
  
  game.user.assignHotbarMacro(macro, slot);
  return true;
}