// scripts/modules/actions/chat-hooks.js
import { ActionDispatcher } from "./action-dispatcher.js";
import { openBreakingFeatDialog } from "./breaking-feat.js";
import { openCollisionDamageDialog } from "./collision-damage.js";

export function installActionChatHandlers() {
  // idempotent guard
  game.msh ??= {};
  if (game.msh.chatHooksInstalled) return;
  game.msh.chatHooksInstalled = true;

  // 1) Stun/Slam/Kill chips
  Hooks.on("renderChatMessage", (message, html) => {
    html.on("click", "a.faserip-chip[data-check]", async (ev) => {
      ev.preventDefault();
      const el = ev.currentTarget;

      const checkType    = el.dataset.check;                // "stun" | "slam" | "kill"
      const attackForm   = el.dataset.attackForm || "blunt";
      const dmgThrough   = Number(el.dataset.dmg || 0);
      const attackerUuid = el.dataset.attackerUuid || message.speaker?.actor;

      // Resolve an owner actor for dialog/message context
      let ownerActor = null;
      try {
        if (attackerUuid) {
          const doc = await fromUuid(attackerUuid);
          ownerActor = doc?.actor ?? doc ?? null;
        }
      } catch (_) {}
      ownerActor = ownerActor ?? game.actors?.get(message.speaker?.actor) ?? game.user?.character ?? null;

      // NEW: Smart auto-population from targeted tokens
      let prefill = { dmgThrough, attackForm };
      const targets = game.user.targets;
      
      if (targets.size === 1) {
        const targetToken = targets.first();
        const targetActor = targetToken.actor;
        
        if (targetActor) {
          prefill.targetName = targetToken.name;
          prefill.targetEndRank = targetActor.system?.abilities?.endurance?.rank || "Good";
          
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
          prefill  // Pass prefill data to the check action
        }
      });
    });
  });

  // 2) Breaking FEAT chip
  Hooks.on("renderChatMessage", (message, html) => {
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
  });

  // 3) Collision Damage Calculator chip
  Hooks.on("renderChatMessage", (message, html) => {
    html.on("click", '[data-action="calculate-collision"]', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      
      const targetName = btn.dataset.targetName || "Target";
      const targetEndurance = btn.dataset.targetEndurance || "Good";
      const slamDistance = Number(btn.dataset.slamDistance || 1);

      openCollisionDamageDialog({ targetName, targetEndurance, slamDistance });
    });
  });

  console.log("MSH FASERIP | Chat hooks installed (checks + breaking FEAT + collision damage)");
}