// scripts/absorption-migration.js v1.0.0 - 2026-09-09
// One-shot world migration for RAW Absorption (dataMigrationVersion 3):
//   - removes the never-executed absorptionTemp.* ongoing records and their
//     AEs (mitigation v3.1.x temp-HP model)
//   - unsets the unread pendingRedirect actor flag
//   - drops absorptionConvertsToHealth / absorptionCanRedirect from every
//     power item (world items, actor items, unlinked token actors)
// Health values are left alone: a temp-HP overflow that never decayed is a
// number the Judge can see and correct; a script cannot tell it from real
// Health.
//
// Wire in init.js's ready-hook migration block after the AP-CS step:
//   if (dataMigrationVersion < 3) { await migrateAbsorption(); await game.settings.set(SYSTEM_ID, "dataMigrationVersion", 3); }

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");
const RETIRED_ITEM_KEYS = ["absorptionConvertsToHealth", "absorptionCanRedirect"];

function itemUnsetData(item) {
  const sys = item.system || {};
  const data = {};
  for (const k of RETIRED_ITEM_KEYS) if (k in sys) data[`system.-=${k}`] = null;
  return data;
}

async function migrateActor(actor, counts) {
  const scope = SCOPE();
  const ongoing = actor.getFlag(scope, "ongoing") || {};
  const flagUpdates = {};
  for (const id of Object.keys(ongoing)) {
    if (id.startsWith("absorptionTemp.")) { flagUpdates[`flags.${scope}.ongoing.-=${id}`] = null; counts.tempRecords++; }
  }
  if (actor.getFlag(scope, "pendingRedirect") !== undefined) { flagUpdates[`flags.${scope}.-=pendingRedirect`] = null; counts.redirects++; }
  if (Object.keys(flagUpdates).length) await actor.update(flagUpdates);

  const aeIds = actor.effects
    .filter(e => String(e.flags?.[scope]?.ongoingId || "").startsWith("absorptionTemp.") || e.statuses?.has?.("absorption-temp"))
    .map(e => e.id);
  if (aeIds.length) { await actor.deleteEmbeddedDocuments("ActiveEffect", aeIds, { mshIntentional: true }); counts.tempEffects += aeIds.length; }

  const itemUpdates = [];
  for (const item of actor.items) {
    if (item.type !== "power") continue;
    const d = itemUnsetData(item);
    if (Object.keys(d).length) itemUpdates.push({ _id: item.id, ...d });
  }
  if (itemUpdates.length) { await actor.updateEmbeddedDocuments("Item", itemUpdates); counts.items += itemUpdates.length; }
}

export async function migrateAbsorption() {
  const counts = { actors: 0, tempRecords: 0, tempEffects: 0, redirects: 0, items: 0 };
  for (const actor of game.actors) { await migrateActor(actor, counts); counts.actors++; }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      await migrateActor(token.actor, counts); counts.actors++;
    }
  }
  for (const item of game.items) {
    if (item.type !== "power") continue;
    const d = itemUnsetData(item);
    if (Object.keys(d).length) { await item.update(d); counts.items++; }
  }
  console.log(`[FASERIP] Absorption migration: ${counts.actors} actors, ${counts.tempRecords} temp records, ${counts.tempEffects} temp AEs, ${counts.redirects} pendingRedirect flags, ${counts.items} power items cleaned`);
  return counts;
}
