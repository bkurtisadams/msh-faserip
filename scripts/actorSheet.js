// actorSheet.js v2.2.8 - 2026-04-19
// v2.2.8: Fix "Cannot read properties of undefined (reading 'OTHER')"
//         crash on Power Info icon click (and the _action-info chat
//         card). CONST.CHAT_MESSAGE_TYPES was removed in Foundry v13
//         (replaced by CHAT_MESSAGE_STYLES, with the ChatMessage
//         field renamed type→style). Dropped the explicit OTHER
//         assignment at both sites; Foundry defaults non-roll
//         messages to OTHER already, so behavior is unchanged.
// v2.2.7: Auto-populate ability value on rank change. If current value is
//         out of the new rank's range, confirm dialog offers "update to
//         standard" or "keep custom". In-range values preserved silently.
//         Prevents silent drift (e.g. rank bumped to Unearthly but value
//         still reads Remarkable's 30).
// v2.2.6: v14 — extend foundry.appv1.sheets.ActorSheet (namespaced path)
// v2.2.5: Add inline Recovery button to Health cell — shows only when
//         canAttemptRecovery returns eligible. One-click applies recovery
//         and rerenders the sheet. Click bubbling stopped so the parent
//         .health-recovery-link header (which opens the Recovery & Rest
//         dialog) does not also fire.
// v2.2.4: Add Ctrl+Wheel zoom on character sheet (shared sheet-zoom utility)
// v2.2.3: Targeted _updateObject guard — only blocks formData values that exactly match
//         what the shift display code would have injected (shifted rank name + standard
//         rank number). Custom ability values within a rank range pass through normally.
// v2.2.1: Fix ability corruption race — removeAttr('name') BEFORE setting visual val()
//         to prevent submitOnChange from persisting effect-shifted values to actor data
// v2.2.0: Extract ability FEAT dialog to modules/actions/ability-feat-dialog.js
// v2.0.0: Fix equipment roll routing for Energy/Force/Grappling/Grabbing damage types
// v1.9.0: Log Resource and Popularity FEATs to karma history
// v1.8.0: Add clickable Teleport label for movement FEAT dialog
// v1.7.0: Add clickable Swim label for movement FEAT dialog
// v1.6.0: Add clickable Run label for movement FEAT dialog
// v1.5.0: Refactor movement FEAT dialogs to separate movement-feats.js module
// v1.4.0: Add clickable Fly label with FEAT dialog for flight maneuvers
// v1.3.0: Add clickable Leap label with FEAT dialog for movement rolls
// v1.2.0: Fix ability FEAT karma to use two-phase system per rules (declare before, decide amount after roll)
// v1.1.0: Add visual indicators for Endurance impairment and reduced health max (dying state)
// v1.0.2: Fix column shift persistence in blunt attack dialog
// v1.0.1: Remove verbose debug logging on sheet render
import { prepareActiveEffectCategories, onManageActiveEffect } from "../helpers/effects.mjs";
import { getItemMaterialRank, getBluntNextRankMinRule } from "./gm-utils.js";
import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { ACTION_INFO } from "./modules/actions/action-config.js";
import { StuntRoller } from './stunts.js';
import { rollUniversalTable } from "./modules/dice/universal-table.js";
import { ChargenUIManager } from './chargen.js';
import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma } from './modules/dice/dice-roller.js';
import { MovementFeats } from './movement-feats.js';
import { showAbilityFeatDialog, determineFeatRequirement, checkFeatSuccess } from './modules/actions/ability-feat-dialog.js';
import { RESOURCE_PRICES } from './rules/rules-reference.js';
import { initSheetZoom } from './modules/ui/sheet-zoom.js';
import { UniversalTableTab } from './modules/ui/universal-table-tab.js';
import {
  RANKS_ORDERED as _RANKS, RANK_VALUES as _RANK_VALUES, RANK_RANGES as _RANK_RANGES,
  RANK_ALIASES, normalizeRank,
  resolveRange, getPowerDerivations
} from './rules/rules-reference.js';
import { showFaseripDialog } from "./modules/actions/dialog-shim.js";
import { getCurrentGameDate } from "./modules/effects/ongoing-engine.js";

const DialogV2 = foundry.applications.api.DialogV2;

function getPopularityRankWithRange(value, context) {
  const rank = context._getPopularityRank(value);
  const ranges = {
    "Feeble": "1–2",
    "Poor": "3–4",
    "Typical": "5–7",
    "Good": "8–15",
    "Excellent": "16–25",
    "Remarkable": "26–35",
    "Incredible": "36–45",
    "Amazing": "46–62",
    "Monstrous": "63–87",
    "Unearthly": "88–125",
    "Shift-X": "126–175",
    "Shift-Y": "176–350",
    "Shift-Z": "351–999",
    "Class 1000": "1000–2999",
    "Class 3000": "3000–4999",
    "Class 5000": "5000+"
  };
  return `${rank} (${ranges[rank] || "?"})`;
}

/**
 * Applies a column shift to a FASERIP rank and returns the new rank and its base value.
 * @param {string} rankName - The current rank (e.g. "Amazing")
 * @param {number} currentValue - The current numeric value (e.g. 46)
 * @param {number} csShift - Number of column shifts (positive or negative)
 * @returns {{ rank: string, value: number }}
 */
// scripts/actorSheet.js  — replace the whole function with this version
export function applyColumnShiftToRank(rankName, currentValue, csShift) {
  // Keep the canonical list here
  const rankList = [
    { name: "Shift-0", min: 0 },
    { name: "Feeble", min: 1 },
    { name: "Poor", min: 3 },
    { name: "Typical", min: 5 },
    { name: "Good", min: 8 },
    { name: "Excellent", min: 16 },
    { name: "Remarkable", min: 26 },
    { name: "Incredible", min: 36 },
    { name: "Amazing", min: 46 },
    { name: "Monstrous", min: 63 },
    { name: "Unearthly", min: 88 },
    { name: "Shift-X", min: 126 },
    { name: "Shift-Y", min: 176 },
    { name: "Shift-Z", min: 351 },
    { name: "Class 1000", min: 1000 },
    { name: "Class 3000", min: 3000 },
    { name: "Class 5000", min: 5000 },
    { name: "Beyond", min: 9999 }
  ];

  // --- normalize input names so "Shift X" and "Shift-X" match
  const normalize = (s) => {
    if (!s) return s;
    return s
      .replace(/^Shift\s*X$/i, "Shift-X")
      .replace(/^Shift\s*Y$/i, "Shift-Y")
      .replace(/^Shift\s*Z$/i, "Shift-Z")
      .replace(/^Shift\s*0$/i, "Shift-0");
  };

  const normalizedName = normalize(rankName);

  // 1) Try exact name match
  let index = rankList.findIndex(r => r.name === normalizedName);

  // 2) Fallback by value: pick the HIGHEST rank whose min <= value
  if (index === -1) {
    if (typeof currentValue === "number" && !Number.isNaN(currentValue)) {
      for (let i = rankList.length - 1; i >= 0; i--) {
        if (currentValue >= rankList[i].min) { index = i; break; }
      }
    }
    if (index === -1) index = 0;
  }

  // Apply column shift and clamp
  const newIndex = Math.max(0, Math.min(rankList.length - 1, index + (csShift || 0)));
  const newRank = rankList[newIndex];

  return { rank: newRank.name, value: newRank.min };
}


export class FaseripActorSheet extends foundry.appv1.sheets.ActorSheet {
  // Add a property to track the biography toggle state
  _isBiographyOpen = false;
  
  // Add a property for the character creation manager
  _charCreationManager = null; // NEW PROPERTY

    // Track the in-sheet Universal Table hook
  _universalTableHookId = null;

  // Universal Table tab renderer (instantiated lazily in activateListeners)
  _utTab = null;


  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      width: 700,
      height: 800,
      tabs: [{ navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", initial: "powers" },
        { navSelector: ".sheet-tabs-navigation", contentSelector: ".sheet-tab-content", tab: "create-character", label: "Creator" }],
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    const actorData = this.actor.toObject(false);

    context.system = actorData.system;
    context.flags = this.actor.flags;

    // Get items sorted by type for display in the template
    context.powers = this.actor.items.filter(item => item.type === "power") || [];
    context.powers = this.actor.items
    .filter(item => item.type === "power")
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // make talents sortable within the talents tab
    context.talents = this.actor.items
      .filter(item => item.type === "talent")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // get contacts & make sortable
    context.contacts = this.actor.items
      .filter(item => item.type === "contact")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Use availableKarma getter for the bottom left display (lifetime calculation)
    context.availableKarma = this.actor.availableKarma;

    // Keep currentKarma for R+I+P display if needed elsewhere
    context.currentKarma = this.actor.currentKarma;

    // the biography toggle state to the context
    context.isBiographyOpen = this._isBiographyOpen;

    // equipment made sortable
    context.equipment = this.actor.items
      .filter(item => item.type === "equipment")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // per-category counts so empty equipment groups can be hidden
    context.equipmentCounts = {
      weapon:    context.equipment.filter(i => i.system.category === "weapon").length,
      other:     context.equipment.filter(i => i.system.category === "other").length,
      armor:     context.equipment.filter(i => i.system.category === "armor").length,
      powerItem: context.equipment.filter(i => i.system.category === "power-item").length,
      gear:      context.equipment.filter(i => ["gear", "custom", "device"].includes(i.system.category)).length
    };

    // headquarters made sortable, with rent status
    context.headquarters = this.actor.items
      .filter(item => item.type === "headquarters")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Compute rent status for personal HQs
    context.hqRentStatus = {};
    for (const hq of context.headquarters) {
      if (hq.system.ownership === "rented") {
        context.hqRentStatus[hq._id] = this._computeHQRentStatus(hq.system.rentLastPaidGameDate);
      }
    }

    // Team headquarters from team HQ actor — only for team members
    const teamIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const isTeamMember = teamIds.includes(this.actor.id);
    const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
    const hqActor = (isTeamMember && hqActorId) ? game.actors.get(hqActorId) : null;
    context.teamHQs = hqActor ? hqActor.items.filter(i => i.type === "headquarters").map(i => {
      let rentStatus = null;
      if (i.system.ownership === "rented") {
        rentStatus = this._computeHQRentStatus(i.system.rentLastPaidGameDate);
      }
      return {
        id: i.id, name: i.name, img: i.img,
        location: i.system.location, size: i.system.size,
        materialStrength: i.system.materialStrength,
        ownership: i.system.ownership,
        purchaseCost: i.system.purchaseCost,
        rentCost: i.system.rentCost,
        rentStatus
      };
    }) : [];

    // vehicles made sortable
    context.vehicles = this.actor.items
      .filter(item => item.type === "vehicle")
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Add ranks array for dropdowns
    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    // active effects — allApplicableEffects() includes both actor-owned effects
    // AND effects from owned items with transfer:true (non-legacy transferral mode).
    context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());

    context.editable = this.isEditable;
    context.isBiographyOpen = this._isBiographyOpen;

    // karma - FIX: Define karma variable first
    const karma = context.system.karma || {};
    const lifetime = karma.lifetime || 0;
    const advancement = karma.advancement || 0;
    
    // Get shared team karma pool from settings
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    
    // Individual contribution tracking (for reference)
    context.poolContribution = karma.poolContribution || 0;

    let spent = 0;
    if (Array.isArray(karma.history)) {
      for (const event of karma.history) {
        if (event.amount < 0) spent += Math.abs(event.amount);
      }
    }

    // Apply initial columns visibility preference
    context.hideInitialColumns = this.actor.getFlag('msh-faserip', 'hideInitialColumns') || false;

    // Movement data for template
    context.suggestedMovement = this.actor.suggestedMovement;
    context.leapingData = this.actor.leapingData;
    context.movementInfo = this.actor.movementInfo;

    context.availableKarma = Math.max(0, lifetime - spent - advancement);
    
    // Check for Endurance impairment (from Dying state)
    const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    const impairedEffect = this.actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
    const dyingEffect = this.actor.effects.find(e => e.getFlag(scope, "isDying") || e.statuses?.has?.("dying"));
    
    if (impairedEffect || dyingEffect) {
      const originalEndurance = impairedEffect?.getFlag(scope, "originalEndurance") || 
                                dyingEffect?.getFlag(scope, "originalEndurance") ||
                                this.actor.getFlag(scope, "originalEndurance");
      const currentEndurance = context.system.abilities?.endurance?.rank;
      
      context.isEnduranceImpaired = originalEndurance && originalEndurance !== currentEndurance;
      context.originalEndurance = originalEndurance;
      context.currentEndurance = currentEndurance;
      
      // Calculate original health max from original endurance
      if (originalEndurance) {
        const rankValues = {
          "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
          "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
          "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
          "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000, "Beyond": 10000
        };
        const originalEnduranceValue = rankValues[originalEndurance] || 0;
        const currentEnduranceValue = context.system.abilities?.endurance?.value || 0;
        const healthMaxDiff = originalEnduranceValue - currentEnduranceValue;
        context.originalHealthMax = context.system.attributes.health.max + healthMaxDiff;
        context.healthMaxReduced = healthMaxDiff > 0;
      }
    } else {
      context.isEnduranceImpaired = false;
      context.healthMaxReduced = false;
    }
    
    // Check for Dying state
    context.isDying = !!dyingEffect;

    // Crisis row visibility: show Wake Up / Stabilize only when relevant
    const currentHP = context.system?.attributes?.health?.value ?? 1;
    context.isInCrisis = context.isDying || currentHP === 0;

    // Recovery button: disable if already used today
    const lastRecoveryDate = this.actor.getFlag(scope, "lastRecoveryDate");
    context.recoveryUsedToday = lastRecoveryDate === new Date().toDateString();

    // Healing button: disable if health at max, no damage recorded, or still on 1-hour cooldown
    const hpValue = context.system?.attributes?.health?.value ?? 0;
    const hpMax = context.system?.attributes?.health?.max ?? 0;
    const lastDamageWorldTime = this.actor.getFlag(scope, "lastDamageWorldTime");
    const worldNow = game.time?.worldTime ?? 0;
    const timeSinceDamage = (lastDamageWorldTime != null) ? (worldNow - lastDamageWorldTime) : -1;
    const healingCooldownRemaining = (timeSinceDamage >= 0 && timeSinceDamage < 3600)
      ? Math.ceil((3600 - timeSinceDamage) / 60) : 0;
    context.healthAtMax = hpMax > 0 && hpValue >= hpMax;
    context.healingUnavailable = context.healthAtMax || lastDamageWorldTime == null || healingCooldownRemaining > 0;
    context.healingCooldownRemaining = healingCooldownRemaining;

    // Health-area Recovery button: ALWAYS shown, greyed when not usable.
    // Reuses rest-system.canAttemptRecovery so logic stays in one place.
    context.recoveryDisabledReason = null;
    try {
      const check = game.msh?.rest?.canAttemptRecovery?.(this.actor);
      context.recoveryEligible = !!check?.canRest;
      if (!context.recoveryEligible) context.recoveryDisabledReason = check?.reason || "Not available";
    } catch (_e) {
      context.recoveryEligible = false;
      context.recoveryDisabledReason = "Rest system not initialized";
    }
    const enduranceValue = context.system?.abilities?.endurance?.value ?? 0;
    context.recoveryHealAmount = enduranceValue;

    // Crisis buttons — eligible-only (appear only when the character is in that state)
    context.wakeUpEligible    = context.isInCrisis && !context.isDying;
    context.stabilizeEligible = !!context.isDying;

    // Health-area Healing button: show ONLY when eligible right now.
    // Reuses rest-system.canAttemptHealing so logic stays in one place.
    try {
      const check = game.msh?.rest?.canAttemptHealing?.(this.actor);
      context.healingEligible = !!check?.canHeal;
    } catch (_e) {
      context.healingEligible = false;
    }
    const hasMedicalCare = this.actor.getFlag(scope, "medicalCare") ?? false;
    context.healingMedicalCare = hasMedicalCare;
    context.healingHealAmount = enduranceValue * (hasMedicalCare ? 2 : 1);
    
    // NPC detection for template labels
    const charType = context.system.characterType || "player";
    context.isNPC = charType !== "player";

    // Compact sheet mode (per-actor flag)
    context.compactSheet = this.actor.getFlag("msh-faserip", "compactSheet") ?? false;

    // Resource Points setting
    context.useResourcePoints = game.settings.get("msh-faserip", "useResourcePoints");
    if (context.useResourcePoints) {
      const res = context.system.attributes?.resources;
      if (res) {
        const max = res.maxPoints;
        context.rpMaxLabel = (max === Infinity || max == null) ? "\u221E" : String(max);
        context.rpWeekly = res.weeklyRate || 0;
      }
    }

    context.rankList = _RANKS;

