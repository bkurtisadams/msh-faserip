// scripts/modules/actions/throwing-edged-action.js v1.2.0 - 2026-02-25
// v1.2.0: Rebuild chat card using unified card builder utilities (inline badge, hover roll, standard layout)
import { RangedAttackAction } from "./ranged-attack-action.js";
import { attachAutoFillRange } from "./action-utils.js";
// NOTE: resolveCombatMode imported dynamically if needed
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
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
  applyDamageToTargets
} from "./action-utils.js";
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

    // Dialog HTML
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
        <input type="number" name="shift" value="${Number(this.opts.shift ?? savedShift)}" style="width:60px;">
      </div>

      ${generateKarmaControlsHTML(actor, 0)}

      <fieldset style="margin:10px 0;padding:8px;border:1px solid #ddd;border-radius:4px;background:#fafafa;">
        <legend style="padding:0 6px;font-weight:bold;">Weapon Source</legend>

        <div style="margin:4px 0;">
          <input type="checkbox" id="adhoc-toggle" name="adhoc" ${(savedAdHoc === true || thrownEdged.length === 0) ? "checked" : ""}>
          <label for="adhoc-toggle">Use weapon of opportunity (ad-hoc)</label>
        </div>

        <div class="adhoc-fields" style="margin-top:8px;${savedAdHoc || (!thrownEdged.length) ? "" : "display:none"}">
          <div style="margin-bottom:6px;">
            <span style="display:inline-block;width:110px;">Name:</span>
            <input type="text" name="adhocName" value="${savedAdHocNm}" style="width:220px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">e.g., “Broken Bottle”</span>
          </div>
          <div>
            <span style="display:inline-block;width:110px;">Damage:</span>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:80px;">
            <span style="font-size:0.85em;color:#666;margin-left:6px;">numeric damage</span>
          </div>
        </div>

        <div class="carried-fields" style="margin-top:8px;${savedAdHoc || (!thrownEdged.length) ? "display:none" : ""}">
          <div style="margin-bottom:6px;">
            <span style="display:inline-block;width:110px;">Weapon:</span>
            <select name="weapon" style="min-width:220px">
              ${itemOptions || '<option value="">(none in inventory)</option>'}
            </select>
          </div>
          <div>
            <span style="display:inline-block;width:110px;">Armor Piercing:</span>
            <input type="text" name="apDisplay" value="0" style="width:80px;" readonly>
          </div>
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
        <input type="checkbox" id="rememberSettings" name="rememberSettings" ${savedRemember ? 'checked' : ''}>
        <label for="rememberSettings">Remember settings</label>
        <input type="checkbox" id="skipDiceRoll" name="skipDiceRoll" ${savedSkipDice ? 'checked' : ''} style="margin-left:12px;">
        <label for="skipDiceRoll">Skip dice animation</label>
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

              const remember = $(`[name="rememberSettings"]`).length ? !!$(`[name="rememberSettings"]`).is(':checked') : !!$(`[name="remember"]`).is(':checked');
              const skipDice = $(`[name="skipDiceRoll"]`).length ? !!$(`[name="skipDiceRoll"]`).is(':checked') : !!$(`[name="skipDice"]`).is(':checked');

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
          setupKarmaControlHandlers(html);
          this.opts = this.opts || {};  // Ensure opts exists
          await setupModeSelector(actor, html, this.opts, "lastEdgedMode");

          const $adhoc = html.find("#adhoc-toggle");
          const $weapon = html.find('[name="weapon"]');
          const applyToggle = () => {
            const on = $adhoc.is(":checked");
            html.find(".adhoc-fields").css("display", on ? "" : "none");
            html.find(".carried-fields").css("display", on ? "none" : "");
            this._setupRangePreview(html, { strengthRank: strRank });

            // If switching OFF ad-hoc and a weapon exists, update AP display
            if (!on) {
              const wid = String($weapon.val() || "");
              const weapon = thrownEdged.find(i => i.id === wid);
              const ap = weapon ? getArmorPiercing(weapon) : 0;
              html.find('[name="apDisplay"]').val(String(ap));
            }
          };

          // If user selects a carried weapon, auto-turn OFF ad-hoc and sync AP
          $weapon.on("change", () => {
            if ($adhoc.is(":checked")) $adhoc.prop("checked", false);
            const wid = String($weapon.val() || "");
            const weapon = thrownEdged.find(i => i.id === wid);
            const ap = weapon ? getArmorPiercing(weapon) : 0;
            html.find('[name="apDisplay"]').val(String(ap));
            applyToggle();
          });

          $adhoc.on("change", applyToggle);
          applyToggle();

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
    this.opts.mode = await actor.getFlag("msh-faserip", "lastEdgedMode") || "semi";
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
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} performs ${actionName}`
      });
    }

    const { cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, { spendKarma: choice.spendKarma, rank: effectiveRank });
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    const isHit = colorLower !== 'white';
    const targets = Array.from(game.user?.targets ?? []);
    const primaryTarget = targets[0] ?? null;
    const targetName = primaryTarget?.name || "";

    const actions = buildActionsBox({
      showStun: colorLower === "yellow",
      showKill: colorLower === "red",
      actorUuid: actor.uuid,
      damage: isHit ? choice.weaponDamage : 0,
      attackForm: "edged",
      damageType: (choice.damageType || "physical-edged"),
      armorPiercing: Number(choice.armorPiercing || 0),
      armorPiercingCS: Number(choice.armorPiercingCS || 0),
      apMode: choice.apMode || "value",
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

    // Damage section (no per-target armor calc — thrown edged bypasses to downstream)
    const apNote = Number(choice.armorPiercing || 0) ? ` <span style="color:#1565c0;font-size:.85em;">(AP ${choice.armorPiercing})</span>` : "";
    const damageHtml = isHit
      ? buildContentBox(`<strong>Damage:</strong> <span title="Weapon: ${choice.weaponName}" style="cursor:help;">${choice.weaponDamage}</span>${apNote}`)
      : buildContentBox(`<strong>Damage:</strong> 0 (miss)`);

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