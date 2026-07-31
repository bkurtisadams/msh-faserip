// scripts/modules/effects/ongoing-engine.js v1.7.8 - 2026-05-15
// v1.7.8: loseOneEnduranceRank export — mirror of restoreOneEnduranceRank.
//         Reduces End rank by one step, recalcs max Health, drops current HP
//         by the delta. Returns belowFeeble flag for the RAW "healer dies"
//         case (caller decides death pipeline integration). Used by Healing
//         power on End-rank-mode FEAT failure.
// v1.7.7: restoreOneEnduranceRank export — reusable one-shot rank-step
//         helper for Recovery power FEAT and any future End-restore caller.
//         getCurrentGameDate export for oncePerDay gating outside this file.
// v1.7.6: applyAbsorptionTempHPOngoing — cliff decay at round+10 for temp HP
//         granted by Absorption power. Per-source AE keying so independent
//         absorptions decay on their own clocks. stat.loss type, capAtMax:false
//         so the strip succeeds even when current HP is above max.
// v1.7.5: Regen reliability — noDamage gate now accepts simultaneous
//         lastDmgWT === startedAt as "before start" (was strict <,
//         silently stalled when recordDamage and timer-init landed on
//         the same worldTime second). executeHealthHeal stamps
//         autoDisabledAtCap when disabling an at-cap effect, and
//         interruptOngoingEffects re-arms (enables + nulls startedAt)
//         any AE carrying that flag on fresh damage, so resting after
//         a full-heal-then-new-damage cycle no longer requires a
//         manual AE toggle. User-disabled effects (no flag) untouched.
// scripts/modules/effects/ongoing-engine.js v1.7.4 - 2026-04-19
// v1.7.4: Migrate legacy `icon:` to `img:` on the processDyingRound
//         Impaired Endurance creation site (line ~731). The sibling
//         applyDyingOngoing creation site (line ~1124) already used img.
//         In v14 the AE field was renamed icon → img; token HUD reads
//         img at creation time, and CTT's icon→img migration shim fires
//         too late to affect the initial badge render. Rare in practice
//         — applyDyingOngoing fires first and this branch only creates
//         when no existing impaired effect is found on a dying round —
//         but worth the hygiene fix.
// v1.7.3: Add duration:{expiry:"roundEnd"} to Impaired Endurance AE
//         creations (processDyingRound missing-effect branch + the
//         applyDyingOngoing immediate-loss branch). Required for v14's
//         isTemporary rule `!!duration.expiry || Number.isFinite(
//         duration.value)` — without it the token HUD badge does not
//         render. No auto-expiration because there's no duration.value;
//         our healImpairedEndurance path removes the AE rank-by-rank
//         once Endurance is restored. Third site fixed in rest-system.js
//         v1.4.3 at the same time.
// v1.7.2: applyDyingOngoing now disables any active Healing AE on the
//         actor as it begins dying. Healing has interruptOnDamage:false
//         (it's re-registered on each damage event rather than disabled)
//         so interruptOngoingEffects leaves it alone — but a dying
//         character should not have an active hourly Healing timer.
//         Defensive safety net paired with rest-system.js v1.4.1 which
//         prevents the registration at the source. Also clears the
//         ongoing.healing.startedAt flag so a future re-registration
//         starts its clock fresh.
// v1.7.1: Fix Impaired Endurance `lastHealed` initialized with Date.now()
//         (wall-clock ms) at AE creation in two spots: processDyingRound's
//         missing-effect branch (~line 710) and applyDyingOngoing's
//         immediate-loss branch (~line 1078). Every read and every other
//         write uses game.time.worldTime (game seconds), so the mismatch
//         made `game.time.worldTime - lastHealed` produce a huge negative
//         number — `elapsed >= required` never true → rank never heals.
//         In the normal dying → stabilize flow, rest-system.js overwrites
//         `lastHealed` at stabilization, which papered over the bug; but
//         any path that checked the heal before stabilization would fail.
//         Both sites now use game.time.worldTime for consistency.
// v1.7.0: RAW rules fixes for impaired endurance and stat.loss/stat.gain health sync.
//         - OE1: Impaired Endurance effect now uses selfPenaltyCS: -2 (applies
//           to all FEATs per RAW "-2CS on all actions"). Previously used
//           attackShift: -2 which only penalized attacks.
//           Fixed in both applyDyingOngoing (initial rank loss) and
//           processDyingRound (subsequent rank losses).
//         - OE9: executeEnduranceLoss now drops current health alongside
//           max health when a rank step happens. Also applies to the
//           non-rank-step branch (clamp current HP to new max).
//         - OE10: executeEnduranceGain now reads the canonical RANKS_ORDERED
//           instead of an inline rank list (which had "Shift X" with space
//           and no Class ranks). Clamps to originalEndurance per RAW
//           "cannot heal above pre-damage rank." Restores max HP and adds
//           the delta to current HP so Endurance healing actually restores
//           Health (per Health = F+A+S+E).
// v1.6.0: Dying updates pass { mshDyingTick: true } so init.js updateActor hook skips
//         spurious DAMAGE DETECTED processing for endurance rank loss HP changes.
//         Health reduction is correct per rules: Health = F+A+S+E, so both current and
//         max Health drop when Endurance rank drops during dying.
// v1.5.0: Robot origin check — death treated as deactivation (reactivatable, no karma loss).
// v1.4.0: Consolidated dying initiation into applyDyingOngoing (immediate first rank loss,
//         Impaired Endurance, HP reduction, chat). All callers now use this single entry point.
//         Removed duration from dying AE (lifecycle managed by engine, not expiry).
//         processDyingRound handles subsequent rank losses (1 per FASERIP turn via combatRound hook).
// v1.3.0: Active-scene-only processing (getActiveSceneActors replaces getAllTokenActors).
//         processOneEffect hard-skips "dying" effectId — dying only via processDyingRound.
//         Legacy migration sets combatOnly: true, no immediate processing.
// v1.2.0: Legacy dying AE migration: auto-registers ongoing config, strips duration.
// v1.1.0: Full dying mechanics via processDyingRound() — stabilization, HP reduction,
//         Impaired Endurance effect, Shift-0 warning/death, re-FEAT, combat mods.
// Generic periodic effect engine for FASERIP.
// Handles Regeneration, Solar Regeneration, Recovery, Dying, Absorption decay,
// Corrosive damage, and any future timed effects via a declarative config schema.

import { getAllTokenActors, applyEffect } from "./effect-engine.js";
import { safeActorUpdate, safeActorSetFlag, safeActorCreateEffect, safeActorUpdateEffect } from "../../gm-utils.js";
import { RANKS_ORDERED } from "../../rules/rules-reference.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

// Synchronous in-memory lock to prevent concurrent processDyingRound calls per actor.
// Solves race condition where combatRound + timeAdvanced hooks both call processDyingRound
// before the async setFlag dedup can complete.
const _dyingLocks = new Set();

/**
 * Get actors from the current (viewed) scene only.
 * Falls back to getAllTokenActors() if no active scene.
 */