    return context;
  }

  async _toggleSheetLock(html) {
    const currentLock = this.actor.getFlag('msh-faserip', 'sheetLocked') || false;
    const newLock = !currentLock;
    
    await this.actor.setFlag('msh-faserip', 'sheetLocked', newLock);
    
    const form = html.closest('.faserip-sheet');
    if (newLock) {
      form.addClass('sheet-locked');
    } else {
      form.removeClass('sheet-locked');
    }
    
    const lockButton = html.find('.sheet-lock-toggle');
    const lockIcon = lockButton.find('i');
    
    if (newLock) {
      lockButton.addClass('locked');
      lockButton.attr('title', 'Unlock Sheet');
      lockIcon.removeClass('fa-lock-open').addClass('fa-lock');
    } else {
      lockButton.removeClass('locked');
      lockButton.attr('title', 'Lock Sheet');
      lockIcon.removeClass('fa-lock').addClass('fa-lock-open');
    }
  }

  /**
   * Apply visual indicators for Endurance impairment and health max reduction
   * Called from activateListeners to highlight affected fields
   */
  _applyImpairmentIndicators(html) {
    const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
    const impairedEffect = this.actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
    const dyingEffect = this.actor.effects.find(e => e.getFlag(scope, "isDying") || e.statuses?.has?.("dying"));
    
    // Get original endurance for comparison
    const originalEndurance = impairedEffect?.getFlag(scope, "originalEndurance") || 
                              dyingEffect?.getFlag(scope, "originalEndurance") ||
                              this.actor.getFlag(scope, "originalEndurance");
    const currentEndurance = this.actor.system?.abilities?.endurance?.rank;
    const isImpaired = originalEndurance && originalEndurance !== currentEndurance;
    
    // Style for impaired/dying state
    const impairedStyle = "background: #ffebee !important; border-color: #ef5350 !important;";
    const dyingStyle = "background: #ffcdd2 !important; border-color: #c62828 !important;";
    
    // Apply to Endurance row (the E row in the abilities table)
    const enduranceRow = html.find('tr').filter(function() {
      return $(this).find('.ability-key').text().trim() === 'E';
    });
    
    if (dyingEffect) {
      // Dying state - more severe styling
      enduranceRow.find('select, input').css('cssText', dyingStyle);
      enduranceRow.find('.ability-key').css('cssText', 'background: #c62828 !important; color: white !important;');
      
      // Add tooltip showing original value
      if (originalEndurance) {
        enduranceRow.find('select[name="system.abilities.endurance.rank"]')
          .attr('title', `DYING - Originally: ${originalEndurance}`);
      }
    } else if (isImpaired) {
      // Impaired state - warning styling
      enduranceRow.find('select, input').css('cssText', impairedStyle);
      enduranceRow.find('.ability-key').css('cssText', 'background: #ef5350 !important; color: white !important;');
      
      // Add tooltip showing original value
      enduranceRow.find('select[name="system.abilities.endurance.rank"]')
        .attr('title', `Impaired - Originally: ${originalEndurance}`);
    }
    
    // Apply to Health display if max is reduced
    if (isImpaired || dyingEffect) {
      const healthSection = html.find('.sec-col.health');
      const healthMaxInput = healthSection.find('input[name="system.attributes.health.max"]');
      
      // Calculate original health max
      const rankValues = {
        "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
        "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
        "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
        "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000, "Beyond": 10000
      };
      const originalEnduranceValue = rankValues[originalEndurance] || 0;
      const currentEnduranceValue = this.actor.system?.abilities?.endurance?.value || 0;
      const currentHealthMax = this.actor.system?.attributes?.health?.max || 0;
      const originalHealthMax = currentHealthMax + (originalEnduranceValue - currentEnduranceValue);
      
      if (originalEnduranceValue > currentEnduranceValue) {
        if (dyingEffect) {
          healthMaxInput.css('cssText', dyingStyle);
          healthSection.find('.sec-head').css('cssText', 'background: #c62828 !important; color: white !important;');
        } else {
          healthMaxInput.css('cssText', impairedStyle);
          healthSection.find('.sec-head').css('cssText', 'background: #ef5350 !important; color: white !important;');
        }
        healthMaxInput.attr('title', `Reduced from ${originalHealthMax} due to Endurance loss`);
      }
      
      // Also check if current health exceeds new max and highlight
      const currentHealth = this.actor.system?.attributes?.health?.value || 0;
      if (currentHealth > currentHealthMax) {
        const healthValueInput = healthSection.find('input[name="system.attributes.health.value"]');
        healthValueInput.css('cssText', 'background: #fff3e0 !important; border-color: #ff9800 !important;');
        healthValueInput.attr('title', `Health (${currentHealth}) exceeds max (${currentHealthMax})`);
      }
    }
  }

  /**
   * Apply visual indicators for ability boosts/penalties from Active Effects (equipment, powers, etc.)
   * Highlights ability rows on the sheet when combatMods.abilityShifts has non-zero values.
   * Called from activateListeners alongside _applyImpairmentIndicators.
   */
  _applyAbilityBoostIndicators(html) {
    const mods = this.actor.system?.combatMods?.abilityShifts;
    if (!mods) return;

    const abilityKeys = {
      fighting:  "F",
      agility:   "A",
      strength:  "S",
      endurance: "E",
      reason:    "R",
      intuition: "I",
      psyche:    "P"
    };

    const rankValues = _RANK_VALUES;
    const RANKS = _RANKS;

    for (const [ability, letter] of Object.entries(abilityKeys)) {
      const cs = Number(mods[ability]) || 0;
      if (cs === 0) continue;

      // Don't overwrite dying/impaired indicators on Endurance
      if (ability === "endurance") {
        const scope = globalThis.MSH_FLAG_SCOPE || "msh-faserip";
        const hasDying = this.actor.effects.find(e => e.getFlag(scope, "isDying") || e.statuses?.has?.("dying"));
        const hasImpaired = this.actor.effects.find(e => e.getFlag(scope, "isImpairedEndurance"));
        if (hasDying || hasImpaired) continue;
      }

      const row = html.find('tr').filter(function() {
        return $(this).find('.ability-key').text().trim() === letter;
      });
      if (!row.length) continue;

      const baseRank = this.actor.system.abilities?.[ability]?.rank;
      if (!baseRank) continue;

      const baseIdx = RANKS.indexOf(baseRank);
      if (baseIdx < 0) continue;
      const effectiveIdx = Math.min(Math.max(baseIdx + cs, 0), RANKS.length - 1);
      const effectiveRank = RANKS[effectiveIdx];
      const effectiveValue = rankValues[effectiveRank] || 0;

      if (cs > 0) {
        // Boost — blue highlight
        const boostStyle = "background: #e3f2fd !important; border-color: #1565c0 !important; color: #1565c0 !important; font-weight: bold !important;";
        row.find('.ability-key').css('cssText', 'background: #1565c0 !important; color: white !important;');

        const sourceName = this._findAbilityShiftSource(ability);
        const tooltip = `Boosted +${cs}CS by ${sourceName}: ${baseRank}(${rankValues[baseRank] || 0}) → ${effectiveRank}(${effectiveValue})`;

        // Set the rank dropdown to show the effective rank
        const rankSelect = row.find(`select[name="system.abilities.${ability}.rank"]`);
        // CRITICAL: Remove name FIRST to prevent submitOnChange from saving the visual value
        rankSelect.prop('disabled', true);
        rankSelect.removeAttr('name');
        if (rankSelect.find(`option[value="${effectiveRank}"]`).length) {
          rankSelect.val(effectiveRank);
        }
        rankSelect.css('cssText', boostStyle);
        rankSelect.attr('title', tooltip);

        // Set the value input to show the effective value
        const valueInput = row.find(`input[name="system.abilities.${ability}.value"]`);
        // CRITICAL: Remove name FIRST to prevent submitOnChange from saving the visual value
        valueInput.removeAttr('name');
        valueInput.prop('readonly', true);
        valueInput.val(effectiveValue);
        valueInput.css('cssText', boostStyle + " text-align: center !important;");
        valueInput.attr('title', tooltip);

      } else {
        // Penalty — orange/amber highlight
        const penaltyStyle = "background: #fff3e0 !important; border-color: #ef6c00 !important; color: #ef6c00 !important; font-weight: bold !important;";
        row.find('.ability-key').css('cssText', 'background: #ef6c00 !important; color: white !important;');

        const sourceName = this._findAbilityShiftSource(ability);
        const tooltip = `Penalized ${cs}CS by ${sourceName}: ${baseRank}(${rankValues[baseRank] || 0}) → ${effectiveRank}(${effectiveValue})`;

        const rankSelect = row.find(`select[name="system.abilities.${ability}.rank"]`);
        // CRITICAL: Remove name FIRST to prevent submitOnChange from saving the visual value
        rankSelect.prop('disabled', true);
        rankSelect.removeAttr('name');
        if (rankSelect.find(`option[value="${effectiveRank}"]`).length) {
          rankSelect.val(effectiveRank);
        }
        rankSelect.css('cssText', penaltyStyle);
        rankSelect.attr('title', tooltip);

        const valueInput = row.find(`input[name="system.abilities.${ability}.value"]`);
        // CRITICAL: Remove name FIRST to prevent submitOnChange from saving the visual value
        valueInput.removeAttr('name');
        valueInput.prop('readonly', true);
        valueInput.val(effectiveValue);
        valueInput.css('cssText', penaltyStyle + " text-align: center !important;");
        valueInput.attr('title', tooltip);
      }
    }

    // ── Adjust Health / Karma display if any FASE or RIP abilities are shifted ──
    const faseShift = (Number(mods.fighting) || 0) + (Number(mods.agility) || 0) +
                      (Number(mods.strength) || 0) + (Number(mods.endurance) || 0);
    if (faseShift !== 0) {
      // Compute boosted health max from effective FASE values
      const effectiveHealth = ["fighting","agility","strength","endurance"].reduce((sum, ab) => {
        const base = this.actor.system.abilities?.[ab];
        const cs = Number(mods[ab]) || 0;
        if (cs === 0) return sum + parseInt(base?.value || 0);
        const idx = RANKS.indexOf(base?.rank);
        if (idx < 0) return sum + parseInt(base?.value || 0);
        const newIdx = Math.min(Math.max(idx + cs, 0), RANKS.length - 1);
        return sum + (rankValues[RANKS[newIdx]] || 0);
      }, 0);

      const baseHealth = parseInt(this.actor.system.abilities?.fighting?.value || 0) +
                          parseInt(this.actor.system.abilities?.agility?.value || 0) +
                          parseInt(this.actor.system.abilities?.strength?.value || 0) +
                          parseInt(this.actor.system.abilities?.endurance?.value || 0);
      const healthDelta = effectiveHealth - baseHealth;

      const healthSection = html.find('.sec-col.health');
      const healthMaxInput = healthSection.find('input[name="system.attributes.health.max"]');
      const healthValInput = healthSection.find('input[name="system.attributes.health.value"]');
      const boostStyle = "background: #e3f2fd !important; border-color: #1565c0 !important; color: #1565c0 !important; font-weight: bold !important;";

      if (healthDelta > 0) {
        healthMaxInput.val(effectiveHealth);
        healthMaxInput.removeAttr('name');
        healthMaxInput.prop('readonly', true);
        healthMaxInput.css('cssText', boostStyle);
        healthMaxInput.attr('title', `Base: ${baseHealth}, Boosted: +${healthDelta}`);

        const currentStored = parseInt(this.actor.system.attributes?.health?.value || 0);
        const boostedCurrent = Math.min(effectiveHealth, currentStored + healthDelta);
        healthValInput.val(boostedCurrent);
        healthValInput.removeAttr('name');
        healthValInput.prop('readonly', true);
        healthValInput.css('cssText', boostStyle);
        healthValInput.attr('title', `Base: ${currentStored}, Boosted: +${healthDelta}`);

        healthSection.find('.sec-head').css('cssText', 'background: #1565c0 !important; color: white !important;');
      } else if (healthDelta < 0) {
        const penaltyStyle = "background: #fff3e0 !important; border-color: #ef6c00 !important; color: #ef6c00 !important; font-weight: bold !important;";
        healthMaxInput.val(effectiveHealth);
        healthMaxInput.removeAttr('name');
        healthMaxInput.prop('readonly', true);
        healthMaxInput.css('cssText', penaltyStyle);
        healthMaxInput.attr('title', `Base: ${baseHealth}, Penalty: ${healthDelta}`);

        const currentStored = parseInt(this.actor.system.attributes?.health?.value || 0);
        const penalizedCurrent = Math.max(0, Math.min(effectiveHealth, currentStored + healthDelta));
        healthValInput.val(penalizedCurrent);
        healthValInput.removeAttr('name');
        healthValInput.prop('readonly', true);
        healthValInput.css('cssText', penaltyStyle);
        healthValInput.attr('title', `Base: ${currentStored}, Penalty: ${healthDelta}`);

        healthSection.find('.sec-head').css('cssText', 'background: #ef6c00 !important; color: white !important;');
      }
    }

    const ripShift = (Number(mods.reason) || 0) + (Number(mods.intuition) || 0) +
                     (Number(mods.psyche) || 0);
    if (ripShift !== 0) {
      const effectiveKarma = ["reason","intuition","psyche"].reduce((sum, ab) => {
        const base = this.actor.system.abilities?.[ab];
        const cs = Number(mods[ab]) || 0;
        if (cs === 0) return sum + parseInt(base?.value || 0);
        const idx = RANKS.indexOf(base?.rank);
        if (idx < 0) return sum + parseInt(base?.value || 0);
        const newIdx = Math.min(Math.max(idx + cs, 0), RANKS.length - 1);
        return sum + (rankValues[RANKS[newIdx]] || 0);
      }, 0);

      const baseKarma = parseInt(this.actor.system.abilities?.reason?.value || 0) +
                         parseInt(this.actor.system.abilities?.intuition?.value || 0) +
                         parseInt(this.actor.system.abilities?.psyche?.value || 0);
      const karmaDelta = effectiveKarma - baseKarma;

      const karmaSection = html.find('.sec-col.karma');
      const karmaMaxInput = karmaSection.find('input[data-field="karma-max"]');
      const boostStyle = "background: #e3f2fd !important; border-color: #1565c0 !important; color: #1565c0 !important; font-weight: bold !important;";
      const penaltyStyle = "background: #fff3e0 !important; border-color: #ef6c00 !important; color: #ef6c00 !important; font-weight: bold !important;";

      if (karmaDelta !== 0) {
        const style = karmaDelta > 0 ? boostStyle : penaltyStyle;
        karmaMaxInput.val(effectiveKarma);
        karmaMaxInput.removeAttr('name');
        karmaMaxInput.prop('readonly', true);
        karmaMaxInput.css('cssText', style);
        karmaMaxInput.attr('title', `Base: ${baseKarma}, ${karmaDelta > 0 ? "Boosted" : "Penalty"}: ${karmaDelta > 0 ? "+" : ""}${karmaDelta}`);
      }
    }
  }

  /**
   * Find the name of the effect causing an ability shift
   */
  _findAbilityShiftSource(ability) {
    const key = `system.combatMods.abilityShifts.${ability}`;
    for (const eff of this.actor.allApplicableEffects?.() || []) {
      if (eff.disabled) continue;
      for (const c of (eff.changes || [])) {
        if (c.key === key && Number(c.value) !== 0) return eff.name;
      }
    }
    return "Active Effect";
  }

  /** @override */
  _updateObject(event, formData) {
    // ── GUARD: Prevent effect-shifted ability display values from being persisted ──
    // The sheet display code overwrites rank selects and value inputs with shifted
    // visuals (e.g. Remarkable→Typical when grappled at -2CS). Despite removeAttr('name'),
    // Foundry's submitOnChange can race and include the shifted values in formData.
    // We only strip values that exactly match what the display code would have written
    // (the standard rank number for the shifted rank). Custom values pass through.
    const shifts = this.actor.system?.combatMods?.abilityShifts;
    if (shifts) {
      const RANKS = _RANKS;
      const rankValues = _RANK_VALUES;
      const abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
      for (const ab of abilities) {
        const cs = Number(shifts[ab]) || 0;
        if (cs === 0) continue;

        // Compute what the display code would have injected
        const baseRank = this.actor.system.abilities?.[ab]?.rank;
        if (!baseRank) continue;
        const baseIdx = RANKS.indexOf(baseRank);
        if (baseIdx < 0) continue;
        const shiftedIdx = Math.min(Math.max(baseIdx + cs, 0), RANKS.length - 1);
        const shiftedRank = RANKS[shiftedIdx];
        const shiftedValue = rankValues[shiftedRank] || 0;

        // Only strip if formData contains the exact shifted display values
        const fdRank = formData[`system.abilities.${ab}.rank`];
        const fdValue = formData[`system.abilities.${ab}.value`];
        if (fdRank === shiftedRank && fdRank !== baseRank) {
          console.warn(`[FASERIP] _updateObject guard: blocking shifted rank for ${ab}: ${fdRank} (base: ${baseRank})`);
          delete formData[`system.abilities.${ab}.rank`];
        }
        if (fdValue !== undefined && Number(fdValue) === shiftedValue && shiftedValue !== (this.actor.system.abilities[ab]?.value ?? -1)) {
          console.warn(`[FASERIP] _updateObject guard: blocking shifted value for ${ab}: ${fdValue} (stored: ${this.actor.system.abilities[ab]?.value})`);
          delete formData[`system.abilities.${ab}.value`];
        }
      }
    }

    // Expand the form data
    const expandedData = foundry.utils.expandObject(formData);

    // Call the parent update
    return super._updateObject(event, expandedData);
  }

  // Replace your existing _onDragStart method with this one
  _onDragStart(event) {
    // Don't process if shift key is held (let the specific item handlers manage sorting)
    if (event.shiftKey) return;
    
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (item) {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "FaseripItem",  // Changed from "Item"
        actorId: this.actor.id,
        itemId: item.id,
        uuid: item.uuid,
        data: item
      }));
    }
  }
  
  async close(options = {}) {
    // Unregister the in-sheet Universal Table hook when the sheet closes
    if (this._universalTableHookId) {
      Hooks.off('msh-faserip.universalTableRoll', this._universalTableHookId);
      this._universalTableHookId = null;
    }
    // Close the detached Universal Table popout if open
    if (this._utTab?._popout?.rendered) {
      try { await this._utTab._popout.close({ _reattach: true }); } catch (_) {}
      this._utTab._popout = null;
    }
    return super.close(options);
  }

  _computeHQRentStatus(lastPaidStr) {
    try {
      const d = game.msh.getCampaignDateTime().date;
      const nowMonth = d.getMonth();
      const nowYear = d.getFullYear();
      if (!lastPaidStr) return { status: "new", label: "NEW", cssClass: "rent-new" };
      const parts = lastPaidStr.split("/");
      if (parts.length < 3) return { status: "new", label: "NEW", cssClass: "rent-new" };
      const paidMonth = parseInt(parts[0]) - 1;
      const paidYear = parseInt(parts[2]);
      const monthsDiff = (nowYear - paidYear) * 12 + (nowMonth - paidMonth);
      if (monthsDiff <= 0) return { status: "current", label: "CURRENT", cssClass: "rent-current" };
      if (monthsDiff === 1) return { status: "due", label: "DUE", cssClass: "rent-due" };
      return { status: "overdue", label: "OVERDUE", cssClass: "rent-overdue" };
    } catch { return null; }
  }

  // Shared stabilize sub-dialog — opened from both the Recovery & Rest
  // dialog's Stabilize Dying button and the inline Health-column button.
  // Deducts karma via history entry + sets the appropriate dying flag.
  _openStabilizeSubDialog(actor, dyingEffect, scope) {
    const _spendKarma = async (amount, description) => {
      const available = actor.availableKarma ?? 0;
      if (available < amount) {
        ui.notifications.warn(`${actor.name} has only ${available} Karma — need ${amount}.`);
        return false;
      }
      let gameDate = "";
      try {
        const d = game.msh?.getCampaignDateTime?.()?.date;
        if (d) gameDate = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
      } catch (_e) { /* noop */ }
      const history = foundry.utils.deepClone(actor.system.karma?.history || []);
      history.push({
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate,
        amount: -amount,
        type: "Dying Stabilize",
        description
      });
      await actor.update({ "system.karma.history": history });
      return true;
    };
    new Dialog({
      title: `Stabilize ${actor.name}`,
      content: `<div style="padding:8px;"><p><strong>${actor.name}</strong> is dying!</p>
        <p style="font-size:.9em;color:#555;">Available Karma: <strong>${actor.availableKarma ?? 0}</strong></p>
        <p>Choose stabilization method:</p></div>`,
      buttons: {
        karma50: {
          label: "50 Karma (1 round pause)",
          callback: async () => {
            const ok = await _spendKarma(50, "Stabilize Endurance for 1 round");
            if (!ok) return;
            await dyingEffect.setFlag(scope, "stabilizedRounds", 1);
            ChatMessage.create({ content: `<p style="color:#ff9800;"><strong>${actor.name}</strong> stabilized for 1 round (50 Karma spent)!</p>` });
            ui.notifications.info(`${actor.name} stabilized for 1 round`);
          }
        },
        karma200: {
          label: "200 Karma + FEAT",
          callback: async () => {
            const ok = await _spendKarma(200, "Endurance re-FEAT on next rank slip");
            if (!ok) return;
            await dyingEffect.setFlag(scope, "reFeatOnSlip", true);
            ChatMessage.create({ content: `<p style="color:#2196f3;"><strong>${actor.name}</strong> will re-FEAT on next Endurance slip (200 Karma spent).</p>` });
            ui.notifications.info(`${actor.name} will re-FEAT on next slip`);
          }
        },
        aid: {
          label: "Aid/First Aid (permanent)",
          callback: async () => { await game.msh.rest.stabilizeDying(actor); }
        },
        cancel: { label: "Cancel", callback: () => {} }
      },
      default: "aid"
    }).render(true);
  }

  // In actorSheet.js, add to the activateListeners function
  activateListeners(html) {
    super.activateListeners(html);

    // Apply compact mode class from actor flag
    const compact = this.actor.getFlag("msh-faserip", "compactSheet") ?? false;
    const form = html.closest('.faserip-sheet');
    
    // Fix dark grey gap: match window-content background to form
    html.closest('.window-content').css({ 'background-image': 'none', 'background-color': '#fcf8eb' });
    
    form.toggleClass('compact-mode', compact);

    // In compact mode, force initial columns hidden (reuse existing initial-hidden CSS)
    const $abilitiesTable = html.find('.primary-abilities .abilities-table');
    const $abilitiesSection = html.find('.abilities-section');
    if (compact) {
      $abilitiesTable.addClass('initial-hidden');
      $abilitiesSection.addClass('initial-hidden');
    }

    // Apply compact sheet dimensions — only force auto-height on first
    // compact render so that subsequent re-renders (e.g. toggling an
    // equipment ActiveEffect) don't remeasure and balloon the window.
    if (compact) {
      if (this.position.width > 513) {
        this.position.width = 513;
        this.setPosition({ width: 513 });
      }
      if (!this._compactSized) {
        this._compactSized = true;
        this.position.height = "auto";
        this.setPosition({ width: this.position.width, height: "auto" });
      }
    } else {
      this._compactSized = false;
    }

    // ── Ctrl+Wheel zoom on sheet ──
    initSheetZoom(this);

    // Inline item-field edits (e.g. shotsRemaining count on equipment rows)
    html.find('.item-field').change(async ev => {
      const input  = ev.currentTarget;
      const itemId = input.dataset.itemId;
      const field  = input.name;          // e.g. "system.shotsRemaining"
      const value  = Number(input.value);
      if (!itemId || !field) return;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      await item.update({ [field]: value });
    });

    // Apply visual indicators for Endurance impairment and health max reduction
    this._applyImpairmentIndicators(html);

    // Apply visual indicators for ability boosts/penalties from equipment Active Effects
    this._applyAbilityBoostIndicators(html);

    // Initialize Character Generation Tab
    this._initChargenTab(html);

    // Sheet lock toggle
    html.find('.sheet-lock-toggle').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this._toggleSheetLock(html);
    });

    // Compact mode toggle button
    html.find('.compact-toggle').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = this.actor.getFlag("msh-faserip", "compactSheet") ?? false;
      this._compactSized = false; // reset so next render re-applies auto height
      await this.actor.setFlag("msh-faserip", "compactSheet", !current);
      // Resize sheet for compact mode
      const newWidth = !current ? 513 : 700;
      const newHeight = !current ? "auto" : 800;
      this.position.width = newWidth;
      this.position.height = newHeight;
      this.setPosition({ width: newWidth, height: newHeight });
    });

    const isLocked = this.actor.getFlag('msh-faserip', 'sheetLocked') || false;
    if (isLocked) {
      html.closest('.faserip-sheet').addClass('sheet-locked');
    }

    // Movement info chat button
    html.find('.movement-chat-btn').on('click', (event) => {
      event.preventDefault();
      this._sendMovementToChat();
    });

    // Movement label click handlers (for FEAT dialogs)
    html.find('.movement-label.clickable').on('click', (event) => {
      event.preventDefault();
      const movementType = event.currentTarget.dataset.movement;
      
      // Lazy-initialize MovementFeats helper
      if (!this._movementFeats) {
        this._movementFeats = new MovementFeats(this);
      }
      
      switch (movementType) {
        case 'leap':
          this._movementFeats.showLeapDialog();
          break;
        case 'fly':
          this._movementFeats.showFlyDialog();
          break;
        case 'run':
          this._movementFeats.showRunDialog();
          break;
        case 'swim':
          this._movementFeats.showSwimDialog();
          break;
        case 'teleport':
          this._movementFeats.showTeleportDialog();
          break;
      }
    });

    // Auto-populate Resources value when rank changes
    html.find('select[name="system.attributes.resources.rank"]').change((event) => {
      const selectedRank = $(event.currentTarget).val();
      
      const rankList = [
        { name: "Shift-0", min: 0 },
        { name: "Feeble", min: 1 },
        { name: "Poor", min: 3 },
        { name: "Typical", min: 5 },
        { name: "Good", min: 8 },
        { name: "Excellent", min: 16 },
        { name: "Remarkable", min: 26 },
        { name: "Incredible", min: 36 },
        { name: "Amazing", min: 46 },
        { name: "Monstrous", min: 63 },
        { name: "Unearthly", min: 88 }
      ];
      
      const rank = rankList.find(r => r.name === selectedRank);
      if (rank) {
        html.find('input[name="system.attributes.resources.value"]').val(rank.min);
        this.actor.update({ "system.attributes.resources.value": rank.min });
      }
    });

    // Auto-populate ability value when rank changes — if current value is
    // outside the new rank's range, confirm before snapping to standard value.
    // Respects custom in-range values (e.g. Unearthly 95 stays 95 on re-select).
    // Shift-0 always snaps to 0 (no range defined).
    const ABILITY_KEYS = ["fighting","agility","strength","endurance","reason","intuition","psyche"];
    for (const ability of ABILITY_KEYS) {
      html.find(`select[name="system.abilities.${ability}.rank"]`).change(async (event) => {
        const $sel = $(event.currentTarget);
        const newRank = $sel.val();
        const currentValue = Number(this.actor.system?.abilities?.[ability]?.value ?? 0);
        const stdValue = _RANK_VALUES[newRank] ?? 0;
        const range = _RANK_RANGES[newRank];

        // Shift-0 or unknown ranks: snap to standard (no confirm — no meaningful value)
        if (!range) {
          await this.actor.update({ [`system.abilities.${ability}.value`]: stdValue });
          return;
        }

        const [min, max] = range;
        // In-range → preserve custom value, no prompt
        if (currentValue >= min && currentValue <= max) return;

        const abilityLabel = ability.charAt(0).toUpperCase() + ability.slice(1);
        const rangeLabel = Number.isFinite(max) ? `${min}–${max}` : `${min}+`;
        const proceed = await Dialog.confirm({
          title: `Update ${abilityLabel} value?`,
          content: `
            <div style="padding:6px 0;font-size:13px;">
              <p>Current ${abilityLabel} value <strong>${currentValue}</strong> is outside
                the <strong>${newRank}</strong> range (${rangeLabel}).</p>
              <p>Update to standard value <strong>${stdValue}</strong>?</p>
              <p style="color:#888;font-size:12px;">Choose "Keep ${currentValue}" to preserve
                a custom value (rank and value will be mismatched).</p>
            </div>
          `,
          yes: () => true,
          no:  () => false,
          defaultYes: true,
          options: { jQuery: false }
        });
        if (proceed) {
          await this.actor.update({ [`system.abilities.${ability}.value`]: stdValue });
        }
        // proceed === false or null → keep current value, no update needed
      });
    }

    // Hide initial roll/rank columns functionality
    const $table = html.find('.primary-abilities .abilities-table');
    const $section = html.find('.abilities-section');

    // Apply saved initial columns visibility state
    const hideInitialColumns = this.actor.getFlag('msh-faserip', 'hideInitialColumns');
    if (hideInitialColumns) {
      $table.addClass('initial-hidden');
      $section.addClass('initial-hidden');
    }

    // Ctrl+click either "Initial" header (keep this existing functionality)
    html.find('.primary-abilities .abilities-table thead th.initial.toggle-header').on('click', ev => {
      if (!ev.ctrlKey) return;
      $table.toggleClass('initial-hidden');
      $section.toggleClass('initial-hidden');
    });

    // Click the icon to toggle initial columns visibility
    // Click the icon to toggle initial columns visibility
