// init.js v1.12.3 - 2026-04-19
// v1.12.3: Fix Regeneration auto-sync churn on every world load. The
//          cleanup loop's isCorrect check and the hasAE re-create
//          guard both used effectType === "regeneration" — the
//          pre-ongoing-engine legacy shape. registerOngoingEffect
//          writes effectType: "ongoing" with ongoingId: "regeneration",
//          so every canonical regen AE failed isCorrect, matched
//          isOldBroken via the shared "regenerating" status, got
//          deleted, and got recreated with the same shape — repeating
//          on every boot (visible as "Removed old-style … / Auto-
//          created …" pairs for the same actor). Switched both checks
//          to ongoingId === "regeneration". Legacy-shape heuristic
//          unchanged; it now short-circuits correctly on current AEs.
// v1.12.2: Fix Impaired Endurance never healing when GMs advance time in
//          sub-day chunks. Removed the `deltaSeconds >= 86400` filter on
//          the timeTracker.timeAdvanced impaired-heal loop. The filter
//          was a perf shortcut that silently dropped cumulative progress:
//          e.g. four 6-hour advances add up to 1 day of world time, but
//          none of the individual events exceeded the 1-day threshold, so
//          the check never ran. The per-actor `elapsed >= required`
//          comparison against worldTime was always the real gate — it
//          correctly accumulates across any advance granularity. Now runs
//          on any forward advance; zero/negative deltas still skipped.
// v1.12.1: Fix dead "Roll Death Save" button in semi/manual mode. The 0-HP
//          emitter output class="death-save-button" data-actor-id="..." but
//          the chat-hooks.js handler listens on [data-action="death-save"]
//          and reads dataset.actorUuid. Selector/attribute mismatch meant
//          the button never fired. Switched to data-action + data-actor-uuid.
// v1.12.0: Fix death/dying/recovery bugs:
//   - updateActor 0 HP handler now checks fourColorRule (was always firing death save)
//   - updateCombat effect expiry no longer auto-restores health; delegates to rest-system
//     attemptRegainConsciousness which rolls required Endurance FEAT per rules
//   - updateWorldTime effect expiry now delegates wake-up to rest-system hook
// v1.11.0: Fix light persistence bug â€” baseline flag storage now uses pipe-delimited keys
//          to prevent Foundry flattenObject from corrupting dot-notation keys during setFlag.
//          Per-actor debounce map replaces single global timer.
// v1.10.0: updateActiveEffect reconcile now filtered to faserip.token.* changes + disabled toggles only,
//          preventing unnecessary token updates on every stat/karma AE change.
// v1.9.9: Fix double death save caused by v1.9.8's await setFlag("wasKnockedOut") before
//         _combatDamageInProgress guard. The await yielded event loop, letting combat system
//         fire its own death save. Fix: move setFlag after guard, use fire-and-forget (no await).
// v1.9.4: Dying now processes via worldTime (works with CTT advances and combat tracker).
//         Removed ~30-line dying block from updateCombat hook â€” processOngoingEffects handles it.
// v1.9.3: Dying delegated to ongoing-engine.js processDyingRound(). ~200-line dying
//         block replaced with compact import call. game.msh.nextHigherRankName added.
// v1.9.2: CTTâ†”FASERIP time sync â€” ctt.timeAuthority setting, getCampaignDateTime reads CTT API,
//         updateWorldTime fires timeUpdated, bridge hooks for timeTracker.timeSet/timeAdvanced
// v1.9.1: Auto-sync power sheet â†’ ongoing effects. Setting regenerationType on a power's
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
import { rollTalent } from './modules/actions/talent-action.js';
import { rollPower } from './modules/actions/power-router.js';
import { rollContact } from './modules/actions/contact-action.js';
import { rollUniversalTable } from './modules/dice/universal-table.js';
import {
  RANKS_ORDERED, RANK_VALUES, RANK_ABBR, RANK_ALIASES,
  rankValue as _rankValue, valueToRank as _valueToRank,
  shiftRank as _shiftRank, normalizeRank
} from './rules/rules-reference.js';
import { FaseripInitiative } from './faserip-initiative.js';
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
import { FaseripTokenRuler } from "./modules/canvas/faserip-token-ruler.js";
import { initDotToken } from "./modules/canvas/faserip-dot-token.js";
import { registerNullifyAuraHooks } from "./modules/actions/nullify-aura.js";
import { AreaHazardBehavior } from "./modules/regions/area-hazard-behavior.js";

// ── Player-color tint on chat cards ──
Hooks.on('renderChatMessageHTML', (message, htmlEl) => {
  if (!game.settings.get('msh-faserip', 'chatCardPlayerColor')) return;
  const user = game.users.get(message.author?.id ?? message.user?.id);
  if (!user?.color) return;

  const header = htmlEl.querySelector?.('.message-header');
  if (!header) return;

  const color = user.color.css ?? String(user.color);
  header.style.background = `linear-gradient(135deg, ${color}35, ${color}15)`;
  header.style.borderLeft = `4px solid ${color}`;
  header.style.paddingLeft = '8px';
  header.style.borderRadius = '3px 3px 0 0';
});

// ── v14 screen shake on impact-effect chat cards ──
// Grenades (and other area attacks) can set a "shake" flag on the chat message.
// Every client rendering the card fires the shake locally, so the whole table
// feels the boom. Dedupe per message id and skip historical messages so that
// re-renders and page refreshes don't retro-shake the players.
const _shookMessages = new Set();
Hooks.on("renderChatMessageHTML", (message, htmlEl) => {
  const shake = message.flags?.["msh-faserip"]?.shake;
  if (!shake) return;
  if (_shookMessages.has(message.id)) return;
  _shookMessages.add(message.id);

  const ts = Number(message.timestamp) || 0;
  if (Date.now() - ts > 5000) return;   // stale render, don't shake

  const Shake = foundry?.canvas?.animation?.CanvasShakeEffect;
  if (!Shake) return;                   // pre-v14 or API moved

  try {
    new Shake(shake).play();
  } catch (e) {
    console.warn("[FASERIP WARN] CanvasShakeEffect failed:", e);
  }
});

