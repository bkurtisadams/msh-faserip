// action-utils.js v1.8.1 - 2026-04-22
// v1.8.1: Fix getArea* helpers: `??` doesn't fall through on empty strings, and
//         template.json initializes damage/damageType/areaRadius to "" rather than
//         null. Use _blank() helper so "" falls through to grenade* legacy fields.
//         Symptom: damage grenades (e.g. stick grenade with grenadeDamage:"40" and
//         grenadeDamageType:"BA") were routed to the intensity path and warned.
// v1.8.0: Add DAMAGE_TYPE_SHAKE map (v14 CanvasShakeEffect profiles keyed by damage type)
//         and getAreaRadius(item) helper reading unified areaRadius with grenadeRadius fallback.
//         Used by the grenade/area-attack refactor to decouple shake from hardcoded GRENADE_TYPES.
// v1.7.6: Fix dead "Roll Death Save" button on hit-while-at-0-HP card in
//         semi/manual mode. Emitter used class="death-save-button" with
//         data-actor-id; chat-hooks.js handler listens on [data-action="death-save"]
//         and reads dataset.actorUuid + dataset.attackForm. Switched to the
//         correct attributes so the handler matches. Same root cause as
//         init.js v1.12.1.
// v1.7.5: Combat rules fixes.
//         - computeBluntDamage now implements "bump to next rank minimum" rule
//           when Strength rank < material strength rank (Aunt May / Daredevil
//           examples from Advanced Set). Previously did plain min(STR, MAT)
//           which undercharged blunt damage against low-Strength attackers
//           wielding high-material weapons.
//         - getBodyArmorValues equipment branch now honors armorPhysical /
//           armorEnergy overrides, mirroring the power-armor branch.
//           Previously equipment armor hardcoded energy = physical - 20 and
//           ignored the v1.3.0 override fields (power body armor already honored them).
//         - Import RANK_RANGES for the bump-rule lookup.
// v1.7.4: Four-color isLethal now checks isLethalAttackForm(attackForm) — edged/shooting/
//         thrown-edged/energy attacks always trigger death save at 0 HP regardless of whether
//         the specific roll was a Kill result. Add data-is-kill to apply-damage button.
// v1.7.3: Fix _applyFourColorKnockout: add canAct:false change, zeroHealth flag, export function.
//         Pass mshReplacing on unconscious cleanup. Add fourColorRule check to hit-while-at-0-HP
//         path (was always firing death save even for blunt attacks with four-color on).
// v1.7.2: Fix measureAreasBetweenTokens — Math.round → Math.ceil so any fraction
//         into the next area counts as that area for range penalty purposes
// v1.7.1: Fix postKillSavePrompt E/S note to include throwing-edged,
//         fix applyDamageNow undefined targetToken reference,
//         fix grappling hover text "no other actions" → "no other attacks"
// v1.7.0: Add unified chat card builder utilities (buildShiftDisplay, buildRollDisplay, buildResultBadge, buildContentBox, buildCardShell, buildManualModeNotice)
// v1.5.1: Fix setupModeSelector ignoring global mode - per-dialog mode now capped at global setting
// v1.5.0: getBodyArmorValues checks for active Blocking effect (Strength as Body Armor)
// v1.4.1: Fix computeBluntDamage to respect weapon minimum base damage per FASERIP rules
// v1.4.0: Add showGrappleBack chip for Reverse escape result
// v1.3.0: Add showHoldDamage chip to buildActionsBox for Full Hold grappling damage
// v1.3.0: getBodyArmorValues reads armorPhysical/armorEnergy directly, falls back to rank formula
// v1.2.0: Add fromZeroHealth flag to death/kill save paths
//         - 0 HP path: unconscious + potentially dying
//         - Kill result path: conscious + potentially dying
// v1.1.4: Add getTargetData() for centralized target acquisition, rename getTargetingContext to buildTargetingHTML
// v1.1.3: Add collision damage button to collapsible slam section (Grand Slam, 1 Area)
// v1.1.2: Breaking FEAT chip includes data-actor-uuid attribute
// v1.1.1: Breaking FEAT chip includes weapon-mat and target-mat data attributes
// v1.1.0: Add buildCollapsibleSlamSection and buildCollapsibleStunSection for inline check results
// v1.0.2: Mode selector as radio buttons - active shows full color, inactive shows grey
// v1.0.1: Fix setupModeSelector to use FASERIP colors from data attributes (was overriding with blue)
// v1.0.0: Mode selector now uses FASERIP traffic light colors (Manual=Red, Semi=Yellow, Full=Green)

import { ACTION_LABELS, ACTION_EFFECTS } from "./action-config.js";
import { applyNullifiedEffect, isAuraMaintained } from "./nullify.js";
import { calculateMitigation } from "../../rules/mitigation.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { getAbilityShift } from "../effects/effect-modifiers.js";
import {
  RANKS_ORDERED as RANKS, RANK_VALUES, RANK_RANGES,
  rankValue, valueToRank, shiftRank, normalizeRank
} from "../../rules/rules-reference.js";
// NOTE: do NOT import resolveCombatMode here – that creates a circular dependency
import { recordDamage } from "../rest-system.js";
import { applyDamageToVehicle } from "./vehicle-damage.js";
import { safeActorUpdate, safeActorCreateEffect, safeActorDeleteEffects } from "../../gm-utils.js";

// Local helper to read the global combat mode without importing action-dispatcher
function resolveCombatModeSafe(actor) {
  try {
    const globalMode = game.settings?.get?.("msh-faserip", "defaultCombatMode");
    if (globalMode) return String(globalMode);
    // Fallback if setting not found
    console.log("FASERIP DEBUG | resolveCombatModeSafe - using fallback: semi");
    return "semi";
  } catch (e) {
    console.log("FASERIP DEBUG | resolveCombatModeSafe error, fallback: semi", e);
    return "semi";
  }
}


// Given a Token or Actor, return the correct Actor document for Active Effects
export function actorForEffects(target) {
  if (!target) return null;
  // TokenDocument or Token
  if (target.document?.documentName === "Token" || target.documentName === "Token") return target.actor;
  // placeables return { actor }
  if (target.actor) return target.actor;
  // already an Actor
  return target;
}
// usage:
//const aeParent = actorForEffects(target);
//await aeParent.createEmbeddedDocuments("ActiveEffect", [effectData]);

/** Action capability map — what rules permit by default */
export const ACTION_CAPS = {
  "blunt-attack":   { multi:true,  reduceDamage:true,  lowerEffect:true  },  // Slugfest
  "edged-attack":   { multi:true,  reduceDamage:false, lowerEffect:false },  // Slugfest (cannot pull/lower by default)
  "shooting":       { multi:true,  reduceDamage:false, lowerEffect:false },  // Shooting (trick shots are separate)
  "throwing-blunt": { multi:false, reduceDamage:true,  lowerEffect:true  },  // "can be reduced in effect or damage"
  "throwing-edged": { multi:false, reduceDamage:true,  lowerEffect:false },  // "may inflict less damage" but cannot reduce effect
  "energy": { multi:false, reduceDamage:true, lowerEffect:false, adjacentOnly:true },  // can reduce damage, NOT effect (Kill stands)
  "force":  { multi:false, reduceDamage:true, lowerEffect:false, adjacentOnly:true },  // can reduce damage, NOT effect (Stun stands)

  "grappling":      { multi:false, reduceDamage:true,  lowerEffect:true  },
  "grabbing":       { multi:false, reduceDamage:false, lowerEffect:false },   // treated separately from Grappling
  "escaping":       { multi:false, reduceDamage:false, lowerEffect:false },
  "charging":       { multi:false, reduceDamage:true,  lowerEffect:true  },  // "inflicts up to" + "may choose lesser effect"
  "dodging":        { multi:false, reduceDamage:false, lowerEffect:false },
  "evading":        { multi:false, reduceDamage:false, lowerEffect:false },
  "blocking":       { multi:false, reduceDamage:false, lowerEffect:false },
  "catching":       { multi:false, reduceDamage:false, lowerEffect:false },
  // effect-only “actions” (usually part of results flow, not standalone actions)
  "stun":           { multi:false, reduceDamage:false, lowerEffect:false },
  "slam":           { multi:false, reduceDamage:false, lowerEffect:false },
  "kill":           { multi:false, reduceDamage:false, lowerEffect:false },
};

/** Get merged capabilities for an action; allows per-item/power overrides */
export function getActionCapabilities(actionType, { actor=null, item=null, power=null } = {}) {
  const base = ACTION_CAPS[actionType] || { multi:false, reduceDamage:false, lowerEffect:false };
  const caps = { ...base };

  // Example extension points:
  // - Power stunt flag to allow multi for specific powers
  if (power?.flags?.msh?.multiAttackStunt === true) caps.multi = true;

  // - Some items might allow pulling or special “up to” wording
  if (item?.flags?.msh?.allowsReduceDamage === true) caps.reduceDamage = true;
  if (item?.flags?.msh?.allowsLowerEffect === true)  caps.lowerEffect  = true;

  return caps;
}

/** Apply capabilities to the current dialog UI (non-destructive: hide/disable only) */
export function applyCapabilitiesToDialog(html, actionType, ctx = {}) {
  const caps = getActionCapabilities(actionType, ctx);
  const $root = $(html);
  const $pull  = $root.find("#msh-section-pull, .msh-pull-section");   // prefer an explicit id/class; fallback ok
  const $multi = $root.find("#msh-section-multi, .msh-multi-section");

  // Pull section sub-controls
  const $pulledDamageRow = $pull.find('[name="pulledDamage"]').closest("div");
  const $resultCapRow    = $pull.find('[name="resultCap"]').closest("div");

  if (!caps.reduceDamage) $pulledDamageRow.hide();
  if (!caps.lowerEffect)  $resultCapRow.hide();
  if (!caps.reduceDamage && !caps.lowerEffect) $pull.hide();

  if (!caps.multi) {
    // Hide only the 2/3 controls
    const $ma   = $root.find('[name="multiAttacks"]');
    const $mopt = $root.find('#multi-attack-options');
    if ($ma.length)   $ma.closest("div").hide().find("input,select").prop("disabled", true);
    if ($mopt.length) $mopt.hide().find("input,select").prop("disabled", true);

    // If we are NOT adjacentOnly, also hide the adjacent checkbox and wrapper
    if (!caps.adjacentOnly) {
      const $adj = $root.find('[name="multiAdjacent"]');
      if ($adj.length) $adj.closest("div").hide().find("input,select").prop("disabled", true);
      if ($multi.length) $multi.hide();
    }
  }

  // For consistency, make sure downstream reads don’t crash if hidden:
  // If a row is hidden and input missing, we default to safe values:
  if (!$pull.length) {
    $root.data("msh-no-pull", true);
  }
  if (!$multi.length) {
    $root.data("msh-no-multi", true);
  }
}

/**
 * @deprecated Use game.msh.fx.playAttack() instead.
 * Retained as a thin compatibility shim. Will be removed in a future commit
 * once all call sites are migrated.
 */
let _warnedAttackEffect = false;
export async function playAttackEffect(effectPath, sourceToken, targetTokens = [], options = {}) {
  if (!_warnedAttackEffect) {
    console.warn("[FASERIP] playAttackEffect() is deprecated — use game.msh.fx.playAttack() instead.");
    _warnedAttackEffect = true;
  }
  if (!game.modules.get("sequencer")?.active) return;
  
  const targets = targetTokens.length ? targetTokens : Array.from(game.user.targets);
  if (!sourceToken || !targets.length) return;

  try {
    const sequence = new Sequence();
    
    for (const target of targets) {
      sequence.effect()
        .file(effectPath)
        .atLocation(sourceToken)
        .stretchTo(target)
        .duration(options.duration || 1000)
        .scale(options.scale || 1.0)
        .opacity(options.opacity || 1.0)
        .waitUntilFinished(options.wait ? -500 : 0);
    }
    
    await sequence.play();
  } catch (err) {
    console.warn("Sequencer effect failed:", err);
  }
}

/**
 * @deprecated Use game.msh.fx.playAttack() (handles impact internally) instead.
 */
let _warnedImpactEffect = false;
export async function playImpactEffect(effectPath, targetTokens = [], options = {}) {
  if (!_warnedImpactEffect) {
    console.warn("[FASERIP] playImpactEffect() is deprecated — use game.msh.fx.playAttack() instead.");
    _warnedImpactEffect = true;
  }
  if (!game.modules.get("sequencer")?.active) return;
  
  const targets = targetTokens.length ? targetTokens : Array.from(game.user.targets);
  if (!targets.length) return;

  try {
    const sequence = new Sequence();
    
    for (const target of targets) {
      sequence.effect()
        .file(effectPath)
        .atLocation(target)
        .scale(options.scale || 1.0)
        .opacity(options.opacity || 1.0);
    }
    
    await sequence.play();
  } catch (err) {
    console.warn("Sequencer impact effect failed:", err);
  }
}

/**
 * @deprecated Asset resolution now lives inside fx-service.js.
 * Item-level overrides via system.vfx.preset / system.vfx.asset are preferred.
 */
let _warnedEffectPath = false;
export function getAttackEffectPath(attackType, color = "blue", variant = "01") {
  if (!_warnedEffectPath) {
    console.warn("[FASERIP] getAttackEffectPath() is deprecated — fx-service handles asset resolution.");
    _warnedEffectPath = true;
  }
  const effectMap = {
    "energy": `jb2a.energy_beam.normal.${color}.${variant}`,
    "force": `jb2a.impact.010.${color}`,
    "lightning": `jb2a.chain_lightning.primary.${color}.${variant}`,
    "fire": `jb2a.fire_bolt.${color}`,
    "ice": `jb2a.ice_spikes.radial.${variant}`,
    "laser": `jb2a.laser_blast.${color}`,
    "magic": `jb2a.magic_missile.${color}`
  };
  
  return effectMap[attackType] || effectMap["energy"];
}

/**
 * Setup complete mode selector with persistence
 * @param {Actor} actor - The actor to save/load mode from
 * @param {jQuery} $html - The dialog HTML
 * @param {Object} opts - Options object to update
 * @param {string} flagName - Flag name to save mode (e.g., "lastBluntMode")
 * @returns {string} Current mode value
 */
export async function setupModeSelector(actor, $html, opts = {}, flagName = "lastActionMode") {
  // Read global combat mode — the single source of truth
  let globalMode = "semi";
  try {
    globalMode = game.settings?.get?.("msh-faserip", "defaultCombatMode") || "semi";
  } catch (_) {}

  const modeRank = { manual: 0, semi: 1, full: 2 };
  const globalRank = modeRank[globalMode] ?? 1;

  // If global is "full" or "manual", lock to that mode (no per-dialog override)
  const lockedMode = (globalMode === "full" || globalMode === "manual") ? globalMode : null;

  let activeMode;
  if (lockedMode) {
    activeMode = lockedMode;
  } else {
    // Semi mode: allow manual or semi, cap at global
    const rawSaved = (await actor.getFlag("msh-faserip", flagName)) || "semi";
    const savedRank = modeRank[rawSaved] ?? 1;
    activeMode = savedRank <= globalRank ? rawSaved : globalMode;
  }
  
  // Initialize opts
  opts.mode = activeMode;
  const derived = (activeMode === "full")
    ? { autoApply: true, showConfirm: false }
    : (activeMode === "semi")
      ? { autoApply: false, showConfirm: true }
      : { autoApply: false, showConfirm: false };
  Object.assign(opts, derived);
  
  // Update visual state to match active mode
  const $buttons = $html.find(".faserip-mode-row .faserip-mode");
  $buttons.each(function() {
    const $b = $(this);
    const btnMode = $b.data("mode");
    const btnRank = modeRank[btnMode] ?? 1;
    const isActive = btnMode === activeMode;
    const isDisabled = !!lockedMode || (btnRank > globalRank);

    if (isActive) {
      $b.css({
        "background": $b.data("bg"),
        "color": $b.data("text"),
        "font-weight": "600",
        "border-color": $b.data("border"),
        "opacity": "1"
      });
    } else {
      $b.css({
        "background": "#e0e0e0",
        "color": "#999",
        "font-weight": "400",
        "border-color": "#bbb",
        "opacity": isDisabled ? "0.5" : "1"
      });
    }
    if (isDisabled) {
      $b.css("pointer-events", "none");
      $b.find("input").prop("disabled", true);
    }
  });
  
  // Only attach click handlers if mode is not locked
  if (!lockedMode) {
    attachModeSelectorHandlers($html, opts, async (mode, derived) => {
      await actor.setFlag("msh-faserip", flagName, mode);
      debugLog(`Mode changed to ${mode} and saved to ${flagName}`);
    });
  }
  
  return activeMode;
}


/** Build the Manual / Semi / Full mode selector strip.
 *  When global mode is "full" or "manual", the selector is locked to that mode.
 *  When global is "semi", manual and semi are available (full is disabled).
 */
