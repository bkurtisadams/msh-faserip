// clear-magic-school.js — Slice K migration. Idempotent.
//
// Slice K dropped the non-canonical magic.school field (no FASERIP rules
// basis, zero runtime consumers). This deletes the orphaned key from any
// power that still carries it. Re-running is a no-op once cleared.

const pack = game.packs.get("msh-faserip.powers");
if (!pack) { ui.notifications.error("msh-faserip.powers pack not found"); }
else {
  const docs = await pack.getDocuments();
  const updates = docs
    .filter(d => d.system?.magic && Object.prototype.hasOwnProperty.call(d.system.magic, "school"))
    .map(d => ({ _id: d.id, "system.magic.-=school": null }));
  if (updates.length) {
    await Item.updateDocuments(updates, { pack: pack.collection });
    ui.notifications.info(`Removed magic.school from ${updates.length} power(s).`);
  } else {
    ui.notifications.info("No magic.school keys found — nothing to clear.");
  }
  console.log("clear-magic-school: updated", updates.map(u => u._id));
}
