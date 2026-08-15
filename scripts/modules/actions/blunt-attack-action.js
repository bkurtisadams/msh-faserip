// blunt-attack-action.js v3.7.0 - 2026-08-14
// v3.7.0: Add compact Combined Attack option for Blunt Attack. A first attacker
//         declares against one target; a second blunt attacker can join from the
//         same compact row. Pending declarations are chat-flagged per target/round.
//         The lower-damage attacker makes the Agility FEAT on their owning client;
//         the higher-damage attack resolves on its owning client at next-rank-min
//         damage. Multi and Combined are mutually exclusive.
// v3.6.1: CS Reason field now persists across reopens (lastBluntReason flag,
//         gated by Remember). Replaces the unused csNotes flag read.
// blunt-attack-action.js v3.6.0 - 2026-05-16
// v3.6.0: MA-D / MA-A zone — three-state badge between header and CS row
//         when attacker has Martial Arts D or A. State 1 (idle/no study)
//         offers a [Begin study] button when in combat and a target is
//         selected. State 2 (studying) shows round-of-2 countdown. State
//         3 (armed) shows the engage-bypass toggle, default-on. Toggle
//         state captured as choice.maDEngaged and passed through to
//         _executeSingleAttack for pipeline use (Stun/Slam armor bypass
//         in attack-action.js — next slice). Begin-study button calls
//         recordStudy() from ma-d.js and updates the zone in place to
//         State 2 without resetting other dialog fields.
// v3.5.0: Manual CS only — remove talent/power auto-detection.
//         CS row is a simple number input + ? reference panel.
//         No talent chips, no savedCheckedMods, no talentFlags.
// v3.2.0: Move mode buttons to titlebar (injected during render), remove target/mode row,
//         narrow dialog to 360px
// v2.1.2: Simplify chip logic — one chip per talent, Ultimate replaces normal when
//         rankOverride is set (no duplication, no mutual exclusion needed)
// v2.1.1: Fix chip persistence — save/restore active chip states via lastBluntActiveChips flag,
//         render chips with correct active class on dialog open, prevent CS double-counting
// v2.1.0: Ultimate Skill chip — talents with rankOverride get gold ★ chip that computes
//         CS delta to override rank, mutually exclusive with normal +NCS chip for same talent
// v2.0.0: Redesign dialog to v2 mockup — header banner, summary line, talent chips,
//         consolidated options box, effect preview grid, updated CSS classes
// v1.5.0: Restyle dialog with frp-dlg CSS classes from v3 mockup (attack-dialog.css), remove inline styles
// v1.4.16: Pass weapon base damage to computeBluntDamage for minimum damage enforcement
// v1.4.15: Detect and display combat talents (Martial Arts A/B/D/E, Boxing) in dialog
// v1.4.14: Add csNotes to shiftBreakdown for chat card hover text
// v1.4.13: Add CS Notes text input row between Modifiers and Multi-Attack, restore UI colors
// v1.4.12: UI color scheme - Damage=light red, Karma=light blue, border highlights on selection
// v1.4.11: Use getTargetData() from action-utils.js for target acquisition
// v1.4.10: Compute initial pull punch max from saved source (weapon/object)
// v1.4.9: Auto-populate pulled damage to current max when enabling checkbox
// v1.4.8: Fix pull punch - reset resultCap and damage when checkbox unchecked
// v1.4.7: Track shiftBreakdown for detailed CS hover (manual, multi-attack, adjacent)
// v1.4.6: Compact pull punch row, add objectValue handler for damage update
// v1.4.5: Fix CS field jitter (box-sizing, visibility for reset btn, transparent border when CS=0)
// v1.4.4: Pass attackNumber/totalAttacks to chat card for multi-attack display
// v1.4.3: Yellow box on karma number, show multiple target names in dialog
// v1.4.2: Compact karma section to match CS field size
// v1.4.1: Fix pull punch persistence (save enabled state) and refresh value when source changes
// v1.4.0: Multi-Attack/Pull Punch as inline radio/checkbox rows, CS field with directional colors and reset button
// v1.2.0: Swap Multi-Attack/Pull Punch order, increase padding/font sizes throughout
// v1.1.2: Fix target name to use token name, increase font sizes
// v1.1.1: Fix multi-attack toggle, add dynamic highlighting for non-default saved values
// v1.1.0: Compact dialog prototype - reorganized layout, target armor display, dynamic updates
// v1.0.1: Fix column shift persistence - always load from saved flag, not opts

// scripts/modules/actions/blunt-attack-action.js
import { AttackAction } from "./attack-action.js";
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment,
  resolveResistFeatSequence
} from "../dice/dice-roller.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo, valueToRank,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetData, getBodyArmorValues, applyDamageToTargets,
  buildModeSelector, attachModeSelectorHandlers, debugLog, setupModeSelector,
  applyCapabilitiesToDialog, buildInlineFeatDisplay
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { buildColorOutcome } from "../dice/color-results.js";
import { hasMartialArtsD, hasMartialArtsA, getStudyStatus, recordStudy } from "./ma-d.js";
import { applyColumnShifts } from "../dice/column-shifts.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { RANK_ABBR, RANK_RANGES, RANK_VALUES } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
import { showFaseripDialog } from "./dialog-shim.js";
// NOTE: resolveCombatMode not imported here to avoid circular dependency

const COMBINED_SCOPE = "msh-faserip";
const COMBINED_PENDING_FLAG = "combinedAttack";
const COMBINED_RESOLUTION_FLAG = "combinedAttackResolution";
const COMBINED_MAX_AGE_MS = 5 * 60 * 1000;

function esc(value) {
  const text = String(value ?? "");
  try {
    return foundry?.utils?.escapeHTML ? foundry.utils.escapeHTML(text) : text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  } catch (_) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}

function actorFromUuidDocument(doc) {
  if (!doc) return null;
  if (doc.documentName === "Token") return doc.actor ?? null;
  if (doc.documentName === "Actor") return doc;
  return doc.actor ?? null;
}

async function resolveActorUuid(uuid) {
  if (!uuid) return null;
  try {
    return actorFromUuidDocument(await fromUuid(uuid));
  } catch (err) {
    console.warn("[FASERIP] Combined Attack: could not resolve actor", uuid, err);
    return null;
  }
}

async function resolveTargetUuid(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    if (doc.documentName === "Token") {
      return doc.object
        ?? canvas?.tokens?.get?.(doc.id)
        ?? { document: doc, actor: doc.actor, name: doc.name, id: doc.id };
    }
    if (doc.documentName === "Actor") {
      return doc.getActiveTokens?.()?.[0]
        ?? { document: null, actor: doc, name: doc.name, id: doc.id };
    }
    return null;
  } catch (err) {
    console.warn("[FASERIP] Combined Attack: could not resolve target", uuid, err);
    return null;
  }
}

function targetUuidOf(target) {
  return target?.document?.uuid ?? target?.actor?.uuid ?? null;
}

function getCombinedDamageInfo(damageA, damageB) {
  const a = Math.max(0, Number(damageA) || 0);
  const b = Math.max(0, Number(damageB) || 0);
  const higherDamage = Math.max(a, b);
  const difference = Math.abs(a - b);
  const higherRank = valueToRank(higherDamage);
  const idx = RANKS.indexOf(higherRank);
  const nextRank = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : higherRank;
  const nextMin = RANK_RANGES[nextRank]?.[0] ?? RANK_VALUES[nextRank] ?? higherDamage;
  const combinedDamage = Number.isFinite(nextMin) ? Number(nextMin) : higherDamage;
  return {
    valid: difference <= 10,
    difference,
    higherDamage,
    higherRank,
    combinedRank: nextRank,
    combinedDamage
  };
}

