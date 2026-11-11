// scripts/modules/actions/attack-dialog-kit.js v1.3.0 - 2026-11-11
// v1.3.0: headerHtml verb / statLabel / statText; footerHtml ids option;
//         fxGridHtml hover tips (grapple-family dialogs).
// scripts/modules/actions/attack-dialog-kit.js v1.2.0 - 2026-11-11
// v1.2.0: paidEffectRowHtml / wirePaidEffectToggle (the Karma-paid Effect cap
//         shared by the edged melee and thrown edged dialogs).
// scripts/modules/actions/attack-dialog-kit.js v1.1.0 - 2026-11-10
// v1.1.0: headerHtml titles option (thrown dialogs render no hover titles);
//         pullDamageInputHtml.
// Shared pieces of the v3 compact attack dialogs: prefs and remembered flags,
// target summary, header / option rows / footer markup, dialog frame setup
// and the common control wiring. Markup matches what the per-type dialogs
// built inline.

import { buildModeSelector, setupModeSelector, derivePowerDamage } from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { EFFECT_REDUCTION_COST } from "../../lib/faserip-rules/faserip-karma.js";

const SCOPE = "msh-faserip";
export const DIALOG_WIDTH = 360;

export function setLS(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function dialogPrefs(key) {
  const rememberKey = `msh.${key}.remember`;
  const skipKey = `msh.${key}.skipDice`;
  return {
    rememberKey,
    skipKey,
    remember: localStorage.getItem(rememberKey) === "1",
    skipDice: localStorage.getItem(skipKey) === "1"
  };
}

export function flagRecall(actor, remember) {
  const recall = (flag, dflt) => remember ? (actor.getFlag(SCOPE, flag) || dflt) : dflt;
  recall.nullish = (flag, dflt) => remember ? (actor.getFlag(SCOPE, flag) ?? dflt) : dflt;
  recall.isTrue = (flag) => remember ? actor.getFlag(SCOPE, flag) === true : false;
  return recall;
}

export function saveDialogFlags(actor, flagUpdate) {
  return actor.update({ [`flags.${SCOPE}`]: flagUpdate });
}

export function targetSummary(targetActor) {
  const health = targetActor?.system?.health;
  const healthStr = health ? `${health.value}/${health.max}` : "";
  const effects = (targetActor?.effects?.filter(e => !e.disabled) ?? [])
    .filter(e => {
      const n = (e.name || e.label || '').toLowerCase();
      return !n.includes('body armor') && !n.includes('force field');
    });
  const statusStr = effects.length > 0 ? effects.map(e => e.name || e.label).join(", ") : "";
  return { healthStr, statusStr };
}

export function headerHtml({ actor, ability, targetDisplay, titles = true, verb = "attacks", statLabel = null, statText = null }) {
  const label = statLabel ?? `Base ${ability.name}:`;
  const stat = statText ?? `${RANK_ABBR[ability.rank] || ability.rank} ${ability.value}`;
  const tip = (text) => titles ? ` title="${text}"` : '';
  return `
      <div class="frp-header-v3">
        <span class="h-actor"${tip(actor.name)}>${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">${label}</span>
          <span class="h-stat-rank">${stat}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">${verb}</span><span class="h-target"${tip(targetDisplay)}>${targetDisplay}</span>`
          : ''}
      </div>`;
}

export function targetCompactHtml({ targetDisplay, healthStr, armorDisplay, statusStr, hintHtml = "" }) {
  if (!targetDisplay) return "";
  return `
      <div class="frp-target-compact">
        ${healthStr ? `<span class="t-hp">HP ${healthStr}</span>` : ''}
        ${armorDisplay ? `<span class="t-armor">${armorDisplay}</span>` : '<span class="t-armor" style="color:#999;">No armor</span>'}
        ${hintHtml}
        ${statusStr ? `<span class="t-status">${statusStr}</span>` : ''}
      </div>`;
}

export function powerSourceOptions(items, actor, { adHoc, savedItemId }) {
  const options = [];
  for (const item of items) {
    const s = item.system || {};
    const dmg = derivePowerDamage(s, actor);
    const rank = s.rank ?? s.powerRank ?? "Remarkable";
    const rankAbbr = RANK_ABBR[rank] || rank;
    const sel = (!adHoc && item.id === savedItemId) ? 'selected'
      : (!adHoc && !savedItemId && item === items[0]) ? 'selected' : '';
    options.push(`<option value="power:${item.id}" ${sel}>${item.name} &mdash; ${rankAbbr} (${dmg})</option>`);
  }
  options.push(`<option value="adhoc" ${adHoc ? 'selected' : ''}>Ad-hoc&hellip;</option>`);
  return options.join('');
}

export function readPowerSource(html, items, actor) {
  const srcVal = html.find('#power-source-select').val() || "adhoc";
  const isAdHoc = srcVal === "adhoc";
  const item = isAdHoc ? null : (items.find(i => i.id === srcVal.replace("power:", "")) || null);
  let rank = "Remarkable";
  let damage = 0;
  if (isAdHoc) {
    rank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
    damage = Number(html.find('[name="adhocDamage"]').val()) || 0;
  } else if (item) {
    const s = item.system || {};
    rank = String(s.rank ?? s.powerRank ?? "Remarkable");
    damage = derivePowerDamage(s, actor);
  }
  return { srcVal, isAdHoc, item, rank, damage };
}

export function aimRowHtml(savedAim, optionsHtml) {
  return `
        <div class="frp-opt-row${savedAim === 'none' ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="aim-enabled" ${savedAim !== 'none' ? 'checked' : ''}> <span class="frp-opt-label red">Aim</span></label>
          <select name="aimMode" ${savedAim === 'none' ? 'disabled' : ''} style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;margin-left:6px;">
            ${optionsHtml}
          </select>
          <span style="font-size:10px;color:#888;margin-left:auto;">Bullseye effect</span>
        </div>`;
}

export function karmaRowHtml({ availableKarma, minKarma }) {
  const hasKarma = availableKarma > 0;
  return `
        <div class="frp-opt-row inactive">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>`;
}

export function blindsideRowHtml() {
  return `
        <div class="frp-opt-row" style="border-top:1px solid #e8e0d0;">
          <label title="RAW: a FEAT forced by a Blindside or an unexpected attack may not be modified by Karma"><input type="checkbox" id="blindside-attack" name="blindside"> <span class="frp-opt-label red">Blindside</span></label>
          <span style="font-size:10px;color:#888;margin-left:auto;">target adds no Karma to Slam/Stun/Kill</span>
        </div>`;
}

export function pullDamageInputHtml({ enabled, pulledDamage, initialDamage }) {
  return `<input type="number" class="frp-pull-input" name="pulledDamage" value="${enabled && pulledDamage > 0 ? pulledDamage : initialDamage}" min="0" max="${initialDamage}" ${!enabled ? 'disabled' : ''}>`;
}

// Edged results may not be pulled for free; one colour step costs Karma.
export function paidEffectRowHtml({ resultCap, canPay, label = "Effect" }) {
  return `
        <div class="frp-opt-row${resultCap === 'none' ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label title="${canPay ? `Reduce the result one colour for ${EFFECT_REDUCTION_COST} Karma` : `Requires ${EFFECT_REDUCTION_COST} Karma`}"><input type="checkbox" id="pull-effect-enabled" ${resultCap !== 'none' ? 'checked' : ''} ${canPay ? '' : 'disabled'}> <span class="frp-opt-label orange">${label}</span></label>
          <select style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;margin-left:6px;" name="resultCap" ${(resultCap === 'none' || !canPay) ? 'disabled' : ''}>
            <option value="yellow" ${resultCap === 'yellow' ? 'selected' : ''}>Cap at Stun</option>
            <option value="green" ${resultCap === 'green' ? 'selected' : ''}>Cap at Hit</option>
          </select>
          <span style="font-size:10px;color:#888;margin-left:auto;">${EFFECT_REDUCTION_COST} Karma / colour</span>
        </div>`;
}

export function wirePaidEffectToggle(html) {
  html.find('#pull-effect-enabled').on('change', function() {
    const $row = $(this).closest('.frp-opt-row');
    $row.toggleClass('inactive', !this.checked);
    $row.find('[name="resultCap"]').prop('disabled', !this.checked);
  });
}

export function fxGridHtml(effects, tips = {}) {
  const tip = (color) => tips[color] ? ` title="${tips[color]}"` : '';
  return `
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w"${tip("white")}>${effects.white}</div>
        <div class="frp-fx-cell g"${tip("green")}>${effects.green}</div>
        <div class="frp-fx-cell y"${tip("yellow")}>${effects.yellow}</div>
        <div class="frp-fx-cell r"${tip("red")}>${effects.red}</div>
      </div>`;
}

export function footerHtml({ remember, skipDice, ids = true }) {
  const id = (value) => ids ? ` id="${value}"` : '';
  return `
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox"${id("msh-remember-settings")} name="remember" ${remember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox"${id("msh-skip-dice")} name="skipDice" ${skipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>`;
}

export function pinDialogWidth(dlg, width = DIALOG_WIDTH) {
  try { dlg?.setPosition?.({ width }); } catch (_) {}
}

// A CSS-only width is re-applied as position.width ('auto') on AppV2's next
// setPosition, which balloons the dialog; the width is pinned through the
// position API as well.
export async function mountDialogFrame({ html, dlg, actor, opts, modeFlag, width = DIALOG_WIDTH }) {
  const $dialog = html.closest('.dialog');
  $dialog.find('.dialog-buttons').hide();

  const $titlebar = $dialog.find('.window-title, .dialog-title').first();
  if ($titlebar.length) {
    const modeHtml = buildModeSelector({ mode: "semi" });
    const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
    $titlebar.after($modeWrap);
  }
  await setupModeSelector(actor, $dialog, opts, modeFlag);

  if ($dialog.length) {
    $dialog.css('width', `${width}px`);
    $dialog[0].style.height = 'auto';
  }
  pinDialogWidth(dlg, width);
  return $dialog;
}

export function wireRollKeys(html, $dialog) {
  html.find('#frp-roll').focus();
  $dialog.on('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      html.find('#frp-roll').trigger('click');
    }
  });
}

export function wireRowToggle(html, selector) {
  html.find(selector).on('change', function() {
    $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
  });
}

export function wireAimToggle(html) {
  html.find('#aim-enabled').on('change', function() {
    const $row = $(this).closest('.frp-opt-row');
    $row.toggleClass('inactive', !this.checked);
    $row.find('[name="aimMode"]').prop('disabled', !this.checked);
  });
}

export function wirePrefToggles(html, prefs) {
  html.find('#msh-skip-dice').on('change', function() {
    setLS(prefs.skipKey, this.checked ? "1" : "0");
  });
  html.find('#msh-remember-settings').on('change', function() {
    setLS(prefs.rememberKey, this.checked ? "1" : "0");
  });
}
