// scripts/modules/effects/stun-recovery.js v1.0.0 - 2026-10-01
// v1.0.0: House rule (houseRules.stunRecoveryFeat, default off). At the
//         start of each new combat round, a stunned combatant whose stun was
//         longer than 1 round may make a Green Endurance FEAT (Karma allowed)
//         to shake it off. Success removes the Stunned effect so the
//         character acts normally this round; failure leaves the stun to
//         count down as usual. One attempt per character per round.
//         Full-Auto rolls automatically; Semi-Auto and Manual post a chat
//         card with a "Roll Endurance FEAT" button for the owner or GM.
//         Applies to all actors (heroes, villains, NPCs).

import { getRemaining, canWriteEffectsOn } from "./effect-engine.js";
import { getAbilityShift } from "./effect-modifiers.js";
import { shiftRank, universalColor } from "../actions/action-utils.js";
import { resolveCombatMode } from "../actions/action-dispatcher.js";
import { safeActorUpdateEffect } from "../../gm-utils.js";
import { TURN_SECONDS } from "../recovery-timing.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

export function stunRecoveryEnabled() {
  try { return game.settings.get("msh-faserip", "houseRules.stunRecoveryFeat") === true; }
  catch (_) { return false; }
}

/** Same match applyStun uses for an existing stun. */
export function findStunEffect(actor) {
  return actor?.effects?.find(e =>
    !e.disabled && (
      e.statuses?.has("stunned") ||
      e.flags?.[SCOPE()]?.effectType === "stunned" ||
      e.name?.toLowerCase().includes("stunned")
    )
  ) ?? null;
}

/** Total stun length in rounds as applied (not what's left). */
function totalStunRounds(stun) {
  const d = stun?.duration ?? {};
  const units = String(d.units ?? "").toLowerCase();
  if (Number.isFinite(d.value) && (units === "rounds" || units === "turns")) return d.value;
  if (Number.isFinite(d.value) && units === "seconds") return Math.ceil(d.value / TURN_SECONDS);
  if (Number.isFinite(d.rounds)) return d.rounds;
  if (Number.isFinite(d.seconds)) return Math.ceil(d.seconds / TURN_SECONDS);
  return null;
}

function roundsLeft(stun) {
  const r = getRemaining(stun);
  if (Number.isFinite(r.rounds)) return r.rounds;
  if (Number.isFinite(r.seconds)) return Math.ceil(r.seconds / TURN_SECONDS);
  return null;
}

/** Endurance rank after effect shifts and the Impaired-Endurance FEAT penalty. */
function effectiveEnduranceRank(actor) {
  const base = actor.system?.abilities?.endurance?.rank || "Typical";
  let shift = 0;
  try { shift += getAbilityShift(actor, "endurance"); } catch (_) {}
  shift += Number(actor.system?.combatMods?.selfPenaltyCS) || 0;
  return shift ? shiftRank(base, shift) : base;
}

async function setStunFlag(actor, stun, key, value) {
  await safeActorUpdateEffect(actor, stun.id, { [`flags.${SCOPE()}.${key}`]: value });
}

async function removeStun(actor, stun) {
  if (!actor.effects.has(stun.id)) return;
  if (canWriteEffectsOn(actor)) {
    await stun.delete();
    return;
  }
  const { executeAsGM } = await import("../../gm-utils.js");
  await executeAsGM("deleteActiveEffects", { targetActorUuid: actor.uuid, effectIds: [stun.id] });
}

function cardHtml({ borderColor, headerBg, titleColor, body, footer = "" }) {
  return `
    <div style="background:#f5f5f0;border:1px solid ${borderColor};border-radius:3px;">
      <div style="padding:5px 10px;border-bottom:1px solid #ddd;background:${headerBg};display:flex;justify-content:space-between;">
        <strong style="color:${titleColor};">STUN RECOVERY</strong>
        <span style="font-size:.8em;color:#795548;font-style:italic;">House rule</span>
      </div>
      <div style="padding:6px 10px;font-size:.9em;">${body}</div>
      ${footer}
    </div>`;
}

