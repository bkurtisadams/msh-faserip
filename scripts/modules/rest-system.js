// scripts/modules/rest-system.js v1.4.6 - 2026-04-19
// v1.4.6: Re-register hourly Healing on consciousness regain. The
//         attemptRegainConsciousness success branch removed Dying, set
//         HP to End rank value, and cleared lastDamageWorldTime, but
//         never called ensureHealingEffect — so woken characters got
//         no hourly regen until the next damage event restarted the
//         timer. RAW: "End rank HP per hour after last damage, no
//         further damage" — waking alive qualifies. Added one gated
//         call after the Impaired-Endurance timestamp update, matching
//         the recordDamage pattern.
// v1.4.5: Migrate remaining legacy `icon:` fields to `img:` on four AE
//         creation sites — consciousness-fail Unconscious (~519),
//         stabilization Unconscious (~637), stabilization Impaired
//         Endurance fallback (~679), and hourly Healing (~1014). v14
//         renamed the AE field icon → img; token HUD reads img at
//         creation time, and CTT's migration shim runs too late to
//         affect the initial badge render. Hygiene fix to eliminate
//         any future badge-missing regression.
// v1.4.4: Fix wake-up loop never firing after a failed consciousness check.
//         The consciousness-fail path in attemptRegainConsciousness was
//         creating the follow-up Unconscious (N rounds) AE with
//         duration:{value:rounds, units:"rounds", expiry:"roundEnd"} when
//         game.combat was truthy. But game.combat is truthy whenever a
//         combat tracker exists, not whether rounds are being actively
//         advanced; our time flow goes through CTT's worldTime-based
//         advanceTime, not combatRound hooks. Result: v14 couldn't tick
//         the rounds duration down (no round events), CTT's
//         onEffectCreated bailed at durationInSeconds > 0 (the v14
//         Duration shim won't convert "rounds" units cleanly outside
//         active round tracking), and the AE became an orphan with no
//         countdown anywhere. Character slept through a full in-game day
//         while Impaired Endurance healed in the background.
//         Mirror the sibling pattern in death-save-action.js:361: always
//         use seconds-based duration. "N rounds" stays in the AE name
//         as a display label; rounds * 6 seconds is the real countdown.
// v1.4.3: Two fixes:
//   (1) Revert v1.4.2's update-in-place pattern for the stabilization
//       Unconscious AE — it avoided Foundry core's expire-queue race but
//       left CTT's effects-manager with a stale cached tracker pointing
//       at the ORIGINAL duration (e.g. "Unconscious (10 rounds) / 60s"),
//       causing CTT to fire a premature expiry at the old timestamp and
//       delete the AE well before the stabilization duration (e.g. 2h or
//       8h) should have elapsed. CTT has no onEffectUpdated hook, so
//       in-place updates are invisible to it.
//       Back to delete + create, but now clear the old AE's duration in
//       a separate update FIRST. Foundry drops it from the expire queue
//       on that update; the subsequent delete is clean; CTT's
//       deleteActiveEffect hook tears down the tracker entry normally;
//       createEmbeddedDocuments registers the new AE fresh with CTT.
//   (2) Add duration:{expiry:"roundEnd"} to the Impaired Endurance AE
//       creation in the stabilization fallback path. v14's isTemporary
//       rule is `!!duration.expiry || Number.isFinite(duration.value)`;
//       without expiry, the token HUD badge silently does not render.
//       Same pattern applied to the other two Impaired Endurance
//       creation sites in ongoing-engine.js v1.7.3.
// v1.4.2: Fix "undefined id [...] does not exist in the EmbeddedCollection"
//         error thrown after stabilization. Root cause: Foundry v14 core's
//         `refresh() → #updateExpiredEffects()` schedules a batch-update
//         keyed to an effect's duration expire timestamp. stabilizeDying
//         was deleting the original death-save Unconscious AE and creating
//         a new 8-hour one in its place — but the scheduled update in
//         core's queue still pointed at the deleted id. When worldTime
//         advanced past the ORIGINAL expire time (1d10 rounds after the
//         death save, independent of the new 8-hour effect), core tried
//         to update the missing document and threw. Fix: update the AE
//         in place (same id, refreshed duration) so the scheduled update
//         lands on live data. Falls back to create for edge cases.
// v1.4.1: ensureHealingEffect now skips actors at 0 HP and dead actors.
//         Previously the only guard was "currently has a dying AE" — but
//         the standard 0-HP drop sequence registers Healing BEFORE the
//         dying AE is applied (applyDamageToTargets and the 0-HP branch
//         in init.js updateActor both call recordDamage before the death
//         save fires). That produced a stale Healing AE that stayed
//         enabled alongside the dying AE, with a startedAt accumulating
//         elapsed time during unconsciousness. If HP went above 0 even
//         briefly (e.g. First Aid), the accumulated cycles could burst-
//         heal up to max. Guard now centralized so both call sites benefit.
// v1.4.0: Add ensureHealingEffect — hourly Healing now registers as an ongoing
//         effect via the engine when damage is recorded. Time-advance now
//         heals HP automatically per RAW ("Endurance rank # per hour after
//         last damage"). Gated by autoHealingEnabled world setting.
//         Skips actively dying characters (dying effect owns their clock).
//         Stabilized unconscious characters heal normally.
// v1.3.3: stabilizeDying — use canonical RANKS_ORDERED instead of inline rank
//         list. Previous list had "Shift 0" (space) instead of "Shift-0"
//         (hyphen) and stopped at Unearthly, breaking the impaired effect
//         creation path for Shift-X+ characters being stabilized.
// v1.3.2: Semi mode auto-rolls consciousness FEAT (same as full auto). Regaining
//         consciousness is a rules-mandated Endurance FEAT, not a player choice.
// v1.3.1: Fix attemptRegainConsciousness fail path: use seconds-based duration when out of combat
//         so the retry unconscious effect properly expires via updateWorldTime handler.
//         Add mshReplacing/mshIntentional guard to deleteActiveEffect hook to prevent
//         premature consciousness attempts when unconscious effects are replaced (not expired).
// v1.3.0: Add canAct:false + statuses:["unconscious"] to stabilization and consciousness-fail
//         Unconscious effects so existing canActorAct guard blocks attacks.
// Player-driven rest, recovery, and healing system for FASERIP

import { getFlagScope } from "./actions/flags.js";
import { safeActorSetFlag } from "../gm-utils.js";
import { RANKS_ORDERED } from "../rules/rules-reference.js";

const SCOPE = getFlagScope();

