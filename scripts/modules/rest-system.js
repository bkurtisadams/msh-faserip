// scripts/modules/rest-system.js v1.9.1 - 2026-10-01
// v1.9.1: Recovery card ("recovery-heal") posts publicly for NPCs on the
//         active scene under the default "critical" NPC output policy, like
//         wake-success. Off-scene NPCs still log to the ledger only.
// scripts/modules/rest-system.js v1.9.0 - 2026-10-01
// v1.9.0: Rules audit against Life, Death, and Health (Judge readings
//         2026-10-01).
//         - Recovery is automatic: processAutoRecovery (called from the
//           ongoing engine on every time advance) applies it when the
//           10-turn mark falls inside the advance, gated by
//           autoHealingEnabled. A missed mark is not made up; the sheet
//           button stays as the manual path.
//         - Hourly Healing runs while knocked out at 0 Health, timed from the
//           last damage (wake no longer rebases the clock). Health gained
//           while unconscious does not wake the character: unconsciousness
//           is the awaitingWake flag / unconscious status, not Health 0.
//           Wake success sets Health to the higher of the Endurance number
//           and current Health, then clears awaitingWake.
//         - Wake FEAT takes the Impaired Endurance -2CS (selfPenaltyCS) and
//           offers Karma (resolveResistFeat).
//         - checkDisabilities: at Shift 0 Endurance, each physical ability
//           above Good makes a Green FEAT (-2CS while impaired, Karma
//           allowed); failure drops it to the next lower printed number.
//           Endurance checks against its pre-damage rank.
//         - recordDamage keeps wasKnockedOut on hits taken while unconscious.
// scripts/modules/rest-system.js v1.8.0 - 2026-10-01
// v1.8.0: Healing/regeneration audit.
//         - RULED 2026-10-01 (Judge): a hit taken inside the 10-turn Recovery
//           window forfeits that day's Recovery ("...damaged again before
//           Recovery takes place, then only Healing is possible").
//           recordDamage stamps recoveryForfeitedDate (game date) when the
//           previous damage is less than RECOVERY_DELAY_SECONDS old and
//           Recovery has not already been used today; canAttemptRecovery
//           refuses on that date. Expires with the game date. Mirrors the
//           kernel's recoveryAllowed({ damagedAgain }) reason, which nothing
//           had set before. A hit AFTER the window only restarts the clock.
//         - stabilizeDying fallback Impaired Endurance AE now writes
//           selfPenaltyCS -2 like the other three creation sites (fixed-bug:
//           attackShift only penalised attacks; RAW is -2CS on all FEATs).
//         - canAttemptRecovery and attemptRegainConsciousness read REAL Health
//           via splitHealth (fixed-bug: a held Absorption pool made Recovery
//           report "Already at maximum Health"; waking wrote over the pool).
//         - Hourly Healing config stores formula "@endurance" + multiplier
//           (x2 medical care) instead of a frozen number, so the live
//           Endurance number is used on every tick. New refreshHealingEffect
//           re-labels the AE and updates the multiplier; setMedicalCare and
//           healImpairedEndurance call it (fixed-bug: toggling care or
//           restoring a rank after the damage left the auto rate stale).
//         - ensureHealingEffect no longer skips Solar Regeneration characters;
//           the Healing config carries the "solarShade" gate instead. RAW
//           (Solar Regeneration): "In darkness, inside buildings ... the
//           character heals normally." Regeneration (rest) still replaces it.
//         - healImpairedEndurance deletes an orphaned Impaired Endurance AE
//           when the rank is already back at the original.
// scripts/modules/rest-system.js v1.7.0 - 2026-09-09
// v1.7.0: Recovery and Healing act on REAL Health (health.value minus any
//         Absorption pool, absorption-pool.splitHealth) and write the pool
//         back on top. Before, applyHealing's min(max, ...) clamp would have
//         wiped a held pool and "Already at maximum Health" fired on the
//         pooled value.
// scripts/modules/rest-system.js v1.6.1 - 2026-09-05
// v1.6.1: healImpairedEndurance restores max Health by the Endurance delta
//         (relativeMaxHealth, RULED 2026-09-05) instead of F+A+S+E.
// v1.6.0: Slice 7b — Recovery / Healing / consciousness / stabilization onto
//         the faserip-rules damage kernel. Wake FEAT via regainConsciousnessFeat
//         (hard-coded 45/75/95 fallback ladder deleted); Recovery and Healing
//         amounts via recoveryAmount / healingPerHour / applyHealing; timing
//         from RECOVERY_DELAY_TURNS x TURN_SECONDS, HEALING_INTERVAL_TURNS,
//         STABILIZE_UNCONSCIOUS_HOURS, ENDURANCE_RANK_HEAL_DAYS. RULED
//         2026-09-05: the Endurance rank number while ranks are lost is the
//         HIGHEST of the reduced rank — enduranceNumber() reads the actor's
//         stored number first; healImpairedEndurance steps via
//         enduranceRestoreStep (intermediate ranks highest, original rank
//         gets its original number back from the originalEnduranceValue flag).
//         RULED 2026-09-05: a knockout forfeits only that damage's Recovery —
//         recordDamage clears wasKnockedOut on any hit that leaves the
//         character conscious (previousHealth > 0 and Health > 0).
// v1.5.0: Centralize NPC recovery/dying output policy, quiet routine NPC bookkeeping,
//         fix repeatable manual hourly Healing, and correct Recovery wording.
//         Manual Healing now keys from max(last damage, last manual heal) instead of
//         deleting the damage timestamp after the first heal.
// scripts/modules/rest-system.js v1.4.8 - 2026-08-20
// v1.4.8: Failed wake-up retry timers use shared round-aware duration logic;
//         active combat no longer turns N RAW rounds into CTT wall-clock seconds.
// scripts/modules/rest-system.js v1.4.7 - 2026-05-14
// v1.4.7: ensureHealingEffect now short-circuits when Regen-rest or
//         Regen-solar is configured on the actor. The generic hourly
//         Healing ongoing must not co-exist with a Regeneration power
//         per RAW — Regen replaces the End-rank/hour baseline, doesn't
//         stack with it. Paired with init.js syncPowerOngoingEffects
//         which removes any pre-existing Healing when Regen registers.
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
import { RANKS_ORDERED, rankValue } from "../rules/rules-reference.js";
import { getCurrentGameDate, relativeMaxHealth } from "./effects/ongoing-engine.js";
import { splitHealth } from "./effects/absorption-pool.js";
import { computeDuration } from "./effects/effect-engine.js";
import { healingSecondsRemaining, TURN_SECONDS } from "./recovery-timing.js";
import {
  recoveryAmount, healingPerHour, applyHealing, regainConsciousnessFeat,
  enduranceRestoreStep, RECOVERY_DELAY_TURNS, HEALING_INTERVAL_TURNS,
  STABILIZE_UNCONSCIOUS_HOURS, ENDURANCE_RANK_HEAL_DAYS,
} from "../lib/faserip-rules/faserip-damage.js";
import { rankByKey, rankDistance, shiftRank as kernelShiftRank } from "../lib/faserip-rules/faserip-kernel.js";
import { kernelKeyFor, foundryNameFor } from "../kernel/adapter.js";

