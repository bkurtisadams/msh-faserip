// scripts/modules/actions/force-action.js v1.4.0 - 2025-12-28
// v1.4.0: Fix CS persistence - decouple from global rememberSettings, treat opts.shift=0 as "not set"
// v1.3.9: Fix usePowerToHit default - only true if explicitly saved as true (was defaulting to true)
// v1.3.8: Fix CS hover text format to match attack-action.js (e.g., "+2 Stunned" not "Stunned (target): +2")
// v1.3.7: Add effect modifier system - read target status (Stunned +2CS, etc) from active effects
// v1.3.6: Add CS breakdown tooltip showing Manual/Range/Obstacle/Movement/Adjacent components
// v1.3.5: Fix regex to use word boundaries - prevents false matches like "flight" on "light"
// v1.3.4: Respect isForceAttack flag; skip if other action flags explicitly set
// v1.3.3: Fix power filter - exclude energy-type powers, remove generic distanceattacks match
// v1.3.2: Fix bannerColors - call as function not object for proper result badge colors
// v1.3.1: Fix colorLower temporal dead zone error (remove duplicate const in loop)
// v1.3.0: Match blunt/energy chat card style with inline rolls, hover boxes, collapsible Stun
// v1.2.1: Fix specificTarget bug - pass targets as array to applyDamageToTargets
// v1.2.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.1.0: Add inline rolls for consolidated chat cards
import { RangedAttackAction } from "./ranged-attack-action.js";
// NOTE: resolveCombatMode imported dynamically to avoid circular dependency
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma
} from "../dice/dice-roller.js";

import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildCollapsibleStunSection,
  buildMultiAttackSection,
  buildResultGrid,
  buildModeSelector,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getStrengthInfo,
  getTargetData,
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
  getAttackEffectPath,
  buildInlineRollDisplay,
  showDiceAnimation
} from "./action-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown, canActorAct } from "../effects/effect-modifiers.js";