/**
 * FASERIP Rest System
 * 
 * Recovery: Regain Endurance rank number in Health after 10 turns of rest
 *   - Once per day
 *   - Must be conscious (Health > 0)
 *   - Cannot be interrupted by damage
 * 
 * Healing: Heal Endurance rank number after 600 turns (1 hour) since last damage
 *   - Can be used multiple times
 *   - Works even if unconscious
 *   - Doubled with medical care
 *   - Timer resets if damaged again
 */

// ─── Scene / ledger / chat-routing helpers ────────────────────────────────────
// Rationale: Unconscious AE expiry fires scene-agnostically, so actors on other
// scenes emit wake-fail/wake-success chat cards during unrelated combat. Route
// all recovery-related cards through postRecoveryCard() which decides public /
// GM-whisper / ledger-only per (isPC × onScene × offSceneRecoveryChat setting).
// Terminal events (wake-success, dying-death, fully-recovered) emit a
// consolidated summary card in "summary" mode so the Jimmy-the-thug narrative
// ("dropped Mar 14, 3 wake attempts, woke Mar 16") survives without spam.

function isOnActiveScene(actor) {
  if (!actor) return false;
  const scene = canvas?.scene;
  if (!scene) return true; // no scene loaded — treat as visible (fallback)
  for (const tokenDoc of (scene.tokens ?? [])) {
    if (!tokenDoc.actor) continue;
    if (tokenDoc.actorLink) {
      if (tokenDoc.actor.id === actor.id) return true;
    } else if (tokenDoc.actor === actor) {
      return true;
    }
  }
  // Combat scene fallback: if active combat is on a different scene but this
  // actor is a combatant, the GM is logically still engaged with it.
  const combat = game.combat;
  if (combat?.scene?.id === scene.id) {
    if (combat.combatants?.some(c => c.actor?.id === actor.id)) return true;
  }
  return false;
}

function _formatLedgerDate(worldTime) {
  try {
    const ctt = game.modules?.get?.("calendar-time-tracker")?.active && game.msh?.time?.formatDate;
    if (typeof ctt === "function") return ctt(worldTime);
  } catch (_e) { /* fall through */ }
  try {
    if (game.msh?.time?.formatDate) return game.msh.time.formatDate(worldTime);
  } catch (_e) { /* fall through */ }
  // Fallback: relative elapsed from worldTime=0
  const days = Math.floor(worldTime / 86400);
  const hours = Math.floor((worldTime % 86400) / 3600);
  const mins = Math.floor((worldTime % 3600) / 60);
  if (days > 0) return `T+${days}d ${hours}h`;
  if (hours > 0) return `T+${hours}h ${mins}m`;
  return `T+${mins}m`;
}

export async function appendRecoveryLog(actor, entry) {
  if (!actor || !game.user.isGM) return;
  const worldTime = game.time?.worldTime ?? 0;
  const logEntry = {
    t: worldTime,
    dateStr: _formatLedgerDate(worldTime),
    event: entry.event,
    detail: entry.detail ?? null
  };
  const existing = actor.getFlag(SCOPE, "recoveryLog") || [];
  // Cap at 200 entries to prevent unbounded flag growth on chronic NPCs
  const updated = [...existing, logEntry].slice(-200);
  try {
    await actor.setFlag(SCOPE, "recoveryLog", updated);
  } catch (e) {
    console.warn("[FASERIP] appendRecoveryLog failed:", e);
  }
}

const _TERMINAL_RECOVERY_EVENTS = new Set(["wake-success", "dying-death", "fully-recovered"]);
const _EPISODE_START_EVENTS = new Set(["dying-start", "unconscious-start"]);

async function emitRecoverySummary(actor) {
  const log = actor.getFlag(SCOPE, "recoveryLog") || [];
  if (!log.length) return;
  // Episode = entries from the last terminal event (exclusive) through now.
  // If no prior terminal, use entire log (first episode).
  let startIdx = 0;
  for (let i = log.length - 2; i >= 0; i--) {
    if (_TERMINAL_RECOVERY_EVENTS.has(log[i].event)) { startIdx = i + 1; break; }
  }
  const episode = log.slice(startIdx);
  if (!episode.length) return;

  const firstT = episode[0].t;
  const lastT = episode[episode.length - 1].t;
  const dur = Math.max(0, lastT - firstT);
  const days = Math.floor(dur / 86400);
  const hours = Math.floor((dur % 86400) / 3600);
  const mins = Math.floor((dur % 3600) / 60);
  const durStr = days > 0 ? `${days}d ${hours}h`
               : hours > 0 ? `${hours}h ${mins}m`
               : `${Math.max(1, mins)}m`;

  const wakeFails = episode.filter(e => e.event === "wake-fail").length;
  const last = episode[episode.length - 1];
  const outcome = last.event === "wake-success" ? "regained consciousness"
                : last.event === "dying-death" ? "<strong style=\"color:#b71c1c;\">died</strong>"
                : last.event === "fully-recovered" ? "fully recovered"
                : "resolved";

  const LABELS = {
    "dying-start":      "Dropped at 0 HP — dying",
    "unconscious-start":"Knocked unconscious",
    "endurance-loss":   "Lost Endurance rank",
    "stabilized":       "Stabilized",
    "wake-fail":        "Wake attempt failed",
    "wake-success":     "Woke up",
    "dying-death":      "Died",
    "endurance-healed": "Endurance rank healed",
    "fully-recovered":  "Endurance fully restored"
  };
  const lines = episode.map(e => {
    const label = LABELS[e.event] || e.event;
    const detail = e.detail ? ` — ${e.detail}` : "";
    return `<li style="margin:1px 0;">${e.dateStr}: ${label}${detail}</li>`;
  }).join("");

  const content = `<div style="background:#f3e5f5;border:2px solid #9c27b0;padding:10px;border-radius:5px;">
    <div style="font-size:1.1em;font-weight:bold;color:#6a1b9a;margin-bottom:6px;">
      <i class="fas fa-scroll"></i> ${actor.name} — Recovery Summary
    </div>
    <div style="margin-bottom:6px;">
      <strong>Outcome:</strong> ${outcome} after ${durStr}${wakeFails > 0 ? ` (${wakeFails} failed wake attempt${wakeFails > 1 ? 's' : ''})` : ''}.
    </div>
    <ul style="margin:4px 0 0 0;padding-left:20px;font-size:0.9em;line-height:1.3;">${lines}</ul>
  </div>`;

  try {
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
    });
  } catch (e) {
    console.warn("[FASERIP] emitRecoverySummary failed:", e);
  }
}

