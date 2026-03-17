// scripts/modules/actions/cs-modifiers.js v1.0.0 - 2026-03-17
// Shared CS modifier panel for all action dialogs.
// Provides: talent detection, modifier definitions per action type,
// HTML generation, event wiring, and state management.
//
// Usage in an action dialog:
//   const mods = detectModifiers("shooting", actor, ability);
//   const csHtml = buildCSRow({ mods, savedManualCS, savedChecked, abilityRank });
//   // ... include csHtml in dialog template ...
//   // in render:
//   const csState = wireCSPanel(html, { abilityRank, onUpdate });
//   // on resolve:
//   const { totalShift, manualCS, modsTotal, checkedKeys, csNotes, talentFlags } = csState.get();

import { RANKS, shiftRank } from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

// ─────────────────────────────────────────────────────────────────────────────
// Modifier definitions — shared across all action types
// ─────────────────────────────────────────────────────────────────────────────

const SITUATIONAL_MODS = {
  // Bonuses (melee)
  blindside:    { key: "blindside",    label: "Blindside",        cs: 2,  group: "bonuses", hint: "Target unaware, from behind, distracted, or playing possum. Target cannot add Karma to Slam/Stun/Kill FEATs." },
  ambush:       { key: "ambush",       label: "Ambush",           cs: 1,  group: "bonuses", hint: "Pre-set position against specific location. Triggers when any character enters. Karma spent at setup." },
  doubleTeam:   { key: "doubleTeam",   label: "Double Team",      cs: 1,  group: "bonuses", hint: "Ally has Hold on target, second attacker gets bonus." },
  combined:     { key: "combined",     label: "Combined Atk",     cs: 1,  group: "bonuses", hint: "Two attackers within 1 rank damage, lower makes Agi FEAT." },
  higherGround: { key: "higherGround", label: "Higher Ground",    cs: 1,  group: "bonuses", hint: "Judge discretion — elevated position, terrain advantage." },
  aiming:       { key: "aiming",       label: "Aiming (+1 turn)", cs: 1,  group: "bonuses", hint: "Spend 1 turn not attacking = +1CS next round. Shooting/Throwing/Powers." },
  pointBlank:   { key: "pointBlank",   label: "Point Blank",      cs: 3,  group: "bonuses", hint: "Adjacent, not engaged in Slugfest/Wrestling." },

  // Target Movement (ranged only)
  chargingAtYou: { key: "chargingAtYou", label: "Charging at you", cs: 0,  group: "targetMovement", hint: "Target charging directly at attacker (no penalty)." },
  moving5:       { key: "moving5",       label: "Moving \u22645 areas",  cs: -1, group: "targetMovement", hint: "Target moving up to 5 areas/round." },
  moving10:      { key: "moving10",      label: "Moving \u226410 areas", cs: -2, group: "targetMovement", hint: "Target moving up to 10 areas/round." },
  movingFast:    { key: "movingFast",    label: "Moving >10 areas", cs: -4, group: "targetMovement", hint: "Target moving faster than 10 areas/round." },

  // Penalties
  obstacle:     { key: "obstacle",     label: "Through Obstacle", cs: -2, group: "penalties", hint: "Through window, curtain, etc." },
  shielding:    { key: "shielding",    label: "Shielding",        cs: -2, group: "penalties", hint: "Target using object as cover. -2CS all FEATs unless common shield item." },
  impaired:     { key: "impaired",     label: "Impaired",         cs: -2, group: "penalties", hint: "Lost Endurance ranks, -2CS all actions until healed." },
  oneHanded:    { key: "oneHanded",    label: "One-handed",       cs: -2, group: "penalties", hint: "Two-handed weapon fired one-handed." },
  noBowTalent:  { key: "noBowTalent",  label: "No Bow Talent",   cs: -1, group: "penalties", hint: "Bow/crossbow without Bow talent." },
  engaged:      { key: "engaged",      label: "Engaged (melee)",  cs: -3, group: "penalties", hint: "Adjacent and engaged in Slugfest/Wrestling." },

  // Target Size (shared by all)
  growth1:  { key: "growth1",  label: "Growth 12-18ft",   cs: 1,  group: "targetSize", hint: "Target is 12-18ft tall." },
  growth2:  { key: "growth2",  label: "Growth 18-22ft",   cs: 2,  group: "targetSize", hint: "Target is 18-22ft tall." },
  growth3:  { key: "growth3",  label: "Growth 22ft+",     cs: 3,  group: "targetSize", hint: "Target is over 22ft tall." },
  shrink1:  { key: "shrink1",  label: "Shrunk 1\u2033",   cs: -1, group: "targetSize", hint: "Target shrunk to ~1 inch." },
  shrink2:  { key: "shrink2",  label: "Shrunk \u00BC\u2033", cs: -2, group: "targetSize", hint: "Target shrunk to ~\u00BC inch." },
  shrink3:  { key: "shrink3",  label: "Shrunk smaller",   cs: -3, group: "targetSize", hint: "Target smaller than \u00BC inch." },
};

