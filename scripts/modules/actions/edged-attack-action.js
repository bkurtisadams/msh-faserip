// edged-attack-action.js v3.1.0 - 2026-03-17
// v3.1.0: Manual CS only — remove talent/power auto-detection, chip handlers,
//         sit-tag handlers. CS row from shared cs-modifiers.js (manual + ? ref).

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
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

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

    // Build CS row via shared utility (manual input + ? reference)
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      abilityRank: ability.rank
    });

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
      let _csState = null;
      let _resolved = false;
      const dlg = new Dialog({
        title: actionName,
        content: dialogHtml,
        buttons: {},
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          // Hide Foundry's native button row
          $dialog.find('.dialog-buttons').hide();
          
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

          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

          // ── Wire CS panel from shared utility ──
          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            onUpdate: () => {
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

            const rememberSettings = $dlg("#msh-remember-settings").is(':checked');
            const skipDice = $dlg("#msh-skip-dice").is(':checked');
            setLS(lsRememberKey, rememberSettings ? "1" : "0");
            setLS(lsSkipKey, skipDice ? "1" : "0");

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
            const shift = _csState.get().totalShift;
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;

            const multiEnabled = $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAttacks = multiEnabled;
            const multiAdjacent = false; // edged cannot do adjacent attacks
            const attackCount = (multiCountVal === "3") ? 3 : 2;

            const csNotes = _csState.get().csNotes;

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
              await actor.setFlag("msh-faserip", "lastEdgedShift", _csState.get().manualCS);
              await actor.setFlag("msh-faserip", "cs_edged-attack", _csState.get().manualCS);
              await actor.setFlag("msh-faserip", "lastEdgedKarma", karma);
              await actor.setFlag("msh-faserip", "karma_edged-attack", karma);
              await actor.setFlag("msh-faserip", "lastEdgedMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastEdgedAttackCount", attackCount);
              await actor.setFlag("msh-faserip", "lastEdgedMultiAdjacent", multiAdjacent);

              if (src === "weapon") {
                await actor.setFlag("msh-faserip", "lastEdgedItemId", itemId);
              } else {
                await actor.setFlag("msh-faserip", "lastNaturalWeaponRank", natRank);
                await actor.setFlag("msh-faserip", "lastNaturalWeaponDamage", natDmg);
              }
            }
            
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            _resolved = true;
            resolve({
              src, itemId, natRank, natDmg, shift, karma, spendKarma, skipDice,
              weaponMat, weaponName, damage, note,
              armorPiercing: ap, armorPiercingCS: apCS, apMode, bypassForceField: bypassFF,
              multiAttacks, attackCount, multiAdjacent, csNotes
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
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

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          
          update();

          // ── Event bindings ──
          html.find('#damage-source-select').on('change', update);
          html.find('[name="natRank"]').on('change', function() {
            const rank = $(this).val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="natDmg"]').val(value);
            update();
          });
          html.find('[name="natDmg"]').on('input change', update);

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
      const fightingAbility = getAbilityInfo(actor, "fighting");
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";
      
      // Multi-attack FEAT uses raw Fighting rank — attack CS does not apply
      const featResult = await this._rollFightingFeat(
        actor, 
        fightingAbility, 
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