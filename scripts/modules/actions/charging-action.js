// scripts/modules/actions/charging-action.js v2.0.0 - 2026-03-11
// v2.0.0: Refactor - dialog only, delegates character target resolution to _executeSingleAttack.
//         Object targets get a simple card. Rebound handled post-pipeline.
// v1.5.0: Add inline Slam/Stun results and auto-trigger effects in Full Auto mode
// v1.4.4: Fix rebound button to use apply-collision-damage handler, move mode checks earlier
// v1.4.3: Add more debug logging, pass targetUuid to actions box, simplify conditions
// v1.4.2: Fix damage application - only auto-apply in Full mode, add debug logging
// v1.4.1: Fix damage application - actually apply damage to targets
// v1.4.0: Compact chat card matching modern attack-action format
// v1.3.0: Compact dialog layout matching blunt attack, fix CS persistence bug
// v1.2.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.1.0: Add inline rolls for consolidated chat cards
import { AttackAction } from "./attack-action.js";
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma
} from "../dice/dice-roller.js";
import {
  RANKS,
  shiftRank,
  labelFor,
  effectsFor,
  bannerColors,
  getAbilityInfo,
  getStrengthInfo,
  rollWithKarmaAndHistory,
  debugLog,
  applyCapabilitiesToDialog,
  showDiceAnimation,
  getTargetData,
  buildModeSelector,
  setupModeSelector,
  applyDamageToTargets
} from "./action-utils.js";

/**
 * ChargingAction - Endurance-based attack combining movement and combat
 * Rules:
 * - Must move at least 1 area to charge
 * - +1CS per area moved (max +3CS, cap Shift-Z)
 * - Damage = Endurance or Body Armor (higher) + 2pts per area moved
 * - If target defense > damage, rebounds to attacker (attacker BA absorbs)
 * - Miss: continue at half speed in straight line
 * - Yellow = Slam, Red = Stun (same as Blunt)
 */
