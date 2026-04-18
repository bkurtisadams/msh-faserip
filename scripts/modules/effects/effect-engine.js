// scripts/modules/effects/effect-engine.js v1.12.0 - 2026-03-22
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

/** Decide the duration block for an AE from rounds/seconds and policy.
 * Writes v14 schema: { value, units, expiry }.
 * Falls back to v13 schema ({ seconds, startTime } or { rounds, startRound })
 * if game.release.generation is < 14.
 */
export function computeDuration({ rounds = null, seconds = null } = {}) {
  const v14 = (game.release?.generation ?? 13) >= 14;

  // If explicit seconds provided, honor it
  if (Number.isFinite(seconds) && seconds > 0) {
    if (v14) {
      return { value: seconds, units: "seconds" };
    }
    return { seconds, startTime: game.time?.worldTime ?? undefined };
  }

  // If rounds provided:
  if (Number.isFinite(rounds) && rounds > 0) {
    const policy = durationPolicy();
    const inCombat = !!game.combat?.active;

    // Preferred: keep rounds in combat, seconds out of combat
    if (inCombat && (policy === "rounds-in-combat" || policy === "auto")) {
      if (v14) {
        return { value: rounds, units: "rounds", expiry: "roundEnd" };
      }
      return {
        rounds,
        startRound: game.combat?.round ?? 0,
      };
    }

    // Outside combat, convert to real time
    const s = toSeconds(rounds);
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

  // v14: Foundry computes remaining for us. Use it directly.
  // d.units is "rounds"/"seconds"/"turns"; d.remaining is the live remaining count.
  if (Number.isFinite(d.remaining) && d.units) {
    const u = String(d.units).toLowerCase();
    if (u === "rounds" || u === "turns") {
      const unitLabel = d.remaining === 1 ? "turn" : "turns";
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
    const unit = remain === 1 ? "turn" : "turns";
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
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
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
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
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
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "1", priority: 20 }
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
  // Partial Hold: -2CS on all actions, cannot move if attacker Str >= target
  // Per rules: "The target may perform any normal actions, but at a -2 CS penalty"
  // This is a general action penalty, NOT individual ability reductions
  return applyEffect(actor, {
    name: holderName ? `Grappled by ${holderName}` : "Grappled",
    img: "icons/svg/net.svg",
    rounds,
    changes: [
      { key: "system.combatMods.selfPenaltyCS", mode: AE_MODE.ADD, value: "-2", priority: 20 },
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
  // Full Hold: target fully restrained, cannot act (only escape attempts)
  // Per rules: "restrained, attacker +1 action, Str dmg"
  // Target cannot take any actions — canAct=false handles this
  return applyEffect(actor, {
    name: holderName ? `Held by ${holderName}` : "Held",
    img: "icons/svg/padlock.svg",
    rounds,
    changes: [
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
    flags: {
      effectType: "held",
      status: { isHeld: true },
      holderUuid,
      holderName,
      allowEscape: true  // target can still attempt escape action
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
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0.5", priority: 20 },
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 }
    ],
    flags: {
      effectType: "escaped",
      status: { isEscaped: true }
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
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0.5", priority: 20 },
      { key: "system.combatMods.selfPenaltyCS", mode: AE_MODE.ADD, value: "-2", priority: 20 }
    ],
    flags: {
      effectType: "reversed",
      status: { isReversed: true }
    },
    statuses: ["reversed"]
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
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-4", priority: 20 }
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

/** Apply deafened effect — impaired hearing, -2CS Intuition, -2CS to detect ambush */
export async function applyDeafened(actor, { rounds = 1, originUuid = null } = {}, opts = {}) {
  return applyEffect(actor, {
    name: "Deafened",
    img: "icons/svg/deaf.svg",
    rounds,
    originUuid,
    changes: [
      { key: "system.combatMods.abilityShifts.intuition", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-1", priority: 20 }
    ],
    flags: {
      effectType: "deafened",
      status: { isDeafened: true }
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
      { key: "system.combatMods.canAct", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODE.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.movementMult", mode: AE_MODE.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-4", priority: 20 }
    ],
    flags: {
      effectType: "paralyzed",
      status: { isParalyzed: true }
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
      { key: "system.combatMods.attackShift", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.defenseShift", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODE.ADD, value: "-1", priority: 20 },
      { key: "system.combatMods.abilityShifts.strength", mode: AE_MODE.ADD, value: "-2", priority: 20 },
      { key: "system.combatMods.abilityShifts.endurance", mode: AE_MODE.ADD, value: "-2", priority: 20 }
    ],
    flags: {
      effectType: "weakened",
      status: { isWeakened: true }
    },
    statuses: ["weakened"]
  }, opts);
}

/** Optionally advance CTT by N turns if sync is enabled */
export function advanceCTTByTurns(n = 1) {
  const te = getCTT();
  if (!te || typeof te.advance !== "function") return false;
  try { te.advance(n, "turn"); return true; } catch { return false; }
}


/* ===== Regeneration Power Support ===== */
/* Now delegates to the generic ongoing effects engine (ongoing-engine.js). */
/* These wrappers maintain backward compatibility for existing callers. */

/**
 * Get current game time in seconds.
 * Prefers CTT totalSeconds, falls back to Foundry worldTime.
 * @returns {number}
 */
export function getGameTime() {
  const te = getCTT();
  if (te) {
    const t = te.getCurrentTime?.()?.totalSeconds;
    if (Number.isFinite(t)) return t;
  }
  return game.time?.worldTime ?? 0;
}

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
 * Process Regeneration for all actors (backward-compatible wrapper).
 * Now delegates to processOngoingEffects.
 */
export async function processRegeneration(worldTime, dt = 0) {
  try {
    const { processOngoingEffects } = await import("./ongoing-engine.js");
    await processOngoingEffects(worldTime, dt);
  } catch (e) {
    console.error("[FASERIP ERROR] Failed to delegate to ongoing engine:", e);
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
    await resolvedActor.updateEmbeddedDocuments("Item", updates);
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
    await resolvedActor.update(actorUpdates);

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
    await resolvedActor.update({ "system.attributes.health.value": newHealth });
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
    await actor.updateEmbeddedDocuments("Item", updates);
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

    await actor.update(actorUpdates);

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
    await actor.update({ "system.attributes.health.value": restoredHealth });
    console.log(`[FASERIP] Nullification ended: ${actor.name} health ${currentHealth} → ${restoredHealth}/${restoredMax} (pre-existing dmg: ${preNullifyDamage}, nullified dmg: ${damageWhileNullified})`);
  }
}