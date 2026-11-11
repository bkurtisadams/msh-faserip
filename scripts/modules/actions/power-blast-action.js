// scripts/modules/actions/power-blast-action.js v1.0.0 - 2026-11-10
// One dialog flow for ranged power blasts (Energy, Force). Subclasses supply
// static BLAST config and the hooks marked "subclass" below; the dialog,
// CS panel, Roll/Cancel plumbing, remembered flags and the hand-off to
// _executeSingleAttack live here.

import { RangedAttackAction, powerRangePenalty, rangeLabel } from "./ranged-attack-action.js";
import {
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  attachAutoFillRange,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  rankValue,
  applyCapabilitiesToDialog,
  derivePowerDamage
} from "./action-utils.js";
import { POWER_RANGE } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel, detectAutoSituational, resolveAttackerToken } from "./cs-modifiers.js";
import { showFaseripDialog } from "./dialog-shim.js";
import {
  setLS, dialogPrefs, flagRecall, saveDialogFlags, targetSummary,
  headerHtml, targetCompactHtml, powerSourceOptions, readPowerSource,
  aimRowHtml, karmaRowHtml, blindsideRowHtml, fxGridHtml, footerHtml,
  pinDialogWidth, mountDialogFrame, wireRollKeys, wireRowToggle, wireAimToggle, wirePrefToggles
} from "./attack-dialog-kit.js";

export class PowerBlastAction extends RangedAttackAction {

  // subclass
  _isCandidatePower(_item) { return false; }
  _armorValue(_info) { return 0; }
  _armorView(_info, _armorNote) { return { display: "", hintHtml: "" }; }
  _recallExtras(_recall, _flag) { return {}; }
  _reduceRowHtml(_saved, _initialDamage) { return ""; }
  _multiRowHtml(_saved) { return ""; }
  _aimOptionsHtml(_savedAim) { return ""; }
  _readExtras(_$dlg, _ctx) { return { choice: {}, flags: {} }; }
  _updateSource(_html, _src) {}
  _syncReduceMax(_html, _damage) {}
  _wireExtras(_html, _dlg, _ctx) {}
  _afterDialog(_choice, _ctx) { return true; }
  _attackParams(choice, powerItem) {
    return { choice: { ...choice, weapon: powerItem }, rawDamage: Number(choice.powerDamage) || 0, damageType: "" };
  }