// FASERIP Combat Sync - Use combatRound hook (fires once per round)
Hooks.on("combatRound", async (combat, updateData, updateOptions, userId) => {
  // ðŸ”’ GM-only â€“ only the GM advances world time
  if (!game.user.isGM) return;
  
  const syncEnabled = game.settings.get("msh-faserip", "combatSyncEnabled");
  if (syncEnabled) {
    // Advance Foundry world time by 6 seconds (1 FASERIP turn)
    await game.time.advance(6);
    console.log("[FASERIP] Combat advanced time by 6 seconds");
  }
  
  // Trigger hook to update team sheet display
  Hooks.callAll("msh-faserip.timeUpdated");

  // â”€â”€ Process dying for all actors in this combat (1 rank loss per round) â”€â”€
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
      const toExpire = [];
      
      // Check actor-level effects
      for (const ef of (actor.effects ?? [])) {
        if (ef.disabled) continue;
        const d = ef.duration ?? {};
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        const efFlags = ef.flags?.[scope] || {};
        // Skip ongoing-engine effects — they manage their own lifecycle
        // (Body Armor, Force Field, Resistances, regeneration, dying, etc.)
        if (efFlags.ongoingId || efFlags.isDying || efFlags.dyingTimer) continue;
        // v14: trust core's computed expired flag for value+units durations
        if (d.expired === true || (Number.isFinite(d.remaining) && d.remaining <= 0 && (Number.isFinite(d.value) ? d.value > 0 : false))) {
          toExpire.push({ effect: ef, item: null, reason: `expired per core (value ${d.value} ${d.units}, remaining ${d.remaining})` });
          continue;
        }
        if (Number.isFinite(d.seconds) && d.seconds > 0 && Number.isFinite(d.startTime)) {
          if (d.startTime + d.seconds <= worldTime) {
            toExpire.push({ effect: ef, item: null, reason: `time expired (${d.seconds}s duration)` });
          }
        }
      }

      // Check effects on owned equipment items (v13: transfer doesn't always put them on actor)
      for (const item of (actor.items ?? [])) {
        if (item.type !== "equipment") continue;
        for (const ef of (item.effects ?? [])) {
          if (ef.disabled) continue;
          const d = ef.duration ?? {};
          const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
          const efFlags = ef.flags?.[scope] || {};
          // Skip ongoing-engine effects — they manage their own lifecycle
          if (efFlags.ongoingId || efFlags.isDying || efFlags.dyingTimer) continue;
          // v14: trust core's computed expired flag for value+units durations
          if (d.expired === true || (Number.isFinite(d.remaining) && d.remaining <= 0 && (Number.isFinite(d.value) ? d.value > 0 : false))) {
            toExpire.push({ effect: ef, item, reason: `expired per core (value ${d.value} ${d.units}, remaining ${d.remaining})` });
            continue;
          }
          if (Number.isFinite(d.seconds) && d.seconds > 0 && Number.isFinite(d.startTime)) {
            if (d.startTime + d.seconds <= worldTime) {
              toExpire.push({ effect: ef, item, reason: `time expired (${d.seconds}s duration)` });
            }
          }
        }
      }

      if (!toExpire.length) continue;
      
      // Disable or delete expired effects
      for (const { effect, item, reason } of toExpire) {
        console.log(`[FASERIP] Auto-expiring effect "${effect.name}" on ${actor.name}: ${reason}`);
        try {
          // Resolve the source equipment item (direct parent or transferred via origin)
          let equipItem = item;
          if (!equipItem && effect.origin) {
            const originParts = effect.origin.split(".");
            const itemIdx = originParts.indexOf("Item");
            if (itemIdx >= 0 && originParts[itemIdx + 1]) {
              const candidate = actor.items?.get(originParts[itemIdx + 1]);
              if (candidate?.type === "equipment") equipItem = candidate;
            }
          }

          if (equipItem) {
            // Equipment effect: disable (reusable) and clear duration stamp
            await effect.update({ disabled: true, duration: { value: 0, units: null } });
            const rechargeLabel = equipItem.system?.rechargeLabel || "Reload";
            ChatMessage.create({
              content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
                <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
                  <strong style="color:#8b0000;">EQUIPMENT EXPIRED</strong>
                </div>
                <div style="padding:6px 10px;">
                  <div><strong>${actor.name}</strong>'s <strong>${equipItem.name}</strong> has expired â€” ${effect.name} deactivated.</div>
                  <button class="faserip-recharge-btn" data-actor-id="${actor.id}" data-item-id="${equipItem.id}"
                    style="margin-top:6px;padding:4px 12px;border:1px solid #c0c0c0;border-radius:3px;background:#fff;cursor:pointer;font-size:0.85em;">
                    <i class="fas fa-sync-alt"></i> ${rechargeLabel}
                  </button>
                </div>
              </div>`,
              speaker: ChatMessage.getSpeaker({ actor })
            });
          } else {
            await effect.delete();
          }
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
          console.log(`[FASERIP:DYING] worldTime: ${actor.name} â†’ ${result}`);
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
    hint: "Volume for system SFX (0.0â€“1.0).",
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

  game.msh.FaseripActorSheet = FaseripActorSheet;

  CONFIG.FASERIP = CONFIG.FASERIP || {};

  // Non-legacy transferral: effects on items apply to actors via allApplicableEffects()
  // without being copied. Toggle/edit the effect on the item directly.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Make ACTIONS available to macros via CONFIG
  CONFIG.MSHF = CONFIG.MSHF || {};
  CONFIG.MSHF.ACTIONS = ACTIONS;

  // Register v14 Region Behaviors
  // "areaHazard" — persistent intensity hazard for grenades and GM-placed zones.
  // See scripts/modules/regions/area-hazard-behavior.js for usage.
  // NOTE: System-declared RegionBehavior subtypes register under the BARE name
  // (no "msh-faserip." prefix) because the system owns its own typeid namespace.
  // Module-declared subtypes use the prefixed form; system-declared don't.
  CONFIG.RegionBehavior ??= {};
  CONFIG.RegionBehavior.dataModels ??= {};
  CONFIG.RegionBehavior.dataModels["areaHazard"] = AreaHazardBehavior;
  CONFIG.RegionBehavior.typeIcons ??= {};
  CONFIG.RegionBehavior.typeIcons["areaHazard"] = "fas fa-smog";

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

  // Player color tint on chat cards
  game.settings.register('msh-faserip', 'chatCardPlayerColor', {
    name: "Player Color Chat Cards",
    hint: "Tint chat card headers with each player's cursor color for easier identification of who did what.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Four-Color: no death save at 0 Health, unless a 'Kill' action type used.
  game.settings.register('msh-faserip', 'fourColorRule', {
    name: "Four-Color Rule (Non-lethal 0 Health)",
    hint: "If enabled, characters who hit 0 Health do NOT make a death save unless the triggering attack produced a Kill result (or the GM marks the hazard as lethal).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Resource Points: track weekly income, spending, and accumulation per the original rules.
  game.settings.register('msh-faserip', 'useResourcePoints', {
    name: "Resource Points (Original Rules)",
    hint: "Track resource points with weekly income, accumulation caps, and spending. When off, Resources is just a rank on the sheet.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Auto-Healing: RAW hourly Healing fires automatically as worldTime advances.
  // When off, players heal only by clicking the Attempt Healing button on the sheet.
  game.settings.register('msh-faserip', 'autoHealingEnabled', {
    name: "Automatic Hourly Healing",
    hint: "When enabled, characters heal their Endurance rank number in HP per hour after last damage (doubled with medical care) automatically as you advance time. When disabled, healing is manual only.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register('msh-faserip', 'autoHealChatMode', {
    name: "Auto-Heal Chat Output",
    hint: "Controls chat messages when ongoing heal / Endurance-rank-gain effects tick. Applies only to NPCs (player characters always post public chat). Default: whisper to GM so scenes full of bruised NPCs don't spam the log.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "public":         "Public â€” everyone sees every NPC heal tick",
      "gm-whisper-npcs": "GM-only â€” NPC heals whisper to GM (recommended)",
      "silent-npcs":    "Silent â€” NPC heals post no chat at all"
    },
    default: "gm-whisper-npcs"
  });

  foundry.documents.collections.Actors.registerSheet("msh-faserip", MSHVehicleActorSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "Vehicle Sheet"
  });

  function shouldConvertToSecondsByPolicy() {
    const policy = game.settings?.get?.("msh-faserip", "effects.durationPolicy") || "rounds-in-combat";
    if (policy === "seconds-only") return true;
    if (game.combat && (policy === "rounds-in-combat" || policy === "auto")) return false;
    return true; // out of combat â†’ convert
  }

  // preCreateActiveEffect: duplicate-status guard + icon→img remap.
  // (Legacy v13 rounds→seconds conversion removed for v14 — see note below.)
  Hooks.on("preCreateActiveEffect", function (effect, data, options, userId) {
    // â”€â”€ Duplicate status guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // If this AE has statuses (e.g. "fly" from token HUD), check whether
    // the actor already has a non-disabled AE providing the same status
    // (e.g. from a power item's transfer effect). Uses allApplicableEffects()
    // which includes both actor-level and item-transferred effects.
    const actor = effect.parent?.documentName === "Actor" ? effect.parent : null;
    if (actor && data?.statuses?.length) {
      for (const statusId of data.statuses) {
        let existing = null;
        for (const e of actor.allApplicableEffects()) {
          if (!e.disabled && e.statuses?.has(statusId)) { existing = e; break; }
        }
        if (existing) {
          ui.notifications.info(`${actor.name} already has "${existing.name}" providing that status.`);
          return false;
        }
      }
    }

    // v12+: img is canonical, icon is deprecated - check property existence without triggering getter
    if (data && Object.hasOwn(data, 'icon') && !data.img) data.img = data.icon;

    // Core doesn't have impact.svg; remap to a safe built-in.
    if (data?.img === "icons/svg/impact.svg") {
      data.img = "icons/svg/target.svg";
    }


    // v14 migration note: every effect create site in this system now
    // writes the v14 duration shape directly ({value, units, expiry}).
    // The legacy rounds→seconds conversion that used to live here was
    // dead code in v14 and actively broken: it tripped
    // BaseActiveEffect#rounds deprecation warnings on read, and
    // duration.seconds became getter-only so the assignment threw
    // "Cannot set property seconds of #<Object> which has only a getter".
    // If a legacy v13-shaped effect ever slips in via import, leave it
    // alone here — v14's own shim handles read-time conversion.
  });


  Hooks.on("preUpdateActiveEffect", function (effect, changes, options, userId) {
    // v12+: img is canonical, icon is deprecated - check property existence without triggering getter
    if (changes && Object.hasOwn(changes, 'icon') && !changes.img) changes.img = changes.icon;
    if (changes?.img === "icons/svg/impact.svg") {
      changes.img = "icons/svg/target.svg";
    }

    // Equipment duration: when toggling an effect ON, stamp duration.seconds + duration.startTime
    // from the parent equipment item's duration/durationUnit fields.
    // The existing updateWorldTime expiration code handles auto-disable.
    if (changes?.disabled === false && effect.disabled === true) {
      // Find the source equipment item â€” direct parent if on item sheet, or via origin if transferred to actor
      let item = null;
      const parent = effect.parent;
      if (parent?.type === "equipment") {
        item = parent;
      } else if (parent?.items && effect.origin) {
        // Transferred effect on actor â€” origin is "Actor.xxx.Item.yyy" or a UUID
        const originParts = effect.origin.split(".");
        const itemIdx = originParts.indexOf("Item");
        if (itemIdx >= 0 && originParts[itemIdx + 1]) {
          item = parent.items.get(originParts[itemIdx + 1]);
        }
      }
      if (!item || item.type !== "equipment") return;
      const dur = Number(item.system?.duration);
      const unit = item.system?.durationUnit;
      if (!dur || dur <= 0 || !unit) return;

      // Convert to seconds â€” try CTT first, then manual lookup
      let seconds = 0;
      const cttMod = game.modules.get("calendar-time-tracker");
      if (cttMod?.active && cttMod.api?.timeEngine) {
        try { seconds = cttMod.api.timeEngine.convertToSeconds(dur, unit) || 0; } catch (_) {}
      }
      if (!seconds) {
        const table = { second: 1, turn: 6, round: 6, minute: 60, hour: 3600, day: 86400, week: 604800 };
        seconds = dur * (table[unit] || 0);
      }
      if (seconds > 0) {
        changes.duration = { seconds, startTime: game.time.worldTime };
        console.log(`[FASERIP] Equipment duration stamped: "${effect.name}" on "${item.name}" â€” ${dur} ${unit} (${seconds}s), expires at worldTime ${game.time.worldTime + seconds}`);
      }
    }

    // When toggling an effect OFF, clear the duration stamp so re-enabling starts fresh
    if (changes?.disabled === true && effect.disabled === false) {
      let item = null;
      const parent = effect.parent;
      if (parent?.type === "equipment") {
        item = parent;
      } else if (parent?.items && effect.origin) {
        const originParts = effect.origin.split(".");
        const itemIdx = originParts.indexOf("Item");
        if (itemIdx >= 0 && originParts[itemIdx + 1]) {
          item = parent.items.get(originParts[itemIdx + 1]);
        }
      }
      if (item?.type === "equipment" && Number(item.system?.duration) > 0) {
        changes.duration = { value: 0, units: null };
      }
    }
  });

  // Register Action HUD keybinding
  game.keybindings.register("msh-faserip", "openActionHUD", {
    name: "Toggle Action HUD",
    hint: "Toggle the Action HUD open/closed (press H, or Alt+H)",
    category: "FASERIP",
    editable: [
      { key: "KeyH", modifiers: [] },
      { key: "KeyH", modifiers: ["Alt"] }
    ],
    onDown: () => {
      if (ui.faseripHUD?.rendered) {
        ui.faseripHUD.close();
      } else {
        if (!ui.faseripHUD) ui.faseripHUD = new FaseripActionPanel();
        ui.faseripHUD.render(true);
      }
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });


  // Team control button
  // Add this after the keybinding registration and before the settings registration
  Hooks.on("getSceneControlButtons", function(controlsData) {


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

    } else {

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

    }

    // 4c. Action HUD (all users)
    if (!existingToolsObj["faserip-action-hud"]) {
      existingToolsObj["faserip-action-hud"] = {
        name: "faserip-action-hud",
        title: "Toggle Action HUD (H or Alt+H)",
        icon: "fas fa-crosshairs",
        visible: true,
        toggle: true,
        active: !!ui.faseripHUD?.rendered,
        onChange: (event, active) => {
          if (active) {
            if (!ui.faseripHUD) ui.faseripHUD = new FaseripActionPanel();
            ui.faseripHUD.render(true);
          } else {
            ui.faseripHUD?.close();
          }
        }
      };
    }

    // 5. Assign the reconstructed tools-object back onto tokenGroup.tools
    tokenGroup.tools = existingToolsObj;


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

  game.settings.register("msh-faserip", "nullifyMaxRange", {
    name: "Nullifying Power â€” Max Aura Range (Areas)",
    hint: "Cap the Nullifying Power aura radius in areas. 0 = full RAW range (rank-based). Any positive number caps the range (e.g. 4 means max 4 areas regardless of rank). Affects both the visual aura and the area template.",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 100, step: 1 }
  });

  game.settings.register("msh-faserip", "dotMode", {
    name: "Dot Mode (Theater of the Mind)",
    hint: "Default dot mode for new scenes. Individual scenes can override this in Scene Config â†’ Grid tab. Right-click tokens to override per-token. Ctrl+hover a dot for portrait.",
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

    game.settings.register("msh-faserip", "groupAwardMode", {
      name: "Group Karma Award Mode",
      hint: "How group karma awards are distributed. Split (RAW): divided among present heroes per the rulebook. Pool: awards go to the team karma pool. To reproduce 'full share' behavior (each hero gets the full amount), use Split and set Karma Multiplier to your expected party size.",
      scope: "world",
      config: true,
      type: String,
      choices: {
        split: "Split (RAW)",
        pool: "To karma pool"
      },
      default: "split"
    });

    for (const cat of ["combat", "rescue", "personal", "gaming", "penalty"]) {
      game.settings.register("msh-faserip", `karmaMultiplier_${cat}`, {
        name: `Karma Multiplier: ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
        hint: "0 = use global Karma Multiplier. Otherwise overrides for this category.",
        scope: "world",
        config: true,
        type: Number,
        default: 0
      });
    }

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

    game.settings.register("msh-faserip", "teamName", {
      name: "Team Name",
      hint: "Name shown in the Team Tracker header. Used for the team bio journal entry.",
      scope: "world",
      config: true,
      type: String,
      default: ""
    });

    game.settings.register("msh-faserip", "teamBioJournalId", {
      name: "Team Bio Journal ID",
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

    game.settings.register("msh-faserip", "sessionRIPBonus", {
      name: "Session R+I+P Bonus (House Rule)",
      hint: "Enable the Graycloak house rule: at session end, each hero may be awarded karma equal to Reason + Intuition + Psyche. Adds an R+I+P button to the Team Tracker. Not from the rulebook.",
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
      hint: "Zoom level for HUD buttons (0.5â€“2.0). Also adjustable with Ctrl+Wheel.",
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

    // ========== CTT â†” FASERIP Bridge Hooks ==========
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
        // Out of combat, each manual CTT advance ticks dying once â€” GM controls pacing.
        for (const actor of Effects.getAllTokenActors()) {
          if (!actor?.effects?.size) continue;
          const dyingAE = actor.effects.find(e =>
            (e.flags?.[scope]?.ongoingId === "dying" || e.flags?.[scope]?.isDying) &&
            !e.disabled
          );
          if (!dyingAE) continue;

          console.log(`[FASERIP:DYING] CTT timeAdvanced: ${amount} ${unitId} = ${deltaSeconds}s â€” processing 1 dying round for ${actor.name}`);
          const result = await processDyingRound(actor);
          console.log(`[FASERIP:DYING] CTT: ${actor.name} â†’ ${result}`);
        }
      } catch (e) {
        console.error("[FASERIP ERROR] CTT dying processing failed:", e);
      } finally {
        game.msh._cttDyingInProgress = false;
      }

      // Process impaired Endurance healing on any forward advance.
      // The per-actor `elapsed >= required` check below is the real gate;
      // removing the old `deltaSeconds >= 86400` filter lets cumulative
      // sub-day advances (e.g. four 6-hour ticks → 1 day) correctly tick
      // recovery. Skip zero/negative deltas (time rewinds, resyncs).
      if (deltaSeconds > 0) {
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
                console.log(`[FASERIP] Impaired Endurance healed: ${actor.name} â€” ${result.message}`);
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

  // Register custom status effects â€” skip any IDs already registered by core (v14 proxy enforces uniqueness)
  const _existingStatusIds = new Set(CONFIG.statusEffects.map(e => e.id));
  const _mshStatusEffects = [
    { id: "grappled", name: "Grappled", img: "icons/svg/net.svg", flags: { "msh-faserip": { grappling: true } } },
    { id: "held", name: "Held", img: "icons/svg/padlock.svg", flags: { "msh-faserip": { grappling: true } } },
    { id: "dying", name: "Dying", img: "icons/svg/skull.svg", flags: { "msh-faserip": { isDying: true } } },
    { id: "impaired-endurance", name: "Impaired Endurance", img: "icons/svg/blood.svg", flags: { "msh-faserip": { isImpairedEndurance: true } } },
    { id: "dead", name: "Dead", img: "icons/svg/skull.svg", flags: { "msh-faserip": { isDead: true } } },
    { id: "dodging", name: "Dodging", img: "icons/svg/windmill.svg", flags: { "msh-faserip": { isDodging: true } } },
    { id: "evading", name: "Evading", img: "icons/svg/combat.svg", flags: { "msh-faserip": { isEvading: true } } },
    { id: "blocking", name: "Blocking", img: "icons/svg/shield.svg", flags: { "msh-faserip": { isBlocking: true } } }
  ];
  for (const effect of _mshStatusEffects) {
    if (_existingStatusIds.has(effect.id)) {
      const existing = CONFIG.statusEffects.find(e => e.id === effect.id);
      if (existing) foundry.utils.mergeObject(existing, { flags: effect.flags });
      console.log(`[FASERIP] Status effect "${effect.id}" already registered by core â€” merging flags.`);
    } else {
      CONFIG.statusEffects.push(effect);
      _existingStatusIds.add(effect.id);
    }
  }

  // Populate CONFIG.FASERIP.rankValues from canonical source + alias variants
  CONFIG.FASERIP.rankValues = Object.assign({}, RANK_VALUES);
  for (const [alias, canonical] of Object.entries(RANK_ALIASES)) {
    if (RANK_VALUES[canonical] !== undefined) CONFIG.FASERIP.rankValues[alias] = RANK_VALUES[canonical];
  }

  // Rank navigation helpers â€” delegate to canonical shiftRank
  game.msh.nextLowerRankName = function(name) {
    const n = normalizeRank(name);
    const i = RANKS_ORDERED.indexOf(n);
    if (i <= 0) return "Shift-0";
    return RANKS_ORDERED[i - 1];
  };

  game.msh.nextHigherRankName = function(name) {
    const n = normalizeRank(name);
    const i = RANKS_ORDERED.indexOf(n);
    if (i < 0 || i >= RANKS_ORDERED.length - 1) return n;
    return RANKS_ORDERED[i + 1];
  };

  // Convenience to get current printed rank name from an actor's Endurance
  game.msh.getEnduranceRankName = function(actor) {
    const r = actor.system?.abilities?.endurance?.rank ?? actor.system?.abilities?.endurance?.value;
    if (typeof r === "string") return r;
    return _valueToRank(r ?? 0);
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

  await foundry.applications.handlebars.loadTemplates([
    "systems/msh-faserip/templates/universal-table.html",
    "systems/msh-faserip/templates/universal-rank-table.hbs"
  ]);

  game.msh.getRankValue = function(rankName) {
    return _rankValue(rankName);
  };

  game.msh.getRankName = function(value) {
    return _valueToRank(value);
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

  // Add the roll functions to the namespace
  game.msh.rollPower = rollPower;
  game.msh.rollTalent = rollTalent;
  game.msh.rollContact = rollContact;
  game.msh.rollEquipment = async (actor, item) => {
    const { openEquipmentActionDialog } = await import('./modules/actions/equipment-action-dialog.js');
    return openEquipmentActionDialog(actor, item);
  };

  // Add the Action HUD to the namespace
  game.msh.FaseripActionPanel = FaseripActionPanel;

  // Add the collision damage dialog
  game.msh.openCollisionDamageDialog = openCollisionDamageDialog;

  // Initialize faserip initiative
  FaseripInitiative.init();

  // Pan to active combatant on turn/round change
  Hooks.on("updateCombat", (combat, updateData) => {
    if (!("turn" in updateData) && !("round" in updateData)) return;
    try {
      if (!game.settings.get("msh-faserip", "panToCombatant")) return;
    } catch (_) { return; }
    const token = combat.combatant?.token?.object;
    if (token) {
      canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 500 });
    }
  });

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
    return RANK_ABBR[rank] ?? RANK_ABBR[normalizeRank(rank)] ?? rank;
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
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.applications.sheets.ActorSheetV2);
  foundry.documents.collections.Items.unregisterSheet("core", foundry.applications.sheets.ItemSheetV2);

  foundry.documents.collections.Actors.registerSheet("msh-faserip", FaseripActorSheet, {
    types: ["hero", "villain", "npc"],
    makeDefault: true
  });
  
  // Make sure to register vehicle items with FaseripItemSheet
  foundry.documents.collections.Items.registerSheet("msh-faserip", FaseripItemSheet, { 
    types: ["power", "vehicle"],
    makeDefault: true 
  });

  // Headquarters sheet - dedicated
  foundry.documents.collections.Items.registerSheet("msh-faserip", FaseripHeadquartersSheet, {
    types: ["headquarters"],
    makeDefault: true
  });
  
  // Talent sheet - smaller dialog
  foundry.documents.collections.Items.registerSheet("msh-faserip", FaseripTalentSheet, { 
    types: ["talent"],
    makeDefault: true 
  });
  
  // Contact sheet - smaller dialog
  foundry.documents.collections.Items.registerSheet("msh-faserip", FaseripContactSheet, { 
    types: ["contact"],
    makeDefault: true 
  });
  
  foundry.documents.collections.Items.registerSheet("msh-faserip", FaseripEquipmentSheet, { 
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

  Handlebars.registerHelper('includes', function(array, value) {
    if (!Array.isArray(array)) return false;
    return array.includes(value);
  });
  
  // Initialize rest system
  initRestSystem();

  // â”€â”€ Ongoing Effects Engine API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
// â”€â”€â”€ Handle faserip.token.* ActiveEffect changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Effects with change keys like "faserip.token.light.bright" are intercepted
// by the applyActiveEffect hook (blocked from writing to actor system data)
// and instead applied directly to the owning token(s).
//
// Baseline is stored in tokenDoc flags using pipe-delimited keys to avoid
// Foundry's flattenObject interpreting dots as nested paths during flag storage.
// e.g. "light.bright" is stored as "light|bright" in the baseline object.

const _TOKEN_FLAG_SCOPE = "msh-faserip";
const _TOKEN_BASELINE_KEY = "tokenBaseline";

// Encode/decode baseline keys: dots â†” pipes
function _baselineEncode(dotKey) { return dotKey.replaceAll(".", "|"); }
function _baselineDecode(pipeKey) { return pipeKey.replaceAll("|", "."); }

// Collect all active faserip.token.* changes for an actor â€” returns Map<dotKey, value>
function _collectTokenEffectState(actor) {
  const desired = new Map();
  const CUSTOM = CONST.ACTIVE_EFFECT_CHANGE_TYPES?.CUSTOM ?? "custom";
  for (const effect of actor.allApplicableEffects()) {
    if (effect.disabled || effect.isSuppressed) continue;
    for (const change of (effect.system?.changes ?? effect.changes ?? [])) {
      if ((change.type ?? change.mode) !== CUSTOM) continue;
      if (!change.key.startsWith("faserip.token.")) continue;
      const tokenKey = change.key.replace("faserip.token.", "");
      // v14: change.value arrives pre-parsed (JSON parse of the entered value,
      // or the raw string on parse failure), so no manual coercion needed.
      desired.set(tokenKey, change.value);
    }
  }
  return desired;
}

// Reconcile token state: apply desired or revert to baseline
async function _reconcileTokenEffects(actor) {
  if (!canvas?.scene || !game.user.isGM) return;

  const tokens = canvas.scene.tokens.filter(t => {
    if (t.actorLink) return t.actorId === actor.id;
    return t.actor === actor;
  });
  if (!tokens.length) return;

  const desired = _collectTokenEffectState(actor);
  const hasDesired = desired.size > 0;

  for (const tokenDoc of tokens) {
    const savedBaseline = tokenDoc.getFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY);

    if (hasDesired) {
      // Build or extend baseline: snapshot current token value for each key we're changing
      const baseline = savedBaseline ? foundry.utils.duplicate(savedBaseline) : {};
      let baselineChanged = false;
      for (const dotKey of desired.keys()) {
        const safeKey = _baselineEncode(dotKey);
        if (!(safeKey in baseline)) {
          baseline[safeKey] = foundry.utils.getProperty(tokenDoc, dotKey) ?? null;
          baselineChanged = true;
        }
      }
      if (!savedBaseline || baselineChanged) {
        await tokenDoc.setFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY, baseline);
      }
      // Build nested update object from dot-notation keys
      const update = {};
      for (const [dotKey, val] of desired) {
        foundry.utils.setProperty(update, dotKey, val);
      }
      await tokenDoc.update(update);

    } else if (savedBaseline) {
      // No active token effects â€” revert every key to its baseline value
      const revert = {};
      for (const [safeKey, val] of Object.entries(savedBaseline)) {
        const dotKey = _baselineDecode(safeKey);
        foundry.utils.setProperty(revert, dotKey, val);
      }
      await tokenDoc.update(revert);
      await tokenDoc.unsetFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY);
    }
  }
}

// Debounce: multiple effect changes in quick succession get one reconcile
const _pendingReconcile = new Map();
function _scheduleReconcile(actor) {
  if (!actor) return;
  const id = actor.id ?? actor.uuid;
  clearTimeout(_pendingReconcile.get(id));
  _pendingReconcile.set(id, setTimeout(() => {
    _pendingReconcile.delete(id);
    _reconcileTokenEffects(actor);
  }, 200));
}

// Helper: resolve an effect's parent chain to find the owning actor
function _resolveEffectActor(effect) {
  const parent = effect.parent;
  if (parent?.documentName === "Actor") return parent;
  if (parent?.documentName === "Item" && parent.actor) return parent.actor;
  return null;
}

// â”€â”€ Hook: block faserip.token.* from being written to actor system data â”€â”€
Hooks.on("applyActiveEffect", (actor, change, current, delta, changes) => {
  const CUSTOM = CONST.ACTIVE_EFFECT_CHANGE_TYPES?.CUSTOM ?? "custom";
  if ((change.type ?? change.mode) !== CUSTOM) return;
  if (!change.key.startsWith("faserip.token.")) return;
  return false;
});

// â”€â”€ Hooks: reconcile when effects change â”€â”€
Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
  const hasTokenChanges = (effect.system?.changes ?? effect.changes)?.some(c => c.key?.startsWith("faserip.token."));
  const disabledToggled = "disabled" in changes;
  if (!hasTokenChanges && !disabledToggled) return;
  if (!game.user.isGM) return;
  const actor = _resolveEffectActor(effect);
  if (actor) _scheduleReconcile(actor);
});

Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (!game.user.isGM) return;
  if (!(effect.system?.changes ?? effect.changes)?.some(c => c.key.startsWith("faserip.token."))) return;
  const actor = _resolveEffectActor(effect);
  if (actor) _scheduleReconcile(actor);
});

// Stash actor ref before effect deletion (parent may be null after delete)
const _pendingDeleteActors = new Map();
Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  if (!game.user.isGM) return;
  const hasTokenChanges = (effect.system?.changes ?? effect.changes)?.some(c => c.key?.startsWith("faserip.token."));
  const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
  const isNullified = effect.flags?.[scope]?.effectType === "nullified";
  if (!hasTokenChanges && !isNullified) return;
  const actor = _resolveEffectActor(effect);
  if (actor) _pendingDeleteActors.set(effect.id, actor);
});

Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (!game.user.isGM) return;
  const actor = _pendingDeleteActors.get(effect.id) ?? _resolveEffectActor(effect);
  _pendingDeleteActors.delete(effect.id);
  if (actor) _scheduleReconcile(actor);

  // Restore powers suppressed by Nullified effect
  if (actor) {
    try {
      const { restoreNullifiedPowers } = await import("./modules/effects/effect-engine.js");
      await restoreNullifiedPowers(effect, actor);
    } catch (e) {
      console.error("[FASERIP ERROR] Failed to restore nullified powers:", e);
    }
  }
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

