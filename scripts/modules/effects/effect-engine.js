// scripts/modules/effects/effect-engine.js v1.4.0 - 2026-01-02
// v1.4.0: Fix applyEvade - properly track evadeSuccessful/autoHit flags, remove incorrect combat mod changes
// v1.3.0: Duplicate effect handling - stun keeps longer duration, slam keeps more severe
// v1.2.1: Reduce console logging verbosity
// v1.2.0: Improved debug logging for effect creation and duration tracking
// v1.1.0: Add proper Foundry changes arrays to effect wrappers
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
    changes: changes || [],
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

// Active Effect mode constants (from Foundry CONST.ACTIVE_EFFECT_MODES)
const AE_MODE = {
  MULTIPLY: 1,
  ADD: 2,
  DOWNGRADE: 3,
  UPGRADE: 4,
  OVERRIDE: 5
};

export async function applyStun(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  // Check for existing stun effect
  const existingStun = actor.effects.find(e => 
    e.statuses?.has("stunned") || 
    e.flags?.[SCOPE()]?.effectType === "stunned" ||
    e.name?.toLowerCase().includes("stunned")
  );
  
  if (existingStun) {
    // Get remaining duration of existing stun
    const existingRounds = existingStun.duration?.remaining ?? 
                          existingStun.duration?.rounds ?? 0;
    
    if (rounds <= existingRounds) {
      // New stun is shorter or equal - keep existing
      console.log(`[FASERIP] Stun: Keeping existing (${existingRounds} rounds) over new (${rounds} rounds)`);
      return existingStun;
    } else {
      // New stun is longer - remove existing and apply new
      console.log(`[FASERIP] Stun: Replacing existing (${existingRounds} rounds) with new (${rounds} rounds)`);
      await existingStun.delete();
    }
  }
  
  return applyEffect(actor, {
    name: "Stunned",
    img: "icons/svg/daze.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
    flags: {
      effectType: "stunned",
      status: { isStunned: true },
      meta: { unitLabel: "turn", unitLabelPlural: "turns" }
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
    effectName = "Evasion Failed (Auto-Hit)";
  } else if (nextRoundAttackBonusCS > 0) {
    effectName = target ? `Evaded ${target} (+${nextRoundAttackBonusCS}CS)` : `Evaded (+${nextRoundAttackBonusCS}CS)`;
  } else {
    effectName = target ? `Evaded ${target}` : "Evaded";
  }
  
  return applyEffect(actor, {
    name: effectName,
    img: autoHit ? "icons/svg/hazard.svg" : "icons/svg/combat.svg",
    rounds: 1,
    // No combat mod changes - evasion is tracked via flags, checked by attacks
    changes: [],
    flags: {
      effectType: "evading",
      status: { isEvading: true },
      evadeSuccessful,
      autoHit,
      evadedTarget: target,
      nextRoundAttackBonusCS,
      nextRoundBonusUsed: false,
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
    changes: [
      { key: "system.combatMods.movementMult", mode: AE_MODE.MULTIPLY, value: "0.5", priority: 20 }
    ],
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
    changes: [],
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
  // Slam severity hierarchy: Grand Slam (3) > 1 Area (2) > Stagger (1) > No Slam (0)
  const SLAM_SEVERITY = {
    "Grand Slam": 3,
    "1 Area": 2,
    "Stagger": 1,
    "No Slam": 0
  };
  
  const newSeverity = SLAM_SEVERITY[kind] ?? 0;
  
  // Check for existing slam effects
  const existingSlam = actor.effects.find(e => {
    const effectType = e.flags?.[SCOPE()]?.effectType;
    return effectType === "grandSlam" || effectType === "slammed" || effectType === "staggered" ||
           e.statuses?.has("prone") || e.statuses?.has("staggered") ||
           e.name?.toLowerCase().includes("slam");
  });
  
  if (existingSlam) {
    // Determine existing slam severity
    const existingType = existingSlam.flags?.[SCOPE()]?.effectType;
    const existingKind = existingSlam.flags?.[SCOPE()]?.kind;
    let existingSeverity = 0;
    
    if (existingType === "grandSlam" || existingKind === "Grand Slam") {
      existingSeverity = 3;
    } else if (existingType === "slammed" || existingKind === "1 Area") {
      existingSeverity = 2;
    } else if (existingType === "staggered" || existingKind === "Stagger") {
      existingSeverity = 1;
    }
    
    if (newSeverity <= existingSeverity) {
      // New slam is same or less severe - keep existing
      console.log(`[FASERIP] Slam: Keeping existing (${existingKind || existingType}) over new (${kind})`);
      return existingSlam;
    } else {
      // New slam is more severe - remove existing and apply new
      console.log(`[FASERIP] Slam: Replacing existing (${existingKind || existingType}) with new (${kind})`);
      await existingSlam.delete();
    }
  }
  
  // Don't create an effect for "No Slam"
  if (kind === "No Slam" && !prone && !stagger) {
    return null;
  }
  
  // Determine effect type based on slam kind
  let effectType = "slammed";
  let changes = [];
  
  if (kind === "Grand Slam") {
    effectType = "grandSlam";
    changes = [
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ];
  } else if (kind === "Stagger" || stagger) {
    effectType = "staggered";
    changes = [
      { key: "system.combatMods.movementMult", mode: AE_MODE.MULTIPLY, value: "0.5", priority: 20 }
    ];
  } else if (kind === "1 Area" || prone) {
    effectType = "slammed";
    changes = [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "1", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-2", priority: 20 }
    ];
  }
  
  return applyEffect(actor, {
    name: `Slam (${kind})`,
    img: "icons/svg/target.svg",
    rounds: (stagger || prone) ? 1 : 0,
    changes,
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
    changes: [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "1", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.MULTIPLY, value: "0.5", priority: 20 }
    ],
    flags: {
      effectType: "prone",
      status: { isProne: true }
    },
    statuses: ["prone"]
  }, opts);
}

/** Apply grappled effect (partial hold) */
export async function applyGrappled(actor, { holderUuid = null, holderName = "", rounds = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: holderName ? `Grappled by ${holderName}` : "Grappled",
    img: "icons/svg/net.svg",
    rounds,
    changes: [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.fighting", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
    flags: {
      effectType: "grappled",
      status: { isGrappled: true },
      holderUuid,
      holderName
    },
    statuses: ["grappled"]
  }, opts);
}

/** Apply held effect (full hold - stronger than grappled) */
export async function applyHeld(actor, { holderUuid = null, holderName = "", rounds = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: holderName ? `Held by ${holderName}` : "Held",
    img: "icons/svg/padlock.svg",
    rounds,
    changes: [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.abilityShifts.fighting", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.abilityShifts.strength", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
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
    changes: [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
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
    changes: [
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.agility", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.abilityShifts.intuition", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.MULTIPLY, value: "0.25", priority: 20 }
    ],
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
    changes: [
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
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
    changes: [
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
    flags: {
      effectType: "dying",
      status: { isDying: true },
      enduranceBase: Number.isFinite(enduranceValue) ? enduranceValue : (actor.system?.abilities?.endurance?.value ?? 10),
      stabilizedRounds: 0
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
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.MULTIPLY, value: "2", priority: 20 }
    ],
    flags: {
      effectType: "charging",
      status: { isCharging: true }
    },
    statuses: ["charging"]
  }, opts);
}

/** Optionally advance CTT by N turns if sync is enabled */
export function advanceCTTByTurns(n = 1) {
  const te = getCTT();
  if (!te || typeof te.advance !== "function") return false;
  try { te.advance(n, "turn"); return true; } catch { return false; }
}