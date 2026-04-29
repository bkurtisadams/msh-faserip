// contact-action.js v1.0.0 - 2026-03-18
// Migrated from actorSheet.js inline contact-roll handler and rolls.js FaseripRolls.rollContact.
// Standalone contact popularity FEAT dialog.

import { rollUniversalTable } from "../dice/universal-table.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

// ── Constants ──────────────────────────────────────────────

const RANKS = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

const CONTACT_RESOURCE_LEVELS = {
  "Professional":  "Remarkable",
  "Scientific":    "Incredible",
  "Political":     "Amazing",
  "Mystic":        "Good",
  "Criminal":      "Typical",
  "Hero Group":    "Incredible",
  "Other":         "Typical"
};

const DISP_ORDER = ["Friendly", "Neutral", "Suspicious", "Hostile"];

const ACTION_OPTIONS = [
  { value: "Availability", label: "Availability" },
  { value: "Information",  label: "Information Request" },
  { value: "Equipment",    label: "Equipment Request" },
  { value: "Assistance",   label: "Request Assistance" },
  { value: "Favor",        label: "Request Favor" }
];

// ── Helpers ────────────────────────────────────────────────

function shiftRankByCS(rankName, cs) {
  if (cs === 0) return rankName;
  const idx = RANKS.indexOf(rankName);
  if (idx < 0) return rankName;
  const newIdx = Math.min(Math.max(idx + cs, 0), RANKS.length - 1);
  return RANKS[newIdx];
}

function getDisposition(storedDisposition, heroPopularity) {
  const storedIdx = DISP_ORDER.indexOf(storedDisposition);
  const effIdx = heroPopularity < 0
    ? Math.min(storedIdx + 1, DISP_ORDER.length - 1)
    : storedIdx;
  return DISP_ORDER[effIdx] ?? "Friendly";
}

function getRequiredColor(disposition) {
  switch (disposition) {
    case "Friendly":   return "Green";
    case "Neutral":    return "Yellow";
    case "Suspicious": return "Red";
    case "Hostile":    return "Impossible";
    default:           return "Green";
  }
}

function getBannerColors(color) {
  switch (color.toLowerCase()) {
    case "white":  return { bg: "#f8f8f8", fg: "#333" };
    case "green":  return { bg: "#4CAF50", fg: "#fff" };
    case "yellow": return { bg: "#FFC107", fg: "#333" };
    case "red":    return { bg: "#F44336", fg: "#fff" };
    default:       return { bg: "#f8f8f8", fg: "#333" };
  }
}

function checkSuccess(resultColor, requiredColor) {
  const rank = { white: 0, green: 1, yellow: 2, red: 3 };
  const required = { "Green": 1, "Yellow": 2, "Red": 3, "Impossible": 99 };
  return (rank[resultColor.toLowerCase()] || 0) >= (required[requiredColor] || 0);
}

// ── Main entry point ───────────────────────────────────────

/**
 * Roll a contact Popularity FEAT.
 * @param {Actor} actor   - The owning actor
 * @param {Item}  contact - The contact item
 */