// On canvas ready, migrate any old dot-key baselines and reconcile all tokens
Hooks.on("canvasReady", async () => {
  if (!game.user.isGM) return;
  for (const tokenDoc of canvas.scene.tokens) {
    // Migrate old dot-notation baselines to pipe-delimited format
    const bl = tokenDoc.getFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY);
    if (bl && typeof bl === "object") {
      const hasDotKeys = Object.keys(bl).some(k => k.includes("."));
      const hasNestedFromCorruption = !hasDotKeys && Object.values(bl).some(v => v && typeof v === "object");
      if (hasDotKeys) {
        // Old format: { "light.bright": 0 } â†’ { "light|bright": 0 }
        const migrated = {};
        for (const [k, v] of Object.entries(bl)) migrated[_baselineEncode(k)] = v;
        await tokenDoc.setFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY, migrated);
      } else if (hasNestedFromCorruption) {
        // Corrupted: { light: { bright: 0 } } â†’ flatten and re-encode
        const flat = foundry.utils.flattenObject(bl);
        const migrated = {};
        for (const [k, v] of Object.entries(flat)) migrated[_baselineEncode(k)] = v;
        await tokenDoc.setFlag(_TOKEN_FLAG_SCOPE, _TOKEN_BASELINE_KEY, migrated);
      }
    }
    const actor = tokenDoc.actor;
    if (actor) _reconcileTokenEffects(actor);
  }
});