/**
 * Route a recovery-related chat card based on scene/PC/setting.
 * Always appends to ledger; chat output depends on context.
 *
 * @param {Actor} actor
 * @param {object} opts
 * @param {string} opts.content   - HTML content of the card
 * @param {string} opts.eventType - one of: dying-start, unconscious-start,
 *                                  endurance-loss, stabilized, wake-fail,
 *                                  wake-success, dying-death, endurance-healed,
 *                                  fully-recovered
 * @param {string} [opts.detail]  - short detail string for ledger/summary
 */
export async function postRecoveryCard(actor, { content, eventType, detail } = {}) {
  if (!actor) return;
  await appendRecoveryLog(actor, { event: eventType, detail });

  const isPC = !!actor?.hasPlayerOwner;
  const onScene = isOnActiveScene(actor);

  // PCs always public + ledger (preserves player visibility regardless of
  // which scene is loaded — split-party safe).
  // NPCs on-scene: public + ledger (current behavior).
  // NPCs off-scene: respect offSceneRecoveryChat setting.
  let mode = "public";
  if (!isPC && !onScene) {
    try { mode = game.settings.get(SCOPE, "offSceneRecoveryChat") || "summary"; }
    catch (_e) { mode = "summary"; }
  }

  if (mode === "public") {
    await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
    return;
  }
  if (mode === "whisper-each") {
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
    });
    return;
  }
  // "summary" (default) — emit consolidated card only on terminal events.
  // "silent" — never emit, ledger is the sole record.
  if (mode === "summary" && _TERMINAL_RECOVERY_EVENTS.has(eventType)) {
    await emitRecoverySummary(actor);
  }
}

export class RestSystem {
  
  /**
   * Check if actor can attempt Recovery (10 turns rest)
   * @param {Actor} actor - The actor to check
   * @returns {Object} {canRest: boolean, reason: string}
   */
  static canAttemptRecovery(actor) {
    if (!actor) {
      return { canRest: false, reason: "No actor provided" };
    }

    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;
    
    // Must be conscious
    if (currentHealth <= 0) {
      return { 
        canRest: false, 
        reason: "Cannot recover while unconscious (Health must be above 0)" 
      };
    }

    // Per rules p.32: Recovery only applies "provided the character is not knocked
    // unconscious." If KO'd, only hourly Healing applies after waking.
    if (actor.getFlag(SCOPE, "wasKnockedOut")) {
      return {
        canRest: false,
        reason: "Recovery unavailable — was knocked unconscious. Heals via Healing (hourly) instead."
      };
    }

    // Already at max health
    if (currentHealth >= maxHealth) {
      return { 
        canRest: false, 
        reason: "Already at maximum Health" 
      };
    }

    // Check once-per-day limit
    const lastRecoveryDate = actor.getFlag(SCOPE, "lastRecoveryDate");
    const today = new Date().toDateString();
    
    if (lastRecoveryDate === today) {
      return { 
        canRest: false, 
        reason: "Recovery can only be used once per day (already used today)" 
      };
    }

    // Check if enough time has passed (10 turns = 60 seconds in FASERIP)
    const lastDamageTime = actor.getFlag(SCOPE, "lastDamageTime");
    if (lastDamageTime) {
      const timeSinceDamage = Date.now() - lastDamageTime;
      const tenTurns = 60 * 1000; // 60 seconds
      
      if (timeSinceDamage < tenTurns) {
        const remaining = Math.ceil((tenTurns - timeSinceDamage) / 1000);
        return { 
          canRest: false, 
          reason: `Must wait ${remaining} more seconds since last damage (10 turns total)` 
        };
      }
    }

    return { canRest: true, reason: "Ready for recovery" };
  }

