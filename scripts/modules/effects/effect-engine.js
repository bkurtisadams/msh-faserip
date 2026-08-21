// scripts/modules/effects/effect-engine.js v1.15.1 - 2026-08-20
// v1.15.1: Combat round durations stay round-based even when CTT is active;
//          CTT calendar advances must not shorten RAW combat effects. Rules-
//          critical callers may force round timing even under seconds-only.
// scripts/modules/effects/effect-engine.js v1.15.0 - 2026-08-02
// v1.15.0: applyIntensityEffect incapacitated/immobilized/nullified cases
//          wrote flags at TOP LEVEL (flags.effectType = "..."). v14's
//          DocumentFlagsField treats top-level keys as package scopes and
//          mangles primitive values to {} — and the scoped readers
//          (nullify.js, init.js, chat-hooks) could never see them anyway.
//          Nullified-via-intensity was invisible to the nullify machinery.
//          All three now nest under the msh-faserip scope like the applyX
//          wrappers always have.
// scripts/modules/effects/effect-engine.js v1.14.1 - 2026-06-25
// v1.14.1: applySlam — guard existing slam-marker delete with canWriteEffectsOn +
//          executeAsGM("deleteActiveEffects") fallback so non-owner players don't
//          throw "lacks permission to delete ActiveEffect" on auto-triggered slams.
// scripts/modules/effects/effect-engine.js v1.15.0 - 2026-08-01
// v1.15.0: Defensive "poisoned" case in applyIntensityEffect — delegates to
//          applyPoisonExposure with a console warning; callers should branch
//          to the poison engine before rolling the generic save.
// scripts/modules/effects/effect-engine.js v1.14.0 - 2026-06-12
// v1.15.0: v14 badge fix — applyEntangled/applyDying/applyNullified set
//          duration.expiry="roundEnd" when no finite rounds so indefinite
//          effects register as isTemporary and token badges render
//          (matches applyGrappled/applyHeld v14 pattern).
// v1.14.0: Add exported applyIntensityEffect(target, effect, {rounds,originUuid,desc})
//          — shared effect dispatcher used by both the Intensity action and the
//          on-hit intensity hook in attack-action.
// scripts/modules/effects/effect-engine.js v1.13.0 - 2026-04-19
// v1.13.0: computeDuration now converts rounds→seconds when CTT is active
//          with sync enabled, regardless of combat state. The previous
//          "rounds-in-combat, seconds out-of-combat" split assumed time
//          was advancing via Foundry's combatRound hook, but when time is
//          driven by CTT's worldTime (advanceTime), rounds-based
//          durations have no countdown source and the AE persists
//          indefinitely. Symptom: Slammed / Stunned / Grabbed / Blinded /
//          etc. stuck on tokens long after combat ended, because
//          intensity-action routes all of them through applyEffect →
//          computeDuration. Narrow fix guards on !cttActive so users
//          without CTT keep their rounds-based durations as before.
// v1.12.0: Fix nullify health bug — clamp current health to new max on nullification,
//          preserve damage taken and restore health correctly when nullification ends.
// v1.11.0: Add applyNullified / restoreNullifiedPowers — suppress inborn powers on nullification,
//          restore on effect removal. Stores suppressed power IDs in effect flags.
// v1.5.0: Fix applyEvade - add canAct:false, nest flags under SCOPE, create separate bonus effect
//         Fix applyBlock - add canAct:false, nest flags under SCOPE, remove incorrect movementMult
// v1.4.0: Fix applyEvade - properly track evadeSuccessful/autoHit flags, remove incorrect combat mod changes
// v1.3.0: Duplicate effect handling - stun keeps longer duration, slam keeps more severe
// v1.2.1: Reduce console logging verbosity
// v1.2.0: Improved debug logging for effect creation and duration tracking
// v1.1.0: Add proper Foundry changes arrays to effect wrappers
// Centralized Active Effect helpers for FASERIP on Foundry v13

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

// Permission check for ActiveEffect writes on an actor — handles linked tokens,
// unlinked ActorDeltas, and synthetic token actors. Returns true if current user
// can directly mutate effects on the actor (otherwise caller must route via GM socket).
export function canWriteEffectsOn(actor) {
  if (!actor) return false;
  if (game.user.isGM) return true;
  if (actor.token?.isLinked === false) return !!actor.token.isOwner;
  if (actor.parent?.documentName === "Token") return !!actor.parent.isOwner;
  if (actor.isToken === true) {
    const token = canvas.tokens?.placeables?.find(t => t.actor === actor);
    return !!(token?.document?.isOwner ?? actor.isOwner);
  }
  return !!actor.isOwner;
}

/**
 * Map string mode names to Foundry's numeric ActiveEffect mode constants.
 * Foundry expects CONST.ACTIVE_EFFECT_MODES values (integers); strings are
 * silently treated as ADD, which has caused override-based effects (Stunned,
 * Just Escaped, Restrained, etc.) to fail in subtle ways.
 */
const AE_MODE_MAP = {
  custom: 0,
  multiply: 1,
  add: 2,
  downgrade: 3,
  upgrade: 4,
  override: 5
};

/** Translate a change.mode string to its numeric constant; pass through if already numeric. */
function _normalizeChangeMode(change) {
  if (!change || typeof change !== "object") return change;
  if (typeof change.mode === "string") {
    const numeric = AE_MODE_MAP[change.mode.toLowerCase()];
    if (numeric === undefined) {
      console.warn(`[effect-engine] Unknown change mode "${change.mode}", falling back to ADD`);
      return { ...change, mode: 2 };
    }
    return { ...change, mode: numeric };
  }
  return change;
}

/** Safe handle to CTT time engine (if installed & active) */
function getCTT() {
  const cttSyncMode = game.settings.get("msh-faserip", "ctt.syncMode");
  if (cttSyncMode === "off") return null; // Setting is off, don't use CTT
  
  const mod = game.modules.get("calendar-time-tracker");
  return mod?.active ? (mod.api?.timeEngine ?? null) : null;
}

/** World setting helpers (with sane fallbacks) */
function getTurnSeconds() {
  const v = Number(game.settings?.get?.("msh-faserip", "turnSeconds"));
  return Number.isFinite(v) && v > 0 ? v : 6;
}
function durationPolicy() {
  return game.settings?.get?.("msh-faserip", "effects.durationPolicy") || "rounds-in-combat";
}

/** Convert N turns to seconds via CTT if possible, else fallback.
 * Returns a finite positive integer or 0 (never Infinity/NaN).
 */