function getActiveSceneActors() {
  const scene = canvas?.scene ?? game.scenes?.active;
  if (!scene) return getAllTokenActors();

  const seen = new Set();
  const actors = [];
  for (const tokenDoc of scene.tokens) {
    const a = tokenDoc.actor;
    if (!a) continue;
    const key = tokenDoc.actorLink ? a.id : `token-${tokenDoc.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actors.push(a);
  }
  return actors;
}

function getTurnSeconds() {
  const v = Number(game.settings?.get?.("msh-faserip", "turnSeconds"));
  return Number.isFinite(v) && v > 0 ? v : 6;
}

/* ───────────────────────────────────────────
   Schema reference (stored on actor flags):
   ───────────────────────────────────────────
   {
     type:       "heal" | "damage" | "stat.loss" | "stat.gain",
     stat:       "health" | "endurance",
     formula:    "@endurance" | "@powerRank" | "1rank" | number,
     rate:       10,           // every N cycles
     cycle:      "turn" | "round" | "minute" | "hour" | "day" | "week",
     count:      -1,           // -1 = unlimited, N = max triggers
     gate:       "none" | "noDamage" | "daylight" | "conscious",
     gates:      [],           // array form for multiple gates (overrides gate)
     interruptOnDamage: true,  // reset timer + disable AE on damage
     oncePerDay: false,
     capAtMax:   true,         // stop at max HP (false for Absorption overheal)
     autoDisable: true,        // disable AE when fully healed / effect done
     // Runtime state (managed by engine):
     startedAt:    null,       // worldTime when timer started
     lastTriggered: null,      // worldTime of last trigger
     triggerCount:  0,         // how many times triggered so far
   }
   ─────────────────────────────────────────── */

// ─── Cycle-to-seconds conversion ──────────────────────────────────────────────

const CYCLE_MULTIPLIERS = {
  turn:   () => getTurnSeconds(),
  round:  () => getTurnSeconds(),
  minute: () => 60,
  hour:   () => 3600,
  day:    () => 86400,
  week:   () => 604800,
};

function cycleToSeconds(rate, cycle) {
  const mult = CYCLE_MULTIPLIERS[cycle];
  if (!mult) {
    console.warn(`[FASERIP WARN] Unknown cycle "${cycle}", defaulting to turn`);
    return rate * getTurnSeconds();
  }
  return rate * mult();
}

// ─── Formula resolution ───────────────────────────────────────────────────────

function resolveFormula(formula, actor, config = {}) {
  if (typeof formula === "number") return formula;
  const f = String(formula).trim().toLowerCase();

  if (f === "@endurance") {
    return actor.system?.abilities?.endurance?.value ?? 10;
  }
  if (f === "@strength") {
    return actor.system?.abilities?.strength?.value ?? 10;
  }
  if (f === "@powerrank" || f === "@power_rank") {
    // Power rank stored in config or look up from power item
    if (Number.isFinite(config.powerRankValue)) return config.powerRankValue;
    if (config.powerItemId) {
      const item = actor.items.get(config.powerItemId);
      if (item) {
        const rv = item.system?.value ?? item.system?.rank;
        if (Number.isFinite(rv)) return rv;
        const name = rv || item.system?.rank;
        if (name && CONFIG.FASERIP?.rankValues) {
          return game.msh?.getRankValue?.(name) ?? 0;
        }
      }
    }
    return actor.system?.abilities?.endurance?.value ?? 10;
  }
  if (f === "1rank") {
    // Step down 1 rank — return "marker" that the processor handles specially
    return "1rank";
  }

  // Try as plain number
  const num = Number(formula);
  if (Number.isFinite(num)) return num;

  console.warn(`[FASERIP WARN] Unresolved ongoing formula: "${formula}"`);
  return 0;
}

// ─── Gate checks ──────────────────────────────────────────────────────────────

function checkGate(gateName, actor, _config) {
  switch (gateName) {
    case "none":
      return true;

    case "noDamage": {
      // Must not have taken damage since timer started. Same-instant
      // (lastDmgWT === startedAt) is treated as "before start" so the
      // timer can run immediately after a damage tick on the same
      // worldTime — the alternative was a silent stall whenever
      // recordDamage and timer-init landed on the same second.
      const scope = SCOPE();
      const lastDmgWT = actor.getFlag(scope, "lastDamageWorldTime");
      const startedAt = _config?.startedAt;
      if (!Number.isFinite(lastDmgWT) || !Number.isFinite(startedAt)) return true;
      return lastDmgWT <= startedAt;
    }

    case "daylight": {
      // Check CTT hour (6:00–18:00 default)
      const mod = game.modules.get("calendar-time-tracker");
      const te = mod?.active ? (mod.api?.timeEngine ?? null) : null;
      if (!te) return true; // No CTT = assume daylight
      const ct = te.getCurrentTime?.();
      if (!ct) return true;
      const hour = ct.hour ?? 12;
      return hour >= 6 && hour < 18;
    }

    case "conscious": {
      const hp = actor.system?.attributes?.health?.value ?? 0;
      return hp > 0;
    }

    default:
      console.warn(`[FASERIP WARN] Unknown gate: "${gateName}"`);
      return true;
  }
}

function checkAllGates(config, actor) {
  const gates = config.gates || (config.gate ? [config.gate] : ["none"]);
  return gates.every(g => checkGate(g, actor, config));
}

// ─── Chat message formatting ──────────────────────────────────────────────────

const TYPE_STYLES = {
  heal:      { bg: "#e8f5e9", border: "#4caf50", color: "#2e7d32", icon: "fa-heart-pulse", label: "Healed" },
  damage:    { bg: "#ffebee", border: "#f44336", color: "#c62828", icon: "fa-heart-crack", label: "Damage" },
  "stat.loss":  { bg: "#fff3e0", border: "#ff9800", color: "#e65100", icon: "fa-arrow-down", label: "Stat Loss" },
  "stat.gain":  { bg: "#e3f2fd", border: "#2196f3", color: "#1565c0", icon: "fa-arrow-up", label: "Stat Gain" },
};

async function sendOngoingChat(actor, effectName, type, detail) {
  const style = TYPE_STYLES[type] || TYPE_STYLES.damage;

  // Auto-heal chat filter: apply only to healing-flavored events (heal + stat.gain)
  // on NPCs. PCs always post public; damage/stat.loss always post public so
  // combat consequences remain visible.
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:${style.bg};border:2px solid ${style.border};padding:10px;border-radius:5px;">
      <div style="font-size:1.1em;font-weight:bold;color:${style.color};margin-bottom:4px;">
        <i class="fas ${style.icon}"></i> ${effectName}
      </div>
      <div>${detail}</div>
    </div>`,
  };

  const isHealType = (type === "heal" || type === "stat.gain");
  if (isHealType) {
    const isPC = !!(actor?.hasPlayerOwner) ||
                 (actor?.system?.characterType === "player");
    if (!isPC) {
      let mode = "gm-whisper-npcs";
      try { mode = game.settings?.get?.("msh-faserip", "autoHealChatMode") || mode; }
      catch (_e) { /* setting not registered yet */ }
      if (mode === "silent-npcs") return;
      if (mode === "gm-whisper-npcs") {
        messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
      }
    }
  }

  await ChatMessage.create(messageData);
}

// ─── Stat loss/gain (Endurance rank stepping) ─────────────────────────────────

function stepEnduranceRank(actor, direction) {
  const current = actor.system?.abilities?.endurance?.rank;
  if (!current) return null;

  if (direction === "down") {
    return game.msh?.nextLowerRankName?.(current) ?? "Shift-0";
  }
  if (direction === "up") {
    return game.msh?.nextHigherRankName?.(current) ?? current;
  }
  return current;
}

// ─── Core processor ───────────────────────────────────────────────────────────

/**
 * Process all ongoing effects for all actors.
 * Called from updateWorldTime hook.
 *
 * @param {number} worldTime - Current worldTime (after advance)
 * @param {number} [dt=0]    - Delta seconds of this advance
 */
export async function processOngoingEffects(worldTime, dt = 0) {
  const scope = SCOPE();

  for (const actor of getActiveSceneActors()) {
    const ongoingMap = actor.getFlag(scope, "ongoing");

    // ── Legacy dying AE migration ──────────────────────────────────
    // Detect old-format dying AEs (isDying flag but no ongoing.dying config)
    // and auto-register them with the ongoing engine
    const hasDyingConfig = ongoingMap?.dying;
    if (!hasDyingConfig) {
      const legacyDying = actor.effects.find(e =>
        (e.flags?.[scope]?.isDying || e.statuses?.has?.("dying")) && !e.disabled
      );
      if (legacyDying) {
        console.log(`[FASERIP] Migrating legacy dying AE on ${actor.name} to ongoing engine`);
        const dyingConfig = {
          type: "stat.loss",
          stat: "endurance",
          formula: "1rank",
          rate: 1,
          cycle: "round",
          count: -1,
          gate: "none",
          interruptOnDamage: false,
          capAtMax: false,
          autoDisable: false,
          combatOnly: true,  // Dying processed by processDyingRound, not worldTime ticks
          originalEndurance: legacyDying.getFlag(scope, "originalEndurance")
            || actor.getFlag(scope, "originalEndurance")
            || actor.system?.abilities?.endurance?.rank,
          startedAt: worldTime - Math.abs(dt || 0),
          lastTriggered: null,
          triggerCount: legacyDying.getFlag(scope, "turnsElapsed") || 0,
        };
        await actor.setFlag(scope, "ongoing.dying", dyingConfig);
        // Tag the legacy AE so we can find it, and remove duration so CTT doesn't expire it
        if (!legacyDying.flags?.[scope]?.ongoingId) {
          await legacyDying.update({
            [`flags.${scope}.ongoingId`]: "dying",
            [`flags.${scope}.effectType`]: "ongoing",
            // v14 canonical: clear value+units to make timeless. Legacy
            // duration.rounds/duration.seconds are no-op writes on v14.
            "duration.value": null,
            "duration.units": null,
          });
        }
        // combatOnly: dying will be processed by processDyingRound on next round change
      }
    }

    // Re-read ongoingMap in case migration just added dying config
    const currentMap = actor.getFlag(scope, "ongoing");
    if (!currentMap || typeof currentMap !== "object") continue;

    for (const [effectId, config] of Object.entries(currentMap)) {
      if (!config || typeof config !== "object") continue;

      try {
        await processOneEffect(actor, effectId, config, worldTime, dt, scope);
      } catch (e) {
        console.error(`[FASERIP ERROR] processOngoingEffects failed for ${actor.name}/${effectId}:`, e);
      }
    }
  }
}

