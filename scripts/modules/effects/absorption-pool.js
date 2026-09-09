// scripts/modules/effects/absorption-pool.js v1.0.1 - 2026-09-09
// v1.0.1: card omits the pool/clock line when nothing was pooled.
// v1.0.0: Absorption Power on the faserip-rules powers kernel (RAW, RULED
//         2026-09-09): the absorbed points heal existing damage first, the
//         remainder raises Health above max as a pool capped at the Power
//         rank number; damage above the rank number hits real Health and may
//         be redirected next round on the absorbed type's own column at the
//         absorber's Agility; the pool dissipates 10 rounds after the last
//         absorption (one refreshed clock) and later damage comes off it first.
//
// Model: system.attributes.health.value is REAL Health + POOL, so every
// existing Health reader keeps working. The pool itself is the actor flag
//   flags.msh-faserip.absorption = { pool, expiresRound, expiresWorldTime,
//                                   damageType, sourceItemId, rank, rankLabel,
//                                   redirect: { amount, damageType, round,
//                                               expiresRound } | null }
// splitHealth(actor) is the one place that separates the two.
//
// Replaces mitigation.js v3.1.x's temp-HP model (per-event 10-round cliffs on
// a stat.loss/health ongoing record the engine never executed — fixed-bug)
// and its unread pendingRedirect flag.

import {
  absorbAttack, applyDamageToPool, absorptionRedirectColumn, ABSORPTION_POOL_ROUNDS,
} from "../../lib/faserip-rules/faserip-powers.js";
import { safeActorUpdate, safeActorSetFlag, safeActorCreateEffect, safeActorDeleteEffects } from "../../gm-utils.js";
import { TURN_SECONDS } from "../recovery-timing.js";

export const ABSORPTION_POOL_VERSION = "1.0.1";
const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");
const FLAG = "absorption";
const AE_ONGOING_ID = "absorption.pool";
const HP_PATH = "system.attributes.health.value";

// ─── State ───────────────────────────────────────────────────────────────────

export function getAbsorptionPool(actor) {
  const f = actor?.getFlag?.(SCOPE(), FLAG);
  if (!f || !(Number(f.pool) > 0)) return null;
  return f;
}

/** { value, real, pool, max } — the only place value is split into real + pool. */
export function splitHealth(actor) {
  const value = Number(actor?.system?.attributes?.health?.value ?? 0);
  const max = Number(actor?.system?.attributes?.health?.max ?? 0);
  const pool = Math.min(value, Number(getAbsorptionPool(actor)?.pool ?? 0));
  return { value, real: value - pool, pool, max };
}

function currentRound() {
  return (game.combat && game.combat.round > 0) ? game.combat.round : null;
}

// Kernel damage-type key for the redirect column.
export function kernelDamageKey(damageType) {
  const t = String(damageType || "").toLowerCase();
  if (t.startsWith("force")) return "force";
  if (t.startsWith("physical-edged") || t.includes("edged")) return "physical-edged";
  if (t.startsWith("physical-ranged") || t.includes("shooting")) return "physical-ranged";
  if (t.startsWith("physical")) return "physical-blunt";
  return "energy";
}

const ATTACK_FORM_BY_KEY = { energy: "energy", force: "force", "physical-blunt": "blunt", "physical-edged": "edged", "physical-ranged": "shooting" };

// ─── Absorbing a hit (pure plan; mitigation.js calls this) ───────────────────

/**
 * Plan one absorbed hit for the actor. No writes.
 * @returns kernel result plus { damageType, sourceItemId, rank, rankLabel }
 */
export function planAbsorption(actor, { damage, rankNumber, rank, rankLabel, damageType, sourceItemId }) {
  const { real, pool, max } = splitHealth(actor);
  const round = currentRound() ?? 0;
  const k = absorbAttack({ rankNumber, damage, health: real, maxHealth: max, pool, round });
  return { ...k, rankNumber, rank, rankLabel, damageType, sourceItemId, inCombat: currentRound() != null };
}

// ─── Applying the event (action-utils.js calls this after the HP write) ──────

/**
 * Record the pool after an absorbed hit. The caller has already written
 * health.value = real + pool in the same update that carried the pool flag
 * (see absorptionFlagData) — this only posts the card, syncs the AE, and
 * banks the redirect.
 */