  /**
   * Attempt Recovery - restore Endurance rank number in Health
   * @param {Actor} actor - The actor attempting recovery
   * @returns {Promise<Object>} {success: boolean, message: string, healed: number}
   */
  static async attemptRecovery(actor) {
    const check = this.canAttemptRecovery(actor);
    
    if (!check.canRest) {
      ui.notifications.warn(check.reason);
      return { success: false, message: check.reason, healed: 0 };
    }

    const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;
    
    const healAmount = Math.min(enduranceValue, maxHealth - currentHealth);
    const newHealth = currentHealth + healAmount;

    // Apply healing
    await actor.update({
      "system.attributes.health.value": newHealth
    });

    // Mark recovery as used today
    const today = new Date().toDateString();
    await actor.setFlag(SCOPE, "lastRecoveryDate", today);

    const message = `${actor.name} recovered ${healAmount} Health (10 turns of rest)`;
    
    // Chat message
    await ChatMessage.create({
      content: `<div style="background:#e8f5e9;border:1px solid #4CAF50;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> recovered <strong>${healAmount} Health</strong> after 10 turns of rest.
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Health: ${currentHealth} → ${newHealth}
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    ui.notifications.info(message);
    
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log("FASERIP | Recovery applied:", {
        actor: actor.name,
        healAmount,
        oldHealth: currentHealth,
        newHealth
      });
    }

    return { success: true, message, healed: healAmount };
  }

  /**
   * Check if actor can attempt Healing (1 hour since last damage)
   * @param {Actor} actor - The actor to check
   * @returns {Object} {canHeal: boolean, reason: string}
   */
  static canAttemptHealing(actor) {
    if (!actor) {
      return { canHeal: false, reason: "No actor provided" };
    }

    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;

    // Already at max health
    if (currentHealth >= maxHealth) {
      return { 
        canHeal: false, 
        reason: "Already at maximum Health" 
      };
    }

    // Check if enough time has passed (600 turns = 1 hour = 3600 world seconds)
    const lastDamageWorldTime = actor.getFlag(SCOPE, "lastDamageWorldTime");
    if (!lastDamageWorldTime && lastDamageWorldTime !== 0) {
      return { 
        canHeal: false, 
        reason: "No damage recorded - take damage first to start healing timer" 
      };
    }

    const worldNow = game.time?.worldTime ?? 0;
    const timeSinceDamage = worldNow - lastDamageWorldTime;
    const oneHour = 3600; // 1 hour in world seconds

    if (timeSinceDamage < oneHour) {
      const remaining = Math.ceil((oneHour - timeSinceDamage) / 60); // minutes
      return { 
        canHeal: false, 
        reason: `Must wait ${remaining} more minutes since last damage (1 hour total)` 
      };
    }

    return { canHeal: true, reason: "Ready for healing" };
  }

  /**
   * Attempt Healing - restore Endurance rank number (×2 with medical care)
   * @param {Actor} actor - The actor attempting healing
   * @returns {Promise<Object>} {success: boolean, message: string, healed: number}
   */
  static async attemptHealing(actor) {
    const check = this.canAttemptHealing(actor);
    
    if (!check.canHeal) {
      ui.notifications.warn(check.reason);
      return { success: false, message: check.reason, healed: 0 };
    }

    const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;
    const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
    const multiplier = hasMedicalCare ? 2 : 1;
    
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const maxHealth = actor.system?.attributes?.health?.max ?? 0;
    
    const healAmount = Math.min(enduranceValue * multiplier, maxHealth - currentHealth);
    const newHealth = currentHealth + healAmount;

    // Apply healing
    await actor.update({
      "system.attributes.health.value": newHealth
    });

    // Clear damage timer
    await actor.unsetFlag(SCOPE, "lastDamageWorldTime");
    await actor.unsetFlag(SCOPE, "lastDamageTime"); // legacy cleanup

    const medicalNote = hasMedicalCare ? " (with medical care)" : "";
    const message = `${actor.name} healed ${healAmount} Health${medicalNote}`;
    
    // Chat message
    await ChatMessage.create({
      content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> healed <strong>${healAmount} Health</strong> after 1 hour${medicalNote}.
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Health: ${currentHealth} → ${newHealth}
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    ui.notifications.info(message);
    
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log("FASERIP | Healing applied:", {
        actor: actor.name,
        healAmount,
        medicalCare: hasMedicalCare,
        oldHealth: currentHealth,
        newHealth
      });
    }

    return { success: true, message, healed: healAmount };
  }

  /**
   * Toggle medical care flag for an actor
   * @param {Actor} actor - The actor
   * @param {boolean} enabled - True to enable medical care
   */
  static async setMedicalCare(actor, enabled) {
    await actor.setFlag(SCOPE, "medicalCare", enabled);
    const status = enabled ? "receiving medical care (healing ×2)" : "no longer receiving medical care";
    ui.notifications.info(`${actor.name} is now ${status}`);
    
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log(`FASERIP | Medical care ${enabled ? 'enabled' : 'disabled'} for ${actor.name}`);
    }
  }

  /**
   * Get current rest status for an actor (for UI display)
   * @param {Actor} actor - The actor to check
   * @returns {Object} Status information
   */
  static getRestStatus(actor) {
    const recoveryCheck = this.canAttemptRecovery(actor);
    const healingCheck = this.canAttemptHealing(actor);
    
    const lastDamageTime = actor.getFlag(SCOPE, "lastDamageTime");
    const lastRecoveryDate = actor.getFlag(SCOPE, "lastRecoveryDate");
    const medicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
    
    return {
      recovery: {
        available: recoveryCheck.canRest,
        reason: recoveryCheck.reason,
        lastUsed: lastRecoveryDate
      },
      healing: {
        available: healingCheck.canHeal,
        reason: healingCheck.reason,
        lastDamage: lastDamageTime,
        medicalCare
      }
    };
  }

  /**
   * Attempt to regain consciousness (0 HP character waking up)
   * Roll Endurance FEAT vs Kill column
   * @param {Actor} actor - The actor attempting to wake
   * @returns {Promise<Object>} {success: boolean, message: string, rolled: number, color: string}
   */
static async attemptRegainConsciousness(actor) {
    if (!actor) {
      return { success: false, message: "No actor provided" };
    }

    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    
    // Must be at 0 HP
    if (currentHealth > 0) {
      const msg = `${actor.name} is already conscious (Health: ${currentHealth})`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Check if still has Unconscious effect
    const hasUnconsciousEffect = actor.effects.find(e => 
      e.name?.toLowerCase().includes("unconscious") || 
      e.name?.toLowerCase().includes("stunned")
    );
    
    if (hasUnconsciousEffect) {
      const msg = `${actor.name} is still unconscious (${hasUnconsciousEffect.name}). Wait for the effect to expire.`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Check if still has Dying effect
    const hasDyingEffect = actor.effects.find(e => 
      e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
    );

    if (hasDyingEffect) {
      const msg = `${actor.name} is still dying. Cannot attempt consciousness while dying.`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Roll Endurance FEAT vs Kill column
    const enduranceRank = actor.system?.abilities?.endurance?.rank || "Typical";
    
    // Import the universal table function
    let color, roll;
    if (game.msh?.rollUniversalTable) {
      roll = Math.floor(Math.random() * 100) + 1;
      color = game.msh.rollUniversalTable(enduranceRank, roll);
    } else {
      // Fallback if universal table not available
      roll = Math.floor(Math.random() * 100) + 1;
      if (roll <= 45) color = "white";
      else if (roll <= 75) color = "green";
      else if (roll <= 95) color = "yellow";
      else color = "red";
    }

    const colorLower = color.toLowerCase();
    
    // Success on Green or better (Green/Yellow/Red)
    const success = (colorLower !== "white");
    
    if (success) {
      // Wake up with Health = Endurance rank value
      const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;
      await actor.update({
        "system.attributes.health.value": enduranceValue
      });

      // Clear damage timer - healing already granted by wake-up, no immediate re-heal
      await actor.unsetFlag(SCOPE, "lastDamageWorldTime");
      await actor.unsetFlag(SCOPE, "lastDamageTime"); // legacy cleanup

      const message = `${actor.name} regained consciousness with ${enduranceValue} Health!`;
      
      // Chat message (routed: on-scene→public, off-scene NPC→summary on terminal)
      await postRecoveryCard(actor, {
        eventType: "wake-success",
        detail: `${color.toUpperCase()} FEAT, Health ${enduranceValue}`,
        content: `<div style="background:#e8f5e9;border:2px solid #4CAF50;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#2e7d32;margin-bottom:8px;">
            <i class="fas fa-heart"></i> ${actor.name} Regained Consciousness!
          </div>
          <div style="margin-bottom:6px;">
            <strong>Endurance FEAT:</strong> ${color.toUpperCase()} (rolled ${roll})
          </div>
          <div style="margin-bottom:6px;">
            <strong>Result:</strong> Success - Conscious with ${enduranceValue} Health
          </div>
          <div style="background:#c8e6c9;padding:8px;margin-top:8px;border-radius:3px;text-align:center;">
            <strong>Health: 0 → ${enduranceValue}</strong>
          </div>
        </div>`
      });

      if (isOnActiveScene(actor) || actor?.hasPlayerOwner) ui.notifications.info(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Consciousness regained:", {
          actor: actor.name,
          roll,
          color,
          health: enduranceValue
        });
      }

      // Remove Dying effect if present (they're awake, no longer dying)
      const dyingEffect = actor.effects.find(e => 
        e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
      );
      if (dyingEffect) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [dyingEffect.id], { mshIntentional: true });
        
        if (game.settings.get(SCOPE, "debugMode")) {
          console.log(`FASERIP | Removed Dying effect from ${actor.name} (regained consciousness)`);
        }
      }
      
      // Update Impaired Endurance timestamp
      const impairedEffect = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));
      if (impairedEffect) {
        await impairedEffect.update({
          [`flags.${SCOPE}.lastHealed`]: game.time.worldTime
        });
      }

      // Re-register hourly Healing per RAW: End rank HP/hour after last
      // damage, no further damage. Waking alive qualifies. Gated by
      // autoHealingEnabled; matches recordDamage pattern.
      try {
        const enabled = game.settings?.get?.(SCOPE, "autoHealingEnabled") ?? true;
        if (enabled) await ensureHealingEffect(actor, game.time?.worldTime ?? 0);
      } catch (e) {
        console.warn("[FASERIP WARN] ensureHealingEffect failed on consciousness regain:", e);
      }

      return { success: true, message, rolled: roll, color };
      
    } else {
      // Failed - remain unconscious for 1-10 more rounds
      const rounds = Math.floor(Math.random() * 10) + 1;

      // Create new Unconscious effect. Always use seconds-based duration
      // regardless of game.combat state — rounds-based durations only decrement
      // on combatRound events, but time advancement in this system routes
      // primarily through CTT's worldTime-based advanceTime, which won't tick
      // a rounds duration. The parallel path at death-save-action.js:361 uses
      // seconds unconditionally for the same reason; the "N rounds" label is
      // purely display. rounds * 6 gives the correct wallclock equivalent.
      const effectData = {
        name: `Unconscious (${rounds} rounds)`,
        img: "icons/svg/unconscious.svg",
        origin: actor.uuid,
        flags: {
          [SCOPE]: {
            isStunned: true,
            fromConsciousnessFail: true
          }
        },
        changes: [
          { key: "system.combatMods.canAct", mode: "override", value: "false" }
        ],
        statuses: ["unconscious"],
        duration: { value: Math.max(1, rounds) * 6, units: "seconds", expiry: "turnStart" }
      };
      
      await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

      const message = `${actor.name} failed to regain consciousness (unconscious ${rounds} more rounds)`;
      
      // Chat message (routed: on-scene→public, off-scene NPC→ledger-only by default)
      await postRecoveryCard(actor, {
        eventType: "wake-fail",
        detail: `${color.toUpperCase()} FEAT, +${rounds} rounds`,
        content: `<div style="background:#ffebee;border:2px solid #ef5350;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#c62828;margin-bottom:8px;">
            <i class="fas fa-times-circle"></i> ${actor.name} Failed to Wake
          </div>
          <div style="margin-bottom:6px;">
            <strong>Endurance FEAT:</strong> ${color.toUpperCase()} (rolled ${roll})
          </div>
          <div style="margin-bottom:6px;">
            <strong>Result:</strong> Failed - Remains unconscious
          </div>
          <div style="background:#ffcdd2;padding:8px;margin-top:8px;border-radius:3px;text-align:center;">
            <strong>Unconscious for ${rounds} more rounds</strong>
          </div>
        </div>`
      });

      if (isOnActiveScene(actor) || actor?.hasPlayerOwner) ui.notifications.warn(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Consciousness attempt failed:", {
          actor: actor.name,
          roll,
          color,
          unconsciousRounds: rounds
        });
      }

      return { success: false, message, rolled: roll, color, unconsciousRounds: rounds };
    }
  }

  /**
   * Stabilize a dying character (removes Dying and original Unconscious effects)
   * @param {Actor} actor - The dying actor
   * @returns {Promise<Object>} {success: boolean, message: string}
   */
  static async stabilizeDying(actor) {
    if (!actor) {
      return { success: false, message: "No actor provided" };
    }

    // Find and remove Dying effect
    const dyingEffect = actor.effects.find(e => 
      e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
    );
    
    if (!dyingEffect) {
      const msg = `${actor.name} is not dying`;
      ui.notifications.warn(msg);
      return { success: false, message: msg };
    }

    // Get original Endurance rank from Dying effect
    const originalEndurance = dyingEffect.getFlag(SCOPE, "originalEndurance");
    const currentEndurance = actor.system.abilities.endurance.rank;

    // Remove Dying effect
    await actor.deleteEmbeddedDocuments("ActiveEffect", [dyingEffect.id], { mshIntentional: true });
    
    // Replace the original death-save Unconscious AE with the stabilized
    // variant. Delete + recreate (not update-in-place) so CTT's tracker
    // sees the new AE's duration at creation; updating in place leaves
    // CTT's cached tracker on the ORIGINAL duration and fires a premature
    // expiry at the old timestamp. But before deleting, we clear the
    // duration fields on the old AE — this forces Foundry v14 core to
    // re-evaluate its expired-effects queue and drop the stale reference,
    // avoiding the "undefined id [...] does not exist in the
    // EmbeddedCollection" error that otherwise fires on the next
    // worldTime advance past the original expire timestamp.
    // mshStabilizing flag on delete prevents the deleteActiveEffect hook
    // from auto-attempting a premature consciousness check.
    const unconsciousFromDeathSave = actor.effects.find(e =>
      e.getFlag(SCOPE, "fromDeathSave")
    );
    if (unconsciousFromDeathSave) {
      // Clear the duration in a first update — Foundry drops the AE from
      // its expire schedule when duration.value is null and no expiry
      // event is pending.
      await unconsciousFromDeathSave.update({
        "duration.value": null,
        "duration.units": null,
        "duration.startTime": null,
        "duration.rounds": null,
        "duration.turns": null,
        "duration.seconds": null,
      });
      await actor.deleteEmbeddedDocuments("ActiveEffect", [unconsciousFromDeathSave.id], { mshIntentional: true, mshStabilizing: true });
    }

    // Only apply unconscious if at 0 HP — conscious dying characters (health > 0)
    // are stabilized but remain conscious (rules p.31: unconscious only at 0 HP).
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    const hours = Math.floor(Math.random() * 10) + 1;
    if (currentHealth <= 0) {
      const unconsciousEffect = {
        name: `Unconscious (${hours} hours)`,
        img: "icons/svg/unconscious.svg",
        origin: actor.uuid,
        flags: {
          [SCOPE]: {
            isStunned: true,
            fromDeathSave: true,
            fromStabilization: true
          }
        },
        changes: [
          { key: "system.combatMods.canAct", mode: "override", value: "false" }
        ],
        statuses: ["unconscious"],
        duration: {
          value: hours * 3600,
          units: "seconds"
        }
      };
      await actor.createEmbeddedDocuments("ActiveEffect", [unconsciousEffect]);
    }
    
    // Create or update Impaired Endurance effect if Endurance was reduced
    let impairedEffect = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));

    if (impairedEffect) {
      // Effect already exists from dying - update it with stabilization timestamp
      await impairedEffect.update({
        [`flags.${SCOPE}.lastHealed`]: game.time.worldTime,
        [`flags.${SCOPE}.medicalCare`]: actor.getFlag(SCOPE, "medicalCare") ?? false
      });
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log(`✅ FASERIP | Updated existing Impaired Endurance effect for ${actor.name}`);
      }
    } else if (originalEndurance && currentEndurance !== originalEndurance) {
      // Effect doesn't exist yet (edge case - stabilized before losing a rank)
      const currentIndex = RANKS_ORDERED.indexOf(currentEndurance);
      const originalIndex = RANKS_ORDERED.indexOf(originalEndurance);
      
      if (currentIndex >= 0 && originalIndex >= 0 && currentIndex < originalIndex) {
        const impairedEffectData = {
          name: `Impaired Endurance (${currentEndurance} of ${originalEndurance})`,
          img: "icons/svg/blood.svg",
          origin: actor.uuid,
          statuses: ["impaired-endurance"],
          // v14: timeless effect needs duration.expiry set for isTemporary
          // rule `!!duration.expiry || Number.isFinite(duration.value)` to
          // evaluate true, otherwise the token HUD badge does not render.
          // No auto-expiration — our healImpairedEndurance path removes it
          // rank-by-rank until Endurance is restored.
          duration: { expiry: "roundEnd" },
          flags: {
            [SCOPE]: {
              isImpairedEndurance: true,
              originalEndurance: originalEndurance,
              currentEndurance: currentEndurance,
              lastHealed: game.time.worldTime,
              medicalCare: actor.getFlag(SCOPE, "medicalCare") ?? false
            }
          },
          changes: [{
            key: "system.combatMods.attackShift",
            mode: "add",
            value: "-2"
          }]
        };
        
        await actor.createEmbeddedDocuments("ActiveEffect", [impairedEffectData]);
        
        if (game.settings.get(SCOPE, "debugMode")) {
          console.log(`✅ FASERIP | Created Impaired Endurance effect for ${actor.name}`);
        }
      }
    }
    
    const consciousMsg = currentHealth > 0
      ? `Dying halted - conscious but impaired`
      : `Dying halted - unconscious for ${hours} hours`;
    const message = currentHealth > 0
      ? `${actor.name} stabilized! Conscious. Endurance impaired (${currentEndurance} of ${originalEndurance}).`
      : `${actor.name} stabilized! Unconscious for ${hours} hours. Endurance impaired (${currentEndurance} of ${originalEndurance}).`;

    await postRecoveryCard(actor, {
      eventType: "stabilized",
      detail: currentHealth > 0 ? `conscious, End ${currentEndurance}/${originalEndurance}` : `unconscious ${hours}h, End ${currentEndurance}/${originalEndurance}`,
      content: `<div style="background:#e8f5e9;border:2px solid #4CAF50;padding:10px;border-radius:5px;">
        <div style="font-size:1.2em;font-weight:bold;color:#2e7d32;margin-bottom:8px;">
          <i class="fas fa-medkit"></i> ${actor.name} Stabilized!
        </div>
        <div>${consciousMsg}</div>
        <div>Endurance impaired: ${currentEndurance} of ${originalEndurance} (-2CS penalty)</div>
      </div>`
    });
    
    if (isOnActiveScene(actor) || actor?.hasPlayerOwner) ui.notifications.info(message);
    
    return { success: true, message };
  }

  /**
   * Heal one rank of impaired Endurance
   * Rules: 1 rank/week normal, 1 rank/day with medical care
   * @param {Actor} actor - The actor to heal
   * @param {boolean} medicalCare - Whether under medical care (daily vs weekly healing)
   * @returns {Promise<Object>} {success: boolean, message: string, rankRestored: string|null}
   */
  static async healImpairedEndurance(actor, medicalCare = false) {
    if (!actor) {
      return { success: false, message: "No actor provided" };
    }

    // Find Impaired Endurance effect
    const impairedEffect = actor.effects.find(e => 
      e.getFlag(SCOPE, "isImpairedEndurance")
    );
    
    if (!impairedEffect) {
      return { success: false, message: `${actor.name} does not have impaired Endurance` };
    }

    const originalEndurance = impairedEffect.getFlag(SCOPE, "originalEndurance");
    const currentEndurance = actor.system.abilities.endurance.rank;
    const lastHealed = impairedEffect.getFlag(SCOPE, "lastHealed") || 0;
    
    // Check if enough time has passed (world time in seconds)
    const now = game.time.worldTime;
    const dayInSeconds = 86400;
    const weekInSeconds = 7 * dayInSeconds;
    const requiredTime = medicalCare ? dayInSeconds : weekInSeconds;
    const timeSinceHealing = now - lastHealed;
    
    if (timeSinceHealing < requiredTime) {
      const timeRemaining = requiredTime - timeSinceHealing;
      const hoursRemaining = Math.ceil(timeRemaining / 3600);
      return { 
        success: false, 
        message: `${actor.name} needs ${hoursRemaining} more hours before healing another Endurance rank` 
      };
    }

    // Get rank names for display
    const rankNames = [
      "Shift 0", "Feeble", "Poor", "Typical", "Good", "Excellent", 
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
    ];
    
    const currentRankIndex = rankNames.indexOf(currentEndurance);
    const originalRankIndex = rankNames.indexOf(originalEndurance);
    
    if (currentRankIndex === -1 || originalRankIndex === -1) {
      return { success: false, message: "Invalid Endurance rank data" };
    }

    // Calculate new Endurance rank (increase by 1 step)
    const newRankIndex = Math.min(currentRankIndex + 1, originalRankIndex);
    
    if (newRankIndex === currentRankIndex) {
      return { success: false, message: `${actor.name}'s Endurance is already at maximum (${originalEndurance})` };
    }

    const newRank = rankNames[newRankIndex];
    const newValue = game.msh?.getRankValue?.(newRank) ?? 0;
    const newHealthMax = (actor.system.abilities.fighting.value || 0) +
                         (actor.system.abilities.agility.value || 0) +
                         (actor.system.abilities.strength.value || 0) +
                         newValue;

    // Update actor Endurance rank, value, and derived health max
    await actor.update({
      "system.abilities.endurance.rank": newRank,
      "system.abilities.endurance.value": newValue,
      "system.attributes.health.max": newHealthMax
    });

    // Check if fully healed
    if (newRankIndex >= originalRankIndex) {
      // Remove Impaired Endurance effect
      await actor.deleteEmbeddedDocuments("ActiveEffect", [impairedEffect.id], { mshIntentional: true });
      
      const message = `${actor.name}'s Endurance fully restored to ${originalEndurance}!`;
      
      await postRecoveryCard(actor, {
        eventType: "fully-recovered",
        detail: `Endurance → ${originalEndurance}`,
        content: `<div style="background:#e8f5e9;border:2px solid #4CAF50;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#2e7d32;">
            <i class="fas fa-heart"></i> ${actor.name} Fully Recovered!
          </div>
          <div>Endurance restored to ${originalEndurance} - no more penalties!</div>
        </div>`
      });
      
      if (isOnActiveScene(actor) || actor?.hasPlayerOwner) ui.notifications.info(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Endurance fully restored:", {
          actor: actor.name,
          from: currentEndurance,
          to: newRank
        });
      }
      
      return { success: true, message, rankRestored: newRank };
    } else {
      // Update effect to reflect new rank; no duration — effect persists until Endurance fully restored
      await impairedEffect.update({
        name: `Impaired Endurance (${newRank} of ${originalEndurance})`,
        [`flags.${SCOPE}.currentEndurance`]: newRank,
        [`flags.${SCOPE}.lastHealed`]: now,
        [`flags.${SCOPE}.medicalCare`]: medicalCare,
      });
      
      const careNote = medicalCare ? " (with medical care)" : "";
      const message = `${actor.name} healed 1 Endurance rank${careNote}: ${currentEndurance} → ${newRank}`;
      
      await postRecoveryCard(actor, {
        eventType: "endurance-healed",
        detail: `${currentEndurance} → ${newRank}${careNote}`,
        content: `<div style="background:#fff3e0;border:2px solid #FF9800;padding:10px;border-radius:5px;">
          <div style="font-size:1.2em;font-weight:bold;color:#e65100;">
            <i class="fas fa-heart-pulse"></i> Endurance Healing
          </div>
          <div>${actor.name}: ${newRank} of ${originalEndurance}${careNote}</div>
          <div style="margin-top:6px;color:#555;">-2CS penalty continues until fully healed</div>
        </div>`
      });
      
      if (isOnActiveScene(actor) || actor?.hasPlayerOwner) ui.notifications.info(message);
      
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log("FASERIP | Endurance rank healed:", {
          actor: actor.name,
          from: currentEndurance,
          to: newRank,
          remaining: originalRankIndex - newRankIndex
        });
      }
      
