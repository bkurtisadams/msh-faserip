// scripts/modules/actions/force-action.js v2.0.0 - 2026-03-10
// v2.0.0: Refactor - dialog only, delegates resolution to _executeSingleAttack
// v1.6.0: Refactor chat card to use unified card builder utilities; remove dead old-style card variables
// v1.5.0: Add support for equipment items with Force (F) damage type (concussion pistols, etc.)
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
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma
} from "../dice/dice-roller.js";

import { 
  attachAutoFillRange,
  buildModeSelector,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  RANKS,
  setupModeSelector,
  applyCapabilitiesToDialog,
  shiftRank
} from "./action-utils.js";

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

    // Also include equipment items with Force (F) damage type
    const forceEquipment = actor.items.filter((i) => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      const damageType = String(s.damageType || "").toUpperCase();
      return damageType === "F" && s.category === "weapon";
    });
    forceItems = [...forceItems, ...forceEquipment];

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    // Accept both power and equipment items
    if (passedItem && (passedItem.type === "power" || passedItem.type === "equipment")) {
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
          <span class="multi-label" style="font-weight:600;color:#2e7d32;">Multi:</span>
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

          // Highlight dangerous sticky settings with bold red when active
          const updateWarnings = () => {
            const multiVal = html.find('[name="multiMode"]:checked').val();
            const $multiLabel = html.find('.multi-attack-section .multi-label');
            const $multiSection = html.find('.multi-attack-section');
            if (multiVal !== "off") {
              $multiLabel.css({ color: '#c62828', 'font-weight': '700' });
              $multiSection.css({ background: '#ffebee', 'border-color': '#ef5350' });
            } else {
              $multiLabel.css({ color: '#2e7d32', 'font-weight': '600' });
              $multiSection.css({ background: '#e8f5e9', 'border-color': '#a5d6a7' });
            }
          };
          updateWarnings();
          html.find('[name="multiMode"]').on('change', updateWarnings);
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

    // Reload mode from flags — respect global mode ceiling
    let globalMode = "semi";
    try { globalMode = game.settings.get("msh-faserip", "defaultCombatMode") || "semi"; } catch (_) {}
    const modeRank = { manual: 0, semi: 1, full: 2 };
    const globalRank = modeRank[globalMode] ?? 1;
    const savedMode = await actor.getFlag("msh-faserip", "lastForceMode") || "semi";
    const savedModeRank = modeRank[savedMode] ?? 1;
    this.opts.mode = savedModeRank <= globalRank ? savedMode : globalMode;
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

    // Build shift breakdown for display
    const shiftBreakdown = {
      manual: choice.shift || 0,
      range: choice.rangeModifier || 0,
      obstacle: choice.obstacleModifier || 0,
      movement: choice.movementModifier || 0,
      csNotes: choice.csNotes || ""
    };
    if (choice.multiAdjacent) shiftBreakdown.adjacent = -4;
    choice.shiftBreakdown = shiftBreakdown;

    // Resolve ability — use power rank if toggled
    const toHitAbility = choice.usePowerToHit
      ? { name: "Power", rank: choice.powerRank, value: RANKS[choice.powerRank] || 30 }
      : ability;

    const rawDamage = Number(choice.powerDamage) || 0;

    // Build a synthetic weapon-like reference for the power item (for SFX + chat header)
    const powerItem = choice.powerId ? actor.items.get(choice.powerId) : null;

    // Delegate to shared resolution pipeline
    const targetCount = choice.multiAdjacent ? targets.length : 1;

    await this._executeSingleAttack({
      choice: { ...choice, weapon: powerItem },
      actor,
      ability: toHitAbility,
      actionType,
      actionName,
      effects,
      damageType: "physical-force",
      rawDamage,
      damageNote: `Power: ${choice.powerName} (${choice.powerRank})`,
      sourceName: choice.powerName || "Force Blast",
      attackForm: "force",
      breakingFeat: null,
      targetCount,
      attackNumber: 1,
      totalAttacks: 1
    });

  } // end execute()
}