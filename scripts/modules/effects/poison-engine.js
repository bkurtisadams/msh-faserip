// scripts/modules/effects/poison-engine.js v1.0.3 - 2026-08-01
// v1.0.3: Governor clock skew — endRankLossThisTurn accepts a `now` param;
//         the re-FEAT failure path passes effectiveNow. During a pre-advance
//         CTT hook, raw worldTime still equals the exposure stamp (elapsed 0)
//         and false-capped poison's own second rank loss. Stamp stays on raw
//         worldTime (dying's same-hook deferral check reads raw). Deferral
//         path now posts a "Poison Held at Bay" chat card — no more silent
//         FEAT failures.
// scripts/modules/effects/poison-engine.js v1.0.2 - 2026-08-01
// v1.0.2: THE bug — registerOngoingEffect creates AEs disabled:true by
//         default (dying passes disabled:false; poison didn't). Every find
//         filters !e.disabled, so the poison AE was never processed and no
//         log could fire. Pass disabled:false in aeOverrides + force-enable
//         in the post-create update (revives stale disabled AEs from
//         earlier tests on re-exposure).
// scripts/modules/effects/poison-engine.js v1.0.1 - 2026-08-01
// v1.0.1: CTT clock fix — timeTracker.timeAdvanced fires BEFORE
//         game.time.advance(), so processPoisonRound accepts pendingSeconds
//         and evaluates/re-arms against effectiveNow = worldTime + pending.
//         Waiting path now logs remaining seconds. featLine shows the
//         Intensity rank name in chat cards.
// scripts/modules/effects/poison-engine.js v1.0.0 - 2026-08-01
// v1.0.0: Poisons & Toxins per Advanced Set RAW. Exposure FEAT vs toxin
//         Intensity (Resistance to Toxins substitutes for Endurance and
//         never drops); failure = unconscious 1d10 rounds + immediate
//         Endurance rank loss; re-FEAT at lowered rank after 1d10 turns,
//         success halts, failure loses another rank and re-arms the window.
//         Endurance Shift-0 from poison = death (mirrors dying death branch).
//         One-rank-per-turn governor shared with dying via endRankLoss flag;
//         poison stamps take priority, processDyingRound defers (RAW: poison
//         losses override other Endurance losses, max 1 rank/round).
//         Halting requires the victim's own FEAT, or a treater with First
//         Aid/Medicine talent AND an antitoxin item (administer-antitoxin
//         chat button, wired in chat-hooks.js v1.7.4).

import { applyUnconscious } from "./effect-engine.js";
import { loseOneEnduranceRank, registerOngoingEffect } from "./ongoing-engine.js";
import { determineFeatRequirement, checkFeatSuccess } from "../actions/ability-feat-dialog.js";
import { TOXINS } from "../../rules/rules-reference.js";
import { safeActorSetFlag } from "../../gm-utils.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

const _poisonLocks = new Set();

function turnSeconds() {
  try { return Number(game.settings.get("msh-faserip", "turnSeconds")) || 6; }
  catch { return 6; }
}

async function rollD10() {
  const r = await (new Roll("1d10")).evaluate();
  return r.total;
}

async function rollD100() {
  const r = await (new Roll("1d100")).evaluate();
  return r.total;
}

// ── Governor: max one Endurance rank lost per turn, poison has priority ──────

export function endRankLossThisTurn(actor, now = game.time.worldTime) {
  const stamp = actor.getFlag(SCOPE(), "endRankLoss");
  if (!stamp?.at && stamp?.at !== 0) return null;
  const elapsed = now - stamp.at;
  if (elapsed >= 0 && elapsed < turnSeconds()) return stamp;
  return null;
}

async function stampEndRankLoss(actor, source) {
  await safeActorSetFlag(actor, SCOPE(), "endRankLoss", {
    at: game.time.worldTime,
    source,
  });
}

// ── FEAT rank resolution ─────────────────────────────────────────────────────

/**
 * Resistance to Toxins substitutes its rank for Endurance on poison FEATs
 * and does not drop on failure (Endurance takes the loss).
 */
