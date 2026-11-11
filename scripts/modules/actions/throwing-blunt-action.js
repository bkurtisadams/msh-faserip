// throwing-blunt-action.js v3.6.0 - 2026-11-10
// v3.6.0: Dialog flow moved to the shared ThrownWeaponAction base
//         (thrown-weapon-action.js) over attack-dialog-kit.js. This file
//         keeps what is Blunt-specific: damage and the Pull row with its
//         result cap. Remember flags are written in one actor.update (was
//         11 setFlag calls) and the dialog width is pinned through the
//         position API like the other attack dialogs.
// throwing-blunt-action.js v3.5.0 - 2026-09-05
// v3.5.0: Blindside declaration carried to the target's Slam/Stun/Kill
//         FEAT, which then refuses the Karma offer (RAW).
// scripts/modules/actions/throwing-blunt-action.js v3.4.0 - 2026-09-05
// v3.4.0: RULED 2026-09-05 thrown range penalty: -1CS per area to the target,
//         own area 0, via the range kernel (thrownRangePenalty); Strength
//         range is the cap. Replaces the free first area.
// scripts/modules/actions/throwing-blunt-action.js v3.3.0 - 2026-09-05
// v3.3.0: Automatic situational modifiers prefill the CS row (cs-modifiers v3.6.0).
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
import { ThrownWeaponAction } from "./thrown-weapon-action.js";
import { derivePowerDamage } from "./action-utils.js";
import { pullDamageInputHtml } from "./attack-dialog-kit.js";
import { getItemMaterialRank } from "../../gm-utils.js";

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

// Thrown blunt damage per RAW (Advanced Set Combat, Blunt Throwing Attack):
// "A blunt thrown weapon inflicts damage equal to the Strength of the thrower,
//  or the material strength of the thrown item, whichever is less."
// No bump-to-next-rank rule (melee-blunt only). Weapon printed damage is a floor.
function computeThrownBluntDamage(actor, weaponItem) {
  if (!weaponItem) return 0;
  const s = actor?.system?.abilities?.strength || {};
  const strVal = Number(s.value || game.msh.getRankValue(s.rank) || 0);
  const matRank = getItemMaterialRank(weaponItem) || "Typical";
  const matVal = Number(game.msh.getRankValue(matRank) || 0);
  const weaponBase = Number(weaponItem?.system?.damage || 0);
  return Math.max(weaponBase, Math.min(strVal, matVal));
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
    fx: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" }
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
            <option value="yellow" ${saved.resultCap === 'yellow' ? 'selected' : ''}>Hit</option>
            <option value="green" ${saved.resultCap === 'green' ? 'selected' : ''}>Miss</option>
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
