// energy-action.js v3.10.0 - 2026-11-10
// v3.10.0: Dialog flow moved to the shared PowerBlastAction base
//          (power-blast-action.js) over attack-dialog-kit.js. This file keeps
//          what is Energy-specific: candidate powers, damage-type inference,
//          the Reduce / result-cap row, Magical override, Stun aim, the
//          Nullify guard and the corrosive Force Field bypass. No behaviour
//          change.
// energy-action.js v3.9.0 - 2026-09-09
// v3.9.0: Fixed-bug — stunt-mechanics.js's deviceAbility opts carried a
//         `touch` flag (Shocking Touch et al.) that nothing read; the
//         dialog always defaulted/remembered a ranged distance instead.
//         deviceAbility.touch now forces the range field to 0, bypassing
//         the remembered lastEnergyRange, so a touch-only stunt resolves
//         at 0 areas with no range penalty every time it's used.
// energy-action.js v3.8.0 - 2026-09-05
// v3.8.0: Blindside declaration carried to the target's Slam/Stun/Kill
//         FEAT, which then refuses the Karma offer (RAW).
// scripts/modules/actions/energy-action.js v3.7.0 - 2026-09-05
// v3.7.0: Power range penalty via the range kernel (powerRangePenalty); LOS
//         ranks show "LOS" instead of Infinity. Same arithmetic as before.
// scripts/modules/actions/energy-action.js v3.6.0 - 2026-09-05
// v3.6.0: Automatic situational modifiers prefill the CS row (cs-modifiers v3.6.0).
// scripts/modules/actions/energy-action.js v3.5.0 - 2026-09-02
// v3.5.0: Kernel slice 5e. Energy Generation (name/type/canReduceEffect)
//         resolves as choice.freeEffectReduction — the power-specific
//         exception to "effect may not be reduced"; every other energy power's
//         result cap is karma-gated in attack-action (50 per colour step).
//         Power-rank to-hit value via rankValue (RANKS[rankName] on the name
//         array always fell through to 30); Remember flags written in ONE
//         actor.update instead of 17 sequential setFlag calls.
// scripts/modules/actions/energy-action.js v3.4.4 - 2026-07-09
// v3.4.4: Normalize equipment damage type E to energy and use derivePowerDamage()
//         for initial, dropdown, preview, and roll damage so equipment energy
//         weapons keep their authored system.damage.
// scripts/modules/actions/energy-action.js v3.4.3 - 2026-07-04
// v3.4.3: Use the shared action-utils derivePowerDamage() instead of the local
//         inlined damageSource block (single source of truth; force/throwing
//         now share it).
// scripts/modules/actions/energy-action.js v3.4.2 - 2026-07-03
// v3.4.2: Fix energy dialog ballooning to full width when a checkbox is
//         toggled. AppV2 re-applied its default position.width ('auto') on
//         form-input changes, which measured the long defensive-powers
//         summary line and blew the window out. Lock position.width to 360
//         via dlg.setPosition in render and re-assert it on the Multi/Magical
//         toggles.
// scripts/modules/actions/energy-action.js v3.4.1 - 2026-07-03
// v3.4.1: Move the "Magical" override checkbox onto the existing Multi row
//         (right-aligned) instead of adding a new option row, so the energy
//         dialog keeps its original size. Multi/Magical dim independently via
//         inline opacity (no shared .inactive class).
// v3.4.0: Magical override toggle (powers audit Step #4 slice 4b wiring).
//         Energy attack dialog gains a "Magical" checkbox; when checked it
//         forces choice.isMagic=true (GM fiat) so a magical resistance
//         reduces the damage. Unchecked leaves it unset, so the source
//         power's system.isMagic auto-derive still governs. Persisted via
//         lastEnergyMagical.
// scripts/modules/actions/energy-action.js v3.3.5 - 2026-07-03
// v3.3.5: Power damage derivation honors system.damageSource. fixed -> the
//         fixed damage field; strength/endurance -> the actor's ability
//         value; rank/material/blank -> power value with rank-table
//         fallback. Previously any nonzero fixed field won regardless of
//         the selector, so rank changes never reached the dialog damage.
// scripts/modules/actions/energy-action.js v3.3.4 - 2026-07-02
// v3.3.4: Infer specific energy damage types from selected power names/types
//         when imported/legacy powers still have blank or generic damageType.
//         Fire Generation now resolves as energy-fire so fire resistance and
//         invulnerability can match in mitigation.
// v3.3.3: Range penalty now itemized as "Range" in the to-hit breakdown
//         instead of being lumped into "Manual".
// v3.3.2: CS Reason field now persists across reopens (lastEnergyReason
//         flag, gated by Remember), matching the other attack dialogs.
// scripts/modules/actions/energy-action.js v3.3.1 - 2026-05-20
// v3.3.1: Revert v3.3.0's ignoresNaturalArmor / ignoresArtificialArmor
//         setters on choiceForAttack in execute(). Per
//         DESIGN-material-strength.md rev 2 §6, corrosive and rotting
//         use the normal damage pipeline (all armor soaks normally)
//         and the shred mechanic is a separate FEAT. The
//         damage-pipeline flag-stamping from v3.3.0 was based on a
//         misread. The isRotting detection + reduce-lock in the
//         dialog update() are correct and stay. bypassForceField
//         on corrosive stays as pre-rev-1 (still §3 open question;
//         corrosive vs FF interpretation pending).
// v3.3.0: Rotting Touch parity with Corrosive Touch. Dialog update() now
//         detects rotting alongside corrosive and applies the same reduce-
//         lock + effect note. execute() sets ignoresNaturalArmor on the
//         choice when corrosive (chews through inorganic BA), and
//         ignoresArtificialArmor when rotting (directed against organic
//         BA). bypassForceField remains corrosive-only per RAW. Consumed
//         downstream by getBodyArmorValues + applyDamageToTargets +
//         calculateMitigation.
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
import { PowerBlastAction } from "./power-blast-action.js";
import { pinDialogWidth } from "./attack-dialog-kit.js";
import { isAuraMaintained } from "./nullify.js";