async function processOneEffect(actor, effectId, config, worldTime, dt, scope) {
  // Skip combat-only effects — dying is handled by processDyingRound on round change,
  // not by worldTime ticks. Hard-code "dying" as safety net for saved configs missing the flag.
  if (config.combatOnly || effectId === "dying") return;

  // Find corresponding AE — must be enabled
  const ae = actor.effects.find(e =>
    e.flags?.[scope]?.ongoingId === effectId && !e.disabled
  );
  if (!ae) return;

  // Once-per-day check
  if (config.oncePerDay) {
    const lastDate = config.lastTriggeredDate;
    const today = _getGameDate();
    if (lastDate === today) return;
  }

  // Gate checks
  if (!checkAllGates(config, actor)) return;

  // Count limit
  if (config.count > 0 && (config.triggerCount || 0) >= config.count) {
    const activeAE = ae || dyingAE;
    if (config.autoDisable !== false) {
      await activeAE.update({ disabled: true });
      console.log(`[FASERIP] ${actor.name}: ${effectId} auto-disabled (count exhausted)`);
    }
    return;
  }

  // Timer initialization
  let startedAt = config.startedAt;
  if (!Number.isFinite(startedAt)) {
    startedAt = worldTime - Math.abs(dt || 0);
    await actor.setFlag(scope, `ongoing.${effectId}.startedAt`, startedAt);
    console.log(`[FASERIP] ${actor.name}: ${effectId} timer started at ${startedAt}`);
  }

  // Cycle check
  const cycleSeconds = cycleToSeconds(config.rate || 1, config.cycle || "turn");
  const elapsed = worldTime - startedAt;
  if (elapsed < cycleSeconds) return;

  const cycles = Math.floor(elapsed / cycleSeconds);

  // ── Dying: delegate to processDyingRound ────────────────────────
  if (effectId === "dying") {
    for (let i = 0; i < cycles; i++) {
      const result = await processDyingRound(actor);
      if (result === "dead") break;
    }
    // Update timing state
    const newStartedAt = startedAt + (cycles * cycleSeconds);
    await actor.setFlag(scope, `ongoing.${effectId}`, {
      ...config,
      startedAt: newStartedAt,
      lastTriggered: worldTime,
      triggerCount: (config.triggerCount || 0) + cycles,
    });
    return;
  }

  // Resolve formula
  const rawAmount = resolveFormula(config.formula, actor, config);

  // Execute effect by type
  await executeEffect(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt);
}

async function executeEffect(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt) {
  const type = config.type || "heal";
  const stat = config.stat || "health";
  const effectName = ae.name.replace(/\s*\([^)]*\)\s*$/u, "").trim();

  if (type === "heal" && stat === "health") {
    await executeHealthHeal(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName);
  } else if (type === "damage" && stat === "health") {
    await executeHealthDamage(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName);
  } else if (type === "continuing-damage") {
    await executeContinuingDamage(actor, ae, effectId, config, cycles, worldTime, scope, cycleSeconds, startedAt, effectName);
  } else if (type === "stat.loss" && stat === "endurance") {
    await executeEnduranceLoss(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName);
  } else if (type === "stat.gain" && stat === "endurance") {
    await executeEnduranceGain(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName);
  } else {
    console.warn(`[FASERIP WARN] Unhandled ongoing type/stat: ${type}/${stat}`);
  }
}

// ─── Effect executors ─────────────────────────────────────────────────────────

async function executeHealthHeal(actor, ae, effectId, config, healPerCycle, cycles, worldTime, scope, cycleSeconds, startedAt, effectName) {
  const currentHP = actor.system?.attributes?.health?.value ?? 0;
  const maxHP = actor.system?.attributes?.health?.max ?? 0;

  // Already at max (or dead)
  if (currentHP <= 0) return;
  const cap = (config.capAtMax !== false) ? maxHP : Infinity;
  if (currentHP >= cap) {
    if (config.autoDisable !== false) {
      await ae.update({ disabled: true });
      await actor.setFlag(scope, `ongoing.${effectId}.startedAt`, null);
      await actor.setFlag(scope, `ongoing.${effectId}.autoDisabledAtCap`, true);
      console.log(`[FASERIP] ${actor.name}: ${effectName} auto-disabled (at cap)`);
    }
    return;
  }

  const totalHeal = Math.min(healPerCycle * cycles, cap - currentHP);
  const newHP = currentHP + totalHeal;

  await actor.update({ "system.attributes.health.value": newHP });

  // Update timer state
  const newStartedAt = startedAt + (cycles * cycleSeconds);
  const updates = {
    startedAt: newHP >= cap ? null : newStartedAt,
    lastTriggered: worldTime,
    triggerCount: (config.triggerCount || 0) + cycles,
  };
  if (config.oncePerDay) updates.lastTriggeredDate = _getGameDate();
  await actor.setFlag(scope, `ongoing.${effectId}`, { ...config, ...updates });

  // Auto-disable at cap
  if (newHP >= cap && config.autoDisable !== false) {
    await ae.update({ disabled: true });
  }

  const cycleNote = cycles > 1 ? ` (${cycles} cycles)` : "";
  const doneNote = newHP >= cap ? " — fully healed!" : "";
  const rateLabel = _rateLabel(config);

  await sendOngoingChat(actor, effectName, "heal",
    `<strong>${actor.name}</strong> healed <strong>${totalHeal} HP</strong>${cycleNote}${doneNote}
     <div style="margin-top:4px;font-size:0.9em;color:#555;">
       Health: ${currentHP} &rarr; ${newHP} / ${maxHP} &nbsp;|&nbsp; ${healPerCycle} HP per ${rateLabel}
     </div>`
  );

  console.log(`[FASERIP] ${actor.name}: ${effectName} healed ${totalHeal} HP (${cycles} cycle(s)), HP ${currentHP} → ${newHP}`);
}

async function executeHealthDamage(actor, ae, effectId, config, dmgPerCycle, cycles, worldTime, scope, cycleSeconds, startedAt, effectName) {
  const currentHP = actor.system?.attributes?.health?.value ?? 0;

  const totalDmg = dmgPerCycle * cycles;
  const newHP = Math.max(0, currentHP - totalDmg);

  await actor.update({ "system.attributes.health.value": newHP });

  // Update timer state
  const newStartedAt = startedAt + (cycles * cycleSeconds);
  const updates = {
    startedAt: newHP <= 0 ? null : newStartedAt,
    lastTriggered: worldTime,
    triggerCount: (config.triggerCount || 0) + cycles,
  };
  await actor.setFlag(scope, `ongoing.${effectId}`, { ...config, ...updates });

  if (newHP <= 0 && config.autoDisable !== false) {
    await ae.update({ disabled: true });
  }

  await sendOngoingChat(actor, effectName, "damage",
    `<strong>${actor.name}</strong> took <strong>${totalDmg} damage</strong>
     <div style="margin-top:4px;font-size:0.9em;color:#555;">
       Health: ${currentHP} &rarr; ${newHP}
     </div>`
  );

  console.log(`[FASERIP] ${actor.name}: ${effectName} dealt ${totalDmg} damage (${cycles} cycle(s)), HP ${currentHP} → ${newHP}`);
}

// ─── Continuing damage (schedule-driven, e.g. corrosive) ──────────────────────

function shiftRankByCS(rankName, deltaCS) {
  const idx = RANKS_ORDERED.indexOf(rankName);
  if (idx < 0) return rankName;
  const newIdx = Math.max(0, Math.min(RANKS_ORDERED.length - 1, idx + deltaCS));
  return RANKS_ORDERED[newIdx];
}

function rankToValue(rankName) {
  return game.msh?.getRankValue?.(rankName) ?? 0;
}

/**
 * Compute damage-per-round schedule.
 * @param {object} opts
 * @param {string} opts.pattern - "constant" | "diminishing-1cs" | "diminishing-2cs" | "custom"
 * @param {number} opts.rounds
 * @param {string} opts.initialRank - rank name (e.g. "Incredible")
 * @param {number[]} [opts.customSchedule]
 * @returns {number[]} damage value per round
 */
export function computeDamageSchedule({ pattern = "constant", rounds = 1, initialRank, customSchedule } = {}) {
  if (pattern === "custom" && Array.isArray(customSchedule)) {
    return customSchedule.slice(0, rounds);
  }
  const initial = rankToValue(initialRank);
  if (pattern === "constant") {
    return Array(Math.max(0, rounds)).fill(initial);
  }
  const stepCS = pattern === "diminishing-1cs" ? -1 : pattern === "diminishing-2cs" ? -2 : 0;
  if (stepCS === 0) return [initial];
  const out = [];
  for (let i = 0; i < rounds; i++) {
    out.push(rankToValue(shiftRankByCS(initialRank, stepCS * i)));
  }
  return out;
}