export function buildModeSelector({ mode, disabled = false, disabledReason = "" } = {}) {
  // Read global combat mode as the authority
  let globalMode = "semi";
  try {
    globalMode = game.settings?.get?.("msh-faserip", "defaultCombatMode") || "semi";
  } catch (_) {}

  // If global is "full" or "manual", lock to that mode
  const lockedMode = (globalMode === "full" || globalMode === "manual") ? globalMode : null;
  const activeMode = lockedMode || mode || "semi";

  // FASERIP traffic light colors: Manual=Red (stop), Semi=Yellow (caution), Full=Green (go)
  const colors = {
    manual: { bg: '#c62828', border: '#b71c1c', text: '#fff' },  // Red
    semi:   { bg: '#f9a825', border: '#f57f17', text: '#000' },  // Yellow
    full:   { bg: '#2e7d32', border: '#1b5e20', text: '#fff' }   // Green
  };
  
  const modeRank = { manual: 0, semi: 1, full: 2 };
  const globalRank = modeRank[globalMode] ?? 1;

  const mk = (val, label) => {
    const active = activeMode === val;
    const valRank = modeRank[val] ?? 1;
    // Disable buttons above global ceiling, or all buttons when locked
    const isDisabled = disabled || !!lockedMode || (valRank > globalRank);
    const c = colors[val];
    const baseStyle = "display:inline-flex;align-items:center;padding:4px 10px;border:2px solid;border-radius:4px;margin-left:4px;cursor:pointer;font-size:12px;";
    const activeStyle = `background:${c.bg};color:${c.text};font-weight:600;border-color:${c.border};`;
    const inactiveStyle = `background:#e0e0e0;color:#999;border-color:#bbb;`;
    const disStyle = isDisabled ? "pointer-events:none;opacity:.5;" : "";
    const tip = isDisabled ? (disabledReason || `Locked by global setting: ${globalMode}`) : "";
    return `<label class="faserip-mode" data-mode="${val}" data-bg="${c.bg}" data-border="${c.border}" data-text="${c.text}" 
                   style="${baseStyle}${active ? activeStyle : inactiveStyle}${disStyle}" 
                   title="${tip}">
              <input type="radio" name="combatMode" value="${val}" ${active ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} style="display:none;">
              ${label}
            </label>`;
  };

  const lockNote = lockedMode 
    ? `<span style="font-size:11px;color:#666;margin-left:8px;">(locked: ${lockedMode})</span>` 
    : "";

  return `
    <div class="faserip-mode-row" style="display:flex;align-items:center;justify-content:flex-end;gap:4px;margin:4px 0 8px;">
      <span style="font-size:12px;color:#666;margin-right:6px;">Mode:</span>
      ${mk("manual","Manual")}
      ${mk("semi","Semi")}
      ${mk("full","Full")}
      ${lockNote}
      ${disabled && disabledReason ? `<span style="font-size:11px;color:#a33;margin-left:8px;">${disabledReason}</span>` : ""}
    </div>`;
}

/** Attach click handlers; updates opts.mode and derived flags, calls onChange(mode) */
export function attachModeSelectorHandlers($html, opts = {}, onChange) {
  const $labels = $html.find(".faserip-mode-row .faserip-mode");
  if (!$labels.length) return;

  // Read global ceiling
  let globalMode = "semi";
  try {
    globalMode = game.settings?.get?.("msh-faserip", "defaultCombatMode") || "semi";
  } catch (_) {}
  const modeRank = { manual: 0, semi: 1, full: 2 };
  const globalRank = modeRank[globalMode] ?? 1;

  const colors = {
    manual: { bg: '#c62828', border: '#b71c1c', text: '#fff' },
    semi:   { bg: '#f9a825', border: '#f57f17', text: '#000' },
    full:   { bg: '#2e7d32', border: '#1b5e20', text: '#fff' }
  };

  const applyFlags = (modeVal) => {
    const mode = String(modeVal || "semi");
    const derived = (mode === "full")
      ? { autoApply: true, showConfirm: false }
      : (mode === "semi")
        ? { autoApply: false, showConfirm: true }
        : { autoApply: false, showConfirm: false };
    if (opts) {
      opts.mode = mode;
      opts.autoApply = derived.autoApply;
      opts.showConfirm = derived.showConfirm;
    }
    if (typeof onChange === "function") onChange(mode, derived);
  };

  $labels.on("click", (ev) => {
    const $label = $(ev.currentTarget);
    const mode = $label.data("mode");
    const clickRank = modeRank[mode] ?? 1;

    // Enforce ceiling: ignore clicks above global mode
    if (clickRank > globalRank) return;

    const c = colors[mode];
    
    // Reset all labels to inactive
    $labels.each(function() {
      $(this).css({
        "background": "#e0e0e0",
        "color": "#999",
        "font-weight": "400",
        "border-color": "#bbb"
      });
    });
    
    // Set clicked label to active with its color
    $label.css({
      "background": c.bg,
      "color": c.text,
      "font-weight": "600",
      "border-color": c.border
    });
    
    // Update the hidden radio
    $label.find('input[type="radio"]').prop('checked', true);
    
    applyFlags(mode);
  });
}

// Re-exported from rules-reference.js — do not redefine here
export { RANKS, RANK_VALUES, rankValue, valueToRank };

/**
 * Scan target for best mental defense: Psi-Screen first, then Mental Powers, then Psyche.
 * Returns { rank, value, source }.
 */
export function scanMentalDefenses(targetActor, baseSaveAbility) {
  const psycheRank  = targetActor?.system?.abilities?.psyche?.rank  || "Typical";
  const psycheValue = targetActor?.system?.abilities?.psyche?.value || rankValue(psycheRank);
  let bestDef = { rank: psycheRank, value: psycheValue, source: "Psyche" };

  if (!targetActor?.items) return bestDef;
  if (baseSaveAbility !== "psyche") return bestDef;

  const powers = targetActor.items.filter(i => i.type === "power" && i.system?.isActive !== false);

  // 1) Psi-Screen — use before any other (RAW)
  const psiScreen = powers.find(p => {
    const n = (p.name || "").toLowerCase();
    return n.includes("psi-screen") || n.includes("psi screen") || n.includes("psiscreen");
  });
  if (psiScreen) {
    const pv = psiScreen.system.value || rankValue(psiScreen.system.rank || "Typical");
    if (pv > bestDef.value) {
      bestDef = { rank: psiScreen.system.rank || "Typical", value: pv, source: psiScreen.name };
    }
  }

  // 2) Mental Powers — may use Power rank instead of Psyche (only if no Psi-Screen)
  if (!psiScreen) {
    const mentalRes = powers.find(p => {
      const n = (p.name || "").toLowerCase();
      return n.includes("mental resistance") || n.includes("resist mental");
    });
    if (mentalRes) {
      const mv = mentalRes.system.value || rankValue(mentalRes.system.rank || "Typical");
      if (mv > bestDef.value) {
        bestDef = { rank: mentalRes.system.rank || "Typical", value: mv, source: mentalRes.name };
      }
    }
    const mentalPowers = powers.filter(p => {
      const cat = (p.system.category || "").toLowerCase();
      return cat === "mentalpowers" || cat === "mental powers" || cat === "mental";
    });
    for (const mp of mentalPowers) {
      const mv = mp.system.value || rankValue(mp.system.rank || "Typical");
      if (mv > bestDef.value) {
        bestDef = { rank: mp.system.rank || "Typical", value: mv, source: mp.name };
      }
    }
  }

  return bestDef;
}

/**
 * Scan target for active Force Field power.
 * Returns { rank, value, source } or null.
 */
export function scanForceField(targetActor) {
  if (!targetActor?.items) return null;
  const ff = targetActor.items.find(i =>
    i.type === "power" &&
    (i.name || "").toLowerCase().includes("force field") &&
    i.system?.isActive !== false
  );
  if (!ff) return null;
  const ffValue = ff.system.value || rankValue(ff.system.rank || "Typical");
  return { rank: ff.system.rank || "Typical", value: ffValue, source: ff.name };
}

export function debugLog(...args) {
  try {
    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log("FASERIP DEBUG |", ...args);
    }
  } catch (_) {
    // settings may not exist yet during early boot
    console.log("FASERIP DEBUG |", ...args);
  }
}

// Re-exported from rules-reference.js
export { shiftRank };

export function labelFor(actionType) { return ACTION_LABELS[actionType] ?? actionType; }
export function effectsFor(actionType) { return ACTION_EFFECTS[actionType] ?? {white:"White",green:"Green",yellow:"Yellow",red:"Red"}; }

export function getAbilityInfo(actor, abilityName) {
  const ability = actor?.system?.abilities?.[abilityName];
  if (!ability) throw new Error(`Ability ${abilityName} not found for ${actor?.name}`);
  // Apply ability shift from Active Effects (equipment boosts, impairment, etc.)
  const cs = getAbilityShift(actor, abilityName);
  if (cs !== 0) {
    const shifted = shiftRank(ability.rank, cs);
    const shiftedVal = game.msh?.getRankValue?.(shifted) ?? ability.value;
    return {
      name: abilityName.charAt(0).toUpperCase() + abilityName.slice(1),
      rank: shifted,
      value: shiftedVal,
      baseRank: ability.rank,
      baseValue: ability.value,
      abilityShiftCS: cs
    };
  }
  return {
    name: abilityName.charAt(0).toUpperCase() + abilityName.slice(1),
    rank: ability.rank,
    value: ability.value,
    baseRank: ability.rank,
    baseValue: ability.value,
    abilityShiftCS: 0
  };
}

export function getStrengthInfo(actor) {
  const s = actor?.system?.abilities?.strength;
  const baseRank = s?.rank ?? "Typical";
  const baseValue = s?.value ?? 6;
  // Apply strength shift from Active Effects
  const cs = getAbilityShift(actor, "strength");
  if (cs !== 0) {
    const shifted = shiftRank(baseRank, cs);
    const shiftedVal = game.msh?.getRankValue?.(shifted) ?? baseValue;
    return { rank: shifted, value: shiftedVal, baseRank, baseValue, abilityShiftCS: cs };
  }
  return { rank: baseRank, value: baseValue, baseRank, baseValue, abilityShiftCS: 0 };
}

export function rollD100() {
  return (new Roll("1d100"));
}

export function universalColor(rankName, total) {
  return game.msh.rollUniversalTable(rankName, total); // uses your existing table resolver
}

// Roll + Karma spending (uses lifetime karma only)
export async function rollWithKarma(actor, actionLabel, requestedKarma = 0) {
  const roll = await (new Roll("1d100")).evaluate();
  let cappedTotal = roll.total;
  let karmaUsed = 0;

  const k = Math.max(0, Number(requestedKarma||0));
  if (k > 0) {
    karmaUsed = k;
    cappedTotal = Math.min(100, roll.total + karmaUsed);

    // Create history entry for karma spending
    const historyEntry = {
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -karmaUsed,
      type: "Die Roll",
      description: `Spent karma on ${actionLabel}`
    };
    
    const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
    currentHistory.push(historyEntry);
    
    await game.msh.runAsGM({
      operation: 'update',
      targetActorUuid: actor.uuid,
      args: [{ "system.karma.history": currentHistory }]
    });
  }

  return { roll, cappedTotal, totalKarmaUsed: karmaUsed };
}

// Item filters
export const isBluntCapable = (it) => {
  const s = it.system || {};
  const tagHit = Array.isArray(s.tags) && (s.tags.includes("BA") || s.tags.includes("blunt"));
  return (s.damageType === "BA") || (s.attackType === "blunt") || tagHit;
};

/**
 * Show dice animation for a roll
 * In consolidated mode, uses DiceSoNice directly; otherwise uses toMessage
 * @param {Roll} roll - The evaluated roll
 * @param {Actor} actor - The actor making the roll
 * @param {string} flavor - Flavor text for the roll message
 * @param {boolean} useConsolidated - Whether to use consolidated mode (no chat message)
 */
export async function showDiceAnimation(roll, actor, flavor, useConsolidated = false) {
  if (useConsolidated) {
    // In consolidated mode, show dice via DiceSoNice directly (no chat message)
    if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }
  } else {
    // Normal mode: show roll as separate chat message
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor,
      rollMode: game.settings.get("core", "rollMode")
    });
  }
}

// Roll + Karma (same behavior you had, packaged up)
// inlineRoll: true = suppress separate roll chat message (roll embedded in action card)
export async function rollWithKarmaAndHistory(actor, actionLabel, requestedKarma = 0, baseTotal, options = {}) {
  const { spendKarma = false, rank = null, skipDice = false, inlineRoll = false } = options;
  
  // Check game setting for consolidated chat cards
  let useInlineRoll = inlineRoll;
  try {
    if (game.settings.get("msh-faserip", "consolidatedChatCards")) {
      useInlineRoll = true;
    }
  } catch (_e) { /* setting not registered yet */ }
  
  // Create roll - if baseTotal is a Roll instance, use it; otherwise create new
  // skipDice controls whether we show the dice animation, not whether we roll
  let roll;
  let raw;
  
  if (baseTotal instanceof Roll) {
    roll = baseTotal;
    raw = baseTotal.total;
  } else {
    roll = new Roll("1d100");
    await roll.evaluate();
    
    // Show dice animation unless skipped
    if (!skipDice) {
      if (useInlineRoll) {
        // In consolidated mode, show dice via DiceSoNice directly (no chat message)
        if (game.dice3d) {
          await game.dice3d.showForRoll(roll, game.user, true);
        }
      } else {
        // Normal mode: show roll as separate chat message
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: actionLabel,
          rollMode: game.settings.get("core", "rollMode")
        });
      }
    }
    raw = roll.total;
  }

  let cappedTotal = raw;
  let karmaUsed = 0;

  // Determine if we're spending karma (legacy: requestedKarma > 0, new: spendKarma flag)
  const isSpendingKarma = spendKarma || requestedKarma > 0;

  if (isSpendingKarma && rank) {
    // NEW TWO-PHASE SYSTEM: Show dialog after rolling to let player decide amount
    const { showKarmaDecisionDialog } = await import("../dice/dice-roller.js");
    
    // Get initial color result
    const initialColor = game.msh.rollUniversalTable(rank, raw);
    
    // Show decision dialog (Phase 2)
    const result = await showKarmaDecisionDialog(actor, raw, rank, actionLabel, initialColor);
    
    cappedTotal = result.finalResult;
    karmaUsed = result.karmaSpent;
    // Karma already deducted in showKarmaDecisionDialog
    
  } else if (requestedKarma > 0) {
    // LEGACY FALLBACK: If no rank provided, use old direct spending method
    const karmaToSpend = Math.max(0, Number(requestedKarma || 0));
    
    cappedTotal = Math.min(100, raw + karmaToSpend);
    karmaUsed = karmaToSpend;

    const historyEntry = {
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -karmaUsed,
      type: "Die Roll",
      description: `Spent karma on ${actionLabel}`
    };

    const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
    await game.msh.runAsGM({
      operation: 'update',
      targetActorUuid: actor.uuid,
      args: [{ "system.karma.history": currentHistory.concat([historyEntry]) }]
    });
  }

  return { roll, cappedTotal, totalKarmaUsed: karmaUsed };
}

/**
 * Build HTML for inline roll display in consolidated chat cards
 * @param {Roll} roll - The Foundry Roll object
 * @param {number} karmaUsed - Amount of karma spent
 * @param {number} cappedTotal - Final total after karma (capped at 100)
 * @returns {string} HTML string for the roll display
 */
export function buildInlineRollDisplay(roll, karmaUsed = 0, cappedTotal = null) {
  if (!roll) return "";
  
  const finalTotal = cappedTotal ?? roll.total;
  const diceResult = roll.total;
  
  // Determine dice face styling based on result
  const getDiceStyle = (result) => {
    if (result >= 90) return { bg: "#c62828", fg: "#fff" };  // High roll - red
    if (result >= 70) return { bg: "#f57c00", fg: "#fff" };  // Good roll - orange
    if (result >= 50) return { bg: "#fbc02d", fg: "#333" };  // Medium roll - yellow
    if (result >= 30) return { bg: "#689f38", fg: "#fff" };  // Decent roll - green
    return { bg: "#455a64", fg: "#fff" };                     // Low roll - gray
  };
  
  const diceStyle = getDiceStyle(diceResult);
  
  let rollHtml = `
    <div class="faserip-inline-roll" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f8f8f8;border:1px solid #ddd;border-radius:3px;margin:4px 0;">
      <div class="dice-result" style="
        display:flex;align-items:center;justify-content:center;
        min-width:42px;height:42px;
        background:${diceStyle.bg};color:${diceStyle.fg};
        border-radius:4px;font-weight:bold;font-size:1.3em;
        box-shadow:inset 0 -2px 4px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.15);
      ">
        ${diceResult}
      </div>
      <div class="roll-details" style="flex:1;font-size:0.9em;">
        <div style="color:#666;">d100 Roll</div>`;
  
  if (karmaUsed > 0) {
    rollHtml += `
        <div style="color:#8b4513;font-weight:500;">
          ${diceResult} + ${karmaUsed} Karma = <strong>${finalTotal}</strong>
        </div>`;
  } else {
    rollHtml += `
        <div><strong>Total: ${finalTotal}</strong></div>`;
  }
  
  rollHtml += `
      </div>
    </div>`;
  
  return rollHtml;
}

/**
 * Build HTML for inline FEAT check result (e.g., multi-attack FEAT)
 * @param {Object} featResult - Result from FEAT check
 * @param {string} featName - Name of the FEAT check
 * @returns {string} HTML string for the FEAT result display
 */
