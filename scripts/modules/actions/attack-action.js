// attack-action.js v1.9.45 - 2026-06-12
// v1.9.45: Fix intensity-on-hit not firing on melee — the method-scope `weapon`
//          is null on blunt/edged paths (they set choice.itemId, not choice.weapon).
//          Resolve the weapon via this.opts.item first (like the ammo block).
// v1.9.44: On-hit hook now reads the unified intensity cluster (intensityRank +
//          intensityEffect + intensityDuration) instead of stunIntensity, applies
//          the configured effect via shared applyIntensityEffect, FEAT gated by
//          required color. Renamed _applyStunOnHit -> _applyIntensityOnHit.
// attack-action.js v1.9.43 - 2026-06-12
// v1.9.43: Stun-on-hit hook in _executeSingleAttack. A weapon with
//          system.stunIntensity (stun baton, Stun Pistol/Rifle/Cannon) rolls
//          the target's Endurance FEAT vs that Intensity on a hit; failure =>
//          stunned 1-10 rounds. FEAT-intensity attack: ignores Body Armor
//          (keyed off the hit, not penetrating damage). Skipped when another
//          postHitCallback already fired (mercy/area), so it never doubles.
// v1.9.42: Decrement ammo for ALL firearms, not just actionType "shooting".
//          Energy/force blasters (attackType "energy"/"force") dispatch as
//          energy/force attacks, so the old `actionType === "shooting"` gate
//          never fired and their shots never spent. Now detect firearms by
//          weaponType ("shooting"/"firearm"), matching the pre-attack check.
// v1.9.41: Firearm ammo no longer depends on the SFX subsystem. The post-attack
//          spend block was nested inside `if (game.msh?.playCombatSFX)`; hoisted
//          to a bare block so shots always decrement. Also seed shotsRemaining
//          from shots when blank and never decrement `shots` (magazine capacity).
// v1.9.40: Show the to-hit breakdown when modifiers cancel to a net 0
//          (e.g. Guns +1CS vs Range -1CS) so the Agility hover lists both
//          instead of going blank. Effective rank gets a * when any mods apply.
// v1.9.39: Suppress the Stun result when the same blow reduces the target
//          to 0 Health. Per RAW the target is knocked unconscious by the
//          0-Health path (death save, or Four-Color knockout) — the Stun
//          ("Unconscious 1-10 rounds") is the same outcome, so it no longer
//          stacks a second KO timer. Slam and the red-result Kill checks
//          are untouched. Gated on the health threshold, not the kill check
//          (which is Four-Color-conditional).
// attack-action.js v1.9.38 - 2026-05-23
// v1.9.38: Energy and Force now render the redesigned attack-card.hbs too
//          (added to REDESIGNED_ATTACK_FORMS; formClass falls through to
//          the action key for shooting/energy/force). Charging is the only
//          _executeSingleAttack form still on the legacy inline card.
// attack-action.js v1.9.37 - 2026-05-23
// v1.9.37: Generalized the redesigned attack card (was blunt-only) to a
//          shared templates/chat/attack-card.hbs covering edged, shooting,
//          throwing-edged and throwing-blunt. Result words come from each
//          form's effects map (already form-correct); range shows real
//          areas for ranged forms ("adjacent" for melee); the muted
//          consequence bars and the CSS form class are driven off the new
//          REDESIGNED_ATTACK_FORMS set. Charging stays on the legacy card.
// attack-action.js v1.9.36 - 2026-05-22
// v1.9.36: Blunt cards now render the Stun/Slam/Breaking consequence bars
//          in the muted (maroon-on-light) style via opts.muted, so the
//          color result banner stays the single loud element. Legacy
//          energy/edged/shooting cards keep the loud bars for now.
// attack-action.js v1.9.35 - 2026-05-22
// v1.9.35: To-hit modifier lines now read "Label: value" (name-first,
//          like the MP card) and the manual dialog shift is labeled
//          "Manual: +N" instead of a bare number. Feeds the blunt
//          Fighting hover and the legacy-card CS hover alike.
// attack-action.js v1.9.34 - 2026-05-22
// v1.9.34: Blunt card v4 fixes — widen the ability strip cell (flex 1.7)
//          and drop the rank to 16px so full rank words stop wrapping
//          mid-word in the narrow chat sidebar; restack the Fighting
//          hover vertically (base, each modifier, divider, → result) to
//          mirror the Roll20 MP to-hit tooltip.
// attack-action.js v1.9.33 - 2026-05-22
// v1.9.33: Blunt card v4 — back to the strip/banner layout with revisions:
//          roll now black (was gold); middle cell labeled by ability name
//          (e.g. FIGHTING) showing the effective column spelled out, with a
//          "*" when modified and the modifier chain on hover; Target+Range
//          share one line; Type row dropped; damage cell shows "—" on a miss
//          and carries the GM armor math on hover. Shared consequence bar
//          styling left as-is.
// attack-action.js v1.9.32 - 2026-05-22
// v1.9.32: Blunt card v3 — compact line layout. Drop the stat strip and
//          color band; roll now sits in a neutral pill (black text)
//          followed by an inline result badge. Add an always-on
//          "Modifiers:" line ("None" when empty, "→ Eff" when shifts
//          fire) and a dedicated Damage line (GM math / player net).
//          Type line removed (blunt is implied by the header).
// attack-action.js v1.9.31 - 2026-05-22
// v1.9.31: Blunt card polish — native title= hovers (match other cards,
//          drop oversized data-tooltip), light maroon-text header (no red
//          bar, matches Energy Attack), and "Target: X" instead of the
//          redundant attacker → target line (attacker is in the speaker).
// attack-action.js v1.9.30 - 2026-05-22
// v1.9.30: Move blunt card v2 into a Handlebars partial
//          (templates/chat/blunt-attack-card.hbs) rendered via
//          renderTemplate, and add audit-layer hover tooltips
//          (data-tooltip) on the Roll, Eff-Rank, Damage, and Type
//          values — mirroring the Roll20 MP card's to-hit / damage /
//          subtype hovers. Behavior unchanged; presentation only.
// attack-action.js v1.9.29 - 2026-05-22
// v1.9.29: Blunt-form chat card v2 — full-width color-result banner, a
//          Roll / Eff-Rank / Damage strip, only the non-zero to-hit
//          modifiers as labeled chips, and a GM-only mitigation line.
//          Gated to attackForm "blunt"; edged/shooting keep legacy card.
// attack-action.js v1.9.28 - 2026-05-20
// v1.9.28: Thread choice.ignoresNaturalArmor / choice.ignoresArtificialArmor
//          (and fix choice.bypassForceField forwarding) through the two
//          downstream consumers: getBodyArmorValues for the upstream BA
//          pre-subtraction, and applyDamageToTargets for the FF/resistance
//          stage. Also stamp both ignore flags onto the actionsBox prefill
//          so the manual chat-card Apply Damage path honors them too.
//          Caller (energy-action.js v3.x, edged-attack-action.js for claws)
//          sets the flags on the choice; mitigation.js v3.2.0 +
//          getBodyArmorValues v2.x consume them. No behavior change when
//          all three flags are unset.
// v1.9.27: MA-D engaged badge — reads choice.maDEngaged (set by
//          blunt-attack dialog's State-3 engage toggle) and renders a
//          teal "MA-D engaged — armor bypass for Stun/Slam" note in
//          the per-target chat card. Informational only this slice;
//          actual Stun/Slam armor bypass pipeline lands next slice.
// v1.9.26: Talent source badge on chat card — when this.opts.fromTalent
//          is set (attack launched from the talents tab via rollTalent),
//          render "Source: <talent name>" badge next to aim/variant badges.
//          Pairs with talent-action.js v1.2.0 picker-skip so a talent-routed
//          attack tells the table which talent was exercised.
// v1.9.25: Aim tactic — chat card now shows an Aim badge ("Aim: Stun" /
//          "Aim: Neutralize (disarm)") whenever aimMode !== "none", so the
//          table can see the attacker's declared intent even when the
//          dice didn't produce a reinterpreted result. Disarm note wording
//          made explicit about damage applying normally.
// v1.9.24: Aim tactic (RAW Tactics — Shooting maneuvers): choice.aimMode
//          handling for "neutralize" (Red→Yellow downgrade gated to tables
//          where red=Kill, plus disarm chat note on Yellow) and "stun"
//          (Yellow Bullseye → Stun effect label via effectiveEffects
//          override + Stun chip emission on Yellow for shooting/energy).
//          Applies across shooting/energy/force dialogs; Force opts out of
//          stun (red already = Stun per table) and Force red is preserved
//          as Stun rather than being stripped by Neutralize.
//          Disarm is GM-adjudicated — chat note only, no auto-unequip.
// v1.9.23: Multi-Attack FEAT dialog wrapped in frp-dlg + frp-header-v3 — picks up
//          all Pass-1 high-contrast styling (boxes, footer, ink). Replaces inline
//          grey/yellow ctx-cards and CS row with frp-box + frp-cs-box patterns.
//          Header logic preserved: actor + Fighting + ×N attacks → Multi-Attack.
// v1.9.22: Ammo variant effects — rubber (blunt column, suppress slam), mercy (KO save),
//          explosive (2x damage), heat-seeker (no range penalty), variant badge on chat card.
// v1.9.21: Semi mode now auto-triggers slam/stun/kill checks (not just full auto).
//          These are mechanical consequences, not player choices — must resolve before
//          next attack in multi-attack sequence. Damage application still full-auto only.
// v1.9.20: Expand isRanged to include charging/throwing so dodge defenseShiftRanged applies correctly
// v1.9.19: Semi mode always shows multi-attack FEAT dialog (auto/impossible shown as confirmation)
// v1.9.18: Multi-attack FEAT - CS now correctly affects success determination
// v1.9.17: Multi-attack FEAT dialog redesigned to match compact blunt-attack style
// v1.9.17: Fix reload button - use <a> tag instead of <button> (Foundry v13 sanitizes buttons from chat content)
// v1.9.16: Fix reload button - store token ID for synthetic actor lookup
// v1.9.15: Add reload button to out-of-ammo chat card
// v1.9.14: Evasion chat card shows real roll color instead of fake White; damage shows "evaded" not "miss"
// v1.9.13: Fix evasion bonus - apply to attack shift BEFORE roll so it shows in CS breakdown and effective rank
// v1.9.12: Fix chat card to display modified result after evasion bonus (use targetBg/targetFg/targetEffectResult)
// v1.9.11: Fix evasion - block attacks while evading, fix SFX to not play hit sounds on evaded miss
// v1.9.10: Fix evasion timing - evade blocks attack only in same round, bonus applies in next round
// v1.9.9: Add evasion checking - successful evasion causes attack to miss, failed evasion gives auto-hit
// v1.9.8: CS hover uses csNotes directly as label (e.g., "Ultimate Skill +4, +2 Stunned")
// v1.9.7: Remove duplicate kill check - applyDamageToTargets now handles via death-save
// v1.9.6: Breaking FEAT fallback to derive rank from numeric armor value; added debug logging
// v1.9.5: Borderline rule - effects can apply when armor exactly equals damage (passed via prefill)
// v1.9.4: Breaking FEAT shows when weapon mat < target mat; miss shows "Damage: 0 (miss)"
// v1.9.3: Pass target armor rank to Breaking FEAT dialog for auto-population
// v1.9.2: Damage line uses math notation (30 − 6 armor = 24) with source/armor hover text
// v1.9.1: Detailed CS breakdown hover showing manual, multi-attack, adjacent, and effect modifiers
// v1.9.0: Collapsible slam/stun sections inline in attack card (consolidatedChatCards mode)
// v1.8.6: Show actual effect names in CS breakdown hover (e.g., "-2 Stunned" instead of "-2 attacker")
// v1.8.5: CS breakdown in chat card (yellow box with hover showing manual/attacker/defender sources)
// v1.8.4: Move result badge to roll line, add attack number in header (1 of 2, vs 3 targets)
// v1.8.3: Yellow box on rolled d100 in chat card to indicate hover text
// v1.8.2: Fix result cap (Yellow/Green) - use capped color for effect lookup and Slam/Stun/Kill checks
// v1.8.1: Fix pull punch - use afterArmor (with pull cap) in applyDamageToTargets
// v1.8.0: Compact chat card layout - result badge in header, removed grid, inline damage display
// v1.7.0: Integrate effect modifiers system for combat penalties
// v1.6.1: Add debug logging for multi-attack FEAT auto-success diagnosis
// v1.6.0: Fix auto-trigger of Slam/Stun/Kill checks in full auto mode
// v1.5.x: Previous version without auto-trigger
import { BaseAction } from "./base-action.js";
// NOTE: resolveCombatMode imported dynamically to avoid circular dependency
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";

