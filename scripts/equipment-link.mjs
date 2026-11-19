// equipment-link.mjs v1.0.0 - 2026-11-19
// v1.0.0: Powers granted by equipment. A power whose Source is Equipment
//         stores the granting item's id (system.equipmentId) and name
//         (system.equipmentName). While that item is broken or no longer on
//         the character the power can't be used and its effects are
//         suppressed (FaseripActiveEffect.isSuppressed).

const CATEGORY_LABEL = {
  weapon: "Weapon", other: "Weapon", armor: "Armor", gear: "Gear", device: "Device",
  "power-item": "Power Item", custom: "Custom"
};

export function equipmentCategoryLabel(item) {
  return CATEGORY_LABEL[item?.system?.category] || "Equipment";
}

/** Gear state for a power: { linked, status: "ok"|"broken"|"missing", name, item }.
 *  linked is false when the power isn't from equipment or isn't tied to an item. */
export function powerGearState(power) {
  const sys = power?.system || {};
  const id = sys.equipmentId || "";
  if (power?.type !== "power" || sys.source !== "equipment" || !id) return { linked: false, status: "ok" };
  const actor = power.actor;
  const item = actor?.items?.get?.(id) || null;
  const name = item?.name || sys.equipmentName || "The linked item";
  if (!actor) return { linked: true, status: "ok", name, item: null };
  if (!item) return { linked: true, status: "missing", name, item: null };
  if (item.system?.broken === true) return { linked: true, status: "broken", name, item };
  return { linked: true, status: "ok", name, item };
}

/** Sentence for a power that can't be used, or "" when it can. */
export function gearBlockMessage(power) {
  const g = powerGearState(power);
  if (g.status === "broken") return `${power.name} comes from the ${g.name}, which is broken. Repair it to use this power.`;
  if (g.status === "missing") return `${power.name} comes from the ${g.name}, which is no longer on this character.`;
  return "";
}

/** The character's powers linked to an equipment item. */
export function powersFromEquipment(equipment) {
  const actor = equipment?.actor;
  if (!actor) return [];
  return actor.items.filter(i => i.type === "power" && i.system?.source === "equipment" && i.system?.equipmentId === equipment.id);
}

/** Edit Power sheet: the From equipment dropdown and its status line. */
export function buildEquipmentLinkView(power) {
  const sys = power.system || {};
  const show = sys.source === "equipment";
  const actor = power.actor;
  const g = powerGearState(power);
  const options = actor
    ? actor.items.filter(i => i.type === "equipment").sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ id: i.id, label: `${i.name} (${equipmentCategoryLabel(i)})`, selected: i.id === sys.equipmentId }))
    : [];
  if (g.status === "missing") options.unshift({ id: sys.equipmentId, label: `${g.name} (missing)`, selected: true });
  return {
    show, hasActor: !!actor, options,
    linked: g.linked, status: g.status, name: g.name,
    ok: g.linked && g.status === "ok", broken: g.status === "broken", missing: g.status === "missing"
  };
}

/** Equipment sheet: Granted Powers rows and the Link dropdown. */
export function buildGrantedPowersView(equipment) {
  const actor = equipment.actor;
  if (!actor) return { hasActor: false, rows: [], candidates: [] };
  const off = equipment.system?.broken === true;
  const rows = powersFromEquipment(equipment).map(p => ({
    id: p.id, name: p.name, rank: `${p.system?.rank || ""}${Number(p.system?.value) ? ` (${p.system.value})` : ""}`, off
  }));
  const linkedIds = new Set(rows.map(r => r.id));
  const candidates = actor.items
    .filter(i => i.type === "power" && !linkedIds.has(i.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ id: p.id, label: `${p.name} (${p.system?.rank || "no rank"})` }));
  const offCount = off ? rows.length : 0;
  const offText = offCount ? `${offCount} granted power${offCount > 1 ? "s are" : " is"} off: ${rows.map(r => r.name).join(", ")}` : "";
  return { hasActor: true, rows, candidates, off, offCount, offText };
}

export async function linkPowerToEquipment(power, equipment) {
  await power.update({
    "system.source": "equipment", "system.grantedByEquipment": true,
    "system.equipmentId": equipment.id, "system.equipmentName": equipment.name
  });
}

export async function unlinkPower(power) {
  await power.update({ "system.equipmentId": "", "system.equipmentName": "" });
}

/** Re-prepare the character when equipment breaks, is repaired, arrives or
 *  leaves, so suppression and the sheets follow. */
export function registerEquipmentLinkHooks() {
  const refresh = (item) => {
    const actor = item?.parent;
    if (item?.type !== "equipment" || actor?.documentName !== "Actor") return;
    if (!actor.items.some(i => i.type === "power" && i.system?.equipmentId === item.id)) return;
    actor.reset();
    actor.sheet?.rendered && actor.sheet.render(false);
    for (const p of powersFromEquipment(item)) if (p.sheet?.rendered) p.sheet.render(false);
  };
  Hooks.on("updateItem", (item, changes) => {
    if (foundry.utils.hasProperty(changes, "system.broken") || "name" in changes) refresh(item);
  });
  Hooks.on("createItem", refresh);
  Hooks.on("deleteItem", (item) => {
    const actor = item?.parent;
    if (item?.type !== "equipment" || actor?.documentName !== "Actor") return;
    actor.reset();
    actor.sheet?.rendered && actor.sheet.render(false);
    for (const p of actor.items.filter(i => i.type === "power" && i.system?.equipmentId === item.id)) if (p.sheet?.rendered) p.sheet.render(false);
  });
}

/** One-time: the old equipment "granted powers" list (name and rank only)
 *  becomes real power items linked to the equipment. GM only. */
export async function migrateGrantedPowerLists() {
  if (!game.user?.isGM) return 0;
  let made = 0;
  const actors = [...game.actors, ...game.scenes.flatMap(s => s.tokens.filter(t => !t.actorLink && t.actor).map(t => t.actor))];
  for (const actor of actors) {
    for (const eq of actor.items.filter(i => i.type === "equipment" && Array.isArray(i.system?.powers) && i.system.powers.length)) {
      const docs = eq.system.powers.filter(p => p?.name).map(p => ({
        name: p.name, type: "power",
        system: {
          rank: p.rank || "Typical", value: Number(p.value) || 0, damageType: p.damageType || "",
          source: "equipment", grantedByEquipment: true, equipmentId: eq.id, equipmentName: eq.name, isActive: true
        }
      }));
      if (docs.length) await actor.createEmbeddedDocuments("Item", docs);
      await eq.update({ "system.powers": [] });
      made += docs.length;
    }
  }
  return made;
}
