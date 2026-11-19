// scripts/modules/actions/control-power-action.js v1.0.0 - 2026-11-19
// Control powers that begin without a distance attack (Advanced Set Appendix A).
//   Fire Control: intensify existing fire up to Power rank Intensity, reduce
//     it by the rank number (reducing fire damage by that much), or a fiery
//     shield that inflicts rank-number damage on anyone crossing it.
//   Electrical Manipulation: begins as resistance to electrical attacks at
//     Power rank (applied by the defense pipeline); all else is Power stunts.
// Their attacks (flame missile, etc.) are Power stunts, built as stunt powers.

import { showFaseripButtonDialog } from "./dialog-shim.js";

function rankInfo(item) {
  const sys = item.system || {};
  const num = Number(sys.value) || game.msh?.getRankValue?.(sys.rank) || 0;
  return { rank: sys.rank || "Typical", num };
}

function postCard(actor, item, title, body) {
  const { rank, num } = rankInfo(item);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
          <strong>${item.name}: ${title}</strong><br>
          <span style="font-size:0.85em;font-weight:400;">${rank} (${num})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">${body}</div>
      </div>`
  });
}

export async function showFireControlDialog(actor, item) {
  const { rank, num } = rankInfo(item);
  return showFaseripButtonDialog({
    title: `${item.name}: ${actor.name}`,
    content: `<p>Control existing fire. Fire Control cannot affect targets at a distance; a flame missile is a Power stunt.</p>`,
    buttons: {
      intensify: {
        label: "Intensify fire",
        callback: () => postCard(actor, item, "Intensify", `An existing fire is intensified, up to <strong>${rank}</strong> Intensity.`)
      },
      reduce: {
        label: `Reduce fire (−${num})`,
        callback: () => postCard(actor, item, "Reduce", `An existing fire's Intensity drops by <strong>${num}</strong>, and its fire damage is reduced by ${num}.`)
      },
      shield: {
        label: "Fire shield",
        callback: () => postCard(actor, item, "Fire shield", `A shield of flame surrounds the hero. Anyone crossing it takes <strong>${num}</strong> points of fire damage.`)
      }
    },
    default: "intensify"
  });
}

export async function postElectricalManipulationCard(actor, item) {
  const { num } = rankInfo(item);
  return postCard(actor, item, "Resistance",
    `Electrical attacks on ${actor.name} are reduced by <strong>${num}</strong> (applied automatically). Other uses of the power are Power stunts.`);
}
