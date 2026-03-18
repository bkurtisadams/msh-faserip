// scripts/modules/actions/cs-modifiers.js v3.1.0 - 2026-03-17
// Manual CS input with base rank, optional range penalty, and ? reference panel.
// v3.1.0: Show base rank abbreviation before arrow, effective rank after.
//         Optional rangePenalty shown as read-only element between CS and arrow.
//         wireCSPanel accepts getRangePenalty callback for live range updates.
// v3.0.0: Strip all talent/power auto-detection. CS is fully manual.

import { shiftRank } from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

// ─────────────────────────────────────────────────────────────────────────────
// Reference data — displayed in the help panel, never auto-applied
// ─────────────────────────────────────────────────────────────────────────────

export const CS_REFERENCE = {
  talents: {
    label: "Talents",
    items: [
      { label: "Martial Arts B",      cs: "+1CS", note: "Fighting (unarmed)" },
      { label: "Martial Arts A",      cs: "—",    note: "Stun/Slam ignores Str/End" },
      { label: "Martial Arts C",      cs: "+1CS", note: "Str grapple/escape, Agi dodge" },
      { label: "Martial Arts D",      cs: "—",    note: "Ignore armor for Stun/Slam (2rd study)" },
      { label: "Martial Arts E",      cs: "—",    note: "+1 initiative (unarmed)" },
      { label: "Wrestling",           cs: "+2CS", note: "Grappling (no dmg bonus)" },
      { label: "Thrown Objects",       cs: "+1CS", note: "Throwing & catching" },
      { label: "Acrobatics",          cs: "+1CS", note: "Dodge, evade, escape" },
      { label: "Guns",                cs: "+1CS", note: "Agility (firearms)" },
      { label: "Thrown Weapons",       cs: "+1CS", note: "Agility (thrown weapons)" },
      { label: "Bows",                cs: "+1CS", note: "Agility (bows/crossbows)" },
      { label: "Blunt Weapons",       cs: "+1CS", note: "Fighting (blunt)" },
      { label: "Sharp Weapons",       cs: "+1CS", note: "Fighting (edged)" },
      { label: "Marksman",            cs: "+1CS", note: "Agility (line-of-sight); no range penalty" },
      { label: "Weapons Master",      cs: "+1CS", note: "Fighting (any melee weapon)" },
      { label: "Weapons Specialist",  cs: "+2CS", note: "One chosen weapon; +1 init" },
    ],
  },
  weaponStacking: {
    label: "Stacking",
    items: [
      { label: "Weapon talents",      cs: "—", note: "NOT cumulative with each other" },
      { label: "Fighting talents",    cs: "—", note: "Cumulative with each other & weapons" },
      { label: "Ultimate Skill",      cs: "—", note: "Ability = Unearthly for one talent" },
    ],
  },
  bonuses: {
    label: "Bonuses",
    items: [
      { label: "Blindside",        cs: "+2CS", note: "Target unaware / from behind" },
      { label: "Ambush",           cs: "+1CS", note: "Pre-set position, specific spot" },
      { label: "Double Team",      cs: "+1CS", note: "Ally has Hold on target" },
      { label: "Combined Attack",  cs: "+1CS", note: "Two attackers, close damage ranks" },
      { label: "Higher Ground",    cs: "+1CS", note: "Elevated / terrain advantage" },
      { label: "Aiming (+1 turn)", cs: "+1CS", note: "Spend turn not attacking (ranged)" },
      { label: "Point Blank",      cs: "+3CS", note: "Adjacent, not in Slugfest/Wrestling" },
      { label: "Charging",         cs: "+1CS/area", note: "Max +3CS (melee)" },
    ],
  },
  penalties: {
    label: "Penalties",
    items: [
      { label: "Through Obstacle", cs: "−2CS", note: "Window, curtain, etc." },
      { label: "Shielding",        cs: "−2CS", note: "Target using cover" },
      { label: "Impaired",         cs: "−2CS", note: "Lost Endurance ranks" },
      { label: "One-handed",       cs: "−2CS", note: "Two-handed weapon, one hand" },
      { label: "No Bow Talent",    cs: "−1CS", note: "Bow/crossbow without talent" },
      { label: "Engaged (melee)",  cs: "−3CS", note: "Ranged into Slugfest/Wrestling" },
    ],
  },
  targetMovement: {
    label: "Target Movement (ranged)",
    items: [
      { label: "Charging at you",  cs: "0",    note: "No penalty" },
      { label: "Moving ≤5 areas",  cs: "−1CS", note: "" },
      { label: "Moving ≤10 areas", cs: "−2CS", note: "" },
      { label: "Moving >10 areas", cs: "−4CS", note: "" },
    ],
  },
  targetSize: {
    label: "Target Size",
    items: [
      { label: "Growth 12-18ft",  cs: "+1CS", note: "" },
      { label: "Growth 18-22ft",  cs: "+2CS", note: "" },
      { label: "Growth 22ft+",    cs: "+3CS", note: "" },
      { label: "Shrunk 1″",       cs: "−1CS", note: "" },
      { label: "Shrunk ¼″",       cs: "−2CS", note: "" },
      { label: "Shrunk smaller",   cs: "−3CS", note: "" },
    ],
  },
  powers: {
    label: "Powers",
    items: [
      { label: "Combat Sense",      cs: "—", note: "Use rank instead of Fight/Agi/Str/Int" },
      { label: "Cosmic Awareness",   cs: "+1CS", note: "vs opponent (requires FEAT)" },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// buildCSRow({ savedCS, abilityRank, rangePenalty })
//
// Layout:  CS [__] + Range [-2]  Gd → Rm  [?]
//   or:    CS [__]               Gd → Rm  [?]   (when no range)
// ─────────────────────────────────────────────────────────────────────────────

export function buildCSRow({ savedCS = 0, abilityRank, rangePenalty = 0, showRange = false }) {
  const csInputCls = savedCS > 0 ? ' pos' : savedCS < 0 ? ' neg' : '';
  const net = savedCS + rangePenalty;
  const effectiveRank = shiftRank(abilityRank, net);
  const baseAbbr = RANK_ABBR[abilityRank] || abilityRank;
  const effectiveAbbr = RANK_ABBR[effectiveRank] || effectiveRank;
  const rankColor = net > 0 ? 'color:#2e7d32;' : net < 0 ? 'color:#c62828;' : '';

  const rangeHtml = showRange
    ? `<span class="frp-cs-plus">+</span>
       <span class="frp-cs-range" id="frp-cs-range-val">
         <span class="frp-range-label">Range</span>
         <span class="frp-range-num" id="frp-range-num">${rangePenalty}</span>
       </span>`
    : '';

  // Build read-only reference panel
  let panelHtml = '';
  for (const [, group] of Object.entries(CS_REFERENCE)) {
    panelHtml += `<div class="frp-ref-group">`;
    panelHtml += `<div class="frp-ref-group-label">${group.label}</div>`;
    for (const item of group.items) {
      panelHtml += `<div class="frp-ref-item">
        <span class="frp-ref-cs">${item.cs}</span>
        <span class="frp-ref-name">${item.label}</span>
        ${item.note ? `<span class="frp-ref-note">${item.note}</span>` : ''}
      </div>`;
    }
    panelHtml += `</div>`;
  }

  return `
    <div class="frp-box frp-cs-box" id="frp-cs-box">
      <div class="frp-cs-line">
        <span class="frp-cs-label">CS</span>
        <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedCS}" id="frp-cs-manual">
        ${rangeHtml}
        <span class="frp-cs-base">${baseAbbr}</span>
        <span class="frp-cs-arrow">&rarr;</span>
        <span class="frp-cs-rank" id="frp-cs-rank" style="${rankColor}">${effectiveAbbr}</span>
        <button type="button" class="frp-cs-help" id="frp-cs-help" title="CS Reference">?</button>
      </div>
      <div class="frp-ref-panel" id="frp-ref-panel" style="display:none;">
        ${panelHtml}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// wireCSPanel(html, { abilityRank, onUpdate, getRangePenalty })
//
// getRangePenalty: optional callback returning current range penalty (number).
//   Called on every recalc. If not provided, range is ignored.
//
// Returns { get(), destroy(), recalc(), setRange(n) }
// ─────────────────────────────────────────────────────────────────────────────

export function wireCSPanel(html, { abilityRank, onUpdate, getRangePenalty } = {}) {
  const $manualInput = html.find('#frp-cs-manual');
  const $rank = html.find('#frp-cs-rank');
  const $base = html.find('.frp-cs-base');
  const $helpBtn = html.find('#frp-cs-help');
  const $refPanel = html.find('#frp-ref-panel');
  const $rangeNum = html.find('#frp-range-num');

  let _abilityRank = abilityRank;

  // Toggle reference panel
  $helpBtn.on('click', (e) => {
    e.stopPropagation();
    $refPanel.toggle();
    if (onUpdate) onUpdate();
  });

  // Close panel on click outside
  const closeHandler = (e) => {
    if (!$(e.target).closest('#frp-cs-box').length) {
      $refPanel.hide();
    }
  };
  $(document).on('click.frpCS', closeHandler);

  let _rangePenalty = 0;

  // Recalculate effective rank display
  const recalc = () => {
    const cs = parseInt($manualInput.val()) || 0;

    // Get range penalty from callback or stored value
    if (getRangePenalty) _rangePenalty = getRangePenalty();
    const net = cs + _rangePenalty;

    const effectiveRank = shiftRank(_abilityRank, net);
    const effectiveAbbr = RANK_ABBR[effectiveRank] || effectiveRank;

    // Update base rank display
    $base.text(RANK_ABBR[_abilityRank] || _abilityRank);

    // Update effective rank
    $rank.text(effectiveAbbr);
    if (net > 0) $rank.css('color', '#2e7d32');
    else if (net < 0) $rank.css('color', '#c62828');
    else $rank.css('color', '');

    // Update range display
    if ($rangeNum.length) {
      $rangeNum.text(_rangePenalty);
      const $rangeWrap = $rangeNum.closest('.frp-cs-range');
      $rangeWrap.removeClass('neg');
      if (_rangePenalty < 0) $rangeWrap.addClass('neg');
    }

    // Update manual input styling
    $manualInput.removeClass('pos neg');
    if (cs > 0) $manualInput.addClass('pos');
    else if (cs < 0) $manualInput.addClass('neg');

    if (onUpdate) onUpdate();
  };

  $manualInput.on('input change', recalc);

  // Initial recalc
  recalc();

  return {
    get() {
      const cs = parseInt($manualInput.val()) || 0;
      const net = cs + _rangePenalty;
      return { totalShift: net, manualCS: cs, rangePenalty: _rangePenalty, csNotes: "" };
    },
    /** Update range penalty and recalc (called by shooting when range changes) */
    setRange(n) {
      _rangePenalty = n;
      recalc();
    },
    /** Change the base ability rank (e.g. PwrHit toggle in energy/force) */
    setAbilityRank(rank) {
      _abilityRank = rank;
      recalc();
    },
    destroy() {
      $(document).off('click.frpCS', closeHandler);
    },
    recalc,
  };
}