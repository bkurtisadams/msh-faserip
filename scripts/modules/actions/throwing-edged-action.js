// throwing-edged-action.js v3.8.2 - 2026-11-11
// v3.8.2: Effect cap row and its toggle come from attack-dialog-kit.js.
// v3.8.1: Fixed-bug: after Slashing Missile had been selected, switching to
//         a weapon left the Effect checkbox disabled and the cap select
//         blank, so the paid Effect cap could not be taken until the dialog
//         was reopened. The Effect checkbox now follows the Karma test again
//         and the cap select follows the Effect checkbox (it was tied to the
//         Pull checkbox).
// v3.8.0: Dialog flow moved to the shared ThrownWeaponAction base
//         (thrown-weapon-action.js) over attack-dialog-kit.js. This file
//         keeps what is Edged-specific: damage, armor piercing, the paid
//         Effect cap and the Slashing Missile lock. The dialog width is now
//         pinned through the position API like the other attack dialogs.
import { ThrownWeaponAction } from "./thrown-weapon-action.js";
import { RANKS, computeEdgedDamage, derivePowerDamage, getItemArmorPiercingCS } from "./action-utils.js";
import { pullDamageInputHtml, paidEffectRowHtml, wirePaidEffectToggle } from "./attack-dialog-kit.js";
import { EFFECT_REDUCTION_COST } from "../../lib/faserip-rules/faserip-karma.js";
import { getAvailableKarma } from "../dice/dice-roller.js";
import { getItemMaterialRank } from "../../gm-utils.js";

// Power types that route to throwing-edged per power-router (Slashing Missile, etc.)
const THROWING_EDGED_POWER_TYPES = ["slashing missile"];

function isThrowingEdgedPower(item) {
  if (item?.type !== "power") return false;
  const ptl = String(item.system?.type || "").toLowerCase();
  const nameLc = String(item.name || "").toLowerCase();
  return THROWING_EDGED_POWER_TYPES.some(t => ptl.includes(t) || nameLc.includes(t));
}

// Powers use rank value (RAW: Slashing Missile damage equals Power rank).
// Equipment uses thrown-edged RAW: max(min(STR, MAT), weaponBase).
function computeThrowingEdgedDamage(actor, item) {
  if (!item) return 0;
  if (item.type === "power") {
    const s = item.system || {};
    return derivePowerDamage(s, actor);
  }
  return computeThrownEdgedDamage(actor, item);
}

// Same as melee edged: max(min(STR, MAT), weaponBase), no bump-to-next-rank.
function computeThrownEdgedDamage(actor, weaponItem) {
  if (!weaponItem) return 0;
  const s = actor?.system?.abilities?.strength || {};
  const strRank = s.rank || "Typical";
  const strVal = Number(s.value || game.msh.getRankValue(strRank) || 0);
  const matRank = getItemMaterialRank(weaponItem) || "Typical";
  const weaponBase = Number(weaponItem?.system?.damage || 0);
  const res = computeEdgedDamage(strRank, strVal, matRank, weaponBase, RANKS);
  return res.damage;
}

export class ThrowingEdgedAction extends ThrownWeaponAction {
  static THROWN = {
    key: "throwing-edged",
    kind: "edged",
    meleeCode: "EA",
    thrownCode: "TE",
    prefKey: "te",
    flag: "ThrowEdged",
    damageType: "physical-edged",
    armorPiercing: true,
    adhocName: "Broken Bottle",
    adhocDamage: 10,
    adhocPlaceholder: "Broken Bottle, Knife...",
    adhocFallbackName: "Improvised Edged",
    validateAdhocDamage: false,
    selectError: "Select a carried thrown-edged weapon or use ad-hoc.",
    sourceName: "Thrown Edged",
    fx: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }
  };

  _isPower(item) { return isThrowingEdgedPower(item); }
  _damage(actor, item) { return computeThrowingEdgedDamage(actor, item); }

  // RULED 2026-09-05: thrown edged is an Edged Attack for Modifying Results
  // in Combat; the effect is reducible only by spending Karma per colour.
  _pullRowsHtml(saved, initialDamage, { availableKarma }) {
    const canPayReduction = availableKarma >= EFFECT_REDUCTION_COST;
    return `
        <div class="frp-opt-row${!saved.pull ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${saved.pull ? 'checked' : ''}> <span class="frp-opt-label orange">Pull</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          ${pullDamageInputHtml({ enabled: saved.pull, pulledDamage: saved.pulledDamage, initialDamage })}
          <span style="font-size:11px;color:#888;margin-left:auto;">damage only</span>
        </div>
        ${paidEffectRowHtml({ resultCap: saved.resultCap, canPay: canPayReduction })}`;
  }

  _readExtras($dlg, { weapon }) {
    const pullEffectEnabled = $dlg('#pull-effect-enabled').is(':checked');
    const resultCap = pullEffectEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";
    return {
      choice: {
        armorPiercingCS: weapon ? getItemArmorPiercingCS(weapon) : 0,
        damageType: "physical-edged",
        resultCap
      },
      flags: { lastThrowEdgedResultCap: resultCap }
    };
  }

  _updateSource(html, { isAdHoc, weapon }) {
    const ap = (!isAdHoc && weapon) ? getItemArmorPiercingCS(weapon) : 0;
    if (ap > 0) {
      html.find('#ap-display').show();
      html.find('#ap-val').text(`${ap}CS`);
    } else {
      html.find('#ap-display').hide();
    }

    // Slashing Missile: per RAW "may not reduce the effect of the attack."
    const $pullChk = html.find('#pull-punch-enabled');
    const $pullInput = html.find('[name="pulledDamage"]');
    const $resCap = html.find('[name="resultCap"]');
    const $effectChk = html.find('#pull-effect-enabled');
    if (!isAdHoc && weapon && isThrowingEdgedPower(weapon)) {
      $pullChk.prop('checked', false).prop('disabled', true);
      $pullInput.prop('disabled', true);
      $effectChk.prop('checked', false).prop('disabled', true)
        .closest('.frp-opt-row').addClass('inactive');
      $resCap.prop('disabled', true);
      $pullChk.closest('.frp-opt-row').addClass('inactive');
    } else {
      $pullChk.prop('disabled', false);
      $pullInput.prop('disabled', !$pullChk.is(':checked'));
      const canPay = getAvailableKarma(this.actor) >= EFFECT_REDUCTION_COST;
      $effectChk.prop('disabled', !canPay);
      $resCap.prop('disabled', !canPay || !$effectChk.is(':checked'));
    }
  }

  _wireExtras(html) {
    wirePaidEffectToggle(html);
  }
}