function inferEnergyDamageType(item, fallback = "energy-generic") {
  const sys = item?.system || {};
  const explicit = String(sys.damageType || "").trim();
  const explicitUpper = explicit.toUpperCase();

  // Equipment sheets store energy weapons as the short code "E". Normalize it
  // before the armor/damage pipeline so pre-mitigation Body Armor uses the
  // Energy value instead of treating "E" as an unknown physical damage type.
  if (explicitUpper === "E") return "energy-generic";

  // Keep intentionally specific authored values. Treat blank/generic as a
  // legacy-import gap and infer from canonical power naming.
  if (explicit && explicit !== "energy-generic") return explicit;

  const controlType = typeof sys.control === "object" ? sys.control?.controlType : "";
  const text = [
    item?.name,
    sys.type,
    sys.subtype,
    sys.category,
    controlType,
    sys.attackType,
    sys.sourceType,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/corrosive|acid/.test(text)) return "corrosive";
  if (/fire|flame|heat|torch/.test(text)) return "energy-fire";
  if (/cold|ice|frost|freez/.test(text)) return "energy-cold";
  if (/electric|lightning/.test(text)) return "energy-electricity";
  if (/sound|sonic/.test(text)) return "energy-sound";
  if (/dark\s*force|darkforce/.test(text)) return "energy-darkforce";
  if (/radiation|radioactive|x-?ray|gamma|light|laser/.test(text)) return "energy-radiation";
  if (/force|concuss|kinetic/.test(text)) return "energy-force";

  return explicit || fallback;
}

function isEnergyGeneration(item) {
  const s = item?.system || {};
  return String(item?.name || "").toLowerCase().includes('energy generation') ||
    s.canReduceEffect === true || s.type?.toLowerCase() === 'energy generation';
}

export class EnergyAction extends PowerBlastAction {
  static BLAST = {
    key: "energy",
    flag: "Energy",
    equipmentCode: "E",
    armorQuery: "energy",
    adhocName: "Energy Blast",
    adhocDamage: 20,
    touchZeroRange: true,
    liveArmor: false,
    pinWidthOnUpdate: false,
    selectError: "Select an energy power or use ad-hoc.",
    damageNote: "BA -20 vs Energy &bull; Kill: White = End Loss"
  };

  _isCandidatePower(i) {
    const s = i.system || {};
    if (s.isEnergyAttack === true) return true;
    if (s.isForceAttack || s.isBluntAttack || s.isEdgedAttack || s.isShootingAttack || s.isMentalAttack) return false;
    const cat = String(s.category || "").toLowerCase();
    const typ = String(s.type || "").toLowerCase();
    const catIsEnergy = cat === "energycontrol";
    const typeLooksEnergy = /\b(energy|light|electric|plasma|beam|blast|fire|cold|darkforce|radiation|heat|lightning)\b/.test(typ);
    return catIsEnergy || typeLooksEnergy;
  }