export function buildInlineFeatDisplay(featResult, featName = "FEAT Check") {
  if (!featResult) return "";
  
  const { success, auto, intensity, roll, totalRoll, resultColor } = featResult;
  
  const bgColor = success ? "#e8f5e9" : "#ffebee";
  const borderColor = success ? "#4caf50" : "#f44336";
  const textColor = success ? "#2e7d32" : "#d32f2f";
  const statusText = success ? "SUCCESS" : "FAILED";
  const autoText = auto ? " (Automatic)" : "";
  
  let html = `
    <div class="faserip-inline-feat" style="
      background:${bgColor};border:1px solid ${borderColor};border-radius:3px;
      padding:6px 8px;margin:4px 0;font-size:0.9em;
    ">
      <div style="color:${textColor};font-weight:600;margin-bottom:2px;">
        ${featName}: ${statusText}${autoText}
      </div>`;
  
  if (!auto && roll) {
    html += `
      <div style="color:#555;">
        Roll: ${roll.total}${totalRoll !== roll.total ? ` + Karma = ${totalRoll}` : ""} 
        vs ${intensity} → <strong style="text-transform:uppercase;">${resultColor}</strong>
      </div>`;
  } else if (auto) {
    html += `
      <div style="color:#555;font-style:italic;">
        Ability rank sufficiently exceeds ${intensity} intensity
      </div>`;
  }
  
  html += `</div>`;
  
  return html;
}


// Build the 4-cell result grid
// Result grid + actions + banner
export function buildResultGrid(actionType, activeColorLower, effects, hoverFn = getResultHoverText) {
  const cell = (active, baseBG, activeBG, baseFG, activeFG, baseBDR, activeBDR, bold) => ({
    bg: active ? activeBG : baseBG,
    fg: active ? activeFG : baseFG,
    bdr: active ? activeBDR : baseBDR,
    b: active ? bold : 'normal'
  });
  const isW = activeColorLower==='white', isG=activeColorLower==='green',
        isY = activeColorLower==='yellow', isR=activeColorLower==='red';
  const whiteCell  = cell(isW, '#f0f0f0','#333',    '#666','#fff','1px solid #ccc','2px solid #000','bold');
  const greenCell  = cell(isG, '#f0f0f0','#4CAF50', '#666','#fff','1px solid #ccc','2px solid #2e7d32','bold');
  const yellowCell = cell(isY, '#f0f0f0','#FFC107', '#666','#333','1px solid #ccc','2px solid #f57c00','bold');
  const redCell    = cell(isR, '#f0f0f0','#F44336', '#666','#fff','1px solid #ccc','2px solid #c62828','bold');
  const ho = (c)=> (hoverFn ? hoverFn(actionType, c) : "");

  return `
  <div style="padding:5px 10px; margin:5px 0; background-color:#fff; border:1px solid #ddd;">
    <div style="font-weight:bold; margin-bottom:5px; color:#333;">Possible Results:</div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:3px; font-size:0.85em;">
      <div style="padding:4px;background:${whiteCell.bg};color:${whiteCell.fg};border:${whiteCell.bdr};font-weight:${whiteCell.b};text-align:center;" title="${ho('white')}">White: ${effects.white}</div>
      <div style="padding:4px;background:${greenCell.bg};color:${greenCell.fg};border:${greenCell.bdr};font-weight:${greenCell.b};text-align:center;" title="${ho('green')}">Green: ${effects.green}</div>
      <div style="padding:4px;background:${yellowCell.bg};color:${yellowCell.fg};border:${yellowCell.bdr};font-weight:${yellowCell.b};text-align:center;" title="${ho('yellow')}">Yellow: ${effects.yellow}</div>
      <div style="padding:4px;background:${redCell.bg};color:${redCell.fg};border:${redCell.bdr};font-weight:${redCell.b};text-align:center;" title="${ho('red')}">Red: ${effects.red}</div>
    </div>
  </div>`;
}

// Action buttons box (placeholder chips + optional Breaking FEAT)
export function buildActionsBox({
  showSlam = false,
  showStun = false,
  showKill = false,
  showEscape = false,
  showHoldDamage = false,
  holdDamageMax = 0,
  holdDamageRank = "",
  holdTargetUuid = "",
  holdTargetName = "",
  showGrappleBack = false,
  grappleBackTargetUuid = "",
  grappleBackTargetName = "",
  showNullifySave = false,
  nullifyIntensityRank = "",
  saveAbility = "endurance",  // NEW: which ability to save against (endurance, psyche, etc.)
  pulled = false,
  breakingFeat = null,
  grabbingBreak = null,
  actorUuid,
  damage = 0,
  attackForm = "blunt",
  damageType = "physical-blunt",
  armorPiercing = 0,
  armorPiercingCS = 0,
  apMode = "value",        
  prefillData = null,
  targetUuid = "",
  targetName = "",
  targetStrength = "",
  autoApply = false,  // attacker-side auto apply (damage)
  autoSave  = false,  // defender-side auto save (disable save chips)
  bypassArmor = false,
  bypassForceField = false
}) {

  // Small helper to render a chip
  const chip = (label, title, enabled, dataAttrs = "") => {
    const base = "display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;font-size:13px;line-height:1.2;padding:4px 10px;border:1px solid #bbb;border-radius:4px;text-decoration:none;white-space:nowrap;";
    const style = enabled
      ? `${base}background:#fff;color:#333;cursor:pointer;`
        : `${base}background:#f7f7f7;color:#333;cursor:not-allowed;opacity:.55;filter:grayscale(.3);pointer-events:none;`;
    const key = label.toLowerCase().replace(/\s+/g, "-");
    const hasActionAttr = /\bdata-action\s*=/.test(dataAttrs);
    const actionAttr = hasActionAttr ? "" : `data-action="${key}"`;
    return `<a class="faserip-chip" ${actionAttr} ${dataAttrs} ${enabled ? "" : 'aria-disabled="true"'} title="${title}" style="${style}">${label}</a>`;
  };

  const parts = [];

  // Derive the penetrating damage value that the hook expects (dataset.dmg)
  // Prefer prefillData.dmgThrough, fall back to the provided damage param.
  const dmgPen = Number((prefillData && prefillData.dmgThrough) ?? damage ?? 0);

  // Optional JSON prefill for backward compatibility with older handlers
  const prefillJson = prefillData ? JSON.stringify(prefillData) : null;
  const prefillAttr = prefillJson ? `data-prefill='${prefillJson.replace(/'/g, "&apos;")}'` : "";

  // Apply Damage chip (to apply damage to selected/targeted token[s])
  // Skip button in auto mode since damage applies automatically
  if (dmgPen > 0 && !autoApply) {  // check auto mode
    parts.push(
      chip(
        "Apply Damage",
        "Apply damage to targeted or selected token(s)",
        true,
        `data-action="apply-damage"
        data-damage="${dmgPen}"
        data-attacker-uuid="${actorUuid}"
        data-bypass-armor="${bypassArmor}"
        data-damage-type="${damageType || 'physical-blunt'}"
        data-attack-form="${attackForm || 'blunt'}"
        data-is-kill="${showKill ? 'true' : 'false'}"
        data-armor-piercing="${Number(armorPiercing || 0)}"
        data-armor-piercing-cs="${Number(armorPiercingCS || 0)}"
        data-ap-mode="${apMode}"
        data-bypass-force-field="${bypassForceField ? 'true' : 'false'}"`
      )
    );
  }

  // Slam chip — only if requested by caller and not in auto mode
  if (showSlam && !autoApply) {
    parts.push(
      chip(
        "Resolve Slam",
        "Open Slam dialog using penetrating damage",
        true,
        
        `data-check="slam" data-attack-form="${attackForm}" data-dmg="${dmgPen}" data-borderline="${prefillData?.borderline ? '1' : ''}" data-attacker-uuid="${actorUuid}" ${pulled ? 'data-pulled="true"' : ""} ${prefillAttr}`
      )
    );
  }

  // Stun chip
  if (showStun && !autoApply) {
    parts.push(
      chip(
        "Resolve Stun",
        "Open Stun dialog using penetrating damage",
        true,
        `data-check="stun"
        data-attack-form="${attackForm}"
        data-damage-type="${damageType}"
        data-dmg="${dmgPen}"
        data-borderline="${prefillData?.borderline ? '1' : ''}"
        data-attacker-uuid="${actorUuid}"
        ${pulled ? 'data-pulled="true"' : ""} ${prefillAttr}`
      )
    );
  }

  // Kill chip
  if (showKill && !autoApply) {
    parts.push(
      chip(
        "Resolve Kill",
        "Open Kill check dialog",
        true,
        
        `data-check="kill"
        data-attack-form="${attackForm}"
        data-damage-type="${damageType}"
        data-dmg="${dmgPen}"
        data-borderline="${prefillData?.borderline ? '1' : ''}"
        data-attacker-uuid="${actorUuid}"
        ${prefillAttr}`
      )
    );
  }

  // Escape chip
  if (showEscape) {
    const targetBits = [
      targetUuid ? `data-defender-uuid="${targetUuid}"` : "",
      targetName ? `data-defender-name="${targetName}"` : "",
      targetStrength ? `data-defender-rank="${targetStrength}"` : ""
    ].join(" ");
    parts.push(
      chip(
        "Attempt Escape",
        "Open Escape check dialog",
        true,
        `data-check="escape" data-attack-form="${attackForm}" data-attacker-uuid="${actorUuid}" ${targetBits} ${prefillAttr}`
      )
    );
  }

  // Hold Damage chip (for Full Hold - red grappling result)
  if (showHoldDamage && holdDamageMax > 0) {
    const heldTargetBits = [
      holdTargetUuid ? `data-target-uuid="${holdTargetUuid}"` : "",
      holdTargetName ? `data-target-name="${holdTargetName}"` : ""
    ].join(" ");
    parts.push(
      chip(
        "Deal Hold Damage",
        `Inflict up to ${holdDamageRank} (${holdDamageMax}) damage to held target`,
        true,
        `data-action="hold-damage" data-attacker-uuid="${actorUuid}" data-max-damage="${holdDamageMax}" data-damage-rank="${holdDamageRank}" ${heldTargetBits}`
      )
    );
  }

  // Grapple Back chip (for Reverse - red escape result)
  if (showGrappleBack) {
    const grappleTargetBits = [
      grappleBackTargetUuid ? `data-target-uuid="${grappleBackTargetUuid}"` : "",
      grappleBackTargetName ? `data-target-name="${grappleBackTargetName}"` : ""
    ].join(" ");
    parts.push(
      chip(
        "Grapple Back",
        `Attempt to grapple ${grappleBackTargetName || 'your former attacker'}`,
        true,
        `data-action="grapple-back" data-attacker-uuid="${actorUuid}" ${grappleTargetBits}`
      )
    );
  }

  // Optional utility chips
  if (breakingFeat) {
    const weaponMat = breakingFeat.weaponMat || "Excellent";
    const targetMat = breakingFeat.targetMat || "";
    const weaponName = breakingFeat.weaponName || "";
    const itemUuid = breakingFeat.itemUuid || "";
    parts.push(
      chip(
        "Breaking FEAT",
        "Attempt a Breaking FEAT against intensity",
        true,
        `data-action="breaking-feat" data-weapon-mat="${weaponMat}" data-target-mat="${targetMat}" data-weapon-name="${weaponName}" data-item-uuid="${itemUuid}" data-actor-uuid="${actorUuid || ''}" ${prefillAttr}`
      )
    );
  }

  if (grabbingBreak) {
    parts.push(
      chip(
        "Break Grab",
        "Attempt to break a grab or hold",
        true,
        `data-action="grab-break" ${prefillAttr}`
      )
    );
  }

    // Nullify/Mental Power: force save (single target)
  if (showNullifySave) {
    const targetBits = [
      targetUuid ? `data-target-uuid="${targetUuid}"` : "",
      targetName ? `data-target-name="${targetName}"` : ""
    ].join(" ");
    const intensityAttr = nullifyIntensityRank ? `data-intensity-rank="${nullifyIntensityRank}"` : "";
    const saveAttr = saveAbility ? `data-save-ability="${saveAbility}"` : "";
    const saveAbilityUpper = saveAbility.toUpperCase();
    parts.push(
      chip(
        "Force Save",
        `Target makes a ${saveAbilityUpper} FEAT vs power intensity`,
        //true,
        !autoSave,
        `data-action="force-save-nullify" data-attacker-uuid="${actorUuid}" ${targetBits} ${intensityAttr} ${saveAttr}`
      )
    );
  }

  // Render container or nothing
  return parts.length
    ? `<div class="actions-row" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;padding:6px 0 10px;margin:6px 0 2px;">${parts.join("")}</div>`
    : "";
}

export function bannerColors(colorLower) {
  const bg = colorLower==='white' ? '#f8f8f8'
           : colorLower==='green'  ? '#4CAF50'
           : colorLower==='yellow' ? '#FFC107'
           : '#F44336';
  const fg = (colorLower==='white' || colorLower==='yellow') ? '#333' : '#fff';
  return { bg, fg };
}

// Simple banner color/fg
export function resultBannerColors(activeColorLower) {
  const bg = activeColorLower==='white' ? '#f8f8f8'
           : activeColorLower==='green'  ? '#4CAF50'
           : activeColorLower==='yellow' ? '#FFC107'
           : '#F44336';
  const fg = (activeColorLower==='white' || activeColorLower==='yellow') ? '#333' : '#fff';
  return { bg, fg };
}

// Blunt damage: implements the "bump to next rank minimum" rule per FASERIP Advanced Set.
// Rule: "A character using a blunt weapon inflicts up to that item's material strength;
//        if the material strength of the item is greater than the Strength rank of the user,
//        the user's Strength rank is increased to the lowest value of the next rank for damage."
//
// Examples from the book:
//  - Aunt May (Feeble=2) with lead pipe (Excellent=20): damage = 3 (Poor's min).
//  - Daredevil (Good=10) with lead pipe (Excellent=20): damage = 16 (Excellent's min).
//  - Thing (Monstrous=75) with lead pipe (Excellent=20): damage = 20 (capped at MAT).
//
// The weaponBase floor handles combat weapons with printed damage
// ("always a minimum of the damage listed").
export function computeBluntDamage(strRank, strVal, matRank, weaponBase = 0, RANKS_LOCAL=RANKS) {
  const getVal = (r)=> game.msh.getRankValue(r) || 0;
  const sIdx = RANKS_LOCAL.indexOf(strRank);
  const mIdx = RANKS_LOCAL.indexOf(matRank);
  if (sIdx < 0 || mIdx < 0) {
    const dmg = Math.max(strVal, weaponBase);
    return { damage: dmg, note: weaponBase ? `Using max(STR ${strVal}, base ${weaponBase})` : "Using Strength value" };
  }

  const matValue = getVal(matRank);

  // Bump rule: when Strength rank is strictly below material strength rank,
  // damage uses the minimum value of the rank ABOVE the attacker's Strength rank.
  if (sIdx < mIdx) {
    const nextRankName = RANKS_LOCAL[sIdx + 1] || strRank;
    const nextRangeMin = RANK_RANGES[nextRankName]?.[0];
    // If the next rank has a defined range minimum, use it; otherwise fall
    // back to RANK_VALUES (e.g. Class 1000 has no range entry).
    const bumped = (nextRangeMin ?? getVal(nextRankName));
    const dmg = Math.max(bumped, weaponBase);
    return {
      damage: dmg,
      note: `bump ${strRank}→${nextRankName} min (${bumped})${weaponBase ? `, floor ${weaponBase}` : ''} = ${dmg}`
    };
  }

  // Strength rank is at or above material: damage capped at material strength.
  const calcDmg = Math.min(strVal, matValue);
  const dmg = Math.max(calcDmg, weaponBase);
  return { damage: dmg, note: `min(STR ${strVal}, MAT ${matValue})${weaponBase ? `, floor ${weaponBase}` : ''} = ${dmg}` };
}

// Edged-capable item filter (damageType/attackType tags or "edged"/EA)
export const isEdgedCapable = (it) => {
  const s = it.system || {};
  const tagHit = Array.isArray(s.tags) && (s.tags.includes("EA") || s.tags.includes("edged"));
  return (s.damageType === "EA") || (s.attackType === "edged") || tagHit;
};

// Edged damage: min(STR, MAT) but never less than weapon base damage.
// natural weapon case: pass weaponBase = 0, matRank = selected natural rank.
export function computeEdgedDamage(strRank, strVal, matRank, weaponBase = 0, RANKS_LOCAL = RANKS) {
  const getVal = (r)=> game.msh.getRankValue(r) || 0;
  const sIdx = RANKS_LOCAL.indexOf(strRank);
  const mIdx = RANKS_LOCAL.indexOf(matRank);
  if (sIdx < 0 || mIdx < 0) {
    return { damage: Math.max(strVal, weaponBase), note: weaponBase ? `Using base ${weaponBase}` : "Using Strength value" };
  }
  const matVal = getVal(matRank);
  const calc   = Math.min(strVal, matVal);
  const final  = Math.max(calc, weaponBase);
  return { damage: final, note: `min(STR ${strVal}, MAT ${matVal})${weaponBase ? `, floor ${weaponBase}` : ''} = ${final}` };
}

