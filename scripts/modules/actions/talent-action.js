// talent-action.js v1.2.0 - 2026-05-16
// v1.2.0: Picker-skip — rollTalent now routes unambiguous combat talents
//         (Fighting Skill with recognized specialty: Wrestling, MA-A/B/C/D/E,
//         Acrobatics, Thrown Objects) directly to the attack-action dialog,
//         bypassing the redundant talent picker. Picker still shown for
//         Weapon Skill (multiple weapon types ambiguous), non-combat
//         talents (Professional/Scientific/Mystic), or when saved overrides
//         exist (extraShift, intensity, ability override, custom action
//         type). Pass options.forcePicker=true to override.
// v1.1.0: getTalentBonus now suppresses to-hit CS bonus for MA-A,
//         MA-D, MA-E (RAW: those talents grant no Fighting bonus
//         to hit; benefits are Stun/Slam-side or initiative-side,
//         not roll-side). Prevents misconfigured talent items from
//         leaking a phantom +1 CS into attack rolls launched from
//         the talents tab.
// Migrated from rolls.js FaseripRolls.rollTalent.
// Combat actions route through ActionDispatcher; Ability FEATs handled inline.

import { ActionDispatcher } from "./action-dispatcher.js";
import {
  getAbilityInfo,
  bannerColors,
  buildResultGrid,
  rollWithKarmaAndHistory,
  shiftRank,
  RANKS
} from "./action-utils.js";
import { ACTION_EFFECTS } from "./action-config.js";
import {
  generateKarmaControlsHTML,
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma
} from "../dice/dice-roller.js";
import { determineFeatRequirement, checkFeatSuccess } from "./ability-feat-dialog.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

// ── Constants ──────────────────────────────────────────────

const COMBAT_ACTION_MAP = {
  "Blunt Attack (BA)":      "blunt-attack",
  "Edged Attack (EA)":      "edged-attack",
  "Shooting Attack (Sh)":   "shooting",
  "Throwing Edged (TE)":    "throwing-edged",
  "Throwing Blunt (TB)":    "throwing-blunt",
  "Energy (En)":            "energy",
  "Force (Fo)":             "force",
  "Grappling (GP)":         "grappling",
  "Grabbing (Gb)":          "grabbing",
  "Escaping (ES)":          "escaping",
  "Charging (Ch)":          "charging",
  "Dodging (Do)":           "dodging",
  "Evading (Ev)":           "evading",
  "Blocking (Bl)":          "blocking",
  "Catching (Ca)":          "catching"
};

const COMBAT_ACTION_ABILITIES = {
  "Blunt Attack (BA)":    "fighting",
  "Edged Attack (EA)":    "fighting",
  "Shooting Attack (Sh)": "agility",
  "Throwing Edged (TE)":  "agility",
  "Throwing Blunt (TB)":  "agility",
  "Energy (En)":          "agility",
  "Force (Fo)":           "agility",
  "Grappling (GP)":       "strength",
  "Grabbing (Gb)":        "strength",
  "Escaping (ES)":        "strength",
  "Charging (Ch)":        "endurance",
  "Dodging (Do)":         "agility",
  "Evading (Ev)":         "fighting",
  "Blocking (Bl)":        "strength",
  "Catching (Ca)":        "agility"
};

// Multi-target: Blunt, Escaping, Energy, Force
const MULTI_ADJACENT_CODES = ["BA", "Es", "En", "Fo"];
// Multi-attack: Slugfest + Shooting
const MULTI_ATTACK_CODES  = ["BA", "EA", "Sh"];

const ABILITY_FEAT_LABELS = {
  white: "Failure", green: "Success", yellow: "Success", red: "Success"
};

const ALL_ACTION_OPTIONS = [
  { value: "Ability FEAT",          label: "Ability FEAT (non-combat)" },
  { value: "Blunt Attack (BA)",     label: "Blunt Attack (BA)" },
  { value: "Edged Attack (EA)",     label: "Edged Attack (EA)" },
  { value: "Shooting Attack (Sh)",  label: "Shooting Attack (Sh)" },
  { value: "Throwing Edged (TE)",   label: "Throwing Edged (TE)" },
  { value: "Throwing Blunt (TB)",   label: "Throwing Blunt (TB)" },
  { value: "Energy (En)",           label: "Energy (En)" },
  { value: "Force (Fo)",            label: "Force (Fo)" },
  { value: "Grappling (GP)",       label: "Grappling (GP)" },
  { value: "Grabbing (Gb)",        label: "Grabbing (Gb)" },
  { value: "Escaping (ES)",        label: "Escaping (ES)" },
  { value: "Charging (Ch)",        label: "Charging (Ch)" },
  { value: "Dodging (Do)",         label: "Dodging (Do)" },
  { value: "Evading (Ev)",         label: "Evading (Ev)" },
  { value: "Blocking (Bl)",        label: "Blocking (Bl)" },
  { value: "Catching (Ca)",        label: "Catching (Ca)" }
];