async function executeContinuingDamage(actor, ae, effectId, config, cycles, worldTime, scope, cycleSeconds, startedAt, effectName) {
  const schedule = Array.isArray(config.schedule) ? config.schedule : [];
  if (!schedule.length) return;

  const startTick = config.triggerCount || 0;
  let totalDmg = 0;
  let ticksApplied = 0;
  for (let i = 0; i < cycles; i++) {
    const tickIdx = startTick + i;
    if (tickIdx >= schedule.length) break;
    totalDmg += Number(schedule[tickIdx] || 0);
    ticksApplied++;
  }
  if (ticksApplied === 0) return;

  const currentHP = actor.system?.attributes?.health?.value ?? 0;
  const newHP = Math.max(0, currentHP - totalDmg);
  await actor.update({ "system.attributes.health.value": newHP });

  const newStartedAt = startedAt + (cycles * cycleSeconds);
  const newTriggerCount = startTick + ticksApplied;
  await actor.setFlag(scope, `ongoing.${effectId}`, {
    ...config,
    startedAt: newStartedAt,
    lastTriggered: worldTime,
    triggerCount: newTriggerCount,
  });

  const exhausted = newTriggerCount >= schedule.length;
  if (exhausted && config.autoDisable !== false) {
    await ae.update({ disabled: true });
  }

  const dmgType = config.damageType ? ` ${config.damageType}` : "";
  const remaining = schedule.length - newTriggerCount;
  const tail = exhausted
    ? `<div style="margin-top:4px;font-size:0.85em;color:#7a3d00;">Continuing damage exhausted.</div>`
    : `<div style="margin-top:4px;font-size:0.85em;color:#555;">Rounds remaining: ${remaining}</div>`;

  const washBtn = (!exhausted && config.canWash !== false)
    ? `<div style="margin-top:6px;text-align:right;">
         <button type="button" data-action="wash-continuing-damage"
                 data-actor-uuid="${actor.uuid}" data-effect-id="${effectId}"
                 style="font-size:11px;padding:3px 8px;background:#0277bd;color:#fff;border:none;border-radius:3px;cursor:pointer;">
           <i class="fas fa-tint"></i> Wash off
         </button>
       </div>`
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:#fff3e0;border:2px solid #e65100;padding:10px;border-radius:5px;">
      <div style="font-size:1.1em;font-weight:bold;color:#bf360c;margin-bottom:4px;">
        <i class="fas fa-flask"></i> ${effectName}
      </div>
      <div>
        <strong>${actor.name}</strong> took <strong>${totalDmg}${dmgType} damage</strong>
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Round ${newTriggerCount}/${schedule.length} | Health: ${currentHP} &rarr; ${newHP}
        </div>${tail}${washBtn}
      </div>
    </div>`
  });

  console.log(`[FASERIP] ${actor.name}: ${effectName} continuing-damage tick ${newTriggerCount}/${schedule.length} dealt ${totalDmg}, HP ${currentHP} → ${newHP}`);
}

async function executeEnduranceLoss(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName) {
  // Called by processOngoingEffects for worldTime-based stat.loss.
  // Dying uses processDyingRound() instead (combatOnly: true skips this).
  // This handles any future non-combat stat.loss effects (e.g. poison).
  const isRankStep = rawAmount === "1rank";

  if (isRankStep) {
    for (let i = 0; i < cycles; i++) {
      const currentRank = actor.system?.abilities?.endurance?.rank;
      if (!currentRank || currentRank === "Shift-0" || currentRank === "Shift0") {
        if (config.autoDisable !== false) await ae.update({ disabled: true });
        await sendOngoingChat(actor, effectName, "stat.loss",
          `<strong>${actor.name}</strong> has reached Shift-0 Endurance`
        );
        return;
      }
      // Per RAW: Health = F+A+S+E. When Endurance rank drops, BOTH current
      // and max health decrease by the rank-value delta. Mirrors the
      // processDyingRound logic so non-combat stat.loss (poison, Fatigue,
      // drain powers) affects HP consistently.
      const currentValue = actor.system?.abilities?.endurance?.value ?? 0;
      const newRank = stepEnduranceRank(actor, "down");
      const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
      const enduranceDelta = Math.max(0, currentValue - newValue);
      const currentHealth = actor.system?.attributes?.health?.value ?? 0;
      const newHealth = Math.max(0, currentHealth - enduranceDelta);
      await actor.update({
        "system.abilities.endurance.rank": newRank,
        "system.abilities.endurance.value": newValue,
        "system.attributes.health.value": newHealth,
        "system.attributes.health.max": _recalcMaxHealth(actor, newValue),
      });
      await sendOngoingChat(actor, effectName, "stat.loss",
        `<strong>${actor.name}</strong> lost 1 Endurance rank: now <strong>${newRank} (${newValue})</strong>
         <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${currentHealth} → ${newHealth} (−${enduranceDelta})</div>`
      );
    }
  } else {
    const currentVal = actor.system?.abilities?.endurance?.value ?? 0;
    const loss = (typeof rawAmount === "number" ? rawAmount : 0) * cycles;
    const newVal = Math.max(0, currentVal - loss);
    // Health tracks Endurance value 1:1 when the Endurance value changes
    // without crossing a rank boundary. Keep current HP within the new
    // max so max drops but current doesn't end up orphaned above it.
    const enduranceDelta = Math.max(0, currentVal - newVal);
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const newHealth = Math.max(0, currentHealth - enduranceDelta);
    const newMaxHealth = _recalcMaxHealth(actor, newVal);
    await actor.update({
      "system.abilities.endurance.value": newVal,
      "system.attributes.health.value": Math.min(newHealth, newMaxHealth),
      "system.attributes.health.max": newMaxHealth,
    });
  }

  const newStartedAt = startedAt + (cycles * cycleSeconds);
  await actor.setFlag(scope, `ongoing.${effectId}`, {
    ...config,
    startedAt: newStartedAt,
    lastTriggered: worldTime,
    triggerCount: (config.triggerCount || 0) + cycles,
  });
}

// ─── Dying: combat-round processor ────────────────────────────────────────────

/**
 * Process one round of dying for an actor.
 * Called from the updateCombat hook on round change.
 * Handles stabilization, Endurance rank loss, HP reduction,
 * Impaired Endurance effect, Shift-0 warning, death, and re-FEAT.
 *
 * @param {Actor} actor
 * @returns {string} "stepped" | "dead" | "stabilized" | "shift0-warning" | "none"
 */
export async function processDyingRound(actor) {
  if (!actor) return "none";
  const scope = SCOPE();

  // Find the dying AE (by ongoingId or legacy isDying flag)
  const dyingAE = actor.effects.find(e =>
    e.flags?.[scope]?.ongoingId === "dying" ||
    e.flags?.[scope]?.isDying ||
    e.statuses?.has?.("dying")
  );
  if (!dyingAE) return "none";

  // ── Already dead: clean up lingering dying AE and bail ─────────────────────
  if (actor.system?.details?.isDead || actor.system?.details?.isDeactivated) {
    console.log(`[FASERIP:DYING] ${actor.name} already dead/deactivated — cleaning up dying AE`);
    try { await dyingAE.delete({ mshIntentional: true }); } catch (_e) {}
    return "dead";
  }

  // ── Synchronous in-memory lock: prevents race between combatRound + CTT hooks ──
  const lockKey = actor.id;
  if (_dyingLocks.has(lockKey)) {
    return "none";
  }
  _dyingLocks.add(lockKey);

  try {
    return await _processDyingRoundInner(actor, dyingAE, scope);
  } finally {
    _dyingLocks.delete(lockKey);
  }
}

async function _processDyingRoundInner(actor, dyingAE, scope) {

  console.log(`[FASERIP:DYING] Processing dying for ${actor.name}`, {
    effectName: dyingAE.name,
    effectId: dyingAE.id,
  });

  // ── Stabilization pause ──────────────────────────────────────────
  const stabilizedRounds = dyingAE.getFlag(scope, "stabilizedRounds") || 0;
  if (stabilizedRounds > 0) {
    console.log(`[FASERIP:DYING] ${actor.name} is stabilized for ${stabilizedRounds} more round(s)`);
    await dyingAE.setFlag(scope, "stabilizedRounds", stabilizedRounds - 1);
    return "stabilized";
  }

  // ── Current endurance ────────────────────────────────────────────
  const curName = game.msh?.getEnduranceRankName?.(actor) ?? actor.system?.abilities?.endurance?.rank;
  const curValue = actor.system?.abilities?.endurance?.value ?? game.msh?.getRankValue?.(curName) ?? 0;

  // ── Already at Shift-0: death ────────────────────────────────────
  if (curName === "Shift-0") {
    console.warn(`[FASERIP WARN] ${actor.name} has died (below Shift-0)`);

    // Set isDead on both linked and unlinked actors
    try { await actor.update({ "system.details.isDead": true }); } catch(_e) {}

    // Clean up dying AE and flags
    await dyingAE.delete({ mshIntentional: true });
    const ongoingConfig = actor.getFlag(scope, "ongoing.dying");
    if (ongoingConfig) await actor.unsetFlag(scope, "ongoing.dying");

    // Remove unconscious effects
    const unconsciousEffects = actor.effects.filter(e =>
      e.statuses?.has?.("unconscious") || /unconscious/i.test(e.name)
    );
    if (unconsciousEffects.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", unconsciousEffects.map(e => e.id), { mshIntentional: true });
    }

    // Apply dead overlay
    await actor.toggleStatusEffect("dead", { active: true, overlay: true });

    await sendOngoingChat(actor, "Dying", "stat.loss",
      `<strong style="color:#b71c1c;">💀 ${actor.name} has died.</strong>`
    );

    // Ledger: terminal event — if off-scene thug dies, this closes the episode
    // and the Recovery Summary card emits via postRecoveryCard's terminal path
    // on the next rest-system routing call. Here we only log; no summary emit.
    try { await game.msh?.rest?.appendRecoveryLog?.(actor, {
      event: "dying-death",
      detail: null
    }); } catch (_e) { /* best-effort */ }

    return "dead";
  }

  // ── Step endurance down ──────────────────────────────────────────
  // Per rules: Health = F+A+S+E. When Endurance rank drops, both current and max Health
  // decrease by the difference in rank values.
  const nextName = game.msh?.nextLowerRankName?.(curName) ?? "Shift-0";
  const nextValue = game.msh?.getRankValue?.(nextName) ?? 0;
  const enduranceLoss = curValue - nextValue;
  const currentHealth = actor.system?.attributes?.health?.value ?? 0;
  const newHealth = Math.max(0, currentHealth - enduranceLoss);
  const newMaxHealth = _recalcMaxHealth(actor, nextValue);

  // Store original endurance on first dying tick
  let originalRank = dyingAE.getFlag(scope, "originalEndurance")
    || actor.getFlag(scope, "originalEndurance");
  if (!originalRank) {
    originalRank = curName;
    await actor.setFlag(scope, "originalEndurance", originalRank);
    await dyingAE.setFlag(scope, "originalEndurance", originalRank);
    console.log(`[FASERIP:DYING] Stored original Endurance for ${actor.name}: ${originalRank}`);
  }

  // Update Endurance rank + Health (current and max)
  try {
    await actor.update({
      "system.abilities.endurance.rank": nextName,
      "system.abilities.endurance.value": nextValue,
      "system.attributes.health.value": newHealth,
      "system.attributes.health.max": newMaxHealth,
    }, { mshDyingTick: true });
  } catch (err) {
    console.error(`[FASERIP ERROR] Failed to update ${actor.name}'s Endurance:`, err);
    return "none";
  }

  // ── Create / update Impaired Endurance effect ────────────────────
  // Per RAW: "-2CS on all actions until Endurance is restored to original."
  // Uses selfPenaltyCS which is summed into every FEAT roll (attacks,
  // defenses via check-action, ability FEATs). Setting attackShift alone
  // would only penalize attacks, letting the character defend and roll
  // ability FEATs at full rank — not RAW.
  let impairedEffect = actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
  if (!impairedEffect) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Impaired Endurance (${nextName} of ${originalRank})`,
      img: "icons/svg/blood.svg",
      origin: actor.uuid,
      statuses: ["impaired-endurance"],
      // v14: timeless effect needs duration.expiry set for the isTemporary
      // rule `!!duration.expiry || Number.isFinite(duration.value)` to
      // evaluate true; without it the token HUD badge does not render.
      // Effect persists until our healImpairedEndurance path removes it
      // rank-by-rank — no core auto-expiration.
      duration: { expiry: "roundEnd" },
      flags: {
        [scope]: {
          isImpairedEndurance: true,
          originalEndurance: originalRank,
          currentEndurance: nextName,
          lastHealed: game.time.worldTime,
          medicalCare: actor.getFlag(scope, "medicalCare") ?? false,
        },
      },
      changes: [{
        key: "system.combatMods.selfPenaltyCS",
        mode: "add",
        value: "-2",
      }],
    }]);
    console.log(`[FASERIP:DYING] Created Impaired Endurance effect for ${actor.name}`);
  } else {
    await impairedEffect.update({
      name: `Impaired Endurance (${nextName} of ${originalRank})`,
      [`flags.${scope}.currentEndurance`]: nextName,
    });
    console.log(`[FASERIP:DYING] Updated Impaired Endurance effect for ${actor.name}`);
  }

  // ── Update dying AE label ────────────────────────────────────────
  const turnsElapsed = (dyingAE.getFlag(scope, "turnsElapsed") || 0) + 1;
  try {
    await dyingAE.update({
      name: `Dying (${originalRank} → ${nextName}, ${turnsElapsed} rounds)`,
      [`flags.${scope}.currentTempRank`]: nextName,
      [`flags.${scope}.turnsElapsed`]: turnsElapsed,
    });
  } catch (err) {
    console.error(`[FASERIP ERROR] Failed to update Dying effect label:`, err);
  }

  // ── Chat message ─────────────────────────────────────────────────
  await sendOngoingChat(actor, "Dying", "stat.loss",
    `<strong>${actor.name}</strong> is dying — Endurance: ${curName} → ${nextName}
     <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${currentHealth} → ${newHealth} (−${enduranceLoss})</div>`
  );

  // ── Shift-0 warning ──────────────────────────────────────────────
  if (nextName === "Shift-0") {
    console.warn(`[FASERIP WARN] ${actor.name} has reached Shift-0 Endurance (will die next round if not stabilized)`);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div style="background:#fff3e0;border:1px solid #ff9800;padding:8px;border-radius:3px;color:#e65100;">
        <strong>⚠️ ${actor.name} has reached Shift-0 Endurance!</strong>
        <div style="font-size:0.9em;margin-top:4px;">Will die next round unless stabilized.</div>
      </div>`,
    });
    return "shift0-warning";
  }

  // ── Re-FEAT on slip (200 Karma flag) ─────────────────────────────
  const reFeat = dyingAE.getFlag(scope, "reFeatOnSlip");
  if (reFeat) {
    console.log(`[FASERIP:DYING] ${actor.name} gets re-FEAT on slip`);
    await dyingAE.setFlag(scope, "reFeatOnSlip", false);
    game.msh?.actions?.roll("endurance", { actor });
  }

  return "stepped";
}

