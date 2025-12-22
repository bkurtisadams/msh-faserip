// scripts/modules/effects/effect-engine.js
// Centralized Active Effect helpers for FASERIP on Foundry v13

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

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

/** Convert N turns to seconds via CTT if possible, else fallback */
export function toSeconds(turns = 1) {
  const te = getCTT();
  if (te && typeof te.convertToSeconds === "function") {
    try { return te.convertToSeconds(turns, "turn"); } catch (_) {}
  }
  return Math.round(turns * getTurnSeconds());
}

/** Decide the duration block for an AE from rounds/seconds and policy */
export function computeDuration({ rounds = null, seconds = null } = {}) {
  // If explicit seconds provided, honor it
  if (Number.isFinite(seconds) && seconds > 0) {
    return { seconds, startTime: game.time?.worldTime ?? undefined };
  }

  // If rounds provided:
  if (Number.isFinite(rounds) && rounds > 0) {
    const policy = durationPolicy();
    const inCombat = !!game.combat?.active;

    // Preferred: keep rounds in combat, seconds out of combat
    if (inCombat && (policy === "rounds-in-combat" || policy === "auto")) {
      return {
        rounds,
        startRound: game.combat?.round ?? 0,
      };
    }

    // Outside combat, convert to real time
    return {
      seconds: toSeconds(rounds),
      startTime: game.time?.worldTime ?? undefined
    };
  }

  // No duration → timeless note effect
  return {};
}

/** Human-friendly label update: "Stunned (3 turns)" / "Stunned (10s)" */
export async function renameEffectWithRemaining(effect) {
  try {
    if (!effect?.parent) return;

    // Derive remaining
    const { text } = getRemaining(effect);
    if (!text) return;

    // Base name without trailing "(...)"
    const base = String(effect.name || "").replace(/\s*\([^)]*\)\s*$/u, "").trim();
    const next = `${base} (${text})`;
    if (next === effect.name) return;

    await effect.update({ name: next });
  } catch (e) {
    console.warn("[FASERIP] renameEffectWithRemaining failed:", e);
  }
}

/** Return remaining time as { rounds, seconds, text } */
export function getRemaining(effect) {
  const d = effect?.duration || {};
  // Round-based
  if (Number.isFinite(d.rounds) && (Number.isFinite(d.startRound) || Number.isFinite(d.startTurn))) {
    const curR = game.combat?.round ?? 0;
    const startR = d.startRound ?? curR;
    const elapsed = Math.max(0, curR - startR);
    const remain = Math.max(0, Math.ceil(d.rounds - elapsed));
    const unit = remain === 1 ? "turn" : "turns";
    return { rounds: remain, seconds: null, text: `${remain} ${unit}` };
  }
  // Seconds-based
  if (Number.isFinite(d.seconds) && Number.isFinite(d.startTime)) {
    const now = game.time?.worldTime ?? 0;
    const end = d.startTime + d.seconds;
    const remain = Math.max(0, Math.floor(end - now));
    const unit = "s";
    return { rounds: null, seconds: remain, text: `${remain}${unit}` };
  }
  return { rounds: null, seconds: null, text: "" };
}