export function toSeconds(turns = 1) {
  if (!Number.isFinite(turns) || turns <= 0) return 0;
  const te = getCTT();
  if (te && typeof te.convertToSeconds === "function") {
    try {
      const s = te.convertToSeconds(turns, "turn");
      if (Number.isFinite(s) && s > 0) return s;
    } catch (_) {}
  }
  const ts = getTurnSeconds();
  const result = Math.round(turns * ts);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

/** Decide the duration block for an AE from rounds/seconds and policy.
 * Writes v14 schema: { value, units, expiry }.
 * Falls back to v13 schema ({ seconds, startTime } or { rounds, startRound })
 * if game.release.generation is < 14.
 */
export function computeDuration({ rounds = null, seconds = null, forceCombatRounds = false } = {}) {
  const v14 = (game.release?.generation ?? 13) >= 14;

  // If explicit seconds provided, honor it (reject Infinity/NaN/<=0)
  if (Number.isFinite(seconds) && seconds > 0) {
    if (v14) {
      return { value: seconds, units: "seconds" };
    }
    return { seconds, startTime: game.time?.worldTime ?? undefined };
  }

  // If rounds provided (reject Infinity/NaN/<=0):
  if (Number.isFinite(rounds) && rounds > 0) {
    const policy = durationPolicy();
    const inCombat = !!game.combat?.active;

    // FASERIP's rules unit is the round/turn, not Foundry's combatant turn.
    // Keep round-limited combat effects attached to Foundry rounds even when
    // CTT is active. CTT is allowed to mirror calendar time, but its worldTime
    // advances must not consume Stun/KO/other round durations multiple times
    // inside one FASERIP round. The explicit seconds-only policy remains an
    // opt-in escape hatch for worlds that truly want wall-clock durations.
    // Callers with rules-critical round timers (e.g. 0-Health knockout) pass
    // forceCombatRounds so even that policy cannot alter RAW combat timing.
    if (inCombat && (forceCombatRounds || policy !== "seconds-only")) {
      if (v14) {
        return { value: rounds, units: "rounds", expiry: "roundEnd" };
      }
      return {
        rounds,
        startRound: game.combat?.round ?? 0,
      };
    }

    // Outside combat (or explicit seconds-only policy): convert to real time.
    const s = toSeconds(rounds);
    if (s <= 0) return {}; // toSeconds couldn't produce a valid count
    if (v14) {
      return { value: s, units: "seconds" };
    }
    return {
      seconds: s,
      startTime: game.time?.worldTime ?? undefined
    };
  }

  // No duration → timeless note effect
  return {};
}

/** Human-friendly label update: "Stunned (3 rounds)" / "Stunned (10s)" */
export async function renameEffectWithRemaining(effect) {
  try {
    if (!effect?.parent) return;

    // Skip effects whose trailing "(...)" is semantic (kind/variant),
    // not a remaining-time label. Slam markers bake the slam kind into
    // the name — rewriting "Slam (Grand Slam)" to "Slam (1 round)"
    // would destroy that info. Any future marker-style effect can opt
    // out by setting flags.msh-faserip.preserveName = true.
    const SCOPE = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    const flags = effect.flags?.[SCOPE] || {};
    if (flags.effectType === "slamMarker" || flags.preserveName === true) return;

    // Derive remaining
    const { text } = getRemaining(effect);
    if (!text) return;

    // Base name without trailing "(...)"
    const base = String(effect.name || "").replace(/\s*\([^)]*\)\s*$/u, "").trim();
    const next = `${base} (${text})`;
    if (next === effect.name) return;

    await effect.update({ name: next });
  } catch (e) {
    // Synthetic-actor delta quirk: inherited effects can throw "does not
    // exist" on update before they're materialized in the token's delta.
    // The label rename is cosmetic — silence that specific case.
    if (/does not exist/i.test(e?.message ?? "")) return;
    console.warn("[FASERIP] renameEffectWithRemaining failed:", e);
  }
}

/** Return remaining time as { rounds, seconds, text } */
export function getRemaining(effect) {
  const d = effect?.duration || {};

  // v14: Foundry computes remaining for us. Use it directly.
  // d.units is "rounds"/"seconds"/"turns"; d.remaining is the live remaining count.
  if (Number.isFinite(d.remaining) && d.units) {
    const u = String(d.units).toLowerCase();
    if (u === "rounds" || u === "turns") {
      // Label matches Foundry's "round" UI vocabulary rather than FASERIP's
      // "turn" rules vocabulary — the effect panel sits next to the combat
      // tracker which counts in rounds, and a mixed-vocabulary UI reads as
      // inconsistent. FASERIP "turn" language lives in rules text and chat
      // cards, not in Foundry chrome.
      const unitLabel = d.remaining === 1 ? "round" : "rounds";
      return { rounds: d.remaining, seconds: null, text: `${d.remaining} ${unitLabel}` };
    }
    if (u === "seconds") {
      return { rounds: null, seconds: d.remaining, text: `${d.remaining}s` };
    }
  }

  // v13 fallback: rounds-based
  if (Number.isFinite(d.rounds) && (Number.isFinite(d.startRound) || Number.isFinite(d.startTurn))) {
    const curR = game.combat?.round ?? 0;
    const startR = d.startRound ?? curR;
    const elapsed = Math.max(0, curR - startR);
    const remain = Math.max(0, Math.ceil(d.rounds - elapsed));
    const unit = remain === 1 ? "round" : "rounds";
    return { rounds: remain, seconds: null, text: `${remain} ${unit}` };
  }
  // v13 fallback: seconds-based. v14 also populates d.seconds via backward compat,
  // and start time moved to effect.start.time (with d._worldTime as another alias).
  if (Number.isFinite(d.seconds)) {
    const startTime = effect?.start?.time ?? d.startTime ?? d._worldTime;
    if (Number.isFinite(startTime)) {
      const now = game.time?.worldTime ?? 0;
      const end = startTime + d.seconds;
      const remain = Math.max(0, Math.floor(end - now));
      return { rounds: null, seconds: remain, text: `${remain}s` };
    }
  }
  return { rounds: null, seconds: null, text: "" };
}

/**
 * Decide whether an Active Effect should be auto-expired.
 * Schema-aware single source of truth for expiration decisions:
 *   - v14 (duration.remaining / duration.expired) is authoritative when present
 *   - legacy v13 rounds/seconds paths run only when v14 fields are absent AND
 *     their required start markers are present (startRound / startTime)
 *
 * Legacy paths explicitly reject missing start markers rather than defaulting
 * to 0. Defaulting would incorrectly expire v14-shape effects where Foundry's
 * backward-compat layer populates d.rounds/d.seconds but NOT d.startRound/
 * d.startTime — producing `startT + d.seconds - worldTime` with a worldTime
 * in the billions and trivially-negative result.
 *
 * @param {ActiveEffect} effect
 * @param {object} ctx
 * @param {number} [ctx.worldTime] - current worldTime for legacy seconds checks
 * @param {number|null} [ctx.curRound] - current combat round, or null if out-of-combat
 * @param {string} ctx.scope - system flag scope
 * @returns {{ expired: boolean, reason: string | null }}
 */
