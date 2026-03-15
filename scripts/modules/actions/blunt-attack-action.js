//--- START OF FILE blunt-attack-action.js ---
// blunt-attack-action.js v1.5.0 - 2026-03-06
// v1.5.0: Restyle dialog with frp-dlg CSS classes from v3 mockup (attack-dialog.css), remove inline styles
// v1.4.16: Pass weapon base damage to computeBluntDamage for minimum damage enforcement
// v1.4.15: Detect and display combat talents (Martial Arts A/B/D/E, Boxing) in dialog
// v1.4.14: Add csNotes to shiftBreakdown for chat card hover text
// v1.4.13: Add CS Notes text input row between Modifiers and Multi-Attack, restore UI colors
// v1.4.12: UI color scheme - Damage=light red, Karma=light blue, border highlights on selection (Karma=dark blue, Multi=dark green, Pull=dark orange)
// v1.4.11: Use getTargetData() from action-utils.js for target acquisition
// v1.4.10: Compute initial pull punch max from saved source (weapon/object)
// v1.4.9: Auto-populate pulled damage to current max when enabling checkbox
// v1.4.8: Fix pull punch - reset resultCap and damage when checkbox unchecked
// v1.4.7: Track shiftBreakdown for detailed CS hover (manual, multi-attack, adjacent)
// v1.4.6: Compact pull punch row, add objectValue handler for damage update
// v1.4.5: Fix CS field jitter (box-sizing, visibility for reset btn, transparent border when CS=0)
// v1.4.4: Pass attackNumber/totalAttacks to chat card for multi-attack display
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
  getTargetData, getBodyArmorValues, applyDamageToTargets,
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

    // Detect combat talents that affect Fighting attacks
    const combatTalents = [];
    for (const item of actor.items) {
      if (item.type !== "talent") continue;
      const name = (item.name || "").toLowerCase();
      
      // Martial Arts B: +1CS Fighting
      if (name.includes("martial arts b") || name.includes("martial arts-b") || 
          (name.includes("martial arts") && name.includes("(b)"))) {
        combatTalents.push({ name: "Martial Arts B", bonus: "+1 CS" });
      }
      // Boxing: +1 CS to hit
      else if (name.includes("boxing")) {
        combatTalents.push({ name: "Boxing", bonus: "+1 CS" });
      }
      // Martial Arts A: Stun/Slam ignore Str/End (note only, no CS bonus)
      else if (name.includes("martial arts a") || name.includes("martial arts-a") ||
               (name.includes("martial arts") && name.includes("(a)"))) {
        combatTalents.push({ name: "Martial Arts A", bonus: "Stun/Slam ignores Str/End" });
      }
      // Martial Arts D: Ignore armor for effects
      else if (name.includes("martial arts d") || name.includes("martial arts-d") ||
               (name.includes("martial arts") && name.includes("(d)"))) {
        combatTalents.push({ name: "Martial Arts D", bonus: "Ignore armor (effects)" });
      }
      // Martial Arts E: +1 initiative
      else if (name.includes("martial arts e") || name.includes("martial arts-e") ||
               (name.includes("martial arts") && name.includes("(e)"))) {
        combatTalents.push({ name: "Martial Arts E", bonus: "+1 Initiative" });
      }
    }

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

    // Compute initial max damage based on saved source (for pull punch display)
    let initialMaxDamage = strength.value;
    if (savedSource === "weapon" && savedItemId) {
      const savedItem = attackItems.find(i => i.id === savedItemId);
      if (savedItem) {
        const mat = getItemMaterialRank(savedItem);
        let base = Number(savedItem.system?.damage || 0);
        const da = this.opts?.deviceAbility;
        if (da?.rank && savedItem?.system?.category === "device") {
          base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
        }
        const res = computeBluntDamage(strength.rank, strength.value, mat, base, RANKS);
        initialMaxDamage = res.damage;
      }
    } else if (savedSource === "object") {
      const res = computeBluntDamage(strength.rank, strength.value, savedObjectRank, 0, RANKS);
      initialMaxDamage = res.damage;
    }

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // Get target info for armor display
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    
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

    // Load CS Notes from actor flag
    const savedCsNotes = (await actor.getFlag("msh-faserip", "csNotes")) || "";

    // dialog HTML - Compact Prototype
    // Column shift initial CSS classes
    const csInputCls = savedColumnShift > 0 ? ' cs-pos' : savedColumnShift < 0 ? ' cs-neg' : '';
    const csResultCls = savedColumnShift > 0 ? ' positive' : savedColumnShift < 0 ? ' negative' : '';

    const dialogHtml = `
    <div class="frp-dlg">
      ${buildModeSelector({ mode: "semi" })}

      <!-- CS + Target side by side -->
      <div class="frp-top-grid">
        <div class="frp-box frp-cs-box">
          <div class="frp-box-label gold">Column Shift</div>
          <div class="frp-cs-line">
            <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedColumnShift}">
            <span class="frp-cs-arrow">→</span>
            <span class="frp-cs-result${csResultCls}" id="shifted-rank-display">${shiftRank(ability.rank, savedColumnShift)}</span>
            <button type="button" class="frp-cs-reset cs-reset" style="visibility:${savedColumnShift !== 0 ? 'visible' : 'hidden'}">×</button>
          </div>
          <input type="text" class="frp-cs-notes" name="csNotes" id="cs-notes-input" placeholder="e.g., MA-B +1, high ground +1" value="${savedCsNotes}">
          ${combatTalents.length > 0 ? `<div class="frp-cs-talents">${combatTalents.map(t => `${t.name}: ${t.bonus}`).join(', ')}</div>` : ''}
        </div>
        <div class="frp-box">
          <div class="frp-box-label muted">Target${targets.length > 1 ? 's' : ''}</div>
          <div class="frp-target-name">${targetDisplay}</div>
          <div class="frp-target-info" id="target-armor-display">${primaryTargetActor ? `Armor: ${targetArmor}${targetArmorSource ? ` (${targetArmorSource})` : ''}${armorNote}` : `${ability.name}: ${ability.rank} (${ability.value})`}</div>
        </div>
      </div>

      <!-- Source -->
      <div class="frp-box source-section${savedSource !== 'hands' ? ' src-active' : ''}" id="source-box">
        <div class="frp-src-line">
          <label><input type="radio" name="src" value="hands" ${savedSource==='hands'?'checked':''}> Hands</label>
          <label><input type="radio" name="src" value="weapon" ${savedSource==='weapon'?'checked':''}> Weapon</label>
          <label><input type="radio" name="src" value="object" ${savedSource==='object'?'checked':''}> Object</label>
          <span class="frp-info-dot" title="BLUNT DAMAGE RULES:\n- Bare hands = Strength value\n- Weapon material ≤ Strength: damage = Strength\n- Weapon material > Strength: damage = next rank up\n\nCommon improvised weapons:\n  Bottle/glass: Feeble (2)\n  Trash can lid: Poor (4)\n  Brick, chair: Typical (6)\n  Metal pipe: Good (10)\n  Car door: Excellent (20)\n  Lamp post: Remarkable (30)\n  Dumpster: Incredible (40)">?</span>
        </div>
        <div class="weapon-row" id="weapon-row" style="display:none">
          <select name="item">${itemOptions || `<option value="">(none)</option>`}</select>
        </div>
        <div class="object-row" id="object-row" style="display:none">
          <div class="obj-grid">
            <label>Name:</label>
            <input type="text" name="objectName" value="${savedObjectName}" placeholder="rock, pipe...">
            <label>Material:</label>
            <div class="obj-mat-row">
              <select name="objectRank">
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
              <input type="number" name="objectValue" value="${savedObjectValue}">
            </div>
          </div>
        </div>
      </div>

      <!-- Damage -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-row">
          <div class="frp-dmg-left">
            <span class="frp-dmg-label">Damage:</span>
            <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
            <span class="frp-dmg-note" id="dmg-note">(Strength)</span>
          </div>
          <div>
            <span class="frp-dmg-arrow">→</span>
            <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
          </div>
        </div>
      </div>

      <!-- Pull Punch -->
      <div class="frp-box frp-pull-box pull-punch-section${savedPullEnabled ? ' pull-active' : ''}" id="pull-box">
        <div class="frp-pull-line">
          <label>
            <input type="checkbox" id="pull-punch-enabled" ${savedPullEnabled ? 'checked' : ''}>
            <span class="frp-pull-label">Pull</span>
          </label>
          <span>damage to</span>
          <input type="number" class="frp-pull-dmg" name="pulledDamage" value="${savedPullEnabled && savedPulledDamage > 0 ? savedPulledDamage : initialMaxDamage}" min="0" max="${initialMaxDamage}">
          <span class="frp-pull-sep">Cap result at</span>
          <select class="frp-pull-cap-select" name="resultCap">
            <option value="none" ${savedResultCap==='none'?'selected':''}>None</option>
            <option value="yellow" ${savedResultCap==='yellow'?'selected':''}>Yellow</option>
            <option value="green" ${savedResultCap==='green'?'selected':''}>Green</option>
          </select>
        </div>
      </div>

      <!-- Multi -->
      <div class="frp-box frp-multi-box multi-attack-section${(savedMultiAttacks || savedMultiAdjacent) ? ' multi-active' : ''}" id="multi-box">
        <div class="frp-multi-line">
          <span class="frp-multi-label">Multi:</span>
          <label title="Single attack, no penalty"><input type="radio" name="multiMode" value="off" ${!savedMultiAttacks && !savedMultiAdjacent ? 'checked' : ''}> Off</label>
          <label title="Remarkable FEAT. Success: 2 attacks at -1CS. Fail: 1 at -3CS."><input type="radio" name="multiMode" value="2" ${savedMultiAttacks && savedAttackCount === 2 ? 'checked' : ''}> 2 atk</label>
          <label title="Amazing FEAT. Success: 3 attacks at -1CS. Fail: 1 at -3CS."><input type="radio" name="multiMode" value="3" ${savedMultiAttacks && savedAttackCount === 3 ? 'checked' : ''}> 3 atk</label>
          <label title="-4CS penalty, hits all adjacent targets."><input type="radio" name="multiMode" value="adjacent" ${savedMultiAdjacent ? 'checked' : ''}> Adjacent</label>
        </div>
      </div>

      <!-- Karma -->
      <div class="frp-box frp-karma-box${hasKarma ? ' karma-active' : ''}" id="karma-box">
        <div class="frp-karma-line">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> Spend Karma</label>
            <span class="frp-karma-pool">Pool: <strong>${availableKarma}</strong> available (min ${minKarma})</span>
          ` : `<label style="color:var(--txt-m);">No karma available</label>`}
        </div>
      </div>

      <!-- Footer -->
      <div class="frp-foot">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
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
            
            // Pull punch - only use values if checkbox is checked
            const pullEnabled  = $dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const resultCap    = pullEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";

            // Multi-attack - parse from radio
            const multiMode = $dlg('[name="multiMode"]:checked').val() || "off";
            const multiAttacks  = (multiMode === "2" || multiMode === "3");
            const attackCount   = (multiMode === "3") ? 3 : 2;
            const multiAdjacent = (multiMode === "adjacent");

            // CS Notes - read from input field
            const csNotes = $dlg('[name="csNotes"]').val() || "";

            // ===== compute damage and notes =====
            let weaponMat = "", weaponName = "", damage = strength.value, note = "";
            if (src === "weapon") {
              const item = attackItems.find(i => i.id === itemId);
              weaponMat  = item ? getItemMaterialRank(item) : "Excellent";
              weaponName = item ? item.name : "";
              let base = item ? Number(item.system?.damage || 0) : 0;
              // Device custom ability: use ability rank value as weapon base damage
              const da = this.opts?.deviceAbility;
              if (da?.rank && item?.system?.category === "device") {
                base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
                weaponName = `${da.name} (${item.name})`;
              }
              const res  = computeBluntDamage(strength.rank, strength.value, weaponMat, base, RANKS);
              damage = res.damage; note = res.note;
            } else if (src === "object") {
              weaponMat  = objectRank;
              weaponName = objectName || "Object";
              const res  = computeBluntDamage(strength.rank, strength.value, weaponMat, 0, RANKS);
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
            
            // Always save csNotes (explains current CS value)
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            // ===== return all values to the caller =====
            resolve({
              src, itemId, objectName, objectRank, objectValue, shift, karma, spendKarma,
              pulledDamage, resultCap, skipDice, weaponMat, weaponName, damage, note,
              multiAttacks, attackCount, multiAdjacent, csNotes
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
              let base = item ? Number(item.system?.damage || 0) : 0;
              const da = this.opts?.deviceAbility;
              if (da?.rank && item?.system?.category === "device") {
                base = Math.max(base, CONFIG.FASERIP?.rankValues?.[da.rank] || 0);
              }
              const res  = computeBluntDamage(strength.rank, strength.value, mat, base, RANKS);
              maxDamage = res.damage;
              currentDamage = res.damage;
              noteText = `(${da?.name ? `${da.name} — ${item?.name}` : item?.name || "Weapon"})`;
            } else if (src === "object") {
              $objectRow.show();
              const mat = String(html.find('[name="objectRank"]').val() || "Excellent");
              const res = computeBluntDamage(strength.rank, strength.value, mat, 0, RANKS);
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
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${currentDamage} damage`);
            }

            // Update shifted rank display with directional coloring
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRankText = shiftRank(ability.rank, cs);
            const $shiftedRank = html.find('#shifted-rank-display');
            const $csInput = html.find('.frp-cs-input');
            $shiftedRank.text(shiftedRankText);
            
            // Update CS input/result classes
            const $resetBtn = html.find('.cs-reset');
            $csInput.removeClass('cs-pos cs-neg');
            $shiftedRank.removeClass('positive negative');
            if (cs > 0) {
              $csInput.addClass('cs-pos');
              $shiftedRank.addClass('positive');
              $resetBtn.css('visibility', 'visible');
            } else if (cs < 0) {
              $csInput.addClass('cs-neg');
              $shiftedRank.addClass('negative');
              $resetBtn.css('visibility', 'visible');
            } else {
              $resetBtn.css('visibility', 'hidden');
            }
            
            // Update source section highlighting
            const $sourceSection = html.find('.source-section');
            if (src !== 'hands') {
              $sourceSection.addClass('src-active');
            } else {
              $sourceSection.removeClass('src-active');
            }

            // Update pull punch damage cap - always reset to new max when source changes
            const oldMax = Number($pulledDamage.attr('max')) || 0;
            $pulledDamage.attr('max', maxDamage);
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
          html.find('[name="objectValue"]').on('input change', update);
          html.find('[name="objectName"]').on('input', update);
          
          // CS reset button handler
          html.find('.cs-reset').on('click', function(e) {
            e.preventDefault();
            html.find('[name="shift"]').val(0).trigger('change');
          });
          
          // Pull punch checkbox toggle
          html.find('#pull-punch-enabled').on('change', function() {
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $section = html.find('.pull-punch-section');
            if (this.checked) {
              const currentMax = Number($pulledDamage.attr('max')) || strength.value;
              $pulledDamage.val(currentMax);
              $section.addClass('pull-active');
            } else {
              html.find('[name="resultCap"]').val('none');
              $pulledDamage.val($pulledDamage.attr('max'));
              $section.removeClass('pull-active');
            }
          });
          
          // Karma checkbox toggle
          html.find('#spend-karma').on('change', function() {
            html.find('#karma-box').toggleClass('karma-active', this.checked);
          });
          
          // Multi-attack toggle
          html.find('[name="multiMode"]').on('change', function() {
            const mode = html.find('[name="multiMode"]:checked').val();
            html.find('.multi-attack-section').toggleClass('multi-active', mode !== 'off');
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

    // Track shift breakdown for detailed display
    const shiftBreakdown = {
      manual: choice.shift || 0,  // User-entered CS from dialog
      multiAttack: 0,             // Multi-attack penalty (-1 success, -3 fail)
      adjacent: 0,                // Adjacent targets penalty (-4)
      csNotes: choice.csNotes || ""  // Explanation for the CS value
    };

    // Handle multiple adjacent targets (single roll @-4 CS)
    if (choice.multiAdjacent) {
      shiftBreakdown.adjacent = -4;
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
      
      // If user cancelled the FEAT dialog, abort the entire attack
      if (featResult?.cancelled) {
        ui.notifications.info("Multi-attack cancelled.");
        return;
      }
      
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
        shiftBreakdown.multiAttack = -1;
        choice.shift = (choice.shift || 0) - 1;
        ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS each!`);
      } else {
        // Failed: Only 1 attack at -3CS
        actualAttackCount = 1;
        shiftBreakdown.multiAttack = -3;
        choice.shift = (choice.shift || 0) - 3;
        ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack at -3CS.`);
      }
    }

    // Attach breakdown to choice for downstream use
    choice.shiftBreakdown = shiftBreakdown;

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
          targetCount: 1,
          attackNumber: i + 1,
          totalAttacks: count
        });
      }
    }

  }
}