function declaredCombinedDamage(choice) {
  const base = Math.max(0, Number(choice?.damage) || 0);
  const pulled = Math.max(0, Number(choice?.pulledDamage) || 0);
  return pulled > 0 ? Math.min(base, pulled) : base;
}

function resolvedPendingIds() {
  const ids = new Set();
  for (const msg of (game.messages?.contents ?? [])) {
    const r = msg.getFlag?.(COMBINED_SCOPE, COMBINED_RESOLUTION_FLAG)
      ?? msg.flags?.[COMBINED_SCOPE]?.[COMBINED_RESOLUTION_FLAG];
    if (r?.pendingMessageId) ids.add(r.pendingMessageId);
  }
  return ids;
}

function pendingIsCurrent(data) {
  if (!data) return false;
  const combat = game.combat;
  if (combat) {
    return data.combatId === combat.id && Number(data.round) === Number(combat.round);
  }
  if (data.combatId) return false;
  const createdAt = Number(data.createdAt) || 0;
  return createdAt > 0 && (Date.now() - createdAt) <= COMBINED_MAX_AGE_MS;
}

function findPendingCombinedAttack(targetUuid, actorUuid) {
  if (!targetUuid) return null;
  const resolved = resolvedPendingIds();
  const messages = [...(game.messages?.contents ?? [])].reverse();
  for (const message of messages) {
    if (resolved.has(message.id)) continue;
    const data = message.getFlag?.(COMBINED_SCOPE, COMBINED_PENDING_FLAG)
      ?? message.flags?.[COMBINED_SCOPE]?.[COMBINED_PENDING_FLAG];
    if (!data || data.kind !== "blunt" || data.state !== "pending") continue;
    if (!pendingIsCurrent(data)) continue;
    if (data.targetUuid !== targetUuid) continue;
    if (data.attackerActorUuid === actorUuid) continue;
    return { message, data };
  }
  return null;
}

function serializeCombinedChoice(choice) {
  return {
    src: choice?.src || "hands",
    itemId: choice?.itemId || "",
    objectName: choice?.objectName || "",
    objectRank: choice?.objectRank || "Excellent",
    objectValue: Number(choice?.objectValue) || 0,
    shift: Number(choice?.shift) || 0,
    karma: Number(choice?.karma) || 0,
    spendKarma: !!choice?.spendKarma,
    pulledDamage: Number(choice?.pulledDamage) || 0,
    resultCap: choice?.resultCap || "none",
    skipDice: !!choice?.skipDice,
    weaponMat: choice?.weaponMat || "",
    weaponName: choice?.weaponName || "",
    damage: Number(choice?.damage) || 0,
    note: choice?.note || "",
    maDEngaged: !!choice?.maDEngaged,
    csNotes: choice?.csNotes || "",
    effectiveFightingRank: choice?.effectiveFightingRank || "",
    shiftBreakdown: choice?.shiftBreakdown ? { ...choice.shiftBreakdown } : null
  };
}

function serializeCombinedOpts(opts = {}) {
  return {
    mode: opts?.mode || "semi",
    autoApply: opts?.autoApply === true,
    showConfirm: opts?.showConfirm !== false,
    shift: Number(opts?.shift) || 0,
    featCs: Number(opts?.featCs) || 0,
    fromTalent: opts?.fromTalent === true,
    talentName: opts?.talentName || "",
    deviceAbility: opts?.deviceAbility && typeof opts.deviceAbility === "object"
      ? { rank: opts.deviceAbility.rank || "", value: Number(opts.deviceAbility.value) || 0 }
      : null
  };
}

async function markCombinedResolved(pendingMessageId, status, content, extra = {}) {
  return ChatMessage.create({
    content,
    flags: {
      [COMBINED_SCOPE]: {
        [COMBINED_RESOLUTION_FLAG]: {
          pendingMessageId,
          status,
          resolvedAt: Date.now(),
          ...extra
        }
      }
    }
  });
}

async function rollCombinedAgilityFeat(actor) {
  const agility = getAbilityInfo(actor, "agility");
  const payload = {
    actorUuid: actor.uuid,
    sourceName: "Combined Attack — Agility FEAT",
    rank: agility.rank,
    requirement: "green",
    declareTimeoutMs: 10000
  };

  let result = null;
  const remoteOwner = game.users?.find?.(u =>
    u.active && !u.isGM && u.id !== game.user.id && actor.testUserPermission?.(u, "OWNER")
  );

  try {
    if (remoteOwner && game.msh?.socket) {
      ui.notifications?.info?.(`Waiting for ${remoteOwner.name}: Combined Attack Agility FEAT...`);
      result = await game.msh.socket.executeAsUser("resolveResistFeat", remoteOwner.id, payload);
    } else if (game.user.isGM || actor.isOwner) {
      result = await resolveResistFeatSequence(actor, { ...payload, declareTimeoutMs: 0 });
    } else if (game.msh?.socket) {
      result = await game.msh.socket.executeAsGM("resolveResistFeat", payload);
    } else {
      result = await resolveResistFeatSequence(actor, { ...payload, skipPrompt: true });
    }
  } catch (err) {
    console.error("[FASERIP] Combined Attack Agility FEAT failed", err);
    return { success: false, error: true, rank: agility.rank, color: "white", rollTotal: null, cappedTotal: null, karmaUsed: 0 };
  }

  const cappedTotal = Number(result?.cappedTotal ?? result?.rollTotal ?? 0);
  const color = String(rollUniversalTable(agility.rank, cappedTotal) || "white").toLowerCase();
  return {
    success: ["green", "yellow", "red"].includes(color),
    rank: agility.rank,
    color,
    rollTotal: Number(result?.rollTotal ?? cappedTotal),
    cappedTotal,
    karmaUsed: Number(result?.karmaUsed || 0)
  };
}

async function routeCombinedBluntAttack(payload) {
  const actor = await resolveActorUuid(payload?.actorUuid);
  if (!actor) throw new Error("Combined Attack: higher-damage actor could not be resolved.");

  const remoteOwner = game.users?.find?.(u =>
    u.active && !u.isGM && u.id !== game.user.id && actor.testUserPermission?.(u, "OWNER")
  );

  if (remoteOwner && game.msh?.socket) {
    ui.notifications?.info?.(`Waiting for ${remoteOwner.name}: Combined Attack roll...`);
    return game.msh.socket.executeAsUser("executeCombinedBluntAttack", remoteOwner.id, payload);
  }
  if (game.user.isGM || actor.isOwner) return executeCombinedBluntPayload(payload);
  if (game.msh?.socket) return game.msh.socket.executeAsGM("executeCombinedBluntAttack", payload);
  return executeCombinedBluntPayload(payload);
}