html.find('.primary-abilities thead').on('click', '.initial-columns-toggle', (event) => {
  console.log('=== INITIAL COLUMNS TOGGLE CLICKED ===');
  console.log('Event:', event);
  console.log('Target:', event.target);
  console.log('CurrentTarget:', event.currentTarget);
  
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  
  const wasHidden = $table.hasClass('initial-hidden');
  console.log('Before toggle - Table has initial-hidden:', wasHidden);
  console.log('Before toggle - Section has initial-hidden:', $section.hasClass('initial-hidden'));
  
  $table.toggleClass('initial-hidden');
  $section.toggleClass('initial-hidden');
  
  const nowHidden = $table.hasClass('initial-hidden');
  console.log('After toggle - Table has initial-hidden:', nowHidden);
  console.log('After toggle - Section has initial-hidden:', $section.hasClass('initial-hidden'));
  
  // Save preference
  this.actor.setFlag('msh-faserip', 'hideInitialColumns', nowHidden);
  console.log('Flag saved:', nowHidden);
  console.log('=== END TOGGLE ===\n');
  
  return false;
});


    // Listen for universal table rolls so the in-sheet tab also highlights results
    if (!this._universalTableHookId) {
      this._onSheetUniversalTableRoll; // keep method bound to this instance
      this._universalTableHookId = Hooks.on('msh-faserip.universalTableRoll', (data) => {
        this._onSheetUniversalTableRoll(data);
      });
    }

    // Recovery & Rest Button Handlers
    // Sheet-level inline Recovery button (shows only when eligible).
    // One click → apply recovery, rerender sheet. No confirmation dialog.
    // Stops propagation so the click doesn't bubble to the Health header
    // (which opens the Recovery & Rest dialog).
    html.find('.health-recovery-inline-btn').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!game.msh?.rest) {
        ui.notifications.error("Rest system not initialized!");
        return;
      }
      const result = await game.msh.rest.attemptRecovery(this.actor);
      if (result?.success) {
        this.render(false);
      }
    });

    // Sheet-level inline Healing button (shows only when eligible).
    // Mirrors Recovery: one click → apply healing, rerender sheet.
    html.find('.health-healing-inline-btn').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!game.msh?.rest) {
        ui.notifications.error("Rest system not initialized!");
        return;
      }
      const result = await game.msh.rest.attemptHealing(this.actor);
      if (result?.success) {
        this.render(false);
      }
    });

    // Sheet-level inline Wake Up button (0 HP, not dying).
    html.find('.health-wake-inline-btn').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!game.msh?.rest) {
        ui.notifications.error("Rest system not initialized!");
        return;
      }
      const result = await game.msh.rest.attemptRegainConsciousness(this.actor);
      if (result?.success) {
        this.render(false);
      }
    });

    // Sheet-level inline Stabilize Dying button (dying effect active).
    // Opens the shared sub-dialog with 50/200/Aid options.
    html.find('.health-stabilize-inline-btn').click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scope = "msh-faserip";
      const dyingEffect = this.actor.effects.find(e =>
        e.getFlag(scope, "isDying") || e.statuses?.has?.("dying")
      );
      if (!dyingEffect) {
        ui.notifications.warn(`${this.actor.name} is not dying`);
        return;
      }
      this._openStabilizeSubDialog(this.actor, dyingEffect, scope);
    });

    // Health header click -> Recovery & Rest dialog
    html.find('.health-recovery-link').click(async (event) => {
      event.preventDefault();
      const actor = this.actor;
      const recoveryUsedToday = this.getData().recoveryUsedToday;
      const healingUnavailable = this.getData().healingUnavailable;
      const healthAtMax = this.getData().healthAtMax;
      const healingCooldownRemaining = this.getData().healingCooldownRemaining;
      const medicalCare = actor.getFlag('msh-faserip', 'medicalCare') || false;
      const isInCrisis = this.getData().isInCrisis;
      const isDying = this.getData().isDying;
      const sheet = this;

      let crisisHtml = '';
      if (isInCrisis) {
        if (!isDying) {
          crisisHtml += `<button type="button" class="recovery-btn crisis-btn" data-action="wake-up" title="Attempt to Regain Consciousness"><i class="fas fa-eye"></i> Wake Up (0 HP)</button>`;
        }
        if (isDying) {
          crisisHtml += `<button type="button" class="recovery-btn crisis-btn" data-action="stabilize" title="Stabilize Dying Character"><i class="fas fa-medkit"></i> Stabilize Dying</button>`;
        }
      }

      // Build healing tooltip
      let healingTitle = 'Attempt Healing (1 hour)\nRegain Health equal to Endurance rank';
      if (healthAtMax) healingTitle += '\nHealth is already at maximum';
      else if (healingCooldownRemaining) healingTitle += `\nOn cooldown: ${healingCooldownRemaining} min remaining`;
      else if (healingUnavailable) healingTitle += '\nTake damage first to start healing timer';

      const dlg = new Dialog({
        title: `${actor.name} — Recovery & Rest`,
        content: `
          <div class="faserip-recovery-dialog" style="padding:8px;">
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
              <button type="button" class="recovery-btn${recoveryUsedToday ? ' used-today' : ''}" data-action="recovery" ${recoveryUsedToday ? 'disabled' : ''}
                      title="Attempt Recovery (10 rounds)\nRegain Health equal to Endurance rank${recoveryUsedToday ? '\nAlready used today' : ''}">
                <i class="fas ${recoveryUsedToday ? 'fa-check' : 'fa-clock'}"></i> ${recoveryUsedToday ? 'Recovered' : 'Recovery (10 rnd)'}
              </button>
              <button type="button" class="recovery-btn" data-action="healing" ${healingUnavailable ? 'disabled' : ''}
                      title="${healingTitle}">
                <i class="fas fa-heart"></i> Healing (1 hr)
              </button>
              <button type="button" class="recovery-btn medical-toggle${medicalCare ? ' active' : ''}" data-action="medical-care"
                      title="Toggle Medical Care\nDoubles healing rate when active">
                <i class="fas fa-hospital"></i> Medical: ${medicalCare ? 'ON' : 'OFF'}
              </button>
            </div>
            ${crisisHtml ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">${crisisHtml}</div>` : ''}
          </div>`,
        buttons: {},
        render: (html) => {
          html.find('.recovery-btn').click(async (ev) => {
            ev.preventDefault();
            const action = $(ev.currentTarget).data('action');
            if (!game.msh?.rest) {
              ui.notifications.error("Rest system not initialized!");
              return;
            }
            switch(action) {
              case 'recovery':
                await game.msh.rest.attemptRecovery(actor);
                dlg.close();
                sheet.render(false);
                break;
              case 'healing':
                await game.msh.rest.attemptHealing(actor);
                dlg.close();
                sheet.render(false);
                break;
              case 'medical-care': {
                const cur = actor.getFlag('msh-faserip', 'medicalCare') || false;
                await game.msh.rest.setMedicalCare(actor, !cur);
                const btn = $(ev.currentTarget);
                btn.toggleClass('active');
                btn.html(`<i class="fas fa-hospital"></i> Medical: ${!cur ? 'ON' : 'OFF'}`);
                sheet.render(false);
                break;
              }
              case 'wake-up':
                await game.msh.rest.attemptRegainConsciousness(actor);
                dlg.close();
                sheet.render(false);
                break;
              case 'stabilize': {
                const scope = "msh-faserip";
                const dyingEffect = actor.effects.find(e => 
                  e.getFlag(scope, "isDying") || e.statuses?.has?.("dying")
                );
                if (!dyingEffect) {
                  ui.notifications.warn(`${actor.name} is not dying`);
                  return;
                }
                dlg.close();
                this._openStabilizeSubDialog(actor, dyingEffect, scope);
                break;
              }
            }
          });
        }
      }, { width: 380 });
      dlg.render(true);
    });


    // Collapsible effect sections
    html.find('.effect-header').click((event) => {
      // Don't collapse if clicking the add button
      if ($(event.target).closest('.btn-add').length) return;
      
      const header = $(event.currentTarget);
      const section = header.closest('.effect-section');
      section.toggleClass('collapsed');
    });
    
    // Existing effect management
    html.find('.effect-control').click(ev => {
      if ($(ev.currentTarget).data('action') === 'create') {
        onManageActiveEffect(ev, this.actor);
      } else {
        const li = $(ev.currentTarget).closest('.effect-row');
        if (li.length) {
          onManageActiveEffect(ev, this.actor);
        }
      }
    });

    // Make the universal roll trigger draggable for macros
    html.find('.universal-roll-trigger').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        // Use the same format as item drag handling
        const actorId = this.actor.id;
        
        // Create dragData similar to item drag data but for universal table
        const dragData = {
          type: "UniversalTable",
          actorId: actorId,
          // You can include other data needed for the universal table
          data: {
            name: `Universal Table (${this.actor.name})`,
            img: "icons/svg/d20-grey.svg"
          }
        };
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Talents - draggable and sortable
    html.find('.talent-item').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
    
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "TalentSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "TalentSort") return;
    
          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;
    
          const items = this.actor.items
            .filter(i => i.type === "talent")
            .sort((a, b) => a.sort - b.sort);
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;
    
          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);
    
          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);
    
          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));
    
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in talent drag and drop:", err);
        }
      });
    });

    // Contacts made draggable/sortable w/in the contact tab
    // Contacts - draggable and sortable
    html.find('.contact-item').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
    
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "ContactSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag - use format from older file that works
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    
      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });
    
      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });
    
      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();
    
        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "ContactSort") return;
    
          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;
    
          const items = this.actor.items
            .filter(i => i.type === "contact")
            .sort((a, b) => a.sort - b.sort);
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;
    
          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);
    
          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);
    
          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));
    
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in contact drag and drop:", err);
        }
      });
    });
    
    // Equipment - draggable and sortable
    html.find('.equipment-row').each((i, row) => {
      row.setAttribute("draggable", true);
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;

        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "EquipmentSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "EquipmentSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "equipment")
            .sort((a, b) => a.sort - b.sort);
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;

          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);

          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);

          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));

          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in equipment drag and drop:", err);
        }
      });
    });

    // Make entire vehicle rows draggable (like powers and talents)
    html.find('.vehicle-row').each((i, row) => {
      // No need to set draggable="true" here if it's already in the HTML
      
      row.addEventListener("dragstart", ev => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
        
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "VehicleSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (sourceData.type !== "VehicleSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "vehicle")
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;

          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);

          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);

          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));

          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in vehicle drag and drop:", err);
        }
      });
    });

    // Headquarters - draggable and sortable
    html.find('.headquarters-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        // If shift key is pressed, do sorting, otherwise create a macro
        let dragData;
        if (ev.shiftKey) {
          dragData = {
            type: "HeadquartersSort",
            itemId: itemId
          };
        } else {
          // Hotbar macro drag
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Biography Toggle Button
    html.find('.biography-toggle').click(ev => {
      ev.preventDefault();
      // Toggle the biography open state
      this._isBiographyOpen = !this._isBiographyOpen;
      // Re-render the sheet
      this.render(false);
    });

    // Handle form changes in biography section
/*     html.find('.biography-details input, .biography-details textarea').change(ev => {
      const formData = this._getSubmitData();
      this.actor.update(formData);
    }); */

    // Karma History — click the Karma header in secondary abilities
    html.find('.karma-history-link').click(ev => {
      import('./karma-sheet-v2.js').then(module => {
        const sheet = new module.KarmaSheetV2(this.actor);
        sheet.render(true);
      });
    });

    // Add Power button - more direct approach
    html.find('.add-power').click(ev => {
      console.log("Add Power button clicked"); // Debug line

      // Create the new power item data
      const itemData = {
        name: "New Power",
        type: "power",
        system: {
          description: "",
          rank: "Typical",
          value: 6,
          range: "",
          type: "",
          subtype: "",
          isActive: true,
          activationType: "activated"
        },
        sort: this.actor.items.size  // sort added
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Power created successfully");
          this.render(false); // Re-render the sheet to show the new power
        })
        .catch(err => console.error("Error creating power:", err));
    });

    // Listener for powers
    // Powers - draggable and sortable
    html.find('.power-row').each((i, row) => {
      // We don't need to set draggable=true here since it's already in the HTML
      
      row.addEventListener("dragstart", ev => {
        console.log("Power drag start", ev.shiftKey);
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        let dragData;
        
        if (ev.shiftKey) {
          // Sorting drag
          dragData = {
            type: "PowerSort",
            itemId: itemId
          };
          console.log("Power sort drag", dragData);
        } else {
          // Hotbar macro drag
          dragData = {
            type: "FaseripItem",
            actorId: this.actor.id,
            itemId: item.id,
            uuid: item.uuid,
            data: item
          };
          console.log("Power hotbar drag", dragData);
        }
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });

      row.addEventListener("dragover", ev => {
        ev.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", ev => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", async ev => {
        row.classList.remove("drag-over");
        ev.preventDefault();

        try {
          const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
          console.log("Drop data", sourceData);
          
          if (sourceData.type !== "PowerSort") return;

          const sourceId = sourceData.itemId;
          const targetId = row.dataset.itemId;
          if (!sourceId || !targetId || sourceId === targetId) return;

          const items = this.actor.items
            .filter(i => i.type === "power")
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
          const source = items.find(i => i.id === sourceId);
          const target = items.find(i => i.id === targetId);
          if (!source || !target) return;

          const sourceIndex = items.indexOf(source);
          const targetIndex = items.indexOf(target);

          items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, source);

          const updates = items.map((item, index) => ({
            _id: item.id,
            sort: index
          }));

          console.log("Updating items with new sort order", updates);
          await this.actor.updateEmbeddedDocuments("Item", updates);
          this.render();
        } catch (err) {
          console.error("Error in power drag and drop:", err);
        }
      });
    });

    // Add Resistance
    html.find('.add-resistance').click(async (ev) => {
      ev.preventDefault();
      
      // Ensure resistances is always initialized as an array
      let resistances = foundry.utils.deepClone(this.actor.system.resistances);
      if (!Array.isArray(resistances)) {
        resistances = [];
      }
    
      resistances.push({ type: "physical", rank: "Good", value: 10 });
      await this.actor.update({ "system.resistances": resistances });
    });

    // Resistance Info Dialog
    html.find('.resistance-info').click(ev => {
      ev.preventDefault();
      const index = Number(ev.currentTarget.dataset.index);
      const resistance = this.actor.system.resistances[index];
      if (!resistance) return;

      new Dialog({
        title: "Resistance Information",
        content: `
          <p><strong>Type:</strong> ${resistance.type}</p>
          <p><strong>Rank:</strong> ${resistance.rank} (${resistance.value})</p>
        `,
        buttons: { close: { label: "Close" } }
      }).render(true);
    });

    // Resistance edit button
    html.find('.resistance-edit').click(ev => {
      const index = $(ev.currentTarget).data("index");
      
      // Handle different data structures for resistances
      let resistances;
      if (Array.isArray(this.actor.system.resistances)) {
        resistances = this.actor.system.resistances;
      } else if (this.actor.system.resistances && typeof this.actor.system.resistances === 'object') {
        resistances = Object.values(this.actor.system.resistances);
      } else {
        resistances = [];
      }
      
      const resistance = resistances[index];
      
      if (!resistance) {
        console.error("No resistance found at index:", index);
        return;
      }
      
      let content = `
        <form>
          <div class="form-group">
            <label>Resistance Type</label>
            <select id="resistance-type" name="type">
              <option value="physical" ${resistance.type === "physical" ? "selected" : ""}>Physical</option>
              <option value="energy" ${resistance.type === "energy" ? "selected" : ""}>Energy</option>
              <option value="mental" ${resistance.type === "mental" ? "selected" : ""}>Mental</option>
              <option value="magical" ${resistance.type === "magical" ? "selected" : ""}>Magical</option>
              <option value="fire" ${resistance.type === "fire" ? "selected" : ""}>Fire</option>
              <option value="cold" ${resistance.type === "cold" ? "selected" : ""}>Cold</option>
              <option value="electricity" ${resistance.type === "electricity" ? "selected" : ""}>Electricity</option>
              <option value="radiation" ${resistance.type === "radiation" ? "selected" : ""}>Radiation</option>
              <option value="toxin" ${resistance.type === "toxin" ? "selected" : ""}>Toxin</option>
              <option value="corrosive" ${resistance.type === "corrosive" ? "selected" : ""}>Corrosive</option>
              <option value="disease" ${resistance.type === "disease" ? "selected" : ""}>Disease</option>
              <option value="emotion" ${resistance.type === "emotion" ? "selected" : ""}>Emotion</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rank</label>
            <select id="resistance-rank" name="rank">
              <option value="Shift-0">Shift-0</option>
              <option value="Feeble">Feeble</option>
              <option value="Poor">Poor</option>
              <option value="Typical">Typical</option>
              <option value="Good">Good</option>
              <option value="Excellent">Excellent</option>
              <option value="Remarkable">Remarkable</option>
              <option value="Incredible">Incredible</option>
              <option value="Amazing">Amazing</option>
              <option value="Monstrous">Monstrous</option>
              <option value="Unearthly">Unearthly</option>
              <option value="Shift-X">Shift-X</option>
              <option value="Shift-Y">Shift-Y</option>
              <option value="Shift-Z">Shift-Z</option>
              <option value="Class 1000">Class 1000</option>
              <option value="Class 3000">Class 3000</option>
              <option value="Class 5000">Class 5000</option>
              <option value="Beyond">Beyond</option>
            </select>
          </div>
          <div class="form-group">
            <label>Value</label>
            <input type="number" id="resistance-value" name="value" value="${resistance.value}">
          </div>
        </form>
      `;
      
      new Dialog({
        title: "Edit Resistance",
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: (html) => {
              const newType = html.find('#resistance-type').val();
              const newRank = html.find('#resistance-rank').val();
              const newValue = parseInt(html.find('#resistance-value').val()) || 0;
              
              // Ensure we're working with an array
              let updatedResistances;
              if (Array.isArray(this.actor.system.resistances)) {
                updatedResistances = foundry.utils.deepClone(this.actor.system.resistances);
              } else {
                updatedResistances = Object.values(this.actor.system.resistances || {});
              }
              
              updatedResistances[index] = {
                type: newType,
                rank: newRank,
                value: newValue
              };
              
              // Update the actor
              this.actor.update({
                "system.resistances": updatedResistances
              });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "save",
        width: 400
      }).render(true);
    });

    // Delete Resistance
    html.find('.delete-resistance').click(async (ev) => {
      ev.preventDefault();

      // Use jQuery consistently to access data attributes
      const index = Number($(ev.currentTarget).data("index"));
      
      console.log("Delete resistance - index:", index);
      console.log("Current resistances:", this.actor.system.resistances);
      console.log("Resistances type:", typeof this.actor.system.resistances);
      console.log("Is array:", Array.isArray(this.actor.system.resistances));
      
      // Handle different data structures
      let resistances;
      if (Array.isArray(this.actor.system.resistances)) {
        resistances = foundry.utils.deepClone(this.actor.system.resistances);
      } else if (this.actor.system.resistances && typeof this.actor.system.resistances === 'object') {
        // Convert object to array if needed
        resistances = Object.values(this.actor.system.resistances);
        console.log("Converted object to array:", resistances);
      } else {
        // Initialize as empty array if undefined
        resistances = [];
        console.log("Initialized empty array");
      }

      if (index >= 0 && index < resistances.length) {
        console.log("Removing resistance at index:", index, "Resistance:", resistances[index]);
        resistances.splice(index, 1);
        await this.actor.update({ "system.resistances": resistances });
        console.log("Updated resistances:", resistances);
      } else {
        console.error("Invalid resistance index:", index, "Array length:", resistances.length);
      }
    });

    // Browse Powers Compendium button
    html.find('.browse-compendium[data-type="powers"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "powers" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Powers compendium not found.");
      }
    });

    // Toggle power isActive from powers tab
    // Flips system.isActive AND enables/disables all transfer AEs on the power item
    // Also syncs defense AEs (body armor, force field, resistance) on the actor
    // Passive powers are always on and cannot be toggled
    html.find('.power-active-toggle').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;
      if (item.system.activationType === "passive") return;
      const newState = !item.system.isActive;
      await item.update({ "system.isActive": newState });
      // Sync transfer ActiveEffects: disabled = !isActive
      const transferEffects = item.effects.filter(e => e.transfer);
      if (transferEffects.length) {
        const updates = transferEffects.map(e => ({ _id: e.id, disabled: !newState }));
        await item.updateEmbeddedDocuments("ActiveEffect", updates);
      }
      // Defense AEs (BA, FF, Resistance) sync via updateItem hook in init.js
      // If Nullifying Power toggled off, stop the aura and restore powers
      if (!newState && (item.name || "").toLowerCase().includes("nullif")) {
        try {
          const { isAuraMaintained, stopAura } = await import("./modules/actions/nullify.js");
          if (isAuraMaintained(this.actor)) {
            await stopAura(this.actor);
            ui.notifications.info(`${this.actor.name} stops maintaining Nullification.`);
          }
        } catch (e) {
          console.error("[FASERIP ERROR] Failed to stop nullify aura on toggle:", e);
        }
      }
    });

    // Power info button
    html.find('.power-info').click(async ev => {
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      const sys = item.system;
      const rank = sys.rank || "—";
      const value = sys.value ?? "";
      const rangeDisplay = resolveRange(sys.range, rank);
      const derivations = getPowerDerivations(sys.type, rank, value);
      const isActive = !!sys.isActive;
      const powerIcon = item.img || "icons/svg/mystery-man.svg";

      const rankValueSuffix = value !== "" && value !== null && value !== undefined ? ` · ${value}` : "";
      const stats = [
        { label: "Rank",  value: `${rank}${rankValueSuffix}` },
        { label: "Range", value: rangeDisplay },
        ...derivations
      ];
      const statsHtml = stats.map(s =>
        `<div class="fpc-stat"><span class="fpc-k">${s.label}</span><span class="fpc-v">${s.value}</span></div>`
      ).join("");

      const stateHtml = isActive
        ? `<span class="fpc-pill fpc-pill-active"><span class="fpc-dot"></span>Active</span>`
        : `<span class="fpc-pill fpc-pill-dormant"><span class="fpc-dot"></span>Dormant</span>`;

      const dormantNote = isActive
        ? ""
        : `<div class="fpc-dormant-note">Power is not currently active</div>`;

      const descHtml = sys.description
        ? `<div class="fpc-desc">${sys.description}</div>`
        : "";

      const content = `
        <div class="fpc-card${isActive ? "" : " fpc-dormant"}">
          <div class="fpc-title-row">
            <img class="fpc-power-icon" src="${powerIcon}" alt="">
            <span class="fpc-power-name">${item.name}</span>
            ${stateHtml}
          </div>
          ${dormantNote}
          <div class="fpc-stats">${statsHtml}</div>
          ${descHtml}
        </div>
      `;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: content
      });
    });

    // Edit power button - more specific selector
    html.find('.powers-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete power button - more specific selector
    html.find('.powers-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");

      // Confirm deletion
      new Dialog({
        title: "Delete Power",
        content: "<p>Are you sure you want to delete this power?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll power button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.power-roll').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const li = $(ev.currentTarget).closest(".power-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) {
        console.error("Could not find power item");
        return;
      }

      const { rollPower } = await import("./modules/actions/power-router.js");
      return rollPower(this.actor, item);
    });

    ///////////////////////////////////////////////////////////////////////////////////////////
    // Add Talent button
    ///////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-talent').click(ev => {
      console.log("Add Talent button clicked"); // Debug line

      // Create the new talent item data
      const itemData = {
        name: "New Talent",
        type: "talent",
        system: {
          description: "",
          bonus: "+1CS",
          abilityModified: "",
          type: "",
          specialty: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Talent created successfully");
          this.render(false); // Re-render the sheet to show the new talent
        })
        .catch(err => console.error("Error creating talent:", err));
    });

    // Browse Talents Compendium button
    html.find('.browse-compendium[data-type="talents"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "talents" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Talents compendium not found.");
      }
    });

    // Talent info button
    html.find('.talent-info').click(ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a dialog to show talent information
      let content = `
    <h2>${item.name}</h2>
    <div class="talent-details">
      <div class="label">Bonus:</div><div>${item.system.bonus || 'None'}</div>
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Specialty:</div><div>${item.system.specialty || 'None'}</div>
      <div class="label">Ability Modified:</div><div>${item.system.abilityModified ? item.system.abilityModified.charAt(0).toUpperCase() + item.system.abilityModified.slice(1) : 'None'}</div>
    </div>
    <div class="description">${item.system.description || 'No description available.'}</div>
  `;

      new Dialog({
        title: "Talent Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });

    // Edit talent button
    html.find('.talents-list .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete talent button
    html.find('.talents-list .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Talent",
        content: "<p>Are you sure you want to delete this talent?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // roll talent button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.talent-roll').click(async ev => {
      const actor = this.actor;
      const li = $(ev.currentTarget).closest(".talent-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      await game.msh.rollTalent(actor, item);
    });

    ////////////////////////////////////////////////////////////////////////////////////////
    // Add Contact button
    ////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-contact').click(ev => {
      console.log("Add Contact button clicked"); // Debug line

      // Create the new contact item data
      const itemData = {
        name: "New Contact",
        type: "contact",
        system: {
          description: "",
          type: "",
          disposition: "Friendly",
          specialties: [],
          location: "",
          notes: "" // Add notes field
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(() => {
          console.log("Contact created successfully");
          this.render(false); // Re-render the sheet to show the new contact
        })
        .catch(err => console.error("Error creating contact:", err));
    });

    // Browse Contacts Compendium button
    html.find('.browse-compendium[data-type="contacts"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "contacts" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Contacts compendium not found.");
      }
    });

    // Contact info button
    html.find('.contact-info').click(ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a dialog to show contact information
      let content = `
    <h2>${item.name}</h2>
    <div class="contact-details">
      <div class="label">Type:</div><div>${item.system.type || 'None'}</div>
      <div class="label">Disposition:</div><div>${item.system.disposition || 'Friendly'}</div>
      <div class="label">Location:</div><div>${item.system.location || 'Unknown'}</div>
    </div>
    
    ${item.system.notes ? `
    <div class="contact-notes">
      <h3>Notes:</h3>
      <div>${item.system.notes}</div>
    </div>
    ` : ''}
    
    <div class="contact-description">
      <h3>Description:</h3>
      <div>${item.system.description || 'No description available.'}</div>
    </div>
  `;

      new Dialog({
        title: "Contact Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });;

    // Edit contact button
    html.find('.contacts-list .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete contact button
    html.find('.contacts-list .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Contact",
        content: "<p>Are you sure you want to delete this contact?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll Contact button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.contact-roll').click(async ev => {
      const actor = this.actor;
      const li = $(ev.currentTarget).closest(".contact-item");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      const { rollContact } = await import("./modules/actions/contact-action.js");
      return rollContact(actor, item);
    });

    // Equipment tab: hide empty groups, decode damage type badges
    const dtypeLabels = {
      S: "Shooting", E: "Energy", F: "Force",
      EA: "Edged", BA: "Blunt", TE: "Throw-Edged", TB: "Throw-Blunt",
      GP: "Grappling", Gb: "Grabbing", Stun: "Stunning"
    };
    html.find('.equip-group').each(function() {
      const group = $(this);
      const hasRows = group.find('tbody tr').length > 0;
      if (!hasRows) group.hide();
    });
    html.find('.equipment-type-badge').each(function() {
      const el = $(this);
      const code = el.data('dtype') || el.text().trim();
      if (dtypeLabels[code]) el.text(dtypeLabels[code]);
    });

    // Add Equipment button
    html.find('.add-equipment').click(ev => {
      console.log("Add Equipment button clicked"); // Debug line

      // Create the new equipment item data
      const itemData = {
        name: "New Equipment",
        type: "equipment",
        system: {
          description: "",
          materialStrength: "Typical",
          category: "gear",
          price: "Poor",
          notes: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Equipment created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating equipment:", err));
    });

    // Browse Equipment Compendium button
    html.find('.browse-compendium[data-type="equipment"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "equipment" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Equipment compendium not found.");
      }
    });

    // Equipment info button
    html.find('.equipment-info').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (!item) return;

      // Create a dialog to show equipment information
      let content = `
        <h2>${item.name}</h2>
        <div class="equipment-details">
          <p><strong>Category:</strong> ${item.system.category || 'None'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Price:</strong> ${item.system.price || 'Poor'}</p>`;
          
      // Add category-specific details
      if (item.system.category === "weapon") {
        content += `
          <p><strong>Weapon Type:</strong> ${item.system.weaponType || 'None'}</p>
          <p><strong>Range:</strong> ${item.system.range || 'None'}</p>
          <p><strong>Damage:</strong> ${item.system.damage || 'None'} (${item.system.damageType || 'None'})</p>
          <p><strong>Rate:</strong> ${item.system.rate || 'None'}</p>
          <p><strong>Shots:</strong> ${item.system.shotsRemaining || item.system.shots || 'None'}/${item.system.shots || 'None'}</p>`;
      } else if (item.system.category === "armor") {
        content += `
          <p><strong>Protection:</strong> ${item.system.protection || 'None'}</p>
          <p><strong>Coverage:</strong> ${item.system.coverage || 'Partial'}</p>`;
      } else if (item.system.category === "other") {
        details += `<p><strong>Type:</strong> ${item.system.weaponType || 'Other'}</p>`;
        if (item.system.weaponType === "grenade") {
          details += `<p><strong>Grenade Type:</strong> ${item.system.grenadeType || 'Unknown'}</p>`;
          details += `<p><strong>Damage:</strong> ${item.system.grenadeDamage || '—'}</p>`;
          details += `<p><strong>Radius:</strong> ${item.system.grenadeRadius || 1} area(s)</p>`;
          details += `<p><strong>Count:</strong> ${item.system.shotsRemaining ?? item.system.shots ?? 0}</p>`;
        }
      } else if (item.system.category === "power-item") {
        content += `
          <p><strong>Power Rank:</strong> ${item.system.powerRank || 'Typical'}</p>
          <p><strong>Power Type:</strong> ${item.system.powerType || 'None'}</p>
          <p><strong>Linked Ability:</strong> ${item.system.linkedAbility || 'None'}</p>`;
      }
      
      content += `
        </div>
        <div class="description">${item.system.description || 'No description available.'}</div>
        <div class="notes">${item.system.notes ? `<strong>Notes:</strong> ${item.system.notes}` : ''}</div>
      `;

      new Dialog({
        title: "Equipment Information",
        content: content,
        buttons: {
          close: {
            label: "Close"
          }
        },
        width: 400
      }).render(true);
    });

    // ── Equipment effect toggle: inject power button for items with effects ──
    html.find('.equipment-row').each((i, row) => {
      const itemId = row.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item || !item.effects.size) return;
      const hasTransfer = item.effects.some(e => e.transfer);
      if (!hasTransfer) return;
      const anyActive = item.effects.some(e => e.transfer && !e.disabled);
      const controls = row.querySelector('.equipment-controls');
      if (!controls) return;
      const btn = document.createElement('a');
      btn.classList.add('item-control', 'equipment-effect-toggle');
      btn.dataset.itemId = itemId;
      btn.title = anyActive ? 'Deactivate effects' : 'Activate effects';
      btn.innerHTML = `<i class="fas fa-power-off" style="color:${anyActive ? '#4CAF50' : '#999'};"></i>`;
      controls.prepend(btn);
    });

    html.on('click', '.equipment-effect-toggle', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      const transferEffects = item.effects.filter(e => e.transfer);
      if (!transferEffects.length) return;
      const anyActive = transferEffects.some(e => !e.disabled);
      const updates = transferEffects.map(e => ({ _id: e.id, disabled: anyActive }));
      await item.updateEmbeddedDocuments("ActiveEffect", updates);
      const state = anyActive ? "OFF" : "ON";
      const stateColor = anyActive ? "#c62828" : "#2e7d32";
      const dur = Number(item.system.duration);
      const unit = item.system.durationUnit || "hour";
      let durationLine = "";
      if (!anyActive && dur > 0) {
        const unitLabel = dur === 1 ? unit : unit + "s";
        durationLine = `<div style="font-size:.85em;color:#666;">Duration: ${dur} ${unitLabel}</div>`;
      }
      ChatMessage.create({
        content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
            <strong style="color:#8b0000;">EQUIPMENT</strong>
          </div>
          <div style="padding:6px 10px;">
            <div><strong>${this.actor.name}</strong> turns <strong style="color:${stateColor};">${state}</strong>: <strong>${item.name}</strong></div>
            ${durationLine}
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: this.actor })
      });
    });

    // Edit equipment button
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
    
      if (item) {
        // Open the item sheet for proper editing
        item.sheet.render(true);
      }
    });

    // Delete equipment button
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
    
      if (!itemId) return;
    
      // Confirm deletion
      new Dialog({
        title: "Delete Equipment",
        content: "<p>Are you sure you want to delete this equipment?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Roll equipment button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.equipment-roll').click(async ev => {
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      const { openEquipmentActionDialog } = await import("./modules/actions/equipment-action-dialog.js");
      return openEquipmentActionDialog(this.actor, item);
    });

    // Reload weapon
    html.find('.reload-weapon').click(ev => {
      ev.preventDefault();
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      
      if (item && item.system.category === "weapon") {
        // Reset shotsRemaining to full shots
        item.update({"system.shotsRemaining": item.system.shots})
          .then(() => {
            ui.notifications.info(`${item.name} reloaded.`);
            this.render(false);
          })
          .catch(err => {
            console.error("Error reloading weapon:", err);
            ui.notifications.error("Could not reload weapon.");
          });
      }
    });

    // Equipment-tab broken indicator — click red X to repair
    html.find('.equipment-repair').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;
      await item.update({ "system.broken": false });
      ui.notifications?.info(`${item.name} has been repaired.`);
    });

    // Intensity roll button (gear rows) — also opens unified dialog
    html.find('.equipment-intensity-roll').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).closest(".equipment-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      const { openEquipmentActionDialog } = await import("./modules/actions/equipment-action-dialog.js");
      return openEquipmentActionDialog(this.actor, item);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add Vehicle button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-vehicle').click(ev => {
      console.log("Add Vehicle button clicked"); // Debug line

      // Create the new vehicle item data
      const itemData = {
        name: "New Vehicle",
        type: "vehicle",
        system: {
          description: "",
          type: "Road",
          cost: "Typical",
          control: "Typical",
          speed: "Typical",
          body: "Typical", 
          protection: "Typical",
          compartmented: false,
          features: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Vehicle created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating vehicle:", err));
    });

    // Browse Vehicles Compendium button
    html.find('.browse-compendium[data-type="vehicles"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "vehicles" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Vehicles compendium not found.");
      }
    });

    // vehicle control feat button
    html.find('.vehicle-control-roll').each((i, btn) => {
      btn.addEventListener('click', async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const vehicle = this.actor.items.get(itemId);
        if (!vehicle) return ui.notifications.warn("Vehicle not found");
        this._rollVehicleControl(vehicle);
      });

      btn.addEventListener('dragstart', ev => {
        const command = `game.actors.get("${this.actor.id}").sheet._rollVehicleControl(game.actors.get("${this.actor.id}").items.get("${btn.dataset.itemId}"));`;
        const dragData = {
          type: "script",
          name: `Vehicle Control (${this.actor.name})`,
          img: "icons/svg/steering-wheel.svg",
          command
        };
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      });
    });

    // Vehicle info button (clickable image)
    html.find('.vehicle-info').click(ev => {
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      // Show vehicle details in a dialog
      let content = `
        <h2>${item.name}</h2>
        <div class="vehicle-details">
          <p><strong>Type:</strong> ${item.system.type}</p>
          <p><strong>Cost:</strong> ${item.system.cost}</p>
          <p><strong>Control:</strong> ${item.system.control}</p>
          <p><strong>Speed:</strong> ${item.system.speed}</p>
          <p><strong>Body:</strong> ${item.system.body}</p>
          <p><strong>Protection:</strong> ${item.system.protection}</p>
          <p><strong>Compartmented:</strong> ${item.system.compartmented ? "Yes" : "No"}</p>
        </div>
        ${item.system.features ? `<p><strong>Features:</strong> ${item.system.features}</p>` : ''}
        ${item.system.description ? `<div class="description">${item.system.description}</div>` : ''}
      `;

      new Dialog({
        title: "Vehicle Information",
        content,
        buttons: { close: { label: "Close" } },
        width: 400
      }).render(true);
    });

    // Make ONLY the vehicle name text draggable
    html.find('.vehicle-draggable').each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", ev => {
        const itemId = el.dataset.itemId;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "VehicleSort",
          itemId
        }));
      });
    });

    // Edit vehicle button
    html.find('.vehicles-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".vehicle-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete vehicle button
    html.find('.vehicles-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".vehicle-row");
      const itemId = li.data("itemId");

      if (!itemId) return;

      new Dialog({
        title: "Delete Vehicle",
        content: "<p>Are you sure you want to delete this vehicle?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add Headquarters button
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.add-headquarters').click(ev => {
      const itemData = {
        name: "New Headquarters",
        type: "headquarters",
        system: {
          description: "",
          buildingType: "",
          location: "",
          size: "",
          materialStrength: "Typical",
          ownership: "owned",
          purchaseCost: "",
          rentCost: "",
          rentalCost: "",
          isRichArea: false,
          packages: [],
          staff: [],
          features: "",
          notes: ""
        }
      };

      this.actor.createEmbeddedDocuments("Item", [itemData])
        .then(items => {
          console.log("Headquarters created successfully");
          // Open the sheet for the newly created item
          if (items && items.length > 0) {
            items[0].sheet.render(true);
          }
          this.render(false); // Re-render the actor sheet
        })
        .catch(err => console.error("Error creating headquarters:", err));
    });

    // Browse Headquarters Compendium button
    html.find('.browse-compendium[data-type="headquarters"]').click(ev => {
      const pack = game.packs.find(p => p.metadata.name === "headquarters" && p.metadata.system === "msh-faserip");
      if (pack) {
        pack.render(true);
      } else {
        ui.notifications.warn("Headquarters compendium not found.");
      }
    });

    // Team HQ view (on actor sheet HQ tab)
    html.find('.team-hq-view').click(async ev => {
      const itemId = $(ev.currentTarget).data('hqId');
      const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
      const hqActor = hqActorId ? game.actors.get(hqActorId) : null;
      if (!hqActor) return;
      const item = hqActor.items.get(itemId);
      if (!item) return;

      const { ROOM_PACKAGES, STAFF_ROLES } = await import('./hq-constants.js');
      const { FaseripHeadquartersSheet } = await import('./headquartersSheet.js');
      const pkgData = (item.system.packages || []).map((p, i) => {
        const def = ROOM_PACKAGES[p.type];
        if (!def) return null;
        const tier = def.tiers[p.tier] || def.tiers[0];
        const qty = (p.quantity || 1) > 1 ? ` &times;${p.quantity}` : '';
        return { html: `<li class="hq-pkg-chat-link" data-pkg-idx="${i}" style="cursor:pointer;"><strong>${def.name}${qty}</strong> (${tier.label}, ${tier.cost}) — ${tier.desc}</li>`, pkg: p };
      }).filter(Boolean);
      const packages = pkgData.map(d => d.html).join('');

      const staff = (item.system.staff || []).map(s => {
        const def = STAFF_ROLES[s.role];
        if (!def) return null;
        const qty = (s.quantity || 1) > 1 ? ` &times;${s.quantity}` : '';
        const nameStr = s.name ? ` (${s.name})` : '';
        return `<li><strong>${def.name}${nameStr}${qty}</strong> (${def.cost}/mo)</li>`;
      }).filter(Boolean).join('');

      const hasCustomImg = item.img && !item.img.includes("mystery-man") && !item.img.includes("default");
      new Dialog({
        title: item.name,
        content: `
          ${hasCustomImg ? `<img src="${item.img}" style="width:100%;border-radius:4px;margin-bottom:8px;" />` : ''}
          <h2>${item.name}</h2>
          <div class="headquarters-details">
            <p><strong>Location:</strong> ${item.system.location || 'Unknown'}</p>
            <p><strong>Size:</strong> ${item.system.size || 'Unknown'}</p>
            <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
            <p><strong>Ownership:</strong> ${item.system.ownership === 'rented' ? 'Rented' : 'Owned'}</p>
            ${item.system.purchaseCost ? `<p><strong>Buy Cost:</strong> ${item.system.purchaseCost}</p>` : ''}
            ${item.system.rentCost ? `<p><strong>Rent Cost:</strong> ${item.system.rentCost}</p>` : ''}
            ${item.system.isRichArea ? `<p><strong>Rich Area:</strong> +1CS cost</p>` : ''}
            ${packages ? `<h3>Room Packages</h3><ul>${packages}</ul>` : ''}
            ${staff ? `<h3>Staff</h3><ul>${staff}</ul>` : ''}
          </div>
          ${item.system.notes ? `<div class="description">${item.system.notes}</div>` : ''}
          <div style="margin-top:8px;text-align:center;">
            <button type="button" class="hq-info-resource-feat" style="padding:4px 12px;font-size:11px;border:1px solid #8b0000;border-radius:3px;background:#f5f0e8;color:#8b0000;cursor:pointer;">Resource FEAT</button>
          </div>
        `,
        buttons: { close: { label: "Close" } },
        width: 500,
        render: (html) => {
          html.find('.hq-pkg-chat-link').click(ev => {
            const idx = Number(ev.currentTarget.dataset.pkgIdx);
            const pkg = item.system.packages?.[idx];
            if (pkg) FaseripHeadquartersSheet.sendPackageChatCard(pkg, item.name);
          });
          html.find('.hq-pkg-chat-link strong').hover(
            function() { $(this).css('color', '#8b0000'); },
            function() { $(this).css('color', ''); }
          );
          html.find('.hq-info-resource-feat').click(() => {
            const isRented = item.system.ownership === "rented";
            const costRank = isRented ? (item.system.rentCost || "Typical") : (item.system.purchaseCost || "Typical");
            const costType = isRented ? "Rent" : "Purchase";
            FaseripHeadquartersSheet.rollHQResourceFEAT(item.name, costRank, costType);
          });
        }
      }).render(true);
    });

    // Headquarters info button (clickable image)
    html.find('.headquarters-info').click(async ev => {
      const itemId = $(ev.currentTarget).data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;

      const { ROOM_PACKAGES, STAFF_ROLES } = await import('./hq-constants.js');
      const { FaseripHeadquartersSheet } = await import('./headquartersSheet.js');
      const pkgData = (item.system.packages || []).map((p, i) => {
        const def = ROOM_PACKAGES[p.type];
        if (!def) return null;
        const tier = def.tiers[p.tier] || def.tiers[0];
        const qty = (p.quantity || 1) > 1 ? ` &times;${p.quantity}` : '';
        return { html: `<li class="hq-pkg-chat-link" data-pkg-idx="${i}" style="cursor:pointer;"><strong>${def.name}${qty}</strong> (${tier.label}, ${tier.cost}) — ${tier.desc}</li>`, pkg: p };
      }).filter(Boolean);
      const packages = pkgData.map(d => d.html).join('');

      const staff = (item.system.staff || []).map(s => {
        const def = STAFF_ROLES[s.role];
        if (!def) return null;
        const qty = (s.quantity || 1) > 1 ? ` &times;${s.quantity}` : '';
        return `<li><strong>${def.name}${qty}</strong> (${def.cost}/mo)</li>`;
      }).filter(Boolean).join('');

      const hasCustomImg = item.img && !item.img.includes("mystery-man") && !item.img.includes("default");
      let content = `
        ${hasCustomImg ? `<img src="${item.img}" style="width:100%;border-radius:4px;margin-bottom:8px;" />` : ''}
        <h2>${item.name}</h2>
        <div class="headquarters-details">
          <p><strong>Location:</strong> ${item.system.location || 'Unknown'}</p>
          <p><strong>Size:</strong> ${item.system.size || 'Unknown'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Ownership:</strong> ${item.system.ownership === 'rented' ? 'Rented' : 'Owned'}</p>
          ${item.system.purchaseCost ? `<p><strong>Buy Cost:</strong> ${item.system.purchaseCost}</p>` : ''}
          ${item.system.rentCost ? `<p><strong>Rent Cost:</strong> ${item.system.rentCost}</p>` : ''}
          ${item.system.isRichArea ? `<p><strong>Rich Area:</strong> +1CS cost</p>` : ''}
          ${packages ? `<h3>Room Packages</h3><ul>${packages}</ul>` : ''}
          ${staff ? `<h3>Staff</h3><ul>${staff}</ul>` : ''}
        </div>
        ${item.system.notes ? `<div class="description">${item.system.notes}</div>` : ''}
        <div style="margin-top:8px;text-align:center;">
          <button type="button" class="hq-info-resource-feat" style="padding:4px 12px;font-size:11px;border:1px solid #8b0000;border-radius:3px;background:#f5f0e8;color:#8b0000;cursor:pointer;">Resource FEAT</button>
        </div>
      `;

      const dlg = new Dialog({
        title: "Headquarters Information",
        content,
        buttons: { close: { label: "Close" } },
        width: 500,
        render: (html) => {
          html.find('.hq-pkg-chat-link').click(ev => {
            const idx = Number(ev.currentTarget.dataset.pkgIdx);
            const pkg = item.system.packages?.[idx];
            if (pkg) FaseripHeadquartersSheet.sendPackageChatCard(pkg, item.name);
          });
          html.find('.hq-pkg-chat-link strong').hover(
            function() { $(this).css('color', '#8b0000'); },
            function() { $(this).css('color', ''); }
          );
          html.find('.hq-info-resource-feat').click(() => {
            const isRented = item.system.ownership === "rented";
            const costRank = isRented ? (item.system.rentCost || "Typical") : (item.system.purchaseCost || "Typical");
            const costType = isRented ? "Rent" : "Purchase";
            FaseripHeadquartersSheet.rollHQResourceFEAT(item.name, costRank, costType);
          });
        }
      });
      dlg.render(true);
    });

    // Headquarters - draggable and sortable
html.find('.headquarters-draggable').each((i, el) => {
  el.setAttribute("draggable", true);
  el.addEventListener("dragstart", ev => {
    const itemId = el.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    // Default to item drag (for macros/hotbar)
    let dragData = {
      type: "FaseripItem",
      actorId: this.actor.id,
      itemId: item.id,
      uuid: item.uuid,
      data: item
    };
    
    // If holding shift, do sorting instead
    if (ev.shiftKey) {
      dragData = {
        type: "HeadquartersSort",
        itemId: itemId
      };
    }
    
    ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  });
});

// Make the entire row a drop target
html.find('.headquarters-row').each((i, row) => {
  row.addEventListener("dragover", ev => {
    ev.preventDefault();
    row.classList.add("drag-over");
  });

  row.addEventListener("dragleave", ev => {
    row.classList.remove("drag-over");
  });

  row.addEventListener("drop", async ev => {
    row.classList.remove("drag-over");
    ev.preventDefault();

    try {
      const sourceData = JSON.parse(ev.dataTransfer.getData("text/plain"));
      if (sourceData.type !== "HeadquartersSort") return;

      const sourceId = sourceData.itemId;
      const targetId = row.dataset.itemId;
      if (!sourceId || !targetId || sourceId === targetId) return;

      const items = this.actor.items
        .filter(i => i.type === "headquarters")
        .sort((a, b) => a.sort - b.sort);
      const source = items.find(i => i.id === sourceId);
      const target = items.find(i => i.id === targetId);
      if (!source || !target) return;

      const sourceIndex = items.indexOf(source);
      const targetIndex = items.indexOf(target);

      items.splice(sourceIndex, 1);
      items.splice(targetIndex, 0, source);

      const updates = items.map((item, index) => ({
        _id: item.id,
        sort: index
      }));

      await this.actor.updateEmbeddedDocuments("Item", updates);
      this.render();
    } catch (err) {
      console.error("Error in headquarters drag and drop:", err);
    }
  });
});

    // Edit headquarters button
    html.find('.headquarters-table .item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".headquarters-row");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);

      if (item) {
        item.sheet.render(true);
      }
    });

    // Delete headquarters button
    html.find('.headquarters-table .item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".headquarters-row");
      const itemId = li.data("itemId");

      if (!itemId) return;

      // Confirm deletion
      new Dialog({
        title: "Delete Headquarters",
        content: "<p>Are you sure you want to delete this headquarters?</p>",
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: () => {
              this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              this.render(false);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "cancel"
      }).render(true);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // RESOURCE BUTTON method
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.resources-header-link').click(ev => {
      ev.preventDefault();
      const useRP = game.settings.get("msh-faserip", "useResourcePoints");
    
      // Ctrl+Click opens the info dialog
      if (ev.ctrlKey) {
        this._showResourceInfoDialog();
      } else if (useRP) {
        // RP mode: open buy dialog (no FEAT roll)
        this._showBuyWithRPDialog();
      } else {
        // Standard mode: Resource FEAT roll
        this._onResourceRoll();
      }
    });

    // Resource Points: Collect Weekly Income
    html.find('.rp-collect-btn').click(async ev => {
      ev.preventDefault();
      const res = this.actor.system.attributes.resources;
      const weekly = res.weeklyRate || 0;
      const max = res.maxPoints;
      const current = res.points || 0;
      const newPoints = (max === Infinity) ? current + weekly : Math.min(current + weekly, max);
      await this.actor.update({ "system.attributes.resources.points": newPoints });
      const gained = newPoints - current;
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="faserip-chat-card"><strong>${this.actor.name}</strong> collects weekly income: <strong>+${gained} RP</strong> (${newPoints} total)</div>`
      });
      const karmaSheet = await import('./karma.js').then(m => new m.KarmaSheet(this.actor));
      await karmaSheet._addKarmaEvent({
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: 0,
        type: "Resource Income",
        description: `Weekly income: +${gained} RP (${newPoints} total)`
      });
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Popularity FEAT dialog \u2014 frp-pop shell, live CS readout + need pill,
    // negative-popularity warn strip. Roll delegates to _onPopularityRoll.
    html.find('.popularity-header-link').click(ev => {
      const isMutant = this.actor.system.origin === "Mutant" || this.actor.system.isMutant;
      const hasSecretId = this.actor.system.identityType === "secret";
      const heroPopularity = this.actor.system.attributes.popularity.value;
      const secretIdPopularity = hasSecretId ? (this.actor.system.attributes.popularity.secretId?.value || 0) : 0;

      const popRank = this._getPopularityRank(heroPopularity);
      const popShort = (game.msh?.getRankAbbreviation?.(popRank)) || popRank;
      const isNegInit = heroPopularity < 0;
      const dispPill = {
        friendly:   { c: "Green",      cls: "is-green" },
        neutral:    { c: "Yellow",     cls: "is-yellow" },
        unfriendly: { c: "Red",        cls: "is-red" },
        hostile:    { c: "Impossible", cls: "is-impossible" }
      };

      const content = `
        <div class="frp-dlg frp-pop">
          <div class="frp-header-v3">
            <span class="h-action">Popularity&nbsp;FEAT</span>
            <span class="h-paren">\u00b7</span>
            <span class="h-actor">${this.actor.name}</span>
            <span class="h-spacer"></span>
            <span class="h-stat"><span class="h-stat-label">Popularity</span>
              <span class="h-stat-rank" id="pop-stat-rank">${popShort} ${heroPopularity}</span></span>
          </div>
          <div class="frp-warnbar" id="pop-warn" style="${isNegInit ? "" : "display:none;"}">
            <span class="ic">\u26a0</span>
            <span><b>Negative Popularity.</b> Every FEAT is Yellow regardless of disposition. Using it costs <b id="pop-warn-loss">${Math.abs(heroPopularity)}</b> Karma (rank number), even on a successful, beneficial use.</span>
          </div>
          ${hasSecretId ? `
          <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
            <span class="frp-box-label" style="margin:0;flex-shrink:0;min-width:62px;">Identity</span>
            <select id="identity-type" name="identityType" style="flex:1;">
              <option value="hero">Hero ID \u2014 ${this.actor.name} (${heroPopularity})</option>
              <option value="secret">Secret ID \u2014 ${this.actor.system.identity || "civilian"} (${secretIdPopularity})</option>
            </select></div>` : ""}
          <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
            <span class="frp-box-label" style="margin:0;flex-shrink:0;min-width:62px;">Target</span>
            <select id="disposition" name="disposition" style="flex:1;">
              <option value="friendly">Friendly</option>
              <option value="neutral" selected>Neutral</option>
              <option value="unfriendly">Unfriendly</option>
              <option value="hostile">Hostile</option>
            </select>
            ${isMutant ? '<span style="color:#aa6600;font-size:11px;flex-shrink:0;">Mutant \u22121</span>' : ''}</div>
          <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
            <span class="frp-box-label" style="margin:0;flex-shrink:0;min-width:62px;">Request</span>
            <input type="text" id="request-description" style="flex:1;" placeholder="e.g. information, surrender, back off\u2026"></div>
          <div class="frp-cs-box"><div class="frp-cs-line">
            <span class="frp-cs-label">CS</span>
            <input type="number" id="column-shift" name="columnShift" class="frp-cs-input" value="0">
            <span class="frp-cs-base" id="pop-cs-base">${popRank}</span>
            <span class="frp-cs-arrow">&rarr;</span>
            <span class="frp-cs-rank" id="pop-cs-rank">${popRank}</span>
            <span class="frp-cs-hint">benefits +2 \u00b7 danger \u22123 \u00b7 value/unique \u22121 to \u22123</span>
          </div></div>
          <div class="frp-need-line"><span class="frp-need-label">Needs:</span>
            <span id="pop-pill" class="frp-feat-pill is-yellow">YELLOW</span>
            <span id="pop-hint" class="hint"></span></div>
          <div class="frp-foot">
            <div class="frp-foot-btns">
              <button id="pop-roll" class="frp-btn-roll">Roll</button>
              <button id="pop-cancel" class="frp-btn-cancel">Cancel</button>
            </div>
          </div>
        </div>`;

      const self = this;
      showFaseripDialog({
        title: `Popularity Roll: ${this.actor.name}`,
        content,
        render: async (html, dlg) => {
          const $id = html.find('#identity-type');
          const $disp = html.find('#disposition');
          const $cs = html.find('#column-shift');

          const refresh = () => {
            const idt = $id.length ? $id.val() : "hero";
            const popVal = idt === "secret" ? secretIdPopularity : heroPopularity;
            const baseRank = self._getPopularityRank(popVal);
            const baseShort = (game.msh?.getRankAbbreviation?.(baseRank)) || baseRank;
            const neg = popVal < 0;
            const shift = parseInt($cs.val()) || 0;
            const eff = applyColumnShiftToRank(baseRank, popVal, shift);

            html.find('#pop-stat-rank').text(`${baseShort} ${popVal}`);
            html.find('#pop-cs-base').text(baseRank);
            html.find('#pop-cs-rank').text(eff.rank);
            $cs.removeClass('cs-pos cs-neg');
            if (shift > 0) $cs.addClass('cs-pos'); else if (shift < 0) $cs.addClass('cs-neg');

            const $warn = html.find('#pop-warn');
            if (neg) { $warn.show(); html.find('#pop-warn-loss').text(Math.abs(popVal)); }
            else $warn.hide();

            const disp = $disp.val();
            const p = neg ? { c: "Yellow", cls: "is-yellow" } : (dispPill[disp] || dispPill.neutral);
            html.find('#pop-pill').attr('class', `frp-feat-pill ${p.cls}`).text(p.c.toUpperCase());
            html.find('#pop-hint').text(
              neg ? "negative pop \u00b7 fear, not loyalty"
                  : (disp === "hostile" ? "hostile targets won't respond" : ""));
            html.find('#pop-roll').prop('disabled', !neg && disp === "hostile");
          };

          if ($id.length) $id.on('change', refresh);
          $disp.on('change', refresh);
          $cs.on('input', refresh);
          refresh();

          html.find('#pop-cancel').on('click', () => dlg.close());
          html.find('#pop-roll').on('click', async () => {
            if (html.find('#pop-roll').prop('disabled')) return;
            await self._onPopularityRoll(html);
            dlg.close();
          });
        }
      });
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Ability FEAT roll buttons — delegated to ability-feat-dialog.js
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    html.find('.ability-key').click(ev => {
      const abilityKey = ev.currentTarget.textContent.trim().toLowerCase();
      showAbilityFeatDialog(this.actor, abilityKey);
    });

    // === STUNTS TAB LISTENERS ===
    // Stunts Tab - Add stunt
    html.find('.add-stunt-general').click(async ev => {
      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      const rankOptions = ranks.map(r => `<option value="${r}">${r}</option>`).join('');

      const powers = this.actor.items.filter(i => i.type === 'power');
      const powerOptions = powers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

      await DialogV2.wait({
        window: { title: "Add Power Stunt" },
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" placeholder="e.g., Triple Teleport" style="width:100%;">
            </div>
            <div class="form-group">
              <label>Parent Power:</label>
              <select name="parentPowerId" style="width:100%;">
                <option value="">(None — general stunt)</option>
                ${powerOptions}
              </select>
              <small style="color:#666;">Links stunt to a power. Rank is read live from the power.</small>
            </div>
            <div class="form-group">
              <label>Rank (if no parent power):</label>
              <select name="rank" style="width:150px;">${rankOptions}</select>
            </div>
            <div class="form-group">
              <label>Rank Number:</label>
              <input type="number" name="value" value="6" min="0" style="width:100px;">
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" placeholder="Describe what this stunt does..." style="width:100%;"></textarea>
            </div>
            <p style="margin-top:10px;color:#666;font-size:0.9em;">
              <strong>Note:</strong> First use will require a Red FEAT and cost 100 Karma.
            </p>
          </form>
        `,
        buttons: [
          {
            action: "create",
            label: "Create Stunt",
            default: true,
            callback: async (event, button, dialog) => {
              const root = dialog.element;
              const name = root.querySelector('[name="name"]').value?.trim();
              if (!name) {
                ui.notifications.warn("Stunt name is required!");
                return;
              }
              const parentPowerId = root.querySelector('[name="parentPowerId"]').value || null;
              const parentPower = parentPowerId ? (this.actor.items.get(parentPowerId)?.name || null) : null;

              const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
              stunts.push({
                name,
                parentPowerId,
                parentPower,
                rank: root.querySelector('[name="rank"]').value,
                value: parseInt(root.querySelector('[name="value"]').value) || 6,
                description: root.querySelector('[name="description"]').value || "",
                timesUsed: 0
              });
              await this.actor.update({ "system.stunts": stunts });
              ui.notifications.info(`Stunt "${name}" created!`);
              this.render(false);
            }
          },
          { action: "cancel", icon: "fas fa-times", label: "Cancel" }
        ],
        rejectClose: false
      });
    });

    // Stunts Tab
    // Roll Power Stunt
    html.find('.roll-stunt-tab').click(async ev => {
      ev.preventDefault();
      const stuntIndex = parseInt($(ev.currentTarget).data('stunt-index'));
      const roller = new StuntRoller(this.actor);
      await roller.rollStunt(stuntIndex);
    });

    // Stunts Tab - Edit stunt
    html.find('.edit-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
      const stunt = stunts[stuntIndex];
      if (!stunt) return;

      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      const rankOptions = ranks.map(r =>
        `<option value="${r}" ${r === stunt.rank ? 'selected' : ''}>${r}</option>`
      ).join('');

      const powers = this.actor.items.filter(i => i.type === 'power');
      const powerOptions = powers.map(p =>
        `<option value="${p.id}" ${p.id === stunt.parentPowerId ? 'selected' : ''}>${p.name}</option>`
      ).join('');

      const difficultyText = stunt.timesUsed < 1 ? 'Red FEAT (100 Karma)'
        : stunt.timesUsed < 4 ? 'Yellow FEAT (100 Karma)'
        : stunt.timesUsed < 10 ? 'Green FEAT (100 Karma)'
        : 'Mastered (No Cost)';

      await DialogV2.wait({
        window: { title: `Edit Stunt: ${stunt.name}` },
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" value="${stunt.name}" style="width:100%;">
            </div>
            <div class="form-group">
              <label>Parent Power:</label>
              <select name="parentPowerId" style="width:100%;">
                <option value="">(None — general stunt)</option>
                ${powerOptions}
              </select>
              <small style="color:#666;">Rank/value read live from linked power. Falls back to stored values below.</small>
            </div>
            <div class="form-group">
              <label>Stored Rank (fallback):</label>
              <select name="rank" style="width:150px;">${rankOptions}</select>
            </div>
            <div class="form-group">
              <label>Stored Rank Number (fallback):</label>
              <input type="number" name="value" value="${stunt.value}" min="0" style="width:100px;">
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" style="width:100%;">${stunt.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>Times Used:</label>
              <input type="number" name="timesUsed" value="${stunt.timesUsed || 0}" min="0" style="width:100px;">
              <span style="margin-left:10px;color:#666;">${difficultyText}</span>
            </div>
          </form>
        `,
        buttons: [
          {
            action: "save",
            label: "Save",
            default: true,
            callback: async (event, button, dialog) => {
              const root = dialog.element;
              const parentPowerId = root.querySelector('[name="parentPowerId"]').value || null;
              const parentPower = parentPowerId ? (this.actor.items.get(parentPowerId)?.name || null) : null;
              stunts[stuntIndex] = {
                name: root.querySelector('[name="name"]').value,
                parentPowerId,
                parentPower,
                rank: root.querySelector('[name="rank"]').value,
                value: parseInt(root.querySelector('[name="value"]').value) || 6,
                description: root.querySelector('[name="description"]').value,
                timesUsed: parseInt(root.querySelector('[name="timesUsed"]').value) || 0
              };
              await this.actor.update({ "system.stunts": stunts });
              this.render(false);
            }
          },
          { action: "cancel", icon: "fas fa-times", label: "Cancel" }
        ],
        rejectClose: false
      });
    });

    // Stunts Tab - Delete stunt
    html.find('.delete-stunt-tab').click(async ev => {
      const stuntIndex = parseInt(ev.currentTarget.dataset.stuntIndex);
      const stunts = this.actor.system.stunts || [];
      const stunt = stunts[stuntIndex];

      const confirmed = await DialogV2.confirm({
        window: { title: "Delete Stunt" },
        content: `<p>Are you sure you want to delete the stunt "<strong>${stunt?.name || 'Unknown'}</strong>"?</p>`,
        rejectClose: false
      });
      if (!confirmed) return;

      const updatedStunts = foundry.utils.deepClone(stunts);
      updatedStunts.splice(stuntIndex, 1);
      await this.actor.update({ "system.stunts": updatedStunts });
      this.render(false);
    });

    // Actions Tab -- buttons in Actions tab
    html.find('.action-btn').click(async ev => {
      const button = ev.currentTarget;
      const actionType = button.dataset.action;
      const abilityName = button.dataset.ability;
      
      // Check if CTRL key is held
      if (ev.ctrlKey) {
        await this._showActionInfo(actionType);
      } else {
        await this._rollAction(actionType, abilityName);
      }
    });

    // NEW: Make action buttons draggable to hotbar
    html.find('.action-btn').each((i, btn) => {
      btn.setAttribute('draggable', true);
      
      btn.addEventListener('dragstart', ev => {
        const actionCode = btn.dataset.action;
        const actionAbility = btn.dataset.ability;
        const actionName = btn.querySelector('.action-name')?.textContent?.replace(/<br>/g, ' ') || actionCode;
        
        const dragData = {
          type: "UniversalAction",
          actionCode: actionCode,
          actionName: actionName,
          actorId: this.actor.id,
          actorName: this.actor.name,
          iconName: actionCode
        };
        
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        console.log("📤 Character Sheet drag:", dragData);
      });
    });

    // Universal Table tab — render and wire (hover, column-select, header-click)
    if (!this._utTab) this._utTab = new UniversalTableTab(this);
    this._utTab.render(html);

    // This serves as a fallback to ensure all draggable items can create macros
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".power-row, .talent-item, .contact-item, .equipment-row, .vehicle-draggable, .headquarters-draggable",
      dropSelector: null,
      permissions: { dragstart: true },
      callbacks: {
          dragstart: (event) => {
              // Don't interfere with shift+drag for sorting
              if (event.shiftKey) return;
              
              const li = event.currentTarget;
              const itemId = li.dataset.itemId;
              const item = this.actor.items.get(itemId);
              if (!item) return;

              console.log("🔥 DragDrop handler creating macro for:", item.name);
              
              // Use the format from the older file for creating macros
              event.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "FaseripItem",
                  actorId: this.actor.id,
                  itemId: item.id,
                  uuid: item.uuid,
                  data: item
              }));
          }
      }
  }).bind(html[0]);

      /** @override */
  
    // NEW: Initialize CharacterCreationTabManager if the tab exists
    // We query html[0] because 'html' in activateListeners is a jQuery object
    const creationTabElement = html[0].querySelector('.char-creation-tab');
    if (creationTabElement && !this._charCreationManager) {
        this._charCreationManager = new CharacterCreationTabManager(this.actor, creationTabElement);
    } else if (this._charCreationManager) {
        // If manager already exists (e.g., sheet was re-rendered), ensure it re-renders its content
        // This is important if `saveGeneratedData` is called on the manager, but the main sheet re-renders.
        this._charCreationManager.loadGeneratedData(); // Re-load and render on sheet re-open/re-render
    }

    // Show stunt description in chat
    html.find('.show-stunt-description').click(async ev => {
      ev.preventDefault();
      const stuntIndex = parseInt($(ev.currentTarget).data('stunt-index'));
      const stunt = this.actor.system.stunts[stuntIndex];
      
      if (!stunt) return;
      
      // Determine difficulty color
      let difficultyColor, difficultyText;
      if (stunt.timesUsed === 0) {
        difficultyColor = '#F44336';
        difficultyText = 'Red FEAT';
      } else if (stunt.timesUsed <= 3) {
        difficultyColor = '#FFC107';
        difficultyText = 'Yellow FEAT';
      } else if (stunt.timesUsed < 10) {
        difficultyColor = '#4CAF50';
        difficultyText = 'Green FEAT';
      } else {
        difficultyColor = '#2196F3';
        difficultyText = 'Mastered';
      }
      
      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
            <strong>${this.actor.name} — Power Stunt</strong>
          </div>
          
          <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
            <div><strong>Stunt:</strong> ${stunt.name}</div>
            ${stunt.parentPower ? `<div><strong>Parent Power:</strong> ${stunt.parentPower}</div>` : ''}
          </div>

          <div style="padding:5px 10px;font-size:.9em;">
            <div>Rank: ${stunt.rank} (${stunt.value})</div>
            <div>Difficulty: <span style="color:${difficultyColor};font-weight:bold;">${difficultyText}</span></div>
            <div>Times Used: ${stunt.timesUsed}</div>
            ${stunt.timesUsed < 10 ? `<div style="color:#666;font-size:.85em;">${10 - stunt.timesUsed} more success${10 - stunt.timesUsed === 1 ? '' : 'es'} until mastered</div>` : ''}
          </div>

          ${stunt.description ? `
            <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
              <div style="font-weight:bold;color:#0d47a1;">Description</div>
              <div style="font-size:.9em;">${stunt.description}</div>
            </div>
          ` : `
            <div style="padding:6px 10px;margin:6px 10px;background:#f5f5f5;border:1px solid #ccc;border-radius:3px;">
              <div style="font-size:.9em;color:#666;font-style:italic;">No description provided</div>
            </div>
          `}
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: cardHtml
      });
    });


    // Continue with other listeners...
  }

  /**
   * Determine FEAT requirement based on ability rank vs intensity
   * @param {string} abilityRank - The effective ability rank
   * @param {string} intensity - The intensity rank
   * @returns {object} - Object with requirement, impossible, and automatic flags
   */
  _determineFeatRequirement(abilityRank, intensity) {
    return determineFeatRequirement(abilityRank, intensity);
  }

  _checkFeatSuccess(resultColor, requirement) {
    return checkFeatSuccess(resultColor, requirement);
  }

  _showResourceInfoDialog() {
    const content = `
      <h2>Resource FEATs</h2>
      <p>Resources are a measure of a character's wealth and buying power. Instead of tracking exact money, the FASERIP system uses Resource FEATs to determine if a character can afford an item.</p>
  
      <h3>Using Resources</h3>
      <p>To purchase anything, a character must make a Resource FEAT. This is the equivalent of a credit check or checking the bank account to see how much cash is available.</p>
  
      <h3>Resource FEAT Rules:</h3>
      <ul>
        <li>A Resource FEAT may be made once per week.</li>
        <li>A character cannot purchase an item with a higher rank than their Resource rank.</li>
        <li>If the item's rank is 3 ranks lower than the Resource rank, purchase is automatic.</li>
        <li>If 1–2 ranks lower, a green FEAT is needed.</li>
        <li>If equal to Resource rank, a yellow FEAT is needed.</li>
      </ul>
  
      <h3>Success and Failure</h3>
      <p>Success means the character can purchase the item. Failure indicates the item is too expensive and the character cannot try for any item of that rank or higher for the next week.</p>
  
      <table>
        <tr><th>Resource Rank</th><th>Buying Power</th></tr>
        <tr><td>Shift-0</td><td>Homeless, no income</td></tr>
        <tr><td>Feeble</td><td>Poor, struggling to make ends meet</td></tr>
        <tr><td>Poor</td><td>Low income, basic necessities only</td></tr>
        <tr><td>Typical</td><td>Average income, modest lifestyle</td></tr>
        <tr><td>Good</td><td>Comfortable income, can afford luxuries</td></tr>
        <tr><td>Excellent</td><td>Well-off, upper middle class</td></tr>
        <tr><td>Remarkable</td><td>Wealthy, significant disposable income</td></tr>
        <tr><td>Incredible</td><td>Very wealthy, millionaire</td></tr>
        <tr><td>Amazing</td><td>Extremely wealthy, multi-millionaire</td></tr>
        <tr><td>Monstrous</td><td>Super-rich, billionaire</td></tr>
        <tr><td>Unearthly</td><td>Absurdly wealthy, virtually unlimited resources</td></tr>
      </table>
  
      <h3>Optional Bank Loans</h3>
      <p>Characters may purchase something up to one rank higher than their Resource rank through a bank loan. The character then must make monthly Resource FEATs of two ranks less for as many months as the rank number of the item.</p>
    `;
  
    new Dialog({
      title: "Resources in FASERIP",
      content,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: "Close"
        },
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Make Resource Roll",
          callback: () => this._onResourceRoll()
        }
      },
      default: "close",
      classes: ["resources-dialog"]
    }).render(true);
  }

  // Resource FEAT Roll (standard mode, no RP)
  // Resource FEAT Roll (standard mode, no RP) — DialogV2, gold header,
  // live required-color pill, weekly lockout (setting-gated) + GM override.
  _resourceRanks() {
    return ["Shift-0","Feeble","Poor","Typical","Good","Excellent",
            "Remarkable","Incredible","Amazing","Monstrous","Unearthly"];
  }

  // Required FEAT color for an item rank vs a resource rank (house thresholds).
  _resourceFeatRequirement(resIdx, itemIdx, loan) {
    if (itemIdx > resIdx + (loan ? 1 : 0))
      return { color: "Impossible", cls: "is-impossible", hint: "above your Resource rank" };
    const diff = resIdx - itemIdx;
    if (diff >= 3) return { color: "Automatic", cls: "is-auto", hint: "3+ ranks under \u2014 no roll" };
    if (diff >= 1) return { color: "Green", cls: "is-green", hint: `${diff} rank${diff>1?"s":""} under Resources` };
    if (diff === 0) return { color: "Yellow", cls: "is-yellow", hint: "equal to Resources" };
    return { color: "Yellow", cls: "is-yellow", hint: "+1 via bank loan" };
  }

  // Weekly lockout from worldTime + per-actor flags. Setting-gated.
  // scope "week" blocks every attempt; scope "fail" blocks lockedIdx and higher.
  _getResourceLockStatus() {
    if (!game.settings.get("msh-faserip", "enforceResourceLockout"))
      return { enabled: false, locked: false };
    const WEEK = 604800; // 7 game-days in seconds
    let now;
    try { now = game.msh.getCampaignDateTime().elapsedSeconds; }
    catch { now = game.time.worldTime; }
    const f = this.actor.getFlag("msh-faserip", "resourceFeat") || {};
    if (Number.isFinite(f.lastAttemptWT) && now - f.lastAttemptWT < WEEK)
      return { enabled: true, locked: true, scope: "week",
               daysLeft: Math.ceil((f.lastAttemptWT + WEEK - now) / 86400) };
    if (Number.isFinite(f.lastFailWT) && Number.isFinite(f.lastFailIdx) && now - f.lastFailWT < WEEK)
      return { enabled: true, locked: true, scope: "fail", lockedIdx: f.lastFailIdx,
               daysLeft: Math.ceil((f.lastFailWT + WEEK - now) / 86400) };
    return { enabled: true, locked: false };
  }

  _onResourceRoll() {
    const ranks = this._resourceRanks();
    const resourceRank = this.actor.system.attributes.resources.rank;
    const resourceValue = this.actor.system.attributes.resources.value;
    const resIdx = ranks.indexOf(resourceRank);
    const resShort = (game.msh?.getRankAbbreviation?.(resourceRank)) || resourceRank;
    const isGM = game.user.isGM;
    const lock = this._getResourceLockStatus();
    const dateTag = (() => { try { const d = game.msh.getCampaignDateTime().date; return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; } catch { return ""; } })();

    const initItem = ranks[Math.max(0, resIdx - 2)] || "Typical";
    const initIdx = ranks.indexOf(initItem);
    const initReq = this._resourceFeatRequirement(resIdx, initIdx, false);

    let lockbar = "";
    if (lock.enabled) {
      if (lock.locked && lock.scope === "week") {
        lockbar = `<div class="frp-lockbar locked"><span class="ic">\u23f3</span>
          <span><b>Locked</b> \u2014 a Resource FEAT was made this week. Next attempt in <b>${lock.daysLeft} day${lock.daysLeft>1?"s":""}</b>.</span>
          <span class="src">${dateTag}</span></div>`;
      } else if (lock.locked && lock.scope === "fail") {
        lockbar = `<div class="frp-lockbar locked"><span class="ic">\u23f3</span>
          <span><b>Locked</b> \u2014 failed a ${ranks[lock.lockedIdx]} purchase. No ${ranks[lock.lockedIdx]}-or-higher attempt for <b>${lock.daysLeft} day${lock.daysLeft>1?"s":""}</b>.</span>
          <span class="src">${dateTag}</span></div>`;
      } else {
        lockbar = `<div class="frp-lockbar open"><span class="ic">\u2713</span>
          <span><b>Available</b> this week.</span><span class="src">${dateTag}</span></div>`;
      }
    }

    const gmrow = (isGM && lock.locked)
      ? `<div class="frp-gm-row show"><label><input type="checkbox" id="res-ovr"> Override weekly lockout</label><span class="tag">GM</span></div>`
      : "";

    const rankOpts = ranks.map(r => `<option value="${r}" ${r===initItem?"selected":""}>${r}</option>`).join("");

    const content = `
      <div class="frp-dlg frp-res">
        <div class="frp-header-v3">
          <span class="h-action">Resource&nbsp;FEAT</span>
          <span class="h-paren">\u00b7</span>
          <span class="h-actor">${this.actor.name}</span>
          <span class="h-spacer"></span>
          <span class="h-stat"><span class="h-stat-label">Resources</span>
            <span class="h-stat-rank">${resShort} ${resourceValue}</span></span>
        </div>
        ${lockbar}
        ${gmrow}
        <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
          <span class="frp-box-label" style="margin:0;flex-shrink:0;min-width:62px;">Resource</span>
          <input type="text" value="${resourceRank}" readonly style="flex:1;">
          <span class="rankval">(${resourceValue})</span></div>
        <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
          <span class="frp-box-label" style="margin:0;flex-shrink:0;min-width:62px;">Item Cost</span>
          <select id="res-item" style="flex:1;">${rankOpts}</select></div>
        <div class="frp-box" style="display:flex;align-items:center;gap:8px;">
          <span class="frp-box-label" style="margin:0;flex-shrink:0;min-width:62px;">For</span>
          <input type="text" id="res-desc" style="flex:1;" placeholder="e.g. surveillance van, monthly rent\u2026"></div>
        <div class="frp-opt-row"><label><input type="checkbox" id="res-loan"> Bank loan (allows 1 rank higher)</label></div>
        <div class="frp-need-line"><span class="frp-need-label">Needs:</span>
          <span id="res-pill" class="frp-feat-pill ${initReq.cls}">${initReq.color.toUpperCase()}</span>
          <span id="res-hint" class="hint">${initReq.hint}</span></div>
        <div class="frp-foot">
          <div class="frp-foot-btns">
            <button id="res-roll" class="frp-btn-roll">Roll</button>
            <button id="res-cancel" class="frp-btn-cancel">Cancel</button>
          </div>
        </div>
      </div>`;

    const self = this;
    showFaseripDialog({
      title: `Resource Roll: ${this.actor.name}`,
      content,
      render: async (html, dlg) => {
        const $item = html.find("#res-item");
        const $loan = html.find("#res-loan");
        const $ovr  = html.find("#res-ovr");
        const $pill = html.find("#res-pill");
        const $hint = html.find("#res-hint");
        const $roll = html.find("#res-roll");

        const refresh = () => {
          const itemIdx = ranks.indexOf($item.val());
          const loan = $loan.is(":checked");
          const req = self._resourceFeatRequirement(resIdx, itemIdx, loan);
          $pill.attr("class", `frp-feat-pill ${req.cls}`).text(req.color.toUpperCase());
          $hint.text(req.hint);
          const overridden = $ovr.length ? $ovr.is(":checked") : false;
          const blocked = lock.locked && !overridden &&
            (lock.scope === "week" || (lock.scope === "fail" && itemIdx >= lock.lockedIdx));
          const impossible = req.color === "Impossible";
          $roll.prop("disabled", impossible || blocked)
               .text(blocked ? "Locked this week" : "Roll");
        };
        $item.on("change", refresh);
        $loan.on("change", refresh);
        $ovr.on("change", refresh);
        refresh();

        html.find("#res-cancel").on("click", () => dlg.close());
        $roll.on("click", async () => {
          if ($roll.prop("disabled")) return;
          const itemRank = $item.val();
          const itemIdx = ranks.indexOf(itemRank);
          const loan = $loan.is(":checked");
          const desc = (html.find("#res-desc").val() || "item").trim();
          const req = self._resourceFeatRequirement(resIdx, itemIdx, loan);
          if (req.color === "Impossible") return ui.notifications.warn("Item rank is too high for your resources.");

          const roll = new Roll("1d100");
          await roll.evaluate();
          const resultColor = game.msh.rollUniversalTable(resourceRank, roll.total);
          const rcl = resultColor.toLowerCase();
          let success = false;
          if (req.color === "Automatic") success = true;
          else if (req.color === "Green") success = ["green","yellow","red"].includes(rcl);
          else if (req.color === "Yellow") success = ["yellow","red"].includes(rcl);

          const bannerBg = { white:"#f8f8f8", green:"#00a94e", yellow:"#fef102", red:"#ee1e25" }[rcl] || "#ccc";
          const bannerFg = ["white","yellow"].includes(rcl) ? "#222" : "#fff";
          const reqPillCls = { "Automatic":"is-auto","Green":"is-green","Yellow":"is-yellow" }[req.color] || "is-green";
          const loanNote = (loan && success)
            ? `<div style="padding:7px 12px;font-size:12px;background:#fffde7;border-top:1px solid #ffd54f;color:#6b5d00;line-height:1.4;">
                 <b>Bank loan approved.</b> Monthly ${ranks[Math.max(0,resIdx-2)]} Resource FEAT for ${itemIdx+1} months. Miss a payment and the bank reclaims it.</div>`
            : "";

          const card = `
            <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;overflow:hidden;color:#333;">
              <div style="padding:7px 12px;border-bottom:1px solid #d8d8d0;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <strong style="color:#8b0000;font-size:14px;letter-spacing:.3px;">Resource FEAT</strong>
                <span style="color:#888;font-size:12px;">${desc}</span></div>
              <div style="padding:6px 12px;display:flex;justify-content:space-between;font-size:13px;border-bottom:1px solid #e2e2da;">
                <span><span style="color:#888;">Resource:</span> <b>${resourceRank} (${resourceValue})</b></span>
                <span><span style="color:#888;">Item:</span> <b>${itemRank}</b>${loan?' <span style="color:#6b5d00;">(loan)</span>':''}</span></div>
              <div style="text-align:center;font-weight:bold;font-size:15px;letter-spacing:1.5px;padding:7px 10px;background:${bannerBg};color:${bannerFg};">${resultColor.toUpperCase()}</div>
              <div style="display:flex;background:#fff;text-align:center;border-bottom:1px solid #ddd;">
                <div style="flex:1;padding:8px 4px;border-right:1px solid #ececec;">
                  <div style="font-size:24px;font-weight:bold;color:#222;line-height:1;">${roll.total}</div>
                  <div style="font-size:10px;letter-spacing:.5px;color:#9a9a9a;margin-top:5px;text-transform:uppercase;">Roll</div></div>
                <div style="flex:1.4;padding:8px 4px;border-right:1px solid #ececec;">
                  <div style="font-size:15px;font-weight:bold;color:#333;padding-top:3px;">${resourceRank}</div>
                  <div style="font-size:10px;letter-spacing:.5px;color:#9a9a9a;margin-top:6px;text-transform:uppercase;">Resources</div></div>
                <div style="flex:1.2;padding:8px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
                  <span class="frp-feat-pill ${reqPillCls}">${req.color.toUpperCase()}</span>
                  <div style="font-size:10px;letter-spacing:.5px;color:#9a9a9a;text-transform:uppercase;">needed</div></div></div>
              <div style="padding:7px 12px;text-align:center;font-weight:bold;font-size:14px;letter-spacing:.5px;color:${success?'#1b5e20':'#c62828'};">
                ${success ? "\u2713 PURCHASE POSSIBLE" : "\u2717 CANNOT AFFORD"}</div>
              ${loanNote}
            </div>`;

          await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: card });

          if (lock.enabled) {
            let now;
            try { now = game.msh.getCampaignDateTime().elapsedSeconds; }
            catch { now = game.time.worldTime; }
            const upd = { lastAttemptWT: now };
            if (!success) { upd.lastFailWT = now; upd.lastFailIdx = itemIdx; }
            await this.actor.setFlag("msh-faserip", "resourceFeat",
              foundry.utils.mergeObject(this.actor.getFlag("msh-faserip","resourceFeat") || {}, upd));
          }

          const historyEntry = {
            timestamp: new Date().toISOString(),
            realDate: new Date().toLocaleDateString(),
            gameDate: dateTag,
            amount: 0,
            type: "Resource FEAT",
            description: `${desc} (${itemRank}) - ${success ? "SUCCESS" : "FAILED"}${loan ? " [Bank Loan]" : ""}`
          };
          const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
          currentHistory.push(historyEntry);
          if (typeof game.msh?.runAsGM === "function") {
            game.msh.runAsGM({ operation: "update", targetActorUuid: this.actor.uuid, args: [{ "system.karma.history": currentHistory }] });
          } else {
            await this.actor.update({ "system.karma.history": currentHistory });
          }

          dlg.close();
        });
      }
    });
  }

  // Buy with Resource Points (RP mode — no roll, just spend)
  _showBuyWithRPDialog() {
    const res = this.actor.system.attributes.resources;
    const current = res.points || 0;
    const max = res.maxPoints;
    const maxLabel = (max === Infinity) ? "No Maximum" : max;

    let priceOptions = "";
    for (const [category, items] of Object.entries(RESOURCE_PRICES)) {
      const label = category.charAt(0).toUpperCase() + category.slice(1);
      const sorted = Object.entries(items).sort((a, b) => a[1] - b[1]);
      priceOptions += `<optgroup label="${label}">`;
      for (const [name, cost] of sorted) {
        priceOptions += `<option value="${name}" data-cost="${cost}">${name} (${cost} RP)</option>`;
      }
      priceOptions += `</optgroup>`;
    }

    const content = `
      <div style="margin-bottom: 10px; padding: 6px 8px; background: #f5f5f0; border: 1px solid #d0d0d0; border-radius: 3px; font-size: 0.95em;">
        Current RP: <strong>${current}</strong> &nbsp;/&nbsp; ${maxLabel}
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 100px;">Quick Pick:</label>
        <select id="rp-price-list" style="width: 220px;">
          <option value="">— Custom —</option>
          ${priceOptions}
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 100px;">Item:</label>
        <input type="text" id="rp-buy-desc" style="width: 200px;" placeholder="e.g., Bus Ticket">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 100px;">Cost (RP):</label>
        <input type="number" id="rp-buy-cost" min="0" value="0" style="width: 80px;">
      </div>
    `;

    const dlg = new Dialog({
      title: `Buy with Resource Points: ${this.actor.name}`,
      content,
      buttons: {
        buy: {
          icon: '<i class="fas fa-coins"></i>',
          label: "Buy",
          callback: async (html) => {
            const cost = parseInt(html.find('#rp-buy-cost').val()) || 0;
            const desc = html.find('#rp-buy-desc').val() || "purchase";
            if (cost <= 0) return ui.notifications.warn("Enter an RP cost.");
            if (cost > current) return ui.notifications.warn(`Not enough RP. You have ${current}, need ${cost}.`);
            const newPoints = current - cost;
            await this.actor.update({ "system.attributes.resources.points": newPoints });
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: `<div class="faserip-chat-card">
                <div style="color: #8b0000; font-weight: bold; margin-bottom: 4px;">${this.actor.name} — Purchase</div>
                <div><strong>${desc}</strong> for <strong>${cost} RP</strong></div>
                <div style="font-size: 0.9em; color: #666; margin-top: 4px;">Remaining: ${newPoints} RP</div>
              </div>`
            });
            const karmaSheet = await import('./karma.js').then(m => new m.KarmaSheet(this.actor));
            await karmaSheet._addKarmaEvent({
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: 0,
              type: "Resource Spending",
              description: `Purchased ${desc} for ${cost} RP (${newPoints} RP remaining)`
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "buy"
    }, { width: 400 });

    dlg.render(true);

    // Wire up Quick Pick dropdown after render
    setTimeout(() => {
      const el = document.querySelector('.dialog #rp-price-list');
      if (!el) return;
      el.addEventListener('change', (ev) => {
        const selected = ev.target.selectedOptions[0];
        if (!selected || !selected.value) return;
        const cost = parseInt(selected.dataset.cost) || 0;
        const name = selected.value;
        const form = el.closest('.dialog-content') || el.closest('form') || el.parentElement;
        const descInput = form.querySelector('#rp-buy-desc');
        const costInput = form.querySelector('#rp-buy-cost');
        if (descInput) descInput.value = name;
        if (costInput) costInput.value = cost;
      });
    }, 200);
  }

  // _onPopularityRoll method
  async _onPopularityRoll(html) {
    console.log("== POPULARITY ROLL START ==");
    console.log("Actor:", this.actor.name);
    console.log("Raw popularity object:", this.actor.system.attributes.popularity);
  
    const heroPopularity = this.actor.system.attributes.popularity.hero?.value ?? 0;
    const secretIdPopularity = this.actor.system.attributes.popularity.secretId?.value ?? 0;
    const isMutant = this.actor.system.origin === "Mutant" || this.actor.system.isMutant;
  
    console.log("Hero Pop:", heroPopularity);
    console.log("Secret ID Pop:", secretIdPopularity);
    console.log("Is Mutant:", isMutant);
  
    const identityType = html.find('#identity-type').val() || "hero";
    const disposition = html.find('#disposition').val() || "neutral";
    const requestDescription = html.find('#request-description').val() || "request";
    const columnShift = parseInt(html.find('#column-shift').val()) || 0;
  
    console.log("Selected identity:", identityType);
    console.log("Disposition:", disposition);
    console.log("Request:", requestDescription);
    console.log("Column Shift:", columnShift);
  
    let usedPopValue, identityLabel;
    
    if (identityType === "secret") {
      usedPopValue = secretIdPopularity;
      identityLabel = `Secret ID - ${this.actor.system.identity}`;
    } else {
      usedPopValue = heroPopularity;
      identityLabel = `Hero ID - ${this.actor.name}`;
    }
      
    console.log("Used Popularity Value:", usedPopValue);
    console.log("Label:", identityLabel);
  
    const baseRank = this._getPopularityRank(usedPopValue);
    const shifted = applyColumnShiftToRank(baseRank, usedPopValue, columnShift);
    const effectiveRank = shifted.rank;
    const effectiveValue = shifted.value;
  
    let featColorNeeded = {
      friendly: "Green",
      neutral: "Yellow",
      unfriendly: "Red",
      hostile: "Impossible"
    }[disposition] || "Yellow";
  
    const isNegative = usedPopValue < 0;
    if (isNegative) featColorNeeded = "Yellow";
  
    if (featColorNeeded === "Impossible") {
      ui.notifications.warn("Hostile targets will not respond to Popularity requests.");
      return;
    }
  
    // ✅ Roll the dice and show 3D dice in chat
    const roll = new Roll("1d100");
    await roll.evaluate();
  
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} - ${identityLabel} Popularity Roll for ${requestDescription}`,
      rollMode: game.settings.get("core", "rollMode")
    });
  
    // ✅ Now apply roll logic
    const resultColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
    const color = resultColor.toLowerCase();
  
    const success =
      (featColorNeeded === "Green" && ["green", "yellow", "red"].includes(color)) ||
      (featColorNeeded === "Yellow" && ["yellow", "red"].includes(color)) ||
      (featColorNeeded === "Red" && color === "red");
  
    const bannerBg = { white:"#f8f8f8", green:"#00a94e", yellow:"#fef102", red:"#ee1e25" }[color] || "#ccc";
    const bannerFg = ["white","yellow"].includes(color) ? "#222" : "#fff";
    const needCls = { Green:"is-green", Yellow:"is-yellow", Red:"is-red" }[featColorNeeded] || "is-yellow";
    const idShort = identityType === "secret" ? "Secret ID" : "Hero ID";
    const csNote = columnShift !== 0 ? `${columnShift > 0 ? "+" : ""}${columnShift}CS eff.` : "base rank";
    const mutNote = isMutant
      ? `<div style="padding:6px 12px;font-size:11px;color:#aa6600;border-top:1px solid #e2e2da;">Mutant penalty applies to Popularity awards/penalties (\u22121).</div>`
      : "";
    const negNote = isNegative
      ? `<div style="padding:7px 12px;font-size:12px;line-height:1.4;background:#fce4ec;border-top:1px solid #f48fb1;color:#7a0d44;"><b>\u2212${Math.abs(usedPopValue)} Karma</b> deducted (negative Popularity rank number). Logged to Karma history.</div>`
      : "";

    const content = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;overflow:hidden;color:#333;">
        <div style="padding:7px 12px;border-bottom:1px solid #d8d8d0;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong style="color:#a3115e;font-size:14px;letter-spacing:.3px;">Popularity FEAT</strong>
          <span style="color:#888;font-size:12px;">${requestDescription}</span></div>
        <div style="padding:6px 12px;display:flex;justify-content:space-between;font-size:13px;border-bottom:1px solid #e2e2da;">
          <span><span style="color:#888;">${idShort}:</span> <b>${usedPopValue}${isNegative ? " (neg)" : ""}</b></span>
          <span><span style="color:#888;">Target:</span> <b>${disposition.charAt(0).toUpperCase() + disposition.slice(1)}</b></span></div>
        <div style="text-align:center;font-weight:bold;font-size:15px;letter-spacing:1.5px;padding:7px 10px;background:${bannerBg};color:${bannerFg};">${resultColor.toUpperCase()}</div>
        <div style="display:flex;background:#fff;text-align:center;border-bottom:1px solid #ddd;">
          <div style="flex:1;padding:8px 4px;border-right:1px solid #ececec;">
            <div style="font-size:24px;font-weight:bold;color:#222;line-height:1;">${roll.total}</div>
            <div style="font-size:10px;letter-spacing:.5px;color:#9a9a9a;margin-top:5px;text-transform:uppercase;">Roll</div></div>
          <div style="flex:1.4;padding:8px 4px;border-right:1px solid #ececec;">
            <div style="font-size:15px;font-weight:bold;color:#333;padding-top:3px;">${effectiveRank}</div>
            <div style="font-size:10px;letter-spacing:.5px;color:#9a9a9a;margin-top:6px;text-transform:uppercase;">${csNote}</div></div>
          <div style="flex:1.2;padding:8px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
            <span class="frp-feat-pill ${needCls}">${featColorNeeded.toUpperCase()}</span>
            <div style="font-size:10px;letter-spacing:.5px;color:#9a9a9a;text-transform:uppercase;">needed</div></div></div>
        <div style="padding:7px 12px;text-align:center;font-weight:bold;font-size:14px;letter-spacing:.5px;color:${success ? '#1b5e20' : '#c62828'};">
          ${success ? "\u2713 SUCCESS \u00b7 REQUEST GRANTED" : "\u2717 FAILURE \u00b7 REQUEST DENIED"}</div>
        ${mutNote}
        ${negNote}
      </div>
    `;
  
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });

    // Log Popularity FEAT to karma history
    const featHistoryEntry = {
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: 0,
      type: "Popularity FEAT",
      description: `${requestDescription} (${disposition}) - ${success ? 'SUCCESS' : 'FAILED'}`
    };
    
    const featHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
    featHistory.push(featHistoryEntry);
    
    if (typeof game.msh?.runAsGM === 'function') {
      game.msh.runAsGM({
        operation: 'update',
        targetActorUuid: this.actor.uuid,
        args: [{ "system.karma.history": featHistory }]
      });
    } else {
      await this.actor.update({ "system.karma.history": featHistory });
    }
  
    if (isNegative) {
      const loss = Math.abs(usedPopValue);
      const historyEntry = {
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: -loss,
        type: "Karma Loss",
        description: `Negative Popularity use (${requestDescription})`
      };
      const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
      currentHistory.push(historyEntry);
      if (typeof game.msh?.runAsGM === 'function') {
        game.msh.runAsGM({
          operation: 'update',
          targetActorUuid: this.actor.uuid,
          args: [{ "system.karma.history": currentHistory }]
        });
      } else {
        await this.actor.update({ "system.karma.history": currentHistory });
      }
      ui.notifications.info(`${this.actor.name} lost ${loss} Karma (negative Popularity).`);
    }
  }

