//--- START OF FILE blunt-attack-action.js ---
// blunt-attack-action.js v1.3.0 - 2025-12-22
// v1.3.0: Show status on toggle buttons (Multi-Attack: Off/2 attacks/3 attacks/Adjacent, Pull Punch: Off/20 dmg/Yellow/etc)
// v1.2.0: Swap Multi-Attack/Pull Punch order, increase padding/font sizes throughout
// v1.1.2: Fix target name to use token name (shows "Counter-Strike 712" not just "Counter-Strike"), increase font sizes
// v1.1.1: Fix multi-attack toggle, add dynamic highlighting for non-default saved values
// v1.1.0: Compact dialog prototype - reorganized layout, target armor display, dynamic updates
// v1.0.1: Fix column shift persistence - always load from saved flag, not opts

// scripts/modules/actions/blunt-attack-action.js
import { AttackAction } from "./attack-action.js";
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets,
  buildMultiAttackSection, setupMultiAttackHandlers,
  buildModeSelector, attachModeSelectorHandlers, debugLog, setupModeSelector,
  applyCapabilitiesToDialog, buildInlineFeatDisplay
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { buildColorOutcome } from "../dice/color-results.js";
import { applyColumnShifts } from "../dice/column-shifts.js";
import { rollUniversalTable } from "../dice/universal-table.js";
// NOTE: resolveCombatMode not imported here to avoid circular dependency