export function getUnitsPerArea() {
  const unit = String(canvas?.scene?.grid?.units || "").toLowerCase();

  // If the scene is already in Areas, DO NOT convert; 1 scene unit == 1 Area
  if (unit === "area" || unit === "areas") return 1;

  // Otherwise, allow GM override if set
  const val = game.settings?.get?.("msh-faserip", "unitsPerArea");
  if (Number.isFinite(val) && val > 0) return Number(val);

  // Fallback by common units
  switch (unit) {
    case "ft":
    case "feet":   return 132; // 44 yards
    case "m":
    case "meter":
    case "meters": return 40;  // ~36.6 m
    case "yd":
    case "yard":
    case "yards":  return 44;  // exactly 44 yards
    default:       return 132;
  }
}

/** Measure scene distance between two points in SCENE UNITS (ft/m/areas), V12+ compatible. */
function measureSceneDistance(p0, p1) {
  if (canvas?.grid?.measurePath) {
    const res = canvas.grid.measurePath([p0, p1], { gridSpaces: false });
    if (typeof res === "number") return res;
    if (res && typeof res.distance === "number") return res.distance;
    if (Array.isArray(res) && res[0] && typeof res[0].distance === "number") return res[0].distance;
    return 0;
  }
  if (canvas?.grid?.measureDistance) {
    const n = canvas.grid.measureDistance(p0, p1);
    return typeof n === "number" ? n : 0;
  }
  return 0;
}

export function measureAreasBetweenTokens(src, dst) {
  if (!src || !dst) return 0;
  const dist = measureSceneDistance(src.center, dst.center);
  const unitsPerArea = getUnitsPerArea();
  const areas = unitsPerArea === 1 ? dist : (dist / unitsPerArea);
  // Any fraction into the next area counts as being in that area for range purposes
  return Math.max(1, Math.ceil(areas));
}

/**
 * Auto-fill the [name="range"] input in a Dialog with measured Areas from the actor’s token to the first target.
 * Returns a disposer to unhook listeners when the dialog closes.
 */
export function attachAutoFillRange(html, actor, onAfterFill) {
  const $range = html.find('[name="range"]');
  if (!$range.length) return () => {};

  const fill = () => {
    try {
      const targets = Array.from(game.user?.targets ?? []);
      if (!targets.length) return;
      const dst = targets[0];

      const src = canvas.tokens?.controlled?.[0]
        || canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
      if (!src || !dst) return;

      const areas = measureAreasBetweenTokens(src, dst);
      $range.val(String(areas)).trigger("input");
      if (typeof onAfterFill === "function") onAfterFill();
    } catch (e) {
      console.warn("attachAutoFillRange: fill failed", e);
    }
  };

  fill();

  const onTarget = () => fill();
  const onMove   = () => fill();

  Hooks.on("targetToken", onTarget);
  Hooks.on("updateToken", onMove);

  return () => {
    Hooks.off("targetToken", onTarget);
    Hooks.off("updateToken", onMove);
  };
}

export function getResultHoverText(actionType, color) {
  const hoverTexts = {
    'blunt-attack': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict Strength rank damage',
      yellow: 'Slam - Inflict damage and may Slam opponent',
      red: 'Stun - Inflict damage and may Stun opponent'
    },
    'edged-attack': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict weapon damage',
      yellow: 'Stun - Inflict damage and may Stun opponent',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'shooting': {
      white: 'Miss - No damage, may hit another target',
      green: 'Hit - Inflict weapon damage',
      yellow: 'Bullseye - Hit specific target area',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'throwing-edged': {
      white: 'Miss - No damage, may hit another target',
      green: 'Hit - Inflict weapon damage',
      yellow: 'Stun - Inflict damage and may Stun opponent',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'throwing-blunt': {
      white: 'Miss - No damage',
      green: 'Hit - Inflict Strength or material damage',
      yellow: 'Hit - Inflict Strength or material damage',
      red: 'Stun - Inflict damage and may Stun opponent'
    },
    'energy': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict power rank damage',
      yellow: 'Bullseye - Hit specific target area',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'force': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict power rank damage',
      yellow: 'Bullseye - Hit specific target area',
      red: 'Stun - Inflict damage and may Stun opponent'
    },
    'grappling': {
      white: 'Miss - Failed to hold opponent, no other attacks this turn',
      green: 'Miss - Failed to hold opponent, no other attacks this turn',
      yellow: 'Partial Hold - Grabbed limb, target acts at -2CS',
      red: 'Hold - Target fully restrained, can inflict Strength damage'
    },
    'grabbing': {
      white: 'Miss - Item not taken, may be knocked loose',
      green: 'Take - Gained possession if Strength ≥ target',
      yellow: 'Grab - Gained possession regardless of Strength',
      red: 'Break - Item taken or potentially damaged/activated'
    },
    'escaping': {
      white: 'Miss - Still held, no other actions this turn',
      green: 'Escape - Free of hold, may move half speed',
      yellow: 'Escape - Free of hold, may move half speed',
      red: 'Reverse - Free and may counter-grapple or act at -2CS'
    },
    'charging': {
      white: 'Miss - No damage, continue moving half speed in straight line\nRequirements: Move 1+ areas, +1CS per area (max +3CS)\nAgility FEAT needed to change direction after miss',
      green: 'Hit - Damage = Endurance/Body Armor (higher) + 2pts per area moved\nRequirements: Move 1+ areas, +1CS per area (max +3CS)\nBody Armor may reflect damage to attacker',
      yellow: 'Slam - Damage as Hit result, plus may Slam opponent\nDamage = Endurance/Body Armor (higher) + 2pts per area\nBody Armor may reflect damage to attacker',
      red: 'Stun - Damage as Hit result, plus may Stun opponent\nDamage = Endurance/Body Armor (higher) + 2pts per area\nBody Armor may reflect damage to attacker'
    },
    'dodging': {
      white: 'None - No reduction to incoming attacks. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
      green: '-2 CS - Reduce attacker CS by 2. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
      yellow: '-4 CS - Reduce attacker CS by 4. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
      red: '-6 CS - Reduce attacker CS by 6. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action'
    },
    'evading': {
      white: 'Auto-hit - Opponent automatically scores green result',
      green: 'Evasion - Dodge successful, no damage taken',
      yellow: 'Evasion +1CS - Dodge and gain +1CS next attack',
      red: 'Evasion +2CS - Dodge and gain +2CS next attack'
    },
    'blocking': {
      white: '-6 CS - Strength shifted down 6 columns as Body Armor',
      green: '-4 CS - Strength shifted down 4 columns as Body Armor',
      yellow: '-2 CS - Strength shifted down 2 columns as Body Armor',
      red: '+1 CS - Strength shifted up 1 column as Body Armor'
    },
    'catching': {
      white: 'Autohit - Object hits you instead (auto green)',
      green: 'Miss - Failed to catch, attack gets +1CS',
      yellow: 'Damage - Caught but may damage object/person',
      red: 'Catch - Successfully caught with no damage'
    },
    'stun': {
      white: '1-10 rounds - Knocked out for 1-10 rounds',
      green: '1 round - Knocked down, no action next round',
      yellow: 'No effect - Character not stunned',
      red: 'No effect - Character not stunned'
    },
    'slam': {
      white: 'Grand Slam - Knocked away at attacker Strength speed',
      green: '1 area - Knocked back one area',
      yellow: 'Stagger - Knocked back a step, no longer adjacent',
      red: 'No Slam - Not affected by slam'
    },
    'kill': {
      white: 'Endurance Loss - Dying, lose 1 rank/turn',
      green: 'E/S - Endurance Loss only if Edged/Shooting attack',
      yellow: 'No effect - Character survives, takes damage only',
      red: 'No effect - Character survives, takes damage only'
    }
  };
  
  return hoverTexts[actionType]?.[color] || `${color} result for ${actionType}`;
}

/**
 * Get targeting data for action dialogs
 * Returns an object with targets array and related info for use in action code
 * @returns {Object} { targets, primaryTarget, primaryTargetActor, targetDisplay }
 */
export function getTargetData() {
  const targets = Array.from(game.user?.targets ?? []);
  const primaryTarget = targets[0] ?? null;
  const primaryTargetActor = primaryTarget?.actor ?? null;
  
  let targetDisplay = "(No target)";
  if (targets.length === 1) {
    targetDisplay = primaryTarget.name;
  } else if (targets.length > 1) {
    targetDisplay = targets.map(t => t.name).join(", ");
  }
  
  return { targets, primaryTarget, primaryTargetActor, targetDisplay };
}

/**
 * Build HTML string for targeting context display in dialogs
 * @param {Actor} actor - The acting character
 * @param {string} actionLabel - The action being performed (e.g., "Blunt Attack")
 * @returns {string} HTML string describing the targeting context
 */
export function buildTargetingHTML(actor, actionLabel) {
  const targets = Array.from(game.user?.targets ?? []);

  if (targets.length === 0) {
    return `<div style="font-style:italic;color:#666;">Target: <span style="color:#d32f2f;">(no target selected)</span></div>`;
  }

  if (targets.length === 1) {
    const targetName = targets[0]?.name || "Unknown";
    // Single target: no count
    return `<div>Target: <strong>${targetName}</strong></div>`;
  }

  // Multiple targets: show explicit count, e.g., "(3 targets)"
  const targetNames = targets.map(t => t?.name || "Unknown").join(", ");
  return `<div>Targets: <strong>${targetNames}</strong> <span style="color:#666;">(${targets.length} targets)</span></div>`;
}

// Backward compatibility alias - deprecated, use buildTargetingHTML instead
export const getTargetingContext = buildTargetingHTML;

/**
 * Apply damage to targeted or controlled tokens with Body Armor calculation
 * @param {Object} options
 *   - damage: Base damage amount
 *   - bypassArmor: Skip armor calculation
 *   - attackerUuid: UUID of the attacker (optional)
 *   - damageType: Type of damage for resistance checks (e.g., "physical-edged", "energy")
 *   - attackForm: Form of attack (e.g., "edged", "shooting", "energy")
 *   - targets: Array of target tokens (optional, defaults to game.user.targets)
 *   - showNotification: Whether to show UI notifications (default: true)
 *   - wasKillResult: Whether the attack result was a Kill (red on Sh/EA/TE/En)
 *   - forceKilling: Force lethal damage (triggers death save even with Four-Color)
 *   - armorPiercing: Armor piercing value
 *   - apMode: Armor piercing mode ("value" or "cs")
 * @returns {Array} - Array of results for each target
 */
// ─── Force Field Breach Handler ──────────────────────────────────────────────
// Called when mitigation detects FF overload. Disables the FF AE and posts
// appropriate consequences: personal FF shuts off (excess dmg already in netDamage),
// projected FF: wielder rolls Psyche FEAT vs attack intensity or unconscious.
async function handleFFBreach(targetActor, breach) {
  const { isPersonal, aeId, excessDamage, attackIntensity, fullValue } = breach;
  const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

  // Disable the FF defense AE
  if (aeId) {
    const ffAe = targetActor.effects.get(aeId);
    if (ffAe) {
      const { canWriteEffectsOn } = await import("../effects/effect-engine.js");
      if (canWriteEffectsOn(targetActor)) {
        await ffAe.update({ disabled: true });
      } else {
        try {
          const { executeAsGM } = await import("../../gm-utils.js");
          await executeAsGM("updateActiveEffect", {
            targetActorUuid: targetActor.uuid,
            effectId: aeId,
            updateData: { disabled: true }
          });
        } catch (err) {
          console.error("[FASERIP] handleFFBreach: GM disable failed", err);
        }
      }
      console.log(`[FASERIP] FF breached on ${targetActor.name} — disabled AE ${aeId}`);
    }
  }

  if (isPersonal) {
    // Personal FF: shuts off, excess damage hits user (already in netDamage from mitigation).
    // Effects (slam/stun/kill) from the excess are handled by the normal damage pipeline.
    await ChatMessage.create({
      content: `<div style="background:#fff3e0;border:2px solid #ff9800;padding:8px;border-radius:4px;">
        <strong style="color:#e65100;">⚡ Force Field Overload!</strong>
        <div style="margin-top:4px;"><strong>${targetActor.name}</strong>'s personal force field has shut down!</div>
        <div style="font-size:0.9em;color:#666;margin-top:4px;">
          Field capacity: ${fullValue} — Breached by attack.
          ${excessDamage > 0 ? `${excessDamage} excess damage applied. Battle effects may apply.` : ""}
        </div>
      </div>`
    });
  } else {
    // Projected FF: comes down, those inside unharmed by THIS attack.
    // Wielder must make Psyche FEAT vs attack intensity or unconscious 1-10 rounds.
    const psyche = targetActor.system?.abilities?.psyche?.rank || "Typical";
    const psycheVal = CONFIG.FASERIP?.rankValues?.[psyche] || 6;
    const intensity = attackIntensity || 0;

    await ChatMessage.create({
      content: `<div style="background:#e8eaf6;border:2px solid #5c6bc0;padding:8px;border-radius:4px;">
        <strong style="color:#283593;">⚡ Projected Force Field Breached!</strong>
        <div style="margin-top:4px;"><strong>${targetActor.name}</strong>'s projected force field has collapsed!</div>
        <div style="font-size:0.9em;color:#666;margin-top:4px;">
          Field capacity: ${fullValue} — Those inside are unharmed by this attack.
        </div>
        <div style="margin-top:6px;">
          <strong>${targetActor.name}</strong> must make a <strong>Psyche FEAT</strong> (${psyche}) vs Intensity ${intensity} or become unconscious for 1-10 rounds.
        </div>
        <div style="margin-top:6px;">
          <button class="ff-breach-psyche-feat" 
                  data-actor-id="${targetActor.id}" 
                  data-intensity="${intensity}"
                  data-psyche-rank="${psyche}"
                  style="background:#5c6bc0;color:white;border:none;padding:4px 12px;border-radius:3px;cursor:pointer;">
            Roll Psyche FEAT
          </button>
        </div>
      </div>`
    });
  }
}

