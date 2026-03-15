//--- START OF FILE edged-attack-action.js ---
// edged-attack-action.js v2.0.2 - 2025-12-24
// v2.0.2: Use getTargetData() from action-utils.js for target acquisition
// v2.0.1: Fix getTargetingContext - build target array manually like blunt-attack
// v2.0.0: Complete dialog redesign to match blunt-attack compact style
//         - Two-column Target/Attack info grid
//         - Compact CS/Karma row with directional coloring
//         - Inline multi-attack radios
//         - Styled source section with highlight
//         - After-armor damage preview with AP display

import { AttackAction } from "./attack-action.js";
import { 
  generateKarmaControlsHTML, 
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
  rollWithKarmaAndHistory,
  buildResultGrid,
  bannerColors,
  applyDamageToTargets,
  postDeathSavePrompt,
  applyCapabilitiesToDialog,
  buildModeSelector,
  setupModeSelector,
  debugLog,
  buildActionsBox,
  buildInlineFeatDisplay,
  getTargetData,
  getBodyArmorValues
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class EdgedAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "edged-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);

    // local helpers
    const isEdgedCapable = (it) => {
      const s = it.system || {};
      const tagHit = Array.isArray(s.tags) && (s.tags.includes("EA") || s.tags.includes("edged"));
      return (s.damageType === "EA") || (s.attackType === "edged") || tagHit;
    };
    
    const computeEdgedDamage = (strRank, strVal, matRank, weaponBase = 0) => {
      // Damage = max(min(STR rank value, material rank value), weapon base)
      const getVal = (r) => game.msh.getRankValue(r) || 0;
      const sIdx = RANKS.indexOf(strRank);
      const mIdx = RANKS.indexOf(matRank);
      if (sIdx < 0 || mIdx < 0) {
        return { damage: Math.max(strVal, weaponBase), note: weaponBase ? `Weapon base (${weaponBase})` : "Strength" };
      }
      const strCap = getVal(strRank);
      const matVal = getVal(matRank);
      const calc = Math.min(strCap, matVal);
      const finalDmg = Math.max(calc, Number(weaponBase || 0));
      let note = "";
      if (finalDmg === weaponBase && weaponBase > calc) {
        note = `Weapon base ${weaponBase}`;
      } else if (strCap <= matVal) {
        note = `STR capped (${strCap})`;
      } else {
        note = `Material capped (${matVal})`;
      }
      return { damage: finalDmg, note };
    };

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

    const attackItems_base = actor.items.filter(isEdgedCapable);
    
    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    let attackItems = attackItems_base;
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

    // Load settings (Flag vs Default)
    const defaultSource = (passedItemId && passedItem?.type === "equipment") ? "weapon" : "weapon";
    
    const savedSource = shouldRemember 
      ? ((await actor.getFlag("msh-faserip","lastEdgedSource")) || defaultSource)
      : defaultSource;

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedItemId")) : "") || "";
    
    const savedNatRank = shouldRemember ? ((await actor.getFlag("msh-faserip","lastNaturalWeaponRank")) || "Good") : "Good";
    const savedNatDmg = shouldRemember ? ((await actor.getFlag("msh-faserip","lastNaturalWeaponDamage")) || game.msh.getRankValue(savedNatRank)) : game.msh.getRankValue("Good");

    const savedMultiAttacks = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedMultiAttacks") || false) : false;
    const savedAttackCount = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedAttackCount") || 2) : 2;
    const savedColumnShift = shouldRemember ? (await actor.getFlag("msh-faserip","lastEdgedShift") || 0) : 0;
    
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // Get target info for armor display
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-edged") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st target)" : "";

    // Compute initial damage based on saved source
    let initialDamage = savedNatDmg;
    let initialAP = 0;
    if (savedSource === "weapon" && savedItemId) {
      const savedWeapon = attackItems.find(i => i.id === savedItemId);
      if (savedWeapon) {
        const mat = getItemMaterialRank(savedWeapon);
        let base = Number(savedWeapon.system?.damage || 0);
        // Device custom ability: use ability rank value as weapon base damage
        const da = this.opts?.deviceAbility;
        if (da?.rank && savedWeapon?.system?.category === "device") {
          base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
        }
        const res = computeEdgedDamage(strength.rank, strength.value, mat, base);
        initialDamage = res.damage;
        initialAP = getArmorPiercing(savedWeapon);
      }
    }
    const initialAfterArmor = Math.max(0, initialDamage - Math.max(0, targetArmor - initialAP));

    // Karma info for compact display
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // Dialog HTML - Compact style matching blunt-attack
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target${targets.length > 1 ? 's' : ''}</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay}</div>
          <div style="color:#666;" id="target-armor-display">${primaryTargetActor ? `Armor: ${targetArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}${armorNote}` : ''}</div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Attack</div>
          <div style="font-weight:600;">${ability.name}: ${ability.rank}</div>
          <div style="color:#666;">Rank Value: ${ability.value}</div>
        </div>
      </div>

      <!-- Source Selection -->
      <div class="source-section" style="padding:8px;background:${savedSource !== 'natural' ? '#fff8e1' : '#fff'};border:1px solid ${savedSource !== 'natural' ? '#ffc107' : '#ddd'};border-radius:3px;margin-bottom:8px;">
        <div style="margin-bottom:4px;">
          <label><input type="radio" name="src" value="natural" ${savedSource==='natural'?'checked':''}> Natural Weapon</label>
          <label style="margin-left:12px;"><input type="radio" name="src" value="weapon" ${savedSource==='weapon'?'checked':''}> Edged Weapon</label>
          <span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:#DC143C;color:#fff;font-size:11px;font-weight:bold;cursor:help;margin-left:6px;" title="EDGED DAMAGE RULES:
