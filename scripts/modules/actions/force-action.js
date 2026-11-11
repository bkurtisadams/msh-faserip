// force-action.js v3.8.0 - 2026-11-10
// v3.8.0: Dialog flow moved to the shared PowerBlastAction base
//         (power-blast-action.js) over attack-dialog-kit.js. This file keeps
//         what is Force-specific: candidate powers, the Reduce (pull) row,
//         the multi-target guard and the Neutralize aim. Two fixes ride
//         along, both already in the Energy dialog: Remember flags are
//         written in one actor.update (was 15 setFlag calls), and PwrHit
//         passes the power rank's real number via rankValue (was
//         RANKS[rank] on the ordered rank array, so always 30).
// force-action.js v3.7.0 - 2026-09-09
// v3.7.0: Fix dialog ballooning to full width on checkbox/select toggle —
//         same bug and fix as energy-action.js v3.4.2 and
//         contact-action.js v1.3.0. The CSS-only $dialog.css('width')
//         gets overwritten by AppV2's next auto-measure (position.width
//         back to 'auto') on any form-input change. Pin position.width
//         via dlg.setPosition in render instead.
// force-action.js v3.6.0 - 2026-09-05
// v3.6.0: Blindside declaration carried to the target's Slam/Stun/Kill
//         FEAT, which then refuses the Karma offer (RAW).
// scripts/modules/actions/force-action.js v3.5.0 - 2026-09-05
// v3.5.0: Power range penalty via the range kernel (powerRangePenalty); LOS
//         ranks show "LOS" instead of Infinity. Same arithmetic as before.
// scripts/modules/actions/force-action.js v3.4.0 - 2026-09-05
// v3.4.0: Automatic situational modifiers prefill the CS row (cs-modifiers v3.6.0).
// scripts/modules/actions/force-action.js v3.3.4 - 2026-07-09
// v3.3.4: Use derivePowerDamage() for the initial source damage display too,
//         including equipment force weapons routed through the Force dialog.
// scripts/modules/actions/force-action.js v3.3.3 - 2026-07-04
// v3.3.3: Honor system.damageSource when deriving force-power damage (was
//         reading s.damage first via ??, so a rank-sourced power with a
//         0/blank fixed-damage field dealt 0 — e.g. a fresh Air Control from
//         the rebuilt pack). Uses the shared action-utils derivePowerDamage()
//         at all 3 sites (dropdown label, attack derivation, #dmg-val preview).
// scripts/modules/actions/force-action.js v3.3.2 - 2026-05-23
// v3.3.2: Range penalty itemized as "Range" in the to-hit breakdown
//         (was baked into csNotes); manual CS no longer hidden by it.
// v3.3.1: CS Reason now reaches the card (was discarded — only the range
//         note was kept) and persists across reopens (lastForceReason,
//         gated by Remember), matching the other attack dialogs.
// scripts/modules/actions/force-action.js v3.3.0 - 2026-05-16
// v3.3.0: Aim tactic — Bullseye-effect reinterpretation per RAW Tactics.
//         New Aim row in options box: Neutralize only. On Force the red
//         result is already Stun (not Kill), so the "Kill→Bullseye"
//         downgrade does NOT apply — a Force red stays Stun. Neutralize
//         simply adds the disarm chat note on a yellow Bullseye. Stun aim
//         omitted since Force red is already Stun per table. Persisted via
//         lastForceAim actor flag; resolution logic in attack-action.js v1.9.24.
// v3.2.0: Custom Roll/Cancel buttons (Roll first, then Cancel).
//         Footer reordered: [Roll] [Cancel] ... [Remember] [Skip dice].
//         Hide Foundry native button row, use _resolved guard on close.
// v3.1.0: Manual CS only — remove talent/power auto-detection, chips, sit-tags.
//         CS row is manual input + range penalty + ? reference panel via cs-modifiers.js.
//         PwrHit toggle moved to checkbox, uses setAbilityRank().
// v3.0.3: Live range penalty display + auto sit tag (matches shooting pattern)
// v3.0.0: Port to v3 compact dialog layout matching blunt/edged/shooting/energy
// v2.0.0: Refactor - dialog only, delegates resolution to _executeSingleAttack
// v1.6.0: Refactor chat card to use unified card builder utilities
// v1.5.0: Add support for equipment items with Force (F) damage type
import { PowerBlastAction } from "./power-blast-action.js";
import { wireRowToggle } from "./attack-dialog-kit.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