async function executeEnduranceGain(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName) {
  // For impaired endurance healing: 1 rank per week/day
  const isRankStep = rawAmount === "1rank";

  if (isRankStep) {
    const originalEnd = config.originalEndurance || actor.system?.abilities?.endurance?.rank;
    const currentRank = actor.system?.abilities?.endurance?.rank;

    if (currentRank === originalEnd) {
      if (config.autoDisable !== false) {
        await ae.update({ disabled: true });
      }
      await sendOngoingChat(actor, effectName, "stat.gain",
        `<strong>${actor.name}</strong>'s Endurance fully restored — no more -2CS penalty!`
      );
      return;
    }

    // Step up 1 rank. Use the canonical RANKS_ORDERED so Class-ranked
    // characters (Class 1000+) can heal correctly and to avoid the legacy
    // "Shift X" (space) inconsistency. Clamp to originalEnd so RAW's
    // "cannot heal above pre-damage rank" is enforced.
    const { RANKS_ORDERED } = await import("../../rules/rules-reference.js");
    const curIdx = RANKS_ORDERED.findIndex(r => r === currentRank);
    const capIdx = RANKS_ORDERED.findIndex(r => r === originalEnd);
    const nextIdx = (curIdx >= 0 && curIdx < RANKS_ORDERED.length - 1) ? curIdx + 1 : curIdx;
    const clampedIdx = capIdx >= 0 ? Math.min(nextIdx, capIdx) : nextIdx;
    const newRank = RANKS_ORDERED[clampedIdx] ?? currentRank;
    const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
    const currentValue = actor.system?.abilities?.endurance?.value ?? 0;
    const enduranceDelta = Math.max(0, newValue - currentValue);

    // Restore max HP to match new Endurance, and add the delta to current HP
    // so healing Endurance actually restores health (per Health = F+A+S+E).
    const newMaxHealth = _recalcMaxHealth(actor, newValue);
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const newHealth = Math.min(newMaxHealth, currentHealth + enduranceDelta);

    await actor.update({
      "system.abilities.endurance.rank": newRank,
      "system.abilities.endurance.value": newValue,
      "system.attributes.health.value": newHealth,
      "system.attributes.health.max": newMaxHealth,
    });

    await sendOngoingChat(actor, effectName, "stat.gain",
      `<strong>${actor.name}</strong> healed 1 Endurance rank: now <strong>${newRank} (${newValue})</strong>
       <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${currentHealth} → ${newHealth} / ${newMaxHealth}</div>`
    );
  }

  const newStartedAt = startedAt + (cycles * cycleSeconds);
  await actor.setFlag(scope, `ongoing.${effectId}`, {
    ...config,
    startedAt: newStartedAt,
    lastTriggered: worldTime,
    triggerCount: (config.triggerCount || 0) + cycles,
  });
}