  async execute() {
    const cfg = this.constructor.BLAST;
    const actor = this.actor;
    const actionType = cfg.key;
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");
    const flag = (name) => `last${cfg.flag}${name}`;

    let items = actor.items.filter((i) => i.type === "power" && this._isCandidatePower(i));
    const equipment = actor.items.filter((i) => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      return String(s.damageType || "").toUpperCase() === cfg.equipmentCode && s.category === "weapon";
    });
    items = [...items, ...equipment];

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && (passedItem.type === "power" || passedItem.type === "equipment")) {
      if (!items.find(i => i.id === passedItem.id)) items = [passedItem, ...items];
    }

    const prefs = dialogPrefs(cfg.key);
    const recall = flagRecall(actor, prefs.remember);

    const savedItemId = passedItemId || recall(flag("ItemId"), "");
    let savedRange = recall(flag("Range"), 1);
    let savedAdHoc = passedItem ? false : recall(flag("AdHoc"), !items.length);
    let savedAdHocName = recall(flag("AdHocName"), cfg.adhocName);
    let savedAdHocDmg = Number(recall(flag("AdHocDamage"), cfg.adhocDamage));
    let savedAdHocRank = recall(flag("AdHocRank"), "Remarkable");

    const deviceAbility = this.opts?.deviceAbility;
    if (deviceAbility) {
      savedAdHoc = true;
      savedAdHocName = `${deviceAbility.name}${passedItem ? ` (${passedItem.name})` : ""}`;
      savedAdHocRank = deviceAbility.rank || "Remarkable";
      savedAdHocDmg = CONFIG.FASERIP?.rankValues?.[deviceAbility.rank] || cfg.adhocDamage;
      if (cfg.touchZeroRange && deviceAbility.touch) savedRange = 0;
    }

    const savedUsePowerToHit = recall.isTrue(flag("UsePowerToHit"));
    const savedColumnShift = recall.nullish(flag("Shift"), 0);
    const savedAim = recall(flag("Aim"), "none");
    const savedReason = recall(flag("Reason"), "");
    const saved = {
      multiAdjacent: recall(flag("MultiAdjacent"), false),
      ...this._recallExtras(recall, flag)
    };

    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const armorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, cfg.armorQuery) : null;
    const armorNote = targets.length > 1 ? " (1st)" : "";
    const targetArmor = this._armorValue(armorInfo);
    const armorView = this._armorView(armorInfo, armorNote);
    const { healthStr, statusStr } = targetSummary(primaryTargetActor);

    const initialPower = items.find(i => i.id === savedItemId) || items[0];
    const initialPowerRank = savedAdHoc ? savedAdHocRank : (initialPower?.system?.rank ?? initialPower?.system?.powerRank ?? "Remarkable");
    const initialDamage = savedAdHoc ? savedAdHocDmg : derivePowerDamage(initialPower?.system || {}, actor);
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);
    const initialDisplayRank = savedUsePowerToHit ? initialPowerRank : ability.rank;

    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);

    const rangePenaltyAt = (rank, distance) => {
      const maxRange = this._getPowerRangeInAreas(rank);
      return (distance > maxRange && maxRange > 0) ? powerRangePenalty(rank, distance) : 0;
    };
    const autoMods = detectAutoSituational({ attacker: resolveAttackerToken(actor), target: primaryTarget, context: "ranged" });
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      savedReason,
      abilityRank: initialDisplayRank,
      rangePenalty: rangePenaltyAt(initialPowerRank, savedRange),
      showRange: true,
      autoMods
    });

    const dialogHtml = `
    <div class="frp-dlg">
      ${headerHtml({ actor, ability, targetDisplay })}
      ${targetCompactHtml({ targetDisplay, healthStr, armorDisplay: armorView.display, statusStr, hintHtml: armorView.hintHtml })}

      ${csRowHtml}

      <div style="padding:0 10px 2px;font-size:11px;">
        <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
          <input type="checkbox" id="pwr-hit-toggle" ${savedUsePowerToHit ? 'checked' : ''}>
          <span style="font-weight:600;color:#7b6b00;">PwrHit</span>
          <span style="color:#999;">use power rank to hit</span>
        </label>
      </div>

      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="powerSource" id="power-source-select">
            ${powerSourceOptions(items, actor, { adHoc: savedAdHoc, savedItemId })}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
        </div>
        <div class="object-row" id="adhoc-row" style="display:${savedAdHoc ? 'block' : 'none'}">
          <div class="obj-grid">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocName}" placeholder="${cfg.adhocName}">
            <label>Rank:</label>
            <div class="obj-mat-row">
              <input type="text" name="adhocRank" value="${savedAdHocRank}" placeholder="Remarkable" style="flex:1;">
              <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:50px;">
            </div>
          </div>
        </div>
        <div style="font-size:10px;color:#999;margin-top:2px;">${cfg.damageNote}</div>
      </div>

      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${rangeLabel(this._getPowerRangeInAreas(initialPowerRank))}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <div class="frp-box frp-opts-box">
        ${this._reduceRowHtml(saved, initialDamage)}
        ${this._multiRowHtml(saved)}
        ${aimRowHtml(savedAim, this._aimOptionsHtml(savedAim))}
        ${karmaRowHtml({ availableKarma, minKarma })}
        ${blindsideRowHtml()}
      </div>

      ${fxGridHtml(effects)}
      ${footerHtml(prefs)}
    </div>
    `;

    const choice = await new Promise((resolve) => {
      let _csState = null;
      let _resolved = false;
      showFaseripDialog({
        title: actionName,
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = await mountDialogFrame({ html, dlg, actor, opts: this.opts || {}, modeFlag: flag("Mode") });

          const source = () => readPowerSource(html, items, actor);
          const rangeField = () => Number(html.find('[name="range"]').val() || 0);

          _csState = wireCSPanel(html, {
            abilityRank: initialDisplayRank,
            getRangePenalty: () => rangePenaltyAt(source().rank, rangeField()),
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          html.find('#pwr-hit-toggle').on('change', function() {
            _csState.setAbilityRank(this.checked ? source().rank : ability.rank);
          });

          wireRollKeys(html, $dialog);

          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = $dlg("#msh-remember-settings").is(':checked');
            const skipDice = $dlg("#msh-skip-dice").is(':checked');
            setLS(prefs.rememberKey, rememberSettings ? "1" : "0");
            setLS(prefs.skipKey, skipDice ? "1" : "0");

            const srcVal = $dlg('#power-source-select').val() || "adhoc";
            const useAdHoc = srcVal === "adhoc";

            let powerName = "", powerDamage = 0, powerRank = "Remarkable", powerId = null, prettyRange = "";
            let item = null;

            if (useAdHoc) {
              powerName = String($dlg('[name="adhocName"]').val() || cfg.adhocName);
              powerDamage = Number($dlg('[name="adhocDamage"]').val() || 0);
              powerRank = String($dlg('[name="adhocRank"]').val() || "Remarkable");
              if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                ui.notifications.error("Enter a valid non-negative damage value.");
                return;
              }
            } else {
              const itemId = srcVal.replace("power:", "");
              item = items.find(i => i.id === itemId);
              if (!item) {
                ui.notifications.error(cfg.selectError);
                return;
              }
              powerId = itemId;
              const s = item.system || {};
              powerName = item.name;
              powerDamage = derivePowerDamage(s, actor);
              powerRank = String(s.rank ?? s.powerRank ?? "Remarkable");
              prettyRange = s.range === "rank"
                ? (POWER_RANGE[powerRank] || "")
                : String(s.calculatedRange || "");
            }

            const cs = _csState ? _csState.get() : { totalShift: 0, manualCS: 0, rangePenalty: 0, csNotes: "" };
            const shift = cs.totalShift;
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const blindside = html.find('#blindside-attack').is(':checked');
            const usePowerToHit = !!$dlg('#pwr-hit-toggle').is(':checked');
            const range = Number($dlg('[name="range"]').val() || 1);
            const multiAdjacent = !!$dlg('#multi-enabled').is(':checked');
            const aimEnabled = $dlg('#aim-enabled').is(':checked');
            const aimMode = aimEnabled ? ($dlg('[name="aimMode"]').val() || "none") : "none";

            const extras = this._readExtras($dlg, { item, useAdHoc, powerDamage, multiAdjacent });
            if (!extras) return;

            const flagUpdate = { csNotes: cs.csNotes };
            if (rememberSettings) {
              Object.assign(flagUpdate, {
                [flag("AdHoc")]: useAdHoc,
                [flag("AdHocName")]: powerName,
                [flag("AdHocDamage")]: powerDamage,
                [flag("AdHocRank")]: powerRank,
                [flag("ItemId")]: powerId || "",
                [flag("Range")]: range,
                [flag("UsePowerToHit")]: usePowerToHit,
                [flag("Shift")]: cs.manualCS,
                [`cs_${cfg.key}`]: cs.manualCS,
                [flag("MultiAdjacent")]: multiAdjacent,
                [flag("Aim")]: aimMode,
                [flag("Reason")]: cs.reason,
                ...extras.flags
              });
            }
            await saveDialogFlags(actor, flagUpdate);

            _resolved = true;
            resolve({
              blindside,
              powerName, powerDamage, powerRank, powerId, prettyRange,
              shift, karma: karmaToSpend, spendKarma, range, skipDice, usePowerToHit,
              totalShift: shift,
              manualCS: cs.manualCS,
              rangePenalty: cs.rangePenalty,
              multiAdjacent,
              aimMode,
              csNotes: cs.csNotes,
              ...extras.choice
            });
            dlg.close();
          });

          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          const update = () => {
            const src = source();
            html.find('#adhoc-row').css('display', src.isAdHoc ? 'block' : 'none');

            this._updateSource(html, src);

            html.find('#dmg-val').text(src.damage);

            let armor = targetArmor;
            if (cfg.liveArmor) {
              armor = primaryTargetActor
                ? this._armorValue(getBodyArmorValues(primaryTargetActor, cfg.armorQuery))
                : 0;
            }
            const after = Math.max(0, src.damage - armor);
            html.find('#after-armor-display').text(
              primaryTarget ? `${after} after armor` : `${src.damage} damage`
            );

            const powerMaxRange = this._getPowerRangeInAreas(src.rank);
            html.find('#max-range-hint').text(rangeLabel(powerMaxRange));

            const rangeVal = rangeField();
            const $rangePenalty = html.find('#range-penalty-display');
            if (rangeVal > powerMaxRange && powerMaxRange > 0) {
              const penalty = powerRangePenalty(src.rank, rangeVal);
              $rangePenalty.text(`${penalty}CS`).css('color', '#e65100');
              _csState.setRange(penalty);
            } else {
              $rangePenalty.text('');
              _csState.setRange(0);
            }

            this._syncReduceMax(html, src.damage);

            const usePwrHit = html.find('#pwr-hit-toggle').is(':checked');
            _csState.setAbilityRank(usePwrHit ? src.rank : ability.rank);

            if ($dialog.length) $dialog[0].style.height = 'auto';
            if (cfg.pinWidthOnUpdate) pinDialogWidth(dlg);
          };

          html.find('#power-source-select').on('change', update);
          html.find('[name="adhocDamage"], [name="adhocRank"]').on('input change', update);
          html.find('[name="range"]').on('input change', update);

          this._wireExtras(html, dlg, { initialDamage });
          wireAimToggle(html);
          wireRowToggle(html, '#spend-karma');

          applyCapabilitiesToDialog(html, cfg.key, { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, update);

          wirePrefToggles(html, prefs);

          update();
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (!_resolved) resolve(null);
        }
      });
    });

    if (!choice) return { rawActionCancelled: true };

    if (this._afterDialog(choice, { items }) === false) return;

    if (choice.multiAdjacent) {
      choice.totalShift = (choice.totalShift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

    const shiftBreakdown = {
      manual: choice.manualCS || 0,
      range: choice.rangePenalty || 0,
      csNotes: choice.csNotes || ""
    };
    if (choice.multiAdjacent) shiftBreakdown.adjacent = -4;
    choice.shiftBreakdown = shiftBreakdown;

    const toHitAbility = choice.usePowerToHit
      ? { name: "Power", rank: choice.powerRank, value: rankValue(choice.powerRank) || 30 }
      : ability;

    const powerItem = choice.powerId ? actor.items.get(choice.powerId) : null;
    const targetCount = choice.multiAdjacent ? targets.length : 1;
    const attack = this._attackParams(choice, powerItem);

    await this._executeSingleAttack({
      choice: attack.choice,
      actor,
      ability: toHitAbility,
      actionType, actionName, effects,
      damageType: attack.damageType,
      rawDamage: attack.rawDamage,
      damageNote: `Power: ${choice.powerName} (${choice.powerRank})`,
      sourceName: choice.powerName || cfg.adhocName,
      attackForm: cfg.key,
      breakingFeat: null,
      targetCount,
      attackNumber: 1,
      totalAttacks: 1
    });
  }
}
