// scripts/modules/actions/energy-action.js v1.5.3 - 2025-12-26
// v1.5.3: Default usePowerToHit to false (Agility is standard for ranged attacks)
// v1.5.2: Fix karma display to use getAvailableKarma (lifetime karma) instead of pool value
// v1.5.1: Add result cap for Energy Generation power (can reduce both damage AND effect)
// v1.5.0: Add "Reduce Damage" option (energy can reduce damage but NOT effect per rules)
// v1.4.0: Compact chat card matching blunt-attack style (inline rolls, hover boxes)
// v1.3.2: Fix shifted rank display to use power rank when "use power rank to hit" is checked
// v1.3.1: Fix armor display - show physical armor with energy reduction note
// v1.3.0: Compact dialog UI (match blunt-attack style)
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
  buildMultiAttackSection,
  buildModeSelector,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
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
  showDiceAnimation
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
    const defaultUsePowerToHit = (savedUsePowerToHit === undefined || savedUsePowerToHit === null) ? false : !!savedUsePowerToHit;

    const savedShift = await actor.getFlag("msh-faserip", "lastEnergyShift") || 0;
    const savedMultiAdjacent = await actor.getFlag("msh-faserip", "lastEnergyMultiAdjacent") || false;
    const savedRemember = (await actor.getFlag("msh-faserip", "rememberSettings")) ?? (await actor.getFlag("msh-faserip", "lastEnergyRemember")) ?? true;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? (await actor.getFlag("msh-faserip", "lastEnergySkipDice")) ?? false;
    const savedReduceDamage = await actor.getFlag("msh-faserip", "lastEnergyReduceDamage") || false;
    const savedReducedAmount = await actor.getFlag("msh-faserip", "lastEnergyReducedAmount") || 0;


    // === Target Info ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "energy") : null;
    const physicalArmor = targetArmorInfo?.physical ?? 0;
    const energyArmor = targetArmorInfo?.energy ?? 0;  // Already has -20 applied
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st target)" : "";
    
    // Get initial power info for damage preview
    const initialPower = energyItems.find(i => i.id === savedItemId) || energyItems[0];
    const initialPowerRank = savedAdHoc ? savedAdHocRank : (initialPower?.system?.rank ?? initialPower?.system?.powerRank ?? "Remarkable");
    const initialDamage = savedAdHoc ? savedAdHocDmg : (initialPower?.system?.damage || initialPower?.system?.value || 0);
    const initialAfterArmor = Math.max(0, initialDamage - energyArmor);
    
    // Determine which rank to display initially based on usePowerToHit setting
    const initialDisplayRank = defaultUsePowerToHit ? initialPowerRank : ability.rank;
    
    // Karma info for compact display
    const availableKarma = getAvailableKarma(actor);
    const hasKarma = availableKarma > 0;
    const minKarma = 10;
    
    // Build power radio options (inline style like blunt source selection)
    const powerRadios = energyItems.map((item, idx) => {
      const isSelected = item.id === savedItemId || (!savedItemId && idx === 0);
      const shortName = item.name.length > 14 ? item.name.substring(0, 12) + "…" : item.name;
      return `<label title="${item.name}" style="cursor:pointer;white-space:nowrap;"><input type="radio" name="powerSelect" value="${item.id}" ${isSelected && !savedAdHoc ? 'checked' : ''}> ${shortName}</label>`;
    }).join(' ');

    // === Dialog ===
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target${targets.length > 1 ? 's' : ''}</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay}</div>
          <div style="color:#666;" id="target-armor-display">${primaryTargetActor && physicalArmor > 0 ? `Armor: ${physicalArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}${armorNote}` : (primaryTargetActor ? 'No armor' : '')}</div>
          ${primaryTargetActor && physicalArmor > 0 ? `<div style="color:#1565c0;font-size:.85em;">→ ${energyArmor} vs Energy (-20)</div>` : ''}
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Attack</div>
          <div style="font-weight:600;">${ability.name}: ${ability.rank}</div>
          <div style="color:#666;">Rank Value: ${ability.value}</div>
        </div>
      </div>

      <!-- Power Selection (inline radios) -->
      <div class="power-section" style="padding:8px;background:${savedAdHoc ? '#fff8e1' : '#fff'};border:1px solid ${savedAdHoc ? '#ffc107' : '#ddd'};border-radius:3px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
          ${powerRadios}
          <label style="cursor:pointer;white-space:nowrap;margin-left:8px;"><input type="radio" name="powerSelect" value="adhoc" ${savedAdHoc ? 'checked' : ''}> Ad-hoc</label>
          <span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:#2196F3;color:#fff;font-size:11px;font-weight:bold;cursor:help;margin-left:4px;" title="ENERGY ATTACK RULES:
• Damage = Power rank value
• Range = Power rank areas
• Body Armor -20 vs Energy
• Kill result: White = Endurance Loss">?</span>
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
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${Number(this.opts?.shift ?? savedShift)}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${savedShift < 0 ? 'color:#c62828;' : savedShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(initialDisplayRank, savedShift)}</strong>
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
            <option value="-2">Fast (−2CS)</option>
            <option value="-4">Very Fast (−4CS)</option>
          </select>
        </div>
      </div>

      <!-- Reduce Damage Row (energy can reduce damage; Energy Generation can also reduce effect) -->
      <div class="reduce-damage-section" style="padding:6px 8px;background:#fff3e0;border:1px solid #ffcc80;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <label title="Reduce damage output" style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="reduce-damage-enabled" ${savedReduceDamage ? 'checked' : ''}>
            <strong style="color:#e65100;">Reduce Damage</strong>
          </label>
          <div class="reduce-damage-controls" style="display:${savedReduceDamage ? 'flex' : 'none'};align-items:center;gap:4px;">
            <input type="number" name="reducedDamage" title="Reduced damage amount" value="${savedReduceDamage && savedReducedAmount > 0 ? savedReducedAmount : initialDamage}" min="0" max="${initialDamage}" style="width:45px;padding:2px;text-align:center;">
            <span style="color:#666;font-size:.85em;">/<span class="max-damage-display">${initialDamage}</span></span>
            <span class="result-cap-controls" style="display:none;margin-left:6px;">
              <span style="color:#ccc;margin:0 2px;">|</span>
              <label title="No result cap" style="cursor:pointer;font-size:.9em;"><input type="radio" name="resultCap" value="none" checked> Any</label>
              <label title="Cap at Yellow (no Kill)" style="cursor:pointer;font-size:.9em;"><input type="radio" name="resultCap" value="yellow"> Ylw</label>
              <label title="Cap at Green (no Bullseye/Kill)" style="cursor:pointer;font-size:.9em;"><input type="radio" name="resultCap" value="green"> Grn</label>
            </span>
          </div>
          <span class="effect-note" style="color:#888;font-size:.8em;margin-left:auto;" title="Per FASERIP rules: Energy attacks may reduce damage but not effect (red stays red)">Effect cannot be reduced</span>
        </div>
      </div>

      <!-- Use Power Rank checkbox -->
      <div style="margin-bottom:6px;">
        <input type="checkbox" id="usePowerToHit" name="usePowerToHit" ${defaultUsePowerToHit ? "checked" : ""}>
        <label for="usePowerToHit" title="Normally, ranged Energy attacks use Agility to hit. Exception: Weather Control stunt "Summon Lightning" can use Power rank as Agility (stormy conditions; damage is Power rank). Use this only when a rule or stunt explicitly allows it.">Use power rank to hit (instead of ${ability.name})</label>
      </div>

      <!-- Footer -->
      <div id="msh-bottom-controls" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
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
              let powerDamageType = "energy-generic";

              if (useAdHoc) {
                powerName = String($('[name="adhocName"]').val() || "Energy Blast");
                powerDamage = Number($('[name="adhocDamage"]').val() || 0);
                powerRank = String($('[name="adhocRank"]').val() || "Remarkable");
                powerDamageType = "energy-generic";
                if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc energy.");
                  return resolve(null);
                }
              } else {
                const item = energyItems.find((i) => i.id === selectedPower);
                if (!item) {
                  ui.notifications.error("Select an energy power or use ad-hoc.");
                  return resolve(null);
                }
                powerId = selectedPower;
                const s = item.system || {};
                powerName = item.name;
                powerDamage = Number(s.damage && s.damage > 0 ? s.damage : s.value) || 0;
                powerRank = String(s.rank ?? s.powerRank ?? "Remarkable");
                prettyRange = String(s.calculatedRange || "");
                powerDamageType = item.system.damageType || "energy-generic";
              }

              const shift = Number($('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;
              const usePowerToHit = !!$('#usePowerToHit').is(':checked');

              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');
  
              const targetMovement = String($('[name="targetMovement"]').val() || "0");
              const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
              
              const remember = !!$('#msh-remember-settings').is(':checked');
              const skipDice = !!$('#msh-skip-dice').is(':checked');

              const multiMode = $('[name="multiMode"]:checked').val() || "off";
              const multiAdjacent = (multiMode === "adjacent");

              // Reduce damage (energy can reduce damage; Energy Generation can also reduce effect)
              const reduceDamageEnabled = !!$('#reduce-damage-enabled').is(':checked');
              const reducedDamage = reduceDamageEnabled ? parseInt($('[name="reducedDamage"]').val() || powerDamage) : powerDamage;
              const resultCap = reduceDamageEnabled ? ($('[name="resultCap"]:checked').val() || 'none') : 'none';

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
                await actor.setFlag("msh-faserip", "lastEnergyReduceDamage", reduceDamageEnabled);
                await actor.setFlag("msh-faserip", "lastEnergyReducedAmount", reducedDamage);
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
                multiAdjacent,
                reduceDamageEnabled,
                reducedDamage,
                resultCap
              });
            },
          },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          await setupModeSelector(actor, html, this.opts || {}, "lastEnergyMode");
          const $dialog = html.closest('.dialog');

          // Update function for damage preview and CS highlighting
          const update = () => {
            const selectedPower = html.find('[name="powerSelect"]:checked').val();
            const isAdHoc = selectedPower === "adhoc";
            const $adhocRow = html.find('#adhoc-row');
            const $val = html.find('#dmg-val');
            const $note = html.find('#dmg-note');
            const $afterArmor = html.find('#after-armor-display');
            const $powerSection = html.find('.power-section');

            // Show/hide ad-hoc row
            $adhocRow.css('display', isAdHoc ? 'block' : 'none');
            
            // Update power section highlighting
            if (isAdHoc) {
              $powerSection.css({ 'background': '#fff8e1', 'border-color': '#ffc107' });
            } else {
              $powerSection.css({ 'background': '#fff', 'border-color': '#ddd' });
            }

            // Calculate damage
            let currentDamage = 0;
            let noteText = "";
            let currentRank = "Remarkable";
            let isEnergyGeneration = false;

            if (isAdHoc) {
              currentDamage = Number(html.find('[name="adhocDamage"]').val()) || 0;
              noteText = "(Ad-hoc)";
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const item = energyItems.find(i => i.id === selectedPower);
              if (item) {
                const s = item.system || {};
                currentDamage = Number(s.damage && s.damage > 0 ? s.damage : s.value) || 0;
                noteText = `(${item.name})`;
                currentRank = String(s.rank ?? s.powerRank ?? "Remarkable");
                // Check if this is the Energy Generation power (can reduce both damage AND effect)
                const nameLower = item.name.toLowerCase();
                isEnergyGeneration = nameLower.includes('energy generation') || 
                                     s.canReduceEffect === true ||
                                     s.type?.toLowerCase() === 'energy generation';
              }
            }

            // Show/hide result cap controls based on Energy Generation
            const $resultCapControls = html.find('.result-cap-controls');
            const $effectNote = html.find('.effect-note');
            if (isEnergyGeneration) {
              $resultCapControls.css('display', 'inline');
              $effectNote.text('Energy Generation: can reduce effect').css('color', '#2e7d32');
            } else {
              $resultCapControls.hide();
              html.find('[name="resultCap"][value="none"]').prop('checked', true);
              $effectNote.text('Effect cannot be reduced').css('color', '#888');
            }

            $val.text(currentDamage);
            $note.text(noteText);

            // Update after-armor display
            const afterArmorDmg = Math.max(0, currentDamage - energyArmor);
            if (primaryTarget) {
              $afterArmor.html(`<strong>→ ${afterArmorDmg} after armor</strong>`);
            } else {
              $afterArmor.html(`<strong>→ ${currentDamage} damage</strong>`);
            }

            // Update shifted rank display with directional coloring
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const usePowerRank = html.find('#usePowerToHit').is(':checked');
            const baseRank = usePowerRank ? currentRank : ability.rank;
            const shiftedRankText = shiftRank(baseRank, cs);
            const $shiftedRank = html.find('#shifted-rank-display');
            $shiftedRank.text(shiftedRankText);
            
            // Show which rank is being used
            const $csField = html.find('.cs-field');
            const rankSource = usePowerRank ? '(power)' : `(${ability.name})`;
            
            // Update CS field highlighting based on direction
            const $resetBtn = html.find('.cs-reset');
            if (cs < 0) {
              $csField.css({ 'background': '#ffebee', 'border': '1px solid #ef5350' });
              $shiftedRank.css('color', '#c62828');
              $resetBtn.css('visibility', 'visible');
            } else if (cs > 0) {
              $csField.css({ 'background': '#e8f5e9', 'border': '1px solid #66bb6a' });
              $shiftedRank.css('color', '#2e7d32');
              $resetBtn.css('visibility', 'visible');
            } else {
              $csField.css({ 'background': '', 'border': '1px solid transparent' });
              $shiftedRank.css('color', '');
              $resetBtn.css('visibility', 'hidden');
            }

            // Update range hint based on power rank
            const $rangeHint = html.find('#range-hint');
            const rankValue = game.msh?.getRankValue?.(currentRank) || RANKS[currentRank] || 30;
            $rangeHint.text(`Max: ${rankValue} areas`);

            // Update reduce damage max when power changes
            const $reducedDamage = html.find('[name="reducedDamage"]');
            const $maxDmgDisplay = html.find('.max-damage-display');
            const oldMax = Number($reducedDamage.attr('max')) || 0;
            $reducedDamage.attr('max', currentDamage);
            $maxDmgDisplay.text(currentDamage);
            // If max changed (power switched), reset value to new max
            if (oldMax !== currentDamage) {
              $reducedDamage.val(currentDamage);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          // Initial update
          update();


          // Sync effect-cap controls with Reduce Damage toggle.
          const reduceChecked = html.find('#reduce-damage-enabled').is(':checked');
          html.find('input[name="resultCap"]').prop('disabled', !reduceChecked);
          if (!reduceChecked) html.find('input[name="resultCap"][value="none"]').prop('checked', true);

          // Event handlers
          html.find('[name="powerSelect"]').on('change', update);
          html.find('[name="adhocDamage"]').on('input change', update);
          html.find('[name="adhocRank"]').on('input change', update);
          html.find('[name="shift"]').on('input change', update);
          html.find('#usePowerToHit').on('change', update);
          
          // CS reset button handler
          html.find('.cs-reset').on('click', function(e) {
            e.preventDefault();
            html.find('[name="shift"]').val(0).trigger('change');
          });

          // Reduce damage checkbox toggle
          html.find('#reduce-damage-enabled').on('change', function() {
            const $controls = html.find('.reduce-damage-controls');
            const $reducedDamage = html.find('[name="reducedDamage"]');
            const $section = html.find('.reduce-damage-section');
            if (this.checked) {
              $controls.css('display', 'flex');
              // Set value to current max (which reflects power damage)
              const currentMax = Number($reducedDamage.attr('max')) || 20;
              $reducedDamage.val(currentMax);
              // Dark orange border when enabled
              $section.css('border-color', '#e65100');
            } else {
              $controls.hide();
              // Reset damage to max when disabling
              $reducedDamage.val($reducedDamage.attr('max'));
              // Reset to default border
              $section.css('border-color', '#ffcc80');
            }
          
            // If Reduce Damage is off, don't allow capping the effect result.
            const $caps = html.find('input[name="resultCap"]');
            $caps.prop('disabled', !this.checked);
            if (!this.checked) {
              html.find('input[name="resultCap"][value="none"]').prop('checked', true);
            }
            update();
});

          applyCapabilitiesToDialog(html, "energy", { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, update);
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

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    const roll = await new Roll("1d100").evaluate();
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} performs ${actionName}`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    let color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    let colorLower = String(color || "").toLowerCase();
    
    // Apply result cap if set (only for Energy Generation power)
    let wasResultCapped = false;
    if (choice.resultCap && choice.resultCap !== 'none') {
      const capOrder = ['white', 'green', 'yellow', 'red'];
      const currentIndex = capOrder.indexOf(colorLower);
      const capIndex = capOrder.indexOf(choice.resultCap);
      if (currentIndex > capIndex) {
        color = choice.resultCap;
        colorLower = choice.resultCap;
        wasResultCapped = true;
      }
    }
    
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
    const targetTokens = Array.from(game.user?.targets ?? []);
    const targetList = targetTokens.length ? targetTokens : [null];

    // Build compact shift display
    let shiftDisplay = "";
    if (choice.totalShift !== 0) {
      const csBox = `<span title="Range, obstacles, movement" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${choice.totalShift > 0 ? '+' : ''}${choice.totalShift}CS</span>`;
      shiftDisplay = ` (${csBox} → ${effectiveRank})`;
    }

    // Build compact roll display
    const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
    const rollDisplay = totalKarmaUsed 
      ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
      : rollBox;

    const { bg, fg } = bannerColors(colorLower);
    const isManualMode = this?.opts?.mode === "manual";
    const targetCount = targetList.length;
    const actionLabel = `${actionName}${targetCount > 1 ? ` (${targetCount} targets)` : ''}`;

    // One message per target
    for (const target of targetList) {
      const targetActor = target?.actor;
      const targetName  = target?.name || "Unknown Target";

      // Use reduced damage if enabled, otherwise full power damage
      const baseDamage = choice.reduceDamageEnabled ? choice.reducedDamage : choice.powerDamage;
      const rawDamage = isHit ? (Number(baseDamage) || 0) : 0;
      const wasReduced = choice.reduceDamageEnabled && choice.reducedDamage < choice.powerDamage;

      // Get armor info for this target
      let armorData = null;
      let armorValue = 0;
      let afterArmor = rawDamage;
      if (isHit && rawDamage > 0 && targetActor) {
        armorData = getBodyArmorValues(targetActor, choice.powerDamageType);
        armorValue = armorData?.applicable ?? 0;
        afterArmor = Math.max(0, rawDamage - armorValue);
      }

      // Determine effect checks for energy: only Kill on red
      const showKill = (colorLower === "red");
      
      // Per-target actions (skip in manual mode)
      const { resolveCombatMode } = await import("./action-dispatcher.js");
      const actions = (!isManualMode && isHit && afterArmor > 0 && targetActor)
        ? buildActionsBox({
            showSlam: false,
            showStun: false,
            showKill: showKill,
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

      // Manual mode notice
      const manualModeNotice = isManualMode ? `
        <div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
          Manual Mode: GM adjudicates
        </div>
      ` : "";

      // Build compact chat card matching blunt style
      const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <!-- Header: Action name -->
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
            <strong style="color:#8b0000;">${actionLabel.toUpperCase()}</strong>
            <span style="color:#666;font-size:.85em;">${choice.powerName}</span>
          </div>
          
          <!-- Attacker → Target -->
          <div style="padding:4px 10px;font-size:.95em;">
            <strong>${actor.name}</strong>${targetActor ? ` <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${targetName}</strong>` : ''}
          </div>
          
          <!-- Ability + Roll + Result -->
          <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
            <div>${choice.usePowerToHit ? `Power: ${choice.powerRank}` : `${ability.name}: ${ability.rank}`}${shiftDisplay}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>Roll: ${rollDisplay}</span>
              <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
                ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}${wasResultCapped ? ' <span style="font-weight:normal;font-size:.85em;">(capped)</span>' : ''}
              </span>
            </div>
          </div>
          
          <!-- Damage -->
          ${(() => {
            if (!isHit) {
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;color:#666;">
                <strong>Damage:</strong> 0 (miss)
              </div>`;
            }
            
            const reducedNote = wasReduced ? ` <span style="color:#ff6f00;">(reduced from ${choice.powerDamage})</span>` : '';
            const dmgBox = `<span title="Power: ${choice.powerName} (${choice.powerRank})" style="cursor:help;">${rawDamage}</span>`;
            
            if (armorValue > 0 && targetActor) {
              const isEnergy = armorData?.isEnergyDamage !== false;
              const armorType = armorData?.isForceField ? "Force Field" : "Body Armor";
              const armorHover = `${armorType} (${armorValue}${isEnergy ? ', -20 vs Energy applied' : ''})`;
              const armorBox = `<span title="${armorHover}" style="cursor:help;">${armorValue} armor</span>`;
              
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <strong>Damage:</strong> ${dmgBox}${reducedNote} − ${armorBox} = <strong>${afterArmor}</strong>
              </div>`;
            } else {
              return `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <strong>Damage:</strong> ${dmgBox}${reducedNote}
              </div>`;
            }
          })()}
          
          ${actions}
          ${manualModeNotice}
        </div>
      `;

      // Flags per target
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

      // Auto-apply damage in Full Auto mode
      if (!isManualMode && this.opts?.autoApply && isHit && rawDamage > 0 && targetActor) {
        await applyDamageToTargets({
          damage: rawDamage,
          attackerUuid: actor.uuid,
          damageType: choice.powerDamageType,
          showNotification: false,
          bypassArmor: false,
          attackForm: "energy",
          armorPiercing: 0,
          apMode: "value",
          wasKillResult: showKill,
          targets: target ? [target] : []
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