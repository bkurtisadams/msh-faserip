// generic-feat-dialog.js v1.5.4 - 2026-07-05
// v1.5.4: Fix FEAT card crash on core 14+. applyMode() was fed the legacy
//         core.rollMode value (a roll mode, not a message mode), so it read
//         .handler off an undefined mode entry and threw — killing Recovery and
//         every other generic-dialog FEAT. Now reads core.messageMode and calls
//         applyMode, with a core.rollMode + applyRollMode fallback for v13.
// generic-feat-dialog.js v1.5.3 - 2026-07-03
// v1.5.3: ChatMessage.applyRollMode -> applyMode (deprecated in core 14).
// v1.5.2: Fix dialog ballooning to full width. Width was pinned only via CSS;
//         AppV2 re-applied its default position.width ('auto') on re-measure,
//         stretching to fit the widest line (e.g. a long intensityHint). Lock
//         position.width via dlg.setPosition in render and re-assert on CS
//         recalc. (Same class of bug/fix as energy-action.js v3.4.2.)
// generic-feat-dialog.js v1.5.1 - 2026-07-03
// v1.5.1: Power FEAT intensity guardrails (slice 5a follow-up).
//           opts.lockIntensity  — disable the INTENSITY dropdown (value still
//                                 shows and is read normally) so a power that
//                                 dictates its intensity can't be mis-set.
//           opts.intensityHint  — one-line caption under the intensity row
//                                 explaining what the intensity means here.
// generic-feat-dialog.js v1.5.0 - 2026-07-03
// v1.5.0: Power FEAT support (powers audit Step #5, slice 5a). New opts turn
//         the shared generic FEAT engine into the Power FEAT path:
//           opts.power (Item)     — roll this power's rank as a FEAT; keeps
//                                   intensity/CS/Karma; hides the ability picker.
//           opts.label (string)   — card title (defaults to the power name).
//           opts.intensity (rank) — preselect the INTENSITY dropdown.
//           opts.onResult(result) — awaited after resolution; return an HTML
//                                   string to append to the card as an effect
//                                   line. result = { success, color, requirement,
//                                   effectiveRank, roll, cappedTotal, karmaUsed,
//                                   isAutomatic }. RAW: with no intensity a
//                                   colored result (green/yellow/red) succeeds,
//                                   white fails.
//           opts.suppressCard     — skip the shared card entirely (caller posts
//                                   its own).
// generic-feat-dialog.js v1.4.1 - 2026-06-05
// v1.4.1: Fix double FEAT roll when detached. Detaching re-runs the render
//         callback, which was stacking a second click/keydown handler on the
//         same (persisted) buttons. Bindings are now namespaced off()+on() so
//         exactly one handler survives across any number of re-renders.
// generic-feat-dialog.js v1.4.0 - 2026-06-05
// v1.4.0: Single chat card per FEAT. Dropped the standalone roll.toMessage()
//         d100 card; the d100 Roll is now attached to the FEAT result card
//         via rolls[] (DSN still animates) and respects the active rollMode.
//         Also skip the post-roll dlg.close() when the dialog is rendered in
//         a Foundry v14 detached window, so a popped-out FEAT window survives
//         a roll instead of tearing itself (and the window) down.
// generic-feat-dialog.js v1.3.1 - 2026-05-25
// v1.3.1: Render FEAT requirements as "Needs:" color pills using Universal Table colors.
// v1.3.0: Base picker can now be a directly-chosen rank, not just an ability.
//         Adds a "Manual Rank" optgroup (Feeble…Beyond); selecting one rolls
//         that rank vs the chosen intensity with no actor ability involved.
//         Remember round-trips a manual rank; box relabeled ABILITY → BASE.
// generic-feat-dialog.js v1.2.0 - 2026-05-06
// v1.2.0: Strip font/padding/color from select inline styles — moved to
//         CSS rule .frp-dlg.frp-feat select for centralised tuning.
//         Only layout (flex, min-width) remains inline.
// v1.1.0: FEAT green theme — add frp-feat wrapper class, swap inline
//         #6a0000 label color for var(--feat-deep). Functional FEAT-result
//         red colors (IMPOSSIBLE, Red column) left intact.
// v1.0.0 - 2026-04-30
// Player-facing FEAT dialog with ability picker + optional context label.
// Routed from the GF button on the Action HUD or game.msh.openGenericFeat().
//
// opts.customRank (string) — bypass actor flow; roll against an arbitrary rank.
// Used by macros / GM tools, hidden from the player UI.