export class ForceAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "force";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    // Default to Agility unless user opts for power rank to-hit
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // === Candidate powers (schema-aware based on itemSheet.js) ===
    let forceItems = actor.items.filter((i) => {
      if (i.type !== "power") return false;
      const s = i.system || {};
      const cat = String(s.category || "").toLowerCase();
      const typ = String(s.type || "").toLowerCase();
      const nam = String(i.name || "").toLowerCase();

      // Explicit flag takes priority
      if (s.isForceAttack === true) return true;
      
      // If any other action type flag is explicitly set, don't auto-include
      if (s.isEnergyAttack || s.isBluntAttack || s.isEdgedAttack || s.isShootingAttack || s.isMentalAttack) {
        return false;
      }
      
      // Exclude energy-type powers (they belong in Energy Attack)
      // Use word boundaries to avoid false matches (e.g., "flight" shouldn't match "light")
      const looksEnergy = /\b(energy|light|electric|plasma|beam|fire|ice|cold|sound|darkforce|radiation|heat|lightning)\b/.test(typ) ||
                          /\b(energy|light|electric|plasma|beam|fire|ice|cold|sound|darkforce|radiation|heat|lightning)\b/.test(nam);
      if (looksEnergy) return false;

      // Force-specific categories
      const catLooksForce =
        cat === "mattercontrol" ||
        /\b(force|telekinesis|kinetic|concussion|shockwave)\b/.test(cat);

      // Force-specific types
      const typeLooksForce =
        /\b(force|telekinesis|kinetic|pressure|concussion|shockwave|ram|air|wind|earth|water|magnetic|gravity)\b/.test(typ);

      return catLooksForce || typeLooksForce;
    });

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "power") {
      // Add to list if not already present
      if (!forceItems.find(i => i.id === passedItem.id)) {
        forceItems = [passedItem, ...forceItems];
      }
    }

    // === Restore prefs (but override with passed item if present) ===
    const savedItemId    = passedItemId || await actor.getFlag("msh-faserip", "lastForceItemId") || "";
    const savedRange     = await actor.getFlag("msh-faserip", "lastForceRange") || 1;
    const savedObstacle  = await actor.getFlag("msh-faserip", "lastForceObstacle") || false;
    // If a specific item was passed, don't use ad-hoc mode
    const savedAdHoc     = passedItem ? false : (await actor.getFlag("msh-faserip", "lastForceAdHoc") || (!forceItems.length));
    const savedAdHocName = await actor.getFlag("msh-faserip", "lastForceAdHocName") || "Force Blast";
    const savedAdHocDmg  = Number(await actor.getFlag("msh-faserip", "lastForceAdHocDamage") || 15);
    const savedAdHocRank = await actor.getFlag("msh-faserip", "lastForceAdHocRank") || "Remarkable";
    const savedUsePowerToHit = await actor.getFlag("msh-faserip", "lastForceUsePowerToHit");
    const defaultUsePowerToHit = savedUsePowerToHit === true; // Only true if explicitly saved as true

    // FIX: Decouple from global "rememberSettings" to avoid cross-action contamination.
    // We default to false so persistence is opt-in or strictly follows the specific flag.
    const savedRemember = (await actor.getFlag("msh-faserip", "lastForceRemember")) ?? false;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "lastForceSkipDice")) ?? false;
    
    // Only load saved shift if Remember was explicitly checked last time
    const savedShiftRaw = await actor.getFlag("msh-faserip", "lastForceShift") ?? 0;
    const savedShift = savedRemember ? savedShiftRaw : 0;
    // Multi-attack must default OFF unless Remember Settings is enabled
    const savedMultiAdjacent = savedRemember ? ((await actor.getFlag("msh-faserip", "lastForceMultiAdjacent")) || false) : false;

    // Build power radio options (inline style like EnergyAction)
    const powerRadios = forceItems.map((item, idx) => {
      const isSelected = item.id === savedItemId || (!savedItemId && idx === 0);
      const shortName = item.name.length > 14 ? item.name.substring(0, 12) + "…" : item.name;
      return `<label title="${item.name}" style="cursor:pointer;white-space:nowrap;"><input type="radio" name="powerSelect" value="${item.id}" ${isSelected && !savedAdHoc ? 'checked' : ''}> ${shortName}</label>`;
    }).join(' ');

    // === Target Info (for armor preview) ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();

    // Initial power info for preview
    const initialPower = forceItems.find(i => i.id === savedItemId) || forceItems[0];
    const initialPowerRank = savedAdHoc
      ? savedAdHocRank
      : (initialPower?.system?.rank ?? initialPower?.system?.powerRank ?? "Remarkable");
    const initialDamage = savedAdHoc
      ? savedAdHocDmg
      : Number(initialPower?.system?.damage ?? initialPower?.system?.value ?? 0);
    const initialDamageType = savedAdHoc
      ? "physical-force"
      : "physical-force";

    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, initialDamageType) : null;
    const initialArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st target)" : "";
    const initialAfterArmor = Math.max(0, initialDamage - initialArmor);

    // Determine which rank to display initially based on usePowerToHit setting
    const initialDisplayRank = defaultUsePowerToHit ? initialPowerRank : ability.rank;

    // Karma info for compact display
    const availableKarma = getAvailableKarma(actor);
    const hasKarma = availableKarma > 0;
    const minKarma = 10;

    // Compute dialog shift - treat opts.shift=0 as "not set" so saved values are used
    const optsShift = this.opts?.shift;
    const dialogShift = (optsShift !== undefined && optsShift !== null && optsShift !== 0) 
      ? optsShift 
      : savedShift;

    // === Dialog ===
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target${targets.length > 1 ? 's' : ''}</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay}</div>
          <div style="color:#666;" id="target-armor-display">${primaryTargetActor ? (initialArmor > 0 ? `Armor: ${initialArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}${armorNote}` : 'No armor') : ''}</div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Attack</div>
          <div style="font-weight:600;">${ability.name}: ${ability.rank}</div>
          <div style="color:#666;">Rank Value: ${ability.value}</div>
          <div style="margin-top:4px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;font-size:.9em;">
              <input type="checkbox" id="usePowerToHit" name="usePowerToHit" ${defaultUsePowerToHit ? "checked" : ""}>
              <span>Use power rank to hit</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Power Selection (inline radios like Energy) -->
      <div class="power-section" style="padding:8px;background:${savedAdHoc ? '#fff8e1' : '#fff'};border:1px solid ${savedAdHoc ? '#ffc107' : '#ddd'};border-radius:3px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
          ${powerRadios}
          <label style="cursor:pointer;white-space:nowrap;margin-left:8px;"><input type="radio" name="powerSelect" value="adhoc" ${savedAdHoc ? 'checked' : ''}> Ad-hoc</label>
          <span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:#2196F3;color:#fff;font-size:11px;font-weight:bold;cursor:help;margin-left:4px;" title="FORCE ATTACK RULES:
• Damage = power damage/value (or ad-hoc damage)
• Range = power rank areas
• Slam/Stun/Kill follow Universal Table
• Body Armor applies per damage type">?</span>
        </div>

        <div id="adhoc-row" style="display:${savedAdHoc ? 'block' : 'none'};margin-top:6px;">
          <div style="display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;gap:4px 8px;align-items:center;">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocName}" style="padding:4px;">
            <label>Dmg:</label>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:50px;padding:4px;">
            <label>Rank:</label>
            <input type="text" name="adhocRank" value="${savedAdHocRank}" style="width:80px;padding:4px;" placeholder="Remarkable">
          </div>
        </div>
      </div>

      <!-- Damage Preview -->
      <div id="preview" style="background:#ffebee;border:1px solid #ef9a9a;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialDamage}</span> <span id="dmg-note" style="color:#555;">(${savedAdHoc ? 'Ad-hoc' : (initialPower?.name || 'Power')})</span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>→ ${initialAfterArmor} after armor</strong></span>
        </div>
      </div>

      <!-- Modifiers Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${dialogShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : dialogShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${Number(dialogShift)}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${dialogShift < 0 ? 'color:#c62828;' : dialogShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(initialDisplayRank, dialogShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${dialogShift !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
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
        <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., range -1CS, talent +1CS" value="" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
      </div>

      <!-- Multi-Attack Row -->
      <div class="multi-attack-section" style="padding:6px 8px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;color:#2e7d32;">Multi:</span>
          <label title="Single attack, no penalty" style="cursor:pointer;"><input type="radio" name="multiMode" value="off" ${!savedMultiAdjacent ? 'checked' : ''}> Off</label>
          <label title="-4CS penalty, hits all adjacent targets with single roll." style="cursor:pointer;"><input type="radio" name="multiMode" value="adjacent" ${savedMultiAdjacent ? 'checked' : ''}> Adjacent</label>
        </div>
      </div>

      <!-- Range Row -->
      <div class="range-section" style="padding:6px 8px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="font-weight:600;">Range:</label>
          <input type="number" name="range" value="${savedRange}" min="0" style="width:40px;padding:3px;text-align:center;">
          <span style="color:#666;">areas</span>
          <label style="cursor:pointer;margin-left:8px;"><input type="checkbox" name="throughObstacle" ${savedObstacle ? 'checked' : ''}> Obstacle (-2CS)</label>
          <span style="color:#666;margin-left:auto;font-size:.85em;" id="range-hint"></span>
        </div>
        <div style="margin-top:4px;">
          <label style="font-weight:600;margin-right:6px;">Target:</label>
          <select name="targetMovement" style="padding:3px;">
            <option value="0">Standing</option>
            <option value="0-charging">Charging attacker</option>
            <option value="-1">Moving (−1CS)</option>
            <option value="-2">Running (−2CS)</option>
            <option value="-3">Dodging (−3CS)</option>
          </select>
        </div>
      </div>

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

              // Get selected power from radio buttons
              const selectedPower = $('[name="powerSelect"]:checked').val();
              const useAdHoc = selectedPower === "adhoc";

              let powerName = "", powerDamage = 0, powerRank = "Remarkable", powerId = null, prettyRange = "";
              let powerDamageType = "physical-force"; // Force default

              if (useAdHoc) {
                powerName = String($('[name="adhocName"]').val() || "Force Blast");
                powerDamage = Number($('[name="adhocDamage"]').val() || 0);
                powerRank = String($('[name="adhocRank"]').val() || "Remarkable");
                powerDamageType = "physical-force";
                if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc force.");
                  return resolve(null);
                }
              } else {
                const wid = String(selectedPower || "");
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
                powerDamageType = "physical-force";
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

              const multiAdjacent = (String($('[name="multiMode"]:checked').val() || "off") === "adjacent");

              // Guard: if multiple targets are selected, user must enable Adjacent multi-attack
              const targetTokens = Array.from(game.user?.targets ?? []);
              if (targetTokens.length > 1 && !multiAdjacent) {
                ui.notifications.warn("Multiple targets selected. Enable Adjacent Multi-Attack or reduce to one target.");
                return resolve(null);
              }

              // Always save remember/skipDice preferences to force-specific flags only
              await actor.setFlag("msh-faserip", "lastForceRemember", remember);
              await actor.setFlag("msh-faserip", "lastForceSkipDice", skipDice);
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
                shift, karma, spendKarma, range, throughObstacle, skipDice, usePowerToHit,
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
          setupKarmaControlHandlers(html);
          await setupModeSelector(actor, html, this.opts || {}, "lastForceMode");

          // Update function for damage preview and CS highlighting (Energy-style)
          const update = () => {
            const selectedPower = html.find('[name="powerSelect"]:checked').val();
            const isAdHoc = selectedPower === "adhoc";
            const $adhocRow = html.find('#adhoc-row');
            const $val = html.find('#dmg-val');
            const $note = html.find('#dmg-note');
            const $afterArmor = html.find('#after-armor-display');
            const $armorLine = html.find('#target-armor-display');
            const $powerSection = html.find('.power-section');

            // Show/hide ad-hoc row
            $adhocRow.css('display', isAdHoc ? 'block' : 'none');

            // Determine current damage/rank/type based on selection
            let dmg = 0;
            let rank = "Remarkable";
            let dmgType = "physical-force";
            let label = "Power";

            if (isAdHoc) {
              label = "Ad-hoc";
              dmg = Number(html.find('[name="adhocDamage"]').val() || 0);
              rank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
              dmgType = "physical-force";
              $powerSection.css('background', '#fff8e1').css('border-color', '#ffc107');
            } else {
              const wid = String(selectedPower || "");
              const item = forceItems.find(i => i.id === wid);
              label = item?.name || "Power";
              const s = item?.system || {};
              dmg = Number(s.damage ?? s.value ?? 0);
              rank = String(s.rank ?? s.powerRank ?? "Remarkable");
              dmgType = "physical-force";
              $powerSection.css('background', '#fff').css('border-color', '#ddd');
            }

            // Armor preview (applies per dmgType)
            let armor = 0;
            let armorSource = "";
            if (primaryTargetActor) {
              const armorData = getBodyArmorValues(primaryTargetActor, dmgType);
              armor = armorData?.applicable ?? 0;
              armorSource = armorData?.source ?? "";
            }
            const after = Math.max(0, dmg - armor);

            // Update text
            $val.text(Number.isFinite(dmg) ? dmg : 0);
            $note.text(`(${label})`);
            $afterArmor.html(`<strong>→ ${after} after armor</strong>`);
            if (primaryTargetActor) {
              $armorLine.text(armor > 0 ? `Armor: ${armor}${armorSource ? ` (${armorSource})` : ''}${targets.length > 1 ? ' (1st target)' : ''}` : 'No armor');
            }

            // CS display + reset visibility
            const shift = Number(html.find('[name="shift"]').val() || 0);
            const $csWrap = html.find('.cs-field');
            const $reset = html.find('.cs-reset');
            const $shifted = html.find('#shifted-rank-display');

            $reset.css('visibility', shift !== 0 ? 'visible' : 'hidden');
            if (shift < 0) {
              $csWrap.css('background', '#ffebee').css('border', '1px solid #ef5350');
              $shifted.css('color', '#c62828');
            } else if (shift > 0) {
              $csWrap.css('background', '#e8f5e9').css('border', '1px solid #66bb6a');
              $shifted.css('color', '#2e7d32');
            } else {
              $csWrap.css('background', '').css('border', '1px solid transparent');
              $shifted.css('color', '');
            }

            // Shifted rank display respects "usePowerToHit"
            const usePowerToHit = !!html.find('#usePowerToHit').is(':checked');
            const baseRank = usePowerToHit ? rank : ability.rank;
            $shifted.text(shiftRank(baseRank, shift));

            // Range hint (rank areas)
            html.find('#range-hint').text(`(${rank} range)`);
          };

          // Wire events
          html.on('change', '[name="powerSelect"]', update);
          html.on('input', '[name="adhocDamage"], [name="adhocRank"]', update);
          html.on('change', '#usePowerToHit', update);
          html.on('input', '[name="shift"]', update);
          html.on('click', '.cs-reset', (ev) => {
            ev.preventDefault();
            html.find('[name="shift"]').val(0);
            update();
          });

          // Initial update + capability hooks + range autofill
          update();
          applyCapabilitiesToDialog(html, "force", { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, update);
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

    // === EFFECT MODIFIERS: Apply attack/defense shifts from active effects ===
    const attackerMods = canActorAct(actor);
    if (!attackerMods.canAct) {
      ui.notifications?.warn(`${actor.name}: ${attackerMods.reason}`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background:#fff;border:1px solid #e57373;border-radius:3px;padding:6px 8px;">
            <b>${actor.name}</b> cannot act — ${attackerMods.reason}
          </div>
        `
      });
      return; // abort attack
    }
    
    // Get attacker's attack shift from effects (with breakdown)
    const attackerShiftData = getAttackShiftBreakdown(actor);
    const attackerShift = attackerShiftData.total;
    const attackerEffects = attackerShiftData.breakdown;
    
    // Get defender's defense shift (if single target)
    let defenderShift = 0;
    let defenderEffects = [];
    const effectTargetTokens = Array.from(game.user?.targets ?? []);
    const effectPrimaryTarget = effectTargetTokens[0] ?? null;
    const defenderActor = effectPrimaryTarget?.actor ?? null;
    if (defenderActor) {
      // Force attacks are ranged
      const defenderShiftData = getDefenseShiftBreakdown(defenderActor, true);
      defenderShift = defenderShiftData.total;
      defenderEffects = defenderShiftData.breakdown;
    }
    
    // Total effect shift (attacker bonus + defender penalty)
    // Positive defenderShift = harder to hit, so we subtract it
    const effectShift = attackerShift - defenderShift;
    
    // Apply effect shift to choice.totalShift
    const originalTotalShift = choice.totalShift || 0;
    choice.totalShift = originalTotalShift + effectShift;
    choice.effectShift = effectShift;
    choice.attackerEffects = attackerEffects;
    choice.defenderEffects = defenderEffects;

    // === To-hit column rank selection ===
    const toHitRankName = choice.usePowerToHit ? choice.powerRank : ability.rank;
    const effectiveRank = shiftRank(toHitRankName, choice.totalShift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    // === Roll ===
    const roll = await new Roll("1d100").evaluate();
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} performs ${actionName}`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    // Build inline roll display for consolidated mode
    const inlineRollHtml = useConsolidated ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal) : "";
    const rollDisplay = useConsolidated
      ? buildInlineRollDisplay(roll, totalKarmaUsed, cappedTotal)
      : `${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}`;

    // Standardized card
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
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

    // Then continue with chat message...
    // === Standardized per-target cards ===
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText || this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);
    const effText = String(effectResult || "").toLowerCase();
    const isHit = colorLower !== 'white';

    // Derive damage type once
    const dmgType = "physical-force";

    // Shared context (same roll/result for all targets)
    const rangeText =
      choice.prettyRange ||
      `${choice.range} area${choice.range > 1 ? "s" : ""}` +
      `${choice.rangeModifier ? ` (${choice.rangeModifier}CS)` : ""}` +
      `${choice.throughObstacle ? `, obstacle (-2CS)` : ""}`;

    const toHitLine =
      choice.usePowerToHit
        ? `To-Hit Rank: ${choice.powerRank} (Power)`
        : `To-Hit Rank: ${ability.rank} (${ability.value}) — Ability: ${ability.name}`;

    const contextHtml = inlineRollHtml ? `
      <div>${toHitLine}${this.opts?.shift ? ` — Shift ${this.opts.shift} → ${effectiveRank}` : ""}</div>
      <div>Power: ${choice.powerName} — Damage: ${choice.powerDamage} — Rank: ${choice.powerRank}</div>
      <div>Distance: ${rangeText}</div>
    ` : `
      <div>${toHitLine}${this.opts?.shift ? ` — Shift ${this.opts.shift} → ${effectiveRank}` : ""}</div>
      <div>Power: ${choice.powerName} — Damage: ${choice.powerDamage} — Rank: ${choice.powerRank}</div>
      <div>Distance: ${rangeText}</div>
      <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
    `;

    const targetingContext = getTargetingContext(actor, actionName);
    const isManualMode = this?.opts?.mode === "manual";
    const rawDamage = isHit ? Number(choice.powerDamage || 0) : 0;

    // Only the tokens the user targeted
    let targetTokens = Array.from(game.user?.targets ?? []);
    const targetList = targetTokens.length ? targetTokens : [null];

    for (const target of targetList) {
      const tActor = target?.actor;
      const tName  = target?.name || "Unknown Target";

      let armorData = null;
      let armorValue = 0;
      let afterArmor = rawDamage;
      let isBorderline = false;
      if (isHit && rawDamage > 0 && tActor) {
        armorData = getBodyArmorValues(tActor, dmgType);
        armorValue = Number(armorData?.applicable ?? 0);
        afterArmor = Math.max(0, rawDamage - armorValue);
        // Borderline: armor exactly equals damage (effects can still apply)
        isBorderline = (rawDamage > 0 && rawDamage === armorValue);
      }

      // Force: Red = Stun (no Slam, no Kill)
      const showStun = (colorLower === "red");
      
      // ============================================
      // INLINE STUN CHECK (for consolidated chat cards)
      // ============================================
      let inlineStunHtml = "";
      let inlineStunResult = null;
      
      // Get inline stun result if: consolidated mode + full auto + Red result + has target + effects apply
      if (useConsolidated && !isManualMode && this.opts?.autoApply && showStun && 
          canEffectsApply(afterArmor, { borderline: isBorderline }) && tActor) {
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        
        // Get target's endurance for the save
        const targetEndInfo = getAbilityInfo(tActor, "endurance");
        const targetEndRank = targetEndInfo?.rank || "Typical";
        
        // Common prefill data
        const inlinePrefill = {
          dmgThrough: afterArmor,
          targetName: tName,
          targetEndRank: targetEndRank,
          defenderUuid: target?.document?.uuid ?? tActor?.uuid,
          targetUuid: target?.document?.uuid ?? tActor?.uuid,
          attackForm: "force",
          borderline: isBorderline
        };
        
        try {
          inlineStunResult = await ActionDispatcher.roll("stun", {
            actor: tActor,
            abilityName: "endurance",
            opts: {
              autoApply: true,
              returnResultOnly: true,
              attackForm: "force",
              damageType: dmgType,
              prefill: { ...inlinePrefill }
            }
          });
          
          if (inlineStunResult) {
            inlineStunHtml = buildCollapsibleStunSection(inlineStunResult);
          }
        } catch (e) {
          console.error("[FASERIP ERROR] Inline Stun check failed:", e);
        }
      }

      const { resolveCombatMode } = await import("./action-dispatcher.js");
      const actions = (!isManualMode && isHit && canEffectsApply(afterArmor, { borderline: isBorderline }) && tActor)
        ? buildActionsBox({
            // Force Attacks do not Slam/Kill on the Universal Table; Red = Stun
            showSlam: false,
            showStun: showStun,
            showKill: false,
            actorUuid: actor.uuid,
            targetUuid: tActor?.uuid,
            damage: afterArmor,
            attackForm: "force",
            damageType: dmgType,
            bypassArmor: false,
            autoApply: this.opts?.autoApply,
            autoSave: (typeof resolveCombatMode === "function" && tActor)
              ? (resolveCombatMode(tActor) === "full")
              : false,
          })
        : "";

      const manualModeNotice = isManualMode ? `
        <div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ffcc80;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
          Manual Mode: GM adjudicates
        </div>
      ` : "";

      // Build compact shift display with breakdown
      let shiftDisplay = "";
      const totalShift = Number(choice.totalShift || 0);
      if (totalShift !== 0) {
        const parts = [];
        
        // Manual shift from dialog
        if (choice.shift && choice.shift !== 0) {
          parts.push(`${choice.shift > 0 ? '+' : ''}${choice.shift}`);
        }
        
        // Range modifier
        if (choice.rangeModifier && choice.rangeModifier !== 0) {
          parts.push(`${choice.rangeModifier > 0 ? '+' : ''}${choice.rangeModifier} range`);
        }
        
        // Obstacle modifier
        if (choice.obstacleModifier && choice.obstacleModifier !== 0) {
          parts.push(`${choice.obstacleModifier} obstacle`);
        }
        
        // Movement modifier
        if (choice.movementModifier && choice.movementModifier !== 0) {
          parts.push(`${choice.movementModifier > 0 ? '+' : ''}${choice.movementModifier} movement`);
        }
        
        // Adjacent targets penalty
        if (choice.multiAdjacent) {
          parts.push(`-4 adjacent`);
        }
        
        // Show attacker effects by name
        for (const eff of attackerEffects) {
          parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
        }
        
        // Show defender effects by name (flip sign since they're subtracted)
        for (const eff of defenderEffects) {
          parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
        }
        
        const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
        const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
        shiftDisplay = ` (${csBox} → ${effectiveRank})`;
      }

      // Build roll display with proper yellow hover box (matching blunt/energy)
      const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
      const cardRollDisplay = totalKarmaUsed 
        ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
        : rollBox;

      // bannerColors is a function, not an object
      const { bg, fg } = bannerColors(colorLower);

      // Damage block (kept as plain HTML like Energy/Blunt)
      let damageHtml = "";
      if (!isHit) {
        damageHtml = `
          <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;color:#666;">
            <strong>Damage:</strong> 0 (miss)
          </div>
        `;
      } else {
        const dmgBox = `<span title="Power: ${choice.powerName} (${choice.powerRank})" style="cursor:help;">${rawDamage}</span>`;
        if (armorValue > 0 && tActor) {
          const armorType = armorData?.isForceField ? "Force Field" : "Body Armor";
          const armorHover = `${armorType} (${armorValue})`;
          const armorBox = `<span title="${armorHover}" style="cursor:help;">${armorValue} armor</span>`;
          damageHtml = `
            <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
              <strong>Damage:</strong> ${dmgBox} − ${armorBox} = <strong>${afterArmor}</strong>
            </div>
          `;
        } else {
          damageHtml = `
            <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
              <strong>Damage:</strong> ${dmgBox}
            </div>
          `;
        }
      }

      // Build compact chat card matching Energy/Blunt style
      const cardHtml = `
        <div class="faserip-chat-card" data-action="force">
          <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
            <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
              <strong style="color:#8b0000;">${actionName.toUpperCase()}</strong>
              <span style="color:#666;font-size:.85em;">${choice.powerName}</span>
            </div>

            <div style="padding:4px 10px;font-size:.95em;">
              <strong>${actor.name}</strong>${tActor ? ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${tName}</strong>` : ''}
            </div>

            <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
              <div>${choice.usePowerToHit ? `Power: ${choice.powerRank}` : `${ability.name}: ${ability.rank}`}${shiftDisplay}</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>Roll: ${cardRollDisplay}</span>
                <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
                  ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
                </span>
              </div>
            </div>

            ${damageHtml}
            ${inlineStunHtml}
            ${actions}
            ${manualModeNotice}
          </div>
        </div>
      `;

      // Flags per target (match Energy/Blunt chat card format)
      const msgFlags = buildDamageFlags({
        actionId: actionType,
        damageType: dmgType,
        rawDamage,
        afterArmor,
        resultColor: colorLower,
        cappedTotal,
        targets: target ? [target] : []
      });
      if (msgFlags && msgFlags["msh-faserip"]) {
        // Force cards are per-target; don't carry batch results/autoApply hints
        delete msgFlags["msh-faserip"].autoApply;
        delete msgFlags["msh-faserip"].results;
        msgFlags["msh-faserip"].origin = "force-per-target";
      }

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cardHtml,
        flags: msgFlags
      });

      // Explicit per-target apply in Full Auto
      if (!isManualMode && this.opts?.autoApply && isHit && rawDamage > 0 && tActor) {
        await applyDamageToTargets({
          damage: rawDamage,
          attackerUuid: actor.uuid,
          damageType: dmgType,
          showNotification: false,
          bypassArmor: false,
          attackForm: "force",
          armorPiercing: 0,
          apMode: "value",
          wasKillResult: false,
          targets: target ? [target] : []
        });
        
        // Auto-trigger Stun check if Red result and effects can apply
        if (showStun && canEffectsApply(afterArmor, { borderline: isBorderline })) {
          const { ActionDispatcher } = await import("./action-dispatcher.js");
          
          debugLog("Auto-triggering Stun check for Force attack", { 
            target: tName, 
            damage: afterArmor,
            hasPreRolledResult: !!inlineStunResult,
            useConsolidated
          });
          
          try {
            await ActionDispatcher.roll("stun", {
              actor: tActor,
              abilityName: "endurance",
              opts: {
                autoApply: true,
                showConfirm: false,
                attackForm: "force",
                damageType: dmgType,
                // In consolidated mode, skip chat message and use pre-rolled result
                skipChatMessage: useConsolidated,
                preRolledResult: inlineStunResult,
                prefill: {
                  dmgThrough: afterArmor,
                  targetName: tName,
                  defenderUuid: target?.document?.uuid ?? tActor?.uuid,
                  targetUuid: target?.document?.uuid ?? tActor?.uuid,
                  attackForm: "force",
                  borderline: isBorderline
                }
              }
            });
          } catch (e) {
            console.error("[FASERIP ERROR] Auto-trigger Stun failed:", e);
          }
        }
      }

    }
    // === END AUTO-APPLY ===


    // Play combat SFX (Force)
    try {
      const sourceName   = choice?.powerName || "Force Blast";
      const srcItem      = this?.opts?.item || actor.items.get?.(choice?.powerId) || null;
      const damageType   = choice?.powerDamageType || srcItem?.system?.damageType || "physical-force";
      const rollResult   = String(colorLower ?? "").toLowerCase();   // e.g. "white" | "green" | "yellow" | "red"
      const isHitResult  = typeof isHit === "boolean" ? isHit : rollResult !== "white";

      if (game.msh?.playCombatSFX) {
        await game.msh.playCombatSFX({
          item: srcItem,                 // enables per-power SFX (system.sfx.* or attackModes[].sfx)
          actionType: "force",          // lets the SFX picker use mode-specific overrides
          damageType,                    // e.g. "energy-electricity" or generic "energy"
          rollResult,                    // normalized
          isHit: isHitResult,
          sourceName                     // optional, for heuristic fallback naming
        });
      }
    } catch (e) {
      console.warn("EnergyAction SFX error:", e);
    }

  }
}