export function classifyEffectExpiration(effect, { worldTime, curRound = null, scope } = {}) {
  if (!effect || effect.disabled) return { expired: false, reason: null };

  const d = effect.duration ?? {};
  const efFlags = effect.flags?.[scope] || {};

  // Ongoing-engine effects manage their own lifecycle — skip
  if (efFlags.ongoingId || efFlags.isDying || efFlags.dyingTimer) {
    return { expired: false, reason: null };
  }

  // Explicit expiresAtRound flag (e.g. Evasion Bonus) takes precedence over duration
  if (Number.isFinite(efFlags.expiresAtRound) && Number.isFinite(curRound)) {
    if (curRound >= efFlags.expiresAtRound) {
      return { expired: true, reason: `expired at round ${efFlags.expiresAtRound} (current: ${curRound})` };
    }
    return { expired: false, reason: null };
  }

  // v14 canonical: core-computed remaining is authoritative. Do NOT fall through
  // to legacy paths when this is present — legacy paths assume v13 start markers
  // that v14 effects don't have and would misfire.
  if (Number.isFinite(d.remaining)) {
    if (d.expired === true || (d.remaining <= 0 && Number.isFinite(d.value) && d.value > 0)) {
      return { expired: true, reason: `expired per core (value ${d.value} ${d.units}, remaining ${d.remaining})` };
    }
    return { expired: false, reason: null };
  }

  // Legacy v13 rounds — requires startRound (no default-to-zero)
  if (Number.isFinite(curRound) && Number.isFinite(d.rounds) && d.rounds > 0 && Number.isFinite(d.startRound)) {
    const elapsed = Math.max(0, curRound - d.startRound);
    const remaining = Math.ceil(d.rounds - elapsed);
    if (remaining <= 0) {
      return { expired: true, reason: `0 rounds remaining (${d.rounds} rounds, started round ${d.startRound})` };
    }
    return { expired: false, reason: null };
  }

  // Legacy v13 seconds — requires startTime (no default-to-zero)
  if (Number.isFinite(worldTime) && Number.isFinite(d.seconds) && d.seconds > 0 && Number.isFinite(d.startTime)) {
    if (d.startTime + d.seconds <= worldTime) {
      return { expired: true, reason: `time expired (${d.seconds}s duration)` };
    }
  }

  return { expired: false, reason: null };
}

/** Remove first effect that matches predicate (flag path or function) */
export async function removeEffectBy(predicate, actor) {
  if (!actor) return;
  const pred = (typeof predicate === "function")
    ? predicate
    : (eff) => getFlagPath(eff, predicate) === true;

  const eff = actor.effects.find(e => pred(e));
  if (!eff) return;
  try {
    await eff.delete();
  } catch (e) {
    // Synthetic-actor delta quirk: inherited effect not yet materialized.
    if (/does not exist/i.test(e?.message ?? "")) return;
    console.warn("[FASERIP] removeEffectBy delete failed:", e);
  }
}

/** Read nested flag path "status.isStunned" */
function getFlagPath(effect, path) {
  const scope = SCOPE();
  const flags = effect?.flags?.[scope] || {};
  if (!path) return flags;
  return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), flags);
}

/** Core creator (v13-safe, no deprecated 'icon', handles unlinked tokens) */
export async function applyEffect(target, effectData = {}, opts = {}) {
  // Normalize actor (works for linked/unlinked tokens or raw Actor)
  const actor = target?.actor ?? target;
  if (!actor) {
    console.error("[FASERIP ERROR] applyEffect: no valid actor/target", { target, effectData, opts });
    return null;
  }

  // Prefer img; fall back to icon; never set both (prevents deprecation warnings)
  const img = effectData?.img ?? effectData?.icon ?? "icons/svg/aura.svg";

  // Pull out duration hints; compute a proper duration block if needed
  const {
    rounds = null,
    seconds = null,
    duration: providedDuration = null,
    icon,          // deprecated; drop it
    originUuid,    // allow both originUuid and origin
    origin,
    changes,       // explicitly extract changes array
    statuses,      // explicitly extract statuses
    name,          // explicitly extract name
    flags,         // explicitly extract flags
    ...rest
  } = effectData;

  const duration = providedDuration || computeDuration({ rounds, seconds });
  
  // Build payload with explicit properties to ensure nothing is lost
  const payload = {
    name: name || "Effect",
    img,
    duration,
    origin: origin ?? originUuid ?? actor.uuid,
    changes: (changes || []).map(_normalizeChangeMode),
    statuses: statuses || [],
    flags: {
      ...(flags || {}),
      [SCOPE()]: {
        ...(flags?.[SCOPE()] || {})
      }
    },
    ...rest  // Any other properties
  };

  // Permission check: can the current user create effects on this actor?
  // For unlinked tokens (ActorDelta), we must check the parent token's ownership
  let canCreate = game.user.isGM;
  
  if (!canCreate) {
    // Try multiple ways to detect and handle unlinked tokens/ActorDeltas
    
    // Method 1: Check if actor has .token property with isLinked = false
    if (actor.token?.isLinked === false) {
      const tokenDoc = actor.token;
      canCreate = tokenDoc.isOwner;
    }
    // Method 2: Check if actor has a parent TokenDocument (ActorDelta pattern)
    else if (actor.parent && actor.parent.documentName === "Token") {
      canCreate = actor.parent.isOwner;
    }
    // Method 3: Check if this is a synthetic actor (has isToken property)
    else if (actor.isToken === true) {
      // Try to find the token this synthetic actor belongs to
      const token = canvas.tokens?.placeables?.find(t => t.actor === actor);
      if (token?.document) {
        canCreate = token.document.isOwner;
      } else {
        // Can't find token, check actor ownership as fallback
        canCreate = actor.isOwner;
      }
    }
    // Method 4: Regular linked actor or base actor
    else {
      canCreate = actor.isOwner;
    }
  }
  
  // If user lacks permission, use GM socket to create the effect
  if (!canCreate) {
    try {
      // Import the GM utils module
      const { executeAsGM } = await import("../../gm-utils.js");
      
      // Have the GM create the effect via socket
      const created = await executeAsGM("createActorEffect", {
        targetActorUuid: actor.uuid,
        effectData: payload
      });
      
      // Rename with remaining time — must also go through GM socket
      // since the player can't update effects on unowned actors
      if (created?.[0]?.id) {
        try {
          await executeAsGM("renameEffectWithRemaining", {
            targetActorUuid: actor.uuid,
            effectId: created[0].id
          });
        } catch (renameErr) {
          console.warn("[FASERIP] GM rename-effect-with-remaining failed (non-fatal):", renameErr);
        }
      }
      
      return Array.isArray(created) ? created[0] : created;
    } catch (err) {
      console.error("[effect-engine] Failed to create effect via GM socket:", err, {
        actorName: actor.name,
        effectName: payload.name,
        user: game.user.name
      });
      // In auto-apply mode, fail silently
      if (!opts.autoApply) {
        ui.notifications?.error?.(`Failed to apply "${payload.name}" - GM socket error`);
      }
      return null;
    }
  }

  // User has permission - create directly
  try {
    const createdArr = await actor.createEmbeddedDocuments("ActiveEffect", [payload]);
    const created = Array.isArray(createdArr) ? createdArr[0] : createdArr;
    if (created?.id) {
      await renameEffectWithRemaining(created);
    }
    return created;
  } catch (err) {
    console.error("[FASERIP ERROR] applyEffect failed:", err, { 
      payload,
      actorName: actor.name
    });
    if (!opts.autoApply) {
      ui.notifications?.error?.("Failed to apply effect (see console).");
    }
    return null;
  }
}