// --- BEGIN PATCH: applyDamageToTargets ---
export async function applyDamageToTargets({
  damage,
  bypassArmor = false,
  attackerUuid = null,
  damageType = "physical-blunt",
  attackForm = "blunt",
  targets = null,
  showNotification = true,
  wasKillResult = false,
  forceKilling = false,
  armorPiercing = 0,
  armorPiercingCS = 0,
  apMode = "value",
  attackIntensity = 0
} = {}) {
  const results = [];
  
  try {
    const userTargets = targets ?? Array.from(game.user?.targets ?? []);
    const targetTokens = userTargets.length ? userTargets : [];
    console.log("FASERIP | applyDamageToTargets:", {
      targetCount: targetTokens.length,
      damage,
      wasKillResult,
      attackForm
    });

    for (const tok of targetTokens) {
      const token = tok.document ?? tok;
      const targetActor = token.actor ?? token?.getActor?.() ?? null;
      const targetName = token.name ?? targetActor?.name ?? "Target";

      if (!targetActor) {
        console.warn("FASERIP | No actor found for target:", targetName);
        continue;
      }

      // --- Vehicle routing: skip entire character damage path ---
      if (targetActor.type === "vehicle") {
        console.log("FASERIP | Vehicle target detected, routing to vehicle damage:", targetName);
        const vResult = await applyDamageToVehicle({
          targetActor,
          token,
          damage: Number(damage) || 0,
          damageType,
          attackForm,
          bypassArmor,
          showNotification
        });
        results.push(vResult);
        continue;
      }

      const debug = {
        targetName,
        isToken: !!token,
        isUnlinkedToken: !!token?.isLinked === false,
        isGM: game.user.isGM,
        isOwner: !!targetActor?.isOwner,
        damageType,
        attackForm,
        bypassArmor,
        wasKillResult
      };
      console.log("FASERIP | Apply Damage Debug:", debug);

      let netDamage = Number(damage) || 0;

      // Calculate mitigation (armor, resistances, etc.)
      let ffBreachData = null;
      try {
        if (typeof calculateMitigation === "function" && targetActor) {
          const mit = calculateMitigation(netDamage, targetActor, {
            damageType,
            attackForm,
            bypassArmor,
            armorPiercing,
            armorPiercingCS,
            apMode,
            attackIntensity
          });
          if (mit && Number.isFinite(mit.netDamage)) {
            netDamage = Math.max(0, mit.netDamage);
          }
          if (mit?.ffBreach) {
            ffBreachData = mit.ffBreach;
          }
        }
      } catch (e) {
        console.warn("FASERIP | Mitigation calc failed; using raw damage.", e);
      }

      // ── Force Field breach consequences ──
      if (ffBreachData) {
        await handleFFBreach(targetActor, ffBreachData);
      }

      // Get health values
      const hpPath = "system.attributes.health.value";
      const before = Number(targetActor?.system?.attributes?.health?.value ?? 0);
      const after = Math.max(0, before - netDamage);

      // ===== HANDLE DAMAGE TO ALREADY 0 HP TARGET =====
      if (before === 0 && netDamage > 0) {
        const fourColor = game.settings.get("msh-faserip", "fourColorRule");
        const { isLethalAttackForm } = await import("../../rules/kill-resolver.js");
        const isLethal = wasKillResult || forceKilling || isLethalAttackForm(attackForm);

        // Detect whether the target is already dying (post-FEAT) or just
        // unconscious from a Stun-row Kill FEAT. The Kill column FEAT runs
        // once when Health first hits 0 (rules p.31). It does NOT fire again
        // per-hit. Subsequent hits on an already-down target produce one of:
        //   - Four-Color non-lethal: chat notice, no rules effect
        //   - Lethal hit, target dying: no new FEAT — dying countdown handles
        //     endurance loss at 1 rank/round automatically
        //   - Lethal hit, target unconscious from Stun-KO: no new FEAT
        //     — per rules the Kill FEAT was the one chance for dying entry
        const SCOPE_KEY = "msh-faserip";
        const isDying = !!targetActor?.effects?.find(e =>
          e.flags?.[SCOPE_KEY]?.ongoingId?.startsWith("dying.") ||
          /^Dying\b/i.test(e.name || "")
        );

        if (fourColor && !isLethal) {
          // Four-Color Rule: blunt hit on unconscious target — no death save
          console.log(`[FASERIP] Four-Color: hit on unconscious ${targetActor.name} (non-lethal) — no death save`);
          await ChatMessage.create({
            content: `<div style="background:#fff3e0;border:1px solid #ff9800;padding:8px;border-radius:3px;">
              <strong>${targetActor.name}</strong> was hit while unconscious (non-lethal).
              <div style="font-size:0.9em;color:#666;margin-top:4px;">Four-Color Rule: No death save from blunt/non-killing attack.</div>
            </div>`
          });
        } else if (isDying) {
          // Lethal hit on a dying target. Per rules, dying is a per-round
          // process (1 Endurance rank/turn). Hits do not retrigger the
          // Kill-column FEAT or compound the loss.
          console.log(`[FASERIP] Hit on dying ${targetActor.name} — no new death save (countdown continues per round)`);
          await ChatMessage.create({
            content: `<div style="background:#fce4ec;border:1px solid #c2185b;padding:8px;border-radius:3px;">
              <strong>${targetActor.name}</strong> was hit while dying.
              <div style="font-size:0.9em;color:#666;margin-top:4px;">Already in dying countdown — endurance loss continues at 1 rank per round.</div>
            </div>`
          });
        } else {
          // Lethal hit on a target unconscious from Stun-row Kill FEAT
          // (Health 0, but the FEAT produced "no effect"/Stun, not dying).
          // The rules give one Kill FEAT per Health-zero event; they do not
          // call for a new FEAT on subsequent hits. Record the hit and move
          // on. (GM may rule otherwise narratively; surface for prompt.)
          console.log(`[FASERIP] Hit on unconscious ${targetActor.name} (lethal) — no new death save per rules`);
          await ChatMessage.create({
            content: `<div style="background:#ffebee;border:1px solid #ef5350;padding:8px;border-radius:3px;">
              <strong>${targetActor.name}</strong> was hit while unconscious (lethal attack).
              <div style="font-size:0.9em;color:#666;margin-top:4px;">Rules: Kill-column FEAT fires once at Health 0; no new save. GM discretion for coup-de-grâce.</div>
            </div>`
          });
        }

        results.push({
          actorUuid: targetActor?.uuid,
          tokenUuid: token?.uuid,
          name: targetName,
          hpBefore: before,
          hpAfter: after,
          absorbed: 0,
          net: 0,
          wasKillResult
        });
        continue; // Skip to next target
      }
      // ===== END DAMAGE TO 0 HP HANDLING =====

      const canDirectUpdate = game.user.isGM || targetActor?.isOwner;

      // In action-utils.js, replace lines 1127-1131:
      if (canDirectUpdate) {
        game.msh._combatDamageInProgress = true;
        try {
          await targetActor?.update(
            { [hpPath]: after },
            { healthChange: { old: before, new: after } }
          );
        } finally {
          delete game.msh._combatDamageInProgress;
        }

        // Record damage timestamp for rest system
        if (before > after && typeof recordDamage === "function") {
          await recordDamage(targetActor);
        }
      } else if (targetActor) {
        // Non-owner player: delegate to GM
        try {
          if (game.msh?.runAsGM) {
            await game.msh.runAsGM({
              operation: "update",
              targetActorUuid: targetActor.uuid,
              args: [{ [hpPath]: after }]
            });
          } else if (game.msh?.socket?.executeAsGM) {
            await game.msh.socket.executeAsGM("runGMCommand", {
              operation: "update",
              targetActorUuid: targetActor.uuid,
              args: [{ [hpPath]: after }]
            });
          } else {
            console.warn("FASERIP | No GM helper available for applyDamageToTargets");
          }
        } catch (err) {
          console.error("FASERIP | applyDamageToTargets GM update failed", err);
          ui.notifications?.warn?.("Could not apply damage via GM helper. See console.");
        }

        // Note: recordDamage skipped for non-owner — GM's updateActor hook handles damage timestamps
      }

      // ===== HANDLE REDUCTION TO 0 HP =====
      if (after === 0 && before > 0 && netDamage > 0) {
        console.log("💀 FASERIP | Target reduced to 0 HP:", targetName, { wasKillResult, forceKilling, attackForm });
        
        const fourColor = game.settings.get("msh-faserip", "fourColorRule");
        const { isLethalAttackForm } = await import("../../rules/kill-resolver.js");
        const isLethal = wasKillResult || forceKilling || isLethalAttackForm(attackForm);
        
        // Determine if we need a death save
        // Per rules: Kill result triggers Endurance FEAT vs Kill column
        // Also triggers if reduced to 0 HP by any means
        if (!fourColor || isLethal) {
          const mode = resolveCombatModeSafe(targetActor) || "manual";
          
          if (mode === "full") {
            // Full Auto: Roll death save automatically
            console.log("FASERIP | Full auto - triggering death save");
            const { ActionDispatcher } = await import("./action-dispatcher.js");
            await ActionDispatcher.roll("death-save", { 
              actor: targetActor,
              opts: { 
                autoApply: true, 
                showConfirm: false,
                wasKillResult: wasKillResult,
                attackForm: attackForm,  // E/S context for green result
                fromZeroHealth: true     // Unconscious from reaching 0 HP
              }
            });
          } else {
            // Manual/Semi: Show death save prompt
            await postDeathSavePrompt(targetActor, { wasKillResult, attackForm, fromZeroHealth: true });
          }
        } else {
          // Four-Color rule: Non-lethal knockout via consolidated helper (handles roll, AE, chat, and dedup)
          await postFourColorKnockout(targetActor, { source: "hp-zero:applyDamageToTargets" });
        }
      }
      // ===== HANDLE KILL RESULT THAT DIDN'T REDUCE TO 0 =====
      // Per rules: "For any one of these three results to be effective on a target, 
      // the attacker must inflict some damage on the target."
      else if (wasKillResult && netDamage > 0 && after > 0) {
        console.log("💀 FASERIP | Kill result with damage but target survived:", targetName);
        
        const mode = resolveCombatModeSafe(targetActor) || "manual";
        
        if (mode === "full") {
          // Full Auto: Roll kill save automatically
          console.log("FASERIP | Full auto - triggering kill save (damage penetrated)");
          const { ActionDispatcher } = await import("./action-dispatcher.js");
          await ActionDispatcher.roll("death-save", { 
            actor: targetActor,
            opts: { 
              autoApply: true, 
              showConfirm: false,
              attackForm: attackForm,   // E/S context for green result
              fromZeroHealth: false     // NOT unconscious - Kill result while still has HP
            }
          });
        } else {
          // Manual/Semi: Show kill save prompt
          await postKillSavePrompt(targetActor, { attackForm, fromZeroHealth: false });
        }
      }
      // ===== END 0 HP / KILL HANDLING =====

      if (showNotification && netDamage > 0) {
        if (game.user.isGM) {
          const absorbed = (Number(damage) || 0) - netDamage;
          const armorNote = absorbed > 0 ? ` (${damage} - ${absorbed} armor)` : "";
          ui.notifications.info(`${targetName} took ${netDamage} damage${armorNote}. Health: ${before} → ${after}`);
        } else {
          ui.notifications.info(`${targetName} took ${netDamage} damage.`);
        }
      } else if (showNotification && netDamage === 0) {
        ui.notifications.info(`${targetName}'s armor absorbed all damage.`);
      }

      results.push({
        actorUuid: targetActor?.uuid,
        tokenUuid: token?.uuid,
        name: targetName,
        hpBefore: before,
        hpAfter: after,
        absorbed: (Number(damage) || 0) - netDamage,
        net: netDamage,
        wasKillResult
      });
    }
  } catch (outer) {
    console.error("FASERIP | applyDamageToTargets outer error", outer);
  }
  
  return results;
}


/**
 * Post a chat card prompting for a kill save when a Kill result occurs
 * (target not at 0 HP but took damage from a kill-capable attack)
 */
export async function postKillSavePrompt(actor, { attackForm = "edged", fromZeroHealth = false } = {}) {
  const isFull = resolveCombatModeSafe(actor) === "full";
  
  // In full auto mode, don't post the prompt - kill save runs automatically
  if (isFull) {
    console.log("FASERIP | Skipping kill save prompt in full auto mode");
    return;
  }

  const esNote = (attackForm === "edged" || attackForm === "shooting" || attackForm === "throwing-edged") 
    ? `<div style="font-size:0.9em;color:#666;margin-top:4px;">
        Note: Green (E/S) result means Endurance Loss for ${attackForm} attacks.
      </div>`
    : "";

  const content = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
        <strong>${actor.name} - Kill Result!</strong>
      </div>
      
      <div style="padding:5px 10px;font-size:.9em;">
        <div style="color:#c62828;font-weight:bold;">Potential Kill</div>
        <div style="margin-top:4px;">Target must roll an Endurance FEAT vs the Kill column.</div>
        <div style="margin-top:4px;color:#1565c0;">Character remains conscious while bleeding out if they fail.</div>
        ${esNote}
      </div>

      <div style="text-align:center;padding:8px;margin:8px 10px;">
        <a class="faserip-chip" 
           data-action="kill-save"
           data-actor-uuid="${actor.uuid}"
           data-attack-form="${attackForm}"
           data-from-zero-health="${fromZeroHealth}"
           style="display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;padding:6px 14px;background:#ffebee;border:2px solid #c62828;border-radius:4px;color:#c62828;cursor:pointer;text-decoration:none;">
          Roll Kill Save
        </a>
      </div>
      
      <div style="padding:5px 10px;font-size:0.85em;color:#666;border-top:1px solid #e0e0e0;">
        <strong>Kill Results:</strong>
        <ul style="margin:4px 0 0 16px;padding:0;">
          <li><b>White:</b> Endurance Loss - Character is dying</li>
          <li><b>Green (E/S):</b> Endurance Loss if Edged/Shooting attack</li>
          <li><b>Yellow/Red:</b> No effect - takes damage only</li>
        </ul>
      </div>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: content
  });
}


/**
 * Apply unconscious active effect for Four-Color Rule knockout.
 * Duration matches the normal stun mechanic (1d10 rounds).
 */
export async function _applyFourColorKnockout(actor, rounds) {
  try {
    const existing = actor.effects.filter(e => e.statuses?.has?.("unconscious"));
    if (existing.length) {
      await safeActorDeleteEffects(actor, existing.map(e => e.id), { mshReplacing: true });
    }
  } catch (_e) {}
  const inCombat = !!game.combat;
  const effectData = {
    name: `Unconscious (${rounds} rounds)`,
    icon: "icons/svg/unconscious.svg",
    flags: { "msh-faserip": { isUnconscious: true, zeroHealth: true, fromDeathSave: true, durationRounds: Number(rounds) } },
    changes: [
      { key: "system.status.unconscious", mode: "override", value: true },
      { key: "system.combatMods.canAct", mode: "override", value: "false" }
    ],
    statuses: ["unconscious"],
    duration: inCombat
      ? { value: Math.max(1, Number(rounds)), units: "rounds", expiry: "roundEnd" }
      : { value: Math.max(1, Number(rounds)) * 6, units: "seconds" }
  };
  await safeActorCreateEffect(actor, [effectData]);
  console.log(`[FASERIP] Four-Color knockout: ${actor.name} unconscious for ${rounds} rounds`);
}

/**
 * Centralized Four-Color knockout: rolls duration (or accepts a precomputed one),
 * applies the unconscious AE, and posts the chat card. Idempotent: if an
 * unconscious AE was just applied (~1.5s window), the call no-ops silently —
 * this is what kills the duplicate "is unconscious" cards when both
 * applyDamageToTargets and applyDamageNow fire for the same attack.
 */