import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma, setupKarmaControlHandlers } from '../dice/dice-roller.js';
import { showFaseripDialog, isDialogDetached } from "./dialog-shim.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { determineFeatRequirement, checkFeatSuccess } from "./ability-feat-dialog.js";

const RANKS = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

const ALL_RANKS_WITH_NONE = ["None", ...RANKS];

const ABILITIES = [
  { key: "fighting",  label: "Fighting"  },
  { key: "agility",   label: "Agility"   },
  { key: "strength",  label: "Strength"  },
  { key: "endurance", label: "Endurance" },
  { key: "reason",    label: "Reason"    },
  { key: "intuition", label: "Intuition" },
  { key: "psyche",    label: "Psyche"    }
];

function applyCS(rank, shift) {
  if (shift === 0) return rank;
  const i = RANKS.indexOf(rank);
  if (i < 0) return rank;
  const shifted = Math.max(0, Math.min(RANKS.length - 1, i + shift));
  return RANKS[shifted];
}

function colorBg(c) {
  switch ((c || '').toLowerCase()) {
    case 'white':  return '#ffffff';
    case 'green':  return '#00a94e';
    case 'yellow': return '#fef102';
    case 'red':    return '#ee1e25';
    default:       return '#ddd';
  }
}

function colorFg(c) {
  switch ((c || '').toLowerCase()) {
    case 'white':  return '#1a1a1a';
    case 'green':  return '#fff';
    case 'yellow': return '#1a1a1a';
    case 'red':    return '#fff';
    default:       return '#1a1a1a';
  }
}

function buildNeedPill(id, initialLabel = 'ANY COLOR') {
  return `<span class="frp-need-line"><span class="frp-need-label">Needs:</span><span id="${id}" class="frp-feat-pill is-white">${initialLabel}</span></span>`;
}

function setNeedPill($el, requirement, { impossible = false, automatic = false } = {}) {
  if (!$el?.length) return;
  const classes = 'frp-feat-pill is-white is-green is-yellow is-red is-auto is-impossible';
  $el.removeClass(classes);

  if (impossible) {
    $el.addClass('frp-feat-pill is-impossible').text('IMPOSSIBLE');
    return;
  }
  if (automatic) {
    $el.addClass('frp-feat-pill is-auto').text('AUTOMATIC');
    return;
  }

  const key = String(requirement || '').toLowerCase();
  const map = {
    'white': ['is-white', 'WHITE'],
    'green': ['is-green', 'GREEN'],
    'yellow': ['is-yellow', 'YELLOW'],
    'red': ['is-red', 'RED'],
    'any color': ['is-white', 'ANY COLOR'],
    'any': ['is-white', 'ANY COLOR']
  };
  const [klass, label] = map[key] || ['is-white', String(requirement || 'ANY COLOR').toUpperCase()];
  $el.addClass(`frp-feat-pill ${klass}`).text(label);
}