/** Remove first effect that matches predicate (flag path or function) */
export async function removeEffectBy(predicate, actor) {
  if (!actor) return;
  const pred = (typeof predicate === "function")
    ? predicate
    : (eff) => getFlagPath(eff, predicate) === true;

  const eff = actor.effects.find(e => pred(e));
  if (eff) await eff.delete();
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
    console.error("[effect-engine] applyEffect: no valid actor/target", { target, effectData, opts });
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
    ...rest
  } = effectData;

  const duration = providedDuration || computeDuration({ rounds, seconds });
  const payload = {
    ...rest,
    img,
    duration,
    origin: origin ?? originUuid ?? actor.uuid,
    flags: {
      ...(rest?.flags || {}),
      [SCOPE()]: {
        ...(rest?.flags?.[SCOPE()] || {})
      }
    }
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
      
      // Rename with remaining time if successful
      if (created?.[0]?.id) {
        const effect = actor.effects.get(created[0].id);
        if (effect) await renameEffectWithRemaining(effect);
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
    if (created?.id) await renameEffectWithRemaining(created);
    return created;
  } catch (err) {
    console.error("[effect-engine] applyEffect failed:", err, { 
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
  return applyEffect(actor, {
    name: "Stunned",
    img: "icons/svg/daze.svg",
    rounds,
    originUuid,
    flags: {
      effectType: "stunned",
      status: { isStunned: true },
      meta: { unitLabel: "turn", unitLabelPlural: "turns" }
    },
    statuses: ["stunned"]
  }, opts);
}

export async function applyEvade(actor, { target = "", nextRoundAttackBonusCS = 0, note = "" } = {}) {
  return applyEffect(actor, {
    name: target ? `Evaded ${target}` : "Evaded",
    img: "icons/svg/combat.svg",
    rounds: 1,
    flags: {
      effectType: "evading",
      status: { isEvading: true },
      evadedTarget: target,
      nextRoundAttackBonusCS,
      notes: note
    },
    statuses: ["evading"]
  });
}

export async function applyBlock(actor, { armorRank = "Good", armorValue = 10, note = "" } = {}) {
  return applyEffect(actor, {
    name: `Blocking (${armorRank})`,
    img: "icons/svg/shield.svg",
    rounds: 1,
    flags: {
      effectType: "blocking",
      status: { isBlocking: true },
      armorRank,
      armorValue,
      notes: note || "Applies vs physical (not Shooting/Energy; not Charging). Stacks with normal armor, not Force Fields."
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
    flags: {
      status: { isCatching: true },
      scenario,
      vsYou,
      notes: note
    }
  });
}

/** Apply Slam note/prone/stagger. Optionally drive token displacement elsewhere. */
export async function applySlam(actor, { kind = "No Slam", knockbackAreas = 0, prone = false, stagger = false } = {}, opts = {}) {
  // Determine effect type based on slam kind
  let effectType = "slammed";
  if (kind === "Grand Slam") effectType = "grandSlam";
  else if (kind === "Stagger" || stagger) effectType = "staggered";
  
  return applyEffect(actor, {
    name: `Slam (${kind})`,
    img: "icons/svg/target.svg",
    rounds: (stagger || prone) ? 1 : 0,
    flags: {
      effectType,
      status: { isSlammed: true },
      kind,
      knockbackAreas,
      prone,
      stagger
    },
    statuses: prone ? ["prone"] : (stagger ? ["staggered"] : [])
  }, opts);
}

/** Apply prone effect */
export async function applyProne(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Prone",
    img: "icons/svg/falling.svg",
    rounds,
    originUuid,
    flags: {
      effectType: "prone",
      status: { isProne: true }
    },
    statuses: ["prone"]
  }, opts);
}

/** Apply grappled effect */
export async function applyGrappled(actor, { holderUuid = null, holderName = "", rounds = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: holderName ? `Grappled by ${holderName}` : "Grappled",
    img: "icons/svg/net.svg",
    rounds,
    flags: {
      effectType: "grappled",
      status: { isGrappled: true },
      holderUuid,
      holderName
    },
    statuses: ["grappled"]
  }, opts);
}

/** Apply held effect (stronger than grappled) */
export async function applyHeld(actor, { holderUuid = null, holderName = "", rounds = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: holderName ? `Held by ${holderName}` : "Held",
    img: "icons/svg/padlock.svg",
    rounds,
    flags: {
      effectType: "held",
      status: { isHeld: true },
      holderUuid,
      holderName
    },
    statuses: ["held"]
  }, opts);
}

/** Apply entangled effect */
export async function applyEntangled(actor, { materialRank = "Good", rounds = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: `Entangled (${materialRank})`,
    img: "icons/svg/net.svg",
    rounds,
    flags: {
      effectType: "entangled",
      status: { isEntangled: true },
      materialRank
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
    flags: {
      effectType: "blinded",
      status: { isBlinded: true }
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
    flags: {
      effectType: "unconscious",
      status: { isUnconscious: true }
    },
    statuses: ["unconscious"]
  }, opts);
}

/** Create/refresh Dying state (no timer; update handled by updateCombat) */
export async function applyDying(actor, { enduranceValue = null } = {}) {
  return applyEffect(actor, {
    name: "Dying",
    img: "icons/svg/skull.svg",
    flags: {
      effectType: "dying",
      status: { isDying: true },
      enduranceBase: Number.isFinite(enduranceValue) ? enduranceValue : (actor.system?.abilities?.endurance?.value ?? 10),
      stabilizedRounds: 0
    },
    statuses: ["dying"]
  });
}

/** Optionally advance CTT by N turns if sync is enabled */
export function advanceCTTByTurns(n = 1) {
  const te = getCTT();
  if (!te || typeof te.advance !== "function") return false;
  try { te.advance(n, "turn"); return true; } catch { return false; }
}