Hooks.once("ready", async () => {
  game.msh ??= {};

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

  // Migrate body armor powers: backfill armorPhysical/armorEnergy on old powers that used armorUseRankValue
  if (game.user.isGM) {
    try {
      for (const actor of game.actors) {
        for (const item of actor.items) {
          if (item.type !== "power" || !item.system.isBodyArmor) continue;
          const sys = item.system;
          // Old powers with armorUseRankValue=true have armorPhysical/armorEnergy at 0
          if (sys.armorUseRankValue === true || (sys.armorPhysical === 0 && sys.armorEnergy === 0)) {
            const baseVal = typeof sys.value === "number" ? sys.value : (CONFIG.FASERIP?.rankValues?.[sys.rank] || 0);
            const updates = {};
            if (!sys.armorPhysical) updates["system.armorPhysical"] = baseVal;
            if (!sys.armorEnergy) updates["system.armorEnergy"] = sys.isForceField ? baseVal : Math.max(0, baseVal - 20);
            if (sys.armorUseRankValue !== undefined) updates["system.-=armorUseRankValue"] = null;
            if (Object.keys(updates).length) {
              await item.update(updates);
              console.log(`[FASERIP] Migrated body armor fields: ${actor.name} / ${item.name}`);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[FASERIP WARN] Body armor migration failed:", e);
    }
  }

  // Migrate body armor powers: flag existing overrides as custom so rank
  // changes don't silently clobber them. An override is "custom" when the
  // stored armor value differs from what the rank formula would produce
  // (physical = value, energy = max(0, value - 20) for non-FF powers;
  // for Force Fields: physical = max(0, value - 10), energy = value).
  if (game.user.isGM) {
    try {
      let flaggedPhys = 0;
      let flaggedEner = 0;
      for (const actor of game.actors) {
        for (const item of actor.items) {
          if (item.type !== "power" || !item.system.isBodyArmor) continue;
          const sys = item.system;
          const baseVal = typeof sys.value === "number" ? sys.value : (CONFIG.FASERIP?.rankValues?.[sys.rank] || 0);
          const defaultPhys = sys.isForceField ? Math.max(0, baseVal - 10) : baseVal;
          const defaultEner = sys.isForceField ? baseVal : Math.max(0, baseVal - 20);
          const updates = {};
          if (!sys.armorPhysicalCustom && Number(sys.armorPhysical) !== defaultPhys) {
            updates["system.armorPhysicalCustom"] = true;
            flaggedPhys++;
          }
          if (!sys.armorEnergyCustom && Number(sys.armorEnergy) !== defaultEner) {
            updates["system.armorEnergyCustom"] = true;
            flaggedEner++;
          }
          if (Object.keys(updates).length) {
            await item.update(updates);
            console.log(`[FASERIP] Flagged custom armor override: ${actor.name} / ${item.name}`, updates);
          }
        }
      }
      if (flaggedPhys || flaggedEner) {
        console.log(`[FASERIP] Armor override migration: ${flaggedPhys} physical, ${flaggedEner} energy flagged as custom`);
      }
    } catch (e) {
      console.warn("[FASERIP WARN] Armor custom-flag migration failed:", e);
    }
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

  // Nullify aura region hooks (token movement tracking, enter/exit)
  try {
    registerNullifyAuraHooks();
  } catch (e) {
    console.warn("MSH FASERIP | Failed to register nullify aura hooks:", e);
  }

  // Manual mode chat listeners
  try { ManualModeDialog.setupChatListeners(); }
  catch (e) { console.warn("Manual toggle setup failed:", e); }

  // Register macros (lazy-loaded â€” quick-heal.js is a self-executing script, not an ES module)
  game.msh.macros = {
    quickHeal: async () => {
      const script = await fetch("systems/msh-faserip/macros/quick-heal.js").then(r => r.text());
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      await new AsyncFunction(script)();
    }
  };
  console.log("[FASERIP] Macros registered");

  // â”€â”€ Regeneration power auto-sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          const isCorrect = scopeFlags?.ongoingId === "regeneration";
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
          e.flags?.[scope]?.ongoingId === "regeneration"
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

    // â”€â”€ Defense power auto-sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // system.combatMods.attackShift â€” the old key was never read during attack resolution.
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
      if (impairedMigrated) console.log(`[FASERIP] Migrated ${impairedMigrated} Impaired Endurance AE(s): fixed columnShift â†’ combatMods.attackShift`);
    } catch (e) {
      console.warn("[FASERIP WARN] AE migration failed:", e);
    }
  }

});

// â”€â”€ Block CTT/auto-expiry from deleting ongoing engine AEs â”€â”€
// CTT's effects-manager and the built-in duration system can try to expire AEs.
// This hook prevents that for Regeneration while allowing intentional
// deletions (stopRegeneration, GM removal, etc).
// Dying AEs are NOT protected here â€” they have no duration so auto-expiry
// won't fire, and GMs need to be able to delete them from the sheet.
Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
  const ongoingId = effect.flags?.[scope]?.ongoingId;

  // Allow intentional deletions (from our own code)
  if (options?.mshIntentional) return;

  // Protect regeneration AEs
  if (ongoingId === "regeneration") {
    console.log(`[FASERIP] Blocked auto-expiration of Regeneration AE on ${effect.parent?.name}`);
    return false;
  }

  // Protect defense AEs (body armor, force field, resistance)
  if (effect.flags?.[scope]?.effectCategory === "defense") {
    console.log(`[FASERIP] Blocked auto-expiration of defense AE on ${effect.parent?.name}`);
    return false;
  }

  // Protect impaired endurance â€” managed by rest system, not time expiry
  // But allow expiry on dead/deactivated actors (no point preserving it)
  if (effect.flags?.[scope]?.isImpairedEndurance) {
    const parentActor = effect.parent;
    if (parentActor?.system?.details?.isDead || parentActor?.system?.details?.isDeactivated) {
      return; // allow â€” actor is dead, let it clean up
    }
    console.log(`[FASERIP] Blocked auto-expiration of Impaired Endurance AE on ${parentActor?.name}`);
    return false;
  }

  // Protect dying AE â€” managed by processDyingRound, not time expiry
  // But allow deletion if actor is already dead/deactivated (processDyingRound death path)
  if (effect.flags?.[scope]?.isDying || effect.flags?.[scope]?.ongoingId === "dying") {
    const parentActor = effect.parent;
    if (parentActor?.system?.details?.isDead || parentActor?.system?.details?.isDeactivated) {
      return; // allow â€” actor already dead, clean up the AE
    }
    console.log(`[FASERIP] Blocked auto-expiration of Dying AE on ${parentActor?.name}`);
    return false;
  }
});

// â”€â”€ Regeneration: sync AEs with power items â”€â”€
// â”€â”€ Power â†’ Ongoing Effect Auto-Sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Defense effects sync (body armor, force field, resistance) â”€â”€
  try {
    const { syncDefenseEffects } = await import("./modules/effects/defense-effects.js");
    await syncDefenseEffects(actor, item, removing);
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to sync defense effects:", e);
  }

  const regenType = removing ? "" : (item.system?.regenerationType || "");
  const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";

  // â”€â”€ Regeneration (Resting) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Regeneration (Solar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ None / Removing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    || changes.system?.armorPhysical !== undefined
    || changes.system?.armorEnergy !== undefined
    || changes.system?.armorPhysicalCustom !== undefined
    || changes.system?.armorEnergyCustom !== undefined
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

// Sync defense AEs when an unlinked token is placed on the canvas
Hooks.on("createToken", async (tokenDoc, options, userId) => {
  if (!game.user.isGM) return;
  const actor = tokenDoc.actor;
  if (!actor || tokenDoc.actorLink) return;
  const powers = actor.items.filter(i => i.type === "power");
  const hasDefense = powers.some(p => p.system?.isBodyArmor || p.system?.isForceField || p.system?.isResistance);
  if (!hasDefense) return;
  try {
    const { syncAllDefenseEffects } = await import("./modules/effects/defense-effects.js");
    await syncAllDefenseEffects(actor);
    console.log(`[FASERIP] Defense AEs synced for new token: ${tokenDoc.name}`);
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to sync defense AEs on token create:", e);
  }
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
    // at the new max Health, skip damage processing â€” this is not combat damage.
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

    const currentHealth = Number(newHealth ?? 0);

    // ===== 0 HP DEATH SAVE â€” runs BEFORE throttle so it is never swallowed =====
    if (currentHealth <= 0) {
      // Skip if combat system already handling death save (applyDamageToTargets)
      if (game.msh?._combatDamageInProgress) {
        console.log(`FASERIP | Skipping init.js death save - combat system handling`);
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        actor.setFlag(scope, "wasKnockedOut", true);
        return;
      }

      // Dedupe: don't fire twice for the same 0-HP event in the same tick
      const deathKey = `death-${actor.id}-${oldHealth}-${newHealth}`;
      if (game.msh._processingDeath === deathKey) {
        console.log("FASERIP | Skipping duplicate 0-HP death save processing");
        return;
      }
      game.msh._processingDeath = deathKey;
      setTimeout(() => { if (game.msh._processingDeath === deathKey) delete game.msh._processingDeath; }, 200);

      console.log(`%cFASERIP | !!! ${actor.name} is at ${currentHealth} HP - triggering death save`, 'color: #ef5350; font-weight: bold');

      // Four-Color Rule: skip death save unless the attack was lethal (kill result)
      // Without attack context here, we can only check the setting â€” if fourColor is on
      // and no kill result flag is pending, apply non-lethal knockout instead.
      const fourColor = game.settings.get("msh-faserip", "fourColorRule");
      const pendingKill = game.msh?._pendingKillResult?.[actor.id];
      if (pendingKill) delete game.msh._pendingKillResult[actor.id];
      const isLethal = !!pendingKill;

      if (fourColor && !isLethal) {
        console.log(`[FASERIP] Four-Color Rule active â€” non-lethal knockout for ${actor.name}`);
        const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
        const durationRoll = await new Roll(`1${stunDie}`).evaluate();
        const rounds = durationRoll.total;
        const { _applyFourColorKnockout } = await import("./modules/actions/action-utils.js");
        await _applyFourColorKnockout(actor, rounds);
        await ChatMessage.create({
          content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
            <strong>${actor.name}</strong> is unconscious (0 Health) for ${rounds} round${rounds !== 1 ? "s" : ""}.
            <div style="font-size:0.9em;color:#666;margin-top:4px;">Four-Color Rule: No death save (non-lethal).</div>
          </div>`
        });
      } else {
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
            <button class="death-save-button" data-action="death-save" data-actor-uuid="${actor.uuid}">Roll Death Save</button>
          </div>`
        });
      }
      } // end fourColor else

      console.log("FASERIP | At 0 HP - death save will handle effects");

      // Mark KO for Recovery guard AFTER death save (fire-and-forget to avoid re-entrant updateActor)
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
      actor.setFlag(scope, "wasKnockedOut", true);

      // Still record damage timestamp for rest system
      const { recordDamage } = await import("./modules/rest-system.js");
      await recordDamage(actor);
    } else {
      // === Above 0 HP: record damage for rest system (throttled) ===

      // Throttle rest-system timer creation (1.5s per actor) â€” only for non-death damage
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

      console.log("FASERIP | Above 0 HP - recording damage for rest eligibility");

      // Clear KO flag only on new conscious damage (oldHealth > 0 means they were
      // already conscious and took a hit). If oldHealth was 0, this is a consciousness
      // recovery (health restored from 0), so the KO flag should stay â€” per rules p.32,
      // Recovery is unavailable after being knocked unconscious; only hourly Healing applies.
      const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
      if (oldHealth > 0 && actor.getFlag(scope, "wasKnockedOut")) {
        await actor.unsetFlag(scope, "wasKnockedOut");
      }

      const { recordDamage } = await import("./modules/rest-system.js");
      await recordDamage(actor);
    }

  } catch (err) {
    console.error("FASERIP | Error in updateActor damage hook:", err);
  }
});

