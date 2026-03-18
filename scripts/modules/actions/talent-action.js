// talent-action.js v1.0.0 - 2026-03-18
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

function isNonCombatTalent(talent) {
  return ["Professional Skill", "Scientific Skill", "Mystic/Mental Skill"].includes(talent.system.type || "");
}

function buildMultiTargetHTML(actionCode) {
  const validMulti = MULTI_ADJACENT_CODES.includes(actionCode);
  const validAttack = MULTI_ATTACK_CODES.includes(actionCode);
  if (!validMulti && !validAttack) return "";

  const targetCount = game.user.targets.size;
  let html = `<div style="margin-bottom:10px;padding:8px;background:#e8f4f8;border:1px solid #b8d4da;border-radius:3px;">
    <div style="font-weight:bold;margin-bottom:5px;color:#2c5aa0;">Multiple Target Options:</div>`;

  if (validMulti) {
    html += `<div style="margin-bottom:5px;">
      <label><input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right:5px;">
        Multiple Adjacent Targets (-4CS, single roll affects all)</label>
      <div style="font-size:0.8em;color:#666;margin-left:20px;">Targets selected: ${targetCount} | All must be adjacent</div>
      <div style="font-size:0.8em;color:#888;margin-left:20px;">Valid for: Blunt Attack, Escaping, Energy, Force</div>
    </div>`;
  }
  if (validAttack) {
    html += `<div style="margin-bottom:5px;">
      <label><input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right:5px;">
        Multiple Attacks (requires Fighting FEAT)</label>
      <div id="multi-attacks-options" style="margin-left:20px;display:none;">
        <label style="display:block;margin:3px 0;"><input type="radio" name="attackCount" value="2" checked style="margin-right:5px;">2 Attacks (Remarkable FEAT, -1CS each)</label>
        <label style="display:block;margin:3px 0;"><input type="radio" name="attackCount" value="3" style="margin-right:5px;">3 Attacks (Amazing FEAT, -1CS each)</label>
      </div>
      <div style="font-size:0.8em;color:#888;margin-left:20px;">Valid for: Slugfest (Blunt, Edged) and Shooting</div>
    </div>`;
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

  // Rank override
  const rankOverride = talent.system.rankOverride;
  let effectiveRankDisplay, talentBonusDisplay;
  if (rankOverride) {
    const baseIdx = RANKS.indexOf(baseRank);
    const overIdx = RANKS.indexOf(rankOverride);
    const overShift = (baseIdx >= 0 && overIdx >= 0) ? (overIdx - baseIdx) : 0;
    effectiveRankDisplay = `<div style="margin-bottom:10px;padding:8px;background:#e8f5e9;border:1px solid #4caf50;border-radius:4px;">
      <div style="font-weight:bold;color:#2e7d32;margin-bottom:4px;">★ RANK OVERRIDE</div>
      <div style="font-size:0.9em;">${baseRank} → <strong>${rankOverride}</strong> (+${overShift} CS)</div></div>`;
    talentBonusDisplay = "";
  } else {
    const effIdx = Math.min(Math.max(RANKS.indexOf(baseRank) + talentBonus, 0), RANKS.length - 1);
    effectiveRankDisplay = `<div style="margin-bottom:10px;">
      <label style="display:inline-block;width:120px;">Effective Rank:</label>
      <span>${baseRank} → <strong>${RANKS[effIdx]}</strong></span></div>`;
    talentBonusDisplay = `<div style="margin-bottom:10px;">
      <label style="display:inline-block;width:120px;">Talent Bonus:</label><span>+${talentBonus}CS</span></div>`;
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
    <div style="background:#f0e8d8;padding:10px;border-radius:5px;">
      <div style="margin-bottom:10px;">
        <label style="display:inline-block;width:120px;">Action Type:</label>
        <select id="action-type" name="actionType" style="width:180px;">${actionOptionsHTML}</select>
      </div>
      ${talentBonusDisplay}
      <div id="ability-container" style="margin-bottom:10px;padding:8px;background:#e8e8e8;border:1px solid #ccc;border-radius:4px;">
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Ability:</label>
          <select id="ability-select" name="abilitySelect" style="width:180px;">${abilityOptionsHTML}</select>
        </div>
        <div id="ability-hint" style="font-size:0.85em;color:#666;margin-left:124px;">
          ${abilityModified !== "none" ? `(Talent default: ${abilityLabel})` : "(No default ability set)"}
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:inline-block;width:120px;">Base Rank:</label>
        <span id="base-rank-display">${baseRank}</span>
      </div>
      <div id="effective-rank-container">${effectiveRankDisplay}</div>
      <div style="margin-bottom:10px;">
        <label style="display:inline-block;width:120px;">Extra Column Shift:</label>
        <input type="number" id="shift" name="shift" value="${savedExtraShift}" style="width:50px;">
        <span style="color:#666;font-size:0.9em;">(additional +/- CS)</span>
      </div>
      <div id="intensity-container" ${isAbilityFeat ? "" : 'style="display:none;"'}>
        <div style="margin-bottom:10px;">
          <label style="display:inline-block;width:120px;">Intensity:</label>
          <select id="intensity" name="intensity" style="width:180px;">${intensityOptionsHTML}</select>
        </div>
        <div id="intensity-info" style="margin-bottom:10px;padding:8px;background:#e8e8e8;border-radius:4px;font-size:0.9em;color:#555;">
          <em>Select intensity to determine required FEAT color</em>
        </div>
      </div>
      <div id="multi-target-container">${multiHTML}</div>
    </div>
    ${generateKarmaControlsHTML(actor, 0)}
    <div style="margin-bottom:10px;">
      <label><input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? "checked" : ""}> Skip dice animation</label>
    </div>
    <div style="margin-top:10px;">
      <label><input type="checkbox" id="save-settings" name="saveSettings" ${savedRemember ? "checked" : ""}> Remember these settings</label>
    </div>`;

  return new Promise(resolve => {
    new Dialog({
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
    }).render(true);
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
  const effectiveRankContainer = html.find("#effective-rank-container");
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
      effectiveRankContainer.html(`
        <div style="margin-bottom:10px;padding:8px;background:#e8f5e9;border:1px solid #4caf50;border-radius:4px;">
          <div style="font-weight:bold;color:#2e7d32;margin-bottom:4px;">★ RANK OVERRIDE</div>
          <div style="font-size:0.9em;">${currentRank} → <strong>${rankOverride}</strong> (+${shift} CS)</div>
        </div>`);
    } else {
      const bIdx = RANKS.indexOf(currentRank);
      const effIdx = Math.min(Math.max(bIdx + talentBonus + extra, 0), RANKS.length - 1);
      const totalShift = talentBonus + extra;
      effectiveRankContainer.html(`
        <div style="margin-bottom:10px;">
          <label style="display:inline-block;width:120px;">Effective Rank:</label>
          <span>${currentRank} → <strong>${RANKS[effIdx]}</strong> (${totalShift >= 0 ? "+" : ""}${totalShift}CS)</span>
        </div>`);
    }
    if (intensityContainer.is(":visible")) updateIntensityInfo();
  }

  function updateIntensityInfo() {
    const selInt = intensitySelect.val();
    if (!selInt) {
      intensityInfo.html("<em>Select intensity to determine required FEAT color</em>");
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
    let text, bg;
    if (feat.automatic)  { text = `<strong style="color:#2e7d32;">Automatic Success</strong>`; bg = "#c8e6c9"; }
    else if (feat.impossible) { text = `<strong style="color:#b71c1c;">Impossible</strong>`; bg = "#ffcdd2"; }
    else if (feat.requirement === "Red") { text = `<strong style="color:#F44336;">Red only</strong> succeeds`; bg = "#ffebee"; }
    else if (feat.requirement === "Yellow") { text = `<strong style="color:#F57C00;">Yellow or better</strong> required`; bg = "#fff3e0"; }
    else { text = `<strong style="color:#4CAF50;">Green or better</strong> required`; bg = "#e8f5e9"; }
    intensityInfo.html(text).css("background", bg);
  }

  function updateMultiOptions() {
    const selected = actionSelect.val();
    const code = extractActionCode(selected);
    const requiredAbility = COMBAT_ACTION_ABILITIES[selected];

    if (selected === "Ability FEAT") {
      abilitySelect.prop("disabled", false);
      abilityContainer.css("background", "#e8e8e8");
      abilityHint.html(abilityModified !== "none" ? `(Talent default: ${abilityLabel})` : "(No default ability set)");
      multiContainer.hide();
      intensityContainer.show();
      updateIntensityInfo();
    } else {
      if (requiredAbility) {
        abilitySelect.val(requiredAbility);
        abilitySelect.prop("disabled", true);
        abilityContainer.css("background", "#d0d8e0");
        abilityHint.html(`(${selected} uses ${requiredAbility.charAt(0).toUpperCase() + requiredAbility.slice(1)})`);
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