const ABILITIES = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];

// ── Helpers ────────────────────────────────────────────────

function extractActionCode(actionType) {
  const m = actionType.match(/\(([^)]+)\)/);
  return m ? m[1] : "";
}

function getTalentBonus(talent) {
  // RAW: MA-A, MA-D, MA-E grant no Fighting CS bonus to hit. Their
  // benefits (Stun/Slam vs Str/End, ignore-armor-for-effects, +1
  // initiative) are non-roll mechanics handled elsewhere in the
  // pipeline. Override here even if the talent item is misconfigured
  // with "+1CS" or "Special" in its bonus field.
  const name = (talent.name || "").toLowerCase();
  if (/\bmartial arts[ \-:]?\(?\s*[ade]\)?(\b|$)/i.test(name) ||
      /\bma[ \-]?[ade]\b/i.test(name)) {
    return 0;
  }
  switch (talent.system.bonus) {
    case "+1CS": return 1;
    case "+2CS": return 2;
    case "+3CS": return 3;
    case "Special": return 1;
    default: return 0;
  }
}

function suggestDefault(talent) {
  const type = talent.system.type || "";
  const spec = talent.system.specialty || "";
  if (type === "Weapon Skill") {
    if (spec === "Blunt Weapons")                               return "Blunt Attack (BA)";
    if (spec === "Sharp Weapons" || spec === "Edged Weapons")   return "Edged Attack (EA)";
    if (spec === "Thrown Weapons")                               return "Throwing Blunt (TB)";
    if (["Bows", "Guns", "Marksman"].includes(spec))            return "Shooting Attack (Sh)";
    return "Blunt Attack (BA)";
  }
  if (type === "Fighting Skill") {
    if (spec === "Wrestling" || spec === "Martial Arts C")      return "Grappling (GP)";
    if (spec === "Acrobatics")                                  return "Dodging (Do)";
    if (spec === "Thrown Objects")                               return "Throwing Blunt (TB)";
    return "Blunt Attack (BA)";
  }
  return "Ability FEAT";
}

// Returns the picker action key (e.g. "Blunt Attack (BA)") if the talent
// maps unambiguously to a single combat action — null otherwise. Used by
// rollTalent to bypass the picker dialog and route straight to the
// attack-action dialog. Weapon Skill is treated as ambiguous because a
// player may have multiple weapon types in inventory; Fighting Skill
// specializations all have unambiguous routings.
function getUnambiguousActionCode(talent) {
  const type = (talent.system?.type || "").trim();
  const spec = (talent.system?.specialty || "").trim();
  const name = (talent.name || "").toLowerCase();

  if (type === "Fighting Skill") {
    if (spec === "Wrestling" ||
        /\bmartial arts[ \-:]?\(?\s*c\)?(\b|$)/i.test(name) ||
        /\bma[ \-]?c\b/i.test(name)) {
      return "Grappling (GP)";
    }
    if (spec === "Acrobatics") return "Dodging (Do)";
    if (spec === "Thrown Objects") return "Throwing Blunt (TB)";
    return "Blunt Attack (BA)";
  }
  return null;
}

function isNonCombatTalent(talent) {
  return ["Professional Skill", "Scientific Skill", "Mystic/Mental Skill"].includes(talent.system.type || "");
}

