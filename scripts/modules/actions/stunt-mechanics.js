// scripts/modules/actions/stunt-mechanics.js v1.1.0 - 2026-09-03
// v1.1.0: Presets for Sound Generation, Air Control, Electrical Manipulation.
//         Adopt-don't-duplicate: a preset first matches an existing tab stunt
//         by presetKey, then by name alias, tagging it and repairing a missing
//         or dangling parentPowerId; adoptPresets() runs from the router.
//         Mechanic kinds: energy-attack / force-attack (optional -CS via the
//         dialogs' deviceAbility ad-hoc mode), intensity-save, use-item,
//         apply-effect, info. Presets flagged `mastered` start at mastery
//         (RULED 2026-09-03: Air Control's starting stunt).
// scripts/modules/actions/stunt-mechanics.js v1.0.0 - 2026-09-03
// Power Stunt presets (book-listed stunts keyed by power flag) and the
// mechanic that runs when a preset stunt succeeds or is mastered. The stunt
// tab (system.stunts) stays the record of attempts; presets only create a
// stunt entry there the first time and attach a `mechanic` to it.

import { POWER_RANGE_VALUES } from "../dice/universal-table.js";
import { POWER_STUNT_MASTERY } from "../../lib/faserip-rules/faserip-karma.js";

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
  ],
  soundGeneration: [
    { key: "sound-wideband", name: "Wide-band Sonic Blast", aliases: ["stun-wave", "stunwave", "wide-band", "wideband"],
      description: "Affects all in a given area at -1CS Power rank damage (Force column).",
      mechanic: { kind: "force-attack", shift: -1, note: "Area attack: target everyone in the area; -1CS damage." } },
    { key: "sound-stun", name: "Sonic Stun", aliases: ["sonic stun", "stunning attack"],
      description: "Stunning attack at -1CS Intensity: target makes an Endurance FEAT or is unconscious 1-10 rounds.",
      mechanic: { kind: "intensity-save", shift: -1, powerName: "Sonic Stun", effectName: "Unconscious", failMessage: "is knocked unconscious", saveAbility: "endurance" } },
    { key: "sound-flight", name: "Sonic Flight", aliases: ["sonic flight"],
      description: "Flight at -2CS (-1CS with glider wings, cape, or similar glide control).",
      mechanic: { kind: "info" } },
    { key: "sound-wall", name: "Sonic Walls", aliases: ["sonic wall"],
      description: "Walls of sound of Power rank -1CS material strength.",
      mechanic: { kind: "info", shift: -1 } },
    { key: "sound-absorb", name: "Sound Absorption", aliases: ["absorb sound", "sound absorption"],
      description: "Absorb sound at -1CS Power rank, reducing other sonic attacks by that amount.",
      mechanic: { kind: "apply-effect", shift: -1, effectName: "Sound Absorption", effectType: "sonicAbsorb" } },
    { key: "sound-illusion", name: "Sonic Holograms", aliases: ["hologram", "sonic illusion"],
      description: "Holographic illusions at -2CS Power rank; semi-real, inflict up to Power rank -3CS damage.",
      mechanic: { kind: "info", shift: -2 } }
  ],
  airControl: [
    { key: "air-flight", name: "Flight (Air Control)", aliases: ["flight"],
      description: "Flight at Power rank speed.", mechanic: { kind: "use-item", itemNames: ["flight"] } },
    { key: "air-tornado", name: "Tornado", aliases: ["tornado"],
      description: "Tornado of Power rank Intensity and damage, controlled by a Power rank FEAT (Force column).",
      mechanic: { kind: "force-attack", note: "Control FEAT = the stunt roll." } },
    { key: "air-storm", name: "Summon Storm", aliases: ["summon storm", "storm"],
      description: "Limited Weather Control: summon a storm.", mechanic: { kind: "use-item", itemNames: ["summon storm"], fallback: "info" } },
    { key: "air-fog", name: "Summon Fog", aliases: ["summon fog", "fog"],
      description: "Limited Weather Control: summon fog.", mechanic: { kind: "info" } },
    { key: "air-lightning", name: "Lightning", aliases: ["lightning bolt", "lightning"],
      description: "Lightning of Power rank range and damage (Energy column).",
      mechanic: { kind: "use-item", itemNames: ["lightning bolt", "lightning"], fallback: "energy-attack" } },
    { key: "air-reduce-weather", name: "Reduce Weather", aliases: ["reduce weather", "calm weather"],
      description: "Reduce existing weather conditions with Power rank ability, per weather type.", mechanic: { kind: "info" } }
  ],
  electricalManipulation: [
    { key: "elec-heal", name: "Electrical Absorption Healing", aliases: ["absorption healing", "electrical healing"],
      description: "Heal damage through absorption of electricity, up to Power rank amount per round.", mechanic: { kind: "info" } },
    { key: "elec-absorb", name: "Absorb Electricity", aliases: ["absorb electric"],
      description: "Absorb electrical damage as if possessing Resistance to Electricity at -2CS.",
      mechanic: { kind: "apply-effect", shift: -2, effectName: "Electrical Absorption", effectType: "electricResist" } },
    { key: "elec-conduct", name: "Conductor", aliases: ["conductor", "conduit"],
      description: "Act as a conductor between a power source and a target, as if possessing Resistance to Electricity at -2CS.",
      mechanic: { kind: "apply-effect", shift: -2, effectName: "Conductor", effectType: "electricResist" } },
    { key: "elec-ride", name: "Ride the Lines", aliases: ["lightning teleport", "ride the lines", "power lines"],
      description: "Move at Power rank speed by riding lines of electrical potential — power lines and building wiring.", mechanic: { kind: "info" } },
    { key: "elec-shock", name: "Shocking Touch", aliases: ["shocking touch", "shock touch"],
      description: "Store energy and deliver a shocking touch of Power rank damage (Energy column, touch).",
      mechanic: { kind: "use-item", itemNames: ["shocking touch"], fallback: "energy-attack", touch: true } }
  ]
};

