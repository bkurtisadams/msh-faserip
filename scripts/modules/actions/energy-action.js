// scripts/modules/actions/energy-action.js v3.2.1 - 2026-05-16
// v3.2.1: Fix Reduce row's Any/Ylw/Grn radios stacking vertically when
//         Energy Generation triggers .result-cap-controls visibility.
//         Show with display:inline-flex (was inline) so the wrapper span
//         participates in the row's flex layout; paired CSS in
//         action-dialog.css makes the inner labels inline-flex.
// v3.2.0: Aim tactic — Bullseye-effect reinterpretation per RAW Tactics.
//         New Aim row in options box: Neutralize (Red→Yellow, disarm chat
//         note) or Stun (Yellow Bullseye → Stun chip via attack-action.js
//         pipeline). Persisted via lastEnergyAim actor flag; resolution
//         logic lives in attack-action.js v1.9.24.
// v3.1.0: Manual CS only — remove talent/power auto-detection, chips, sit-tags.
//         CS row is manual input + range penalty + ? reference panel via cs-modifiers.js.
//         PwrHit toggle moved to checkbox, uses setAbilityRank().
import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
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

import { RANK_ABBR, POWER_RANGE } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
import { isAuraMaintained } from "./nullify.js";

import { showFaseripDialog } from "./dialog-shim.js";
export class EnergyAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "energy";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // === Candidate powers ===
    let energyItems = actor.items.filter((i) => {
      if (i.type !== "power") return false;
      const s = i.system || {};
      if (s.isEnergyAttack === true) return true;
      if (s.isForceAttack || s.isBluntAttack || s.isEdgedAttack || s.isShootingAttack || s.isMentalAttack) return false;
      const cat = String(s.category || "").toLowerCase();
      const typ = String(s.type || "").toLowerCase();
      const catIsEnergy = cat === "energycontrol";
      const typeLooksEnergy = /\b(energy|light|electric|plasma|beam|blast|fire|cold|darkforce|radiation|heat|lightning)\b/.test(typ);
      return catIsEnergy || typeLooksEnergy;
    });

    const energyEquipment = actor.items.filter((i) => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      const damageType = String(s.damageType || "").toUpperCase();
      return damageType === "E" && s.category === "weapon";
    });
    energyItems = [...energyItems, ...energyEquipment];

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && (passedItem.type === "power" || passedItem.type === "equipment")) {
      if (!energyItems.find(i => i.id === passedItem.id)) {
        energyItems = [passedItem, ...energyItems];
      }
    }

    // === Restore prefs ===
    const lsRememberKey = "msh.energy.remember";
    const lsSkipKey = "msh.energy.skipDice";
    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyItemId") || "") : "");
    const savedRange = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyRange") || 1) : 1;

    let savedAdHoc = passedItem ? false : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyAdHoc") || (!energyItems.length)) : (!energyItems.length));
    let savedAdHocName = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyAdHocName") || "Energy Blast") : "Energy Blast";
    let savedAdHocDmg = Number(shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyAdHocDamage") || 20) : 20);
    let savedAdHocRank = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyAdHocRank") || "Remarkable") : "Remarkable";

    const deviceAbility = this.opts?.deviceAbility;
    if (deviceAbility) {
      savedAdHoc = true;
      savedAdHocName = `${deviceAbility.name}${passedItem ? ` (${passedItem.name})` : ""}`;
      savedAdHocRank = deviceAbility.rank || "Remarkable";
      savedAdHocDmg = CONFIG.FASERIP?.rankValues?.[deviceAbility.rank] || 20;
    }

    const savedUsePowerToHit = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastEnergyUsePowerToHit")) === true) : false;
    const savedColumnShift = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyShift") ?? 0) : 0;
    const savedMultiAdjacent = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyMultiAdjacent") || false) : false;
    const savedReduceDamage = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyReduceDamage") || false) : false;
    const savedReducedAmount = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyReducedAmount") || 0) : 0;
    const savedResultCap = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyResultCap") || "none") : "none";
    const savedAim = shouldRemember ? (await actor.getFlag("msh-faserip", "lastEnergyAim") || "none") : "none";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // === Target Info ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "energy") : null;
    const physicalArmor = targetArmorInfo?.physical ?? 0;
    const energyArmor = targetArmorInfo?.energy ?? 0;
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st)" : "";

    const targetHealth = primaryTargetActor?.system?.health;
    const targetHealthStr = targetHealth ? `${targetHealth.value}/${targetHealth.max}` : "";
    const targetEffects = (primaryTargetActor?.effects?.filter(e => !e.disabled) ?? [])
      .filter(e => {
        const n = (e.name || e.label || '').toLowerCase();
        return !n.includes('body armor') && !n.includes('force field');
      });
    const targetStatusStr = targetEffects.length > 0
      ? targetEffects.map(e => e.name || e.label).join(", ") : "";

    const armorDisplay = energyArmor > 0
      ? `BA: ${energyArmor}${physicalArmor !== energyArmor ? ` (${physicalArmor}-20)` : ''}${armorNote}`
      : "";

    const initialPower = energyItems.find(i => i.id === savedItemId) || energyItems[0];
    const initialPowerRank = savedAdHoc ? savedAdHocRank : (initialPower?.system?.rank ?? initialPower?.system?.powerRank ?? "Remarkable");
    const initialDamage = savedAdHoc ? savedAdHocDmg : (initialPower?.system?.damage || initialPower?.system?.value || 0);
    const initialAfterArmor = Math.max(0, initialDamage - energyArmor);
    const initialDisplayRank = savedUsePowerToHit ? initialPowerRank : ability.rank;

    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // Build CS row via shared utility (manual input + range + ? reference)
    const initialRangePenalty = (() => {
      const maxRange = this._getPowerRangeInAreas(initialPowerRank);
      return (savedRange > maxRange && maxRange > 0) ? -(savedRange - maxRange) : 0;
    })();
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      abilityRank: initialDisplayRank,
      rangePenalty: initialRangePenalty,
      showRange: true
    });

    // Build power source <select> options
    const powerSrcOptions = [];
    for (const item of energyItems) {
      const s = item.system || {};
      const dmg = Number(s.damage && s.damage > 0 ? s.damage : s.value) || 0;
      const rank = s.rank ?? s.powerRank ?? "Remarkable";
      const rankAbbr = RANK_ABBR[rank] || rank;
      const sel = (!savedAdHoc && item.id === savedItemId) ? 'selected'
        : (!savedAdHoc && !savedItemId && item === energyItems[0]) ? 'selected' : '';
      powerSrcOptions.push(`<option value="power:${item.id}" ${sel}>${item.name} &mdash; ${rankAbbr} (${dmg})</option>`);
    }
    powerSrcOptions.push(`<option value="adhoc" ${savedAdHoc ? 'selected' : ''}>Ad-hoc&hellip;</option>`);

    // ── Dialog HTML — v3 Compact Layout ──
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base ${ability.name}:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      ${targetDisplay ? `
      <div class="frp-target-compact">
        ${targetHealthStr ? `<span class="t-hp">HP ${targetHealthStr}</span>` : ''}
        ${armorDisplay ? `<span class="t-armor">${armorDisplay}</span>` : '<span class="t-armor" style="color:#999;">No armor</span>'}
        ${physicalArmor > 0 && physicalArmor !== energyArmor ? `<span style="font-size:10px;color:#1565c0;">(BA -20 vs Energy)</span>` : ''}
        ${targetStatusStr ? `<span class="t-status">${targetStatusStr}</span>` : ''}
      </div>` : ''}

      <!-- CS row (manual input + range + ? reference) -->
      ${csRowHtml}

      <!-- PwrHit toggle: use power rank instead of ability rank for to-hit -->
      <div style="padding:0 10px 2px;font-size:11px;">
        <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
          <input type="checkbox" id="pwr-hit-toggle" ${savedUsePowerToHit ? 'checked' : ''}>
          <span style="font-weight:600;color:#7b6b00;">PwrHit</span>
          <span style="color:#999;">use power rank to hit</span>
        </label>
      </div>

      <!-- Damage: power select + numbers inline -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="powerSource" id="power-source-select">
            ${powerSrcOptions.join('')}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
        </div>
        <div class="object-row" id="adhoc-row" style="display:${savedAdHoc ? 'block' : 'none'}">
          <div class="obj-grid">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocName}" placeholder="Energy Blast">
            <label>Rank:</label>
            <div class="obj-mat-row">
              <input type="text" name="adhocRank" value="${savedAdHocRank}" placeholder="Remarkable" style="flex:1;">
              <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:50px;">
            </div>
          </div>
        </div>
        <div style="font-size:10px;color:#999;margin-top:2px;">BA -20 vs Energy &bull; Kill: White = End Loss</div>
      </div>

      <!-- Range box (blue) -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${this._getPowerRangeInAreas(initialPowerRank)}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Reduce / Multi / Aim / Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!savedReduceDamage ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="reduce-damage-enabled" ${savedReduceDamage ? 'checked' : ''}> <span class="frp-opt-label orange">Reduce</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="reducedDamage" value="${savedReduceDamage && savedReducedAmount > 0 ? savedReducedAmount : initialDamage}" min="0" max="${initialDamage}" ${!savedReduceDamage ? 'disabled' : ''}>
          <span class="result-cap-controls" style="display:none;margin-left:4px;font-size:11px;">
            <label><input type="radio" name="resultCap" value="none" ${savedResultCap === 'none' ? 'checked' : ''}> Any</label>
            <label><input type="radio" name="resultCap" value="yellow" ${savedResultCap === 'yellow' ? 'checked' : ''}> Ylw</label>
            <label><input type="radio" name="resultCap" value="green" ${savedResultCap === 'green' ? 'checked' : ''}> Grn</label>
          </span>
          <span class="effect-note" style="font-size:10px;color:#888;margin-left:auto;">Effect &ne; reduced</span>
        </div>
        <div class="frp-opt-row${!savedMultiAdjacent ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${savedMultiAdjacent ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <span style="font-size:11px;color:#777;margin-left:8px;">Adjacent targets (-4CS)</span>
        </div>
        <div class="frp-opt-row${savedAim === 'none' ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="aim-enabled" ${savedAim !== 'none' ? 'checked' : ''}> <span class="frp-opt-label red">Aim</span></label>
          <select name="aimMode" ${savedAim === 'none' ? 'disabled' : ''} style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;margin-left:6px;">
            <option value="neutralize" ${savedAim === 'neutralize' ? 'selected' : ''}>Neutralize (disarm)</option>
            <option value="stun" ${(savedAim === 'stun' || savedAim === 'none') ? 'selected' : ''}>Stun</option>
          </select>
          <span style="font-size:10px;color:#888;margin-left:auto;">Bullseye effect</span>
        </div>
        <div class="frp-opt-row${!hasKarma ? ' inactive' : hasKarma ? ' inactive' : ''}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">${effects.white}</div>
        <div class="frp-fx-cell g">${effects.green}</div>
        <div class="frp-fx-cell y">${effects.yellow}</div>
        <div class="frp-fx-cell r">${effects.red}</div>
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

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

    const choice = await new Promise((resolve) => {
      let _csState = null;
      let _resolved = false;
      showFaseripDialog({
        title: actionName,
        content: dialogHtml,
        render: async (html, dlg) => {
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
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastEnergyMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // ── Wire CS panel from shared utility ──
          const _getCurrentRangePenalty = () => {
            const srcVal = html.find('#power-source-select').val() || "adhoc";
            const isAdHoc = srcVal === "adhoc";
            let currentRank = "Remarkable";
            if (isAdHoc) {
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = energyItems.find(i => i.id === itemId);
              if (item) currentRank = String(item.system?.rank ?? item.system?.powerRank ?? "Remarkable");
            }
            const maxRange = this._getPowerRangeInAreas(currentRank);
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            if (rangeVal > maxRange && maxRange > 0) return -(rangeVal - maxRange);
            return 0;
          };
          _csState = wireCSPanel(html, {
            abilityRank: initialDisplayRank,
            getRangePenalty: _getCurrentRangePenalty,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // ── PwrHit toggle — switch base ability rank ──
          html.find('#pwr-hit-toggle').on('change', function() {
            const srcVal = html.find('#power-source-select').val() || "adhoc";
            const isAdHoc = srcVal === "adhoc";
            let currentRank = "Remarkable";
            if (isAdHoc) {
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = energyItems.find(i => i.id === itemId);
              if (item) currentRank = String(item.system?.rank ?? item.system?.powerRank ?? "Remarkable");
            }
            _csState.setAbilityRank(this.checked ? currentRank : ability.rank);
          });

          // Auto-focus Roll button for keyboard Enter and focus ring
          html.find('#frp-roll').focus();

          // Intercept Enter key — trigger Roll instead of Foundry's native submit
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = $dlg("#msh-remember-settings").is(':checked');
            const skipDice = $dlg("#msh-skip-dice").is(':checked');
            setLS(lsRememberKey, rememberSettings ? "1" : "0");
            setLS(lsSkipKey, skipDice ? "1" : "0");

            const srcVal = $dlg('#power-source-select').val() || "adhoc";
            const useAdHoc = srcVal === "adhoc";

            let powerName = "", powerDamage = 0, powerRank = "Remarkable", powerId = null, prettyRange = "";
            let powerDamageType = "energy-generic";

            if (useAdHoc) {
              powerName = String($dlg('[name="adhocName"]').val() || "Energy Blast");
              powerDamage = Number($dlg('[name="adhocDamage"]').val() || 0);
              powerRank = String($dlg('[name="adhocRank"]').val() || "Remarkable");
              if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                ui.notifications.error("Enter a valid non-negative damage value.");
                return;
              }
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = energyItems.find(i => i.id === itemId);
              if (!item) {
                ui.notifications.error("Select an energy power or use ad-hoc.");
                return;
              }
              powerId = itemId;
              const s = item.system || {};
              powerName = item.name;
              powerDamage = Number(s.damage && s.damage > 0 ? s.damage : s.value) || 0;
              powerRank = String(s.rank ?? s.powerRank ?? "Remarkable");
              prettyRange = s.range === "rank"
                ? (POWER_RANGE[powerRank] || "")
                : String(s.calculatedRange || "");
              powerDamageType = s.damageType || "energy-generic";
            }

            const cs = _csState.get();
            const shift = cs.totalShift;
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;
            const usePowerToHit = !!html.find('#pwr-hit-toggle').is(':checked');
            const range = Number($dlg('[name="range"]').val() || 1);
            const multiAdjacent = !!$dlg('#multi-enabled').is(':checked');
            const reduceDamageEnabled = !!$dlg('#reduce-damage-enabled').is(':checked');
            const reducedDamage = reduceDamageEnabled ? parseInt($dlg('[name="reducedDamage"]').val() || powerDamage) : powerDamage;
            const resultCap = reduceDamageEnabled ? ($dlg('[name="resultCap"]:checked').val() || 'none') : 'none';
            const aimEnabled = $dlg('#aim-enabled').is(':checked');
            const aimMode = aimEnabled ? ($dlg('[name="aimMode"]').val() || "none") : "none";
            const csNotes = cs.csNotes;

            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastEnergyAdHoc", useAdHoc);
              await actor.setFlag("msh-faserip", "lastEnergyUsePowerToHit", usePowerToHit);
              await actor.setFlag("msh-faserip", "lastEnergyShift", cs.manualCS);
              await actor.setFlag("msh-faserip", "cs_energy", cs.manualCS);
              await actor.setFlag("msh-faserip", "lastEnergyMultiAdjacent", multiAdjacent);
              await actor.setFlag("msh-faserip", "lastEnergyAdHocName", powerName);
              await actor.setFlag("msh-faserip", "lastEnergyAdHocDamage", powerDamage);
              await actor.setFlag("msh-faserip", "lastEnergyAdHocRank", powerRank);
              await actor.setFlag("msh-faserip", "lastEnergyItemId", powerId || "");
              await actor.setFlag("msh-faserip", "lastEnergyRange", range);
              await actor.setFlag("msh-faserip", "lastEnergyReduceDamage", reduceDamageEnabled);
              await actor.setFlag("msh-faserip", "lastEnergyReducedAmount", reducedDamage);
              await actor.setFlag("msh-faserip", "lastEnergyResultCap", resultCap);
              await actor.setFlag("msh-faserip", "lastEnergyAim", aimMode);
            }
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            _resolved = true;
            resolve({
              powerName, powerDamage, powerRank, powerId, prettyRange,
              useAdHoc,
              shift, karma, spendKarma, range, skipDice, usePowerToHit,
              totalShift: shift,
              powerDamageType, multiAdjacent,
              reduceDamageEnabled, reducedDamage, resultCap,
              aimMode,
              csNotes
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          // ── Main update function (damage + range display only — CS handled by csState) ──
          const update = () => {
            const srcVal = html.find('#power-source-select').val() || "adhoc";
            const isAdHoc = srcVal === "adhoc";
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');

            let currentDamage = 0, currentRank = "Remarkable", isEnergyGeneration = false, isCorrosive = false;
            if (isAdHoc) {
              currentDamage = Number(html.find('[name="adhocDamage"]').val()) || 0;
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = energyItems.find(i => i.id === itemId);
              if (item) {
                const s = item.system || {};
                currentDamage = Number(s.damage && s.damage > 0 ? s.damage : s.value) || 0;
                currentRank = String(s.rank ?? s.powerRank ?? "Remarkable");
                const nameLower = item.name.toLowerCase();
                isEnergyGeneration = nameLower.includes('energy generation') ||
                  s.canReduceEffect === true || s.type?.toLowerCase() === 'energy generation';
                const dtLower = String(s.damageType || "").toLowerCase();
                isCorrosive = /corrosive|acid/.test(nameLower) || /corrosive|acid/.test(dtLower);
              }
            }

            // Energy Generation: show/hide result cap controls
            const $resultCapControls = html.find('.result-cap-controls');
            const $effectNote = html.find('.effect-note');
            if (isEnergyGeneration) {
              $resultCapControls.css('display', 'inline-flex');
              $effectNote.text('Energy Gen: can reduce effect').css('color', '#2e7d32');
            } else {
              $resultCapControls.hide();
              html.find('[name="resultCap"][value="none"]').prop('checked', true);
              $effectNote.text('Effect ≠ reduced').css('color', '#888');
            }

            // Corrosive: cannot reduce damage per rules. Lock reduce controls off.
            const $reduceToggle = html.find('#reduce-damage-enabled');
            const $reduceInput  = html.find('[name="reducedDamage"]');
            if (isCorrosive) {
              $reduceToggle.prop('checked', false).prop('disabled', true);
              $reduceInput.prop('disabled', true);
              $effectNote.text('Corrosive: damage cannot be reduced').css('color', '#bf360c');
            } else {
              $reduceToggle.prop('disabled', false);
              $reduceInput.prop('disabled', !$reduceToggle.is(':checked'));
            }

            html.find('#dmg-val').text(currentDamage);

            const afterArmorDmg = Math.max(0, currentDamage - energyArmor);
            html.find('#after-armor-display').text(
              primaryTarget ? `${afterArmorDmg} after armor` : `${currentDamage} damage`
            );

            // Update max range hint based on power rank
            const powerMaxRange = this._getPowerRangeInAreas(currentRank);
            html.find('#max-range-hint').text(powerMaxRange);

            // Range penalty — update CS panel and range info display
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const $rangePenalty = html.find('#range-penalty-display');
            if (rangeVal > powerMaxRange && powerMaxRange > 0) {
              const penalty = -(rangeVal - powerMaxRange);
              $rangePenalty.text(`${penalty}CS`).css('color', '#e65100');
              _csState.setRange(penalty);
            } else {
              $rangePenalty.text('');
              _csState.setRange(0);
            }

            // Update reduce damage max
            const $reducedDamage = html.find('[name="reducedDamage"]');
            const oldMax = Number($reducedDamage.attr('max')) || 0;
            $reducedDamage.attr('max', currentDamage);
            if (oldMax !== currentDamage) $reducedDamage.val(currentDamage);

            // Update PwrHit base rank if checked
            const usePwrHit = html.find('#pwr-hit-toggle').is(':checked');
            _csState.setAbilityRank(usePwrHit ? currentRank : ability.rank);

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          // ── Event wiring ──
          html.find('#power-source-select').on('change', update);
          html.find('[name="adhocDamage"], [name="adhocRank"]').on('input change', update);
          html.find('[name="range"]').on('input change', update);

          // Reduce damage toggle
          html.find('#reduce-damage-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            const $reducedDamage = html.find('[name="reducedDamage"]');
            $row.toggleClass('inactive', !this.checked);
            if (this.checked) {
              const currentMax = Number($reducedDamage.attr('max')) || 20;
              $reducedDamage.val(currentMax).prop('disabled', false);
              html.find('input[name="resultCap"]').prop('disabled', false);
            } else {
              $reducedDamage.val($reducedDamage.attr('max')).prop('disabled', true);
              html.find('input[name="resultCap"]').prop('disabled', true);
              html.find('input[name="resultCap"][value="none"]').prop('checked', true);
            }
          });

          // Multi toggle
          html.find('#multi-enabled').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          // Aim tactic toggle
          html.find('#aim-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="aimMode"]').prop('disabled', !this.checked);
          });

          // Karma toggle
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "energy", { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, update);

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });

          update();
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (!_resolved) resolve(null);
        }
      });
    });

    if (!choice) return;

    // Nullify RAW guard
    try {
      const maintaining = isAuraMaintained(actor);
      if (maintaining && !choice.useAdHoc && choice.powerId) {
        const thisItem = energyItems.find(i => i.id === choice.powerId);
        const isNullifyPower =
          (thisItem?.system?.damageType === 'nullification') ||
          (thisItem?.system?.primaryEffect === 'nullification') ||
          /nullif/i.test(thisItem?.name ?? '');
        const isInborn = (thisItem?.system?.source === 'natural');
        if (!isNullifyPower && isInborn) {
          ui.notifications.warn(`${actor.name} is maintaining Nullification and cannot use other inborn powers right now.`);
          return;
        }
      }
    } catch (e) {
      console.warn('Nullify aura guard check failed:', e);
    }

    // Handle adjacent multi
    if (choice.multiAdjacent) {
      choice.totalShift = (choice.totalShift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

    // Mode already set by setupModeSelector during dialog render
    const mode = this.opts.mode;

    // Build shift breakdown (range penalty baked into CS via auto sit tag)
    const shiftBreakdown = {
      manual: choice.shift || 0,
      csNotes: choice.csNotes || ""
    };
    if (choice.multiAdjacent) shiftBreakdown.adjacent = -4;
    choice.shiftBreakdown = shiftBreakdown;

    const toHitAbility = choice.usePowerToHit
      ? { name: "Power", rank: choice.powerRank, value: RANKS[choice.powerRank] || 30 }
      : ability;

    const baseDamage = choice.reduceDamageEnabled ? choice.reducedDamage : choice.powerDamage;
    const rawDamage = Number(baseDamage) || 0;
    const powerItem = choice.powerId ? actor.items.get(choice.powerId) : null;
    const targetCount = choice.multiAdjacent ? targets.length : 1;

    // Corrosive attacks bypass Force Fields per RAW:
    // "Corrosive attacks must hit the target, and as such have no effect on
    // Force Fields and the like." Body Armor still applies normally — the
    // burn-through FEAT is a separate optional check, not a bypass.
    const _pwNameLc = String(powerItem?.name || choice.powerName || "").toLowerCase();
    const _pwDtLc = String(powerItem?.system?.damageType || choice.powerDamageType || "").toLowerCase();
    const _isCorrosive = /corrosive|acid/.test(_pwNameLc) || /corrosive|acid/.test(_pwDtLc);
    const choiceForAttack = {
      ...choice,
      weapon: powerItem,
      bypassForceField: !!choice.bypassForceField || _isCorrosive
    };

    await this._executeSingleAttack({
      choice: choiceForAttack,
      actor,
      ability: toHitAbility,
      actionType, actionName, effects,
      damageType: choice.powerDamageType || "energy-generic",
      rawDamage,
      damageNote: `Power: ${choice.powerName} (${choice.powerRank})`,
      sourceName: choice.powerName || "Energy Blast",
      attackForm: "energy",
      breakingFeat: null,
      targetCount,
      attackNumber: 1,
      totalAttacks: 1
    });

  } // end execute()
}