/* ===== Specific wrappers for common combat effects ===== */

export async function applyStun(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  // Check for existing stun effect
  const existingStun = actor.effects.find(e => 
    e.statuses?.has("stunned") || 
    e.flags?.[SCOPE()]?.effectType === "stunned" ||
    e.name?.toLowerCase().includes("stunned")
  );
  
  if (existingStun) {
    // Get remaining duration of existing stun. Try v14 live remaining first,
    // then v14 canonical value (when units==="rounds"), then v13 legacy.
    const existingDur = existingStun.duration || {};
    const existingRounds = existingDur.remaining
      ?? (existingDur.units === "rounds" ? existingDur.value : null)
      ?? existingDur.rounds
      ?? 0;
    
    if (rounds <= existingRounds) {
      // New stun is shorter or equal - keep existing
      console.log(`[FASERIP] Stun: Keeping existing (${existingRounds} rounds) over new (${rounds} rounds)`);
      return existingStun;
    } else {
      // New stun is longer - remove existing and apply new
      console.log(`[FASERIP] Stun: Replacing existing (${existingRounds} rounds) with new (${rounds} rounds)`);
      if (canWriteEffectsOn(actor)) {
        await existingStun.delete();
      } else {
        try {
          const { executeAsGM } = await import("../../gm-utils.js");
          await executeAsGM("deleteActiveEffects", {
            targetActorUuid: actor.uuid,
            effectIds: [existingStun.id]
          });
        } catch (err) {
          console.error("[FASERIP] Stun replace: GM delete failed", err);
          return existingStun;
        }
      }
    }
  }
  
  return applyEffect(actor, {
    name: "Stunned",
    img: "icons/svg/daze.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.attackShift", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "stunned",
        status: { isStunned: true },
        meta: { unitLabel: "turn", unitLabelPlural: "turns" }
      }
    },
    statuses: ["stunned"]
  }, opts);
}

export async function applyEvade(actor, { 
  target = "", 
  evadeSuccessful = true,
  autoHit = false,
  nextRoundAttackBonusCS = 0, 
  note = "" 
} = {}) {
  // Evasion per FASERIP rules:
  // - evadeSuccessful=true means the attacker's blow is dodged (green/yellow/red result)
  // - autoHit=true means the evader fumbled (white result) and attacker gets at least green
  // - nextRoundAttackBonusCS is the bonus for next attack vs that target (yellow=1, red=2)
  
  let effectName;
  if (autoHit) {
    effectName = target ? `Evasion Failed vs ${target} (Auto-Hit)` : "Evasion Failed (Auto-Hit)";
  } else {
    effectName = target ? `Evading ${target}` : "Evading";
  }
  
  const currentRound = game.combat?.round || 0;
  
  // Create the evading status effect (prevents attacks, tracks evasion result)
  const evadeEffect = await applyEffect(actor, {
    name: effectName,
    img: autoHit ? "icons/svg/hazard.svg" : "icons/svg/combat.svg",
    rounds: 1,
    // Evading prevents attacks this round
    changes: [
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "evading",
        isEvading: true,
        evadeSuccessful,
        autoHit,
        evadedTarget: target,
        evadedTargetLower: target.toLowerCase(),
        createdRound: currentRound,
        notes: note || (autoHit 
          ? "Opponent auto-hits (at least Green result); you cannot attack this round"
          : "Evading: opponent's blow misses; you cannot attack this round")
      }
    },
    statuses: ["evading"]
  });

  // Create separate evasion bonus effect for next-round attack bonus (yellow/red only)
  // Must be a separate effect with isEvasionBonus so getEvasionAttackBonus() can find it
  if (nextRoundAttackBonusCS > 0) {
    const bonusName = target 
      ? `Evasion Bonus vs ${target} (+${nextRoundAttackBonusCS}CS)` 
      : `Evasion Bonus (+${nextRoundAttackBonusCS}CS)`;
    
    await applyEffect(actor, {
      name: bonusName,
      img: "icons/svg/upgrade.svg",
      rounds: 2,
      changes: [],
      flags: {
        [SCOPE()]: {
          effectType: "evasionBonus",
          isEvasionBonus: true,
          evadedTarget: target,
          evadedTargetLower: target.toLowerCase(),
          nextRoundAttackBonusCS,
          nextRoundBonusUsed: false,
          createdRound: currentRound,
          expiresAtRound: currentRound + 2,
          notes: `+${nextRoundAttackBonusCS}CS to first attack vs ${target || "that attacker"} next round (cannot be saved)`
        }
      }
    });
    
    console.log("[FASERIP] Created Evasion Bonus effect:", {
      actor: actor.name, bonus: nextRoundAttackBonusCS,
      createdRound: currentRound, usableInRound: currentRound + 1
    });
  }

  return evadeEffect;
}

export async function applyBlock(actor, { armorRank = "Good", armorValue = 10, note = "" } = {}) {
  return applyEffect(actor, {
    name: `Blocking (${armorRank} Armor)`,
    img: "icons/svg/shield.svg",
    rounds: 1,
    changes: [
      // Block: "may take no other action"
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "blocking",
        isBlocking: true,
        armorRank,
        armorValue,
        notes: note || "Strength as Body Armor vs physical (not Shooting/Energy/Charging). No attacks this round."
      }
    },
    statuses: ["blocking"]
  });
}

