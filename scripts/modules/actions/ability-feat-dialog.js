// ability-feat-dialog.js v1.0.0 - 2026-03-06
// Extracted from actorSheet.js — standalone ability FEAT dialog usable from sheet and combat panel.

import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma } from '../dice/dice-roller.js';
import { applyColumnShifts } from '../dice/column-shifts.js';

const RANKS = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

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

export function determineFeatRequirement(abilityRank, intensity) {
  const abilityIndex = RANKS.indexOf(abilityRank);
  const intensityIndex = RANKS.indexOf(intensity);

  if (abilityIndex === -1 || intensityIndex === -1) {
    return { requirement: "Any Color", impossible: false, automatic: false };
  }

  const difference = abilityIndex - intensityIndex;

  if (difference < -1) return { requirement: "Red", impossible: true, automatic: false };
  if (difference >= 3)  return { requirement: "Automatic", impossible: false, automatic: true };
  if (difference === -1) return { requirement: "Red", impossible: false, automatic: false };
  if (difference === 0)  return { requirement: "Yellow", impossible: false, automatic: false };
  if (difference === 1 || difference === 2) return { requirement: "Green", impossible: false, automatic: false };

  return { requirement: "Any Color", impossible: false, automatic: false };
}

export function checkFeatSuccess(resultColor, requirement) {
  const color = resultColor.toLowerCase();
  switch (requirement) {
    case "Green":     return ["green", "yellow", "red"].includes(color);
    case "Yellow":    return ["yellow", "red"].includes(color);
    case "Red":       return color === "red";
    case "Automatic": return true;
    default:          return true;
  }
}

function applyCS(rank, shift) {
  if (shift === 0) return rank;
  const idx = RANKS.indexOf(rank);
  if (idx === -1) return rank;
  return RANKS[Math.min(Math.max(idx + shift, 0), RANKS.length - 1)];
}

// ── Color utilities ──────────────────────────────────────────

function colorBg(c) {
  switch (c.toLowerCase()) {
    case "white":  return "#f8f8f8";
    case "green":  return "#4CAF50";
    case "yellow": return "#FFC107";
    case "red":    return "#F44336";
    default:       return "#ddd";
  }
}

function colorFg(c) {
  const lo = c.toLowerCase();
  return (lo === "white" || lo === "yellow") ? "#333" : "white";
}

// ── Main entry point ─────────────────────────────────────────

