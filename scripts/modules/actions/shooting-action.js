// shooting-action.js v3.3.0 - 2026-03-17
// v3.3.0: Manual CS only — remove talent/power auto-detection and auto-mods.
//         CS row is a simple number input + ? reference panel.
//         Range penalty still displayed in Range box (informational).
// v3.1.0: Separate talent row from CS input — talents in own green box above CS,
//         CS input is purely manual/situational. Eliminates CS drift across sessions.
//         Net row shows combined breakdown. Compact single-row footer with inline buttons.
// v3.0.0: Port to v3 compact layout — header-v3, CS box with talent chips + situational dropdown,
//         inline damage row with weapon select, range info box, opts box (multi x2/x3 + karma)
//         with greyed inactive rows, FX grid, titlebar mode injection, 360px width.
//         Range/movement/obstacle modifiers now applied via situational tags feeding CS total.
// v2.0.0: Complete dialog redesign to match blunt-attack-action.js structure

import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildModeSelector,
  buildResultGrid,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  RANKS,
  rollWithKarmaAndHistory,
  setupModeSelector,
  applyCapabilitiesToDialog,
  shiftRank,
  buildInlineFeatDisplay
} from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { playCombatSFX } from "./audio-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

export class ShootingAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "shooting";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName);

    // === Find shooting weapons ===
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;

    let shootingWeapons = actor.items.filter(i => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      const tagHit = Array.isArray(s.tags) && (s.tags.includes("S") || s.tags.includes("shooting"));
      return (s.damageType === "S") || (s.attackType === "shooting") || tagHit;
    });

    if (passedItem && passedItem.type === "equipment") {
      if (!shootingWeapons.find(i => i.id === passedItem.id)) {
        shootingWeapons = [passedItem, ...shootingWeapons];
      }
    }

    if (!shootingWeapons.length) {
      if (this.opts?.deviceAbility) {
        const deviceItems = actor.items.filter(i => {
          if (i.type !== "equipment") return false;
          return i.system?.category === "device";
        });
        if (deviceItems.length) shootingWeapons = deviceItems;
      }
      if (!shootingWeapons.length) {
        ui.notifications.warn(`${actor.name} has no shooting weapons.`);
        return;
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.shooting.remember";
    const lsSkipKey = "msh.shooting.skipDice";

    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastShootingItemId")) : "") || "";
    const savedRange = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingRange")) || 1) : 1;
    const savedColumnShift = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingShift")) || 0) : 0;
    const savedMultiAttacks = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingMultiAttacks")) || false) : false;
    const savedAttackCount = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingAttackCount")) || 2) : 2;
    const savedVariantType = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingVariant")) || "") : "";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // === Target info ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();

    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-ranged") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";

    // === Initial weapon info ===
    const initialWeapon = shootingWeapons.find(i => i.id === savedItemId) || shootingWeapons[0];
    const initialWeaponRange = initialWeapon?.system?.range || 15;
    const initialWeaponDamage = initialWeapon?.system?.damage || 0;

    // Variant/special ammo helpers
    const _buildVariantOptions = (weapon, currentVariant) => {
      const sa = weapon?.system?.specialAmmo || {};
      const saved = currentVariant || weapon?.system?.variantType || "standard";
      const opts = [{ v: "standard", label: "Standard" }];
      if (sa.ap)         opts.push({ v: "ap",        label: "Armor Piercing" });
      if (sa.mercy)      opts.push({ v: "mercy",     label: "Mercy/Non-Lethal" });
      if (sa.rubber)     opts.push({ v: "rubber",    label: "Blunted/Rubber" });
      if (sa.explosive)  opts.push({ v: "explosive", label: "Explosive" });
      if (sa.canister)   opts.push({ v: "canister",  label: "Canister Shot" });
      if (sa.heatSeeker) opts.push({ v: "heatSeeker", label: "Heat-Seeker" });
      if (sa.powerPack)  opts.push({ v: "powerPack", label: "Power Pack" });
      if (opts.length === 1) return "";
      return opts.map(o => `<option value="${o.v}" ${o.v === saved ? "selected" : ""}>${o.label}</option>`).join("");
    };
    const _getEffectiveAPForVariant = (weapon, variantType) => {
      if (variantType === "ap") return { ap: 0, apCS: 2, apMode: "cs", bypassFF: false };
      return {
        ap: Number(weapon?.system?.armorPiercing || 0) || 0,
        apCS: Number(weapon?.system?.armorPiercingCS || 0) || 0,
        apMode: weapon?.system?.apMode || "value",
        bypassFF: !!weapon?.system?.bypassForceField
      };
    };
    const _getEffectiveArmor = (base, ap, apCS, apMode) => {
      if (apMode === "cs" && apCS > 0 && base > 0) {
        const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
        let _i = _RV.findIndex(v => v >= base);
        if (_i < 0) _i = _RV.length - 1;
        if (_i > 0 && _RV[_i] > base) _i--;
        return _RV[Math.max(0, _i - apCS)];
      }
      return Math.max(0, base - ap);
    };

    const initialVariant = savedVariantType || initialWeapon?.system?.variantType || "standard";
    const initialVariantOptions = _buildVariantOptions(initialWeapon, initialVariant);
    const initialAPInfo = _getEffectiveAPForVariant(initialWeapon, initialVariant);
    const initialEffArmor = _getEffectiveArmor(targetArmor, initialAPInfo.ap, initialAPInfo.apCS, initialAPInfo.apMode);
    const initialAfterArmor = Math.max(0, initialWeaponDamage - initialEffArmor);
    const initialAPLabel = (initialAPInfo.apMode === "cs" && initialAPInfo.apCS > 0) ? `${initialAPInfo.apCS}CS` : (initialAPInfo.ap > 0 ? String(initialAPInfo.ap) : "");

    // === Karma ===
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // === Build weapon damage source <select> ===
    const damageSrcOptions = shootingWeapons.map(i => {
      const dmg = Number(i.system?.damage || 0);
      const rng = Number(i.system?.range || 0);
      const ap = Number(i.system?.armorPiercing || 0) || 0;
      const apLabel = ap > 0 ? ` [AP ${ap}]` : "";
      const sel = (i.id === savedItemId || (!savedItemId && i.id === initialWeapon?.id)) ? 'selected' : '';
      return `<option value="${i.id}" ${sel}>${i.name} &mdash; ${dmg} dmg / ${rng} areas${apLabel}</option>`;
    }).join('');

    // === Build CS row via shared utility (manual input + range + ? reference) ===
    const initialRangePenalty = savedRange > 1 ? -(savedRange - 1) : 0;
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      abilityRank: ability.rank,
      rangePenalty: initialRangePenalty,
      showRange: true
    });

    // === Dialog HTML — v3.2 Mods Panel Layout ===
    const multiEnabled = savedMultiAttacks;

    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Agility / Rank Value) attacks Target -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Agility:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      ${primaryTarget ? `
      <div class="frp-target-compact">
        <span class="t-name">${targetDisplay}</span>
        ${targetArmorAbbr ? `<span class="t-armor">BA: ${targetArmorAbbr}(${targetArmor})</span>` : ''}
      </div>` : ''}

      <!-- CS row with Mods dropdown (from shared utility) -->
      ${csRowHtml}

      <!-- Damage: weapon select + numbers inline -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="weapon" id="damage-source-select">
            ${damageSrcOptions}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialWeaponDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialWeaponDamage} damage`}</span>
        </div>
        <!-- AP indicator -->
        <div id="ap-display" style="font-size:11px;color:#1565c0;margin-top:2px;${initialAPLabel ? '' : 'display:none;'}">
          AP: <strong id="ap-val">${initialAPLabel}</strong>
        </div>
        <!-- Variant ammo row (hidden if no variants) -->
        ${initialVariantOptions ? `
        <div class="object-row" id="variant-row" style="margin-top:3px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:12px;white-space:nowrap;">Ammo:</label>
            <select name="variantType" id="variant-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">${initialVariantOptions}</select>
          </div>
        </div>` : ""}
      </div>

      <!-- Range info box (blue) — auto-filled from token distance -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" readonly class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${initialWeaponRange}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Multi / Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!multiEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${multiEnabled ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <label style="margin-left:8px;"><input type="radio" name="multiCount" value="2" ${(!savedMultiAttacks || savedAttackCount === 2) ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;2</label>
          <label><input type="radio" name="multiCount" value="3" ${savedAttackCount === 3 ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;3</label>
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
        <div class="frp-fx-cell w">${effects.white}</div>
        <div class="frp-fx-cell g">${effects.green}</div>
        <div class="frp-fx-cell y">${effects.yellow}</div>
        <div class="frp-fx-cell r">${effects.red}</div>
      </div>

      <!-- Footer: checkboxes + buttons on one row -->
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

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) {} };

    const choice = await new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      const dlg = new Dialog({
        title: actionName,
        content: dialogHtml,
        buttons: {},
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          $dialog.find('.dialog-buttons').hide();

          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastShootingMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

          // ── Wire CS panel from shared utility ──
          // getRangePenalty reads live range from the dialog
          const _getCurrentRangePenalty = () => {
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const weaponId = html.find('#damage-source-select').val() || "";
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const maxRange = weapon?.system?.range || 15;
            if (rangeVal > maxRange) return 0; // out of range — handled separately
            return rangeVal > 1 ? -(rangeVal - 1) : 0;
          };
          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            getRangePenalty: _getCurrentRangePenalty,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // ── Main update function (weapon/damage/range only — CS handled by csState) ──
          const update = () => {
            const weaponId = html.find('#damage-source-select').val() || "";
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const $val = html.find('#dmg-val');
            const $afterArmor = html.find('#after-armor-display');
            const $apDisplay = html.find('#ap-display');
            const $apVal = html.find('#ap-val');

            const currentDamage = weapon?.system?.damage || 0;
            const currentRange = weapon?.system?.range || 15;
            const variantType = html.find('[name="variantType"]').val() || "standard";
            const apInfo = _getEffectiveAPForVariant(weapon, variantType);

            $val.text(currentDamage);
            html.find('#max-range-hint').text(currentRange);

            // AP display
            const apLabel = (apInfo.apMode === "cs" && apInfo.apCS > 0) ? `${apInfo.apCS}CS` : (apInfo.ap > 0 ? String(apInfo.ap) : "");
            if (apLabel) { $apDisplay.show(); $apVal.text(apLabel); } else { $apDisplay.hide(); }

            // After-armor display
            const effArmor = _getEffectiveArmor(targetArmor, apInfo.ap, apInfo.apCS, apInfo.apMode);
            const afterArmorDmg = Math.max(0, currentDamage - effArmor);
            if (primaryTarget) {
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${currentDamage} damage`);
            }

            // Range penalty — update CS panel and range info display
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const $rangePenalty = html.find('#range-penalty-display');

            if (rangeVal > currentRange) {
              $rangePenalty.text('OUT OF RANGE').css('color', '#c62828');
              _csState.setRange(0);
            } else {
              const penalty = rangeVal > 1 ? -(rangeVal - 1) : 0;
              $rangePenalty.text(penalty < 0 ? `${penalty}CS` : '').css('color', '#e65100');
              _csState.setRange(penalty);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          update();

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

            try {
              localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
              localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");
            } catch (e) {}

            const weaponId = String($dlg('[name="weapon"]').val() || "");
            const weapon = shootingWeapons.find(i => i.id === weaponId);

            if (!weapon) {
              ui.notifications.error("No weapon selected!");
              return;
            }

            // Get CS state from shared utility
            const cs = _csState.get();

            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;
            const range = Number($dlg('[name="range"]').val() || 1);
            const variantType = $dlg('[name="variantType"]').val() || weapon.system?.variantType || "standard";

            const multiEnabled = $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAttacks = multiEnabled;
            const attackCount = (multiCountVal === "3") ? 3 : 2;

            // Weapon stats + AP
            const weaponRange = weapon.system?.range || 15;
            const weaponDamage = weapon.system?.damage || 0;
            const _apInfo = _getEffectiveAPForVariant(weapon, variantType);

            // Range validation
            if (range > weaponRange) {
              ui.notifications.error(`Target is beyond weapon range (${weaponRange} areas)!`);
              return;
            }

            // Save settings
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastShootingItemId", weaponId);
              await actor.setFlag("msh-faserip", "lastShootingRange", range);
              await actor.setFlag("msh-faserip", "lastShootingShift", cs.manualCS);
              await actor.setFlag("msh-faserip", "cs_shooting", cs.manualCS);
              await actor.setFlag("msh-faserip", "lastShootingMultiAttacks", multiAttacks);
              await actor.setFlag("msh-faserip", "lastShootingAttackCount", attackCount);
              await actor.setFlag("msh-faserip", "lastShootingVariant", variantType);
            }

            await actor.setFlag("msh-faserip", "csNotes", cs.csNotes);

            _resolved = true;
            resolve({
              weapon,
              weaponDamage,
              weaponRange,
              shift: cs.totalShift,
              karma,
              spendKarma,
              range,
              skipDice,
              totalShift: cs.totalShift,
              multiAttacks,
              attackCount,
              csNotes: cs.csNotes,
              armorPiercing: _apInfo.ap,
              armorPiercingCS: _apInfo.apCS,
              apMode: _apInfo.apMode,
              bypassForceField: _apInfo.bypassFF,
              shiftBreakdown: {
                manual: cs.manualCS,
                multiAttack: 0,
                csNotes: cs.csNotes
              }
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          // ── Event bindings (weapon/variant/range only — CS handled by csState) ──
          html.find('#damage-source-select').on('change', () => {
            const wId = html.find('#damage-source-select').val();
            const w = shootingWeapons.find(i => i.id === wId);
            const newVariantOpts = _buildVariantOptions(w, "");
            const $variantRow = html.find('#variant-row');
            if (newVariantOpts) {
              if (html.find('#variant-select').length) {
                html.find('#variant-select').html(newVariantOpts);
              } else if ($variantRow.length === 0) {
                html.find('.frp-dmg-box').append(`<div class="object-row" id="variant-row" style="margin-top:3px;"><div style="display:flex;align-items:center;gap:6px;"><label style="font-size:12px;white-space:nowrap;">Ammo:</label><select name="variantType" id="variant-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">${newVariantOpts}</select></div></div>`);
                html.find('#variant-select').on('change', update);
              }
            } else {
              html.find('#variant-row').remove();
            }
            update();
          });
          html.find('[name="range"]').on('input change', update);
          html.on('change', '[name="variantType"]', update);

          // Multi-attack toggle
          html.find('#multi-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="multiCount"]').prop('disabled', !this.checked);
          });

          // Karma toggle
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "shooting", { actor });

          // Attach auto-fill range from token distance
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => update());

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        },
        close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
        }
      }).render(true);
    });

    if (!choice) return;

    // Reload mode from flags — respect global mode ceiling
    let globalMode = "semi";
    try { globalMode = game.settings.get("msh-faserip", "defaultCombatMode") || "semi"; } catch (_) {}
    const modeRank = { manual: 0, semi: 1, full: 2 };
    const globalRank = modeRank[globalMode] ?? 1;
    const savedMode = await actor.getFlag("msh-faserip", "lastShootingMode") || "semi";
    const savedRank = modeRank[savedMode] ?? 1;
    this.opts.mode = savedRank <= globalRank ? savedMode : globalMode;
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

    // Track shift breakdown
    const shiftBreakdown = choice.shiftBreakdown || {
      manual: choice.shift || 0,
      multiAttack: 0,
      csNotes: choice.csNotes || ""
    };

    // Handle multi-attacks
    let actualAttackCount = 1;
    let multiAttackFeatResult = null;

    if (choice.multiAttacks) {
      const fightingAbility = getAbilityInfo(actor, "fighting");
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";

      // Multi-attack FEAT uses raw Fighting rank — Agility CS / range penalty do not apply
      const featResult = await this._rollFightingFeat(
        actor,
        fightingAbility,
        intensity,
        choice.attackCount
      );
      if (featResult.cancelled) return;

      multiAttackFeatResult = { ...featResult, intensity, attackCount: choice.attackCount };

      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) {}

      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#eef6ff;border:1px solid #90caf9;border-radius:3px;padding:6px;margin:4px 0;">
            <b>Multi-Attack FEAT:</b> ${intensity} — ${
              featResult?.success ? "SUCCESS" : "FAIL"
            } ${featResult?.auto ? "(Automatic)" : ""}</div>`
        });
      }

      const featSuccess = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
      const featImpossible = !!(featResult?.resultColor === "IMPOSSIBLE");

      if (featSuccess && !featImpossible) {
        actualAttackCount = choice.attackCount;
        shiftBreakdown.multiAttack = -1;
        choice.totalShift = (choice.totalShift || 0) - 1;
        ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS each!`);
      } else {
        actualAttackCount = 1;
        shiftBreakdown.multiAttack = -3;
        choice.totalShift = (choice.totalShift || 0) - 3;
        ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack at -3CS.`);
      }
    }

    choice.shiftBreakdown = shiftBreakdown;

    // Execute attack(s)
    for (let i = 1; i <= actualAttackCount; i++) {
      if (i > 1) await new Promise(resolve => setTimeout(resolve, 500));

      const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
      const targetForThisAttack = actualAttackCount === 1 ? targets[0] : targets[(i-1) % targets.length];

      await this._executeSingleAttack({
        choice: { ...choice, specificTarget: targetForThisAttack, multiAttackFeatResult: i === 1 ? multiAttackFeatResult : null },
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
        targetCount: 1,
        attackNumber: i,
        totalAttacks: actualAttackCount
      });
    }

    // Multi-attack completion message
    if (actualAttackCount > 1) {
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) {}

      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
            <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
            <div style="font-size:0.9em;">${actor.name} completed ${actualAttackCount} attacks.</div>
          </div>`
        });
      }
    }
  }
}