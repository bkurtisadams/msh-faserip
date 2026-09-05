// scripts/modules/actions/cs-modifiers.js v3.6.0 - 2026-09-05
// Manual CS input with base rank, optional range penalty, and ? reference panel.
// v3.6.0: Automatic situational modifiers (HOUSE 2026-09-05). AUTO_SITUATIONAL
//         is a registry of detectors run against the attacker and target
//         tokens; detectAutoSituational() returns the ones that apply, gated
//         by the new world setting autoSituationalModifiers (default on).
//         First entry: Higher Ground +1CS on ranged attacks (Shooting, Throwing,
//         Energy, Force) when the attacker's elevation exceeds the target's by
//         at least one grid square (one story at 0.1 area per square), or the
//         attacker is flying over a non-flying target. Not charging: a charge
//         is run along the ground.
//         buildCSRow({ autoMods }) prefills the CS input and Reason with them
//         when the dialog has nothing remembered; the player can still edit
//         both, so the v3.0.0 manual model stands. Registered from this module
//         so init.js is untouched. resolveAttackerToken() shared helper.
// v3.5.0: Hide the "+ Range N" CS-row term entirely when the penalty is 0
//         (initial build and live recalc), so 0 no longer shows "+ Range 0".
//         Affects every ranged dialog that shares buildCSRow.
// v3.4.0: get() also returns the raw `reason` label so callers can persist
//         it; the field repopulates on reopen when a dialog passes
//         savedReason to buildCSRow.
// v3.3.0: Optional "Reason" field under the CS input (shown only when CS != 0).
//         Names a manual shift on the chat card via csNotes — e.g. typing
//         "Ultimate Skill" with +4 yields the card line "Ultimate Skill: +4".
//         Player still enters the number; nothing is auto-detected.
// v3.2.0: Spell out full rank names: "Good → Remarkable" (not abbreviated).
//         Footer CSS: frp-foot-checks wrapper for right-justified checkboxes.
// v3.1.0: Show base rank abbreviation before arrow, effective rank after.
//         Optional rangePenalty shown as read-only element between CS and arrow.
//         wireCSPanel accepts getRangePenalty callback for live range updates.
// v3.0.0: Strip all talent/power auto-detection. CS is fully manual.

import { shiftRank } from "./action-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Automatic situational modifiers
// ─────────────────────────────────────────────────────────────────────────────

const SETTING_AUTO_SIT = "autoSituationalModifiers";

