// In init.js
import * as GMUtils from './gm-utils.js';
import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';
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
import { FaseripActionHUD } from './action-hud.js';
import { debugLog } from './modules/actions/action-utils.js';
import { playCombatSFX } from "./modules/actions/audio-utils.js";
import { ActionDispatcher } from './modules/actions/action-dispatcher.js';
import { ManualModeDialog } from './modules/actions/manual-mode-dialog.js';
import * as Effects from "./modules/effects/effect-engine.js";
//import { MSHVehicleActor } from "./modules/actors/vehicle-actor.js";
//import { MSHVehicleActorSheet } from "./modules/sheets/vehicle-actor-sheet.js";
import { MSHVehicleActorSheet } from "./vehicle-actor-sheet.js";
import { resolveCombatMode } from "./modules/actions/action-dispatcher.js";
import { initRestSystem } from "./modules/rest-system.js";

// Create global instance
game.msh = game.msh || {};
//game.msh.fallbackTimers = new FallbackTimerManager();

Hooks.once("init", async () => {
  // ---- Canonical flag scope + shim ----------------------------------------
  // System-scoped flags go under your real system id.
  globalThis.MSH_FLAG_SCOPE = game.system?.id || "msh-faserip";

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

  debugLog("init hook is running!");
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  // Initialize the game.msh namespace early
  game.msh = game.msh || {};
  game.msh.playCombatSFX = playCombatSFX;

  game.msh.FaseripActorSheet = FaseripActorSheet;

  CONFIG.FASERIP = CONFIG.FASERIP || {};

  game.settings.register("msh-faserip", "combatMode", {
    name: "Combat Mode",
    hint: "Choose between Classic (automated) and Refactor (manual control).",
    scope: "world",
    config: true,
    type: String,
    choices: {
    classic:  "Classic (Automated)",
    manual:   "Manual",
    semi:     "Semi-auto (Preview/Confirm)",
    auto:     "Full auto"
  },
  default: "semi"
  });

  // Helper: resolve mode (per-actor flag > world)
  game.msh.getCombatModeFor = function(actor) {
    const actorPref = actor?.getFlag?.("msh-faserip", "combatModeOverride");
    return actorPref || game.settings.get("msh-faserip", "combatMode") || "semi";
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
      console.debug("[FASERIP] preCreateActiveEffect: SKIP conversion (combat active)");
      return;
    }

    // Back-compat for sheets/modules: ensure BOTH fields exist.
    if (data?.img  && !data?.icon) data.icon = data.img;
    if (data?.icon && !data?.img)  data.img  = data.icon;

    // Core doesn't have impact.svg; remap to a safe built-in.
    if (data?.img === "icons/svg/impact.svg" || data?.icon === "icons/svg/impact.svg") {
      data.img = data.icon = "icons/svg/target.svg";
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

      // 7) Debug log (if you have the setting)
      try {
        if (game.settings && typeof game.settings.get === "function" &&
            game.settings.get("msh-faserip", "debugMode")) {
          var nm = (data && data.name) ? data.name : (effect && effect.name ? effect.name : "(unnamed)");
          console.log("[FASERIP] preCreateActiveEffect:",
            safeRounds, "round(s) ->", seconds + "s", "(turn=" + secPerTurn + "s)", nm);
        }
      } catch (e2) { /* ignore */ }

    } catch (err) {
      console.warn("FASERIP preCreateActiveEffect conversion failed:", err);
    }
  });

  // Delete round-based effects when they hit 0 remaining (safety net for custom flows)
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!("round" in changes) && !("turn" in changes)) return;    // only when advancing
    if (!combat?.active) return;

    const curRound = combat.round ?? 1;

    for (const c of combat.combatants) {
      const a = c?.actor; if (!a) continue;

      for (const ef of a.effects) {
        const d = ef.duration ?? {};
        if (!Number.isFinite(d.rounds)) continue;                 // only timed-by-rounds

        // Respect only this combat's lifecycle if startRound was stamped during this combat.
        // (If you stamp a "combat id" flag yourself elsewhere, check it here.)
        const startR = d.startRound ?? curRound;
        const elapsed = Math.max(0, curRound - startR);
        const remaining = Math.ceil((d.rounds ?? 0) - elapsed);

        if (remaining <= 0 && !ef.disabled) {
          try { await ef.delete(); } catch (e) { console.warn("AE auto-expire failed", e); }
        }
      }
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
    if (changes?.img  && !changes?.icon) changes.icon = changes.img;
    if (changes?.icon && !changes?.img)  changes.img  = changes.icon;
    if (changes?.img === "icons/svg/impact.svg" || changes?.icon === "icons/svg/impact.svg") {
      changes.img = changes.icon = "icons/svg/target.svg";
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
        ui.faseripHUD.bringToTop();
      } else {
        ui.faseripHUD = new FaseripActionHUD();
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

    // 5. Assign the reconstructed tools-object back onto tokenGroup.tools
    tokenGroup.tools = existingToolsObj;

    console.log("FASERIP | tokenGroup.tools has been rebuilt:", tokenGroup.tools);
  });

  // <-- NEW/MODIFIED SECTION START -->
  // Register system settings


  game.settings.register('msh-faserip', 'dailyKarmaEnabled', {
    name: "Enable Daily Karma",
    hint: "If enabled, characters gain temporary Karma equal to their Reason+Intuition+Psyche at the start of each session, used before their lifetime Karma pool.",
    scope: "world", // Can be 'world' or 'client'
    config: true,   // Show in system settings UI
    type: Boolean,  // Use the JavaScript Boolean class, not a string "Boolean"
    default: false, // Default value
  });

  game.settings.register('msh-faserip', 'maxStunDuration', {
    name: "Maximum Stun Duration",
    hint: "House rule: Cap the maximum rounds a character can be stunned (White result on Stun check rolls 1d10). Set to 10 for RAW, or lower (e.g., 3-5) to keep combats moving.",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: {
      min: 1,
      max: 10,
      step: 1
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

  console.log("FASERIP DEBUG: dailyKarmaEnabled setting registered."); // <-- DEBUG CONSOLE LOG
  // <-- NEW/MODIFIED SECTION END -->

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

    debugLog("FASERIP DEBUG: Team settings registered.");

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
  // Add the rollUniversalTable function to the namespace
  game.msh.rollUniversalTable = rollUniversalTable;

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
  // Anchor: expose legacy handler only in classic mode
  if (game.msh?.getCombatModeFor?.() !== "classic") {
    // Do not expose CombatHandler in refactor modes
    delete game.msh.CombatHandler;
  }

  // Add the Action HUD to the namespace
  game.msh.FaseripActionHUD = FaseripActionHUD;  // <-- ADD THIS LINE

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
    
    FaseripInitiative.rollSideInitiative(game.combat);
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

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);

  Actors.registerSheet("msh-faserip", FaseripActorSheet, {
    types: ["hero", "villain", "npc"],
    makeDefault: true
  });
  
  // Make sure to register vehicle items with FaseripItemSheet
  Items.registerSheet("msh-faserip", FaseripItemSheet, { 
    types: ["power", "talent", "contact", "headquarters", "vehicle"],
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

  // end of hooks.once
});

Hooks.on("preCreateActor", (document, data, options, userId) => {
  console.log("FASERIP: preCreateActor - Type:", document.type);
  console.log("FASERIP: preCreateActor - Data before fix:", data?.prototypeToken);

  // Ensure prototypeToken object exists
  data.prototypeToken ??= {};
  const pt = data.prototypeToken;

  // --- Disposition defaults by actor type ---
  switch (document.type) {
    case "hero":
      pt.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY; // 1
      console.log("FASERIP: Forcing hero disposition to FRIENDLY (1)");
      break;
    case "villain":
      pt.disposition = CONST.TOKEN_DISPOSITIONS.HOSTILE; // -1
      console.log("FASERIP: Forcing villain disposition to HOSTILE (-1)");
      break;
    case "vehicle":
      // If a value was already provided (e.g., via import), keep it; else default to NEUTRAL.
      pt.disposition ??= CONST.TOKEN_DISPOSITIONS.NEUTRAL; // 0
      console.log("FASERIP: Defaulting vehicle disposition to NEUTRAL (0)");
      // --- Vehicle-specific token defaults (only if not already set) ---
      pt.lockRotation ??= true;              // vehicles usually don't rotate freely
      pt.width ??= 2;                        // tweak to your grid scale
      pt.height ??= 2;
      pt.bar1 ??= {};
      pt.bar1.attribute ??= "system.resources.body"; // Body HP bar
      break;
    case "npc":
    default:
      pt.disposition = CONST.TOKEN_DISPOSITIONS.NEUTRAL; // 0
      console.log("FASERIP: Forcing NPC disposition to NEUTRAL (0)");
      break;
  }

  console.log("FASERIP: preCreateActor - Data after fix:", data.prototypeToken);
});


// CONSOLIDATED READY HOOK - All ready logic in one place
Hooks.once("ready", async () => {
  game.msh ??= {};

  // SocketLib + GM handlers
  try {
    GMUtils.registerSocket();
    console.log("MSH FASERIP | Socket/GM registered");
  } catch (e) {
    console.warn("MSH FASERIP | Socket/GM registration failed:", e);
  }

  // Slam collision handlers (optional, safe)
  try {
    initializeSlamHandlers?.();
    console.log("MSH FASERIP | Slam handlers ready");
  } catch (e) {
    console.warn("MSH FASERIP | Slam handler init failed:", e);
  }

  // Fix prototype token overrides (only if needed)
  try {
    const o = game.settings.get("core", "prototypeTokenOverrides") ?? {};
    const needsFix = o.hero?.disposition !== undefined || o.villain?.disposition !== undefined || o.npc?.disposition !== undefined;
    if (needsFix) {
      const fixed = {
        base: o.base ?? {},
        hero: { ...(o.hero ?? {}) },
        villain: { ...(o.villain ?? {}) },
        npc: { ...(o.npc ?? {}) }
      };
      delete fixed.hero.disposition;
      delete fixed.villain.disposition;
      delete fixed.npc.disposition;
      await game.settings.set("core", "prototypeTokenOverrides", fixed);
      console.log("MSH FASERIP | Cleared disposition overrides");
    }
  } catch (e) {
    console.warn("MSH FASERIP | Could not adjust prototypeTokenOverrides:", e);
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


  // Auto-open Action HUD
  try {
    ui.faseripHUD = new FaseripActionHUD();
    ui.faseripHUD.render(true);
    console.log("MSH FASERIP | Action HUD auto-opened");
  } catch (e) {
    console.warn("MSH FASERIP | Failed to auto-open Action HUD:", e);
  }

});

// Capture old health value before update
Hooks.on('preUpdateActor', (actor, updateData, options, userId) => {
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
  // ===== ADD THIS CHECK FIRST =====
  // Check for flagged damage to 0 HP target
  const pendingDamage = game.msh._pendingDamageToZeroHP?.[actor.id];
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
      ChatMessage.create({
        content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
          <strong>${actor.name}</strong> was hit while unconscious!
          <button class="death-save-button" data-actor-id="${actor.id}">Roll Death Save</button>
        </div>`
      });
    }
    return; // Exit early - don't process as normal damage
  }
  // ===== END NEW CHECK =====
  
  if (!options.healthChange) return;
  
  const { old: oldHealth, new: newHealth } = options.healthChange;
  
  // Process damage OR if at/below 0 HP (for repeated attacks on unconscious characters)
  if (newHealth >= oldHealth && newHealth > 0) return;

  // Respect setting: skip auto Recovery/Healing timers
  if (!game.settings.get("msh-faserip", "effects.autoDamageTimers")) {
    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log("FASERIP | Auto damage timers disabled");
    }
    return;
  }

  // Throttle repeated damage timer creation per actor (1.5s)
  const now = Date.now();
  game.msh._lastDamageTimerAt ??= {};
  if ((now - (game.msh._lastDamageTimerAt[actor.id] || 0)) < 1500) {
    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log("FASERIP | Throttled damage timer for", actor.name);
    }
    return;
  }
  game.msh._lastDamageTimerAt[actor.id] = now;
  
  // CRITICAL: Only process if we own the actor OR we're the GM
  if (!game.user.isGM && !actor.isOwner) {
    console.log("FASERIP | Skipping - not owner and not GM");
    return;
  }
  
  // Prevent duplicate calls within same tick
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
  
  try {
    const currentHealth = Number(newHealth ?? 0);
    const maxHealth = Number(actor.system?.attributes?.health?.max ?? 0);
    const enduranceValue = Number(actor.system?.abilities?.endurance?.value ?? 10);

    // === GAME RULE: Check if at/below 0 HP ===
    if (currentHealth <= 0) {
      console.log(`⚠️ FASERIP | ${actor.name} is at ${currentHealth} HP - triggering death save`);
      
      console.log(`⚠️ FASERIP | ${actor.name} is at ${currentHealth} HP - triggering death save`);

      // Auto-trigger death save in full mode
      //const mode = game.msh?.resolveCombatMode?.(actor) || "manual";
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
        // Manual/semi mode: show button
        ChatMessage.create({
          content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
            <strong>${actor.name}</strong> is at 0 HP!
            <button class="death-save-button" data-actor-id="${actor.id}">Roll Death Save</button>
          </div>`
        });
      }
      
      // DO NOT start recovery/healing timers at 0 HP
      // Death save handles unconsciousness/dying effects
      console.log("FASERIP | At 0 HP - death save will handle effects");
      
   } else {
      // === GAME RULE: Above 0 HP - start recovery/healing ===
      console.log("FASERIP | Above 0 HP - starting recovery/healing timers");
      
      // Try CTT integration first, fallback to combat-based timers
      const manager = game.msh?.faseripIntegration?.recoveryManager;
      if (manager && game.modules.get('calendar-time-tracker')?.active) {
        console.log("FASERIP | Using CTT for timer tracking");
        await manager.startRecoveryTimer(actor, currentHealth, maxHealth, enduranceValue);
        await manager.startHealingTimer(actor, currentHealth, maxHealth, enduranceValue);
      } else {
        console.log("FASERIP | Using fallback combat-based timers");
        await game.msh.fallbackTimers.startRecoveryTimer(actor, currentHealth, maxHealth, enduranceValue);
        await game.msh.fallbackTimers.startHealingTimer(actor, currentHealth, maxHealth, enduranceValue);
      }
    }
    
  } finally {
    // Clear flag after a brief delay
    setTimeout(() => {
      if (game.msh._processingDamage === damageKey) {
        delete game.msh._processingDamage;
      }
    }, 100);
  }
});