// Which situational modifiers apply to each action type
const ACTION_MODS = {
  "blunt-attack": {
    bonuses:        ["blindside", "ambush", "doubleTeam", "combined", "higherGround"],
    penalties:      ["shielding", "impaired"],
    targetSize:     true,
  },
  "edged-attack": {
    bonuses:        ["blindside", "ambush", "doubleTeam", "combined", "higherGround"],
    penalties:      ["shielding", "impaired"],
    targetSize:     true,
  },
  "shooting": {
    bonuses:        ["blindside", "ambush", "aiming", "higherGround", "pointBlank"],
    targetMovement: ["moving5", "moving10", "movingFast"],
    penalties:      ["obstacle", "shielding", "impaired", "oneHanded", "noBowTalent", "engaged"],
    targetSize:     true,
  },
  "energy": {
    bonuses:        ["blindside", "ambush", "aiming", "higherGround"],
    targetMovement: ["moving5", "moving10", "movingFast"],
    penalties:      ["obstacle", "shielding", "impaired"],
    targetSize:     true,
  },
  "force": {
    bonuses:        ["blindside", "ambush", "aiming", "higherGround"],
    targetMovement: ["moving5", "moving10", "movingFast"],
    penalties:      ["obstacle", "shielding", "impaired"],
    targetSize:     true,
  },
  "throwing-blunt": {
    bonuses:        ["blindside", "ambush", "aiming", "higherGround"],
    targetMovement: ["chargingAtYou", "moving5", "moving10", "movingFast"],
    penalties:      ["obstacle", "shielding", "impaired"],
    targetSize:     true,
  },
  "throwing-edged": {
    bonuses:        ["blindside", "ambush", "aiming", "higherGround"],
    targetMovement: ["chargingAtYou", "moving5", "moving10", "movingFast"],
    penalties:      ["obstacle", "shielding", "impaired"],
    targetSize:     true,
  },
  "grappling": {
    bonuses:        ["blindside", "doubleTeam"],
    penalties:      ["impaired"],
    targetSize:     true,
  },
  "charging": {
    bonuses:        ["blindside", "higherGround"],
    penalties:      ["impaired"],
    targetSize:     true,
  },
};