export async function applyCatch(actor, { scenario = "generic", vsYou = "", note = "" } = {}) {
  const scenarioMap = {
    "falling": "Caught Falling Object",
    "shooting-bullet": "Caught Bullet",
    "energy-beam": "Caught Energy",
    "generic": "Caught Object"
  };
  return applyEffect(actor, {
    name: scenarioMap[scenario] || "Caught Object",
    img: "icons/svg/net.svg",
    rounds: 1,
    changes: [],
    flags: {
      [SCOPE()]: {
        status: { isCatching: true },
        scenario,
        vsYou,
        notes: note
      }
    }
  });
}

/** Apply Slam result per MSH Advanced rules (p.27-28).
 *
 * Slam is fundamentally a positioning result — the target is either
 * knocked down or knocked away (or both). The rules describe four
 * outcomes; none assign numerical debuffs.
 *
 *   • No Slam   — no effect beyond normal hit damage.
 *   • Stagger   — "knocked back a step or two, perhaps to one knee,
 *                 but is fully capable of engaging in combat next
 *                 round." No longer adjacent to attacker. No prone,
 *                 no debuffs.
 *   • 1 Area    — knocked one area away. Attacker chooses direction
 *                 if any damage was dealt, defender otherwise. Lands
 *                 prone (flung through the air, not landed upright).
 *   • Grand Slam — knocked away at attacker's Strength rank as
 *                  ground speed (e.g. Unearthly = 10 areas). Lands
 *                  prone for the same physical reason.
 *
 * Prone status persists on the actor until manually cleared (via
 * token HUD, a stand-up action, or GM call) — FASERIP has no
 * automatic "stand up at round end" rule. The brief AE marker
 * itself expires at round end; the prone status does not depend on
 * the marker and survives it.
 *
 * Slammed into a building: charging attack damage on the building
 * (handled elsewhere — not this function's concern).
 */
export async function applySlam(actor, { kind = "No Slam", knockbackAreas = 0 } = {}, opts = {}) {
  if (kind === "No Slam") return null;

  // If an earlier slam marker from the same round is still on the
  // actor, replace it rather than stacking. (A character can only be
  // freshly slammed once per discrete event; successive slams within
  // a round in-fiction would be rare but the UI shouldn't duplicate
  // markers either way.)
  const existingMarker = actor.effects.find(e =>
    e.flags?.[SCOPE()]?.effectType === "slamMarker"
  );
  if (existingMarker) {
    if (canWriteEffectsOn(actor)) {
      await existingMarker.delete();
    } else {
      try {
        const { executeAsGM } = await import("../../gm-utils.js");
        await executeAsGM("deleteActiveEffects", {
          targetActorUuid: actor.uuid,
          effectIds: [existingMarker.id]
        });
      } catch (err) {
        console.error("[FASERIP] Slam replace: GM delete failed", err);
      }
    }
  }

  const knocksDown = (kind === "Grand Slam" || kind === "1 Area");

  return applyEffect(actor, {
    name: `Slam (${kind})`,
    img: "icons/svg/target.svg",
    rounds: 1,        // cosmetic marker; expires end of round
    changes: [],      // rules-faithful: no numerical debuffs
    flags: {
      [SCOPE()]: {
        effectType: "slamMarker",
        kind,
        knockbackAreas
      }
    },
    statuses: knocksDown ? ["prone"] : []
  }, opts);
}

/** Apply prone effect */
export async function applyProne(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Prone",
    img: "icons/svg/falling.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.attackShift", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "1", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "multiply", value: "0.5", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "prone",
        status: { isProne: true }
      }
    },
    statuses: ["prone"]
  }, opts);
}

/** Apply grappled effect (partial hold) */
export async function applyGrappled(actor, { holderUuid = null, holderName = "", rounds = null } = {}, opts = {}) {
  // Partial Hold: -2CS on all actions, cannot move if attacker Str >= target
  // Per rules: "The target may perform any normal actions, but at a -2 CS penalty"
  // This is a general action penalty, NOT individual ability reductions
  //
  // v14: when no finite rounds specified, set duration.expiry="roundEnd" so the
  // effect registers as isTemporary (token badge renders, sheet lists under
  // Temporary). Foundry's default value=Infinity means the effect never
  // actually expires at round end — it persists until escape/release.
  const hasRounds = Number.isFinite(rounds) && rounds > 0;
  const durationOverride = hasRounds ? undefined : { expiry: "roundEnd" };
  return applyEffect(actor, {
    name: holderName ? `Grappled by ${holderName}` : "Grappled",
    img: "icons/svg/net.svg",
    rounds,
    duration: durationOverride,
    changes: [
      { key: "system.combatMods.selfPenaltyCS", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "grappled",
        status: { isGrappled: true },
        holderUuid,
        holderName
      }
    },
    statuses: ["grappled"]
  }, opts);
}

/** Apply held effect (full hold - stronger than grappled) */
export async function applyHeld(actor, { holderUuid = null, holderName = "", rounds = null } = {}, opts = {}) {
  // Full Hold: target fully restrained, cannot act (only escape attempts)
  // Per rules: "restrained, attacker +1 action, Str dmg"
  // Target cannot take any actions — canAct=false handles this
  //
  // v14 expiry-for-isTemporary: see applyGrappled note above.
  const hasRounds = Number.isFinite(rounds) && rounds > 0;
  const durationOverride = hasRounds ? undefined : { expiry: "roundEnd" };
  return applyEffect(actor, {
    name: holderName ? `Held by ${holderName}` : "Held",
    img: "icons/svg/padlock.svg",
    rounds,
    duration: durationOverride,
    changes: [
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 },
      { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "held",
        status: { isHeld: true },
        holderUuid,
        holderName,
        allowEscape: true  // target can still attempt escape action
      }
    },
    statuses: ["held"]
  }, opts);
}

/** Apply post-escape effect (Yellow Escape: half move, no other actions this round) */
export async function applyEscaped(actor, opts = {}) {
  return applyEffect(actor, {
    name: "Just Escaped (half move, no actions)",
    img: "icons/svg/wing.svg",
    rounds: 1,
    changes: [
      { key: "system.combatMods.movementMult", mode: "override", value: "0.5", priority: 20 },
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "escaped",
        status: { isEscaped: true }
      }
    },
    statuses: ["escaped"]
  }, opts);
}

/** Apply post-reverse effect (Red Escape: half move, can act at -2CS or grapple back) */
export async function applyReversed(actor, opts = {}) {
  return applyEffect(actor, {
    name: "Reversed Hold (half move, -2CS actions)",
    img: "icons/svg/upgrade.svg",
    rounds: 1,
    changes: [
      { key: "system.combatMods.movementMult", mode: "override", value: "0.5", priority: 20 },
      { key: "system.combatMods.selfPenaltyCS", mode: "add", value: "-2", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "reversed",
        status: { isReversed: true }
      }
    },
    statuses: ["reversed"]
  }, opts);
}