// ─── Damage interrupt handler ─────────────────────────────────────────────────

/**
 * Called by recordDamage() when an actor takes damage.
 * Interrupts all ongoing effects flagged with interruptOnDamage.
 * @param {Actor} actor
 */
export async function interruptOngoingEffects(actor) {
  const scope = SCOPE();
  const ongoingMap = actor.getFlag(scope, "ongoing");
  if (!ongoingMap) return;

  for (const [effectId, config] of Object.entries(ongoingMap)) {
    if (!config?.interruptOnDamage) continue;

    // Match the AE regardless of disabled state — we may need to flip
    // an auto-disabled (at-cap) effect back on, not just disable a
    // running one.
    const ae = actor.effects.find(e => e.flags?.[scope]?.ongoingId === effectId);
    if (!ae) continue;

    const effectName = ae.name.replace(/\s*\([^)]*\)\s*$/u, "").trim();

    if (ae.disabled) {
      // The engine disabled this at full health on a prior cycle. Fresh
      // damage drops HP below cap, so re-arm: enable the AE, clear the
      // timer (next worldTime tick will re-init), clear the cap flag.
      // No "interrupted!" chat — there was nothing running to interrupt.
      if (config.autoDisabledAtCap) {
        await ae.update({ disabled: false });
        await actor.setFlag(scope, `ongoing.${effectId}.startedAt`, null);
        await actor.setFlag(scope, `ongoing.${effectId}.autoDisabledAtCap`, false);
        console.log(`[FASERIP] ${effectName} re-armed for ${actor.name} — damage taken after at-cap auto-disable`);
      }
      // User-disabled (no autoDisabledAtCap flag): leave alone, respects intent.
      continue;
    }

    // Live cycle interrupted by damage — RAW rule: rest restarts.
    // Disable the AE so the engine skips it, null startedAt so a future
    // re-enable + tick restarts from zero.
    await ae.update({ disabled: true });
    await actor.setFlag(scope, `ongoing.${effectId}.startedAt`, null);

    await sendOngoingChat(actor, effectName, "damage",
      `<strong>${actor.name}</strong> took damage — <strong>${effectName}</strong> interrupted!`
    );

    console.log(`[FASERIP] ${effectName} disabled for ${actor.name} — took damage`);
  }
}

// ─── Effect registration helpers ──────────────────────────────────────────────

/**
 * Register an ongoing effect config on an actor and create its AE.
 * @param {Actor|Token} target
 * @param {string} effectId    - Unique key (e.g. "regeneration", "solarRegen", "dying")
 * @param {Object} config      - The ongoing config schema
 * @param {Object} aeOverrides - Override AE properties (name, img, changes, statuses, disabled)
 * @returns {ActiveEffect|null}
 */
export async function registerOngoingEffect(target, effectId, config, aeOverrides = {}) {
  const actor = target?.actor ?? target;
  if (!actor) return null;
  const scope = SCOPE();

  // Initialize runtime state
  const fullConfig = {
    type: "heal",
    stat: "health",
    formula: "@endurance",
    rate: 10,
    cycle: "turn",
    count: -1,
    gate: "none",
    gates: null,
    interruptOnDamage: false,
    oncePerDay: false,
    capAtMax: true,
    autoDisable: true,
    // Merge caller config
    ...config,
    // Runtime state (always reset on registration)
    startedAt: null,
    lastTriggered: null,
    triggerCount: 0,
  };

  // Store config on actor
  await safeActorSetFlag(actor, scope, `ongoing.${effectId}`, fullConfig);

  // Check for existing AE
  const existing = actor.effects.find(e => e.flags?.[scope]?.ongoingId === effectId);
  if (existing) {
    console.log(`[FASERIP] Ongoing AE "${effectId}" already exists on ${actor.name}`);
    return existing;
  }

  // Create AE
  const aeData = {
    name: aeOverrides.name || effectId,
    img: aeOverrides.img || "icons/svg/aura.svg",
    disabled: aeOverrides.disabled ?? true,
    changes: aeOverrides.changes || [],
    statuses: aeOverrides.statuses || [],
    flags: {
      [scope]: {
        effectType: "ongoing",
        ongoingId: effectId,
        ...(aeOverrides.extraFlags || {}),
      }
    },
    ...( aeOverrides.duration ? { duration: aeOverrides.duration } : {} ),
  };

  return applyEffect(actor, aeData);
}

/**
 * Remove an ongoing effect (both AE and actor flags).
 * @param {Actor} actor
 * @param {string} effectId
 */
export async function removeOngoingEffect(actor, effectId) {
  if (!actor) return;
  const scope = SCOPE();

  const ae = actor.effects.find(e => e.flags?.[scope]?.ongoingId === effectId);
  if (ae) await ae.delete({ mshIntentional: true });

  try {
    await actor.unsetFlag(scope, `ongoing.${effectId}`);
  } catch (_) { /* flag might not exist */ }
}

// ─── Convenience: apply specific power types ──────────────────────────────────

export async function applyRegenerationOngoing(target, { healAmount, cycleTurns = 10, powerRank, powerItemId } = {}) {
  const actor = target?.actor ?? target;
  const endValue = actor?.system?.abilities?.endurance?.value ?? 10;
  const heal = healAmount ?? endValue;

  const label = powerRank
    ? `Regeneration (${powerRank}: ${heal} HP)`
    : `Regeneration (${heal} HP)`;

  return registerOngoingEffect(actor, "regeneration", {
    type: "heal",
    stat: "health",
    formula: healAmount ? heal : "@endurance",
    rate: cycleTurns,
    cycle: "turn",
    count: -1,
    gate: "noDamage",
    interruptOnDamage: true,
    capAtMax: true,
    autoDisable: true,
    powerRankValue: powerRank ? (game.msh?.getRankValue?.(powerRank) ?? heal) : null,
    powerItemId: powerItemId || null,
  }, {
    name: label,
    img: "icons/svg/regen.svg",
    disabled: false,
    changes: [],
    statuses: ["regenerating"],
  });
}

export async function applySolarRegenerationOngoing(target, { powerRank, powerItemId, cycleTurns = 100 } = {}) {
  const actor = target?.actor ?? target;
  const powerValue = powerRank ? (game.msh?.getRankValue?.(powerRank) ?? 0) : (actor?.system?.abilities?.endurance?.value ?? 10);

  // Solar Regeneration: heals Power rank HP every 10 MINUTES in sunshine
  // 10 minutes = 100 turns at 6s/turn
  const label = `Solar Regeneration (${powerRank || "?"}: ${powerValue} HP)`;

  return registerOngoingEffect(actor, "solarRegeneration", {
    type: "heal",
    stat: "health",
    formula: "@powerRank",
    rate: cycleTurns,
    cycle: "turn",
    count: -1,
    gates: ["noDamage", "daylight"],
    interruptOnDamage: true,
    capAtMax: true,
    autoDisable: true,
    powerRankValue: powerValue,
    powerItemId: powerItemId || null,
  }, {
    name: label,
    img: "icons/svg/sun.svg",
    disabled: false,
    changes: [],
    statuses: ["regenerating"],
  });
}