export function presetsForItem(item) {
  const name = (item?.name || "").toLowerCase();
  const type = (item?.system?.type || "").toLowerCase();
  const is = (s) => name.includes(s) || type.includes(s);
  if (item?.system?.mental?.telepathy === true || is("telepathy")) return STUNT_PRESETS.telepathy;
  if (is("sound generation")) return STUNT_PRESETS.soundGeneration;
  if (is("air control")) return STUNT_PRESETS.airControl;
  if (is("electrical manipulation")) return STUNT_PRESETS.electricalManipulation;
  return [];
}

function matchesAlias(stunt, preset) {
  const n = (stunt?.name || "").toLowerCase();
  if (!n) return false;
  if (n === preset.name.toLowerCase()) return true;
  return (preset.aliases || []).some(a => n.includes(a));
}

// Tag every existing tab stunt that matches a preset for this power
// (presetKey, mechanic, parentPowerId). Never creates entries.
export async function adoptPresets(actor, item) {
  const presets = presetsForItem(item);
  if (!presets.length || !actor?.system?.stunts?.length) return;
  const stunts = foundry.utils.deepClone(actor.system.stunts);
  let changed = false;
  for (const s of stunts) {
    if (s.presetKey) continue;
    const preset = presets.find(p => matchesAlias(s, p));
    if (!preset) continue;
    const parentOk = s.parentPowerId && actor.items.get(s.parentPowerId);
    s.presetKey = preset.key;
    s.mechanic = preset.mechanic;
    if (!parentOk) { s.parentPowerId = item.id; s.parentPower = item.name; }
    changed = true;
  }
  if (changed) await actor.update({ "system.stunts": stunts });
}

// Find (or create) the stunt-tab entry for a preset on this actor/power.
export async function ensureStuntForPreset(actor, item, preset) {
  const stunts = foundry.utils.deepClone(actor.system.stunts || []);
  let idx = stunts.findIndex(s => s.presetKey === preset.key && (!s.parentPowerId || s.parentPowerId === item.id));
  if (idx < 0) idx = stunts.findIndex(s => !s.presetKey && matchesAlias(s, preset));
  if (idx < 0) {
    stunts.push({
      name: preset.name,
      description: preset.description,
      rank: item.system.rank || "Typical",
      value: item.system.value ?? 0,
      parentPowerId: item.id,
      parentPower: item.name,
      timesUsed: preset.mastered ? POWER_STUNT_MASTERY : 0,
      presetKey: preset.key,
      mechanic: preset.mechanic
    });
    idx = stunts.length - 1;
    await actor.update({ "system.stunts": stunts });
  } else {
    const s = stunts[idx];
    const parentOk = s.parentPowerId && actor.items.get(s.parentPowerId);
    let changed = false;
    if (s.presetKey !== preset.key) { s.presetKey = preset.key; changed = true; }
    if (!s.mechanic) { s.mechanic = preset.mechanic; changed = true; }
    if (!parentOk) { s.parentPowerId = item.id; s.parentPower = item.name; changed = true; }
    if (changed) await actor.update({ "system.stunts": stunts });
  }
  return idx;
}