      return { success: true, message, rankRestored: newRank };
    }
  }
}

/**
 * Update damage timestamp when actor takes damage.
 * Also interrupts any ongoing effects flagged with interruptOnDamage.
 * Also (re-)registers the hourly Healing ongoing-effect so HP heals
 * automatically as worldTime advances, per RAW "Endurance rank number
 * in HP per hour after last damage."
 * @param {Actor} actor - The actor taking damage
 */
export async function recordDamage(actor) {
  const now = Date.now();
  const worldNow = game.time?.worldTime ?? 0;
  await safeActorSetFlag(actor, SCOPE, "lastDamageTime", now);
  await safeActorSetFlag(actor, SCOPE, "lastDamageWorldTime", worldNow);

  // Interrupt all ongoing effects that are damage-sensitive (Regeneration etc.)
  try {
    const { interruptOngoingEffects } = await import("./effects/ongoing-engine.js");
    await interruptOngoingEffects(actor);
  } catch (e) {
    console.warn("[FASERIP WARN] interruptOngoingEffects failed, falling back to legacy:", e);
    for (const ef of actor.effects) {
      if (ef.disabled) continue;
      const flags = ef.flags?.[SCOPE];
      if (flags?.effectType === "regeneration" || flags?.ongoingId) {
        await ef.update({ disabled: true });
      }
    }
  }

  // (Re-)register hourly Healing per RAW. Setting autoHealingEnabled gates
  // this so GMs can disable if they prefer fully-manual healing.
  try {
    const enabled = game.settings?.get?.(SCOPE, "autoHealingEnabled") ?? true;
    if (enabled) await ensureHealingEffect(actor, worldNow);
  } catch (e) {
    console.warn("[FASERIP WARN] ensureHealingEffect failed:", e);
  }

  if (game.settings.get(SCOPE, "debugMode")) {
    console.log(`FASERIP | Damage timestamp recorded for ${actor.name} (worldTime: ${worldNow})`);
  }
}

