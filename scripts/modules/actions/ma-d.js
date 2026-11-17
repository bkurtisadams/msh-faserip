// scripts/modules/actions/ma-d.js v1.1.0 - 2026-11-16
// v1.1.0: getMartialArtsFx / maDOpensEffectsGate — read the Edit Talent
//         Special Flags (ignore-armor-fx, no-damage-needed, study-required)
//         to decide whether Stun/Slam checks fire without damage through.
// Martial Arts D / A helper module.
//   - Talent detection (MA-D, MA-A) via talent-item name match
//   - Study lifecycle: create, status lookup, list, clear
//   - State stored as Active Effects on the attacker with
//     flags["msh-faserip"].maDStudy = { targetUuid, targetName,
//     startedRound, combatId }. AE is a pure tracker (no `changes`),
//     manually deletable by user/GM.
// Lifecycle hooks (combat-end auto-clear) live in init.js.
// Pipeline integration (blunt-attack-action passing maDActive) and
// UI (talents tab card) live in subsequent slices.

import { applyEffect } from "../effects/effect-engine.js";

const SCOPE = "msh-faserip";
const STUDY_FLAG = "maDStudy";
const STUDY_ROUNDS_REQUIRED = 2;

// ── Talent detection ────────────────────────────────────────────────

function _matchTalentName(name, letter) {
  const n = name.toLowerCase();
  const L = letter.toLowerCase();
  // Matches "Martial Arts D", "Martial Arts-D", "Martial Arts (D)",
  // "Martial Arts: D", "MA-D" — common variants players might enter.
  if (n.includes(`martial arts ${L}`)) return true;
  if (n.includes(`martial arts-${L}`)) return true;
  if (n.includes(`martial arts: ${L}`)) return true;
  if (n.includes("martial arts") && n.includes(`(${L})`)) return true;
  if (n === `ma-${L}` || n === `ma ${L}`) return true;
  return false;
}

export function hasMartialArtsD(actor) {
  if (!actor) return false;
  return actor.items.some(i => i.type === "talent" && _matchTalentName(i.name, "d"));
}

export function hasMartialArtsA(actor) {
  if (!actor) return false;
  return actor.items.some(i => i.type === "talent" && _matchTalentName(i.name, "a"));
}

// ── Talent-flag driven Stun/Slam effects ────────────────────────────
// Reads the Special Flags checkboxes on the Edit Talent dialog
// (system.flags) across all of the actor's talents. A talent counts when
// its appliesTo list includes this actionType (or appliesTo is empty).
// Legacy MA-D items saved before flags existed fall back to the RAW
// defaults by name match.
//   ignore-armor-fx  — Body Armor ignored for Stun/Slam determination
//   no-damage-needed — Stun/Slam check fires even with 0 damage through
//   study-required   — above only once the target's been studied 2 rds
const MAD_DEFAULT_FLAGS = ["ignore-armor-fx", "no-damage-needed", "study-required"];

export function getMartialArtsFx(actor, actionType = "") {
  const out = { ignoreArmorFx: false, noDamageNeeded: false, studyRequired: false, talentName: "" };
  if (!actor) return out;
  const at = String(actionType || "").toLowerCase();
  for (const i of actor.items) {
    if (i.type !== "talent") continue;
    let flags = Array.isArray(i.system?.flags) ? i.system.flags : [];
    if (!flags.length && _matchTalentName(i.name, "d")) flags = MAD_DEFAULT_FLAGS;
    const fxIgnore = flags.includes("ignore-armor-fx");
    const fxNoDmg  = flags.includes("no-damage-needed");
    if (!fxIgnore && !fxNoDmg) continue;
    const applies = Array.isArray(i.system?.appliesTo) ? i.system.appliesTo : [];
    if (applies.length && at && !applies.includes(at)) continue;
    out.ignoreArmorFx  ||= fxIgnore;
    out.noDamageNeeded ||= fxNoDmg;
    out.studyRequired  ||= flags.includes("study-required");
    out.talentName     ||= i.name;
  }
  return out;
}

// Per-target resolution used by attack-action. Returns true when the
// Stun/Slam damage gate should be opened for this target.
//   engaged: choice.maDEngaged — false = player unticked the bypass;
//            null/undefined = no toggle shown (defer to study status).
//   isForceField: the target's applicable defense is a Force Field —
//            RAW: MA-D does not bypass FFs, so the normal gate applies.
export function maDOpensEffectsGate(actor, { actionType, targetUuid, engaged, isForceField } = {}) {
  const fx = getMartialArtsFx(actor, actionType);
  if (!fx.ignoreArmorFx && !fx.noDamageNeeded) return false;
  if (isForceField) return false;
  if (engaged === false) return false;
  if (fx.studyRequired) {
    if (!targetUuid) return false;
    if (!getStudyStatus(actor, targetUuid).complete) return false;
  }
  return true;
}

