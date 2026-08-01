// chat-hooks.js v1.7.4 - 2026-08-01
// v1.7.4: administer-antitoxin chat button handler (3b). Treater = selected
//         token; poison-engine validates First Aid/Medicine + antitoxin item.
// v1.7.3: Fix automatic-nullification card text (Endurance 2+ ranks below
//         intensity, not 3+) per adopted Impossible FEATs rule.
// chat-hooks.js v1.7.2 - 2026-07-03
// v1.7.2: apply-damage handler reads data-is-magic and forwards isMagic so
//         a magical resistance reduces magical damage on the manual path
//         (powers audit Step #4 slice 4b wiring).
// chat-hooks.js v1.7.1 - 2026-07-02
// v1.7.1: reflect-attack validates the button's data-bank-id against the
//         live pendingReflect bank. Stale prompt cards (superseded by a
//         newer bank or already consumed) now report that plainly instead
//         of the generic no-pending warning.
// chat-hooks.js v1.7.0 - 2026-07-02
// v1.7.0: Energy Reflection redirect handler (Step #3 slice 2). reflect-attack
//         button consumes the pendingReflect flag (validating the same-round
//         window), rolls a direct Agility FEAT via rollUniversalTable (no
//         Karma hooks per RAW), and on green+ routes the banked damage to the
//         user's target (falling back to the original attacker's token)
//         through applyDamageToTargets so the new target defends normally.
// chat-hooks.js v1.6.0 - 2026-04-30
// v1.6.0: Deal Hold Damage and Escape Attempt dialogs wrapped in frp-dlg + frp-header-v3.
//         Hold Damage now resolves attackerUuid → name for the header banner;
//         slider/target/armor boxes converted to frp-box pattern. Escape Attempt
//         uses blue header gradient (matches escaping-action.js standalone),
//         compact CS row, fx-grid effect preview, frp-foot checkboxes.
// v1.5.9: Drop deprecated CONST.CHAT_MESSAGE_TYPES.OTHER on the damage
//         chat card. Removed in v13 (replaced by CHAT_MESSAGE_STYLES).
//         Default non-roll style is OTHER already.
// v1.5.8: Remove chat button click handlers and dead code
// v1.5.6: Fix Apply Damage and Resolve Slam buttons not working in semi mode - canDriveAutoSaves bail was blocking all button handler registration for non-owners
// v1.5.7: Fix reload - prefer token actor over world actor (unlinked tokens have separate item copies)
// v1.5.6: Fix reload handler - use pointerEvents/opacity disable for <a> tag (disabled prop is button-only)
// v1.5.5: Fix reload handler - resolve synthetic token actors via canvas.tokens
// v1.5.4: Add reload button handler for out-of-ammo chat card
// v1.5.3: Fix dodge reapply - add movementMult and selfPenaltyCS to AE changes (was missing same as defense-action.js)
// v1.5.2: Fix createEvadingEffect - pass evadeSuccessful/autoHit to applyEvade for proper flag tracking
// v1.5.1: Wire dodge CS penalty to Active Effect changes (defenseShift/defenseShiftRanged)
// v1.5.0: Add grapple-back handler for Reverse escape result
// v1.4.0: Add hold-damage handler for Full Hold grappling damage
// v1.3.0: Add detailed logging for escape effect removal debugging
// v1.2.0: Fix escape karma default unchecked, add grappled effect removal on successful escape
// v1.1.0: Add kill-save handler (conscious dying), update death-save to pass fromZeroHealth
// v1.0.4: Add apply-collision-damage handler that applies directly to UUID
// v1.0.3: Add stopImmediatePropagation to collision handlers to prevent duplicate dialogs
// v1.0.2: Add .calculate-slam-collision handler for slam result collision buttons (both standalone and collapsible)
// scripts/modules/actions/chat-hooks.js
import { ActionDispatcher } from "./action-dispatcher.js";
import { resolveCombatMode } from "./action-dispatcher.js";

import { openBreakingFeatDialog, executeBreakingFeat } from "./breaking-feat.js";
import { openGrabbingBreakDialog } from "./grabbing-break.js";
import { openCollisionDamageDialog } from "./collision-damage.js";
import { 
  shiftRank, 
  rollWithKarmaAndHistory, 
  buildResultGrid, 
  bannerColors, 
  effectsFor,
  applyDamageToTargets,
  applyDamageToActorUuid,
  getBodyArmorValues,
  debugLog
} from "./action-utils.js";
import { startAura, stopAura, isAuraMaintained } from "./nullify.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";
import * as Effects from "../effects/effect-engine.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

/**
 * Handle escape check from chat card button
 * The escaping character is the current user's character or selected token
 */
async function handleEscapeCheck({ defenderUuid, defenderName, defenderRank }) {
  // The "defender" in this context is the person holding - we need the escaping character
  // which should be the current user's controlled token or character
  let escapingActor = null;
  
  // Try selected token first
  const controlled = canvas.tokens?.controlled?.[0];
  if (controlled?.actor) {
    escapingActor = controlled.actor;
  }
  
  // Fall back to user's character
  if (!escapingActor) {
    escapingActor = game.user?.character;
  }
  
  if (!escapingActor) {
    ui.notifications.warn("Select your token or set a character to attempt escape.");
    return;
  }
  
  // Call the escaping action with prefill data about the holder
  await ActionDispatcher.roll("escaping", {
    actor: escapingActor,
    opts: {
      prefill: {
        opponentName: defenderName || "",
        opponentStr: defenderRank || ""
      }
    }
  });
}

