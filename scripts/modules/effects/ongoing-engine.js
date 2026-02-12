// scripts/modules/effects/ongoing-engine.js v1.1.1 - 2026-02-11
// v1.1.1: Add combat round gate — during active combat, dying endurance loss fires once
//         per Foundry round (matching RAW: 1 FASERIP turn = 1 Foundry round), not per
//         Foundry turn (which is just resolution order within the 6-second turn).
// v1.1.0: Full dying implementation — immediate first rank loss, impaired endurance AE,
//         stabilization pause, Shift-0 death handling, 200-Karma re-FEAT, combat mods,
//         isDying compat flag. Shared ensureImpairedEndurance helper.
// v1.0.0: Core engine with Regeneration, Solar Regeneration support.
// Generic periodic effect engine for FASERIP.
// Handles Regeneration, Solar Regeneration, Recovery, Dying, Absorption decay,
// Corrosive damage, and any future timed effects via a declarative config schema.

import { getAllTokenActors, applyEffect } from "./effect-engine.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

const AE_MODES = { MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 };

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
     // Dying-specific (only for effectId "dying"):
     originalEndurance: "Good",   // rank before dying began
     fromZeroHealth:    true,     // true = unconscious dying, false = conscious dying
     stabilizedRounds:  0,        // 50-Karma pause: skip N cycles
     reFeatOnSlip:      false,    // 200-Karma: trigger re-FEAT on next rank loss
     turnsElapsed:      0,        // total rank losses so far (for AE label)
     lastProcessedRound: 0,      // combat round gate: last Foundry round processed
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
      // Must not have taken damage since timer started
      const scope = SCOPE();
      const lastDmgWT = actor.getFlag(scope, "lastDamageWorldTime");
      const startedAt = _config?.startedAt;
      if (!Number.isFinite(lastDmgWT) || !Number.isFinite(startedAt)) return true;
      return lastDmgWT < startedAt;
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
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:${style.bg};border:2px solid ${style.border};padding:10px;border-radius:5px;">
      <div style="font-size:1.1em;font-weight:bold;color:${style.color};margin-bottom:4px;">
        <i class="fas ${style.icon}"></i> ${effectName}
      </div>
      <div>${detail}</div>
    </div>`,
  });
}

// ─── Stat loss/gain (Endurance rank stepping) ─────────────────────────────────

function stepEnduranceRank(actor, direction) {
  const current = actor.system?.abilities?.endurance?.rank;
  if (!current) return null;

  if (direction === "down") {
    return game.msh?.nextLowerRankName?.(current) ?? "Shift-0";
  }
  // "up" — would need nextHigherRankName, but dying only goes down
  // For future stat.gain: walk RANK_ORDER up
  return current;
}

// ─── Shared helpers: Impaired Endurance & Death ─────────────────────────────

async function ensureImpairedEndurance(actor, newRank, originalRank, scope) {
  const hasMedicalCare = actor.getFlag(scope, "medicalCare") ?? false;
  const daysUntilHealing = hasMedicalCare ? 1 : 7;

  let impaired = actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));

  if (!impaired) {
    const aeData = {
      name: `Impaired Endurance (${newRank} of ${originalRank})`,
      img: "icons/svg/blood.svg",
      origin: actor.uuid,
      statuses: ["impaired-endurance"],
      flags: {
        [scope]: {
          isImpairedEndurance: true,
          originalEndurance: originalRank,
          currentEndurance: newRank,
          lastHealed: Date.now(),
          medicalCare: hasMedicalCare
        },
        core: { statusId: "impaired-endurance" }
      },
      duration: {
        rounds: daysUntilHealing * 600 * 24,
        startRound: game.combat?.round || 0
      },
      changes: [{ key: "system.columnShift", mode: AE_MODES.ADD, value: "-2" }]
    };

    if (game.user.isGM || actor.isOwner) {
      await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
    } else {
      try {
        const { runAsGM } = await import("../../gm-utils.js");
        await runAsGM({
          operation: "createEmbeddedDocuments",
          targetActorUuid: actor.uuid,
          args: ["ActiveEffect", [aeData]]
        });
      } catch (e) {
        console.error("[FASERIP ERROR] ensureImpairedEndurance: runAsGM failed", e);
      }
    }
    console.log(`[FASERIP:DYING] Created Impaired Endurance for ${actor.name}: ${newRank} of ${originalRank}`);
  } else {
    await impaired.update({
      name: `Impaired Endurance (${newRank} of ${originalRank})`,
      [`flags.${scope}.currentEndurance`]: newRank
    });
    console.log(`[FASERIP:DYING] Updated Impaired Endurance for ${actor.name}: ${newRank} of ${originalRank}`);
  }
}

async function handleDeath(actor, ae, effectId, scope) {
  console.warn(`[FASERIP:DYING] ${actor.name} has died (below Shift-0)`);

  // Set isDead on linked actors only (unlinked tokens share a base actor)
  if (!actor.isToken || actor.prototypeToken?.actorLink) {
    try {
      await actor.update({ "system.details.isDead": true });
    } catch (e) {
      console.error("[FASERIP ERROR] handleDeath: failed to set isDead", e);
    }
  }

  // Remove the ongoing dying effect (AE + flags)
  if (ae) {
    try { await ae.delete(); } catch (_) {}
  }
  try {
    await actor.unsetFlag(scope, `ongoing.${effectId}`);
  } catch (_) {}

  // Remove any Unconscious effects from dead character
  const unconsciousEffects = actor.effects.filter(e =>
    e.statuses?.has?.("unconscious") || /unconscious/i.test(e.name)
  );
  if (unconsciousEffects.length) {
    try {
      await actor.deleteEmbeddedDocuments("ActiveEffect", unconsciousEffects.map(e => e.id));
      console.log(`[FASERIP:DYING] Removed ${unconsciousEffects.length} unconscious effect(s) from dead ${actor.name}`);
    } catch (_) {}
  }

  // Apply dead status overlay
  try {
    await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  } catch (e) {
    console.error("[FASERIP ERROR] handleDeath: failed to toggle dead status", e);
  }

  await sendOngoingChat(actor, "Death", "stat.loss",
    `<div style="text-align:center;font-size:1.2em;font-weight:bold;color:#b71c1c;">
      ${actor.name} has died.
    </div>`
  );
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

  for (const actor of getAllTokenActors()) {
    const ongoingMap = actor.getFlag(scope, "ongoing");
    if (!ongoingMap || typeof ongoingMap !== "object") continue;

    for (const [effectId, config] of Object.entries(ongoingMap)) {
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
  // Find corresponding AE — must be enabled
  const ae = actor.effects.find(e =>
    e.flags?.[scope]?.ongoingId === effectId && !e.disabled
  );
  if (!ae) return;

  // Once-per-day check
  if (config.oncePerDay) {
    const lastDate = config.lastTriggeredDate;
    // Use CTT calendar date if available, else real date
    const today = _getGameDate();
    if (lastDate === today) return;
  }

  // Gate checks
  if (!checkAllGates(config, actor)) return;

  // Count limit
  if (config.count > 0 && (config.triggerCount || 0) >= config.count) {
    if (config.autoDisable !== false) {
      await ae.update({ disabled: true });
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

async function executeEnduranceLoss(actor, ae, effectId, config, rawAmount, cycles, worldTime, scope, cycleSeconds, startedAt, effectName) {
  const isRankStep = rawAmount === "1rank";

  // ── Combat round gate ──
  // During active combat, worldTime advances 6s per Foundry turn, but a FASERIP
  // "turn" is one full Foundry round (all combatants act simultaneously in 6s).
  // Only process dying once per Foundry round to match RAW timing.
  if (game.combat?.active && isRankStep) {
    const currentRound = game.combat.round;
    const lastRound = config.lastProcessedRound ?? 0;
    if (currentRound <= lastRound) {
      // Already processed this round — just bump the timer forward
      const newStartedAt = startedAt + (cycles * cycleSeconds);
      await actor.setFlag(scope, `ongoing.${effectId}.startedAt`, newStartedAt);
      return;
    }
    // Record that we're processing this round
    await actor.setFlag(scope, `ongoing.${effectId}.lastProcessedRound`, currentRound);
  }

  // ── Stabilization pause (50 Karma: skip 1 cycle) ──
  const stabilized = config.stabilizedRounds || 0;
  if (stabilized > 0) {
    const newStabilized = stabilized - 1;
    const newStartedAt = startedAt + (cycles * cycleSeconds);
    await actor.setFlag(scope, `ongoing.${effectId}`, {
      ...config,
      stabilizedRounds: newStabilized,
      startedAt: newStartedAt,
      lastTriggered: worldTime,
    });
    console.log(`[FASERIP:DYING] ${actor.name} stabilized for ${stabilized} round(s), ${newStabilized} remaining`);
    return;
  }

  if (isRankStep) {
    // Process one rank step per cycle. For multi-cycle catch-up, loop.
    // In practice dying processes 1 cycle at a time (rate=1, cycle=turn).
    for (let i = 0; i < cycles; i++) {
      const currentRank = actor.system?.abilities?.endurance?.rank;
      const currentValue = actor.system?.abilities?.endurance?.value
        ?? game.msh?.getRankValue?.(currentRank) ?? 0;

      // ── Already at Shift-0: DEATH ──
      if (!currentRank || currentRank === "Shift-0" || currentRank === "Shift0") {
        await handleDeath(actor, ae, effectId, scope);
        return;
      }

      // ── Step down 1 rank ──
      const newRank = stepEnduranceRank(actor, "down");
      const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
      const enduranceLoss = currentValue - newValue;
      const currentHealth = actor.system?.attributes?.health?.value ?? 0;
      const newHealth = Math.max(0, currentHealth - enduranceLoss);
      const newMaxHealth = _recalcMaxHealth(actor, newValue);

      await actor.update({
        "system.abilities.endurance.rank": newRank,
        "system.abilities.endurance.value": newValue,
        "system.attributes.health.value": newHealth,
        "system.attributes.health.max": newMaxHealth,
      });

      // ── Impaired Endurance AE ──
      const originalRank = config.originalEndurance || actor.getFlag(scope, "originalEndurance") || currentRank;
      await ensureImpairedEndurance(actor, newRank, originalRank, scope);

      // ── Update dying AE label + turnsElapsed ──
      const turnsElapsed = (config.turnsElapsed || 0) + i + 1;
      try {
        await ae.update({
          name: `Dying (${originalRank} → ${newRank}, ${turnsElapsed} turns)`,
          [`flags.${scope}.currentTempRank`]: newRank,
          [`flags.${scope}.turnsElapsed`]: turnsElapsed,
        });
      } catch (_) {}

      // ── Chat message ──
      if (newRank === "Shift-0" || newRank === "Shift0") {
        // Just reached Shift-0 — warning, not death yet (they get 1 round to be saved)
        await sendOngoingChat(actor, effectName, "stat.loss",
          `<strong>${actor.name}</strong> lost 1 Endurance rank: now <strong>${newRank} (${newValue})</strong>
           <div style="margin-top:4px;font-size:0.9em;color:#666;">Health: ${currentHealth} &rarr; ${newHealth} (&minus;${enduranceLoss})</div>
           <div style="margin-top:6px;padding:6px;border-radius:3px;background:#fff3e0;border:1px solid #ff9800;color:#e65100;font-weight:bold;">
             ${actor.name} has reached Shift-0 Endurance! Will die next round unless stabilized.
           </div>`
        );
        console.warn(`[FASERIP:DYING] ${actor.name} reached Shift-0 — will die next round if not stabilized`);
      } else {
        await sendOngoingChat(actor, effectName, "stat.loss",
          `<strong>${actor.name}</strong> lost 1 Endurance rank: now <strong>${newRank} (${newValue})</strong>
           <div style="margin-top:4px;font-size:0.9em;color:#555;">
             Health: ${currentHealth} &rarr; ${newHealth} (&minus;${enduranceLoss})
           </div>
           <div style="margin-top:4px;font-size:0.9em;color:#555;">
             Endurance loss continues each turn until stabilized or Shift-0 (death)
           </div>`
        );
      }

      console.log(`[FASERIP:DYING] ${actor.name}: Endurance ${currentRank} (${currentValue}) → ${newRank} (${newValue}), Health ${currentHealth} → ${newHealth}`);

      // ── 200-Karma re-FEAT on slip ──
      if (config.reFeatOnSlip) {
        console.log(`[FASERIP:DYING] ${actor.name} gets re-FEAT on slip`);
        // Clear the flag before triggering
        await actor.setFlag(scope, `ongoing.${effectId}.reFeatOnSlip`, false);
        config.reFeatOnSlip = false;
        game.msh?.openUniversalTableDialog?.(actor, { mode: "death-save" });
      }
    }
  } else {
    // Flat numeric loss (non-dying use case)
    const currentVal = actor.system?.abilities?.endurance?.value ?? 0;
    const loss = (typeof rawAmount === "number" ? rawAmount : 0) * cycles;
    const newVal = Math.max(0, currentVal - loss);
    await actor.update({ "system.abilities.endurance.value": newVal });
  }

  // ── Update timer state ──
  const newStartedAt = startedAt + (cycles * cycleSeconds);
  await actor.setFlag(scope, `ongoing.${effectId}`, {
    ...config,
    startedAt: newStartedAt,
    lastTriggered: worldTime,
    triggerCount: (config.triggerCount || 0) + cycles,
    turnsElapsed: (config.turnsElapsed || 0) + cycles,
  });
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

    // Step up 1 rank (reverse of stepDown)
    // For now just use the RANK_ORDER to go up
    const rankOrder = ["Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift X", "Shift Y", "Shift Z"];
    const idx = rankOrder.findIndex(r => r === currentRank);
    const newRank = idx >= 0 && idx < rankOrder.length - 1 ? rankOrder[idx + 1] : currentRank;
    const newValue = game.msh?.getRankValue?.(newRank) ?? 0;

    await actor.update({
      "system.abilities.endurance.rank": newRank,
      "system.abilities.endurance.value": newValue,
    });

    await sendOngoingChat(actor, effectName, "stat.gain",
      `<strong>${actor.name}</strong> healed 1 Endurance rank: now <strong>${newRank} (${newValue})</strong>`
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

    // Find and disable the AE
    const ae = actor.effects.find(e =>
      e.flags?.[scope]?.ongoingId === effectId && !e.disabled
    );
    if (!ae) continue;

    await ae.update({ disabled: true });
    await actor.setFlag(scope, `ongoing.${effectId}.startedAt`, null);

    const effectName = ae.name.replace(/\s*\([^)]*\)\s*$/u, "").trim();
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
  await actor.setFlag(scope, `ongoing.${effectId}`, fullConfig);

  // Check for existing AE
  const existing = actor.effects.find(e => e.flags?.[scope]?.ongoingId === effectId);
  if (existing) {
    console.log(`[FASERIP] Ongoing AE "${effectId}" already exists on ${actor.name}`);
    return existing;
  }

  // Create AE
  const extraFlags = aeOverrides.extraFlags || {};
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
        ...extraFlags,
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
  if (ae) await ae.delete();

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
    disabled: true,
    changes: [
      { key: "system.combatMods.canAct", mode: AE_MODES.OVERRIDE, value: "false", priority: 20 },
      { key: "system.combatMods.canMove", mode: AE_MODES.OVERRIDE, value: "false", priority: 20 },
    ],
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
    disabled: true,
    changes: [
      { key: "system.combatMods.canAct", mode: AE_MODES.OVERRIDE, value: "false", priority: 20 },
      { key: "system.combatMods.canMove", mode: AE_MODES.OVERRIDE, value: "false", priority: 20 },
    ],
    statuses: ["regenerating"],
  });
}

/**
 * Register dying as an ongoing effect. Applies the immediate first rank loss
 * per rules ("Endurance is reduced by one rank"), then the engine handles
 * subsequent per-turn losses via executeEnduranceLoss.
 *
 * NOTE: Timing difference from legacy init.js updateCombat hook —
 *   Legacy: processed once per Foundry combat ROUND change.
 *   Ongoing engine: processes every 6s of worldTime (once per Foundry turn change).
 *   The ongoing engine behavior matches RAW ("one rank per turn").
 *   If this proves too aggressive, add a combat-round gate in executeEnduranceLoss.
 *
 * @param {Actor|Token} target
 * @param {Object} [opts]
 * @param {boolean} [opts.fromZeroHealth=true] - true = unconscious dying, false = conscious (Kill result)
 * @returns {ActiveEffect|null}
 */
export async function applyDyingOngoing(target, opts = {}) {
  const actor = target?.actor ?? target;
  if (!actor) return null;
  const scope = SCOPE();
  const fromZeroHealth = opts.fromZeroHealth ?? true;

  // ── Store original endurance (only first time) ──
  const currentRank = actor.system?.abilities?.endurance?.rank || "Typical";
  const currentValue = actor.system?.abilities?.endurance?.value
    ?? game.msh?.getRankValue?.(currentRank) ?? 10;
  const existingOriginal = actor.getFlag(scope, "originalEndurance");
  if (!existingOriginal) {
    await actor.setFlag(scope, "originalEndurance", currentRank);
  }
  const originalRank = existingOriginal || currentRank;

  // ── Remove any existing legacy dying AEs (dedup) ──
  const legacyDying = actor.effects.filter(e =>
    e.getFlag(scope, "isDying") || (e.flags?.[scope]?.ongoingId === "dying")
  );
  if (legacyDying.length) {
    try {
      await actor.deleteEmbeddedDocuments("ActiveEffect", legacyDying.map(e => e.id));
    } catch (_) {}
    try {
      await actor.unsetFlag(scope, "ongoing.dying");
    } catch (_) {}
  }

  // ── Immediate first rank loss (per rules) ──
  let nextRank = currentRank;
  let nextValue = currentValue;
  let enduranceLoss = 0;
  let immediateHealthBefore = actor.system?.attributes?.health?.value ?? 0;
  let immediateHealthAfter = immediateHealthBefore;

  if (currentRank !== "Shift-0" && currentRank !== "Shift0") {
    nextRank = game.msh?.nextLowerRankName?.(currentRank) ?? "Shift-0";
    nextValue = game.msh?.getRankValue?.(nextRank) ?? 0;
    enduranceLoss = currentValue - nextValue;
    immediateHealthAfter = Math.max(0, immediateHealthBefore - enduranceLoss);
    const newMaxHealth = _recalcMaxHealth(actor, nextValue);

    try {
      if (game.user.isGM || actor.isOwner) {
        await actor.update({
          "system.abilities.endurance.rank": nextRank,
          "system.abilities.endurance.value": nextValue,
          "system.attributes.health.value": immediateHealthAfter,
          "system.attributes.health.max": newMaxHealth,
        });
      } else {
        const { runAsGM } = await import("../../gm-utils.js");
        await runAsGM({
          operation: "update",
          targetActorUuid: actor.uuid,
          args: [{
            "system.abilities.endurance.rank": nextRank,
            "system.abilities.endurance.value": nextValue,
            "system.attributes.health.value": immediateHealthAfter,
            "system.attributes.health.max": newMaxHealth,
          }]
        });
      }

      // Create Impaired Endurance AE
      await ensureImpairedEndurance(actor, nextRank, originalRank, scope);

      // Chat message: immediate loss
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
          <strong>${actor.name}</strong> begins dying — immediate Endurance loss: ${currentRank} → ${nextRank}
          <div style="margin-top:4px;font-size:.9em;color:#666;">Health: ${immediateHealthBefore} → ${immediateHealthAfter} (−${enduranceLoss})</div>
          <div style="margin-top:4px;font-size:.85em;color:#c62828;">Will continue to lose 1 Endurance rank per turn until stabilized.</div>
          <div style="margin-top:4px;font-size:.85em;color:#ff9800;">Impaired: -2CS to all actions until Endurance restored.</div>
        </div>`
      });

      console.log(`[FASERIP:DYING] ${actor.name} IMMEDIATE loss: ${currentRank} (${currentValue}) → ${nextRank} (${nextValue}), Health ${immediateHealthBefore} → ${immediateHealthAfter}`);
    } catch (err) {
      console.error(`[FASERIP ERROR] applyDyingOngoing: immediate rank loss failed for ${actor.name}:`, err);
    }
  }

  // ── Register the ongoing effect ──
  return registerOngoingEffect(actor, "dying", {
    type: "stat.loss",
    stat: "endurance",
    formula: "1rank",
    rate: 1,
    cycle: "turn",
    count: -1,
    gate: "none",
    interruptOnDamage: false,
    capAtMax: false,
    autoDisable: false,
    // Dying-specific state
    originalEndurance: originalRank,
    fromZeroHealth,
    stabilizedRounds: 0,
    reFeatOnSlip: false,
    turnsElapsed: 1,  // Immediate first loss already processed
    lastProcessedRound: game.combat?.round ?? 0,  // Gate: don't re-process this round
  }, {
    name: `Dying (${originalRank} → ${nextRank})`,
    img: "icons/svg/skull.svg",
    disabled: false,
    changes: [
      { key: "system.combatMods.defenseShift", mode: AE_MODES.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.defenseShiftRanged", mode: AE_MODES.ADD, value: "-4", priority: 20 },
      { key: "system.combatMods.movementMult", mode: AE_MODES.OVERRIDE, value: "0", priority: 50 },
      { key: "system.combatMods.canAct", mode: AE_MODES.OVERRIDE, value: "false", priority: 50 },
      { key: "system.combatMods.canMove", mode: AE_MODES.OVERRIDE, value: "false", priority: 50 },
    ],
    statuses: ["dying"],
    // Backward compat: consumers check getFlag("isDying") || statuses.has("dying")
    extraFlags: {
      isDying: true,
      zeroHealth: fromZeroHealth,
      originalEndurance: originalRank,
      turnsElapsed: 1,
    },
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