export function absorptionFlagData(actor, plan) {
  const prev = getAbsorptionPool(actor);
  const round = currentRound();
  const worldNow = game.time?.worldTime ?? 0;
  const flag = {
    pool: plan.pool,
    rank: plan.rank || null,
    rankLabel: plan.rankLabel || null,
    rankNumber: plan.rankNumber,
    damageType: plan.damageType,
    sourceItemId: plan.sourceItemId || null,
    expiresRound: round != null ? round + ABSORPTION_POOL_ROUNDS : null,
    expiresWorldTime: round != null ? null : worldNow + ABSORPTION_POOL_ROUNDS * TURN_SECONDS,
    redirect: plan.redirect > 0
      ? { amount: plan.redirect, damageType: plan.damageType, round: round, expiresRound: round != null ? round + 1 : null }
      : (prev?.redirect ?? null),
  };
  return { [`flags.${SCOPE()}.${FLAG}`]: plan.pool > 0 ? flag : null, flag };
}

export async function afterAbsorptionEvent(actor, plan, { attackerUuid = null } = {}) {
  if (!actor) return;
  await syncPoolEffect(actor);
  const parts = [];
  if (plan.healed > 0) parts.push(`healed <b>${plan.healed}</b>`);
  if (plan.poolGain > 0) parts.push(`banked <b>${plan.poolGain}</b> extra Health`);
  if (plan.healed <= 0 && plan.poolGain <= 0 && plan.absorbed > 0) parts.push(`pool already full`);
  const { real, pool } = splitHealth(actor);
  const clock = plan.inCombat
    ? `dissipates end of round ${currentRound() + ABSORPTION_POOL_ROUNDS}`
    : `dissipates in ${ABSORPTION_POOL_ROUNDS} rounds (${ABSORPTION_POOL_ROUNDS * TURN_SECONDS}s)`;
  const excessLine = plan.redirect > 0
    ? `<div style="margin-top:4px;">${plan.redirect} exceeded the ${plan.rankLabel || plan.rankNumber} rank number and hit real Health — <b>${plan.redirect}</b> may be redirected next round.</div>`
    : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="msh-card" style="background:#e8f5e9;border:1px solid #66bb6a;padding:8px;border-radius:3px;">
      <strong>${actor.name}</strong> absorbed <b>${plan.absorbed}</b> ${plan.damageType}${parts.length ? " — " + parts.join(", ") : ""}.
      <div style="font-size:0.9em;color:#555;margin-top:4px;">Health ${real}${pool > 0 ? ` <span style="color:#2e7d32;">+${pool} absorbed</span> &nbsp;|&nbsp; pool ${pool}/${plan.rankNumber}, ${clock}` : ""}</div>
      ${excessLine}
    </div>`,
  });
  if (plan.redirect > 0) await postRedirectCard(actor, { attackerUuid });
}

// ─── AE mirror (visible on the token/sheet; no mechanics) ────────────────────

async function syncPoolEffect(actor) {
  const scope = SCOPE();
  const f = getAbsorptionPool(actor);
  const existing = actor.effects.filter(e => e.flags?.[scope]?.ongoingId === AE_ONGOING_ID);
  if (!f) {
    if (existing.length) await safeActorDeleteEffects(actor, existing.map(e => e.id), { mshIntentional: true });
    return;
  }
  const name = `Absorption Pool (+${f.pool})`;
  const data = {
    name, img: "icons/svg/aura.svg", disabled: false, changes: [],
    statuses: ["absorption-pool"],
    flags: { [scope]: { effectType: "absorption-pool", ongoingId: AE_ONGOING_ID } },
    ...(f.expiresRound != null ? { duration: { rounds: ABSORPTION_POOL_ROUNDS, startRound: f.expiresRound - ABSORPTION_POOL_ROUNDS } } : {}),
  };
  if (existing.length) {
    try { await existing[0].update({ name, duration: data.duration ?? {} }); } catch (_e) {}
  } else {
    await safeActorCreateEffect(actor, [data]);
  }
}

// ─── Pool consumption and expiry ─────────────────────────────────────────────

/** Damage of any other kind comes off the pool first (book text). */
export async function consumePool(actor, amount) {
  const f = getAbsorptionPool(actor);
  if (!f || !(amount > 0)) return { fromPool: 0 };
  const { real } = splitHealth(actor);
  const k = applyDamageToPool({ pool: f.pool, health: real, damage: amount });
  if (k.fromPool <= 0) return { fromPool: 0 };
  if (k.pool > 0) await safeActorSetFlag(actor, SCOPE(), FLAG, { ...f, pool: k.pool });
  else await safeActorSetFlag(actor, SCOPE(), FLAG, null);
  await syncPoolEffect(actor);
  return { fromPool: k.fromPool, pool: k.pool };
}

/** The pool lapses: remove it from health.value, keep real Health. */
export async function expireAbsorptionPool(actor, { reason = "dissipated" } = {}) {
  const f = getAbsorptionPool(actor);
  if (!f) return false;
  const { real, pool } = splitHealth(actor);
  await safeActorUpdate(actor, { [HP_PATH]: real, [`flags.${SCOPE()}.${FLAG}`]: f.redirect ? { ...f, pool: 0 } : null }, { mshAbsorptionExpiry: true });
  await syncPoolEffect(actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="msh-card" style="background:#fff3e0;border:1px solid #ffb74d;padding:8px;border-radius:3px;">
      <strong>${actor.name}</strong>'s absorbed energy ${reason} — <b>${pool}</b> extra Health lost. Health ${real}.
    </div>`,
  });
  return true;
}