export async function postFourColorKnockout(actor, { rounds = null, source = "hp-zero" } = {}) {
  if (!actor) return { rounds: 0, applied: false };

  // GM-only: HP-zero KO handling is owned by the updateActor hook in init.js on the
  // GM client. Player clients also walk the applyDamageToTargets HP-zero branch
  // locally and would emit their own card + duration roll — defer here to keep the
  // GM as the single source of truth. (The createdTime dedup below handles the
  // separate same-client case where the GM is the attacker.)
  if (!game.user.isGM) {
    console.log(`[FASERIP] postFourColorKnockout: non-GM client, deferring to GM hook (source=${source})`);
    return { rounds: 0, applied: false, deferredToGm: true };
  }

  const existing = actor.effects?.find?.(e => e.statuses?.has?.("unconscious"));
  if (existing) {
    const createdTime = Number(existing._stats?.createdTime ?? existing.createdTime ?? 0);
    if (createdTime && (Date.now() - createdTime) < 1500) {
      console.log(`[FASERIP] postFourColorKnockout: deduped (existing AE ${Date.now() - createdTime}ms old, source=${source})`);
      return { rounds: Number(existing.flags?.["msh-faserip"]?.durationRounds) || 0, applied: false, deduplicated: true };
    }
  }

  if (!Number.isFinite(rounds) || rounds <= 0) {
    const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
    const r = await new Roll(`1${stunDie}`).evaluate();
    rounds = r.total;
  }

  if (existing) {
    const priorRounds = Number(existing.flags?.["msh-faserip"]?.durationRounds) || 0;
    if (priorRounds >= rounds) {
      console.log(`[FASERIP] postFourColorKnockout: keeping existing (${priorRounds} ≥ new ${rounds})`);
      return { rounds: priorRounds, applied: false };
    }
  }

  await _applyFourColorKnockout(actor, rounds);

  try {
    const fresh = actor.effects?.find?.(e => e.statuses?.has?.("unconscious"));
    if (fresh) await fresh.setFlag("msh-faserip", "knockoutSource", source);
  } catch (_e) {}

  // Single card. Players see "?"; the renderChatMessageHTML hook in chat-hooks.js
  // substitutes the actual count on GM clients only.
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
      <strong>${actor.name}</strong> is unconscious (0 Health) for <strong class="msh-fc-rounds">?</strong> rounds.
      <div style="font-size:0.9em;color:#666;margin-top:4px;" class="msh-fc-meta">Four-Color Rule: No death save (non-lethal).</div>
    </div>`,
    flags: { "msh-faserip": { fourColorKnockout: { rounds: Number(rounds) } } }
  });

  return { rounds, applied: true };
}

/**
 * Enhanced postDeathSavePrompt that includes kill context
 */
export async function postDeathSavePrompt(actor, { wasKillResult = false, attackForm = "", fromZeroHealth = true } = {}) {
  const isFull = resolveCombatModeSafe(actor) === "full";
  
  // In full auto mode, don't post the prompt - death save runs automatically
  if (isFull) {
    console.log("FASERIP | Skipping death save prompt in full auto mode");
    return;
  }

  const isRobot = actor.system?.origin === "Robot";
  const headerLabel = isRobot ? `${actor.name} — Structural Failure` : `${actor.name} - Health Collapsed`;
  const bodyText    = isRobot
    ? "Robot/construct reached 0 Health. Roll Endurance FEAT vs the Kill column to determine deactivation severity."
    : "Character is unconscious and must roll an Endurance FEAT vs the Kill column to determine if they are dying.";
  const buttonLabel = isRobot ? "Roll Deactivation Save" : "Roll Death Save";
  const killNote = wasKillResult 
    ? `<div style="color:#c62828;margin-top:4px;">⚠️ This was a KILL result attack!</div>` 
    : "";

  const content = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
        <strong>${headerLabel}</strong>
      </div>
      
      <div style="padding:5px 10px;font-size:.9em;">
        <div style="color:#c62828;font-weight:bold;">Health: 0</div>
        <div style="margin-top:4px;">${bodyText}</div>
        ${killNote}
      </div>

      <div style="text-align:center;padding:8px;margin:8px 10px;">
        <a class="faserip-chip" 
           data-action="death-save"
           data-actor-uuid="${actor.uuid}"
           data-attack-form="${attackForm}"
           data-from-zero-health="${fromZeroHealth}"
           style="display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;padding:6px 14px;background:#ffebee;border:2px solid #c62828;border-radius:4px;color:#c62828;cursor:pointer;text-decoration:none;">
          ${buttonLabel}
        </a>
      </div>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: content
  });
}
// --- END PATCH: applyDamageToTargets ---

export async function applyDamageToActorUuid(damage, actorUuid, options = {}) {
  const { showNotification = true, updateButton = null } = options;
  try {
    const resolved = await fromUuid(actorUuid);
    if (!resolved) {
      ui.notifications.warn("Could not find actor for self damage.");
      return { success: false, error: "Actor not found" };
    }

    const actor = resolved.documentName === "Actor"
      ? resolved
      : (resolved.documentName === "Token" ? resolved.actor : null);

    if (!actor) {
      ui.notifications.warn("Could not resolve actor for self damage.");
      return { success: false, error: "Bad UUID" };
    }

    const amt = Math.max(0, Number(damage || 0));
    if (amt === 0) {
      if (showNotification) ui.notifications.warn("No damage to apply.");
      return { success: false, error: "Zero damage" };
    }

    const current = actor.system?.attributes?.health?.value ?? 0;
    const newVal  = Math.max(0, current - amt);

    const update = { "system.attributes.health.value": newVal };

    if (game.user.isGM || actor.isOwner) {
      await actor.update(update);
    } else if (game.msh?.runAsGM) {
      await game.msh.runAsGM({
        operation: "update",
        targetActorUuid: actor.uuid,
        args: [update]
      });
    } else {
      if (showNotification) ui.notifications.warn("No permission to update health.");
      return { success: false, error: "No permission" };
    }

    if (showNotification) {
      if (game.user.isGM) {
        ui.notifications.info(`${actor.name} took ${amt} collision damage. Health: ${current} to ${newVal}`);
      } else {
        ui.notifications.info(`${actor.name} took ${amt} collision damage.`);
      }
    }

    if (updateButton) {
      updateButton.style.opacity = "0.5";
      updateButton.style.pointerEvents = "none";
      updateButton.textContent = "Damage Applied";
    }

    return { success: true, actor: actor.name, amount: amt, newHealth: newVal };
  } catch (err) {
    console.error("applyDamageToActorUuid failed:", err);
    if (showNotification) ui.notifications.error("Failed to apply collision damage.");
    return { success: false, error: err?.message || String(err) };
  }
}

// Add to action-utils.js

/**
 * Get Body Armor values for a target actor
 * Supports both new explicit flags and legacy name-matching
 * @param {Actor} targetActor - The actor being hit
 * @param {string} damageType - Type of damage (e.g., "energy-fire", "physical-blunt")
 * @returns {Object} { physical, energy, applicable }
 */
export function getBodyArmorValues(targetActor, damageType = "physical-blunt") {
  const dmgTypeLower = String(damageType || "physical-blunt").toLowerCase();
  
  console.log("FASERIP DEBUG | getBodyArmorValues called:", {
    targetName: targetActor.name,
    damageType: damageType
  });

  let physicalArmor = 0;
  let energyArmor = 0;
  let physicalRank = "";
  let energyRank = "";
  let isForceField = false;

  // Check equipment armor
  const armorItems = targetActor.items.filter(i => 
    i.type === "equipment" && 
    i.system.category === "armor" && 
    i.system.protection
  );
  
  if (armorItems.length > 0) {
    const bestArmor = armorItems.reduce((best, current) => {
      const bestVal = typeof best.system.protection === 'number' 
        ? best.system.protection 
        : (CONFIG.FASERIP?.rankValues?.[best.system.protection] || 0);
      const currVal = typeof current.system.protection === 'number'
        ? current.system.protection
        : (CONFIG.FASERIP?.rankValues?.[current.system.protection] || 0);
      return currVal > bestVal ? current : best;
    });
    
    // Store rank label if available
    if (typeof bestArmor.system.protection === 'string') {
      physicalRank = bestArmor.system.protection;
      energyRank = bestArmor.system.protection;
    }
    
    const armorValue = typeof bestArmor.system.protection === 'number'
      ? bestArmor.system.protection
      : (CONFIG.FASERIP?.rankValues?.[bestArmor.system.protection] || 0);

    // Check for force field flag up front so override defaults match.
    isForceField = bestArmor.system.isForceField === true;

    // Honor explicit overrides first, falling back to standard formulas.
    // Mirrors the power-armor branch so equipment armor items that carry
    // custom armorPhysical / armorEnergy values are respected.
    const sys = bestArmor.system || {};
    const hasPhysOverride = sys.armorPhysical !== undefined && sys.armorPhysical !== 0;
    const hasEnergyOverride = sys.armorEnergy !== undefined && sys.armorEnergy !== 0;

    if (isForceField) {
      // Force Fields: full vs Energy, -10 vs physical
      physicalArmor = hasPhysOverride ? sys.armorPhysical : Math.max(0, armorValue - 10);
      energyArmor = hasEnergyOverride ? sys.armorEnergy : armorValue;
    } else {
      // Body armor equipment: full vs Physical, -20 vs Energy
      physicalArmor = hasPhysOverride ? sys.armorPhysical : armorValue;
      energyArmor = hasEnergyOverride ? sys.armorEnergy : Math.max(0, armorValue - 20);
    }
  }

  // Check Body Armor and Force Field powers
  const bodyArmorPowers = targetActor.items.filter(i => {
    if (i.type !== "power") return false;
    if (i.system?.isActive === false) return false;
    if (i.system.isBodyArmor === true) return true;
    if (i.system.isForceField === true) return true;
    
    const name = i.name.toLowerCase();
    return name.includes("body armor") || 
           name.includes("body armour") || 
           name.includes("force field") ||
           i.system.type?.toLowerCase().includes("body armor") ||
           i.system.type?.toLowerCase().includes("force field");
  });

  bodyArmorPowers.forEach(power => {
    const type = power.system.bodyArmorType || "both";
    
    // Check if this power is a force field
    if (power.system.isForceField === true) {
      isForceField = true;
    }
    
    let physVal;
    let energyVal;
    
    const baseVal = typeof power.system.value === 'number'
      ? power.system.value
      : (CONFIG.FASERIP?.rankValues?.[power.system.rank] || 0);
    
    // Read stored values, fall back to formula defaults
    physVal = (power.system.armorPhysical !== undefined && power.system.armorPhysical !== 0)
      ? power.system.armorPhysical : baseVal;
    energyVal = (power.system.armorEnergy !== undefined && power.system.armorEnergy !== 0)
      ? power.system.armorEnergy : (power.system.isForceField ? baseVal : Math.max(0, baseVal - 20));
    
    // Force Fields: full vs Energy, -10 vs physical
    if (power.system.isForceField) {
      if (!power.system.armorPhysical) physVal = Math.max(0, baseVal - 10);
      if (!power.system.armorEnergy) energyVal = baseVal;
    }
    
    // Store ranks
    if (power.system.rank && !physicalRank) {
      physicalRank = power.system.rank;
    }
    if (power.system.rank && !energyRank) {
      const rankIdx = RANKS.indexOf(power.system.rank);
      if (rankIdx >= 0) {
        const energyRankIdx = Math.max(0, rankIdx - 2);
        energyRank = RANKS[energyRankIdx];
      }
    }
    
    if (type === "physical" || type === "both") {
      physicalArmor = Math.max(physicalArmor, physVal);
    }
    if (type === "energy" || type === "both") {
      energyArmor = Math.max(energyArmor, energyVal);
    }
  });

  const isEnergy = CONFIG.FASERIP?.isEnergyDamage?.(dmgTypeLower) ?? 
                   (dmgTypeLower && dmgTypeLower.includes("energy"));

  // Check for active Blocking effect (Strength as Body Armor)
  // Block applies vs: Slugfest, Grappling, Wrestling, Edged/Blunt Throwing, Force
  // Block does NOT apply vs: Shooting (physical-ranged), Energy, Charging
  let blockingArmor = 0;
  let blockingRank = "";
  const isCharging = dmgTypeLower === "charging" || dmgTypeLower === "physical-charging" || dmgTypeLower.includes("charging");
  const blockEligible = !isEnergy && dmgTypeLower !== "physical-ranged" && !isCharging;
  
  if (blockEligible) {
    const blockEffect = targetActor.effects?.find(e => {
      if (e.disabled) return false;
      const flags = e.flags?.["msh-faserip"] || {};
      return flags.isBlocking === true;
    });
    
    if (blockEffect) {
      const blockFlags = blockEffect.flags?.["msh-faserip"] || {};
      blockingArmor = Number(blockFlags.armorValue) || 0;
      blockingRank = blockFlags.armorRank || "";
      
      // Per rules: "Normal Body Armor, but not Force Fields, still apply to defense"
      // Use the higher of blocking armor or regular body armor (armor doesn't stack)
      // If target has a force field, it does NOT apply during blocking
      if (blockingArmor > 0) {
        if (isForceField) {
          // Force field excluded during block; use blocking armor instead
          physicalArmor = Math.max(blockingArmor, physicalArmor);
          // Note: ideally we'd exclude force field value here, but getBodyArmorValues
          // doesn't track force field vs regular armor separately. Use max as safe fallback.
        } else {
          // Regular armor stacks: use whichever is higher
          physicalArmor = Math.max(physicalArmor, blockingArmor);
        }
        
        if (blockingArmor >= physicalArmor && blockingRank) {
          physicalRank = blockingRank;
        }
        
        console.log("[FASERIP] Blocking armor applied:", {
          targetName: targetActor.name,
          blockingArmor,
          blockingRank,
          resultPhysicalArmor: physicalArmor,
          damageType
        });
      }
    }
  }

  const applicable = isEnergy ? energyArmor : physicalArmor;

  console.log("FASERIP DEBUG | getBodyArmorValues result:", {
    targetName: targetActor.name,
    damageType,
    physicalArmor,
    energyArmor,
    physicalRank,
    energyRank,
    isForceField,
    isEnergy,
    blockingArmor: blockEligible ? blockingArmor : "N/A (ineligible)",
    applicable
  });

  // If ranks are missing, reverse-lookup from numeric values
/* if (!physicalRank && physicalArmor > 0) {
  physicalRank = game.msh.getClosestRank(physicalArmor) || "";
}
if (!energyRank && energyArmor > 0) {
  energyRank = game.msh.getClosestRank(energyArmor) || "";
}
 */

return {
  physical: physicalArmor,
  energy: energyArmor,
  physicalRank: physicalRank,
  energyRank: energyRank,
  applicable: applicable,
  isEnergyDamage: isEnergy,
  isForceField: isForceField,
  isBlocking: blockEligible && blockingArmor > 0,
  blockingArmor: blockEligible ? blockingArmor : 0,
  blockingRank: blockEligible ? blockingRank : ""
};

}

/**
 * Apply damage immediately using the classic mitigation pipeline.
 * Wraps CombatHandler.processAttack so both classic and refactor paths share one soak/HP codepath.
 *
 * @param {Object} opts
 * @param {Actor}  opts.sourceActor
 * @param {TokenDocument[]|Token[]} opts.targets
 * @param {number} opts.baseDamage            Raw damage before soak
 * @param {string} opts.damageType            e.g., "energy-generic", "physical-blunt", etc.
 * @param {string} [opts.sourceLabel]         For chat summaries
 * @param {boolean}[opts.forceKilling=false]  If you need to mark as killing attack
 * @returns {Promise<Array>}                  Per-target summaries: { targetId, name, absorbed, net, hpBefore, hpAfter }
 */
export async function applyDamageNow({
  sourceActor,
  targets = [],
  baseDamage = 0,
  damageType = "physical-blunt",
  sourceLabel = "Attack",
  forceKilling = false,
  wasKillResult = false,      // if the triggering roll was a Kill result
  attackForm = "blunt",
  bypassArmor = false,
  armorPiercing = 0,
  armorPiercingCS = 0,
  apMode = "value",
  bypassForceField = false,
  showNotification = true,
  attackIntensity = 0
}) {
  try {
    const results = [];
    const dmgTypeLower = String(damageType || "physical-blunt").toLowerCase();
    const apVal = Number(armorPiercing || 0) || 0;
    const apCS  = Number(armorPiercingCS || 0) || 0;

    for (const t of (targets || [])) {
      // Normalize Token/TokenDocument → Actor
      const td = t?.document ? t.document : t;
      const targetActor = td?.actor || t?.actor;
      if (!targetActor) continue;

      // Mitigation (centralized rules)
      const m = calculateMitigation(baseDamage, targetActor, {
        damageType: dmgTypeLower,
        attackForm: String(attackForm || "blunt").toLowerCase(),
        bypassArmor: !!bypassArmor,
        armorPiercing: apVal,
        armorPiercingCS: apCS,
        apMode,
        bypassForceField: !!bypassForceField,
        attackIntensity
      });

      // FF breach consequences
      if (m?.ffBreach) {
        await handleFFBreach(targetActor, m.ffBreach);
      }

      const net      = Math.max(0, m?.netDamage || 0);
      const absorbed = Math.max(0, m?.absorbed   || 0);
      const hpBefore = targetActor.system?.attributes?.health?.value ?? 0;
      const hpAfter  = Math.max(0, hpBefore - net);

      if (net > 0) {
        const update = { "system.attributes.health.value": hpAfter };

        if (game.user.isGM || targetActor.isOwner) {
          await targetActor.update(update);
        } else if (game.msh?.runAsGM) {
          await game.msh.runAsGM({ operation: "update", targetActorUuid: targetActor.uuid, args: [update] });
        } else {
          if (showNotification) ui.notifications.warn("Couldn't update Health: no GM helper available.");
        }

        // 0-Health rule (supports Four-Color toggle)
        if (hpAfter === 0 && hpBefore > 0) {
          const fourColor = game.settings.get("msh-faserip", "fourColorRule");
          const { isLethalAttackForm } = await import("../../rules/kill-resolver.js");
          const lethal = wasKillResult || forceKilling || isLethalAttackForm(attackForm);
          if (!fourColor || lethal) {
            await postDeathSavePrompt(targetActor);
          } else {
            await postFourColorKnockout(targetActor, { source: "hp-zero:applyDamageNow" });
          }
        }

        if (showNotification) {
          if (game.user.isGM) {
            const armorNote = absorbed > 0 ? ` (${baseDamage} - ${absorbed} Body Armor)` : "";
            ui.notifications.info(`${targetActor.name} took ${net} damage${armorNote}. Health: ${hpBefore} → ${hpAfter}`);
          } else {
            ui.notifications.info(`${targetActor.name} took ${net} damage.`);
          }
        }
      } else if (showNotification) {
        ui.notifications.info(`${targetActor.name}'s armor absorbed all damage.`);
      }

      results.push({
        actorUuid: targetActor?.uuid ?? null,
        tokenUuid: td?.uuid ?? null,
        name: targetActor?.name ?? "Target",
        hpBefore,
        hpAfter,
        absorbed,
        net
      });
    }

    debugLog("applyDamageNow (refactor path)", { count: results.length, sourceLabel, damageType: dmgTypeLower });
    return results;
  } catch (err) {
    console.error("applyDamageNow error:", err);
    return [];
  }
}


/**
 * Get resistance modifiers for a target actor
 * @param {Actor} targetActor - The actor being hit
 * @param {string} damageType - Type of damage (e.g., "energy-fire", "physical-blunt")
 * @returns {Object} { csBonus, damageReduction, hasImmunity, resistancePowers }
 */
export function getResistanceModifiers(targetActor, damageType = "physical-blunt") {
  const dmgTypeLower = String(damageType || "physical-blunt").toLowerCase();
  // Extract base resistance type (e.g., "fire" from "energy-fire")
  let baseType = dmgTypeLower;  // ✅ Use normalized version
  if (dmgTypeLower?.includes("-")) {  // ✅ Use normalized version
    baseType = dmgTypeLower.split("-")[1];  // ✅ Use normalized version
  }
  
  // Find relevant resistance powers
  const resistances = targetActor.items.filter(i => {
    if (i.type !== "power") return false;
    if (i.system?.isActive === false) return false; // suppressed (e.g., Nullified)
    
    // NEW WAY: Check explicit isResistance flag and match type
    if (i.system.isResistance === true) {
      return i.system.resistanceType === baseType;
    }
    
    // LEGACY FALLBACK: Category-based detection
    const cat = String(i.system.category || "").toLowerCase();
    if (cat === "resistances") {
      const typ = String(i.system.type || "").toLowerCase();
      return typ.includes(baseType);
    }
    
    return false;
  });

  let totalCSBonus = 0;
  let totalDamageReduction = 0;
  let hasImmunity = false;

  resistances.forEach(res => {
    const effect = res.system.resistanceEffect || "columnShift";
    
    if (effect === "immunity") {
      hasImmunity = true;
    } else if (effect === "columnShift") {
      totalCSBonus += res.system.resistanceValue || 2;
    } else if (effect === "damageReduction") {
      totalDamageReduction += res.system.resistanceValue || 0;
    }
  });

  return {
    csBonus: totalCSBonus,
    damageReduction: totalDamageReduction,
    hasImmunity: hasImmunity,
    resistancePowers: resistances,
    damageType: damageType,
    baseType: baseType
  };
}

/**
 * Check if target is immune to damage type based on resistance powers
 * @param {Actor} targetActor - The actor being hit
 * @param {string} damageType - Type of damage
 * @param {number} attackRank - Rank value of the attack
 * @returns {boolean} True if immune
 */
export function checkImmunity(targetActor, damageType, attackRank) {
  const resistance = getResistanceModifiers(targetActor, damageType);
  
  if (!resistance.hasImmunity) return false;
  
  // Check if any immunity power has rank >= attack rank
  for (const resPower of resistance.resistancePowers) {
    if (resPower.system.resistanceEffect === "immunity") {
      const resRank = typeof resPower.system.value === 'number'
        ? resPower.system.value
        : (CONFIG.FASERIP?.rankValues?.[resPower.system.rank] || 0);
      
      if (resRank >= attackRank) {
        return true; // Immune!
      }
    }
  }
  
  return false;
}

/**
 * Apply the Nullified status to a single target via your effects system.
 * Duration: RAW 1–10 rounds unless the attacker is maintaining a Nullify aura.
 */