import { 
  RANKS, getStrengthInfo, shiftRank, getAbilityInfo,
  rollWithKarmaAndHistory, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets,
  debugLog, universalColor, buildInlineRollDisplay, buildInlineFeatDisplay,
  buildCollapsibleSlamSection, buildCollapsibleStunSection, buildCollapsibleBreakingSection
} from "./action-utils.js";
//import { rollUniversalTable } from "../dice/universal-table.js";
import { executeBreakingFeat } from "./breaking-feat.js";
import { buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { ACTION_LABELS } from "./action-config.js";
import { ACTION_EFFECTS } from "./action-config.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { SCOPE, getFlagScope } from "./flags.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown, canActorAct, getModifierSummary, getEvasionAttackBonus, consumeEvasionAttackBonus } from "../effects/effect-modifiers.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

// Attack forms that use the redesigned shared chat card (attack-card.hbs)
// and the muted consequence-bar style. Charging stays on the legacy card.
const REDESIGNED_ATTACK_FORMS = new Set([
  "blunt-attack", "edged-attack", "shooting", "throwing-edged", "throwing-blunt",
  "energy", "force"
]);
const MELEE_ATTACK_FORMS = new Set(["blunt-attack", "edged-attack"]);

function escapeChatText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildMitigationChatSummary(result, context = {}) {
  if (!result) return "";

  const net = Number(result.net ?? result.mitigation?.netDamage ?? context.afterArmor ?? 0);
  const afterArmor = Number(context.afterArmor ?? result.mitigation?.rawDamage ?? net) || 0;
  const absorbed = Number(result.absorbed ?? Math.max(0, afterArmor - net)) || 0;
  const layers = Array.isArray(result.mitigation?.layers) ? result.mitigation.layers : [];

  if (absorbed <= 0 && net === afterArmor && layers.length === 0) return "";

  const layerText = layers
    .filter(layer => Number(layer?.absorbed || 0) > 0 || layer?.immune || layer?.overloaded || layer?.skipped)
    .map(layer => {
      const type = escapeChatText(layer?.type || "Defense");
      if (layer?.immune) return `${type}: immune (${escapeChatText(layer.reason || "absorbed all damage")})`;
      if (layer?.skipped) return `${type}: skipped (${escapeChatText(layer.reason || "not applicable")})`;
      if (layer?.overloaded) return `${type}: absorbed ${Number(layer.absorbed || 0)} and overloaded`;
      return `${type}: absorbed ${Number(layer?.absorbed || 0)}`;
    })
    .join("; ");

  const math = absorbed > 0
    ? `${afterArmor} after armor − ${absorbed} defense = ${net} taken`
    : `${net} taken`;

  return `<div style="margin:6px 10px 0;padding:6px 8px;background:#eef7ee;border:1px solid #8bc48b;border-radius:3px;font-size:.9em;color:#1b5e20;">
    <strong>Mitigation:</strong> ${escapeChatText(math)}${layerText ? `<br><span style="color:#2e7d32;">${layerText}</span>` : ""}
  </div>`;
}

async function updateAttackCardDamageAfterAutoApply(message, damageResults, context = {}) {
  const result = Array.isArray(damageResults) ? damageResults[0] : damageResults;
  if (!message || !result) return;

  const net = Number(result.net ?? result.mitigation?.netDamage);
  if (!Number.isFinite(net)) return;

  const afterArmor = Number(context.afterArmor ?? result.mitigation?.rawDamage ?? net) || 0;
  const absorbed = Number(result.absorbed ?? Math.max(0, afterArmor - net)) || 0;

  // No post-armor mitigation occurred; the original attack card is already accurate.
  if (absorbed <= 0 && net === afterArmor) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(message.content || "", "text/html");
  const damageCell = doc.querySelector('[data-faserip-damage-cell="true"]');
  const damageValue = doc.querySelector('[data-faserip-damage-value="true"]');
  const damageLabel = doc.querySelector('[data-faserip-damage-label="true"]');
  const mitigationSlot = doc.querySelector('[data-faserip-mitigation-summary="true"]');

  // Older cards/templates may not have markers. Do not risk mangling arbitrary HTML.
  if (!damageCell || !damageValue || !damageLabel || !mitigationSlot) return;

  const hpBefore = Number(result.hpBefore);
  const hpAfter = Number(result.hpAfter);
  const hpText = Number.isFinite(hpBefore) && Number.isFinite(hpAfter)
    ? ` Health: ${hpBefore} → ${hpAfter}.`
    : "";

  damageValue.textContent = String(net);
  damageLabel.textContent = "DAMAGE TAKEN";
  damageCell.setAttribute("title", `${afterArmor} after armor − ${absorbed} defense = ${net} taken.${hpText}`);
  mitigationSlot.innerHTML = buildMitigationChatSummary(result, context);

  const scope = game.system?.id || "msh-faserip";
  await message.update({
    content: doc.body.innerHTML,
    [`flags.${scope}.netDamage`]: net,
    [`flags.${scope}.absorbedByDefenses`]: absorbed,
    [`flags.${scope}.hpBefore`]: Number.isFinite(hpBefore) ? hpBefore : null,
    [`flags.${scope}.hpAfter`]: Number.isFinite(hpAfter) ? hpAfter : null
  });
}


export class AttackAction extends BaseAction {
  constructor(args) {
    super(args);
    this.src = "hands";     // hands | weapon | natural
    this.pulled = false;
  }

  // attack-action.js (base class)
  getTargetCount() {
    const t = this.targets;
    if (Array.isArray(t)) return t.length;
    if (t && typeof t.size === "number") return t.size; // Set/Map (e.g., User.targets)
    // last resort: live selection
    return Number(game?.user?.targets?.size ?? 1);
  }

  /** First selected token, honoring an override if present */
  _selectPrimaryTarget() {
    const arr = Array.isArray(this?.targets)
      ? this.targets
      : Array.from(game?.user?.targets ?? []);
    return arr[0] ?? null;
  }

  _computeEffectiveRank(baseRank, columnShift=0) {
    return shiftRank(baseRank, columnShift);
  }

  _getAbilityTriplet() {
    const ab = getAbilityInfo(this.actor, this.abilityName);
    const colShift = Number(this.opts.shift ?? 0);
    const effectiveRank = this._computeEffectiveRank(ab.rank, colShift);
    return { base: ab, effectiveRank, columnShift: colShift };
  }

  _getStrength() { return getStrengthInfo(this.actor); }

  async _rollFightingFeat(actor, fightingAbility, intensity, attackCount) {
    // RAW: Auto when Ability 3+ ranks above Intensity (diff >= 3)
    // Optional "Impossible": when Intensity ≥ Ability + 2 ranks (diff <= -2)
    const AUTO_DIFF = 3;

    // Toggle this to enable (RAW optional). If disabled, nothing is "impossible";
    // the required color rule applies (e.g., Red-only).
    const USE_IMPOSSIBLE = true;
    const IMPOSSIBLE_DIFF = -2;

    const availableKarma = actor.system.attributes?.karma?.value || 0;
    
    // Get intensity rank value for comparison
    const intensityIndex = RANKS.indexOf(intensity);
    const fightingIndex  = RANKS.indexOf(fightingAbility.rank);
    const diff = fightingIndex - intensityIndex;

    // Debug logging for multi-attack FEAT
    console.log("[FASERIP] _rollFightingFeat check:", {
      actorName: actor?.name,
      fightingRank: fightingAbility?.rank,
      fightingIndex,
      intensity,
      intensityIndex,
      diff,
      AUTO_DIFF,
      willAutoSucceed: diff >= AUTO_DIFF,
      RANKS_sample: RANKS.slice(0, 12)
    });

    if (diff >= AUTO_DIFF) {
      console.log("[FASERIP] Multi-attack FEAT: AUTOMATIC SUCCESS (diff >= 3)");
      // Full Auto: return immediately. Semi: fall through to dialog which shows "Automatic".
      if (this.opts?.autoApply === true) {
        return { success: true, intensity, roll: null, totalRoll: null, resultColor: "AUTO", cancelled: false, auto: true };
      }
    }
    if (USE_IMPOSSIBLE && diff <= IMPOSSIBLE_DIFF) {
      // Full Auto: return immediately. Semi: fall through to dialog which shows "Impossible".
      if (this.opts?.autoApply === true) {
        return { success: false, intensity, roll: null, totalRoll: null, resultColor: "IMPOSSIBLE", cancelled: false, auto: false };
      }
    }

    if (diff <= IMPOSSIBLE_DIFF) {
      if (this.opts?.autoApply === true) {
        return {
          success: false,
          intensity,
          roll: null,
          totalRoll: null,
          resultColor: "IMPOSSIBLE",
          cancelled: false,
          auto: false
        };
      }
    }

    // otherwise fall through to the normal roll path

    
    // In Full Auto mode, skip dialog and roll automatically with 0 karma
    if (this.opts?.autoApply === true) {
      const roll = await (new Roll("1d100")).evaluate();
      const totalRoll = roll.total;
      
      const effFeatRank = shiftRank(fightingAbility.rank, this.opts?.featCs ?? 0);
      const resultColor = game.msh.rollUniversalTable(effFeatRank, totalRoll);
      const colorLower = resultColor.toLowerCase();
      
      // Determine success based on FEAT intensity comparison rules
      let success = false;
      if (fightingIndex > intensityIndex) {
        success = ["green", "yellow", "red"].includes(colorLower);
      } else if (fightingIndex === intensityIndex) {
        success = ["yellow", "red"].includes(colorLower);
      } else {
        success = colorLower === "red";
      }
      
      // Check if using consolidated chat cards
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) { /* setting not registered yet */ }
      
      // Only show separate messages if NOT using consolidated mode
      if (!useConsolidated) {
        // Show result in chat (auto-rolled)
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `Multiple Attack FEAT: ${intensity} (Auto-rolled)`,
        });
        
