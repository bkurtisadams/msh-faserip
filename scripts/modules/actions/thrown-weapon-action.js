// scripts/modules/actions/thrown-weapon-action.js v1.0.1 - 2026-11-11
// v1.0.1: The weapon dropdown shows each item's computed damage (it showed
//         the printed damage, so powers read "0 dmg").
// One dialog flow for thrown weapons (Throwing Edged, Throwing Blunt).
// Subclasses supply static THROWN config and the hooks marked "subclass";
// the dialog, CS panel, Roll/Cancel plumbing, remembered flags and the
// hand-off to _executeSingleAttack live here.

import { RangedAttackAction, thrownRangePenalty, rangeLabel } from "./ranged-attack-action.js";
import {
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  getAbilityInfo,
  effectsFor,
  labelFor,
  applyCapabilitiesToDialog,
  attachAutoFillRange,
  getTargetData,
  getBodyArmorValues,
  getEffectiveArmor,
  getItemArmorPiercingCS
} from "./action-utils.js";
import { buildCSRow, wireCSPanel, detectAutoSituational, resolveAttackerToken } from "./cs-modifiers.js";
import { showFaseripDialog } from "./dialog-shim.js";
import {
  setLS, dialogPrefs, flagRecall, saveDialogFlags,
  headerHtml, karmaRowHtml, blindsideRowHtml, fxGridHtml, footerHtml,
  mountDialogFrame, wireRollKeys, wireRowToggle, wirePrefToggles
} from "./attack-dialog-kit.js";

export class ThrownWeaponAction extends RangedAttackAction {

  // subclass
  _isPower(_item) { return false; }
  _damage(_actor, _item) { return 0; }
  _recallExtras(_recall, _flag) { return {}; }
  _pullRowsHtml(_saved, _initialDamage, _ctx) { return ""; }
  _readExtras(_$dlg, _ctx) { return { choice: {}, flags: {} }; }
  _updateSource(_html, _ctx) {}
  _onPullToggle(_html, _checked) {}
  _wireExtras(_html) {}

  _isCandidateWeapon(i) {
    const cfg = this.constructor.THROWN;
    if (i.type === "power") return this._isPower(i);
    if (i.type !== "equipment" || String(i.system?.category ?? "").toLowerCase() !== "weapon") return false;
    const s = i.system ?? {};
    if (s.attackModes) {
      const modes = Object.values(s.attackModes);
      if (modes.some(m => m.actionType === cfg.key ||
          (m.damageType === cfg.thrownCode && m.name?.toLowerCase().includes("throw")))) return true;
    }
    const tags = (s.tags ?? []).map(t => String(t).toLowerCase());
    const forms = Array.isArray(s.attackForms) ? s.attackForms.map(f => String(f).toLowerCase()) : [];
    const weaponType = String(s.weaponType ?? "").toLowerCase();
    const damageType = String(s.damageType ?? "").toUpperCase();
    const attackType = String(s.attackType ?? "").toLowerCase();
    const isKind = damageType === cfg.meleeCode || damageType === cfg.thrownCode ||
      attackType === cfg.kind || attackType === cfg.key ||
      tags.includes(cfg.kind) || tags.includes(cfg.meleeCode.toLowerCase()) || tags.includes(cfg.thrownCode.toLowerCase()) ||
      forms.includes(cfg.kind) || forms.includes(cfg.key);
    const isShooting = weaponType === "shooting" || weaponType === "firearm" ||
      damageType === "S" || attackType === "shooting";
    return isKind && !isShooting;
  }

  async execute() {
    const cfg = this.constructor.THROWN;
    const actor = this.actor;
    const actionType = cfg.key;
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");
    const flag = (name) => `last${cfg.flag}${name}`;

    let weapons = actor.items.filter(i => this._isCandidateWeapon(i));

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && (passedItem.type === "equipment" || this._isPower(passedItem))) {
      if (!weapons.find(i => i.id === passedItem.id)) weapons = [passedItem, ...weapons];
    }

    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";
    const maxThrowRange = this._getThrowingRangeInAreas(strRank);

    const prefs = dialogPrefs(cfg.prefKey);
    const recall = flagRecall(actor, prefs.remember);

    const savedItemId = passedItemId || recall(flag("ItemId"), "");
    const savedAdHoc = passedItem ? false : recall(flag("AdHoc"), false);
    const savedAdHocNm = recall(flag("AdHocName"), cfg.adhocName);
    const savedAdHocDmg = Number(recall(flag("AdHocDamage"), cfg.adhocDamage));
    const savedRange = recall(flag("Range"), 1);
    const savedColumnShift = recall.nullish(flag("Shift"), 0);
    const savedReason = recall(flag("Reason"), "");
    const saved = {
      pull: recall(flag("PullEnabled"), false),
      pulledDamage: recall(flag("PulledDamage"), 0),
      resultCap: recall(flag("ResultCap"), "none"),
      ...this._recallExtras(recall, flag)
    };

