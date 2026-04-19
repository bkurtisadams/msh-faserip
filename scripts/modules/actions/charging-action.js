// scripts/modules/actions/charging-action.js v3.0.5 - 2026-04-19
// v3.0.5: Gate character-target rebound on isHit && color !== "white". Move
//         the rebound block into a postHitCallback so it only fires when the
//         attack actually connects. Previously fired unconditionally after
//         _executeSingleAttack returned — rebound was generating phantom
//         damage cards on evaded/dodged/missed charges (e.g. Rhino charges
//         Counter-Strike, Counter-Strike evades, rebound card still fires).
//         No contact = no absorption = no rebound. Object path already
//         gated correctly (line 844) — unchanged.
// v3.0.4: Attacker BA lookup now honors armorPhysical override (mirrors v3.0.3
//         target-side fix). Fixes attacker-side rebound absorption and
//         charging damage base when attacker has armorPhysical ≠ value.
// v3.0.3: Target BA auto-populate now honors armorPhysical override on the
//         Body Armor power (mirrors getBodyArmorValues() fallback order).
//         Previously read system.value only, causing a rebound-vs-mitigation
//         mismatch when armorPhysical ≠ value (e.g. Wartorn: value 14,
//         armorPhysical 16 — rebound used 14, mitigation used 16).
// v3.0.2: Fix rebound to match RAW + book example.
//         Rebound fires whenever target has BA > 0 (not only when target
//         fully absorbs the charge). Rebound amount = min(damage, targetBA),
//         the portion absorbed by the target's armor. Attacker takes
//         max(0, rebound - attackerBA). Matches Advanced Set example:
//         Gd End 10-speed (30 dmg) vs Ex BA (20) + Gd attacker BA → target
//         takes 10, attacker takes 10.
// v3.0.1: Fix rebound calculation — rebound amount is the attacker's rejected
//         damage (rawDamage), not the target's BA value. Previous formula
//         dramatically over-rebounded against high-BA targets (Thing, Hulk).
// v3.0.0: Port to v3 compact dialog layout matching blunt/edged/grappling
//         - frp-dlg wrapper, frp-header-v3 banner, titlebar mode buttons, 360px
//         - Movement box (orange), damage box (red), target type toggle (blue)
//         - CS box with situational dropdown, sit tags auto-build csNotes
//         - Pull/Karma in frp-opts-box, frp-fx-grid, frp-foot
// v2.0.1: Fix damageType "physical-blunt" → "physical-charging" so blocking armor
//         exclusion and other charging-specific rules apply correctly
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
  getBodyArmorValues,
  buildModeSelector,
  setupModeSelector,
  applyDamageToTargets
} from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

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
    bodyArmorValue = bodyArmorPower.system?.armorPhysical || bodyArmorPower.system?.value || 0;
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
      // Honor armorPhysical override first (matches getBodyArmorValues()
      // fallback order), then fall back to the rank's base value. Fixes
      // rebound-vs-mitigation mismatch when a Body Armor power has
      // armorPhysical ≠ value (e.g. Wartorn: value 14, armorPhysical 16).
      targetBAvalue = targetBApower.system?.armorPhysical || targetBApower.system?.value || 0;
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
  // DIALOG — v3 Compact Layout
  // ================================================================
  const enduranceAbbr = RANK_ABBR[endurance.rank] || endurance.rank;

  // Target info
  const targetHealth = primaryTargetActor?.system?.attributes?.health;
  const targetHealthStr = targetHealth ? `${targetHealth.value}/${targetHealth.max}` : "";
  const targetBAabbr = targetBAvalue > 0 ? `BA: ${RANK_ABBR[targetBArank] || targetBArank}(${targetBAvalue})` : "BA: None";
  const targetEffects = (primaryTargetActor?.effects?.filter(e => !e.disabled) ?? [])
    .filter(e => {
      const n = (e.name || e.label || '').toLowerCase();
      return !n.includes('body armor') && !n.includes('force field');
    });
  const targetStatusStr = targetEffects.length > 0
    ? targetEffects.map(e => e.name || e.label).join(", ")
    : "";

  const dialogHtml = `
  <div class="frp-dlg">

    <!-- Header: Actor (Base Endurance / Rank Value) charges Target -->
    <div class="frp-header-v3">
      <span class="h-actor" title="${actor.name}">${actor.name}</span>
      <span class="h-paren">(</span>
      <span class="h-stat">
        <span class="h-stat-label">Base Endurance</span>
        <span class="h-stat-rank">${enduranceAbbr} ${endurance.value}</span>
      </span>
      <span class="h-paren">)</span>
      ${targetDisplay
        ? `<span class="h-verb">charges</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
        : ''}
    </div>

    <!-- Target compact line -->
    ${primaryTarget ? `
    <div class="frp-target-compact">
      <span class="t-name">${targetDisplay}</span>
      ${targetHealthStr ? `<span class="t-hp">HP: ${targetHealthStr}</span>` : ''}
      ${targetStatusStr ? `<span class="t-status" style="font-size:10px;color:#6a1b9a;font-style:italic;">${targetStatusStr}</span>` : ''}
      <span class="t-armor">${targetBAabbr}</span>
    </div>
    ` : ''}

    <!-- Movement box (orange) -->
    <div class="frp-box" style="background:#fff3e0;border-color:#ff9800;padding:5px 10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;color:#e65100;text-transform:uppercase;">Areas</span>
        <input type="number" class="frp-cs-input" name="areas" value="${savedAreas}" min="1" max="20" style="border-color:#ff9800;">
        <span class="frp-cs-arrow">&rarr;</span>
        <span id="movement-bonus" style="font-family:'Oswald',sans-serif;font-weight:700;font-size:16px;color:#2e7d32;">+${initialMovementBonus} CS</span>
        <span style="font-size:11px;color:#999;">(max +3)</span>
      </div>
      <div style="font-size:11px;color:#777;margin-top:3px;">+1CS per area. Dmg = max(END, BA) + 2&times;areas.</div>
    </div>

    <!-- CS box -->
    <div class="frp-box frp-cs-box">
      <div class="frp-cs-line">
        <span class="frp-cs-label">CS</span>
        <input type="number" class="frp-cs-input" name="shift" value="${dialogShift}" id="cs-charging">
        <span class="frp-cs-arrow">&rarr;</span>
        <span class="frp-cs-rank" id="rank-charging">${shiftRank(endurance.rank, dialogShift + initialMovementBonus)}</span>
        <button type="button" class="frp-cs-reset" style="visibility:${dialogShift !== 0 ? 'visible' : 'hidden'}">&times;</button>
        <select class="frp-sit-select" id="sit-select">
          <option value="">+ situational&hellip;</option>
          <optgroup label="Bonuses">
            <option value="2" data-label="Blindside" title="Target unaware or from behind">Blindside +2CS</option>
            <option value="1" data-label="Higher Ground" title="Elevated position, terrain advantage">Higher Ground +1CS</option>
          </optgroup>
          <optgroup label="Penalties">
            <option value="-2" data-label="Impaired" title="Lost Endurance ranks, -2CS all actions">Impaired -2CS</option>
          </optgroup>
          <optgroup label="Target Size">
            <option value="1" data-label="Growth +1" title="Target 12-18ft">Growth 12-18ft +1CS</option>
            <option value="2" data-label="Growth +2" title="Target 18-22ft">Growth 18-22ft +2CS</option>
            <option value="3" data-label="Growth +3" title="Target 22ft+">Growth 22ft+ +3CS</option>
            <option value="-1" data-label="Shrink -1" title="Target ~1 inch">Shrunk 1&Prime; -1CS</option>
            <option value="-2" data-label="Shrink -2" title="Target ~1/4 inch">Shrunk &frac14;&Prime; -2CS</option>
            <option value="-3" data-label="Shrink -3" title="Target smaller">Shrunk smaller -3CS</option>
          </optgroup>
        </select>
      </div>
      <div class="frp-sit-tags" id="sit-tags"></div>
    </div>

    <!-- Damage box (red) -->
    <div class="frp-box frp-dmg-box" id="preview">
      <div class="frp-dmg-inline">
        <span class="frp-dmg-num" id="dmg-total">${initialTotalDamage}</span>
        <span style="font-size:12px;color:#777;" id="dmg-note">${initialBaseRankValue} base + 2&times;${savedAreas} speed</span>
        <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${Math.max(0, initialTotalDamage - targetBAvalue)} after armor` : `${initialTotalDamage} damage`}</span>
      </div>
      <div id="rebound-warning" style="display:none;margin-top:4px;padding:4px 6px;background:#fff;border:1px solid #f44336;border-radius:3px;font-size:11px;color:#d32f2f;font-weight:600;">
        Target defense &gt; damage &mdash; rebounds to you!
      </div>
    </div>

    <!-- Target type toggle (blue) -->
    <div class="frp-box" style="background:#f0f4ff;border-color:#90caf9;padding:4px 10px;">
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span style="font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;color:#1565c0;text-transform:uppercase;">Target</span>
        <label style="cursor:pointer;display:flex;align-items:center;gap:3px;"><input type="radio" name="targetType" value="character" ${savedTargetType === 'character' ? 'checked' : ''}> Character</label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:3px;"><input type="radio" name="targetType" value="object" ${savedTargetType === 'object' ? 'checked' : ''}> Object</label>
      </div>

      <!-- Character target sub-panel -->
      <div id="character-target-panel" style="display:${savedTargetType === 'character' ? 'flex' : 'none'};align-items:center;gap:6px;padding:4px 0;font-size:12px;">
        <span style="color:#777;">Body Armor:</span>
        <select name="targetBodyArmorRank" style="font-size:12px;padding:2px 4px;border:1px solid #b8b8b8;border-radius:2px;">${rankOptions}</select>
        <input type="number" name="targetBodyArmorValue" value="${savedTargetBAValue}" min="0" style="width:40px;padding:2px;text-align:center;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;">
      </div>

      <!-- Object target sub-panel -->
      <div id="object-target-panel" style="display:${savedTargetType === 'object' ? 'block' : 'none'};padding:4px 0;font-size:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="color:#777;">Desc:</span>
          <input type="text" name="objectDescription" value="${savedObjectDesc}" placeholder="Brick wall, Steel door..." style="flex:1;padding:2px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;">
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="color:#777;">Material:</span>
          <select name="objectMaterial" style="flex:1;font-size:12px;padding:2px 4px;border:1px solid #b8b8b8;border-radius:2px;">${materialOptions}</select>
        </div>
      </div>
    </div>

    <!-- Options: Pull / Karma -->
    <div class="frp-box frp-opts-box">
      <div class="frp-opt-row inactive" style="border-bottom:1px solid #e8e0d0;">
        <label><input type="checkbox" id="pull-punch-enabled"> <span class="frp-opt-label orange">Pull</span></label>
        <span style="font-size:11px;color:#777;">to</span>
        <input type="number" class="frp-pull-input" name="pulledDamage" value="${initialTotalDamage}" min="0" disabled>
        <span style="font-size:11px;color:#777;">Cap:</span>
        <select name="resultCap" style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;" disabled>
          <option value="none">None</option>
          <option value="yellow">Slam</option>
          <option value="green">Hit</option>
        </select>
      </div>
      <div class="frp-opt-row${!hasKarma ? ' inactive' : ' inactive'}">
        ${hasKarma ? `
          <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
          <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
        ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
      </div>
    </div>

    <!-- Effect preview grid -->
    <div class="frp-fx-grid">
      <div class="frp-fx-cell w">Miss<br><span style="font-size:9px;font-weight:400;opacity:0.7;">continue &frac12; spd</span></div>
      <div class="frp-fx-cell g">Hit<br><span style="font-size:9px;font-weight:400;opacity:0.7;">damage only</span></div>
      <div class="frp-fx-cell y">Slam<br><span style="font-size:9px;font-weight:400;opacity:0.7;">knockback</span></div>
      <div class="frp-fx-cell r">Stun<br><span style="font-size:9px;font-weight:400;opacity:0.7;">unconscious</span></div>
    </div>

    <!-- Footer -->
    <div class="frp-foot">
      <div class="frp-foot-btns">
        <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
        <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
      </div>
      <div class="frp-foot-checks">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    </div>

  </div>
  `;

  const choice = await new Promise(resolve => {
    let _resolved = false;
    const dlg = new Dialog({
      title: "Charging",
      content: dialogHtml,
      buttons: {},
      render: async (html) => {
        setupKarmaControlHandlers(html);
        const $dialog = html.closest('.dialog');

        // Hide Foundry's native button row
        $dialog.find('.dialog-buttons').hide();

        // Inject mode buttons into titlebar
        const $titlebar = $dialog.find('.window-title, .dialog-title').first();
        if ($titlebar.length) {
          const modeHtml = buildModeSelector({ mode: "semi" });
          const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
          $titlebar.after($modeWrap);
        }
        await setupModeSelector(actor, $dialog, this.opts || {}, "lastChargingMode");

        // Set dialog width
        if ($dialog.length) {
          $dialog.css('width', '360px');
          $dialog[0].style.height = 'auto';
        }

        // Auto-focus Roll button for keyboard Enter and focus ring
        html.find('#frp-roll').focus();

        // Intercept Enter key
        $dialog.on('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            html.find('#frp-roll').trigger('click');
          }
        });

        // ── Roll button handler ──
        html.find('#frp-roll').on('click', async () => {
          const $ = (sel) => html.find(sel);
          const areas = Math.max(1, Number($('[name="areas"]').val() || 1));
          const shift = Number($('[name="shift"]').val() || 0);
          const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
          const karma = karmaToSpend;
          const targetType = String($('[name="targetType"]:checked').val() || "character");
          const skipDice = !!$('#msh-skip-dice').is(':checked');
          const remember = !!$('#msh-remember-settings').is(':checked');

          const sitParts = [];
          html.find('.frp-sit-tag').each(function() {
            const label = $(this).data('label') || '';
            const cs = parseInt($(this).data('cs')) || 0;
            if (label) sitParts.push(`${label} ${cs > 0 ? '+' : ''}${cs}`);
          });
          const csNotes = sitParts.join(', ');

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

          let sitTagCS = 0;
          html.find('.frp-sit-tag').each(function() {
            sitTagCS += parseInt($(this).data('cs')) || 0;
          });
          const baseShift = shift - sitTagCS;

          if (remember) {
            await actor.setFlag("msh-faserip", "lastChargingAreas", areas);
            await actor.setFlag("msh-faserip", "lastChargingShift", baseShift);
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

          const pullEnabled   = !!html.find('#pull-punch-enabled').is(':checked');
          const pulledDamage  = pullEnabled ? parseInt(html.find('[name="pulledDamage"]').val() || 0) : 0;
          const resultCap     = pullEnabled ? (html.find('[name="resultCap"]').val() || "none") : "none";

          _resolved = true;
          resolve({
            areas, shift, karma, spendKarma, skipDice,
            targetType, targetBArank, targetBAvalue,
            objectMaterial, objectDesc,
            totalShift, movementBonus, csNotes,
            pulledDamage, resultCap
          });
          dlg.close();
        });

        // ── Cancel button handler ──
        html.find('#frp-cancel').on('click', () => {
          _resolved = true;
          resolve(null);
          dlg.close();
        });

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

          html.find('#dmg-total').text(totalDamage);
          html.find('#dmg-note').text(`${baseRankValue} base + 2×${areas} speed`);

          // Update pull punch max
          const $pulledDamage = html.find('[name="pulledDamage"]');
          $pulledDamage.attr('max', totalDamage);
          if (!html.find('#pull-punch-enabled').is(':checked')) {
            $pulledDamage.val(totalDamage);
          }

          const effectiveRank = shiftRank(endurance.rank, cs + movementBonus);
          const $shiftedRank = html.find('#rank-charging');
          $shiftedRank.text(effectiveRank);

          // CS display update
          const $csInput = html.find('.frp-cs-input[name="shift"]');
          const $resetBtn = html.find('.frp-cs-reset');
          $csInput.removeClass('pos neg');
          if (cs > 0) {
            $csInput.addClass('pos');
            $shiftedRank.css('color', '#2e7d32');
            $resetBtn.css('visibility', 'visible');
          } else if (cs < 0) {
            $csInput.addClass('neg');
            $shiftedRank.css('color', '#c62828');
            $resetBtn.css('visibility', 'visible');
          } else {
            $shiftedRank.css('color', '');
            $resetBtn.css('visibility', 'hidden');
          }

          // After-armor and rebound check
          const type = String(html.find('[name="targetType"]:checked').val() || "character");
          let targetDefense = 0;
          if (type === 'character') {
            targetDefense = Number(html.find('[name="targetBodyArmorValue"]').val() || 0);
          } else {
            const objectMat = String(html.find('[name="objectMaterial"]').val() || "Excellent");
            targetDefense = game.msh.getRankValue(objectMat) || 20;
          }

          const afterArmor = Math.max(0, totalDamage - targetDefense);
          html.find('#after-armor-display').text(targetDefense > 0 ? `${afterArmor} after armor` : `${totalDamage} damage`);

          const $warn = html.find('#rebound-warning');
          if (targetDefense > totalDamage) {
            $warn.show();
          } else {
            $warn.hide();
          }

          if ($dialog.length) $dialog[0].style.height = 'auto';
        };

        // ── Event bindings ──
        html.find('[name="areas"]').on('input change', updatePreview);
        html.find('[name="shift"]').on('input change', updatePreview);
        html.find('[name="targetType"]').on('change', togglePanels);
        html.find('[name="targetBodyArmorRank"]').on('change', () => {
          const rank = html.find('[name="targetBodyArmorRank"]').val();
          const value = game.msh.getRankValue(rank) || 0;
          html.find('[name="targetBodyArmorValue"]').val(value);
          updatePreview();
        });
        html.find('[name="targetBodyArmorValue"]').on('input', updatePreview);
        html.find('[name="objectMaterial"]').on('change', updatePreview);

        // CS reset — also remove sit tags
        html.find('.frp-cs-reset').on('click', function(e) {
          e.preventDefault();
          html.find('[name="shift"]').val(0);
          html.find('#sit-tags').empty();
          html.find('[name="shift"]').trigger('change');
        });

        // ── Situational modifier: apply on select ──
        html.find('#sit-select').on('change', function() {
          const $sel = $(this);
          const opt = $sel.find('option:selected');
          const cs = parseInt(opt.val());
          const label = opt.data('label') || '';
          if (!cs || !label) return;

          let exists = false;
          html.find('.frp-sit-tag').each(function() {
            if ($(this).data('label') === label) exists = true;
          });
          if (exists) { $sel.val(''); return; }

          const sign = cs > 0 ? '+' : '';
          const cls = cs < 0 ? ' penalty' : '';
          const tag = $(`<span class="frp-sit-tag${cls}" data-cs="${cs}" data-label="${label}">
            ${label} <span class="tag-cs">${sign}${cs}</span>
            <span class="tag-x">&times;</span>
          </span>`);
          html.find('#sit-tags').append(tag);

          const $csInput = html.find('[name="shift"]');
          $csInput.val(parseInt($csInput.val()) + cs).trigger('change');
          $sel.val('');
        });

        // ── Situational modifier: remove tag ──
        html.find('#sit-tags').on('click', '.tag-x', function() {
          const $tag = $(this).closest('.frp-sit-tag');
          const cs = parseInt($tag.data('cs')) || 0;
          const $csInput = html.find('[name="shift"]');
          $csInput.val(parseInt($csInput.val()) - cs).trigger('change');
          $tag.remove();
        });

        // Pull punch toggle
        html.find('#pull-punch-enabled').on('change', function() {
          const $row = $(this).closest('.frp-opt-row');
          const $pulledDamage = html.find('[name="pulledDamage"]');
          const $resultCap = html.find('[name="resultCap"]');
          $row.toggleClass('inactive', !this.checked);
          if (this.checked) {
            $pulledDamage.prop('disabled', false);
            $resultCap.prop('disabled', false);
          } else {
            $resultCap.val('none').prop('disabled', true);
            $pulledDamage.prop('disabled', true);
            updatePreview();
          }
        });

        // Karma toggle
        html.find('#spend-karma').on('change', function() {
          $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
        });

        togglePanels();
        updatePreview();
        applyCapabilitiesToDialog(html, "charging", { actor });
      },
      close: () => {
        if (!_resolved) resolve(null);
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

    // ============================================================
    // REBOUND CALLBACK (post-hit)
    // Per RAW (Advanced Set charging rule + book example):
    //   - Target takes (damage - targetBA), normal post-armor subtraction.
    //   - The absorbed portion, min(damage, targetBA), rebounds to attacker.
    //   - Attacker takes max(0, rebound - attackerBA).
    //
    // Book example: End Gd(10), 10-speed charge = 30 damage, target Ex BA(20),
    // attacker Gd BA(10). Target absorbs 20 (→ 10 through to HP). That same 20
    // rebounds; attacker absorbs 10, takes 10. Matches published outcome.
    //
    // Gated on isHit && color !== "white": no contact = no absorption = no
    // rebound. Evaded/dodged/missed attacks never touch the target's BA.
    // ============================================================
    const isManualMode = this.opts?.mode === "manual";
    const autoApply = !!this.opts?.autoApply;
    const dialogTargetBA = choice.targetBAvalue || 0;

    const reboundCallback = async ({ isHit, color, rawDamage: cbRawDamage }) => {
      if (!isHit || color === "white") return;
      if (dialogTargetBA <= 0 || cbRawDamage <= 0) return;

      const reboundAmount = Math.min(cbRawDamage, dialogTargetBA);
      const damageToAttacker = Math.max(0, reboundAmount - bodyArmorValue);
      const targetFullyAbsorbed = dialogTargetBA >= cbRawDamage;

      debugLog("Charging: Rebound triggered", {
        targetBA: dialogTargetBA,
        rawDamage: cbRawDamage,
        reboundAmount,
        attackerBA: bodyArmorValue,
        damageToAttacker,
        targetFullyAbsorbed
      });

      const targetLabel = targetName || "Target";
      const reboundCause = targetFullyAbsorbed
        ? `${targetLabel}'s defense (${dialogTargetBA}) fully absorbed the ${cbRawDamage} charging damage.`
        : `${targetLabel}'s defense (${dialogTargetBA}) absorbed ${reboundAmount} of ${cbRawDamage} charging damage.`;
      let reboundHtml = `
        <div style="background:#f5f5f0;border:1px solid #f44336;border-radius:3px;margin-bottom:5px;">
          <div style="padding:6px 10px;border-bottom:1px solid #f44336;background:#ffebee;">
            <strong style="color:#c62828;">CHARGING REBOUND</strong>
          </div>
          <div style="padding:8px 10px;font-size:.9em;">
            ${reboundCause}
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
            damageType: "physical-charging",
            showNotification: true,
            bypassArmor: true,
            attackForm: "charging-rebound",
            targets: [attackerToken],
            wasKillResult: false,
            forceKilling: false
          });
        }
      }
    };

    await this._executeSingleAttack({
      choice: mergedChoice,
      actor,
      ability: endurance,
      actionType,
      actionName,
      effects,
      damageType: "physical-charging",
      rawDamage,
      damageNote: damageSourceHover,
      sourceName: `Charging (${choice.areas} area${choice.areas > 1 ? 's' : ''})`,
      attackForm: "charging",
      breakingFeat: null,
      targetCount: 1,
      attackNumber: 1,
      totalAttacks: 1,
      postHitCallback: reboundCallback
    });

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
        damageType: "physical-charging",
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
      damageType: "physical-charging",
      rollResult: colorLower,
      isHit: colorLower !== "white",
      sourceName: `Charging (${choice.areas} areas)`
    });
  }

}
}