//--- START OF FILE blunt-attack-action.js ---
// blunt-attack-action.js v3.2.0 - 2026-03-15
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
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetData, getBodyArmorValues, applyDamageToTargets,
  buildModeSelector, attachModeSelectorHandlers, debugLog, setupModeSelector,
  applyCapabilitiesToDialog, buildInlineFeatDisplay
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { buildColorOutcome } from "../dice/color-results.js";
import { applyColumnShifts } from "../dice/column-shifts.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
// NOTE: resolveCombatMode not imported here to avoid circular dependency


export class BluntAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "blunt-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);
    let attackItems = actor.items.filter(isBluntCapable);

    // Detect combat talents that affect Fighting/blunt attacks
    const combatTalents = [];
    for (const item of actor.items) {
      if (item.type !== "talent") continue;
      const name = (item.name || "").toLowerCase();
      const rankOverride = item.system?.rankOverride || "";
      
      // Determine if this talent has an Ultimate Skill override
      // rankOverride set on the talent item means "use this rank instead of base + bonus"
      let ultimateCS = 0;
      if (rankOverride) {
        const baseIdx = RANKS.indexOf(ability.rank);
        const overIdx = RANKS.indexOf(rankOverride);
        if (baseIdx >= 0 && overIdx >= 0) ultimateCS = overIdx - baseIdx;
      }

      if (name.includes("martial arts b") || name.includes("martial arts-b") || 
          (name.includes("martial arts") && name.includes("(b)"))) {
        combatTalents.push({ name: "MA-B", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("boxing")) {
        combatTalents.push({ name: "Boxing", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts a") || name.includes("martial arts-a") ||
               (name.includes("martial arts") && name.includes("(a)"))) {
        combatTalents.push({ name: "MA-A", cs: 0, flag: "ignore-str-end", note: "ignore Str/End", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts d") || name.includes("martial arts-d") ||
               (name.includes("martial arts") && name.includes("(d)"))) {
        combatTalents.push({ name: "MA-D", cs: 0, flag: "ignore-armor-fx", note: "ignore armor (fx)", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts e") || name.includes("martial arts-e") ||
               (name.includes("martial arts") && name.includes("(e)"))) {
        combatTalents.push({ name: "MA-E", cs: 0, flag: "initiative", note: "+1 Initiative", ultimateCS, rankOverride });
      }
    }

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
    
    const savedSource = shouldRemember 
      ? ((await actor.getFlag("msh-faserip","lastBluntSource")) || defaultSource)
      : defaultSource;

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
    const savedActiveChips  = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntActiveChips") || {}) : {};
    
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

    const savedCsNotes = (await actor.getFlag("msh-faserip", "csNotes")) || "";

    // CS display classes
    const csInputCls = savedColumnShift > 0 ? ' pos' : savedColumnShift < 0 ? ' neg' : '';
    const csRankStyle = savedColumnShift > 0 ? 'color:#2e7d32;' : savedColumnShift < 0 ? 'color:#c62828;' : '';

    // Build talent chips HTML (inline, no wrapper — goes directly inside frp-cs-line)
    const talentChipsHtml = combatTalents.map(t => {
      const savedState = savedActiveChips[t.name] || '';
      const flagActive = savedState.includes('flag');

      // CS-granting chip: either Ultimate override or normal bonus (never both)
      if (t.rankOverride && t.ultimateCS > 0) {
        const shortRank = RANK_ABBR[t.rankOverride] || t.rankOverride;
        const ultActive = savedState === 'ultimate';
        return `<span class="frp-talent-chip${ultActive ? ' active-ultimate' : ''}" data-cs="${t.ultimateCS}" data-talent="${t.name}" data-ultimate="1">
          ★ ${t.name} <span class="chip-cs">&rarr;${shortRank}</span>
        </span>`;
      }
      if (t.cs > 0) {
        const csActive = savedState === 'cs';
        return `<span class="frp-talent-chip${csActive ? ' active-cs' : ''}" data-cs="${t.cs}" data-talent="${t.name}">
          ${t.name} <span class="chip-cs">+${t.cs}</span>
        </span>`;
      }
      // Flag-only chip
      if (t.flag) {
        return `<span class="frp-talent-chip${flagActive ? ' active-flag' : ''}" data-flag="${t.flag}" data-talent="${t.name}">
          ${t.name} <span class="chip-note">${t.note}</span>
        </span>`;
      }
      return '';
    }).join('');

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
      const sel = (savedSource === 'weapon' && savedItemId === i.id) ? 'selected' : '';
      damageSrcOptions.push(`<option value="weapon:${i.id}" ${sel}>${i.name} &mdash; ${res.damage} dmg</option>`);
    }
    damageSrcOptions.push(`<option value="object" ${savedSource==='object'?'selected':''}>Improvised Object&hellip;</option>`);

    // Determine initial saved damage source value for the select
    let initDamageSrcVal = "hands";
    if (savedSource === "weapon" && savedItemId) initDamageSrcVal = `weapon:${savedItemId}`;
    else if (savedSource === "object") initDamageSrcVal = "object";

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // ── Dialog HTML — v3 Ultra Compact Layout ──
    const multiEnabled = savedMultiAttacks || savedMultiAdjacent;
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Fighting / Rank Value) attacks Target -->
      <div class="frp-header-v3">
        <span class="h-actor">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Fighting:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target">${targetDisplay}</span>`
          : ''}
      </div>

      <!-- CS box: chips + situational dropdown all in one flowing line -->
      <div class="frp-box frp-cs-box">
        <div class="frp-cs-line">
          <span class="frp-cs-label">CS</span>
          <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedColumnShift}" id="cs-blunt">
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-cs-rank" id="rank-blunt" style="${csRankStyle}">${shiftRank(ability.rank, savedColumnShift)}</span>
          <button type="button" class="frp-cs-reset" style="visibility:${savedColumnShift !== 0 ? 'visible' : 'hidden'}">&times;</button>
          ${combatTalents.length > 0 ? '<span class="chip-sep"></span>' : ''}
          ${talentChipsHtml}
          <span class="chip-sep"></span>
          <select class="frp-sit-select" id="sit-select">
            <option value="">+ situational&hellip;</option>
            <optgroup label="Bonuses">
              <option value="2" data-label="Blindside" title="Target unaware, from behind, distracted, or attacker playing possum">Blindside +2CS</option>
              <option value="1" data-label="Ambush" title="Pre-set position, triggers when target enters area">Ambush +1CS</option>
              <option value="1" data-label="Double Team" title="Ally has Hold on target, second attacker gets bonus">Double Team +1CS</option>
              <option value="1" data-label="Combined" title="Two attackers within 1 rank damage, lower makes Agi FEAT">Combined Atk +1CS</option>
              <option value="1" data-label="Higher Ground" title="Judge discretion — elevated position, terrain advantage">Higher Ground +1CS</option>
            </optgroup>
            <optgroup label="Penalties">
              <option value="-2" data-label="Shielding" title="Using object as cover, -2CS all FEATs unless common item">Shielding -2CS</option>
              <option value="-2" data-label="Impaired" title="Lost Endurance ranks, -2CS all actions until healed">Impaired -2CS</option>
            </optgroup>
            <optgroup label="Target Size">
              <option value="1" data-label="Growth +1" title="Target is 12-18ft tall">Growth 12-18ft +1CS</option>
              <option value="2" data-label="Growth +2" title="Target is 18-22ft tall">Growth 18-22ft +2CS</option>
              <option value="3" data-label="Growth +3" title="Target is over 22ft tall">Growth 22ft+ +3CS</option>
              <option value="-1" data-label="Shrink -1" title="Target shrunk to ~1 inch">Shrunk 1&Prime; -1CS</option>
              <option value="-2" data-label="Shrink -2" title="Target shrunk to ~&frac14; inch">Shrunk &frac14;&Prime; -2CS</option>
              <option value="-3" data-label="Shrink -3" title="Target smaller than &frac14; inch">Shrunk smaller -3CS</option>
            </optgroup>
          </select>
        </div>
        <div class="frp-sit-tags" id="sit-tags"></div>
      </div>

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

      <!-- Options: Pull / Multi / Karma (greyed when unchecked) -->
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
        <div class="frp-opt-row${!hasKarma ? ' inactive' : hasKarma ? ' inactive' : ''}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">Miss</div>
        <div class="frp-fx-cell g">Hit</div>
        <div class="frp-fx-cell y">Slam</div>
        <div class="frp-fx-cell r">Stun</div>
      </div>

      <!-- Footer: checkboxes only (Roll/Cancel from Dialog buttons) -->
      <div class="frp-foot">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: actionName,
        content: dialogHtml,
        buttons: {
          roll: {
          label: "Roll",
          callback: async (html) => {
            const $content = $(html).find(".dialog-content").first();
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = $content.find("#msh-remember-settings").length
              ? $content.find("#msh-remember-settings").prop("checked")
              : !!$dlg('[name="remember"]').is(':checked');

            const skipDice = $content.find("#msh-skip-dice").length
              ? $content.find("#msh-skip-dice").prop("checked")
              : !!$dlg('[name="skipDice"]').is(':checked');

            try {
              localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
              localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");
            } catch (e) { /* ignore */ }

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
            const shift        = parseInt($dlg('[name="shift"]').val() || 0);
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma        = karmaToSpend;
            
            const pullEnabled  = $dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const resultCap    = pullEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";

            const multiEnabled = $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAdjacent = multiEnabled && multiCountVal === "adjacent";
            const multiAttacks  = multiEnabled && !multiAdjacent;
            const attackCount   = multiCountVal === "3" ? 3 : 2;

            // Build csNotes automatically from active situational tags
            const sitParts = [];
            html.find('.frp-sit-tag').each(function() {
              const label = $(this).data('label') || '';
              const cs = parseInt($(this).data('cs')) || 0;
              if (label) sitParts.push(`${label} ${cs > 0 ? '+' : ''}${cs}`);
            });
            const csNotes = sitParts.join(', ');

            // Collect active talent flags
            const talentFlags = {};
            html.find('.frp-talent-chip.active-flag').each(function() {
              const flag = $(this).data('flag');
              if (flag) talentFlags[flag] = true;
            });

            // Collect active chip states for persistence
            const activeChips = {};
            html.find('.frp-talent-chip.active-cs, .frp-talent-chip.active-ultimate').each(function() {
              const talent = $(this).data('talent');
              const isUlt = !!$(this).data('ultimate');
              if (talent) activeChips[talent] = isUlt ? 'ultimate' : 'cs';
            });
            html.find('.frp-talent-chip.active-flag').each(function() {
              const talent = $(this).data('talent');
              if (talent) activeChips[talent] = (activeChips[talent] || '') + ',flag';
            });

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

            // Persist actor flags if remembering
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastBluntSource", src);
              await actor.setFlag("msh-faserip", "lastBluntPullEnabled", pullEnabled);
              await actor.setFlag("msh-faserip", "lastBluntPulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip", "lastBluntResultCap", resultCap);
              await actor.setFlag("msh-faserip", "lastBluntShift", shift);
              await actor.setFlag("msh-faserip", "cs_blunt-attack", shift);
              await actor.setFlag("msh-faserip", "lastBluntKarma", karma);
              await actor.setFlag("msh-faserip", "karma_blunt-attack", karma);
              await actor.setFlag("msh-faserip", "lastBluntMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastBluntAttackCount", attackCount);
              await actor.setFlag("msh-faserip", "lastBluntMultiAdjacent", multiAdjacent);
              await actor.setFlag("msh-faserip", "lastBluntActiveChips", activeChips);

              if (src === "weapon") {
                await actor.setFlag("msh-faserip", "lastBluntItemId", itemId);
                await actor.setFlag("msh-faserip", "lastBluntColumnShift", shift); 
              } else if (src === "object") {
                await actor.setFlag("msh-faserip", "lastBluntObjectName", objectName);
                await actor.setFlag("msh-faserip", "lastBluntObjectRank", objectRank);
                await actor.setFlag("msh-faserip", "lastBluntObjectValue", objectValue);
              }
            }
            
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            resolve({
              src, itemId, objectName, objectRank, objectValue, shift, karma, spendKarma,
              pulledDamage, resultCap, skipDice, weaponMat, weaponName, damage, note,
              multiAttacks, attackCount, multiAdjacent, csNotes, talentFlags
            });
          }
        },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');
          
          // Inject mode buttons into the titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          // Setup mode selector on the full dialog (buttons are now in titlebar)
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastBluntMode");

          // Set dialog width
          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          const getLS = (k, d=null) => {
            try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; }
          };
          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

          // ── Talent chip click handler ──
          html.find('.frp-talent-chip').on('click', function() {
            const $chip = $(this);
            const cs = parseInt($chip.data('cs')) || 0;
            const flag = $chip.data('flag') || null;
            const isUltimate = !!$chip.data('ultimate');
            const $csInput = html.find('[name="shift"]');

            if (cs > 0) {
              const wasActive = $chip.hasClass('active-cs') || $chip.hasClass('active-ultimate');
              const activeClass = isUltimate ? 'active-ultimate' : 'active-cs';

              if (wasActive) {
                $chip.removeClass('active-cs active-ultimate');
                $csInput.val(parseInt($csInput.val()) - cs);
              } else {
                $chip.addClass(activeClass);
                $csInput.val(parseInt($csInput.val()) + cs);
              }
              $csInput.trigger('change');
            } else if (flag) {
              $chip.toggleClass('active-flag');
            }
          });

          // ── Main update function ──
          const update = () => {
            const damageSourceVal = html.find('#damage-source-select').val() || "hands";
            const $objectRow = html.find('#object-row');
            const $val  = html.find('#dmg-val');
            const $note = html.find('#dmg-note');
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
            $note.text("raw");

            const afterArmorDmg = Math.max(0, currentDamage - targetArmor);
            if (primaryTarget) {
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${currentDamage} damage`);
            }

            // CS display update
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRankText = shiftRank(ability.rank, cs);
            const $shiftedRank = html.find('#rank-blunt');
            const $csInput = html.find('.frp-cs-input');
            $shiftedRank.text(shiftedRankText);
            
            const $resetBtn = html.find('.frp-cs-reset');
            $csInput.removeClass('pos neg');
            if (cs > 0) {
              $csInput.addClass('pos');
              $shiftedRank.css('color', '#2e7d32');
              $resetBtn.css('visibility', 'visible');
            } else if (cs < 0) {
              $csInput.addClass('neg');
              $shiftedRank.css('color', '#c62828');
              $resetBtn.css('visibility', 'visible');
            } else {
              $shiftedRank.css('color', '');
              $resetBtn.css('visibility', 'hidden');
            }

            // Pull punch max update
            const oldMax = Number($pulledDamage.attr('max')) || 0;
            $pulledDamage.attr('max', maxDamage);
            if (oldMax !== maxDamage) {
              $pulledDamage.val(maxDamage);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          
          update();

          // ── Event bindings ──
          html.find('#damage-source-select').on('change', update);
          html.find('[name="shift"]').on('input change', update);
          html.find('[name="objectRank"]').on('change', function() {
            const rank = $(this).val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="objectValue"]').val(value);
            update();
          });
          html.find('[name="objectValue"]').on('input change', update);
          html.find('[name="objectName"]').on('input', update);
          
          // CS reset — deactivates talent chips, ultimate chips, and removes situational tags
          html.find('.frp-cs-reset').on('click', function(e) {
            e.preventDefault();
            html.find('[name="shift"]').val(0);
            html.find('.frp-talent-chip.active-cs, .frp-talent-chip.active-ultimate').removeClass('active-cs active-ultimate');
            html.find('#sit-tags').empty();
            html.find('[name="shift"]').trigger('change');
          });

          // ── Situational modifier: apply on select change ──
          html.find('#sit-select').on('change', function() {
            const $sel = $(this);
            const opt = $sel.find('option:selected');
            const cs = parseInt(opt.val());
            const label = opt.data('label') || '';
            if (!cs || !label) return;

            // Prevent duplicate
            let exists = false;
            html.find('.frp-sit-tag').each(function() {
              if ($(this).data('label') === label) exists = true;
            });
            if (exists) { $sel.val(''); return; }

            const sign = cs > 0 ? '+' : '';
            const cls = cs < 0 ? ' penalty' : '';
            const tag = $(`<span class="frp-sit-tag${cls}" data-cs="${cs}" data-label="${label}">
              ${label} <span class="tag-cs">${sign}${cs}</span>
              <span class="tag-x">&times;</span>
            </span>`);
            html.find('#sit-tags').append(tag);

            const $csInput = html.find('[name="shift"]');
            $csInput.val(parseInt($csInput.val()) + cs).trigger('change');
            $sel.val('');
          });

          // ── Situational modifier: remove tag ──
          html.find('#sit-tags').on('click', '.tag-x', function() {
            const $tag = $(this).closest('.frp-sit-tag');
            const cs = parseInt($tag.data('cs')) || 0;
            const $csInput = html.find('[name="shift"]');
            $csInput.val(parseInt($csInput.val()) - cs).trigger('change');
            $tag.remove();
          });
          
          // Pull punch toggle — enable/disable sub-controls + inactive styling
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
          });

          // Multi-attack toggle — inactive styling + disable radios
          html.find('#multi-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="multiCount"]').prop('disabled', !this.checked);
          });

          // Karma toggle — inactive styling
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });
          
          applyCapabilitiesToDialog(html, "blunt-attack", { actor });

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        }
      }).render(true);
    });
    
    if (!choice) return;

    // Track shift breakdown
    const shiftBreakdown = {
      manual: choice.shift || 0,
      multiAttack: 0,
      adjacent: 0,
      csNotes: choice.csNotes || ""
    };

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
      const fightingAbility = getAbilityInfo(actor, "fighting");
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";
      
      const effectiveFightingRank = shiftRank(fightingAbility.rank, choice.shift || 0);
      
      const featResult = await this._rollFightingFeat(
        actor, 
        { ...fightingAbility, rank: effectiveFightingRank }, 
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
      } catch (_e) { /* setting not registered yet */ }
      
      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#eef6ff;border:1px solid #90caf9;border-radius:3px;padding:6px;margin:4px 0;">
            <b>Multi-Attack FEAT:</b> ${intensity} — ${
              featResult?.success ? "SUCCESS" : "FAIL"
            } ${featResult?.auto ? "(Automatic)" : ""}</div>`
        });
      }

      const featSuccess    = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
      const featImpossible =  !!(featResult?.resultColor === "IMPOSSIBLE");
      if (featSuccess && !featImpossible) {
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
        breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat } : null,
        targetCount
      });
    } else {
      const selected = Array.from(game.user?.targets ?? []);
      const count = Math.max(1, actualAttackCount);

      for (let i = 0; i < count; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 300));

        const tgt = (count === 1)
          ? (selected[0] ?? null)
          : (selected.length ? selected[i % selected.length] : null);

        await this._executeSingleAttack({
          choice: { ...choice, specificTarget: tgt, multiAttackFeatResult: i === 0 ? multiAttackFeatResult : null },
          actor, ability,
          actionType, actionName, effects,
          damageType: "physical-blunt",
          rawDamage: choice.damage,
          damageNote: choice.note,
          sourceName: choice.weaponName || "Bare Hands",
          attackForm: "blunt",
          breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat } : null,
          targetCount: 1,
          attackNumber: i + 1,
          totalAttacks: count
        });
      }
    }

  }
}