/** Roll the Green Endurance FEAT, post the result, and remove the stun on success. */
async function rollStunRecovery(actor, stun, round) {
  await setStunFlag(actor, stun, "stunRecoveryRolled", round);

  const rank = effectiveEnduranceRank(actor);
  let rollTotal, total, karmaUsed = 0;
  try {
    const { resolveResistFeat } = await import("../dice/dice-roller.js");
    const fr = await resolveResistFeat(actor, {
      sourceName: "Stun Recovery (Endurance FEAT)",
      rank,
      requirement: "Green",
      declareTimeoutMs: 10000,
      localDeclareTimeoutMs: 10000
    });
    rollTotal = fr.rollTotal;
    total = Math.min(100, fr.cappedTotal);
    karmaUsed = fr.karmaUsed || 0;
  } catch (e) {
    console.warn("[FASERIP] Stun recovery karma routing failed; rolling plain:", e);
    const r = await (new Roll("1d100")).evaluate();
    rollTotal = r.total;
    total = Math.min(100, r.total);
  }

  const color = String(universalColor(rank, total) || "white").toLowerCase();
  const success = color !== "white";

  // Re-find in case the stun ended or changed while the Karma dialog was open.
  const current = actor.effects.get(stun.id);
  if (success && current) await removeStun(actor, current);

  const left = current ? roundsLeft(current) : null;
  const karmaNote = karmaUsed ? ` + ${karmaUsed} Karma` : "";
  const outcome = success
    ? `<strong>${actor.name}</strong> shakes off the stun and may act normally this round.`
    : `<strong>${actor.name}</strong> remains stunned${left != null ? ` (${left} round${left === 1 ? "" : "s"} left)` : ""}.`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      borderColor: success ? "#4caf50" : "#9e9e9e",
      headerBg: success ? "#e8f5e9" : "#eeeeee",
      titleColor: success ? "#2e7d32" : "#555",
      body: `
        <div>Endurance ${rank} FEAT (Green): rolled ${rollTotal}${karmaNote} = <strong>${total}</strong> — ${color.toUpperCase()}</div>
        <div style="margin-top:3px;">${outcome}</div>`
    })
  });
  return { success, color, total };
}

async function postStunRecoveryPrompt(actor, stun, round) {
  if (stun.getFlag(SCOPE(), "stunRecoveryPrompted") === round) return;
  await setStunFlag(actor, stun, "stunRecoveryPrompted", round);
  const left = roundsLeft(stun);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      borderColor: "#9e9e9e",
      headerBg: "#eeeeee",
      titleColor: "#555",
      body: `<strong>${actor.name}</strong> is stunned${left != null ? ` (${left} round${left === 1 ? "" : "s"} left)` : ""} and may try a Green Endurance FEAT to recover this round.`,
      footer: `
        <div style="display:flex;justify-content:center;padding:6px 10px;border-top:1px solid #e0e0e0;background:#fafafa;">
          <button type="button" data-action="stun-recovery-roll" data-actor-uuid="${actor.uuid}" data-round="${round}"
             style="font-size:.8em;padding:2px 8px;line-height:1.4;width:auto;cursor:pointer;">Roll Endurance FEAT</button>
        </div>`
    })
  });
}

/**
 * GM-side, once per new combat round (called from init.js updateCombat
 * after expired effects are removed). Offers or rolls recovery for each
 * stunned combatant whose stun was longer than 1 round.
 */
export async function processStunRecoveryRound(combat) {
  if (!game.user.isGM || !stunRecoveryEnabled()) return;
  if (!combat?.started) return;
  const round = combat.round;
  const seen = new Set();

  for (const c of combat.combatants) {
    const actor = c?.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);

    const stun = findStunEffect(actor);
    if (!stun) continue;
    const total = totalStunRounds(stun);
    if (!(total > 1)) continue; // 1-round (Green) stun: no roll
    if (stun.getFlag(SCOPE(), "stunRecoveryRolled") === round) continue;

    try {
      if (resolveCombatMode(actor) === "full") {
        await rollStunRecovery(actor, stun, round);
      } else {
        await postStunRecoveryPrompt(actor, stun, round);
      }
    } catch (e) {
      console.error(`[FASERIP] Stun recovery failed for ${actor.name}:`, e);
    }
  }
}

/** Chat button handler (wired in chat-hooks.js). */
export async function handleStunRecoveryClick(btn) {
  const doc = await fromUuid(btn.dataset.actorUuid || "");
  const actor = doc?.actor ?? doc ?? null;
  if (!actor) { ui.notifications.warn("Actor not found."); return; }
  if (!game.user.isGM && !actor.isOwner) {
    ui.notifications.warn("Only the owner or GM can roll this recovery.");
    return;
  }
  const round = Number(btn.dataset.round);
  if (!game.combat?.started || game.combat.round !== round) {
    ui.notifications.warn("That recovery roll was for an earlier round.");
    return;
  }
  const stun = findStunEffect(actor);
  if (!stun) { ui.notifications.info(`${actor.name} is no longer stunned.`); return; }
  if (stun.getFlag(SCOPE(), "stunRecoveryRolled") === round) {
    ui.notifications.warn(`${actor.name} already tried to recover this round.`);
    return;
  }
  btn.disabled = true;
  await rollStunRecovery(actor, stun, round);
}
