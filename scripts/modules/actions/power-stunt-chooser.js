// scripts/modules/actions/power-stunt-chooser.js v1.0.0 - 2026-11-13
// v1.0.0: Shown when a power with stunts is used (power-router.rollPower).
//         Lists the base power, the power's stunts (system.powerStunts) with
//         their Stunts tab progress, and book stunts not yet developed
//         (greyed). A stunt goes through the Stunts tab roll (Karma, FEAT,
//         progress); a mastered stunt fires directly. Picking a book stunt
//         adds it to the power and makes its first attempt.

import { showFaseripButtonDialog } from "./dialog-shim.js";
import { shiftRank } from "./action-utils.js";
import { POWER_STUNT_MASTERY } from "../../lib/faserip-rules/faserip-karma.js";
import {
  getPowerStunts, undevelopedPresets, powerStuntFromPreset, stuntEntryIndex,
  ensureStuntEntryForPowerStunt, STUNT_ATTACK_COLUMNS
} from "./stunt-mechanics.js";

const EFFECT_LABELS = {
  stunned: "Stunned", unconscious: "Unconscious", blinded: "Blinded", deafened: "Deafened",
  paralyzed: "Paralyzed", immobilized: "Immobilized", nullified: "Nullified", weakened: "Weakened"
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function describeStuntMechanic(m) {
  if (!m) return "";
  const cs = Number(m.shift) || 0;
  const csTxt = cs ? ` at ${cs > 0 ? "+" : ""}${cs}CS` : "";
  if (m.kind === "attack") return `${STUNT_ATTACK_COLUMNS[m.column]?.label || "Force"} attack${csTxt}`;
  if (m.kind === "energy-attack") return `Energy attack${csTxt}`;
  if (m.kind === "force-attack") return `Force attack${csTxt}`;
  if (m.kind === "save" || m.kind === "intensity-save" || m.kind === "mental-power") {
    const ab = m.saveAbility || "endurance";
    const eff = EFFECT_LABELS[m.effect] || m.effectName || "affected";
    const multi = Number(m.multiTargetCS) ? `; several targets ${m.multiTargetCS}CS` : "";
    return `${ab.charAt(0).toUpperCase() + ab.slice(1)} FEAT or ${eff}${csTxt}${multi}`;
  }
  if (m.kind === "info") return `Judge resolves${csTxt}`;
  return `Book effect${csTxt}`;
}

function statusFor(actor, item, def) {
  const idx = stuntEntryIndex(actor, item, def);
  if (idx < 0) return "not attempted";
  const used = Number(actor.system.stunts[idx].timesUsed) || 0;
  return used >= POWER_STUNT_MASTERY ? "mastered" : `${used}/${POWER_STUNT_MASTERY}`;
}

export async function showPowerStuntChooser(actor, item, runBase) {
  const baseRank = item.system?.rank || "Typical";
  const defs = getPowerStunts(item);
  const book = undevelopedPresets(item);

  const row = (value, title, sub, checked = false, grey = false) => `
    <label style="display:flex;gap:8px;align-items:flex-start;padding:4px 6px;border-bottom:1px solid #ddd;${grey ? "opacity:.55;" : ""}">
      <input type="radio" name="ps-choice" value="${value}" ${checked ? "checked" : ""} style="margin-top:3px;">
      <span><strong>${title}</strong><br><span style="font-size:.85em;color:#555;">${sub}</span></span>
    </label>`;

  const rows = [row("base", esc(item.name), `Power rank ${esc(baseRank)}`, true)];
  for (const d of defs) {
    const rank = shiftRank(baseRank, Number(d.mechanic?.shift) || 0);
    rows.push(row(`ps:${d.id}`, esc(d.name),
      `${esc(describeStuntMechanic(d.mechanic))} (${esc(rank)}) — ${esc(statusFor(actor, item, d))}`));
  }
  for (const p of book) {
    rows.push(row(`bk:${p.key}`, esc(p.name),
      `Not developed — first attempt costs 100 Karma. ${esc(describeStuntMechanic(p.mechanic))}`, false, true));
  }

  const choice = await new Promise(resolve => {
    showFaseripButtonDialog({
      title: `${item.name} — Power or Stunt`,
      width: 440,
      content: `<div style="max-height:420px;overflow-y:auto;">${rows.join("")}</div>`,
      buttons: {
        use: { icon: '<i class="fas fa-bolt"></i>', label: "Use",
          callback: (html) => resolve(html.find('input[name="ps-choice"]:checked').val() || "base") },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
      },
      default: "use",
      close: () => resolve(null)
    });
  });
  if (!choice) return;
  if (choice === "base") return runBase();

  let def = null;
  if (choice.startsWith("ps:")) {
    def = defs.find(d => d.id === choice.slice(3));
  } else if (choice.startsWith("bk:")) {
    const preset = book.find(p => p.key === choice.slice(3));
    if (!preset) return;
    def = powerStuntFromPreset(preset);
    await item.update({ "system.powerStunts": [...defs, def] });
  }
  if (!def) return;

  const idx = await ensureStuntEntryForPowerStunt(actor, item, def);
  const { StuntRoller } = await import("../../stunts.js");
  return new StuntRoller(actor).rollStunt(idx);
}
