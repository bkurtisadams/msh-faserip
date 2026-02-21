// shooting-action.js v2.0.0 - 2025-12-24
// v2.0.0: Complete dialog redesign to match blunt-attack-action.js structure
//         - Context boxes (Target + Attack side by side)
//         - Compact weapon row with damage/range inline
//         - Damage preview with after-armor calculation
//         - CS field with directional colors and reset button
//         - Inline karma controls
//         - CS Notes text input
//         - Compact multi-attack radio row
//         - LocalStorage-based remember settings

import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildModeSelector,
  buildResultGrid,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  postDeathSavePrompt,
  RANKS,
  rollWithKarmaAndHistory,
  setupModeSelector,
  applyCapabilitiesToDialog,
  shiftRank,
  buildInlineFeatDisplay
} from "./action-utils.js";

import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { playCombatSFX } from "./audio-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class ShootingAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "shooting";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName); // Agility

    // Filter for shooting weapons (guns, rifles, etc.)
    const isShootingWeapon = (it) => {
      const s = it.system || {};
      const damageType = String(s.damageType || "").toUpperCase();
      return (s.weaponType === "shooting" || s.weaponType === "firearm" || 
              damageType === "S" ||
              Array.isArray(s.tags) && s.tags.includes("shooting"));
    };

    let shootingWeapons = actor.items.filter(isShootingWeapon);

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      if (!shootingWeapons.find(i => i.id === passedItem.id)) {
        shootingWeapons = [passedItem, ...shootingWeapons];
      }
    }

    // If no shooting weapons, try to detect a non-shooting source item and reroute
    if (shootingWeapons.length === 0) {
      const src = this?.opts?.sourceItem || this?.opts?.equipment || null;

      if (src?.type === "equipment" && src.system?.category === "weapon") {
        const w  = String(src.system.weaponType || "").toLowerCase();
        const dt = String(src.system.damageType || "").toUpperCase();

        const fallbackAction =
          w === "thrown" ? (dt.startsWith("E") ? "Throwing Edged (TE)" : "Throwing Blunt (TB)") :
          w === "melee"  ? (dt.startsWith("E") ? "Edged Attack (EA)"   : "Blunt Attack (BA)") :
          null;

        if (fallbackAction) {
          const roller = (globalThis.FaseripRolls?.rollEquipment ?? game.msh?.rollEquipment);
          if (typeof roller === "function") {
            return roller(actor, src, {
              useDirectRoll: true,
              actionType:    fallbackAction,
              columnShift:   Number(this?.opts?.shift ?? 0),
              karma:         Number(this?.opts?.karma ?? 0),
              skipDice:      !!this?.opts?.skipDice,
              suppressWarnings: true
            });
          }
        }
      }

      ui.notifications.warn(`${actor.name} has no shooting weapons.`);
      return;
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.shooting.remember";
    const lsSkipKey = "msh.shooting.skipDice";
    
    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    // Load settings from flags if remembering
    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastShootingItemId")) : "") || "";
    const savedRange = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingRange")) || 1) : 1;
    const savedObstacle = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingObstacle")) || false) : false;
    const savedColumnShift = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingShift")) || 0) : 0;
    const savedMultiAttacks = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingMultiAttacks")) || false) : false;
    const savedAttackCount = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingAttackCount")) || 2) : 2;
    const savedVariantType = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingVariant")) || "") : "";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";
    const savedCsNotes = (await actor.getFlag("msh-faserip", "csNotes")) || "";

    // Build weapon options
    const itemOptions = shootingWeapons.map(i =>
      `<option value="${i.id}" ${i.id === savedItemId ? 'selected' : ''}>${i.name}</option>`
    ).join("");

    // Get initial weapon for displays
    const initialWeapon = shootingWeapons.find(i => i.id === savedItemId) || shootingWeapons[0];
    const initialWeaponRange = initialWeapon?.system?.range || 15;
    const initialWeaponDamage = initialWeapon?.system?.damage || 0;

    // Get target info for armor display
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-ranged") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st target)" : "";
    const initialWeaponAP   = Number(initialWeapon?.system?.armorPiercing || 0) || 0;
    const initialWeaponAPCS = Number(initialWeapon?.system?.armorPiercingCS || 0) || 0;
    const initialWeaponAPMode = initialWeapon?.system?.apMode || "value";
    // Build variant selector options from specialAmmo flags
    const _buildVariantOptions = (weapon, currentVariant) => {
      const sa = weapon?.system?.specialAmmo || {};
      const saved = currentVariant || weapon?.system?.variantType || "standard";
      const opts = [{ v: "standard", label: "Standard" }];
      if (sa.ap)         opts.push({ v: "ap",        label: "Armor Piercing (AP)" });
      if (sa.mercy)      opts.push({ v: "mercy",     label: "Mercy/Non-Lethal" });
      if (sa.rubber)     opts.push({ v: "rubber",    label: "Blunted/Rubber" });
      if (sa.explosive)  opts.push({ v: "explosive", label: "Explosive/Enhanced" });
      if (sa.canister)   opts.push({ v: "canister",  label: "Canister Shot" });
      if (sa.heatSeeker) opts.push({ v: "heatSeeker",label: "Heat-Seeker" });
      if (sa.powerPack)  opts.push({ v: "powerPack", label: "Power Pack" });
      if (opts.length === 1) return "";  // only standard
      return opts.map(o => `<option value="${o.v}" ${o.v === saved ? "selected" : ""}>${o.label}</option>`).join("");
    };
    const _getEffectiveAPForVariant = (weapon, variantType) => {
      if (variantType === "ap") return { ap: 0, apCS: 2, apMode: "cs", bypassFF: false };
      return {
        ap: Number(weapon?.system?.armorPiercing || 0) || 0,
        apCS: Number(weapon?.system?.armorPiercingCS || 0) || 0,
        apMode: weapon?.system?.apMode || "value",
        bypassFF: !!weapon?.system?.bypassForceField
      };
    };
    const initialVariant = savedVariantType || initialWeapon?.system?.variantType || "standard";
    const initialVariantOptions = _buildVariantOptions(initialWeapon, initialVariant);
    const initialAPInfo = _getEffectiveAPForVariant(initialWeapon, initialVariant);
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
    const initialAfterArmor = Math.max(0, initialWeaponDamage - _getEffectiveArmor(targetArmor, initialAPInfo.ap, initialAPInfo.apCS, initialAPInfo.apMode));
    const initialAPLabel = (initialAPInfo.apMode === "cs" && initialAPInfo.apCS > 0) ? `${initialAPInfo.apCS}CS` : (initialAPInfo.ap > 0 ? String(initialAPInfo.ap) : "");

    // Karma info for compact display
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // Helper for localStorage
    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) { /* ignore */ } };

    // Dialog HTML - Compact layout matching blunt-attack-action.js
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

      <!-- Weapon Selection -->
      <div class="weapon-section" style="padding:8px;background:#fff;border:1px solid #ddd;border-radius:3px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="font-weight:600;">Weapon:</label>
          <select name="weapon" style="flex:1;min-width:150px;padding:4px;">${itemOptions}</select>
          <span style="color:#666;font-size:.9em;">
            Dmg: <strong id="weapon-damage-display">${initialWeaponDamage}</strong> | 
            Range: <strong id="weapon-range-display">${initialWeaponRange}</strong> areas
          </span>
        </div>
        ${initialVariantOptions ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <label style="font-weight:600;white-space:nowrap;">Loaded Ammo:</label>
          <select name="variantType" id="variant-select" style="flex:1;padding:4px;">${initialVariantOptions}</select>
        </div>` : ""}
      </div>

      <!-- Damage Preview -->
      <div id="preview" style="background:#ffebee;border:1px solid #ef9a9a;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialWeaponDamage}</span> <span id="dmg-note" style="color:#555;">(Weapon)</span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>→ ${initialAfterArmor} after armor</strong></span>
        </div>
        <div id="ap-display" style="color:#1565c0;font-size:.9em;margin-top:4px;${initialAPLabel ? '' : 'display:none;'}">
          Armor Piercing: <strong id="ap-val">${initialAPLabel}</strong> (reduces target armor)
        </div>
      </div>

      <!-- Range & Modifiers -->
      <div style="padding:8px;border:1px solid #ddd;background:#fafafa;border-radius:3px;margin-bottom:8px;">
        <div style="font-weight:600;margin-bottom:6px;font-size:.9em;">Range & Modifiers</div>
        
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;font-size:.9em;">
          <label>Distance:</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="number" name="range" value="${savedRange}" min="0" style="width:50px;padding:3px;">
            <span style="color:#666;font-size:.85em;">areas (Max: <span id="max-range-hint">${initialWeaponRange}</span>)</span>
          </div>
          
          <label>Target:</label>
          <select name="targetMovement" style="padding:3px;">
            <option value="0">Stationary (0 CS)</option>
            <option value="-1">Moving ≤5 areas (-1 CS)</option>
            <option value="-2">Moving ≤10 areas (-2 CS)</option>
            <option value="-4">Moving >10 areas (-4 CS)</option>
            <option value="0-charging">Charging at you (0 CS)</option>
          </select>
          
          <label>Obstacle:</label>
          <label style="cursor:pointer;">
            <input type="checkbox" name="throughObstacle" ${savedObstacle ? 'checked' : ''}> 
            <span style="color:#666;font-size:.85em;">Through obstacle (-2 CS)</span>
          </label>
        </div>
        
        <div id="range-preview" style="margin-top:6px;padding:4px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:.85em;">
          <strong>Range Modifiers:</strong> <span id="range-mod-text">Calculating...</span>
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

      <!-- CS Notes Row -->
      <div id="cs-notes-row" style="margin-bottom:6px;">
        <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., Called shot -2, Scope +1" value="${savedCsNotes}" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
      </div>

      <!-- Multi-Attack Row -->
      <div class="multi-attack-section" style="padding:6px 8px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;color:#2e7d32;">Multi:</span>
          <label title="Single attack, no penalty" style="cursor:pointer;"><input type="radio" name="multiMode" value="off" ${!savedMultiAttacks ? 'checked' : ''}> Off</label>
          <label title="Remarkable Fighting FEAT. Success: 2 attacks at -1CS each. Fail: 1 attack at -3CS." style="cursor:pointer;"><input type="radio" name="multiMode" value="2" ${savedMultiAttacks && savedAttackCount === 2 ? 'checked' : ''}> 2 atk</label>
          <label title="Amazing Fighting FEAT. Success: 3 attacks at -1CS each. Fail: 1 attack at -3CS." style="cursor:pointer;"><input type="radio" name="multiMode" value="3" ${savedMultiAttacks && savedAttackCount === 3 ? 'checked' : ''}> 3 atk</label>
        </div>
      </div>

      <!-- Rules Reminder -->
      <div style="padding:6px 8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;margin-bottom:8px;font-size:.85em;">
        <strong style="color:#e65100;">Shooting Rules:</strong>
        <span style="color:#666;"> No pulled punches. Kill result may be lethal (hero loses all Karma).</span>
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
              const $dlg = (sel) => html.find(sel);

              // Read form values
              const weaponId = String($dlg('[name="weapon"]').val() || "");
              const weapon = shootingWeapons.find(i => i.id === weaponId);
              
              if (!weapon) {
                ui.notifications.error("No weapon selected!");
                return resolve(null);
              }

              const shift = parseInt($dlg('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;
              const range = Number($dlg('[name="range"]').val() || 1);
              const throughObstacle = !!$dlg('[name="throughObstacle"]').is(':checked');
              const targetMovement = String($dlg('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
              
              const rememberSettings = !!$dlg('#msh-remember-settings').is(':checked');
              const skipDice = !!$dlg('#msh-skip-dice').is(':checked');
              
              // Multi-attack from radio
              const multiMode = $dlg('[name="multiMode"]:checked').val() || "off";
              const multiAttacks = (multiMode === "2" || multiMode === "3");
              const attackCount = (multiMode === "3") ? 3 : 2;

              // CS Notes
              const csNotes = $dlg('[name="csNotes"]').val() || "";

              const weaponRange = weapon.system?.range || 15;
              const weaponDamage = weapon.system?.damage || 0;
              const variantType = $dlg('[name="variantType"]').val() || weapon.system?.variantType || "standard";
              const _apInfo = _getEffectiveAPForVariant(weapon, variantType);
              const weaponAP = _apInfo.ap;
              const weaponAPCS = _apInfo.apCS;
              const weaponAPMode = _apInfo.apMode;
              const weaponBypassFF = _apInfo.bypassFF;

              // Check if shot is possible
              const { totalShift, impossible, rangeModifier, obstacleModifier } = 
                this._applyRangeModifiers(shift, range, throughObstacle, weaponRange);

              const finalShift = totalShift + movementModifier;

              if (impossible) {
                ui.notifications.error(`Target is beyond weapon range (${weaponRange} areas)!`);
                return resolve(null);
              }

              // Save settings
              setLS(lsRememberKey, rememberSettings ? "1" : "0");
              setLS(lsSkipKey, skipDice ? "1" : "0");

              if (rememberSettings) {
                await actor.setFlag("msh-faserip", "lastShootingItemId", weaponId);
                await actor.setFlag("msh-faserip", "lastShootingRange", range);
                await actor.setFlag("msh-faserip", "lastShootingObstacle", throughObstacle);
                await actor.setFlag("msh-faserip", "lastShootingShift", shift);
                await actor.setFlag("msh-faserip", "lastShootingMultiAttacks", multiAttacks);
                await actor.setFlag("msh-faserip", "lastShootingAttackCount", attackCount);
                await actor.setFlag("msh-faserip", "lastShootingVariant", variantType);
              }
              
              // Always save csNotes
              await actor.setFlag("msh-faserip", "csNotes", csNotes);

              resolve({ 
                weapon, 
                weaponDamage, 
                weaponRange, 
                shift, 
                karma,
                spendKarma,
                range, 
                throughObstacle, 
                skipDice,
                totalShift: finalShift,
                rangeModifier,
                obstacleModifier,
                targetMovement,
                movementModifier,
                multiAttacks,
                attackCount,
                csNotes,
                armorPiercing: weaponAP,
                armorPiercingCS: weaponAPCS,
                apMode: weaponAPMode,
                bypassForceField: weaponBypassFF,
                shiftBreakdown: {
                  manual: shift,
                  range: rangeModifier,
                  obstacle: obstacleModifier,
                  movement: movementModifier,
                  multiAttack: 0,
                  csNotes: csNotes
                }
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          this.opts = this.opts || {};
          await setupModeSelector(actor, html, this.opts || {}, "lastShootingMode");

          // Setup range preview updates
          this._setupRangePreview(html, { weaponMaxRange: initialWeaponRange });

          // Weapon change handler - update damage, range, and preview
          html.find('[name="weapon"]').on('change', () => {
            const weaponId = html.find('[name="weapon"]').val();
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const newRange = weapon?.system?.range || 15;
            const newDamage = weapon?.system?.damage || 0;
            
            // Update weapon stats display
            html.find('#weapon-damage-display').text(newDamage);
            html.find('#weapon-range-display').text(newRange);
            html.find('#max-range-hint').text(newRange);
            
            // Rebuild variant selector for new weapon
            const newVariantOpts = _buildVariantOptions(weapon, "");
            const $variantRow = html.find('#variant-select').closest('div');
            if (newVariantOpts) {
              if (html.find('#variant-select').length) {
                html.find('#variant-select').html(newVariantOpts);
              } else {
                html.find('.weapon-section').append(`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;"><label style="font-weight:600;white-space:nowrap;">Loaded Ammo:</label><select name="variantType" id="variant-select" style="flex:1;padding:4px;">${newVariantOpts}</select></div>`);
                html.find('#variant-select').on('change', updatePreview);
              }
            } else {
              html.find('#variant-select').closest('div').remove();
            }
            // Update damage preview
            html.find('#dmg-val').text(newDamage);
            const currentVariant = html.find('[name="variantType"]').val() || weapon?.system?.variantType || "standard";
            const newAPInfo = _getEffectiveAPForVariant(weapon, currentVariant);
            const effArmor = _getEffectiveArmor(targetArmor, newAPInfo.ap, newAPInfo.apCS, newAPInfo.apMode);
            const afterArmor = Math.max(0, newDamage - effArmor);
            html.find('#after-armor-display').html(`<strong>→ ${afterArmor} after armor</strong>`);
            const apLabel = (newAPInfo.apMode === "cs" && newAPInfo.apCS > 0) ? `${newAPInfo.apCS}CS` : (newAPInfo.ap > 0 ? String(newAPInfo.ap) : "");
            if (apLabel) {
              html.find('#ap-display').show();
              html.find('#ap-val').text(apLabel);
            } else {
              html.find('#ap-display').hide();
            }
            
            // Refresh the range preview with new weapon range
            this._setupRangePreview(html, { weaponMaxRange: newRange });
          });

          // Variant change handler - update AP preview when ammo type changes
          const updatePreview = () => {
            const wId = html.find('[name="weapon"]').val();
            const w = shootingWeapons.find(i => i.id === wId);
            const vt = html.find('[name="variantType"]').val() || "standard";
            const dmg = Number(w?.system?.damage || 0);
            const apInfo = _getEffectiveAPForVariant(w, vt);
            const eff = _getEffectiveArmor(targetArmor, apInfo.ap, apInfo.apCS, apInfo.apMode);
            html.find('#after-armor-display').html(`<strong>→ ${Math.max(0, dmg - eff)} after armor</strong>`);
            const lbl = (apInfo.apMode === "cs" && apInfo.apCS > 0) ? `${apInfo.apCS}CS` : (apInfo.ap > 0 ? String(apInfo.ap) : "");
            if (lbl) { html.find('#ap-display').show(); html.find('#ap-val').text(lbl); }
            else { html.find('#ap-display').hide(); }
          };
          html.on('change', '[name="variantType"]', updatePreview);

          // CS field handlers
          const $csInput = html.find('[name="shift"]');
          const $csField = html.find('.cs-field');
          const $resetBtn = html.find('.cs-reset');
          const $shiftedRank = html.find('#shifted-rank-display');

          const updateCsDisplay = () => {
            const val = parseInt($csInput.val()) || 0;
            const newRank = shiftRank(ability.rank, val);
            $shiftedRank.text(newRank);
            
            // Update colors
            if (val < 0) {
              $csField.css({ 'background': '#ffebee', 'border': '1px solid #ef5350' });
              $shiftedRank.css('color', '#c62828');
            } else if (val > 0) {
              $csField.css({ 'background': '#e8f5e9', 'border': '1px solid #66bb6a' });
              $shiftedRank.css('color', '#2e7d32');
            } else {
              $csField.css({ 'background': '', 'border': '1px solid transparent' });
              $shiftedRank.css('color', '');
            }
            
            $resetBtn.css('visibility', val !== 0 ? 'visible' : 'hidden');
          };

          $csInput.on('input change', updateCsDisplay);
          $resetBtn.on('click', () => {
            $csInput.val(0);
            updateCsDisplay();
          });

          // Karma checkbox border highlight
          html.find('#spend-karma').on('change', function() {
            const $field = html.find('.karma-field');
            if (this.checked) {
              $field.css('border-color', '#1565c0');
            } else {
              $field.css('border-color', '#90caf9');
            }
          });

          // Multi-attack border highlight
          html.find('[name="multiMode"]').on('change', function() {
            const mode = html.find('[name="multiMode"]:checked').val();
            const $section = html.find('.multi-attack-section');
            if (mode !== 'off') {
              $section.css('border-color', '#2e7d32');
            } else {
              $section.css('border-color', '#a5d6a7');
            }
          });

          // Initialize multi-attack border on load
          const initialMultiMode = html.find('[name="multiMode"]:checked').val();
          if (initialMultiMode && initialMultiMode !== 'off') {
            html.find('.multi-attack-section').css('border-color', '#2e7d32');
          }

          applyCapabilitiesToDialog(html, "shooting", { actor });

          // Attach auto-fill to update range from token-to-target distance
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => {
            const weaponId = html.find('[name="weapon"]').val();
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const currentRange = weapon?.system?.range || 15;
            this._setupRangePreview(html, { weaponMaxRange: currentRange });
          });

          // Bottom controls persistence
          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        },
        close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
        }
      }).render(true);
    });

    if (!choice) return;

    // Reload mode from flags
    this.opts.mode = await actor.getFlag("msh-faserip", "lastShootingMode") || "semi";
    const mode = this.opts.mode;
    if (mode === "manual") {
      this.opts.autoApply = false;
      this.opts.showConfirm = false;
    } else if (mode === "semi") {
      this.opts.autoApply = false;
      this.opts.showConfirm = true;
    } else {
      this.opts.autoApply = true;
      this.opts.showConfirm = false;
    }

    // Track shift breakdown for detailed display
    const shiftBreakdown = choice.shiftBreakdown || {
      manual: choice.shift || 0,
      range: choice.rangeModifier || 0,
      obstacle: choice.obstacleModifier || 0,
      movement: choice.movementModifier || 0,
      multiAttack: 0,
      csNotes: choice.csNotes || ""
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
      
      const featSuccess = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
      const featImpossible = !!(featResult?.resultColor === "IMPOSSIBLE");
      
      if (featSuccess && !featImpossible) {
        actualAttackCount = choice.attackCount;
        shiftBreakdown.multiAttack = -1;
        choice.totalShift = (choice.totalShift || 0) - 1;
        ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS each!`);
      } else {
        actualAttackCount = 1;
        shiftBreakdown.multiAttack = -3;
        choice.totalShift = (choice.totalShift || 0) - 3;
        ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack at -3CS.`);
      }
    }

    // Attach breakdown to choice
    choice.shiftBreakdown = shiftBreakdown;

    // Execute attack(s)
    for (let i = 1; i <= actualAttackCount; i++) {
      if (i > 1) await new Promise(resolve => setTimeout(resolve, 500));
      
      const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
      
      const targetForThisAttack = actualAttackCount === 1 ? targets[0] : targets[(i-1) % targets.length];
      
      await this._executeSingleAttack({
        choice: { ...choice, specificTarget: targetForThisAttack, multiAttackFeatResult: i === 1 ? multiAttackFeatResult : null },
        actor: this.actor,
        ability,
        actionType,
        actionName: actionLabel,
        effects,
        damageType: choice.weapon?.system?.damageType || "physical-ranged",
        rawDamage: choice.weaponDamage || 0,
        damageNote: "",
        sourceName: choice.weapon?.name || "Weapon",
        attackForm: "shooting",
        breakingFeat: null,
        targetCount: 1,
        attackNumber: i,
        totalAttacks: actualAttackCount
      });
    }

    // Multi-attack completion message
    if (actualAttackCount > 1) {
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) { /* setting not registered yet */ }
      
      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
            <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
            <div style="font-size:0.9em;">${actor.name} completed ${actualAttackCount} attacks.</div>
          </div>`
        });
      }
    }
  }
}