const HEALING_INTERVAL_SECONDS = HEALING_INTERVAL_TURNS * TURN_SECONDS;
const RECOVERY_DELAY_SECONDS = RECOVERY_DELAY_TURNS * TURN_SECONDS;

// RAW "Endurance rank number": the character's own number (which is the
// highest of the reduced rank while ranks are lost), falling back to the
// rank's standard number when the stored value is unusable.
export function enduranceNumber(actor) {
  const v = Number(actor?.system?.abilities?.endurance?.value);
  if (Number.isFinite(v) && v > 0) return v;
  return rankValue(actor?.system?.abilities?.endurance?.rank || "") || 10;
}

const rollRange = ({ min, max }) => min + Math.floor(Math.random() * (max - min + 1));

const SCOPE = getFlagScope();

/** Knocked out (unconscious status, or waiting on the 0-Health wake FEAT). */
export function isUnconscious(actor) {
  if (!actor) return false;
  if (actor.getFlag(SCOPE, "awaitingWake")) return true;
  return !!actor.effects?.some(e => !e.disabled && e.statuses?.has?.("unconscious"));
}

/** Waiting on the 0-Health wake FEAT. Health 0 still counts for older worlds. */
export function isAwaitingWake(actor) {
  if (!actor || actor.system?.details?.isDead) return false;
  if (actor.getFlag(SCOPE, "awaitingWake")) return true;
  return splitHealth(actor).real <= 0;
}

/** FEAT shifts from Impaired Endurance and other all-FEAT penalties. */
function featPenaltyShifts(actor) {
  const cs = Number(actor?.system?.combatMods?.selfPenaltyCS) || 0;
  return cs ? [{ cs, reason: "impaired" }] : [];
}

/** Shifted rank, or null for ranks the kernel will not shift (Class 1000+). */
function safeShift(key, cs) {
  try { return kernelShiftRank(key, cs); } catch (_e) { return null; }
}

/** d100 for an Endurance-type FEAT with the owner's Karma offer. */
async function rollFeatWithKarma(actor, { sourceName, rankName }) {
  try {
    const { resolveResistFeat } = await import("./dice/dice-roller.js");
    const fr = await resolveResistFeat(actor, {
      sourceName, rank: rankName, requirement: "Green",
      declareTimeoutMs: 10000, localDeclareTimeoutMs: 10000
    });
    if (fr && typeof fr.cappedTotal === "number") {
      return { roll: fr.rollTotal, total: Math.min(100, fr.cappedTotal), karmaUsed: fr.karmaUsed || 0 };
    }
  } catch (e) {
    console.warn("[FASERIP WARN] FEAT karma routing failed; rolling plain:", e);
  }
  const roll = Math.floor(Math.random() * 100) + 1;
  return { roll, total: roll, karmaUsed: 0 };
}

