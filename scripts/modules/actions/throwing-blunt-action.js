// throwing-blunt-action.js v3.7.0 - 2026-11-11
// v3.7.0: RULED 2026-11-11: a listed weapon thrown keeps its listed minimum
//         damage; an improvised object has none. Carried damage now comes
//         from the kernel thrownWeaponDamage (same numbers as before).
//         Fixed-bug: the effect grid and Cap select named yellow "Hit" and
//         green "Miss"; Blunt Throwing is Miss / Hit / Bullseye / Stun.
// v3.6.0: Dialog flow moved to the shared ThrownWeaponAction base
//         (thrown-weapon-action.js) over attack-dialog-kit.js. This file
//         keeps what is Blunt-specific: damage and the Pull row with its
//         result cap. Remember flags are written in one actor.update (was
//         11 setFlag calls) and the dialog width is pinned through the
//         position API like the other attack dialogs.
// v3.5.0: Blindside declaration carried to the target's Slam/Stun/Kill
//         FEAT, which then refuses the Karma offer (RAW).
import { ThrownWeaponAction } from "./thrown-weapon-action.js";
import { derivePowerDamage } from "./action-utils.js";
import { pullDamageInputHtml } from "./attack-dialog-kit.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { thrownWeaponDamage } from "../../lib/faserip-rules/faserip-damage.js";
import { kernelKeyFor } from "../../kernel/adapter.js";

const THROWING_BLUNT_POWER_TYPES = ["ice generation"];

function isThrowingBluntPower(item) {
  if (item?.type !== "power") return false;
  const ptl = String(item.system?.type || "").toLowerCase();
  const nameLc = String(item.name || "").toLowerCase();
  return THROWING_BLUNT_POWER_TYPES.some(t => ptl.includes(t) || nameLc.includes(t));
}

// Powers use rank value (RAW: damage equals Power rank).
// Equipment uses thrown-weapon RAW: max(weaponBase, min(STR, MAT)).
function computeThrowingBluntDamage(actor, item) {
  if (!item) return 0;
  if (item.type === "power") {
    const s = item.system || {};
    return derivePowerDamage(s, actor);
  }
  return computeThrownBluntDamage(actor, item);
}

// Lesser of Strength and material strength; a listed weapon never drops
// below its listed damage (RULED 2026-11-11). No bump-to-next-rank rule
// (melee-blunt only).
function computeThrownBluntDamage(actor, weaponItem) {
  if (!weaponItem) return 0;
  const s = actor?.system?.abilities?.strength || {};
  const strVal = Number(s.value || game.msh.getRankValue(s.rank) || 0);
  const matRank = getItemMaterialRank(weaponItem) || "Typical";
  return thrownWeaponDamage({
    listedDamage: Number(weaponItem?.system?.damage || 0),
    strength: strVal,
    itemMaterialRank: kernelKeyFor(matRank) ?? kernelKeyFor("Typical")
  });
}

export class ThrowingBluntAction extends ThrownWeaponAction {
  static THROWN = {
    key: "throwing-blunt",
    kind: "blunt",
    meleeCode: "BA",
    thrownCode: "TB",
    prefKey: "tb",
    flag: "ThrowBlunt",
    damageType: "physical-blunt",
    armorPiercing: false,
    adhocName: "Rock",
    adhocDamage: 6,
    adhocPlaceholder: "Rock, Mug, Wrench...",
    adhocFallbackName: "Improvised Blunt",
    validateAdhocDamage: true,
    selectError: "Select a carried thrown-blunt weapon or use ad-hoc.",
    sourceName: "Thrown Blunt",
    fx: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" }
  };

  _isPower(item) { return isThrowingBluntPower(item); }
  _damage(actor, item) { return computeThrowingBluntDamage(actor, item); }

  _pullRowsHtml(saved, initialDamage) {
    return `
        <div class="frp-opt-row${!saved.pull ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${saved.pull ? 'checked' : ''}> <span class="frp-opt-label orange">Pull</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          ${pullDamageInputHtml({ enabled: saved.pull, pulledDamage: saved.pulledDamage, initialDamage })}
          <span style="font-size:11px;color:#777;">Cap:</span>
          <select style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;" name="resultCap" ${!saved.pull ? 'disabled' : ''}>
            <option value="none" ${saved.resultCap === 'none' ? 'selected' : ''}>None</option>
            <option value="yellow" ${saved.resultCap === 'yellow' ? 'selected' : ''}>Bullseye</option>
            <option value="green" ${saved.resultCap === 'green' ? 'selected' : ''}>Hit</option>
          </select>
        </div>`;
  }

  _readExtras($dlg, { pullEnabled }) {
    const resultCap = pullEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";
    return {
      choice: { resultCap },
      flags: { lastThrowBluntResultCap: resultCap }
    };
  }

  _onPullToggle(html, checked) {
    const $resultCap = html.find('[name="resultCap"]');
    if (checked) $resultCap.prop('disabled', false);
    else $resultCap.val('none').prop('disabled', true);
  }
}
