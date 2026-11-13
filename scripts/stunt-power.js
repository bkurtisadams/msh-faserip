// scripts/stunt-power.js v1.0.0 - 2026-11-13
// v1.0.0: Stunt powers: power items flagged isStuntPower that carry out a
//         Stunts-tab stunt. Short-sheet context, rank following the parent
//         power plus a shift, and the updateItem sync that keeps
//         system.rank/value current for every reader.
import { shiftRank, RANK_VALUES } from "./rules/rules-reference.js";
import { stuntRow } from "./stunt-ledger.js";

export const SHIFT_CHOICES = [-3, -2, -1, 0, 1, 2, 3];

export function isStuntPower(item) {
  return item?.type === "power" && item?.getFlag?.("msh-faserip", "isStuntPower") === true;
}

export function stuntEntryFor(actor, item, usesItem = () => false) {
  const stunts = actor?.system?.stunts || [];
  const name = String(item?.name || "").toLowerCase();
  let index = stunts.findIndex(s => usesItem(s, item?.name));
  if (index < 0) index = stunts.findIndex(s => String(s?.name || "").toLowerCase() === name);
  return index < 0 ? null : { index, stunt: stunts[index] };
}

export function parentIdFor(actor, item, entry) {
  const own = item?.system?.stuntParentId || "";
  if (own) return own;
  const fromEntry = entry?.stunt?.parentPowerId || "";
  return fromEntry && fromEntry !== item?.id && actor?.items?.get?.(fromEntry) ? fromEntry : "";
}

export function derivedRank(parent, shift) {
  const base = parent?.system?.rank || "Typical";
  const n = Number(shift) || 0;
  if (!n) return { rank: base, value: Number(parent?.system?.value) || RANK_VALUES[base] || 0 };
  const rank = shiftRank(base, n);
  return { rank, value: RANK_VALUES[rank] || 0 };
}

function shiftLabel(n) {
  return n ? `${n > 0 ? "+" : ""}${n}CS` : "";
}

export function stuntPowerContext(item, { usesItem, shiftFor } = {}) {
  const actor = item?.parent?.documentName === "Actor" ? item.parent : null;
  const entry = actor ? stuntEntryFor(actor, item, usesItem) : null;
  const parentId = actor ? parentIdFor(actor, item, entry) : "";
  const parent = parentId ? actor.items.get(parentId) : null;
  const shift = Number(item?.system?.stuntShift) || 0;
  const derived = parent ? derivedRank(parent, shift) : null;
  const row = entry ? stuntRow(actor, entry.stunt, entry.index, shiftFor) : null;
  const parentOptions = actor
    ? actor.items.filter(i => i.type === "power" && i.id !== item.id && !isStuntPower(i))
        .map(p => ({ id: p.id, name: p.name, selected: p.id === parentId }))
    : [];
  return {
    isStuntPower: isStuntPower(item),
    onActor: !!actor,
    actorName: actor?.name || "",
    parentId: parent ? parentId : "",
    parentName: parent?.name || "",
    parentOptions,
    shiftOptions: SHIFT_CHOICES.map(v => ({ value: v, label: v ? shiftLabel(v) : "None", selected: v === shift })),
    shiftLabel: shiftLabel(shift),
    rank: derived?.rank || item?.system?.rank || "",
    value: derived?.value ?? item?.system?.value ?? "",
    statusText: row ? (row.mastered ? `${row.name}: Mastered` : `${row.name}: ${row.statusLabel}, ${row.costLabel}`)
      : (actor ? "No matching Stunts tab entry" : "Not on a character"),
    usedByStunt: !isStuntPower(item) && row ? row.name : "",
    savedParentId: item?.system?.stuntParentId || ""
  };
}

export function rankUpdate(item, parent) {
  if (!parent) return null;
  const d = derivedRank(parent, item?.system?.stuntShift);
  if (item.system?.rank === d.rank && Number(item.system?.value) === d.value) return null;
  return { "system.rank": d.rank, "system.value": d.value };
}

export function registerStuntPowerSync() {
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (userId !== game.user.id || item.type !== "power") return;
    const actor = item.parent;
    if (actor?.documentName !== "Actor") return;
    const has = k => foundry.utils.hasProperty(changes, k);
    const own = isStuntPower(item) && (has("system.stuntParentId") || has("system.stuntShift")
      || has("flags.msh-faserip.isStuntPower"));
    if (own) {
      const parent = item.system?.stuntParentId ? actor.items.get(item.system.stuntParentId) : null;
      const u = rankUpdate(item, parent);
      if (u) await item.update(u);
    }
    if (has("system.rank") || has("system.value")) {
      for (const sp of actor.items.filter(i => isStuntPower(i) && i.system?.stuntParentId === item.id)) {
        const u = rankUpdate(sp, item);
        if (u) await sp.update(u);
      }
    }
  });
}
