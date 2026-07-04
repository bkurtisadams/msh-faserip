// scripts/modules/actions/sense-action.js v1.0.0 - 2026-07-03
// Senses group (powers audit Step #7, slice 7a). Data-driven: each sense is a
// SENSE_CONFIG entry, and detection senses resolve through the shared Power
// FEAT engine (generic-feat-dialog with a power item) with a per-sense
// intensity rule and a color -> outcome mapping. Passive senses post a short
// info card instead of a FEAT. Combat Sense (a FEAT-substitution power) shows
// an info card for now; its automatic substitution is slice 7b.
//
// Routed from power-router.js for any senses-category / isSensePower power.

import { showGenericFeatDialog } from "./generic-feat-dialog.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

const effLine = (html) => `<div style="padding:5px 10px;font-size:0.95em;text-align:center;">${html}</div>`;

// kind: "feat"  -> roll the power rank as a Power FEAT.
//   outcomes: { white, green, yellow, red } -> color-graded result line.
//   onSuccess/onFail -> simple pass/fail result line (used when no outcomes).
//   needsTarget: true -> Emotion Detection: intensity = target's Intuition.
//   note -> extra line shown under the FEAT card (passive baseline, etc.).
// kind: "passive" -> post an info card (text), no FEAT.
const SENSE_CONFIG = {
  "magic detection": {
    kind: "feat",
    hint: "Fixed by the power — the result color determines what you learn; white fails.",
    outcomes: {
      white:  "No magic detected.",
      green:  "Magic is present in the area.",
      yellow: "The individuals involved in the magic are identified.",
      red:    "The type of spell is identified."
    }
  },
  "psionic detection": {
    kind: "feat",
    hint: "Fixed by the power — the result color determines what you learn; white fails.",
    outcomes: {
      white:  "No psionic activity detected.",
      green:  "Psionic abilities in use are detected (while actively checking).",
      yellow: "Psionic abilities in use are detected even without actively checking.",
      red:    "Psionic activity detected and pinpointed."
    }
  },
  "emotion detection": {
    kind: "feat",
    needsTarget: true,
    onSuccess: (t) => `Reads ${t}'s emotional state.`,
    onFail:    (t) => `Cannot read ${t}'s emotions — concealed.`
  },
  "energy detection": {
    kind: "feat",
    hint: "Fixed by the power — any colored result succeeds; white fails.",
    onSuccess: "Identifies the energy type and can track its trail (rank# per hour).",
    onFail:    "Cannot identify the energy source."
  },
  "astral detection": {
    kind: "feat",
    hint: "Fixed by the power — any colored result succeeds; white fails.",
    note: "Automatic: always aware of an astral form nearby. This FEAT identifies its features.",
    onSuccess: "Identifies features of the astral form(s) nearby.",
    onFail:    "Senses an astral presence but cannot make out details."
  },
  "mutant detection": {
    kind: "feat",
    hint: "Fixed by the power — any colored result succeeds; white fails.",
    onSuccess: "Detects mutant mental radiation within range (presence only, not identity).",
    onFail:    "No mutant radiation detected."
  },
  "cosmic awareness": {
    kind: "feat",
    hint: "Fixed by the power — any colored result succeeds; white fails.",
    note: "Perceives Class 1000+ entities within 10 miles.",
    onSuccess: "Finds a weakness — +1CS against the target on the next action.",
    onFail:    "No exploitable weakness found this round."
  },
  "tracking ability": {
    kind: "feat",
    hint: "Fixed by the power — any colored result succeeds; white fails.",
    onSuccess: "Catches the trail.",
    onFail:    "Loses the trail."
  },

  "protected senses":   { kind: "passive", text: (r) => `Protects one or more senses. Ignores sense-damaging attacks below ${r} intensity.` },
  "enhanced senses":    { kind: "passive", text: (r) => `One or more of the five senses operate at ${r}. Use for clues and initiative. Vulnerable: sense-attacks at +1CS.` },
  "infravision":        { kind: "passive", text: (r) => `See in the dark within a 5-area range. In darkness above ${r}, sight is limited to 2 ft.` },
  "magnetic detection": { kind: "passive", text: (r) => `Detects Earth's magnetic field and aberrations at ${r}. The character is hard to get lost.` },
  "computer links":     { kind: "passive", text: (r) => `Communicate with and retrieve from computers at ${r}. Breaking in: contest ${r} vs the computer's Reason.` },
  "combat sense":       { kind: "passive", text: (r) => `Used in place of Intuition (surprise), Fighting (block), Agility (dodge), or Strength (escape). (Automatic substitution is slice 7b.)` }
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
          <span style="font-size:0.85em;font-weight:400;">Passive sense (${short})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">${cfg.text(rank)}</div>
      </div>`
  });
}

export async function showSenseFeat(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Sense power requires an actor.");
    return;
  }
  const key = (item.name || "").toLowerCase();
  const cfg = SENSE_CONFIG[key];

  // Unknown sense: treat as a passive info card from its own description.
  if (!cfg) {
    return postPassiveCard(actor, item, { text: () => item.system?.description || "Passive sense." });
  }

  if (cfg.kind === "passive") return postPassiveCard(actor, item, cfg);

  // FEAT senses -----------------------------------------------------------
  let intensity = "None";
  let target = null;
  let hint = cfg.hint || "";

  if (cfg.needsTarget) {
    const targets = Array.from(game.user.targets || []);
    if (targets.length !== 1) {
      ui.notifications.warn(`${item.name} requires exactly one target.`);
      return;
    }
    target = targets[0].actor;
    if (!target) return;
    intensity = target.system?.abilities?.intuition?.rank || "Typical";
    const intuShort = RANK_ABBR[intensity] || intensity;
    hint = `Concealed by ${target.name}'s Intuition (${intuShort}) — beat it to read their emotions.`;
  }

  const noteHtml = cfg.note ? `<div style="padding:0 10px 4px;font-size:0.82em;color:#666;text-align:center;">${cfg.note}</div>` : "";

  return showGenericFeatDialog(actor, {
    power: item,
    label: item.name,
    intensity,
    lockIntensity: true,
    intensityHint: hint,
    onResult: ({ color, success }) => {
      const c = String(color).toLowerCase();
      let line;
      if (cfg.outcomes) line = cfg.outcomes[c] ?? cfg.outcomes.white;
      else {
        const s = success ? cfg.onSuccess : cfg.onFail;
        line = typeof s === "function" ? s(target?.name ?? "the target") : s;
      }
      return noteHtml + effLine(line);
    }
  });
}
