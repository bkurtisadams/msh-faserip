// ability-feat-dialog.js v1.9.1 - 2026-08-21
// v1.9.1: Add transient combat-tracker FEAT mode with result callbacks and
//         fixed required colors; transient rolls start clean instead of inheriting
//         remembered manual CS/skip-dice state. Honor selfPenaltyCS for all
//         ordinary ability FEATs so RAW Change Action penalties propagate.
// ability-feat-dialog.js v1.9.0 - 2026-08-14
// v1.9.0: Add Agility Combined FEAT for blunt teamwork. Helper targets the
//         primary attacker; helper/primary bare-hand damage must be within
//         10 points and helper may not exceed primary. A Green+ Agility FEAT
//         banks a one-round Combined Assist flag on the primary attacker,
//         storing helper damage so the Blunt dialog can auto-fill the exact
//         next-rank-minimum bonus. Uses GM socket update for cross-owner help.
// ability-feat-dialog.js v1.8.2 - 2026-07-05
// v1.8.2: Fix ability-FEAT card crash on core 14+. Same applyMode() fix as
//         generic-feat-dialog v1.5.4 — read core.messageMode (not the legacy
//         rollMode) and fall back to applyRollMode for v13.
// ability-feat-dialog.js v1.8.1 - 2026-07-03
// v1.8.1: ChatMessage.applyRollMode -> applyMode (deprecated in core 14).
// v1.8.0: Combat Sense FEAT-substitution (audit Step #7 slice 7b). Extends the
//         slice-4a substitution to a sense power: on Intuition/Fighting/
//         Agility/Strength FEATs, an owned Combat Sense adds a category radio
//         (labelled with the RAW context — surprise/block/dodge/escape) that
//         rolls the higher of the ability vs Combat Sense rank. Card
//         substitution line generalized (was "Resistance:"-prefixed).
// ability-feat-dialog.js v1.7.0 - 2026-07-03
// v1.7.0: Resistance FEAT substitution (powers audit Step #4, slice 4a).
//         Endurance/Intuition/Psyche FEATs gain TYPE radios for owned
//         "featReplace" resistance powers (Toxin/Disease, Emotion,
//         Mental/Magical). Selecting a category rolls the resistance rank
//         instead of the ability; Standard rolls the ability as normal.
//         Magical rolls the higher of Psyche vs the magical resistance
//         rank (RAW: the resistance may be lower than Psyche). Damage
//         reduction for Magical is separate (slice 4b, mitigation.js).
// ability-feat-dialog.js v1.6.1 - 2026-06-05
// v1.6.1: Fix double FEAT roll when detached. Detaching re-runs the render
//         callback, which was stacking a second click/keydown handler on the
//         same (persisted) buttons. Bindings are now namespaced off()+on() so
//         exactly one handler survives across any number of re-renders.
// ability-feat-dialog.js v1.6.0 - 2026-06-05
// v1.6.0: Single chat card per FEAT. Dropped the standalone roll.toMessage()
//         d100 card; the d100 Roll is now attached to the FEAT result card
//         via rolls[] (DSN still animates) and respects the active rollMode.
//         Also skip the post-roll dlg.close() when the dialog is rendered in
//         a Foundry v14 detached window, so a popped-out FEAT window survives
//         a roll instead of tearing itself (and the window) down.
// ability-feat-dialog.js v1.5.2 - 2026-05-25
// v1.5.2: Render FEAT requirements as "Needs:" color pills using Universal Table colors.
// v1.5.1: Fix Remember checkbox forcing itself back on — it was hardcoded
//         `checked`. Now renders from a saved flag (last<Ability>SaveSettings)
//         and persists its own state unconditionally so turning it OFF sticks,
//         matching generic-feat-dialog's behavior.
// ability-feat-dialog.js v1.5.0 - 2026-05-06
// v1.5.0: Strip font/padding/color from select inline styles — moved to
//         CSS rule .frp-dlg.frp-feat select for centralised tuning.
//         Only layout (flex, min-width) remains inline.
// v1.4.0: NEED color readouts inside Lifting/Breaking/Multi-Attack sub-
//         panels (previously hidden because intensityRow.hide() also hid
//         #required-feat-text). updateFeatRequirement now writes to all
//         four targets in a single jQuery selector; only visible ones
//         are seen.
// v1.3.0: FEAT green theme — add frp-feat wrapper class, swap inline
//         #6a0000 label color for var(--feat-deep). Functional FEAT-result
//         red colors (IMPOSSIBLE, Red column) left intact.
// v1.2.1: Drop CS reference panel — that's a combat-modifier list (Surprise,
//         Cover, Blindside) which doesn't apply to ability FEATs. Inline
//         the CS row instead of using buildCSRow + wireCSPanel.
// v1.2.0: Compact frp-dlg + frp-header-v3 layout matching Blunt Attack style.
//         Header banner replaces "Ability Rank" row. FEAT Type radios
//         become single-line opt-row. Lifting/Breaking/Multiattack panels
//         collapse to compact frp-box rows. Intensity + Required FEAT
//         on one line. CS row inlined with live effective-rank recalc.
//         Roll/Cancel + Remember/Skip dice in single frp-foot.
//         Switched showFaseripButtonDialog → showFaseripDialog so the
//         framework footer is hidden; buttons live in content.
// v1.1.0 - 2026-03-21
// Standalone ability FEAT dialog. Fighting supports Multiple Combat Actions pre-action FEAT.

import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma, setupKarmaControlHandlers } from '../dice/dice-roller.js';
import { applyColumnShifts } from '../dice/column-shifts.js';
import { showFaseripDialog, isDialogDetached } from "./dialog-shim.js";
import { executeAsGM } from "../../gm-utils.js";
import { RANK_ABBR, rankValue, RANK_RANGES, RANKS_ORDERED, valueToRank, shiftRank as sharedShiftRank } from "../../rules/rules-reference.js";
import { kernelKeyFor } from "../../kernel/adapter.js";
import { requiredColor as kernelRequiredColor, colorAtLeast as kernelColorAtLeast } from "../../lib/faserip-rules/faserip-kernel.js";

const RANKS = RANKS_ORDERED; // slice 3: shared kernel-backed order

const ALL_RANKS_WITH_NONE = ["None", ...RANKS];

