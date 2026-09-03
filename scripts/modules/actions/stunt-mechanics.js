// scripts/modules/actions/stunt-mechanics.js v1.0.0 - 2026-09-03
// Power Stunt presets (book-listed stunts keyed by power flag) and the
// mechanic that runs when a preset stunt succeeds or is mastered. The stunt
// tab (system.stunts) stays the record of attempts; presets only create a
// stunt entry there the first time and attach a `mechanic` to it.

import { POWER_RANGE_VALUES } from "../dice/universal-table.js";

export const STUNT_PRESETS = {
  telepathy: [
    {
      key: "telepathy-bolt",
      name: "Telepathic Push (Mental Bolt)",
      description: "Telepathic \"push\" as a bolt of mental force: Power rank range and damage, Energy attack column.",
      mechanic: { kind: "energy-attack", damageType: "mental" }
    },
    {
      key: "telepathy-link",
      name: "Mind Link (Team)",
      description: "Links the minds of a team sharing a Karma pool at half Power range: all are aware of each other's actions, non-verbal orders pass, and all use the telepath's Intuition.",
      mechanic: { kind: "mind-link" }
    },
    {
      key: "telepathy-probe",
      name: "Mental Probe (-2CS)",
      description: "Mental probe at -2CS Power rank.",
      mechanic: { kind: "mental-power", shift: -2, powerName: "Mental Probe", effectName: "Mentally Fatigued", failMessage: "suffers mental strain", saveAbility: "psyche" }
    }
  ]
};

export function presetsForItem(item) {
  const name = (item?.name || "").toLowerCase();
  if (item?.system?.mental?.telepathy === true || name.includes("telepathy")) return STUNT_PRESETS.telepathy;
  return [];
}

// Find (or create) the stunt-tab entry for a preset on this actor/power.
export async function ensureStuntForPreset(actor, item, preset) {
  const stunts = foundry.utils.deepClone(actor.system.stunts || []);
  let idx = stunts.findIndex(s => s.presetKey === preset.key && (!s.parentPowerId || s.parentPowerId === item.id));
  if (idx < 0) {
    stunts.push({
      name: preset.name,
      description: preset.description,
      rank: item.system.rank || "Typical",
      value: item.system.value ?? 0,
      parentPowerId: item.id,
      parentPower: item.name,
      timesUsed: 0,
      presetKey: preset.key,
      mechanic: preset.mechanic
    });
    idx = stunts.length - 1;
    await actor.update({ "system.stunts": stunts });
  } else if (!stunts[idx].mechanic) {
    stunts[idx].mechanic = preset.mechanic;
    await actor.update({ "system.stunts": stunts });
  }
  return idx;
}

// Run the mechanic attached to a stunt (after a successful roll or when mastered).
export async function runStuntMechanic(actor, stunt) {
  const m = stunt?.mechanic;
  if (!m) return;
  const item = stunt.parentPowerId ? actor.items.get(stunt.parentPowerId) : null;
  const { ActionDispatcher } = await import("./action-dispatcher.js");

  if (m.kind === "energy-attack") {
    if (!item) return ui.notifications.warn(`${stunt.name}: parent power not found.`);
    return ActionDispatcher.roll("energy", { actor, abilityName: "agility", opts: { itemId: item.id, item, damageType: m.damageType || "energy", stuntName: stunt.name } });
  }

  if (m.kind === "mental-power") {
    if (!item) return ui.notifications.warn(`${stunt.name}: parent power not found.`);
    return ActionDispatcher.roll("mental-power", { actor, opts: { itemId: item.id, item, stuntPreset: { ...m, name: stunt.name } } });
  }

  if (m.kind === "mind-link") {
    return applyMindLink(actor, item, stunt);
  }
}

// Mind Link: every targeted token within half Power range gets an effect
// that overrides Intuition to the telepath's rank/value until dismissed.
async function applyMindLink(actor, item, stunt) {
  const { applyEffect } = await import("../effects/effect-engine.js");
  const { measureAreasBetweenTokens } = await import("./action-utils.js");
  const powerRank = item?.system?.rank || stunt.rank || "Typical";
  const fullRange = POWER_RANGE_VALUES[powerRank] ?? null;
  const maxRange = fullRange !== null ? Math.max(1, Math.floor(fullRange / 2)) : null;
  const intuition = actor.system?.abilities?.intuition || {};
  const srcToken = actor.getActiveTokens()?.[0] || null;
  const targets = Array.from(game.user?.targets ?? []).filter(t => t.actor && t.actor.id !== actor.id);
  if (!targets.length) {
    ui.notifications.warn("Mind Link: target the team members to link (they must share a Karma pool with the telepath).");
    return;
  }
  const rows = [];
  for (const t of targets) {
    const dist = (srcToken && t) ? measureAreasBetweenTokens(srcToken, t) : null;
    const inRange = dist === null || maxRange === null || dist <= maxRange;
    if (!inRange) { rows.push({ name: t.name, ok: false, note: `${dist} areas (max ${maxRange})` }); continue; }
    await applyEffect(t.actor, {
      name: `Mind Link (${actor.name})`,
      img: "icons/svg/eye.svg",
      rounds: null,
      originUuid: item?.uuid || actor.uuid,
      changes: [
        { key: "system.abilities.intuition.rank",  mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(intuition.rank || "Typical") },
        { key: "system.abilities.intuition.value", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(intuition.value ?? 6) }
      ],
      flags: { "msh-faserip": { effectType: "mindLink", telepathUuid: actor.uuid, intuitionRank: intuition.rank, intuitionValue: intuition.value } }
    });
    rows.push({ name: t.name, ok: true, note: dist === null ? "" : `${dist} area${dist === 1 ? "" : "s"}` });
  }
  const list = rows.map(r => `<div style="display:flex;justify-content:space-between;font-size:.9em;"><span>${r.name}</span><span style="color:${r.ok ? "#2e7d32" : "#b71c1c"};font-weight:600;">${r.ok ? "Linked" : "Out of range"}${r.note ? ` <span style="font-weight:400;color:#666;">${r.note}</span>` : ""}</span></div>`).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="border:2px solid #6a1b9a;border-radius:6px;overflow:hidden;">
      <div style="background:#6a1b9a;color:#fff;padding:6px 10px;font-weight:700;font-size:13px;">Mind Link — ${actor.name} (${powerRank}, range ${maxRange ?? "?"} areas)</div>
      <div style="padding:6px 10px;">${list}
        <div style="margin-top:6px;font-size:11px;color:#666;">Linked members act with ${actor.name}'s Intuition (${intuition.rank || "?"} ${intuition.value ?? ""}), share awareness of each other's actions, and may receive non-verbal orders. Remove the effect to end the link.</div>
      </div>
    </div>`
  });
}