Hooks.once("init", () => {
  game.settings.register("msh-faserip", SETTING_AUTO_SIT, {
    name: "Automatic situational modifiers",
    hint: "Pre-fill attack dialogs with situational column shifts the system can read from the tokens (e.g. Higher Ground when the attacker is a story or more above the target). Always editable in the dialog.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

export function autoSituationalEnabled() {
  try { return game.settings.get("msh-faserip", SETTING_AUTO_SIT) !== false; }
  catch (_e) { return true; }
}

/** The attacker's token: a controlled token of this actor, else its first active token. */
export function resolveAttackerToken(actor) {
  if (!actor || !canvas?.tokens) return null;
  const controlled = canvas.tokens.controlled?.find(t => t.actor?.id === actor.id);
  if (controlled) return controlled;
  const active = actor.getActiveTokens?.(true) ?? [];
  return active[0] ?? canvas.tokens.placeables?.find(t => t.actor?.id === actor.id) ?? null;
}

const tokenDoc = t => t?.document ?? t;
const elevationOf = t => Number(tokenDoc(t)?.elevation ?? 0) || 0;
const isFlying = t => (tokenDoc(t)?.movementAction ?? "walk") === "fly";
/** One grid square in scene distance units; one story at Kurt's 0.1 area/square. */
const oneSquare = () => Number(canvas?.scene?.grid?.distance ?? 1) || 1;

// Each detector gets { attacker, target, context } (tokens, context is
// 'ranged' | 'charging' | 'melee') and returns true when the modifier applies.
export const AUTO_SITUATIONAL = [
  {
    id: "higherGround",
    label: "Higher Ground",
    cs: 1,
    contexts: ["ranged"],
    detect({ attacker, target }) {
      if (!attacker || !target) return false;
      const diff = elevationOf(attacker) - elevationOf(target);
      if (diff >= oneSquare()) return true;
      return isFlying(attacker) && !isFlying(target) && diff >= 0;
    },
  },
];

/**
 * Situational modifiers the tokens justify for this attack.
 * @returns {Array<{id,label,cs}>}
 */
export function detectAutoSituational({ attacker, target, context = "ranged" } = {}) {
  if (!autoSituationalEnabled()) return [];
  const out = [];
  for (const mod of AUTO_SITUATIONAL) {
    if (!mod.contexts.includes(context)) continue;
    try {
      if (mod.detect({ attacker, target, context })) out.push({ id: mod.id, label: mod.label, cs: mod.cs });
    } catch (_e) { /* a detector must never break a dialog */ }
  }
  return out;
}

/** Sum and joined label for a set of auto modifiers. */
export function summarizeAutoMods(mods) {
  const cs = mods.reduce((a, m) => a + m.cs, 0);
  return { cs, reason: mods.map(m => m.label).join(", ") };
}

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
      { label: "Double Team",      cs: "+1CS", note: "Ally has Hold on target; miss may hit holder" },
      { label: "Combined Attack",  cs: "dmg\u2191", note: "2 dmgs within 10 pts: higher \u2192 next rank min, lower makes Agility FEAT" },
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
// Layout:  CS [__] + Range [-2]  Good (10) → Remarkable (30)  [?]
//   or:    CS [__]               Good (10) → Remarkable (30)  [?]   (when no range)
// ─────────────────────────────────────────────────────────────────────────────

export function buildCSRow({ savedCS = 0, abilityRank, rangePenalty = 0, showRange = false, savedReason = '', autoMods = [] }) {
  // Auto-detected situational modifiers prefill an otherwise empty CS row.
  if (autoMods.length && !savedCS && !savedReason) {
    ({ cs: savedCS, reason: savedReason } = summarizeAutoMods(autoMods));
  }
  const csInputCls = savedCS > 0 ? ' pos' : savedCS < 0 ? ' neg' : '';
  const net = savedCS + rangePenalty;
  const effectiveRank = shiftRank(abilityRank, net);
  const baseLabel = abilityRank;
  const effectiveLabel = effectiveRank;
  const rankColor = net > 0 ? 'color:#2e7d32;' : net < 0 ? 'color:#c62828;' : '';

  const rangeHtml = showRange
    ? `<span class="frp-cs-range-term" id="frp-cs-range-term" style="display:${rangePenalty !== 0 ? 'inline-flex' : 'none'};align-items:center;gap:4px;">
         <span class="frp-cs-plus">+</span>
         <span class="frp-cs-range" id="frp-cs-range-val">
           <span class="frp-range-label">Range</span>
           <span class="frp-range-num" id="frp-range-num">${rangePenalty}</span>
         </span>
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
        <span class="frp-cs-base">${baseLabel}</span>
        <span class="frp-cs-arrow">&rarr;</span>
        <span class="frp-cs-rank" id="frp-cs-rank" style="${rankColor}">${effectiveLabel}</span>
        <button type="button" class="frp-cs-help" id="frp-cs-help" title="CS Reference">?</button>
      </div>
      <div class="frp-cs-reason-row" id="frp-cs-reason-row" style="display:${savedCS !== 0 ? 'flex' : 'none'};align-items:center;gap:8px;margin-top:6px;">
        <span class="frp-cs-label">Reason</span>
        <input type="text" name="csReason" id="frp-cs-reason" value="${String(savedReason).replace(/"/g, '&quot;')}" placeholder="name this shift (optional)" style="flex:1;min-width:0;">
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
  const $rangeTerm = html.find('#frp-cs-range-term');
  const $reasonRow = html.find('#frp-cs-reason-row');
  const $reasonInput = html.find('#frp-cs-reason');

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

    // Update base rank display
    $base.text(_abilityRank);

    // Update effective rank
    $rank.text(effectiveRank);
    if (net > 0) $rank.css('color', '#2e7d32');
    else if (net < 0) $rank.css('color', '#c62828');
    else $rank.css('color', '');

    // Update range display
    if ($rangeNum.length) {
      $rangeNum.text(_rangePenalty);
      const $rangeWrap = $rangeNum.closest('.frp-cs-range');
      $rangeWrap.removeClass('neg');
      if (_rangePenalty < 0) $rangeWrap.addClass('neg');
      // Hide the whole "+ Range N" term when there is no penalty
      $rangeTerm.css('display', _rangePenalty !== 0 ? 'inline-flex' : 'none');
    }

    // Update manual input styling
    $manualInput.removeClass('pos neg');
    if (cs > 0) $manualInput.addClass('pos');
    else if (cs < 0) $manualInput.addClass('neg');

    // Reason row only appears once a shift is entered
    $reasonRow.css('display', cs !== 0 ? 'flex' : 'none');

    if (onUpdate) onUpdate();
  };

  $manualInput.on('input change', recalc);
  $reasonInput.on('input change', () => { if (onUpdate) onUpdate(); });

  // Initial recalc
  recalc();

  return {
    get() {
      const cs = parseInt($manualInput.val()) || 0;
      const net = cs + _rangePenalty;
      const reason = ($reasonInput.val() || '').trim();
      const csNotes = (reason && cs !== 0) ? `${reason}: ${cs > 0 ? '+' : ''}${cs}` : "";
      return { totalShift: net, manualCS: cs, rangePenalty: _rangePenalty, csNotes, reason: (cs !== 0) ? reason : "" };
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