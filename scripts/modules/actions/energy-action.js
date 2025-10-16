// scripts/modules/actions/energy-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  attachAutoFillRange,
  getBodyArmorValues,
  postDeathSavePrompt  // ADD THIS IMPORT
} from "./action-utils.js";

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
  RANKS  // ADD THIS IMPORT for effect creation
} from "./action-utils.js";

import { startAura, stopAura, isAuraMaintained } from "./nullify.js";


export class EnergyAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "energy";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // === Candidate powers (schema-aware based on itemSheet.js) ===
    const energyItems = actor.items.filter((i) => {
      if (i.type !== "power") return false;
      const s = i.system || {};
      const cat = String(s.category || "").toLowerCase();
      const typ = String(s.type || "").toLowerCase();

      // Primary buckets: ranged / energy-style powers
      const catIsEnergy = cat === "energycontrol" || cat === "distanceattacks";

      // Safety net: if category is missing/migrated, detect by type keywords
      const typeLooksEnergy = /energy|light|electric|plasma|beam|blast|fire|ice|sound|darkforce|radiation/.test(typ);

      return catIsEnergy || typeLooksEnergy;
    });

    // === Restore prefs ===
    const savedItemId    = await actor.getFlag("msh-faserip", "lastEnergyItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastEnergyRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastEnergyObstacle") || false;
    const savedAdHoc     = await actor.getFlag("msh-faserip", "lastEnergyAdHoc") || (!energyItems.length);
    const savedAdHocName = await actor.getFlag("msh-faserip", "lastEnergyAdHocName") || "Energy Blast";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastEnergyAdHocDamage") || 20);
    const savedAdHocRank = await actor.getFlag("msh-faserip", "lastEnergyAdHocRank") || "Remarkable";

    const savedUsePowerToHit = await actor.getFlag("msh-faserip", "lastEnergyUsePowerToHit");
    const defaultUsePowerToHit = (savedUsePowerToHit === undefined || savedUsePowerToHit === null) ? true : !!savedUsePowerToHit;

    const savedShift = await actor.getFlag("msh-faserip", "lastEnergyShift") || 0;

    const itemOptions = energyItems
      .map((i) => `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`)
      .join("");

    // === Dialog ===
    const dialogHtml = `
      <div style="margin-bottom:8px;"><strong>${actionName}</strong></div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Ability:</span>
        <input type="text" value="${ability.name}" style="width:120px" readonly>
        <span style="margin-left:6px;">${ability.rank} (${ability.value})</span>
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Column Shift:</span>
        <input type="number" name="shift" value="${Number(savedShift)}" style="width:60px;">
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Karma Points:</span>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:60px;">
      </div>

      <!-- usePowerToHit checkbox -->
      <div style="margin-bottom:8px;">
        <input type="checkbox" id="usePowerToHit" name="usePowerToHit" ${defaultUsePowerToHit ? "checked" : ""}>
        <label for="usePowerToHit">Use power rank to hit</label>
      </div>

      <fieldset style="margin:10px 0;padding:8px;border:1px solid #ddd;border-radius:4px;background:#fafafa;">
        <legend style="padding:0 6px;font-weight:bold;">Power Source</legend>

        <div style="margin:4px 0;">
          <input type="checkbox" id="adhoc-toggle" name="adhoc" ${savedAdHoc ? "checked" : ""}>
          <label for="adhoc-toggle">Use ad-hoc energy (no inventory power)</label>
        </div>

        <div class="adhoc-fields" style="margin-top:8px;${savedAdHoc ? "" : "display:none"}">
          <div style="margin-bottom:6px;">
            <span style="display:inline-block;width:110px;">Name:</span>
            <input type="text" name="adhocName" value="${savedAdHocName}" style="width:220px;">
          </div>
          <div style="margin-bottom:6px;">
            <span style="display:inline-block;width:110px;">Damage:</span>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:80px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">numeric</span>
          </div>
          <div>
            <span style="display:inline-block;width:110px;">Power Rank (range):</span>
            <input type="text" name="adhocRank" value="${savedAdHocRank}" style="width:120px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">e.g., "Remarkable"</span>
          </div>
        </div>

        <div class="carried-fields" style="margin-top:8px;${savedAdHoc ? "display:none" : ""}">
          <span style="display:inline-block;width:110px;">Power:</span>
          <select name="power" style="min-width:240px">
            ${itemOptions || '<option value="">(no energy powers found)</option>'}
          </select>
          <div style="margin-top:6px;font-size:.85em;color:#666;">
            Damage and range use the power's damage/value and rank.
          </div>
        </div>
      </fieldset>

      ${this._buildRangeInputs({
        defaultRange: savedRange,
        showObstacle: true,
        weaponMaxRange: null,
        powerRank: savedAdHoc
          ? savedAdHocRank
          : (energyItems.find(i => i.id === savedItemId)?.system?.rank
             ?? energyItems.find(i => i.id === savedItemId)?.system?.powerRank
             ?? "Remarkable"),
        strengthRank: null
      })}

      <div style="margin-top:8px;">
        <input type="checkbox" id="remember" name="remember" checked>
        <label for="remember">Remember settings</label>
        <input type="checkbox" id="skipDice" name="skipDice" style="margin-left:12px;">
        <label for="skipDice">Skip dice animation</label>
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
              const $ = (sel) => html.find(sel);
              const useAdHoc = !!$("#adhoc-toggle").is(":checked");

              let powerName = "", powerDamage = 0, powerRank = "Remarkable", powerId = null, prettyRange = "";
              let powerDamageType = "energy-generic"; // Default damage type

              if (useAdHoc) {
                powerName = String($('[name="adhocName"]').val() || "Energy Blast");
                powerDamage = Number($('[name="adhocDamage"]').val() || 0);
                powerRank = String($('[name="adhocRank"]').val() || "Remarkable");
                powerDamageType = "energy-generic"; // Ad-hoc uses generic energy
                if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc energy.");
                  return resolve(null);
                }
              } else {
                const wid = String($('[name="power"]').val() || "");
                const item = energyItems.find((i) => i.id === wid);
                if (!item) {
                  ui.notifications.error("Select an energy power or use ad-hoc.");
                  return resolve(null);
                }
                powerId = wid;
                const s = item.system || {};
                powerName = item.name;
                powerDamage = Number(s.damage && s.damage > 0 ? s.damage : s.value) || 0;
                powerRank = String(s.rank ?? s.powerRank ?? "Remarkable");
                prettyRange = String(s.calculatedRange || "");
                powerDamageType = item.system.damageType || "energy-generic"; // Get from power or default
              }

              const shift = Number($('[name="shift"]').val() || 0);
              const karma = Number($('[name="karma"]').val() || 0);
              const usePowerToHit = !!$('#usePowerToHit').is(':checked');

              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');
  
              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
              
              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

              if (remember) {
                await actor.setFlag("msh-faserip", "lastEnergyAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastEnergyUsePowerToHit", usePowerToHit);
                await actor.setFlag("msh-faserip", "lastEnergyAdHocName", powerName);
                await actor.setFlag("msh-faserip", "lastEnergyAdHocDamage", powerDamage);
                await actor.setFlag("msh-faserip", "lastEnergyAdHocRank", powerRank);
                await actor.setFlag("msh-faserip", "lastEnergyItemId", powerId || "");
                await actor.setFlag("msh-faserip", "lastEnergyRange", range);
                await actor.setFlag("msh-faserip", "lastEnergyObstacle", throughObstacle);
                await actor.setFlag("msh-faserip", "lastEnergyShift", shift);
              }

              // Range & obstacle modifiers via powerRank path
              const { totalShift, impossible, rangeModifier, obstacleModifier } =
                this._applyRangeModifiers(shift, range, throughObstacle, null, powerRank, null);
                
              const finalShift = totalShift + movementModifier;
              
              if (impossible) {
                ui.notifications.error(`Target is beyond energy range (rank: ${powerRank}).`);
                return resolve(null);
              }

              resolve({
                powerName, powerDamage, powerRank, powerId, prettyRange,
                karma, range, throughObstacle, skipDice, usePowerToHit,
                totalShift: finalShift,
                rangeModifier, 
                obstacleModifier,
                targetMovement,
                movementModifier,
                powerDamageType
              });
            },
          },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "roll",
        render: (html) => {
          const $adhoc = html.find("#adhoc-toggle");

          const updatePreviewFromSelection = () => {
            if ($adhoc.is(":checked")) {
              const r = String(html.find('[name="adhocRank"]').val() || "Remarkable");
              this._setupRangePreview(html, { powerRank: r });
            } else {
              const wid = String(html.find('[name="power"]').val() || "");
              const s = energyItems.find((i) => i.id === wid)?.system || {};
              const r = String(s.rank ?? s.powerRank ?? "Remarkable");
              this._setupRangePreview(html, { powerRank: r });
            }
          };

          const applyToggle = () => {
            const on = $adhoc.is(":checked");
            html.find(".adhoc-fields").css("display", on ? "" : "none");
            html.find(".carried-fields").css("display", on ? "none" : "");
            updatePreviewFromSelection();
          };

          $adhoc.on("change", applyToggle);
          html.find('[name="adhocRank"]').on("input", updatePreviewFromSelection);
          html.find('[name="power"]').on("change", updatePreviewFromSelection);

          applyToggle(); // initial
          this._disposeAutoFill = attachAutoFillRange(html, actor, updatePreviewFromSelection);
        },
        close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
        }
      }).render(true);
    });

    if (!choice) return;

    // --- Nullify RAW guard: while maintaining aura, user cannot use other inborn powers
    try {
      const maintaining = isAuraMaintained(actor);
      if (maintaining && !choice.useAdHoc && choice.powerId) {
        const thisItem = energyItems.find(i => i.id === choice.powerId);
        const isNullifyPower =
          (thisItem?.system?.damageType === 'nullification') ||
          (thisItem?.system?.primaryEffect === 'nullification') ||
          /nullif/i.test(thisItem?.name ?? '');
        const isInborn = (thisItem?.system?.source === 'natural'); // tech/magic unaffected
        if (!isNullifyPower && isInborn) {
          ui.notifications.warn(`${actor.name} is maintaining Nullification and cannot use other inborn powers right now.`);
          return; // abort this action
        }
      }
    } catch (e) {
      console.warn('Nullify aura guard check failed:', e);
    }


    // === Resolve roll ===
    // Rank → roll → karma → color
    const toHitRankName = choice.usePowerToHit ? choice.powerRank : ability.rank;
    const effectiveRank = shiftRank(toHitRankName, choice.totalShift);

    const roll = await new Roll("1d100").evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} performs ${actionName}`,
        rollMode: game.settings.get("core", "rollMode"),
      });
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll);

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    // Hit state
    const isHit = colorLower !== 'white';
    const targets = Array.from(game.user?.targets ?? []);
    // Primary target (if exactly one is selected) + power rank for Nullify intensity
    const primaryTarget = targets.length === 1 ? targets[0] : null;
    const attackerPowerRankName = choice.powerRank;

    // === Build standardized chat card (same as Throwing-Edged style) ===
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText || this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // Derive which chips to show from the configured effect text for this color
    const effText = String(effectResult || "").toLowerCase();
    
    // Debug
    console.log("FASERIP | Energy Action Debug:", {
      isHit,
      colorLower,
      powerDamage: choice.powerDamage,
      damagePassedToBox: isHit ? choice.powerDamage : 0,
      effText,
      actorName: actor.name,
      powerName: choice.powerName,
      usePowerToHit: choice.usePowerToHit,
      damageType: choice.powerDamageType
    });

    // Calculate penetrating damage
    let penetratingDamage = 0;
    if (isHit && choice.powerDamage > 0) {
      if (targets.length === 1) {
        const targetActor = targets[0].actor;
        if (targetActor) {
          const armorData = getBodyArmorValues(targetActor, choice.powerDamageType);
          penetratingDamage = Math.max(0, choice.powerDamage - armorData.applicable);
        } else {
          penetratingDamage = choice.powerDamage;
        }
      } else {
        penetratingDamage = choice.powerDamage;
      }
    }

    const actions = buildActionsBox({
      showSlam: false, // Energy attacks don't typically slam
      showStun: /stun|bullseye/.test(effText) && penetratingDamage > 0,
      showKill: /kill/.test(effText) && penetratingDamage > 0,
      showNullifySave: false,
      nullifyIntensityRank: attackerPowerRankName, // e.g., "Remarkable"
      actorUuid: actor.uuid,
      targetUuid: primaryTarget?.actor?.uuid || "",
      damage: penetratingDamage,
      attackForm: "energy",
      damageType: choice.powerDamageType,
      bypassArmor: false
    });

    // --- Nullification save + aura chips (per RAW: Endurance vs Power Rank, tech/magic unaffected)
    const usedItem = choice.powerId ? energyItems.find(i => i.id === choice.powerId) : null;

    let saveChipHtml = "";
    let auraChipHtml = "";
    let saveFlags = null;

    if (!choice.useAdHoc && choice.powerId && isHit) {  // ← ADD && isHit
      const s = usedItem?.system ?? {};
      const isNullifyPower =
        (s.damageType === 'nullification') ||
        (s.primaryEffect === 'nullification') ||
        /nullif/i.test(usedItem?.name ?? '');

      if (isNullifyPower) {
        // Defaults to RAW: Endurance FEAT vs Attacker Power Rank; effect for rank rounds if not maintained
        const ability    = (s.save?.ability)    || "endurance";
        const intensity  = (s.save?.intensity)  || "power-rank";
        const fixedRank  = (s.save?.fixedRank)  || "";
        const ignoreGate = (s.save?.ignoreDamageGate !== false); // saves should ignore damage gate

        saveChipHtml = `
          <div style="text-align:center;margin-top:6px;">
            <a class="faserip-chip" data-action="force-save">Force Save (Targets)</a>
          </div>
        `;

        // Aura toggle (maintain while in range)
        const isMaintaining = isAuraMaintained(actor);
        auraChipHtml = `
          <div style="text-align:center;margin-top:6px;">
            <a class="faserip-chip" data-action="toggle-nullify-aura">
              ${isMaintaining ? 'Stop Nullify Aura' : 'Start Nullify Aura'}
            </a>
          </div>
        `;

        saveFlags = {
          requiresSave: true,
          saveAbility: ability,           // Endurance by default
          saveIntensity: intensity,       // Power rank intensity
          saveFixedRank: fixedRank,
          saveIgnoreGate: ignoreGate,
          attackerUuid: actor?.uuid || "",
          nullify: { powerItemUuid: usedItem?.uuid ?? null } // helpful for provenance
        };
      }
    }

    // Damage numbers for display + flags
    const rawDamage = isHit ? (Number(choice.powerDamage) || 0) : 0;

    let afterArmor = rawDamage;
    if (isHit && rawDamage > 0 && targets.length === 1) {
      const targetActor = targets[0]?.actor;
      if (targetActor) {
        const armorData = getBodyArmorValues(targetActor, choice.powerDamageType);
        afterArmor = Math.max(0, rawDamage - (armorData?.applicable ?? 0));
      }
    }

    // Build a standardized damage block (inline HTML)
    const sourceLabel = `Power: ${choice.powerName} (${choice.powerRank})`;
    const damageBlock = `
      <div style="margin:6px 10px;padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff;">
        <div><b>Damage (raw):</b> ${rawDamage}</div>
        ${isHit ? (targets.length === 1
          ? `<div><b>After Armor (${targets[0].name}):</b> ${afterArmor}</div>`
          : `<div><b>After Armor (varies):</b> Resolve per target</div>`) : ``}
        <div style="font-size:.9em;color:#555;">${sourceLabel}</div>
      </div>
    `;

    const rangeText = choice.prettyRange || `${choice.range} area${choice.range > 1 ? "s" : ""}${choice.rangeModifier ? ` (${choice.rangeModifier}CS)` : ""}${choice.throughObstacle ? `, obstacle (-2CS)` : ""}`;

    // Build a clear to-hit line first
    const toHitLine = choice.usePowerToHit
      ? `To-Hit Rank: ${choice.powerRank} (Power)`
      : `To-Hit Rank: ${ability.rank} (${ability.value}) — Ability: ${ability.name}`;

    // Context block (same order/style as your other cards)
    const contextHtml = `
      <div>${toHitLine}${choice.totalShift ? ` — Shift ${choice.totalShift} → ${effectiveRank}` : ""}</div>
      <div>Power: ${choice.powerName} — Damage: ${choice.powerDamage} — Rank: ${choice.powerRank}</div>
      <div>Distance: ${rangeText}</div>
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
        
        ${auraChipHtml}
        ${saveChipHtml}
        ${actions}
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      flags: {
        "msh-faserip": {
          actionId: actionType,
          damageType: choice.powerDamageType,
          rawDamage,
          afterArmor,
          resultColor: colorLower,
          cappedTotal,
          targets: targets.map(t => t.document?.uuid ?? t.actor?.uuid ?? t.id), 
          ...(saveFlags || {})

        }
      }
    });
  }
}