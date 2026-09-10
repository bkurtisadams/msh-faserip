// scripts/absorption-migration.js v1.0.1 - 2026-09-09
// v1.0.1: Fixed-bug — the three “-=key” deletions (power-item keys,
//         ongoing.<id> flags, pendingRedirect flag) used the legacy
//         forced-deletion syntax, which this core version logs a
//         compatibility warning for on every match (one per power item,
//         hence the console spam). Switched to
//         { key: new foundry.data.operators.ForcedDeletion() } with a
//         same-shape "-=key"/null fallback if that class isn’t present.
//         Deletion targets are unchanged.
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

// Forced-deletion key/value pair. `parentPath` is everything before the
// final "-=" in the legacy form (e.g. "system", "flags.msh-faserip.ongoing");
// `key` is the retired property name, dots and all, exactly as it was
// glued onto "-=" before. New core: { "parentPath.key": ForcedDeletion }.
// Older core without that class: same "parentPath.-=key": null as before.
function deletionEntry(parentPath, key) {
  const Ctor = foundry?.data?.operators?.ForcedDeletion;
  const path = parentPath ? `${parentPath}.${key}` : key;
  if (Ctor) return { [path]: new Ctor() };
  const legacyPath = parentPath ? `${parentPath}.-=${key}` : `-=${key}`;
  return { [legacyPath]: null };
}

function itemUnsetData(item) {
  const sys = item.system || {};
  let data = {};
  for (const k of RETIRED_ITEM_KEYS) if (k in sys) data = { ...data, ...deletionEntry("system", k) };
  return data;
}

async function migrateActor(actor, counts) {
  const scope = SCOPE();
  const ongoing = actor.getFlag(scope, "ongoing") || {};
  const flagUpdates = {};
  for (const id of Object.keys(ongoing)) {
    if (id.startsWith("absorptionTemp.")) { Object.assign(flagUpdates, deletionEntry(`flags.${scope}.ongoing`, id)); counts.tempRecords++; }
  }
  if (actor.getFlag(scope, "pendingRedirect") !== undefined) { Object.assign(flagUpdates, deletionEntry(`flags.${scope}`, "pendingRedirect")); counts.redirects++; }
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