export async function rollContact(actor, contact) {
  if (!actor || !contact) {
    ui.notifications.error("Actor or contact not found");
    return;
  }

  const savedActionType  = contact.getFlag("msh-faserip", "lastActionType") || "Availability";
  const savedColumnShift = contact.getFlag("msh-faserip", "lastColumnShift") || 0;
  const skipDiceRoll     = contact.getFlag("msh-faserip", "skipDiceRoll") || false;

  const heroPopularity     = actor.system.attributes?.popularity?.value || 0;
  const heroPopularityRank = actor.system.attributes?.popularity?.rank || "Typical";
  const isMutant           = actor.system.origin === "Mutant" || actor.system.isMutant;

  const contactType = contact.system.type || "General";
  const resourceLevel = CONTACT_RESOURCE_LEVELS[contactType] ?? "Typical";

  const storedDisposition   = contact.system.disposition || "Friendly";
  const effectiveDisposition = getDisposition(storedDisposition, heroPopularity);
  const requiredFeatColor    = getRequiredColor(effectiveDisposition);

  const actionOptionsHTML = ACTION_OPTIONS.map(o =>
    `<option value="${o.value}" ${o.value === savedActionType ? "selected" : ""}>${o.label}</option>`
  ).join("");

  const dialogContent = `
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Request Type:</label>
    <select id="action-type" name="actionType" style="width:180px;">${actionOptionsHTML}</select>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Contact Type:</label>
    <input type="text" value="${contactType}" style="width:180px;" readonly>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Disposition:</label>
    <input type="text" value="${effectiveDisposition}" style="width:100px;" readonly>
    ${heroPopularity < 0 ? '<span style="color:#aa0000;font-size:0.9em;"> (Modified due to negative popularity)</span>' : ""}
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Popularity:</label>
    <input type="text" value="${heroPopularityRank}" style="width:100px;" readonly>
    <span style="margin-left:5px;">(${heroPopularity})</span>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Resources:</label>
    <input type="text" value="${resourceLevel}" style="width:100px;" readonly>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Required Result:</label>
    <input type="text" value="${requiredFeatColor}" style="width:100px;" readonly>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Column Shift:</label>
    <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width:50px;">
    <span style="color:#666;font-size:0.9em;">(+ right, - left)</span>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:inline-block;width:120px;">Karma Points:</label>
    <input type="number" id="karma" name="karma" value="0" min="0" style="width:50px;">
  </div>
  <div style="margin-bottom:10px;">
    <label><input type="checkbox" id="save-settings" name="saveSettings" checked> Remember these settings</label>
  </div>
  <div>
    <label><input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? "checked" : ""}> Skip dice animation</label>
  </div>`;

  showFaseripButtonDialog({
    title: `Contact Roll: ${contact.name}`,
    content: dialogContent,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const actionType   = html.find('[name="actionType"]').val();
          const columnShift  = parseInt(html.find('[name="shift"]').val()) || 0;
          const karma        = parseInt(html.find('[name="karma"]').val()) || 0;
          const saveSettings = html.find('[name="saveSettings"]').is(":checked");
          const skipDice     = html.find('[name="skipDice"]').is(":checked");

          // Save settings
          if (saveSettings) {
            await contact.setFlag("msh-faserip", "lastActionType", actionType);
            await contact.setFlag("msh-faserip", "lastColumnShift", columnShift);
            await contact.setFlag("msh-faserip", "skipDiceRoll", skipDice);
          }

          // Effective rank
          let effectiveRank = heroPopularityRank;
          if (columnShift !== 0) {
            effectiveRank = shiftRankByCS(heroPopularityRank, columnShift);
          }

          // Mutant penalty
          if (isMutant && !contact.system.ignoreMutantPenalty) {
            effectiveRank = shiftRankByCS(effectiveRank, -1);
          }

          // Roll
          const roll = new Roll("1d100");
          await roll.evaluate();

          let cappedTotal = roll.total;
          let karmaUsed = 0;
          if (karma > 0) {
            cappedTotal = Math.min(100, roll.total + karma);
            karmaUsed = karma;

            // Karma history
            const history = foundry.utils.deepClone(actor.system.karma?.history || []);
            history.push({
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -karmaUsed,
              type: "Die Roll",
              description: `Spent on ${contact.name} (Contact)`
            });
            await actor.update({ "system.karma.history": history });
          }

          // Result
          const resultColor = rollUniversalTable(effectiveRank, cappedTotal);
          const success = checkSuccess(resultColor, requiredFeatColor);
          const resultText = success ? "Success" : "Failure";
          const banner = getBannerColors(resultColor);

          const content = `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
                <strong>${actor.name} - ${contact.name}</strong>
                <div style="font-size:0.85em;color:#666;">${actionType}</div>
              </div>
              <div style="padding:5px 10px;font-size:0.9em;">
                <div><strong>Popularity:</strong> ${heroPopularityRank} (${heroPopularity})</div>
                <div><strong>Disposition:</strong> ${effectiveDisposition}</div>
                ${isMutant && !contact.system.ignoreMutantPenalty ? '<div style="color:#aa0000;"><strong>Mutant Penalty:</strong> -1CS</div>' : ""}
                ${columnShift !== 0 ? `<div><strong>Column Shift:</strong> ${columnShift > 0 ? "+" : ""}${columnShift}</div>` : ""}
                <div><strong>Effective Rank:</strong> ${effectiveRank}</div>
                <div><strong>Required:</strong> ${requiredFeatColor}+</div>
                <div><strong>Roll:</strong> ${roll.total}${karmaUsed > 0 ? ` + Karma ${karmaUsed}` : ""} = <strong>${cappedTotal}</strong></div>
              </div>
              <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${banner.bg};color:${banner.fg};">
                ${resultColor.toUpperCase()} — ${resultText}
              </div>
              ${heroPopularity < 0 ? '<div style="padding:5px 10px;font-size:0.9em;color:#aa0000;">Negative popularity affects contact relations</div>' : ""}
            </div>`;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });

          if (heroPopularity < 0) {
            ui.notifications.warn("Negative popularity: Using contacts costs Karma!");
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  });
}