  _armorValue(info) { return info?.energy ?? 0; }

  _armorView(info, armorNote) {
    const physical = info?.physical ?? 0;
    const energy = info?.energy ?? 0;
    return {
      display: energy > 0
        ? `BA: ${energy}${physical !== energy ? ` (${physical}-20)` : ''}${armorNote}`
        : "",
      hintHtml: physical > 0 && physical !== energy
        ? `<span style="font-size:10px;color:#1565c0;">(BA -20 vs Energy)</span>`
        : ''
    };
  }

  _recallExtras(recall, flag) {
    return {
      magical: recall(flag("Magical"), false),
      reduce: recall(flag("ReduceDamage"), false),
      reducedAmount: recall(flag("ReducedAmount"), 0),
      resultCap: recall(flag("ResultCap"), "none")
    };
  }

  _reduceRowHtml(saved, initialDamage) {
    return `
        <div class="frp-opt-row${!saved.reduce ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="reduce-damage-enabled" ${saved.reduce ? 'checked' : ''}> <span class="frp-opt-label orange">Reduce</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="reducedDamage" value="${saved.reduce && saved.reducedAmount > 0 ? saved.reducedAmount : initialDamage}" min="0" max="${initialDamage}" ${!saved.reduce ? 'disabled' : ''}>
          <span class="result-cap-controls" style="display:none;margin-left:4px;font-size:11px;">
            <label><input type="radio" name="resultCap" value="none" ${saved.resultCap === 'none' ? 'checked' : ''}> Any</label>
            <label><input type="radio" name="resultCap" value="yellow" ${saved.resultCap === 'yellow' ? 'checked' : ''}> Ylw</label>
            <label><input type="radio" name="resultCap" value="green" ${saved.resultCap === 'green' ? 'checked' : ''}> Grn</label>
          </span>
          <span class="effect-note" style="font-size:10px;color:#888;margin-left:auto;">Effect &ne; reduced</span>
        </div>`;
  }

  _multiRowHtml(saved) {
    return `
        <div class="frp-opt-row" style="border-bottom:1px solid #e8e0d0;">
          <label id="multi-lbl" style="${!saved.multiAdjacent ? 'opacity:0.55;' : ''}"><input type="checkbox" id="multi-enabled" ${saved.multiAdjacent ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <span id="multi-hint" style="font-size:11px;color:#777;margin-left:8px;${!saved.multiAdjacent ? 'opacity:0.55;' : ''}">Adjacent targets (-4CS)</span>
          <label id="magical-lbl" style="margin-left:auto;${!saved.magical ? 'opacity:0.55;' : ''}" title="Force this attack to count as magical vs a Resistance to Magical Attacks"><input type="checkbox" id="magical-enabled" ${saved.magical ? 'checked' : ''}> <span class="frp-opt-label" style="color:#7b1fa2;">Magical</span></label>
        </div>`;
  }

  _aimOptionsHtml(savedAim) {
    return `<option value="neutralize" ${savedAim === 'neutralize' ? 'selected' : ''}>Neutralize (disarm)</option>
            <option value="stun" ${(savedAim === 'stun' || savedAim === 'none') ? 'selected' : ''}>Stun</option>`;
  }

  _readExtras($dlg, { item, useAdHoc, powerDamage }) {
    const powerDamageType = item ? inferEnergyDamageType(item, "energy-generic") : "energy-generic";
    const freeEffectReduction = item ? isEnergyGeneration(item) : false;
    const magicalForced = !!$dlg('#magical-enabled').is(':checked');
    const reduceDamageEnabled = !!$dlg('#reduce-damage-enabled').is(':checked');
    const reducedDamage = reduceDamageEnabled ? parseInt($dlg('[name="reducedDamage"]').val() || powerDamage) : powerDamage;
    const resultCap = reduceDamageEnabled ? ($dlg('[name="resultCap"]:checked').val() || 'none') : 'none';
    return {
      choice: {
        useAdHoc,
        powerDamageType,
        isMagic: magicalForced || undefined,
        reduceDamageEnabled, reducedDamage, resultCap, freeEffectReduction
      },
      flags: {
        lastEnergyMagical: magicalForced,
        lastEnergyReduceDamage: reduceDamageEnabled,
        lastEnergyReducedAmount: reducedDamage,
        lastEnergyResultCap: resultCap
      }
    };
  }

