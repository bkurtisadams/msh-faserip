// contact-action.js v1.0.0 - 2026-03-18
// Migrated from actorSheet.js inline contact-roll handler and rolls.js FaseripRolls.rollContact.
// Standalone contact popularity FEAT dialog.

import { rollUniversalTable } from "../dice/universal-table.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";
import { generateKarmaControlsHTML, setupKarmaControlHandlers, extractKarmaFromDialog } from "../dice/dice-roller.js";

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

const REQ_COLOR_STYLES = {
  "Green":      { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32" },
  "Yellow":     { bg: "#fff8e1", border: "#ffe082", text: "#f57f17" },
  "Red":        { bg: "#ffebee", border: "#ef9a9a", text: "#c62828" },
  "Impossible": { bg: "#f5f5f5", border: "#999",    text: "#555"    }
};

const TYPE_OBLIGATION = {
  "Criminal":   "Acting against this contact may force a Karma vs Contact decision.",
  "Hero Group": "At group's beck and call. Group enemies become your enemies.",
  "Espionage":  "Using this contact will be repaid with a request for a return favor."
};

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

  const dispOptionsHTML = DISP_ORDER.map(d =>
    `<option value="${d}" ${d === storedDisposition ? "selected" : ""}>${d}</option>`
  ).join("");

  const reqStyles0 = REQ_COLOR_STYLES[requiredFeatColor] || REQ_COLOR_STYLES.Green;
  const isMutantPenaltyActive = isMutant && !contact.system.ignoreMutantPenalty;
  const obligationCopy = TYPE_OBLIGATION[contactType];
  const negPopCost0 = heroPopularity < 0 ? Math.abs(heroPopularity) : 0;

  // Initial preview of effective rank (CS + mutant penalty)
  let effRank0 = heroPopularityRank;
  if (savedColumnShift !== 0) effRank0 = shiftRankByCS(effRank0, savedColumnShift);
  if (isMutantPenaltyActive) effRank0 = shiftRankByCS(effRank0, -1);

  const dialogContent = `
  <div class="frp-dlg" style="font-family:'Barlow Condensed',Arial,sans-serif;">
    <div class="frp-header-v3">
      <span class="h-actor">${actor.name}</span>
      <span class="h-arrow">→</span>
      <span class="h-target">${contact.name}</span>
      <span style="margin-left:auto;padding:1px 6px;background:rgba(255,255,255,0.18);border-radius:2px;font-size:10px;letter-spacing:0.4px;text-transform:uppercase;">${contactType}</span>
    </div>

    <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 8px;align-items:center;font-size:13px;padding:4px 6px;background:#f5f3ee;border:1px solid #d8cfb8;border-radius:2px;margin-bottom:6px;">
      <label style="color:#444;">Request:</label>
      <select name="actionType" style="width:100%;padding:2px 5px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;font-family:inherit;font-size:13px;height:auto;">${actionOptionsHTML}</select>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
      <div style="border:1px solid #d8cfb8;border-radius:2px;padding:4px 6px;background:#faf8f2;">
        <div style="font-family:'Oswald',sans-serif;font-size:10px;color:#c8960c;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Hero</div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0;"><span style="color:#444;">Popularity</span><span style="font-family:'Oswald';font-weight:700;${heroPopularity < 0 ? 'color:#c62828;' : ''}">${heroPopularityRank} (${heroPopularity})</span></div>
        ${isMutant ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0;"><span style="color:#444;">Mutant</span><span style="font-family:'Oswald';font-weight:700;color:${isMutantPenaltyActive ? '#c62828' : '#777'};">Yes${isMutantPenaltyActive ? ' (–1 CS)' : ''}</span></div>` : ''}
      </div>
      <div style="border:1px solid #d8cfb8;border-radius:2px;padding:4px 6px;background:#faf8f2;">
        <div style="font-family:'Oswald',sans-serif;font-size:10px;color:#c8960c;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Contact</div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0;"><span style="color:#444;">Type</span><span style="font-family:'Oswald';font-weight:700;">${contactType}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0;"><span style="color:#444;">Resources cap</span><span style="font-family:'Oswald';font-weight:700;">${resourceLevel}</span></div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid #d8cfb8;border-radius:2px;background:#faf8f2;margin-bottom:6px;">
      <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#c8960c;letter-spacing:0.5px;text-transform:uppercase;">Disposition</span>
      <select name="storedDisposition" style="padding:2px 5px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;font-family:inherit;font-size:12px;height:auto;">${dispOptionsHTML}</select>
      <span id="disp-shift-note" style="font-size:11px;font-style:italic;"></span>
      <span style="margin-left:auto;font-size:10px;color:#777;">(this roll only)</span>
    </div>

    <div id="required-strip" style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:${reqStyles0.bg};border:1px solid ${reqStyles0.border};border-radius:2px;margin-bottom:6px;color:${reqStyles0.text};">
      <span style="font-size:11px;letter-spacing:0.4px;text-transform:uppercase;font-family:'Oswald',sans-serif;">Required</span>
      <span id="required-color" style="font-family:'Oswald',sans-serif;font-weight:700;font-size:16px;letter-spacing:0.5px;color:${reqStyles0.text};">${requiredFeatColor.toUpperCase()}</span>
      <span id="required-note" style="margin-left:auto;font-size:11px;color:#555;">${requiredFeatColor === 'Impossible' ? 'Cannot succeed by rolling — disposition is Hostile' : `${requiredFeatColor} or higher = granted · White = refused`}</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border:1px solid #d8cfb8;border-radius:2px;margin-bottom:6px;">
      <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#c8960c;letter-spacing:0.5px;text-transform:uppercase;">CS</span>
      <input type="number" name="shift" value="${savedColumnShift}" style="width:42px;padding:2px;text-align:center;border:1px solid #b8b8b8;border-radius:2px;font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;height:auto;">
      <span style="font-size:11px;color:#777;">→</span>
      <span id="effective-rank-preview" style="font-size:13px;font-family:'Oswald',sans-serif;font-weight:600;">${effRank0}</span>
      <span style="margin-left:auto;font-size:11px;color:#777;">+1 = column right</span>
    </div>

    ${obligationCopy ? `<div style="padding:5px 7px;background:#fff8e1;border:1px solid #ffcc80;border-radius:2px;margin-bottom:6px;font-size:11px;color:#6d4c00;"><strong style="font-family:'Oswald',sans-serif;letter-spacing:0.4px;text-transform:uppercase;">⚠ ${contactType}:</strong> <em>${obligationCopy}</em></div>` : ''}

    ${negPopCost0 > 0 ? `<div style="padding:5px 7px;background:#ffebee;border:1px solid #ef9a9a;border-radius:2px;margin-bottom:6px;font-size:11px;color:#c62828;"><strong style="font-family:'Oswald',sans-serif;letter-spacing:0.4px;text-transform:uppercase;">⚠ Negative popularity:</strong> auto-deducts <strong>${negPopCost0}</strong> Karma on this roll regardless of result.</div>` : ''}

    ${generateKarmaControlsHTML(actor)}

    <div style="display:flex;align-items:center;gap:12px;padding-top:4px;border-top:1px solid #d8cfb8;font-size:11px;color:#666;">
      <label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" name="saveSettings" checked style="margin:0;"> Remember settings</label>
      <label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" name="skipDice" ${skipDiceRoll ? "checked" : ""} style="margin:0;"> Skip dice animation</label>
    </div>
  </div>`;

  showFaseripButtonDialog({
    title: `Contact Roll: ${contact.name}`,
    content: dialogContent,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const actionType   = html.find('[name="actionType"]').val();
          const liveStored   = html.find('[name="storedDisposition"]').val();
          const columnShift  = parseInt(html.find('[name="shift"]').val()) || 0;
          const { spendKarma } = extractKarmaFromDialog(html);
          const saveSettings = html.find('[name="saveSettings"]').is(":checked");
          const skipDice     = html.find('[name="skipDice"]').is(":checked");

          const liveEffDisp  = getDisposition(liveStored, heroPopularity);
          const liveReqColor = getRequiredColor(liveEffDisp);

          // Defensive: Hostile disposition → roll cannot succeed (button is also disabled)
          if (liveReqColor === "Impossible") {
            ui.notifications.warn("Hostile disposition: roll cannot succeed.");
            return;
          }

          if (saveSettings) {
            await contact.setFlag("msh-faserip", "lastActionType", actionType);
            await contact.setFlag("msh-faserip", "lastColumnShift", columnShift);
            await contact.setFlag("msh-faserip", "skipDiceRoll", skipDice);
          }

          // Effective rank: CS + mutant penalty
          let effectiveRank = heroPopularityRank;
          if (columnShift !== 0) effectiveRank = shiftRankByCS(effectiveRank, columnShift);
          if (isMutantPenaltyActive) effectiveRank = shiftRankByCS(effectiveRank, -1);

          // Roll
          const roll = new Roll("1d100");
          await roll.evaluate();

          let cappedTotal = roll.total;
          let karmaSpent = 0;

          // Phase-2 karma: post-roll amount selection if pre-roll declared
          if (spendKarma) {
            const { showKarmaDecisionDialog } = await import("../dice/dice-roller.js");
            const initialColor = rollUniversalTable(effectiveRank, roll.total);
            const result = await showKarmaDecisionDialog(actor, roll.total, effectiveRank, `${contact.name} (Contact)`, initialColor);
            cappedTotal = result.finalResult;
            karmaSpent  = result.karmaSpent;
            // Karma already deducted by showKarmaDecisionDialog
          }

          // Negative-popularity automatic karma cost (Karma rules: lose karma equal
          // to popularity rank number on every Popularity FEAT use when pop < 0).
          const negPopCost = heroPopularity < 0 ? Math.abs(heroPopularity) : 0;
          if (negPopCost > 0) {
            const history = foundry.utils.deepClone(actor.system.karma?.history || []);
            history.push({
              timestamp: new Date().toISOString(),
              realDate:  new Date().toLocaleDateString(),
              gameDate:  "",
              amount:    -negPopCost,
              type:      "Popularity FEAT",
              description: `Negative popularity penalty (${contact.name})`
            });
            await actor.update({ "system.karma.history": history });
          }

          const resultColor = rollUniversalTable(effectiveRank, cappedTotal);
          const success = checkSuccess(resultColor, liveReqColor);
          const resultText = success ? "Granted" : "Refused";
          const banner = getBannerColors(resultColor);

          const content = `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
                <strong>${actor.name} → ${contact.name}</strong>
                <div style="font-size:0.85em;color:#666;">${actionType}</div>
              </div>
              <div style="padding:5px 10px;font-size:0.9em;">
                <div><strong>Popularity:</strong> ${heroPopularityRank} (${heroPopularity})</div>
                <div><strong>Disposition:</strong> ${liveEffDisp}${liveStored !== liveEffDisp ? ` (stored ${liveStored}, shifted –pop)` : ""}</div>
                ${isMutantPenaltyActive ? '<div style="color:#aa0000;"><strong>Mutant penalty:</strong> –1 CS</div>' : ""}
                ${columnShift !== 0 ? `<div><strong>Column shift:</strong> ${columnShift > 0 ? "+" : ""}${columnShift}</div>` : ""}
                <div><strong>Effective rank:</strong> ${effectiveRank}</div>
                <div><strong>Required:</strong> ${liveReqColor}+</div>
                <div><strong>Roll:</strong> ${roll.total}${karmaSpent > 0 ? ` + Karma ${karmaSpent}` : ""} = <strong>${cappedTotal}</strong></div>
                ${negPopCost > 0 ? `<div style="color:#aa0000;"><strong>Auto Karma cost:</strong> –${negPopCost} (negative popularity)</div>` : ""}
              </div>
              <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${banner.bg};color:${banner.fg};">
                ${resultColor.toUpperCase()} — ${resultText}
              </div>
            </div>`;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: (html, dlg) => {
      setupKarmaControlHandlers(html);

      const $stored    = html.find('[name="storedDisposition"]');
      const $shift     = html.find('[name="shift"]');
      const $shiftNote = html.find('#disp-shift-note');
      const $reqStrip  = html.find('#required-strip');
      const $reqColor  = html.find('#required-color');
      const $reqNote   = html.find('#required-note');
      const $effRank   = html.find('#effective-rank-preview');
      const $rollBtn   = $(dlg.element).find('button[data-action="roll"]');

      function recompute() {
        const stored = $stored.val();
        const eff    = getDisposition(stored, heroPopularity);
        const req    = getRequiredColor(eff);

        if (eff !== stored) {
          $shiftNote.text(`→ ${eff} (–pop)`).css("color", "#c62828");
        } else {
          $shiftNote.text("").css("color", "");
        }

        const rs = REQ_COLOR_STYLES[req] || REQ_COLOR_STYLES.Green;
        $reqStrip.css({ background: rs.bg, "border-color": rs.border, color: rs.text });
        $reqColor.text(req.toUpperCase()).css("color", rs.text);

        if (req === "Impossible") {
          $reqNote.text("Cannot succeed by rolling — disposition is Hostile");
          $rollBtn.prop("disabled", true).css({ opacity: 0.5, cursor: "not-allowed" });
        } else {
          $reqNote.text(`${req} or higher = granted · White = refused`);
          $rollBtn.prop("disabled", false).css({ opacity: "", cursor: "" });
        }

        const cs = parseInt($shift.val()) || 0;
        let er = heroPopularityRank;
        if (cs !== 0) er = shiftRankByCS(er, cs);
        if (isMutantPenaltyActive) er = shiftRankByCS(er, -1);
        $effRank.text(er);
      }

      $stored.on("change", recompute);
      $shift.on("input change", recompute);
      recompute();
    }
  });
}