export function resolvePoisonFeatRank(actor) {
  const power = actor.items.find(i =>
    i.type === "power" &&
    i.system?.isActive !== false &&
    /resist(ance)?\s*(to\s*)?toxin/i.test(i.name || "")
  );
  if (power?.system?.rank) {
    return { rank: power.system.rank, source: power.name };
  }
  const endRank = actor.system?.abilities?.endurance?.rank || "Typical";
  return { rank: endRank, source: "Endurance" };
}

async function rollPoisonFeat(actor, intensityRank) {
  const { rank, source } = resolvePoisonFeatRank(actor);
  const req = determineFeatRequirement(rank, intensityRank);
  if (req.automatic) {
    return { success: true, automatic: true, rank, source, requirement: "Automatic", roll: null, color: null };
  }
  const roll = await rollD100();
  const color = game.msh.rollUniversalTable(rank, roll);
  const success = !req.impossible && checkFeatSuccess(color, req.requirement);
  return { success, automatic: false, rank, source, requirement: req.requirement, impossible: req.impossible, roll, color };
}

function featLine(feat, intensityRank = "") {
  const vs = intensityRank ? `Intensity ${intensityRank}` : "Intensity";
  if (feat.automatic) {
    return `${feat.source} ${feat.rank} — 3+ ranks above ${vs}: <strong>automatic success</strong>`;
  }
  const imp = feat.impossible ? " (Impossible)" : "";
  return `${feat.source} ${feat.rank} vs ${vs} — needs ${feat.requirement}${imp}, rolled ${feat.roll} = <strong>${(feat.color || "").toUpperCase()}</strong>`;
}

function resolveToxin({ toxinId = null, intensity = null, name = null } = {}) {
  if (toxinId && TOXINS[toxinId]) {
    return { id: toxinId, name: TOXINS[toxinId].name, intensity: TOXINS[toxinId].intensity };
  }
  return {
    id: toxinId || "custom",
    name: name || "Unknown Toxin",
    intensity: intensity || "Typical",
  };
}

