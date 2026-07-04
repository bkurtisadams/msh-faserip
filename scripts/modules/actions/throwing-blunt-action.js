// scripts/modules/actions/throwing-blunt-action.js v3.2.5 - 2026-07-04
// v3.2.5: Use shared action-utils derivePowerDamage() (honors damageSource;
//         replaces the local ||-chain that ignored the Damage Source select).
// v3.2.4: Range penalty is now -1CS per full area to the target (weapon rule,
//         RAW); no free first area. Capped at the thrower's max range.
// scripts/modules/actions/throwing-blunt-action.js v3.2.3 - 2026-05-23
// v3.2.3: Thrown range now flows to the card (range added to choice) so the
//         Target/Range line shows real areas, and the range penalty is
//         itemized in the to-hit breakdown (shiftBreakdown.range).
// scripts/modules/actions/throwing-blunt-action.js v3.2.2 - 2026-05-23
// v3.2.2: CS Reason field now persists across reopens (lastThrowBluntReason
//         flag, gated by Remember), matching the other attack dialogs.
// scripts/modules/actions/throwing-blunt-action.js v3.2.1 - 2026-04-17
// v3.2.1: Correct thrown-blunt damage per RAW — plain min(STR, MAT) with
//         weapon-base floor, no bump-to-next-rank rule. Bump is melee-blunt
//         only per Advanced Set Combat section (Aunt May pipe example is
//         a drawing-room melee, not a throw). Replaces v3.2.0 which
//         incorrectly reused melee computeBluntDamage.
// v3.2.0: T4 — carried-weapon damage now auto-computes via computeBluntDamage
//         (STR vs material with bump-to-next-rank-minimum rule and weapon-base
//         floor), matching melee blunt behavior. Ad-hoc path unchanged — GM
//         entered damage still used verbatim. Preview, resolve, and initial
//         calc all route through the new local helper.
// v3.1.0: Manual CS only — remove talent/power auto-detection, chips, sit-tags.
//         CS row is manual input + range penalty + ? reference panel via cs-modifiers.js.
import { RangedAttackAction } from "./ranged-attack-action.js";
import {
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  effectsFor,
  labelFor,
  buildModeSelector,
  setupModeSelector,
  applyCapabilitiesToDialog,
  attachAutoFillRange,
  getTargetData,
  getBodyArmorValues,
  debugLog,
  derivePowerDamage
} from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
import { getItemMaterialRank } from "../../gm-utils.js";

import { showFaseripDialog } from "./dialog-shim.js";
// Power types that route to throwing-blunt per power-router (Ice Generation, etc.)
const THROWING_BLUNT_POWER_TYPES = ["ice generation"];

function isThrowingBluntPower(item) {
  if (item?.type !== "power") return false;
  const ptl = String(item.system?.type || "").toLowerCase();
  const nameLc = String(item.name || "").toLowerCase();
  return THROWING_BLUNT_POWER_TYPES.some(t => ptl.includes(t) || nameLc.includes(t));
}

// Damage source dispatcher. Powers use rank value (RAW: damage equals Power rank).
// Equipment uses thrown-weapon RAW: max(weaponBase, min(STR, MAT)).
function computeThrowingBluntDamage(actor, item) {
  if (!item) return 0;
  if (item.type === "power") {
    const s = item.system || {};
    return derivePowerDamage(s, actor);
  }
  return computeThrownBluntDamage(actor, item);
}

// Thrown blunt damage per RAW (Advanced Set Combat, Blunt Throwing Attack):
// "A blunt thrown weapon inflicts damage equal to the Strength of the thrower,
//  or the material strength of the thrown item, whichever is less."
// No bump-to-next-rank rule — that's melee-blunt only (Aunt May example is a
// drawing-room pipe, not a throw). Weapon printed damage acts as a floor.
function computeThrownBluntDamage(actor, weaponItem) {
  if (!weaponItem) return 0;
  const s = actor?.system?.abilities?.strength || {};
  const strVal = Number(s.value || game.msh.getRankValue(s.rank) || 0);
  const matRank = getItemMaterialRank(weaponItem) || "Typical";
  const matVal = Number(game.msh.getRankValue(matRank) || 0);
  const weaponBase = Number(weaponItem?.system?.damage || 0);
  return Math.max(weaponBase, Math.min(strVal, matVal));
}