export class BluntAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "blunt-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);
    let attackItems = actor.items.filter(isBluntCapable);

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      if (!attackItems.find(i => i.id === passedItem.id)) {
        attackItems = [passedItem, ...attackItems];
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.ba.remember";
    const lsSkipKey = "msh.ba.skipDice";
    
    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1"; 

    const defaultSource = (passedItemId && passedItem?.type === "equipment") ? "weapon" : "hands";
    
    // Explicit passed item (equipment attack / attack-mode click) always wins over lastBluntSource flag
    const savedSource = passedItemId
      ? "weapon"
      : (shouldRemember
          ? ((await actor.getFlag("msh-faserip","lastBluntSource")) || defaultSource)
          : defaultSource);

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntItemId")) : "") || "";
    
    const savedObjectName = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntObjectName")) || "") : "";
    const savedObjectRank = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntObjectRank")) || "Excellent") : "Excellent";
    const savedObjectValue = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntObjectValue")) || 20) : 20;
    
    const savedPulledDamage = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntPulledDamage")) || 0) : 0;
    const savedPullEnabled = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntPullEnabled")) || false) : false;
    const savedResultCap = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntResultCap")) || "none") : "none";

    const savedMultiAttacks = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntMultiAttacks") || false) : false;
    const savedAttackCount = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntAttackCount") || 2) : 2;
    const savedMultiAdjacent = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntMultiAdjacent") || false) : false;
    const savedColumnShift  = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntShift") || 0) : 0;
    
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // Compute initial max damage based on saved source
    let initialMaxDamage = strength.value;
    if (savedSource === "weapon" && savedItemId) {
      const savedItem = attackItems.find(i => i.id === savedItemId);
      if (savedItem) {
        const mat = getItemMaterialRank(savedItem);
        let base = Number(savedItem.system?.damage || 0);
        const da = this.opts?.deviceAbility;
        if (da?.rank && savedItem?.system?.category === "device") {
          base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
        }
        const res = computeBluntDamage(strength.rank, strength.value, mat, base, RANKS);
        initialMaxDamage = res.damage;
      }
    } else if (savedSource === "object") {
      const res = computeBluntDamage(strength.rank, strength.value, savedObjectRank, 0, RANKS);
      initialMaxDamage = res.damage;
    }

    // Get target info
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const combinedTargetUuid = targetUuidOf(primaryTarget);
    const combinedEligible = targets.length === 1 && !!combinedTargetUuid;
    const pendingCombinedAtOpen = combinedEligible
      ? findPendingCombinedAttack(combinedTargetUuid, actor.uuid)
      : null;
    
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-blunt") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";
    const armorNote = targets.length > 1 ? " (1st)" : "";
    const initialDamage = strength.value;
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);

    // Target health and effects for display
    const targetHealth = primaryTargetActor?.system?.health;
    const targetHealthStr = targetHealth ? `${targetHealth.value}/${targetHealth.max}` : "";
    const targetEffects = (primaryTargetActor?.effects?.filter(e => !e.disabled) ?? [])
      .filter(e => {
        const n = (e.name || e.label || '').toLowerCase();
        return !n.includes('body armor') && !n.includes('force field');
      });
    const targetStatusStr = targetEffects.length > 0
      ? targetEffects.map(e => e.name || e.label).join(", ")
      : "";

    // Armor display for target row
    const armorDisplay = targetArmor > 0
      ? `BA: ${targetArmorAbbr}(${targetArmor})${armorNote}`
      : "";

    // Karma info
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const savedReason = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastBluntReason")) || "") : "";

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // Build CS row via shared utility (manual input + ? reference)
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      savedReason,
      abilityRank: ability.rank
    });

    // Object material rank options
    const rankOpts = ["Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous","Unearthly"]
      .map(r => `<option value="${r}" ${savedObjectRank===r?'selected':''}>${r}</option>`).join('');

    // Build unified damage source <select>
    // Combines hands + weapons + object into one dropdown
    const damageSrcOptions = [];
    damageSrcOptions.push(`<option value="hands" ${savedSource==='hands'?'selected':''}>Bare Hands &mdash; ${strength.rank} (${strength.value})</option>`);
    for (const i of attackItems) {
      const mat = getItemMaterialRank(i);
      let base = Number(i.system?.damage || 0);
      const da = this.opts?.deviceAbility;
      if (da?.rank && i?.system?.category === "device") {
        base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
      }
      const res = computeBluntDamage(strength.rank, strength.value, mat, base, RANKS);
      const isBroken = i.system?.broken === true;
      const sel = (savedSource === 'weapon' && savedItemId === i.id && !isBroken) ? 'selected' : '';
      const disabled = isBroken ? 'disabled' : '';
      const label = isBroken ? `[BROKEN] ${i.name}` : i.name;
      damageSrcOptions.push(`<option value="weapon:${i.id}" ${sel} ${disabled}>${label} &mdash; ${res.damage} dmg</option>`);
    }
    damageSrcOptions.push(`<option value="object" ${savedSource==='object'?'selected':''}>Improvised Object&hellip;</option>`);

    // Determine initial saved damage source value for the select
    let initDamageSrcVal = "hands";
    if (savedSource === "weapon" && savedItemId) initDamageSrcVal = `weapon:${savedItemId}`;
    else if (savedSource === "object") initDamageSrcVal = "object";

    // ── Fighting info for multi-attack FEAT panel ──
    const fightingAbility = getAbilityInfo(actor, "fighting");
    const fightingShort = RANK_ABBR[fightingAbility.rank] || fightingAbility.rank;

    // ── MA-D / MA-A state ─────────────────────────────────────────────
    // RAW: MA-D ignores Body Armor (not Force Fields) for Stun/Slam
    // determinations after 2 rounds of studying the target. MA-A ignores
    // the Str/End comparison (currently a no-op in this codebase since
    // no such gate exists). The MA-D zone shows three states:
    //   1) Not studied — neutral hint, "Begin study" button if in combat
    //   2) Studying (1/2 rounds) — amber countdown, no engage option yet
    //   3) Armed (2/2 rounds complete on this target) — teal, default-on
    //      Engage toggle that wires choice.maDEngaged through to the
    //      Stun/Slam emission logic in attack-action.js.
    // Zone only renders when the attacker has MA-D and/or MA-A. Hidden
    // for actors without either talent so the dialog stays compact.
    const actorHasMAD = hasMartialArtsD(actor);
    const actorHasMAA = hasMartialArtsA(actor);
    const primaryTargetUuid = primaryTarget?.document?.uuid || primaryTargetActor?.uuid || null;
    const studyStatus = (actorHasMAD && primaryTargetUuid)
      ? getStudyStatus(actor, primaryTargetUuid)
      : { studying: false, rounds: 0, complete: false, stale: false };
    const studyComplete = studyStatus.complete;
    const studyInProgress = studyStatus.studying && !studyStatus.complete;
    const inCombat = !!game.combat;

    let maDZoneHtml = "";
    if (actorHasMAD || actorHasMAA) {
      const taLabel = (() => {
        if (actorHasMAD && actorHasMAA) return "Martial Arts A + D";
        if (actorHasMAD)                return "Martial Arts D";
        return "Martial Arts A";
      })();

      if (actorHasMAD && studyComplete && primaryTarget) {
        // STATE 3 — Armed
        const tname = primaryTarget?.name || primaryTargetActor?.name || "target";
        maDZoneHtml = `
        <div class="frp-mad-zone frp-mad-armed" style="background:#E1F5EE;color:#04342C;padding:6px 10px;border-bottom:1px solid #5DCAA5;">
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:4px;">
            <i class="fas fa-bullseye" style="color:#0F6E56;" aria-hidden="true"></i>
            <strong>${taLabel} armed</strong>
            <span style="color:#0F6E56;font-size:11px;">— ${studyStatus.rounds} rounds studied · ${tname}'s weak points mapped</span>
          </div>
          <label style="display:flex;align-items:center;gap:6px;padding-left:22px;font-size:11px;color:#085041;cursor:pointer;">
            <input type="checkbox" id="ma-d-engage" name="maDEngaged" checked style="margin:0;">
            <span>Engage bypass — ignore Body Armor for Stun/Slam (Force Fields still apply)</span>
          </label>
        </div>`;
      } else if (actorHasMAD && studyInProgress && primaryTarget) {
        // STATE 2 — Studying in progress
        const tname = primaryTarget?.name || primaryTargetActor?.name || "target";
        const rdsLeft = Math.max(0, 2 - studyStatus.rounds);
        maDZoneHtml = `
        <div class="frp-mad-zone frp-mad-studying" style="background:#FAEEDA;color:#633806;padding:6px 10px;border-bottom:1px solid #FAC775;display:flex;align-items:center;gap:8px;font-size:12px;">
          <i class="fas fa-hourglass-half" style="color:#BA7517;" aria-hidden="true"></i>
          <span><strong>${taLabel}</strong> — studying ${tname} · ${studyStatus.rounds} of 2 rounds</span>
          <span style="margin-left:auto;font-size:11px;color:#854F0B;">${rdsLeft === 0 ? "Bypass armed this round" : `${rdsLeft} round to bypass`}</span>
        </div>`;
      } else if (actorHasMAD || actorHasMAA) {
        // STATE 1 — No study (or MA-A only, which has no study mechanic)
        const targetName = primaryTarget?.name || primaryTargetActor?.name || "selected target";
        const hint = !inCombat
          ? "Requires active combat to study"
          : !primaryTarget
          ? "Select a target to study"
          : actorHasMAD
          ? `Not studied — plain blunt attack`
          : `Stun/Slam ignore comparative Str/End`;
        const showStudyBtn = actorHasMAD && inCombat && primaryTarget;
        maDZoneHtml = `
        <div class="frp-mad-zone frp-mad-idle" style="background:#F1EFE8;color:#444441;padding:6px 10px;border-bottom:1px solid #D3D1C7;display:flex;align-items:center;gap:8px;font-size:12px;">
          <i class="fas fa-bullseye" style="color:#5F5E5A;" aria-hidden="true"></i>
          <span><strong>${taLabel}</strong> — ${hint}</span>
          ${showStudyBtn
            ? `<button type="button" id="ma-d-begin-study" style="margin-left:auto;background:#fff;border:1px solid #B4B2A9;border-radius:3px;padding:2px 8px;font-size:11px;color:#2C2C2A;cursor:pointer;">Begin study</button>`
            : ""}
        </div>`;
      }
    }

    // ── Dialog HTML — v3 Ultra Compact Layout ──
    const multiEnabled = savedMultiAttacks || savedMultiAdjacent;
    let combinedMetaText = "";
    let combinedMetaTitle = combinedEligible ? "Start a Combined Attack" : "Combined Attack requires exactly one target";
    if (pendingCombinedAtOpen) {
      const p = pendingCombinedAtOpen.data;
      const ci = getCombinedDamageInfo(initialMaxDamage, p.declaredDamage);
      const cAbbr = RANK_ABBR[ci.combinedRank] || ci.combinedRank;
      combinedMetaText = ci.valid
        ? `${p.attackerName} ${p.declaredDamage}→${cAbbr}${ci.combinedDamage}`
        : `${p.attackerName} ${p.declaredDamage} · Δ${ci.difference}`;
      combinedMetaTitle = ci.valid
        ? `Join ${p.attackerName}: ${p.declaredDamage} + ${initialMaxDamage} → ${ci.combinedRank} ${ci.combinedDamage}`
        : `${p.attackerName} is ${ci.difference} damage away; attacks must be within 10 points`;
    }
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Fighting / Rank Value) attacks Target -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Fighting:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      ${maDZoneHtml}

      <!-- CS row (manual input + ? reference) -->
      ${csRowHtml}

      <!-- Damage: select + numbers inline -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="damageSource" id="damage-source-select">
            ${damageSrcOptions.join('')}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
        </div>
        <!-- Object sub-fields (hidden unless object selected) -->
        <div class="object-row" id="object-row" style="display:${savedSource==='object'?'block':'none'}">
          <div class="obj-grid">
            <label>Name:</label>
            <input type="text" name="objectName" value="${savedObjectName}" placeholder="rock, pipe...">
            <label>Material:</label>
            <div class="obj-mat-row">
              <select name="objectRank">${rankOpts}</select>
              <input type="number" name="objectValue" value="${savedObjectValue}">
            </div>
          </div>
        </div>
      </div>

      <!-- Options: Pull / Multi / Combined + Karma (Combined adds no extra row) -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!savedPullEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${savedPullEnabled ? 'checked' : ''}> <span class="frp-opt-label orange">Pull</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="pulledDamage" value="${savedPullEnabled && savedPulledDamage > 0 ? savedPulledDamage : initialMaxDamage}" min="0" max="${initialMaxDamage}" ${!savedPullEnabled ? 'disabled' : ''}>
          <span style="font-size:11px;color:#777;">Cap:</span>
          <select style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;" name="resultCap" ${!savedPullEnabled ? 'disabled' : ''}>
            <option value="none" ${savedResultCap==='none'?'selected':''}>None</option>
            <option value="yellow" ${savedResultCap==='yellow'?'selected':''}>Slam</option>
            <option value="green" ${savedResultCap==='green'?'selected':''}>Hit</option>
          </select>
        </div>
        <div class="frp-opt-row${!multiEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${multiEnabled ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <label style="margin-left:8px;"><input type="radio" name="multiCount" value="2" ${!savedMultiAdjacent && (!savedMultiAttacks || savedAttackCount === 2) ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;2</label>
          <label><input type="radio" name="multiCount" value="3" ${!savedMultiAdjacent && savedAttackCount === 3 ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;3</label>
          <label><input type="radio" name="multiCount" value="adjacent" ${savedMultiAdjacent ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> Adj</label>
        </div>

        <!-- Multi-Attack FEAT indicator (hidden unless Multi x2/x3 checked) -->
        <div id="multi-feat-panel" style="display:none;padding:5px 8px;border-bottom:1px solid #e8e0d0;">
          <div id="feat-result-bar" style="padding:4px 8px;border-radius:3px;font-size:12px;font-weight:600;text-align:center;"></div>
        </div>

        <div class="frp-opt-row frp-combined-karma-row">
          <span class="frp-combined-inline${combinedEligible ? '' : ' inactive'}" title="${esc(combinedMetaTitle)}">
            <label><input type="checkbox" id="combined-enabled" ${combinedEligible ? '' : 'disabled'}> <span class="frp-opt-label purple">Combined</span></label>
            <span class="frp-combined-meta" id="combined-meta">${esc(combinedMetaText)}</span>
          </span>
          <span class="frp-karma-inline inactive">
            ${hasKarma ? `
              <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
              <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail</span>
            ` : `<span style="font-size:11px;color:#999;">No karma</span>`}
          </span>
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">Miss</div>
        <div class="frp-fx-cell g">Hit</div>
        <div class="frp-fx-cell y">Slam</div>
        <div class="frp-fx-cell r">Stun</div>
      </div>

      <!-- Footer: checkboxes + buttons on one row -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>
    `;

    const choice = await new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      showFaseripDialog({
        title: actionName,
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          $dialog.find('.dialog-buttons').hide();
          
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastBluntMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

          // ── Wire CS panel from shared utility ──
          let _updateFeatPanel = () => {};  // forward ref, set below
          let _updateCombinedUI = () => {}; // forward ref, set below
          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            onUpdate: () => {
              _updateFeatPanel();
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // Auto-focus Roll button for keyboard Enter and focus ring
          html.find('#frp-roll').focus();

          // Intercept Enter key — trigger Roll instead of Foundry's native submit
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // ── MA-D Begin Study button handler ──
          // Clicking "Begin study" records a study AE on the attacker
          // against the primary target. Study tracks rounds against
          // game.combat.round; the player then carries on with this
          // attack as a plain blunt (no bypass on the round study is
          // recorded — study takes effect after 2 round advances).
          // After recordStudy we update the zone in place to State 2
          // without re-rendering the whole dialog, so the player
          // doesn't lose their CS/karma/etc. selections.
          html.find('#ma-d-begin-study').on('click', async () => {
            if (!primaryTarget) return;
            try {
              await recordStudy(actor, primaryTarget);
              const tname = primaryTarget?.name || primaryTargetActor?.name || "target";
              const newZone = `
              <div class="frp-mad-zone frp-mad-studying" style="background:#FAEEDA;color:#633806;padding:6px 10px;border-bottom:1px solid #FAC775;display:flex;align-items:center;gap:8px;font-size:12px;">
                <i class="fas fa-hourglass-half" style="color:#BA7517;" aria-hidden="true"></i>
                <span><strong>Martial Arts D</strong> — studying ${tname} · 0 of 2 rounds</span>
                <span style="margin-left:auto;font-size:11px;color:#854F0B;">2 rounds to bypass</span>
              </div>`;
              html.find('.frp-mad-zone').replaceWith(newZone);
            } catch (err) {
              console.error("MA-D | recordStudy failed", err);
              ui.notifications.error("Could not record study; see console");
            }
          });

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = !!$dlg('#msh-remember-settings').is(':checked');
            const skipDice = !!$dlg('#msh-skip-dice').is(':checked');

            try {
              localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
              localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");
            } catch (e) {}

            // Parse unified damage source select
            const damageSourceVal = $dlg('#damage-source-select').val() || "hands";
            let src, itemId;
            if (damageSourceVal === "hands") {
              src = "hands"; itemId = "";
            } else if (damageSourceVal === "object") {
              src = "object"; itemId = "";
            } else if (damageSourceVal.startsWith("weapon:")) {
              src = "weapon"; itemId = damageSourceVal.replace("weapon:", "");
            } else {
              src = "hands"; itemId = "";
            }

            const objectName   = $dlg('[name="objectName"]').val() || "";
            const objectRank   = $dlg('[name="objectRank"]').val() || "Excellent";
            const objectValue  = parseInt($dlg('[name="objectValue"]').val() || 20);
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma        = karmaToSpend;
            
            const pullEnabled  = $dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const resultCap    = pullEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";

            const combinedAttack = $dlg('#combined-enabled').is(':checked');
            const multiEnabled = !combinedAttack && $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAdjacent = multiEnabled && multiCountVal === "adjacent";
            const multiAttacks  = multiEnabled && !multiAdjacent;
            const attackCount   = multiCountVal === "3" ? 3 : 2;

            if (combinedAttack && !combinedEligible) {
              ui.notifications.warn("Combined Attack requires exactly one target.");
              return;
            }

            // MA-D bypass — only meaningful when the engage checkbox
            // exists in the dialog (State 3, study complete). Defaults
            // to false if the zone is in States 1/2 or absent entirely.
            const $maDEngage   = $dlg('#ma-d-engage');
            const maDEngaged   = $maDEngage.length > 0 ? $maDEngage.is(':checked') : false;

            // Get CS state from shared utility
            const cs = _csState.get();

            // Compute damage and notes
            let weaponMat = "", weaponName = "", damage = strength.value, note = "";
            if (src === "weapon") {
              const item = attackItems.find(i => i.id === itemId);
              weaponMat  = item ? getItemMaterialRank(item) : "Excellent";
              weaponName = item ? item.name : "";
              let base = item ? Number(item.system?.damage || 0) : 0;
              const da = this.opts?.deviceAbility;
              if (da?.rank && item?.system?.category === "device") {
                base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
                weaponName = `${da.name} (${item.name})`;
              }
              const res  = computeBluntDamage(strength.rank, strength.value, weaponMat, base, RANKS);
              damage = res.damage; note = res.note;
            } else if (src === "object") {
              weaponMat  = objectRank;
              weaponName = objectName || "Object";
              const res  = computeBluntDamage(strength.rank, strength.value, weaponMat, 0, RANKS);
              damage = res.damage; note = res.note;
            } else {
              damage = strength.value;
              note   = "Bare Hands = Strength";
            }

            // If a partner is already waiting, keep the dialog open when the
            // damages are too far apart so Pull can be adjusted to qualify.
            if (combinedAttack) {
              const pendingNow = findPendingCombinedAttack(combinedTargetUuid, actor.uuid);
              if (pendingNow) {
                const currentDeclared = pulledDamage > 0 ? Math.min(damage, pulledDamage) : damage;
                const ci = getCombinedDamageInfo(currentDeclared, pendingNow.data.declaredDamage);
                if (!ci.valid) {
                  ui.notifications.warn(`Combined Attack requires damage within 10 points (${currentDeclared} vs ${pendingNow.data.declaredDamage}; difference ${ci.difference}).`);
                  return;
                }
              }
            }

            // Save settings
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastBluntSource", src);
              await actor.setFlag("msh-faserip", "lastBluntPullEnabled", pullEnabled);
              await actor.setFlag("msh-faserip", "lastBluntPulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip", "lastBluntResultCap", resultCap);
              await actor.setFlag("msh-faserip", "lastBluntShift", cs.manualCS);
              await actor.setFlag("msh-faserip", "lastBluntReason", cs.reason);
              await actor.setFlag("msh-faserip", "cs_blunt-attack", cs.manualCS);
              await actor.setFlag("msh-faserip", "lastBluntKarma", karma);
              await actor.setFlag("msh-faserip", "karma_blunt-attack", karma);
              await actor.setFlag("msh-faserip", "lastBluntMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastBluntAttackCount", attackCount);
              await actor.setFlag("msh-faserip", "lastBluntMultiAdjacent", multiAdjacent);

              if (src === "weapon") {
                await actor.setFlag("msh-faserip", "lastBluntItemId", itemId);
              } else if (src === "object") {
                await actor.setFlag("msh-faserip", "lastBluntObjectName", objectName);
                await actor.setFlag("msh-faserip", "lastBluntObjectRank", objectRank);
                await actor.setFlag("msh-faserip", "lastBluntObjectValue", objectValue);
              }
            }
            
            await actor.setFlag("msh-faserip", "csNotes", cs.csNotes);

            _resolved = true;
            // For blunt, main CS IS the Fighting CS — use it for the FEAT
            const effFightIdx = Math.max(0, Math.min(RANKS.indexOf(fightingAbility.rank) + cs.totalShift, RANKS.length - 1));
            const effFightRank = RANKS[effFightIdx];
            resolve({
              src, itemId, objectName, objectRank, objectValue,
              shift: cs.totalShift, karma, spendKarma,
              pulledDamage, resultCap, skipDice, weaponMat, weaponName, damage, note,
              multiAttacks, attackCount, multiAdjacent, combinedAttack,
              maDEngaged,
              csNotes: cs.csNotes,
              effectiveFightingRank: effFightRank
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          // ── Main update function (damage only — CS handled by csState) ──
          const update = () => {
            const damageSourceVal = html.find('#damage-source-select').val() || "hands";
            const $objectRow = html.find('#object-row');
            const $val  = html.find('#dmg-val');
            const $afterArmor = html.find('#after-armor-display');
            const $pulledDamage = html.find('[name="pulledDamage"]');

            $objectRow.hide();

            let src, currentItemId;
            if (damageSourceVal === "hands") {
              src = "hands"; currentItemId = "";
            } else if (damageSourceVal === "object") {
              src = "object"; currentItemId = "";
              $objectRow.show();
            } else if (damageSourceVal.startsWith("weapon:")) {
              src = "weapon"; currentItemId = damageSourceVal.replace("weapon:", "");
            } else {
              src = "hands"; currentItemId = "";
            }

            let maxDamage = strength.value;
            let currentDamage = strength.value;

            if (src === "weapon") {
              const item = attackItems.find(i => i.id === currentItemId) || null;
              const mat  = item ? getItemMaterialRank(item) : "Excellent";
              let base = item ? Number(item.system?.damage || 0) : 0;
              const da = this.opts?.deviceAbility;
              if (da?.rank && item?.system?.category === "device") {
                base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
              }
              const res  = computeBluntDamage(strength.rank, strength.value, mat, base, RANKS);
              maxDamage = res.damage;
              currentDamage = res.damage;
            } else if (src === "object") {
              const mat = String(html.find('[name="objectRank"]').val() || "Excellent");
              const res = computeBluntDamage(strength.rank, strength.value, mat, 0, RANKS);
              maxDamage = res.damage;
              currentDamage = res.damage;
            }

            $val.text(currentDamage);

            const afterArmorDmg = Math.max(0, currentDamage - targetArmor);
            if (primaryTarget) {
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${currentDamage} damage`);
            }

            // Pull punch max update
            const oldMax = Number($pulledDamage.attr('max')) || 0;
            $pulledDamage.attr('max', maxDamage);
            if (oldMax !== maxDamage) {
              $pulledDamage.val(maxDamage);
            }

            _updateCombinedUI();
            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          
          update();

          // ── Event bindings (damage only — CS handled by csState) ──
          html.find('#damage-source-select').on('change', update);
          html.find('[name="objectRank"]').on('change', function() {
            const rank = $(this).val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="objectValue"]').val(value);
            update();
          });
          html.find('[name="objectValue"]').on('input change', update);
          html.find('[name="objectName"]').on('input', update);

          // Pull punch toggle
          html.find('#pull-punch-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $resultCap = html.find('[name="resultCap"]');
            $row.toggleClass('inactive', !this.checked);
            if (this.checked) {
              const currentMax = Number($pulledDamage.attr('max')) || strength.value;
              $pulledDamage.val(currentMax).prop('disabled', false);
              $resultCap.prop('disabled', false);
            } else {
              $resultCap.val('none').prop('disabled', true);
              $pulledDamage.val($pulledDamage.attr('max')).prop('disabled', true);
            }
            _updateCombinedUI();
          });
          html.find('[name="pulledDamage"]').on('input change', _updateCombinedUI);

          // ── Multi-attack FEAT panel update ──
          _updateFeatPanel = () => {
            const enabled = html.find('#multi-enabled').is(':checked');
            const countVal = html.find('[name="multiCount"]:checked').val() || "2";
            const isMultiAttack = enabled && countVal !== "adjacent";
            const $panel = html.find('#multi-feat-panel');

            if (!isMultiAttack) { $panel.hide(); if ($dialog.length) $dialog[0].style.height = 'auto'; return; }
            $panel.show();

            const count = countVal === "3" ? 3 : 2;
            const intensity = count >= 3 ? "Amazing" : "Remarkable";
            // For blunt/edged the main CS applies to Fighting — use it for the FEAT too
            const mainCS = _csState ? _csState.get().totalShift : 0;
            const baseIdx = RANKS.indexOf(fightingAbility.rank);
            const effIdx = Math.max(0, Math.min(baseIdx + mainCS, RANKS.length - 1));
            const effRank = RANKS[effIdx];
            const intIdx = RANKS.indexOf(intensity);
            const diff = effIdx - intIdx;

            const $bar = html.find('#feat-result-bar');
            const effAbbr = RANK_ABBR[effRank] || effRank;
            if (diff >= 3) {
              $bar.css({ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' })
                .text(`FEAT: Automatic — ${effAbbr} vs ${intensity}`);
            } else if (diff <= -2) {
              $bar.css({ background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a' })
                .text(`FEAT: Impossible — ${effAbbr} vs ${intensity}`);
            } else {
              const need = diff > 0 ? "Green+" : diff === 0 ? "Yellow+" : "Red only";
              $bar.css({ background: '#fff8e1', color: '#b8860b', border: '1px solid #ffe082' })
                .text(`FEAT: ${need} — ${effAbbr} vs ${intensity}`);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          // Combined Attack stays on the existing Karma row to preserve the
          // three-line options box. Multi and Combined are mutually exclusive.
          _updateCombinedUI = () => {
            const $combined = html.find('#combined-enabled');
            const $meta = html.find('#combined-meta');
            const $wrap = html.find('.frp-combined-inline');
            const $roll = html.find('#frp-roll');
            if (!$combined.length) return;

            if (!combinedEligible) {
              $combined.prop('checked', false).prop('disabled', true);
              $wrap.addClass('inactive').attr('title', 'Combined Attack requires exactly one target');
              $meta.text('');
              $roll.text('Roll');
              return;
            }

            const currentBase = Math.max(0, Number(html.find('#dmg-val').text()) || 0);
            const pullOn = html.find('#pull-punch-enabled').is(':checked');
            const pullVal = Math.max(0, Number(html.find('[name="pulledDamage"]').val()) || 0);
            const currentDeclared = (pullOn && pullVal > 0) ? Math.min(currentBase, pullVal) : currentBase;
            const pending = findPendingCombinedAttack(combinedTargetUuid, actor.uuid);

            if (pending) {
              const p = pending.data;
              const ci = getCombinedDamageInfo(currentDeclared, p.declaredDamage);
              const cAbbr = RANK_ABBR[ci.combinedRank] || ci.combinedRank;
              $meta.text(ci.valid ? `${p.attackerName} ${p.declaredDamage}→${cAbbr}${ci.combinedDamage}` : `${p.attackerName} ${p.declaredDamage} · Δ${ci.difference}`);
              $wrap.attr('title', ci.valid
                ? `Join ${p.attackerName}: ${p.declaredDamage} + ${currentDeclared} → ${ci.combinedRank} ${ci.combinedDamage}`
                : `${p.attackerName} is ${ci.difference} damage away; attacks must be within 10 points`);
            } else {
              $meta.text('');
              $wrap.attr('title', 'Start a Combined Attack');
            }

            $wrap.toggleClass('active', $combined.is(':checked'));
            $roll.text($combined.is(':checked') ? (pending ? 'Join' : 'Declare') : 'Roll');
          };

          // Multi-attack toggle
          html.find('#multi-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            if (this.checked) html.find('#combined-enabled').prop('checked', false);
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="multiCount"]').prop('disabled', !this.checked);
            _updateFeatPanel();
            _updateCombinedUI();
          });
          html.find('[name="multiCount"]').on('change', _updateFeatPanel);
          _updateFeatPanel();

          html.find('#combined-enabled').on('change', function() {
            if (this.checked && html.find('#multi-enabled').is(':checked')) {
              html.find('#multi-enabled').prop('checked', false).trigger('change');
            }
            _updateCombinedUI();
          });
          _updateCombinedUI();

          // Karma toggle — only the Karma half fades; Combined remains readable.
          html.find('#spend-karma').on('change', function() {
            html.find('.frp-karma-inline').toggleClass('inactive', !this.checked);
          });
          
          applyCapabilitiesToDialog(html, "blunt-attack", { actor });

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
        }
      });
    });
    
    if (!choice) return;

    // Track shift breakdown
    const shiftBreakdown = {
      manual: choice.shift || 0,
      multiAttack: 0,
      adjacent: 0,
      csNotes: choice.csNotes || ""
    };

    // Combined Attack is a declaration/join workflow, not an ordinary attack
    // roll on this click. It consumes this action path here and later routes the
    // higher attack + lower Agility FEAT to the appropriate owning clients.
    if (choice.combinedAttack) {
      choice.shiftBreakdown = shiftBreakdown;
      await this._handleCombinedBluntAttack({ choice, actor, primaryTarget });
      return;
    }

    // Handle multiple adjacent targets (-4 CS)
    if (choice.multiAdjacent) {
      shiftBreakdown.adjacent = -4;
      choice.shift = (choice.shift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

    // Handle multi-attacks
    let actualAttackCount = 1;
    let multiAttackFeatResult = null;
    
    if (choice.multiAttacks) {
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";
      
      // Use effective Fighting rank from dialog (includes auto-detected mods + manual FEAT CS)
      const effFightRank = choice.effectiveFightingRank || fightingAbility.rank;
      const featFightAbility = { ...fightingAbility, rank: effFightRank };
      
      // Check if impossible — block without penalty
      const effIdx = RANKS.indexOf(effFightRank);
      const intIdx = RANKS.indexOf(intensity);
      const diff = effIdx - intIdx;
      if (diff <= -2) {
        ui.notifications.warn(`Multi-attack impossible — ${effFightRank} Fighting vs ${intensity} intensity. Performing normal attack.`);
        choice.multiAttacks = false;
      } else {
        const featResult = await this._rollFightingFeat(
          actor, 
          featFightAbility, 
          intensity, 
          choice.attackCount
        );
        
        if (featResult?.cancelled) {
          ui.notifications.info("Multi-attack cancelled.");
          return;
        }
        
        multiAttackFeatResult = { ...featResult, intensity, attackCount: choice.attackCount };
        
        let useConsolidated = false;
        try {
          useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
        } catch (_e) {}
        
        if (!useConsolidated) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div style="background:#eef6ff;border:1px solid #90caf9;border-radius:3px;padding:6px;margin:4px 0;">
              <b>Multi-Attack FEAT:</b> ${intensity} — ${
                featResult?.success ? "SUCCESS" : "FAIL"
              } ${featResult?.auto ? "(Automatic)" : ""}</div>`
          });
        }

        const featSuccess = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
        if (featSuccess) {
          actualAttackCount = choice.attackCount;
          shiftBreakdown.multiAttack = -1;
          choice.shift = (choice.shift || 0) - 1;
          ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS each!`);
        } else {
          actualAttackCount = 1;
          shiftBreakdown.multiAttack = -3;
          choice.shift = (choice.shift || 0) - 3;
          ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack at -3CS.`);
        }
      }
    }

    choice.shiftBreakdown = shiftBreakdown;

    // Execute attacks
    const targetCount = game.user.targets.size || 1;

    if (choice.multiAdjacent && targetCount > 1) {
      await this._executeSingleAttack({
        choice: { ...choice, multiAttackFeatResult },
        actor, ability,
        actionType, actionName, effects,
        damageType: "physical-blunt",
        rawDamage: choice.damage,
        damageNote: choice.note,
        sourceName: choice.weaponName || "Bare Hands",
        attackForm: "blunt",
        breakingFeat: (choice.src === "weapon" || choice.src === "object") ? {
          weaponMat: choice.weaponMat,
          weaponName: choice.weaponName,
          itemUuid: choice.src === "weapon" ? actor.items.get(choice.itemId)?.uuid : null
        } : null,
        targetCount
      });
    } else {
      const selected = Array.from(game.user?.targets ?? []);
      const count = Math.max(1, actualAttackCount);

      debugLog(`Multi-attack target distribution: ${count} attacks, ${selected.length} targets: [${selected.map(t => t.name).join(", ")}]`);

      for (let i = 0; i < count; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 300));

        const tgt = (count === 1)
          ? (selected[0] ?? null)
          : (selected.length ? selected[i % selected.length] : null);
        
        debugLog(`Attack ${i+1}/${count}: target index=${i % selected.length} → ${tgt?.name ?? "null"}`);

        await this._executeSingleAttack({
          choice: { ...choice, specificTarget: tgt, multiAttackFeatResult: i === 0 ? multiAttackFeatResult : null },
          actor, ability,
          actionType, actionName, effects,
          damageType: "physical-blunt",
          rawDamage: choice.damage,
          damageNote: choice.note,
          sourceName: choice.weaponName || "Bare Hands",
          attackForm: "blunt",
          breakingFeat: (choice.src === "weapon" || choice.src === "object") ? {
            weaponMat: choice.weaponMat,
            weaponName: choice.weaponName,
            itemUuid: choice.src === "weapon" ? actor.items.get(choice.itemId)?.uuid : null
          } : null,
          targetCount: 1,
          attackNumber: i + 1,
          totalAttacks: count
        });
      }
    }

  }

  async _handleCombinedBluntAttack({ choice, actor, primaryTarget }) {
    const targetUuid = targetUuidOf(primaryTarget);
    if (!targetUuid) {
      ui.notifications.warn("Combined Attack requires exactly one target.");
      return;
    }

    const currentDamage = declaredCombinedDamage(choice);
    if (currentDamage <= 0) {
      ui.notifications.warn("Combined Attack requires a damaging attack.");
      return;
    }

    const pending = findPendingCombinedAttack(targetUuid, actor.uuid);
    const targetName = primaryTarget?.name || primaryTarget?.actor?.name || "target";

    if (!pending) {
      const combat = game.combat;
      const rank = valueToRank(currentDamage);
      const abbr = RANK_ABBR[rank] || rank;
      const pendingData = {
        kind: "blunt",
        state: "pending",
        attackerActorUuid: actor.uuid,
        attackerName: actor.name,
        targetUuid,
        targetName,
        declaredDamage: currentDamage,
        choice: serializeCombinedChoice(choice),
        opts: serializeCombinedOpts(this.opts),
        combatId: combat?.id || null,
        round: combat?.round ?? null,
        turn: combat?.turn ?? null,
        createdAt: Date.now()
      };

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#f5f1fb;border:1px solid #8e6bb8;border-radius:3px;padding:6px 8px;margin:4px 0;">
          <strong style="color:#5b2c83;">Combined Attack — declared</strong>
          <div><b>${esc(actor.name)}</b> → <b>${esc(targetName)}</b> · ${esc(abbr)} ${currentDamage} damage</div>
          <div style="font-size:.85em;color:#666;">Waiting for a second Blunt Attack against the same target${combat ? " this round" : ""}.</div>
        </div>`,
        flags: { [COMBINED_SCOPE]: { [COMBINED_PENDING_FLAG]: pendingData } }
      });
      ui.notifications.info(`${actor.name} declared a Combined Attack against ${targetName}.`);
      return;
    }

    const pdata = pending.data;
    const partnerActor = await resolveActorUuid(pdata.attackerActorUuid);
    if (!partnerActor) {
      await markCombinedResolved(
        pending.message.id,
        "invalid",
        `<div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:3px;padding:6px 8px;"><b>Combined Attack cancelled:</b> ${esc(pdata.attackerName)} could not be resolved.</div>`
      );
      ui.notifications.warn("Combined Attack partner could not be resolved.");
      return;
    }

    const partnerDamage = Math.max(0, Number(pdata.declaredDamage) || 0);
    const combined = getCombinedDamageInfo(currentDamage, partnerDamage);
    if (!combined.valid) {
      ui.notifications.warn(`Combined Attack requires damage within 10 points (${currentDamage} vs ${partnerDamage}).`);
      return;
    }

    const currentRec = {
      actor,
      name: actor.name,
      damage: currentDamage,
      choice: serializeCombinedChoice(choice),
      opts: serializeCombinedOpts(this.opts)
    };
    const partnerRec = {
      actor: partnerActor,
      name: pdata.attackerName || partnerActor.name,
      damage: partnerDamage,
      choice: pdata.choice || {},
      opts: pdata.opts || { mode: "semi", autoApply: false, showConfirm: true }
    };

    // Equal damage: first declarer is the primary attacker; the joiner coordinates.
    let higher = partnerRec;
    let lower = currentRec;
    if (currentRec.damage > partnerRec.damage) {
      higher = currentRec;
      lower = partnerRec;
    } else if (currentRec.damage < partnerRec.damage) {
      higher = partnerRec;
      lower = currentRec;
    }

    const agilityResult = await rollCombinedAgilityFeat(lower.actor);
    const agiAbbr = RANK_ABBR[agilityResult.rank] || agilityResult.rank;
    const rollText = agilityResult.rollTotal == null
      ? "roll unavailable"
      : `${agilityResult.rollTotal}${agilityResult.karmaUsed ? ` + ${agilityResult.karmaUsed} Karma = ${agilityResult.cappedTotal}` : ""}`;

    if (!agilityResult.success) {
      await markCombinedResolved(
        pending.message.id,
        "coordination-failed",
        `<div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:3px;padding:6px 8px;margin:4px 0;">
          <strong style="color:#b71c1c;">Combined Attack — failed</strong>
          <div>${esc(lower.name)} Agility ${esc(agiAbbr)}: ${esc(rollText)} · <b>${esc(String(agilityResult.color).toUpperCase())}</b></div>
          <div style="font-size:.85em;color:#666;">Coordination FEAT failed; no combined damage is inflicted.</div>
        </div>`,
        { lowerActorUuid: lower.actor.uuid, higherActorUuid: higher.actor.uuid }
      );
      ui.notifications.warn("Combined Attack failed: coordination Agility FEAT failed.");
      return;
    }

    const combinedAbbr = RANK_ABBR[combined.combinedRank] || combined.combinedRank;
    const attackers = [partnerRec.name, currentRec.name];
    const combinedAttackInfo = {
      pendingMessageId: pending.message.id,
      attackers,
      higherName: higher.name,
      lowerName: lower.name,
      higherDamage: higher.damage,
      lowerDamage: lower.damage,
      combinedRank: combined.combinedRank,
      combinedRankAbbr: combinedAbbr,
      combinedDamage: combined.combinedDamage,
      agilityRank: agilityResult.rank,
      agilityColor: agilityResult.color,
      agilityRoll: agilityResult.rollTotal,
      agilityTotal: agilityResult.cappedTotal,
      agilityKarma: agilityResult.karmaUsed
    };

    // Consume pending before the higher attack so a miss/abort cannot leave a stale join.
    await markCombinedResolved(
      pending.message.id,
      "coordinated",
      `<div style="background:#eef7ee;border:1px solid #81c784;border-radius:3px;padding:6px 8px;margin:4px 0;">
        <strong style="color:#2e7d32;">Combined Attack — coordinated</strong>
        <div>${esc(lower.name)} Agility ${esc(agiAbbr)}: ${esc(rollText)} · <b>${esc(String(agilityResult.color).toUpperCase())}</b></div>
        <div style="font-size:.9em;">${esc(higher.name)} makes the attack at <b>${esc(combinedAbbr)} ${combined.combinedDamage}</b> damage.</div>
      </div>`,
      { lowerActorUuid: lower.actor.uuid, higherActorUuid: higher.actor.uuid, combinedDamage: combined.combinedDamage }
    );

    const highChoice = {
      ...higher.choice,
      // Pull may establish the qualifying declared value; do not re-cap the
      // resulting combined damage back down inside _executeSingleAttack.
      pulledDamage: 0,
      multiAttacks: false,
      multiAdjacent: false,
      combinedAttack: false,
      combinedAttackInfo
    };

    const payload = {
      actorUuid: higher.actor.uuid,
      targetUuid,
      choice: highChoice,
      opts: higher.opts,
      combinedDamage: combined.combinedDamage,
      combinedRank: combined.combinedRank,
      combinedAttackInfo
    };

    try {
      await routeCombinedBluntAttack(payload);
    } catch (err) {
      console.error("[FASERIP] Combined Attack higher attack failed", err);
      ui.notifications.error("Combined Attack could not resolve the higher-damage attack; see console.");
    }
  }
}