const WEIGHT_INTENSITIES = [
  { rank: "Feeble", display: "Feeble (Up to 50 lbs)" },
  { rank: "Poor", display: "Poor (Up to 100 lbs)" },
  { rank: "Typical", display: "Typical (Up to 200 lbs)" },
  { rank: "Good", display: "Good (Up to 400 lbs)" },
  { rank: "Excellent", display: "Excellent (Up to 800 lbs)" },
  { rank: "Remarkable", display: "Remarkable (Up to 2000 lbs / 1 ton)" },
  { rank: "Incredible", display: "Incredible (Up to 10 tons)" },
  { rank: "Amazing", display: "Amazing (Up to 50 tons)" },
  { rank: "Monstrous", display: "Monstrous (Up to 80 tons)" },
  { rank: "Unearthly", display: "Unearthly (Up to 100 tons)" },
  { rank: "Shift-X", display: "Shift-X (Up to 250 tons)" },
  { rank: "Shift-Y", display: "Shift-Y (Up to 500 tons)" },
  { rank: "Shift-Z", display: "Shift-Z (Up to 1000 tons)" }
];

const MATERIALS_BY_RANK = {
  "Feeble": ["Cloth", "Glass", "Brush", "Paper"],
  "Poor": ["Normal Plastics", "Crystal", "Wood"],
  "Typical": ["Rubber", "Gold", "Brass", "Copper", "Ice", "Adobe", "Computer Chips"],
  "Good": ["Brick", "Aluminum", "Light Machinery", "Asphalt", "High Strength Plastics"],
  "Excellent": ["Concrete", "Beta Cloth", "Iron", "Bullet-proof Glass"],
  "Remarkable": ["Reinforced Concrete", "Steel"],
  "Incredible": ["Solid Stone", "Vibranium", "Volcanic Rock"],
  "Amazing": ["Osmium Steel", "Granite", "Gemstones"],
  "Monstrous": ["Diamond", "Super-heavy Alloys"],
  "Unearthly": ["Adamantium Steel", "Mystical/Enchanted"],
  "Class 1000-5000": ["Cap's Shield", "Thor's Hammer", "Virtually Indestructible"]
};

// Flatten into lookup
const MATERIALS = {};
for (const [rank, mats] of Object.entries(MATERIALS_BY_RANK)) {
  for (const mat of mats) {
    MATERIALS[mat] = rank === "Class 1000-5000" ? "Unearthly" : rank;
  }
}

// ── Pure helpers ──────────────────────────────────────────────

// slice 3: kernel-backed (certified requiredColor; automatic at exactly-3-below per ruling)
export function determineFeatRequirement(abilityRank, intensity) {
  const aKey = kernelKeyFor(abilityRank);
  const iKey = kernelKeyFor(intensity);
  if (!aKey || !iKey) {
    return { requirement: "Any Color", impossible: false, automatic: false };
  }
  const needed = kernelRequiredColor(aKey, iKey);
  if (needed === "impossible") return { requirement: "Red", impossible: true, automatic: false };
  if (needed === "automatic")  return { requirement: "Automatic", impossible: false, automatic: true };
  return { requirement: needed.charAt(0).toUpperCase() + needed.slice(1), impossible: false, automatic: false };
}

// slice 3: kernel-backed (colorAtLeast)
export function checkFeatSuccess(resultColor, requirement) {
  const needed = String(requirement).toLowerCase();
  if (!["green", "yellow", "red"].includes(needed)) return true;
  return kernelColorAtLeast(String(resultColor).toLowerCase(), needed);
}

// slice 3: shared kernel-backed shift (clamps Shift-0..Shift-Z; Class 1000+ unshiftable)
function applyCS(rank, shift) {
  return sharedShiftRank(rank, shift);
}

function getCombinedNextRank(damage) {
  const n = Number(damage) || 0;
  if (n <= 0) return null;
  const currentRank = valueToRank(n);
  const idx = RANKS_ORDERED.indexOf(currentRank);
  if (idx < 0 || idx >= RANKS_ORDERED.length - 1) return null;
  const nextRank = RANKS_ORDERED[idx + 1];
  const nextMin = RANK_RANGES[nextRank]?.[0] ?? rankValue(nextRank);
  if (!Number.isFinite(nextMin) || nextMin <= n) return null;
  return { currentRank, nextRank, nextMin, bonus: nextMin - n };
}

function getCombinedFeatContext(actor) {
  const selected = Array.from(game.user?.targets ?? []);
  if (selected.length !== 1) {
    return { ok: false, message: "Combined FEAT requires exactly one targeted primary attacker." };
  }

  const target = selected[0];
  const primaryActor = target?.actor;
  if (!primaryActor) {
    return { ok: false, message: "Combined FEAT target has no actor." };
  }
  if (primaryActor.id === actor.id || primaryActor.uuid === actor.uuid) {
    return { ok: false, message: "Combined FEAT: target the primary attacker, not yourself." };
  }

  const helperStrength = actor.system?.abilities?.strength;
  const primaryStrength = primaryActor.system?.abilities?.strength;
  const helperDamage = Number(helperStrength?.value ?? rankValue(helperStrength?.rank)) || 0;
  const primaryDamage = Number(primaryStrength?.value ?? rankValue(primaryStrength?.rank)) || 0;

  if (helperDamage <= 0 || primaryDamage <= 0) {
    return { ok: false, message: "Combined FEAT could not determine both characters' blunt damage." };
  }
  if (helperDamage > primaryDamage) {
    return {
      ok: false,
      message: `${primaryActor.name} is not the higher-damage attacker (${primaryDamage} vs ${helperDamage}). Target the primary attacker with equal or greater damage.`,
      target, primaryActor, helperDamage, primaryDamage
    };
  }

  const difference = primaryDamage - helperDamage;
  if (difference > 10) {
    return {
      ok: false,
      message: `${primaryActor.name} is too strong for this Combined Attack (${primaryDamage} vs ${helperDamage}; difference ${difference}, maximum 10).`,
      target, primaryActor, helperDamage, primaryDamage, difference
    };
  }

  const promoted = getCombinedNextRank(primaryDamage);
  if (!promoted) {
    return {
      ok: false,
      message: `${primaryActor.name}'s ${primaryDamage} damage cannot be raised to a higher rank.`,
      target, primaryActor, helperDamage, primaryDamage, difference
    };
  }

  return {
    ok: true,
    target,
    primaryActor,
    primaryActorUuid: target?.document?.uuid || primaryActor.uuid,
    helperDamage,
    primaryDamage,
    difference,
    ...promoted
  };
}