export async function applyNullifyToTarget(targetActor, attacker, { originUuid = null, rounds = null } = {}) {
  if (!targetActor) return;
  const maintained = isAuraMaintained(attacker);
  await applyNullifiedEffect(targetActor, { maintained, originUuid, rounds });
}

// === [PREVIEW CONFIRM HELPERS] =============================================
//
// Centralized helpers for the optional post-roll "Preview → Confirm" gate.
// Used by actions in Semi-Auto / Manual when opts.showConfirm && !opts.autoApply
//
// Usage in an action file (after computing roll/color/damage, before posting):
//   import { shouldConfirm, buildPreviewHtml, confirmPreview } from "./action-utils.js";
//   if (shouldConfirm(this?.opts)) {
//     const html = buildPreviewHtml({ actorName, actionName, rollTotal, resultColor, column, colShift, baseDamage, finalDamage, extras: [...] });
//     const ok = await confirmPreview({ title: "Preview — <Action Name>", contentHtml: html });
//     if (!ok) return;
//   }

export function shouldConfirm(opts) {
  return Boolean(opts && opts.showConfirm === true && opts.autoApply === false);
}

/**
 * Build a compact preview grid.
 * @param {Object} p
 * @param {string} p.actorName
 * @param {string} p.actionName
 * @param {number|string} p.rollTotal
 * @param {string} p.resultColor   // "white"|"green"|"yellow"|"red"
 * @param {string} p.column        // e.g., "Remarkable" (or a number/index string)
 * @param {string} p.colShift      // e.g., "+1 CS", "-2 CS", "0 CS"
 * @param {number|string} p.baseDamage
 * @param {number|string} p.finalDamage
 * @param {Array<{label:string,value:string|number}>} p.extras
 */
export function buildPreviewHtml({
  actorName,
  actionName,
  rollTotal,
  resultColor,
  column,
  colShift,
  baseDamage,
  finalDamage,
  extras = []
} = {}) {
  const rows = [
    { label: "Roll total",   value: rollTotal ?? "—" },
    { label: "Result color", value: (resultColor ?? "—").toString() },
    { label: "Column",       value: column ?? "—" },
    { label: "CS",           value: colShift ?? "—" },
    { label: "Raw damage",   value: baseDamage ?? "—" },
    { label: "After armor",  value: finalDamage ?? "—" },
    ...extras
  ];

  const grid = rows.map(r => `
    <div style="color:#666;">${r.label}</div>
    <div>${r.value}</div>
  `).join("");

  return `
    <div style="font-family:var(--font-primary);line-height:1.3;">
      <div style="font-weight:600;margin-bottom:6px;">${actorName ?? ""} — ${actionName ?? ""}</div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:6px;">${grid}</div>
      <div style="margin-top:8px;color:#666;font-size:.9em;">Confirm to post the action card.</div>
    </div>
  `;
}

/**
 * Show a standard confirm dialog. Returns true if confirmed.
 * @param {Object} p
 * @param {string} p.title
 * @param {string} p.contentHtml
 * @returns {Promise<boolean>}
 */
export async function confirmPreview({ title = "Preview", contentHtml }) {
  return await Dialog.confirm({
    title,
    content: contentHtml,
    yes: () => true,
    no: () => false,    defaultYes: true
  });
}

/**
 * Build HTML for the multi-attack section
 * @param {string} actionType - Type of action (e.g., "blunt-attack", "energy", "shooting")
 * @param {number} targetCount - Number of targets selected
 * @param {boolean} multiAttacks - Whether multi-attacks is enabled
 * @param {number} attackCount - Number of attacks (2 or 3)
 * @param {boolean} multiAdjacent - Whether attacking multiple adjacent targets
 * @returns {string} HTML for the multi-attack section
 */
export function buildMultiAttackSection(actionType, targetCount, multiAttacks = false, attackCount = 2, multiAdjacent = false) {
  const canUseAdjacent = ["blunt-attack", "energy", "force"].includes(actionType);
  
  // Determine background color based on what's active
  let bgColor = '#e8f5e9'; // Default green
  if (multiAdjacent) bgColor = '#ffe0b2'; // Light orange for adjacent
  else if (multiAttacks) bgColor = '#fff3cd'; // Light yellow for multi-attacks
  
  return `
    <div class="multi-attack-section" style="margin:6px 0;padding:6px;background:${bgColor};border:1px solid #4caf50;border-radius:3px;transition:background 0.3s ease;">
      <div style="font-weight:600;margin-bottom:6px;color:#2e7d32;">Multiple Targets/Attacks</div>
      
      ${canUseAdjacent ? `
        <div style="margin-bottom:6px;">
          <label style="font-size:.9em;">
            <input type="checkbox" name="multiAdjacent" ${multiAdjacent ? 'checked' : ''}>
            Attack all adjacent targets (-4 CS, single roll)
          </label>
          <div style="font-size:.8em;color:#555;font-style:italic;margin-left:20px;">
            One attack roll affects all adjacent enemies
          </div>
        </div>
      ` : ''}
      
      <div style="margin-bottom:4px;${canUseAdjacent ? 'border-top:1px solid #c8e6c9;padding-top:6px;' : ''}">
        <label style="font-size:.9em;">
          <input type="checkbox" name="multiAttacks" ${multiAttacks ? 'checked' : ''}>
          Multiple attacks: 2 or 3 separate attacks (-1 CS each)
        </label>
      </div>
      
      <div id="multi-attack-options" style="display:${multiAttacks ? 'block' : 'none'};margin-left:20px;padding:4px 0;">
      <div style="margin-bottom:4px;">
        <label style="font-size:.9em;display:block;margin-bottom:2px;">Number of Attacks:</label>
        <label style="font-size:.85em;margin-right:12px;">
          <input type="radio" name="attackCount" value="2" ${attackCount === 2 ? 'checked' : ''}>
          2 attacks (Remarkable FEAT)
        </label>
        <label style="font-size:.85em;">
          <input type="radio" name="attackCount" value="3" ${attackCount === 3 ? 'checked' : ''}>
          3 attacks (Amazing FEAT)
        </label>
      </div>
      
      <div style="margin-top:6px;border-top:1px solid #c8e6c9;padding-top:4px;">
        <span class="multi-attack-info-toggle" style="font-size:.8em;color:#2e7d32;cursor:pointer;user-select:none;">
          ℹ️ How are attacks distributed? <span style="font-size:.7em;">(click)</span>
        </span>
        <div class="multi-attack-info" style="display:none;margin-top:4px;padding:6px;background:#f1f8e9;border-radius:3px;font-size:.75em;color:#555;">
          <div style="font-weight:600;margin-bottom:3px;">Attack Distribution:</div>
          <div>• 1 target: All attacks hit that target</div>
          <div>• Multiple targets: Attacks distributed round-robin</div>
          <div style="margin-top:3px;font-style:italic;">
            Examples: 3 attacks/2 targets = 2+1 hits, 3 attacks/3 targets = 1+1+1 hits
          </div>
        </div>
      </div>
      
      <div style="font-size:.8em;color:#555;font-style:italic;margin-top:4px;">
        Requires Fighting FEAT. If failed: 1 attack at -3CS
      </div>
    </div>
  </div>`;
}

/**
 * Setup event handlers for multi-attack checkboxes
 * @param {jQuery} html - The jQuery-wrapped HTML element
 */
export function setupMultiAttackHandlers(html) {
  const $multiAttacks = html.find('[name="multiAttacks"]');
  const $multiAdjacent = html.find('[name="multiAdjacent"]');
  const $multiOptions = html.find('#multi-attack-options');
  const $section = html.find('.multi-attack-section');

  // Toggle multi-attack options visibility and background color
  if ($multiAttacks.length && $multiOptions.length) {
    $multiAttacks.on('change', function() {
      const isChecked = $(this).is(':checked');
      $multiOptions.toggle(isChecked);
      // Only change background if adjacent isn't checked
      if (!$multiAdjacent.is(':checked')) {
        $section.css('background', isChecked ? '#fff3cd' : '#e8f5e9');
      }
    });
  }

  // Make adjacent mutually exclusive with multi-attacks
  if ($multiAdjacent.length && $multiAttacks.length) {
    $multiAdjacent.on('change', function() {
      const isChecked = $(this).is(':checked');
      if (isChecked) {
        $multiAttacks.prop('checked', false);
        $multiOptions.hide();
        $section.css('background', '#ffe0b2'); // Light orange
      } else {
        $section.css('background', '#e8f5e9'); // Back to green
      }
    });
  }

  html.find('.multi-attack-info-toggle').on('click', function(e) {
    e.preventDefault();
    html.find('.multi-attack-info').slideToggle(200);
  });
}

// ============================================
// REMEMBER SETTINGS UTILITIES
// ============================================

/**
 * Get a localStorage value with fallback
 */
export function getLocalStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a localStorage value safely
 */
export function setLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * Generate HTML for remember/skip-dice controls
 * @param {string} prefix - localStorage key prefix (e.g., "msh.ba" for blunt attack)
 * @returns {string} HTML string
 */
export function generateRememberControlsHTML(prefix) {
  const rememberKey = `${prefix}.remember`;
  const skipKey = `${prefix}.skipDice`;
  const remembered = getLocalStorage(rememberKey, "1") === "1";
  const skipDice = getLocalStorage(skipKey, "0") === "1";
  
  return `
    <div style="margin-top:6px;padding-top:5px;border-top:1px solid #ddd;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.9em;">
      <label><input type="checkbox" name="remember" ${remembered ? 'checked' : ''}> Remember settings</label>
      <label><input type="checkbox" name="skipDice" ${skipDice ? 'checked' : ''}> Skip dice animation</label>
    </div>
  `;
}

/**
 * Setup handlers for remember/skip-dice controls and persist state
 * @param {jQuery} html - Dialog HTML
 * @param {string} prefix - localStorage key prefix
 */
export function setupRememberControlHandlers(html, prefix) {
  const rememberKey = `${prefix}.remember`;
  const skipKey = `${prefix}.skipDice`;
  
  // Persist remember checkbox changes immediately
  html.find('[name="remember"]').on('change', function() {
    setLocalStorage(rememberKey, this.checked ? "1" : "0");
  });
  
  // Persist skip dice changes only if remember is checked
  html.find('[name="skipDice"]').on('change', function() {
    if (html.find('[name="remember"]').is(':checked')) {
      setLocalStorage(skipKey, this.checked ? "1" : "0");
    }
  });
}

/**
 * Extract remember/skip values from dialog
 * @param {jQuery} html - Dialog HTML
 * @returns {{remember: boolean, skipDice: boolean}}
 */
export function extractRememberSettings(html) {
  const $rememberNew = html.find('[name="rememberSettings"]');
  const $rememberOld = html.find('[name="remember"]');
  const $skipNew = html.find('[name="skipDiceRoll"]');
  const $skipOld = html.find('[name="skipDice"]');

  const remember = ($rememberNew.length ? $rememberNew : $rememberOld).is(':checked');
  const skipDice = ($skipNew.length ? $skipNew : $skipOld).is(':checked');

  // Maintain legacy property names for existing call sites
  return { remember, skipDice };
}

// ============================================
// COLLAPSIBLE CHECK SECTIONS
// ============================================

/**
 * Build collapsible slam check section for inline display in attack cards
 * @param {Object} result - Slam check result from CheckAction
 * @returns {string} HTML string
 */
export function buildCollapsibleSlamSection(result) {
  if (!result) return "";
  
  const { colorLower, slamEffect, knockbackDistance, attackerStrength, attackerStrengthRank, targetName, defenderUuid, roll, effectiveEndRank } = result;
  
  // Color-coded summary based on slam effect
  const effectColors = {
    "Grand Slam": { bg: "#8B0000", fg: "#fff", icon: "&#x1F4A5;" },
    "1 Area": { bg: "#DC3545", fg: "#fff", icon: "&#x1F4A2;" },
    "Stagger": { bg: "#FFC107", fg: "#000", icon: "&#x1F635;" },
    "No Slam": { bg: "#28A745", fg: "#fff", icon: "&#x1F6E1;" }
  };
  const colors = effectColors[slamEffect] || { bg: "#666", fg: "#fff", icon: "" };
  
  // Summary line (visible when collapsed)
  const summaryText = slamEffect === "Grand Slam" 
    ? `Slam Check - Grand Slam (${knockbackDistance} areas)` 
    : `Slam Check - ${slamEffect}`;
  
  // Collision button for knockback effects
  const collisionButton = (slamEffect === "Grand Slam" || slamEffect === "1 Area") ? `
    <div style="padding:6px 8px;text-align:center;border-top:1px solid rgba(0,0,0,.1);">
      <button class="calculate-slam-collision"
              data-target="${defenderUuid || ''}"
              data-distance="${slamEffect === "Grand Slam" ? knockbackDistance : 1}"
              data-speed="${slamEffect === "Grand Slam" ? knockbackDistance : 1}"
              data-attacker-strength="${attackerStrength || 10}"
              style="background:#DB747E;color:white;border:none;border-radius:3px;padding:5px 10px;cursor:pointer;font-size:.85em;">
        Calculate Collision Damage
      </button>
    </div>` : "";
  
  // Build detailed content
  let detailContent = "";
  if (slamEffect === "Grand Slam") {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:6px;"><strong>${targetName}</strong> is launched away with tremendous force!</div>
        <div style="margin-bottom:4px;"><strong>Mechanical Effects:</strong></div>
        <div style="margin-left:8px;">
          <div>Attacker Strength: ${attackerStrengthRank} (${attackerStrength})</div>
          <div>Knockback Distance: ${knockbackDistance} areas</div>
          <div>Launch Speed: ${knockbackDistance} areas/round</div>
          <div>Direction: Attacker chooses (if damage dealt)</div>
        </div>
        <div style="margin-top:6px;"><strong>Collision Damage:</strong></div>
        <div style="margin-left:8px;font-size:.85em;color:#555;">
          <div>If target hits obstacle: charging damage applies</div>
          <div>Buildings reduce knockback per movement rules</div>
          <div>Target takes slam damage if hitting walls/objects</div>
        </div>
      </div>`;
  } else if (slamEffect === "1 Area") {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:6px;"><strong>${targetName}</strong> is knocked back 1 area!</div>
        <div style="margin-bottom:4px;"><strong>Mechanical Effects:</strong></div>
        <div style="margin-left:8px;font-size:.85em;">
          <div>Knocked 1 area away from attacker</div>
          <div>May hit obstacles during knockback</div>
          <div>Takes damage if slammed into walls/objects</div>
        </div>
      </div>`;
  } else if (slamEffect === "Stagger") {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:6px;"><strong>${targetName}</strong> staggers from the impact!</div>
        <div style="margin-left:8px;font-size:.85em;">
          <div>Knocked back a step or two</div>
          <div>No longer adjacent to attacker</div>
          <div>Fully capable of combat next round</div>
        </div>
      </div>`;
  } else {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div><strong>${targetName}</strong> plants their feet and resists!</div>
        <div style="margin-top:4px;font-size:.85em;color:#555;">No knockback effect - remains in current position.</div>
      </div>`;
  }
  
  // Roll info line
  const rollInfo = `
    <div style="padding:4px 8px;font-size:.85em;color:#555;border-top:1px solid rgba(0,0,0,.1);">
      Endurance: ${effectiveEndRank} | Roll: <span style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;">${roll}</span> | Result: <strong style="text-transform:capitalize;">${colorLower}</strong>
    </div>`;
  
  return `
    <details class="faserip-check-section slam-section" style="margin:6px 10px 8px;border:1px solid ${colors.bg};border-radius:4px;overflow:hidden;">
      <summary style="padding:6px 10px;background:${colors.bg};color:${colors.fg};cursor:pointer;font-weight:600;font-size:.9em;list-style:none;display:flex;align-items:center;gap:6px;">
        <span style="font-size:1.1em;">${colors.icon}</span>
        <span>${summaryText}</span>
        <span style="margin-left:auto;font-size:.8em;opacity:.8;">&#9660;</span>
      </summary>
      <div style="background:#fff;">
        ${detailContent}
        ${rollInfo}
        ${collisionButton}
      </div>
    </details>`;
}

/**
 * Build collapsible stun check section for inline display in attack cards
 * @param {Object} result - Stun check result from CheckAction
 * @returns {string} HTML string
 */