// Handle medical care toggle button in chat
Hooks.on('renderChatMessage', (message, html) => {
  html.find('.toggle-medical-care').click(async (event) => {
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
            $(button).prop('disabled', true)
                    .css('opacity', '0.6')
                    .html('<i class="fas fa-check"></i> Updated!');
          } else {
            ui.notifications.warn("No active Healing timer found");
          }
        });
      });

// Each turn, decrement Endurance one printed rank for actors who are Dying (RAW)
Hooks.on("updateCombat", async (combat, changed, diff, userId) => {
  console.log("🔄 FASERIP | updateCombat hook fired", { changed, round: combat.round, turn: combat.turn });
  
  // Only act when the turn actually changes
  if (!("turn" in changed || "round" in changed)) {
    console.log("⏭️ FASERIP | Skipping - no turn/round change");
    return;
  }

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

  // Refresh labels for round-based effects on all combatants
  for (const c of combat.combatants) {
    const a = c.actor;
    if (!a) continue;
    for (const eff of a.effects) {
      if (eff?.duration?.rounds) {
        await Effects.renameEffectWithRemaining(eff);
      }
    }
  }

  const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
  console.log("🔍 FASERIP | Checking all combatants for Dying effects...");

  // Check ALL combatants for dying effects, not just the current one
  let dyingCount = 0;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) {
      console.log("⚠️ FASERIP | Combatant has no actor:", combatant.name);
      continue;
    }

    // Identify "Dying" state via either status effect or flags
    const dyingEffect = actor.effects.find(e =>
      e.getFlag(scope, "isDying") || e.statuses?.has?.("dying")
    );
    
    if (!dyingEffect) continue;
    
    dyingCount++;
    console.log(`💀 FASERIP | Found Dying effect on ${actor.name}`, {
      effectName: dyingEffect.name,
      effectId: dyingEffect.id,
      flags: dyingEffect.flags[scope]
    });

    // Pause 1 round if stabilized
    const stabilizedRounds = dyingEffect.getFlag(scope, "stabilizedRounds") || 0;
    if (stabilizedRounds > 0) {
      console.log(`⏸️ FASERIP | ${actor.name} is stabilized for ${stabilizedRounds} more rounds`);
      await dyingEffect.setFlag(scope, "stabilizedRounds", stabilizedRounds - 1);
      continue;
    }

    // Drop Endurance by one printed rank
      const curName  = game.msh.getEnduranceRankName(actor);
      const nextName = game.msh.nextLowerRankName(curName);

    // Calculate the numeric value for the new rank - ADD THIS BEFORE THE TRY BLOCK
    const nextValue = game.msh.getRankValue(nextName) || 0;

    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log(`📉 FASERIP | ${actor.name} Endurance: ${curName} → ${nextName} (${nextValue})`);
    }

    // line moved - right after the nextValue calculation and BEFORE the try block:
    const originalRank = dyingEffect.getFlag(scope, "originalEndurance") || curName;

    // Update the actor's printed rank AND value
    try {
      await actor.update({
        "system.abilities.endurance.rank": nextName,
        "system.abilities.endurance.value": nextValue
      });

      // Create Impaired Endurance effect
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
      let impairedEffect = actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));

      if (!impairedEffect) {
        // First rank loss - create the effect
        const hasMedicalCare = actor.getFlag(scope, "medicalCare") ?? false;
        const daysUntilHealing = hasMedicalCare ? 1 : 7;
        
        await actor.createEmbeddedDocuments("ActiveEffect", [{
          name: `Impaired Endurance (${nextName} of ${originalRank})`,
          icon: "icons/svg/blood.svg",
          origin: actor.uuid,
          statuses: ["impaired-endurance"],
          flags: {
            [scope]: {
              isImpairedEndurance: true,
              originalEndurance: originalRank,
              currentEndurance: nextName,
              lastHealed: Date.now(),
              medicalCare: hasMedicalCare
            },
            core: { statusId: "impaired-endurance" }
          },
          duration: {
            rounds: daysUntilHealing * 600 * 24,
            startRound: game.combat?.round || 0
          },
          changes: [{
            key: "system.columnShift",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: "-2"
          }]
        }]);
        
        console.log(`✅ FASERIP | Created Impaired Endurance effect for ${actor.name}`);
      } else {
        // Update existing effect with new rank
        await impairedEffect.update({
          name: `Impaired Endurance (${nextName} of ${originalRank})`,
          [`flags.${scope}.currentEndurance`]: nextName
        });
        
        console.log(`✅ FASERIP | Updated Impaired Endurance effect for ${actor.name}`);
      }
      
      if (game.settings.get("msh-faserip", "debugMode")) {
        console.log(`✅ FASERIP | Updated ${actor.name}'s Endurance to ${nextName} (${nextValue})`);
      }
    } catch (err) {
      console.error(`❌ FASERIP | Failed to update ${actor.name}'s Endurance:`, err);
    }

    // Update the effect's label and tracking flags
    const turnsElapsed = (dyingEffect.getFlag(scope, "turnsElapsed") || 0) + 1;
        
    try {
      await dyingEffect.update({
        name: `Dying (${originalRank} → ${nextName}, ${turnsElapsed} turns)`,
        [`flags.${scope}.currentTempRank`]: nextName,
        [`flags.${scope}.turnsElapsed`]: turnsElapsed
      });
      console.log(`✅ FASERIP | Updated Dying effect label for ${actor.name}`);
    } catch (err) {
      console.error(`❌ FASERIP | Failed to update Dying effect:`, err);
    }

    // Post message about Endurance loss
    ChatMessage.create({
      content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> is dying and loses 1 Endurance rank: ${curName} → ${nextName}
      </div>`
    });

    // Check if they've hit Shift-0 (dying) or gone below (death)
    if (nextName === "Shift-0") {
      if (curName === "Shift-0") {
        // Already at Shift-0 and trying to go lower = death
        console.log(`💀 FASERIP | ${actor.name} has died (below Shift-0)`);
        
        // For linked actors, set isDead flag on base actor
        // For unlinked tokens, skip this to avoid affecting other tokens sharing the same base actor
        if (!actor.isToken || actor.prototypeToken?.actorLink) {
          await actor.update({"system.details.isDead": true});
        }
        
        await dyingEffect.delete();

        // Remove any Unconscious effects from dead character
        const unconsciousEffects = actor.effects.filter(e => 
          e.statuses?.has?.("unconscious") || 
          /unconscious/i.test(e.name)
        );
        if (unconsciousEffects.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", unconsciousEffects.map(e => e.id));
          console.log(`FASERIP | Removed ${unconsciousEffects.length} unconscious effect(s) from dead ${actor.name}`);
        }

        // Only affect the specific token if this is a token actor (unlinked)
        if (actor.isToken) {
          // This is an unlinked token - only affect this specific token
          const token = actor.token?.object || combatant.token?.object;
          if (token) {
            await token.toggleEffect({
              id: "dead",
              label: "Dead",
              icon: "icons/svg/skull.svg"
            }, { active: true, overlay: true });
          }
        } else {
          // This is a linked actor - affect all its tokens
          for (const token of actor.getActiveTokens()) {
            await token.toggleEffect({
              id: "dead",
              label: "Dead",
              icon: "icons/svg/skull.svg"
            }, { active: true, overlay: true });
          }
        }
        
        ChatMessage.create({
          content: `<div style="background:#ffebee;border:1px solid #b71c1c;padding:8px;border-radius:3px;color:#b71c1c;">
            <strong>💀 ${actor.name} has died.</strong>
          </div>`
        });
        continue;
      } else {
        // Just reached Shift-0 this round
        // DEBUG: Log the exact values being compared (if debug mode enabled)
        if (game.settings.get("msh-faserip", "debugMode")) {
          console.log(`🔍 FASERIP | Death check for ${actor.name}:`, {
            curName,
            nextName,
            curNameType: typeof curName,
            nextNameType: typeof nextName,
            curNameTrimmed: curName?.trim(),
            nextNameTrimmed: nextName?.trim(),
            areEqual: curName === nextName,
            bothShift0: curName === "Shift-0" && nextName === "Shift-0"
          });
        }
        console.log(`⚠️ FASERIP | ${actor.name} has reached Shift-0 Endurance (will die next round if not stabilized)`);
        ChatMessage.create({
          content: `<div style="background:#fff3e0;border:1px solid #ff9800;padding:8px;border-radius:3px;color:#e65100;">
            <strong>⚠️ ${actor.name} has reached Shift-0 Endurance!</strong>
            <div style="font-size:0.9em;margin-top:4px;">Will die next round unless stabilized.</div>
          </div>`
        });
      }
    }

    // Handle the special 200-Karma "re-FEAT on slip"
    const reFeat = dyingEffect.getFlag(scope, "reFeatOnSlip");
    if (reFeat) {
      console.log(`🎲 FASERIP | ${actor.name} gets re-FEAT on slip`);
      await dyingEffect.setFlag(scope, "reFeatOnSlip", false);
      game.msh?.openUniversalTableDialog?.(actor, { mode: "death-save" });
    }
  }
  
  if (dyingCount === 0) {
    console.log("✨ FASERIP | No dying combatants found");
  } else {
    console.log(`📊 FASERIP | Processed ${dyingCount} dying combatant(s)`);
  }

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
  console.log("📦 hotbarDrop received:", data);
  
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

  switch (item.type) {
    case "power":     game.msh.rollPower(actor, item, { useDirectRoll: false }); break;
    case "talent":    game.msh.rollTalent(actor, item); break;
    case "equipment": game.msh.rollEquipment(actor, item); break;
    default:          ui.notifications.warn(\`Cannot roll item type: \${item.type}\`);
  }
})();`;

  const macroName = `${item.name} (${actor?.name ?? "Actor"})`;
  let macro = game.macros.find(m => m.name === macroName && m.flags?.["faserip.itemMacro"]);
  if (!macro) {
    macro = await Macro.create({
      name: macroName,
      type: "script",
      img: item.img || "icons/svg/item-bag.svg",
      command,
      flags: { "faserip.itemMacro": true }
    });
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
    macro = await Macro.create({
      name: macroName,
      type: "script",
      img: data.data?.img || "icons/svg/d20-grey.svg", 
      command: command,
      flags: {"faserip.universalTableMacro": true}
    });
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
    const ACTIONS = [
      { id:"blunt-attack", label:"BA", color:"#FF6B00", textColor:"#FFF" },
      { id:"edged-attack", label:"EA", color:"#DC143C", textColor:"#FFF" },
      { id:"shooting", label:"Sh", color:"#8B0000", textColor:"#FFF" },
      { id:"throwing-edged", label:"TE", color:"#DC143C", textColor:"#FFF" },
      { id:"throwing-blunt", label:"TB", color:"#FF8C00", textColor:"#000" },
      { id:"energy", label:"En", color:"#8B0000", textColor:"#FFF" },
      { id:"force", label:"Fo", color:"#FF6B00", textColor:"#FFF" },
      { id:"grappling", label:"Gp", color:"#1E90FF", textColor:"#FFF" },
      { id:"grabbing", label:"Gb", color:"#4169E1", textColor:"#FFF" },
      { id:"escaping", label:"Es", color:"#4682B4", textColor:"#FFF" },
      { id:"charging", label:"Ch", color:"#FF8C00", textColor:"#000" },
      { id:"dodging", label:"Do", color:"#32CD32", textColor:"#000" },
      { id:"evading", label:"Ev", color:"#228B22", textColor:"#FFF" },
      { id:"blocking", label:"Bl", color:"#228B22", textColor:"#FFF" },
      { id:"catching", label:"Ca", color:"#32CD32", textColor:"#000" },
      { id:"stun", label:"St", color:"#9932CC", textColor:"#FFF" },
      { id:"slam", label:"Sl", color:"#9932CC", textColor:"#FFF" },
      { id:"kill", label:"Kl", color:"#8B008B", textColor:"#FFF" }
    ];
    
    const actionDef = ACTIONS.find(a => a.id === actionCode);
    const img = actionDef 
      ? generateActionIcon(actionCode, actionDef.label, actionDef.color, actionDef.textColor)
      : "icons/svg/combat.svg";
    
    macro = await Macro.create({
      name: macroName,
      type: "script",
      command: command,
      img: img,
      flags: {"faserip.universalActionMacro": true}
    });
  }
  
  game.user.assignHotbarMacro(macro, slot);
  return true;
}