// ── Color utilities ──────────────────────────────────────────

function colorBg(c) {
  switch (c.toLowerCase()) {
    case "white":  return "#ffffff";
    case "green":  return "#00a94e";
    case "yellow": return "#fef102";
    case "red":    return "#ee1e25";
    default:       return "#ddd";
  }
}

function colorFg(c) {
  const lo = c.toLowerCase();
  return (lo === "white" || lo === "yellow") ? "#333" : "white";
}

function buildNeedPill(id, initialLabel = "ANY COLOR") {
  return `<span class="frp-need-line"><span class="frp-need-label">Needs:</span><span id="${id}" class="frp-feat-pill is-white">${initialLabel}</span></span>`;
}

function buildChatNeedPill(requirement, { impossible = false, automatic = false } = {}) {
  let label = String(requirement || 'Any Color').toUpperCase();
  let bg = '#f8f8f8';
  let fg = '#333';
  let border = '#666';

  if (impossible) {
    label = 'IMPOSSIBLE';
    bg = '#ee1e25';
    fg = '#fff';
    border = '#9b1118';
  } else if (automatic) {
    label = 'AUTOMATIC';
    bg = '#00a94e';
    fg = '#fff';
    border = '#007a38';
  } else {
    switch (String(requirement || '').toLowerCase()) {
      case 'green':
        bg = '#00a94e'; fg = '#fff'; border = '#007a38'; break;
      case 'yellow':
        bg = '#fef102'; fg = '#222'; border = '#b79200'; break;
      case 'red':
        bg = '#ee1e25'; fg = '#fff'; border = '#9b1118'; break;
      case 'white':
        bg = '#ffffff'; fg = '#222'; border = '#666'; break;
      default:
        label = 'ANY COLOR';
        bg = '#f8f8f8'; fg = '#333'; border = '#666'; break;
    }
  }

  return `<span style="display:inline-block;vertical-align:middle;margin-left:4px;padding:1px 8px;border-radius:8px;border:1px solid ${border};background:${bg};color:${fg};font-family:'Oswald',sans-serif;font-size:.92em;font-weight:700;letter-spacing:.03em;line-height:1.2;text-transform:uppercase;">${label}</span>`;
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

// ── Main entry point ─────────────────────────────────────────

export async function showAbilityFeatDialog(actor, abilityName, options = {}) {
  const ABILITY_MAP = {
    f: "fighting", a: "agility", s: "strength", e: "endurance",
    r: "reason",   i: "intuition", p: "psyche"
  };

  // Accept either single letter or full name
  const key = abilityName.length === 1 ? ABILITY_MAP[abilityName.toLowerCase()] : abilityName.toLowerCase();
  if (!key) return;

  const ability = actor.system.abilities[key];
  if (!ability) return;

  const fullName = key.charAt(0).toUpperCase() + key.slice(1);
  const abilityRank = ability.rank;
  const abilityValue = ability.value;
  const isStrength = key === "strength";
  const isFighting = key === "fighting";
  const isAgility = key === "agility";

  // Saved settings
  const gf = (flag) => actor.getFlag("msh-faserip", flag);
  const savedColumnShift    = options.transient ? Number(options.columnShift || 0) : (gf(`last${fullName}ColumnShift`) || 0);
  const savedIntensity      = options.intensity ?? (options.transient ? "None" : (gf(`last${fullName}Intensity`) ?? "None"));
  const skipDiceRoll        = options.transient ? false : (gf(`last${fullName}SkipDiceRoll`) || false);
  const savedRemember       = options.transient ? false : (gf(`last${fullName}SaveSettings`) !== false); // transient pre-action rolls never overwrite saved FEAT UI
  const savedFeatType       = options.featType || gf(`last${fullName}FeatType`) || "standard";
  const savedWeightIntensity = gf(`last${fullName}WeightIntensity`) || "Remarkable";
  const savedMaterial       = gf(`last${fullName}Material`) || "Steel";
  const savedThickness      = gf(`last${fullName}Thickness`) || "2-12";
  const savedMultiAttackCount = String(options.multiAttackCount || gf(`last${fullName}MultiAttackCount`) || "2");

  // ── Resistance FEAT substitution (powers audit Step #4, slice 4a) ──
  // Owned "featReplace" resistance powers let the matching FEAT roll the
  // resistance rank instead of the ability. Radios appear only for powers
  // the actor actually owns; Standard is always available.
  const RESIST_FEAT_MAP = {
    endurance: [["toxin", "Toxin"], ["disease", "Disease"]],
    intuition: [["emotion", "Emotion"]],
    psyche:    [["mental", "Mental"], ["magical", "Magical"]]
  };
  const subOptions = [];
  for (const [rtype, label] of (RESIST_FEAT_MAP[key] || [])) {
    const power = actor.items.find(i => i.type === "power"
      && i.system?.resistanceEffect === "featReplace"
      && String(i.system?.resistanceType || "").toLowerCase() === rtype
      && i.system?.rank);
    if (!power) continue;
    const resistRank = power.system.rank;
    const rollRank = (rtype === "magical" && rankValue(abilityRank) >= rankValue(resistRank))
      ? abilityRank : resistRank;
    subOptions.push({ value: rtype, label, rank: rollRank, resistRank, powerName: power.name });
  }
  // Combat Sense: substitutes for Int(surprise)/Fight(block)/Agi(dodge)/
  // Str(escape) (audit Step #7 slice 7b). A sense power, matched by name. RAW
  // "use instead of"; rolls the higher of the ability vs Combat Sense rank.
  const COMBAT_SENSE_CONTEXT = { intuition: "surprise", fighting: "block", agility: "dodge", strength: "escape" };
  if (COMBAT_SENSE_CONTEXT[key]) {
    const cs = actor.items.find(i => i.type === "power"
      && i.name?.toLowerCase() === "combat sense"
      && i.system?.rank);
    if (cs) {
      const csRank = cs.system.rank;
      const rollRank = rankValue(abilityRank) >= rankValue(csRank) ? abilityRank : csRank;
      subOptions.push({ value: "combatSense", label: `Combat Sense (${COMBAT_SENSE_CONTEXT[key]})`, rank: rollRank, resistRank: csRank, powerName: cs.name });
    }
  }
  const hasSubs = subOptions.length > 0;
  const initialFeatType = options.featType || ((isAgility && savedFeatType === "combined")
    ? "combined"
    : (subOptions.some(o => o.value === savedFeatType) ? savedFeatType : (isFighting && savedFeatType === "multiattack" ? "multiattack" : "standard")));
  const resolveRollRank = (ft) => (subOptions.find(o => o.value === ft)?.rank) || abilityRank;

  // Build dropdown HTML
  const materialOptionsHTML = Object.entries(MATERIALS_BY_RANK).map(([rank, mats]) => {
    const options = mats.map(m => `<option value="${m}" ${m === savedMaterial ? 'selected' : ''}>${m}</option>`).join('');
    return `<optgroup label="${rank}">${options}</optgroup>`;
  }).join('');

  const intensityOptionsHTML = ALL_RANKS_WITH_NONE.map(r =>
    `<option value="${r}" ${r === savedIntensity ? 'selected' : ''}>${r}</option>`
  ).join('');

  const weightIntensityOptionsHTML = WEIGHT_INTENSITIES.map(item =>
    `<option value="${item.rank}" ${item.rank === savedWeightIntensity ? 'selected' : ''}>${item.display}</option>`
  ).join('');

  const abilityShort = RANK_ABBR[abilityRank] || abilityRank;
  const initShift = Number(savedColumnShift) || 0;
  const csInputCls = initShift > 0 ? ' pos' : initShift < 0 ? ' neg' : '';
  const initSelfPenalty = Number(actor.system?.combatMods?.selfPenaltyCS) || 0;
  const initEffective = applyCS(resolveRollRank(initialFeatType), initShift + initSelfPenalty);

  // Inline CS row — no reference panel (combat modifiers don't apply to FEATs)
  const csRowHtml = `
    <div class="frp-box frp-cs-box">
      <div class="frp-cs-line">
        <span class="frp-cs-label">CS</span>
        <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${initShift}" id="frp-cs-manual">
        <span class="frp-cs-base">${abilityShort}</span>
        <span class="frp-cs-arrow">&rarr;</span>
        <span class="frp-cs-rank" id="frp-cs-rank">${initEffective}</span>
      </div>
    </div>`;

  // FEAT type radios — Strength gets standard/lifting/breaking; Fighting gets standard/multiattack
  const buildTypeRadios = () => {
    if (isStrength) {
      return `
        <label><input type="radio" name="featType" value="standard" ${initialFeatType === 'standard' ? 'checked' : ''}> Standard</label>
        <label><input type="radio" name="featType" value="lifting" ${initialFeatType === 'lifting' ? 'checked' : ''}> Lifting</label>
        <label><input type="radio" name="featType" value="breaking" ${initialFeatType === 'breaking' ? 'checked' : ''}> Breaking</label>`;
    }
    if (isFighting) {
      return `
        <label><input type="radio" name="featType" value="standard" ${initialFeatType === 'standard' ? 'checked' : ''}> Standard</label>
        <label><input type="radio" name="featType" value="multiattack" ${initialFeatType === 'multiattack' ? 'checked' : ''}> Multi-Attack</label>`;
    }
    if (isAgility) {
      const std = `<label><input type="radio" name="featType" value="standard" ${initialFeatType === 'standard' ? 'checked' : ''}> Standard</label>`;
      const combined = `<label><input type="radio" name="featType" value="combined" ${initialFeatType === 'combined' ? 'checked' : ''}> Combined</label>`;
      const subs = subOptions.map(o =>
        `<label><input type="radio" name="featType" value="${o.value}" ${initialFeatType === o.value ? 'checked' : ''}> ${o.label}</label>`
      ).join('');
      return std + combined + subs;
    }
    if (hasSubs) {
      const std = `<label><input type="radio" name="featType" value="standard" ${initialFeatType === 'standard' ? 'checked' : ''}> Standard</label>`;
      const subs = subOptions.map(o =>
        `<label><input type="radio" name="featType" value="${o.value}" ${initialFeatType === o.value ? 'checked' : ''}> ${o.label}</label>`
      ).join('');
      return std + subs;
    }
    return '';
  };

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <!-- Header banner: actor (ability rank value) -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">${fullName}</span>
          <span class="h-stat-rank">${abilityShort} ${abilityValue}</span>
        </span>
        <span class="h-paren">)</span>
      </div>

      <input type="hidden" name="abilityRank" value="${abilityRank}">

      ${(isStrength || isFighting || isAgility || hasSubs) ? (options.lockFeatType
        ? `<input type="hidden" name="featType" value="${initialFeatType}">`
        : `
      <!-- FEAT Type — compact horizontal radios -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row" style="gap:10px;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">TYPE</span>
          ${buildTypeRadios()}
        </div>
      </div>
      `) : ''}

      ${isStrength ? `
      <!-- Lifting sub-panel -->
      <div id="lifting-section" class="frp-box" style="display:none;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">WEIGHT</span>
          <select id="weight-intensity" name="weightIntensity" style="flex:1;">
            ${weightIntensityOptionsHTML}
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:4px;">
          ${buildNeedPill('lift-need-text')}
        </div>
      </div>

      <!-- Breaking sub-panel -->
      <div id="breaking-section" class="frp-box" style="display:none;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">MATERIAL</span>
          <select id="material-select" name="material" style="flex:1;">
            ${materialOptionsHTML}
          </select>
          <span id="base-material-strength" style="font-size:12px;color:#1a1a1a;font-weight:600;flex-shrink:0;"></span>
          <span id="effective-material-strength" style="font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;color:var(--feat-deep);flex-shrink:0;"></span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">THICK</span>
          <label><input type="radio" name="thickness" value="<2" ${savedThickness === '<2' ? 'checked' : ''}> &lt;2"</label>
          <label><input type="radio" name="thickness" value="2-12" ${savedThickness === '2-12' ? 'checked' : ''}> 2-12"</label>
          <label><input type="radio" name="thickness" value="1-2ft" ${savedThickness === '1-2ft' ? 'checked' : ''}> 1-2'</label>
          <label><input type="radio" name="thickness" value=">2ft" ${savedThickness === '>2ft' ? 'checked' : ''}> &gt;2'</label>
          <span style="margin-left:auto;display:inline-flex;align-items:center;flex-shrink:0;">
            ${buildNeedPill('break-need-text')}
          </span>
        </div>
      </div>
      ` : ''}

      ${isFighting ? `
      <!-- Multiattack sub-panel -->
      <div id="multiattack-section" class="frp-box" style="display:none;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">ATTACKS</span>
          <label style="font-size:13px;"><input type="radio" name="multiAttackCount" value="2" ${savedMultiAttackCount === '2' ? 'checked' : ''}> 2 (Remarkable)</label>
          <label style="font-size:13px;"><input type="radio" name="multiAttackCount" value="3" ${savedMultiAttackCount === '3' ? 'checked' : ''}> 3 (Amazing)</label>
          <span style="margin-left:auto;display:inline-flex;align-items:center;flex-shrink:0;">
            ${buildNeedPill('multi-need-text')}
          </span>
        </div>
        <div style="font-size:11px;color:#1a1a1a;font-style:italic;line-height:1.35;">
          Success: all attacks &minus;1CS &middot; Failure: 1 attack at &minus;3CS
        </div>
      </div>
      ` : ''}

      ${isAgility ? `
      <!-- Combined Attack helper sub-panel -->
      <div id="combined-section" class="frp-box" style="display:none;padding:4px 8px;">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">COMBINED</span>
          <span id="combined-summary" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;">Target one primary attacker</span>
          <span style="display:inline-flex;align-items:center;flex-shrink:0;">${buildNeedPill('combined-need-text', 'GREEN')}</span>
        </div>
      </div>
      ` : ''}

      <!-- Intensity + Required FEAT readout (one line) -->
      <div class="frp-box" id="intensity-row" style="display:${options.requiredColor ? 'flex' : 'flex'};align-items:center;gap:8px;flex-wrap:wrap;">
        ${options.requiredColor ? `
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">REQUIRED</span>
          <span style="margin-left:auto;display:inline-flex;align-items:center;flex-shrink:0;">${buildNeedPill('required-feat-text', String(options.requiredColor).toUpperCase())}</span>
          <input type="hidden" id="intensity" name="intensity" value="None">
        ` : `
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);flex-shrink:0;">INTENSITY</span>
          <select id="intensity" name="intensity" style="flex:1;min-width:100px;">
            ${intensityOptionsHTML}
          </select>
          <span style="margin-left:auto;display:inline-flex;align-items:center;flex-shrink:0;">${buildNeedPill('required-feat-text')}</span>
        `}
      </div>

      <!-- CS row from shared utility -->
      ${csRowHtml}

      <!-- Karma -->
      ${generateKarmaControlsHTML(actor)}

      <!-- Footer: Roll/Cancel + Remember/Skip dice on one row -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          ${options.transient ? '' : `<label><input type="checkbox" name="saveSettings" id="save-settings" ${savedRemember ? 'checked' : ''}> Remember</label>`}
          <label><input type="checkbox" name="skipDice" id="skip-dice" ${skipDiceRoll ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>`;

  // ── Dialog ──────────────────────────────────────────────────

  showFaseripDialog({
    title: options.title || `${fullName} FEAT Roll: ${actor.name}`,
    content: dialogContent,
    render: async (html, dlg) => {
      setupKarmaControlHandlers(html);
      const $dialog = html.closest('.dialog');
      $dialog.find('.dialog-buttons, footer.form-footer').hide();
      if ($dialog.length) {
        $dialog.css('width', '380px');
        $dialog[0].style.height = 'auto';
      }

      const runRoll = async () => {
          const intensity = html.find('[name="intensity"]').val();
          const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
          const spendKarma = html.find('#spend-karma').is(':checked');
          const saveSettings = options.transient ? false : html.find('[name="saveSettings"]').is(':checked');
          const skipDice = html.find('[name="skipDice"]').is(':checked');

          let featType = 'standard';
          let weightIntensity = '';
          let material = '';
          let thickness = '';
          let multiAttackCount = '2';

          if (isStrength) {
            featType = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
            weightIntensity = html.find('[name="weightIntensity"]').val();
            material = html.find('[name="material"]').val();
            thickness = html.find('[name="thickness"]:checked').val();
          }

          if (isFighting) {
            featType = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
            multiAttackCount = html.find('[name="multiAttackCount"]:checked').val() || '2';
          }

          if (isAgility) {
            featType = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
          } else if (hasSubs) {
            featType = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
          }

          // Always persist the checkbox's own state so turning it OFF sticks, except
          // for transient combat-tracker rolls which must not disturb normal FEAT UI memory.
          if (!options.transient) await actor.setFlag("msh-faserip", `last${fullName}SaveSettings`, saveSettings);

          // Save settings
          if (!options.transient && saveSettings) {
            await actor.setFlag("msh-faserip", `last${fullName}ColumnShift`, columnShift);
            await actor.setFlag("msh-faserip", `last${fullName}Intensity`, intensity);
            await actor.setFlag("msh-faserip", `last${fullName}SkipDiceRoll`, skipDice);
            if (isStrength) {
              await actor.setFlag("msh-faserip", `last${fullName}FeatType`, featType);
              await actor.setFlag("msh-faserip", `last${fullName}WeightIntensity`, weightIntensity);
              await actor.setFlag("msh-faserip", `last${fullName}Material`, material);
              await actor.setFlag("msh-faserip", `last${fullName}Thickness`, thickness);
            }
            if (isFighting) {
              await actor.setFlag("msh-faserip", `last${fullName}FeatType`, featType);
              await actor.setFlag("msh-faserip", `last${fullName}MultiAttackCount`, multiAttackCount);
            }
            if (isAgility || hasSubs) {
              await actor.setFlag("msh-faserip", `last${fullName}FeatType`, featType);
            }
          }

          // Resistance substitution: roll the resistance rank when a
          // category is chosen (Step #4 slice 4a).
          const subOpt = (hasSubs && featType !== 'standard')
            ? subOptions.find(o => o.value === featType) : null;
          const baseRankName  = subOpt ? subOpt.rank : abilityRank;
          const baseRankValue = subOpt ? rankValue(subOpt.rank) : abilityValue;
          let resistContext = '';
          if (subOpt) {
            resistContext = `<div>${subOpt.powerName} substitutes for ${fullName}</div>`;
            if ((subOpt.value === 'magical' || subOpt.value === 'combatSense')
                && subOpt.rank === abilityRank
                && rankValue(subOpt.resistRank) < abilityValue) {
              resistContext += `<div>${subOpt.powerName} (${subOpt.resistRank}) &lt; ${fullName} — rolled the higher.</div>`;
            }
          }

          // Combined Attack helper context: the lower-damage character makes
          // the Agility FEAT while targeting the primary (higher-damage) attacker.
          const combinedContext = (isAgility && featType === 'combined')
            ? getCombinedFeatContext(actor)
            : null;
          if (combinedContext && !combinedContext.ok) {
            ui.notifications.warn(combinedContext.message);
            return;
          }

          // Apply column shifts. selfPenaltyCS is a true "all subsequent FEATs"
          // modifier (Dodging, Change Action, Impaired Endurance, etc.), so the
          // general ability FEAT dialog must honor it too.
          const selfPenaltyCS = Number(actor.system?.combatMods?.selfPenaltyCS) || 0;
          const totalColumnShift = columnShift + selfPenaltyCS;
          const effectiveRank = applyCS(baseRankName, totalColumnShift);

          // Fighting multi-attack: override intensity from attack count
          let multiAttackIntensity = '';
          if (isFighting && featType === 'multiattack') {
            multiAttackIntensity = parseInt(multiAttackCount) >= 3 ? "Amazing" : "Remarkable";
          }
          const effectiveIntensity = (isFighting && featType === 'multiattack') ? multiAttackIntensity : intensity;

          // Determine FEAT requirement. Combined is an ordinary Agility FEAT:
          // Green or better succeeds; it does not use an intensity comparison.
          let featRequirement = "Any Color";
          let isImpossible = false;
          let isAutomatic = false;

          if (options.requiredColor) {
            featRequirement = String(options.requiredColor);
          } else if (isAgility && featType === 'combined') {
            featRequirement = "Green";
          } else if (effectiveIntensity !== "None") {
            const req = determineFeatRequirement(effectiveRank, effectiveIntensity);
            featRequirement = req.requirement;
            isImpossible = req.impossible;
            isAutomatic = req.automatic;
          }

          if (isImpossible) {
            ui.notifications.warn(`FEAT is impossible: ${effectiveRank} ability vs ${effectiveIntensity} intensity. Need ability to be within one rank of intensity.`);
            return;
          }

          // Strength context string
          let strengthContext = '';
          if (isStrength && featType !== 'standard') {
            if (featType === 'lifting') {
              const wd = WEIGHT_INTENSITIES.find(w => w.rank === weightIntensity)?.display || weightIntensity;
              strengthContext = `<div>Lifting: ${wd}</div>`;
            } else if (featType === 'breaking') {
              const td = thickness === '<2' ? '< 2"' :
                         thickness === '2-12' ? '2-12"' :
                         thickness === '1-2ft' ? '1-2 feet' : '> 2 feet';
              strengthContext = `<div>Breaking: ${material} (${td})</div>`;
            }
          }

          // Fighting multi-attack context string
          let fightingContext = '';
          if (isFighting && featType === 'multiattack') {
            const atkCount = parseInt(multiAttackCount);
            fightingContext = `<div>Multiple Attacks: ${atkCount} (Intensity: ${multiAttackIntensity})</div>`;
          }

          let combinedFeatContext = '';
          if (combinedContext?.ok) {
            const primaryAbbr = RANK_ABBR[combinedContext.currentRank] || combinedContext.currentRank;
            const nextAbbr = RANK_ABBR[combinedContext.nextRank] || combinedContext.nextRank;
            combinedFeatContext = `<div>Combined: ${actor.name} (${combinedContext.helperDamage}) helps ${combinedContext.primaryActor.name} (${combinedContext.primaryDamage})</div>`
              + `<div>On success: ${primaryAbbr} ${combinedContext.primaryDamage} → ${nextAbbr} ${combinedContext.nextMin} (+${combinedContext.bonus})</div>`;
          }

          // Automatic success
          if (isAutomatic) {
            const autoMultiMsg = (isFighting && featType === 'multiattack')
              ? `<div style="margin-top:4px;">Proceed with ${multiAttackCount} attacks at −1CS to hit.</div>` : '';
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                  <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                    <strong>${actor.name} - ${fullName} FEAT Roll vs ${effectiveIntensity}</strong>
                  </div>
                  <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Base Rank: ${baseRankName} (${baseRankValue})</div>
                    ${resistContext}
                    ${totalColumnShift !== 0 ? `<div>Column Shift: ${totalColumnShift > 0 ? '+' : ''}${totalColumnShift} → ${effectiveRank}${selfPenaltyCS ? ` <span style="color:#777;">(${columnShift || 0} manual, ${selfPenaltyCS} effects)</span>` : ''}</div>` : ''}
                    ${strengthContext}
                    ${fightingContext}
                    <div>Intensity: ${effectiveIntensity}</div>
                    <div>Ability rank is 3+ ranks higher than intensity</div>
                  </div>
                  <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                    background-color: #00a94e; color: white;">
                    AUTOMATIC SUCCESS
                  </div>
                  ${autoMultiMsg}
                </div>`
            });
            try {
              await options.onResult?.({
                actor, abilityName: key, resultColor: "automatic", success: true,
                rollTotal: null, finalTotal: null, karmaUsed: 0,
                effectiveRank, requirement: featRequirement, featType,
                multiAttackCount: isFighting && featType === 'multiattack' ? Number(multiAttackCount) : null
              });
            } catch (callbackError) {
              console.error("[FASERIP] FEAT result callback failed", callbackError);
            }
            return;
          }

          // Roll
          const roll = new Roll("1d100");
          await roll.evaluate();

          // Karma (two-phase)
          let cappedTotal = roll.total;
          let karmaUsed = 0;

          if (spendKarma && getAvailableKarma(actor) > 0) {
            const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
            const karmaResult = await showKarmaDecisionDialog(
              actor, roll.total, effectiveRank, `${fullName} FEAT`, initialColor
            );
            cappedTotal = karmaResult.finalResult;
            karmaUsed = karmaResult.karmaSpent;
          }

          const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

          let featSuccess = true;
          if (options.requiredColor) {
            featSuccess = checkFeatSuccess(resultColor, String(options.requiredColor));
          } else if (isAgility && featType === 'combined') {
            featSuccess = checkFeatSuccess(resultColor, "Green");
          } else if (effectiveIntensity !== "None") {
            featSuccess = checkFeatSuccess(resultColor, featRequirement);
          }

          let combinedAttackResult = '';
          if (combinedContext?.ok) {
            if (featSuccess) {
              const combat = game.combat;
              const assist = {
                type: "blunt",
                helperActorUuid: actor.uuid,
                helperName: actor.name,
                helperDamage: combinedContext.helperDamage,
                primaryDamageAtFeat: combinedContext.primaryDamage,
                promotedDamageAtFeat: combinedContext.nextMin,
                bonusAtFeat: combinedContext.bonus,
                createdAt: Date.now(),
                combatId: combat?.id || null,
                round: combat?.round ?? null
              };
              await executeAsGM("updateActor", {
                targetActorUuid: combinedContext.primaryActorUuid,
                updateData: { "flags.msh-faserip.combinedAssist": assist }
              });
              combinedAttackResult = `
                <div style="padding:5px 10px;font-size:.95em;background:#e8f5e9;border-top:1px solid #c0c0c0;">
                  Combined Assist ready for ${combinedContext.primaryActor.name}: +${combinedContext.bonus} blunt damage (${combinedContext.nextMin} total).
                </div>`;
            } else {
              combinedAttackResult = `
                <div style="padding:5px 10px;font-size:.95em;background:#ffebee;border-top:1px solid #c0c0c0;">
                  Combined Assist failed. No bonus was granted.
                </div>`;
            }
          }

          // Multi-attack consequence text
          let multiAttackResult = '';
          if (isFighting && featType === 'multiattack') {
            const atkCount = parseInt(multiAttackCount);
            if (featSuccess) {
              multiAttackResult = `
                <div style="padding: 5px 10px; font-size: 0.9em; background-color: #e8f5e9; border-top: 1px solid #c0c0c0;">
                  Proceed with ${atkCount} attacks at −1CS to hit.
                </div>`;
            } else {
              multiAttackResult = `
                <div style="padding: 5px 10px; font-size: 0.9em; background-color: #ffebee; border-top: 1px solid #c0c0c0;">
                  1 attack only, at −3CS to hit.
                </div>`;
            }
          }

          // Chat card
          const featMsg = {
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                  <strong>${actor.name} - ${fullName} FEAT Roll${combinedContext?.ok ? ' — Combined' : (effectiveIntensity !== "None" ? ` vs ${effectiveIntensity}` : "")}</strong>
                </div>
                <div style="padding: 5px 10px; font-size: 0.9em;">
                  <div>Base Rank: ${baseRankName} (${baseRankValue})</div>
                  ${resistContext}
                  ${totalColumnShift !== 0 ? `<div>Column Shift: ${totalColumnShift > 0 ? '+' : ''}${totalColumnShift} → ${effectiveRank}${selfPenaltyCS ? ` <span style="color:#777;">(${columnShift || 0} manual, ${selfPenaltyCS} effects)</span>` : ''}</div>` : ''}
                  ${strengthContext}
                  ${fightingContext}
                  ${combinedFeatContext}
                  ${options.requiredColor ? `<div>Required: ${buildChatNeedPill(options.requiredColor)}</div>` : (combinedContext?.ok ? `<div>Required: ${buildChatNeedPill('Green')}</div>` : (effectiveIntensity !== "None" ? `<div>Intensity: ${effectiveIntensity} (Req: ${buildChatNeedPill(featRequirement)})</div>` : ''))}
                  <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
                </div>
                <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                  background-color: ${colorBg(resultColor)}; 
                  color: ${colorFg(resultColor)};">
                  ${resultColor.toUpperCase()} RESULT
                </div>
                ${(options.requiredColor || combinedContext?.ok || effectiveIntensity !== "None") ? `
                  <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#00a94e' : '#ee1e25'};">
                    ${featSuccess ? 'FEAT SUCCEEDED' : 'FEAT FAILED'}
                  </div>
                ` : ''}
                ${combinedAttackResult}
                ${multiAttackResult}
              </div>`
          };
          if (!skipDice) {
            featMsg.rolls = [roll];
            try { ChatMessage.applyMode(featMsg, game.settings.get("core", "messageMode")); }
            catch { try { ChatMessage.applyRollMode(featMsg, game.settings.get("core", "rollMode")); } catch {} }
          }
          await ChatMessage.create(featMsg);
          try {
            await options.onResult?.({
              actor, abilityName: key, resultColor, success: featSuccess,
              rollTotal: roll.total, finalTotal: cappedTotal, karmaUsed,
              effectiveRank, requirement: featRequirement, featType,
              multiAttackCount: isFighting && featType === 'multiattack' ? Number(multiAttackCount) : null
            });
          } catch (callbackError) {
            console.error("[FASERIP] FEAT result callback failed", callbackError);
          }
        };  // end runRoll

      // Shared updateFeatRequirement for all abilities — writes to the
      // intensity-row readout AND the three sub-panel NEED readouts in
      // one shot. Only the visible target is seen; non-existent IDs are
      // jQuery no-ops.
      const NEED_TARGETS = '#required-feat-text, #multi-need-text, #lift-need-text, #break-need-text';
      const updateFeatRequirement = () => {
        if (options.requiredColor) {
          html.find('#required-feat-text').each((_, el) => setNeedPill($(el), String(options.requiredColor)));
          return;
        }
        const intensity = html.find('#intensity').val();
        const reqText = html.find(NEED_TARGETS);
        const cs = parseInt(html.find('[name="shift"]').val()) || 0;
        const ft = html.find('[name="featType"]:checked').val() || options.featType || 'standard';

        if (ft === 'combined') {
          reqText.each((_, el) => setNeedPill($(el), 'Green'));
          setNeedPill(html.find('#combined-need-text'), 'Green');
          return;
        }

        if (intensity === "None") {
          reqText.each((_, el) => setNeedPill($(el), 'Any Color'));
          return;
        }

        const effectiveRank = applyCS(resolveRollRank(ft), cs);
        const { requirement, impossible, automatic } = determineFeatRequirement(effectiveRank, intensity);
        reqText.each((_, el) => setNeedPill($(el), requirement, { impossible, automatic }));
      };

      if (isAgility) {
        const updateCombinedSummary = () => {
          const ctx = getCombinedFeatContext(actor);
          const $summary = html.find('#combined-summary');
          if (!$summary.length) return;
          if (!ctx.ok) {
            $summary.text(ctx.message).css('color', '#a80000').attr('title', ctx.message);
            return;
          }
          const nextAbbr = RANK_ABBR[ctx.nextRank] || ctx.nextRank;
          const text = `${ctx.primaryActor.name}: ${ctx.helperDamage} + ${ctx.primaryDamage} → ${nextAbbr} ${ctx.nextMin} (+${ctx.bonus})`;
          $summary.text(text).css('color', '#1a1a1a').attr('title', text);
        };

        const updateAgilityFeatType = () => {
          const ft = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
          const combinedSec = html.find('#combined-section');
          const intensityRow = html.find('#intensity-row');
          if (ft === 'combined') {
            combinedSec.show();
            intensityRow.hide();
            updateCombinedSummary();
          } else {
            combinedSec.hide();
            intensityRow.show();
          }
          updateFeatRequirement();
          if ($dialog.length) $dialog[0].style.height = 'auto';
        };

        html.find('[name="featType"]').on('change', updateAgilityFeatType);
        html.find('#intensity, [name="shift"]').on('change keyup', updateFeatRequirement);
        updateAgilityFeatType();
      } else if (!isStrength && !isFighting) {
        html.find('#intensity, [name="shift"]').on('change keyup', updateFeatRequirement);
        updateFeatRequirement();
      } else if (isFighting) {
        const updateMultiAttackIntensity = () => {
          const count = html.find('[name="multiAttackCount"]:checked').val() || '2';
          const intensity = parseInt(count) >= 3 ? "Amazing" : "Remarkable";
          html.find('#intensity').val(intensity);
          updateFeatRequirement();
        };

        const updateFightingFeatType = () => {
          const ft = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
          const multiSec = html.find('#multiattack-section');
          const intensitySelect = html.find('#intensity');
          const intensityRow = html.find('#intensity-row');

          if (ft === 'multiattack') {
            multiSec.show(); intensityRow.hide();
            updateMultiAttackIntensity();
          } else {
            multiSec.hide(); intensityRow.show();
            intensitySelect.prop('disabled', false);
            intensitySelect.val(savedIntensity);
            updateFeatRequirement();
          }

          if ($dialog.length > 0) {
            $dialog[0].style.height = 'auto';
          }
        };

        html.find('[name="featType"]').on('change', updateFightingFeatType);
        html.find('[name="multiAttackCount"]').on('change', updateMultiAttackIntensity);
        html.find('#intensity, [name="shift"]').on('change keyup', updateFeatRequirement);
        updateFightingFeatType();
      } else {
        const updateWeightIntensity = () => {
          html.find('#intensity').val(html.find('#weight-intensity').val());
          updateFeatRequirement();
        };

        const updateMaterialStrength = () => {
          const mat = html.find('#material-select').val();
          const thick = html.find('[name="thickness"]:checked').val();
          const baseStrength = MATERIALS[mat];
          html.find('#base-material-strength').text(`(${baseStrength})`);

          let shift = 0;
          if (thick === '<2') shift = -1;
          else if (thick === '1-2ft') shift = 1;
          else if (thick === '>2ft') shift = 2;

          const effective = applyCS(baseStrength, shift);
          html.find('#effective-material-strength').text(`→ ${effective}`);
          html.find('#intensity').val(effective);
          updateFeatRequirement();
        };

        const updateFeatTypeDisplay = () => {
          const ft = html.find('[name="featType"]:checked').val() || options.featType || 'standard';
          const liftSec = html.find('#lifting-section');
          const breakSec = html.find('#breaking-section');
          const intensitySelect = html.find('#intensity');
          const intensityRow = html.find('#intensity-row');

          if (ft === 'lifting') {
            liftSec.show(); breakSec.hide(); intensityRow.hide();
            updateWeightIntensity();
          } else if (ft === 'breaking') {
            liftSec.hide(); breakSec.show(); intensityRow.hide();
            updateMaterialStrength();
          } else {
            liftSec.hide(); breakSec.hide(); intensityRow.show();
            intensitySelect.prop('disabled', false);
            intensitySelect.val(savedIntensity);
            updateFeatRequirement();
          }
          updateFeatRequirement();

          if ($dialog.length > 0) {
            $dialog[0].style.height = 'auto';
          }
        };

        html.find('[name="featType"]').on('change', updateFeatTypeDisplay);
        html.find('#weight-intensity').on('change', updateWeightIntensity);
        html.find('#material-select').on('change', updateMaterialStrength);
        html.find('[name="thickness"]').on('change', updateMaterialStrength);
        html.find('#intensity, [name="shift"]').on('change keyup', updateFeatRequirement);
        updateFeatTypeDisplay();
      }

      // ──── CS input live recalc — no reference panel ────
      const $csInput = html.find('#frp-cs-manual');
      const $csRank = html.find('#frp-cs-rank');
      const recalcCS = () => {
        const cs = Number($csInput.val()) || 0;
        $csInput.removeClass('pos neg');
        if (cs > 0) $csInput.addClass('pos');
        else if (cs < 0) $csInput.addClass('neg');
        $csRank.text(applyCS(resolveRollRank(html.find('[name="featType"]:checked').val() || options.featType || 'standard'), cs + (Number(actor.system?.combatMods?.selfPenaltyCS) || 0)));
        updateFeatRequirement();
        if ($dialog.length) $dialog[0].style.height = 'auto';
      };
      $csInput.on('change keyup', recalcCS);
      if (hasSubs || isAgility) html.find('[name="featType"]').on('change', recalcCS);

      // ──── Roll / Cancel button wiring + Enter-to-roll ────
      html.find('#frp-roll').off('click.frp').on('click.frp', async () => {
        try { await runRoll(); }
        finally { if (!isDialogDetached(dlg)) dlg.close(); }
      });
      html.find('#frp-cancel').off('click.frp').on('click.frp', () => { options.onCancel?.(); dlg.close(); });
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