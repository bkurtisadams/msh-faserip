// scripts/modules/effects/ongoing-engine.js v1.0.0 - 2026-02-10
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
  // rawAmount should be "1rank" for dying
  const isRankStep = rawAmount === "1rank";

  if (isRankStep) {
    // Step down 1 rank per cycle
    for (let i = 0; i < cycles; i++) {
      const currentRank = actor.system?.abilities?.endurance?.rank;
      if (!currentRank || currentRank === "Shift-0" || currentRank === "Shift0") {
        // Reached Shift 0 — death
        console.log(`[FASERIP] ${actor.name}: Endurance at Shift-0 — death`);
        if (config.autoDisable !== false) {
          await ae.update({ disabled: true });
        }
        await sendOngoingChat(actor, effectName, "stat.loss",
          `<strong>${actor.name}</strong> has reached Shift-0 Endurance — <strong>DEATH</strong>`
        );
        return;
      }

      const newRank = stepEnduranceRank(actor, "down");
      const newValue = game.msh?.getRankValue?.(newRank) ?? 0;

      await actor.update({
        "system.abilities.endurance.rank": newRank,
        "system.abilities.endurance.value": newValue,
        // Also reduce current HP by old-new difference
        "system.attributes.health.max": _recalcMaxHealth(actor, newValue),
      });

      await sendOngoingChat(actor, effectName, "stat.loss",
        `<strong>${actor.name}</strong> lost 1 Endurance rank: now <strong>${newRank} (${newValue})</strong>
         <div style="margin-top:4px;font-size:0.9em;color:#555;">
           Endurance loss continues each turn until stabilized or Shift-0 (death)
         </div>`
      );

      console.log(`[FASERIP] ${actor.name}: Endurance dropped to ${newRank} (${newValue})`);
    }
  } else {
    // Flat numeric loss
    const currentVal = actor.system?.abilities?.endurance?.value ?? 0;
    const loss = (typeof rawAmount === "number" ? rawAmount : 0) * cycles;
    const newVal = Math.max(0, currentVal - loss);
    await actor.update({ "system.abilities.endurance.value": newVal });
  }

  // Update timer
  const newStartedAt = startedAt + (cycles * cycleSeconds);
  await actor.setFlag(scope, `ongoing.${effectId}`, {
    ...config,
    startedAt: newStartedAt,
    lastTriggered: worldTime,
    triggerCount: (config.triggerCount || 0) + cycles,
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

export async function applyDyingOngoing(target) {
  const actor = target?.actor ?? target;
  if (!actor) return null;

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
    autoDisable: false,  // Removed by aid/stabilization, not auto
  }, {
    name: "Dying (Endurance Loss)",
    img: "icons/svg/skull.svg",
    disabled: false,  // Starts immediately
    statuses: ["dying"],
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
