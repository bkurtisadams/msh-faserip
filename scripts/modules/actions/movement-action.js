// scripts/modules/actions/movement-action.js v1.0.0 - 2026-07-03
// Movement group (powers audit Step #6, slice 6a). Same data-driven shape as
// sense-action.js: MOVEMENT_CONFIG has one entry per power. Two movement
// powers make a Power FEAT (Teleportation, Dimensional Travel) and resolve
// through the shared engine; the rest are continuous "move at rank speed"
// powers that post an info card. Actual token movement / speed-in-areas is a
// separate movement-system concern and out of scope here.
//
// Routed from power-router.js for any movement-category / isMovementPower power.

import { showGenericFeatDialog } from "./generic-feat-dialog.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

const effLine = (html) => `<div style="padding:5px 10px;font-size:0.95em;text-align:center;">${html}</div>`;

// kind "feat": roll the power rank as a Power FEAT.
//   outcomes { white, green, yellow, red } -> color-graded result line.
//   onSuccess/onFail -> simple pass/fail line (when no outcomes).
//   note -> extra line under the FEAT card.
// kind "passive": post an info card (text), no FEAT.
const MOVEMENT_CONFIG = {
  "teleportation": {
    kind: "feat",
    hint: "Fixed by the power — a colored result teleports cleanly; white = disoriented (no action next round).",
    note: "Can carry touched/area targets up to Strength. Passengers: Good Endurance FEAT or disoriented 1-10 rounds. Into a solid: Endurance FEAT or take 2x the material's damage.",
    onSuccess: "Teleports cleanly to the destination.",
    onFail:    "Teleports, but disoriented — no action next round."
  },
  "dimensional travel": {
    kind: "feat",
    hint: "Fixed by the power — the result color determines what you reach; white fails.",
    note: "Breaking into another dimension is automatic unless pressed (then this FEAT). A specific dimension is a Power Stunt.",
    outcomes: {
      white:  "Cannot break through (while pressed).",
      green:  "Breaks into another dimension.",
      yellow: "Reaches home, or a known dimension.",
      red:    "Reaches a specific chosen location."
    }
  },

  "flight":         { kind: "passive", text: (r) => `Air movement at ${r} speed. Agility FEAT for maneuvers. Wind above ${r}: lose altitude. +1 area per 15 ft dropped, -1 area per 30 ft climbed.` },
  "gliding":        { kind: "passive", text: (r) => `Glides: drop 1 story/turn, ${r} speed horizontally. Agility FEAT to maintain level. Wind above ${r}: halted or pushed back.` },
  "leaping":        { kind: "passive", text: (r) => `Min = Strength +1CS. Use the leaping table, reading distance off ${r} in place of Strength.` },
  "wall-crawling":  { kind: "passive", text: (r) => `Move on vertical/inverted surfaces. ${r} adhesion vs the surface's slipperiness.` },
  "lightning speed":{ kind: "passive", text: (r) => `Min = Endurance +1CS. Move as a vehicle at ${r} speed; turn at max without penalty; full accel/decel in 1 round per area.` },
  "levitation":     { kind: "passive", text: (r) => `Vertical movement, ${r} as speed in stories. Immune to wind. Horizontal movement by pushing off surfaces.` },
  "swimming":       { kind: "passive", text: (r) => `Water movement at ${r} speed. Does not remove the need to breathe. Bonus: Water Breathing.` },
  "climbing":       { kind: "passive", text: (r) => `Scale vertical (not inverted) surfaces at ${r} speed. Move through tangles using ${r} in place of Agility.` },
  "digging":        { kind: "passive", text: (r) => `Tunnel at vehicle speed (half if leaving a supported tunnel). Dig through material below ${r} only. Bonus: Claws.` }
};

function postPassiveCard(actor, item, cfg) {
  const rank = item.system?.rank || "Typical";
  const short = RANK_ABBR[rank] || rank;
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
          <strong>${item.name}</strong><br>
          <span style="font-size:0.85em;font-weight:400;">Movement (${short})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">${cfg.text(rank)}</div>
      </div>`
  });
}

export async function showMovementFeat(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Movement power requires an actor.");
    return;
  }
  const cfg = MOVEMENT_CONFIG[(item.name || "").toLowerCase()];

  if (!cfg) {
    return postPassiveCard(actor, item, { text: () => item.system?.description || "Movement power." });
  }
  if (cfg.kind === "passive") return postPassiveCard(actor, item, cfg);

  const noteHtml = cfg.note ? `<div style="padding:0 10px 4px;font-size:0.82em;color:#666;text-align:center;">${cfg.note}</div>` : "";

  return showGenericFeatDialog(actor, {
    power: item,
    label: item.name,
    intensity: "None",
    lockIntensity: true,
    intensityHint: cfg.hint,
    onResult: ({ color, success }) => {
      const c = String(color).toLowerCase();
      const line = cfg.outcomes ? (cfg.outcomes[c] ?? cfg.outcomes.white) : (success ? cfg.onSuccess : cfg.onFail);
      return noteHtml + effLine(line);
    }
  });
}