export async function applyDyingOngoing(target, { skipImmediateLoss = false } = {}) {
  const actor = target?.actor ?? target;
  if (!actor) return null;

  const scope = SCOPE();

  // Prevent duplicate dying registrations
  const existingDying = actor.effects.find(e =>
    e.flags?.[scope]?.ongoingId === "dying" ||
    (e.flags?.[scope]?.isDying && !e.disabled)
  );
  if (existingDying) {
    console.log(`[FASERIP:DYING] ${actor.name} already has dying effect, skipping applyDyingOngoing`);
    return existingDying;
  }

  // Disable any existing Healing AE. Healing has `interruptOnDamage: false`
  // so interruptOngoingEffects leaves it alone — but a dying character must
  // not have an active hourly Healing timer. Defensive even though
  // ensureHealingEffect now refuses to register at 0 HP: handles the edge
  // where a Healing AE was registered prior to this tick (stale state).
  // Clearing startedAt forces a fresh timer when Healing is next re-registered.
  try {
    const healingAE = actor.effects.find(e =>
      e.flags?.[scope]?.ongoingId === "healing" && !e.disabled
    );
    if (healingAE) {
      await safeActorUpdateEffect(actor, healingAE.id, { disabled: true });
      await safeActorSetFlag(actor, scope, "ongoing.healing.startedAt", null);
      console.log(`[FASERIP:DYING] Disabled Healing AE on ${actor.name} (dying begins)`);
    }
  } catch (e) {
    console.warn(`[FASERIP WARN] Failed to disable Healing AE on dying ${actor.name}:`, e);
  }

  // Get current endurance info
  const currentEndurance = game.msh?.getEnduranceRankName?.(actor)
    ?? actor.system?.abilities?.endurance?.rank ?? "Unknown";
  const currentEnduranceValue = actor.system?.abilities?.endurance?.value ?? 10;

  // Store original endurance on actor flags for recovery reference
  const existingOriginal = actor.getFlag(scope, "originalEndurance");
  const originalEndurance = existingOriginal || currentEndurance;
  if (!existingOriginal) {
    await safeActorSetFlag(actor, scope, "originalEndurance", originalEndurance);
  }

  // ── Immediate first rank loss (per rules: dying = immediate Endurance reduction) ──
  let firstLossRank = currentEndurance;

  if (!skipImmediateLoss) {
    const nextRank = game.msh?.nextLowerRankName?.(currentEndurance) ?? "Shift-0";
    const nextValue = game.msh?.getRankValue?.(nextRank) ?? 0;
    const enduranceLoss = currentEnduranceValue - nextValue;
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const newHealth = Math.max(0, currentHealth - enduranceLoss);

    firstLossRank = nextRank;

    // Apply immediate Endurance + Health loss (Health = F+A+S+E)
    try {
      await safeActorUpdate(actor, {
        "system.abilities.endurance.rank": nextRank,
        "system.abilities.endurance.value": nextValue,
        "system.attributes.health.value": newHealth,
        "system.attributes.health.max": _recalcMaxHealth(actor, nextValue),
      }, { mshDyingTick: true });
    } catch (err) {
      console.error(`[FASERIP ERROR] Failed to apply immediate Endurance loss for ${actor.name}:`, err);
    }

    // Create Impaired Endurance effect. -2CS applies to ALL FEATs per RAW
    // (attacks, defenses, ability FEATs). Uses selfPenaltyCS, summed into
    // every FEAT roll. See the processDyingRound branch for the same fix.
    const impairedEffect = actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
    if (!impairedEffect) {
      await safeActorCreateEffect(actor, [{
        name: `Impaired Endurance (${nextRank} of ${originalEndurance})`,
        img: "icons/svg/blood.svg",
        origin: actor.uuid,
        statuses: ["impaired-endurance"],
        // v14 isTemporary rule — see the processDyingRound creation site.
        duration: { expiry: "roundEnd" },
        flags: {
          [scope]: {
            isImpairedEndurance: true,
            originalEndurance: originalEndurance,
            currentEndurance: nextRank,
            lastHealed: game.time.worldTime,
            medicalCare: actor.getFlag(scope, "medicalCare") ?? false,
          },
        },
        changes: [{
          key: "system.combatMods.selfPenaltyCS",
          mode: "add",
          value: "-2",
        }],
      }]);
    }

    // Chat message about immediate first loss
    await sendOngoingChat(actor, "Dying", "stat.loss",
      `<strong>${actor.name}</strong> begins dying — immediate Endurance loss: ${currentEndurance} → ${nextRank}
       <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${currentHealth} → ${newHealth} (−${enduranceLoss})</div>
       <div style="margin-top:4px;font-size:.85em;color:#c62828;">Will lose 1 Endurance rank per turn until stabilized.</div>
       <div style="margin-top:4px;font-size:.85em;color:#ff9800;">Impaired: -2CS to all actions until Endurance restored.</div>`
    );

    // Ledger: episode-start event (feeds Recovery Summary on terminal resolution)
    try { await game.msh?.rest?.appendRecoveryLog?.(actor, {
      event: "dying-start",
      detail: `${currentEndurance} → ${nextRank}, HP ${currentHealth}→${newHealth}`
    }); } catch (_e) { /* ledger is best-effort */ }

    console.log(`[FASERIP:DYING] ${actor.name} immediate Endurance loss: ${currentEndurance} (${currentEnduranceValue}) → ${nextRank} (${nextValue})`);
  }

  // Register ongoing effect (creates config + AE)
  // No duration — dying AE persists until death, stabilization, or aid removes it.
  return registerOngoingEffect(actor, "dying", {
    type: "stat.loss",
    stat: "endurance",
    formula: "1rank",
    rate: 1,
    cycle: "round",
    count: -1,
    gate: "none",
    interruptOnDamage: false,
    capAtMax: false,
    autoDisable: false,
    combatOnly: true,  // Processed by combatRound hook, not worldTime ticks
    originalEndurance,
    triggerCount: skipImmediateLoss ? 0 : 1,  // Track that first loss already happened
  }, {
    name: `Dying (${originalEndurance}${!skipImmediateLoss ? ` → ${firstLossRank}, 1 round` : ''})`,
    img: "icons/svg/skull.svg",
    disabled: false,
    statuses: ["dying"],
    changes: [
      { key: "system.combatMods.defenseShift", mode: "add", value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: "add", value: "-4", priority: 20 },
    ],
    extraFlags: {
      isDying: true,
      stabilizedRounds: 0,
      originalEndurance,
      enduranceBase: currentEnduranceValue,
      turnsElapsed: skipImmediateLoss ? 0 : 1,
    },
    // No duration — lifecycle managed by processDyingRound, not time-based expiry
  });
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function _getGameDate() {
  const mod = game.modules.get("calendar-time-tracker");
  const te = mod?.active ? (mod.api?.timeEngine ?? null) : null;
  if (te) {
    const ct = te.getCurrentTime?.();
    if (ct) return `${ct.year}-${ct.month}-${ct.day}`;
  }
  // No CTT: derive the day from Foundry worldTime, which is core and always
  // present. Falling back to the wall clock made "once per day" limits track
  // the real-world date, so advancing a week of game time never reset them
  // and a long real-world session reset them without any game time passing.
  const worldTime = Number(game.time?.worldTime);
  if (Number.isFinite(worldTime)) return `WT-${Math.floor(worldTime / 86400)}`;
  return new Date().toDateString();
}

function _rateLabel(config) {
  const rate = config.rate || 1;
  const cycle = config.cycle || "turn";
  if (rate === 1) return `1 ${cycle}`;
  return `${rate} ${cycle}s`;
}

function _recalcMaxHealth(actor, newEnduranceValue) {
  const f = actor.system?.abilities?.fighting?.value ?? 0;
  const a = actor.system?.abilities?.agility?.value ?? 0;
  const s = actor.system?.abilities?.strength?.value ?? 0;
  return f + a + s + newEnduranceValue;
}

// ─── Continuing damage convenience wrappers ───────────────────────────────────

/**
 * Register a continuing-damage ongoing effect on a target.
 * The initial-hit damage is NOT applied here — that's the attack's job.
 * This schedules subsequent rounds (typically rounds 2..N).
 *
 * @param {Actor|Token} target
 * @param {object} opts
 * @param {string} opts.name - Display name (e.g. "Corrosive Damage")
 * @param {string} opts.initialRank - Power rank for schedule generation
 * @param {string} [opts.pattern="constant"] - "constant" | "diminishing-1cs" | "diminishing-2cs" | "custom"
 * @param {number} [opts.rounds=3] - Total rounds the effect lasts (including initial if includeInitial)
 * @param {boolean} [opts.includeInitial=false] - If false, schedule starts at round 2 (initial hit already applied)
 * @param {number[]} [opts.customSchedule] - Explicit damage array (pattern="custom")
 * @param {boolean} [opts.canWash=true]
 * @param {string} [opts.damageType="physical"]
 * @param {string} [opts.originUuid=null]
 * @param {string} [opts.img="icons/svg/acid.svg"]
 * @param {string} [opts.effectId] - Custom effect id; auto-generated if omitted
 * @returns {Promise<ActiveEffect|null>}
 */
export async function applyContinuingDamage(target, {
  name = "Continuing Damage",
  initialRank,
  pattern = "constant",
  rounds = 3,
  includeInitial = false,
  customSchedule,
  canWash = true,
  damageType = "physical",
  originUuid = null,
  img = "icons/svg/acid.svg",
  effectId = null,
} = {}) {
  const actor = target?.actor ?? target;
  if (!actor || !initialRank) return null;

  let schedule = computeDamageSchedule({ pattern, rounds, initialRank, customSchedule });
  if (!includeInitial) {
    schedule = schedule.slice(1);
  }
  if (!schedule.length) return null;

  const id = effectId || `continuing-${foundry.utils.randomID(8)}`;

  return registerOngoingEffect(actor, id, {
    type: "continuing-damage",
    stat: "health",
    schedule,
    pattern,
    initialRank,
    rounds: schedule.length,
    canWash,
    damageType,
    rate: 1,
    cycle: "round",
    count: schedule.length,
    gate: "none",
    interruptOnDamage: false,
    autoDisable: true,
    originUuid,
  }, {
    name,
    img,
    disabled: false,
    duration: { rounds: schedule.length, expiry: "roundEnd" },
    extraFlags: {
      continuingDamage: true,
      canWash,
      schedule,
      damageType,
    }
  });
}

/**
 * Remove a continuing-damage effect early (wash off).
 * @param {Actor} actor
 * @param {string} effectId
 * @returns {Promise<boolean>} true if washed, false if not eligible or not found
 */
export async function washContinuingDamage(actor, effectId) {
  if (!actor) return false;
  const scope = SCOPE();
  const config = actor.getFlag(scope, `ongoing.${effectId}`);
  if (!config) return false;
  if (config.canWash === false) return false;
  await removeOngoingEffect(actor, effectId);
  return true;
}

/**
 * Find all wash-able continuing-damage effects on an actor.
 * @param {Actor} actor
 * @returns {{effectId: string, name: string, schedule: number[], damageType: string}[]}
 */
export function listContinuingDamageEffects(actor) {
  if (!actor) return [];
  const scope = SCOPE();
  const map = actor.getFlag(scope, "ongoing") || {};
  const results = [];
  for (const [id, cfg] of Object.entries(map)) {
    if (cfg?.type === "continuing-damage") {
      const ae = actor.effects.find(e => e.flags?.[scope]?.ongoingId === id);
      results.push({
        effectId: id,
        name: ae?.name || cfg.name || "Continuing Damage",
        schedule: cfg.schedule || [],
        damageType: cfg.damageType || "physical",
        canWash: cfg.canWash !== false,
        triggerCount: cfg.triggerCount || 0,
      });
    }
  }
  return results;
}

// ─── Absorption temp HP cliff decay ──────────────────────────────────────────
// RAW: extra Health dissipates in 10 rounds. Cliff implementation: schedule a
// single HP-loss trigger at round+10 that strips the granted amount. Multiple
// absorption events stack additively into a single ledger keyed by source AE.
// On trigger, the engine subtracts the recorded amount from current HP (clamped
// at 0). The AE is auto-disabled when ledger drains. Per-source so independent
// absorptions decay on their own clocks.

export async function applyAbsorptionTempHPOngoing(target, { amount, expiresInRounds = 10, sourceAeId = null } = {}) {
  const actor = target?.actor ?? target;
  if (!actor || !(amount > 0)) return null;

  const effectId = sourceAeId
    ? `absorptionTemp.${sourceAeId}`
    : `absorptionTemp.${foundry.utils.randomID()}`;

  return registerOngoingEffect(actor, effectId, {
    type: "stat.loss",
    stat: "health",
    formula: amount,
    rate: expiresInRounds,
    cycle: "round",
    count: 1,
    gate: "none",
    interruptOnDamage: false,
    capAtMax: false,
    autoDisable: true,
    sourceAeId,
  }, {
    name: `Absorption Temp HP (${amount}, ${expiresInRounds}r)`,
    img: "icons/svg/aura.svg",
    disabled: false,
    changes: [],
    statuses: ["absorption-temp"],
  });
}

// ─── Endurance rank restoration (one-shot helper) ────────────────────────────
// Performs a single rank-step on the actor's Endurance, clamped to a cap
// (defaults to actor's originalEndurance flag, then current rank as floor).
// Recalculates max Health (F+A+S+E) and adds the delta to current HP so
// healing Endurance restores Health per RAW.
//
// Returns { restored: boolean, oldRank, newRank, atCap, reason }.

export async function restoreOneEnduranceRank(actor, { originalRankCap = null, source = "" } = {}) {
  if (!actor) return { restored: false, reason: "no-actor" };

  const scope = SCOPE();
  const cap = originalRankCap
    || actor.getFlag(scope, "originalEndurance")
    || actor.system?.abilities?.endurance?.rank;

  const currentRank = actor.system?.abilities?.endurance?.rank;
  if (!currentRank) return { restored: false, reason: "no-current-rank" };
  if (currentRank === cap) return { restored: false, atCap: true, oldRank: currentRank, newRank: currentRank };

  const curIdx = RANKS_ORDERED.findIndex(r => r === currentRank);
  const capIdx = RANKS_ORDERED.findIndex(r => r === cap);
  if (curIdx < 0) return { restored: false, reason: "rank-not-in-order" };

  const nextIdx = Math.min(curIdx + 1, capIdx >= 0 ? capIdx : curIdx + 1);
  const newRank = RANKS_ORDERED[nextIdx] ?? currentRank;
  if (newRank === currentRank) return { restored: false, atCap: true, oldRank: currentRank, newRank };

  const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
  const currentValue = actor.system?.abilities?.endurance?.value ?? 0;
  const enduranceDelta = Math.max(0, newValue - currentValue);

  const newMaxHealth = _recalcMaxHealth(actor, newValue);
  const currentHealth = actor.system?.attributes?.health?.value ?? 0;
  const newHealth = Math.min(newMaxHealth, currentHealth + enduranceDelta);

  await actor.update({
    "system.abilities.endurance.rank": newRank,
    "system.abilities.endurance.value": newValue,
    "system.attributes.health.value": newHealth,
    "system.attributes.health.max": newMaxHealth,
  });

  const sourceLabel = source ? ` (${source})` : "";
  await sendOngoingChat(actor, `Endurance Restored${sourceLabel}`, "stat.gain",
    `<strong>${actor.name}</strong> restored 1 Endurance rank: <strong>${currentRank}</strong> &rarr; <strong>${newRank} (${newValue})</strong>
     <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${currentHealth} &rarr; ${newHealth} / ${newMaxHealth}</div>`
  );

  return { restored: true, oldRank: currentRank, newRank, atCap: newRank === cap };
}

// One-shot Endurance rank LOSS — mirror of restoreOneEnduranceRank.
// Reduces current End rank by one step. Recalculates max Health and subtracts
// the delta from current HP (clamped at 0). Returns { lost, oldRank, newRank,
// belowFeeble } so caller can detect the RAW "below Feeble = healer dies"
// case. Does NOT trigger the dying pipeline — caller decides what to do at
// Shift-0.

export async function loseOneEnduranceRank(actor, { source = "" } = {}) {
  if (!actor) return { lost: false, reason: "no-actor" };

  const currentRank = actor.system?.abilities?.endurance?.rank;
  if (!currentRank) return { lost: false, reason: "no-current-rank" };

  const curIdx = RANKS_ORDERED.findIndex(r => r === currentRank);
  if (curIdx < 0) return { lost: false, reason: "rank-not-in-order" };
  if (curIdx === 0) return { lost: false, atFloor: true, oldRank: currentRank, newRank: currentRank };

  const newRank = RANKS_ORDERED[curIdx - 1];
  const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
  const currentValue = actor.system?.abilities?.endurance?.value ?? 0;
  const enduranceDelta = Math.max(0, currentValue - newValue);

  const newMaxHealth = _recalcMaxHealth(actor, newValue);
  const currentHealth = actor.system?.attributes?.health?.value ?? 0;
  const newHealth = Math.max(0, Math.min(newMaxHealth, currentHealth - enduranceDelta));

  await actor.update({
    "system.abilities.endurance.rank": newRank,
    "system.abilities.endurance.value": newValue,
    "system.attributes.health.value": newHealth,
    "system.attributes.health.max": newMaxHealth,
  });

  const sourceLabel = source ? ` (${source})` : "";
  await sendOngoingChat(actor, `Endurance Loss${sourceLabel}`, "stat.loss",
    `<strong>${actor.name}</strong> lost 1 Endurance rank: <strong>${currentRank}</strong> &rarr; <strong>${newRank} (${newValue})</strong>
     <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${currentHealth} &rarr; ${newHealth} / ${newMaxHealth}</div>`
  );

  return { lost: true, oldRank: currentRank, newRank, belowFeeble: newRank === "Shift-0" };
}

// Expose game-date helper for action handlers that need oncePerDay gating.
export function getCurrentGameDate() {
  return _getGameDate();
}