/**
 * FASERIP Rest System
 * 
 * Recovery: Regain Endurance rank number in Health 10 turns after damage
 *   - Automatic at the 10-turn mark (processAutoRecovery); sheet button is manual
 *   - Once per day
 *   - Must be conscious, and not knocked out by that damage
 *   - A second hit inside the 10 turns forfeits the day's Recovery
 * 
 * Healing: Heal Endurance rank number each 600 turns (1 hour) after last damage
 *   - Can be used multiple times, once per elapsed hour
 *   - Works even if unconscious
 *   - Doubled with medical care
 *   - Timer resets if damaged again
 */

// ─── Scene / ledger / chat-routing helpers ────────────────────────────────────
// Rationale: Unconscious AE expiry fires scene-agnostically, so actors on other
// scenes emit wake-fail/wake-success chat cards during unrelated combat. Route
// all recovery-related cards through postRecoveryCard() which decides public /
// GM-whisper / ledger-only according to the unified npcRecoveryOutput policy.
// Routine NPC bookkeeping stays in the ledger/roster; only tactically meaningful
// transitions are surfaced during normal play.

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
    "recovery-heal":    "Recovered Health",
    "healing-tick":     "Hourly Healing",
    "shift0-warning":   "Reached Shift-0 Endurance",
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
export async function postRecoveryCard(actor, { content, eventType, detail, flags } = {}) {
  if (!actor) return { posted: false, mode: "none" };
  await appendRecoveryLog(actor, { event: eventType, detail });

  const isPC = !!actor?.hasPlayerOwner || actor?.system?.characterType === "player";
  const onScene = isOnActiveScene(actor);

  // One policy now governs NPC dying/recovery chatter. Routine bookkeeping
  // (dying rank ticks, failed wake checks, hourly healing, Endurance rehab)
  // belongs in the ledger/roster, not the chat log.
  let policy = "critical";
  try { policy = game.settings.get(SCOPE, "npcRecoveryOutput") || "critical"; }
  catch (_e) { /* setting may not exist during early init */ }

  const activeSceneCritical = new Set([
    "dying-start", "unconscious-start", "stabilized", "wake-success", "dying-death",
    "recovery-heal"
  ]);

  let mode = "none";
  if (isPC) {
    mode = "public";
  } else if (policy === "public-detailed") {
    mode = "public";
  } else if (policy === "gm-detailed") {
    mode = "gm";
  } else if (policy === "critical") {
    if (eventType === "shift0-warning" || eventType === "disability-check") mode = "gm";
    else if (onScene && activeSceneCritical.has(eventType)) mode = "public";
  }

  if (mode === "public") {
    await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }), flags });
    return { posted: true, mode };
  }
  if (mode === "gm") {
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags
    });
    return { posted: true, mode };
  }

  // silent/critical-routine: ledger + roster are the record.
  return { posted: false, mode: "ledger" };
}

/** True only for automated events that deserve an immediate toast. */
export function shouldNotifyRecoveryEvent(actor, eventType) {
  if (!actor) return false;
  if (actor?.hasPlayerOwner || actor?.system?.characterType === "player") return true;
  // NPC automation is deliberately quiet except for the one state that needs
  // immediate GM intervention before the next round.
  return eventType === "shift0-warning" && isOnActiveScene(actor);
}

export class RestSystem {
  