// ── Study state lookup ──────────────────────────────────────────────

export function getStudyEffect(actor, targetUuid) {
  if (!actor || !targetUuid) return null;
  return actor.effects.find(e =>
    e.flags?.[SCOPE]?.[STUDY_FLAG]?.targetUuid === targetUuid
  ) || null;
}
// Status snapshot for a single target relative to current combat.
// Returns { studying, rounds, complete, stale, effect? }
//   - studying: there is an effect in the active combat for this target
//   - rounds:   elapsed rounds since startedRound (>= 0)
//   - complete: rounds >= STUDY_ROUNDS_REQUIRED
//   - stale:    effect exists but belongs to a different / ended combat
export function getStudyStatus(actor, targetUuid) {
  const effect = getStudyEffect(actor, targetUuid);
  if (!effect) return { studying: false, rounds: 0, complete: false, stale: false };

  const flag = effect.flags?.[SCOPE]?.[STUDY_FLAG] || {};
  const currentRound = game.combat?.round || 0;
  const currentCombatId = game.combat?.id || null;

  // Only valid in same active combat
  if (!currentCombatId || flag.combatId !== currentCombatId) {
    return { studying: false, rounds: 0, complete: false, stale: true, effect };
  }

  const rounds = Math.max(0, currentRound - (flag.startedRound || 0));
  const complete = rounds >= STUDY_ROUNDS_REQUIRED;
  return { studying: true, rounds, complete, stale: false, effect };
}

// ── Study creation ──────────────────────────────────────────────────

// Accepts a TokenDocument, Token (placeable), or Actor as `target`.
// Returns the created (or existing) ActiveEffect document, or null.
export async function recordStudy(actor, target) {
  if (!actor) return null;
  if (!hasMartialArtsD(actor)) {
    ui.notifications?.warn(`${actor.name} doesn't have Martial Arts D.`);
    return null;
  }
  if (!game.combat) {
    ui.notifications?.warn("MA-D study requires active combat.");
    return null;
  }
  if (!target) {
    ui.notifications?.warn("MA-D study requires a target.");
    return null;
  }

  // Resolve target → uuid + display name. TokenDocuments and Actors expose
  // .uuid directly; Token placeables wrap a .document.
  const targetDoc = target?.document ?? target;
  const targetActor = target?.actor ?? targetDoc?.actor ?? targetDoc;
  const targetUuid = targetDoc?.uuid || targetActor?.uuid || null;
  const targetName = targetActor?.name || targetDoc?.name || target?.name || "Unknown";

  if (!targetUuid) {
    ui.notifications?.warn("Could not resolve target UUID for MA-D study.");
    return null;
  }

  // Idempotent: same target + same combat → return existing effect.
  // Stale entry from a prior combat is replaced.
  const existing = getStudyEffect(actor, targetUuid);
  if (existing) {
    const flag = existing.flags?.[SCOPE]?.[STUDY_FLAG];
    if (flag?.combatId === game.combat.id) {
      ui.notifications?.info(`${actor.name} is already studying ${targetName}.`);
      return existing;
    }
    await existing.delete();
  }

  const effect = await applyEffect(actor, {
    name: `Studying ${targetName} (MA-D)`,
    img: "icons/svg/target.svg",
    changes: [],
    statuses: [],
    flags: {
      [SCOPE]: {
        [STUDY_FLAG]: {
          targetUuid,
          targetName,
          startedRound: game.combat.round || 0,
          combatId: game.combat.id
        }
      }
    }
  });

  if (effect) {
    ui.notifications?.info(`${actor.name} begins studying ${targetName}. (MA-D activates in ${STUDY_ROUNDS_REQUIRED} rounds.)`);
  }
  return effect;
}

// ── Cleanup ─────────────────────────────────────────────────────────

// Delete all study effects on an actor. If combatId is provided, only
// deletes effects matching that combat.
export async function clearStudies(actor, { combatId = null } = {}) {
  if (!actor) return 0;
  const toDelete = [];
  for (const e of actor.effects) {
    const flag = e.flags?.[SCOPE]?.[STUDY_FLAG];
    if (!flag) continue;
    if (combatId && flag.combatId !== combatId) continue;
    toDelete.push(e.id);
  }
  if (!toDelete.length) return 0;
  await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  return toDelete.length;
}

// Called from the deleteCombat hook in init.js. Walks all combatants,
// removes any study effects tied to the ending combat.
export async function clearStudiesForCombat(combat) {
  if (!combat) return;
  const combatId = combat.id;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    try {
      await clearStudies(actor, { combatId });
    } catch (e) {
      console.warn("[FASERIP] clearStudiesForCombat failed for", actor.name, e);
    }
  }
}