async function clearRedirect(actor) {
  const f = actor?.getFlag?.(SCOPE(), FLAG);
  if (!f?.redirect) return;
  const next = { ...f, redirect: null };
  await safeActorSetFlag(actor, SCOPE(), FLAG, (next.pool > 0) ? next : null);
}

function actorsWithPool() {
  const out = new Map();
  for (const a of game.actors ?? []) if (a.getFlag(SCOPE(), FLAG)) out.set(a.uuid, a);
  for (const t of canvas?.tokens?.placeables ?? []) {
    const a = t.actor; if (a && a.getFlag(SCOPE(), FLAG)) out.set(a.uuid, a);
  }
  return [...out.values()];
}

function isActiveGM() {
  return game.user?.isGM && (game.users?.activeGM?.id ?? game.user.id) === game.user.id;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

Hooks.on("preUpdateActor", (actor, changes, options) => {
  const hv = foundry.utils.getProperty(changes, HP_PATH) ?? changes?.[HP_PATH];
  if (hv === undefined) return;
  options.mshPrevHealth = Number(actor.system?.attributes?.health?.value ?? 0);
});

// Any Health decrease that is not the absorbed hit itself (that update carries
// the pool flag) and not the pool's own expiry comes off the pool first.
Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (userId !== game.user?.id) return;
  if (options?.mshAbsorptionExpiry) return;
  const flagKey = `flags.${SCOPE()}.${FLAG}`;
  if (foundry.utils.getProperty(changes, flagKey) !== undefined || changes?.[flagKey] !== undefined) return;
  const prev = options?.mshPrevHealth;
  if (!Number.isFinite(prev)) return;
  const now = Number(actor.system?.attributes?.health?.value ?? 0);
  if (now >= prev) return;
  if (!getAbsorptionPool(actor)) return;
  try { await consumePool(actor, prev - now); }
  catch (e) { console.warn("[FASERIP ABSORPTION] pool consumption failed:", e); }
});

// Round clock: expire pools and stale redirects.
Hooks.on("updateCombat", async (combat, changed) => {
  if (!("round" in changed) || !isActiveGM()) return;
  const round = combat.round;
  for (const actor of actorsWithPool()) {
    const f = actor.getFlag(SCOPE(), FLAG);
    try {
      if (f.redirect && f.redirect.expiresRound != null && round > f.redirect.expiresRound) await clearRedirect(actor);
      if (f.pool > 0 && f.expiresRound != null && round >= f.expiresRound) await expireAbsorptionPool(actor);
    } catch (e) { console.warn("[FASERIP ABSORPTION] round tick failed:", e); }
  }
});

// Combat ends: move the remaining rounds onto the world clock.
Hooks.on("deleteCombat", async (combat) => {
  if (!isActiveGM()) return;
  const round = combat.round || 0;
  const worldNow = game.time?.worldTime ?? 0;
  for (const actor of actorsWithPool()) {
    const f = actor.getFlag(SCOPE(), FLAG);
    if (!(f.pool > 0) || f.expiresRound == null) continue;
    const left = Math.max(0, f.expiresRound - round);
    await safeActorSetFlag(actor, SCOPE(), FLAG, { ...f, expiresRound: null, expiresWorldTime: worldNow + left * TURN_SECONDS });
  }
});

Hooks.on("updateWorldTime", async (worldTime) => {
  if (!isActiveGM()) return;
  for (const actor of actorsWithPool()) {
    const f = actor.getFlag(SCOPE(), FLAG);
    if (f.pool > 0 && f.expiresRound == null && f.expiresWorldTime != null && worldTime >= f.expiresWorldTime) {
      try { await expireAbsorptionPool(actor); } catch (e) { console.warn("[FASERIP ABSORPTION] time tick failed:", e); }
    }
  }
});