- Natural Weapon: Uses rank damage directly
- Edged Weapon: min(STR value, Material value)
  then max with weapon base damage

Armor Piercing (AP) reduces target armor by that value.">?</span>
        </div>
        
        <div id="natural-row" style="display:none;margin-top:6px;">
          <div style="display:grid;grid-template-columns:auto 1fr auto 60px;gap:4px 8px;align-items:center;">
            <label>Rank:</label>
            <select name="natRank" style="padding:4px;">
              ${RANKS.map(r => `<option value="${r}" ${r===savedNatRank?'selected':''}>${r}</option>`).join('')}
            </select>
            <label>Damage:</label>
            <input type="number" name="natDmg" value="${savedNatDmg}" style="padding:4px;width:100%;">
          </div>
        </div>

        <div id="weapon-row" style="display:none;margin-top:6px;">
          <select name="item" style="width:100%;padding:4px;">${itemOptions || `<option value="">(No edged weapons)</option>`}</select>
        </div>
      </div>

      <!-- Damage Preview -->
      <div id="preview" style="background:#fce4ec;border:1px solid #e91e63;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialDamage}</span> <span id="dmg-note" style="color:#555;"></span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>→ ${initialAfterArmor} after armor</strong></span>
        </div>
        <div id="ap-display" style="color:#666;font-size:.9em;margin-top:4px;${initialAP > 0 ? '' : 'display:none;'}">
          Armor Piercing: <strong id="ap-val">${initialAP}</strong> (reduces target armor)
        </div>
      </div>

      <!-- Modifiers Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedColumnShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedColumnShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${savedColumnShift}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${savedColumnShift < 0 ? 'color:#c62828;' : savedColumnShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(ability.rank, savedColumnShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedColumnShift !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>
        <div class="karma-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${hasKarma ? 'background:#e3f2fd;border:1px solid #90caf9;' : ''}">
          ${hasKarma ? `
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="spend-karma" name="spendKarma">
              <span style="font-weight:600;">Karma:</span>
            </label>
            <span title="Available: ${availableKarma} | Min commitment: ${minKarma} | Amount chosen after roll" style="padding:1px 4px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${availableKarma}</span>
            <span style="color:#999;font-size:.8em;">(min ${minKarma})</span>
          ` : `<span style="color:#999;">No karma</span>`}
        </div>
      </div>

      <!-- Multi-Attack Row -->
      <div style="padding:6px 8px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:3px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;color:#2e7d32;">Multi:</span>
          <label title="Single attack, no penalty" style="cursor:pointer;"><input type="radio" name="multiMode" value="off" ${!savedMultiAttacks ? 'checked' : ''}> Off</label>
          <label title="Remarkable Fighting FEAT. Success: 2 attacks at -1CS each. Fail: 1 attack at -3CS." style="cursor:pointer;"><input type="radio" name="multiMode" value="2" ${savedMultiAttacks && savedAttackCount === 2 ? 'checked' : ''}> 2 atk</label>
          <label title="Amazing Fighting FEAT. Success: 3 attacks at -1CS each. Fail: 1 attack at -3CS." style="cursor:pointer;"><input type="radio" name="multiMode" value="3" ${savedMultiAttacks && savedAttackCount === 3 ? 'checked' : ''}> 3 atk</label>
        </div>
      </div>

      <!-- Footer -->
      <div id="msh-bottom-controls" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${actionName}: ${actor.name}`,
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

              // Persist localStorage settings
              localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
              localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");

              // Gather form values
              const src = $dlg('[name="src"]:checked').val() || "natural";
              const itemId = $dlg('[name="item"]').val() || "";
              const natRank = $dlg('[name="natRank"]').val() || savedNatRank;
              const natDmg = Number($dlg('[name="natDmg"]').val() || game.msh.getRankValue(natRank));
              const shift = parseInt($dlg('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;

              // Multi-attack from radio
              const multiMode = $dlg('[name="multiMode"]:checked').val() || "off";
              const multiAttacks = (multiMode === "2" || multiMode === "3");
              const attackCount = (multiMode === "3") ? 3 : 2;

              // Compute damage and notes
              let weaponMat = "", weaponName = "", damage = natDmg, note = "", ap = 0, apCS = 0, apMode = "value", bypassFF = false;
              if (src === "natural") {
                weaponMat = natRank;
                weaponName = "Natural Weapon";
                damage = natDmg;
                note = `${natRank} natural weapon`;
              } else {
                const item = attackItems.find(i => i.id === itemId) || null;
                if (!item) {
                  weaponMat = "Feeble";
                  weaponName = "(No weapon)";
                  damage = 0;
                  note = "No weapon selected";
                  ap = 0;
                } else {
                  weaponMat = getItemMaterialRank(item);
                  weaponName = item.name;
                  let base = Number(item.system?.damage || 0);
                  // Device custom ability: use ability rank value as weapon base damage
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
                  damage = res.damage;
                  note = res.note;
                }
              }

              // Remember per-actor prefs
              if (rememberSettings) {
                await actor.setFlag("msh-faserip", "lastEdgedSource", src);
                await actor.setFlag("msh-faserip", "lastEdgedShift", shift);
                await actor.setFlag("msh-faserip", "cs_edged-attack", shift);
                await actor.setFlag("msh-faserip", "lastEdgedKarma", karma);
                await actor.setFlag("msh-faserip", "karma_edged-attack", karma);
                await actor.setFlag("msh-faserip", "lastEdgedMultiAttacks", multiAttacks);
                await actor.setFlag("msh-faserip", "lastEdgedAttackCount", attackCount);

                if (src === "weapon") {
                  await actor.setFlag("msh-faserip", "lastEdgedItemId", itemId);
                } else {
                  await actor.setFlag("msh-faserip", "lastNaturalWeaponRank", natRank);
                  await actor.setFlag("msh-faserip", "lastNaturalWeaponDamage", natDmg);
                }
              }

              resolve({
                src, itemId, natRank, natDmg, shift, karma, spendKarma, skipDice,
                weaponMat, weaponName, damage, note, armorPiercing: ap, armorPiercingCS: apCS, apMode, bypassForceField: bypassFF,
                multiAttacks, attackCount
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');
          
          await setupModeSelector(actor, html, this.opts || {}, "lastEdgedMode");

          const getLS = (k, d=null) => {
            try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; }
          };
          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

          const update = () => {
            const src = html.find('[name="src"]:checked').val() || "natural";
            const $naturalRow = html.find('#natural-row');
            const $weaponRow = html.find('#weapon-row');
            const $val = html.find('#dmg-val');
            const $note = html.find('#dmg-note');
            const $afterArmor = html.find('#after-armor-display');
            const $apDisplay = html.find('#ap-display');
            const $apVal = html.find('#ap-val');

            $naturalRow.hide();
            $weaponRow.hide();

            let currentDamage = savedNatDmg;
            let noteText = "";
            let currentAP = 0;
            let currentAPCS = 0;
            let currentAPMode = "value";

            if (src === "natural") {
              $naturalRow.show();
              const rank = String(html.find('[name="natRank"]').val() || savedNatRank);
              const dmg = Number(html.find('[name="natDmg"]').val() || game.msh.getRankValue(rank));
              currentDamage = dmg;
              noteText = `(${rank} natural)`;
              currentAP = 0;
            } else {
              $weaponRow.show();
              const itemId = String(html.find('[name="item"]').val() || "");
              const item = attackItems.find(i => i.id === itemId) || null;
              
              if (!item) {
                currentDamage = 0;
                noteText = "(No weapon)";
                currentAP = 0;
              } else {
                const mat = getItemMaterialRank(item);
                let base = Number(item.system?.damage || 0);
                const da = this.opts?.deviceAbility;
                if (da?.rank && item?.system?.category === "device") {
                  base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
                }
                const res = computeEdgedDamage(strength.rank, strength.value, mat, base);
                currentDamage = res.damage;
                noteText = `(${da?.name ? `${da.name} — ${item.name}` : item.name})`;
                currentAP = getArmorPiercing(item);
                currentAPCS = Number(item.system?.armorPiercingCS || 0) || 0;
                currentAPMode = item.system?.apMode || "value";
              }
            }

            $val.text(currentDamage);
            $note.text(noteText);

            // Update AP display (flat or CS)
            const _showAP = (currentAPMode === "cs" && currentAPCS > 0) || (currentAPMode !== "cs" && currentAP > 0);
            if (_showAP) {
              $apDisplay.show();
              $apVal.text(currentAPMode === "cs" ? `${currentAPCS}CS` : currentAP);
            } else {
              $apDisplay.hide();
            }

            // Update after-armor display (accounting for AP, flat or CS)
            let effectiveArmor = targetArmor;
            if (currentAPMode === "cs" && currentAPCS > 0 && targetArmor > 0) {
              const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
              let _i = _RV.findIndex(v => v >= targetArmor);
              if (_i < 0) _i = _RV.length - 1;
              if (_i > 0 && _RV[_i] > targetArmor) _i--;
              effectiveArmor = _RV[Math.max(0, _i - currentAPCS)];
            } else {
              effectiveArmor = Math.max(0, targetArmor - currentAP);
            }
            const afterArmorDmg = Math.max(0, currentDamage - effectiveArmor);
            if (primaryTarget) {
              $afterArmor.html(`<strong>→ ${afterArmorDmg} after armor</strong>`);
            } else {
              $afterArmor.html(`<strong>→ ${currentDamage} damage</strong>`);
            }

            // Update shifted rank display with directional coloring
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRankText = shiftRank(ability.rank, cs);
            const $shiftedRank = html.find('#shifted-rank-display');
            $shiftedRank.text(shiftedRankText);
            
            const $csField = html.find('.cs-field');
            const $resetBtn = html.find('.cs-reset');
            if (cs < 0) {
              $csField.css({ 'background': '#ffebee', 'border': '1px solid #ef5350' });
              $shiftedRank.css('color', '#c62828');
              $resetBtn.css('visibility', 'visible');
            } else if (cs > 0) {
              $csField.css({ 'background': '#e8f5e9', 'border': '1px solid #66bb6a' });
              $shiftedRank.css('color', '#2e7d32');
              $resetBtn.css('visibility', 'visible');
            } else {
              $csField.css({ 'background': '', 'border': '1px solid transparent' });
              $shiftedRank.css('color', '');
              $resetBtn.css('visibility', 'hidden');
            }
            
            // Update source section highlighting
            const $sourceSection = html.find('.source-section');
            if (src !== 'natural') {
              $sourceSection.css({ 'background': '#fff8e1', 'border-color': '#ffc107' });
            } else {
              $sourceSection.css({ 'background': '#fff', 'border-color': '#ddd' });
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          const syncNatDamage = () => {
            const r = String(html.find('[name="natRank"]').val() || savedNatRank);
            const v = game.msh.getRankValue(r);
            html.find('[name="natDmg"]').val(v);
            update();
          };
          
          update();
          html.find('[name="src"]').on('change', update);
          html.find('[name="item"]').on('change', update);
          html.find('[name="shift"]').on('input change', update);
          html.find('[name="natRank"]').on('change', syncNatDamage);
          html.find('[name="natDmg"]').on('input change', update);
          
          // CS reset button handler
          html.find('.cs-reset').on('click', function(e) {
            e.preventDefault();
            html.find('[name="shift"]').val(0).trigger('change');
          });

          // Bottom controls persistence
          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });

          applyCapabilitiesToDialog(html, "edged-attack", { actor });
        }
      }).render(true);
    });
    
    if (!choice) return;

    // Track shift breakdown for detailed display
    const shiftBreakdown = {
      manual: choice.shift || 0,
      multiAttack: 0
    };

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
      
      if (featResult.cancelled) return;
      
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
    const selected = Array.from(game.user?.targets ?? []);
    const count = Math.max(1, actualAttackCount);

    for (let i = 0; i < count; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 300));

      const tgt = (count === 1)
        ? (selected[0] ?? null)
        : (selected.length ? selected[i % selected.length] : null);

      await this._executeSingleAttack({
        choice: { ...choice, specificTarget: tgt, multiAttackFeatResult: i === 0 ? multiAttackFeatResult : null },
        actor,
        ability,
        actionType,
        actionName,
        effects,
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