// Talent detection rules — which talents apply to which action types
// Each entry: { match: regex or function, name, cs, flag, note, actions: [...] }
const TALENT_RULES = [
  { match: /\bguns?\b|gun talent/,                     name: "Guns",      cs: 1, flag: null,               note: "+1CS",             actions: ["shooting"] },
  { match: /marksman/,                                  name: "Marksman",  cs: 1, flag: "no-range-penalty",  note: "+1CS / no range",  actions: ["shooting", "energy", "force"] },
  { match: /weapons?\s*specialist|wpn\s*specialist/,    name: "Wpn Spec",  cs: 2, flag: "initiative",        note: "+2CS +1 Init",     actions: ["shooting"] },
  { match: /\bbow\b(?!.*elbow)/,                        name: "Bows",      cs: 1, flag: null,               note: "+1CS",             actions: ["shooting"] },
  { match: /oriental\s*weapon|oriental\s*wpn/,          name: "Oriental",  cs: 1, flag: null,               note: "+1CS",             actions: ["shooting", "blunt-attack", "edged-attack"] },
  { match: /law\s*enforcement|law-enforcement/,         name: "Law Enf",   cs: 1, flag: null,               note: "+1CS (Guns)",      actions: ["shooting"] },
  { match: /military(?!.*martial)/,                     name: "Military",  cs: 1, flag: null,               note: "+1CS mil wpn",     actions: ["shooting"] },
  { match: /martial\s*arts?\s*b|martial\s*arts?-b|martial\s*arts?.*\(b\)/, name: "MA-B", cs: 1, flag: null, note: "+1CS Fighting",    actions: ["blunt-attack", "edged-attack", "grappling"] },
  { match: /boxing/,                                    name: "Boxing",    cs: 1, flag: null,               note: "+1CS",             actions: ["blunt-attack", "edged-attack"] },
  { match: /martial\s*arts?\s*a|martial\s*arts?-a|martial\s*arts?.*\(a\)/, name: "MA-A", cs: 0, flag: "ignore-str-end", note: "ignore Str/End", actions: ["blunt-attack"] },
  { match: /martial\s*arts?\s*c|martial\s*arts?-c|martial\s*arts?.*\(c\)/, name: "MA-C", cs: 1, flag: null, note: "+1CS grapple/dodge", actions: ["grappling"] },
  { match: /martial\s*arts?\s*d|martial\s*arts?-d|martial\s*arts?.*\(d\)/, name: "MA-D", cs: 0, flag: "ignore-armor-fx", note: "ignore armor (fx)", actions: ["blunt-attack", "edged-attack"] },
  { match: /martial\s*arts?\s*e|martial\s*arts?-e|martial\s*arts?.*\(e\)/, name: "MA-E", cs: 0, flag: "initiative", note: "+1 Initiative", actions: ["blunt-attack", "edged-attack", "shooting", "energy", "force", "throwing-blunt", "throwing-edged", "grappling", "charging"] },
  { match: /wrestling/,                                 name: "Wrestling", cs: 2, flag: null,               note: "+2CS grapple",     actions: ["grappling"] },
  { match: /thrown\s*objects?|throwing/,                 name: "Thr.Obj",   cs: 1, flag: null,               note: "+1CS",             actions: ["throwing-blunt", "throwing-edged"] },
  { match: /sharp\s*weapon|sharp\s*wpn|edged\s*weapon/, name: "Sharp Wpn", cs: 1, flag: null,               note: "+1CS",             actions: ["edged-attack", "throwing-edged"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// detectModifiers(actionType, actor, ability)
// Returns { talents: [...], situational: [...] }
// ─────────────────────────────────────────────────────────────────────────────

export function detectModifiers(actionType, actor, ability) {
  const talents = [];

  for (const item of actor.items) {
    if (item.type !== "talent") continue;
    const itemName = (item.name || "").toLowerCase();
    const rankOverride = item.system?.rankOverride || "";

    let ultimateCS = 0;
    if (rankOverride && ability) {
      const baseIdx = RANKS.indexOf(ability.rank);
      const overIdx = RANKS.indexOf(rankOverride);
      if (baseIdx >= 0 && overIdx >= 0) ultimateCS = overIdx - baseIdx;
    }

    for (const rule of TALENT_RULES) {
      if (!rule.actions.includes(actionType)) continue;
      if (!rule.match.test(itemName)) continue;
      // Avoid duplicates (e.g., Law Enforcement matching both its own rule and "military")
      if (talents.find(t => t.name === rule.name)) continue;
      talents.push({
        key: `talent:${rule.name}`,
        name: rule.name,
        cs: rule.cs,
        flag: rule.flag,
        note: rule.note,
        group: "talents",
        hint: rule.note,
        ultimateCS,
        rankOverride,
      });
      break; // one match per talent item
    }
  }

  // Build situational modifier list for this action type
  const actionDef = ACTION_MODS[actionType] || {};
  const situational = [];

  for (const groupKey of ["bonuses", "targetMovement", "penalties"]) {
    const keys = actionDef[groupKey] || [];
    for (const k of keys) {
      if (SITUATIONAL_MODS[k]) situational.push({ ...SITUATIONAL_MODS[k] });
    }
  }
  if (actionDef.targetSize) {
    for (const k of ["growth1", "growth2", "growth3", "shrink1", "shrink2", "shrink3"]) {
      if (SITUATIONAL_MODS[k]) situational.push({ ...SITUATIONAL_MODS[k] });
    }
  }

  return { talents, situational };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCSRow({ mods, savedManualCS, savedChecked, abilityRank, autoMods })
// Returns HTML string for the CS input + Mods badge row
// ─────────────────────────────────────────────────────────────────────────────

export function buildCSRow({ mods, savedManualCS = 0, savedChecked = [], abilityRank, autoMods = [] }) {
  const { talents, situational } = mods;
  const allMods = [...talents, ...situational];

  // Compute initial mods total from saved checked keys + auto mods
  let initialModsTotal = 0;
  for (const m of allMods) {
    if (savedChecked.includes(m.key)) initialModsTotal += m.cs;
  }
  for (const a of autoMods) {
    initialModsTotal += a.cs;
  }

  const netShift = savedManualCS + initialModsTotal;
  const effectiveRank = shiftRank(abilityRank, netShift);

  const csInputCls = savedManualCS > 0 ? ' pos' : savedManualCS < 0 ? ' neg' : '';
  const modsBadgeCls = initialModsTotal > 0 ? '' : initialModsTotal < 0 ? ' negative' : ' zero';
  const modsSign = initialModsTotal > 0 ? '+' : '';

  // Build mods panel groups
  const groupOrder = [
    { key: "talents", label: "Talents", cls: "talent" },
    { key: "bonuses", label: "Bonuses", cls: "" },
    { key: "targetMovement", label: "Target Movement", cls: "" },
    { key: "penalties", label: "Penalties", cls: "" },
    { key: "targetSize", label: "Target Size", cls: "" },
  ];

  let panelHtml = '';
  for (const g of groupOrder) {
    const items = allMods.filter(m => m.group === g.key);
    if (!items.length) continue;

    panelHtml += `<div class="frp-mp-group">`;
    panelHtml += `<div class="frp-mp-group-label${g.cls ? ` ${g.cls}` : ''}">${g.label}</div>`;
    for (const m of items) {
      const checked = savedChecked.includes(m.key) ? 'checked' : '';
      const csClass = m.cs > 0 ? 'pos' : m.cs < 0 ? 'neg' : '';
      const sign = m.cs > 0 ? '+' : '';
      // Show Ultimate override info for talents with rankOverride
      let nameDisplay = m.label || m.name;
      if (m.ultimateCS > 0 && m.rankOverride) {
        const shortRank = RANK_ABBR[m.rankOverride] || m.rankOverride;
        nameDisplay = `\u2605 ${m.label || m.name} \u2192 ${shortRank}`;
      }
      panelHtml += `<label class="frp-mp-item" title="${m.hint || ''}">
        <input type="checkbox" data-key="${m.key}" data-cs="${m.cs}" ${checked} ${m.flag ? `data-flag="${m.flag}"` : ''}>
        <span class="frp-mp-name">${nameDisplay}</span>
        <span class="frp-mp-cs ${csClass}">${sign}${m.cs}</span>
      </label>`;
    }
    panelHtml += `</div>`;
  }

  // Auto mods (range, etc.) — shown but not user-toggleable
  if (autoMods.length) {
    panelHtml += `<div class="frp-mp-group">`;
    panelHtml += `<div class="frp-mp-group-label">Auto</div>`;
    for (const a of autoMods) {
      const csClass = a.cs > 0 ? 'pos' : a.cs < 0 ? 'neg' : '';
      const sign = a.cs > 0 ? '+' : '';
      panelHtml += `<label class="frp-mp-item auto">
        <input type="checkbox" data-key="${a.key}" data-cs="${a.cs}" data-auto="1" checked disabled>
        <span class="frp-mp-name">${a.label}</span>
        <span class="frp-mp-cs ${csClass}">${sign}${a.cs}</span>
      </label>`;
    }
    panelHtml += `</div>`;
  }

  return `
    <div class="frp-box frp-cs-box" id="frp-cs-box">
      <div class="frp-cs-line">
        <span class="frp-cs-label">CS</span>
        <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedManualCS}" id="frp-cs-manual">
        <span class="frp-cs-plus">+</span>
        <span class="frp-mods-badge${modsBadgeCls}" id="frp-mods-toggle" title="Click to edit modifiers">
          <span class="frp-badge-label">Mods</span> <span id="frp-mods-val">${modsSign}${initialModsTotal}</span>
        </span>
        <span class="frp-cs-arrow">&rarr;</span>
        <span class="frp-cs-rank" id="frp-cs-rank">${effectiveRank}</span>
      </div>
      <div class="frp-mods-panel" id="frp-mods-panel" style="display:none;">
        ${panelHtml}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// wireCSPanel(html, { abilityRank, onUpdate })
// Attaches event handlers. Returns { get(), setAutoMods(mods), destroy() }
// ─────────────────────────────────────────────────────────────────────────────

export function wireCSPanel(html, { abilityRank, onUpdate } = {}) {
  const $panel = html.find('#frp-mods-panel');
  const $toggle = html.find('#frp-mods-toggle');
  const $manualInput = html.find('#frp-cs-manual');
  const $modsVal = html.find('#frp-mods-val');
  const $rank = html.find('#frp-cs-rank');
  const $badge = html.find('#frp-mods-toggle');

  // Toggle panel visibility
  $toggle.on('click', (e) => {
    e.stopPropagation();
    $panel.toggle();
  });

  // Close panel on click outside
  const closeHandler = (e) => {
    if (!$(e.target).closest('#frp-cs-box').length) {
      $panel.hide();
    }
  };
  $(document).on('click.frpMods', closeHandler);

  // Recalculate totals
  const recalc = () => {
    let modsTotal = 0;
    $panel.find('input[type="checkbox"]:checked').each(function() {
      modsTotal += parseInt($(this).data('cs')) || 0;
    });

    const manual = parseInt($manualInput.val()) || 0;
    const net = manual + modsTotal;
    const rank = shiftRank(abilityRank, net);

    // Update badge
    const sign = modsTotal > 0 ? '+' : '';
    $modsVal.text(`${sign}${modsTotal}`);
    $badge.removeClass('zero negative');
    if (modsTotal > 0) {
      $badge.css({ background: '#e8f5e9', borderColor: '#a5d6a7', color: '#2e7d32' });
    } else if (modsTotal < 0) {
      $badge.addClass('negative');
      $badge.css({ background: '#ffebee', borderColor: '#ef9a9a', color: '#c62828' });
    } else {
      $badge.addClass('zero');
      $badge.css({ background: '#f5f3ee', borderColor: '#d8cfb8', color: '#999' });
    }

    // Build hover tooltip from checked items
    const tipParts = [];
    $panel.find('input[type="checkbox"]:checked').each(function() {
      const cs = parseInt($(this).data('cs')) || 0;
      const label = $(this).closest('.frp-mp-item').find('.frp-mp-name').text().trim();
      if (label) tipParts.push(`${label} ${cs > 0 ? '+' : ''}${cs}`);
    });
    $badge.attr('title', tipParts.length > 0 ? tipParts.join('\n') : 'Click to edit modifiers');

    // Update rank display
    $rank.text(rank);
    if (net > 0) $rank.css('color', '#2e7d32');
    else if (net < 0) $rank.css('color', '#c62828');
    else $rank.css('color', '');

    // Update manual input styling
    $manualInput.removeClass('pos neg');
    if (manual > 0) $manualInput.addClass('pos');
    else if (manual < 0) $manualInput.addClass('neg');

    if (onUpdate) onUpdate();
  };

  // Modifier checkbox change
  $panel.on('change', 'input[type="checkbox"]:not([disabled])', recalc);

  // Manual CS input change
  $manualInput.on('input change', recalc);

  // CS reset (clear manual + uncheck all non-auto mods)
  html.find('.frp-cs-reset')?.on('click', (e) => {
    e.preventDefault();
    $manualInput.val(0);
    $panel.find('input[type="checkbox"]:not([disabled])').prop('checked', false);
    recalc();
  });

  // Initial recalc to set badge color and tooltip
  recalc();

  // Public API
  return {
    /** Get current state for resolve */
    get() {
      let modsTotal = 0;
      const checkedKeys = [];
      const talentFlags = {};
      const noteParts = [];

      $panel.find('input[type="checkbox"]:checked').each(function() {
        const key = $(this).data('key') || '';
        const cs = parseInt($(this).data('cs')) || 0;
        const flag = $(this).data('flag') || null;
        const isAuto = $(this).data('auto');
        const label = $(this).closest('.frp-mp-item').find('.frp-mp-name').text().trim();

        modsTotal += cs;
        if (!isAuto) checkedKeys.push(key);
        if (flag) talentFlags[flag] = true;
        if (cs !== 0) {
          const s = cs > 0 ? '+' : '';
          noteParts.push(`${label} ${s}${cs}`);
        }
      });

      const manualCS = parseInt($manualInput.val()) || 0;
      const totalShift = manualCS + modsTotal;
      const csNotes = noteParts.join(', ');

      return { totalShift, manualCS, modsTotal, checkedKeys, csNotes, talentFlags };
    },

    /** Update auto mods (e.g., range penalty changed) */
    setAutoMods(autoMods) {
      // Remove existing auto items
      $panel.find('.frp-mp-item.auto').remove();
      const $autoGroup = $panel.find('.frp-mp-group-label:contains("Auto")').parent();
      if ($autoGroup.length && !autoMods.length) {
        $autoGroup.remove();
      }

      if (autoMods.length) {
        let $group = $panel.find('.frp-mp-group-label:contains("Auto")').parent();
        if (!$group.length) {
          $group = $('<div class="frp-mp-group"><div class="frp-mp-group-label">Auto</div></div>');
          $panel.append($group);
        }
        for (const a of autoMods) {
          const csClass = a.cs > 0 ? 'pos' : a.cs < 0 ? 'neg' : '';
          const sign = a.cs > 0 ? '+' : '';
          $group.append(`<label class="frp-mp-item auto">
            <input type="checkbox" data-key="${a.key}" data-cs="${a.cs}" data-auto="1" checked disabled>
            <span class="frp-mp-name">${a.label}</span>
            <span class="frp-mp-cs ${csClass}">${sign}${a.cs}</span>
          </label>`);
        }
      }
      recalc();
    },

    /** Clean up document click handler */
    destroy() {
      $(document).off('click.frpMods', closeHandler);
    },

    /** Force recalculate (e.g., after external changes) */
    recalc
  };
}