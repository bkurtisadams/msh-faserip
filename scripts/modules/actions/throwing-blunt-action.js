// scripts/modules/actions/throwing-blunt-action.js v1.3.0 - 2026-02-27
// v1.3.0: Redesign dialog to Style A (grid header, inline CS/karma, damage preview, standardized footer)
// v1.2.0: Rebuild chat card using unified card builder utilities (inline badge, hover roll, standard layout)
import { RangedAttackAction } from "./ranged-attack-action.js";
import { attachAutoFillRange } from "./action-utils.js";
// NOTE: resolveCombatMode imported dynamically if needed
import { 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";

import {
  getAbilityInfo,
  labelFor,
  effectsFor,
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
  applyDamageToTargets,
  buildModeSelector,
  setupModeSelector,
  applyCapabilitiesToDialog
} from "./action-utils.js";
import {
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class ThrowingBluntAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-blunt";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // Candidate weapons: thrown + blunt
    let thrownBlunt = actor.items.filter(i => {
      const s = i.system || {};
      const tags = (s.tags || []).map(t => String(t).toLowerCase());
      const damageType = String(s.damageType || "").toUpperCase();
      const attackType = String(s.attackType || "").toLowerCase();
      const weaponType = String(s.weaponType || "").toLowerCase();

      // Any blunt weapon can be thrown regardless of weaponType
      const isBlunt =
        damageType === "BA" ||
        damageType === "TB" ||
        attackType === "blunt" ||
        attackType === "throwing-blunt" ||
        tags.includes("blunt") ||
        tags.includes("ba") ||
        tags.includes("tb");

      // Exclude shooting weapons (firearms can't be thrown as blunt)
      const isShooting = weaponType === "shooting" || weaponType === "firearm" ||
        damageType === "S" || attackType === "shooting";

      return isBlunt && !isShooting;
    });

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      // Add to list if not already present
      if (!thrownBlunt.find(i => i.id === passedItem.id)) {
        thrownBlunt = [passedItem, ...thrownBlunt];
      }
    }

    // Strength-based throwing range
    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";

    // Restore flags (but override with passed item if present)
    const savedItemId    = passedItemId || await actor.getFlag("msh-faserip", "lastThrowBluntItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastThrowBluntRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastThrowBluntObstacle") || false;
    // If a specific item was passed, don't use ad-hoc mode
    const savedAdHoc     = passedItem ? false : (await actor.getFlag("msh-faserip", "lastThrowBluntAdHoc") || (!thrownBlunt.length));
    const savedAdHocName = await actor.getFlag("msh-faserip", "lastThrowBluntAdHocName") || "Rock";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastThrowBluntAdHocDamage") || 6);
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastThrowBluntRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastThrowBluntSkipDice")) ?? false;
    const savedShift = savedRemember ? (await actor.getFlag("msh-faserip", "lastThrowBluntShift") ?? 0) : 0;

    const itemOptions = thrownBlunt
      .map(i => `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`)
      .join("");

    // Target data for header
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    let targetArmor = 0, targetArmorSource = "";
    if (primaryTargetActor) {
      const armorData = getBodyArmorValues(primaryTargetActor, "physical-blunt");
      targetArmor = armorData?.applicable ?? 0;
      targetArmorSource = armorData?.source ?? "";
    }

    // Karma data
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // Initial damage estimate
    const initialWeapon = savedAdHoc ? null : thrownBlunt.find(i => i.id === savedItemId);
    const initialDamage = savedAdHoc ? savedAdHocDmg : Number(initialWeapon?.system?.damage || 0);
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);
    const maxThrowRange = this._getThrowingRangeInAreas(strRank);

    // Throwing talents
    const combatTalents = (actor.items ?? []).filter(i => {
      if (i.type !== "talent") return false;
      const n = (i.name || "").toLowerCase();
      return n.includes("thrown") || n.includes("throwing");
    }).map(t => ({ name: t.name, bonus: "+1CS" }));

    // Dialog
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
          ${combatTalents.length > 0 ? combatTalents.map(t => 
            `<div style="color:#2e7d32;font-size:.85em;">${t.name}: ${t.bonus}</div>`
          ).join('') : ''}
        </div>
      </div>

      <!-- Weapon Source -->
      <div class="source-section" style="padding:8px;background:${savedAdHoc ? '#fff8e1' : '#fff'};border:1px solid ${savedAdHoc ? '#ffc107' : '#ddd'};border-radius:3px;margin-bottom:8px;">
        <div style="margin-bottom:4px;">
          <label><input type="radio" name="src" value="carried" ${!savedAdHoc ? 'checked' : ''}> Carried</label>
          <label style="margin-left:12px;"><input type="radio" name="src" value="adhoc" ${savedAdHoc ? 'checked' : ''}> Ad-hoc</label>
        </div>
        <div id="carried-row" style="display:${savedAdHoc ? 'none' : 'block'};margin-top:6px;">
          <select name="weapon" style="width:100%;padding:4px;">${itemOptions || '<option value="">(none in inventory)</option>'}</select>
        </div>
        <div id="adhoc-row" style="display:${savedAdHoc ? 'block' : 'none'};margin-top:6px;">
          <div style="display:grid;grid-template-columns:auto 1fr auto 60px;gap:4px 8px;align-items:center;">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocName}" placeholder="Rock, Mug, Wrench" style="padding:4px;">
            <label>Dmg:</label>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="padding:4px;width:100%;">
          </div>
        </div>
      </div>

      <!-- Damage Preview -->
      <div id="preview" style="background:#ffebee;border:1px solid #ef9a9a;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialDamage}</span> <span id="dmg-note" style="color:#555;">(${savedAdHoc ? 'Ad-hoc' : (initialWeapon?.name || 'Weapon')})</span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>→ ${initialAfterArmor} after armor</strong></span>
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

              let weaponName, weaponDamage, weaponId = null;
              if (useAdHoc) {
                weaponName = String($('[name="adhocName"]').val() || "Improvised Blunt");
                weaponDamage = Number($('[name="adhocDamage"]').val() || 0);
                if (!Number.isFinite(weaponDamage) || weaponDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc weapon.");
                  return resolve(null);
                }
              } else {
                const wid = String($('[name="weapon"]').val() || "");
                const weapon = thrownBlunt.find(i => i.id === wid);
                if (!weapon) {
                  ui.notifications.error("Select a carried thrown-blunt weapon or use ad-hoc.");
                  return resolve(null);
                }
                weaponId = wid;
                weaponName = weapon.name;
                weaponDamage = Number(weapon.system?.damage || 0);
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
              await actor.setFlag("msh-faserip", "lastThrowBluntRemember", remember);
              await actor.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              await actor.setFlag("msh-faserip", "lastThrowBluntSkipDice", skipDice);
              if (remember) {
                await actor.setFlag("msh-faserip", "lastThrowBluntShift", shift);
                await actor.setFlag("msh-faserip", "lastThrowBluntAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastThrowBluntAdHocName", weaponName);
                await actor.setFlag("msh-faserip", "lastThrowBluntAdHocDamage", weaponDamage);
                await actor.setFlag("msh-faserip", "lastThrowBluntItemId", weaponId || "");
                await actor.setFlag("msh-faserip", "lastThrowBluntRange", range);
                await actor.setFlag("msh-faserip", "lastThrowBluntObstacle", throughObstacle);
              }

              // Strength-path range & obstacle modifiers
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
                movementModifier
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          // Source radio toggle
          const $srcRadios = html.find('[name="src"]');
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
            let dmg, note;
            if (isAdHoc) {
              dmg = Number(html.find('[name="adhocDamage"]').val()) || 0;
              note = 'Ad-hoc';
            } else {
              const wid = html.find('[name="weapon"]').val();
              const weapon = thrownBlunt.find(i => i.id === wid);
              dmg = Number(weapon?.system?.damage || 0);
              note = weapon?.name || 'Weapon';
            }
            html.find('#dmg-val').text(dmg);
            html.find('#dmg-note').text(`(${note})`);
            const after = Math.max(0, dmg - targetArmor);
            html.find('#after-armor-display').html(`<strong>→ ${after} after armor</strong>`);
          };
          html.find('[name="weapon"]').on('change', updateDamagePreview);
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
          const updatePreviewFromSelection = () => {
            this._setupRangePreview(html, { strengthRank: strRank });
          };
          updatePreviewFromSelection();

          setupModeSelector(actor, html, this.opts || {}, "lastThrowBluntMode");
          applyCapabilitiesToDialog(html, "throwing-blunt", { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, updatePreviewFromSelection);
        },
        close: () => {
        // ⬇️ ADD THIS - Clean up listeners when dialog closes
        if (this._disposeAutoFill) this._disposeAutoFill();
        }
      }).render(true);
    });

    if (!choice) return;

    // Rank → roll → karma → color
    const effectiveRank = shiftRank(ability.rank, choice.totalShift);
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} performs ${actionName}`
      });
    }
    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, { spendKarma: choice.spendKarma, rank: effectiveRank });
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

    // Standardized card
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    // Calculate penetrating damage by checking targeted token's Body Armor
    const isHit = colorLower !== 'white';
    const targetActor = primaryTargetActor;
    const targetName = primaryTarget?.name || "";
    const rawDamage = choice.weaponDamage;

    let armorValue = 0;
    let afterArmor = rawDamage;
    if (isHit && rawDamage > 0 && targetActor) {
      const armorData = getBodyArmorValues(targetActor, "physical-blunt");
      armorValue = armorData?.applicable ?? 0;
      afterArmor = Math.max(0, rawDamage - armorValue);
    }

    // Throwing Blunt: Red = Stun (no Kill/Slam by default)
    const actions = buildActionsBox({
      showStun: colorLower === "red" && afterArmor > 0,
      showKill: false,
      showSlam: false,
      actorUuid: actor.uuid,
      damage: isHit ? rawDamage : 0,
      attackForm: "blunt",
      damageType: "physical-blunt",
      bypassArmor: false,
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
    const damageHtml = (() => {
      if (!isHit) {
        return buildContentBox(`<strong>Damage:</strong> 0 (miss)`);
      }
      const dmgBox = `<span title="Weapon: ${choice.weaponName}" style="cursor:help;">${rawDamage}</span>`;
      if (armorValue > 0 && targetActor) {
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
        item: srcItem,                    // enables per-item SFX if present
        actionType: "throwing-blunt",
        damageType: "physical-blunt",
        rollResult: colorLower,           // "white" | "green" | "yellow" | "red"
        isHit                              // boolean from your result
      });
    }

    // === AUTO-APPLY DAMAGE IN FULL AUTO MODE ===
    if (this.opts?.autoApply && isHit && rawDamage > 0) {
      await applyDamageToTargets({
        damage: rawDamage,
        attackerUuid: actor.uuid,
        damageType: "physical-blunt",
        attackForm: "blunt",
        showNotification: true,
        bypassArmor: false,
        wasKillResult: false
      });
    }
    // === END AUTO-APPLY ===

  }
}