export function installActionChatHandlers() {
  // idempotent guard
  game.msh ??= {};
  if (game.msh.chatHooksInstalled) return;
  game.msh.chatHooksInstalled = true;

  // Helper to safely set flags only if user has permission
  async function safeSetFlag(message, scope, key, value) {
    try {
      // Check if user can modify this message
      if (!message.isOwner && !game.user.isGM) {
        debugLog(`Skipping flag set (no permission): ${key}`, { msgId: message.id, user: game.user.name });
        return false;
      }
      await message.setFlag(scope, key, value);
      return true;
    } catch (err) {
      console.warn(`Failed to set flag ${key} on message ${message.id}:`, err.message);
      return false;
    }
  }

  // SINGLE combined hook for all chat interactions
  Hooks.on("renderChatMessageHTML", async (message, htmlEl /* HTMLElement */, data) => {
    const html  = $(htmlEl);
    const SCOPE = game.system?.id || "msh-faserip";

    // --- NEW: Full-Auto damage application (idempotent)
    try {
      const flags      = message?.flags?.[SCOPE] ?? {};
      const shouldAuto = flags?.autoApply === true;
      const already    = flags?.autoApplied === true;
      const results    = flags?.results;

      if (shouldAuto && !already && Array.isArray(results) && results.length) {
        debugLog("Auto-applying damage", { msgId: message.id, targets: results.length });
        await applyDamageToTargets(results, { messageId: message.id });
        await safeSetFlag(message, SCOPE, "autoApplied", true); // guard against re-renders
      }
    } catch (err) {
      console.error("Auto-apply failed:", err);
    }

    // Four-Color knockout: GM sees the real round count; players see "?"
    try {
      const fcKO = message?.flags?.[SCOPE]?.fourColorKnockout;
      if (fcKO && game.user.isGM) {
        const roundsEl = htmlEl.querySelector(".msh-fc-rounds");
        if (roundsEl) roundsEl.textContent = String(fcKO.rounds);
        const metaEl = htmlEl.querySelector(".msh-fc-meta");
        if (metaEl) metaEl.textContent = `Four-Color Rule (GM only): players see "? rounds".`;
      }
    } catch (err) {
      console.error("Four-Color render substitution failed:", err);
    }

    // FF Breach Psyche FEAT failure: GM sees the real round count; players see "?"
    try {
      const ffbKO = message?.flags?.[SCOPE]?.ffBreachKnockout;
      if (ffbKO && game.user.isGM) {
        const roundsEl = htmlEl.querySelector(".msh-ffb-rounds");
        if (roundsEl) roundsEl.textContent = String(ffbKO.rounds);
      }
    } catch (err) {
      console.error("FF Breach render substitution failed:", err);
    }

    // Wake attempts: GM sees the roll value and exact rounds; players see redacted
    try {
      const wakeFail = message?.flags?.[SCOPE]?.wakeFail;
      if (wakeFail && game.user.isGM) {
        const rollEl = htmlEl.querySelector(".msh-wake-roll");
        if (rollEl) rollEl.textContent = ` (rolled ${wakeFail.roll})`;
        const roundsEl = htmlEl.querySelector(".msh-wake-rounds");
        if (roundsEl) roundsEl.textContent = String(wakeFail.rounds);
      }
      const wakeSuccess = message?.flags?.[SCOPE]?.wakeSuccess;
      if (wakeSuccess && game.user.isGM) {
        const rollEl = htmlEl.querySelector(".msh-wake-roll");
        if (rollEl) rollEl.textContent = ` (rolled ${wakeSuccess.roll})`;
      }
    } catch (err) {
      console.error("Wake-attempt render substitution failed:", err);
    }

    // Bail if already auto-processed (prevents double-fire on rerender/notify)
    const alreadyHandled = await message.getFlag(SCOPE, "autoSaveHandled");

    // Only ONE client should drive auto-save logic to prevent race conditions.
    // GM always wins; if no GM is active, fall back to message owner.
    const hasActiveGM = game.users?.some(u => u.isGM && u.active);
    const canDriveAutoSaves = hasActiveGM ? game.user.isGM : message.isOwner;

    // Auto-save logic block — only runs for message owner/GM, only once per message.
    // Synchronous in-memory claim guards against the race where two renders of
    // the same message fire close together (e.g. flag-commit re-render) before
    // the persisted autoChecksDone flag commits — both hook iterations read
    // autoChecksDone=false and both fire the auto-save. Symptom: Psionic Attack
    // rolls the save twice (one GREEN/Resisted, one WHITE/Failed → unconscious).
    const _autoSaveClaims = (game.msh._autoCheckClaims ??= new Set());
    if (canDriveAutoSaves && !alreadyHandled && !_autoSaveClaims.has(message.id)) {
    _autoSaveClaims.add(message.id);

    let firedAnyCheck = false; // <— track if we actually ran something

   // --- NEW: Full-Auto auto-rolling of saves (Stun/Slam/Kill/Nullify/Death) ---
    try {
      const alreadyChecks = message?.flags?.[SCOPE]?.autoChecksDone === true;
      if (!alreadyChecks) {
        const didSet = await safeSetFlag(message, SCOPE, "autoChecksDone", true);
        if (!didSet) {
          if (game.settings.get("msh-faserip", "debugMode")) {
            console.log("FASERIP | autoChecksDone not set - skipping auto-saves", {
              msgId: message.id,
              user: game.user.name
            });
          }
          // Skip auto-saves but fall through to button handler registration
        }
        if (didSet) {

        // Derive an "owner" actor (attacker or speaker)
        let ownerActor = null;
        try {
          const attackerUuid = message?.flags?.[SCOPE]?.attackerUuid || message?.speaker?.actor;
          if (attackerUuid) {
            const doc = await fromUuid(attackerUuid);
            ownerActor = doc?.actor ?? doc ?? null;
          }
        } catch (_){}
        ownerActor = ownerActor ?? game.actors?.get(message.speaker?.actor) ?? game.user?.character ?? null;

        const mode = resolveCombatMode(ownerActor);
        if (mode === "full") {
          const chips     = html.find('a.faserip-chip[data-check]');
          const forceBtns = html.find('[data-action="force-save"], [data-action="force-save-nullify"], [data-action="force-power-save"]');
          const deathBtns = html.find('[data-action="death-save"]');

          // Track which (checkType, defender) pairs we've already auto-run for this message
          const autoSaveDefenderKeys = new Set();

          // Per-chip auto run (Stun/Slam/Kill). Chips from attacks include per-target prefill.
          // Auto-run Stun/Slam/Kill per defender in Full mode
          // Pre-fetch resolvedChecks once outside the loop
          const messageResolvedChecks = message?.flags?.[SCOPE]?.resolvedChecks || [];

          for (const el of chips.toArray()) {
            const checkType  = el.dataset.check;                // "stun"|"slam"|"kill"|"escape"
            if (checkType === "escape") continue;               // not a save

            // Skip if attack-action has already (or is about to) auto-trigger this check.
            // Without this skip, applySlam/applyStun get called twice for the same
            // defender — the second call's delete-then-create dedup makes Times-Up
            // emit a phantom "expired" card for the intermediate AE.
            if (messageResolvedChecks.includes(checkType)) {
              if (game.settings.get("msh-faserip", "debugMode")) {
                console.log(`FASERIP | Skipping ${checkType} chip auto-fire — attack-action handles it`);
              }
              continue;
            }

            const attackForm = el.dataset.attackForm || "blunt";

            // Resolve defender (preferred in this order)
            let saveActor = null;
            const saveUuid = el.dataset.targetUuid
                          || el.dataset.defenderUuid
                          || (el.dataset.prefill ? (JSON.parse(el.dataset.prefill.replaceAll("&apos;","'")).targetUuid || "") : "")
                          || "";

            if (saveUuid) {
              try {
                const doc = await fromUuid(saveUuid);
                saveActor = doc?.actor ?? doc ?? null;
              } catch (_){}
            }
            if (!saveActor && game.user?.targets?.size === 1) {
              saveActor = game.user.targets.first()?.actor ?? null;
            }
            if (!saveActor) continue;

            // Skip stun/slam/kill if target is a vehicle — no Endurance stat
            if (saveActor.type === "vehicle") {
              if (game.settings.get("msh-faserip", "debugMode")) {
                console.log(`FASERIP | Skipping ${checkType} auto-save - target is a vehicle`);
              }
              continue;
            }

            // Skip stun/slam if target is at 0 HP - death save handles unconscious state
            if (checkType === "stun" || checkType === "slam") {
              const currentHp = saveActor.system?.attributes?.health?.value ?? 0;
              if (currentHp <= 0) {
                if (game.settings.get("msh-faserip", "debugMode")) {
                  console.log(`FASERIP | Skipping ${checkType} auto-save - target at 0 HP, death save handles state`);
                }
                continue;
              }
            }

            // Only auto-run on a client that can control this defender
            const canControlDefender = saveActor?.isOwner || game.user.isGM;
            if (!canControlDefender) {
              if (game.settings.get("msh-faserip", "debugMode")) {
                console.log("FASERIP | Auto-save skipping for defender I don't own", {
                  msgId: message.id,
                  user: game.user.name,
                  defender: saveActor.name
                });
              }
              continue;
            }

            // De-duplicate: one save per defender per check type per message
            const defUuid = saveActor.uuid || saveActor.id || saveActor.name;
            const key = `${checkType}:${defUuid}`;
            if (autoSaveDefenderKeys.has(key)) {
              if (game.settings.get("msh-faserip", "debugMode")) {
                console.log("FASERIP | Skipping duplicate auto-save", { key, defender: saveActor.name });
              }
              continue;
            }
            autoSaveDefenderKeys.add(key);

            // Only auto-run if the DEFENDER is in Full mode
            if (resolveCombatMode(saveActor) !== "full") continue;

            // Build prefill if present
            let prefill = {};
            try {
              if (el.dataset.prefill) {
                prefill = JSON.parse(el.dataset.prefill.replaceAll("&apos;","'"));
              }
            } catch (_){}

            // Ensure dmgThrough is available (slam/stun gates use it)
            if (prefill && typeof prefill.dmgThrough === "undefined") {
              prefill.dmgThrough = Number(el.dataset.dmg || 0);
            }
            if (!prefill.targetUuid && saveActor?.uuid) {
              prefill.targetUuid = saveActor.uuid;
              prefill.targetName = saveActor.name || "Target";
              prefill.targetEndRank = saveActor?.system?.abilities?.endurance?.rank || "Good";
            }

            // inside chips loop when roll: used
            await game.msh.actions.roll(checkType, {
              actor: saveActor,
              opts: { attackForm, prefill, autoApply: true }
            });
            firedAnyCheck = true;
          }

          // Nullify / Force Save auto-run if the message indicates a save is required
          const f = message?.flags?.[SCOPE] ?? {};
          if (forceBtns.length && f?.requiresSave) {
            // Prefer the flagged defender, else first selected target
            let saveActor = null;
            const defUuid = f?.defenderUuid || f?.targetUuid || "";
            if (defUuid) {
              try {
                const doc = await fromUuid(defUuid);
                saveActor = doc?.actor ?? doc ?? null;
              } catch (_){}
            }
            if (!saveActor && game.user?.targets?.size === 1) {
              saveActor = game.user.targets.first()?.actor ?? null;
            }
            if (saveActor && resolveCombatMode(saveActor) === "full") {
              await game.msh.actions.roll("power-save", {
                actor: saveActor,
                abilityName: f.saveAbility || "endurance",
                opts: {
                  intensity: f.saveIntensity || "power-rank",
                  fixedRank: f.saveFixedRank || "",
                  autoApply: true,
                  effectName: f.effectName,
                  failMessage: f.failMessage,
                  powerName: f.powerName
                }
              });
              // Disable force-save buttons so manual click can't double-fire
              for (const btn of forceBtns.toArray()) {
                btn.setAttribute("aria-disabled", "true");
                btn.dataset.autoDisabled = "1";
                btn.style.pointerEvents = "none";
                btn.style.opacity = "0.55";
                btn.style.cursor = "not-allowed";
                btn.style.filter = "grayscale(.3)";
              }
              firedAnyCheck = true;
            }
          }

          // Death Save auto-run
          /* if (deathBtns.length) {
            await game.msh.actions.roll("death-save", { actor: ownerActor });
            firedAnyCheck = true;
          } */
          
          // mark handled only if we actually ran something
          if (firedAnyCheck) {
            await safeSetFlag(message, SCOPE, "autoSaveHandled", true);
          }
        } // end if (mode === "full")
        } // end if (didSet)
      } // end !alreadyChecks
    } catch (err) {
      console.error("Auto-save rolling failed:", err);
    }
    // --- END auto-rolling saves ---
    } // end canDriveAutoSaves && !alreadyHandled block

    // Check if this message has an undo flag
    const undoData = message.flags?.[SCOPE]?.undo;

    if (undoData?.results?.length) {
      // This message has been applied - transform button (GM only)
      const applyBtn = html.find('[data-action="apply-damage"]');
      if (applyBtn.length) {
        if (game.user.isGM) {
          applyBtn.attr('data-action', 'undo-apply');
          applyBtn.text('Undo');
          applyBtn.attr('title', 'Revert these HP changes');
          applyBtn.prop('disabled', false);
        } else {
          applyBtn.text('Applied');
          applyBtn.attr('title', 'Damage applied');
          applyBtn.prop('disabled', true);
        }
      }
    }

    // Disable chips for checks already resolved (persisted across re-renders)
    const resolvedChecks = message.flags?.[SCOPE]?.resolvedChecks || [];
    if (resolvedChecks.length) {
      html.find("a.faserip-chip[data-check]").each(function() {
        const chipEl = this;
        if (resolvedChecks.includes(chipEl.dataset.check)) {
          chipEl.setAttribute("aria-disabled", "true");
          chipEl.style.pointerEvents = "none";
          chipEl.style.opacity = "0.55";
          chipEl.style.cursor = "not-allowed";
          chipEl.style.filter = "grayscale(.3)";
        }
      });
    }

    // Disable force-save buttons if auto-save already handled this message
    if (message.flags?.[SCOPE]?.autoSaveHandled) {
      html.find('[data-action="force-save"], [data-action="force-save-nullify"], [data-action="force-power-save"]').each(function() {
        this.setAttribute("aria-disabled", "true");
        this.dataset.autoDisabled = "1";
        this.style.pointerEvents = "none";
        this.style.opacity = "0.55";
        this.style.cursor = "not-allowed";
        this.style.filter = "grayscale(.3)";
      });
    }

    // 1) Stun/Slam/Kill/Escape chips
    html.on("click", "a.faserip-chip[data-check]", async (ev) => {
        // Respect disabled state
        const el = ev.currentTarget;
        if (el.getAttribute?.("aria-disabled") === "true" || el.dataset.autoDisabled === "1") {
          ev.preventDefault();
          return;
        }

      ev.preventDefault();

      // Disable immediately to prevent double-clicks
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
      el.style.opacity = "0.55";
      el.style.cursor = "not-allowed";
      el.style.filter = "grayscale(.3)";

      //const el = ev.currentTarget;

      const checkType    = el.dataset.check;                // "stun" | "slam" | "kill" | "escape"
      const attackForm   = el.dataset.attackForm || "blunt";
      const dmgThrough   = Number(el.dataset.dmg || 0);
      const borderline   = el.dataset.borderline === "1";
      if (dmgThrough <= 0 && !borderline && checkType !== "escape") {
        // Re-enable if not applicable
        el.removeAttribute("aria-disabled");
        el.style.pointerEvents = "";
        el.style.opacity = "";
        el.style.cursor = "pointer";
        el.style.filter = "";
        ui.notifications.info("No penetrating damage; effect not applicable.");
        return;
      }

      const attackerUuid = el.dataset.attackerUuid || message.speaker?.actor;

      // Escape-specific data
      const defenderUuid = el.dataset.defenderUuid;
      const defenderName = el.dataset.defenderName;
      const defenderRank = el.dataset.defenderRank;

      // Handle escape checks separately
      if (checkType === "escape") {
        await handleEscapeCheck({ defenderUuid, defenderName, defenderRank });
        return;
      }

      // Resolve an owner actor for dialog/message context
      let ownerActor = null;
      try {
        if (attackerUuid) {
          const doc = await fromUuid(attackerUuid);
          ownerActor = doc?.actor ?? doc ?? null;
        }
      } catch (_) {}
      ownerActor = ownerActor ?? game.actors?.get(message.speaker?.actor) ?? game.user?.character ?? null;

      // Smart auto-population from targeted tokens
      let prefill = { dmgThrough, attackForm };

      // Merge prefill data from the chip (includes attackerStrength, attackerName, etc.)
      try {
        if (el.dataset.prefill) {
          const chipPrefill = JSON.parse(el.dataset.prefill.replaceAll("&apos;","'"));
          Object.assign(prefill, chipPrefill);
        }
      } catch (_) {}

      const targets = game.user.targets;
      
      if (targets.size === 1) {
        const targetToken = targets.first();
        const targetActor = targetToken.actor;
        
        if (targetActor) {
          prefill.targetName = targetToken.name;
          prefill.targetEndRank = targetActor.system?.abilities?.endurance?.rank || "Good";
          prefill.targetUuid = targetActor.uuid;
          
          console.log(`FASERIP | Auto-populated target: ${prefill.targetName} (Endurance: ${prefill.targetEndRank})`);
        }
      } else if (targets.size > 1) {
        ui.notifications.warn("Multiple tokens targeted. Please select only one target for this check.");
      }

      const SCOPE = game.system?.id || "msh-faserip";
      const already =
        message.getFlag(SCOPE, "autoChecksRun") ||
        message.getFlag(SCOPE, "autoApplied"); // if you use this elsewhere
      if (already) return; // Full Auto already resolved saves/effects

      console.debug("FASERIP chip click ->", { checkType, attackForm, dmgThrough, ownerActor: ownerActor?.name, prefill });

      try {
        await ActionDispatcher.roll(checkType, {
          actor: ownerActor,
          opts: {
            attackForm,
            prefill
          }
        });

        // Persist resolved check to message flags so re-renders keep it disabled
        const resolved = message.getFlag(SCOPE, "resolvedChecks") || [];
        if (!resolved.includes(checkType)) {
          resolved.push(checkType);
          await safeSetFlag(message, SCOPE, "resolvedChecks", resolved);
        }
      } catch (err) {
        // Re-enable on error so user can retry
        el.removeAttribute("aria-disabled");
        el.style.pointerEvents = "";
        el.style.opacity = "";
        el.style.cursor = "pointer";
        el.style.filter = "";
        console.error(`FASERIP | ${checkType} resolve error:`, err);
      }
    });

    // 2) Breaking FEAT chip
    html.on("click", '[data-action="breaking-feat"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const weaponMat = btn.dataset.weaponMat || "Excellent";
      const targetMat = btn.dataset.targetMat || "";
      const weaponName = btn.dataset.weaponName || "";
      const itemUuid = btn.dataset.itemUuid || null;
      const actorUuid = btn.dataset.actorUuid;

      let actor = null;
      try {
        if (actorUuid) {
          const doc = await fromUuid(actorUuid);
          actor = doc?.actor ?? doc ?? null;
        }
      } catch (_) {}

      // Semi mode (or any mode with known target mat): roll directly, post chat card
      if (targetMat) {
        await executeBreakingFeat({ weaponMatRank: weaponMat, targetMatRank: targetMat, weaponName, itemUuid, actor, postChat: true });
      } else {
        // Fallback: open dialog to let user pick target material
        openBreakingFeatDialog({ weaponMatRank: weaponMat, targetMatRank: targetMat, actor });
      }
    });

    // 3) Grabbing Break Check chip
    html.on('click', '[data-action="grabbing-break"], [data-action="grabbing-break-check"]', async (ev) => {
      ev.preventDefault();
      const el = ev.currentTarget;
      try {
        const actorUuid = el.dataset.actorUuid;
        const actor = actorUuid ? await fromUuid(actorUuid) : null;
        const itemMaterial = el.dataset.itemMaterial || "Excellent";
        const itemName = el.dataset.itemName || "Item";
        const { openGrabbingBreakDialog } = await import("./grabbing-break.js");
        openGrabbingBreakDialog({ actor, itemMaterial, itemName });
      } catch (e) {
        console.error("[FASERIP] Grabbing Break handler failed:", e);
        ui.notifications.error("Could not open Grabbing Break dialog. See console for details.");
      }
    });

    // 3a) Wash continuing damage (corrosive, acid, etc.)
    html.on("click", '[data-action="wash-continuing-damage"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      const effectId = btn.dataset.effectId;
      if (!actorUuid || !effectId) return;
      try {
        const doc = await fromUuid(actorUuid);
        const actor = doc?.actor ?? doc ?? null;
        if (!actor) return;
        if (!actor.isOwner && !game.user.isGM) {
          ui.notifications.warn("You don't own this actor.");
          return;
        }
        const { washContinuingDamage } = await import("../effects/ongoing-engine.js");
        const ok = await washContinuingDamage(actor, effectId);
        if (ok) {
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.innerHTML = '<i class="fas fa-check"></i> Washed';
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div style="background:#e3f2fd;border:1px solid #0277bd;padding:6px;border-radius:4px;">
              <strong>${actor.name}</strong> washes off the corrosive — ongoing damage halted.
            </div>`
          });
        } else {
          ui.notifications.warn("Effect not found or cannot be washed.");
        }
      } catch (e) {
        console.error("[FASERIP] Wash continuing damage handler failed:", e);
      }
    });

    // 3b) Administer Antitoxin (poison-engine). Treater = selected token's
    // actor. Validates First Aid/Medicine talent + antitoxin item in-engine.
    html.on("click", '[data-action="administer-antitoxin"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      if (!actorUuid) return;
      try {
        const doc = await fromUuid(actorUuid);
        const patient = doc?.actor ?? doc ?? null;
        if (!patient) return;
        const healer = canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
        if (!healer) {
          ui.notifications.warn("Select the treating character's token first.");
          return;
        }
        if (!healer.isOwner && !game.user.isGM) {
          ui.notifications.warn("You don't own the treating character.");
          return;
        }
        const { administerAntitoxin } = await import("../effects/poison-engine.js");
        const result = await administerAntitoxin(patient, healer);
        if (result.ok) {
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.innerHTML = '<i class="fas fa-check"></i> Treated';
        } else {
          ui.notifications.warn(result.reason);
        }
      } catch (e) {
        console.error("[FASERIP] Administer antitoxin handler failed:", e);
      }
    });

    // 4) Collision Damage Calculator chip
    html.on("click", '[data-action="calculate-collision"]', async (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const btn = ev.currentTarget;
      
      const targetName = btn.dataset.targetName || "Target";
      const targetUuid = btn.dataset.targetUuid || "";
      const targetEndurance = btn.dataset.targetEndurance || "Good";
      const slamDistance = Number(btn.dataset.slamDistance || 1);

      openCollisionDamageDialog({ 
        targetName, 
        targetUuid,
        targetEndurance, 
        slamDistance 
      });
    });

    // Reload weapon from out-of-ammo chat card
    html.on("click", ".faserip-reload-weapon", async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const actorId  = btn.dataset.actorId;
      const itemId   = btn.dataset.itemId;
      const tokenId  = btn.dataset.tokenId;

      // Resolve actor: token actor first (unlinked tokens have their own item copies),
      // fall back to world actor only if no token
      let actor = tokenId ? canvas.tokens?.get(tokenId)?.actor : null;
      if (!actor) actor = game.actors?.get(actorId);
      if (!actor) {
        ui.notifications.warn("Could not find actor to reload.");
        return;
      }

      const item = actor.items?.get(itemId);
      if (!item) { ui.notifications.warn("Could not find weapon to reload."); return; }

      const fullShots = item.system.shots || 0;
      await item.update({ "system.shotsRemaining": fullShots });
      btn.textContent = `✓ ${item.name} reloaded (${fullShots})`;
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.55";
      btn.style.cursor = "not-allowed";
      btn.style.background = "#2e7d32";
    });

    // 4b) Slam Collision button (from slam check results)
    html.on("click", '.calculate-slam-collision', async (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const btn = ev.currentTarget;
      
      const targetUuid = btn.dataset.target || "";
      const slamDistance = Number(btn.dataset.distance || 1);
      
      // Try to get target name from UUID
      let targetName = "Target";
      if (targetUuid) {
        try {
          const resolved = await fromUuid(targetUuid);
          targetName = resolved?.name || resolved?.actor?.name || "Target";
        } catch (_) {}
      }

      openCollisionDamageDialog({ 
        targetName, 
        targetUuid,
        targetEndurance: "Good",  // Will be auto-populated from UUID
        slamDistance 
      });
    });

    // 5b) Apply Collision Damage button (applies directly to UUID, not targeted tokens)
    html.on("click", '[data-action="apply-collision-damage"]', async (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const btn = ev.currentTarget;
      btn.disabled = true;

      try {
        const damage = Number(btn.dataset.damage || 0);
        const targetUuid = btn.dataset.targetUuid;

        if (!targetUuid || !damage) {
          ui.notifications.warn("Missing target or damage for collision");
          btn.disabled = false;
          return;
        }

        // Note: applyDamageToActorUuid(damage, actorUuid, options)
        await applyDamageToActorUuid(damage, targetUuid);
        
        btn.textContent = "Applied";
        btn.style.background = "#c8e6c9";
        btn.style.cursor = "default";
      } catch (err) {
        console.error("[FASERIP ERROR] Apply Collision Damage failed:", err);
        ui.notifications.error("Failed to apply collision damage");
        btn.disabled = false;
      }
    });

    // 5) Apply Damage button
    // ── Energy Reflection: Agility FEAT redirect ──
    html.on("click", '[data-action="reflect-attack"]', async (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const btn = ev.currentTarget;
      btn.disabled = true;

      try {
        const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
        const reflectorUuid = btn.dataset.reflectorUuid || "";
        const attackerUuid = btn.dataset.attackerUuid || "";
        const cardBankId = btn.dataset.bankId || "";

        let reflector = reflectorUuid ? await fromUuid(reflectorUuid) : null;
        if (reflector?.actor) reflector = reflector.actor; // token-document uuid
        if (!reflector) { ui.notifications.warn("Reflecting actor not found."); return; }
        if (!game.user.isGM && !reflector.isOwner) {
          ui.notifications.warn(`You do not own ${reflector.name}.`);
          btn.disabled = false;
          return;
        }

        const bank = reflector.getFlag(scope, "pendingReflect");
        if (!bank || !(Number(bank.amount) > 0)) {
          ui.notifications.warn("No pending reflection — already used or expired.");
          return;
        }
        if (cardBankId && bank.bankId && cardBankId !== bank.bankId) {
          ui.notifications.warn("This reflection offer is stale — it was superseded by a newer blocked attack or already used.");
          return;
        }
        if (game.combat && bank.expiresRound != null && game.combat.round > bank.expiresRound) {
          await reflector.unsetFlag(scope, "pendingReflect");
          ui.notifications.warn("The reflection window has passed — the attack must be reflected in the round it occurs.");
          return;
        }

        // Target: current user target(s) first, else the original attacker's token.
        let targets = Array.from(game.user?.targets ?? []);
        if (!targets.length && attackerUuid) {
          const attacker = await fromUuid(attackerUuid);
          if (attacker?.actor) targets = [attacker];               // token document
          else if (attacker?.getActiveTokens) {
            const tok = attacker.getActiveTokens(true)[0];
            if (tok) targets = [tok];
          }
        }
        if (!targets.length) {
          ui.notifications.warn("Target a token to reflect at, then click Reflect again.");
          btn.disabled = false;
          return;
        }

        // Agility FEAT — direct roll, no Karma hooks. RAW: no Karma is lost
        // from the results of a reflected attack.
        const agilityRank = reflector.system?.abilities?.agility?.rank || "Typical";
        const roll = new Roll("1d100");
        await roll.evaluate();
        const color = rollUniversalTable(agilityRank, roll.total);
        const hit = color !== "white";

        const targetName = targets[0]?.name ?? targets[0]?.document?.name ?? "target";
        const typeLabel = String(bank.damageType || "energy").replace(/^energy-/, "").replace(/-/g, " ");
        const colorStyles = {
          white: "background:#f5f5f5;color:#333;border:1px solid #bbb",
          green: "background:#2e7d32;color:#fff",
          yellow: "background:#f9a825;color:#333",
          red: "background:#c62828;color:#fff"
        };

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: reflector }),
          rolls: [roll],
          content: `<div class="msh-card" style="background:#e8f0fe;border:1px solid #4a6fd8;padding:8px;border-radius:3px;">
            <strong>${reflector.name}</strong> reflects <b>${bank.amount}</b> ${typeLabel} damage at <strong>${targetName}</strong>!
            <div style="margin-top:4px;">Agility FEAT (${agilityRank}): rolled <b>${roll.total}</b>
              <span style="display:inline-block;padding:1px 8px;border-radius:8px;${colorStyles[color] || colorStyles.white}">${color.toUpperCase()}</span>
              — ${hit ? "the reflection hits!" : "the reflection misses."}
            </div>
            <div style="font-size:0.85em;color:#555;margin-top:4px;">No Karma is lost from the results of a reflected attack.</div>
          </div>`
        });

        if (hit) {
          await applyDamageToTargets({
            damage: Number(bank.amount) || 0,
            damageType: bank.damageType || "energy",
            attackForm: "energy",
            targets,
            attackerUuid: reflector.uuid,
            showNotification: true
          });
        }

        // One reflect attempt per banked attack, hit or miss.
        await reflector.unsetFlag(scope, "pendingReflect");
      } catch (err) {
        console.error("[FASERIP] reflect-attack handler failed:", err);
        ui.notifications.error("Reflection failed — see console.");
        btn.disabled = false;
      }
    });

    html.on("click", '[data-action="apply-damage"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      btn.disabled = true;

      try {
        // 1) Read inputs from the button/card
        const damage          = Number(btn.dataset.damage || 0);
        const attackerUuid    = btn.dataset.attackerUuid || null;
        const bypassArmor     = btn.dataset.bypassArmor === "true";
        const damageType      = (btn.dataset.damageType || "physical-blunt").toLowerCase();
        const attackForm      = (btn.dataset.attackForm || "blunt").toLowerCase();
        const armorPiercing   = Number(btn.dataset.armorPiercing || 0) || 0;
        const armorPiercingCS = Number(btn.dataset.armorPiercingCs || 0) || 0; // note the 'Cs' in dataset
        const apMode          = btn.dataset.apMode || "value";
        const bypassForceField = btn.dataset.bypassForceField === "true";
        const ignoresNaturalArmor = btn.dataset.ignoresNaturalArmor === "true";
        const ignoresArtificialArmor = btn.dataset.ignoresArtificialArmor === "true";
        const wasKillResult   = btn.dataset.isKill === "true";
        const isMagic         = btn.dataset.isMagic === "true";

        // 2) Apply via rules and CAPTURE RETURNED RESULTS (one entry per target)
        const results = await applyDamageToTargets({
          damage: damage,
          attackerUuid,
          damageType,
          attackForm,
          armorPiercing,
          armorPiercingCS,
          apMode,
          wasKillResult,
          showNotification: true,
          bypassArmor,
          bypassForceField,
          ignoresNaturalArmor,
          ignoresArtificialArmor,
          isMagic
        }) ?? [];

        debugLog("Chat Apply results", results);

        // ── Continuing damage (corrosive, acid, etc.) — manual-apply path ──
        // Mirrors the auto-apply registration in attack-action.js. Source item
        // UUID is stamped on the apply-damage button at card-render time.
        const sourceItemUuid = btn.dataset.sourceItemUuid || "";
        if (sourceItemUuid && Array.isArray(results) && results.length) {
          try {
            const sourceItem = await fromUuid(sourceItemUuid);
            const wSys = sourceItem?.system || {};
            const nameLc = String(sourceItem?.name || "").toLowerCase();
            const dtLc = String(wSys.damageType || "").toLowerCase();
            const isCorrosive = /corrosive|acid/.test(nameLc) || /corrosive|acid/.test(dtLc);
            const isRotting = /rotting|decay/.test(nameLc);
            const continuingByRule = isCorrosive || isRotting;
            const continuingByAuthor = wSys.continuingDamage === true;
            if (sourceItem?.type === "power" && (continuingByAuthor || continuingByRule)) {
              const { applyContinuingDamage } = await import("../effects/ongoing-engine.js");
              const totalRounds = Math.max(1, Number(wSys.continuingDamageRounds) || 3);
              const pattern = continuingByRule ? "diminishing-2cs" : "constant";
              const canWash = isCorrosive;
              for (const r of results) {
                const tgtUuid = r.actorUuid ?? r.tokenUuid ?? null;
                if (!tgtUuid) continue;
                const tgtDoc = await fromUuid(tgtUuid);
                const tgtActor = tgtDoc?.actor ?? tgtDoc ?? null;
                if (!tgtActor) continue;
                const damageDealt = Number(r.hpBefore ?? 0) - Number(r.hpAfter ?? 0);
                if (damageDealt <= 0) continue;
                await applyContinuingDamage(tgtActor, {
                  name: `${sourceItem.name} — Continuing`,
                  initialRank: wSys.rank || "Typical",
                  pattern,
                  rounds: totalRounds,
                  includeInitial: false,
                  canWash,
                  damageType: wSys.damageType || damageType,
                  originUuid: attackerUuid || null,
                  img: isCorrosive ? "icons/svg/acid.svg" : "icons/svg/blood.svg",
                });
              }
            }
          } catch (e) {
            console.warn("[FASERIP] Continuing damage registration via manual apply failed:", e);
          }
        }

        // 3) Persist undo info on the *correct* chat message
        const $msgEl = $(btn).closest("li.chat-message, .message, .chat-card, .message-content");
        const messageId =
          $msgEl.attr("data-message-id") ||
          $msgEl.data("messageId") ||
          $msgEl.closest("li.chat-message").attr("data-message-id");

        const msg   = messageId ? game.messages.get(messageId) : null;
        const SCOPE = game.system?.id || "msh-faserip";

        if (!msg) {
          console.warn("Undo flag: could not resolve ChatMessage from element; skipping flag write.");
        } else {
          await safeSetFlag(msg, SCOPE, "undo", {
            ts: Date.now(),
            results: (results || []).map(r => ({
              actorUuid: r.actorUuid ?? r.targetActorUuid ?? r.targetUuid ?? null,
              tokenUuid: r.tokenUuid ?? null,
              hpBefore:  Number(r.hpBefore  ?? r.currentHealth ?? 0),
              hpAfter:   Number(r.hpAfter   ?? r.newHealth    ?? 0)
            }))
          });
        }

        // 4) Flip button into Undo state (GM only)
        if (game.user.isGM) {
          btn.dataset.action = "undo-apply";
          btn.textContent    = "Undo";
          btn.title          = "Revert these HP changes";
          btn.disabled       = false;
        } else {
          btn.textContent    = "Applied";
          btn.title          = "Damage applied";
          btn.disabled       = true;
        }

      } catch (err) {
        console.error("Apply Damage error:", err);
        ui.notifications?.error?.("Apply failed — see console for details.");
        btn.disabled = false;
      }
    });

    // Anchor: Undo handler (robust)
    html.on("click", "[data-action='undo-apply']", async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      btn.disabled = true;

      try {
        // Resolve the originating ChatMessage (same robust lookup used in Apply)
        const $msgEl = $(btn).closest("li.chat-message, .message, .chat-card, .message-content");
        const messageId =
          $msgEl.attr("data-message-id") ||
          $msgEl.data("messageId") ||
          $msgEl.closest("li.chat-message").attr("data-message-id");

        const msg   = messageId ? game.messages.get(messageId) : null;
        const SCOPE = game.system?.id || "msh-faserip";
        const data  = msg?.flags?.[SCOPE]?.undo;

        if (!msg || !data?.results?.length) {
          ui.notifications?.warn?.("Nothing to undo for this message.");
          btn.disabled = false;
          return;
        }

        // Health path helper (supports old/new schemas)
        const healthPath = (actor) =>
          (actor?.system?.attributes?.health?.value !== undefined)
            ? "system.attributes.health.value"
            : "system.health.value";

        for (const r of data.results) {
          const uuid = r.actorUuid || r.tokenUuid;
          if (!uuid) continue;

          // Resolve Actor or TokenDocument
          const doc   = await fromUuid(uuid);
          const actor = doc?.actor ?? doc;
          if (!actor) continue;

          const cur  = Number(actor?.system?.attributes?.health?.value ?? actor?.system?.health?.value ?? 0);
          const prev = Number(r.hpBefore ?? cur);
          const update = { [healthPath(actor)]: Math.max(0, prev) };

          // Try local update; fall back to GM bridge
          if (game.user.isGM || actor.isOwner) {
            await actor.update(update);
          } else if (game.msh?.runAsGM) {
            await game.msh.runAsGM({
              operation: "update",
              targetActorUuid: actor.uuid,
              args: [update]
            });
          } else if (game.msh?.socket?.executeAsGM) {
            await game.msh.socket.executeAsGM("runGMCommand", {
              operation: "update",
              targetActorUuid: actor.uuid,
              args: [update]
            });
          } else {
            ui.notifications?.warn?.(`Cannot undo for ${actor.name}: insufficient permission.`);
          }

          debugLog("Undo applied", { actor: actor.name, from: cur, to: prev });
        }

        // Lock the button after success
        btn.textContent = "Undone";
        btn.title       = "Already undone";
        btn.disabled    = true;

      } catch (err) {
        console.error("Undo error:", err);
        ui.notifications?.error?.("Undo failed — see console for details.");
        btn.disabled = false;
      }
    });

    // Hold Damage handler (Full Hold - grappling red result)
    html.on("click", '[data-action="hold-damage"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      
      const attackerUuid = btn.dataset.attackerUuid;
      const maxDamage = Number(btn.dataset.maxDamage || 0);
      const damageRank = btn.dataset.damageRank || "Strength";
      const targetUuid = btn.dataset.targetUuid || "";
      const targetName = btn.dataset.targetName || "Target";
      
      // Get target actor for armor display
      let targetActor = null;
      let targetArmor = 0;
      let targetArmorSource = "";
      
      if (targetUuid) {
        try {
          const tDoc = await fromUuid(targetUuid);
          targetActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
          if (targetActor) {
            const armorInfo = getBodyArmorValues(targetActor, "physical-blunt");
            targetArmor = armorInfo?.applicable ?? 0;
            targetArmorSource = armorInfo?.source ?? "";
          }
        } catch (_e) { /* ignore */ }
      }
      
      // Resolve attacker name for header banner
      let attackerName = "Attacker";
      if (attackerUuid) {
        try {
          const aDoc = await fromUuid(attackerUuid);
          const attackerActor = aDoc?.actor ?? (aDoc?.documentName === "Actor" ? aDoc : null);
          if (attackerActor) attackerName = attackerActor.name;
        } catch (_e) { /* ignore */ }
      }
      
      // Show dialog to choose damage amount
      const dialogHtml = `
        <div class="frp-dlg">
          <!-- Header banner: Attacker → Hold Damage → Target -->
          <div class="frp-header-v3">
            <span class="h-actor" title="${attackerName}">${attackerName}</span>
            <span class="h-verb">deals damage to</span>
            <span class="h-target" title="${targetName}">${targetName}</span>
          </div>

          <!-- Cap readout -->
          <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
            <span class="frp-box-label" style="margin:0;">Hold Cap</span>
            <span style="font-size:13px;color:#1a1a1a;">Full Hold allows damage up to <strong>${damageRank} (${maxDamage})</strong></span>
          </div>

          <!-- Damage slider -->
          <div class="frp-box">
            <div class="frp-box-label">Damage to Inflict</div>
            <input type="range" name="damage" min="0" max="${maxDamage}" value="${maxDamage}" style="width:100%;margin:4px 0;" id="hold-dmg-slider">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#1a1a1a;font-weight:600;">
              <span>0</span>
              <span id="hold-dmg-display" style="font-family:'Oswald',sans-serif;font-weight:700;font-size:18px;color:#6a0000;">${maxDamage}</span>
              <span>${maxDamage}</span>
            </div>
          </div>

          ${targetActor ? `
          <!-- Target armor box -->
          <div class="frp-box frp-dmg-box">
            <div style="font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;color:#1a1a1a;">${targetName}</div>
            <div style="font-size:12px;color:#1a1a1a;">Body Armor: <strong>${targetArmor}</strong>${targetArmorSource ? ` <span style="color:#2a2a2a;font-style:italic;">(${targetArmorSource})</span>` : ''}</div>
            <div style="font-size:12px;color:#1a1a1a;font-weight:600;" id="hold-dmg-after">After armor: <strong style="color:#6a0000;font-family:'Oswald',sans-serif;font-size:14px;">${Math.max(0, maxDamage - targetArmor)}</strong></div>
          </div>
          ` : `
          <div class="frp-box" style="background:#fff;border:1.5px solid #c87a00;font-size:12px;color:#1a1a1a;">
            Target the held token to apply damage automatically, or apply manually.
          </div>
          `}
        </div>
      `;
      
      showFaseripButtonDialog({
        title: "Deal Hold Damage",
        content: dialogHtml,
        buttons: {
          apply: {
            icon: '<i class="fas fa-fist-raised"></i>',
            label: "Deal Damage",
            callback: async (html) => {
              const damage = Number(html.find('[name="damage"]').val() || 0);
              if (damage <= 0) {
                ui.notifications.info("No damage dealt.");
                return;
              }
              
              // Apply damage to target
              if (targetActor) {
                const results = await applyDamageToTargets({
                  damage: damage,
                  attackerUuid: attackerUuid,
                  damageType: "physical-blunt",
                  attackForm: "grappling",
                  showNotification: true,
                  bypassArmor: false
                });
                
                // Update button to show damage was applied
                btn.textContent = `Dealt ${damage}`;
                btn.disabled = true;
                btn.style.opacity = "0.6";
              } else {
                ui.notifications.info(`Deal ${damage} damage to held target (subject to Body Armor).`);
                btn.textContent = `${damage} dmg`;
                btn.disabled = true;
                btn.style.opacity = "0.6";
              }
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "apply",
        render: (html) => {
          // Update display as slider moves
          const slider = html.find('#hold-dmg-slider');
          const display = html.find('#hold-dmg-display');
          const afterDisplay = html.find('#hold-dmg-after');
          
          slider.on('input', function() {
            const val = Number(this.value);
            display.text(val);
            if (afterDisplay.length) {
              const afterArmor = Math.max(0, val - targetArmor);
              afterDisplay.html(`After armor: <strong style="color:#6a0000;font-family:'Oswald',sans-serif;font-size:14px;">${afterArmor}</strong>`);
            }
          });
        }
      });
    });

    // Grapple Back handler (Reverse - red escape result)
    html.on("click", '[data-action="grapple-back"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      
      const attackerUuid = btn.dataset.attackerUuid;
      const targetUuid = btn.dataset.targetUuid || "";
      const targetName = btn.dataset.targetName || "Opponent";
      
      // Get the escaping actor (who will now be grappling)
      let grapplingActor = null;
      if (attackerUuid) {
        try {
          const doc = await fromUuid(attackerUuid);
          grapplingActor = doc?.actor ?? (doc?.documentName === "Actor" ? doc : null);
        } catch (_e) { /* ignore */ }
      }
      
      // Fall back to selected token or user's character
      if (!grapplingActor) {
        const controlled = canvas.tokens?.controlled?.[0];
        if (controlled?.actor) {
          grapplingActor = controlled.actor;
        }
      }
      if (!grapplingActor) {
        grapplingActor = game.user?.character;
      }
      
      if (!grapplingActor) {
        ui.notifications.warn("Select your token to attempt Grapple Back.");
        return;
      }
      
      // Get target actor's strength for prefill
      let targetStrength = "";
      if (targetUuid) {
        try {
          const tDoc = await fromUuid(targetUuid);
          const tActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
          if (tActor) {
            targetStrength = tActor.system?.abilities?.strength?.rank || "";
          }
        } catch (_e) { /* ignore */ }
      }
      
      // Open grappling dialog with target prefilled
      await ActionDispatcher.roll("grappling", {
        actor: grapplingActor,
        opts: {
          prefill: {
            targetName: targetName,
            targetStrength: targetStrength,
            targetUuid: targetUuid
          }
        }
      });
      
      // Disable button after use
      btn.textContent = "Grappling...";
      btn.disabled = true;
      btn.style.opacity = "0.6";
    });

    // 6) Force Save (Power Save / Nullification — Psyche/Endurance vs Power Rank)
    html.on("click", '[data-action="force-save"], [data-action="force-save-nullify"], [data-action="force-power-save"]', async (ev) => {
      // Respect disabled state
      const el = ev.currentTarget;
      if (el.getAttribute?.("aria-disabled") === "true" || el.dataset.autoDisabled === "1") {
        ev.preventDefault();
        return;
      }

      ev.preventDefault();
      // Disable immediately to prevent double-clicks
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
      el.style.opacity = "0.55";
      el.style.cursor = "not-allowed";
      el.style.filter = "grayscale(.3)";
      const btn = ev.currentTarget;
      const $msg = $(btn).closest(".message");
      const msg = game.messages.get($msg.data("messageId"));
      const f = msg?.flags?.["msh-faserip"] || {};
      if (!f.requiresSave) return;

      const ability    = btn.dataset.saveAbility || f.saveAbility || "endurance";
      const btnIntensityRank = btn.dataset.intensityRank || "";
      const intensity  = btnIntensityRank ? "fixed-rank" : (f.saveIntensity || "power-rank");
      const fixedRank  = btnIntensityRank || f.saveFixedRank || "";
      const ignoreGate = (f.saveIgnoreGate !== false);

      // Attacker (for labels/origin)
      let ownerActor = null;
      try {
        if (f.attackerUuid) {
          const doc = await fromUuid(f.attackerUuid);
          ownerActor = doc?.actor ?? doc ?? null;
        }
      } catch (_) {}
      ownerActor = ownerActor ?? game.actors?.get(msg.speaker?.actor) ?? game.user?.character ?? null;

      // Prefill every currently targeted token (area handling — RAW affects all within range; we use selection)
      const targets = Array.from(game.user?.targets ?? []);
      const prefill = {};

      // Resolve save actor: prefer button data-target-uuid, then flagged defender, then targeted token, then fall back
      let saveActor = null;
      const btnTargetUuid = btn.dataset.targetUuid || "";
      const defUuid = btnTargetUuid || f?.defenderUuid || f?.targetUuid || "";
      if (defUuid) {
        try {
          const doc = await fromUuid(defUuid);
          saveActor = doc?.actor ?? doc ?? null;
        } catch (_) {}
      }
      if (!saveActor && targets.length === 1) {
        saveActor = targets[0]?.actor ?? null;
      }
      // If still no save actor, this is wrong but don't block — fall back to attacker with a warning
      if (!saveActor) {
        console.warn("[FASERIP WARN] Force Save: no target found, falling back to attacker. Select a target token.");
        saveActor = ownerActor;
      }

      const btnTargetName = btn.dataset.targetName || "";
      if (btnTargetUuid && saveActor && saveActor !== ownerActor) {
        prefill.targetName    = btnTargetName || saveActor.name;
        prefill.targetUuid    = saveActor.uuid ?? "";
        prefill.targetEndRank = saveActor.system?.abilities?.[ability]?.rank || "Typical";
        prefill.dmgThrough    = 0;
        prefill.attackForm    = "mental";
      } else if (targets.length === 1) {
        const t = targets[0];
        prefill.targetName    = t.name;
        prefill.targetUuid    = t.actor?.uuid ?? "";
        prefill.targetEndRank = t.actor?.system?.abilities?.[ability]?.rank || "Good";
        prefill.dmgThrough    = 0;      // saves don't require penetrating damage
        prefill.attackForm    = "mental";
      } else if (saveActor && saveActor !== ownerActor) {
        prefill.targetName    = saveActor.name;
        prefill.targetUuid    = saveActor.uuid ?? "";
        prefill.targetEndRank = saveActor.system?.abilities?.[ability]?.rank || "Good";
        prefill.dmgThrough    = 0;
        prefill.attackForm    = "mental";
      }

      await ActionDispatcher.roll("power-save", {
        actor: saveActor,
        abilityName: ability,
        opts: {
          prefill,
          ignoreDamageGate: ignoreGate,
          intensity,
          fixedRank,
          effectName: f.effectName,
          failMessage: f.failMessage,
          powerName: f.powerName,
          isNullifyAura: !!f.isNullifyAura
        }
      });

      // Persist resolved state so button stays disabled across re-renders
      // Skip for multi-target nullify cards — each button disables independently
      if (!f.isNullifyAura) {
        try { await safeSetFlag(msg, SCOPE, "autoSaveHandled", true); } catch (_) {}
      }

      // NOTE: CheckAction handles the actual FEAT + result. "power-save"
      // has labels/effects configured in action-config (fail => affected).
    });

    // While active, nullifier cannot use other inborn powers (guarded in energy-action.js)
    // 7) Toggle Nullify Aura (maintain while in range)
    html.on("click", '[data-action="toggle-nullify-aura"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const $msg = $(btn).closest(".message");
      const msg = game.messages.get($msg.data("messageId"));
      const f = msg?.flags?.["msh-faserip"] || {};

      let actor = null;
      try {
        if (f.attackerUuid) {
          const doc = await fromUuid(f.attackerUuid);
          actor = doc?.actor ?? doc ?? null;
        }
      } catch (_) {}
      actor = actor ?? game.actors?.get(msg.speaker?.actor) ?? game.user?.character ?? null;
      if (!actor) return;

      // Use helpers from nullify.js
      try {
        if (isAuraMaintained(actor)) {
          await stopAura(actor);
          ui.notifications.info(`${actor.name} stops maintaining Nullification.`);
        } else {
          await startAura(actor, f.nullify?.powerItemUuid ?? null, f.powerRank ?? f.originalPowerRank ?? null);
          ui.notifications.info(`${actor.name} is now maintaining Nullification (while in range).`);
        }
      } catch (e) {
        console.warn("Nullify aura toggle failed:", e);
        ui.notifications.error("Failed to toggle Nullify aura (see console).");
      }
    });

    // 7b) Nullify Auto-Fail (Semi mode — 3+ ranks below, no roll needed)
    html.on("click", '[data-action="nullify-auto-fail"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      btn.setAttribute("aria-disabled", "true");
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.55";

      const targetUuid = btn.dataset.targetUuid;
      const attackerUuid = btn.dataset.attackerUuid;
      const powerItemUuid = btn.dataset.powerItemUuid;

      let targetActor = null;
      try {
        const doc = await fromUuid(targetUuid);
        targetActor = doc?.actor ?? doc ?? null;
      } catch (_) {}
      if (!targetActor) return;

      let attackerActor = null;
      try {
        const doc = await fromUuid(attackerUuid);
        attackerActor = doc?.actor ?? doc ?? null;
      } catch (_) {}

      await Effects.applyNullified(targetActor, { rounds: null, originUuid: powerItemUuid, selfNullify: false, auraCasterId: attackerActor?.id ?? null });

      await ChatMessage.create({
        content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
          <div style="font-size:.9em;">
            <b>${targetActor.name}</b> — automatic nullification (Endurance 2+ ranks below intensity).
            <span style="color:#b71c1c;font-weight:600;">NULLIFIED</span>
          </div>
        </div>`
      });
    });

/*     // 8) Apply Defense Effect (dodging/evading/blocking/catching)
    html.on("click", '[data-action="apply-effect"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const $msg = $(btn).closest(".message");
      const msg = game.messages.get($msg.data("messageId"));
      
      // Get actor from message speaker
      let actor = null;
      try {
        if (msg.speaker?.actor) {
          actor = game.actors.get(msg.speaker.actor);
        }
      } catch (_) {}
      
      if (!actor) {
        ui.notifications.warn("Could not find actor for this defense action.");
        return;
      }
      
      // Read temp flags
      const defenseTemp = await actor.getFlag("msh-faserip", "defenseTemp") || {};
      
      // Determine which defense action this was and create appropriate effect
      let effectCreated = false;
      
      if (defenseTemp.dodging) {
        await createDodgingEffect(actor, defenseTemp.dodging);
        effectCreated = true;
      } else if (defenseTemp.evading) {
        await createEvadingEffect(actor, defenseTemp.evading);
        effectCreated = true;
      } else if (defenseTemp.blocking) {
        await createBlockingEffect(actor, defenseTemp.blocking);
        effectCreated = true;
      } else if (defenseTemp.catching) {
        await createCatchingEffect(actor, defenseTemp.catching);
        effectCreated = true;
      }
      
      if (!effectCreated) {
        ui.notifications.warn("No defense data found for this action.");
        return;
      }
      
      // Update button
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
      btn.textContent = "✓ Effect Applied";
      
      ui.notifications.info(`Defense effect applied to ${actor.name}`);
    });
 */
/* 
    // 9) Use Blocking Armor (separate button for blocking)
    html.on("click", '[data-action="use-armor"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const $msg = $(btn).closest(".message");
      const msg = game.messages.get($msg.data("messageId"));
      
      let actor = null;
      try {
        if (msg.speaker?.actor) {
          actor = game.actors.get(msg.speaker.actor);
        }
      } catch (_) {}
      
      if (!actor) {
        ui.notifications.warn("Could not find actor for blocking armor.");
        return;
      }
      
      const defenseTemp = await actor.getFlag("msh-faserip", "defenseTemp") || {};
      
      if (!defenseTemp.blocking) {
        ui.notifications.warn("No blocking data found.");
        return;
      }
      
      await createBlockingEffect(actor, defenseTemp.blocking);
      
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
      btn.textContent = "✓ Armor Applied";
      
      ui.notifications.info(`Blocking armor applied to ${actor.name}`);
    });
 */
    // 10) Death Save
    html.on("click", '[data-action="death-save"]', async (ev) => {
      // Respect disabled state
      const el = ev.currentTarget;
      if (el.getAttribute?.("aria-disabled") === "true" || el.dataset.autoDisabled === "1") {
        ev.preventDefault();
        return;
      }

      ev.preventDefault();
      // Disable immediately to prevent double-clicks
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
      el.style.opacity = "0.55";
      el.style.cursor = "not-allowed";
      el.style.filter = "grayscale(.3)";
      const btn = ev.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      const attackForm = btn.dataset.attackForm || "";
      const fromZeroHealth = btn.dataset.fromZeroHealth !== "false"; // Default true
      
      try {
        const resolved = await fromUuid(actorUuid);
        const actor = resolved?.documentName === "Actor" 
          ? resolved 
          : (resolved?.documentName === "Token" ? resolved.actor : null);
        
        if (!actor) {
          ui.notifications.warn("Could not find actor for death save.");
          el.removeAttribute("aria-disabled");
          el.style.pointerEvents = "";
          el.style.opacity = "";
          el.style.cursor = "pointer";
          el.style.filter = "";
          return;
        }
        
        await ActionDispatcher.roll("death-save", { 
          actor,
          opts: { attackForm, fromZeroHealth }
        });
      } catch (err) {
        console.error("Death save handler failed:", err);
        ui.notifications.error("Failed to open death save dialog.");
        el.removeAttribute("aria-disabled");
        el.style.pointerEvents = "";
        el.style.opacity = "";
        el.style.cursor = "pointer";
        el.style.filter = "";
      }
    });

    // 11) Kill Save (Kill result from attack while still has HP - character stays conscious)
    html.on("click", '[data-action="kill-save"]', async (ev) => {
      // Respect disabled state
      const el = ev.currentTarget;
      if (el.getAttribute?.("aria-disabled") === "true" || el.dataset.autoDisabled === "1") {
        ev.preventDefault();
        return;
      }

      ev.preventDefault();
      // Disable immediately to prevent double-clicks
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
      el.style.opacity = "0.55";
      el.style.cursor = "not-allowed";
      el.style.filter = "grayscale(.3)";
      const btn = ev.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      const attackForm = btn.dataset.attackForm || "";
      // Kill save from attack = NOT from zero health, character stays conscious if they fail
      const fromZeroHealth = false;
      
      try {
        const resolved = await fromUuid(actorUuid);
        const actor = resolved?.documentName === "Actor" 
          ? resolved 
          : (resolved?.documentName === "Token" ? resolved.actor : null);
        
        if (!actor) {
          ui.notifications.warn("Could not find actor for kill save.");
          el.removeAttribute("aria-disabled");
          el.style.pointerEvents = "";
          el.style.opacity = "";
          el.style.cursor = "pointer";
          el.style.filter = "";
          return;
        }
        
        await ActionDispatcher.roll("death-save", { 
          actor,
          opts: { attackForm, fromZeroHealth }
        });
      } catch (err) {
        console.error("Kill save handler failed:", err);
        ui.notifications.error("Failed to open kill save dialog.");
        el.removeAttribute("aria-disabled");
        el.style.pointerEvents = "";
        el.style.opacity = "";
        el.style.cursor = "pointer";
        el.style.filter = "";
      }
    });

    // 13) FF Breach Psyche FEAT (projected force field overload)
    html.on("click", ".ff-breach-psyche-feat", async (ev) => {
      ev.preventDefault();
      // Disable immediately to prevent double-clicks
      const el = ev.currentTarget;
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
      el.style.opacity = "0.55";
      el.style.cursor = "not-allowed";
      el.style.filter = "grayscale(.3)";
      const btn = ev.currentTarget;
      const actorId = btn.dataset.actorId;
      const intensity = Number(btn.dataset.intensity) || 0;
      const psycheRank = btn.dataset.psycheRank || "Typical";

      const actor = game.actors.get(actorId)
        || canvas.tokens.placeables.find(t => t.actor?.id === actorId)?.actor;
      if (!actor) {
        ui.notifications.warn("Could not find actor for Psyche FEAT.");
        el.removeAttribute("aria-disabled");
        el.style.pointerEvents = "";
        el.style.opacity = "";
        el.style.cursor = "pointer";
        el.style.filter = "";
        return;
      }

      try {
        const { rollUniversalTable } = await import("../dice/universal-table.js");
        const roll = new Roll("1d100");
        await roll.evaluate();
        const rollTotal = roll.total;
        const color = rollUniversalTable(psycheRank, rollTotal);

        // Need Green or better to stay conscious
        const success = color !== "white";

        if (success) {
          await ChatMessage.create({
            content: `<div style="background:#e8f5e9;border:1px solid #4caf50;padding:8px;border-radius:4px;">
              <strong>${actor.name}</strong> Psyche FEAT (${psycheRank}) vs Intensity ${intensity}: <strong style="color:#2e7d32;">${color.toUpperCase()}</strong> (${rollTotal})
              <div style="margin-top:4px;">Maintains consciousness despite force field collapse.</div>
            </div>`
          });
        } else {
          // Unconscious 1-10 rounds
          const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
          const durationRoll = await new Roll(`1${stunDie}`).evaluate();
          const rounds = durationRoll.total;

          // Apply unconscious effect
          const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
          const existing = actor.effects.find(e =>
            e.flags?.[scope]?.ongoingId === "ff-breach-unconscious" && !e.disabled
          );
          if (!existing) {
            await actor.createEmbeddedDocuments("ActiveEffect", [{
              name: "Unconscious (FF Breach)",
              icon: "icons/svg/unconscious.svg",
              statuses: ["unconscious"],
              flags: {
                [scope]: {
                  ongoingId: "ff-breach-unconscious",
                  effectCategory: "status",
                  canAct: false,
                  canMove: false,
                  autoExpire: true,
                  durationRounds: rounds
                }
              },
              duration: game.combat ? { value: rounds, units: "rounds", expiry: "roundEnd" } : {},
              disabled: false
            }]);
          }

          await ChatMessage.create({
            content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:4px;">
              <strong>${actor.name}</strong> Psyche FEAT (${psycheRank}) vs Intensity ${intensity}: <strong style="color:#c62828;">${color.toUpperCase()}</strong> (${rollTotal})
              <div style="margin-top:4px;"><strong>${actor.name}</strong> is unconscious for <strong class="msh-ffb-rounds">?</strong> rounds!</div>
            </div>`,
            flags: { "msh-faserip": { ffBreachKnockout: { rounds: Number(rounds) } } }
          });

          btn.disabled = true;
          btn.textContent = `✗ Unconscious (${rounds}rd)`;
          btn.style.opacity = "0.6";
        }

        if (success) {
          btn.disabled = true;
          btn.textContent = "✓ Conscious";
          btn.style.opacity = "0.6";
        }
      } catch (err) {
        console.error("[FASERIP ERROR] FF breach Psyche FEAT failed:", err);
        ui.notifications.error("Failed to roll Psyche FEAT.");
        el.removeAttribute("aria-disabled");
        el.style.pointerEvents = "";
        el.style.opacity = "";
        el.style.cursor = "pointer";
        el.style.filter = "";
      }
    });

  }); // End of single combined Hooks.on

  console.log("MSH FASERIP | Chat hooks installed (checks + breaking FEAT + grabbing break + collision damage + escape + apply damage)");
}

/**
 * Helper functions to create defense-related ActiveEffects
 */

/**
 * Create a Dodging effect
 */

/* async function createDodgingEffect(actor, data) {
  const { attackerPenaltyCS, selfPenaltyCS, notes } = data;
  
  // Remove any existing dodging effects first
  const existingDodge = actor.effects.find(e => e.flags?.["msh-faserip"]?.isDodging);
  if (existingDodge) await existingDodge.delete();
  
  const penaltyText = attackerPenaltyCS !== 0 
    ? `${attackerPenaltyCS}CS to attackers` 
    : "no penalty";
  
  const defenseBonus = Math.abs(attackerPenaltyCS);
  const effectData = {
    name: `Dodging (${penaltyText})`,
    icon: "icons/svg/windmill.svg",
    origin: actor.uuid,
    disabled: false,
    duration: {
      value: 1,
      units: "rounds",
      expiry: "roundEnd"
    },
    flags: {
      "msh-faserip": {
        isDodging: true,
        attackerPenaltyCS: attackerPenaltyCS,
        selfPenaltyCS: selfPenaltyCS,
        notes: notes
      }
    },
    changes: [
      // Half movement while dodging (ruler reads this multiplier)
      { key: "system.combatMods.movementMult", mode: "override", value: "0.5", priority: 20 },
      // -2CS on all own FEATs while dodging
      { key: "system.combatMods.selfPenaltyCS", mode: "add", value: "-2", priority: 20 },
      ...(defenseBonus > 0 ? [
        { key: "system.combatMods.defenseShift", mode: "add", value: String(defenseBonus), priority: 20 },
        { key: "system.combatMods.defenseShiftRanged", mode: "add", value: String(defenseBonus), priority: 20 }
      ] : [])
    ]
  };
  
  await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
}

/**
 * Create an Evading effect
 */
async function createEvadingEffect(actor, data) {
  const { target, evadeSuccessful, autoHit, nextRoundAttackBonusCS, note } = data;
  await Effects.applyEvade(actor, { 
    target, 
    evadeSuccessful: evadeSuccessful ?? true, 
    autoHit: autoHit ?? false,
    nextRoundAttackBonusCS, 
    note 
  });
}


/**
 * Create a Blocking effect
 */
async function createBlockingEffect(actor, data) {
  const { armorRank, armorValue } = data;
  await Effects.applyBlock(actor, { armorRank, armorValue });
}


/**
 * Create a Catching effect (mainly a reminder/note)
 */
async function createCatchingEffect(actor, data) {
  const { scenario, vsYou, note } = data;
  await Effects.applyCatch(actor, { scenario, vsYou, note });
}


export async function postAttackChatCard({
  actor, actionId, label, ability, roll, resultColor,
  baseDamage = 0, bonusDamage = 0, finalDamage = null,
  targets = [], notes = ""
}) {
  const dmg = finalDamage ?? (baseDamage + bonusDamage);
  const tNames = targets?.length ? targets.map(t => t.name).join(", ") : "—";
  const colorName = (resultColor||"").toUpperCase();

  const content = `
  <div class="faserip-chat-card" data-action="${actionId}">
    <div class="faserip-header"><b>${label}</b> — ${ability.toUpperCase()}</div>
    <div class="faserip-row"><b>Roll:</b> ${roll.total ?? roll} &nbsp; <b>Result:</b> ${colorName}</div>
    <div class="faserip-row"><b>Targets:</b> ${tNames}</div>
    <div class="faserip-row"><b>Damage:</b> ${dmg}</div>
    ${notes ? `<div class="faserip-notes">${notes}</div>` : ""}
    <div class="faserip-actions" style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
      <a class="faserip-chip" data-action="apply-damage">Apply Damage</a>
      ${/YELLOW|RED/.test(colorName) ? `<a class="faserip-chip" data-action="resolve-stun-slam">Resolve Stun/Slam</a>` : ""}
    </div>
  </div>`;

  return ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: {
      "msh-faserip": { baseDamage, bonusDamage, finalDamage: dmg, targets: targets.map(t => t.id) }
    }
  });
}

export async function handleEscapeAttempt({ defenderUuid, defenderName, defenderRank }) {
  if (!defenderUuid) {
    ui.notifications.warn("No defender UUID provided for escape attempt.");
    return;
  }

  const defender = await fromUuid(defenderUuid);
  if (!defender) {
    ui.notifications.warn(`Cannot find defender: ${defenderName || "Unknown"}`);
    return;
  }

  const defenderStrength = defender.system?.abilities?.strength?.rank || defenderRank || "Typical";
  const defenderStrengthValue = defender.system?.abilities?.strength?.value || game.msh.getRankValue(defenderStrength) || 6;
  const actualDefenderName = defenderName || defender.name || "Target";

  const savedShift = await defender.getFlag("msh-faserip", "lastEscapeShift") ?? 0;
  const savedSpendKarma = false; // Always default to unchecked
  const savedRemember = await defender.getFlag("msh-faserip", "lastEscapeRemember") ?? true;
  const savedSkipDice = await defender.getFlag("msh-faserip", "lastEscapeSkipDice") ?? false;

  const dialogHtml = `
    <div class="frp-dlg">
      <!-- Header banner: defender (Strength rank value) — Escape -->
      <div class="frp-header-v3" style="background:linear-gradient(90deg, #4682B4 0%, #2c5f8a 100%);">
        <span class="h-actor" title="${actualDefenderName}">${actualDefenderName}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Strength</span>
          <span class="h-stat-rank">${defenderStrength} ${defenderStrengthValue}</span>
        </span>
        <span class="h-paren">)</span>
        <span class="h-arrow">&rarr;</span>
        <span class="h-target">Escape</span>
      </div>

      <!-- Column Shift row -->
      <div class="frp-box frp-cs-box" style="display:flex;align-items:center;gap:8px;">
        <span class="frp-box-label" style="margin:0;color:#6a0000;">Column Shift</span>
        <input type="number" name="shift" value="${Number(savedShift)}" style="width:50px;padding:2px;text-align:center;font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;border:1px solid #888;border-radius:2px;">
        <span style="font-size:11px;color:#1a1a1a;font-style:italic;">(+ easier, &minus; harder)</span>
      </div>

      ${generateKarmaControlsHTML(defender, savedSpendKarma)}

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w" title="White: still held; no other actions this turn.">Miss</div>
        <div class="frp-fx-cell g" title="Green: still held; no other actions this turn.">Miss</div>
        <div class="frp-fx-cell y" title="Yellow: free; half move; no other actions.">Escape</div>
        <div class="frp-fx-cell r" title="Red: free + grapple back or act at -2 CS.">Reverse</div>
      </div>

      <!-- Results reference -->
      <div class="frp-box" style="font-size:11.5px;line-height:1.4;color:#1a1a1a;">
        <div class="frp-box-label">Escape Results</div>
        <div><strong>Miss (W/G):</strong> Still held; no other actions.</div>
        <div><strong>Escape (Y):</strong> Free; may move up to half speed; no other actions.</div>
        <div><strong>Reverse (R):</strong> Free; move &frac12;, Grapple attacker, or take another action at &minus;2 CS.</div>
      </div>

      <div class="frp-foot">
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>
  `;

  showFaseripButtonDialog({
    title: `Escape Attempt: ${actualDefenderName}`,
    content: dialogHtml,
    buttons: {
      roll: {
        label: "Roll Escape",
        callback: async (html) => {
          const $ = (s) => html.find(s);
          const shift = Number($('[name="shift"]').val() || 0);
          const { spendKarma } = extractKarmaFromDialog(html);
          const remember = $(`[name="rememberSettings"]`).length ? !!$(`[name="rememberSettings"]`).is(':checked') : !!$(`[name="remember"]`).is(':checked');
          const skipDice = $(`[name="skipDiceRoll"]`).length ? !!$(`[name="skipDiceRoll"]`).is(':checked') : !!$(`[name="skipDice"]`).is(':checked');

          // Always save remember/skipDice preferences
          await defender.setFlag("msh-faserip", "lastEscapeRemember", remember);
          await defender.setFlag("msh-faserip", "lastEscapeSkipDice", skipDice);

          // Persist shift if requested (karma checkbox never persisted)
          if (remember) {
            await defender.setFlag("msh-faserip", "lastEscapeShift", shift);
          }

          const effectiveRank = shiftRank(defenderStrength, shift);
          const roll = await (new Roll("1d100")).evaluate();
          
          if (!skipDice) {
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: defender }),
              flavor: `${actualDefenderName} attempts to Escape`,
              rollMode: game.settings.get("core", "rollMode")
            });
          }

          const { cappedTotal, totalKarmaUsed } = 
            await rollWithKarmaAndHistory(defender, "Escaping", 0, roll, { spendKarma, rank: effectiveRank });

          const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
          const colorLower = String(color || "").toLowerCase();
          const effects = effectsFor("escaping");
          const effect = effects[colorLower] || "Miss";
          const grid = buildResultGrid("escaping", colorLower, effects);
          const { bg, fg } = bannerColors(colorLower);

          const effectBlocks = {
            miss: `<div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
              <div style="font-weight:bold;color:#c62828;">Miss</div>
              <div style="font-size:.9em;">Still held this turn; no other actions.</div>
            </div>`,
            escape: `<div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
              <div style="font-weight:bold;color:#0d47a1;">Escape</div>
              <div style="font-size:.9em;">Free of hold; may move up to half speed (no other actions).</div>
            </div>`,
            reverse: `<div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
              <div style="font-weight:bold;color:#2e7d32;">Reverse</div>
              <div style="font-size:.9em;">Free; may move ½, Grapple attacker, or take another action at -2 CS.</div>
            </div>`
          };

          const effectBlock = effectBlocks[effect.toLowerCase()] || "";

          const cardHtml = `
            <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
                <strong>${actualDefenderName} — Escape Attempt</strong>
              </div>
              <div style="padding:5px 10px;font-size:.9em;">
                <div>Strength: ${defenderStrength} (${defenderStrengthValue})${shift ? ` — Shift ${shift} → ${effectiveRank}` : ""}</div>
                <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ``} = ${cappedTotal}</div>
              </div>
              ${grid}
              <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
                RESULT: ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
              </div>
              ${effectBlock}
            </div>
          `;

          await ChatMessage.create({ 
            speaker: ChatMessage.getSpeaker({ actor: defender }), 
            content: cardHtml 
          });

          // Remove hold effects on successful escape (yellow=Escape or red=Reverse only)
          if (colorLower === "yellow" || colorLower === "red") {
            console.log(`[FASERIP] Escape successful (${colorLower}), removing hold effects from ${actualDefenderName}`);
            console.log(`[FASERIP] Checking ${defender.effects?.size || 0} effects`);
            
            const holdEffects = [];
            for (const e of defender.effects || []) {
              if (e.disabled) continue;
              
              // Check statuses (handle both Set and Array)
              const hasGrappledStatus = e.statuses?.has?.("grappled") || Array.from(e.statuses || []).includes("grappled");
              const hasHeldStatus = e.statuses?.has?.("held") || Array.from(e.statuses || []).includes("held");
              
              const flags = e.flags?.["msh-faserip"] || {};
              const hasGrappledFlag = flags.effectType === "grappled" || flags.status?.isGrappled;
              const hasHeldFlag = flags.effectType === "held" || flags.status?.isHeld;
              
              const name = (e.name || "").toLowerCase();
              const hasGrappledName = name.includes("grappled") || name.includes("partial hold");
              const hasHeldName = name.includes("held") || name.includes("full hold");
              
              const isHoldEffect = hasGrappledStatus || hasHeldStatus || hasGrappledFlag || hasHeldFlag || hasGrappledName || hasHeldName;
              
              console.log(`[FASERIP] Effect "${e.name}": statuses=${Array.from(e.statuses || [])}, flagType=${flags.effectType}, isHold=${isHoldEffect}`);
              
              if (isHoldEffect) holdEffects.push(e);
            }
            
            console.log(`[FASERIP] Found ${holdEffects.length} hold effects to remove`);
            
            for (const eff of holdEffects) {
              try {
                await eff.delete();
                console.log(`[FASERIP] Removed hold effect: ${eff.name}`);
              } catch (err) {
                console.warn(`[FASERIP WARN] Failed to remove effect ${eff.name}:`, err);
              }
            }
          } else {
            console.log(`[FASERIP] Escape failed (${colorLower}), hold effects remain`);
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: (html) => { setupKarmaControlHandlers(html); }
  });
}