// Run the mechanic attached to a stunt (after a successful roll or when mastered).
export async function runStuntMechanic(actor, stunt) {
  const m = stunt?.mechanic;
  if (!m) return;
  const item = stunt.parentPowerId ? actor.items.get(stunt.parentPowerId) : null;
  const { ActionDispatcher } = await import("./action-dispatcher.js");
  const { shiftRank, rankValue } = await import("./action-utils.js");
  const baseRank = item?.system?.rank || stunt.rank || "Typical";
  const rank = m.shift ? shiftRank(baseRank, m.shift) : baseRank;
  const shiftLabel = m.shift ? ` (${baseRank} ${m.shift > 0 ? "+" : ""}${m.shift}CS = ${rank})` : ` (${rank})`;

  // Attack columns: a shifted stunt rides the dialog's ad-hoc (deviceAbility) mode so the
  // attack uses the stunt's rank and damage without editing the power item.
  const attack = (column, ability) => {
    if (!item) return ui.notifications.warn(`${stunt.name}: parent power not found.`);
    const opts = { itemId: item.id, item, stuntName: stunt.name };
    if (m.shift) opts.deviceAbility = { name: stunt.name, rank };
    if (m.damageType) opts.damageType = m.damageType;
    if (m.note) ui.notifications.info(`${stunt.name}: ${m.note}`);
    return ActionDispatcher.roll(column, { actor, abilityName: ability, opts });
  };

  if (m.kind === "energy-attack") return attack("energy", "agility");
  if (m.kind === "force-attack")  return attack("force", "agility");

  if (m.kind === "mental-power" || m.kind === "intensity-save") {
    if (!item) return ui.notifications.warn(`${stunt.name}: parent power not found.`);
    return ActionDispatcher.roll("mental-power", { actor, opts: { itemId: item.id, item, stuntPreset: { ...m, name: stunt.name } } });
  }

  if (m.kind === "mind-link") return applyMindLink(actor, item, stunt);

  if (m.kind === "use-item") {
    const names = (m.itemNames || []).map(n => n.toLowerCase());
    const target = actor.items.find(i => i.type === "power" && names.some(n => (i.name || "").toLowerCase() === n))
      || actor.items.find(i => i.type === "power" && names.some(n => (i.name || "").toLowerCase().includes(n)));
    if (target) {
      const { rollPower } = await import("./power-router.js");
      return rollPower(actor, target);
    }
    if (m.fallback === "energy-attack") return attack("energy", "agility");
    if (m.fallback === "force-attack")  return attack("force", "agility");
    return postInfoCard(actor, stunt, rank, shiftLabel);
  }

  if (m.kind === "apply-effect") {
    const { applyEffect } = await import("../effects/effect-engine.js");
    await applyEffect(actor, {
      name: `${m.effectName || stunt.name} (${rank})`,
      img: "icons/svg/aura.svg",
      rounds: m.rounds ?? null,
      originUuid: item?.uuid || actor.uuid,
      flags: { "msh-faserip": { effectType: m.effectType || "stuntEffect", stuntKey: stunt.presetKey || "", rank, value: rankValue(rank) } }
    });
    return postInfoCard(actor, stunt, rank, shiftLabel, `${m.effectName || stunt.name} active at ${rank} (${rankValue(rank)}). Remove the effect to end it.`);
  }

  if (m.kind === "info") return postInfoCard(actor, stunt, rank, shiftLabel);
}

async function postInfoCard(actor, stunt, rank, shiftLabel, extra = "") {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="border:2px solid #6a1b9a;border-radius:6px;overflow:hidden;">
      <div style="background:#6a1b9a;color:#fff;padding:6px 10px;font-weight:700;font-size:13px;">${stunt.name} — ${actor.name}${shiftLabel}</div>
      <div style="padding:6px 10px;font-size:.9em;">${stunt.description || ""}${extra ? `<div style="margin-top:4px;color:#4527a0;font-weight:600;">${extra}</div>` : ""}</div>
    </div>`
  });
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