        const bgColor = success ? "#e8f5e9" : "#ffebee";
        const borderColor = success ? "#4caf50" : "#f44336";
        const textColor = success ? "#2e7d32" : "#d32f2f";
        
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:3px; padding:8px; margin:5px 0;">
              <div style="color:${textColor}; font-weight:bold; margin-bottom:5px;">
                Multiple Attack FEAT - ${success ? "SUCCESS" : "FAILED"} (Full Auto)
              </div>
              <div style="font-size:0.9em;">
                <div>Fighting: ${fightingAbility.rank} vs Intensity: ${intensity}</div>
                <div>Roll: <span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span></div>
                <div>Result: <strong>${resultColor.toUpperCase()}</strong></div>
                <div style="margin-top:5px; font-style:italic;">
                  ${success 
                    ? `${attackCount} attacks at -1CS each` 
                    : `FEAT failed: Only 1 attack at -3CS`}
                </div>
              </div>
            </div>
          `
        });
      }
      
      return { success, intensity, roll, totalRoll, resultColor, cancelled: false };
    }
    
    // Manual/Semi mode: show dialog
    // Determine required color based on FEAT rules (with auto/impossible)
    let requiredColor;
    {
      const d = fightingIndex - intensityIndex;
      if (d >= AUTO_DIFF)                         requiredColor = "Automatic (no roll)";
      else if (USE_IMPOSSIBLE && d <= IMPOSSIBLE_DIFF) requiredColor = "Impossible (fails)";
      else if (d > 0)                             requiredColor = "Green or better";
      else if (d === 0)                           requiredColor = "Yellow or better";
      else                                        requiredColor = "Red only";
    }
    
    const isAuto       = diff >= AUTO_DIFF;
    const isImpossible = USE_IMPOSSIBLE && diff <= IMPOSSIBLE_DIFF;
    const isPreDetermined = isAuto || isImpossible;

    const fightingShort = RANK_ABBR[fightingAbility.rank] || fightingAbility.rank;

    // Color scheme for the FEAT-status box: green-on-auto, red-on-impossible, neutral otherwise
    const statusBg = isAuto ? '#e8f5e9' : isImpossible ? '#ffebee' : '#fff';
    const statusBorder = isAuto ? '#2e7d32' : isImpossible ? '#b71c1c' : '#b8a868';
    const statusInk = isAuto ? '#1b5e20' : isImpossible ? '#6a0000' : '#1a1a1a';
    const statusText = isAuto ? '✓ Automatic' : isImpossible ? '✗ Impossible' : `Need: ${requiredColor}`;

    const dialogContent = `
    <div class="frp-dlg">
      <!-- Header banner: Actor (Fighting RANK VALUE) ×N Multi-Attack -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Fighting</span>
          <span class="h-stat-rank">${fightingShort} ${fightingAbility.value}</span>
        </span>
        <span class="h-paren">)</span>
        <span class="h-arrow">&times;${attackCount}</span>
        <span class="h-target">Multi-Attack</span>
      </div>

      <!-- FEAT Intensity / requirement readout -->
      <div class="frp-box" style="background:${statusBg};border:1.5px solid ${statusBorder};display:flex;align-items:center;gap:8px;">
        <span class="frp-box-label" style="margin:0;">FEAT Intensity</span>
        <strong style="font-family:'Oswald',sans-serif;font-size:14px;color:#1a1a1a;">${intensity}</strong>
        <span style="margin-left:auto;font-family:'Oswald',sans-serif;font-size:12px;font-weight:700;color:${statusInk};">${statusText}</span>
      </div>

      ${isPreDetermined ? '' : `
      <!-- CS row + notes -->
      <div class="frp-box frp-cs-box" style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="frp-box-label" style="margin:0;color:#6a0000;">CS</span>
          <input type="number" name="shift" value="0" style="width:46px;padding:2px;text-align:center;font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;border:1px solid #888;border-radius:2px;">
          <span style="color:#6a0000;font-weight:700;">&rarr;</span>
          <strong id="shifted-rank-display" style="font-family:'Oswald',sans-serif;font-size:14px;">${fightingAbility.rank}</strong>
          <button type="button" class="cs-reset" style="visibility:hidden;padding:1px 5px;font-size:11px;cursor:pointer;border:1px solid #888;border-radius:2px;background:#eee;" title="Reset to 0">&times;</button>
        </div>
        <input type="text" name="csNotes" placeholder="e.g., Martial Arts B +1" style="width:100%;padding:3px 6px;font-size:12px;border:1px solid #888;border-radius:2px;">
      </div>

      ${generateKarmaControlsHTML(actor, 0)}

      <div class="frp-foot">
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
        </div>
      </div>
      `}
    </div>
    `;
    
    return new Promise((resolve) => {
      showFaseripButtonDialog({
        title: `Multiple Attack FEAT (${attackCount} attacks)`,
        content: dialogContent,
        buttons: {
          roll: {
            label: isAuto ? "Proceed" : isImpossible ? "Acknowledge" : "Roll FEAT",
            callback: async (html) => {
              // Auto/Impossible: no roll needed, resolve immediately
              if (isAuto) {
                return resolve({ success: true, intensity, roll: null, totalRoll: null, resultColor: "AUTO", cancelled: false, auto: true });
              }
              if (isImpossible) {
                return resolve({ success: false, intensity, roll: null, totalRoll: null, resultColor: "IMPOSSIBLE", cancelled: false, auto: false });
              }

              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const cs = Number(html.find('[name="shift"]').val() || 0);
              
              const roll = await (new Roll("1d100")).evaluate();
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `Multiple Attack FEAT: ${intensity}`,
              });
              
              const effFeatRank = shiftRank(fightingAbility.rank, cs);
              let totalRoll = roll.total;
              
              // Apply karma if spending
              if (spendKarma && karmaToSpend > 0) {
                totalRoll = Math.min(100, totalRoll + karmaToSpend);

                const historyEntry = {
                  timestamp: new Date().toISOString(),
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -karmaToSpend,
                  type: "Die Roll",
                  description: `Spent karma on Multiple Attack FEAT`
                };
                const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
                await actor.update({
                  "system.karma.history": currentHistory.concat([historyEntry])
                });
              }
              
              const resultColor = game.msh.rollUniversalTable(effFeatRank, totalRoll);
              const colorLower = resultColor.toLowerCase();
              
              // Determine success using shifted fighting rank so CS actually affects outcome
              const shiftedFightingIndex = RANKS.indexOf(effFeatRank);
              let success = false;
              if (shiftedFightingIndex > intensityIndex) {
                success = ["green", "yellow", "red"].includes(colorLower);
              } else if (shiftedFightingIndex === intensityIndex) {
                success = ["yellow", "red"].includes(colorLower);
              } else {
                success = colorLower === "red";
              }
              
              // Check if using consolidated chat cards
              let useConsolidated = false;
              try {
                useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
              } catch (_e) { /* setting not registered yet */ }
              
              // Only post separate chat result if NOT using consolidated mode
              if (!useConsolidated) {
                const bgColor = success ? "#e8f5e9" : "#ffebee";
                const borderColor = success ? "#4caf50" : "#f44336";
                const textColor = success ? "#2e7d32" : "#d32f2f";
                
                await ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({ actor }),
                  content: `
                    <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:3px; padding:8px; margin:5px 0;">
                      <div style="color:${textColor}; font-weight:bold; margin-bottom:5px;">
                        Multiple Attack FEAT - ${success ? "SUCCESS" : "FAILED"}
                      </div>
                      <div style="font-size:0.9em;">
                        <div>Fighting: ${fightingAbility.rank}${cs ? ` (${cs > 0 ? '+' : ''}${cs}CS → ${effFeatRank})` : ''} vs Intensity: ${intensity}</div>
                        <div>Roll: <span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>${karmaToSpend ? ` + ${karmaToSpend} Karma = ${totalRoll}` : ''}</div>
                        <div>Result: <strong>${resultColor.toUpperCase()}</strong></div>
                        <div style="margin-top:5px; font-style:italic;">
                          ${success 
                            ? `${attackCount} attacks at -1CS each` 
                            : `FEAT failed: Only 1 attack at -3CS`}
                        </div>
                      </div>
                    </div>
                  `
                });
              }
              
              resolve({ success, intensity, roll, totalRoll, resultColor, cancelled: false });
            }
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve({ success: false, cancelled: true })
          }
        },
        default: "roll",
        render: (html) => {
          if (isPreDetermined) return; // No controls to wire up
          setupKarmaControlHandlers(html);
          // Live CS rank display
          html.find('[name="shift"]').on("input", function() {
            const cs = Number(this.value) || 0;
            html.find("#shifted-rank-display").text(shiftRank(fightingAbility.rank, cs));
            html.find(".cs-reset").css("visibility", cs !== 0 ? "visible" : "hidden");
          });
          html.find(".cs-reset").on("click", function() {
            html.find('[name="shift"]').val(0).trigger("input");
          });
        }
      });
    });
  }

  /**
   * Intensity-on-hit for weapons carrying an on-hit Intensity effect
   * (stun baton, Stun Pistol/Rifle/Cannon, and any weapon with an Intensity
   * Rank + Apply effect). On a hit, the target rolls an Endurance FEAT vs
   * system.intensityRank, gated by required color (Ability>Intensity -> green,
   * = -> yellow, < -> red). On failure the configured effect
   * (system.intensityEffect, default "stunned") is applied for
   * system.intensityDuration (default 1d10). FEAT-intensity attack: ignores
   * Body Armor (RAW). Called only when no other post-hit callback applies.
   */
  async _applyIntensityOnHit({ targetActor, color, weapon, actor }) {
    if (!targetActor) return;
    if (String(color || "white").toLowerCase() === "white") return; // miss
    const sys = weapon?.system || {};
    const intensityRank = sys.intensityRank;
    if (!intensityRank) return;

    const effect = sys.intensityEffect || "stunned";
    const desc = sys.intensityDescription || "";

    const { getAbilityInfo } = await import("./action-utils.js");
    const { requiredColorForIntensity } = await import("./breaking-feat.js");
    const { rollUniversalTable } = await import("../dice/universal-table.js");
    const { applyIntensityEffect } = await import("../effects/effect-engine.js");

    // Resolve duration (default 1d10): plain number used as-is, dice expression
    // rolled, anything unparseable falls back to 1d10. Minimum 1 round.
    let rounds = 1;
    const durRaw = String(sys.intensityDuration || "1d10").trim();
    try {
      if (/^\d+$/.test(durRaw)) rounds = Number(durRaw);
      else rounds = (await (new Roll(durRaw)).evaluate()).total;
    } catch {
      rounds = (await (new Roll("1d10")).evaluate()).total;
    }
    rounds = Math.max(1, rounds);

    const endInfo = getAbilityInfo(targetActor, "endurance");
    const endRank = endInfo?.rank || "Typical";
    const requiredColor = requiredColorForIntensity(endRank, intensityRank);

    const r = await (new Roll("1d100")).evaluate();
    const featColor = String(
      (game.msh?.rollUniversalTable ?? rollUniversalTable)(endRank, Math.min(100, r.total)) || "white"
    ).toLowerCase();
    const order = { white: 0, green: 1, yellow: 2, red: 3 };
    const resisted = (order[featColor] ?? 0) >= (order[requiredColor] ?? 1);

    let line;
    if (resisted) {
      line = `<div style="color:#2e7d32;font-weight:bold;">${targetActor.name} resists.</div>`;
    } else {
      let applied = "";
      try {
        applied = await applyIntensityEffect(targetActor, effect, { rounds, originUuid: actor?.uuid, desc });
      } catch (e) {
        console.error("[FASERIP ERROR] intensity-on-hit applyIntensityEffect failed:", e);
      }
      line = `<div style="color:#d32f2f;font-weight:bold;">${targetActor.name} \u2014 ${applied || "affected"}.</div>`;
    }

    const descLine = desc ? `<div style="font-style:italic;color:#555;font-size:.85em;margin-bottom:2px;">${desc}</div>` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div style="background:#e3f2fd;border:1px solid #1565c0;border-radius:3px;padding:6px 8px;margin:4px 0;">
        <div style="font-weight:bold;color:#0d47a1;margin-bottom:3px;">${weapon?.name || "Weapon"} \u2014 Intensity (on hit)</div>
        ${descLine}
        <div style="font-size:.85em;">Endurance FEAT (${endRank}) vs ${intensityRank} Intensity \u2014 need ${requiredColor.toUpperCase()}: rolled ${r.total} \u2192 <b>${featColor.toUpperCase()}</b></div>
        ${line}
      </div>`
    });
  }

  /**
   * Core single-attack execution used by all attack types.
   * Handles roll, damage calc, chat card, and optional auto-apply.
   */
  async _executeSingleAttack({
    choice,
    actor,
    ability,
    actionType,
    actionName,
    effects,
    damageType = "physical-blunt",
    rawDamage = 0,
    damageNote = "",
    sourceName = "Attack",
    attackForm = "blunt",
    breakingFeat = null,
    targetCount = 1,
    attackNumber = 1,
    totalAttacks = 1,
    postHitCallback = null
  }) {
    // === EARLY WEAPON CHECK: Abort if firearm is empty ===
    const weapon = choice?.weapon
      ?? (choice?.weaponId ? this.actor.items.get(choice.weaponId) : null)
      ?? null;

    if (weapon?.system) {
      const sys = weapon.system;
      const isFirearm =
        String(sys.weaponType || "").toLowerCase() === "firearm" ||
        String(sys.weaponType || "").toLowerCase() === "shooting" ||
        String(actionType).toLowerCase() === "shooting";

      if (isFirearm) {
      // Parse first numeric in a value
      const toNum = (v) => {
        if (v == null || v === "") return NaN;
        if (typeof v === "number") return v;
        const m = String(v).match(/-?\d+(\.\d+)?/);
        return m ? Number(m[0]) : NaN;
      };

      // Find first valid ammo field
      const current = [
        sys.ammo?.current,
        sys.ammo?.value,
        sys.shotsRemaining,
        sys.shots,
        sys.uses?.value,
        sys.clip,
        sys.magazine
      ].map(v => toNum(v)).find(n => Number.isFinite(n));

      if (Number.isFinite(current) && current <= 0) {
          // ─── PLAY EMPTY-CLICK SFX ───
          const CLICK_SFX = "systems/msh-faserip/audio/sfx/weapon-empty.mp3";
          try {
            if (game.msh?.playCombatSFX) {
              await game.msh.playCombatSFX({
                item: weapon,
                actionType: "shooting",
                outOfAmmo: true,
                sourceName: weapon?.name ?? "Weapon (empty)"
              });
            }
          } catch (e) {
            console.warn("FASERIP | Could not play empty click SFX:", e);
          }

          ui.notifications?.warn(`${weapon?.name ?? "Weapon"}: out of ammo`);

          // (Optional) small chat card so players see the click in the log
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background:#fff;border:1px solid #bbb;border-radius:3px;padding:6px 8px;">
                <b>${actor.name}</b> pulls the trigger — <i>click!</i> <span style="color:#888">(${weapon.name} empty)</span>
                <div style="margin-top:6px;">
                  <a class="faserip-reload-weapon"
                          data-item-id="${weapon.id}"
                          data-actor-id="${actor.id}"
                          data-token-id="${actor.token?.id ?? actor.getActiveTokens?.()?.[0]?.id ?? ''}"
                          style="display:inline-block;background:#8b0000;color:#fff;border:none;border-radius:3px;padding:3px 10px;cursor:pointer;font-size:.85em;text-decoration:none;">
                    ↺ Reload ${weapon.name}
                  </a>
                </div>
              </div>
            `
          });

          return; // abort this attack before any rolls/effects
        }
      }
    }
    // ANCHOR: early-weapon-resolve

    const actionLabel = `${actionName}${targetCount > 1 ? ` (${targetCount} targets)` : ''}`;

    // === EFFECT MODIFIERS: Apply attack/defense shifts from active effects ===
    const attackerMods = canActorAct(actor);
    if (!attackerMods.canAct) {
      ui.notifications?.warn(`${actor.name}: ${attackerMods.reason}`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background:#fff;border:1px solid #e57373;border-radius:3px;padding:6px 8px;">
            <b>${actor.name}</b> cannot act — ${attackerMods.reason}
          </div>
        `
      });
      return; // abort attack
    }
    
    // === CHECK FOR EVADING: Cannot attack while evading ===
    const evadingEffect = actor.effects.find(e => 
      e.flags?.["msh-faserip"]?.isEvading && !e.disabled
    );
    if (evadingEffect) {
      const evadeTarget = evadingEffect.flags?.["msh-faserip"]?.evadedTarget || "an opponent";
      ui.notifications?.warn(`${actor.name} is evading and cannot attack this round!`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background:#fff;border:1px solid #ff9800;border-radius:3px;padding:6px 8px;">
            <b>${actor.name}</b> cannot attack — currently evading ${evadeTarget}
            <div style="font-size:.85em;color:#666;margin-top:4px;">The evading character makes no attacks that round.</div>
          </div>
        `
      });
      return; // abort attack
    }
    
    // Get attacker's attack shift from effects (with breakdown)
    const attackerShiftData = getAttackShiftBreakdown(actor);
    let attackerShift = attackerShiftData.total;
    const attackerEffects = [...attackerShiftData.breakdown];  // Copy so we can add to it
    
    // Get defender's defense shift (if single target)
    // Prefer specificTarget (set during multi-attack loops) over live game.user.targets
    let defenderShift = 0;
    let defenderEffects = [];
    const primaryTarget = choice?.specificTarget ?? this._selectPrimaryTarget();
    debugLog(`_executeSingleAttack: specificTarget=${choice?.specificTarget?.name ?? "NONE"}, primaryTarget=${primaryTarget?.name ?? "NONE"}, attackNumber=${attackNumber ?? "?"}`);
    const defenderActor = primaryTarget?.actor ?? null;
    
    // Check for evasion bonus BEFORE calculating effective rank
    // This applies the +CS from a previous successful evasion (yellow/red result)
    let evasionBonusData = { hasBonus: false, bonusCS: 0, effectId: null, targetName: null };
    if (primaryTarget) {
      evasionBonusData = getEvasionAttackBonus(actor, primaryTarget);
      if (evasionBonusData.hasBonus && evasionBonusData.bonusCS > 0) {
        attackerShift += evasionBonusData.bonusCS;
        attackerEffects.push({
          name: `Evasion Bonus vs ${evasionBonusData.targetName || 'target'}`,
          shift: evasionBonusData.bonusCS
        });
        console.log("[FASERIP] Evasion bonus added to attack shift:", {
          attacker: actor.name,
          target: primaryTarget.name,
          bonusCS: evasionBonusData.bonusCS,
          newAttackerShift: attackerShift
        });
      }
    }
    
    if (defenderActor) {
      // Check if non-adjacent attack — dodge applies to ranged, charging, and throwing but NOT adjacent slugfest/wrestling
      // attackForm can be "blunt"/"edged" for both melee and throwing, so check actionType too
      const atLower = String(actionType).toLowerCase();
      const afLower = String(attackForm).toLowerCase();
      const isRanged = ["shooting", "energy", "force"].includes(afLower) ||
                       ["charging", "throwing-blunt", "throwing-edged"].includes(atLower);
      const defenderShiftData = getDefenseShiftBreakdown(defenderActor, isRanged);
      defenderShift = defenderShiftData.total;
      defenderEffects = defenderShiftData.breakdown;
    }
    
    // Total effect shift (attacker bonus + defender penalty)
    // Positive defenderShift = harder to hit, so we subtract it
    const effectShift = attackerShift - defenderShift;

    // Apply column shift (manual + range/obstacle/movement + effect modifiers)
    // Ranged actions set choice.totalShift which already includes manual + range + obstacle + movement.
    // Melee actions only set choice.shift (manual CS). Use totalShift when present.
    let effectiveRank = ability.rank;
    const manualShift = (choice.totalShift != null) ? choice.totalShift : (choice.shift || 0);
    const totalShift = manualShift + effectShift;
    if (totalShift) effectiveRank = shiftRank(effectiveRank, totalShift);
    
    // Log effect modifier application
    if (effectShift !== 0) {
      debugLog("Effect modifiers applied to attack:", {
        attacker: actor.name,
        attackerShift,
        defender: defenderActor?.name || "none",
        defenderShift,
        totalEffectShift: effectShift,
        manualShift,
        finalShift: totalShift,
        evasionBonus: evasionBonusData.hasBonus ? evasionBonusData.bonusCS : 0
      });
    }

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    // Roll + karma (two-phase system: spendKarma flag triggers decision dialog after roll)
    // inlineRoll suppresses separate roll chat message when consolidated is enabled
    const { roll, cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(
      actor, actionLabel, choice.karma || 0, null,
      { spendKarma: choice.spendKarma, rank: effectiveRank, skipDice: choice.skipDice, inlineRoll: useConsolidated }
    );

    // Build inline roll display if consolidated mode is enabled
    const inlineRollHtml = useConsolidated ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal) : "";

    // Check if manual mode -- return if true
    const isManualMode = this.opts?.mode === "manual";
    
    // Continue with normal resolution for Semi/Full modes...
    // Resolve color (always, even in manual mode)
    //let color = rollUniversalTable(effectiveRank, cappedTotal);
    //const colorLower = String(color || "white").toLowerCase();
    // Resolve color (always, even in manual mode)
    let color = universalColor(effectiveRank, cappedTotal);
    const colorLower = String(color || "white").toLowerCase();

    // Apply result cap if pulling punch
    if (choice.resultCap && choice.resultCap !== 'none') {
      const capOrder = ['white', 'green', 'yellow', 'red'];
      const currentIndex = capOrder.indexOf(colorLower);
      const capIndex = capOrder.indexOf(choice.resultCap);
      if (currentIndex > capIndex) {
        color = choice.resultCap;
      }
    }

    // ── Aim tactic (RAW Tactics — Shooting maneuvers) ─────────────────
    //  • Neutralize: Kill downgrades to Bullseye (Red→Yellow) — but only
    //    when the table's red IS a Kill (Shooting/Energy). On Force the
    //    red is Stun, so per RAW ("Kill result is treated as a Bullseye")
    //    the downgrade does NOT apply — a Force red still resolves as Stun
    //    with no disarm. Damage applies normally on Yellow; disarm chat
    //    note posted when final color is Yellow.
    //    (Green still lands damage but no disarm; White still misses.)
    //  • Stun (Shooting/Energy only — Force red is already Stun):
    //    Bullseye → Stun. Effect label override + stun chip on Yellow.
    //    Kill (Red) still resolves as Kill per RAW.
    const aimMode = String(choice.aimMode || "none").toLowerCase();
    const redIsKill = String(effects?.red || "").toLowerCase() === "kill";
    if (aimMode === "neutralize" && redIsKill && String(color).toLowerCase() === "red") {
      color = "yellow";
    }

    // Effective effects table — Stun aim swaps Yellow's effect Bullseye → Stun
    const effectiveEffects = (aimMode === "stun")
      ? { ...effects, yellow: "Stun" }
      : effects;

    // Use the (possibly capped) color for effect lookup
    const effectColorLower = String(color || "white").toLowerCase();
    const effectResult = effectiveEffects[effectColorLower] || color;
    const { bg, fg } = bannerColors(effectColorLower);
    const isHit = effectColorLower !== 'white';

    // Create a chat card for each target
    let targetList;
    if (choice?.specificTarget) {
      // Single specific target (for multi-attack distribution)
      targetList = [choice.specificTarget];
    } else {
      // All currently selected targets
      const selected = Array.from(game.user?.targets ?? []);
      targetList = selected.length > 0 ? selected : [null]; // null for untargeted attacks
    }

    debugLog("FASERIP | _executeSingleAttack targetList:", targetList?.map(t => t?.name ?? "untargeted"));

    // Track if any target was actually hit (considering evasion) for SFX purposes
    let anyTargetActuallyHit = false;

    for (const target of targetList) {
      const targetActor = target?.actor;
      const targetName = target?.name || "Unknown Target";

      // ================================================================
      // EVASION CHECK: See if target successfully evaded this attack
      // ================================================================
      let targetEffectColor = effectColorLower;  // May be modified by evasion
      let targetIsHit = isHit;                   // May be modified by evasion
      let evasionNote = "";
      
      // Get current combat round for timing checks
      const currentRound = game.combat?.round || 0;
      
      if (targetActor) {
        // DEBUG: Log all evading effects on target, including disabled ones
        const allEvadeEffects = targetActor.effects.filter(e => 
          e.flags?.["msh-faserip"]?.isEvading
        );
        if (allEvadeEffects.length > 0) {
          console.log("[FASERIP] Evasion check on target:", {
            target: targetName,
            attackRollColor: effectColorLower,
            currentRound,
            effectsFound: allEvadeEffects.map(e => ({
              name: e.name,
              disabled: e.disabled,
              flags: e.flags?.["msh-faserip"],
              durationRemaining: e.duration?.remaining,
              isTemporary: e.isTemporary
            }))
          });
        }
        // Check for evasion effect on the target (did they evade US?)
        const evadeEffect = targetActor.effects.find(e => 
          e.flags?.["msh-faserip"]?.isEvading && !e.disabled
        );
        
        if (evadeEffect) {
          const evadeFlags = evadeEffect.flags?.["msh-faserip"] || {};
          const evadeCreatedRound = evadeFlags.createdRound || 0;
          
          // Evasion only blocks attacks in the SAME round it was made
          const isSameRound = (currentRound === evadeCreatedRound);
          console.log("[FASERIP] Evasion conditions:", {
            isSameRound, evadeCreatedRound, currentRound,
            evadeSuccessful: evadeFlags.evadeSuccessful,
            autoHit: evadeFlags.autoHit,
            attackColor: effectColorLower,
            wouldAutoHit: evadeFlags.autoHit && effectColorLower === "white"
          });
          
          if (isSameRound) {
            // Check if evasion was successful (green/yellow/red result on evade roll)
            if (evadeFlags.evadeSuccessful) {
              // Successful evasion: attack misses regardless of roll
              // Keep targetEffectColor as the real roll result for display clarity
              targetIsHit = false;
              evasionNote = `<div style="padding:4px 8px;margin:4px 0;background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;color:#2e7d32;font-weight:bold;text-align:center;">EVADED — Target dodged the attack!</div>`;
              console.log("[FASERIP] Evasion success:", { 
                attacker: actor.name, 
                target: targetName, 
                evadedTarget: evadeFlags.evadedTarget,
                originalColor: effectColorLower 
              });
            } else if (evadeFlags.autoHit && effectColorLower === "white") {
              // Failed evasion (white on evade roll): attacker gets at least green
              targetEffectColor = "green";
              targetIsHit = true;
              evasionNote = `<div style="padding:4px 8px;margin:4px 0;background:#ffecb3;border:1px solid #ffc107;border-radius:3px;color:#f57f17;font-style:italic;text-align:center;">Evasion failed: Auto-Hit (White → Green)</div>`;
              console.log("[FASERIP] Evasion auto-hit:", { 
                attacker: actor.name, 
                target: targetName,
                originalColor: effectColorLower 
              });
            } else if (evadeFlags.autoHit && effectColorLower !== "white") {
              // Failed evasion auto-hit is active, but attack already rolled green+ naturally
              evasionNote = `<div style="padding:4px 8px;margin:4px 0;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;color:#e65100;font-style:italic;text-align:center;font-size:.9em;">Evasion failed (auto-hit) — attack hit naturally (${effectColorLower})</div>`;
              console.log("[FASERIP] Evasion auto-hit irrelevant (attack already hit):", {
                attacker: actor.name, target: targetName, attackColor: effectColorLower
              });
            }
          }
        }
        
        // If we have an evasion bonus that was applied earlier (to the attack shift),
        // show a note and consume it now that the attack has resolved
        if (evasionBonusData.hasBonus && evasionBonusData.bonusCS > 0) {
          evasionNote += `<div style="padding:4px 8px;margin:4px 0;background:#e3f2fd;border:1px solid #1976d2;border-radius:3px;color:#0d47a1;font-style:italic;text-align:center;">Evasion Bonus: +${evasionBonusData.bonusCS}CS vs ${evasionBonusData.targetName || 'evaded target'}</div>`;
          
          // Consume the bonus (mark as used) - only consume once for the first target
          if (!evasionBonusData.consumed) {
            await consumeEvasionAttackBonus(actor, evasionBonusData.effectId);
            evasionBonusData.consumed = true;
            console.log("[FASERIP] Consumed evasion attack bonus after attack resolved:", {
              attacker: actor.name,
              target: targetName,
              bonusCS: evasionBonusData.bonusCS
            });
          }
        }
      }

      // Track if this target was actually hit (for SFX purposes)
      if (targetIsHit) {
        anyTargetActuallyHit = true;
      }

      // Recalculate display values based on modified result (after evasion)
      // These may differ from the original roll if evasion blocked or bonus upgraded
      const targetBg = bannerColors(targetEffectColor).bg;
      const targetFg = bannerColors(targetEffectColor).fg;
      const targetEffectResult = effectiveEffects[targetEffectColor] || targetEffectColor;

      // Calculate armor and penetrating damage for this specific target
     let penetratingDamage = 0;
     let armorData = null;
     let armorValue = 0;
     let isBorderline = false;
     if (targetIsHit && rawDamage > 0) {
       if (targetActor) {
         armorData = getBodyArmorValues(targetActor, damageType, {
           ignoresNaturalArmor: !!choice?.ignoresNaturalArmor,
           ignoresArtificialArmor: !!choice?.ignoresArtificialArmor,
           bypassForceField: !!choice?.bypassForceField
         });
         // Ensure numbers whether rawDamage arrived as "20" or 20
         const rd = Number(rawDamage) || 0;
         const _apFlat = Number(choice?.armorPiercing || 0);
         const _apCS   = Number(choice?.armorPiercingCS || 0);
         const _apMode = choice?.apMode || "value";
         const _baseArmor = Number(armorData?.applicable) || 0;
         if (_apMode === "cs" && _apCS > 0 && _baseArmor > 0) {
           const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
           let _i = _RV.findIndex(v => v >= _baseArmor);
           if (_i < 0) _i = _RV.length - 1;
           if (_i > 0 && _RV[_i] > _baseArmor) _i--;
           armorValue = _RV[Math.max(0, _i - _apCS)];
         } else {
           armorValue = Math.max(0, _baseArmor - _apFlat);
         }
         penetratingDamage = Math.max(0, rd - armorValue);
         // Borderline: armor exactly equals damage (effects can still apply per rules)
         //isBorderline = (rd > 0 && rd === armorValue);
         isBorderline = (rd > 0 && rd === armorValue && !armorData?.isForceField);
       } else {
         penetratingDamage = Number(rawDamage) || 0;
         }
       }

      // Apply damage cap from pull punch
      if (choice.pulledDamage > 0 && choice.pulledDamage < penetratingDamage) {
        penetratingDamage = choice.pulledDamage;
      }

      const afterArmor = penetratingDamage;

      // Calculate breaking feat for this attack - include target material for auto-population
      // Show button when weapon material < target material (regardless of penetrating damage)
      let currentBreakingFeat = null;
      if (targetIsHit && breakingFeat && targetActor) {
        const RANKS = [
          "Shift-0","Feeble","Poor","Typical","Good","Excellent",
          "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
          "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
        ];
        const RANK_VALUES = [0, 1, 3, 5, 8, 16, 26, 36, 46, 63, 88, 150, 250, 500, 1000, 3000, 5000, Infinity];
        
        // Get target's armor rank for the Breaking FEAT dialog
        const isEnergy = armorData?.isEnergyDamage;
        let targetMatRank = isEnergy ? armorData?.energyRank : armorData?.physicalRank;
        
        // Fallback: if no rank string, derive from numeric armor value
        if (!targetMatRank && armorData) {
          const armorVal = isEnergy ? armorData.energy : armorData.physical;
          if (armorVal > 0) {
            // Find closest rank for this armor value
            for (let i = RANK_VALUES.length - 1; i >= 0; i--) {
              if (armorVal >= RANK_VALUES[i]) {
                targetMatRank = RANKS[i];
                break;
              }
            }
          }
        }
        
        const weaponIdx = RANKS.indexOf(breakingFeat.weaponMat);
        const targetIdx = RANKS.indexOf(targetMatRank);
        
        console.log("[FASERIP] Breaking FEAT check:", {
          weaponMat: breakingFeat.weaponMat,
          weaponIdx,
          targetMatRank,
          targetIdx,
          wouldShow: weaponIdx !== -1 && targetIdx !== -1 && weaponIdx < targetIdx
        });
        
        // Only show Breaking FEAT if weapon material < target material
        if (weaponIdx !== -1 && targetIdx !== -1 && weaponIdx < targetIdx) {
          currentBreakingFeat = {
            ...breakingFeat,
            targetMat: targetMatRank || ""
          };
        }
      } else if (breakingFeat) {
        console.log("[FASERIP] Breaking FEAT skipped:", {
          hasBreakingFeat: !!breakingFeat,
          hasTargetActor: !!targetActor,
          breakingFeat
        });
      }

      // Build actions box ONLY if not manual mode
      // Follow-ups must match the Universal Table per action type.
      //  • Blunt/Charging:  Yellow→Slam, Red→Stun
      //  • Edged/Throwing-Edged: Yellow→Stun, Red→Kill (Kill handled elsewhere)
      //  • Shooting/Energy: Yellow→Bullseye (no Slam/Stun), Red→Kill
      //  • Force:           Yellow→Bullseye (no Slam),   Red→Stun
      //  • Throwing-Blunt:  Yellow→Hit (no follow-up),   Red→Stun
      let showSlam = false;
      let showStun = false;
      let showKill = false;

      // Vehicles have no Endurance — Slam/Stun/Kill effects do not apply
      const targetIsVehicle = targetActor?.type === "vehicle";

      switch (String(actionType)) {
        case "blunt-attack":
        case "charging":
          showSlam = (targetEffectColor === "yellow");
          showStun = (targetEffectColor === "red");
          break;

        case "edged-attack":
        case "throwing-edged":
          showStun = (targetEffectColor === "yellow");
          showKill = (targetEffectColor === "red");    // ← Kill on red
          break;

        case "shooting":
        case "energy":
          // Yellow = Bullseye → no Slam/Stun check; Red = Kill.
          // Aim=stun (RAW Tactics): Yellow Bullseye treated as Stun → emit
          // stun chip; existing stun-FEAT pipeline uses dmgThrough as intensity.
          showStun = (aimMode === "stun" && targetEffectColor === "yellow");
          showKill = (targetEffectColor === "red");    // ← Kill on red
          break;

        case "force":
          // Yellow = Bullseye → no Slam; Red = Stun
          showStun = (targetEffectColor === "red");
          break;

        case "throwing-blunt":
          // Yellow = Hit; Red = Stun
          showStun = (targetEffectColor === "red");
          break;

        default:
          // No generic follow-ups
          break;
      }

      // Vehicles have no Endurance — suppress all combat effect checks
      if (targetIsVehicle) {
        showSlam = false;
        showStun = false;
        showKill = false;
      }

      // Rubber shot: ignore Slam results per ammo rules
      const ammoVariant = choice?.variantType || "standard";
      if (ammoVariant === "rubber" && showSlam) {
        showSlam = false;
      }

      // Per RAW: a blow that drops the target to 0 Health knocks them
      // unconscious (death save, or Four-Color knockout) — the Stun result
      // is the same "Unconscious 1-10 rounds" outcome, so don't stack it on
      // top. Slam still applies (an unconscious body is still knocked back).
      if (showStun && targetIsHit && targetActor) {
        const _curHealth = Number(targetActor?.system?.attributes?.health?.value);
        if (Number.isFinite(_curHealth) && (_curHealth - afterArmor) <= 0) showStun = false;
      }

      // Build ammo variant note for chat card
      const variantLabel = {
        rubber: "Rubber Shot (blunt effects, no Slam)",
        mercy: "Mercy Shot (Rm KO drug)",
        explosive: "Explosive Shot (2× damage)",
        heatSeeker: "Heat-Seeker (no range penalty)",
        canister: "Canister Shot (area effect)",
        ap: "AP Shot (−2CS armor)"
      }[ammoVariant] || "";
      const variantBadge = variantLabel
        ? `<div style="padding:2px 8px;margin:2px 10px;font-size:.8em;color:#1565c0;"><i class="fas fa-crosshairs"></i> ${variantLabel}</div>`
        : "";

      // Aim tactic badge — shows declared intent (Neutralize/Stun) on the
      // chat card so the table can see what the attacker was trying to do
      // even when the roll didn't trigger the reinterpretation (e.g. Green
      // Hit on an aim=stun shot is just a normal Hit; the badge still flags
      // the declared intent for GM karma/morality adjudication).
      const aimLabel = aimMode === "neutralize" ? "Aim: Neutralize (disarm)"
                     : aimMode === "stun"       ? "Aim: Stun"
                     : "";
      const aimBadge = aimLabel
        ? `<div style="padding:2px 8px;margin:2px 10px;font-size:.8em;color:#c62828;"><i class="fas fa-crosshairs"></i> ${aimLabel}</div>`
        : "";

      // Talent source badge — when the attack was launched from the
      // talents tab (via .talent-roll click → rollTalent → ActionDispatcher),
      // surface the talent name on the chat card so the table can see what
      // talent was being exercised. Useful for MA-A/D/E in particular since
      // their non-roll benefits don't otherwise show up in the card.
      const talentSourceName = this.opts?.talentName || "";
      const talentBadge = (this.opts?.fromTalent && talentSourceName)
        ? `<div style="padding:2px 8px;margin:2px 10px;font-size:.8em;color:#534AB7;"><i class="fas fa-bolt"></i> Source: ${talentSourceName}</div>`
        : "";

      // MA-D engaged badge — when the player armed the bypass toggle in
      // the blunt-attack dialog (study complete on this target). For now
      // this badge is informational only; the actual Stun/Slam armor
      // bypass mechanic ships in the next slice. Renders in teal to
      // visually echo the dialog's State-3 styling.
      const maDEngaged = choice?.maDEngaged === true;
      const maDBadge = maDEngaged
        ? `<div style="padding:2px 8px;margin:2px 10px;font-size:.8em;color:#0F6E56;"><i class="fas fa-bullseye"></i> MA-D engaged — armor bypass for Stun/Slam <span style="color:#888;font-size:.85em;">(mechanic next slice)</span></div>`
        : "";

      // Kill result karma warning for attack card
      const targetIsRobot = targetActor?.system?.origin === "Robot";
      const killWarning = (showKill && !targetIsRobot) ? `<div style="padding:4px 8px;margin:4px 10px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:.85em;color:#e65100;text-align:center;">Kill result — hero loses ALL Karma if target dies</div>` : (showKill && targetIsRobot) ? `<div style="padding:4px 8px;margin:4px 10px;background:#e3f2fd;border:1px solid #90caf9;border-radius:3px;font-size:.85em;color:#1565c0;text-align:center;">Kill result — target is a Robot/construct. No Karma loss for attacker.</div>` : "";

      // Aim=neutralize: disarm note when shot lands on Bullseye (RAW Tactics).
      // Damage still applies normally; the disarm itself is GM-adjudicated.
      const disarmNote = (aimMode === "neutralize" && targetIsHit && targetEffectColor === "yellow")
        ? `<div style="padding:4px 8px;margin:4px 10px;background:#fff8e1;border:1px solid #ffa726;border-radius:3px;font-size:.85em;color:#bf360c;text-align:center;"><i class="fas fa-crosshairs"></i> Shoot to Neutralize — damage applies normally; target's weapon knocked from hand (GM adjudicates disarm details)</div>`
        : "";

      // Calculate autoSave before using it
      const { resolveCombatMode } = await import("./action-dispatcher.js");
      const autoSave = (typeof resolveCombatMode === "function" && targetActor)
        ? (resolveCombatMode(targetActor) === "full")
        : false;

      // Blunt cards use the quieter (maroon-on-light) consequence bars; the
      // legacy energy/edged/shooting cards keep the loud filled bars for now.
      const mutedConsequence = REDESIGNED_ATTACK_FORMS.has(String(actionType).toLowerCase());

      // Inline Breaking FEAT for full-auto consolidated cards
      let inlineBreakingHtml = "";
      if (useConsolidated && !isManualMode && this.opts?.autoApply && currentBreakingFeat) {
        try {
          const breakResult = await executeBreakingFeat({
            weaponMatRank: currentBreakingFeat.weaponMat,
            targetMatRank: currentBreakingFeat.targetMat,
            weaponName: currentBreakingFeat.weaponName,
            itemUuid: currentBreakingFeat.itemUuid,
            actor,
            postChat: false
          });
          if (breakResult) {
            inlineBreakingHtml = buildCollapsibleBreakingSection(breakResult, { muted: mutedConsequence });
            currentBreakingFeat = null;
          }
        } catch (e) {
          console.error("[FASERIP ERROR] Inline Breaking FEAT failed:", e);
        }
      }

      // Show actions box if there are effects to apply OR a Breaking FEAT check is needed
      const hasEffects = canEffectsApply(penetratingDamage, { borderline: isBorderline });
      const needsActionsBox = !isManualMode && targetIsHit && targetActor && (hasEffects || currentBreakingFeat);
      
      const actions = needsActionsBox
        ? buildActionsBox({
            showSlam: hasEffects && showSlam && !targetIsVehicle,
            showStun: hasEffects && showStun && !targetIsVehicle,
            showKill: hasEffects && showKill && !targetIsVehicle,
            pulled: choice.resultCap !== 'none' || (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage),
            breakingFeat: currentBreakingFeat,
            actorUuid: actor.uuid,
            targetUuid: target?.document?.uuid ?? target?.actor?.uuid,
            damage: Number(penetratingDamage) || 0,
            prefillData: {
              dmgThrough: Number(penetratingDamage) || 0,
              attackerStrength: getStrengthInfo(actor)?.value || 10,
              attackerStrengthRank: getStrengthInfo(actor)?.rank || "Typical",
              attackerName: actor.name
            },
            attackForm,
            damageType,
            bypassArmor: true,  // damage is already post-armor (penetratingDamage)
            armorPiercing: Number(choice?.armorPiercing || 0),
            armorPiercingCS: Number(choice?.armorPiercingCS || 0),
            apMode: choice?.apMode || "value",
            bypassForceField: !!choice?.bypassForceField,
            ignoresNaturalArmor: !!choice?.ignoresNaturalArmor,
            ignoresArtificialArmor: !!choice?.ignoresArtificialArmor,
            autoApply: !!this.opts?.autoApply,
            autoSave: false,  // prevent chat button duplicates
            sourceItemUuid: choice?.weapon?.uuid || "",
          })
        : "";

      // Build inline FEAT display if multi-attack FEAT was performed and consolidated mode is enabled
      const multiAttackFeatHtml = (useConsolidated && choice?.multiAttackFeatResult) 
        ? buildInlineFeatDisplay(
            choice.multiAttackFeatResult, 
            `Multi-Attack FEAT (${choice.multiAttackFeatResult.attackCount} attacks)`
          )
        : "";

      // ============================================
      // INLINE SLAM/STUN CHECKS (for consolidated chat cards)
      // ============================================
      let inlineSlamHtml = "";
      let inlineStunHtml = "";
      let inlineSlamResult = null;
      let inlineStunResult = null;
      
      // Get inline check results if: consolidated mode + full auto + effect applies + has target
      // Effects will be applied by the regular auto-trigger block, we just capture the results for display
      if (useConsolidated && !isManualMode && this.opts?.autoApply && canEffectsApply(penetratingDamage, { borderline: isBorderline }) && targetActor && !targetIsVehicle) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        
        // Get attacker strength info for Slam checks
        const attackerStrInfo = getStrengthInfo(actor);
        const inlineAttackerStrength = attackerStrInfo?.value || 10;
        const inlineAttackerStrengthRank = attackerStrInfo?.rank || "Typical";
        
        // Get target's endurance for the save
        const targetEndInfo = getAbilityInfo(targetActor, "endurance");
        const targetEndRank = targetEndInfo?.rank || "Typical";
        
        // Common prefill data
        const inlinePrefill = {
          dmgThrough: penetratingDamage,
          targetName: targetName,
          targetEndRank: targetEndRank,
          defenderUuid: target?.document?.uuid ?? targetActor?.uuid,
          targetUuid: target?.document?.uuid ?? targetActor?.uuid,
          attackForm: attackForm,
          borderline: isBorderline
        };
        
        // GET INLINE SLAM RESULT (for display only - effects applied later)
        if (showSlam) {
          try {
            inlineSlamResult = await ActionDispatcher.roll("slam", {
              actor: targetActor,
              abilityName: "endurance",
              opts: {
                autoApply: true,
                returnResultOnly: true,
                attackForm: attackForm,
                prefill: {
                  ...inlinePrefill,
                  attackerStrength: inlineAttackerStrength,
                  attackerStrengthRank: inlineAttackerStrengthRank,
                  attackerName: actor.name
                }
              }
            });
            
            if (inlineSlamResult) {
              inlineSlamHtml = buildCollapsibleSlamSection(inlineSlamResult, { muted: mutedConsequence });
            }
          } catch (e) {
            console.error("[FASERIP ERROR] Inline Slam check failed:", e);
          }
        }
        
        // GET INLINE STUN RESULT (for display only - effects applied later)
        if (showStun) {
          try {
            inlineStunResult = await ActionDispatcher.roll("stun", {
              actor: targetActor,
              abilityName: "endurance",
              opts: {
                autoApply: true,
                returnResultOnly: true,
                attackForm: attackForm,
                damageType: damageType,
                prefill: { ...inlinePrefill }
              }
            });
            
            if (inlineStunResult) {
              inlineStunHtml = buildCollapsibleStunSection(inlineStunResult, { muted: mutedConsequence });
            }
          } catch (e) {
            console.error("[FASERIP ERROR] Inline Stun check failed:", e);
          }
        }
      }

      // Build compact shift display with breakdown
      let shiftDisplay = "";
      let toHitChips = [];
      {
        const parts = [];
        const breakdown = choice.shiftBreakdown;
        
        // Each modifier as "Label: value" (name-first, like the MP card).
        // Situational tags from the dialog (csNotes) are already named.
        if (breakdown?.csNotes) {
          parts.push(breakdown.csNotes);
        } else if (breakdown?.manual && breakdown.manual !== 0) {
          parts.push(`Manual: ${breakdown.manual > 0 ? '+' : ''}${breakdown.manual}`);
        }

        if (breakdown?.multiAttack && breakdown.multiAttack !== 0) {
          const label = breakdown.multiAttack === -1 ? "Multi-attack" : "Multi-attack (failed)";
          parts.push(`${label}: ${breakdown.multiAttack}`);
        }
        if (breakdown?.range && breakdown.range !== 0) parts.push(`Range: ${breakdown.range}`);
        if (breakdown?.obstacle && breakdown.obstacle !== 0) parts.push(`Obstacle: ${breakdown.obstacle}`);
        if (breakdown?.movement && breakdown.movement !== 0) parts.push(`Movement: ${breakdown.movement}`);
        if (breakdown?.adjacent && breakdown.adjacent !== 0) parts.push(`Adjacent: ${breakdown.adjacent}`);

        // Fallback: no breakdown object but a manual shift exists
        if (!breakdown && manualShift !== 0) {
          parts.push(`Other: ${manualShift > 0 ? '+' : ''}${manualShift}`);
        }

        // Attacker / defender effects by name (defender sign flips — defense
        // makes the attacker's column harder)
        for (const eff of attackerEffects) {
          parts.push(`${eff.name}: ${eff.shift > 0 ? '+' : ''}${eff.shift}`);
        }
        for (const eff of defenderEffects) {
          parts.push(`${eff.name}: ${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)}`);
        }
        
        toHitChips = parts.flatMap(p => String(p).split(',').map(s => s.trim())).filter(Boolean);
        // Show the breakdown even when components cancel to a net 0 (e.g. Guns +1
        // vs Range -1 -> column unchanged, but both modifiers still worth showing).
        if (totalShift !== 0 || toHitChips.length > 0) {
          const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
          const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
          shiftDisplay = ` (${csBox} → ${effectiveRank})`;
        }
      }

      // Build compact roll display: "Roll: 57 (42 + 15 karma)" or "Roll: 42"
      // Yellow box on raw roll indicates hover text available
      const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
      const rollDisplay = totalKarmaUsed 
        ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
        : rollBox;

      // Add manual mode notice if applicable
      const manualModeNotice = isManualMode ? `
        <div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
          Manual Mode: GM adjudicates
        </div>
      ` : "";

      // Compact chat card
      // For adjacent attacks (single roll, multiple targets), show "Attack vs X targets"
      // For regular attacks, show "Attack N of M"
      const attackIndicator = targetCount > 1
        ? `<span style="color:#666;font-weight:normal;font-size:.85em;flex-shrink:0;white-space:nowrap;">Attack vs ${targetCount} targets</span>`
        : `<span style="color:#666;font-weight:normal;font-size:.85em;flex-shrink:0;white-space:nowrap;">Attack ${attackNumber} of ${totalAttacks}</span>`;
      const legacyCardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <!-- Header: Action + Attack number -->
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span style="min-width:0;"><strong style="color:#8b0000;">${actionLabel.toUpperCase()}</strong>${weapon?.name ? `<br><span style="color:#555;font-size:.85em;font-weight:normal;">${weapon.name}</span>` : ''}</span>
            ${attackIndicator}
          </div>
          
          <!-- Attacker → Target -->
          <div style="padding:4px 10px;font-size:.95em;">
            <strong>${actor.name}</strong>${targetActor ? ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${targetName}</strong>` : ''}
          </div>
          
          ${multiAttackFeatHtml}
          ${variantBadge}
          ${aimBadge}
          ${talentBadge}
          ${maDBadge}
          
          <!-- Ability + Roll + Result -->
          <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
            <div>${ability.name}: ${ability.rank}${shiftDisplay}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>Roll: ${rollDisplay}</span>
              <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${targetBg};color:${targetFg};">
                ${String(targetEffectColor).toUpperCase()} — ${String(targetEffectResult).toUpperCase()}
              </span>
            </div>
          </div>
          
          ${evasionNote}
          ${killWarning}
          ${disarmNote}
          
          <!-- Damage -->
          ${(() => {
            if (!targetIsHit) {
              // Miss - show zero damage with reason
              const missReason = evasionNote ? "evaded" : "miss";
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;color:#666;">
                <strong>Damage:</strong> 0 (${missReason})
              </div>`;
            }
            
            // Build damage source hover text
            const sourceHover = damageNote || `${sourceName}`;
            const dmgBox = `<span title="${sourceHover}" style="cursor:help;">${rawDamage}</span>`;
            
            // Check if damage was pulled
            let pullNote = "";
            if (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage) {
              pullNote = ` <span style="color:#ff6f00;">(→${choice.pulledDamage} pulled)</span>`;
            }
            
            // Build result cap note
            let capNote = "";
            if (choice.resultCap && choice.resultCap !== 'none') {
              capNote = ` <span style="color:#ff6f00;">(capped ${choice.resultCap})</span>`;
            }
            
            // Build armor display if applicable
            if (armorValue > 0 && targetActor) {
              // Build armor hover text with rank if available
              const isEnergy = armorData?.isEnergyDamage;
              const armorRank = isEnergy ? armorData?.energyRank : armorData?.physicalRank;
              const armorType = armorData?.isForceField ? "Force Field" : "Body Armor";
              const _apFlat = Number(choice?.armorPiercing || 0);
              const _apCS   = Number(choice?.armorPiercingCS || 0);
              const _apMode = choice?.apMode || "value";
              const _apApplied = (_apMode === "cs" && _apCS > 0) || (_apMode !== "cs" && _apFlat > 0);
              const _apNote = _apApplied
                ? (_apMode === "cs"
                    ? ` <span style="color:#1565c0;font-size:.85em;" title="AP ammo: armor reduced ${_apCS}CS">(AP -${_apCS}CS)</span>`
                    : ` <span style="color:#1565c0;font-size:.85em;" title="Armor Piercing: armor reduced by ${_apFlat}">(AP -${_apFlat})</span>`)
                : "";
              const armorHover = armorRank ? `${armorRank} ${armorType} (${armorValue})` : `${armorType} (${armorValue})`;
              const armorBox = `<span title="${armorHover}" style="cursor:help;">${armorValue} armor</span>`;
              
              if (!game.user.isGM) {
                // Player sees net damage only
                return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                  <strong>Damage:</strong> <strong>${afterArmor}</strong>${capNote}
                </div>`;
              }
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <strong>Damage:</strong> ${dmgBox}${pullNote} − ${armorBox}${_apNote} = <strong>${afterArmor}</strong>${capNote}
              </div>`;
            } else {
              // No armor - simple display
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <strong>Damage:</strong> ${dmgBox}${pullNote}${capNote}
              </div>`;
            }
          })()}
          
          ${inlineSlamHtml}
          ${inlineStunHtml}
          ${inlineBreakingHtml}
          
          ${actions}
          ${manualModeNotice}
        </div>
      `;

      // ── Redesigned attack card: header (+weapon), Target/Range line, full-width
      //    color result banner, then a Roll / <Ability> / Damage strip — roll
      //    in black, the ability-named middle cell shows the effective column
      //    (* = modified, hover lists the chain), damage hover carries the GM
      //    armor math. Shared by blunt/edged/shooting/thrown via formClass. ──
      const cardFormKey = String(actionType).toLowerCase();
      const useRedesignedCard = REDESIGNED_ATTACK_FORMS.has(cardFormKey);
      let cardHtml = legacyCardHtml;
      if (useRedesignedCard) {
        const abbr = r => RANK_ABBR[r] || r;
        const shifted = !!(totalShift && totalShift !== 0);
        // Surface the breakdown when modifiers exist even if they net to zero.
        const hasMods = shifted || toHitChips.length > 0;

        // Form-specific bits: CSS class hook + range text. Ranged forms
        // carry choice.range in areas (1 = adjacent); melee is adjacent.
        const formClass = MELEE_ATTACK_FORMS.has(cardFormKey) ? cardFormKey.replace("-attack", "")
          : cardFormKey.startsWith("throwing-") ? "thrown"
          : cardFormKey;  // shooting, energy, force
        const _rangeAreas = Number(choice?.range || 0);
        const cardRangeText = MELEE_ATTACK_FORMS.has(cardFormKey) ? "adjacent"
          : (_rangeAreas >= 2 ? `${_rangeAreas} areas` : "adjacent");

        // Roll value (final; karma already folded in). Hover shows the math.
        const rollNum = totalKarmaUsed ? cappedTotal : roll.total;
        const rollTooltip = totalKarmaUsed
          ? `d100 = ${roll.total} + ${totalKarmaUsed} karma → ${cappedTotal}`
          : `d100 = ${roll.total}`;

        // Middle strip cell: ability name is the label, the effective column is
        // the value (full word; * marks a modified column). Hover lists the chain.
        const effRankValue = `${effectiveRank}${hasMods ? "*" : ""}`;
        const effRankTooltip = hasMods
          ? [`${ability.name} ${ability.rank}`, ...toHitChips, "──────────", `→ ${effectiveRank}`].join("\n")
          : `${ability.name} ${ability.rank}\nNo modifiers`;

        // Damage cell: net on hit, dash on miss. GM hover adds the armor math.
        const dmgValue = targetIsHit ? afterArmor : "—";
        let dmgTooltip = "";
        if (targetIsHit) {
          const parts = [];
          if (game.user.isGM && armorValue > 0) {
            const isEnergy = armorData?.isEnergyDamage;
            const aRank = isEnergy ? armorData?.energyRank : armorData?.physicalRank;
            const aType = armorData?.isForceField ? "Force Field" : "Body Armor";
            parts.push(`${rawDamage} − ${armorValue} ${aType}${aRank ? ` (${abbr(aRank)})` : ""} = ${afterArmor}`);
          }
          if (damageNote) parts.push(damageNote); else if (sourceName) parts.push(sourceName);
          dmgTooltip = parts.join(" · ");
        }

        let bluntIndicator = "";
        if (targetCount > 1) {
          bluntIndicator = `<span style="color:#666;font-weight:normal;font-size:.85em;flex-shrink:0;white-space:nowrap;">vs ${targetCount} targets</span>`;
        } else if (totalAttacks > 1) {
          bluntIndicator = `<span style="color:#666;font-weight:normal;font-size:.85em;flex-shrink:0;white-space:nowrap;">Attack ${attackNumber} of ${totalAttacks}</span>`;
        }

        const cardData = {
          actionLabel: actionLabel.toUpperCase(),
          formClass,
          weaponName: weapon?.name || "",
          indicatorHtml: bluntIndicator,
          hasTarget: !!targetActor,
          targetName,
          rangeText: cardRangeText,
          badgesHtml: `${multiAttackFeatHtml}${variantBadge}${aimBadge}${talentBadge}${maDBadge}`,
          resultBg: targetBg,
          resultFg: targetFg,
          resultText: `${String(targetEffectColor).toUpperCase()} — ${String(targetEffectResult).toUpperCase()}`,
          rollNum,
          rollTooltip,
          abilityLabelUpper: String(ability.name).toUpperCase(),
          effRankValue,
          effRankTooltip,
          dmgValue,
          dmgTooltip,
          mitigationHtml: "",
          notesHtml: `${evasionNote}${killWarning}${disarmNote}`,
          consequenceHtml: `${inlineSlamHtml}${inlineStunHtml}${inlineBreakingHtml}`,
          actionsHtml: actions,
          manualNoticeHtml: manualModeNotice
        };

        cardHtml = await foundry.applications.handlebars.renderTemplate(
          "systems/msh-faserip/templates/chat/attack-card.hbs",
          cardData
        );
      }

      const damageFlags = buildDamageFlags({
        actionId: actionType,
        damageType: damageType,
        rawDamage,
        afterArmor,
        resultColor: colorLower,
        cappedTotal,
        targets: target ? [target] : []
      });

      // Pre-stamp resolvedChecks BEFORE message creation so the
      // chat-hooks render-time chip auto-fire can see it and skip checks
      // this attack-action will auto-trigger itself. Without this pre-stamp,
      // both paths fire applySlam/applyStun and the delete-then-create
      // dedup inside those wrappers makes Times-Up emit a phantom
      // "expired" card for the deleted intermediate AE.
      if (!isManualMode) {
        const SCOPE_ID = game.system?.id || "msh-faserip";
        const willResolve = [];
        if (showSlam) willResolve.push("slam");
        if (showStun) willResolve.push("stun");
        if (showKill) willResolve.push("kill");
        if (willResolve.length) {
          damageFlags[SCOPE_ID] = {
            ...(damageFlags[SCOPE_ID] || {}),
            resolvedChecks: willResolve
          };
        }
      }

      const attackChatMsg = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cardHtml,
        flags: damageFlags
      });

      // ============================================================
      // FIX: Auto-apply damage with wasKillResult for kill-capable attacks
      // ============================================================
      if (!isManualMode && this.opts?.autoApply && targetIsHit && rawDamage > 0 && targetActor) {
        debugLog("Auto-applying damage in full auto mode", {
          damage: rawDamage,
          afterArmor,
          target: targetName,
          wasKillResult: showKill  // NEW: pass kill result
        });

        const autoDamageResults = await applyDamageToTargets({
          damage: afterArmor,  // Use after-armor damage (includes pull punch cap)
          attackerUuid: actor.uuid,
          damageType: damageType,
          showNotification: false,
          bypassArmor: true,  // Armor already calculated above
          attackForm: attackForm,
          armorPiercing: choice.armorPiercing || 0,
          bypassForceField: !!choice?.bypassForceField,
          ignoresNaturalArmor: !!choice?.ignoresNaturalArmor,
          ignoresArtificialArmor: !!choice?.ignoresArtificialArmor,
          targets: [target],
          // === FIX: Pass kill result flag ===
          wasKillResult: showKill,
          forceKilling: showKill  // ensure kill save triggers on red
        });

        await updateAttackCardDamageAfterAutoApply(attackChatMsg, autoDamageResults, {
          rawDamage,
          afterArmor,
          damageType,
          targetName
        });

        // ── Continuing damage (corrosive, acid, etc.) ──
        // If the source power has continuingDamage flagged OR is an inherently
        // ongoing type (corrosive, rotting per RAW), register an ongoing effect
        // on the target for subsequent-round damage per the schedule.
        const weapon = choice?.weapon;
        const wSys = weapon?.system || {};
        const nameLc = String(weapon?.name || "").toLowerCase();
        const dtLc = String(wSys.damageType || "").toLowerCase();
        const isCorrosive = /corrosive|acid/.test(nameLc) || /corrosive|acid/.test(dtLc);
        const isRotting = /rotting|decay/.test(nameLc);
        const continuingByRule = isCorrosive || isRotting;
        const continuingByAuthor = wSys.continuingDamage === true;
        if (weapon?.type === "power" && (continuingByAuthor || continuingByRule) && afterArmor > 0) {
          const { applyContinuingDamage } = await import("../effects/ongoing-engine.js");
          const totalRounds = Math.max(1, Number(wSys.continuingDamageRounds) || 3);
          const pattern = continuingByRule ? "diminishing-2cs" : "constant";
          const canWash = isCorrosive;
          await applyContinuingDamage(targetActor, {
            name: `${weapon.name} — Continuing`,
            initialRank: wSys.rank || "Typical",
            pattern,
            rounds: totalRounds,
            includeInitial: false,  // initial hit already applied via applyDamageToTargets
            canWash,
            damageType: wSys.damageType || damageType,
            originUuid: actor.uuid,
            img: isCorrosive ? "icons/svg/acid.svg" : "icons/svg/blood.svg",
          });
        }
      }

      // ============================================================
      // Auto-trigger status effect checks in full auto AND semi mode.
      // Slam/stun/kill are mechanical consequences of the attack roll,
      // not player choices — they should resolve before the next attack.
      // Damage application (above) remains gated on autoApply (full auto only).
      // ============================================================
      if (!isManualMode && canEffectsApply(penetratingDamage, { borderline: isBorderline }) && targetActor && !targetIsVehicle) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        
        // Get attacker strength info for Slam checks
        const attackerStrInfo = getStrengthInfo(actor);
        const attackerStrength = attackerStrInfo?.value || 10;
        const attackerStrengthRank = attackerStrInfo?.rank || "Typical";
        
        // Get target's endurance for the save
        const targetEndInfo = getAbilityInfo(targetActor, "endurance");
        const targetEndRank = targetEndInfo?.rank || "Typical";
        
        // Build common prefill data
        const basePrefill = {
          dmgThrough: penetratingDamage,
          targetName: targetName,
          targetEndRank: targetEndRank,
          defenderUuid: target?.document?.uuid ?? targetActor?.uuid,
          targetUuid: target?.document?.uuid ?? targetActor?.uuid,
          attackForm: attackForm,
          borderline: isBorderline
        };

        // === AUTO-TRIGGER SLAM CHECK ===
        // In consolidated mode, pass pre-rolled result; otherwise normal flow
        if (showSlam) {
          debugLog("Auto-triggering Slam check", { 
            target: targetName, 
            damage: penetratingDamage,
            attackerStrength: attackerStrengthRank,
            hasPreRolledResult: !!inlineSlamResult,
            useConsolidated
          });
          
          try {
            await ActionDispatcher.roll("slam", {
              actor: targetActor,  // Defender makes the save
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: attackForm,
                // In consolidated mode, skip chat message and use pre-rolled result
                skipChatMessage: useConsolidated,
                preRolledResult: inlineSlamResult,
                prefill: {
                  ...basePrefill,
                  attackerStrength: attackerStrength,
                  attackerStrengthRank: attackerStrengthRank,
                  attackerName: actor.name
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Slam failed:", e);
          }
        }

        // === AUTO-TRIGGER STUN CHECK ===
        // In consolidated mode, pass pre-rolled result; otherwise normal flow
        if (showStun) {
          debugLog("Auto-triggering Stun check", { 
            target: targetName, 
            damage: penetratingDamage,
            hasPreRolledResult: !!inlineStunResult,
            useConsolidated
          });
          
          try {
            await ActionDispatcher.roll("stun", {
              actor: targetActor,  // Defender makes the save
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: attackForm,
                damageType: damageType,
                // In consolidated mode, skip chat message and use pre-rolled result
                skipChatMessage: useConsolidated,
                preRolledResult: inlineStunResult,
                prefill: {
                  ...basePrefill
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Stun failed:", e);
          }
        }

        // === KILL CHECK ===
        // NOTE: Kill check is now handled by applyDamageToTargets which calls death-save
        // with the Kill Check embedded. We no longer trigger a separate kill check here
        // to avoid duplicate chat cards.
        // See: action-utils.js applyDamageToTargets() line ~1445
      }
      // ============================================================
      // END v1.6.0 auto-trigger block
      // ============================================================

      // Mark auto-triggered checks as resolved so chat chips grey out
      if (attackChatMsg && !isManualMode) {
        const resolved = [];
        if (showSlam) resolved.push("slam");
        if (showStun) resolved.push("stun");
        if (showKill) resolved.push("kill");
        if (resolved.length) {
          try {
            const SCOPE = game.system?.id || "msh-faserip";
            await attackChatMsg.setFlag(SCOPE, "resolvedChecks", resolved);
          } catch (e) {
            console.warn("[FASERIP WARN] Could not set resolvedChecks flag:", e);
          }
        }
      }

      // ============================================================
      // ENTANGLING WEAPON CHECK: If weapon has entangling flag and hit landed
      // Rules: Agility FEAT to hit (already resolved), then target Agility FEAT
      // vs material strength or enmeshed. Handled by entangling-action.
      // ============================================================
      if (targetIsHit && weapon?.system?.entangling && targetActor) {
        try {
          const { processEntanglingHit } = await import("./entangling-action.js");
          await processEntanglingHit({
            attacker: actor,
            target: targetActor,
            weapon,
            weaponMaterialStrength: weapon.system.materialStrength || "Typical"
          });
        } catch (e) {
          console.error("[FASERIP ERROR] Entangling check failed:", e);
        }
      }

      // ============================================================
      // POST-HIT CALLBACK: variant-specific follow-ups (mercy KO drug,
      // area-effect ripple, etc). Called once per resolved target with
      // the attack outcome. Fire-and-forget — exceptions logged but do
      // not interrupt the rest of the attack chain.
      // ============================================================
      if (postHitCallback && targetActor) {
        try {
          await postHitCallback({
            targetActor,
            target,
            targetName,
            isHit: targetIsHit,
            color: colorLower,
            rawDamage,
            afterArmor,
            penetratingDamage,
            damageType,
            attackForm,
            weapon,
            actor
          });
        } catch (e) {
          console.error("[FASERIP ERROR] postHitCallback failed:", e);
        }
      }

      // ============================================================
      // INTENSITY-ON-HIT: a weapon carrying an on-hit Intensity effect
      // (stun baton, Stun Pistol/Rifle/Cannon, and any weapon with an
      // Intensity Rank + Apply effect) rolls the target's Endurance FEAT
      // vs system.intensityRank on a hit; on failure the configured
      // effect (Stunned/Unconscious/Blinded/…) is applied for the listed
      // duration. This is a FEAT-intensity attack, so per the Body Armor
      // rules it ignores Body Armor (it does not pass through it — cf. the
      // Sonic example) and is therefore keyed off the HIT, not penetrating
      // damage. Skipped when a postHitCallback already delivered a post-hit
      // effect (mercy KO drug, area ripple) so the two never stack — the
      // tranq's mercy KO is unaffected.
      //
      // Resolve the weapon the same robust way the ammo block does: the
      // method-scope `weapon` is null on the melee paths (blunt/edged set
      // choice.itemId, not choice.weapon), so fall back to this.opts.item.
      // ============================================================
      const _intensityWeapon =
        this?.opts?.item
        || weapon
        || (choice?.weaponId ? this.actor.items.get(choice.weaponId) : null)
        || (choice?.itemId ? this.actor.items.get(choice.itemId) : null)
        || null;
      if (!postHitCallback && targetActor && targetIsHit && _intensityWeapon?.system?.intensityRank) {
        try {
          await this._applyIntensityOnHit({ targetActor, color: colorLower, weapon: _intensityWeapon, actor });
        } catch (e) {
          console.error("[FASERIP ERROR] intensity-on-hit failed:", e);
        }
      }
    }

    // Ammo accounting + optional SFX/FX after all cards (runs even in manual mode).
    // Bare block — intentionally NOT gated on game.msh.playCombatSFX so firearm
    // ammo always decrements regardless of whether the SFX subsystem is present
    // or enabled. The SFX/FX calls below carry their own guards.
    {
      const weapon =
        this?.opts?.item
        || choice?.weapon
        || (choice?.weaponId ? this.actor.items.get(choice.weaponId) : null)
        || null;

      const sourceName = weapon?.name ?? "Attack";

      const dmgType =
        damageType
        || weapon?.system?.damageType
        || (actionType === "edged"   ? "physical-edged"
          : actionType === "blunt"  ? "physical-blunt"
          : actionType === "energy" ? "energy"
          : actionType); // final fallback

      const rollResult = String(colorLower ?? "").toLowerCase();
      // Use the tracked actual hit status (accounts for evasion)
      const hit = anyTargetActuallyHit;

        if (game.msh?.playCombatSFX) {
          await game.msh.playCombatSFX({
            item: weapon,
            actionType,
            damageType: dmgType,
            rollResult,
            isHit: hit,
            sourceName
          });
        }

        // Play matching visual FX (no-op if disabled or Sequencer absent)
        if (game.msh?.fx?.playAttack) {
          await game.msh.fx.playAttack({
            actor: this.actor,
            item: weapon,
            actionType,
            damageType: dmgType,
            isHit: hit,
            targets: Array.isArray(this?.targets) ? this.targets : null
          });
        }

        // --- Spend ammo for firearms (string/number tolerant; supports current template.json) ---
        try {
          // Firearm detection mirrors the pre-attack out-of-ammo check: a
          // weapon is a firearm by its weaponType, regardless of the attack's
          // damage type. Energy/force blasters have attackType "energy"/"force"
          // (so actionType is NOT "shooting") but still expend shots.
          const _sysW = weapon?.system || {};
          const _isFirearm =
            String(_sysW.weaponType || "").toLowerCase() === "firearm" ||
            String(_sysW.weaponType || "").toLowerCase() === "shooting" ||
            String(actionType).toLowerCase() === "shooting";
          if (_isFirearm && weapon?.system) {
            const sys = weapon.system;

            // Parse first numeric in a value (works for "20", "", null, "Burst (3)", etc.)
            const toNum = (v, dflt = NaN) => {
              if (v == null || v === "") return dflt;
              if (typeof v === "number" && Number.isFinite(v)) return v;
              if (typeof v === "string") {
                const m = v.match(/-?\d+(\.\d+)?/);
                return m ? Number(m[0]) : dflt;
              }
              return dflt;
            };

            // Decide rounds to spend: prefer HUD/sender opts, then weapon rate of fire, else 1
            const candidates = [
              this?.opts?.roundsFired,
              this?.opts?.shotsToSpend,
              sys.rate
            ];
            const first = candidates.map(v => toNum(v)).find(n => Number.isFinite(n) && n > 0);
            const rounds = Number.isFinite(first) ? Math.max(1, Math.trunc(first)) : 1;

            // (optional debug)
            if (!Number.isFinite(first)) {
              console.warn("FASERIP | Ammo spend: no finite rounds found; defaulting to 1", { candidates });
            }

            // Helper to update any ammo-like field (string or number), return true if updated
            const tryUpdate = async (path) => {
              const cur = foundry.utils.getProperty(weapon, path);
              const curNum = toNum(cur);
              if (!Number.isFinite(curNum)) return false;
              const next = Math.max(0, curNum - rounds);
              await weapon.update({ [path]: next }); // Foundry will coerce as needed
              console.log("FASERIP | Ammo spend", { weapon: weapon.name, path, cur, curNum, rounds, next });
              return true;
            };

            // shotsRemaining is the live counter; shots is magazine CAPACITY and
            // must never be decremented. If shotsRemaining is blank (never
            // initialized), seed it from shots before spending.
            const tryUpdateShotsRemaining = async () => {
              let cur = toNum(sys.shotsRemaining);
              if (!Number.isFinite(cur)) cur = toNum(sys.shots);
              if (!Number.isFinite(cur)) return false;
              const next = Math.max(0, cur - rounds);
              await weapon.update({ "system.shotsRemaining": next });
              console.log("FASERIP | Ammo spend", { weapon: weapon.name, path: "system.shotsRemaining", cur, rounds, next });
              return true;
            };

            // First match wins (order chosen to fit your template.json)
            const updated =
              (sys.ammo && (await tryUpdate("system.ammo.current") || await tryUpdate("system.ammo.value"))) ||
              (await tryUpdateShotsRemaining()) ||
              (sys.uses && await tryUpdate("system.uses.value")) ||
              (await tryUpdate("system.clip")) ||
              (await tryUpdate("system.magazine"));

            if (!updated) {
              console.warn("FASERIP | No numeric ammo field found on weapon", weapon.name, { sys });
            } else if (rounds > 1) {
              ui.notifications?.info?.(`${weapon.name}: fired ${rounds} rounds`);
            }
          }
        } catch (e) {
          console.warn("FASERIP | Ammo spend failed:", e);
        }

    }
  }
}