async function poisonChat(actor, title, body, { border = "#6a1b9a", bg = "#f3e5f5" } = {}) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:${bg};border:2px solid ${border};padding:10px;border-radius:5px;">
      <div style="font-size:1.1em;font-weight:bold;color:${border};margin-bottom:4px;">
        <i class="fas fa-skull-crossbones"></i> ${title}
      </div>
      <div>${body}</div>
    </div>`,
  });
}

function antitoxinButton(actor) {
  return `<div style="margin-top:6px;text-align:right;">
    <button type="button" data-action="administer-antitoxin"
            data-actor-uuid="${actor.uuid}"
            style="font-size:11px;padding:3px 8px;background:#2e7d32;color:#fff;border:none;border-radius:3px;cursor:pointer;">
      <i class="fas fa-syringe"></i> Administer Antitoxin
    </button>
  </div>`;
}

// ── Exposure ─────────────────────────────────────────────────────────────────

/**
 * Expose an actor to a toxin. Rolls the initial Endurance (or Resistance to
 * Toxins) FEAT vs the toxin's Intensity. On failure: unconscious 1d10 rounds,
 * immediate Endurance rank loss, and a registered "poison" ongoing effect
 * that re-FEATs after 1d10 turns via processPoisonRound.
 *
 * @param {Actor} actor
 * @param {object} opts { toxinId, intensity, name, sourceName }
 * @returns {string} "resisted" | "poisoned" | "already-poisoned" | "none"
 */
export async function applyPoisonExposure(actor, opts = {}) {
  if (!actor) return "none";
  const scope = SCOPE();
  const toxin = resolveToxin(opts);
  const sourceName = opts.sourceName || "";
  const srcLabel = sourceName ? ` (${sourceName})` : "";

  const existing = actor.effects.find(e => e.flags?.[scope]?.ongoingId === "poison" && !e.disabled);
  if (existing) {
    await poisonChat(actor, `Poison Exposure${srcLabel}`,
      `<strong>${actor.name}</strong> is already poisoned (${existing.getFlag(scope, "toxinName")}). New exposure ignored — GM may raise Intensity manually.`);
    return "already-poisoned";
  }

  const feat = await rollPoisonFeat(actor, toxin.intensity);

  if (feat.success) {
    await poisonChat(actor, `Poison Resisted${srcLabel}`,
      `<strong>${actor.name}</strong> shakes off ${toxin.name} (Intensity ${toxin.intensity}).
       <div style="margin-top:4px;font-size:.9em;color:#555;">${featLine(feat, toxin.intensity)}</div>`,
      { border: "#2e7d32", bg: "#e8f5e9" });
    return "resisted";
  }

  // ── Failure: unconscious 1d10 rounds + immediate rank loss ────────────────
  const koRounds = await rollD10();
  await applyUnconscious(actor, { rounds: koRounds });

  const originalEndurance = actor.system?.abilities?.endurance?.rank;
  let lossNote = "";
  if (endRankLossThisTurn(actor)) {
    lossNote = `<div style="margin-top:4px;font-size:.9em;color:#7a3d00;">Endurance rank already lost this turn — poison loss deferred to next FEAT window (max 1 rank/round).</div>`;
  } else {
    const loss = await loseOneEnduranceRank(actor, { source: `Poison: ${toxin.name}` });
    if (loss.lost) await stampEndRankLoss(actor, "poison");
    if (loss.belowFeeble || loss.newRank === "Shift-0") {
      // Shift-0 from the initial loss: death handled on next process tick per
      // RAW "reaches Shift 0 ... dies" — process immediately for clarity.
    }
  }

  const windowTurns = await rollD10();
  const nextFeatAt = game.time.worldTime + windowTurns * turnSeconds();

  await registerOngoingEffect(actor, "poison", {
    type: "stat.loss",
    stat: "endurance",
    combatOnly: false,          // processed by processPoisonRound, not generic engine
    autoDisable: false,
  }, {
    name: `Poisoned: ${toxin.name} (${toxin.intensity})`,
    img: "icons/svg/poison.svg",
    disabled: false,            // registerOngoingEffect defaults disabled:true
  });

  const poisonAE = actor.effects.find(e => e.flags?.[scope]?.ongoingId === "poison");
  if (poisonAE) {
    await poisonAE.update({
      "disabled": false,               // revive stale disabled AE if reusing
      "duration.expiry": "roundEnd",   // v14 isTemporary rule — token HUD badge
      [`flags.${scope}.toxinId`]: toxin.id,
      [`flags.${scope}.toxinName`]: toxin.name,
      [`flags.${scope}.intensityRank`]: toxin.intensity,
      [`flags.${scope}.nextFeatAt`]: nextFeatAt,
      [`flags.${scope}.windowTurns`]: windowTurns,
      [`flags.${scope}.originalEndurance`]: originalEndurance,
      [`flags.${scope}.sourceName`]: sourceName,
    });
  }

  const curRank = actor.system?.abilities?.endurance?.rank;
  await poisonChat(actor, `Poisoned${srcLabel}`,
    `<strong>${actor.name}</strong> is poisoned by ${toxin.name} (Intensity ${toxin.intensity})!
     <div style="margin-top:4px;font-size:.9em;color:#555;">${featLine(feat, toxin.intensity)}</div>
     <div style="margin-top:4px;">Unconscious for <strong>${koRounds}</strong> rounds. Endurance now <strong>${curRank}</strong>.${lossNote}</div>
     <div style="margin-top:4px;font-size:.9em;color:#555;">Next Endurance FEAT in ${windowTurns} turns. Only the victim's own FEAT — or trained help with antitoxin — can halt the poison.</div>
     ${antitoxinButton(actor)}`);

  console.log(`[FASERIP:POISON] ${actor.name} poisoned by ${toxin.name} (${toxin.intensity}), KO ${koRounds}r, re-FEAT in ${windowTurns}t`);
  return "poisoned";
}

// ── Per-tick processor ───────────────────────────────────────────────────────

/**
 * Process one tick of poison for an actor. Call from the same sites as
 * processDyingRound, BEFORE dying (poison losses take priority per RAW).
 *
 * pendingSeconds: CTT fires timeTracker.timeAdvanced BEFORE calling
 * game.time.advance(), so at hook time worldTime is still pre-advance.
 * The CTT call site passes its deltaSeconds here; the window check and
 * re-arm both use effectiveNow = worldTime + pendingSeconds. The other
 * call sites run post-advance and pass nothing.
 *
 * @param {Actor} actor
 * @param {object} opts { pendingSeconds }
 * @returns {string} "halted" | "stepped" | "dead" | "waiting" | "none"
 */
export async function processPoisonRound(actor, { pendingSeconds = 0 } = {}) {
  if (!actor) return "none";
  const scope = SCOPE();

  const poisonAE = actor.effects.find(e =>
    e.flags?.[scope]?.ongoingId === "poison" && !e.disabled
  );
  if (!poisonAE) return "none";

  if (actor.system?.details?.isDead || actor.system?.details?.isDeactivated) {
    try { await poisonAE.delete({ mshIntentional: true }); } catch (_e) {}
    try { await actor.unsetFlag(scope, "ongoing.poison"); } catch (_e) {}
    return "dead";
  }

  const lockKey = actor.id;
  if (_poisonLocks.has(lockKey)) return "none";
  _poisonLocks.add(lockKey);
  try {
    return await _processPoisonInner(actor, poisonAE, scope, pendingSeconds);
  } finally {
    _poisonLocks.delete(lockKey);
  }
}

async function _processPoisonInner(actor, poisonAE, scope, pendingSeconds = 0) {
  const effectiveNow = game.time.worldTime + Math.max(0, pendingSeconds);

  // ── Shift-0 from a prior tick: death ──────────────────────────────────────
  const curRank = actor.system?.abilities?.endurance?.rank;
  if (curRank === "Shift-0") {
    return _poisonDeath(actor, poisonAE, scope);
  }

  const nextFeatAt = poisonAE.getFlag(scope, "nextFeatAt") ?? 0;
  if (effectiveNow < nextFeatAt) {
    console.log(`[FASERIP:POISON] ${actor.name}: waiting — ${nextFeatAt - effectiveNow}s until next FEAT (effectiveNow ${effectiveNow}, pending ${pendingSeconds}s)`);
    return "waiting";
  }

  // ── Re-FEAT at (possibly lowered) rank ────────────────────────────────────
  const intensityRank = poisonAE.getFlag(scope, "intensityRank") || "Typical";
  const toxinName = poisonAE.getFlag(scope, "toxinName") || "Toxin";
  const feat = await rollPoisonFeat(actor, intensityRank);

  if (feat.success) {
    await haltPoison(actor, {
      reason: `<strong>${actor.name}</strong> fights off ${toxinName}!
        <div style="margin-top:4px;font-size:.9em;color:#555;">${featLine(feat, intensityRank)}</div>
        <div style="margin-top:4px;font-size:.9em;color:#555;">Lost Endurance heals per Impaired Endurance rules (1 rank/week, 1/day with medical care).</div>`,
    });
    return "halted";
  }

  // ── Failure: another rank, re-arm the window ──────────────────────────────
  // Governor read uses effectiveNow — during a pre-advance CTT hook, raw
  // worldTime still equals the last stamp and would false-positive the cap.
  if (endRankLossThisTurn(actor, effectiveNow)) {
    // Cap: 1 rank/turn regardless of cause. Defer this loss one turn.
    await poisonAE.setFlag(scope, "nextFeatAt", effectiveNow + turnSeconds());
    console.log(`[FASERIP:POISON] ${actor.name}: rank loss capped this turn — deferring`);
    await poisonChat(actor, "Poison Held at Bay",
      `<strong>${actor.name}</strong> fails the FEAT against ${toxinName}, but an Endurance rank was already lost this turn.
       <div style="margin-top:4px;font-size:.9em;color:#555;">${featLine(feat, intensityRank)}</div>
       <div style="margin-top:4px;font-size:.9em;color:#555;">Max 1 rank/round — new FEAT next turn.</div>`);
    return "waiting";
  }

  const loss = await loseOneEnduranceRank(actor, { source: `Poison: ${toxinName}` });
  if (loss.lost) await stampEndRankLoss(actor, "poison");

  if (loss.newRank === "Shift-0") {
    return _poisonDeath(actor, poisonAE, scope);
  }

  const windowTurns = await rollD10();
  await poisonAE.update({
    name: `Poisoned: ${toxinName} (${intensityRank}) — End ${loss.newRank}`,
    [`flags.${scope}.nextFeatAt`]: effectiveNow + windowTurns * turnSeconds(),
    [`flags.${scope}.windowTurns`]: windowTurns,
  });

  await poisonChat(actor, "Poison Spreads",
    `<strong>${actor.name}</strong> fails to fight off ${toxinName}.
     <div style="margin-top:4px;font-size:.9em;color:#555;">${featLine(feat, intensityRank)}</div>
     <div style="margin-top:4px;">Endurance: <strong>${loss.oldRank}</strong> &rarr; <strong>${loss.newRank}</strong>. Next FEAT in ${windowTurns} turns.</div>
     ${antitoxinButton(actor)}`);

  return "stepped";
}

async function _poisonDeath(actor, poisonAE, scope) {
  console.warn(`[FASERIP WARN] ${actor.name} has died of poison (Shift-0 Endurance)`);
  try { await actor.update({ "system.details.isDead": true }); } catch (_e) {}
  try { await poisonAE.delete({ mshIntentional: true }); } catch (_e) {}
  try { await actor.unsetFlag(scope, "ongoing.poison"); } catch (_e) {}

  const unconsciousEffects = actor.effects.filter(e =>
    e.statuses?.has?.("unconscious") || /unconscious/i.test(e.name)
  );
  if (unconsciousEffects.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", unconsciousEffects.map(e => e.id), { mshIntentional: true });
  }

  await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  await poisonChat(actor, "Death by Poison",
    `<strong style="color:#b71c1c;">💀 ${actor.name} has died — Endurance reached Shift-0 from toxins.</strong>`,
    { border: "#b71c1c", bg: "#ffebee" });

  try { await game.msh?.rest?.appendRecoveryLog?.(actor, { event: "poison-death", detail: null }); } catch (_e) {}
  return "dead";
}

// ── Halting ──────────────────────────────────────────────────────────────────

export async function haltPoison(actor, { reason = "" } = {}) {
  const scope = SCOPE();
  const poisonAE = actor.effects.find(e => e.flags?.[scope]?.ongoingId === "poison");
  if (poisonAE) { try { await poisonAE.delete({ mshIntentional: true }); } catch (_e) {} }
  try { await actor.unsetFlag(scope, "ongoing.poison"); } catch (_e) {}
  if (reason) {
    await poisonChat(actor, "Poison Halted", reason, { border: "#2e7d32", bg: "#e8f5e9" });
  }
  return true;
}

/**
 * Trained treatment: requires a healer with First Aid or Medicine talent AND
 * an antitoxin item on healer or patient. RAW: untrained help cannot halt
 * poison; only the victim's own FEAT can.
 *
 * @returns {object} { ok, reason }
 */
export async function administerAntitoxin(patient, healer) {
  const scope = SCOPE();
  if (!patient) return { ok: false, reason: "No patient." };
  const poisonAE = patient.effects.find(e => e.flags?.[scope]?.ongoingId === "poison" && !e.disabled);
  if (!poisonAE) return { ok: false, reason: `${patient.name} is not poisoned.` };
  if (!healer) return { ok: false, reason: "No treating character selected." };

  const trained = healer.items.some(i =>
    i.type === "talent" && /first\s*aid|medicine/i.test(i.name || "")
  );
  if (!trained) {
    return { ok: false, reason: `${healer.name} lacks First Aid or Medicine — untrained help cannot halt poison (RAW).` };
  }

  const antitoxinOf = (a) => a.items.find(i =>
    (i.type === "equipment" || i.type === "item") &&
    /anti[-\s]?toxin|anti[-\s]?venom|antidote/i.test(i.name || "")
  );
  const antitoxin = antitoxinOf(healer) || antitoxinOf(patient);
  if (!antitoxin) {
    return { ok: false, reason: `No antitoxin available — ${healer.name} needs an Antitoxin/Antivenom/Antidote item.` };
  }

  const toxinName = poisonAE.getFlag(scope, "toxinName") || "the toxin";
  await haltPoison(patient, {
    reason: `<strong>${healer.name}</strong> administers ${antitoxin.name} — ${toxinName} halted in <strong>${patient.name}</strong>.
      <div style="margin-top:4px;font-size:.9em;color:#555;">Lost Endurance heals per Impaired Endurance rules (1 rank/week, 1/day with medical care).</div>`,
  });
  return { ok: true, reason: "" };
}