// ─── Redirect (next round, absorbed type's column at Agility) ────────────────

async function postRedirectCard(actor, { attackerUuid = null } = {}) {
  const f = actor.getFlag(SCOPE(), FLAG);
  const r = f?.redirect;
  if (!r || !(r.amount > 0)) return;
  const key = kernelDamageKey(r.damageType);
  const column = absorptionRedirectColumn(key);
  const when = r.expiresRound != null ? `round ${r.expiresRound}` : "your next action";
  const agility = actor.system?.abilities?.agility?.rank || "Typical";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="msh-card" style="background:#e3f2fd;border:1px solid #64b5f6;padding:8px;border-radius:3px;">
      <strong>${actor.name}</strong> may redirect <b>${r.amount}</b> ${r.damageType} on ${when}
      <div style="font-size:0.9em;color:#555;margin-top:2px;">${column} column at Agility (${agility}); target a token first.</div>
      <button type="button" class="msh-absorption-redirect" data-actor-uuid="${actor.uuid}" data-attacker-uuid="${attackerUuid || ""}" style="margin-top:6px;">Redirect ${r.amount}</button>
    </div>`,
  });
}

async function executeRedirect(actorUuid) {
  const actor = await fromUuid(actorUuid);
  const doc = actor?.actor ?? actor;
  if (!doc) return;
  if (!(game.user.isGM || doc.isOwner)) { ui.notifications?.warn?.("Only the absorber or the GM may redirect."); return; }
  const f = doc.getFlag(SCOPE(), FLAG);
  const r = f?.redirect;
  if (!r || !(r.amount > 0)) { ui.notifications?.warn?.("Nothing banked to redirect."); return; }
  const round = currentRound();
  if (r.round != null && round != null && round <= r.round) { ui.notifications?.warn?.("The redirect is available next round."); return; }
  if (r.expiresRound != null && round != null && round > r.expiresRound) {
    ui.notifications?.warn?.("The absorbed excess was not discharged in time and is lost.");
    await clearRedirect(doc); return;
  }
  const targets = Array.from(game.user?.targets ?? []);
  if (!targets.length) { ui.notifications?.warn?.("Target a token to redirect at."); return; }

  const { resolveKernelAttack, applyDamageToTargets } = await import("../actions/action-utils.js");
  const key = kernelDamageKey(r.damageType);
  const column = absorptionRedirectColumn(key);
  const rank = doc.system?.abilities?.agility?.rank || "Typical";
  const roll = await (new Roll("1d100")).evaluate();
  const res = resolveKernelAttack({ column, rank, shifts: [], roll: roll.total });
  const hit = res.color !== "white";
  const target = targets[0];

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: doc }),
    content: `<div class="msh-card" style="border:1px solid #64b5f6;padding:8px;border-radius:3px;">
      <strong>${doc.name}</strong> redirects <b>${r.amount}</b> ${r.damageType} at <b>${target.name}</b>
      <div style="font-size:0.9em;color:#555;margin-top:2px;">${column} at ${rank}: rolled ${roll.total} → <b style="color:${res.color === "white" ? "#999" : res.color}">${res.color.toUpperCase()} — ${res.effectLabel}</b></div>
      ${hit ? "" : "<div style=\"margin-top:4px;\">Missed — the absorbed excess is spent.</div>"}
      ${hit && res.effect ? `<div style="font-size:0.85em;color:#777;margin-top:4px;">${res.effectLabel} result: apply the Battle Effect by hand (v1 redirect applies damage only).</div>` : ""}
    </div>`,
  });
  if (hit) {
    await applyDamageToTargets({
      damage: r.amount, damageType: r.damageType, attackForm: ATTACK_FORM_BY_KEY[key] || "energy",
      targets, attackerUuid: doc.uuid, wasKillResult: res.effect === "kill",
    });
  }
  await clearRedirect(doc);
}

Hooks.on("renderChatMessageHTML", (message, htmlEl) => {
  htmlEl.querySelectorAll?.(".msh-absorption-redirect").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      btn.disabled = true;
      try { await executeRedirect(btn.dataset.actorUuid); }
      catch (e) { console.error("[FASERIP ABSORPTION] redirect failed:", e); btn.disabled = false; }
    });
  });
});