function buildMultiTargetHTML(actionCode) {
  const validMulti = MULTI_ADJACENT_CODES.includes(actionCode);
  const validAttack = MULTI_ATTACK_CODES.includes(actionCode);
  if (!validMulti && !validAttack) return "";

  const targetCount = game.user.targets.size;
  let html = `<div style="border:1px solid #d8cfb8;border-radius:2px;padding:5px 7px;background:#faf8f2;margin-bottom:6px;">
    <div style="font-family:'Oswald',sans-serif;font-size:10px;color:#6a0000;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Multiple Targets</div>`;

  if (validMulti) {
    html += `<label style="display:flex;align-items:center;gap:5px;font-size:12px;margin-bottom:2px;cursor:pointer;">
      <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin:0;flex:0 0 auto;">
      <span><strong>Adjacent group</strong> <span style="color:#777;">(–4 CS, single roll vs all)</span></span>
    </label>
    <div style="font-size:10px;color:#888;margin-left:20px;margin-bottom:4px;">Targets selected: <strong>${targetCount}</strong> · BA / Es / En / Fo</div>`;
  }
  if (validAttack) {
    html += `<label style="display:flex;align-items:center;gap:5px;font-size:12px;margin-bottom:2px;cursor:pointer;">
      <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin:0;flex:0 0 auto;">
      <span><strong>Multiple attacks</strong> <span style="color:#777;">(Fighting FEAT required)</span></span>
    </label>
    <div id="multi-attacks-options" style="margin-left:20px;display:none;font-size:11px;">
      <label style="display:block;margin:2px 0;cursor:pointer;"><input type="radio" name="attackCount" value="2" checked style="margin:0 4px 0 0;">2 attacks <span style="color:#777;">(Remarkable FEAT, –1 CS each)</span></label>
      <label style="display:block;margin:2px 0;cursor:pointer;"><input type="radio" name="attackCount" value="3" style="margin:0 4px 0 0;">3 attacks <span style="color:#777;">(Amazing FEAT, –1 CS each)</span></label>
    </div>
    <div style="font-size:10px;color:#888;margin-left:20px;">BA / EA / Sh only</div>`;
  }
  html += `</div>`;
  return html;
}

// ── Main entry point ───────────────────────────────────────