/**
 * Socket-safe executor for the higher-damage half of a Blunt Combined Attack.
 * The attack, including post-roll Karma amount selection, runs on its owner's client.
 */
export async function executeCombinedBluntPayload(payload = {}) {
  const actor = await resolveActorUuid(payload.actorUuid);
  const target = await resolveTargetUuid(payload.targetUuid);
  if (!actor || !target) throw new Error("Combined Attack actor or target could not be resolved.");

  const storedChoice = payload.choice || {};
  const item = storedChoice.itemId ? actor.items?.get?.(storedChoice.itemId) : null;
  const opts = { ...(payload.opts || {}), ...(item ? { item } : {}) };
  const action = new BluntAttackAction({
    actor,
    actionType: "blunt-attack",
    abilityName: "fighting",
    opts
  });

  const ability = getAbilityInfo(actor, "fighting");
  const effects = effectsFor("blunt-attack");
  const choice = {
    ...storedChoice,
    specificTarget: target,
    pulledDamage: 0,
    multiAttacks: false,
    multiAdjacent: false,
    combinedAttack: false,
    combinedAttackInfo: payload.combinedAttackInfo || storedChoice.combinedAttackInfo || null
  };

  if (!choice.shiftBreakdown) {
    choice.shiftBreakdown = {
      manual: Number(choice.shift) || 0,
      multiAttack: 0,
      adjacent: 0,
      csNotes: choice.csNotes || ""
    };
  }

  const combinedDamage = Math.max(0, Number(payload.combinedDamage) || 0);
  const info = choice.combinedAttackInfo;
  const damageNote = info
    ? `Combined Attack: higher ${info.higherDamage}, partner ${info.lowerDamage} → ${info.combinedRank} ${combinedDamage}`
    : `Combined Attack → ${payload.combinedRank || valueToRank(combinedDamage)} ${combinedDamage}`;

  return action._executeSingleAttack({
    choice,
    actor,
    ability,
    actionType: "blunt-attack",
    actionName: labelFor("blunt-attack"),
    effects,
    damageType: "physical-blunt",
    rawDamage: combinedDamage,
    damageNote,
    sourceName: choice.weaponName || "Bare Hands",
    attackForm: "blunt",
    breakingFeat: (choice.src === "weapon" || choice.src === "object") ? {
      weaponMat: choice.weaponMat,
      weaponName: choice.weaponName,
      itemUuid: choice.src === "weapon" ? actor.items?.get?.(choice.itemId)?.uuid : null
    } : null,
    targetCount: 1,
    attackNumber: 1,
    totalAttacks: 1
  });
}