/** Apply entangled effect */
export async function applyEntangled(actor, { materialRank = "Good", rounds = null } = {}, opts = {}) {
  // v14 expiry-for-isTemporary: see applyGrappled note above.
  const hasRounds = Number.isFinite(rounds) && rounds > 0;
  const durationOverride = hasRounds ? undefined : { expiry: "roundEnd" };
  return applyEffect(actor, {
    name: `Entangled (${materialRank})`,
    img: "icons/svg/net.svg",
    rounds,
    duration: durationOverride,
    changes: [
      { key: "system.combatMods.attackShift", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "entangled",
        status: { isEntangled: true },
        materialRank
      }
    },
    statuses: ["entangled"]
  }, opts);
}

/** Apply blinded effect */
export async function applyBlinded(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Blinded",
    img: "icons/svg/blind.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.attackShift", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.abilityShifts.intuition", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "multiply", value: "0.25", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "blinded",
        status: { isBlinded: true }
      }
    },
    statuses: ["blinded"]
  }, opts);
}

/** Apply unconscious effect */
export async function applyUnconscious(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Unconscious",
    img: "icons/svg/sleep.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.defenseShift", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "unconscious",
        status: { isUnconscious: true }
      }
    },
    statuses: ["unconscious"]
  }, opts);
}

/** Create/refresh Dying state (no timer; update handled by updateCombat) */
export async function applyDying(actor, { enduranceValue = null } = {}) {
  // v14 expiry-for-isTemporary: see applyGrappled note above.
  return applyEffect(actor, {
    name: "Dying",
    img: "icons/svg/skull.svg",
    duration: { expiry: "roundEnd" },
    changes: [
      { key: "system.combatMods.defenseShift", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-4", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "dying",
        status: { isDying: true },
        enduranceBase: Number.isFinite(enduranceValue) ? enduranceValue : (actor.system?.abilities?.endurance?.value ?? 10),
        stabilizedRounds: 0
      }
    },
    statuses: ["dying"]
  });
}

/** Apply charging effect (for the attacker during a charge) */
export async function applyCharging(actor, { rounds = 1 } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Charging",
    img: "icons/svg/wing.svg",
    rounds,
    changes: [
      { key: "system.combatMods.defenseShift", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.movementMult", mode: "multiply", value: "2", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "charging",
        status: { isCharging: true }
      }
    },
    statuses: ["charging"]
  }, opts);
}

/** Apply deafened effect — impaired hearing, -2CS Intuition, -2CS to detect ambush */
export async function applyDeafened(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Deafened",
    img: "icons/svg/deaf.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.abilityShifts.intuition", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-1", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "deafened",
        status: { isDeafened: true }
      }
    },
    statuses: ["deafened"]
  }, opts);
}

/** Apply paralyzed effect — cannot move or act, -4CS defense (worse than immobilized) */
export async function applyParalyzed(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Paralyzed",
    img: "icons/svg/paralysis.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.canAct", mode: "override", value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 },
      { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-4", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "paralyzed",
        status: { isParalyzed: true }
      }
    },
    statuses: ["paralysis"]
  }, opts);
}

/** Apply weakened effect — general debility, -2CS on all actions */
export async function applyWeakened(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Weakened",
    img: "icons/svg/downgrade.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.attackShift", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-1", priority: 20 },
      { key: "system.combatMods.abilityShifts.strength", mode: "add", value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.endurance", mode: "add", value: "-2", priority: 20 }
    ],
    flags: {
      [SCOPE()]: {
        effectType: "weakened",
        status: { isWeakened: true }
      }
    },
    statuses: ["weakened"]
  }, opts);
}

/** Optionally advance CTT by N turns if sync is enabled */
export function advanceCTTByTurns(n = 1) {
  const te = getCTT();
  if (!te || typeof te.advanceTime !== "function") {
    console.warn("[FASERIP] CTT sync enabled but timeEngine.advanceTime is unavailable");
    return false;
  }
  try { te.advanceTime(n, "turn"); return true; } catch (e) {
    console.warn("[FASERIP] CTT advanceTime failed:", e);
    return false;
  }
}


/* ===== Regeneration Power Support ===== */
/* Now delegates to the generic ongoing effects engine (ongoing-engine.js). */
/* These wrappers maintain backward compatibility for existing callers. */

/**
 * Collect every unique actor in the world, including unlinked scene tokens.
 * @returns {Actor[]}
 */
