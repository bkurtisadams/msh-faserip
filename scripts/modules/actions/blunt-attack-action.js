//--- START OF FILE blunt-attack-action.js ---
// blunt-attack-action.js v1.4.3 - 2025-12-23
// v1.4.3: Yellow box on karma number, show multiple target names in dialog
// v1.4.2: Compact karma section to match CS field size
// v1.4.1: Fix pull punch persistence (save enabled state) and refresh value when source changes
// v1.4.0: Multi-Attack/Pull Punch as inline radio/checkbox rows, CS field with directional colors and reset button
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
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets,
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
    const savedPullEnabled = shouldRemember ? ((await actor.getFlag("msh-faserip","lastBluntPullEnabled")) || false) : false;
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
    
    // Build target display - show all names if multiple
    let targetDisplay = "(none selected)";
    if (targets.length === 1) {
      targetDisplay = primaryTarget.name;
    } else if (targets.length > 1) {
      targetDisplay = targets.map(t => t.name).join(", ");
    }
    
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-blunt") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st target)" : "";
    const initialDamage = strength.value;
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);

    // Karma info for compact display
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // dialog HTML - Compact Prototype
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <!-- Context: Target + Attack stats side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target${targets.length > 1 ? 's' : ''}</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay}</div>
          <div style="color:#666;" id="target-armor-display">${primaryTargetActor ? `Armor: ${targetArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}${armorNote}` : ''}</div>
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
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${savedColumnShift < 0 ? 'background:#ffebee;border:1px solid #ef5350;' : savedColumnShift > 0 ? 'background:#e8f5e9;border:1px solid #66bb6a;' : ''}">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${savedColumnShift}" style="width:45px;padding:3px;text-align:center;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display" style="${savedColumnShift < 0 ? 'color:#c62828;' : savedColumnShift > 0 ? 'color:#2e7d32;' : ''}">${shiftRank(ability.rank, savedColumnShift)}</strong>
          <button type="button" class="cs-reset" style="display:${savedColumnShift !== 0 ? 'inline-block' : 'none'};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>
        <div class="karma-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${hasKarma ? 'background:#f5f0e0;border:1px solid #c9b98a;' : ''}">
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

      <!-- Multi-Attack Row -->
      <div style="padding:6px 8px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:3px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;color:#2e7d32;">Multi:</span>
          <label title="Single attack, no penalty" style="cursor:pointer;"><input type="radio" name="multiMode" value="off" ${!savedMultiAttacks && !savedMultiAdjacent ? 'checked' : ''}> Off</label>
          <label title="Remarkable Fighting FEAT. Success: 2 attacks at -1CS each. Fail: 1 attack at -3CS." style="cursor:pointer;"><input type="radio" name="multiMode" value="2" ${savedMultiAttacks && savedAttackCount === 2 ? 'checked' : ''}> 2 atk</label>
          <label title="Amazing Fighting FEAT. Success: 3 attacks at -1CS each. Fail: 1 attack at -3CS." style="cursor:pointer;"><input type="radio" name="multiMode" value="3" ${savedMultiAttacks && savedAttackCount === 3 ? 'checked' : ''}> 3 atk</label>
          <label title="-4CS penalty, hits all adjacent targets with single roll." style="cursor:pointer;"><input type="radio" name="multiMode" value="adjacent" ${savedMultiAdjacent ? 'checked' : ''}> Adjacent</label>
        </div>
      </div>

      <!-- Pull Punch Row -->
      <div style="padding:6px 8px;background:#fff3e0;border:1px solid #ffcc80;border-radius:3px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label title="Voluntarily reduce damage" style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="pull-punch-enabled" ${savedPullEnabled ? 'checked' : ''}>
            <strong style="color:#e65100;">Pull Punch</strong>
          </label>
          <div class="pull-damage-controls" style="display:${savedPullEnabled ? 'flex' : 'none'};align-items:center;gap:4px;">
            <span>Cap:</span>
            <input type="number" name="pulledDamage" value="${savedPullEnabled && savedPulledDamage > 0 ? savedPulledDamage : strength.value}" min="0" max="${strength.value}" style="width:50px;padding:3px;text-align:center;">
            <span style="color:#666;font-size:.85em;">/ <span class="max-damage-display">${strength.value}</span></span>
          </div>
          <span style="color:#ccc;margin:0 2px;">|</span>
          <span style="color:#e65100;font-weight:600;">Result:</span>
          <label title="No result cap" style="cursor:pointer;"><input type="radio" name="resultCap" value="none" ${savedResultCap==='none'?'checked':''}> Any</label>
          <label title="Cap at Yellow (Slam max, no Stun)" style="cursor:pointer;"><input type="radio" name="resultCap" value="yellow" ${savedResultCap==='yellow'?'checked':''}> Yellow</label>
          <label title="Cap at Green (Hit max, no Slam/Stun)" style="cursor:pointer;"><input type="radio" name="resultCap" value="green" ${savedResultCap==='green'?'checked':''}> Green</label>
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
            
            // Pull punch - only use value if checkbox is checked
            const pullEnabled  = $dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const resultCap    = $dlg('[name="resultCap"]:checked').val() || "none";

            // Multi-attack - parse from radio
            const multiMode = $dlg('[name="multiMode"]:checked').val() || "off";
            const multiAttacks  = (multiMode === "2" || multiMode === "3");
            const attackCount   = (multiMode === "3") ? 3 : 2;
            const multiAdjacent = (multiMode === "adjacent");

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
              await actor.setFlag("msh-faserip", "lastBluntPullEnabled", pullEnabled);
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
            const $maxDmgDisplay = html.find('.max-damage-display');

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

            // Update shifted rank display with directional coloring
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRankText = shiftRank(ability.rank, cs);
            const $shiftedRank = html.find('#shifted-rank-display');
            $shiftedRank.text(shiftedRankText);
            
            // Update CS field highlighting based on direction
            const $csField = html.find('.cs-field');
            const $resetBtn = html.find('.cs-reset');
            if (cs < 0) {
              $csField.css({ 'background': '#ffebee', 'border': '1px solid #ef5350' });
              $shiftedRank.css('color', '#c62828');
              $resetBtn.show();
            } else if (cs > 0) {
              $csField.css({ 'background': '#e8f5e9', 'border': '1px solid #66bb6a' });
              $shiftedRank.css('color', '#2e7d32');
              $resetBtn.show();
            } else {
              $csField.css({ 'background': '', 'border': '' });
              $shiftedRank.css('color', '');
              $resetBtn.hide();
            }
            
            // Update source section highlighting
            const $sourceSection = html.find('.source-section');
            if (src !== 'hands') {
              $sourceSection.css({ 'background': '#fff8e1', 'border-color': '#ffc107' });
            } else {
              $sourceSection.css({ 'background': '#fff', 'border-color': '#ddd' });
            }

            // Update pull punch damage cap - always reset to new max when source changes
            const oldMax = Number($pulledDamage.attr('max')) || 0;
            $pulledDamage.attr('max', maxDamage);
            $maxDmgDisplay.text(maxDamage);
            // If max changed (source switched), reset value to new max
            if (oldMax !== maxDamage) {
              $pulledDamage.val(maxDamage);
            }

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
          
          // CS reset button handler
          html.find('.cs-reset').on('click', function(e) {
            e.preventDefault();
            html.find('[name="shift"]').val(0).trigger('change');
          });
          
          // Pull punch checkbox toggle
          html.find('#pull-punch-enabled').on('change', function() {
            const $controls = html.find('.pull-damage-controls');
            if (this.checked) {
              $controls.css('display', 'flex');
            } else {
              $controls.hide();
            }
          });
          
          applyCapabilitiesToDialog(html, "blunt-attack", { actor });

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