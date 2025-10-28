// scripts/modules/actions/force-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildMultiAttackSection,
  buildResultGrid,
  buildModeSelector,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetingContext,
  labelFor,
  postDeathSavePrompt,
  RANKS,
  rollWithKarmaAndHistory,
  setupModeSelector,
  setupMultiAttackHandlers,
  shiftRank
} from "./action-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class ForceAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "force";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    // Default to Agility unless user opts for power rank to-hit
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // === Candidate powers (schema-aware based on itemSheet.js) ===
    const forceItems = actor.items.filter((i) => {
      if (i.type !== "power") return false;
      const s = i.system || {};
      const cat = String(s.category || "").toLowerCase();
      const typ = String(s.type || "").toLowerCase();

      // Likely categories/types for "force" style ranged attacks
      const catLooksForce =
        cat === "distanceattacks" ||
        /force|telekinesis|kinetic|concussion|shockwave/.test(cat);

      const typeLooksForce =
        /force|telekinesis|kinetic|pressure|concussion|shockwave|ram/.test(typ);

      return catLooksForce || typeLooksForce;
    });

    // === Restore prefs ===
    const savedItemId    = await actor.getFlag("msh-faserip", "lastForceItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastForceRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastForceObstacle") || false;
    const savedAdHoc     = await actor.getFlag("msh-faserip", "lastForceAdHoc") || (!forceItems.length);
    const savedAdHocName = await actor.getFlag("msh-faserip", "lastForceAdHocName") || "Force Blast";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastForceAdHocDamage") || 15);
    const savedAdHocRank = await actor.getFlag("msh-faserip", "lastForceAdHocRank") || "Remarkable";
    const savedUsePowerToHit = await actor.getFlag("msh-faserip", "lastForceUsePowerToHit");
    const defaultUsePowerToHit = (savedUsePowerToHit === undefined || savedUsePowerToHit === null) ? true : !!savedUsePowerToHit;

    const savedShift = await actor.getFlag("msh-faserip", "lastForceShift") || 0;
    const savedMultiAdjacent = await actor.getFlag("msh-faserip", "lastForceMultiAdjacent") || false;

    const itemOptions = forceItems
      .map((i) => `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`)
      .join("");

    // === Dialog ===
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
        <input type="number" name="shift" value="${savedShift}" style="width:60px;">
      </div>

      <div style="margin-bottom:8px;">
        <span style="display:inline-block;width:110px;">Karma Points:</span>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:60px;">
      </div>

      <div style="margin-bottom:8px;">
        <input type="checkbox" id="usePowerToHit" name="usePowerToHit" ${defaultUsePowerToHit ? "checked" : ""}>
        <label for="usePowerToHit">Use power rank to hit</label>
      </div>

      <fieldset style="margin:10px 0;padding:8px;border:1px solid #ddd;border-radius:4px;background:#fafafa;">
        <legend style="padding:0 6px;font-weight:bold;">Power Source</legend>

        <div style="margin:4px 0;">
          <input type="checkbox" id="adhoc-toggle" name="adhoc" ${savedAdHoc ? "checked" : ""}>
          <label for="adhoc-toggle">Use ad-hoc force (no inventory power)</label>
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
            <span style="font-size:0.85em;color:#666;margin-left:6px;">e.g., “Remarkable”</span>
          </div>
        </div>

        <div class="carried-fields" style="margin-top:8px;${savedAdHoc ? "display:none" : ""}">
          <span style="display:inline-block;width:110px;">Power:</span>
          <select name="power" style="min-width:240px">
            ${itemOptions || '<option value="">(no force-style powers found)</option>'}
          </select>
          <div style="margin-top:6px;font-size:.85em;color:#666;">
            Damage and range use the power's damage/value and rank.
          </div>
        </div>
      </fieldset>

      ${buildMultiAttackSection("force", game.user.targets.size, false, 2, savedMultiAdjacent)}

      ${this._buildRangeInputs({
        defaultRange: savedRange,
        showObstacle: true,
        weaponMaxRange: null,
        powerRank: savedAdHoc
          ? savedAdHocRank
          : (forceItems.find(i => i.id === savedItemId)?.system?.rank
             ?? forceItems.find(i => i.id === savedItemId)?.system?.powerRank
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
              let powerDamageType = "energy-force"; // Force uses different default

              if (useAdHoc) {
                powerName = String($('[name="adhocName"]').val() || "Force Blast");
                powerDamage = Number($('[name="adhocDamage"]').val() || 0);
                powerRank = String($('[name="adhocRank"]').val() || "Remarkable");
                if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc force.");
                  return resolve(null);
                }
              } else {
                const wid = String($('[name="power"]').val() || "");
                const item = forceItems.find((i) => i.id === wid);
                if (!item) {
                  ui.notifications.error("Select a force-style power or use ad-hoc.");
                  return resolve(null);
                }
                powerId = wid;
                const s = item.system || {};
                powerName = item.name;
                powerDamage = Number(s.damage ?? s.value ?? 0);
                powerRank = String(s.rank ?? s.powerRank ?? "Remarkable");
                prettyRange = String(s.calculatedRange || "");
                powerDamageType = item.system.damageType || "energy-force";
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

              const multiAdjacent = !!$('[name="multiAdjacent"]').is(':checked');

              if (remember) {
                await actor.setFlag("msh-faserip", "lastForceAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastForceAdHocName", powerName);
                await actor.setFlag("msh-faserip", "lastForceAdHocDamage", powerDamage);
                await actor.setFlag("msh-faserip", "lastForceAdHocRank", powerRank);
                await actor.setFlag("msh-faserip", "lastForceItemId", powerId || "");
                await actor.setFlag("msh-faserip", "lastForceRange", range);
                await actor.setFlag("msh-faserip", "lastForceObstacle", throughObstacle);
                await actor.setFlag("msh-faserip", "lastForceUsePowerToHit", usePowerToHit);

                await actor.setFlag("msh-faserip", "lastForceShift", shift);
                await actor.setFlag("msh-faserip", "lastForceMultiAdjacent", multiAdjacent);
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
                multiAdjacent
              });
            },
          },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "roll",
        render: async (html) => {
          await setupModeSelector(actor, html, this.opts || {}, "lastForceMode");
          const $adhoc = html.find('#adhoc-toggle');

          const updatePreviewFromSelection = () => {
              if ($adhoc.is(":checked")) {
              const r = String(html.find('[name="adhocRank"]').val() || "Remarkable");
              this._setupRangePreview(html, { powerRank: r });
              } else {
              const wid = String(html.find('[name="power"]').val() || "");
              const s = forceItems.find((i) => i.id === wid)?.system || {};
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

          setupMultiAttackHandlers(html);

          // ⬇️ Attach auto-fill so [name="range"] updates from token→target distance
          this._disposeAutoFill = attachAutoFillRange(html, actor, updatePreviewFromSelection);
          },
          close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
          },
      }).render(true);
    });

    if (!choice) return;

    // Handle multiple adjacent targets (single roll @-4 CS)
    if (choice.multiAdjacent) {
      choice.totalShift = (choice.totalShift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

    // === To-hit column rank selection ===
    const toHitRankName = choice.usePowerToHit ? choice.powerRank : ability.rank;
    const effectiveRank = shiftRank(toHitRankName, choice.totalShift);

    // === Roll ===
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

    // === Standardized chat card ===
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText || this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // Derive which chips to show from the configured effect text for this color
    const effText = String(effectResult || "").toLowerCase();
    const isHit = colorLower !== 'white';
    const actions = buildActionsBox({
      showSlam: /slam/.test(effText),
      showStun: /stun/.test(effText),
      showKill: /kill/.test(effText),
      actorUuid: actor.uuid,
      damage: isHit ? choice.powerDamage : 0,  // Only pass damage if it's a hit
      attackForm: "force",
      autoApply: this.opts?.autoApply  // is Auto Mode on?
    });

    // --- Damage numbers for display + flags ---
    const rawDamage = isHit ? Number(choice.powerDamage || 0) : 0;

    // Prefer item damageType if a carried power was chosen; else default to force energy
    const dmgType =
      (choice.powerId
        ? (forceItems.find(i => i.id === choice.powerId)?.system?.damageType)
        : null) || "energy-force";

    const { afterArmor, targetName, multiTargetCount, targetsArray } = computeAfterArmor({
      isHit,
      rawDamage,
      damageType: dmgType,
      targets: game.user?.targets,
      getArmorFn: (actor, dt) => getBodyArmorValues(actor, dt)
    });

    const damageBlock = makeDamageBlock({
      isHit,
      rawDamage,
      afterArmor,
      sourceLabel: `Power: ${choice.powerName} (${choice.powerRank})`,
      targetName,
      multiTargetCount
    });

    const rangeText = choice.prettyRange || 
      `${choice.range} area${choice.range > 1 ? "s" : ""}` +
      `${choice.rangeModifier ? ` (${choice.rangeModifier}CS)` : ""}` +
      `${choice.throughObstacle ? `, obstacle (-2CS)` : ""}`;

    const toHitLine = choice.usePowerToHit
      ? `To-Hit Rank: ${choice.powerRank} (Power)`
      : `To-Hit Rank: ${ability.rank} (${ability.value}) — Ability: ${ability.name}`;

    const contextHtml = `
      <div>${toHitLine}${this.opts?.shift ? ` — Shift ${this.opts.shift} → ${effectiveRank}` : ""}</div>
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
        ${actions}
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      flags: buildDamageFlags({
        actionId: actionType,
        damageType: dmgType,
        rawDamage,
        afterArmor,
        resultColor: colorLower,
        cappedTotal,
        targets: targetsArray
      })
    });

    // === AUTO-APPLY DAMAGE IN FULL AUTO MODE ===
    if (this.opts?.autoApply && isHit && rawDamage > 0) {
      debugLog("Auto-applying damage in full auto mode", {
        damage: rawDamage,
        afterArmor,
        targets: targetsArray?.length || 0
      });
      
      await applyDamageToTargets(rawDamage, {
        attackerUuid: actor.uuid,
        damageType: dmgType,
        showNotification: true,
        bypassArmor: false,
        attackForm: "force",
        armorPiercing: 0,
        apMode: "value",
        wasKillResult: colorLower === "red"
      });
    }
    // === END AUTO-APPLY ===

    // Play combat SFX
    const sourceName = choice.powerName || "Force Blast";
    if (game.msh?.playCombatSFX) {
      await game.msh.playCombatSFX(dmgType, sourceName, colorLower);
    }
  }
}