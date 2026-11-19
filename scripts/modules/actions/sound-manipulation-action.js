// scripts/modules/actions/sound-manipulation-action.js v1.0.0 - 2026-11-18
// Sound Manipulation is not an attack. Dampen existing noise by the Power rank
// number in Intensity (no FEAT), or raise it one Intensity level on a successful
// Power rank FEAT. Its protection (sonic attacks on the hero reduced by the rank
// number) is the power's passive sound resistance.

import { showGenericFeatDialog } from "./generic-feat-dialog.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

function rankNumber(item) {
  const sys = item.system || {};
  return Number(sys.value) || game.msh?.getRankValue?.(sys.rank) || 0;
}

function postDampenCard(actor, item) {
  const rank = item.system?.rank || "Typical";
  const num = rankNumber(item);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
          <strong>${item.name}: Dampen</strong><br>
          <span style="font-size:0.85em;font-weight:400;">${rank} (${num})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">Existing noise is dampened by <strong>${num}</strong> points of Intensity. No FEAT needed.</div>
      </div>`
  });
}

function rollRaise(actor, item) {
  return showGenericFeatDialog(actor, {
    power: item,
    label: `${item.name}: Raise noise`,
    intensity: "None",
    lockIntensity: true,
    intensityHint: "Power rank FEAT. Any colored result raises existing noise one level of Intensity; White fails.",
    onResult: async ({ success }) => success
      ? `<div style="padding:5px 10px;font-size:0.95em;text-align:center;">Existing noise raised <strong>one level</strong> of Intensity.</div>`
      : `<div style="padding:5px 10px;font-size:0.85em;text-align:center;color:#666;">The noise is unchanged.</div>`
  });
}

export async function showSoundManipulationDialog(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Sound Manipulation requires an actor.");
    return;
  }
  const num = rankNumber(item);
  return showFaseripButtonDialog({
    title: `${item.name}: ${actor.name}`,
    content: `<p>Manipulate existing sound.</p>
      <p style="font-size:0.85em;color:#555;">Sonic attacks on ${actor.name} are reduced by ${num} automatically.</p>`,
    buttons: {
      dampen: { label: `Dampen (−${num} Intensity)`, callback: () => postDampenCard(actor, item) },
      raise:  { label: "Raise one level (FEAT)", callback: () => rollRaise(actor, item) }
    },
    default: "dampen"
  });
}
