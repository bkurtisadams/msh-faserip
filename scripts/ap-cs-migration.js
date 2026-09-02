// scripts/ap-cs-migration.js v1.0.0 - 2026-09-02
// RULED 2026-09-02: armor piercing is always column shifts. Document walker
// for dataMigrationVersion 2 (init.js ready hook): every equipment item with
// a legacy flat armorPiercing value and no armorPiercingCS gets
// armorPiercingCS = armorPiercing, armorPiercing = 0, apMode = "cs". Covers
// world items, actor-embedded items, and unlinked token actors on every
// scene. Compendia are not touched; call migrateApCsItems(pack.getDocuments())
// on an unlocked pack from the console if needed.

function apCsUpdateFor(item) {
  if (item?.type !== "equipment") return null;
  const s = item.system || {};
  const flat = Number(s.armorPiercing) || 0;
  const cs = Number(s.armorPiercingCS) || 0;
  const update = {};
  if (flat > 0 && cs === 0) update["system.armorPiercingCS"] = flat;
  if (flat !== 0) update["system.armorPiercing"] = 0;
  if (s.apMode !== "cs") update["system.apMode"] = "cs";
  return Object.keys(update).length ? { _id: item.id, ...update } : null;
}

export async function migrateApCsItems(items, label = "items") {
  const list = Array.from(items);
  const updates = list.map(apCsUpdateFor).filter(Boolean);
  if (!updates.length) return 0;
  const parent = list[0]?.parent ?? null;
  if (parent) await parent.updateEmbeddedDocuments("Item", updates);
  else await Item.updateDocuments(updates);
  console.log(`[FASERIP] AP-CS migration | ${label}: ${updates.length} item(s)`);
  return updates.length;
}

export async function migrateApCsDocuments() {
  let n = 0;
  n += await migrateApCsItems(game.items, "world items");
  for (const actor of game.actors) n += await migrateApCsItems(actor.items, actor.name);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      n += await migrateApCsItems(token.actor.items, `${scene.name} / ${token.name}`);
    }
  }
  return n;
}
