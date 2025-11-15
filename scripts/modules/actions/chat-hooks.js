// scripts/modules/actions/chat-hooks.js
import { ActionDispatcher } from "./action-dispatcher.js";
import { resolveCombatMode } from "./action-dispatcher.js";

import { openBreakingFeatDialog } from "./breaking-feat.js";
import { openGrabbingBreakDialog } from "./grabbing-break.js";
import { openCollisionDamageDialog } from "./collision-damage.js";
import { 
  shiftRank, 
  rollWithKarmaAndHistory, 
  buildResultGrid, 
  bannerColors, 
  effectsFor,
  applyDamageToTargets,
  debugLog
} from "./action-utils.js";
import { startAura, stopAura, isAuraMaintained } from "./nullify.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import * as Effects from "../effects/effect-engine.js";

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

    // Bail if already auto-processed (prevents double-fire on rerender/notify)
    const alreadyHandled = await message.getFlag(SCOPE, "autoSaveHandled");
    if (alreadyHandled) return;

    // Only a user who can edit this message should drive auto-save logic.
    // safeSetFlag will enforce this too, but this keeps the logs cleaner.
    const canDriveAutoSaves = message.isOwner || game.user.isGM;
    if (!canDriveAutoSaves) {
      if (game.settings.get("msh-faserip", "debugMode")) {
        console.log("FASERIP | Auto-save skipping (no message ownership)", {
          msgId: message.id,
          user: game.user.name
        });
      }
      return;
    }

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
          return;
        }

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
          const forceBtns = html.find('[data-action="force-save"], [data-action="force-save-nullify"]');
          const deathBtns = html.find('[data-action="death-save"]');

          // Track which (checkType, defender) pairs we've already auto-run for this message
          const autoSaveDefenderKeys = new Set();

          // Per-chip auto run (Stun/Slam/Kill). Chips from attacks include per-target prefill.
          // Auto-run Stun/Slam/Kill per defender in Full mode
          for (const el of chips.toArray()) {
            const checkType  = el.dataset.check;                // "stun"|"slam"|"kill"|"escape"
            if (checkType === "escape") continue;               // not a save

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
              await game.msh.actions.roll("save-nullify", {
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
        }
      }
    } catch (err) {
      console.error("Auto-save rolling failed:", err);
    }
    // --- END auto-rolling saves ---

    // Check if this message has an undo flag
    const undoData = message.flags?.[SCOPE]?.undo;

    if (undoData?.results?.length) {
      // This message has been applied - transform button
      const applyBtn = html.find('[data-action="apply-damage"]');
      if (applyBtn.length) {
        applyBtn.attr('data-action', 'undo-apply');
        applyBtn.text('Undo');
        applyBtn.attr('title', 'Revert these HP changes');
        applyBtn.prop('disabled', false);
      }
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
      //const el = ev.currentTarget;

      const checkType    = el.dataset.check;                // "stun" | "slam" | "kill" | "escape"
      const attackForm   = el.dataset.attackForm || "blunt";
      const dmgThrough   = Number(el.dataset.dmg || 0);
      if (dmgThrough <= 0 && checkType !== "escape") {
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

      await ActionDispatcher.roll(checkType, {
        actor: ownerActor,
        opts: {
          attackForm,
          prefill
        }
      });
    });

    // 2) Breaking FEAT chip
    html.on("click", '[data-action="breaking-feat"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const weaponMat = btn.dataset.weaponMat || "Excellent";
      const actorUuid = btn.dataset.actorUuid;

      let actor = null;
      try {
        if (actorUuid) {
          const doc = await fromUuid(actorUuid);
          actor = doc?.actor ?? doc ?? null;
        }
      } catch (_) {}

      openBreakingFeatDialog({ weaponMatRank: weaponMat, actor });
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

    // 4) Collision Damage Calculator chip
    html.on("click", '[data-action="calculate-collision"]', async (ev) => {
      ev.preventDefault();
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

    // 5) Apply Damage button
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
        const wasKillResult   = btn.dataset.isKill === "true";

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
          bypassArmor
        }) ?? [];

        debugLog("Chat Apply results", results);

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
          await msg.setFlag(SCOPE, "undo", {
            ts: Date.now(),
            results: (results || []).map(r => ({
              actorUuid: r.actorUuid ?? r.targetActorUuid ?? r.targetUuid ?? null,
              tokenUuid: r.tokenUuid ?? null,
              hpBefore:  Number(r.hpBefore  ?? r.currentHealth ?? 0),
              hpAfter:   Number(r.hpAfter   ?? r.newHealth    ?? 0)
            }))
          });
        }

        // 4) Flip button into Undo state
        btn.dataset.action = "undo-apply";
        btn.textContent    = "Undo";
        btn.title          = "Revert these HP changes";
        btn.disabled       = false;

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
          } else if (game.msh?.socket?.executeAsGM) {
            // MODERN API (preferred)
            await game.msh.socket.executeAsGM("updateActor", {
              targetActorUuid: actor.uuid,
              updateData: update
            });
          } else if (game.msh?.runAsGM) {
            // LEGACY API (fallback)
            await game.msh.runAsGM({
              operation: "update",          // ← FIXED: was "updateActor"
              targetActorUuid: actor.uuid,
              args: [update]                // ← FIXED: was "data: update"
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

    // 6) Force Save (Nullification / RAW: Endurance vs Power Rank)
    html.on("click", '[data-action="force-save"], [data-action="force-save-nullify"]', async (ev) => {
      // Respect disabled state
      const el = ev.currentTarget;
      if (el.getAttribute?.("aria-disabled") === "true" || el.dataset.autoDisabled === "1") {
        ev.preventDefault();
        return;
      }

      ev.preventDefault();
      const btn = ev.currentTarget;
      const $msg = $(btn).closest(".message");
      const msg = game.messages.get($msg.data("messageId"));
      const f = msg?.flags?.["msh-faserip"] || {};
      if (!f.requiresSave) return;

      const ability    = btn.dataset.saveAbility || f.saveAbility || "endurance";
      const intensity  = f.saveIntensity || "power-rank"; // "power-rank" | "fixed-rank" | "none"
      const fixedRank  = f.saveFixedRank || "";
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
      if (targets.length === 1) {
        const t = targets[0];
        prefill.targetName    = t.name;
        prefill.targetUuid    = t.actor?.uuid ?? "";
        prefill.targetEndRank = t.actor?.system?.abilities?.[ability]?.rank || "Good";
        prefill.dmgThrough    = 0;      // saves don't require penetrating damage
        prefill.attackForm    = "mental";
      }

      await ActionDispatcher.roll("save-nullify", {
        actor: ownerActor,
        abilityName: ability,
        opts: {
          prefill,
          ignoreDamageGate: ignoreGate,
          intensity,
          fixedRank,
          effectName: f.effectName,
          failMessage: f.failMessage,
          powerName: f.powerName
        }
      });

      // NOTE: Your CheckAction handles the actual FEAT + result. Make sure "save-nullify"
      // has labels/effects configured in action-config (fail => nullified).
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
          await startAura(actor, f.nullify?.powerItemUuid ?? null);
          ui.notifications.info(`${actor.name} is now maintaining Nullification (while in range).`);
        }
      } catch (e) {
        console.warn("Nullify aura toggle failed:", e);
        ui.notifications.error("Failed to toggle Nullify aura (see console).");
      }
    });

    // 8) Apply Defense Effect (dodging/evading/blocking/catching)
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

    // 10) Death Save
    html.on("click", '[data-action="death-save"]', async (ev) => {
      // Respect disabled state
      const el = ev.currentTarget;
      if (el.getAttribute?.("aria-disabled") === "true" || el.dataset.autoDisabled === "1") {
        ev.preventDefault();
        return;
      }

      ev.preventDefault();
      const btn = ev.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      
      try {
        const resolved = await fromUuid(actorUuid);
        const actor = resolved?.documentName === "Actor" 
          ? resolved 
          : (resolved?.documentName === "Token" ? resolved.actor : null);
        
        if (!actor) {
          ui.notifications.warn("Could not find actor for death save.");
          return;
        }
        
        await ActionDispatcher.roll("death-save", { actor });
      } catch (err) {
        console.error("Death save handler failed:", err);
        ui.notifications.error("Failed to open death save dialog.");
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
async function createDodgingEffect(actor, data) {
  const { attackerPenaltyCS, selfPenaltyCS, notes } = data;
  
  // Remove any existing dodging effects first
  const existingDodge = actor.effects.find(e => e.flags?.["msh-faserip"]?.isDodging);
  if (existingDodge) await existingDodge.delete();
  
  const penaltyText = attackerPenaltyCS !== 0 
    ? `${attackerPenaltyCS}CS to attackers` 
    : "no penalty";
  
  const effectData = {
    name: `Dodging (${penaltyText})`,
    icon: "icons/svg/windmill.svg",
    origin: actor.uuid,
    disabled: false,
    duration: {
      rounds: 1,
      startRound: game.combat?.round || 0
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
      // This is a visual/reminder effect; actual CS penalties handled manually
      // Could add system-specific change rules here if your system supports them
    ]
  };
  
  await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
}

/**
 * Create an Evading effect
 */
async function createEvadingEffect(actor, data) {
  const { target, nextRoundAttackBonusCS, note } = data;
  await Effects.applyEvade(actor, { target, nextRoundAttackBonusCS, note });
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

      {{!-- NEW: Force Save chip (only show if the item/power says it requires a save) --}}
      ${(() => {
        try {
          // Pull the item (power) that created this card, if you’re already packing uuid in flags.
          // If you aren’t sending item flags yet, you can hide under a condition you control.
          const needsSave = !!(game.messages?.get?.(undefined)?.flags?.["msh-faserip"]?.requiresSave);
          return needsSave ? `<a class="faserip-chip" data-action="force-save">Force Save</a>` : "";
        } catch { return ""; }
      })()}

      ${/YELLOW|RED/.test(colorName) ? `<a class="faserip-chip" data-action="resolve-stun-slam">Resolve Stun/Slam</a>` : ""}

    </div>
  </div>`;

  return ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    flags: {
      "msh-faserip": {
        actionId, ability, roll: roll?.total ?? roll, resultColor: colorName,
        baseDamage, bonusDamage, finalDamage: dmg, targets: targets.map(t=>t.id)
      }
    }
  });
}

/**
 * Handle "Attempt Escape" button clicks from Grappling hold results
 */
async function handleEscapeCheck({ defenderUuid, defenderName, defenderRank }) {
  if (!defenderUuid) {
    ui.notifications.warn("No defender UUID provided for escape attempt.");
    return;
  }

  const defender = await fromUuid(defenderUuid);
  if (!defender) {
    ui.notifications.warn(`Cannot find defender: ${defenderName || "Unknown"}`);
    return;
  }

  // Get defender's strength
  const defenderStrength = defender.system?.abilities?.strength?.rank || defenderRank || "Typical";
  const defenderStrengthValue = defender.system?.abilities?.strength?.value || game.msh.getRankValue(defenderStrength) || 6;
  const actualDefenderName = defenderName || defender.name || "Target";

  // Load persisted settings
  const savedShift = await defender.getFlag("msh-faserip", "lastEscapeShift") ?? 0;
  const savedKarma = await defender.getFlag("msh-faserip", "lastEscapeKarma") ?? 0;

  // Build escape dialog
  const dialogHtml = `
    <div style="line-height:1.4;">
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Action:</label>
        <strong>Escaping</strong>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Character:</label>
        <strong>${actualDefenderName}</strong>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Strength:</label>
        <input type="text" value="${defenderStrength}" style="width:160px;" readonly>
        <span style="margin-left:6px;">(${defenderStrengthValue})</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Column Shift:</label>
        <input type="number" name="shift" value="${Number(savedShift)}" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ easier, - harder)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Karma:</label>
        <input type="number" name="karma" value="${Number(savedKarma)}" min="0" style="width:60px;">
      </div>

      <div style="margin-top:6px;">
        <label><input type="checkbox" name="remember" checked> Remember these settings</label>
      </div>

      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
      </div>

      <div style="margin-top:12px;padding:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:4px;">Escape Results</div>
        <div style="font-size:.85em;color:#555;">
          <strong>Miss (White/Green):</strong> Still held; no other actions.<br>
          <strong>Escape (Yellow):</strong> Free; may move up to half speed; no other actions.<br>
          <strong>Reverse (Red):</strong> Free; move ½, Grapple attacker, or take another action at -2 CS.
        </div>
      </div>
    </div>
  `;

  new Dialog({
    title: `Escape Attempt: ${actualDefenderName}`,
    content: dialogHtml,
    buttons: {
      roll: {
        label: "Roll Escape",
        callback: async (html) => {
          const $ = (s) => html.find(s);
          const shift = Number($('[name="shift"]').val() || 0);
          const karma = Number($('[name="karma"]').val() || 0);
          const remember = !!$('[name="remember"]').is(':checked');
          const skipDice = !!$('[name="skipDice"]').is(':checked');

          // Persist settings if requested
          if (remember) {
            await defender.setFlag("msh-faserip", "lastEscapeShift", shift);
            await defender.setFlag("msh-faserip", "lastEscapeKarma", karma);
          }

          const effectiveRank = shiftRank(defenderStrength, shift);

          // Roll
          const roll = await (new Roll("1d100")).evaluate();
          if (!skipDice) {
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: defender }),
              flavor: `${actualDefenderName} attempts to Escape`,
              rollMode: game.settings.get("core", "rollMode")
            });
          }

          const { cappedTotal, totalKarmaUsed } = 
            await rollWithKarmaAndHistory(defender, "Escaping", karma, roll);

          // Get result
          const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
          const colorLower = String(color || "").toLowerCase();
          const effects = effectsFor("escaping");
          const effect = effects[colorLower] || "Miss";

          const grid = buildResultGrid("escaping", colorLower, effects);
          const { bg, fg } = bannerColors(colorLower);

          // Effect blocks
          const effectBlocks = {
            miss: `
              <div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
                <div style="font-weight:bold;color:#c62828;">Miss</div>
                <div style="font-size:.9em;">Still held this turn; no other actions.</div>
              </div>`,
            escape: `
              <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
                <div style="font-weight:bold;color:#0d47a1;">Escape</div>
                <div style="font-size:.9em;">Free of hold; may move up to half speed (no other actions).</div>
              </div>`,
            reverse: `
              <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
                <div style="font-weight:bold;color:#2e7d32;">Reverse</div>
                <div style="font-size:.9em;">Free; may move ½, Grapple attacker, or take another action at -2 CS.</div>
              </div>`
          };

          const effectBlock = effectBlocks[effect.toLowerCase()] || "";

          // Create result card
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
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  }).render(true);
}