/**
 * Register or refresh the auto-Healing ongoing-effect config for an actor.
 * Per RAW: heals Endurance rank number in HP per hour after last damage.
 * Doubled by medicalCare flag. Interrupted by further damage (timer resets
 * from that point). Auto-disables at max HP.
 *
 * Uses the ongoing engine's existing "heal" executor which handles:
 *   - cycle accumulation (advance time 6h → 6 heal ticks)
 *   - cap at max HP
 *   - auto-disable when fully healed
 *   - chat message per tick
 *
 * Skips actively-dying characters — the dying effect owns their Endurance
 * clock; healing would conflict. Stabilized unconscious characters DO heal
 * (their dying effect has already been removed).
 *
 * @param {Actor} actor - The actor to register healing for
 * @param {number} worldNow - Current worldTime (for startedAt reset)
 */
export async function ensureHealingEffect(actor, worldNow = game.time?.worldTime ?? 0) {
  if (!actor) return;

  // Skip dead characters. Healing doesn't apply to the dead.
  const deadEffect = actor.effects?.find(e =>
    e.flags?.[SCOPE]?.isDead || e.statuses?.has?.("dead")
  );
  if (deadEffect && !deadEffect.disabled) {
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log(`FASERIP | Skipping healing registration for ${actor.name} (dead)`);
    }
    return;
  }

  // Skip 0-HP characters. Dropping to 0 HP enters the dying pipeline;
  // Healing does not apply during dying or stabilized-unconscious periods.
  // On wake-up (attemptRegainConsciousness) HP is restored to End rank# and
  // Healing can be re-registered via the normal damage path. Registering now
  // would produce a Healing AE that sits enabled alongside the dying AE with
  // a stale startedAt, risking burst-heal if HP briefly goes above 0.
  const currentHp = actor.system?.attributes?.health?.value ?? 0;
  if (currentHp <= 0) {
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log(`FASERIP | Skipping healing registration for ${actor.name} (0 HP)`);
    }
    return;
  }

  // Skip actively dying characters
  const dyingEffect = actor.effects?.find(e =>
    e.flags?.[SCOPE]?.ongoingId === "dying" ||
    e.flags?.[SCOPE]?.isDying ||
    e.statuses?.has?.("dying")
  );
  if (dyingEffect && !dyingEffect.disabled) {
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log(`FASERIP | Skipping healing registration for ${actor.name} (dying)`);
    }
    return;
  }

  const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
  const multiplier = hasMedicalCare ? 2 : 1;
  const enduranceValue = actor.system?.abilities?.endurance?.value ?? 10;

  const config = {
    type: "heal",
    stat: "health",
    formula: enduranceValue * multiplier,
    rate: 1,
    cycle: "hour",
    count: -1,
    gate: "none",
    interruptOnDamage: false,  // we re-register on damage instead
    oncePerDay: false,
    capAtMax: true,
    autoDisable: true,
    startedAt: worldNow,
    lastTriggered: null,
    triggerCount: 0,
  };

  await safeActorSetFlag(actor, SCOPE, "ongoing.healing", config);

  // Create or refresh the AE used by the engine to track the effect
  const existing = actor.effects?.find(e => e.flags?.[SCOPE]?.ongoingId === "healing");
  if (existing) {
    await existing.update({
      disabled: false,
      [`flags.${SCOPE}.medicalCare`]: hasMedicalCare,
      name: `Healing (${enduranceValue * multiplier} HP/hour${hasMedicalCare ? ', medical' : ''})`
    });
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Healing (${enduranceValue * multiplier} HP/hour${hasMedicalCare ? ', medical' : ''})`,
      img: "icons/svg/regen.svg",
      origin: actor.uuid,
      disabled: false,
      flags: {
        [SCOPE]: {
          ongoingId: "healing",
          effectType: "ongoing",
          medicalCare: hasMedicalCare
        }
      }
    }]);
  }

  if (game.settings.get(SCOPE, "debugMode")) {
    console.log(`FASERIP | Healing registered for ${actor.name}: ${enduranceValue * multiplier} HP/hour, start=${worldNow}`);
  }
}

/**
 * Initialize the rest system
 */
export function initRestSystem() {
  game.msh = game.msh || {};
  game.msh.rest = RestSystem;
  game.msh.recordDamage = recordDamage;
  
  // Expose convenience functions for common operations
  game.msh.healEndurance = (actor, medicalCare = false) => RestSystem.healImpairedEndurance(actor, medicalCare);
  
  // Expose ledger helpers for ongoing-engine and external callers
  game.msh.rest.appendRecoveryLog = appendRecoveryLog;
  game.msh.rest.postRecoveryCard = postRecoveryCard;
  game.msh.rest.isOnActiveScene = isOnActiveScene;
  
  console.log("FASERIP | Rest system initialized");
  
  // Register hook for automatic consciousness attempts
  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    // Only GM should handle this to avoid duplicates
    if (!game.user.isGM) return;
    
    // Skip if this deletion is part of stabilizeDying — new unconscious timer
    // hasn't been created yet, so consciousness check would incorrectly pass
    if (options.mshStabilizing) return;
    
    // Skip if unconscious effect is being replaced (e.g. death-save-action creating
    // a new unconscious effect, or a second hit triggering a new death save).
    // The old effect is being cleaned up, not naturally expiring.
    if (options.mshIntentional || options.mshReplacing) return;
    
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    
    // Check if this was an Unconscious effect
    const wasUnconsciousEffect = effect.name?.toLowerCase().includes("unconscious") || 
                                  effect.name?.toLowerCase().includes("stunned");
    
    if (!wasUnconsciousEffect) return;
    
    // Check if actor is still at 0 HP
    const currentHealth = actor.system?.attributes?.health?.value ?? 0;
    if (currentHealth > 0) return; // Already conscious

        // Check if actor is dead
    if (actor.system?.details?.isDead) {
      if (game.settings.get(getFlagScope(), "debugMode")) {
        console.log(`FASERIP | ${actor.name} is dead - skipping consciousness attempt`);
      }
      return;
    }
    
    // Check if still dying
    const hasDyingEffect = actor.effects.find(e => 
      e.getFlag(getFlagScope(), "isDying") || e.statuses?.has?.("dying")
    );
    
    if (hasDyingEffect) {
      if (game.settings.get(getFlagScope(), "debugMode")) {
        console.log(`FASERIP | ${actor.name} is still dying - skipping consciousness attempt`);
      }
      return;
    }
    
    // Check if this was from a death save (not from consciousness attempt)
    const fromDeathSave = effect.getFlag(getFlagScope(), "fromDeathSave");
    const fromConsciousnessFail = effect.getFlag(getFlagScope(), "fromConsciousnessFail");
    
    if (!fromDeathSave && !fromConsciousnessFail) return; // Not our effect
    
    if (game.settings.get(getFlagScope(), "debugMode")) {
      console.log("FASERIP | Unconscious effect expired for", actor.name, "- checking consciousness attempt");
    }
    
    // Import resolveCombatMode
    const { resolveCombatMode } = await import("./actions/action-dispatcher.js");
    const mode = resolveCombatMode(actor) || "manual";
    
    if (mode === "full" || mode === "semi") {
      // Full auto / Semi: automatically attempt consciousness FEAT
      // This is a rules-mandated roll, not a player choice
      console.log(`[FASERIP] ${mode} mode - automatically attempting consciousness for`, actor.name);
      await RestSystem.attemptRegainConsciousness(actor);
      
    } else {
      // Manual mode: do nothing, GM/player handles it
      console.log("FASERIP | Manual mode - consciousness attempt not automatic for", actor.name);
    }
  });
  
  // Register click handler for consciousness buttons
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html[0] ?? html;
    const btn = root.querySelector(".regain-consciousness-button");
    if (!btn) return;
    btn.addEventListener("click", async (event) => {
      const actorId = event.currentTarget.dataset.actorId;
      const actor = game.actors.get(actorId);
      
      if (!actor) {
        ui.notifications.error("Actor not found!");
        return;
      }
      
      await RestSystem.attemptRegainConsciousness(actor);
      
      // Disable button after use
      event.currentTarget.disabled = true;
      event.currentTarget.style.opacity = "0.5";
      event.currentTarget.textContent = "Already attempted";
    });
  });
}