export async function rollTalent(actor, talent, options = {}) {
  if (!actor || !talent) {
    ui.notifications.error("Actor or talent not found");
    return;
  }

  const talentBonus = getTalentBonus(talent);

  // Saved settings
  const savedActionType    = talent.getFlag("msh-faserip", "lastActionType") || "";
  const savedExtraShift    = talent.getFlag("msh-faserip", "lastExtraShift") || 0;
  const savedIntensity     = talent.getFlag("msh-faserip", "lastIntensity") || "";
  const savedAbility       = talent.getFlag("msh-faserip", "lastAbility") || "";
  const skipDiceRoll       = talent.getFlag("msh-faserip", "skipDiceRoll") || false;
  const savedRemember      = talent.getFlag("msh-faserip", "rememberSettings") ?? true;

  // ── CTRL quick-roll: Ability FEAT only (combat quick-rolls not supported) ──
  if (options.useDirectRoll ||
      game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
    if (game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
    }
    return _rollAbilityFeat(actor, talent, {
      extraShift: options.extraShift ?? savedExtraShift,
      intensity:  options.intensity || savedIntensity || "",
      spendKarma: options.spendKarma || false,
      skipDice:   options.skipDice ?? skipDiceRoll,
      selectedAbility: options.selectedAbility || savedAbility || talent.system.abilityModified
    });
  }

  // ── Picker-skip: route unambiguous combat talents straight to the
  // attack-action dialog. The picker exists for ambiguous cases (Weapon
  // Skill with multiple weapon types) and override needs (intensity,
  // ability override, rank override, extra shift). Fighting Skill talents
  // (Wrestling, MA-A/B/C/D/E, Acrobatics, Thrown Objects) all have
  // unambiguous routings; without saved overrides the picker is just a
  // redundant confirmation. Pass options.forcePicker = true to bypass
  // this and show the picker regardless.
  const unambiguousActionKey = getUnambiguousActionCode(talent);
  const _abilityModified = talent.system.abilityModified || "none";
  const hasOverrides =
    Number(savedExtraShift) !== 0 ||
    (savedIntensity && savedIntensity !== "") ||
    (savedAbility && savedAbility !== "" && savedAbility !== _abilityModified) ||
    (savedActionType && savedActionType !== unambiguousActionKey);

  if (unambiguousActionKey && !hasOverrides && !options.forcePicker) {
    const dispatcherCode = COMBAT_ACTION_MAP[unambiguousActionKey];
    const ability = COMBAT_ACTION_ABILITIES[unambiguousActionKey]
                 || (_abilityModified !== "none" ? _abilityModified : "fighting");
    return ActionDispatcher.roll(dispatcherCode, {
      actor,
      abilityName: ability,
      opts: {
        shift: talentBonus,
        fromTalent: true,
        talentName: talent.name,
        item: talent
      }
    });
  }

  // ── Build dialog ────────────────────────────────────────
  const defaultActionType = savedActionType || suggestDefault(talent);
  const isAbilityFeat = defaultActionType === "Ability FEAT";
  const abilityModified = talent.system.abilityModified || "none";
  const abilityLabel = abilityModified !== "none"
    ? abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) : "None";
  const initialAbility = savedAbility || abilityModified;
  const baseRank = initialAbility && initialAbility !== "none"
    ? (actor.system.abilities[initialAbility]?.rank || "Typical") : "Typical";

  // Action options
  const actionOptionsHTML = ALL_ACTION_OPTIONS.map(o =>
    `<option value="${o.value}" ${o.value === defaultActionType ? "selected" : ""}>${o.label}</option>`
  ).join("");

  // Ability dropdown
  const defaultAbility = savedAbility || abilityModified || "fighting";
  const abilityOptionsHTML = ABILITIES.map(ab => {
    const info = getAbilityInfo(actor, ab);
    const label = ab.charAt(0).toUpperCase() + ab.slice(1);
    return `<option value="${ab}" data-rank="${info.rank}" data-value="${info.value}" ${ab === defaultAbility ? "selected" : ""}>${label} (${info.rank})</option>`;
  }).join("");

  // Initial effective rank computed once; render hook recomputes live.
  const rankOverride = talent.system.rankOverride;
  let effRankInitial, effShiftInitial;
  if (rankOverride) {
    const baseIdx = RANKS.indexOf(baseRank);
    const overIdx = RANKS.indexOf(rankOverride);
    effShiftInitial = (baseIdx >= 0 && overIdx >= 0) ? (overIdx - baseIdx) : 0;
    effRankInitial = rankOverride;
  } else {
    const effIdx = Math.min(Math.max(RANKS.indexOf(baseRank) + talentBonus + savedExtraShift, 0), RANKS.length - 1);
    effRankInitial = RANKS[effIdx];
    effShiftInitial = talentBonus + savedExtraShift;
  }

  // Intensity dropdown
  const intensityRanks = ["", ...RANKS.slice(0, 15)]; // up to Shift-Z
  const intensityOptionsHTML = intensityRanks.map(r =>
    `<option value="${r}" ${r === savedIntensity ? "selected" : ""}>${r || "(None - Green or better succeeds)"}</option>`
  ).join("");

  // Multi-target
  const defaultCode = extractActionCode(defaultActionType);
  const multiHTML = isAbilityFeat ? "" : buildMultiTargetHTML(defaultCode);

  const dialogContent = `
  <div class="frp-dlg" style="font-family:'Barlow Condensed',Arial,sans-serif;">
    <div class="frp-header-v3">
      <span class="h-actor">${actor.name}</span>
      <span class="h-arrow">→</span>
      <span class="h-target">${talent.name}</span>
      ${rankOverride ? `<span style="margin-left:auto;padding:1px 6px;background:rgba(255,255,255,0.18);border-radius:2px;font-size:10px;letter-spacing:0.4px;text-transform:uppercase;">★ Override ${rankOverride}</span>` : `<span style="margin-left:auto;padding:1px 6px;background:rgba(255,255,255,0.18);border-radius:2px;font-size:10px;letter-spacing:0.4px;text-transform:uppercase;">+${talentBonus} CS</span>`}
    </div>

    <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 8px;align-items:center;font-size:13px;padding:4px 6px;background:#f5f3ee;border:1px solid #d8cfb8;border-radius:2px;margin-bottom:6px;">
      <label style="color:#444;">Action:</label>
      <select id="action-type" name="actionType" style="width:100%;padding:2px 5px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;font-family:inherit;font-size:13px;height:auto;">${actionOptionsHTML}</select>
    </div>

    <div id="ability-container" style="display:grid;grid-template-columns:80px 1fr;gap:4px 8px;align-items:center;font-size:13px;padding:4px 6px;background:#faf8f2;border:1px solid #d8cfb8;border-radius:2px;margin-bottom:6px;">
      <label style="color:#444;">Ability:</label>
      <select id="ability-select" name="abilitySelect" style="width:100%;padding:2px 5px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;font-family:inherit;font-size:13px;height:auto;">${abilityOptionsHTML}</select>
      <div></div>
      <div id="ability-hint" style="font-size:10px;color:#777;font-style:italic;">${abilityModified !== "none" ? `Talent default: ${abilityLabel}` : "No default ability set"}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
      <div style="border:1px solid #d8cfb8;border-radius:2px;padding:4px 6px;background:#faf8f2;">
        <div style="font-family:'Oswald',sans-serif;font-size:10px;color:#6a0000;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Base Rank</div>
        <div style="font-family:'Oswald',sans-serif;font-weight:700;font-size:14px;" id="base-rank-display">${baseRank}</div>
      </div>
      <div id="effective-card" style="border:1px solid ${rankOverride ? '#4caf50' : '#d8cfb8'};border-radius:2px;padding:4px 6px;background:${rankOverride ? '#e8f5e9' : '#faf8f2'};">
        <div style="font-family:'Oswald',sans-serif;font-size:10px;color:${rankOverride ? '#2e7d32' : '#6a0000'};letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">${rankOverride ? '★ Effective (Override)' : 'Effective Rank'}</div>
        <div style="display:flex;align-items:baseline;gap:4px;">
          <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:14px;" id="effective-rank-display">${effRankInitial}</span>
          <span id="effective-shift-display" style="font-size:11px;color:#777;">(${effShiftInitial >= 0 ? '+' : ''}${effShiftInitial} CS)</span>
        </div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border:1px solid #d8cfb8;border-radius:2px;margin-bottom:6px;">
      <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#6a0000;letter-spacing:0.5px;text-transform:uppercase;">Extra CS</span>
      <input type="number" id="shift" name="shift" value="${savedExtraShift}" style="width:42px;padding:2px;text-align:center;border:1px solid #b8b8b8;border-radius:2px;font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;height:auto;">
      <span style="margin-left:auto;font-size:11px;color:#777;">additional +/– column shift</span>
    </div>

    <div id="intensity-container" ${isAbilityFeat ? "" : 'style="display:none;"'}>
      <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 8px;align-items:center;font-size:13px;padding:4px 6px;background:#faf8f2;border:1px solid #d8cfb8;border-radius:2px;margin-bottom:6px;">
        <label style="color:#444;">Intensity:</label>
        <select id="intensity" name="intensity" style="width:100%;padding:2px 5px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;font-family:inherit;font-size:13px;height:auto;">${intensityOptionsHTML}</select>
      </div>
      <div id="intensity-info" style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:#f5f5f5;border:1px solid #ddd;border-radius:2px;margin-bottom:6px;font-size:11px;color:#666;font-style:italic;">
        Select intensity to determine required FEAT color
      </div>
    </div>

    <div id="multi-target-container">${multiHTML}</div>

    ${generateKarmaControlsHTML(actor, 0)}

    <div style="display:flex;align-items:center;gap:12px;padding-top:4px;border-top:1px solid #d8cfb8;font-size:11px;color:#666;">
      <label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" id="save-settings" name="saveSettings" ${savedRemember ? "checked" : ""} style="margin:0;"> Remember settings</label>
      <label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? "checked" : ""} style="margin:0;"> Skip dice animation</label>
    </div>
  </div>`;

  return new Promise(resolve => {
    showFaseripButtonDialog({
      title: `Talent Roll: ${talent.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const actionType      = html.find('[name="actionType"]').val();
            const selectedAbility = html.find('[name="abilitySelect"]').val();
            const extraShift      = parseInt(html.find('[name="shift"]').val()) || 0;
            const intensity       = html.find('[name="intensity"]').val();
            const { spendKarma }  = extractKarmaFromDialog(html);
            const skipDice        = html.find('[name="skipDice"]').is(":checked");
            const saveSettings    = html.find('[name="saveSettings"]').is(":checked");

            // Persist
            await talent.setFlag("msh-faserip", "skipDiceRoll", skipDice);
            await talent.setFlag("msh-faserip", "rememberSettings", saveSettings);
            if (saveSettings) {
              await talent.setFlag("msh-faserip", "lastActionType", actionType);
              await talent.setFlag("msh-faserip", "lastExtraShift", extraShift);
              await talent.setFlag("msh-faserip", "lastIntensity", intensity);
              await talent.setFlag("msh-faserip", "lastAbility", selectedAbility);
            }

            const dispatcherCode = COMBAT_ACTION_MAP[actionType];
            if (dispatcherCode) {
              // ── Combat action → ActionDispatcher ──
              const combatAbility = selectedAbility || abilityModified || "fighting";
              const combatBaseRank = actor.system.abilities[combatAbility]?.rank || "Typical";
              let totalShift = talentBonus + extraShift;

              if (rankOverride) {
                const bIdx = RANKS.indexOf(combatBaseRank);
                const oIdx = RANKS.indexOf(rankOverride);
                if (bIdx >= 0 && oIdx >= 0) totalShift = (oIdx - bIdx) + extraShift;
              }

              // Multi-target options
              const multiAdjacent = html.find('[name="multiAdjacent"]').is(":checked");
              const multiAttacks  = html.find('[name="multiAttacks"]').is(":checked");
              const attackCount   = multiAttacks ? parseInt(html.find('[name="attackCount"]:checked').val()) || 2 : 1;

              const result = await ActionDispatcher.roll(dispatcherCode, {
                actor,
                abilityName: combatAbility,
                opts: {
                  shift: totalShift,
                  spendKarma,
                  skipDice,
                  fromTalent: true,
                  talentName: talent.name,
                  item: talent,
                  multiAdjacent,
                  multiAttacks,
                  attackCount
                }
              });
              resolve(result);
            } else {
              // ── Ability FEAT (non-combat) ──
              const result = await _rollAbilityFeat(actor, talent, {
                extraShift,
                intensity,
                spendKarma,
                skipDice,
                selectedAbility: selectedAbility || abilityModified
              });
              resolve(result);
            }
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "roll",
      render: (html) => {
        setupKarmaControlHandlers(html);
        _wireDialogHandlers(html, actor, talent, talentBonus, abilityModified, abilityLabel);
      }
    });
  });
}

// ── Ability FEAT resolver ──────────────────────────────────

async function _rollAbilityFeat(actor, talent, opts = {}) {
  const {
    extraShift = 0,
    intensity = "",
    spendKarma = false,
    skipDice = false,
    selectedAbility = "fighting"
  } = opts;

  const talentBonus = getTalentBonus(talent);
  const totalCS = talentBonus + extraShift;
  const abilityKey = selectedAbility && selectedAbility !== "none" ? selectedAbility : "fighting";
  const ability = getAbilityInfo(actor, abilityKey);
  const abilityName = abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1);

  // Rank override
  let effectiveRank = ability.rank;
  const rankOverride = talent.system.rankOverride;
  if (rankOverride) {
    effectiveRank = rankOverride;
  } else if (totalCS !== 0) {
    effectiveRank = shiftRank(ability.rank, totalCS);
  }

  // Intensity comparison
  let isAutomatic = false;
  let isImpossible = false;
  let requiredColor = "green";
  let intensityInfo = "";

  if (intensity) {
    const feat = determineFeatRequirement(effectiveRank, intensity);
    isAutomatic = feat.automatic;
    isImpossible = feat.impossible;
    if (isAutomatic) {
      requiredColor = "auto";
      intensityInfo = `Automatic (Ability ${RANKS.indexOf(effectiveRank) - RANKS.indexOf(intensity)} ranks above Intensity)`;
    } else if (isImpossible) {
      requiredColor = "impossible";
      const diff = RANKS.indexOf(intensity) - RANKS.indexOf(effectiveRank);
      intensityInfo = `Impossible (Intensity ${diff} ranks above Ability)`;
    } else {
      requiredColor = feat.requirement.toLowerCase();
      intensityInfo = `${feat.requirement}+ required`;
    }
  }

  // Roll
  const rollResult = await rollWithKarmaAndHistory(
    actor,
    `${talent.name} (Ability FEAT)`,
    0,
    null,
    { spendKarma, rank: effectiveRank, skipDice }
  );
  const { roll, cappedTotal, karmaUsed } = rollResult;
  const resultColor = rollUniversalTable(effectiveRank, cappedTotal);

  // Determine success
  let featSuccess = false;
  let resultText = "";
  if (intensity) {
    if (isAutomatic)       { featSuccess = true;  resultText = "Automatic Success"; }
    else if (isImpossible) { featSuccess = false;  resultText = "Impossible"; }
    else {
      featSuccess = checkFeatSuccess(resultColor, requiredColor.charAt(0).toUpperCase() + requiredColor.slice(1));
      resultText = featSuccess ? "Success" : "Failure";
    }
  } else {
    featSuccess = resultColor.toLowerCase() !== "white";
    resultText = featSuccess ? "Success" : "Failure";
  }

  // Build effect labels for result grid
  let effectLabels;
  if (intensity) {
    if (isAutomatic)       effectLabels = { white: "Auto", green: "Auto", yellow: "Auto", red: "Auto" };
    else if (isImpossible) effectLabels = { white: "Impossible", green: "Impossible", yellow: "Impossible", red: "Impossible" };
    else if (requiredColor === "red")    effectLabels = { white: "Failure", green: "Failure", yellow: "Failure", red: "Success" };
    else if (requiredColor === "yellow") effectLabels = { white: "Failure", green: "Failure", yellow: "Success", red: "Success" };
    else                                 effectLabels = { white: "Failure", green: "Success", yellow: "Success", red: "Success" };
  } else {
    effectLabels = ABILITY_FEAT_LABELS;
  }

  // Build result grid
  const resultGrid = buildResultGrid("talent-feat", resultColor.toLowerCase(), effectLabels);

  // Intensity section
  const intensitySection = intensity
    ? `<div><strong>Intensity:</strong> ${intensity}</div>
       <div style="color:#666;font-style:italic;">${intensityInfo}</div>`
    : "";

  // Banner
  const banner = bannerColors(resultColor.toLowerCase());

  const content = `
    <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
        <strong>${actor.name} - ${talent.name}</strong>
        <div style="font-size:0.85em;color:#666;">Ability FEAT</div>
      </div>
      <div style="padding:5px 10px;font-size:0.9em;">
        <div><strong>Ability:</strong> ${abilityName} - ${ability.rank} (${ability.value})</div>
        <div><strong>Talent Bonus:</strong> +${talentBonus}CS${extraShift ? ` | Extra: ${extraShift > 0 ? "+" : ""}${extraShift}CS` : ""}</div>
        <div><strong>Effective Rank:</strong> ${effectiveRank}</div>
        ${intensitySection}
        <div><strong>Roll:</strong> ${roll.total}${karmaUsed > 0 ? ` + Karma ${karmaUsed}` : ""} = <strong>${cappedTotal}</strong></div>
      </div>
      ${resultGrid}
      <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${banner.bg};color:${banner.fg};">
        RESULT: ${resultColor.toUpperCase()} — ${resultText}
      </div>
    </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });

  return { roll, resultColor, resultText, featSuccess };
}

// ── Dialog wiring ──────────────────────────────────────────

function _wireDialogHandlers(html, actor, talent, talentBonus, abilityModified, abilityLabel) {
  const actionSelect           = html.find("#action-type");
  const abilitySelect          = html.find("#ability-select");
  const abilityContainer       = html.find("#ability-container");
  const abilityHint            = html.find("#ability-hint");
  const baseRankDisplay        = html.find("#base-rank-display");
  const effectiveCard          = html.find("#effective-card");
  const effectiveRankDisplay   = html.find("#effective-rank-display");
  const effectiveShiftDisplay  = html.find("#effective-shift-display");
  const multiContainer         = html.find("#multi-target-container");
  const intensityContainer     = html.find("#intensity-container");
  const intensitySelect        = html.find("#intensity");
  const intensityInfo          = html.find("#intensity-info");
  const rankOverride           = talent.system.rankOverride;

  function getCurrentAbilityRank() {
    return abilitySelect.find("option:selected").data("rank") || "Typical";
  }

  function updateRankDisplays() {
    const currentRank = getCurrentAbilityRank();
    baseRankDisplay.text(currentRank);
    const extra = parseInt(html.find('[name="shift"]').val()) || 0;

    if (rankOverride) {
      const bIdx = RANKS.indexOf(currentRank);
      const oIdx = RANKS.indexOf(rankOverride);
      const shift = (bIdx >= 0 && oIdx >= 0) ? (oIdx - bIdx) : 0;
      effectiveRankDisplay.text(rankOverride);
      effectiveShiftDisplay.text(`(${shift >= 0 ? "+" : ""}${shift} CS)`);
    } else {
      const bIdx = RANKS.indexOf(currentRank);
      const effIdx = Math.min(Math.max(bIdx + talentBonus + extra, 0), RANKS.length - 1);
      const totalShift = talentBonus + extra;
      effectiveRankDisplay.text(RANKS[effIdx]);
      effectiveShiftDisplay.text(`(${totalShift >= 0 ? "+" : ""}${totalShift} CS)`);
    }
    if (intensityContainer.is(":visible")) updateIntensityInfo();
  }

  function updateIntensityInfo() {
    const selInt = intensitySelect.val();
    if (!selInt) {
      intensityInfo.html("Select intensity to determine required FEAT color")
        .css({ background: "#f5f5f5", "border-color": "#ddd", color: "#666", "font-style": "italic" });
      return;
    }
    const currentRank = getCurrentAbilityRank();
    const extra = parseInt(html.find('[name="shift"]').val()) || 0;
    let effRank;
    if (rankOverride) {
      effRank = rankOverride;
    } else {
      const bIdx = RANKS.indexOf(currentRank);
      const effIdx = Math.min(Math.max(bIdx + talentBonus + extra, 0), RANKS.length - 1);
      effRank = RANKS[effIdx];
    }
    const feat = determineFeatRequirement(effRank, selInt);
    let text, bg, border, color;
    if (feat.automatic)        { text = "Automatic Success"; bg = "#e8f5e9"; border = "#a5d6a7"; color = "#2e7d32"; }
    else if (feat.impossible)  { text = "Impossible";        bg = "#ffebee"; border = "#ef9a9a"; color = "#c62828"; }
    else if (feat.requirement === "Red")    { text = "RED only succeeds";       bg = "#ffebee"; border = "#ef9a9a"; color = "#c62828"; }
    else if (feat.requirement === "Yellow") { text = "YELLOW or higher required"; bg = "#fff8e1"; border = "#ffe082"; color = "#f57f17"; }
    else                       { text = "GREEN or higher required"; bg = "#e8f5e9"; border = "#a5d6a7"; color = "#2e7d32"; }
    intensityInfo.text(text)
      .css({ background: bg, "border-color": border, color, "font-style": "normal", "font-weight": "600", "font-family": "'Oswald',sans-serif", "letter-spacing": "0.4px", "text-transform": "uppercase", "font-size": "12px" });
  }

  function updateMultiOptions() {
    const selected = actionSelect.val();
    const code = extractActionCode(selected);
    const requiredAbility = COMBAT_ACTION_ABILITIES[selected];

    if (selected === "Ability FEAT") {
      abilitySelect.prop("disabled", false);
      abilityContainer.css("background", "#faf8f2");
      abilityHint.text(abilityModified !== "none" ? `Talent default: ${abilityLabel}` : "No default ability set");
      multiContainer.hide();
      intensityContainer.show();
      updateIntensityInfo();
    } else {
      if (requiredAbility) {
        abilitySelect.val(requiredAbility);
        abilitySelect.prop("disabled", true);
        abilityContainer.css("background", "#e8f0e8");
        abilityHint.text(`${selected} uses ${requiredAbility.charAt(0).toUpperCase() + requiredAbility.slice(1)}`);
      }
      multiContainer.html(buildMultiTargetHTML(code)).show();
      intensityContainer.hide();

      // Wire multi toggles
      const multiAdj = multiContainer.find("#multi-adjacent");
      const multiAtk = multiContainer.find("#multi-attacks");
      const multiOpts = multiContainer.find("#multi-attacks-options");
      multiAdj.on("change", function () {
        if (this.checked) multiAtk.prop("disabled", true).prop("checked", false).trigger("change");
        else multiAtk.prop("disabled", !MULTI_ATTACK_CODES.includes(code));
      });
      multiAtk.on("change", function () {
        if (this.checked) { multiAdj.prop("disabled", true).prop("checked", false); multiOpts.show(); }
        else { multiOpts.hide(); multiAdj.prop("disabled", !MULTI_ADJACENT_CODES.includes(code)); }
      });
    }
    updateRankDisplays();
  }

  actionSelect.on("change", updateMultiOptions);
  abilitySelect.on("change", updateRankDisplays);
  intensitySelect.on("change", updateIntensityInfo);
  html.find('[name="shift"]').on("change input", updateRankDisplays);
  updateMultiOptions();
}