export function getAllTokenActors() {
  const seen = new Set();
  const actors = [];

  for (const a of game.actors) {
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    actors.push(a);
  }

  for (const scene of game.scenes) {
    for (const tokenDoc of scene.tokens) {
      const a = tokenDoc.actor;
      if (!a) continue;
      const key = tokenDoc.actorLink ? a.id : `token-${tokenDoc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actors.push(a);
    }
  }
  return actors;
}

/**
 * Apply a persistent Regeneration Active Effect (backward-compatible wrapper).
 * Now delegates to the ongoing engine's registerOngoingEffect.
 */
export async function applyRegeneration(target, {
  healAmount = null,
  cycleTurns = 10,
  powerRank = null,
  powerItemId = null,
} = {}, extraOpts = {}) {
  try {
    const { applyRegenerationOngoing } = await import("./ongoing-engine.js");
    return applyRegenerationOngoing(target, { healAmount, cycleTurns, powerRank, powerItemId });
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to delegate to ongoing engine:", e);
    return null;
  }
}
/**
 * Apply Nullified effect — suppresses all inborn (source === "natural") powers.
 * Stores suppressed power IDs in effect flags for restoration on removal.
 * @param {Actor} actor - target actor
 * @param {object} opts
 * @param {number} [opts.rounds=10] - duration (1-10 rounds, or while in range)
 * @param {string} [opts.originUuid=null] - UUID of the nullifier
 * @param {boolean} [opts.selfNullify=false] - if true, this is self-suppression (nullifier's own powers)
 */
export async function applyNullified(actor, { rounds = 10, originUuid = null, selfNullify = false, auraCasterId = null } = {}, opts = {}) {
  const resolvedActor = actor?.actor ?? actor;
  if (!resolvedActor) return null;

  // v14 expiry-for-isTemporary: see applyGrappled note above.
  const hasRounds = Number.isFinite(rounds) && rounds > 0;
  const durationOverride = hasRounds ? undefined : { expiry: "roundEnd" };

  // Find all inborn powers to suppress
  const powersToSuppress = resolvedActor.items.filter(i => {
    if (i.type !== "power") return false;
    if (i.system?.isActive === false) return false; // already off
    const src = (i.system?.source || "").toLowerCase();
    if (src !== "natural") return false;
    // Don't suppress the Nullifying Power itself on the caster
    if (selfNullify) {
      const n = (i.name || "").toLowerCase();
      if (n.includes("nullif")) return false;
    }
    return true;
  });

  const suppressedIds = powersToSuppress.map(p => p.id);

  // Disable the powers
  if (suppressedIds.length > 0) {
    const updates = suppressedIds.map(id => ({ _id: id, "system.isActive": false }));
    if (canWriteEffectsOn(resolvedActor)) {
      await resolvedActor.updateEmbeddedDocuments("Item", updates);
    } else {
      const { executeAsGM } = await import("../../gm-utils.js");
      await executeAsGM("updateEmbeddedDocsOnActor", {
        targetActorUuid: resolvedActor.uuid,
        collection: "Item",
        updates
      });
    }
    console.log(`[FASERIP] Nullified: disabled ${suppressedIds.length} inborn powers on ${resolvedActor.name}:`,
      powersToSuppress.map(p => p.name).join(", "));
  }

  // Drop any superhuman ability (value > 20) to Typical 6
  const abilitySwaps = {};
  const actorUpdates = {};
  const abilities = resolvedActor.system?.abilities || {};

  for (const [ability, data] of Object.entries(abilities)) {
    if (!data || data.value <= 20) continue;
    abilitySwaps[ability] = {
      originalRank: data.rank,
      originalValue: data.value
    };
    actorUpdates[`system.abilities.${ability}.rank`] = "Typical";
    actorUpdates[`system.abilities.${ability}.value`] = 6;
    console.log(`[FASERIP] Nullified: ${resolvedActor.name} ${ability} ${data.rank} (${data.value}) → Typical (6)`);
  }

  // Snapshot pre-nullify health so we can restore correctly later
  const preNullifyHealth = resolvedActor.system?.attributes?.health?.value ?? 0;
  const preNullifyHealthMax = resolvedActor.system?.attributes?.health?.max ?? 0;
  const preNullifyDamage = Math.max(0, preNullifyHealthMax - preNullifyHealth);

  if (Object.keys(actorUpdates).length > 0) {
    const ownsTarget = canWriteEffectsOn(resolvedActor);
    const gmExec = ownsTarget ? null : (await import("../../gm-utils.js")).executeAsGM;
    if (ownsTarget) {
      await resolvedActor.update(actorUpdates);
    } else {
      await gmExec("updateActor", { targetActorUuid: resolvedActor.uuid, updateData: actorUpdates });
    }

    // Recalc new health max from (possibly reduced) abilities
    const abs = resolvedActor.system?.abilities || {};
    const newHealthMax =
      parseInt(abs.fighting?.value || 0) +
      parseInt(abs.agility?.value || 0) +
      parseInt(abs.strength?.value || 0) +
      parseInt(abs.endurance?.value || 0);

    // Scale health proportionally to new max
    const healthPct = preNullifyHealthMax > 0 ? (preNullifyHealth / preNullifyHealthMax) : 1;
    const newHealth = Math.max(0, Math.round(newHealthMax * healthPct));
    if (ownsTarget) {
      await resolvedActor.update({ "system.attributes.health.value": newHealth });
    } else {
      await gmExec("updateActor", {
        targetActorUuid: resolvedActor.uuid,
        updateData: { "system.attributes.health.value": newHealth }
      });
    }
    console.log(`[FASERIP] Nullified: ${resolvedActor.name} health ${preNullifyHealth}/${preNullifyHealthMax} → ${newHealth}/${newHealthMax} (${preNullifyDamage} pre-existing damage stored)`);
  }

  const label = selfNullify ? "Nullifying (Self-Suppressed)" : "Nullified";

  return applyEffect(resolvedActor, {
    name: label,
    img: "icons/svg/cancel.svg",
    rounds,
    originUuid,
    changes: [],
    flags: {
      [SCOPE()]: {
        effectType: "nullified",
        selfNullify,
        auraCasterId,
        suppressedPowerIds: suppressedIds,
        abilitySwaps,
        preNullifyHealth,
        preNullifyHealthMax,
        preNullifyDamage,
        status: { isNullified: true }
      }
    },
    statuses: ["nullified"]
  }, opts);
}

/**
 * Restore powers that were suppressed by a Nullified effect.
 * Called from deleteActiveEffect hook when a nullified effect is removed.
 * @param {ActiveEffect} effect - the deleted effect
 * @param {Actor} actor - the actor whose effect was removed
 */
export async function restoreNullifiedPowers(effect, actor) {
  if (!actor) return;
  const scope = SCOPE();
  const flags = effect?.flags?.[scope] || {};
  if (flags.effectType !== "nullified") return;

  const suppressedIds = flags.suppressedPowerIds || [];
  if (suppressedIds.length === 0 && !flags.abilitySwaps) return;

  // Re-enable suppressed powers
  const toRestore = suppressedIds.filter(id => {
    const item = actor.items.get(id);
    return item && item.system?.isActive === false;
  });

  if (toRestore.length > 0) {
    const updates = toRestore.map(id => ({ _id: id, "system.isActive": true }));
    if (canWriteEffectsOn(actor)) {
      await actor.updateEmbeddedDocuments("Item", updates);
    } else {
      const { executeAsGM } = await import("../../gm-utils.js");
      await executeAsGM("updateEmbeddedDocsOnActor", {
        targetActorUuid: actor.uuid,
        collection: "Item",
        updates
      });
    }
    const names = toRestore.map(id => actor.items.get(id)?.name).filter(Boolean);
    console.log(`[FASERIP] Nullification ended: restored ${toRestore.length} powers on ${actor.name}:`, names.join(", "));
  }

  // Restore swapped ability scores
  const abilitySwaps = flags.abilitySwaps || {};
  const actorUpdates = {};
  for (const [ability, original] of Object.entries(abilitySwaps)) {
    actorUpdates[`system.abilities.${ability}.rank`] = original.originalRank;
    actorUpdates[`system.abilities.${ability}.value`] = original.originalValue;
    console.log(`[FASERIP] Nullification ended: ${actor.name} ${ability} restored to ${original.originalRank} (${original.originalValue})`);
  }

  if (Object.keys(actorUpdates).length > 0) {
    // Calculate damage taken while nullified (at reduced stats)
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const currentMax = actor.system?.attributes?.health?.max ?? 0;
    const damageWhileNullified = Math.max(0, currentMax - currentHealth);

    const ownsTarget = canWriteEffectsOn(actor);
    const gmExec = ownsTarget ? null : (await import("../../gm-utils.js")).executeAsGM;

    if (ownsTarget) {
      await actor.update(actorUpdates);
    } else {
      await gmExec("updateActor", { targetActorUuid: actor.uuid, updateData: actorUpdates });
    }

    // Recalc new health max from restored abilities
    const abs = actor.system?.abilities || {};
    const restoredMax =
      parseInt(abs.fighting?.value || 0) +
      parseInt(abs.agility?.value || 0) +
      parseInt(abs.strength?.value || 0) +
      parseInt(abs.endurance?.value || 0);

    // Restore health: original max minus pre-existing damage minus damage taken while nullified
    const preNullifyDamage = flags.preNullifyDamage ?? 0;
    const totalDamage = preNullifyDamage + damageWhileNullified;
    const restoredHealth = Math.max(0, restoredMax - totalDamage);
    if (ownsTarget) {
      await actor.update({ "system.attributes.health.value": restoredHealth });
    } else {
      await gmExec("updateActor", {
        targetActorUuid: actor.uuid,
        updateData: { "system.attributes.health.value": restoredHealth }
      });
    }
    console.log(`[FASERIP] Nullification ended: ${actor.name} health ${currentHealth} → ${restoredHealth}/${restoredMax} (pre-existing dmg: ${preNullifyDamage}, nullified dmg: ${damageWhileNullified})`);
  }
}
// ─────────────────────────────────────────────────────────────
// applyIntensityEffect — shared effect dispatcher used by both the
// standalone Intensity action and the on-hit intensity hook in
// attack-action. Maps an intensityEffect name to the right applier.
// Returns a short human-readable line describing what was applied.
// ─────────────────────────────────────────────────────────────
export async function applyIntensityEffect(targetActor, effectType, { rounds = 1, originUuid = null, desc = "" } = {}) {
  const durationLabel = rounds === 999 ? "scene/escape" : `${rounds} round${rounds !== 1 ? "s" : ""}`;
  try {
    switch (effectType) {
      case "poisoned": {
        // Defensive routing only — the Intensity action and the on-hit
        // hooks branch to the poison engine BEFORE rolling the generic
        // save (poison's exposure FEAT is the save). If this is reached,
        // a caller skipped that branch; delegate rather than fake it.
        console.warn("[FASERIP:POISON] applyIntensityEffect reached with 'poisoned' — caller should route to applyPoisonExposure directly");
        const { applyPoisonExposure } = await import("./poison-engine.js");
        const result = await applyPoisonExposure(targetActor, {
          intensity: "Typical", name: desc || "Toxin", sourceName: desc || "Intensity effect",
        });
        return result === "resisted" ? "Resisted the toxin" : "Poisoned (see poison card)";
      }
      case "blinded":
        await applyBlinded(targetActor, { rounds, originUuid });
        return `Blinded for ${durationLabel}`;
      case "deafened":
        await applyDeafened(targetActor, { rounds, originUuid });
        return `Deafened for ${durationLabel}`;
      case "stunned":
        await applyStun(targetActor, { rounds, originUuid });
        return `Stunned for ${durationLabel}`;
      case "unconscious":
        await applyUnconscious(targetActor, { rounds, originUuid });
        return `Unconscious for ${durationLabel}`;
      case "incapacitated":
        await applyEffect(targetActor, {
          name: "Incapacitated", img: "icons/svg/paralysis.svg", rounds, originUuid,
          changes: [
            { key: "system.combatMods.attackShift", mode: "add", value: "-4", priority: 20 },
            { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 },
            { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-2", priority: 20 },
            { key: "system.combatMods.movementMult", mode: "multiply", value: "0.5", priority: 20 }
          ],
          flags: { "msh-faserip": { effectType: "incapacitated", status: { isIncapacitated: true }, intensitySource: desc || "Intensity" } },
          statuses: ["incapacitated"]
        });
        return `Incapacitated for ${durationLabel}`;
      case "immobilized":
        await applyEffect(targetActor, {
          name: "Immobilized", img: "icons/svg/frozen.svg", rounds, originUuid,
          changes: [
            { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 },
            { key: "system.combatMods.canMove", mode: "override", value: "false", priority: 50 },
            { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 },
            { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-2", priority: 20 }
          ],
          flags: { "msh-faserip": { effectType: "immobilized", status: { isImmobilized: true }, intensitySource: desc || "Intensity" } },
          statuses: ["immobilized"]
        });
        return `Immobilized for ${durationLabel}`;
      case "paralyzed":
        await applyParalyzed(targetActor, { rounds, originUuid });
        return `Paralyzed for ${durationLabel}`;
      case "nullified":
        await applyEffect(targetActor, {
          name: "Nullified", img: "icons/svg/cancel.svg", rounds, originUuid,
          changes: [],
          flags: { "msh-faserip": { effectType: "nullified", status: { isNullified: true }, intensitySource: desc || "Intensity" } },
          statuses: ["nullified"]
        });
        return `Nullified for ${durationLabel}`;
      case "slammed":
        await applyEffect(targetActor, {
          name: "Slammed", img: "icons/svg/falling.svg", rounds: 1, originUuid,
          changes: [ { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 } ],
          flags: { "msh-faserip": { effectType: "slammed", status: { isSlammed: true }, intensitySource: desc || "Intensity" } },
          statuses: ["prone"]
        });
        return "Slammed (knocked down)";
      case "grabbed":
        await applyEffect(targetActor, {
          name: "Grabbed", img: "icons/svg/net.svg", rounds, originUuid,
          changes: [
            { key: "system.combatMods.attackShift", mode: "add", value: "-2", priority: 20 },
            { key: "system.combatMods.movementMult", mode: "override", value: "0", priority: 50 }
          ],
          flags: { "msh-faserip": { effectType: "grabbed", status: { isGrabbed: true }, intensitySource: desc || "Intensity" } },
          statuses: ["restrained"]
        });
        return `Grabbed for ${durationLabel}`;
      case "weakened":
        await applyWeakened(targetActor, { rounds, originUuid });
        return `Weakened for ${durationLabel}`;
      case "custom":
        await applyEffect(targetActor, {
          name: desc || "Intensity Effect", img: "icons/svg/hazard.svg", rounds, originUuid,
          changes: [],
          flags: { "msh-faserip": { effectType: "intensityCustom", status: { isAffected: true }, intensitySource: desc || "Intensity" } },
          statuses: ["affected"]
        });
        return `${desc || "Affected"} for ${durationLabel}`;
      default:
        return "";
    }
  } catch (err) {
    console.error("[FASERIP ERROR] applyIntensityEffect failed:", err);
    return "Effect failed (see console)";
  }
}