    const weaponOptions = weapons.map(i => {
      const dmg = this._damage(actor, i);
      const ap = cfg.armorPiercing ? getItemArmorPiercingCS(i) : 0;
      const apLabel = ap > 0 ? ` [AP ${ap}CS]` : "";
      const sel = (i.id === savedItemId) ? 'selected' : '';
      return `<option value="${i.id}" ${sel}>${i.name} &mdash; ${dmg} dmg${apLabel}</option>`;
    }).join('');

    const { primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, cfg.damageType) : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const armorAgainst = (weapon) => {
      if (!cfg.armorPiercing) return { armor: targetArmor, ap: 0 };
      const ap = weapon ? getItemArmorPiercingCS(weapon) : 0;
      return { armor: getEffectiveArmor(targetArmor, ap), ap };
    };

    const isAdHocInit = savedAdHoc || !weapons.length;
    const initialWeapon = isAdHocInit ? null : weapons.find(i => i.id === savedItemId) || weapons[0];
    const initialDamage = isAdHocInit ? savedAdHocDmg : this._damage(actor, initialWeapon);
    const initial = armorAgainst(initialWeapon);
    const initialAfterArmor = Math.max(0, initialDamage - initial.armor);
    const initialAPLabel = initial.ap > 0 ? `${initial.ap}CS` : "";

    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);

    const autoMods = detectAutoSituational({ attacker: resolveAttackerToken(actor), target: primaryTarget, context: "ranged" });
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      savedReason,
      abilityRank: ability.rank,
      rangePenalty: thrownRangePenalty(savedRange, strRank),
      showRange: true,
      autoMods
    });

    const apDisplayHtml = cfg.armorPiercing ? `
        <div id="ap-display" style="font-size:11px;color:#1565c0;margin-top:2px;${initialAPLabel ? '' : 'display:none;'}">
          AP: <strong id="ap-val">${initialAPLabel}</strong>
        </div>` : '';

    const dialogHtml = `
    <div class="frp-dlg">
      ${headerHtml({ actor, ability: { ...ability, name: "Agility" }, targetDisplay, titles: false })}

      ${csRowHtml}

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
            <input type="text" name="adhocName" value="${savedAdHocNm}" placeholder="${cfg.adhocPlaceholder}" style="padding:3px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;">
            <label>Dmg:</label>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="padding:3px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;width:100%;">
          </div>
        </div>${apDisplayHtml}
      </div>

      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" readonly class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${rangeLabel(maxThrowRange)}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <div class="frp-box frp-opts-box">
        ${this._pullRowsHtml(saved, initialDamage, { availableKarma })}
        ${karmaRowHtml({ availableKarma, minKarma })}
        ${blindsideRowHtml()}
      </div>

      ${fxGridHtml(cfg.fx)}
      ${footerHtml(prefs)}
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
          const $dialog = await mountDialogFrame({ html, dlg, actor, opts: this.opts || {}, modeFlag: flag("Mode") });

          const rangeField = () => Number(html.find('[name="range"]').val() || 0);
          const isAdHocNow = () => html.find('[name="src"]:checked').val() === 'adhoc';
          const selectedWeapon = () => weapons.find(i => i.id === html.find('[name="weapon"]').val());

          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            getRangePenalty: () => {
              const rangeVal = rangeField();
              return rangeVal > maxThrowRange ? 0 : thrownRangePenalty(rangeVal, strRank);
            },
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          const update = () => {
            const isAdHoc = isAdHocNow();
            const weapon = isAdHoc ? null : selectedWeapon();
            let dmg;

            if (isAdHoc) {
              dmg = Number(html.find('[name="adhocDamage"]').val()) || 0;
              const after = Math.max(0, dmg - targetArmor);
              html.find('#dmg-val-adhoc').text(dmg);
              html.find('#after-armor-display-adhoc').text(primaryTarget ? `${after} after armor` : `${dmg} damage`);
            } else {
              dmg = this._damage(actor, weapon);
              const after = Math.max(0, dmg - armorAgainst(weapon).armor);
              html.find('#dmg-val').text(dmg);
              html.find('#after-armor-display').text(primaryTarget ? `${after} after armor` : `${dmg} damage`);
            }

            this._updateSource(html, { isAdHoc, weapon });

            const $pulledDmg = html.find('[name="pulledDamage"]');
            $pulledDmg.attr('max', dmg);
            if (Number($pulledDmg.val()) > dmg) $pulledDmg.val(dmg);

            const rangeVal = rangeField();
            const $rangePenalty = html.find('#range-penalty-display');
            if (rangeVal > maxThrowRange) {
              $rangePenalty.text('OUT OF RANGE').css('color', '#c62828');
              _csState.setRange(0);
            } else {
              const penalty = thrownRangePenalty(rangeVal, strRank);
              $rangePenalty.text(penalty < 0 ? `${penalty}CS` : '').css('color', '#e65100');
              _csState.setRange(penalty);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          update();

          html.find('[name="src"]').on('change', function() {
            const isAdHoc = $(this).val() === 'adhoc';
            html.find('#carried-row').css('display', isAdHoc ? 'none' : 'block');
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');
            update();
          });

          html.find('#damage-source-select').on('change', update);
          html.find('[name="adhocDamage"]').on('input', update);
          html.find('[name="range"]').on('input change', update);

          const onPullToggle = (checked) => this._onPullToggle(html, checked);
          html.find('#pull-punch-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            $row.toggleClass('inactive', !this.checked);
            if (this.checked) {
              const currentMax = Number($pulledDamage.attr('max')) || initialDamage;
              $pulledDamage.val(currentMax).prop('disabled', false);
            } else {
              $pulledDamage.val($pulledDamage.attr('max')).prop('disabled', true);
            }
            onPullToggle(this.checked);
          });

          this._wireExtras(html);
          wireRowToggle(html, '#spend-karma');

          applyCapabilitiesToDialog(html, cfg.key, { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => update());

          wirePrefToggles(html, prefs);
          wireRollKeys(html, $dialog);

          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = !!$dlg('#msh-remember-settings').is(':checked');
            const skipDice = !!$dlg('#msh-skip-dice').is(':checked');
            setLS(prefs.rememberKey, rememberSettings ? "1" : "0");
            setLS(prefs.skipKey, skipDice ? "1" : "0");

            const useAdHoc = isAdHocNow();
            let weaponName, weaponDamage, weaponId = null, weapon = null;

            if (useAdHoc) {
              weaponName = String($dlg('[name="adhocName"]').val() || cfg.adhocFallbackName);
              weaponDamage = Number($dlg('[name="adhocDamage"]').val() || 0);
              if (cfg.validateAdhocDamage && (!Number.isFinite(weaponDamage) || weaponDamage < 0)) {
                ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc weapon.");
                return;
              }
            } else {
              const wid = String($dlg('[name="weapon"]').val() || "");
              weapon = weapons.find(i => i.id === wid);
              if (!weapon) {
                ui.notifications.error(cfg.selectError);
                return;
              }
              weaponId = wid;
              weaponName = weapon.name;
              weaponDamage = Number(weapon.system?.damage || 0);
            }

            const cs = _csState.get();
            const shift = cs.totalShift;
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const blindside = html.find('#blindside-attack').is(':checked');
            const range = Number($dlg('[name="range"]').val() || 1);

            if (range > maxThrowRange) {
              ui.notifications.error(`Target is beyond throwing range (${maxThrowRange} areas).`);
              return;
            }

            const csNotes = cs.csNotes;
            const pullEnabled = !!$dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const extras = this._readExtras($dlg, { weapon, pullEnabled });

            const flagUpdate = { csNotes };
            if (rememberSettings) {
              Object.assign(flagUpdate, {
                [flag("Shift")]: cs.manualCS,
                [flag("AdHoc")]: useAdHoc,
                [flag("AdHocName")]: weaponName,
                [flag("AdHocDamage")]: weaponDamage,
                [flag("ItemId")]: weaponId || "",
                [flag("Range")]: range,
                [flag("PullEnabled")]: pullEnabled,
                [flag("PulledDamage")]: pulledDamage,
                [flag("Reason")]: cs.reason,
                ...extras.flags
              });
            }
            await saveDialogFlags(actor, flagUpdate);

            _resolved = true;
            resolve({
              blindside,
              weaponId, weaponName, weaponDamage,
              totalShift: shift, shift,
              range,
              karma: karmaToSpend, spendKarma, skipDice,
              shiftBreakdown: { manual: cs.manualCS, range: cs.rangePenalty, csNotes },
              pulledDamage,
              ...extras.choice
            });
            dlg.close();
          });

          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (!_resolved) resolve(null);
        }
      });
    });

    if (!choice) return { rawActionCancelled: true };

    const weaponItem = choice.weaponId ? actor.items.get(choice.weaponId) : null;
    const rawDamage = choice.weaponId
      ? this._damage(actor, weaponItem)
      : Number(choice.weaponDamage || 0);

    await this._executeSingleAttack({
      choice: { ...choice, weapon: weaponItem },
      actor, ability, actionType, actionName, effects,
      damageType: choice.damageType || cfg.damageType,
      rawDamage,
      damageNote: choice.weaponName || cfg.sourceName,
      sourceName: choice.weaponName || cfg.sourceName,
      attackForm: cfg.kind
    });
  }
}
