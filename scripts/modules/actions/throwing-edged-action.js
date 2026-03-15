// scripts/modules/actions/throwing-edged-action.js v2.0.0 - 2026-03-10
// v2.0.0: Refactor - dialog only, delegates resolution to _executeSingleAttack
// v1.3.0: Redesign dialog to Style A (grid header, inline CS/karma, damage preview, standardized footer)
import { RangedAttackAction } from "./ranged-attack-action.js";
import { attachAutoFillRange } from "./action-utils.js";
import { extractKarmaFromDialog } from "../dice/dice-roller.js";
import {
  buildModeSelector, getAbilityInfo, labelFor, effectsFor, setupModeSelector,
  shiftRank, getBodyArmorValues, getTargetData, applyCapabilitiesToDialog
} from "./action-utils.js";
import { getAvailableKarma, getMinimumKarmaCommitment } from "../dice/dice-roller.js";

export class ThrowingEdgedAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-edged";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    const getArmorPiercing = (item) => {
      const s = item?.system ?? {};
      const props = s.properties ?? {};
      const ap = s.armorPiercing ?? s.penetration ?? s.ap ?? (props.armorPiercing === true ? 1 : 0);
      return Number(ap) || 0;
    };

    // Candidate weapons: thrown + edged
    let thrownEdged = actor.items.filter(i => {
      if (i.type !== "equipment" || String(i.system?.category ?? "").toLowerCase() !== "weapon") return false;
      const s = i.system ?? {};
      if (s.attackModes) {
        const modes = Object.values(s.attackModes);
        if (modes.some(m => m.actionType === "throwing-edged" ||
            (m.damageType === "TE" && m.name?.toLowerCase().includes("throw")))) return true;
      }
      const tags = (s.tags ?? []).map(t => String(t).toLowerCase());
      const forms = Array.isArray(s.attackForms) ? s.attackForms.map(f => String(f).toLowerCase()) : [];
      const weaponType = String(s.weaponType ?? "").toLowerCase();
      const damageType = String(s.damageType ?? "").toUpperCase();
      const attackType = String(s.attackType ?? "").toLowerCase();
      const isEdged = damageType === "EA" || damageType === "TE" ||
        attackType === "edged" || attackType === "throwing-edged" ||
        tags.includes("edged") || tags.includes("ea") || tags.includes("te") ||
        forms.includes("edged") || forms.includes("throwing-edged");
      const isShooting = weaponType === "shooting" || weaponType === "firearm" ||
        damageType === "S" || attackType === "shooting";
      return isEdged && !isShooting;
    });

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && passedItem.type === "equipment") {
      if (!thrownEdged.find(i => i.id === passedItem.id)) {
        thrownEdged = [passedItem, ...thrownEdged];
      }
    }

    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";

    // Restore saved preferences
    const savedItemId    = passedItemId || await actor.getFlag("msh-faserip", "lastThrowEdgedItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastThrowEdgedRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastThrowEdgedObstacle") || false;
    const savedAdHoc     = passedItem ? false : (await actor.getFlag("msh-faserip", "lastThrowEdgedAdHoc") || false);
    const savedAdHocNm   = await actor.getFlag("msh-faserip", "lastThrowEdgedAdHocName") || "Broken Bottle";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastThrowEdgedAdHocDamage") || 10);
    const savedRemember  = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastThrowEdgedRemember")) ?? true;
    const savedSkipDice  = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastThrowEdgedSkipDice")) ?? false;
    const savedShift     = savedRemember ? (await actor.getFlag("msh-faserip", "lastThrowEdgedShift") ?? 0) : 0;

    const itemOptions = thrownEdged
      .map(i => `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`)
      .join("");

    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    let targetArmor = 0, targetArmorSource = "";
    if (primaryTargetActor) {
      const armorData = getBodyArmorValues(primaryTargetActor, "physical-edged");
      targetArmor = armorData?.applicable ?? 0;
      targetArmorSource = armorData?.source ?? "";
    }

    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const initialWeapon = (savedAdHoc || !thrownEdged.length) ? null : thrownEdged.find(i => i.id === savedItemId);
    const initialDamage = (savedAdHoc || !thrownEdged.length) ? savedAdHocDmg : Number(initialWeapon?.system?.damage || 0);
    const initialAP = initialWeapon ? getArmorPiercing(initialWeapon) : 0;
    const effectiveArmor = Math.max(0, targetArmor - initialAP);
    const initialAfterArmor = Math.max(0, initialDamage - effectiveArmor);
    const maxThrowRange = this._getThrowingRangeInAreas(strRank);

    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}
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
      <div id="preview" style="background:#fce4ec;border:1px solid #e91e63;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialDamage}</span> <span id="dmg-note" style="color:#555;"></span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>\u2192 ${initialAfterArmor} after armor</strong></span>
        </div>
        <div id="ap-display" style="color:#1565c0;font-size:.9em;margin-top:4px;${initialAP > 0 ? '' : 'display:none;'}">
          Armor Piercing: <strong id="ap-val">${initialAP}</strong> (reduces target armor)
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${Number(this.opts.shift ?? savedShift)}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">\u2192</span>
          <strong id="shifted-rank-display" style="${savedShift < 0 ? 'color:#c62828;' : savedShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(ability.rank, savedShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedShift !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">\u00d7</button>
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
      <div id="cs-notes-row" style="margin-bottom:6px;">
        <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., Thrown Objects +1CS, range -2CS" value="" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
      </div>
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
            <option value="-1">Moving (\u22121CS)</option>
            <option value="-2">Fast (\u22122CS)</option>
            <option value="-4">Very Fast (\u22124CS)</option>
          </select>
        </div>
        <div id="range-preview" style="margin-top:4px;padding:4px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:.85em;">
          <strong>Range Modifiers:</strong> <span id="range-mod-text">Calculating...</span>
        </div>
      </div>
      <div class="frp-box frp-pull-box pull-punch-section" id="pull-box" style="padding:4px 8px;background:#fff8e1;border:1px solid #ffe082;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <label>
            <input type="checkbox" id="pull-punch-enabled">
            <span style="font-weight:600;color:#e65100;">Reduce damage to</span>
          </label>
          <input type="number" class="frp-pull-dmg" name="pulledDamage" value="0" min="0" style="width:45px;padding:2px;text-align:center;">
          <span style="color:#888;font-size:.8em;">Effect cannot be reduced</span>
        </div>
      </div>
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

              let weaponName, weaponDamage, weaponId = null;
              let weaponAP = 0, weaponAPCS = 0, weaponAPMode = "value";
              let weaponDamageType = "physical-edged";

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
              }

              const shift = Number($('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');
              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

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
              const finalShift = totalShift + movementModifier;

              if (impossible) {
                ui.notifications.error(`Target is beyond throwing range (${this._getThrowingRangeInAreas(strRank)} areas).`);
                return resolve(null);
              }

              const shiftBreakdown = {};
              if (shift) shiftBreakdown.manual = shift;
              if (rangeModifier) shiftBreakdown.range = rangeModifier;
              if (obstacleModifier) shiftBreakdown.obstacle = obstacleModifier;
              if (movementModifier) shiftBreakdown.movement = movementModifier;

              const pullEnabled   = !!html.find('#pull-punch-enabled').is(':checked');
              const pulledDamage  = pullEnabled ? parseInt(html.find('[name="pulledDamage"]').val() || 0) : 0;

              resolve({
                weaponId, weaponName, weaponDamage,
                totalShift: finalShift, shift,
                karma: karmaToSpend, spendKarma, skipDice,
                shiftBreakdown,
                armorPiercing: weaponAP,
                armorPiercingCS: weaponAPCS,
                apMode: weaponAPMode,
                damageType: weaponDamageType,
                pulledDamage, resultCap: "none"
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          this.opts = this.opts || {};
          await setupModeSelector(actor, html, this.opts, "lastEdgedMode");

          const $srcRadios = html.find('[name="src"]');
          const $weapon = html.find('[name="weapon"]');
          const updateSourceDisplay = () => {
            const src = html.find('[name="src"]:checked').val();
            const isAdHoc = src === 'adhoc';
            html.find('#carried-row').css('display', isAdHoc ? 'none' : 'block');
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');
            html.find('.source-section').css({ background: isAdHoc ? '#fff8e1' : '#fff', 'border-color': isAdHoc ? '#ffc107' : '#ddd' });
            updateDamagePreview();
          };
          $srcRadios.on('change', updateSourceDisplay);

          const updateDamagePreview = () => {
            const isAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';
            let dmg, note, ap = 0;
            if (isAdHoc) {
              dmg = Number(html.find('[name="adhocDamage"]').val()) || 0;
              note = html.find('[name="adhocName"]').val() || 'Ad-hoc';
            } else {
              const wid = html.find('[name="weapon"]').val();
              const w = thrownEdged.find(i => i.id === wid);
              dmg = Number(w?.system?.damage || 0);
              note = w?.name || 'Weapon';
              ap = w ? getArmorPiercing(w) : 0;
            }
            html.find('#dmg-val').text(dmg);
            html.find('#dmg-note').text(note ? `(${note})` : '');
            const effArmor = Math.max(0, targetArmor - ap);
            const after = Math.max(0, dmg - effArmor);
            html.find('#after-armor-display').html(`<strong>\u2192 ${after} after armor</strong>`);
            html.find('#ap-val').text(ap);
            html.find('#ap-weapon-val').text(ap);
            html.find('#ap-display').css('display', ap > 0 ? '' : 'none');
            html.find('#ap-weapon-display').css('display', ap > 0 ? '' : 'none');
          };
          $weapon.on('change', updateDamagePreview);
          html.find('[name="adhocDamage"]').on('input', updateDamagePreview);

          const $shift = html.find('[name="shift"]'), $csField = html.find('.cs-field');
          const $rankDisplay = html.find('#shifted-rank-display'), $csReset = html.find('.cs-reset');
          const updateCS = () => {
            const s = Number($shift.val()) || 0;
            $rankDisplay.text(shiftRank(ability.rank, s)).css('color', s < 0 ? '#c62828' : s > 0 ? '#2e7d32' : '');
            $csField.css({ background: s < 0 ? '#ffebee' : s > 0 ? '#e8f5e9' : '', 'border-color': s < 0 ? '#ef5350' : s > 0 ? '#66bb6a' : 'transparent' });
            $csReset.css('visibility', s !== 0 ? 'visible' : 'hidden');
          };
          $shift.on('input', updateCS);
          $csReset.on('click', () => { $shift.val(0); updateCS(); });

          this._setupRangePreview(html, { strengthRank: strRank });
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => {
            this._setupRangePreview(html, { strengthRank: strRank });
          });
        },
        close: () => { if (this._disposeAutoFill) this._disposeAutoFill(); }
      }).render(true);
    });

    if (!choice) return;

    // Delegate to shared resolution pipeline
    const weaponItem = choice.weaponId ? actor.items.get(choice.weaponId) : null;
    const rawDamage = choice.weaponId ? Number(weaponItem?.system?.damage || 0) : Number(choice.weaponDamage || 0);

    await this._executeSingleAttack({
      choice: {
        ...choice,
        weapon: weaponItem
      },
      actor, ability, actionType, actionName, effects,
      damageType: choice.damageType || "physical-edged",
      rawDamage,
      damageNote: choice.weaponName || "Thrown Edged",
      sourceName: choice.weaponName || "Thrown Edged",
      attackForm: "edged"
    });
  }
}