  _updateSource(html, src) {
    let energyGeneration = false, isCorrosive = false, isRotting = false;
    if (src.item) {
      const s = src.item.system || {};
      const nameLower = src.item.name.toLowerCase();
      energyGeneration = isEnergyGeneration(src.item);
      const dtLower = String(inferEnergyDamageType(src.item, s.damageType || "")).toLowerCase();
      isCorrosive = /corrosive|acid/.test(nameLower) || /corrosive|acid/.test(dtLower);
      isRotting = /rotting|rot.touch|decay/.test(nameLower) || /rotting|decay/.test(dtLower);
    }

    const $resultCapControls = html.find('.result-cap-controls');
    const $effectNote = html.find('.effect-note');
    if (energyGeneration) {
      $resultCapControls.css('display', 'inline-flex');
      $effectNote.text('Energy Gen: can reduce effect').css('color', '#2e7d32');
    } else {
      $resultCapControls.hide();
      html.find('[name="resultCap"][value="none"]').prop('checked', true);
      $effectNote.text('Effect \u2260 reduced').css('color', '#888');
    }

    // Corrosive / Rotting damage cannot be reduced (DESIGN-material-strength.md §2).
    const $reduceToggle = html.find('#reduce-damage-enabled');
    const $reduceInput = html.find('[name="reducedDamage"]');
    if (isCorrosive) {
      $reduceToggle.prop('checked', false).prop('disabled', true);
      $reduceInput.prop('disabled', true);
      $effectNote.text('Corrosive: damage cannot be reduced').css('color', '#bf360c');
    } else if (isRotting) {
      $reduceToggle.prop('checked', false).prop('disabled', true);
      $reduceInput.prop('disabled', true);
      $effectNote.text('Rotting: damage cannot be reduced').css('color', '#5d4037');
    } else {
      $reduceToggle.prop('disabled', false);
      $reduceInput.prop('disabled', !$reduceToggle.is(':checked'));
    }
  }

  _syncReduceMax(html, damage) {
    const $reducedDamage = html.find('[name="reducedDamage"]');
    const oldMax = Number($reducedDamage.attr('max')) || 0;
    $reducedDamage.attr('max', damage);
    if (oldMax !== damage) $reducedDamage.val(damage);
  }

  _wireExtras(html, dlg) {
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

    html.find('#multi-enabled').on('change', function() {
      html.find('#multi-lbl, #multi-hint').css('opacity', this.checked ? '' : '0.55');
      pinDialogWidth(dlg);
    });

    html.find('#magical-enabled').on('change', function() {
      html.find('#magical-lbl').css('opacity', this.checked ? '' : '0.55');
      pinDialogWidth(dlg);
    });
  }

  // RAW: a character maintaining Nullification cannot use other inborn powers.
  _afterDialog(choice, { items }) {
    try {
      const maintaining = isAuraMaintained(this.actor);
      if (maintaining && !choice.useAdHoc && choice.powerId) {
        const thisItem = items.find(i => i.id === choice.powerId);
        const isNullifyPower =
          (thisItem?.system?.damageType === 'nullification') ||
          (thisItem?.system?.primaryEffect === 'nullification') ||
          /nullif/i.test(thisItem?.name ?? '');
        const isInborn = (thisItem?.system?.source === 'natural');
        if (!isNullifyPower && isInborn) {
          ui.notifications.warn(`${this.actor.name} is maintaining Nullification and cannot use other inborn powers right now.`);
          return false;
        }
      }
    } catch (e) {
      console.warn('Nullify aura guard check failed:', e);
    }
    return true;
  }

  // Corrosive attacks bypass Force Fields (open reading, see
  // DESIGN-material-strength.md rev 2 §3).
  _attackParams(choice, powerItem) {
    const baseDamage = choice.reduceDamageEnabled ? choice.reducedDamage : choice.powerDamage;
    const nameLc = String(powerItem?.name || choice.powerName || "").toLowerCase();
    const dtLc = String(powerItem?.system?.damageType || choice.powerDamageType || "").toLowerCase();
    const isCorrosive = /corrosive|acid/.test(nameLc) || /corrosive|acid/.test(dtLc);
    return {
      choice: {
        ...choice,
        weapon: powerItem,
        bypassForceField: !!choice.bypassForceField || isCorrosive
      },
      rawDamage: Number(baseDamage) || 0,
      damageType: choice.powerDamageType || "energy-generic"
    };
  }
}
