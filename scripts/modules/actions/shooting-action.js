// scripts/modules/actions/shooting-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildMultiAttackSection,
  buildModeSelector,
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
  setupModeSelector,
  setupMultiAttackHandlers,
  shiftRank
} from "./action-utils.js";
import { shouldConfirm, buildPreviewHtml } from "./action-utils.js";

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
      ${buildModeSelector({ mode: "semi" })}

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
        render: async (html) => {
          this.opts = this.opts || {};  // Ensure opts exists
          await setupModeSelector(actor, html, this.opts || {}, "lastShootingMode");

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

    // Reload mode from flags (user may have changed it in dialog)
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
  await this._executeSingleAttack({
      choice,
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
      targetCount: 1
    });
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
}