// Add this helper method to the FaseripActorSheet class
_getPopularityRank(value) {
  if (value <= 0) return "Shift-0";
  if (value <= 2) return "Feeble";
  if (value <= 4) return "Poor";
  if (value <= 7) return "Typical";
  if (value <= 15) return "Good";
  if (value <= 25) return "Excellent";
  if (value <= 35) return "Remarkable";
  if (value <= 45) return "Incredible";
  if (value <= 62) return "Amazing";
  if (value <= 87) return "Monstrous";
  if (value <= 125) return "Unearthly";
  if (value <= 175) return "Shift-X";
  if (value <= 350) return "Shift-Y";
  if (value <= 999) return "Shift-Z";
  if (value <= 3000) return "Class 1000";
  if (value <= 5000) return "Class 3000";
  return "Class 5000";
}

// New method: _rollVehicleControl(vehicle)
_rollVehicleControl(vehicle) {
  const actor = this.actor;
  const agility = actor.system.abilities.agility?.value ?? 6;
  // --- Rank ladder + values (min thresholds) ---
  const rankTable = [
    "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
    "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
    "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];
  const rankMinValues = [0, 2, 4, 6, 10, 20, 30, 40, 50, 75, 100, 150, 200, 500, 1000, 3000, 5000, 10000];
  const rankValues = Object.fromEntries(rankTable.map((r, i) => [r, rankMinValues[i]]));

  const getRankFromValue = (val) => {
    for (let i = rankTable.length - 1; i >= 0; i--) {
      if (rankValues[rankTable[i]] <= val) return rankTable[i];
    }
    return rankTable[0];
  };

 // Compare RAW values to find limiting factor
  const controlRank = vehicle.system.control || "Typical";
  const controlCSLoss = Number(vehicle.system.controlCSLoss || 0);
  const controlIndex = Math.max(0, rankTable.indexOf(controlRank));

  // Driver Agility rank from numeric Agility score
  const driverAgiRank = getRankFromValue(agility);
  const driverAgiIndex = rankTable.indexOf(driverAgiRank);

  // Only apply CS losses if vehicle Control is STRICTLY LESS than driver Agility
  const isControlLimiting = (controlIndex < driverAgiIndex);

  // If Control < Agility: vehicle limits (apply CS losses)
  // If Control >= Agility: driver limits (NO CS losses)
  const adjustedControlIndex = isControlLimiting 
    ? Math.max(0, controlIndex - controlCSLoss)
    : controlIndex;
  const adjustedControlRank = rankTable[adjustedControlIndex];

  // Used FEAT rank = LOWER of driver agility vs adjusted vehicle control
  const baseRankIndex = Math.min(driverAgiIndex, adjustedControlIndex);
  const baseUsedRank = rankTable[baseRankIndex];
  
  // Numeric value for the base-used rank (some cards/logic expect this)
  const usedValue = rankValues[baseUsedRank];

  // Prevent control roll if vehicle is destroyed
  const bodyRank = vehicle.system.body || "Typical";
  const maxHP = rankValues[bodyRank] ?? 6;
  const currentHP = vehicle.system.bodyHP ?? maxHP;

  if (currentHP <= 0) {
    const message = `${actor.name} attempts to operate <strong>${vehicle.name}</strong>, but it is <span style="color:#b00"><strong>destroyed</strong></span> and cannot be controlled.`;

    // UI popup
    ui.notifications.error(`${vehicle.name} is destroyed and cannot be operated.`);

    // Chat card with matching styling
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#0d47a1;">
            <strong>${actor.name} - Vehicle Control FEAT</strong>
          </div>
          <div style="padding:5px 10px;font-size:.9em;">
            <div>Vehicle: ${vehicle.name}</div>
            <div>Driver Agility: ${driverAgiRank} (${agility})</div>
            <div>Control Rank: ${controlRank}${isControlLimiting && controlCSLoss > 0 ? ` — ${controlCSLoss} CS Lost → ${adjustedControlRank}` : ""}</div>
            <div>Used Rank: ${baseUsedRank}${cs !== 0 ? ` — Shift ${cs >= 0 ? '+' : ''}${cs} → ${shiftedRank}` : ""}</div>
            <div>Roll: ${controlRoll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
            ${stunt ? `<div>Stunt: ${stuntName || "(unnamed)"}${stuntFailure ? " — <span style='color:#c62828;'>FAILED</span>" : ""}</div>` : ""}
          </div>
           
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px 10px;font-size:.85em;text-align:center;">
            <div style="padding:4px;background:#f5f5f5;border:1px solid #ddd;border-radius:2px;">
              <div style="font-weight:600;color:#666;">White:</div>
              <div style="color:#c62828;">Crash</div>
            </div>
            <div style="padding:4px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:2px;">
              <div style="font-weight:600;color:#2e7d32;">Green:</div>
              <div>Maintained</div>
            </div>
            <div style="padding:4px;background:#fffde7;border:1px solid #fff176;border-radius:2px;">
              <div style="font-weight:600;color:#f57f17;">Yellow:</div>
              <div>Maintained</div>
            </div>
            <div style="padding:4px;background:#ffebee;border:1px solid #ef9a9a;border-radius:2px;">
              <div style="font-weight:600;color:#c62828;">Red:</div>
              <div>Maintained</div>
            </div>
          </div>

          <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${mainBg};color:${mainTx};">
            RESULT: ${featColor.toUpperCase()} — ${stuntFailure ? `STUNT FAILED` : (isCrash ? "OUT OF CONTROL" : "CONTROL MAINTAINED")}
          </div>
          ${crashDetails}
        </div>
      `
    });

    return;
  }

  new Dialog({
    title: `Vehicle Control FEAT: ${vehicle.name}`,
    content: `
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Vehicle:</label>
        <strong>${vehicle.name}</strong>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Driver:</label>
        <strong>${actor.name}</strong>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Used Rank:</label>
        <input type="text" value="${baseUsedRank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${usedValue})</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Column Shift:</label>
        <input id="cs" type="number" value="0" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Current Speed:</label>
        <select id="current-speed">
          ${rankTable.slice(0, 10).map(r => `<option value="${r}" ${r === (vehicle.system.speed || "Typical") ? "selected" : ""}>${r}</option>`).join('')}
        </select>
        <span style="color:#666;font-size:.85em;">(speed at moment of FEAT)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Karma Points:</label>
        <input id="karma" type="number" value="0" min="0" style="width:60px;">
        <span style="color:#666;font-size:.85em;">(spend only up to 100)</span>
      </div>

      <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Stunt Settings</div>
        <div style="margin-bottom:6px;">
          <label><input type="checkbox" id="stunt-check"> Attempting Stunt?</label>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:100px;">Stunt Name:</label>
          <input id="stunt-name" type="text" placeholder="e.g., Bootleg Turn" style="width:200px;">
        </div>
      </div>

      <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Crash Settings</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Crash Object:</label>
          <select id="crash-object">
            ${rankTable.slice(0, 10).map(r => `<option value="${r}" ${r === "Excellent" ? "selected" : ""}>${r}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Passengers:</label>
          <select id="buckled">
            <option value="yes">Buckled In (Blunt)</option>
            <option value="no">Not Buckled (Edged)</option>
          </select>
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll",
        callback: async html => {
          const cs = parseInt(html.find("#cs").val()) || 0;
          const currentSpeed = html.find("#current-speed").val();
          const karma = parseInt(html.find("#karma").val()) || 0;
          const crashObjRank = html.find("#crash-object").val();
          const buckled = html.find("#buckled").val();
          const stunt = html.find("#stunt-check")[0].checked;
          const stuntName = html.find("#stunt-name").val();

          const shiftedIndex = Math.min(Math.max(baseRankIndex + cs, 0), rankTable.length - 1);
          const shiftedRank = rankTable[shiftedIndex];
          const shiftedValue = rankValues[shiftedRank];

          const controlRoll = new Roll("1d100");
          await controlRoll.evaluate();
          await controlRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor.name} makes a Vehicle Control FEAT${stunt ? ` to perform a stunt: ${stuntName}` : ""}`
          });

          // Karma spending - uses lifetime karma only
          let cappedTotal = controlRoll.total;
          let karmaUsed = 0;

          if (karma > 0) {
            cappedTotal = Math.min(100, controlRoll.total + karma);
            karmaUsed = karma;

            // Create history entry for karma spending
            const historyEntry = {
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -karma,
              type: "Die Roll",
              description: `Spent karma on Vehicle Control for ${vehicle.name}`
            };
            const currentHistory = foundry.utils.deepClone(this.actor.system.karma?.history || []);
            currentHistory.push(historyEntry);
            await game.msh.runAsGM({
              operation: 'update',
              targetActorUuid: this.actor.uuid,
              args: [{ "system.karma.history": currentHistory }]
            });
          }
          const totalKarmaUsed = karmaUsed;

          // ---- Defense-style banner helpers (safe local fallbacks) ----
          const colorStyles = (globalThis.colorStyles)
            || (game?.msh?.ui?.colorStyles)
            || { white:"#f5f5f5", green:"#e8f5e9", yellow:"#fffde7", red:"#ffebee" };

          const textColor = (globalThis.textColor)
            || (game?.msh?.ui?.textColor)
            || (c => {
                const m = { white:"#333", green:"#1b5e20", yellow:"#5d4037", red:"#b71c1c" };
                return m[String(c).toLowerCase()] || "#333";
              });

          // FEAT color using your thresholds and the karma-capped total
          const getFEATColor = (rank, total) => {
            const [g, y, r] = {
              "Shift-0": [0, 36, 66], "Feeble": [6, 26, 56], "Poor": [16, 36, 66],
              "Typical": [26, 46, 76], "Good": [36, 56, 86], "Excellent": [46, 66, 91],
              "Remarkable": [51, 71, 96], "Incredible": [61, 81, 96], "Amazing": [66, 86, 96],
              "Monstrous": [71, 91, 96], "Unearthly": [76, 96, 100], "Shift-X": [91, 98, 100],
              "Shift-Y": [96, 99, 100], "Shift-Z": [98, 100, 100], "Class 1000": [100, 100, 100],
              "Class 3000": [100, 100, 100], "Class 5000": [100, 100, 100], "Beyond": [100, 100, 100]
            }[rank] ?? [36, 66, 91];
            if (total < g) return "white";
            if (total < y) return "green";
            if (total < r) return "yellow";
            return "red";
          };

          const featColor = getFEATColor(shiftedRank, cappedTotal).toLowerCase();
          const isCrash = (featColor === "white");
          const stuntFailure = (stunt && isCrash);

          // Crash sequence
          let crashDetails = "";
          if (isCrash) {
            // need current speed for crash sequence:
            const speedRank = currentSpeed || vehicle.system.speed || "Typical";
            const bodyRank  = vehicle.system.body  || "Typical";

            // CRITICAL FIX: Crash FEAT uses LOWER of Speed or Body (per rules page 53)
            // "as if the vehicle had a 'strength' equal to its Speed or Body, whichever is lower"
            const vehicleStrengthRank = rankValues[speedRank] <= rankValues[bodyRank]
              ? speedRank
              : bodyRank;

            const crashRoll = new Roll("1d100"); await crashRoll.evaluate();
            const crashColor = getFEATColor(vehicleStrengthRank, crashRoll.total).toLowerCase();
            const brokeThrough = (crashColor === "red");

            // Base damage = material strength OR Speed, whichever is HIGHER (per rules page 53)
            const baseDamageRank = brokeThrough ? crashObjRank : speedRank;
            const baseDamage     = rankValues[baseDamageRank];

            const protectionRank = vehicle.system.protection || "Typical";
            const protection     = rankValues[protectionRank];
            const netDamage      = Math.max(0, baseDamage - protection);

            // Post-crash FEAT vs Body to determine CS losses
            const bodyValue   = rankValues[bodyRank];
            const damageLevel = baseDamage > bodyValue ? "greater" : baseDamage === bodyValue ? "equal" : "less";
            const damageRoll  = new Roll("1d100"); await damageRoll.evaluate();
            const damageColor = getFEATColor(bodyRank, damageRoll.total).toLowerCase();

            let outcome = "";
            if (damageLevel === "greater") {
              outcome = damageColor === "red"    ? "Body -1CS"
                    : damageColor === "yellow" ? "Speed -1CS, Control FEAT required"
                    : damageColor === "green"  ? "Control -1CS, Control FEAT required"
                                                : "All -1CS, Vehicle out of control!";
            } else if (damageLevel === "equal") {
              outcome = damageColor === "red"    ? "No damage to vehicle"
                    : damageColor === "yellow" ? "Body -1CS"
                    : damageColor === "green"  ? "Speed -1CS, Control FEAT required"
                                                : "Control -1CS, Control FEAT required";
            } else {
              outcome = ["red", "yellow"].includes(damageColor) ? "No effect"
                    : damageColor === "green"  ? "Body -1CS, Control FEAT required"
                                                : "Control -1CS, damage to passengers, Control FEAT required";
            }

            // Apply effects to vehicle
            const updateData = {};

            if (damageLevel === "greater") {
              if (damageColor === "red")    updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
              if (damageColor === "yellow") updateData["system.speedCSLoss"]   = (vehicle.system.speedCSLoss   || 0) + 1;
              if (damageColor === "green")  updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              if (damageColor === "white") {
                updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
                updateData["system.speedCSLoss"]   = (vehicle.system.speedCSLoss   || 0) + 1;
                updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
              }
            } else if (damageLevel === "equal") {
              if (damageColor === "yellow") updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
              if (damageColor === "green")  updateData["system.speedCSLoss"]   = (vehicle.system.speedCSLoss   || 0) + 1;
              if (damageColor === "white")  updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
            } else {
              if (damageColor === "green")  updateData["system.bodyCSLoss"]    = (vehicle.system.bodyCSLoss    || 0) + 1;
              if (damageColor === "white")  updateData["system.controlCSLoss"] = (vehicle.system.controlCSLoss || 0) + 1;
            }

            // HP tracking from Body rank min value
            const maxHP     = rankValues[bodyRank] ?? 6;
            const currentHP = vehicle.system.bodyHP ?? maxHP;
            updateData["system.bodyHP"] = Math.max(0, currentHP - netDamage);
            await vehicle.update(updateData);

            if (updateData["system.bodyHP"] === 0) {
              outcome += " <strong style='color:#c62828;'>Vehicle destroyed!</strong>";
            }

            // Use defense-style color helpers
            const bannerBg1 = colorStyles?.[crashColor] || "#eee";
            const bannerTx1 = (typeof textColor === "function") ? textColor(crashColor) : "#333";
            const bannerBg2 = colorStyles?.[damageColor] || "#eee";
            const bannerTx2 = (typeof textColor === "function") ? textColor(damageColor) : "#333";

            crashDetails = `
              <div style="padding:8px 10px;margin:0;background:#fff;border-top:1px solid #ddd;font-size:.9em;">
                <div style="font-weight:bold;margin-bottom:6px;color:#d32f2f;">Crash Outcome</div>
                <div>Vehicle Crash Strength: ${vehicleStrengthRank} (lower of Speed/Body)</div>
                <div>Crash Roll: ${crashRoll.total}</div>
                <div style="margin:8px 0;">
                  <div style="text-align:center;padding:8px;font-weight:bold;font-size:1em;border-radius:3px;background-color:${bannerBg1};color:${bannerTx1};">
                    CRASH FEAT: ${crashColor.toUpperCase()}
                  </div>
                </div>
                <div>${brokeThrough ? "✓ Vehicle broke through obstacle" : "✗ Vehicle stopped by obstacle"}</div>
                <div>Base Damage: ${baseDamageRank} (${baseDamage})</div>
                <div>After Protection: ${netDamage}</div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;">
                  <div>Post-Crash Roll: ${damageRoll.total}</div>
                  <div style="margin:6px 0;">
                    <div style="text-align:center;padding:8px;font-weight:bold;font-size:1em;border-radius:3px;background-color:${bannerBg2};color:${bannerTx2};">
                      POST-CRASH: ${damageColor.toUpperCase()}
                    </div>
                  </div>
                  <div><strong>${stuntFailure ? `Stunt caused crash!` : outcome}</strong></div>
                </div>
              </div>
            `;
          }

          // Defense-style result banner for the main FEAT
          const mainBg = colorStyles?.[featColor] || "#eee";
          const mainTx = (typeof textColor === "function") ? textColor(featColor) : "#333";

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#a52a2a;">
                  <strong>${actor.name} - Vehicle Control FEAT</strong>
                </div>
                <div style="padding:5px 10px;font-size:.9em;">
                  <div>Vehicle: ${vehicle.name}</div>
                  <div>Driver Agility: ${driverAgiRank} (${agility})</div>
                  <div>Control Rank: ${controlRank}${isControlLimiting && controlCSLoss > 0 ? ` — ${controlCSLoss} CS Lost → ${adjustedControlRank}` : ""}</div>
                  <div>Used Rank: ${baseUsedRank}${cs !== 0 ? ` — Shift ${cs >= 0 ? '+' : ''}${cs} → ${shiftedRank}` : ""}</div>
                  <div>Roll: ${controlRoll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
                  ${stunt ? `<div style="margin-top:4px;"><strong>Stunt:</strong> ${stuntName || "(unnamed)"}</div>` : ""}
                </div>

                <div style="padding:8px 10px;border-top:1px solid #ddd;">
                  <div style="font-weight:bold;margin-bottom:6px;">Possible Results:</div>
                  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:.85em;text-align:center;">
                    <div style="padding:6px 4px;background:${featColor === 'white' ? '#333' : '#e0e0e0'};color:${featColor === 'white' ? '#fff' : '#666'};border-radius:2px;font-weight:600;" title="Vehicle crashes and goes out of control. Damage to passengers and vehicle.">
                      <div>White:</div>
                      <div>Crash</div>
                    </div>
                    <div style="padding:6px 4px;background:${featColor === 'green' ? '#4caf50' : '#e0e0e0'};color:${featColor === 'green' ? '#fff' : '#666'};border-radius:2px;font-weight:600;" title="Control maintained successfully.">
                      <div>Green:</div>
                      <div>Control</div>
                    </div>
                    <div style="padding:6px 4px;background:${featColor === 'yellow' ? '#fbc02d' : '#e0e0e0'};color:${featColor === 'yellow' ? '#333' : '#666'};border-radius:2px;font-weight:600;" title="Control maintained successfully.">
                      <div>Yellow:</div>
                      <div>Control</div>
                    </div>
                    <div style="padding:6px 4px;background:${featColor === 'red' ? '#d32f2f' : '#e0e0e0'};color:${featColor === 'red' ? '#fff' : '#666'};border-radius:2px;font-weight:600;" title="Control maintained successfully.">
                      <div>Red:</div>
                      <div>Control</div>
                    </div>
                  </div>
                </div>

                <div style="text-align:center;padding:10px;margin:8px 0;font-weight:bold;font-size:1.1em;text-transform:uppercase;border-radius:3px;background:${mainBg};color:${mainTx};">
                  ${stuntFailure ? `STUNT FAILED — ${stuntName || "UNNAMED STUNT"}` : `RESULT: ${featColor.toUpperCase()} — ${isCrash ? "OUT OF CONTROL" : "CONTROL MAINTAINED"}`}
                </div>
                ${crashDetails}
              </div>
            `
          });
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}

  async _rollStandaloneStunt(stunt, stuntIndex) {
    console.log("=== POWER STUNT DEBUG START ===");
    console.log("Stunt:", stunt.name);
    console.log("Times Used:", stunt.timesUsed);
    console.log("Rank:", stunt.rank);
    console.log("Value:", stunt.value);
    
    const rank = stunt.rank || "Typical";
    const rankValue = stunt.value || 6;
    
    // Check if stunt is mastered (10+ uses) - no FEAT or Karma needed
    if (stunt.timesUsed >= 10) {
      console.log("Stunt is MASTERED (10+ uses) - auto success");
      ui.notifications.info(`${stunt.name} is mastered! No FEAT or Karma required.`);
      
      const chatHtml = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Rank: ${rank} (${rankValue})</div>
            <div>Status: MASTERED (10+ uses)</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50 !important; color: white;">
            AUTOMATIC SUCCESS
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatHtml
      });
      return;
    }
    
    // Check if actor has at least 100 karma available
    const availableKarma = this.actor.availableKarma || 0;
    console.log("Available Karma:", availableKarma);
    
    if (availableKarma < 100) {
      console.log("INSUFFICIENT KARMA - Cannot perform stunt");
      ui.notifications.error(`Insufficient Karma! ${stunt.name} requires 100 Karma. You have ${availableKarma} available.`);
      
      const chatHtml = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Required Karma: 100</div>
            <div>Available Karma: ${availableKarma}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #F44336 !important; color: white;">
            INSUFFICIENT KARMA
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatHtml
      });
      return;
    }
    
    // Determine required FEAT color based on current times used
    let requiredColor;
    if (stunt.timesUsed === 0) {
      requiredColor = "red";
      console.log("Times used = 0: Required FEAT = RED");
    } else if (stunt.timesUsed <= 3) {
      requiredColor = "yellow";
      console.log("Times used 1-3: Required FEAT = YELLOW");
    } else {
      requiredColor = "green";
      console.log("Times used 4-9: Required FEAT = GREEN");
    }
    
    console.log("Required FEAT Color:", requiredColor);
    
    // Calculate maximum additional karma they can spend
    const maxAdditionalKarma = availableKarma - 100;
    console.log("Max additional karma available:", maxAdditionalKarma);
    
    // Prompt for optional Karma bonus
    const karmaInput = await Dialog.prompt({
      title: "Add Karma Bonus to Roll?",
      label: "Optional Karma bonus (in addition to 100 Karma base cost):",
      callback: html => parseInt(html.find("input").val() || "0"),
      content: `
        <p>Base cost: <strong>100 Karma</strong></p>
        <p>Available for bonus: <strong>${maxAdditionalKarma} Karma</strong></p>
        <p>Required FEAT: <strong style="color:${requiredColor}">${requiredColor.toUpperCase()}</strong></p>
        <label>Additional Karma bonus to roll (max ${maxAdditionalKarma}):</label>
        <input type="number" min="0" max="${maxAdditionalKarma}" value="0" style="width:100%"/>
      `
    });
    
    const karmaBonus = Math.min(maxAdditionalKarma, Number.isNaN(karmaInput) ? 0 : karmaInput);
    console.log("Karma bonus:", karmaBonus);
    
    // Roll 1d100
    const roll = new Roll("1d100");
    await roll.evaluate();
    console.log("Roll result:", roll.total);
    
    // Calculate total with karma bonus
    const totalRoll = Math.min(100, roll.total + karmaBonus);
    console.log("Total roll (with karma):", totalRoll);
    
    // Use the universal table to determine FEAT result color
    const resultColor = game.msh.rollUniversalTable(rank, totalRoll);
    console.log("Result color from universal table:", resultColor);
    console.log("Result color (lowercase):", resultColor.toLowerCase());
    
    // Check if the result meets the requirement
    const resultColorLower = resultColor.toLowerCase();
    console.log("Checking success with:");
    console.log("  Required:", requiredColor);
    console.log("  Got:", resultColorLower);
    
    let success = false;
    if (requiredColor === "green") {
      success = ["green", "yellow", "red"].includes(resultColorLower);
      console.log("  Green check: needs green/yellow/red, got", resultColorLower, "=", success);
    } else if (requiredColor === "yellow") {
      success = ["yellow", "red"].includes(resultColorLower);
      console.log("  Yellow check: needs yellow/red, got", resultColorLower, "=", success);
    } else if (requiredColor === "red") {
      success = resultColorLower === "red";
      console.log("  Red check: needs red, got", resultColorLower, "=", success);
    }
    
    console.log("FINAL SUCCESS VALUE:", success);
    
    // Increment usage count if successful
    if (success) {
      console.log("Success! Incrementing usage count from", stunt.timesUsed, "to", stunt.timesUsed + 1);
      const stunts = foundry.utils.deepClone(this.actor.system.stunts || []);
      stunts[stuntIndex].timesUsed++;
      await this.actor.update({ "system.stunts": stunts });
    } else {
      console.log("Failed! Usage count stays at", stunt.timesUsed);
    }
    
    // Log Karma spending to history
    const karmaSheet = await import('./karma.js').then(m => new m.KarmaSheet(this.actor));
    
    // Base 100 Karma cost
    await karmaSheet._addKarmaEvent({
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -100,
      type: "Power Stunt",
      description: `Attempted stunt "${stunt.name}" (${requiredColor} FEAT required)`
    });
    
    // Additional karma bonus
    if (karmaBonus > 0) {
      await karmaSheet._addKarmaEvent({
        timestamp: new Date().toISOString(),
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: -karmaBonus,
        type: "Die Roll",
        description: `Karma bonus for "${stunt.name}" power stunt`
      });
    }
    
    // Determine result text
    const resultText = success ? "STUNT SUCCEEDED" : "STUNT FAILED";
    
    // Build chat content - matching power roll format exactly
    let content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${stunt.name} (Power Stunt)</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>Base Rank: ${rank} (${rankValue})</div>
          <div>Times Used: ${stunt.timesUsed} → Required FEAT: ${requiredColor.toUpperCase()}</div>
          <div>Base Karma Cost: 100</div>
          ${karmaBonus > 0 ? `<div>Additional Karma Spent: ${karmaBonus}</div>` : ''}
          <div>Roll: ${roll.total}${karmaBonus > 0 ? ` + Karma: ${karmaBonus}` : ''} = ${totalRoll}</div>
          ${success ? `<div>Usage count increased to ${stunt.timesUsed + 1}</div>` : ''}
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${resultColorLower === 'white' ? '#f8f8f8 !important' :
            resultColorLower === 'green' ? '#4CAF50 !important' :
              resultColorLower === 'yellow' ? '#FFC107 !important' :
                '#F44336 !important'};
          color: ${resultColorLower === 'white' || resultColorLower === 'yellow' ? '#333' : 'white'};">
          ${resultText} (${resultColor.toUpperCase()})
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
    
    console.log("=== POWER STUNT DEBUG END ===");
  }

  _getFeatColor(rankValue, roll) {
    if (roll >= 91) return "red";
    if (roll >= 66) return rankValue >= 36 ? "red" : "yellow";
    if (roll >= 36) return rankValue >= 16 ? "yellow" : "green";
    return "green";
  }

async _rollAction(actionType, abilityName) {
  const actor = this.actor;
  
  // Get action information
  const actionInfo = ACTION_INFO[actionType];
  if (!actionInfo) {
    ui.notifications.warn(`No information found for action: ${actionType}`);
    return;
  }
  
  try {
    // Perform the roll — ActionDispatcher produces the chat card
    await ActionDispatcher.roll(actionType, {
      actor,
      abilityName,
      opts: {
        actionType,
        karma: 0,
        pulled: false,
        source: "hands"
      }
    });
  } catch (err) {
    console.error(err);
    ui.notifications.error(err.message ?? "Action failed.");
  }
}

  async _showActionInfo(actionType) {
    const actionInfo = ACTION_INFO[actionType];
    
    if (!actionInfo) {
      ui.notifications.warn(`No information found for action: ${actionType}`);
      return;
    }
    
    // Create simple info card
    const content = `
      <div class="marvel-action-info">
        <h3 style="margin-top:0; border-bottom: 2px solid #444; padding-bottom: 8px;">
          <strong>${actionInfo.name}</strong>
          <span style="color: #666; font-size: 0.9em;">(${actionInfo.ability})</span>
        </h3>
        
        <p style="font-style: italic; color: #555;">
          ${actionInfo.description}
        </p>
        
        <p style="margin: 8px 0;">
          <strong>Possible Results:</strong> ${actionInfo.effects.join(', ')}
        </p>
        
        <div style="background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 8px;">
          <strong>Details:</strong><br>
          ${actionInfo.details}
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });
  }

  _getResultHoverText(actionType, color) {
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
        white: 'Miss - Failed to hold opponent, no other actions',
        green: 'Miss - Failed to hold opponent, no other actions',
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

  async _sendMovementToChat() {
    const info = this.actor.movementInfo;
    const movement = this.actor.system.movement || {};
    const FaseripActor = CONFIG.Actor.documentClass;
    
    const runAreas = movement.run || this.actor.suggestedMovement;
    const swimAreas = movement.swim || 1;
    const flyAreas = movement.fly || 0;
    const teleportAreas = movement.teleport || 0;
    const leapAreas = movement.leap || info.leap.acrossAreas;
    
    // Get flight info from air speed table
    const flightInfo = flyAreas > 0 ? FaseripActor.getFlightInfo(flyAreas) : null;
    const flyMph = flightInfo ? flightInfo.mph : 0;
    const lowAltitudeMax = flightInfo ? flightInfo.groundAreas : 0;
    const flightRank = flightInfo ? flightInfo.rank : "";
    // Get cruising speeds (2 ranks lower - no exhaustion checks)
    const cruisingFlight = flyAreas > 0 ? FaseripActor.getCruisingFlight(flyAreas) : null;
    const cruisingRun = runAreas > this.actor.suggestedMovement ? FaseripActor.getCruisingLand(runAreas) : null;
    
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#0d47a1;">
          <strong>${this.actor.name} - Movement Reference</strong>
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div><strong>Run:</strong> ${runAreas} areas/turn (${runAreas * 15} mph)${cruisingRun ? ` <em>(cruise: ${cruisingRun.areas}, max subject to exhaustion)</em>` : ''}</div>
          <div><strong>Leap:</strong> ${leapAreas} areas across</div>
          <div><strong>Swim:</strong> ${swimAreas} areas/turn (${swimAreas * 15} mph)</div>
          ${flyAreas > 0 ? `<div><strong>Fly:</strong> ${flyAreas} areas/turn (${flyMph} mph) — ${flightRank}${cruisingFlight ? ` <em>(cruise: ${cruisingFlight.areas}, max subject to exhaustion)</em>` : ''}</div>` : ''}
          ${teleportAreas > 0 ? `<div><strong>Teleport:</strong> ${teleportAreas} areas (instantaneous)</div>` : ''}
        </div>
        
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Leaping (Strength: ${info.strengthRank})</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            <div>Across: ${info.leap.acrossFeet}' (${info.leap.acrossAreas} areas)</div>
            <div>Up: ${info.leap.upFeet}' (${info.leap.upFloors} floors)</div>
            <div>Down: ${info.leap.downFeet}' (${info.leap.downFloors} floors)</div>
            <div style="margin-top:5px;"><em>Half distance: automatic</em></div>
            <div><em>Full distance: Green Strength FEAT</em></div>
            <div><em>x2 distance: Red Strength FEAT</em></div>
          </div>
        </details>
        
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Exhaustion (Endurance: ${info.exhaustion.enduranceRank})</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            ${["Unearthly", "Shift-X", "Shift X", "Shift-Y", "Shift Y", "Shift-Z", "Shift Z", "Class 1000", "Class 3000", "Class 5000"].includes(info.exhaustion.enduranceRank) ? 
              `<div><strong>IMMUNE</strong> - Unearthly+ Endurance exempt from exhaustion</div>` :
              `<div>After <strong>${info.exhaustion.threshold} turns</strong>: Green Endurance FEAT or rest 1-10 turns</div>
              <div>After <strong>${info.exhaustion.threshold * 2} turns</strong>: Yellow FEAT or rest 2-20 turns</div>
              <div>After <strong>${info.exhaustion.threshold * 3} turns</strong>: Red FEAT or rest 3-30 turns</div>
              <div>After <strong>${info.exhaustion.threshold * 4} turns</strong>: Mandatory rest 3-30 turns</div>
              <div style="margin-top:5px;"><em>Moving 2 ranks slower: no exhaustion check needed</em></div>
              <div><em>Devices, vehicles, robots: exempt from exhaustion</em></div>`
            }
          </div>
        </details>
        
        ${flyAreas > 0 ? `
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Flight Rules (${flightRank})</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            ${cruisingFlight ? `<div><strong>Cruising:</strong> ${cruisingFlight.areas} areas/turn (${cruisingFlight.mph} mph) - no exhaustion</div>` : ''}
            ${cruisingFlight ? `<div><strong>Max Speed:</strong> ${flyAreas} areas/turn (${flyMph} mph) - subject to exhaustion</div>` : ''}
            <div>Acceleration: ${info.acceleration} areas/turn</div>
            <div>Low altitude/enclosed max: ${lowAltitudeMax} areas/turn</div>
            <div>Exceeding ${lowAltitudeMax} areas requires Agility FEAT</div>
            <div>90° turn costs 1 area</div>
            <div>>90° turn requires Agility FEAT</div>
            <div>Landing at >3 areas/turn requires Agility FEAT</div>
          </div>
        </details>
        ` : ''}
        
        <details style="padding:5px 10px;border-top:1px solid #ddd;">
          <summary style="cursor:pointer;font-weight:bold;color:#333;">Other Movement Rules</summary>
          <div style="padding:5px 0 0 10px;font-size:.85em;">
            <div>Actions while moving: <strong>half speed</strong></div>
            <div>Turning >90°: <strong>half speed</strong></div>
            <div>Through doorway: +½ area</div>
            <div>Breaking through wall: -1 to -3 areas (by material)</div>
          </div>
        </details>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: cardHtml
    });
  }

  // Character Generation Tab Initialization
  _initChargenTab(html) {
    const chargenTab = html.find('.chargen-tab');
    if (!chargenTab.length) return;

    // Initialize the ChargenUIManager if not already done
    if (!this._chargenManager) {
      this._chargenManager = new ChargenUIManager(this, html);
      this._chargenManager.bindEvents();
    } else {
      // Update the html reference for re-renders
      this._chargenManager.html = html;
      // Re-check if we need to bind events (for fresh html)
      if (!this._chargenManager._boundEvents) {
        this._chargenManager.bindEvents();
      }
    }
  }
  
    /**
   * Handle universal table rolls for the in-sheet Universal Table tab.
   * Highlights the result cell via UniversalTableTab.highlightRoll.
   */
  _onSheetUniversalTableRoll(data) {
    if (!this.rendered || !this._utTab) return;
    const html = this.element;
    if (!html || !html.length) return;
    const normalizedRank = RANK_ALIASES[data.rank] || data.rank;
    this._utTab.highlightRoll(html, normalizedRank, data.roll);
  }

  // other methods
}