export async function showGenericFeatDialog(actor, opts = {}) {
  if (!actor && !opts.customRank && !opts.power) {
    ui.notifications.warn("Generic FEAT requires an actor or a customRank option.");
    return;
  }

  // Power FEAT mode: roll the supplied power's rank as a FEAT (slice 5a).
  const powerItem = opts.power || null;
  const isPowerFeat = !!powerItem;

  const gf = (flag) => actor?.getFlag?.("msh-faserip", flag);
  const setF = (k, v) => actor?.setFlag?.("msh-faserip", k, v);

  const savedAbility   = (gf("lastGenericFeatAbility")) || "fighting";
  const savedLabel     = gf("lastGenericFeatLabel") || "";
  const savedSkipDice  = gf("lastGenericFeatSkipDice") || false;
  const savedRemember  = gf("lastGenericFeatRemember") ?? true;

  // Resolve initial ability + rank state
  let abilityKey, abilityRank, abilityValue, abilityDisplayLabel;
  let manualRank = false;  // base is a directly-picked rank, not an actor ability
  if (opts.customRank) {
    abilityKey = null;
    abilityRank = opts.customRank;
    abilityValue = game.msh?.getRankValue?.(opts.customRank) ?? 0;
    abilityDisplayLabel = "Custom";
  } else if (isPowerFeat) {
    abilityKey = null;
    abilityRank = powerItem.system?.rank || "Typical";
    abilityValue = game.msh?.getRankValue?.(abilityRank) ?? 0;
    abilityDisplayLabel = "Power";
  } else if (RANKS.includes(savedAbility)) {
    manualRank = true;
    abilityKey = null;
    abilityRank = savedAbility;
    abilityValue = game.msh?.getRankValue?.(savedAbility) ?? 0;
    abilityDisplayLabel = "Manual";
  } else {
    abilityKey = ABILITIES.some(a => a.key === savedAbility) ? savedAbility : "fighting";
    const ab = actor.system.abilities[abilityKey];
    abilityRank = ab?.rank || "Typical";
    abilityValue = ab?.value || 6;
    abilityDisplayLabel = abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1);
  }
  const abilityShort = RANK_ABBR[abilityRank] || abilityRank;

  // Build dropdown options
  const selectedRank = manualRank ? abilityRank : null;
  const abilityOptionsHTML = !opts.customRank
    ? '<optgroup label="Ability">'
      + ABILITIES.map(a => {
          const ab = actor.system.abilities[a.key];
          const rank = ab?.rank ?? "—";
          const val = ab?.value ?? 0;
          const short = RANK_ABBR[rank] || rank;
          return `<option value="${a.key}" ${(!manualRank && a.key === abilityKey) ? 'selected' : ''}>${a.label} (${short} ${val})</option>`;
        }).join('')
      + '</optgroup><optgroup label="Manual Rank">'
      + RANKS.map(r => {
          const short = RANK_ABBR[r] || r;
          const val = game.msh?.getRankValue?.(r) ?? 0;
          return `<option value="${r}" ${r === selectedRank ? 'selected' : ''}>${r} (${short} ${val})</option>`;
        }).join('')
      + '</optgroup>'
    : '';

  const presetIntensity = opts.intensity ?? "None";
  const labelDefault = isPowerFeat ? (opts.label ?? powerItem.name) : savedLabel;
  const lockIntensity = !!opts.lockIntensity;   // caller dictates the intensity; disable the dropdown
  const intensityHint = opts.intensityHint || ""; // one-line explanation shown under the row
  const intensityOptionsHTML = ALL_RANKS_WITH_NONE.map(r =>
    `<option value="${r}" ${r === presetIntensity ? 'selected' : ''}>${r}</option>`
  ).join('');

  // Inline CS row — no reference panel (combat modifiers don't apply to FEATs)
  const csRowHtml = `
    <div class="frp-box frp-cs-box">
      <div class="frp-cs-line">
        <span class="frp-cs-label">CS</span>
        <input type="number" class="frp-cs-input" name="shift" value="0" id="frp-cs-manual">
        <span class="frp-cs-base">${abilityShort}</span>
        <span class="frp-cs-arrow">&rarr;</span>
        <span class="frp-cs-rank" id="frp-cs-rank">${abilityRank}</span>
      </div>
    </div>`;

  const showAbilityPicker = !opts.customRank && !isPowerFeat && !!actor;
  const showKarma = !opts.customRank && !!actor;

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor?.name || 'No actor'}">${actor?.name || 'No actor'}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">${abilityDisplayLabel}</span>
          <span class="h-stat-rank">${abilityShort} ${abilityValue}</span>
        </span>
        <span class="h-paren">)</span>
        <span style="margin-left:auto;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:0.4px;text-transform:uppercase;padding:1px 6px;background:rgba(255,255,255,0.18);border-radius:2px;flex-shrink:0;">${isPowerFeat ? 'Power FEAT' : 'Generic FEAT'}</span>
      </div>

      ${showAbilityPicker ? `
      <div class="frp-box">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">BASE</span>
          <select id="generic-ability" name="ability" style="flex:1;min-width:140px;">
            ${abilityOptionsHTML}
          </select>
        </div>
      </div>` : ''}

      <div class="frp-box">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">LABEL</span>
          <input type="text" name="label" placeholder="Optional &mdash; what's this FEAT for?" value="${labelDefault}" style="flex:1;min-width:0;font-family:inherit;font-size:13px;padding:2px 6px;border:1px solid #888;border-radius:2px;background:#fff;">
        </div>
      </div>

      <div class="frp-box" id="intensity-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">INTENSITY</span>
        <select id="intensity" name="intensity" style="flex:1;min-width:100px;" ${lockIntensity ? 'disabled' : ''}>
          ${intensityOptionsHTML}
        </select>
        <span style="margin-left:auto;display:inline-flex;align-items:center;flex-shrink:0;">${buildNeedPill('required-feat-text')}</span>
        ${intensityHint ? `<div style="flex-basis:100%;font-size:10px;color:#777;margin-top:2px;line-height:1.3;">${intensityHint}</div>` : ''}
      </div>

      ${csRowHtml}

      ${showKarma ? generateKarmaControlsHTML(actor) : ''}

      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="remember" id="save-settings" ${savedRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" name="skipDice" id="skip-dice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>`;

  showFaseripDialog({
    title: actor ? `Generic FEAT: ${actor.name}` : `Generic FEAT`,
    content: dialogContent,
    render: async (html, dlg) => {
      if (showKarma) setupKarmaControlHandlers(html);
      const $dialog = html.closest('.dialog');
      $dialog.find('.dialog-buttons, footer.form-footer').hide();
      if ($dialog.length) {
        $dialog.css('width', '380px');
        $dialog[0].style.height = 'auto';
      }
      // Lock width through the AppV2 position API. A CSS-only width is re-applied
      // as position.width ('auto' by default) on the next setPosition AppV2 runs
      // (e.g. a form-input change or content re-measure), which then stretches
      // to fit the widest line — e.g. a long intensityHint. Pinning it keeps the
      // dialog fixed across re-measures. (Mirrors the energy-action.js fix.)
      try { dlg?.setPosition?.({ width: 380 }); } catch (_) {}

      let currentRank = abilityRank;
      let currentValue = abilityValue;
      let currentLabel = abilityDisplayLabel;
      let currentKey = abilityKey;

      const $abilitySelect = html.find('#generic-ability');
      const $intensity = html.find('#intensity');
      const $shift = html.find('[name="shift"]');
      const $reqText = html.find('#required-feat-text');
      const $csInput = html.find('#frp-cs-manual');
      const $csRank = html.find('#frp-cs-rank');
      const $csBase = html.find('.frp-cs-base');
      const $hStatLabel = html.find('.frp-header-v3 .h-stat-label');
      const $hStatRank = html.find('.frp-header-v3 .h-stat-rank');

      const updateFeatRequirement = () => {
        const intensity = $intensity.val();
        const cs = parseInt($shift.val()) || 0;

        if (intensity === "None") {
          setNeedPill($reqText, 'Any Color');
          return;
        }

        const effectiveRank = applyCS(currentRank, cs);
        const { requirement, impossible, automatic } = determineFeatRequirement(effectiveRank, intensity);
        setNeedPill($reqText, requirement, { impossible, automatic });
      };

      // Base picker change (ability OR manual rank) → swap header + CS row + recompute
      $abilitySelect.on('change', () => {
        if (!actor) return;
        const val = $abilitySelect.val();
        const ability = ABILITIES.find(a => a.key === val);
        if (ability) {
          currentKey = val;
          const ab = actor.system.abilities[currentKey];
          currentRank = ab?.rank || "Typical";
          currentValue = ab?.value || 6;
          currentLabel = ability.label;
        } else {
          currentKey = null;
          currentRank = val;
          currentValue = game.msh?.getRankValue?.(val) ?? 0;
          currentLabel = "Manual";
        }
        const short = RANK_ABBR[currentRank] || currentRank;
        $hStatLabel.text(currentLabel);
        $hStatRank.text(`${short} ${currentValue}`);
        $csBase.text(short);
        const cs = parseInt($csInput.val()) || 0;
        $csRank.text(applyCS(currentRank, cs));
        updateFeatRequirement();
      });

      // CS input live recalc with pos/neg coloring
      const recalcCS = () => {
        const cs = Number($csInput.val()) || 0;
        $csInput.removeClass('pos neg');
        if (cs > 0) $csInput.addClass('pos');
        else if (cs < 0) $csInput.addClass('neg');
        $csRank.text(applyCS(currentRank, cs));
        updateFeatRequirement();
        if ($dialog.length) $dialog[0].style.height = 'auto';
        try { dlg?.setPosition?.({ width: 380 }); } catch (_) {}
      };
      $csInput.on('change keyup', recalcCS);

      $intensity.on('change', updateFeatRequirement);

      updateFeatRequirement();

      const runRoll = async () => {
        const labelVal     = (html.find('[name="label"]').val() || '').trim();
        const intensity    = $intensity.val();
        const columnShift  = parseInt($shift.val()) || 0;
        const spendKarma   = html.find('#spend-karma').is(':checked');
        const saveSettings = html.find('[name="remember"]').is(':checked');
        const skipDice     = html.find('[name="skipDice"]').is(':checked');

        if (saveSettings && actor && !isPowerFeat) {
          await setF("lastGenericFeatAbility", currentKey || currentRank);
          await setF("lastGenericFeatLabel", labelVal);
          await setF("lastGenericFeatSkipDice", skipDice);
          await setF("lastGenericFeatRemember", true);
        } else if (!saveSettings && actor) {
          await setF("lastGenericFeatRemember", false);
        }

        const effectiveRank = applyCS(currentRank, columnShift);

        let featRequirement = "Any Color";
        let isImpossible = false;
        let isAutomatic = false;
        if (intensity !== "None") {
          const req = determineFeatRequirement(effectiveRank, intensity);
          featRequirement = req.requirement;
          isImpossible = req.impossible;
          isAutomatic = req.automatic;
        }

        if (isImpossible) {
          ui.notifications.warn(`FEAT is impossible: ${effectiveRank} ability vs ${intensity} intensity. Need ability to be within one rank of intensity.`);
          return;
        }

        const cardTitle = labelVal || (isPowerFeat ? "Power FEAT" : "Generic FEAT");
        const cardSubtitle = isPowerFeat
          ? (intensity !== "None" ? `Power FEAT vs ${intensity} intensity` : `Power rank FEAT (${currentRank})`)
          : (intensity !== "None" ? `${currentLabel} FEAT vs ${intensity} intensity` : `${currentLabel} (${currentRank})`);
        // RAW: with no intensity, a colored result (green/yellow/red) succeeds; white fails.
        const isColored = c => ["green", "yellow", "red"].includes(String(c).toLowerCase());

        if (isAutomatic) {
          const result = { success: true, isAutomatic: true, color: "automatic", requirement: featRequirement, effectiveRank, roll: null, cappedTotal: null, karmaUsed: 0 };
          let effectHtml = "";
          if (opts.onResult) { try { effectHtml = (await opts.onResult(result)) || ""; } catch (e) { console.error("Power FEAT onResult error:", e); } }
          if (!opts.suppressCard) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
                <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                  <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                    <strong>${cardTitle}</strong><br>
                    <span style="font-size:0.85em;font-weight:400;">${cardSubtitle}</span>
                  </div>
                  <div style="padding:5px 10px;font-size:0.9em;">
                    <div>Base Rank: ${currentRank} (${currentValue})</div>
                    ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} &rarr; ${effectiveRank}</div>` : ''}
                    <div>Intensity: ${intensity}</div>
                    <div>Ability rank is 3+ ranks higher than intensity</div>
                  </div>
                  <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:#00a94e;color:#fff;">
                    AUTOMATIC SUCCESS
                  </div>
                  ${effectHtml}
                </div>`
            });
          }
          return;
        }

        const roll = new Roll("1d100");
        await roll.evaluate();

        let cappedTotal = roll.total;
        let karmaUsed = 0;

        if (spendKarma && actor && getAvailableKarma(actor) > 0) {
          const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
          const karmaResult = await showKarmaDecisionDialog(
            actor, roll.total, effectiveRank, `${currentLabel} FEAT`, initialColor
          );
          cappedTotal = karmaResult.finalResult;
          karmaUsed = karmaResult.karmaSpent;
        }

        const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

        let featSuccess;
        if (intensity !== "None") featSuccess = checkFeatSuccess(resultColor, featRequirement);
        else featSuccess = isColored(resultColor);  // RAW: colored = success, white = fail

        const result = { success: featSuccess, isAutomatic: false, color: resultColor, requirement: featRequirement, effectiveRank, roll: roll.total, cappedTotal, karmaUsed };
        let effectHtml = "";
        if (opts.onResult) { try { effectHtml = (await opts.onResult(result)) || ""; } catch (e) { console.error("Power FEAT onResult error:", e); } }

        const featMsg = {
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                <strong>${cardTitle}</strong><br>
                <span style="font-size:0.85em;font-weight:400;">${cardSubtitle}</span>
              </div>
              <div style="padding:5px 10px;font-size:0.9em;">
                <div>Base Rank: ${currentRank} (${currentValue})</div>
                ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} &rarr; ${effectiveRank}</div>` : ''}
                ${intensity !== "None" ? `<div>Intensity: ${intensity} (Required: ${featRequirement})</div>` : ''}
                <div>Roll: ${roll.total}${karmaUsed ? ` + Karma: ${karmaUsed}` : ''} = ${cappedTotal}</div>
              </div>
              <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
                ${resultColor.toUpperCase()}
              </div>
              ${(intensity !== "None" || isPowerFeat) ? `
                <div style="padding:5px 10px;font-size:1.05em;text-align:center;font-weight:bold;color:${featSuccess ? '#2e7d32' : '#c62828'};">
                  ${featSuccess ? 'FEAT SUCCEEDED' : 'FEAT FAILED'}
                </div>
              ` : ''}
              ${effectHtml}
            </div>`
        };
        if (!skipDice) {
          featMsg.rolls = [roll];
          try { ChatMessage.applyMode(featMsg, game.settings.get("core", "messageMode")); }
          catch { try { ChatMessage.applyRollMode(featMsg, game.settings.get("core", "rollMode")); } catch {} }
        }
        if (!opts.suppressCard) await ChatMessage.create(featMsg);
      };

      html.find('#frp-roll').off('click.frp').on('click.frp', async () => {
        try { await runRoll(); }
        finally { if (!isDialogDetached(dlg)) dlg.close(); }
      });
      html.find('#frp-cancel').off('click.frp').on('click.frp', () => dlg.close());
      html.find('#frp-roll').focus();
      $dialog.off('keydown.frp').on('keydown.frp', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          html.find('#frp-roll').trigger('click');
        }
      });
    }
  });
}