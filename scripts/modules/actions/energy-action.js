// scripts/modules/actions/energy-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
// NOTE: resolveCombatMode imported dynamically to avoid circular dependency
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";

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
  applyCapabilitiesToDialog,
  shiftRank,
  playAttackEffect,
  playImpactEffect,
  getAttackEffectPath
} from "./action-utils.js";

import { isAuraMaintained } from "./nullify.js";
import { buildDamageFlags } from "./damage-ui.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class EnergyAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "energy";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // === Candidate powers (schema-aware based on itemSheet.js) ===
    let energyItems = actor.items.filter((i) => {
      if (i.type !== "power") return false;
      const s = i.system || {};
      
      // NEW: Explicit flag (if you add one)
      if (s.isEnergyAttack === true) return true;
      
      // EXISTING: Category/type detection
      const cat = String(s.category || "").toLowerCase();
      const typ = String(s.type || "").toLowerCase();
      const catIsEnergy = cat === "energycontrol" || cat === "distanceattacks";
      const typeLooksEnergy = /energy|light|electric|plasma|beam|blast|fire|ice|cold|sound|darkforce|radiation|heat/.test(typ);
      
      return catIsEnergy || typeLooksEnergy;
    });

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "power") {
      // Add to list if not already present
      if (!energyItems.find(i => i.id === passedItem.id)) {
        energyItems = [passedItem, ...energyItems];
      }
    }

    // === Restore prefs (but override with passed item if present) ===
    const savedItemId    = passedItemId || await actor.getFlag("msh-faserip", "lastEnergyItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastEnergyRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastEnergyObstacle") || false;
    // If a specific item was passed, don't use ad-hoc mode
    const savedAdHoc     = passedItem ? false : (await actor.getFlag("msh-faserip", "lastEnergyAdHoc") || (!energyItems.length));
    const savedAdHocName = await actor.getFlag("msh-faserip", "lastEnergyAdHocName") || "Energy Blast";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastEnergyAdHocDamage") || 20);
    const savedAdHocRank = await actor.getFlag("msh-faserip", "lastEnergyAdHocRank") || "Remarkable";

    const savedUsePowerToHit = await actor.getFlag("msh-faserip", "lastEnergyUsePowerToHit");
    const defaultUsePowerToHit = (savedUsePowerToHit === undefined || savedUsePowerToHit === null) ? true : !!savedUsePowerToHit;

    const savedShift = await actor.getFlag("msh-faserip", "lastEnergyShift") || 0;
    const savedMultiAdjacent = await actor.getFlag("msh-faserip", "lastEnergyMultiAdjacent") || false;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastEnergyRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastEnergySkipDice")) ?? false;

    const itemOptions = energyItems
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
        <input type="number" name="shift" value="${Number(savedShift)}" style="width:60px;">
      </div>

      ${generateKarmaControlsHTML(actor, 0)}

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

      ${buildMultiAttackSection("energy", game.user.targets.size, false, 2, savedMultiAdjacent)}
      
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
        <input type="checkbox" id="rememberSettings" name="rememberSettings" ${savedRemember ? 'checked' : ''}>
        <label for="rememberSettings">Remember settings</label>
        <input type="checkbox" id="skipDiceRoll" name="skipDiceRoll" style="margin-left:12px;" ${savedSkipDice ? 'checked' : ''}>
        <label for="skipDiceRoll">Skip dice animation</label>
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
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;
              const usePowerToHit = !!$('#usePowerToHit').is(':checked');

              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');
  
              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
              
              const remember = $(`[name="rememberSettings"]`).length ? !!$(`[name="rememberSettings"]`).is(':checked') : !!$(`[name="remember"]`).is(':checked');
              const skipDice = $(`[name="skipDiceRoll"]`).length ? !!$(`[name="skipDiceRoll"]`).is(':checked') : !!$(`[name="skipDice"]`).is(':checked');

              const multiAdjacent = !!$('[name="multiAdjacent"]').is(':checked');

              // Always save remember/skipDice preferences
              await actor.setFlag("msh-faserip", "rememberSettings", remember);
              await actor.setFlag("msh-faserip", "lastEnergyRemember", remember);
              await actor.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              await actor.setFlag("msh-faserip", "lastEnergySkipDice", skipDice);
              if (remember) {
                await actor.setFlag("msh-faserip", "lastEnergyAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastEnergyUsePowerToHit", usePowerToHit);

                await actor.setFlag("msh-faserip", "lastEnergyShift", shift);
                await actor.setFlag("msh-faserip", "lastEnergyMultiAdjacent", multiAdjacent);

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
                useAdHoc,
                shift, karma, spendKarma, range, throughObstacle, skipDice, usePowerToHit, html,
                totalShift: finalShift,
                rangeModifier,
                obstacleModifier,
                targetMovement,
                movementModifier,
                powerDamageType,
                multiAdjacent
              });
            },
          },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          await setupModeSelector(actor, html, this.opts || {}, "lastEnergyMode");
          const $adhoc = html.find('#adhoc-toggle');

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
          // multi adjacent targets, FEAT roll at -4 CS, if success all targets hit
          setupMultiAttackHandlers(html);
          applyCapabilitiesToDialog(html, "energy", { actor });  // new
          this._disposeAutoFill = attachAutoFillRange(html, actor, updatePreviewFromSelection);
        },
        close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
        }
      }).render(true);
    });

    if (!choice) return;

    // Handle multiple adjacent targets (single roll @-4 CS)
    if (choice.multiAdjacent) {
      choice.totalShift = (choice.totalShift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

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
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, { spendKarma: choice.spendKarma, rank: effectiveRank });

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();  // DECLARE IT HERE
    const effectResult = effects[colorLower] || color;

    // === VISUAL EFFECTS ===
    const sourceToken = actor.getActiveTokens()[0];
    if (sourceToken && !choice.skipDice) {
      let effectPath;
      
      if (!choice.useAdHoc && choice.powerItem) {
        // Use power's configured effect
        const effectAnim = choice.powerItem.system?.effectAnimation || "";
        const effectColor = choice.powerItem.system?.effectColor || "blue";
        const effectVariant = choice.powerItem.system?.effectVariant || "01";
        
        if (effectAnim) {
          effectPath = effectAnim; // Custom path from item
        } else {
          effectPath = getAttackEffectPath("energy", effectColor, effectVariant);
        }
      } else {
        // Default energy effect
        effectPath = getAttackEffectPath("energy", "blue", "01");
      }
      
      await playAttackEffect(effectPath, sourceToken);
      
      // Add impact effect on hit
      if (colorLower !== "white") {
        await playImpactEffect("jb2a.impact.010.blue", Array.from(game.user.targets));
      }
    }
    // === END VISUAL EFFECTS ===

    // Hit state — per-target cards (Multiple Attack Adjacent keeps the single roll & penalty)
    const isHit = colorLower !== 'white';

    // Use exactly the tokens the user targeted (no auto-adding)
    let targets = Array.from(game.user?.targets ?? []);
    const targetList = targets.length ? targets : [null];

    // Build shared chrome once
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText || this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // Shared context (same for all targets because the roll/result is shared)
    const rangeText =
      choice.prettyRange ||
      `${choice.range} area${choice.range > 1 ? "s" : ""}` +
      `${choice.rangeModifier ? ` (${choice.rangeModifier}CS)` : ""}` +
      `${choice.throughObstacle ? `, obstacle (-2CS)` : ""}`;

    const toHitLine =
      choice.usePowerToHit
        ? `To-Hit Rank: ${choice.powerRank} (Power)`
        : `To-Hit Rank: ${ability.rank} (${ability.value}) — Ability: ${ability.name}`;

    const contextHtml = `
      <div>${toHitLine}${choice.totalShift ? ` — Shift ${choice.totalShift} → ${effectiveRank}` : ""}</div>
      <div>Power: ${choice.powerName} — Damage: ${choice.powerDamage} — Rank: ${choice.powerRank}</div>
      <div>Distance: ${rangeText}</div>
      <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
    `;

    const targetingContext = getTargetingContext(actor, actionName);
    const effText = String(effectResult || "").toLowerCase();
    const isManualMode = this?.opts?.mode === "manual";

    // One message per target
    for (const target of targetList) {
      const targetActor = target?.actor;
      const targetName  = target?.name || "Unknown Target";

      const rawDamage = isHit ? (Number(choice.powerDamage) || 0) : 0;

      let afterArmor = rawDamage;
      if (isHit && rawDamage > 0 && targetActor) {
        const armorData = getBodyArmorValues(targetActor, choice.powerDamageType);
        afterArmor = Math.max(0, rawDamage - (armorData?.applicable ?? 0));
      }

      // Per-target actions (skip in manual mode)
      const { resolveCombatMode } = await import("./action-dispatcher.js");
      const actions = (!isManualMode && isHit && afterArmor > 0 && targetActor)
        ? buildActionsBox({
            showSlam: false,                                  // Energy doesn’t slam by default
            showStun: /stun|bullseye/.test(effText),
            showKill: /kill/.test(effText),
            actorUuid: actor.uuid,
            targetUuid: targetActor?.uuid,
            damage: afterArmor,
            attackForm: "energy",
            damageType: choice.powerDamageType,
            bypassArmor: false,
            autoApply: this.opts?.autoApply,
            
            autoSave: (typeof resolveCombatMode === "function" && targetActor)
              ? (resolveCombatMode(targetActor) === "full")
              : false,
          })
        : "";

      // Per-target damage summary
      const sourceLabel = `Power: ${choice.powerName} (${choice.powerRank})`;
      const damageBlock = `
        <div style="margin:6px 10px;padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff;">
          <div><b>Damage (raw):</b> ${rawDamage}</div>
          ${isHit ? `<div><b>After Armor${targetActor ? ` (${targetName})` : ``}:</b> ${afterArmor}</div>` : ``}
          <div style="font-size:.9em;color:#555;">${sourceLabel}</div>
        </div>
      `;

      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
            <strong>${actor.name} - ${actionName}</strong>
            ${targetActor ? `<br><span style="font-size:.85em;color:#555;">→ ${targetName}</span>` : ``}
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

      // Flags per target (no auto-apply trigger in flags to avoid loops)
      const msgFlags = buildDamageFlags({
        actionId: actionType,
        damageType: choice.powerDamageType,
        rawDamage,
        afterArmor,
        resultColor: colorLower,
        cappedTotal,
        targets: target ? [target] : []
      });
      if (msgFlags && msgFlags["msh-faserip"]) {
        delete msgFlags["msh-faserip"].autoApply;
        delete msgFlags["msh-faserip"].results;
        msgFlags["msh-faserip"].origin = "energy-per-target";
      }

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cardHtml,
        flags: msgFlags
      });

      // Explicit per-target apply in Full Auto
      if (!isManualMode && this.opts?.autoApply && isHit && rawDamage > 0 && targetActor) {
        await applyDamageToTargets({
          damage: rawDamage,
          attackerUuid: actor.uuid,
          damageType: choice.powerDamageType,
          showNotification: true,
          bypassArmor: false,
          attackForm: "energy",
          armorPiercing: 0,
          apMode: "value",
          wasKillResult: (colorLower === "red"),
          specificTarget: target
        });
      }

    } // end for loop for target processing

    // Play combat SFX (Energy)
    try {
      const sourceName   = choice?.powerName || "Energy Blast";
      const srcItem      = this?.opts?.item || actor.items.get?.(choice?.powerId) || null;
      const damageType   = choice?.powerDamageType || srcItem?.system?.damageType || "energy";
      const rollResult   = String(colorLower ?? "").toLowerCase();   // e.g. "white" | "green" | "yellow" | "red"
      const isHitResult  = typeof isHit === "boolean" ? isHit : rollResult !== "white";

      if (game.msh?.playCombatSFX) {
        await game.msh.playCombatSFX({
          item: srcItem,                 // enables per-power SFX (system.sfx.* or attackModes[].sfx)
          actionType: "energy",          // lets the SFX picker use mode-specific overrides
          damageType,                    // e.g. "energy-electricity" or generic "energy"
          rollResult,                    // normalized
          isHit: isHitResult,
          sourceName                     // optional, for heuristic fallback naming
        });
      }
    } catch (e) {
      console.warn("EnergyAction SFX error:", e);
    }

  } // end execute()
}