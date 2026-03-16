// edged-attack-action.js v3.0.1 - 2026-03-15
// v3.0.0: Port to v3 compact dialog layout matching blunt-attack-action.js
//         - frp-header-v3 banner, inline CS + chips + situational dropdown
//         - Unified damage source select (Natural/Weapon), frp-dmg-box inline
//         - Greyed opt-rows (Multi/Karma), frp-fx-grid (Miss/Hit/Stun/Kill)
//         - Titlebar mode buttons, 360px width
//         - Talent chip detection (MA-B, Boxing, MA-D, Sharp Weapons, MA-E)
//         - AP display inline in damage row
// v2.0.2: Use getTargetData() from action-utils.js for target acquisition

import { AttackAction } from "./attack-action.js";
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  getStrengthInfo,
  effectsFor,
  labelFor,
  isEdgedCapable,
  computeEdgedDamage,
  rollWithKarmaAndHistory,
  buildResultGrid,
  bannerColors,
  applyDamageToTargets,
  buildModeSelector,
  setupModeSelector,
  applyCapabilitiesToDialog,
  buildInlineFeatDisplay,
  debugLog,
  buildActionsBox,
  getTargetData,
  getBodyArmorValues
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

export class EdgedAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "edged-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);

    // Normalize Armor Piercing across possible fields and shapes
    const getArmorPiercing = (it) => {
      const s = it?.system || {};
      const props = s.properties || {};
      const ap =
        s.armorPiercing ??
        s.penetration ??
        s.ap ??
        (props.armorPiercing === true ? 1 : 0);
      return Number(ap) || 0;
    };

    // Effective armor after AP reduction (flat or CS-based)
    const _getEffectiveArmor = (base, ap, apCS, apMode) => {
      if (apMode === "cs" && apCS > 0 && base > 0) {
        const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
        let _i = _RV.findIndex(v => v >= base);
        if (_i < 0) _i = _RV.length - 1;
        if (_i > 0 && _RV[_i] > base) _i--;
        return _RV[Math.max(0, _i - apCS)];
      }
      return Math.max(0, base - ap);
    };

    let attackItems = actor.items.filter(isEdgedCapable);

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      if (!attackItems.find(i => i.id === passedItem.id)) {
        attackItems = [passedItem, ...attackItems];
      }
    }

    // Detect combat talents that affect Fighting/edged attacks
    const combatTalents = [];
    for (const item of actor.items) {
      if (item.type !== "talent") continue;
      const name = (item.name || "").toLowerCase();
      const rankOverride = item.system?.rankOverride || "";
      
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
      else if (name.includes("martial arts d") || name.includes("martial arts-d") ||
               (name.includes("martial arts") && name.includes("(d)"))) {
        combatTalents.push({ name: "MA-D", cs: 0, flag: "ignore-armor-fx", note: "ignore armor (fx)", ultimateCS, rankOverride });
      }
      else if (name.includes("sharp weapons") || name.includes("sharpweapons") || name.includes("sharp wpn")) {
        combatTalents.push({ name: "Sharp Wpn", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts e") || name.includes("martial arts-e") ||
               (name.includes("martial arts") && name.includes("(e)"))) {
        combatTalents.push({ name: "MA-E", cs: 0, flag: "initiative", note: "+1 Initiative", ultimateCS, rankOverride });
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.ea.remember";
    const lsSkipKey = "msh.ea.skipDice";
    
    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    const defaultSource = (passedItemId && passedItem?.type === "equipment") ? "weapon" : "weapon";
    
    const savedSource = shouldRemember 
      ? ((await actor.getFlag("msh-faserip","lastEdgedSource")) || defaultSource)
      : defaultSource;

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedItemId")) : "") || "";
    
    const savedNatRank = shouldRemember ? ((await actor.getFlag("msh-faserip","lastNaturalWeaponRank")) || "Good") : "Good";
    const savedNatDmg = shouldRemember ? ((await actor.getFlag("msh-faserip","lastNaturalWeaponDamage")) || game.msh.getRankValue(savedNatRank)) : game.msh.getRankValue("Good");

    const savedMultiAttacks = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedMultiAttacks") || false) : false;
    const savedAttackCount = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedAttackCount") || 2) : 2;
    const savedMultiAdjacent = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedMultiAdjacent") || false) : false;
    const savedColumnShift = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedShift") || 0) : 0;
    const savedActiveChips = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedActiveChips") || {}) : {};
    
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // Get target info
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-edged") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";
    const armorNote = targets.length > 1 ? " (1st)" : "";

    // Compute initial damage based on saved source
    let initialDamage = savedNatDmg;
    let initialAP = 0;
    let initialAPCS = 0;
    let initialAPMode = "value";
    if (savedSource === "weapon" && savedItemId) {
      const savedWeapon = attackItems.find(i => i.id === savedItemId);
      if (savedWeapon) {
        const mat = getItemMaterialRank(savedWeapon);
        let base = Number(savedWeapon.system?.damage || 0);
        const da = this.opts?.deviceAbility;
        if (da?.rank && savedWeapon?.system?.category === "device") {
          base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
        }
        const res = computeEdgedDamage(strength.rank, strength.value, mat, base);
        initialDamage = res.damage;
        initialAP = getArmorPiercing(savedWeapon);
        initialAPCS = Number(savedWeapon.system?.armorPiercingCS || 0) || 0;
        initialAPMode = savedWeapon.system?.apMode || "value";
      }
    }
    const initialEffArmor = _getEffectiveArmor(targetArmor, initialAP, initialAPCS, initialAPMode);
    const initialAfterArmor = Math.max(0, initialDamage - initialEffArmor);

    // Karma info
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // CS display classes
    const csInputCls = savedColumnShift > 0 ? ' pos' : savedColumnShift < 0 ? ' neg' : '';
    const csRankStyle = savedColumnShift > 0 ? 'color:#2e7d32;' : savedColumnShift < 0 ? 'color:#c62828;' : '';

    // Build talent chips HTML
    const talentChipsHtml = combatTalents.map(t => {
      const savedState = savedActiveChips[t.name] || '';
      const flagActive = savedState.includes('flag');

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
      if (t.flag) {
        return `<span class="frp-talent-chip${flagActive ? ' active-flag' : ''}" data-flag="${t.flag}" data-talent="${t.name}">
          ${t.name} <span class="chip-note">${t.note}</span>
        </span>`;
      }
      return '';
    }).join('');

    // Natural weapon rank options
    const natRankOpts = RANKS.map(r => `<option value="${r}" ${savedNatRank===r?'selected':''}>${r}</option>`).join('');

    // Build unified damage source <select>
    const damageSrcOptions = [];
    damageSrcOptions.push(`<option value="natural" ${savedSource==='natural'?'selected':''}>Natural Weapon &mdash; ${savedNatRank} (${savedNatDmg})</option>`);
    for (const i of attackItems) {
      const mat = getItemMaterialRank(i);
      let base = Number(i.system?.damage || 0);
      const da = this.opts?.deviceAbility;
      if (da?.rank && i?.system?.category === "device") {
        base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
      }
      const res = computeEdgedDamage(strength.rank, strength.value, mat, base);
      const ap = getArmorPiercing(i);
      const apLabel = ap > 0 ? ` [AP ${ap}]` : "";
      const sel = (savedSource === 'weapon' && savedItemId === i.id) ? 'selected' : '';
      damageSrcOptions.push(`<option value="weapon:${i.id}" ${sel}>${i.name} &mdash; ${res.damage} dmg${apLabel}</option>`);
    }

    let initDamageSrcVal = "natural";
    if (savedSource === "weapon" && savedItemId) initDamageSrcVal = `weapon:${savedItemId}`;

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // AP label for initial display
    const initialAPLabel = (initialAPMode === "cs" && initialAPCS > 0) ? `${initialAPCS}CS` : (initialAP > 0 ? String(initialAP) : "");

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
          <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedColumnShift}" id="cs-edged">
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-cs-rank" id="rank-edged" style="${csRankStyle}">${shiftRank(ability.rank, savedColumnShift)}</span>
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
        <!-- AP indicator -->
        <div id="ap-display" style="font-size:11px;color:#1565c0;margin-top:2px;${initialAPLabel ? '' : 'display:none;'}">
          AP: <strong id="ap-val">${initialAPLabel}</strong> (reduces target armor)
        </div>
        <!-- Natural weapon sub-fields (hidden unless natural selected) -->
        <div class="object-row" id="natural-row" style="display:${savedSource==='natural'?'block':'none'}">
          <div class="obj-grid">
            <label>Rank:</label>
            <select name="natRank">${natRankOpts}</select>
            <label>Damage:</label>
            <input type="number" name="natDmg" value="${savedNatDmg}">
          </div>
        </div>
      </div>

      <!-- Options: Multi / Karma — edged can x2/x3 (Slugfest) but NOT adjacent -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!multiEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${multiEnabled ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <label style="margin-left:8px;"><input type="radio" name="multiCount" value="2" ${(!savedMultiAttacks || savedAttackCount === 2) ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;2</label>
          <label><input type="radio" name="multiCount" value="3" ${savedAttackCount === 3 ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;3</label>
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
        <div class="frp-fx-cell y">Stun</div>
        <div class="frp-fx-cell r">Kill</div>
      </div>

      <!-- Footer -->
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
            const damageSourceVal = $dlg('#damage-source-select').val() || "natural";
            let src, itemId;
            if (damageSourceVal === "natural") {
              src = "natural"; itemId = "";
            } else if (damageSourceVal.startsWith("weapon:")) {
              src = "weapon"; itemId = damageSourceVal.replace("weapon:", "");
            } else {
              src = "natural"; itemId = "";
            }

            const natRank = $dlg('[name="natRank"]').val() || savedNatRank;
            const natDmg = Number($dlg('[name="natDmg"]').val() || game.msh.getRankValue(natRank));
            const shift = parseInt($dlg('[name="shift"]').val() || 0);
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;

            const multiEnabled = $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAttacks = multiEnabled;
            const multiAdjacent = false; // edged cannot do adjacent attacks
            const attackCount = (multiCountVal === "3") ? 3 : 2;

            // Build csNotes from active situational tags
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
            let weaponMat = "", weaponName = "", damage = natDmg, note = "";
            let ap = 0, apCS = 0, apMode = "value", bypassFF = false;
            if (src === "weapon") {
              const item = attackItems.find(i => i.id === itemId) || null;
              if (!item) {
                weaponMat = "Feeble"; weaponName = "(No weapon)"; damage = 0; note = "No weapon selected";
              } else {
                weaponMat = getItemMaterialRank(item);
                weaponName = item.name;
                let base = Number(item.system?.damage || 0);
                const da = this.opts?.deviceAbility;
                if (da?.rank && item?.system?.category === "device") {
                  base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
                  weaponName = `${da.name} (${item.name})`;
                }
                ap = getArmorPiercing(item);
                apCS = Number(item.system?.armorPiercingCS || 0) || 0;
                apMode = item.system?.apMode || "value";
                bypassFF = !!item.system?.bypassForceField;
                const res = computeEdgedDamage(strength.rank, strength.value, weaponMat, base);
                damage = res.damage; note = res.note;
              }
            } else {
              weaponMat = natRank;
              weaponName = "Natural Weapon";
              damage = natDmg;
              note = `${natRank} natural weapon`;
            }

            // Persist actor flags if remembering
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastEdgedSource", src);
              await actor.setFlag("msh-faserip", "lastEdgedShift", shift);
              await actor.setFlag("msh-faserip", "cs_edged-attack", shift);
              await actor.setFlag("msh-faserip", "lastEdgedKarma", karma);
              await actor.setFlag("msh-faserip", "karma_edged-attack", karma);
              await actor.setFlag("msh-faserip", "lastEdgedMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastEdgedAttackCount", attackCount);
              await actor.setFlag("msh-faserip", "lastEdgedMultiAdjacent", multiAdjacent);
              await actor.setFlag("msh-faserip", "lastEdgedActiveChips", activeChips);

              if (src === "weapon") {
                await actor.setFlag("msh-faserip", "lastEdgedItemId", itemId);
              } else {
                await actor.setFlag("msh-faserip", "lastNaturalWeaponRank", natRank);
                await actor.setFlag("msh-faserip", "lastNaturalWeaponDamage", natDmg);
              }
            }
            
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            resolve({
              src, itemId, natRank, natDmg, shift, karma, spendKarma, skipDice,
              weaponMat, weaponName, damage, note,
              armorPiercing: ap, armorPiercingCS: apCS, apMode, bypassForceField: bypassFF,
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
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastEdgedMode");

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
            const damageSourceVal = html.find('#damage-source-select').val() || "natural";
            const $naturalRow = html.find('#natural-row');
            const $val = html.find('#dmg-val');
            const $afterArmor = html.find('#after-armor-display');
            const $apDisplay = html.find('#ap-display');
            const $apVal = html.find('#ap-val');

            $naturalRow.hide();

            let src, currentItemId;
            if (damageSourceVal === "natural") {
              src = "natural"; currentItemId = "";
              $naturalRow.show();
            } else if (damageSourceVal.startsWith("weapon:")) {
              src = "weapon"; currentItemId = damageSourceVal.replace("weapon:", "");
            } else {
              src = "natural"; currentItemId = "";
              $naturalRow.show();
            }

            let currentDamage = savedNatDmg;
            let currentAP = 0;
            let currentAPCS = 0;
            let currentAPMode = "value";

            if (src === "natural") {
              const rank = String(html.find('[name="natRank"]').val() || savedNatRank);
              const dmg = Number(html.find('[name="natDmg"]').val() || game.msh.getRankValue(rank));
              currentDamage = dmg;
              currentAP = 0;
            } else {
              const item = attackItems.find(i => i.id === currentItemId) || null;
              if (!item) {
                currentDamage = 0;
              } else {
                const mat = getItemMaterialRank(item);
                let base = Number(item.system?.damage || 0);
                const da = this.opts?.deviceAbility;
                if (da?.rank && item?.system?.category === "device") {
                  base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
                }
                const res = computeEdgedDamage(strength.rank, strength.value, mat, base);
                currentDamage = res.damage;
                currentAP = getArmorPiercing(item);
                currentAPCS = Number(item.system?.armorPiercingCS || 0) || 0;
                currentAPMode = item.system?.apMode || "value";
              }
            }

            $val.text(currentDamage);

            // AP display
            const hasAP = (currentAPMode === "cs" && currentAPCS > 0) || (currentAPMode !== "cs" && currentAP > 0);
            if (hasAP) {
              $apDisplay.show();
              $apVal.text(currentAPMode === "cs" ? `${currentAPCS}CS` : currentAP);
            } else {
              $apDisplay.hide();
            }

            // After-armor display (accounting for AP)
            const effectiveArmor = _getEffectiveArmor(targetArmor, currentAP, currentAPCS, currentAPMode);
            const afterArmorDmg = Math.max(0, currentDamage - effectiveArmor);
            if (primaryTarget) {
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${currentDamage} damage`);
            }

            // CS display update
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRankText = shiftRank(ability.rank, cs);
            const $shiftedRank = html.find('#rank-edged');
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

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          
          update();

          // ── Event bindings ──
          html.find('#damage-source-select').on('change', update);
          html.find('[name="shift"]').on('input change', update);
          html.find('[name="natRank"]').on('change', function() {
            const rank = $(this).val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="natDmg"]').val(value);
            update();
          });
          html.find('[name="natDmg"]').on('input change', update);
          
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
          
          applyCapabilitiesToDialog(html, "edged-attack", { actor });

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

      const featSuccess = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
      const featImpossible = !!(featResult?.resultColor === "IMPOSSIBLE");
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
        damageType: "physical-edged",
        rawDamage: choice.damage,
        damageNote: choice.note,
        sourceName: choice.weaponName || "Natural Weapon",
        attackForm: "edged",
        breakingFeat: { weaponMat: choice.weaponMat },
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
          damageType: "physical-edged",
          rawDamage: choice.damage,
          damageNote: choice.note,
          sourceName: choice.weaponName || "Natural Weapon",
          attackForm: "edged",
          breakingFeat: { weaponMat: choice.weaponMat },
          targetCount: 1,
          attackNumber: i + 1,
          totalAttacks: count
        });
      }
    }
  }
}