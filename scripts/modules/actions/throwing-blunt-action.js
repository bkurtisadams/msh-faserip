// scripts/modules/actions/throwing-blunt-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
import { attachAutoFillRange } from "./action-utils.js";
import { resolveCombatMode } from "./action-dispatcher.js";

import {
  getAbilityInfo,
  labelFor,
  effectsFor,
  shiftRank,
  rollWithKarmaAndHistory,
  buildResultGrid,
  buildActionsBox,
  bannerColors,
  getTargetingContext,
  getBodyArmorValues,
  applyDamageToTargets,
  buildModeSelector,
  setupModeSelector,
  applyCapabilitiesToDialog
} from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class ThrowingBluntAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-blunt";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // Candidate weapons: thrown + blunt
    const thrownBlunt = actor.items.filter(i => {
      const s = i.system || {};
      const tags = (s.tags || []).map(t => String(t).toLowerCase());
      const isThrown = s.weaponType === "thrown" || tags.includes("thrown");
      const isBlunt  =
        s.damageType === "BA" ||
        s.attackType === "blunt" ||
        tags.includes("blunt") ||
        tags.includes("ba");
      return isThrown && isBlunt;
    });

    // Strength-based throwing range
    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";

    // Restore flags
    const savedItemId    = await actor.getFlag("msh-faserip", "lastThrowBluntItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastThrowBluntRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastThrowBluntObstacle") || false;
    const savedAdHoc     = await actor.getFlag("msh-faserip", "lastThrowBluntAdHoc") || (!thrownBlunt.length);
    const savedAdHocName = await actor.getFlag("msh-faserip", "lastThrowBluntAdHocName") || "Rock";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastThrowBluntAdHocDamage") || 6);

    const itemOptions = thrownBlunt
      .map(i => `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`)
      .join("");

    // Dialog
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}
      
      <div style="margin-bottom:8px;"><strong>${actionName}</strong></div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Ability:</span>
        <input type="text" value="${ability.name}" style="width:120px" readonly>
        <span style="margin-left:6px;">${ability.rank} (${ability.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Column Shift:</span>
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:60px;">
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Karma Points:</span>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:60px;">
      </div>

      <fieldset style="margin:10px 0;padding:8px;border:1px solid #ddd;border-radius:4px;background:#fafafa;">
        <legend style="padding:0 6px;font-weight:bold;">Weapon Source</legend>

        <div style="margin:4px 0;">
          <input type="checkbox" id="adhoc-toggle" name="adhoc" ${savedAdHoc ? "checked" : ""}>
          <label for="adhoc-toggle">Use weapon of opportunity (ad-hoc)</label>
        </div>

        <div class="adhoc-fields" style="margin-top:8px;${savedAdHoc ? "" : "display:none"}">
          <div style="margin-bottom:6px;">
            <span style="display:inline-block;width:110px;">Name:</span>
            <input type="text" name="adhocName" value="${savedAdHocName}" style="width:220px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">e.g., “Rock”, “Mug”, “Wrench”</span>
          </div>
          <div>
            <span style="display:inline-block;width:110px;">Damage:</span>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:80px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">numeric damage</span>
          </div>
        </div>

        <div class="carried-fields" style="margin-top:8px;${savedAdHoc ? "display:none" : ""}">
          <span style="display:inline-block;width:110px;">Weapon:</span>
          <select name="weapon" style="min-width:220px">
            ${itemOptions || '<option value="">(none in inventory)</option>'}
          </select>
        </div>
      </fieldset>

      ${this._buildRangeInputs({
        defaultRange: savedRange,
        showObstacle: true,
        weaponMaxRange: null,
        powerRank: null,
        strengthRank: strRank
      })}

      <div style="margin-top:8px;">
        <input type="checkbox" id="remember" name="remember" checked>
        <label for="remember">Remember settings</label>
        <input type="checkbox" id="skipDice" name="skipDice" style="margin-left:12px;">
        <label for="skipDice">Skip dice animation</label>
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
              const useAdHoc = !!$('#adhoc-toggle').is(':checked');

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
              const karma = Number($('[name="karma"]').val() || 0);
              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');

              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);

              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

              if (remember) {
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
          const $adhoc = html.find('#adhoc-toggle');
            const updatePreviewFromSelection = () => {
            this._setupRangePreview(html, { strengthRank: strRank });
          };

          const applyToggle = () => {
            const on = $adhoc.is(':checked');
            html.find('.adhoc-fields').css('display', on ? '' : 'none');
            html.find('.carried-fields').css('display', on ? 'none' : '');
            updatePreviewFromSelection();
          };

         $adhoc.on('change', applyToggle);
          applyToggle();
          setupModeSelector(actor, html, this.opts || {}, "lastThrowBluntMode");
          applyCapabilitiesToDialog(html, "throwing-blunt", { actor });  // new
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
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll);
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

    // Standardized card (same as Throwing Edged/Blunt Attack style)
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText || this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // Calculate penetrating damage by checking targeted token's Body Armor
    const isHit = colorLower !== 'white';
    let penetratingDamage = 0;
    if (isHit && choice.weaponDamage > 0) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        const targetActor = targets[0].actor;
        if (targetActor) {
          const armorData = getBodyArmorValues(targetActor, "physical-blunt");
          penetratingDamage = Math.max(0, choice.weaponDamage - armorData.applicable);
        }
      } else {
        penetratingDamage = choice.weaponDamage;
      }
    }

    const targets = Array.from(game.user?.targets ?? []);
    const rawDamage = choice.weaponDamage;
    const afterArmor = penetratingDamage;

    // Throwing Blunt: Red = Stun (no Kill/Slam by default)
    const actions = buildActionsBox({
      showStun: colorLower === "red" && penetratingDamage > 0,
      showKill: false,
      showSlam: false,
      actorUuid: actor.uuid,
      damage: isHit ? choice.weaponDamage : 0,  // Only pass damage if it's a hit
      attackForm: "blunt",
      damageType: "physical-blunt",
      bypassArmor: false,
      autoApply: !!this.opts?.autoApply,
      // IMPORTANT: let the action flow handle auto-saves; the card should NOT auto-save.
      autoSave: false,
    });

    // Damage block
    const damageBlock = `
      <div style="margin:6px 10px;padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff;">
        <div><b>Damage (raw):</b> ${rawDamage}</div>
        ${isHit ? `
          <div><b>After Armor${targets.length===1 ? ` (${targets[0].name})` : ``}:</b> ${afterArmor}</div>
        ` : ``}
        <div style="font-size:.9em;color:#555;">
          Weapon: ${choice.weaponName}
        </div>
      </div>
    `;

    const contextHtml = `
      <div>Ability: ${ability.name}</div>
      <div>Base Rank: ${ability.rank} (${ability.value})</div>
      <div>Weapon: ${choice.weaponName} — Damage: ${choice.weaponDamage}</div>
      <div>Distance: ${choice.range} area${choice.range > 1 ? "s" : ""} ${choice.rangeModifier ? `(${choice.rangeModifier}CS)` : ""}${choice.throughObstacle ? `, obstacle (-2CS)` : ""}${choice.movementModifier ? `, target movement (${choice.movementModifier > 0 ? '+' : ''}${choice.movementModifier}CS)` : ""}</div>
      ${choice.totalShift !== 0 ? `<div>Effective Rank: ${effectiveRank} (${choice.totalShift > 0 ? '+' : ''}${choice.totalShift}CS total)</div>` : ""}
      <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
    `;

    const targetingContext = getTargetingContext(actor, actionName);

    // final chat card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - ${actionName}</strong>
        </div>
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
        </div>
        <div style="padding:5px 10px;font-size:.9em;">${contextHtml}</div>
        ${damageBlock}
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${actions}
      </div>
    `;

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
      await applyDamageToTargets(rawDamage, {
        attackerUuid: actor.uuid,
        damageType: "physical-blunt",
        attackForm: "blunt",
        showNotification: true,
        bypassArmor: false
      });
    }
    // === END AUTO-APPLY ===

  }
}
