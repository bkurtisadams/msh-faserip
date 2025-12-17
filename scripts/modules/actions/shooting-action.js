// scripts/modules/actions/shooting-action.js
import { RangedAttackAction } from "./ranged-attack-action.js";
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
  applyCapabilitiesToDialog,
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
      const damageType = String(s.damageType || "").toUpperCase();
      return (s.weaponType === "shooting" || s.weaponType === "firearm" || 
              damageType === "S" ||
              Array.isArray(s.tags) && s.tags.includes("shooting"));
    };

    let shootingWeapons = actor.items.filter(isShootingWeapon);

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      // Add to list if not already present
      if (!shootingWeapons.find(i => i.id === passedItem.id)) {
        shootingWeapons = [passedItem, ...shootingWeapons];
      }
    }

    // Restore flags (but override with passed item if present)
    const savedItemId = passedItemId || await actor.getFlag("msh-faserip", "lastShootingItemId") || "";
    const savedRange = await actor.getFlag("msh-faserip", "lastShootingRange") || 1;
    const savedObstacle = await actor.getFlag("msh-faserip", "lastShootingObstacle") || false;
    const savedShift = await actor.getFlag("msh-faserip", "lastShootingShift") || 0;
    const savedMultiAttacks = await actor.getFlag("msh-faserip", "lastShootingMultiAttacks") || false;
    const savedAttackCount = await actor.getFlag("msh-faserip", "lastShootingAttackCount") || 2;
    const savedRemember = await actor.getFlag("msh-faserip", "lastShootingRemember") ?? true;
    const savedSkipDice = await actor.getFlag("msh-faserip", "lastShootingSkipDice") ?? false;

    const itemOptions = shootingWeapons.map(i =>
      `<option value="${i.id}" ${i.id === savedItemId ? 'selected' : ''}>${i.name}</option>`
    ).join("");

    // If no shooting weapons, try to detect a non-shooting source item and reroute
    if (!itemOptions) {
      const src = this?.opts?.sourceItem || this?.opts?.equipment || null;

      if (src?.type === "equipment" && src.system?.category === "weapon") {
        const w  = String(src.system.weaponType || "").toLowerCase();
        const dt = String(src.system.damageType || "").toUpperCase();

        // Minimal mapping that mirrors your action names/codes
        const fallbackAction =
          w === "thrown" ? (dt.startsWith("E") ? "Throwing Edged (TE)" : "Throwing Blunt (TB)") :
          w === "melee"  ? (dt.startsWith("E") ? "Edged Attack (EA)"   : "Blunt Attack (BA)") :
          null;

        if (fallbackAction) {
          const roller = (globalThis.FaseripRolls?.rollEquipment ?? game.msh?.rollEquipment);
          if (typeof roller === "function") {
            return roller(actor, src, {
              useDirectRoll: true,
              actionType:    fallbackAction,
              columnShift:   Number(this?.opts?.shift ?? 0),
              karma:         Number(this?.opts?.karma ?? 0),
              skipDice:      !!this?.opts?.skipDice,
              suppressWarnings: true
            });
          }
        }
      }

      // Only warn if we truly have no weapon to act with and no source item fallback
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

      ${generateKarmaControlsHTML(actor, 0)}

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
        <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember these settings</label>
      </div>
      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice animation</label>
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
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;
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

              // Always save remember/skipDice preferences
              await actor.setFlag("msh-faserip", "lastShootingRemember", remember);
              await actor.setFlag("msh-faserip", "lastShootingSkipDice", skipDice);

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
                spendKarma,
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
          setupKarmaControlHandlers(html);
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
            applyCapabilitiesToDialog(html, "shooting", { actor });  // new
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
        choice.shift = (choice.shift || 0) - 3;
        choice.totalShift = (choice.totalShift || 0) - 3;
        actualAttackCount = 1;
      } else {
        // Success: Multiple attacks at -1CS each
        choice.shift = (choice.shift || 0) - 1;
        choice.totalShift = (choice.totalShift || 0) - 1;
        actualAttackCount = choice.attackCount;
      }
    }

    // Execute attack(s)
    const targets = Array.from(game.user?.targets ?? []);
    for (let i = 1; i <= actualAttackCount; i++) {
      if (i > 1) await new Promise(resolve => setTimeout(resolve, 500));
      
      const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
      
      // For failed FEAT (actualAttackCount=1), only attack first target
      const targetForThisAttack = actualAttackCount === 1 ? targets[0] : targets[(i-1) % targets.length];
      
      await this._executeSingleAttack({
        choice: { ...choice, specificTarget: targetForThisAttack },  // Force specific target
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