// Handle medical care toggle button in chat
Hooks.on('renderChatMessageHTML', (message, htmlEl) => {
  // Recharge button on expired equipment chat cards
  htmlEl.querySelector('.faserip-recharge-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn("Actor not found.");
    const item = actor.items.get(itemId);
    if (!item) return ui.notifications.warn("Equipment not found.");

    // Re-enable all transfer effects on this item
    const transferEffects = item.effects.filter(e => e.transfer && e.disabled);
    if (!transferEffects.length) return ui.notifications.info(`${item.name} is already active.`);

    const updates = transferEffects.map(e => ({ _id: e.id, disabled: false }));
    await item.updateEmbeddedDocuments("ActiveEffect", updates);

    // Disable button after use
    button.disabled = true;
    button.style.opacity = '0.5';
    button.innerHTML = '<i class="fas fa-check"></i> Recharged';

    // Post confirmation chat card
    const rechargeLabel = item.system?.rechargeLabel || "Reload";
    ChatMessage.create({
      content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
          <strong style="color:#8b0000;">EQUIPMENT</strong>
        </div>
        <div style="padding:6px 10px;">
          <div><strong>${actor.name}</strong> turns <strong style="color:#2e7d32;">ON</strong>: <strong>${item.name}</strong> (${rechargeLabel})</div>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  });

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
      // (Quiet mode) â€” no chat card spam on toggle
            
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
  // GM-only â€“ players don't mutate actors/effects here
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
  // NOTE: Dying is NOT processed here â€” it's handled exclusively by the combatRound hook.
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
        
        // Skip ongoing engine effects â€” they manage their own lifecycle
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
        
        // v14: core already computes duration.expired / duration.remaining
        // for value+units effects. Trust it and short-circuit before the
        // legacy v13 shape checks (which only look at d.rounds / d.seconds
        // and would otherwise miss every v14-shaped effect).
        if (d.expired === true || (Number.isFinite(d.remaining) && d.remaining <= 0 && (Number.isFinite(d.value) ? d.value > 0 : false))) {
          toDelete.push({ effect: ef, reason: `expired per core (value ${d.value} ${d.units}, remaining ${d.remaining})` });
          continue;
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
      // NOTE: Health restoration on wake-up is handled by the rest-system's
      // deleteActiveEffect hook (attemptRegainConsciousness), which rolls the
      // required Endurance FEAT per rules. Do NOT auto-restore health here.
      for (const { effect, reason } of toDelete) {
        console.log(`[FASERIP] Auto-expiring effect "${effect.name}" on ${a.name}: ${reason}`);
        
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
      if (eff?.duration?.rounds && eff?.id) {  // â† ADD: && eff?.id
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
          if (transferEffects.length && ["gear", "custom", "device", "armor"].includes(system.category)) {
            const anyActive = transferEffects.some(e => !e.disabled);
            const updates = transferEffects.map(e => ({ _id: e.id, disabled: anyActive }));
            await item.updateEmbeddedDocuments("ActiveEffect", updates);
            const state = anyActive ? "OFF" : "ON";
            const dur = Number(item.system.duration);
            const unit = item.system.durationUnit || "hour";
            let durationLine = "";
            if (!anyActive && dur > 0) {
              const unitLabel = dur === 1 ? unit : unit + "s";
              durationLine = \`<div style="font-size:0.85em;color:#666;margin-top:4px;">Duration: \${dur} \${unitLabel}</div>\`;
            }
            ChatMessage.create({
              content: \`<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
                <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
                  <strong style="color:#8b0000;">EQUIPMENT</strong>
                </div>
                <div style="padding:6px 10px;">
                  <div><strong>\${actor.name}</strong> turns <strong style="color:\${anyActive ? '#c62828' : '#2e7d32'}">\${state}</strong>: <strong>\${item.name}</strong></div>
                  \${durationLine}
                </div>
              </div>\`,
              speaker: ChatMessage.getSpeaker({ actor })
            });
          } else if (system.intensityRank && !transferEffects.length) {
            // Gear with intensity rank but no toggle effects: roll intensity
            const { ActionDispatcher } = await import(\`/systems/\${game.system.id}/scripts/modules/actions/action-dispatcher.js\`);
            await ActionDispatcher.roll("intensity", {
              actor,
              abilityName: "endurance",
              opts: { itemId: item.id, item, sourceItem: item, equipment: item }
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