export async function showAbilityFeatDialog(actor, abilityName) {
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

  // Saved settings
  const gf = (flag) => actor.getFlag("msh-faserip", flag);
  const savedColumnShift    = gf(`last${fullName}ColumnShift`) || 0;
  const savedIntensity      = gf(`last${fullName}Intensity`) || "None";
  const skipDiceRoll        = gf(`last${fullName}SkipDiceRoll`) || false;
  const savedFeatType       = gf(`last${fullName}FeatType`) || "standard";
  const savedWeightIntensity = gf(`last${fullName}WeightIntensity`) || "Remarkable";
  const savedMaterial       = gf(`last${fullName}Material`) || "Steel";
  const savedThickness      = gf(`last${fullName}Thickness`) || "2-12";

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

  // Build dialog content
  let dialogContent = `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 100px;">Ability Rank:</label>
      <input type="text" id="ability-rank" name="abilityRank" value="${abilityRank}" style="width: 120px;" readonly>
      <span style="margin-left: 5px;">(${abilityValue})</span>
    </div>`;

  if (isStrength) {
    dialogContent += `
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 100px;">FEAT Type:</label>
        <label><input type="radio" name="featType" value="standard" ${savedFeatType === 'standard' ? 'checked' : ''}> Standard</label>
        <label style="margin-left: 10px;"><input type="radio" name="featType" value="lifting" ${savedFeatType === 'lifting' ? 'checked' : ''}> Lifting</label>
        <label style="margin-left: 10px;"><input type="radio" name="featType" value="breaking" ${savedFeatType === 'breaking' ? 'checked' : ''}> Breaking</label>
      </div>
      <div id="lifting-section" style="display: none; padding: 8px; background-color: #f0f0f0; border-radius: 3px; margin-bottom: 10px;">
        <div style="font-weight: bold; margin-bottom: 5px; text-align: center;">─── Lifting Weight ───</div>
        <div style="margin-bottom: 5px;">
          <label style="display: inline-block; width: 50px;">Weight:</label>
          <select id="weight-intensity" name="weightIntensity" style="width: 300px;">
            ${weightIntensityOptionsHTML}
          </select>
        </div>
      </div>
      <div id="breaking-section" style="display: none; padding: 8px; background-color: #f0f0f0; border-radius: 3px; margin-bottom: 10px;">
        <div style="font-weight: bold; margin-bottom: 5px; text-align: center;">─── Breaking Material ───</div>
        <div style="margin-bottom: 5px;">
          <label style="display: inline-block; width: 60px;">Material:</label>
          <select id="material-select" name="material" style="width: 200px;">
            ${materialOptionsHTML}
          </select>
          <span id="base-material-strength" style="margin-left: 5px; font-size: 0.9em;"></span>
        </div>
        <div style="margin-bottom: 5px;">
          <label style="display: inline-block; width: 60px;">Thickness:</label>
          <label><input type="radio" name="thickness" value="<2" ${savedThickness === '<2' ? 'checked' : ''}> &lt;2"</label>
          <label style="margin-left: 8px;"><input type="radio" name="thickness" value="2-12" ${savedThickness === '2-12' ? 'checked' : ''}> 2-12"</label>
          <label style="margin-left: 8px;"><input type="radio" name="thickness" value="1-2ft" ${savedThickness === '1-2ft' ? 'checked' : ''}> 1-2'</label>
          <label style="margin-left: 8px;"><input type="radio" name="thickness" value=">2ft" ${savedThickness === '>2ft' ? 'checked' : ''}> &gt;2'</label>
          <span id="effective-material-strength" style="margin-left: 10px; font-weight: bold;"></span>
        </div>
      </div>`;
  }

  dialogContent += `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Intensity:</label>
      <select id="intensity" name="intensity" style="width: 120px;">
        ${intensityOptionsHTML}
      </select>
    </div>
    <div style="margin-bottom: 10px;" id="feat-requirement">
      <label style="display: inline-block; width: 120px;">Required FEAT:</label>
      <span id="required-feat-text" style="font-weight: bold;">Any Color</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Column Shift:</label>
      <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
      <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
    </div>
    ${generateKarmaControlsHTML(actor)}
    <div style="margin-bottom: 10px;">
      <label>
        <input type="checkbox" id="save-settings" name="saveSettings" checked> 
        Remember settings for future rolls
      </label>
    </div>
    <div>
      <label>
        <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
        Skip dice animation
      </label>
    </div>`;

  // ── Dialog ──────────────────────────────────────────────────

  new Dialog({
    title: `${fullName} FEAT Roll: ${actor.name}`,
    content: dialogContent,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const intensity = html.find('[name="intensity"]').val();
          const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
          const spendKarma = html.find('#spend-karma').is(':checked');
          const saveSettings = html.find('[name="saveSettings"]').is(':checked');
          const skipDice = html.find('[name="skipDice"]').is(':checked');

          let featType = 'standard';
          let weightIntensity = '';
          let material = '';
          let thickness = '';

          if (isStrength) {
            featType = html.find('[name="featType"]:checked').val();
            weightIntensity = html.find('[name="weightIntensity"]').val();
            material = html.find('[name="material"]').val();
            thickness = html.find('[name="thickness"]:checked').val();
          }

          // Save settings
          if (saveSettings) {
            await actor.setFlag("msh-faserip", `last${fullName}ColumnShift`, columnShift);
            await actor.setFlag("msh-faserip", `last${fullName}Intensity`, intensity);
            await actor.setFlag("msh-faserip", `last${fullName}SkipDiceRoll`, skipDice);
            if (isStrength) {
              await actor.setFlag("msh-faserip", `last${fullName}FeatType`, featType);
              await actor.setFlag("msh-faserip", `last${fullName}WeightIntensity`, weightIntensity);
              await actor.setFlag("msh-faserip", `last${fullName}Material`, material);
              await actor.setFlag("msh-faserip", `last${fullName}Thickness`, thickness);
            }
          }

          // Apply column shifts
          const effectiveRank = applyCS(abilityRank, columnShift);

          // Determine FEAT requirement
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

          // Automatic success
          if (isAutomatic) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
                <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                  <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                    <strong>${actor.name} - ${fullName} FEAT Roll vs ${intensity}</strong>
                  </div>
                  <div style="padding: 5px 10px; font-size: 0.9em;">
                    <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                    ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                    ${strengthContext}
                    <div>Intensity: ${intensity}</div>
                    <div>Ability rank is 3+ ranks higher than intensity</div>
                  </div>
                  <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                    background-color: #4CAF50; color: white;">
                    AUTOMATIC SUCCESS
                  </div>
                </div>`
            });
            return;
          }

          // Roll
          const roll = new Roll("1d100");
          await roll.evaluate();

          if (!skipDice) {
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `${actor.name} makes a ${fullName} FEAT roll${intensity !== "None" ? ` vs ${intensity} intensity` : ""}`,
              rollMode: game.settings.get("core", "rollMode")
            });
          }

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
          if (intensity !== "None") {
            featSuccess = checkFeatSuccess(resultColor, featRequirement);
          }

          // Chat card
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
                  <strong>${actor.name} - ${fullName} FEAT Roll${intensity !== "None" ? ` vs ${intensity}` : ""}</strong>
                </div>
                <div style="padding: 5px 10px; font-size: 0.9em;">
                  <div>Base Rank: ${abilityRank} (${abilityValue})</div>
                  ${columnShift !== 0 ? `<div>Column Shift: ${columnShift} → ${effectiveRank}</div>` : ''}
                  ${strengthContext}
                  ${intensity !== "None" ? `<div>Intensity: ${intensity} (Required: ${featRequirement})</div>` : ''}
                  <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
                </div>
                <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
                  background-color: ${colorBg(resultColor)}; 
                  color: ${colorFg(resultColor)};">
                  ${resultColor.toUpperCase()} RESULT
                </div>
                ${intensity !== "None" ? `
                  <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
                    ${featSuccess ? 'FEAT SUCCEEDED' : 'FEAT FAILED'}
                  </div>
                ` : ''}
              </div>`
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: html => {
      // Shared updateFeatRequirement for all abilities
      const updateFeatRequirement = () => {
        const intensity = html.find('#intensity').val();
        const cs = parseInt(html.find('#shift').val()) || 0;
        const reqText = html.find('#required-feat-text');

        if (intensity === "None") {
          reqText.text("Any Color").css('color', '#333');
          return;
        }

        const effectiveRank = applyCS(abilityRank, cs);
        const { requirement, impossible, automatic } = determineFeatRequirement(effectiveRank, intensity);

        if (impossible) {
          reqText.text("IMPOSSIBLE").css('color', '#F44336');
        } else if (automatic) {
          reqText.text("AUTOMATIC").css('color', '#4CAF50');
        } else {
          const colors = { Green: '#4CAF50', Yellow: '#FFC107', Red: '#F44336' };
          reqText.text(requirement).css('color', colors[requirement] || '#333');
        }
      };

      if (!isStrength) {
        html.find('#intensity, #shift').on('change', updateFeatRequirement);
        updateFeatRequirement();
      } else {
        const dialogElement = html.closest('.dialog');

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
          const ft = html.find('[name="featType"]:checked').val();
          const liftSec = html.find('#lifting-section');
          const breakSec = html.find('#breaking-section');
          const intensitySelect = html.find('#intensity');
          const intensityRow = intensitySelect.closest('div');

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

          if (dialogElement.length > 0) {
            dialogElement[0].style.height = 'auto';
          }
        };

        html.find('[name="featType"]').on('change', updateFeatTypeDisplay);
        html.find('#weight-intensity').on('change', updateWeightIntensity);
        html.find('#material-select').on('change', updateMaterialStrength);
        html.find('[name="thickness"]').on('change', updateMaterialStrength);
        html.find('#intensity, #shift').on('change', updateFeatRequirement);
        updateFeatTypeDisplay();
      }
    }
  }).render(true);
}