const FORCE_WORDS = /\b(force|telekinesis|kinetic|pressure|concussion|shockwave|ram|air|wind|earth|water|magnetic|gravity|sound|sonic)\b/;
const ENERGY_WORDS = /\b(energy|light|electric|plasma|beam|fire|ice|cold|darkforce|radiation|heat|lightning)\b/;

export class ForceAction extends PowerBlastAction {
  static BLAST = {
    key: "force",
    flag: "Force",
    equipmentCode: "F",
    armorQuery: "physical-force",
    adhocName: "Force Blast",
    adhocDamage: 15,
    touchZeroRange: false,
    liveArmor: true,
    pinWidthOnUpdate: true,
    selectError: "Select a force power or use ad-hoc.",
    damageNote: "Force: Stun effect &bull; BA full vs physical"
  };

  _isCandidatePower(i) {
    const s = i.system || {};
    const cat = String(s.category || "").toLowerCase();
    const typ = String(s.type || "").toLowerCase();
    const nam = String(i.name || "").toLowerCase();

    if (s.isForceAttack === true) return true;
    if (s.isEnergyAttack || s.isBluntAttack || s.isEdgedAttack || s.isShootingAttack || s.isMentalAttack) return false;
    if (ENERGY_WORDS.test(typ) || ENERGY_WORDS.test(nam)) return false;

    const catLooksForce = cat === "mattercontrol" ||
      /\b(force|telekinesis|kinetic|concussion|shockwave)\b/.test(cat);
    return catLooksForce || FORCE_WORDS.test(typ) || FORCE_WORDS.test(nam);
  }

  _armorValue(info) { return info?.applicable ?? 0; }

  _armorView(info, armorNote) {
    const armor = info?.applicable ?? 0;
    const rank = info?.physicalRank || "";
    const abbr = rank ? (RANK_ABBR[rank] || rank) : "";
    return {
      display: armor > 0 ? `BA: ${abbr}(${armor})${armorNote}` : "",
      hintHtml: ""
    };
  }

  _recallExtras(recall, flag) {
    return {
      pull: recall(flag("PullEnabled"), false),
      pulledDamage: recall(flag("PulledDamage"), 0)
    };
  }

  _reduceRowHtml(saved, initialDamage) {
    return `
        <div class="frp-opt-row${!saved.pull ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${saved.pull ? 'checked' : ''}> <span class="frp-opt-label orange">Reduce</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="pulledDamage" value="${saved.pull && saved.pulledDamage > 0 ? saved.pulledDamage : initialDamage}" min="0" max="${initialDamage}" ${!saved.pull ? 'disabled' : ''}>
          <span style="font-size:10px;color:#888;margin-left:auto;">Effect &ne; reduced</span>
        </div>`;
  }

  _multiRowHtml(saved) {
    return `
        <div class="frp-opt-row${!saved.multiAdjacent ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${saved.multiAdjacent ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <span style="font-size:11px;color:#777;margin-left:8px;">Adjacent targets (-4CS)</span>
        </div>`;
  }

  _aimOptionsHtml(savedAim) {
    return `<option value="neutralize" ${savedAim !== 'none' ? 'selected' : ''}>Neutralize (disarm)</option>`;
  }

  _readExtras($dlg, { multiAdjacent }) {
    const targetTokens = Array.from(game.user?.targets ?? []);
    if (targetTokens.length > 1 && !multiAdjacent) {
      ui.notifications.warn("Multiple targets selected. Enable Adjacent Multi-Attack or reduce to one target.");
      return null;
    }
    const pullEnabled = !!$dlg('#pull-punch-enabled').is(':checked');
    const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
    return {
      choice: { pulledDamage, resultCap: "none" },
      flags: { lastForcePullEnabled: pullEnabled, lastForcePulledDamage: pulledDamage }
    };
  }

  _syncReduceMax(html, damage) {
    const $pulledDamage = html.find('[name="pulledDamage"]');
    const oldMax = Number($pulledDamage.attr('max')) || 0;
    $pulledDamage.attr('max', damage);
    if (oldMax !== damage && !html.find('#pull-punch-enabled').is(':checked')) {
      $pulledDamage.val(damage);
    }
  }

  _wireExtras(html, _dlg, { initialDamage }) {
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
    });
    wireRowToggle(html, '#multi-enabled');
  }

  _attackParams(choice, powerItem) {
    return {
      choice: { ...choice, weapon: powerItem },
      rawDamage: choice.pulledDamage > 0 ? choice.pulledDamage : Number(choice.powerDamage) || 0,
      damageType: "physical-force"
    };
  }
}
