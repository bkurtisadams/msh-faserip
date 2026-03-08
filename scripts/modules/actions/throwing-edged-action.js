// scripts/modules/actions/throwing-edged-action.js v1.3.0 - 2026-02-27
// v1.3.0: Redesign dialog to Style A (grid header, inline CS/karma, damage preview, standardized footer)
// v1.2.0: Rebuild chat card using unified card builder utilities (inline badge, hover roll, standard layout)
import { RangedAttackAction } from "./ranged-attack-action.js";
import { attachAutoFillRange } from "./action-utils.js";
// NOTE: resolveCombatMode imported dynamically if needed
import { 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";

import {
  buildModeSelector,
  getAbilityInfo,
  labelFor,
  effectsFor,
  setupModeSelector,
  shiftRank,
  rollWithKarmaAndHistory,
  buildActionsBox,
  buildShiftDisplay,
  buildRollDisplay,
  buildResultBadge,
  buildContentBox,
  buildCardShell,
  buildActorTargetHtml,
  buildAbilitySection,
  getBodyArmorValues,
  getTargetData,
  applyDamageToTargets
} from "./action-utils.js";
import {
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class ThrowingEdgedAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-edged";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");
    // --- AP helper (numeric preferred; boolean fallback) ---
    const getArmorPiercing = (item) => {
      const s = item?.system ?? {};
      const props = s.properties ?? {};
      const ap =
        s.armorPiercing ??
        s.penetration ??
        s.ap ??
        (props.armorPiercing === true ? 1 : 0);
      return Number(ap) || 0;
    };

    // Candidate weapons: thrown + edged
    // Build the Throwing-Edged weapon list (back-compat + multi-mode support)
    let thrownEdged = actor.items.filter(i => {
      if (i.type !== "equipment" || String(i.system?.category ?? "").toLowerCase() !== "weapon") return false;

      const s = i.system ?? {};

      // Check if weapon has an explicit throwing-edged attack mode
      if (s.attackModes) {
        const modes = Object.values(s.attackModes);
        if (modes.some(m => m.actionType === "throwing-edged" ||
            (m.damageType === "TE" && m.name?.toLowerCase().includes("throw")))) return true;
      }

      const tags       = (s.tags ?? []).map(t => String(t).toLowerCase());
      const forms      = Array.isArray(s.attackForms) ? s.attackForms.map(f => String(f).toLowerCase()) : [];
      const weaponType = String(s.weaponType ?? "").toLowerCase();
      const damageType = String(s.damageType ?? "").toUpperCase();
      const attackType = String(s.attackType ?? "").toLowerCase();

      // Any edged weapon can be thrown (melee or designated thrown)
      const isEdged =
        damageType === "EA" ||
        damageType === "TE" ||
        attackType === "edged" ||
        attackType === "throwing-edged" ||
        tags.includes("edged") ||
        tags.includes("ea") ||
        tags.includes("te") ||
        forms.includes("edged") ||
        forms.includes("throwing-edged");

      // Exclude firearms/shooting weapons
      const isShooting = weaponType === "shooting" || weaponType === "firearm" ||
        damageType === "S" || attackType === "shooting";

      return isEdged && !isShooting;
    });

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      // Add to list if not already present
      if (!thrownEdged.find(i => i.id === passedItem.id)) {
        thrownEdged = [passedItem, ...thrownEdged];
      }
    }

    // Strength-based range
    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";

    // Restore previous flags (but override with passed item if present)
    const savedItemId = passedItemId || await actor.getFlag("msh-faserip", "lastThrowEdgedItemId") || "";
    const savedRange = await actor.getFlag("msh-faserip", "lastThrowEdgedRange") || 1;
    const savedObstacle = await actor.getFlag("msh-faserip", "lastThrowEdgedObstacle") || false;
    // If a specific item was passed, don't use ad-hoc mode
    const savedAdHoc = passedItem ? false : (await actor.getFlag("msh-faserip", "lastThrowEdgedAdHoc") || false);
    const savedAdHocNm = await actor.getFlag("msh-faserip", "lastThrowEdgedAdHocName") || "Broken Bottle";
    const savedAdHocDmg = Number(await actor.getFlag("msh-faserip", "lastThrowEdgedAdHocDamage") || 10);
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastThrowEdgedRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastThrowEdgedSkipDice")) ?? false;
    const savedShift = savedRemember ? (await actor.getFlag("msh-faserip", "lastThrowEdgedShift") ?? 0) : 0;

    const itemOptions = thrownEdged
      .map(i => `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`)
      .join("");


    // Target data for header
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    let targetArmor = 0, targetArmorSource = "";
    if (primaryTargetActor) {
      const armorData = getBodyArmorValues(primaryTargetActor, "physical-edged");
      targetArmor = armorData?.applicable ?? 0;
      targetArmorSource = armorData?.source ?? "";
    }

    // Karma data
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // Initial damage/AP estimate
    const initialWeapon = (savedAdHoc || !thrownEdged.length) ? null : thrownEdged.find(i => i.id === savedItemId);
    const initialDamage = (savedAdHoc || !thrownEdged.length) ? savedAdHocDmg : Number(initialWeapon?.system?.damage || 0);
    const initialAP = initialWeapon ? getArmorPiercing(initialWeapon) : 0;
    const effectiveArmor = Math.max(0, targetArmor - initialAP);
    const initialAfterArmor = Math.max(0, initialDamage - effectiveArmor);
    const maxThrowRange = this._getThrowingRangeInAreas(strRank);

    // Dialog HTML
   const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target${targets.length > 1 ? 's' : ''}</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay}</div>
          <div style="color:#666;" id="target-armor-display">${primaryTargetActor ? `Armor: ${targetArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}` : ''}</div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Throw</div>
          <div style="font-weight:600;">${ability.name}: ${ability.rank}</div>
          <div style="color:#666;">Rank Value: ${ability.value}</div>
        </div>
      </div>

      <!-- Weapon Source -->
      <div class="source-section" style="padding:8px;background:${(savedAdHoc || !thrownEdged.length) ? '#fff8e1' : '#fff'};border:1px solid ${(savedAdHoc || !thrownEdged.length) ? '#ffc107' : '#ddd'};border-radius:3px;margin-bottom:8px;">
        <div style="margin-bottom:4px;">
          <label><input type="radio" name="src" value="carried" ${!(savedAdHoc || !thrownEdged.length) ? 'checked' : ''}> Carried</label>
          <label style="margin-left:12px;"><input type="radio" name="src" value="adhoc" ${(savedAdHoc || !thrownEdged.length) ? 'checked' : ''}> Ad-hoc</label>
        </div>
        <div id="carried-row" style="display:${(savedAdHoc || !thrownEdged.length) ? 'none' : 'block'};margin-top:6px;">
          <select name="weapon" style="width:100%;padding:4px;">${itemOptions || '<option value="">(none in inventory)</option>'}</select>
          <div id="ap-weapon-display" style="color:#1565c0;font-size:.85em;margin-top:4px;${initialAP > 0 ? '' : 'display:none;'}">
            Armor Piercing: <strong id="ap-weapon-val">${initialAP}</strong>
          </div>
        </div>
        <div id="adhoc-row" style="display:${(savedAdHoc || !thrownEdged.length) ? 'block' : 'none'};margin-top:6px;">
          <div style="display:grid;grid-template-columns:auto 1fr auto 60px;gap:4px 8px;align-items:center;">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocNm}" placeholder="Broken Bottle, Knife..." style="padding:4px;">
            <label>Dmg:</label>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="padding:4px;width:100%;">
          </div>
        </div>
      </div>

      <!-- Damage Preview -->
      <div id="preview" style="background:#fce4ec;border:1px solid #e91e63;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialDamage}</span> <span id="dmg-note" style="color:#555;"></span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>→ ${initialAfterArmor} after armor</strong></span>
        </div>
        <div id="ap-display" style="color:#1565c0;font-size:.9em;margin-top:4px;${initialAP > 0 ? '' : 'display:none;'}">
          Armor Piercing: <strong id="ap-val">${initialAP}</strong> (reduces target armor)
        </div>
      </div>

      <!-- Modifiers Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${Number(this.opts.shift ?? savedShift)}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${savedShift < 0 ? 'color:#c62828;' : savedShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(ability.rank, savedShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedShift !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
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
        <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., Thrown Objects +1CS, range -2CS" value="" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
      </div>

      <!-- Range Row -->
      <div class="range-section" style="padding:6px 8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="font-weight:600;">Range:</label>
          <input type="number" name="range" value="${savedRange}" min="0" style="width:40px;padding:3px;text-align:center;">
          <span style="color:#666;">areas</span>
          <span style="color:#666;font-size:.85em;">(Max: ${maxThrowRange})</span>
          <label style="cursor:pointer;margin-left:8px;"><input type="checkbox" name="throughObstacle" ${savedObstacle ? 'checked' : ''}> Obstacle (-2CS)</label>
        </div>
        <div style="margin-top:4px;">
          <label style="font-weight:600;margin-right:6px;">Target:</label>
          <select name="targetMovement" style="padding:3px;">
            <option value="0">Standing</option>
            <option value="0-charging">Charging attacker</option>
            <option value="-1">Moving (−1CS)</option>
            <option value="-2">Fast (−2CS)</option>
            <option value="-4">Very Fast (−4CS)</option>
          </select>
        </div>
        <div id="range-preview" style="margin-top:4px;padding:4px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:.85em;">
          <strong>Range Modifiers:</strong> <span id="range-mod-text">Calculating...</span>
        </div>
      </div>

      <!-- Footer -->
      <div id="msh-bottom-controls" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    `;
    const choice = await new Promise(resolve => {
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $ = (sel) => html.find(sel);
              const useAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';

              // DECLARE THESE AT THE TOP:
              let weaponName, weaponDamage, weaponId = null;
              let weaponAP = 0, weaponAPCS = 0, weaponAPMode = "value";  // ✅ ADD THIS LINE
              let weaponDamageType = "physical-edged";                    // ✅ ADD THIS LINE
              
              if (useAdHoc) {
                weaponName = String($('[name="adhocName"]').val() || "Improvised Edged");
                weaponDamage = Number($('[name="adhocDamage"]').val() || 0);
              } else {
                const wid = String($('[name="weapon"]').val() || "");
                const weapon = thrownEdged.find(i => i.id === wid);
                if (!weapon) {
                  ui.notifications.error("Select a carried thrown-edged weapon or use ad-hoc.");
                  return resolve(null);
                }
                
                weaponId = wid;
                weaponName = weapon.name;
                weaponDamage = Number(weapon.system?.damage || 0);

                weaponAP = getArmorPiercing(weapon);
                weaponAPCS = Number(weapon.system?.armorPiercingCS || 0) || 0;
                weaponAPMode = weapon.system?.apMode || "value";
                // Normalize to downstream type string
                const rawDt = String(weapon.system?.damageType || "").toUpperCase();
                weaponDamageType = (rawDt === "EA" || rawDt === "TE" || rawDt === "edged") ? "physical-edged" : "physical-edged";
              }

              const shift = Number($('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;
              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');

              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);

              const remember = !!$(`[name="remember"]`).is(':checked');
              const skipDice = !!$(`[name="skipDice"]`).is(':checked');

              // Always save remember/skipDice preferences
              await actor.setFlag("msh-faserip", "rememberSettings", remember);
              await actor.setFlag("msh-faserip", "lastThrowEdgedRemember", remember);
              await actor.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              await actor.setFlag("msh-faserip", "lastThrowEdgedSkipDice", skipDice);
              if (remember) {
                await actor.setFlag("msh-faserip", "lastThrowEdgedShift", shift);
                await actor.setFlag("msh-faserip", "lastThrowEdgedAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastThrowEdgedAdHocName", weaponName);
                await actor.setFlag("msh-faserip", "lastThrowEdgedAdHocDamage", weaponDamage);
                await actor.setFlag("msh-faserip", "lastThrowEdgedItemId", weaponId || "");
                await actor.setFlag("msh-faserip", "lastThrowEdgedRange", range);
                await actor.setFlag("msh-faserip", "lastThrowEdgedObstacle", throughObstacle);
              }

              const { totalShift, impossible, rangeModifier, obstacleModifier } =
                this._applyRangeModifiers(shift, range, throughObstacle, null, null, strRank);

              // calculate finalShift
              const finalShift = totalShift + movementModifier;

              if (impossible) {
                ui.notifications.error(`Target is beyond throwing range (${this._getThrowingRangeInAreas(strRank)} areas).`);
                return resolve(null);
              }

              resolve({
                weaponName,
                weaponDamage,
                weaponId,
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
                armorPiercing: (typeof weaponAP !== "undefined" ? weaponAP : 0),
                armorPiercingCS: (typeof weaponAPCS !== "undefined" ? weaponAPCS : 0),    // ✅ ADD
                apMode: (typeof weaponAPMode !== "undefined" ? weaponAPMode : "value"),   // ✅ ADD
                damageType: (typeof weaponDamageType !== "undefined" ? weaponDamageType : "physical-edged")
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          this.opts = this.opts || {};
          await setupModeSelector(actor, html, this.opts, "lastEdgedMode");

          // Source radio toggle
          const $srcRadios = html.find('[name="src"]');
          const $weapon = html.find('[name="weapon"]');
          const updateSourceDisplay = () => {
            const src = html.find('[name="src"]:checked').val();
            const isAdHoc = src === 'adhoc';
            html.find('#carried-row').css('display', isAdHoc ? 'none' : 'block');
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');
            const $section = html.find('.source-section');
            $section.css('background', isAdHoc ? '#fff8e1' : '#fff');
            $section.css('border-color', isAdHoc ? '#ffc107' : '#ddd');
            updateDamagePreview();
          };
          $srcRadios.on('change', updateSourceDisplay);

          // Damage preview updater
          const updateDamagePreview = () => {
            const isAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';
            let dmg, ap = 0;
            if (isAdHoc) {
              dmg = Number(html.find('[name="adhocDamage"]').val()) || 0;
            } else {
              const wid = $weapon.val();
              const weapon = thrownEdged.find(i => i.id === wid);
              dmg = Number(weapon?.system?.damage || 0);
              ap = weapon ? getArmorPiercing(weapon) : 0;
            }
            html.find('#dmg-val').text(dmg);
            html.find('#ap-val').text(ap);
            html.find('#ap-display').css('display', ap > 0 ? '' : 'none');
            html.find('#ap-weapon-val').text(ap);
            html.find('#ap-weapon-display').css('display', ap > 0 ? '' : 'none');
            const effArmor = Math.max(0, targetArmor - ap);
            const after = Math.max(0, dmg - effArmor);
            html.find('#after-armor-display').html(`<strong>→ ${after} after armor</strong>`);
          };
          $weapon.on('change', updateDamagePreview);
          html.find('[name="adhocDamage"]').on('input', updateDamagePreview);

          // CS field handlers
          const $shift = html.find('[name="shift"]');
          const $csField = html.find('.cs-field');
          const $rankDisplay = html.find('#shifted-rank-display');
          const $csReset = html.find('.cs-reset');
          const updateCS = () => {
            const s = Number($shift.val()) || 0;
            const shifted = shiftRank(ability.rank, s);
            $rankDisplay.text(shifted);
            $rankDisplay.css('color', s < 0 ? '#c62828' : s > 0 ? '#2e7d32' : '');
            $csField.css('background', s < 0 ? '#ffebee' : s > 0 ? '#e8f5e9' : '');
            $csField.css('border-color', s < 0 ? '#ef5350' : s > 0 ? '#66bb6a' : 'transparent');
            $csReset.css('visibility', s !== 0 ? 'visible' : 'hidden');
          };
          $shift.on('input', updateCS);
          $csReset.on('click', () => { $shift.val(0); updateCS(); });

          // Range preview
          this._setupRangePreview(html, { strengthRank: strRank });

          // attach auto-fill; keep disposer to unhook later
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => {
            this._setupRangePreview(html, { strengthRank: strRank });
          });
        },
        close: (html) => {
          // clean up hooks
          if (this._disposeAutoFill) this._disposeAutoFill();
        }
      }).render(true);
    });

    if (!choice) return;

    // Reload mode from flags (user may have changed it in dialog)
    // Respect global mode ceiling — per-dialog mode cannot exceed global setting
    let globalMode = "semi";
    try { globalMode = game.settings.get("msh-faserip", "defaultCombatMode") || "semi"; } catch (_) {}
    const modeRank = { manual: 0, semi: 1, full: 2 };
    const globalRank = modeRank[globalMode] ?? 1;
    const savedMode = await actor.getFlag("msh-faserip", "lastEdgedMode") || "semi";
    const savedRank = modeRank[savedMode] ?? 1;
    this.opts.mode = savedRank <= globalRank ? savedMode : globalMode;
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


    const effectiveRank = shiftRank(ability.rank, choice.totalShift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) {}

    // Let rollWithKarmaAndHistory create and manage the roll
    // - Non-consolidated: posts separate roll chat message
    // - Consolidated: shows DiceSoNice only, no chat message
    const { roll, cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(
      actor, actionName, choice.karma, null,
      { spendKarma: choice.spendKarma, rank: effectiveRank, skipDice: choice.skipDice, inlineRoll: useConsolidated }
    );
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    const isHit = colorLower !== 'white';
    const targetName = primaryTarget?.name || "";

    // Calculate penetrating damage by checking targeted token's Body Armor
    const rawDamage = Number(choice.weaponDamage) || 0;
    const dmgType = (choice.damageType || "physical-edged");
    let armorValue = 0;
    let afterArmor = rawDamage;
    if (isHit && rawDamage > 0 && primaryTargetActor) {
      const armorData = getBodyArmorValues(primaryTargetActor, dmgType);
      armorValue = armorData?.applicable ?? 0;
      // Apply armor piercing
      const _apFlat = Number(choice.armorPiercing || 0);
      const _apCS = Number(choice.armorPiercingCS || 0);
      const _apMode = choice.apMode || "value";
      let effectiveArmor = armorValue;
      if (_apMode === "cs" && _apCS > 0 && effectiveArmor > 0) {
        const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
        let _i = _RV.findIndex(v => v >= effectiveArmor);
        if (_i < 0) _i = _RV.length - 1;
        if (_i > 0 && _RV[_i] > effectiveArmor) _i--;
        effectiveArmor = _RV[Math.max(0, _i - _apCS)];
      } else if (_apFlat > 0) {
        effectiveArmor = Math.max(0, effectiveArmor - _apFlat);
      }
      afterArmor = Math.max(0, rawDamage - effectiveArmor);
      armorValue = effectiveArmor;
    }

    const actions = buildActionsBox({
      showStun: colorLower === "yellow",
      showKill: colorLower === "red",
      actorUuid: actor.uuid,
      damage: isHit ? rawDamage : 0,
      attackForm: "edged",
      damageType: dmgType,
      bypassArmor: false,
      armorPiercing: Number(choice.armorPiercing || 0),
      armorPiercingCS: Number(choice.armorPiercingCS || 0),
      apMode: choice.apMode || "value",
      autoApply: !!this.opts?.autoApply,
      autoSave: false,
    });

    // Build shift breakdown
    const shiftBreakdown = {};
    if (choice.shift) shiftBreakdown.manual = Number(choice.shift);
    if (choice.rangeModifier) shiftBreakdown.range = choice.rangeModifier;
    if (choice.obstacleModifier) shiftBreakdown.obstacle = choice.obstacleModifier;
    if (choice.movementModifier) shiftBreakdown.movement = choice.movementModifier;
    const shiftDisplay = buildShiftDisplay(choice.totalShift, effectiveRank, shiftBreakdown);
    const rollDisplay = buildRollDisplay(roll, totalKarmaUsed, cappedTotal);
    const resultBadge = buildResultBadge(color, effectResult);

    // Damage section
    const apNote = Number(choice.armorPiercing || 0) ? ` <span style="color:#1565c0;font-size:.85em;">(AP ${choice.armorPiercing})</span>` : "";
    const damageHtml = (() => {
      if (!isHit) return buildContentBox(`<strong>Damage:</strong> 0 (miss)`);
      const dmgBox = `<span title="Weapon: ${choice.weaponName}" style="cursor:help;">${rawDamage}</span>${apNote}`;
      if (armorValue > 0 && primaryTargetActor) {
        const armorBox = `<span title="Body Armor (${armorValue})" style="cursor:help;">${armorValue} armor</span>`;
        return buildContentBox(`<strong>Damage:</strong> ${dmgBox} − ${armorBox} = <strong>${afterArmor}</strong>`);
      }
      return buildContentBox(`<strong>Damage:</strong> ${dmgBox}`);
    })();

    // Assemble card
    const cardHtml = buildCardShell({
      actionLabel: actionName,
      headerRight: choice.weaponName,
      actorHtml: buildActorTargetHtml(actor.name, targetName),
      abilityHtml: buildAbilitySection({
        abilityLabel: ability.name,
        abilityRank: ability.rank,
        shiftDisplay,
        rollDisplay,
        resultBadge
      }),
      sections: [damageHtml, actions]
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    // --- SFX ---
    if (game.msh?.playCombatSFX) {
      const srcItem = choice.weaponId ? actor.items.get(choice.weaponId) : null;
      await game.msh.playCombatSFX({
        item: srcItem,
        actionType: "throwing-edged",
        damageType: (choice.damageType || "physical-edged"),
        rollResult: colorLower,
        isHit
      });
    }

    // === AUTO-APPLY DAMAGE IN FULL AUTO MODE ===
    if (this.opts?.autoApply && isHit && Number(choice.weaponDamage) > 0) {
      await applyDamageToTargets({
        damage: Number(choice.weaponDamage),
        attackerUuid: actor.uuid,
        damageType: (choice.damageType || "physical-edged"),
        attackForm: "edged",
        showNotification: true,
        bypassArmor: false,
        armorPiercing: Number(choice.armorPiercing || 0),
        armorPiercingCS: Number(choice.armorPiercingCS || 0),
        apMode: choice.apMode || "value",
        wasKillResult: colorLower === "red"
      });
    }
    // === END AUTO-APPLY ===
  }
}