export class ChargingAction extends AttackAction {
  async execute() {
  const actor = this.actor;
  const actionType = "charging";
  const actionName = labelFor(actionType);
  const effects = effectsFor(actionType);

  // Get Endurance and Body Armor
  const endurance = getAbilityInfo(actor, "endurance");
  const agility = getAbilityInfo(actor, "agility");
  
  // Get Body Armor if it exists
  let bodyArmorRank = "Shift-0";
  let bodyArmorValue = 0;
  const bodyArmorPower = actor.items.find(i => 
    i.type === "power" && 
    (i.name.toLowerCase().includes("body armor") || 
     i.name.toLowerCase().includes("body armour"))
  );
  if (bodyArmorPower) {
    bodyArmorRank = bodyArmorPower.system?.rank || "Shift-0";
    bodyArmorValue = bodyArmorPower.system?.value || 0;
  }

  // Material strength examples for each rank
  const MATERIAL_EXAMPLES = {
    "Shift-0": "Air, vacuum",
    "Feeble": "Cloth, glass, brush, paper",
    "Poor": "Normal plastics, crystal, wood",
    "Typical": "Rubber, soft metals (gold, brass, copper), ice, adobe",
    "Good": "Brick, aluminum, light machinery, asphalt, high strength plastics",
    "Excellent": "Concrete, Beta cloth, iron, bullet-proof glass",
    "Remarkable": "Reinforced concrete, steel",
    "Incredible": "Solid stone, Vibranium, volcanic rock",
    "Amazing": "Osmium steel, granite, gemstones",
    "Monstrous": "Diamond, super-heavy alloys",
    "Unearthly": "Adamantium steel, mystical/enchanted elements",
    "Class 1000": "Virtually indestructible (Cap's shield, Thor's hammer)",
    "Class 3000": "Virtually indestructible (Cap's shield, Thor's hammer)",
    "Class 5000": "Virtually indestructible (Cap's shield, Thor's hammer)"
  };

  // Get target info using standard helper
  const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
  
  // Auto-populate target's Body Armor
  let targetBArank = "Shift-0";
  let targetBAvalue = 0;
  let targetName = primaryTarget?.name || "";
  let targetUuid = primaryTargetActor?.uuid || "";
  let autoPopulated = false;
  
  if (primaryTargetActor) {
    autoPopulated = true;
    const targetBApower = primaryTargetActor.items.find(i => 
      i.type === "power" && 
      (i.name.toLowerCase().includes("body armor") || 
       i.name.toLowerCase().includes("body armour"))
    );
    if (targetBApower) {
      targetBArank = targetBApower.system?.rank || "Shift-0";
      targetBAvalue = targetBApower.system?.value || 0;
    }
  }

  // --- INITIALIZATION & DEFAULTS ---
  const lsRememberKey = "msh.charging.remember";
  const lsSkipKey = "msh.charging.skipDice";
  
  const storedRemember = localStorage.getItem(lsRememberKey);
  const shouldRemember = storedRemember === "1";
  const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

  const savedAreas = shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingAreas") || 1) : 1;
  const savedShift = shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingShift") || 0) : 0;
  const savedTargetType = autoPopulated ? "character" : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingTargetType") || "character") : "character");
  const savedTargetBA = autoPopulated ? targetBArank : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingTargetBA") || "Shift-0") : "Shift-0");
  const savedTargetBAValue = autoPopulated ? targetBAvalue : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingTargetBAValue") || 0) : 0);
  const savedObjectMaterial = shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingObjectMaterial") || "Excellent") : "Excellent";
  const savedObjectDesc = shouldRemember ? (await actor.getFlag("msh-faserip", "lastChargingObjectDesc") || "") : "";
  const savedCsNotes = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastChargingCsNotes")) || "") : "";

  const optsShift = this.opts?.shift;
  const dialogShift = (optsShift !== undefined && optsShift !== null && optsShift !== 0) 
    ? optsShift 
    : savedShift;

  const materialOptions = RANKS.map(r => {
    const val = game.msh.getRankValue(r);
    const example = MATERIAL_EXAMPLES[r] ? ` — ${MATERIAL_EXAMPLES[r]}` : '';
    return `<option value="${r}" ${r === savedObjectMaterial ? 'selected' : ''}>${r} (${val})${example}</option>`;
  }).join('');

  const rankOptions = RANKS.map(r => 
    `<option value="${r}" ${r === savedTargetBA ? 'selected' : ''}>${r}</option>`
  ).join('');

  const availableKarma = getAvailableKarma(actor);
  const hasKarma = availableKarma > 0;
  const minKarma = 10;

  const initialBaseRankValue = Math.max(endurance.value, bodyArmorValue);
  const initialSpeedDamage = savedAreas * 2;
  const initialTotalDamage = initialBaseRankValue + initialSpeedDamage;
  const initialMovementBonus = Math.min(3, savedAreas);

  const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // ================================================================
  // DIALOG
  // ================================================================
  const dialogHtml = `
    ${buildModeSelector({ mode: "semi" })}

    <!-- Context: Target + Attack stats side by side -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
        <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target</div>
        <div style="font-weight:600;color:#d32f2f;">${targetDisplay || "(no target)"}</div>
        <div style="color:#666;" id="target-armor-display">${autoPopulated && targetBAvalue > 0 ? `Body Armor: ${targetBArank} (${targetBAvalue})` : (autoPopulated ? 'No armor' : '')}</div>
      </div>
      <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
        <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Charging</div>
        <div style="font-weight:600;">Endurance: ${endurance.rank} (${endurance.value})</div>
        <div style="color:#666;">Body Armor: ${bodyArmorRank} (${bodyArmorValue})</div>
        <div style="color:#666;font-size:.85em;">Agility: ${agility.rank} (for miss recovery)</div>
      </div>
    </div>

    <!-- Movement Row -->
    <div class="movement-section" style="padding:8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <label style="font-weight:600;color:#e65100;">Areas:</label>
        <input type="number" name="areas" value="${savedAreas}" min="1" max="20" style="width:50px;padding:3px;text-align:center;">
        <span style="color:#666;">→</span>
        <strong id="movement-bonus" style="color:#2e7d32;">+${initialMovementBonus} CS</strong>
        <span style="color:#999;font-size:.85em;">(max +3)</span>
      </div>
      <div style="font-size:.8em;color:#777;margin-top:4px;">
        Must move at least 1 area. +1CS per area (max +3CS). Damage = END/BA + 2×areas.
      </div>
    </div>

    <!-- Damage Preview -->
    <div id="preview" style="background:#ffebee;border:1px solid #ef9a9a;border-radius:3px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span><strong>Damage:</strong> <span id="dmg-base">${initialBaseRankValue}</span> + <span id="dmg-speed">${initialSpeedDamage}</span> = <span id="dmg-total">${initialTotalDamage}</span></span>
        <span style="font-size:.9em;color:#666;" id="dmg-note">(${initialBaseRankValue} base + 2×${savedAreas} speed)</span>
      </div>
      <div id="rebound-warning" style="display:none;margin-top:4px;padding:4px;background:#fff;border:1px solid #f44336;border-radius:3px;font-size:.85em;color:#d32f2f;font-weight:bold;">
        Target defense > damage — rebounds to you!
      </div>
    </div>

    <!-- Modifiers Row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
      <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${dialogShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : dialogShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : 'border:1px solid transparent;'}">
        <label style="font-weight:600;">CS:</label>
        <input type="number" name="shift" value="${Number(dialogShift)}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
        <span style="color:#666;">→</span>
        <strong id="shifted-rank-display" style="${dialogShift < 0 ? 'color:#c62828;' : dialogShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(endurance.rank, dialogShift + initialMovementBonus)}</strong>
        <button type="button" class="cs-reset" style="visibility:${dialogShift !== 0 ? 'visible' : 'hidden'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
      </div>
      <div class="karma-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${hasKarma ? 'background:#e3f2fd;border:1px solid #90caf9;' : ''}">
        ${hasKarma ? `
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="spend-karma" name="spendKarma">
            <span style="font-weight:600;">Karma:</span>
          </label>
          <span title="Available: ${availableKarma} | Min: ${minKarma}" style="padding:1px 4px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${availableKarma}</span>
          <span style="color:#999;font-size:.8em;">(min ${minKarma})</span>
        ` : `<span style="color:#999;">No karma</span>`}
      </div>
    </div>

    <!-- CS Notes Row -->
    <div id="cs-notes-row" style="margin-bottom:6px;">
      <input type="text" name="csNotes" id="cs-notes-input" placeholder="e.g., talent +1CS, situation -2CS" value="${savedCsNotes}" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:3px;font-size:.9em;box-sizing:border-box;">
    </div>

    <!-- Target Type Selection -->
    <div class="target-type-section" style="padding:6px 8px;background:#e3f2fd;border:1px solid #90caf9;border-radius:3px;margin-bottom:6px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-weight:600;color:#1565c0;">Target:</span>
        <label style="cursor:pointer;"><input type="radio" name="targetType" value="character" ${savedTargetType === 'character' ? 'checked' : ''}> Character</label>
        <label style="cursor:pointer;"><input type="radio" name="targetType" value="object" ${savedTargetType === 'object' ? 'checked' : ''}> Object</label>
        <span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:#2196F3;color:#fff;font-size:11px;font-weight:bold;cursor:help;margin-left:auto;" title="CHARGING RULES:
• Damage = max(END, BA) + 2×areas moved
• If target defense > damage, rebounds to you
• Your BA absorbs rebound damage
• Miss: continue half-speed in straight line">?</span>
      </div>
    </div>

    <!-- Character Target Panel -->
    <div id="character-target-panel" style="display:${savedTargetType === 'character' ? 'block' : 'none'};padding:6px 8px;background:#fff;border:1px solid #90caf9;border-radius:3px;margin-bottom:6px;">
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center;">
        <label style="font-size:.9em;">Body Armor:</label>
        <select name="targetBodyArmorRank" style="padding:3px;">${rankOptions}</select>
        <input type="number" name="targetBodyArmorValue" value="${savedTargetBAValue}" min="0" style="width:50px;padding:3px;text-align:center;">
      </div>
    </div>

    <!-- Object Target Panel -->
    <div id="object-target-panel" style="display:${savedTargetType === 'object' ? 'block' : 'none'};padding:6px 8px;background:#fff;border:1px solid #ffcc80;border-radius:3px;margin-bottom:6px;">
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;">
        <label style="font-size:.9em;">Description:</label>
        <input type="text" name="objectDescription" value="${savedObjectDesc}" placeholder="e.g., Brick wall, Steel door" style="padding:3px;">
        <label style="font-size:.9em;">Material:</label>
        <select name="objectMaterial" style="padding:3px;">${materialOptions}</select>
      </div>
    </div>

    <!-- Footer -->
    <div id="msh-bottom-controls" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
      <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
      <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
    </div>
    
    ${autoPopulated ? `<div style="margin-top:8px;padding:4px;background:#e8f5e9;border:1px solid #4CAF50;border-radius:3px;font-size:.85em;color:#2e7d32;">Auto-populated from targeted token</div>` : ""}
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
            const areas = Math.max(1, Number($('[name="areas"]').val() || 1));
            const shift = Number($('[name="shift"]').val() || 0);
            const csNotes = String($('[name="csNotes"]').val() || "");
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;
            const targetType = String($('[name="targetType"]:checked').val() || "character");
            const skipDice = !!$('#msh-skip-dice').is(':checked');
            const remember = !!$('#msh-remember-settings').is(':checked');

            let targetBArank, targetBAvalue, objectMaterial, objectDesc;

            if (targetType === "character") {
              targetBArank = String($('[name="targetBodyArmorRank"]').val() || "Shift-0");
              targetBAvalue = Number($('[name="targetBodyArmorValue"]').val() || 0);
              objectMaterial = null;
              objectDesc = null;
            } else {
              objectMaterial = String($('[name="objectMaterial"]').val() || "Excellent");
              objectDesc = String($('[name="objectDescription"]').val() || "Object");
              targetBArank = objectMaterial;
              targetBAvalue = game.msh.getRankValue(objectMaterial) || 20;
            }

            setLS(lsRememberKey, remember ? "1" : "0");
            setLS(lsSkipKey, skipDice ? "1" : "0");

            if (remember) {
              await actor.setFlag("msh-faserip", "lastChargingAreas", areas);
              await actor.setFlag("msh-faserip", "lastChargingShift", shift);
              await actor.setFlag("msh-faserip", "lastChargingCsNotes", csNotes);
              await actor.setFlag("msh-faserip", "lastChargingTargetType", targetType);
              if (targetType === "character") {
                await actor.setFlag("msh-faserip", "lastChargingTargetBA", targetBArank);
                await actor.setFlag("msh-faserip", "lastChargingTargetBAValue", targetBAvalue);
              } else {
                await actor.setFlag("msh-faserip", "lastChargingObjectMaterial", objectMaterial);
                await actor.setFlag("msh-faserip", "lastChargingObjectDesc", objectDesc);
              }
            }

            const movementBonus = Math.min(3, areas);
            const totalShift = shift + movementBonus;

            resolve({
              areas,
              shift,
              karma,
              spendKarma,
              skipDice,
              targetType,
              targetBArank,
              targetBAvalue,
              objectMaterial,
              objectDesc,
              totalShift,
              movementBonus,
              csNotes
            });
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "roll",
      render: (html) => {
        setupKarmaControlHandlers(html);
        setupModeSelector(actor, html, this.opts || {}, "lastChargingMode");
        
        const $charPanel = html.find('#character-target-panel');
        const $objPanel = html.find('#object-target-panel');

        const togglePanels = () => {
          const type = html.find('[name="targetType"]:checked').val();
          if (type === 'character') {
            $charPanel.show();
            $objPanel.hide();
          } else {
            $charPanel.hide();
            $objPanel.show();
          }
          updatePreview();
        };

        const updatePreview = () => {
          const areas = Math.max(1, Number(html.find('[name="areas"]').val() || 1));
          const movementBonus = Math.min(3, areas);
          const cs = Number(html.find('[name="shift"]').val() || 0);

          html.find('#movement-bonus').text(`+${movementBonus} CS`);

          const baseRankValue = Math.max(endurance.value, bodyArmorValue);
          const speedDamage = areas * 2;
          const totalDamage = baseRankValue + speedDamage;

          html.find('#dmg-base').text(baseRankValue);
          html.find('#dmg-speed').text(speedDamage);
          html.find('#dmg-total').text(totalDamage);
          html.find('#dmg-note').text(`(${baseRankValue} base + 2×${areas} speed)`);

          const effectiveRank = shiftRank(endurance.rank, cs + movementBonus);
          const $shiftedRank = html.find('#shifted-rank-display');
          $shiftedRank.text(effectiveRank);

          const $csField = html.find('.cs-field');
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

          const type = String(html.find('[name="targetType"]:checked').val() || "character");
          let targetDefense = 0;
          
          if (type === 'character') {
            targetDefense = Number(html.find('[name="targetBodyArmorValue"]').val() || 0);
          } else {
            const objectMat = String(html.find('[name="objectMaterial"]').val() || "Excellent");
            targetDefense = game.msh.getRankValue(objectMat) || 20;
          }

          const $warn = html.find('#rebound-warning');
          if (targetDefense > totalDamage) {
            $warn.show();
          } else {
            $warn.hide();
          }
        };

        html.find('[name="areas"]').on('input', updatePreview);
        html.find('[name="shift"]').on('input', updatePreview);
        html.find('[name="targetType"]').on('change', togglePanels);
        html.find('[name="targetBodyArmorRank"]').on('change', () => {
          const rank = html.find('[name="targetBodyArmorRank"]').val();
          const value = game.msh.getRankValue(rank) || 0;
          html.find('[name="targetBodyArmorValue"]').val(value);
          updatePreview();
        });
        html.find('[name="targetBodyArmorValue"]').on('input', updatePreview);
        html.find('[name="objectMaterial"]').on('change', updatePreview);

        html.find('.cs-reset').on('click', function(e) {
          e.preventDefault();
          html.find('[name="shift"]').val(0);
          updatePreview();
        });

        html.find('#spend-karma').on('change', function() {
          const $field = html.find('.karma-field');
          $field.css('border-color', this.checked ? '#1565c0' : '#90caf9');
        });

        togglePanels();
        updatePreview();
        applyCapabilitiesToDialog(html, "charging", { actor });
      }
    }).render(true);
  });

  if (!choice) return;

  // ================================================================
  // POST-DIALOG RESOLUTION
  // ================================================================

  // Cap effective rank at Shift-Z per charging rules
  let effectiveRank = shiftRank(endurance.rank, choice.totalShift);
  const shiftZindex = RANKS.indexOf("Shift-Z");
  const effectiveIndex = RANKS.indexOf(effectiveRank);
  if (shiftZindex >= 0 && effectiveIndex > shiftZindex) {
    effectiveRank = "Shift-Z";
    console.log("[FASERIP] Charging: Effective rank capped at Shift-Z per rules");
  }

  // Calculate raw damage: max(Endurance, Body Armor) + 2 * areas
  const baseRankValue = Math.max(endurance.value, bodyArmorValue);
  const speedDamage = choice.areas * 2;
  const rawDamage = baseRankValue + speedDamage;

  const damageSourceHover = `max(End ${endurance.rank} ${endurance.value}, BA ${bodyArmorRank} ${bodyArmorValue}) = ${baseRankValue} + 2x${choice.areas} areas = ${rawDamage}`;

  debugLog("Charging: post-dialog", {
    areas: choice.areas,
    shift: choice.shift,
    totalShift: choice.totalShift,
    movementBonus: choice.movementBonus,
    effectiveRank,
    targetType: choice.targetType,
    rawDamage,
    baseRankValue,
    speedDamage
  });

  // Build shift breakdown for CS hover in chat card
  const shiftBreakdown = {
    manual: choice.shift || 0,
    csNotes: choice.csNotes || "",
    movement: choice.movementBonus || 0
  };

  // ================================================================
  // CHARACTER TARGET: delegate to _executeSingleAttack
  // ================================================================
  if (choice.targetType === "character") {
    const mergedChoice = {
      ...choice,
      shiftBreakdown,
      totalShift: choice.totalShift
    };

    await this._executeSingleAttack({
      choice: mergedChoice,
      actor,
      ability: endurance,
      actionType,
      actionName,
      effects,
      damageType: "physical-blunt",
      rawDamage,
      damageNote: damageSourceHover,
      sourceName: `Charging (${choice.areas} area${choice.areas > 1 ? 's' : ''})`,
      attackForm: "charging",
      breakingFeat: null,
      targetCount: 1,
      attackNumber: 1,
      totalAttacks: 1
    });

    // ============================================================
    // REBOUND CHECK (post-pipeline)
    // If dialog-entered target BA > rawDamage, damage reflects back.
    // _executeSingleAttack used getBodyArmorValues() for its armor
    // calc, which may differ from the dialog value. We use the
    // dialog value for rebound since that's what the player entered.
    // ============================================================
    const dialogTargetBA = choice.targetBAvalue || 0;
    
    if (dialogTargetBA > rawDamage) {
      const reboundAmount = dialogTargetBA;
      const damageToAttacker = Math.max(0, reboundAmount - bodyArmorValue);
      const isManualMode = this.opts?.mode === "manual";
      const autoApply = !!this.opts?.autoApply;
      
      debugLog("Charging: Rebound triggered", {
        targetBA: dialogTargetBA,
        rawDamage,
        reboundAmount,
        attackerBA: bodyArmorValue,
        damageToAttacker
      });

      const targetLabel = targetName || "Target";
      let reboundHtml = `
        <div style="background:#f5f5f0;border:1px solid #f44336;border-radius:3px;margin-bottom:5px;">
          <div style="padding:6px 10px;border-bottom:1px solid #f44336;background:#ffebee;">
            <strong style="color:#c62828;">CHARGING REBOUND</strong>
          </div>
          <div style="padding:8px 10px;font-size:.9em;">
            ${targetLabel}'s defense (${dialogTargetBA}) exceeded charging damage (${rawDamage}).
            Rebound: ${reboundAmount} - ${bodyArmorValue} attacker BA = <strong>${damageToAttacker} damage to ${actor.name}</strong>.
          </div>
      `;

      if (!isManualMode && !autoApply && damageToAttacker > 0) {
        reboundHtml += `
          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;border-top:1px solid #e0e0e0;background:#fafafa;">
            <a class="faserip-chip"
              data-action="apply-collision-damage"
              data-target-uuid="${actor.uuid}"
              data-damage="${damageToAttacker}"
              title="Apply rebound damage to attacker"
              style="display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;background:#fff;color:#333;cursor:pointer;">
              Apply Rebound Damage (${damageToAttacker})
            </a>
          </div>
        `;
      }

      if (isManualMode) {
        reboundHtml += `
          <div style="padding:4px 8px;background:#fff3e0;border-top:1px solid #ff9800;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
            Manual Mode: GM adjudicates rebound
          </div>
        `;
      }

      reboundHtml += `</div>`;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: reboundHtml
      });

      if (!isManualMode && autoApply && damageToAttacker > 0) {
        const attackerToken = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
        if (attackerToken) {
          await applyDamageToTargets({
            damage: damageToAttacker,
            attackerUuid: actor.uuid,
            damageType: "physical-blunt",
            showNotification: true,
            bypassArmor: true,
            attackForm: "charging-rebound",
            targets: [attackerToken],
            wasKillResult: false,
            forceKilling: false
          });
        }
      }
    }

    return;
  }

  // ================================================================
  // OBJECT TARGET: simple card (no evasion, no effects, no slam/stun)
  // ================================================================
  const isManualMode = this.opts?.mode === "manual";
  const autoApply = !!this.opts?.autoApply;

  let useConsolidated = false;
  try {
    useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
  } catch (_e) { /* setting not registered */ }

  const roll = await new Roll("1d100").evaluate();
  if (!choice.skipDice) {
    await showDiceAnimation(roll, actor, `${actor.name} charges into ${choice.objectDesc || "object"}`, useConsolidated);
  }

  const { cappedTotal, totalKarmaUsed } =
    await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll, {
      spendKarma: choice.spendKarma,
      rank: effectiveRank,
      inlineRoll: useConsolidated
    });

  const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
  const colorLower = String(color || "").toLowerCase();
  const { bg, fg } = bannerColors(colorLower);
  const effectResult = effects[colorLower] || color;

  const targetLabel = choice.objectDesc || "Object";
  const materialDefense = choice.targetBAvalue;
  const damageToObject = colorLower !== "white" ? Math.max(0, rawDamage - materialDefense) : 0;

  // Rebound for objects
  let reboundNote = "";
  let damageToAttacker = 0;
  if (colorLower !== "white" && materialDefense > rawDamage) {
    damageToAttacker = Math.max(0, materialDefense - bodyArmorValue);
    reboundNote = `
      <div style="padding:6px;margin:6px 10px;background:#ffebee;border:1px solid #f44336;border-radius:3px;">
        <strong>Rebound:</strong> Material Strength (${materialDefense}) exceeded damage (${rawDamage}).
        Returns ${materialDefense} to you. Your BA (${bodyArmorValue}) soaks what it can.
        <strong>You take ${damageToAttacker} damage.</strong>
      </div>
    `;
    if (!isManualMode && !autoApply && damageToAttacker > 0) {
      reboundNote += `
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
          <a class="faserip-chip"
            data-action="apply-collision-damage"
            data-target-uuid="${actor.uuid}"
            data-damage="${damageToAttacker}"
            title="Apply rebound damage to attacker"
            style="display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;background:#fff;color:#333;cursor:pointer;">
            Apply Rebound Damage (${damageToAttacker})
          </a>
        </div>
      `;
    }
  }

  const missNote = colorLower === "white" ? `
    <div style="padding:6px;margin:6px 10px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
      <strong>Miss — Continued Movement:</strong> You continue moving at half your speed in a straight line.
      Changing direction requires an Agility FEAT (${agility.rank}).
      If you hit an obstacle, you make a collision attack against it.
    </div>
  ` : "";

  // Roll display
  const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
  const rollDisplay = totalKarmaUsed 
    ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
    : rollBox;

  // Shift display
  const totalShift = choice.totalShift;
  let shiftDisplay = "";
  if (totalShift !== 0) {
    const parts = [];
    if (choice.movementBonus) parts.push(`+${choice.movementBonus} movement`);
    if (choice.shift !== 0) parts.push(`${choice.shift > 0 ? '+' : ''}${choice.shift} manual`);
    const breakdownText = parts.join(', ') || `${totalShift > 0 ? '+' : ''}${totalShift} total`;
    const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
    shiftDisplay = ` (${csBox} → ${effectiveRank})`;
  }

  // Damage display
  let damageHtml;
  if (colorLower === "white") {
    damageHtml = `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;color:#666;">
      <strong>Damage:</strong> 0 (miss)
    </div>`;
  } else if (materialDefense > 0) {
    damageHtml = `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
      <strong>Damage:</strong> <span title="${damageSourceHover}" style="cursor:help;">${rawDamage}</span> - <span title="${choice.objectMaterial} Material Strength" style="cursor:help;">${materialDefense} material</span> = <strong>${damageToObject}</strong>
    </div>`;
  } else {
    damageHtml = `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
      <strong>Damage:</strong> <span title="${damageSourceHover}" style="cursor:help;"><strong>${rawDamage}</strong></span>
    </div>`;
  }

  const manualModeNotice = isManualMode ? `
    <div style="padding:4px 8px;margin:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;text-align:center;font-size:.85em;font-style:italic;color:#e65100;">
      Manual Mode: GM adjudicates damage and effects
    </div>
  ` : "";

  const cardHtml = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:#8b0000;">CHARGING</strong>
        <span style="color:#666;font-weight:normal;font-size:.85em;">${choice.areas} area${choice.areas > 1 ? 's' : ''} → ${targetLabel}</span>
      </div>
      
      <div style="padding:4px 10px;font-size:.95em;">
        <strong>${actor.name}</strong> <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${targetLabel}</strong>
        <span style="color:#999;font-size:.85em;">(${choice.objectMaterial} material)</span>
      </div>
      
      <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
        <div>Endurance: ${endurance.rank}${shiftDisplay}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Roll: ${rollDisplay}</span>
          <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
            ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
          </span>
        </div>
      </div>
      
      ${damageHtml}
      ${reboundNote}
      ${missNote}
      ${manualModeNotice}
    </div>
  `;

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

  // Auto-apply rebound to attacker in full auto
  if (!isManualMode && autoApply && colorLower !== "white" && damageToAttacker > 0) {
    const attackerToken = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (attackerToken) {
      await applyDamageToTargets({
        damage: damageToAttacker,
        attackerUuid: actor.uuid,
        damageType: "physical-blunt",
        showNotification: true,
        bypassArmor: true,
        attackForm: "charging-rebound",
        targets: [attackerToken],
        wasKillResult: false,
        forceKilling: false
      });
    }
  }

  // SFX for object target
  if (game.msh?.playCombatSFX) {
    await game.msh.playCombatSFX({
      actionType: "charging",
      damageType: "physical-blunt",
      rollResult: colorLower,
      isHit: colorLower !== "white",
      sourceName: `Charging (${choice.areas} areas)`
    });
  }

}
}
