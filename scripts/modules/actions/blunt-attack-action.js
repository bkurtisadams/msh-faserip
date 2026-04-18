// blunt-attack-action.js v3.5.0 - 2026-03-17
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
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
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

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // Build CS row via shared utility (manual input + ? reference)
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
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
      const sel = (savedSource === 'weapon' && savedItemId === i.id) ? 'selected' : '';
      damageSrcOptions.push(`<option value="weapon:${i.id}" ${sel}>${i.name} &mdash; ${res.damage} dmg</option>`);
    }
    damageSrcOptions.push(`<option value="object" ${savedSource==='object'?'selected':''}>Improvised Object&hellip;</option>`);

    // Determine initial saved damage source value for the select
    let initDamageSrcVal = "hands";
    if (savedSource === "weapon" && savedItemId) initDamageSrcVal = `weapon:${savedItemId}`;
    else if (savedSource === "object") initDamageSrcVal = "object";

    // ── Fighting info for multi-attack FEAT panel ──
    const fightingAbility = getAbilityInfo(actor, "fighting");
    const fightingShort = RANK_ABBR[fightingAbility.rank] || fightingAbility.rank;

    // ── Dialog HTML — v3 Ultra Compact Layout ──
    const multiEnabled = savedMultiAttacks || savedMultiAdjacent;
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

        <!-- Multi-Attack FEAT indicator (hidden unless Multi x2/x3 checked) -->
        <div id="multi-feat-panel" style="display:none;padding:5px 8px;border-bottom:1px solid #e8e0d0;">
          <div id="feat-result-bar" style="padding:4px 8px;border-radius:3px;font-size:12px;font-weight:600;text-align:center;"></div>
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
      const dlg = new Dialog({
        title: actionName,
        content: dialogHtml,
        buttons: {},
        render: async (html) => {
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

            const multiEnabled = $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAdjacent = multiEnabled && multiCountVal === "adjacent";
            const multiAttacks  = multiEnabled && !multiAdjacent;
            const attackCount   = multiCountVal === "3" ? 3 : 2;

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

            // Save settings
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastBluntSource", src);
              await actor.setFlag("msh-faserip", "lastBluntPullEnabled", pullEnabled);
              await actor.setFlag("msh-faserip", "lastBluntPulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip", "lastBluntResultCap", resultCap);
              await actor.setFlag("msh-faserip", "lastBluntShift", cs.manualCS);
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
              multiAttacks, attackCount, multiAdjacent,
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
          });

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

          // Multi-attack toggle
          html.find('#multi-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="multiCount"]').prop('disabled', !this.checked);
            _updateFeatPanel();
          });
          html.find('[name="multiCount"]').on('change', _updateFeatPanel);
          _updateFeatPanel();

          // Karma toggle
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
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
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
        breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat, weaponName: choice.weaponName } : null,
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
          breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat, weaponName: choice.weaponName } : null,
          targetCount: 1,
          attackNumber: i + 1,
          totalAttacks: count
        });
      }
    }

  }
}