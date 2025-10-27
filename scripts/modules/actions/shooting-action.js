// scripts/modules/actions/shooting-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildMultiAttackSection,
  buildResultGrid,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetingContext,
  labelFor,
  postDeathSavePrompt,
  RANKS,
  rollWithKarmaAndHistory,
  setupMultiAttackHandlers,
  shiftRank
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
      return (s.weaponType === "shooting" || s.weaponType === "firearm" || 
              Array.isArray(s.tags) && s.tags.includes("shooting"));
    };

    const shootingWeapons = actor.items.filter(isShootingWeapon);

    // Restore flags
    const savedItemId = await actor.getFlag("msh-faserip", "lastShootingItemId") || "";
    const savedRange = await actor.getFlag("msh-faserip", "lastShootingRange") || 1;
    const savedObstacle = await actor.getFlag("msh-faserip", "lastShootingObstacle") || false;
    const savedShift = await actor.getFlag("msh-faserip", "lastShootingShift") || 0;
    const savedMultiAttacks = await actor.getFlag("msh-faserip", "lastShootingMultiAttacks") || false;
    const savedAttackCount = await actor.getFlag("msh-faserip", "lastShootingAttackCount") || 2;

    const itemOptions = shootingWeapons.map(i =>
      `<option value="${i.id}" ${i.id === savedItemId ? 'selected' : ''}>${i.name}</option>`
    ).join("");

    if (!itemOptions) {
      ui.notifications.warn(`${actor.name} has no shooting weapons.`);
      return;
    }

    // Get initial weapon for range display
    const initialWeapon = shootingWeapons.find(i => i.id === savedItemId) || shootingWeapons[0];
    const initialRange = initialWeapon?.system?.range || 15;

    // Dialog HTML
    const dialogHtml = `
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Action:</label><strong>${actionName}</strong></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Ability:</label><input type="text" value="${ability.name}" style="width:140px;" readonly></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Rank:</label><input type="text" value="${ability.rank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${ability.value})</span></div>

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Column Shift:</label>
        <input type="number" name="shift" value="${savedShift}" style="width:52px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span></div>

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Karma Points:</label>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:52px;"></div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Weapon:</label>
        <select name="weapon" style="min-width:220px;">${itemOptions}</select>
      </div>

      ${this._buildRangeInputs({ 
        defaultRange: savedRange, 
        showObstacle: true, 
        weaponMaxRange: initialRange 
      })}

      ${buildMultiAttackSection("shooting", game.user.targets.size, savedMultiAttacks, savedAttackCount, false)}

      <div style="margin-top:10px;padding:6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:0.85em;">
        <strong>⚠ Shooting Attack Rules:</strong>
        <ul style="margin:4px 0 0 0;padding-left:20px;">
          <li>Cannot reduce effect or damage (no pulled punches)</li>
          <li>Bullseye: targets &lt;1 ft, never fatal</li>
          <li>Kill result may be lethal (hero loses all Karma if kills)</li>
        </ul>
      </div>

      <div style="margin-top:8px;">
        <label><input type="checkbox" name="remember" checked> Remember these settings</label>
      </div>
      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
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
              const weaponId = String($('[name="weapon"]').val() || "");
              const weapon = shootingWeapons.find(i => i.id === weaponId);
              
              if (!weapon) {
                ui.notifications.error("No weapon selected!");
                return resolve(null);
              }

              const shift = Number($('[name="shift"]').val() || 0);
              const karma = Number($('[name="karma"]').val() || 0);
              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');
              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

              const multiAttacks = !!$('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt($('[name="attackCount"]:checked').val() || 2);

              await actor.setFlag("msh-faserip", "lastShootingShift", shift);
              await actor.setFlag("msh-faserip", "lastShootingMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastShootingAttackCount", attackCount);

              const weaponRange = weapon.system?.range || 15;
              const weaponDamage = weapon.system?.damage || 0;

              // Check if shot is possible
              const { totalShift, impossible, rangeModifier, obstacleModifier } = 
                this._applyRangeModifiers(shift, range, throughObstacle, weaponRange);

              const finalShift = totalShift + movementModifier; // Add movement modifier

              if (impossible) {
                ui.notifications.error(`Target is beyond weapon range (${weaponRange} areas)!`);
                return resolve(null);
              }

              if (remember) {
                await actor.setFlag("msh-faserip", "lastShootingItemId", weaponId);
                await actor.setFlag("msh-faserip", "lastShootingRange", range);
                await actor.setFlag("msh-faserip", "lastShootingObstacle", throughObstacle);
              }

              resolve({ 
                weapon, 
                weaponDamage, 
                weaponRange, 
                shift, 
                karma, 
                range, 
                throughObstacle, 
                skipDice,
                totalShift: finalShift,
                rangeModifier,
                obstacleModifier,
                targetMovement,
                movementModifier,
                multiAttacks,
                attackCount
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
            // Setup range preview updates
            this._setupRangePreview(html, { weaponMaxRange: initialRange });

            // Update range preview when weapon changes
            html.find('[name="weapon"]').on('change', () => {
                const weaponId = html.find('[name="weapon"]').val();
                const weapon = shootingWeapons.find(i => i.id === weaponId);
                const newRange = weapon?.system?.range || 15;
                
                // Update the max range hint text in the UI
                html.find('[name="range"]').siblings('span').text(`Max: ${newRange} areas`);
                
                // Refresh the range preview with new weapon range
                this._setupRangePreview(html, { weaponMaxRange: newRange });
            });

            // Attach auto-fill to update range from token-to-target distance
            this._disposeAutoFill = attachAutoFillRange(html, actor, () => {
                const weaponId = html.find('[name="weapon"]').val();
                const weapon = shootingWeapons.find(i => i.id === weaponId);
                const currentRange = weapon?.system?.range || 15;
                this._setupRangePreview(html, { weaponMaxRange: currentRange });
            });

             setupMultiAttackHandlers(html);
            },
            close: () => {
             
              // Clean up the auto-fill event listeners
              if (this._disposeAutoFill) this._disposeAutoFill();
              }
      }).render(true);
    });

    if (!choice) return;

    // Handle multi-attacks (2 or 3 attacks, must make FEAT; all attacks @-1 CS)
    let actualAttackCount = 1;
    if (choice.multiAttacks) {
      const fightingAbility = getAbilityInfo(actor, "fighting");
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";
      
      // Calculate effective Fighting rank with column shift
      const effectiveFightingRank = shiftRank(fightingAbility.rank, choice.shift || 0);
      
      const featResult = await this._rollFightingFeat(
        actor, 
        { ...fightingAbility, rank: effectiveFightingRank }, 
        intensity, 
        choice.attackCount
      );
      if (featResult.cancelled) return;
      
      if (!featResult.success) {
        // Failed FEAT: 1 attack at -3CS
        choice.totalShift = (choice.totalShift || 0) - 3;
        actualAttackCount = 1;
      } else {
        // Success: Multiple attacks at -1CS each
        choice.totalShift = (choice.totalShift || 0) - 1;
        actualAttackCount = choice.attackCount;
      }
    }

    // Execute attack(s)
for (let i = 1; i <= actualAttackCount; i++) {
  if (i > 1) {
    // Small delay between attacks for visual clarity
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
  await this._executeSingleAttack(choice, actionLabel, ability, effects, actionType);
}

// Multi-attack completion message
if (actualAttackCount > 1) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
      <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
      <div style="font-size:0.9em;">${actor.name} completed ${actualAttackCount} attacks.</div>
    </div>`
  });
}
  } // <-- CLOSE execute()

  async _executeSingleAttack(choice, actionLabel, ability, effects, actionType) {
    const actor = this.actor;
    // Effective rank after all modifiers
    const effectiveRank = shiftRank(ability.rank, choice.totalShift);

    // Roll
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} performs ${actionLabel}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionLabel, choice.karma, roll);

    // Resolve color/effects
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effectResult = effects[colorLower] || color;

    // Build grid & banner
    const grid = buildResultGrid(
      actionType,
      colorLower,
      effects,
      (globalThis._getResultHoverText || this._getResultHoverText)
    );
    const { bg, fg } = bannerColors(colorLower);

    // Hit state (define BEFORE using it anywhere)
    const isHit = colorLower !== "white";

    // Damage type from weapon if available; fallback to shooting physical
    const dmgType = choice.weapon?.system?.damageType || "physical-shooting";

    // Raw damage (only matters on a hit)
    const rawDamage = isHit ? Number(choice.weaponDamage || 0) : 0;

    // Compute after-armor using the shared helper
    const { afterArmor, targetName, multiTargetCount, targetsArray } = computeAfterArmor({
      isHit,
      rawDamage,
      damageType: dmgType,
      targets: game.user?.targets,
      getArmorFn: (actor, dt) => getBodyArmorValues(actor, dt)
    });

    // ——— Semi-auto preview (only when requested by dispatcher) ———
    if (this?.opts?.showConfirm && this?.opts?.autoApply === false) {
      const tgtList = targetsArray?.length
        ? `<ul style="margin:6px 0 0 18px;">${targetsArray.map(t => `<li>${t?.name ?? "Target"}</li>`).join("")}</ul>`
        : "<div style='margin-top:4px;color:#666;'>No targets selected.</div>";

      const previewHtml = `
        <div style="font-family:var(--font-primary);line-height:1.3;">
          <div style="font-weight:600;margin-bottom:6px;">${actor.name} — ${actionLabel}</div>
          <div style="display:grid;grid-template-columns:140px 1fr;gap:6px;">
            <div style="color:#666;">Roll total</div><div>${roll.total}</div>
            <div style="color:#666;">Result color</div><div style="text-transform:capitalize;">${colorLower}</div>
            <div style="color:#666;">Raw damage</div><div>${rawDamage}</div>
            <div style="color:#666;">After armor</div><div>${afterArmor}${multiTargetCount > 1 ? " (varies)" : ""}</div>
            <div style="color:#666;">Targets</div>
            <div>${targetName || (multiTargetCount ? `${multiTargetCount} targets` : "—")}${tgtList}</div>
          </div>
          <div style="margin-top:8px;color:#666;font-size:.9em;">
            Confirm to post the action card and proceed. You can still click “Apply damage” from the chat card.
          </div>
        </div>
      `;

      const content = await renderTemplate("templates/hud/dialog.html", {
        title: `${actor.name} — ${actionLabel}`,
        body: previewHtml,     // many of your templates accept body/content
        content: previewHtml
      });

      const confirmed = await Dialog.confirm({
        title: "Preview — Shooting",
        content,
        yes: () => true,
        no: () => false,
        defaultYes: true,
        classes: ["msh-dialog", "compact", "faserip-dialog"],
        width: 420
      });

      debugLog("Shooting preview", {
        confirmed, rollTotal: roll.total, color: colorLower, rawDamage, afterArmor,
        targets: targetsArray?.map(t => t?.name)
      });

      if (!confirmed) return; // cancel this single attack cleanly

      // Fire SFX after confirm (refactor mode only)
      if (game.msh?.getCombatModeFor?.() !== "classic") {
        await game.msh.playCombatSFX?.(
          (this?.opts?.damageType || "shooting"),
          (this?.item?.name || "weapon"),
          (String(colorLower || "")).toLowerCase(),
          {
            item: this?.item,
            actionType: "shooting",
            ammoType:
              (this?.item?.system?.variantType && this.item.system.variantType !== "standard")
                ? this.item.system.variantType
                : (this?.item?.system?.specialAmmo?.explosive ? "explosive"
                : "standard")
          }
        );
      }
    }
    // ——— End preview gate ———

    // Calculate penetrating damage for action chips
    let penetratingDamage = afterArmor;

    // Standardized damage block
    const sourceLabel = `Weapon: ${choice.weapon.name} (Range ${choice.weaponRange}, Damage ${choice.weaponDamage})`;
    const damageBlock = makeDamageBlock({
      isHit,
      rawDamage,
      afterArmor,
      sourceLabel,
      targetName,
      multiTargetCount
    });

    // Action chips
    const chip = (label, title, enabled, dataAttrs = "") => {
      const base = "display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;";
      const style = enabled
        ? `${base}background:#fff;color:#333;cursor:pointer;`
        : `${base}background:#f7f7f7;color:#333;cursor:not-allowed;opacity:.55;filter:grayscale(.3);`;
      const key = label.toLowerCase().replace(/\s+/g, '-');
      return `<a class="faserip-chip" data-action="${key}" ${dataAttrs} ${enabled ? "" : 'aria-disabled="true"'} title="${title}" style="${style}">${label}</a>`;
    };

    const parts = [];

    // Only show Apply Damage on hits - pass raw damage, let handler calculate armor
    // Skip button in auto mode since damage applies automatically
    if (isHit && rawDamage > 0 && !this.opts?.autoApply) {
      parts.push(chip(
        "Apply Damage",
        "Apply damage to targeted/selected token(s)",
        true,
        `data-damage="${rawDamage}" data-attacker-uuid="${actor.uuid}" data-damage-type="${dmgType}" data-bypass-armor="false"`
      ));
    }

    // Bullseye details (yellow)
    if (colorLower === "yellow") {
      parts.push(chip("Bullseye Details", "Describe what specific part was targeted.", false));
    }

    // Kill check (red) - only if damage penetrates
    if (colorLower === "red" && canEffectsApply(penetratingDamage)) {
      parts.push(chip(
        "Resolve Kill",
        "Open Kill Check dialog",
        true,
        `data-check="kill" data-attack-form="shooting" data-damage-type="${dmgType}" data-dmg="${penetratingDamage}" data-attacker-uuid="${actor.uuid}"`
      ));
    }

    const actionsHtml = `
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
        ${parts.join("\n")}
      </div>
      <div style="padding:0 10px 8px;font-size:.8em;color:#d32f2f;">⚠ Shooting attacks cannot be reduced in effect or damage.</div>
    `;

    // Range/targeting context
    const targetingContext = getTargetingContext(actor, actionLabel);

    // Final chat card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - ${actionLabel}</strong>
        </div>
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div>Ability: ${ability.name}</div>
          <div>Base Rank: ${ability.rank} (${ability.value})</div>
          <div>Weapon: ${choice.weapon.name} (Range: ${choice.weaponRange} areas, Damage: ${choice.weaponDamage})</div>
          <div>Distance: ${choice.range} area${choice.range > 1 ? 's' : ''} ${choice.rangeModifier ? `(${choice.rangeModifier}CS)` : ''}${choice.throughObstacle ? `, obstacle (-2CS)` : ""}${choice.movementModifier ? `, target movement (${choice.movementModifier > 0 ? '+' : ''}${choice.movementModifier}CS)` : ""}</div>
          ${choice.totalShift !== 0 ? `<div>Effective Rank: ${effectiveRank} (${choice.totalShift > 0 ? '+' : ''}${choice.totalShift}CS total)</div>` : ""}
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
        </div>
        ${damageBlock}
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${actionsHtml}
      </div>
    `;

    // Create chat with standardized flags
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
        attackForm: "shooting",
        armorPiercing: 0
      });
    }
    // === END AUTO-APPLY ===

    // Play combat SFX (if not already played after preview)
    const sourceName = choice.weapon.name || "Firearm";
    // In semi-auto with confirmation, SFX already played at line 370
    // In all other cases (auto/full/classic), play SFX now
    const alreadyPlayed = (this.opts?.showConfirm && this.opts?.autoApply === false);
    if (game.msh?.playCombatSFX && !alreadyPlayed) {
      await game.msh.playCombatSFX(dmgType, sourceName, colorLower);
    }
  }
}