export class ThrowingBluntAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-blunt";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // Candidate weapons: thrown + blunt. Also accepts powers that route to
    // throwing-blunt per the power-router (Ice Generation, etc.)
    let thrownBlunt = actor.items.filter(i => {
      if (i.type === "power") return isThrowingBluntPower(i);
      if (i.type !== "equipment" || String(i.system?.category ?? "").toLowerCase() !== "weapon") return false;
      const s = i.system ?? {};
      if (s.attackModes) {
        const modes = Object.values(s.attackModes);
        if (modes.some(m => m.actionType === "throwing-blunt" ||
            (m.damageType === "TB" && m.name?.toLowerCase().includes("throw")))) return true;
      }
      const tags = (s.tags ?? []).map(t => String(t).toLowerCase());
      const forms = Array.isArray(s.attackForms) ? s.attackForms.map(f => String(f).toLowerCase()) : [];
      const weaponType = String(s.weaponType ?? "").toLowerCase();
      const damageType = String(s.damageType ?? "").toUpperCase();
      const attackType = String(s.attackType ?? "").toLowerCase();
      const isBlunt = damageType === "BA" || damageType === "TB" ||
        attackType === "blunt" || attackType === "throwing-blunt" ||
        tags.includes("blunt") || tags.includes("ba") || tags.includes("tb") ||
        forms.includes("blunt") || forms.includes("throwing-blunt");
      const isShooting = weaponType === "shooting" || weaponType === "firearm" ||
        damageType === "S" || attackType === "shooting";
      return isBlunt && !isShooting;
    });

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && (passedItem.type === "equipment" || isThrowingBluntPower(passedItem))) {
      if (!thrownBlunt.find(i => i.id === passedItem.id)) {
        thrownBlunt = [passedItem, ...thrownBlunt];
      }
    }

    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";
    const maxThrowRange = this._getThrowingRangeInAreas(strRank);

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.tb.remember";
    const lsSkipKey = "msh.tb.skipDice";
    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastThrowBluntItemId")) : "") || "";
    const savedAdHoc = passedItem ? false : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastThrowBluntAdHoc") || (!thrownBlunt.length)) : (!thrownBlunt.length));
    const savedAdHocNm = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntAdHocName")) || "Rock") : "Rock";
    const savedAdHocDmg = shouldRemember ? (Number(await actor.getFlag("msh-faserip", "lastThrowBluntAdHocDamage") || 6)) : 6;
    const savedRange = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntRange")) || 1) : 1;
    const savedColumnShift = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntShift")) ?? 0) : 0;
    const savedPullEnabled = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntPullEnabled")) || false) : false;
    const savedPulledDamage = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntPulledDamage")) || 0) : 0;
    const savedResultCap = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntResultCap")) || "none") : "none";
    const savedReason = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntReason")) || "") : "";

    // Build weapon options for carried select
    const weaponOptions = thrownBlunt.map(i => {
      const dmg = Number(i.system?.damage || 0);
      const sel = (i.id === savedItemId) ? 'selected' : '';
      return `<option value="${i.id}" ${sel}>${i.name} &mdash; ${dmg} dmg</option>`;
    }).join('');

    // Target info
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-blunt") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";

    // Initial damage calc
    const isAdHocInit = savedAdHoc || !thrownBlunt.length;
    const initialWeapon = isAdHocInit ? null : thrownBlunt.find(i => i.id === savedItemId) || thrownBlunt[0];
    const initialDamage = isAdHocInit ? savedAdHocDmg : computeThrowingBluntDamage(actor, initialWeapon);
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);

    // Karma info
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // Build CS row via shared utility (manual input + range + ? reference)
    const initialRangePenalty = savedRange > 1 ? -(savedRange - 1) : 0;
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      savedReason,
      abilityRank: ability.rank,
      rangePenalty: initialRangePenalty,
      showRange: true
    });

    // ── Dialog HTML — v3 Compact Layout ──
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Agility / Rank Value) throws at Target -->
      <div class="frp-header-v3">
        <span class="h-actor">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Agility:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target">${targetDisplay}</span>`
          : ''}
      </div>

      <!-- CS row (manual input + range + ? reference) -->
      ${csRowHtml}

      <!-- Damage: Carried/Ad-hoc source toggle + weapon select + damage inline -->
      <div class="frp-box frp-dmg-box">
        <div style="display:flex;gap:8px;margin-bottom:3px;font-size:12px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:3px;">
            <input type="radio" name="src" value="carried" ${!isAdHocInit ? 'checked' : ''}> Carried
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:3px;">
            <input type="radio" name="src" value="adhoc" ${isAdHocInit ? 'checked' : ''}> Ad-hoc
          </label>
        </div>
        <div id="carried-row" style="display:${isAdHocInit ? 'none' : 'block'};">
          <div class="frp-dmg-inline">
            <select class="frp-select" name="weapon" id="damage-source-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;">
              ${weaponOptions || '<option value="">(none in inventory)</option>'}
            </select>
            <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
            <span class="frp-cs-arrow">&rarr;</span>
            <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
          </div>
        </div>
        <div id="adhoc-row" style="display:${isAdHocInit ? 'block' : 'none'};">
          <div class="frp-dmg-inline" style="margin-bottom:3px;">
            <span class="frp-dmg-num" id="dmg-val-adhoc">${savedAdHocDmg}</span>
            <span class="frp-cs-arrow">&rarr;</span>
            <span class="frp-dmg-after" id="after-armor-display-adhoc">${primaryTarget ? `${Math.max(0, savedAdHocDmg - targetArmor)} after armor` : `${savedAdHocDmg} damage`}</span>
          </div>
          <div style="display:grid;grid-template-columns:auto 1fr auto 50px;gap:3px 6px;align-items:center;font-size:12px;">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocNm}" placeholder="Rock, Mug, Wrench..." style="padding:3px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;">
            <label>Dmg:</label>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="padding:3px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;width:100%;">
          </div>
        </div>
      </div>

      <!-- Range info box (blue) — auto-filled from token distance -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" readonly class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${maxThrowRange}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Pull (with result cap) / Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!savedPullEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${savedPullEnabled ? 'checked' : ''}> <span class="frp-opt-label orange">Pull</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="pulledDamage" value="${savedPullEnabled && savedPulledDamage > 0 ? savedPulledDamage : initialDamage}" min="0" max="${initialDamage}" ${!savedPullEnabled ? 'disabled' : ''}>
          <span style="font-size:11px;color:#777;">Cap:</span>
          <select style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;" name="resultCap" ${!savedPullEnabled ? 'disabled' : ''}>
            <option value="none" ${savedResultCap==='none'?'selected':''}>None</option>
            <option value="yellow" ${savedResultCap==='yellow'?'selected':''}>Hit</option>
            <option value="green" ${savedResultCap==='green'?'selected':''}>Miss</option>
          </select>
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
        <div class="frp-fx-cell w">Miss</div>
        <div class="frp-fx-cell g">Hit</div>
        <div class="frp-fx-cell y">Hit</div>
        <div class="frp-fx-cell r">Stun</div>
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
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastThrowBluntMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // Auto-focus Roll button
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
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = !!$dlg('#msh-remember-settings').is(':checked');
            const skipDice = !!$dlg('#msh-skip-dice').is(':checked');
            setLS(lsRememberKey, rememberSettings ? "1" : "0");
            setLS(lsSkipKey, skipDice ? "1" : "0");

            const useAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';
            let weaponName, weaponDamage, weaponId = null;

            if (useAdHoc) {
              weaponName = String($dlg('[name="adhocName"]').val() || "Improvised Blunt");
              weaponDamage = Number($dlg('[name="adhocDamage"]').val() || 0);
              if (!Number.isFinite(weaponDamage) || weaponDamage < 0) {
                ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc weapon.");
                return;
              }
            } else {
              const wid = String($dlg('[name="weapon"]').val() || "");
              const weapon = thrownBlunt.find(i => i.id === wid);
              if (!weapon) {
                ui.notifications.error("Select a carried thrown-blunt weapon or use ad-hoc.");
                return;
              }
              weaponId = wid;
              weaponName = weapon.name;
              weaponDamage = Number(weapon.system?.damage || 0);
            }

            const cs = _csState.get();
            const shift = cs.totalShift;
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const range = Number($dlg('[name="range"]').val() || 1);

            if (range > maxThrowRange) {
              ui.notifications.error(`Target is beyond throwing range (${maxThrowRange} areas).`);
              return;
            }

            const csNotes = cs.csNotes;
            const pullEnabled = !!$dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const resultCap = pullEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";

            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastThrowBluntShift", cs.manualCS);
              await actor.setFlag("msh-faserip", "lastThrowBluntAdHoc", useAdHoc);
              await actor.setFlag("msh-faserip", "lastThrowBluntAdHocName", weaponName);
              await actor.setFlag("msh-faserip", "lastThrowBluntAdHocDamage", weaponDamage);
              await actor.setFlag("msh-faserip", "lastThrowBluntItemId", weaponId || "");
              await actor.setFlag("msh-faserip", "lastThrowBluntRange", range);
              await actor.setFlag("msh-faserip", "lastThrowBluntPullEnabled", pullEnabled);
              await actor.setFlag("msh-faserip", "lastThrowBluntPulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip", "lastThrowBluntResultCap", resultCap);
              await actor.setFlag("msh-faserip", "lastThrowBluntReason", cs.reason);
            }
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            _resolved = true;
            resolve({
              weaponId, weaponName, weaponDamage,
              totalShift: shift, shift,
              range,
              karma: karmaToSpend, spendKarma, skipDice,
              shiftBreakdown: { manual: cs.manualCS, range: cs.rangePenalty, csNotes },
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

          // ── Wire CS panel from shared utility ──
          const _getCurrentRangePenalty = () => {
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            if (rangeVal > maxThrowRange) return 0;
            return rangeVal > 0 ? -rangeVal : 0;
          };
          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            getRangePenalty: _getCurrentRangePenalty,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // ── Main update function (damage + range display only — CS handled by csState) ──
          const update = () => {
            const isAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';
            let dmg;

            if (isAdHoc) {
              dmg = Number(html.find('[name="adhocDamage"]').val()) || 0;
              const after = Math.max(0, dmg - targetArmor);
              html.find('#dmg-val-adhoc').text(dmg);
              html.find('#after-armor-display-adhoc').text(primaryTarget ? `${after} after armor` : `${dmg} damage`);
            } else {
              const wid = html.find('[name="weapon"]').val();
              const w = thrownBlunt.find(i => i.id === wid);
              dmg = computeThrowingBluntDamage(actor, w);
              const after = Math.max(0, dmg - targetArmor);
              html.find('#dmg-val').text(dmg);
              html.find('#after-armor-display').text(primaryTarget ? `${after} after armor` : `${dmg} damage`);
            }

            // Update pull punch max
            const $pulledDmg = html.find('[name="pulledDamage"]');
            $pulledDmg.attr('max', dmg);
            if (Number($pulledDmg.val()) > dmg) $pulledDmg.val(dmg);

            // Range penalty — update CS panel and range info display
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const $rangePenalty = html.find('#range-penalty-display');
            if (rangeVal > maxThrowRange) {
              $rangePenalty.text('OUT OF RANGE').css('color', '#c62828');
              _csState.setRange(0);
            } else {
              const penalty = rangeVal > 0 ? -rangeVal : 0;
              $rangePenalty.text(penalty < 0 ? `${penalty}CS` : '').css('color', '#e65100');
              _csState.setRange(penalty);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          update();

          // ── Source toggle ──
          html.find('[name="src"]').on('change', function() {
            const isAdHoc = $(this).val() === 'adhoc';
            html.find('#carried-row').css('display', isAdHoc ? 'none' : 'block');
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');
            update();
          });

          // ── Event bindings ──
          html.find('#damage-source-select').on('change', update);
          html.find('[name="adhocDamage"]').on('input', update);
          html.find('[name="range"]').on('input change', update);

          // Pull punch toggle
          html.find('#pull-punch-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $resultCap = html.find('[name="resultCap"]');
            $row.toggleClass('inactive', !this.checked);
            if (this.checked) {
              const currentMax = Number($pulledDamage.attr('max')) || initialDamage;
              $pulledDamage.val(currentMax).prop('disabled', false);
              $resultCap.prop('disabled', false);
            } else {
              $resultCap.val('none').prop('disabled', true);
              $pulledDamage.val($pulledDamage.attr('max')).prop('disabled', true);
            }
          });

          // Karma toggle
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "throwing-blunt", { actor });

          // Attach auto-fill range from token distance
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => update());

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });

          applyCapabilitiesToDialog(html, "throwing-blunt", { actor });

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
          if (_csState) _csState.destroy();
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (!_resolved) resolve(null);
        }
      });
    });

    if (!choice) return;

    // Mode already set by setupModeSelector during dialog render
    const mode = this.opts.mode;

    // Delegate to shared resolution pipeline
    const weaponItem = choice.weaponId ? actor.items.get(choice.weaponId) : null;
    const rawDamage = choice.weaponId
      ? computeThrowingBluntDamage(actor, weaponItem)
      : Number(choice.weaponDamage || 0);

    await this._executeSingleAttack({
      choice: { ...choice, weapon: weaponItem },
      actor, ability, actionType, actionName, effects,
      damageType: "physical-blunt",
      rawDamage,
      damageNote: choice.weaponName || "Thrown Blunt",
      sourceName: choice.weaponName || "Thrown Blunt",
      attackForm: "blunt"
    });
  }
}