export class BluntAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "blunt-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);
    let attackItems = actor.items.filter(isBluntCapable);

    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    if (passedItem && passedItem.type === "equipment") {
      // Add to list if not already present
      if (!attackItems.find(i => i.id === passedItem.id)) {
        attackItems = [passedItem, ...attackItems];
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    // 1. Check if we should remember settings from LocalStorage
    const lsRememberKey = "msh.ba.remember";
    const lsSkipKey = "msh.ba.skipDice";
    
    // Default to false if not set, or read value "1"/"0"
    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1"; 

    // 2. Load settings (Flag vs Default)
    // If remembering, load from actor flags. If not, force defaults.
    // Exception: passedItemId always overrides source default.
    const defaultSource = (passedItemId && passedItem?.type === "equipment") ? "weapon" : "hands";
    
    const savedSource = shouldRemember 
      ? ((await actor.getFlag("msh-faserip","lastBluntSource")) || defaultSource)
      : defaultSource;

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntItemId")) : "") || "";
    
    const savedObjectName = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntObjectName")) || "") : "";
    const savedObjectRank = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntObjectRank")) || "Excellent") : "Excellent";
    const savedObjectValue = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntObjectValue")) || 20) : 20;
    
    const savedPulledDamage = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntPulledDamage")) || 0) : 0;
    const savedResultCap = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntResultCap")) || "none") : "none";

    const savedMultiAttacks = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntMultiAttacks") || false) : false;
    const savedAttackCount = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntAttackCount") || 2) : 2;
    const savedMultiAdjacent = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntMultiAdjacent") || false) : false;
    const savedColumnShift  = shouldRemember ? (await actor.getFlag("msh-faserip","lastBluntShift") || 0) : 0;
    
    // Skip Dice is a client setting, mostly UI based, stored in LS
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // Get target info for armor display
    const targets = Array.from(game.user?.targets ?? []);
    const primaryTarget = targets[0] ?? null;
    const primaryTargetActor = primaryTarget?.actor ?? null;
    const targetName = primaryTarget?.name ?? (targets.length > 1 ? `${targets.length} targets` : "(none selected)");
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-blunt") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const initialDamage = strength.value;
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);

    // dialog HTML - Compact Prototype
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target</div>
          <div style="font-weight:600;color:#d32f2f;">${targetName}</div>
          <div style="color:#666;" id="target-armor-display">${primaryTargetActor ? `Armor: ${targetArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}` : ''}</div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Attack</div>
          <div style="font-weight:600;">${ability.name}: ${ability.rank}</div>
          <div style="color:#666;">Rank Value: ${ability.value}</div>
        </div>
      </div>

      <!-- Source Selection -->
      <div class="source-section" style="padding:8px;background:${savedSource !== 'hands' ? '#fff8e1' : '#fff'};border:1px solid ${savedSource !== 'hands' ? '#ffc107' : '#ddd'};border-radius:3px;margin-bottom:8px;">
        <div style="margin-bottom:4px;">
          <label><input type="radio" name="src" value="hands" ${savedSource==='hands'?'checked':''}> Hands</label>
          <label style="margin-left:12px;"><input type="radio" name="src" value="weapon" ${savedSource==='weapon'?'checked':''}> Weapon</label>
          <label style="margin-left:12px;"><input type="radio" name="src" value="object" ${savedSource==='object'?'checked':''}> Object</label>
          <span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:#2196F3;color:#fff;font-size:11px;font-weight:bold;cursor:help;margin-left:6px;" title="BLUNT DAMAGE RULES:
- Bare hands = Strength value
- Weapon material ≤ Strength: damage = Strength
- Weapon material > Strength: damage = next rank up from Strength

Common improvised weapons:
  Bottle/glass: Feeble (2)
  Trash can lid: Poor (4)
  Brick, wooden chair: Typical (6)
  Metal pipe, crowbar: Good (10)
  Car door: Excellent (20)
  Lamp post: Remarkable (30)
  Dumpster: Incredible (40)">?</span>
        </div>
        
        <div id="weapon-row" style="display:none;margin-top:6px;">
          <select name="item" style="width:100%;padding:4px;">${itemOptions || `<option value="">(none)</option>`}</select>
        </div>

        <div id="object-row" style="display:none;margin-top:6px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;">
            <label>Name:</label>
            <input type="text" name="objectName" value="${savedObjectName}" placeholder="rock, pipe..." style="padding:4px;">
            <label>Material:</label>
            <div style="display:flex;gap:4px;">
              <select name="objectRank" style="flex:1;padding:4px;">
                <option value="Feeble" ${savedObjectRank==='Feeble'?'selected':''}>Feeble</option>
                <option value="Poor" ${savedObjectRank==='Poor'?'selected':''}>Poor</option>
                <option value="Typical" ${savedObjectRank==='Typical'?'selected':''}>Typical</option>
                <option value="Good" ${savedObjectRank==='Good'?'selected':''}>Good</option>
                <option value="Excellent" ${savedObjectRank==='Excellent'?'selected':''}>Excellent</option>
                <option value="Remarkable" ${savedObjectRank==='Remarkable'?'selected':''}>Remarkable</option>
                <option value="Incredible" ${savedObjectRank==='Incredible'?'selected':''}>Incredible</option>
                <option value="Amazing" ${savedObjectRank==='Amazing'?'selected':''}>Amazing</option>
                <option value="Monstrous" ${savedObjectRank==='Monstrous'?'selected':''}>Monstrous</option>
                <option value="Unearthly" ${savedObjectRank==='Unearthly'?'selected':''}>Unearthly</option>
              </select>
              <input type="number" name="objectValue" value="${savedObjectValue}" style="width:50px;padding:4px;">
            </div>
          </div>
        </div>
      </div>

      <!-- Damage Preview -->
      <div id="preview" style="background:#e3f2fd;border:1px solid #2196f3;border-radius:3px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Damage:</strong> <span id="dmg-val">${initialDamage}</span> <span id="dmg-note" style="color:#555;">(Strength)</span></span>
          <span style="font-size:1.1em;" id="after-armor-display"><strong>→ ${initialAfterArmor} after armor</strong></span>
        </div>
      </div>

      <!-- Modifiers Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px;border-radius:3px;${savedColumnShift !== 0 ? 'background:#fff8e1;border:1px solid #ffc107;' : ''}">
          <label>CS:</label>
          <input type="number" name="shift" value="${savedColumnShift}" style="width:45px;padding:3px;text-align:center;">
          <span style="color:#666;font-size:.85em;" id="shifted-rank-display">→ ${shiftRank(ability.rank, savedColumnShift)}</span>
        </div>
        <div class="karma-field" style="display:flex;align-items:center;gap:4px;">
          ${generateKarmaControlsHTML(actor, 0)}
        </div>
      </div>

      <!-- Collapsible Advanced Options with status display -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <div class="multi-attack-toggle" style="background:${savedMultiAttacks || savedMultiAdjacent ? '#c8e6c9' : '#e8f5e9'};border:1px solid #4caf50;border-radius:3px;padding:6px 8px;cursor:pointer;">
          <span style="color:#2e7d32;">▸ Multi-Attack: <strong class="multi-status">${savedMultiAdjacent ? 'Adjacent' : savedMultiAttacks ? (savedAttackCount === 3 ? '3 attacks' : '2 attacks') : 'Off'}</strong></span>
        </div>
        <div class="pull-punch-toggle" style="background:${(savedPulledDamage > 0 && savedPulledDamage < strength.value) || savedResultCap !== 'none' ? '#ffebee' : '#fff3e0'};border:1px solid #ff9800;border-radius:3px;padding:6px 8px;cursor:pointer;">
          <span style="color:#e65100;">▸ Pull Punch: <strong class="pull-status">${(() => {
            const parts = [];
            if (savedPulledDamage > 0 && savedPulledDamage < strength.value) parts.push(savedPulledDamage + ' dmg');
            if (savedResultCap === 'yellow') parts.push('Yellow');
            if (savedResultCap === 'green') parts.push('Green');
            return parts.length ? parts.join(', ') : 'Off';
          })()}</strong></span>
        </div>
      </div>

      <!-- Multi-Attack Content (hidden by default) -->
      <div class="multi-attack-wrapper" style="display:none;margin-bottom:8px;">
        ${buildMultiAttackSection("blunt-attack", game.user.targets.size, savedMultiAttacks, savedAttackCount, savedMultiAdjacent)}
      </div>

      <!-- Pull Punch Content (hidden by default) -->
      <div class="pull-punch-section" style="display:none;margin-bottom:8px;padding:8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;">
          <label>Damage Cap:</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="number" name="pulledDamage" value="${savedPulledDamage || strength.value}" min="0" max="${strength.value}" style="width:60px;padding:4px;">
            <span style="color:#666;" id="dmg-cap-note">(max: ${strength.value})</span>
          </div>
          <label>Result Cap:</label>
          <select name="resultCap" style="padding:4px;">
            <option value="none" ${savedResultCap==='none'?'selected':''}>No Limit</option>
            <option value="yellow" ${savedResultCap==='yellow'?'selected':''}>Cap at Yellow</option>
            <option value="green" ${savedResultCap==='green'?'selected':''}>Cap at Green</option>
          </select>
        </div>
      </div>

      <!-- Footer -->
      <div id="msh-bottom-controls" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
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
            // ===== dialog-scoped query helpers =====
            const $content = $(html).find(".dialog-content").first();
            const $dlg = (sel) => html.find(sel); // only searches within this dialog

            // ===== read Remember/Skip checkboxes =====
            const rememberSettings = $content.find("#msh-remember-settings").length
              ? $content.find("#msh-remember-settings").prop("checked")
              : !!$dlg('[name="remember"]').is(':checked');

            const skipDice = $content.find("#msh-skip-dice").length
              ? $content.find("#msh-skip-dice").prop("checked")
              : !!$dlg('[name="skipDice"]').is(':checked');

            // ===== persist settings logic =====
            try {
              // Always save 'remember' preference to localStorage
              localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
              
              // Only save 'skipDice' if we are actually remembering settings
              // Or should skipDice be global? Usually it's nice to persist it.
              localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");

              if (rememberSettings) {
                const pullOpen  = $content.find(".frp-col-h:contains('Pull Punch')")
                                          .closest(".frp-collapsible").attr("data-open") === "1";
                const multiOpen = $content.find(".frp-col-h:contains('Multiple')")
                                          .closest(".frp-collapsible").attr("data-open") === "1";
                localStorage.setItem("msh.ba.pull.open",  pullOpen  ? "1" : "0");
                localStorage.setItem("msh.ba.multi.open", multiOpen ? "1" : "0");
              }
            } catch (e) {
              // ignore localStorage issues
            }

            // ===== gather form values =====
            const src          = $dlg('[name="src"]:checked').val() || "hands";
            const itemId       = $dlg('[name="item"]').val() || "";
            const objectName   = $dlg('[name="objectName"]').val() || "";
            const objectRank   = $dlg('[name="objectRank"]').val() || "Excellent";
            const objectValue  = parseInt($dlg('[name="objectValue"]').val() || 20);
            const shift        = parseInt($dlg('[name="shift"]').val() || 0);
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma        = karmaToSpend;
            const pulledDamage = parseInt($dlg('[name="pulledDamage"]').val() || 0);
            const resultCap    = $dlg('[name="resultCap"]').val() || "none";

            const multiAttacks  = !!$dlg('[name="multiAttacks"]').is(':checked');
            const attackCount   = parseInt($dlg('[name="attackCount"]:checked').val() || 2);
            const multiAdjacent = !!$dlg('[name="multiAdjacent"]').is(':checked');

            // ===== compute damage and notes =====
            let weaponMat = "", weaponName = "", damage = strength.value, note = "";
            if (src === "weapon") {
              const item = attackItems.find(i => i.id === itemId);
              weaponMat  = item ? getItemMaterialRank(item) : "Excellent";
              weaponName = item ? item.name : "";
              const res  = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
              damage = res.damage; note = res.note;
            } else if (src === "object") {
              weaponMat  = objectRank;
              weaponName = objectName || "Object";
              const res  = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
              damage = res.damage; note = res.note;
            } else {
              damage = strength.value;
              note   = "Bare Hands = Strength";
            }

            // ===== remember per-actor prefs (actor flags) =====
            // Only update flags if 'Remember Settings' is checked
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastBluntSource", src);
              await actor.setFlag("msh-faserip", "lastBluntPulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip", "lastBluntResultCap", resultCap);
              await actor.setFlag("msh-faserip", "lastBluntShift", shift);
              await actor.setFlag("msh-faserip", "cs_blunt-attack", shift);  // For macro compatibility
              await actor.setFlag("msh-faserip", "lastBluntKarma", karma);
              await actor.setFlag("msh-faserip", "karma_blunt-attack", karma);  // For macro compatibility
              await actor.setFlag("msh-faserip", "lastBluntMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastBluntAttackCount", attackCount);
              await actor.setFlag("msh-faserip", "lastBluntMultiAdjacent", multiAdjacent);

              if (src === "weapon") {
                await actor.setFlag("msh-faserip", "lastBluntItemId", itemId);
                await actor.setFlag("msh-faserip", "lastBluntColumnShift", shift); 
              } else if (src === "object") {
                await actor.setFlag("msh-faserip", "lastBluntObjectName", objectName);
                await actor.setFlag("msh-faserip", "lastBluntObjectRank", objectRank);
                await actor.setFlag("msh-faserip", "lastBluntObjectValue", objectValue);
              }
            }

            // ===== return all values to the caller =====
            resolve({
              src, itemId, objectName, objectRank, objectValue, shift, karma, spendKarma,
              pulledDamage, resultCap, skipDice, weaponMat, weaponName, damage, note,
              multiAttacks, attackCount, multiAdjacent
            });
          }
        },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');
          
          // Setup mode selector with centralized persistence
          await setupModeSelector(actor, html, this.opts || {}, "lastBluntMode");

          // Local storage helpers
          const getLS = (k, d=null) => {
            try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; }
          };
          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

          const update = () => {
            const src = html.find('[name="src"]:checked').val() || "hands";
            const $weaponRow = html.find('#weapon-row');
            const $objectRow = html.find('#object-row');
            const $val  = html.find('#dmg-val');
            const $note = html.find('#dmg-note');
            const $afterArmor = html.find('#after-armor-display');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $dmgCapNote   = html.find('#dmg-cap-note');
            const $shiftedRank  = html.find('#shifted-rank-display');

            // Hide both rows first
            $weaponRow.hide();
            $objectRow.hide();

            let maxDamage = strength.value;
            let currentDamage = strength.value;
            let noteText = "(Strength)";

            if (src === "weapon") {
              $weaponRow.show();
              const itemId = String(html.find('[name="item"]').val() || "");
              const item = attackItems.find(i => i.id === itemId) || null;
              const mat  = item ? getItemMaterialRank(item) : "Excellent";
              const res  = computeBluntDamage(strength.rank, strength.value, mat, RANKS);
              maxDamage = res.damage;
              currentDamage = res.damage;
              noteText = `(${item?.name || "Weapon"})`;
            } else if (src === "object") {
              $objectRow.show();
              const mat = String(html.find('[name="objectRank"]').val() || "Excellent");
              const res = computeBluntDamage(strength.rank, strength.value, mat, RANKS);
              maxDamage = res.damage;
              currentDamage = res.damage;
              const objName = html.find('[name="objectName"]').val() || "Object";
              noteText = `(${objName})`;
            }

            $val.text(currentDamage);
            $note.text(noteText);

            // Update after-armor display
            const afterArmorDmg = Math.max(0, currentDamage - targetArmor);
            if (primaryTarget) {
              $afterArmor.html(`<strong>→ ${afterArmorDmg} after armor</strong>`);
            } else {
              $afterArmor.html(`<strong>→ ${currentDamage} damage</strong>`);
            }

            // Update shifted rank display
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRank = shiftRank(ability.rank, cs);
            $shiftedRank.text(`→ ${shiftedRank}`);
            
            // Update CS field highlighting
            const $csField = html.find('.cs-field');
            if (cs !== 0) {
              $csField.css({ 'background': '#fff8e1', 'border': '1px solid #ffc107' });
            } else {
              $csField.css({ 'background': '', 'border': '' });
            }
            
            // Update source section highlighting
            const $sourceSection = html.find('.source-section');
            if (src !== 'hands') {
              $sourceSection.css({ 'background': '#fff8e1', 'border-color': '#ffc107' });
            } else {
              $sourceSection.css({ 'background': '#fff', 'border-color': '#ddd' });
            }

            // Update pull punch damage cap max
            $pulledDamage.attr('max', maxDamage);
            if (Number($pulledDamage.val()) > maxDamage) {
              $pulledDamage.val(maxDamage);
            }
            $dmgCapNote.text(`(max: ${maxDamage})`);

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          
          update();
          html.find('[name="src"]').on('change', update);
          html.find('[name="item"]').on('change', update);
          html.find('[name="shift"]').on('input change', update);
          html.find('[name="objectRank"]').on('change', function() {
            const rank = $(this).val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="objectValue"]').val(value);
            update();
          });
          html.find('[name="objectName"]').on('input', update);
          
          // Multi attack handlers - pass full html so it can find elements
          setupMultiAttackHandlers(html);

          // Pull punch status and color update
          const updatePullPunchStatus = () => {
            const $section = html.find('.pull-punch-section');
            const $toggle = html.find('.pull-punch-toggle');
            const $status = $toggle.find('.pull-status');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $resultCap = html.find('[name="resultCap"]');
            
            const maxDamage = Number($pulledDamage.attr('max'));
            const currentDamage = Number($pulledDamage.val());
            const resultCapValue = $resultCap.val();
            
            // Build status text
            const parts = [];
            if (currentDamage < maxDamage) parts.push(currentDamage + ' dmg');
            if (resultCapValue === 'yellow') parts.push('Yellow');
            if (resultCapValue === 'green') parts.push('Green');
            const statusText = parts.length ? parts.join(', ') : 'Off';
            $status.text(statusText);
            
            // Update colors
            const isPulling = parts.length > 0;
            $section.css('background', isPulling ? '#ffebee' : '#fff3e0');
            $toggle.css('background', isPulling ? '#ffebee' : '#fff3e0');
          };
          
          html.find('[name="pulledDamage"]').on('input change', updatePullPunchStatus);
          html.find('[name="resultCap"]').on('change', updatePullPunchStatus);
          
          // Also update pull punch status when source changes (max damage may change)
          html.find('[name="src"], [name="item"], [name="objectRank"]').on('change', () => {
            setTimeout(updatePullPunchStatus, 10); // Small delay to let update() finish first
          });
          
          applyCapabilitiesToDialog(html, "blunt-attack", { actor });

          // Collapsible toggle handlers
          const LS_PULL = "msh.ba.pull.open";
          const LS_MULTI = "msh.ba.multi.open";

          // Pull Punch toggle
          const $pullToggle = html.find('.pull-punch-toggle');
          const $pullSection = html.find('.pull-punch-section');
          let pullOpen = shouldRemember && getLS(LS_PULL, "0") === "1";
          if (pullOpen) {
            $pullSection.show();
            $pullToggle.find('span').html($pullToggle.find('span').html().replace('▸', '▾'));
          }
          $pullToggle.on('click', () => {
            pullOpen = !pullOpen;
            $pullSection.slideToggle(150);
            const $span = $pullToggle.find('span');
            $span.html(pullOpen ? $span.html().replace('▸', '▾') : $span.html().replace('▾', '▸'));
            if (html.find('#msh-remember-settings').prop('checked')) setLS(LS_PULL, pullOpen ? "1" : "0");
            if ($dialog.length) setTimeout(() => { $dialog[0].style.height = 'auto'; }, 160);
          });

          // Multi-Attack toggle
          const $multiToggle = html.find('.multi-attack-toggle');
          const $multiWrapper = html.find('.multi-attack-wrapper');
          let multiOpen = shouldRemember && getLS(LS_MULTI, "0") === "1";
          if (multiOpen) {
            $multiWrapper.show();
            $multiToggle.find('span').html($multiToggle.find('span').html().replace('▸', '▾'));
          }
          $multiToggle.on('click', () => {
            multiOpen = !multiOpen;
            $multiWrapper.slideToggle(150);
            const $span = $multiToggle.find('span');
            $span.html(multiOpen ? $span.html().replace('▸', '▾') : $span.html().replace('▾', '▸'));
            if (html.find('#msh-remember-settings').prop('checked')) setLS(LS_MULTI, multiOpen ? "1" : "0");
            if ($dialog.length) setTimeout(() => { $dialog[0].style.height = 'auto'; }, 160);
          });
          
          // Update multi-attack toggle status when checkboxes/radios change
          const updateMultiStatus = () => {
            const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
            const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
            const attackCount = html.find('[name="attackCount"]:checked').val();
            const $status = $multiToggle.find('.multi-status');
            
            // Build status text
            let statusText = 'Off';
            if (multiAdjacent) {
              statusText = 'Adjacent';
            } else if (multiAttacks) {
              statusText = attackCount === '3' ? '3 attacks' : '2 attacks';
            }
            $status.text(statusText);
            
            // Update color
            const isActive = multiAttacks || multiAdjacent;
            $multiToggle.css('background', isActive ? '#c8e6c9' : '#e8f5e9');
          };
          html.find('[name="multiAttacks"], [name="multiAdjacent"], [name="attackCount"]').on('change', updateMultiStatus);

          // Bottom controls persistence
          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        }
      }).render(true);
    });
    
    if (!choice) return;

    // Handle multiple adjacent targets (single roll @-4 CS)
    if (choice.multiAdjacent) {
      choice.shift = (choice.shift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

    // Handle multi-attacks (2 or 3 attacks, must make FEAT; all attacks @-1 CS)
    let actualAttackCount = 1;
    let multiAttackFeatResult = null;  // Store FEAT result for consolidated display
    
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
      
      // Store for consolidated display
      multiAttackFeatResult = { ...featResult, intensity, attackCount: choice.attackCount };
      
      // Check if using consolidated chat cards
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) { /* setting not registered yet */ }
      
      // Only show separate FEAT banner if NOT using consolidated mode
      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#eef6ff;border:1px solid #90caf9;border-radius:3px;padding:6px;margin:4px 0;">
            <b>Multi-Attack FEAT:</b> ${intensity} — ${
              featResult?.success ? "SUCCESS" : "FAIL"
            } ${featResult?.auto ? "(Automatic)" : ""}</div>`
        });
      }

      const featSuccess    = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
      const featImpossible =  !!(featResult?.resultColor === "IMPOSSIBLE");
      if (featSuccess && !featImpossible) {
        // Success: Make 2 or 3 attacks, each at -1CS
        actualAttackCount = choice.attackCount;
        choice.shift = (choice.shift || 0) - 1;
        ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS each!`);
      } else {
        // Failed: Only 1 attack at -3CS
        actualAttackCount = 1;
        choice.shift = (choice.shift || 0) - 3;
        ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack at -3CS.`);
      }
    }

    // Execute attacks
    const targetCount = game.user.targets.size || 1;

    if (choice.multiAdjacent && targetCount > 1) {
      // Single roll for all adjacent targets
      await this._executeSingleAttack({
        choice: { ...choice, multiAttackFeatResult },  // Pass FEAT result
        actor, ability,
        actionType, actionName, effects,
        damageType: "physical-blunt",
        rawDamage: choice.damage,
        damageNote: choice.note,
        sourceName: choice.weaponName || "Bare Hands",
        attackForm: "blunt",
        breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat } : null,
        targetCount
      });
    } else {
      // Build ordered target list once (at call time)
      const selected = Array.from(game.user?.targets ?? []);
      const count = Math.max(1, actualAttackCount);

      for (let i = 0; i < count; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 300));

        // On FEAT failure (count === 1), hit FIRST target only; on success, round-robin
        const tgt = (count === 1)
          ? (selected[0] ?? null)
          : (selected.length ? selected[i % selected.length] : null);

        await this._executeSingleAttack({
          // Only pass FEAT result on the first attack to avoid duplication
          choice: { ...choice, specificTarget: tgt, multiAttackFeatResult: i === 0 ? multiAttackFeatResult : null },
          actor, ability,
          actionType, actionName, effects,
          damageType: "physical-blunt",
          rawDamage: choice.damage,
          damageNote: choice.note,
          sourceName: choice.weaponName || "Bare Hands",
          attackForm: "blunt",
          breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat } : null,
          targetCount: 1
        });
      }
    }

  }
}