  /**
   * Check if actor can attempt Recovery (10 turns after damage)
   * @param {Actor} actor - The actor to check
   * @returns {Object} {canRest: boolean, reason: string}
   */
  static canAttemptRecovery(actor) {
    if (!actor) {
      return { canRest: false, reason: "No actor provided" };
    }

    // REAL Health (an Absorption pool rides on top and does not count)
    const { real: currentHealth, max: maxHealth } = splitHealth(actor);
    
    // Must be conscious (Health can rise above 0 while still knocked out)
    if (currentHealth <= 0 || isUnconscious(actor)) {
      return { 
        canRest: false, 
        reason: "Cannot recover while unconscious (Health must be above 0)" 
      };
    }

    // RAW: Recovery applies "provided the character is not knocked unconscious".
    // RULED 2026-09-05: the knockout forfeits that damage's Recovery only;
    // the flag clears on the next hit taken while conscious (recordDamage).
    if (actor.getFlag(SCOPE, "wasKnockedOut")) {
      return {
        canRest: false,
        reason: "No Recovery from the damage that knocked you out — only hourly Healing until you are hit again while conscious."
      };
    }

    // Already at max health
    if (currentHealth >= maxHealth) {
      return { 
        canRest: false, 
        reason: "Already at maximum Health" 
      };
    }

    // Check once-per-day limit (game days, not real-world days)
    const lastRecoveryDate = actor.getFlag(SCOPE, "lastRecoveryDate");
    const today = getCurrentGameDate();
    
    if (lastRecoveryDate === today) {
      return { 
        canRest: false, 
        reason: "Recovery can only be used once per day (already used today)" 
      };
    }

    // RULED 2026-10-01: damaged again inside the 10-turn window — only
    // Healing is possible today (kernel reason "damaged again").
    if (actor.getFlag(SCOPE, "recoveryForfeitedDate") === today) {
      return {
        canRest: false,
        reason: "Recovery forfeited — damaged again before Recovery took place; only hourly Healing is possible today"
      };
    }

    // RAW p.32: Recovery lands 10 turns after damage, measured in WORLD time
    // (RECOVERY_DELAY_TURNS x TURN_SECONDS), not seconds at the table.
    const lastDamageWorldTime = actor.getFlag(SCOPE, "lastDamageWorldTime");
    if (lastDamageWorldTime != null) {
      const worldNow = game.time?.worldTime ?? 0;
      const timeSinceDamage = worldNow - lastDamageWorldTime;
      const tenTurns = RECOVERY_DELAY_SECONDS;
      
      if (timeSinceDamage < tenTurns) {
        const remaining = Math.ceil((tenTurns - timeSinceDamage) / TURN_SECONDS);
        return { 
          canRest: false, 
          reason: `Must wait ${remaining} more turn(s) since last damage (10 turns total)` 
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
  static async attemptRecovery(actor, { auto = false } = {}) {
    const check = this.canAttemptRecovery(actor);
    
    if (!check.canRest) {
      if (!auto) ui.notifications.warn(check.reason);
      return { success: false, message: check.reason, healed: 0 };
    }

    const { real: currentHealth, pool: heldPool, max: maxHealth } = splitHealth(actor);
    
    const newHealth = applyHealing({ current: currentHealth, max: maxHealth, amount: recoveryAmount(enduranceNumber(actor)) });
    const healAmount = newHealth - currentHealth;

    // Apply healing (the Absorption pool rides on top unchanged)
    await actor.update({
      "system.attributes.health.value": newHealth + heldPool
    });

    // Mark recovery as used today (game day)
    const today = getCurrentGameDate();
    await actor.setFlag(SCOPE, "lastRecoveryDate", today);

    const message = `${actor.name} recovered ${healAmount} Health (10 turns without further damage)`;

    await postRecoveryCard(actor, {
      eventType: "recovery-heal",
      detail: `Health ${currentHealth} → ${newHealth}`,
      content: `<div style="background:#e8f5e9;border:1px solid #4CAF50;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> recovered <strong>${healAmount} Health</strong> 10 turns after the last damage.
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Health: ${currentHealth} → ${newHealth}
        </div>
      </div>`
    });

    // Sheet clicks get a confirmation toast; automatic Recovery follows the
    // normal routed-output policy.
    if (!auto || shouldNotifyRecoveryEvent(actor, "recovery-heal")) ui.notifications.info(message);
    
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

    const { real: currentHealth, max: maxHealth } = splitHealth(actor);

    // Already at max health (the Absorption pool does not count)
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
    const lastHealingWorldTime = actor.getFlag(SCOPE, "lastHealingWorldTime");
    const remainingSeconds = healingSecondsRemaining({
      worldNow,
      lastDamageWorldTime,
      lastHealingWorldTime,
      intervalSeconds: HEALING_INTERVAL_SECONDS
    });

    if (remainingSeconds == null) {
      return { canHeal: false, reason: "No healing clock is active" };
    }
    if (remainingSeconds > 0) {
      const remaining = Math.ceil(remainingSeconds / 60);
      return {
        canHeal: false,
        reason: `Must wait ${remaining} more minute(s) before the next hourly Healing`
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

    const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
    
    const { real: currentHealth, pool: heldPool, max: maxHealth } = splitHealth(actor);
    
    const newHealth = applyHealing({ current: currentHealth, max: maxHealth, amount: healingPerHour(enduranceNumber(actor), { medicalCare: hasMedicalCare }) });
    const healAmount = newHealth - currentHealth;

    // Apply healing (the Absorption pool rides on top unchanged)
    await actor.update({
      "system.attributes.health.value": newHealth + heldPool
    });

    // Healing is repeatable hourly. Preserve the original damage timestamp and
    // remember this heal as the anchor for the next hour instead of deleting
    // the clock after the first use.
    const worldNow = game.time?.worldTime ?? 0;
    await actor.setFlag(SCOPE, "lastHealingWorldTime", worldNow);
    try {
      const autoEnabled = game.settings?.get?.(SCOPE, "autoHealingEnabled") ?? true;
      if (autoEnabled && newHealth < maxHealth) await ensureHealingEffect(actor, worldNow);
    } catch (e) {
      console.warn("[FASERIP WARN] Could not rebase automatic Healing after manual heal:", e);
    }

    const medicalNote = hasMedicalCare ? " (with medical care)" : "";
    const message = `${actor.name} healed ${healAmount} Health${medicalNote}`;

    await postRecoveryCard(actor, {
      eventType: "healing-tick",
      detail: `Health ${currentHealth} → ${newHealth}${medicalNote}`,
      content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
        <strong>${actor.name}</strong> healed <strong>${healAmount} Health</strong> after another hour${medicalNote}.
        <div style="margin-top:4px;font-size:0.9em;color:#555;">
          Health: ${currentHealth} → ${newHealth}
        </div>
      </div>`
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
    // Keep a running automatic Healing effect on the new rate and label.
    try { await refreshHealingEffect(actor); } catch (e) {
      console.warn("[FASERIP WARN] Could not refresh automatic Healing after care toggle:", e);
    }
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

    const { real: currentHealth, pool: heldPool } = splitHealth(actor);
    
    // Must be knocked out at 0 Health (Healing may have raised Health since)
    if (!isAwaitingWake(actor)) {
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

    // Endurance FEAT, green succeeds (RULED 2026-09-05); Health on waking =
    // Endurance rank number (the impaired number while ranks are lost).
    // -2CS while Endurance ranks are lost (Impaired Abilities); Karma allowed.
    const enduranceRank = actor.system?.abilities?.endurance?.rank || "Typical";
    const enduranceKey = kernelKeyFor(enduranceRank) ?? "TY";
    const shifted = featPenaltyShifts(actor).length ? safeShift(enduranceKey, featPenaltyShifts(actor)[0].cs) : null;
    const shifts = shifted ? featPenaltyShifts(actor) : [];
    const effectiveName = shifted ? foundryNameFor(shifted.key, "dash") : enduranceRank;
    const fr = await rollFeatWithKarma(actor, { sourceName: "Regain Consciousness (Endurance FEAT)", rankName: effectiveName });
    const roll = fr.roll;
    const feat = regainConsciousnessFeat({ enduranceRank: enduranceKey, enduranceNumber: enduranceNumber(actor), roll: fr.total, karma: 0, shifts });
    const color = feat.color ?? (feat.success ? "green" : "white");
    const success = feat.success;
    
    if (success) {
      // Health on waking is the Endurance number, or what Healing has already
      // restored while unconscious if that is higher.
      const enduranceValue = Math.max(feat.wakeHealth, currentHealth);
      await actor.update({
        "system.attributes.health.value": enduranceValue + heldPool
      });
      await actor.unsetFlag(SCOPE, "awaitingWake");

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
            <strong>Endurance FEAT:</strong> ${color.toUpperCase()}<span class="msh-wake-roll"></span>
          </div>
          <div style="margin-bottom:6px;">
            <strong>Result:</strong> Success - Conscious with ${enduranceValue} Health
          </div>
          <div style="background:#c8e6c9;padding:8px;margin-top:8px;border-radius:3px;text-align:center;">
            <strong>Health: ${currentHealth} → ${enduranceValue}</strong>
          </div>
        </div>`,
        flags: { "msh-faserip": { wakeSuccess: { roll, color } } }
      });

      if (shouldNotifyRecoveryEvent(actor, "wake-success")) ui.notifications.info(message);
      
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

      // Hourly Healing keeps its clock from the last damage. Register it only
      // when nothing is running (an older world, or Healing disabled at cap).
      try {
        const enabled = game.settings?.get?.(SCOPE, "autoHealingEnabled") ?? true;
        const running = actor.getFlag(SCOPE, "ongoing.healing");
        if (enabled && !Number.isFinite(running?.startedAt)) {
          await ensureHealingEffect(actor, actor.getFlag(SCOPE, "lastDamageWorldTime") ?? (game.time?.worldTime ?? 0));
        }
      } catch (e) {
        console.warn("[FASERIP WARN] ensureHealingEffect failed on consciousness regain:", e);
      }

      return { success: true, message, rolled: roll, color };
      
    } else {
      // Failed - remain unconscious for 1-10 more rounds
      const rounds = rollRange(feat.retryTurns);

      // Create a new Unconscious effect. During active combat this is a RAW
      // round duration; outside combat the shared duration helper converts the
      // same number of FASERIP turns to elapsed seconds. CTT must never make a
      // combat knockout expire merely because the combatant cursor changed.
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
        duration: computeDuration({ rounds: Math.max(1, rounds), forceCombatRounds: true })
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
            <strong>Endurance FEAT:</strong> ${color.toUpperCase()}<span class="msh-wake-roll"></span>
          </div>
          <div style="margin-bottom:6px;">
            <strong>Result:</strong> Failed - Remains unconscious
          </div>
          <div style="background:#ffcdd2;padding:8px;margin-top:8px;border-radius:3px;text-align:center;">
            <strong>Unconscious for <span class="msh-wake-rounds">?</span> more rounds</strong>
          </div>
        </div>`,
        flags: { "msh-faserip": { wakeFail: { rounds, roll, color } } }
      });

      if (shouldNotifyRecoveryEvent(actor, "wake-fail")) ui.notifications.warn(message);
      
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
    const hours = rollRange(STABILIZE_UNCONSCIOUS_HOURS);
    if (currentHealth <= 0 || actor.getFlag(SCOPE, "awaitingWake")) {
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
          // -2CS on ALL FEATs (RAW Impaired Abilities) — selfPenaltyCS, same
          // key as the ongoing-engine creation sites. attackShift only
          // penalised attacks.
          changes: [{
            key: "system.combatMods.selfPenaltyCS",
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
    
    ui.notifications.info(message);
    
    return { success: true, message };
  }

  /**
   * Heal one rank of impaired Endurance
   * Rules: 1 rank/week normal, 1 rank/day with medical care
   * @param {Actor} actor - The actor to heal
   * @param {boolean} medicalCare - Whether under medical care (daily vs weekly healing)
   * @param {object} [opts]
   * @param {number} [opts.now] - Effective world time (CTT fires timeAdvanced
   *   before worldTime moves; init.js passes start + delta)
   * @param {number} [opts.anchor] - Value to store as lastHealed (init.js
   *   passes lastHealed + required so leftover time carries into the next rank)
   * @returns {Promise<Object>} {success: boolean, message: string, rankRestored: string|null}
   */
  static async healImpairedEndurance(actor, medicalCare = false, { now: nowOpt = null, anchor = null } = {}) {
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
    const now = Number.isFinite(Number(nowOpt)) ? Number(nowOpt) : game.time.worldTime;
    const dayInSeconds = 86400;
    const requiredTime = (medicalCare ? ENDURANCE_RANK_HEAL_DAYS.hospital : ENDURANCE_RANK_HEAL_DAYS.normal) * dayInSeconds;
    const timeSinceHealing = now - lastHealed;
    
    if (timeSinceHealing < requiredTime) {
      const timeRemaining = requiredTime - timeSinceHealing;
      const hoursRemaining = Math.ceil(timeRemaining / 3600);
      return { 
        success: false, 
        message: `${actor.name} needs ${hoursRemaining} more hours before healing another Endurance rank` 
      };
    }

    // Use the canonical rank ladder so Shift-0 spelling and Shift-X+ ranks
    // heal correctly. (An older inline list used "Shift 0" and stopped at UN.)
    const rankNames = RANKS_ORDERED;
    
    const currentRankIndex = rankNames.indexOf(currentEndurance);
    const originalRankIndex = rankNames.indexOf(originalEndurance);
    
    if (currentRankIndex === -1 || originalRankIndex === -1) {
      return { success: false, message: "Invalid Endurance rank data" };
    }

    // Calculate new Endurance rank (increase by 1 step)
    const newRankIndex = Math.min(currentRankIndex + 1, originalRankIndex);
    
    if (newRankIndex === currentRankIndex) {
      // Rank already back at the original (restored by the Recovery or
      // Healing power) — drop the orphaned -2CS record instead of leaving it.
      await actor.deleteEmbeddedDocuments("ActiveEffect", [impairedEffect.id], { mshIntentional: true });
      try { await actor.unsetFlag(SCOPE, "originalEndurance"); } catch (_e) {}
      try { await actor.unsetFlag(SCOPE, "originalEnduranceValue"); } catch (_e) {}
      return { success: false, message: `${actor.name}'s Endurance is already at maximum (${originalEndurance}); stale Impaired Endurance record removed` };
    }

    // RULED 2026-09-05: intermediate ranks carry the highest number of the
    // rank; the original rank gets the pre-damage number back.
    const step = enduranceRestoreStep({
      rankKey: kernelKeyFor(currentEndurance),
      originalRankKey: kernelKeyFor(originalEndurance),
      originalNumber: actor.getFlag(SCOPE, "originalEnduranceValue") ?? (game.msh?.getRankValue?.(originalEndurance) ?? 0),
    });
    const newRank = step.atCap ? originalEndurance : foundryNameFor(step.rank, "dash");
    const newValue = step.number;
    // RULED 2026-09-05: max Health moves by the Endurance delta (relative).
    const newHealthMax = relativeMaxHealth(actor, newValue);

    // Update actor Endurance rank, value, and derived health max
    await actor.update({
      "system.abilities.endurance.rank": newRank,
      "system.abilities.endurance.value": newValue,
      "system.attributes.health.max": newHealthMax
    });
    // Re-label a running automatic Healing effect for the new number.
    try { await refreshHealingEffect(actor); } catch (_e) {}

    // Check if fully healed
    if (newRankIndex >= originalRankIndex) {
      // Remove Impaired Endurance effect and the pre-damage Endurance record
      await actor.deleteEmbeddedDocuments("ActiveEffect", [impairedEffect.id], { mshIntentional: true });
      await actor.unsetFlag(SCOPE, "originalEndurance");
      await actor.unsetFlag(SCOPE, "originalEnduranceValue");
      
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
      
      if (shouldNotifyRecoveryEvent(actor, "fully-recovered")) ui.notifications.info(message);
      
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
        [`flags.${SCOPE}.lastHealed`]: Number.isFinite(Number(anchor)) ? Number(anchor) : now,
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
      
      if (shouldNotifyRecoveryEvent(actor, "endurance-healed")) ui.notifications.info(message);
      
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
 * @param {object} [opts]
 * @param {number} [opts.previousHealth] - Health before this damage; when both
 *   it and the current Health are above 0 this is a conscious hit and the
 *   knockout Recovery gate is cleared (RULED 2026-09-05).
 */
export async function recordDamage(actor, { previousHealth = null } = {}) {
  const now = Date.now();
  const worldNow = game.time?.worldTime ?? 0;

  // RULED 2026-10-01: a second hit inside the 10-turn Recovery window
  // forfeits today's Recovery. Read the previous stamp before overwriting it.
  try {
    const prevDamageWT = actor.getFlag(SCOPE, "lastDamageWorldTime");
    const today = getCurrentGameDate();
    if (Number.isFinite(prevDamageWT)
        && worldNow - prevDamageWT < RECOVERY_DELAY_SECONDS
        && actor.getFlag(SCOPE, "lastRecoveryDate") !== today
        && actor.getFlag(SCOPE, "recoveryForfeitedDate") !== today) {
      await safeActorSetFlag(actor, SCOPE, "recoveryForfeitedDate", today);
      if (game.settings.get(SCOPE, "debugMode")) {
        console.log(`FASERIP | ${actor.name} damaged again inside the Recovery window — Recovery forfeited for ${today}`);
      }
    }
  } catch (e) {
    console.warn("[FASERIP WARN] Recovery-forfeit check failed:", e);
  }

  await safeActorSetFlag(actor, SCOPE, "lastDamageTime", now);
  await safeActorSetFlag(actor, SCOPE, "lastDamageWorldTime", worldNow);
  try { await actor.unsetFlag(SCOPE, "lastHealingWorldTime"); } catch (_e) {}

  const healthNow = actor.system?.attributes?.health?.value ?? 0;
  if (previousHealth != null && previousHealth > 0 && healthNow > 0 && !isUnconscious(actor) && actor.getFlag(SCOPE, "wasKnockedOut")) {
    try { await actor.unsetFlag(SCOPE, "wasKnockedOut"); } catch (_e) {}
  }

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

  // Judge reading 2026-10-01: Healing runs at 0 Health and while knocked
  // out, timed from the last damage. It registers even when the character
  // is dying; the ongoing engine's heal executor lets the hours pass without
  // healing while the dying effect is active, so nothing bursts afterwards.

  // Skip if a (resting) Regeneration power supersedes normal healing: it
  // replaces the End-rank/hour baseline rather than stacking on top.
  // Solar Regeneration does NOT skip — RAW: "In darkness, inside buildings,
  // and in other similar situations, the character heals normally." The
  // solarShade gate below pauses Healing only while Solar is healing.
  const hasRegenRest = !!actor.getFlag(SCOPE, "ongoing.regeneration");
  if (hasRegenRest) {
    if (game.settings.get(SCOPE, "debugMode")) {
      console.log(`FASERIP | Skipping healing registration for ${actor.name} — Regeneration active`);
    }
    return;
  }

  const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
  const healPerHour = healingPerHour(enduranceNumber(actor), { medicalCare: hasMedicalCare });

  const config = {
    type: "heal",
    stat: "health",
    // Live Endurance number on every tick (reduced-rank number while ranks
    // are lost), x2 under medical care — never a frozen amount.
    formula: "@endurance",
    multiplier: hasMedicalCare ? 2 : 1,
    rate: 1,
    cycle: "hour",
    count: -1,
    gate: "solarShade",
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
      name: `Healing (${healPerHour} HP/hour${hasMedicalCare ? ', medical' : ''})`
    });
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Healing (${healPerHour} HP/hour${hasMedicalCare ? ', medical' : ''})`,
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
    console.log(`FASERIP | Healing registered for ${actor.name}: ${healPerHour} HP/hour, start=${worldNow}`);
  }
}

/**
 * Re-label a registered automatic Healing effect and update its medical-care
 * multiplier after the Endurance number or care status changes. Leaves the
 * clock (startedAt) alone. No-op when no Healing config is registered.
 */
export async function refreshHealingEffect(actor) {
  if (!actor) return;
  const config = actor.getFlag(SCOPE, "ongoing.healing");
  if (!config || typeof config !== "object") return;
  const hasMedicalCare = actor.getFlag(SCOPE, "medicalCare") ?? false;
  const healPerHour = healingPerHour(enduranceNumber(actor), { medicalCare: hasMedicalCare });
  await safeActorSetFlag(actor, SCOPE, "ongoing.healing", {
    ...config,
    formula: "@endurance",
    multiplier: hasMedicalCare ? 2 : 1,
    gate: "solarShade",
  });
  const ae = actor.effects?.find(e => e.flags?.[SCOPE]?.ongoingId === "healing");
  if (ae) {
    await ae.update({
      [`flags.${SCOPE}.medicalCare`]: hasMedicalCare,
      name: `Healing (${healPerHour} HP/hour${hasMedicalCare ? ', medical' : ''})`
    });
  }
}

/**
 * Automatic Recovery (RAW: "Ten turns after a character takes damage, he
 * regains Health..."). Applies only when the 10-turn mark falls inside this
 * time advance, so Recovery lands at the mark or not at all. Gated by
 * autoHealingEnabled; canAttemptRecovery enforces the rest (once per day,
 * knockout, second hit, conscious).
 */
export async function processAutoRecovery(actor, worldNow, dt) {
  if (!actor || !(dt > 0)) return;
  const enabled = game.settings?.get?.(SCOPE, "autoHealingEnabled") ?? true;
  if (!enabled || actor.system?.details?.isDead) return;
  const lastDamage = actor.getFlag(SCOPE, "lastDamageWorldTime");
  if (!Number.isFinite(lastDamage)) return;
  const mark = lastDamage + RECOVERY_DELAY_SECONDS;
  if (mark > worldNow || mark <= worldNow - dt) return;
  if (!RestSystem.canAttemptRecovery(actor).canRest) return;
  await RestSystem.attemptRecovery(actor, { auto: true });
}

const DISABILITY_KEYS = ["fighting", "agility", "strength", "endurance"];

/**
 * Disabilities (RAW p.32): a character who slips to Shift 0 Endurance rolls a
 * Green FEAT for each physical ability above Good; failure reduces it to the
 * next lower printed number. Endurance checks its pre-damage rank, and a loss
 * lowers the rank it heals back to. -2CS applies while Endurance is impaired.
 */
export async function checkDisabilities(actor) {
  if (!actor) return [];
  const results = [];
  const shifts = featPenaltyShifts(actor);
  const cs = shifts.reduce((t, x) => t + x.cs, 0);

  for (const key of DISABILITY_KEYS) {
    const isEnd = key === "endurance";
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    const rankName = isEnd
      ? (actor.getFlag(SCOPE, "originalEndurance") || actor.system?.abilities?.endurance?.rank)
      : actor.system?.abilities?.[key]?.rank;
    const rk = kernelKeyFor(rankName);
    if (!rk || rankDistance("GD", rk) <= 0) continue;

    const lower = safeShift(rk, -1);
    if (!lower) continue;
    const effShift = cs ? safeShift(rk, cs) : null;
    const effName = effShift ? foundryNameFor(effShift.key, "dash") : rankName;
    const fr = await rollFeatWithKarma(actor, { sourceName: `Disability check (${label})`, rankName: effName });
    const color = String(game.msh?.rollUniversalTable?.(effName, fr.total) || "white").toLowerCase();
    if (color !== "white") {
      results.push({ label, rankName, color, roll: fr.roll, total: fr.total, lost: false });
      continue;
    }

    const newName = foundryNameFor(lower.key, "dash");
    const newNumber = lower.standard;
    if (isEnd) {
      await actor.setFlag(SCOPE, "originalEndurance", newName);
      await actor.setFlag(SCOPE, "originalEnduranceValue", newNumber);
      const dyingAE = actor.effects.find(e => e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying"));
      if (dyingAE) await dyingAE.setFlag(SCOPE, "originalEndurance", newName);
      const impaired = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));
      if (impaired) {
        await impaired.update({
          name: `Impaired Endurance (${actor.system?.abilities?.endurance?.rank} of ${newName})`,
          [`flags.${SCOPE}.originalEndurance`]: newName
        });
      }
    } else {
      const oldNumber = Number(actor.system?.abilities?.[key]?.value) || rankByKey(rk).standard;
      const curMax = Number(actor.system?.attributes?.health?.max) || 0;
      const newMax = Math.max(0, curMax - Math.max(0, oldNumber - newNumber));
      const { real, pool } = splitHealth(actor);
      await actor.update({
        [`system.abilities.${key}.rank`]: newName,
        [`system.abilities.${key}.value`]: newNumber,
        "system.attributes.health.max": newMax,
        "system.attributes.health.value": Math.min(real, newMax) + pool
      }, { mshDyingTick: true });
    }
    results.push({ label, rankName, color, roll: fr.roll, total: fr.total, lost: true, newName, newNumber });
  }

  if (results.length) {
    const rows = results.map(r => r.lost
      ? `<div><strong>${r.label}</strong> ${r.rankName}: ${r.total} WHITE — reduced to <strong>${r.newName} (${r.newNumber})</strong></div>`
      : `<div><strong>${r.label}</strong> ${r.rankName}: ${r.total} ${r.color.toUpperCase()} — unharmed</div>`).join("");
    await postRecoveryCard(actor, {
      eventType: "disability-check",
      detail: results.filter(r => r.lost).map(r => `${r.label} → ${r.newName}`).join(", ") || "no abilities lost",
      content: `<div style="background:#fff3e0;border:2px solid #ff9800;padding:10px;border-radius:5px;">
        <div style="font-weight:bold;color:#e65100;margin-bottom:4px;">Disabilities — ${actor.name} at Shift-0 Endurance</div>
        <div style="font-size:.9em;color:#555;margin-bottom:4px;">Green FEAT for each physical ability above Good${cs ? ` (${cs}CS impaired)` : ""}. Lost ranks return only through experience.</div>
        ${rows}
      </div>`
    });
  }
  return results;
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
  game.msh.rest.refreshHealingEffect = refreshHealingEffect;
  game.msh.rest.postRecoveryCard = postRecoveryCard;
  game.msh.rest.shouldNotifyRecoveryEvent = shouldNotifyRecoveryEvent;
  game.msh.rest.isOnActiveScene = isOnActiveScene;
  game.msh.rest.isUnconscious = isUnconscious;
  game.msh.rest.isAwaitingWake = isAwaitingWake;
  game.msh.rest.checkDisabilities = checkDisabilities;
  
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
    
    // Still waiting on the 0-Health wake FEAT (Health may have risen
    // through Healing while unconscious)
    if (!isAwaitingWake(actor)) return;

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