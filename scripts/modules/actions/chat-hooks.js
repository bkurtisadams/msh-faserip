// scripts/modules/actions/chat-hooks.js
import { ActionDispatcher } from "./action-dispatcher.js";
import { openBreakingFeatDialog } from "./breaking-feat.js";
import { openGrabbingBreakDialog } from "./grabbing-break.js";
import { openCollisionDamageDialog } from "./collision-damage.js";
import { 
  shiftRank, 
  rollWithKarmaAndHistory, 
  buildResultGrid, 
  bannerColors, 
  effectsFor,
  applyDamageToTargets
} from "./action-utils.js";

import { startAura, stopAura, isAuraMaintained } from "./nullify.js";

export function installActionChatHandlers() {
  // idempotent guard
  game.msh ??= {};
  if (game.msh.chatHooksInstalled) return;
  game.msh.chatHooksInstalled = true;

  // SINGLE combined hook for all chat interactions
  Hooks.on("renderChatMessageHTML", (message, element) => {
    const html = $(element);
    
    // 1) Stun/Slam/Kill/Escape chips
    html.on("click", "a.faserip-chip[data-check]", async (ev) => {
      ev.preventDefault();
      const el = ev.currentTarget;

      const checkType    = el.dataset.check;                // "stun" | "slam" | "kill" | "escape"
      const attackForm   = el.dataset.attackForm || "blunt";
      const dmgThrough   = Number(el.dataset.dmg || 0);
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
      const damage = Number(btn.dataset.damage || 0);
      const attackerUuid = btn.dataset.attackerUuid;
      const bypassArmor = btn.dataset.bypassArmor === "true";
      const damageType = btn.dataset.damageType || "physical-blunt";  // ADD THIS LINE
      
      await applyDamageToTargets(damage, {
        attackerUuid,
        damageType: damageType,  // ADD THIS LINE
        showNotification: true,
        updateButton: btn,
        bypassArmor: bypassArmor
      });
    });

    // 6) Force Save (Nullification / RAW: Endurance vs Power Rank)
    html.on("click", '[data-action="force-save"], [data-action="force-save-nullify"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const $msg = $(btn).closest(".message");
      const msg = game.messages.get($msg.data("messageId"));
      const f = msg?.flags?.["msh-faserip"] || {};
      if (!f.requiresSave) return;

      const ability    = f.saveAbility   || "endurance";
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
        prefill.attackForm    = "energy";
      }

      await ActionDispatcher.roll("save-nullify", {
        actor: ownerActor,
        abilityName: ability,
        opts: {
          prefill,
          ignoreDamageGate: ignoreGate,  // key: saves apply even if no dmg penetrates
          intensity,
          fixedRank
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


  }); // End of single combined Hooks.on

  console.log("MSH FASERIP | Chat hooks installed (checks + breaking FEAT + grabbing break + collision damage + escape + apply damage)");
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