export function buildCollapsibleStunSection(result) {
  if (!result) return "";
  
  const { colorLower, stunDuration, targetName, roll, effectiveEndRank } = result;
  
  // Determine effect text and colors
  let effectText = "";
  let colors = { bg: "#28A745", fg: "#fff", icon: "&#x1F6E1;" };
  
  if (colorLower === "white" && stunDuration > 0) {
    effectText = `Stunned ${stunDuration} round${stunDuration !== 1 ? 's' : ''}`;
    colors = { bg: "#8B0000", fg: "#fff", icon: "&#x1F4A4;" };
  } else if (colorLower === "green") {
    effectText = "Stunned 1 round";
    colors = { bg: "#DC3545", fg: "#fff", icon: "&#x1F635;" };
  } else {
    effectText = "No effect";
  }
  
  const summaryText = `Stun Check - ${effectText}`;
  
  // Build detailed content
  let detailContent = "";
  if (colorLower === "white" && stunDuration > 0) {
    const stunDie = game.settings?.get?.("msh-faserip", "stunDurationDie") || "d10";
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:6px;"><strong>${targetName}</strong> is knocked out!</div>
        <div style="margin-left:8px;">
          <div>Duration: <strong title="Rolled 1${stunDie}">${stunDuration}</strong> round${stunDuration !== 1 ? 's' : ''}</div>
          <div style="font-size:.85em;color:#555;margin-top:4px;">May take no actions while stunned.</div>
        </div>
      </div>`;
  } else if (colorLower === "green") {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:6px;"><strong>${targetName}</strong> is knocked down!</div>
        <div style="margin-left:8px;font-size:.85em;color:#555;">
          <div>Stunned 1 round - no actions next round.</div>
        </div>
      </div>`;
  } else {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div><strong>${targetName}</strong> shakes it off!</div>
        <div style="margin-top:4px;font-size:.85em;color:#555;">No stun effect.</div>
      </div>`;
  }
  
  // Roll info line
  const rollInfo = `
    <div style="padding:4px 8px;font-size:.85em;color:#555;border-top:1px solid rgba(0,0,0,.1);">
      Endurance: ${effectiveEndRank} | Roll: <span style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;">${roll}</span> | Result: <strong style="text-transform:capitalize;">${colorLower}</strong>
    </div>`;
  
  return `
    <details class="faserip-check-section stun-section" style="margin:6px 10px 8px;border:1px solid ${colors.bg};border-radius:4px;overflow:hidden;">
      <summary style="padding:6px 10px;background:${colors.bg};color:${colors.fg};cursor:pointer;font-weight:600;font-size:.9em;list-style:none;display:flex;align-items:center;gap:6px;">
        <span style="font-size:1.1em;">${colors.icon}</span>
        <span>${summaryText}</span>
        <span style="margin-left:auto;font-size:.8em;opacity:.8;">&#9660;</span>
      </summary>
      <div style="background:#fff;">
        ${detailContent}
        ${rollInfo}
      </div>
    </details>`;
}

/**
 * Build collapsible breaking FEAT section for inline display in attack cards.
 * @param {Object} result - From executeBreakingFeat()
 * @returns {string} HTML string
 */
export function buildCollapsibleBreakingSection(result) {
  if (!result) return "";

  const { weaponMatRank, targetMatRank, weaponName, wielderStr, colorLower, reqColor, roll, autoResult, weaponBreaks, actorName } = result;

  const colors = weaponBreaks
    ? { bg: "#D32F2F", fg: "#fff", icon: "&#x1F4A5;" }
    : { bg: "#388E3C", fg: "#fff", icon: "&#x1F6E1;" };

  const summaryText = `Breaking FEAT - ${weaponBreaks ? "WEAPON BREAKS" : "Weapon Survives"}`;

  const bannerColor = (c) => {
    switch (String(c).toLowerCase()) {
      case "white": return { bg: "#e0e0e0", fg: "#333" };
      case "green": return { bg: "#4caf50", fg: "#fff" };
      case "yellow": return { bg: "#ffeb3b", fg: "#333" };
      case "red": return { bg: "#f44336", fg: "#fff" };
      default: return { bg: "#9e9e9e", fg: "#fff" };
    }
  };
  const { bg: reqBg, fg: reqFg } = bannerColor(reqColor);

  let detailContent = "";
  if (autoResult) {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:4px;"><strong>${actorName}'s</strong> ${weaponName || "weapon"} (${weaponMatRank}) vs target armor (${targetMatRank})</div>
        <div style="font-weight:bold;color:#555;">
          ${autoResult === "auto-break" ? "Automatic break (Str 3+ ranks above material)" : "Automatic survive (Str 3+ ranks below material)"}
        </div>
      </div>`;
  } else {
    detailContent = `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:4px;"><strong>${actorName}'s</strong> ${weaponName || "weapon"} (${weaponMatRank}) vs target armor (${targetMatRank})</div>
        <div>Required: <span style="padding:1px 6px;border-radius:2px;background:${reqBg};color:${reqFg};font-size:.85em;">${reqColor.toUpperCase()}</span> (Str ${wielderStr} vs ${weaponMatRank} intensity)</div>
      </div>`;
  }

  const rollInfo = roll != null ? `
    <div style="padding:4px 8px;font-size:.85em;color:#555;border-top:1px solid rgba(0,0,0,.1);">
      Strength: ${wielderStr} | Roll: <span style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;">${roll}</span> | Result: <strong style="text-transform:capitalize;">${colorLower}</strong>
    </div>` : "";

  return `
    <details class="faserip-check-section breaking-section" style="margin:6px 10px 8px;border:1px solid ${colors.bg};border-radius:4px;overflow:hidden;">
      <summary style="padding:6px 10px;background:${colors.bg};color:${colors.fg};cursor:pointer;font-weight:600;font-size:.9em;list-style:none;display:flex;align-items:center;gap:6px;">
        <span style="font-size:1.1em;">${colors.icon}</span>
        <span>${summaryText}</span>
        <span style="margin-left:auto;font-size:.8em;opacity:.8;">&#9660;</span>
      </summary>
      <div style="background:#fff;">
        ${detailContent}
        ${rollInfo}
      </div>
    </details>`;
}

// ============================================================================
// UNIFIED CHAT CARD BUILDERS (v1.7.0)
// Standard visual components for all action chat cards.
// Every action should use these to ensure consistent layout.
// ============================================================================

/**
 * Build the CS shift display with hover tooltip breakdown.
 * Returns empty string if totalShift is 0.
 *
 * @param {number} totalShift - Net column shift applied
 * @param {string} effectiveRank - Rank name after shift
 * @param {Object} [breakdown={}] - Shift breakdown object
 * @param {number} [breakdown.manual] - Manual shift from dialog
 * @param {string} [breakdown.csNotes] - User-entered CS explanation
 * @param {number} [breakdown.multiAttack] - Multi-attack penalty
 * @param {number} [breakdown.adjacent] - Adjacent targets penalty
 * @param {Array}  [attackerEffects=[]] - {name, shift} from active effects on attacker
 * @param {Array}  [defenderEffects=[]] - {name, shift} from active effects on defender
 * @returns {string} HTML like " (+2CS → Remarkable)" or ""
 */
export function buildShiftDisplay(totalShift, effectiveRank, breakdown = {}, attackerEffects = [], defenderEffects = []) {
  if (!totalShift) return "";

  const parts = [];

  // Manual shift from dialog
  if (breakdown?.manual && breakdown.manual !== 0) {
    if (breakdown.csNotes) {
      parts.push(breakdown.csNotes);
    } else {
      parts.push(`${breakdown.manual > 0 ? '+' : ''}${breakdown.manual}`);
    }
  }

  // Multi-attack penalty
  if (breakdown?.multiAttack && breakdown.multiAttack !== 0) {
    const label = breakdown.multiAttack === -1 ? "multi-atk" : "multi-atk fail";
    parts.push(`${breakdown.multiAttack} ${label}`);
  }

  // Adjacent targets penalty
  if (breakdown?.adjacent && breakdown.adjacent !== 0) {
    parts.push(`${breakdown.adjacent} adjacent`);
  }

  // Fallback: no breakdown object but shift exists
  if (!breakdown?.manual && !breakdown?.multiAttack && !breakdown?.adjacent && parts.length === 0) {
    // Check if breakdown has any custom keys we didn't handle
    const knownKeys = new Set(["manual", "csNotes", "multiAttack", "adjacent"]);
    for (const [k, v] of Object.entries(breakdown)) {
      if (!knownKeys.has(k) && typeof v === "number" && v !== 0) {
        parts.push(`${v > 0 ? '+' : ''}${v} ${k}`);
      }
    }
  }

  // Attacker effect modifiers
  for (const eff of attackerEffects) {
    parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
  }

  // Defender effect modifiers (flip sign — positive defense = harder to hit)
  for (const eff of defenderEffects) {
    parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
  }

  const breakdownText = parts.length > 0
    ? parts.join(', ')
    : `${totalShift > 0 ? '+' : ''}${totalShift} total`;

  const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
  return ` (${csBox} → ${effectiveRank})`;
}

/**
 * Build compact roll display: "Roll: [42]" or "Roll: 57 ([42] + 15 karma)"
 * Yellow hover box on the raw d100 result.
 *
 * @param {Roll}   roll - Foundry Roll object (needs .total)
 * @param {number} [totalKarmaUsed=0] - Karma spent
 * @param {number} [cappedTotal=null] - Final capped total (roll + karma, max 100)
 * @returns {string} HTML fragment (no wrapping div — intended for inline use)
 */
export function buildRollDisplay(roll, totalKarmaUsed = 0, cappedTotal = null) {
  const raw = roll?.total ?? 0;
  const final = cappedTotal ?? raw;
  const rollBox = `<span title="d100 = ${raw}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${raw}</span>`;

  if (totalKarmaUsed) {
    return `${final} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`;
  }
  return rollBox;
}

/**
 * Build inline result color badge: "GREEN — HIT"
 *
 * @param {string} color - Result color (white/green/yellow/red)
 * @param {string} effectLabel - Effect text (e.g. "Hit", "Slam", "Miss")
 * @param {Object} [opts={}]
 * @param {string} [opts.suffix] - Extra text after effect (e.g. "(capped)")
 * @returns {string} HTML span
 */
export function buildResultBadge(color, effectLabel, opts = {}) {
  const colorLower = String(color || "white").toLowerCase();
  const { bg, fg } = bannerColors(colorLower);
  const suffix = opts.suffix ? ` <span style="font-weight:normal;font-size:.85em;">${opts.suffix}</span>` : "";

  return `<span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">${String(colorLower).toUpperCase()} — ${String(effectLabel).toUpperCase()}${suffix}</span>`;
}

/**
 * Build a standard content box (white bg, gray border).
 * Used for damage readouts, outcome descriptions, context info.
 *
 * @param {string} innerHtml - Content to place inside the box
 * @returns {string} HTML div
 */
export function buildContentBox(innerHtml) {
  if (!innerHtml) return "";
  return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">${innerHtml}</div>`;
}

/**
 * Build the "Manual Mode: GM adjudicates" notice.
 * Returns empty string when not in manual mode.
 *
 * @param {boolean} isManualMode
 * @returns {string} HTML div or ""
 */
export function buildManualModeNotice(isManualMode) {
  if (!isManualMode) return "";
  return `<div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">Manual Mode: GM adjudicates</div>`;
}

/**
 * Build a complete chat card shell with standard layout.
 * All sections are optional — pass empty string to omit.
 *
 * Layout (top to bottom):
 *   ┌─ HEADER: actionLabel (maroon)   headerRight (gray) ─┐
 *   ├─ ACTOR ROW: actorHtml ──────────────────────────────┤
 *   ├─ ABILITY SECTION: abilityHtml ──────────────────────┤
 *   ├─ BODY SECTIONS: ...sections[] ──────────────────────┤
 *   └──────────────────────────────────────────────────────┘
 *
 * @param {Object} opts
 * @param {string} opts.actionLabel - Left header text (will be uppercased, colored maroon)
 * @param {string} [opts.headerRight=""] - Right header text (gray, smaller)
 * @param {string} [opts.actorHtml=""] - Actor → Target row HTML
 * @param {string} [opts.abilityHtml=""] - Ability + Roll + Badge section HTML
 * @param {string[]} [opts.sections=[]] - Additional HTML sections (damage, outcome, actions, etc.)
 * @returns {string} Complete chat card HTML
 */
export function buildCardShell({ actionLabel, headerRight = "", actorHtml = "", abilityHtml = "", sections = [] }) {
  const headerRightEl = headerRight
    ? `<span style="color:#666;font-weight:normal;font-size:.85em;">${headerRight}</span>`
    : "";

  const body = sections.filter(s => s).join("\n");

  return `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
  <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
    <strong style="color:#8b0000;">${String(actionLabel).toUpperCase()}</strong>
    ${headerRightEl}
  </div>
  ${actorHtml ? `<div style="padding:4px 10px;font-size:.95em;">${actorHtml}</div>` : ""}
  ${abilityHtml ? `<div style="padding:2px 10px 6px;font-size:.9em;color:#555;">${abilityHtml}</div>` : ""}
  ${body}
</div>`;
}

/**
 * Build the standard "Actor → Target" row HTML.
 *
 * @param {string} actorName
 * @param {string} [targetName=""] - Omit or pass empty to show actor only
 * @param {string} [contextNote=""] - Optional small note after target (weapon, item, range)
 * @returns {string} HTML fragment (no wrapping div — buildCardShell adds it)
 */
export function buildActorTargetHtml(actorName, targetName = "", contextNote = "") {
  let html = `<strong>${actorName}</strong>`;
  if (targetName) {
    html += ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${targetName}</strong>`;
  }
  if (contextNote) {
    html += ` <span style="color:#666;font-size:.85em;margin-left:6px;">${contextNote}</span>`;
  }
  return html;
}

/**
 * Build the ability + roll + result badge section HTML.
 * This is the core "Strength: Remarkable (+2CS → Incredible) / Roll: [57] GREEN — HIT" block.
 *
 * @param {Object} opts
 * @param {string} opts.abilityLabel - e.g. "Strength", "Endurance", "Agility"
 * @param {string} opts.abilityRank - e.g. "Remarkable"
 * @param {string} opts.shiftDisplay - Output from buildShiftDisplay()
 * @param {string} opts.rollDisplay - Output from buildRollDisplay()
 * @param {string} opts.resultBadge - Output from buildResultBadge()
 * @param {string} [opts.extraLine=""] - Optional line between ability and roll (e.g. context)
 * @returns {string} HTML fragment (no wrapping div — buildCardShell adds it)
 */
export function buildAbilitySection({ abilityLabel, abilityRank, shiftDisplay = "", rollDisplay, resultBadge, extraLine = "" }) {
  return `<div>${abilityLabel}: ${abilityRank}${shiftDisplay}</div>
${extraLine ? `<div>${extraLine}</div>` : ""}
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;${extraLine ? "" : "margin-top:3px;"}">
  <span>Roll: ${rollDisplay}</span>
  ${resultBadge}
</div>`;
}

/**
 * v14 CanvasShakeEffect profiles keyed by damage type code.
 * Used by area attacks (grenades, AoE) to shake the canvas on hit.
 * Keys accept raw damageType codes (BA, EA, S, E, F, TE, TB) and also
 * normalized "physical-*" / "energy" forms emitted by some pipelines.
 * Null/undefined = no shake (gas, smoke, flash — non-concussive effects).
 */
export const DAMAGE_TYPE_SHAKE = {
  // Raw codes
  "BA": { intensity: 30, duration: 700 },  // concussive blunt
  "EA": { intensity: 22, duration: 550 },  // frag/edged
  "TB": { intensity: 30, duration: 700 },
  "TE": { intensity: 22, duration: 550 },
  "S":  { intensity: 18, duration: 500 },  // shooting (light explosive)
  "E":  { intensity: 14, duration: 450 },  // energy / sonic
  "F":  { intensity: 18, duration: 500 },  // force
  // Normalized forms (applyDamageToTargets-facing)
  "physical-blunt": { intensity: 30, duration: 700 },
  "physical-edged": { intensity: 22, duration: 550 },
  "energy":         { intensity: 14, duration: 450 },
  "force":          { intensity: 18, duration: 500 }
};

/**
 * Resolve the shake profile for a damage type, with sensible defaults.
 * Returns null for non-concussive effect types (smoke, gas, flash, null).
 */
export function shakeProfileFor(damageType) {
  if (!damageType) return null;
  return DAMAGE_TYPE_SHAKE[damageType] ?? DAMAGE_TYPE_SHAKE[String(damageType).toUpperCase()] ?? null;
}

/**
 * Read the effective area radius of an item. Unified field is `system.areaRadius`;
 * falls back to the legacy `system.grenadeRadius` for pre-migration items.
 * Returns a positive number, or 0 if the item is not an area weapon.
 *
 * Note: template.json initializes these fields to "" (empty string) rather than
 * null/undefined, so plain `??` doesn't fall through. _blank() treats "" as unset.
 */
const _blank = (v) => v === undefined || v === null || v === "";

export function getAreaRadius(item) {
  const sys = item?.system || {};
  const raw = _blank(sys.areaRadius) ? sys.grenadeRadius : sys.areaRadius;
  const r = Number(raw);
  return Number.isFinite(r) && r > 0 ? r : 0;
}

/**
 * Read the effective area damage of an item, with grenade* fallback.
 */
export function getAreaDamage(item) {
  const sys = item?.system || {};
  const raw = _blank(sys.damage) ? sys.grenadeDamage : sys.damage;
  if (_blank(raw)) return 0;
  const m = String(raw).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/**
 * Read the effective area damage type of an item, with grenade* fallback.
 * Returns raw code (BA/EA/S/E/F/TE/TB) uppercased, or empty string.
 */
export function getAreaDamageType(item) {
  const sys = item?.system || {};
  const raw = _blank(sys.damageType) ? sys.grenadeDamageType : sys.damageType;
  return _blank(raw) ? "" : String(raw).toUpperCase();
}

/**
 * Read the effective intensity rank of an item, with grenade* fallback.
 * Returns a rank string ("Typical", "Excellent", ...) or "".
 */
export function getAreaIntensityRank(item) {
  const sys = item?.system || {};
  const raw = _blank(sys.intensityRank) ? sys.grenadeIntensity : sys.intensityRank;
  return _blank(raw) ? "" : String(raw);
}
